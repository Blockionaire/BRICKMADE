"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Sparkles, Move3D, Layers, CircleHelp } from "lucide-react";
import { studioRequest } from "@/services/studio-client";
import { Sheet } from "./ui";
import { demoAssistant } from "@/services/providers";
import type { AssistantContext, AssistantResponse } from "@/domain/types";

export function Assistant({
  context,
  onClose,
  onAction,
}: {
  context: AssistantContext;
  onClose: () => void;
  onAction: (action: NonNullable<AssistantResponse["action"]>) => void;
}) {
  const cloud = context.cloud;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const [messages, setMessages] = useState<
    {
      id: number;
      sender: "assistant" | "user";
      text: string;
      steps?: number[];
      pieces?: string[];
      action?: AssistantResponse["action"];
    }[]
  >([
    {
      id: 0,
      sender: "assistant",
      text: `Let’s work on step ${context.step.number}: ${context.step.title}. Ask me about the pieces, their placement, or Bag ${context.bag.number}.`,
    },
  ]);
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setError("");
    if (cloud) {
      setBusy(true);
      setMessages((current) => [
        ...current,
        { id: current.length, sender: "user", text: question.trim() },
      ]);
      setInput("");
      controller.current = new AbortController();
      try {
        const response = await studioRequest<{
          answer: string;
          stepNumbers: number[];
          pieceIds: string[];
          action: "none" | "highlight" | "top-view";
        }>(`jobs/${cloud.jobId}/assistant`, {
          method: "POST",
          body: {
            question: question.trim(),
            step: context.step.number,
            pace: cloud.pace,
            sha256: cloud.sha256,
            requestKey: crypto.randomUUID(),
          },
          signal: controller.current.signal,
          timeout: 60000,
        });
        setMessages((current) => [
          ...current,
          {
            id: current.length,
            sender: "assistant",
            text: response.answer,
            steps: response.stepNumbers,
            pieces: response.pieceIds,
            ...(response.action !== "none" ? { action: response.action } : {}),
          },
        ]);
      } catch (e) {
        if (!controller.current.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "The AI assistant could not answer. Your saved instructions remain available.",
          );
      } finally {
        setBusy(false);
      }
      return;
    }
    const response = demoAssistant.answer(question.trim(), context);
    setMessages((current) => [
      ...current,
      { id: current.length, sender: "user", text: question.trim() },
      { id: current.length + 1, sender: "assistant", text: response.text },
    ]);
    setInput("");
    if (response.action) onAction(response.action);
  }
  return (
    <Sheet
      title="A little helping hand"
      onClose={onClose}
      className="assistant-sheet"
    >
      <div className="assistant-context">
        <Sparkles size={16} />
        <span>
          Build Assistant{" "}
          <small>
            {cloud ? "AI · saved design context" : "Demo responses"}
          </small>
        </span>
        <span>
          Step {context.step.number} · Bag {context.bag.number}
        </span>
      </div>
      <div
        className="chat-messages"
        role="log"
        aria-label="Build assistant conversation"
        aria-live="polite"
      >
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.sender}`}>
            {message.sender === "assistant" && (
              <span className="assistant-avatar">
                <Sparkles size={15} />
              </span>
            )}
            <div>
              <p>{message.text}</p>
              {message.steps && (
                <small className="assistant-references">
                  Saved steps {message.steps.join(", ")}
                  {message.pieces?.length
                    ? ` · ${message.pieces.length} cited pieces`
                    : ""}
                </small>
              )}
              {message.action && (
                <button
                  className="text-link"
                  onClick={() => onAction(message.action!)}
                >
                  {message.action === "top-view"
                    ? "See from above"
                    : "Highlight this step"}
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && <p role="status">Checking your saved step…</p>}
        {error && <p role="alert">{error}</p>}
        <div ref={end} />
      </div>
      <div className="chat-quick-actions" aria-busy={busy}>
        <button disabled={busy} onClick={() => ask("Which parts do I need?")}>
          <Layers size={14} /> Which parts?
        </button>
        <button disabled={busy} onClick={() => ask("Show another angle")}>
          <Move3D size={14} /> Another angle
        </button>
        <button disabled={busy} onClick={() => ask("Why doesn’t this fit?")}>
          <CircleHelp size={14} /> Doesn’t fit?
        </button>
        <button disabled={busy} onClick={() => ask("What’s in the next step?")}>
          What’s next?
        </button>
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <label className="visually-hidden" htmlFor="assistant-question">
          Ask about this step
        </label>
        <input
          id="assistant-question"
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this step…"
          autoComplete="off"
        />
        <button
          type="submit"
          aria-label="Send question"
          disabled={!input.trim() || busy}
        >
          <ArrowUp size={20} />
        </button>
      </form>
      <p className="chat-footnote">
        {cloud
          ? "Sending shares your question and these saved steps with OpenAI. AI explanations can be wrong; follow the saved instructions. Physical fit remains untested."
          : "Answers use this demo’s parts and instructions. No external AI calls."}
      </p>
    </Sheet>
  );
}

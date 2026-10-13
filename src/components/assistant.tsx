"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Sparkles, Move3D, Layers, CircleHelp } from "lucide-react";
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
  const [messages, setMessages] = useState<
    { id: number; sender: "assistant" | "user"; text: string }[]
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
  function ask(question: string) {
    if (!question.trim()) return;
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
          Build Assistant <small>Demo responses</small>
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
            <p>{message.text}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="chat-quick-actions">
        <button onClick={() => ask("Which parts do I need?")}>
          <Layers size={14} /> Which parts?
        </button>
        <button onClick={() => ask("Show another angle")}>
          <Move3D size={14} /> Another angle
        </button>
        <button onClick={() => ask("Why doesn’t this fit?")}>
          <CircleHelp size={14} /> Doesn’t fit?
        </button>
        <button onClick={() => ask("What’s in the next step?")}>
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
          disabled={!input.trim()}
        >
          <ArrowUp size={20} />
        </button>
      </form>
      <p className="chat-footnote">
        Answers use this demo’s parts and instructions. No external AI calls.
      </p>
    </Sheet>
  );
}

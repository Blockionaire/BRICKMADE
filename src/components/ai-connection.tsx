"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Link2, LoaderCircle, Unplug } from "lucide-react";
import {
  checkAiConnection,
  clearAiConnection,
  readAiConnection,
  saveAiConnection,
} from "@/services/photo-interpretation";
export function AiConnectionPanel({
  onChange,
}: { onChange?: () => void } = {}) {
  const [endpoint, setEndpoint] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "connected">(
    "idle",
  );
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    queueMicrotask(() => {
      const saved = readAiConnection();
      if (saved) {
        setEndpoint(saved.endpoint);
        setAccessCode(saved.accessCode);
      }
    });
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, []);
  async function connect() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError("");
    setStatus("checking");
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      await checkAiConnection({ endpoint, accessCode }, controller.signal);
      if (controller.signal.aborted) return;
      saveAiConnection({ endpoint, accessCode });
      setStatus("connected");
      onChange?.();
    } catch (e) {
      if (active.current !== controller) return;
      setError(
        controller.signal.aborted
          ? "The connection check timed out. Try again."
          : e instanceof Error
            ? e.message
            : "Could not connect.",
      );
      setStatus("idle");
    } finally {
      clearTimeout(timer);
    }
  }
  return (
    <section className="ai-connection" aria-label="Private AI connection">
      <div className="account-section-heading">
        <Link2 size={20} />
        <h2>Connect photo interpretation</h2>
      </div>
      <p>
        Use your private Vercel service. The OpenAI key stays on the server.
      </p>
      <label className="field-label" htmlFor="ai-endpoint">
        Vercel service address
      </label>
      <input
        id="ai-endpoint"
        className="text-input"
        type="url"
        placeholder="https://your-project.vercel.app"
        value={endpoint}
        onChange={(e) => {
          active.current?.abort();
          active.current = null;
          setError("");
          clearAiConnection();
          onChange?.();
          setEndpoint(e.target.value);
          setStatus("idle");
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <label className="field-label" htmlFor="ai-test-code">
        Private test code
      </label>
      <input
        id="ai-test-code"
        className="text-input"
        type="password"
        placeholder="BRICKMADE_ACCESS_TOKEN from Vercel"
        value={accessCode}
        onChange={(e) => {
          active.current?.abort();
          active.current = null;
          setError("");
          clearAiConnection();
          onChange?.();
          setAccessCode(e.target.value);
          setStatus("idle");
        }}
        autoComplete="off"
        maxLength={256}
      />
      <p className="field-description">
        This is a separate test code, never your OpenAI API key. Connection
        details last only in this browser tab.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="house-inline-actions">
        <button
          className="button button-secondary"
          onClick={connect}
          disabled={status === "checking" || !endpoint || !accessCode}
        >
          {status === "checking" ? (
            <LoaderCircle size={16} className="spin" />
          ) : status === "connected" ? (
            <Check size={16} />
          ) : (
            <Link2 size={16} />
          )}
          {status === "checking"
            ? "Checking connection…"
            : status === "connected"
              ? "Connected"
              : "Check & connect"}
        </button>
        <button
          className="text-link"
          onClick={() => {
            active.current?.abort();
            active.current = null;
            clearAiConnection();
            setAccessCode("");
            setStatus("idle");
            setError("");
            onChange?.();
          }}
        >
          <Unplug size={15} />
          Disconnect
        </button>
      </div>
    </section>
  );
}

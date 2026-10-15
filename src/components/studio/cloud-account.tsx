"use client";
import { useEffect, useRef, useState } from "react";
import { Cloud, Mail, LoaderCircle, CheckCircle2, LogOut } from "lucide-react";
import {
  studioRequest,
  ensureStudioSession,
  resetStudioSession,
} from "@/services/studio-client";
import { projectRepository } from "@/services/project-repository";
export function CloudAccount() {
  const [configured, setConfigured] = useState<boolean | null>(null),
    [identity, setIdentity] = useState<{
      id: string;
      anonymous: boolean;
    } | null>(null),
    [mode, setMode] = useState<"link" | "signin">("link"),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    studioRequest<{ configured: boolean }>("config", { signal: abort.signal })
      .then(async (c) => {
        if (abort.signal.aborted) return;
        setConfigured(c.configured);
        if (c.configured) {
          const s = await ensureStudioSession(abort.signal);
          if (!abort.signal.aborted) setIdentity(s.user);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Cloud identity could not be reached.",
          );
      });
    return () => {
      abort.abort();
      active.current?.abort();
    };
  }, []);
  async function submit(verify: boolean) {
    if (active.current) return;
    const abort = new AbortController();
    active.current = abort;
    setBusy(true);
    setError("");
    try {
      if (verify) {
        const result = await studioRequest<{
          user: { id: string; anonymous: boolean };
        }>("account/verify", {
          method: "POST",
          signal: abort.signal,
          body: { email, code, mode },
        });
        if (abort.signal.aborted) return;
        resetStudioSession();
        if (identity?.id !== result.user.id)
          projectRepository.clearCloudCopies();
        setIdentity(result.user);
        setSent(false);
        setCode("");
        window.dispatchEvent(new Event("brickmade-cloud-identity"));
      } else {
        await ensureStudioSession(abort.signal);
        await studioRequest(`account/${mode === "link" ? "email" : "signin"}`, {
          method: "POST",
          signal: abort.signal,
          body: { email },
        });
        if (!abort.signal.aborted) setSent(true);
      }
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : "The email step could not finish.",
        );
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  async function signout() {
    if (active.current) return;
    const abort = new AbortController();
    active.current = abort;
    setBusy(true);
    setError("");
    try {
      await studioRequest("session", {
        method: "DELETE",
        body: {},
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      resetStudioSession();
      projectRepository.clearCloudCopies();
      window.dispatchEvent(new Event("brickmade-cloud-identity"));
      const s = await ensureStudioSession(abort.signal);
      if (!abort.signal.aborted) setIdentity(s.user);
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Sign out could not finish.");
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <section className="account-section cloud-account">
      <div className="account-section-heading">
        <Cloud size={20} />
        <h2>Your cloud builds</h2>
      </div>
      {configured === false ? (
        <p>
          Cloud saving is being connected for this private release. Existing
          builds on this device remain available.
        </p>
      ) : !identity ? (
        <p role="status">Opening your private session…</p>
      ) : identity.anonymous ? (
        <>
          <p>
            Your designs are saved in a private guest session. Link an email to
            keep this same collection and open it on another device.
          </p>
          <div
            className="studio-variant-buttons"
            role="group"
            aria-label="Cloud account action"
          >
            <button
              aria-pressed={mode === "link"}
              disabled={busy}
              onClick={() => {
                setMode("link");
                setSent(false);
                setError("");
              }}
            >
              Keep my guest builds
            </button>
            <button
              aria-pressed={mode === "signin"}
              disabled={busy}
              onClick={() => {
                setMode("signin");
                setSent(false);
                setError("");
              }}
            >
              Sign in
            </button>
          </div>
          {mode === "signin" && (
            <p className="field-description">
              Sign in opens that account’s collection. Guest builds are not
              automatically merged into a different account.
            </p>
          )}
          <label className="field-label" htmlFor="cloud-email">
            Email address
          </label>
          <input
            id="cloud-email"
            className="text-input"
            type="email"
            autoComplete="email"
            value={email}
            disabled={busy || sent}
            onChange={(e) => setEmail(e.target.value)}
          />
          {sent && (
            <>
              <label className="field-label" htmlFor="cloud-code">
                Code from your email
              </label>
              <input
                id="cloud-code"
                className="text-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
              />
              <p className="field-description">
                Enter the verification code sent to your address.
              </p>
            </>
          )}
          <button
            className="button button-secondary"
            disabled={busy || !email || (sent && code.length < 6)}
            onClick={() => void submit(sent)}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Mail size={17} />
            )}{" "}
            {sent ? "Verify and continue" : "Send my code"}
          </button>
          {sent && (
            <button
              className="text-link"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              Use a different address
            </button>
          )}
        </>
      ) : (
        <div>
          <p className="cloud-account-ready">
            <CheckCircle2 size={18} /> Your account is connected. Its designs
            and building progress are saved privately.
          </p>
          <button
            className="text-link"
            disabled={busy}
            onClick={() => void signout()}
          >
            <LogOut size={16} /> Sign out on this device
          </button>
          <p className="field-description">
            Downloaded cloud copies are cleared on sign-out. Your cloud designs
            and locally created demos stay saved.
          </p>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Blocks,
  Check,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
  TriangleAlert,
  Layers,
} from "lucide-react";
import { PageHeading, ModelStats } from "@/components/ui";
import { ModelViewer } from "@/components/model-viewer";
import type { StudioJob, StudioOptions } from "../../../shared/studio";
import type { StudioArtifact } from "../../../shared/studio-artifact";
import {
  ensureStudioSession,
  studioRequest,
  loadStudioArtifact,
  recordStudioJob,
  StudioClientError,
} from "@/services/studio-client";
import { importStudioBuild } from "@/services/studio-projects";
const LABELS: Record<string, string> = {
  queued: "Your build is in line",
  preparing: "Preparing your photos",
  interpreting: "Finding the character of your house",
  planning: "Planning its shapes and features",
  compiling: "Choosing and placing real pieces",
  checking: "Checking the assembly",
  finalizing: "Preparing your exact instructions",
  completed: "Your little world is ready",
  failed: "This build needs another try",
  cancelled: "Your build was cancelled",
};
const STAGES = [
  { id: "interpreting", label: "Understand your photos" },
  { id: "planning", label: "Plan a recognisable design" },
  { id: "compiling", label: "Build with real pieces" },
  { id: "checking", label: "Check structure and access" },
  { id: "finalizing", label: "Prepare parts and instructions" },
] as const;
export function StudioResult() {
  const params = useSearchParams(),
    router = useRouter(),
    query = params?.get("job") || "";
  const [fallback, setFallback] = useState(""),
    [job, setJob] = useState<StudioJob | null>(null),
    [loaded, setLoaded] = useState<{
      jobId: string;
      artifact: StudioArtifact;
      sha256: string;
    } | null>(null),
    [error, setError] = useState(""),
    [reference, setReference] = useState(""),
    [pollKey, setPollKey] = useState(0),
    [busy, setBusy] = useState("");
  const request = useRef<AbortController | null>(null),
    intent = useRef<{ key: string; id: string } | null>(null),
    notice = useRef<HTMLDivElement>(null),
    failedNotice = useRef<HTMLDivElement>(null);
  const id = query || fallback,
    current = job?.id === id ? job : null,
    result = loaded?.jobId === id ? loaded : null;
  useEffect(() => {
    if (!query) {
      try {
        const last = localStorage.getItem("brickmade.studio.latest.v1");
        if (last) queueMicrotask(() => setFallback(last));
      } catch {}
    }
  }, [query]);
  useEffect(() => {
    if (error) {
      notice.current?.focus({ preventScroll: true });
      notice.current?.scrollIntoView({ block: "center" });
    }
  }, [error]);
  useEffect(() => {
    if (current?.stage === "failed") {
      failedNotice.current?.focus({ preventScroll: true });
      failedNotice.current?.scrollIntoView({ block: "center" });
    }
  }, [current?.stage]);
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        await ensureStudioSession(abort.signal);
        const data = await studioRequest<{ job: StudioJob }>(
          `jobs/${encodeURIComponent(id)}`,
          { signal: abort.signal },
        );
        if (abort.signal.aborted) return;
        setJob(data.job);
        setError("");
        recordStudioJob(data.job);
        if (data.job.stage === "completed") {
          const saved = await loadStudioArtifact(id, abort.signal);
          if (!abort.signal.aborted) setLoaded({ jobId: id, ...saved });
        } else if (!["failed", "cancelled"].includes(data.job.stage))
          timer = setTimeout(poll, 2000);
      } catch (e) {
        if (!abort.signal.aborted) {
          setError(
            e instanceof Error ? e.message : "The build could not be reached.",
          );
          setReference(e instanceof StudioClientError ? e.requestId || "" : "");
        }
      }
    }
    void poll();
    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
    };
  }, [id, pollKey]);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  async function action(
    kind: "cancel" | "retry" | "variant",
    options?: StudioOptions,
  ) {
    if (!current || request.current) return;
    const abort = new AbortController();
    request.current = abort;
    setBusy(kind);
    setError("");
    try {
      if (kind === "cancel") {
        await studioRequest(`jobs/${current.id}/cancel`, {
          method: "POST",
          body: {},
          signal: abort.signal,
        });
        setPollKey((k) => k + 1);
      } else {
        const opts = options || current.options,
          key = JSON.stringify({ kind, id: current.id, opts });
        if (intent.current?.key !== key)
          intent.current = { key, id: crypto.randomUUID() };
        const next = await studioRequest<{ job: StudioJob }>(
          kind === "retry"
            ? `jobs/${current.id}/retry`
            : `projects/${current.projectId}/variants`,
          {
            method: "POST",
            signal: abort.signal,
            body: {
              ...(kind === "variant" ? { parentId: current.id } : {}),
              options: opts,
              requestKey: intent.current!.id,
            },
          },
        );
        recordStudioJob(next.job);
        router.push(`/design?job=${next.job.id}`);
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(
          e instanceof Error ? e.message : "This action could not finish.",
        );
        setReference(e instanceof StudioClientError ? e.requestId || "" : "");
      }
    } finally {
      if (request.current === abort) {
        request.current = null;
        setBusy("");
      }
    }
  }
  async function openBuilder() {
    if (!result || request.current) return;
    const abort = new AbortController();
    request.current = abort;
    setBusy("builder");
    try {
      await importStudioBuild(result.artifact, result.sha256, abort.signal);
      if (!abort.signal.aborted) router.push("/builder");
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : "The builder could not open.",
        );
    } finally {
      if (request.current === abort) {
        request.current = null;
        setBusy("");
      }
    }
  }
  if (!id)
    return (
      <div id="page-content" className="studio-page">
        <PageHeading
          eyebrow="Your next little world"
          title="Start with something you love."
          description="Choose a category and add your photos to create a saved build."
        />
        <Link href="/create" className="button button-primary">
          Create a build <ArrowRight size={18} />
        </Link>
      </div>
    );
  return (
    <div id="page-content" className="studio-page studio-result">
      <PageHeading
        eyebrow={
          result ? "Made from your inspiration" : "A little world in the making"
        }
        title={
          result
            ? result.artifact.description.title
            : "Something personal.\nPiece by piece."
        }
        description={
          result
            ? "Your model, parts and instructions all come from the same checked brick placements."
            : "You can leave this page and return. Your build is saved as it progresses."
        }
        back="/create"
      />
      {error && (
        <div
          className="studio-notice error"
          role="alert"
          tabIndex={-1}
          ref={notice}
        >
          <TriangleAlert size={20} />
          <div>
            <strong>We couldn’t finish this step</strong>
            <p>{error}</p>
            {reference && <small>Support reference: {reference}</small>}
            <button
              className="text-link"
              onClick={() => setPollKey((k) => k + 1)}
            >
              Reconnect to this build <RotateCcw size={14} />
            </button>
          </div>
        </div>
      )}
      {result ? (
        <div className="studio-result-layout">
          <div>
            <div className="studio-viewer-wrap">
              <span className="tag">
                <CheckCircle2 size={14} /> Digital assembly checks passed
              </span>
              <ModelViewer
                model={result.artifact.model}
                className="studio-viewer"
              />
            </div>
            <ModelStats model={result.artifact.model} />
            <p className="studio-model-note">
              Drag to explore · Exact pieces shown · Physical fit and strength
              untested
            </p>
          </div>
          <aside className="panel studio-result-controls">
            <span className="eyebrow">Make it yours</span>
            <h2>A build with your character.</h2>
            <p>{result.artifact.description.summary}</p>
            <div
              className="studio-variant-buttons"
              role="group"
              aria-label="Change model detail"
            >
              {(["easy", "normal", "hard"] as const).map((detail, i) => (
                <button
                  key={detail}
                  disabled={!!busy || current?.options.detail === detail}
                  aria-pressed={current?.options.detail === detail}
                  onClick={() =>
                    void action("variant", { ...current!.options, detail })
                  }
                >
                  <Sparkles size={16} />
                  {["Simpler", "Balanced", "More detail"][i]}
                </button>
              ))}
            </div>
            <div
              className="studio-variant-buttons"
              role="group"
              aria-label="Instruction pace"
            >
              {(["easy", "medium", "hard"] as const).map((pace, i) => (
                <button
                  key={pace}
                  disabled={!!busy || current?.options.pace === pace}
                  aria-pressed={current?.options.pace === pace}
                  onClick={() =>
                    void action("variant", { ...current!.options, pace })
                  }
                >
                  <Layers size={16} />
                  {["Small steps", "Balanced steps", "Layer by layer"][i]}
                </button>
              ))}
            </div>
            <p className="field-description">
              New versions reuse your saved interpretation. The original design
              and its progress stay available.
            </p>
            <button
              className="button button-primary"
              onClick={() => void openBuilder()}
              disabled={!!busy}
            >
              {busy ? (
                <>
                  <LoaderCircle size={18} className="spin" /> Preparing…
                </>
              ) : (
                <>
                  Let’s build this <ArrowRight size={18} />
                </>
              )}
            </button>
            <Link href="/account" className="text-link">
              Keep your collection across devices <ArrowRight size={14} />
            </Link>
            <details className="studio-adaptations">
              <summary>What was interpreted and simplified</summary>
              <ul>
                {[
                  ...result.artifact.model.studio!.adaptations,
                  ...result.artifact.description.uncertainties,
                ].map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
              <small>
                Proportions are estimated. Feature consistency checks are not a
                pixel-level resemblance score.
              </small>
            </details>
            <p className="studio-privacy">
              <ShieldCheck size={16} /> Private photos expire after 24 hours.
              Your model remains saved.
            </p>
          </aside>
        </div>
      ) : (
        <div className="studio-progress-layout">
          <div className="studio-progress-art" aria-hidden="true">
            <div className="studio-brick-orbit">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  style={{ "--brick-index": i } as React.CSSProperties}
                />
              ))}
            </div>
            <Blocks size={46} />
          </div>
          <div className="studio-progress-details">
            <span className="tag">
              {current?.stage === "completed"
                ? "Opening your model"
                : current?.cancelRequested
                  ? "Cancelling safely"
                  : current?.stage === "failed"
                    ? "Needs another try"
                    : current?.stage === "cancelled"
                      ? "Cancelled"
                      : "Your saved build"}
            </span>
            <h2 role="status">
              {current ? LABELS[current.stage] : "Opening your saved build…"}
            </h2>
            {current?.stage === "failed" ? (
              <>
                <div
                  className="studio-notice error"
                  role="alert"
                  ref={failedNotice}
                  tabIndex={-1}
                >
                  <TriangleAlert size={20} />
                  <div>
                    <p>
                      {current.error?.message ||
                        "This design could not finish. No demo was substituted."}
                    </p>
                    <small>
                      Stage: {current.error?.stage} · Reference:{" "}
                      {current.error?.requestId || current.id}
                    </small>
                  </div>
                </div>
                <button
                  className="button button-primary"
                  disabled={!!busy}
                  onClick={() => void action("retry")}
                >
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <RotateCcw size={17} />
                  )}{" "}
                  Retry this build
                </button>
                <p className="field-description">
                  Retry reuses the saved analysis when available. Otherwise it
                  resends the same private photos while they are retained.
                </p>
              </>
            ) : current?.stage === "cancelled" ? (
              <Link href="/create" className="button button-primary">
                Start a new build <ArrowRight size={17} />
              </Link>
            ) : (
              <>
                <div
                  className="studio-progress-track"
                  role="progressbar"
                  aria-label="Build generation"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={current?.progress || 0}
                >
                  <span style={{ width: `${current?.progress || 0}%` }} />
                </div>
                <div className="studio-stage-list">
                  {STAGES.map((s) => {
                    const threshold =
                        {
                          interpreting: 15,
                          planning: 40,
                          compiling: 50,
                          checking: 65,
                          finalizing: 94,
                        }[s.id] || 0,
                      done = (current?.progress || 0) > threshold;
                    return (
                      <div
                        key={s.id}
                        className={
                          current?.stage === s.id
                            ? "active"
                            : done
                              ? "done"
                              : ""
                        }
                      >
                        <span>
                          {done ? (
                            <Check size={13} />
                          ) : current?.stage === s.id ? (
                            <LoaderCircle size={13} className="spin" />
                          ) : (
                            <i />
                          )}
                        </span>
                        {s.label}
                      </div>
                    );
                  })}
                </div>
                <button
                  className="text-link"
                  disabled={!!busy || !current || current.cancelRequested}
                  onClick={() => void action("cancel")}
                >
                  <X size={15} />{" "}
                  {current?.cancelRequested
                    ? "Cancellation requested"
                    : "Cancel generation"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <Link href="/" className="text-link">
        <ArrowLeft size={16} /> Back to my builds
      </Link>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { History, ArrowUpRight } from "lucide-react";
import type { StudioJob } from "../../../shared/studio";
import { studioRequest } from "@/services/studio-client";
export function StudioVersions({ current }: { current: StudioJob }) {
  const [jobs, setJobs] = useState<StudioJob[]>([]),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    studioRequest<{ jobs: StudioJob[] }>(`projects/${current.projectId}/jobs`, {
      signal: abort.signal,
    })
      .then((r) => {
        if (!abort.signal.aborted) {
          setJobs(r.jobs);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [current.projectId, current.id, retry]);
  if (!failed && jobs.length < 2) return null;
  return (
    <details className="studio-adaptations">
      <summary>
        <History size={14} /> Your saved versions
      </summary>
      {failed ? (
        <div>
          <p>Saved versions could not be reached.</p>
          <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <div className="studio-version-list">
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/design?job=${j.id}`}
              aria-current={j.id === current.id ? "page" : undefined}
            >
              <span>
                <b>
                  {j.options.detail === "easy"
                    ? "Simple"
                    : j.options.detail === "normal"
                      ? "Balanced"
                      : "Detailed"}{" "}
                  · {j.options.size}
                </b>
                <small>
                  {j.options.pace === "easy"
                    ? "Small steps"
                    : j.options.pace === "hard"
                      ? "Layer by layer"
                      : "Balanced steps"}{" "}
                  ·{" "}
                  {j.id === current.id
                    ? "Viewing"
                    : j.stage === "completed"
                      ? "Ready"
                      : j.stage}
                </small>
              </span>
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </div>
      )}
      <small>
        Each version keeps its own exact pieces and building progress. Showing
        up to 50 recent versions.
      </small>
    </details>
  );
}

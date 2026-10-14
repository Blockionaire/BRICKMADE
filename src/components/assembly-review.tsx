"use client";
import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  modelSignature,
  type ValidationReport,
} from "@/domain/validation/assembly";
import { reviewAssembly } from "@/services/assembly-validation";
import type { HouseModel } from "@/domain/types";
export function AssemblyReview({
  model,
  compact = false,
}: {
  model: HouseModel;
  compact?: boolean;
}) {
  const key = modelSignature(model),
    [result, setResult] = useState<{
      key: string;
      report?: ValidationReport;
      error?: string;
    }>(),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    reviewAssembly(model)
      .then((report) => {
        if (!cancelled) setResult({ key, report });
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            key,
            error:
              "The review couldn't finish. Reload to retry; this build has no completed digital clearance check yet.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [key, model]);
  const current = result?.key === key ? result : undefined,
    report = current?.report,
    status = report?.status ?? (current?.error ? "failed" : "checking");
  return (
    <section
      className={`assembly-review ${compact ? "compact" : ""}`}
      aria-label="Assembly review"
      data-validation-status={status}
    >
      <button
        className="assembly-review-heading"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="assembly-review-icon">
          {status === "checking" ? (
            <LoaderCircle className="spin" size={20} />
          ) : status === "passed" ? (
            <ShieldCheck size={21} />
          ) : (
            <TriangleAlert size={21} />
          )}
        </span>
        <span>
          <strong>
            {status === "checking"
              ? "Checking every connection…"
              : status === "passed"
                ? "Digital checks passed"
                : "This build needs review"}
          </strong>
          <small>
            {report
              ? `${report.pieceCount} pieces · ${report.connections} aligned attachments · ${report.components} connected assembly`
              : "Geometry, structure, parts and instructions"}
          </small>
        </span>
        <ChevronDown size={17} />
      </button>
      <p className="assembly-physical-note">
        Physical test pending. Digital checks cover reviewed fits and sampled
        clearance; they do not certify strength or purchasing availability.
      </p>
      {expanded && (
        <div className="assembly-review-details">
          {current?.error && <p role="alert">{current.error}</p>}
          {report?.checks.map((c) => (
            <div key={c.id}>
              {c.status === "passed" ? (
                <Check size={15} />
              ) : c.status === "pending" ? (
                <LoaderCircle size={15} />
              ) : (
                <TriangleAlert size={15} />
              )}
              <span>{c.name}</span>
              <small>{c.status}</small>
            </div>
          ))}
          {report?.issues.length ? (
            <div className="assembly-issues">
              <strong>Review notes</strong>
              {report.issues.slice(0, 8).map((i, index) => (
                <p key={index}>
                  {i.message}
                  {i.step ? ` Step ${i.step}.` : ""}
                </p>
              ))}
            </div>
          ) : null}
          <p>
            Solid sampling: 0.4 mm. Recorded colors are historical source
            evidence; current stock is unchecked. Manual window fitting needs a
            physical test.
          </p>
        </div>
      )}
    </section>
  );
}

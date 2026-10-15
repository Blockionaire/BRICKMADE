"use client";
import { useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, LoaderCircle } from "lucide-react";
import type { Project } from "@/domain/types";
import { projectModel } from "@/domain/project-model";
import { projectRepository } from "@/services/project-repository";
import { studioRequest } from "@/services/studio-client";
import type { CloudProgress } from "@/services/studio-projects";
function payload(p: Project) {
  const model = projectModel(p),
    ids = p.completed
      ? model.placements.map((x) => x.id)
      : p.completedPlacementIds ||
        model.placements.filter((x) => x.step < p.currentStep).map((x) => x.id);
  return {
    sha256: p.cloud!.sha256,
    completedIds: [...ids].sort(),
    pace: p.settings.buildDifficulty || "medium",
  };
}
export function CloudProgressSync({ project }: { project: Project }) {
  const [status, setStatus] = useState<
      "idle" | "saving" | "saved" | "error" | "conflict"
    >("idle"),
    [retry, setRetry] = useState(0);
  const working = useRef(false),
    last = useRef(""),
    paused = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!project.cloud || !project.artifact || paused.current) return;
    const timer = setTimeout(async () => {
      if (working.current) return;
      const p = projectRepository
        .snapshot()
        .projects.find((v) => v.id === project.id);
      if (!p?.cloud) return;
      const data = payload(p),
        signature = JSON.stringify(data);
      if (last.current === signature) return;
      working.current = true;
      if (mounted.current) setStatus("saving");
      try {
        const remote = (
          await studioRequest<{ progress: CloudProgress | null }>(
            `projects/${p.cloud.projectId}/progress?sha=${p.cloud.sha256}`,
          )
        ).progress;
        const version = remote?.version || 0;
        if (
          version !== (p.cloud.progressVersion || 0) &&
          remote &&
          JSON.stringify({
            sha256: remote.artifact_sha256,
            completedIds: [...remote.completed_ids].sort(),
            pace: remote.pace,
          }) !== signature
        ) {
          paused.current = true;
          if (mounted.current) setStatus("conflict");
          return;
        }
        const result = await studioRequest<{ progress: CloudProgress }>(
          `projects/${p.cloud.projectId}/progress`,
          { method: "POST", body: { ...data, version } },
        );
        last.current = signature;
        const latest = projectRepository
          .snapshot()
          .projects.find((v) => v.id === p.id);
        if (latest?.cloud)
          projectRepository.save({
            ...latest,
            cloud: {
              ...latest.cloud,
              progressVersion: result.progress.version,
            },
          });
        if (mounted.current) setStatus("saved");
      } catch (e) {
        if (mounted.current)
          setStatus(
            e instanceof Error && "code" in e && e.code === "progress-conflict"
              ? "conflict"
              : "error",
          );
      } finally {
        working.current = false;
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [project, retry]);
  async function recover() {
    if (!project.cloud) return;
    try {
      const r = (
        await studioRequest<{ progress: CloudProgress | null }>(
          `projects/${project.cloud.projectId}/progress?sha=${project.cloud.sha256}`,
        )
      ).progress;
      if (!r) return;
      const next = {
        ...project,
        settings: { ...project.settings, buildDifficulty: r.pace },
        cloud: { ...project.cloud, progressVersion: r.version },
        completedPlacementIds: r.completed_ids,
      };
      const model = projectModel(next),
        valid = new Set(model.placements.map((p) => p.id)),
        ids = new Set(r.completed_ids.filter((id) => valid.has(id)));
      next.completedPlacementIds = [...ids];
      next.completed = ids.size === model.placements.length;
      next.currentStep = next.completed
        ? model.steps.length
        : model.steps.find((s) => s.placementIds.some((id) => !ids.has(id)))
            ?.number || 1;
      last.current = JSON.stringify(payload(next));
      paused.current = false;
      projectRepository.save(next);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }
  if (!project.cloud) return null;
  return (
    <div
      className={`cloud-progress-note ${["error", "conflict"].includes(status) ? "error" : ""}`}
      role="status"
    >
      {status === "saving" ? (
        <LoaderCircle size={14} className="spin" />
      ) : ["error", "conflict"].includes(status) ? (
        <CloudOff size={14} />
      ) : (
        <Cloud size={14} />
      )}
      <span>
        {status === "saving"
          ? "Saving your progress…"
          : status === "conflict"
            ? "Progress changed in another tab or device. Your local progress is kept until you choose."
            : status === "error"
              ? "Progress is saved on this device; cloud saving will need another try."
              : status === "idle"
                ? "Progress kept on this device; checking cloud save…"
                : "Progress saved privately"}
      </span>
      {status === "conflict" ? (
        <button className="text-link" onClick={() => void recover()}>
          Load cloud progress
        </button>
      ) : status === "error" ? (
        <button className="text-link" onClick={() => setRetry((r) => r + 1)}>
          Retry cloud save
        </button>
      ) : null}
    </div>
  );
}

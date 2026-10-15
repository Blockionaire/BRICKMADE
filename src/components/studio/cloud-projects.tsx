"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Cloud, Blocks, LoaderCircle } from "lucide-react";
import { ModelThumbnail } from "@/components/model-thumbnail";
import { loadStudioArtifact, studioRequest } from "@/services/studio-client";
import type { StudioArtifact } from "../../../shared/studio-artifact";
type SavedCloudProject = {
  id: string;
  title: string;
  updated_at: string;
  bm_jobs: { id: string; stage: string; created_at: string }[];
};
export function CloudProjects() {
  const [projects, setProjects] = useState<SavedCloudProject[]>([]),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const update = () => {
      setProjects([]);
      setReload((n) => n + 1);
    };
    window.addEventListener("brickmade-cloud-identity", update);
    return () => window.removeEventListener("brickmade-cloud-identity", update);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    studioRequest<{ configured: boolean }>("config", { signal: abort.signal })
      .then(async (c) => {
        if (!c.configured) return;
        const data = await studioRequest<{ projects: SavedCloudProject[] }>(
          "projects",
          { signal: abort.signal },
        );
        if (!abort.signal.aborted)
          setProjects(data.projects.filter((p) => p.bm_jobs.length));
      })
      .catch(() => {
        /* Local builds remain available while cloud identity is unavailable. */
      });
    return () => abort.abort();
  }, [reload]);
  if (!projects.length) return null;
  return (
    <section className="cloud-projects">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Cloud size={13} /> Saved privately
          </span>
          <h2>Your cloud builds</h2>
        </div>
      </div>
      <div className="cloud-project-grid">
        {projects.map((p) => (
          <CloudBuildCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}
function CloudBuildCard({ project }: { project: SavedCloudProject }) {
  const jobs = [...project.bm_jobs].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
    job = jobs.find((j) => j.stage === "completed") || jobs[0];
  const host = useRef<HTMLAnchorElement>(null),
    [artifact, setArtifact] = useState<StudioArtifact | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (job.stage !== "completed") return;
    const abort = new AbortController();
    let started = false;
    const load = () => {
      if (started) return;
      started = true;
      loadStudioArtifact(job.id, abort.signal)
        .then((r) => {
          if (!abort.signal.aborted) setArtifact(r.artifact);
        })
        .catch(() => {
          if (!abort.signal.aborted) setFailed(true);
        });
    };
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                load();
                observer?.disconnect();
              }
            },
            { rootMargin: "150px" },
          )
        : null;
    if (observer && host.current) observer.observe(host.current);
    else load();
    return () => {
      abort.abort();
      observer?.disconnect();
    };
  }, [job.id, job.stage]);
  return (
    <Link
      ref={host}
      href={`/design?job=${job.id}`}
      className="cloud-build-card"
    >
      <div className="cloud-build-thumbnail">
        {artifact ? (
          <ModelThumbnail model={artifact.model} name={project.title} />
        ) : (
          <div className="cloud-build-placeholder">
            {job.stage === "completed" && !failed ? (
              <LoaderCircle size={26} className="spin" />
            ) : (
              <Blocks size={32} />
            )}
            <span>
              {failed
                ? "Open saved design"
                : job.stage === "completed"
                  ? "Loading your actual model"
                  : job.stage === "failed"
                    ? "Needs another try"
                    : "Build in progress"}
            </span>
          </div>
        )}
      </div>
      <div>
        <span className="tag">
          {artifact ? `${artifact.model.stats.pieceCount} pieces` : job.stage}
        </span>
        <h3>{project.title}</h3>
        <span className="text-link">
          Open build <ArrowUpRight size={15} />
        </span>
      </div>
    </Link>
  );
}

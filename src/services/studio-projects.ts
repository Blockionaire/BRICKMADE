import type { StudioArtifact } from "../../shared/studio-artifact";
import type { Project, BuildDifficulty } from "@/domain/types";
import { projectModel } from "@/domain/project-model";
import { projectRepository } from "./project-repository";
import { studioRequest, ensureStudioSession } from "./studio-client";
export interface CloudProgress {
  completed_ids: string[];
  pace: BuildDifficulty;
  version: number;
  artifact_sha256: string;
}
export async function importStudioBuild(
  artifact: StudioArtifact,
  sha256: string,
  signal?: AbortSignal,
) {
  const identity = await ensureStudioSession(signal);
  const id = `cloud-${artifact.jobId}`;
  const saved = await studioRequest<{ progress: CloudProgress | null }>(
    `projects/${artifact.projectId}/progress?sha=${sha256}`,
    { signal },
  );
  signal?.throwIfAborted();
  const existing = projectRepository
    .snapshot()
    .projects.find((p) => p.id === id);
  if (
    existing &&
    existing.cloud?.sha256 === sha256 &&
    (existing.cloud.progressVersion || 0) === (saved.progress?.version || 0)
  ) {
    projectRepository.activate(id);
    return existing;
  }
  const pace = saved.progress?.pace || artifact.options.pace;
  const project: Project = {
    id,
    name: artifact.description.title,
    createdAt: artifact.createdAt,
    settings: { ...artifact.model.settings, buildDifficulty: pace },
    modelRevision: artifact.compilerVersion,
    artifact,
    cloud: {
      ownerId: identity.user.id,
      projectId: artifact.projectId,
      jobId: artifact.jobId,
      sha256,
      progressVersion: saved.progress?.version || 0,
    },
    currentStep: 1,
    completed: false,
  };
  const model = projectModel(project),
    valid = new Set(model.placements.map((p) => p.id)),
    done = new Set(
      (saved.progress?.completed_ids || []).filter((id) => valid.has(id)),
    );
  project.completed = done.size === model.placements.length;
  project.currentStep = project.completed
    ? model.steps.length
    : model.steps.find((s) => s.placementIds.some((id) => !done.has(id)))
        ?.number || 1;
  project.completedPlacementIds = [...done];
  project.cloud!.progressSignature = JSON.stringify({
    sha256,
    completedIds: [...done].sort(),
    pace,
  });
  projectRepository.save(project);
  return project;
}

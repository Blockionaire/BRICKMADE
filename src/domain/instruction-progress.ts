import { createHouse } from "./house";
import type { BuildDifficulty, HouseModel, Project } from "./types";

/** Never give credit for unbuilt pieces when the instruction boundaries change. */
export function regroupProject(
  project: Project,
  buildDifficulty: BuildDifficulty,
  previous: HouseModel = createHouse(project.settings),
): Project {
  const settings = { ...project.settings, buildDifficulty };
  const next = createHouse(settings);
  if (project.completed)
    return {
      ...project,
      settings,
      currentStep: next.steps.length,
      completedPlacementIds: undefined,
    };
  const completed = new Set(
    project.completedPlacementIds ??
      previous.placements
        .filter((p) => p.step < project.currentStep)
        .map((p) => p.id),
  );
  const currentStep =
    next.steps.find((s) => s.placementIds.some((id) => !completed.has(id)))
      ?.number ?? next.steps.length;
  return {
    ...project,
    settings,
    currentStep,
    completedPlacementIds: [...completed],
  };
}

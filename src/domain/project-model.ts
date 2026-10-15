import { createModel } from "./models";
import { planBuildSteps } from "./build-steps";
import { countParts } from "./inventory";
import type { HouseModel, Project, BuildDifficulty } from "./types";
const cache = new WeakMap<HouseModel, Map<string, HouseModel>>();
/** Reframe instructions from saved placements; never recompile a cloud design to render it. */
export function regroupFrozenModel(
  model: HouseModel,
  pace: BuildDifficulty,
): HouseModel {
  if ((model.settings.buildDifficulty || "medium") === pace) return model;
  const previous = cache.get(model)?.get(pace);
  if (previous) return previous;
  const phases = model.constructionPhases;
  if (!phases) throw Error("This saved design has no regrouping data.");
  const ownership = new Map(
    phases.flatMap((p) => p.placementIds.map((id) => [id, p.number] as const)),
  );
  const settings = { ...model.settings, buildDifficulty: pace };
  const source = model.placements.map((p) => ({
    ...p,
    step: ownership.get(p.id)!,
  }));
  const sequence = planBuildSteps(source, phases, settings);
  const bags = [...new Set(sequence.steps.map((s) => s.bag))].map((number) => {
    const steps = sequence.steps.filter((s) => s.bag === number),
      ids = new Set(steps.flatMap((s) => s.placementIds));
    return {
      number,
      name: steps[0].area,
      firstStep: steps[0].number,
      lastStep: steps.at(-1)!.number,
      parts: countParts(sequence.placements.filter((p) => ids.has(p.id))),
    };
  });
  const next = { ...model, ...sequence, bags, settings };
  if (!cache.has(model)) cache.set(model, new Map());
  cache.get(model)!.set(pace, next);
  return next;
}
export function projectModel(project: Project): HouseModel {
  return project.artifact
    ? regroupFrozenModel(
        project.artifact.model,
        project.settings.buildDifficulty || "medium",
      )
    : createModel(project.settings);
}

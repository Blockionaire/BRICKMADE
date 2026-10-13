import { describe, expect, it } from "vitest";
import {
  createHouse,
  createLegacyInstructionModel,
  countParts,
} from "@/domain/house";
import {
  BUILD_SIZES,
  CATALOG,
  DETAIL_LEVELS,
  BUILD_DIFFICULTIES,
} from "@/domain/catalog";
import {
  demoAssistant,
  demoGeneration,
  GENERATION_STAGES,
} from "@/services/providers";
import { parseSavedState } from "@/services/project-repository";
import { STEP_LIMITS } from "@/domain/build-steps";
import { regroupProject } from "@/domain/instruction-progress";
import type { Placement, Project } from "@/domain/types";

function bounds(p: Placement) {
  const part = CATALOG[p.partId];
  const widths = [
    p.rotated ? part.depth : part.width,
    part.height,
    p.rotated ? part.width : part.depth,
  ];
  return p.position.map((center, i) => [
    center - widths[i] / 2,
    center + widths[i] / 2,
  ]);
}

describe("House variants share consistent model, inventory, bags, and instructions", () => {
  for (const size of BUILD_SIZES)
    for (const detail of DETAIL_LEVELS) {
      it(`${size.name} / ${detail.name}: accounts for every placement exactly once`, () => {
        const model = createHouse({ detail: detail.id, size: size.id });
        expect(model.stats.pieceCount).toBe(model.placements.length);
        expect(model.stats.uniquePartCount).toBe(model.parts.length);
        expect(model.parts.reduce((sum, p) => sum + p.quantity, 0)).toBe(
          model.placements.length,
        );
        expect(model.steps.flatMap((s) => s.placementIds).sort()).toEqual(
          model.placements.map((p) => p.id).sort(),
        );
        expect(new Set(model.placements.map((p) => p.id)).size).toBe(
          model.placements.length,
        );
        expect(model.steps.map((s) => s.number)).toEqual(
          model.steps.map((_, i) => i + 1),
        );
        for (const step of model.steps) {
          expect(step.placementIds.length).toBeGreaterThan(0);
          expect(step.placementIds.length).toBeLessThanOrEqual(
            STEP_LIMITS.medium,
          );
          const additions = model.placements.filter(
            (p) => p.step === step.number,
          );
          const bottoms = additions.map((p) =>
            (p.position[1] - CATALOG[p.partId].height / 2).toFixed(2),
          );
          expect(new Set(bottoms).size).toBe(1);
          expect(step.focus.every(Number.isFinite)).toBe(true);
          expect(step.cluster).toBeLessThanOrEqual(step.clusters);
          if (
            step.title === "The garden fence" ||
            step.title === "The little chimney"
          )
            expect(step.suggestedView).toBe("back");
          if (step.title === "A garden of your own")
            expect(["left", "side"]).toContain(step.suggestedView);
          if (step.bag === 2)
            expect(
              new Set(
                additions.map((p) =>
                  p.rotated
                    ? p.position[0] > 0
                      ? "right"
                      : "left"
                    : p.position[2] > 0
                      ? "front"
                      : "back",
                ),
              ).size,
            ).toBe(1);
          expect(step.parts).toEqual(
            countParts(model.placements.filter((p) => p.step === step.number)),
          );
        }
        for (const bag of model.bags) {
          expect(bag.parts).toEqual(
            countParts(
              model.placements.filter(
                (p) => p.step >= bag.firstStep && p.step <= bag.lastStep,
              ),
            ),
          );
          expect(model.steps.filter((s) => s.bag === bag.number).length).toBe(
            bag.lastStep - bag.firstStep + 1,
          );
        }
        expect(
          model.bags
            .flatMap((b) => b.parts)
            .reduce((sum, p) => sum + p.quantity, 0),
        ).toBe(model.placements.length);
        expect(model.placements.every((p) => CATALOG[p.partId])).toBe(true);
        // Body intersections invalidate the digital scene. This does not establish physical stability.
        const boxes = model.placements.map(bounds);
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const overlap = boxes[i].every(
              (range, axis) =>
                Math.min(range[1], boxes[j][axis][1]) -
                  Math.max(range[0], boxes[j][axis][0]) >
                0.001,
            );
            if (overlap)
              throw new Error(
                `Intersecting pieces ${model.placements[i].id} and ${model.placements[j].id}`,
              );
          }
      });
    }
  it("detail and size change actual geometry rather than just labels", () => {
    const models = DETAIL_LEVELS.map((d) =>
      createHouse({ detail: d.id, size: "compact" }),
    );
    expect(new Set(models.map((m) => m.stats.pieceCount)).size).toBe(3);
    expect(models[0].stats.pieceCount).toBeLessThan(models[1].stats.pieceCount);
    expect(models[1].stats.pieceCount).toBeLessThan(models[2].stats.pieceCount);
    expect(models[0].stats.dimensions[2]).toBeLessThan(
      models[2].stats.dimensions[2],
    );
    expect(models[0].placements.some((p) => p.partId === "3009")).toBe(true);
    expect(
      models[2].placements.filter((p) => p.partId === "3005").length,
    ).toBeGreaterThan(
      models[0].placements.filter((p) => p.partId === "3005").length * 3,
    );
    expect(models[0].steps.some((s) => s.title.includes("chimney"))).toBe(
      false,
    );
    expect(models[1].steps.some((s) => s.title.includes("chimney"))).toBe(true);
    expect(models[2].steps.map((s) => s.title)).toEqual(
      expect.arrayContaining([
        "A welcoming porch",
        "Shutters & a rooftop skylight",
        "The garden fence",
      ]),
    );
    expect(models[1].steps.some((s) => s.title.includes("porch"))).toBe(false);
    const sizes = BUILD_SIZES.map((s) =>
      createHouse({ detail: "normal", size: s.id }),
    );
    expect(sizes[0].stats.dimensions[0]).toBeLessThan(
      sizes[2].stats.dimensions[0],
    );
    expect(sizes[0].steps.length).toBeLessThan(sizes[2].steps.length);
  });
});

describe("Demo providers", () => {
  const model = createHouse({ detail: "normal", size: "compact" });
  const context = {
    projectName: "Compact House",
    step: model.steps.find((s) => s.bag === 2)!,
    nextStep: model.steps.find((s) => s.bag === 2 && s.cluster === 2)!,
    bag: model.bags[1],
  };
  it("answers parts and sorting questions from the exact current step", () => {
    const answer = demoAssistant.answer("Which parts do I need?", context);
    for (const part of context.step.parts)
      expect(answer.text).toContain(`#${part.partId}`);
    expect(demoAssistant.answer("Which bag?", context).text).toContain("Bag 2");
    expect(demoAssistant.answer("Which part #3024?", context).text).toContain(
      "not listed",
    );
  });
  it("supplies contextual next steps and explicit unknown-question fallback", () => {
    expect(demoAssistant.answer("What’s next?", context).text).toContain(
      context.nextStep.title,
    );
    expect(
      demoAssistant.answer("What is the weather?", context).text,
    ).toContain("this demo");
    expect(demoAssistant.answer("Show another angle", context).action).toBe(
      "top-view",
    );
    const last = model.steps.at(-1)!;
    expect(
      demoAssistant.answer("Next step?", {
        ...context,
        step: last,
        nextStep: undefined,
      }).text,
    ).toContain("final step");
  });
  it("cancels generation without continuing its stages", async () => {
    const controller = new AbortController();
    const stages: number[] = [];
    const promise = demoGeneration.generate(
      model.settings,
      (s) => stages.push(s),
      controller.signal,
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(stages.length).toBeLessThan(GENERATION_STAGES.length);
  });
});

describe("Saved progress validation", () => {
  it("migrates all old modes while retaining names and resetting obsolete instructions", () => {
    const projects = ["easy", "standard", "high", "collector"].map(
      (detail, i) => ({
        id: `old-${i}`,
        name: `Saved build ${i}`,
        createdAt: "2026-10-13",
        settings: { detail, size: "compact" },
        currentStep: 8,
        completed: true,
      }),
    );
    const migrated = parseSavedState(
      JSON.stringify({ version: 1, projects, activeId: "old-2" }),
    );
    expect(migrated.version).toBe(4);
    expect(migrated.activeId).toBe("old-2");
    expect(migrated.projects.map((p) => p.settings.detail)).toEqual([
      "easy",
      "normal",
      "hard",
      "hard",
    ]);
    expect(migrated.projects.map((p) => p.name)).toEqual(
      projects.map((p) => p.name),
    );
    expect(
      migrated.projects.every((p) => p.currentStep === 1 && !p.completed),
    ).toBe(true);
    expect(parseSavedState(JSON.stringify(migrated))).toEqual(migrated);
  });

  it("keeps completed geometry and maps version-2 progress into the small steps", () => {
    const model = createHouse({ detail: "hard", size: "large" });
    const project = {
      id: "saved",
      name: "Kept house",
      createdAt: "2026-10-13",
      settings: model.settings,
      currentStep: 8,
      completed: false,
    };
    const migrated = parseSavedState(
      JSON.stringify({ version: 2, activeId: project.id, projects: [project] }),
    ).projects[0];
    expect(model.steps[migrated.currentStep - 1].phaseNumber).toBe(8);
    expect(
      model.steps
        .filter((s) => s.number < migrated.currentStep)
        .every((s) => s.phaseNumber < 8),
    ).toBe(true);
    const completed = parseSavedState(
      JSON.stringify({
        version: 2,
        activeId: project.id,
        projects: [{ ...project, completed: true }],
      }),
    ).projects[0];
    expect(completed.currentStep).toBe(model.steps.length);
    expect(completed.completed).toBe(true);
    const legacy = createLegacyInstructionModel(project.settings);
    const farAlong = parseSavedState(
      JSON.stringify({
        version: 3,
        activeId: project.id,
        projects: [{ ...project, currentStep: legacy.steps.length - 1 }],
      }),
    ).projects[0];
    expect(farAlong.completedPlacementIds?.sort()).toEqual(
      legacy.placements
        .filter((p) => p.step < legacy.steps.length - 1)
        .map((p) => p.id)
        .sort(),
    );
    expect(farAlong.currentStep).toBeGreaterThan(100);
    expect(
      parseSavedState(
        JSON.stringify({
          version: 4,
          activeId: project.id,
          projects: [farAlong],
        }),
      ).projects[0],
    ).toEqual(farAlong);
  });

  it("recovers from corrupt or incompatible local state", () => {
    expect(parseSavedState("not json").activeId).toBe("compact-house");
    expect(
      parseSavedState(
        JSON.stringify({ version: 1, projects: [{}], activeId: "invalid" }),
      ).activeId,
    ).toBe("compact-house");
    expect(parseSavedState(null).projects).toHaveLength(1);
  });
});

describe("Independent building difficulty", () => {
  for (const size of BUILD_SIZES)
    for (const detail of DETAIL_LEVELS)
      it(`${size.name} / ${detail.name}: regroups the same bricks into small groups, medium groups, and full layers`, () => {
        const models = BUILD_DIFFICULTIES.map((level) =>
          createHouse({
            detail: detail.id,
            size: size.id,
            buildDifficulty: level.id,
          }),
        );
        const geometry = (model: (typeof models)[number]) =>
          model.placements
            .map(({ id, partId, color, position, rotated }) => ({
              id,
              partId,
              color,
              position,
              rotated,
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
        const inventory = (parts: (typeof models)[number]["parts"]) =>
          [...parts].sort((a, b) => a.key.localeCompare(b.key));
        for (const [index, model] of models.entries()) {
          expect(geometry(model)).toEqual(geometry(models[0]));
          expect(inventory(model.parts)).toEqual(inventory(models[0].parts));
          expect(model.stats).toEqual(models[0].stats);
          expect(model.steps.flatMap((s) => s.placementIds).sort()).toEqual(
            model.placements.map((p) => p.id).sort(),
          );
          for (const step of model.steps) {
            const pieces = model.placements.filter(
              (p) => p.step === step.number,
            );
            expect(step.parts).toEqual(countParts(pieces));
            expect(pieces.length).toBeLessThanOrEqual(
              STEP_LIMITS[BUILD_DIFFICULTIES[index].id],
            );
            const bottom = (p: Placement) =>
              (p.position[1] - CATALOG[p.partId].height / 2).toFixed(2);
            expect(new Set(pieces.map(bottom)).size).toBe(1);
            if (index === 2) {
              const phasePieceIds = new Set(
                model.steps
                  .filter((s) => s.phaseNumber === step.phaseNumber)
                  .flatMap((s) => s.placementIds),
              );
              const fullLayer = model.placements.filter(
                (p) =>
                  phasePieceIds.has(p.id) && bottom(p) === bottom(pieces[0]),
              );
              expect([...step.placementIds].sort()).toEqual(
                fullLayer.map((p) => p.id).sort(),
              );
              if (step.bag === 2) expect(step.area).toBe("Full wall layer");
            }
          }
          model.bags.forEach((bag, i) =>
            expect(inventory(bag.parts)).toEqual(
              inventory(models[0].bags[i].parts),
            ),
          );
        }
        expect(models[0].steps.length).toBeGreaterThan(models[1].steps.length);
        expect(models[1].steps.length).toBeGreaterThan(models[2].steps.length);
        expect(models[2].steps[0].placementIds.length).toBeGreaterThan(16);
      });

  it("retains exact completed bricks when switching repeatedly or reloading a partially completed layer", () => {
    const project: Project = {
      id: "pace",
      name: "My pace",
      createdAt: "2026-10-13",
      settings: { detail: "hard", size: "compact", buildDifficulty: "easy" },
      currentStep: 5,
      completed: false,
    };
    const easy = createHouse(project.settings);
    const completed = easy.placements
      .filter((p) => p.step < project.currentStep)
      .map((p) => p.id)
      .sort();
    const hard = regroupProject(project, "hard");
    expect(hard.currentStep).toBe(1); // This layer still has unbuilt bricks.
    expect(hard.completedPlacementIds?.sort()).toEqual(completed);
    const loaded = parseSavedState(
      JSON.stringify({ version: 4, projects: [hard], activeId: hard.id }),
    ).projects[0];
    const medium = regroupProject(loaded, "medium");
    const back = regroupProject(medium, "easy");
    expect(back.currentStep).toBe(project.currentStep);
    expect(back.completedPlacementIds?.sort()).toEqual(completed);
    for (const next of [hard, medium, back]) {
      const model = createHouse(next.settings);
      expect(
        model.placements
          .filter((p) => p.step < next.currentStep)
          .every((p) => completed.includes(p.id)),
      ).toBe(true);
    }
    const finished = regroupProject({ ...project, completed: true }, "hard");
    expect(finished.completed).toBe(true);
    expect(finished.currentStep).toBe(
      createHouse(finished.settings).steps.length,
    );
  });

  it("migrates version-3 progress from the original 6/8/10-piece boundaries", () => {
    for (const detail of DETAIL_LEVELS) {
      const settings = { detail: detail.id, size: "compact" as const };
      const legacy = createLegacyInstructionModel(settings);
      const old: Project = {
        id: detail.id,
        name: detail.name,
        createdAt: "2026-10-13",
        settings,
        currentStep: 8,
        completed: false,
      };
      const saved = parseSavedState(
        JSON.stringify({ version: 3, projects: [old], activeId: old.id }),
      ).projects[0];
      const completed = legacy.placements
        .filter((p) => p.step < 8)
        .map((p) => p.id)
        .sort();
      expect(saved.completedPlacementIds?.sort()).toEqual(completed);
      const model = createHouse(saved.settings);
      expect(
        model.placements
          .filter((p) => p.step < saved.currentStep)
          .every((p) => completed.includes(p.id)),
      ).toBe(true);
      expect(saved.settings.buildDifficulty).toBe("medium");
    }
  });
});

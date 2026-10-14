import { describe, expect, it } from "vitest";
import { createHouse } from "@/domain/house";
import { createModel, MODEL_KINDS } from "@/domain/models";
import { BUILD_DIFFICULTIES, DETAIL_LEVELS } from "@/domain/catalog";
import {
  demoAssistant,
  demoGeneration,
  GENERATION_STAGES,
} from "@/services/providers";
import { parseSavedState } from "@/services/project-repository";
import { regroupProject } from "@/domain/instruction-progress";
import { STEP_LIMITS } from "@/domain/build-steps";
import type { Project } from "@/domain/types";
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

describe("Distinct designs and independent instruction pace", () => {
  for (const kind of MODEL_KINDS) {
    it(`${kind.id} has three distinct assemblies and preserves exact geometry across instruction paces`, () => {
      const levels = DETAIL_LEVELS.map((d) =>
        createModel({ modelKind: kind.id, detail: d.id, size: "compact" }),
      );
      expect(new Set(levels.map((m) => m.stats.pieceCount)).size).toBe(3);
      expect(levels[0].stats.pieceCount).toBeLessThan(
        levels[1].stats.pieceCount,
      );
      expect(levels[1].stats.pieceCount).toBeLessThan(
        levels[2].stats.pieceCount,
      );
      const models = BUILD_DIFFICULTIES.map((p) =>
        createModel({ ...levels[2].settings, buildDifficulty: p.id }),
      );
      const geometry = (m: (typeof models)[number]) =>
        m.placements
          .map(({ step, ...p }) => {
            void step;
            return p;
          })
          .sort((a, b) => a.id.localeCompare(b.id));
      models.forEach((m, i) => {
        expect(geometry(m)).toEqual(geometry(models[0]));
        expect(m.parts).toEqual(models[0].parts);
        expect(m.stats).toEqual(models[0].stats);
        expect(
          m.steps.every(
            (s) =>
              s.placementIds.length <= STEP_LIMITS[BUILD_DIFFICULTIES[i].id],
          ),
        ).toBe(true);
      });
      expect(models[0].steps.length).toBeGreaterThan(models[1].steps.length);
      expect(models[1].steps.length).toBeGreaterThanOrEqual(
        models[2].steps.length,
      );
    });
  }
  it("retains exactly completed pieces across pace switches and current-version reloads", () => {
    const project: Project = {
      id: "pace",
      name: "My flowers",
      createdAt: "2026-10-14",
      settings: {
        modelKind: "plant",
        detail: "hard",
        size: "large",
        buildDifficulty: "easy",
      },
      currentStep: 5,
      completed: false,
    };
    const ids = createModel(project.settings)
      .placements.filter((p) => p.step < 5)
      .map((p) => p.id)
      .sort();
    const hard = regroupProject(project, "hard");
    expect(hard.completedPlacementIds?.sort()).toEqual(ids);
    const loaded = parseSavedState(
      JSON.stringify({ version: 5, projects: [hard], activeId: hard.id }),
    ).projects[0];
    const back = regroupProject(regroupProject(loaded, "medium"), "easy");
    expect(back.currentStep).toBe(5);
    expect(back.completedPlacementIds?.sort()).toEqual(ids);
  });
});
describe("Structure revision migration", () => {
  for (const version of [1, 2, 3, 4])
    it(`version ${version} preserves names and settings, clears obsolete piece progress`, () => {
      const projects = ["easy", "standard", "high", "collector"].map(
        (detail, i) => ({
          id: `old-${i}`,
          name: `Saved build ${i}`,
          createdAt: "2026-10-13",
          settings: { detail, size: "compact" },
          currentStep: 8,
          completed: true,
          completedPlacementIds: ["piece-1"],
        }),
      );
      const migrated = parseSavedState(
        JSON.stringify({ version, projects, activeId: "old-2" }),
      );
      expect(migrated.version).toBe(5);
      expect(migrated.activeId).toBe("old-2");
      expect(migrated.projects.map((p) => p.name)).toEqual(
        projects.map((p) => p.name),
      );
      expect(migrated.projects.map((p) => p.settings.detail)).toEqual([
        "easy",
        "normal",
        "hard",
        "hard",
      ]);
      expect(
        migrated.projects.every(
          (p) =>
            p.currentStep === 1 &&
            !p.completed &&
            !p.completedPlacementIds &&
            p.migrationNotice === "structure-updated",
        ),
      ).toBe(true);
      expect(parseSavedState(JSON.stringify(migrated))).toEqual(migrated);
    });
  it("recovers corrupt or incompatible local state", () => {
    expect(parseSavedState("not json").activeId).toBe("compact-house");
    expect(
      parseSavedState(
        JSON.stringify({ version: 5, projects: [{}], activeId: "bad" }),
      ).activeId,
    ).toBe("compact-house");
  });
});

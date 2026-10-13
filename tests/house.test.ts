import { describe, expect, it } from "vitest";
import { createHouse, countParts } from "@/domain/house";
import { BUILD_SIZES, CATALOG, DETAIL_LEVELS } from "@/domain/catalog";
import {
  demoAssistant,
  demoGeneration,
  GENERATION_STAGES,
} from "@/services/providers";
import { parseSavedState } from "@/services/project-repository";
import type { Placement } from "@/domain/types";

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
        for (const step of model.steps)
          expect(step.parts).toEqual(
            countParts(model.placements.filter((p) => p.step === step.number)),
          );
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
    expect(new Set(models.map((m) => m.stats.pieceCount)).size).toBe(4);
    const sizes = BUILD_SIZES.map((s) =>
      createHouse({ detail: "standard", size: s.id }),
    );
    expect(sizes[0].stats.dimensions[0]).toBeLessThan(
      sizes[2].stats.dimensions[0],
    );
    expect(sizes[0].steps.length).toBeLessThan(sizes[2].steps.length);
  });
});

describe("Demo providers", () => {
  const model = createHouse({ detail: "standard", size: "compact" });
  const context = {
    projectName: "Compact House",
    step: model.steps[2],
    nextStep: model.steps[3],
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

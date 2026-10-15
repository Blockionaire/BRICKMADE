import { describe, it, expect } from "vitest";
import {
  HOUSE_EXAMPLE,
  DEFAULT_STUDIO_OPTIONS,
  parseHouseDesign,
  parseStudioOptions,
} from "../shared/studio";
import { compileHouse } from "../server/compile-house.mjs";
import { createModel } from "../src/domain/models";
describe("Category contracts", () => {
  it("rejects malformed descriptions and options before geometry", () => {
    expect(() =>
      parseHouseDesign({ ...HOUSE_EXAMPLE, storeys: Infinity }),
    ).toThrow();
    expect(() =>
      parseHouseDesign({ ...HOUSE_EXAMPLE, unexpected: true }),
    ).toThrow();
    expect(() =>
      parseHouseDesign({ ...HOUSE_EXAMPLE, title: "\u0000" }),
    ).toThrow();
    expect(() =>
      parseStudioOptions({ ...DEFAULT_STUDIO_OPTIONS, detail: "collector" }),
    ).toThrow();
  });
  it("preserves shape while changing instruction pace", () => {
    const base = {
      detail: "normal" as const,
      size: "compact" as const,
      houseDesign: HOUSE_EXAMPLE,
    };
    const models = (["easy", "medium", "hard"] as const).map(
      (buildDifficulty) => createModel({ ...base, buildDifficulty }),
    );
    expect(models.map((m) => m.steps.length)[0]).toBeGreaterThan(
      models[1].steps.length,
    );
    const geometry = (m: (typeof models)[number]) =>
      m.placements
        .map((p) => [p.id, p.partId, p.color, p.position, p.rotation])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    for (const m of models) expect(geometry(m)).toEqual(geometry(models[0]));
  });
});
const cases = (["rectangle", "l-shaped"] as const).flatMap((footprint, f) =>
  (["flat", "gable", "hip", "shed"] as const).flatMap((roofShape, r) =>
    [1, 2, 3].map((storeys, i) => ({
      footprint,
      roofShape,
      storeys: storeys as 1 | 2 | 3,
      detail: (["easy", "normal", "hard"] as const)[(r + i + f) % 3],
      size: (["compact", "standard", "large"] as const)[(r + i) % 3],
      pace: (["easy", "medium", "hard"] as const)[(r + f + i) % 3],
      ridgeAxis: (i % 2 ? "depth" : "width") as "width" | "depth",
    })),
  ),
);
describe("Expanded House digital release matrix", () => {
  for (const c of cases)
    it(`${c.footprint} ${c.roofShape} ${c.storeys} floors ${c.detail}/${c.size}/${c.pace}`, async () => {
      const description = {
        ...HOUSE_EXAMPLE,
        footprint: c.footprint,
        roofShape: c.roofShape,
        storeys: c.storeys,
        ridgeAxis: c.ridgeAxis,
      };
      const result = await compileHouse(description, {
        ...DEFAULT_STUDIO_OPTIONS,
        detail: c.detail,
        size: c.size,
        pace: c.pace,
      });
      expect(
        result.validation.issues.filter(
          (i: { severity: string }) => i.severity === "error",
        ),
      ).toEqual([]);
      expect(result.validation.status).toBe("passed");
      expect(result.model.studio!.storeys).toBe(c.storeys);
      expect(result.model.studio!.roofShape).toBe(c.roofShape);
      expect(result.model.stats.pieceCount).toBe(
        result.model.placements.length,
      );
    }, 120000);
});

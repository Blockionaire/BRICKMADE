import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  BUILDING_PATTERNS,
  createBuildingPattern,
} from "@/domain/parts/building-patterns";
import { BUILDER_PARTS, PART_PROFILES } from "@/domain/parts/profiles";
import { decodeCollisionShape } from "@/domain/validation/collision";
import { validateAssembly } from "@/domain/validation/assembly";
import {
  findBuilderParts,
  nominalGridAlternatives,
  partCapabilities,
} from "@/domain/parts/selection";
const shapes = new Map(
  BUILDER_PARTS.map((p) => {
    const raw = fs.readFileSync(`public${p.collision!.file}`);
    return [
      p.id,
      decodeCollisionShape(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      ),
    ] as const;
  }),
);
describe("Reusable source-backed building patterns", () => {
  for (const pattern of BUILDING_PATTERNS)
    it(pattern.name, () => {
      const model = createBuildingPattern(pattern.id),
        report = validateAssembly(model, shapes);
      expect(
        report.issues.filter((i) => i.severity === "error"),
        JSON.stringify(report.issues),
      ).toEqual([]);
      expect(report.status).toBe("passed");
      expect(report.physicalStatus).toBe("untested");
    });
  it("matches roles and recorded color evidence, excluding geometry-only records", () => {
    const all = findBuilderParts();
    expect(all.length).toBeGreaterThan(250);
    for (const role of ["mounted", "receiving", "stackable"] as const)
      expect(
        findBuilderParts({ role, colorId: 19 }).every(
          (p) => partCapabilities(p)[role] && p.observedColorIds.includes(19),
        ),
      ).toBe(true);
    expect(findBuilderParts({ colorId: 999999 })).toEqual([]);
    expect(findBuilderParts().some((p) => p.id === "60608")).toBe(false);
  });
  it("does not treat a smooth tile, curved surface or similar bounding box as a plate substitute", () => {
    expect(
      nominalGridAlternatives("3022", 19).some((p) => p.id === "3068b"),
    ).toBe(false);
    expect(nominalGridAlternatives("24201", 19)).toEqual([]);
    expect(
      PART_PROFILES.get("2431")!.connectors.every(
        (c) => c.kind === "anti-stud",
      ),
    ).toBe(true);
  });
});

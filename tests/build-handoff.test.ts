import { describe, it, expect } from "vitest";
import { createModel } from "../src/domain/models";
import { SUBJECT_EXAMPLES } from "../shared/subject-design";
import {
  prepareBuildHandoff,
  physicalTestPack,
  type ProviderMapping,
} from "../src/domain/library/build-handoff";
describe("Exact parts and physical test handoff", () => {
  it.each(Object.values(SUBJECT_EXAMPLES))(
    "keeps %s source namespaces and exact quantities",
    (description) => {
      const model = createModel({
          subjectDesign: description,
          detail: "normal",
          size: "compact",
        }),
        handoff = prepareBuildHandoff(model);
      expect(handoff.totalPieces).toBe(model.placements.length);
      expect(handoff.lines.every((l) => l.source.partColorVerified)).toBe(true);
      expect(handoff.readiness.ready).toBe(false);
      expect(handoff.xml).toBeNull();
      expect(handoff.csv.split("\r\n")).toHaveLength(model.parts.length + 2);
      expect(handoff.csv).toContain("Rebrickable color ID");
    },
  );
  it("exports provider XML only after every identity is explicitly mapped; duplicate identities block it", () => {
    const model = createModel({
        subjectDesign: SUBJECT_EXAMPLES.flower,
        detail: "easy",
        size: "compact",
      }),
      lines = prepareBuildHandoff(model).lines;
    const mappings: ProviderMapping[] = lines.map((l, i) => ({
      rebrickablePartId: l.rebrickablePartId,
      rebrickableColorId: l.rebrickableColorId,
      provider: "bricklink",
      providerPartId: `synthetic-fixture-${i}`,
      providerColorId: i,
      status: "verified",
      evidence:
        "Explicit synthetic test identity; not a real marketplace mapping",
    }));
    expect(prepareBuildHandoff(model, mappings).xml).toContain("<INVENTORY>");
    expect(
      prepareBuildHandoff(model, [...mappings, mappings[0]]).xml,
    ).toBeNull();
  });
  it("exports frozen instructions, poses, bags and source admissions with every physical result pending", () => {
    const settings = {
      subjectDesign: SUBJECT_EXAMPLES.car,
      detail: "normal" as const,
      size: "compact" as const,
    };
    const pack = physicalTestPack({
      id: "test",
      name: "Private test car",
      createdAt: new Date().toISOString(),
      settings,
      currentStep: 1,
      completed: false,
    });
    expect(pack.physicalStatus).toBe("untested");
    expect(pack.checklist.every((c) => c.status === "pending")).toBe(true);
    expect(pack.steps.flatMap((s) => s.placementIds)).toHaveLength(
      pack.placements.length,
    );
    expect(pack.parts.reduce((n, l) => n + l.quantity, 0)).toBe(
      pack.placements.length,
    );
    expect(pack.sources.every((s) => s.source.sha256)).toBe(true);
  });
});

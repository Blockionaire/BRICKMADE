import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { HOUSE_PRESETS, parseHouseBrief } from "../shared/house-brief";
import { createModel } from "@/domain/models";
import { BUILDER_BY_REBRICKABLE } from "@/domain/parts/profiles";
import {
  decodeCollisionShape,
  type CollisionShape,
} from "@/domain/validation/collision";
import { validateAssembly } from "@/domain/validation/assembly";
import { parseSavedState } from "@/services/project-repository";
import { regroupProject } from "@/domain/instruction-progress";
import type { GenerationSettings, Project } from "@/domain/types";
const shapes = new Map<string, CollisionShape>();
function check(settings: GenerationSettings) {
  const model = createModel(settings);
  for (const piece of model.placements) {
    const profile = BUILDER_BY_REBRICKABLE.get(piece.partId)!;
    if (!shapes.has(profile.id)) {
      const bytes = fs.readFileSync(`public${profile.collision!.file}`);
      shapes.set(
        profile.id,
        decodeCollisionShape(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        ),
      );
    }
  }
  const report = validateAssembly(model, shapes);
  expect(
    report.issues.filter((i) => i.severity === "error"),
    JSON.stringify({
      settings,
      issues: report.issues.filter((i) => i.severity === "error").slice(0, 12),
    }),
  ).toEqual([]);
  expect(report.status).toBe("passed");
  expect(report.components).toBe(1);
  expect(report.physicalStatus).toBe("untested");
  return model;
}
describe("Description-driven house compiler", () => {
  for (const preset of HOUSE_PRESETS)
    for (const size of ["compact", "standard", "large"] as const)
      for (const detail of ["easy", "normal", "hard"] as const)
        it(`${preset.id}/${size}/${detail} has clear geometry, attachments, access and exact inventory`, () => {
          const model = check({
            houseBrief: preset.brief,
            modelKind: "house",
            size,
            detail,
            buildDifficulty: "medium",
          });
          expect(model.design?.brief).toEqual(preset.brief);
        }, 60000);
  for (const aspectRatio of [0.75, 1.5, 3])
    for (const height of ["low", "standard", "tall"] as const)
      for (const roof of ["flat", "stepped"] as const)
        for (const detail of ["easy", "normal", "hard"] as const)
          it(`bounded geometry ${aspectRatio}/${height}/${roof}/${detail}`, () => {
            const houseBrief = {
              ...HOUSE_PRESETS[0].brief,
              aspectRatio,
              height,
              roof,
              frontWindows: (aspectRatio === 0.75
                ? 0
                : aspectRatio === 1.5
                  ? 1
                  : 2) as 0 | 1 | 2,
              rearWindows: height !== "low",
              chimney: height !== "standard",
              garden: roof === "stepped",
              wallColor:
                height === "low"
                  ? ("wood" as const)
                  : height === "tall"
                    ? ("white" as const)
                    : ("sand" as const),
            };
            check({
              houseBrief,
              size: "compact",
              detail,
              buildDifficulty: "hard",
            });
          }, 60000);
  it("changes geometry for different descriptions and detail levels", () => {
    const models = HOUSE_PRESETS.map((p) =>
      createModel({ houseBrief: p.brief, size: "compact", detail: "normal" }),
    );
    expect(new Set(models.map((m) => JSON.stringify(m.placements))).size).toBe(
      3,
    );
    const counts = ["easy", "normal", "hard"].map(
      (detail) =>
        createModel({
          houseBrief: HOUSE_PRESETS[0].brief,
          size: "compact",
          detail: detail as GenerationSettings["detail"],
        }).stats.pieceCount,
    );
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });
  it("preserves the exact design and completed pieces across instruction pace and storage", () => {
    const settings: GenerationSettings = {
      houseBrief: HOUSE_PRESETS[1].brief,
      designSource: "openai",
      size: "compact",
      detail: "normal",
      buildDifficulty: "easy",
    };
    const old = check(settings);
    const project: Project = {
      id: "custom",
      name: "My house",
      createdAt: "2026-10-14T00:00:00Z",
      settings,
      currentStep: 3,
      completed: false,
    };
    const updated = regroupProject(project, "hard");
    const next = check(updated.settings);
    const geometry = (model: typeof old) =>
      model.placements
        .map((p) => ({
          id: p.id,
          partId: p.partId,
          color: p.color,
          position: p.position,
          rotation: p.rotation,
          approach: p.approach,
          dependsOn: p.dependsOn,
          procedure: p.procedure,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    expect(geometry(next)).toEqual(geometry(old));
    expect(updated.completedPlacementIds).toEqual(
      old.placements.filter((p) => p.step < 3).map((p) => p.id),
    );
    const saved = parseSavedState(
      JSON.stringify({ version: 5, projects: [updated], activeId: "custom" }),
    );
    expect(saved.projects[0].settings.houseBrief).toEqual(settings.houseBrief);
    expect(createModel(saved.projects[0].settings).placements).toEqual(
      next.placements,
    );
  });
  it("rejects unsupported subjects, extra fields, nonfinite and out-of-range proportions", () => {
    for (const patch of [
      { aspectRatio: 100 },
      { aspectRatio: NaN },
      { frontWindows: 6 },
      { garden: "yes" },
      { extra: "parts" },
      { version: 2 },
    ])
      expect(() =>
        parseHouseBrief({ ...HOUSE_PRESETS[0].brief, ...patch }),
      ).toThrow();
    expect(() =>
      createModel({
        houseBrief: { ...HOUSE_PRESETS[0].brief, subject: "unsupported" },
        size: "compact",
        detail: "normal",
      }),
    ).toThrow(/simple houses/);
  });
  it("resets completed piece credit when a saved recipe was compiled by a different generator revision", () => {
    const project: Project = {
      id: "old-generated",
      name: "My house",
      createdAt: "2026-10-14",
      settings: {
        houseBrief: HOUSE_PRESETS[0].brief,
        detail: "normal",
        size: "compact",
      },
      modelRevision: "obsolete-compiler",
      currentStep: 8,
      completed: true,
      completedPlacementIds: ["piece-1"],
    };
    const saved = parseSavedState(
      JSON.stringify({ version: 5, activeId: project.id, projects: [project] }),
    ).projects[0];
    expect(saved.name).toBe(project.name);
    expect(saved.settings.houseBrief).toEqual(project.settings.houseBrief);
    expect(saved.currentStep).toBe(1);
    expect(saved.completed).toBe(false);
    expect(saved.completedPlacementIds).toBeUndefined();
    expect(saved.migrationNotice).toBe("house-generator-updated");
    expect(saved.modelRevision).toBe(createModel(saved.settings).revision);
  });
});

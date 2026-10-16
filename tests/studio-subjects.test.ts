import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { compileSubject } from "../server/compile-subject.mjs";
import {
  evaluateFidelity,
  repairDescription,
  passesFidelity,
} from "../server/design-quality.mjs";
import {
  SUBJECT_EXAMPLES,
  parseSubjectDesign,
  type SubjectDesign,
  type FlowerDesign,
  type CarDesign,
  type AnimalDesign,
} from "../shared/subject-design";
import { parseStudioArtifact } from "../shared/studio-artifact";
import { DEFAULT_STUDIO_OPTIONS, type StudioOptions } from "../shared/studio";
import { BUILDER_BY_REBRICKABLE } from "../src/domain/parts/profiles";
import { COLORS } from "../src/domain/catalog";
import { createModel } from "../src/domain/models";
import { parseSavedState } from "../src/services/project-repository";

describe("Category contracts", () => {
  it("rejects foreign categories, unexpected fields, unsupported anatomy and invalid dimensions", () => {
    expect(() => parseSubjectDesign(SUBJECT_EXAMPLES.flower, "car")).toThrow();
    expect(() =>
      parseSubjectDesign({ ...SUBJECT_EXAMPLES.car, extra: true }),
    ).toThrow();
    expect(() =>
      parseSubjectDesign({ ...SUBJECT_EXAMPLES.animal, species: "bird" }),
    ).toThrow();
    expect(() =>
      parseSubjectDesign({ ...SUBJECT_EXAMPLES.car, aspectRatio: Infinity }),
    ).toThrow();
    expect(() =>
      parseSubjectDesign({
        ...SUBJECT_EXAMPLES.free,
        components: [
          {
            name: "Outside",
            shape: "box",
            x: 15,
            y: 0,
            z: 0,
            width: 4,
            height: 2,
            depth: 2,
            color: "red",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseSubjectDesign({ ...SUBJECT_EXAMPLES.flower, title: "\u0000" }),
    ).toThrow();
  });
  it("does not replace unsupported subjects with a demonstration", async () => {
    await expect(
      compileSubject(
        { ...SUBJECT_EXAMPLES.car, subject: "unsupported" },
        { ...DEFAULT_STUDIO_OPTIONS, category: "car" },
      ),
    ).rejects.toThrow();
  });
  it("rejects free-format geometry requiring excessive support instead of filling its identity away", async () => {
    await expect(
      compileSubject(
        {
          ...SUBJECT_EXAMPLES.free,
          components: [
            {
              name: "Floating object",
              shape: "box",
              x: 4,
              y: 12,
              z: 4,
              width: 2,
              height: 2,
              depth: 2,
              color: "blue",
            },
          ],
        },
        { ...DEFAULT_STUDIO_OPTIONS, category: "free" },
      ),
    ).rejects.toThrow(/support/i);
  });
});
type Case = {
  name: string;
  description: SubjectDesign;
  options: StudioOptions;
};
const details = ["easy", "normal", "hard"] as const;
const sizes = ["compact", "standard", "large"] as const;
const paces = ["easy", "medium", "hard"] as const;
const cases: Case[] = [];
function add(name: string, description: SubjectDesign, seed: number) {
  details.forEach((detail, i) =>
    cases.push({
      name: `${name} ${detail}/${sizes[(seed + i) % 3]}/${paces[(seed + i) % 3]}`,
      description,
      options: {
        version: 1,
        category: description.category,
        detail,
        size: sizes[(seed + i) % 3],
        pace: paces[(seed + i) % 3],
      },
    }),
  );
}
for (const [i, bloomKind] of (
  ["round", "daisy", "tulip", "spike"] as const
).entries())
  for (const bloomCount of [1, 3, 5])
    add(
      `flower ${bloomKind} ${bloomCount}`,
      {
        ...(SUBJECT_EXAMPLES.flower as FlowerDesign),
        bloomKind,
        bloomCount,
        leafCount: 5,
        arrangement: bloomCount === 5 ? "row" : "cluster",
        pot: i % 2 === 0,
        bloomColor: i % 2 ? "pink" : "red",
      },
      i + bloomCount,
    );
for (const [i, bodyShape] of (
  ["coupe", "sedan", "hatchback", "suv", "van", "pickup"] as const
).entries())
  for (const aspectRatio of [1.8, 2.8])
    add(
      `car ${bodyShape} ${aspectRatio}`,
      {
        ...(SUBJECT_EXAMPLES.car as CarDesign),
        bodyShape,
        aspectRatio,
        cabinPosition: (["front", "center", "rear"] as const)[i % 3],
        bonnetLength: (["short", "medium", "long"] as const)[i % 3],
        roofRack: true,
        stripe: true,
      },
      i,
    );
for (const [i, species] of (["cat", "dog", "rabbit"] as const).entries())
  for (const pose of ["standing", "sitting"] as const)
    for (const headSize of ["small", "large"] as const)
      add(
        `animal ${species} ${pose} ${headSize}`,
        {
          ...(SUBJECT_EXAMPLES.animal as AnimalDesign),
          species,
          pose,
          headSize,
          ears:
            species === "rabbit"
              ? "long"
              : species === "cat"
                ? "pointed"
                : "small",
          tail: i === 2 ? "short" : "long",
          bodyColor: i === 1 ? "dark-stone" : "orange",
        },
        i,
      );
for (const [i, shape] of (["box", "rounded", "tapered"] as const).entries())
  add(
    `free ${shape}`,
    {
      ...SUBJECT_EXAMPLES.free,
      category: "free",
      subject: "free",
      components: [
        {
          name: "Main form",
          shape,
          x: 3,
          y: 0,
          z: 4,
          width: 10,
          height: 7,
          depth: 8,
          color: "purple",
        },
        {
          name: "Top detail",
          shape: "box",
          x: 6,
          y: 7,
          z: 6,
          width: 4,
          height: 3,
          depth: 4,
          color: "orange",
        },
      ],
    },
    i,
  );

describe("Photo-category digital construction matrix", () => {
  for (const c of cases)
    it(
      c.name,
      async () => {
        const result = await compileSubject(c.description, c.options);
        expect(
          result.validation.issues.filter(
            (i: { severity: string }) => i.severity === "error",
          ),
        ).toEqual([]);
        expect(result.validation.status).toBe("passed");
        const m = result.model;
        expect(
          m.parts.reduce(
            (n: number, p: { quantity: number }) => n + p.quantity,
            0,
          ),
        ).toBe(m.placements.length);
        expect(
          m.bags
            .flatMap((b: { parts: { quantity: number }[] }) => b.parts)
            .reduce((n: number, p: { quantity: number }) => n + p.quantity, 0),
        ).toBe(m.placements.length);
        for (const p of m.placements)
          expect(
            BUILDER_BY_REBRICKABLE.get(p.partId)!.observedColorIds,
          ).toContain(COLORS[p.color as keyof typeof COLORS].rebrickableId);
      },
      120000,
    );
});

describe("Saved subject artifacts and actual fidelity", () => {
  it("keeps completed pieces and exact geometry when instruction pace changes", () => {
    const input = {
      subjectDesign: SUBJECT_EXAMPLES.car,
      detail: "hard" as const,
      size: "compact" as const,
    };
    const models = paces.map((buildDifficulty) =>
      createModel({ ...input, buildDifficulty }),
    );
    const geometry = (m: (typeof models)[number]) =>
      m.placements.map((p) => [
        p.id,
        p.partId,
        p.color,
        p.position,
        p.rotation,
      ]);
    expect(geometry(models[1])).toEqual(geometry(models[0]));
    expect(geometry(models[2])).toEqual(geometry(models[0]));
    expect(models[0].steps.length).toBeGreaterThan(models[2].steps.length);
  });
  it("scores omitted repairs against the original requested features", async () => {
    const options = {
      ...DEFAULT_STUDIO_OPTIONS,
      category: "flower" as const,
      detail: "hard" as const,
    };
    const original = SUBJECT_EXAMPLES.flower;
    const result = await compileSubject(
      repairDescription(original, 2),
      options,
    );
    const fidelity = evaluateFidelity(original, result);
    expect(fidelity.featureRetention).toBeLessThan(0.75);
    expect(passesFidelity(original, options, fidelity)).toBe(false);
  });
  it("imports version-two animal artifacts without regenerating them or dropping saved projects", async () => {
    const options = { ...DEFAULT_STUDIO_OPTIONS, category: "animal" as const };
    const result = await compileSubject(SUBJECT_EXAMPLES.animal, options);
    const artifact = parseStudioArtifact({
      version: 2,
      jobId: randomUUID(),
      projectId: randomUUID(),
      createdAt: new Date().toISOString(),
      moduleVersion: result.model.subject!.moduleVersion,
      compilerVersion: result.model.revision,
      profileVersion: result.profileVersion,
      description: SUBJECT_EXAMPLES.animal,
      options,
      model: result.model,
      validation: result.validation,
      fidelity: result.fidelity,
      provenance: {
        model: "explicit-test-fixture",
        inputHashes: [],
        repairCount: 0,
      },
    });
    expect(() => parseStudioArtifact({ ...artifact, version: 1 })).toThrow();
    const reordered = structuredClone(artifact);
    reordered.model.settings.subjectDesign = Object.fromEntries(
      Object.entries(reordered.model.settings.subjectDesign!).reverse(),
    ) as typeof reordered.model.settings.subjectDesign;
    expect(() => parseStudioArtifact(reordered)).not.toThrow();

    for (const mutate of [
      (a: typeof artifact) => {
        a.model.subject!.features[0].retained = 99999;
      },
      (a: typeof artifact) => {
        a.model.subject!.footprintStuds[0] = NaN;
      },
      (a: typeof artifact) => {
        a.model.settings.modelKind = "house";
      },
      (a: typeof artifact) => {
        a.description.subject = "unsupported";
      },
    ]) {
      const invalid = structuredClone(artifact);
      mutate(invalid);
      expect(() => parseStudioArtifact(invalid)).toThrow();
    }

    const project = {
      id: "cloud-" + artifact.jobId,
      name: "A saved animal",
      createdAt: artifact.createdAt,
      settings: result.model.settings,
      modelRevision: result.model.revision,
      currentStep: 1,
      completed: false,
      artifact,
      cloud: {
        projectId: artifact.projectId,
        jobId: artifact.jobId,
        sha256: "a".repeat(64),
      },
    };
    const saved = parseSavedState(
      JSON.stringify({ version: 5, activeId: project.id, projects: [project] }),
    );
    expect(saved.projects.some((p) => p.id === project.id)).toBe(true);
  });
});

it("rejects multiple blooms in a single-stem interpretation", () => {
  expect(() =>
    parseSubjectDesign(
      { ...SUBJECT_EXAMPLES.flower, arrangement: "single", bloomCount: 3 },
      "flower",
    ),
  ).toThrow(/single-stem/);
});

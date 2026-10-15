import { beforeAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { compileHouse } from "../server/compile-house.mjs";
import {
  HOUSE_EXAMPLE,
  DEFAULT_STUDIO_OPTIONS,
  HOUSE_MODULE_VERSION,
} from "../shared/studio";
import { parseStudioArtifact } from "../shared/studio-artifact";
import { projectModel } from "../src/domain/project-model";
import {
  parseSavedState,
  projectRepository,
  DEMO_PROJECT,
} from "../src/services/project-repository";
let artifact;
beforeAll(async () => {
  const r = await compileHouse(HOUSE_EXAMPLE, DEFAULT_STUDIO_OPTIONS);
  artifact = {
    version: 1,
    jobId: randomUUID(),
    projectId: randomUUID(),
    createdAt: new Date().toISOString(),
    moduleVersion: HOUSE_MODULE_VERSION,
    compilerVersion: r.model.revision,
    profileVersion: r.profileVersion,
    description: HOUSE_EXAMPLE,
    options: DEFAULT_STUDIO_OPTIONS,
    model: r.model,
    validation: r.validation,
    fidelity: r.fidelity,
    provenance: {
      model: "explicit-test-fixture",
      inputHashes: [],
      repairCount: 0,
    },
  };
  expect(r.validation.status).toBe("passed");
}, 30000);
describe("Immutable design accounting", () => {
  it("background progress updates preserve the user's active build", () => {
    projectRepository.reset();
    try {
      const a = { ...DEMO_PROJECT, id: "first" },
        b = { ...DEMO_PROJECT, id: "second" };
      projectRepository.save(a);
      projectRepository.save(b);
      projectRepository.save({ ...a, currentStep: 2 }, false);
      expect(projectRepository.snapshot().activeId).toBe("second");
      expect(
        projectRepository.snapshot().projects.find((p) => p.id === "first")
          .currentStep,
      ).toBe(2);
    } finally {
      projectRepository.reset();
    }
  });
  it("accepts the exact checked native artifact", () =>
    expect(parseStudioArtifact(artifact)).toBe(artifact));
  it.each([
    ["inventory quantity", (a) => a.model.parts[0].quantity++],
    ["missing instruction piece", (a) => a.model.steps[0].placementIds.pop()],
    [
      "duplicate instruction piece",
      (a) =>
        a.model.steps[0].placementIds.push(a.model.steps[0].placementIds[0]),
    ],
    ["invalid sorting inventory", (a) => a.model.bags[0].parts[0].quantity++],
    ["mismatched detail", (a) => (a.options.detail = "hard")],
    ["nonexistent piece ID", (a) => (a.model.placements[0].id = "piece-99999")],
    [
      "invalid orientation",
      (a) => (a.model.placements[0].rotation = [0, 0, 0, 0]),
    ],
    [
      "non-finite resemblance metric",
      (a) => (a.fidelity.windowRetention = NaN),
    ],
    ["incomplete construction phases", (a) => a.model.constructionPhases.pop()],
  ])("rejects %s", (_, mutate) => {
    const a = structuredClone(artifact);
    mutate(a);
    expect(() => parseStudioArtifact(a)).toThrow();
  });
  it("keeps saved placements and piece credits across compiler revision and instruction pace changes", () => {
    const a = structuredClone(artifact);
    a.compilerVersion = "private-frozen-version";
    a.model.revision = a.compilerVersion;
    const project = {
      id: "cloud-" + a.jobId,
      name: a.description.title,
      createdAt: a.createdAt,
      settings: a.model.settings,
      artifact: a,
      cloud: { projectId: a.projectId, jobId: a.jobId, sha256: "a".repeat(64) },
      modelRevision: a.compilerVersion,
      currentStep: 2,
      completed: false,
      completedPlacementIds: a.model.steps[0].placementIds,
    };
    const saved = parseSavedState(
      JSON.stringify({ version: 5, projects: [project], activeId: project.id }),
    ).projects[0];
    expect(saved.artifact.compilerVersion).toBe("private-frozen-version");
    expect(saved.completedPlacementIds).toEqual(project.completedPlacementIds);
    const original = projectModel(saved),
      small = projectModel({
        ...saved,
        settings: { ...saved.settings, buildDifficulty: "easy" },
      });
    const geometry = (m) =>
      m.placements
        .map((p) => [p.id, p.partId, p.color, p.position, p.rotation])
        .sort((a, b) => a[0].localeCompare(b[0]));
    expect(geometry(small)).toEqual(geometry(original));
    expect(small.parts).toEqual(original.parts);
    expect(small.steps.length).toBeGreaterThan(original.steps.length);
  });
});

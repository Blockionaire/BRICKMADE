import type { HouseModel } from "../src/domain/types";
import type { ValidationReport } from "../src/domain/validation/assembly";
import {
  parseHouseDesign,
  parseStudioOptions,
  type HouseDesign,
  type StudioOptions,
} from "./studio";
export interface StudioArtifact {
  version: 1;
  jobId: string;
  projectId: string;
  createdAt: string;
  moduleVersion: string;
  compilerVersion: string;
  profileVersion: string;
  description: HouseDesign;
  options: StudioOptions;
  model: HouseModel;
  validation: ValidationReport;
  fidelity: {
    aspectRatioError: number;
    windowRetention: number;
    method: "feature-consistency";
    notes: string[];
  };
  provenance: { model: string; inputHashes: string[]; repairCount: number };
}
/** Validate untrusted artifact structure and exact placement/instruction/inventory accounting. */
export function parseStudioArtifact(value: unknown): StudioArtifact {
  if (!value || typeof value !== "object")
    throw Error("The saved design is invalid.");
  const a = value as StudioArtifact;
  if (
    a.version !== 1 ||
    typeof a.jobId !== "string" ||
    typeof a.projectId !== "string" ||
    typeof a.compilerVersion !== "string" ||
    !a.moduleVersion ||
    !a.profileVersion ||
    !Number.isFinite(Date.parse(a.createdAt))
  )
    throw Error("The design version is not supported.");
  parseHouseDesign(a.description);
  parseStudioOptions(a.options);
  const m = a.model;
  if (
    !m ||
    m.revision !== a.compilerVersion ||
    !m.settings ||
    !Array.isArray(m.placements) ||
    m.placements.length < 1 ||
    m.placements.length > 5000 ||
    !Array.isArray(m.steps) ||
    !m.steps.length ||
    m.steps.length > 5000 ||
    !Array.isArray(m.parts) ||
    !Array.isArray(m.bags) ||
    !m.stats ||
    !Array.isArray(m.constructionPhases)
  )
    throw Error("The design geometry is incomplete.");
  if (
    a.validation?.status !== "passed" ||
    a.validation.physicalStatus !== "untested" ||
    a.validation.pieceCount !== m.placements.length ||
    m.stats.pieceCount !== m.placements.length
  )
    throw Error("This design has not passed its digital checks.");
  const pieces = new Map(m.placements.map((p) => [p.id, p]));
  if (pieces.size !== m.placements.length)
    throw Error("The design has duplicate piece IDs.");
  const inventory = new Map<string, number>();
  for (const p of m.placements) {
    if (
      !/^piece-\d+$/.test(p.id) ||
      typeof p.partId !== "string" ||
      typeof p.color !== "string" ||
      !Array.isArray(p.position) ||
      p.position.length !== 3 ||
      p.position.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000) ||
      !p.rotation ||
      p.rotation.length !== 4 ||
      p.rotation.some((n) => !Number.isFinite(n)) ||
      !Number.isInteger(p.step)
    )
      throw Error("The design has an invalid placement.");
    const k = p.partId + ":" + p.color;
    inventory.set(k, (inventory.get(k) || 0) + 1);
  }
  function checkInventory(
    list: HouseModel["parts"],
    expected: Map<string, number>,
  ) {
    const actual = new Map<string, number>();
    for (const p of list) {
      if (!Number.isInteger(p.quantity) || p.quantity < 1)
        throw Error("The inventory is invalid.");
      const k = p.partId + ":" + p.color;
      if (actual.has(k)) throw Error("Duplicate inventory rows.");
      actual.set(k, p.quantity);
    }
    if (
      actual.size !== expected.size ||
      [...expected].some(([k, n]) => actual.get(k) !== n)
    )
      throw Error("The inventory does not match the actual bricks.");
  }
  checkInventory(m.parts, inventory);
  if (m.stats.uniquePartCount !== inventory.size)
    throw Error("The part count is inconsistent.");
  const seen = new Set<string>();
  for (const [i, step] of m.steps.entries()) {
    if (
      step.number !== i + 1 ||
      !Array.isArray(step.placementIds) ||
      !step.placementIds.length ||
      !Array.isArray(step.parts) ||
      typeof step.title !== "string" ||
      typeof step.description !== "string" ||
      !Array.isArray(step.focus) ||
      step.focus.length !== 3 ||
      step.focus.some((n) => !Number.isFinite(n))
    )
      throw Error("The instructions are incomplete.");
    const counts = new Map<string, number>();
    for (const id of step.placementIds) {
      const p = pieces.get(id);
      if (!p || seen.has(id) || p.step !== step.number)
        throw Error("Instruction piece references are inconsistent.");
      seen.add(id);
      const k = p.partId + ":" + p.color;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    checkInventory(step.parts, counts);
  }
  if (seen.size !== pieces.size)
    throw Error("Some bricks are missing from the instructions.");
  const phaseIds = m.constructionPhases.flatMap((p) => p.placementIds);
  if (
    phaseIds.length !== pieces.size ||
    new Set(phaseIds).size !== pieces.size ||
    phaseIds.some((id) => !pieces.has(id))
  )
    throw Error("The construction phases are inconsistent.");
  const bagSteps = new Set<number>();
  for (const bag of m.bags) {
    const counts = new Map<string, number>();
    for (const step of m.steps.filter((s) => s.bag === bag.number)) {
      if (bagSteps.has(step.number)) throw Error("Duplicate sorting bags.");
      bagSteps.add(step.number);
      for (const id of step.placementIds) {
        const p = pieces.get(id)!;
        const k = p.partId + ":" + p.color;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    checkInventory(bag.parts, counts);
  }
  if (bagSteps.size !== m.steps.length)
    throw Error("The sorting bags are incomplete.");
  return a;
}

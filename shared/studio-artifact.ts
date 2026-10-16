import type { HouseModel } from "../src/domain/types";
import type { ValidationReport } from "../src/domain/validation/assembly";
import { parseStudioOptions, type StudioOptions } from "./studio";
import {
  parseDesignDescription,
  type DesignDescription,
} from "./design-description";
export interface StudioArtifact {
  version: 1 | 2;
  jobId: string;
  projectId: string;
  createdAt: string;
  moduleVersion: string;
  compilerVersion: string;
  profileVersion: string;
  description: DesignDescription;
  options: StudioOptions;
  model: HouseModel;
  validation: ValidationReport;
  fidelity: {
    aspectRatioError: number | null;
    windowRetention?: number;
    featureRetention?: number;
    method: "feature-consistency";
    notes: string[];
  };
  provenance: {
    model: string;
    inputHashes: string[];
    repairCount: number;
    parentJobId?: string;
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)]),
    );
  return value;
}
/** Validate untrusted artifact structure and exact placement/instruction/inventory accounting. */
export function parseStudioArtifact(value: unknown): StudioArtifact {
  if (!value || typeof value !== "object")
    throw Error("The saved design is invalid.");
  const a = value as StudioArtifact;
  if (
    ![1, 2].includes(a.version) ||
    typeof a.jobId !== "string" ||
    typeof a.projectId !== "string" ||
    typeof a.compilerVersion !== "string" ||
    !a.moduleVersion ||
    !a.profileVersion ||
    !Number.isFinite(Date.parse(a.createdAt))
  )
    throw Error("The design version is not supported.");
  parseStudioOptions(a.options);
  if (a.version === 1 && a.options.category !== "house")
    throw Error("This artifact version only supports House designs.");
  if (
    parseDesignDescription(a.description, a.options.category).subject !==
    a.options.category
  )
    throw Error("An unsupported interpretation cannot be a completed design.");
  const m = a.model;
  const metadata = a.options.category === "house" ? m?.studio : m?.subject;
  if (a.options.category !== "house") {
    if (!m?.subject || m.subject.description.category !== a.options.category)
      throw Error("The saved category model is inconsistent.");
    parseDesignDescription(m.subject.description, a.options.category);
    const expectedKind = {
      car: "rover",
      flower: "plant",
      animal: "animal",
      free: "sculpture",
    }[a.options.category];
    if (
      !m.settings?.subjectDesign ||
      JSON.stringify(
        canonical(
          parseDesignDescription(m.settings.subjectDesign, a.options.category),
        ),
      ) !== JSON.stringify(canonical(m.subject.description)) ||
      m.settings.modelKind !== expectedKind ||
      m.kind !== expectedKind ||
      m.subject.description.subject !== a.options.category ||
      m.subject.moduleVersion !== a.moduleVersion ||
      !Array.isArray(m.subject.footprintStuds) ||
      m.subject.footprintStuds.length !== 2 ||
      m.subject.footprintStuds.some((n) => !Number.isFinite(n) || n <= 0) ||
      !Array.isArray(m.subject.features) ||
      !m.subject.features.length ||
      m.subject.features.length > 20 ||
      m.subject.features.some(
        (f) =>
          typeof f.name !== "string" ||
          !f.name.trim() ||
          f.name.length > 80 ||
          !Number.isSafeInteger(f.requested) ||
          !Number.isSafeInteger(f.retained) ||
          f.requested < 0 ||
          f.requested > 5000 ||
          f.retained < 0 ||
          f.retained > f.requested,
      )
    )
      throw Error("The saved category metadata is invalid.");
  }
  if (
    !m ||
    m.revision !== a.compilerVersion ||
    !m.settings ||
    m.settings.detail !== a.options.detail ||
    m.settings.size !== a.options.size ||
    m.settings.buildDifficulty !== a.options.pace ||
    !metadata ||
    !Array.isArray(metadata.adaptations) ||
    metadata.adaptations.some((n) => typeof n !== "string") ||
    !a.provenance ||
    typeof a.provenance.model !== "string" ||
    !Array.isArray(a.provenance.inputHashes) ||
    a.provenance.inputHashes.some((h) => !/^[a-f0-9]{64}$/.test(h)) ||
    !Number.isInteger(a.provenance.repairCount) ||
    a.provenance.repairCount < 0 ||
    a.provenance.repairCount > 2 ||
    a.fidelity?.method !== "feature-consistency" ||
    (!(a.version === 2 && a.fidelity.aspectRatioError === null) &&
      (!Number.isFinite(a.fidelity.aspectRatioError) ||
        a.fidelity.aspectRatioError! < 0)) ||
    (a.options.category === "house" &&
      (!Number.isFinite(a.fidelity.windowRetention) ||
        a.fidelity.windowRetention! < 0 ||
        a.fidelity.windowRetention! > 1)) ||
    (a.options.category !== "house" &&
      (!Number.isFinite(a.fidelity.featureRetention) ||
        a.fidelity.featureRetention! < 0 ||
        a.fidelity.featureRetention! > 1)) ||
    !Array.isArray(a.fidelity.notes) ||
    a.fidelity.notes.some((n) => typeof n !== "string") ||
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
      !/^piece-[1-9][0-9]*$/.test(p.id) ||
      Number(p.id.slice(6)) > m.placements.length ||
      typeof p.partId !== "string" ||
      typeof p.color !== "string" ||
      !Array.isArray(p.position) ||
      p.position.length !== 3 ||
      p.position.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000) ||
      !p.rotation ||
      p.rotation.length !== 4 ||
      p.rotation.some((n) => !Number.isFinite(n)) ||
      Math.abs(Math.hypot(...p.rotation) - 1) > 0.001 ||
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

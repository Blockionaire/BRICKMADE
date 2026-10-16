import { CATALOG, COLORS } from "../catalog";
import { BUILDER_BY_REBRICKABLE, PROFILE_VERSION } from "../parts/profiles";
import { projectModel } from "../project-model";
import type { HouseModel, Project } from "../types";
import {
  shoppingReadiness,
  exportBrickLinkWantedList,
  type SourcingLine,
} from "./shopping-list";
import providerData from "../../../data/catalog/purchase-mappings.json" with { type: "json" };

export interface ProviderMapping {
  rebrickablePartId: string;
  rebrickableColorId: number;
  provider: "bricklink";
  providerPartId: string;
  providerColorId: number;
  status: "verified" | "unverified" | "ambiguous";
  evidence: string;
}
export function prepareBuildHandoff(
  model: HouseModel,
  mappings: readonly ProviderMapping[] = providerData.mappings,
) {
  const lines = model.parts.map((line) => {
    const profile = BUILDER_BY_REBRICKABLE.get(line.partId),
      color = COLORS[line.color];
    const matches = mappings.filter(
      (m) =>
        m.provider === "bricklink" &&
        m.rebrickablePartId === profile?.rebrickableId &&
        m.rebrickableColorId === color.rebrickableId,
    );
    const mapping = matches.length === 1 ? matches[0] : undefined;
    const source: SourcingLine = {
      partId: line.partId,
      quantity: line.quantity,
      condition: "N",
      partColorVerified: Boolean(
        profile?.observedColorIds.includes(color.rebrickableId),
      ),
      ...(mapping
        ? {
            brickLink: {
              partId: mapping.providerPartId,
              colorId: mapping.providerColorId,
              status: mapping.status,
              evidence: mapping.evidence,
            },
          }
        : {}),
    };
    return {
      ...line,
      ldrawId: profile?.id || "",
      rebrickablePartId: profile?.rebrickableId || "",
      rebrickableColorId: color.rebrickableId,
      colorName: color.sourceName,
      name: CATALOG[line.partId].name,
      source,
      mappingStatus:
        matches.length > 1 ? "ambiguous" : mapping?.status || "missing",
    };
  });
  const readiness = shoppingReadiness(lines.map((l) => l.source));
  const cell = (value: unknown) => {
    // Quoting alone does not stop spreadsheet formulas in user-controlled labels.
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [
    [
      "LDraw part ID",
      "Rebrickable part ID",
      "Part name",
      "Rebrickable color ID",
      "Source color name",
      "Quantity",
      "Observed part/color",
      "BrickLink mapping",
    ],
    ...lines.map((l) => [
      l.ldrawId,
      l.rebrickablePartId,
      l.name,
      l.rebrickableColorId,
      l.colorName,
      l.quantity,
      l.source.partColorVerified ? "yes" : "unverified",
      l.mappingStatus,
    ]),
  ];
  return {
    lines,
    readiness,
    totalPieces: lines.reduce((n, l) => n + l.quantity, 0),
    csv: rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n",
    xml: readiness.ready
      ? exportBrickLinkWantedList(lines.map((l) => l.source))
      : null,
  };
}
export function physicalTestPack(project: Project) {
  const model = projectModel(project),
    handoff = prepareBuildHandoff(model);
  const partIds = [...new Set(model.parts.map((p) => p.partId))];
  return {
    version: 1,
    kind: "brickmade-physical-test-pack",
    createdAt: new Date().toISOString(),
    projectName: project.name,
    artifactSha256: project.cloud?.sha256 || null,
    compilerRevision: model.revision,
    profileVersion: project.artifact?.profileVersion || PROFILE_VERSION,
    instructionPace: model.settings.buildDifficulty || "medium",
    physicalStatus: "untested",
    digitalValidation: project.artifact?.validation || null,
    limitations: [
      "A digital pass does not certify physical fit, clutch, stability, access or strength.",
      "This pack is not a purchase, stock guarantee or parts substitution approval.",
      "Record results for this exact design and instruction pace; design changes require a new test.",
    ],
    checklist: [
      {
        id: "identity",
        instruction:
          "Check the exact mold, color and quantities against the full BOM. Record any differences before building.",
        status: "pending",
      },
      {
        id: "fit",
        instruction:
          "Build every connection without forcing it. Record piece IDs, step and photos of any alignment or fit problem.",
        status: "pending",
      },
      {
        id: "access",
        instruction:
          "Follow the saved order. Confirm every piece can be inserted without removing earlier pieces; record inaccessible placements.",
        status: "pending",
      },
      {
        id: "clutch",
        instruction:
          "Check that connected subassemblies stay attached during ordinary gentle handling. Record loose or overly tight connections.",
        status: "pending",
      },
      {
        id: "stability",
        instruction:
          "Check standing balance on a level surface and normal careful handling. Record tipping, unsupported areas or sagging.",
        status: "pending",
      },
      {
        id: "instructions",
        instruction:
          "Have another tester follow the selected instruction pace. Record ambiguous orientation, visibility and incorrect bag totals.",
        status: "pending",
      },
      {
        id: "likeness",
        instruction:
          "Compare the built model with all input views. Rate silhouette, proportions, distinctive features and colors separately.",
        status: "pending",
      },
    ],
    bomCsv: handoff.csv,
    providerReadiness: handoff.readiness,
    parts: model.parts,
    bags: model.bags,
    steps: model.steps,
    placements: model.placements,
    sources: partIds.map((id) => {
      const p = BUILDER_BY_REBRICKABLE.get(id)!;
      return {
        ldrawId: p.id,
        rebrickableId: p.rebrickableId,
        source: p.source,
        geometrySha256: p.geometrySha256,
        admission: p.admission,
        coverage: p.coverage,
        unknownMechanisms: p.unknownMechanisms,
      };
    }),
    artifact: project.artifact || null,
    tester: { name: "", date: "", notes: "", failures: [] },
  };
}

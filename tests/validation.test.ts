import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { BUILDER_PARTS } from "@/domain/parts/profiles";
import {
  decodeCollisionShape,
  collisionInstance,
  collisionPoint,
} from "@/domain/validation/collision";
import { validateAssembly } from "@/domain/validation/assembly";
import { createHouse as oldHouse } from "@/domain/legacy-house";
import { createModel } from "@/domain/models";
import { countParts } from "@/domain/inventory";
import { placementPose } from "@/domain/model-pose";
import type { HouseModel, Placement } from "@/domain/types";
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
const base = () =>
  structuredClone(createModel({ detail: "normal", size: "compact" }));
const codes = (model: HouseModel) =>
  validateAssembly(model, shapes)
    .issues.filter((i) => i.severity === "error")
    .map((i) => i.code);
function fixture(source: Placement[]): HouseModel {
  const placements = source.map((p, i) => ({ ...p, step: i + 1 })),
    parts = countParts(placements);
  return {
    ...base(),
    placements,
    parts,
    steps: placements.map((p, i) => ({
      number: i + 1,
      title: "Fixture",
      bag: 1,
      parts: countParts([p]),
      placementIds: [p.id],
      phaseNumber: 1,
      cluster: i + 1,
      clusters: placements.length,
      area: "Fixture",
      suggestedView: "perspective",
      focus: p.position,
      description: "Fixture",
      hint: "Fixture",
    })),
    bags: [
      {
        number: 1,
        name: "Fixture",
        firstStep: 1,
        lastStep: placements.length,
        parts,
      },
    ],
    stats: {
      ...base().stats,
      pieceCount: placements.length,
      uniquePartCount: parts.length,
    },
  };
}
const piece = (
  id: string,
  partId: string,
  position: Placement["position"],
): Placement => ({
  id,
  partId,
  position,
  color: "stone",
  rotated: false,
  step: 1,
});
describe("Assembly solver rejects broken engineering, rather than only testing its templates", () => {
  it("catches the obsolete home's floating groups and disconnected foundation", () => {
    const result = codes(oldHouse({ detail: "normal", size: "compact" }));
    expect(result).toContain("floating-component");
    expect(result).toContain("disconnected-build");
  }, 15000);
  it("allows real hollow stud seating despite overlapping surface envelopes", () => {
    const model = fixture([
      piece("base", "3022", [0, 0.2, 0]),
      piece("brick", "3005", [-0.5, 1, -0.5]),
    ]);
    expect(validateAssembly(model, shapes).status).toBe("passed");
  });
  it("catches complete containment, duplicate pieces competing for sockets, and solid interference", () => {
    const model = fixture([
      piece("base", "3022", [0, 0.2, 0]),
      piece("a", "3005", [-0.5, 1, -0.5]),
      piece("b", "3005", [-0.5, 1, -0.5]),
    ]);
    expect(codes(model)).toContain("solid-collision");
    expect(codes(model)).toContain("floating-component");
  });
  it("rejects attachment to a smooth tile", () => {
    const model = fixture([
      piece("tile", "3068b", [0, 0.2, 0]),
      piece("brick", "3005", [-0.5, 1, -0.5]),
    ]);
    expect(codes(model)).toContain("floating-component");
  });
  it("catches a roof that blocks a later brick although the final geometry is seated and collision-free", () => {
    const model = fixture([
      piece("base", "3022", [0, 0.2, 0]),
      piece("left", "3005", [-0.5, 1, -0.5]),
      piece("cap", "3022", [0, 1.8, 0]),
      piece("right", "3005", [0.5, 1, 0.5]),
    ]);
    const result = codes(model);
    expect(result).not.toContain("solid-collision");
    expect(result).toContain("blocked-insertion");
    model.steps = [
      {
        ...model.steps[0],
        placementIds: model.placements.map((p) => p.id),
        parts: model.parts,
      },
    ];
    model.placements.forEach((p) => (p.step = 1));
    model.bags[0].lastStep = 1;
    expect(codes(model)).toContain("blocked-insertion"); // same-step order is also audited
  });
  it("audits access for a late ground-supported piece underneath an existing roof", () => {
    const model = fixture([
      piece("left", "3003", [0, 0.6, 0]),
      piece("roof", "3031", [1, 1.4, 0]),
      piece("late-root", "3003", [2, 0.6, 0]),
    ]);
    const report = validateAssembly(model, shapes);
    expect(report.components).toBe(1);
    expect(report.issues.some((i) => i.code === "solid-collision")).toBe(false);
    expect(
      report.issues.some(
        (i) => i.code === "blocked-insertion" && i.pieceIds[0] === "late-root",
      ),
    ).toBe(true);
  });
  it("fails missing anchors and declared dependencies, including reversed same-step order", () => {
    const model = fixture([
      piece("base", "3022", [0, 0.2, 0]),
      piece("brick", "3005", [-0.5, 1, -0.5]),
    ]);
    model.steps = [
      {
        ...model.steps[0],
        placementIds: ["brick", "base"],
        parts: model.parts,
      },
    ];
    model.placements.forEach((p) => (p.step = 1));
    model.bags[0].lastStep = 1;
    expect(codes(model)).toContain("unsupported-step");
  });
  it.each([
    "parts",
    "step",
    "bag",
    "duplicate",
    "color",
    "unknown",
    "pose",
    "off-grid",
  ])("rejects %s corruption", (kind) => {
    const model = base();
    if (kind === "parts") model.parts[0].quantity++;
    if (kind === "step") model.steps[0].placementIds.pop();
    if (kind === "bag") model.bags[0].lastStep--;
    if (kind === "duplicate") model.placements[1].id = model.placements[0].id;
    if (kind === "color")
      model.placements.find((p) => p.partId === "30176")!.color = "glass";
    if (kind === "unknown") model.placements[0].partId = "999999";
    if (kind === "pose") model.placements[0].rotation = [0, 0, 0, 2];
    if (kind === "off-grid") model.placements[0].position[0] += 0.013;
    expect(validateAssembly(model, shapes).status).toBe("failed");
  });
  it("requires explicit manual window instructions and never reports physical certification", () => {
    const model = base();
    const step = model.steps.find((s) => s.procedures?.length)!;
    step.procedures = [];
    expect(codes(model)).toContain("missing-procedure");
    expect(validateAssembly(base(), shapes).physicalStatus).toBe("untested");
    expect(validateAssembly(base()).status).toBe("pending");
  });
});
describe("Checked collision evidence", () => {
  it("matches every source mesh, checksum, bit count and SQL profile", () => {
    for (const part of BUILDER_PARTS) {
      const data = part.collision!,
        raw = fs.readFileSync(`public${data.file}`);
      expect(createHash("sha256").update(raw).digest("hex")).toBe(data.sha256);
      expect(raw.byteLength).toBe(data.bytes);
      expect(shapes.get(part.id)!.occupiedCells).toBe(data.occupiedCells);
      expect(data.resolution).toBe(0.05);
      expect(data.meshSha256).toBe(part.mesh.sha256);
    }
  });
  it("retains exact reviewed profiles and recorded color evidence in SQLite", () => {
    const result = spawnSync(
      "python3",
      [
        "-c",
        `import json,sqlite3
from pathlib import Path
parts={p['id']:p for p in json.loads(Path('public/catalog/builder-parts.json').read_text())['parts']}
db=sqlite3.connect('public/catalog/brickmade.sqlite')
rows=db.execute('SELECT ldraw_id,profile_json FROM builder_parts').fetchall()
assert len(rows)==47
for ident,profile in rows:
 p=json.loads(profile)
 assert p==parts[ident],ident
 observed=[r[0] for r in db.execute('SELECT color_id FROM rb_part_color_observations WHERE part_num=? ORDER BY color_id',(p['rebrickableId'],))]
 assert observed==p['observedColorIds'],ident
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
print('matched')`,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("matched");
  });
  it("rejects truncation, corrupt headers and nonzero padding bits", () => {
    const raw = fs.readFileSync(`public${BUILDER_PARTS[0].collision!.file}`);
    const bytes = raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    );
    expect(() => decodeCollisionShape(bytes.slice(0, -1))).toThrow();
    new DataView(bytes).setUint32(0, 0, true);
    expect(() => decodeCollisionShape(bytes)).toThrow();
    const pad = new ArrayBuffer(37),
      view = new DataView(pad);
    view.setUint32(0, 0x31585642, true);
    view.setUint32(4, 1, true);
    view.setFloat32(8, 0.05, true);
    [24, 28, 32].forEach((i) => view.setUint32(i, 1, true));
    new Uint8Array(pad)[36] = 129;
    expect(() => decodeCollisionShape(pad)).toThrow(/padding/);
  });
  it("never fills a rounded part outside its source bounding surface", () => {
    const pot = collisionInstance(
      placementPose(piece("pot", "3941", [0, 1.4, 0])),
      shapes.get("3941")!,
    )!;
    const plate = collisionInstance(
      placementPose(piece("plate", "3022", [0, 0.6, 0])),
      shapes.get("3022")!,
    )!;
    expect(collisionPoint(pot, plate)).toBeUndefined();
  });
});

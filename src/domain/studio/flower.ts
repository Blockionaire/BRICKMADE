import type { ColorId, GenerationSettings, HouseModel } from "../types";
import type { FlowerTraits, SculptDesign } from "../../../shared/sculpt-design";
import { sampleViews, silhouettes, type CarvedShape } from "./views";
import { VoxelShape } from "./voxel";
import { assembleShape } from "./sculpt";
import type { FixedPiece } from "./finish";

type Features = NonNullable<HouseModel["subject"]>["features"];
const ROUND_BLOOMS = ["rose", "tulip", "cup", "cluster", "spike"];
/**
 * Leaf parts seated on a stem stud: local +z points away from the stem. Footprints are
 * every stud cell the source mesh bounds touch, so leaves never clip their neighbours.
 */
const footprintCells = (x0: number, x1: number, z0: number, z1: number) => {
  const cells: [number, number][] = [];
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) if (x || z) cells.push([x, z]);
  return cells;
};
const LEAVES = {
  "2423": { cells: footprintCells(-1, 1, 0, 3) },
  "2417": { cells: footprintCells(-2, 2, -2, 3) },
} as const;
const TURN_FOR = (dx: number, dz: number) =>
  dz > 0 ? 0 : dx > 0 ? 1 : dz < 0 ? 2 : 3;
const rotate = (
  [lx, lz]: readonly number[],
  turns: number,
): [number, number] => {
  // quarterTurn(1) maps local +z to world +x and local +x to world -z.
  let x = lx,
    z = lz;
  for (let i = 0; i < turns; i++) [x, z] = [z, -x];
  return [x, z];
};

/**
 * Botanical builder: a carved container, straight stems of round bricks, real leaf
 * elements seated on the stems, and bloom heads carved from the front view (flat
 * blooms) or as small volumes (cups, roses, spikes).
 */
export function buildFlower(
  design: SculptDesign,
  reference: NonNullable<SculptDesign["reference"]>,
  settings: GenerationSettings,
  level: {
    span: number;
    colors: number;
    brickHeights: boolean;
    slopes: boolean;
    tiles: boolean;
    parts: boolean;
  },
) {
  const t = design.traits as FlowerTraits;
  const allowed = [
    ...new Set([
      t.bloomColor,
      t.centerColor,
      t.leafColor,
      t.stemColor,
      t.containerColor,
      ...design.palette.map((p) => p.color),
      "dark-brown" as ColorId,
    ]),
  ];
  const sampled = sampleViews(reference.views, {
    span: level.span,
    colors: Math.max(level.colors, 5),
    allowedColors: allowed,
    keepColors: [t.bloomColor, t.leafColor, t.containerColor],
    section: "round",
    spanIncludesHeight: true,
    brickHeights: false,
    minimumStuds: 6,
  });
  const { width: W, depth: D, heightPlates: H, front, side } = sampled;
  const grid = new VoxelShape();
  const notes: string[] = [];
  const features = reference.features;
  const rowOf = (v: number) =>
    Math.min(H - 1, Math.max(0, Math.round((1 - v) * H)));
  const colOf = (u: number, n: number) =>
    Math.min(n - 1, Math.max(0, Math.floor(u * n)));
  // 1. Container: carve the rows the located pot occupies, with a round cross-section.
  const pot = features.find((f) => f.kind === "pot" && f.view === "front");
  const hasContainer = t.container !== "none";
  const potTop = hasContainer
    ? pot
      ? rowOf(pot.box[1])
      : Math.round(H * 0.32)
    : 0;
  const potColor = t.containerColor;
  if (hasContainer) {
    for (let y = 0; y < potTop; y++) {
      const fx = front[y].map((c, x) => (c ? x : -1)).filter((x) => x >= 0);
      const sz = side[y].map((c, z) => (c ? z : -1)).filter((z) => z >= 0);
      if (!fx.length || !sz.length) continue;
      // Restrict to the pot's own columns when it is narrower than the foliage.
      const px0 = pot ? colOf(pot.box[0], W) : Math.min(...fx),
        px1 = pot ? colOf(pot.box[2], W) : Math.max(...fx);
      const x0 = Math.max(Math.min(...fx), px0),
        x1 = Math.min(Math.max(...fx), px1);
      const sidePot = features.find(
        (f) => f.kind === "pot" && f.view === "side",
      );
      const z0 = sidePot ? colOf(sidePot.box[0], D) : Math.min(...sz),
        z1 = sidePot ? colOf(sidePot.box[2], D) : Math.max(...sz);
      const cx = (x0 + x1 + 1) / 2,
        cz = (z0 + z1 + 1) / 2,
        rx = (x1 - x0 + 1) / 2,
        rz = (z1 - z0 + 1) / 2;
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++)
          if (((x + 0.5 - cx) / rx) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1.05) {
            const c = front[y][x];
            const color =
              y === potTop - 1 && t.container !== "vase"
                ? "dark-brown"
                : c && c !== t.leafColor && c !== t.bloomColor
                  ? c
                  : potColor;
            grid.set(x, y, D - 1 - z, color);
          }
    }
  }
  const potCells = [...grid.cells.values()].filter((v) => v.y === potTop - 1);
  const inPot = (x: number, z: number) =>
    !hasContainer || potCells.some((v) => v.x === x && v.z === z);
  // 2. Blooms, located on the front view and matched to the side view by height.
  const frontBlooms = features.filter(
    (f) => f.kind === "bloom" && f.view === "front",
  );
  const sideBlooms = features.filter(
    (f) => f.kind === "bloom" && f.view === "side",
  );
  const blooms = frontBlooms.slice(0, 12).map((f, i) => {
    const v = (f.box[1] + f.box[3]) / 2;
    const match = sideBlooms
      .map((s) => ({ s, d: Math.abs((s.box[1] + s.box[3]) / 2 - v) }))
      .sort((a, b) => a.d - b.d)[0]?.s;
    const zView = match
      ? (match.box[0] + match.box[2]) / 2
      : 0.35 + (i % 3) * 0.15;
    return {
      x0: colOf(f.box[0], W),
      x1: colOf(f.box[2], W),
      y0: rowOf(f.box[3]),
      y1: rowOf(f.box[1]),
      z: D - 1 - colOf(zView, D),
      color: f.color ?? t.bloomColor,
      center: f.secondaryColor ?? t.centerColor,
    };
  });
  if (!blooms.length) {
    // Without located blooms, place the counted blooms evenly above the container.
    for (let i = 0; i < Math.min(t.bloomCount, 5); i++) {
      const cx = Math.round(((i + 1) * W) / (Math.min(t.bloomCount, 5) + 1));
      blooms.push({
        x0: cx - 1,
        x1: cx + 1,
        y0: H - 8,
        y1: H - 1,
        z: Math.floor(D / 2),
        color: t.bloomColor,
        center: t.centerColor,
      });
    }
    notes.push(
      "Bloom positions were estimated because they could not be located on the views.",
    );
  }
  const potXs = potCells.map((v) => v.x),
    potZs = potCells.map((v) => v.z);
  const stems: { x: number; z: number; top: number }[] = [];
  const round = ROUND_BLOOMS.includes(t.bloomForm);
  for (const b of blooms) {
    let cx = Math.round((b.x0 + b.x1) / 2),
      cz = b.z;
    // Straight stems must rise from the soil: pull blooms over the container.
    if (hasContainer && potCells.length) {
      cx = Math.max(
        Math.min(...potXs) + 1,
        Math.min(Math.max(...potXs) - 1, cx),
      );
      cz = Math.max(
        Math.min(...potZs) + 1,
        Math.min(Math.max(...potZs) - 1, cz),
      );
    }
    const shift = cx - Math.round((b.x0 + b.x1) / 2);
    const rx = Math.max(1, (b.x1 - b.x0 + 1) / 2),
      ry = Math.max(1.5, (b.y1 - b.y0 + 1) / 2);
    const cy = (b.y0 + b.y1 + 1) / 2;
    const bottom = Math.max(potTop + 4, b.y0);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx - 0.5) / rx,
          v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1 || y < bottom || x < 0) continue;
        const inner = u * u + v * v < 0.3;
        if (round) {
          for (let dz = -Math.floor(rx); dz <= Math.floor(rx); dz++) {
            const w = (dz / Math.max(1, rx)) ** 2;
            if (u * u + v * v + w <= 1) grid.set(x, y, cz + dz, b.color);
          }
        } else {
          const sampledColor = front[y]?.[x - shift];
          grid.set(
            x,
            y,
            cz,
            inner
              ? b.center
              : sampledColor === b.color || sampledColor === b.center
                ? sampledColor
                : b.color,
          );
          if (rx >= 2 && !inner) grid.set(x, y, cz - 1, b.color);
        }
      }
    const lowest = [...grid.cells.values()]
      .filter((c) => c.x === cx && c.z === cz && c.y >= potTop)
      .reduce((m, c) => Math.min(m, c.y), Infinity);
    if (!Number.isFinite(lowest)) continue;
    for (let y = potTop; y < lowest; y++) grid.set(cx, y, cz, t.stemColor);
    stems.push({ x: cx, z: cz, top: lowest });
  }
  if (!stems.length) throw Error("No bloom could be connected to a stem.");
  if (!inPot(stems[0].x, stems[0].z))
    notes.push("Some stems stand beside the container.");
  // 3. Leaves: real leaf elements seated on the stems where the views show foliage.
  const leaves = level.parts
    ? features
        .filter((f) => f.kind === "leaf" && f.view === "front")
        .slice(0, 10)
    : [];
  const shape: CarvedShape = {
    grid,
    width: W,
    depth: D,
    heightPlates: H,
    originX: -Math.floor(W / 2),
    originZ: -Math.floor(D / 2),
    colors: [...new Set([...grid.cells.values()].map((v) => v.color))],
    supportCells: 0,
    removedCells: 0,
    targets: silhouettes(front, side, D),
  };
  let placedLeaves = 0;
  const planLeaves = (g: VoxelShape): FixedPiece[] => {
    const pieces: FixedPiece[] = [];
    const taken = new Set<string>();
    leaves.forEach((leaf, i) => {
      const lx = ((leaf.box[0] + leaf.box[2]) / 2) * W,
        ly = rowOf((leaf.box[1] + leaf.box[3]) / 2);
      const stem = [...stems].sort(
        (a, b) => Math.abs(a.x - lx) - Math.abs(b.x - lx),
      )[0];
      const big = (leaf.box[2] - leaf.box[0]) * W >= 5 && level.tiles;
      const part = big ? "2417" : "2423";
      const directions = [
        [lx < stem.x ? -1 : 1, 0],
        [0, i % 2 ? -1 : 1],
        [0, i % 2 ? 1 : -1],
        [lx < stem.x ? 1 : -1, 0],
      ];
      for (const y of [ly, ly - 2, ly + 2, ly - 4, ly + 4]) {
        if (y < potTop + 2 || y > stem.top - 3) continue;
        if (
          !g.has(stem.x, y, stem.z) ||
          !g.has(stem.x, y - 1, stem.z) ||
          taken.has(`${stem.x},${y}`) ||
          taken.has(`${stem.x},${y - 1}`) ||
          taken.has(`${stem.x},${y + 1}`)
        )
          continue;
        for (const [dx, dz] of directions) {
          const turns = TURN_FOR(dx, dz);
          const cells = LEAVES[part].cells
            .map((c) => rotate(c, turns))
            .map(([ox, oz]) => [stem.x + ox, stem.z + oz]);
          if (
            cells.some(
              ([x, z]) =>
                g.has(x, y, z) || g.has(x, y + 1, z) || g.has(x, y - 1, z),
            )
          )
            continue;
          g.delete(stem.x, y, stem.z);
          taken.add(`${stem.x},${y}`);
          pieces.push({
            partId: part,
            color: leaf.color ?? t.leafColor,
            x: stem.x,
            z: stem.z,
            layer: y,
            turns,
            cells: [[stem.x, y, stem.z]],
            footprint: [],
            attachBelow: [stem.x, y - 1, stem.z],
          });
          placedLeaves++;
          return;
        }
      }
    });
    return pieces;
  };
  const result = assembleShape(settings, shape, {
    brickHeights: false,
    slopes: false,
    tiles: level.tiles,
    baseColor: hasContainer ? "stone" : "grass",
    supportColor: t.stemColor,
    fixed: (g) => {
      placedLeaves = 0;
      return planLeaves(g);
    },
  });
  const featureList: Features = [
    {
      name: "blooms",
      requested: Math.max(t.bloomCount, frontBlooms.length),
      retained: stems.length,
    },
    ...(leaves.length
      ? [{ name: "leaves", requested: leaves.length, retained: placedLeaves }]
      : []),
    ...(hasContainer
      ? [{ name: "container", requested: 1, retained: potCells.length ? 1 : 0 }]
      : []),
  ];
  notes.unshift(
    `${round ? "Cup-shaped blooms are built as small rounded volumes" : "Flat blooms are carved from the front view as upright discs"} on straight stems${placedLeaves ? `, with ${placedLeaves} real leaf element${placedLeaves === 1 ? "" : "s"} seated on the stems` : ""}.`,
  );
  return { result, features: featureList, notes };
}

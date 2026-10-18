import type { Assembly } from "../models";
import { CATALOG, COLORS } from "../catalog";
import { BUILDER_BY_REBRICKABLE } from "../parts/profiles";
import type { ColorId, Placement } from "../types";
import type { VoxelShape } from "./voxel";
import { gridPose, type FixedPiece } from "./finish";
import { quarterTurn } from "../parts/connections";

/**
 * Packs a voxel sculpture (1 stud × 1 plate cells) into real bricks and plates.
 * Every piece is anchored on a piece below it, so each instruction layer can be built
 * in order without hanging parts; courses alternate direction to bond seams.
 */
const PLATES = [
  "3024",
  "3023",
  "3623",
  "3710",
  "3666",
  "3460",
  "4477",
  "3022",
  "3021",
  "3020",
  "3795",
  "3034",
  "3832",
  "3031",
  "3032",
  "3035",
];
const BRICKS = [
  "3005",
  "3004",
  "3622",
  "3010",
  "3009",
  "3008",
  "6111",
  "3003",
  "3002",
  "3001",
  "2456",
  "3007",
  "3006",
];
/** Opaque colours every basic packing size can be built in. */
export const PACKABLE_COLORS = (Object.keys(COLORS) as ColorId[]).filter(
  (id) =>
    COLORS[id].alpha === 1 &&
    ["3005", "3004", "3024", "3023", "3003", "3022"].every((part) =>
      BUILDER_BY_REBRICKABLE.get(part)?.observedColorIds.includes(
        COLORS[id].rebrickableId,
      ),
    ),
);
const TILES = [
  "3070b",
  "3069b",
  "63864",
  "2431",
  "6636",
  "4162",
  "3068b",
  "26603",
  "87079",
  "69729",
];
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
interface Shape {
  tile?: boolean;
  id: string;
  w: number;
  d: number;
  h: number;
  turn: number;
}
function shapes(
  ids: string[],
  h: number,
  color: ColorId,
  maxLength: number,
): Shape[] {
  return ids.flatMap((id) => {
    const p = CATALOG[id];
    if (
      !p ||
      Math.max(p.width, p.depth) > maxLength ||
      !BUILDER_BY_REBRICKABLE.get(id)?.observedColorIds.includes(
        COLORS[color].rebrickableId,
      )
    )
      return [];
    const turns = p.width === p.depth ? [0] : [0, 1];
    return turns.map((turn) => ({
      id,
      w: turn ? p.depth : p.width,
      d: turn ? p.width : p.depth,
      h,
      turn,
    }));
  });
}

export interface PackOptions {
  /** World height of layer zero's underside. */
  bottom: number;
  originX: number;
  originZ: number;
  /** Allow three-plate bricks wherever three identical layers line up. */
  bricks: boolean;
  /** Bricks only: every layer group starts on a multiple of three. */
  brickCourses?: boolean;
  maxLength?: number;
  bag?: (layer: number) => number;
  title: (layer: number) => string;
  hint?: string;
  supportColor?: ColorId;
  /** Maximum distance a part may reach past its anchor into an overhang. */
  reach?: number;
  /** Exactly positioned parts (slopes, windows, details) emitted in their layer. */
  fixed?: FixedPiece[];
  /** Finish exposed top surfaces with studless tiles. */
  tiles?: boolean;
}
export interface PackResult {
  pieces: Placement[];
  supportCells: number;
  layers: number;
}

/** Add disclosed support columns under cells no part could anchor. */
export function addSupports(
  grid: VoxelShape,
  reach: number,
  color?: ColorId,
  solid: Set<string> = new Set(),
  course = 1,
) {
  let added = 0;
  const filled = (x: number, y: number, z: number) =>
    grid.has(x, y, z) || solid.has(key(x, y, z));
  const ys = [...new Set([...grid.cells.values()].map((v) => v.y))].sort(
    (a, b) => a - b,
  );
  for (const y of ys) {
    if (y === 0 || y % course) continue;
    for (;;) {
      const layer = [...grid.cells.values()].filter((v) => v.y === y);
      const anchored = (v: { x: number; z: number }) => filled(v.x, y - 1, v.z);
      const reachable = (v: (typeof layer)[number]) => {
        if (anchored(v)) return true;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          for (let step = 1; step <= reach; step++) {
            const n = grid.cells.get(key(v.x + dx * step, y, v.z + dz * step));
            if (!n || n.color !== v.color) break;
            if (anchored(n)) return true;
          }
        return false;
      };
      const unreachable = layer.filter((v) => !reachable(v));
      if (!unreachable.length) break;
      // A one-cell colour change hides better than an added support column.
      let recoloured = false;
      for (const v of unreachable)
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const n = grid.cells.get(key(v.x + dx, y, v.z + dz));
          if (n && anchored(n)) {
            // Whole-brick courses recolour all their layers so bricks still fit.
            for (let dy = 0; dy < course; dy++) {
              const c = grid.cells.get(key(v.x, y + dy, v.z));
              if (c) c.color = n.color;
            }
            recoloured = true;
            break;
          }
        }
      if (recoloured) continue;
      // Prefer hidden interior columns and the shortest drop.
      const score = (v: (typeof layer)[number]) => {
        let neighbours = 0;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          if (grid.has(v.x + dx, y, v.z + dz)) neighbours++;
        let drop = 0;
        while (y - drop - 1 >= 0 && !filled(v.x, y - drop - 1, v.z)) drop++;
        return neighbours * 100 - drop;
      };
      const target = unreachable.sort((a, b) => score(b) - score(a))[0];
      for (let yy = y - 1; yy >= 0 && !filled(target.x, yy, target.z); yy--) {
        grid.set(target.x, yy, target.z, color ?? target.color);
        added++;
      }
    }
  }
  return added;
}

export function packVoxels(
  a: Assembly,
  grid: VoxelShape,
  options: PackOptions,
): PackResult {
  const reach = options.reach ?? 4;
  const supportCells = addSupports(
    grid,
    reach,
    options.supportColor,
    new Set(
      (options.fixed ?? []).flatMap((f) =>
        f.cells.map(([x, y, z]) => key(x, y, z)),
      ),
    ),
    options.brickCourses ? 3 : 1,
  );
  const maxLength = options.maxLength ?? 10;
  const cells = grid.cells;
  const covered = new Map<string, number>();
  const rects: {
    x: number;
    y: number;
    z: number;
    w: number;
    d: number;
    h: number;
  }[] = [];
  const pieces: Placement[] = [];
  const fixed = options.fixed ?? [];
  const fixedCells = new Set(
    fixed.flatMap((f) => [
      ...f.cells.map(([x, y, z]) => key(x, y, z)),
      ...f.footprint.map(([x, z]) => key(x, f.layer, z)),
    ]),
  );
  const ys = [
    ...new Set([
      ...[...cells.values()].map((v) => v.y),
      ...fixed.map((f) => f.layer),
    ]),
  ].sort((p, q) => p - q);
  // Top cells have nothing above them, so a studless tile can finish them.
  const topCell = (x: number, y: number, z: number) =>
    !cells.has(key(x, y + 1, z)) && !fixedCells.has(key(x, y + 1, z));
  const cache = new Map<string, Shape[]>();
  const shapesFor = (color: ColorId, brick: boolean) => {
    const k = `${color}:${brick}`;
    if (!cache.has(k))
      cache.set(k, [
        ...(brick ? shapes(BRICKS, 3, color, maxLength) : []),
        ...(options.brickCourses ? [] : shapes(PLATES, 1, color, maxLength)),
        ...(options.tiles && !options.brickCourses
          ? shapes(TILES, 1, color, maxLength).map((t) => ({
              ...t,
              tile: true,
            }))
          : []),
      ]);
    return cache.get(k)!;
  };
  // Overhanging cells must reach an anchored neighbour within their own layer, so
  // tall bricks never occupy the cells an overhang will need.
  const overhang = [...cells.values()].filter(
    (v) => v.y > 0 && !cells.has(key(v.x, v.y - 1, v.z)),
  );
  const nearOverhang = new Set<string>();
  for (const v of overhang)
    for (let dz = -reach; dz <= reach; dz++)
      for (let dx = -reach; dx <= reach; dx++)
        if (Math.abs(dx) + Math.abs(dz) <= reach)
          nearOverhang.add(key(v.x + dx, v.y, v.z + dz));
  const fits = (x: number, y: number, z: number, s: Shape, color: ColorId) => {
    for (let dy = 0; dy < s.h; dy++)
      for (let dz = 0; dz < s.d; dz++)
        for (let dx = 0; dx < s.w; dx++) {
          const k = key(x + dx, y + dy, z + dz);
          if (covered.has(k) || cells.get(k)?.color !== color) return false;
          // Whole-brick courses share their layers, so only mixed packing needs this.
          if (s.h > 1 && !options.brickCourses && nearOverhang.has(k))
            return false;
          if (s.tile && !topCell(x + dx, y, z + dz)) return false;
        }
    return true;
  };
  const evaluate = (x: number, y: number, z: number, s: Shape) => {
    const below = new Set<number>();
    let anchored = 0;
    for (let dz = 0; dz < s.d; dz++)
      for (let dx = 0; dx < s.w; dx++) {
        if (y === 0) {
          anchored++;
          continue;
        }
        const p = covered.get(key(x + dx, y - 1, z + dz));
        if (p !== undefined) {
          anchored++;
          below.add(p);
        }
      }
    if (!anchored) return -Infinity;
    const long = s.w >= s.d ? 0 : 1;
    let score =
      s.w * s.d * s.h * 10 +
      (below.size - 1) * 14 +
      (s.tile ? s.w * s.d * 6 : 0);
    if (s.w !== s.d && long === y % 2) score += 4;
    // Discourage stacking an identical rectangle directly on its neighbour below.
    for (const p of below) {
      const r = rects[p];
      if (r.x === x && r.z === z && r.w === s.w && r.d === s.d) score -= 25;
    }
    return score;
  };
  const place = (x: number, y: number, z: number, s: Shape, color: ColorId) => {
    const index = rects.length;
    rects.push({ x, y, z, w: s.w, d: s.d, h: s.h });
    for (let dy = 0; dy < s.h; dy++)
      for (let dz = 0; dz < s.d; dz++)
        for (let dx = 0; dx < s.w; dx++)
          covered.set(key(x + dx, y + dy, z + dz), index);
    const piece = a.add(
      s.id,
      color,
      options.originX + x + s.w / 2,
      options.bottom + y * 0.4,
      options.originZ + z + s.d / 2,
      s.turn,
    );
    pieces.push(piece);
  };
  const failures: [number, number, number][] = [];
  const brickOk = (y: number) =>
    options.bricks && (!options.brickCourses || y % 3 === 0);
  for (const y of ys) {
    if (options.brickCourses && y % 3) continue;
    const layer = [...cells.values()]
      .filter((v) => v.y === y)
      .sort((p, q) =>
        y % 2 ? q.z - p.z || q.x - p.x : p.z - q.z || p.x - q.x,
      );
    const fixedHere = fixed.filter((f) => f.layer === y);
    if (!fixedHere.length && !layer.some((v) => !covered.has(key(v.x, y, v.z))))
      continue;
    a.phase(
      options.title(y),
      options.hint ??
        "Press each part onto the studs below. Parts in this layer overlap the joints underneath to lock the model together.",
      options.bag?.(y) ?? 2,
      () => {
        const pending: typeof layer = [];
        const containing = (v: (typeof layer)[number], brick: boolean) => {
          let best: Shape | undefined,
            bestScore = -Infinity,
            bx = 0,
            bz = 0;
          for (const s of shapesFor(v.color, brick))
            for (let ox = 0; ox < s.w; ox++)
              for (let oz = 0; oz < s.d; oz++) {
                const x = v.x - ox,
                  z = v.z - oz;
                if (!fits(x, y, z, s, v.color)) continue;
                const score = evaluate(x, y, z, s);
                if (score > bestScore) {
                  bestScore = score;
                  best = s;
                  bx = x;
                  bz = z;
                }
              }
          return best ? { s: best, x: bx, z: bz } : null;
        };
        // Overhangs first, while their anchoring neighbours are still free.
        const hanging = layer.filter(
          (v) => y > 0 && !cells.has(key(v.x, y - 1, v.z)),
        );
        for (const v of hanging) {
          if (covered.has(key(v.x, y, v.z))) continue;
          const choice = containing(v, brickOk(y));
          if (choice) place(choice.x, y, choice.z, choice.s, v.color);
        }
        for (const v of layer) {
          if (covered.has(key(v.x, y, v.z))) continue;
          const candidates = shapesFor(v.color, brickOk(y));
          let best: Shape | undefined,
            bestScore = -Infinity,
            bx = 0,
            bz = 0;
          // Candidates may extend away from the scan start in either direction.
          for (const s of candidates)
            for (const ox of y % 2 ? [s.w - 1] : [0])
              for (const oz of y % 2 ? [s.d - 1] : [0]) {
                const x = v.x - ox,
                  z = v.z - oz;
                if (!fits(x, y, z, s, v.color)) continue;
                const score = evaluate(x, y, z, s);
                if (score > bestScore) {
                  bestScore = score;
                  best = s;
                  bx = x;
                  bz = z;
                }
              }
          if (best) place(bx, y, bz, best, v.color);
          else pending.push(v);
        }
        // Second pass: any containing rectangle that reaches an anchor.
        for (const v of pending) {
          if (covered.has(key(v.x, y, v.z))) continue;
          const choice = containing(v, !!options.brickCourses);
          if (!choice) failures.push([v.x, y, v.z]);
          else place(choice.x, y, choice.z, choice.s, v.color);
        }
        for (const f of fixedHere) {
          if (
            f.attachBelow &&
            covered.get(key(...f.attachBelow)) === undefined
          ) {
            // Its stem cell could not be anchored; retry after that cell is supported.
            failures.push(f.attachBelow);
            continue;
          }
          const index = rects.length;
          rects.push({ x: f.x, y, z: f.z, w: 0, d: 0, h: 0 });
          for (const [cx, cy, cz] of f.cells)
            covered.set(key(cx, cy, cz), index);
          let placed: Placement;
          if (f.attachBelow) {
            const [tx, ty, tz] = f.attachBelow;
            const target = pieces[covered.get(key(tx, ty, tz)) ?? -1];
            if (!target)
              throw Error(
                `A detail part lost its supporting piece at ${tx},${ty},${tz}.`,
              );
            placed = a.attach(
              f.partId,
              f.color,
              target,
              "stud",
              0,
              "anti-stud",
              {
                layer: options.bottom + y * 0.4,
              },
            );
            placed.rotation = quarterTurn(f.turns);
            placed.rotated = f.turns % 2 === 1;
          } else {
            const pose = gridPose(
              f.partId,
              options.originX + f.x,
              options.originZ + f.z,
              options.bottom + y * 0.4,
              f.turns,
            );
            placed = a.add(f.partId, f.color, 0, 0, 0, f.turns, {
              ...pose,
              layer: options.bottom + y * 0.4,
              ...(f.approach ? { approach: f.approach } : {}),
              ...(f.procedure ? { procedure: f.procedure } : {}),
            });
          }
          pieces.push(placed);
          f.then?.(a, placed);
        }
      },
      options.title(y),
    );
  }
  if (failures.length) throw new UnanchoredCells(failures);
  return { pieces, supportCells, layers: ys.length };
}
export class UnanchoredCells extends Error {
  constructor(public cells: [number, number, number][]) {
    super("Some sculpture cells have no anchored part.");
  }
}

import { Assembly } from "../models";
import { CATALOG, COLORS } from "../catalog";
import { BUILDER_BY_REBRICKABLE } from "../parts/profiles";
import type { ColorId } from "../types";
export interface Voxel {
  x: number;
  y: number;
  z: number;
  color: ColorId;
}
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
export class VoxelShape {
  cells = new Map<string, Voxel>();
  set(x: number, y: number, z: number, color: ColorId) {
    this.cells.set(key(x, y, z), { x, y, z, color });
  }
  has(x: number, y: number, z: number) {
    return this.cells.has(key(x, y, z));
  }
  delete(x: number, y: number, z: number) {
    this.cells.delete(key(x, y, z));
  }
  box(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color: ColorId,
    shape: "box" | "rounded" | "tapered" = "box",
  ) {
    for (let dy = 0; dy < height; dy++)
      for (let dz = 0; dz < depth; dz++)
        for (let dx = 0; dx < width; dx++) {
          const inset =
            shape === "tapered"
              ? Math.floor(
                  ((dy / Math.max(1, height - 1)) * Math.min(width, depth)) / 4,
                )
              : 0;
          if (
            dx < inset ||
            dx >= width - inset ||
            dz < inset ||
            dz >= depth - inset
          )
            continue;
          if (
            shape === "rounded" &&
            width > 2 &&
            depth > 2 &&
            Math.abs((dx + 0.5 - width / 2) / (width / 2)) ** 2 +
              Math.abs((dz + 0.5 - depth / 2) / (depth / 2)) ** 2 >
              1
          )
            continue;
          this.set(x + dx, y + dy, z + dz, color);
        }
  }
  /** Fill genuine floating columns with disclosed supports; never invent a connection. */
  groundSupports(color: ColorId = "stone") {
    let added = 0;
    const bottoms = new Map<string, Voxel>();
    for (const v of this.cells.values()) {
      const k = `${v.x},${v.z}`,
        previous = bottoms.get(k);
      if (!previous || v.y > previous.y) bottoms.set(k, v);
    }
    for (const v of bottoms.values())
      for (let y = 0; y < v.y; y++) {
        if (!this.has(v.x, y, v.z)) {
          this.set(v.x, y, v.z, color);
          added++;
        }
      }
    return added;
  }
}
const BRICKS = [
  "3006",
  "3007",
  "2456",
  "3001",
  "3002",
  "3003",
  "3008",
  "3009",
  "3010",
  "3622",
  "3004",
  "3005",
];
const PLATES = ["3832", "3034", "3795", "3020", "3022", "3710", "3023", "3024"];
/** Pack occupied cells with real rectangular parts; all courses retain their exact grid. */
export function emitVoxels(
  a: Assembly,
  grid: VoxelShape,
  {
    bottom = 0.8,
    bag = 2,
    title = "Shape the body",
    maxWidth,
    from = 0,
    to = Infinity,
  }: {
    bottom?: number;
    bag?: number;
    title?: string;
    maxWidth?: number;
    from?: number;
    to?: number;
  } = {},
) {
  const cells = grid.cells;
  const used = new Set<string>();
  const maximum =
    maxWidth ??
    (a.settings.detail === "easy" ? 10 : a.settings.detail === "hard" ? 2 : 4);
  const ys = [...new Set([...cells.values()].map((v) => v.y))]
    .filter((y) => y >= from && y < to)
    .sort((a, b) => a - b);
  const fits = (v: Voxel, w: number, d: number, h: number) => {
    for (let y = 0; y < h; y++)
      for (let z = 0; z < d; z++)
        for (let x = 0; x < w; x++) {
          const k = key(v.x + x, v.y + y, v.z + z);
          if (used.has(k) || cells.get(k)?.color !== v.color || v.y + y >= to)
            return false;
        }
    return true;
  };
  for (const y of ys) {
    const layer = [...cells.values()]
      .filter((v) => v.y === y)
      .sort((a, b) => a.z - b.z || a.x - b.x);
    const minX = Math.min(...layer.map((v) => v.x)),
      minZ = Math.min(...layer.map((v) => v.z));
    a.phase(
      `${title} · course ${y + 1}`,
      "Align each underside with the exposed studs. The following course joins neighboring sections.",
      bag,
      () => {
        for (const v of layer) {
          if (used.has(key(v.x, v.y, v.z))) continue;
          const allowBrick = a.settings.detail !== "hard" && y % 4 !== 0;
          const ids = [...(allowBrick ? BRICKS : []), ...PLATES];
          const candidates = ids
            .flatMap((id) => {
              const p = CATALOG[id];
              if (
                !p ||
                p.width > maximum ||
                !BUILDER_BY_REBRICKABLE.get(id)?.observedColorIds.includes(
                  COLORS[v.color].rebrickableId,
                )
              )
                return [];
              return [0, 1].map((turn) => ({
                id,
                w: turn ? p.depth : p.width,
                d: turn ? p.width : p.depth,
                h: p.height > 0.8 ? 3 : 1,
                turn,
              }));
            })
            .filter(
              (p) =>
                p.w <= maximum - ((v.x - minX + (y % 2)) % maximum) &&
                p.d <= 2 - ((v.z - minZ + (y % 2)) % 2) &&
                fits(v, p.w, p.d, p.h),
            )
            .sort(
              (p, q) => q.w * q.d * q.h - p.w * p.d * p.h || p.turn - q.turn,
            );
          const p = candidates[0];
          if (!p) throw Error("This occupied cell has no supported part.");
          a.add(
            p.id,
            v.color,
            v.x + p.w / 2,
            bottom + v.y * 0.4,
            v.z + p.d / 2,
            p.turn,
          );
          for (let dy = 0; dy < p.h; dy++)
            for (let dz = 0; dz < p.d; dz++)
              for (let dx = 0; dx < p.w; dx++)
                used.add(key(v.x + dx, v.y + dy, v.z + dz));
        }
      },
      title,
    );
  }
}

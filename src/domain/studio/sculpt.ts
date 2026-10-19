import { Assembly } from "../models";
import type { ColorId, GenerationSettings } from "../types";
import { VoxelShape } from "./voxel";
import {
  carveViews,
  type CarveOptions,
  type CarvedShape,
  type ViewSet,
} from "./views";
import {
  addSupports,
  packVoxels,
  UnanchoredCells,
  type PackResult,
} from "./packer";
import { planSlopes, type FixedPiece } from "./finish";

export interface SculptOptions extends CarveOptions {
  supportColor?: ColorId;
  baseColor?: ColorId;
  /** Shape edits applied after carving, e.g. real window openings. */
  edit?: (shape: CarvedShape) => void;
  /** Semantic parts added after the packed body, e.g. eyes or window frames. */
  details?: (a: Assembly, shape: CarvedShape, pack: PackResult) => void;
  layerTitle?: (layer: number, total: number) => string;
  maxLength?: number;
  /** Smooth stepped top edges with real slope parts. */
  slopes?: boolean;
  /** Finish exposed tops with studless tiles. */
  tiles?: boolean;
  /** Extra exact parts (windows, eyes) planned against the final grid. */
  fixed?: (grid: VoxelShape, shape: CarvedShape) => FixedPiece[];
}
const cloneGrid = (grid: VoxelShape) => {
  const copy = new VoxelShape();
  for (const v of grid.cells.values()) copy.set(v.x, v.y, v.z, v.color);
  return copy;
};
/** Bags follow the build from the base upward in roughly equal thirds. */
export const bagForLayer = (layer: number, total: number) =>
  2 + Math.min(2, Math.floor((layer / Math.max(1, total)) * 3));

export function sculptAssembly(
  settings: GenerationSettings,
  set: ViewSet,
  options: SculptOptions,
) {
  return assembleShape(settings, carveViews(set, options), options);
}

/** Pack a carved (or constructed) shape on a bonded base, adding supports as needed. */
export function assembleShape(
  settings: GenerationSettings,
  shape: CarvedShape,
  options: Omit<SculptOptions, "span" | "colors" | "section">,
) {
  options.edit?.(shape);
  const extra: [number, number, number][] = [];
  const reservedCells = new Set<string>();
  for (let attempt = 0; attempt < 60; attempt++) {
    const a = new Assembly(settings);
    const grid = cloneGrid(shape.grid);
    for (const [x, y, z] of extra)
      for (
        let yy = y - 1;
        yy >= 0 && !grid.has(x, yy, z) && !reservedCells.has(`${x},${yy},${z}`);
        yy--
      )
        grid.set(
          x,
          yy,
          z,
          options.supportColor ?? grid.cells.get(`${x},${y},${z}`)!.color,
        );
    const size = Math.ceil((Math.max(shape.width, shape.depth) + 2) / 4) * 4;
    a.foundation(Math.max(8, size), options.baseColor ?? "stone");
    const total = shape.heightPlates;
    // Supports first, so exact parts (leaves, frames) are planned against the final volume.
    const early = addSupports(
      grid,
      4,
      options.supportColor,
      new Set(),
      options.brickHeights ? 3 : 1,
    );
    const fixed = [
      ...(options.fixed?.(grid, shape) ?? []),
      ...(options.slopes ? planSlopes(grid) : []),
    ];
    for (const f of fixed)
      for (const [x, y, z] of f.cells) reservedCells.add(`${x},${y},${z}`);
    try {
      const pack = packVoxels(a, grid, {
        bottom: 0.8,
        originX: shape.originX,
        originZ: shape.originZ,
        bricks: true,
        brickCourses: options.brickHeights,
        maxLength: options.maxLength,
        bag: (y) => bagForLayer(y, total),
        title: (y) =>
          options.layerTitle?.(y, total) ??
          `Layer ${options.brickHeights ? y / 3 + 1 : y + 1}`,
        supportColor: options.supportColor,
        fixed,
        tiles: options.tiles,
      });
      const supportCells = early + pack.supportCells + extra.length;
      const final = { ...shape, grid, supportCells };
      options.details?.(a, final, pack);
      return { assembly: a, shape: final, pack };
    } catch (error) {
      if (!(error instanceof UnanchoredCells)) throw error;
      // Support only the lowest failures; higher ones often follow from them.
      const lowest = Math.min(...error.cells.map((c) => c[1]));
      if (process.env.SCULPT_DEBUG) {
        const [fx, fy, fz] = error.cells[0];
        console.log(
          "unanchored",
          attempt,
          JSON.stringify(error.cells.slice(0, 6)),
          error.cells.length,
          Array.from(
            { length: 9 },
            (_, i) => grid.cells.get(`${fx},${fy - 3 + i},${fz}`)?.color ?? "-",
          ).join(" "),
          "nbrs",
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]
            .map(([dx, dz]) =>
              Array.from(
                { length: 6 },
                (_, i) =>
                  grid.cells
                    .get(`${fx + dx},${fy - 3 + i},${fz + dz}`)
                    ?.color?.slice(0, 4) ?? "-",
              ).join(","),
            )
            .join(" | "),
        );
      }
      extra.push(...error.cells.filter((c) => c[1] === lowest));
    }
  }
  throw Error("The sculpture could not be anchored layer by layer.");
}

import { Quaternion, Vector3 } from "three";
import { COLORS } from "../catalog";
import { quarterTurn } from "../parts/connections";
import { BUILDER_BY_REBRICKABLE } from "../parts/profiles";
import type { ColorId } from "../types";
import type { VoxelShape } from "./voxel";

/** A part placed at an exact grid position instead of by the rectangle packer. */
export interface FixedPiece {
  partId: string;
  color: ColorId;
  /** Grid cell of the footprint's minimum corner. */
  x: number;
  z: number;
  layer: number;
  turns: number;
  /** Grid cells the part occupies; they are removed from the packed volume. */
  cells: [number, number, number][];
  /** Footprint columns; the cells beneath must keep their studs for the connection. */
  footprint: [number, number][];
  approach?: [number, number, number];
  procedure?: "manual-flex";
  /**
   * Seat the part on the stud of the piece below this grid cell instead of aligning
   * its bounds, for parts whose body overhangs their single connection (leaves).
   */
  attachBelow?: [number, number, number];
  /** Add dependent parts once this one exists, e.g. glass into a window frame. */
  then?: (
    a: import("../models").Assembly,
    piece: import("../types").Placement,
  ) => void;
}

/**
 * World pose for a part whose mesh is not centred like a basic brick: align the rotated
 * mesh bounds with the grid footprint and the requested underside height.
 */
export function gridPose(
  partId: string,
  x: number,
  z: number,
  bottom: number,
  turns: number,
): {
  position: [number, number, number];
  rotation: [number, number, number, number];
} {
  const bounds = BUILDER_BY_REBRICKABLE.get(partId)!.mesh.bounds;
  const rotation = quarterTurn(turns);
  const q = new Quaternion(...rotation);
  let minX = Infinity,
    minZ = Infinity;
  for (const bx of [bounds[0], bounds[3]])
    for (const bz of [bounds[2], bounds[5]]) {
      const v = new Vector3(bx, 0, bz).applyQuaternion(q);
      minX = Math.min(minX, v.x);
      minZ = Math.min(minZ, v.z);
    }
  const round = (n: number) => Math.round(n * 1e4) / 1e4;
  return {
    position: [round(x - minX), round(bottom - bounds[1]), round(z - minZ)],
    rotation,
  };
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
/** Descent direction for each quarter turn: every slope part descends along local +z. */
const DIRECTIONS: [number, number, number][] = [
  [0, 1, 0],
  [1, 0, 1],
  [0, -1, 2],
  [-1, 0, 3],
];
interface SlopeType {
  id: string;
  width: number;
  length: number;
  height: number;
  /** Required drop in plates from the high column to the first low column. */
  drop: number;
}
const SLOPES: SlopeType[] = [
  { id: "3039", width: 2, length: 2, height: 3, drop: 3 },
  { id: "3040b", width: 1, length: 2, height: 3, drop: 3 },
  { id: "11477", width: 1, length: 2, height: 2, drop: 2 },
];
const available = (id: string, color: ColorId) =>
  BUILDER_BY_REBRICKABLE.get(id)?.observedColorIds.includes(
    COLORS[color].rebrickableId,
  );

/**
 * Replace stepped top edges with real slope parts. A slope keeps its high end on the
 * upper column and lies over the lower neighbour, so the stair-step reads as a surface.
 */
export function planSlopes(grid: VoxelShape, { curved = true } = {}) {
  const pieces: FixedPiece[] = [];
  const top = new Map<string, number>();
  for (const v of grid.cells.values()) {
    const k = `${v.x},${v.z}`;
    top.set(k, Math.max(top.get(k) ?? -1, v.y));
  }
  const height = (x: number, z: number) => (top.get(`${x},${z}`) ?? -1) + 1;
  const reserved = new Set<string>();
  const columns = [...top.entries()]
    .map(([k, y]) => {
      const [x, z] = k.split(",").map(Number);
      return { x, z, t: y + 1 };
    })
    .sort((a, b) => b.t - a.t || a.z - b.z || a.x - b.x);
  for (const { x, z } of columns) {
    const t = height(x, z);
    if (reserved.has(`${x},${z}`)) continue;
    let done = false;
    for (const slope of SLOPES) {
      if (done) break;
      if (!curved && slope.id === "11477") continue;
      for (const [dx, dz, turns] of DIRECTIONS) {
        const b = t - slope.height;
        if (b < 1) continue;
        const lateral: [number, number] = dx ? [0, 1] : [1, 0];
        const lanes = Array.from({ length: slope.width }, (_, i) => [
          x + lateral[0] * i,
          z + lateral[1] * i,
        ]);
        const color = grid.cells.get(key(x, t - 1, z))?.color;
        if (!color || !available(slope.id, color)) continue;
        const ok = lanes.every(([hx, hz]) => {
          if (height(hx, hz) !== t || reserved.has(`${hx},${hz}`)) return false;
          for (let y = b; y < t; y++)
            if (grid.cells.get(key(hx, y, hz))?.color !== color) return false;
          if (!grid.has(hx, b - 1, hz)) return false;
          // Every following column along the slope must sit exactly on its underside.
          for (let i = 1; i < slope.length; i++) {
            const nx = hx + dx * i,
              nz = hz + dz * i;
            if (reserved.has(`${nx},${nz}`)) return false;
            if (height(nx, nz) !== t - slope.drop || !grid.has(nx, b - 1, nz))
              return false;
          }
          // The high side must be backed: the column behind is at least as tall.
          const backHeight = height(hx - dx, hz - dz);
          return backHeight >= t - 1;
        });
        if (!ok) continue;
        const cells: [number, number, number][] = [];
        for (const [hx, hz] of lanes)
          for (let y = b; y < t; y++) {
            grid.delete(hx, y, hz);
            cells.push([hx, y, hz]);
          }
        const footprint: [number, number][] = [];
        for (const [hx, hz] of lanes)
          for (let i = 0; i < slope.length; i++) {
            reserved.add(`${hx + dx * i},${hz + dz * i}`);
            footprint.push([hx + dx * i, hz + dz * i]);
          }
        const xs = lanes.flatMap(([hx]) => [hx, hx + dx * (slope.length - 1)]),
          zs = lanes.flatMap(([, hz]) => [hz, hz + dz * (slope.length - 1)]);
        pieces.push({
          partId: slope.id,
          color,
          x: Math.min(...xs),
          z: Math.min(...zs),
          layer: b,
          turns,
          cells,
          footprint,
        });
        done = true;
        break;
      }
    }
  }
  return pieces;
}

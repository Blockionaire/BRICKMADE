import { Matrix4, Quaternion, Vector3 } from "three";
import type { PartPose, Vec3 } from "../parts/types";

export interface CollisionShape {
  resolution: number;
  min: Vec3;
  dims: Vec3;
  bits: Uint8Array;
  occupiedCells: number;
}
export interface CollisionInstance {
  pose: PartPose;
  shape: CollisionShape;
  matrix: number[];
  ticks: Vec3;
  min: Vec3;
  max: Vec3;
}
export const COLLISION_RESOLUTION = 0.05;
/** Version 1 stores the occupancy bits; version 2 (parts library) stores LEB128 run
 * lengths of alternating empty/solid cells, starting with empty. */
export function decodeCollisionShape(buffer: ArrayBuffer): CollisionShape {
  if (buffer.byteLength < 36) throw Error("Truncated collision artifact.");
  const d = new DataView(buffer),
    version = d.getUint32(4, true);
  if (
    d.getUint32(0, true) !== 0x31585642 ||
    (version !== 1 && version !== 2) ||
    Math.abs(d.getFloat32(8, true) - COLLISION_RESOLUTION) > 1e-7
  )
    throw Error("Collision artifact version mismatch.");
  const min = [0, 1, 2].map((i) => d.getInt32(12 + i * 4, true)) as Vec3,
    dims = [0, 1, 2].map((i) => d.getUint32(24 + i * 4, true)) as Vec3;
  const total = dims.reduce((a, b) => a * b, 1);
  if (
    dims.some((n) => !n || n > 1000) ||
    total > 10_000_000 ||
    (version === 1 && buffer.byteLength !== 36 + Math.ceil(total / 8))
  )
    throw Error("Invalid collision artifact dimensions.");
  let bits: Uint8Array;
  if (version === 1) {
    bits = new Uint8Array(buffer, 36);
    if (total % 8 && bits.at(-1)! >> (total % 8))
      throw Error("Invalid collision padding bits.");
  } else {
    bits = new Uint8Array(Math.ceil(total / 8));
    const runs = new Uint8Array(buffer, 36);
    let offset = 0,
      cell = 0,
      solid = false;
    while (offset < runs.length) {
      let run = 0,
        shift = 0,
        byte: number;
      do {
        if (offset >= runs.length || shift > 28)
          throw Error("Invalid collision run length.");
        byte = runs[offset++];
        run += (byte & 0x7f) * 2 ** shift;
        shift += 7;
      } while (byte & 0x80);
      if (cell + run > total) throw Error("Invalid collision run length.");
      if (solid)
        for (let i = cell; i < cell + run; i++) bits[i >> 3] |= 1 << (i & 7);
      cell += run;
      solid = !solid;
    }
    if (cell !== total) throw Error("Invalid collision run length.");
  }
  let occupiedCells = 0;
  for (const b of bits) {
    let n = b;
    while (n) {
      n &= n - 1;
      occupiedCells++;
    }
  }
  if (!occupiedCells) throw Error("Empty collision artifact.");
  return { resolution: COLLISION_RESOLUTION, min, dims, bits, occupiedCells };
}
/** Only rotations preserving the documented grid receive a sampled-geometry pass. */
export function collisionInstance(
  pose: PartPose,
  shape: CollisionShape,
): CollisionInstance | undefined {
  const rotation = new Matrix4().makeRotationFromQuaternion(
    new Quaternion(...pose.rotation),
  ).elements;
  const indices = [0, 4, 8, 1, 5, 9, 2, 6, 10],
    matrix = indices.map((i) => rotation[i]);
  if (matrix.some((n) => Math.abs(n - Math.round(n)) > 1e-5)) return;
  const ticks = pose.position.map((n) => n / shape.resolution) as Vec3;
  if (
    ticks.some((n) => !Number.isFinite(n) || Math.abs(n - Math.round(n)) > 1e-5)
  )
    return;
  matrix.forEach((n, i) => (matrix[i] = Math.round(n)));
  ticks.forEach((n, i) => (ticks[i] = Math.round(n)));
  const min = [Infinity, Infinity, Infinity] as Vec3,
    max = [-Infinity, -Infinity, -Infinity] as Vec3;
  for (let corner = 0; corner < 8; corner++) {
    const local = shape.min.map(
      (n, i) => n + ((corner >> i) & 1) * shape.dims[i],
    );
    for (let axis = 0; axis < 3; axis++) {
      const value =
        ticks[axis] +
        matrix[axis * 3] * local[0] +
        matrix[axis * 3 + 1] * local[1] +
        matrix[axis * 3 + 2] * local[2];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return { pose, shape, matrix, ticks, min, max };
}
function solidAt(instance: CollisionInstance, world: Vec3): boolean {
  const { matrix: m, ticks: t, shape: s } = instance,
    x = world[0] + 0.5 - t[0],
    y = world[1] + 0.5 - t[1],
    z = world[2] + 0.5 - t[2];
  const ix = Math.floor(m[0] * x + m[3] * y + m[6] * z) - s.min[0],
    iy = Math.floor(m[1] * x + m[4] * y + m[7] * z) - s.min[1],
    iz = Math.floor(m[2] * x + m[5] * y + m[8] * z) - s.min[2];
  if (
    ix < 0 ||
    iy < 0 ||
    iz < 0 ||
    ix >= s.dims[0] ||
    iy >= s.dims[1] ||
    iz >= s.dims[2]
  )
    return false;
  const index = ix + s.dims[0] * (iy + s.dims[1] * iz);
  return !!(s.bits[index >> 3] & (1 << (index & 7)));
}
export function collisionPoint(
  a: CollisionInstance,
  b: CollisionInstance,
  allow?: (point: Vec3) => boolean,
): Vec3 | undefined {
  const lo = a.min.map((n, i) => Math.max(n, b.min[i])),
    hi = a.max.map((n, i) => Math.min(n, b.max[i]));
  if (lo.some((n, i) => n >= hi[i])) return;
  for (let z = lo[2]; z < hi[2]; z++)
    for (let y = lo[1]; y < hi[1]; y++)
      for (let x = lo[0]; x < hi[0]; x++) {
        const cell: Vec3 = [x, y, z];
        if (!solidAt(a, cell) || !solidAt(b, cell)) continue;
        const point = cell.map((n) => (n + 0.5) * a.shape.resolution) as Vec3;
        if (!allow?.(point)) return point;
      }
}
export function shifted(
  instance: CollisionInstance,
  axis: Vec3,
  ticks: number,
): CollisionInstance {
  const delta = axis.map((n) => Math.round(n * ticks)) as Vec3;
  return {
    ...instance,
    ticks: instance.ticks.map((n, i) => n + delta[i]) as Vec3,
    min: instance.min.map((n, i) => n + delta[i]) as Vec3,
    max: instance.max.map((n, i) => n + delta[i]) as Vec3,
  };
}
export function boundsForPose(
  pose: PartPose,
  bounds: number[],
): { min: Vec3; max: Vec3 } {
  const m = new Matrix4().compose(
    new Vector3(...pose.position),
    new Quaternion(...pose.rotation),
    new Vector3(1, 1, 1),
  );
  const min = [Infinity, Infinity, Infinity] as Vec3,
    max = [-Infinity, -Infinity, -Infinity] as Vec3;
  for (let c = 0; c < 8; c++) {
    const v = new Vector3(
      ...([0, 1, 2].map((i) => bounds[i + ((c >> i) & 1) * 3]) as Vec3),
    ).applyMatrix4(m);
    v.toArray().forEach((n, i) => {
      min[i] = Math.min(min[i], n);
      max[i] = Math.max(max[i], n);
    });
  }
  return { min, max };
}

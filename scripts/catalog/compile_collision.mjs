/** Offline interior sampling of ORIGINAL surfaces, including hollow undersides.
 * Two independent ray directions, deduplicated boundaries, conservative union.
 * 0.05 scene units = 0.4 mm. This is a declared finite-resolution digital audit,
 * never an exact solid solver, metrology or a physical-strength certificate.
 */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { decodeMesh } from "./mesh-format.mjs";
const directory = new URL("../../public/catalog/", import.meta.url);
const manifest = JSON.parse(
  await fs.readFile(new URL("builder-parts.json", directory), "utf8"),
);
const resolution = 0.05;
const directions = [
  [1, 0.371, 0.219],
  [0.173, 1, 0.427],
].map((v) => new THREE.Vector3(...v).normalize());
await fs.mkdir(new URL("collision/", directory), { recursive: true });
const onlyBatch = process.argv.includes("--batch")
  ? process.argv[process.argv.indexOf("--batch") + 1]
  : null;
/** Library parts: one ray per grid column instead of two per cell (same nearest
 * oriented boundary rule). Columns are offset by a tiny irrational-ish amount so
 * symmetric primitive edges never sit exactly on a ray. Three perpendicular column
 * families are united conservatively (a disputed sample counts as solid). */
const JITTER = [0.000137, 0.000291, 0.000173];
function columnFill(bvh, min, dims, along, lo, hi) {
  const [u, v] = [0, 1, 2].filter((a) => a !== along);
  const result = new Uint8Array(dims[0] * dims[1] * dims[2]);
  const ray = new THREE.Ray(),
    start = (min[along] - 4) * resolution;
  for (let j = 0; j < dims[v]; j++)
    for (let i = 0; i < dims[u]; i++) {
      const origin = [0, 0, 0];
      origin[u] = (min[u] + i + 0.5) * resolution + JITTER[u];
      origin[v] = (min[v] + j + 0.5) * resolution + JITTER[v];
      origin[along] = start;
      if (origin[u] < lo[u] - 1e-6 || origin[u] > hi[u] + 1e-6) continue;
      if (origin[v] < lo[v] - 1e-6 || origin[v] > hi[v] + 1e-6) continue;
      ray.origin.set(...origin);
      ray.direction.set(...[0, 1, 2].map((a) => (a === along ? 1 : 0)));
      const hits = bvh
        .raycast(ray, THREE.DoubleSide)
        .sort((a, b) => a.distance - b.distance);
      // Group coincident hits; a group's boundary is the sum of distinct signs.
      const groups = [];
      let signs = null,
        previous = -Infinity;
      for (const h of hits) {
        if (h.distance - previous > 1e-5) {
          signs = new Set();
          groups.push({ distance: h.distance, signs });
          previous = h.distance;
        }
        const dot = h.face.normal.getComponent(along);
        if (Math.abs(dot) > 1e-8) signs.add(dot > 0 ? 1 : -1);
      }
      const boundaries = groups
        .map((g) => ({
          distance: g.distance,
          sum: [...g.signs].reduce((a, b) => a + b, 0),
        }))
        .filter((g) => g.sum !== 0);
      let next = 0;
      for (let k = 0; k < dims[along]; k++) {
        const t = (min[along] + k + 0.5) * resolution - start;
        const point = (min[along] + k + 0.5) * resolution;
        while (
          next < boundaries.length &&
          boundaries[next].distance <= t + 1e-6
        )
          next++;
        if (point < lo[along] - 1e-6 || point > hi[along] + 1e-6) continue;
        if (next < boundaries.length && boundaries[next].sum > 0) {
          const cell = [0, 0, 0];
          cell[u] = i;
          cell[v] = j;
          cell[along] = k;
          result[cell[0] + dims[0] * (cell[1] + dims[1] * cell[2])] = 1;
        }
      }
    }
  return result;
}
/** Version 2 payload: LEB128 run lengths of alternating empty/solid cells, starting empty. */
function runLengths(bits, total) {
  const out = [];
  let value = 0,
    run = 0;
  const push = (n) => {
    while (n >= 0x80) {
      out.push((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    out.push(n);
  };
  for (let i = 0; i < total; i++) {
    const bit = (bits[i >> 3] >> (i & 7)) & 1;
    if (bit !== value) {
      push(run);
      value = bit;
      run = 0;
    }
    run++;
  }
  push(run);
  return Buffer.from(out);
}
for (const part of manifest.parts) {
  if (onlyBatch && part.batch !== onlyBatch) continue;
  const raw = await fs.readFile(
    new URL(part.mesh.file.split("/catalog/")[1], directory),
  );
  if (createHash("sha256").update(raw).digest("hex") !== part.mesh.sha256)
    throw Error("Mesh checksum mismatch");
  if (
    part.collision?.meshSha256 === part.mesh.sha256 &&
    part.collision?.resolution === resolution
  ) {
    const cached = await fs
      .readFile(new URL(part.collision.file.split("/catalog/")[1], directory))
      .catch(() => null);
    if (
      cached &&
      createHash("sha256").update(cached).digest("hex") ===
        part.collision.sha256
    ) {
      console.log(part.id, "verified collision cache");
      continue;
    }
  }
  const { positions } = decodeMesh(raw);
  const geometry = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const bvh = new MeshBVH(geometry, { targetLeafSize: 8 });
  // Snap numerical surface bounds very close to the sampling grid to exact planes.
  const min = part.mesh.bounds
    .slice(0, 3)
    .map((n) =>
      Math.abs(n / resolution - Math.round(n / resolution)) < 0.0001
        ? Math.round(n / resolution)
        : Math.floor(n / resolution),
    );
  const max = part.mesh.bounds
    .slice(3)
    .map((n) =>
      Math.abs(n / resolution - Math.round(n / resolution)) < 0.0001
        ? Math.round(n / resolution)
        : Math.ceil(n / resolution),
    );
  const dims = max.map((n, i) => n - min[i]),
    total = dims.reduce((a, b) => a * b, 1),
    bits = Buffer.alloc(Math.ceil(total / 8));
  const ray = new THREE.Ray(),
    sum = [0, 0, 0];
  let occupied = 0,
    ambiguous = 0;
  function inside(origin, direction) {
    ray.origin.copy(origin);
    ray.direction.copy(direction);
    const hits = bvh
      .raycast(ray, THREE.DoubleSide)
      .filter((h) => h.distance > 1e-6)
      .sort((a, b) => a.distance - b.distance);
    // LDraw contains touching component solids (e.g. stud + brick top).
    // Opposite coincident interfaces cancel; duplicate triangles with the same
    // orientation count once. Plain odd/even parity incorrectly fills cavities.
    let previous = -Infinity,
      signs = new Set();
    const boundary = () => [...signs].reduce((sum, n) => sum + n, 0);
    for (const h of hits) {
      if (h.distance - previous > 1e-5) {
        if (boundary() !== 0) return boundary() > 0;
        signs = new Set();
        previous = h.distance;
      }
      const dot = h.face.normal.dot(direction);
      if (Math.abs(dot) > 1e-8) signs.add(dot > 0 ? 1 : -1);
    }
    return boundary() > 0;
  }
  const point = new THREE.Vector3();
  const columns = part.batch === "library";
  if (columns) {
    const lo = part.mesh.bounds.slice(0, 3),
      hi = part.mesh.bounds.slice(3);
    const fills = [0, 1, 2].map((along) =>
      columnFill(bvh, min, dims, along, lo, hi),
    );
    for (let index = 0; index < total; index++) {
      const votes = fills[0][index] + fills[1][index] + fills[2][index];
      if (votes % 3) ambiguous++;
      if (!votes) continue;
      bits[index >> 3] |= 1 << (index & 7);
      occupied++;
      const x = index % dims[0],
        y = Math.floor(index / dims[0]) % dims[1],
        z = Math.floor(index / (dims[0] * dims[1]));
      sum[0] += (min[0] + x + 0.5) * resolution;
      sum[1] += (min[1] + y + 0.5) * resolution;
      sum[2] += (min[2] + z + 0.5) * resolution;
    }
  }
  for (let z = 0; z < (columns ? 0 : dims[2]); z++)
    for (let y = 0; y < dims[1]; y++)
      for (let x = 0; x < dims[0]; x++) {
        point.set(
          (min[0] + x + 0.5) * resolution,
          (min[1] + y + 0.5) * resolution,
          (min[2] + z + 0.5) * resolution,
        );
        if (
          point
            .toArray()
            .some(
              (n, i) =>
                n < part.mesh.bounds[i] - 1e-6 ||
                n > part.mesh.bounds[i + 3] + 1e-6,
            )
        )
          continue;
        const a = inside(point, directions[0]),
          b = inside(point, directions[1]);
        let filled = a;
        if (a !== b) {
          ambiguous++;
          filled = a || b;
        } // conservative union on disputed samples
        if (filled) {
          const index = x + dims[0] * (y + dims[1] * z);
          bits[index >> 3] |= 1 << (index & 7);
          occupied++;
          sum[0] += point.x;
          sum[1] += point.y;
          sum[2] += point.z;
        }
      }
  if (!occupied) throw Error("No solid samples for " + part.id);
  const payload = columns ? runLengths(bits, total) : bits;
  const file = Buffer.alloc(36 + payload.length);
  file.writeUInt32LE(0x31585642, 0);
  file.writeUInt32LE(columns ? 2 : 1, 4);
  file.writeFloatLE(resolution, 8);
  min.forEach((n, i) => file.writeInt32LE(n, 12 + i * 4));
  dims.forEach((n, i) => file.writeUInt32LE(n, 24 + i * 4));
  payload.copy(file, 36);
  await fs.writeFile(new URL(`collision/${part.id}.bvox`, directory), file);
  part.collision = {
    file: `/catalog/collision/${part.id}.bvox`,
    sha256: createHash("sha256").update(file).digest("hex"),
    bytes: file.length,
    resolution,
    occupiedCells: occupied,
    ambiguousCells: ambiguous,
    totalCells: total,
    center: sum.map((n) => n / occupied),
    volume: occupied * resolution ** 3,
    meshSha256: part.mesh.sha256,
    method: columns
      ? "column rays (X, Y and Z, jittered) with nearest oriented boundary and coincident cancellation; conservative union; run-length artifact"
      : "nearest oriented boundary with coincident cancellation; dual-ray agreement; conservative solid on disputed samples",
  };
  geometry.dispose();
  console.log(
    part.id,
    occupied,
    "solid cells",
    ambiguous,
    "ambiguous samples",
    file.length,
    "bytes",
  );
}
await fs.writeFile(
  new URL("builder-parts.json", directory),
  JSON.stringify(manifest) + "\n",
);
const sync = spawnSync(
  "python3",
  [
    "-c",
    `import json,sqlite3,sys
from pathlib import Path
p=Path(sys.argv[1]);m=json.loads((p/'builder-parts.json').read_text())
with sqlite3.connect(p/'brickmade.sqlite') as db:
 for part in m['parts']:db.execute('UPDATE builder_parts SET profile_json=? WHERE ldraw_id=?',(json.dumps(part),part['id']))
`,
    directory.pathname,
  ],
  { encoding: "utf8" },
);
if (sync.status !== 0) throw Error(sync.stderr);

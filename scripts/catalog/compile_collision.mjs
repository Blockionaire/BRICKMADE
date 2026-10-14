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
for (const part of manifest.parts) {
  const raw = await fs.readFile(
    new URL(part.mesh.file.split("/catalog/")[1], directory),
  );
  if (createHash("sha256").update(raw).digest("hex") !== part.mesh.sha256)
    throw Error("Mesh checksum mismatch");
  const count = raw.readUInt32LE(8),
    positions = new Float32Array(count * 3);
  for (let i = 0; i < positions.length; i++)
    positions[i] = raw.readFloatLE(12 + i * 4);
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
  for (let z = 0; z < dims[2]; z++)
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
  const file = Buffer.alloc(36 + bits.length);
  file.writeUInt32LE(0x31585642, 0);
  file.writeUInt32LE(1, 4);
  file.writeFloatLE(resolution, 8);
  min.forEach((n, i) => file.writeInt32LE(n, 12 + i * 4));
  dims.forEach((n, i) => file.writeUInt32LE(n, 24 + i * 4));
  bits.copy(file, 36);
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
    method:
      "nearest oriented boundary with coincident cancellation; dual-ray agreement; conservative solid on disputed samples",
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
  JSON.stringify(manifest, null, 2) + "\n",
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

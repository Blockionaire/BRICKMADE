/** Compile original LDraw surfaces to small, uniformly scaled binary meshes.
 * No remeshing, body boxes, nonuniform stretching or geometry simplification.
 * Binary: LE uint32 magic 0x45474d42 ('BMGE'), version 1, vertex count,
 * followed by Float32 XYZ positions then Float32 XYZ normals.
 */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as THREE from "three";
import { LDrawLoader } from "three/examples/jsm/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/examples/jsm/materials/LDrawConditionalLineMaterial.js";
const directory = new URL("../../public/catalog/", import.meta.url);
const manifest = JSON.parse(
  await fs.readFile(new URL("builder-parts.json", directory), "utf8"),
);
const palette = JSON.parse(
  await fs.readFile(new URL("index.json", directory), "utf8"),
).colors;
const colorHeaders = palette
  .filter((c) => ![16, 24, 10000].includes(c.id))
  .map(
    (c) =>
      `0 !COLOUR LDraw_${c.id} CODE ${c.id} VALUE ${c.hex} EDGE ${c.edge} ALPHA ${c.alpha}`,
  )
  .join("\n");
const resources = new Set();
for (const part of manifest.parts) {
  const original = await fs.readFile(
    new URL(`geometry/${part.id}.mpd`, directory),
    "utf8",
  );
  const document = original
    .replace(
      "0 FILE main.ldr",
      `0 FILE main.ldr\n${colorHeaders}\n0 !COLOUR BrickMade_Builder CODE 10000 VALUE #C8C4BA EDGE #333333`,
    )
    .replace(
      "1 16 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
      "1 10000 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
    );
  const loader = new LDrawLoader();
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
  const model = await new Promise((resolve, reject) =>
    loader.parse(document, resolve, reject),
  );
  const transform = new THREE.Matrix4().makeRotationX(Math.PI);
  transform.premultiply(new THREE.Matrix4().makeScale(0.05, 0.05, 0.05));
  transform.premultiply(
    new THREE.Matrix4().makeTranslation(
      -part.centerLdu[0] / 20,
      part.centerLdu[1] / 20,
      part.centerLdu[2] / 20,
    ),
  );
  model.updateMatrixWorld(true);
  const positions = [],
    normals = [],
    groups = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = object.geometry;
    const geometry = (
      source.index ? source.toNonIndexed() : source.clone()
    ).applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(transform, object.matrixWorld),
    );
    const p = geometry.getAttribute("position"),
      n = geometry.getAttribute("normal");
    const start = positions.length / 3;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const sections = source.groups.length
      ? source.groups
      : [{ start: 0, count: p.count, materialIndex: 0 }];
    for (const section of sections) {
      const material = Array.isArray(object.material)
        ? object.material[section.materialIndex]
        : object.material;
      groups.push({
        start: start + section.start,
        count: section.count,
        code: material.userData.code ?? "16",
        hex: "#" + material.color.getHexString(),
        alpha: Math.round(material.opacity * 255),
      });
    }
    geometry.dispose();
  });
  if (!positions.length || positions.some((n) => !Number.isFinite(n)))
    throw Error("Invalid mesh " + part.id);
  const buffer = Buffer.alloc(12 + (positions.length + normals.length) * 4);
  buffer.writeUInt32LE(0x45474d42, 0);
  buffer.writeUInt32LE(1, 4);
  buffer.writeUInt32LE(positions.length / 3, 8);
  positions.forEach((v, i) => buffer.writeFloatLE(v, 12 + i * 4));
  normals.forEach((v, i) =>
    buffer.writeFloatLE(v, 12 + (positions.length + i) * 4),
  );
  await fs.writeFile(new URL(`geometry/${part.id}.bin`, directory), buffer);
  const bounds = [
    Infinity,
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
    -Infinity,
  ];
  positions.forEach((v, i) => {
    const a = i % 3;
    bounds[a] = Math.min(bounds[a], v);
    bounds[a + 3] = Math.max(bounds[a + 3], v);
  });
  part.mesh = {
    file: `/catalog/geometry/${part.id}.bin`,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    bytes: buffer.length,
    vertexCount: positions.length / 3,
    bounds,
    groups,
  };
  model.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material)
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        resources.add(m),
      );
  });
  for (const m of resources) m?.dispose();
  resources.clear();
  console.log(
    part.id,
    part.mesh.vertexCount,
    "vertices",
    buffer.length,
    "bytes",
    part.connectors.length,
    "connectors",
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
directory=Path(sys.argv[1])
manifest=json.loads((directory/'builder-parts.json').read_text())
with sqlite3.connect(directory/'brickmade.sqlite') as db:
 for part in manifest['parts']:
  updated=db.execute('UPDATE builder_parts SET profile_json=? WHERE ldraw_id=?',(json.dumps(part),part['id']))
  if updated.rowcount!=1: raise ValueError('Run package_builder.py first')
`,
    directory.pathname,
  ],
  { encoding: "utf8" },
);
if (sync.status !== 0)
  throw Error(
    sync.stderr || "Could not synchronize geometry provenance in SQLite.",
  );

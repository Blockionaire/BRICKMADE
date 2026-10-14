import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { LDrawLoader } from "three/examples/jsm/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/examples/jsm/materials/LDrawConditionalLineMaterial.js";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const directory = path.join(root, "public/catalog");
const manifest = JSON.parse(
  await fs.readFile(path.join(directory, "manifest.json"), "utf8"),
);
const index = JSON.parse(
  await fs.readFile(path.join(directory, "index.json"), "utf8"),
);
const colorHeaders = index.colors
  .filter((c) => ![16, 24, 10000].includes(c.id))
  .map(
    (c) =>
      `0 !COLOUR LDraw_${c.id} CODE ${c.id} VALUE ${c.hex} EDGE ${c.edge} ALPHA ${c.alpha}`,
  )
  .join("\n");
const xAxis = new THREE.Vector3(0.8, 0, -0.6);
const yAxis = new THREE.Vector3(-0.3, 0.866, -0.4);
const depthAxis = new THREE.Vector3(0.52, 0.5, 0.693);
for (const preview of manifest.previews) {
  const palette = index.colors.find((c) => c.id === preview.color);
  const loader = new LDrawLoader();
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
  const original = await fs.readFile(
    path.join(directory, "previews", preview.id + ".mpd"),
    "utf8",
  );
  const document = original
    .replace(
      "0 FILE main.ldr",
      `0 FILE main.ldr\n${colorHeaders}\n0 !COLOUR BrickMade_Preview CODE 10000 VALUE ${palette.hex} EDGE ${palette.edge} ALPHA ${palette.alpha}`,
    )
    .replace(
      "1 16 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
      "1 10000 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
    );
  const group = await new Promise((resolve, reject) =>
    loader.parse(document, resolve, reject),
  );
  group.rotation.x = Math.PI;
  group.updateMatrixWorld(true);
  const triangles = [];
  group.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    const positions = geometry.getAttribute("position");
    const count = geometry.index ? geometry.index.count : positions.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map((offset) =>
        new THREE.Vector3()
          .fromBufferAttribute(
            positions,
            geometry.index ? geometry.index.getX(i + offset) : i + offset,
          )
          .applyMatrix4(object.matrixWorld),
      );
      const normal = new THREE.Vector3()
        .subVectors(vertices[1], vertices[0])
        .cross(new THREE.Vector3().subVectors(vertices[2], vertices[0]))
        .normalize();
      if (normal.dot(depthAxis) < -0.01) continue;
      const section = geometry.groups.find(
        (s) => i >= s.start && i < s.start + s.count,
      );
      const material = Array.isArray(object.material)
        ? object.material[section?.materialIndex || 0]
        : object.material;
      const projected = vertices.map((v) => [
        v.dot(xAxis),
        -v.dot(yAxis),
        v.dot(depthAxis),
      ]);
      const brightness = THREE.MathUtils.clamp(
        0.72 + 0.22 * normal.dot(new THREE.Vector3(-0.3, 0.85, 0.45)),
        0.5,
        1,
      );
      const color = material.color
        .clone()
        .multiplyScalar(brightness)
        .getHexString(THREE.SRGBColorSpace);
      triangles.push({
        projected,
        color,
        alpha: material.opacity,
        depth: projected.reduce((sum, v) => sum + v[2], 0) / 3,
      });
    }
  });
  if (!triangles.length) throw Error("Empty geometry " + preview.id);
  const points = triangles.flatMap((t) => t.projected);
  const minX = Math.min(...points.map((v) => v[0])),
    maxX = Math.max(...points.map((v) => v[0]));
  const minY = Math.min(...points.map((v) => v[1])),
    maxY = Math.max(...points.map((v) => v[1]));
  const scale = Math.min(140 / (maxX - minX), 120 / (maxY - minY));
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  triangles.sort((a, b) => a.depth - b.depth);
  const polygons = triangles
    .map(
      (t) =>
        `<path d="M${t.projected.map((v) => `${(90 + (v[0] - cx) * scale).toFixed(2)},${(80 + (v[1] - cy) * scale).toFixed(2)}`).join("L")}Z" fill="#${t.color}"${t.alpha < 1 ? ` opacity="${Math.max(0.5, t.alpha)}"` : ""}/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 160" role="img"><title>LDraw part ${preview.id}</title><metadata>Derived from The LDraw Parts Library; ${manifest.source.license}. Render color is illustrative; availability unverified.</metadata>${polygons}</svg>`;
  await fs.writeFile(
    path.join(directory, "previews", preview.id + ".svg"),
    svg,
  );
  console.log(
    preview.id,
    triangles.length + " triangles",
    svg.length + " SVG bytes",
  );
}

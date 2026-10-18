/** Offline z-buffer raster of actual source part meshes; used for benchmark review and printable step images. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";
import sharp from "sharp";
import { COLORS } from "../src/domain/catalog.ts";
import { BUILDER_BY_REBRICKABLE } from "../src/domain/parts/profiles.ts";
import { placementBounds, placementPose } from "../src/domain/model-pose.ts";
import { decodeBuilderMesh } from "../src/services/builder-geometry.ts";

const root = fileURLToPath(new URL("../public", import.meta.url));
const meshes = new Map();
function meshFor(partId) {
  if (!meshes.has(partId)) {
    const profile = BUILDER_BY_REBRICKABLE.get(partId);
    if (!profile?.mesh) throw Error(`Missing real geometry for ${partId}.`);
    meshes.set(
      partId,
      readFile(root + profile.mesh.file).then((b) =>
        decodeBuilderMesh(
          b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
          profile.mesh.vertexCount,
        ),
      ),
    );
  }
  return meshes.get(partId);
}
const srgb = (hex) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};
const VIEWS = {
  perspective: [1, 0.85, 1.4],
  front: [0, 0.12, 1],
  back: [0, 0.12, -1],
  side: [1, 0.12, 0],
  left: [-1, 0.12, 0],
  top: [0.001, 1, 0.12],
};
/**
 * Render placements to a PNG buffer. `highlight` ids are drawn at full colour while
 * `ghost` ids (already built) are drawn faded, matching step-by-step instructions.
 */
export async function renderPlacements(
  placements,
  {
    view = "perspective",
    width = 640,
    height = 520,
    highlight,
    ghost,
    frame = placements,
    background = [244, 238, 229],
    outline = true,
  } = {},
) {
  const dir = new Vector3(...(VIEWS[view] || view)).normalize();
  const up =
    Math.abs(dir.y) > 0.99 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(up, dir).normalize();
  const camUp = new Vector3().crossVectors(dir, right).normalize();
  const bounds = frame.map(placementBounds);
  const min = [0, 1, 2].map((i) => Math.min(...bounds.map((b) => b.min[i]))),
    max = [0, 1, 2].map((i) => Math.max(...bounds.map((b) => b.max[i])));
  const center = new Vector3(...min.map((n, i) => (n + max[i]) / 2));
  // Fit using the projected corners of the framing box.
  let l = Infinity,
    r = -Infinity,
    b = Infinity,
    t = -Infinity;
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        const v = new Vector3(x, y, z).sub(center);
        const px = v.dot(right),
          py = v.dot(camUp);
        l = Math.min(l, px);
        r = Math.max(r, px);
        b = Math.min(b, py);
        t = Math.max(t, py);
      }
  const scale = Math.min(
    (width * 0.9) / (r - l || 1),
    (height * 0.9) / (t - b || 1),
  );
  const cx = (l + r) / 2,
    cy = (b + t) / 2;
  const light = new Vector3(-0.35, 0.85, 0.55).normalize();
  const rgb = new Uint8Array(width * height * 3);
  const depth = new Float32Array(width * height).fill(Infinity);
  const ids = new Int32Array(width * height).fill(-1);
  for (let i = 0; i < width * height; i++) rgb.set(background, i * 3);
  const hl = highlight ? new Set(highlight) : null,
    gh = ghost ? new Set(ghost) : null;
  const vertex = new Vector3(),
    normal = new Vector3();
  const sx = new Float32Array(3),
    sy = new Float32Array(3),
    sz = new Float32Array(3);
  for (let index = 0; index < placements.length; index++) {
    const piece = placements[index];
    if (hl && gh && !hl.has(piece.id) && !gh.has(piece.id)) continue;
    const profile = BUILDER_BY_REBRICKABLE.get(piece.partId);
    const mesh = await meshFor(piece.partId);
    const pose = placementPose(piece),
      rotation = new Quaternion(...pose.rotation),
      matrix = new Matrix4().compose(
        new Vector3(...pose.position),
        rotation,
        new Vector3(1, 1, 1),
      );
    const faded = gh?.has(piece.id) && !hl?.has(piece.id);
    let group = 0;
    for (let i = 0; i < mesh.positions.length; i += 9) {
      while (
        group + 1 < profile.mesh.groups.length &&
        i / 3 >=
          profile.mesh.groups[group].start + profile.mesh.groups[group].count
      )
        group++;
      const g = profile.mesh.groups[group];
      const c = srgb(
        g.code === "16" || g.code === "10000" ? COLORS[piece.color].hex : g.hex,
      );
      normal.fromArray(mesh.normals, i).applyQuaternion(rotation);
      const shade = 0.55 + 0.45 * Math.max(0, normal.dot(light));
      let cr = c.r * shade,
        cg = c.g * shade,
        cb = c.b * shade;
      if (
        COLORS[piece.color].alpha < 1 &&
        (g.code === "16" || g.code === "10000")
      ) {
        cr = 0.55 * shade + 0.15;
        cg = 0.7 * shade + 0.15;
        cb = 0.8 * shade + 0.15;
      }
      if (faded) {
        cr = cr * 0.35 + 0.62;
        cg = cg * 0.35 + 0.6;
        cb = cb * 0.35 + 0.57;
      }
      for (let v = 0; v < 3; v++) {
        vertex
          .fromArray(mesh.positions, i + v * 3)
          .applyMatrix4(matrix)
          .sub(center);
        sx[v] = width / 2 + (vertex.dot(right) - cx) * scale;
        sy[v] = height / 2 - (vertex.dot(camUp) - cy) * scale;
        sz[v] = -vertex.dot(dir);
      }
      const minX = Math.max(0, Math.floor(Math.min(sx[0], sx[1], sx[2]))),
        maxX = Math.min(width - 1, Math.ceil(Math.max(sx[0], sx[1], sx[2]))),
        minY = Math.max(0, Math.floor(Math.min(sy[0], sy[1], sy[2]))),
        maxY = Math.min(height - 1, Math.ceil(Math.max(sy[0], sy[1], sy[2])));
      const area =
        (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
      if (Math.abs(area) < 1e-9) continue;
      const R = Math.round(Math.min(1, cr) * 255),
        G = Math.round(Math.min(1, cg) * 255),
        B = Math.round(Math.min(1, cb) * 255);
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5,
            py = y + 0.5;
          const w0 =
            ((sx[1] - px) * (sy[2] - py) - (sx[2] - px) * (sy[1] - py)) / area;
          const w1 =
            ((sx[2] - px) * (sy[0] - py) - (sx[0] - px) * (sy[2] - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const z = w0 * sz[0] + w1 * sz[1] + w2 * sz[2];
          const k = y * width + x;
          if (z >= depth[k]) continue;
          depth[k] = z;
          ids[k] = index;
          rgb[k * 3] = R;
          rgb[k * 3 + 1] = G;
          rgb[k * 3 + 2] = B;
        }
    }
  }
  if (outline)
    for (let y = 1; y < height; y++)
      for (let x = 1; x < width; x++) {
        const k = y * width + x;
        if (ids[k] < 0) continue;
        if (ids[k] !== ids[k - 1] || ids[k] !== ids[k - width]) {
          rgb[k * 3] *= 0.6;
          rgb[k * 3 + 1] *= 0.6;
          rgb[k * 3 + 2] *= 0.6;
        }
      }
  return sharp(Buffer.from(rgb), { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

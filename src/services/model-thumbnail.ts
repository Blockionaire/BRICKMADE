import { Color, Matrix4, OrthographicCamera, Quaternion, Vector3 } from "three";
import { COLORS } from "@/domain/catalog";
import { BUILDER_BY_REBRICKABLE } from "@/domain/parts/profiles";
import { placementBounds, placementPose } from "@/domain/model-pose";
import { loadBuilderMesh } from "./builder-geometry";
import type { HouseModel } from "@/domain/types";
const cached = new Map<string, Promise<string>>();
/** A bounded 2D raster projection of actual source triangles, with no extra WebGL contexts. */
export function renderModelThumbnail(model: HouseModel): Promise<string> {
  const key = JSON.stringify(
    model.placements
      .map((p) => [p.id, p.partId, p.color, p.position, p.rotation])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
  const old = cached.get(key);
  if (old) return old;
  const task = render(model).catch((e) => {
    cached.delete(key);
    throw e;
  });
  cached.set(key, task);
  if (cached.size > 24) cached.delete(cached.keys().next().value!);
  return task;
}
async function render(model: HouseModel) {
  const meshes = new Map(
    await Promise.all(
      [...new Set(model.placements.map((p) => p.partId))].map(async (id) => {
        const profile = BUILDER_BY_REBRICKABLE.get(id);
        if (!profile) throw Error("Missing real geometry.");
        return [id, await loadBuilderMesh(profile.id)] as const;
      }),
    ),
  );
  const bounds = model.placements.map(placementBounds);
  const min = [0, 1, 2].map((i) => Math.min(...bounds.map((b) => b.min[i]))),
    max = [0, 1, 2].map((i) => Math.max(...bounds.map((b) => b.max[i])));
  const center = new Vector3(
    ...(min.map((n, i) => (n + max[i]) / 2) as [number, number, number]),
  );
  const extent = Math.max(...max.map((n, i) => n - min[i])) * 0.9;
  const camera = new OrthographicCamera(
    -extent * 1.2,
    extent * 1.2,
    extent,
    -extent,
    0.1,
    1000,
  );
  camera.position
    .copy(center)
    .add(new Vector3(1, 0.85, 1.4).normalize().multiplyScalar(100));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const light = new Vector3(-0.3, 0.85, 0.5).normalize(),
    vertex = new Vector3(),
    normal = new Vector3();
  type Face = { points: [number, number][]; depth: number; color: string };
  const faces: Face[] = [];
  for (let p = 0; p < model.placements.length; p++) {
    const piece = model.placements[p],
      profile = BUILDER_BY_REBRICKABLE.get(piece.partId)!,
      mesh = meshes.get(piece.partId)!;
    const pose = placementPose(piece),
      rotation = new Quaternion(...pose.rotation),
      matrix = new Matrix4().compose(
        new Vector3(...pose.position),
        rotation,
        new Vector3(1, 1, 1),
      );
    let groupIndex = 0;
    for (let i = 0; i < mesh.positions.length; i += 9) {
      while (
        groupIndex + 1 < profile.mesh.groups.length &&
        i / 3 >=
          profile.mesh.groups[groupIndex].start +
            profile.mesh.groups[groupIndex].count
      )
        groupIndex++;
      const group = profile.mesh.groups[groupIndex],
        base = new Color(
          group.code === "16" || group.code === "10000"
            ? COLORS[piece.color].hex
            : group.hex,
        );
      normal.fromArray(mesh.normals, i).applyQuaternion(rotation);
      base.multiplyScalar(0.66 + 0.34 * Math.max(0, normal.dot(light)));
      const points: [number, number][] = [];
      let depth = 0;
      for (let v = 0; v < 3; v++) {
        vertex
          .fromArray(mesh.positions, i + v * 3)
          .applyMatrix4(matrix)
          .project(camera);
        points.push([vertex.x, vertex.y]);
        depth += vertex.z / 3;
      }
      faces.push({ points, depth, color: `#${base.getHexString()}` });
    }
    if (p % 16 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  faces.sort((a, b) => b.depth - a.depth);
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Thumbnail rendering unavailable.");
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (const face of faces)
    for (const [x, y] of face.points) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.max(top, y);
      bottom = Math.min(bottom, y);
    }
  const scale = Math.min(424 / (right - left), 344 / (top - bottom)),
    cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  ctx.fillStyle = "#f4eee5";
  ctx.fillRect(0, 0, 480, 400);
  for (const face of faces) {
    ctx.beginPath();
    face.points.forEach(([x, y], i) => {
      const px = 240 + (x - cx) * scale,
        py = 200 - (y - cy) * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = face.color;
    ctx.fill();
  }
  return canvas.toDataURL("image/png");
}

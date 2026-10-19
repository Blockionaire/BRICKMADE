import * as THREE from "three";
import { COLORS } from "@/domain/catalog";
import { BUILDER_BY_REBRICKABLE } from "@/domain/parts/profiles";
import { placementBounds, placementPose } from "@/domain/model-pose";
import { createPartGeometry, loadBuilderMesh } from "./builder-geometry";
import type { CameraView, HouseModel } from "@/domain/types";

const DIRECTIONS: Record<CameraView, [number, number, number]> = {
  perspective: [23, 19, 28],
  front: [0, 9, 34],
  back: [0, 9, -34],
  side: [34, 9, 0],
  left: [-34, 9, 0],
  top: [0.01, 38, 6],
};
const FADED = new THREE.Color("#ece7dd");

/**
 * Offscreen renderer for printed instructions: one image per step from the actual
 * part meshes. The step's new pieces are drawn in full colour, earlier pieces faded,
 * later pieces hidden — the same placements the parts list and builder use.
 */
export async function createStepRenderer(
  model: HouseModel,
  { width = 520, height = 420 }: { width?: number; height?: number } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfffbf4, 0x9ca39a, 2.6));
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.6);
  sun.position.set(-12, 30, 18);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdce6ed, 1.4);
  fill.position.set(20, 8, -14);
  scene.add(fill);
  const geometries = new Map<string, THREE.BufferGeometry>();
  await Promise.all(
    [...new Set(model.placements.map((p) => p.partId))].map(async (partId) => {
      const profile = BUILDER_BY_REBRICKABLE.get(partId);
      if (!profile) throw Error("Missing real geometry.");
      geometries.set(
        partId,
        createPartGeometry(profile.id, await loadBuilderMesh(profile.id)),
      );
    }),
  );
  const materials = new Map<string, THREE.MeshStandardMaterial[]>();
  const materialsFor = (partId: string, color: string, faded: boolean) => {
    const key = `${partId}:${color}:${faded}`;
    if (!materials.has(key)) {
      const profile = BUILDER_BY_REBRICKABLE.get(partId)!;
      const c = COLORS[color as keyof typeof COLORS];
      materials.set(
        key,
        profile.mesh.groups.map((g) => {
          const inherited = g.code === "16" || g.code === "10000";
          const base = new THREE.Color(inherited ? c.hex : g.hex);
          if (faded) base.lerp(FADED, 0.62);
          const opacity = inherited ? c.alpha : g.alpha / 255;
          return new THREE.MeshStandardMaterial({
            color: base,
            roughness: 0.35,
            metalness: 0.02,
            opacity: faded ? Math.min(opacity, 0.9) : opacity,
            transparent: opacity < 1 || faded,
            depthWrite: opacity === 1,
            side: THREE.DoubleSide,
          });
        }),
      );
    }
    return materials.get(key)!;
  };
  const meshes = model.placements.map((p) => {
    const pose = placementPose(p);
    const mesh = new THREE.Mesh(
      geometries.get(p.partId)!,
      materialsFor(p.partId, p.color, false),
    );
    mesh.position.set(...pose.position);
    mesh.quaternion.set(...pose.rotation);
    mesh.userData = { piece: p };
    scene.add(mesh);
    return mesh;
  });
  const bounds = model.placements.map(placementBounds);
  const min = [0, 1, 2].map((i) => Math.min(...bounds.map((b) => b.min[i])));
  const max = [0, 1, 2].map((i) => Math.max(...bounds.map((b) => b.max[i])));
  const center = new THREE.Vector3(...min.map((n, i) => (n + max[i]) / 2));
  const radius = Math.hypot(...max.map((n, i) => n - min[i])) / 2;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  return {
    /** Draw the build after this step; `finished` shows every piece in full colour. */
    render(stepNumber: number, { finished = false } = {}) {
      const step = model.steps[stepNumber - 1];
      for (const mesh of meshes) {
        const piece = mesh.userData.piece as HouseModel["placements"][number];
        mesh.visible = piece.step <= stepNumber;
        mesh.material = materialsFor(
          piece.partId,
          piece.color,
          !finished && piece.step < stepNumber,
        );
      }
      const view = finished
        ? "perspective"
        : (step?.suggestedView ?? "perspective");
      const direction = new THREE.Vector3(...DIRECTIONS[view]).normalize();
      camera.position.copy(center).addScaledVector(direction, radius * 6);
      camera.up.set(0, 1, 0);
      camera.lookAt(center);
      const aspect = width / height,
        extent = radius * 1.08;
      camera.left = -extent * aspect;
      camera.right = extent * aspect;
      camera.top = extent;
      camera.bottom = -extent;
      camera.near = radius;
      camera.far = radius * 12;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return canvas.toDataURL("image/png");
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((list) => list.forEach((m) => m.dispose()));
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

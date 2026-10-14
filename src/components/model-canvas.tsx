"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BUILDER_BY_REBRICKABLE } from "@/domain/parts/profiles";
import {
  loadBuilderMesh,
  createPartGeometry,
  type DecodedMesh,
} from "@/services/builder-geometry";
import { CATALOG, COLORS } from "@/domain/catalog";
import type {
  CameraView,
  HouseModel,
  Placement,
  PlacementMode,
} from "@/domain/types";
import { ModelThumbnail } from "./model-thumbnail";
export type { CameraView } from "@/domain/types";

type Binding = {
  piece: Placement;
  body: THREE.InstancedMesh;
  index: number;
  offset: number;
};
type Studio = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  group: THREE.Group;
  accents: THREE.Group;
  guides: THREE.Group;
  bindings: Binding[];
  bindingById: Map<string, Binding>;
  render: () => void;
  resize: () => void;
  span: number;
  cancelPlacement: () => void;
  cancelCamera: () => void;
};
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
function disposeGroup(group: THREE.Group, materials = false) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (materials)
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((m) => m.dispose());
    }
  });
  group.clear();
}

export default function ModelCanvas({
  model,
  step,
  view = "perspective",
  zoom = 1,
  highlight = true,
  selectedPlacementId,
  matchingKey,
  onPick,
  placementMode = "assembled",
  replay = 0,
  focus,
  cameraRequest = 0,
}: {
  model: HouseModel;
  step?: number;
  view?: CameraView;
  zoom?: number;
  highlight?: boolean;
  selectedPlacementId?: string;
  matchingKey?: string;
  onPick?: (p: Placement | null) => void;
  placementMode?: PlacementMode;
  replay?: number;
  focus?: [number, number, number];
  cameraRequest?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const studio = useRef<Studio | null>(null);
  const pickCallback = useRef(onPick);
  const materialCache = useRef(new Map<string, THREE.MeshStandardMaterial>());
  const motionPreference = useRef(false);
  const [failed, setFailed] = useState(false);
  const meshKey = [...new Set(model.placements.map((p) => p.partId))]
    .sort()
    .join(",");
  const [meshes, setMeshes] = useState<{
    key: string;
    data: Map<string, DecodedMesh>;
  }>();
  const [geometryError, setGeometryError] = useState(false);
  const geometryReady = meshes?.key === meshKey;
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      meshKey.split(",").map(async (id) => {
        const profile = BUILDER_BY_REBRICKABLE.get(id);
        if (!profile) throw Error("Unsupported builder part.");
        return [id, await loadBuilderMesh(profile.id)] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setMeshes({ key: meshKey, data: new Map(entries) });
          setGeometryError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setGeometryError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [meshKey]);
  useEffect(() => {
    pickCallback.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.dataset.model = "house";
    renderer.domElement.setAttribute("aria-busy", "true");
    element.appendChild(renderer.domElement);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionPreference.current = preference.matches;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfffbf4, 0x9ca39a, 2.5));
    const light = new THREE.DirectionalLight(0xfff2dc, 4);
    light.position.set(-16, 28, 18);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, {
      left: -25,
      right: 25,
      top: 25,
      bottom: -25,
    });
    light.shadow.normalBias = 0.07;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xdce6ed, 1.5);
    fill.position.set(14, 9, -14);
    scene.add(fill);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 150),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(34, 34, "#cac9bc", "#dbdad1");
    grid.position.y = -0.065;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.2;
    scene.add(grid);
    const group = new THREE.Group(),
      accents = new THREE.Group(),
      guides = new THREE.Group();
    scene.add(group, accents, guides);
    const camera = new THREE.OrthographicCamera(-18, 18, 18, -18, 0.1, 200);
    camera.position.set(23, 19, 28);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 3, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minZoom = 0.6;
    controls.maxZoom = 3.2;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.update();
    const current: Studio = {
      renderer,
      scene,
      camera,
      controls,
      group,
      accents,
      guides,
      bindings: [],
      bindingById: new Map(),
      span: 15,
      render: () => {},
      resize: () => {},
      cancelPlacement: () => {},
      cancelCamera: () => {},
    };
    const accentMatrix = new THREE.Object3D();
    const syncAccents = () => {
      current.accents.children.forEach((object) => {
        if (!(object instanceof THREE.InstancedMesh)) return;
        (object.userData.pieceIds as string[]).forEach((id, index) => {
          const binding = current.bindingById.get(id);
          if (!binding) return;
          const p = binding.piece;
          accentMatrix.position.set(
            p.position[0],
            p.position[1] + binding.offset,
            p.position[2],
          );
          accentMatrix.rotation.set(0, p.rotated ? Math.PI / 2 : 0, 0);
          accentMatrix.updateMatrix();
          object.setMatrixAt(index, accentMatrix.matrix);
        });
        object.instanceMatrix.needsUpdate = true;
      });
    };
    let renderQueued = false;
    current.render = () => {
      if (studio.current !== current || renderQueued) return;
      renderQueued = true;
      queueMicrotask(() => {
        renderQueued = false;
        if (studio.current !== current) return;
        syncAccents();
        renderer.domElement.dataset.renderCount = String(
          Number(renderer.domElement.dataset.renderCount ?? 0) + 1,
        );
        renderer.render(scene, camera);
      });
    };
    current.resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      const ratio = width / height;
      const verticalSpan = Math.max(current.span, current.span / ratio);
      camera.left = -verticalSpan * ratio;
      camera.right = verticalSpan * ratio;
      camera.top = verticalSpan;
      camera.bottom = -verticalSpan;
      camera.updateProjectionMatrix();
      current.render();
    };
    studio.current = current;
    const observer = new ResizeObserver(current.resize);
    observer.observe(element);
    current.resize();
    let dampingFrame = 0;
    const requestRender = () => {
      if (renderer.domElement.dataset.cameraState === "moving") return;
      cancelAnimationFrame(dampingFrame);
      dampingFrame = requestAnimationFrame(() => {
        controls.update();
        current.render();
      });
    };
    const interruptCamera = () => {
      current.cancelCamera();
    };
    controls.addEventListener("change", requestRender);
    controls.addEventListener("start", interruptCamera);
    let pointerStart: { x: number; y: number; id: number } | null = null;
    const down = (event: PointerEvent) => {
      pointerStart =
        event.isPrimary && event.button === 0
          ? { x: event.clientX, y: event.clientY, id: event.pointerId }
          : null;
    };
    const cancel = () => {
      pointerStart = null;
    };
    const raycaster = new THREE.Raycaster();
    const up = (event: PointerEvent) => {
      const start = pointerStart;
      pointerStart = null;
      if (
        !start ||
        start.id !== event.pointerId ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 ||
        !pickCallback.current
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const meshes = group.children.filter(
        (child) => child instanceof THREE.InstancedMesh,
      );
      const hit = raycaster.intersectObjects(meshes, false)[0];
      pickCallback.current(
        hit?.instanceId !== undefined
          ? (hit.object.userData.placements[hit.instanceId] as Placement)
          : null,
      );
    };
    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", cancel);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    const preferenceChanged = () => {
      motionPreference.current = preference.matches;
      if (preference.matches) {
        current.cancelCamera();
        current.cancelPlacement();
      }
    };
    preference.addEventListener("change", preferenceChanged);
    const materials = materialCache.current;
    return () => {
      studio.current = null;
      current.cancelCamera();
      current.cancelPlacement();
      cancelAnimationFrame(dampingFrame);
      observer.disconnect();
      controls.removeEventListener("change", requestRender);
      controls.removeEventListener("start", interruptCamera);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      preference.removeEventListener("change", preferenceChanged);
      disposeGroup(group);
      disposeGroup(accents, true);
      disposeGroup(guides, true);
      materials.forEach((m) => m.dispose());
      materials.clear();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const current = studio.current;
    if (!current || !geometryReady || !meshes) return;
    current.cancelPlacement();
    disposeGroup(current.group);
    disposeGroup(current.guides, true);
    current.bindings = [];
    current.bindingById.clear();
    const groups = new Map<string, Placement[]>();
    for (const p of model.placements) {
      if (step && p.step > step) continue;
      const active = !!step && p.step === step;
      const key = `${p.partId}:${p.color}:${active}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    const matrix = new THREE.Object3D();
    for (const [key, pieces] of groups) {
      const first = pieces[0];
      const active = !!step && first.step === step;
      const materialKey = `${first.color}:${active && highlight ? "active" : step && highlight ? "ghost" : "normal"}`;
      let material = materialCache.current.get(materialKey);
      if (!material) {
        const color = new THREE.Color(COLORS[first.color].hex);
        if (step && highlight && !active)
          color.lerp(new THREE.Color("#ded9ce"), 0.45);
        material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.32,
          metalness: 0.025,
          emissive: active && highlight ? "#8d4124" : "#000000",
          emissiveIntensity: active && highlight ? 0.13 : 0,
        });
        materialCache.current.set(materialKey, material);
      }
      const profile = BUILDER_BY_REBRICKABLE.get(first.partId)!;
      const body = new THREE.InstancedMesh(
        createPartGeometry(profile.id, meshes.data.get(first.partId)!),
        material,
        pieces.length,
      );
      body.name = key;
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.placements = pieces;
      body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      pieces.forEach((p, index) => {
        const binding: Binding = {
          piece: p,
          body,
          index,
          offset: 0,
        };
        current.bindings.push(binding);
        current.bindingById.set(p.id, binding);
        matrix.position.set(...p.position);
        matrix.rotation.set(0, p.rotated ? Math.PI / 2 : 0, 0);
        matrix.updateMatrix();
        body.setMatrixAt(index, matrix.matrix);
      });
      current.group.add(body);
    }
    // Destination outlines stay on the model while the incoming bricks descend.
    if (step && highlight) {
      const points: number[] = [];
      for (const p of model.placements.filter((p) => p.step === step)) {
        const part = CATALOG[p.partId];
        const box = new THREE.BoxGeometry(part.width, part.height, part.depth);
        const edges = new THREE.EdgesGeometry(box);
        box.dispose();
        matrix.position.set(...p.position);
        matrix.rotation.set(0, p.rotated ? Math.PI / 2 : 0, 0);
        matrix.updateMatrix();
        const vertices = edges.getAttribute("position");
        for (let i = 0; i < vertices.count; i++) {
          const v = new THREE.Vector3()
            .fromBufferAttribute(vertices, i)
            .applyMatrix4(matrix.matrix);
          points.push(v.x, v.y, v.z);
        }
        edges.dispose();
      }
      const geometry = new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(points, 3),
      );
      current.guides.add(
        new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({
            color: "#ec6447",
            transparent: true,
            opacity: 0.8,
          }),
        ),
      );
    }
    current.span = model.settings.size === "large" ? 17.5 : 15;
    const canvas = current.renderer.domElement;
    canvas.dataset.geometry = "ldraw";
    canvas.setAttribute("aria-busy", "false");
    canvas.dataset.geometryParts = String(meshes.data.size);
    canvas.dataset.pieceCount = String(current.bindings.length);
    canvas.dataset.totalPieces = String(model.placements.length);
    canvas.setAttribute(
      "aria-label",
      step
        ? `House model at step ${step}. Tap a brick to identify it. Drag to rotate.`
        : "Interactive brick house. Drag to rotate, pinch or scroll to zoom.",
    );
    current.resize();
    return () => {
      current.cancelPlacement();
      disposeGroup(current.group);
      disposeGroup(current.guides, true);
      current.bindings = [];
      current.bindingById.clear();
    };
  }, [model, step, highlight, geometryReady, meshes]);

  useEffect(() => {
    const current = studio.current;
    if (!current || !geometryReady) return;
    disposeGroup(current.accents, true);
    const matching = current.bindings.filter(
      (binding) =>
        binding.piece.id === selectedPlacementId ||
        (!!matchingKey &&
          `${binding.piece.partId}:${binding.piece.color}` === matchingKey),
    );
    const shapes = new Map<string, Binding[]>();
    matching.forEach((binding) => {
      if (!shapes.has(binding.piece.partId))
        shapes.set(binding.piece.partId, []);
      shapes.get(binding.piece.partId)!.push(binding);
    });
    for (const [partId, bindings] of shapes) {
      const part = CATALOG[partId];
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(
          part.width + 0.02,
          part.height + 0.02,
          part.depth + 0.02,
        ),
        new THREE.MeshStandardMaterial({
          color: matchingKey ? "#7ee5c5" : "#ffdd80",
          emissive: matchingKey ? "#1cb79e" : "#ffc96b",
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
        bindings.length,
      );
      mesh.userData.pieceIds = bindings.map((b) => b.piece.id);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      current.accents.add(mesh);
    }
    current.renderer.domElement.dataset.matchedPieces = matchingKey
      ? String(matching.length)
      : "0";
    current.render();
    return () => {
      disposeGroup(current.accents, true);
    };
  }, [
    model,
    step,
    highlight,
    selectedPlacementId,
    matchingKey,
    geometryReady,
    meshes,
  ]);

  useEffect(() => {
    const current = studio.current;
    if (!current || !geometryReady) return;
    current.cancelPlacement();
    const incoming = current.bindings.filter((b) => b.piece.step === step);
    const matrix = new THREE.Object3D();
    const update = (binding: Binding, offset: number) => {
      const p = binding.piece;
      binding.offset = offset;
      matrix.position.set(p.position[0], p.position[1] + offset, p.position[2]);
      matrix.rotation.set(0, p.rotated ? Math.PI / 2 : 0, 0);
      matrix.updateMatrix();
      binding.body.setMatrixAt(binding.index, matrix.matrix);
      binding.body.instanceMatrix.needsUpdate = true;
    };
    const canvas = current.renderer.domElement;
    let frame = 0,
      started: number | undefined;
    const recordPose = () => {
      // Read the actual matrices submitted to WebGL, not the domain targets.
      canvas.dataset.placementPose = JSON.stringify(
        incoming.map((b) => ({
          id: b.piece.id,
          matrix: Array.from(
            b.body.instanceMatrix.array.slice(b.index * 16, b.index * 16 + 16),
          ),
        })),
      );
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      incoming.forEach((b) => update(b, 0));
      current.group.children.forEach((object) => {
        if (object instanceof THREE.InstancedMesh) {
          object.computeBoundingSphere();
          object.computeBoundingBox();
        }
      });
      recordPose();
      canvas.dataset.placementState = "settled";
      current.render();
    };
    current.cancelPlacement = finish;
    if (!step || placementMode === "assembled" || motionPreference.current) {
      finish();
      return;
    }
    // Bound the raycast volumes to include the full animation path.
    incoming.forEach((b) => update(b, 2.8));
    current.group.children.forEach((object) => {
      if (object instanceof THREE.InstancedMesh) {
        object.computeBoundingSphere();
        if (object.boundingSphere) object.boundingSphere.radius += 4;
      }
    });
    recordPose();
    canvas.dataset.placementState = "lifting";
    current.render();
    // Whole layers keep a short wave of motion even when they contain hundreds of pieces.
    const stagger = Math.min(0.055, 0.5 / Math.max(1, incoming.length - 1));
    const animate = (time: number) => {
      started ??= time;
      const elapsed = (time - started) / 1000;
      incoming.forEach((b, i) =>
        update(b, 2.8 * (1 - ease((elapsed - 0.3 - i * stagger) / 0.75))),
      );
      canvas.dataset.placementState = "placing";
      current.render();
      if (elapsed < 1.08 + incoming.length * stagger)
        frame = requestAnimationFrame(animate);
      else finish();
    };
    frame = requestAnimationFrame(animate);
    return finish;
  }, [model, step, highlight, placementMode, replay, geometryReady, meshes]);

  const focusX = focus?.[0] ?? 0,
    focusY = focus?.[1] ?? 3,
    focusZ = focus?.[2] ?? 0;
  useEffect(() => {
    const current = studio.current;
    if (!current) return;
    current.cancelCamera();
    const { camera, controls } = current;
    const directions: Record<CameraView, [number, number, number]> = {
      perspective: [23, 19, 28],
      front: [0, 5, 34],
      back: [0, 5, -34],
      side: [34, 5, 0],
      left: [-34, 5, 0],
      top: [0, 38, 0.01],
    };
    // A gentle bias toward the group keeps the whole model in frame.
    const target = new THREE.Vector3(
      focusX * 0.16,
      Math.max(2, focusY * 0.6),
      focusZ * 0.16,
    );
    const end = target.clone().add(new THREE.Vector3(...directions[view]));
    const start = camera.position.clone(),
      startTarget = controls.target.clone(),
      startZoom = camera.zoom;
    let frame = 0,
      started: number | undefined;
    const settle = () => {
      camera.position.copy(end);
      controls.target.copy(target);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      controls.update();
      current.render();
    };
    const cancel = () => {
      cancelAnimationFrame(frame);
      current.renderer.domElement.dataset.cameraState = "manual";
    };
    current.cancelCamera = cancel;
    const animation = (time: number) => {
      started ??= time;
      const t = Math.min(1, (time - started) / 650),
        k = ease(t);
      // Spherical interpolation orbits around the target rather than passing through the model.
      const from = new THREE.Spherical().setFromVector3(
        start.clone().sub(startTarget),
      );
      const to = new THREE.Spherical().setFromVector3(end.clone().sub(target));
      let thetaDelta = to.theta - from.theta;
      if (thetaDelta > Math.PI) thetaDelta -= Math.PI * 2;
      if (thetaDelta < -Math.PI) thetaDelta += Math.PI * 2;
      const spherical = new THREE.Spherical(
        THREE.MathUtils.lerp(from.radius, to.radius, k),
        THREE.MathUtils.lerp(from.phi, to.phi, k),
        from.theta + thetaDelta * k,
      );
      controls.target.lerpVectors(startTarget, target, k);
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3().setFromSpherical(spherical));
      camera.zoom = THREE.MathUtils.lerp(startZoom, zoom, k);
      camera.updateProjectionMatrix();
      controls.update();
      current.render();
      if (t < 1) frame = requestAnimationFrame(animation);
      else {
        settle();
        current.renderer.domElement.dataset.cameraState = "settled";
      }
    };
    if (motionPreference.current) {
      settle();
      current.renderer.domElement.dataset.cameraState = "settled";
    } else {
      current.renderer.domElement.dataset.cameraState = "moving";
      frame = requestAnimationFrame(animation);
    }
    return cancel;
  }, [view, zoom, focusX, focusY, focusZ, cameraRequest]);

  return (
    <div ref={container} className="canvas-container">
      {!failed && !geometryReady && !geometryError && (
        <div className="viewer-loading" role="status">
          <span className="loading-dot" /> Loading real part geometry…
        </div>
      )}
      {geometryError && !failed && (
        <div className="viewer-fallback">
          <ModelThumbnail model={model} name="Simplified model preview" />
          <p>
            The detailed geometry could not load. Reload to retry. This preview
            is simplified.
          </p>
        </div>
      )}
      {failed && (
        <div className="viewer-fallback">
          <ModelThumbnail model={model} name="Your build" />
          <p>
            3D isn’t available here. Your parts and instructions still work.
          </p>
        </div>
      )}
    </div>
  );
}

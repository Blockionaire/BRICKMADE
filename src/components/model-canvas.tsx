"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CATALOG, COLORS } from "@/domain/catalog";
import type { HouseModel, Placement } from "@/domain/types";

export type CameraView = "perspective" | "front" | "side" | "top";

export default function ModelCanvas({
  model,
  step,
  view = "perspective",
  zoom = 1,
  highlight = true,
}: {
  model: HouseModel;
  step?: number;
  view?: CameraView;
  zoom?: number;
  highlight?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialCache = useRef(new Map<string, THREE.Material>());
  const sceneRef = useRef<{
    camera: THREE.OrthographicCamera;
    controls: OrbitControls;
    renderer: THREE.WebGLRenderer;
    render: () => void;
  } | null>(null);
  const [failed, setFailed] = useState(false);
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
    renderer.toneMappingExposure = 1.35;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.dataset.model = "house";
    element.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    const materials = materialCache.current;
    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      materials.forEach((material) => material.dispose());
      materials.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const element = container.current;
    const renderer = rendererRef.current;
    if (!element || !renderer) return;
    const materials = materialCache.current;
    function cachedMaterial<T extends THREE.Material>(
      key: string,
      create: () => T,
    ): T {
      const existing = materials.get(key);
      if (existing) return existing as T;
      const material = create();
      materials.set(key, material);
      return material;
    }
    renderer.domElement.setAttribute(
      "aria-label",
      step
        ? `House model at step ${step}. Drag to rotate, pinch or scroll to zoom.`
        : "Interactive brick house. Drag to rotate, pinch or scroll to zoom.",
    );
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-18, 18, 18, -18, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 3, 0);
    camera.position.set(23, 19, 28);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minZoom = 0.6;
    controls.maxZoom = 2.8;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.enablePan = true;
    controls.update();
    const ambient = new THREE.HemisphereLight(0xfffbf4, 0xb6b8a1, 2.6);
    scene.add(ambient);
    const light = new THREE.DirectionalLight(0xfff2dc, 4);
    light.position.set(-16, 28, 18);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -24;
    light.shadow.camera.right = 24;
    light.shadow.camera.top = 24;
    light.shadow.camera.bottom = -24;
    light.shadow.normalBias = 0.07;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xdce6ed, 1.6);
    fill.position.set(14, 9, -14);
    scene.add(fill);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 150),
      cachedMaterial(
        "ground",
        () => new THREE.ShadowMaterial({ opacity: 0.13 }),
      ),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const groups = new Map<string, Placement[]>();
    for (const p of model.placements) {
      if (step && p.step > step) continue;
      const active = !!step && p.step === step && highlight;
      const key = `${p.partId}:${p.color}:${active}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    const studGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.15, 12);
    const matrix = new THREE.Object3D();
    const outlinePositions: number[] = [];
    for (const entries of groups.values()) {
      const first = entries[0];
      const part = CATALOG[first.partId];
      const active = !!step && first.step === step && highlight;
      const color = new THREE.Color(COLORS[first.color].hex);
      if (step && !active && highlight)
        color.lerp(new THREE.Color("#d7d1c3"), 0.6);
      const mode = active ? "active" : step && highlight ? "ghost" : "normal";
      const material = cachedMaterial(
        `${first.color}:${mode}`,
        () =>
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.36,
            metalness: 0.02,
            emissive: active ? "#995421" : "#000000",
            emissiveIntensity: active ? 0.18 : 0,
          }),
      );
      const geometry = new RoundedBoxGeometry(
        part.width - 0.055,
        part.height - 0.035,
        part.depth - 0.055,
        2,
        0.035,
      );
      const bodies = new THREE.InstancedMesh(
        geometry,
        material,
        entries.length,
      );
      bodies.castShadow = true;
      bodies.receiveShadow = true;
      const studs = part.studs
        ? new THREE.InstancedMesh(
            studGeometry,
            material,
            entries.length * part.width * part.depth,
          )
        : null;
      let studIndex = 0;
      let edges: THREE.EdgesGeometry | null = null;
      if (active) {
        const box = new THREE.BoxGeometry(
          part.width - 0.03,
          part.height - 0.02,
          part.depth - 0.03,
        );
        edges = new THREE.EdgesGeometry(box);
        box.dispose();
      }
      entries.forEach((p, i) => {
        matrix.position.set(...p.position);
        matrix.rotation.set(0, p.rotated ? Math.PI / 2 : 0, 0);
        matrix.updateMatrix();
        bodies.setMatrixAt(i, matrix.matrix);
        if (edges) {
          const points = edges.getAttribute("position");
          for (let j = 0; j < points.count; j++) {
            const x = points.getX(j);
            const z = points.getZ(j);
            outlinePositions.push(
              p.position[0] + (p.rotated ? z : x),
              p.position[1] + points.getY(j),
              p.position[2] + (p.rotated ? -x : z),
            );
          }
        }
        if (studs)
          for (let x = 0; x < part.width; x++)
            for (let z = 0; z < part.depth; z++) {
              const dx = x + 0.5 - part.width / 2;
              const dz = z + 0.5 - part.depth / 2;
              matrix.position.set(
                p.position[0] + (p.rotated ? dz : dx),
                p.position[1] + part.height / 2 + 0.06,
                p.position[2] + (p.rotated ? -dx : dz),
              );
              matrix.rotation.set(0, 0, 0);
              matrix.updateMatrix();
              studs.setMatrixAt(studIndex++, matrix.matrix);
            }
      });
      edges?.dispose();
      scene.add(bodies);
      if (studs) {
        studs.castShadow = true;
        scene.add(studs);
      }
    }
    if (outlinePositions.length) {
      const outlines = new THREE.BufferGeometry();
      outlines.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(outlinePositions, 3),
      );
      scene.add(
        new THREE.LineSegments(
          outlines,
          cachedMaterial(
            "outline",
            () =>
              new THREE.LineBasicMaterial({
                color: "#b74630",
                transparent: true,
                opacity: 0.9,
              }),
          ),
        ),
      );
    }
    const render = () => renderer.render(scene, camera);
    sceneRef.current = { camera, controls, renderer, render };
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      const span = model.settings.size === "large" ? 17.5 : 15;
      const ratio = width / height;
      camera.left = -span * ratio;
      camera.right = span * ratio;
      camera.top = span;
      camera.bottom = -span;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    // Render on demand; damping emits change events until the camera settles.
    let frame = 0;
    const animate = () => {
      controls.update();
      render();
    };
    const requestRender = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(animate);
    };
    controls.addEventListener("change", requestRender);
    render();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometries.add(object.geometry);
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      geometries.forEach((g) => g.dispose());
      light.shadow.dispose();
      sceneRef.current = null;
    };
  }, [model, step, highlight]);

  useEffect(() => {
    const current = sceneRef.current;
    if (!current) return;
    const { camera, controls, render } = current;
    const positions: Record<CameraView, [number, number, number]> = {
      perspective: [23, 19, 28],
      front: [0, 9, 34],
      side: [34, 9, 0],
      top: [0, 38, 0.01],
    };
    camera.position.set(...positions[view]);
    camera.zoom = zoom;
    controls.target.set(0, 3, 0);
    camera.updateProjectionMatrix();
    controls.update();
    render();
  }, [view, zoom, model, step, highlight]);

  return (
    <div ref={container} className="canvas-container">
      {failed && (
        <div className="viewer-fallback">
          <HousePoster />
          <p>
            3D isn’t available in this browser.
            <br />
            You can still explore the parts and instructions.
          </p>
        </div>
      )}
    </div>
  );
}

export function HousePoster() {
  return (
    <svg
      viewBox="0 0 480 360"
      role="img"
      aria-label="Illustration of the compact house"
      className="house-poster"
    >
      <ellipse
        cx="245"
        cy="296"
        rx="169"
        ry="28"
        fill="#3b412b"
        opacity=".09"
      />
      <path d="m78 256 193 42 133-78-190-42Z" fill="#a6ad83" />
      <path d="m78 256 193 42v12L78 269Z" fill="#8b986e" />
      <path d="m129 228 128 30V143l-128-30Z" fill="#dfcaa3" />
      <path d="m257 258 100-59V84l-100 59Z" fill="#c3af89" />
      <path d="m112 115 127-72 139 39-124 75Z" fill="#c96b4f" />
      <path d="m112 115 142 42-16-67-83-22Z" fill="#ad4935" />
      <path d="m254 157 124-75-22-7-122 74Z" fill="#873827" />
      <path d="m281 79 27 7V41l-27-7Z" fill="#6b4834" />
      <path d="m308 86 16-10V30l-16 11Z" fill="#4d3325" />
      <path d="m281 34 16-10 27 6-16 11Z" fill="#815c43" />
      <path d="m185 241 29 7v-59l-29-7Z" fill="#6b4834" />
      <path d="m147 168 23 6v30l-23-6Zm79 19 19 5v30l-19-5Z" fill="#719ba3" />
      <path
        d="m278 162 23-14v31l-23 14Zm43-25 23-14v31l-23 14Z"
        fill="#567e87"
      />
      <path
        d="m147 184 23 6m-12-19v30m68 1 19 5"
        stroke="#dfcaa3"
        strokeWidth="3"
      />
      <path d="m185 249 29 7-19 13-30-7Z" fill="#c8c4ba" />
      <g fill="#627b51">
        <rect x="100" y="226" width="29" height="27" rx="5" />
        <rect x="322" y="232" width="28" height="26" rx="5" />
      </g>
      <g fill="#e4b757">
        <circle cx="110" cy="226" r="4" />
        <circle cx="337" cy="232" r="4" />
      </g>
    </svg>
  );
}

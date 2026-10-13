"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LDrawLoader } from "three/examples/jsm/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/examples/jsm/materials/LDrawConditionalLineMaterial.js";
import { RotateCcw } from "lucide-react";
import { assetPath } from "@/lib/asset-path";
import type { LibraryColor, LibraryPreview } from "@/domain/library/types";

export default function LibraryPartViewer({
  preview,
  color,
  name,
}: {
  preview: LibraryPreview;
  color: LibraryColor;
  name: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const reset = useRef<() => void>(() => {});
  const colorRef = useRef(color);
  const recolor = useRef<(value: LibraryColor) => void>(() => {});
  useEffect(() => {
    colorRef.current = color;
    recolor.current(color);
  }, [color]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    const target = host.current;
    if (!target) return;
    const element = target;
    const controller = new AbortController();
    let disposed = false;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let model: THREE.Group | undefined;
    let observer: ResizeObserver | undefined;
    let cancelFrame = 0;
    const disposeModel = (group: THREE.Group) => {
      const materials = new Set<THREE.Material>();
      group.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          object.geometry.dispose();
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach((m) => materials.add(m));
        }
      });
      materials.forEach((m) => m.dispose());
    };
    async function start() {
      try {
        const response = await fetch(assetPath(preview.file), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Preview unavailable");
        const raw = await response.text();
        const activeColor = colorRef.current;
        const document = raw
          .replace(
            "0 FILE main.ldr",
            `0 FILE main.ldr\n0 !COLOUR BrickMade_Preview CODE 10000 VALUE ${activeColor.hex} EDGE ${activeColor.edge} ALPHA ${activeColor.alpha}`,
          )
          .replace(
            "1 16 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
            "1 10000 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
          );
        const loader = new LDrawLoader();
        loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
        const group = await new Promise<THREE.Group>((resolve, reject) =>
          loader.parse(document, resolve, reject),
        );
        if (disposed) {
          disposeModel(group);
          return;
        }
        model = group;
        group.rotation.x = Math.PI;
        group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(group);
        const center = bounds.getCenter(new THREE.Vector3());
        group.position.sub(center);
        const size = bounds.getSize(new THREE.Vector3());
        const radius = Math.max(size.length() / 2, 5);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#f3f1e9");
        scene.add(group, new THREE.HemisphereLight(0xffffff, 0x9e9b85, 2.8));
        const key = new THREE.DirectionalLight(0xffffff, 2.3);
        key.position.set(-60, 100, 80);
        scene.add(key);
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, radius * 30);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.setAttribute(
          "aria-label",
          `${name}. Accurate LDraw geometry. Drag to rotate.`,
        );
        renderer.domElement.setAttribute("role", "img");
        renderer.domElement.dataset.libraryPart = preview.id;
        renderer.domElement.dataset.renderColor = String(activeColor.id);
        renderer.domElement.dataset.transparency = String(
          activeColor.alpha < 255,
        );
        element.appendChild(renderer.domElement);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.enablePan = false;
        controls.minDistance = radius * 1.2;
        controls.maxDistance = radius * 10;
        const render = () => {
          if (!disposed) renderer?.render(scene, camera);
        };
        recolor.current = (value) => {
          group.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
              materials.forEach((material) => {
                if (
                  material instanceof THREE.MeshStandardMaterial &&
                  material.userData.code === "10000"
                ) {
                  material.color.set(value.hex);
                  material.opacity = value.alpha / 255;
                  material.transparent = value.alpha < 255;
                  material.depthWrite = value.alpha === 255;
                  material.needsUpdate = true;
                }
              });
            }
          });
          if (renderer) {
            renderer.domElement.dataset.renderColor = String(value.id);
            renderer.domElement.dataset.transparency = String(
              value.alpha < 255,
            );
          }
          render();
        };
        recolor.current(colorRef.current);
        const fit = () => {
          if (!renderer || !controls) return;
          const width = element.clientWidth,
            height = element.clientHeight;
          camera.aspect = width / Math.max(height, 1);
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
          const distance =
            (radius /
              Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) /
              Math.min(1, camera.aspect)) *
            1.12;
          camera.position
            .set(1, 0.85, 1.25)
            .normalize()
            .multiplyScalar(distance);
          controls.target.set(0, 0, 0);
          controls.update();
          render();
        };
        reset.current = fit;
        controls.addEventListener("change", render);
        observer = new ResizeObserver(fit);
        observer.observe(element);
        fit();
        cancelFrame = requestAnimationFrame(() => {
          if (!disposed) setStatus("ready");
        });
      } catch {
        if (!disposed) setStatus("error");
      }
    }
    void start();
    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(cancelFrame);
      observer?.disconnect();
      controls?.dispose();
      if (model) disposeModel(model);
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
      reset.current = () => {};
      recolor.current = () => {};
    };
  }, [preview, name]);
  return (
    <div className="library-viewer-wrap">
      <div ref={host} className="library-part-canvas" />
      {status === "loading" && (
        <p className="library-viewer-status" role="status">
          Loading the real shape…
        </p>
      )}
      {status === "error" && (
        <p className="library-viewer-status" role="status">
          The 3D preview couldn’t load. The geometry-derived thumbnail is
          available below.
        </p>
      )}
      <button
        className="icon-button library-reset"
        aria-label="Reset part view"
        onClick={() => reset.current()}
      >
        <RotateCcw size={17} />
      </button>
    </div>
  );
}

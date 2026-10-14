"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PART_PROFILES } from "@/domain/parts/profiles";
import type { PartPose } from "@/domain/parts/types";
import {
  createPartGeometry,
  createPartMaterials,
  loadBuilderMesh,
} from "@/services/builder-geometry";

export default function ConnectionCanvas({
  poses,
  showConnectors,
  onPick,
}: {
  poses: PartPose[];
  showConnectors: boolean;
  onPick: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onPick);
  const currentPoses = useRef(poses);
  const currentOverlay = useRef(showConnectors);
  const studio = useRef<{
    update: (poses: PartPose[], animate: boolean) => void;
    overlay: (visible: boolean) => void;
  } | null>(null);
  const [readyKey, setReadyKey] = useState("");
  const [errorKey, setErrorKey] = useState("");
  const key = poses.map((p) => `${p.id}:${p.partId}`).join(",");
  useEffect(() => {
    callback.current = onPick;
  }, [onPick]);
  useEffect(() => {
    currentPoses.current = poses;
    studio.current?.update(poses, true);
  }, [poses]);
  useEffect(() => {
    currentOverlay.current = showConnectors;
    studio.current?.overlay(showConnectors);
  }, [showConnectors]);
  useEffect(() => {
    const target = host.current;
    if (!target) return;
    const element = target;
    let disposed = false,
      renderer: THREE.WebGLRenderer | undefined,
      controls: OrbitControls | undefined,
      observer: ResizeObserver | undefined,
      frame = 0;
    const scene = new THREE.Scene(),
      groups = new Map<string, THREE.Group>(),
      overlays: THREE.Group[] = [];
    const assets = new Set<THREE.BufferGeometry | THREE.Material>();
    const starting = currentPoses.current;
    async function start() {
      try {
        const data = await Promise.all(
          starting.map((p) => loadBuilderMesh(p.partId)),
        );
        if (disposed) return;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        renderer.setClearColor(0, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.domElement.setAttribute("role", "img");
        renderer.domElement.setAttribute(
          "aria-label",
          "Real part geometry and attachment points. Drag to rotate. Tap a piece to inspect it.",
        );
        renderer.domElement.dataset.connectionCanvas = "true";
        element.appendChild(renderer.domElement);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x888f85, 2.6));
        const light = new THREE.DirectionalLight(0xffffff, 3);
        light.position.set(-5, 8, 10);
        scene.add(light);
        starting.forEach((pose, i) => {
          const group = new THREE.Group();
          group.userData.pieceId = pose.id;
          const geometry = createPartGeometry(pose.partId, data[i]);
          assets.add(geometry);
          const materials = createPartMaterials(
            pose.partId,
            i ? "#db6145" : "#b8c4ad",
            pose.partId === "60601" ? 0.35 : 1,
          );
          materials.forEach((m) => assets.add(m));
          const mesh = new THREE.Mesh(geometry, materials);
          mesh.userData.pieceId = pose.id;
          group.add(mesh);
          const overlay = new THREE.Group();
          overlay.visible = currentOverlay.current;
          PART_PROFILES.get(pose.partId)!.connectors.forEach((c) => {
            const color =
              c.kind === "stud"
                ? 0x9eef80
                : c.kind === "anti-stud"
                  ? 0xffe084
                  : c.kind === "pin"
                    ? 0xcb9bff
                    : 0x85d9ed;
            const markerGeometry = new THREE.TorusGeometry(
                c.radius,
                0.025,
                6,
                24,
              ),
              material = new THREE.MeshBasicMaterial({
                color,
                depthTest: false,
                transparent: true,
                opacity: 0.9,
              });
            const marker = new THREE.Mesh(markerGeometry, material);
            assets.add(markerGeometry);
            assets.add(material);
            marker.position.set(...c.position);
            marker.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 0, 1),
              new THREE.Vector3(...c.normal),
            );
            marker.renderOrder = 10;
            overlay.add(marker);
            const arrow = new THREE.ArrowHelper(
              new THREE.Vector3(...c.normal),
              new THREE.Vector3(...c.position),
              0.25,
              color,
              0.08,
              0.06,
            );
            for (const material of [
              arrow.line.material,
              arrow.cone.material,
            ].flat()) {
              material.depthTest = false;
              assets.add(material);
            }
            arrow.renderOrder = 11;
            assets.add(arrow.line.geometry);
            assets.add(arrow.cone.geometry);
            overlay.add(arrow);
          });
          group.add(overlay);
          overlays.push(overlay);
          groups.set(pose.id, group);
          scene.add(group);
        });
        const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = false;
        controls.enablePan = true;
        controls.minDistance = 1;
        controls.maxDistance = 45;
        const render = () => {
          if (!disposed && renderer) renderer.render(scene, camera);
        };
        const record = () => {
          if (renderer)
            renderer.domElement.dataset.poses = JSON.stringify(
              [...groups].map(([id, g]) => ({
                id,
                position: g.position.toArray(),
                rotation: g.quaternion.toArray(),
              })),
            );
        };
        const update = (next: PartPose[], animate: boolean) => {
          cancelAnimationFrame(frame);
          const from = next.map((p) => ({
            p,
            position: groups.get(p.id)?.position.clone(),
            rotation: groups.get(p.id)?.quaternion.clone(),
          }));
          let start: number | undefined;
          const reduced = matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          const tick = (time: number) => {
            start ??= time;
            const t =
                animate && !reduced ? Math.min(1, (time - start) / 400) : 1,
              k = 1 - Math.pow(1 - t, 3);
            for (const value of from) {
              const g = groups.get(value.p.id);
              if (!g || !value.position || !value.rotation) continue;
              g.position.lerpVectors(
                value.position,
                new THREE.Vector3(...value.p.position),
                k,
              );
              g.quaternion.slerpQuaternions(
                value.rotation,
                new THREE.Quaternion(...value.p.rotation),
                k,
              );
            }
            record();
            render();
            if (t < 1) frame = requestAnimationFrame(tick);
          };
          tick(performance.now());
        };
        studio.current = {
          update,
          overlay(visible) {
            overlays.forEach((g) => (g.visible = visible));
            render();
          },
        };
        update(currentPoses.current, false);
        const bounds = new THREE.Box3();
        groups.forEach((g) => bounds.expandByObject(g));
        const center = bounds.getCenter(new THREE.Vector3()),
          radius = Math.max(
            bounds.getSize(new THREE.Vector3()).length() / 2,
            2,
          );
        const resize = () => {
          if (!renderer || !controls) return;
          const w = element.clientWidth,
            h = Math.max(1, element.clientHeight);
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          const distance =
            (radius /
              Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) /
              Math.min(1, camera.aspect)) *
            1.05;
          camera.position
            .copy(center)
            .add(
              new THREE.Vector3(1, 1, 1.3).normalize().multiplyScalar(distance),
            );
          controls.target.copy(center);
          controls.update();
          render();
        };
        controls.addEventListener("change", render);
        observer = new ResizeObserver(resize);
        observer.observe(element);
        resize();
        let pointer: { x: number; y: number } | undefined;
        renderer.domElement.onpointerdown = (e) => {
          if (e.isPrimary && e.button === 0)
            pointer = { x: e.clientX, y: e.clientY };
        };
        renderer.domElement.onpointercancel = () => {
          pointer = undefined;
        };
        renderer.domElement.onpointerup = (e) => {
          const p = pointer;
          pointer = undefined;
          if (
            !p ||
            !renderer ||
            Math.hypot(p.x - e.clientX, p.y - e.clientY) > 6
          )
            return;
          const rect = renderer.domElement.getBoundingClientRect(),
            ray = new THREE.Raycaster();
          ray.setFromCamera(
            new THREE.Vector2(
              ((e.clientX - rect.left) / rect.width) * 2 - 1,
              (-(e.clientY - rect.top) / rect.height) * 2 + 1,
            ),
            camera,
          );
          const meshes = [...groups.values()].flatMap((g) =>
            g.children.filter((c) => c instanceof THREE.Mesh),
          );
          const hit = ray.intersectObjects(meshes, false)[0];
          if (hit) callback.current(hit.object.userData.pieceId);
        };
        renderer.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          if (!disposed) setErrorKey(key);
        });
        render();
        setReadyKey(key);
      } catch {
        if (!disposed) setErrorKey(key);
      }
    }
    void start();
    return () => {
      disposed = true;
      studio.current = null;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls?.dispose();
      assets.forEach((a) => a.dispose());
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
    };
  }, [key]);
  return (
    <div className="connection-stage">
      <div ref={host} className="connection-canvas" />
      {errorKey === key ? (
        <p className="connection-load-state" role="alert">
          Detailed 3D could not load. Reload to retry.
        </p>
      ) : readyKey !== key ? (
        <p className="connection-load-state" role="status">
          Loading the real shapes…
        </p>
      ) : null}
    </div>
  );
}

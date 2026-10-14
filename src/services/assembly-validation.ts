import { PART_PROFILES, PROFILE_VERSION } from "@/domain/parts/profiles";
import { placementPose } from "@/domain/model-pose";
import {
  decodeCollisionShape,
  type CollisionShape,
} from "@/domain/validation/collision";
import {
  modelSignature,
  validateAssembly,
  type ValidationReport,
} from "@/domain/validation/assembly";
import { assetPath } from "@/lib/asset-path";
import type { HouseModel } from "@/domain/types";
const shapes = new Map<string, Promise<CollisionShape>>(),
  reviews = new Map<string, Promise<ValidationReport>>();
export function loadCollisionShape(id: string): Promise<CollisionShape> {
  const old = shapes.get(id);
  if (old) return old;
  const profile = PART_PROFILES.get(id),
    metadata = profile?.collision;
  if (!metadata)
    return Promise.reject(Error("This part has no collision evidence."));
  const request = fetch(assetPath(`${metadata.file}?v=${PROFILE_VERSION}`), {
    signal: AbortSignal.timeout(30000),
  })
    .then(async (response) => {
      if (!response.ok) throw Error("Collision evidence did not load.");
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes),
        hex = Array.from(new Uint8Array(digest), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
      if (hex !== metadata.sha256 || bytes.byteLength !== metadata.bytes)
        throw Error("Collision evidence checksum mismatch.");
      const shape = decodeCollisionShape(bytes);
      if (shape.occupiedCells !== metadata.occupiedCells)
        throw Error("Collision evidence count mismatch.");
      return shape;
    })
    .catch((e) => {
      shapes.delete(id);
      throw e;
    });
  shapes.set(id, request);
  return request;
}
export function reviewAssembly(model: HouseModel): Promise<ValidationReport> {
  const signature = modelSignature(model),
    previous = reviews.get(signature);
  if (previous) return previous;
  const request = Promise.all(
    [...new Set(model.placements.map((p) => placementPose(p).partId))].map(
      async (id) => [id, await loadCollisionShape(id)] as const,
    ),
  )
    .then(async (entries) => {
      // Yield before the CPU audit so the checking state can paint on slower devices.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (typeof Worker === "undefined")
        return validateAssembly(model, new Map(entries));
      return new Promise<ValidationReport>((resolve, reject) => {
        const worker = new Worker(
          new URL("../workers/assembly-validation.ts", import.meta.url),
          { type: "module" },
        );
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(Error("The assembly review timed out. Please retry."));
        }, 45000);
        worker.onmessage = (
          event: MessageEvent<{ report?: ValidationReport; error?: string }>,
        ) => {
          clearTimeout(timeout);
          worker.terminate();
          if (event.data.report) resolve(event.data.report);
          else reject(Error(event.data.error ?? "Assembly review failed."));
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          reject(Error("The assembly review worker could not load."));
        };
        worker.postMessage({ model, shapes: entries });
      });
    })
    .catch((e) => {
      reviews.delete(signature);
      throw e;
    });
  reviews.set(signature, request);
  return request;
}

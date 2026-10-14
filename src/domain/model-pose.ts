import { Quaternion, Vector3 } from "three";
import { BUILDER_BY_REBRICKABLE } from "./parts/profiles";
import { quarterTurn } from "./parts/connections";
import { boundsForPose } from "./validation/collision";
import type { Placement } from "./types";
import type { PartPose, Vec3 } from "./parts/types";
export function placementPose(p: Placement): PartPose {
  return {
    id: p.id,
    partId: BUILDER_BY_REBRICKABLE.get(p.partId)?.id ?? `unmapped:${p.partId}`,
    position: p.position,
    rotation: p.rotation ?? quarterTurn(p.rotated ? 1 : 0),
  };
}
export function placementBounds(p: Placement) {
  const profile = BUILDER_BY_REBRICKABLE.get(p.partId);
  if (!profile) throw Error(`Unknown source geometry for ${p.partId}`);
  return boundsForPose(placementPose(p), profile.mesh.bounds);
}
export function rotatePoint(point: Vec3, placement: Placement): Vec3 {
  return new Vector3(...point)
    .applyQuaternion(new Quaternion(...placementPose(placement).rotation))
    .add(new Vector3(...placement.position))
    .toArray() as Vec3;
}

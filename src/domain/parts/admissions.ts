import { Vector3 } from "three";
import { snapPose, worldConnectors, IDENTITY } from "./connections";
import {
  collisionInstance,
  collisionPoint,
  shifted,
  type CollisionShape,
} from "../validation/collision";
import type { BuilderPart, Connector, PartPose, Vec3 } from "./types";
export interface PortAudit {
  connectorId: string;
  status: "passed" | "rejected";
  reason: string;
  witnesses: number;
  resolutionMillimetres: number;
  referenceParts: string[];
  twists: number[];
}
/** A port is admitted only for the reference probes that can actually seat and approach it.
 * This is finite-resolution nominal geometry evidence, never a measured clutch-force claim.
 */
export function auditPort(
  part: BuilderPart,
  connector: Connector,
  profiles: ReadonlyMap<string, BuilderPart>,
  shapes: ReadonlyMap<string, CollisionShape>,
): PortAudit {
  const result = (
    status: PortAudit["status"],
    reason: string,
    witnesses = 0,
  ): PortAudit => ({
    connectorId: connector.id,
    status,
    reason,
    witnesses,
    resolutionMillimetres: 0.4,
    referenceParts: ["3024", "3005"],
    twists: [0, 90, 180, 270],
  });
  if (!["stud", "anti-stud"].includes(connector.kind))
    return result(
      "rejected",
      "Mechanism requires an individual rule and procedure.",
    );
  const parent: PartPose = {
      id: "part",
      partId: part.id,
      position: [0, 0, 0],
      rotation: IDENTITY,
    },
    fixed = collisionInstance(parent, shapes.get(part.id)!);
  if (!fixed)
    return result(
      "rejected",
      "Source datum cannot be audited on the sampling grid.",
    );
  const target = { ...connector, pieceId: parent.id, partId: part.id }; // parent is the identity source pose

  let count = 0;
  for (const referenceId of ["3024", "3005"]) {
    const reference = profiles.get(referenceId)!,
      local = reference.connectors.find(
        (c) => c.kind === (connector.kind === "stud" ? "anti-stud" : "stud"),
      )!;
    for (const twist of [0, 90, 180, 270]) {
      const moving = snapPose(
          {
            id: "probe",
            partId: referenceId,
            position: [0, 0, 0],
            rotation: IDENTITY,
          },
          local.id,
          target,
          twist,
        ),
        instance = collisionInstance(moving, shapes.get(referenceId)!);
      if (!instance)
        return result(
          "rejected",
          "Port position/axis needs a finer or non-cardinal solver.",
          count,
        );
      const male =
        connector.kind === "stud"
          ? target
          : worldConnectors(moving).find((c) => c.id === local.id)!;
      // A narrow outer contact band tolerates nominal surface sampling. The inner
      // throat must remain vacant: a closed bore cannot pass by exempting its cylinder.
      const outerContact = (p: Vec3) => {
        const delta = new Vector3(...p).sub(new Vector3(...male.position)),
          depth = delta.dot(new Vector3(...male.normal)),
          radial = delta.lengthSq() - depth * depth;
        return (
          depth >= -0.001 &&
          depth <= 0.201 &&
          radial >= 0.25 ** 2 &&
          radial <= 0.301 ** 2
        );
      };
      if (collisionPoint(fixed, instance, outerContact))
        return result(
          "rejected",
          "Reference part intersects material or the bore is blocked at seating.",
          count,
        );
      const axis = target.normal.map((n) => Math.round(n)) as Vec3,
        dimension = axis.findIndex((n) => n !== 0);
      const travel =
        (axis[dimension] > 0
          ? fixed.max[dimension] - instance.min[dimension]
          : instance.max[dimension] - fixed.min[dimension]) + 2;
      for (let ticks = 1; ticks <= travel; ticks++)
        if (collisionPoint(fixed, shifted(instance, axis, ticks), outerContact))
          return result(
            "rejected",
            "Source geometry obstructs the declared approach path.",
            count,
          );
      count++;
    }
  }
  return result(
    "passed",
    "Seating, open throat and cardinal approach clear for both references at four quarter turns.",
    count,
  );
}

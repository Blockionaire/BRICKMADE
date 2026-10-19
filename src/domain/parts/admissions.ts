import { Quaternion, Vector3 } from "three";
import {
  cylinderEngagement,
  IDENTITY,
  sectionRadiusAt,
  snapPose,
  worldConnectors,
} from "./connections";
import {
  collisionInstance,
  collisionPoint,
  shifted,
  type CollisionShape,
} from "../validation/collision";
import type {
  BuilderPart,
  Connector,
  PartPose,
  Vec3,
  WorldConnector,
} from "./types";
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

/** Reference parts for cylinder snaps: a shaft for holes and clips, a hole or clip for shafts. */
export const CYLINDER_WITNESSES = {
  male: ["3673", "3706", "87994"],
  female: ["18654", "12825", "73230"],
} as const;
const rotate = (v: Vec3, q: Quaternion) =>
  new Vector3(...v).applyQuaternion(q).toArray() as Vec3;
const length = (c: Connector) =>
  (c.sections ?? []).reduce((n, s) => n + s.length, 0);
/**
 * Cylinder ports (axles, pins, bars, clips) qualify against a reference shaft or hole
 * that passes the LDCad engagement rule. The shaft may only overlap material inside
 * the hole's own bore, and must withdraw along the axis without hitting anything.
 * Like the stud audit this is finite-resolution nominal geometry, not a fit-force test.
 */
export function auditCylinderPort(
  part: BuilderPart,
  connector: Connector,
  profiles: ReadonlyMap<string, BuilderPart>,
  shapes: ReadonlyMap<string, CollisionShape>,
): PortAudit {
  const twists = [0, 90, 180, 270];
  const witnesses =
    connector.kind === "cyl-male"
      ? CYLINDER_WITNESSES.female
      : CYLINDER_WITNESSES.male;
  const result = (
    status: PortAudit["status"],
    reason: string,
    count = 0,
    referenceParts: string[] = [...witnesses],
  ): PortAudit => ({
    connectorId: connector.id,
    status,
    reason,
    witnesses: count,
    resolutionMillimetres: 0.4,
    referenceParts,
    twists,
  });
  const shape = shapes.get(part.id);
  const fixedPose: PartPose = {
    id: "part",
    partId: part.id,
    position: [0, 0, 0],
    rotation: IDENTITY,
  };
  const fixed = shape && collisionInstance(fixedPose, shape);
  if (!fixed)
    return result(
      "rejected",
      "Source datum cannot be audited on the sampling grid.",
    );
  const target: WorldConnector = {
    ...connector,
    pieceId: "part",
    partId: part.id,
  };
  const axis = target.normal.map((n) => Math.round(n)) as Vec3;
  if (
    axis.filter((n) => n !== 0).length !== 1 ||
    target.normal.some((n, i) => Math.abs(n - axis[i]) > 1e-5)
  )
    return result(
      "rejected",
      "Port position/axis needs a finer or non-cardinal solver.",
    );
  let fitted = false;
  for (const referenceId of witnesses) {
    const reference = profiles.get(referenceId),
      referenceShape = shapes.get(referenceId);
    if (!reference || !referenceShape) continue;
    for (const local of reference.connectors) {
      if (local.kind === connector.kind || !local.sections) continue;
      if ((local.kind === "cyl-male") === (connector.kind === "cyl-male"))
        continue;
      const male = connector.kind === "cyl-male" ? connector : local,
        female = male === connector ? local : connector;
      // Sliding fits are tried with the shaft's tip at the far end of the hole, the
      // two starts together, and halfway between.
      const slide = !!(male.slide || female.slide),
        tip = length(male) - length(female),
        shifts = slide ? [tip, 0, tip / 2] : [0];
      let clean = 0;
      for (const shift of shifts) {
        for (const twist of twists) {
          const align = new Quaternion().setFromUnitVectors(
            new Vector3(...local.normal).normalize(),
            new Vector3(...target.normal),
          );
          const rotation = new Quaternion()
            .setFromAxisAngle(
              new Vector3(...target.normal),
              (twist * Math.PI) / 180,
            )
            .multiply(align)
            .normalize();
          // Witness start relative to the target start, along the shared axis.
          const along = connector.kind === "cyl-male" ? shift : -shift;
          const start = new Vector3(...target.position).addScaledVector(
            new Vector3(...target.normal),
            along,
          );
          const position = start
            .sub(new Vector3(...local.position).applyQuaternion(rotation))
            .toArray() as Vec3;
          const pose: PartPose = {
            id: "probe",
            partId: referenceId,
            position,
            rotation: rotation.toArray() as [number, number, number, number],
          };
          const world: WorldConnector = {
            ...local,
            pieceId: "probe",
            partId: referenceId,
            position: new Vector3(...local.position)
              .applyQuaternion(rotation)
              .add(new Vector3(...position))
              .toArray() as Vec3,
            normal: rotate(local.normal, rotation),
          };
          const fit = cylinderEngagement(target, world);
          if (!("male" in fit) || !fit.male) continue;
          fitted = true;
          const instance = collisionInstance(pose, referenceShape);
          if (!instance) continue;
          const hole = world.kind === "cyl-male" ? target : world;
          // Seated, only the bore itself may overlap; while passing through, snap ridges
          // may flex by the same 0.5 LDU the engagement rule tolerates.
          const bore =
            (offset: Vec3, slack = 0.001) =>
            (point: Vec3) => {
              const d = new Vector3(...point)
                .sub(new Vector3(...hole.position))
                .sub(new Vector3(...offset));
              const t = d.dot(new Vector3(...hole.normal)),
                radius = sectionRadiusAt(hole, t);
              return (
                radius !== undefined &&
                d.lengthSq() - t * t <= (radius + slack) ** 2
              );
            };
          if (collisionPoint(fixed, instance, bore([0, 0, 0]))) continue;
          // Withdraw the witness along the axis (either way for sliding fits); a clip
          // also snaps on sideways.
          const holeMoves = hole === world;
          const directions: Vec3[] = slide
            ? [axis, axis.map((n) => -n) as Vec3]
            : [
                (world.kind === "cyl-male"
                  ? axis.map((n) => -n)
                  : axis) as Vec3,
              ];
          if (hole.kind === "clip")
            for (let d = 0; d < 3; d++)
              if (!axis[d])
                for (const sign of [1, -1])
                  directions.push(
                    [0, 1, 2].map((i) => (i === d ? sign : 0)) as Vec3,
                  );
          const clear = directions.some((direction) => {
            const dimension = direction.findIndex((n) => n !== 0);
            const travel =
              (direction[dimension] > 0
                ? fixed.max[dimension] - instance.min[dimension]
                : instance.max[dimension] - fixed.min[dimension]) + 2;
            for (let ticks = 1; ticks <= travel; ticks++) {
              const offset = holeMoves
                ? (direction.map(
                    (n) => n * ticks * fixed.shape.resolution,
                  ) as Vec3)
                : ([0, 0, 0] as Vec3);
              if (
                collisionPoint(
                  fixed,
                  shifted(instance, direction, ticks),
                  bore(offset, 0.026),
                )
              )
                return false;
            }
            return true;
          });
          if (clear) clean++;
        }
        if (clean) break;
      }
      if (clean)
        return result(
          "passed",
          "A reference shaft/hole engages along the shared axis, overlaps only the bore and withdraws clear.",
          clean,
          [referenceId],
        );
    }
  }
  return result(
    "rejected",
    fitted
      ? "Reference parts intersect material or the axial approach is blocked."
      : "No reference shaft, hole or clip engages this snap.",
  );
}

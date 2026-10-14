import { Quaternion as Rotation, Vector3 } from "three";
import { PART_PROFILES } from "./profiles";
import type {
  Connector,
  Mate,
  PartPose,
  WorldConnector,
  Vec3,
  Quaternion,
} from "./types";

export const SEATING_TOLERANCE = 0.002; // 0.016 mm; digital datum comparison, not manufacturing tolerance.
export const AXIS_TOLERANCE_DEGREES = 1;
const angleLimit = -Math.cos((AXIS_TOLERANCE_DEGREES * Math.PI) / 180);
export const IDENTITY: Quaternion = [0, 0, 0, 1];
export function quarterTurn(turns: number): Quaternion {
  return new Rotation()
    .setFromAxisAngle(new Vector3(0, 1, 0), (turns * Math.PI) / 2)
    .toArray() as Quaternion;
}
export function validPose(pose: PartPose): boolean {
  return (
    !!pose.id &&
    pose.position.length === 3 &&
    pose.position.every(Number.isFinite) &&
    pose.rotation.length === 4 &&
    pose.rotation.every(Number.isFinite) &&
    Math.abs(pose.rotation.reduce((sum, n) => sum + n * n, 0) - 1) < 1e-5
  );
}
export function worldConnectors(pose: PartPose): WorldConnector[] {
  if (!validPose(pose))
    throw Error(
      "Invalid part pose: use finite coordinates and a unit quaternion.",
    );
  const profile = PART_PROFILES.get(pose.partId);
  if (!profile) return []; // Never infer features for an unreviewed catalog entry.
  const rotation = new Rotation(...pose.rotation);
  return profile.connectors.map((c) => ({
    ...c,
    pieceId: pose.id,
    partId: pose.partId,
    position: new Vector3(...c.position)
      .applyQuaternion(rotation)
      .add(new Vector3(...pose.position))
      .toArray() as Vec3,
    normal: new Vector3(...c.normal)
      .applyQuaternion(rotation)
      .normalize()
      .toArray() as Vec3,
  }));
}
export function compatibleFamily(
  a: Connector,
  b: Connector,
): "stud" | "pin" | undefined {
  const valid = (c: Connector) =>
    c.status === "geometry-reviewed" &&
    c.position.length === 3 &&
    c.position.every(Number.isFinite) &&
    c.normal.length === 3 &&
    c.normal.every(Number.isFinite) &&
    Math.abs(Math.hypot(...c.normal) - 1) < 1e-5 &&
    Number.isFinite(c.radius) &&
    c.radius > 0 &&
    Number.isFinite(c.depth) &&
    c.depth > 0 &&
    !!c.evidence.file &&
    !!c.evidence.method;
  if (!valid(a) || !valid(b)) return;
  const kinds = [a.kind, b.kind];
  const family =
    kinds.includes("stud") && kinds.includes("anti-stud")
      ? "stud"
      : kinds.includes("pin") && kinds.includes("pin-hole")
        ? "pin"
        : undefined;
  if (!family || Math.abs(a.radius - b.radius) > 1e-6) return;
  const male = a.kind === "stud" || a.kind === "pin" ? a : b,
    female = male === a ? b : a;
  if (male.depth > female.depth + 1e-6) return;
  if (family === "pin") {
    if (
      ![
        male.collarRadius,
        male.collarDepth,
        female.collarRadius,
        female.collarDepth,
      ].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
    )
      return;
    if (
      male.collarRadius! > female.collarRadius! + 1e-6 ||
      male.collarDepth! > female.collarDepth! + 1e-6
    )
      return;
  }
  return family;
}
export function connectorKey(c: WorldConnector): string {
  return `${c.pieceId}:${c.id}`;
}
export function channelKey(c: WorldConnector): string {
  return `${c.pieceId}:channel:${c.channel ?? c.id}`;
}
export function inspectMate(
  a: WorldConnector,
  b: WorldConnector,
  occupied: ReadonlySet<string> = new Set(),
): { mate?: Mate; reason: string } {
  if (a.pieceId === b.pieceId)
    return { reason: "A piece cannot connect to itself." };
  const family = compatibleFamily(a, b);
  if (!family)
    return {
      reason:
        "These attachment types or dimensions do not have a supported fit.",
    };
  if (
    [a, b].some(
      (c) => occupied.has(connectorKey(c)) || occupied.has(channelKey(c)),
    )
  )
    return { reason: "That attachment point is already occupied." };
  const dot = new Vector3(...a.normal).dot(new Vector3(...b.normal));
  if (dot > angleLimit)
    return { reason: "The attachment axes must face each other." };
  const distance = new Vector3(...a.position).distanceTo(
    new Vector3(...b.position),
  );
  if (distance > SEATING_TOLERANCE)
    return { reason: "The seating planes are not aligned." };
  return {
    mate: { a, b, distance, family, status: "geometry-compatible" },
    reason:
      "The reviewed attachment points align. Overall clearance and stability still need validation.",
  };
}

/** Align a reviewed seating datum; this does not prove body clearance or build order. */
export function snapPose(
  moving: PartPose,
  connectorId: string,
  target: WorldConnector,
  twistDegrees = 0,
): PartPose {
  if (!validPose(moving) || !Number.isFinite(twistDegrees))
    throw Error("Invalid snap pose.");
  if (moving.id === target.pieceId)
    throw Error("Cannot snap a piece to itself.");
  const local = PART_PROFILES.get(moving.partId)?.connectors.find(
    (c) => c.id === connectorId,
  );
  if (!local || !compatibleFamily(local, target))
    throw Error("No reviewed connection for these features.");
  const original = new Rotation(...moving.rotation);
  const from = new Vector3(...local.normal)
    .applyQuaternion(original)
    .normalize();
  const to = new Vector3(...target.normal).normalize().negate();
  const alignment = new Rotation().setFromUnitVectors(from, to);
  const twist = new Rotation().setFromAxisAngle(
    to,
    (twistDegrees * Math.PI) / 180,
  );
  const rotation = twist.multiply(alignment).multiply(original).normalize();
  const position = new Vector3(...target.position).sub(
    new Vector3(...local.position).applyQuaternion(rotation),
  );
  return {
    ...moving,
    position: position.toArray() as Vec3,
    rotation: rotation.toArray() as Quaternion,
  };
}

/** Deterministic local mating graph. Unknown features remain unknown, never passed. */
export function findMates(poses: PartPose[]): {
  mates: Mate[];
  unsupported: string[];
  unconnected: string[];
} {
  if (new Set(poses.map((p) => p.id)).size !== poses.length)
    throw Error("Piece IDs must be unique.");
  const connectors = poses.flatMap(worldConnectors),
    candidates: Mate[] = [];
  // Spatial buckets avoid an all-pairs scan on models with thousands of studs.
  const buckets = new Map<string, WorldConnector[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (const c of connectors) {
    const cell = c.position.map((n) => Math.floor(n / SEATING_TOLERANCE));
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++)
          for (const previous of buckets.get(
            key(cell[0] + x, cell[1] + y, cell[2] + z),
          ) ?? []) {
            const { mate } = inspectMate(previous, c);
            if (mate) candidates.push(mate);
          }
    const bucketKey = key(...(cell as Vec3));
    const bucket = buckets.get(bucketKey) ?? [];
    bucket.push(c);
    buckets.set(bucketKey, bucket);
  }
  candidates.sort(
    (a, b) =>
      a.distance - b.distance ||
      `${connectorKey(a.a)}:${connectorKey(a.b)}`.localeCompare(
        `${connectorKey(b.a)}:${connectorKey(b.b)}`,
      ),
  );
  const occupied = new Set<string>(),
    mates: Mate[] = [],
    connected = new Set<string>();
  for (const candidate of candidates) {
    if (!inspectMate(candidate.a, candidate.b, occupied).mate) continue;
    mates.push(candidate);
    for (const c of [candidate.a, candidate.b]) {
      occupied.add(connectorKey(c));
      if (c.channel) occupied.add(channelKey(c));
      connected.add(c.pieceId);
    }
  }
  const unsupported = poses
    .filter(
      (p) =>
        !PART_PROFILES.has(p.partId) ||
        !PART_PROFILES.get(p.partId)!.connectors.length,
    )
    .map((p) => p.id);
  return {
    mates,
    unsupported,
    unconnected: poses
      .filter((p) => !connected.has(p.id) && !unsupported.includes(p.id))
      .map((p) => p.id),
  };
}

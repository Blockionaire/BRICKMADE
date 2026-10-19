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
    up: c.up
      ? (new Vector3(...c.up).applyQuaternion(rotation).toArray() as Vec3)
      : undefined,
  }));
}
const CYLINDER_KINDS = new Set(["cyl-male", "cyl-female", "clip"]);
const sectionLength = (c: Connector) =>
  (c.sections ?? []).reduce((n, s) => n + s.length, 0);
/** Section at a distance along the connector's axis, or undefined past its ends. */
function sectionAt(c: Connector, t: number) {
  let start = 0;
  for (const s of c.sections ?? []) {
    if (t >= start - 1e-6 && t <= start + s.length + 1e-6) return s;
    start += s.length;
  }
  return undefined;
}
const RADIUS_TOLERANCE = 0.026; // 0.5 LDU
/** A male cross-axle turns freely in a round hole; a round pin cannot enter a cross hole. */
function shapesFit(male: string, female: string) {
  if (female === "C") return male !== "A";
  if (male === "A") return female === "A" || female === "R";
  if (female === "A") return false;
  return true;
}
function cylinderValid(c: Connector) {
  return (
    CYLINDER_KINDS.has(c.kind) &&
    c.status === "geometry-reviewed" &&
    Array.isArray(c.sections) &&
    c.sections.length > 0 &&
    c.sections.every(
      (s) =>
        typeof s.shape === "string" &&
        Number.isFinite(s.radius) &&
        s.radius > 0 &&
        Number.isFinite(s.length) &&
        s.length > 0,
    ) &&
    c.position.every(Number.isFinite) &&
    Math.abs(Math.hypot(...c.normal) - 1) < 1e-5 &&
    !!c.evidence.file &&
    !!c.evidence.method
  );
}
/**
 * LDCad-style cylinder engagement: the axes must coincide; fixed snaps seat at their
 * start datums, sliding ones anywhere they overlap. Within the overlap the male may be
 * narrower than the hole (collars, countersinks) but must engage at least 3 LDU at an
 * equal radius with a compatible cross-section.
 */
export function sectionRadiusAt(c: Connector, t: number) {
  return sectionAt(c, t)?.radius;
}
export function cylinderEngagement(a: WorldConnector, b: WorldConnector) {
  if (!cylinderValid(a) || !cylinderValid(b))
    return { reason: "Not cylinder snaps." };
  const male =
    a.kind === "cyl-male" ? a : b.kind === "cyl-male" ? b : undefined;
  const female = male === a ? b : a;
  if (!male || female.kind === "cyl-male")
    return { reason: "A cylinder fit needs one shaft and one hole or clip." };
  const na = new Vector3(...male.normal),
    nb = new Vector3(...female.normal);
  const dot = na.dot(nb);
  if (Math.abs(dot) < -angleLimit)
    return { reason: "The axes are not parallel." };
  const slide = !!(male.slide || female.slide);
  if (!slide && dot < 0)
    return { reason: "Fixed snaps must point the same way." };
  const offset = new Vector3(...female.position).sub(
    new Vector3(...male.position),
  );
  const along = offset.dot(na);
  const lateral = offset.clone().sub(na.clone().multiplyScalar(along)).length();
  if (lateral > 0.01) return { reason: "The axes do not coincide." };
  // Female interval expressed along the male axis.
  const lf = sectionLength(female),
    lm = sectionLength(male);
  const f0 = along,
    f1 = along + (dot > 0 ? lf : -lf);
  const lo = Math.max(0, Math.min(f0, f1)),
    hi = Math.min(lm, Math.max(f0, f1));
  if (hi - lo <= 1e-4)
    return { reason: "The shaft does not reach into the hole." };
  if (!slide && Math.abs(along) > SEATING_TOLERANCE)
    return { reason: "Fixed snaps must seat at their start datums." };
  let engaged = 0;
  const step = 0.025;
  for (let t = lo + step / 2; t < hi; t += step) {
    const ms = sectionAt(male, t),
      fs = sectionAt(female, dot > 0 ? t - along : along - t);
    if (!ms || !fs) continue;
    if (ms.radius > fs.radius + RADIUS_TOLERANCE)
      return { reason: "The shaft is wider than the hole." };
    if (Math.abs(ms.radius - fs.radius) <= RADIUS_TOLERANCE) {
      if (!shapesFit(ms.shape, fs.shape))
        return {
          reason: "The cross-sections do not fit (round pin in an axle hole).",
        };
      engaged += step;
    }
  }
  if (engaged < 0.15 - 1e-6) return { reason: "Too little engaged length." };
  return { male, female, lo, hi, along, dot, slide };
}
export function compatibleFamily(
  a: Connector,
  b: Connector,
): "stud" | "pin" | "window" | "cylinder" | undefined {
  if (CYLINDER_KINDS.has(a.kind) || CYLINDER_KINDS.has(b.kind))
    return cylinderValid(a) &&
      cylinderValid(b) &&
      (a.kind === "cyl-male") !== (b.kind === "cyl-male")
      ? "cylinder"
      : undefined;
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
        : kinds.includes("window-seat") &&
            kinds.includes("window-insert") &&
            a.pairCode === "window-60592-60601" &&
            b.pairCode === a.pairCode
          ? "window"
          : undefined;
  if (!family || Math.abs(a.radius - b.radius) > 1e-6) return;
  const male =
      a.kind === "stud" || a.kind === "pin" || a.kind === "window-insert"
        ? a
        : b,
    female = male === a ? b : a;
  if (male.depth > female.depth + 1e-6) return;
  if (
    family === "window" &&
    [a, b].some(
      (c) =>
        !c.up ||
        c.up.length !== 3 ||
        !c.up.every(Number.isFinite) ||
        Math.abs(Math.hypot(...c.up) - 1) > 1e-5 ||
        Math.abs(new Vector3(...c.up).dot(new Vector3(...c.normal))) > 1e-5,
    )
  )
    return;
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
  if (family === "cylinder") {
    const e = cylinderEngagement(a, b);
    if (!("male" in e) || !e.male) return { reason: e.reason };
    // A sliding shaft or bar can pass through several holes and clips.
    const exclusive = [e.female, ...(e.male.slide ? [] : [e.male])];
    if (exclusive.some((c) => occupied.has(connectorKey(c))))
      return { reason: "That attachment point is already occupied." };
    return {
      mate: { a, b, distance: 0, family, status: "geometry-compatible" },
      reason: "The shaft engages the hole along a shared axis.",
    };
  }
  if (
    [a, b].some(
      (c) => occupied.has(connectorKey(c)) || occupied.has(channelKey(c)),
    )
  )
    return { reason: "That attachment point is already occupied." };
  const dot = new Vector3(...a.normal).dot(new Vector3(...b.normal));
  if (dot > angleLimit)
    return { reason: "The attachment axes must face each other." };
  if (
    family === "window" &&
    (!a.up ||
      !b.up ||
      new Vector3(...a.up).dot(new Vector3(...b.up)) < -angleLimit)
  )
    return { reason: "This frame/pane fit locks the upright orientation." };
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
  const cylinder = CYLINDER_KINDS.has(local.kind);
  const to = cylinder
    ? new Vector3(...target.normal).normalize()
    : new Vector3(...target.normal).normalize().negate();
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
            if (CYLINDER_KINDS.has(previous.kind) || CYLINDER_KINDS.has(c.kind))
              continue; // handled by the axis-line pass below
            const { mate } = inspectMate(previous, c);
            if (mate) candidates.push(mate);
          }
    const bucketKey = key(...(cell as Vec3));
    const bucket = buckets.get(bucketKey) ?? [];
    bucket.push(c);
    buckets.set(bucketKey, bucket);
  }
  // Cylinder snaps can engage away from their datums (sliding axles, bars in clips):
  // group them by axis line instead of by position.
  const lines = new Map<string, WorldConnector[]>();
  for (const c of connectors) {
    if (!CYLINDER_KINDS.has(c.kind)) continue;
    const n = new Vector3(...c.normal);
    if (n.x < -0.5 || n.y < -0.5 || n.z < -0.5) n.negate();
    const p = new Vector3(...c.position);
    const foot = p.clone().sub(n.clone().multiplyScalar(p.dot(n)));
    const k = [...n.toArray(), ...foot.toArray()]
      .map((v) => Math.round(v * 50))
      .join(",");
    const list = lines.get(k) ?? [];
    for (const other of list) {
      const { mate } = inspectMate(other, c);
      if (mate) candidates.push(mate);
    }
    list.push(c);
    lines.set(k, list);
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
      connected.add(c.pieceId);
      if (candidate.family === "cylinder" && c.kind === "cyl-male" && c.slide)
        continue;
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

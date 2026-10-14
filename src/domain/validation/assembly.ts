import { Quaternion, Vector3 } from "three";
import { COLORS } from "../catalog";
import { findMates, validPose } from "../parts/connections";
import {
  BUILDER_BY_REBRICKABLE,
  PART_PROFILES,
  PROFILE_VERSION,
} from "../parts/profiles";
import { placementPose } from "../model-pose";
import { countParts } from "../inventory";
import {
  boundsForPose,
  collisionInstance,
  collisionPoint,
  shifted,
  type CollisionInstance,
  type CollisionShape,
} from "./collision";
import type { HouseModel, Placement } from "../types";
import type { Mate, PartPose, Vec3 } from "../parts/types";

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  pieceIds: string[];
  step?: number;
  point?: Vec3;
}
export interface ValidationReport {
  version: string;
  status: "passed" | "failed" | "pending";
  physicalStatus: "untested";
  checks: {
    id: string;
    name: string;
    status: "passed" | "failed" | "pending";
  }[];
  issues: ValidationIssue[];
  connections: number;
  components: number;
  pieceCount: number;
  collisionResolutionMillimetres: number;
  manufacturingEvidence: "recorded";
  stockStatus: "unchecked";
  centerOfVolume?: Vec3;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function modelSignature(model: HouseModel): string {
  return JSON.stringify({
    revision: model.revision,
    profiles: PROFILE_VERSION,
    settings: model.settings,
    placements: model.placements,
    steps: model.steps.map((s) => [
      s.number,
      s.placementIds,
      s.parts,
      s.insertionDirection,
      s.procedures,
    ]),
    parts: model.parts,
    bags: model.bags,
    stats: model.stats,
  });
}
function contactAllowance(pair: Mate[], a: PartPose, b: PartPose) {
  return (point: Vec3) =>
    pair.some((m) => {
      if (m.family === "window") {
        const frame = m.a.kind === "window-seat" ? m.a : m.b,
          pose = frame.pieceId === a.id ? a : b;
        const local = new Vector3(...point)
          .sub(new Vector3(...pose.position))
          .applyQuaternion(new Quaternion(...pose.rotation).invert())
          .toArray();
        return (
          frame.allowedContactRegions?.some((r) =>
            local.every((n, i) => n >= r[i] - 1e-5 && n <= r[i + 3] + 1e-5),
          ) ?? false
        );
      }
      const male = [m.a, m.b].find(
        (c) => c.kind === "stud" || c.kind === "pin",
      )!;
      const dx = point[0] - male.position[0],
        dy = point[1] - male.position[1],
        dz = point[2] - male.position[2],
        distance =
          dx * male.normal[0] + dy * male.normal[1] + dz * male.normal[2],
        radiusSquared = dx * dx + dy * dy + dz * dz - distance * distance;
      if (distance < -0.001 || distance > male.depth + 0.001) return false;
      const allowedRadius =
        m.family === "pin" && distance <= (male.collarDepth ?? 0)
          ? male.collarRadius!
          : male.radius;
      return radiusSquared <= (allowedRadius + 0.001) ** 2; // only the reviewed mating volume, never the entire part pair
    });
}

export function validateAssembly(
  model: HouseModel,
  shapes?: ReadonlyMap<string, CollisionShape>,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const issue = (
    code: string,
    message: string,
    pieceIds: string[] = [],
    severity: ValidationIssue["severity"] = "error",
    step?: number,
  ) => issues.push({ code, message, pieceIds, severity, step });
  const poses: PartPose[] = [],
    pieces = new Map<string, Placement>(),
    bounds = new Map<string, { min: Vec3; max: Vec3 }>();
  if (!model.placements.length)
    issue("empty-model", "A build must contain pieces.");
  for (const p of model.placements) {
    if (pieces.has(p.id))
      issue("duplicate-piece", "Piece identities must be unique.", [p.id]);
    pieces.set(p.id, p);
    const profile = BUILDER_BY_REBRICKABLE.get(p.partId),
      pose = placementPose(p);
    if (!profile) {
      issue("unknown-part", "This part has no reviewed geometry/profile.", [
        p.id,
      ]);
      continue;
    }
    if (!validPose(pose)) {
      issue(
        "invalid-pose",
        "Coordinates and rotations must be finite and normalized.",
        [p.id],
      );
      continue;
    }
    if (!Number.isInteger(p.step) || p.step < 1 || p.step > model.steps.length)
      issue(
        "invalid-step",
        "The piece references an invalid instruction step.",
        [p.id],
      );
    if (
      !COLORS[p.color] ||
      !profile.observedColorIds?.includes(COLORS[p.color].rebrickableId)
    )
      issue(
        "unrecorded-color",
        "This part/color pair has no recorded source evidence.",
        [p.id],
      );
    if (!profile.connectors.length)
      issue(
        "unsupported-connection",
        "This part's connection mechanism is unreviewed.",
        [p.id],
      );
    poses.push(pose);
    const box = boundsForPose(pose, profile.mesh.bounds);
    bounds.set(p.id, box);
    if (box.min[1] < -0.001)
      issue("below-ground", "The piece penetrates the display surface.", [
        p.id,
      ]);
  }
  const uniquePoses = [...new Map(poses.map((p) => [p.id, p])).values()];
  const graph = findMates(uniquePoses),
    neighbors = new Map(uniquePoses.map((p) => [p.id, new Set<string>()]));
  const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const matePairs = new Map<string, Mate[]>(),
    allowed = new Map<string, (p: Vec3) => boolean>();
  for (const mate of graph.mates) {
    const key = pairKey(mate.a.pieceId, mate.b.pieceId),
      list = matePairs.get(key) ?? [];
    list.push(mate);
    matePairs.set(key, list);
  }
  function allowance(a: PartPose, b: PartPose) {
    const key = pairKey(a.id, b.id),
      previous = allowed.get(key);
    if (previous) return previous;
    const fn = contactAllowance(matePairs.get(key) ?? [], a, b);
    allowed.set(key, fn);
    return fn;
  }
  for (const mate of graph.mates) {
    neighbors.get(mate.a.pieceId)!.add(mate.b.pieceId);
    neighbors.get(mate.b.pieceId)!.add(mate.a.pieceId);
  }
  const ground = new Set(
    uniquePoses
      .filter((p) => Math.abs(bounds.get(p.id)!.min[1]) < 0.002)
      .map((p) => p.id),
  );
  const visited = new Set<string>(),
    components: string[][] = [];
  for (const p of uniquePoses) {
    if (visited.has(p.id)) continue;
    const list = [p.id];
    visited.add(p.id);
    for (let i = 0; i < list.length; i++)
      for (const n of neighbors.get(list[i])!) {
        if (!visited.has(n)) {
          visited.add(n);
          list.push(n);
        }
      }
    components.push(list);
  }
  for (const component of components)
    if (!component.some((id) => ground.has(id)))
      issue(
        "floating-component",
        "This connected group has no path to the ground-supported foundation.",
        component,
      );
  if (components.length > 1)
    issue(
      "disconnected-build",
      "The finished design must form one connected assembly.",
      components.map((c) => c[0]),
    );
  const instructionIds = model.steps.flatMap((s) => s.placementIds),
    actualIds = model.placements.map((p) => p.id);
  if (
    new Set(instructionIds).size !== instructionIds.length ||
    !same([...instructionIds].sort(), [...actualIds].sort())
  )
    issue(
      "instruction-inventory",
      "Instructions must account for every piece exactly once.",
    );
  if (
    !same(countParts(model.placements), model.parts) ||
    model.stats.pieceCount !== model.placements.length ||
    model.stats.uniquePartCount !== model.parts.length
  )
    issue(
      "inventory-mismatch",
      "The model, counts and parts inventory disagree.",
    );
  const built = new Set<string>(),
    constructionRank = new Map<string, number>();
  for (const step of model.steps) {
    if (
      step.number !== model.steps.indexOf(step) + 1 ||
      !step.placementIds.length
    )
      issue(
        "step-sequence",
        "Instruction numbers must be contiguous and nonempty.",
        [],
        "error",
        step.number,
      );
    const additions = step.placementIds.flatMap((id) => pieces.get(id) ?? []);
    if (
      !same(countParts(additions), step.parts) ||
      additions.some((p) => p.step !== step.number)
    )
      issue(
        "step-parts",
        "This step's inventory disagrees with its placed pieces.",
        step.placementIds,
        "error",
        step.number,
      );
    const pending: string[] = [];
    // Audit the displayed order, including order within large layer steps.
    for (const id of step.placementIds) {
      const p = pieces.get(id);
      if (!p) continue;
      if (
        (p.dependsOn ?? []).some((d) => !built.has(d)) ||
        (!ground.has(id) &&
          ![...(neighbors.get(id) ?? [])].some((n) => built.has(n)))
      ) {
        pending.push(id);
        continue;
      }
      constructionRank.set(id, constructionRank.size);
      built.add(id);
    }
    if (pending.length)
      issue(
        "unsupported-step",
        "This instruction order places pieces before their anchors or dependencies.",
        pending,
        "error",
        step.number,
      );
    for (const p of additions) {
      if (p.procedure === "manual-flex" && !(step.procedures ?? []).length)
        issue(
          "missing-procedure",
          "This fit needs its explicit manual installation instruction.",
          [p.id],
          "error",
          step.number,
        );
    }
    // A prior connection proves seating, while straight-path clearance is audited below.
  }
  for (const bag of model.bags) {
    const assigned = model.steps.filter((s) => s.bag === bag.number);
    if (
      !assigned.length ||
      assigned[0].number !== bag.firstStep ||
      assigned.at(-1)!.number !== bag.lastStep ||
      assigned.some((s, i) => s.number !== bag.firstStep + i) ||
      !same(
        countParts(
          model.placements.filter(
            (p) => p.step >= bag.firstStep && p.step <= bag.lastStep,
          ),
        ),
        bag.parts,
      )
    )
      issue(
        "bag-inventory",
        "Sorting bags must match their contiguous instruction ranges.",
      );
  }
  if (model.steps.some((s) => !model.bags.some((b) => b.number === s.bag)))
    issue("missing-bag", "Every instruction must belong to a sorting bag.");
  if (model.placements.some((p) => p.procedure === "manual-flex"))
    issue(
      "manual-fit",
      "Window tabs require manual flex fitting; physical verification is pending.",
      model.placements
        .filter((p) => p.procedure === "manual-flex")
        .map((p) => p.id),
      "warning",
    );
  // Non-root structural choke points are reported; this is not a force simulation.
  for (const p of uniquePoses) {
    if (ground.has(p.id) || neighbors.get(p.id)!.size !== 1) continue;
    const profile = PART_PROFILES.get(p.partId)!;
    if ((profile.bodySize?.[0] ?? 1) > 2)
      issue(
        "limited-anchor",
        "A broad part depends on one neighboring piece. Test this connection physically.",
        [p.id],
        "warning",
      );
  }
  const instances = new Map<string, CollisionInstance>();
  let geometryPending = !shapes;
  if (shapes) {
    for (const pose of uniquePoses) {
      const shape = shapes.get(pose.partId);
      if (!shape) {
        geometryPending = true;
        issue(
          "missing-collision-data",
          "Collision geometry is unavailable for this part.",
          [pose.id],
        );
        continue;
      }
      const instance = collisionInstance(pose, shape);
      if (!instance) {
        issue(
          "unchecked-pose",
          "The sampled solid check supports cardinal rotations and the 0.4 mm grid; this pose needs a finer solver.",
          [pose.id],
        );
        continue;
      }
      instances.set(pose.id, instance);
    }
  }
  if (shapes) {
    if (
      uniquePoses.some(
        (p) => PART_PROFILES.get(p.partId)!.collision?.ambiguousCells,
      )
    )
      issue(
        "sampled-solver",
        "Source surfaces contain disputed samples; these are conservatively treated as solid. Features below 0.4 mm and physical strength are not certified.",
        [],
        "warning",
      );
    const ordered = [...instances.values()].sort((a, b) => a.min[0] - b.min[0]);
    for (let i = 0; i < ordered.length; i++)
      for (
        let j = i + 1;
        j < ordered.length && ordered[j].min[0] < ordered[i].max[0];
        j++
      ) {
        const a = ordered[i],
          b = ordered[j],
          point = collisionPoint(a, b, allowance(a.pose, b.pose));
        if (point) {
          issue(
            "solid-collision",
            "Two parts occupy the same sampled solid region outside a reviewed mating volume.",
            [a.pose.id, b.pose.id],
          );
          issues.at(-1)!.point = point;
        }
      }
    // Audit each declared axis from the target back to a clear approach position.
    for (const p of model.placements) {
      const instance = instances.get(p.id);
      if (!instance || p.procedure === "manual-flex") continue;
      const originalAxis = p.approach ?? [0, 1, 0],
        axis = originalAxis.map((n) => Math.round(n)) as Vec3;
      if (
        originalAxis.some((n) => Math.abs(n - Math.round(n)) > 1e-6) ||
        axis.reduce((s, n) => s + Math.abs(n), 0) !== 1
      ) {
        issue(
          "unknown-insertion",
          "This insertion direction has no sampled clearance audit.",
          [p.id],
        );
        continue;
      }
      const direction = axis.findIndex((n) => n !== 0);
      const blockers = [...instances.values()].filter(
        (b) =>
          constructionRank.get(b.pose.id)! < constructionRank.get(p.id)! &&
          [0, 1, 2]
            .filter((i) => i !== direction)
            .every(
              (i) => b.max[i] > instance.min[i] && b.min[i] < instance.max[i],
            ) &&
          (axis[direction] > 0
            ? b.max[direction] > instance.min[direction]
            : b.min[direction] < instance.max[direction]),
      );
      let blocked = false;
      // Bounding envelopes select blockers; actual sampled material decides collision.
      const maxTravel =
        Math.max(
          0,
          ...blockers.map((b) =>
            axis[direction] > 0
              ? b.max[direction] - instance.min[direction]
              : instance.max[direction] - b.min[direction],
          ),
        ) + 2;
      for (let distance = 1; distance <= maxTravel && !blocked; distance++) {
        const moving = shifted(instance, axis, distance);
        for (const b of blockers) {
          if (collisionPoint(moving, b, allowance(instance.pose, b.pose))) {
            issue(
              "blocked-insertion",
              "An earlier piece blocks the declared straight placement path.",
              [p.id, b.pose.id],
              "error",
              p.step,
            );
            blocked = true;
            break;
          }
        }
      }
    }
    let mass = 0;
    const weighted = new Vector3();
    for (const pose of uniquePoses) {
      const proxy = PART_PROFILES.get(pose.partId)!.collision;
      if (!proxy) continue;
      const center = new Vector3(...proxy.center)
        .applyQuaternion(new Quaternion(...pose.rotation))
        .add(new Vector3(...pose.position));
      weighted.addScaledVector(center, proxy.volume);
      mass += proxy.volume;
    }
    if (mass) weighted.divideScalar(mass);
    const roots = [...ground].map((id) => bounds.get(id)!);
    if (roots.length && mass) {
      const supportMin = [0, 2].map((i) =>
          Math.min(...roots.map((r) => r.min[i])),
        ),
        supportMax = [0, 2].map((i) => Math.max(...roots.map((r) => r.max[i])));
      if (
        weighted.x < supportMin[0] ||
        weighted.x > supportMax[0] ||
        weighted.z < supportMin[1] ||
        weighted.z > supportMax[1]
      )
        issue(
          "overturn-proxy",
          "The sampled volume centre lies outside the ground footprint. Mass and clutch strength still require physical measurements.",
          [],
          "warning",
        );
    }
  }
  const definitions = [
    {
      id: "parts",
      name: "Real parts & recorded colors",
      codes: [
        "empty-model",
        "unknown-part",
        "invalid-pose",
        "invalid-step",
        "duplicate-piece",
        "unrecorded-color",
        "unsupported-connection",
      ],
    },
    {
      id: "structure",
      name: "Connected foundation & structure",
      codes: ["floating-component", "disconnected-build", "below-ground"],
    },
    {
      id: "instructions",
      name: "Anchored construction sequence",
      codes: [
        "instruction-inventory",
        "step-sequence",
        "step-parts",
        "unsupported-step",
        "missing-procedure",
      ],
    },
    {
      id: "inventory",
      name: "Parts, steps & bags agree",
      codes: ["inventory-mismatch", "bag-inventory", "missing-bag"],
    },
    {
      id: "geometry",
      name: "Solid clearance at 0.4 mm",
      codes: ["solid-collision", "missing-collision-data", "unchecked-pose"],
    },
    {
      id: "insertion",
      name: "Declared placement access",
      codes: ["blocked-insertion", "unknown-insertion"],
    },
  ];
  const checks = definitions.map((c) => ({
    id: c.id,
    name: c.name,
    status: issues.some(
      (i) => i.severity === "error" && c.codes.includes(i.code),
    )
      ? ("failed" as const)
      : geometryPending && (c.id === "geometry" || c.id === "insertion")
        ? ("pending" as const)
        : ("passed" as const),
  }));
  return {
    version: PROFILE_VERSION,
    status: issues.some((i) => i.severity === "error")
      ? "failed"
      : geometryPending
        ? "pending"
        : "passed",
    physicalStatus: "untested",
    checks,
    issues,
    connections: graph.mates.length,
    components: components.length,
    pieceCount: model.placements.length,
    collisionResolutionMillimetres: 0.4,
    manufacturingEvidence: "recorded",
    stockStatus: "unchecked",
  };
}

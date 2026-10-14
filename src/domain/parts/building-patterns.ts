import { snapPose, worldConnectors, IDENTITY } from "./connections";
import { PART_PROFILES } from "./profiles";
import { COLORS } from "../catalog";
import { placementBounds } from "../model-pose";
import { countParts } from "../inventory";
import type { BuilderPart, PartPose, Vec3 } from "./types";
import type { HouseModel, Placement, ColorId } from "../types";
export const BUILDING_PATTERNS = [
  { id: "bonded-wall", name: "Bonded wall", root: "3008", mode: "wall" },
  { id: "arch-cap", name: "Cap an arch", root: "92950", mode: "cap" },
  { id: "side-detail", name: "Build sideways", root: "87087", mode: "side" },
  { id: "leaf-mount", name: "Mount a leaf", root: "4728", mode: "mount" },
  {
    id: "curved-roof",
    name: "Mount a curved surface",
    root: "47457",
    mode: "mount",
  },
] as const;
function colorFor(part: BuilderPart): ColorId {
  const match = Object.entries(COLORS).find(([, c]) =>
    part.observedColorIds.includes(c.rebrickableId),
  );
  if (!match) throw Error("Pattern needs a recorded demo palette color.");
  return match[0] as ColorId;
}
export function createBuildingPattern(
  id: (typeof BUILDING_PATTERNS)[number]["id"],
): HouseModel {
  const pattern = BUILDING_PATTERNS.find((p) => p.id === id)!,
    placements: Placement[] = [];
  function addPose(pose: PartPose) {
    const part = PART_PROFILES.get(pose.partId)!;
    placements.push({
      id: pose.id,
      partId: part.rebrickableId,
      color: colorFor(part),
      position: pose.position,
      rotation: pose.rotation,
      rotated: false,
      step: placements.length + 1,
    });
  }
  function attach(
    partId: string,
    target: PartPose,
    targetConnector: string,
    localKind = "anti-stud",
  ) {
    const profile = PART_PROFILES.get(partId)!,
      local = profile.connectors.find((c) => c.kind === localKind)!,
      world = worldConnectors(target).find((c) => c.id === targetConnector)!;
    const pose = snapPose(
      {
        id: `pattern-${placements.length + 1}`,
        partId,
        position: [0, 0, 0],
        rotation: IDENTITY,
      },
      local.id,
      world,
    );
    addPose(pose);
    placements.at(-1)!.approach = world.normal;
    placements.at(-1)!.dependsOn = [target.id];
    return pose;
  }
  const part = PART_PROFILES.get(pattern.root)!;
  if (pattern.mode === "mount") {
    const socket = part.connectors.find(
      (c) => c.kind === "anti-stud" && c.normal[1] === -1,
    )!;
    if (!socket) throw Error("Pattern requires a reviewed underside port.");
    const extraHeight = Math.max(0, socket.position[1] - part.mesh.bounds[1]);
    const courses = Math.max(1, Math.ceil(extraHeight / 1.2) + 1);
    let root: PartPose = {
      id: "pattern-1",
      partId: "3005",
      position: [0, 0.6, 0],
      rotation: IDENTITY,
    };
    addPose(root);
    for (let i = 1; i < courses; i++)
      root = attach(
        "3005",
        root,
        PART_PROFILES.get("3005")!.connectors.find((c) => c.kind === "stud")!
          .id,
      );
    const stud = worldConnectors(root).find((c) => c.kind === "stud")!,
      pose = snapPose(
        {
          id: `pattern-${placements.length + 1}`,
          partId: part.id,
          position: [0, 0, 0],
          rotation: IDENTITY,
        },
        socket.id,
        stud,
      );
    addPose(pose);
    placements.at(-1)!.dependsOn = [root.id];
  } else {
    const root: PartPose = {
      id: "pattern-1",
      partId: part.id,
      position: [0, -part.mesh.bounds[1], 0],
      rotation: IDENTITY,
    };
    addPose(root);
    if (pattern.mode === "side")
      attach(
        "3024",
        root,
        part.connectors.find((c) => c.kind === "stud" && c.normal[1] === 0)!.id,
      );
    else if (pattern.mode === "cap")
      attach("3024", root, part.connectors.find((c) => c.kind === "stud")!.id);
    else {
      // Offset a four-stud brick across the lower eight-stud course, then cap its joint.
      const middle = worldConnectors(root)
        .filter((c) => c.kind === "stud")
        .sort((a, b) => Math.abs(a.position[0]) - Math.abs(b.position[0]))[0];
      const upper = attach("3010", root, middle.id);
      attach(
        "2431",
        upper,
        PART_PROFILES.get("3010")!.connectors.find((c) => c.kind === "stud")!
          .id,
      );
    }
  }
  const parts = countParts(placements),
    steps = placements.map((p, i) => ({
      number: i + 1,
      title: pattern.name,
      bag: 1,
      parts: countParts([p]),
      placementIds: [p.id],
      phaseNumber: 1,
      cluster: i + 1,
      clusters: placements.length,
      area: pattern.name,
      suggestedView: "perspective" as const,
      focus: p.position,
      description:
        "Seat on the reviewed attachment. Preserve the declared approach and dependencies.",
      hint: "Nominal digital pattern; test physical clutch strength.",
    }));
  const boxes = placements.map(placementBounds),
    dimensions = [0, 2, 1].map(
      (axis) =>
        Math.round(
          (Math.max(...boxes.map((b) => b.max[axis])) -
            Math.min(...boxes.map((b) => b.min[axis]))) *
            8,
        ) / 10,
    ) as Vec3;
  return {
    settings: { detail: "normal", size: "compact" },
    revision: "building-patterns-v1",
    placements,
    steps,
    parts,
    bags: [
      {
        number: 1,
        name: pattern.name,
        firstStep: 1,
        lastStep: steps.length,
        parts,
      },
    ],
    stats: {
      pieceCount: placements.length,
      uniquePartCount: parts.length,
      dimensions,
      buildMinutes: 3,
      difficulty: "Moderate",
    },
  };
}

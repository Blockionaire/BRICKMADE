import { CATALOG, COLORS } from "./catalog";
import { parseHouseBrief } from "../../shared/house-brief";
import { parseHouseDesign } from "../../shared/studio";
import { createStudioHouse } from "./studio/house";
import { partCapabilities } from "./parts/selection";
import { countParts } from "./inventory";
import { planBuildSteps } from "./build-steps";
import { BUILDER_BY_REBRICKABLE } from "./parts/profiles";
import { snapPose, worldConnectors, quarterTurn } from "./parts/connections";
import { placementBounds, placementPose } from "./model-pose";
import type {
  BuildPhase,
  ColorId,
  GenerationSettings,
  HouseModel,
  ModelKind,
  Placement,
} from "./types";
import type { Vec3 } from "./parts/types";

export const DESIGN_REVISION = "2026-10-14.structure-v2";
export const HOUSE_COMPILER_REVISION = "2026-10-14.house-compiler-v1";
export const MODEL_KINDS: {
  id: ModelKind;
  name: string;
  description: string;
  details: string[];
}[] = [
  {
    id: "house",
    name: "Compact House",
    description: "Bonded walls, real windows and a terracotta roof.",
    details: [
      "Big bricks, a low house and a simple roof.",
      "Clear panes, staggered walls and a chimney.",
      "Fine brickwork, bonding courses and mounted shutters.",
    ],
  },
  {
    id: "rover",
    name: "Little Rover",
    description: "A shelf model with fixed wheel details and a curved bonnet.",
    details: [
      "A chunky little vehicle with round wheel details.",
      "A longer cabin, lights and a curved bonnet.",
      "Fine bodywork, a raised cabin and detailed wheel faces.",
    ],
  },
  {
    id: "plant",
    name: "Bloom Pot",
    description: "Real leaves and petals, built from a connected stem.",
    details: [
      "One flower on a simple stem.",
      "Two leafy stems and a round planter.",
      "A fuller arrangement with staggered branches and flowers.",
    ],
  },
  {
    id: "pavilion",
    name: "Garden Pavilion",
    description: "An open structure with columns, arches and a garden.",
    details: [
      "Four solid columns and a broad roof.",
      "Arched entrances and a bonded roof cap.",
      "Round columns, layered arches and an ornamental garden.",
    ],
  },
];
export const kindFor = (settings: GenerationSettings) =>
  settings.modelKind ?? "house";
export const modelInfo = (settings: GenerationSettings) => {
  const info = MODEL_KINDS.find((k) => k.id === kindFor(settings))!;
  return settings.houseBrief
    ? {
        ...info,
        name: settings.houseBrief.title,
        description: "A generated house based on your editable description.",
        details: [
          "Larger wall blocks and a simplified roof.",
          "Smaller brickwork and fitted windows where selected.",
          "Fine brickwork, bonding courses and supported shutters.",
        ],
      }
    : info;
};
const cache = new Map<string, HouseModel>();

export class Assembly {
  placements: Placement[] = [];
  phases: BuildPhase[] = [];
  adaptations = new Set<string>();
  constructor(public settings: GenerationSettings) {}
  phase(
    title: string,
    hint: string,
    bag: number,
    build: () => void,
    area = title,
    view: BuildPhase["suggestedView"] = "perspective",
  ) {
    const number = this.phases.length + 1,
      start = this.placements.length;
    build();
    const pieces = this.placements.slice(start);
    if (!pieces.length) return;
    this.phases.push({
      number,
      title,
      description: hint,
      hint,
      bag,
      parts: countParts(pieces),
      placementIds: pieces.map((p) => p.id),
      area,
      suggestedView: bag === 2 && area === "Walls" ? undefined : view,
    });
  }
  add(
    partId: string,
    color: ColorId,
    x: number,
    bottom: number,
    z: number,
    turns = 0,
    extra: Partial<Placement> = {},
  ): Placement {
    const part = CATALOG[partId];
    if (!part) throw Error(`No curated part ${partId}`);
    if (this.settings.houseBrief) {
      const profile = BUILDER_BY_REBRICKABLE.get(partId);
      if (!profile || !partCapabilities(profile).supported)
        throw Error(`Part ${partId} has no supported connection rules.`);
      if (!profile.observedColorIds.includes(COLORS[color].rebrickableId)) {
        const replacement = (
          [
            "sand",
            "white",
            "stone",
            "wood",
            "black",
            "roof",
            "leaf",
            "grass",
            "flower",
          ] as ColorId[]
        ).find((candidate) =>
          profile.observedColorIds.includes(COLORS[candidate].rebrickableId),
        );
        if (!replacement)
          throw Error(`No recorded color is available for part ${partId}.`);
        this.adaptations.add(
          `${part.name} (#${partId}) uses ${COLORS[replacement].name.toLowerCase()}; ${COLORS[color].name.toLowerCase()} has no recorded source evidence for this part.`,
        );
        color = replacement;
      }
    }
    const p: Placement = {
      id: `piece-${this.placements.length + 1}`,
      partId,
      color,
      position: [x, bottom + part.height / 2, z],
      rotated: turns % 2 !== 0,
      rotation: quarterTurn(turns),
      step: this.phases.length + 1,
      layer: bottom,
      ...extra,
    };
    this.placements.push(p);
    return p;
  }
  attach(
    partId: string,
    color: ColorId,
    target: Placement,
    targetKind = "stud",
    index = 0,
    movingKind = "anti-stud",
    extra: Partial<Placement> = {},
  ) {
    const profile = BUILDER_BY_REBRICKABLE.get(partId)!;
    const connection = worldConnectors(placementPose(target)).filter(
      (c) => c.kind === targetKind,
    )[index];
    const local = profile.connectors.find((c) => c.kind === movingKind);
    if (!connection || !local)
      throw Error(`Missing reviewed fit ${target.partId} → ${partId}`);
    const pose = snapPose(
      {
        id: `piece-${this.placements.length + 1}`,
        partId: profile.id,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
      local.id,
      connection,
    );
    const p: Placement = {
      id: pose.id,
      partId,
      color,
      position: pose.position,
      rotation: pose.rotation,
      rotated: false,
      step: this.phases.length + 1,
      layer: target.layer ?? 0,
      approach: connection.normal,
      dependsOn: [target.id],
      ...extra,
    };
    this.placements.push(p);
    return p;
  }
  rect(
    x: number,
    z: number,
    width: number,
    depth: number,
    bottom: number,
    color: ColorId,
    max = 4,
  ) {
    for (let dz = 0; dz < depth; dz += 2) {
      const d = Math.min(2, depth - dz);
      for (let dx = 0; dx < width;) {
        const remaining = width - dx,
          w =
            Math.min(max, remaining) >= 4
              ? 4
              : Math.min(max, remaining) >= 2
                ? 2
                : 1;
        if (w === 1 && d === 2) {
          this.add("3023", color, x + dx + 0.5, bottom, z + dz + 1, 1);
        } else
          this.add(
            d === 2
              ? w === 4
                ? "3020"
                : "3022"
              : w === 4
                ? "3710"
                : w === 2
                  ? "3023"
                  : "3024",
            color,
            x + dx + w / 2,
            bottom,
            z + dz + d / 2,
          );
        dx += w;
      }
    }
  }
  foundation(size: number, color: ColorId = "grass") {
    this.phase(
      "A place to begin",
      "Lay the large foundation plates flat. The next course bonds their seams into one base.",
      1,
      () => {
        for (let z = -size / 2; z < size / 2; z += 4)
          for (let x = -size / 2; x < size / 2; x += 4)
            this.add("3031", color, x + 2, 0, z + 2);
      },
      "Foundation",
      "top",
    );
    this.phase(
      "Lock the foundation together",
      "Offset these plates across the joints below. Their overlapping attachments connect the complete base.",
      1,
      () => {
        const widths = [2, ...Array(size / 4 - 1).fill(4), 2],
          depths = [1, ...Array(size / 2 - 1).fill(2), 1];
        let z = -size / 2;
        for (const d of depths) {
          let x = -size / 2;
          for (const w of widths) {
            this.add(
              d === 2 ? (w === 4 ? "3020" : "3022") : w === 4 ? "3710" : "3023",
              color,
              x + w / 2,
              0.4,
              z + d / 2,
            );
            x += w;
          }
          z += d;
        }
      },
      "Bonded foundation",
      "top",
    );
  }
  finish(): HouseModel {
    const sequence = planBuildSteps(
        this.placements,
        this.phases,
        this.settings,
      ),
      parts = countParts(sequence.placements);
    const bags = [...new Set(sequence.steps.map((s) => s.bag))].map(
      (number) => {
        const steps = sequence.steps.filter((s) => s.bag === number);
        return {
          number,
          name: steps[0].area,
          firstStep: steps[0].number,
          lastStep: steps.at(-1)!.number,
          parts: countParts(
            sequence.placements.filter((p) =>
              steps.some((s) => s.number === p.step),
            ),
          ),
        };
      },
    );
    const bounds = sequence.placements.map(placementBounds),
      mins = [0, 1, 2].map((i) => Math.min(...bounds.map((b) => b.min[i]))),
      maxs = [0, 1, 2].map((i) => Math.max(...bounds.map((b) => b.max[i])));
    return {
      kind: kindFor(this.settings),
      revision: this.settings.houseBrief
        ? HOUSE_COMPILER_REVISION
        : DESIGN_REVISION,
      ...(this.settings.houseBrief
        ? {
            design: {
              source: this.settings.designSource ?? "manual",
              brief: this.settings.houseBrief,
              adaptations: [...this.adaptations],
            },
          }
        : {}),
      settings: {
        ...this.settings,
        modelKind: kindFor(this.settings),
        buildDifficulty: this.settings.buildDifficulty ?? "medium",
      },
      ...sequence,
      parts,
      bags,
      stats: {
        pieceCount: sequence.placements.length,
        uniquePartCount: parts.length,
        dimensions: [
          (maxs[0] - mins[0]) * 0.8,
          (maxs[2] - mins[2]) * 0.8,
          (maxs[1] - mins[1]) * 0.8,
        ].map((n) => Math.round(n * 10) / 10) as Vec3,
        buildMinutes: Math.round(sequence.placements.length * 0.4),
        difficulty:
          this.settings.detail === "easy"
            ? "Easy"
            : this.settings.detail === "hard"
              ? "Challenging"
              : "Moderate",
      },
    };
  }
}

function house(a: Assembly) {
  const brief = a.settings.houseBrief;
  const level = a.settings.detail,
    easy = level === "easy",
    hard = level === "hard",
    scale =
      a.settings.size === "compact"
        ? 0
        : a.settings.size === "standard"
          ? 1
          : 2;
  const w = 8 + scale * 2,
    d = brief
      ? Math.max(4, Math.min(8, Math.round(w / brief.aspectRatio / 2) * 2))
      : 4 + scale * 2,
    hw = w / 2,
    hd = d / 2,
    rows = brief
      ? (easy ? 3 : hard ? 6 : 4) +
        (brief.height === "low" ? -1 : brief.height === "tall" ? 2 : 0)
      : easy
        ? 3
        : hard
          ? 6
          : 4,
    maximum = easy ? (brief ? 8 : 6) : hard ? 1 : 4;
  const wallColor = brief?.wallColor ?? "sand",
    roofColor = brief?.roofColor ?? "roof",
    doorColor = brief?.doorColor ?? "wood";
  if (brief) {
    a.adaptations.add(
      `Footprint is snapped to ${w} × ${d} studs; proportions are estimated, not measured.`,
    );
    if (brief.roof === "stepped")
      a.adaptations.add(
        "The pitched roof is represented by supported horizontal plate courses.",
      );
    a.adaptations.add(
      "Doors are solid brick details. Side windows, interior rooms and irregular footprints are outside this first house compiler.",
    );
    if (easy && brief.frontWindows)
      a.adaptations.add(
        "Easy detail omits fitted windows and uses larger wall blocks.",
      );
  }
  a.foundation(12 + scale * 4);
  a.phase(
    "The path home",
    "Tile the interior and entrance, leaving all wall attachment studs exposed.",
    1,
    () => {
      a.rect(-hw + 1, -hd + 1, w - 2, d - 2, 0.8, "stone");
      for (let z = hd; z < hd + 2; z++) a.add("3023", "stone", 0, 0.8, z + 0.5);
    },
    "Floor & path",
    "top",
  );
  let bottom = 0.8;
  function band(y: number) {
    for (const x of [-hw + 1, hw - 1])
      for (const z of [-hd + 1, hd - 1]) a.add("3022", wallColor, x, y, z);
    for (const z of [-hd + 0.5, hd - 0.5])
      a.rect(-hw + 2, z - 0.5, w - 4, 1, y, wallColor);
    for (const x of [-hw + 0.5, hw - 0.5])
      for (let z = -hd + 2; z < hd - 2; z++)
        a.add("3024", wallColor, x, y, z + 0.5);
  }
  for (let row = 0; row < rows; row++) {
    const y = bottom;
    a.phase(
      row === 0 ? "The first walls" : `Walls & windows · layer ${row + 1}`,
      "Seat bricks on exposed studs. Alternate corner ownership and offset long joints between courses.",
      2,
      () => {
        const windowRow =
          !easy &&
          (row === 1 || row === 2 || (hard && (row === 3 || row === 4)));
        const windowStart = !easy && (row === 1 || (hard && row === 3));
        const windows =
          brief?.frontWindows === 0
            ? []
            : brief?.frontWindows === 1
              ? [-hw + 2]
              : [-hw + 2, hw - 2];
        const onFace = (front: boolean) => front || !brief || brief.rearWindows;
        if (windowStart) {
          for (const front of [false, true])
            for (const x of windows) {
              if (!onFace(front)) continue;
              const frame = a.add(
                "60592",
                wallColor,
                x,
                y,
                front ? hd - 0.5 : -hd + 0.5,
                front ? 0 : 2,
              );
              a.attach(
                "60601",
                "glass",
                frame,
                "window-seat",
                0,
                "window-insert",
                { procedure: "manual-flex", layer: y },
              );
            }
        }
        const horizontal = (
          cells: { at: number; color: ColorId; head?: boolean }[],
          fixed: number,
          rotated: boolean,
        ) => {
          for (let i = 0; i < cells.length;) {
            const cell = cells[i];
            let same = 1;
            while (
              i + same < cells.length &&
              cells[i + same].at === cell.at + same &&
              cells[i + same].color === cell.color &&
              !cell.head &&
              !cells[i + same].head &&
              same < maximum
            )
              same++;
            const len =
                same >= 8
                  ? 8
                  : same >= 6
                    ? 6
                    : same >= 4
                      ? 4
                      : same >= 2
                        ? 2
                        : 1,
              id = cell.head
                ? "4070"
                : len === 8
                  ? "3008"
                  : len === 6
                    ? "3009"
                    : len === 4
                      ? "3010"
                      : len === 2
                        ? "3004"
                        : "3005";
            const p = a.add(
              id,
              cell.color,
              rotated ? fixed : cell.at + len / 2,
              y,
              rotated ? cell.at + len / 2 : fixed,
              rotated ? 1 : 0,
            );
            if (cell.head)
              a.attach("3070b", "wood", p, "stud", 1, "anti-stud", {
                layer: y,
              });
            i += len;
          }
        };
        const odd = row % 2 === 1;
        for (const front of [false, true]) {
          const cells = [];
          for (let x = -hw + (odd ? 1 : 0); x < hw - (odd ? 1 : 0); x++) {
            if (
              windowRow &&
              onFace(front) &&
              windows.some((cx) => x >= cx - 1 && x < cx + 1)
            )
              continue;
            cells.push({
              at: x,
              color:
                front && x >= -1 && x < 1 && row < 3 ? doorColor : wallColor,
              head: hard && front && row === 2 && (x === -hw || x === hw - 1),
            });
          }
          horizontal(cells, front ? hd - 0.5 : -hd + 0.5, false);
        }
        for (const x of [-hw + 0.5, hw - 0.5]) {
          const cells = [];
          for (let z = -hd + (odd ? 0 : 1); z < hd - (odd ? 0 : 1); z++)
            cells.push({ at: z, color: wallColor as ColorId });
          horizontal(cells, x, true);
        }
      },
      "Walls",
    );
    bottom += 1.2;
    if (hard && (row === 2 || row === 5)) {
      const y = bottom;
      a.phase(
        "Bond the brickwork",
        "These plates overlap individual brick columns and wrap the corners, tying the wall structure together.",
        2,
        () => band(y),
        "Wall bonding course",
      );
      bottom += 0.4;
    }
  }
  const deck = bottom;
  a.phase(
    "Bridge the roof",
    "Run the long plates from front to back. Each strip attaches to both wall edges before the smaller roof courses begin.",
    3,
    () => {
      for (let x = -hw - 1; x < hw + 1; x += 2)
        a.add("3034", roofColor, x + 1, deck, 0, 1);
    },
    "Roof deck",
  );
  let top = deck + 0.4;
  const depths = brief
    ? brief.roof === "flat"
      ? [d + 2]
      : Array.from(
          { length: d / 2 + (easy ? 0 : 1) },
          (_, i) => d + (easy ? 0 : 2) - i * 2,
        )
    : easy
      ? [4, 2]
      : [6, 4, 2];
  for (const depth of depths) {
    for (let sub = 0; sub < (easy ? 1 : 2); sub++) {
      const y = top;
      a.phase(
        depth === 2
          ? "Finish the roof ridge"
          : `Shape the roof · ${depth}-stud course`,
        "Center this course on the bonded roof below. Keep every underside aligned with the exposed stud grid.",
        3,
        () =>
          a.rect(-hw - 1, -depth / 2, w + 2, depth, y, roofColor, hard ? 2 : 4),
        "Roof",
      );
      top += 0.4;
    }
  }
  if (!brief || brief.chimney)
    a.phase(
      "The little chimney",
      easy
        ? "Cap the ridge with a small roof accent."
        : "The chimney attaches to the ridge studs and stays clear of all roof courses.",
      4,
      () => {
        if (!easy) {
          for (let r = 0; r < (hard ? 4 : 2); r++)
            a.add("3003", "wood", -hw + 1, top + r * 1.2, 0);
          a.add("3068b", "stone", -hw + 1, top + (hard ? 4 : 2) * 1.2, 0);
        } else a.add("3022", roofColor, 0, top, 0);
      },
      "Chimney",
      "back",
    );
  if (!brief || brief.garden)
    a.phase(
      "A garden of your own",
      "Mount actual plant pieces on the base studs. Keep leaves clear of the walls and neighboring stems.",
      4,
      () => {
        for (const side of [-1, 1]) {
          const stem = a.add(
            "3062b",
            "leaf",
            side * (hw + 1.5),
            0.8,
            -hd + 0.5,
          );
          a.attach("24866", "flower", stem);
          if (!easy) {
            a.add(
              "30176",
              "leaf",
              side * (hw + 1.5),
              0.8,
              hd - 1.5,
              side === 1 ? 0 : 2,
            );
          }
        }
        if (hard) {
          for (let x = -hw; x < hw; x += 2) {
            const p = a.add(
              "3004",
              "wood",
              x + 1,
              0.8,
              -(12 + scale * 4) / 2 + 0.5,
            );
            a.attach("6141", "flower", p, "stud", 0);
          }
        }
      },
      "Garden",
      "side",
    );
}

function rover(a: Assembly) {
  const easy = a.settings.detail === "easy",
    hard = a.settings.detail === "hard",
    scale =
      a.settings.size === "compact"
        ? 0
        : a.settings.size === "standard"
          ? 1
          : 2,
    length = 6 + scale * 2;
  a.foundation(12 + scale * 4, "stone");
  const heads: Placement[] = [],
    lights: Placement[] = [];
  a.phase(
    "A connected chassis",
    "This is a fixed display model. Build the chassis on its plinth; the round wheel details attach to sideways studs.",
    2,
    () => {
      a.rect(-length / 2, -2, length, 4, 0.8, "black");
      for (const z of [-1.5, 1.5])
        for (const x of [-length / 2 + 1.5, length / 2 - 1.5])
          heads.push(a.add("4070", "black", x, 1.2, z, z > 0 ? 0 : 2));
      for (let x = -length / 2; x < length / 2 - (hard ? 1 : 0);) {
        const n = easy && x + 4 <= length / 2 ? 4 : hard ? 1 : 2;
        a.add(
          n === 4 ? "3001" : n === 2 ? "3003" : "3004",
          "roof",
          x + n / 2,
          1.2,
          0,
          hard ? 1 : 0,
        );
        x += n;
      }
      if (hard)
        for (const z of [-0.5, 0.5])
          lights.push(a.add("4070", "black", length / 2 - 0.5, 1.2, z, 1));
    },
    "Chassis",
  );
  a.phase(
    "Round wheel details",
    "Press each round wheel face onto its matching side stud. These decorative wheels are fixed; they do not roll.",
    2,
    () => {
      for (const head of heads) a.attach("6141", "stone", head, "stud", 1);
    },
    "Wheel faces",
    "side",
  );
  a.phase(
    "Shape the cabin",
    "The cabin plates attach to the central body studs. Leave the outside wheel details clear.",
    3,
    () => {
      a.rect(-1, -1, 2, 2, 2.4, "roof");
      if (!easy) {
        a.add("3003", "glass", 0, 2.8, 0);
        a.add("3022", "roof", 0, 4, 0);
      }
      if (hard) {
        a.add("3022", "stone", 0, 4.4, 0);
        a.add("3068b", "black", 0, 4.8, 0);
      }
    },
    "Cabin",
  );
  a.phase(
    "Lights & a curved bonnet",
    "Attach lights and curved pieces to real exposed studs. The underside of each curved piece seats on one reviewed rear socket.",
    4,
    () => {
      for (const x of [-length / 2 + 0.5, length / 2 - 0.5])
        for (const z of [-0.5, 0.5]) {
          if (easy) a.add("3024", "flower", x, 2.4, z);
          else
            a.add(
              "11477",
              "roof",
              x - (x > 0 ? 0.5 : -0.5),
              2.4,
              z,
              x > 0 ? 1 : 3,
            );
        }
      if (hard)
        for (const head of lights) a.attach("6141", "white", head, "stud", 1);
    },
    "Finishing details",
    "front",
  );
}

function plant(a: Assembly) {
  const easy = a.settings.detail === "easy",
    hard = a.settings.detail === "hard",
    scale =
      a.settings.size === "compact"
        ? 0
        : a.settings.size === "standard"
          ? 1
          : 2;
  a.foundation(8 + scale * 4, "stone");
  a.phase(
    "A pot with roots",
    "Build the planter on the bonded base. Its upper studs support the stems.",
    2,
    () => {
      a.add(easy ? "3003" : "3941", "wood", 0, 0.8, 0);
      if (hard) a.add("3941", "wood", 0, 2, 0);
    },
    "Planter",
  );
  const stems: Placement[] = [];
  a.phase(
    "Grow the stems",
    "Stack the round stem pieces directly on their supporting studs.",
    3,
    () => {
      const sites = easy
        ? [[-0.5, -0.5]]
        : hard
          ? [
              [-0.5, -0.5],
              [0.5, 0.5],
              [-0.5, 0.5],
            ]
          : [
              [-0.5, -0.5],
              [0.5, 0.5],
            ];
      sites.forEach(([x, z], i) => {
        const n = (easy ? 2 : hard ? 4 : 3) + scale + (hard ? i : 0);
        let last: Placement | undefined;
        for (let row = 0; row < n; row++)
          last = a.add("3062b", "leaf", x, (hard ? 3.2 : 2) + row * 1.2, z);
        stems.push(last!);
      });
    },
    "Stems",
  );
  a.phase(
    "Leaves & flowers",
    "Seat leaf roots on the stem studs, then flowers on the leaf studs. Work from the lower spray upward.",
    4,
    () => {
      stems.forEach((stem, i) => {
        if (easy) {
          a.attach("24866", "flower", stem);
          return;
        }
        const leaf = a.attach("2423", "leaf", stem);
        const turn = i === 0 ? 2 : i === 1 ? 0 : 3;
        leaf.rotation = quarterTurn(turn);
        leaf.rotated = false;
        const indices = hard ? [1, 3, 5] : [1, 5];
        for (const index of indices)
          a.attach("24866", "flower", leaf, "stud", index);
      });
    },
    "Flowers & foliage",
    "top",
  );
}

function pavilion(a: Assembly) {
  const easy = a.settings.detail === "easy",
    hard = a.settings.detail === "hard",
    scale =
      a.settings.size === "compact"
        ? 0
        : a.settings.size === "standard"
          ? 1
          : 2;
  a.foundation(8 + scale * 4, "stone");
  const columns = 3 + scale + (hard ? 1 : 0);
  a.phase(
    "Four connected columns",
    "Build the four columns on the base studs. Their upper attachments support the roof.",
    2,
    () => {
      for (let row = 0; row < columns; row++)
        for (const x of [-1.5, 1.5])
          for (const z of [-1.5, 1.5])
            a.add(hard ? "3062b" : "3005", "sand", x, 0.8 + row * 1.2, z);
    },
    "Columns",
  );
  let top = 0.8 + columns * 1.2;
  a.phase(
    "Open the arches",
    easy
      ? "Add a plate to each column before the roof cap."
      : "Connect the front and back arches first. The side arches sit one course higher, preventing overlapping corner feet.",
    3,
    () => {
      if (easy) {
        for (const x of [-1.5, 1.5])
          for (const z of [-1.5, 1.5]) a.add("3024", "sand", x, top, z);
        top += 0.4;
      } else {
        for (const z of [-1.5, 1.5]) a.add("3659", "sand", 0, top, z);
        top += 1.2;
        for (const x of [-1.5, 1.5]) a.add("3659", "sand", x, top, 0, 1);
        top += 1.2;
      }
    },
    "Arches",
  );
  a.phase(
    "Bring the roof together",
    "The broad plate cap attaches to the columns or upper arches and bonds the roof into one assembly.",
    3,
    () => {
      a.add("3031", "roof", 0, top, 0);
      top += 0.4;
      if (!easy) {
        a.add("3022", "roof", 0, top, 0);
        top += 0.4;
      }
      if (hard) a.add("3068b", "stone", 0, top, 0);
    },
    "Roof cap",
  );
  a.phase(
    "An ornamental garden",
    "Attach flowers outside the column footprint. Keep the open passage clear.",
    4,
    () => {
      for (const x of [-2.5, 2.5]) {
        const p = a.add("3062b", "leaf", x, 0.8, -2.5);
        a.attach("24866", "flower", p);
      }
      if (hard)
        for (const x of [-2.5, 2.5]) a.add("6141", "flower", x, 0.8, 2.5);
    },
    "Garden",
    "top",
  );
}
export function createModel(settings: GenerationSettings): HouseModel {
  if (settings.houseDesign) {
    const description = parseHouseDesign(settings.houseDesign);
    const key = JSON.stringify({ ...settings, houseDesign: description });
    const previous = cache.get(key);
    if (previous) return previous;
    const result = createStudioHouse(description, settings);
    cache.set(key, result);
    if (cache.size > 128) cache.delete(cache.keys().next().value!);
    return result;
  }
  const houseBrief = settings.houseBrief
    ? parseHouseBrief(settings.houseBrief)
    : undefined;
  if (
    houseBrief &&
    (houseBrief.subject !== "house" ||
      (settings.modelKind && settings.modelKind !== "house"))
  )
    throw Error("This generator currently supports simple houses only.");
  const normalized = {
    ...settings,
    ...(houseBrief ? { houseBrief } : {}),
    modelKind: kindFor(settings),
    buildDifficulty: settings.buildDifficulty ?? "medium",
  };
  const key = JSON.stringify(normalized);
  const old = cache.get(key);
  if (old) return old;
  const assembly = new Assembly(normalized);
  ({ house, rover, plant, pavilion })[normalized.modelKind](assembly);
  const model = assembly.finish();
  cache.set(key, model);
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  return model;
}

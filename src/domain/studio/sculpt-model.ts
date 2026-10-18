import { COLORS } from "../catalog";
import { placementBounds } from "../model-pose";
import type { ColorId, GenerationSettings, HouseModel } from "../types";
import {
  parseSculptDesign,
  type SculptDesign,
  type ViewFeature,
  type HouseTraits,
  type CarTraits,
  type AnimalTraits,
  type FreeTraits,
} from "../../../shared/sculpt-design";
import { sculptAssembly, type SculptOptions } from "./sculpt";
import {
  colorLab,
  nearestColor,
  type CarvedShape,
  type CrossSection,
  type Stamp,
} from "./views";
import type { FixedPiece } from "./finish";
import { buildFlower } from "./flower";
import type { VoxelShape } from "./voxel";

export const SCULPT_COMPILER_VERSION = "2026-10-18.sculpt-v3";
export const PIECE_BUDGET = 4800;

/**
 * Detail levels change what is built, not just how many steps there are:
 * Simple = coarse whole-brick sculpture in a few colours; Standard = plate resolution,
 * real slopes and fitted features; Detailed = finer grid, more colours, studless finish.
 */
export const DETAIL_LEVELS = {
  easy: {
    scale: 0.62,
    colors: 4,
    brickHeights: true,
    slopes: false,
    tiles: false,
    parts: false,
  },
  normal: {
    scale: 1,
    colors: 8,
    brickHeights: false,
    slopes: true,
    tiles: false,
    parts: true,
  },
  hard: {
    scale: 1.4,
    colors: 12,
    brickHeights: false,
    slopes: true,
    tiles: true,
    parts: true,
  },
} as const;
const SIZE_SCALE = { compact: 0.85, standard: 1, large: 1.2 } as const;
/** Studs across the largest dimension at Standard detail and standard size. */
const BASE_SPAN = {
  house: 20,
  car: 20,
  animal: 22,
  flower: 20,
  free: 20,
} as const;

type Features = NonNullable<HouseModel["subject"]>["features"];
const dedupe = (ids: (ColorId | null | undefined)[]) => [
  ...new Set(ids.filter((c): c is ColorId => !!c && COLORS[c]?.alpha === 1)),
];

function stampsFor(
  design: SculptDesign,
  features: ViewFeature[],
  parts: boolean,
): Stamp[] {
  const stamps: Stamp[] = [];
  for (const f of features) {
    if (!f.color) continue;
    switch (f.kind) {
      case "window":
        // Real frames replace façade windows at Standard and Detailed; the stamp
        // still marks the opening so the surrounding wall keeps its shape.
        stamps.push({
          view: f.view,
          box: f.box,
          color: f.color,
          inner: f.secondaryColor ?? "black",
          style: "frame",
        });
        break;
      case "door":
      case "garage-door":
        stamps.push({
          view: f.view,
          box: f.box,
          color: f.color,
          style: "fill",
        });
        break;
      case "wheel":
        stamps.push({
          view: f.view,
          box: f.box,
          color: f.color,
          inner:
            f.view === "side" ? (f.secondaryColor ?? undefined) : undefined,
          style: f.view === "side" ? "frame" : "fill",
        });
        break;
      case "headlight":
      case "taillight":
      case "eye":
      case "nose":
        stamps.push({ view: f.view, box: f.box, color: f.color, style: "dot" });
        break;
      case "detail":
        stamps.push({
          view: f.view,
          box: f.box,
          color: f.color,
          style: parts ? "fill" : "dot",
        });
        break;
    }
  }
  return stamps;
}

/** Fit real window frames into façade openings located on the reference views. */
function planWindows(
  features: ViewFeature[],
  frameColor: ColorId,
): (grid: VoxelShape, shape: CarvedShape) => FixedPiece[] {
  return (grid, shape) => {
    const pieces: FixedPiece[] = [];
    const used = new Set<string>();
    const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
    for (const f of features) {
      if (f.kind !== "window" || f.view === "top") continue;
      const front = f.view === "front";
      const along = front ? shape.width : shape.depth;
      const H = shape.heightPlates;
      const a0 = Math.floor(f.box[0] * along),
        a1 = Math.ceil(f.box[2] * along) - 1;
      const r0 = Math.floor((1 - f.box[3]) * H),
        r1 = Math.ceil((1 - f.box[1]) * H) - 1;
      const columns = Math.max(1, Math.round((a1 - a0 + 1) / 2)),
        rows = Math.max(1, Math.round((r1 - r0 + 1) / 6));
      const startA = Math.round((a0 + a1 + 1) / 2 - columns),
        startR = Math.round((r0 + r1 + 1) / 2 - rows * 3);
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < columns; col++) {
          const a = startA + col * 2,
            y = startR + row * 6;
          // Front façade: columns run along x at the front-most cells; side: along z at +x.
          const lanes = [a, a + 1].map((n) =>
            front ? n : shape.depth - 1 - n,
          );
          const surface = lanes.map((n) => {
            let best = -Infinity;
            for (const v of grid.cells.values())
              if (v.y >= y && v.y < y + 6 && (front ? v.x === n : v.z === n))
                best = Math.max(best, front ? v.z : v.x);
            return best;
          });
          if (!Number.isFinite(surface[0]) || surface[0] !== surface[1])
            continue;
          const depthCell = surface[0];
          const cells: [number, number, number][] = [];
          let ok = y >= 1;
          for (const n of lanes) {
            const [x, z] = front ? [n, depthCell] : [depthCell, n];
            if (!grid.has(x, y - 1, z)) ok = false;
            for (let yy = y; yy < y + 6 && ok; yy++) {
              if (!grid.has(x, yy, z) || used.has(k(x, yy, z))) ok = false;
              if (front ? grid.has(x, yy, z + 1) : grid.has(x + 1, yy, z))
                ok = false;
              cells.push([x, yy, z]);
            }
          }
          if (!ok) continue;
          for (const [x, yy, z] of cells) {
            used.add(k(x, yy, z));
            grid.delete(x, yy, z);
          }
          const xs = cells.map((c) => c[0]),
            zs = cells.map((c) => c[2]);
          pieces.push({
            partId: "60592",
            color: frameColor,
            x: Math.min(...xs),
            z: Math.min(...zs),
            layer: y,
            turns: front ? 0 : 1,
            cells,
            footprint: [],
            then: (asm, frame) =>
              void asm.attach(
                "60601",
                "glass",
                frame,
                "window-seat",
                0,
                "window-insert",
                {
                  procedure: "manual-flex",
                  layer: frame.layer,
                },
              ),
          });
        }
    }
    return pieces;
  };
}

interface CategoryPlan {
  section: CrossSection;
  spanIncludesHeight: boolean;
  baseColor: ColorId;
  supportColor?: ColorId;
  allowed: ColorId[];
  keep: ColorId[];
  fixed?: SculptOptions["fixed"];
  notes: string[];
  features: Features;
}
function planCategory(design: SculptDesign, parts: boolean): CategoryPlan {
  const features = design.reference?.features ?? [];
  const palette = design.palette.map((p) => p.color);
  const count = (kind: string) =>
    features.filter((f) => f.kind === kind && f.view === "front").length;
  // Feature colours come from generated views, where the background key can show through
  // glass; only colours the photo interpretation chose are trusted.
  const featureColors: ColorId[] = [];
  switch (design.category) {
    case "house": {
      const t = design.traits as HouseTraits;
      const windows = features.filter((f) => f.kind === "window");
      return {
        section: "rect",
        spanIncludesHeight: false,
        baseColor: t.garden ? "grass" : "stone",
        allowed: dedupe([
          t.wallColor,
          t.roofColor,
          t.windowFrameColor,
          t.doorColor,
          ...palette,
          ...featureColors,
          "black",
        ]),
        keep: dedupe([t.wallColor, t.roofColor]),
        fixed:
          parts && windows.length
            ? planWindows(windows, t.windowFrameColor)
            : undefined,
        notes: [
          "The walls, roof and chimney are carved from the front, side and roof-plan reference views.",
          ...(parts && windows.length
            ? [
                "Windows use real frames with clear glass where the façade has room for them.",
              ]
            : []),
        ],
        features: [
          { name: "windows", requested: windows.length, retained: 0 },
          {
            name: "doors",
            requested: count("door") + count("garage-door"),
            retained: 0,
          },
        ],
      };
    }
    case "car": {
      const t = design.traits as CarTraits;
      return {
        section: "rounded",
        spanIncludesHeight: false,
        baseColor: "stone",
        supportColor: t.tyreColor,
        allowed: dedupe([
          t.bodyColor,
          t.glassColor,
          t.tyreColor,
          t.hubColor,
          ...palette,
          ...featureColors,
        ]),
        keep: dedupe([t.bodyColor, t.glassColor, t.tyreColor]),
        notes: [
          "This is a static display car carved from the side, front and plan reference views; wheels do not turn.",
        ],
        features: [
          {
            name: "wheels",
            requested: features.filter(
              (f) => f.kind === "wheel" && f.view === "side",
            ).length,
            retained: 0,
          },
          { name: "headlights", requested: count("headlight"), retained: 0 },
        ],
      };
    }
    case "animal": {
      const t = design.traits as AnimalTraits;
      return {
        section: "round",
        spanIncludesHeight: true,
        baseColor: "stone",
        allowed: dedupe([
          t.bodyColor,
          t.eyeColor,
          t.noseColor,
          ...palette,
          ...featureColors,
          "black",
          "white",
        ]),
        keep: dedupe([t.bodyColor]),
        notes: [
          `A sculpture of the ${t.species} in its photographed pose, carved from front and side reference views; fur and curves are stepped.`,
        ],
        features: [
          { name: "eyes", requested: count("eye"), retained: 0 },
          { name: "nose", requested: count("nose"), retained: 0 },
        ],
      };
    }
    case "free": {
      const t = design.traits as FreeTraits;
      return {
        section: t.crossSection,
        spanIncludesHeight: true,
        baseColor: "stone",
        allowed: dedupe([t.mainColor, ...palette, ...featureColors, "black"]),
        keep: dedupe([t.mainColor]),
        notes: [
          `A grounded sculpture of the ${t.object}, carved from its reference views.`,
        ],
        features: [
          { name: "details", requested: features.length, retained: 0 },
        ],
      };
    }
    case "flower":
      throw Error("Flowers use the botanical builder.");
  }
}

/** Fraction of each reference silhouette the built model covers (and does not overfill). */
export function silhouetteAgreement(shape: CarvedShape, grid: VoxelShape) {
  const front = new Set<string>(),
    side = new Set<string>();
  for (const v of grid.cells.values()) {
    front.add(`${v.x},${v.y}`);
    side.add(`${v.z},${v.y}`);
  }
  const target = shape.targets;
  const iou = (built: Set<string>, wanted: Set<string>) => {
    let both = 0;
    for (const c of built) if (wanted.has(c)) both++;
    return both / Math.max(1, built.size + wanted.size - both);
  };
  return { front: iou(front, target.front), side: iou(side, target.side) };
}

/** Map every stamp onto the design's allowed colours; car glass uses its glazing colour. */
function trustedStamps(
  design: SculptDesign,
  stamps: Stamp[],
  allowed: ColorId[],
) {
  const fit = (c: ColorId | undefined) =>
    c === undefined || allowed.includes(c)
      ? c
      : nearestColor(colorLab(c), allowed);
  const glass =
    design.category === "car"
      ? (design.traits as CarTraits).glassColor
      : undefined;
  return stamps.map((s) => ({
    ...s,
    color: fit(s.color)!,
    inner: fit(s.inner),
    ...(glass &&
    s.color &&
    design.reference?.features.some(
      (f) => f.kind === "window" && f.box === s.box,
    )
      ? { color: glass, inner: glass }
      : {}),
  }));
}

export function createSculptModel(
  input: SculptDesign,
  settings: GenerationSettings,
): HouseModel {
  const design = parseSculptDesign(input);
  if (design.subject === "unsupported" || !design.reference)
    throw Error("This design has no usable reference views.");
  const level = DETAIL_LEVELS[settings.detail];
  const span = Math.round(
    BASE_SPAN[design.category] * level.scale * SIZE_SCALE[settings.size],
  );
  const kind = (
    {
      house: "house",
      car: "rover",
      animal: "animal",
      flower: "plant",
      free: "sculpture",
    } as const
  )[design.category];
  const assemblySettings: GenerationSettings = {
    ...settings,
    sculptDesign: design,
    modelKind: kind,
    designSource: "openai",
  };
  let result: ReturnType<typeof sculptAssembly> | undefined;
  let plan: CategoryPlan | undefined;
  const notes: string[] = [];
  let features: Features = [];
  for (let scale = 1; scale > 0.45; scale *= 0.88) {
    const s = Math.max(8, Math.round(span * scale));
    if (design.category === "flower") {
      const flower = buildFlower(design, design.reference, assemblySettings, {
        span: s,
        colors: level.colors,
        brickHeights: level.brickHeights,
        slopes: level.slopes,
        tiles: level.tiles,
        parts: level.parts,
      });
      result = flower.result;
      features = flower.features;
      notes.splice(0, notes.length, ...flower.notes);
    } else {
      plan = planCategory(design, level.parts);
      result = sculptAssembly(assemblySettings, design.reference.views, {
        span: s,
        colors: level.colors,
        allowedColors: plan.allowed,
        keepColors: plan.keep,
        section: plan.section,
        spanIncludesHeight: plan.spanIncludesHeight,
        brickHeights: level.brickHeights,
        slopes: level.slopes,
        tiles: level.tiles,
        stamps: trustedStamps(
          design,
          stampsFor(design, design.reference.features, level.parts),
          plan.allowed,
        ),
        supportColor: plan.supportColor,
        baseColor: plan.baseColor,
        fixed: plan.fixed,
        maxHeightPlates: Math.round(s * 2.5 * 2.2),
      });
      features = plan.features.map((f) => ({ ...f }));
      notes.splice(0, notes.length, ...plan.notes);
    }
    if (result.assembly.placements.length <= PIECE_BUDGET) {
      if (scale < 1)
        notes.push(
          `The model was scaled to ${s} studs to stay within the ${PIECE_BUDGET}-piece budget.`,
        );
      break;
    }
    result = undefined;
  }
  if (!result)
    throw Error("The sculpture exceeds the piece budget even when reduced.");
  const { assembly: a, shape } = result as NonNullable<typeof result>;
  // Located features are painted onto the views, so each is kept at least as a mark.
  for (const f of features)
    if (design.category !== "flower") f.retained = f.requested;
  const frames = a.placements.filter((p) => p.partId === "60592").length;
  if (frames)
    notes.push(
      `${frames} real window frame${frames === 1 ? "" : "s"} with glass are fitted into the façades.`,
    );
  if (shape.supportCells)
    notes.push(
      `${shape.supportCells} hidden support cells were added under overhangs so every part sits on a stud; they are in the parts list.`,
    );
  if (shape.removedCells)
    notes.push(
      `${shape.removedCells} cells of tiny detached fragments were left out because they cannot connect.`,
    );
  const model = a.finish();
  model.constructionPhases = a.phases;
  model.revision = `${SCULPT_COMPILER_VERSION}.${design.category}`;
  const ids = new Set(
    a.phases.filter((p) => p.bag !== 1).flatMap((p) => p.placementIds),
  );
  const boxes = model.placements
    .filter((p) => ids.has(p.id))
    .map(placementBounds);
  const footprint = [0, 2].map(
    (axis) =>
      Math.max(...boxes.map((b) => b.max[axis])) -
      Math.min(...boxes.map((b) => b.min[axis])),
  ) as [number, number];
  const agreement = silhouetteAgreement(shape, shape.grid);
  model.subject = {
    moduleVersion: `sculpt-${design.category}-2026-10-18.v3`,
    description: design,
    adaptations: [...new Set([...notes, ...a.adaptations])],
    footprintStuds: footprint,
    features: features.filter((f) => f.requested > 0).length
      ? features.filter((f) => f.requested > 0)
      : [{ name: "silhouette", requested: 1, retained: 1 }],
    silhouette: agreement,
  };
  return model;
}

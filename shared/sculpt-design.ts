import type { StudioCategory } from "./studio";
import {
  VIEW_PALETTE,
  parseViewSet,
  type ViewSet,
} from "../src/domain/studio/views";
import type { ColorId } from "../src/domain/types";

/**
 * Version 3 descriptions: the AI's category-informed interpretation plus orthographic
 * reference views and located features. The compiler builds directly from the views,
 * so the model follows the photographed silhouette rather than a fixed template.
 */
export const SCULPT_VERSION = 3;
export const BUILD_COLORS = VIEW_PALETTE;
export type FeatureView = "front" | "side" | "top";
export const FEATURE_KINDS = {
  house: ["window", "door", "garage-door"],
  car: ["wheel", "headlight", "taillight", "window"],
  animal: ["eye", "nose"],
  flower: ["bloom", "leaf", "pot"],
  free: ["detail"],
} as const satisfies Record<StudioCategory, readonly string[]>;
export interface ViewFeature {
  kind: string;
  view: FeatureView;
  /** x0, y0, x1, y1 within the cropped subject image, 0–1 with y downward. */
  box: [number, number, number, number];
  color: ColorId | null;
  secondaryColor: ColorId | null;
}
export interface HouseTraits {
  storeys: number;
  roofShape: "gable" | "hip" | "flat" | "shed" | "mansard" | "other";
  footprint: "rectangle" | "l-shaped" | "other";
  wallMaterial: "brick" | "render" | "wood" | "stone" | "other";
  wallColor: ColorId;
  roofColor: ColorId;
  windowFrameColor: ColorId;
  doorColor: ColorId;
  chimney: boolean;
  garden: boolean;
}
export interface CarTraits {
  bodyStyle:
    | "coupe"
    | "sedan"
    | "hatchback"
    | "estate"
    | "suv"
    | "van"
    | "pickup"
    | "convertible"
    | "sports"
    | "classic"
    | "other";
  bodyColor: ColorId;
  glassColor: ColorId;
  tyreColor: ColorId;
  hubColor: ColorId;
}
export interface AnimalTraits {
  species: string;
  pose: "standing" | "sitting" | "lying" | "other";
  bodyColor: ColorId;
  eyeColor: ColorId;
  noseColor: ColorId;
  markings: string;
}
export interface FlowerTraits {
  plant: string;
  bloomCount: number;
  bloomForm:
    | "daisy"
    | "sunflower"
    | "rose"
    | "tulip"
    | "cup"
    | "spike"
    | "cluster"
    | "other";
  bloomColor: ColorId;
  centerColor: ColorId;
  leafColor: ColorId;
  stemColor: ColorId;
  container: "none" | "pot" | "vase" | "planter";
  containerColor: ColorId;
}
export interface FreeTraits {
  object: string;
  crossSection: "round" | "rounded" | "rect";
  mainColor: ColorId;
}
export type SculptTraits =
  HouseTraits | CarTraits | AnimalTraits | FlowerTraits | FreeTraits;
export interface SculptDesign {
  version: 3;
  category: StudioCategory;
  subject: StudioCategory | "unsupported";
  title: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  observations: string[];
  uncertainties: string[];
  /** Real-world estimate in metres; used to sanity-check view proportions. */
  dimensions: { width: number; depth: number; height: number };
  /** The build colour a skilled builder would choose for each visible region. */
  palette: { region: string; color: ColorId }[];
  /** Short guidance passed to the reference-view generator. */
  viewNotes: string;
  traits: SculptTraits;
  /** Added by the pipeline after the views are generated and analysed. */
  reference?: { views: ViewSet; features: ViewFeature[]; notes: string[] };
}

type Rule = {
  type: string | string[];
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: Rule;
  properties?: Record<string, Rule>;
  additionalProperties?: false;
  required?: string[];
};
const text = (maxLength: number): Rule => ({
  type: "string",
  minLength: 1,
  maxLength,
});
const choice = (values: readonly string[]): Rule => ({
  type: "string",
  enum: values,
});
const color: Rule = choice(BUILD_COLORS);
const object = (properties: Record<string, Rule>): Rule => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const TRAITS: Record<StudioCategory, Rule> = {
  house: object({
    storeys: { type: "integer", minimum: 1, maximum: 4 },
    roofShape: choice(["gable", "hip", "flat", "shed", "mansard", "other"]),
    footprint: choice(["rectangle", "l-shaped", "other"]),
    wallMaterial: choice(["brick", "render", "wood", "stone", "other"]),
    wallColor: color,
    roofColor: color,
    windowFrameColor: color,
    doorColor: color,
    chimney: { type: "boolean" },
    garden: { type: "boolean" },
  }),
  car: object({
    bodyStyle: choice([
      "coupe",
      "sedan",
      "hatchback",
      "estate",
      "suv",
      "van",
      "pickup",
      "convertible",
      "sports",
      "classic",
      "other",
    ]),
    bodyColor: color,
    glassColor: color,
    tyreColor: color,
    hubColor: color,
  }),
  animal: object({
    species: text(80),
    pose: choice(["standing", "sitting", "lying", "other"]),
    bodyColor: color,
    eyeColor: color,
    noseColor: color,
    markings: text(300),
  }),
  flower: object({
    plant: text(80),
    bloomCount: { type: "integer", minimum: 1, maximum: 12 },
    bloomForm: choice([
      "daisy",
      "sunflower",
      "rose",
      "tulip",
      "cup",
      "spike",
      "cluster",
      "other",
    ]),
    bloomColor: color,
    centerColor: color,
    leafColor: color,
    stemColor: color,
    container: choice(["none", "pot", "vase", "planter"]),
    containerColor: color,
  }),
  free: object({
    object: text(80),
    crossSection: choice(["round", "rounded", "rect"]),
    mainColor: color,
  }),
};
export function sculptSchema(category: StudioCategory) {
  return object({
    version: { type: "integer", enum: [3] },
    category: choice([category]),
    subject: choice([category, "unsupported"]),
    // Generous limits: providers that enforce them cut words mid-token.
    title: text(120),
    summary: text(1200),
    confidence: choice(["low", "medium", "high"]),
    observations: { type: "array", maxItems: 10, items: text(300) },
    uncertainties: { type: "array", maxItems: 10, items: text(300) },
    dimensions: object({
      width: { type: "number", minimum: 0.01, maximum: 100 },
      depth: { type: "number", minimum: 0.01, maximum: 100 },
      height: { type: "number", minimum: 0.01, maximum: 100 },
    }),
    palette: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: object({ region: text(100), color }),
    },
    viewNotes: text(800),
    traits: TRAITS[category],
  });
}
const coordinate: Rule = { type: "number", minimum: 0, maximum: 1 };
export function featureSchema(category: StudioCategory) {
  return object({
    consistent: { type: "boolean" },
    notes: { type: "array", maxItems: 6, items: text(300) },
    features: {
      type: "array",
      maxItems: 40,
      items: object({
        kind: choice(FEATURE_KINDS[category]),
        view: choice(["front", "side", "top"]),
        box: { type: "array", minItems: 4, maxItems: 4, items: coordinate },
        color: { type: ["string", "null"], enum: [...BUILD_COLORS, null] },
        secondaryColor: {
          type: ["string", "null"],
          enum: [...BUILD_COLORS, null],
        },
      }),
    },
  });
}

function validate(value: unknown, rule: Rule, path = "description"): void {
  const types = Array.isArray(rule.type) ? rule.type : [rule.type];
  if (value === null && types.includes("null")) return;
  const type = types.find((t) => t !== "null")!;
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error(`Invalid ${path}.`);
    const v = value as Record<string, unknown>;
    if (
      Object.keys(v).sort().join() !==
      Object.keys(rule.properties!).sort().join()
    )
      throw Error(`Unexpected fields in ${path}.`);
    for (const [key, child] of Object.entries(rule.properties!))
      validate(v[key], child, `${path}.${key}`);
  } else if (type === "array") {
    if (
      !Array.isArray(value) ||
      value.length < (rule.minItems ?? 0) ||
      value.length > (rule.maxItems ?? 100)
    )
      throw Error(`Invalid ${path}.`);
    value.forEach((item, i) => validate(item, rule.items!, `${path}[${i}]`));
  } else {
    if (typeof value !== (type === "integer" ? "number" : type))
      throw Error(`Invalid ${path}.`);
    if (rule.enum && !rule.enum.includes(value))
      throw Error(`Unsupported ${path}.`);
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) ||
        (type === "integer" && !Number.isInteger(value)) ||
        value < (rule.minimum ?? -Infinity) ||
        value > (rule.maximum ?? Infinity))
    )
      throw Error(`Invalid ${path}.`);
    if (
      typeof value === "string" &&
      (!value.trim() ||
        value.length < (rule.minLength ?? 0) ||
        value.length > (rule.maxLength ?? 1000) ||
        /[\u0000-\u001f]/.test(value))
    )
      throw Error(`Invalid ${path}.`);
  }
}

/** Providers do not enforce string lengths; shorten over-long text instead of failing. */
function clampText<T>(value: T, rule: Rule): T {
  if (
    typeof value === "string" &&
    rule.maxLength &&
    value.length > rule.maxLength
  )
    return (value.slice(0, rule.maxLength - 1).trimEnd() + "…") as T;
  if (Array.isArray(value) && rule.items) {
    const items = value.map((v) => clampText(v, rule.items!));
    return (rule.maxItems ? items.slice(0, rule.maxItems) : items) as T;
  }
  if (value && typeof value === "object" && rule.properties)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        rule.properties![k] ? clampText(v, rule.properties![k]) : v,
      ]),
    ) as T;
  return value;
}

export function parseFeatureAnalysis(input: unknown, category: StudioCategory) {
  const value = clampText(input, featureSchema(category));
  validate(value, featureSchema(category), "feature analysis");
  const v = value as {
    consistent: boolean;
    notes: string[];
    features: ViewFeature[];
  };
  const features = v.features
    .map((f) => {
      const [a, b, c, d] = f.box;
      return {
        ...f,
        box: [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)],
      };
    })
    .filter(
      (f) => f.box[2] - f.box[0] > 0.004 && f.box[3] - f.box[1] > 0.004,
    ) as ViewFeature[];
  return { consistent: v.consistent, notes: v.notes, features };
}

export function isSculptDesign(value: unknown): value is SculptDesign {
  return (value as SculptDesign)?.version === SCULPT_VERSION;
}

export function parseSculptDesign(
  value: unknown,
  expected?: StudioCategory,
): SculptDesign {
  let v = value as SculptDesign;
  if (!v || typeof v !== "object" || (expected && v.category !== expected))
    throw Error("The description does not match its category.");
  if (!Object.hasOwn(TRAITS, v.category)) throw Error("Unknown category.");
  v = {
    ...clampText({ ...v, reference: undefined }, sculptSchema(v.category)),
    reference: v.reference,
  };
  if (v.reference === undefined) delete v.reference;
  const { reference, ...rest } = v;
  validate(rest, sculptSchema(v.category));
  const out = JSON.parse(JSON.stringify(rest)) as SculptDesign;
  if (reference !== undefined) {
    if (!reference || typeof reference !== "object")
      throw Error("Invalid reference views.");
    const views = parseViewSet(reference.views);
    const kinds: readonly string[] = FEATURE_KINDS[v.category];
    if (
      !Array.isArray(reference.features) ||
      reference.features.length > 40 ||
      !Array.isArray(reference.notes) ||
      reference.notes.length > 10 ||
      reference.notes.some((n) => typeof n !== "string" || n.length > 200)
    )
      throw Error("Invalid reference features.");
    for (const f of reference.features)
      if (
        !kinds.includes(f.kind) ||
        !["front", "side", "top"].includes(f.view) ||
        !Array.isArray(f.box) ||
        f.box.length !== 4 ||
        f.box.some((n) => typeof n !== "number" || !(n >= 0 && n <= 1)) ||
        f.box[0] > f.box[2] ||
        f.box[1] > f.box[3] ||
        (f.color !== null && !BUILD_COLORS.includes(f.color)) ||
        (f.secondaryColor !== null && !BUILD_COLORS.includes(f.secondaryColor))
      )
        throw Error("Invalid reference feature.");
    out.reference = {
      views,
      features: JSON.parse(JSON.stringify(reference.features)),
      notes: [...reference.notes],
    };
  }
  return out;
}

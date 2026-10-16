/** Category descriptions contain observed design intent, never AI-invented part IDs. */
export const SUBJECT_COLORS = [
  "sand",
  "roof",
  "wood",
  "grass",
  "stone",
  "leaf",
  "flower",
  "black",
  "white",
  "red",
  "blue",
  "orange",
  "pink",
  "purple",
  "lavender",
  "dark-blue",
  "dark-stone",
] as const;
export type SubjectColor = (typeof SUBJECT_COLORS)[number];
export type SubjectCategory = "flower" | "car" | "animal" | "free";
interface SubjectBase {
  version: 1;
  category: SubjectCategory;
  subject: SubjectCategory | "unsupported";
  title: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  observations: string[];
  uncertainties: string[];
}
export interface FlowerDesign extends SubjectBase {
  category: "flower";
  subject: "flower" | "unsupported";
  bloomCount: number;
  bloomKind: "round" | "daisy" | "tulip" | "spike";
  bloomColor: SubjectColor;
  centerColor: SubjectColor;
  stemHeight: "short" | "medium" | "tall";
  leafCount: number;
  arrangement: "single" | "cluster" | "row";
  pot: boolean;
  potColor: SubjectColor;
}
export interface CarDesign extends SubjectBase {
  category: "car";
  subject: "car" | "unsupported";
  bodyShape: "coupe" | "sedan" | "hatchback" | "suv" | "van" | "pickup";
  aspectRatio: number;
  bodyColor: SubjectColor;
  roofColor: SubjectColor;
  cabinPosition: "front" | "center" | "rear";
  cabinHeight: "low" | "medium" | "high";
  bonnetLength: "short" | "medium" | "long";
  roofRack: boolean;
  stripe: boolean;
  stripeColor: SubjectColor;
}
export interface AnimalDesign extends SubjectBase {
  category: "animal";
  subject: "animal" | "unsupported";
  species: "cat" | "dog" | "rabbit";
  pose: "standing" | "sitting";
  bodyRatio: number;
  bodyColor: SubjectColor;
  accentColor: SubjectColor;
  markings: "none" | "patches" | "stripe";
  ears: "small" | "pointed" | "long";
  tail: "none" | "short" | "long";
  headSize: "small" | "medium" | "large";
}
export interface FreeDesign extends SubjectBase {
  category: "free";
  subject: "free" | "unsupported";
  components: {
    name: string;
    shape: "box" | "rounded" | "tapered";
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
    color: SubjectColor;
  }[];
}
export type SubjectDesign =
  FlowerDesign | CarDesign | AnimalDesign | FreeDesign;
type Rule = {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
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
const choice = (values: readonly string[]): Rule => ({
  type: "string",
  enum: values,
});
const integer = (minimum: number, maximum: number): Rule => ({
  type: "integer",
  minimum,
  maximum,
});
const color = choice(SUBJECT_COLORS);
const common: Record<string, Rule> = {
  version: { type: "integer", enum: [1] },
  title: { type: "string", minLength: 1, maxLength: 60 },
  summary: { type: "string", minLength: 1, maxLength: 600 },
  confidence: choice(["low", "medium", "high"]),
  observations: {
    type: "array",
    maxItems: 10,
    items: { type: "string", minLength: 1, maxLength: 160 },
  },
  uncertainties: {
    type: "array",
    maxItems: 10,
    items: { type: "string", minLength: 1, maxLength: 160 },
  },
};
function object(properties: Record<string, Rule>): Rule {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}
function schema(category: SubjectCategory, properties: Record<string, Rule>) {
  return object({
    ...common,
    category: choice([category]),
    subject: choice([category, "unsupported"]),
    ...properties,
  });
}
export const SUBJECT_SCHEMAS = {
  flower: schema("flower", {
    bloomCount: integer(1, 5),
    bloomKind: choice(["round", "daisy", "tulip", "spike"]),
    bloomColor: color,
    centerColor: color,
    stemHeight: choice(["short", "medium", "tall"]),
    leafCount: integer(0, 6),
    arrangement: choice(["single", "cluster", "row"]),
    pot: { type: "boolean" },
    potColor: color,
  }),
  car: schema("car", {
    bodyShape: choice(["coupe", "sedan", "hatchback", "suv", "van", "pickup"]),
    aspectRatio: { type: "number", minimum: 1.5, maximum: 3.6 },
    bodyColor: color,
    roofColor: color,
    cabinPosition: choice(["front", "center", "rear"]),
    cabinHeight: choice(["low", "medium", "high"]),
    bonnetLength: choice(["short", "medium", "long"]),
    roofRack: { type: "boolean" },
    stripe: { type: "boolean" },
    stripeColor: color,
  }),
  animal: schema("animal", {
    species: choice(["cat", "dog", "rabbit"]),
    pose: choice(["standing", "sitting"]),
    bodyRatio: { type: "number", minimum: 0.75, maximum: 2.5 },
    bodyColor: color,
    accentColor: color,
    markings: choice(["none", "patches", "stripe"]),
    ears: choice(["small", "pointed", "long"]),
    tail: choice(["none", "short", "long"]),
    headSize: choice(["small", "medium", "large"]),
  }),
  free: schema("free", {
    components: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: object({
        name: { type: "string", minLength: 1, maxLength: 40 },
        shape: choice(["box", "rounded", "tapered"]),
        x: integer(0, 15),
        y: integer(0, 15),
        z: integer(0, 15),
        width: integer(1, 16),
        height: integer(1, 16),
        depth: integer(1, 16),
        color,
      }),
    },
  }),
} as const;
function validate(value: unknown, rule: Rule): void {
  if (rule.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("Invalid category object.");
    const v = value as Record<string, unknown>;
    if (
      Object.keys(v).sort().join() !==
      Object.keys(rule.properties!).sort().join()
    )
      throw Error("Unexpected category fields.");
    for (const [key, child] of Object.entries(rule.properties!))
      validate(v[key], child);
  } else if (rule.type === "array") {
    if (
      !Array.isArray(value) ||
      value.length < (rule.minItems || 0) ||
      value.length > (rule.maxItems || 100)
    )
      throw Error("Invalid category list.");
    for (const item of value) validate(item, rule.items!);
  } else {
    if (typeof value !== (rule.type === "integer" ? "number" : rule.type))
      throw Error("Invalid category value.");
    if (rule.enum && !rule.enum.includes(value))
      throw Error("Unsupported category choice.");
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) ||
        (rule.type === "integer" && !Number.isInteger(value)) ||
        value < (rule.minimum ?? -Infinity) ||
        value > (rule.maximum ?? Infinity))
    )
      throw Error("Invalid category dimension.");
    if (
      typeof value === "string" &&
      (!value.trim() ||
        value.length < (rule.minLength || 0) ||
        value.length > (rule.maxLength || 1000) ||
        /[\u0000-\u001f]/.test(value))
    )
      throw Error("Invalid category text.");
  }
}
export function parseSubjectDesign(
  value: unknown,
  expected?: SubjectCategory,
): SubjectDesign {
  const category = (value as SubjectDesign)?.category;
  if (
    !Object.hasOwn(SUBJECT_SCHEMAS, category) ||
    (expected && category !== expected)
  )
    throw Error("The description does not match its category.");
  validate(value, SUBJECT_SCHEMAS[category]);
  const design = value as SubjectDesign;
  if (
    design.category === "flower" &&
    design.arrangement === "single" &&
    design.bloomCount !== 1
  )
    throw Error("A single-stem arrangement must have one principal bloom.");
  if (
    design.category === "free" &&
    design.components.some(
      (c) => c.x + c.width > 16 || c.y + c.height > 16 || c.z + c.depth > 16,
    )
  )
    throw Error("A component exceeds the design workspace.");
  return JSON.parse(JSON.stringify(value));
}
const base = {
  version: 1 as const,
  title: "A design of your own",
  summary: "A compact, photo-informed display model.",
  confidence: "medium" as const,
  observations: ["Visible proportions guide this design."],
  uncertainties: ["Unseen geometry and dimensions are estimated."],
};
export const SUBJECT_EXAMPLES: Record<SubjectCategory, SubjectDesign> = {
  flower: {
    ...base,
    category: "flower",
    subject: "flower",
    bloomCount: 3,
    bloomKind: "daisy",
    bloomColor: "white",
    centerColor: "flower",
    stemHeight: "medium",
    leafCount: 3,
    arrangement: "cluster",
    pot: true,
    potColor: "wood",
  },
  car: {
    ...base,
    category: "car",
    subject: "car",
    bodyShape: "coupe",
    aspectRatio: 2.4,
    bodyColor: "blue",
    roofColor: "blue",
    cabinPosition: "center",
    cabinHeight: "low",
    bonnetLength: "long",
    roofRack: false,
    stripe: true,
    stripeColor: "white",
  },
  animal: {
    ...base,
    category: "animal",
    subject: "animal",
    species: "cat",
    pose: "sitting",
    bodyRatio: 1.5,
    bodyColor: "orange",
    accentColor: "white",
    markings: "patches",
    ears: "pointed",
    tail: "long",
    headSize: "medium",
  },
  free: {
    ...base,
    category: "free",
    subject: "free",
    components: [
      {
        name: "Main body",
        shape: "rounded",
        x: 3,
        y: 0,
        z: 4,
        width: 10,
        height: 8,
        depth: 8,
        color: "red",
      },
      {
        name: "Upper feature",
        shape: "box",
        x: 6,
        y: 8,
        z: 6,
        width: 4,
        height: 3,
        depth: 4,
        color: "stone",
      },
    ],
  },
};

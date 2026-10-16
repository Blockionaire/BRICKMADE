/** Versioned contracts shared by the browser, API and generation worker. */
export const STUDIO_VERSION = 1;
export const HOUSE_MODULE_VERSION = "house-2026-10-15.v2";
export const STUDIO_CATEGORIES = [
  {
    id: "house",
    name: "House",
    description: "Your home, made miniature.",
    available: true,
  },
  {
    id: "car",
    name: "Car",
    description: "Your ride as a static display model.",
    available: true,
  },
  {
    id: "animal",
    name: "Animal",
    description: "Cats, dogs and rabbits with character.",
    available: true,
  },
  {
    id: "flower",
    name: "Flower",
    description: "Something lovely, always in bloom.",
    available: true,
  },
  {
    id: "free",
    name: "Free format",
    description: "Turn an object into a grounded sculpture.",
    available: true,
  },
] as const;
export type StudioCategory = (typeof STUDIO_CATEGORIES)[number]["id"];
export type StudioDetail = "easy" | "normal" | "hard";
export type StudioPace = "easy" | "medium" | "hard";
export interface StudioOptions {
  version: 1;
  category: StudioCategory;
  detail: StudioDetail;
  size: "compact" | "standard" | "large";
  pace: StudioPace;
}
export const DEFAULT_STUDIO_OPTIONS: StudioOptions = {
  version: 1,
  category: "house",
  detail: "normal",
  size: "compact",
  pace: "medium",
};
export function parseStudioOptions(value: unknown): StudioOptions {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Choose a category and detail level.");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join() !== "category,detail,pace,size,version" ||
    v.version !== 1 ||
    !STUDIO_CATEGORIES.some((c) => c.id === v.category) ||
    !["easy", "normal", "hard"].includes(String(v.detail)) ||
    !["compact", "standard", "large"].includes(String(v.size)) ||
    !["easy", "medium", "hard"].includes(String(v.pace))
  )
    throw Error("The build settings are invalid.");
  return { ...v } as unknown as StudioOptions;
}
export interface HouseDesign {
  version: 2;
  subject: "house" | "unsupported";
  title: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  aspectRatio: number;
  footprint: "rectangle" | "l-shaped";
  storeys: 1 | 2 | 3;
  roofShape: "gable" | "hip" | "flat" | "shed";
  roofPitch: "low" | "medium" | "steep";
  ridgeAxis: "width" | "depth";
  wallColor: "sand" | "white" | "stone" | "wood";
  roofColor: "roof" | "black" | "stone" | "white";
  doorColor: "wood" | "black" | "white";
  frontWindows: number;
  rearWindows: number;
  leftWindows: number;
  rightWindows: number;
  doorPosition: "left" | "center" | "right";
  chimney: boolean;
  garden: boolean;
  observations: string[];
  uncertainties: string[];
}
const properties = {
  version: { type: "integer", enum: [2] },
  subject: { type: "string", enum: ["house", "unsupported"] },
  title: { type: "string", minLength: 1, maxLength: 60 },
  summary: { type: "string", minLength: 1, maxLength: 600 },
  confidence: { type: "string", enum: ["low", "medium", "high"] },
  aspectRatio: { type: "number", minimum: 0.75, maximum: 3 },
  footprint: { type: "string", enum: ["rectangle", "l-shaped"] },
  storeys: { type: "integer", enum: [1, 2, 3] },
  roofShape: { type: "string", enum: ["gable", "hip", "flat", "shed"] },
  roofPitch: { type: "string", enum: ["low", "medium", "steep"] },
  ridgeAxis: { type: "string", enum: ["width", "depth"] },
  wallColor: { type: "string", enum: ["sand", "white", "stone", "wood"] },
  roofColor: { type: "string", enum: ["roof", "black", "stone", "white"] },
  doorColor: { type: "string", enum: ["wood", "black", "white"] },
  frontWindows: { type: "integer", minimum: 0, maximum: 4 },
  rearWindows: { type: "integer", minimum: 0, maximum: 4 },
  leftWindows: { type: "integer", minimum: 0, maximum: 2 },
  rightWindows: { type: "integer", minimum: 0, maximum: 2 },
  doorPosition: { type: "string", enum: ["left", "center", "right"] },
  chimney: { type: "boolean" },
  garden: { type: "boolean" },
  observations: {
    type: "array",
    maxItems: 10,
    items: { type: "string", maxLength: 160 },
  },
  uncertainties: {
    type: "array",
    maxItems: 10,
    items: { type: "string", maxLength: 160 },
  },
} as const;
export const HOUSE_DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
} as const;
export function parseHouseDesign(value: unknown): HouseDesign {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("The house description is missing.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).sort().join() !== Object.keys(properties).sort().join()
  )
    throw Error("The house description has unexpected fields.");
  for (const [key, rule] of Object.entries(properties)) {
    const v = input[key];
    if (rule.type === "array") {
      if (
        !Array.isArray(v) ||
        v.length > rule.maxItems ||
        v.some(
          (s) =>
            typeof s !== "string" ||
            !s.trim() ||
            s.length > rule.items.maxLength ||
            /[\u0000-\u001f]/.test(s),
        )
      )
        throw Error(`Invalid ${key}.`);
    } else if (
      typeof v !== (rule.type === "integer" ? "number" : rule.type) ||
      (typeof v === "number" &&
        (!Number.isFinite(v) ||
          (rule.type === "integer" && !Number.isInteger(v)))) ||
      ("enum" in rule && !(rule.enum as readonly unknown[]).includes(v)) ||
      ("minimum" in rule && (v as number) < rule.minimum) ||
      ("maximum" in rule && (v as number) > rule.maximum) ||
      ("maxLength" in rule &&
        (typeof v !== "string" ||
          !v.trim() ||
          v.length > rule.maxLength ||
          /[\u0000-\u001f]/.test(v)))
    )
      throw Error(`Invalid ${key}.`);
  }
  return JSON.parse(JSON.stringify(input)) as HouseDesign;
}
export const JOB_STAGES = [
  "queued",
  "preparing",
  "interpreting",
  "planning",
  "compiling",
  "checking",
  "finalizing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];
export interface StudioJob {
  id: string;
  projectId: string;
  stage: JobStage;
  progress: number;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  cancelRequested: boolean;
  options: StudioOptions;
  error: {
    code: string;
    message: string;
    stage: string;
    requestId: string;
  } | null;
  artifact: { path: string; sha256: string; bytes: number } | null;
}
export const HOUSE_EXAMPLE: HouseDesign = {
  version: 2,
  subject: "house",
  title: "A home of your own",
  summary: "A two-storey house with a hipped roof and an off-centre entrance.",
  confidence: "medium",
  aspectRatio: 1.5,
  footprint: "rectangle",
  storeys: 2,
  roofShape: "hip",
  roofPitch: "medium",
  ridgeAxis: "width",
  wallColor: "sand",
  roofColor: "roof",
  doorColor: "wood",
  frontWindows: 2,
  rearWindows: 1,
  leftWindows: 1,
  rightWindows: 1,
  doorPosition: "left",
  chimney: true,
  garden: false,
  observations: ["Two visible storeys and a roof sloping on all sides."],
  uncertainties: ["Dimensions are estimated from the photos."],
};

/** AI proposes a bounded description; it never supplies placements or parts. */
export interface HouseBrief {
  version: 1;
  subject: "house" | "unsupported";
  title: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  aspectRatio: number;
  height: "low" | "standard" | "tall";
  roof: "stepped" | "flat";
  wallColor: "sand" | "white" | "stone" | "wood";
  roofColor: "roof" | "black" | "stone" | "white";
  doorColor: "wood" | "black" | "white";
  frontWindows: 0 | 1 | 2;
  rearWindows: boolean;
  chimney: boolean;
  garden: boolean;
  observations: string[];
  uncertainties: string[];
}
const fields = {
  version: { type: "integer", enum: [1] },
  subject: { type: "string", enum: ["house", "unsupported"] },
  title: { type: "string", maxLength: 60 },
  summary: { type: "string", maxLength: 600 },
  confidence: { type: "string", enum: ["low", "medium", "high"] },
  aspectRatio: { type: "number", minimum: 0.75, maximum: 3 },
  height: { type: "string", enum: ["low", "standard", "tall"] },
  roof: { type: "string", enum: ["stepped", "flat"] },
  wallColor: { type: "string", enum: ["sand", "white", "stone", "wood"] },
  roofColor: { type: "string", enum: ["roof", "black", "stone", "white"] },
  doorColor: { type: "string", enum: ["wood", "black", "white"] },
  frontWindows: { type: "integer", enum: [0, 1, 2] },
  rearWindows: { type: "boolean" },
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
export const HOUSE_BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: fields,
  required: Object.keys(fields),
};
export function parseHouseBrief(value: unknown): HouseBrief {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("The house description is invalid.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== Object.keys(fields).length ||
    Object.keys(input).some((key) => !(key in fields))
  )
    throw Error("The house description contains unexpected fields.");
  for (const [key, rule] of Object.entries(fields)) {
    const field = input[key];
    if ("enum" in rule && !(rule.enum as readonly unknown[]).includes(field))
      throw Error(`Choose a supported ${key}.`);
    if (rule.type === "boolean" && typeof field !== "boolean")
      throw Error(`The ${key} choice is invalid.`);
    if (
      rule.type === "string" &&
      (typeof field !== "string" ||
        !field.trim() ||
        /[\u0000-\u0008\u000b-\u001f]/.test(field) ||
        ("maxLength" in rule && field.length > rule.maxLength))
    )
      throw Error(`The ${key} text is invalid.`);
    if (
      "minimum" in rule &&
      (typeof field !== "number" ||
        !Number.isFinite(field) ||
        field < rule.minimum ||
        field > rule.maximum)
    )
      throw Error("House proportions must be between 0.75 and 3.");
    if (
      rule.type === "array" &&
      (!Array.isArray(field) ||
        field.length > rule.maxItems ||
        field.some(
          (item) =>
            typeof item !== "string" ||
            !item.trim() ||
            item.length > rule.items.maxLength ||
            /[\u0000-\u001f]/.test(item),
        ))
    )
      throw Error(`The ${key} notes are invalid.`);
  }
  return Object.fromEntries(
    Object.keys(fields).map((key) => [
      key,
      Array.isArray(input[key]) ? [...(input[key] as unknown[])] : input[key],
    ]),
  ) as unknown as HouseBrief;
}
export const HOUSE_PRESETS: { id: string; name: string; brief: HouseBrief }[] =
  [
    {
      id: "cottage",
      name: "Little cottage",
      brief: {
        version: 1,
        subject: "house",
        title: "Little cottage",
        summary: "Warm walls, a terracotta roof and a small garden.",
        confidence: "high",
        aspectRatio: 2,
        height: "low",
        roof: "stepped",
        wallColor: "sand",
        roofColor: "roof",
        doorColor: "wood",
        frontWindows: 2,
        rearWindows: false,
        chimney: true,
        garden: true,
        observations: [],
        uncertainties: [],
      },
    },
    {
      id: "townhouse",
      name: "City home",
      brief: {
        version: 1,
        subject: "house",
        title: "City home",
        summary: "A taller pale house with a dark flat roof.",
        confidence: "high",
        aspectRatio: 1,
        height: "tall",
        roof: "flat",
        wallColor: "white",
        roofColor: "black",
        doorColor: "black",
        frontWindows: 1,
        rearWindows: true,
        chimney: false,
        garden: false,
        observations: [],
        uncertainties: [],
      },
    },
    {
      id: "bungalow",
      name: "Wide bungalow",
      brief: {
        version: 1,
        subject: "house",
        title: "Wide bungalow",
        summary: "A low, wide gray house with a simple roofline.",
        confidence: "high",
        aspectRatio: 3,
        height: "low",
        roof: "flat",
        wallColor: "stone",
        roofColor: "white",
        doorColor: "white",
        frontWindows: 2,
        rearWindows: false,
        chimney: false,
        garden: true,
        observations: [],
        uncertainties: [],
      },
    },
  ];

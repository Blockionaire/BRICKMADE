import data from "../../../public/catalog/builder-runtime.json" with { type: "json" };
import type { BuilderPart } from "./types";

// The operational subset is separate from the 64,895-entry source catalog.
export const BUILDER_PARTS = data.parts as unknown as BuilderPart[];
export const PART_PROFILES = new Map(BUILDER_PARTS.map((p) => [p.id, p]));
export const BUILDER_BY_REBRICKABLE = new Map(
  BUILDER_PARTS.map((p) => [p.rebrickableId, p]),
);
export const PART_UNITS = data.units;
export const PROFILE_VERSION = data.profileVersion;

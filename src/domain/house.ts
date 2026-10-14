import { createModel } from "./models";
import type { GenerationSettings } from "./types";
export { countParts } from "./inventory";
export { createLegacyInstructionModel } from "./legacy-house";
/** Primary house showcase, now using the reviewed assembly revision. */
export function createHouse(settings: GenerationSettings) {
  return createModel({ ...settings, modelKind: "house" });
}

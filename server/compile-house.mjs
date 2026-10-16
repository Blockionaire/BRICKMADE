import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createModel } from "../src/domain/models.ts";
import {
  PART_PROFILES,
  PROFILE_VERSION,
} from "../src/domain/parts/profiles.ts";
import { decodeCollisionShape } from "../src/domain/validation/collision.ts";
import { validateAssembly } from "../src/domain/validation/assembly.ts";
import { placementPose } from "../src/domain/model-pose.ts";
import { parseHouseDesign } from "../shared/studio.ts";
const cache = new Map();
export async function compileHouse(
  description,
  options,
  onCompiled = async () => {},
) {
  const s = parseHouseDesign(description);
  const model = createModel({
    houseDesign: s,
    designSource: "openai",
    detail: options.detail,
    size: options.size,
    buildDifficulty: options.pace,
    modelKind: "house",
  });
  if (model.placements.length > 5000)
    throw Error("This design exceeds the current piece budget.");
  await onCompiled({ pieceCount: model.placements.length });
  const validation = await checkCompiledModel(model);
  const requested = [
    s.frontWindows,
    s.rearWindows,
    s.leftWindows,
    s.rightWindows,
  ].reduce((a, b) => a + b, 0);
  const retained = model.studio.windowCounts.reduce((a, b) => a + b, 0);
  return {
    model,
    validation,
    profileVersion: PROFILE_VERSION,
    fidelity: {
      aspectRatioError:
        Math.abs(
          model.studio.footprintStuds[0] / model.studio.footprintStuds[1] -
            s.aspectRatio,
        ) / s.aspectRatio,
      windowRetention: requested ? Math.min(1, retained / requested) : 1,
      method: "feature-consistency",
      notes: [
        "This score checks described features and proportions, not pixel-level similarity to the photos.",
        ...model.studio.adaptations,
      ],
    },
  };
}
/** Shared collision evidence and assembly checks for every generation category. */
export async function checkCompiledModel(model) {
  const entries = await Promise.all(
    [...new Set(model.placements.map((p) => placementPose(p).partId))].map(
      async (id) => {
        const profile = PART_PROFILES.get(id),
          metadata = profile?.collision;
        if (!metadata) throw Error("Missing reviewed collision evidence.");
        let shape = cache.get(metadata.sha256);
        if (!shape) {
          const relative = metadata.file.replace(/^\//, "");
          if (!/^catalog\/collision\/[a-zA-Z0-9_.-]+\.bvox$/.test(relative))
            throw Error("Invalid collision artifact path.");
          const bytes = await readFile(
            new URL("../public/" + relative, import.meta.url),
          );
          if (
            bytes.length !== metadata.bytes ||
            createHash("sha256").update(bytes).digest("hex") !== metadata.sha256
          )
            throw Error("Collision evidence checksum mismatch.");
          shape = decodeCollisionShape(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
          );
          cache.set(metadata.sha256, shape);
        }
        return [id, shape];
      },
    ),
  );
  return validateAssembly(model, new Map(entries));
}

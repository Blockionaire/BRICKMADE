import { createModel } from "../src/domain/models.ts";
import { parseSculptDesign } from "../shared/sculpt-design.ts";
import { PROFILE_VERSION } from "../src/domain/parts/profiles.ts";
import { checkCompiledModel } from "./compile-house.mjs";
/** Compile a version 3 description: carve its reference views into checked bricks. */
export async function compileSculpt(
  description,
  options,
  onCompiled = async () => {},
) {
  const s = parseSculptDesign(description, options.category);
  const model = createModel({
    sculptDesign: s,
    designSource: "openai",
    detail: options.detail,
    size: options.size,
    buildDifficulty: options.pace,
  });
  await onCompiled({ pieceCount: model.placements.length });
  const validation = await checkCompiledModel(model);
  const features = model.subject.features.filter((f) => f.requested > 0);
  const featureRetention = features.length
    ? features.reduce((n, f) => n + Math.min(1, f.retained / f.requested), 0) /
      features.length
    : 1;
  const silhouette = model.subject.silhouette;
  return {
    model,
    validation,
    profileVersion: PROFILE_VERSION,
    fidelity: {
      aspectRatioError: null,
      featureRetention,
      silhouette,
      method: "silhouette-agreement",
      notes: [
        `The built model covers ${Math.round(silhouette.front * 100)}% (front) and ${Math.round(silhouette.side * 100)}% (side) of the reference silhouettes, measured as overlap of the stud grid with each view. The reference views are AI-drawn from your photos, so this measures agreement with them, not certified photographic accuracy.`,
        ...model.subject.adaptations,
      ],
    },
  };
}

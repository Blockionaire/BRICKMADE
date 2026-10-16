import { createModel } from "../src/domain/models.ts";
import { parseSubjectDesign } from "../shared/subject-design.ts";
import { PROFILE_VERSION } from "../src/domain/parts/profiles.ts";
import { checkCompiledModel } from "./compile-house.mjs";
export async function compileSubject(
  description,
  options,
  onCompiled = async () => {},
) {
  const s = parseSubjectDesign(description, options.category);
  const model = createModel({
    subjectDesign: s,
    designSource: "openai",
    detail: options.detail,
    size: options.size,
    buildDifficulty: options.pace,
  });
  await onCompiled({ pieceCount: model.placements.length });
  const validation = await checkCompiledModel(model);
  const features = model.subject.features.filter((f) => f.requested > 0);
  const weight = (f) =>
    ["leaves", "roof rack", "stripe"].includes(f.name) ? 1 : 3;
  const featureRetention =
    features.reduce(
      (n, f) => n + Math.min(1, f.retained / f.requested) * weight(f),
      0,
    ) / features.reduce((n, f) => n + weight(f), 0);
  return {
    model,
    validation,
    profileVersion: PROFILE_VERSION,
    fidelity: {
      aspectRatioError: null,
      featureRetention,
      method: "feature-consistency",
      notes: [
        "Feature retention checks described construction features, not visual resemblance to the photos. No image-similarity score was calculated.",
        ...model.subject.adaptations,
      ],
    },
  };
}

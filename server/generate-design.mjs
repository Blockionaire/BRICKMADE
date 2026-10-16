import { StudioError } from "./supabase.mjs";
import {
  repairDescription,
  evaluateFidelity,
  passesFidelity,
} from "./design-quality.mjs";
/** The production compile, repair and feature-loss gates, shared with the private benchmark. */
export async function generateCheckedDesign(
  description,
  options,
  { compile, signal, onStage = async () => {} },
) {
  let result,
    repairCount = 0;
  const maxRepair = options.category === "free" ? 0 : 2;
  for (let repair = 0; repair <= maxRepair; repair++) {
    const actual = repairDescription(description, repair);
    await onStage("compiling", 50 + repair * 16, { repair });
    let checking = false;
    result = await compile(actual, options, signal, async () => {
      checking = true;
      await onStage("checking", 65 + repair * 10);
    });
    if (!checking) await onStage("checking", 65 + repair * 10);
    if (result.validation.status === "passed") {
      repairCount = repair;
      if (repair)
        (result.model.studio || result.model.subject).adaptations.push(
          options.category !== "house"
            ? "Some decorative features were simplified after an assembly failure; the original interpretation is preserved for comparison."
            : repair === 1
              ? "Garden/chimney details were omitted after an assembly failure."
              : "Some window and decorative details were omitted after assembly failures.",
        );
      break;
    }
    if (repair === maxRepair)
      throw new StudioError(
        422,
        "assembly-failed",
        "This design could not be assembled with the current supported patterns. No substitute demo was saved. Try a smaller or simpler version.",
      );
  }
  result.fidelity = evaluateFidelity(description, result);
  if (!passesFidelity(description, options, result.fidelity))
    throw new StudioError(
      422,
      "fidelity-limit",
      "A technically checked design would lose too many visible features at this scale. Try a larger or more detailed version.",
    );

  return { ...result, repairCount };
}

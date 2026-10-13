import { CATALOG, COLORS } from "@/domain/catalog";
import { createHouse } from "@/domain/house";
import type {
  BuildAssistantProvider,
  GenerationProvider,
} from "@/domain/types";

export const GENERATION_STAGES = [
  "Looking at your photos",
  "Finding the familiar shapes",
  "Creating your brick model",
  "Adding the little details",
  "Preparing your building steps",
];

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Cancelled", "AbortError"));
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

// TODO: replace with a production image-to-3D provider that accepts private photo references.
export const demoGeneration: GenerationProvider = {
  async generate(settings, onStage, signal) {
    for (let i = 0; i < GENERATION_STAGES.length; i++) {
      onStage(i);
      await delay(850, signal);
    }
    return createHouse(settings);
  },
};

// Deliberately narrow, deterministic answers. Catalog and instruction data are the source of truth.
export const demoAssistant: BuildAssistantProvider = {
  answer(question, { step, nextStep, bag }) {
    const q = question.toLowerCase();
    if (/angle|view|rotate/.test(q))
      return {
        text: "Let’s look from above. The highlighted pieces belong to this step; the softer colors show what is already in place.",
        action: "top-view",
      };
    if (/bag|sort/.test(q))
      return {
        text: `Use Bag ${bag.number} — ${bag.name}. It covers steps ${bag.firstStep}–${bag.lastStep}. This step uses ${step.parts.reduce((n, p) => n + p.quantity, 0)} pieces from that group.`,
      };
    if (/next/.test(q))
      return {
        text: nextStep
          ? `Next is step ${nextStep.number}: ${nextStep.title}. ${nextStep.description}`
          : "This is the final step. Your house is complete! You can finish the build and explore the full model.",
      };
    if (/fit|stuck|wrong/.test(q))
      return {
        text: `${step.hint} Compare your work with the highlighted pieces before moving on. These are demo instructions; physical fit and stability have not been validated.`,
        action: "highlight",
      };
    if (/piece|part|need/.test(q)) {
      const requestedColor = Object.entries(COLORS).find(([, color]) =>
        q.includes(color.name.toLowerCase()),
      );
      const requestedId = Object.keys(CATALOG).find((id) => q.includes(id));
      const matching = step.parts.filter(
        (p) =>
          (!requestedColor || p.color === requestedColor[0]) &&
          (!requestedId || p.partId === requestedId),
      );
      if (!matching.length)
        return {
          text: "That part is not listed for the current step. Check the current-step parts below, or move to the step you are working on.",
        };
      return {
        text: `For this step, use ${matching.map((p) => `${p.quantity} × ${COLORS[p.color].name.toLowerCase()} ${CATALOG[p.partId].name.toLowerCase()} (#${p.partId})`).join(", ")}. You’ll find them in Bag ${bag.number}.`,
        action: "highlight",
      };
    }
    if (/where|step|help|place/.test(q))
      return { text: `${step.description} ${step.hint}`, action: "highlight" };
    return {
      text: "I can help with the parts, placement, sorting bag, or next step in this demo. Try “Which parts do I need?” or “Where do these go?”",
    };
  },
};

import { BUILDER_PARTS, PART_PROFILES } from "./profiles";
import type { BuilderPart } from "./types";
export type BuilderRole = "any" | "mounted" | "receiving" | "stackable";
export function partCapabilities(part: BuilderPart) {
  const mounted = part.connectors.some((c) =>
      ["anti-stud", "pin", "window-insert"].includes(c.kind),
    ),
    receiving = part.connectors.some((c) =>
      ["stud", "pin-hole", "window-seat"].includes(c.kind),
    );
  return {
    mounted,
    receiving,
    stackable: mounted && receiving,
    supported:
      part.connectors.length > 0 &&
      part.admission?.status !== "candidate" &&
      part.admission?.status !== "geometry-only",
  };
}
/** Select only known capabilities and recorded colors. No identity, stock or fit is guessed. */
export function findBuilderParts({
  category,
  colorId,
  role = "any",
  maximumSize,
}: {
  category?: string;
  colorId?: number;
  role?: BuilderRole;
  maximumSize?: [number, number, number];
} = {}) {
  return BUILDER_PARTS.filter((p) => {
    const c = partCapabilities(p);
    return (
      c.supported &&
      (!category || p.category === category) &&
      (colorId === undefined || p.observedColorIds.includes(colorId)) &&
      (role === "any" || c[role]) &&
      (!maximumSize ||
        maximumSize.every(
          (n, i) => p.mesh.bounds[i + 3] - p.mesh.bounds[i] <= n + 1e-6,
        ))
    );
  });
}
const attachmentSignature = (part: BuilderPart) =>
  JSON.stringify(
    part.connectors
      .map((c) => [c.kind, c.position, c.normal, c.radius, c.depth])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
/** Conservative nominal alternatives. A caller MUST rerun whole-assembly checks after a replacement. */
export function nominalGridAlternatives(
  id: string,
  colorId: number,
): BuilderPart[] {
  const source = PART_PROFILES.get(id);
  if (
    !source?.bodySize ||
    source.coverage !== "stud-system" ||
    source.unknownMechanisms.length
  )
    return [];
  const signature = attachmentSignature(source);
  return findBuilderParts({ colorId }).filter(
    (p) =>
      p.id !== id &&
      p.coverage === "stud-system" &&
      !p.unknownMechanisms.length &&
      JSON.stringify(p.bodySize) === JSON.stringify(source.bodySize) &&
      attachmentSignature(p) === signature,
  );
}

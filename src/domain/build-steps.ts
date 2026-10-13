import { CATALOG, COLORS } from "./catalog";
import { countParts } from "./inventory";
import type {
  BuildPhase,
  BuildStep,
  CameraView,
  GenerationSettings,
  Placement,
} from "./types";

export const STEP_LIMITS = { easy: 6, normal: 8, hard: 10 } as const;

/** Keep each group on a single elevation and, for walls, on a single face. */
export function planBuildSteps(
  source: Placement[],
  phases: BuildPhase[],
  settings: GenerationSettings,
) {
  const placements: Placement[] = [];
  const steps: BuildStep[] = [];
  for (const phase of phases) {
    const buckets = new Map<
      string,
      { area: string; view: CameraView; pieces: Placement[] }
    >();
    const ordered = source
      .filter((p) => p.step === phase.number)
      .sort((a, b) => {
        const bottom = (p: Placement) =>
          p.position[1] - CATALOG[p.partId].height / 2;
        return (
          Math.round((bottom(a) - bottom(b)) * 100) ||
          a.position[2] - b.position[2] ||
          a.position[0] - b.position[0]
        );
      });
    for (const p of ordered) {
      const bottom = (p.position[1] - CATALOG[p.partId].height / 2).toFixed(2);
      const view: CameraView =
        phase.bag === 1 || phase.bag === 3
          ? "perspective"
          : phase.bag === 2
            ? p.rotated
              ? p.position[0] < 0
                ? "left"
                : "side"
              : p.position[2] < 0
                ? "back"
                : "front"
            : phase.title.includes("fence") || phase.title.includes("chimney")
              ? "back"
              : phase.title.includes("garden")
                ? p.position[0] < 0
                  ? "left"
                  : "side"
                : "perspective";
      const area =
        phase.bag === 1
          ? phase.number === 1
            ? "Base"
            : "Floor & path"
          : phase.bag === 3
            ? "Roof"
            : phase.bag === 2
              ? `${{ front: "Front", back: "Back", side: "Right", left: "Left", top: "Top", perspective: "House" }[view]} wall`
              : phase.title.includes("chimney")
                ? "Chimney"
                : phase.title.includes("porch")
                  ? "Porch"
                  : phase.title.includes("fence")
                    ? "Fence"
                    : phase.title.includes("Shutters")
                      ? "Shutters & skylight"
                      : view === "left"
                        ? "Left garden"
                        : "Right garden";
      const key = `${bottom}:${view}`;
      if (!buckets.has(key)) buckets.set(key, { area, view, pieces: [] });
      buckets.get(key)!.pieces.push(p);
    }
    const clusters = [...buckets.values()].flatMap((bucket) => {
      const chunks = [];
      for (
        let i = 0;
        i < bucket.pieces.length;
        i += STEP_LIMITS[settings.detail]
      )
        chunks.push({
          ...bucket,
          pieces: bucket.pieces.slice(i, i + STEP_LIMITS[settings.detail]),
        });
      return chunks;
    });
    clusters.forEach((cluster, index) => {
      const number = steps.length + 1;
      const pieces = cluster.pieces.map((p) => ({ ...p, step: number }));
      placements.push(...pieces);
      const parts = countParts(pieces);
      const focus = pieces.reduce<[number, number, number]>(
        (sum, p) =>
          sum.map((v, axis) => v + p.position[axis] / pieces.length) as [
            number,
            number,
            number,
          ],
        [0, 0, 0],
      );
      const list = parts
        .map(
          (p) =>
            `${p.quantity} × ${COLORS[p.color].name.toLowerCase()} ${CATALOG[p.partId].name.toLowerCase()}`,
        )
        .join(", ");
      steps.push({
        number,
        title: phase.title,
        bag: phase.bag,
        parts,
        placementIds: pieces.map((p) => p.id),
        phaseNumber: phase.number,
        cluster: index + 1,
        clusters: clusters.length,
        area: cluster.area,
        suggestedView: cluster.view,
        focus,
        description: `Place ${list} in the highlighted ${cluster.area.toLowerCase()} positions. This is group ${index + 1} of ${clusters.length} for this section.`,
        hint: `${phase.hint} Watch the placement replay to see the destinations.`,
      });
    });
  }
  return { placements, steps };
}

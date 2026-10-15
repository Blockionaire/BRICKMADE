import type { HouseDesign, StudioOptions, StudioCategory } from "./studio";
export interface DesignScene {
  version: 1;
  category: StudioCategory;
  units: "stud";
  footprint: { kind: string; width: number; depth: number };
  assemblies: {
    id: string;
    role: string;
    dependsOn: string[];
    features: string[];
  }[];
  priorities: { feature: string; importance: "identity" | "detail" }[];
}
/** Semantic construction plan, separate from photo interpretation and actual brick placements. */
export function planHouseScene(
  s: HouseDesign,
  options: StudioOptions,
): DesignScene {
  const width =
    options.size === "large" ? 20 : options.size === "standard" ? 16 : 12;
  const depth = Math.max(
    6,
    Math.min(16, Math.round(width / s.aspectRatio / 2) * 2),
  );
  const assemblies: DesignScene["assemblies"] = [
    {
      id: "foundation",
      role: "bonded-foundation",
      dependsOn: [],
      features: [s.footprint],
    },
  ];
  for (let floor = 0; floor < s.storeys; floor++)
    assemblies.push({
      id: `storey-${floor + 1}`,
      role: "supported-masonry-shell",
      dependsOn: [floor ? `storey-${floor}` : "foundation"],
      features: [
        "internal-supports",
        "fitted-windows",
        s.doorPosition + "-entrance",
      ],
    });
  assemblies.push({
    id: "roof",
    role: "supported-contour-surface",
    dependsOn: [`storey-${s.storeys}`],
    features: [s.roofShape, s.roofPitch, s.ridgeAxis + "-ridge"],
  });
  return {
    version: 1,
    category: "house",
    units: "stud",
    footprint: { kind: s.footprint, width, depth },
    assemblies,
    priorities: [
      { feature: "silhouette-and-proportions", importance: "identity" },
      { feature: "storeys-and-roof", importance: "identity" },
      { feature: "entrance-and-window-rhythm", importance: "identity" },
      { feature: "chimney-and-garden", importance: "detail" },
    ],
  };
}

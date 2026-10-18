import type { HouseDesign, StudioOptions, StudioCategory } from "./studio";
import type { DesignDescription } from "./design-description";
import type { SculptDesign } from "./sculpt-design";
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
export function planDesignScene(
  s: DesignDescription,
  options: StudioOptions,
): DesignScene {
  if (!("category" in s)) return planHouseScene(s, options);
  if (s.version === 3) return planSculptScene(s, options);
  const width =
    options.size === "large" ? 24 : options.size === "standard" ? 20 : 16;
  const roles = {
    flower: ["bonded-base", "planters-and-stems", "foliage-and-blooms"],
    car: [
      "bonded-plinth",
      "display-chassis-and-fixed-wheels",
      "body-and-cabin",
      "lights-and-trim",
    ],
    animal: [
      "bonded-plinth",
      "grounded-paws-and-bonded-deck",
      "body-head-and-ears",
      "reviewed-sideways-eyes",
    ],
    free: [
      "bonded-plinth",
      "grounded-component-supports",
      "compiled-stud-volumes",
    ],
  }[s.category];
  return {
    version: 1,
    category: s.category,
    units: "stud",
    footprint: { kind: "display-base", width, depth: width },
    assemblies: roles.map((role, index) => ({
      id: `assembly-${index + 1}`,
      role,
      dependsOn: index ? [`assembly-${index}`] : [],
      features: [s.category, "reviewed-attachments", "recorded-part-colors"],
    })),
    priorities: [
      { feature: "observed-proportions-and-color", importance: "identity" },
      { feature: "recognisable-silhouette", importance: "identity" },
      { feature: "supported-source-parts", importance: "identity" },
      { feature: "small-surface-details", importance: "detail" },
    ],
  };
}

/** Version 3: reference views → carved volume → bonded courses with fitted details. */
export function planSculptScene(
  s: SculptDesign,
  options: StudioOptions,
): DesignScene {
  const views = s.reference?.views.views.map((v) => v.view) ?? [];
  const details = {
    house: "fitted-window-frames-and-doors",
    car: "glazing-wheels-and-lights",
    animal: "eyes-nose-and-markings",
    flower: "stems-leaf-elements-and-blooms",
    free: "located-surface-details",
  }[s.category];
  const width =
    options.size === "large" ? 24 : options.size === "standard" ? 20 : 16;
  return {
    version: 1,
    category: s.category,
    units: "stud",
    footprint: { kind: "display-base", width, depth: width },
    assemblies: [
      {
        id: "foundation",
        role: "bonded-base",
        dependsOn: [],
        features: ["recorded-part-colors"],
      },
      {
        id: "volume",
        role: "visual-hull-from-reference-views",
        dependsOn: ["foundation"],
        features: views.map((v) => `${v}-view`),
      },
      {
        id: "courses",
        role: "anchored-bonded-courses",
        dependsOn: ["volume"],
        features: ["slopes", "supports"],
      },
      {
        id: "details",
        role: details,
        dependsOn: ["courses"],
        features: ["located-features"],
      },
    ],
    priorities: [
      { feature: "reference-silhouette", importance: "identity" },
      { feature: "calibrated-region-colours", importance: "identity" },
      { feature: "located-features", importance: "identity" },
      { feature: "surface-finish", importance: "detail" },
    ],
  };
}

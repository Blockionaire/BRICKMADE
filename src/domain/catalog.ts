import type {
  CatalogPart,
  ColorId,
  DetailLevel,
  BuildSize,
  BuildDifficulty,
} from "./types";

import colorData from "../../data/catalog/model-colors.json" with { type: "json" };
import { BUILDER_PARTS } from "./parts/profiles";
const names: Record<ColorId, string> = {
  sand: "Warm sand",
  roof: "Terracotta",
  glass: "Clear glass",
  wood: "Dark brown",
  grass: "Green",
  stone: "Light gray",
  leaf: "Leaf green",
  flower: "Soft gold",
  black: "Black",
  white: "White",
  red: "Red",
  blue: "Blue",
  orange: "Orange",
  pink: "Pink",
  purple: "Purple",
  lavender: "Lavender",
  "dark-blue": "Dark blue",
  "dark-stone": "Dark gray",
  "magenta": "Magenta",
  "lime": "Lime",
  "dark-tan": "Dark tan",
  "medium-blue": "Medium blue",
  "medium-nougat": "Medium nougat",
  "bright-light-orange": "Bright light orange",
  "dark-azure": "Dark azure",
  "medium-azure": "Medium azure",
  "sand-green": "Sand green",
  "dark-orange": "Dark orange",
  "dark-pink": "Dark pink",
  "bright-green": "Bright green",
  "bright-light-blue": "Bright light blue",
  "dark-green": "Dark green",
  "sand-blue": "Sand blue",
  "dark-brown": "Deep dark brown",
  "light-nougat": "Light nougat",
  "bright-light-yellow": "Bright light yellow",
  "nougat": "Nougat",
  "medium-lavender": "Medium lavender",
  "dark-turquoise": "Dark turquoise",
  "yellowish-green": "Yellowish green",
  "light-aqua": "Light aqua",
};
export const COLORS = Object.fromEntries(
  Object.entries(colorData.colors).map(([id, value]) => [
    id,
    { ...value, name: names[id as ColorId] },
  ]),
) as Record<
  ColorId,
  {
    name: string;
    hex: string;
    sourceName: string;
    rebrickableId: number;
    alpha: number;
  }
>;

// Curated Rebrickable shape identities; geometry/vendor mappings are separate.
// One scene unit = one 8 mm stud pitch. Geometry uses uniform LDraw scaling.
// Models require recorded Rebrickable color pairs; current stock remains unchecked.
export const CATALOG: Record<string, CatalogPart> = {
  "3005": {
    id: "3005",
    name: "Brick 1 × 1",
    category: "Brick",
    width: 1,
    depth: 1,
    height: 1.2,
    studs: true,
  },
  "3004": {
    id: "3004",
    name: "Brick 1 × 2",
    category: "Brick",
    width: 2,
    depth: 1,
    height: 1.2,
    studs: true,
  },
  "3010": {
    id: "3010",
    name: "Brick 1 × 4",
    category: "Brick",
    width: 4,
    depth: 1,
    height: 1.2,
    studs: true,
  },
  "3009": {
    id: "3009",
    name: "Brick 1 × 6",
    category: "Brick",
    width: 6,
    depth: 1,
    height: 1.2,
    studs: true,
  },
  "3022": {
    id: "3022",
    name: "Plate 2 × 2",
    category: "Plate",
    width: 2,
    depth: 2,
    height: 0.4,
    studs: true,
  },
  "3003": {
    id: "3003",
    name: "Brick 2 × 2",
    category: "Brick",
    width: 2,
    depth: 2,
    height: 1.2,
    studs: true,
  },
  "3024": {
    id: "3024",
    name: "Plate 1 × 1",
    category: "Plate",
    width: 1,
    depth: 1,
    height: 0.4,
    studs: true,
  },
  "3023": {
    id: "3023",
    name: "Plate 1 × 2",
    category: "Plate",
    width: 2,
    depth: 1,
    height: 0.4,
    studs: true,
  },
  "3710": {
    id: "3710",
    name: "Plate 1 × 4",
    category: "Plate",
    width: 4,
    depth: 1,
    height: 0.4,
    studs: true,
  },
  "3020": {
    id: "3020",
    name: "Plate 2 × 4",
    category: "Plate",
    width: 4,
    depth: 2,
    height: 0.4,
    studs: true,
  },
  "3068b": {
    id: "3068b",
    name: "Tile 2 × 2",
    category: "Tile",
    width: 2,
    depth: 2,
    height: 0.4,
    studs: false,
  },
  "3070b": {
    id: "3070b",
    name: "Tile 1 × 1",
    category: "Tile",
    width: 1,
    depth: 1,
    height: 0.4,
    studs: false,
  },
};

// Source geometry defines non-rectangular shapes. These dimensions are UI and
// layer datums, not solid-body collision proxies. Admission is validated separately.
for (const profile of BUILDER_PARTS) {
  if (CATALOG[profile.rebrickableId]) {
    CATALOG[profile.rebrickableId].geometryId = profile.id;
    continue;
  }
  const size = profile.bodySize ?? [
    profile.mesh.bounds[3] - profile.mesh.bounds[0],
    profile.centerLdu[1]
      ? Math.max(0.1, Math.abs(profile.centerLdu[1]) / 10)
      : profile.mesh.bounds[4] - profile.mesh.bounds[1],
    profile.mesh.bounds[5] - profile.mesh.bounds[2],
  ];
  const category = profile.category.startsWith("Technic")
    ? "Technic"
    : profile.tags.includes("Plants & flowers")
      ? "Plant"
      : [
            "Brick",
            "Plate",
            "Tile",
            "Slope",
            "Arch",
            "Window",
            "Panel",
            "Wedge",
          ].includes(profile.category)
        ? profile.category
        : profile.id === "60601"
          ? "Window"
          : "Other";
  CATALOG[profile.rebrickableId] = {
    id: profile.rebrickableId,
    name: profile.rebrickableName.replaceAll(" x ", " × "),
    category: category as CatalogPart["category"],
    width: size[0],
    height: size[1],
    depth: size[2],
    studs: profile.connectors.some((c) => c.kind === "stud"),
    geometryId: profile.id,
  };
}

export const DETAIL_LEVELS: {
  id: DetailLevel;
  name: string;
  description: string;
}[] = [
  {
    id: "easy",
    name: "Easy",
    description: "Big bricks, low walls, a simple roof and a tiny garden.",
  },
  {
    id: "normal",
    name: "Normal",
    description: "Window details, a stepped roof, a chimney and shrubs.",
  },
  {
    id: "hard",
    name: "Hard",
    description:
      "Fine brickwork, shutters, a porch, skylight and fenced garden.",
  },
];
export const BUILD_SIZES: { id: BuildSize; name: string }[] = [
  { id: "compact", name: "Compact" },
  { id: "standard", name: "Standard" },
  { id: "large", name: "Large" },
];
export const DEFAULT_SETTINGS = {
  detail: "normal",
  size: "compact",
  buildDifficulty: "medium",
} as const;

export const BUILD_DIFFICULTIES: {
  id: BuildDifficulty;
  name: string;
  description: string;
}[] = [
  { id: "easy", name: "Easy", description: "Tiny steps · up to 6 pieces" },
  {
    id: "medium",
    name: "Medium",
    description: "Bigger groups · up to 16 pieces",
  },
  { id: "hard", name: "Hard", description: "Whole layers · more per step" },
];

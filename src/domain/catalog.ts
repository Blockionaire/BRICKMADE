import type {
  CatalogPart,
  ColorId,
  DetailLevel,
  BuildSize,
  BuildDifficulty,
} from "./types";

export const COLORS: Record<ColorId, { name: string; hex: string }> = {
  sand: { name: "Warm sand", hex: "#dfcaa3" },
  roof: { name: "Terracotta", hex: "#ad4935" },
  glass: { name: "Smoke blue", hex: "#719ba3" },
  wood: { name: "Dark brown", hex: "#6b4834" },
  grass: { name: "Sage green", hex: "#a6ad83" },
  stone: { name: "Light gray", hex: "#c8c4ba" },
  leaf: { name: "Olive green", hex: "#627b51" },
  flower: { name: "Soft gold", hex: "#e4b757" },
};

// Curated Rebrickable shape identities; geometry/vendor mappings are separate.
// One scene unit = one 8 mm stud pitch. Geometry uses uniform LDraw scaling.
// Colors remain illustrative, not stock guarantees.
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

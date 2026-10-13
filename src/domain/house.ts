import { CATALOG } from "./catalog";
import type {
  BuildStep,
  ColorId,
  GenerationSettings,
  HouseModel,
  PartQuantity,
  Placement,
} from "./types";

export function countParts(placements: Placement[]): PartQuantity[] {
  const counts = new Map<string, PartQuantity>();
  for (const p of placements) {
    const key = `${p.partId}:${p.color}`;
    const current = counts.get(key);
    if (current) current.quantity += 1;
    else
      counts.set(key, { key, partId: p.partId, color: p.color, quantity: 1 });
  }
  return [...counts.values()].sort((a, b) => b.quantity - a.quantity);
}

const cache = new Map<string, HouseModel>();

/** A deterministic demonstration model, not a structural solver or validated build. */
export function createHouse(settings: GenerationSettings): HouseModel {
  const key = `${settings.detail}:${settings.size}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const width =
    settings.size === "large" ? 14 : settings.size === "standard" ? 12 : 10;
  const depth = width - 2;
  const halfW = width / 2;
  const halfD = depth / 2;
  const baseWidth = Math.ceil((width + 8) / 4) * 4;
  const baseDepth = depth + 8;
  const maxBrick =
    settings.detail === "collector" ? 1 : settings.detail === "high" ? 2 : 4;
  const placements: Placement[] = [];
  const steps: BuildStep[] = [];

  function step(
    title: string,
    description: string,
    hint: string,
    bag: number,
    build: (n: number) => void,
  ) {
    const number = steps.length + 1;
    build(number);
    const added = placements.filter((p) => p.step === number);
    if (!added.length) return;
    steps.push({
      number,
      title,
      description,
      hint,
      bag,
      parts: countParts(added),
      placementIds: added.map((p) => p.id),
    });
  }
  function add(
    partId: string,
    color: ColorId,
    x: number,
    bottom: number,
    z: number,
    n: number,
    rotated = false,
  ) {
    placements.push({
      id: `piece-${placements.length + 1}`,
      partId,
      color,
      position: [x, bottom + CATALOG[partId].height / 2, z],
      rotated,
      step: n,
    });
  }
  function run(
    cells: { at: number; color: ColorId }[],
    fixed: number,
    y: number,
    n: number,
    rotate = false,
    plate = false,
  ) {
    for (let i = 0; i < cells.length;) {
      let same = 1;
      while (
        i + same < cells.length &&
        cells[i + same].at === cells[i].at + same &&
        cells[i + same].color === cells[i].color &&
        same < maxBrick
      )
        same++;
      const len = same >= 4 ? 4 : same >= 2 ? 2 : 1;
      const id = plate
        ? len === 4
          ? "3710"
          : len === 2
            ? "3023"
            : "3024"
        : len === 4
          ? "3010"
          : len === 2
            ? "3004"
            : "3005";
      add(
        id,
        cells[i].color,
        rotate ? fixed : cells[i].at + len / 2,
        y,
        rotate ? cells[i].at + len / 2 : fixed,
        n,
        rotate,
      );
      i += len;
    }
  }

  step(
    "A place to begin",
    "Lay the sage-green plates side by side to make the rectangular base. The long edge faces you.",
    "Keep all plates flat and align the studs into straight rows. This is the footprint for the whole house.",
    1,
    (n) => {
      for (let x = -baseWidth / 2; x < baseWidth / 2; x += 4)
        for (let z = -baseDepth / 2; z < baseDepth / 2; z += 2)
          add("3020", "grass", x + 2, 0, z + 1, n);
    },
  );
  step(
    "The path home",
    "Make a two-stud-wide stone path in front of the house. Add the gray floor plates inside its footprint.",
    "The path meets the middle of the front wall. Leave the garden on either side clear.",
    1,
    (n) => {
      for (let x = -halfW; x < halfW; x += 2)
        for (let z = -halfD; z < halfD; z += 2)
          add("3068b", "stone", x + 1, 0.32, z + 1, n);
      for (let z = halfD; z < baseDepth / 2; z += 2)
        add("3068b", "stone", 0, 0.32, z + 1, n);
    },
  );

  for (let row = 0; row < 6; row++) {
    step(
      row === 0
        ? "The first walls"
        : row < 4
          ? `Walls & windows · layer ${row + 1}`
          : `Bring the walls together · layer ${row + 1}`,
      row === 0
        ? "Outline the house with warm-sand bricks. The brown bricks mark the front door."
        : row < 4
          ? "Add the next wall layer. Smoke-blue bricks mark the windows; brown bricks continue the front door."
          : "Continue the warm-sand walls across the window and door openings to close the top of the house.",
      "Front is the side with the stone path. Match each color to its position in the highlighted model.",
      2,
      (n) => {
        for (const front of [true, false]) {
          const cells: { at: number; color: ColorId }[] = [];
          for (let x = -halfW; x < halfW; x++) {
            let color: ColorId = "sand";
            const window =
              (x >= -halfW + 1 && x < -halfW + 3) ||
              (x >= halfW - 3 && x < halfW - 1);
            if (row >= 1 && row <= 3 && window) color = "glass";
            if (front && row < 4 && x >= -1 && x < 1) color = "wood";
            cells.push({ at: x, color });
          }
          run(cells, front ? halfD - 0.5 : -halfD + 0.5, 0.64 + row * 0.96, n);
        }
        for (const side of [-1, 1]) {
          const cells: { at: number; color: ColorId }[] = [];
          for (let z = -halfD + 1; z < halfD - 1; z++)
            cells.push({
              at: z,
              color:
                row >= 1 && row <= 3 && z >= -1 && z < 1 ? "glass" : "sand",
            });
          run(cells, side * (halfW - 0.5), 0.64 + row * 0.96, n, true);
        }
      },
    );
  }

  const roofBase = 0.64 + 6 * 0.96;
  const roofLayers = halfD + 1;
  for (let layer = 0; layer < roofLayers; layer++) {
    step(
      layer === 0
        ? "A terracotta roof"
        : layer === roofLayers - 1
          ? "Finish the roof ridge"
          : `Shape the roof · tier ${layer + 1}`,
      layer === 0
        ? "Cover the top of the walls with terracotta plates. Let the first tier overhang the house by one stud."
        : "Build two plate layers, one stud narrower at both the front and back, to form the stepped pitched roof.",
      "Center every tier on the previous one. The roof ridge runs from left to right when the front door faces you.",
      3,
      (n) => {
        for (let sub = 0; sub < 2; sub++)
          for (let z = -halfD - 1 + layer; z < halfD + 1 - layer; z++) {
            const cells: { at: number; color: ColorId }[] = [];
            for (let x = -halfW - 1; x < halfW + 1; x++) {
              const chimneyOpening =
                layer > halfD - 2 &&
                x >= -halfW + 1 &&
                x < -halfW + 3 &&
                z >= -3 &&
                z < -1;
              if (!chimneyOpening) cells.push({ at: x, color: "roof" });
            }
            run(
              cells,
              z + 0.5,
              roofBase + layer * 0.64 + sub * 0.32,
              n,
              false,
              true,
            );
          }
      },
    );
  }

  step(
    "The little chimney",
    "Stack the brown bricks on the rear half of the roof to make a two-by-two chimney.",
    "The chimney sits slightly left of center. Follow the model for its exact position.",
    4,
    (n) => {
      // Begin above the supporting roof tier, without overlapping its interior.
      const z = -2;
      const supportingTier = halfD - 2;
      const bottom = roofBase + (supportingTier + 1) * 0.64;
      for (let i = 0; i < 4; i++)
        add("3003", "wood", -halfW + 2, bottom + i * 0.96, z, n);
    },
  );
  step(
    "A garden of your own",
    "Add olive-green shrubs beside the house. Finish with little gold flowers and gray stepping stones.",
    "Keep the path to the front door clear. The garden details stay outside the walls.",
    4,
    (n) => {
      const lush =
        settings.detail === "high" || settings.detail === "collector";
      const shrubCount = settings.detail === "easy" ? 1 : lush ? 4 : 2;
      for (const side of [-1, 1])
        for (let i = 0; i < shrubCount; i++) {
          const x = side * (halfW + 2);
          const z = -halfD + 1 + i * 2;
          add("3003", "leaf", x, 0.32, z, n);
          if (lush) add("3003", "leaf", x, 1.28, z, n);
          add("3070b", "flower", x - 0.5, lush ? 2.24 : 1.28, z - 0.5, n);
        }
      if (settings.detail !== "easy")
        for (const side of [-1, 1]) {
          add("3068b", "stone", side * 3, 0.32, halfD + 2, n);
          add("3024", "flower", side * (halfW - 0.5), 0.32, halfD + 2.5, n);
        }
    },
  );

  const parts = countParts(placements);
  const bags = [1, 2, 3, 4].map((number) => {
    const grouped = steps.filter((s) => s.bag === number);
    return {
      number,
      name: ["Base & path", "Walls & windows", "The roof", "Finishing touches"][
        number - 1
      ],
      firstStep: grouped[0].number,
      lastStep: grouped.at(-1)!.number,
      parts: countParts(
        placements.filter((p) => grouped.some((s) => s.number === p.step)),
      ),
    };
  });
  const maximumY = Math.max(
    ...placements.map((p) => p.position[1] + CATALOG[p.partId].height / 2),
  );
  const model: HouseModel = {
    settings: { ...settings },
    placements,
    steps,
    parts,
    bags,
    stats: {
      pieceCount: placements.length,
      uniquePartCount: parts.length,
      dimensions: [
        baseWidth * 0.8,
        baseDepth * 0.8,
        Math.round(maximumY * 0.8 * 10) / 10,
      ],
      buildMinutes: Math.round(placements.length * 0.35),
      difficulty:
        settings.detail === "easy"
          ? "Easy"
          : settings.detail === "collector"
            ? "Challenging"
            : "Moderate",
    },
  };
  cache.set(key, model);
  return model;
}

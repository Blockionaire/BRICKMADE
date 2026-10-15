import { Assembly } from "../models";
import {
  HOUSE_MODULE_VERSION,
  parseHouseDesign,
  type HouseDesign,
} from "../../../shared/studio";
import type { GenerationSettings, ColorId, HouseModel } from "../types";
import type { HouseBrief } from "../../../shared/house-brief";
import { planHouseScene } from "../../../shared/design-scene";
export const STUDIO_HOUSE_REVISION = "2026-10-15.house-v2.1";
const brick = (n: number) =>
  n >= 8
    ? "3008"
    : n >= 6
      ? "3009"
      : n >= 4
        ? "3010"
        : n >= 2
          ? "3004"
          : "3005";
const plate = (w: number, d: number) =>
  d === 2
    ? w === 4
      ? "3020"
      : w === 2
        ? "3022"
        : "3023"
    : w === 4
      ? "3710"
      : w === 2
        ? "3023"
        : "3024";
const lengths = [8, 6, 4, 2, 1];
export function legacyHouseDescription(s: HouseDesign): HouseBrief {
  return {
    version: 1,
    subject: s.subject,
    title: s.title,
    summary: s.summary,
    confidence: s.confidence,
    aspectRatio: s.aspectRatio,
    height: s.storeys === 1 ? "low" : s.storeys === 2 ? "standard" : "tall",
    roof: s.roofShape === "flat" ? "flat" : "stepped",
    wallColor: s.wallColor,
    roofColor: s.roofColor,
    doorColor: s.doorColor,
    frontWindows: Math.min(2, s.frontWindows) as 0 | 1 | 2,
    rearWindows: s.rearWindows > 0,
    chimney: s.chimney,
    garden: s.garden,
    observations: s.observations,
    uncertainties: s.uncertainties,
  };
}
/** A grid-backed shell with real openings, supporting posts, floors and nested roof surfaces. */
export function createStudioHouse(
  input: HouseDesign,
  settings: GenerationSettings,
): HouseModel {
  const s = parseHouseDesign(input);
  if (s.subject !== "house")
    throw Error("This subject is outside the current House category.");
  const easy = settings.detail === "easy",
    hard = settings.detail === "hard";
  const scene = planHouseScene(s, {
    version: 1,
    category: "house",
    detail: settings.detail,
    size: settings.size,
    pace: settings.buildDifficulty || "medium",
  });
  const { width, depth } = scene.footprint;
  const a = new Assembly({
    ...settings,
    modelKind: "house",
    houseDesign: s,
    houseBrief: legacyHouseDescription(s),
    designSource: settings.designSource || "openai",
  });
  const hw = width / 2,
    hd = depth / 2,
    notes = a.adaptations;
  const occupied = new Set<string>(),
    key = (x: number, z: number) => `${x},${z}`;
  const notchX = width - Math.max(4, Math.floor(width / 3 / 2) * 2),
    notchZ = Math.floor(depth / 2);
  for (let z = 0; z < depth; z++)
    for (let x = 0; x < width; x++)
      if (s.footprint !== "l-shaped" || x < notchX || z >= notchZ)
        occupied.add(key(x, z));
  const has = (x: number, z: number) => occupied.has(key(x, z));
  const wall = new Set(
    [...occupied].filter((k) => {
      const [x, z] = k.split(",").map(Number);
      return [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dz]) => !has(x + dx, z + dz));
    }),
  );
  const posts = new Set(
    [...occupied].filter((k) => {
      const [x, z] = k.split(",").map(Number);
      return !wall.has(k) && x % 2 === 0 && z % 2 === 0;
    }),
  );
  notes.add(
    `The building is ${width} × ${depth} studs, with ${s.storeys} storey${s.storeys === 1 ? "" : "s"}. Dimensions are estimated from photographs.`,
  );
  notes.add(
    "Horizontal plate courses approximate the roof surface; source meshes and connector checks do not certify physical strength.",
  );
  notes.add(
    "Internal posts support the floor and roof plates. Interior rooms and opening doors are not represented.",
  );
  if (s.footprint === "l-shaped")
    notes.add(
      "The L footprint uses a rear-right recess. Different wing orientations are represented by this bounded approximation.",
    );
  const base = Math.ceil((Math.max(width, depth) + 6) / 4) * 4;
  a.foundation(base);
  type Window = {
    face: number;
    cells: string[];
    x: number;
    z: number;
    turn: number;
  };
  const windows: Window[] = [];
  const doorStart =
    s.doorPosition === "left"
      ? 2
      : s.doorPosition === "right"
        ? width - 4
        : width / 2 - 1;
  const requested = [
      s.frontWindows,
      s.rearWindows,
      s.leftWindows,
      s.rightWindows,
    ],
    actual = [0, 0, 0, 0];
  function addWindows(face: number, count: number) {
    const length = face < 2 ? width : depth;
    const candidates: number[] = [];
    for (let n = 1; n < length - 2; n++) {
      const coords =
        face === 0
          ? [
              [n, depth - 1],
              [n + 1, depth - 1],
            ]
          : face === 1
            ? [
                [n, 0],
                [n + 1, 0],
              ]
            : face === 2
              ? [
                  [0, n],
                  [0, n + 1],
                ]
              : [
                  [width - 1, n],
                  [width - 1, n + 1],
                ];
      if (!coords.every(([x, z]) => wall.has(key(x, z)))) continue;
      if (
        face === 0 &&
        coords.some(([x]) => x >= doorStart - 1 && x <= doorStart + 2)
      )
        continue;
      candidates.push(n);
    }
    const chosen: number[] = [];
    // Spread openings across the actual available wall, with at least one solid stud between frames.
    for (let i = 0; i < count; i++) {
      const target = ((i + 1) * length) / (count + 1) - 1;
      const n = candidates
        .filter((n) => chosen.every((c) => Math.abs(c - n) >= 3))
        .sort((x, y) => Math.abs(x - target) - Math.abs(y - target))[0];
      if (n === undefined) break;
      chosen.push(n);
    }
    for (const n of chosen.sort((x, y) => x - y)) {
      const x = face === 2 ? 0.5 : face === 3 ? width - 0.5 : n + 1,
        z = face === 0 ? depth - 0.5 : face === 1 ? 0.5 : n + 1;
      const cells =
        face < 2
          ? [
              key(n, face === 0 ? depth - 1 : 0),
              key(n + 1, face === 0 ? depth - 1 : 0),
            ]
          : [
              key(face === 2 ? 0 : width - 1, n),
              key(face === 2 ? 0 : width - 1, n + 1),
            ];
      windows.push({
        face,
        cells,
        x: x - hw,
        z: z - hd,
        turn: [0, 2, 3, 1][face],
      });
      actual[face]++;
    }
  }
  requested.forEach((n, face) => addWindows(face, easy ? Math.min(1, n) : n));
  requested.forEach((n, face) => {
    if (actual[face] !== n)
      notes.add(
        `${["Front", "Rear", "Left", "Right"][face]} windows use ${actual[face]} representative opening${actual[face] === 1 ? "" : "s"} per storey instead of ${n}, to leave supported masonry at this scale/detail.`,
      );
  });
  const plateTiles = (
    cells: Set<string>,
    y: number,
    color: ColorId,
    max = 4,
  ) => {
    const remaining = new Set(cells);
    for (let z = 0; z < depth; z++)
      for (let x = 0; x < width; x++) {
        if (!remaining.has(key(x, z))) continue;
        const d = remaining.has(key(x, z + 1)) ? 2 : 1;
        let w = 1;
        for (const candidate of [4, 2, 1])
          if (
            candidate <= max &&
            Array.from({ length: candidate }, (_, dx) =>
              Array.from({ length: d }, (_, dz) =>
                remaining.has(key(x + dx, z + dz)),
              ).every(Boolean),
            ).every(Boolean)
          ) {
            w = candidate;
            break;
          }
        a.add(
          plate(w, d),
          color,
          x + w / 2 - hw,
          y,
          z + d / 2 - hd,
          w === 1 && d === 2 ? 1 : 0,
        );
        for (let dx = 0; dx < w; dx++)
          for (let dz = 0; dz < d; dz++) remaining.delete(key(x + dx, z + dz));
      }
  };
  const wallLayer = (
    cells: Map<string, ColorId>,
    y: number,
    row: number,
    max: number,
    isPlate = false,
  ) => {
    const remaining = new Map(cells),
      rotate = row % 2 === 1;
    for (let z = 0; z < depth; z++)
      for (let x = 0; x < width; x++) {
        const c = remaining.get(key(x, z));
        if (!c) continue;
        let available = 0;
        while (
          available < max &&
          remaining.get(
            key(x + (rotate ? 0 : available), z + (rotate ? available : 0)),
          ) === c
        )
          available++;
        // Offset long seams in alternate courses without adding artificial connections.
        const cap =
          row % 2 === 0 && (rotate ? z : x) % 4 === 0
            ? Math.max(1, max - 1)
            : max;
        const n =
          lengths.find(
            (n) => n <= available && n <= cap && (isPlate ? n <= 4 : true),
          ) || 1;
        a.add(
          isPlate ? plate(n, 1) : brick(n),
          c,
          x + (rotate ? 0.5 : n / 2) - hw,
          y,
          z + (rotate ? n / 2 : 0.5) - hd,
          rotate ? 1 : 0,
        );
        for (let i = 0; i < n; i++)
          remaining.delete(key(x + (rotate ? 0 : i), z + (rotate ? i : 0)));
      }
  };
  let y = 0.8;
  for (let storey = 0; storey < s.storeys; storey++) {
    const wallBag = 2 + storey * 2,
      deckBag = wallBag + 1;
    for (let row = 0; row < 4; row++) {
      const baseY = y;
      a.phase(
        `Storey ${storey + 1} · ${row === 1 ? "windows & walls" : `wall course ${row + 1}`}`,
        "Alternate the masonry seams and seat each part on exposed studs. Follow the highlighted insertion direction.",
        wallBag,
        () => {
          if (row === 1)
            for (const win of windows) {
              const frame = a.add(
                "60592",
                s.wallColor,
                win.x,
                baseY,
                win.z,
                win.turn,
              );
              a.attach(
                "60601",
                "glass",
                frame,
                "window-seat",
                0,
                "window-insert",
                { procedure: "manual-flex", layer: baseY },
              );
            }
          const cells = new Map<string, ColorId>();
          for (const k of wall) {
            if (
              (row === 1 || row === 2) &&
              windows.some((w) => w.cells.includes(k))
            )
              continue;
            const [x, z] = k.split(",").map(Number);
            cells.set(
              k,
              storey === 0 &&
                row < 3 &&
                z === depth - 1 &&
                x >= doorStart &&
                x < doorStart + 2
                ? s.doorColor
                : s.wallColor,
            );
          }
          wallLayer(cells, baseY, row + storey * 4, easy ? 8 : hard ? 1 : 4);
          for (const k of posts) {
            const [x, z] = k.split(",").map(Number);
            a.add("3005", s.wallColor, x + 0.5 - hw, baseY, z + 0.5 - hd);
          }
        },
        "Walls",
      );
      y += 1.2;
      if (hard && row === 0) {
        const by = y;
        a.phase(
          "Tie the masonry together",
          "These plates overlap the small brick columns before the window courses begin.",
          wallBag,
          () => {
            wallLayer(
              new Map([...wall].map((k) => [k, s.wallColor])),
              by,
              storey + 1,
              4,
              true,
            );
            for (const k of posts) {
              const [x, z] = k.split(",").map(Number);
              a.add("3024", s.wallColor, x + 0.5 - hw, by, z + 0.5 - hd);
            }
          },
          "Bonding course",
        );
        y += 0.4;
      }
    }
    const floorY = y;
    a.phase(
      storey === s.storeys - 1
        ? "A supported roof deck"
        : `Ceiling & floor · storey ${storey + 1}`,
      "The internal posts and walls support these plates. Keep the original placement order so every piece has an existing anchor.",
      deckBag,
      () =>
        plateTiles(
          occupied,
          floorY,
          storey === s.storeys - 1 ? s.roofColor : "stone",
        ),
      "Floor & roof decks",
      "top",
    );
    y += 0.4;
    // A second, perpendicular studded layer bonds seams and supports the next shell.
    const bondY = y;
    a.phase(
      "Bond the supported deck",
      "Offset the plate seams to connect the complete deck.",
      deckBag,
      () =>
        wallLayer(
          new Map(
            [...occupied].map((k) => [
              k,
              storey === s.storeys - 1 ? s.roofColor : "stone",
            ]),
          ),
          bondY,
          storey + 1,
          4,
          true,
        ),
      "Deck bonding",
      "top",
    );
    y += 0.4;
  }
  const roofBag = 2 + s.storeys * 2;
  const roofCourses =
    s.roofShape === "flat"
      ? 1
      : Math.min(
          Math.floor((Math.min(width, depth) - 1) / 2),
          s.roofPitch === "steep" ? 5 : s.roofPitch === "low" ? 2 : 3,
        );
  for (let course = 0; course < roofCourses; course++) {
    const amount = course + 1;
    const cells = new Set(
      [...occupied].filter((k) => {
        const [x, z] = k.split(",").map(Number);
        if (s.roofShape === "flat") return true;
        if (s.roofShape === "hip")
          return (
            x >= amount &&
            x < width - amount &&
            z >= amount &&
            z < depth - amount
          );
        const coordinate = s.ridgeAxis === "width" ? z : x,
          limit = s.ridgeAxis === "width" ? depth : width;
        return s.roofShape === "shed"
          ? coordinate >= amount
          : coordinate >= amount && coordinate < limit - amount;
      }),
    );
    if (!cells.size) break;
    const at = y;
    a.phase(
      `${s.roofShape} roof · contour ${course + 1}`,
      "Build each smaller roof contour on the supported studs of the preceding course.",
      roofBag,
      () => plateTiles(cells, at, s.roofColor, hard ? 2 : 4),
      "Roof contours",
      "top",
    );
    y += 0.4;
  }
  if (s.chimney) {
    // Find a supported stud on the highest contour rather than guessing through the roof.
    const amount = s.roofShape === "flat" ? 0 : roofCourses;
    const site = [...occupied].find((k) => {
      const [x, z] = k.split(",").map(Number);
      if (s.roofShape === "flat") return true;
      if (s.roofShape === "hip")
        return (
          x >= amount && x < width - amount && z >= amount && z < depth - amount
        );
      const c = s.ridgeAxis === "width" ? z : x,
        l = s.ridgeAxis === "width" ? depth : width;
      return s.roofShape === "shed"
        ? c >= amount
        : c >= amount && c < l - amount;
    });
    if (site) {
      const [x, z] = site.split(",").map(Number);
      const at = y;
      a.phase(
        "A little chimney",
        "Stack the chimney on the exposed roof stud; keep it clear of surrounding pieces.",
        roofBag + 1,
        () => {
          for (let r = 0; r < (easy ? 1 : hard ? 3 : 2); r++)
            a.add("3005", "wood", x + 0.5 - hw, at + r * 1.2, z + 0.5 - hd);
        },
        "Chimney",
        "back",
      );
    }
  }
  if (s.garden) {
    a.phase(
      "A garden at home",
      "Attach flowers on the base outside the building footprint.",
      roofBag + 1,
      () => {
        for (const x of [-hw - 1.5, hw + 1.5]) {
          const stem = a.add("3062b", "leaf", x, 0.8, hd - 0.5);
          a.attach("24866", "flower", stem);
        }
      },
      "Garden",
      "front",
    );
  }
  const model = a.finish();
  model.revision = STUDIO_HOUSE_REVISION;
  model.constructionPhases = a.phases;
  model.studio = {
    moduleVersion: HOUSE_MODULE_VERSION,
    description: s,
    adaptations: [...notes],
    footprintStuds: [width, depth],
    windowCounts: actual as [number, number, number, number],
    storeys: s.storeys,
    roofShape: s.roofShape,
  };
  return model;
}

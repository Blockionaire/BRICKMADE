import { Assembly } from "../models";
import { quarterTurn } from "../parts/connections";
import { VoxelShape, emitVoxels } from "./voxel";
import {
  parseSubjectDesign,
  type SubjectDesign,
  type FlowerDesign,
  type CarDesign,
  type AnimalDesign,
  type FreeDesign,
} from "../../../shared/subject-design";
import type { GenerationSettings, HouseModel, Placement } from "../types";
import { placementBounds } from "../model-pose";
export const SUBJECT_COMPILER_VERSION = "2026-10-16.subject-v1";
const scaleOf = (s: GenerationSettings) =>
  s.size === "large" ? 2 : s.size === "standard" ? 1 : 0;
type Features = NonNullable<HouseModel["subject"]>["features"];

function flower(a: Assembly, s: FlowerDesign, features: Features) {
  const scale = scaleOf(a.settings),
    easy = a.settings.detail === "easy",
    hard = a.settings.detail === "hard";
  a.foundation(
    Math.max(
      12 + scale * 4,
      s.arrangement === "row"
        ? Math.ceil(((s.bloomCount - 1) * 3 + 4) / 4) * 4
        : 12,
    ),
    "stone",
  );
  const count = s.bloomCount;
  const sites =
    s.arrangement === "row"
      ? Array.from({ length: count }, (_, i) => [
          i * 3 - Math.floor(((count - 1) * 3) / 2) - 0.5,
          -0.5,
        ])
      : [
          [-0.5, -0.5],
          [3.5, 2.5],
          [-3.5, 2.5],
          [3.5, -3.5],
          [-3.5, -3.5],
        ].slice(0, count);
  const stems: Placement[] = [];
  let leaves = 0;
  a.phase(
    s.pot ? "Planters for the flowers" : "Root the stems",
    "Attach each stem support to the bonded base. Keep its stud grid aligned.",
    2,
    () => {
      sites.forEach(([x, z]) => {
        if (s.pot) {
          a.add(easy ? "3003" : "3941", s.potColor, x + 0.5, 0.8, z + 0.5);
          if (hard) a.add("3941", s.potColor, x + 0.5, 2, z + 0.5);
        }
      });
    },
    "Planters",
  );
  a.phase(
    "Grow the photographed arrangement",
    "Stack the stem sections on their real supporting studs. Heights follow the interpreted arrangement.",
    3,
    () => {
      sites.forEach(([x, z], i) => {
        const levels =
          { short: 2, medium: 3, tall: 5 }[s.stemHeight] +
          scale +
          (hard ? i % 3 : 0);
        let last: Placement | undefined;
        const start = s.pot ? (hard ? 3.2 : 2) : 0.8;
        let bottom = start;
        const foliage = hard
          ? Math.min(
              levels - 1,
              Math.floor(s.leafCount / count) + Number(i < s.leafCount % count),
            )
          : 0;
        for (let row = 0; row < levels; row++) {
          last = a.add("3062b", "leaf", x, bottom, z);
          bottom += 1.2;
          if (row < foliage) {
            const leaf = a.attach("2423", "leaf", last);
            leaf.rotation = quarterTurn((i + row) % 2 ? 2 : 0);
            bottom += 0.4;
            leaves++;
          }
        }
        stems.push(last!);
      });
    },
    "Stems",
  );
  a.phase(
    "Shape the blooms",
    "Attach the flower heads to the stem sockets. Add petals from the inside outward, preserving the shown approach.",
    4,
    () => {
      stems.forEach((stem, i) => {
        let top = stem;
        if (!easy && leaves < s.leafCount) {
          top = a.attach("2423", "leaf", stem);
          top.rotation = quarterTurn(i % 2 ? 2 : 0);
          leaves++;
        }
        if (s.bloomKind === "tulip") {
          top = a.attach("3062b", s.bloomColor, top);
          if (hard) top = a.attach("3062b", s.bloomColor, top);
        }
        if (s.bloomKind === "daisy" && !easy) {
          const petals = a.attach("2423", s.bloomColor, top);
          petals.rotation = quarterTurn(i % 2 ? 2 : 0);
          for (const index of hard ? [1, 2, 3, 4, 5] : [1, 2, 5])
            a.attach("24866", s.bloomColor, petals, "stud", index);
          a.attach("24866", s.centerColor, petals);
        } else {
          for (
            let n = 0;
            n < (s.bloomKind === "spike" ? (easy ? 2 : hard ? 5 : 3) : 1);
            n++
          )
            top = a.attach("24866", s.bloomColor, top);
          if (hard && s.bloomKind === "round")
            a.attach("6141", s.centerColor, top);
        }
      });
    },
    "Blooms",
    "top",
  );
  features.push(
    { name: "main blooms", requested: s.bloomCount, retained: stems.length },
    {
      name: "bloom form",
      requested: 1,
      retained: Number(!(easy && s.bloomKind === "daisy")),
    },
    { name: "leaves", requested: s.leafCount, retained: leaves },
  );
  if (easy && s.bloomKind === "daisy")
    a.adaptations.add(
      "The daisy petal cluster is simplified to a compact flower head at Easy detail.",
    );
  if (s.leafCount > leaves)
    a.adaptations.add(
      `${s.leafCount - leaves} leaves were omitted to preserve clearance at this detail level.`,
    );
  a.adaptations.add(
    "Flower forms use reviewed stem, leaf and flower assemblies; individual petal curvature is approximated.",
  );
}

function car(a: Assembly, s: CarDesign, features: Features) {
  const scale = scaleOf(a.settings),
    easy = a.settings.detail === "easy",
    hard = a.settings.detail === "hard";
  const length = 10 + scale * 2,
    width = Math.max(
      4,
      Math.min(8, Math.round(length / s.aspectRatio / 2) * 2),
    );
  const grid = new VoxelShape(),
    x0 = -length / 2,
    z0 = -width / 2;
  a.foundation(16 + scale * 4, "stone");
  grid.box(x0, 0, z0, length, 2, width, "black");
  emitVoxels(a, grid, {
    to: 2,
    title: "A connected display chassis",
    maxWidth: 10,
  });
  const heads: Placement[] = [];
  const axleX = [x0 + 1.5, -x0 - 1.5];
  a.phase(
    "Fixed wheel mounts",
    "These are display-wheel details on reviewed sideways studs. They are not rolling wheel/axle assemblies.",
    2,
    () => {
      for (const x of axleX)
        for (const z of [z0 + 0.5, -z0 - 0.5])
          heads.push(a.add("4070", "black", x, 1.6, z, z > 0 ? 0 : 2));
      for (const head of heads) {
        const spacer = a.attach(
          "6141",
          hard ? "black" : "stone",
          head,
          "stud",
          1,
        );
        if (hard) a.attach("14769", "stone", spacer);
      }
    },
    "Wheel details",
    "side",
  );
  grid.box(
    x0,
    2,
    z0,
    length,
    s.bodyShape === "suv" || s.bodyShape === "van" ? 6 : 4,
    width,
    s.bodyColor,
  );
  for (const x of axleX)
    for (const z of [z0 + 0.5, -z0 - 0.5])
      for (let y = 2; y < 5; y++) grid.delete(Math.floor(x), y, Math.floor(z));
  const bodyTop = s.bodyShape === "suv" || s.bodyShape === "van" ? 8 : 6;
  const cabinLength =
    s.bodyShape === "van"
      ? length - 2
      : s.bodyShape === "suv"
        ? Math.min(length - 2, 8)
        : s.bodyShape === "pickup" || s.bodyShape === "coupe"
          ? 4
          : 6;
  const offset =
    (s.cabinPosition === "front" ? 1 : s.cabinPosition === "rear" ? -1 : 0) +
    (s.bonnetLength === "long" ? -1 : s.bonnetLength === "short" ? 1 : 0);
  const cabinX =
    s.bodyShape === "hatchback"
      ? x0 + 1
      : s.bodyShape === "pickup"
        ? Math.min(-x0 - cabinLength - 1, 0)
        : Math.max(x0, Math.min(-x0 - cabinLength, -cabinLength / 2 + offset));
  const cabinWidth = Math.max(2, width - 2),
    cabinHeight = Math.max(
      s.bodyShape === "van" ? 8 : s.bodyShape === "suv" ? 6 : 0,
      { low: easy ? 3 : 4, medium: 6, high: 8 }[s.cabinHeight],
    );
  grid.box(
    cabinX,
    bodyTop,
    -cabinWidth / 2,
    cabinLength,
    cabinHeight,
    cabinWidth,
    "glass",
  );
  grid.box(
    cabinX,
    bodyTop + cabinHeight,
    -cabinWidth / 2,
    cabinLength,
    hard ? 2 : 1,
    cabinWidth,
    s.roofColor,
    s.bodyShape === "coupe" ? "rounded" : "box",
  );
  if (s.bodyShape === "pickup")
    for (let x = x0 + 1; x < cabinX; x++)
      for (let z = z0 + 1; z < -z0 - 1; z++) {
        for (let y = bodyTop - 2; y < bodyTop; y++) grid.delete(x, y, z);
        grid.set(x, bodyTop - 3, z, "black");
      }
  if (s.stripe && !easy)
    for (let x = x0; x < -x0; x++)
      for (let z = -1; z < 1; z++)
        if (grid.has(x, bodyTop - 1, z))
          grid.set(x, bodyTop - 1, z, s.stripeColor);
  if (s.roofRack && !easy) {
    const y = bodyTop + cabinHeight + (hard ? 2 : 1);
    for (let x = cabinX; x < cabinX + cabinLength; x++)
      for (let z = -cabinWidth / 2; z < cabinWidth / 2; z++)
        if (grid.has(x, y - 1, z)) grid.set(x, y, z, "black");
  }
  emitVoxels(a, grid, { from: 2, title: `${s.bodyShape} bodywork` });
  a.phase(
    "Finish the lights",
    "The light plates attach to the exposed bonnet and rear deck studs.",
    4,
    () => {
      if (!easy && -x0 - (cabinX + cabinLength) >= 2)
        for (const z of [-0.5, 0.5])
          a.add("11477", s.bodyColor, -x0 - 1, 0.8 + bodyTop * 0.4, z, 1);
      if (!easy && s.bodyShape === "sedan" && cabinX - x0 >= 2)
        for (const z of [-0.5, 0.5])
          a.add("11477", s.bodyColor, x0 + 1, 0.8 + bodyTop * 0.4, z, 3);
      for (const z of [z0 + 0.5, -z0 - 0.5]) {
        a.add("3024", "white", -x0 - 0.5, 0.8 + bodyTop * 0.4, z);
        a.add("3024", "red", x0 + 0.5, 0.8 + bodyTop * 0.4, z);
      }
    },
    "Lights",
  );
  features.push(
    { name: "body shape", requested: 1, retained: 1 },
    { name: "fixed wheel details", requested: 4, retained: heads.length },
    {
      name: "roof rack",
      requested: Number(s.roofRack),
      retained: Number(s.roofRack && !easy),
    },
    {
      name: "stripe",
      requested: Number(s.stripe),
      retained: Number(s.stripe && !easy),
    },
  );
  a.adaptations.add(
    "This is a fixed display car. Working wheels, axles, doors and suspension are not included.",
  );
  if (s.bonnetLength !== "medium")
    a.adaptations.add(
      "Bonnet proportions are approximated on the chosen stud grid.",
    );
}

function animal(a: Assembly, s: AnimalDesign, features: Features) {
  const scale = scaleOf(a.settings),
    easy = a.settings.detail === "easy";
  const length = 6 + scale * 2,
    width = 4,
    legLayers = s.pose === "sitting" ? 3 : 6;
  const grid = new VoxelShape();
  a.foundation(12 + scale * 4, "stone");
  for (const x of [-length / 2, length / 2 - 2])
    for (const z of [-2, 0]) grid.box(x, 0, z, 2, legLayers, 2, s.bodyColor);
  emitVoxels(a, grid, {
    to: legLayers,
    title:
      s.pose === "sitting" ? "Paws and seated support" : "Four grounded legs",
  });
  const cross = width === 4 ? "3020" : "3795",
    longitudinal = length === 6 ? "3795" : length === 8 ? "3034" : "3832";
  a.phase(
    "Connect the body supports",
    "Cross plates join the paws. Long plates span between these supported beams before the body is built.",
    2,
    () => {
      for (const x of [-length / 2 + 1, length / 2 - 1])
        a.add(cross, s.bodyColor, x, 0.8 + legLayers * 0.4, 0, 1);
      for (const z of [-1, 1])
        a.add(longitudinal, s.bodyColor, 0, 0.8 + (legLayers + 1) * 0.4, z);
    },
    "Supported body deck",
  );
  const bodyY = legLayers + 2,
    bodyHeight = Math.max(4, Math.min(9, Math.round(length / s.bodyRatio)));
  grid.box(
    -length / 2,
    bodyY,
    -2,
    length,
    bodyHeight,
    4,
    s.bodyColor,
    easy ? "box" : "rounded",
  );
  const headWidth = s.headSize === "small" ? 2 : 4,
    headDepth = s.headSize === "large" || s.species === "dog" ? 4 : 3;
  const headX = length / 2 - headDepth;
  grid.box(
    headX,
    bodyY + bodyHeight,
    -headWidth / 2,
    headDepth,
    easy ? 4 : 6,
    headWidth,
    s.bodyColor,
    easy ? "box" : "rounded",
  );
  if (s.markings !== "none")
    for (const cell of grid.cells.values()) {
      if (
        cell.y >= bodyY &&
        (s.markings === "stripe" ? cell.x % 3 === 0 : cell.x < 0 && cell.z >= 0)
      )
        cell.color = s.accentColor;
    }
  const earY = bodyY + bodyHeight + (easy ? 4 : 6),
    earHeight =
      s.ears === "long" ? (easy ? 4 : 8) : s.ears === "pointed" ? 4 : 2;
  for (const z of [-headWidth / 2, headWidth / 2 - 1])
    grid.box(
      headX + 1,
      earY,
      z,
      easy ? 2 : 1,
      earHeight,
      1,
      s.accentColor,
      s.ears === "pointed" ? "tapered" : "box",
    );
  if (s.ears === "pointed" && !easy)
    for (const z of [-headWidth / 2, headWidth / 2 - 1])
      for (let y = earY + earHeight - 3; y < earY + earHeight; y++)
        grid.delete(headX + 1, y, z);
  const tail = new VoxelShape();
  if (s.tail !== "none")
    tail.box(
      -length / 2 - 1,
      0,
      -1,
      1,
      s.tail === "long" ? bodyY + bodyHeight - 1 : bodyY + 1,
      1,
      s.bodyColor,
    );
  if (tail.cells.size) emitVoxels(a, tail, { title: "Supported upright tail" });
  const headY = bodyY + bodyHeight,
    eyeX = headX + headDepth - 1;
  for (const z of [-1, 0])
    for (let y = headY; y < headY + 3; y++) grid.delete(eyeX, y, z);
  emitVoxels(a, grid, { from: bodyY, to: headY, title: `${s.species} body` });
  a.phase(
    "Give the face its character",
    "Seat the face bricks on the body studs, then press each eye onto its reviewed sideways attachment.",
    3,
    () => {
      for (const z of [-0.5, 0.5]) {
        const head = a.add(
          "4070",
          s.bodyColor,
          eyeX + 0.5,
          0.8 + headY * 0.4,
          z,
          1,
        );
        a.attach(
          "6141",
          s.bodyColor === "black" ? "white" : "black",
          head,
          "stud",
          1,
        );
      }
    },
    "Eyes",
    "front",
  );
  emitVoxels(a, grid, {
    from: headY,
    bag: 3,
    title: `${s.species} head and ears`,
  });
  if (s.ears === "pointed" && !easy)
    a.phase(
      "Pointed ear tips",
      "Seat the small slopes on the final ear studs, matching the shown direction.",
      3,
      () => {
        for (const z of [-headWidth / 2, headWidth / 2 - 1])
          a.add(
            "3040b",
            s.accentColor,
            headX + 1.5,
            0.8 + (earY + earHeight - 3) * 0.4,
            z + 0.5,
            1,
          );
      },
      "Ears",
    );
  features.push(
    { name: "eyes", requested: 2, retained: 2 },
    { name: "ears", requested: 2, retained: 2 },
    {
      name: "tail",
      requested: Number(s.tail !== "none"),
      retained: Number(s.tail !== "none"),
    },
    {
      name: "markings",
      requested: Number(s.markings !== "none"),
      retained: Number(s.markings !== "none"),
    },
  );
  a.adaptations.add(
    "This is a supported brick sculpture. Fur, articulated limbs and organic curves are approximated; the upright tail is supported by the display base.",
  );
}

function free(a: Assembly, s: FreeDesign, features: Features) {
  const scale = scaleOf(a.settings),
    grid = new VoxelShape();
  const factor = (12 + scale * 4) / 16;
  a.foundation(16 + scale * 4, "stone");
  for (const c of s.components)
    grid.box(
      Math.round(c.x * factor) - (6 + scale * 2),
      Math.round((c.y * factor) / 0.4),
      Math.round(c.z * factor) - (6 + scale * 2),
      Math.max(1, Math.round(c.width * factor)),
      Math.max(1, Math.round((c.height * factor) / 0.4)),
      Math.max(1, Math.round(c.depth * factor)),
      c.color,
      a.settings.detail === "easy" ? "box" : c.shape,
    );
  const original = grid.cells.size,
    supports = grid.groundSupports("stone");
  if (supports > original * 0.35)
    throw Error(
      "The free-format design needs too much added support. Choose a grounded subject or clearer view.",
    );
  if (supports)
    a.adaptations.add(
      `${supports} support-grid cells were added beneath elevated components. They are included in the actual model and parts list.`,
    );
  emitVoxels(a, grid, { title: "Compose the photographed forms" });
  features.push({
    name: "described components",
    requested: s.components.length,
    retained: s.components.length,
  });
  a.adaptations.add(
    "Free format produces a grounded stud-based sculpture. Curved surfaces use stepped contours; unsupported mechanisms are not generated.",
  );
}

export function createStudioSubject(
  input: SubjectDesign,
  settings: GenerationSettings,
): HouseModel {
  const s = parseSubjectDesign(input);
  if (s.subject === "unsupported")
    throw Error("This subject cannot be compiled by its category.");
  const kind = (
    {
      flower: "plant",
      car: "rover",
      animal: "animal",
      free: "sculpture",
    } as const
  )[s.category];
  const a = new Assembly({
    ...settings,
    subjectDesign: s,
    modelKind: kind,
    designSource: settings.designSource || "openai",
  });
  const features: Features = [];
  switch (s.category) {
    case "flower":
      flower(a, s, features);
      break;
    case "car":
      car(a, s, features);
      break;
    case "animal":
      animal(a, s, features);
      break;
    case "free":
      free(a, s, features);
      break;
  }
  if (a.placements.length > 5000)
    throw Error(
      "The sculpture exceeds the piece budget. Choose a smaller or simpler design.",
    );
  const model = a.finish();
  model.constructionPhases = a.phases;
  model.revision = `${SUBJECT_COMPILER_VERSION}.${s.category}`;
  const ids = new Set(
    a.phases.filter((p) => p.bag !== 1).flatMap((p) => p.placementIds),
  );
  const boxes = model.placements
    .filter((p) => ids.has(p.id))
    .map(placementBounds);
  const footprint = [0, 2].map(
    (axis) =>
      Math.max(...boxes.map((b) => b.max[axis])) -
      Math.min(...boxes.map((b) => b.min[axis])),
  ) as [number, number];
  model.subject = {
    moduleVersion: `${s.category}-2026-10-16.v1`,
    description: s,
    adaptations: [...a.adaptations],
    footprintStuds: footprint,
    features,
  };
  return model;
}

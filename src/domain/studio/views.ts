import { COLORS } from "../catalog";
import { BUILDER_BY_REBRICKABLE } from "../parts/profiles";
import type { ColorId } from "../types";
import { VoxelShape } from "./voxel";

/**
 * Orthographic reference views derived from the user's photos, stored as compact colour
 * pixels (RGB565) so variants can be recompiled without the photos themselves.
 * Conventions: front looks at the subject's front (+z); side looks from +x with the
 * subject's front on the image left; top looks down with the front at the image bottom.
 */
export type ViewName = "front" | "side" | "top";
export interface ViewGrid {
  view: ViewName;
  width: number;
  height: number;
  /** Base64 of width×height little-endian RGB565 pixels from the image top; 1 = background. */
  cells: string;
}
export interface ViewSet {
  version: 2;
  views: ViewGrid[];
}
export const BACKGROUND = 1;
/** Opaque build colours with unique source identities, used for photo quantisation. */
export const VIEW_PALETTE = (Object.keys(COLORS) as ColorId[]).filter(
  (id, index, all) =>
    COLORS[id].alpha === 1 &&
    all.findIndex(
      (o) => COLORS[o].rebrickableId === COLORS[id].rebrickableId,
    ) === index &&
    // Only colours every basic packing size is recorded in.
    ["3005", "3004", "3024", "3023", "3003", "3022"].every((part) =>
      BUILDER_BY_REBRICKABLE.get(part)?.observedColorIds.includes(
        COLORS[id].rebrickableId,
      ),
    ),
);

type Lab = readonly [number, number, number];
export function rgbToLab([r, g, b]: [number, number, number]): Lab {
  const lin = (c: number) => {
    c /= 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  };
  const R = lin(r),
    G = lin(g),
    B = lin(b);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047),
    y = f(R * 0.2126 + G * 0.7152 + B * 0.0722),
    z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const hexRgb = (hex: string) =>
  hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16)) as [number, number, number];
const labCache = new Map<ColorId, Lab>();
export const colorLab = (id: ColorId) => {
  if (!labCache.has(id)) labCache.set(id, rgbToLab(hexRgb(COLORS[id].hex)));
  return labCache.get(id)!;
};
/** Lightness differences matter less than hue: lighting varies, paint colour does not. */
const labDistance = (a: readonly number[], b: readonly number[]) =>
  0.5 * (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Nearest palette entry for a colour, in perceptual Lab space. */
export function nearestColor(
  lab: readonly number[],
  palette: readonly ColorId[] = VIEW_PALETTE,
) {
  let best = palette[0],
    distance = Infinity;
  for (const id of palette) {
    const d = labDistance(lab, colorLab(id));
    if (d < distance) {
      distance = d;
      best = id;
    }
  }
  return best;
}

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
/** Encode RGBA pixels; alpha below 128 is background. */
export function encodeView(
  view: ViewName,
  width: number,
  height: number,
  rgba: Uint8Array,
): ViewGrid {
  const out = new Uint8Array(width * height * 2);
  for (let p = 0; p < width * height; p++) {
    let v = BACKGROUND;
    if (rgba[p * 4 + 3] >= 128) {
      v =
        ((rgba[p * 4] >> 3) << 11) |
        ((rgba[p * 4 + 1] >> 2) << 5) |
        (rgba[p * 4 + 2] >> 3);
      if (v === BACKGROUND) v = 0;
    }
    out[p * 2] = v & 255;
    out[p * 2 + 1] = v >> 8;
  }
  return { view, width, height, cells: toBase64(out) };
}
export function decodeView(grid: ViewGrid) {
  const bytes = fromBase64(grid.cells);
  if (bytes.length !== grid.width * grid.height * 2)
    throw Error("A reference view has an invalid size.");
  const out = new Uint16Array(grid.width * grid.height);
  for (let p = 0; p < out.length; p++)
    out[p] = bytes[p * 2] | (bytes[p * 2 + 1] << 8);
  return out;
}
const pixelLab = new Map<number, Lab>();
const labOfPixel = (v: number) => {
  let lab = pixelLab.get(v);
  if (!lab) {
    const r = ((v >> 11) & 31) * 8.2258,
      g = ((v >> 5) & 63) * 4.0476,
      b = (v & 31) * 8.2258;
    lab = rgbToLab([r, g, b]);
    pixelLab.set(v, lab);
  }
  return lab;
};

export function parseViewSet(value: unknown): ViewSet {
  const v = value as ViewSet;
  if (
    !v ||
    v.version !== 2 ||
    !Array.isArray(v.views) ||
    !v.views.some((g) => g.view === "front") ||
    !v.views.some((g) => g.view === "side") ||
    v.views.length > 3 ||
    new Set(v.views.map((g) => g.view)).size !== v.views.length ||
    Object.keys(v).sort().join() !== "version,views"
  )
    throw Error("The reference views are invalid.");
  for (const g of v.views) {
    if (
      !["front", "side", "top"].includes(g.view) ||
      !Number.isInteger(g.width) ||
      !Number.isInteger(g.height) ||
      g.width < 4 ||
      g.height < 4 ||
      g.width > 192 ||
      g.height > 192 ||
      typeof g.cells !== "string" ||
      Object.keys(g).sort().join() !== "cells,height,view,width"
    )
      throw Error("A reference view is invalid.");
    if (!decodeView(g).some((n) => n !== BACKGROUND))
      throw Error("A reference view contains no subject.");
  }
  return JSON.parse(JSON.stringify(v));
}

/**
 * Map sampled cell colours onto build colours. With the AI's chosen palette, try a few
 * chroma/lightness calibrations (generated views are often desaturated) and keep the one
 * that explains the cells best while actually using the most important colours.
 */
export function colorMapper(
  cells: Lab[],
  limit: number,
  keep: ColorId[] = [],
  allowed?: ColorId[],
) {
  const candidates = allowed?.length
    ? [...new Set([...keep, ...allowed])].filter((c) => COLORS[c]?.alpha === 1)
    : undefined;
  if (!candidates) {
    // Without guidance, greedily choose the palette colours that minimise error.
    const counts = new Map<ColorId, number>();
    for (const lab of cells) {
      const c = nearestColor(lab);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const used = [...counts.keys()];
    const chosen: ColorId[] = used.filter((c) => keep.includes(c));
    while (chosen.length < Math.min(limit, used.length)) {
      let best = used[0],
        bestCost = Infinity;
      for (const c of used) {
        if (chosen.includes(c)) continue;
        const selection = [...chosen, c];
        const cost = used.reduce(
          (sum, u) =>
            sum +
            counts.get(u)! *
              Math.min(
                ...selection.map((s) => labDistance(colorLab(u), colorLab(s))),
              ),
          0,
        );
        if (cost < bestCost) {
          bestCost = cost;
          best = c;
        }
      }
      chosen.push(best);
    }
    return (lab: Lab) => nearestColor(lab, chosen);
  }
  const chosen = candidates.slice(0, Math.max(1, limit));
  const important = chosen.slice(0, Math.min(3, chosen.length));
  // Subsample for speed; calibration only needs the distribution.
  const sample = cells.filter(
    (_, i) => i % Math.max(1, Math.floor(cells.length / 3000)) === 0,
  );
  let best = { s: 1, o: 0, cost: Infinity };
  for (const s of [1, 1.3, 1.6, 2, 2.5])
    for (const o of [-10, 0, 10]) {
      const used = new Map<ColorId, number>();
      let cost = 0;
      for (const lab of sample) {
        const t = [lab[0] + o, lab[1] * s, lab[2] * s];
        let distance = Infinity,
          pick = chosen[0];
        for (const c of chosen) {
          const d = labDistance(t, colorLab(c));
          if (d < distance) {
            distance = d;
            pick = c;
          }
        }
        cost += distance;
        used.set(pick, (used.get(pick) ?? 0) + 1);
      }
      // A calibration that leaves a main region colour unused is not explaining the photo.
      cost +=
        important.filter((c) => !used.has(c)).length * sample.length * 600;
      // The named main colour (for example the coat or body paint) should dominate.
      if (keep[0]) {
        const most = Math.max(...used.values());
        cost += (most - (used.get(keep[0]) ?? 0)) * 900;
      }
      cost *= 1 + (s - 1) * 0.05 + Math.abs(o) * 0.004;
      if (cost < best.cost) best = { s, o, cost };
    }
  return (lab: Lab) =>
    nearestColor([lab[0] + best.o, lab[1] * best.s, lab[2] * best.s], chosen);
}

/**
 * Resample one view to a target cell grid: occupancy by coverage; colour from the
 * dominant pixel cluster when one clearly wins, otherwise the cell's mean colour
 * (so brick texture or fur reads as its overall tone).
 */
export function sampleView(
  grid: ViewGrid,
  columns: number,
  rows: number,
  threshold = 0.45,
) {
  const data = decodeView(grid);
  const out: (Lab | null)[][] = [];
  for (let row = 0; row < rows; row++) {
    const line: (Lab | null)[] = [];
    // rows are counted from the bottom of the image
    const y0 = ((rows - row - 1) / rows) * grid.height,
      y1 = ((rows - row) / rows) * grid.height;
    for (let col = 0; col < columns; col++) {
      const x0 = (col / columns) * grid.width,
        x1 = ((col + 1) / columns) * grid.width;
      const bins = new Map<number, { w: number; lab: number[] }>();
      const mean = [0, 0, 0];
      let filled = 0,
        total = 0;
      for (
        let y = Math.floor(y0);
        y < Math.max(Math.floor(y0) + 1, Math.ceil(y1));
        y++
      )
        for (
          let x = Math.floor(x0);
          x < Math.max(Math.floor(x0) + 1, Math.ceil(x1));
          x++
        ) {
          if (x >= grid.width || y >= grid.height) continue;
          const wx = Math.min(x + 1, x1) - Math.max(x, x0),
            wy = Math.min(y + 1, y1) - Math.max(y, y0);
          const w = Math.max(0, wx) * Math.max(0, wy) || 0.0001;
          total += w;
          const v = data[y * grid.width + x];
          if (v === BACKGROUND) continue;
          filled += w;
          const lab = labOfPixel(v);
          lab.forEach((n, i) => (mean[i] += n * w));
          const bin =
            Math.round(lab[0] / 12) * 10000 +
            Math.round(lab[1] / 12) * 100 +
            Math.round(lab[2] / 12);
          const entry = bins.get(bin) ?? { w: 0, lab: [0, 0, 0] };
          entry.w += w;
          lab.forEach((n, i) => (entry.lab[i] += n * w));
          bins.set(bin, entry);
        }
      if (!total || filled / total < threshold) {
        line.push(null);
        continue;
      }
      const top = [...bins.values()].sort((a, b) => b.w - a.w)[0];
      line.push(
        (top.w / filled >= 0.5
          ? top.lab.map((n) => n / top.w)
          : mean.map((n) => n / filled)) as unknown as Lab,
      );
    }
    out.push(line);
  }
  return out;
}

/** Remove isolated single-cell colour speckle while keeping deliberate details. */
function despeckle(cells: (ColorId | null)[][]) {
  const rows = cells.length,
    cols = cells[0]?.length ?? 0;
  const out = cells.map((r) => [...r]);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const c = cells[y][x];
      if (!c) continue;
      const tally = new Map<ColorId, number>();
      let same = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = cells[y + dy]?.[x + dx];
        if (!n) continue;
        if (n === c) same++;
        tally.set(n, (tally.get(n) ?? 0) + 1);
      }
      const [winner, count] =
        [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (!same && winner && count >= 3) out[y][x] = winner;
    }
  return out;
}

/** Measured proportions of the cropped views: width:depth:height in shared units. */
export function viewProportions(set: ViewSet) {
  const get = (v: ViewName) => set.views.find((g) => g.view === v);
  const front = get("front")!,
    side = get("side")!,
    top = get("top");
  const height = 1;
  const width = front.width / front.height;
  let depth = side.width / side.height;
  // A plan view refines depth relative to width when both elevations agree on scale.
  if (top) depth = (depth + (top.height / top.width) * width) / 2;
  return { width, depth, height };
}

export type CrossSection = "rect" | "rounded" | "round";
/** A located feature painted onto a view before carving (windows, eyes, wheels). */
export interface Stamp {
  view: ViewName;
  /** x0, y0, x1, y1 in the cropped view, 0–1 with y downward. */
  box: [number, number, number, number];
  color: ColorId;
  /** Inner colour for framed stamps (window glass, wheel hubs). */
  inner?: ColorId;
  style: "fill" | "frame" | "dot";
}
export interface CarveOptions {
  stamps?: Stamp[];
  /** The build colours the design may use; cells map to the nearest of them. */
  allowedColors?: ColorId[];
  /** Span measures the largest dimension including height, for upright subjects. */
  spanIncludesHeight?: boolean;
  /** Studs along the larger horizontal dimension. */
  span: number;
  /** Upper bound in plates; very tall subjects scale down to respect it. */
  maxHeightPlates?: number;
  colors: number;
  keepColors?: ColorId[];
  section: CrossSection;
  /** Heights snap to whole bricks (three plates) for the simplest designs. */
  brickHeights: boolean;
  /** Minimum width in studs, so thin subjects keep a buildable body. */
  minimumStuds?: number;
}
export interface CarvedShape {
  grid: VoxelShape;
  width: number;
  depth: number;
  heightPlates: number;
  /** World x/z of grid index 0; studs are integer aligned. */
  originX: number;
  originZ: number;
  colors: ColorId[];
  supportCells: number;
  removedCells: number;
  /** Reference silhouettes in world cells: front "x,y" and side "z,y". */
  targets: { front: Set<string>; side: Set<string> };
}

/** Paint a stamp onto sampled cells ([row from bottom][column]); only solid cells change. */
export function applyStamp(cells: (ColorId | null)[][], stamp: Stamp) {
  const rows = cells.length,
    cols = cells[0]?.length ?? 0;
  const [u0, v0, u1, v1] = stamp.box;
  let c0 = Math.floor(u0 * cols),
    c1 = Math.ceil(u1 * cols) - 1;
  let r0 = Math.floor((1 - v1) * rows),
    r1 = Math.ceil((1 - v0) * rows) - 1;
  if (stamp.style === "dot" || c1 < c0 || r1 < r0) {
    // A dot keeps at least its centre cell, so small eyes survive coarse grids.
    const cx = Math.min(cols - 1, Math.floor(((u0 + u1) / 2) * cols)),
      cy = Math.min(rows - 1, Math.floor((1 - (v0 + v1) / 2) * rows));
    c0 = Math.min(c0, cx);
    c1 = Math.max(Math.min(c1, cols - 1), cx);
    r0 = Math.min(r0, cy);
    r1 = Math.max(Math.min(r1, rows - 1), cy);
    if (stamp.style === "dot" && (c1 - c0 > 1 || r1 - r0 > 2)) {
      c0 = c1 = cx;
      r0 = r1 = cy;
    }
  }
  for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++)
    for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
      if (!cells[r][c]) continue;
      const edge = r === r0 || r === r1 || c === c0 || c === c1;
      cells[r][c] =
        stamp.style === "frame" &&
        stamp.inner &&
        !(edge && c1 - c0 >= 2 && r1 - r0 >= 2)
          ? stamp.inner
          : stamp.color;
    }
}

function intervals(line: (ColorId | null)[]) {
  const out: [number, number][] = [];
  let start = -1;
  line.forEach((c, i) => {
    if (c && start < 0) start = i;
    if ((!c || i === line.length - 1) && start >= 0) {
      out.push([start, c ? i : i - 1]);
      start = -1;
    }
  });
  return out;
}

/**
 * Visual-hull carving: a cell is solid only when every available view shows the subject
 * there. Without a plan view, the category's cross-section rounds each layer.
 */
/** Scale the views to the requested span and sample every view onto the stud grid. */
export function sampleViews(set: ViewSet, options: CarveOptions) {
  const p = viewProportions(set);
  const horizontal = options.spanIncludesHeight
    ? Math.max(p.width, p.depth, p.height)
    : Math.max(p.width, p.depth);
  let studsPerUnit = options.span / horizontal;
  if (
    options.maxHeightPlates &&
    p.height * studsPerUnit * 2.5 > options.maxHeightPlates
  )
    studsPerUnit = options.maxHeightPlates / 2.5 / p.height;
  const min = options.minimumStuds ?? 2;
  const width = Math.max(min, Math.round(p.width * studsPerUnit)),
    depth = Math.max(min, Math.round(p.depth * studsPerUnit));
  let heightPlates = Math.max(3, Math.round(p.height * studsPerUnit * 2.5));
  if (options.brickHeights)
    heightPlates = Math.max(3, Math.round(heightPlates / 3) * 3);
  const rowsFor = options.brickHeights ? heightPlates / 3 : heightPlates;
  const expand = (rows: (ColorId | null)[][]) =>
    options.brickHeights ? rows.flatMap((r) => [r, r, r]) : rows;
  const raw = new Map<ViewName, (Lab | null)[][]>();
  const labs: Lab[] = [];
  for (const [name, cols, rows] of [
    ["front", width, rowsFor],
    ["side", depth, rowsFor],
    ["top", width, depth],
  ] as const) {
    const g = set.views.find((v) => v.view === name);
    if (!g) continue;
    const cells = sampleView(g, cols, rows);
    raw.set(name, cells);
    for (const line of cells) for (const lab of line) if (lab) labs.push(lab);
  }
  const mapColor = colorMapper(
    labs,
    options.colors,
    options.keepColors,
    options.allowedColors,
  );
  const view = (name: ViewName) => {
    const cells = raw.get(name);
    if (!cells) return null;
    const out = despeckle(
      cells.map((line) => line.map((lab) => (lab ? mapColor(lab) : null))),
    );
    for (const stamp of options.stamps ?? [])
      if (stamp.view === name) applyStamp(out, stamp);
    return out;
  };
  const front = expand(view("front")!); // [y][x]
  const side = expand(view("side")!); // [y][z], z from front
  const top = view("top"); // [row from front][x]
  const fallback = options.keepColors?.[0] ?? mapColor(labs[0] ?? [50, 0, 0]);
  return { width, depth, heightPlates, front, side, top, fallback };
}

export function carveViews(set: ViewSet, options: CarveOptions): CarvedShape {
  const { width, depth, heightPlates, front, side, top, fallback } =
    sampleViews(set, options);
  const solid = (x: number, y: number, z: number) => {
    if (!front[y][x] || !side[y][z]) return false;
    if (top) return !!top[z][x];
    if (options.section === "rect") return true;
    const fx = intervals(front[y]).find(([a, b]) => x >= a && x <= b)!,
      sz = intervals(side[y]).find(([a, b]) => z >= a && z <= b)!;
    const w = fx[1] - fx[0] + 1,
      d = sz[1] - sz[0] + 1;
    if (w <= 2 || d <= 2) return true;
    const exponent = options.section === "round" ? 2 : 4;
    const u = Math.abs((x + 0.5 - (fx[0] + w / 2)) / (w / 2)),
      v = Math.abs((z + 0.5 - (sz[0] + d / 2)) / (d / 2));
    return u ** exponent + v ** exponent <= 1.08;
  };
  const filled = new Set<string>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (let y = 0; y < heightPlates; y++)
    for (let z = 0; z < depth; z++)
      for (let x = 0; x < width; x++)
        if (solid(x, y, z)) filled.add(key(x, y, z));
  const has = (x: number, y: number, z: number) => filled.has(key(x, y, z));
  // Keep the largest grounded components; drop tiny disconnected fragments.
  const seen = new Set<string>();
  let removedCells = 0;
  const components: string[][] = [];
  for (const start of filled) {
    if (seen.has(start)) continue;
    const queue = [start],
      members: string[] = [];
    seen.add(start);
    while (queue.length) {
      const k = queue.pop()!;
      members.push(k);
      const [x, y, z] = k.split(",").map(Number);
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ]) {
        const n = key(x + dx, y + dy, z + dz);
        if (filled.has(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    components.push(members);
  }
  const largest = Math.max(...components.map((c) => c.length));
  for (const c of components)
    if (c.length < Math.max(4, largest * 0.01)) {
      removedCells += c.length;
      c.forEach((k) => filled.delete(k));
    }
  // Colour the surface from the view facing each exposed side.
  const colorAt = (x: number, y: number, z: number): ColorId | null => {
    if (!has(x, y, z - 1) && front[y][x]) return front[y][x];
    if ((!has(x + 1, y, z) || !has(x - 1, y, z)) && side[y][z])
      return side[y][z];
    if (!has(x, y + 1, z)) return top?.[z][x] ?? front[y][x] ?? side[y][z];
    if (!has(x, y, z + 1)) return side[y][z] ?? front[y][x];
    return null;
  };
  // The grid stores world orientation: the front (view z = 0) faces +z.
  const grid = new VoxelShape();
  const interior: [number, number, number][] = [];
  for (const k of filled) {
    const [x, y, z] = k.split(",").map(Number);
    const c = colorAt(x, y, z);
    if (c) grid.set(x, y, depth - 1 - z, c);
    else interior.push([x, y, depth - 1 - z]);
  }
  // Interior cells copy the nearest surface colour in their layer, so larger parts fit.
  let pending = interior;
  while (pending.length) {
    const next: typeof pending = [];
    for (const [x, y, z] of pending) {
      const n = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([dx, dz]) => grid.cells.get(key(x + dx, y, z + dz)))
        .find(Boolean);
      const below = grid.cells.get(key(x, y - 1, z));
      if (n || below) grid.set(x, y, z, (n ?? below)!.color);
      else next.push([x, y, z]);
    }
    if (next.length === pending.length) {
      for (const [x, y, z] of next) grid.set(x, y, z, fallback);
      break;
    }
    pending = next;
  }
  if (options.brickHeights)
    // A whole brick has one colour: give each three-plate course its majority colour.
    for (const v of grid.cells.values()) {
      if (v.y % 3) continue;
      const course = [0, 1, 2].map((dy) =>
        grid.cells.get(`${v.x},${v.y + dy},${v.z}`),
      );
      const tally = new Map<ColorId, number>();
      for (const c of course)
        if (c) tally.set(c.color, (tally.get(c.color) ?? 0) + 1);
      const winner = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
      for (const c of course) if (c) c.color = winner;
    }
  return {
    grid,
    width,
    depth,
    heightPlates,
    originX: -Math.floor(width / 2),
    originZ: -Math.floor(depth / 2),
    colors: [...new Set([...grid.cells.values()].map((v) => v.color))],
    supportCells: 0,
    removedCells,
    targets: silhouettes(front, side, depth),
  };
}

export function silhouettes(
  front: (ColorId | null)[][],
  side: (ColorId | null)[][],
  depth: number,
) {
  const f = new Set<string>(),
    s = new Set<string>();
  front.forEach((line, y) => line.forEach((c, x) => c && f.add(`${x},${y}`)));
  side.forEach((line, y) =>
    line.forEach((c, z) => c && s.add(`${depth - 1 - z},${y}`)),
  );
  return { front: f, side: s };
}

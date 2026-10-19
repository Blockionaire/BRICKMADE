import sharp from "sharp";
import { StudioError } from "./supabase.mjs";
import {
  encodeView,
  parseViewSet,
  viewProportions,
} from "../src/domain/studio/views.ts";

/** Category-specific orthographic views. Front is +z, the side camera sits at +x. */
export const VIEW_PLANS = {
  house: {
    subject:
      "the main house only (no garden, fences, hedges, cars, people or neighbouring buildings)",
    views: {
      front:
        "an exact FRONT ELEVATION looking straight at the entrance facade, so the facade appears as a flat rectangle with its roof outline above it",
      side: "an exact SIDE ELEVATION of the house's right-hand wall, with the entrance facade at the LEFT edge of the image, showing the true roof profile (a gable end shows its triangle)",
      top: "an exact ROOF PLAN seen from directly above (only the roof surfaces visible, no walls), with the entrance facade along the BOTTOM edge of the image",
    },
  },
  car: {
    subject: "the car only (no road, kerb, people or other vehicles)",
    views: {
      front:
        "an exact FRONT view looking straight at the nose, headlights and windscreen, with the windscreen drawn as opaque dark tinted glass",
      side: "an exact SIDE profile with the front of the car pointing LEFT in the image, all wheels at true size, with every window drawn as opaque dark tinted glass (nothing visible through it)",
      top: "an exact TOP plan view seen from directly above (roof and bonnet visible, no sides visible), with the front of the car pointing DOWN in the image",
    },
  },
  animal: {
    subject:
      "the animal only, in the same pose as the photo (no floor, furniture, people or other animals)",
    views: {
      front: "an exact FRONT view looking straight at its face and chest",
      side: "an exact SIDE view of the same pose with its face pointing LEFT in the image",
      top: "an exact TOP view of the same pose seen from directly above (back and top of the head visible), with its face pointing DOWN in the image",
    },
  },
  flower: {
    subject:
      "the plant together with its pot or vase, if present (no table, wall or other objects)",
    views: {
      front:
        "an exact FRONT view with every bloom facing the camera as in the photo",
      side: "an exact SIDE view of the same arrangement with its front at the LEFT of the image",
      top: "an exact TOP view of the same arrangement seen from directly above (bloom tops and the container rim visible), with its front along the BOTTOM edge of the image",
    },
  },
  free: {
    subject:
      "the main object only (no surroundings, people or background objects)",
    views: {
      front:
        "an exact FRONT view looking straight at its most recognisable face",
      side: "an exact SIDE view with that front at the LEFT of the image",
      top: "an exact TOP plan view seen from directly above, with that front along the BOTTOM edge of the image",
    },
  },
};
const KEYS = { magenta: [255, 0, 255], green: [0, 255, 0] };
const STYLE = (key) =>
  `Strict orthographic projection (no perspective, no vanishing points), flat even studio lighting, no cast shadows, no ground plane, no reflections, no text or labels. Solid flat pure ${key === "green" ? "green #00FF00" : "magenta #FF00FF"} background filling everything around the subject, never used inside the subject. Subject centred, completely visible and filling about 85% of the frame. Keep the subject's exact proportions, colours and visible details from the photos; do not add, stylise or beautify features.`;

export function viewPrompt(category, view, key = "magenta", notes = "") {
  const plan = VIEW_PLANS[category];
  return `Show ${plan.subject} from the reference photos as ${plan.views[view]}. ${notes ? `Known details: ${notes}. ` : ""}${STYLE(key)}`;
}

/** Use a green key when the subject itself is pink or magenta. */
export async function chooseKey(photoBuffers) {
  let magenta = 0,
    total = 0;
  for (const buffer of photoBuffers) {
    const { data, info } = await sharp(buffer)
      .resize(96, 96, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      total++;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r > 150 && b > 120 && g < Math.min(r, b) * 0.6) magenta++;
    }
  }
  return magenta / Math.max(1, total) > 0.01 ? "green" : "magenta";
}

async function editImage(photos, prompt, { env, signal, fetcher }) {
  const form = new FormData();
  form.append("model", env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2");
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  form.append("quality", env.OPENAI_IMAGE_QUALITY?.trim() || "medium");
  form.append("stream", "true");
  form.append("partial_images", "1");
  photos.forEach((buffer, i) =>
    form.append(
      "image[]",
      new Blob([buffer], { type: "image/png" }),
      `photo-${i}.png`,
    ),
  );
  let response;
  try {
    response = await fetcher("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}` },
      body: form,
      signal: AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(240000),
      ]),
    });
  } catch {
    if (signal?.aborted) throw signal.reason || new Error("Cancelled");
    throw new StudioError(
      504,
      "views-timeout",
      "Preparing the reference views was interrupted. Please try again.",
    );
  }
  if (!response.ok) {
    if (response.status === 429) {
      const body = await response.text().catch(() => "");
      if (/insufficient_quota|credit_balance/.test(body))
        throw new StudioError(
          429,
          "provider-quota",
          "The OpenAI account behind BrickMade has no API credit left. The owner needs to add credit before new photo builds can run.",
        );
      throw new StudioError(
        429,
        "provider-limit",
        "The AI service is at its usage limit. Check the OpenAI project budget or try later.",
      );
    }
    if (response.status === 400)
      throw new StudioError(
        422,
        "views-refused",
        "These photos could not be turned into reference views. Please choose different subject photos.",
      );
    throw new StudioError(
      502,
      "views-unavailable",
      "Reference views could not be prepared. Please try again later.",
    );
  }
  const text = await response.text();
  let last;
  for (const line of text.split("\n"))
    if (line.startsWith("data: "))
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type?.endsWith("completed") && event.b64_json)
          last = event.b64_json;
        if (event.type === "error") throw Error();
      } catch {
        throw new StudioError(
          502,
          "views-unavailable",
          "Reference views could not be prepared. Please try again later.",
        );
      }
  if (!last)
    throw new StudioError(
      502,
      "views-unavailable",
      "Reference views could not be prepared. Please try again later.",
    );
  return Buffer.from(last, "base64");
}

/** Ask the image model for each orthographic view of the photographed subject. */
export async function generateReferenceImages(
  photoBuffers,
  category,
  { env = process.env, signal, fetcher = fetch, notes = "" } = {},
) {
  if (!env.OPENAI_API_KEY?.trim())
    throw new StudioError(
      503,
      "provider-configuration",
      "The image service needs its OpenAI key configured on the worker.",
    );
  const key = await chooseKey(photoBuffers);
  const pngs = await Promise.all(
    photoBuffers.map((b) => sharp(b).png().toBuffer()),
  );
  const names = Object.keys(VIEW_PLANS[category].views);
  const images = await Promise.all(
    names.map((view) =>
      editImage(pngs, viewPrompt(category, view, key, notes), {
        env,
        signal,
        fetcher,
      }),
    ),
  );
  return {
    key,
    images: Object.fromEntries(names.map((n, i) => [n, images[i]])),
  };
}

/** Separate the subject from the flat key colour and quantise it to build colours. */
export async function segmentView(
  buffer,
  view,
  key = "magenta",
  { resolution = 128, holeColor } = {},
) {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Colour comes from a median-filtered copy, so mortar lines, fur strands and
  // highlights read as their surface tone while windows and eyes stay distinct.
  const smooth = await sharp(buffer).removeAlpha().median(5).raw().toBuffer();
  const { width, height, channels } = info;
  const target = KEYS[key];
  // The generated background is flat, but sample the border in case it drifted.
  const border = [];
  for (let x = 0; x < width; x += 8)
    for (const y of [0, height - 1]) border.push((y * width + x) * channels);
  for (let y = 0; y < height; y += 8)
    for (const x of [0, width - 1]) border.push((y * width + x) * channels);
  const median = [0, 1, 2].map((c) => {
    const v = border.map((i) => data[i + c]).sort((a, b) => a - b);
    return v[v.length >> 1];
  });
  const keyColor =
    Math.hypot(...median.map((v, i) => v - target[i])) < 120 ? median : target;
  const alpha = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < width * height; p++, i += channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const distance = Math.hypot(
      r - keyColor[0],
      g - keyColor[1],
      b - keyColor[2],
    );
    // Anti-aliased edges keep a strong key tint; treat them as background too.
    // Key-tinted pixels (seen through glass, anti-aliased edges) also count as background.
    const tinted =
      key === "magenta"
        ? r - g > 55 && b - g > 45 && Math.abs(r - b) < 120
        : g - r > 55 && g - b > 45;
    alpha[p] = distance < 110 || tinted ? 0 : 255;
  }
  // Background enclosed by the subject (car windows, gaps in a handle) is a hole, not
  // empty space: fill it so the carved body stays solid. A closed copy of the mask
  // bridges hairline gaps in thin frames before deciding what is outside.
  const closed = new Uint8Array(alpha);
  const radius = Math.max(2, Math.round(Math.min(width, height) / 220));
  for (let pass = 0; pass < radius; pass++) {
    const prev = new Uint8Array(closed);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (prev[p]) continue;
        if (
          (x && prev[p - 1]) ||
          (x < width - 1 && prev[p + 1]) ||
          (y && prev[p - width]) ||
          (y < height - 1 && prev[p + width])
        )
          closed[p] = 255;
      }
  }
  const outside = new Uint8Array(width * height);
  const queue = [];
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
  while (queue.length) {
    const p = queue.pop();
    if (outside[p] || closed[p]) continue;
    outside[p] = 1;
    const x = p % width;
    if (x > 0) queue.push(p - 1);
    if (x < width - 1) queue.push(p + 1);
    if (p >= width) queue.push(p - width);
    if (p < width * (height - 1)) queue.push(p + width);
  }
  // Pixels within the closing radius of reached background are outside too.
  for (let pass = 0; pass < radius; pass++) {
    const prev = new Uint8Array(outside);
    for (let p = 0; p < width * height; p++) {
      if (prev[p] || alpha[p]) continue;
      const x = p % width;
      if (
        (x && prev[p - 1]) ||
        (x < width - 1 && prev[p + 1]) ||
        (p >= width && prev[p - width]) ||
        (p < width * (height - 1) && prev[p + width])
      )
        outside[p] = 1;
    }
  }
  const seen = new Uint8Array(width * height);
  const holes = new Uint8Array(width * height);
  for (let start = 0; start < width * height; start++) {
    if (alpha[start] || outside[start] || seen[start]) continue;
    const region = [],
      ring = [0, 0, 0, 0],
      stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      region.push(p);
      const x = p % width;
      for (const n of [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        p - width,
        p + width,
      ]) {
        if (n < 0 || n >= width * height) continue;
        if (alpha[n]) {
          ring[0] += data[n * channels];
          ring[1] += data[n * channels + 1];
          ring[2] += data[n * channels + 2];
          ring[3]++;
        } else if (!seen[n] && !outside[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    // Cars show glazing as holes; elsewhere a hole takes its surrounding colour.
    const fill =
      holeColor ?? ring.slice(0, 3).map((v) => v / Math.max(1, ring[3]));
    for (const p of region) {
      alpha[p] = 255;
      holes[p] = 1;
      data[p * channels] = fill[0];
      data[p * channels + 1] = fill[1];
      data[p * channels + 2] = fill[2];
    }
  }
  // Ignore specks: keep rows/columns that hold a meaningful part of the subject.
  const rows = new Array(height).fill(0),
    cols = new Array(width).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (alpha[y * width + x]) {
        rows[y]++;
        cols[x]++;
      }
  const minimum = 2;
  const first = (a) => a.findIndex((n) => n > minimum),
    last = (a) => a.length - 1 - [...a].reverse().findIndex((n) => n > minimum);
  const left = first(cols),
    right = last(cols),
    top = first(rows),
    bottom = last(rows);
  if (left < 0 || top < 0 || right - left < 16 || bottom - top < 16)
    throw new StudioError(
      422,
      "views-empty",
      "A reference view did not contain the subject. Please try clearer photos.",
    );
  // Bleed subject colours into the background so resampling never mixes in the key.
  const source = new Uint8Array(smooth);
  for (let p = 0; p < width * height; p++)
    if (holes[p])
      for (let c = 0; c < 3; c++)
        source[p * channels + c] = data[p * channels + c];
  let known = new Uint8Array(alpha);
  for (let pass = 0; pass < 4; pass++) {
    const next = new Uint8Array(known);
    for (let p = 0; p < width * height; p++) {
      if (known[p]) continue;
      const x = p % width;
      const n = [
        x ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        p - width,
        p + width,
      ].find((q) => q >= 0 && q < width * height && known[q]);
      if (n === undefined) continue;
      for (let c = 0; c < 3; c++)
        source[p * channels + c] = source[n * channels + c];
      next[p] = 255;
    }
    known = next;
  }
  const cw = right - left + 1,
    ch = bottom - top + 1;
  const scale = resolution / Math.max(cw, ch);
  const ow = Math.max(4, Math.round(cw * scale)),
    oh = Math.max(4, Math.round(ch * scale));
  const rgba = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const s = ((y + top) * width + x + left) * channels,
        d = (y * cw + x) * 4;
      rgba[d] = source[s];
      rgba[d + 1] = source[s + 1];
      rgba[d + 2] = source[s + 2];
      rgba[d + 3] = alpha[(y + top) * width + x + left];
    }
  const small = await sharp(rgba, {
    raw: { width: cw, height: ch, channels: 4 },
  })
    .resize(ow, oh, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
  return {
    grid: encodeView(view, ow, oh, small),
    crop: { left, top, width: cw, height: ch },
  };
}

/** Build the persisted view set; inconsistent plan views are dropped rather than trusted. */
export async function buildViewSet(
  images,
  key = "magenta",
  { holeColor } = {},
) {
  const views = [],
    crops = {};
  for (const view of ["front", "side", "top"])
    if (images[view]) {
      const { grid, crop } = await segmentView(images[view], view, key, {
        holeColor,
      });
      views.push(grid);
      crops[view] = crop;
    }
  let set = parseViewSet({ version: 2, views });
  const top = set.views.find((v) => v.view === "top");
  const notes = [];
  if (top) {
    const front = set.views.find((v) => v.view === "front"),
      side = set.views.find((v) => v.view === "side");
    const elevationRatio =
      front.width / front.height / (side.width / side.height);
    const planRatio = top.width / top.height;
    if (Math.abs(Math.log(planRatio / elevationRatio)) > Math.log(1.4)) {
      set = { ...set, views: set.views.filter((v) => v.view !== "top") };
      notes.push(
        "The plan view disagreed with the elevations and was not used.",
      );
    }
  }
  return { viewSet: set, proportions: viewProportions(set), notes, crops };
}

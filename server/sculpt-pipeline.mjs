import sharp from "sharp";
import { StudioError } from "./supabase.mjs";
import {
  SCULPT_KNOWLEDGE,
  VIEW_GUIDANCE,
  featurePrompt,
} from "./sculpt-knowledge.mjs";
import { generateReferenceImages, buildViewSet } from "./reference-views.mjs";
import {
  sculptSchema,
  featureSchema,
  parseSculptDesign,
  parseFeatureAnalysis,
} from "../shared/sculpt-design.ts";
import { COLORS } from "../src/domain/catalog.ts";

export const DEFAULT_VISION_MODEL = "gpt-5.5";
const visionModel = (env) => env.OPENAI_MODEL?.trim() || DEFAULT_VISION_MODEL;

/** One strict structured Responses call; errors never leak provider details. */
async function structuredCall({
  env,
  signal,
  fetcher,
  instructions,
  content,
  name,
  schema,
  effort,
}) {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key)
    throw new StudioError(
      503,
      "provider-configuration",
      "The image service needs its OpenAI key configured on the worker.",
    );
  const reasoning = effort || env.OPENAI_REASONING_EFFORT || "high";
  if (!["low", "medium", "high"].includes(reasoning))
    throw new StudioError(
      503,
      "provider-configuration",
      "The worker's reasoning setting is invalid.",
    );
  let response;
  try {
    response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(240000),
      ]),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel(env),
        store: false,
        reasoning: { effort: reasoning },
        max_output_tokens: 40000,
        stream: true,
        instructions,
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name, strict: true, schema } },
      }),
    });
  } catch {
    if (signal?.aborted) throw signal.reason || new Error("Cancelled");
    throw new StudioError(
      504,
      "interpretation-timeout",
      "Photo analysis was interrupted. Start a new build; the previous provider request may already have processed.",
    );
  }
  if (!response.ok) {
    if (response.status === 429)
      throw new StudioError(
        429,
        "provider-limit",
        "The AI service is at its usage limit. Check the OpenAI project budget or try later.",
      );
    if ([400, 401, 403, 404].includes(response.status))
      throw new StudioError(
        503,
        "provider-configuration",
        "The worker's OpenAI key, model or structured-output configuration needs checking.",
      );
    throw new StudioError(
      502,
      "provider-unavailable",
      "Photo analysis could not finish. Please try again later.",
    );
  }
  // Streaming keeps long reasoning calls alive through proxies; only the final
  // completed (or failed) event carries the response used below.
  let data;
  try {
    const text = await response.text();
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const event = JSON.parse(line.slice(6));
      if (
        [
          "response.completed",
          "response.incomplete",
          "response.failed",
        ].includes(event.type)
      )
        data = event.response;
    }
    if (!data) throw Error();
  } catch {
    if (signal?.aborted) throw signal.reason || new Error("Cancelled");
    throw new StudioError(
      502,
      "provider-output",
      "The image service returned an unreadable response.",
    );
  }
  if (data.status !== "completed") {
    if (
      data.error?.type === "insufficient_quota" ||
      data.error?.code === "credit_balance_exhausted"
    )
      throw new StudioError(
        429,
        "provider-quota",
        "The OpenAI account behind BrickMade has no API credit left. The owner needs to add credit before new photo builds can run.",
      );
    throw new StudioError(
      422,
      "interpretation-incomplete",
      "Photo analysis did not finish its description. Try one clearer photo.",
    );
  }
  const parts = (data.output || [])
    .filter((m) => m.type === "message" && m.role === "assistant")
    .flatMap((m) => m.content || []);
  if (parts.some((c) => c.type === "refusal"))
    throw new StudioError(
      422,
      "interpretation-refused",
      "These photos could not be interpreted. Please choose different subject photos.",
    );
  const texts = parts.filter((c) => c.type === "output_text");
  if (
    texts.length !== 1 ||
    typeof texts[0].text !== "string" ||
    texts[0].text.length > 60000
  )
    throw new StudioError(
      502,
      "invalid-description",
      "The AI description was not usable. No model was substituted; please retry with clearer photos.",
    );
  try {
    return JSON.parse(texts[0].text);
  } catch {
    throw new StudioError(
      502,
      "invalid-description",
      "The AI description was not usable. No model was substituted; please retry with clearer photos.",
    );
  }
}

/** Stage 1: category-informed interpretation of the user's photos. */
export async function interpretSculpt(
  photos,
  { env = process.env, signal, fetcher = fetch, categoryId = "house" } = {},
) {
  const raw = await structuredCall({
    env,
    signal,
    fetcher,
    name: `brickmade_${categoryId}_v3`,
    schema: sculptSchema(categoryId),
    instructions: SCULPT_KNOWLEDGE[categoryId],
    content: [
      {
        type: "input_text",
        text: `Interpret these ${photos.length} photo(s) of one ${categoryId === "free" ? "object" : categoryId} for a brick model. Return the strict description.`,
      },
      ...photos.map((image_url) => ({
        type: "input_image",
        image_url,
        detail: "high",
      })),
    ],
  });
  let description;
  try {
    description = parseSculptDesign(raw, categoryId);
  } catch {
    throw new StudioError(
      502,
      "invalid-description",
      "The AI description was not usable. No model was substituted; please retry with clearer photos.",
    );
  }
  if (description.subject === "unsupported")
    throw new StudioError(
      422,
      "unsupported-subject",
      "These photos could not be represented by this category. No unrelated model was substituted.",
    );
  return { description, model: visionModel(env) };
}

const rgbOf = (id) => {
  const n = parseInt(COLORS[id].hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

/** Stage 2 and 3: orthographic reference views, then located features on those views. */
export async function prepareReference(
  photoBuffers,
  description,
  { env = process.env, signal, fetcher = fetch } = {},
) {
  const category = description.category;
  const notes = `${description.viewNotes} ${VIEW_GUIDANCE[category]}`;
  const { key, images } = await generateReferenceImages(
    photoBuffers,
    category,
    { env, signal, fetcher, notes },
  );
  const holeColor =
    category === "car" ? rgbOf(description.traits.glassColor) : undefined;
  const {
    viewSet,
    crops,
    notes: viewNotes,
  } = await buildViewSet(images, key, { holeColor });
  const content = [];
  for (const grid of viewSet.views) {
    const crop = crops[grid.view];
    const image = await sharp(images[grid.view])
      .extract({
        left: crop.left,
        top: crop.top,
        width: crop.width,
        height: crop.height,
      })
      .resize(768, 768, { fit: "inside" })
      .png()
      .toBuffer();
    content.push(
      { type: "input_text", text: `Reference view: ${grid.view}` },
      {
        type: "input_image",
        image_url: `data:image/png;base64,${image.toString("base64")}`,
        detail: "high",
      },
    );
  }
  content.push({ type: "input_text", text: "Original photos:" });
  for (const buffer of photoBuffers) {
    const small = await sharp(buffer)
      .resize(768, 768, { fit: "inside" })
      .jpeg({ quality: 85 })
      .toBuffer();
    content.push({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${small.toString("base64")}`,
      detail: "low",
    });
  }
  const raw = await structuredCall({
    env,
    signal,
    fetcher,
    name: `brickmade_${category}_features_v1`,
    schema: featureSchema(category),
    instructions: featurePrompt(category),
    content,
    effort: "medium",
  });
  let analysis;
  try {
    analysis = parseFeatureAnalysis(raw, category);
  } catch {
    throw new StudioError(
      502,
      "invalid-features",
      "The reference views could not be checked. Please retry.",
    );
  }
  if (!analysis.consistent)
    throw new StudioError(
      422,
      "views-inconsistent",
      "The generated reference views did not match your photos closely enough, so no model was built. Please retry, ideally with a clearer photo.",
    );
  const available = new Set(viewSet.views.map((v) => v.view));
  return {
    reference: {
      views: viewSet,
      features: analysis.features.filter((f) => available.has(f.view)),
      notes: [...viewNotes, ...analysis.notes]
        .slice(0, 10)
        .map((n) => n.slice(0, 200)),
    },
    images,
    key,
  };
}

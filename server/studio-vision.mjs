import { categoryModule } from "./category-knowledge.mjs";
import { parseHouseDesign } from "../shared/studio.ts";
import { StudioError } from "./supabase.mjs";
export async function interpretStudioPhotos(
  photos,
  { env = process.env, signal, fetcher = fetch } = {},
) {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key)
    throw new StudioError(
      503,
      "provider-configuration",
      "The image service needs its OpenAI key configured on the worker.",
    );
  const category = categoryModule("house"),
    model = env.OPENAI_MODEL?.trim() || "gpt-5.2";
  const effort = env.OPENAI_REASONING_EFFORT || "high";
  if (!["low", "medium", "high"].includes(effort))
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
        AbortSignal.timeout(180000),
      ]),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort },
        max_output_tokens: 12000,
        instructions: category.prompt,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Interpret these ${photos.length} views of the same house. Prioritize distinctive features and report uncertainty. Return the v2 house description.`,
              },
              ...photos.map((image_url) => ({
                type: "input_image",
                image_url,
                detail: "high",
              })),
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "brickmade_house_v2",
            strict: true,
            schema: category.schema,
          },
        },
      }),
    });
  } catch {
    if (signal?.aborted) throw signal.reason || new Error("Cancelled");
    throw new StudioError(
      504,
      "interpretation-timeout",
      "Photo analysis was interrupted. Start a new build with one clear photo; the previous provider request may already have processed.",
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
  let data;
  try {
    data = await response.json();
  } catch {
    throw new StudioError(
      502,
      "provider-output",
      "The image service returned an unreadable response.",
    );
  }
  if (data.status !== "completed")
    throw new StudioError(
      422,
      "interpretation-incomplete",
      "Photo analysis did not finish its description. Try one clearer photo.",
    );
  const content = (data.output || [])
    .filter((m) => m.type === "message" && m.role === "assistant")
    .flatMap((m) => m.content || []);
  if (content.some((c) => c.type === "refusal"))
    throw new StudioError(
      422,
      "interpretation-refused",
      "These photos could not be interpreted. Please choose different house photos.",
    );
  const texts = content.filter((c) => c.type === "output_text");
  let description;
  try {
    if (
      texts.length !== 1 ||
      typeof texts[0].text !== "string" ||
      texts[0].text.length > 14000
    )
      throw Error();
    description = parseHouseDesign(JSON.parse(texts[0].text));
  } catch {
    throw new StudioError(
      502,
      "invalid-description",
      "The AI description was not usable. No model was substituted; please retry with clearer photos.",
    );
  }
  if (description.subject !== "house")
    throw new StudioError(
      422,
      "unsupported-subject",
      "This first category supports houses. These photos could not be represented by the current house construction rules.",
    );
  return { description, model, moduleVersion: category.version };
}

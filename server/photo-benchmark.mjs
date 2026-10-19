import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  parseStudioOptions,
  DEFAULT_STUDIO_OPTIONS,
} from "../shared/studio.ts";
import { validatePhotoRequest } from "./handler.mjs";
import { interpretSculpt, prepareReference } from "./sculpt-pipeline.mjs";
import { sculptSchema, isSculptDesign } from "../shared/sculpt-design.ts";
import { parseDesignDescription } from "../shared/design-description.ts";
import { generateCheckedDesign } from "./generate-design.mjs";
import { compileInThread } from "./job-runner.mjs";
import { categoryModule } from "./category-knowledge.mjs";

export async function prepareBenchmarkPhoto(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 20 * 1024 * 1024) throw Error("photo-size");
  const image = sharp(await readFile(path), {
    limitInputPixels: 40000000,
    animated: false,
  });
  const metadata = await image.metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format) ||
    (metadata.pages || 1) > 1
  )
    throw Error("photo-format");
  // Re-encoding strips EXIF/GPS and matches the app's bounded JPEG input contract.
  let bytes;
  for (const quality of [84, 72, 60, 45]) {
    bytes = await image
      .clone()
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality })
      .toBuffer();
    if (bytes.length <= 716800) break;
  }
  const photo = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  validatePhotoRequest({ version: 1, consent: true, photos: [photo] });
  return { photo, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** All cases are validated before any paid call. No raw photos, paths or provider errors in reports. */
export async function loadBenchmark(path) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.cases) ||
    manifest.cases.length < 1 ||
    manifest.cases.length > 20
  )
    throw Error("invalid-manifest");
  const ids = new Set(),
    cases = [];
  for (const item of manifest.cases) {
    if (
      !/^[a-z0-9_-]{1,48}$/i.test(item.id) ||
      ids.has(item.id) ||
      item.consent !== true ||
      !["owned", "licensed"].includes(item.rights) ||
      typeof item.source !== "string" ||
      !item.source.trim() ||
      !Array.isArray(item.photos) ||
      item.photos.length < 1 ||
      item.photos.length > 3
    )
      throw Error("invalid-case");
    ids.add(item.id);
    const options = parseStudioOptions({
      ...DEFAULT_STUDIO_OPTIONS,
      ...item.options,
      category: item.category,
    });
    if (
      !item.expected ||
      typeof item.expected !== "object" ||
      Array.isArray(item.expected) ||
      Object.keys(item.expected).length > 20 ||
      Object.entries(item.expected).some(
        ([key, value]) =>
          !/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key) ||
          !["string", "boolean", "number"].includes(typeof value) ||
          (typeof value === "number" && !Number.isFinite(value)),
      )
    )
      throw Error("invalid-expectations");
    if (
      Object.keys(item.expected).some(
        (key) =>
          // Expectations name category traits (version 3) or legacy description fields.
          !Object.hasOwn(
            sculptSchema(options.category).properties.traits.properties,
            key,
          ) &&
          !Object.hasOwn(
            categoryModule(options.category).schema.properties,
            key,
          ),
      )
    )
      throw Error("invalid-expectations");
    const photos = [];
    for (const input of item.photos) {
      if (
        typeof input !== "string" ||
        isAbsolute(input) ||
        /[\0\r\n]/.test(input)
      )
        throw Error("invalid-photo-path");
      const file = resolve(dirname(path), input);
      if (!file.startsWith(resolve(dirname(path)) + "/"))
        throw Error("invalid-photo-path");
      photos.push(await prepareBenchmarkPhoto(file));
    }
    cases.push({ id: item.id, options, expected: item.expected, photos });
  }
  return cases;
}

export async function runPhotoBenchmark(
  cases,
  {
    live = false,
    maxCalls = 0,
    env = process.env,
    signal,
    interpret = interpretSculpt,
    reference = prepareReference,
    compile = compileInThread,
    onCase = () => {},
    onModel = async () => {},
  } = {},
) {
  if (
    !Number.isInteger(maxCalls) ||
    maxCalls < 0 ||
    maxCalls > 20 ||
    (live && (maxCalls < cases.length || !env.OPENAI_API_KEY?.trim()))
  )
    throw Error("live-call-configuration");
  const results = [];
  let paidCallsAttempted = 0;
  for (const item of cases) {
    signal?.throwIfAborted();
    const started = performance.now(),
      stages = [];
    const result = {
      id: item.id,
      category: item.options.category,
      options: item.options,
      inputHashes: item.photos.map((p) => p.sha256),
      status: live ? "failed" : "validated-offline",
    };
    if (live) {
      try {
        const at = performance.now();
        paidCallsAttempted++; // Ambiguous requests count; never automatically retry them.
        const analysis = await interpret(
          item.photos.map((p) => p.photo),
          { env, signal, categoryId: item.options.category },
        );
        let description = parseDesignDescription(
          analysis.description,
          item.options.category,
        );
        stages.push({
          stage: "interpreting",
          milliseconds: Math.round(performance.now() - at),
        });
        if (isSculptDesign(description)) {
          // Reference views and feature location are part of the same bounded case.
          const viewsAt = performance.now();
          const prepared = await reference(
            item.photos.map((p) =>
              Buffer.from(p.photo.split(",")[1], "base64"),
            ),
            description,
            { env, signal },
          );
          description = parseDesignDescription(
            { ...description, reference: prepared.reference },
            item.options.category,
          );
          stages.push({
            stage: "reference-views",
            milliseconds: Math.round(performance.now() - viewsAt),
          });
        }
        const checked = await generateCheckedDesign(description, item.options, {
          compile,
          signal,
          onStage: async (stage) =>
            stages.push({
              stage,
              elapsedMilliseconds: Math.round(performance.now() - started),
            }),
        });
        result.status = "digitally-checked";
        result.providerModel = analysis.model;
        result.pieceCount = checked.model.placements.length;
        result.geometrySha256 = createHash("sha256")
          .update(JSON.stringify(checked.model.placements))
          .digest("hex");
        const observed = isSculptDesign(description)
          ? description.traits
          : description;
        result.featureChecks = Object.entries(item.expected).map(
          ([feature, expected]) => ({
            feature,
            expected,
            actual: observed[feature] ?? null,
            passed:
              Object.hasOwn(observed, feature) &&
              observed[feature] === expected,
          }),
        );
        await onModel(item.id, checked.model);
        result.fidelity = checked.fidelity;
        result.repairCount = checked.repairCount;
        result.digitalValidation = checked.validation.status;
        result.humanReview = {
          photoResemblance: "pending",
          physicalFitAndStrength: "pending",
        };
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        result.errorCode = /^[a-z-]{1,60}$/.test(error.code || "")
          ? error.code
          : "benchmark-case-failed";
      }
    }
    result.milliseconds = Math.round(performance.now() - started);
    result.stages = stages;
    results.push(result);
    onCase({
      id: result.id,
      status: result.status,
      errorCode: result.errorCode,
    });
  }
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    mode: live ? "live-provider" : "offline-input-validation",
    paidCallsAttempted,
    results,
    limitations: [
      "Expected-feature comparisons evaluate interpretation, not image likeness.",
      "Silhouette agreement compares the model with AI-drawn reference views, not with the photos themselves; saved renders support the human resemblance review.",
      "Digital assembly checks do not certify physical fit, clutch, balance or strength.",
      "No automatic retry of paid interpretation, including ambiguous failures.",
    ],
  };
}

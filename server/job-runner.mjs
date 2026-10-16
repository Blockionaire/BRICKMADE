import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { supabaseClient, StudioError, digest } from "./supabase.mjs";
import { interpretStudioPhotos } from "./studio-vision.mjs";
import { validatePhotoRequest } from "./handler.mjs";
import { parseStudioOptions } from "../shared/studio.ts";
import {
  parseDesignDescription,
  moduleVersionFor,
} from "../shared/design-description.ts";
import { generateCheckedDesign } from "./generate-design.mjs";
import { parseStudioArtifact } from "../shared/studio-artifact.ts";
import { planDesignScene } from "../shared/design-scene.ts";
export function compileInThread(
  description,
  options,
  signal,
  onChecking = async () => {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || Error("Cancelled"));
    const worker = new Worker(
      new URL("./compile-thread.mjs", import.meta.url),
      {
        workerData: { description, options },
        execArgv: [
          "--import",
          fileURLToPath(new URL("./register.mjs", import.meta.url)),
        ],
      },
    );
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => finish(signal.reason || Error("Cancelled"));
    const timeout = setTimeout(
      () =>
        finish(
          new StudioError(
            504,
            "compile-timeout",
            "The design exceeded the current checking budget. Try a smaller build.",
          ),
        ),
      90000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.on("message", async (message) => {
      if (message.phase === "checking") {
        try {
          await onChecking();
          if (!settled) worker.postMessage({ continue: true });
        } catch (error) {
          finish(error);
        }
      } else if (message.result) finish(null, message.result);
      else
        finish(
          new StudioError(
            500,
            "compiler-error",
            "The design compiler could not complete this design.",
          ),
        );
    });
    worker.on("error", () =>
      finish(
        new StudioError(
          500,
          "compiler-error",
          "The design compiler stopped unexpectedly.",
        ),
      ),
    );
    worker.on("exit", () => {
      if (!settled)
        finish(
          new StudioError(
            500,
            "compiler-error",
            "The design compiler was interrupted.",
          ),
        );
    });
  });
}
export async function runStudioJob(
  job,
  {
    db,
    env = process.env,
    signal = undefined,
    interpret = interpretStudioPhotos,
    compile = compileInThread,
    logger = (e) => console.info(JSON.stringify(e)),
  } = {},
) {
  db ||= supabaseClient({ env });
  const abort = new AbortController(),
    combined = AbortSignal.any([abort.signal, ...(signal ? [signal] : [])]);
  let heartbeatBusy = false,
    artifactPath = null,
    published = false,
    publicationAttempted = false,
    stage = "preparing";
  const step = async (next, progress, checkpoint = {}) => {
    combined.throwIfAborted();
    if (
      !(await db.rpc("bm_job_step", {
        p_job: job.id,
        p_lease: job.lease_token,
        p_stage: next,
        p_progress: progress,
        p_checkpoint: checkpoint,
      }))
    )
      throw new StudioError(
        409,
        "lease-lost",
        "This generation attempt was cancelled or replaced.",
      );
    stage = next;
    logger({
      event: "brickmade.job.stage",
      jobId: job.id,
      stage,
      attempt: job.attempt,
    });
  };
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      if (
        !(await db.rpc("bm_heartbeat", {
          p_job: job.id,
          p_lease: job.lease_token,
          p_seconds: 180,
        }))
      )
        abort.abort(
          new StudioError(
            409,
            "lease-lost",
            "The job was cancelled or its worker lease ended.",
          ),
        );
    } catch {
      abort.abort(
        new StudioError(
          503,
          "heartbeat",
          "The worker lost its connection. Your job will be recovered.",
        ),
      );
    } finally {
      heartbeatBusy = false;
    }
  }, 15000);
  try {
    const options = parseStudioOptions(job.options);
    const moduleVersion = moduleVersionFor(options.category);
    await step("preparing", 5);
    let description,
      providerModel =
        job.checkpoint?.providerModel || env.OPENAI_MODEL || "gpt-5.2";
    if (job.checkpoint?.description)
      description = parseDesignDescription(
        job.checkpoint.description,
        options.category,
      );
    else {
      if (job.checkpoint?.interpretationStarted)
        throw new StudioError(
          409,
          "interpretation-interrupted",
          "A previous photo-analysis call was interrupted before its result was saved. Start a new build; it will not be charged again automatically.",
        );
      const ids = job.input_ids;
      const assets = await db.rows(
        "bm_assets",
        `project_id=eq.${job.project_id}&owner_id=eq.${job.owner_id}&id=in.(${ids.join(",")})&bucket=eq.bm-inputs`,
      );
      if (
        assets.length !== ids.length ||
        assets.some(
          (a) => a.state === "deleted" || Date.parse(a.expires_at) < Date.now(),
        )
      )
        throw new StudioError(
          422,
          "photos-expired",
          "The temporary photos have expired. Please upload them again.",
        );
      const photos = [];
      for (const a of assets) {
        combined.throwIfAborted();
        const bytes = await db.download("bm-inputs", a.path);
        if (bytes.length !== a.bytes || digest(bytes) !== a.sha256)
          throw new StudioError(
            422,
            "photo-checksum",
            "A photo changed during upload. Please upload it again.",
          );
        photos.push(
          `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`,
        );
      }
      validatePhotoRequest({ version: 1, consent: true, photos });
      await step("interpreting", 15, {
        interpretationStarted: true,
        moduleVersion,
      });
      const result = await interpret(photos, {
        env,
        signal: combined,
        categoryId: options.category,
      });
      description = parseDesignDescription(
        result.description,
        options.category,
      );
      providerModel = result.model;
      await step("planning", 40, {
        description,
        providerModel,
        moduleVersion: result.moduleVersion,
        inputHashes: assets.map((a) => a.sha256),
      });
    }
    await step("planning", 40, {
      description,
      providerModel,
      moduleVersion,
      scene: planDesignScene(description, options),
    });
    const result = await generateCheckedDesign(description, options, {
      compile,
      signal: combined,
      onStage: step,
    });
    const repairCount = result.repairCount;
    await step("finalizing", 94, { repairCount });
    const artifact = parseStudioArtifact({
      version: options.category === "house" ? 1 : 2,
      jobId: job.id,
      projectId: job.project_id,
      createdAt: new Date().toISOString(),
      moduleVersion,
      compilerVersion: result.model.revision,
      profileVersion: result.profileVersion,
      description,
      options,
      model: result.model,
      validation: result.validation,
      fidelity: result.fidelity,
      provenance: {
        model: providerModel,
        inputHashes: Array.isArray(job.checkpoint?.inputHashes)
          ? job.checkpoint.inputHashes
          : job.checkpoint?.parent
            ? []
            : (
                await db.rows(
                  "bm_assets",
                  `id=in.(${job.input_ids.join(",")})&owner_id=eq.${job.owner_id}`,
                )
              ).map((a) => a.sha256),
        repairCount,
        ...(job.checkpoint?.parent
          ? { parentJobId: job.checkpoint.parent }
          : {}),
      },
    });
    const bytes = Buffer.from(JSON.stringify(artifact));
    if (bytes.length > 15000000)
      throw new StudioError(
        422,
        "artifact-size",
        "The design is too large for this release.",
      );
    const sha256 = digest(bytes);
    artifactPath = `${job.owner_id}/${job.project_id}/${job.id}/${job.lease_token}.json`;
    await db.insert("bm_assets", {
      id: randomUUID(),
      owner_id: job.owner_id,
      project_id: job.project_id,
      bucket: "bm-designs",
      path: artifactPath,
      mime: "application/json",
      bytes: bytes.length,
      sha256,
    });
    combined.throwIfAborted();
    await db.upload("bm-designs", artifactPath, bytes, "application/json");
    publicationAttempted = true;
    published = await db.rpc("bm_finish_job", {
      p_job: job.id,
      p_lease: job.lease_token,
      p_artifact: {
        path: artifactPath,
        sha256,
        bytes: bytes.length,
        pieceCount: artifact.model.placements.length,
      },
      p_title: description.title,
    });
    if (!published) publicationAttempted = false;
    if (!published)
      throw new StudioError(
        409,
        "lease-lost",
        "The cancelled attempt cannot publish a design.",
      );
    logger({
      event: "brickmade.job.completed",
      jobId: job.id,
      pieces: artifact.model.stats.pieceCount,
      repairCount,
    });
    return artifact;
  } catch (error) {
    const safe =
      error instanceof StudioError
        ? error
        : new StudioError(
            500,
            "generation-error",
            "Generation could not finish this design. Please retry; no demo was substituted.",
          );
    if (signal?.aborted) {
      await db
        .rpc("bm_release_job", { p_job: job.id, p_lease: job.lease_token })
        .catch(() => {});
    } else {
      const current = (
        await db.rows("bm_jobs", `id=eq.${job.id}&limit=1`).catch(() => [])
      )[0];
      if (current?.cancel_requested)
        await db
          .rpc("bm_fail_job", {
            p_job: job.id,
            p_lease: job.lease_token,
            p_code: "cancelled",
            p_message: "Cancelled",
          })
          .catch(() => {});
      else if (!["lease-lost", "heartbeat"].includes(safe.code))
        await db
          .rpc("bm_fail_job", {
            p_job: job.id,
            p_lease: job.lease_token,
            p_code: safe.code,
            p_message: safe.message,
          })
          .catch(() => {});
    }
    logger({
      event: "brickmade.job.stopped",
      jobId: job.id,
      stage,
      code: safe.code,
    });
    return null;
  } finally {
    clearInterval(heartbeat);
    // An uncertain network response may follow a committed publication. Never delete
    // that artifact: the database retention state decides later cleanup safely.
    if (artifactPath && !published && !publicationAttempted)
      await db.remove("bm-designs", [artifactPath]).catch(() => {});
  }
}
export async function cleanupStudioAssets(db) {
  await db.rpc("bm_assistant_cleanup", {});
  const assets = await db.rows(
    "bm_assets",
    `expires_at=lt.${new Date().toISOString()}&state=neq.deleted&limit=100`,
  );
  for (const bucket of ["bm-inputs", "bm-designs"]) {
    const selected = assets.filter((a) => a.bucket === bucket);
    if (!selected.length) continue;
    await db.remove(
      bucket,
      selected.map((a) => a.path),
    );
    for (const a of selected)
      await db.patch("bm_assets", `id=eq.${a.id}&state=neq.published`, {
        state: "deleted",
      });
  }
  return assets.length;
}

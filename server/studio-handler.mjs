import { randomUUID } from "node:crypto";
import { supabaseClient, StudioError, requireId } from "./supabase.mjs";
import { studioSession, clearSession, storeSession } from "./session.mjs";
import { STUDIO_CATEGORIES, parseStudioOptions } from "../shared/studio.ts";
export function publicJob(j) {
  return {
    id: j.id,
    projectId: j.project_id,
    stage: j.stage,
    progress: j.progress,
    attempt: j.attempt,
    createdAt: j.created_at,
    updatedAt: j.updated_at,
    cancelRequested: j.cancel_requested,
    options: j.options,
    error: j.error,
    artifact: j.artifact,
  };
}
async function body(req) {
  const limit = 80000;
  if (Number(req.headers["content-length"]) > limit)
    throw new StudioError(
      413,
      "request-size",
      "Upload photos using their private upload tickets.",
    );
  let text;
  if (req.body !== undefined)
    text = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  else {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit)
        throw new StudioError(413, "request-size", "The request is too large.");
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.byteLength(text) > limit)
    throw new StudioError(413, "request-size", "The request is too large.");
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new StudioError(
      400,
      "invalid-request",
      "The request is invalid. Please try again.",
    );
  }
}
function keys(v, names) {
  if (Object.keys(v).sort().join() !== names.sort().join())
    throw new StudioError(
      400,
      "invalid-request",
      "The request has unexpected fields.",
    );
}
function options(v) {
  try {
    return parseStudioOptions(v);
  } catch {
    throw new StudioError(
      400,
      "invalid-options",
      "Choose a supported category and detail level.",
    );
  }
}
export function makeStudioHandler({
  env = process.env,
  fetcher = fetch,
  logger = (event) => console.info(JSON.stringify(event)),
  dbFactory = supabaseClient,
} = {}) {
  return async (req, res) => {
    const requestId = randomUUID(),
      started = Date.now();
    const path = new URL(req.url, "http://localhost").pathname
      .replace(/^\/api\/studio\/?/, "")
      .split("/")
      .filter(Boolean);
    const action = path[0] || "unknown";
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-BrickMade-Request-Id", requestId);
    const send = (status, payload) => {
      if (res.writableEnded || res.destroyed) return;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    try {
      if (req.method !== "GET") {
        const host = String(req.headers.host || "");
        const local =
          (env.NODE_ENV !== "production" ||
            env.BRICKMADE_LOCAL_SUPABASE === "1") &&
          /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
        const origin = local
          ? `http://${host}`
          : (
              env.BRICKMADE_APP_ORIGIN || "https://brickmade.vercel.app"
            ).replace(/\/$/, "");
        if (req.headers.origin !== origin)
          throw new StudioError(
            403,
            "app-origin",
            "Open BrickMade at its production app address to continue.",
          );
        if (
          !String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        )
          throw new StudioError(415, "content-type", "Send a JSON request.");
      }
      if (action === "config" && req.method === "GET") {
        let configured = true;
        try {
          dbFactory({ env, fetcher });
        } catch {
          configured = false;
        }
        return send(200, {
          version: 1,
          configured,
          categories: STUDIO_CATEGORIES,
          photoRetentionHours: 24,
        });
      }
      const db = dbFactory({ env, fetcher });
      const secure =
        env.NODE_ENV === "production" &&
        !(
          env.BRICKMADE_LOCAL_SUPABASE === "1" &&
          /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(
            String(req.headers.host || ""),
          )
        );
      const user = await studioSession(req, res, db, {
        create: action === "session" && req.method === "POST",
        secure,
      });
      if (action === "session" && ["GET", "POST"].includes(req.method))
        return send(200, {
          version: 1,
          user: { id: user.id, anonymous: user.is_anonymous === true },
        });
      if (action === "session" && req.method === "DELETE") {
        clearSession(res, secure);
        return send(200, { ok: true });
      }
      if (action === "account" && path.length === 2 && req.method === "POST") {
        const v = await body(req),
          email =
            typeof v.email === "string" ? v.email.trim().toLowerCase() : "";
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new StudioError(400, "email", "Enter a valid email address.");
        if (path[1] === "email" || path[1] === "signin") {
          keys(v, ["email"]);
          if (path[1] === "email")
            await db.request("/auth/v1/user", {
              method: "PUT",
              body: { email },
              service: false,
              token: req.studioAccessToken,
            });
          else
            await db.request("/auth/v1/otp", {
              method: "POST",
              body: { email, create_user: false },
              service: false,
            });
          return send(200, { sent: true });
        }
        if (path[1] === "verify") {
          keys(v, ["email", "code", "mode"]);
          if (
            typeof v.code !== "string" ||
            !/^\d{6,10}$/.test(v.code) ||
            !["link", "signin"].includes(v.mode)
          )
            throw new StudioError(
              400,
              "verification",
              "Enter the numeric code from your email.",
            );
          const session = await db.request("/auth/v1/verify", {
            method: "POST",
            body: {
              email,
              token: v.code,
              type: v.mode === "link" ? "email_change" : "email",
            },
            service: false,
          });
          storeSession(res, session, secure);
          return send(200, {
            user: {
              id: session.user.id,
              anonymous: session.user.is_anonymous === true,
            },
          });
        }
      }
      if (action === "projects" && path.length === 1 && req.method === "GET") {
        const projects = await db.rows(
          "bm_projects",
          `owner_id=eq.${requireId(user.id)}&select=id,title,category,created_at,updated_at,bm_jobs(id,stage,progress,options,created_at,artifact)&bm_jobs.order=created_at.desc&bm_jobs.limit=5&order=updated_at.desc&limit=30`,
        );
        return send(200, { projects });
      }
      if (action === "projects" && path.length === 1 && req.method === "POST") {
        const v = await body(req);
        keys(v, ["category", "photos"]);
        if (v.category !== "house")
          throw new StudioError(
            422,
            "category-not-ready",
            "This category is still being developed. House is available first.",
          );
        if (
          !Array.isArray(v.photos) ||
          v.photos.length < 1 ||
          v.photos.length > 3
        )
          throw new StudioError(
            400,
            "photos",
            "Choose one to three house photos.",
          );
        for (const p of v.photos) {
          if (!p || typeof p !== "object")
            throw new StudioError(
              400,
              "photos",
              "One of the photo descriptions is invalid.",
            );
          keys(p, ["bytes", "sha256"]);
          if (
            !Number.isInteger(p.bytes) ||
            p.bytes < 1 ||
            p.bytes > 716800 ||
            typeof p.sha256 !== "string" ||
            !/^[a-f0-9]{64}$/.test(p.sha256)
          )
            throw new StudioError(
              400,
              "photos",
              "One of the photos exceeds the upload limits.",
            );
        }
        const result = await db.rpc("bm_create_project", {
          p_owner: user.id,
          p_category: v.category,
          p_inputs: v.photos,
        });
        const uploads = await Promise.all(
          result.assets.map(async (a) => ({
            id: a.id,
            url: await db.signedUpload("bm-inputs", a.path),
          })),
        );
        return send(201, { projectId: result.project.id, uploads });
      }
      if (
        action === "projects" &&
        path.length === 3 &&
        path[2] === "jobs" &&
        req.method === "GET"
      ) {
        const project = requireId(path[1]);
        const jobs = await db.rows(
          "bm_jobs",
          `project_id=eq.${project}&owner_id=eq.${requireId(user.id)}&order=created_at.desc&limit=50`,
        );
        return send(200, { jobs: jobs.map(publicJob) });
      }
      if (
        action === "projects" &&
        path.length === 3 &&
        ["generate", "variants"].includes(path[2]) &&
        req.method === "POST"
      ) {
        const projectId = requireId(path[1]),
          v = await body(req),
          variant = path[2] === "variants";
        keys(
          v,
          variant
            ? ["parentId", "options", "requestKey"]
            : ["assetIds", "options", "requestKey", "consent"],
        );
        const opts = options(v.options);
        if (opts.category !== "house")
          throw new StudioError(
            422,
            "category-not-ready",
            "This category is not ready yet.",
          );
        if (
          !variant &&
          (v.consent !== true ||
            !Array.isArray(v.assetIds) ||
            v.assetIds.length < 1 ||
            v.assetIds.length > 3)
        )
          throw new StudioError(
            400,
            "consent",
            "Confirm photo processing before generating.",
          );
        const j = await db.rpc("bm_submit_job", {
          p_owner: user.id,
          p_project: projectId,
          p_inputs: variant ? [] : v.assetIds.map(requireId),
          p_options: opts,
          p_request: requireId(v.requestKey),
          p_parent: variant ? requireId(v.parentId) : null,
        });
        return send(202, { job: publicJob(j) });
      }
      if (action === "jobs" && path.length >= 2) {
        const id = requireId(path[1]),
          rows = await db.rows(
            "bm_jobs",
            `id=eq.${id}&owner_id=eq.${requireId(user.id)}&limit=1`,
          ),
          j = rows[0];
        if (!j)
          throw new StudioError(
            404,
            "not-found",
            "This build could not be found in your account.",
          );
        if (path.length === 2 && req.method === "GET")
          return send(200, { job: publicJob(j) });
        if (path[2] === "cancel" && req.method === "POST") {
          await db.rpc("bm_cancel_job", { p_owner: user.id, p_job: id });
          return send(200, { ok: true });
        }
        if (path[2] === "retry" && path.length === 3 && req.method === "POST") {
          if (j.stage !== "failed")
            throw new StudioError(
              409,
              "not-failed",
              "This build is not waiting for a retry.",
            );
          const v = await body(req);
          keys(v, ["options", "requestKey"]);
          const opts = options(v.options);
          const next = await db.rpc("bm_submit_job", {
            p_owner: user.id,
            p_project: j.project_id,
            p_inputs: j.input_ids,
            p_options: opts,
            p_request: requireId(v.requestKey),
            p_parent: j.checkpoint?.description ? j.id : null,
          });
          return send(202, { job: publicJob(next) });
        }
        if (path[2] === "artifact" && req.method === "GET") {
          if (j.stage !== "completed" || !j.artifact)
            throw new StudioError(
              409,
              "not-ready",
              "This build is still being checked.",
            );
          return send(200, {
            url: await db.signedDownload("bm-designs", j.artifact.path),
            sha256: j.artifact.sha256,
            bytes: j.artifact.bytes,
          });
        }
      }
      if (
        action === "projects" &&
        path.length === 3 &&
        path[2] === "progress"
      ) {
        const project = requireId(path[1]);
        if (req.method === "GET") {
          const sha = new URL(req.url, "http://localhost").searchParams.get(
            "sha",
          );
          if (!/^[a-f0-9]{64}$/.test(sha || ""))
            throw new StudioError(
              400,
              "progress",
              "The design reference is invalid.",
            );
          return send(200, {
            progress:
              (
                await db.rows(
                  "bm_progress",
                  `project_id=eq.${project}&owner_id=eq.${user.id}&artifact_sha256=eq.${sha}&limit=1`,
                )
              )[0] || null,
          });
        }
        if (req.method === "POST") {
          const v = await body(req);
          keys(v, ["sha256", "completedIds", "pace", "version"]);
          if (
            !/^[a-f0-9]{64}$/.test(v.sha256) ||
            !Array.isArray(v.completedIds) ||
            v.completedIds.length > 5000 ||
            new Set(v.completedIds).size !== v.completedIds.length ||
            v.completedIds.some(
              (id) => typeof id !== "string" || !/^piece-\d{1,5}$/.test(id),
            ) ||
            !["easy", "medium", "hard"].includes(v.pace) ||
            !Number.isInteger(v.version) ||
            v.version < 0
          )
            throw new StudioError(
              400,
              "progress",
              "The progress update is invalid.",
            );
          return send(200, {
            progress: await db.rpc("bm_save_progress", {
              p_owner: user.id,
              p_project: project,
              p_sha: v.sha256,
              p_ids: v.completedIds,
              p_pace: v.pace,
              p_version: v.version,
            }),
          });
        }
      }
      throw new StudioError(
        404,
        "not-found",
        "This action could not be found.",
      );
    } catch (error) {
      const safe =
        error instanceof StudioError
          ? error
          : new StudioError(
              500,
              "studio-error",
              "This step could not finish. Please retry; your saved builds are safe.",
            );
      logger({
        event: "brickmade.studio.failure",
        requestId,
        action,
        code: safe.code,
        status: safe.status,
        elapsedMs: Date.now() - started,
      });
      return send(safe.status, {
        error: {
          code: safe.code,
          message: safe.message,
          requestId,
          stage: action,
        },
      });
    }
  };
}

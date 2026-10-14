import { timingSafeEqual, createHash } from "node:crypto";
import { interpretPhotos, ServiceError } from "./openai.mjs";
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_PHOTO_BYTES = 700 * 1024;
const rate = new Map();
let active = 0;
function authorized(header, token) {
  if (typeof header !== "string") return false;
  const received = Buffer.from(header),
    expected = Buffer.from(`Bearer ${token}`);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
async function readBody(req) {
  if (Number(req.headers["content-length"]) > MAX_REQUEST_BYTES)
    throw new ServiceError(413, "too-large", "Choose smaller photos.");
  if (req.body !== undefined) {
    const body =
      typeof req.body === "string"
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : JSON.stringify(req.body);
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES)
      throw new ServiceError(413, "too-large", "Choose smaller photos.");
    return JSON.parse(body);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES)
      throw new ServiceError(413, "too-large", "Choose smaller photos.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function validatePhotoRequest(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).sort().join(",") !== "consent,photos,version" ||
    body.version !== 1 ||
    body.consent !== true ||
    !Array.isArray(body.photos) ||
    body.photos.length < 1 ||
    body.photos.length > 3
  )
    throw new ServiceError(
      400,
      "invalid-request",
      "Explicit photo consent and one to three photos are required.",
    );
  for (const photo of body.photos) {
    if (
      typeof photo !== "string" ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo) ||
      photo.length > (MAX_PHOTO_BYTES * 4) / 3 + 40
    )
      throw new ServiceError(
        400,
        "invalid-photo",
        "Use resized JPG photos from the app.",
      );
    const encoded = photo.slice(photo.indexOf(",") + 1),
      bytes = Buffer.from(encoded, "base64");
    if (
      bytes.length > MAX_PHOTO_BYTES ||
      bytes.length < 40 ||
      bytes.toString("base64") !== encoded ||
      bytes.readUInt16BE(0) !== 0xffd8 ||
      bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
    )
      throw new ServiceError(
        400,
        "invalid-photo",
        "One of the photos is not a supported JPG.",
      );
    // Bound dimensions before forwarding compressed content. Remote URLs/SVGs are never fetched.
    let offset = 2,
      found = false;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        const h = bytes.readUInt16BE(offset + 5),
          w = bytes.readUInt16BE(offset + 7);
        found = h > 0 && w > 0 && h <= 1600 && w <= 1600;
        break;
      }
      offset += length + 2;
    }
    if (!found)
      throw new ServiceError(
        400,
        "invalid-photo",
        "Resize photos to at most 1600 pixels before interpreting them.",
      );
  }
  return body.photos;
}
/** Shared Node/Vercel handler. Credentials and raw provider errors never reach the browser. */
export function makeHandler({
  env = process.env,
  fetcher = fetch,
  now = Date.now,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Origin");
    const origins = (
      env.BRICKMADE_ALLOWED_ORIGINS || "https://blockionaire.github.io"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const origin = req.headers.origin;
    const send = (status, payload) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (origin && !origins.includes(origin))
      return send(403, {
        error: {
          code: "origin",
          message: "This app origin is not allowed by the AI service.",
        },
      });
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    const path = new URL(req.url, "http://localhost").pathname;
    if (!["/api/status", "/api/analyze"].includes(path))
      return send(404, {
        error: { code: "not-found", message: "Unknown endpoint." },
      });
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.writeHead(204);
      return res.end();
    }
    if (
      (path === "/api/status" && req.method !== "GET") ||
      (path === "/api/analyze" && req.method !== "POST")
    ) {
      res.setHeader(
        "Allow",
        path === "/api/status" ? "GET, OPTIONS" : "POST, OPTIONS",
      );
      return send(405, {
        error: { code: "method", message: "This method is not supported." },
      });
    }
    const token = (env.BRICKMADE_ACCESS_TOKEN || "").trim();
    const providerKey = (env.OPENAI_API_KEY || "").trim();
    if (token.length < 24 || !providerKey)
      return send(503, {
        error: {
          code: "not-configured",
          message: "The private AI service is not configured yet.",
        },
      });
    if (!authorized(req.headers.authorization, token))
      return send(401, {
        error: {
          code: "access",
          message: "The private test code is incorrect or expired.",
        },
      });
    const model = env.OPENAI_MODEL?.trim() || "gpt-5.2";
    if (path === "/api/status")
      return send(200, {
        version: 1,
        ready: true,
        model,
        scope: "simple-houses",
        storesPhotos: false,
      });
    if (
      (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase() !==
      "application/json"
    )
      return send(415, {
        error: {
          code: "content-type",
          message: "Send photos as an app JSON request.",
        },
      });
    let acquired = false;
    try {
      const body = await readBody(req),
        photos = validatePhotoRequest(body);
      const key = createHash("sha256").update(token).digest("hex"),
        timestamp = now();
      for (const [k, v] of rate)
        if (timestamp - v.start >= 3600000) rate.delete(k);
      const used = rate.get(key) || { start: timestamp, count: 0 };
      if (used.count >= 12 || active >= 2) {
        res.setHeader(
          "Retry-After",
          String(
            active >= 2
              ? 30
              : Math.max(
                  1,
                  Math.ceil((used.start + 3600000 - timestamp) / 1000),
                ),
          ),
        );
        throw new ServiceError(
          429,
          "test-limit",
          "The private service is at its test limit. Try again later.",
        );
      }
      used.count++;
      rate.set(key, used);
      active++;
      acquired = true;
      const abort = new AbortController();
      const cancel = () => abort.abort();
      req.once("aborted", cancel);
      const closed = () => {
        if (!res.writableEnded) abort.abort();
      };
      res.once("close", closed);
      const timeout = setTimeout(cancel, 55000);
      try {
        const brief = await interpretPhotos(photos, {
          key: providerKey,
          model,
          fetcher,
          signal: abort.signal,
        });
        send(200, { version: 1, brief });
      } finally {
        clearTimeout(timeout);
        req.off("aborted", cancel);
        res.off("close", closed);
      }
    } catch (error) {
      if (error instanceof ServiceError)
        send(error.status, {
          error: { code: error.code, message: error.message },
        });
      else if (error instanceof SyntaxError)
        send(400, {
          error: {
            code: "invalid-json",
            message: "The request is not valid JSON.",
          },
        });
      else
        send(500, {
          error: {
            code: "internal",
            message: "The private AI service could not complete this request.",
          },
        });
    } finally {
      if (acquired) active--;
    }
  };
}

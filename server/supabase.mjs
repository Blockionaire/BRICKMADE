import { createHash } from "node:crypto";
export class StudioError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function cloudConfig(env = process.env) {
  const raw = env.SUPABASE_URL?.trim();
  const publicKey = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "").trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!raw || !publicKey || !serviceKey) throw new StudioError(503, "cloud-not-configured", "Cloud generation is being connected. You can explore the local demo collection meanwhile.");
  let url;
  try { url = new URL(raw); } catch { throw new StudioError(503, "cloud-configuration", "The server's Supabase project address needs checking."); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new StudioError(503, "cloud-configuration", "Use the Supabase HTTPS project root on the server.");
  return { url: url.origin, publicKey, serviceKey };
}
export function supabaseClient({ env = process.env, fetcher = fetch } = {}) {
  const config = cloudConfig(env);
  async function request(path, { method = "GET", body, token, service = true, headers = {}, binary = false, timeout = 20000 } = {}) {
    let response;
    try {
      response = await fetcher(config.url + path, {
        method,
        headers: { apikey: service ? config.serviceKey : config.publicKey, Authorization: `Bearer ${token || (service ? config.serviceKey : config.publicKey)}`, ...(body !== undefined && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}), ...headers },
        ...(body !== undefined ? { body: body instanceof Uint8Array ? body : JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeout),
      });
    } catch { throw new StudioError(503, "cloud-unreachable", "Cloud storage could not be reached. Please retry shortly."); }
    if (!response.ok) {
      let data = {}; try { data = await response.json(); } catch { /* Never echo provider bodies. */ }
      const known = String(data.message || "");
      const codes = { "daily-limit": [429,"daily-limit","Today's private generation limit has been reached."], "active-limit": [429,"active-limit","You already have two builds in progress. Finish or cancel one first."], "not-found": [404,"not-found","This build could not be found."], "progress-conflict": [409,"progress-conflict","Progress changed in another tab. Reload before saving again."], "invalid-inputs": [400,"invalid-inputs","The selected photos have expired or do not belong to this build. Please upload them again."] };
      if (codes[known]) throw new StudioError(...codes[known]);
      const authCode=data.error_code||data.code;
      if(["otp_expired","validation_failed"].includes(authCode))throw new StudioError(400,"verification-code","The code is incorrect or expired. Request a new code and try again.");
      if(["over_email_send_rate_limit","over_request_rate_limit"].includes(authCode))throw new StudioError(429,"email-limit","Please wait before requesting another email code.");
      if(["email_exists","user_already_exists"].includes(authCode))throw new StudioError(409,"email-link","This address could not be linked to your guest collection. Try signing in instead.");
      if (data.error_code === "anonymous_provider_disabled" || data.code === "anonymous_provider_disabled") throw new StudioError(503,"anonymous-auth","Enable anonymous sign-ins in the Supabase project to start building.");
      if (service && [401,403].includes(response.status)) throw new StudioError(503,"cloud-configuration","The server's Supabase service key needs checking.");
      if ([401,403].includes(response.status) || ["refresh_token_not_found","refresh_token_already_used","bad_jwt","session_not_found"].includes(data.error_code || data.code)) throw new StudioError(401,"session-expired","Your session has expired. Reconnect to continue.");
      throw new StudioError(503,"cloud-operation","The cloud operation could not finish. Please retry; existing builds are safe.");
    }
    if (binary) return new Uint8Array(await response.arrayBuffer());
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const objectPath = (bucket, path) => `${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  return {
    config, request,
    rpc: async (name, args) => {
      const value=await request(`/rest/v1/rpc/${name}`, { method: "POST", body: args });
      // Every RPC in this app returns one scalar/composite, never a set of rows.
      return Array.isArray(value)?value[0]||null:value;
    },
    rows: (table, query = "") => request(`/rest/v1/${table}?${query}`),
    insert: async (table, body) => (await request(`/rest/v1/${table}`, { method: "POST", body, headers: { Prefer: "return=representation" } }))[0],
    patch: (table, query, body) => request(`/rest/v1/${table}?${query}`, { method: "PATCH", body, headers: { Prefer: "return=representation" } }),
    download: (bucket, path) => request(`/storage/v1/object/authenticated/${objectPath(bucket, path)}`, { binary: true }),
    upload: (bucket, path, bytes, mime) => request(`/storage/v1/object/${objectPath(bucket,path)}`, { method: "POST", body: bytes, headers: { "Content-Type": mime, "x-upsert": "false" } }),
    signedUpload: async (bucket, path) => {
      const data = await request(`/storage/v1/object/upload/sign/${objectPath(bucket,path)}`, { method: "POST", body: {} });
      const relative = data.url || data.signedURL || data.signedUrl;
      if (typeof relative !== "string" || !relative.startsWith("/object/upload/sign/")) throw new StudioError(503,"upload-ticket","An upload ticket could not be prepared.");
      return config.url + "/storage/v1" + relative;
    },
    signedDownload: async (bucket,path) => {
      const data = await request(`/storage/v1/object/sign/${objectPath(bucket,path)}`, { method: "POST", body: { expiresIn: 120 } });
      const relative = data.signedURL || data.signedUrl;
      if (typeof relative !== "string" || !relative.startsWith("/object/sign/")) throw new StudioError(503,"artifact-ticket","The saved design could not be opened.");
      return config.url + "/storage/v1" + relative;
    },
    remove: (bucket, paths) => request(`/storage/v1/object/${encodeURIComponent(bucket)}`, { method: "DELETE", body: { prefixes: paths } }),
  };
}
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function requireId(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw new StudioError(400,"invalid-id","The build address is invalid.");
  return value;
}

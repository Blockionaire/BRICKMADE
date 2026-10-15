import { StudioError } from "./supabase.mjs";
const verified = new Map();
const ACCESS = "bm_access",
  REFRESH = "bm_refresh";
function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((s) => {
        const index = s.indexOf("=");
        return index < 0 ? [] : [s.slice(0, index).trim(), s.slice(index + 1)];
      })
      .filter((v) => v.length === 2),
  );
}
export function storeSession(res, session, secure) {
  if (!session?.access_token || !session.refresh_token)
    throw new StudioError(
      503,
      "session-response",
      "Your private session could not be established.",
    );
  const flags = `; HttpOnly; SameSite=Lax; Path=/api/studio${secure ? "; Secure" : ""}`;
  res.setHeader("Set-Cookie", [
    `${ACCESS}=${session.access_token}; Max-Age=${Math.max(60, Math.min(3600, session.expires_in || 3600))}${flags}`,
    `${REFRESH}=${session.refresh_token}; Max-Age=2592000${flags}`,
  ]);
}
export async function studioSession(
  req,
  res,
  db,
  { create = false, secure = true } = {},
) {
  const saved = cookies(req);
  let token = saved[ACCESS];
  if (token) {
    const cached = verified.get(token);
    if (cached && cached.until > Date.now()) {
      req.studioAccessToken = token;
      return cached.user;
    }
    try {
      const user = await db.request("/auth/v1/user", { service: false, token });
      if (typeof user?.id === "string") {
        if (verified.size > 1000) verified.clear();
        verified.set(token, { until: Date.now() + 10000, user });
        req.studioAccessToken = token;
        return user;
      }
    } catch (e) {
      if (!(e instanceof StudioError) || e.status !== 401) throw e;
    }
  }
  if (saved[REFRESH]) {
    try {
      const session = await db.request(
        "/auth/v1/token?grant_type=refresh_token",
        {
          method: "POST",
          body: { refresh_token: saved[REFRESH] },
          service: false,
        },
      );
      storeSession(res, session, secure);
      req.studioAccessToken = session.access_token;
      return session.user;
    } catch (e) {
      if (!(e instanceof StudioError) || e.status !== 401) throw e;
    }
  }
  if (!create)
    throw new StudioError(
      401,
      "session-required",
      "Start a private session to open your cloud builds.",
    );
  const session = await db.request("/auth/v1/signup", {
    method: "POST",
    body: {},
    service: false,
  });
  storeSession(res, session, secure);
  req.studioAccessToken = session.access_token;
  if (!session.user?.id)
    throw new StudioError(
      503,
      "anonymous-auth",
      "Enable anonymous sign-ins in the Supabase project to start building.",
    );
  return session.user;
}
export function clearSession(res, secure = true) {
  res.setHeader(
    "Set-Cookie",
    [ACCESS, REFRESH].map(
      (name) =>
        `${name}=; Max-Age=0; Path=/api/studio; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
    ),
  );
}

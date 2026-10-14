import { parseHouseBrief, type HouseBrief } from "../../shared/house-brief";
export interface AiConnection {
  endpoint: string;
  accessCode: string;
}
const CONNECTION_KEY = "brickmade.private-ai.connection.v1";
export function validateAiConnection(value: AiConnection): AiConnection {
  if (
    /sk-[A-Za-z0-9_-]/.test(value.accessCode) ||
    /sk-[A-Za-z0-9_-]/.test(value.endpoint)
  )
    throw Error(
      "Keep your OpenAI key in Vercel. Enter the separate private test code here.",
    );
  let url: URL;
  try {
    url = new URL(value.endpoint.trim());
  } catch {
    throw Error("Enter the full HTTPS address of your private Vercel service.");
  }
  const local =
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    throw Error(
      "Use your service's HTTPS root address, without a path or credentials.",
    );
  if (value.accessCode.trim().length < 24 || value.accessCode.length > 256)
    throw Error(
      "Enter the private test code configured on your Vercel service.",
    );
  return { endpoint: url.origin, accessCode: value.accessCode.trim() };
}
export function readAiConnection(): AiConnection | null {
  try {
    const raw = sessionStorage.getItem(CONNECTION_KEY);
    return raw ? validateAiConnection(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function saveAiConnection(value: AiConnection) {
  const connection = validateAiConnection(value);
  try {
    sessionStorage.setItem(CONNECTION_KEY, JSON.stringify(connection));
  } catch {
    throw Error(
      "This browser cannot save the connection for this tab. Enable session storage to use photo interpretation.",
    );
  }
}
export function clearAiConnection() {
  try {
    sessionStorage.removeItem(CONNECTION_KEY);
  } catch {}
}
async function request(
  connection: AiConnection,
  path: string,
  signal: AbortSignal,
  body?: unknown,
) {
  const checked = validateAiConnection(connection);
  let response: Response;
  try {
    response = await fetch(`${checked.endpoint}${path}`, {
      method: body ? "POST" : "GET",
      signal,
      cache: "no-store",
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${checked.accessCode}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    throw Error(
      "The private AI service could not be reached. Check its address and allowed app origin.",
      { cause: error },
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error(
      "The service returned an invalid response. Check your Vercel deployment.",
    );
  }
  if (!response.ok) {
    // Do not echo arbitrary server strings or credentials into UI errors.
    const messages: Record<string, string> = {
      access: "The private test code is incorrect or expired.",
      "not-configured":
        "Add the OpenAI key and private test code to Vercel, then redeploy the service.",
      "provider-configuration":
        "Check the OpenAI key and vision model in your Vercel environment variables.",
      "provider-limit":
        "The OpenAI service is at its limit. Check your OpenAI project limits and try later.",
      "test-limit":
        "The private service is at its test limit. Try again later.",
      timeout:
        "Photo interpretation timed out. Try again with clearer or fewer photos.",
      refused:
        "These photos could not be interpreted. Choose different photos or describe the house manually.",
      incomplete:
        "The interpretation was incomplete. Try clearer photos or fewer views.",
    };
    throw Error(
      messages[data?.error?.code] ??
        "Photo interpretation failed. No design was generated; please retry or use the manual house studio.",
    );
  }
  return data;
}
export async function checkAiConnection(
  connection: AiConnection,
  signal: AbortSignal,
) {
  const status = await request(connection, "/api/status", signal);
  if (
    status.version !== 1 ||
    status.ready !== true ||
    status.scope !== "simple-houses" ||
    status.storesPhotos !== false
  )
    throw Error(
      "This service does not support the current private photo workflow.",
    );
  return true;
}
/** Resize, re-encode and strip source metadata before any network request. */
export async function preparePhoto(
  url: string,
  signal: AbortSignal,
): Promise<string> {
  if (!url.startsWith("blob:"))
    throw Error(
      "Choose your own photos; illustrated demo views cannot be analyzed.",
    );
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const blob = await fetch(url, { signal }).then((r) => r.blob());
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  try {
    if (
      !bitmap.width ||
      !bitmap.height ||
      bitmap.width * bitmap.height > 60000000
    )
      throw Error(
        "This photo is too large to process safely. Choose a smaller image.",
      );
    let longest = 1280;
    for (
      let attempt = 0;
      attempt < 4;
      attempt++, longest = Math.round(longest * 0.75)
    ) {
      const factor = Math.min(
        1,
        longest / Math.max(bitmap.width, bitmap.height),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * factor));
      canvas.height = Math.max(1, Math.round(bitmap.height * factor));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("This browser could not prepare the photos.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL("image/jpeg", 0.82);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      if (encoded.length <= (700 * 1024 * 4) / 3) return encoded;
    }
    throw Error(
      "This photo could not be reduced enough. Choose a smaller image.",
    );
  } finally {
    bitmap.close();
  }
}
export async function analyzePhotos(
  urls: string[],
  connection: AiConnection,
  consent: boolean,
  signal: AbortSignal,
): Promise<HouseBrief> {
  if (!consent)
    throw Error("Confirm photo sharing before interpreting images.");
  if (urls.length < 1 || urls.length > 3)
    throw Error("Choose one to three real photos.");
  const photos = [];
  // Sequential encoding bounds memory on phones.
  for (const url of urls) photos.push(await preparePhoto(url, signal));
  const data = await request(connection, "/api/analyze", signal, {
    version: 1,
    consent: true,
    photos,
  });
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (data.version !== 1) throw Error("The AI service needs updating.");
  const brief = parseHouseBrief(data.brief);
  if (brief.subject !== "house")
    throw Error(
      `This first photo workflow supports simple houses. Choose house photos, or describe a house manually.`,
    );
  return brief;
}

import { preparePhoto } from "./photo-interpretation";
import {
  parseStudioArtifact,
  type StudioArtifact,
} from "../../shared/studio-artifact";
import type { StudioJob, StudioOptions } from "../../shared/studio";
export class StudioClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
export async function studioRequest<T>(
  path: string,
  {
    method = "GET",
    body,
    signal,
    timeout = 30000,
  }: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    timeout?: number;
  } = {},
): Promise<T> {
  // GitHub Pages has no server routes. Report that capability explicitly.
  if (path === "config" && process.env.NEXT_PUBLIC_BASE_PATH)
    return { version: 1, configured: false } as T;
  let response: Response;
  try {
    response = await fetch(`/api/studio/${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(timeout),
      ]),
    });
  } catch {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw new StudioClientError(
      "The connection was interrupted. Your queued build can continue; try opening it again.",
      "network",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new StudioClientError(
      "This deployment could not return a studio response. Please retry shortly.",
      "deployment",
    );
  }
  if (!response.ok) {
    if (response.status === 401) resetStudioSession();
    throw new StudioClientError(
      data.error?.message || "This step could not finish.",
      data.error?.code || "request",
      data.error?.requestId,
    );
  }
  return data;
}
export function resetStudioSession() {
  session = null;
}
let session: Promise<{
  version: 1;
  user: { id: string; anonymous: boolean };
}> | null = null;
export function ensureStudioSession(signal?: AbortSignal) {
  if (!session) {
    const start = () =>
      studioRequest<{ version: 1; user: { id: string; anonymous: boolean } }>(
        "session",
        { method: "POST", body: {} },
      );
    session = (
      typeof navigator !== "undefined" && navigator.locks
        ? Promise.resolve(
            navigator.locks.request(
              "brickmade-private-session",
              async () => await start(),
            ),
          ).then(async (value) => await value)
        : start()
    ).catch((e) => {
      session = null;
      throw e;
    });
  }
  return session!.then((value) => {
    signal?.throwIfAborted();
    return value;
  });
}
export async function preparedStudioPhoto(url: string, signal: AbortSignal) {
  const data = await preparePhoto(url, signal),
    raw = atob(data.slice(data.indexOf(",") + 1)),
    bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return {
    bytes,
    sha256: Array.from(new Uint8Array(hash), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
export async function uploadStudioPhoto(
  url: string,
  bytes: Uint8Array,
  signal: AbortSignal,
) {
  const parsed = new URL(url);
  const local =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    parsed.hostname === window.location.hostname &&
    parsed.protocol === "http:";
  if (
    (parsed.protocol !== "https:" && !local) ||
    !parsed.pathname.startsWith("/storage/v1/object/upload/sign/")
  )
    throw new StudioClientError(
      "The private upload address was invalid.",
      "upload-ticket",
    );
  const response = await fetch(url, {
    method: "PUT",
    body: bytes as Uint8Array<ArrayBuffer>,
    headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
    credentials: "omit",
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) resetStudioSession();
    throw new StudioClientError(
      "A photo did not finish uploading. Please retry.",
      "upload",
    );
  }
}
export async function loadStudioArtifact(
  jobId: string,
  signal?: AbortSignal,
): Promise<{ artifact: StudioArtifact; sha256: string }> {
  const ticket = await studioRequest<{
    url: string;
    sha256: string;
    bytes: number;
  }>(`jobs/${encodeURIComponent(jobId)}/artifact`, { signal });
  const url = new URL(ticket.url);
  const local =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    url.hostname === window.location.hostname &&
    url.protocol === "http:";
  if (
    (url.protocol !== "https:" && !local) ||
    !url.pathname.startsWith("/storage/v1/object/sign/") ||
    !Number.isInteger(ticket.bytes) ||
    ticket.bytes < 1 ||
    ticket.bytes > 15000000 ||
    !/^[a-f0-9]{64}$/.test(ticket.sha256)
  )
    throw Error("The saved design address is invalid.");
  const response = await fetch(ticket.url, { signal, credentials: "omit" });
  if (!response.ok) throw Error("The saved design could not be downloaded.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== ticket.bytes)
    throw Error("The saved design download is incomplete.");
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== ticket.sha256)
    throw Error("The saved design checksum did not match. Please reload.");
  const artifact = parseStudioArtifact(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  if (artifact.jobId !== jobId)
    throw Error("The saved design does not belong to this job.");
  return { artifact, sha256: hash };
}
export interface PendingStudioSubmission {
  ownerId: string;
  projectId: string;
  assetIds: string[];
  requestKey: string;
  options: StudioOptions;
  signature: string;
}
const PENDING = "brickmade.studio.pending.v1";
export function readPendingSubmission(): PendingStudioSubmission | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(PENDING) || "null");
    return v &&
      typeof v.ownerId === "string" &&
      typeof v.projectId === "string" &&
      Array.isArray(v.assetIds) &&
      typeof v.requestKey === "string" &&
      v.options
      ? v
      : null;
  } catch {
    return null;
  }
}
export function storePendingSubmission(v: PendingStudioSubmission | null) {
  try {
    if (v) sessionStorage.setItem(PENDING, JSON.stringify(v));
    else sessionStorage.removeItem(PENDING);
  } catch {
    /* The server still deduplicates this in-memory request key. */
  }
}
export function recordStudioJob(job: StudioJob) {
  try {
    localStorage.setItem("brickmade.studio.latest.v1", job.id);
  } catch {}
}

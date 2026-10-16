import { cloudConfig, supabaseClient, StudioError } from "./supabase.mjs";
import { DEFAULT_STUDIO_OPTIONS, STUDIO_CATEGORIES } from "../shared/studio.ts";

/** Read-only operational checks. Does not create users/jobs or call OpenAI. */
export async function inspectStudio({
  env = process.env,
  dbFactory = supabaseClient,
  fetcher = fetch,
} = {}) {
  const checks = [];
  const add = (name, status, code, detail) =>
    checks.push({ name, status, code, detail });
  let db;
  try {
    cloudConfig(env);
    db = dbFactory({ env, fetcher });
    add(
      "configuration",
      "passed",
      "configured",
      "Server-side Supabase settings are present.",
    );
  } catch {
    add(
      "configuration",
      "failed",
      "cloud-not-configured",
      "Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY), and SUPABASE_SERVICE_ROLE_KEY in this process.",
    );
    return { version: 1, ready: false, checks, paidCallsMade: false };
  }
  const tasks = [
    [
      "authentication",
      async () => {
        const settings = await db.request("/auth/v1/settings", {
          service: false,
        });
        if (
          settings.external?.anonymous_users !== true ||
          settings.disable_signup === true
        ) {
          add(
            "authentication",
            "failed",
            "guest-auth",
            "Guest sign-ins are unavailable. Complete the shared-project policy review before enabling them.",
          );
        } else
          add(
            "authentication",
            "passed",
            "guest-auth-enabled",
            "Guest sign-in is enabled; existing-app policies still need their independent review.",
          );
      },
    ],
    [
      "database",
      async () => {
        if (
          (await db.rpc("bm_valid_options", { v: DEFAULT_STUDIO_OPTIONS })) !==
          true
        )
          throw Error();
        await db.rows("bm_projects", "select=id&limit=0");
        add(
          "database",
          "passed",
          "schema-ready",
          "The brickmade schema and core RPC are reachable.",
        );
      },
    ],
    ...["bm-inputs", "bm-designs"].map((bucket) => [
      bucket,
      async () => {
        const b = await db.request(`/storage/v1/bucket/${bucket}`);
        const mime = bucket === "bm-inputs" ? "image/jpeg" : "application/json";
        const limit = bucket === "bm-inputs" ? 716800 : 15000000;
        if (
          b.public !== false ||
          b.file_size_limit !== limit ||
          !Array.isArray(b.allowed_mime_types) ||
          !b.allowed_mime_types.includes(mime)
        ) {
          add(
            bucket,
            "failed",
            "bucket-configuration",
            "Keep this bucket private with the migration's file-size and MIME limits.",
          );
        } else
          add(
            bucket,
            "passed",
            "private-storage",
            "The private bucket and upload limits are configured.",
          );
      },
    ]),
    [
      "worker",
      async () => {
        const health = await db.rpc("bm_worker_health", {});
        if (!(health?.online > 0))
          add(
            "worker",
            "failed",
            "worker-offline",
            "Start npm run worker against this same project. No fresh worker heartbeat was found.",
          );
        else if (
          !(health.visionConfigured > 0) ||
          !STUDIO_CATEGORIES.filter((c) => c.available).every((c) =>
            health.categories?.includes(c.id),
          )
        )
          add(
            "worker",
            "failed",
            "worker-provider",
            "A worker is online but the pool lacks image-service configuration or an enabled category capability. Deploy the current worker release.",
          );
        else
          add(
            "worker",
            "passed",
            "worker-online",
            "A recent worker advertises image-service configuration. This does not verify its OpenAI key or model with a paid call.",
          );
      },
    ],
  ];
  const results = await Promise.allSettled(tasks.map(([, check]) => check()));
  results.forEach((result, i) => {
    if (result.status === "rejected")
      add(
        tasks[i][0],
        "failed",
        result.reason instanceof StudioError
          ? result.reason.code
          : "check-failed",
        "The check could not finish. Verify the migration, schema exposure, credentials and service connectivity.",
      );
  });
  checks.sort((a, b) => a.name.localeCompare(b.name));
  return {
    version: 1,
    ready: checks.every((c) => c.status === "passed"),
    checks,
    paidCallsMade: false,
  };
}

// Explicit CI-only provider fixture. Auth, Storage, queue, compiler and checks are real.
import { setTimeout as pause } from "node:timers/promises";
import { supabaseClient } from "../../server/supabase.mjs";
import { runStudioJob } from "../../server/job-runner.mjs";
import { HOUSE_EXAMPLE, HOUSE_MODULE_VERSION } from "../../shared/studio.ts";
if (
  process.env.STUDIO_FULL_STACK !== "1" ||
  !process.env.SUPABASE_URL?.startsWith("http://127.0.0.1:")
)
  throw Error("Fixture worker requires isolated loopback Supabase");
const db = supabaseClient();
const abort = new AbortController();
for (const s of ["SIGTERM", "SIGINT"]) process.on(s, () => abort.abort());
while (!abort.signal.aborted) {
  const job = await db.rpc("bm_claim_job", {
    p_worker: "explicit-ci-fixture",
    p_seconds: 180,
  });
  if (job?.id)
    await runStudioJob(job, {
      db,
      signal: abort.signal,
      interpret: async () => {
        await pause(4000, null, { signal: abort.signal });
        return {
          description: HOUSE_EXAMPLE,
          model: "explicit-ci-photo-fixture",
          moduleVersion: HOUSE_MODULE_VERSION,
        };
      },
    });
  else await pause(500, null, { signal: abort.signal }).catch(() => {});
}

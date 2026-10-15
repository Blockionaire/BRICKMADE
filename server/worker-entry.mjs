import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { supabaseClient } from "./supabase.mjs";
import { runStudioJob, cleanupStudioAssets } from "./job-runner.mjs";
const db = supabaseClient(),
  id = `worker-${randomUUID()}`,
  abort = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => abort.abort());
let cleanupAt = 0;
console.info(
  JSON.stringify({ event: "brickmade.worker.started", workerId: id }),
);
while (!abort.signal.aborted) {
  try {
    if (Date.now() > cleanupAt) {
      await cleanupStudioAssets(db);
      cleanupAt = Date.now() + 600000;
    }
    const job = await db.rpc("bm_claim_job", { p_worker: id, p_seconds: 180 });
    if (job?.id) await runStudioJob(job, { db, signal: abort.signal });
    else await pause(2000, null, { signal: abort.signal });
  } catch {
    if (!abort.signal.aborted) {
      console.warn(
        JSON.stringify({
          event: "brickmade.worker.waiting",
          code: "cloud-unavailable",
        }),
      );
      await pause(5000, null, { signal: abort.signal }).catch(() => {});
    }
  }
}
console.info(
  JSON.stringify({ event: "brickmade.worker.stopped", workerId: id }),
);

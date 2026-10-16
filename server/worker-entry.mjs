import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { supabaseClient } from "./supabase.mjs";
import { runStudioJob, cleanupStudioAssets } from "./job-runner.mjs";
import { workerPresence } from "./worker-presence.mjs";
const db = supabaseClient(),
  id = `worker-${randomUUID()}`,
  abort = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => abort.abort());
let cleanupAt = 0;
const presence = workerPresence(db, id, {
  logger: (event) => console.info(JSON.stringify(event)),
});
await presence.start();
console.info(
  JSON.stringify({ event: "brickmade.worker.started", workerId: id }),
);
while (!abort.signal.aborted) {
  try {
    if (Date.now() > cleanupAt) {
      await cleanupStudioAssets(db);
      cleanupAt = Date.now() + 600000;
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      await pause(5000, null, { signal: abort.signal });
      continue;
    }
    const job = await db.rpc("bm_claim_job", { p_worker: id, p_seconds: 180 });
    if (job?.id) {
      await presence.working(job.id);
      try {
        await runStudioJob(job, { db, signal: abort.signal });
      } finally {
        await presence.idle();
      }
    } else await pause(2000, null, { signal: abort.signal });
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
await presence.stop();
console.info(
  JSON.stringify({ event: "brickmade.worker.stopped", workerId: id }),
);

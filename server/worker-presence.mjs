import { STUDIO_CATEGORIES } from "../shared/studio.ts";
export const WORKER_RUNTIME = "2026-10-16.studio-v3";
export function workerPresence(
  db,
  id,
  { env = process.env, logger = () => {}, interval = 20000 } = {},
) {
  let state = "idle",
    job = null,
    pending;
  async function report() {
    if (pending) return pending;
    pending = (async () => {
      try {
        await db.rpc("bm_report_worker", {
          p_worker: id,
          p_state: state,
          p_job: job,
          p_version: WORKER_RUNTIME,
          p_categories: STUDIO_CATEGORIES.filter((c) => c.available).map(
            (c) => c.id,
          ),
          p_vision: Boolean(env.OPENAI_API_KEY?.trim()),
        });
      } catch {
        logger({
          event: "brickmade.worker.health",
          code: "presence-unavailable",
        });
      }
    })().finally(() => {
      pending = null;
    });
    return pending;
  }
  const timer = setInterval(() => void report(), interval);
  timer.unref();
  return {
    async start() {
      await report();
    },
    async working(id) {
      await pending;
      state = "working";
      job = id;
      await report();
    },
    async idle() {
      await pending;
      state = "idle";
      job = null;
      await report();
    },
    async stop() {
      clearInterval(timer);
      await pending;
      state = "stopped";
      job = null;
      await report();
    },
  };
}

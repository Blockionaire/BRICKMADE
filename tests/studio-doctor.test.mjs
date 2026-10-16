import { describe, it, expect, vi } from "vitest";
import { inspectStudio } from "../server/studio-doctor.mjs";
import { workerPresence } from "../server/worker-presence.mjs";
const env = {
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-fixture",
  SUPABASE_SERVICE_ROLE_KEY: "private-fixture",
};
function fixture() {
  return {
    request: vi.fn(async (path) =>
      path.includes("auth/")
        ? { external: { anonymous_users: true }, disable_signup: false }
        : {
            public: false,
            file_size_limit: path.endsWith("bm-inputs") ? 716800 : 15000000,
            allowed_mime_types: [
              path.endsWith("bm-inputs") ? "image/jpeg" : "application/json",
            ],
          },
    ),
    rows: vi.fn(async () => []),
    rpc: vi.fn(async (name) =>
      name === "bm_valid_options"
        ? true
        : {
            online: 1,
            visionConfigured: 1,
            categories: ["house", "flower", "car", "animal", "free"],
          },
    ),
  };
}
describe("Studio operational readiness", () => {
  it("reports configuration gaps without attempting operations", async () => {
    const dbFactory = vi.fn();
    const report = await inspectStudio({ env: {}, dbFactory });
    expect(report.ready).toBe(false);
    expect(dbFactory).not.toHaveBeenCalled();
  });
  it("checks actual read endpoints and never creates identities/jobs or calls OpenAI", async () => {
    const db = fixture();
    const report = await inspectStudio({ env, dbFactory: () => db });
    expect(report.ready).toBe(true);
    expect(report.paidCallsMade).toBe(false);
    expect(db.rpc.mock.calls.map((c) => c[0]).sort()).toEqual([
      "bm_valid_options",
      "bm_worker_health",
    ]);
    expect(db.rows.mock.calls[0][1]).toContain("limit=0");
    expect(db.request.mock.calls.every((c) => !c[1]?.method)).toBe(true);
    expect(JSON.stringify(report)).not.toContain("private-fixture");
  });
  it("reports offline workers and public buckets independently", async () => {
    const db = fixture();
    db.rpc.mockImplementation(async (name) =>
      name === "bm_valid_options" ? true : { online: 0 },
    );
    db.request.mockImplementation(async (path) =>
      path.includes("auth/")
        ? { external: { anonymous_users: false } }
        : { public: true },
    );
    const report = await inspectStudio({ env, dbFactory: () => db });
    expect(report.ready).toBe(false);
    expect(
      report.checks.filter((c) => c.status === "failed").map((c) => c.code),
    ).toEqual(
      expect.arrayContaining([
        "worker-offline",
        "bucket-configuration",
        "guest-auth",
      ]),
    );
    expect(report.checks.find((c) => c.name === "database").status).toBe(
      "passed",
    );
  });
  it("does not echo exception messages in diagnostics", async () => {
    const db = fixture();
    db.rows.mockRejectedValue(new Error("private-photo-and-key"));
    const report = await inspectStudio({ env, dbFactory: () => db });
    expect(JSON.stringify(report)).not.toContain("private-photo-and-key");
    expect(report.ready).toBe(false);
  });
  it("tracks idle/working/stopped state without sending credentials", async () => {
    const db = { rpc: vi.fn(async () => {}) };
    const presence = workerPresence(db, "fixture-worker", {
      env: { OPENAI_API_KEY: "secret-fixture" },
    });
    await presence.start();
    await presence.working("fixture-job");
    await presence.idle();
    await presence.stop();
    expect(db.rpc.mock.calls.map((c) => c[1].p_state)).toEqual([
      "idle",
      "working",
      "idle",
      "stopped",
    ]);
    expect(db.rpc.mock.calls[1][1].p_job).toBe("fixture-job");
    expect(JSON.stringify(db.rpc.mock.calls)).not.toContain("secret-fixture");
  });
});

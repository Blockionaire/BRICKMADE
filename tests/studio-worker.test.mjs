import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { runStudioJob, cleanupStudioAssets } from "../server/job-runner.mjs";
import { StudioError } from "../server/supabase.mjs";
import { HOUSE_EXAMPLE, DEFAULT_STUDIO_OPTIONS } from "../shared/studio";
function fixture(
  checkpoint = {
    description: HOUSE_EXAMPLE,
    parent: randomUUID(),
  },
) {
  const job = {
    id: randomUUID(),
    owner_id: randomUUID(),
    project_id: randomUUID(),
    lease_token: randomUUID(),
    attempt: 1,
    options: DEFAULT_STUDIO_OPTIONS,
    input_ids: [randomUUID()],
    checkpoint,
  };
  const db = {
    rpc: vi.fn(async () => true),
    rows: vi.fn(async () => []),
    insert: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
    patch: vi.fn(),
    download: vi.fn(),
  };
  return {
    job,
    db,
    interpret: vi.fn(),
    compile: vi.fn(),
    logger: vi.fn(),
  };
}
describe("Durable worker recovery and publication", () => {
  it("does not repeat an ambiguous paid interpretation on lease recovery", async () => {
    const f = fixture({
      interpretationStarted: true,
    });
    await runStudioJob(f.job, f);
    expect(f.interpret).not.toHaveBeenCalled();
    expect(f.compile).not.toHaveBeenCalled();
    expect(f.db.rpc).toHaveBeenCalledWith(
      "bm_fail_job",
      expect.objectContaining({
        p_code: "interpretation-interrupted",
      }),
    );
  });
  it("reuses the durable interpretation, persists scene planning and stops after bounded failed repairs", async () => {
    const f = fixture();
    f.compile.mockResolvedValue({
      validation: {
        status: "failed",
      },
    });
    await runStudioJob(f.job, f);
    expect(f.interpret).not.toHaveBeenCalled();
    expect(f.compile).toHaveBeenCalledTimes(3);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "bm_job_step",
      expect.objectContaining({
        p_stage: "planning",
        p_checkpoint: expect.objectContaining({
          scene: expect.objectContaining({
            category: "house",
            units: "stud",
          }),
        }),
      }),
    );
    expect(f.db.rpc).toHaveBeenCalledWith(
      "bm_fail_job",
      expect.objectContaining({
        p_code: "assembly-failed",
      }),
    );
    expect(f.db.upload).not.toHaveBeenCalled();
  });
  it("stops on lost fencing without publishing or changing a replaced attempt", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue(false);
    await runStudioJob(f.job, f);
    expect(f.compile).not.toHaveBeenCalled();
    expect(f.db.rpc.mock.calls.some(([name]) => name === "bm_fail_job")).toBe(
      false,
    );
    expect(f.db.upload).not.toHaveBeenCalled();
  });
  it("releases a shutdown job for recovery rather than recording a generation failure", async () => {
    const f = fixture(),
      abort = new AbortController();
    abort.abort();
    await runStudioJob(f.job, {
      ...f,
      signal: abort.signal,
    });
    expect(f.db.rpc).toHaveBeenCalledWith(
      "bm_release_job",
      expect.objectContaining({
        p_job: f.job.id,
      }),
    );
    expect(f.db.rpc.mock.calls.some(([name]) => name === "bm_fail_job")).toBe(
      false,
    );
  });
  it("records cancellation when a worker notices its lease was revoked", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue(false);
    f.db.rows.mockResolvedValue([
      {
        cancel_requested: true,
      },
    ]);
    await runStudioJob(f.job, f);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "bm_fail_job",
      expect.objectContaining({
        p_code: "cancelled",
      }),
    );
  });
  it("sanitizes unexpected compiler failures in events and saved job errors", async () => {
    const f = fixture();
    f.compile.mockRejectedValue(Error("photo-content-and-key"));
    await runStudioJob(f.job, f);
    expect(JSON.stringify(f.logger.mock.calls)).not.toContain("photo-content");
    expect(f.db.rpc).toHaveBeenCalledWith(
      "bm_fail_job",
      expect.objectContaining({
        p_code: "generation-error",
        p_message: expect.not.stringContaining("photo-content"),
      }),
    );
  });
  it("retains cleanup metadata on deletion failure for a later retry", async () => {
    const f = fixture();
    f.db.rows.mockResolvedValue([
      {
        id: randomUUID(),
        bucket: "bm-inputs",
        path: "owner/private.jpg",
      },
    ]);
    f.db.remove.mockRejectedValue(
      new StudioError(503, "network", "Unavailable"),
    );
    await expect(cleanupStudioAssets(f.db)).rejects.toThrow();
    expect(f.db.patch).not.toHaveBeenCalled();
  });
});

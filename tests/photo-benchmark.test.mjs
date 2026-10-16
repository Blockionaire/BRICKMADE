import { describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  loadBenchmark,
  prepareBenchmarkPhoto,
  runPhotoBenchmark,
} from "../server/photo-benchmark.mjs";
import { DEFAULT_STUDIO_OPTIONS, HOUSE_EXAMPLE } from "../shared/studio.ts";
import { StudioError } from "../server/supabase.mjs";
describe("Private real-photo benchmark tooling", () => {
  it("strips metadata, bounds dimensions and validates all permissions before any provider call", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bm-benchmark-"));
    try {
      await sharp({
        create: { width: 2000, height: 1800, channels: 3, background: "red" },
      })
        .withExif({
          IFD0: {
            Artist: "Private tester",
            ImageDescription: "Private address",
          },
        })
        .jpeg()
        .toFile(join(dir, "photo.jpg"));
      const prepared = await prepareBenchmarkPhoto(join(dir, "photo.jpg"));
      const metadata = await sharp(
        Buffer.from(prepared.photo.split(",")[1], "base64"),
      ).metadata();
      expect(metadata.width).toBe(1600);
      expect(metadata.exif).toBeUndefined();
      expect(prepared.sha256).toHaveLength(64);
      const manifest = {
        version: 1,
        cases: [
          {
            id: "owned-house",
            category: "house",
            consent: true,
            rights: "owned",
            source: "Explicit synthetic test image; not photo evidence",
            photos: ["photo.jpg"],
            expected: { storeys: 2 },
          },
        ],
      };
      await writeFile(join(dir, "cases.json"), JSON.stringify(manifest));
      const cases = await loadBenchmark(join(dir, "cases.json")),
        interpret = vi.fn();
      const report = await runPhotoBenchmark(cases, { interpret });
      expect(report.paidCallsAttempted).toBe(0);
      expect(interpret).not.toHaveBeenCalled();
      expect(JSON.stringify(report)).not.toContain("Private address");
      expect(JSON.stringify(report)).not.toContain(dir);
      manifest.cases[0].consent = false;
      await writeFile(join(dir, "cases.json"), JSON.stringify(manifest));
      await expect(loadBenchmark(join(dir, "cases.json"))).rejects.toThrow(
        "invalid-case",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("requires explicit provider-call bounds and makes no retry after an uncertain response", async () => {
    const cases = [
      {
        id: "case",
        options: DEFAULT_STUDIO_OPTIONS,
        photos: [{ photo: "explicit-fixture", sha256: "a".repeat(64) }],
        expected: { storeys: 2 },
      },
    ];
    const interpret = vi.fn(async () => {
      throw new StudioError(
        504,
        "interpretation-timeout",
        "private-image-and-key",
      );
    });
    await expect(
      runPhotoBenchmark(cases, {
        live: true,
        maxCalls: 0,
        env: { OPENAI_API_KEY: "fixture" },
        interpret,
      }),
    ).rejects.toThrow();
    expect(interpret).not.toHaveBeenCalled();
    const report = await runPhotoBenchmark(cases, {
      live: true,
      maxCalls: 1,
      env: { OPENAI_API_KEY: "fixture" },
      interpret,
    });
    expect(report.paidCallsAttempted).toBe(1);
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(report.results[0].errorCode).toBe("interpretation-timeout");
    expect(JSON.stringify(report)).not.toContain("private-image-and-key");
  });
  it("uses production fidelity gates and distinguishes digital success from human validation", async () => {
    const cases = [
      {
        id: "case",
        options: DEFAULT_STUDIO_OPTIONS,
        photos: [],
        expected: { storeys: HOUSE_EXAMPLE.storeys },
      },
    ];
    const compile = vi.fn(async () => ({
      validation: { status: "passed" },
      model: {
        placements: [],
        studio: { windowCounts: [4, 0, 0, 0], adaptations: [] },
      },
      fidelity: { aspectRatioError: 0, windowRetention: 1 },
    }));
    const report = await runPhotoBenchmark(cases, {
      live: true,
      maxCalls: 1,
      env: { OPENAI_API_KEY: "fixture" },
      interpret: async () => ({
        description: HOUSE_EXAMPLE,
        model: "explicit-fixture",
      }),
      compile,
    });
    expect(compile).toHaveBeenCalledTimes(1);
    expect(report.results[0].status).toBe("digitally-checked");
    expect(report.results[0].humanReview.photoResemblance).toBe("pending");
  });
});

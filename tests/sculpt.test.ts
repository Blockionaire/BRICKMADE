import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { compileSculpt } from "../server/compile-sculpt.mjs";
import { runStudioJob } from "../server/job-runner.mjs";
import { passesFidelity } from "../server/design-quality.mjs";
import {
  parseSculptDesign,
  parseFeatureAnalysis,
  sculptSchema,
  featureSchema,
  BUILD_COLORS,
  type SculptDesign,
} from "../shared/sculpt-design";
import {
  parseDesignDescription,
  describedModuleVersion,
} from "../shared/design-description";
import { parseStudioArtifact } from "../shared/studio-artifact";
import type { StudioCategory, StudioOptions } from "../shared/studio";
import {
  carveViews,
  colorMapper,
  decodeView,
  encodeView,
  parseViewSet,
  rgbToLab,
  type ViewSet,
} from "../src/domain/studio/views";
import { BUILDER_BY_REBRICKABLE } from "../src/domain/parts/profiles";
import { COLORS } from "../src/domain/catalog";

const CATEGORIES: StudioCategory[] = [
  "house",
  "car",
  "animal",
  "flower",
  "free",
];
const fixture = (c: StudioCategory) =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/sculpt/${c}.json`, import.meta.url),
      "utf8",
    ),
  ) as SculptDesign;
const options = (
  category: StudioCategory,
  detail: StudioOptions["detail"],
  pace: StudioOptions["pace"] = "medium",
): StudioOptions => ({
  version: 1,
  category,
  detail,
  size: "standard",
  pace,
});
type Compiled = Awaited<ReturnType<typeof compileSculpt>>;
const compiled = new Map<string, Compiled>();
const get = (c: StudioCategory, d: StudioOptions["detail"]) =>
  compiled.get(`${c}:${d}`)!;

beforeAll(async () => {
  for (const c of CATEGORIES)
    for (const d of ["easy", "normal", "hard"] as const)
      compiled.set(`${c}:${d}`, await compileSculpt(fixture(c), options(c, d)));
}, 600000);

describe("Version 3 description contracts", () => {
  it("accepts live-pipeline descriptions and routes them to the sculpture module", () => {
    for (const c of CATEGORIES) {
      const d = parseDesignDescription(fixture(c), c) as SculptDesign;
      expect(d.version).toBe(3);
      expect(d.reference?.views.views.map((v) => v.view)).toContain("front");
      expect(describedModuleVersion(d, c)).toBe(`sculpt-${c}-2026-10-18.v3`);
    }
  });
  it("rejects foreign categories, unknown fields, unknown colours and invalid reference data", () => {
    const house = fixture("house");
    expect(() => parseSculptDesign(house, "car")).toThrow();
    expect(() => parseSculptDesign({ ...house, extra: 1 })).toThrow();
    expect(() =>
      parseSculptDesign({
        ...house,
        palette: [{ region: "walls", color: "chartreuse" }],
      }),
    ).toThrow();
    expect(() =>
      parseSculptDesign({
        ...house,
        reference: {
          ...house.reference!,
          features: [{ ...house.reference!.features[0], kind: "eye" }],
        },
      }),
    ).toThrow();
    const views = structuredClone(house.reference!.views);
    views.views[0].cells = views.views[0].cells.slice(8);
    expect(() =>
      parseSculptDesign({
        ...house,
        reference: { ...house.reference!, views },
      }),
    ).toThrow();
    expect(() =>
      parseViewSet({ version: 2, views: [house.reference!.views.views[0]] }),
    ).toThrow();
  });
  it("offers only packable build colours and strict schemas to the provider", () => {
    for (const id of BUILD_COLORS)
      for (const part of ["3005", "3004", "3024", "3023", "3003", "3022"])
        expect(BUILDER_BY_REBRICKABLE.get(part)!.observedColorIds).toContain(
          COLORS[id].rebrickableId,
        );
    for (const c of CATEGORIES) {
      expect(JSON.stringify(sculptSchema(c))).toContain(
        '"additionalProperties":false',
      );
      expect(JSON.stringify(featureSchema(c))).toContain('"required"');
    }
  });
  it("shortens over-long provider text instead of rejecting a usable answer", () => {
    const parsed = parseFeatureAnalysis(
      { consistent: true, notes: ["x".repeat(900)], features: [] },
      "house",
    );
    expect(parsed.notes[0].length).toBeLessThanOrEqual(300);
  });
});

describe("Reference views and carving", () => {
  it("round-trips compact colour pixels and keeps background distinct", () => {
    const rgba = new Uint8Array([
      200, 30, 30, 255, 0, 0, 0, 0, 0, 8, 0, 255, 255, 255, 255, 255,
    ]);
    const view = encodeView("front", 2, 2, rgba);
    const px = decodeView(view);
    expect(px[1]).toBe(1);
    expect(px[2]).not.toBe(1);
    expect(px[0] >> 11).toBe(200 >> 3);
  });
  it("calibrates desaturated photo tones onto the interpreted build colours", () => {
    const brick = rgbToLab([133, 101, 87]),
      roof = rgbToLab([90, 92, 98]);
    const map = colorMapper(
      [...Array(60).fill(brick), ...Array(30).fill(roof)],
      4,
      ["dark-orange", "dark-stone"],
      ["dark-orange", "dark-stone", "white", "black"],
    );
    expect(map(brick)).toBe("dark-orange");
    expect(map(roof)).toBe("dark-stone");
  });
  it("carves the intersection of the front, side and plan silhouettes", () => {
    // A 4×4 front square, a side triangle (front column full, back column short) and a full plan.
    const square = (
      w: number,
      h: number,
      fill: (x: number, y: number) => boolean,
    ) => {
      const rgba = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (fill(x, y)) rgba.set([200, 30, 30, 255], (y * w + x) * 4);
      return rgba;
    };
    const set: ViewSet = {
      version: 2,
      views: [
        encodeView(
          "front",
          40,
          40,
          square(40, 40, () => true),
        ),
        encodeView(
          "side",
          40,
          40,
          square(40, 40, (x, y) => y >= x),
        ),
        encodeView(
          "top",
          40,
          40,
          square(40, 40, () => true),
        ),
      ],
    };
    const shape = carveViews(set, {
      span: 4,
      colors: 2,
      section: "rect",
      brickHeights: false,
    });
    expect([shape.width, shape.depth, shape.heightPlates]).toEqual([4, 4, 10]);
    const height = (z: number) =>
      Math.max(
        ...[...shape.grid.cells.values()]
          .filter((v) => v.z === z)
          .map((v) => v.y),
      ) + 1;
    // The front (world +z) is the tall end of the side triangle.
    expect(height(3)).toBeGreaterThan(height(0));
    expect(new Set([...shape.grid.cells.values()].map((v) => v.color))).toEqual(
      new Set(["red"]),
    );
  });
});

describe("Compiled sculptures", () => {
  it("passes every digital check for all five categories at all three detail levels", () => {
    for (const c of CATEGORIES)
      for (const d of ["easy", "normal", "hard"] as const) {
        const r = get(c, d);
        expect(r.validation.status, `${c} ${d}`).toBe("passed");
        expect(r.fidelity.method).toBe("silhouette-agreement");
        expect(
          passesFidelity(fixture(c), options(c, d), r.fidelity),
          `${c} ${d}`,
        ).toBe(true);
        expect(r.model.placements.length).toBeLessThanOrEqual(4800);
      }
  });
  it("follows the reference silhouettes closely for solid subjects", () => {
    for (const c of ["house", "car", "animal", "free"] as const) {
      const { front, side } = get(c, "normal").fidelity.silhouette!;
      expect((front + side) / 2, c).toBeGreaterThan(0.8);
    }
  });
  it("makes real design differences between Simple, Standard and Detailed", () => {
    for (const c of CATEGORIES) {
      const [easy, normal, hard] = (["easy", "normal", "hard"] as const).map(
        (d) => get(c, d).model,
      );
      expect(easy.placements.length, c).toBeLessThan(normal.placements.length);
      expect(normal.placements.length, c).toBeLessThan(hard.placements.length);
    }
    // Simple builds the body only in whole bricks; Detailed finishes tops with tiles.
    const bodyParts = (d: "easy" | "normal" | "hard") =>
      new Set(
        get("animal", d)
          .model.placements.filter((p) => (p.layer ?? 0) >= 0.8)
          .map((p) => p.partId),
      );
    expect(
      [...bodyParts("easy")].every(
        (id) => BUILDER_BY_REBRICKABLE.get(id)!.category === "Brick",
      ),
    ).toBe(true);
    expect(
      [...bodyParts("hard")].some(
        (id) => BUILDER_BY_REBRICKABLE.get(id)!.category === "Tile",
      ),
    ).toBe(true);
    const house = (d: "easy" | "normal" | "hard") =>
      get("house", d).model.placements.map((p) => p.partId);
    expect(house("easy")).not.toContain("60592");
    expect(house("normal")).toContain("60592");
    expect(house("normal")).toContain("60601");
    expect(
      house("normal").some((id) => ["3039", "3040b", "11477"].includes(id)),
    ).toBe(true);
  });
  it("seats real leaf elements on flower stems", () => {
    const parts = get("flower", "normal").model.placements.map((p) => p.partId);
    expect(parts).toContain("2423");
  });
  it("changes the instructions, not the model, for each building experience", async () => {
    const counts: number[] = [];
    let pieces: number | undefined;
    for (const pace of ["easy", "medium", "hard"] as const) {
      const r = await compileSculpt(
        fixture("car"),
        options("car", "normal", pace),
      );
      expect(r.validation.status).toBe("passed");
      pieces ??= r.model.placements.length;
      expect(r.model.placements.length).toBe(pieces);
      counts.push(r.model.steps.length);
      if (pace === "easy")
        expect(
          Math.max(...r.model.steps.map((s) => s.placementIds.length)),
        ).toBeLessThanOrEqual(6);
    }
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
  }, 120000);
});

describe("Version 3 jobs and artifacts", () => {
  it("interprets once, prepares reference views once, and publishes a parseable version 3 artifact", async () => {
    const description = fixture("car");
    const { reference, ...interpreted } = description;
    const photo = readFileSync(
      new URL("./fixtures/house-upload.jpg", import.meta.url),
    );
    const sha256 = createHash("sha256").update(photo).digest("hex");
    const job = {
      id: randomUUID(),
      owner_id: randomUUID(),
      project_id: randomUUID(),
      lease_token: randomUUID(),
      attempt: 1,
      options: options("car", "normal"),
      input_ids: [randomUUID()],
      checkpoint: {},
    };
    const db = {
      rpc: vi.fn(async () => true),
      rows: vi.fn(async (table: string) =>
        table === "bm_assets"
          ? [
              {
                id: job.input_ids[0],
                path: "p",
                bytes: photo.length,
                sha256,
                state: "uploaded",
                expires_at: new Date(Date.now() + 1e6).toISOString(),
              },
            ]
          : [],
      ),
      insert: vi.fn(async () => null),
      upload: vi.fn(async () => null),
      remove: vi.fn(async () => null),
      patch: vi.fn(async () => null),
      download: vi.fn(async () => photo),
    };
    const interpret = vi.fn(async () => ({
      description: interpreted,
      model: "test-model",
    }));
    const prepare = vi.fn(async () => ({ reference }));
    const artifact = await runStudioJob(job, {
      db,
      interpret,
      reference: prepare,
      compile: async (
        d: unknown,
        o: StudioOptions,
        _s: unknown,
        onChecking: () => Promise<void>,
      ) => compileSculpt(d, o, onChecking),
      logger: () => {},
    } as never);
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(artifact?.version).toBe(3);
    const uploaded = (db.upload.mock.calls[0] as unknown[])[2] as Buffer;
    const parsed = parseStudioArtifact(JSON.parse(uploaded.toString()));
    expect(parsed.fidelity.silhouette!.front).toBeGreaterThan(0.5);
    expect(db.rpc).toHaveBeenCalledWith(
      "bm_job_step",
      expect.objectContaining({
        p_checkpoint: expect.objectContaining({ referenceStarted: true }),
      }),
    );
    // Tampering with a placement breaks the artifact's exact accounting.
    const tampered = JSON.parse(uploaded.toString());
    tampered.model.placements.pop();
    expect(() => parseStudioArtifact(tampered)).toThrow();
  }, 120000);
  it("never repeats an interrupted reference-view call", async () => {
    const interpreted = { ...fixture("animal"), reference: undefined };
    const db = { rpc: vi.fn(async () => true), rows: vi.fn(async () => []) };
    const prepare = vi.fn();
    await runStudioJob(
      {
        id: randomUUID(),
        owner_id: randomUUID(),
        project_id: randomUUID(),
        lease_token: randomUUID(),
        attempt: 2,
        options: options("animal", "normal"),
        input_ids: [randomUUID()],
        checkpoint: { description: interpreted, referenceStarted: true },
      },
      { db, reference: prepare, logger: () => {} } as never,
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledWith(
      "bm_fail_job",
      expect.objectContaining({ p_code: "reference-interrupted" }),
    );
  });
});

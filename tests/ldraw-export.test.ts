import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import ldrawIndex from "../public/catalog/index.json";
import { HOUSE_PRESETS } from "../shared/house-brief";
import { COLORS } from "@/domain/catalog";
import { createModel } from "@/domain/models";
import { exportLDraw } from "@/domain/export/ldraw";
import { BUILDER_BY_REBRICKABLE } from "@/domain/parts/profiles";
import { worldConnectors } from "@/domain/parts/connections";
import { placementPose } from "@/domain/model-pose";

const normal = (s: string) =>
  s
    .toLowerCase()
    .replace("gray", "grey")
    .replace(/[^a-z]/g, "");
describe("LDraw export", () => {
  it("uses LDraw colour codes that name the same colour", () => {
    for (const color of Object.values(COLORS)) {
      const ldraw = ldrawIndex.colors.find((c) => c.id === color.rebrickableId);
      expect(ldraw && normal(ldraw.name), color.sourceName).toBe(
        normal(color.sourceName),
      );
    }
  });
  it("places every part where the builder shows it, step by step", () => {
    const model = createModel({
      houseBrief: HOUSE_PRESETS[0].brief,
      modelKind: "house",
      size: "compact",
      detail: "normal",
      buildDifficulty: "medium",
    });
    const { text, fileName } = exportLDraw(model, "Cosy cottage #1");
    expect(fileName).toBe("cosy-cottage-1.ldr");
    const lines = text.split("\r\n");
    const parts = lines.filter((l) => l.startsWith("1 "));
    expect(parts).toHaveLength(model.placements.length);
    expect(lines.filter((l) => l === "0 STEP")).toHaveLength(
      new Set(model.placements.map((p) => p.step)).size,
    );
    // Each part line maps the part's LDraw-local connector datums onto the same
    // world positions the builder computes.
    let bricks = 0;
    const ordered = [...model.placements].sort((a, b) => a.step - b.step);
    ordered.forEach((placement, i) => {
      const t = parts[i].split(" ");
      const profile = BUILDER_BY_REBRICKABLE.get(placement.partId)!;
      expect(t[14]).toBe(`${profile.id}.dat`);
      expect(Number(t[1])).toBe(COLORS[placement.color].rebrickableId);
      const [x, y, z, a, b, c, d, e, f, g, h, k] = t.slice(2, 14).map(Number);
      const world = worldConnectors(placementPose(placement));
      for (const connector of profile.connectors) {
        // Scene-local datum → LDraw-local coordinates.
        const v = new Vector3(...connector.position)
          .sub(
            new Vector3(
              -profile.centerLdu[0],
              profile.centerLdu[1],
              profile.centerLdu[2],
            ).divideScalar(20),
          )
          .multiplyScalar(20)
          .multiply(new Vector3(1, -1, -1));
        const ldraw = [
          a * v.x + b * v.y + c * v.z + x,
          d * v.x + e * v.y + f * v.z + y,
          g * v.x + h * v.y + k * v.z + z,
        ];
        const scene = [ldraw[0] / 20, -ldraw[1] / 20, -ldraw[2] / 20];
        const expected = world.find((w) => w.id === connector.id)!.position;
        scene.forEach((n, j) => expect(n).toBeCloseTo(expected[j], 3));
      }
      // Independent datum check: official bricks span LDraw y -4 (stud tops) to 24.
      if (
        ["3001", "3003", "3004", "3005", "3009", "3010", "3622"].includes(
          profile.id,
        )
      ) {
        const top = placement.position[1] + profile.mesh.bounds[4];
        expect(-(y - 4) / 20).toBeCloseTo(top, 3);
        bricks++;
      }
    });
    expect(bricks).toBeGreaterThan(0);
  });
});

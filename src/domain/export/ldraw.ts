import { Matrix4, Quaternion, Vector3 } from "three";
import { COLORS } from "../catalog";
import { BUILDER_BY_REBRICKABLE } from "../parts/profiles";
import { placementPose } from "../model-pose";
import type { HouseModel } from "../types";

/** LDraw axes are scene axes rotated 180° about X; 20 LDU per scene unit (stud). */
const FLIP = new Matrix4().makeScale(1, -1, -1);
const number = (n: number) => {
  const v = Math.round(n * 1e4) / 1e4;
  return v === 0 ? "0" : String(v);
};
const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ").trim();
export function ldrawFileName(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "brickmade-model"
  );
}

/**
 * Export a generated model as an LDraw model: one official part reference per
 * placement and a `0 STEP` after every build step, so LDraw tools (LDCad, LeoCAD,
 * BrickLink Studio) open the same build in the same order. Palette colours use their
 * Rebrickable IDs, which equal the LDraw colour codes for every BrickMade colour
 * (checked in tests/ldraw-export.test.ts).
 */
export function exportLDraw(model: HouseModel, title = "BrickMade model") {
  const name = ldrawFileName(title);
  const lines = [
    `0 ${oneLine(title) || "BrickMade model"}`,
    `0 Name: ${name}.ldr`,
    "0 Author: BrickMade",
    "0 !LDRAW_ORG Unofficial_Model",
    "0 // Part geometry: The LDraw Parts Library, CC BY 4.0.",
  ];
  const steps = [...new Set(model.placements.map((p) => p.step))].sort(
    (a, b) => a - b,
  );
  for (const step of steps) {
    const heading = model.steps.find((s) => s.number === step)?.title;
    if (heading) lines.push(`0 // Step ${step}: ${oneLine(heading)}`);
    for (const placement of model.placements.filter((p) => p.step === step)) {
      const profile = BUILDER_BY_REBRICKABLE.get(placement.partId);
      if (!profile) throw Error(`No LDraw geometry for ${placement.partId}.`);
      const color = COLORS[placement.color];
      if (!color) throw Error(`Unknown colour ${placement.color}.`);
      const pose = placementPose(placement);
      const rotation = new Matrix4().makeRotationFromQuaternion(
        new Quaternion(...pose.rotation),
      );
      // Scene-local = FLIP·v/20 + datum; world = R·local + p; LDraw = 20·FLIP·world.
      const datum = new Vector3(
        -profile.centerLdu[0],
        profile.centerLdu[1],
        profile.centerLdu[2],
      ).divideScalar(20);
      const origin = datum
        .applyMatrix4(rotation)
        .add(new Vector3(...pose.position))
        .applyMatrix4(FLIP)
        .multiplyScalar(20);
      const m = FLIP.clone().multiply(rotation).multiply(FLIP).elements; // column-major
      lines.push(
        [
          1,
          color.rebrickableId,
          ...origin.toArray(),
          m[0],
          m[4],
          m[8],
          m[1],
          m[5],
          m[9],
          m[2],
          m[6],
          m[10],
        ]
          .map((n, i) => (i < 2 ? String(n) : number(n)))
          .join(" ") + ` ${profile.id}.dat`,
      );
    }
    lines.push("0 STEP");
  }
  return { fileName: `${name}.ldr`, text: lines.join("\r\n") + "\r\n" };
}

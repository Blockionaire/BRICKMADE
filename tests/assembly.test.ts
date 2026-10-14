import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { BUILDER_PARTS } from "@/domain/parts/profiles";
import { decodeCollisionShape } from "@/domain/validation/collision";
import { validateAssembly } from "@/domain/validation/assembly";
import { createModel, MODEL_KINDS } from "@/domain/models";
import {
  BUILD_SIZES,
  DETAIL_LEVELS,
  BUILD_DIFFICULTIES,
} from "@/domain/catalog";
let completedAudits = 0;
if (process.env.EXPORT_DEMO_MODELS)
  fs.rmSync(process.env.EXPORT_DEMO_MODELS, { force: true });
const shapes = new Map(
  BUILDER_PARTS.map((p) => {
    const raw = fs.readFileSync(`public${p.collision!.file}`);
    return [
      p.id,
      decodeCollisionShape(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      ),
    ] as const;
  }),
);
describe("Complete digitally reviewed demo assemblies", () => {
  for (const kind of MODEL_KINDS)
    for (const size of BUILD_SIZES)
      for (const detail of DETAIL_LEVELS)
        for (const pace of BUILD_DIFFICULTIES) {
          it(`${kind.id}/${size.id}/${detail.id}/${pace.id} checks solid geometry, anchors, instructions and recorded colors`, () => {
            const model = createModel({
              modelKind: kind.id,
              size: size.id,
              detail: detail.id,
              buildDifficulty: pace.id,
            });
            const report = validateAssembly(model, shapes);
            const errors = report.issues.filter((i) => i.severity === "error");
            expect(
              errors,
              JSON.stringify(
                {
                  kind: kind.id,
                  size: size.id,
                  detail: detail.id,
                  count: model.stats.pieceCount,
                  errors: errors.slice(0, 18),
                },
                null,
                2,
              ),
            ).toEqual([]);
            expect(report.status).toBe("passed");
            expect(report.components).toBe(1);
            expect(report.physicalStatus).toBe("untested");
            completedAudits++;
          }, 60000);
        }
});

afterAll(() => {
  if (process.env.EXPORT_DEMO_MODELS) {
    if (completedAudits !== 108)
      throw Error(
        "Model preview export requires all 108 assembly audits to pass.",
      );
    const previews = MODEL_KINDS.flatMap((kind) =>
      BUILD_SIZES.flatMap((size) =>
        DETAIL_LEVELS.map((detail) =>
          createModel({ modelKind: kind.id, size: size.id, detail: detail.id }),
        ),
      ),
    );
    fs.writeFileSync(process.env.EXPORT_DEMO_MODELS, JSON.stringify(previews));
  }
});

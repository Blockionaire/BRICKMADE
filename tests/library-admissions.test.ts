import { describe, expect, it } from "vitest";
import fs from "node:fs";
import data from "../public/catalog/builder-parts.json";
import {
  auditCylinderPort,
  auditPort,
  type PortAudit,
} from "@/domain/parts/admissions";
import { decodeCollisionShape } from "@/domain/validation/collision";
import type { BuilderPart, Connector } from "@/domain/parts/types";

/**
 * Parts-library port qualification. Every LDCad-derived connector proposal is audited
 * against reference parts; only passed ports ship. A full run is sharded and writes
 * its records to the build cache (LIBRARY_ADMISSIONS=write SHARD=i/n), then
 * scripts/catalog/apply_library_admissions.py applies them. A normal test run re-audits
 * a fixed sample and requires the stored decisions to be reproduced exactly.
 */
type Stored = BuilderPart & {
  batch?: string;
  portAudit?: PortAudit[];
  rejectedPorts?: Connector[];
};
const parts = data.parts as unknown as Stored[];
const profiles = new Map(parts.map((p) => [p.id, p as BuilderPart]));
const shapeCache = new Map<string, ReturnType<typeof decodeCollisionShape>>();
const shapes = {
  get(id: string) {
    if (!shapeCache.has(id)) {
      const p = profiles.get(id);
      if (!p?.collision) return undefined;
      const raw = fs.readFileSync(`public${p.collision.file}`);
      shapeCache.set(
        id,
        decodeCollisionShape(
          raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
        ),
      );
    }
    return shapeCache.get(id);
  },
} as unknown as ReadonlyMap<string, ReturnType<typeof decodeCollisionShape>>;
export function auditLibraryConnector(part: BuilderPart, c: Connector) {
  return c.kind === "stud" || c.kind === "anti-stud"
    ? auditPort(part, c, profiles, shapes)
    : auditCylinderPort(part, c, profiles, shapes);
}
const library = parts.filter((p) => p.batch === "library");
const write = process.env.LIBRARY_ADMISSIONS === "write";
const [shard, shards] = (process.env.SHARD ?? "0/1").split("/").map(Number);

describe("Parts-library port qualification", () => {
  if (write) {
    it(`audits shard ${shard}/${shards}`, () => {
      // null: the part exceeds the validator's collision grid and leaves the library.
      const records: Record<string, PortAudit[] | null> = {};
      library.forEach((part, i) => {
        if (i % shards !== shard) return;
        try {
          shapes.get(part.id);
        } catch {
          records[part.id] = null;
          return;
        }
        const proposals = [...part.connectors, ...(part.rejectedPorts ?? [])];
        records[part.id] = proposals.map((c) => auditLibraryConnector(part, c));
      });
      fs.mkdirSync(".cache/catalog/admissions", { recursive: true });
      fs.writeFileSync(
        `.cache/catalog/admissions/shard-${shard}.json`,
        JSON.stringify(records),
      );
    }, 3_600_000);
    return;
  }
  const sample = library.filter((_, i) => i % 97 === 0);
  for (const part of sample)
    it(`${part.id} ${part.name}: stored port decisions reproduce`, () => {
      expect(
        (part as unknown as { libraryAudit?: unknown[] }).libraryAudit,
        "run the library admission audit",
      ).toHaveLength(
        part.connectors.length + (part.rejectedPorts?.length ?? 0),
      );
      for (const c of part.connectors)
        expect(auditLibraryConnector(part, c).status).toBe("passed");
      for (const c of part.rejectedPorts ?? [])
        expect(auditLibraryConnector(part, c).status).toBe("rejected");
    }, 120_000);
});

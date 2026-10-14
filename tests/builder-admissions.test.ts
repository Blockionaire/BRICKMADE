import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import data from "../public/catalog/builder-parts.json";
import { PART_PROFILES, BUILDER_PARTS } from "@/domain/parts/profiles";
import { auditPort, type PortAudit } from "@/domain/parts/admissions";
import { decodeCollisionShape } from "@/domain/validation/collision";
const auditParts = data.parts as unknown as typeof BUILDER_PARTS;
const shapes = new Map(
  auditParts.map((p) => {
    const raw = fs.readFileSync(`public${p.collision!.file}`);
    return [
      p.id,
      decodeCollisionShape(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      ),
    ] as const;
  }),
);
const audit = new Map<string, PortAudit[]>();
describe("Source-backed expanded port qualification", () => {
  it("ships exactly the operational projection while retaining full audit evidence", () => {
    const runtime = JSON.parse(
      fs.readFileSync("public/catalog/builder-runtime.json", "utf8"),
    );
    const expected = structuredClone(data);
    for (const p of expected.parts) {
      delete (p as Record<string, unknown>).portAudit;
      delete (p as Record<string, unknown>).rejectedPorts;
      p.admission = Object.fromEntries(
        Object.entries(p.admission).filter(([k]) =>
          [
            "status",
            "physicalStatus",
            "acceptedPorts",
            "rejectedPorts",
          ].includes(k),
        ),
      ) as typeof p.admission;
    }
    expect(JSON.stringify(runtime)).toBe(JSON.stringify(expected));
  });
  for (const part of auditParts.filter((p) => p.batch === "expansion"))
    it(`${part.id} ${part.name}: audit every proposed port`, () => {
      const records = part.connectors.map((c) =>
        auditPort(part, c, PART_PROFILES, shapes),
      );
      audit.set(part.id, records);
      expect(records).toHaveLength(part.connectors.length);
      expect(
        records.every((r) => r.status !== "passed" || r.witnesses === 8),
      ).toBe(true);
      if (!process.env.WRITE_BUILDER_ADMISSIONS) {
        for (const rejected of part.rejectedPorts ?? [])
          expect(auditPort(part, rejected, PART_PROFILES, shapes).status).toBe(
            "rejected",
          );
      }
      if (!process.env.WRITE_BUILDER_ADMISSIONS)
        expect(
          records.every((r) => r.status === "passed"),
          JSON.stringify(records.filter((r) => r.status !== "passed")),
        ).toBe(true);
    }, 30000);
});
afterAll(() => {
  if (!process.env.WRITE_BUILDER_ADMISSIONS) return;
  for (const part of data.parts) {
    if (part.batch !== "expansion") continue;
    const records = audit.get(part.id)!;
    if (!records) throw Error("Missing qualification audit.");
    const p = part as unknown as typeof part & {
      portAudit: PortAudit[];
      rejectedPorts: typeof part.connectors;
      admission: Record<string, unknown>;
    };
    p.portAudit = records;
    p.rejectedPorts = part.connectors.filter(
      (c) => records.find((r) => r.connectorId === c.id)!.status === "rejected",
    );
    part.connectors = part.connectors.filter(
      (c) => records.find((r) => r.connectorId === c.id)!.status === "passed",
    );
    p.admission = {
      ...p.admission,
      status:
        part.connectors.length && part.observedColorIds.length
          ? "connection-tested"
          : "geometry-only",
      acceptedPorts: part.connectors.length,
      rejectedPorts: p.rejectedPorts.length,
      physicalStatus: "untested",
      witnesses: records.reduce((n, r) => n + r.witnesses, 0),
      resolutionMillimetres: 0.4,
    };
    if (part.connectors.length < p.portAudit.length) part.coverage = "partial";
    part.unknownMechanisms =
      part.coverage === "stud-system"
        ? []
        : [
            "Unlisted mechanisms and failed proposed ports remain unsupported. Physical fit and strength are untested.",
          ];
  }
  fs.writeFileSync(
    "public/catalog/builder-parts.json",
    JSON.stringify(data, null, 2) + "\n",
  );
  const manifest = JSON.parse(
    fs.readFileSync("public/catalog/manifest.json", "utf8"),
  );
  manifest.reviewedConnectorCount = data.parts.reduce(
    (n, p) => n + p.connectors.length,
    0,
  );
  manifest.portedBuilderPartCount = data.parts.filter(
    (p) => p.connectors.length,
  ).length;
  manifest.geometryOnlyBuilderPartCount = data.parts.filter(
    (p) => !p.connectors.length,
  ).length;
  manifest.newPortWitnessCount = data.parts.reduce(
    (n, p) => n + (Number(p.admission.witnesses) || 0),
    0,
  );
  manifest.connectionTestedBuilderPartCount = data.parts.filter(
    (p) => p.admission.status === "connection-tested",
  ).length;
  fs.writeFileSync(
    "public/catalog/manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const sql = spawnSync(
    "python3",
    [
      "-c",
      `import json,sqlite3
m=json.load(open('public/catalog/builder-parts.json'))
with sqlite3.connect('public/catalog/brickmade.sqlite') as db:
 db.execute('DELETE FROM builder_connectors')
 for p in m['parts']:
  db.execute('UPDATE builder_parts SET profile_json=? WHERE ldraw_id=?',(json.dumps(p),p['id']))
  for c in p['connectors']:db.execute('INSERT INTO builder_connectors VALUES (?,?,?,?,?)',(p['id'],c['id'],c['kind'],json.dumps(c),c['status']))
 assert db.execute('PRAGMA foreign_key_check').fetchall()==[]`,
    ],
    { encoding: "utf8" },
  );
  if (sql.status !== 0) throw Error(sql.stderr);
});

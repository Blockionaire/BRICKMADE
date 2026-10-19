#!/usr/bin/env python3
"""Apply the sharded parts-library port audit (tests/library-admissions.test.ts).

Passed proposals become the part's connectors; rejected ones move to rejectedPorts.
Full audit records stay in SQLite (builder_port_audits); the source JSON keeps a
compact [connectorId, status, referencePart, witnesses] list per part.
"""
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "public/catalog"


def main():
    records = {}
    for shard in sorted((ROOT / ".cache/catalog/admissions").glob("shard-*.json")):
        records.update(json.loads(shard.read_text()))
    manifest = json.loads((CATALOG / "builder-parts.json").read_text())
    library = [p for p in manifest["parts"] if p.get("batch") == "library"]
    missing = [p["id"] for p in library if p["id"] not in records]
    if missing:
        raise SystemExit(f"Missing audit records for {len(missing)} parts, e.g. {missing[:5]}")
    oversize = [p["id"] for p in library if records[p["id"]] is None]
    if oversize:
        for ident in oversize:
            for folder, suffix in (("geometry", ".bin"), ("collision", ".bvox")):
                (CATALOG / folder / (ident + suffix)).unlink(missing_ok=True)
            manifest["libraryBatch"]["skipped"][ident] = "exceeds the validator collision grid (1000 cells per axis, 10M cells)"
        manifest["parts"] = [p for p in manifest["parts"] if p["id"] not in oversize]
        library = [p for p in library if p["id"] not in oversize]
        manifest["libraryBatch"]["added"] = len(library)
    for part in library:
        audit = {r["connectorId"]: r for r in records[part["id"]]}
        proposals = part["connectors"] + part.get("rejectedPorts", [])
        if set(audit) != {c["id"] for c in proposals}:
            raise SystemExit(f"Audit does not cover the proposals of {part['id']}")
        proposals.sort(key=lambda c: int(c["id"].rsplit("-", 1)[1]))
        for c in proposals:
            c["depth"] = round(c["depth"], 6)
            for section in c.get("sections") or []:
                section["radius"] = round(section["radius"], 6)
                section["length"] = round(section["length"], 6)
        part["connectors"] = [c for c in proposals if audit[c["id"]]["status"] == "passed"]
        part["rejectedPorts"] = [c for c in proposals if audit[c["id"]]["status"] == "rejected"]
        part["libraryAudit"] = [
            [c["id"], audit[c["id"]]["status"], audit[c["id"]]["referenceParts"][0] if audit[c["id"]]["status"] == "passed" else None, audit[c["id"]]["witnesses"]]
            for c in proposals
        ]
        accepted = len(part["connectors"])
        part["admission"] = {
            **part["admission"],
            "status": "connection-tested" if accepted and part["observedColorIds"] else "geometry-only",
            "acceptedPorts": accepted,
            "rejectedPorts": len(part["rejectedPorts"]),
            "witnesses": sum(r["witnesses"] for r in audit.values()),
            "resolutionMillimetres": 0.4,
        }
    (CATALOG / "builder-parts.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    with sqlite3.connect(CATALOG / "brickmade.sqlite") as db:
        db.execute(
            "CREATE TABLE IF NOT EXISTS builder_port_audits(ldraw_id TEXT REFERENCES builder_parts(ldraw_id), connector_id TEXT, status TEXT NOT NULL, reason TEXT NOT NULL, reference_parts TEXT NOT NULL, witnesses INTEGER NOT NULL, PRIMARY KEY(ldraw_id, connector_id))"
        )
        db.execute("DELETE FROM builder_port_audits")
        ids = [p["id"] for p in library] + oversize
        db.executemany("DELETE FROM builder_connectors WHERE ldraw_id=?", [(i,) for i in ids])
        db.executemany("DELETE FROM builder_parts WHERE ldraw_id=?", [(i,) for i in oversize])
        for part in library:
            db.execute("UPDATE builder_parts SET profile_json=? WHERE ldraw_id=?", (json.dumps(part), part["id"]))
            db.executemany(
                "INSERT INTO builder_connectors VALUES (?,?,?,?,?)",
                [(part["id"], c["id"], c["kind"], json.dumps(c), c["status"]) for c in part["connectors"]],
            )
            db.executemany(
                "INSERT INTO builder_port_audits VALUES (?,?,?,?,?,?)",
                [(part["id"], r["connectorId"], r["status"], r["reason"], json.dumps(r["referenceParts"]), r["witnesses"]) for r in records[part["id"]]],
            )
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    catalog_manifest = json.loads((CATALOG / "manifest.json").read_text())
    catalog_manifest["libraryBuilderPartCount"] = len(library)
    catalog_manifest["libraryConnectionTestedPartCount"] = sum(p["admission"]["status"] == "connection-tested" for p in library)
    catalog_manifest["libraryAcceptedConnectorCount"] = sum(len(p["connectors"]) for p in library)
    catalog_manifest["libraryRejectedConnectorCount"] = sum(len(p["rejectedPorts"]) for p in library)
    (CATALOG / "manifest.json").write_text(json.dumps(catalog_manifest, indent=2) + "\n")
    kinds = {}
    for p in library:
        for c in p["connectors"]:
            kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
    print(json.dumps({k: catalog_manifest[k] for k in catalog_manifest if k.startswith("library")} | {"acceptedKinds": kinds}, indent=1))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Ship a compact operational projection; retain full audits in source JSON and SQLite.

Reviewed core/expansion parts ship as plain profiles. Parts-library parts ship in a
packed form (decoded by src/domain/parts/profiles.ts): constant connector fields are
dropped, evidence files are interned and each connector is one array
[index, kind, x, y, z, nx, ny, nz, evidence, sections, slide].
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2] / "public/catalog"
full = json.loads((root / "builder-parts.json").read_text())
KINDS = ["stud", "anti-stud", "cyl-male", "cyl-female", "clip"]


def number(n):
    return int(n) if float(n).is_integer() else round(n, 6)


def pack(part, evidence):
    connectors = []
    for c in part["connectors"]:
        file = c["evidence"]["file"]
        if file not in evidence:
            evidence[file] = len(evidence)
        sections = " ".join(f"{s['shape']}{number(s['radius'])}:{number(s['length'])}" for s in c.get("sections") or [])
        connectors.append(
            [int(c["id"].rsplit("-", 1)[1]), KINDS.index(c["kind"]), *map(number, c["position"]), *map(number, c["normal"]), evidence[file], sections, 1 if c.get("slide") else 0]
        )
    # File paths, URLs and constant fields are rebuilt by the decoder from the id.
    assert part["mesh"]["file"] == f"/catalog/geometry/{part['id']}.bin"
    assert part["collision"]["file"] == f"/catalog/collision/{part['id']}.bvox"
    assert part["source"]["file"] == f"parts/{part['id']}.dat"
    return {
        **{k: part[k] for k in ("id", "rebrickableId", "rebrickableName", "name", "category", "tags", "role", "centerLdu", "bodySize", "observedColorIds", "coverage", "unknownMechanisms", "geometrySha256")},
        "mesh": {k: v for k, v in part["mesh"].items() if k != "file"},
        "source": [part["source"]["author"], part["source"]["license"]],
        "collision": [part["collision"][k] for k in ("sha256", "bytes", "occupiedCells")],
        "admission": [part["admission"][k] for k in ("status", "acceptedPorts", "rejectedPorts")],
        "connectors": connectors,
    }


runtime = {k: v for k, v in full.items() if k not in ("parts", "libraryBatch")}
runtime["parts"] = []
evidence = {}
library = []
for p in full["parts"]:
    if p.get("batch") == "library":
        library.append(pack(p, evidence))
        continue
    p.pop("portAudit", None)
    p.pop("rejectedPorts", None)
    p["admission"] = {k: v for k, v in p["admission"].items() if k in ("status", "physicalStatus", "acceptedPorts", "rejectedPorts")}
    runtime["parts"].append(p)
if library:
    batch = full["libraryBatch"]
    runtime["library"] = {
        "batch": batch["batch"],
        "connectionSource": {"name": "LDCad Shadow Library", "commit": batch["ldcadCommit"], "license": "CC-BY-SA-4.0", "url": "https://github.com/RolandMelkert/LDCadShadowLibrary"},
        "kinds": KINDS,
        "evidence": list(evidence),
        "parts": library,
    }
(root / "builder-runtime.json").write_text(json.dumps(runtime, separators=(",", ":")) + "\n")
print("Runtime registry bytes:", (root / "builder-runtime.json").stat().st_size)

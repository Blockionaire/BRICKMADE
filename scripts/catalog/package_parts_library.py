#!/usr/bin/env python3
"""Package the large parts library: geometry plus LDCad-derived connector proposals.

Run after select_parts_library.py. Existing reviewed profiles are kept unchanged; every
new part is added as a candidate whose connectors still have to pass the geometric
port audit (tests/builder-admissions.test.ts) before generation may use them.

Connection data: LDCad Shadow Library, CC BY-SA 4.0, (c) Roland Melkert and
contributors, https://github.com/RolandMelkert/LDCadShadowLibrary. Connectors derived
from it are shared under the same licence (see docs/PARTS_LIBRARY.md).
"""
import argparse
import hashlib
import importlib.util
import json
import math
import sqlite3
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("ldraw_import", HERE / "import_ldraw.py")
ldraw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ldraw)
import sys

sys.path.insert(0, str(HERE))
import ldcad_snaps  # noqa: E402

LICENSE = "LDCad Shadow Library snap metadata, CC BY-SA 4.0"


def app_point(v):
    # LDraw → scene: rotate 180° about X, 20 LDU per stud; native part origin.
    return [round(v[0] / 20, 6), round(-v[1] / 20, 6), round(-v[2] / 20, 6)]


def app_axis(v):
    return [round(v[0], 6) + 0.0, round(-v[1], 6) + 0.0, round(-v[2], 6) + 0.0]


def connectors_for(snaps):
    out, unknown, seen = [], set(), set()
    for s in snaps:
        if s["type"] in ("fgr", "gen"):
            unknown.add(
                "Hinge finger joints are not yet supported."
                if s["type"] == "fgr"
                else f"Special joint ({s.get('group') or 'generic'}) is not yet supported."
            )
            continue
        axis, scale = ldcad_snaps.describe(s)
        if abs(scale - 1) > 1e-4:
            unknown.add("A scaled snap was skipped.")
            continue
        n = app_axis(axis)
        # Compact evidence: the method code is documented in docs/PARTS_LIBRARY.md.
        evidence = {"file": "ldcad:" + s["source"], "method": "ldcad-snap"}
        if s["type"] == "clp":
            sections = [{"shape": "C", "radius": round(s["radius"] / 20, 6), "length": round(s["length"] / 20, 6)}]
            start = [p - a * s["length"] / 2 for p, a in zip(s["pos"], axis)]
            kind = "clip"
            slide = True
        else:
            secs = s["sections"]
            total = sum(x["length"] for x in secs)
            single = len(secs) == 1
            if (
                s["gender"] == "M"
                and single
                and secs[0]["shape"] == "R"
                and abs(secs[0]["radius"] - 6) < 1e-6
                and secs[0]["length"] <= 4.5
                and s["caps"] == "one"
                and not s["slide"]
                and not s["center"]
            ):
                kind, start, sections, slide = "stud", s["pos"], None, False
            elif (
                s["gender"] == "F"
                and single
                and secs[0]["shape"] in ("R", "S")
                and abs(secs[0]["radius"] - 6) < 1e-6
                and secs[0]["length"] >= 3.9
                and s["caps"] == "one"
                and not s["slide"]
                and not s["center"]
            ):
                kind, start, sections, slide = "anti-stud", s["pos"], None, False
            else:
                kind = "cyl-male" if s["gender"] == "M" else "cyl-female"
                start = [p - a * total / 2 for p, a in zip(s["pos"], axis)] if s["center"] else list(s["pos"])
                sections = [
                    {"shape": x["shape"].strip("_").upper()[:1] or "R", "radius": round(x["radius"] / 20, 6), "length": round(x["length"] / 20, 6)}
                    for x in secs
                ]
                slide = s["slide"] or s["caps"] == "none"
        position = app_point(start)
        normal = [-v for v in n] if kind == "anti-stud" else n
        key = json.dumps([kind, position, [round(v, 4) for v in normal], sections], sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        c = {"id": f"{kind}-{len(out) + 1}", "kind": kind, "position": position, "normal": normal, "status": "geometry-reviewed", "evidence": evidence}
        if kind in ("stud", "anti-stud"):
            c.update(radius=0.3, depth=0.2)
        else:
            c.update(radius=max(x["radius"] for x in sections), depth=round(sum(x["length"] for x in sections), 6), sections=sections, slide=slide)
        out.append(c)
    return out, sorted(unknown)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--ldcad", type=Path, required=True)
    args = parser.parse_args()
    source = json.loads((ROOT / "data/catalog/source.json").read_text())
    if hashlib.sha256(args.archive.read_bytes()).hexdigest() != source["archiveSha256"]:
        raise ValueError("Pinned archive checksum mismatch")
    ldcad_commit = subprocess.run(["git", "-C", str(args.ldcad), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    files = ldraw.read_library(args.archive, None)
    resolver = ldcad_snaps.Resolver(files, ldcad_snaps.load_shadow(args.ldcad))
    output = ROOT / "public/catalog"
    cache = ROOT / ".cache/catalog/geometry"
    cache.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((output / "builder-parts.json").read_text())
    existing = {p["id"] for p in manifest["parts"]}
    kept = [p for p in manifest["parts"] if p.get("batch") != "library"]
    selection = json.loads((ROOT / "data/catalog/parts-library-selection.json").read_text())["entries"]
    db = sqlite3.connect(output / "brickmade.sqlite")
    added, skipped = [], {}
    for entry in selection:
        ident = entry["ldrawId"]
        if ident in {p["id"] for p in kept}:
            continue
        path = "parts/" + ident + ".dat"
        if path not in files:
            skipped[ident] = "no official LDraw file"
            continue
        part = ldraw.parse_part(path, files[path][1])
        if not part:
            skipped[ident] = "unofficial, alias or unapproved licence"
            continue
        try:
            document, deps = ldraw.make_preview(ident, files)
            snaps = resolver.snaps(path)
        except ValueError as error:
            skipped[ident] = str(error)[:120]
            continue
        connectors, unknown = connectors_for(snaps)
        if not connectors:
            unknown.append("No snap information is available for this part yet.")
        # Self-contained source geometry stays in the build cache; it is reproducible
        # from the pinned archive and only the compiled mesh ships.
        (cache / (ident + ".mpd")).write_text(document)
        profile = {
            "id": ident,
            "rebrickableId": entry["rebrickableId"],
            "name": part["name"],
            "rebrickableName": entry["rebrickableName"],
            "category": part["category"],
            "tags": part["tags"],
            "role": entry["role"],
            "centerLdu": [0, 0, 0],
            "bodySize": None,
            "connectors": connectors,
            "coverage": "partial",
            "unknownMechanisms": unknown,
            "source": {
                "file": part["file"],
                "sha256": part["sha256"],
                "author": part["author"],
                "license": part["license"],
                "url": source["recordBaseUrl"] + ident + ".dat",
            },
            "connectionSource": {
                "name": "LDCad Shadow Library",
                "commit": ldcad_commit,
                "license": "CC-BY-SA-4.0",
                "url": "https://github.com/RolandMelkert/LDCadShadowLibrary",
            },
            "geometryFile": "build-cache:geometry/" + ident + ".mpd",
            "geometrySha256": hashlib.sha256(document.encode()).hexdigest(),
            "dependencyCount": len(deps),
            "batch": "library",
            "admission": {
                "status": "candidate",
                "physicalStatus": "untested",
                "sourceIdentityEvidence": "identical official LDraw and Rebrickable identity; ranked by inventory frequency",
            },
            "observedColorIds": [r[0] for r in db.execute("SELECT color_id FROM rb_part_color_observations WHERE part_num=? ORDER BY color_id", (entry["rebrickableId"],))],
        }
        added.append(profile)
    db.close()
    manifest["parts"] = kept + added
    manifest["libraryBatch"] = {
        "batch": "parts-library-2026-10-19",
        "ldcadCommit": ldcad_commit,
        "connectionLicense": LICENSE,
        "added": len(added),
        "skipped": skipped,
    }
    (output / "builder-parts.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    with sqlite3.connect(output / "brickmade.sqlite") as db:
        db.execute("DELETE FROM builder_connectors WHERE ldraw_id IN (SELECT ldraw_id FROM builder_parts WHERE json_extract(profile_json,'$.batch')='library')")
        db.execute("DELETE FROM builder_parts WHERE json_extract(profile_json,'$.batch')='library'")
        for p in added:
            db.execute("INSERT INTO builder_parts VALUES (?,?,?,?)", (p["id"], p["rebrickableId"], json.dumps(p), "geometry-reviewed"))
            for c in p["connectors"]:
                db.execute("INSERT INTO builder_connectors VALUES (?,?,?,?,?)", (p["id"], c["id"], c["kind"], json.dumps(c), c["status"]))
    kinds = {}
    for p in added:
        for c in p["connectors"]:
            kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
    print(json.dumps({"added": len(added), "skipped": len(skipped), "connectorKinds": kinds, "withoutConnectors": sum(not p["connectors"] for p in added)}, indent=1))


if __name__ == "__main__":
    main()

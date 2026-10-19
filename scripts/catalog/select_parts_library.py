#!/usr/bin/env python3
"""Freeze the large parts-library selection: the most-used undecorated System parts.

Ranking uses Rebrickable inventory lot counts (how often a part appears in real
inventories). Only official LDraw parts with the same identity are eligible, so every
entry has licensed geometry. This is a shortlist: connectors are imported and
verified separately before any part is used for generation.
"""
import collections
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIMIT = 2500
MINIMUM_LOTS = 8
# Rebrickable category -> building role. Categories absent here are excluded
# (minifigures, Duplo/Primo, stickers, electronics, flexible and non-System parts).
ROLES = {
    1: "baseplate", 3: "slope", 5: "brick-special", 6: "wedge", 8: "technic-brick",
    9: "plate-special", 11: "brick", 12: "technic-connector", 14: "plate",
    15: "tile-special", 16: "window-door", 18: "hinge-turntable", 19: "tile",
    20: "round-cone", 21: "round-plate-dish", 23: "panel", 26: "technic-special",
    29: "wheel-tyre", 32: "bar-fence", 34: "support", 35: "vehicle-sea-air",
    36: "vehicle-land", 37: "curved", 40: "technic-panel", 46: "technic-axle",
    47: "windscreen", 49: "wedge-plate", 51: "technic-beam", 52: "technic-gear",
    53: "technic-pin", 54: "technic-bush", 55: "technic-beam-special",
    67: "tile-round-curved", 76: "plant",
}
EXCLUDED_NAMES = re.compile(
    r"Pattern|Sticker|Decorated|Print|^~|^=|_|Moved|Duplo|Fabuland|Primo|Quatro|Scala|Belville|"
    r"Znap|Modulex|Electric|Conductive|Magnet|Light Brick|Hose|String|Cloth|Rubber Band|"
    r"Flexible|Minifig|Sticker|Obsolete|Assembly|Complete",
    re.I,
)


def select():
    db = sqlite3.connect(ROOT / "public/catalog/brickmade.sqlite")
    existing = {
        p["rebrickableId"]
        for p in json.loads((ROOT / "public/catalog/builder-parts.json").read_text())["parts"]
    }
    rows = db.execute(
        """
        WITH f AS (SELECT part_num, SUM(inventory_lot_count) lots, COUNT(*) colors
                   FROM rb_part_color_observations GROUP BY part_num)
        SELECT p.id, p.name, p.category, r.name, r.category_id, f.lots, f.colors
        FROM parts p JOIN rb_parts r ON r.id = p.id JOIN f ON f.part_num = p.id
        """
    ).fetchall()
    candidates, excluded = [], collections.Counter()
    for ident, ldraw_name, ldraw_category, rb_name, category_id, lots, colors in rows:
        role = ROLES.get(category_id)
        if not role:
            excluded["category"] += 1
            continue
        if EXCLUDED_NAMES.search(ldraw_name) or EXCLUDED_NAMES.search(rb_name):
            excluded["decorated-or-non-system"] += 1
            continue
        if not re.fullmatch(r"\d+[a-z]{0,2}\d?", ident):
            excluded["identifier-variant"] += 1
            continue
        if lots < MINIMUM_LOTS and ident not in existing:
            excluded["rarely-used"] += 1
            continue
        candidates.append(
            {
                "rebrickableId": ident,
                "ldrawId": ident,
                "ldrawName": ldraw_name,
                "rebrickableName": rb_name,
                "ldrawCategory": ldraw_category,
                "role": role,
                "inventoryLotCount": lots,
                "recordedColorCount": colors,
                "alreadyAdmitted": ident in existing,
            }
        )
    candidates.sort(key=lambda p: (not p["alreadyAdmitted"], -p["inventoryLotCount"], p["ldrawId"]))
    selected = candidates[:LIMIT]
    result = {
        "schemaVersion": 1,
        "batch": "parts-library-2026-10-19",
        "sourceRevision": "2026-09",
        "status": "shortlist; geometry, collision and connectors are imported and verified separately",
        "ranking": "Rebrickable inventory lot count across recorded colours (higher = used in more real inventories)",
        "minimumInventoryLots": MINIMUM_LOTS,
        "excludedCounts": dict(excluded),
        "entries": selected,
    }
    (ROOT / "data/catalog/parts-library-selection.json").write_text(json.dumps(result, indent=1) + "\n")
    by_role = collections.Counter(p["role"] for p in selected)
    print(
        json.dumps(
            {
                "selected": len(selected),
                "eligible": len(candidates),
                "alreadyAdmitted": sum(p["alreadyAdmitted"] for p in selected),
                "lowestLotCount": selected[-1]["inventoryLotCount"],
                "byRole": dict(by_role.most_common()),
                "excluded": dict(excluded),
            },
            indent=1,
        )
    )


if __name__ == "__main__":
    select()

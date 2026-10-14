import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import * as THREE from "three";
import { LDrawLoader } from "three/examples/jsm/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/examples/jsm/materials/LDrawConditionalLineMaterial.js";
import manifest from "../public/catalog/manifest.json";
import rbManifest from "../public/catalog/rebrickable-manifest.json";
import sourceConfig from "../data/catalog/source.json";
import { CATALOG } from "@/domain/catalog";
import {
  searchLibrary,
  type LibraryIndex,
  type LibraryPart,
  type LibraryColor,
} from "@/domain/library/types";
import {
  exportBrickLinkWantedList,
  shoppingReadiness,
  type SourcingLine,
} from "@/domain/library/shopping-list";

// Load large fixtures as data, avoiding huge inferred TypeScript literal types.
const index: LibraryIndex = JSON.parse(
  fs.readFileSync(
    new URL("../public/catalog/index.json", import.meta.url),
    "utf8",
  ),
);
const rbIndex: {
  parts: (LibraryPart & { observedColorIds: number[] })[];
  colors: (LibraryColor & { placeholder?: boolean })[];
} = JSON.parse(
  fs.readFileSync(
    new URL("../public/catalog/rebrickable-index.json", import.meta.url),
    "utf8",
  ),
);

const python = (code: string) => {
  const result = spawnSync("python3", ["-c", code], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

describe("Licensed broad part catalog", () => {
  it("contains thousands of real identities, including curves, glass, and plants without inventing orderable colors", () => {
    expect(index.parts.length).toBe(manifest.partCount);
    expect(index.parts.length).toBeGreaterThan(10000);
    expect(new Set(index.parts.map((p) => p.id)).size).toBe(index.parts.length);
    expect(new Set(index.parts.map((p) => p.category)).size).toBe(
      manifest.categoryCount,
    );
    expect(index.colors.length).toBe(manifest.colorCount);
    for (const id of Object.keys(CATALOG))
      expect(rbIndex.parts.some((p) => p.id === id)).toBe(true);
    expect(index.parts.find((p) => p.id === "3009")?.name).toBe("Brick 1 x 6");
    expect(index.parts.find((p) => p.id === "24866")?.tags).toContain(
      "Plants & flowers",
    );
    expect(index.parts.find((p) => p.id === "60601")?.tags).toContain(
      "Glass & windows",
    );
    expect(index.parts.find((p) => p.id === "11477")?.tags).toContain(
      "Rounded",
    );
    expect(manifest.source.archiveSha256).toBe(sourceConfig.archiveSha256);
    expect(manifest.source.snapshotDate).toBe("2026-09-30");
    expect(manifest.manufacturedPartColorCount).toBe(0);
    expect(manifest.verifiedConnectionCount).toBe(0);
    expect(manifest.verifiedPurchaseMappingCount).toBe(0);
  });

  it("searches identities, keywords, and features together", () => {
    expect(searchLibrary(index.parts, "24866")[0].id).toBe("24866");
    expect(
      searchLibrary(index.parts, "flower", "all", "Plants & flowers").length,
    ).toBeGreaterThan(5);
    expect(
      searchLibrary(index.parts, "curved 2", "Slope", "Rounded").every(
        (p) =>
          p.category === "Slope" && /curved/i.test(`${p.name} ${p.keywords}`),
      ),
    ).toBe(true);
    expect(searchLibrary(index.parts, "nonexistent part xyz")).toEqual([]);
  });

  it("keeps source identities and licenses in the database and reserves empty tables for verified mappings", () => {
    const audit = python(
      `import sqlite3,json\ndb=sqlite3.connect('public/catalog/brickmade.sqlite')\nprint(json.dumps({name:db.execute('SELECT COUNT(*) FROM '+name).fetchone()[0] for name in ['parts','identifiers','colors','part_colors','connections','purchase_mappings']}))`,
    );
    expect(audit).toEqual({
      parts: manifest.partCount,
      identifiers: manifest.partCount,
      colors: manifest.colorCount,
      part_colors: 0,
      connections: 0,
      purchase_mappings: 0,
    });
  });

  it("rejects aliases and unofficial or unlicensed entries and closes whitespace-prefixed dependencies", () => {
    const result = python(
      `import importlib.util,json\nspec=importlib.util.spec_from_file_location('importer','scripts/catalog/import_ldraw.py')\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nlicense='0 !LICENSE Redistributable under CCAL version 2.0 : see CAreadme.txt\\n'\npart='0 Brick 1 x 1\\n0 !LDRAW_ORG Part UPDATE 2022-01\\n'+license\nprimitive='0 Circle\\n0 !LDRAW_ORG Primitive UPDATE 2022-01\\n'+license+'3 16 0 0 0 1 0 0 0 1 0\\n'\nfiles={'parts/1.dat':('parts/1.dat',(part+'  1 16 0 0 0 1 0 0 0 1 0 0 0 1 circle.dat\\n').encode()),'p/circle.dat':('p/circle.dat',primitive.encode())}\nmpd,deps=m.make_preview('1',files)\nprint(json.dumps({'accepted':m.parse_part('parts/1.dat',part.encode()) is not None,'unofficial':m.parse_part('parts/1.dat',part.replace('Part UPDATE','Unofficial_Part UPDATE').encode()),'alias':m.parse_part('parts/1.dat',part.replace('Part UPDATE','Part Alias UPDATE').encode()),'unlicensed':m.parse_part('parts/1.dat',part.replace(license,'').encode()),'closed':'p/circle.dat' in deps and '1 16 0 0 0 1 0 0 0 1 0 0 0 1 p/circle.dat' in mpd}))`,
    );
    expect(result).toEqual({
      accepted: true,
      unofficial: null,
      alias: null,
      unlicensed: null,
      closed: true,
    });
  });

  it("renders all packaged shapes without fetching any missing geometry", async () => {
    const unexpectedFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(
        new Error("Preview dependencies must be self-contained"),
      );
    try {
      for (const preview of manifest.previews) {
        const loader = new LDrawLoader();
        loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
        const text = fs
          .readFileSync(`public/catalog/previews/${preview.id}.mpd`, "utf8")
          .replace(
            "0 FILE main.ldr",
            "0 FILE main.ldr\n0 !COLOUR Test CODE 10000 VALUE #CCCCCC EDGE #222222",
          )
          .replace(
            "1 16 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
            "1 10000 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
          );
        const group = await new Promise<THREE.Group>((resolve, reject) =>
          loader.parse(text, resolve, reject),
        );
        const bounds = new THREE.Box3()
          .setFromObject(group)
          .getSize(new THREE.Vector3());
        expect(bounds.toArray().every((n) => Number.isFinite(n) && n > 0)).toBe(
          true,
        );
        let vertices = 0;
        group.traverse((object) => {
          if (object instanceof THREE.Mesh)
            vertices += object.geometry.getAttribute("position").count;
        });
        expect(vertices).toBeGreaterThan(24);
        expect(
          fs.readFileSync(`public/catalog/previews/${preview.id}.svg`, "utf8"),
        ).toContain("The LDraw Parts Library");
      }
      expect(unexpectedFetch).not.toHaveBeenCalled();
    } finally {
      unexpectedFetch.mockRestore();
    }
  });
});

const verified: SourcingLine = {
  partId: "3009",
  quantity: 6,
  condition: "N",
  partColorVerified: true,
  brickLink: {
    partId: "3009",
    colorId: 5,
    status: "verified",
    evidence: "Explicit test fixture; not a live stock claim",
  },
};

describe("Whole-build shopping handoff safety", () => {
  it("exports exact quantities and merges duplicate provider identities", () => {
    const xml = exportBrickLinkWantedList([
      verified,
      { ...verified, quantity: 2 },
    ]);
    expect(xml).toContain(
      "<ITEMID>3009</ITEMID><COLOR>5</COLOR><MINQTY>8</MINQTY><CONDITION>N</CONDITION>",
    );
    expect(xml.match(/<ITEM>/g)).toHaveLength(1);
    expect(xml).not.toMatch(/PRICE|TOTAL|BUY|ORDER/);
  });
  it.each([
    { ...verified, partColorVerified: false },
    { ...verified, brickLink: undefined },
    {
      ...verified,
      brickLink: { ...verified.brickLink!, status: "ambiguous" as const },
    },
    { ...verified, brickLink: { ...verified.brickLink!, evidence: "" } },
    { ...verified, quantity: 1.5 },
    { ...verified, quantity: 0 },
    {
      ...verified,
      brickLink: { ...verified.brickLink!, partId: "<malformed>" },
    },
    { ...verified, brickLink: { ...verified.brickLink!, colorId: -1 } },
  ])("blocks unresolved or malformed buying identities %#", (line) => {
    expect(shoppingReadiness([line]).ready).toBe(false);
    expect(() => exportBrickLinkWantedList([line])).toThrow(/Resolve every/);
  });
  it("rejects an empty list and keeps new/used conditions separate", () => {
    expect(shoppingReadiness([]).ready).toBe(false);
    const xml = exportBrickLinkWantedList([
      verified,
      { ...verified, condition: "U" },
    ]);
    expect(xml.match(/<ITEM>/g)).toHaveLength(2);
  });
});

describe("Current Rebrickable catalog enrichment", () => {
  it("keeps recorded part/colors and source identities distinct from renderer colors and supplier stock", () => {
    expect(rbIndex.parts.length).toBe(rbManifest.partCount);
    expect(rbIndex.parts.length).toBeGreaterThan(60000);
    expect(rbManifest.observedPartColorCount).toBeGreaterThan(100000);
    expect(rbManifest.elementCount).toBeGreaterThan(110000);
    const palette = new Set(
      rbIndex.colors.filter((c) => !c.placeholder).map((c) => c.id),
    );
    expect(palette.size).toBe(rbManifest.colorCount);
    for (const part of rbIndex.parts)
      expect(part.observedColorIds.every((id) => palette.has(id))).toBe(true);
    expect(rbIndex.parts.find((p) => p.id === "3009")?.name).toBe(
      "Brick 1 x 6",
    );
    expect(
      rbIndex.parts.find((p) => p.id === "60601")?.observedColorIds,
    ).toContain(47);
    expect(rbIndex.parts.find((p) => p.id === "24866")?.tags).toContain(
      "Plants & flowers",
    );
    expect(rbManifest.stockVerified).toBe(false);
    expect(rbManifest.providerMappingsVerified).toBe(false);
    expect(rbManifest.source.permission).toContain("including commercial");
  });
  it("retains all source namespaces, element evidence, and foreign-key integrity in SQLite", () => {
    const audit = python(`import sqlite3,json
db=sqlite3.connect('public/catalog/brickmade.sqlite')
print(json.dumps({'parts':db.execute('select count(*) from rb_parts').fetchone()[0],'pairs':db.execute('select count(*) from rb_part_color_observations').fetchone()[0],'elements':db.execute('select count(*) from rb_elements').fetchone()[0],'foreignKeyIssues':len(db.execute('pragma foreign_key_check').fetchall()),'observationStatuses':[r[0] for r in db.execute('select distinct status from rb_part_color_observations')]}))`);
    expect(audit).toEqual({
      parts: rbManifest.partCount,
      pairs: rbManifest.observedPartColorCount,
      elements: rbManifest.elementCount,
      foreignKeyIssues: 0,
      observationStatuses: ["observed"],
    });
  });
});

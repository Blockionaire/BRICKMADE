import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as THREE from "three";
import { LDrawLoader } from "three/examples/jsm/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/examples/jsm/materials/LDrawConditionalLineMaterial.js";
import {
  BUILDER_PARTS,
  BUILDER_BY_REBRICKABLE,
  PART_PROFILES,
  PART_UNITS,
} from "@/domain/parts/profiles";
import { CATALOG } from "@/domain/catalog";

import {
  compatibleFamily,
  findMates,
  inspectMate,
  quarterTurn,
  snapPose,
  worldConnectors,
  channelKey,
  SEATING_TOLERANCE,
} from "@/domain/parts/connections";
import {
  decodeBuilderMesh,
  createPartGeometry,
} from "@/services/builder-geometry";
import type { PartPose, Vec3 } from "@/domain/parts/types";

const pose = (
  id: string,
  partId: string,
  position: Vec3 = [0, 0, 0],
  turns = 0,
): PartPose => ({ id, partId, position, rotation: quarterTurn(turns) });
const bytes = (id: string) => {
  const p = PART_PROFILES.get(id)!;
  const b = fs.readFileSync(`public${p.mesh.file}`);
  return b.buffer.slice(
    b.byteOffset,
    b.byteOffset + b.byteLength,
  ) as ArrayBuffer;
};
describe("Accurate real geometry in the builder", () => {
  it("covers all house identities with explicit namespaces and correct physical scale", () => {
    expect(BUILDER_PARTS).toHaveLength(47);
    expect(PART_UNITS.studMillimetres).toBe(8);
    expect(PART_UNITS.lduMillimetres).toBe(0.4);
    expect(BUILDER_BY_REBRICKABLE.get("3023")!.id).toBe("3023b");
    for (const part of Object.values(CATALOG).filter((p) =>
      [
        "3001",
        "3003",
        "3004",
        "3005",
        "3009",
        "3010",
        "3020",
        "3022",
        "3023",
        "3024",
        "3068b",
        "3070b",
      ].includes(p.id),
    )) {
      const p = BUILDER_BY_REBRICKABLE.get(part.id)!;
      expect(p).toBeDefined();
      expect(p.bodySize).toEqual([part.width, part.height, part.depth]);
      expect(part.height * 8).toBeCloseTo(
        part.category === "Brick" ? 9.6 : 3.2,
      );
      const bounds = p.mesh.bounds;
      expect(bounds[0]).toBeCloseTo(-part.width / 2);
      expect(bounds[3]).toBeCloseTo(part.width / 2);
      expect(bounds[1]).toBeCloseTo(-part.height / 2);
      expect(bounds[4]).toBeCloseTo(part.height / 2 + (part.studs ? 0.2 : 0));
    }
  });
  it("checks every mesh checksum, length, normals, material ranges, and finite bounds", () => {
    for (const p of BUILDER_PARTS) {
      const raw = bytes(p.id);
      expect(
        createHash("sha256").update(new Uint8Array(raw)).digest("hex"),
      ).toBe(p.mesh.sha256);
      expect(raw.byteLength).toBe(p.mesh.bytes);
      const decoded = decodeBuilderMesh(raw, p.mesh.vertexCount);
      const geometry = createPartGeometry(p.id, decoded);
      expect(decoded.positions.length).toBe(p.mesh.vertexCount * 3);
      let maximumNormalError = 0;
      for (let i = 0; i < decoded.normals.length; i += 3)
        maximumNormalError = Math.max(
          maximumNormalError,
          Math.abs(
            Math.hypot(
              decoded.normals[i],
              decoded.normals[i + 1],
              decoded.normals[i + 2],
            ) - 1,
          ),
        );
      expect(maximumNormalError).toBeLessThan(0.00005);
      expect(geometry.boundingBox!.min.toArray()).toEqual(
        p.mesh.bounds.slice(0, 3),
      );
      expect(geometry.boundingBox!.max.toArray()).toEqual(
        p.mesh.bounds.slice(3),
      );
      const covered = new Set<number>();
      let overlap = false;
      for (const g of p.mesh.groups) {
        expect(g.start + g.count).toBeLessThanOrEqual(p.mesh.vertexCount);
        for (let i = g.start; i < g.start + g.count; i++) {
          if (covered.has(i)) overlap = true;
          covered.add(i);
        }
      }
      expect(covered.size).toBe(p.mesh.vertexCount);
      expect(overlap).toBe(false);
      geometry.dispose();
      const document = fs.readFileSync(`public${p.geometryFile}`, "utf8");
      expect(createHash("sha256").update(document).digest("hex")).toBe(
        p.geometrySha256,
      );
      expect(document).toContain(p.source.author);
      expect(p.source.url).toMatch(/^https:\/\/library\.ldraw\.org\//);
      for (const c of p.connectors) {
        expect(document).toContain(`0 FILE ${c.evidence.file}`);
        expect(Math.hypot(...c.normal)).toBeCloseTo(1);
        expect(c.status).toBe("geometry-reviewed");
      }
    }
  });
  it.each(["3005", "3023b", "11477", "3039", "2780", "4070", "24866"])(
    "%s compiled bounds equal uniformly transformed original surfaces",
    async (id) => {
      const p = PART_PROFILES.get(id)!;
      const text = fs
        .readFileSync(`public${p.geometryFile}`, "utf8")
        .replace(
          "0 FILE main.ldr",
          "0 FILE main.ldr\n0 !COLOUR Test CODE 10000 VALUE #CCCCCC EDGE #222222",
        )
        .replace(
          "1 16 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
          "1 10000 0 0 0 1 0 0 0 1 0 0 0 1 parts/",
        );
      const loader = new LDrawLoader();
      loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
      const original = await new Promise<THREE.Group>((resolve, reject) =>
        loader.parse(text, resolve, reject),
      );
      original.rotation.x = Math.PI;
      original.scale.setScalar(0.05);
      original.position.set(
        -p.centerLdu[0] / 20,
        p.centerLdu[1] / 20,
        p.centerLdu[2] / 20,
      );
      original.updateMatrixWorld(true);
      const bounds = new THREE.Box3();
      let vertices = 0;
      original.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          bounds.expandByObject(o);
          vertices += o.geometry.getAttribute("position").count;
        }
      });
      expect(vertices).toBe(p.mesh.vertexCount);
      [...bounds.min.toArray(), ...bounds.max.toArray()].forEach((n, i) =>
        expect(n).toBeCloseTo(p.mesh.bounds[i], 5),
      );
    },
  );
  it("rejects corrupt geometry rather than drawing substitute boxes", () => {
    const buffer = bytes("3005");
    expect(() => decodeBuilderMesh(buffer.slice(0, -4), 228)).toThrow();
    const wrong = buffer.slice(0);
    new DataView(wrong).setUint32(0, 0, true);
    expect(() => decodeBuilderMesh(wrong, 228)).toThrow();
    const bad = buffer.slice(0);
    new DataView(bad).setFloat32(12, NaN, true);
    expect(() => decodeBuilderMesh(bad, 228)).toThrow();
  });
  it("stores reviewed profiles separately from unverified source connections and supplier mappings", () => {
    const result = spawnSync(
      "python3",
      [
        "-c",
        `import sqlite3,json\nc=sqlite3.connect('public/catalog/brickmade.sqlite')\nprint(json.dumps({'parts':c.execute('select count(*) from builder_parts').fetchone()[0],'connectors':c.execute('select count(*) from builder_connectors').fetchone()[0],'verified':c.execute('select count(*) from connections').fetchone()[0],'fk':c.execute('pragma foreign_key_check').fetchall()}))`,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      parts: 47,
      connectors: 393,
      verified: 0,
      fk: [],
    });
  });
});
describe("Evidence-based mating and snapping", () => {
  it("finds four seated connections between a brick and plate, including a quarter turn", () => {
    for (const turn of [0, 1, 2, 3]) {
      const base = pose("base", "3020"),
        brick = pose("brick", "3003", [-1, 0.8, 0], turn);
      const result = findMates([base, brick]);
      expect(result.mates).toHaveLength(4);
      expect(result.mates.every((m) => m.family === "stud")).toBe(true);
      expect(result.unconnected).toEqual([]);
    }
  });
  it("rejects same gender, excessive insertion depth, wrong diameter, off-axis and floating pieces", () => {
    const a = worldConnectors(pose("a", "3005"))[0],
      b = worldConnectors(pose("b", "3024", [0, 0.8, 0]))[1];
    expect(inspectMate(a, b).mate).toBeDefined();
    expect(compatibleFamily(a, { ...b, kind: "stud" })).toBeUndefined();
    expect(compatibleFamily(a, { ...b, radius: 0.25 })).toBeUndefined();
    expect(compatibleFamily(a, { ...b, radius: NaN })).toBeUndefined();
    expect(compatibleFamily(a, { ...b, depth: -1 })).toBeUndefined();
    expect(compatibleFamily(a, { ...b, normal: [0, -2, 0] })).toBeUndefined();
    expect(compatibleFamily({ ...a, depth: 0.5 }, b)).toBeUndefined();
    expect(
      inspectMate(a, { ...b, position: [0, 0.6 + SEATING_TOLERANCE * 2, 0] })
        .mate,
    ).toBeUndefined();
    expect(inspectMate(a, { ...b, normal: [1, 0, 0] }).mate).toBeUndefined();
    expect(inspectMate(a, { ...b, pieceId: "a" }).mate).toBeUndefined();
  });
  it("does not connect to the top of a tile or the empty centre of an arch", () => {
    expect(
      PART_PROFILES.get("3068b")!.connectors.every(
        (c) => c.kind === "anti-stud",
      ),
    ).toBe(true);
    expect(
      findMates([pose("tile", "3068b"), pose("brick", "3005", [0.5, 0.8, 0.5])])
        .mates,
    ).toEqual([]);
    const arch = PART_PROFILES.get("3659")!;
    expect(
      arch.connectors
        .filter((c) => c.kind === "anti-stud")
        .map((c) => c.position[0]),
    ).toEqual([-1.5, 1.5]);
  });
  it("snaps a tile sideways onto the real recessed headlight stud", () => {
    const base = pose("headlight", "4070");
    const target = worldConnectors(base).find(
      (c) => c.kind === "stud" && c.normal[2] === 1,
    )!;
    const tile = pose("tile", "3024"),
      socket = PART_PROFILES.get("3024")!.connectors.find(
        (c) => c.kind === "anti-stud",
      )!;
    const snapped = snapPose(tile, socket.id, target);
    snapped.position.forEach((n, i) => expect(n).toBeCloseTo([0, 0.1, 0.5][i]));
    expect(findMates([base, snapped]).mates).toHaveLength(1);
    for (const twist of [90, 180, 270])
      expect(
        findMates([base, snapPose(tile, socket.id, target, twist)]).mates,
      ).toHaveLength(1);
  });
  it("seats a Technic pin collar on either hole face without conflating studs and pin holes", () => {
    const brick = pose("brick", "3700"),
      pin = pose("pin", "2780"),
      connector = PART_PROFILES.get("2780")!.connectors[0];
    for (const hole of worldConnectors(brick).filter(
      (c) => c.kind === "pin-hole",
    )) {
      const inserted = snapPose(pin, connector.id, hole),
        result = findMates([brick, inserted]);
      expect(result.mates).toHaveLength(1);
      expect(result.mates[0].family).toBe("pin");
      expect(inserted.position[1]).toBeCloseTo(0.1);
      expect(Math.abs(inserted.position[2])).toBeCloseTo(0.5);
      expect(
        compatibleFamily(connector, { ...hole, collarDepth: 0.05 }),
      ).toBeUndefined();
      expect(
        compatibleFamily(connector, { ...hole, collarRadius: 0.3 }),
      ).toBeUndefined();
      expect(
        compatibleFamily(connector, { ...hole, collarRadius: undefined }),
      ).toBeUndefined();
      expect(
        inspectMate(
          result.mates[0].a,
          result.mates[0].b,
          new Set([channelKey(hole)]),
        ).mate,
      ).toBeUndefined();
      expect(() => snapPose(pose("stud", "3005"), "stud-1", hole)).toThrow();
    }
  });
  it("pairs only reviewed window parts and never invents a fit for axles, unknown parts or invalid transforms", () => {
    expect(
      findMates([pose("frame", "60592"), pose("pane", "60601")]).mates.map(
        (m) => m.family,
      ),
    ).toEqual(["window"]);
    expect(worldConnectors(pose("unknown", "999999999"))).toEqual([]);
    expect(PART_PROFILES.get("3705")!.connectors).toEqual([]);
    expect(() =>
      worldConnectors({ ...pose("bad", "3005"), rotation: [0, 0, 0, 2] }),
    ).toThrow();
    expect(() =>
      worldConnectors({ ...pose("bad", "3005"), position: [NaN, 0, 0] }),
    ).toThrow();
    expect(() =>
      findMates([pose("same", "3005"), pose("same", "3024")]),
    ).toThrow();
    expect(() =>
      snapPose(
        pose("pane", "60601"),
        "fake",
        worldConnectors(pose("frame", "60592"))[0],
      ),
    ).toThrow();
  });
  it("locks the reviewed window pair upright and rejects other datums and competing inserts", () => {
    const frame = pose("frame", "60592"),
      pane = pose("pane", "60601"),
      target = worldConnectors(frame).find((c) => c.kind === "window-seat")!,
      socket = PART_PROFILES.get("60601")!.connectors[0];
    const seated = snapPose(pane, socket.id, target);
    expect(findMates([frame, seated]).mates).toHaveLength(1);
    for (const turn of [90, 180, 270])
      expect(
        findMates([frame, snapPose(pane, socket.id, target, turn)]).mates,
      ).toHaveLength(0);
    expect(
      compatibleFamily(socket, { ...target, pairCode: "unreviewed" }),
    ).toBeUndefined();
    expect(
      compatibleFamily(socket, { ...target, up: [NaN, 1, 0] }),
    ).toBeUndefined();
    expect(
      findMates([frame, seated, { ...seated, id: "competitor" }]).mates,
    ).toHaveLength(1);
  });
  it("finds plant and curved-slope fits only at their reviewed underside datum", () => {
    for (const id of ["24866", "2423", "11477", "30176"]) {
      const base = pose("base", "3005"),
        target = worldConnectors(base)[0],
        moving = pose("moving", id),
        socket = PART_PROFILES.get(id)!.connectors.find(
          (c) => c.kind === "anti-stud",
        )!;
      expect(
        findMates([base, snapPose(moving, socket.id, target)]).mates,
      ).toHaveLength(1);
    }
    const slope = PART_PROFILES.get("11477")!;
    expect(slope.connectors).toHaveLength(1);
    expect(slope.connectors[0].position).toEqual([0, -0.4, 0.5]);
  });
  it("keeps connected-pose results invariant under a global arbitrary rotation and translation", () => {
    const pair = [pose("base", "3020"), pose("brick", "3003", [-1, 0.8, 0])];
    const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.2, 0.7, -0.4),
      ),
      translation = new THREE.Vector3(2, 5, -3);
    const transformed = pair.map((p) => ({
      ...p,
      position: new THREE.Vector3(...p.position)
        .applyQuaternion(rotation)
        .add(translation)
        .toArray() as Vec3,
      rotation: rotation
        .clone()
        .multiply(new THREE.Quaternion(...p.rotation))
        .toArray() as PartPose["rotation"],
    }));
    expect(findMates(transformed).mates).toHaveLength(4);
  });
  it("does not assign one socket or a full-depth pin channel to two competing parts", () => {
    expect(
      findMates([
        pose("base", "3005"),
        pose("a", "3024", [0, 0.8, 0]),
        pose("b", "3024", [0, 0.8, 0]),
      ]).mates,
    ).toHaveLength(1);
    const target = pose("brick", "3700"),
      holes = worldConnectors(target).filter((c) => c.kind === "pin-hole"),
      pins = holes.map((h, i) =>
        snapPose(
          pose(`pin-${i}`, "2780"),
          PART_PROFILES.get("2780")!.connectors[0].id,
          h,
        ),
      );
    expect(findMates([target, ...pins]).mates).toHaveLength(1);
  });
});

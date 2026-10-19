import data from "../../../public/catalog/builder-runtime.json" with { type: "json" };
import type { BuilderPart, Connector, ConnectorKind } from "./types";

type PackedConnector = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
  number,
];
type PackedPart = Omit<
  BuilderPart,
  "connectors" | "mesh" | "source" | "collision" | "admission"
> & {
  mesh: Omit<BuilderPart["mesh"], "file">;
  source: [string, string];
  collision: [string, number, number];
  admission: [NonNullable<BuilderPart["admission"]>["status"], number, number];
  connectors: PackedConnector[];
};
interface PackedLibrary {
  kinds: ConnectorKind[];
  evidence: string[];
  parts: PackedPart[];
}
/** Parts-library profiles ship packed (scripts/catalog/package_builder_runtime.py). */
export function unpackLibrary(
  library: PackedLibrary,
  recordBaseUrl: string,
): BuilderPart[] {
  return library.parts.map((p) => ({
    ...p,
    batch: "library",
    geometryFile: `build-cache:geometry/${p.id}.mpd`,
    mesh: { ...p.mesh, file: `/catalog/geometry/${p.id}.bin` },
    source: {
      file: `parts/${p.id}.dat`,
      sha256: "",
      author: p.source[0],
      license: p.source[1],
      url: `${recordBaseUrl}${p.id}.dat`,
    },
    collision: {
      file: `/catalog/collision/${p.id}.bvox`,
      sha256: p.collision[0],
      bytes: p.collision[1],
      occupiedCells: p.collision[2],
      resolution: 0.05,
    } as BuilderPart["collision"],
    admission: {
      status: p.admission[0],
      physicalStatus: "untested",
      acceptedPorts: p.admission[1],
      rejectedPorts: p.admission[2],
    },
    connectors: p.connectors.map(
      ([index, kind, x, y, z, nx, ny, nz, evidence, sections, slide]) => {
        const k = library.kinds[kind];
        const c: Connector = {
          id: `${k}-${index}`,
          kind: k,
          position: [x, y, z],
          normal: [nx, ny, nz],
          radius: 0.3,
          depth: 0.2,
          status: "geometry-reviewed",
          evidence: { file: library.evidence[evidence], method: "ldcad-snap" },
        };
        if (sections) {
          c.sections = sections.split(" ").map((s) => {
            const [radius, length] = s.slice(1).split(":").map(Number);
            return { shape: s[0], radius, length };
          });
          c.radius = Math.max(...c.sections.map((s) => s.radius));
          c.depth =
            Math.round(c.sections.reduce((n, s) => n + s.length, 0) * 1e6) /
            1e6;
          c.slide = !!slide;
        }
        return c;
      },
    ),
  }));
}
// The operational subset is separate from the 64,895-entry source catalog.
export const LIBRARY_PARTS = unpackLibrary(
  (data as unknown as { library: PackedLibrary }).library ?? {
    kinds: [],
    evidence: [],
    parts: [],
  },
  data.source.recordBaseUrl,
);
export const BUILDER_PARTS = [
  ...(data.parts as unknown as BuilderPart[]),
  ...LIBRARY_PARTS,
];
export const PART_PROFILES = new Map(BUILDER_PARTS.map((p) => [p.id, p]));
export const BUILDER_BY_REBRICKABLE = new Map(
  BUILDER_PARTS.map((p) => [p.rebrickableId, p]),
);
export const PART_UNITS = data.units;
export const PROFILE_VERSION = data.profileVersion;

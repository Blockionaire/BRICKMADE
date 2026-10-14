export type Vec3 = [number, number, number];
export type Quaternion = [number, number, number, number];
export type ConnectorKind = "stud" | "anti-stud" | "pin" | "pin-hole";
export interface Connector {
  id: string;
  kind: ConnectorKind;
  position: Vec3;
  /** Outward from the socket, or from a male seating plane along its shaft. */
  normal: Vec3;
  radius: number;
  depth: number;
  collarRadius?: number;
  collarDepth?: number;
  channel?: string;
  status: "geometry-reviewed";
  evidence: { file: string; method: string; primitive?: string };
}
export interface BuilderPart {
  id: string;
  rebrickableId: string;
  name: string;
  category: string;
  tags: string[];
  centerLdu: Vec3;
  bodySize: Vec3 | null;
  connectors: Connector[];
  coverage: "partial" | "stud-system";
  unknownMechanisms: string[];
  source: {
    file: string;
    sha256: string;
    author: string;
    license: string;
    url: string;
  };
  geometryFile: string;
  geometrySha256: string;
  mesh: {
    file: string;
    sha256: string;
    bytes: number;
    vertexCount: number;
    bounds: number[];
    groups: {
      start: number;
      count: number;
      code: string;
      hex: string;
      alpha: number;
    }[];
  };
}
export interface PartPose {
  id: string;
  partId: string;
  position: Vec3;
  rotation: Quaternion;
}
export interface WorldConnector extends Connector {
  pieceId: string;
  partId: string;
}
export interface Mate {
  a: WorldConnector;
  b: WorldConnector;
  distance: number;
  family: "stud" | "pin";
  status: "geometry-compatible";
}

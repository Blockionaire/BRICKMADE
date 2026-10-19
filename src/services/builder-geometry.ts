import * as THREE from "three";
import { PART_PROFILES, PROFILE_VERSION } from "@/domain/parts/profiles";
import { assetPath } from "@/lib/asset-path";

export interface DecodedMesh {
  positions: Float32Array;
  normals: Float32Array;
}
const pending = new Map<string, Promise<DecodedMesh>>();
/** Decode strictly; a corrupt or mismatched resource never becomes a fake box.
 * Version 1 stores Float32 triangles; version 2 (parts library) stores quantised,
 * indexed vertices (see scripts/catalog/mesh-format.mjs). Both decode to the same
 * non-indexed arrays, so groups and consumers are unchanged.
 */
export function decodeBuilderMesh(
  buffer: ArrayBuffer,
  expectedVertices: number,
): DecodedMesh {
  if (buffer.byteLength < 12) throw Error("Truncated part geometry.");
  const header = new DataView(buffer),
    version = header.getUint32(4, true),
    count = header.getUint32(8, true);
  if (
    header.getUint32(0, true) !== 0x45474d42 ||
    count !== expectedVertices ||
    count % 3 !== 0
  )
    throw Error("Part geometry version or size mismatch.");
  const positions = new Float32Array(count * 3),
    normals = new Float32Array(count * 3);
  if (version === 1) {
    if (buffer.byteLength !== 12 + count * 24)
      throw Error("Part geometry version or size mismatch.");
    for (let i = 0; i < count * 3; i++) {
      positions[i] = header.getFloat32(12 + i * 4, true);
      normals[i] = header.getFloat32(12 + count * 12 + i * 4, true);
      if (!Number.isFinite(positions[i]) || !Number.isFinite(normals[i]))
        throw Error("Invalid part vertex.");
    }
    return { positions, normals };
  }
  if (version !== 2 || buffer.byteLength < 40)
    throw Error("Part geometry version or size mismatch.");
  const unique = header.getUint32(12, true),
    wide = unique > 65535,
    normalBytes = Math.ceil((unique * 3) / 4) * 4,
    base = 40 + unique * 6 + normalBytes;
  if (buffer.byteLength !== base + count * (wide ? 4 : 2))
    throw Error("Part geometry version or size mismatch.");
  const box = [0, 1, 2, 3, 4, 5].map((i) =>
    header.getFloat32(16 + i * 4, true),
  );
  if (!box.every(Number.isFinite)) throw Error("Invalid part vertex.");
  const span = [0, 1, 2].map((a) => box[a + 3] - box[a] || 1),
    quantised = new Uint16Array(unique * 3),
    directions = new Float32Array(unique * 3);
  for (let u = 0; u < unique; u++) {
    let length = 0;
    for (let a = 0; a < 3; a++) {
      quantised[u * 3 + a] = header.getUint16(40 + u * 6 + a * 2, true);
      const n = header.getInt8(40 + unique * 6 + u * 3 + a);
      directions[u * 3 + a] = n;
      length += n * n;
    }
    length = Math.sqrt(length) || 1;
    for (let a = 0; a < 3; a++) directions[u * 3 + a] /= length;
  }
  for (let v = 0; v < count; v++) {
    const index = wide
      ? header.getUint32(base + v * 4, true)
      : header.getUint16(base + v * 2, true);
    if (index >= unique) throw Error("Invalid part vertex.");
    for (let a = 0; a < 3; a++) {
      positions[v * 3 + a] =
        box[a] + (quantised[index * 3 + a] / 65535) * span[a];
      normals[v * 3 + a] = directions[index * 3 + a];
    }
  }
  return { positions, normals };
}
export function loadBuilderMesh(id: string): Promise<DecodedMesh> {
  const existing = pending.get(id);
  if (existing) return existing;
  const profile = PART_PROFILES.get(id);
  if (!profile?.mesh)
    return Promise.reject(Error("This part has no packaged builder geometry."));
  const request = fetch(assetPath(`${profile.mesh.file}?v=${PROFILE_VERSION}`))
    .then(async (response) => {
      if (!response.ok) throw Error("The real part geometry could not load.");
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== profile.mesh.bytes)
        throw Error("Part geometry size mismatch.");
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const hex = Array.from(new Uint8Array(digest), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
      if (hex !== profile.mesh.sha256)
        throw Error("Part geometry checksum mismatch.");
      return decodeBuilderMesh(buffer, profile.mesh.vertexCount);
    })
    .catch((error) => {
      pending.delete(id);
      throw error;
    });
  pending.set(id, request);
  return request;
}
export function createPartGeometry(
  id: string,
  data: DecodedMesh,
): THREE.BufferGeometry {
  const profile = PART_PROFILES.get(id);
  if (!profile) throw Error("Unknown builder part.");
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(data.positions, 3),
  );
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  profile.mesh.groups.forEach((g, i) => geometry.addGroup(g.start, g.count, i));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
export function createPartMaterials(
  id: string,
  color: string,
  alpha = 1,
): THREE.MeshStandardMaterial[] {
  const profile = PART_PROFILES.get(id);
  if (!profile) throw Error("Unknown builder part.");
  return profile.mesh.groups.map((g) => {
    const inherited = g.code === "16" || g.code === "10000";
    const opacity = inherited ? alpha : g.alpha / 255;
    return new THREE.MeshStandardMaterial({
      color: inherited ? color : g.hex,
      roughness: 0.3,
      metalness: 0.025,
      opacity,
      transparent: opacity < 1,
      depthWrite: opacity === 1,
      side: THREE.DoubleSide,
    });
  });
}

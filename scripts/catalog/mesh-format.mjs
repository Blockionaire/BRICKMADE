/** BrickMade builder mesh binaries ('BMGE').
 * Version 1: uint32 magic, version, vertex count; Float32 XYZ positions then normals.
 * Version 2 (compact, used by the parts library): uint32 magic, version, vertex count,
 * unique count; Float32 quantisation box (min xyz, max xyz); uint16 XYZ positions
 * relative to the box; int8 XYZ normals (padded to 4 bytes); uint16 or uint32 indices
 * (uint32 when unique count > 65535), one per vertex. Decoding expands the indices,
 * so both versions yield the same non-indexed triangle arrays and group ranges.
 */
export const MAGIC = 0x45474d42;
const STEPS = 65535;

export function encodeMeshV2(positions, normals) {
  const count = positions.length / 3;
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const a = i % 3;
    box[a] = Math.min(box[a], positions[i]);
    box[a + 3] = Math.max(box[a + 3], positions[i]);
  }
  // Float32 round-trip so the encoder and decoder dequantise identically.
  const f32 = new Float32Array(box);
  const span = [0, 1, 2].map((a) => f32[a + 3] - f32[a] || 1);
  const keys = new Map(),
    qp = [],
    qn = [],
    indices = new Uint32Array(count);
  for (let v = 0; v < count; v++) {
    const p = [0, 1, 2].map((a) =>
      Math.round(((positions[v * 3 + a] - f32[a]) / span[a]) * STEPS),
    );
    let n = [0, 1, 2].map((a) =>
      Math.max(-127, Math.min(127, Math.round(normals[v * 3 + a] * 127))),
    );
    // Degenerate (zero-area) source triangles have no normal; any unit one will do.
    if (!n[0] && !n[1] && !n[2]) n = [0, 127, 0];
    const key = p.join(",") + "|" + n.join(",");
    let index = keys.get(key);
    if (index === undefined) {
      index = keys.size;
      keys.set(key, index);
      qp.push(...p);
      qn.push(...n);
    }
    indices[v] = index;
  }
  const unique = keys.size,
    wide = unique > 65535;
  const normalBytes = Math.ceil((unique * 3) / 4) * 4;
  const buffer = Buffer.alloc(
    40 + unique * 6 + normalBytes + count * (wide ? 4 : 2),
  );
  buffer.writeUInt32LE(MAGIC, 0);
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(count, 8);
  buffer.writeUInt32LE(unique, 12);
  f32.forEach((n, i) => buffer.writeFloatLE(n, 16 + i * 4));
  let o = 40;
  for (const n of qp) {
    buffer.writeUInt16LE(n, o);
    o += 2;
  }
  for (const n of qn) {
    buffer.writeInt8(n, o);
    o += 1;
  }
  o = 40 + unique * 6 + normalBytes;
  for (const n of indices) {
    if (wide) buffer.writeUInt32LE(n, o);
    else buffer.writeUInt16LE(n, o);
    o += wide ? 4 : 2;
  }
  return buffer;
}

/** Decode either version to non-indexed Float32 positions and normals. */
export function decodeMesh(buffer) {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  if (buffer.byteLength < 12 || view.getUint32(0, true) !== MAGIC)
    throw Error("Not a builder mesh");
  const version = view.getUint32(4, true),
    count = view.getUint32(8, true);
  const positions = new Float32Array(count * 3),
    normals = new Float32Array(count * 3);
  if (version === 1) {
    if (buffer.byteLength !== 12 + count * 24)
      throw Error("Mesh size mismatch");
    for (let i = 0; i < count * 3; i++) {
      positions[i] = view.getFloat32(12 + i * 4, true);
      normals[i] = view.getFloat32(12 + count * 12 + i * 4, true);
    }
    return { positions, normals };
  }
  if (version !== 2) throw Error("Unknown mesh version");
  const unique = view.getUint32(12, true),
    wide = unique > 65535,
    normalBytes = Math.ceil((unique * 3) / 4) * 4;
  if (
    buffer.byteLength !==
    40 + unique * 6 + normalBytes + count * (wide ? 4 : 2)
  )
    throw Error("Mesh size mismatch");
  const box = [0, 1, 2, 3, 4, 5].map((i) => view.getFloat32(16 + i * 4, true));
  const span = [0, 1, 2].map((a) => box[a + 3] - box[a] || 1);
  const base = 40 + unique * 6 + normalBytes;
  for (let v = 0; v < count; v++) {
    const index = wide
      ? view.getUint32(base + v * 4, true)
      : view.getUint16(base + v * 2, true);
    if (index >= unique) throw Error("Mesh index out of range");
    let length = 0;
    const n = [0, 1, 2].map((a) => {
      const value = view.getInt8(40 + unique * 6 + index * 3 + a);
      length += value * value;
      return value;
    });
    length = Math.sqrt(length) || 1;
    for (let a = 0; a < 3; a++) {
      positions[v * 3 + a] =
        box[a] +
        (view.getUint16(40 + index * 6 + a * 2, true) / STEPS) * span[a];
      normals[v * 3 + a] = n[a] / length;
    }
  }
  return { positions, normals };
}

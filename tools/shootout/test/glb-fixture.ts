/**
 * Tiny GLB writers, so the voxelizer is testable with no network and no key.
 *
 * Both shapes are closed triangle meshes written the way a real exporter does:
 * a float32 POSITION accessor and a uint32 index accessor over one BIN chunk,
 * hung off a single scene node (with an optional node transform, to exercise
 * the transform walk).
 */

export interface MeshData {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

/** A UV sphere of radius `r`, centred at the origin. */
export function sphereMesh(r = 1, segments = 24, rings = 16): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const phi = (ring / rings) * Math.PI;
    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2;
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
    }
  }
  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * stride + seg;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

/** A torus in the XZ plane (hole along Y), major radius `R`, minor `r`. */
export function torusMesh(R = 1, r = 0.3, major = 32, minor = 16): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= major; i++) {
    const u = (i / major) * Math.PI * 2;
    for (let j = 0; j <= minor; j++) {
      const v = (j / minor) * Math.PI * 2;
      const ring = R + r * Math.cos(v);
      positions.push(ring * Math.cos(u), r * Math.sin(v), ring * Math.sin(u));
    }
  }
  const stride = minor + 1;
  for (let i = 0; i < major; i++) {
    for (let j = 0; j < minor; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

/** Pack a mesh into a minimal but spec-shaped `.glb`. */
export function writeGlb(mesh: MeshData, node: Record<string, unknown> = {}): Uint8Array {
  const positionBytes = new Uint8Array(mesh.positions.buffer.slice(0));
  const indexBytes = new Uint8Array(mesh.indices.buffer.slice(0));
  const indexOffset = align4(positionBytes.byteLength);
  const binLength = align4(indexOffset + indexBytes.byteLength);
  const bin = new Uint8Array(binLength);
  bin.set(positionBytes, 0);
  bin.set(indexBytes, indexOffset);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    minX = Math.min(minX, mesh.positions[i]!); maxX = Math.max(maxX, mesh.positions[i]!);
    minY = Math.min(minY, mesh.positions[i + 1]!); maxY = Math.max(maxY, mesh.positions[i + 1]!);
    minZ = Math.min(minZ, mesh.positions[i + 2]!); maxZ = Math.max(maxZ, mesh.positions[i + 2]!);
  }

  const gltf = {
    asset: { version: "2.0", generator: "terrainist-shootout-fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...node }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: mesh.positions.length / 3,
        type: "VEC3",
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      { bufferView: 1, componentType: 5125, count: mesh.indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: binLength }],
  };

  const jsonBytes = padTo4(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const total = 12 + 8 + jsonBytes.byteLength + 8 + bin.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const binHeader = 20 + jsonBytes.byteLength;
  view.setUint32(binHeader, bin.byteLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  out.set(bin, binHeader + 8);
  return out;
}

function align4(n: number): number {
  return n + ((4 - (n % 4)) % 4);
}

function padTo4(bytes: Uint8Array, filler: number): Uint8Array {
  const padded = new Uint8Array(align4(bytes.byteLength)).fill(filler);
  padded.set(bytes, 0);
  return padded;
}

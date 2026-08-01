/**
 * GLB → blocks JSON, with no dependencies beyond the standard library.
 *
 * Three stages, each independently testable:
 *
 *   1. {@link parseGlb} — the container: JSON chunk + BIN chunk, scene node
 *      transforms applied, POSITION + indices accessors read into a flat
 *      triangle soup. Only the subset glTF exporters actually emit for a
 *      static mesh is supported; anything else throws rather than guesses.
 *   2. {@link voxelizeTriangles} — surface-shell rasterization by triangle
 *      supersampling, then a flood fill from outside to solidify. Generated
 *      meshes are not reliably watertight, so "fill what the outside cannot
 *      reach" is the robust rule: a leaky mesh degrades to a hollow shell
 *      rather than to a filled bounding box.
 *   3. {@link toBlocksDoc} — a shape-first palette (stone family, banded by
 *      height) and the min-corner-at-origin normalization.
 *
 * Deterministic throughout: no randomness, no clock, integer grid arithmetic.
 */

import type { BlockEntry, BlocksDoc } from "./blocks.ts";

/* -------------------------------------------------------------------------- */
/* GLB parsing                                                                 */
/* -------------------------------------------------------------------------- */

/** A triangle soup: 9 floats per triangle (x,y,z per vertex), glTF Y-up. */
export type TriangleSoup = Float64Array;

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT_SIZE: Readonly<Record<number, number>> = {
  5120: 1, // byte
  5121: 1, // unsigned byte
  5122: 2, // short
  5123: 2, // unsigned short
  5125: 4, // unsigned int
  5126: 4, // float
};

/** Read a `.glb` into a world-space triangle soup. */
export function parseGlb(bytes: Uint8Array): TriangleSoup {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("voxelize: not a GLB (bad magic) — text .gltf is not supported");
  }

  let json: Record<string, unknown> | undefined;
  let bin: Uint8Array | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    else if (type === CHUNK_BIN) bin = body;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (json === undefined) throw new Error("voxelize: GLB has no JSON chunk");

  const gltf = json;
  const meshes = (gltf["meshes"] as GltfMesh[] | undefined) ?? [];
  const nodes = (gltf["nodes"] as GltfNode[] | undefined) ?? [];
  const out: number[] = [];

  const emitMesh = (meshIndex: number, matrix: Mat4): void => {
    const mesh = meshes[meshIndex];
    if (mesh === undefined) return;
    for (const primitive of mesh.primitives ?? []) {
      // 4 == TRIANGLES; the default when `mode` is absent.
      if (primitive.mode !== undefined && primitive.mode !== 4) continue;
      const positionIndex = primitive.attributes?.["POSITION"];
      if (positionIndex === undefined) continue;
      const positions = readAccessor(gltf, bin, positionIndex);
      const indices =
        primitive.indices === undefined
          ? sequential(positions.length / 3)
          : readAccessor(gltf, bin, primitive.indices);
      for (let i = 0; i + 2 < indices.length; i += 3) {
        for (let corner = 0; corner < 3; corner++) {
          const v = (indices[i + corner] as number) * 3;
          const p = transform(matrix, positions[v] as number, positions[v + 1] as number, positions[v + 2] as number);
          out.push(p[0], p[1], p[2]);
        }
      }
    }
  };

  const walk = (nodeIndex: number, parent: Mat4, seen: ReadonlySet<number>): void => {
    if (seen.has(nodeIndex)) return; // malformed cyclic graph; ignore rather than hang
    const node = nodes[nodeIndex];
    if (node === undefined) return;
    const matrix = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) emitMesh(node.mesh, matrix);
    const nextSeen = new Set(seen).add(nodeIndex);
    for (const child of node.children ?? []) walk(child, matrix, nextSeen);
  };

  const scenes = (gltf["scenes"] as { nodes?: number[] }[] | undefined) ?? [];
  const sceneIndex = typeof gltf["scene"] === "number" ? (gltf["scene"] as number) : 0;
  const roots = scenes[sceneIndex]?.nodes;
  if (roots !== undefined && roots.length > 0) {
    for (const root of roots) walk(root, IDENTITY, new Set());
  } else if (nodes.length > 0) {
    for (let i = 0; i < nodes.length; i++) walk(i, IDENTITY, new Set());
  } else {
    for (let i = 0; i < meshes.length; i++) emitMesh(i, IDENTITY);
  }

  if (out.length === 0) throw new Error("voxelize: GLB contained no triangles");
  return Float64Array.from(out);
}

interface GltfMesh {
  primitives?: { attributes?: Record<string, number>; indices?: number; mode?: number }[];
}
interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

function readAccessor(
  gltf: Record<string, unknown>,
  bin: Uint8Array | undefined,
  index: number,
): Float64Array {
  const accessors = (gltf["accessors"] as Record<string, unknown>[] | undefined) ?? [];
  const accessor = accessors[index];
  if (accessor === undefined) throw new Error(`voxelize: missing accessor ${index}`);
  const count = accessor["count"] as number;
  const componentType = accessor["componentType"] as number;
  const componentSize = COMPONENT_SIZE[componentType];
  if (componentSize === undefined) {
    throw new Error(`voxelize: unsupported componentType ${componentType}`);
  }
  const perElement = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor["type"] as string];
  if (perElement === undefined) throw new Error(`voxelize: unsupported accessor type ${String(accessor["type"])}`);

  const out = new Float64Array(count * perElement);
  const bufferViewIndex = accessor["bufferView"];
  if (typeof bufferViewIndex !== "number") return out; // sparse-less, view-less: all zeros

  const views = (gltf["bufferViews"] as Record<string, unknown>[] | undefined) ?? [];
  const view = views[bufferViewIndex];
  if (view === undefined) throw new Error(`voxelize: missing bufferView ${bufferViewIndex}`);
  if (bin === undefined) throw new Error("voxelize: GLB has no BIN chunk but accessors reference one");

  const base = ((view["byteOffset"] as number | undefined) ?? 0) + ((accessor["byteOffset"] as number | undefined) ?? 0);
  const stride = (view["byteStride"] as number | undefined) ?? componentSize * perElement;
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

  for (let i = 0; i < count; i++) {
    for (let c = 0; c < perElement; c++) {
      const at = base + i * stride + c * componentSize;
      out[i * perElement + c] = readComponent(data, at, componentType);
    }
  }
  return out;
}

function readComponent(data: DataView, at: number, componentType: number): number {
  switch (componentType) {
    case 5120:
      return data.getInt8(at);
    case 5121:
      return data.getUint8(at);
    case 5122:
      return data.getInt16(at, true);
    case 5123:
      return data.getUint16(at, true);
    case 5125:
      return data.getUint32(at, true);
    default:
      return data.getFloat32(at, true);
  }
}

function sequential(count: number): Float64Array {
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) out[i] = i;
  return out;
}

/* --- 4x4 matrices, column-major as glTF stores them ----------------------- */

type Mat4 = readonly number[];
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] as number) * (b[col * 4 + k] as number);
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function transform(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number),
    (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number),
    (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number),
  ];
}

function localMatrix(node: GltfNode): Mat4 {
  if (node.matrix !== undefined && node.matrix.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const r = [
    1 - 2 * (qy! * qy! + qz! * qz!), 2 * (qx! * qy! + qz! * qw!), 2 * (qx! * qz! - qy! * qw!),
    2 * (qx! * qy! - qz! * qw!), 1 - 2 * (qx! * qx! + qz! * qz!), 2 * (qy! * qz! + qx! * qw!),
    2 * (qx! * qz! + qy! * qw!), 2 * (qy! * qz! - qx! * qw!), 1 - 2 * (qx! * qx! + qy! * qy!),
  ];
  return [
    r[0]! * sx!, r[1]! * sx!, r[2]! * sx!, 0,
    r[3]! * sy!, r[4]! * sy!, r[5]! * sy!, 0,
    r[6]! * sz!, r[7]! * sz!, r[8]! * sz!, 0,
    tx!, ty!, tz!, 1,
  ];
}

/* -------------------------------------------------------------------------- */
/* Voxelization                                                                */
/* -------------------------------------------------------------------------- */

/** A dense occupancy grid, x-major then y then z. */
export interface VoxelGrid {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly solid: Uint8Array;
}

export interface VoxelizeOptions {
  /** Blocks along the longer horizontal axis. */
  readonly target?: number;
  /** Connected components smaller than this are dropped (default 4). */
  readonly minIsland?: number;
}

export const DEFAULT_TARGET = 48;
export const MAX_TARGET = 80;

export function gridIndex(grid: { sx: number; sy: number }, x: number, y: number, z: number): number {
  return (z * grid.sy + y) * grid.sx + x;
}

/**
 * Rasterize a triangle soup into a solid voxel grid.
 *
 * The mesh is uniformly scaled so its longer horizontal extent spans `target`
 * voxels, then each triangle is supersampled at half-voxel spacing to mark the
 * shell. A 6-connected flood fill from the padded border marks true outside;
 * everything else becomes solid. Islands are pruned last.
 */
export function voxelizeTriangles(soup: TriangleSoup, options: VoxelizeOptions = {}): VoxelGrid {
  const target = clampTarget(options.target ?? DEFAULT_TARGET);
  const minIsland = options.minIsland ?? 4;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < soup.length; i += 3) {
    minX = Math.min(minX, soup[i]!); maxX = Math.max(maxX, soup[i]!);
    minY = Math.min(minY, soup[i + 1]!); maxY = Math.max(maxY, soup[i + 1]!);
    minZ = Math.min(minZ, soup[i + 2]!); maxZ = Math.max(maxZ, soup[i + 2]!);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const horizontal = Math.max(spanX, spanZ);
  if (!(horizontal > 0)) throw new Error("voxelize: mesh is degenerate (zero horizontal extent)");
  const scale = target / horizontal;

  const sx = Math.max(1, Math.ceil(spanX * scale) + 1);
  const sy = Math.max(1, Math.ceil(spanY * scale) + 1);
  const sz = Math.max(1, Math.ceil(spanZ * scale) + 1);
  const grid = { sx, sy, sz };
  const solid = new Uint8Array(sx * sy * sz);

  const mark = (fx: number, fy: number, fz: number): void => {
    const x = clamp(Math.round((fx - minX) * scale), 0, sx - 1);
    const y = clamp(Math.round((fy - minY) * scale), 0, sy - 1);
    const z = clamp(Math.round((fz - minZ) * scale), 0, sz - 1);
    solid[gridIndex(grid, x, y, z)] = 1;
  };

  for (let t = 0; t < soup.length; t += 9) {
    const ax = soup[t]!, ay = soup[t + 1]!, az = soup[t + 2]!;
    const bx = soup[t + 3]!, by = soup[t + 4]!, bz = soup[t + 5]!;
    const cx = soup[t + 6]!, cy = soup[t + 7]!, cz = soup[t + 8]!;
    // Half-voxel sampling density along the two longest edges.
    const ab = distance(ax, ay, az, bx, by, bz) * scale;
    const ac = distance(ax, ay, az, cx, cy, cz) * scale;
    const steps = Math.max(1, Math.ceil(Math.max(ab, ac) * 2));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      for (let j = 0; j <= steps - i; j++) {
        const v = j / steps;
        const w = 1 - u - v;
        mark(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v);
      }
    }
  }

  solidify(grid, solid);
  pruneIslands(grid, solid, minIsland);
  return { sx, sy, sz, solid };
}

/** Flood fill the outside (on a 1-voxel padded lattice) and fill the rest. */
function solidify(grid: { sx: number; sy: number; sz: number }, solid: Uint8Array): void {
  const { sx, sy, sz } = grid;
  const px = sx + 2, py = sy + 2, pz = sz + 2;
  const outside = new Uint8Array(px * py * pz);
  const at = (x: number, y: number, z: number): number => (z * py + y) * px + x;

  const stack: number[] = [at(0, 0, 0)];
  outside[stack[0]!] = 1;
  while (stack.length > 0) {
    const cell = stack.pop()!;
    const x = cell % px;
    const y = Math.floor(cell / px) % py;
    const z = Math.floor(cell / (px * py));
    for (const [dx, dy, dz] of NEIGHBOURS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= px || ny >= py || nz >= pz) continue;
      const index = at(nx, ny, nz);
      if (outside[index] === 1) continue;
      const inner = nx > 0 && ny > 0 && nz > 0 && nx <= sx && ny <= sy && nz <= sz;
      if (inner && solid[gridIndex(grid, nx - 1, ny - 1, nz - 1)] === 1) continue;
      outside[index] = 1;
      stack.push(index);
    }
  }

  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        if (outside[at(x + 1, y + 1, z + 1)] === 0) solid[gridIndex(grid, x, y, z)] = 1;
      }
    }
  }
}

/** Drop 6-connected components below `minIsland` voxels; keeps the largest. */
function pruneIslands(
  grid: { sx: number; sy: number; sz: number },
  solid: Uint8Array,
  minIsland: number,
): void {
  const { sx, sy, sz } = grid;
  const label = new Int32Array(solid.length).fill(-1);
  const sizes: number[] = [];

  for (let start = 0; start < solid.length; start++) {
    if (solid[start] === 0 || label[start] !== -1) continue;
    const id = sizes.length;
    let count = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length > 0) {
      const cell = stack.pop()!;
      count++;
      const x = cell % sx;
      const y = Math.floor(cell / sx) % sy;
      const z = Math.floor(cell / (sx * sy));
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) continue;
        const index = gridIndex(grid, nx, ny, nz);
        if (solid[index] === 0 || label[index] !== -1) continue;
        label[index] = id;
        stack.push(index);
      }
    }
    sizes.push(count);
  }

  let largest = -1;
  for (let i = 0; i < sizes.length; i++) if (largest < 0 || sizes[i]! > sizes[largest]!) largest = i;
  for (let i = 0; i < solid.length; i++) {
    const id = label[i]!;
    if (id >= 0 && id !== largest && sizes[id]! < minIsland) solid[i] = 0;
  }
}

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/* -------------------------------------------------------------------------- */
/* Palette + document                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Shape-first palette: four stone-family blocks in vertical bands, so the
 * silhouette reads at a distance and nothing competes with it for attention.
 */
export const BAND_PALETTE: readonly string[] = [
  "minecraft:deepslate_bricks",
  "minecraft:stone_bricks",
  "minecraft:andesite",
  "minecraft:calcite",
];

/** Trim a grid to its occupied bounds and emit the blocks document. */
export function toBlocksDoc(grid: VoxelGrid, name: string): BlocksDoc {
  const { sx, sy, sz, solid } = grid;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        if (solid[gridIndex(grid, x, y, z)] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }
  if (maxX < minX) throw new Error("voxelize: no solid voxels survived");

  const height = maxY - minY + 1;
  const blocks: BlockEntry[] = [];
  for (let z = minZ; z <= maxZ; z++) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (solid[gridIndex(grid, x, y, z)] === 0) continue;
        const band = Math.min(
          BAND_PALETTE.length - 1,
          Math.floor(((y - minY) / height) * BAND_PALETTE.length),
        );
        blocks.push({ x: x - minX, y: y - minY, z: z - minZ, id: BAND_PALETTE[band]! });
      }
    }
  }

  return {
    name,
    size: [maxX - minX + 1, height, maxZ - minZ + 1],
    blocks,
  };
}

/** GLB bytes → blocks document, the whole pipeline in one call. */
export function voxelizeGlb(bytes: Uint8Array, name: string, options: VoxelizeOptions = {}): BlocksDoc {
  return toBlocksDoc(voxelizeTriangles(parseGlb(bytes), options), name);
}

export function clampTarget(target: number): number {
  if (!Number.isFinite(target) || target < 4) {
    throw new Error(`voxelize: --target must be at least 4 (got ${target})`);
  }
  if (target > MAX_TARGET) {
    throw new Error(`voxelize: --target is capped at ${MAX_TARGET} (got ${target})`);
  }
  return Math.floor(target);
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

function distance(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.hypot(ax - bx, ay - by, az - bz);
}

/**
 * Port geometry — Loam v0.2 §5.2.
 *
 * Ports are declared by *face* in node-local space, before anything is placed.
 * That is the whole point: the author says "the door is on the front" and the
 * solver keeps its freedom to rotate the building to satisfy `facing`. This
 * module is the other half of that bargain — turning a face plus a yaw into a
 * world position and an outward normal.
 *
 * Rotation follows §4.3 exactly: yaw is clockwise viewed from above, and under
 * yaw 90 a local point `(x, z)` in a box of size `(X, Z)` maps to
 * `(Z−1−z, x)` with new size `(Z, X)`. Every transform is a voxel-preserving
 * bijection, so nothing here ever resamples.
 */

import { HORIZONTAL_FACES, type HorizontalFace, type PortDeclaration, type Yaw } from "@terrainist/spec/ir";
import type { Cardinal, StructureYaw } from "@terrainist/stdlib";
import { rotateFacing as stdlibRotateFacing, rotateLocalColumn as stdlibRotateLocalColumn } from "@terrainist/stdlib";

import type { Rect } from "./frames.js";
import type { Placement, ResolvedPort } from "./types.js";

/** Outward unit normal of each face, in world axes. North is −Z, east is +X. */
export const FACE_NORMAL: Readonly<Record<HorizontalFace, readonly [number, number, number]>> =
  Object.freeze({
    north: [0, 0, -1],
    south: [0, 0, 1],
    east: [1, 0, 0],
    west: [-1, 0, 0],
  });

/** Rotate a face by a yaw (§5.2). */
export function rotateFace(face: HorizontalFace, yaw: Yaw): HorizontalFace {
  return stdlibRotateFacing(face as unknown as Cardinal, yaw as unknown as StructureYaw) as unknown as HorizontalFace;
}

/**
 * Rotate a node-local column into the placed node's local frame (§4.3).
 *
 * `sizeX`/`sizeZ` are the **unrotated** extents; the result is relative to the
 * rotated box's min corner.
 */
export function rotateLocal(
  x: number,
  z: number,
  sizeX: number,
  sizeZ: number,
  yaw: Yaw,
): { x: number; z: number } {
  return stdlibRotateLocalColumn(x, z, sizeX, sizeZ, yaw as unknown as StructureYaw);
}

/** Extents after a yaw. */
export function rotatedSize(
  size: readonly [number, number, number],
  yaw: Yaw,
): [number, number, number] {
  return yaw === 90 || yaw === 270 ? [size[2], size[1], size[0]] : [size[0], size[1], size[2]];
}

/** Horizontal extents after a yaw — the footprint `[w, d]` without the height. */
export function rotatedExtents(
  size: readonly [number, number, number],
  yaw: Yaw,
): [number, number] {
  return yaw === 90 || yaw === 270 ? [size[2], size[0]] : [size[0], size[2]];
}

/** Inclusive world `Rect` from an origin and a rotated or unrotated size. */
export function rectAt(x: number, z: number, w: number, d: number): Rect {
  return { x0: x, z0: z, x1: x + w - 1, z1: z + d - 1 };
}


/** Default opening sizes per port type (§5.3). */
const PORT_DEFAULT_SIZE: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  door: [1, 2],
  gate: [3, 4],
  arch: [3, 4],
  window: [1, 2],
  road_stub: [5, 1],
  path_stub: [2, 1],
  tunnel_stub: [3, 4],
  bridge_stub: [5, 1],
  rail_stub: [2, 3],
  dock: [5, 1],
  canal_stub: [3, 2],
  stair_top: [2, 3],
  stair_bottom: [2, 3],
  shaft: [3, 3],
});

/** The face a declaration resolves to, before rotation. */
export function declaredFace(port: PortDeclaration): HorizontalFace | null {
  const face = port.face;
  if (face === undefined) return "south";
  if ((HORIZONTAL_FACES as readonly string[]).includes(face)) return face as HorizontalFace;
  return null;
}

/**
 * Resolve one declared port against a placement.
 *
 * `at` is read as `[u, v]`: `u` runs along the face's horizontal axis, `v` up
 * from the node's floor. `"center"` means `u = 0.5, v = 0` — a doorway's sill
 * belongs on the floor, not half-way up the wall, and every port type this
 * profile resolves is a thing you walk or drive through.
 */
export function resolvePort(
  placement: Placement,
  unrotatedSize: readonly [number, number, number],
  name: string,
  port: PortDeclaration,
): ResolvedPort | null {
  const face = declaredFace(port);
  if (face === null) return null;

  const [sx, sy, sz] = unrotatedSize;
  const u = port.at === undefined || port.at === "center" ? 0.5 : port.at[0];
  const v = port.at === undefined || port.at === "center" ? 0 : port.at[1];

  let lx: number;
  let lz: number;
  switch (face) {
    case "north":
      lz = 0;
      lx = Math.floor(u * (sx - 1));
      break;
    case "south":
      lz = sz - 1;
      lx = Math.floor(u * (sx - 1));
      break;
    case "west":
      lx = 0;
      lz = Math.floor(u * (sz - 1));
      break;
    default:
      lx = sx - 1;
      lz = Math.floor(u * (sz - 1));
      break;
  }

  const rotated = rotateLocal(lx, lz, sx, sz, placement.yaw);
  const worldFace = rotateFace(face, placement.yaw);
  const [tx, ty, tz] = placement.translation;
  const defaults = PORT_DEFAULT_SIZE[port.type] ?? [1, 2];

  return {
    ref: `${placement.nodePath}#${name}`,
    nodePath: placement.nodePath,
    name,
    type: port.type,
    position: [tx + rotated.x, ty + Math.floor(v * Math.max(sy - 1, 0)), tz + rotated.z],
    outwardNormal: FACE_NORMAL[worldFace],
    face: worldFace,
    width: port.width ?? (defaults[0] as number),
    height: port.height ?? (defaults[1] as number),
    floorY: ty,
  };
}

/**
 * The node's **front** face (§4.4 `facing`): the port named by `frontPort`,
 * else the port tagged `primary`, else `main_door` or `door`, else local north.
 */
export function frontFace(
  ports: Readonly<Record<string, PortDeclaration>>,
  frontPort?: string,
): HorizontalFace {
  const pick = (name: string | undefined): HorizontalFace | null => {
    if (name === undefined) return null;
    const port = ports[name];
    if (port === undefined) return null;
    return declaredFace(port);
  };

  const explicit = pick(frontPort);
  if (explicit !== null) return explicit;

  // Deterministic: declaration order, then the conventional names.
  for (const [, port] of Object.entries(ports)) {
    if (port.tags?.includes("primary") === true) {
      const face = declaredFace(port);
      if (face !== null) return face;
    }
  }
  for (const name of ["main_door", "door"]) {
    const face = pick(name);
    if (face !== null) return face;
  }
  return "north";
}

/** Resolve every port of a placement, in declaration order. */
export function resolvePorts(
  placement: Placement,
  unrotatedSize: readonly [number, number, number],
  ports: Readonly<Record<string, PortDeclaration>>,
): ResolvedPort[] {
  const out: ResolvedPort[] = [];
  for (const [name, port] of Object.entries(ports)) {
    const resolved = resolvePort(placement, unrotatedSize, name, port);
    if (resolved !== null) out.push(resolved);
  }
  return out;
}

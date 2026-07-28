/**
 * Structure generators — the voxel half of the settlement profile.
 *
 * G4b scope: **`building.grammar@0` v0**. A pure, deterministic function from
 * (params, seed, style, footprint, door port) to a list of node-local voxel
 * ops. Nothing here knows about Minecraft block *state ids*, chunks, or the
 * world: ops carry block **names** and property maps, and the compiler resolves
 * them through `PrismarineStack.blockStateOf`. That split is what lets the
 * whole grammar be unit-tested without loading `minecraft-data`.
 *
 * ## Coordinates
 *
 * Ops are in **node-local, unrotated** space: `x ∈ [0, sizeX)`, `z ∈ [0, sizeZ)`
 * and `y = 0` is the **foundation floor** — the walkable ground-floor surface.
 * `y < 0` is the foundation skirt, emitted downward into the ground.
 *
 * The generator never rotates. The solver picks a yaw, the compiler calls
 * {@link rotateOps}, and that function rewrites coordinates *and* the
 * direction-bearing block properties (`facing`, `axis`, and the pane/fence
 * connection flags) in one place. Generating unrotated and rotating once is the
 * only arrangement where "a west-facing stair becomes north-facing under 90°"
 * is a property of one tested function rather than of every generator.
 */

import { positionFloat, streamSeed, type Seed256 } from "../determinism/index.js";

/* -------------------------------------------------------------------------- */
/* ops                                                                         */
/* -------------------------------------------------------------------------- */

/** One block placement in node-local coordinates. */
export interface LocalVoxelOp {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Un-namespaced block name, e.g. `"oak_planks"`. */
  readonly block: string;
  /** Block state properties, e.g. `{ facing: "south", half: "lower" }`. */
  readonly props?: Readonly<Record<string, string>>;
}

/** The four horizontal directions a block property can name. */
export type Cardinal = "north" | "east" | "south" | "west";

/** A quantized yaw, clockwise from above. */
export type StructureYaw = 0 | 90 | 180 | 270;

/** Rotation order: yaw 90 advances one step (north→east→south→west). */
const CARDINALS: readonly Cardinal[] = Object.freeze(["north", "east", "south", "west"] as const);

/** True for one of the four cardinal names. */
function isCardinal(value: string): value is Cardinal {
  return (CARDINALS as readonly string[]).includes(value);
}

/** Rotate a cardinal direction by a yaw. */
export function rotateFacing(facing: Cardinal, yaw: StructureYaw): Cardinal {
  return CARDINALS[(CARDINALS.indexOf(facing) + yaw / 90) % 4] as Cardinal;
}

/**
 * Rotate a node-local column (§4.3).
 *
 * `sizeX`/`sizeZ` are the **unrotated** extents; the result is relative to the
 * rotated box's min corner. Mirrors `layout/ports.ts:rotateLocal` exactly —
 * `test/structures.test.ts` asserts the two agree for every yaw.
 */
export function rotateLocalColumn(
  x: number,
  z: number,
  sizeX: number,
  sizeZ: number,
  yaw: StructureYaw,
): { x: number; z: number } {
  switch (yaw) {
    case 0:
      return { x, z };
    case 90:
      return { x: sizeZ - 1 - z, z: x };
    case 180:
      return { x: sizeX - 1 - x, z: sizeZ - 1 - z };
    default:
      return { x: z, z: sizeX - 1 - x };
  }
}

/**
 * Rotate a property map by a yaw.
 *
 * Three families of direction-bearing property are handled, which is every one
 * this grammar emits:
 *
 * - `facing` — stairs, doors, wall torches: a cardinal name, rotated directly;
 * - `axis` — pillar-family logs: `x`/`z` swap on a quarter turn, `y` is fixed;
 * - the connection flags `north`/`east`/`south`/`west` — glass panes, fences,
 *   walls: the *set* rotates, so `{east:"true"}` becomes `{south:"true"}`.
 */
export function rotateProps(
  props: Readonly<Record<string, string>> | undefined,
  yaw: StructureYaw,
): Readonly<Record<string, string>> | undefined {
  if (props === undefined || yaw === 0) return props;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "facing" && isCardinal(value)) {
      out["facing"] = rotateFacing(value, yaw);
      continue;
    }
    if (key === "axis") {
      out["axis"] = value === "y" ? "y" : yaw === 90 || yaw === 270 ? (value === "x" ? "z" : "x") : value;
      continue;
    }
    if (isCardinal(key)) {
      out[rotateFacing(key, yaw)] = value;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Rotate a whole op list, coordinates and properties together.
 *
 * The output is re-sorted into the canonical order ({@link sortOps}) so two
 * yaws of the same building differ only in geometry, never in list order.
 */
export function rotateOps(
  ops: readonly LocalVoxelOp[],
  yaw: StructureYaw,
  sizeX: number,
  sizeZ: number,
): LocalVoxelOp[] {
  if (yaw === 0) return ops.slice();
  const out = ops.map((op) => {
    const p = rotateLocalColumn(op.x, op.z, sizeX, sizeZ, yaw);
    const props = rotateProps(op.props, yaw);
    return { x: p.x, y: op.y, z: p.z, block: op.block, ...(props === undefined ? {} : { props }) };
  });
  return sortOps(out);
}

/** Canonical op order: y, then z, then x. Ties cannot occur (one op per cell). */
export function sortOps(ops: LocalVoxelOp[]): LocalVoxelOp[] {
  return ops.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}

/* -------------------------------------------------------------------------- */
/* style                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The grammar's material symbols and their profile defaults.
 *
 * A caller overrides any subset through {@link BuildingRequest.style}; the
 * `wallSymbol` / `trimSymbol` / `roofSymbol` params override the three the
 * v0.2 catalog names, by block id rather than by `@symbol` reference.
 */
export const BUILDING_STYLE_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  "wall.primary": "oak_planks",
  "wall.frame": "spruce_log",
  "wall.window": "glass_pane",
  "roof.stairs": "dark_oak_stairs",
  "roof.slab": "dark_oak_slab",
  "roof.solid": "dark_oak_planks",
  "foundation.primary": "cobblestone",
  "foundation.accent": "stone_bricks",
  "floor.interior": "oak_planks",
  "stair.interior": "oak_stairs",
  "door.block": "oak_door",
  "light.lantern": "lantern",
});

/** Weight of `foundation.accent` in the foundation mix (per column). */
const FOUNDATION_ACCENT_SHARE = 0.3;

/** Roof shapes this v0 builds. */
export const BUILDING_ROOFS = ["gable", "hip", "flat"] as const;

/** A roof shape. */
export type BuildingRoof = (typeof BUILDING_ROOFS)[number];

/** Window rhythms this v0 builds. */
export const BUILDING_WINDOW_RHYTHMS = ["regular", "dense", "sparse", "paired", "none"] as const;

/** A window rhythm. */
export type BuildingWindowRhythm = (typeof BUILDING_WINDOW_RHYTHMS)[number];

/* -------------------------------------------------------------------------- */
/* parameters                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The `building.grammar@0` params this v0 reads.
 *
 * Everything else in the v0.2 §7 table parses (the spec validator accepts it)
 * and is ignored here — see the gap list at the bottom of this file.
 */
export interface BuildingParams {
  /** 1..2 in v0; higher values are clamped. */
  readonly floors?: number;
  /** Blocks per story; clamped into {@link MIN_STORY_HEIGHT}..{@link MAX_STORY_HEIGHT}. */
  readonly floorHeight?: number;
  readonly roof?: string;
  readonly windowRhythm?: string;
  /** Block id overriding `wall.primary`. */
  readonly wallSymbol?: string;
  /** Block id overriding `wall.frame`. */
  readonly trimSymbol?: string;
  /** Block id overriding the whole `roof.*` family. */
  readonly roofSymbol?: string;
}

/** Lowest story height that still fits a two-block door plus a lintel. */
export const MIN_STORY_HEIGHT = 3;
/** Highest story height this grammar builds. */
export const MAX_STORY_HEIGHT = 8;
/** Most roof layers, regardless of footprint. */
export const MAX_ROOF_LAYERS = 5;
/** Floors this v0 builds. */
export const MAX_FLOORS = 2;

/** Resolved, clamped params — what the geometry actually used. */
export interface ResolvedBuildingParams {
  readonly floors: number;
  readonly storyHeight: number;
  readonly roof: BuildingRoof;
  readonly windowRhythm: BuildingWindowRhythm;
}

/** A declared door port, in unrotated node-local terms. */
export interface BuildingDoor {
  readonly face: Cardinal;
  /** `[u, v]` along/up the face, or `"center"`. Only `u` is read. */
  readonly at?: "center" | readonly [number, number];
}

/** Input to {@link generateBuilding}. */
export interface BuildingRequest {
  /** Unrotated envelope extents `[sizeX, sizeY, sizeZ]`, in blocks. */
  readonly size: readonly [number, number, number];
  readonly params?: BuildingParams;
  /** The node seed; every material draw hangs off its `grammar` stream. */
  readonly seed: Seed256;
  /** Symbol → block id overrides on {@link BUILDING_STYLE_DEFAULTS}. */
  readonly style?: Readonly<Record<string, string>>;
  /** The resolved `door` port; omitted means the grammar picks the south face. */
  readonly door?: BuildingDoor;
  /** Skirt depth below `y = 0`, in blocks. The caller computes it from terrain. */
  readonly foundationDepth?: number;
}

/** An inclusive local rectangle. */
export interface LocalRect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

/** What the grammar built, for validators, tests and the compile report. */
export interface BuildingMeta {
  readonly params: ResolvedBuildingParams;
  readonly size: readonly [number, number, number];
  /** Y of the topmost wall course (the eave plate). */
  readonly wallTop: number;
  /** Y of the roof's lowest layer. */
  readonly roofBase: number;
  /** Y of the roof's highest layer. */
  readonly roofTop: number;
  /** Total built height above `y = 0`, inclusive. */
  readonly height: number;
  /** Skirt depth actually emitted. */
  readonly foundationDepth: number;
  /** The door's column and face; `null` when the footprint was too small. */
  readonly door: { readonly x: number; readonly z: number; readonly face: Cardinal } | null;
  /** The enclosed interior, inclusive; empty when the footprint is 2 or less. */
  readonly interior: LocalRect;
  /** Y of each story's floor plane, lowest first. */
  readonly floorLevels: readonly number[];
  /** Y of the lowest step of each inter-story stair run. */
  readonly stairRuns: readonly number[];
  readonly windowCount: number;
  readonly lanternCount: number;
}

/** What {@link generateBuilding} returns. */
export interface BuildingResult {
  readonly ops: readonly LocalVoxelOp[];
  readonly meta: BuildingMeta;
}

/* -------------------------------------------------------------------------- */
/* the grammar                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build one building, deterministically.
 *
 * Stages, in the order the v0.2 catalog fixes them: footprint → massing →
 * floors → facade → roof. Each writes into a single `Map` keyed by cell, so a
 * later stage overwriting an earlier one (a window replacing a wall block, the
 * door replacing both) is explicit rather than dependent on emit order, and the
 * result is guaranteed to hold exactly one op per cell.
 */
export function generateBuilding(request: BuildingRequest): BuildingResult {
  const [sizeX, sizeY, sizeZ] = request.size;
  const sx = Math.max(3, Math.floor(sizeX));
  const sz = Math.max(3, Math.floor(sizeZ));
  const sy = Math.max(4, Math.floor(sizeY));

  const style = { ...BUILDING_STYLE_DEFAULTS, ...(request.style ?? {}) };
  const params = request.params ?? {};
  if (typeof params.wallSymbol === "string") style["wall.primary"] = params.wallSymbol;
  if (typeof params.trimSymbol === "string") style["wall.frame"] = params.trimSymbol;
  if (typeof params.roofSymbol === "string") {
    style["roof.stairs"] = params.roofSymbol;
    style["roof.solid"] = params.roofSymbol;
  }

  const roof = resolveRoof(params.roof);
  const rhythm = resolveRhythm(params.windowRhythm);
  // v0.2 §7 `floors`: not yet — the catalog allows 1..24; this v0 builds 1..2
  // and clamps, because it has no core/circulation model above two stories.
  const floors = clamp(Math.round(params.floors ?? 2), 1, MAX_FLOORS);
  const roofLayers = roof === "flat" ? 1 : clamp(Math.ceil(minor(sx, sz) / 2), 2, MAX_ROOF_LAYERS);
  const storyHeight = clamp(
    params.floorHeight === undefined
      ? Math.floor((sy - 1 - roofLayers) / floors)
      : Math.round(params.floorHeight),
    MIN_STORY_HEIGHT,
    MAX_STORY_HEIGHT,
  );

  const wallTop = floors * storyHeight;
  const roofBase = wallTop + 1;
  const foundationDepth = Math.max(0, Math.round(request.foundationDepth ?? 1));

  const cells = new Map<string, LocalVoxelOp>();
  const put = (x: number, y: number, z: number, block: string, props?: Record<string, string>): void => {
    cells.set(`${x},${y},${z}`, { x, y, z, block, ...(props === undefined ? {} : { props }) });
  };

  const grammar = streamSeed(request.seed, "grammar");
  const foundationAt = (x: number, y: number, z: number): string =>
    positionFloat(grammar, x, y, z) < FOUNDATION_ACCENT_SHARE
      ? (style["foundation.accent"] as string)
      : (style["foundation.primary"] as string);

  // --- foundation skirt ----------------------------------------------------
  for (let d = 1; d <= foundationDepth; d++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) put(x, -d, z, foundationAt(x, -d, z));
    }
  }

  // --- ground floor plane --------------------------------------------------
  const interior: LocalRect = { x0: 1, z0: 1, x1: sx - 2, z1: sz - 2 };
  const hasInterior = interior.x0 <= interior.x1 && interior.z0 <= interior.z1;
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const inside = x >= interior.x0 && x <= interior.x1 && z >= interior.z0 && z <= interior.z1;
      put(x, 0, z, inside ? (style["floor.interior"] as string) : foundationAt(x, 0, z));
    }
  }

  // --- walls ---------------------------------------------------------------
  const ring = perimeter(sx, sz);
  for (let y = 1; y <= wallTop; y++) {
    const belt = y === wallTop || y % storyHeight === 0;
    for (const cell of ring) {
      const corner = (cell.x === 0 || cell.x === sx - 1) && (cell.z === 0 || cell.z === sz - 1);
      if (corner) {
        put(cell.x, y, cell.z, style["wall.frame"] as string, { axis: "y" });
      } else if (belt) {
        // The belt course is the frame's horizontal member: a log lying along
        // the wall it sits in, which is why its axis is direction-bearing.
        put(cell.x, y, cell.z, style["wall.frame"] as string, {
          axis: cell.z === 0 || cell.z === sz - 1 ? "x" : "z",
        });
      } else {
        put(cell.x, y, cell.z, style["wall.primary"] as string);
      }
    }
  }

  // --- door ----------------------------------------------------------------
  const door = resolveDoor(request.door, sx, sz);
  if (door !== null) {
    const facing = door.face;
    put(door.x, 1, door.z, style["door.block"] as string, {
      facing,
      half: "lower",
      hinge: "left",
      open: "false",
    });
    put(door.x, 2, door.z, style["door.block"] as string, {
      facing,
      half: "upper",
      hinge: "left",
      open: "false",
    });
  }

  // --- windows -------------------------------------------------------------
  let windowCount = 0;
  for (let s = 0; s < floors; s++) {
    const y = s * storyHeight + 2;
    if (y >= wallTop) continue;
    for (const cell of ring) {
      const corner = (cell.x === 0 || cell.x === sx - 1) && (cell.z === 0 || cell.z === sz - 1);
      if (corner) continue;
      if (door !== null && cell.x === door.x && cell.z === door.z) continue;
      const alongZ = cell.x === 0 || cell.x === sx - 1;
      const index = alongZ ? cell.z : cell.x;
      if (!rhythmHit(rhythm, index)) continue;
      put(cell.x, y, cell.z, style["wall.window"] as string, paneConnections(alongZ));
      windowCount++;
    }
  }

  // --- upper floors + stairs ----------------------------------------------
  const floorLevels: number[] = [0];
  const stairRuns: number[] = [];
  for (let s = 1; s < floors; s++) {
    const level = s * storyHeight;
    floorLevels.push(level);
    if (!hasInterior) continue;
    // The stair run climbs +z along the west interior wall, from the floor
    // below (`base`) to this one. The floor plane keeps a matching hole over
    // the run, so the last step actually emerges onto the storey above.
    const base = level - storyHeight;
    const runLength = Math.min(storyHeight - 1, interior.z1 - interior.z0);
    const canStair = runLength >= 1;
    for (let z = interior.z0; z <= interior.z1; z++) {
      for (let x = interior.x0; x <= interior.x1; x++) {
        const inHole = canStair && x === interior.x0 && z < interior.z0 + runLength;
        if (inHole) continue;
        put(x, level, z, style["floor.interior"] as string);
      }
    }
    if (!canStair) continue;
    stairRuns.push(base + 1);
    for (let i = 0; i < runLength; i++) {
      put(interior.x0, base + 1 + i, interior.z0 + i, style["stair.interior"] as string, {
        facing: "south",
        half: "bottom",
      });
    }
  }

  // --- lanterns ------------------------------------------------------------
  let lanternCount = 0;
  if (hasInterior) {
    const cx = Math.floor((interior.x0 + interior.x1) / 2);
    const cz = Math.floor((interior.z0 + interior.z1) / 2);
    for (let s = 0; s < floors; s++) {
      const y = (s + 1) * storyHeight - 1;
      put(cx, y, cz, style["light.lantern"] as string, { hanging: "true" });
      lanternCount++;
    }
  }

  // --- roof ----------------------------------------------------------------
  const roofTop = emitRoof(put, style, roof, roofLayers, roofBase, sx, sz);

  return {
    ops: sortOps([...cells.values()]),
    meta: {
      params: { floors, storyHeight, roof, windowRhythm: rhythm },
      size: [sx, sy, sz],
      wallTop,
      roofBase,
      roofTop,
      height: roofTop + 1,
      foundationDepth,
      door: door === null ? null : { x: door.x, z: door.z, face: door.face },
      interior,
      floorLevels,
      stairRuns,
      windowCount,
      lanternCount,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* roof                                                                        */
/* -------------------------------------------------------------------------- */

type Put = (x: number, y: number, z: number, block: string, props?: Record<string, string>) => void;

/**
 * Emit the roof and return the Y of its highest layer.
 *
 * All three shapes are built so their layers **union to the whole footprint** —
 * a cap layer fills whatever the sloping layers did not reach. That property is
 * what the "roof covers the footprint" test asserts, and it is why the layer
 * count is capped but the coverage never is.
 */
function emitRoof(
  put: Put,
  style: Readonly<Record<string, string>>,
  roof: BuildingRoof,
  layers: number,
  base: number,
  sx: number,
  sz: number,
): number {
  const stairs = style["roof.stairs"] as string;
  const solid = style["roof.solid"] as string;

  if (roof === "flat") {
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) put(x, base, z, solid);
    return base;
  }

  if (roof === "hip") {
    for (let k = 0; k < layers; k++) {
      const y = base + k;
      const x0 = k;
      const x1 = sx - 1 - k;
      const z0 = k;
      const z1 = sz - 1 - k;
      if (x0 > x1 || z0 > z1) break;
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
          const onX = x === x0 || x === x1;
          const onZ = z === z0 || z === z1;
          if (onX && onZ) {
            put(x, y, z, solid);
            continue;
          }
          // Stairs climb *inward*: the north edge rises going south, and so on.
          const facing: Cardinal = onZ ? (z === z0 ? "south" : "north") : x === x0 ? "east" : "west";
          put(x, y, z, stairs, { facing, half: "bottom" });
        }
      }
    }
    return capRect(put, solid, base + layers, layers, sx - 1 - layers, layers, sz - 1 - layers) ?? base + layers - 1;
  }

  // gable — the ridge runs along the longer axis.
  const ridgeAlongX = sx >= sz;
  for (let k = 0; k < layers; k++) {
    const y = base + k;
    if (ridgeAlongX) {
      const near = k;
      const far = sz - 1 - k;
      if (near > far) break;
      for (let x = 0; x < sx; x++) {
        put(x, y, near, stairs, { facing: "south", half: "bottom" });
        if (far !== near) put(x, y, far, stairs, { facing: "north", half: "bottom" });
      }
    } else {
      const near = k;
      const far = sx - 1 - k;
      if (near > far) break;
      for (let z = 0; z < sz; z++) {
        put(near, y, z, stairs, { facing: "east", half: "bottom" });
        if (far !== near) put(far, y, z, stairs, { facing: "west", half: "bottom" });
      }
    }
  }
  const capY = base + layers;
  const capped = ridgeAlongX
    ? capRect(put, solid, capY, 0, sx - 1, layers, sz - 1 - layers)
    : capRect(put, solid, capY, layers, sx - 1 - layers, 0, sz - 1);
  return capped ?? base + layers - 1;
}

/** Fill an inclusive rectangle at `y`; returns `y`, or `null` when it is empty. */
function capRect(
  put: Put,
  block: string,
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): number | null {
  if (x0 > x1 || z0 > z1) return null;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, block);
  return y;
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** The footprint perimeter, in canonical (z, x) order. */
export function perimeter(sx: number, sz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      if (x === 0 || x === sx - 1 || z === 0 || z === sz - 1) out.push({ x, z });
    }
  }
  return out;
}

/** Pane connection flags for a wall running along z (or along x). */
function paneConnections(alongZ: boolean): Record<string, string> {
  return alongZ ? { north: "true", south: "true" } : { east: "true", west: "true" };
}

/**
 * The door's local column.
 *
 * Deliberately the same arithmetic as `layout/ports.ts:resolvePort` — the port
 * the solver resolved into the world and the opening the grammar cuts have to
 * be the same block, or the building has a door into a wall.
 */
function resolveDoor(
  door: BuildingDoor | undefined,
  sx: number,
  sz: number,
): { x: number; z: number; face: Cardinal } | null {
  const face: Cardinal = door?.face ?? "south";
  const at = door?.at;
  const u = at === undefined || at === "center" ? 0.5 : at[0];
  switch (face) {
    case "north":
      return { x: clamp(Math.floor(u * (sx - 1)), 1, sx - 2), z: 0, face };
    case "south":
      return { x: clamp(Math.floor(u * (sx - 1)), 1, sx - 2), z: sz - 1, face };
    case "west":
      return { x: 0, z: clamp(Math.floor(u * (sz - 1)), 1, sz - 2), face };
    default:
      return { x: sx - 1, z: clamp(Math.floor(u * (sz - 1)), 1, sz - 2), face };
  }
}

/** Whether a window sits at this index along a wall. */
function rhythmHit(rhythm: BuildingWindowRhythm, index: number): boolean {
  switch (rhythm) {
    case "none":
      return false;
    case "dense":
      return index % 2 === 0;
    case "sparse":
      return index % 4 === 2;
    case "paired":
      return index % 4 === 1 || index % 4 === 2;
    default:
      return index % 3 === 1;
  }
}

function resolveRoof(value: string | undefined): BuildingRoof {
  if (value === undefined) return "gable";
  if ((BUILDING_ROOFS as readonly string[]).includes(value)) return value as BuildingRoof;
  // v0.2 §2.4: not yet — `steep_gable`, `gambrel`, `mansard`, `shed`, `dome`,
  // `pagoda`, `saltbox` and friends all fall back to the nearest of the three
  // shapes this v0 builds, rather than failing the compile.
  if (value.includes("flat") || value === "terrace") return "flat";
  if (value.includes("hip") || value === "pyramid" || value === "dome") return "hip";
  return "gable";
}

function resolveRhythm(value: string | undefined): BuildingWindowRhythm {
  if (value === undefined) return "regular";
  if ((BUILDING_WINDOW_RHYTHMS as readonly string[]).includes(value)) {
    return value as BuildingWindowRhythm;
  }
  // v0.2 §2.4: not yet — the full rhythm vocabulary (`asymmetric`, `banded`,
  // `clustered`, …) collapses to `regular`.
  return "regular";
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function minor(a: number, b: number): number {
  return a < b ? a : b;
}

/*
 * v0.2 §7 `building.grammar@0` — implemented vs deferred
 * -----------------------------------------------------
 * implemented: floors (1..2), floorHeight, roof (gable|hip|flat), windowRhythm,
 *   wallSymbol, trimSymbol, roofSymbol, the `door` port.
 *
 * v0.2 §7: not yet — `footprint` (only `rect`; l/t/u/cross/courtyard/irregular
 *   massing needs a shape grammar).
 * v0.2 §7: not yet — `bays` (facade module count; windows use `windowRhythm`).
 * v0.2 §7: not yet — `roofPitch` (pitch is fixed at one layer per row).
 * v0.2 §7: not yet — `windowRatio` (glazed fraction is implied by the rhythm).
 * v0.2 §7: not yet — `entrance` (`porch`, `steps`); the door has neither.
 * v0.2 §7: not yet — `interior` (always an open shell with floor planes) and
 *   `furnish` (no props beyond the lanterns).
 * v0.2 §7: not yet — `basement`, and with it the `tunnel_stub` port.
 * v0.2 §7: not yet — `tower`, `variance`, `decayOverride`.
 * v0.2 §7: not yet — the `gate`/`arch`/`window`/`stair_top`/`stair_bottom`
 *   ports, and the `entrance`/`ridge`/`interior_center` markers.
 */

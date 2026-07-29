/**
 * Structure generators — the voxel half of the settlement profile.
 *
 * `building.grammar@0` v1. A pure, deterministic function from (params, seed,
 * style, footprint, door port) to a list of node-local voxel ops. Nothing here
 * knows about Minecraft block *state ids*, chunks, or the world: ops carry block
 * **names** and property maps, and the compiler resolves them through
 * `PrismarineStack.blockStateOf`. That split is what lets the whole grammar be
 * unit-tested without loading `minecraft-data`.
 *
 * ## Coordinates
 *
 * Ops are in **node-local, unrotated** space: `x ∈ [-1, sizeX]`, `z ∈ [-1, sizeZ]`
 * and `y = 0` is the **foundation floor** — the walkable ground-floor surface.
 * `y < 0` is the foundation skirt, emitted downward into the ground.
 *
 * The one-block ring *outside* `[0, sizeX) × [0, sizeZ)` is the **apron**, and
 * only a closed list of decorations may use it: the eave course, shutters,
 * window boxes and the porch lamp. Everything that matters structurally — every
 * wall, floor, roof and foundation block — stays strictly inside the footprint,
 * which is what keeps a building's claim on the ground equal to its envelope.
 * `meta.apronOps` counts what went outside so a caller can audit the claim.
 *
 * The generator never rotates. The solver picks a yaw, the compiler calls
 * {@link rotateOps}, and that function rewrites coordinates *and* the
 * direction-bearing block properties (`facing`, `axis`, and the pane/fence
 * connection flags) in one place. Generating unrotated and rotating once is the
 * only arrangement where "a west-facing stair becomes north-facing under 90°"
 * is a property of one tested function rather than of every generator.
 */

import { positionFloat, positionInt, streamSeed, type Seed256 } from "../determinism/index.js";

import { pickTheme, styleOf, type BuildingMaterials } from "./themes.js";

export * from "./themes.js";

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

/** Unit step of a cardinal, in node-local `(dx, dz)`. */
export function cardinalStep(facing: Cardinal): readonly [number, number] {
  switch (facing) {
    case "north":
      return [0, -1];
    case "south":
      return [0, 1];
    case "east":
      return [1, 0];
    default:
      return [-1, 0];
  }
}

/**
 * Rotate a node-local column (§4.3).
 *
 * `sizeX`/`sizeZ` are the **unrotated** extents; the result is relative to the
 * rotated box's min corner. Mirrors `layout/ports.ts:rotateLocal` exactly —
 * `test/structures.test.ts` asserts the two agree for every yaw. Apron
 * coordinates (`-1` and `size`) map through the same formulas and stay in the
 * rotated apron, which is why the ring survives rotation without a special case.
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
 * v0.2 catalog names, by block id rather than by `@symbol` reference. A caller
 * that passes `materials` gets the theme's map merged in underneath its own
 * overrides.
 */
export const BUILDING_STYLE_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  "wall.primary": "oak_planks",
  "wall.frame": "stripped_spruce_log",
  "wall.accent": "spruce_log",
  "wall.window": "glass_pane",
  "wall.fence": "oak_fence",
  "wall.trapdoor": "spruce_trapdoor",
  "roof.stairs": "dark_oak_stairs",
  "roof.slab": "dark_oak_slab",
  "roof.solid": "dark_oak_planks",
  "foundation.primary": "cobblestone",
  "foundation.accent": "stone_bricks",
  "stone.stairs": "stone_brick_stairs",
  "stone.slab": "stone_brick_slab",
  "stone.wall": "cobblestone_wall",
  "floor.interior": "oak_planks",
  "stair.interior": "oak_stairs",
  "door.block": "oak_door",
  "light.lantern": "lantern",
  "light.torch": "torch",
  "chimney.block": "cobblestone",
  "chimney.rim": "cobblestone_wall",
});

/** Weight of `foundation.accent` in the foundation mix (per column). */
const FOUNDATION_ACCENT_SHARE = 0.3;

/**
 * Share of plain wall cells that come up as the accent log instead.
 *
 * Halved in G5 (was 0.07). The accent is meant to read as grain — the odd
 * exposed post in a timber wall — and at 7% it stopped doing that: on a nine
 * by nine cottage wall it put five or six darker cells on every face, which at
 * render scale reads as speckle, or worse, as holes. Reviewers looking at the
 * first village consistently described "random holes in the walls"; probing
 * proved they were accents and window panes, but a defect the eye reports is a
 * defect. At 3.5% the same wall gets two or three, which is the difference
 * between texture and noise.
 */
const WALL_ACCENT_SHARE = 0.035;

/** Roof shapes this grammar builds. */
export const BUILDING_ROOFS = ["gable", "hip", "flat"] as const;

/** A roof shape. */
export type BuildingRoof = (typeof BUILDING_ROOFS)[number];

/** Window rhythms this grammar builds. */
export const BUILDING_WINDOW_RHYTHMS = ["regular", "dense", "sparse", "paired", "none"] as const;

/** A window rhythm. */
export type BuildingWindowRhythm = (typeof BUILDING_WINDOW_RHYTHMS)[number];

/** Window shapes; drawn per building unless the caller names one. */
export const BUILDING_WINDOW_SHAPES = ["single", "tall", "mullion"] as const;

/** A window shape. */
export type BuildingWindowShape = (typeof BUILDING_WINDOW_SHAPES)[number];

/** What a building is *for* — the thing that drives its furniture and massing. */
export const BUILDING_ARCHETYPES = [
  "cottage",
  "hall",
  "inn",
  "smithy",
  "granary",
  "watchtower",
] as const;

/** A building archetype. */
export type BuildingArchetype = (typeof BUILDING_ARCHETYPES)[number];

/** Map a node's tags onto an archetype; `cottage` when nothing matches. */
export function archetypeOfTags(tags: readonly string[]): BuildingArchetype {
  const has = (t: string): boolean => tags.includes(t);
  if (has("lookout") || has("tower") || has("watchtower")) return "watchtower";
  if (has("hall")) return "hall";
  if (has("trade") || has("inn")) return "inn";
  if (has("craft") || has("smithy")) return "smithy";
  if (has("store") || has("granary")) return "granary";
  return "cottage";
}

/* -------------------------------------------------------------------------- */
/* parameters                                                                  */
/* -------------------------------------------------------------------------- */

/** The `building.grammar@0` params this version reads. */
export interface BuildingParams {
  /** 1..2 in v0; higher values are clamped. */
  readonly floors?: number;
  /** Blocks per story; clamped into {@link MIN_STORY_HEIGHT}..{@link MAX_STORY_HEIGHT}. */
  readonly floorHeight?: number;
  readonly roof?: string;
  readonly windowRhythm?: string;
  /** Force a window shape; otherwise drawn from the node seed. */
  readonly windowShape?: string;
  /** What the building is for; otherwise `cottage`. */
  readonly archetype?: string;
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
/** Height set aside for the roof before the storeys are measured out. */
export const ROOF_RESERVE = 3;
/** Roof height as a share of wall height — the pitch, capped by the span. */
export const ROOF_PITCH_SHARE = 0.55;
/** Floors this grammar builds. */
export const MAX_FLOORS = 2;

/** Resolved, clamped params — what the geometry actually used. */
export interface ResolvedBuildingParams {
  readonly floors: number;
  readonly storyHeight: number;
  readonly roof: BuildingRoof;
  readonly windowRhythm: BuildingWindowRhythm;
  readonly windowShape: BuildingWindowShape;
  readonly archetype: BuildingArchetype;
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
  /** The theme triple this building was dealt, if the caller assigned one. */
  readonly materials?: BuildingMaterials;
  /** Symbol → block id overrides, applied over the theme and the defaults. */
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
  /** Ops emitted into the one-block apron ring outside the footprint. */
  readonly apronOps: number;
  /** Interior props placed (furniture, not lights). */
  readonly furnitureCount: number;
  /** True when a chimney was built. */
  readonly chimney: boolean;
  /** The material triple, as block ids, for the report and the uniqueness test. */
  readonly materialKey: string;
}

/** What {@link generateBuilding} returns. */
export interface BuildingResult {
  readonly ops: readonly LocalVoxelOp[];
  readonly meta: BuildingMeta;
}

type Put = (x: number, y: number, z: number, block: string, props?: Record<string, string>) => void;

/* -------------------------------------------------------------------------- */
/* the grammar                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build one building, deterministically.
 *
 * Stages, in the order the v0.2 catalog fixes them: footprint → massing →
 * floors → facade → roof → fit-out. Each writes into a single `Map` keyed by
 * cell, so a later stage overwriting an earlier one (a window replacing a wall
 * block, the door replacing both) is explicit rather than dependent on emit
 * order, and the result is guaranteed to hold exactly one op per cell.
 *
 * Every choice that is not fixed by the params is **position-keyed** off the
 * node's `grammar` stream, never drawn from a sequential RNG, so adding a stage
 * cannot shift the materials of the stages before it.
 */
export function generateBuilding(request: BuildingRequest): BuildingResult {
  const [sizeX, sizeY, sizeZ] = request.size;
  const sx = Math.max(3, Math.floor(sizeX));
  const sz = Math.max(3, Math.floor(sizeZ));
  const sy = Math.max(4, Math.floor(sizeY));

  const materials = request.materials ?? defaultMaterials(request.seed);
  const style: Record<string, string> = {
    ...BUILDING_STYLE_DEFAULTS,
    ...styleOf(materials),
    ...(request.style ?? {}),
  };
  const params = request.params ?? {};
  if (typeof params.wallSymbol === "string") style["wall.primary"] = params.wallSymbol;
  if (typeof params.trimSymbol === "string") style["wall.frame"] = params.trimSymbol;
  if (typeof params.roofSymbol === "string") {
    style["roof.stairs"] = params.roofSymbol;
    style["roof.solid"] = params.roofSymbol;
  }

  const grammar = streamSeed(request.seed, "grammar");
  const choice = streamSeed(request.seed, "grammar.choice");

  const archetype = resolveArchetype(params.archetype);
  const roof = resolveRoof(params.roof);
  const rhythm = resolveRhythm(params.windowRhythm);
  // v0.2 §7 `floors`: not yet — the catalog allows 1..24; this version builds
  // 1..2 and clamps, because it has no core/circulation model above two stories.
  const floors = clamp(Math.round(params.floors ?? 2), 1, MAX_FLOORS);
  // Height first, roof second. The old order asked the footprint how many roof
  // layers it wanted and gave the storeys whatever was left, which on a 9-wide
  // cottage in a 7-high box meant a five-layer roof over three-high walls: a hat
  // with a house under it. Reserving the roof's share up front and then pitching
  // it against the wall it sits on keeps the proportions readable at any size.
  const storyHeight = clamp(
    params.floorHeight === undefined
      ? Math.floor((sy - ROOF_RESERVE - 1) / floors)
      : Math.round(params.floorHeight),
    MIN_STORY_HEIGHT,
    MAX_STORY_HEIGHT,
  );
  const wallTop = floors * storyHeight;
  const roofLayers =
    roof === "flat"
      ? 1
      : clamp(
          minor(Math.ceil(minor(sx, sz) / 2), Math.max(2, Math.round(wallTop * ROOF_PITCH_SHARE))),
          2,
          MAX_ROOF_LAYERS,
        );
  const windowShape = resolveWindowShape(params.windowShape, choice, storyHeight);

  const foundationDepth = Math.max(0, Math.round(request.foundationDepth ?? 1));

  const cells = new Map<string, LocalVoxelOp>();
  const put: Put = (x, y, z, block, props) => {
    cells.set(`${x},${y},${z}`, { x, y, z, block, ...(props === undefined ? {} : { props }) });
  };

  const door = resolveDoor(request.door, sx, sz);

  if (archetype === "watchtower") {
    return emitWatchtower({
      put,
      cells,
      style,
      grammar,
      sx,
      sy,
      sz,
      foundationDepth,
      door,
      materials,
      params: { floors, storyHeight, roof, windowRhythm: rhythm, windowShape, archetype },
    });
  }

  const roofBase = wallTop + 1;

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
  // A timber frame, not a slab of planks: stripped-log posts at the corners, a
  // belt course of the same at every floor line and at the eave plate, a
  // masonry plinth at y = 1, and a sparse, position-keyed scatter of the accent
  // log through the field so the plank surface has grain without confetti.
  const ring = perimeter(sx, sz);
  for (let y = 1; y <= wallTop; y++) {
    const belt = y === wallTop || y % storyHeight === 0;
    for (const cell of ring) {
      const corner = (cell.x === 0 || cell.x === sx - 1) && (cell.z === 0 || cell.z === sz - 1);
      const alongX = cell.z === 0 || cell.z === sz - 1;
      if (corner) {
        put(cell.x, y, cell.z, style["wall.frame"] as string, { axis: "y" });
      } else if (belt) {
        // The belt course is the frame's horizontal member: a log lying along
        // the wall it sits in, which is why its axis is direction-bearing.
        put(cell.x, y, cell.z, style["wall.frame"] as string, { axis: alongX ? "x" : "z" });
      } else if (y === 1 && archetype !== "granary") {
        put(cell.x, y, cell.z, foundationAt(cell.x, y, cell.z));
      } else if (positionFloat(grammar, cell.x, y, cell.z) < WALL_ACCENT_SHARE) {
        put(cell.x, y, cell.z, style["wall.accent"] as string, { axis: alongX ? "x" : "z" });
      } else {
        put(cell.x, y, cell.z, style["wall.primary"] as string);
      }
    }
  }

  // --- door and entrance ---------------------------------------------------
  let apronOps = 0;
  if (door !== null) apronOps += emitEntrance(put, style, door, sx, sz, archetype);

  // --- windows -------------------------------------------------------------
  let windowCount = 0;
  for (let s = 0; s < floors; s++) {
    const y = s * storyHeight + 2;
    if (y >= wallTop) continue;
    for (const cell of ring) {
      const corner = (cell.x === 0 || cell.x === sx - 1) && (cell.z === 0 || cell.z === sz - 1);
      if (corner) continue;
      if (door !== null && nearDoor(cell, door)) continue;
      const alongZ = cell.x === 0 || cell.x === sx - 1;
      const index = alongZ ? cell.z : cell.x;
      if (!rhythmHit(rhythm, index)) continue;
      const out = outwardOf(cell, sx, sz);
      windowCount += emitWindow({
        put,
        style,
        cell,
        y,
        alongZ,
        shape: windowShape,
        outward: out,
        storyHeight,
        wallTop,
        sx,
        sz,
        door,
      });
      // Shutters and a window box: the only facade details that live in the
      // apron, because a shutter that is flush with its wall is not a shutter.
      const [ox, oz] = cardinalStep(out);
      if (positionFloat(choice, cell.x, y, cell.z) < 0.4) {
        for (const side of [-1, 1]) {
          const wx = cell.x + (alongZ ? 0 : side);
          const wz = cell.z + (alongZ ? side : 0);
          // The shutter hangs off the wall cell beside the light, so that cell
          // has to be a wall cell — never a corner post, never past the end.
          const along = alongZ ? wz : wx;
          const span = alongZ ? sz : sx;
          if (along <= 0 || along >= span - 1) continue;
          put(wx + ox, y, wz + oz, style["wall.trapdoor"] as string, {
            facing: out,
            open: "true",
            half: "bottom",
            powered: "false",
          });
          apronOps++;
        }
      } else if (s === 0 && positionFloat(choice, cell.z, y, cell.x) < 0.3) {
        // A flower box: a fence standing on the ground outside, a pot on top of
        // it, directly under the sill. Both blocks are supported by the block
        // below them, which is the whole point.
        put(cell.x + ox, 0, cell.z + oz, style["wall.fence"] as string);
        put(cell.x + ox, 1, cell.z + oz, pottedOf(choice, cell.x, cell.z));
        apronOps += 2;
      }
    }
  }

  // --- upper floors + stairs, and the ceiling ------------------------------
  const floorLevels: number[] = [0];
  const stairRuns: number[] = [];
  /** Ground-floor columns the stair run occupies; furniture must keep off. */
  const stairColumns = new Set<string>();
  for (let s = 1; s < floors; s++) {
    const level = s * storyHeight;
    floorLevels.push(level);
    if (!hasInterior) continue;
    // The stair run climbs +z along the west interior wall, from the floor
    // below (`base`) to this one.
    //
    // The run is `storyHeight` steps long, not `storyHeight - 1`. The old
    // count put the top step one block *below* the storey it served: standing
    // on its back tread your feet were at `level`, the upper floor's walking
    // surface is `level + 1`, and a one-block rise is a jump, not a stair. A
    // walkthrough reported exactly that — "the interior stairs need a jump to
    // mount". The last step now sits **in** the upper floor plane, so its back
    // half is flush with the floor it arrives on and every rise in the flight
    // is half a block. One further interior cell past the run is the landing,
    // which is why the run needs `storyHeight + 1` cells of depth to fit.
    const base = level - storyHeight;
    const runLength = storyHeight;
    const canStair = interior.z1 - interior.z0 >= runLength;
    // The floor plane keeps a hole over the whole run (the top step lives in
    // it); when the footprint is too shallow for a flight, the hole is the one
    // cell the ladder comes up through.
    const holeSpan = canStair ? runLength : 1;
    for (let z = interior.z0; z <= interior.z1; z++) {
      for (let x = interior.x0; x <= interior.x1; x++) {
        const inHole = x === interior.x0 && z < interior.z0 + holeSpan;
        if (inHole) continue;
        put(x, level, z, style["floor.interior"] as string);
      }
    }
    stairRuns.push(base + 1);
    if (canStair) {
      for (let i = 0; i < runLength; i++) {
        put(interior.x0, base + 1 + i, interior.z0 + i, style["stair.interior"] as string, {
          facing: "south",
          half: "bottom",
          shape: "straight",
        });
        if (base === 0) stairColumns.add(`${interior.x0},${interior.z0 + i}`);
      }
    } else {
      // Too shallow for a flight: a ladder up the west wall instead. `facing`
      // east means the ladder's back is fixed to the cell at `x - 1`, which is
      // the west wall — solid from y = 1 to the eave plate — so every rung has
      // the support the game requires. It runs one course *past* the floor
      // plane so a climber can step off onto it rather than into it.
      for (let y = base + 1; y <= level + 1; y++) {
        put(interior.x0, y, interior.z0, "ladder", { facing: "east" });
      }
      if (base === 0) stairColumns.add(`${interior.x0},${interior.z0}`);
    }
  }
  // A ceiling over the top storey. Without it the roof reads as a hat balanced
  // on an open box from inside, and — the reason it is not optional — a hanging
  // lantern on the top floor has nothing to hang from.
  if (hasInterior) {
    for (let z = interior.z0; z <= interior.z1; z++) {
      for (let x = interior.x0; x <= interior.x1; x++) {
        put(x, wallTop, z, style["floor.interior"] as string);
      }
    }
  }

  // --- lanterns ------------------------------------------------------------
  // Every one hangs from the floor/ceiling plane directly above it, which the
  // stage above has just guaranteed exists.
  let lanternCount = 0;
  if (hasInterior) {
    // Never in the stair column: the floor plane there is a hole, so a lantern
    // hung under it would hang from nothing.
    const cx0 = Math.floor((interior.x0 + interior.x1) / 2);
    const cx = cx0 === interior.x0 && interior.x1 > interior.x0 && floors > 1 ? cx0 + 1 : cx0;
    const cz = Math.floor((interior.z0 + interior.z1) / 2);
    for (let s = 0; s < floors; s++) {
      const y = (s + 1) * storyHeight - 1;
      put(cx, y, cz, style["light.lantern"] as string, { hanging: "true" });
      lanternCount++;
    }
  }

  // --- roof ----------------------------------------------------------------
  const roofTop = emitRoof(put, style, roof, roofLayers, roofBase, sx, sz, wallTop, grammar);
  apronOps += emitEave(put, style, roofBase, sx, sz);

  // --- chimney -------------------------------------------------------------
  let chimney = false;
  if (hasInterior && floors === 1 && archetype !== "granary" && sx >= 5 && sz >= 5) {
    chimney = emitChimney(put, style, interior, door, roofTop);
  }

  // --- fit-out -------------------------------------------------------------
  const furnitureCount = hasInterior
    ? furnish({
        put,
        style,
        archetype,
        interior,
        door,
        storyHeight,
        floors,
        choice,
        stairColumns,
        blockAt: (x, y, z) => cells.get(`${x},${y},${z}`),
      })
    : 0;
  if (door !== null) apronOps += emitPorchLamp(put, style, door, sx, sz);

  return {
    ops: sortOps([...cells.values()]),
    meta: {
      params: { floors, storyHeight, roof, windowRhythm: rhythm, windowShape, archetype },
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
      apronOps,
      furnitureCount,
      chimney,
      materialKey: `${materials.wood.planks}|${materials.stone.primary}|${materials.roof.stairs}`,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* facade                                                                      */
/* -------------------------------------------------------------------------- */

/** The outward cardinal of a perimeter cell. */
function outwardOf(cell: { x: number; z: number }, sx: number, sz: number): Cardinal {
  if (cell.z === 0) return "north";
  if (cell.z === sz - 1) return "south";
  if (cell.x === 0) return "west";
  return "east";
}

/** True for the door column or either cell beside it. */
function nearDoor(cell: { x: number; z: number }, door: { x: number; z: number }): boolean {
  return Math.abs(cell.x - door.x) + Math.abs(cell.z - door.z) <= 1;
}

interface WindowRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly cell: { x: number; z: number };
  readonly y: number;
  readonly alongZ: boolean;
  readonly shape: BuildingWindowShape;
  readonly outward: Cardinal;
  readonly storyHeight: number;
  readonly wallTop: number;
  readonly sx: number;
  readonly sz: number;
  readonly door: { x: number; z: number } | null;
}

/** Cut one window; returns how many panes went in. */
function emitWindow(r: WindowRequest): number {
  const { put, style, cell, y, alongZ } = r;
  const pane = style["wall.window"] as string;
  const props = paneConnections(alongZ);
  put(cell.x, y, cell.z, pane, props);
  if (r.shape === "tall" && y + 1 < r.wallTop && r.storyHeight >= 5) {
    put(cell.x, y + 1, cell.z, pane, props);
    return 2;
  }
  if (r.shape === "mullion") {
    // A second light two cells along the wall, with the plank between them left
    // standing as the mullion — which is why the offset is two, not one. It is
    // skipped when it would land on a corner post or in the doorway, both of
    // which are structure and neither of which may be glazed.
    const nx = cell.x + (alongZ ? 0 : 2);
    const nz = cell.z + (alongZ ? 2 : 0);
    const along = alongZ ? nz : nx;
    const span = alongZ ? r.sz : r.sx;
    const clash = r.door !== null && Math.abs(nx - r.door.x) + Math.abs(nz - r.door.z) <= 1;
    if (along > 0 && along < span - 1 && !clash) {
      put(nx, y, nz, pane, props);
      return 2;
    }
  }
  return 1;
}

/**
 * The entrance: a framed opening, a slab awning over it, and a step down to
 * where the path arrives.
 *
 * The door itself stays in the wall plane. That is not a stylistic choice —
 * `layout/ports.ts` resolved the port to exactly this column, and the road pass
 * starts its route one block outside it, so moving the leaf inward would leave
 * the lane pointing at a wall.
 */
function emitEntrance(
  put: Put,
  style: Readonly<Record<string, string>>,
  door: { x: number; z: number; face: Cardinal },
  sx: number,
  sz: number,
  archetype: BuildingArchetype,
): number {
  const facing = door.face;
  for (const half of ["lower", "upper"] as const) {
    put(door.x, half === "lower" ? 1 : 2, door.z, style["door.block"] as string, {
      facing,
      half,
      hinge: "left",
      open: "false",
    });
  }
  // The inn gets a double door: the second leaf takes the cell along the wall,
  // hinged the other way, which is what makes the pair read as one opening.
  const alongZ = door.x === 0 || door.x === sx - 1;
  let double: { x: number; z: number } | null = null;
  if (archetype === "inn" || archetype === "hall") {
    const nx = door.x + (alongZ ? 0 : 1);
    const nz = door.z + (alongZ ? 1 : 0);
    const fits = alongZ ? nz < sz - 1 : nx < sx - 1;
    if (fits) {
      double = { x: nx, z: nz };
      for (const half of ["lower", "upper"] as const) {
        put(nx, half === "lower" ? 1 : 2, nz, style["door.block"] as string, {
          facing,
          half,
          hinge: "right",
          open: "false",
        });
      }
    }
  }
  // Posts either side of the opening.
  for (const side of [-1, 1]) {
    const px = door.x + (alongZ ? 0 : side);
    const pz = door.z + (alongZ ? side : 0);
    if (px < 0 || px >= sx || pz < 0 || pz >= sz) continue;
    for (let y = 1; y <= 2; y++) {
      put(px, y, pz, style["wall.frame"] as string, { axis: "y" });
    }
  }
  // The lintel, and the awning one block **out**.
  //
  // This used to be an upside-down slab in the wall plane directly over the
  // door, and a player standing at the threshold could see straight through
  // the bottom half of it: a top slab fills only the upper half of its cell,
  // so putting one *in the wall* replaces a solid block with a half-block hole
  // over the door head. A world walkthrough reported it as exactly that. The
  // wall course above the frame is now a solid lintel log, and the slab moves
  // one cell outward over the doorstep, where its open lower half is the
  // shelter the awning was always meant to be.
  const lintelAxis = alongZ ? "z" : "x";
  put(door.x, 3, door.z, style["wall.frame"] as string, { axis: lintelAxis });
  if (double !== null) put(double.x, 3, double.z, style["wall.frame"] as string, { axis: lintelAxis });
  const [ox, oz] = cardinalStep(facing);
  let apron = 0;
  for (const cell of double === null ? [door] : [door, double]) {
    put(cell.x + ox, 3, cell.z + oz, style["roof.slab"] as string, { type: "top" });
    apron++;
  }
  return apron;
}

/**
 * The eave: an upside-down stair course in the apron ring at the roof's base
 * line.
 *
 * This is the single most valuable block of detail in the whole grammar. A roof
 * that stops flush with its walls reads as a lid; one block of overhang casts a
 * shadow line all the way round and the building suddenly has a silhouette.
 * Returns the op count, all of which are apron ops.
 */
function emitEave(
  put: Put,
  style: Readonly<Record<string, string>>,
  roofBase: number,
  sx: number,
  sz: number,
): number {
  const stairs = style["roof.stairs"] as string;
  let n = 0;
  const place = (x: number, z: number, facing: Cardinal): void => {
    put(x, roofBase, z, stairs, { facing, half: "top", shape: "straight" });
    n++;
  };
  for (let x = 0; x < sx; x++) {
    place(x, -1, "south");
    place(x, sz, "north");
  }
  for (let z = 0; z < sz; z++) {
    place(-1, z, "east");
    place(sx, z, "west");
  }
  // The four apron corners, so the course closes rather than leaving nicks.
  for (const [cx, cz] of [
    [-1, -1],
    [sx, -1],
    [-1, sz],
    [sx, sz],
  ] as const) {
    put(cx, roofBase, cz, style["roof.slab"] as string, { type: "top" });
    n++;
  }
  return n;
}

/**
 * A lamp at the door: two fence posts and a lantern on top, standing on the
 * ground in the apron beside the entrance.
 *
 * Diagonally beside, never in front: the road arrives along the door's normal,
 * and a post in that column would be a bollard in the doorway. Two posts rather
 * than one because a one-block post plus lantern reads, from any angle above,
 * as a lantern embedded in the ground.
 */
function emitPorchLamp(
  put: Put,
  style: Readonly<Record<string, string>>,
  door: { x: number; z: number; face: Cardinal },
  sx: number,
  sz: number,
): number {
  const [ox, oz] = cardinalStep(door.face);
  const alongZ = door.x === 0 || door.x === sx - 1;
  const side = alongZ ? { x: 0, z: 1 } : { x: 1, z: 0 };
  const lx = door.x + ox + side.x;
  const lz = door.z + oz + side.z;
  // Only the apron ring; a corner-of-the-apron lamp is fine, a stray one is not.
  if (lx < -1 || lx > sx || lz < -1 || lz > sz) return 0;
  put(lx, 0, lz, style["wall.fence"] as string);
  put(lx, 1, lz, style["wall.fence"] as string);
  put(lx, 2, lz, style["light.lantern"] as string, { hanging: "false" });
  return 3;
}

/** A potted flower for a window box, chosen per column. */
function pottedOf(stream: Seed256, x: number, z: number): string {
  const pots = ["potted_poppy", "potted_dandelion", "potted_azure_bluet", "potted_cornflower"];
  return pots[positionInt(stream, x, 11, z, 0, pots.length - 1)] as string;
}

/* -------------------------------------------------------------------------- */
/* roof                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Emit the roof and return the Y of its highest layer.
 *
 * All three shapes are built so their layers **union to the whole footprint** —
 * a cap layer fills whatever the sloping layers did not reach. That property is
 * what the "roof covers the footprint" test asserts, and it is why the layer
 * count is capped but the coverage never is.
 *
 * The gable additionally closes and frames its ends. The old version left the
 * triangle above the gable walls open, which is exactly the hole visible in the
 * first village renders: you could see daylight through the attic.
 */
function emitRoof(
  put: Put,
  style: Readonly<Record<string, string>>,
  roof: BuildingRoof,
  layers: number,
  base: number,
  sx: number,
  sz: number,
  wallTop: number,
  grammar: Seed256,
): number {
  const stairs = style["roof.stairs"] as string;
  const solid = style["roof.solid"] as string;
  const slab = style["roof.slab"] as string;

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
          put(x, y, z, stairs, { facing, half: "bottom", shape: "straight" });
        }
      }
    }
    const capY = base + layers;
    const capped = capRect(put, solid, capY, layers, sx - 1 - layers, layers, sz - 1 - layers);
    if (capped !== null) ridgeCap(put, slab, capY + 1, layers, sx - 1 - layers, layers, sz - 1 - layers);
    return capped === null ? base + layers - 1 : capped + 1;
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
        put(x, y, near, stairs, { facing: "south", half: "bottom", shape: "straight" });
        if (far !== near) put(x, y, far, stairs, { facing: "north", half: "bottom", shape: "straight" });
      }
    } else {
      const near = k;
      const far = sx - 1 - k;
      if (near > far) break;
      for (let z = 0; z < sz; z++) {
        put(near, y, z, stairs, { facing: "east", half: "bottom", shape: "straight" });
        if (far !== near) put(far, y, z, stairs, { facing: "west", half: "bottom", shape: "straight" });
      }
    }
  }
  const capY = base + layers;
  const capped = ridgeAlongX
    ? capRect(put, solid, capY, 0, sx - 1, layers, sz - 1 - layers)
    : capRect(put, solid, capY, layers, sx - 1 - layers, 0, sz - 1);
  // The gable ends: fill the triangle under the slope with wall, then trace the
  // rake itself in frame logs so the end reads as a framed gable, not a wedge.
  fillGableEnds(put, style, ridgeAlongX, layers, base, sx, sz, grammar);
  const top = capped ?? base + layers - 1;
  if (capped !== null) {
    if (ridgeAlongX) ridgeCap(put, slab, capY + 1, 0, sx - 1, layers, sz - 1 - layers);
    else ridgeCap(put, slab, capY + 1, layers, sx - 1 - layers, 0, sz - 1);
    return top + 1;
  }
  return top;
}

/** Lay a slab ridge cap over an inclusive rectangle. */
function ridgeCap(
  put: Put,
  slab: string,
  y: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): void {
  if (x0 > x1 || z0 > z1) return;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, slab, { type: "bottom" });
}

/**
 * Close the two ends of a gable and frame them.
 *
 * At layer `k` the slope has reached inward by `k`, so the wall must stand from
 * the eave plate up to `base + k` for every cell that is still `k` in from the
 * end. The outermost cell of each course is the rake, and gets the frame log.
 */
function fillGableEnds(
  put: Put,
  style: Readonly<Record<string, string>>,
  ridgeAlongX: boolean,
  layers: number,
  base: number,
  sx: number,
  sz: number,
  grammar: Seed256,
): void {
  const wall = style["wall.primary"] as string;
  const frame = style["wall.frame"] as string;
  const accent = style["wall.accent"] as string;
  const ends = ridgeAlongX ? [0, sx - 1] : [0, sz - 1];
  const span = ridgeAlongX ? sz : sx;

  for (const end of ends) {
    for (let k = 0; k < layers; k++) {
      const near = k;
      const far = span - 1 - k;
      if (near > far) break;
      const y = base + k;
      const axis = ridgeAlongX ? "z" : "x";
      // The outermost cell of each course is already a roof stair — the verge —
      // and overwriting it would square the roof's end off. So the wall starts
      // one in, and the rake log runs down the *inside* of the verge, which is
      // where a real barge board sits anyway.
      for (let t = near + 1; t <= far - 1; t++) {
        const x = ridgeAlongX ? end : t;
        const z = ridgeAlongX ? t : end;
        const rake = t === near + 1 || t === far - 1;
        const grained = positionFloat(grammar, x, y, z) < WALL_ACCENT_SHARE;
        if (rake) put(x, y, z, frame, { axis });
        else if (grained) put(x, y, z, accent, { axis });
        else put(x, y, z, wall);
      }
    }
  }
}

/**
 * A cobblestone chimney from the hearth to above the ridge, with a corbelled
 * head, a wall rim, and a campfire in it.
 *
 * Fire safety is structural, not hoped for: the campfire's block below is the
 * corbel, its four horizontal neighbours are the rim's cobblestone walls, and
 * nothing is emitted above it. The shaft is placed on an *interior* column, so
 * the 3×3 corbel is guaranteed to stay inside the footprint.
 */
function emitChimney(
  put: Put,
  style: Readonly<Record<string, string>>,
  interior: LocalRect,
  door: { x: number; z: number } | null,
  roofTop: number,
): boolean {
  const block = style["chimney.block"] as string;
  const rim = style["chimney.rim"] as string;
  // The interior corner furthest from the door, so the flue never fights the
  // entrance for the same wall.
  const candidates: readonly (readonly [number, number])[] = [
    [interior.x0, interior.z0],
    [interior.x1, interior.z0],
    [interior.x0, interior.z1],
    [interior.x1, interior.z1],
  ];
  let best = candidates[0] as readonly [number, number];
  let bestD = -1;
  for (const c of candidates) {
    const d = door === null ? 0 : Math.abs(c[0] - door.x) + Math.abs(c[1] - door.z);
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  const [cx, cz] = best;
  if (cx - 1 < 0 || cx + 1 > interior.x1 + 1 || cz - 1 < 0 || cz + 1 > interior.z1 + 1) return false;

  const corbelY = roofTop + 1;
  for (let y = 0; y <= corbelY - 1; y++) put(cx, y, cz, block);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) put(cx + dx, corbelY, cz + dz, block);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      put(cx + dx, corbelY + 1, cz + dz, rim, { up: "true", waterlogged: "false" });
    }
  }
  put(cx, corbelY + 1, cz, "campfire", { lit: "true", facing: "north", signal_fire: "false", waterlogged: "false" });
  return true;
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
/* interiors                                                                   */
/* -------------------------------------------------------------------------- */

interface FurnishRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly archetype: BuildingArchetype;
  readonly interior: LocalRect;
  readonly door: { x: number; z: number; face: Cardinal } | null;
  readonly storyHeight: number;
  readonly floors: number;
  readonly choice: Seed256;
  /** Ground-floor columns the inter-storey stair run stands in. */
  readonly stairColumns: ReadonlySet<string>;
  /** What the earlier stages have already written at a cell, if anything. */
  readonly blockAt: (x: number, y: number, z: number) => LocalVoxelOp | undefined;
}

/**
 * Fit out the ground floor for what the building is *for*.
 *
 * Modest on purpose: a handful of props that say "someone lives/works here" and
 * that a player can use. Everything stands on the floor plane at `y = 0`, which
 * exists over the whole interior, so nothing here can float. Cells adjacent to
 * the door are left clear so a prop never blocks the way in.
 */
function furnish(r: FurnishRequest): number {
  const { put, style, interior, door } = r;
  const w = interior.x1 - interior.x0 + 1;
  const d = interior.z1 - interior.z0 + 1;
  if (w < 2 || d < 2) return 0;

  let n = 0;
  const free = (x: number, z: number): boolean => {
    if (x < interior.x0 || x > interior.x1 || z < interior.z0 || z > interior.z1) return false;
    // Never on the stairs: a bed head in the bottom step is both ugly and a
    // broken climb, and it is exactly what happened the first time round.
    if (r.stairColumns.has(`${x},${z}`)) return false;
    if (door === null) return true;
    // The door column and the cell straight inside it stay clear.
    const [dx, dz] = cardinalStep(door.face);
    return !((x === door.x && z === door.z) || (x === door.x - dx && z === door.z - dz));
  };
  const place = (x: number, z: number, block: string, props?: Record<string, string>): void => {
    if (!free(x, z)) return;
    put(x, 1, z, block, props);
    n++;
  };
  /**
   * Lay a bed, both halves or neither.
   *
   * Minecraft stores a bed as two blocks sharing one `facing`, with the head
   * at `foot + facing`. The first version had the pair the other way round —
   * head at the anchor, foot at `+z` with `facing = south` — and the client
   * renders that mismatch as two overlapping bed pieces, which is what a
   * walkthrough reported. It also placed each half through `place`, so a foot
   * that landed on a blocked cell left a headboard on its own. Both halves are
   * now checked before either is written, and the head offset is taken from
   * the same `facing` the blocks carry, so {@link rotateOps} — which rotates
   * coordinates and `facing` by the same yaw — keeps the pair together.
   */
  const placeBed = (x: number, z: number, facing: Cardinal, block: string): void => {
    const [dx, dz] = cardinalStep(facing);
    const hx = x + dx;
    const hz = z + dz;
    if (!free(x, z) || !free(hx, hz)) return;
    put(x, 1, z, block, { facing, part: "foot", occupied: "false" });
    put(hx, 1, hz, block, { facing, part: "head", occupied: "false" });
    n += 2;
  };
  // Wall torches, on the interior face of the two long walls.
  const torchY = Math.min(3, r.storyHeight - 1);
  const torch = style["light.torch"] as string;
  const wallTorch = torch === "torch" ? "wall_torch" : torch;
  for (const [tx0, tz, facing, slide] of [
    [interior.x0, interior.z0, "south", 1],
    [interior.x1, interior.z1, "north", -1],
  ] as const) {
    // A torch bracketed to the north or south wall may slide *along* that wall
    // but never off it, because `facing` names the block it hangs on. It has
    // to slide for two reasons, both found by a world readback: a torch two
    // blocks over the bottom step of a stair is a low bridge you cannot walk
    // under, and a torch whose backing cell is a **window** is bracketed to a
    // pane, which is not a solid face and which the game would drop on the
    // first block update.
    const [bx, bz] = cardinalStep(facing);
    let tx: number | null = null;
    for (let k = 0; k <= interior.x1 - interior.x0; k++) {
      const candidate = tx0 + slide * k;
      if (candidate < interior.x0 || candidate > interior.x1) break;
      if (r.stairColumns.has(`${candidate},${tz}`)) continue;
      const backing = r.blockAt(candidate + bx, torchY, tz + bz);
      if (backing === undefined || !SOLID_BACKING.test(backing.block)) continue;
      tx = candidate;
      break;
    }
    if (tx === null) continue;
    put(tx, torchY, tz, wallTorch, { facing });
    n++;
  }

  const x0 = interior.x0;
  const x1 = interior.x1;
  const z0 = interior.z0;
  const z1 = interior.z1;

  switch (r.archetype) {
    case "cottage": {
      placeBed(x0, z0, "south", "red_bed");
      place(x1, z0, "chest", { facing: "west", type: "single" });
      place(x1, z1, "crafting_table");
      place(x1 - 1 >= x0 ? x1 - 1 : x1, z1, "barrel", { facing: "up", open: "false" });
      break;
    }
    case "inn": {
      // Two or three tables: a fence stem with a pressure plate for a top, and
      // stair chairs turned in towards it.
      for (let i = 0; i < 3; i++) {
        const tx = x0 + 1 + i * 2;
        const tz = z0 + 1 + (i % 2);
        if (tx > x1 - 1 || tz > z1 - 1) continue;
        place(tx, tz, style["wall.fence"] as string);
        if (free(tx, tz)) {
          put(tx, 2, tz, "oak_pressure_plate", { powered: "false" });
          n++;
        }
        place(tx - 1, tz, style["stair.interior"] as string, { facing: "east", half: "bottom" });
        place(tx + 1, tz, style["stair.interior"] as string, { facing: "west", half: "bottom" });
      }
      place(x1, z0, "barrel", { facing: "up", open: "false" });
      place(x1, z0 + 1, "barrel", { facing: "up", open: "false" });
      place(x0, z1, "cauldron", { level: "0" });
      break;
    }
    case "smithy": {
      place(x0, z0, "blast_furnace", { facing: "south", lit: "false" });
      place(x0 + 1, z0, "anvil", { facing: "south" });
      place(x1, z0, "smithing_table");
      place(x1, z1, "chest", { facing: "west", type: "single" });
      place(x0, z1, "cauldron", { level: "0" });
      break;
    }
    case "granary": {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if ((x + z) % 2 !== 0) continue;
          place(x, z, "hay_block", { axis: (x + z) % 4 === 0 ? "y" : "x" });
        }
      }
      place(x1, z1, "composter", { level: "0" });
      place(x0, z1, "barrel", { facing: "up", open: "false" });
      break;
    }
    case "hall": {
      // A long table down the middle, a carpet runner beside it, banners high on
      // the end wall.
      const mid = Math.floor((x0 + x1) / 2);
      for (let z = z0 + 1; z <= z1 - 1; z++) {
        place(mid, z, style["wall.fence"] as string);
        if (free(mid, z)) {
          put(mid, 2, z, "oak_pressure_plate", { powered: "false" });
          n++;
        }
        place(mid - 1, z, "white_carpet");
        place(mid + 1, z, "white_carpet");
      }
      for (const bx of [mid - 1, mid + 1]) {
        if (bx < x0 || bx > x1) continue;
        put(bx, Math.min(4, r.storyHeight - 1), z0, "blue_banner", { rotation: "8" });
        n++;
      }
      place(x0, z1, "barrel", { facing: "up", open: "false" });
      place(x1, z1, "bookshelf");
      break;
    }
    default:
      break;
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* the watchtower                                                              */
/* -------------------------------------------------------------------------- */

interface TowerRequest {
  readonly put: Put;
  readonly cells: Map<string, LocalVoxelOp>;
  readonly style: Readonly<Record<string, string>>;
  readonly grammar: Seed256;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly foundationDepth: number;
  readonly door: { x: number; z: number; face: Cardinal } | null;
  readonly materials: BuildingMaterials;
  readonly params: ResolvedBuildingParams;
}

/**
 * A watchtower, which is a different building rather than a house with a flat
 * roof.
 *
 * The silhouette is the point: a full-footprint stone base, a shaft one block
 * narrower above it so the tower tapers, a corbel course flaring back out under
 * the parapet, and merlons on top with the gaps between them left open. A
 * ladder runs the full height and the fighting platform is a real floor, so the
 * thing is climbable rather than sculptural.
 */
function emitWatchtower(r: TowerRequest): BuildingResult {
  const { put, cells, style, grammar, sx, sy, sz, door } = r;
  const primary = style["foundation.primary"] as string;
  const accent = style["foundation.accent"] as string;
  const stoneAt = (x: number, y: number, z: number): string =>
    positionFloat(grammar, x, y, z) < 0.28 ? accent : primary;

  for (let d = 1; d <= r.foundationDepth; d++) {
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) put(x, -d, z, stoneAt(x, -d, z));
  }
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) put(x, 0, z, stoneAt(x, 0, z));

  const baseTop = 4;
  const platformY = Math.max(baseTop + 4, sy - 3);
  const shaft: LocalRect = { x0: 1, z0: 1, x1: sx - 2, z1: sz - 2 };
  const hasShaft = shaft.x1 - shaft.x0 >= 2 && shaft.z1 - shaft.z0 >= 2;
  const ring = perimeter(sx, sz);
  // The ladder's column, decided before anything is built because two later
  // stages have to keep out of its way: the arrow slits must not punch out the
  // wall it is fixed to, and the platform must leave it a hole to come up
  // through. `ladderBackX` is the wall cell the rungs attach to; the ladder
  // itself stands one cell *inside* it.
  const ladderBackX = Math.floor(sx / 2);
  const ladderBackZ = shaft.z0;
  const ladderZ = Math.min(shaft.z0 + 1, Math.max(shaft.z0 + 1, shaft.z1));

  // --- base: the full footprint, up to the first set-back ------------------
  for (let y = 1; y <= baseTop; y++) {
    for (const cell of ring) put(cell.x, y, cell.z, stoneAt(cell.x, y, cell.z));
  }
  if (door !== null) {
    for (const half of ["lower", "upper"] as const) {
      put(door.x, half === "lower" ? 1 : 2, door.z, style["door.block"] as string, {
        facing: door.face,
        half,
        hinge: "left",
        open: "false",
      });
    }
    // The course above the door head stays the solid wall it already is; a
    // top slab there would leave the lower half of the cell open, which is the
    // half-block hole a walkthrough reported over every doorway. The awning
    // moves one cell out over the doorstep instead.
    const [ox, oz] = cardinalStep(door.face);
    put(door.x + ox, 3, door.z + oz, style["stone.slab"] as string, { type: "top" });
  }
  // The set-back course reads as a plinth cap.
  for (const cell of ring) {
    put(cell.x, baseTop + 1, cell.z, style["stone.slab"] as string, { type: "bottom" });
  }

  // --- shaft ---------------------------------------------------------------
  const shaftRing = hasShaft
    ? perimeter(shaft.x1 - shaft.x0 + 1, shaft.z1 - shaft.z0 + 1).map((c) => ({
        x: c.x + shaft.x0,
        z: c.z + shaft.z0,
      }))
    : ring;
  for (let y = baseTop + 1; y < platformY; y++) {
    for (const cell of shaftRing) put(cell.x, y, cell.z, stoneAt(cell.x, y, cell.z));
  }
  // Arrow slits: one per face, every fourth course.
  for (let y = baseTop + 3; y < platformY - 1; y += 4) {
    for (const cell of shaftRing) {
      const onX = cell.x === shaft.x0 || cell.x === shaft.x1;
      const onZ = cell.z === shaft.z0 || cell.z === shaft.z1;
      if (onX && onZ) continue;
      const mid = onX
        ? cell.z === Math.floor((shaft.z0 + shaft.z1) / 2)
        : cell.x === Math.floor((shaft.x0 + shaft.x1) / 2);
      if (!mid) continue;
      // Never the ladder's backing column. On an odd footprint the north
      // face's mid cell *is* that column, so every fourth course used to
      // delete the wall behind the ladder and leave rungs fixed to open air —
      // a walkthrough found the tower shaft full of them.
      if (cell.x === ladderBackX && cell.z === ladderBackZ) continue;
      cells.delete(`${cell.x},${y},${cell.z}`);
    }
  }

  // --- corbel + platform + parapet ----------------------------------------
  // The corbel flares back to the full footprint on upside-down stairs, which is
  // what makes the top read as a fighting platform rather than a wider box.
  for (const cell of ring) {
    const facing = outwardOf(cell, sx, sz);
    put(cell.x, platformY, cell.z, style["stone.stairs"] as string, {
      facing: opposite(facing),
      half: "top",
      shape: "straight",
    });
  }
  for (let z = 1; z <= sz - 2; z++) {
    for (let x = 1; x <= sx - 2; x++) put(x, platformY, z, stoneAt(x, platformY, z));
  }
  for (const cell of ring) {
    put(cell.x, platformY + 1, cell.z, stoneAt(cell.x, platformY + 1, cell.z));
    // Merlons: every other cell of the ring, in a phase that is a pure function
    // of position so opposite walls agree.
    if ((cell.x + cell.z) % 2 === 0) {
      put(cell.x, platformY + 2, cell.z, stoneAt(cell.x, platformY + 2, cell.z));
    }
  }

  // --- ladder + lights -----------------------------------------------------
  // Every rung is fixed to a solid cell. `facing = south` means the ladder's
  // back is against the block at `z - 1`, so the ladder stands at `ladderZ`
  // and its backing column at `ladderBackZ` is filled the whole way up — the
  // base storey's interior and the parapet course have no wall there of their
  // own, so this pass supplies one, which reads as a pilaster.
  const lx = ladderBackX;
  const lz = ladderZ;
  const ladderFacing: Cardinal = "south";
  for (let y = 1; y <= platformY + 1; y++) {
    if (cells.get(`${lx},${y},${ladderBackZ}`) === undefined) {
      put(lx, y, ladderBackZ, stoneAt(lx, y, ladderBackZ));
    }
    // The platform floor and the storeys below it must not block the shaft.
    cells.delete(`${lx},${y},${lz}`);
    put(lx, y, lz, "ladder", { facing: ladderFacing });
  }
  // Torches up the shaft, bracketed to the wall the ladder is fixed to. They
  // were free-standing lanterns until a world readback found them hanging in
  // mid-air: nothing in an open shaft can support a lantern, but a wall torch
  // *is* supported by the wall it names.
  let lanternCount = 0;
  const bracketX = lx + 1 <= shaft.x1 ? lx + 1 : lx - 1;
  for (let y = baseTop + 3; y < platformY; y += 4) {
    // Same course as the ladder, so the bracket is against the shaft wall at
    // `ladderBackZ` — `facing = south` names the block behind it, and an
    // arrow slit in that cell means there is nothing to bracket to.
    if (cells.get(`${bracketX},${y},${ladderBackZ}`) === undefined) continue;
    put(bracketX, y, ladderZ, "wall_torch", { facing: "south" });
    lanternCount++;
  }
  // A lantern on a post at the parapet corner: a beacon, and supported.
  put(1, platformY + 1, 1, style["stone.wall"] as string, { up: "true", waterlogged: "false" });
  put(1, platformY + 2, 1, style["light.lantern"] as string, { hanging: "false" });
  lanternCount++;

  const roofTop = platformY + 2;
  return {
    ops: sortOps([...cells.values()]),
    meta: {
      params: r.params,
      size: [sx, sy, sz],
      wallTop: platformY,
      roofBase: platformY,
      roofTop,
      height: roofTop + 1,
      foundationDepth: r.foundationDepth,
      door,
      interior: shaft,
      floorLevels: [0, platformY],
      stairRuns: [1],
      windowCount: 0,
      lanternCount,
      apronOps: door === null ? 0 : 1,
      furnitureCount: 0,
      chimney: false,
      materialKey: `${r.materials.wood.planks}|${r.materials.stone.primary}|${r.materials.roof.stairs}`,
    },
  };
}

function opposite(c: Cardinal): Cardinal {
  return rotateFacing(c, 180);
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Block names a wall-mounted torch, sign or bracket may hang on.
 *
 * The grammar's wall vocabulary is small and closed — planks, logs, stone,
 * brick, glass panes, doors, trapdoors — so a positive match on the solid part
 * of it is both exact and cheap. Anything unrecognised is treated as *not* a
 * face, which is the safe direction: the cost of a false negative is a torch
 * one cell further along the wall.
 */
const SOLID_BACKING = /(planks|_log$|_wood$|bricks?$|cobblestone$|stone$|_block$|deepslate$|terracotta$|sandstone$|_tiles$|glass$)/;

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
  // shapes this version builds, rather than failing the compile.
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

function resolveArchetype(value: string | undefined): BuildingArchetype {
  if (value !== undefined && (BUILDING_ARCHETYPES as readonly string[]).includes(value)) {
    return value as BuildingArchetype;
  }
  return "cottage";
}

/** The window shape: the caller's, else one drawn from the node seed. */
function resolveWindowShape(
  value: string | undefined,
  choice: Seed256,
  storyHeight: number,
): BuildingWindowShape {
  if (value !== undefined && (BUILDING_WINDOW_SHAPES as readonly string[]).includes(value)) {
    return value as BuildingWindowShape;
  }
  const pick = positionInt(choice, 0, 0, 0, 0, BUILDING_WINDOW_SHAPES.length - 1);
  const shape = BUILDING_WINDOW_SHAPES[pick] as BuildingWindowShape;
  return shape === "tall" && storyHeight < 5 ? "single" : shape;
}

/** The materials a caller that did not assign any gets: the seed's own theme. */
function defaultMaterials(seed: Seed256): BuildingMaterials {
  const theme = pickTheme(seed);
  const wi = positionInt(streamSeed(seed, "theme.self"), 1, 0, 0, 0, theme.woods.length - 1);
  const ri = positionInt(streamSeed(seed, "theme.self"), 2, 0, 0, 0, theme.roofs.length - 1);
  const si = positionInt(streamSeed(seed, "theme.self"), 3, 0, 0, 0, theme.stones.length - 1);
  return {
    wood: theme.woods[wi] as BuildingMaterials["wood"],
    roof: theme.roofs[ri] as BuildingMaterials["roof"],
    stone: theme.stones[si] as BuildingMaterials["stone"],
  };
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
 *   windowShape, archetype (cottage|hall|inn|smithy|granary|watchtower),
 *   wallSymbol, trimSymbol, roofSymbol, the `door` port, per-village material
 *   themes with a per-building unique (wall, stone, roof) triple, eaves, gable
 *   framing, slab ridge caps, chimneys, shutters, window boxes, a porch lamp,
 *   and archetype interiors.
 *
 * v0.2 §7: not yet — `footprint` (only `rect`; l/t/u/cross/courtyard/irregular
 *   massing needs a shape grammar).
 * v0.2 §7: not yet — `bays` (facade module count; windows use `windowRhythm`).
 * v0.2 §7: not yet — `roofPitch` (pitch is fixed at one layer per row).
 * v0.2 §7: not yet — `windowRatio` (glazed fraction is implied by the rhythm).
 * v0.2 §7: not yet — `basement`, and with it the `tunnel_stub` port.
 * v0.2 §7: not yet — `tower`, `variance`, `decayOverride`.
 * v0.2 §7: not yet — the `gate`/`arch`/`window`/`stair_top`/`stair_bottom`
 *   ports, and the `entrance`/`ridge`/`interior_center` markers.
 */

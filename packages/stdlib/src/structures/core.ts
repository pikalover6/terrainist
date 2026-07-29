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

import {
  archetypeFacadeDefaults,
  furnish,
  furnishCellar,
  resolveArchetype,
  type BuildingArchetype,
} from "./archetypes.js";
import { pickTheme, styleOf, type BuildingMaterials } from "./themes.js";

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
  "cellar.floor": "stone_bricks",
  "cellar.wall": "stone_bricks",
  "cellar.wall_cracked": "cracked_stone_bricks",
  "cellar.crate": "barrel",
  "cellar.cobweb": "cobweb",
});

/** Cellar headroom when `basement` is asked for without a depth. */
export const DEFAULT_BASEMENT_DEPTH = 4;

/** Shallowest and deepest cellar this grammar digs. */
export const MIN_BASEMENT_DEPTH = 3;
/** Deepest cellar this grammar digs. */
export const MAX_BASEMENT_DEPTH = 5;

/** Share of cellar masonry that comes up cracked. */
const CELLAR_CRACK_SHARE = 0.28;

/** Most of a granary floor that hay bales may stand on. */
const GRANARY_HAY_SHARE = 0.25;

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
  /**
   * Cellar headroom in blocks, or 0 for none.
   *
   * Resolved by the caller — `true`, `{ depth }` and the bare int of the v0.2
   * catalog all mean the same thing here, and the profile validator is where
   * that spelling is settled.
   */
  readonly basement?: number;
  /**
   * A second rect unioned onto the main one — the L and the T of v0.2 §7's
   * `footprint` vocabulary. See {@link BuildingWing}. Ignored (silently, so a
   * document is never failed by the grammar) when it does not validate.
   */
  readonly wing?: BuildingWing;
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

/* -------------------------------------------------------------------------- */
/* footprint — the main rect, plus an optional wing                            */
/* -------------------------------------------------------------------------- */

/**
 * A wing: the second rect of an L- or T-shaped plan.
 *
 * The *envelope* never changes. `size` is still the bounding box the solver
 * placed and the occupancy grid claimed; a wing does not grow it, it **carves
 * it**. The main rect is the envelope minus the wing's reach on the wing's
 * side, and the wing is the strip it gives up — so a `[13, 8, 11]` cottage with
 * a `{ size: [5, 4], side: "south", offset: 0 }` wing is a 13 × 8 main block
 * with a 5 × 4 ell hanging off its south-west corner, and the two together
 * still fit exactly inside 13 × 11.
 *
 * That is the only arrangement in which the layout solver, the pad edit, the
 * road pass and the terrain clip all keep working untouched: every one of them
 * reasons about the bounding box, and the bounding box is still true. What
 * changes is which *cells inside it* are built — and those are the cells the
 * emit pass claims (`meta.cells`), so the ground the building actually owns is
 * the ground it actually covers.
 *
 * - `size` — `[x, z]` extents of the wing rect, in blocks.
 * - `side` — which face of the main block it hangs off.
 * - `offset` — where along that face it starts, from the envelope's min corner
 *   on the along-axis (x for a north/south wing, z for an east/west one).
 *
 * The wing **shares one row** with the main rect: the main block's wall line on
 * that side. That row is what makes the union a single connected solid rather
 * than two buildings touching, and its interior cells are the opening between
 * the two rooms — which is why the run has to be at least
 * {@link MIN_WING_OVERLAP} long (a two-cell overlap is two corner posts and no
 * doorway).
 */
export interface BuildingWing {
  /** `[x, z]` extents of the wing rect. */
  readonly size: readonly [number, number];
  /** The main block's face the wing hangs off. */
  readonly side: Cardinal;
  /** Start of the wing along the shared face, from the envelope's min corner. */
  readonly offset: number;
}

/** Shortest shared run that still leaves a doorway between the two rects. */
export const MIN_WING_OVERLAP = 3;

/** Shallowest wing that is a room rather than a buttress. */
export const MIN_WING_DEPTH = 3;

/** Least main-block depth left after a wing has taken its bite. */
export const MIN_MAIN_DEPTH = 3;

/**
 * A resolved footprint: one or two rects inside a bounding box.
 *
 * `wing === null` is the pure-rect case, and it is a genuine fast path — the
 * main rect *is* the bounding box, every predicate below reduces to the
 * inequalities the pre-wing grammar used inline, and the emitted ops are
 * byte-identical to what that grammar produced. `test/footprints.test.ts`
 * pins that.
 */
export interface Footprint {
  /** Bounding-box extents — the envelope the solver placed. */
  readonly sx: number;
  readonly sz: number;
  readonly main: LocalRect;
  readonly wing: LocalRect | null;
}

/** True when `(x, z)` is inside an inclusive rect. */
export function inRect(rect: LocalRect, x: number, z: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
}

/** True when `(x, z)` is a built cell of the footprint. */
export function footprintCovers(fp: Footprint, x: number, z: number): boolean {
  if (inRect(fp.main, x, z)) return true;
  return fp.wing !== null && inRect(fp.wing, x, z);
}

/** Why a wing was refused, or `null` when it validates. */
export type WingRejection =
  | "not_finite"
  | "overlap_too_short"
  | "wing_too_shallow"
  | "main_too_shallow"
  | "overhangs";

/**
 * Check a wing against a bounding box.
 *
 * Returns `null` when it is buildable, or the reason it is not. The grammar
 * itself is forgiving — a wing it refuses is simply dropped and the building
 * comes out a rect — because the place a defective document should be *told*
 * about it is the profile validator, which reports this same set of reasons
 * with fix hints.
 */
export function checkWing(sx: number, sz: number, wing: BuildingWing): WingRejection | null {
  const wx = wing.size[0];
  const wz = wing.size[1];
  const offset = wing.offset;
  if (
    !Number.isFinite(wx) ||
    !Number.isFinite(wz) ||
    !Number.isFinite(offset) ||
    !Number.isInteger(wx) ||
    !Number.isInteger(wz) ||
    !Number.isInteger(offset)
  ) {
    return "not_finite";
  }
  const alongX = wing.side === "north" || wing.side === "south";
  const span = alongX ? wx : wz;
  const depth = alongX ? wz : wx;
  const boxSpan = alongX ? sx : sz;
  const boxDepth = alongX ? sz : sx;
  if (span < MIN_WING_OVERLAP) return "overlap_too_short";
  if (depth < MIN_WING_DEPTH) return "wing_too_shallow";
  // The wing shares one row with the main block, so it eats `depth - 1` of the
  // envelope's depth and leaves the rest.
  if (boxDepth - depth + 1 < MIN_MAIN_DEPTH) return "main_too_shallow";
  // Straight edges only: a wing that ran past the end of the face it hangs off
  // would put a wall segment in mid-air over the notch, and the outline tracer
  // would have to invent a corner that is neither convex nor reflex.
  if (offset < 0 || offset + span > boxSpan) return "overhangs";
  return null;
}

/**
 * Resolve `(size, wing)` into a footprint.
 *
 * A wing that does not pass {@link checkWing} is dropped and the pure rect
 * returned, which is also what happens when no wing was asked for at all.
 */
export function resolveFootprint(sx: number, sz: number, wing?: BuildingWing): Footprint {
  const rect: Footprint = { sx, sz, main: { x0: 0, z0: 0, x1: sx - 1, z1: sz - 1 }, wing: null };
  if (wing === undefined) return rect;
  if (checkWing(sx, sz, wing) !== null) return rect;
  const [wx, wz] = wing.size;
  const off = wing.offset;
  switch (wing.side) {
    case "south": {
      const shared = sz - wz;
      return {
        sx,
        sz,
        main: { x0: 0, z0: 0, x1: sx - 1, z1: shared },
        wing: { x0: off, z0: shared, x1: off + wx - 1, z1: sz - 1 },
      };
    }
    case "north": {
      const shared = wz - 1;
      return {
        sx,
        sz,
        main: { x0: 0, z0: shared, x1: sx - 1, z1: sz - 1 },
        wing: { x0: off, z0: 0, x1: off + wx - 1, z1: shared },
      };
    }
    case "east": {
      const shared = sx - wx;
      return {
        sx,
        sz,
        main: { x0: 0, z0: 0, x1: shared, z1: sz - 1 },
        wing: { x0: shared, z0: off, x1: sx - 1, z1: off + wz - 1 },
      };
    }
    default: {
      const shared = wx - 1;
      return {
        sx,
        sz,
        main: { x0: shared, z0: 0, x1: sx - 1, z1: sz - 1 },
        wing: { x0: 0, z0: off, x1: shared, z1: off + wz - 1 },
      };
    }
  }
}

/** A traced outline cell: where the wall turns, and which way it faces out. */
export interface OutlineCell {
  readonly x: number;
  readonly z: number;
  /** Cardinals in which the next cell is *not* part of the footprint. */
  readonly blocked: readonly Cardinal[];
  /**
   * True at a post: a convex corner (two perpendicular blocked sides) or a
   * reflex one (none blocked, but a diagonal neighbour missing). Both need a
   * standing post rather than a wall course, and neither may be glazed.
   */
  readonly corner: boolean;
  /** True when the wall runs along x — the course a belt log lies down. */
  readonly alongX: boolean;
  /** The outward normal; `north` at a reflex corner, which has none. */
  readonly outward: Cardinal;
}

/** The traced footprint: its cells, its outline and its enclosed interior. */
export interface Shell {
  readonly fp: Footprint;
  /** Every built cell, in canonical (z, x) order. */
  readonly cells: readonly { readonly x: number; readonly z: number }[];
  /** The outline, in the same canonical order. */
  readonly ring: readonly OutlineCell[];
  /** Enclosed cells — floor, never wall — in the same order. */
  readonly interiorCells: readonly { readonly x: number; readonly z: number }[];
}

/** Cardinals in outward-priority order: the tie-break at a convex corner. */
const OUTWARD_ORDER: readonly Cardinal[] = Object.freeze(["north", "south", "west", "east"] as const);

/**
 * Trace a footprint into cells, outline and interior.
 *
 * A cell is **interior** when all eight of its neighbours are built, and
 * **outline** otherwise. Eight and not four, deliberately: at a reflex corner
 * the only missing neighbour is the diagonal one, and calling that cell
 * interior would leave the two wall runs meeting corner-to-corner with a
 * one-block diagonal hole between them — daylight through the elbow of every L.
 *
 * On a pure rect the two rules agree exactly with the old inline ones: the
 * interior is `1..sx-2 × 1..sz-2`, the ring is {@link perimeter}'s cells in
 * {@link perimeter}'s order, `corner` is the four box corners, `alongX` is
 * `z === 0 || z === sz - 1`, and `outward` matches {@link outwardOf}. That is
 * what makes the rect case byte-identical rather than merely equivalent.
 */
export function traceShell(fp: Footprint): Shell {
  const cells: { x: number; z: number }[] = [];
  const ring: OutlineCell[] = [];
  const interiorCells: { x: number; z: number }[] = [];
  const has = (x: number, z: number): boolean => footprintCovers(fp, x, z);
  for (let z = 0; z < fp.sz; z++) {
    for (let x = 0; x < fp.sx; x++) {
      if (!has(x, z)) continue;
      cells.push({ x, z });
      let enclosed = true;
      for (let dz = -1; dz <= 1 && enclosed; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          if (!has(x + dx, z + dz)) {
            enclosed = false;
            break;
          }
        }
      }
      if (enclosed) {
        interiorCells.push({ x, z });
        continue;
      }
      const blocked: Cardinal[] = [];
      for (const dir of OUTWARD_ORDER) {
        const [dx, dz] = cardinalStep(dir);
        if (!has(x + dx, z + dz)) blocked.push(dir);
      }
      const onZ = blocked.includes("north") || blocked.includes("south");
      const onX = blocked.includes("west") || blocked.includes("east");
      const corner = (onZ && onX) || blocked.length === 0;
      ring.push({
        x,
        z,
        blocked,
        corner,
        alongX: onZ,
        outward: blocked[0] ?? "north",
      });
    }
  }
  return { fp, cells, ring, interiorCells };
}

/** Index a shell's outline by cell, for the facade's neighbour questions. */
export function outlineIndex(shell: Shell): ReadonlyMap<string, OutlineCell> {
  const map = new Map<string, OutlineCell>();
  for (const cell of shell.ring) map.set(`${cell.x},${cell.z}`, cell);
  return map;
}

/**
 * The footprint's cells under a yaw, as `x,z` keys in the rotated box.
 *
 * The same rotation {@link rotateOps} applies to the ops, applied to the claim
 * — so "the cells this building owns" survives the solver's yaw without the
 * emit pass having to re-derive the plan.
 */
export function rotateCells(
  cells: readonly { readonly x: number; readonly z: number }[],
  yaw: StructureYaw,
  sizeX: number,
  sizeZ: number,
): { x: number; z: number }[] {
  const out = cells.map((c) => rotateLocalColumn(c.x, c.z, sizeX, sizeZ, yaw));
  return out.sort((a, b) => a.z - b.z || a.x - b.x);
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
  /**
   * The enclosed interior of the **main** rect, inclusive; empty when the
   * footprint is 2 or less.
   *
   * Unchanged by a wing, and deliberately so: every existing consumer — the
   * fit-out, the chimney, the stair well, the cellar — reasons about a
   * rectangle, and a wing is additive. {@link BuildingMeta.floorCells} is the
   * generalization, and it spans both rects.
   */
  readonly interior: LocalRect;
  /** The resolved footprint: bounding box, main rect, and the wing or `null`. */
  readonly footprint: Footprint;
  /**
   * Every built cell of the footprint, unrotated, in canonical (z, x) order.
   *
   * The building's true claim on the ground. Equal to the whole bounding box in
   * the pure-rect case; a strict subset of it when there is a wing, which is
   * what the emit pass reads so an apron decoration over the notch is treated
   * as an apron op rather than as structure.
   */
  readonly cells: readonly { readonly x: number; readonly z: number }[];
  /**
   * Enclosed floor cells across **both** rects, in canonical (z, x) order.
   *
   * Additive: the archetype fit-out still reads {@link BuildingMeta.interior},
   * so a wing gets floor, ceiling and light but no furniture in this version.
   */
  readonly floorCells: readonly { readonly x: number; readonly z: number }[];
  /** Y of each story's floor plane, lowest first. */
  readonly floorLevels: readonly number[];
  /** Y of the lowest step of each inter-story stair run. */
  readonly stairRuns: readonly number[];
  /**
   * Cellar headroom actually dug, in blocks; 0 when the building has none.
   *
   * The cellar's walkable plane is `-basementDepth` and its floor slab is at
   * `-(basementDepth + 1)`, so `floorLevels[0]` is that slab whenever this is
   * non-zero — which is what makes the traversal lint walk down there.
   */
  readonly basementDepth: number;
  /** The cellar's enclosed interior; the footprint interior when it has one. */
  readonly basementInterior: LocalRect | null;
  /** Local column of the cellar ladder, or `null` without a cellar. */
  readonly basementAccess: { readonly x: number; readonly z: number } | null;
  readonly windowCount: number;
  /**
   * Interior lights — one per storey, plus one per storey for a wing.
   *
   * Usually hanging lanterns. In a room one cell across it is a wall torch
   * instead: a lantern at head height in a one-wide room is a wall across the
   * only corridor the room has, which the physics lint reports as unreachable
   * floor. The count is the same either way, because what it means is "this
   * storey is lit", and that is the property every caller reads it for.
   */
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

export type Put = (x: number, y: number, z: number, block: string, props?: Record<string, string>) => void;

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
  // Archetype-intrinsic facade. A church wants tall lights and a warehouse
  // wants almost none, and neither is something an author should have to spell
  // out: `archetypeFacadeDefaults` returns the tendency, and it fills holes
  // only — an explicit param always wins, which is what keeps the exhibit rows
  // and every existing document byte-identical where they *do* name one.
  const facade = archetypeFacadeDefaults(archetype);
  const roof = resolveRoof(params.roof ?? facade.roof);
  const rhythm = resolveRhythm(params.windowRhythm ?? facade.windowRhythm);
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
  const windowShape = resolveWindowShape(params.windowShape ?? facade.windowShape, choice, storyHeight);

  // The cellar is dug before the skirt is measured, because the two share the
  // same ground: a skirt sunk through a cellar would fill the room it stands in.
  const cellar =
    params.basement === undefined || params.basement <= 0
      ? 0
      : clamp(Math.round(params.basement), MIN_BASEMENT_DEPTH, MAX_BASEMENT_DEPTH);
  const foundationDepth = Math.max(Math.max(0, Math.round(request.foundationDepth ?? 1)), cellar + 1);

  const cells = new Map<string, LocalVoxelOp>();
  const put: Put = (x, y, z, block, props) => {
    cells.set(`${x},${y},${z}`, { x, y, z, block, ...(props === undefined ? {} : { props }) });
  };

  // The footprint. A wing carves the envelope; it never grows it, so `sx`/`sz`
  // stay the bounding box every downstream pass already agreed on.
  const fp = resolveFootprint(sx, sz, params.wing);
  const shell = traceShell(fp);
  const ringAt = outlineIndex(shell);
  const inFootprint = (x: number, z: number): boolean => footprintCovers(fp, x, z);

  const door = snapDoor(resolveDoor(request.door, sx, sz), shell);

  /**
   * Claim a wall cell as solid backing for something fixed to it.
   *
   * Ladders and wall torches both name the block behind them, and both are
   * placed *after* the window pass has already decided which cells of the wall
   * field are glass. Asking "is it solid?" is not enough — the answer is
   * whatever the window rhythm happened to say — so the two callers state it
   * instead: the cell becomes wall, and the fixture has the support the game
   * requires.
   *
   * The one cell that may not be overwritten is the doorway, which would seal
   * the building. `false` says so, and both callers have a fallback for it.
   */
  const backWall = (x: number, y: number, z: number): boolean => {
    if (door !== null && x === door.x && z === door.z && y >= 1 && y <= 3) return false;
    put(x, y, z, style["wall.primary"] as string);
    return true;
  };

  if (archetype === "watchtower") {
    return emitWatchtower({
      put,
      cells,
      style,
      grammar,
      choice,
      cellar,
      sx,
      sy,
      sz,
      foundationDepth,
      door,
      materials,
      footprint: { sx, sz, main: { x0: 0, z0: 0, x1: sx - 1, z1: sz - 1 }, wing: null },
      shell: fp.wing === null ? shell : traceShell(resolveFootprint(sx, sz)),
      params: { floors, storyHeight, roof, windowRhythm: rhythm, windowShape, archetype },
    });
  }

  const roofBase = wallTop + 1;

  const foundationAt = (x: number, y: number, z: number): string =>
    positionFloat(grammar, x, y, z) < FOUNDATION_ACCENT_SHARE
      ? (style["foundation.accent"] as string)
      : (style["foundation.primary"] as string);

  // --- foundation skirt ----------------------------------------------------
  // The cellar's band (`-1 .. -(cellar + 1)`) is skipped: `emitCellar` owns it,
  // and it emits its own floor slab where the skirt's deepest course would be.
  // The cellar is dug under the **main** rect only, so the skirt keeps its
  // courses everywhere else — including under a wing, which would otherwise be
  // left standing over the hole the cellar never dug.
  for (let d = 1; d <= foundationDepth; d++) {
    for (const cell of shell.cells) {
      if (cellar > 0 && d <= cellar + 1 && inRect(fp.main, cell.x, cell.z)) continue;
      put(cell.x, -d, cell.z, foundationAt(cell.x, -d, cell.z));
    }
  }

  // --- ground floor plane --------------------------------------------------
  const interior: LocalRect = {
    x0: fp.main.x0 + 1,
    z0: fp.main.z0 + 1,
    x1: fp.main.x1 - 1,
    z1: fp.main.z1 - 1,
  };
  const hasInterior = interior.x0 <= interior.x1 && interior.z0 <= interior.z1;
  const isFloor = new Set(shell.interiorCells.map((c) => `${c.x},${c.z}`));
  for (const cell of shell.cells) {
    const inside = isFloor.has(`${cell.x},${cell.z}`);
    put(cell.x, 0, cell.z, inside ? (style["floor.interior"] as string) : foundationAt(cell.x, 0, cell.z));
  }

  // --- walls ---------------------------------------------------------------
  // A timber frame, not a slab of planks: stripped-log posts at the corners, a
  // belt course of the same at every floor line and at the eave plate, a
  // masonry plinth at y = 1, and a sparse, position-keyed scatter of the accent
  // log through the field so the plank surface has grain without confetti.
  const ring = shell.ring;
  for (let y = 1; y <= wallTop; y++) {
    const belt = y === wallTop || y % storyHeight === 0;
    for (const cell of ring) {
      const corner = cell.corner;
      const alongX = cell.alongX;
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
      if (cell.corner) continue;
      if (door !== null && nearDoor(cell, door)) continue;
      const alongZ = !cell.alongX;
      const index = alongZ ? cell.z : cell.x;
      if (!rhythmHit(rhythm, index)) continue;
      const out = cell.outward;
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
        ringAt,
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
          // has to be a wall cell on the *same face* — never a corner post,
          // never past the end, and never round the elbow of an L, where the
          // shutter would have hung on the far side of a reflex corner.
          if (!sameFaceWall(ringAt, wx, wz, out)) continue;
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
  const cellarInterior = cellar > 0 && hasInterior ? interior : null;
  // The cellar ladder stands in the *south-east* interior corner, and the
  // inter-storey flight in the north-west one. That is not decoration: both
  // need a hole in the plane they pass through and a solid wall at their back,
  // and putting them in the same corner would have the flight's stairwell eat
  // the ladder's backing.
  const cellarAccess =
    cellarInterior === null ? null : { x: cellarInterior.x1, z: cellarInterior.z1 };
  const floorLevels: number[] = cellar > 0 ? [-(cellar + 1), 0] : [0];
  const stairRuns: number[] = [];
  /** Ground-floor columns the stair run occupies; furniture must keep off. */
  const stairColumns = new Set<string>();
  if (cellarAccess !== null) {
    stairColumns.add(`${cellarAccess.x},${cellarAccess.z}`);
    if (cellarAccess.x - 1 >= interior.x0) stairColumns.add(`${cellarAccess.x - 1},${cellarAccess.z}`);
    if (cellarAccess.z - 1 >= interior.z0) stairColumns.add(`${cellarAccess.x},${cellarAccess.z - 1}`);
  }
  for (let s = 1; s < floors; s++) {
    const level = s * storyHeight;
    floorLevels.push(level);
    if (!hasInterior) continue;
    // The stair run climbs +z along the west interior wall, from the floor
    // below (`base`) to this one.
    //
    // Two things about its geometry are load-bearing, and both were learned
    // from a player who could not get upstairs.
    //
    // First, the run is `storyHeight` steps long and its **top step sits in
    // the upper floor plane**, so the back tread of the last step is flush
    // with the floor it arrives on. An earlier version stopped one course
    // short, which made the final rise a full block — a jump.
    //
    // Second — and this is what survived that fix — the run starts at
    // `z0 + 1`, not at `z0`, and the cell at `z0` is left as an **approach**.
    // A bottom-half stair is only half-height on its front half; the back half
    // is a full block. With the bottom step hard against the north wall its
    // front face was buried in that wall, and the only way in was from the
    // side, where the gap between the wall and the step's raised half is half
    // a block — narrower than a player, who therefore met a full block and had
    // to jump. Standing the run one cell off the wall gives the flight an open
    // front face and turns the climb into a walk.
    const base = level - storyHeight;
    const runLength = storyHeight;
    // approach cell + run + landing, all inside the interior.
    const canStair = interior.z1 - interior.z0 >= runLength + 1;
    // The floor plane keeps a stairwell over the whole run — a well, not a
    // hatch: the top step lives in it and every step below has open sky over
    // it. When the footprint is too shallow for a flight, the hole is the one
    // cell the ladder comes up through.
    // The well spans the approach cell as well as the run. It has to: on a
    // three-high storey the ceiling over the approach is exactly two blocks up,
    // and a player who rises half a block to mount the first step puts their
    // head through it. A hole over the run alone is a hatch you can see the
    // stairs through and not climb.
    const holeZ0 = interior.z0;
    const holeZ1 = canStair ? interior.z0 + runLength : interior.z0;
    // Both rects: an upper storey over an L is a floor over the whole L.
    for (const cell of shell.interiorCells) {
      if (cell.x === interior.x0 && cell.z >= holeZ0 && cell.z <= holeZ1) continue;
      put(cell.x, level, cell.z, style["floor.interior"] as string);
    }
    stairRuns.push(base + 1);
    if (canStair) {
      for (let i = 0; i < runLength; i++) {
        put(interior.x0, base + 1 + i, interior.z0 + 1 + i, style["stair.interior"] as string, {
          facing: "south",
          half: "bottom",
          shape: "straight",
        });
        if (base === 0) stairColumns.add(`${interior.x0},${interior.z0 + 1 + i}`);
      }
      // The approach: the cell at the foot of the flight is floor, and stays
      // clear of furniture, because it is the only square you can mount from.
      // ...and so does the cell beside it, which is the only way *to* the
      // approach: a smithy put an anvil there and walled the flight off from
      // its own ground floor.
      if (base === 0) {
        stairColumns.add(`${interior.x0},${interior.z0}`);
        if (interior.x0 + 1 <= interior.x1) stairColumns.add(`${interior.x0 + 1},${interior.z0}`);
      }
      // A guard along the open edge of the well. West is the wall, north is the
      // wall, south is where the flight arrives — so the only exposed edge, and
      // the only one that needs a rail, is the east one.
      if (interior.x0 + 1 <= interior.x1) {
        for (let z = holeZ0; z <= holeZ1; z++) {
          put(interior.x0 + 1, level + 1, z, style["wall.fence"] as string);
        }
      }
    } else {
      // Too shallow for a flight: a ladder up the west wall instead. `facing`
      // east means the ladder's back is fixed to the cell at `x - 1`, which is
      // the west wall. It runs one course *past* the floor plane so a climber
      // can step off onto it rather than into it.
      //
      // That wall is **not** reliably solid, which is what the dev world's
      // `bp_stairs_ladder` breakpoint exhibit found: the window pass punches
      // openings through the same wall field, and a window behind a ladder
      // leaves its rungs fixed to glass — an `unsupported.ladder` finding, and
      // in game a ladder that pops off the wall. So the backing is claimed
      // first. A blank wall behind a ladder is architecture, not a patch.
      for (let y = base + 1; y <= level + 1; y++) {
        backWall(interior.x0 - 1, y, interior.z0);
        put(interior.x0, y, interior.z0, "ladder", { facing: "east" });
      }
      // ...and so does the cell beside it, which is the only way *to* the
      // approach: a smithy put an anvil there and walled the flight off from
      // its own ground floor.
      if (base === 0) {
        stairColumns.add(`${interior.x0},${interior.z0}`);
        if (interior.x0 + 1 <= interior.x1) stairColumns.add(`${interior.x0 + 1},${interior.z0}`);
      }
    }
  }
  // A ceiling over the top storey. Without it the roof reads as a hat balanced
  // on an open box from inside, and — the reason it is not optional — a hanging
  // lantern on the top floor has nothing to hang from.
  if (hasInterior) {
    for (const cell of shell.interiorCells) {
      put(cell.x, wallTop, cell.z, style["floor.interior"] as string);
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
    // A hanging lantern is a body-blocking cell at head height. In a room two
    // or more cells across you walk around it; in a room one cell across there
    // is nothing to walk around it into, and the lantern cuts the room in two.
    // The dev world's `bp_wing_main_min` breakpoint exhibit — a wing that takes
    // the envelope down to MIN_MAIN_DEPTH, leaving the main block a single
    // course of floor — is where that showed up, as a `traversal.unreachable`
    // finding covering everything past the light. A wall torch lights the same
    // room without standing in it: vanilla lets a player walk through one.
    const narrowX = interior.x0 === interior.x1;
    const narrowZ = interior.z0 === interior.z1;
    for (let s = 0; s < floors; s++) {
      const y = (s + 1) * storyHeight - 1;
      const bracket = narrowX
        ? { x: interior.x0, z: cz, bx: interior.x0 - 1, bz: cz, facing: "east" as const }
        : { x: cx, z: interior.z0, bx: cx, bz: interior.z0 - 1, facing: "south" as const };
      if ((narrowX || narrowZ) && backWall(bracket.bx, y, bracket.bz)) {
        put(bracket.x, y, bracket.z, "wall_torch", { facing: bracket.facing });
      } else {
        put(cx, y, cz, style["light.lantern"] as string, { hanging: "true" });
      }
      lanternCount++;
    }
    // A wing is a room of its own, far enough from the main block's lantern to
    // go dark — and a dark room with a floor is a mob farm with a roof.
    if (fp.wing !== null) {
      const wingFloor = shell.interiorCells.filter((c) => !inRect(fp.main, c.x, c.z));
      const mid = wingFloor[wingFloor.length >> 1];
      if (mid !== undefined) {
        for (let s = 0; s < floors; s++) {
          put(mid.x, (s + 1) * storyHeight - 1, mid.z, style["light.lantern"] as string, {
            hanging: "true",
          });
          lanternCount++;
        }
      }
    }
  }

  // --- roof ----------------------------------------------------------------
  // The main block keeps its roof exactly as it was — same shape, same layer
  // count, same code, over its own rect. The wing gets a gable of its own from
  // the same function, and every op of it that lands over the main block is
  // clipped: the main roof was there first, and the seam where the wing's slope
  // dies into the main wall is the valley. A real valley is a mitred gutter;
  // this is the v0 of it, and it is watertight because the main roof already
  // covers every cell the clip removes.
  let roofTop = emitRoof(put, style, roof, roofLayers, roofBase, fp.main, wallTop, grammar);
  if (fp.wing !== null) {
    const wing = fp.wing;
    const wingSpan = minor(wing.x1 - wing.x0 + 1, wing.z1 - wing.z0 + 1);
    const wingLayers = clamp(
      minor(Math.ceil(wingSpan / 2), Math.max(2, Math.round(wallTop * ROOF_PITCH_SHARE))),
      2,
      MAX_ROOF_LAYERS,
    );
    const clipped: Put = (x, y, z, block, props) => {
      if (inRect(fp.main, x, z)) return;
      put(x, y, z, block, props);
    };
    const wingTop = emitRoof(
      clipped,
      style,
      roof === "flat" ? "flat" : "gable",
      wingLayers,
      roofBase,
      wing,
      wallTop,
      grammar,
    );
    if (wingTop > roofTop) roofTop = wingTop;
  }
  apronOps += emitEave(put, style, roofBase, shell);

  // --- chimney -------------------------------------------------------------
  let chimney = false;
  /** Interior cells the chimney reserves; furniture never lands in them. */
  const hearthColumns = new Set<string>();
  if (hasInterior && floors === 1 && archetype !== "granary" && sx >= 5 && sz >= 5) {
    const hearth = emitChimney(put, style, interior, door, roofTop, fp.main, inFootprint);
    chimney = hearth !== null;
    // The cell in front of the fire, and the two beside it: a bed or a table
    // pushed up against a hearth is the defect this reserve exists to stop.
    if (hearth !== null) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > 1) continue;
          hearthColumns.add(`${hearth.x + dx},${hearth.z + dz}`);
        }
      }
    }
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
        hearthColumns,
        // The geometry the fit-out used to *probe* for. A steeple and a set of
        // sails are both sized off the roof, and the fit-out reconstructed
        // `roofTop` by scanning every cell above the eave because nothing
        // handed it over. It is right here, so it is handed over.
        size: [sx, sy, sz],
        wallTop,
        roofTop,
        // The floor across both rects, so a wing is part of the room the
        // walkability guard reasons about rather than a place furniture can
        // silently strand.
        floorCells: shell.interiorCells,
        blockAt: (x, y, z) => cells.get(`${x},${y},${z}`),
      })
    : 0;
  if (door !== null) apronOps += emitPorchLamp(put, style, door, sx, sz);

  // --- the cellar ----------------------------------------------------------
  // Last, deliberately: it punches a hole through the ground-floor plane and
  // runs a ladder up through it, and every earlier stage may have written into
  // the columns it needs. Emitting it here makes "the way down wins" a property
  // of the order rather than of nine `if`s in the stages above.
  let cellarLanterns = 0;
  if (cellarInterior !== null && cellarAccess !== null) {
    cellarLanterns = emitCellar({
      put,
      style,
      grammar,
      choice,
      rect: fp.main,
      depth: cellar,
      interior: cellarInterior,
      access: cellarAccess,
    });
  }

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
      footprint: fp,
      cells: shell.cells,
      floorCells: shell.interiorCells,
      floorLevels,
      stairRuns,
      basementDepth: cellarInterior === null ? 0 : cellar,
      basementInterior: cellarInterior,
      basementAccess: cellarAccess,
      windowCount,
      lanternCount: lanternCount + cellarLanterns,
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

/**
 * True when `(x, z)` is a wall cell of the face whose outward normal is `out`.
 *
 * The facade's neighbour question, asked once. On a rect it is exactly the old
 * `along > 0 && along < span - 1` bound check: the cells that pass are the
 * non-corner ring cells of the same face, which on a rect is the same set.
 */
function sameFaceWall(
  ringAt: ReadonlyMap<string, OutlineCell>,
  x: number,
  z: number,
  out: Cardinal,
): boolean {
  const cell = ringAt.get(`${x},${z}`);
  return cell !== undefined && !cell.corner && cell.outward === out;
}

/**
 * Move a resolved door onto a wall cell that exists.
 *
 * On a rect this is a no-op — `resolveDoor` already lands on a non-corner cell
 * of the named face — and it is written so that it provably is: the snap only
 * runs when the resolved column is not already a wall cell of that face. On an
 * L it matters, because the face the port names may be half missing, and a door
 * resolved into the notch is a door into thin air.
 */
function snapDoor(
  door: { x: number; z: number; face: Cardinal } | null,
  shell: Shell,
): { x: number; z: number; face: Cardinal } | null {
  if (door === null) return null;
  const ringAt = outlineIndex(shell);
  if (sameFaceWall(ringAt, door.x, door.z, door.face)) return door;
  let best: OutlineCell | null = null;
  let bestCost = Infinity;
  for (const cell of shell.ring) {
    if (cell.corner || cell.outward !== door.face) continue;
    const cost = Math.abs(cell.x - door.x) + Math.abs(cell.z - door.z);
    if (cost < bestCost) {
      best = cell;
      bestCost = cost;
    }
  }
  if (best === null) return null;
  return { x: best.x, z: best.z, face: door.face };
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
  readonly ringAt: ReadonlyMap<string, OutlineCell>;
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
    const clash = r.door !== null && Math.abs(nx - r.door.x) + Math.abs(nz - r.door.z) <= 1;
    if (sameFaceWall(r.ringAt, nx, nz, r.outward) && !clash) {
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
  shell: Shell,
): number {
  const stairs = style["roof.stairs"] as string;
  const taken = new Set<string>();
  let n = 0;
  const place = (x: number, z: number, block: string, props: Record<string, string>): void => {
    const key = `${x},${z}`;
    if (taken.has(key)) return;
    taken.add(key);
    put(x, roofBase, z, block, props);
    n++;
  };
  // One stair per blocked side of every outline cell, laid in the apron cell
  // that side points at, facing back at the wall it overhangs. On a rect that
  // is the same set of ops the four edge loops used to emit, cell for cell.
  for (const cell of shell.ring) {
    for (const dir of cell.blocked) {
      const [dx, dz] = cardinalStep(dir);
      place(cell.x + dx, cell.z + dz, stairs, {
        facing: opposite(dir),
        half: "top",
        shape: "straight",
      });
    }
  }
  // The diagonal outside every convex corner, so the course closes rather than
  // leaving nicks. A reflex corner has no blocked side and therefore no
  // diagonal to close — the two runs meeting there are already continuous.
  for (const cell of shell.ring) {
    for (const dz of cell.blocked.filter((d) => d === "north" || d === "south")) {
      for (const dx of cell.blocked.filter((d) => d === "west" || d === "east")) {
        const [, sz1] = cardinalStep(dz);
        const [sx1] = cardinalStep(dx);
        place(cell.x + sx1, cell.z + sz1, style["roof.slab"] as string, { type: "top" });
      }
    }
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
  rect: LocalRect,
  wallTop: number,
  grammar: Seed256,
): number {
  const stairs = style["roof.stairs"] as string;
  const solid = style["roof.solid"] as string;
  const slab = style["roof.slab"] as string;
  const { x0: rx0, x1: rx1, z0: rz0, z1: rz1 } = rect;

  if (roof === "flat") {
    for (let z = rz0; z <= rz1; z++) for (let x = rx0; x <= rx1; x++) put(x, base, z, solid);
    return base;
  }

  if (roof === "hip") {
    for (let k = 0; k < layers; k++) {
      const y = base + k;
      const x0 = rx0 + k;
      const x1 = rx1 - k;
      const z0 = rz0 + k;
      const z1 = rz1 - k;
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
    const capped = capRect(put, solid, capY, rx0 + layers, rx1 - layers, rz0 + layers, rz1 - layers);
    if (capped !== null) {
      ridgeCap(put, slab, capY + 1, rx0 + layers, rx1 - layers, rz0 + layers, rz1 - layers);
    }
    return capped === null ? base + layers - 1 : capped + 1;
  }

  // gable — the ridge runs along the longer axis.
  const ridgeAlongX = rx1 - rx0 >= rz1 - rz0;
  for (let k = 0; k < layers; k++) {
    const y = base + k;
    if (ridgeAlongX) {
      const near = rz0 + k;
      const far = rz1 - k;
      if (near > far) break;
      for (let x = rx0; x <= rx1; x++) {
        put(x, y, near, stairs, { facing: "south", half: "bottom", shape: "straight" });
        if (far !== near) put(x, y, far, stairs, { facing: "north", half: "bottom", shape: "straight" });
      }
    } else {
      const near = rx0 + k;
      const far = rx1 - k;
      if (near > far) break;
      for (let z = rz0; z <= rz1; z++) {
        put(near, y, z, stairs, { facing: "east", half: "bottom", shape: "straight" });
        if (far !== near) put(far, y, z, stairs, { facing: "west", half: "bottom", shape: "straight" });
      }
    }
  }
  const capY = base + layers;
  const capped = ridgeAlongX
    ? capRect(put, solid, capY, rx0, rx1, rz0 + layers, rz1 - layers)
    : capRect(put, solid, capY, rx0 + layers, rx1 - layers, rz0, rz1);
  // The gable ends: fill the triangle under the slope with wall, then trace the
  // rake itself in frame logs so the end reads as a framed gable, not a wedge.
  fillGableEnds(put, style, ridgeAlongX, layers, base, rect, grammar);
  const top = capped ?? base + layers - 1;
  if (capped !== null) {
    if (ridgeAlongX) ridgeCap(put, slab, capY + 1, rx0, rx1, rz0 + layers, rz1 - layers);
    else ridgeCap(put, slab, capY + 1, rx0 + layers, rx1 - layers, rz0, rz1);
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
  rect: LocalRect,
  grammar: Seed256,
): void {
  const wall = style["wall.primary"] as string;
  const frame = style["wall.frame"] as string;
  const accent = style["wall.accent"] as string;
  const ends = ridgeAlongX ? [rect.x0, rect.x1] : [rect.z0, rect.z1];
  const lo = ridgeAlongX ? rect.z0 : rect.x0;
  const hi = ridgeAlongX ? rect.z1 : rect.x1;

  for (const end of ends) {
    for (let k = 0; k < layers; k++) {
      const near = lo + k;
      const far = hi - k;
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
 * A cobblestone chimney: a flue **in the wall**, a hearth opening on its inside
 * face, and a corbelled head with a fire in it above the ridge.
 *
 * The shaft used to stand on an interior column, and it was as bad as that
 * sounds: a walkthrough found a full cobblestone pillar running floor to
 * ceiling through the middle of a smithy — with the cauldron the furnisher had
 * already put in that cell left sitting in its base like a hearth nobody
 * ordered — and, in a cottage, three courses of cobblestone directly over a
 * bed. A flue is a piece of *wall*. It belongs in the wall plane, flush with
 * it, replacing the wall blocks it passes; the room keeps its whole floor and
 * the fireplace is a feature of the wall face rather than an obstacle in the
 * middle of the room.
 *
 * The head's corbel and rim are clipped to the footprint, so a chimney in a
 * wall still never puts structure in the apron.
 *
 * Returns the interior cell in front of the hearth, which the fit-out must
 * leave clear, or `null` when no chimney was built.
 */
function emitChimney(
  put: Put,
  style: Readonly<Record<string, string>>,
  interior: LocalRect,
  door: { x: number; z: number; face: Cardinal } | null,
  roofTop: number,
  rect: LocalRect,
  inFootprint: (x: number, z: number) => boolean,
): { x: number; z: number } | null {
  const block = style["chimney.block"] as string;
  const rim = style["chimney.rim"] as string;
  // The wall opposite the door, so the flue never fights the entrance for the
  // same face, and the mid-point of that wall so it never lands on a corner
  // post.
  const face: Cardinal = door === null ? "north" : opposite(door.face);
  const alongX = face === "north" || face === "south";
  const lo = alongX ? rect.x0 : rect.z0;
  const hi = alongX ? rect.x1 : rect.z1;
  const span = hi - lo + 1;
  if (span < 3) return null;
  const mid = lo + clamp(Math.floor((span - 1) / 2), 1, span - 2);
  const cx = alongX ? mid : face === "west" ? rect.x0 : rect.x1;
  const cz = alongX ? (face === "north" ? rect.z0 : rect.z1) : mid;
  // The interior cell the hearth opens onto: one step *inward* from the wall.
  const [ox, oz] = cardinalStep(opposite(face));
  const hearth = { x: cx + ox, z: cz + oz };
  if (
    hearth.x < interior.x0 ||
    hearth.x > interior.x1 ||
    hearth.z < interior.z0 ||
    hearth.z > interior.z1
  ) {
    return null;
  }

  // A flue is a piece of wall, so the column it takes has to *be* wall. On an L
  // whose wing hangs off the face opposite the door, the main block's wall line
  // there is the opening between the two rooms — and a flue standing in it
  // would be a cobblestone pillar in the doorway.
  let enclosed = true;
  for (let dz = -1; dz <= 1 && enclosed; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!inFootprint(cx + dx, cz + dz)) {
        enclosed = false;
        break;
      }
    }
  }
  if (enclosed) return null;

  const corbelY = roofTop + 1;
  for (let y = 0; y <= corbelY - 1; y++) put(cx, y, cz, block);
  // The fireplace: an opening in the wall face at floor level, standing on the
  // course below it, with the flue it vents into directly above.
  put(cx, 1, cz, "campfire", {
    lit: "true",
    facing: opposite(face),
    signal_fire: "false",
    waterlogged: "false",
  });
  const inside = inFootprint;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (inside(cx + dx, cz + dz)) put(cx + dx, corbelY, cz + dz, block);
    }
  }
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      if (inside(cx + dx, cz + dz)) put(cx + dx, corbelY + 1, cz + dz, rim, { up: "true", waterlogged: "false" });
    }
  }
  put(cx, corbelY + 1, cz, "campfire", { lit: "true", facing: "north", signal_fire: "false", waterlogged: "false" });
  return hearth;
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
/* the watchtower                                                              */
/* -------------------------------------------------------------------------- */

interface TowerRequest {
  readonly put: Put;
  readonly cells: Map<string, LocalVoxelOp>;
  readonly style: Readonly<Record<string, string>>;
  readonly grammar: Seed256;
  /** The fit-out's stream — the cellar's crates and cobwebs are drawn from it. */
  readonly choice: Seed256;
  /** Cellar headroom, already clamped; 0 for none. */
  readonly cellar: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly foundationDepth: number;
  readonly door: { x: number; z: number; face: Cardinal } | null;
  readonly materials: BuildingMaterials;
  readonly params: ResolvedBuildingParams;
  /**
   * The footprint, which for a tower is always the bare rect: a shaft with an
   * ell on it is a different building, not this one, and the set-back/corbel
   * geometry below is written in terms of one box.
   */
  readonly footprint: Footprint;
  readonly shell: Shell;
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

  // --- the cellar ----------------------------------------------------------
  // Last, like the house's: it punches through the base floor plane the tower
  // laid at `y = 0`, and the way down has to win against everything above.
  //
  // The tower's cellar is the shaft's own room, one storey further down, and it
  // is reached by the ladder that is already there rather than by a second one
  // in a corner: the rungs and the pilaster they are fixed to simply carry on
  // through the floor. That is the "laddered vertical shaft" the archetype has
  // always described — it just used to stop at the ground.
  const cellarInterior: LocalRect | null =
    r.cellar > 0 && shaft.x1 >= shaft.x0 && shaft.z1 >= shaft.z0 + 1 ? shaft : null;
  const cellarAccess = cellarInterior === null ? null : { x: lx, z: lz };
  if (cellarInterior !== null && cellarAccess !== null) {
    lanternCount += emitCellar({
      put,
      style,
      grammar,
      choice: r.choice,
      rect: { x0: 0, z0: 0, x1: sx - 1, z1: sz - 1 },
      depth: r.cellar,
      interior: cellarInterior,
      access: cellarAccess,
      // The rungs keep the facing they have above ground, so the ladder is one
      // continuous run from the cellar floor to the parapet.
      ladderFacing,
      // …and the wall they are fixed to keeps going too. The backing column
      // stands *inside* the cellar room, so it has to be stated: without it the
      // room's air would leave four courses of ladder attached to nothing.
      pilaster: { x: lx, z: ladderBackZ },
    });
  }

  const roofTop = platformY + 2;
  return {
    ops: sortOps([...cells.values()]),
    meta: {
      params: r.params,
      size: [sx, sy, sz],
      footprint: r.footprint,
      cells: r.shell.cells,
      floorCells: r.shell.interiorCells,
      wallTop: platformY,
      roofBase: platformY,
      roofTop,
      height: roofTop + 1,
      foundationDepth: r.foundationDepth,
      door,
      interior: shaft,
      floorLevels: cellarInterior === null ? [0, platformY] : [-(r.cellar + 1), 0, platformY],
      stairRuns: [1],
      basementDepth: cellarInterior === null ? 0 : r.cellar,
      basementInterior: cellarInterior,
      basementAccess: cellarAccess,
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
/* the cellar                                                                  */
/* -------------------------------------------------------------------------- */

interface CellarRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly grammar: Seed256;
  readonly choice: Seed256;
  /** The rect the cellar is dug under — the main block, never the wing. */
  readonly rect: LocalRect;
  /** Headroom, in blocks: the room spans `-depth .. -1`. */
  readonly depth: number;
  readonly interior: LocalRect;
  readonly access: { readonly x: number; readonly z: number };
  /**
   * Which way the ladder's rungs face — i.e. which neighbouring cell is the
   * wall behind them. `west` (the default) is the house's south-east corner
   * ladder; the watchtower hands in `south`, because its ladder is the one that
   * already runs up the shaft and it keeps its backing.
   */
  readonly ladderFacing?: Cardinal;
  /**
   * A column *inside* the room that stays masonry at every course.
   *
   * The house's ladder is fixed to the cellar's own perimeter wall and needs
   * nothing extra. The watchtower's stands one cell off the wall, so the cell
   * behind it falls inside the room: this is that cell, and it is built as a
   * pilaster rather than left as air. The fit-out is told about it too, so no
   * crate is drawn into a column that is about to become stone.
   */
  readonly pilaster?: { readonly x: number; readonly z: number } | null;
}

/**
 * Dig a cellar under the footprint and give it a way in.
 *
 * The geometry, and why each piece is the shape it is:
 *
 * - **The room** spans `y = -depth … -1`. Its ceiling is the ground-floor
 *   plane the building already laid at `y = 0`, which is what a hanging lantern
 *   down here hangs from — so the cellar needs no ceiling of its own, and gets
 *   none.
 * - **The floor slab** at `-(depth + 1)` is masonry across the whole footprint,
 *   because the walls stand on it and the skirt above stops at the room.
 * - **The walls** are the footprint perimeter, stone brick with a
 *   position-keyed share of it cracked. Perimeter, not interior-plus-one: the
 *   cellar is exactly as wide as the building, so a tunnel arriving at the
 *   outside of that wall is arriving at the outside of the building.
 * - **The ladder** runs from the cellar floor up *past* the ground-floor plane
 *   to `y = +1`, in the south-east interior corner, facing west so its back is
 *   fixed to the east wall — solid at every course it passes. Running one
 *   block past the plane is what lets a player step onto it rather than into
 *   it, and the plane's cell in that column is the ladder, not floor: the hole
 *   and the way through it are the same block.
 *
 * Returns the number of lanterns hung, for the meta count.
 */
function emitCellar(r: CellarRequest): number {
  const { put, style, grammar, choice, rect, depth, interior, access } = r;
  const pilaster = r.pilaster ?? null;
  const isPilaster = (x: number, z: number): boolean =>
    pilaster !== null && x === pilaster.x && z === pilaster.z;
  const masonry = (x: number, y: number, z: number): string =>
    positionFloat(grammar, x, y, z) < CELLAR_CRACK_SHARE
      ? (style["cellar.wall_cracked"] as string)
      : (style["cellar.wall"] as string);

  // --- the floor slab ------------------------------------------------------
  const slabY = -(depth + 1);
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) put(x, slabY, z, masonry(x, slabY, z));
  }

  // --- the room ------------------------------------------------------------
  for (let d = 1; d <= depth; d++) {
    const y = -d;
    for (let z = rect.z0; z <= rect.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const inside =
          x >= interior.x0 &&
          x <= interior.x1 &&
          z >= interior.z0 &&
          z <= interior.z1 &&
          !isPilaster(x, z);
        put(x, y, z, inside ? "air" : masonry(x, y, z));
      }
    }
  }

  // --- the ladder ----------------------------------------------------------
  // `facing: "west"` fixes the rungs to the cell at `x + 1`: the east wall,
  // which is masonry below the plane and timber above it, and solid at every
  // course in between.
  const facing = r.ladderFacing ?? "west";
  for (let y = -depth; y <= 1; y++) put(access.x, y, access.z, "ladder", { facing });

  // --- light ---------------------------------------------------------------
  // One lantern, hung from the ground-floor plane at the room's centre. It is
  // the only light down here, so it is placed rather than drawn: a cellar that
  // came up dark by chance would be a mob farm under someone's kitchen.
  const cx = Math.floor((interior.x0 + interior.x1) / 2);
  // A narrow room can put the centre on the ladder or on its pilaster, and a
  // lantern there is a lantern inside the way out. One cell along the z axis is
  // enough to clear both, and it is the axis the room is never one deep on.
  let cz = Math.floor((interior.z0 + interior.z1) / 2);
  const blocked = (z: number): boolean =>
    (cx === access.x && z === access.z) || isPilaster(cx, z);
  if (blocked(cz)) cz = cz + 1 <= interior.z1 && !blocked(cz + 1) ? cz + 1 : cz - 1;
  put(cx, -1, cz, style["light.lantern"] as string, { hanging: "true" });

  furnishCellar(
    put,
    style,
    choice,
    interior,
    access,
    { x: cx, z: cz },
    -depth,
    pilaster === null ? undefined : new Set([`${pilaster.x},${pilaster.z}`]),
  );
  return 1;
}

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
 * v0.2 §7 `footprint`: partly — `rect`, and `l_shape`/`t_shape` through the
 *   `wing` param (one extra rect, unioned, sharing one wall line). The wing's
 *   roof is a gable clipped out of the main volume rather than a mitred valley,
 *   the fit-out still furnishes the main rect only, and the cellar is dug under
 *   the main rect only. `u_shape`, `cross`, `courtyard` and `irregular` need
 *   more than one wing and are not built.
 * v0.2 §7: not yet — `bays` (facade module count; windows use `windowRhythm`).
 * v0.2 §7: not yet — `roofPitch` (pitch is fixed at one layer per row).
 * v0.2 §7: not yet — `windowRatio` (glazed fraction is implied by the rhythm).
 * v0.2 §7: not yet — `basement`, and with it the `tunnel_stub` port.
 * v0.2 §7: not yet — `tower`, `variance`, `decayOverride`.
 * v0.2 §7: not yet — the `gate`/`arch`/`window`/`stair_top`/`stair_bottom`
 *   ports, and the `entrance`/`ridge`/`interior_center` markers.
 */


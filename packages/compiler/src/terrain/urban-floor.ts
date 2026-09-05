/**
 * The urban floor — packed earth between the buildings of a **walled** town.
 *
 * Kai's walk of Troy (candidate 4, 2026-08-11): *"the city interior still looks
 * more green than I'd expect"*. He was right, and the cause is structural
 * rather than a missing pass: every surface a settlement lays is laid by
 * *something* — a road, a lot treatment, a plaza, a doorstep — and the ground
 * between those things is whatever the terrain put there, which on a temperate
 * heightfield is a lawn. A dense ancient city floored in lawn reads as a model
 * village on a golf course; a dense ancient city floored in trodden earth reads
 * as a city.
 *
 * ## What it does
 *
 * Inside a settlement's **wall circuit**, a column that is
 *
 * - still bare turf (nothing built, paved or dressed it — see
 *   {@link turfStates}), and
 * - not planted, and not within a modest halo of anything planted,
 *
 * takes a theme-derived packed-earth tone instead: trodden path, graded earth,
 * grit, and the odd flag of the town's own dressed stone.
 *
 * ## The three rules it obeys
 *
 * 1. **The gate is the circuit.** No wall, no change — a world that never rings
 *    itself compiles byte-identically, which is what makes this shippable
 *    beside every pastoral world already walked. Density-driven application to
 *    unwalled dense cities is deliberately out of scope: one gate, one walk.
 * 2. **Green survives as gardens, not as lawn.** The hard-won lesson of the
 *    town green (`test/town-green.test.ts`: 74% of the occupancy union was
 *    *natural ground*, and suppressing plants there sterilized the town) points
 *    the same way from the other side. This pass never removes a plant and
 *    never converts the column one stands on — every plant keeps its soil. A
 *    *planting* — a flower, a bush, a sapling, a crop, a tree — additionally
 *    keeps a {@link PLANT_HALO} border of grass, so a cottage garden and a
 *    street tree read as deliberate green. An ambient tuft keeps its own column
 *    and no border: the town green speckles a settlement's whole unbuilt ground
 *    with tufts, and a border round each of them left 74% of Troy's interior
 *    still lawn — the walk would have seen no change at all. Measured on Troy
 *    c4 (2026-08-11): tufts bordered, 4,949 columns converted and 13,898 kept;
 *    tufts bare, **15,198 converted and 2,537 kept**, out of 17,735 columns of
 *    unbuilt interior.
 * 3. **Material, not level.** : the `GroundDriver`
 *    governs where the ground *is*; a surface write says what it is *made of*.
 *    This pass writes `plan.surface` and nothing else — not `ground`, not
 *    `fluidTop`, not `snow` — so it cannot fight the driver and cannot move a
 *    single column of anybody's finished level.
 *
 * It runs after the scatter and the decoration pass and before biome painting,
 * because "is anything planted here" is only a fact once the plants exist.
 */

import type { MaterialTheme } from "@terrainist/stdlib";

import type { PrismarineStack } from "../emit/prismarine.js";

import { FluidKind, type ColumnPlan } from "./columns.js";
import { hash2 } from "./detail.js";
import { groundMaterials, type Palette } from "./palette.js";

/* -------------------------------------------------------------------------- */
/* tunables — Kai dials these after a walk                                     */
/* -------------------------------------------------------------------------- */

/**
 * How far a *planting's* grass border reaches, in columns (Chebyshev).
 *
 * One, and deliberately: at two the border was wider than the gaps between the
 * plantings and the whole interior stayed green. Kai dials this after a walk.
 */
export const PLANT_HALO = 1;

/**
 * How far a tree's grass border reaches, in columns.
 *
 * Wider than {@link PLANT_HALO} because a trunk is one column and a canopy is
 * five or seven: earth painted right up to the bole under a full crown reads as
 * a felled tree standing in a car park.
 */
export const TREE_HALO = 2;

/* -------------------------------------------------------------------------- */
/* the mix                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The four tones of an urban floor, as block states.
 *
 * Every one is *derived* from the settlement's own theme rather than chosen by
 * a per-theme table in this file — `terrain/palette.ts` already answers "what
 * is this town's ground made of, by role" for every shipped theme and derives
 * an answer for every theme nobody has walked, and a second table here would be
 * the same fact written twice and drifting.
 */
export interface FloorTones {
  /** Trodden earth — the surface feet make. `road.surface`, i.e. `dirt_path`. */
  readonly trodden: number;
  /** Graded earth — the theme's `bank` role (coarse dirt, podzol in the north). */
  readonly earth: number;
  /** Loose grit — the theme's `scree` role. */
  readonly grit: number;
  /** A flag of the town's own dressed stone — the theme's `tread` role. */
  readonly flag: number;
}

/** Resolve the four tones for a theme. */
export function floorTones(
  theme: MaterialTheme | undefined,
  palette: Palette,
  stack: PrismarineStack,
): FloorTones {
  const named = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const symbol = (s: string, fallback: string): number =>
    palette.has(s) ? palette.state(s) : named(fallback);
  const roles = groundMaterials(theme);
  return {
    trodden: symbol("road.surface", "minecraft:dirt_path"),
    earth: named(roles.bank),
    grit: named(roles.scree),
    flag: named(roles.tread),
  };
}

/**
 * The mix, as cumulative thresholds over `[0, 1)`: trodden, earth, grit, flag.
 *
 * Two mixes, and the dry one is chosen by the theme's own
 * {@link MaterialTheme.aridAmbient} declaration rather than by its id: a dry
 * town's courtyards are pale — dust and stone with the odd dark patch — and a
 * wet one's are dark, because trodden earth in a rainy country is mud. The same
 * flag biases the ambient biome family (`terrain/biomes.ts`), so a theme joins
 * both halves of the look by declaring one thing about itself.
 */
export const FLOOR_MIX_TEMPERATE = Object.freeze([0.38, 0.7, 0.88, 1]);
/** @see FLOOR_MIX_TEMPERATE */
export const FLOOR_MIX_ARID = Object.freeze([0.2, 0.48, 0.7, 1]);

/** The tone one column takes. */
export function floorStateAt(
  tones: FloorTones,
  arid: boolean,
  snowy: boolean,
  seed: number,
  x: number,
  z: number,
): number {
  const mix = arid ? FLOOR_MIX_ARID : FLOOR_MIX_TEMPERATE;
  const r = hash2(seed, x, z, 41);
  // A snow layer reverts `dirt_path` to `dirt` the moment the world loads, so a
  // snowed column takes the graded earth instead of the trodden path. This pass
  // never clears the snow: whether a walled town sweeps its courtyards is a
  // question for a walk, and answering it here would move ground nobody asked
  // about.
  if (r < (mix[0] as number)) return snowy ? tones.earth : tones.trodden;
  if (r < (mix[1] as number)) return tones.earth;
  if (r < (mix[2] as number)) return tones.grit;
  return tones.flag;
}

/* -------------------------------------------------------------------------- */
/* what counts as bare turf                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Surface states this pass is willing to convert: **grass, and only grass**.
 *
 * A whitelist rather than a list of things to avoid, for the reason
 * `decorate.ts`'s `NATURAL_SURFACE_SYMBOLS` is one: every pass that dresses the
 * ground writes its answer straight into `plan.surface`, so "the surface is
 * still grass" *is* the test for "nobody has dressed this column" — and the
 * next material the fabric learns to lay is excluded by default rather than
 * included by omission. Podzol, mud, sand, gravel and every paving stone are
 * somebody's decision already.
 */
export function turfStates(palette: Palette, stack: PrismarineStack): ReadonlySet<number> {
  const turf = new Set<number>();
  const grass = stack.blockByName("minecraft:grass_block")?.stateId;
  if (grass !== undefined) turf.add(grass);
  if (palette.has("ground.surface")) {
    const entry = palette.entry("ground.surface");
    if (entry.kind === "single") turf.add(entry.stateId);
    else for (const id of entry.stateIds) turf.add(id);
  }
  return turf;
}

/**
 * Block names that count as a plant standing on the ground.
 *
 * Read off the block *name* rather than off a list of state ids because the
 * columns being tested were planted by four different passes (the scatter, the
 * decoration pass, the lot treatments and the life pass), each resolving its
 * own symbols, and a name is the one thing they all agree on.
 *
 * **Wood is deliberately absent.** A log is a tree to a botanist and a wall to
 * this pass: half the shipped themes frame their houses in logs and floor them
 * in planks, and a `log$` in this list would let every timber cottage in a
 * walled village green two columns of street on each side of itself. Standing
 * trees arrive through {@link UrbanFloorInput.trees} instead, where they are
 * unambiguous.
 */
const PLANT_NAME = new RegExp(
  "^(" +
    [
      // tufts and ferns
      "short_grass",
      "tall_grass",
      "grass",
      "fern",
      "large_fern",
      // flowers, including every `_tulip` and anything with `flower` in its name
      ".*flower.*",
      "poppy",
      "dandelion",
      "blue_orchid",
      "allium",
      "azure_bluet",
      ".*_tulip",
      "oxeye_daisy",
      "lily_of_the_valley",
      "wither_rose",
      "rose_bush",
      "peony",
      "lilac",
      "sunflower",
      "pink_petals",
      // bushes, saplings, and the rest of the growing things
      ".*_sapling",
      ".*_bush",
      "sweet_berry_bush",
      "azalea",
      "flowering_azalea",
      "moss_carpet",
      "sugar_cane",
      "bamboo",
      "cactus",
      "vine",
      "lily_pad",
      "red_mushroom",
      "brown_mushroom",
      // a tended plot is as deliberate as a flower bed
      "wheat",
      "carrots",
      "potatoes",
      "beetroots",
      "melon_stem",
      "pumpkin_stem",
    ].join("|") +
    ")$",
);

/**
 * The plants that are **ambient rather than deliberate**: a tuft of grass, a
 * fern, a dead bush.
 *
 * The distinction earns its place in the measurement. On Troy the town green
 * speckles the settlement's whole unbuilt ground with tufts at half the ambient
 * density, so a border drawn round every plant kept three quarters of the
 * interior green and the walk would have seen no change at all. A tuft keeps
 * the column it stands on — it is still a plant and it still needs its soil —
 * and lends no border; a flower, a bush, a sapling or a crop is somebody's
 * garden and lends {@link PLANT_HALO}.
 */
const TUFT_NAME = /^(short_grass|tall_grass|grass|fern|large_fern|dead_bush)$/;

/** True when the block at a column's standing height is a plant. */
export function isPlantBlock(stack: PrismarineStack, stateId: number): boolean {
  const name = stack.blockNameByStateId(stateId);
  if (name === undefined) return false;
  return PLANT_NAME.test(name.replace(/^minecraft:/, ""));
}

/** True when that plant is an ambient tuft rather than a planting. */
export function isTuftBlock(stack: PrismarineStack, stateId: number): boolean {
  const name = stack.blockNameByStateId(stateId);
  if (name === undefined) return false;
  return TUFT_NAME.test(name.replace(/^minecraft:/, ""));
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** A world column, as the wall course spells one. */
export interface FloorPoint {
  readonly x: number;
  readonly z: number;
}

/** One block somebody already laid, as every pass in the tree spells one. */
export interface FloorBlock {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly stateId: number;
}

/** A trunk, as the scatter spells one. */
export interface FloorTree {
  readonly x: number;
  readonly z: number;
}

/** Everything {@link layUrbanFloor} reads. */
export interface UrbanFloorInput {
  readonly plan: ColumnPlan;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** A 32-bit detail seed; the mix is position-keyed off it. */
  readonly seed: number;
  /**
   * The wall circuits, as convex vertex rings — `WallCourse["vertices"]`.
   *
   * Vertices rather than the rasterized path: the course is convex by
   * construction (a support hull), so "inside" is an exact integer half-plane
   * test against the corners and needs no flood fill.
   */
  readonly circuits: readonly (readonly FloorPoint[])[];
  /** The settlement's theme; the tones and the mix both derive from it. */
  readonly theme?: MaterialTheme;
  /** Trunks the scatter left standing. */
  readonly trees?: readonly FloorTree[];
  /** The decoration pass's blocks — the town green and its neighbours. */
  readonly decor?: readonly FloorBlock[];
  /** Every structure block laid, in emit order. */
  readonly laid?: readonly FloorBlock[];
}

/** What {@link layUrbanFloor} did. */
export interface UrbanFloorResult {
  /** Columns whose surface this pass rewrote. */
  readonly converted: number;
  /** Columns inside a circuit kept green because something grows on them. */
  readonly kept: number;
  /** Columns inside a circuit somebody else had already claimed. */
  readonly claimed: number;
}

/** The empty answer — an unwalled world. */
const NOTHING: UrbanFloorResult = Object.freeze({ converted: 0, kept: 0, claimed: 0 });

/**
 * Convert the bare turf inside every wall circuit to packed earth.
 *
 * Mutates `plan.surface` in place and returns the counts. Returns
 * {@link NOTHING} — having touched nothing at all — when no circuit was built,
 * which is the whole gate.
 */
export function layUrbanFloor(input: UrbanFloorInput): UrbanFloorResult {
  const rings = input.circuits.filter((r) => r.length >= 3);
  if (rings.length === 0) return NOTHING;

  const { plan } = input;
  const region = plan.region;
  const { width, depth, x0, z0 } = region;
  const turf = turfStates(input.palette, input.stack);
  const tones = floorTones(input.theme, input.palette, input.stack);
  const arid = input.theme?.aridAmbient === true;

  const idxOf = (x: number, z: number): number => (z - z0) * width + (x - x0);
  const insideRegion = (x: number, z: number): boolean =>
    x >= x0 && z >= z0 && x < x0 + width && z < z0 + depth;

  // --- who already owns this column ----------------------------------------
  // `claimed`: a column carrying somebody's block at or above the ground. Never
  // converted and never haloed — a wall is not a garden.
  // `planted`: a column carrying a plant at its standing height, plus a tree's
  // trunk. Never converted, and it lends its halo to its neighbours.
  const claimed = new Uint8Array(width * depth);
  const planted = new Uint8Array(width * depth);
  const mark = (b: FloorBlock): void => {
    if (!insideRegion(b.x, b.z)) return;
    const k = idxOf(b.x, b.z);
    if (b.y < (plan.ground[k] as number)) return;
    const name = input.stack.blockNameByStateId(b.stateId)?.replace(/^minecraft:/, "");
    if (name === undefined || !PLANT_NAME.test(name)) {
      claimed[k] = 1;
      return;
    }
    // A tuft is ambient, a flower bed is a decision. Both keep their own
    // column; only the second lends a border — see {@link TUFT_NAME}.
    planted[k] = Math.max(planted[k] as number, TUFT_NAME.test(name) ? 1 : 2);
  };
  for (const b of input.laid ?? []) mark(b);
  for (const b of input.decor ?? []) mark(b);

  // --- the green halo -------------------------------------------------------
  // Dilated once, over a copy, so a halo cannot seed another halo.
  const green = new Uint8Array(width * depth);
  const dilate = (x: number, z: number, radius: number): void => {
    for (let dz = -radius; dz <= radius; dz++) {
      const zz = z + dz;
      if (zz < z0 || zz >= z0 + depth) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx;
        if (xx < x0 || xx >= x0 + width) continue;
        green[idxOf(xx, zz)] = 1;
      }
    }
  };
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      if (planted[j * width + i] === 2) dilate(x0 + i, z0 + j, PLANT_HALO);
    }
  }
  for (const tree of input.trees ?? []) {
    if (!insideRegion(tree.x, tree.z)) continue;
    dilate(tree.x, tree.z, TREE_HALO);
  }

  // --- the circuits ---------------------------------------------------------
  let converted = 0;
  let kept = 0;
  let claimedCount = 0;
  const done = new Uint8Array(width * depth);
  for (const ring of rings) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const v of ring) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
    const orientation = ringOrientation(ring);
    /* c8 ignore next — a degenerate ring cannot come out of the support hull. */
    if (orientation === 0) continue;
    const xa = Math.max(x0, Math.floor(minX));
    const xb = Math.min(x0 + width - 1, Math.ceil(maxX));
    const za = Math.max(z0, Math.floor(minZ));
    const zb = Math.min(z0 + depth - 1, Math.ceil(maxZ));
    for (let z = za; z <= zb; z++) {
      for (let x = xa; x <= xb; x++) {
        const k = idxOf(x, z);
        if (done[k] === 1) continue;
        if (!insideRing(ring, orientation, x, z)) continue;
        done[k] = 1;
        if (plan.fluidKind[k] !== FluidKind.NONE) continue;
        if (claimed[k] === 1) {
          claimedCount++;
          continue;
        }
        if (planted[k] === 1 || green[k] === 1) {
          kept++;
          continue;
        }
        if (!turf.has(plan.surface[k] as number)) {
          claimedCount++;
          continue;
        }
        plan.surface[k] = floorStateAt(tones, arid, plan.snow[k] === 1, input.seed, x, z);
        converted++;
      }
    }
  }
  return { converted, kept, claimed: claimedCount };
}

/* -------------------------------------------------------------------------- */
/* convex point-in-ring, in integers                                           */
/* -------------------------------------------------------------------------- */

/** Twice the ring's signed area: `> 0` one way round, `< 0` the other. */
export function ringOrientation(ring: readonly FloorPoint[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as FloorPoint;
    const b = ring[(i + 1) % ring.length] as FloorPoint;
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.sign(sum);
}

/**
 * True when `(x, z)` is inside the convex ring, boundary included.
 *
 * Integer cross products against every edge, compared to the ring's own
 * orientation, so the answer does not depend on which way round the caller
 * happened to wind it — and no floating point, so it is the same answer on
 * every machine.
 */
export function insideRing(
  ring: readonly FloorPoint[],
  orientation: number,
  x: number,
  z: number,
): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as FloorPoint;
    const b = ring[(i + 1) % ring.length] as FloorPoint;
    const cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (cross * orientation < 0) return false;
  }
  return true;
}

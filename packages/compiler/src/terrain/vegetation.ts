/**
 * `scatter.forest@0` — deterministic tree placement and tree templates.
 *
 * Placement is a **position-keyed jittered-grid Poisson-disk**: the region is
 * tiled with `spacing`-wide cells, each cell offers one candidate at a
 * hash-jittered position, and candidates are accepted in row-major order
 * subject to a 2-D occupancy mask. That gives Poisson-disk's minimum-spacing
 * guarantee while keeping every decision a pure function of the tree's own
 * coordinates — no sequential RNG, so the forest is identical however the
 * region is traversed.
 *
 * Occupancy is checked against the **trunk**, not the canopy. Real forests have
 * interlocking crowns; reserving the whole canopy footprint was what capped a
 * "dense" forest at roughly one tree per 25 columns and made every wood read as
 * dotted speckle. Canopies may now overlap freely, and `spacing` means exactly
 * what §7 says it means: the minimum distance between two trunks.
 */

import {
  Rng,
  SurfaceClass,
  clamp01,
  columnFloat,
  fbm2,
  gradientNoise2,
  positionDigest,
  positionFloat,
  positionInt,
  positionWeighted,
  seed32,
  streamSeed,
  type Classification,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";
import type {
  ClimateTheme,
  FloraSpeciesId,
  ForestParams,
  ForestSpecies,
  ScatterArea,
  StrataParams,
  StratumSpec,
  TreeShape,
} from "@terrainist/spec";
import { ZONE_TOKENS, warning, type LoamDiagnostic } from "@terrainist/spec";

import {
  FLORA_SPECIES,
  LEGACY_FLORA_SPECIES,
  SHAPE_PROGRAMS,
  CLIMATE_STRATA,
  knob,
  speciesFor,
  type FloraBlock,
  type FloraSpeciesDef,
  type FloraStates,
  type FloraVariation,
  type FloraVec2,
  type ShapeProgramId,
} from "./flora/index.js";
import type { ColumnPlan } from "./columns.js";
import { FluidKind } from "./columns.js";
import { isNeutralFlora, type FloraBias } from "./flora-intent.js";
import { chebyshevDistance, featherWeight } from "./landuse.js";
import type { Palette } from "./palette.js";

/**
 * Density at or above which a forest node's area counts as *woods* for the
 * biome rule.
 *
 * Coverage is an eligibility mask, deliberately — biomes must not speckle at
 * the Poisson sampler's gaps. But eligibility alone says nothing about whether
 * a wood is there: a `{ area: { all: true }, density: 0.012 }` node — one tree
 * per ~80 columns, i.e. scattered trees over open country — painted an entire
 * 1024² map `forest` (F20, 2026-08-09).
 *
 * The gate is the node's authored `density`, not a realized per-window tree
 * count, because *density is the thing that says what kind of wood this is*.
 * A window count would also be suppressed by the settlement clearing and by
 * slope refusals, so a genuine wood with a village in it would lose its label
 * for reasons that have nothing to do with how wooded the countryside is; the
 * authored density is stable, cheap and honest about intent. Calibration:
 * `0.025` is a real edge wood, `0.012` over the whole region is not.
 */
export const FOREST_COVERAGE_DENSITY = 0.02;

/** §7 defaults for `scatter.forest@0`. */
export const FOREST_DEFAULTS = Object.freeze({
  density: 0.15,
  spacing: 3,
  clumping: 0.4,
  maxSlope: 35,
  elevation: [1, 200] as readonly [number, number],
  edgeFalloff: 12,
});

/** §7 defaults for `scatter.forest@0.undergrowth`. */
export const UNDERGROWTH_DEFAULTS = Object.freeze({
  grass: 0.35,
  flowers: 0.05,
  deadwood: 0.02,
});

/** `undergrowth` with every default filled in. */
export type ResolvedUndergrowth = Readonly<Record<keyof typeof UNDERGROWTH_DEFAULTS, number>>;

/** Zone token → fractional centre, matching the stdlib's nine-grid. */
const ZONE_FRACTIONS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  center: [0.5, 0.5],
  north: [0.5, 1 / 6],
  south: [0.5, 5 / 6],
  east: [5 / 6, 0.5],
  west: [1 / 6, 0.5],
  northeast: [5 / 6, 1 / 6],
  northwest: [1 / 6, 1 / 6],
  southeast: [5 / 6, 5 / 6],
  southwest: [1 / 6, 5 / 6],
});

/** One placed tree. */
export interface TreePlacement {
  readonly nodeId: string;
  readonly speciesId: string;
  readonly shape: FloraSpeciesId;
  /** World coordinates of the trunk base (the first log, one above the ground). */
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  /** Trunk length in blocks. */
  readonly height: number;
  /** Per-tree canopy radius offset in `-1..+1`. */
  readonly radiusDelta: number;
  /** A 2×2-trunk giant (rare, `spruce_tall` only). */
  readonly mega: boolean;
  readonly trunkState: number;
  readonly leafState: number;
  /**
   * Which layer of the composition planted this tree (§5). Absent means the
   * node had no `strata`, which is every document that validates today.
   */
  readonly stratum?: "emergent" | "canopy" | "understory";
  /**
   * The seed of this plant's program RNG (§3.1), position-keyed on the trunk
   * column so the geometry is a pure function of where the tree stands — never
   * of the order the region was traversed.
   *
   * Carried on the placement rather than recomputed by each consumer because
   * `clipTrees`, the shade map and the emitter must all see the *same* tree.
   */
  readonly programSeed?: Seed256;
  /** Trunk drift direction per 4 blocks of rise (`ancient`). */
  readonly lean?: FloraVec2;
  /** `0..1`, drawn from the species' `age` envelope (`ancient`). */
  readonly age?: number;
  /** Extra part states, resolved from the palette at scatter time (§3.2). */
  readonly rootState?: number;
  readonly deadState?: number;
  readonly hangingState?: number;
  readonly decoState?: number;
  readonly stemState?: number;
  readonly capState?: number;
}

/**
 * How the geometry of one tree differs from its template's baseline.
 *
 * An alias of the grammar's {@link FloraVariation} (§3): same three fields, plus
 * the optional `lean`/`age` the WP-B programs read and the legacy two ignore.
 */
export type TreeVariation = FloraVariation;

/** Share of `spruce_tall` trees that come up as 2×2-trunk giants. */
export const MEGA_SPRUCE_SHARE = 0.03;

/** One forest node after its scatter ran, as the decoration pass needs it. */
export interface ScatteredNode {
  readonly id: string;
  readonly seed: Seed256;
  readonly params: ReturnType<typeof resolveForestParams>;
  /** Where this node considers the ground plantable. */
  readonly mask: Uint8Array;
  /** The node's resolved composition, absent when it declared no `strata`. */
  readonly strata?: ResolvedStrata;
  /**
   * Per-column undergrowth survival weight in `0..1` — see
   * {@link undergrowthFeather}. Shared by every node of one compile; absent
   * for documents with no structures to feather away from.
   */
  readonly feather?: Float32Array;
  /**
   * The town green: 1 on a column inside the settlement's occupancy claim that
   * nothing was ever built or paved on. See {@link townGreenMask}.
   *
   * Read by the undergrowth pass and by nothing else — a trunk inside a
   * footprint's clearance is still a trunk through a wall, so
   * {@link forestEligibility} is unchanged and no tree stands here.
   */
  readonly green?: Uint8Array;
}

/** The outcome of the scatter pass. */
export interface ScatterResult {
  readonly trees: readonly TreePlacement[];
  /** Union of every forest node's eligibility mask — feeds the biome rule. */
  readonly coverage: Uint8Array;
  /** Trees placed per forest node id, for the report. */
  readonly perNode: Readonly<Record<string, number>>;
  /** Per-node eligibility and resolved params, for the undergrowth pass. */
  readonly nodes: readonly ScatteredNode[];
  /**
   * What each composed node's strata did (§5.3).
   *
   * A budget the node could not spend is exactly the kind of silent decline
   * DESIGN.md's first failure mode is about, so it is printed.
   */
  readonly strata: readonly StrataReport[];
  /**
   * Author-actionable findings from the scatter itself (F21).
   *
   * Today that is `LOAM-T119`: a node that planted nothing. Empty on every
   * document whose woods have trees in them, which is why adding it moves no
   * existing world.
   */
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * The slice of the layout solver's occupancy grid the scatter pass reads.
 *
 * Structural typing on purpose: `@terrainist/compiler`'s layout module owns the
 * real `OccupancyGrid`, and the vegetation pass has no business importing the
 * solver to learn what a mask is.
 */
export interface StructureOccupancy {
  readonly mask: Uint8Array;
  readonly byTag: ReadonlyMap<string, Uint8Array>;
  /**
   * The per-column ruin field (RUINS-PLAN-v0 §7.1), when a document ruined
   * anything — 0 everywhere no ruin reaches.
   *
   * Present only on a world with decayed shells in it, which is the reach law
   * (§2) made structural: with no ruins the field is absent, the reclaim gate
   * below is unreachable code, and every decline-free document compiles the
   * eligibility mask it compiled before F19 existed.
   */
  readonly ruin?: Float32Array;
  /**
   * Columns a pass paved that write **no occupancy tag** — today the district
   * street bands, carriageway and sidewalk both.
   *
   * The town green already found this hole from the other side ("a district
   * street and a stair flight write no occupancy tag"), and it is harmless
   * while the settlement's whole rectangle is excluded outright. §7.4's reclaim
   * removes that outright exclusion, so the hole becomes a tree standing in the
   * middle of a pavement — measured, on the WP-4 fixture: 67 of 111 reclaim
   * trunks stood on the sidewalk band. Supplied beside {@link ruin} and read
   * only by the reclaim, so nothing outside a ruined world sees it.
   */
  readonly ruinPaved?: Uint8Array;
  /**
   * The green skin's `colonized` mask — street and yard columns the **street
   * law** elected for a trunk (`docs/RUINS-PLAN-v0-WP6.md` §6.1).
   *
   * > **Ruling (Kai, 2026-08-10): trees and plants in the middle of a road are
   * > part of an overgrown settlement.** This supersedes the closure's
   * > streets-stay-clear rule **for ruined quarters only.**
   *
   * The opening is narrow on purpose: a column in this mask is open whatever
   * {@link ruinPaved} says and whatever `road` / `plaza` / `ground` say, and
   * nothing else changes — `building`, `interior`, `farm`, `courtyard` and
   * `prop` stay hard, so no street trunk ever stands in a shell, in a cellar
   * mouth, in a field or on a prop's stand. The discipline that keeps the grid
   * readable (the spine, the junction clearance, the sight-line runs, the
   * spacing and the U2 withdraw loop) is all upstream, in the structures pass,
   * where the street masks live.
   */
  readonly ruinColonized?: Uint8Array;
  /**
   * Interior columns of roofless shells that may stand **one** trunk each
   * (WP-6 §14 Q5, as Kai ruled it: `heavy` **and** `total`).
   *
   * A second mask because it crosses a line the base plan drew deliberately —
   * base §4.3's *"a tree standing in a footprint grows through a wall"* — and
   * it is worth crossing only for the image Kai asked for. It is the **only**
   * thing that opens `building` and `interior`, and the skin elects at most one
   * column per shell, sited where the interior flood does not need it.
   */
  readonly ruinShellTrunks?: Uint8Array;
}

/** How open a claimed column is to a trunk — nothing, §7.4, §6.1, or Q5. */
const enum ReclaimGate {
  Closed = 0,
  /** §7.4: open ground inside a ruined quarter. */
  Reclaimed = 1,
  /** §6.1: a street or yard column the street law elected. */
  Colonized = 2,
  /** Q5: one interior column of a roofless shell. */
  Shell = 3,
}

/**
 * Whether the ruin opens this claimed column to a trunk, and how far.
 *
 * §7.4's two conditions are still the base case, and both are the plan's: the
 * ruin field is positive here (the ground is *ruined* ground, not merely inside
 * a settlement that has ruins somewhere), and no pass has actually built on the
 * column ({@link RUIN_RECLAIM_HARD_TAGS}).
 *
 * WP-6d adds the two masks above, and they are the *only* way past a hard tag.
 * Both are empty on every world that ruins nothing, so this is structurally the
 * function it was before WP-6d existed everywhere it was before.
 */
function reclaimOpen(structures: StructureOccupancy, idx: number): ReclaimGate {
  const ruin = structures.ruin;
  if (ruin === undefined || (ruin[idx] as number) <= 0) return ReclaimGate.Closed;
  if (structures.ruinShellTrunks?.[idx] === 1) return ReclaimGate.Shell;
  const colonized = structures.ruinColonized?.[idx] === 1;
  if (colonized) {
    // Everything §6.1 leaves hard, and nothing else.
    for (const tag of RUIN_COLONIZE_HARD_TAGS) {
      if (structures.byTag.get(tag)?.[idx] === 1) return ReclaimGate.Closed;
    }
    return ReclaimGate.Colonized;
  }
  if (structures.ruinPaved?.[idx] === 1) return ReclaimGate.Closed;
  for (const tag of RUIN_RECLAIM_HARD_TAGS) {
    if (structures.byTag.get(tag)?.[idx] === 1) return ReclaimGate.Closed;
  }
  return ReclaimGate.Reclaimed;
}

/**
 * The author's `avoidTags` a given gate may step over.
 *
 * The kit's standing `avoidTags: ["structure", "road", "plaza"]` line is what
 * keeps trees out of buildings and off streets everywhere else, and §10 amends
 * exactly this much of its promise: *"except inside a ruined quarter at high
 * `decline`, where the compiler deliberately lets a share of the street back to
 * the wood."* Without this the colonizer's mask would open `reclaimOpen` and
 * the author's own line would close it again one branch later.
 */
const RECLAIM_SOFT_TAGS: Readonly<Record<ReclaimGate, readonly string[]>> = Object.freeze({
  [ReclaimGate.Closed]: [],
  [ReclaimGate.Reclaimed]: ["structure"],
  [ReclaimGate.Colonized]: ["structure", "road", "plaza", "ground"],
  [ReclaimGate.Shell]: ["structure", "road", "plaza", "ground", "building", "interior"],
} as const);

/**
 * The union of the two WP-6d masks, or `undefined` when neither is there.
 *
 * `undefined` rather than an empty array on purpose: the scatter's candidate
 * loop takes a different shape when it is present, and a world that ruins
 * nothing must take the shape it took before WP-6d existed.
 *
 * The two are told apart in the value — {@link ElectedKind} — because the
 * street fit below applies to one of them and must not apply to the other: a
 * street trunk should *fit* its canyon, and a shell trunk's whole image is a
 * tree bursting **out** of a roofless ruin, which is a tree that does not fit
 * and is not supposed to.
 */
function electedColumns(
  structures: StructureOccupancy | undefined,
  cells: number,
): Uint8Array | undefined {
  const street = structures?.ruinColonized;
  const shells = structures?.ruinShellTrunks;
  if (street === undefined && shells === undefined) return undefined;
  const out = new Uint8Array(cells);
  if (street !== undefined) {
    for (let k = 0; k < Math.min(cells, street.length); k++) {
      if (street[k] === 1) out[k] = ElectedKind.Street;
    }
  }
  if (shells !== undefined) {
    for (let k = 0; k < Math.min(cells, shells.length); k++) if (shells[k] === 1) out[k] = ElectedKind.Shell;
  }
  return out;
}

/** What elected a column, in {@link electedColumns}' mask. */
const enum ElectedKind {
  None = 0,
  /** §6.1: the street law, on a carriageway, a sidewalk or a yard. */
  Street = 1,
  /** §14 Q5: one interior column of a roofless shell. */
  Shell = 2,
}

/**
 * The furthest {@link wallRoom} bothers to measure, in blocks.
 *
 * The transform stops there because no legacy shape's crown reaches further
 * than a few blocks even fully grown, so any distance past this answers every
 * question the fit can ask — and an uncapped distance transform over open
 * country is a field of large numbers nobody reads.
 */
export const STREET_ROOM_MAX = 8;

/**
 * Chebyshev distance from every column to the nearest **solid**, capped at
 * {@link STREET_ROOM_MAX}.
 *
 * Two chamfer passes, forward then backward, which is the exact Chebyshev
 * transform for a square neighbourhood and costs two sweeps of the region.
 * `solid` is the clip's column mask — what a crown would actually be cut
 * against — because the question a street tree has to answer is *how much room
 * is there between the shells*, and the pavement it stands on is not an
 * obstruction.
 */
export function wallRoom(solid: Uint8Array, width: number, depth: number): Uint8Array {
  const out = new Uint8Array(width * depth).fill(STREET_ROOM_MAX);
  for (let k = 0; k < out.length && k < solid.length; k++) if (solid[k] === 1) out[k] = 0;
  const at = (i: number, j: number): number =>
    i < 0 || j < 0 || i >= width || j >= depth ? STREET_ROOM_MAX : (out[j * width + i] as number);
  const relax = (i: number, j: number, best: number): void => {
    const k = j * width + i;
    if (best < (out[k] as number)) out[k] = best;
  };
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      relax(i, j, Math.min(at(i - 1, j), at(i, j - 1), at(i - 1, j - 1), at(i + 1, j - 1)) + 1);
    }
  }
  for (let j = depth - 1; j >= 0; j--) {
    for (let i = width - 1; i >= 0; i--) {
      relax(i, j, Math.min(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i - 1, j + 1)) + 1);
    }
  }
  return out;
}

/**
 * The tallest a street tree may grow before its crown starts eating masonry.
 *
 * **The mechanism this replaces (Kai's walk of `overgrown_hideout`, 2026-08-10).**
 * A trunk the street law elected stands in a canyon, and its crown is clipped
 * against every shell it touches. Measured on that world: the 308 elected trees
 * lost **10,257 leaf blocks** to the shells — a hair over half of everything
 * they grew — and what survived was the part that had climbed clear of the
 * roofline. Left alone, allometry makes that worse, not better: a bigger crown
 * in the same canyon is a bigger crown to cut away.
 *
 * So a street tree is grown to the largest size the open ground actually
 * offers, rather than to the size the species table drew and then cut back with
 * a knife. `room` is the Chebyshev distance to the nearest clipped column, so a
 * crown of radius `room - 1` reaches no further than the column before it and
 * touches nothing. Height comes down with it — the programs'
 * allometry ties the two — which is what puts the crown at eye level in a
 * narrow street instead of over the rooftops.
 *
 * Never below the species' own floor: the trunk was elected, the discipline
 * upstream (the spine, the junctions, the sight lines) has already spent itself
 * deciding this column carries a tree, and a fit that withdrew it would be the
 * scatter overruling the street law.
 *
 * **And never when the fit cannot succeed**, which is the clause the first cut
 * of this function was missing and the measurement caught. A trunk elected on a
 * sidewalk column *against* a shell has `room = 0`: no legal crown exists there
 * at any height, and shrinking the tree only moved its crown down out of the
 * daylight and into the masonry — elected leaf blocks eaten went 4,454 → 8,981
 * on `wild_oak` alone. Where there is genuinely no room, a tree taking its
 * canopy up over the roofline is not fleeing the street, it is the only place a
 * canopy can be, and allometry has by then made that canopy a crown rather than
 * a mullet. So the fit applies where it works and abstains where it does not.
 */
export function fitStreetTree(
  def: FloraSpeciesDef,
  height: number,
  floor: number,
  radiusDelta: number,
  mega: boolean,
  room: number,
): number {
  const program = SHAPE_PROGRAMS[def.program as ShapeProgramId];
  const fits = room - 1;
  let h = height;
  while (h > floor && program.canopyRadius({ height: h, radiusDelta, mega }, def) > fits) h -= 1;
  return program.canopyRadius({ height: h, radiusDelta, mega }, def) > fits ? height : h;
}

/** A forest node flattened to what the scatter pass needs. */
export interface ForestNodeInput {
  readonly id: string;
  readonly nodePath: string;
  readonly seed: Seed256;
  readonly params: ForestParams;
}

/** Fill in `scatter.forest@0` defaults. */
export function resolveForestParams(params: ForestParams): Required<
  Pick<ForestParams, "density" | "spacing" | "clumping" | "maxSlope" | "edgeFalloff">
> & {
  elevation: readonly [number, number];
  area: ScatterArea;
  undergrowth: ResolvedUndergrowth;
  /** §9.6: the node-level default ceiling; `undefined` means "no ceiling". */
  snowLine: number | undefined;
} {
  return {
    snowLine: params.snowLine,
    undergrowth: {
      grass: params.undergrowth?.grass ?? UNDERGROWTH_DEFAULTS.grass,
      flowers: params.undergrowth?.flowers ?? UNDERGROWTH_DEFAULTS.flowers,
      deadwood: params.undergrowth?.deadwood ?? UNDERGROWTH_DEFAULTS.deadwood,
    },
    density: params.density ?? FOREST_DEFAULTS.density,
    spacing: params.spacing ?? FOREST_DEFAULTS.spacing,
    clumping: params.clumping ?? FOREST_DEFAULTS.clumping,
    maxSlope: params.maxSlope ?? FOREST_DEFAULTS.maxSlope,
    edgeFalloff: params.edgeFalloff ?? FOREST_DEFAULTS.edgeFalloff,
    elevation: params.elevation ?? FOREST_DEFAULTS.elevation,
    area: params.area ?? { all: true },
  };
}

/**
 * Whether a species may stand on a column at this ground height (§9.6).
 *
 * `snowLine` is an **absolute** Y — unlike `params.elevation`, which is
 * relative to sea level — and it is a ceiling: at or below it the species
 * stands, above it the species stops. The species entry's own key wins; absent,
 * the node's `params.snowLine` is the default; absent there too the species has
 * no ceiling and every eligible column is fair game (the reach law: a document
 * that writes neither key compiles byte-identically).
 *
 * Refusal is a *stop*, not a re-roll: the candidate is simply dropped. Re-picking
 * a lower species there would put a full-density wood above the line wearing
 * different leaves, which is the opposite of what an author writing a snow line
 * asked for, and it would make the draw order depend on terrain height.
 *
 * Each caller tests this **after** it has claimed the trunk lattice, so a snow
 * line only ever *removes* trees: the wood below the line is placement-identical
 * to the same document without the key.
 */
function speciesStands(
  entry: ForestSpecies,
  params: ReturnType<typeof resolveForestParams>,
  groundY: number,
): boolean {
  const ceiling = entry.snowLine ?? params.snowLine;
  return ceiling === undefined || groundY <= ceiling;
}

/**
 * Build the eligibility mask of one forest node: 1 where a tree may stand.
 *
 * A column is eligible when it is soil (not cliff, beach, ocean floor or snow
 * cap), dry, gentle enough, inside the node's coarse `area`, and within the
 * elevation band relative to sea level.
 *
 * `structures` is the layout solver's occupancy grid, absent for terrain-profile
 * documents. Its union mask is excluded: a footprint plus its clearance is
 * claimed ground, and a tree standing in it would grow through a wall whatever
 * the document's `avoidTags` say. `avoidTags` then excludes further per-tag
 * slices on top, which is how an author keeps an orchard out of the market
 * square without banning it from the whole settlement.
 *
 * **The one exception is RUINS-PLAN-v0 §7.4's reclaim.** Where the ruin field
 * is positive and no pass actually built on the column
 * ({@link RUIN_RECLAIM_HARD_TAGS}), the claim is opened and the wood comes back
 * *through* the fabric. Without it §7.4's clearing lift is inert — a density
 * multiplier raised on ground the eligibility mask had already excluded — and
 * the measurement on the WP-4 fixture was exactly that: 847 trees, 0 over
 * ruined ground, the nearest trunk 71 blocks from the dead quarter's centre.
 * `structures.ruin` is absent for every document that ruined nothing, so this
 * is structurally unreachable there.
 *
 * `areaWobbleSeed` bends the `area` boundary (see {@link AREA_EDGE_WOBBLE}). It
 * must be the same seed the scatter's taper uses, or the mask and the density
 * ramp would disagree about where the wood ends — and the undergrowth, which
 * reads this mask, would dress a rectangle the trees no longer stand on.
 */
export function forestEligibility(
  plan: ColumnPlan,
  classification: Classification,
  params: ReturnType<typeof resolveForestParams>,
  structures?: StructureOccupancy,
  avoidTags: readonly string[] = [],
  areaWobbleSeed = 0,
): Uint8Array {
  const { region, ground, fluidKind, seaLevel } = plan;
  const mask = new Uint8Array(region.width * region.depth);
  const area = areaTest(region, params.area, areaWobbleSeed);
  const [eMin, eMax] = params.elevation;

  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (classification.classes[idx] !== SurfaceClass.SOIL) continue;
      if (fluidKind[idx] !== FluidKind.NONE) continue;
      if ((classification.slopes[idx] as number) > params.maxSlope) continue;
      const relative = (ground[idx] as number) - seaLevel;
      if (relative < eMin || relative > eMax) continue;
      if (!area(region.x0 + i, z)) continue;
      if (structures !== undefined) {
        // RUINS-PLAN §7.4. On ruined ground with nothing built on it the
        // settlement's *claim* stops being a reason to keep the wood out — the
        // quarter is coming down and the green is coming through it. Everywhere
        // else, and in every document with no ruins in it, this is the
        // unconditional exclusion it has always been.
        const gate = structures.mask[idx] === 1 ? reclaimOpen(structures, idx) : ReclaimGate.Closed;
        if (structures.mask[idx] === 1 && gate === ReclaimGate.Closed) continue;
        const soft = RECLAIM_SOFT_TAGS[gate];
        let avoided = false;
        for (const tag of avoidTags) {
          // `structure` is the reserved rectangle, and on a district it is the
          // whole quarter — the same claim the line above just opened, so
          // honouring it here would close the reclaim again from the author's
          // own standing `avoidTags` line. Every *other* tag is a per-column
          // claim and stays hard for a merely reclaimed column: `road` and
          // `plaza` are why a reclaimed street grows scrub and not a forest
          // with a buried road under it. On a column the **street law** elected
          // they are soft, which is §10's amendment to the kit's promise and
          // the whole of Kai's "trees in the middle of a road" ruling.
          if (soft.includes(tag)) continue;
          if (structures.byTag.get(tag)?.[idx] === 1) {
            avoided = true;
            break;
          }
        }
        if (avoided) continue;
      }
      mask[idx] = 1;
    }
  }
  return mask;
}

/**
 * How far past claimed ground the undergrowth thins back in, in columns.
 *
 * {@link forestEligibility} excludes the occupancy union outright, and that is
 * right for trees — a trunk in a footprint grows through a wall. The
 * undergrowth pass reads the same mask, and there it is wrong: occupancy is a
 * union of *rectangles*, so a walk of the first steep hillside town found the
 * line it draws running dead straight across natural terrace after natural
 * terrace, tall grass and ferns on one side of it and bare stepped grass on the
 * other. Measured on that fixture the step was total: 0.000 plants per column
 * inside the mask, 0.207 one column outside it.
 *
 * The biome clamp had already learned this lesson (`landuse.ts`) — the fix
 * there was a dithered band, and it is the fix here. Ten columns is the same
 * order as the clamp's 6–10 stored cells, and wide enough that the eye reads a
 * thinning meadow rather than an edge.
 */
export const UNDERGROWTH_FEATHER = 10;

/**
 * The undergrowth's survival weight per column: `interiorShare` on claimed
 * ground, ramping to 1 (ambient) over {@link UNDERGROWTH_FEATHER} columns of
 * natural ground beyond it.
 *
 * **One density field, not two mechanisms.** The first version of this ramp
 * ended at 0 on the claim, because at the time the claim really was bare. The
 * town green then gave the settlement's own unbuilt ground a flat
 * {@link TOWN_GREEN_DENSITY} of ambient — and the two together drew a *trough*:
 * half-ambient inside the claim, near-nothing one column outside it, ambient ten
 * columns further out. Kai walked it (2026-08-09) and the trough is the harsh
 * cutoff he named. So the ramp's inner endpoint is the interior share itself:
 * density runs ambient → gradient → interior share, and it is monotone the whole
 * way. There is no zero anywhere unless the interior share is itself 0.
 *
 * The gradient stays fairly harsh on purpose — the smoothstep is unchanged, only
 * its floor moved. A town that is genuinely sparser than its wood should still
 * *look* sparser at the wall; what it must not do is pass through bare ground to
 * get there.
 *
 * A weight, not a decision: the caller turns it into one with a position-keyed
 * hash, so the thinning is a pure function of the column. No RNG, no traversal
 * order, no wall clock — recompiling the same document thins the same columns.
 *
 * The ramp is `landuse.ts`'s smoothstep, run the other way up: `featherWeight`
 * answers "how much does the claimed side still apply here", and what survives
 * is the interior share plus that much of the way back to ambient.
 */
export function undergrowthFeather(
  structures: StructureOccupancy,
  width: number,
  depth: number,
  band: number = UNDERGROWTH_FEATHER,
  interiorShare: number = TOWN_GREEN_DENSITY,
): Float32Array {
  const share = interiorShare < 0 ? 0 : interiorShare > 1 ? 1 : interiorShare;
  const weight = new Float32Array(width * depth);
  if (band <= 0) {
    weight.fill(1);
    for (let i = 0; i < weight.length; i++) if (structures.mask[i] === 1) weight[i] = share;
    return weight;
  }
  const distance = chebyshevDistance(structures.mask, width, depth, band);
  for (let i = 0; i < weight.length; i++) {
    const d = distance[i] as number;
    // `chebyshevDistance` reports -1 past its cap: that ground is far enough
    // from anything claimed to be ambient.
    weight[i] = d < 0 ? 1 : d === 0 ? share : share + (1 - share) * (1 - featherWeight(d, band));
  }
  return weight;
}

/* -------------------------------------------------------------------------- */
/* The town green                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Occupancy tags a *pass* claimed, column by column, as opposed to the tags the
 * layout solver stamps over a whole inflated rectangle.
 *
 * The distinction is the whole point of this file's second lesson. The solver's
 * `structure` tag (and every node tag beside it) covers `footprint + clearance`
 * — a claim on the *area*, not a record of what was built in it. These five are
 * written by the passes that actually put something down: the road surfacer,
 * the plaza paver, the ground-treatment pass (`grounds.ts`, whose `taken` set is
 * the ground contract's own declared claim — dressed lots, forecourts, worn
 * paths), the courtyard pass and the prop pass.
 */
export const BUILT_OCCUPANCY_TAGS: readonly string[] = Object.freeze([
  "road",
  "plaza",
  "ground",
  "courtyard",
  "prop",
]);

/**
 * The per-column claims that stay closed to a tree even on ruined ground
 * (RUINS-PLAN-v0 §7.4).
 *
 * The reclaim opens the settlement to the wood — but "open ground in a ruined
 * quarter" is not "anywhere in a ruined quarter". These are the tags a pass
 * writes when it actually put something on a column: the shell and its room,
 * the carriageway, the flagstones, a dressed ground treatment, a courtyard, a
 * prop's stand, a field. A trunk on any of them is a tree through a wall or a
 * tree in the middle of a street, which is exactly what the kit's standing
 * `avoidTags: ["structure", "road", "plaza"]` line promises never happens.
 *
 * What is *not* here is `structure` — the solver's reserved rectangle, which on
 * a district is the whole quarter. That claim is the one the reclaim exists to
 * open; leaving it closed is why the WP-4 fixture stood 847 trees around a
 * ruined city and none in it.
 */
export const RUIN_RECLAIM_HARD_TAGS: readonly string[] = Object.freeze([
  "building",
  "interior",
  "farm",
  ...BUILT_OCCUPANCY_TAGS,
]);

/**
 * The per-column claims that stay closed even on a column the **street law**
 * elected (RUINS-PLAN-v0-WP6 §6.1).
 *
 * The colonizer's opening is narrow, and this list is the whole of its
 * narrowness: `road`, `plaza` and `ground` come off — those are the paving,
 * the flagstones and the ruin yard, which is exactly the ground Kai's ruling
 * gives back to the wood — and `building`, `interior`, `farm`, `courtyard` and
 * `prop` stay. *"So no trunk ever stands in a shell, in a cellar mouth, in a
 * field or on a prop's stand."* The one exception in the whole pipeline is the
 * shell-tree mask, which is elected one column per roofless shell and reaches
 * `reclaimOpen` by its own door.
 */
export const RUIN_COLONIZE_HARD_TAGS: readonly string[] = Object.freeze([
  "building",
  "interior",
  "farm",
  "courtyard",
  "prop",
]);

/**
 * Columns a pass actually put a block in — the finest "is this built" signal
 * the pipeline has, because it is not a claim at all but the blocks themselves.
 *
 * The occupancy tags miss things, and the miss is visible: the first compiled
 * run of the town green grew short grass on `cobblestone_slab`,
 * `polished_andesite`, `polished_diorite`, `smooth_quartz` and
 * `cobblestone_stairs` — a district street, a stair flight and a retained
 * terrace, none of which writes a per-column occupancy tag. Whatever a pass
 * builds it builds out of blocks, so this mask cannot be behind.
 *
 * Air is skipped: several passes clear headroom above ground they never
 * touched, and a cleared column is not a paved one.
 */
export function builtColumnMask(
  region: Region,
  blocks: readonly { readonly x: number; readonly z: number; readonly stateId: number }[],
  into?: Uint8Array,
): Uint8Array {
  const mask = into ?? new Uint8Array(region.width * region.depth);
  for (const b of blocks) {
    if (b.stateId === 0) continue;
    const i = b.x - region.x0;
    const j = b.z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
    mask[j * region.width + i] = 1;
  }
  return mask;
}

/**
 * How far small vegetation stays off built ground, in columns.
 *
 * Two, not four: `DECOR_APRON` (clip.ts) is the *deadwood* standoff, sized so a
 * four-block log cannot point at a wall, and applying it to a grass tuft would
 * strip every yard narrower than nine columns — which, in a town, is every
 * yard. Two columns is enough that a paving edge still reads as a line and a
 * doorstep still reads as swept.
 */
export const TOWN_GREEN_STANDOFF = 2;

/**
 * Small vegetation's share of ambient density inside the settlement.
 *
 * A yard is *tended*: not bare — that was the defect — but not the meadow
 * outside the walls either. Half is the middle of the 40–60% band the walk
 * asked for, and it is one constant rather than a per-plant table because the
 * thinning is a property of the place, not of the species: the flower patches
 * and the grass draw are already tuned relative to each other, and scaling both
 * by the same number keeps that mix intact while halving how much of it there is.
 *
 * Since 2026-08-09 this is the *default* interior share rather than the only
 * one: `terrain.settlementGreenery` (terrain/climate-intent.ts) lets a declared
 * era nudge it to a quarter or three quarters, and a document with no `era`
 * resolves to exactly this number. It is also the inner endpoint of
 * {@link undergrowthFeather}'s ramp, so the two edges of the settlement boundary
 * are one field.
 */
export const TOWN_GREEN_DENSITY = 0.5;

/**
 * Where small vegetation may grow *inside* the settlement's claim.
 *
 * `UNDERGROWTH_FEATHER` fixed the outside of this boundary — the straight line
 * the occupancy rectangles drew across natural terrain. This is the same lesson
 * one level in: inside the rectangles, a walk of `hillside_town-8` found the
 * town interior totally bare, because the union of *rectangles* the solver
 * claimed is very much larger than what the fabric actually built on. Between
 * the lots, behind the houses and over every natural pocket the streets never
 * reached, the ground was mown to nothing.
 *
 * A column is green when the node would plant there if the settlement were not
 * in the way (`natural`), the settlement *is* in the way (`structures.mask`),
 * and nothing was built or paved on it or within {@link TOWN_GREEN_STANDOFF}
 * columns of it. "Built or paved" is the union of the finest signals the
 * pipeline genuinely records:
 *
 * - `built` — {@link builtColumnMask} over every block the structure and
 *   program passes wrote, plus the clip's own column mask (which adds a
 *   building's eave ring and a road's verge). This is geometry the passes
 *   produced, not area they reserved.
 * - {@link BUILT_OCCUPANCY_TAGS} — the per-column claims listed there.
 *
 * `avoidTags` is honoured **only where it names a per-column claim**. Every
 * fixture in the tree writes `avoidTags: ["structure", "road", "plaza"]`, and
 * `structure` is the solver's rectangle union — 25,047 columns of the 26,529
 * this settlement claims, of which 6,891 have anything built on them. Applying
 * it here would re-impose the exact bound the green exists to look inside of,
 * and measurably did: the first run of this function returned 8 green columns.
 * A tag that names something a pass actually paved is honoured; a tag that
 * names an area the solver reserved is not, because the ground is what it is
 * and the flagstones are excluded by the paving signal either way.
 */
export function townGreenMask(
  natural: Uint8Array,
  structures: StructureOccupancy,
  width: number,
  depth: number,
  built?: Uint8Array,
  avoidTags: readonly string[] = [],
  standoff: number = TOWN_GREEN_STANDOFF,
): Uint8Array {
  const cells = width * depth;
  const claimed = new Uint8Array(cells);
  if (built !== undefined && built.length === cells) {
    for (let k = 0; k < cells; k++) if (built[k] === 1) claimed[k] = 1;
  }
  for (const tag of BUILT_OCCUPANCY_TAGS) {
    const m = structures.byTag.get(tag);
    if (m === undefined || m.length !== cells) continue;
    for (let k = 0; k < cells; k++) if (m[k] === 1) claimed[k] = 1;
  }
  // The standoff is the same Chebyshev field the feather runs on, read as a
  // hard test rather than a ramp: inside the town the transition the eye wants
  // is a swept edge, not a gradient.
  const distance = chebyshevDistance(claimed, width, depth, Math.max(1, standoff));
  const avoided: Uint8Array[] = [];
  for (const tag of avoidTags) {
    if (!BUILT_OCCUPANCY_TAGS.includes(tag)) continue;
    const m = structures.byTag.get(tag);
    if (m !== undefined && m.length === cells) avoided.push(m);
  }

  const green = new Uint8Array(cells);
  for (let k = 0; k < cells; k++) {
    if (natural[k] !== 1) continue;
    if (structures.mask[k] !== 1) continue;
    const d = distance[k] as number;
    if (d >= 0 && d <= standoff) continue;
    let skip = false;
    for (const m of avoided) {
      if (m[k] === 1) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    green[k] = 1;
  }
  return green;
}

/**
 * Run every forest node's scatter, in document order.
 *
 * `clearing` is the settlement's tree-density field (see `clearing.ts`): a
 * per-column multiplier in `0..1` that is 0 over the built-up area and ramps
 * back to 1 across the treeline. It scales the acceptance probability and
 * nothing else — in particular it does **not** touch each node's eligibility
 * mask, so the undergrowth pass still dresses the cleared ground as a meadow.
 */
export function scatterForests(
  nodes: readonly ForestNodeInput[],
  plan: ColumnPlan,
  classification: Classification,
  palette: Palette,
  structures?: StructureOccupancy,
  clearing?: Float32Array,
  climate?: ClimateSample,
  /**
   * Columns a structure's blocks actually cover — {@link builtColumnMask} over
   * what the passes wrote, unioned with the clip's column mask. Only
   * the town green reads it (see {@link townGreenMask}); the scatter itself is
   * unchanged, because a trunk inside a claimed rectangle is still a trunk in
   * somebody's yard.
   */
  built?: Uint8Array,
  /**
   * The settlement's interior share of ambient undergrowth density — the
   * `terrain.settlementGreenery` fan-out's answer. Defaults to
   * {@link TOWN_GREEN_DENSITY}, which is what a document with no intent gets.
   * Read only by {@link undergrowthFeather} here; the decoration pass reads the
   * same number for the green itself.
   */
  greenShare: number = TOWN_GREEN_DENSITY,
  /**
   * The clip's own column mask — every column a structure solid covers,
   * footprint plus its one-block apron. Read only by {@link wallRoom}, for the
   * street fit, and so only on a world where the street law elected anything.
   *
   * The clip rather than the `building` occupancy tag, deliberately: the tag is
   * the footprint *inflated by the node's clearance*, which on the metropolis
   * fixture put a "wall" one column from 376 of 598 elected trunks and left the
   * fit inert. The clip's columns are the blocks that are actually there, which
   * is the same set the crown will be tested against later.
   */
  solids?: Uint8Array,
  /**
   * The `character.flora` fan-out's answer (§6), or `undefined`.
   *
   * Read only through {@link isNeutralFlora}: a document that says nothing
   * about flora — which is every document that validates today — takes exactly
   * the branches it always took, and the bias is structurally absent rather
   * than conditionally applied.
   */
  floraBias?: FloraBias,
): ScatterResult {
  const { region } = plan;
  const coverage = new Uint8Array(region.width * region.depth);
  // Trunk exclusion zones already claimed, shared across nodes so a wilderness
  // fill cannot plant a trunk on top of a deliberate forest's tree.
  const occupancy = new Uint8Array(region.width * region.depth);
  // Per-species exclusion masks, shared across nodes for the same reason
  // `occupancy` is: two overlapping forest nodes that both plant birch are one
  // birch wood on the ground, and the species' own clearance has to hold across
  // the seam. Allocated lazily, so a species without a `minSpacing` knob costs
  // nothing (§3.5, 2026-08-08).
  const kinMasks = new Map<string, Uint8Array>();
  const trees: TreePlacement[] = [];
  const perNode: Record<string, number> = {};
  const scattered: ScatteredNode[] = [];
  // One field for the whole compile: the undergrowth thins back in past claimed
  // ground the same way for every node, because it is a property of the
  // settlement's edge, not of any one wood.
  const feather =
    structures === undefined
      ? undefined
      : undergrowthFeather(structures, region.width, region.depth, UNDERGROWTH_FEATHER, greenShare);
  const strataReports: StrataReport[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  // WP-6 §6.4: the street law's elected columns and Kai's Q5 shells, as one
  // set. Built only when the skin ran, which is only on a world with ruins.
  const elected = electedColumns(structures, region.width * region.depth);
  // Built once per compile and only where the street law ran: the canyon a
  // street tree has to fit is a property of the fabric, not of any one wood.
  const room =
    elected === undefined || solids === undefined ? undefined : wallRoom(solids, region.width, region.depth);

  for (const node of nodes) {
    const params = biasParams(resolveForestParams(node.params), floraBias);
    const areaWobbleSeed = seed32(streamSeed(node.seed, "scatter.area-edge"));
    const mask = forestEligibility(
      plan,
      classification,
      params,
      structures,
      node.params.avoidTags ?? [],
      areaWobbleSeed,
    );
    // The town green: the same eligibility, asked *without* the settlement in
    // the way, then narrowed to the claimed ground nothing was built on. Same
    // wobble seed as the mask above, so the two answers agree about where the
    // node's area ends.
    const green =
      structures === undefined
        ? undefined
        : townGreenMask(
            forestEligibility(plan, classification, params, undefined, [], areaWobbleSeed),
            structures,
            region.width,
            region.depth,
            built,
            node.params.avoidTags ?? [],
          );
    // Coverage feeds the biome rule, so a fully cleared column must not report
    // as forested — a village green painted `forest` is exactly the wrong colour.
    // A node thinner than {@link FOREST_COVERAGE_DENSITY} is scatter, not a
    // wood: it still plants its trees, it just does not claim the ground as
    // forest.
    if (params.density >= FOREST_COVERAGE_DENSITY) {
      for (let k = 0; k < coverage.length; k++) {
        if (mask[k] === 1 && (clearing === undefined || (clearing[k] as number) > 0)) coverage[k] = 1;
      }
    }
    const before = trees.length;
    const strata = biasStrata(resolveStrata(node.params.strata), floraBias);
    // Strata run in a fixed order — emergent, canopy, understory — on three
    // named streams. Order matters only through the shared occupancy mask,
    // which is already order-dependent (row-major) today; naming the order in
    // one place is what keeps it deterministic.
    if (strata === undefined) {
      scatterOne(node, params, plan, mask, occupancy, kinMasks, palette, trees, clearing, false, undefined, elected, room, floraBias);
    } else {
      const theme = nodeClimateTheme(mask, climate);
      const emergentLive = stratumLive(strata.emergent);
      const emergentSpecies = emergentLive
        ? biasSpecies(
            stratumSpecies(strata.emergent, theme, "emergent", CLIMATE_STRATA),
            "emergent",
            floraBias,
          )
        : [];
      const emergent = emergentLive
        ? scatterEmergent(node, params, strata.emergent, emergentSpecies, plan, mask, occupancy, palette, trees, clearing, floraBias)
        : { budget: 0, placed: 0, refused: 0 };
      // §5.5: with a live emergent stratum the mega-spruce draw is suppressed —
      // the budget has taken over the "rare and landmark-like" job, and a wood
      // with both would be the opposite of rare.
      const resolvedCanopy: ResolvedStrata =
        strata.canopy === "default"
          ? {
              ...strata,
              canopy: {
                species: biasSpecies(
                  stratumSpecies(undefined, theme, "canopy", CLIMATE_STRATA),
                  "canopy",
                  floraBias,
                ),
              },
            }
          : strata;
      scatterOne(node, params, plan, mask, occupancy, kinMasks, palette, trees, clearing, emergentLive, resolvedCanopy, elected, room, floraBias);
      let understory = 0;
      if (stratumLive(strata.understory)) {
        const shade = canopyCover(plan, trees.slice(before));
        understory = scatterUnderstory(
          node,
          params,
          strata.understory,
          biasSpecies(
            stratumSpecies(strata.understory, theme, "understory", CLIMATE_STRATA),
            "understory",
            floraBias,
          ),
          plan,
          mask,
          occupancy,
          shade,
          palette,
          trees,
          clearing,
          floraBias,
        );
      }
      strataReports.push({
        node: node.id,
        theme,
        budget: emergent.budget,
        placed: emergent.placed,
        refused: emergent.refused,
        understory,
      });
    }
    perNode[node.id] = trees.length - before;
    // F21: a wood with no trees in it is the silent failure the ledger names.
    // Measured only when the yield is zero, so the ordinary path costs nothing.
    if (trees.length === before) {
      const d = emptyScatterDiagnostic(node, params, plan, mask, clearing, areaWobbleSeed);
      if (d !== undefined) diagnostics.push(d);
    }
    scattered.push({
      id: node.id,
      seed: node.seed,
      params,
      mask,
      ...(strata === undefined ? {} : { strata }),
      ...(feather === undefined ? {} : { feather }),
      ...(green === undefined ? {} : { green }),
    });
  }

  return { trees, coverage, perNode, nodes: scattered, strata: strataReports, diagnostics };
}

/**
 * Why a forest node planted nothing, said in the author's own vocabulary (F21).
 *
 * Three causes, distinguished by two measurements over the region:
 *
 * 1. **The area resolves to no columns at all.** Overwhelmingly the units trap
 *    (`{ at: [0.5, 0.5], radius: 0.55 }` — `at` fractional, `radius` blocks),
 *    so the fix names it outright.
 * 2. **The area has columns, but none is eligible** — slope, elevation band,
 *    surface class, water, or claimed ground took every one.
 * 3. **Columns were eligible and the sampler still placed nothing** — density,
 *    spacing, or the settlement clearing.
 *
 * Returns `undefined` when the area is *deliberately* degenerate is not a case
 * we can tell apart, so it never does: a zero-yield node always speaks.
 */
function emptyScatterDiagnostic(
  node: ForestNodeInput,
  params: ReturnType<typeof resolveForestParams>,
  plan: ColumnPlan,
  mask: Uint8Array,
  clearing: Float32Array | undefined,
  areaWobbleSeed: number,
): LoamDiagnostic | undefined {
  const { region } = plan;
  let eligible = 0;
  let uncleared = 0;
  for (let k = 0; k < mask.length; k++) {
    if (mask[k] !== 1) continue;
    eligible++;
    if (clearing === undefined || (clearing[k] as number) > 0) uncleared++;
  }
  let areaColumns = 0;
  const inside = areaTest(region, params.area, areaWobbleSeed);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      if (inside(region.x0 + i, region.z0 + j)) areaColumns++;
    }
  }

  const where = node.nodePath;
  const areaText = JSON.stringify(params.area);
  const radius = "radius" in params.area ? params.area.radius : undefined;
  // A sub-block radius that resolved to a handful of columns is the same
  // mistake as one that resolved to none — the wobble on the boundary is the
  // only reason it is not exactly zero — so it gets the same sentence.
  if (areaColumns === 0 || (radius !== undefined && radius < 2)) {
    return warning(
      "SCATTER_EMPTY",
      where,
      `forest node "${node.id}" placed 0 trees: its area ${areaText} covers ${areaColumns} of the region's ${region.width}×${region.depth} columns.`,
      radius !== undefined
        ? `"area.radius" is in BLOCKS while "at" is fractional (0..1). ${radius} blocks is a patch smaller than one tree. For a fraction f of a ${region.width}-wide region write radius = f × ${region.width} / 2 — e.g. "radius": ${Math.max(2, Math.round(region.width * 0.25))}.`
        : `widen "area" — use { "all": true }, a "zone" token, or { "at": [fx, fz], "radius": <blocks> } with a radius in blocks.`,
    );
  }
  if (eligible === 0) {
    return warning(
      "SCATTER_EMPTY",
      where,
      `forest node "${node.id}" placed 0 trees: its area ${areaText} covers ${areaColumns} columns, but none of them is plantable ground (maxSlope ${params.maxSlope}°, elevation ${params.elevation[0]}..${params.elevation[1]} relative to sea level, no water, not built on).`,
      `relax the filters — raise "maxSlope", widen "elevation", or move "area" onto soil rather than rock, water or the settlement footprint.`,
    );
  }
  if (uncleared === 0) {
    return warning(
      "SCATTER_EMPTY",
      where,
      `forest node "${node.id}" placed 0 trees: all ${eligible} of its eligible columns fall inside the settlement clearing, which suppresses tree density to zero.`,
      `move "area" off the town — use a "zone" token away from the settlement, or an "at"/"radius" centred outside it.`,
    );
  }
  return warning(
    "SCATTER_EMPTY",
    where,
    `forest node "${node.id}" placed 0 trees despite ${uncleared} plantable columns: density ${params.density} at spacing ${params.spacing} drew no accepted candidate.`,
    `raise "density" (toward 1) or lower "spacing" (toward 4), or enlarge "area" so the jittered grid offers more candidates.`,
  );
}

function scatterOne(
  node: ForestNodeInput,
  params: ReturnType<typeof resolveForestParams>,
  plan: ColumnPlan,
  mask: Uint8Array,
  occupancy: Uint8Array,
  kinMasks: Map<string, Uint8Array>,
  palette: Palette,
  out: TreePlacement[],
  clearing: Float32Array | undefined,
  suppressMega: boolean,
  strata?: ResolvedStrata,
  /**
   * Columns the green skin's **street law** elected for a trunk
   * (`docs/RUINS-PLAN-v0-WP6.md` §6.4), if any.
   *
   * > An elected column is one the street law has already decided should carry
   * > a tree; the scatter's job there is to say *which* tree, not whether.
   *
   * `clearing[idx] := 1` alone does not buy that. The lattice is jittered, so a
   * given column is offered to the sampler only when a dart happens to land on
   * it: measured on the WP-6d fixture, 83 elected columns produced **10**
   * standing trunks, and the discipline that makes the grid readable — the
   * spine, the junction clearance, the sight lines, the spacing, the withdraw
   * loop — had all been spent on columns no tree ever reached. So an elected
   * column is offered as a candidate **in its own right**, one per attempt slot
   * in its cell, and it skips the density draw it has already passed upstream.
   * Everything after that is the scatter's unchanged: species, height, the
   * trunk lattice, the kin clearance and the snow line all still get to refuse.
   *
   * Absent on every world that ruins nothing, so this is structurally the loop
   * it was before WP-6d existed.
   */
  elected?: Uint8Array,
  /**
   * Distance to the nearest wall per column — {@link wallRoom}. Present exactly
   * when `elected` is, and read only for a column the **street law** elected;
   * see {@link fitStreetTree}.
   */
  room?: Uint8Array,
  /** The `character.flora` bias (§6); neutral for every document without one. */
  bias?: FloraBias,
): void {
  const { region, ground } = plan;
  const scatter = streamSeed(node.seed, "scatter");
  const programStream = streamSeed(node.seed, "flora.program");
  const clumpSeed = seed32(streamSeed(node.seed, "scatter.clump"));
  const areaWobbleSeed = seed32(streamSeed(node.seed, "scatter.area-edge"));
  const spacing = Math.max(1, Math.floor(params.spacing));
  // The canopy layer defaults to `params.species`, unchanged — which is what
  // makes the whole feature additive: `strata` adds the layer above it and the
  // layer below it.
  const canopy = strata?.canopy ?? "authored";
  const species = biasSpecies(
    canopy === "authored"
      ? node.params.species
      : typeof canopy === "string"
        ? node.params.species
        : canopy.species,
    "canopy",
    bias,
  );
  const weights = species.map((s) => s.weight ?? 1);
  // `density` is trees per eligible column, so one cell wants
  // `density · spacing²` of them. Below one that is a probability; at or above
  // one the forest is *saturating* — the author asked for more trees than the
  // grid has cells, and what limits the result is `spacing`, not chance. There
  // the cell throws several darts instead of one, which is what lets a dense
  // forest actually close its canopy (roughly one trunk per 8 columns at
  // spacing 3) rather than stalling at one dart per cell.
  const wanted = params.density * spacing * spacing;
  const saturating = wanted >= 1;
  const attempts = saturating ? Math.min(12, Math.ceil(wanted * 5)) : 1;
  const cellProbability = saturating ? 1 : clamp01(wanted);

  const cellsX = Math.ceil(region.width / spacing);
  const cellsZ = Math.ceil(region.depth / spacing);
  // §6.4's offer, bucketed by the cell it falls in. Row-major over the columns,
  // which is a fixed positional order, so the list a cell hands out is a pure
  // function of the mask.
  const forcedByCell = new Map<number, number[]>();
  if (elected !== undefined) {
    for (let k = 0; k < elected.length; k++) {
      if (elected[k] === ElectedKind.None || mask[k] !== 1) continue;
      const i = k % region.width;
      const j = (k - i) / region.width;
      const cell = Math.floor(j / spacing) * cellsX + Math.floor(i / spacing);
      const bucket = forcedByCell.get(cell);
      if (bucket === undefined) forcedByCell.set(cell, [k]);
      else bucket.push(k);
    }
  }
  for (let cz = 0; cz < cellsZ; cz++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const forced = forcedByCell.get(cz * cellsX + cx);
      const tries = Math.max(attempts, forced?.length ?? 0);
      for (let attempt = 0; attempt < tries; attempt++) {
        const claimed = forced !== undefined && attempt < forced.length ? forced[attempt] : undefined;
        // Candidate position: an elected column outright, or the cell origin
        // plus a position-keyed jitter.
        const jx = positionFloat(scatter, cx, 1 + attempt * 2, cz);
        const jz = positionFloat(scatter, cx, 2 + attempt * 2, cz);
        const x =
          claimed === undefined
            ? region.x0 + Math.min(region.width - 1, Math.floor(cx * spacing + jx * spacing))
            : region.x0 + (claimed % region.width);
        const z =
          claimed === undefined
            ? region.z0 + Math.min(region.depth - 1, Math.floor(cz * spacing + jz * spacing))
            : region.z0 + Math.floor(claimed / region.width);
        const idx = (z - region.z0) * region.width + (x - region.x0);
        if (mask[idx] !== 1) continue;

        if (claimed === undefined) {
          let p = cellProbability;
          if (params.clumping > 0) {
            const n = fbm2(clumpSeed, x, z, { octaves: 2, frequency: 0.02, lacunarity: 2, gain: 0.5 });
            p *= 1 - params.clumping + params.clumping * 2 * clamp01(0.5 + 0.5 * n);
          }
          p *= edgeTaper(region, x, z, params.edgeFalloff);
          p *= areaTaper(region, params.area, x, z, params.edgeFalloff, areaWobbleSeed);
          // The settlement clearing. Zero inside the hull, so the test below can
          // never pass there; a ramp outside it, so the treeline feathers.
          if (clearing !== undefined) {
            const f = clearing[idx] as number;
            if (f <= 0) continue;
            p *= f;
          }
          if (columnFloat(scatter, x, z, 3) >= p) continue;
        }

        const pick = positionWeighted(scatter, x, 4, z, weights);
        const chosen = species[pick] as ForestSpecies;
        const def = speciesFor(chosen.shape);
        const minH = chosen.minHeight ?? def.height[0];
        const maxH = chosen.maxHeight ?? def.height[1];
        // Per-tree variety, all position-keyed: height inside the species range, a
        // canopy a block wider or narrower, and the occasional giant.
        const drawn = positionInt(scatter, x, 5, z, Math.min(minH, maxH), Math.max(minH, maxH));
        const radiusDelta = positionInt(scatter, x, 6, z, -1, 1);
        // §5.5: `MEGA_SPRUCE_SHARE` is data now. Same draw, same salt, same
        // constant, same trees — and suppressed outright when an emergent
        // stratum has taken over the landmark job.
        const mega =
          !suppressMega &&
          def.megaShare !== undefined &&
          positionFloat(scatter, x, 7, z) < def.megaShare;
        // The street fit, and only on the street: a shell trunk keeps the size
        // it drew, because a tree bursting out of a roofless ruin is the image
        // Q5 was ruled for. The draw itself is untouched — same stream, same
        // salt, same number — so switching the fit off returns the old tree.
        const height =
          room === undefined || elected?.[idx] !== ElectedKind.Street
            ? drawn
            : fitStreetTree(def, drawn, Math.min(minH, maxH), radiusDelta, mega, room[idx] as number);

        // Only the trunk is exclusive; a mega spruce occupies 2×2, so it claims
        // one more block of clearance.
        // A species-private clearance, on top of the shared one (§3.5).
        const kin = speciesSpacing(def, spacing);
        let kinMask: Uint8Array | undefined;
        if (kin > spacing) {
          kinMask = kinMasks.get(def.id);
          if (kinMask === undefined) {
            kinMask = new Uint8Array(region.width * region.depth);
            kinMasks.set(def.id, kinMask);
          }
          if (kinMask[idx] === 1) continue;
        }

        if (!claimTrunk(region, occupancy, x, z, spacing + (mega ? 1 : 0), mega)) continue;
        // A **square** stamp, unlike `claimTrunk`'s disk: the crowns this keeps
        // apart are square in plan too (`blob` fills `|dx| ≤ r`, `|dz| ≤ r`), and
        // a disk leaves the diagonals — two birches at (3, 3) are 4.24 apart by
        // Euclid and pass, yet their crowns overlap by two columns. `kin - 1`
        // rather than `kin`, so a sibling exactly `kin` away is still legal —
        // the same "exactly spacing apart is fine" rule `claimTrunk` follows.
        if (kinMask !== undefined) paintSquare(region, kinMask, x, z, kin - 1);

        // §9.6, and deliberately *after* every shared-state mutation above: a
        // snow line only ever removes trees, it never moves one. Refusing
        // earlier would leave the trunk lattice unclaimed and let a
        // below-the-line neighbour drift into the gap, so raising a ceiling
        // would reshuffle the wood underneath it.
        if (!speciesStands(chosen, params, ground[idx] as number)) continue;

        const base: TreePlacement = {
          nodeId: node.id,
          speciesId: chosen.id,
          shape: chosen.shape,
          x,
          z,
          baseY: (ground[idx] as number) + 1,
          height: mega ? height + 4 : height,
          radiusDelta,
          mega,
          trunkState: palette.state(chosen.trunkPalette ?? def.trunkSymbol),
          leafState: palette.state(chosen.leafPalette ?? def.leafSymbol),
          // Every other part state the species declares. Undefined for all four
          // legacy shapes — none of them names a root, stem, cap, hanging, dead
          // or deco symbol — so this object is exactly the one it has always
          // been for every document that validates today. It is not undefined
          // for a species whose program emits a `stem` or a `cap`, and without
          // it naming one in a plain `species` list (no `strata`) resolves no
          // state for a part its program emits, which §3.2 calls a compiler bug
          // and the emitter throws on.
          ...partStates(def, palette),
        };
        out.push(
          strata === undefined
            ? base
            : makePlacement({
                node,
                entry: chosen,
                def,
                stream: scatter,
                programStream,
                x,
                z,
                baseY: base.baseY,
                height: base.height,
                radiusDelta,
                mega,
                stratum: "canopy",
                palette,
                ...(bias === undefined || bias.ageShift === 0 ? {} : { ageShift: bias.ageShift }),
              }),
        );
      }
    }
  }
}


/* -------------------------------------------------------------------------- */
/* The `character.flora` bias (FLORA-GRAMMAR-v0 §6)                            */
/* -------------------------------------------------------------------------- */

/**
 * Apply the bias to a node's resolved params.
 *
 * Two numbers move and no more: the canopy's density (`sparse`) and the
 * undergrowth's deadwood share (`deadwood`). Both are returned as a *new*
 * object only when the bias is live, so a neutral bias hands back the very
 * object it was given and the placement path is unchanged by identity as well
 * as by value.
 */
function biasParams(
  params: ReturnType<typeof resolveForestParams>,
  bias: FloraBias | undefined,
): ReturnType<typeof resolveForestParams> {
  if (isNeutralFlora(bias) || bias === undefined) return params;
  if (bias.canopyDensity === 1 && bias.deadwood === 1) return params;
  return {
    ...params,
    density: clamp01(params.density * bias.canopyDensity),
    undergrowth: {
      ...params.undergrowth,
      deadwood: clamp01(params.undergrowth.deadwood * bias.deadwood),
    },
  };
}

/**
 * Apply the bias to a node's composition.
 *
 * The keywords that switch a stratum on have to be able to do so for a node
 * that declared no `strata` at all — "an ancient mossy old-growth forest" is a
 * prompt, not a document — so this may *create* a composition where
 * {@link resolveStrata} returned `undefined`. It never switches one off, and it
 * never overrides a floor the author wrote: an explicit `strata` outranks a
 * word, which is the same precedence every other intent row has.
 */
function biasStrata(
  strata: ResolvedStrata | undefined,
  bias: FloraBias | undefined,
): ResolvedStrata | undefined {
  if (isNeutralFlora(bias) || bias === undefined) return strata;
  const wants = bias.emergent || bias.understory > 0 || bias.floor !== undefined;
  if (!wants && strata === undefined) return undefined;
  const base: ResolvedStrata = strata ?? { canopy: "authored", floor: "default" };
  const understory =
    bias.understory > 0 && !stratumLive(base.understory)
      ? ({ density: UNDERSTORY_SHARE * bias.understory } as StratumSpec)
      : base.understory;
  return {
    ...base,
    ...(bias.emergent && !stratumLive(base.emergent) ? { emergent: "default" as StratumSpec } : {}),
    ...(understory === undefined ? {} : { understory }),
    floor: base.floor === "default" ? (bias.floor ?? "default") : base.floor,
  };
}

/**
 * Apply the bias to one stratum's species list.
 *
 * Three moves, in the order §6.2 gives them: `forbid` removes, `weights`
 * multiplies, and `admit` appends a species the table never named — but only
 * into the stratum the *catalog* says it belongs to, so preferring a giant does
 * not put one in the understory.
 */
function biasSpecies(
  species: readonly ForestSpecies[],
  stratum: "emergent" | "canopy" | "understory",
  bias: FloraBias | undefined,
): readonly ForestSpecies[] {
  if (isNeutralFlora(bias) || bias === undefined) return species;
  const out: ForestSpecies[] = [];
  const present = new Set<string>();
  for (const entry of species) {
    if (bias.forbid.includes(entry.shape)) continue;
    present.add(entry.shape);
    const factor = bias.weights[entry.shape];
    out.push(factor === undefined ? entry : { ...entry, weight: (entry.weight ?? 1) * factor });
  }
  for (const id of bias.admit) {
    if (present.has(id)) continue;
    const def = FLORA_SPECIES[id];
    if (def === undefined || (def.stratum ?? "canopy") !== stratum) continue;
    out.push({
      id,
      shape: id as FloraSpeciesId,
      ...(bias.weights[id] === undefined ? {} : { weight: bias.weights[id] as number }),
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Strata composition (FLORA-GRAMMAR-v0 §5)                                    */
/* -------------------------------------------------------------------------- */

/**
 * One emergent per this many blocks square of eligible ground.
 *
 * 128 before 2026-08-07, which gave §7.1's 170-radius old-growth wood a budget
 * of 2 (and the fixture wrote 3 by hand). Kai walked it and reported *"not a
 * single growth meaningfully more grand than vanilla"* — three landmarks in a
 * 340-block-wide wood is a fly-over that meets none of them. 80 puts a giant in every 80×80 of
 * *eligible* ground — which on §7.1's wood (36,864 eligible columns of a
 * 90,000-column circle, once slope, elevation and the edge taper have had
 * their say) is 6, against 2,800 canopy trees. Still one tree in 470; but a
 * fly-over meets one every ~120 blocks instead of every ~200.
 */
export const EMERGENT_AREA = 80;
/**
 * Upper bound on a single node's emergent budget, however large the node.
 *
 * The clamp exists so a `{all: true}` region fill cannot turn into a plantation.
 * At 512² that fill now asks for 28 and gets 18 — one giant per ~120 blocks of
 * world, which `EMERGENT_EXCLUSION` can still satisfy comfortably.
 */
export const EMERGENT_MAX = 18;
/**
 * A deliberate wood gets a landmark even when the area formula rounds to zero.
 *
 * The floor is one emergent for any node with at least {@link EMERGENT_FLOOR_AREA}
 * eligible columns — an author who wrote a wood and switched the stratum on
 * asked for a landmark, and "your patch rounded to nothing" is exactly the
 * silent decline DESIGN.md's first failure mode is about.
 */
export const EMERGENT_MIN = 1;
/** Eligible columns a node needs before {@link EMERGENT_MIN} applies (a ~27-radius patch). */
export const EMERGENT_FLOOR_AREA = 2304;
/**
 * Minimum trunk-to-trunk distance between two emergents.
 *
 * Held at 48 through the 2026-08-07 budget raise, deliberately: the budget is
 * an upper bound and this is the *geometry*, so raising the budget cannot
 * crowd giants together — it can only fill the room the exclusion radius
 * leaves. A landmark that has a neighbour 20 blocks away is not a landmark.
 */
export const EMERGENT_EXCLUSION = 48;
/** Understory density as a share of the node's own `density`. */
export const UNDERSTORY_SHARE = 0.45;
/** How much broken light raises an understory tree's acceptance. */
export const UNDERSTORY_SHADE_GAIN = 0.8;
/**
 * The highest block a plant may reach (§9.2).
 *
 * `bucketTrees` silently drops anything above y = 319, which would take a
 * giant's crown off and leave law 1 violated after the fact, by the emitter,
 * invisibly. Four blocks of margin below the build limit is the clamp's target.
 */
export const FLORA_CEILING = 319 - 4;

/** A forest node's composition, every default filled in. */
export interface ResolvedStrata {
  readonly emergent?: StratumSpec;
  readonly understory?: StratumSpec;
  readonly canopy: "authored" | "default" | { readonly species: readonly ForestSpecies[] };
  readonly floor: "default" | "fungal" | "glow";
}

/**
 * Resolve `params.strata`.
 *
 * `strata: true` is the one-word form and means
 * `{ emergent: "default", understory: "default" }` — the form the kit teaches
 * first. Absent, this returns `undefined` and the node scatters exactly as it
 * does today, which is §2's reach law at the scatter level.
 */
export function resolveStrata(strata: true | StrataParams | undefined): ResolvedStrata | undefined {
  if (strata === undefined) return undefined;
  const s: StrataParams = strata === true ? { emergent: "default", understory: "default" } : strata;
  return {
    ...(s.emergent === undefined ? {} : { emergent: s.emergent }),
    ...(s.understory === undefined ? {} : { understory: s.understory }),
    canopy: s.canopy ?? "authored",
    floor: s.floor ?? "default",
  };
}

/** Whether a stratum is switched on at all. */
function stratumLive(spec: StratumSpec | undefined): boolean {
  return spec !== undefined && spec !== "none";
}

/** A stratum's numeric knob, or `undefined` when it was not written. */
function stratumNumber(spec: StratumSpec | undefined, key: "budget" | "exclusion" | "density"): number | undefined {
  if (spec === undefined || typeof spec === "string") return undefined;
  const value = spec[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * The climate theme nearest a `(temperature, humidity)` pair.
 *
 * The same nearest-centre rule the land-use biome clamp uses; ties break on
 * `CLIMATE_THEMES` declaration order.
 */
export function climateThemeAt(
  temperature: number,
  humidity: number,
  centers: Readonly<Record<string, readonly [number, number]>>,
  themes: readonly string[],
): string {
  let best = themes[0] as string;
  let bestD = Number.POSITIVE_INFINITY;
  for (const theme of themes) {
    const c = centers[theme] as readonly [number, number];
    const d = (temperature - c[0]) ** 2 + (humidity - c[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = theme;
    }
  }
  return best;
}

/** The per-column climate fields the strata pass reads (§5.2). */
export interface ClimateSample {
  readonly temperature: Float32Array;
  readonly humidity: Float32Array;
  readonly centers: Readonly<Record<string, readonly [number, number]>>;
  readonly themes: readonly string[];
}

/**
 * One theme per node, by ambient majority over its eligibility mask.
 *
 * Not per column, on purpose: a patch is a *place*, and a wood whose species
 * mix changes column by column across a climate gradient reads as noise.
 */
export function nodeClimateTheme(mask: Uint8Array, climate: ClimateSample | undefined): string {
  if (climate === undefined) return "temperate";
  const counts = new Map<string, number>();
  for (let k = 0; k < mask.length; k++) {
    if (mask[k] !== 1) continue;
    const theme = climateThemeAt(
      climate.temperature[k] as number,
      climate.humidity[k] as number,
      climate.centers,
      climate.themes,
    );
    counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  let best = "temperate";
  let bestN = -1;
  // Ties break on declaration order, which is why this walks the theme list
  // rather than the map's insertion order.
  for (const theme of climate.themes) {
    const n = counts.get(theme) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = theme;
    }
  }
  return bestN <= 0 ? "temperate" : best;
}

/** What one node's composition did, for the report (§5.3). */
export interface StrataReport {
  readonly node: string;
  readonly theme: string;
  readonly budget: number;
  readonly placed: number;
  /** Candidates the §9.2 build-limit clamp refused outright. */
  readonly refused: number;
  readonly understory: number;
}

/** The species list a stratum draws from. */
function stratumSpecies(
  spec: StratumSpec | undefined,
  theme: string,
  stratum: "emergent" | "canopy" | "understory",
  table: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>,
): readonly ForestSpecies[] {
  if (spec !== undefined && typeof spec !== "string" && spec.species !== undefined) {
    return spec.species;
  }
  const row = table[theme]?.[stratum] ?? [];
  return row.map((id) => ({ id, shape: id as FloraSpeciesId }));
}


/**
 * The optional part states a species declares, resolved from the palette.
 *
 * Shared by the plain placement path and by {@link makePlacement}, because a
 * species' parts are a property of the species and not of whether the node that
 * planted it declared `strata`.
 */
function partStates(
  def: FloraSpeciesDef,
  palette: Palette,
): {
  rootState?: number;
  deadState?: number;
  hangingState?: number;
  decoState?: number;
  stemState?: number;
  capState?: number;
} {
  const at = (symbol: string | undefined): number | undefined =>
    symbol === undefined ? undefined : palette.state(symbol);
  const root = at(def.rootSymbol);
  const dead = at(def.deadSymbol);
  const hanging = at(def.hangingSymbol);
  const deco = at(def.decoSymbol);
  const stem = at(def.stemSymbol);
  const cap = at(def.capSymbol);
  return {
    ...(root === undefined ? {} : { rootState: root }),
    ...(dead === undefined ? {} : { deadState: dead }),
    ...(hanging === undefined ? {} : { hangingState: hanging }),
    ...(deco === undefined ? {} : { decoState: deco }),
    ...(stem === undefined ? {} : { stemState: stem }),
    ...(cap === undefined ? {} : { capState: cap }),
  };
}

/**
 * Fill in one placement's variation, program seed and part states.
 *
 * Every draw here is position-keyed on the trunk column (§3.1), so two trees at
 * the same column agree however the region was traversed — and so introducing a
 * draw for a new species cannot shift a draw an old one makes.
 */
function makePlacement(args: {
  node: ForestNodeInput;
  entry: ForestSpecies;
  def: FloraSpeciesDef;
  stream: Seed256;
  programStream: Seed256;
  x: number;
  z: number;
  baseY: number;
  height: number;
  radiusDelta: number;
  mega: boolean;
  stratum: "emergent" | "canopy" | "understory";
  palette: Palette;
  /** §6's `ancient` / `deadwood` keywords: the `age` envelope shifted up. */
  ageShift?: number;
}): TreePlacement {
  const { entry, def, stream, programStream, x, z, palette } = args;
  const optional = (symbol: string | undefined): { state: number } | undefined =>
    symbol === undefined ? undefined : { state: palette.state(symbol) };
  const root = optional(def.rootSymbol);
  const dead = optional(def.deadSymbol);
  const hanging = optional(def.hangingSymbol);
  const deco = optional(def.decoSymbol);
  const stem = optional(def.stemSymbol);
  const cap = optional(def.capSymbol);
  const age =
    def.age === undefined
      ? undefined
      : Math.min(
          1,
          def.age[0] +
            positionFloat(stream, x, 8, z) * (def.age[1] - def.age[0]) +
            (args.ageShift ?? 0),
        );
  const theta = 2 * Math.PI * positionFloat(stream, x, 9, z);
  return {
    nodeId: args.node.id,
    speciesId: entry.id,
    shape: entry.shape,
    x,
    z,
    baseY: args.baseY,
    height: args.height,
    radiusDelta: args.radiusDelta,
    mega: args.mega,
    stratum: args.stratum,
    programSeed: positionDigest(programStream, x, 0, z),
    trunkState: palette.state(entry.trunkPalette ?? def.trunkSymbol),
    leafState: palette.state(entry.leafPalette ?? def.leafSymbol),
    ...(def.program === "ancient" ? { lean: { x: Math.cos(theta), z: Math.sin(theta) } } : {}),
    ...(age === undefined ? {} : { age }),
    ...(root === undefined ? {} : { rootState: root.state }),
    ...(dead === undefined ? {} : { deadState: dead.state }),
    ...(hanging === undefined ? {} : { hangingState: hanging.state }),
    ...(deco === undefined ? {} : { decoState: deco.state }),
    ...(stem === undefined ? {} : { stemState: stem.state }),
    ...(cap === undefined ? {} : { capState: cap.state }),
  };
}

/**
 * The emergent stratum: rare, landmark-like, placed **first**.
 *
 * The budget is area-scaled and the exclusion radius is large, so emergents
 * anchor the skyline the way the prominence field anchors a town's. A candidate
 * that fails either occupancy mask is skipped, not retried elsewhere: the
 * budget is an upper bound, and a patch too small or too broken to hold it
 * reports `placed < budget` rather than forcing trees into bad ground.
 *
 * Candidates are ranked by a position-keyed score rather than accepted in
 * row-major order. §5.3's literal reading (first-fit over the jittered grid)
 * spends the whole budget in the region's first two rows of cells — one
 * emergent per 128² is a *density*, not a preference for the north-west corner
 * — and a score-ranked greedy pass is equally deterministic and equally
 * traversal-independent.
 */
function scatterEmergent(
  node: ForestNodeInput,
  params: ReturnType<typeof resolveForestParams>,
  spec: StratumSpec | undefined,
  species: readonly ForestSpecies[],
  plan: ColumnPlan,
  mask: Uint8Array,
  occupancy: Uint8Array,
  palette: Palette,
  out: TreePlacement[],
  clearing: Float32Array | undefined,
  bias?: FloraBias,
): { budget: number; placed: number; refused: number } {
  const { region, ground } = plan;
  let area = 0;
  for (let k = 0; k < mask.length; k++) if (mask[k] === 1) area += 1;
  const budget =
    stratumNumber(spec, "budget") ??
    Math.max(
      0,
      Math.min(
        EMERGENT_MAX,
        Math.max(
          Math.round(area / (EMERGENT_AREA * EMERGENT_AREA)),
          area >= EMERGENT_FLOOR_AREA ? EMERGENT_MIN : 0,
        ),
      ),
    );
  const exclusion = Math.max(1, Math.round(stratumNumber(spec, "exclusion") ?? EMERGENT_EXCLUSION));
  if (budget <= 0 || species.length === 0) return { budget, placed: 0, refused: 0 };

  const stream = streamSeed(node.seed, "scatter.emergent");
  const programStream = streamSeed(node.seed, "flora.program");
  const weights = species.map((s) => s.weight ?? 1);
  const spacing = Math.max(1, Math.floor(params.spacing));
  const cellsX = Math.ceil(region.width / exclusion);
  const cellsZ = Math.ceil(region.depth / exclusion);

  const candidates: { x: number; z: number; idx: number; score: number }[] = [];
  for (let cz = 0; cz < cellsZ; cz++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const jx = positionFloat(stream, cx, 1, cz);
      const jz = positionFloat(stream, cx, 2, cz);
      const x = region.x0 + Math.min(region.width - 1, Math.floor(cx * exclusion + jx * exclusion));
      const z = region.z0 + Math.min(region.depth - 1, Math.floor(cz * exclusion + jz * exclusion));
      const idx = (z - region.z0) * region.width + (x - region.x0);
      if (mask[idx] !== 1) continue;
      if (clearing !== undefined && (clearing[idx] as number) <= 0) continue;
      candidates.push({ x, z, idx, score: positionFloat(stream, cx, 3, cz) });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.z - b.z || a.x - b.x);

  // A private mask, so emergents keep their distance from each other without
  // reserving that much ground against the canopy.
  const emergentOccupancy = new Uint8Array(region.width * region.depth);
  let placed = 0;
  let refused = 0;
  // Budget *spent*, which is placements plus §9.6 snow-line refusals: a
  // candidate the ceiling turns down has still had its slot, so raising a snow
  // line thins the emergents rather than shuffling them downhill.
  let spent = 0;
  for (const c of candidates) {
    if (spent >= budget) break;
    if (emergentOccupancy[c.idx] === 1) continue;
    const entry = species[positionWeighted(stream, c.x, 4, c.z, weights)] as ForestSpecies;
    const def = speciesFor(entry.shape);
    const program = SHAPE_PROGRAMS[def.program as ShapeProgramId];
    const minH = entry.minHeight ?? def.height[0];
    const maxH = entry.maxHeight ?? def.height[1];
    const lo = Math.min(minH, maxH);
    const hi = Math.max(minH, maxH);
    let height = positionInt(stream, c.x, 5, c.z, lo, hi);
    const radiusDelta = positionInt(stream, c.x, 6, c.z, -1, 1);
    const baseY = (ground[c.idx] as number) + 1;
    // §9.2, ratified: clamp the height so the crown fits under the ceiling, and
    // refuse the tree outright if the clamp falls below the species minimum —
    // reported, never silently stunted.
    const headroom = knobCrownHeadroom(def);
    const allowed = FLORA_CEILING - baseY - headroom;
    if (allowed < lo) {
      refused += 1;
      continue;
    }
    if (height > allowed) height = allowed;
    const span = program.id === "giant" ? Math.max(1, giantTrunkSpan(def, height)) : 1;
    if (!claimTrunk(region, occupancy, c.x, c.z, spacing + span - 1, span > 1)) continue;
    paint(region, emergentOccupancy, c.x, c.z, exclusion);
    // §9.6: the ceiling refuses the landmark, and the refusal is reported
    // rather than silently retried lower down — the budget and the exclusion
    // stamp are spent, so the emergents below the line stand exactly where they
    // stood before the line was written.
    if (!speciesStands(entry, params, ground[c.idx] as number)) {
      refused += 1;
      spent += 1;
      continue;
    }
    out.push(
      makePlacement({
        node,
        entry,
        def,
        stream,
        programStream,
        x: c.x,
        z: c.z,
        baseY,
        height,
        radiusDelta,
        mega: false,
        stratum: "emergent",
        palette,
        ...(bias === undefined || bias.ageShift === 0 ? {} : { ageShift: bias.ageShift }),
      }),
    );
    placed += 1;
    spent += 1;
  }
  return { budget, placed, refused };
}

/** How far above `height` a species' crown reaches, in blocks. */
function knobCrownHeadroom(def: FloraSpeciesDef): number {
  // `giant` runs its leader `leader` blocks past the trunk, hangs an upper
  // whorl off it and then closes the dome with a crown mass; every other
  // program tops out within its own mass radius. The number has to track the
  // geometry: §9.2's clamp is the only thing between a high-seated giant and a
  // crown the emitter silently drops above y = 319.
  const crown = typeof def.knobs?.["crown"] === "number" ? (def.knobs["crown"] as number) : 4;
  const mass = typeof def.knobs?.["mass"] === "number" ? (def.knobs["mass"] as number) : 3;
  const leader = typeof def.knobs?.["leader"] === "number" ? (def.knobs["leader"] as number) : 3;
  return def.program === "giant"
    ? leader + Math.round((crown + 1) * 0.7) + 2
    : Math.round(mass + 2);
}

/** A giant's trunk span for a given height (§3.7). */
function giantTrunkSpan(def: FloraSpeciesDef, height: number): number {
  const base = typeof def.knobs?.["trunkSpan"] === "number" ? (def.knobs["trunkSpan"] as number) : 2;
  return height >= 24 ? Math.max(base, 3) : base;
}

/** Paint a disc of radius `r` into a mask. */
/** Paint a Chebyshev square of radius `r` — the species-clearance stamp (§3.5). */
function paintSquare(region: Region, mask: Uint8Array, x: number, z: number, r: number): void {
  const i = x - region.x0;
  const j = z - region.z0;
  const ri = Math.floor(r);
  for (let dj = -ri; dj <= ri; dj++) {
    const jj = j + dj;
    if (jj < 0 || jj >= region.depth) continue;
    for (let di = -ri; di <= ri; di++) {
      const ii = i + di;
      if (ii < 0 || ii >= region.width) continue;
      mask[jj * region.width + ii] = 1;
    }
  }
}

function paint(region: Region, mask: Uint8Array, x: number, z: number, r: number): void {
  const i = x - region.x0;
  const j = z - region.z0;
  const ri = Math.ceil(r);
  for (let dj = -ri; dj <= ri; dj++) {
    const jj = j + dj;
    if (jj < 0 || jj >= region.depth) continue;
    for (let di = -ri; di <= ri; di++) {
      const ii = i + di;
      if (ii < 0 || ii >= region.width) continue;
      if (di * di + dj * dj > r * r) continue;
      mask[jj * region.width + ii] = 1;
    }
  }
}

/**
 * The understory: small trees and shrubs, in canopy gaps and *under* the
 * canopy of giants.
 *
 * Occupancy is checked against the trunk, never the canopy — that has been true
 * since the "dotted speckle" fix — so an understory tree under a giant's crown
 * is legal by construction. Rather than merely permitting it, this pass
 * **prefers** it: acceptance scales with the shade overhead, which puts the
 * shrubs where the light is broken and the ground looks bare from a standing
 * eye, and leaves the open glades open.
 */
function scatterUnderstory(
  node: ForestNodeInput,
  params: ReturnType<typeof resolveForestParams>,
  spec: StratumSpec | undefined,
  species: readonly ForestSpecies[],
  plan: ColumnPlan,
  mask: Uint8Array,
  occupancy: Uint8Array,
  shade: Uint8Array,
  palette: Palette,
  out: TreePlacement[],
  clearing: Float32Array | undefined,
  bias?: FloraBias,
): number {
  const { region, ground } = plan;
  const density = stratumNumber(spec, "density") ?? UNDERSTORY_SHARE * params.density;
  if (density <= 0 || species.length === 0) return 0;
  const stream = streamSeed(node.seed, "scatter.understory");
  const programStream = streamSeed(node.seed, "flora.program");
  const clumpSeed = seed32(streamSeed(node.seed, "scatter.clump"));
  const areaWobbleSeed = seed32(streamSeed(node.seed, "scatter.area-edge"));
  const weights = species.map((s) => s.weight ?? 1);
  const spacing = Math.max(1, Math.floor(params.spacing));
  const cellsX = Math.ceil(region.width / spacing);
  const cellsZ = Math.ceil(region.depth / spacing);
  const wanted = density * spacing * spacing;
  let placed = 0;

  for (let cz = 0; cz < cellsZ; cz++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const jx = positionFloat(stream, cx, 1, cz);
      const jz = positionFloat(stream, cx, 2, cz);
      const x = region.x0 + Math.min(region.width - 1, Math.floor(cx * spacing + jx * spacing));
      const z = region.z0 + Math.min(region.depth - 1, Math.floor(cz * spacing + jz * spacing));
      const idx = (z - region.z0) * region.width + (x - region.x0);
      if (mask[idx] !== 1) continue;

      let p = clamp01(wanted);
      if (params.clumping > 0) {
        const n = fbm2(clumpSeed, x, z, { octaves: 2, frequency: 0.02, lacunarity: 2, gain: 0.5 });
        p *= 1 - params.clumping + params.clumping * 2 * clamp01(0.5 + 0.5 * n);
      }
      p *= edgeTaper(region, x, z, params.edgeFalloff);
      p *= areaTaper(region, params.area, x, z, params.edgeFalloff, areaWobbleSeed);
      if (clearing !== undefined) {
        const f = clearing[idx] as number;
        if (f <= 0) continue;
        p *= f;
      }
      p *= 1 + UNDERSTORY_SHADE_GAIN * Math.min(1, (shade[idx] as number) / 2);
      if (columnFloat(stream, x, z, 3) >= p) continue;

      const entry = species[positionWeighted(stream, x, 4, z, weights)] as ForestSpecies;
      const def = speciesFor(entry.shape);
      const minH = entry.minHeight ?? def.height[0];
      const maxH = entry.maxHeight ?? def.height[1];
      const height = positionInt(stream, x, 5, z, Math.min(minH, maxH), Math.max(minH, maxH));
      const radiusDelta = positionInt(stream, x, 6, z, -1, 1);
      if (!claimTrunk(region, occupancy, x, z, spacing, false)) continue;
      // §9.6, after the claim for the same reason the canopy pass is.
      if (!speciesStands(entry, params, ground[idx] as number)) continue;
      out.push(
        makePlacement({
          node,
          entry,
          def,
          stream,
          programStream,
          x,
          z,
          baseY: (ground[idx] as number) + 1,
          height,
          radiusDelta,
          mega: false,
          stratum: "understory",
          palette,
          ...(bias === undefined || bias.ageShift === 0 ? {} : { ageShift: bias.ageShift }),
        }),
      );
      placed += 1;
    }
  }
  return placed;
}

/* -------------------------------------------------------------------------- */

/**
 * Density taper within `falloff` blocks of the *node's own area* boundary.
 *
 * `areaTest` is a hard predicate — inside or out — and on its own it gives an
 * `area: { zone: ... }` forest a boundary you can measure with a ruler: the
 * first village compile had a birch wood that stopped dead along a straight
 * line. `edgeFalloff` already existed and already meant "feather the edge"; it
 * simply had nothing but the region border to feather against. This is the same
 * ramp applied to the shape the author actually drew.
 */
/**
 * Peak wobble of a forest node's own area boundary, in blocks.
 *
 * Signed, so the edge bows out as readily as in — which is the whole point.
 * The first attempt perturbed the *taper* only, and only inward: the density
 * ramp bent, but the hard `areaTest` predicate behind it did not, so the last
 * trees still stopped along a ruled line and two independent render reviews
 * called the birch patch a rectangle. Wobbling the boundary itself, and using
 * the same signed offset for the predicate and the ramp, is what makes the two
 * agree and the patch edge read as a wood.
 *
 * ±6 blocks against the default 12-block feather is half the ramp: enough to
 * break every straight edge, not enough to detach a lobe of forest from the
 * patch it belongs to.
 */
export const AREA_EDGE_WOBBLE = 6;

/** Wavelength of that wobble, in blocks. */
const AREA_EDGE_WAVELENGTH = 30;

/** Two-octave low-frequency edge noise in `[-1, 1]`. */
function areaEdgeNoise(seed: number, x: number, z: number): number {
  const f = 1 / AREA_EDGE_WAVELENGTH;
  return (
    gradientNoise2(seed, x * f, z * f) * 0.75 +
    gradientNoise2(seed ^ 0x9e3779b9, x * f * 2.6, z * f * 2.6) * 0.25
  );
}

/**
 * How far inside its `area` a column lies, in blocks; negative outside it.
 *
 * The single source of truth for both the hard membership test and the density
 * taper, wobble included. `all` has no boundary, so it reports a distance no
 * feather can reach.
 */
function areaInset(region: Region, area: ScatterArea, x: number, z: number, wobbleSeed: number): number {
  if ("all" in area) return Number.POSITIVE_INFINITY;
  let inset: number;
  if ("zone" in area) {
    const token = (ZONE_TOKENS as readonly string[]).includes(area.zone) ? area.zone : "center";
    const [fx, fz] = ZONE_FRACTIONS[token] as readonly [number, number];
    const cx = region.x0 + fx * region.width;
    const cz = region.z0 + fz * region.depth;
    // A zone is one cell of the nine-grid, with a soft half-cell margin.
    inset = Math.min(region.width / 6 - Math.abs(x - cx), region.depth / 6 - Math.abs(z - cz));
  } else {
    const cx = region.x0 + area.at[0] * region.width;
    const cz = region.z0 + area.at[1] * region.depth;
    const d = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
    inset = area.radius - d;
  }
  if (wobbleSeed !== 0) inset += AREA_EDGE_WOBBLE * areaEdgeNoise(wobbleSeed, x, z);
  return inset;
}

function areaTaper(
  region: Region,
  area: ScatterArea,
  x: number,
  z: number,
  falloff: number,
  wobbleSeed = 0,
): number {
  if (falloff <= 0 || "all" in area) return 1;
  const inset = areaInset(region, area, x, z, wobbleSeed);
  return inset >= falloff ? 1 : clamp01(inset / falloff);
}

/** Density taper within `falloff` blocks of the region boundary. */
function edgeTaper(region: Region, x: number, z: number, falloff: number): number {
  if (falloff <= 0) return 1;
  const dx = Math.min(x - region.x0, region.x0 + region.width - 1 - x);
  const dz = Math.min(z - region.z0, region.z0 + region.depth - 1 - z);
  const d = Math.min(dx, dz);
  return d >= falloff ? 1 : clamp01(d / falloff);
}

/**
 * The trunk-exclusion radius for one species, which is `params.spacing` unless
 * the species asks for more.
 *
 * Added 2026-08-08 with the birch reproportion (FLORA-GRAMMAR §3.5). `spacing`
 * is a *node* parameter — one number for a whole forest — and it is the right
 * default, because a mixed forest wants its trunks on one lattice. But a
 * species whose crown is wider than that lattice fuses with its own neighbours:
 * at `spacing 3` half of all birches stood exactly three blocks from another
 * birch, so two five-wide crowns merged into a single mass over two bare white
 * poles. The floor is per-species and additive: a species without a
 * `minSpacing` knob claims exactly what it claimed before.
 */
function speciesSpacing(def: FloraSpeciesDef, spacing: number): number {
  return Math.max(spacing, knob(def, "minSpacing", 0));
}

/**
 * Claim a trunk position, honouring the Poisson minimum distance.
 *
 * `occupancy` holds the union of every placed trunk's exclusion disk, so the
 * test is one lookup and the invariant — no two trunks closer than `spacing` —
 * is exact rather than approximate. Canopies are deliberately not considered.
 */
export function claimTrunk(
  region: Region,
  occupancy: Uint8Array,
  x: number,
  z: number,
  spacing: number,
  mega: boolean,
): boolean {
  const i = x - region.x0;
  const j = z - region.z0;
  if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return false;
  if (occupancy[j * region.width + i] === 1) return false;
  // A mega spruce's second trunk column must be clear too.
  if (mega) {
    const i1 = i + 1;
    const j1 = j + 1;
    if (i1 >= region.width || j1 >= region.depth) return false;
    if (
      occupancy[j * region.width + i1] === 1 ||
      occupancy[j1 * region.width + i] === 1 ||
      occupancy[j1 * region.width + i1] === 1
    ) {
      return false;
    }
  }

  const r = Math.max(1, Math.ceil(spacing));
  const r2 = spacing * spacing;
  for (let dj = -r; dj <= r; dj++) {
    const jj = j + dj;
    if (jj < 0 || jj >= region.depth) continue;
    for (let di = -r; di <= r; di++) {
      const ii = i + di;
      if (ii < 0 || ii >= region.width) continue;
      // Strictly inside `spacing`: two trunks exactly `spacing` apart are legal,
      // which is what lets a saturating forest settle onto a tight lattice.
      if (di * di + dj * dj >= r2) continue;
      occupancy[jj * region.width + ii] = 1;
    }
  }
  return true;
}

/**
 * A predicate over world coordinates for a coarse `area`.
 *
 * The boundary carries the same wobble the taper does, so the patch's *last*
 * tree stands on a bent line rather than on the nine-grid's rectangle.
 */
function areaTest(
  region: Region,
  area: ScatterArea,
  wobbleSeed = 0,
): (x: number, z: number) => boolean {
  if ("all" in area) return () => true;
  return (x, z) => areaContains(region, area, x, z, wobbleSeed);
}

/** Whether `(x, z)` lies inside a coarse `area`, boundary wobble included. */
export function areaContains(
  region: Region,
  area: ScatterArea,
  x: number,
  z: number,
  wobbleSeed = 0,
): boolean {
  return areaInset(region, area, x, z, wobbleSeed) >= 0;
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One block of a generated tree, relative to the trunk base.
 *
 * Now an alias of the grammar's {@link FloraBlock}: the legacy programs emit
 * only `log` and `leaves`, and the emitter's two-part mapping still covers
 * them exactly.
 */
export type TreeBlock = FloraBlock;

/** A tree shape: trunk length range, default palette symbols, and geometry. */
export interface TreeTemplate {
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly trunkSymbol: string;
  readonly leafSymbol: string;
  /** Horizontal canopy radius for one tree's variation. */
  canopyRadius(v: TreeVariation): number;
  /** The blocks of one tree, trunk base at the origin. */
  blocks(v: TreeVariation): TreeBlock[];
}

/* -------------------------------------------------------------------------- */
/* One placement's geometry                                                    */
/* -------------------------------------------------------------------------- */

/** The variation record a placement carries into its shape program. */
export function treeVariation(tree: TreePlacement): FloraVariation {
  return {
    height: tree.height,
    radiusDelta: tree.radiusDelta,
    mega: tree.mega,
    ...(tree.lean === undefined ? {} : { lean: tree.lean }),
    ...(tree.age === undefined ? {} : { age: tree.age }),
  };
}

/**
 * One placement's blocks.
 *
 * The RNG is rebuilt from the placement's own `programSeed` on every call, so
 * `clipTrees`, the shade map and the emitter all see the identical plant — and
 * a placement with no seed (every document that declares no `strata`) reaches
 * only the two legacy programs, which never draw.
 */
export function treeBlocks(tree: TreePlacement): FloraBlock[] {
  const def = speciesFor(tree.shape);
  const program = SHAPE_PROGRAMS[def.program as ShapeProgramId];
  const rng =
    tree.programSeed === undefined
      ? (): number => {
          throw new Error(`flora: ${def.program} drew from the RNG with no program seed`);
        }
      : (() => {
          const r = new Rng(tree.programSeed);
          return (): number => r.float();
        })();
  return program.blocks(treeVariation(tree), def, rng);
}

/** One placement's horizontal reach. */
export function treeCanopyRadius(tree: TreePlacement): number {
  const def = speciesFor(tree.shape);
  return SHAPE_PROGRAMS[def.program as ShapeProgramId].canopyRadius(treeVariation(tree), def);
}

/**
 * Canopy columns overhead, per column — the shade map.
 *
 * Hoisted here from `decorate.ts` so the undergrowth pass and the understory
 * stratum share one answer (§5.4) rather than two that can drift apart.
 */
export function canopyCover(plan: ColumnPlan, trees: readonly TreePlacement[]): Uint8Array {
  const { region } = plan;
  const cover = new Uint8Array(region.width * region.depth);
  for (const tree of trees) {
    const r = treeCanopyRadius(tree);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const i = tree.x + dx - region.x0;
        const j = tree.z + dz - region.z0;
        if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
        const idx = j * region.width + i;
        if ((cover[idx] as number) < 255) cover[idx] = (cover[idx] as number) + 1;
      }
    }
  }
  return cover;
}

/** The part states one placement resolved, as the emitter's mapping wants them. */
export function treeStates(tree: TreePlacement): FloraStates {
  return {
    log: tree.trunkState,
    leaves: tree.leafState,
    ...(tree.deadState === undefined ? {} : { branch: tree.deadState }),
    ...(tree.rootState === undefined ? {} : { root: tree.rootState }),
    ...(tree.stemState === undefined ? {} : { stem: tree.stemState }),
    ...(tree.capState === undefined ? {} : { cap: tree.capState }),
    ...(tree.hangingState === undefined ? {} : { hanging: tree.hangingState }),
    ...(tree.decoState === undefined ? {} : { deco: tree.decoState }),
  };
}

/** The baseline variation: no jitter, no giant. */
export function plainVariation(height: number): TreeVariation {
  return { height, radiusDelta: 0, mega: false };
}

/**
 * The legacy geometry, now expressed through the flora grammar.
 *
 * `SHAPE_PROGRAMS.conifer` and `SHAPE_PROGRAMS.blob` are transcriptions of the
 * closures that used to live here, and `flora-identity.test.ts` holds them to
 * **list-identity** with those closures — the same array, element for element,
 * duplicates and order included, because `clipTrees` divides by
 * `blocks.length`. Neither program draws from its RNG, so passing a thrower is
 * both safe and a live assertion of that.
 */
function legacyBlocks(speciesId: keyof typeof LEGACY_FLORA_SPECIES) {
  const def = LEGACY_FLORA_SPECIES[speciesId] as FloraSpeciesDef;
  const program = SHAPE_PROGRAMS[def.program as ShapeProgramId];
  return (v: TreeVariation): TreeBlock[] =>
    program.blocks(v, def, () => {
      throw new Error(`flora: ${def.program} must not draw from the RNG`);
    }) as TreeBlock[];
}

/**
 * The canopy radius of a legacy shape, derived from its program rather than
 * repeated as a literal.
 *
 * The four literals this replaces were `max(1, spread + rd + (mega ? 2 : 0))`
 * and `max(1, radius + rd)` written out by hand — exactly what
 * `conifer.canopyRadius` and `blob.canopyRadius` compute from the same knobs,
 * so the reconciliation is behaviour-preserving by construction.
 */
function legacyRadius(speciesId: keyof typeof LEGACY_FLORA_SPECIES) {
  const def = LEGACY_FLORA_SPECIES[speciesId] as FloraSpeciesDef;
  const program = SHAPE_PROGRAMS[def.program as ShapeProgramId];
  return (v: TreeVariation): number => program.canopyRadius(v, def);
}

/** The four tree shapes the terrain profile implements. */
export const TREE_TEMPLATES: Readonly<Record<TreeShape, TreeTemplate>> = Object.freeze({
  spruce_tall: {
    minHeight: 8,
    maxHeight: 13,
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.spruce_leaves",
    canopyRadius: legacyRadius("spruce_tall"),
    blocks: legacyBlocks("spruce_tall"),
  },
  spruce_squat: {
    minHeight: 5,
    maxHeight: 7,
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.spruce_leaves",
    canopyRadius: legacyRadius("spruce_squat"),
    blocks: legacyBlocks("spruce_squat"),
  },
  oak_round: {
    minHeight: 5,
    maxHeight: 7,
    trunkSymbol: "wood.oak_log",
    leafSymbol: "wood.oak_leaves",
    canopyRadius: legacyRadius("oak_round"),
    blocks: legacyBlocks("oak_round"),
  },
  birch_slim: {
    minHeight: 6,
    maxHeight: 9,
    trunkSymbol: "wood.birch_log",
    leafSymbol: "wood.birch_leaves",
    canopyRadius: legacyRadius("birch_slim"),
    blocks: legacyBlocks("birch_slim"),
  },
});

/* -------------------------------------------------------------------------- */
/* Re-exports                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The grammar, re-exported so `vegetation.ts` stays the one import site every
 * existing consumer already uses (§3: "`vegetation.ts` keeps scatter and
 * eligibility and re-exports, so no existing importer changes").
 */
export {
  CLIMATE_STRATA,
  FLORA_SPECIES,
  NATURALISTIC_FLORA_SPECIES,
  NATURALISTIC_PROGRAMS,
  FUNGAL_FLORA_SPECIES,
  MAX_CAP_RADIUS,
  fungal,
  speciesFor,
  LEGACY_FLORA_SPECIES,
  LEAF_STATE_POLICY,
  MAX_LEAF_DISTANCE,
  SHAPE_PROGRAMS,
  emitFloraBlocks,
  leafDistances,
  knob,
  CANOPY_PARTS,
  WOOD_PARTS,
} from "./flora/index.js";
export type {
  EmittedFloraBlock,
  FloraBlock,
  FloraEmission,
  FloraPart,
  FloraProgram,
  FloraSpeciesDef,
  FloraStateCodec,
  FloraStates,
  FloraVariation,
  FloraVec2,
  LeafStatePolicy,
  ShapeProgramId,
} from "./flora/index.js";

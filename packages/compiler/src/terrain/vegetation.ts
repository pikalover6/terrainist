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
  SurfaceClass,
  clamp01,
  columnFloat,
  fbm2,
  gradientNoise2,
  positionFloat,
  positionInt,
  positionWeighted,
  seed32,
  streamSeed,
  type Classification,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";
import type { ForestParams, ForestSpecies, ScatterArea, TreeShape } from "@terrainist/spec";
import { ZONE_TOKENS } from "@terrainist/spec";

import {
  LEGACY_FLORA_SPECIES,
  SHAPE_PROGRAMS,
  type FloraBlock,
  type FloraSpeciesDef,
  type FloraVariation,
  type ShapeProgramId,
} from "./flora/index.js";
import type { ColumnPlan } from "./columns.js";
import { FluidKind } from "./columns.js";
import type { Palette } from "./palette.js";

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
  readonly shape: TreeShape;
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
> & { elevation: readonly [number, number]; area: ScatterArea; undergrowth: ResolvedUndergrowth } {
  return {
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
 * Build the eligibility mask of one forest node: 1 where a tree may stand.
 *
 * A column is eligible when it is soil (not cliff, beach, ocean floor or snow
 * cap), dry, gentle enough, inside the node's coarse `area`, and within the
 * elevation band relative to sea level.
 *
 * `structures` is the layout solver's occupancy grid, absent for terrain-profile
 * documents. Its union mask is excluded **unconditionally**: a footprint plus
 * its clearance is claimed ground, and a tree standing in it would grow through
 * a wall whatever the document's `avoidTags` say. `avoidTags` then excludes
 * further per-tag slices on top, which is how an author keeps an orchard out of
 * the market square without banning it from the whole settlement.
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
        if (structures.mask[idx] === 1) continue;
        let avoided = false;
        for (const tag of avoidTags) {
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
): ScatterResult {
  const { region } = plan;
  const coverage = new Uint8Array(region.width * region.depth);
  // Trunk exclusion zones already claimed, shared across nodes so a wilderness
  // fill cannot plant a trunk on top of a deliberate forest's tree.
  const occupancy = new Uint8Array(region.width * region.depth);
  const trees: TreePlacement[] = [];
  const perNode: Record<string, number> = {};
  const scattered: ScatteredNode[] = [];

  for (const node of nodes) {
    const params = resolveForestParams(node.params);
    const areaWobbleSeed = seed32(streamSeed(node.seed, "scatter.area-edge"));
    const mask = forestEligibility(
      plan,
      classification,
      params,
      structures,
      node.params.avoidTags ?? [],
      areaWobbleSeed,
    );
    // Coverage feeds the biome rule, so a fully cleared column must not report
    // as forested — a village green painted `forest` is exactly the wrong colour.
    for (let k = 0; k < coverage.length; k++) {
      if (mask[k] === 1 && (clearing === undefined || (clearing[k] as number) > 0)) coverage[k] = 1;
    }
    const before = trees.length;
    scatterOne(node, params, plan, mask, occupancy, palette, trees, clearing);
    perNode[node.id] = trees.length - before;
    scattered.push({ id: node.id, seed: node.seed, params, mask });
  }

  return { trees, coverage, perNode, nodes: scattered };
}

function scatterOne(
  node: ForestNodeInput,
  params: ReturnType<typeof resolveForestParams>,
  plan: ColumnPlan,
  mask: Uint8Array,
  occupancy: Uint8Array,
  palette: Palette,
  out: TreePlacement[],
  clearing: Float32Array | undefined,
): void {
  const { region, ground } = plan;
  const scatter = streamSeed(node.seed, "scatter");
  const clumpSeed = seed32(streamSeed(node.seed, "scatter.clump"));
  const areaWobbleSeed = seed32(streamSeed(node.seed, "scatter.area-edge"));
  const spacing = Math.max(1, Math.floor(params.spacing));
  const species = node.params.species;
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

  for (let cz = 0; cz < cellsZ; cz++) {
    for (let cx = 0; cx < cellsX; cx++) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        // Candidate position: cell origin plus a position-keyed jitter.
        const jx = positionFloat(scatter, cx, 1 + attempt * 2, cz);
        const jz = positionFloat(scatter, cx, 2 + attempt * 2, cz);
        const x = region.x0 + Math.min(region.width - 1, Math.floor(cx * spacing + jx * spacing));
        const z = region.z0 + Math.min(region.depth - 1, Math.floor(cz * spacing + jz * spacing));
        const idx = (z - region.z0) * region.width + (x - region.x0);
        if (mask[idx] !== 1) continue;

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

        const pick = positionWeighted(scatter, x, 4, z, weights);
        const chosen = species[pick] as ForestSpecies;
        const template = TREE_TEMPLATES[chosen.shape];
        const minH = chosen.minHeight ?? template.minHeight;
        const maxH = chosen.maxHeight ?? template.maxHeight;
        // Per-tree variety, all position-keyed: height inside the species range, a
        // canopy a block wider or narrower, and the occasional giant.
        const height = positionInt(scatter, x, 5, z, Math.min(minH, maxH), Math.max(minH, maxH));
        const radiusDelta = positionInt(scatter, x, 6, z, -1, 1);
        const mega =
          chosen.shape === "spruce_tall" && positionFloat(scatter, x, 7, z) < MEGA_SPRUCE_SHARE;

        // Only the trunk is exclusive; a mega spruce occupies 2×2, so it claims
        // one more block of clearance.
        if (!claimTrunk(region, occupancy, x, z, spacing + (mega ? 1 : 0), mega)) continue;

        out.push({
          nodeId: node.id,
          speciesId: chosen.id,
          shape: chosen.shape,
          x,
          z,
          baseY: (ground[idx] as number) + 1,
          height: mega ? height + 4 : height,
          radiusDelta,
          mega,
          trunkState: palette.state(chosen.trunkPalette ?? template.trunkSymbol),
          leafState: palette.state(chosen.leafPalette ?? template.leafSymbol),
        });
      }
    }
  }
}

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

/** The four tree shapes the terrain profile implements. */
export const TREE_TEMPLATES: Readonly<Record<TreeShape, TreeTemplate>> = Object.freeze({
  spruce_tall: {
    minHeight: 8,
    maxHeight: 13,
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.spruce_leaves",
    canopyRadius: (v) => Math.max(1, 2 + v.radiusDelta + (v.mega ? 2 : 0)),
    blocks: legacyBlocks("spruce_tall"),
  },
  spruce_squat: {
    minHeight: 5,
    maxHeight: 7,
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.spruce_leaves",
    canopyRadius: (v) => Math.max(1, 3 + v.radiusDelta),
    blocks: legacyBlocks("spruce_squat"),
  },
  oak_round: {
    minHeight: 5,
    maxHeight: 7,
    trunkSymbol: "wood.oak_log",
    leafSymbol: "wood.oak_leaves",
    canopyRadius: (v) => Math.max(1, 2 + v.radiusDelta),
    blocks: legacyBlocks("oak_round"),
  },
  birch_slim: {
    minHeight: 6,
    maxHeight: 9,
    trunkSymbol: "wood.birch_log",
    leafSymbol: "wood.birch_leaves",
    canopyRadius: (v) => Math.max(1, 2 + v.radiusDelta),
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

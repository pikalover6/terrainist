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
import { ZONE_TOKENS } from "@terrainist/spec";

import {
  LEGACY_FLORA_SPECIES,
  SHAPE_PROGRAMS,
  CLIMATE_STRATA,
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
import { chebyshevDistance, featherWeight } from "./landuse.js";
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
 * The undergrowth's survival weight per column: 0 on claimed ground, ramping
 * to 1 over {@link UNDERGROWTH_FEATHER} columns of natural ground beyond it.
 *
 * A weight, not a decision: the caller turns it into one with a position-keyed
 * hash, so the thinning is a pure function of the column. No RNG, no traversal
 * order, no wall clock — recompiling the same document thins the same columns.
 *
 * The ramp is `landuse.ts`'s smoothstep, run the other way up: `featherWeight`
 * answers "how much does the claimed side still apply here", and what survives
 * is one minus that.
 */
export function undergrowthFeather(
  structures: StructureOccupancy,
  width: number,
  depth: number,
  band: number = UNDERGROWTH_FEATHER,
): Float32Array {
  const weight = new Float32Array(width * depth);
  if (band <= 0) {
    weight.fill(1);
    for (let i = 0; i < weight.length; i++) if (structures.mask[i] === 1) weight[i] = 0;
    return weight;
  }
  const distance = chebyshevDistance(structures.mask, width, depth, band);
  for (let i = 0; i < weight.length; i++) {
    const d = distance[i] as number;
    // `chebyshevDistance` reports -1 past its cap: that ground is far enough
    // from anything claimed to be ambient.
    weight[i] = d < 0 ? 1 : d === 0 ? 0 : 1 - featherWeight(d, band);
  }
  return weight;
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
): ScatterResult {
  const { region } = plan;
  const coverage = new Uint8Array(region.width * region.depth);
  // Trunk exclusion zones already claimed, shared across nodes so a wilderness
  // fill cannot plant a trunk on top of a deliberate forest's tree.
  const occupancy = new Uint8Array(region.width * region.depth);
  const trees: TreePlacement[] = [];
  const perNode: Record<string, number> = {};
  const scattered: ScatteredNode[] = [];
  // One field for the whole compile: the undergrowth thins back in past claimed
  // ground the same way for every node, because it is a property of the
  // settlement's edge, not of any one wood.
  const feather =
    structures === undefined
      ? undefined
      : undergrowthFeather(structures, region.width, region.depth);
  const strataReports: StrataReport[] = [];

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
    const strata = resolveStrata(node.params.strata);
    // Strata run in a fixed order — emergent, canopy, understory — on three
    // named streams. Order matters only through the shared occupancy mask,
    // which is already order-dependent (row-major) today; naming the order in
    // one place is what keeps it deterministic.
    if (strata === undefined) {
      scatterOne(node, params, plan, mask, occupancy, palette, trees, clearing, false);
    } else {
      const theme = nodeClimateTheme(mask, climate);
      const emergentLive = stratumLive(strata.emergent);
      const emergentSpecies = emergentLive
        ? stratumSpecies(strata.emergent, theme, "emergent", CLIMATE_STRATA)
        : [];
      const emergent = emergentLive
        ? scatterEmergent(node, params, strata.emergent, emergentSpecies, plan, mask, occupancy, palette, trees, clearing)
        : { budget: 0, placed: 0, refused: 0 };
      // §5.5: with a live emergent stratum the mega-spruce draw is suppressed —
      // the budget has taken over the "rare and landmark-like" job, and a wood
      // with both would be the opposite of rare.
      const resolvedCanopy: ResolvedStrata =
        strata.canopy === "default"
          ? { ...strata, canopy: { species: stratumSpecies(undefined, theme, "canopy", CLIMATE_STRATA) } }
          : strata;
      scatterOne(node, params, plan, mask, occupancy, palette, trees, clearing, emergentLive, resolvedCanopy);
      let understory = 0;
      if (stratumLive(strata.understory)) {
        const shade = canopyCover(plan, trees.slice(before));
        understory = scatterUnderstory(
          node,
          params,
          strata.understory,
          stratumSpecies(strata.understory, theme, "understory", CLIMATE_STRATA),
          plan,
          mask,
          occupancy,
          shade,
          palette,
          trees,
          clearing,
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
    scattered.push({
      id: node.id,
      seed: node.seed,
      params,
      mask,
      ...(strata === undefined ? {} : { strata }),
      ...(feather === undefined ? {} : { feather }),
    });
  }

  return { trees, coverage, perNode, nodes: scattered, strata: strataReports };
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
  suppressMega: boolean,
  strata?: ResolvedStrata,
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
  const species =
    canopy === "authored"
      ? node.params.species
      : typeof canopy === "string"
        ? node.params.species
        : canopy.species;
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
        const def = speciesFor(chosen.shape);
        const minH = chosen.minHeight ?? def.height[0];
        const maxH = chosen.maxHeight ?? def.height[1];
        // Per-tree variety, all position-keyed: height inside the species range, a
        // canopy a block wider or narrower, and the occasional giant.
        const height = positionInt(scatter, x, 5, z, Math.min(minH, maxH), Math.max(minH, maxH));
        const radiusDelta = positionInt(scatter, x, 6, z, -1, 1);
        // §5.5: `MEGA_SPRUCE_SHARE` is data now. Same draw, same salt, same
        // constant, same trees — and suppressed outright when an emergent
        // stratum has taken over the landmark job.
        const mega =
          !suppressMega &&
          def.megaShare !== undefined &&
          positionFloat(scatter, x, 7, z) < def.megaShare;

        // Only the trunk is exclusive; a mega spruce occupies 2×2, so it claims
        // one more block of clearance.
        if (!claimTrunk(region, occupancy, x, z, spacing + (mega ? 1 : 0), mega)) continue;

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
              }),
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Strata composition (FLORA-GRAMMAR-v0 §5)                                    */
/* -------------------------------------------------------------------------- */

/** One emergent per this many blocks square of eligible ground. */
export const EMERGENT_AREA = 128;
/** Upper bound on a single node's emergent budget, however large the node. */
export const EMERGENT_MAX = 12;
/** Minimum trunk-to-trunk distance between two emergents. */
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
      : def.age[0] + positionFloat(stream, x, 8, z) * (def.age[1] - def.age[0]);
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
): { budget: number; placed: number; refused: number } {
  const { region, ground } = plan;
  let area = 0;
  for (let k = 0; k < mask.length; k++) if (mask[k] === 1) area += 1;
  const budget =
    stratumNumber(spec, "budget") ??
    Math.max(0, Math.min(EMERGENT_MAX, Math.round(area / (EMERGENT_AREA * EMERGENT_AREA))));
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
  for (const c of candidates) {
    if (placed >= budget) break;
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
      }),
    );
    placed += 1;
  }
  return { budget, placed, refused };
}

/** How far above `height` a species' crown reaches, in blocks. */
function knobCrownHeadroom(def: FloraSpeciesDef): number {
  // `giant` runs its leader two blocks past the trunk and then caps it with a
  // crown mass; every other program tops out within its own mass radius.
  const crown = typeof def.knobs?.["crown"] === "number" ? (def.knobs["crown"] as number) : 4;
  const mass = typeof def.knobs?.["mass"] === "number" ? (def.knobs["mass"] as number) : 3;
  return def.program === "giant" ? 2 + Math.round((crown + 1) * 0.6) + 1 : Math.round(mass + 2);
}

/** A giant's trunk span for a given height (§3.7). */
function giantTrunkSpan(def: FloraSpeciesDef, height: number): number {
  const base = typeof def.knobs?.["trunkSpan"] === "number" ? (def.knobs["trunkSpan"] as number) : 2;
  return height >= 24 ? Math.max(base, 3) : base;
}

/** Paint a disc of radius `r` into a mask. */
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

/**
 * Loam stdlib — curated, tested deterministic generators.
 *
 * G2a scope: the **field engine** — everything from deterministic math up to a
 * classified heightfield with markers, as pure functions with no IO. The
 * compiler (G2b) consumes this to materialize blocks.
 *
 * Module map:
 * - `determinism/` — §6 seed derivation, named RNG streams, position-keyed hashing
 * - `math/` — `ctx.math`, the pinned deterministic transcendentals
 * - `noise/` — gradient noise, fBm, ridged multifractal, warp, curve, erosion
 * - `field/` — the materialized heightfield and its `heightAt` sampler
 * - `edits/` — the eight `terrain.edit@0` kernels and their composition rule
 * - `classify/` — slope, surface classes, and markers
 * - `caves/` — `cave.carver@0`: seeded worm tunnels, chambers and entrances,
 *   expressed as per-column interior air spans (G5a)
 * - `structures/` — `building.grammar@0`: node-local voxel ops and their
 *   rotation, with no dependency on the block table (G4b)
 */

import { LOAM_VERSION } from "@terrainist/spec";

import {
  classify,
  computeOceanMask,
  type Classification,
  type MarkerOptions,
} from "./classify/index.js";
import { deriveNoiseSeeds } from "./noise/index.js";
import { nodeSeed, resolveWorldSeed } from "./determinism/index.js";
import {
  buildBaseField,
  resolveHeightfieldParamsForRegion,
  type HeightField,
  type HeightfieldParams,
  type Region,
} from "./field/index.js";
import {
  applyEdits,
  resolveOpenBasins,
  resolvePondChains,
  reportDryCarves,
  type DryCarveResult,
  type EditComposition,
  type PondChainResult,
  type TerrainEdit,
} from "./edits/index.js";

/** Loam version this stdlib build targets. */
export const STDLIB_TARGET_LOAM_VERSION: string = LOAM_VERSION;

export * from "./determinism/index.js";
export * from "./math/index.js";
export * from "./noise/index.js";
export * from "./field/index.js";
export * from "./edits/index.js";
export * from "./classify/index.js";
export * from "./caves/index.js";
export * from "./structures/index.js";

// ---------------------------------------------------------------------------
// The G2a pipeline entry point
// ---------------------------------------------------------------------------

/** Input to `buildTerrainField`. */
export interface TerrainFieldRequest {
  region: Region;
  /** `meta.worldSeed`, in any of the §6.1 accepted forms. */
  worldSeed: string | number | bigint;
  /** `nodePath` of the `terrain.heightfield@0` node, e.g. `"world.terrain"`. */
  nodePath: string;
  /** `seedSalt` of that node; the repair loop's reroll knob. Default `""`. */
  seedSalt?: string;
  /** `terrain.heightfield@0` params; every field defaults per §7.5. */
  params?: Partial<HeightfieldParams>;
  /** Child `terrain.edit@0` nodes, in document order. */
  edits?: readonly TerrainEdit[];
  /** Marker-extraction knobs. */
  markers?: MarkerOptions;
}

/** Everything G2b needs to materialize blocks. */
export interface TerrainFieldResult {
  field: HeightField;
  params: HeightfieldParams;
  classification: Classification;
  edits: EditComposition;
  /** One entry per river demoted to a pond chain; empty on a map with a sea. */
  ponds: PondChainResult[];
  /** One entry per carve that asked to flood and stayed dry (`LOAM-T113`). */
  dryCarves: DryCarveResult[];
  /** The resolved 64-bit world seed, for `level.dat`. */
  worldSeed: bigint;
}

/**
 * Build the master heightfield for a terrain-profile document, end to end:
 * base noise stack → erosion → raise edits → carve edits → classification and
 * markers. Pure: the same inputs always produce the same field, bit for bit.
 */
export function buildTerrainField(request: TerrainFieldRequest): TerrainFieldResult {
  const worldSeed = resolveWorldSeed(request.worldSeed);
  // Resolved *against the region*: `scaleReference`, when the document opts in,
  // is what stops the coastline from wandering off the moment the same world is
  // compiled at another size. Documents that omit it get their params verbatim.
  const params = resolveHeightfieldParamsForRegion(request.params, request.region);
  const node = nodeSeed(worldSeed, request.nodePath, request.seedSalt ?? "");
  const seeds = deriveNoiseSeeds(node);
  const field = buildBaseField({ region: request.region, params, seeds });
  const edits = applyEdits(field, request.edits ?? [], {
    region: request.region,
    worldSeed,
    parentPath: request.nodePath,
    seaLevel: params.seaLevel,
  });
  // A `water: true` basin whose rim leaks still holds water, just less of it.
  // Resolving that needs the finished field *and* the ocean fill (a basin the
  // sea already reaches is the sea's), so it happens between the two.
  const ocean = computeOceanMask(field, params.seaLevel, edits.noFlood);
  const sea = { seaLevel: params.seaLevel, oceanMask: ocean.mask };
  resolveOpenBasins(field, edits, sea);
  // A river that reaches no sea beads into ponds rather than compiling as a dry
  // trench. Same seam, same post-composition field, and it too only adds basins.
  const ponds = resolvePondChains(field, edits, sea);
  // Whatever is still dry after both water passes and asked not to be gets said
  // out loud, with a bearing to the water it missed.
  const dryCarves = reportDryCarves(field, edits, sea);
  // Classification reads the composition: hydrology needs the carves' `flooded`
  // declarations and the basin pools, and the snow rule needs the footprints.
  const classification = classify(field, params, {
    ...(request.markers ?? {}),
    noFlood: edits.noFlood,
    basins: edits.basins,
    footprints: edits.footprints,
  });
  return { field, params, classification, edits, ponds, dryCarves, worldSeed };
}

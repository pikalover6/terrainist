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
  resolveHeightfieldParams,
  type HeightField,
  type HeightfieldParams,
  type Region,
} from "./field/index.js";
import {
  applyEdits,
  resolveOpenBasins,
  type EditComposition,
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
  const params = resolveHeightfieldParams(request.params);
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
  resolveOpenBasins(field, edits, { seaLevel: params.seaLevel, oceanMask: ocean.mask });
  // Classification reads the composition: hydrology needs the carves' `flooded`
  // declarations and the basin pools, and the snow rule needs the footprints.
  const classification = classify(field, params, {
    ...(request.markers ?? {}),
    noFlood: edits.noFlood,
    basins: edits.basins,
    footprints: edits.footprints,
  });
  return { field, params, classification, edits, worldSeed };
}

/**
 * Slope-aware clustering for position-keyed material variation.
 *
 * Every material mix in this compiler is resolved by a **positional hash**, one
 * draw per column. On flat ground that is exactly right: the draws are
 * independent, the result reads as texture, and a street of patched asphalt or
 * a beach of drifting sand looks the way it should.
 *
 * On a *steep* face it is exactly wrong. A cliff, a gorge wall or a cut apron
 * is seen edge-on, so each column contributes a whole visible vertical facet
 * rather than one square of floor. Independent per-column draws there do not
 * read as texture — they read as **static**: a two-tone checker of stone and
 * andesite alternating column by column, which is what the first walk of the
 * headline world reported. A real rock face is one material with occasional
 * strata, never a dither.
 *
 * The fix is not to remove the variation but to **cluster** it. Steep columns
 * sample the same hash at a coarse lattice, so a run of adjacent columns draws
 * the same material and the variation arrives in connected patches several
 * blocks across. Two properties matter:
 *
 * - **Determinism is untouched.** This is a coordinate transform in front of
 *   the existing positional hash — no RNG, no wall clock, no traversal order.
 * - **Flat ground is untouched, bit for bit.** Below {@link STEEP_RELIEF} the
 *   sample coordinates are the column's own, so every existing flat-ground
 *   draw resolves exactly as it did before.
 */

import type { Region } from "@terrainist/stdlib";

/**
 * Local relief (in blocks, over a 3×3 neighbourhood) at which per-column
 * material variation stops reading as texture and starts reading as static.
 *
 * Two, which is a hair steeper than 1 : 1. A single one-block step between
 * adjacent columns is the commonest feature in gently rolling ground and in a
 * graded street, and clustering there would visibly change surfaces a player
 * has already accepted. Two blocks across one step is a face.
 */
const STEEP_RELIEF = 2;

/**
 * Edge of the sampling lattice used on steep ground, in columns.
 *
 * Five: inside the 4–8 window where patches are big enough to read as one
 * material yet small enough to still look like variation, and odd, so it does
 * not phase-lock with the 2- and 4-column rhythms roads and buildings use.
 */
export const CLUSTER_WAVELENGTH = 5;

/** Floor division that is correct for negative coordinates. */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** A column's own coordinates, or the ones it shares with its cluster. */
export interface SampleCell {
  readonly x: number;
  readonly z: number;
}

/**
 * The lattice representative of `(x, z)` — the column every member of the same
 * cluster samples its material hash at.
 */
export function clusterCell(
  x: number,
  z: number,
  wavelength: number = CLUSTER_WAVELENGTH,
): SampleCell {
  const w = wavelength < 1 ? 1 : wavelength;
  return { x: floorDiv(x, w) * w, z: floorDiv(z, w) * w };
}

/**
 * Greatest height difference between `(x, z)` and its eight neighbours.
 *
 * Columns outside the region are skipped rather than clamped: a border column
 * is not a cliff just because the world ends beside it.
 */
export function reliefAt(region: Region, ground: Int32Array, x: number, z: number): number {
  const i = x - region.x0;
  const j = z - region.z0;
  if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return 0;
  const y = ground[j * region.width + i] as number;
  let worst = 0;
  for (let dj = -1; dj <= 1; dj++) {
    const jj = j + dj;
    if (jj < 0 || jj >= region.depth) continue;
    for (let di = -1; di <= 1; di++) {
      const ii = i + di;
      if (ii < 0 || ii >= region.width) continue;
      const d = Math.abs((ground[jj * region.width + ii] as number) - y);
      if (d > worst) worst = d;
    }
  }
  return worst;
}

/** True when the ground at `(x, z)` is steep enough to dither. */
export function isSteepGround(region: Region, ground: Int32Array, x: number, z: number): boolean {
  return reliefAt(region, ground, x, z) >= STEEP_RELIEF;
}

/**
 * The coordinates a material draw at `(x, z)` should be keyed on.
 *
 * Identity on gentle ground; the cluster representative on a face. This is the
 * single call every material pass makes — see the module note for why.
 */
export function materialCell(
  region: Region,
  ground: Int32Array,
  x: number,
  z: number,
  wavelength: number = CLUSTER_WAVELENGTH,
): SampleCell {
  if (!isSteepGround(region, ground, x, z)) return { x, z };
  return clusterCell(x, z, wavelength);
}

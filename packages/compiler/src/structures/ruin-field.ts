/**
 * The ruin field — where the buildings actually fell (RUINS-PLAN-v0 §7.1).
 *
 * WP-3 rolls a district's infill lots into ruins by writing `params.decay` on
 * the lot's job; the shells that come back carry `meta.decay`, and that is the
 * only honest record of which ground is ruined ground. This module turns that
 * record into a **per-column scalar field** — the decayed shell's own intensity
 * over its footprint and its apron ring, falling linearly to zero over
 * {@link RUIN_FIELD_FALLOFF} columns — so that the three passes that dress the
 * ground can ask one question of one field instead of each re-deriving "is
 * there a ruin near here" from the building list.
 *
 * **The field is `undefined` when nothing ruined**, and that is the reach law
 * (§2) made structural rather than remembered: a document with no `decline`
 * builds no ruined shell, so there is no field, so every consumer takes the
 * branch it took before this feature existed and the world is byte-identical.
 *
 * Determinism: a max of linear ramps over integer Chebyshev distances. No
 * randomness, no traversal order — the field is a pure function of the built
 * list, and the built list is already positional.
 */

import type { Region } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";

import type { BuiltBuilding } from "./buildings.js";

/**
 * How far out from a ruined footprint the field holds its full value, in
 * columns — the apron ring the decay's own `spill` heaps into.
 */
export const RUIN_FIELD_APRON = 1;

/** How far past the apron the field falls linearly to zero, in columns. */
export const RUIN_FIELD_FALLOFF = 4;

/** One ruined lot, as the field sees it. */
export interface RuinedLot {
  readonly nodePath: string;
  readonly rect: Rect;
  /** The band's `intensity`, 0..1 — what `params.decay` asked for. */
  readonly intensity: number;
}

/** What {@link buildRuinField} produced. */
export interface RuinField {
  /** Row-major over the region, 0 where no ruin reaches. */
  readonly field: Float32Array;
  readonly lots: readonly RuinedLot[];
  /** Columns with a non-zero value. */
  readonly columns: number;
}

/**
 * How far gone one built shell is, or 0 when it is not a ruin.
 *
 * `meta.decay` is written only by the decay pass, and a **refused** lot is
 * re-built intact by `buildBuildings` — so a shell that carries the report is a
 * shell that shipped decayed, which is exactly the ground the yard treatment
 * wants. A `mode: "none"` shell still swept and heaped, so it still counts.
 */
export function ruinIntensityOf(
  built: BuiltBuilding,
  asked: ReadonlyMap<string, number>,
): number {
  // Two halves of one answer, and both are needed. `meta.decay` is the *record*
  // — present only on a shell the decay pass actually wrote over, and absent
  // again on a refused lot, which `buildBuildings` re-builds intact. The job's
  // own `params.decay` is the *dial*, which the resolved params do not carry.
  if (built.meta.decay === undefined) return 0;
  const dial = asked.get(built.nodePath);
  if (dial === undefined || dial <= 0) return 0;
  return dial > 1 ? 1 : dial;
}

/**
 * The per-column ruin field over a region, or `undefined` when nothing ruined.
 *
 * Clusters compose by `max`, not by sum: two ruins a few columns apart do not
 * make the ground between them twice as ruined, they make it as ruined as the
 * worse of the two.
 */
export function buildRuinField(
  region: Region,
  buildings: readonly BuiltBuilding[],
  asked: ReadonlyMap<string, number>,
): RuinField | undefined {
  const lots: RuinedLot[] = [];
  for (const built of buildings) {
    const intensity = ruinIntensityOf(built, asked);
    if (intensity <= 0) continue;
    lots.push({ nodePath: built.nodePath, rect: built.footprint, intensity });
  }
  if (lots.length === 0) return undefined;

  const field = new Float32Array(region.width * region.depth);
  const reach = RUIN_FIELD_APRON + RUIN_FIELD_FALLOFF;
  for (const lot of lots) {
    const i0 = Math.max(0, lot.rect.x0 - reach - region.x0);
    const i1 = Math.min(region.width - 1, lot.rect.x1 + reach - region.x0);
    const j0 = Math.max(0, lot.rect.z0 - reach - region.z0);
    const j1 = Math.min(region.depth - 1, lot.rect.z1 + reach - region.z0);
    for (let j = j0; j <= j1; j++) {
      const z = region.z0 + j;
      const dz = z < lot.rect.z0 ? lot.rect.z0 - z : z > lot.rect.z1 ? z - lot.rect.z1 : 0;
      for (let i = i0; i <= i1; i++) {
        const x = region.x0 + i;
        const dx = x < lot.rect.x0 ? lot.rect.x0 - x : x > lot.rect.x1 ? x - lot.rect.x1 : 0;
        const d = dx > dz ? dx : dz;
        if (d > reach) continue;
        const ramp = d <= RUIN_FIELD_APRON ? 1 : (reach - d) / RUIN_FIELD_FALLOFF;
        const value = lot.intensity * ramp;
        const idx = j * region.width + i;
        if (value > (field[idx] as number)) field[idx] = value;
      }
    }
  }

  let columns = 0;
  for (let k = 0; k < field.length; k++) if ((field[k] as number) > 0) columns++;
  return { field, lots, columns };
}

/** Sample a field at a world column, 0 outside the region. */
export function sampleField(region: Region, field: Float32Array, x: number, z: number): number {
  const i = x - region.x0;
  const j = z - region.z0;
  if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return 0;
  return field[j * region.width + i] as number;
}

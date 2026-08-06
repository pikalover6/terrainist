/**
 * The **canal pass** — the `canal` form's water, dug into the column plan.
 *
 * ## Where this runs, and why it is not negotiable
 *
 * **After `buildColumnPlan`, before `surfaceStreetGraph`**
 * (`docs/URBAN-FORMS-v0.md` §4.3). The street surfacer's `buildBridgeableMask`
 * reads `plan.fluidKind`, so the water has to exist before a bridge over it can
 * be priced; and every water-aware pass after it — the biome painting, the
 * land-use clamp, the scatter clip, the life pass, the props' shoreline probes
 * and three of the twenty-six physics rules — asks the same one question,
 * `plan.fluidKind`, and gets the same one answer. There is deliberately **no
 * second mask**: a canal is water in the plan, full stop, which is why nothing
 * downstream needed to learn what a canal is.
 *
 * It is the mirror image of what `precinct.harbour@0` already does when it
 * dredges (`surfaceColumn` writes `FluidKind.NONE`); this writes
 * `FluidKind.WATER` and cuts the shell beneath.
 *
 * ## The three bands
 *
 * {@link canalProfile} — the `SweptProfile` this pass is a client of. No new
 * geometry: `sweptColumns` walks the cross-section, `bandOfLane` says which
 * band a column is in, and `thickenCourse` gives the coping a continuous line
 * on a diagonal, exactly as the kerb and the wall course already do.
 *
 * - **`channel`** — `ground` cut to `surfaceY − depth`, `fluidTop = surfaceY`,
 *   `fluidKind = WATER`. Everything below `ground` is the terrain body, so the
 *   shell is stone by construction and there is nothing to leak through.
 * - **`coping`** — levelled to `surfaceY + 1`. **Exactly one course proud of
 *   the water**, which is simultaneously what `road.proud` measures, what makes
 *   the water stable (every 4-neighbour of a channel column has a solid top at
 *   or above the water line, so no fluid block has an exposed horizontal face),
 *   and what a player steps up onto out of the canal.
 * - **`quay`** — the sidewalk band, left to the streetscape to pave; this pass
 *   only guarantees no quay column is below its own canal.
 *
 * ## The closed pound
 *
 * A canal quarter with no open water within reach still gets canals — a canal
 * is *dug*, and a landlocked one is a closed pound, which is a real thing and
 * looks right. What the author gets is one note naming the measurement and the
 * fix. It is raised **here** rather than in the form because here is where "is
 * there open water near this quarter" can be measured on the finished column
 * plan, against the water the compiler actually made, instead of guessed from a
 * heightfield two passes earlier.
 */

import { warning, type LoamDiagnostic } from "@terrainist/spec";

import type { Rect } from "../layout/frames.js";
import type { StreetGraph } from "../layout/streets.js";
import type { FormChannel } from "../layout/forms/types.js";
import type { Palette } from "../terrain/palette.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import type { PrismarineStack } from "../emit/prismarine.js";
import type { GroundClaim } from "../layout/ground-contract.js";

import { CANAL_DEPTH, canalProfile } from "./profiles.js";
import { index, inside } from "./roads.js";
import { bandOfLane, profileSpan, sweptColumns, thickenCourse } from "./sweep.js";

/** How far open water may be and still be "within reach" of the quarter. */
export const CANAL_OPEN_WATER_REACH = 24;

/**
 * A quarter, as this pass reads one.
 *
 * Structurally a `DistrictProduct` — declared narrowly so the pass depends on
 * the four fields it actually reads and not on the whole fabric product.
 */
export interface CanalDistrict {
  readonly nodePath: string;
  readonly bounds: Rect;
  readonly streets: StreetGraph;
  readonly channels?: readonly FormChannel[];
}

/** Everything {@link digCanals} reads. */
export interface CanalPassInput {
  readonly districts: readonly CanalDistrict[];
  /** Mutated exactly as the road pass mutates it. */
  readonly plan: ColumnPlan;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
}

/** What the pass dug. */
export interface CanalPassResult {
  /** Columns turned to water. */
  readonly water: number;
  /** Bank columns levelled to the quay. */
  readonly banks: number;
  /** 1 on every column this pass turned to water, row-major over the region. */
  readonly channelMask: Uint8Array;
  readonly diagnostics: readonly LoamDiagnostic[];
  /**
   * What this pass would declare under the ground contract
   * (`docs/GROUND-CONTRACT-v0.md` §3.5b), recorded as it writes.
   *
   * A **return value only** — WP-2's shadow declarers turn it into
   * `GroundIntent`s (`structures/ground-declare.ts`) and nothing here reads it,
   * so the pass's behaviour is unmoved. It is recorded rather than recomputed
   * because the levels are only in hand while the pass is running: by the time
   * a declarer could look, five later passes have written the same columns.
   */
  readonly declaration: CanalDeclaration;
}

/** The raw material of §3.5b's two intents, in region-major column order. */
export interface CanalDeclaration {
  /** Channel columns at the bed, each carrying its water surface. */
  readonly channel: readonly GroundClaim[];
  /** Coping ∪ quay columns at the quay level. */
  readonly banks: readonly GroundClaim[];
}

/** The block states the pass writes. */
interface CanalStates {
  /** The channel bed. */
  readonly bed: number;
  readonly subsurface: number;
  readonly coping: number;
  readonly quay: number;
}

function resolveStates(palette: Palette, stack: PrismarineStack): CanalStates {
  const fallback = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const at = (symbol: string, name: string): number =>
    palette.has(symbol) ? palette.state(symbol) : fallback(name);
  return {
    bed: at("ground.stone", "minecraft:gravel"),
    subsurface: at("ground.stone", "minecraft:stone"),
    coping: at("street.curb", "minecraft:stone_bricks"),
    quay: at("street.sidewalk", "minecraft:smooth_stone"),
  };
}

/**
 * Dig every channel every quarter declared.
 *
 * Two phases, and the order is load-bearing: **every** channel column of
 * **every** quarter is claimed before a single one is written, so that a coping
 * column of one canal can never be dug out by a second canal that happens to
 * run beside it. Two canals a block apart is a bad plan, not a crash.
 */
export function digCanals(input: CanalPassInput): CanalPassResult {
  const { plan, districts } = input;
  const region = plan.region;
  const cells = region.width * region.depth;
  const channelMask = new Uint8Array(cells);

  const wanted = districts.filter((d) => (d.channels?.length ?? 0) > 0);
  // The ordinary path: no quarter asked for water, nothing is touched, and the
  // column plan is byte-for-byte the one every existing document compiles to.
  if (wanted.length === 0) {
    return {
      water: 0,
      banks: 0,
      channelMask,
      diagnostics: [],
      declaration: { channel: [], banks: [] },
    };
  }

  const states = resolveStates(input.palette, input.stack);
  const diagnostics: LoamDiagnostic[] = [];

  /** Water surface per channel column. */
  const surfaceOf = new Int32Array(cells);
  /** Bed level per channel column: `surfaceY − depth`. */
  const floorOf = new Int32Array(cells);
  /** Bank columns and the quay level each is held at. */
  const coping = new Uint8Array(cells);
  const quay = new Uint8Array(cells);
  const quayOf = new Int32Array(cells);

  for (const district of wanted) {
    const byId = new Map(district.streets.segments.map((s) => [s.id, s] as const));
    for (const channel of district.channels ?? []) {
      const segment = byId.get(channel.segment);
      // A declared channel whose segment is gone is a compiler bug in the form,
      // not an authoring error; skipping it silently would hide it, so it is
      // simply not possible to reach — the form emits one per segment it kept.
      if (segment === undefined) continue;
      const profile = canalProfile(segment.width, Math.max(1, district.streets.sidewalk));
      const depth = channel.depth > 0 ? channel.depth : CANAL_DEPTH;
      const quayY = channel.surfaceY + 1;
      for (const column of sweptColumns(region, segment.path, profileSpan(profile))) {
        const band = bandOfLane(profile, column.lane);
        if (band === 0) {
          channelMask[column.idx] = 1;
          surfaceOf[column.idx] = channel.surfaceY;
          floorOf[column.idx] = channel.surfaceY - depth;
          continue;
        }
        if (band === 1) coping[column.idx] = 1;
        else quay[column.idx] = 1;
        quayOf[column.idx] = Math.max(quayOf[column.idx] as number, quayY);
      }
    }
  }

  // A bank column another channel claimed is water; water wins, because the
  // alternative is a wall of coping standing in the middle of a canal.
  for (let k = 0; k < cells; k++) {
    if (channelMask[k] === 1) {
      coping[k] = 0;
      quay[k] = 0;
    }
  }

  // The coping is a *course*, and a course drawn along a diagonal by a lattice
  // walk is 8-connected — a chain of corner contacts with a gap in each. The
  // same fix the kerb and the wall course use: fill the corner outward.
  thickenCourse(
    region,
    coping,
    (idx) => channelMask[idx] === 0 && quay[idx] === 0,
    (idx, x, z) => {
      let touching = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!inside(region, x + dx, z + dz)) continue;
        if (channelMask[index(region, x + dx, z + dz)] === 1) touching++;
      }
      return touching;
    },
  );

  // --- the closure: every column the water touches holds it -----------------
  //
  // The swept profile draws a *cross-section*, so it covers the two flanks of a
  // run and nothing else: the columns off the **ends** of a run are whatever the
  // terrain left there. On flat ground that is the datum and the canal happens
  // to hold; on real ground it is the hillside the quarter sits on, and the
  // canal pours out of both ends — which is exactly the LOAM-T110 a canal
  // quarter shipped before this pass closed itself.
  //
  // So the containment is made structural rather than incidental: **every**
  // 4-neighbour of a channel column that does not already hold the water line
  // becomes coping. That is `checkFluidStability`'s own predicate, restated as a
  // construction, so the pass cannot leak by geometry it forgot to sweep — an
  // end cap, a bend the thickening missed, a trimmed stub. A neighbour that
  // already stands at or above the water surface is left entirely alone, which
  // is what keeps a canal dug beside open water open to it: the sea's own
  // columns hold the line and are never paved over.
  const walls: number[] = [];
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (channelMask[idx] !== 1) continue;
      const surface = surfaceOf[idx] as number;
      const x = region.x0 + i;
      const z = region.z0 + j;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (channelMask[n] === 1) continue;
        // Already a bank: it is levelled to its own quay, which is one proud of
        // its own canal. Two canals at different data meeting at one column is
        // the `max` below, not a special case.
        if (coping[n] === 1 || quay[n] === 1) {
          if ((quayOf[n] as number) < surface + 1) quayOf[n] = surface + 1;
          continue;
        }
        const standing = Math.max(plan.ground[n] as number, plan.fluidTop[n] as number);
        if (standing >= surface) continue;
        walls.push(n);
        if ((quayOf[n] as number) < surface + 1) quayOf[n] = surface + 1;
      }
    }
  }
  for (const n of walls) coping[n] = 1;

  // The note, measured *before* the water is written: "open water" means water
  // the compiler already had, not the canal we are about to dig.
  for (const district of wanted) {
    if (openWaterNear(plan, district.bounds, channelMask)) continue;
    diagnostics.push(
      warning(
        "DISTRICT_FORM",
        district.nodePath,
        `the canals in \`${district.nodePath}\` are a closed pound: no open water reaches within ${CANAL_OPEN_WATER_REACH} columns of this quarter, so they are cut to the quarter's own level rather than to the sea`,
        `move the quarter onto the shore with an "at" or "zone" constraint, or add a "river" terrain edit whose course reaches it, if the canals should open to open water`,
      ),
    );
  }

  let water = 0;
  let banks = 0;
  // §3.5b, recorded as the pass writes. Never read here.
  const declaredChannel: GroundClaim[] = [];
  const declaredBanks: GroundClaim[] = [];
  for (let k = 0; k < cells; k++) {
    if (channelMask[k] === 1) {
      const surface = surfaceOf[k] as number;
      const floor = floorOf[k] as number;
      declaredChannel.push({ idx: k, y: floor, fluid: { kind: FluidKind.WATER, top: surface } });
      plan.ground[k] = floor;
      plan.fluidTop[k] = surface;
      plan.fluidKind[k] = FluidKind.WATER;
      plan.surface[k] = states.bed;
      plan.subsurface[k] = states.subsurface;
      plan.soil[k] = 0;
      plan.snow[k] = 0;
      // Deliberately **not** a lake and **not** the ocean. Those two masks are
      // what the biome painter and the land-use clamp read to decide that a
      // column is a body of water in the landscape; a dug urban channel is a
      // street, and a quarter that turned into a river biome because somebody
      // asked for canals would be exactly the cross-pass defect §9 warns about.
      plan.lakeMask[k] = 0;
      plan.oceanMask[k] = 0;
      water++;
      continue;
    }
    if (coping[k] !== 1 && quay[k] !== 1) continue;
    const level = quayOf[k] as number;
    // Declared whether or not the bank is already there: an agreeing claim is
    // not a conflict (§5.3), and the "already at the quay" skip below is a
    // material decision, not a level one.
    declaredBanks.push({ idx: k, y: level });
    // A bank already at the quay is left entirely alone: its surface is the
    // district's, and repainting every quay column would overwrite the sidewalk
    // the streetscape is about to lay.
    if ((plan.ground[k] as number) === level && plan.fluidKind[k] === FluidKind.NONE) {
      if (coping[k] === 1) plan.surface[k] = states.coping;
      banks++;
      continue;
    }
    plan.ground[k] = level;
    plan.fluidTop[k] = level;
    plan.fluidKind[k] = FluidKind.NONE;
    plan.surface[k] = coping[k] === 1 ? states.coping : states.quay;
    plan.subsurface[k] = states.subsurface;
    plan.snow[k] = 0;
    plan.lakeMask[k] = 0;
    plan.oceanMask[k] = 0;
    banks++;
  }

  return {
    water,
    banks,
    channelMask,
    diagnostics,
    declaration: { channel: declaredChannel, banks: declaredBanks },
  };
}

/** Is there water the compiler already had within reach of this quarter? */
function openWaterNear(plan: ColumnPlan, bounds: Rect, dug: Uint8Array): boolean {
  const region = plan.region;
  const reach = CANAL_OPEN_WATER_REACH;
  for (let z = bounds.z0 - reach; z <= bounds.z1 + reach; z++) {
    for (let x = bounds.x0 - reach; x <= bounds.x1 + reach; x++) {
      if (!inside(region, x, z)) continue;
      const idx = index(region, x, z);
      if (dug[idx] === 1) continue;
      if (plan.fluidKind[idx] !== FluidKind.WATER) continue;
      // Chebyshev distance from the quarter's edge, the same measure
      // `GroundSample.waterReach` reports.
      const dx = Math.max(0, Math.max(bounds.x0 - x, x - bounds.x1));
      const dz = Math.max(0, Math.max(bounds.z0 - z, z - bounds.z1));
      if (Math.max(dx, dz) <= reach) return true;
    }
  }
  return false;
}

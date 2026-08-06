/**
 * The **retaining pass** — what stands between two levels of ground.
 *
 * `docs/COURTYARDS-AND-LEVELS-v0.md` §3.4. `layout/levels.ts` derives *where*
 * two platforms touch and how far apart they are; this builds the face.
 *
 * ## Where this runs, and why it is not negotiable
 *
 * **After the buildings, before the canals and the street surfacing** (§3.4,
 * §9.8). After the buildings, because a seam a building already stands on is
 * `treatment: "built"` — the building's own foundation skirt is the wall and
 * nothing else may be built there. Before the surfacing, because the surfacer
 * must see the finished ground and a wall must not be cut into by a street
 * drawn before it existed.
 *
 * A street on the seam is *not* one answer. A street that **crosses** a seam is
 * the connection between its two levels and a wall across it would be a wall
 * across a road, so the crossing stays open. A street that **runs along** one is
 * the thing the wall holds the ground above, and skipping it was the measured
 * 85%: see {@link RETAIN_FACE_SETBACK}.
 *
 * ## The wall is a sweep
 *
 * {@link RETAINING_PROFILE} is the fifth client of `SweptProfile`. The path
 * runs along the **lowest row of the upper platform**, so the datum `sweep()`
 * reads is the upper level; the `face` band is that row and the `verge` band is
 * one column back into the platform the wall holds. `thickenCourse` is called
 * on the face course, because a one-column course on a diagonal cannot be
 * 4-connected — a unit-width band along a 45° line spans ≈1.41 lattice columns
 * — and a sawtooth retaining wall is worse than none. It thickens **outward**,
 * into the low side, so the wall never eats the platform it holds.
 *
 * ## The furnish bar
 *
 * §2.3's furnish phase does *not* mean "after every ground write" — WP-A
 * measured that and the doc now says so: `streetscape.ts`'s `paveSidewalks`
 * runs after `surfaceStreetGraph` entirely and re-levels the whole sidewalk
 * band. The invariant a furnished thing actually needs is **"no later pass
 * re-levels a column the surfacer owns"**, and this pass clears it three ways
 * rather than assuming phase order does:
 *
 * - the wall stands on the platform's own outermost *free* column — outside the
 *   carriageway and outside the sidewalk band the streetscape re-levels, which
 *   is measured rather than assumed: letting a wall stand on a sidewalk column
 *   built 1,520 columns on the hill town and 183 unsupported balustrade posts
 *   with them, because `paveSidewalks` pulled the ground back out from under
 *   the coping. The sidewalk mask is a hard stop for that reason and no other;
 * - {@link RetainingPassResult.seam} is handed to `surfaceStreetGraph`, which
 *   passes it to `blendShoulders` — a seam is a face, not a bank, and smoothing
 *   it would undo the wall (§2.4);
 * - the coping course under the balustrade is emitted as a **structure block**
 *   as well as being written into the plan, so a rail can never be left over a
 *   column something later dropped.
 */

import { TERRAIN_DIAGNOSTICS, note, warning, type LoamDiagnostic } from "@terrainist/spec";
import type { Region } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";
import {
  NO_PLATFORM,
  RETAIN_RAIL,
  MIN_RETAIN_RUN,
  treatmentForSeam,
  type GroundLevels,
  type LevelSeam,
} from "../layout/levels.js";
import type { Palette } from "../terrain/palette.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import type { PrismarineStack } from "../emit/prismarine.js";

import type { StructureBlock } from "./buildings.js";
import { RETAINING_PROFILE, retainingProfile } from "./profiles.js";
import type { SweptProfile } from "./sweep.js";
import { index, inside } from "./roads.js";
import { sweep, sweptColumns, thickenCourse, type Vec2 } from "./sweep.js";

/**
 * Columns of clearance a wall keeps from the street network.
 *
 * Zero: the wall stands on the *platform's* own outermost column, which is
 * inside the block and therefore outside the sidewalk band `paveSidewalks`
 * re-levels — the same construction the stair rail uses to clear WP-A's bar.
 * A column a street actually claims is still skipped: there the street is the
 * connection between the two levels, not a wall across it.
 */
export const RETAIN_STREET_CLEARANCE = 0;

/**
 * How far back into the upper platform a wall may step to get off the street.
 *
 * **Measured, 2026-08-05, and this is the 85%.** On `stepped_hilltown` the
 * classifier called 2,489 seam columns `retaining` and the pass built 365. The
 * sink was one line: the face — the lowest row of the *upper* platform — is
 * carriageway for **2,274 of 2,713** columns, because `terraced`'s bench field
 * partitions the whole quarter, streets included, so a contour street runs
 * straight down the bench boundary. The face was skipped whole, and what was
 * left standing beside the street was the raw 2-to-4-block dirt face the walk
 * reported.
 *
 * "A column a street claims is skipped" is right for a street that **crosses**
 * a seam — there the street is the connection and a wall across it is a wall
 * across a road — and wrong for a street that **runs along** one, where the
 * uphill side of the carriageway is exactly where a hill town puts masonry.
 * The two are told apart by stepping: the walk-back runs perpendicular to the
 * seam, so a street along the seam is left after a few columns and the wall
 * lands at the back of the pavement, while a stair climbing *through* the seam
 * is street for the whole walk and the seam stays open there. No new
 * classification, no new mask — just how far you are allowed to walk.
 *
 * Twelve columns: wider than any carriageway plus its sidewalk dilation in the
 * catalog, narrow enough that a wall never detaches from the face it holds.
 */
export const RETAIN_FACE_SETBACK = 12;

/**
 * Share of a seam's face that has to be built over before the *seam* is built
 * over.
 *
 * A seam clipped at one end by a corner of a house is still a seam and still
 * wants its wall; a seam a terrace stands along the length of is that terrace's
 * foundation skirt, and a second wall in front of it is a second wall.
 */
export const RETAIN_BUILT_SHARE = 0.5;

/**
 * A quarter, as this pass reads one.
 *
 * Structurally a `DistrictProduct`, declared narrowly so the pass depends on
 * the fields it reads rather than on the whole fabric product — the same shape
 * `CanalDistrict` has and for the same reason.
 */
export interface RetainingDistrict {
  readonly nodePath: string;
  readonly bounds: Rect;
  /** 1 for a carriageway column, row-major over {@link bounds}. */
  readonly carriageway: Uint8Array;
  /** 1 for a sidewalk column, row-major over {@link bounds}. */
  readonly sidewalk: Uint8Array;
  /** The quarter's platforms; absent unless it declared or derived any. */
  readonly levels?: GroundLevels;
  /** The seams between them; absent unless the ground policy is `"stepped"`. */
  readonly seams?: readonly LevelSeam[];
}

/** Everything {@link buildRetainingWalls} reads. */
export interface RetainingPassInput {
  readonly districts: readonly RetainingDistrict[];
  /** Mutated exactly as the road pass mutates it. */
  readonly plan: ColumnPlan;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Footprints of everything already built, for the `"built"` reclassification. */
  readonly footprints?: readonly Rect[];
}

/** What the pass built. */
export interface RetainingPassResult {
  readonly blocks: readonly StructureBlock[];
  /**
   * 1 on every column this pass holds at a level, row-major over the region.
   *
   * Handed to the street surfacer so `blendShoulders` never smooths a face
   * (§2.4). Empty — all zeroes — for every quarter that declared no platforms.
   */
  readonly seam: Uint8Array;
  /** Seams a wall was built along. */
  readonly walls: number;
  /** Columns of wall face. */
  readonly wallColumns: number;
  /** Seams of one block, treated as a kerb course. */
  readonly kerbs: number;
  /** Seams too tall for a wall, graded into a bank. */
  readonly banks: number;
  /** Seams a building already stood on. */
  readonly built: number;
  /**
   * Every seam column classified `retaining` that got no wall, by reason.
   *
   * A column dropped for a reason nobody counted is a column nobody can find,
   * and 85% of this quarter's seam length was exactly that. The keys are the
   * whole of the accounting: `faced + Σ unfaced === ` the classifier's total.
   *
   * **This is no longer the same thing as "left as raw dirt".** Every reason
   * here is a legitimate reason not to build a *wall*; none of them is a reason
   * to leave the ground the cut exposed. {@link revetted} is what happens
   * instead — see {@link faceCuts}.
   */
  readonly unfaced: Readonly<Record<UnfacedReason, number>>;
  /**
   * Columns of cut face finished in masonry without a wall standing on them.
   *
   * The answer to the second half of the walk: *"retaining walls do not
   * properly seal the cliffside; raw dirt faces jut out underneath stone slabs
   * in arbitrary patches."* They did, and they were not the wall's fault — a
   * platform edge nobody could wall was left showing the soil band the terrain
   * pass gave it, four blocks of dirt under a stone kerb.
   */
  readonly revetted: number;
  /** Columns of graded bank finished as earth rather than as bare substrate. */
  readonly banked: number;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** Why a seam column classified `retaining` ended up with no wall. */
export type UnfacedReason =
  | "building" // a building stands on the face; its own skirt is the wall
  | "street" // the street owns the face for {@link RETAIN_FACE_SETBACK} columns — it crosses
  | "water" // the face is in a channel
  | "shortRun" // the seam is shorter than `MIN_RETAIN_RUN`, graded as a bank
  | "tallDrop" // the seam drops past `RETAIN_MAX`, graded as a bank
  | "builtSeam" // most of the seam's face is under one building
  | "offPlatform" // the upper bench is narrower than the road that runs on it
  | "noFace"; // the seam's upper platform presents no column at all

const UNFACED_REASONS: readonly UnfacedReason[] = [
  "building",
  "street",
  "water",
  "shortRun",
  "tallDrop",
  "builtSeam",
  "offPlatform",
  "noFace",
];

/** The block states the pass writes. */
interface RetainingStates {
  readonly coping: number;
  readonly weep: number;
  /** Palette symbol for the balustrade — resolved inside `sweep`. */
  readonly rail: string;
  /** The masonry a wall's body and an unwalled cut's face are made of. */
  readonly revetment: number;
  /** Earth a graded bank is finished with. */
  readonly bank: number;
  /**
   * The profile's own band symbols, already fallen back to real block names.
   *
   * `sweep`'s `stateOf` resolves a palette symbol *or* a Minecraft block name,
   * and a dotted symbol the theme's palette does not carry resolves to neither
   * — `blockByName("street.curb")` is `undefined`, which is state 0, which is
   * **air**. Measured: it painted the top course of every wall in this quarter
   * with air, and the lint found it as four unsupported fence posts on the
   * platform behind. So the fallback happens here, where a fallback can be
   * written down, rather than inside the engine.
   *
   */
  readonly profile: SweptProfile;
}

/**
 * The ground roles this pass writes, as palette symbols.
 *
 * Every one is defined by `defineGroundRoles` before the first pass runs, and
 * every one carries the block name the pass used *before* the roles existed as
 * its fallback — so a caller that built a palette by hand (every unit test that
 * sweeps a wall on a bare plan) still gets masonry rather than air.
 */
const ROLE_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
  "ground.coping": "minecraft:stone_bricks",
  "ground.revetment": "minecraft:stone",
  "ground.plinth": "minecraft:stone_bricks",
  "ground.balustrade": "minecraft:stone_brick_wall",
  "ground.weep": "minecraft:mossy_stone_bricks",
  "ground.bank": "minecraft:coarse_dirt",
  "ground.scree": "minecraft:gravel",
  "street.sidewalk": "minecraft:smooth_stone",
});

function resolveStates(palette: Palette, stack: PrismarineStack): RetainingStates {
  const fallback = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  /** A role's palette symbol when it has one, else a block name that exists. */
  const symbol = (role: string): string =>
    palette.has(role) ? role : (ROLE_FALLBACKS[role] ?? role);
  const state = (role: string): number =>
    palette.has(role) ? palette.state(role) : fallback(ROLE_FALLBACKS[role] ?? role);
  const profile: SweptProfile = {
    ...RETAINING_PROFILE,
    bands: RETAINING_PROFILE.bands.map((band) => ({
      ...band,
      surface: symbol(band.surface),
      ...(band.fill === undefined ? {} : { fill: symbol(band.fill) }),
    })),
  };
  return {
    profile,
    coping: state("ground.coping"),
    revetment: state("ground.revetment"),
    bank: state("ground.bank"),
    // What makes a retaining wall read as *old* rather than as a slab, and it
    // is one block every nine columns.
    weep: state("ground.weep"),
    rail: symbol("ground.balustrade"),
  };
}

/**
 * Build every seam every quarter derived.
 *
 * Returns untouched — no blocks, an all-zero seam mask — when no quarter
 * declared platforms, which is every document written before this phase. That
 * is the same shape `digCanals` has and it is what makes §6.7 hold.
 */
export function buildRetainingWalls(input: RetainingPassInput): RetainingPassResult {
  const { plan, palette, stack } = input;
  const region = plan.region;
  const cells = region.width * region.depth;
  const seam = new Uint8Array(cells);
  const blocks: StructureBlock[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  let walls = 0;
  let wallColumns = 0;
  let kerbs = 0;
  let banks = 0;
  let built = 0;
  let revetted = 0;
  let banked = 0;
  const unfaced: Record<UnfacedReason, number> = {
    building: 0,
    street: 0,
    water: 0,
    shortRun: 0,
    tallDrop: 0,
    builtSeam: 0,
    offPlatform: 0,
    noFace: 0,
  };

  const relevant = input.districts.filter((d) => d.levels !== undefined);
  if (relevant.length === 0) {
    return {
      blocks,
      seam,
      walls,
      wallColumns,
      kerbs,
      banks,
      built,
      revetted,
      banked,
      unfaced,
      diagnostics,
    };
  }
  const states = resolveStates(palette, stack);

  // Everything already standing. A seam most of whose face is under a building
  // is that building's foundation skirt, and a wall in front of it is a wall in
  // front of a wall.
  const occupied = new Uint8Array(cells);
  for (const rect of input.footprints ?? []) {
    for (let z = rect.z0; z <= rect.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        if (inside(region, x, z)) occupied[index(region, x, z)] = 1;
      }
    }
  }

  for (const district of relevant) {
    const levels = district.levels as GroundLevels;
    const bounds = district.bounds;
    const width = bounds.x1 - bounds.x0 + 1;
    const depth = bounds.z1 - bounds.z0 + 1;

    // The street network of this quarter, dilated by the clearance. A wall the
    // streetscape would re-level is not a wall, it is 75 floating blocks — the
    // measurement WP-A made and the reason this ring exists.
    const street = new Uint8Array(cells);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        const k = j * width + i;
        if (district.carriageway[k] !== 1 && district.sidewalk[k] !== 1) continue;
        for (let dj = -RETAIN_STREET_CLEARANCE; dj <= RETAIN_STREET_CLEARANCE; dj++) {
          for (let di = -RETAIN_STREET_CLEARANCE; di <= RETAIN_STREET_CLEARANCE; di++) {
            const x = bounds.x0 + i + di;
            const z = bounds.z0 + j + dj;
            if (inside(region, x, z)) street[index(region, x, z)] = 1;
          }
        }
      }
    }

    const jobs: { readonly seam: LevelSeam; readonly floorY: number }[] = [];
    for (const record of district.seams ?? []) {
      jobs.push({ seam: record, floorY: levels.levelY[record.below] as number });
    }
    // **The skirt of a platform** — the other half of §3.4, and the half a
    // platform-to-platform seam cannot express. A block's platform is bounded
    // by its street, and a street is not a platform, so two blocks a storey
    // apart are never 4-adjacent and `levelSeams` finds nothing between them.
    // What is actually there is a cut face at the block's own edge: the pad
    // holds the block at its storey and the ground beside it is the street's.
    // That face is where a hill town's walls are — "the block across the street
    // is a storey down, and you see the wall that makes it so" (§4.6) — so it
    // is derived here, from the platform field and the finished ground, rather
    // than left as a bank of raw dirt.
    jobs.push(...skirtSeams(region, plan, levels));

    for (const { seam: record, floorY } of jobs) {
      if (record.treatment === "kerb") {
        kerbs += kerbSeam(region, plan, record, states, street, occupied) > 0 ? 1 : 0;
        continue;
      }
      if (record.treatment === "bank") {
        banks++;
        banked += gradeBank(region, plan, levels, record, floorY, street, occupied, states);
        const short = record.cells.length < MIN_RETAIN_RUN;
        unfaced[short ? "shortRun" : "tallDrop"] += record.cells.length;
        diagnostics.push(
          warning(
            "RETAINING_REFUSED",
            district.nodePath,
            short
              ? `a seam in "${district.nodePath}" drops ${record.drop} blocks over only ${record.cells.length} column(s), shorter than the ${MIN_RETAIN_RUN} columns a wall needs to read as a wall rather than as a stub, so the two platforms were graded into each other as a bank`
              : `a seam in "${district.nodePath}" drops ${record.drop} blocks over ${record.cells.length} column(s), past the ${RETAIN_MAX_TEXT} a retaining wall is built for, so the two platforms were graded into each other as a bank`,
            "Raise the quarter's density so the blocks are smaller and each one steps less, or leave it: a bank is a bank, not an unbuilt cliff.",
          ),
        );
        continue;
      }

      // --- a wall ---------------------------------------------------------
      // The face is the lowest row of the *upper* platform: the seam's own
      // cells are the low side, and a wall standing on them would eat the
      // platform below instead of holding the one above.
      const face: number[] = [];
      const chosen = new Uint8Array(cells);
      const inFace = new Uint8Array(cells);
      let blockedByBuilding = 0;
      const reasons: Record<UnfacedReason, number> = {
        building: 0,
        street: 0,
        water: 0,
        shortRun: 0,
        tallDrop: 0,
        builtSeam: 0,
        offPlatform: 0,
        noFace: 0,
      };
      for (const point of record.cells) {
        for (const [dx, dz] of NEIGHBOURS) {
          const x = point.x + dx;
          const z = point.z + dz;
          if (!inside(region, x, z)) continue;
          if (levels.at(x, z) !== record.above) continue;
          const k = index(region, x, z);
          if (inFace[k] === 1) continue;
          inFace[k] = 1;
          // Walk back into the platform until the ground is the platform's own
          // rather than the street's: one column for a free face; a handful for
          // a street running *along* the seam, which puts the wall at the back
          // of the pavement; nothing within the setback for a street *crossing*
          // it, which is a seam that stays open because there the street is the
          // connection, not a thing to wall off.
          const found = walkBack(
            region,
            x,
            z,
            dx,
            dz,
            levels,
            record.above,
            street,
            occupied,
            plan,
          );
          const landed = found.column;
          const why = found.why;
          if (landed < 0) {
            if (why === "building") blockedByBuilding++;
            reasons[why]++;
            continue;
          }
          if (chosen[landed] === 1) continue;
          chosen[landed] = 1;
          face.push(landed);
        }
      }
      let total = 0;
      for (let k = 0; k < cells; k++) total += inFace[k] === 1 ? 1 : 0;
      if (total === 0) {
        unfaced.noFace += record.cells.length;
        continue;
      }
      if (blockedByBuilding >= total * RETAIN_BUILT_SHARE) {
        built++;
        unfaced.builtSeam += record.cells.length;
        continue;
      }
      // The report is in *seam* columns and `reasons` counts *upper-platform*
      // ones, so each reason is scaled by the seam's own length over its face's.
      for (const reason of UNFACED_REASONS) {
        const n = reasons[reason];
        if (n > 0) unfaced[reason] += Math.round((n * record.cells.length) / total);
      }
      if (face.length === 0) continue;

      // A one-column course on a diagonal is a sawtooth. Thicken outward —
      // into the low side, never into the platform the wall holds.
      const course = new Uint8Array(cells);
      for (const k of face) course[k] = 1;
      // A one-column course on a diagonal is a sawtooth. The course may now sit
      // a few columns inside the platform (the setback above), so "thicken
      // outward, never into the platform" is no longer the test that keeps a
      // wall off ground it does not own — free ground is, and free ground is
      // exactly what the setback walk already looked for.
      thickenCourse(
        region,
        course,
        (idx) =>
          occupied[idx] !== 1 && street[idx] !== 1 && plan.fluidKind[idx] === FluidKind.NONE,
        (idx) => cells - idx,
      );
      const columns: number[] = [];
      for (let k = 0; k < cells; k++) if (course[k] === 1) columns.push(k);

      // What the sweep may write, as an inverted occupancy grid: the face
      // course and the platform the wall holds, and nothing else. The engine
      // clamps a column's lane into the profile's span, so a column half a
      // block off the negative edge of an asymmetric profile lands on band 0
      // and is written as face — which on a seam means one column of the
      // platform *below* raised to the platform above, held by nothing once a
      // later pass pulls its own ground back down. That is not a wall, it is
      // four floating fence posts, measured. So the sweep is told what it owns.
      const avoid = new Uint8Array(cells).fill(1);
      for (let k = 0; k < cells; k++) {
        if (course[k] === 1) avoid[k] = 0;
        else if (
          levels.at(region.x0 + (k % region.width), region.z0 + Math.floor(k / region.width)) ===
          record.above
        ) {
          avoid[k] = occupied[k] === 1 || street[k] === 1 ? 1 : 0;
        }
      }

      let anySwept = false;
      for (const chain of chainsOf(region, columns)) {
        const path = orient(region, chain, levels, record.above, street, occupied);
        const result = sweep({
          profile: retainingProfile(record.drop, RETAIN_RAIL, states.rail, states.profile),
          path,
          plan,
          palette,
          stack,
          nodePath: district.nodePath,
          avoid: { region, mask: avoid, byTag: new Map<string, Uint8Array>() },
        });
        blocks.push(...result.blocks);
        // `SWEEP_FEATURES_PLACED` is a note about lamps on a bridge; a weep
        // hole is not news, and one per nine columns of every wall in a hill
        // town is a report nobody reads.
        for (const d of result.diagnostics) {
          // Both of these are expected here rather than newsworthy: a weep
          // hole every nine columns is not a report, and a column the sweep
          // was told it does not own is the mechanism above working.
          if (d.code === TERRAIN_DIAGNOSTICS.SWEEP_FEATURES_PLACED) continue;
          if (d.code === TERRAIN_DIAGNOSTICS.SWEEP_COLUMNS_SKIPPED) continue;
          diagnostics.push(d);
        }
        for (let k = 0; k < cells; k++) {
          if (result.claimed[k] !== 1) continue;
          seam[k] = 1;
        }
        // **The wall is as deep as it is tall.** `sweep()` writes one course of
        // the `fill` band and leaves `soil` alone, so a six-block wall used to
        // be one course of masonry over five of whatever the hill is made of —
        // `minecraft:stone`, because the old fill symbol was literally
        // `ground.stone`. That is the "carved out of one monolith" reading in a
        // single line. Deepening the soil band to the drop is what turns it
        // into a wall somebody built.
        for (const cell of path) {
          const k = index(region, cell.x, cell.z);
          if (result.claimed[k] !== 1) continue;
          deepen(plan, k, record.drop);
        }
        // The coping, as a structure block as well as a plan column: a rail may
        // never be left standing over ground a later pass dropped.
        for (const cell of path) {
          const k = index(region, cell.x, cell.z);
          if (result.claimed[k] !== 1) continue;
          blocks.push({ x: cell.x, y: plan.ground[k] as number, z: cell.z, stateId: states.coping });
          wallColumns++;
          anySwept = true;
        }
        // The weep courses, one below the coping so they read from the low side
        // rather than being buried under the walk on top.
        for (const feature of result.features) {
          if (feature.id !== "weep") continue;
          const y = feature.at.y - 2;
          if (!inside(region, feature.at.x, feature.at.z)) continue;
          const k = index(region, feature.at.x, feature.at.z);
          if (result.claimed[k] !== 1) continue;
          if (y <= (plan.ground[k] as number) - record.drop) continue;
          blocks.push({ x: feature.at.x, y, z: feature.at.z, stateId: states.weep });
        }
      }
      if (anySwept) walls++;
    }

    // --- the finish ---------------------------------------------------------
    // Everything above decides where a *wall* goes. This decides what the rest
    // of the cut is made of, and it runs over the whole quarter rather than
    // over the seams, because "no wall here" has eight named reasons and a cut
    // face has one appearance whichever of them applied.
    revetted += faceCuts(region, plan, levels, states, seam);
  }

  const unfacedTotal = UNFACED_REASONS.reduce((sum, r) => sum + unfaced[r], 0);
  if (walls + kerbs + banks + built + revetted > 0) {
    const breakdown = UNFACED_REASONS.filter((r) => unfaced[r] > 0)
      .map((r) => `${unfaced[r]} ${r}`)
      .join(", ");
    diagnostics.push(
      note(
        "SWEEP_FEATURES_PLACED",
        relevant[0]?.nodePath ?? "world",
        `multi-level ground: ${walls} retaining wall(s) over ${wallColumns} column(s), ${kerbs} kerb seam(s), ${banks} bank(s), and ${built} seam(s) a building already stood on` +
          (breakdown === "" ? "" : `; ${unfacedTotal} seam column(s) got no wall (${breakdown})`) +
          `; every cut face finished: ${revetted} revetted, ${banked} graded as bank`,
        "No action needed.",
      ),
    );
  }

  return {
    blocks,
    seam,
    walls,
    wallColumns,
    kerbs,
    banks,
    built,
    revetted,
    banked,
    unfaced,
    diagnostics,
  };
}

/**
 * Deepen a column's soil band so its **face** is made of what its top is.
 *
 * `sweep()` writes `plan.subsurface` and sets `plan.soil` to 1 if it was 0 —
 * one course. That is right for a road, whose face nobody sees, and wrong for
 * anything standing on a slope: the second course down is the terrain's own
 * soil or stone, so a wall reads as a lid on the hill rather than as masonry.
 * The band is never *shortened*, because a column that already had deeper soil
 * had it for a reason.
 */
function deepen(plan: ColumnPlan, k: number, depth: number): void {
  const want = depth < 1 ? 1 : depth > 255 ? 255 : depth;
  if ((plan.soil[k] as number) < want) plan.soil[k] = want;
}

/**
 * Finish every cut face in a quarter that no wall stands on.
 *
 * > **The second half of the walk, and the one nobody had a mechanism for.**
 * > *"Retaining walls do not properly seal the cliffside. Raw dirt faces jut
 * > out underneath stone slabs in arbitrary patches. It looks like a WorldEdit
 * > cut/paste error where the generator sliced into the terrain without
 * > auto-completing the stone retaining facade."*
 *
 * It was not a paste error and the walls were not at fault. A platform is
 * levelled by a pad edit, which moves `plan.ground` and leaves the column's
 * *materials* alone — surface, then `soil` courses of `subsurface`, which for
 * ordinary ground is grass over dirt. Seen from above that is a lawn; seen from
 * the low side of a four-block cut it is four blocks of dirt. Every seam the
 * pass declined to wall — and each of the eight reasons is a good reason not to
 * build a wall — left exactly that.
 *
 * So the finish is not a wall and does not pretend to be one: it is a statement
 * about what the cut is **made of**. Every column of a platform that stands two
 * or more blocks above an 8-neighbour has its soil band replaced by the theme's
 * revetment and deepened to the height of the drop. Nothing is emitted, no
 * level moves, nothing can float, and a column a wall already claimed keeps the
 * wall's own material — it is only deepened.
 *
 * Two or more, because one block of step is a kerb: it is a course you walk up,
 * the street pass already copes it, and facing it would be building a wall you
 * trip over. The same number `skirtSeams` uses, for the same reason.
 *
 * @returns columns faced.
 */
function faceCuts(
  region: Region,
  plan: ColumnPlan,
  levels: GroundLevels,
  states: RetainingStates,
  seam: Uint8Array,
): number {
  const bounds = levels.bounds;
  let faced = 0;
  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      if (!inside(region, x, z)) continue;
      if (levels.at(x, z) === NO_PLATFORM) continue;
      const k = index(region, x, z);
      if (plan.fluidKind[k] !== FluidKind.NONE) continue;
      const top = plan.ground[k] as number;
      // The tallest face this column presents to any neighbour, 8-connected:
      // a corner column shows its diagonal, and a diagonal face left raw is the
      // "arbitrary patch" the walk described.
      let drop = 0;
      for (const [dx, dz] of SEAM_NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        const fall = top - (plan.ground[n] as number);
        if (fall > drop) drop = fall;
      }
      if (drop < 2) continue;
      // A column a wall stands on already has the wall's material; all it wants
      // is the depth, so the wall does not sit on a dirt plinth of its own.
      if (seam[k] !== 1) plan.subsurface[k] = states.revetment;
      deepen(plan, k, drop);
      faced++;
    }
  }
  return faced;
}

/**
 * The nearest column of the upper platform a wall may actually stand on.
 *
 * A straight walk **perpendicular to the seam**, away from it, bounded by
 * {@link RETAIN_FACE_SETBACK}. Straight, and never around: that is the whole of
 * how a street running *along* a seam is told from one *crossing* it. Along,
 * the walk leaves the carriageway after a few columns and the wall lands at the
 * back of the pavement; across, the walk is street for its whole length and
 * comes back empty, so the crossing stays open — there the street is the
 * connection between the two levels, not a thing to wall off. A search free to
 * detour would find its way round a flight and wall the landing.
 *
 * A building and water are **stops**, not obstacles to walk past: what is
 * behind a building is the building's ground and its own foundation skirt is
 * the wall (§3.4).
 */
function walkBack(
  region: Region,
  x0: number,
  z0: number,
  dx: number,
  dz: number,
  levels: GroundLevels,
  above: number,
  street: Uint8Array,
  occupied: Uint8Array,
  plan: ColumnPlan,
): { readonly column: number; readonly why: UnfacedReason } {
  for (let step = 0; step < RETAIN_FACE_SETBACK; step++) {
    const x = x0 + dx * step;
    const z = z0 + dz * step;
    if (!inside(region, x, z)) break;
    // Out of platform before out of street: the upper bench is narrower than
    // the road that runs on it, and there is no ground of its own to stand on.
    if (levels.at(x, z) !== above) return { column: -1, why: "offPlatform" };
    const k = index(region, x, z);
    if (occupied[k] === 1) return { column: -1, why: "building" };
    if (plan.fluidKind[k] !== FluidKind.NONE) return { column: -1, why: "water" };
    if (street[k] === 1) continue;
    return { column: k, why: "street" };
  }
  return { column: -1, why: "street" };
}

/** Text for the refusal, kept out of the template so the number has one home. */
const RETAIN_MAX_TEXT = "6 blocks";

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** `layout/levels.ts`'s SEAM_NEIGHBOURS, for grouping a skirt into one face. */
const SEAM_NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/**
 * The seams a platform makes with the ground that is **not** a platform.
 *
 * `levelSeams` derives the faces between two platforms, which is the right
 * construction and, on its own, finds almost nothing: a block's platform stops
 * at the street, and a street is not a platform, so two blocks a storey apart
 * are never 4-adjacent. The face that is actually in the world is the block's
 * own edge — the pad holds it at its storey and the ground one column out is
 * whatever the terrain and the street left. This measures that face on the
 * finished plan, groups it exactly as `levelSeams` groups its own, and hands it
 * back in the same shape, so one loop builds both.
 *
 * The `below` index is the platform's own, and the caller never reads it: a
 * skirt's floor is *measured*, not looked up, and it is returned beside the
 * record for that reason.
 */
function skirtSeams(
  region: Region,
  plan: ColumnPlan,
  levels: GroundLevels,
): { readonly seam: LevelSeam; readonly floorY: number }[] {
  const cells = region.width * region.depth;
  const out: { seam: LevelSeam; floorY: number }[] = [];
  // Low-side columns per platform, in region order.
  const byPlatform = new Map<number, number[]>();
  const claimedBy = new Int32Array(cells).fill(-1);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const k = j * region.width + i;
      const x = region.x0 + i;
      const z = region.z0 + j;
      const platform = levels.at(x, z);
      if (platform === NO_PLATFORM) continue;
      const top = levels.levelY[platform] as number;
      for (const [dx, dz] of NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (levels.at(x + dx, z + dz) !== NO_PLATFORM) continue;
        if (plan.fluidKind[n] !== FluidKind.NONE) continue;
        // A one-block lip is a kerb the street pass already copes with; below
        // that there is nothing to retain.
        if ((plan.ground[n] as number) > top - 2) continue;
        // One column belongs to one skirt: the highest platform it touches
        // wins, ties to the lower index, so the grouping is order-independent.
        const current = claimedBy[n] as number;
        if (current >= 0 && (levels.levelY[current] as number) >= top) continue;
        claimedBy[n] = platform;
      }
    }
  }
  for (let k = 0; k < cells; k++) {
    const platform = claimedBy[k] as number;
    if (platform < 0) continue;
    let list = byPlatform.get(platform);
    if (list === undefined) {
      list = [];
      byPlatform.set(platform, list);
    }
    list.push(k);
  }

  for (const platform of [...byPlatform.keys()].sort((a, b) => a - b)) {
    const list = byPlatform.get(platform) as number[];
    const top = levels.levelY[platform] as number;
    const member = new Set(list);
    const seen = new Set<number>();
    for (const start of list) {
      if (seen.has(start)) continue;
      seen.add(start);
      const queue = [start];
      for (let head = 0; head < queue.length; head++) {
        const k = queue[head] as number;
        const x = region.x0 + (k % region.width);
        const z = region.z0 + Math.floor(k / region.width);
        // 8-connected, for `layout/levels.ts`'s SEAM_NEIGHBOURS reason: a
        // skirt is a contour too, and a contour on a lattice is a staircase
        // whose consecutive columns are diagonal neighbours.
        for (const [dx, dz] of SEAM_NEIGHBOURS) {
          if (!inside(region, x + dx, z + dz)) continue;
          const n = index(region, x + dx, z + dz);
          if (!member.has(n) || seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      queue.sort((a, b) => a - b);
      // The floor is the component's **median** ground, not its lowest column:
      // a wall is built for the face it presents, and one column of gully at
      // the end of a run is not that face.
      const heights = queue.map((k) => plan.ground[k] as number).sort((a, b) => a - b);
      const floorY = heights[heights.length >> 1] as number;
      const drop = top - floorY;
      if (drop < 2) continue;
      out.push({
        seam: {
          above: platform,
          below: platform,
          cells: queue.map((k) => ({
            x: region.x0 + (k % region.width),
            z: region.z0 + Math.floor(k / region.width),
          })),
          drop,
          treatment: treatmentForSeam(drop, queue.length),
        },
        floorY,
      });
    }
  }
  return out;
}

/**
 * A drop of one block is a kerb, not a wall.
 *
 * One course of the street's kerb material on the lower column, and the level
 * is not touched: a single block of step is something you walk up, and building
 * a wall for it would be building a wall you trip over.
 */
function kerbSeam(
  region: Region,
  plan: ColumnPlan,
  record: LevelSeam,
  states: RetainingStates,
  street: Uint8Array,
  occupied: Uint8Array,
): number {
  let laid = 0;
  for (const point of record.cells) {
    if (!inside(region, point.x, point.z)) continue;
    const k = index(region, point.x, point.z);
    if (street[k] === 1) continue;
    // The footprint mask, which `gradeBank` and the wall path both honour and
    // this one did not: a drop-1 seam running under a building would have laid
    // a course of kerb inside its ground floor.
    if (occupied[k] === 1) continue;
    if (plan.fluidKind[k] !== FluidKind.NONE) continue;
    plan.surface[k] = states.coping;
    laid++;
  }
  return laid;
}

/**
 * A drop past `RETAIN_MAX` is a bank: the two platforms are graded into each
 * other over `drop` columns and the record says so.
 *
 * Nothing is *built* — that is the point of the refusal — but nothing is left
 * as a cliff either. The ramp only ever raises the low side toward the face,
 * one block per column, and it never touches a street, a footprint or water.
 *
 * A raised column is also **finished**: its soil band becomes the theme's bank
 * earth. Without that the ramp is made of whatever the terrain pass put under
 * the old surface — on a cut platform that is frequently plain stone — and a
 * graded bank of masonry reads as a broken wall rather than as a slope. The
 * *surface* is deliberately untouched: it is the grass, podzol or path the
 * terrain and climate already agreed on, and it is what makes the bank read as
 * ground rather than as a build.
 *
 * @returns columns raised.
 */
function gradeBank(
  region: Region,
  plan: ColumnPlan,
  levels: GroundLevels,
  record: LevelSeam,
  floorY: number,
  street: Uint8Array,
  occupied: Uint8Array,
  states: RetainingStates,
): number {
  const cells = region.width * region.depth;
  const top = levels.levelY[record.above] as number;
  const floor = floorY;
  const seen = new Uint8Array(cells);
  let frontier: number[] = [];
  for (const point of record.cells) {
    if (!inside(region, point.x, point.z)) continue;
    const k = index(region, point.x, point.z);
    if (seen[k] === 1) continue;
    seen[k] = 1;
    frontier.push(k);
  }
  let raised = 0;
  for (let ring = 0; ring < record.drop && frontier.length > 0; ring++) {
    const target = top - ring - 1;
    if (target <= floor) break;
    const next: number[] = [];
    for (const k of frontier) {
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      if (street[k] !== 1 && occupied[k] !== 1 && plan.fluidKind[k] === FluidKind.NONE) {
        const g = plan.ground[k] as number;
        if (target > g) {
          plan.ground[k] = target;
          plan.fluidTop[k] = target;
          // Earth, and enough of it to cover what the ramp just raised: the
          // face of a bank is the bank, and it is not masonry.
          plan.subsurface[k] = states.bank;
          const fill = target - g;
          plan.soil[k] = Math.min(255, Math.max(plan.soil[k] as number, fill + 1));
          raised++;
        }
      }
      for (const [dx, dz] of NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (seen[n] === 1) continue;
        // Only outward, into the platform below. The one above is already there.
        if (levels.at(x + dx, z + dz) === record.above) continue;
        seen[n] = 1;
        next.push(n);
      }
    }
    frontier = next;
  }
  return raised;
}

/**
 * Order a set of columns into 4-connected chains a sweep can follow.
 *
 * `sweep()` wants a path, and a seam's face is a set. Each connected piece
 * contributes its **diameter** — the longest shortest-path in the piece, found
 * by the usual double BFS — and whatever the diameter did not cover is fed back
 * in and chained again, so a branch off a wall becomes its own short run rather
 * than a kink in the line the sweep projects onto. Every tie breaks on region
 * order, so the chains are a pure function of the set.
 */
function chainsOf(
  region: Region,
  columns: readonly number[],
): Vec2[][] {
  const remaining = new Set(columns);
  const out: Vec2[][] = [];
  const point = (k: number): Vec2 => ({
    x: region.x0 + (k % region.width),
    z: region.z0 + Math.floor(k / region.width),
  });
  const neighbours = (k: number): number[] => {
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    const list: number[] = [];
    for (const [dx, dz] of NEIGHBOURS) {
      if (!inside(region, x + dx, z + dz)) continue;
      const n = index(region, x + dx, z + dz);
      if (remaining.has(n)) list.push(n);
    }
    return list.sort((a, b) => a - b);
  };
  // Bounded: every iteration removes at least one column.
  let guard = columns.length + 1;
  while (remaining.size > 0 && guard-- > 0) {
    let start = Number.POSITIVE_INFINITY;
    for (const k of remaining) if (k < start) start = k;
    const far = furthest(start, neighbours);
    const end = furthest(far.node, neighbours);
    const chain = end.path;
    for (const k of chain) remaining.delete(k);
    if (chain.length > 0) out.push(chain.map(point));
  }
  return out;
}

/** BFS from `start`, returning the furthest node and the path to it. */
function furthest(
  start: number,
  neighbours: (k: number) => number[],
): { readonly node: number; readonly path: number[] } {
  const from = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let last = start;
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    last = k;
    for (const n of neighbours(k)) {
      if (from.has(n)) continue;
      from.set(n, k);
      queue.push(n);
    }
  }
  const path: number[] = [];
  for (let k: number | undefined = last; k !== undefined && k >= 0; k = from.get(k)) path.push(k);
  path.reverse();
  return { node: last, path };
}

/**
 * Point a chain so the profile's `verge` band falls **inside** the platform the
 * wall holds.
 *
 * `RETAINING_PROFILE` is asymmetric, so its bands run from the negative side of
 * the line to the positive one: lane 0 is the path itself (the face) and lane
 * +1 is the verge. Which world side lane +1 lands on depends on the direction
 * the path is walked, and that is not something a profile can declare. So it is
 * measured: sweep the span, count how many lane-1 columns are on the upper
 * platform, and reverse the path when the answer is "fewer than half". A tie
 * keeps the original order, so the choice is a pure function of the chain.
 */
function orient(
  region: Region,
  chain: readonly Vec2[],
  levels: GroundLevels,
  above: number,
  street: Uint8Array,
  occupied: Uint8Array,
): Vec2[] {
  const path = [...chain];
  if (path.length < 2) return path;
  let onPlatform = 0;
  let off = 0;
  for (const column of sweptColumns(region, path, { lo: 0, hi: 1 })) {
    if (column.lane !== 1) continue;
    const k = index(region, column.x, column.z);
    // Free ground of the platform the wall holds, not merely the platform: with
    // the setback both lanes can be on it, and the verge belongs on the side
    // that is walkable rather than on the side the carriageway owns.
    const free = street[k] !== 1 && occupied[k] !== 1;
    if (levels.at(column.x, column.z) === above && free) onPlatform++;
    else off++;
  }
  return off > onPlatform ? [...path].reverse() : path;
}

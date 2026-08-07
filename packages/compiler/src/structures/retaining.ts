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
import type { GroundClaim, GroundIntent } from "../layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../layout/ground-driver.js";
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
import { RETAINING_PROFILE } from "./profiles.js";
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
  /** Mutated exactly as the road pass mutates it — materials only, given a driver. */
  readonly plan: ColumnPlan;
  /**
   * The ground contract's driver (`docs/GROUND-CONTRACT-v0.md` §9a).
   *
   * A wall's course is a `face` plus a `preserve` (§3.3b) and a bank's rings are
   * a `verge` profile; both go through `commit`, and the masonry is laid against
   * the answer. Omitted only by callers that are not the pipeline — the unit
   * tests that wall a seam on a bare plan — which then get a driver of their own
   * over the plan as it stands (`driverForPlan`).
   */
  readonly ground?: GroundDriver;
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
  /**
   * Columns of **parapet** — the continuous balustrade course {@link railRun}
   * stands on the stretches of wall the public can walk up to.
   *
   * Reported because the ratio to {@link wallColumns} is the measurement the
   * fortress-maze walk was about: a wall top is coping, and a parapet is the
   * exception. Every wall top railed is a battlement.
   */
  readonly railColumns: number;
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
   * Columns of **cut-face course** — the contour a cut leaves that no wall
   * stands on, faced in the hill's own rock.
   *
   * The name is historical: until 2026-08-07 the course was dressed in the
   * theme's `ground.revetment` and coped along its top edge, which armoured
   * every unwalled cut in masonry and made the hillside read as a quarry. It is
   * kept because the field is part of this pass's result contract; what it
   * counts is unchanged — the columns of finished cut face. See
   * {@link faceCuts}.
   *
   * The answer to the second half of the walk: *"retaining walls do not
   * properly seal the cliffside; raw dirt faces jut out underneath stone slabs
   * in arbitrary patches."* They did, and they were not the wall's fault — a
   * platform edge nobody could wall was left showing the soil band the terrain
   * pass gave it, four blocks of dirt under a stone kerb.
   *
   * Counted per column of the finished course, which is more than the columns
   * that answer the drop test on their own: {@link faceCuts} bridges the
   * one-column gaps in the contour and thickens it across the diagonal, because
   * a contour on a lattice is a staircase and a staircase of single blocks is
   * the artifact rather than the fix.
   */
  readonly revetted: number;
  /** Columns of graded bank finished as earth rather than as bare substrate. */
  readonly banked: number;
  readonly diagnostics: readonly LoamDiagnostic[];
  /**
   * What this pass declared under the ground contract
   * (`docs/GROUND-CONTRACT-v0.md` §3.3b): the intents it handed to the driver,
   * kept as a return value for the report and the tests. Three things are in it
   * and two are not:
   * the wall runs (`face` + `preserve`, at the coping's own walking level), and
   * `gradeBank`'s ring targets (`verge`). `kerbSeam` and `faceCuts` declare
   * **nothing** — they are materials, and the contract does not protect
   * materials.
   */
  readonly declaration: RetainingDeclaration;
}

/** The raw material of §3.3b's intents. */
export interface RetainingDeclaration {
  /** One entry per swept chain of one seam: the thickened, chained course. */
  readonly walls: readonly {
    readonly source: string;
    /** `retaining.seam` for a declared seam, `retaining.skirt` for a measured one. */
    readonly measured: boolean;
    readonly columns: readonly GroundClaim[];
  }[];
  /** One entry per bank: `gradeBank`'s ring targets, as a `verge` profile. */
  readonly banks: readonly {
    readonly source: string;
    readonly columns: readonly GroundClaim[];
  }[];
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
  /** The balustrade block, emitted by {@link railRun} rather than by a cap. */
  readonly rail: number;
  /** The masonry a wall's body is made of. */
  readonly revetment: number;
  /**
   * The hill's own rock — what an **unwalled** cut face is made of.
   *
   * Not `ground.revetment`: dressing every cut in the theme's masonry was what
   * made the whole hillside read as built stonework rather than as a town
   * standing on a hill. `ground.stone` is the terrain pass's own deep-subsurface
   * symbol — literally what `buildColumnPlan` writes under a cliff — so a cut
   * face and the cliff beside it are made of the same thing, which is the point.
   */
  readonly rock: number;
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
  "ground.stone": "minecraft:stone",
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
    rock: state("ground.stone"),
    bank: state("ground.bank"),
    // What makes a retaining wall read as *old* rather than as a slab, and it
    // is one block every nine columns.
    weep: state("ground.weep"),
    rail: state("ground.balustrade"),
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
  const driver = input.ground ?? driverForPlan(plan);
  const region = plan.region;
  const cells = region.width * region.depth;
  const seam = new Uint8Array(cells);
  const blocks: StructureBlock[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  let walls = 0;
  let wallColumns = 0;
  let railColumns = 0;
  let kerbs = 0;
  let banks = 0;
  let built = 0;
  let revetted = 0;
  let banked = 0;
  const declaredWalls: RetainingDeclaration["walls"][number][] = [];
  const declaredBanks: RetainingDeclaration["banks"][number][] = [];
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
      railColumns,
      kerbs,
      banks,
      built,
      revetted,
      banked,
      unfaced,
      diagnostics,
      declaration: { walls: [], banks: [] },
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

    const jobs: {
      readonly seam: LevelSeam;
      readonly floorY: number;
      /** A skirt is *measured* from the finished ground; a seam is declared. */
      readonly measured: boolean;
    }[] = [];
    for (const record of district.seams ?? []) {
      jobs.push({ seam: record, floorY: levels.levelY[record.below] as number, measured: false });
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
    jobs.push(...skirtSeams(region, plan, levels).map((j) => ({ ...j, measured: true })));

    for (const [jobIndex, { seam: record, floorY, measured }] of jobs.entries()) {
      if (record.treatment === "kerb") {
        kerbs += kerbSeam(region, plan, record, states, street, occupied) > 0 ? 1 : 0;
        continue;
      }
      if (record.treatment === "bank") {
        banks++;
        const ringTargets: GroundClaim[] = [];
        banked += gradeBank(
          region,
          plan,
          driver,
          `${district.nodePath}#bank@${jobIndex}`,
          levels,
          record,
          floorY,
          street,
          occupied,
          states,
          ringTargets,
        );
        if (ringTargets.length > 0) {
          declaredBanks.push({
            source: `${district.nodePath}#bank@${jobIndex}`,
            columns: ringTargets,
          });
        }
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
      let chainIndex = -1;
      for (const chain of chainsOf(region, columns)) {
        chainIndex++;
        const path = orient(region, chain, levels, record.above, street, occupied);
        // §3.3b — the course is a `face` at the coping's own walking level, plus
        // a `preserve` over the same columns: a balustrade may never be left
        // standing over ground something else dropped, which is the
        // `unsupported.chain` finding that survived four rounds of fixes. Both
        // go in one commit, because the resolver has to see them together.
        // `transition: "wall"` — the face *is* the transition.
        const source = `${district.nodePath}#retaining@${jobIndex}/${chainIndex}`;
        const sourceClass = measured ? ("retaining.skirt" as const) : ("retaining.seam" as const);
        const result = sweep({
          profile: states.profile,
          path,
          plan,
          palette,
          stack,
          nodePath: district.nodePath,
          avoid: { region, mask: avoid, byTag: new Map<string, Uint8Array>() },
          declare: {
            sourceClass,
            kind: "face",
            source,
            transition: "wall",
            commit: (intent) => {
              const wall: GroundIntent[] = [intent];
              if ([...intent.columns].length > 0) {
                wall.push({
                  source,
                  sourceClass,
                  kind: "preserve",
                  columns: intent.columns,
                  transition: "none",
                });
              }
              driver.commit(wall);
            },
          },
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
        // The seam mask is the *claimed* course — including a spanned column the
        // sweep deliberately left alone — because what it protects is geometry:
        // `blendShoulders` may not smooth a face, whether or not the face's own
        // column carried a level. The declaration is the levelled half, which is
        // what the sweep handed the driver.
        for (let k = 0; k < cells; k++) if (result.claimed[k] === 1) seam[k] = 1;
        const wallColumnsDeclared = [...((result.intent?.columns ?? []) as Iterable<GroundClaim>)];
        if (wallColumnsDeclared.length > 0) {
          declaredWalls.push({ source, measured, columns: wallColumnsDeclared });
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
        // The parapet, where there is anybody to keep off the drop. Emitted
        // here rather than as a profile cap, and along the chain rather than
        // over the band's raster, for the reason written up on
        // `RETAINING_PROFILE`: a cap on a contour is a row of disconnected
        // posts, which is a battlement.
        railColumns += railRun(
          region,
          plan,
          path,
          result.claimed,
          levels,
          record.above,
          record.drop,
          street,
          states,
          blocks,
        );
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
    revetted += faceCuts(region, plan, levels, states, seam, street, occupied);
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
        `multi-level ground: ${walls} retaining wall(s) over ${wallColumns} column(s) (${railColumns} parapeted), ${kerbs} kerb seam(s), ${banks} bank(s), and ${built} seam(s) a building already stood on` +
          (breakdown === "" ? "" : `; ${unfacedTotal} seam column(s) got no wall (${breakdown})`) +
          `; every cut face finished: ${revetted} faced in rock, ${banked} graded as bank`,
        "No action needed.",
      ),
    );
  }

  return {
    blocks,
    seam,
    walls,
    wallColumns,
    railColumns,
    kerbs,
    banks,
    built,
    revetted,
    banked,
    unfaced,
    diagnostics,
    declaration: { walls: declaredWalls, banks: declaredBanks },
  };
}

/* -------------------------------------------------------------------------- */
/* the parapet                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Columns from a wall's coping to the nearest public ground that still counts
 * as "somebody can walk up to this drop".
 *
 * Three: the width of the sidewalk band plus the column the wall stands on. A
 * wall at the back of a pavement gets a parapet; a wall at the bottom of
 * somebody's garden, or holding a bench nothing reaches, does not — it is a
 * retaining wall, and a retaining wall with a rail on top is a fortification.
 *
 * **Publicly accessible means street or sidewalk**, and only that: the district
 * product this pass reads carries `carriageway` and `sidewalk` masks and no
 * paved/plaza mask, so a plaza that reaches a wall edge is currently read as
 * private. Widening it is one mask away if a walk asks for it.
 */
export const RAIL_ACCESS_RANGE = 3;

/**
 * The longest inaccessible stretch a parapet is carried across.
 *
 * A parapet that stops for two columns and starts again is two parapets with a
 * hole in them; a parapet that runs the length of a wall nobody can reach is the
 * battlement this replaced. Four is a doorway's worth.
 */
export const RAIL_GAP_BRIDGE = 4;

/**
 * The shortest run of parapet worth building.
 *
 * Below this a "continuous course" is indistinguishable from the spaced posts
 * that made the town read as a fortress: one or two wall blocks on their own
 * render as full-height posts.
 */
export const MIN_RAIL_RUN = 3;

/**
 * Stand a **continuous** parapet on the stretches of a wall the public reaches.
 *
 * The chain is 4-connected by construction (`chainsOf` walks 4-neighbours), so
 * consecutive rail blocks connect into a low course rather than each rendering
 * as a post. That is the whole difference between a parapet and a battlement,
 * and it is why this runs over the chain and not over the swept band.
 *
 * Three passes over the chain, in order: eligibility (a claimed column with
 * public ground within {@link RAIL_ACCESS_RANGE} on the platform the wall
 * holds), gap closing ({@link RAIL_GAP_BRIDGE}), and run pruning
 * ({@link MIN_RAIL_RUN}). A rail is only ever emitted over a column the sweep
 * claimed, which is the same column the coping was emitted on as a structure
 * block — so a rail can never be left floating.
 */
function railRun(
  region: Region,
  plan: ColumnPlan,
  path: readonly Vec2[],
  claimed: Uint8Array,
  levels: GroundLevels,
  above: number,
  drop: number,
  street: Uint8Array,
  states: RetainingStates,
  blocks: StructureBlock[],
): number {
  if (drop < RETAIN_RAIL) return 0;
  const n = path.length;
  const eligible = new Uint8Array(n);
  const railed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const cell = path[i] as Vec2;
    if (!inside(region, cell.x, cell.z)) continue;
    if (claimed[index(region, cell.x, cell.z)] !== 1) continue;
    eligible[i] = 1;
    let reached = false;
    for (let dz = -RAIL_ACCESS_RANGE; dz <= RAIL_ACCESS_RANGE && !reached; dz++) {
      for (let dx = -RAIL_ACCESS_RANGE; dx <= RAIL_ACCESS_RANGE; dx++) {
        const x = cell.x + dx;
        const z = cell.z + dz;
        if (!inside(region, x, z)) continue;
        // On the platform the wall holds: the street *below* a retaining wall is
        // the thing you fall onto, not the thing you walk along the top of.
        if (levels.at(x, z) !== above) continue;
        if (street[index(region, x, z)] !== 1) continue;
        reached = true;
        break;
      }
    }
    if (reached) railed[i] = 1;
  }
  // The gaps, then the stubs. Both decided from the arrays as they stand at the
  // start of their pass, so neither depends on scan direction.
  const access = Uint8Array.from(railed);
  for (let i = 0; i < n; i++) {
    if (access[i] === 1) continue;
    let end = i;
    while (end < n && access[end] !== 1) end++;
    if (i > 0 && end < n && end - i <= RAIL_GAP_BRIDGE) {
      for (let k = i; k < end; k++) if (eligible[k] === 1) railed[k] = 1;
    }
    i = end;
  }
  const runs = Uint8Array.from(railed);
  for (let i = 0; i < n; i++) {
    if (runs[i] !== 1) continue;
    let end = i;
    while (end < n && runs[end] === 1) end++;
    if (end - i < MIN_RAIL_RUN) for (let k = i; k < end; k++) railed[k] = 0;
    i = end;
  }
  let stood = 0;
  for (let i = 0; i < n; i++) {
    if (railed[i] !== 1 || eligible[i] !== 1) continue;
    const cell = path[i] as Vec2;
    const k = index(region, cell.x, cell.z);
    blocks.push({
      x: cell.x,
      y: (plan.ground[k] as number) + 1,
      z: cell.z,
      stateId: states.rail,
    });
    stood++;
  }
  return stood;
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
 * about what the cut is **made of**. Nothing is emitted, no level moves, nothing
 * can float, and a column a wall already claimed keeps the wall's own material —
 * it is only deepened. The pass swaps materials and does nothing else, and that
 * property is what makes it safe to run over a whole quarter.
 *
 * ## A cut face is a course, not a per-column property
 *
 * > *Walked 2026-08-06: "raw dirt faces jut out underneath stone slabs in
 * > arbitrary patches", still, after the finish existed.*
 *
 * The first version of this asked one question of one column — *is your
 * 8-neighbour drop ≥ 2?* — and painted whichever columns said yes. On a diagonal
 * contour the set of columns that say yes is **itself a lattice staircase**, so
 * from the low side the revetment showed as isolated single blocks; wherever the
 * drop dipped to 1 the masonry was interrupted by a column of grass; and with no
 * coping every stone patch was capped by the lawn on top. It read as a broken
 * wall.
 *
 * This is the **third** appearance of one lesson — *a contour on a lattice is a
 * staircase* — after the 1,010 phantom seam runs (grouped 4-connected, fixed by
 * grouping 8-connected) and the chessboard paving of diagonal streets. The fix
 * is the one that worked both previous times: build the face as a **course along
 * the contour** and finish it as one.
 *
 * 1. **Members** are what the old test found: on a platform, dry, 8-neighbour
 *    drop ≥ 2. Two or more, because one block of step is a kerb — a course you
 *    walk up, which the street pass already copes and which a facing would turn
 *    into a wall you trip over. The same number `skirtSeams` uses.
 * 2. Members are **grouped 8-connected**, exactly as `skirtSeams` groups its
 *    own and for exactly the same reason.
 * 3. **Drop-1 gaps are bridged.** A dry platform column whose own drop is 1
 *    joins the course when it is 8-adjacent to *two or more* members of one
 *    component — the stone–gap–stone signature of a contour dipping to a single
 *    block. A longer run of drop-1 columns touches at most one member at each
 *    end and stays out: there the face legitimately fades to a kerb, which is
 *    the street's course, not this one's. Recruits are decided in one region-order
 *    scan and committed after it, so a recruit can never recruit its own
 *    neighbour and the result does not depend on scan direction.
 * 4. **`thickenCourse` closes the diagonal**, because a unit-width band along a
 *    45° line spans ≈1.41 lattice columns and only a 4-connected course reads as
 *    masonry. It thickens with the *higher* ground preferred, which is **into
 *    the platform behind the edge** — never out onto the low side, where a
 *    painted column would be a patch of stone lying in the grass below the cut.
 * 5. Every course column gets **the hill's own rock** (`ground.stone`, the same
 *    symbol `buildColumnPlan` writes under a cliff) and a soil band as deep as
 *    its own drop. Its **surface is not touched**: whatever the terrain, the
 *    climate and the streets agreed on stays.
 *
 * ## Rock, not masonry — ratified by Kai 2026-08-07
 *
 * This step used to paint `ground.revetment` and cope the top course, which
 * dressed *every* unwalled cut in the theme's masonry. Walked: the hillside came
 * out as continuous built stonework and the town read as a quarry with a fortress
 * on it. A wall a sweep built is masonry because somebody built it; a cut nobody
 * walled is the hill, and the hill is rock. The original defect was **dirt** — a
 * four-block soil band showing under a stone kerb — and rock answers that
 * without claiming the whole slope was quarried. `deepen` therefore stays: the
 * face is solid rock to its full drop.
 *
 * @returns columns of course — members, gap recruits and thicken recruits alike.
 */
function faceCuts(
  region: Region,
  plan: ColumnPlan,
  levels: GroundLevels,
  states: RetainingStates,
  seam: Uint8Array,
  street: Uint8Array,
  occupied: Uint8Array,
): number {
  const bounds = levels.bounds;
  const cells = region.width * region.depth;

  /** The tallest face a column presents to any 8-neighbour; -1 if ineligible. */
  const drops = new Int32Array(cells).fill(-1);
  const dropOf = (k: number): number => {
    const known = drops[k] as number;
    if (known >= 0) return known;
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    const top = plan.ground[k] as number;
    let drop = 0;
    for (const [dx, dz] of SEAM_NEIGHBOURS) {
      if (!inside(region, x + dx, z + dz)) continue;
      const n = index(region, x + dx, z + dz);
      const fall = top - (plan.ground[n] as number);
      if (fall > drop) drop = fall;
    }
    drops[k] = drop;
    return drop;
  };
  /** On a platform of this quarter and not under water. */
  const facing = (x: number, z: number, k: number): boolean =>
    levels.at(x, z) !== NO_PLATFORM && plan.fluidKind[k] === FluidKind.NONE;

  // --- members ------------------------------------------------------------
  const course = new Uint8Array(cells);
  const members: number[] = [];
  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      if (!inside(region, x, z)) continue;
      const k = index(region, x, z);
      if (!facing(x, z, k)) continue;
      // A corner column shows its diagonal, and a diagonal face left raw is the
      // "arbitrary patch" the walk described — so the drop is 8-connected.
      if (dropOf(k) < 2) continue;
      course[k] = 1;
      members.push(k);
    }
  }
  if (members.length === 0) return 0;

  // --- components, 8-connected --------------------------------------------
  const component = new Int32Array(cells).fill(-1);
  let nextComponent = 0;
  for (const start of members) {
    if ((component[start] as number) >= 0) continue;
    const id = nextComponent++;
    component[start] = id;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head] as number;
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      for (const [dx, dz] of SEAM_NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (course[n] !== 1 || (component[n] as number) >= 0) continue;
        component[n] = id;
        queue.push(n);
      }
    }
  }

  // --- the drop-1 gaps ----------------------------------------------------
  // Decided in one scan and committed after it: a recruit that could recruit
  // its neighbour would walk the course along the whole kerb line.
  const recruits: number[] = [];
  for (let z = bounds.z0; z <= bounds.z1; z++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      if (!inside(region, x, z)) continue;
      const k = index(region, x, z);
      if (course[k] === 1) continue;
      if (!facing(x, z, k)) continue;
      if (dropOf(k) !== 1) continue;
      const touching = new Map<number, number>();
      for (const [dx, dz] of SEAM_NEIGHBOURS) {
        if (!inside(region, x + dx, z + dz)) continue;
        const n = index(region, x + dx, z + dz);
        if (course[n] !== 1) continue;
        const id = component[n] as number;
        touching.set(id, (touching.get(id) ?? 0) + 1);
      }
      for (const count of touching.values()) {
        if (count >= 2) {
          recruits.push(k);
          break;
        }
      }
    }
  }
  for (const k of recruits) course[k] = 1;

  // --- the diagonal -------------------------------------------------------
  // Preferring the *higher* ground is what points the thickening inward: the
  // column behind the edge stands level with the face's top, the column in
  // front of it is the ground below, and a stone patch lying in the grass down
  // there is the artifact rather than the fix. Drop cannot make this call —
  // it measures only downward falls, so the column at the foot of the cut
  // scores the same 0 as a flat column behind the edge and region order would
  // decide the side.
  thickenCourse(
    region,
    course,
    (idx, x, z) =>
      facing(x, z, idx) && occupied[idx] !== 1 && street[idx] !== 1,
    (idx) => plan.ground[idx] as number,
  );

  // --- the materials ------------------------------------------------------
  let faced = 0;
  for (let k = 0; k < cells; k++) {
    if (course[k] !== 1) continue;
    // A column a wall stands on already has the wall's material; all it wants
    // is the depth, so the wall does not sit on a dirt plinth of its own.
    if (seam[k] !== 1) plan.subsurface[k] = states.rock;
    deepen(plan, k, dropOf(k));
    faced++;
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
  driver: GroundDriver,
  /** `<nodePath>#bank@<job>` — the `verge` claim's source, unique and stable. */
  source: string,
  levels: GroundLevels,
  record: LevelSeam,
  floorY: number,
  street: Uint8Array,
  occupied: Uint8Array,
  states: RetainingStates,
  /**
   * Sink for §3.3b's `verge` claim: every ring column this call raised, at the
   * target it raised it to. Write-only and never read.
   */
  declare?: GroundClaim[],
): number {
  const view = driver.view();
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
  /** The ring targets, with the ground each was measured against (§9 step 2). */
  const rings: { readonly idx: number; readonly target: number; readonly g: number }[] = [];
  for (let ring = 0; ring < record.drop && frontier.length > 0; ring++) {
    const target = top - ring - 1;
    if (target <= floor) break;
    const next: number[] = [];
    for (const k of frontier) {
      const x = region.x0 + (k % region.width);
      const z = region.z0 + Math.floor(k / region.width);
      if (street[k] !== 1 && occupied[k] !== 1 && view.fluidKind[k] === FluidKind.NONE) {
        const g = view.ground[k] as number;
        if (target > g) {
          declare?.push({ idx: k, y: target });
          rings.push({ idx: k, target, g });
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

  // The rings are collected before anything is committed, which is sound because
  // a column belongs to exactly one ring: ring `k + 1` reads columns ring `k`
  // never claimed, so the answer is the one the interleaved form gave.
  //
  // §3.3b: `verge` is rank 140, the last built rank there is, so a bank can only
  // move ground nothing else claimed — inversion I5, which is the hand-written
  // guard list (street / footprint / water) restated as one rank. The guards
  // above stay for this round: deleting a defence the rank makes redundant is
  // §10's work, not a conversion's.
  if (rings.length === 0) return raised;
  driver.commit([
    {
      source,
      sourceClass: "verge",
      kind: "profile",
      columns: rings.map((r) => ({ idx: r.idx, y: r.target })),
      transition: "ramp",
    },
  ]);
  // §9 step 2's second loop, over the columns the bank **claimed**. Earth, and
  // enough of it to cover what the ramp raised: the face of a bank is the bank,
  // and it is not masonry. The depth follows the cut the claim asked for, whether
  // or not the rank let the bank have the column.
  for (const { idx, target, g } of rings) {
    plan.subsurface[idx] = states.bank;
    plan.soil[idx] = Math.min(255, Math.max(plan.soil[idx] as number, target - g + 1));
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

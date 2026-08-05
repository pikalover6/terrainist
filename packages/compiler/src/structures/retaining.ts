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
 * drawn before it existed; a seam column a street already claims is skipped
 * whole, since there the street *is* the connection and a wall across it would
 * be a wall across a road.
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
 * - the wall stands on the platform's own outermost column, which is inside the
 *   block and so outside the sidewalk band the streetscape re-levels, and any
 *   column a street actually claims is dropped before anything is swept;
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
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** The block states the pass writes. */
interface RetainingStates {
  readonly coping: number;
  readonly weep: number;
  /** Palette symbol for the balustrade — resolved inside `sweep`. */
  readonly rail: string;
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
   */
  readonly profile: SweptProfile;
}

function resolveStates(palette: Palette, stack: PrismarineStack): RetainingStates {
  const fallback = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const at = (symbol: string, name: string): number =>
    palette.has(symbol) ? palette.state(symbol) : fallback(name);
  const symbol = (name: string, fall: string): string => (palette.has(name) ? name : fall);
  const faces: Readonly<Record<string, readonly [string, string]>> = {
    "street.curb": ["street.curb", "minecraft:stone_bricks"],
    "ground.stone": ["ground.stone", "minecraft:stone"],
    "street.sidewalk": ["street.sidewalk", "minecraft:smooth_stone"],
  };
  const resolve = (s: string): string => {
    const row = faces[s];
    return row === undefined ? s : symbol(row[0], row[1]);
  };
  const profile: SweptProfile = {
    ...RETAINING_PROFILE,
    bands: RETAINING_PROFILE.bands.map((band) => ({
      ...band,
      surface: resolve(band.surface),
      ...(band.fill === undefined ? {} : { fill: resolve(band.fill) }),
    })),
  };
  return {
    profile,
    coping: at("street.curb", "minecraft:stone_bricks"),
    // What makes a retaining wall read as *old* rather than as a slab, and it
    // is one block every nine columns.
    weep: fallback("minecraft:mossy_stone_bricks"),
    rail: "stone_brick_wall",
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

  const relevant = input.districts.filter((d) => d.levels !== undefined);
  if (relevant.length === 0) {
    return { blocks, seam, walls, wallColumns, kerbs, banks, built, diagnostics };
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
        kerbs += kerbSeam(region, plan, record, states, street) > 0 ? 1 : 0;
        continue;
      }
      if (record.treatment === "bank") {
        banks++;
        gradeBank(region, plan, levels, record, floorY, street, occupied);
        const short = record.cells.length < MIN_RETAIN_RUN;
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
      const inFace = new Uint8Array(cells);
      let blockedByBuilding = 0;
      for (const point of record.cells) {
        for (const [dx, dz] of NEIGHBOURS) {
          const x = point.x + dx;
          const z = point.z + dz;
          if (!inside(region, x, z)) continue;
          if (levels.at(x, z) !== record.above) continue;
          const k = index(region, x, z);
          if (inFace[k] === 1) continue;
          inFace[k] = 1;
          if (occupied[k] === 1) {
            blockedByBuilding++;
            continue;
          }
          if (street[k] === 1) continue;
          if (plan.fluidKind[k] !== FluidKind.NONE) continue;
          face.push(k);
        }
      }
      let total = 0;
      for (let k = 0; k < cells; k++) total += inFace[k] === 1 ? 1 : 0;
      if (total === 0) continue;
      if (blockedByBuilding >= total * RETAIN_BUILT_SHARE) {
        built++;
        continue;
      }
      if (face.length === 0) continue;

      // A one-column course on a diagonal is a sawtooth. Thicken outward —
      // into the low side, never into the platform the wall holds.
      const course = new Uint8Array(cells);
      for (const k of face) course[k] = 1;
      thickenCourse(
        region,
        course,
        (idx) =>
          occupied[idx] !== 1 &&
          street[idx] !== 1 &&
          plan.fluidKind[idx] === FluidKind.NONE &&
          levels.at(region.x0 + (idx % region.width), region.z0 + Math.floor(idx / region.width)) !==
            record.above,
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
        const path = orient(region, chain, levels, record.above);
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
  }

  if (walls + kerbs + banks + built > 0) {
    diagnostics.push(
      note(
        "SWEEP_FEATURES_PLACED",
        relevant[0]?.nodePath ?? "world",
        `multi-level ground: ${walls} retaining wall(s) over ${wallColumns} column(s), ${kerbs} kerb seam(s), ${banks} bank(s), and ${built} seam(s) a building already stood on`,
        "No action needed.",
      ),
    );
  }

  return { blocks, seam, walls, wallColumns, kerbs, banks, built, diagnostics };
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
): number {
  let laid = 0;
  for (const point of record.cells) {
    if (!inside(region, point.x, point.z)) continue;
    const k = index(region, point.x, point.z);
    if (street[k] === 1) continue;
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
 */
function gradeBank(
  region: Region,
  plan: ColumnPlan,
  levels: GroundLevels,
  record: LevelSeam,
  floorY: number,
  street: Uint8Array,
  occupied: Uint8Array,
): void {
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
          if (plan.soil[k] === 0) plan.soil[k] = 1;
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
): Vec2[] {
  const path = [...chain];
  if (path.length < 2) return path;
  let onPlatform = 0;
  let off = 0;
  for (const column of sweptColumns(region, path, { lo: 0, hi: 1 })) {
    if (column.lane !== 1) continue;
    const platform = levels.at(column.x, column.z);
    if (platform === above) onPlatform++;
    else off++;
  }
  return off > onPlatform ? [...path].reverse() : path;
}

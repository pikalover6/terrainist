/**
 * Where the N instances of a plugin program stand.
 *
 * `scatter.program@0` reuses the scatter vocabulary the other scatter
 * generators already speak — a coarse `area`, a `spacing`, an eligibility band
 * — and its own fitness helper ({@link programGroundPlane}, which refuses a
 * fluid column and a site rougher than a cliff's worth of relief). That reuse is
 * the point: **a program never learns where it is**, which is how the
 * no-absolute-coordinates law survives contact with model-written code.
 *
 * Candidates come from a jittered sample *finer* than the exclusion distance,
 * served in an order the seed decides and a coarse cluster field leans — so a
 * scatter reads as a stand of trees rather than an orchard. Every draw is keyed
 * on the candidate's own cell, so the site list is a pure function of the seed,
 * the params and the ground — never of iteration or completion order. The list
 * is handed back in row-major order, so instance `index` is still a property of
 * the geometry rather than of who was served first.
 */

import type { ProgramScatterParams, SeatDecision } from "@terrainist/spec";
import { hoverOfParams, seatOfParams } from "@terrainist/spec";
import { positionFloat, positionInt, type Region, type Seed256 } from "@terrainist/stdlib";
import { streamSeed } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";
import type { OccupancyGrid } from "../layout/types.js";
import { SITE_FRONTAGE_REACH } from "../layout/types.js";
import type { StreetDatum } from "../layout/street-datum.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { FluidKind } from "../terrain/columns.js";
import { rotateLocalPoint, rotatedFootprint, type ProgramRotation } from "./rotate.js";

/**
 * Roughness a program site tolerates before it is refused outright.
 *
 * A program is not a cart: it is a landmark-sized thing the compiler pads under
 * (see the pass's `seat` handling), so ground that is merely *rough* must be
 * padded rather than refused — refusing it is why a count-18 scatter used to
 * place sixteen. What survives is a sanity ceiling, so nothing is ever seated
 * across a cliff: past this, the pad would be a tower and the structure would
 * read as a plinth with a hat.
 */
export const PROGRAM_MAX_RELIEF = 16;

/**
 * Fill a site may need before the placer looks for a gentler one.
 *
 * **The walked defect (Kai, final battery deck):** bespoke sites "sit on
 * raised, hard-edged platforms instead of integrating with the terrain". Half
 * of that is the pad's own edge, which {@link programApronRings} now grades
 * out; the other half is choosing to stand somewhere that needs a pad that tall
 * in the first place. Relief was the only ground test — a site could be
 * perfectly *even* and still four blocks of fill under half its footprint,
 * because the seat plane is the median.
 *
 * So the queue is walked twice: once refusing anything that needs more than
 * this much fill, and again — only if the count is still short — with the
 * ceiling off. Four blocks is an eight-column apron, which reads as ground; it
 * is also the point past which the fill is taller than a player, which is when
 * a plinth stops being a footing and starts being a podium.
 *
 * Never a *refusal*: a scatter that can only be satisfied on lumpy ground still
 * gets its count, on the same sites it got before, because the second walk sees
 * exactly the queue the first one did.
 */
export const PROGRAM_GENTLE_LIFT = 4;

/** Counts refusals a caller wants to report rather than swallow. */
export interface SiteRefusals {
  /** Candidates a cliff refused — the ones worth a diagnostic. */
  cliff: number;
}

/**
 * The world Y of the plane a program's seat meets, or `undefined` when the
 * ground will not do.
 *
 * The **median** column plus one, not the maximum: a single outlier boulder
 * under a 30-block hull used to lift the whole structure a metre into the air,
 * which is exactly the "just placed in" defect this replaces. The median is the
 * plane most of the footprint already agrees with; the columns below it are
 * raised to meet it by `levelPropPad`, and the few above it are simply
 * occluded by their own terrain.
 *
 * Every column still has to be dry and inside the region. Relief is refused
 * only past {@link PROGRAM_MAX_RELIEF}, and the refusal is counted into
 * `refusals` so the caller can say so out loud.
 *
 * `allowFluid` is `seat: "wade"` and nothing else: a wading instance stands on
 * the seabed on purpose, so a fluid column is the site it wanted rather than a
 * reason to refuse it. `plan.ground` is already the solid ground under the
 * water, so the plane this returns needs no adjustment — the waterline simply
 * cuts whatever is built on it. The cliff ceiling still applies: a seabed that
 * falls away like a cliff is no better a footing than a dry one.
 */
export function programGroundPlane(
  plan: ColumnPlan,
  rect: Rect,
  refusals?: SiteRefusals,
  allowFluid = false,
): number | undefined {
  const { region } = plan;
  const heights: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return undefined;
      const idx = j * region.width + i;
      if (!allowFluid && plan.fluidKind[idx] !== FluidKind.NONE) return undefined;
      const g = plan.ground[idx] as number;
      heights.push(g);
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    }
  }
  /* c8 ignore next — a rect always has at least one column. */
  if (heights.length === 0) return undefined;
  if (hi - lo > PROGRAM_MAX_RELIEF) {
    if (refusals !== undefined) refusals.cliff += 1;
    return undefined;
  }
  heights.sort((a, b) => a - b);
  return (heights[heights.length >> 1] as number) + 1;
}

/**
 * The seat plane the **street datum** gives a bespoke site — 8E.
 *
 * `docs/GROUND-UNIFICATION-v0.md` §1.6, the bespoke-site client of F1:
 *
 * > A bespoke site whose footprint has a banded column within `SITE_FRONTAGE_REACH`
 * > takes its seat plane from the datum, not from `programGroundPlane`'s
 * > median — **whether it conforms or pads**.
 *
 * Which is why this is applied after the eligibility walk rather than inside
 * {@link programGroundPlane}: the median, the relief ceiling, the fluid test and
 * the lift budget all still decide *whether* a site is acceptable, and only the
 * plane it seats at comes from the datum. `programs/road-anchors.ts` gives a
 * resolved port `floorY = placement.foundationY`; without this a lane graded to
 * the datum arrives at a plinth whose top is the median of a hillside, which is
 * the defect this closes by construction.
 *
 * One `levelNear` per datum from the footprint's centre, at
 * `SITE_FRONTAGE_REACH` grown by half the footprint's diagonal, so the reach is
 * measured from the footprint rather than from its middle. Datums are consulted
 * in the caller's order — district order, therefore the document's — and the
 * first that answers wins; within one datum `levelNear` breaks ties by ascending
 * region index (F11). No RNG and no iteration order.
 *
 * Returns the plane the instance's node-local `y = 0` sits at (`level + 1`, the
 * first air column above the carriageway surface — the same convention
 * {@link programGroundPlane} and {@link conformSeatPlane} return), or
 * `undefined` when no datum reaches the footprint.
 */
export function datumSeatPlane(
  datums: readonly (StreetDatum | undefined)[],
  rect: Rect,
  reach: number = SITE_FRONTAGE_REACH,
): number | undefined {
  const w = rect.x1 - rect.x0 + 1;
  const d = rect.z1 - rect.z0 + 1;
  const cx = rect.x0 + ((w - 1) >> 1);
  const cz = rect.z0 + ((d - 1) >> 1);
  const r = reach + Math.ceil(Math.hypot(w - 1, d - 1) / 2);
  for (const datum of datums) {
    if (datum === undefined) continue;
    const level = datum.levelNear(cx, cz, r);
    if (level !== undefined) return level + 1;
  }
  return undefined;
}

/**
 * The world Y a **conforming** instance's seat plane goes on.
 *
 * `docs/GROUND-UNIFICATION-v0.md` §2.7.2. The front anchor's own column plus
 * one, not the median: the seat plane is the origin of `api.heightAt`, and
 * prompt rule 6 teaches "0 where the ground meets it, negative where the ground
 * falls away". A lowest-contact plane would make `heightAt` ≥ 0 everywhere and
 * silently invert that teaching for every program already written; the front
 * anchor keeps the rule true word for word, and it is also the level a road
 * arrives at, so one number serves both.
 *
 * With no front column — a program that declared no front is never turned and
 * has no face to arrive at — this is `programGroundPlane` unchanged, median and
 * all, which is also what it falls back to when the named column is outside the
 * region.
 */
export function conformSeatPlane(
  plan: ColumnPlan,
  rect: Rect,
  frontColumn?: { readonly x: number; readonly z: number },
): number | undefined {
  if (frontColumn === undefined) return programGroundPlane(plan, rect);
  const { region } = plan;
  const i = frontColumn.x - region.x0;
  const j = frontColumn.z - region.z0;
  if (i < 0 || j < 0 || i >= region.width || j >= region.depth) {
    return programGroundPlane(plan, rect);
  }
  return (plan.ground[j * region.width + i] as number) + 1;
}

/**
 * Ground relief across `rect` — the highest column less the lowest.
 *
 * What {@link PROGRAM_GENTLE_LIFT} measures for a **conforming** site (§2.7.5):
 * there is no fill under one, so "how tall is the plinth" has no answer, and
 * the question that replaces it is "how much ground does this thing have to
 * follow". Columns outside the region are skipped, exactly as
 * {@link padLiftUnder} skips them.
 */
export function reliefUnder(plan: ColumnPlan, rect: Rect): number {
  const { region } = plan;
  let lo = Infinity;
  let hi = -Infinity;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
      const g = plan.ground[j * region.width + i] as number;
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    }
  }
  return Number.isFinite(lo) ? hi - lo : 0;
}

/**
 * How deep the pad under `rect` would have to fill to reach `baseY`.
 *
 * The pad's top is `baseY − 1` and its deepest column is the lowest ground
 * under the footprint, so this is the height of the plinth's tallest face —
 * what a walker sees standing beside the thing, and what
 * {@link PROGRAM_GENTLE_LIFT} is measured in. Columns outside the region are
 * skipped rather than refused: the site tests already refused those.
 */
export function padLiftUnder(plan: ColumnPlan, rect: Rect, baseY: number): number {
  const { region } = plan;
  let lift = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
      const g = plan.ground[j * region.width + i] as number;
      if (baseY - 1 - g > lift) lift = baseY - 1 - g;
    }
  }
  return lift;
}

/**
 * The highest ground column under `rect`, or `undefined` when the rect leaves
 * the region.
 *
 * What a hovering site stands on instead of {@link programGroundPlane}: the
 * *maximum*, not the median, because hover is clearance — every column under
 * the footprint has to be below the hull, including the boulder. Fluid and
 * relief are not consulted at all: they are statements about seating, and this
 * site never seats.
 */
export function topGroundUnder(plan: ColumnPlan, rect: Rect): number | undefined {
  const { region } = plan;
  let top = -Infinity;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return undefined;
      const g = plan.ground[j * region.width + i] as number;
      if (g > top) top = g;
    }
  }
  /* c8 ignore next — a rect always has at least one column. */
  return Number.isFinite(top) ? top : undefined;
}

/** One resolved instance site. */
export interface ProgramSite {
  /** Instance index — the position in this list, and the seed's `index`. */
  readonly index: number;
  /** World footprint, inclusive, the size of the program's `[w, d]` **after rotation**. */
  readonly footprint: Rect;
  /**
   * The quarter turn this instance stands at, when it declared a front.
   *
   * Decided here rather than at build time because it is the thing that swaps
   * the footprint's edges: a site is chosen for the box the instance will
   * actually occupy, and the pass reads the answer back off the site rather
   * than deciding it a second time.
   */
  readonly rotation?: ProgramRotation;
  /**
   * World Y of the plane the instance seats on.
   *
   * For a hovering site this is the node-local `y = 0` outright; for a seated
   * one it is the *ground* plane, and the pass derives the final `y = 0` from
   * it and the run's `seatY`.
   */
  readonly baseY: number;
}

/** Everything {@link planProgramSites} reads. */
export interface ProgramPlacementInput {
  readonly params: ProgramScatterParams;
  /** The program's declared `[w, h, d]`. */
  readonly envelope: readonly [number, number, number];
  readonly plan: ColumnPlan;
  readonly seed: Seed256;
  /** Footprints already claimed; an instance never lands on one. */
  readonly taken?: readonly Rect[];
  readonly occupancy?: OccupancyGrid;
  /** Filled in with the candidates a cliff refused, for the caller to report. */
  readonly refusals?: SiteRefusals;
  /**
   * The quarter turn an instance centred at `(x, z)` takes, when this node's
   * program declared a front.
   *
   * Asked **before** the candidate is measured, because a 90° or 270° turn
   * swaps the footprint's edges and the whole point of a candidate test is the
   * footprint. The point handed in is the candidate's *unrotated* centre — a
   * position that does not depend on the answer, which is what keeps this from
   * chasing its own tail — and the difference that makes is at most half an
   * envelope, which snapping to a cardinal absorbs.
   */
  readonly rotationAt?: (x: number, z: number) => ProgramRotation;
  /**
   * The seat the pass resolved for this node, verdict and all.
   *
   * `params.seat` alone cannot answer it any more: the default now depends on
   * the record's `conforms` verdict (`docs/GROUND-UNIFICATION-v0.md` §2.2), and
   * the placer needs the answer for two decisions — a wading site is allowed
   * its water, and a conforming site is measured by *relief* rather than by
   * fill (§2.7.5). Absent, this falls back to `seatOfParams`, which is exactly
   * what it read before and is why a document with no verdict places
   * identically.
   */
  readonly seat?: SeatDecision;
  /**
   * The quarters' street datums — 8E's bespoke-site client of F1
   * ({@link datumSeatPlane}).
   *
   * Absent for every compile while `FRONTAGE_TIE` is off: no quarter grades a
   * datum, so the pass is handed none and the tied branch is dead.
   */
  readonly datums?: readonly (StreetDatum | undefined)[];
}

/**
 * The world column the instance's **front** stands on, or `undefined` when the
 * program declared no front and was therefore never turned.
 *
 * The front is built toward local −Z (`FRONT_ANCHOR`), so the front column is
 * the middle of the local `z = 0` edge, turned into the world frame by the same
 * `rotateLocalPoint` the run itself is turned by. Geometric on purpose: the
 * seat plane is the origin of `api.heightAt` and therefore has to be known
 * *before* the run, which is before any anchor the program publishes exists.
 */
export function frontColumnOf(
  rect: Rect,
  rotation: ProgramRotation | undefined,
  envelope: readonly [number, number, number],
): { readonly x: number; readonly z: number } {
  const [w, , d] = envelope;
  const [rx, rz] = rotateLocalPoint(Math.floor((w - 1) / 2), 0, rotation ?? 0, w, d);
  return { x: rect.x0 + rx, z: rect.z0 + rz };
}

/**
 * How many candidate sites the sample offers per exclusion step, on each axis.
 *
 * The old walk offered exactly one: a lattice whose stride *was* the exclusion
 * distance, so every candidate that survived stood at a lattice point and the
 * result read as a grid from the ground (Kai's walk of `redwood_camp`: 24
 * colossal redwoods, nearest-neighbour CV 0.20, 58% of them axis-aligned).
 * Subdividing gives the sample somewhere else to be; the exclusion test, not
 * the stride, is what keeps them apart.
 */
const CANDIDATE_SUBDIVISION = 3;

/** A ceiling on the candidate sample, so a huge area cannot cost unboundedly. */
const CANDIDATE_BUDGET = 20000;

/** §6.4 channels — the two draws that shape a candidate's *position*. */
const CHANNEL_JITTER_X = 0;
const CHANNEL_JITTER_Z = 1;
/** The per-candidate order roll: which candidate gets first refusal. */
const CHANNEL_ORDER = 2;
/** The coarse field that makes a stand of redwoods a *stand*. */
const CHANNEL_CLUSTER = 3;

/**
 * How far the cluster field may move a candidate's place in the queue.
 *
 * Same shape as the ruin roll's clustering (`RUIN_CLUSTER_AMPLITUDE`): one
 * extra positional draw, keyed at a *coarse* cell so neighbours share it,
 * leaning an otherwise uniform roll. Greedy hardcore acceptance turns that lean
 * into geometry — a high-cluster patch is served first and packs down to the
 * exclusion distance, and what is left over fills the thin ground later and
 * further apart. It is a lean, never an override: every part of the area is
 * still reachable, which is what keeps the requested count attainable.
 */
const CLUSTER_AMPLITUDE = 0.6;

/** How many exclusion steps wide one cluster patch is. */
const CLUSTER_PATCH_STEPS = 3;

/** One position the sample offers, with the roll that orders it. */
interface Candidate {
  readonly x: number;
  readonly z: number;
  readonly rank: number;
}

/** Resolve up to `params.count` sites, in a deterministic row-major order. */
export function planProgramSites(input: ProgramPlacementInput): readonly ProgramSite[] {
  const { params, plan } = input;
  const [w, , d] = input.envelope;
  const region = plan.region;
  const area = areaRect(region, params.area);
  const spacing = Math.max(params.spacing ?? 0, 1);
  const step = Math.max(w, d) + spacing;
  const stream = streamSeed(input.seed, "scatter");
  // A hovering scatter floats every instance, so the ground's *fitness* has no
  // say — no fluid test, no relief test — and it competes with nobody for the
  // dirt. What survives is the region, the author's `area` and `avoidTags`,
  // and `spacing` against its own siblings, so two saucers never share a sky.
  const hover = hoverOfParams(params);
  // A wading scatter — a bay full of half-sunk wrecks — is the one kind whose
  // sites are *supposed* to have water in them.
  const policy = (input.seat ?? seatOfParams(params)).policy;
  const wades = hover === undefined && policy === "wade";
  // A conforming site is never padded either, so the gentle walk's ceiling is a
  // *relief* ceiling instead of a fill ceiling (§2.7.5): same two walks, same
  // "never a refusal" guarantee, different measurement.
  const conforms = hover === undefined && policy === "conform";

  const queue = sampleCandidates(area, step, stream);

  /**
   * One greedy walk of the queue under a fill ceiling.
   *
   * `budgets` are tried in order and each continues where the last stopped, so
   * `[gentle, Infinity]` means "take the gentle sites first, then fill the
   * shortfall from what is left". `countRefusals` keeps the cliff tally the
   * diagnostic quotes from being counted once per walk.
   */
  const walk = (budgets: readonly number[], countRefusals: boolean): ProgramSite[] => {
    const claimed: Rect[] = hover === undefined ? [...(input.taken ?? [])] : [];
    const sites: ProgramSite[] = [];
    for (const maxLift of budgets) {
      if (sites.length >= params.count) break;

      for (const cand of queue) {
        if (sites.length >= params.count) break;
        const { x: cx, z: cz } = cand;
        const rotation =
          input.rotationAt?.(cx + Math.floor((w - 1) / 2), cz + Math.floor((d - 1) / 2)) ?? 0;
        const [fw, fd] = rotatedFootprint(w, d, rotation);
        const rect: Rect = { x0: cx, z0: cz, x1: cx + fw - 1, z1: cz + fd - 1 };
        if (!insideRect(rect, area)) continue;
        if (claimed.some((r) => overlaps(r, rect, spacing))) continue;
        if (!areaAdmits(params.area, region, rect)) continue;
        // `avoidTags` is honoured whether or not the instance floats: fluid and
        // relief are statements about ground a thing stands on and a hovering
        // instance is exempt from those, but `avoidTags` is a statement the
        // *author* made, and a param the compiler accepts and quietly ignores is
        // a document that lies. What a hovering instance does skip is the plain
        // occupancy mask — see `occupied`.
        if (
          input.occupancy !== undefined &&
          occupied(input.occupancy, rect, params.avoidTags, hover !== undefined)
        ) {
          continue;
        }
        let baseY: number | undefined;
        if (hover !== undefined) {
          const top = topGroundUnder(plan, rect);
          if (top === undefined) continue;
          baseY = top + hover;
        } else {
          // Refusals are counted on one walk only: the same cliff seen twice is one
          // cliff, and the diagnostic quotes this number.
          baseY = programGroundPlane(
            plan,
            rect,
            countRefusals && maxLift === Infinity ? input.refusals : undefined,
            wades,
          );
          if (baseY === undefined) continue;
          if (!reliefOk(plan, rect, params, fw, fd)) continue;
          // A wading site is never padded, so it has no lift to be gentle about.
          if (conforms) {
            if (reliefUnder(plan, rect) > maxLift) continue;
            // The seat plane of a conforming instance is the front anchor's own
            // column, not the median the eligibility test just computed.
            baseY =
              conformSeatPlane(
                plan,
                rect,
                // No `rotationAt` means the node declared no face, and a
                // program with no front has no face to arrive at: the median,
                // exactly as before.
                input.rotationAt === undefined
                  ? undefined
                  : frontColumnOf(rect, rotation, input.envelope),
              ) ?? baseY;
          } else if (!wades && padLiftUnder(plan, rect, baseY) > maxLift) continue;
          // F1, last word on the plane and only on the plane: every test above
          // — fluid, relief, the lift budget, the conforming front anchor —
          // has already decided that this *is* the site. A site the datum
          // reaches then seats at its street's level rather than at the median
          // of its own footprint, whether it conforms or pads (§1.6).
          // `wades` is excluded: a wading seat is a seabed and a waterline, not
          // a frontage, and F6's exclusions are about exactly that kind of
          // claimant.
          if (input.datums !== undefined && !wades) {
            baseY = datumSeatPlane(input.datums, rect) ?? baseY;
          }
        }
        if (params.elevation !== undefined) {
          const [lo, hi] = params.elevation;
          if (baseY < lo || baseY > hi) continue;
        }
        claimed.push(rect);
        sites.push({
          index: sites.length,
          footprint: rect,
          baseY,
          ...(rotation === 0 ? {} : { rotation }),
        });
      }
    }
    return sites;
  };

  // The plain walk is the one that decides how many instances this ground can
  // hold; the gentle walk is preferred **only when it holds just as many**.
  // Standing on kinder ground is worth a lot, but never worth an instance: the
  // count is a request the author made, and W337 exists because quietly
  // rounding it down was already a defect once.
  const plain = walk([Infinity], true);
  const sites =
    hover !== undefined
      ? plain
      : ((): ProgramSite[] => {
          const gentle = walk([PROGRAM_GENTLE_LIFT, Infinity], false);
          return gentle.length >= plain.length ? gentle : plain;
        })();

  // Acceptance order is a queue, not an identity. The list the caller sees is
  // sorted back into row-major order, so instance `index` remains a property of
  // the geometry — the promise this module opened with, and the reason a run's
  // seed does not depend on which candidate happened to be served first.
  const ordered = [...sites].sort((a, b) =>
    a.footprint.z0 - b.footprint.z0 || a.footprint.x0 - b.footprint.x0,
  );
  return ordered.map((s, i) => ({ ...s, index: i }));
}

/**
 * The positions the placer will consider, best-first.
 *
 * A jittered sample on a lattice finer than the exclusion distance
 * ({@link CANDIDATE_SUBDIVISION}), each cell's point drawn inside its own cell
 * so the sample is near-uniform rather than a grid with a wobble; then ordered
 * by a per-candidate roll leaned by a coarse cluster field. Every draw is keyed
 * on the candidate's own cell — no counter, no iteration order — so the queue
 * is a pure function of the seed, the params and the area.
 */
function sampleCandidates(area: Rect, step: number, stream: Seed256): readonly Candidate[] {
  let cell = Math.max(1, Math.round(step / CANDIDATE_SUBDIVISION));
  const w = area.x1 - area.x0 + 1;
  const d = area.z1 - area.z0 + 1;
  // Keep the sample affordable on a very large area: coarsen until it fits.
  while (Math.ceil(w / cell) * Math.ceil(d / cell) > CANDIDATE_BUDGET) cell += 1;
  const patch = Math.max(1, step * CLUSTER_PATCH_STEPS);
  const jitter = Math.max(0, cell - 1);

  const out: Candidate[] = [];
  for (let cz = area.z0; cz <= area.z1; cz += cell) {
    for (let cx = area.x0; cx <= area.x1; cx += cell) {
      const x = cx + (jitter === 0 ? 0 : positionInt(stream, cx, CHANNEL_JITTER_X, cz, 0, jitter));
      const z = cz + (jitter === 0 ? 0 : positionInt(stream, cx, CHANNEL_JITTER_Z, cz, 0, jitter));
      const px = Math.floor(cx / patch) * patch;
      const pz = Math.floor(cz / patch) * patch;
      const cluster = positionFloat(stream, px, CHANNEL_CLUSTER, pz);
      const roll = positionFloat(stream, cx, CHANNEL_ORDER, cz);
      out.push({ x, z, rank: roll - CLUSTER_AMPLITUDE * (cluster - 0.5) });
    }
  }
  out.sort((a, b) => a.rank - b.rank || a.z - b.z || a.x - b.x);
  return out;
}

/**
 * The coarse placement hint a node's `constraints` carry, as an area.
 *
 * `zone` and `at` are the only two things a document says about placement
 * without saying a coordinate, and they are the only two a landmark's ground
 * search can act on where there is no layout solver. One reader, used by the
 * placer here and by `programs/facing.ts` (which needs the same estimate before
 * anything is placed), so the two can never disagree about what a document
 * asked for.
 *
 * Returns `undefined` when the node declares neither, which is every document
 * written before the hint existed.
 */
export function coarseHintArea(
  node: { readonly constraints?: readonly Readonly<Record<string, unknown>>[] },
  region: Region,
): ProgramScatterParams["area"] | undefined {
  for (const constraint of node.constraints ?? []) {
    const zone = constraint["zone"];
    if (typeof zone === "string" && zone in ZONE_CELLS) return { zone };
    const at = constraint["at"];
    if (Array.isArray(at) && at.length === 2 && typeof at[0] === "number" && typeof at[1] === "number") {
      // The same neighbourhood the solver's `at` calls zero-cost: a tolerance
      // the author named, else 5% of the region's half-diagonal (§4.9.4).
      const tolerance =
        typeof constraint["tolerance"] === "number"
          ? (constraint["tolerance"] as number)
          : typeof constraint["radius"] === "number"
            ? (constraint["radius"] as number)
            : AT_TOLERANCE_SHARE * 0.5 * Math.sqrt(region.width * region.width + region.depth * region.depth);
      const half = Math.min(region.width, region.depth) * 0.5;
      return {
        at: [at[0] as number, at[1] as number],
        radius: half <= 0 ? 0 : Math.max(0, tolerance) / half,
      };
    }
  }
  return undefined;
}

/** Fraction of the region's half-diagonal an `at` hint is zero-cost within. */
const AT_TOLERANCE_SHARE = 0.05;

/**
 * The point a coarse hint names — the zone cell's centre, or the `at`
 * fraction's column. The *unclamped* point, deliberately: this answers "where
 * did the author point", which is what a facing measures against, while
 * {@link coarseHintArea} answers "which ground may be searched", which has to
 * stay inside the region.
 */
export function coarseHintPoint(
  node: { readonly constraints?: readonly Readonly<Record<string, unknown>>[] },
  region: Region,
): { readonly x: number; readonly z: number } | undefined {
  const area = coarseHintArea(node, region);
  if (area === undefined) return undefined;
  if (!("at" in area)) {
    const rect = areaRect(region, area);
    return { x: Math.floor((rect.x0 + rect.x1) / 2), z: Math.floor((rect.z0 + rect.z1) / 2) };
  }
  const [fx, fz] = area.at;
  return {
    x: region.x0 + Math.round(fx * (region.width - 1)),
    z: region.z0 + Math.round(fz * (region.depth - 1)),
  };
}

/** Everything {@link planLandmarkSite} reads. */
export interface LandmarkPlacementInput {
  /** The program's declared `[w, h, d]`. */
  readonly envelope: readonly [number, number, number];
  readonly plan: ColumnPlan;
  readonly seed: Seed256;
  readonly taken?: readonly Rect[];
  readonly refusals?: SiteRefusals;
  /** `seat: "wade"`: the site may (and wants to) contain water. */
  readonly wades?: boolean;
  /** The quarter turn this landmark takes, already decided. */
  readonly rotation?: ProgramRotation;
  /**
   * Where the node's `constraints` point ({@link coarseHintArea}). The centre
   * of *this* is tried first, and the fallback walk is confined to it before it
   * is allowed the whole region.
   */
  readonly hint?: ProgramScatterParams["area"];
  /**
   * The quarters' street datums — 8E's bespoke-site client of F1
   * ({@link datumSeatPlane}).
   *
   * Absent for every compile while `FRONTAGE_TIE` is off: no quarter grades a
   * datum, so the pass is handed none and the tied branch is dead.
   */
  readonly datums?: readonly (StreetDatum | undefined)[];
}

/**
 * The single site of an `authored:<id>` node **without a layout solver.**
 *
 * The terrain profile has no solver and no occupancy, so a landmark's site is
 * decided by the ground alone: the region's centre first — the one placement an
 * author can predict from the document — and, if the centre column will not
 * hold the footprint (fluid, or too rough), the ordinary scatter walk over the
 * whole region, which is the same deterministic sample a plugin node uses.
 * Returns `undefined` when nothing in the region fits, which the caller reports
 * as `PROGRAM_DROPPED` rather than silence.
 */
export function planLandmarkSite(input: LandmarkPlacementInput): ProgramSite | undefined {
  const { plan } = input;
  const rotation = input.rotation ?? 0;
  const turned = rotation === 0 ? {} : { rotation };
  // The box the landmark will actually stand in: a quarter turn swaps its
  // edges, and a site chosen for the unturned box would be the wrong hole.
  const [w, d] = rotatedFootprint(input.envelope[0], input.envelope[2], rotation);
  const region = plan.region;
  const whole = areaRect(region, undefined);
  // The hint's neighbourhood, or the whole region when the node named none —
  // in which case every line below is the centre-then-scatter it always was.
  const wanted = input.hint === undefined ? whole : areaRect(region, input.hint);

  const cx = wanted.x0 + Math.floor((wanted.x1 - wanted.x0 + 1 - w) / 2);
  const cz = wanted.z0 + Math.floor((wanted.z1 - wanted.z0 + 1 - d) / 2);
  const centred: Rect = { x0: cx, z0: cz, x1: cx + w - 1, z1: cz + d - 1 };
  const taken = input.taken ?? [];
  if (insideRect(centred, whole) && !taken.some((r) => overlaps(r, centred, 0))) {
    const median = programGroundPlane(plan, centred, input.refusals, input.wades === true);
    if (median !== undefined) {
      // §1.6, the same law as the scatter walk: the ground decided whether the
      // centre will hold this landmark, the datum decides what plane it holds
      // it at. `wade` is excluded — a wading seat is a seabed, not a frontage.
      const baseY =
        input.datums === undefined || input.wades === true
          ? median
          : datumSeatPlane(input.datums, centred) ?? median;
      return { index: 0, footprint: centred, baseY, ...turned };
    }
  }

  // The hinted neighbourhood first, the whole region only if nothing in it
  // will hold the footprint: a hint moves a landmark, it never drops one.
  const areas: readonly (ProgramScatterParams["area"] | undefined)[] =
    input.hint === undefined ? [undefined] : [input.hint, undefined];
  for (const area of areas) {
    const [site] = planProgramSites({
      params: {
        program: "",
        count: 1,
        ...(area === undefined ? {} : { area }),
        ...(input.wades === true ? { seat: "wade" } : {}),
      } as unknown as ProgramScatterParams,
      envelope: input.envelope,
      plan,
      seed: input.seed,
      taken,
      ...(input.refusals === undefined ? {} : { refusals: input.refusals }),
      ...(rotation === 0 ? {} : { rotationAt: (): ProgramRotation => rotation }),
      ...(input.datums === undefined ? {} : { datums: input.datums }),
    });
    if (site !== undefined) return site;
  }
  return undefined;
}

/** Everything {@link planHoverSite} reads. */
export interface HoverPlacementInput {
  /** The program's declared `[w, h, d]`. */
  readonly envelope: readonly [number, number, number];
  readonly plan: ColumnPlan;
  /** Blocks between the highest ground under the footprint and node-local y=0. */
  readonly hover: number;
  /** The `zone` constraint's zone, if the node wrote one. */
  readonly zone?: string;
  /**
   * The node's coarse hint ({@link coarseHintArea}), used when it wrote no
   * `zone`: an `at` fraction says where a floating thing hangs just as well as
   * a nine-grid cell does, and used to be dropped on the floor.
   */
  readonly hint?: ProgramScatterParams["area"];
  /** The quarter turn this landmark takes, already decided. */
  readonly rotation?: ProgramRotation;
}

/**
 * The site of a **hovering** `authored:<id>` node.
 *
 * Nothing about the ground can refuse it: it floats. So there is no fitness
 * test, no occupancy test and no relief test here — only a footprint centred
 * in the named zone (or in the region, when the node named none), clamped to
 * stay inside the region, and a base Y that clears the *highest* column under
 * that footprint by `hover`. Constraints other than `zone` are ignored for a
 * hovering node in v1: `adjacent_to`, `distance` and friends are all statements
 * about competing for ground, which this node does not do.
 */
export function planHoverSite(input: HoverPlacementInput): ProgramSite {
  const { plan, hover } = input;
  const rotation = input.rotation ?? 0;
  const [w, d] = rotatedFootprint(input.envelope[0], input.envelope[2], rotation);
  const region = plan.region;
  const whole = areaRect(region, undefined);
  const area = areaRect(region, input.zone === undefined ? input.hint : { zone: input.zone });

  const cx = area.x0 + Math.floor((area.x1 - area.x0 + 1 - w) / 2);
  const cz = area.z0 + Math.floor((area.z1 - area.z0 + 1 - d) / 2);
  const x0 = clamp(cx, whole.x0, Math.max(whole.x0, whole.x1 - w + 1));
  const z0 = clamp(cz, whole.z0, Math.max(whole.z0, whole.z1 - d + 1));
  const footprint: Rect = {
    x0,
    z0,
    x1: Math.min(whole.x1, x0 + w - 1),
    z1: Math.min(whole.z1, z0 + d - 1),
  };

  let top = -Infinity;
  for (let z = footprint.z0; z <= footprint.z1; z++) {
    for (let x = footprint.x0; x <= footprint.x1; x++) {
      const idx = (z - region.z0) * region.width + (x - region.x0);
      const g = plan.ground[idx];
      if (g !== undefined && g > top) top = g;
    }
  }
  /* c8 ignore next — an empty footprint cannot reach here; the region has area. */
  if (!Number.isFinite(top)) top = 0;

  return { index: 0, footprint, baseY: top + hover, ...(rotation === 0 ? {} : { rotation }) };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The nine-grid cell (or circle bound, or whole region) an `area` names. */
export function areaRect(region: Region, area: ProgramScatterParams["area"]): Rect {
  const whole: Rect = {
    x0: region.x0,
    z0: region.z0,
    x1: region.x0 + region.width - 1,
    z1: region.z0 + region.depth - 1,
  };
  if (area === undefined || "all" in area) return whole;
  if ("zone" in area) {
    const [ix, iz] = ZONE_CELLS[area.zone] ?? [1, 1];
    const cw = Math.floor(region.width / 3);
    const cd = Math.floor(region.depth / 3);
    return {
      x0: region.x0 + ix * cw,
      z0: region.z0 + iz * cd,
      x1: ix === 2 ? whole.x1 : region.x0 + (ix + 1) * cw - 1,
      z1: iz === 2 ? whole.z1 : region.z0 + (iz + 1) * cd - 1,
    };
  }
  const [fx, fz] = area.at;
  const cx = region.x0 + Math.round(fx * (region.width - 1));
  const cz = region.z0 + Math.round(fz * (region.depth - 1));
  const r = Math.round(area.radius * Math.min(region.width, region.depth) * 0.5);
  return {
    x0: Math.max(whole.x0, cx - r),
    z0: Math.max(whole.z0, cz - r),
    x1: Math.min(whole.x1, cx + r),
    z1: Math.min(whole.z1, cz + r),
  };
}

/** North is −Z, east is +X — the profile's nine-grid, as cell indices. */
const ZONE_CELLS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  northwest: [0, 0],
  north: [1, 0],
  northeast: [2, 0],
  west: [0, 1],
  center: [1, 1],
  east: [2, 1],
  southwest: [0, 2],
  south: [1, 2],
  southeast: [2, 2],
});

function areaAdmits(
  area: ProgramScatterParams["area"],
  region: Region,
  rect: Rect,
): boolean {
  if (area === undefined || "all" in area || "zone" in area) return true;
  const [fx, fz] = area.at;
  const cx = region.x0 + fx * (region.width - 1);
  const cz = region.z0 + fz * (region.depth - 1);
  const r = area.radius * Math.min(region.width, region.depth) * 0.5;
  const mx = (rect.x0 + rect.x1) / 2;
  const mz = (rect.z0 + rect.z1) / 2;
  return (mx - cx) ** 2 + (mz - cz) ** 2 <= r * r;
}

function insideRect(rect: Rect, bound: Rect): boolean {
  return rect.x0 >= bound.x0 && rect.z0 >= bound.z0 && rect.x1 <= bound.x1 && rect.z1 <= bound.z1;
}

function overlaps(a: Rect, b: Rect, margin: number): boolean {
  return !(
    a.x1 + margin < b.x0 ||
    b.x1 + margin < a.x0 ||
    a.z1 + margin < b.z0 ||
    b.z1 + margin < a.z0
  );
}

/**
 * Is this rect blocked?
 *
 * `tagsOnly` splits the two things this grid knows. `grid.mask` is "the ground
 * here is spoken for", which a hovering instance is exempt from — it is forty
 * blocks up and wants to loom over exactly the rooftops that mask covers. The
 * per-tag masks are the author's own `avoidTags`, which mean what they say
 * whatever the altitude.
 */
function occupied(
  grid: OccupancyGrid,
  rect: Rect,
  avoidTags: readonly string[] | undefined,
  tagsOnly = false,
): boolean {
  const { region } = grid;
  const masks: Uint8Array[] = tagsOnly ? [] : [grid.mask];
  for (const tag of avoidTags ?? []) {
    const mask = grid.byTag.get(tag);
    if (mask !== undefined) masks.push(mask);
  }
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const ix = x - region.x0;
      const iz = z - region.z0;
      if (ix < 0 || iz < 0 || ix >= region.width || iz >= region.depth) return true;
      const idx = iz * region.width + ix;
      for (const mask of masks) if (mask[idx] === 1) return true;
    }
  }
  return false;
}

/**
 * The site's roughness, against whichever of `maxRelief` / `maxSlope` the
 * author wrote. `programGroundPlane` has already applied the sanity ceiling;
 * this is the author's tighter opinion on top of it.
 */
function reliefOk(
  plan: ColumnPlan,
  rect: Rect,
  params: ProgramScatterParams,
  w: number,
  d: number,
): boolean {
  if (params.maxRelief === undefined && params.maxSlope === undefined) return true;
  const { region } = plan;
  let lo = Infinity;
  let hi = -Infinity;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const idx = (z - region.z0) * region.width + (x - region.x0);
      const g = plan.ground[idx] as number;
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    }
  }
  const relief = hi - lo;
  if (params.maxRelief !== undefined && relief > params.maxRelief) return false;
  if (params.maxSlope !== undefined) {
    const span = Math.max(w, d);
    if (relief > Math.tan((params.maxSlope * Math.PI) / 180) * span) return false;
  }
  return true;
}

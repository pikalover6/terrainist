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
 * Candidates come from a jittered lattice walked in row-major order, so the
 * site list is a pure function of the seed, the params and the ground — never
 * of iteration or completion order. Instance `index` is the position in that
 * list, so a site's identity is a property of the geometry.
 */

import type { ProgramScatterParams } from "@terrainist/spec";
import { hoverOfParams, seatOfParams } from "@terrainist/spec";
import { positionInt, type Region, type Seed256 } from "@terrainist/stdlib";
import { streamSeed } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";
import type { OccupancyGrid } from "../layout/types.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { FluidKind } from "../terrain/columns.js";

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
  /** World footprint, inclusive, the size of the program's `[w, d]`. */
  readonly footprint: Rect;
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
}

/** Resolve up to `params.count` sites, in placement order. */
export function planProgramSites(input: ProgramPlacementInput): readonly ProgramSite[] {
  const { params, plan } = input;
  const [w, , d] = input.envelope;
  const region = plan.region;
  const area = areaRect(region, params.area);
  const spacing = Math.max(params.spacing ?? 0, 1);
  const step = Math.max(w, d) + spacing;
  const stream = streamSeed(input.seed, "scatter");
  const jitter = Math.max(0, Math.floor(spacing / 2));
  // A hovering scatter floats every instance, so the ground's *fitness* has no
  // say — no fluid test, no relief test — and it competes with nobody for the
  // dirt. What survives is the region, the author's `area` and `avoidTags`,
  // and `spacing` against its own siblings, so two saucers never share a sky.
  const hover = hoverOfParams(params);
  // A wading scatter — a bay full of half-sunk wrecks — is the one kind whose
  // sites are *supposed* to have water in them.
  const wades = hover === undefined && seatOfParams(params).policy === "wade";

  const claimed: Rect[] = hover === undefined ? [...(input.taken ?? [])] : [];
  const sites: ProgramSite[] = [];

  for (let cz = area.z0; cz + d - 1 <= area.z1 && sites.length < params.count; cz += step) {
    for (let cx = area.x0; cx + w - 1 <= area.x1 && sites.length < params.count; cx += step) {
      const ox = jitter === 0 ? 0 : positionInt(stream, cx, 0, cz, -jitter, jitter);
      const oz = jitter === 0 ? 0 : positionInt(stream, cx, 1, cz, -jitter, jitter);
      const rect: Rect = { x0: cx + ox, z0: cz + oz, x1: cx + ox + w - 1, z1: cz + oz + d - 1 };
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
        baseY = programGroundPlane(plan, rect, input.refusals, wades);
        if (baseY === undefined) continue;
        if (!reliefOk(plan, rect, params, w, d)) continue;
      }
      if (params.elevation !== undefined) {
        const [lo, hi] = params.elevation;
        if (baseY < lo || baseY > hi) continue;
      }
      claimed.push(rect);
      sites.push({ index: sites.length, footprint: rect, baseY });
    }
  }
  return sites;
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
}

/**
 * The single site of an `authored:<id>` node **without a layout solver.**
 *
 * The terrain profile has no solver and no occupancy, so a landmark's site is
 * decided by the ground alone: the region's centre first — the one placement an
 * author can predict from the document — and, if the centre column will not
 * hold the footprint (fluid, or too rough), the ordinary scatter walk over the
 * whole region, which is the same deterministic row-major lattice a plugin
 * node uses. Returns `undefined` when nothing in the region fits, which the
 * caller reports as `PROGRAM_DROPPED` rather than silence.
 */
export function planLandmarkSite(input: LandmarkPlacementInput): ProgramSite | undefined {
  const { plan } = input;
  const [w, , d] = input.envelope;
  const region = plan.region;
  const whole = areaRect(region, undefined);

  const cx = region.x0 + Math.floor((region.width - w) / 2);
  const cz = region.z0 + Math.floor((region.depth - d) / 2);
  const centred: Rect = { x0: cx, z0: cz, x1: cx + w - 1, z1: cz + d - 1 };
  const taken = input.taken ?? [];
  if (insideRect(centred, whole) && !taken.some((r) => overlaps(r, centred, 0))) {
    const baseY = programGroundPlane(plan, centred, input.refusals, input.wades === true);
    if (baseY !== undefined) return { index: 0, footprint: centred, baseY };
  }

  const [fallback] = planProgramSites({
    params: {
      program: "",
      count: 1,
      ...(input.wades === true ? { seat: "wade" } : {}),
    } as unknown as ProgramScatterParams,
    envelope: input.envelope,
    plan,
    seed: input.seed,
    taken,
    ...(input.refusals === undefined ? {} : { refusals: input.refusals }),
  });
  return fallback;
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
  const [w, , d] = input.envelope;
  const region = plan.region;
  const whole = areaRect(region, undefined);
  const area = areaRect(region, input.zone === undefined ? undefined : { zone: input.zone });

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

  return { index: 0, footprint, baseY: top + hover };
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

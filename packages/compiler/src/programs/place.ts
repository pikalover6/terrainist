/**
 * Where the N instances of a plugin program stand.
 *
 * `scatter.program@0` reuses the scatter vocabulary the other scatter
 * generators already speak — a coarse `area`, a `spacing`, an eligibility band
 * — and the prop pass's own fitness helpers (`groundBase`, which refuses a
 * fluid column and a site rougher than the footprint tolerates). That reuse is
 * the point: **a program never learns where it is**, which is how the
 * no-absolute-coordinates law survives contact with model-written code.
 *
 * Candidates come from a jittered lattice walked in row-major order, so the
 * site list is a pure function of the seed, the params and the ground — never
 * of iteration or completion order. Instance `index` is the position in that
 * list, so a site's identity is a property of the geometry.
 */

import type { ProgramScatterParams } from "@terrainist/spec";
import { positionInt, type Region, type Seed256 } from "@terrainist/stdlib";
import { streamSeed } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";
import type { OccupancyGrid } from "../layout/types.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { groundBase } from "../structures/props.js";

/** One resolved instance site. */
export interface ProgramSite {
  /** Instance index — the position in this list, and the seed's `index`. */
  readonly index: number;
  /** World footprint, inclusive, the size of the program's `[w, d]`. */
  readonly footprint: Rect;
  /** World Y of the instance's node-local `y = 0`. */
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

  const claimed: Rect[] = [...(input.taken ?? [])];
  const sites: ProgramSite[] = [];

  for (let cz = area.z0; cz + d - 1 <= area.z1 && sites.length < params.count; cz += step) {
    for (let cx = area.x0; cx + w - 1 <= area.x1 && sites.length < params.count; cx += step) {
      const ox = jitter === 0 ? 0 : positionInt(stream, cx, 0, cz, -jitter, jitter);
      const oz = jitter === 0 ? 0 : positionInt(stream, cx, 1, cz, -jitter, jitter);
      const rect: Rect = { x0: cx + ox, z0: cz + oz, x1: cx + ox + w - 1, z1: cz + oz + d - 1 };
      if (!insideRect(rect, area)) continue;
      if (claimed.some((r) => overlaps(r, rect, spacing))) continue;
      if (!areaAdmits(params.area, region, rect)) continue;
      if (input.occupancy !== undefined && occupied(input.occupancy, rect, params.avoidTags)) continue;
      const baseY = groundBase(plan, rect);
      if (baseY === undefined) continue;
      if (!reliefOk(plan, rect, params, w, d)) continue;
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

function occupied(grid: OccupancyGrid, rect: Rect, avoidTags: readonly string[] | undefined): boolean {
  const { region } = grid;
  const masks: Uint8Array[] = [grid.mask];
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
 * author wrote. `groundBase` has already applied the prop pass's own default
 * tolerance; this is the author's tighter opinion on top of it.
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

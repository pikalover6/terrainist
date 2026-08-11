/**
 * The site courtesies a bespoke instance gets — pad, skirt, apron.
 *
 * ## The defect
 *
 * A walked Troy put twenty-four `hidden_greeks` huts across a hillside and
 * every one of them sat on the raw terrain: a wall of the hut buried on the
 * uphill side, daylight under its downhill corner, and no transition of any
 * kind between the thing and the ground it was standing on. Every *building*
 * in that same world had all three — the solver's pad levels its footprint, a
 * foundation skirt sinks to solid ground, and an apron ring is underpinned so
 * nothing at the floor plane floats. A plugin got none of them, because
 * `buildPrograms` laid a prop's pad and stopped there.
 *
 * This module is the missing half, and it is deliberately the *prop's* half
 * rather than a fourth pad implementation:
 *
 * 1. **The pad** — {@link levelPropPad} unchanged, now with the pipeline's
 *    {@link GroundDriver} behind it, so a plugin's level is a `prop.pad` claim
 *    the contract arbitrates (declare → resolve → build) rather than a write.
 * 2. **The apron** — the pad's own one-ring skirt, carried out a few more rings
 *    and stepped down one block each, declared as one `ramp` claim. This is the
 *    transition; without it a levelled pad ends in a cliff of its own making.
 * 3. **The skirt** — every column the instance actually occupies is filled from
 *    its lowest block down to the ground, in the theme's `plinth`. Buildings'
 *    `underpinApron` rule, one structure over: nothing at ground level may have
 *    daylight under it.
 *
 * `underpinApron` itself is building-shaped (it reads a building's per-column
 * skirt states and its rect footprint) and could not be called from here, so
 * {@link underpinProgramInstance} **mirrors** its rule — same cap, same
 * fill-to-ground, same sorted-key determinism — rather than sharing its code.
 *
 * ## What never gets treated
 *
 * A hovering instance (nothing under it is claimed), a `wade` or `drape` seat
 * (the seabed and the conformed hillside are the point), and any site with
 * water under it. A sea monster is not given a gravel pad.
 */

import type { GroundClaim, GroundIntent } from "../layout/ground-contract.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import type { Rect } from "../layout/frames.js";
import type { PrismarineStack } from "../emit/prismarine.js";
import { parseBlockString } from "../emit/blockstring.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { FluidKind } from "../terrain/columns.js";
import { MAX_FOUNDATION_DEPTH, type StructureBlock } from "../structures/buildings.js";
import { PROP_MAX_RELIEF, PROP_PAD_SKIRT, levelPropPad } from "../structures/props.js";

/**
 * Rings of graded apron outside the pad's own skirt.
 *
 * Modest on purpose, and a function of the thing's own size: a 15 × 15 hut gets
 * one extra ring, a 48-block landmark gets three, and nothing gets more. The
 * apron is a *transition*, not terraforming — a plugin that craters the
 * hillside around it is a worse defect than the one this file fixes.
 */
export function programApronRings(rect: Rect): number {
  const long = Math.max(rect.x1 - rect.x0 + 1, rect.z1 - rect.z0 + 1);
  return Math.max(1, Math.min(3, Math.floor(long / 16) + 1));
}

/** Column index of a world column, or `undefined` outside the region. */
function indexOf(plan: ColumnPlan, x: number, z: number): number | undefined {
  const i = x - plan.region.x0;
  const j = z - plan.region.z0;
  if (i < 0 || j < 0 || i >= plan.region.width || j >= plan.region.depth) return undefined;
  return j * plan.region.width + i;
}

/** True when any column under the footprint holds fluid. */
export function siteIsWet(plan: ColumnPlan, rect: Rect): boolean {
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const idx = indexOf(plan, x, z);
      if (idx === undefined) continue;
      if (plan.fluidKind[idx] !== FluidKind.NONE) return true;
    }
  }
  return false;
}

/** Everything {@link treatProgramSite} reads. */
export interface SiteTreatmentInput {
  readonly plan: ColumnPlan;
  /** The instance's world footprint. */
  readonly footprint: Rect;
  /** The world Y of the plane it seats on — the ground plane. */
  readonly baseY: number;
  /** The pipeline's driver, when there is one. */
  readonly ground?: GroundDriver;
  /** `<nodePath>#pad@<index>` — what the claim is filed under. */
  readonly source: string;
  /** Write-only sink for the columns claimed, for the report and the tests. */
  readonly declare?: GroundClaim[];
}

/**
 * Level the ground under one instance, and grade out of it.
 *
 * Returns the blocks laid. A no-op on ground already flat enough to stand on,
 * which is what keeps a plugin on a plain exactly as cheap as it was.
 */
export function treatProgramSite(input: SiteTreatmentInput): StructureBlock[] {
  const { plan, footprint, baseY } = input;
  const top = baseY - 1;

  // The pad's own gate, asked here as well: the apron only exists to grade out
  // of a pad, so a site the pad refuses gets no apron either.
  let relief = 0;
  for (let z = footprint.z0; z <= footprint.z1; z++) {
    for (let x = footprint.x0; x <= footprint.x1; x++) {
      const idx = indexOf(plan, x, z);
      if (idx === undefined) continue;
      relief = Math.max(relief, top - (plan.ground[idx] as number));
    }
  }
  if (relief <= PROP_MAX_RELIEF) return [];

  const blocks = levelPropPad(plan, footprint, baseY, {
    ...(input.ground === undefined ? {} : { driver: input.ground }),
    source: input.source,
    ...(input.declare === undefined ? {} : { declare: input.declare }),
  });

  for (const block of gradeApron(input, top)) blocks.push(block);
  return blocks;
}

/**
 * The stepped ring outside the pad — one block down per ring.
 *
 * Fill only, exactly as the pad is: raising is safe from a pass this late,
 * cutting would delete the vegetation and the snow standing on the column.
 */
function gradeApron(input: SiteTreatmentInput, top: number): StructureBlock[] {
  const { plan, footprint } = input;
  const out: StructureBlock[] = [];
  const rings = programApronRings(footprint);
  const inner = PROP_PAD_SKIRT;
  const outer = inner + rings;
  const columns: { idx: number; x: number; z: number; want: number; g: number }[] = [];
  // Row-major over the whole apron band, so the block list is a pure function
  // of the geometry rather than of the order the rings were walked in.
  for (let z = footprint.z0 - outer; z <= footprint.z1 + outer; z++) {
    for (let x = footprint.x0 - outer; x <= footprint.x1 + outer; x++) {
      // Chebyshev distance to the footprint — the ring this column is in.
      const dx = Math.max(footprint.x0 - x, x - footprint.x1, 0);
      const dz = Math.max(footprint.z0 - z, z - footprint.z1, 0);
      const ring = Math.max(dx, dz);
      if (ring <= inner || ring > outer) continue;
      const idx = indexOf(plan, x, z);
      if (idx === undefined) continue;
      if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
      const want = top - ring;
      const g = plan.ground[idx] as number;
      if (g >= want) continue;
      columns.push({ idx, x, z, want, g });
    }
  }
  if (columns.length === 0) return out;

  for (const column of columns) input.declare?.push({ idx: column.idx, y: column.want });
  const driver = input.ground;
  if (driver !== undefined) {
    driver.commit([
      {
        source: `${input.source}.apron`,
        sourceClass: "prop.pad",
        kind: "platform",
        columns: columns.map((c) => ({ idx: c.idx, y: c.want })),
        // The apron *is* the transition: it asks to be absorbed as a ramp, so a
        // neighbour that disagrees about the level meets a slope rather than the
        // step the pad's own edge would otherwise leave.
        transition: "ramp",
      } satisfies GroundIntent,
    ]);
  }

  for (const { idx, x, z, want, g } of columns) {
    const fill = plan.subsurface[idx] as number;
    const cap = plan.surface[idx] as number;
    for (let y = g + 1; y <= want; y++) {
      out.push({ x, y, z, stateId: y === want ? cap : fill });
    }
    plan.surface[idx] = cap;
    if (driver !== undefined) continue;
    plan.ground[idx] = want;
    plan.fluidTop[idx] = want;
    // Fresh ground carries no snow layer; re-laying it is the climate pass's
    // business. Left alone, the emitter floats the old one.
    plan.snow[idx] = 0;
  }
  return out;
}

/** Everything {@link underpinProgramInstance} reads. */
export interface ProgramUnderpinInput {
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  /** The instance's blocks, already in world coordinates. */
  readonly blocks: readonly StructureBlock[];
  /**
   * World Y of the instance's seat plane — the course that meets the ground.
   *
   * Columns whose lowest block sits **above** it are spans, not footings: the
   * opening under an arch, the belly of a hull, the gap a leg straddles. A
   * foundation under one of those would fill the very hole the shape is for,
   * so the skirt only ever underpins a column that reaches the seat.
   */
  readonly seatPlane: number;
  /** The block the skirt is built from — the theme's `plinth` role. */
  readonly plinth: string;
}

/**
 * Sink a foundation under every column the instance stands in.
 *
 * The building rule, mirrored: take each occupied column's lowest block — of
 * the columns that actually reach the seat plane — and if there is air between
 * it and the ground, fill that gap — capped at
 * {@link MAX_FOUNDATION_DEPTH}, so an instance beside a drop grows a plinth
 * rather than a pillar to bedrock. Columns over water are left alone; a hull
 * standing in a lake is seated, not floating.
 *
 * Deterministic by construction: the columns are visited in sorted key order
 * and every level comes from the plan.
 */
export function underpinProgramInstance(input: ProgramUnderpinInput): StructureBlock[] {
  const { plan, blocks } = input;
  const parsed = parseBlockString(input.plinth);
  const stateId =
    parsed === undefined ? undefined : input.stack.blockStateOf(parsed.name, parsed.props);
  if (stateId === undefined) return [];

  const lowest = new Map<string, number>();
  for (const block of blocks) {
    const key = `${block.x},${block.z}`;
    const known = lowest.get(key);
    if (known === undefined || block.y < known) lowest.set(key, block.y);
  }

  const out: StructureBlock[] = [];
  for (const key of [...lowest.keys()].sort()) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    const idx = indexOf(plan, x, z);
    if (idx === undefined) continue;
    if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
    const lowestY = lowest.get(key) as number;
    if (lowestY > input.seatPlane) continue;
    const g = plan.ground[idx] as number;
    const top = lowestY - 1;
    if (top <= g) continue;
    const bottom = Math.max(g + 1, top - MAX_FOUNDATION_DEPTH + 1);
    for (let y = top; y >= bottom; y--) out.push({ x, y, z, stateId });
  }
  return out;
}

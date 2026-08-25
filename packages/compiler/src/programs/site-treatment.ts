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
import {
  PROP_MAX_RELIEF,
  PROP_PAD_SKIRT,
  decidePropPad,
  paintPropPad,
  propPadIntent,
  propPadRelief,
  type PropPadColumn,
} from "../structures/props.js";

/**
 * Columns of apron per block of lift the pad absorbs.
 *
 * Two, so the outer face of the pad is a 1:2 slope — the same ratio the
 * solver's own node-scale pads grade at (`APRON_RUN_PER_BLOCK`,
 * `stdlib/edits`). One is a 45° bank and still reads as a cut face.
 */
export const PROGRAM_APRON_RUN_PER_BLOCK = 2;

/**
 * Longest apron a program site may grade, in columns.
 *
 * Twelve blocks of lift at {@link PROGRAM_APRON_RUN_PER_BLOCK}, matching the
 * solver's `APRON_MAX`. Past it the site is not sitting on a slope, it is
 * sitting on a cliff, and the answer there is a different site — which is what
 * the placer's lift preference (`programs/place.ts`) now looks for — not a
 * longer ramp.
 */
export const PROGRAM_APRON_MAX = 24;

/**
 * Rings of graded apron outside the pad's own skirt, for a pad of this lift.
 *
 * **The walked defect (Kai, final battery deck):** "bespoke program sites sit
 * on raised, hard-edged platforms instead of integrating with the terrain".
 * This function used to answer 1–3 *regardless of how high the pad stood* — a
 * size-keyed constant — so a plugin lifted eight blocks out of a hollow got
 * three rings of apron and then a five-block cliff. The apron was the right
 * idea measured against the wrong thing.
 *
 * It is keyed on the **lift** now: enough rings to step the pad's own top back
 * down to the ground it grew out of at one block per
 * {@link PROGRAM_APRON_RUN_PER_BLOCK} columns, floored at one ring (so a pad
 * that barely lifts is exactly as cheap as it was) and capped at
 * {@link PROGRAM_APRON_MAX}. `lift` is the deepest fill under the pad — the
 * distance the outer face has to come down — and never the pad's height above
 * sea level or anything else.
 *
 * The second cap is the thing's **own long side**, and it is the sentence this
 * file opened with kept honest: "a plugin that craters the hillside around it
 * is a worse defect than the one this file fixes". A 16-block hut grading
 * twenty-four columns in every direction is a 64-block earthwork around a hut,
 * and on the mushroom vale it reached far enough to spoil the ground a
 * *different* program was standing on. Inside its own width the apron is
 * landscaping; past that it is landscape.
 */
export function programApronRings(rect: Rect, lift: number): number {
  const long = Math.max(rect.x1 - rect.x0 + 1, rect.z1 - rect.z0 + 1);
  const needed = Math.max(0, Math.ceil(lift)) * PROGRAM_APRON_RUN_PER_BLOCK;
  return Math.max(1, Math.min(PROGRAM_APRON_MAX, long, needed));
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

/**
 * The surface of the water a site stands in — the level its own fluid may
 * reach, and not one block higher.
 *
 * **The walked defect (Kai, final battery deck):** a sea monster stood in "a
 * SLAB OF ELEVATED WATER — a raised rectangle of ocean above sea level with
 * visible falling-edge faces". The pad was innocent (a `wade` site is never
 * padded): the *program* laid its own ocean. A wading instance's node-local
 * `y = 0` is the **seabed** — rule 5's own doctrine — so a program that models
 * the water it is breaching out of has no way to know how far above it the real
 * surface is, and the kraken's own sea, four blocks deep in its own frame,
 * landed three blocks proud of the bay it was standing in.
 *
 * The compiler answers the question the program cannot: the highest fluid
 * surface any column of the footprint actually carries, and the world's sea
 * level when the site is dry. A pond at y = 80 keeps its pond; the ocean keeps
 * its shoreline.
 */
export function siteWaterLine(plan: ColumnPlan, rect: Rect): number {
  let line = plan.seaLevel;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const idx = indexOf(plan, x, z);
      if (idx === undefined) continue;
      if (plan.fluidKind[idx] === FluidKind.NONE) continue;
      const top = plan.fluidTop[idx] as number;
      if (top > line) line = top;
    }
  }
  return line;
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
  const decided = decideProgramSite(input);
  if (decided === undefined) return [];
  for (const column of decided.pad) input.declare?.push({ idx: column.idx, y: column.want });
  for (const column of decided.apron) input.declare?.push({ idx: column.idx, y: column.want });
  const driver = input.ground;
  if (driver !== undefined && decided.intents.length > 0) driver.commit(decided.intents);
  return paintProgramSite(input.plan, decided, driver === undefined);
}

/* -------------------------------------------------------------------------- */
/* WP-G6 §7.1 — the same treatment, decided at 5b and laid at 5f              */
/* -------------------------------------------------------------------------- */

/** One column of graded apron, decided but not yet laid. */
export interface ProgramApronColumn {
  readonly idx: number;
  readonly x: number;
  readonly z: number;
  /** The level the apron asks for. */
  readonly want: number;
  /** The ground under it **before** the apron, which the fill starts one above. */
  readonly g: number;
}

/**
 * One site's treatment, **decided**: which columns the pad and its apron would
 * fill, to what level, from what ground, and the `prop.pad` claims that says.
 *
 * The whole reason this type exists is time. Under {@link GROUND_V1_FREEZE} an
 * authored program's `prop.pad` is a tier-D declaration and therefore has to be
 * filed at pass 5b, before the fifth resolve seals the ground; its blocks
 * cannot be laid until 5f, when the run they carry has been executed against
 * the ground the resolver actually decided. Between the two the decision is
 * this object — and it is the decision taken against `view("D")`, which is what
 * a tier-D declarer is entitled to read (§1.4).
 */
export interface ProgramSiteTreatment {
  readonly pad: readonly PropPadColumn[];
  readonly apron: readonly ProgramApronColumn[];
  /** The pad claim and the apron claim, in that order. Either may be absent. */
  readonly intents: readonly GroundIntent[];
}

/**
 * **The decision half** of {@link treatProgramSite}: pure, reads `input.plan`,
 * writes nothing and declares nothing.
 *
 * `undefined` when the site is flat enough that neither pad nor apron is owed —
 * the pad's own gate, asked here as well, because the apron only exists to
 * grade out of a pad and a site the pad refuses gets no apron either.
 */
export function decideProgramSite(input: SiteTreatmentInput): ProgramSiteTreatment | undefined {
  const { plan, footprint, baseY } = input;
  const top = baseY - 1;
  const relief = propPadRelief(plan, footprint, baseY);
  if (relief <= PROP_MAX_RELIEF) return undefined;

  const pad = decidePropPad(plan, footprint, baseY);
  // `relief` is the deepest fill the pad will lay — how far its outer face has
  // to come back down — which is exactly what the apron is sized on.
  const apron = decideApron(input, top, relief);
  const intents: GroundIntent[] = [];
  const padIntent = propPadIntent(input.source, pad);
  if (padIntent !== undefined) intents.push(padIntent);
  if (apron.length > 0) {
    intents.push({
      source: `${input.source}.apron`,
      sourceClass: "prop.pad",
      kind: "platform",
      columns: apron.map((c) => ({ idx: c.idx, y: c.want })),
      // The apron *is* the transition: it asks to be absorbed as a ramp, so a
      // neighbour that disagrees about the level meets a slope rather than the
      // step the pad's own edge would otherwise leave.
      transition: "ramp",
    } satisfies GroundIntent);
  }
  return { pad, apron, intents };
}

/**
 * **The painting half**: the pad's blocks then the apron's, in the order
 * {@link treatProgramSite} has always emitted them.
 *
 * `write` is true only off the contract's path — the terrarium, the exhibits,
 * the gate — exactly as in {@link paintPropPad}.
 */
export function paintProgramSite(
  plan: ColumnPlan,
  decided: ProgramSiteTreatment,
  write: boolean,
): StructureBlock[] {
  const blocks = paintPropPad(plan, decided.pad, write);
  for (const { idx, x, z, want, g } of decided.apron) {
    const fill = plan.subsurface[idx] as number;
    const cap = plan.surface[idx] as number;
    for (let y = g + 1; y <= want; y++) {
      blocks.push({ x, y, z, stateId: y === want ? cap : fill });
    }
    // Outside the guard on purpose — and outside the contract. The ground
    // contract's three arrays are ground/fluidTop/fluidKind
    // (`docs/GROUND-CONTRACT-v0.md`); `surface` is not one of them, so this
    // write is never arbitrated and never reported. Census class 2, S5.
    plan.surface[idx] = cap;
    if (!write) continue;
    plan.ground[idx] = want;
    plan.fluidTop[idx] = want;
    // Fresh ground carries no snow layer; re-laying it is the climate pass's
    // business. Left alone, the emitter floats the old one.
    plan.snow[idx] = 0;
  }
  return blocks;
}

/**
 * The graded ring outside the pad — one block down per
 * {@link PROGRAM_APRON_RUN_PER_BLOCK} columns, all the way back to the ground.
 *
 * Fill only, exactly as the pad is: raising is safe from a pass this late,
 * cutting would delete the vegetation and the snow standing on the column.
 *
 * The level is a *monotone* staircase outward, `top − ceil(ring / run)`, so no
 * two neighbouring columns of the apron differ by more than one block and the
 * outermost ring asks for the ground the pad grew out of. That is the property
 * the pad's hard edge lacked and the one `program-pad.test.ts` measures.
 */
function decideApron(
  input: SiteTreatmentInput,
  top: number,
  lift: number,
): readonly ProgramApronColumn[] {
  const { plan, footprint } = input;
  const rings = programApronRings(footprint, lift);
  const inner = PROP_PAD_SKIRT;
  const outer = inner + rings;
  const columns: ProgramApronColumn[] = [];
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
      const want = top - Math.ceil(ring / PROGRAM_APRON_RUN_PER_BLOCK);
      const g = plan.ground[idx] as number;
      if (g >= want) continue;
      columns.push({ idx, x, z, want, g });
    }
  }
  return columns;
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

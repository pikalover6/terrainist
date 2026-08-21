/**
 * Courtyard interiors and passage arches (Phase 4.2, WP-C).
 *
 * `docs/COURTYARDS-AND-LEVELS-v0.md` §4.4 and §4.5 are normative;
 * `layout/courtyards.ts` is the other half and decided all the geometry. This
 * module builds two things and asks no questions about where they are:
 *
 * 1. **the interior** — the floor is one plane at the block's platform level and
 *    it is paved, which is what makes every inward-facing door flush and leaves
 *    the doorstep pass with nothing to do. On top of that goes a treatment
 *    chosen by the block's dominant archetype: a well, a tree, a cloister walk,
 *    a working yard, or a garden;
 * 2. **the passage arch** — the three columns the fabric left open in the street
 *    wall, roofed from {@link PASSAGE_HEAD} up to the flanking bays' walls, with
 *    a stair springing from each side. That is a pend, or a close, and it is the
 *    classic answer to "how do you get into a block whose perimeter is
 *    unbroken".
 *
 * ## Nothing floats, and the check is a readback of our own work
 *
 * The pass runs after `buildBuildings` and reads the **emitted block list** —
 * not the plan, not the intent — for the two columns flanking each passage. If
 * either is not solid over the whole arch height, the passage is *not roofed*:
 * it stays an open gap, which still works perfectly well as an entrance. A
 * floating arch is never built. A terrace that refused, or an infill that
 * dropped, therefore degrades to a gateless opening rather than to a lintel
 * hanging in the air.
 *
 * ## Reachability is the property, and it is structural
 *
 * The passage floor is paved at the courtyard's own level and left open from
 * the ground to the arch springing, so a walking agent crosses it exactly as it
 * crosses a street. Nothing this pass builds stands in the passage, and the
 * interior treatments keep a clear ring inside the ranges — the cloister's
 * colonnade is one column deep with two blocks of headroom under its roof, the
 * well and the tree stand at the centre. An enclosed courtyard nobody can reach
 * is a bug, not a feature, and the geometry is what keeps it from happening
 * rather than a check after the fact.
 *
 * ## Determinism
 *
 * Every draw is position-keyed on a world column, exactly as the plaza's is.
 * Nothing is keyed on a counter, on iteration order, or on how many courtyards
 * came before.
 */

import { type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import { PASSAGE_HEAD, type CourtyardBlock, type CourtyardPassage } from "../layout/courtyards.js";
import type { DistrictProduct } from "../layout/district.js";
import type { OccupancyGrid } from "../layout/types.js";
import type { GroundClaim, GroundView } from "../layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../layout/ground-driver.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { hash2, hashInt } from "../terrain/detail.js";
import type { Palette } from "../terrain/palette.js";

import type { StructureBlock } from "./buildings.js";
import { treatmentOf } from "./grounds.js";

/** How a courtyard interior is furnished (§4.5). */
export type CourtyardTreatment = "well" | "tree" | "cloister" | "yard" | "garden";

/** Highest a passage roof is carried above its own head course. */
export const PASSAGE_ROOF_MAX = 8;

/** Pitch of the cloister's colonnade, in columns. */
export const CLOISTER_PITCH = 3;

/** Everything {@link furnishCourtyards} reads. */
export interface CourtyardPassInput {
  /** The quarters, each carrying the courtyard blocks its fabric closed. */
  readonly districts: readonly DistrictProduct[];
  /** Mutated: the courtyard floor and the passage floor are ground, not blocks. */
  readonly plan: ColumnPlan;
  /**
   * The ground contract's driver (`docs/GROUND-CONTRACT-v0.md` §9a).
   *
   * The pend's floor and the well's dig go through `commit`; the interiors
   * declare nothing, because they are materials. Omitted only by callers that
   * are not the pipeline, which then get a driver of their own over the plan as
   * it stands (`driverForPlan`).
   */
  readonly ground?: GroundDriver;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /**
   * Every block emitted so far — the buildings. This is the readback the arch
   * springs from, and reading our own output rather than our own intent is the
   * whole point (see this module's header).
   */
  readonly emitted: readonly StructureBlock[];
  /** Detail seed, for the paving mix and the treatment's tie-breaks. */
  readonly seed: number;
  /** Claims the interior under `courtyard`, so no scatter or prop lands in it. */
  readonly occupancy?: OccupancyGrid;
}

/** What one courtyard came to, for the report and for the tests. */
export interface FurnishedCourtyard {
  readonly nodePath: string;
  readonly block: number;
  readonly core: Rect;
  readonly treatment: CourtyardTreatment;
  /** Columns of interior actually paved. */
  readonly paved: number;
  readonly passages: number;
  /** Passages whose arch was built; the rest stayed open gaps. */
  readonly roofed: number;
}

/** What the courtyard pass produced. */
export interface CourtyardPassResult {
  readonly blocks: readonly StructureBlock[];
  readonly courtyards: readonly FurnishedCourtyard[];
  readonly diagnostics: readonly LoamDiagnostic[];
  /**
   * What this pass declared under the ground contract
   * (`docs/GROUND-CONTRACT-v0.md` §3.4b): the intents it handed to the driver,
   * kept as a return value for the report and the tests. A passage is declared
   * whether or not it was roofed — that is the point of §3.4b: `roofPassage`'s
   * "not one plane" refusal was silent, and declaring turns it into either a
   * level pend or a named conflict.
   */
  readonly declaration: CourtyardDeclaration;
}

/** The raw material of §3.4b's intents. */
export interface CourtyardDeclaration {
  /** One entry per passage: the pend rect at its own median level. */
  readonly passages: readonly {
    readonly nodePath: string;
    readonly columns: readonly GroundClaim[];
  }[];
  /** One entry per well dug — `plaza.well`, exactly as `plaza.ts` declares it. */
  readonly wells: readonly {
    readonly nodePath: string;
    readonly centre: GroundClaim;
    readonly perimeter: readonly GroundClaim[];
  }[];
}

/** The block states this pass writes. */
interface CourtyardStates {
  readonly paving: number;
  readonly worn: number;
  readonly earth: number;
  readonly gravel: number;
  readonly kerb: number;
  readonly wall: number;
  readonly wallState: number;
  readonly pillar: number;
  readonly slab: number;
  readonly log: number;
  readonly leaves: number;
  readonly soil: number;
  readonly flower: number;
  readonly grass: number;
  readonly post: number;
  readonly chain: number;
  readonly lantern: number;
  /** A lantern hung from the block above it, for the arch. */
  readonly hanging: number;
  readonly stair: Readonly<Record<"north" | "south" | "east" | "west", number>>;
  readonly bench: Readonly<Record<"north" | "south" | "east" | "west", number>>;
}

function resolveStates(palette: Palette, stack: PrismarineStack): CourtyardStates {
  const named = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const symbol = (s: string, fallback: string): number =>
    palette.has(s) ? palette.state(s) : named(fallback);
  const stair = (facing: string, half: string): number =>
    stack.blockStateOf("minecraft:stone_brick_stairs", { facing, half, shape: "straight" }) ??
    named("minecraft:stone_brick_stairs");
  const seat = (facing: string): number =>
    stack.blockStateOf("minecraft:oak_stairs", { facing, half: "bottom", shape: "straight" }) ??
    named("minecraft:oak_stairs");
  return {
    paving: symbol("plaza.path", "minecraft:dirt_path"),
    worn: symbol("plaza.cobble", "minecraft:cobblestone"),
    earth: named("minecraft:coarse_dirt"),
    gravel: symbol("plaza.gravel", "minecraft:gravel"),
    kerb: symbol("street.curb", "minecraft:stone_bricks"),
    wall: symbol("plaza.well_wall", "minecraft:cobblestone_wall"),
    wallState: symbol("plaza.border", "minecraft:stone_bricks"),
    pillar: named("minecraft:stone_brick_wall"),
    slab: named("minecraft:stone_brick_slab"),
    log: named("minecraft:oak_log"),
    leaves: named("minecraft:oak_leaves[persistent=true]"),
    soil: named("minecraft:farmland"),
    flower: named("minecraft:poppy"),
    grass: named("minecraft:short_grass"),
    post: symbol("road.post", "minecraft:oak_fence"),
    chain: named("minecraft:chain"),
    lantern: symbol("road.lantern", "minecraft:lantern"),
    hanging:
      stack.blockStateOf("minecraft:lantern", { hanging: "true", waterlogged: "false" }) ??
      named("minecraft:lantern"),
    stair: {
      north: stair("north", "top"),
      south: stair("south", "top"),
      east: stair("east", "top"),
      west: stair("west", "top"),
    },
    bench: {
      north: seat("north"),
      south: seat("south"),
      east: seat("east"),
      west: seat("west"),
    },
  };
}

/**
 * Furnish every courtyard in the world, and roof every passage that has walls
 * to spring from.
 *
 * Returns untouched when no quarter closed a block, which is every document
 * written before this phase — the same shape `digCanals` has and for the same
 * reason.
 */
export function furnishCourtyards(input: CourtyardPassInput): CourtyardPassResult {
  const blocks: StructureBlock[] = [];
  const courtyards: FurnishedCourtyard[] = [];
  const diagnostics: LoamDiagnostic[] = [];

  const declaredPassages: CourtyardDeclaration["passages"][number][] = [];
  const declaredWells: CourtyardDeclaration["wells"][number][] = [];

  const closed = input.districts.filter((d) => (d.courtyards?.length ?? 0) > 0);
  if (closed.length === 0) {
    return { blocks, courtyards, diagnostics, declaration: { passages: [], wells: [] } };
  }

  const states = resolveStates(input.palette, input.stack);
  const driver = input.ground ?? driverForPlan(input.plan);
  const view = driver.view("B");
  const { region } = input.plan;
  const idx = (x: number, z: number): number => (z - region.z0) * region.width + (x - region.x0);
  const inside = (x: number, z: number): boolean =>
    x >= region.x0 &&
    z >= region.z0 &&
    x < region.x0 + region.width &&
    z < region.z0 + region.depth;

  // The readback, built once and only over the columns that matter: the two
  // flanks of every passage. A whole-world map would be a copy of the emitted
  // list for no gain.
  const wanted = new Set<string>();
  for (const district of closed) {
    for (const court of district.courtyards ?? []) {
      for (const passage of court.passages) {
        for (const [x, z] of flankColumns(passage)) wanted.add(`${x},${z}`);
      }
    }
  }
  const readback = new Map<string, Map<number, number>>();
  if (wanted.size > 0) {
    for (const b of input.emitted) {
      const key = `${b.x},${b.z}`;
      if (!wanted.has(key)) continue;
      let column = readback.get(key);
      if (column === undefined) {
        column = new Map<number, number>();
        readback.set(key, column);
      }
      column.set(b.y, b.stateId);
    }
  }

  for (const district of closed) {
    for (const court of district.courtyards ?? []) {
      const treatment = treatmentFor(court, input.seed);
      const paved = paveCore(input, states, court.core, idx, inside);
      switch (treatment) {
        case "well": {
          // §3.4b: the well is §3.2b's, column for column — `plaza.well` plus a
          // `preserve` over the eight columns its stability proof stands on.
          const source = `${district.nodePath}#courtyard-well@${declaredWells.length}`;
          const dug = buildWell(input, states, court.core, blocks, idx, inside, driver, source, view);
          if (dug !== undefined) declaredWells.push({ nodePath: district.nodePath, ...dug });
          break;
        }
        case "tree":
          plantTree(input, states, court.core, blocks, idx, inside);
          break;
        case "cloister":
          buildCloister(input, states, court.core, blocks, idx, inside);
          break;
        case "yard":
          dressYard(input, states, court.core, blocks, idx, inside);
          break;
        default:
          dressBeds(input, states, court.core, blocks, idx, inside);
          break;
      }

      let roofed = 0;
      for (const [i, passage] of court.passages.entries()) {
        // §3.4b, read before the pend is paved (paving writes no level, so the
        // two are the same number; reading first says which one is meant).
        const columns = passageClaims(view, passage.rect, idx, inside);
        if (columns.length > 0) {
          const nodePath = `${district.nodePath}#courtyard@${court.core.x0},${court.core.z0}/pend@${i}`;
          declaredPassages.push({ nodePath, columns });
          // §3.4b — the pend as one plane, at its own median level. Declaring it
          // is what turns `roofPassage`'s silent "not one plane" refusal into
          // either a level pend or a named conflict.
          driver.commit([
            {
              source: nodePath,
              sourceClass: "courtyard.floor",
              kind: "platform",
              columns,
              transition: "step",
            },
          ]);
        }
        pavePassage(input, states, passage.rect, idx, inside);
        if (roofPassage(input, states, passage, readback, blocks, idx, inside)) roofed++;
      }

      courtyards.push({
        nodePath: district.nodePath,
        block: court.block,
        core: court.core,
        treatment,
        paved,
        passages: court.passages.length,
        roofed,
      });
    }
  }

  return {
    blocks,
    courtyards,
    diagnostics,
    declaration: { passages: declaredPassages, wells: declaredWells },
  };
}

/**
 * §3.4b's `courtyard.floor` claim for one pend: the whole rect, at the pend's
 * **median** level.
 *
 * Median rather than min or max because a pend is a *floor* and the median is
 * the level that moves the fewest columns to make it one — and because
 * `roofPassage`'s test is "one plane or nothing", so a claim that names one
 * plane is exactly the request the refusal is refusing today. Pure reads: this
 * moves nothing, which is what keeps WP-2 a shadow.
 */
function passageClaims(
  view: GroundView,
  rect: Rect,
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): GroundClaim[] {
  const cells: number[] = [];
  const levels: number[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(x, z)) continue;
      const k = idx(x, z);
      if (view.fluidKind[k] !== FluidKind.NONE) continue;
      cells.push(k);
      levels.push(view.ground[k] as number);
    }
  }
  if (cells.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const median = sorted[(sorted.length - 1) >> 1] as number;
  return cells.map((k) => ({ idx: k, y: median }));
}

/* -------------------------------------------------------------------------- */
/* the treatment                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Which treatment one courtyard gets.
 *
 * Chosen by the block's **dominant archetype category** — `treatmentOf` already
 * maps archetype to treatment and this pass does not get a second opinion — with
 * a positional draw only breaking the tie the catalog leaves open. So a block of
 * chapels gets a cloister and a block of warehouses gets a yard, without
 * anybody writing it down.
 */
export function treatmentFor(court: CourtyardBlock, seed: number): CourtyardTreatment {
  switch (treatmentOf(court.archetype)) {
    case "sacred":
      return "cloister";
    case "yard":
      return "yard";
    case "garden":
      return "garden";
    default:
      // `apron` and `none` are the categories with no opinion about planting:
      // a civic or commercial block's middle is a paved court, and what stands
      // in it is a well or a tree. That is the only draw in this function.
      return hash2(seed, court.core.x0, court.core.z0, 11) < 0.5 ? "well" : "tree";
  }
}

/* -------------------------------------------------------------------------- */
/* the floor                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Pave the interior at the block's own level.
 *
 * Writing into `plan.surface` rather than emitting blocks over it is the same
 * choice the road pass and the plaza make, and for the same reason: a courtyard
 * is a change to the ground, so the heightmap, the biome pass and the fluid
 * validator all keep looking at one world.
 */
function paveCore(
  input: CourtyardPassInput,
  states: CourtyardStates,
  core: Rect,
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): number {
  const { plan } = input;
  let count = 0;
  for (let z = core.z0; z <= core.z1; z++) {
    for (let x = core.x0; x <= core.x1; x++) {
      if (!inside(x, z)) continue;
      const k = idx(x, z);
      // Never pave over water: a courtyard clipping a pond stays a pond.
      if (plan.fluidKind[k] !== FluidKind.NONE) continue;
      plan.surface[k] = hash2(input.seed, x, z, 5) < 0.22 ? states.worn : states.paving;
      plan.snow[k] = 0;
      if (plan.soil[k] === 0) plan.soil[k] = 1;
      claim(input.occupancy, k);
      count++;
    }
  }
  return count;
}

/** Pave a passage's three columns, and claim them so no prop lands in the pend. */
function pavePassage(
  input: CourtyardPassInput,
  states: CourtyardStates,
  rect: Rect,
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): void {
  const { plan } = input;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(x, z)) continue;
      const k = idx(x, z);
      if (plan.fluidKind[k] !== FluidKind.NONE) continue;
      plan.surface[k] = states.worn;
      plan.snow[k] = 0;
      if (plan.soil[k] === 0) plan.soil[k] = 1;
      claim(input.occupancy, k);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the passage                                                                 */
/* -------------------------------------------------------------------------- */

/** The two columns flanking a passage, per row of the gap. */
function flankColumns(passage: CourtyardPassage): readonly (readonly [number, number])[] {
  const { rect } = passage;
  const along = passage.face === "north" || passage.face === "south";
  const out: [number, number][] = [];
  if (along) {
    for (let z = rect.z0; z <= rect.z1; z++) {
      out.push([rect.x0 - 1, z]);
      out.push([rect.x1 + 1, z]);
    }
  } else {
    for (let x = rect.x0; x <= rect.x1; x++) {
      out.push([x, rect.z0 - 1]);
      out.push([x, rect.z1 + 1]);
    }
  }
  return out;
}

/**
 * Roof one passage, or leave it open.
 *
 * The head course sits at `floorY + PASSAGE_HEAD` — one storey of headroom —
 * and is carried up to the lower of the two flanking walls' tops, capped at
 * {@link PASSAGE_ROOF_MAX}. The material is taken from the flanking column at
 * the same height, which is the literal reading of "filled with the neighbour's
 * wall material" and costs nothing because the readback already has it.
 *
 * Returns false, and builds nothing at all, when either flank is not solid over
 * the whole arch height. See this module's header.
 */
function roofPassage(
  input: CourtyardPassInput,
  states: CourtyardStates,
  passage: CourtyardPassage,
  readback: ReadonlyMap<string, ReadonlyMap<number, number>>,
  blocks: StructureBlock[],
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): boolean {
  const { plan } = input;
  const { rect } = passage;
  const along = passage.face === "north" || passage.face === "south";

  // One floor for the whole pend. A passage whose ground is not one plane is
  // not roofed: an arch across a step is a lintel with daylight under one end.
  let floorY: number | null = null;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(x, z)) return false;
      const k = idx(x, z);
      if (plan.fluidKind[k] !== FluidKind.NONE) return false;
      const y = plan.ground[k] as number;
      if (floorY === null) floorY = y;
      else if (y !== floorY) return false;
    }
  }
  if (floorY === null) return false;
  const head = floorY + PASSAGE_HEAD;

  // Which rows of the gap are actually flanked by wall, on **both** sides, over
  // the whole arch height. Not every row is: a terrace's depth is capped at
  // `MAX_INFILL_DEPTH` while the strip it sits in is a lot deep, so the last
  // row or two of a passage runs past the back of the bays either side of it.
  // Roofing those would be a lintel with daylight under both ends, which is the
  // floating arch this pass exists not to build. So the pend is roofed over the
  // rows that have walls and open where the building stops — which is what a
  // real close looks like from the courtyard end.
  const lo = along ? rect.z0 : rect.x0;
  const hi = along ? rect.z1 : rect.x1;
  const rows: { at: number; top: number }[] = [];
  for (let i = lo; i <= hi; i++) {
    const sides = along
      ? [
          [rect.x0 - 1, i],
          [rect.x1 + 1, i],
        ]
      : [
          [i, rect.z0 - 1],
          [i, rect.z1 + 1],
        ];
    let top = head + PASSAGE_ROOF_MAX;
    let solid = true;
    for (const [x, z] of sides) {
      const column = readback.get(`${x as number},${z as number}`);
      if (column === undefined) {
        solid = false;
        break;
      }
      for (let y = floorY + 1; y <= head; y++) {
        if (column.has(y)) continue;
        solid = false;
        break;
      }
      if (!solid) break;
      let reach = head;
      while (reach < top && column.has(reach + 1)) reach++;
      if (reach < top) top = reach;
    }
    if (solid) rows.push({ at: i, top });
  }
  // One row of arch is a lintel, not a pend. Two is the least that reads as a
  // way *through* a building rather than a hole in a wall.
  if (rows.length < 2) return false;

  for (const row of rows) {
    // The head: a lintel course in the neighbour's own material, carried up to
    // the flanking eaves so the pend reads as cut *through* the terrace.
    for (let y = head; y <= row.top; y++) {
      if (along) {
        for (let x = rect.x0; x <= rect.x1; x++) {
          blocks.push({ x, y, z: row.at, stateId: materialAt(readback, passage, x, row.at, y, states) });
        }
      } else {
        for (let z = rect.z0; z <= rect.z1; z++) {
          blocks.push({ x: row.at, y, z, stateId: materialAt(readback, passage, row.at, z, y, states) });
        }
      }
    }
    // The springing: an upside-down stair on each side of the opening, one
    // course under the lintel, so the head is an arch rather than a hole.
    if (along) {
      blocks.push({ x: rect.x0, y: head - 1, z: row.at, stateId: states.stair.west });
      blocks.push({ x: rect.x1, y: head - 1, z: row.at, stateId: states.stair.east });
    } else {
      blocks.push({ x: row.at, y: head - 1, z: rect.z0, stateId: states.stair.north });
      blocks.push({ x: row.at, y: head - 1, z: rect.z1, stateId: states.stair.south });
    }
  }

  // A lantern under the arch, on the middle column of a roofed row. A pend is
  // dark by construction, and a dark pend is a passage nobody takes.
  //
  // It **hangs**, and the block it hangs from is forced to the pass's own
  // masonry rather than left as whatever the neighbour's wall happened to be at
  // that height. A hanging lantern under a glass pane is an `unsupported.chain`
  // finding, and "the terrace put a window there" is not a thing this pass can
  // know without asking the readback a question it has no reason to ask.
  const middle = rows[rows.length >> 1] as { at: number };
  const mx = along ? Math.floor((rect.x0 + rect.x1) / 2) : middle.at;
  const mz = along ? middle.at : Math.floor((rect.z0 + rect.z1) / 2);
  blocks.push({ x: mx, y: head, z: mz, stateId: states.wallState });
  blocks.push({ x: mx, y: head - 1, z: mz, stateId: states.hanging });

  return true;
}

/** The flanking wall's material at one height, or the pass's own fallback. */
function materialAt(
  readback: ReadonlyMap<string, ReadonlyMap<number, number>>,
  passage: CourtyardPassage,
  x: number,
  z: number,
  y: number,
  states: CourtyardStates,
): number {
  const along = passage.face === "north" || passage.face === "south";
  const sides = along
    ? [
        [passage.rect.x0 - 1, z],
        [passage.rect.x1 + 1, z],
      ]
    : [
        [x, passage.rect.z0 - 1],
        [x, passage.rect.z1 + 1],
      ];
  for (const [sx, sz] of sides) {
    const found = readback.get(`${sx as number},${sz as number}`)?.get(y);
    if (found !== undefined) return found;
  }
  return states.wallState;
}

/* -------------------------------------------------------------------------- */
/* the interiors                                                               */
/* -------------------------------------------------------------------------- */

/** The flat, dry 3×3 at the middle of a core, or `null`. */
function levelCentre(
  input: CourtyardPassInput,
  core: Rect,
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
  /** §9a.4's read, for the treatments that need the level before it is claimed. */
  view?: GroundView,
): { cx: number; cz: number; y: number } | null {
  const ground = view ?? input.plan;
  const cx = Math.floor((core.x0 + core.x1) / 2);
  const cz = Math.floor((core.z0 + core.z1) / 2);
  let level: number | null = null;
  for (let z = cz - 1; z <= cz + 1; z++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!inside(x, z)) return null;
      const k = idx(x, z);
      if (ground.fluidKind[k] !== FluidKind.NONE) return null;
      const y = ground.ground[k] as number;
      if (level === null) level = y;
      else if (y !== level) return null;
    }
  }
  return level === null ? null : { cx, cz, y: level };
}

/**
 * A well at the centre, worn paving fanning out from it.
 *
 * The geometry is `pavePlaza`'s and the stability argument is `plaza.ts`'s
 * header: the centre column is dug one block and filled, and its four
 * horizontal neighbours stand solid at the water's own surface, so
 * `checkFluidStability` finds no exposed face. This does not *hope* the
 * validator passes; the geometry is the proof.
 */
function buildWell(
  input: CourtyardPassInput,
  states: CourtyardStates,
  core: Rect,
  blocks: StructureBlock[],
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
  driver: GroundDriver,
  source: string,
  view: GroundView,
): { readonly centre: GroundClaim; readonly perimeter: readonly GroundClaim[] } | undefined {
  const centre = levelCentre(input, core, idx, inside, view);
  if (centre === null) return undefined;
  const { plan } = input;
  const { cx, cz, y } = centre;

  const middle = idx(cx, cz);
  /** §3.2b's `preserve`, verbatim: the eight columns the proof stands on. */
  const perimeter: GroundClaim[] = [];
  for (let z = cz - 1; z <= cz + 1; z++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (x === cx && z === cz) continue;
      perimeter.push({ idx: idx(x, z), y });
    }
  }
  const dug: GroundClaim = { idx: middle, y: y - 1, fluid: { kind: FluidKind.WATER, top: y } };
  driver.commit([
    { source, sourceClass: "plaza.well", kind: "platform", columns: [dug], transition: "step" },
    { source, sourceClass: "plaza.well", kind: "preserve", columns: perimeter, transition: "none" },
  ]);
  plan.surface[middle] = states.worn;

  for (let z = cz - 1; z <= cz + 1; z++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (x === cx && z === cz) continue;
      const corner = x !== cx && z !== cz;
      blocks.push({ x, y: y + 1, z, stateId: corner ? states.wallState : states.wall });
      plan.surface[idx(x, z)] = states.kerb;
    }
  }
  for (const [dx, dz] of [
    [-1, -1],
    [1, 1],
  ] as const) {
    blocks.push({ x: cx + dx, y: y + 2, z: cz + dz, stateId: states.post });
    blocks.push({ x: cx + dx, y: y + 3, z: cz + dz, stateId: states.post });
    blocks.push({ x: cx + dx, y: y + 4, z: cz + dz, stateId: states.lantern });
  }

  return { centre: dug, perimeter };
}

/** One canopy tree, a ring of packed earth, and a bench facing it. */
function plantTree(
  input: CourtyardPassInput,
  states: CourtyardStates,
  core: Rect,
  blocks: StructureBlock[],
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): void {
  const centre = levelCentre(input, core, idx, inside);
  if (centre === null) return;
  const { plan } = input;
  const { cx, cz, y } = centre;

  // The ring of packed earth the paving stops at.
  for (let z = cz - 2; z <= cz + 2; z++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      if (!inside(x, z)) continue;
      if (Math.abs(x - cx) === 2 && Math.abs(z - cz) === 2) continue;
      plan.surface[idx(x, z)] = states.earth;
    }
  }

  // A four-course trunk under a canopy two blocks deep: the smallest thing that
  // still reads as a tree from a first-floor window.
  const trunk = 4;
  for (let i = 1; i <= trunk; i++) blocks.push({ x: cx, y: y + i, z: cz, stateId: states.log });
  for (let dy = 0; dy <= 2; dy++) {
    const r = dy === 2 ? 1 : 2;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dz === 0 && dy < 2) continue;
        // Clip the corners so the canopy is a crown rather than a cube.
        if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
        blocks.push({ x: cx + dx, y: y + trunk + dy, z: cz + dz, stateId: states.leaves });
      }
    }
  }

  // A bench under it, three columns clear of the trunk so the seat is usable.
  blocks.push({ x: cx, y: y + 1, z: cz + 3, stateId: states.bench.south });
  blocks.push({ x: cx + 1, y: y + 1, z: cz + 3, stateId: states.bench.south });
}

/**
 * A covered walk one column deep against the inner faces — the only genuinely
 * new geometry in §4, and it is small.
 *
 * A colonnade of the theme's pillar every {@link CLOISTER_PITCH} columns, under
 * a slab roof at head height. Two blocks of headroom under the roof, which is
 * what makes the walk a walk: a cloister a player cannot get under is a hedge.
 */
function buildCloister(
  input: CourtyardPassInput,
  states: CourtyardStates,
  core: Rect,
  blocks: StructureBlock[],
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): void {
  const { plan } = input;
  const roof = 3;
  for (let z = core.z0; z <= core.z1; z++) {
    for (let x = core.x0; x <= core.x1; x++) {
      const edge = x === core.x0 || x === core.x1 || z === core.z0 || z === core.z1;
      if (!edge || !inside(x, z)) continue;
      const k = idx(x, z);
      if (plan.fluidKind[k] !== FluidKind.NONE) continue;
      const y = plan.ground[k] as number;
      plan.surface[k] = states.kerb;
      blocks.push({ x, y: y + roof, z, stateId: states.slab });
      // The colonnade: a pillar on the pitch, and always on the corners, so the
      // roof is carried at both ends of every run rather than cantilevered.
      const corner =
        (x === core.x0 || x === core.x1) && (z === core.z0 || z === core.z1);
      const onPitch = (x - core.x0) % CLOISTER_PITCH === 0 && (z - core.z0) % CLOISTER_PITCH === 0;
      if (!corner && !onPitch) continue;
      blocks.push({ x, y: y + 1, z, stateId: states.pillar });
      blocks.push({ x, y: y + 2, z, stateId: states.pillar });
    }
  }
}

/** Gravel, a woodpile, and a washing line on chains between two posts. */
function dressYard(
  input: CourtyardPassInput,
  states: CourtyardStates,
  core: Rect,
  blocks: StructureBlock[],
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): void {
  const { plan } = input;
  for (let z = core.z0; z <= core.z1; z++) {
    for (let x = core.x0; x <= core.x1; x++) {
      if (!inside(x, z)) continue;
      const k = idx(x, z);
      if (plan.fluidKind[k] !== FluidKind.NONE) continue;
      if (hash2(input.seed, x, z, 6) < 0.55) plan.surface[k] = states.gravel;
    }
  }

  const centre = levelCentre(input, core, idx, inside);
  if (centre === null) return;
  const { cx, cz, y } = centre;

  // The woodpile: two courses of logs against nothing in particular, which is
  // what a woodpile in a working yard is.
  for (let dz = 0; dz <= 1; dz++) {
    for (let dx = 0; dx <= 1; dx++) {
      const h = hashInt(input.seed, cx + dx, cz + dz, 7, 1, 2);
      for (let i = 1; i <= h; i++) {
        blocks.push({ x: cx + dx + 2, y: y + i, z: cz + dz + 2, stateId: states.log });
      }
    }
  }

  // The washing line: two posts, a beam across their tops, and the lines
  // hanging under the beam.
  //
  // The beam is load-bearing in both senses. A chain strung *horizontally*
  // between two posts is what the eye expects and what the game refuses: the
  // support rule walks each chain to something solid above or below it, and a
  // horizontal run has neither — 18 `unsupported.chain` findings, measured, on
  // the first compile of this pass. A solid beam over the posts gives every
  // chain a ceiling, which is both legal and closer to what a real drying frame
  // in a yard actually is.
  const z0 = cz - 2;
  for (const x of [cx - 3, cx + 3]) {
    for (let i = 1; i <= 3; i++) blocks.push({ x, y: y + i, z: z0, stateId: states.post });
  }
  for (let x = cx - 3; x <= cx + 3; x++) {
    blocks.push({ x, y: y + 4, z: z0, stateId: states.log });
  }
  for (const x of [cx - 2, cx, cx + 2]) {
    blocks.push({ x, y: y + 3, z: z0, stateId: states.chain });
  }
}

/** Beds, flowers, and a path ring around them. */
function dressBeds(
  input: CourtyardPassInput,
  states: CourtyardStates,
  core: Rect,
  blocks: StructureBlock[],
  idx: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): void {
  const { plan } = input;
  const bed: Rect = { x0: core.x0 + 2, z0: core.z0 + 2, x1: core.x1 - 2, z1: core.z1 - 2 };
  if (bed.x1 < bed.x0 || bed.z1 < bed.z0) return;
  for (let z = bed.z0; z <= bed.z1; z++) {
    for (let x = bed.x0; x <= bed.x1; x++) {
      if (!inside(x, z)) continue;
      const k = idx(x, z);
      if (plan.fluidKind[k] !== FluidKind.NONE) continue;
      const r = hash2(input.seed, x, z, 8);
      // A ring of path around the beds, and the beds themselves broken up so
      // the courtyard is a garden rather than a field.
      if (r < 0.25) {
        plan.surface[k] = states.paving;
        continue;
      }
      plan.surface[k] = states.earth;
      const y = plan.ground[k] as number;
      if (r > 0.72) {
        blocks.push({ x, y: y + 1, z, stateId: r > 0.86 ? states.flower : states.grass });
      }
    }
  }
}

/* -------------------------------------------------------------------------- */

/** Claim one courtyard column, under `courtyard` and the union mask. */
function claim(occupancy: OccupancyGrid | undefined, idx: number): void {
  if (occupancy === undefined) return;
  occupancy.mask[idx] = 1;
  const tags = occupancy.byTag as Map<string, Uint8Array>;
  let tag = tags.get("courtyard");
  if (tag === undefined) {
    tag = new Uint8Array(occupancy.mask.length);
    tags.set("courtyard", tag);
  }
  tag[idx] = 1;
}

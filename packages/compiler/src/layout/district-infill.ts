import {
  nodeSeed,
  DECAY_BANDS,
  HIGHRISE_MAX_WIDTH,
  HIGHRISE_MIN_WIDTH,
  RUIN_ONSET,
  bandForDecline,
  isHighriseArchetype,
  positionFloat,
  positionInt,
  streamSeed,
  type DecayBand,
  type Seed256,
} from "@terrainist/stdlib";
import { DEFAULT_ERA_CLASS, note } from "@terrainist/spec/ir";
import type { DistrictDensity, DistrictParams, EraClass, LoamDiagnostic } from "@terrainist/spec/ir";
import type { Rect } from "./frames.js";
import type { Block } from "./district-blocks.js";
import type { Lot } from "./district-lots.js";
import type { BuiltLot } from "./district-landmarks.js";
import { frontageOf } from "./district-landmarks.js";
import { FLOOR_HEIGHT, BUILDING_APRON, MIN_INFILL_SIDE, MAX_INFILL_DEPTH, LOT_COVERAGE, LOT_SIDE_GAP } from "./district-constants.js";
import { INFILL_FLOORS } from "./district-constants.js";
import type { Grid } from "./district-grid.js";
import type { Terrace } from "./district-terraces.js";
import type { CourtyardPlan } from "./courtyards.js";
import type { CompilerResolvedIntent } from "../intent/compiler-resolved.js";
import { buildProminenceField, type ProminenceField } from "./prominence.js";
import { Grid as GridClass } from "./district-grid.js";
import { largestRect } from "./masks.js";
import { largestFreeRect } from "./district-blocks.js";
import type { PortDeclaration } from "@terrainist/spec/ir";
const INFILL_PORTS: Readonly<Record<string, PortDeclaration>> = Object.freeze({ door: Object.freeze({ type: "door", face: "south", tags: Object.freeze(["primary"]) }) });

/**
 * Built ground per column of block land, under which a **walled** quarter is
 * reported (`LOAM-W527`).
 *
 * Half, and it is a floor rather than a target. The two ends of the measured
 * range: the walked-good `medium` grid quarter builds 0.61 of its block land,
 * and `trojan_horse_in_troy` — the quarter Kai walked twice and called empty —
 * built 0.34. Half sits between them with room either side, so an ordinary
 * quarter with a plaza, a market and a few open lots does not trip it and a
 * quarter whose blocks are mostly field does.
 *
 * Only walled quarters are measured, and that restriction is the whole of why
 * this can be a warning at all: a wall is a claim about what is inside it.
 * A village at 0.34 is a village.
 */
const WALLED_COVERAGE_FLOOR = 0.5;


/**
 * Widest a **leaf** block may be across its short axis...
 * (constants for empty-block law moved here)
 */

/**
 * Shortest side a dressed remainder may have, in columns.
 *
 * Nine. Under it the ground is a verge rather than a place: an orchard needs
 * two rows to read as rows, a market needs an aisle and the stalls either side
 * of it, and a paddock needs an inside. `MIN_INFILL_SIDE` is 7 and is the width
 * at which a *building* stops fitting, which is the wrong question — the
 * remainder tier exists precisely where no building fits.
 */
const DRESSING_MIN_SIDE = 9;

/**
 * Least area a dressed remainder may have, in columns.
 *
 * A 9 × 14 strip or better. Under about this the dressing is one tree and two
 * crates, which reads as clutter dropped on a verge rather than as a decision;
 * over it there is room for the module — rows, aisles, beds — that makes the
 * ground look laid out.
 */
const DRESSING_MIN_AREA = 130;

/**
 * One block that ended the pass with no building on it, and what it became.
 *
 * The layout decides *what*; the life pass decides where inside it each object
 * stands. So this carries a rectangle and a purpose and nothing about objects.
 */
type BlockDressing = "orchard" | "market" | "garden" | "paddock";

interface DressedBlock {
  /** Index into the quarter's own block list. */
  readonly block: number;
  /** The block's rectangle — the whole of it; the dressing insets itself. */
  readonly rect: Rect;
  readonly kind: BlockDressing;
}

/**
 * The menu a pre-industrial quarter draws from.
 *
 * The order is fixed, because the draw is an index into it: reordering these
 * would be a different world for the same seed.
 */
const DRESSINGS_EARLY: readonly BlockDressing[] = Object.freeze([
  "orchard",
  "market",
  "garden",
  "paddock",
]);

/**
 * The menu an industrial-or-later quarter draws from.
 *
 * The paddock is the one purpose the era takes away: a railed livestock
 * enclosure between two streets is a pre-industrial town, and a modern one puts
 * a garden there. Everything else is era-neutral, which is why the two menus
 * share a prefix rather than being two unrelated lists.
 */
const DRESSINGS_LATE: readonly BlockDressing[] = Object.freeze([
  "orchard",
  "market",
  "garden",
]);

/** Which menu an era class reads from. */
function dressingsFor(era: EraClass): readonly BlockDressing[] {
  return era === "industrial" || era === "modern" || era === "far_future"
    ? DRESSINGS_LATE
    : DRESSINGS_EARLY;
}

/**
 * Which block a built rectangle stands on, or `-1`.
 *
 * Keyed on the rectangle's **centre**, because a seated building is grown out
 * of a lot and then rotated: its rect can overhang the block's inscribed
 * rectangle at the eaves, and a containment test would then call a built block
 * bare. The centre of a building on a block is on that block.
 */
function blockOf(blocks: readonly Block[], rect: Rect): number {
  const cx = Math.floor((rect.x0 + rect.x1) / 2);
  const cz = Math.floor((rect.z0 + rect.z1) / 2);
  for (const [i, block] of blocks.entries()) {
    const r = block.rect;
    if (cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1) return i;
  }
  return -1;
}

/** What one infilled lot came to. */
interface Infill {
  readonly id: string;
  readonly rect: Rect;
  readonly size: readonly [number, number, number];
  readonly params: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
}

export function infillLot(
  lot: Lot,
  params: DistrictParams,
  stream: Seed256,
  prominence: ProminenceField,
  minSide: number = MIN_INFILL_SIDE,
): Infill | null {
  const density = params.density;
  const x = lot.rect.x0;
  const z = lot.rect.z0;
  const gap = LOT_SIDE_GAP[density] as number;
  const along = lot.face === "north" || lot.face === "south";
  const frontage = (along ? lot.rect.x1 - lot.rect.x0 : lot.rect.z1 - lot.rect.z0) + 1;
  const depth = (along ? lot.rect.z1 - lot.rect.z0 : lot.rect.x1 - lot.rect.x0) + 1;

  let across = frontage - 2 * gap;
  let back = Math.min(depth - gap, MAX_INFILL_DEPTH);
  if (across < minSide || back < minSide) return null;

  const archetype = pickArchetype(params.mix, across, stream, x, z);
  if (archetype === null) return null;
  if (isHighriseArchetype(archetype)) {
    across = Math.min(across, HIGHRISE_MAX_WIDTH);
    back = Math.min(back, HIGHRISE_MAX_WIDTH);
  }

  const floors = prominence.storeys(x, z, { density, archetype });
  const size: [number, number, number] = [across, Math.max(4, floors * FLOOR_HEIGHT + 2), back];

  return {
    id: `infill_${x}_${z}`,
    rect: lot.rect,
    size,
    params: { archetype, floors, floorHeight: FLOOR_HEIGHT },
    tags: ["district", "infill", archetype, ...(lot.corner ? ["corner"] : [])],
  };
}

const RUIN_ROLL_CHANNEL = 41;
const RUIN_CLUSTER_CHANNEL = 42;
const RUIN_BAND_CHANNEL = 43;
const RUIN_CLUSTER_AMPLITUDE = 0.5;
interface RuinRoll {
  readonly band: DecayBand;
  readonly intensity: number;
}
export function ruinDecayOf(
  lot: Lot,
  block: Block | undefined,
  stream: Seed256,
  share: number,
  decline: number,
): RuinRoll | null {
  if (share <= 0) return null;
  const cluster =
    block === undefined
      ? 0.5
      : positionFloat(stream, block.rect.x0, RUIN_CLUSTER_CHANNEL, block.rect.z0);
  const window = 4 * share * (1 - share);
  const local = Math.min(
    1,
    Math.max(0, share + RUIN_CLUSTER_AMPLITUDE * window * (cluster - 0.5)),
  );
  const roll = positionFloat(stream, lot.rect.x0, RUIN_ROLL_CHANNEL, lot.rect.z0);
  if (roll >= local) return null;
  const jitter = positionFloat(stream, lot.rect.x0, RUIN_BAND_CHANNEL, lot.rect.z0);
  const band = bandForDecline(decline, jitter);
  return { band, intensity: DECAY_BANDS[band].intensity };
}

export function pickArchetype(
  mix: readonly string[],
  across: number,
  stream: Seed256,
  x: number,
  z: number,
): string | null {
  if (mix.length === 0) return null;
  const start = positionInt(stream, x, 2, z, 0, mix.length - 1);
  for (let k = 0; k < mix.length; k++) {
    const name = mix[(start + k) % mix.length] as string;
    if (isHighriseArchetype(name) && across < HIGHRISE_MIN_WIDTH) continue;
    return name;
  }
  return null;
}

/**
 * Infill stage — narrow input/result, explicit ownership of claimed/built.
 *
 * Receives owned lots, blocks, claimed set, built array, prominence field,
 * and returns updated claimed/built plus dressed blocks, counts, and
 * diagnostics ownership (ruins note handled here).
 */

/**
 * Narrow infill stage — extracted from district.ts to satisfy Phase 6.2.
 * Takes explicit narrow inputs (no giant mutable closure), returns explicit outputs.
 * Preserves exact b763d56 order/RNG (positionFloat with infillStream, streamSeed "dress",
 * nodeSeed for infill ids), integer rounding, empty-block law, and typed-array
 * ownership (free mask newly owned, handed through result without extra copy).
 */
export interface InfillDerivationInput {
  readonly lots: readonly Lot[];
  readonly blocks: readonly Block[];
  readonly grid: Grid;
  readonly blocked: Uint8Array;
  readonly claimed: Set<string>;
  readonly built: BuiltLot[];
  readonly p: DistrictParams;
  readonly infillStream: Seed256;
  readonly prominence: ProminenceField;
  readonly share: number;
  readonly declineOf: number;
  readonly bandCounts: Map<DecayBand, number>;
  readonly rolled: number;
  readonly ruined: number;
  readonly dropped: number;
  readonly plazaBlock: number;
  readonly courtyardPlans: ReadonlyMap<number, CourtyardPlan>;
  readonly hasPlanned: boolean;
  readonly seed: Seed256;
  readonly intent: CompilerResolvedIntent;
  readonly walled: boolean;
  readonly nodePath: string;
  readonly worldSeed: bigint;
  readonly terraces: readonly Terrace[];
  readonly minBuilding?: number;
}
export interface InfillDerivationResult {
  readonly claimed: Set<string>;
  readonly built: BuiltLot[];
  readonly infilled: number;
  readonly dropped: number;
  readonly bareBlocks: number;
  readonly redrawnBlocks: number;
  readonly dressedBlocks: DressedBlock[];
  readonly bandCounts: Map<DecayBand, number>;
  readonly rolled: number;
  readonly ruined: number;
  readonly terraceRuined: number;
  readonly terraceRolled: number;
}
export function deriveInfillStage(input: InfillDerivationInput): InfillDerivationResult {
  const { lots, blocks, grid, blocked, p, infillStream, prominence, share, declineOf, plazaBlock, courtyardPlans, hasPlanned, seed, intent, walled, nodePath, worldSeed, terraces } = input;
  // Take ownership of mutable inputs directly — no extra Set/Map/Array copies (allocation-sensitive)
  const claimed = input.claimed as Set<string>;
  const built = input.built as BuiltLot[];
  const bandCounts = input.bandCounts as Map<DecayBand, number>;
  let rolled = input.rolled;
  let ruined = input.ruined;
  let dropped = input.dropped;
  let terraceRuined = 0;
  let terraceRolled = 0;
  const terraceBuiltBase = built.length - terraces.length;
  for (let ti = 0; ti < terraces.length; ti++) {
    const terrace = terraces[ti];
    if (terrace === undefined) continue;
    const first = terrace.lots[0];
    const decay = first !== undefined ? ruinDecayOf(first, blocks[first.block], infillStream, share, declineOf) : null;
    if (first !== undefined) terraceRolled++;
    if (decay !== null) {
      terraceRuined++;
      bandCounts.set(decay.band, (bandCounts.get(decay.band) ?? 0) + 1);
      const idx = terraceBuiltBase + ti;
      const orig = built[idx];
      if (orig === undefined) continue;
      built[idx] = { ...orig, params: { ...orig.params, decay: decay.intensity } };
    }
  }
  let infilled = 0;
  const tryInfill = (lot: Lot, relaxed: boolean): boolean => {
    if (claimed.has(lot.id)) return false;
    if (!relaxed && !lot.courtyard && positionFloat(infillStream, lot.rect.x0, 0, lot.rect.z0) >= (LOT_COVERAGE[p.density] as number)) {
      return false;
    }
    const filled = infillLot(lot, p, infillStream, prominence, input.minBuilding ?? MIN_INFILL_SIDE);
    if (filled === null) {
      if (!relaxed) dropped++;
      return false;
    }
    infilled++;
    rolled++;
    const decay = ruinDecayOf(lot, blocks[lot.block] as Block | undefined, infillStream, share, declineOf);
    if (decay !== null) {
      ruined++;
      bandCounts.set(decay.band, (bandCounts.get(decay.band) ?? 0) + 1);
    }
    const builtLot: BuiltLot = {
      nodePath: `${nodePath}.${filled.id}`,
      id: filled.id,
      rect: filled.rect,
      face: lot.face,
      size: filled.size,
      ports: INFILL_PORTS,
      params: decay === null ? filled.params : { ...filled.params, decay: decay.intensity },
      tags: filled.tags,
      seed: nodeSeed(worldSeed, `${nodePath}.${filled.id}`, ""),
      frontPort: undefined,
      ...frontageOf(lot.rect, lot.face, [lot]),
    };
    built.push(builtLot);
    claimed.add(lot.id);
    return true;
  };
  for (const lot of lots) tryInfill(lot, false);
  const dressedBlocks: DressedBlock[] = [];
  let bareBlocks = 0;
  let redrawnBlocks = 0;
  if (walled && !hasPlanned && blocks.length > 0) {
    const menu = dressingsFor(intent.eraDeclared ? intent.eraClass : DEFAULT_ERA_CLASS);
    const dressStream = streamSeed(seed, "dress");
    const occupied = new Uint8Array(blocks.length);
    for (const item of built) {
      const i = blockOf(blocks, item.rect);
      if (i >= 0) occupied[i] = 1;
    }
    const free = new Uint8Array(grid.cells);
    for (const block of blocks) {
      for (let z = block.rect.z0; z <= block.rect.z1; z++) {
        for (let x = block.rect.x0; x <= block.rect.x1; x++) {
          const k = grid.index(x, z);
          if (k >= 0 && blocked[k] !== 1) free[k] = 1;
        }
      }
    }
    let masked = 0;
    const maskBuilt = (): void => {
      for (; masked < built.length; masked++) {
        const item = built[masked] as BuiltLot;
        for (let z = item.rect.z0 - BUILDING_APRON; z <= item.rect.z1 + BUILDING_APRON; z++) {
          for (let x = item.rect.x0 - BUILDING_APRON; x <= item.rect.x1 + BUILDING_APRON; x++) {
            const k = grid.index(x, z);
            if (k >= 0) free[k] = 0;
          }
        }
      }
    };
    maskBuilt();
    for (const [i, block] of blocks.entries()) {
      if (i === plazaBlock || courtyardPlans.has(i)) continue;
      if (occupied[i] !== 1) {
        bareBlocks++;
        let gained = false;
        for (const lot of lots) {
          if (lot.block !== i) continue;
          if (tryInfill(lot, true)) gained = true;
        }
        if (gained) {
          redrawnBlocks++;
          occupied[i] = 1;
          maskBuilt();
        }
      }
      const remainder = largestFreeRect(grid, free, block.rect);
      if (remainder === null) continue;
      const w = remainder.x1 - remainder.x0 + 1;
      const d = remainder.z1 - remainder.z0 + 1;
      const bare = occupied[i] !== 1;
      const minSide = bare ? MIN_INFILL_SIDE : DRESSING_MIN_SIDE;
      const minArea = bare ? MIN_INFILL_SIDE * MIN_INFILL_SIDE : DRESSING_MIN_AREA;
      if (Math.min(w, d) < minSide || w * d < minArea) continue;
      const draw = positionFloat(dressStream, remainder.x0, 0, remainder.z0);
      const kind = menu[Math.min(menu.length - 1, Math.floor(draw * menu.length))] as BlockDressing;
      dressedBlocks.push({ block: i, rect: remainder, kind });
    }
  }
  return {
    claimed,
    built,
    infilled,
    dropped,
    bareBlocks,
    redrawnBlocks,
    dressedBlocks,
    bandCounts,
    rolled,
    ruined,
    terraceRuined,
    terraceRolled,
  };
}




/**
 * Narrow infill stage — extracted from district.ts to satisfy Phase 6.2.
 * Takes explicit narrow inputs (no giant mutable closure), returns explicit
 * outputs. Preserves exact b763d56 order/RNG (positionFloat with infillStream,
 * streamSeed "dress", etc.), integer rounding, empty-block law, and
 * typed-array ownership (free mask newly owned, handed through result).
 */

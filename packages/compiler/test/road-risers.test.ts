/**
 * **STAIR_DRESS — the riser dressing** (`structures/road-risers.ts`).
 *
 * The pass is a pure function of the finished levels, so the pins here are
 * geometric sentences: a one-block riser between paved columns gets a stair
 * in the higher column's top course facing the rise; everything else — a
 * ledge, a crest, a flooded course, a column with masonry standing on it —
 * stays the full block the driver wrote, and the refusals are counted rather
 * than dressed over. No level moves in any row of this file: the input plan
 * is asserted byte-identical after every call, which is the pass's whole
 * distinction from the retired `junction-steps.ts`.
 */

import { describe, expect, it } from "vitest";

import type { Region } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { STAIR_DRESS } from "../src/layout/types.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { dressRoadRisers, type RoadRiserInput } from "../src/structures/road-risers.js";
import type { PavedSurface } from "../src/structures/junction-steps.js";
import type { StructureBlock } from "../src/structures/buildings.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;

/** The state every dressed riser must be, per facing. */
function stairState(facing: string): number {
  const state = stack.blockStateOf("stone_brick_stairs", {
    facing,
    half: "bottom",
    shape: "straight",
    waterlogged: "false",
  });
  if (state === undefined) throw new Error(`no stone_brick_stairs[facing=${facing}]`);
  return state;
}

/* -------------------------------------------------------------------------- */
/* fixture                                                                     */
/* -------------------------------------------------------------------------- */

const R: Region = { x0: 0, z0: 0, width: 16, depth: 16 };

function plan(): ColumnPlan {
  const n = R.width * R.depth;
  const ground = new Int32Array(n).fill(60);
  const fluidTop = new Int32Array(n);
  fluidTop.set(ground);
  return {
    region: R,
    ground,
    fluidTop,
    fluidKind: new Uint8Array(n).fill(FluidKind.NONE),
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: SEA,
    stoneSeed: 0,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0, caveAir: 0 },
  } as ColumnPlan;
}

const idx = (x: number, z: number): number => z * R.width + x;

function input(
  p: ColumnPlan,
  paved: PavedSurface[],
  blocks: StructureBlock[] = [],
  bridged: Set<number> = new Set(),
): RoadRiserInput {
  return { region: R, plan: p, stack, paved, bridged, blocks };
}

function street(columns: number[]): PavedSurface {
  return { kind: "street", sourceClass: "street.network", columns };
}

/** Every plan array, snapshotted — the "no level moves" pin reads all of them. */
function snapshot(p: ColumnPlan): string {
  return JSON.stringify([
    [...p.ground],
    [...p.fluidTop],
    [...p.surface],
    [...p.subsurface],
    [...p.soil],
  ]);
}

/* -------------------------------------------------------------------------- */
/* pins                                                                        */
/* -------------------------------------------------------------------------- */

describe("STAIR_DRESS", () => {
  // STAIR_DRESS flip (2026-08-23): the dressing demonstration ships — Kai's
  // gate for the flight-object mini-project. Landed false in a5e4573.
  it("is flipped on: stepped streets are the shipping state", () => {
    expect(STAIR_DRESS).toBe(true);
  });

  it("dresses a stepped street's risers with stairs facing the rise, and moves no level", () => {
    const p = plan();
    const cols: number[] = [];
    // A 3-wide street along x, one riser every three blocks: ground = 60 + ⌊x/3⌋.
    for (let x = 1; x <= 12; x++) {
      for (let z = 4; z <= 6; z++) {
        p.ground[idx(x, z)] = 60 + Math.floor(x / 3);
        p.fluidTop[idx(x, z)] = p.ground[idx(x, z)] as number;
        cols.push(idx(x, z));
      }
    }
    const before = snapshot(p);
    const east = stairState("east");
    const result = dressRoadRisers(input(p, [street(cols)]));

    // The risers are x = 3, 6, 9, 12 — three rows each, all climbing east.
    expect(result.dressed).toBe(12);
    expect(result.refused).toBe(0);
    expect(result.blocks).toHaveLength(12);
    for (const b of result.blocks) {
      expect([3, 6, 9, 12]).toContain(b.x);
      expect([4, 5, 6]).toContain(b.z);
      expect(b.y).toBe(60 + Math.floor(b.x / 3));
      expect(b.stateId).toBe(east);
    }
    expect(snapshot(p)).toBe(before);
  });

  it("refuses a ledge: a riser column that also faces a deeper paved drop stays bare", () => {
    const p = plan();
    // (8,10) at 71 with a one-block low west and a two-block drop east.
    p.ground[idx(7, 10)] = 70;
    p.ground[idx(8, 10)] = 71;
    p.ground[idx(9, 10)] = 69;
    for (const k of [idx(7, 10), idx(8, 10), idx(9, 10)]) p.fluidTop[k] = p.ground[k] as number;
    const result = dressRoadRisers(input(p, [street([idx(7, 10), idx(8, 10), idx(9, 10)])]));
    expect(result.dressed).toBe(0);
    expect(result.refused).toBe(1);
  });

  it("refuses a crest: opposite lows cannot share one facing", () => {
    const p = plan();
    p.ground[idx(11, 12)] = 80;
    p.ground[idx(12, 12)] = 81;
    p.ground[idx(13, 12)] = 80;
    for (const k of [idx(11, 12), idx(12, 12), idx(13, 12)]) p.fluidTop[k] = p.ground[k] as number;
    const result = dressRoadRisers(input(p, [street([idx(11, 12), idx(12, 12), idx(13, 12)])]));
    expect(result.dressed).toBe(0);
    expect(result.refused).toBe(1);
  });

  it("skips a flooded course and never counts as a low what a deck bridges", () => {
    const p = plan();
    p.ground[idx(1, 14)] = 60;
    p.ground[idx(2, 14)] = 61;
    p.fluidTop[idx(1, 14)] = 60;
    p.fluidTop[idx(2, 14)] = 63; // water over the riser column
    const flooded = dressRoadRisers(input(p, [street([idx(1, 14), idx(2, 14)])]));
    expect(flooded.dressed).toBe(0);
    expect(flooded.refused).toBe(0);

    const q = plan();
    q.ground[idx(1, 2)] = 60;
    q.ground[idx(2, 2)] = 61;
    q.fluidTop[idx(1, 2)] = 60;
    q.fluidTop[idx(2, 2)] = 61;
    const decked = dressRoadRisers(
      input(q, [street([idx(1, 2), idx(2, 2)])], [], new Set([idx(1, 2)])),
    );
    // The only low was the deck; the riser has nothing paved to climb from.
    expect(decked.dressed).toBe(0);
  });

  it("refuses a riser with masonry standing on it", () => {
    const p = plan();
    p.ground[idx(1, 8)] = 60;
    p.ground[idx(2, 8)] = 61;
    p.fluidTop[idx(1, 8)] = 60;
    p.fluidTop[idx(2, 8)] = 61;
    const stoop: StructureBlock = { x: 2, y: 62, z: 8, stateId: 1 };
    const result = dressRoadRisers(input(p, [street([idx(1, 8), idx(2, 8)])], [stoop]));
    expect(result.dressed).toBe(0);
    expect(result.refused).toBe(1);
  });

  it("climbs from any paving but dresses only streets and roads", () => {
    const p = plan();
    // A street column one above a plaza: dressed, facing east (the rise runs east).
    p.ground[idx(1, 1)] = 60;
    p.ground[idx(2, 1)] = 61;
    // A plaza column one above a street: the plaza dressed itself; left alone.
    p.ground[idx(5, 1)] = 61;
    p.ground[idx(4, 1)] = 60;
    for (const k of [idx(1, 1), idx(2, 1), idx(4, 1), idx(5, 1)]) {
      p.fluidTop[k] = p.ground[k] as number;
    }
    const paved: PavedSurface[] = [
      street([idx(2, 1), idx(4, 1)]),
      { kind: "plaza", sourceClass: "plaza.ground", columns: [idx(1, 1), idx(5, 1)] },
    ];
    const result = dressRoadRisers(input(p, paved));
    expect(result.dressed).toBe(1);
    expect(result.blocks[0]).toMatchObject({ x: 2, y: 61, z: 1, stateId: stairState("east") });
  });

  it("ignores unpaved neighbours entirely: a verge below a road edge is not a step", () => {
    const p = plan();
    p.ground[idx(6, 3)] = 61; // a lone paved column; everything beside it is soil at 60
    p.fluidTop[idx(6, 3)] = 61;
    const result = dressRoadRisers(input(p, [street([idx(6, 3)])]));
    expect(result.dressed).toBe(0);
    expect(result.refused).toBe(0);
  });

  it("is deterministic: the same plan dresses to the same blocks", () => {
    const p = plan();
    const cols: number[] = [];
    for (let x = 1; x <= 12; x++) {
      for (let z = 4; z <= 6; z++) {
        p.ground[idx(x, z)] = 60 + Math.floor(x / 3);
        p.fluidTop[idx(x, z)] = p.ground[idx(x, z)] as number;
        cols.push(idx(x, z));
      }
    }
    const a = dressRoadRisers(input(p, [street(cols)]));
    const b = dressRoadRisers(input(p, [street(cols)]));
    expect(a.blocks).toEqual(b.blocks);
  });
});

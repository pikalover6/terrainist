/**
 * The swept **profiles**: the bridge kit and the tread law.
 *
 * Both clients are written against the `SweptProfile` contract pinned in
 * while the engine (`structures/sweep.ts`) is built in
 * parallel, so the tests below are written against the same contract: a
 * **fixture sweep stub** stands in for the engine, exactly as F4's tests stood
 * in for `StreetGraph`. When the engine lands, the stub is deleted and these
 * assertions are pointed at `sweep()` — the profiles and the tread law they
 * exercise do not change.
 */

import { describe, expect, it } from "vitest";

import {
  approachIndices,
  buildBridgeKit,
  pierArcs,
  spanArcs,
  type BridgeStates
} from "../src/structures/bridge.js";
import {
  BRIDGE_PROFILE,
  STAIR_PROFILE,
  bridgeBandAt,
  bridgeOffsets,
  bridgeProfile,
  featureHits,
  featureOf,
  synthesizeTreadPlan,
  treadPlan,
  treadSurfaces,
  worstRise,
  type SweptProfile,
  type TreadShape
} from "../src/structures/profiles.js";
import { bandOfLane, totalHalfWidth } from "../src/structures/sweep.js";
import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import { STAIR_CONNECT, dressSetPieces, endsConnect } from "../src/structures/setpieces.js";
import type { SetPiece } from "../src/layout/vistas.js";
import { nodeSeed } from "@terrainist/stdlib";
import type { ColumnPlan } from "../src/terrain/columns.js";

/* -------------------------------------------------------------------------- */
/* the fixture sweep stub                                                      */
/* -------------------------------------------------------------------------- */

interface StubColumn {
  readonly x: number;
  readonly z: number;
  readonly offset: number;
  readonly band: string;
  readonly cap: boolean;
}

/**
 * A minimal, axis-aligned stand-in for `sweep()`.
 *
 * It implements only the parts of the contract the two clients rely on today:
 * band membership by lateral offset (DESIGN §3 rule 3, in its easy
 * axis-aligned case) and interval features by arc length phase-locked to the
 * path start (rule 5). It knows nothing about terrain, miters or crossings —
 * those are the engine's, and asserting them here would be asserting a stub.
 */
function stubSweep(
  profile: SweptProfile,
  path: readonly { x: number; z: number }[],
  centredWidth?: number,
): {
  columns: StubColumn[];
  features: { id: string; x: number; z: number }[];
} {
  const resolved = centredWidth === undefined ? profile : bridgeProfile(centredWidth);
  const reach = Math.floor(totalHalfWidth(resolved));
  const columns: StubColumn[] = [];
  const features: { id: string; x: number; z: number }[] = [];
  for (const [k, cell] of path.entries()) {
    for (let o = -reach; o <= reach; o++) {
      const band = resolved.bands[bandOfLane(resolved, o)];
      if (band === undefined) continue;
      columns.push({
        x: cell.x,
        z: cell.z + o,
        offset: o,
        band: band.id,
        cap: band.cap !== undefined
      });
    }
    for (const feature of profile.features ?? []) {
      if (featureHits(feature, k)) features.push({ id: feature.id, x: cell.x, z: cell.z });
    }
  }
  return { columns, features };
}

/* -------------------------------------------------------------------------- */
/* 1. the profiles as data                                                     */
/* -------------------------------------------------------------------------- */

describe("the swept profiles", () => {
  it("puts the bridge parapet outside the carriageway, on the deck's own edge", () => {
    // The bug this pins: C4's first draft put the parapet at `half` — inboard
    // of the rail the deck builder had already laid — narrowing the road and
    // standing a wall on a top slab that reports no support.
    const width = 9;
    const { half, rail } = bridgeOffsets(width);
    expect(half).toBe(4);
    expect(rail).toBe(5);
    expect(bridgeBandAt(width, half)?.role).toBe("carriageway");
    expect(bridgeBandAt(width, rail)?.role).toBe("parapet");
    expect(bridgeBandAt(width, rail + 1)).toBeUndefined();
    // Both halves of the kit read the same number: that is the whole fix, and
    // the number comes from the engine's own `totalHalfWidth`.
    expect(Math.floor(totalHalfWidth(bridgeProfile(width)))).toBe(rail);
  });

  it("caps the parapet with a rail and leaves the carriageway bare", () => {
    const swept = stubSweep(BRIDGE_PROFILE, [{ x: 0, z: 0 }], 9);
    const capped = swept.columns.filter((c) => c.cap).map((c) => c.offset).sort((a, b) => a - b);
    expect(capped).toEqual([-5, 5]);
    expect(swept.columns.filter((c) => c.band === "carriageway").length).toBe(9);
  });

  it("gives the stair a five-column tread band between two balustrades", () => {
    expect(totalHalfWidth(STAIR_PROFILE)).toBe(3);
    const band = (lane: number) => STAIR_PROFILE.bands[bandOfLane(STAIR_PROFILE, lane)]?.id;
    expect(band(0)).toBe("tread");
    expect(band(2)).toBe("tread");
    expect(band(3)).toBe("balustrade");
    expect(featureOf(STAIR_PROFILE, "lamp").pitch).toBeGreaterThan(0);
  });

  it("phase-locks interval features to the start of the run", () => {
    const lamp = featureOf(BRIDGE_PROFILE, "lamp");
    expect(featureHits(lamp, 0)).toBe(true);
    expect(featureHits(lamp, lamp.pitch)).toBe(true);
    expect(featureHits(lamp, lamp.pitch - 1)).toBe(false);
    // Negative arc is not an error, it is the far side of the phase.
    expect(featureHits(lamp, -lamp.pitch)).toBe(true);
    // A pitch of zero never fires: `at: "bend"` features are not intervals.
    expect(featureHits({ id: "pylon", pitch: 0, offset: 0 }, 0)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the bridge kit                                                           */
/* -------------------------------------------------------------------------- */

const REGION = { x0: -32, z0: -32, width: 64, depth: 64 };

/** A channel of water from x = −6 to x = 6, banks either side, bed at y = 58. */
function channelPlan(): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const ground = new Int32Array(n);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      const x = REGION.x0 + i;
      ground[j * REGION.width + i] = Math.abs(x) <= 6 ? 58 : 64;
    }
  }
  return { region: REGION, ground } as unknown as ColumnPlan;
}

function channelWater(): Uint8Array {
  const water = new Uint8Array(REGION.width * REGION.depth);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      const x = REGION.x0 + i;
      if (Math.abs(x) <= 6) water[j * REGION.width + i] = 1;
    }
  }
  return water;
}

const STATES: BridgeStates = { deck: 1, post: 2, pier: 3 };

/** A road crossing the channel west to east at deck height 65. */
const CROSSING = Array.from({ length: 30 }, (_, k) => ({ x: -15 + k, z: 0, y: 65 }));

describe("the bridge kit", () => {
  it("stands a pier at both abutments and on a rhythm between them", () => {
    // The screenshot criticism, made testable: a bare plank with a stub tower
    // at each end has piers only at the ends.
    expect(pierArcs(13)).toContain(0);
    expect(pierArcs(13)).toContain(12);
    expect(pierArcs(13).length).toBeGreaterThan(2);
    // Evenly spaced, and the spacing is the profile's.
    const pitch = featureOf(BRIDGE_PROFILE, "pier").pitch;
    expect(pierArcs(40)).toContain(pitch);
    expect(pierArcs(40)).toContain(pitch * 2);
    // A short span is still an abutment pair and nothing silly in between.
    expect(pierArcs(2)).toEqual([0, 1]);
  });

  it("restarts the arc at every dry column, so the rhythm belongs to the span", () => {
    const wet = [false, false, true, true, true, false, true, true];
    expect([...spanArcs(wet)]).toEqual([-1, -1, 0, 1, 2, -1, 0, 1]);
  });

  it("decks the channel, rails the parapet columns and founds every pier", () => {
    const plan = channelPlan();
    const { blocks, features } = buildBridgeKit(REGION, plan, CROSSING, 9, STATES, channelWater());
    expect(blocks.length).toBeGreaterThan(0);
    expect(features.length).toBeGreaterThan(0);

    const { rail } = bridgeOffsets(9);
    const written = new Set(blocks.map((b) => `${b.x},${b.y},${b.z}`));
    for (const b of blocks) {
      if (b.stateId === STATES.post) {
        // The rail runs on the parapet column and nowhere else.
        expect(Math.abs(b.z)).toBe(rail);
        expect(written.has(`${b.x},${b.y - 1},${b.z}`)).toBe(true);
      }
      if (b.stateId === STATES.pier) {
        // Founded: the block below is either the bed or the pier's own course.
        const onBed = b.y === 59;
        expect(onBed || written.has(`${b.x},${b.y - 1},${b.z}`)).toBe(true);
        expect(b.y).toBeLessThan(65);
      }
    }
    // The deck is one column wider each side than the lane it carries.
    const deckZ = new Set(blocks.filter((b) => b.stateId === STATES.deck).map((b) => b.z));
    expect(Math.max(...deckZ)).toBe(rail);
    expect(Math.min(...deckZ)).toBe(-rail);
  });

  it("never writes a block over dry land", () => {
    const water = channelWater();
    const { blocks } = buildBridgeKit(REGION, channelPlan(), CROSSING, 9, STATES, water);
    for (const b of blocks) {
      const idx = (b.z - REGION.z0) * REGION.width + (b.x - REGION.x0);
      expect(water[idx]).toBe(1);
    }
  });

  it("writes the same blocks twice from one crossing", () => {
    const a = buildBridgeKit(REGION, channelPlan(), CROSSING, 9, STATES, channelWater());
    const b = buildBridgeKit(REGION, channelPlan(), CROSSING, 9, STATES, channelWater());
    expect(JSON.stringify(b.blocks)).toBe(JSON.stringify(a.blocks));
  });

  it("carries the parapet onto the bank, and stops", () => {
    const wet = [false, false, false, false, false, false, true, true, true, false, false, false, false, false, false];
    const approach = approachIndices(wet);
    // The columns either side of the span, out to the approach run…
    expect(approach).toContain(5);
    expect(approach).toContain(9);
    // …and not the whole road.
    expect(approach).not.toContain(0);
    expect(approach.every((k) => wet[k] === false)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the tread law                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The levels, from the engine.
 *
 * `synthesizeTreads` owns the recurrence; the law under test only decorates
 * what it produces, so the test asks the engine rather than restating it.
 */
function needFor(ground: readonly number[]): readonly number[] {
  const run = synthesizeTreadPlan(ground, { maxFill: 64, reach: 64 });
  if (run === null) throw new Error("the engine refused a run this test needs");
  return run.levels;
}

describe("the tread law", () => {
  it("uses stairs on risers, landings on the flat above them, slabs between", () => {
    // A bank that climbs, levels off for a while, then climbs again — every
    // shape the law knows, in one flight.
    const ground = [70, 71, 72, 73, 73, 73, 73, 74, 75];
    const need = needFor(ground);
    const shapes = treadPlan(need, ground);
    expect(shapes.length).toBe(ground.length);
    const kinds = new Set<TreadShape>(shapes);
    expect(kinds.has("stair")).toBe(true);
    expect(kinds.has("landing")).toBe(true);
    expect(kinds.has("slab")).toBe(true);
    // A column with a block ahead of it is a stair, always.
    for (const [k, shape] of shapes.entries()) {
      const ahead = k + 1 < need.length ? (need[k + 1] as number) - (need[k] as number) : 0;
      if (ahead >= 1) expect(shape).toBe("stair");
    }
  });

  it("refuses a run the engine refuses, and dresses nothing", () => {
    // A cliff: the recurrence would need a retaining wall under the flat
    // approach, so the engine returns no levels and the client builds none.
    expect(synthesizeTreadPlan([70, 70, 70, 82], { maxFill: 4 })).toBeNull();
    // …and an ordinary bank comes back dressed.
    const ok = synthesizeTreadPlan([70, 71, 72, 73], { maxFill: 4 });
    expect(ok?.shapes.length).toBe(4);
  });

  it("leaves an unfilled column alone", () => {
    // Flat ground the flight did not raise is not a tread and gets no slab:
    // the law dresses fill, it does not invent it.
    const ground = [70, 70, 70, 70];
    const need = [...ground];
    expect(treadPlan(need, ground)).toEqual(["landing", "landing", "landing", "landing"]);
  });

  it("never moves a level — the recurrence is the mechanism", () => {
    const ground = [70, 70, 71, 73, 73, 74];
    const need = needFor(ground);
    const before = [...need];
    treadPlan(need, ground);
    expect(need).toEqual(before);
  });

  it("stays climbable on every flight the recurrence accepts", () => {
    // The contract: no step up anywhere is worse than the one block the
    // undressed flight already demanded. Exhaustive over every 8-column bank
    // whose per-column rise is 0..2 — 3^7 flights, the shapes the seeker can
    // hand over.
    let seen = 0;
    const rises = [0, 1, 2];
    const walk = (ground: number[]): void => {
      if (ground.length === 8) {
        const need = needFor(ground);
        const shapes = treadPlan(need, ground);
        // Only flights the seeker would accept: fill within its cap.
        const worstFill = Math.max(...need.map((n, k) => n - (ground[k] as number)));
        if (worstFill > 4) return;
        seen += 1;
        expect(worstRise(need, shapes)).toBeLessThanOrEqual(1);
        // …and no surface is ever *above* the level the recurrence set.
        for (const [k, s] of treadSurfaces(need, shapes).entries()) {
          expect(s.depart).toBeLessThanOrEqual(need[k] as number);
          expect(s.arrive).toBeGreaterThanOrEqual((need[k] as number) - 0.5);
        }
        return;
      }
      for (const r of rises) walk([...ground, (ground[ground.length - 1] ?? 70) + r]);
    };
    walk([70]);
    expect(seen).toBeGreaterThan(100);
  });

  it("is never worse than the all-full-blocks construction it replaces", () => {
    // The trap DESIGN §3 rule 2 names: raising every column by the same half
    // block leaves every riser as tall as it was. The law only ever *lowers* a
    // surface, and only where the column ahead is level.
    const ground = [70, 70, 71, 71, 72];
    const need = needFor(ground);
    const shapes = treadPlan(need, ground);
    for (const [k, s] of treadSurfaces(need, shapes).entries()) {
      const ahead = k + 1 < need.length ? (need[k + 1] as number) - (need[k] as number) : 0;
      if (s.depart < (need[k] as number)) expect(ahead).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 4. the law, through the dressing pass                                       */
/* -------------------------------------------------------------------------- */

const STACK = loadPrismarine(EMIT_MINECRAFT_VERSION);
const STAIR_REGION = { x0: -64, z0: -64, width: 128, depth: 128 };

/**
 * A bank that climbs, levels off for three columns, then climbs again — the
 * shape that forces all three tread kinds out of one flight.
 */
function terracedBank(): ColumnPlan {
  const n = STAIR_REGION.width * STAIR_REGION.depth;
  const ground = new Int32Array(n);
  for (let j = 0; j < STAIR_REGION.depth; j++) {
    for (let i = 0; i < STAIR_REGION.width; i++) {
      const x = STAIR_REGION.x0 + i;
      const rise = x <= 0 ? 0 : x <= 7 ? x : x <= 10 ? 7 : Math.min(11, 7 + (x - 10));
      ground[j * STAIR_REGION.width + i] = 100 + rise;
    }
  }
  return {
    region: STAIR_REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: 63,
    stoneSeed: 1,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0, caveAir: 0 }
  } as unknown as ColumnPlan;
}

const TERRACE_STAIR: SetPiece = {
  id: "hillside_stair",
  kind: "stair",
  site: { x0: 0, z0: -3, x1: 14, z1: 3 },
  detail: "a terraced bank",
  rise: 11,
  path: Array.from({ length: 15 }, (_, k) => ({ x: k, z: 0 }))
};

describe("the dressed public stair", () => {
  const result = dressSetPieces({
    plan: terracedBank(),
    stack: STACK,
    seed: nodeSeed(20260801n, "world", ""),
    nodePath: "world",
    cities: [{ nodePath: "world.harbourtown", setPieces: [TERRACE_STAIR] }]
  });
  const names = result.blocks.map((b) => STACK.blockNameByStateId(b.stateId) ?? "?");

  it("builds treads out of a mix, not a patch of bricks", () => {
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(names).toContain("stone_brick_stairs");
    expect(names).toContain("stone_brick_slab");
    expect(names).toContain("stone_bricks");
    expect(result.diagnostics).toEqual([]);
  });

  it("faces every tread stair the way you climb", () => {
    // The flight runs +x, so every stair on it faces east. A stair facing back
    // down the hill is a trip hazard and reads as a mistake from any angle.
    const facings = new Set(
      result.blocks
        .filter((b) => STACK.blockNameByStateId(b.stateId) === "stone_brick_stairs")
        .map((b) => STACK.blockStateProps(b.stateId)?.props["facing"]),
    );
    expect([...facings]).toEqual(["east"]);
  });

  it("leaves nothing hanging", () => {
    const written = new Set(result.blocks.map((b) => `${b.x},${b.y},${b.z}`));
    const plan = terracedBank();
    for (const b of result.blocks) {
      const i = b.x - STAIR_REGION.x0;
      const j = b.z - STAIR_REGION.z0;
      const ground = plan.ground[j * STAIR_REGION.width + i] as number;
      expect(b.y === ground + 1 || written.has(`${b.x},${b.y - 1},${b.z}`)).toBe(true);
    }
  });

  it("writes the same blocks twice", () => {
    const again = dressSetPieces({
      plan: terracedBank(),
      stack: STACK,
      seed: nodeSeed(20260801n, "world", ""),
      nodePath: "world",
      cities: [{ nodePath: "world.harbourtown", setPieces: [TERRACE_STAIR] }]
    });
    expect(JSON.stringify(again.blocks)).toBe(JSON.stringify(result.blocks));
  });
});

/* -------------------------------------------------------------------------- */
/* 5. the two broken-structure defects Kai walked                              */
/* -------------------------------------------------------------------------- */

/**
 * **Defect C** — the plank mess in the water at the quay.
 *
 * A lane skirting a lake shore on a diagonal dipped a toe in the water every
 * few columns, and the kit built per *wet column*: each of those one- and
 * two-column "spans" got a deck square, two fence posts and a log pier, and the
 * band was walked along the rasterized cell's local perpendicular, which on a
 * 45° route leaves a checkerboard. Thirty-eight blocks of oak at three heights
 * in one inlet, connected to nothing — a collapsed pier.
 *
 * The span is now the unit: too short is a ford, and a span that cannot deck
 * every arc of itself is refused whole.
 */
describe("the bridge kit's all-or-nothing span", () => {
  it("fords a puddle rather than fragmenting over it", () => {
    // One wet column, and two, on an otherwise dry lane: not a crossing.
    for (const wetRun of [1, 2]) {
      const water = new Uint8Array(REGION.width * REGION.depth);
      const plan = channelPlan();
      const path = Array.from({ length: 20 }, (_, k) => ({ x: -10 + k, z: 0, y: 65 }));
      for (let k = 0; k < wetRun; k++) {
        const cell = path[8 + k] as { x: number; z: number };
        for (let o = -4; o <= 4; o++) {
          water[(cell.z + o - REGION.z0) * REGION.width + (cell.x - REGION.x0)] = 1;
        }
      }
      const { blocks } = buildBridgeKit(REGION, plan, path, 9, STATES, water);
      expect(blocks, `a ${wetRun}-column span is a ford`).toEqual([]);
    }
  });

  it("builds a real crossing whole, and covers every arc of it", () => {
    const plan = channelPlan();
    const { blocks } = buildBridgeKit(REGION, plan, CROSSING, 9, STATES, channelWater());
    const decked = new Set(
      blocks.filter((b) => b.stateId === STATES.deck).map((b) => `${b.x},${b.z}`),
    );
    // Every wet column of the crossing carries deck — no holes to fall through.
    for (const cell of CROSSING) {
      const wet = Math.abs(cell.x) <= 6;
      if (wet) expect(decked.has(`${cell.x},${cell.z}`), `${cell.x},${cell.z}`).toBe(true);
    }
  });

  it("decks a diagonal crossing without the checkerboard", () => {
    // The defect made visible: a 45° route. The old band walked ±o along the
    // cell's own perpendicular, so consecutive offsets were √2 apart and the
    // deck came out dithered. Perpendicular distance to the true line does not.
    const water = new Uint8Array(REGION.width * REGION.depth);
    const plan = channelPlan();
    for (let j = 0; j < REGION.depth; j++) {
      for (let i = 0; i < REGION.width; i++) {
        const x = REGION.x0 + i;
        const z = REGION.z0 + j;
        if (Math.abs(x + z) <= 8) water[j * REGION.width + i] = 1;
      }
    }
    const path = Array.from({ length: 24 }, (_, k) => ({ x: -12 + k, z: 12 - k, y: 65 }));
    const { blocks } = buildBridgeKit(REGION, plan, path, 9, STATES, water);
    const deck = blocks.filter((b) => b.stateId === STATES.deck);
    expect(deck.length).toBeGreaterThan(40);

    // One connected surface: every deck column reaches every other through
    // 8-connected steps. A dither fails this — it is two lattices.
    const cells = new Set(deck.map((b) => `${b.x},${b.z}`));
    const seen = new Set<string>();
    const first = [...cells][0] as string;
    const queue = [first];
    seen.add(first);
    while (queue.length > 0) {
      const [x, z] = (queue.pop() as string).split(",").map(Number) as [number, number];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const key = `${x + dx},${z + dz}`;
          if (!cells.has(key) || seen.has(key)) continue;
          seen.add(key);
          queue.push(key);
        }
      }
    }
    expect(seen.size).toBe(cells.size);

    // And no gaps *along* the walk: every deck column has an orthogonal
    // neighbour, which is what a player needs to cross without jumping.
    for (const key of cells) {
      const [x, z] = key.split(",").map(Number) as [number, number];
      const orthogonal =
        cells.has(`${x + 1},${z}`) ||
        cells.has(`${x - 1},${z}`) ||
        cells.has(`${x},${z + 1}`) ||
        cells.has(`${x},${z - 1}`);
      expect(orthogonal, key).toBe(true);
    }
  });
});

/**
 * **Defect D** — the stairs to nowhere.
 *
 * A masonry flight, lanterns and all, stranded mid-hillside: no path at the top
 * and no destination at the bottom. `seekFlight` verified that the strip was
 * climbable and never that it *went* anywhere.
 */
describe("a public stair connects at both ends or is not built", () => {
  const stair = (connects?: (x: number, z: number) => boolean) =>
    dressSetPieces({
      plan: terracedBank(),
      stack: STACK,
      seed: nodeSeed(20260801n, "world", ""),
      nodePath: "world",
      cities: [{ nodePath: "world.harbourtown", setPieces: [TERRACE_STAIR] }],
      ...(connects === undefined ? {} : { connects })
    });

  it("refuses the whole flight, lamps included, when neither end reaches anything", () => {
    const result = stair(() => false);
    expect(result.blocks).toEqual([]);
    expect(result.diagnostics.map((d) => d.name)).toContain("STAIR_UNCONNECTED");
  });

  it("refuses it when only one end reaches something", () => {
    // The bottom of the flight is at x ≈ 0; give it a street there and nothing
    // at the top. Half a connection is a folly with a landing.
    const result = stair((x) => x <= 1);
    expect(result.blocks).toEqual([]);
  });

  it("builds it, unchanged, when both ends reach the city", () => {
    const wired = stair((x) => x <= 1 || x >= 13);
    expect(wired.blocks.length).toBeGreaterThan(0);
    expect(wired.diagnostics).toEqual([]);
    // Identical to the flight the pass lays with no rule at all: the rule
    // gates the piece, it does not reshape it.
    expect(JSON.stringify(wired.blocks)).toBe(JSON.stringify(stair().blocks));
  });

  it("counts a column within the connect radius, and not one beyond it", () => {
    const flight: { x: number; z: number }[] = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 }
    ];
    expect(endsConnect(flight, (x, z) => x === -STAIR_CONNECT && z === 0)).toBe(false);
    const both = (x: number, z: number): boolean =>
      z === 0 && (x === -STAIR_CONNECT || x === 2 + STAIR_CONNECT);
    expect(endsConnect(flight, both)).toBe(true);
    const tooFar = (x: number, z: number): boolean =>
      z === 0 && (x === -STAIR_CONNECT - 1 || x === 2 + STAIR_CONNECT + 1);
    expect(endsConnect(flight, tooFar)).toBe(false);
    // No predicate at all: nothing to fail to reach.
    expect(endsConnect(flight)).toBe(true);
  });
});

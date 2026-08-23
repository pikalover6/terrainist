/**
 * **ROAD_SOVEREIGN — the road is the terrain's top block, and nothing outranks it.**
 *
 * Four behaviours, one flag (`layout/types.ts`), and this file pins each of
 * them as the sentence it is:
 *
 * 1. **Roads drape.** A surfaced column takes the ground oracle's own answer,
 *    so the pass moves no ground at all: the resolved ground after the surfacer
 *    equals the ground before it, column for column, and the road is the top
 *    block of that column with a different material on it.
 * 2. **Roads are rank one.** The finished build holds road material at every
 *    masked column's top position, with three clear blocks above it — a block
 *    another pass put there is dropped whatever the pass meant by it.
 * 3. **No stairs on the ground.** A `steps` run is surfaced as plain draped
 *    carriageway; not one stair block reaches the street network, and the
 *    stepped surfacing the tread law dresses a flight with is never chosen.
 * 4. **A stone-brick border.** Both flanks of a straight run carry one column
 *    of `stone_bricks`, laid as a replacement of the terrain's top block.
 *
 * And, first of all, that the flag's **off state is inert**: the parameter that
 * lets these tests exist changes nothing when it is false, which is the same
 * claim the ground probe's byte-identity check makes at whole-world scale.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import { ROAD_SOVEREIGN } from "../src/layout/types.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { Palette } from "../src/terrain/palette.js";
import type { StructureBlock } from "../src/structures/buildings.js";
import { enforceRoadSovereignty, type BlockSpan } from "../src/structures/index.js";
import { index, surfaceStreetGraph } from "../src/structures/roads.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEA = 63;
const emptyPalette = new Palette(new Map(), nodeSeed(1n, "palette"));
const STONE_BRICKS = stack.blockByName("stone_bricks")?.stateId as number;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function region(size = 96): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function plan(r: Region, height: (x: number, z: number) => number): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const k = j * r.width + i;
      ground[k] = height(r.x0 + i, r.z0 + j);
      fluidTop[k] = ground[k] as number;
    }
  }
  return {
    region: r,
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
    seaLevel: SEA,
    stoneSeed: 0,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 },
  };
}

/**
 * **Uneven ground, and uneven in the one way that matters** — it falls *along*
 * the run rather than across it, so a grading surfacer has something to grade
 * and a draping one has something to follow. A stepped terrace fall (three flat
 * columns, one riser of two) is deliberately not 1-Lipschitz: it is the shape
 * that makes a graded profile and the terrain disagree.
 */
const terraced = (x: number): number => SEA + 12 - 2 * Math.floor((x + 48) / 3);

function graphOf(segments: StreetSegment[]): StreetGraph {
  return { segments, intersections: [], sidewalk: 2 };
}

/** A straight east–west run down the terrace, `role` as given. */
function run(
  id: string,
  z: number,
  role: StreetSegment["role"],
  width = 3,
): StreetSegment {
  return {
    id,
    kind: "lane",
    width,
    path: Array.from({ length: 36 }, (_, i) => ({ x: -18 + i, z })),
    ...(role === undefined ? {} : { role }),
  };
}

function surface(p: ColumnPlan, graph: StreetGraph, sovereign?: boolean, pull?: boolean) {
  return surfaceStreetGraph({
    graphs: [graph],
    plan: p,
    palette: emptyPalette,
    stack,
    placements: [],
    buildingPaths: new Set<string>(),
    seed: nodeSeed(11n, "world.quarter"),
    theme: "medieval_village",
    ...(sovereign === undefined ? {} : { sovereign }),
    ...(pull === undefined ? {} : { pull }),
  });
}

/** Is this state id a Minecraft stair block? The one question item 3 asks. */
function isStair(stateId: number): boolean {
  return (stack.blockNameByStateId(stateId) ?? "").endsWith("_stairs");
}

/* -------------------------------------------------------------------------- */
/* 0. the off state is inert                                                   */
/* -------------------------------------------------------------------------- */

describe("the flag's off state", () => {
  it("ships ON since the flip: roads drape, outrank, and wear stone brick", () => {
    // Re-pinned at the ROAD_SOVEREIGN flip: network ground moved off
    // baseline 1,454 -> 0 on troy, network stairs 33 -> 0, borders 2,139.
    expect(ROAD_SOVEREIGN).toBe(true);
  });

  it("is the graded surfacing: reproducible, borderless, and not the on state", () => {
    // **Rewritten at the flip.** This row used to compare `sovereign: false`
    // against the surfacer's *default*, which was the same pass only for as
    // long as the shipped constant was false — the moment it flipped the row
    // asserted that on equals off and failed for the right reason at the wrong
    // place. What it is for survives, stated without reference to the constant:
    // the off state is a pass of its own, it reproduces exactly, it grows no
    // stone-brick border, and it is a *different* pass from the on state, which
    // is what makes every override in this suite and in the sibling test files
    // mean something.
    const r = region();
    const graph = graphOf([run("ew0", 0, undefined), run("st0", 8, "steps")]);

    const control = plan(r, (x) => terraced(x));
    const first = surface(control, graph, false);

    const explicit = plan(r, (x) => terraced(x));
    const off = surface(explicit, graph, false);

    expect([...explicit.ground]).toEqual([...control.ground]);
    expect([...explicit.surface]).toEqual([...control.surface]);
    expect([...off.road]).toEqual([...first.road]);
    expect(off.blocks).toEqual(first.blocks);
    expect(off.surfacedColumns).toBe(first.surfacedColumns);
    // No border off the flag — item 4 is the on state's alone.
    expect(off.border).toBeUndefined();
    expect(first.border).toBeUndefined();

    // …and the override reaches the machinery: the on state drapes, so it moves
    // ground the graded pass moved differently, and it wears item 4's border.
    const onPlan = plan(r, (x) => terraced(x));
    const on = surface(onPlan, graph, true);
    expect([...onPlan.ground]).not.toEqual([...control.ground]);
    expect(on.border).toBeDefined();
  });

  it("still lays the tread law's stepped flight, so the on state has something to remove", () => {
    // The control for §3 below: with the flag off a `steps` run *is* dressed by
    // `dressStreetStairs`, and the stair blocks it lays are what the sovereign
    // road must not contain. Without this row a green §3 could mean nothing but
    // "the fixture never had a stair in it".
    const r = region();
    const p = plan(r, (x) => terraced(x));
    const out = surface(p, graphOf([run("st0", 8, "steps")]), false);
    expect(out.blocks.filter((b) => isStair(b.stateId)).length).toBeGreaterThan(0);
    expect(out.declaration.segments.some((s) => s.role === "steps")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 1. roads drape                                                              */
/* -------------------------------------------------------------------------- */

describe("item 1 — a road never places a block above the terrain", () => {
  it("moves no ground at all, and re-materials the ground's own top block", () => {
    const r = region();
    const p = plan(r, (x) => terraced(x));
    const before = Int32Array.from(p.ground);
    // `pull: false` since the ROAD_PULL flip: item 1's pure-drape law is this
    // suite's to pin, and on this terraced fixture the shipped blend now grades
    // on purpose — the blend's own laws live in `road-pull.test.ts`.
    const out = surface(p, graphOf([run("ew0", 0, undefined)]), true, false);

    expect(out.surfacedColumns).toBeGreaterThan(0);
    // (a) Every surfaced column stands at the ground oracle's own level: the
    // pass declared the number that was already there, so the resolve gives it
    // straight back. Not "close to", not "within the grade cap" — equal.
    const moved: number[] = [];
    for (let k = 0; k < before.length; k++) {
      if (p.ground[k] !== before[k]) moved.push(k);
    }
    expect(moved).toEqual([]);

    // …and the top block of every one of them is road material rather than the
    // untouched terrain state the fixture started from.
    let surfaced = 0;
    for (let k = 0; k < before.length; k++) {
      if (out.road[k] !== 1) continue;
      surfaced++;
      expect(p.surface[k]).not.toBe(0);
    }
    expect(surfaced).toBe(out.surfacedColumns);
  });

  it("is what the grading surfacer was not — the control cuts and fills", () => {
    // The same fixture with the flag off *does* move the ground: that is the
    // whole difference, and pinning it here is what stops the row above from
    // passing on a fixture too flat to grade.
    const r = region();
    const p = plan(r, (x) => terraced(x));
    const before = Int32Array.from(p.ground);
    surface(p, graphOf([run("ew0", 0, undefined)]), false);
    let moved = 0;
    for (let k = 0; k < before.length; k++) if (p.ground[k] !== before[k]) moved++;
    expect(moved).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. no stairs on the street network                                          */
/* -------------------------------------------------------------------------- */

describe("item 3 — all ground stair generation is off", () => {
  it("surfaces a `steps` run as plain draped carriageway, with no stair block", () => {
    const r = region();
    const p = plan(r, (x) => terraced(x));
    const before = Int32Array.from(p.ground);
    // `pull: false` since the ROAD_PULL flip — see item 1's note: this row pins
    // "drapes like every other road", and under the blend a steps-steep fixture
    // grades by design. The no-stairs half is pull-invariant either way.
    const out = surface(p, graphOf([run("st0", 8, "steps"), run("ca0", 16, "cart")]), true, false);

    // (b) Not one stair block anywhere the street network laid.
    expect(out.blocks.filter((b) => isStair(b.stateId))).toEqual([]);
    // The flight is declared as a carriageway, which is what makes the claim
    // above structural rather than incidental: no job took the tread path, so
    // no geometry, no tread law, no balustrade and no landing exist for it.
    expect(out.declaration.segments.map((s) => s.role)).toEqual(["carriageway", "carriageway"]);
    // And it drapes like every other road.
    for (let k = 0; k < before.length; k++) expect(p.ground[k]).toBe(before[k]);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. the stone-brick border                                                   */
/* -------------------------------------------------------------------------- */

describe("item 4 — a stone-brick border on each flank", () => {
  it("reads bricks | surface … surface | bricks across a straight run", () => {
    const r = region();
    const p = plan(r, (x) => terraced(x));
    const out = surface(p, graphOf([run("ew0", 0, undefined, 3)]), true);
    const border = out.border;
    expect(border).toBeDefined();
    if (border === undefined) return;

    // Mid-run, clear of both ends, so the slice is a true cross-section.
    for (const x of [-10, -4, 0, 6, 12]) {
      const cross: ("border" | "road" | "off")[] = [];
      for (let z = -4; z <= 4; z++) {
        const k = index(r, x, z);
        cross.push(border[k] === 1 ? "border" : out.road[k] === 1 ? "road" : "off");
      }
      // A 3-wide lane plus one border column each side, and nothing else.
      expect(cross.join(" ")).toBe("off off border road road road border off off");
    }

    // (c) The border is a *replacement*: stone brick on top of the column's own
    // ground, and not one block of ground moved to put it there.
    let bordered = 0;
    for (let k = 0; k < border.length; k++) {
      if (border[k] !== 1) continue;
      bordered++;
      expect(p.surface[k]).toBe(STONE_BRICKS);
      expect(out.road[k]).toBe(0);
    }
    expect(bordered).toBeGreaterThan(0);
  });

  it("lets a crossing road's surface claim a border cell — surface beats border", () => {
    const r = region();
    const p = plan(r, (x) => terraced(x));
    const crossing: StreetSegment = {
      id: "ns0",
      kind: "lane",
      width: 3,
      path: Array.from({ length: 24 }, (_, i) => ({ x: 0, z: -12 + i })),
    };
    const out = surface(p, graphOf([run("ew0", 0, undefined, 3), crossing]), true);
    const border = out.border;
    expect(border).toBeDefined();
    if (border === undefined) return;
    // No column is both, so the junction is never severed by a kerb drawn
    // across it: the four cells where the two ribbons meet are all surface.
    for (let k = 0; k < border.length; k++) {
      if (border[k] === 1) expect(out.road[k]).toBe(0);
    }
    for (let z = -2; z <= 2; z++) {
      for (let x = -1; x <= 1; x++) expect(out.road[index(r, x, z)]).toBe(1);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. nothing writes over a road                                               */
/* -------------------------------------------------------------------------- */

describe("item 2 — the road outranks every other writer", () => {
  it("drops a colliding block and a severing course, and keeps a bridge", () => {
    const r = region();
    const p = plan(r, () => 70);
    const mask = new Uint8Array(r.width * r.depth);
    const surfaceOf = new Int32Array(r.width * r.depth);
    const k = index(r, 0, 0);
    mask[k] = 1;
    surfaceOf[k] = STONE_BRICKS;
    // The road column has been repainted by a later pass — grass, say, from the
    // ground treatment. Item 2 takes it back.
    p.surface[k] = 4242;

    const top = p.ground[k] as number;
    const collides: StructureBlock = { x: 0, y: top, z: 0, stateId: 11 };
    const severs: StructureBlock = { x: 0, y: top + 2, z: 0, stateId: 12 };
    const spans: StructureBlock = { x: 0, y: top + 9, z: 0, stateId: 13 };
    const elsewhere: StructureBlock = { x: 5, y: top, z: 5, stateId: 14 };
    const ownDeck: StructureBlock = { x: 0, y: top + 1, z: 0, stateId: 15 };

    const blocks: StructureBlock[] = [collides, severs, spans, elsewhere, ownDeck];
    const blockSpans: BlockSpan[] = [
      { emitter: "retaining", from: 0, to: 2 },
      { emitter: "walls", from: 2, to: 4 },
      { emitter: "streets", from: 4, to: 5 },
    ];

    enforceRoadSovereignty(p, { mask, surface: surfaceOf }, blocks, blockSpans);

    // (d) The colliding block and the severing course are gone; the span that
    // clears the headroom stays, as does anything off the mask, as does the
    // road pass's own deck.
    expect(blocks).toEqual([spans, elsewhere, ownDeck]);
    // The span that lost every block loses its row; the survivors are re-ranged.
    expect(blockSpans).toEqual([
      { emitter: "walls", from: 0, to: 2 },
      { emitter: "streets", from: 2, to: 3 },
    ]);
    // And the road wears road material again.
    expect(p.surface[k]).toBe(STONE_BRICKS);
  });
});

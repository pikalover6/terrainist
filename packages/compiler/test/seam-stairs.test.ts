/**
 * **The seam stair and the reachable door** —
 * Part IV, wave 11E: laws S9, S10 and S11.
 *
 * One mechanism ran through all three findings of §4.0, and the third of them —
 * *"stairs to nowhere"*, 46 doorstep flights stacked up bank faces to doors the
 * bank made unreachable — is the one this wave answers. It answers it by
 * building the step has specified since
 * the courtyards round and nobody has ever built (§4.0a M7): **derived stairs**,
 * over the landings a served seam publishes.
 *
 * Three things are proved here, and they are deliberately different in kind:
 *
 * 1. **S9, the derivation** — the landings contract as it is consumed, one
 *    flight per stack at the tread column nearest a street on each side, the
 *    `MAX_DERIVED_STAIRS` cap, and `LOAM-I414`. Then the point of the whole
 *    design: the derived segment is handed to `structures/street-stairs.ts`
 *    unchanged and comes back climbable, because registering it **before
 *    surfacing** puts it through the tread law that already exists. **No new
 *    stair code is under test here, and that is the assertion.**
 * 2. **S10, the gate** — `footLands` is *extended*, never rewritten:
 *    `DOORSTEP_FOOT_STEP` is still the whole measurement, and the two masks add
 *    the two answers a height comparison cannot reach. Each is proved as a pair
 *    of fixtures identical but for the mask, which is the control §6 demands —
 *    *prove the harness can see a difference before trusting that it saw none.*
 * 3. **S11, the measurement** — `LOAM-I415` on a course whose fill stands as the
 *    face across a platform boundary. Measured, not moved: the same fixture's
 *    wall is the wall it was.
 *
 * **Wave 11F flipped `SEAM_TIERS` to `true`** on Kai's walk verdict. Nothing
 * about the derivation changed with it: every flag-on assertion below still
 * rides the per-call `tiered: true` that `platforms.test.ts` and
 * `seam-tiers.test.ts` use, or hands the consuming pass a landing list by hand,
 * and the flag-off control now asks for `tiered: false` explicitly instead of
 * leaning on the global default.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { nodeSeed } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import {
  MAX_DERIVED_STAIRS,
  SEAM_STAIR_JOIN,
  deriveSeamStairs,
  type SeamLandingStack
} from "../src/layout/district.js";
import { NO_PLATFORM } from "../src/layout/levels.js";
import { STREET_WIDTH } from "../src/layout/streets.js";
import { type ResolvedPort } from "../src/layout/types.js";
import type { BuiltBuilding } from "../src/structures/buildings.js";
import { DOORSTEP_FOOT_STEP, buildDoorsteps } from "../src/structures/doorsteps.js";
import {
  WALL_SEAM_CROSS_DROP,
  wallSeamCrossingNote,
  wallSeamCrossings
} from "../src/structures/walls.js";
import { streetStairGeometry, streetStairLevels } from "../src/structures/street-stairs.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { resolvePalette } from "../src/terrain/palette.js";

const SIZE = 40;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const at = (x: number, z: number): number => z * SIZE + x;

/** A dry plan of grass over dirt whose ground is whatever `height` says. */
function planOf(stack: PrismarineStack, height: (x: number, z: number) => number): ColumnPlan {
  const n = SIZE * SIZE;
  const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
  const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
  const ground = new Int32Array(n);
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) ground[at(x, z)] = height(x, z);
  return {
    region: REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n).fill(grass),
    subsurface: new Int32Array(n).fill(dirt),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: 62,
    stoneSeed: 1,
    states: {
      bedrock: 0,
      stone: 0,
      deepslate: 0,
      water: stack.blockByName("minecraft:water")?.stateId ?? 0,
      lava: 0,
      snowLayer: 0,
      caveAir: 0
    }
  } as unknown as ColumnPlan;
}

/* -------------------------------------------------------------------------- */
/* 1 — S9: the landing contract, as it is consumed                            */
/* -------------------------------------------------------------------------- */

/**
 * **A served drop-8 seam**, as §4.2 sizes it: `tiersOf(8)` is two faces of four,
 * so the stack publishes three landings — the lower platform it stands on, one
 * tread between the faces, and the upper platform it holds.
 *
 * Laid across the region in `z`, `x` 8..20 wide, which is what a contour seam on
 * a quarter looks like from above. `y` is the plan's own convention — the same
 * number a `GroundClaim` carries and the same number the ground view reports.
 */
const XS = Array.from({ length: 13 }, (_, i) => 8 + i);
const row = (z: number): { x: number; z: number }[] => XS.map((x) => ({ x, z }));

const DROP8: SeamLandingStack = {
  source: "world.quarter#tiers@0",
  nodePath: "world.quarter",
  landings: [
    { y: 64, columns: row(16) }, // the lower platform, at the stack's foot
    { y: 68, columns: [...row(12), ...row(13), ...row(14)] }, // SEAM_TREAD = 3
    { y: 72, columns: row(10) }, // the upper platform the stack holds
  ]
};

/** Two streets, one on each side of the stack — the things a flight lands on. */
const onStreet = (x: number, z: number): boolean => (z === 8 || z === 18) && x >= 4 && x <= 24;

describe("S9 — a served seam publishes its landings, and the stair belongs to the seam", () => {
  it("derives nothing at all with the flag off, which is every world before 11F", () => {
    // Re-pinned at 11F: the flag is now `true`, so "the flag off" has to be
    // *asked for* — the bare call took its `tiered` from `SEAM_TIERS` and is
    // no longer the off path. The refusal itself is unchanged and still the
    // control for every derivation below.
    const off = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: [DROP8],
      onStreet,
      tiered: false
    });
    expect(off.segments).toEqual([]);
    expect(off.cut).toBe(0);
    expect(off.diagnostics).toEqual([]);
  });

  it("cuts ONE flight per stack, as an ordinary `role: \"steps\"` segment", () => {
    const result = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: [DROP8],
      onStreet,
      tiered: true
    });
    expect(result.cut).toBe(1);
    expect(result.refused).toBe(0);
    const flight = result.segments[0];
    expect(flight).toBeDefined();
    if (flight === undefined) return;
    // The whole of S9's mechanism: what comes back is a street segment. Nothing
    // in this wave lays a stair block, and the surfacer is what does.
    expect(flight.role).toBe("steps");
    expect(flight.kind).toBe("lane");
    expect(flight.width).toBe(STREET_WIDTH.lane);
  });

  it("runs from street to street, through every landing on the way", () => {
    const flight = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: [DROP8],
      onStreet,
      tiered: true
    }).segments[0];
    expect(flight).toBeDefined();
    if (flight === undefined) return;
    const zs = flight.path.map((p) => p.z);
    // Carried onto the street at both ends, so the tread law gets a pin there
    // and the flight lands at the street's level rather than at whatever the
    // ground under its last tread happened to be.
    expect(Math.min(...zs)).toBe(8);
    expect(Math.max(...zs)).toBe(18);
    expect(onStreet(flight.path[0]?.x ?? -1, flight.path[0]?.z ?? -1)).toBe(true);
    const last = flight.path[flight.path.length - 1];
    expect(onStreet(last?.x ?? -1, last?.z ?? -1)).toBe(true);
    // Through the tread: a flight that misses the landings is not cut *at* the
    // seam, which is the thing S9 asks for.
    for (const z of [10, 12, 13, 14, 16]) expect(zs).toContain(z);
    // 4-connected, as every consumer of a `path` assumes.
    for (let i = 1; i < flight.path.length; i++) {
      const a = flight.path[i - 1] as { x: number; z: number };
      const b = flight.path[i] as { x: number; z: number };
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
  });

  it("takes the landing column nearest a street, and only within SEAM_STAIR_JOIN", () => {
    // A street off to one side pulls the anchor to that side of the seam, which
    // is what "at the tread column nearest a street column" means: the flight is
    // put where a person would walk to it.
    const east = (x: number, z: number): boolean => x === 21 && z >= 6 && z <= 20;
    const pulled = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: [DROP8],
      onStreet: east,
      tiered: true
    }).segments[0];
    expect(pulled).toBeDefined();
    expect(pulled?.path.some((p) => p.x === 21)).toBe(true);
    // Nothing in reach: the flight is still cut, anchored on the landings' own
    // first columns, and it is the tread law's business whether it survives.
    const far = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: [DROP8],
      onStreet: (x, z) => z === 18 + SEAM_STAIR_JOIN + 4 && x >= 4,
      tiered: true
    });
    expect(far.cut).toBe(1);
    expect(far.segments[0]?.path.every((p) => p.z <= 18)).toBe(true);
  });

  it("is capped at MAX_DERIVED_STAIRS per quarter, and says how many it refused", () => {
    const many = Array.from({ length: MAX_DERIVED_STAIRS + 5 }, (_, i) => ({
      ...DROP8,
      source: `world.quarter#tiers@${i}`
    }));
    const result = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: many,
      onStreet,
      tiered: true
    });
    expect(result.cut).toBe(MAX_DERIVED_STAIRS);
    expect(result.refused).toBe(5);
    const cut = result.diagnostics.find((d) => d.name === "SEAM_STAIR_CUT");
    expect(cut?.code).toBe("LOAM-I414");
    expect(cut?.severity).toBe("note");
    expect(cut?.message).toContain(`${MAX_DERIVED_STAIRS} flight(s) cut`);
    expect(cut?.message).toContain("5 more stack(s) got none");
    // Ids are unique: two flights with one id is one flight to the graph.
    expect(new Set(result.segments.map((s) => s.id)).size).toBe(MAX_DERIVED_STAIRS);
  });

  it("declines a seam with nothing to climb between, and says nothing about it", () => {
    const kerb: SeamLandingStack = { ...DROP8, landings: [{ y: 64, columns: row(16) }] };
    const result = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: [kerb],
      onStreet,
      tiered: true
    });
    expect(result.cut).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });

  it("is a pure function of the landings: the same input twice is the same flight", () => {
    const once = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: [DROP8],
      onStreet,
      tiered: true
    });
    const twice = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: [DROP8],
      onStreet,
      tiered: true
    });
    expect(JSON.stringify(twice.segments)).toBe(JSON.stringify(once.segments));
  });
});

/* -------------------------------------------------------------------------- */
/* 2 — S9's payoff: the flight rides the EXISTING tread law                    */
/* -------------------------------------------------------------------------- */

describe("the derived flight goes through street-stairs.ts, and no new stair code", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  /** The stack's own section: two faces of four, with the tread between them. */
  const stairGround = (_x: number, z: number): number =>
    z <= 11 ? 72 : z <= 15 ? 68 : 64;

  it("lays a drop-8 stack as a climbable flight — every riser one block", () => {
    const plan = planOf(stack, stairGround);
    const flight = deriveSeamStairs({
      nodePath: "world.quarter",
      landings: [DROP8],
      onStreet,
      tiered: true
    }).segments[0];
    expect(flight).toBeDefined();
    if (flight === undefined) return;
    const n = SIZE * SIZE;
    const geometry = streetStairGeometry({
      region: REGION,
      plan,
      blocked: new Uint8Array(n),
      paved: new Uint8Array(n),
      water: new Uint8Array(n),
      path: flight.path,
      width: flight.width
    });
    expect(geometry.refusedBecause).toBeUndefined();
    const levels = streetStairLevels(geometry, (x, z) => plan.ground[at(x, z)] as number);
    // **The tread law, not this wave's arithmetic.** `need[k] = max(g[k] + 1,
    // need[k+1] − 1)` is what makes this hold, and it was written for `terraced`
    // two rounds ago.
    expect(levels.refusedBecause).toBeUndefined();
    expect(levels.levels.length).toBe(geometry.centre.length);
    for (let k = 1; k < levels.levels.length; k++) {
      const rise = Math.abs((levels.levels[k] as number) - (levels.levels[k - 1] as number));
      expect(rise, `riser at ${k}`).toBeLessThanOrEqual(1);
    }
    // And the control: the ground under it is *not* climbable — the two faces
    // are four blocks each. The flight is the difference, not the fixture.
    const raw = geometry.centre.map((c) => plan.ground[at(c.x, c.z)] as number);
    expect(Math.max(...raw.map((g, i) => (i === 0 ? 0 : Math.abs(g - (raw[i - 1] as number)))))).toBe(
      4,
    );
  });

  it("and the whole-run refusal is still the surfacer's, on a run that cannot climb", () => {
    // A cliff rather than a stack: 8 blocks in one column, over a run too short
    // for the law to spread it. Refused whole — half a staircase ending in a
    // hop is worse than none, and this wave adds no second opinion about that.
    const plan = planOf(stack, (_x, z) => (z <= 12 ? 96 : 64));
    const path = Array.from({ length: 6 }, (_, i) => ({ x: 12, z: 10 + i }));
    const n = SIZE * SIZE;
    const geometry = streetStairGeometry({
      region: REGION,
      plan,
      blocked: new Uint8Array(n),
      paved: new Uint8Array(n),
      water: new Uint8Array(n),
      path,
      width: STREET_WIDTH.lane
    });
    const levels = streetStairLevels(geometry, (x, z) => plan.ground[at(x, z)] as number);
    expect(levels.refusedBecause).toBeDefined();
    expect(levels.levels).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3 — S10: a door above a seam is reachable, or it is not a door              */
/* -------------------------------------------------------------------------- */

/** One house on the west of the region with its door in the east wall. */
function house(floorY: number): BuiltBuilding {
  return {
    nodePath: "world.house",
    footprint: { x0: 4, z0: 12, x1: 8, z1: 16 },
    floorY
  } as unknown as BuiltBuilding;
}

function door(floorY: number): ResolvedPort {
  return {
    nodePath: "world.house",
    ref: "door",
    type: "door",
    position: [8, floorY, 14],
    outwardNormal: [1, 0, 0]
  } as unknown as ResolvedPort;
}

describe("S10 — the foot gate reads `landings` and `bank`, and never rewrites the rule", () => {
  let stack: PrismarineStack;
  let palette: ReturnType<typeof resolvePalette>["palette"];
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
  });

  const run = (
    plan: ColumnPlan,
    floorY: number,
    extra: { landings?: SeamLandingStack[]; bank?: Uint8Array } = {},
  ) =>
    buildDoorsteps({
      buildings: [house(floorY)],
      ports: [door(floorY)],
      plan,
      palette,
      stack,
      ...(extra.landings === undefined ? {} : { landings: extra.landings }),
      ...(extra.bank === undefined ? {} : { bank: extra.bank })
    });

  /**
   * A door on the upper platform of a served seam, with the tread below it.
   *
   * The lot stands at 69, the tier's tread at 68 for three columns, and the next
   * face falls away past it. The flight is two stairs and its foot lands on the
   * tread — which is a **place**, and which the two-column brink test cannot
   * tell from the edge of a bank, because a tread's far side is the next tier's
   * face by construction. That is the one case S10 exists for.
   */
  const TERRACE = (x: number): number => (x <= 8 ? 69 : x <= 11 ? 68 : 62);
  const TREAD: SeamLandingStack = {
    source: "world.quarter#tiers@0",
    nodePath: "world.quarter",
    landings: [
      { y: 62, columns: [{ x: 12, z: 14 }] },
      { y: 68, columns: [9, 10, 11].map((x) => ({ x, z: 14 })) },
      { y: 69, columns: [{ x: 8, z: 14 }] }
    ]
  };

  it("refuses the tread WITHOUT the landings — the control, so the difference is real", () => {
    const plan = planOf(stack, (x) => TERRACE(x));
    const result = run(plan, 70);
    expect(result.refused).toBe(1);
    expect(result.stepped).toBe(0);
    expect(result.blocks).toEqual([]);
  });

  it("and builds it WITH them: a landing is an arrival, so the door is a door", () => {
    const plan = planOf(stack, (x) => TERRACE(x));
    const result = run(plan, 70, { landings: [TREAD] });
    expect(result.refused).toBe(0);
    expect(result.stepped).toBe(1);
    expect(result.blocks.length).toBeGreaterThan(0);
    // The flight stands outside the house, on the seam it climbs.
    for (const b of result.blocks) expect(b.x).toBeGreaterThan(8);
  });

  it("still measures the arrival at DOORSTEP_FOOT_STEP — the constant is not rewritten", () => {
    // A landing the flight's foot cannot reach is not an arrival. Same fixture,
    // same masks; only the landing's own level moves, by one block past the step.
    const plan = planOf(stack, (x) => TERRACE(x));
    const far: SeamLandingStack = {
      ...TREAD,
      landings: TREAD.landings.map((l) =>
        l.y === 68 ? { ...l, y: 68 - DOORSTEP_FOOT_STEP - 8 } : l,
      )
    };
    expect(run(plan, 70, { landings: [far] }).refused).toBe(1);
  });

  it("refuses a bank however gently it steps — S8's landform carries nothing", () => {
    // The 1:2 bank S8 re-keys `gradeBank` to: half a block per column, which
    // passes both of `DOORSTEP_FOOT_STEP`'s tests all the way down the face.
    // Heights say yes, and the mask is the whole of the answer.
    const bankGround = (x: number): number => (x <= 8 ? 69 : 69 - Math.floor((x - 9) / 2));
    const plan = planOf(stack, (x) => bankGround(x));
    expect(run(plan, 70).stepped).toBe(1);

    const bank = new Uint8Array(SIZE * SIZE);
    for (let z = 0; z < SIZE; z++) for (let x = 9; x < SIZE; x++) bank[at(x, z)] = 1;
    const masked = run(planOf(stack, (x) => bankGround(x)), 70, { bank });
    expect(masked.refused).toBe(1);
    expect(masked.stepped).toBe(0);
    expect(masked.blocks).toEqual([]);
    expect(masked.touched.some((v) => v === 1)).toBe(false);
  });

  it("with neither mask, the gate is character-for-character the one that shipped", () => {
    // Flat ground, the ordinary seam the pass exists for: absent masks change
    // nothing, which is the reach argument for every world until the flag flips.
    const plan = planOf(stack, () => 69);
    const bare = run(plan, 70);
    const empty = run(planOf(stack, () => 69), 70, { landings: [], bank: new Uint8Array(SIZE * SIZE) });
    expect(bare.stepped).toBe(1);
    expect(empty.stepped).toBe(bare.stepped);
    expect(empty.refused).toBe(bare.refused);
    expect(JSON.stringify(empty.blocks)).toBe(JSON.stringify(bare.blocks));
  });
});

/* -------------------------------------------------------------------------- */
/* 4 — S11: a wall circuit crossing a seam is a client, not a second answer    */
/* -------------------------------------------------------------------------- */

describe("S11 — LOAM-I415 measures a course whose fill is the face, and moves nothing", () => {
  /** A straight stretch of course running across a platform boundary at z = 20. */
  const course = Array.from({ length: 12 }, (_, i) => ({ x: 10, z: 14 + i }));
  /** Two platforms, split at z = 20 — the seam the circuit strides over. */
  const platformAt = (_x: number, z: number): number => (z < 20 ? 0 : 1);
  /** …and the ground they hold: an eight-block face, which is Troy's own drop. */
  const standAt = (_x: number, z: number): number | undefined => (z < 20 ? 72 : 64);

  it("counts the crossing, its depth, and the run it stands over", () => {
    const measured = wallSeamCrossings(course, platformAt, standAt);
    expect(measured.crossings).toBe(1);
    expect(measured.deepest).toBe(8);
    expect(measured.longest).toBe(1);
  });

  it("needs BOTH a boundary and a face — one without the other is not a crossing", () => {
    // A boundary the ground does not step across is a kerb, and every course
    // crosses those everywhere.
    expect(
      wallSeamCrossings(course, platformAt, (_x, z) => (z < 20 ? 65 : 64)).crossings,
    ).toBe(0);
    // …and a step with no boundary under it is a hill, which is what a wall
    // following terrain does for a living. "A `retaining.seam` requires a seam."
    expect(wallSeamCrossings(course, () => NO_PLATFORM, standAt).crossings).toBe(0);
    // The bar is `WALL_SEAM_CROSS_DROP`, and it is stated rather than implied.
    expect(WALL_SEAM_CROSS_DROP).toBe(2);
    expect(
      wallSeamCrossings(course, platformAt, (_x, z) =>
        z < 20 ? 64 + WALL_SEAM_CROSS_DROP : 64,
      ).crossings,
    ).toBe(1);
    expect(
      wallSeamCrossings(course, platformAt, (_x, z) =>
        z < 20 ? 64 + WALL_SEAM_CROSS_DROP - 1 : 64,
      ).crossings,
    ).toBe(0);
  });

  it("measures a long crossing as a run, which is what decides the promotion", () => {
    // A course running *along* a boundary rather than over it: the interesting
    // shape, and the one §10.8 asks a walk about.
    const along = Array.from({ length: 12 }, (_, i) => ({ x: 10 + i, z: 20 }));
    const alternating = (x: number, _z: number): number => (x % 2 === 0 ? 0 : 1);
    const stepped = (x: number, _z: number): number | undefined => (x % 2 === 0 ? 72 : 64);
    const measured = wallSeamCrossings(along, alternating, stepped);
    expect(measured.crossings).toBe(11);
    expect(measured.longest).toBe(11);
    expect(measured.deepest).toBe(8);
  });

  it("says the numbers as LOAM-I415, and says nothing where the course kept to one platform", () => {
    const fired = wallSeamCrossingNote({
      nodePath: "world.troy",
      style: "masonry",
      courseColumns: course.length,
      crossings: wallSeamCrossings(course, platformAt, standAt)
    });
    expect(fired?.code).toBe("LOAM-I415");
    expect(fired?.name).toBe("WALL_COURSE_CROSSES_SEAM");
    expect(fired?.severity).toBe("note");
    expect(fired?.message).toContain("1 column(s)");
    expect(fired?.message).toContain("deepest crossing is 8 block(s)");
    // Measured, not moved — the note itself says so, because the next round
    // reads this line and not the design document.
    expect(fired?.fix).toContain("not moved");

    expect(
      wallSeamCrossingNote({
        nodePath: "world.flat",
        style: "masonry",
        courseColumns: course.length,
        crossings: wallSeamCrossings(course, () => 0, standAt)
      }),
    ).toBeUndefined();
  });
});

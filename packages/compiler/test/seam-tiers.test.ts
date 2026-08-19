/**
 * **The tier stack** — `docs/GROUND-UNIFICATION-v0.md` Part IV, wave 11B.
 *
 * S2 in one sentence: `RETAIN_MAX` is a ceiling on a *face*, not on a *drop*. A
 * drop of `D` is served by `ceil(D / RETAIN_MAX)` faces, each at most
 * `RETAIN_MAX` tall, stacked with a tread between them — so the eight-block
 * citadel seams Troy graded into 45° ramps of raw earth (§4.0a M3) become two
 * faces of four, and nothing anywhere is left as a cliff the wall refused to be.
 *
 * Three things are proved here and they are deliberately different in kind:
 *
 * 1. **the arithmetic**, as pure functions — `tiersOf`, `seamDressing`,
 *    `tieredRun` — where the assertions are §4.2's own worked examples (8 → 4+4,
 *    11 → 6+5, 14 → 5+5+4) and the laws behind them;
 * 2. **the dressing rule** (S5): one arithmetic, two dressings, chosen by
 *    `pressedShare` against `EDGE_PRESSED_SHARE`, with the run fallback that
 *    makes the geometry never fail for want of ground;
 * 3. **the construction**, on production-shaped fixtures put through
 *    `buildRetainingWalls` — the same shape `seam-honesty.test.ts` uses, and
 *    `tiered: true` on the district exactly as `platforms.test.ts` passes
 *    `tiered: true` to the election. **The global flag is never flipped**: it
 *    ships `false` and 11F flips it on Kai's walk verdict and nothing else.
 *
 * The last block is the control §6 demands — *prove the harness can see a
 * difference before trusting that it saw none*: the same fixture with the flag
 * off is the 45° bank that shipped, so "the stack is two tiers of four" is a
 * measurement rather than a test that cannot fail.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  BENCH_FACE,
  EDGE_PRESSED_SHARE,
  MIN_RETAIN_RUN,
  RETAIN_MAX,
  SEAM_SETBACK,
  SEAM_TIER_FACE,
  SEAM_TIER_MAX,
  SEAM_TREAD,
  bankRun,
  benchedRun,
  groundLevelsOf,
  levelSeams,
  seamContext,
  seamDressing,
  tierCountOf,
  tieredRun,
  tiersOf,
  treatmentForEdge,
  type SeamTier,
} from "../src/layout/levels.js";
import { DISSOLVE_DROP_MAX } from "../src/layout/platforms.js";
import { SEAM_TIERS } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";
import type { FormBench } from "../src/layout/forms/types.js";
import { buildRetainingWalls } from "../src/structures/retaining.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";

/* -------------------------------------------------------------------------- */
/* 1 — the arithmetic (S2, S3, §4.2)                                          */
/* -------------------------------------------------------------------------- */

/** Every drop a stack is allowed to serve. */
const SERVED = Array.from({ length: SEAM_TIER_MAX * RETAIN_MAX }, (_, i) => i + 1);

/** …and the ones a stack is ever *asked* to serve: past one face's ceiling. */
const STACKED = SERVED.filter((drop) => drop > RETAIN_MAX);

const faceList = (drop: number, dressing: "revetted" | "terraced" = "terraced"): number[] => {
  const tiers = tiersOf(drop, dressing);
  if (tiers === "replan") throw new Error(`drop ${drop} replanned`);
  return tiers.map((t) => t.face);
};

describe("the constants, pinned to §10.6 and §10.7's recommendations", () => {
  it("SEAM_TIER_FACE is RETAIN_MAX under S2's name — the ceiling did not move", () => {
    expect(SEAM_TIER_FACE).toBe(RETAIN_MAX);
    expect(RETAIN_MAX).toBe(6);
  });

  it("SEAM_TIER_MAX is 3, so a stack serves 18 blocks (§10.6)", () => {
    expect(SEAM_TIER_MAX).toBe(3);
    expect(SEAM_TIER_MAX * RETAIN_MAX).toBe(18);
  });

  it("SEAM_TREAD is 3 and SEAM_SETBACK is 1 (§10.7)", () => {
    expect(SEAM_TREAD).toBe(3);
    expect(SEAM_SETBACK).toBe(1);
    // Three, not `BENCH_TREAD`'s two: two columns of soil between two faces of
    // earth is a bank profile, and this is a tread a body turns on.
    expect(SEAM_TREAD).toBeGreaterThan(BENCH_FACE);
  });

  it("and `layout/platforms.ts`'s dissolve bar is this export, not a second number", () => {
    // 11C wrote `SEAM_TIER_MAX` module-locally with a comment saying to replace
    // it with this import the moment it existed. It exists; this is the
    // handshake, asserted rather than trusted.
    expect(DISSOLVE_DROP_MAX).toBe(SEAM_TIER_MAX * RETAIN_MAX);
  });
});

describe("tiersOf — §4.2's arithmetic, worked examples first", () => {
  it("splits the design's own three examples exactly", () => {
    expect(faceList(8)).toEqual([4, 4]);
    expect(faceList(11)).toEqual([6, 5]);
    expect(faceList(14)).toEqual([5, 5, 4]);
  });

  it("a drop of 8 is two tiers and a drop of 17 is three", () => {
    expect(faceList(8)).toHaveLength(2);
    expect(faceList(17)).toEqual([6, 6, 5]);
    expect(faceList(17)).toHaveLength(3);
    expect(faceList(18)).toEqual([6, 6, 6]);
  });

  it("the tier count is S2's ceiling, for every drop a stack serves", () => {
    for (const drop of SERVED) {
      expect(faceList(drop), `drop ${drop}`).toHaveLength(Math.ceil(drop / RETAIN_MAX));
      expect(tierCountOf(drop)).toBe(Math.ceil(drop / RETAIN_MAX));
    }
  });

  it("no face is ever past RETAIN_MAX — the §13.8 histogram's invariant, by construction", () => {
    for (const drop of SERVED) {
      for (const face of faceList(drop)) {
        expect(face, `drop ${drop}`).toBeLessThanOrEqual(RETAIN_MAX);
        expect(face).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("the faces sum to the drop, so a stack lands exactly on the upper platform", () => {
    for (const drop of SERVED) {
      expect(faceList(drop).reduce((a, b) => a + b, 0), `drop ${drop}`).toBe(drop);
    }
  });

  it("splits as evenly as possible, tallest at the BOTTOM — index 0 is the base", () => {
    for (const drop of SERVED) {
      const faces = faceList(drop);
      for (let i = 1; i < faces.length; i++) {
        expect(faces[i] as number, `drop ${drop}`).toBeLessThanOrEqual(faces[i - 1] as number);
      }
      const lo = Math.min(...faces);
      const hi = Math.max(...faces);
      expect(hi - lo, `drop ${drop}`).toBeLessThanOrEqual(1);
    }
  });

  it("past SEAM_TIER_MAX tiers it is `replan` — S3: the election was wrong, not the stack", () => {
    expect(tiersOf(SEAM_TIER_MAX * RETAIN_MAX, "terraced")).not.toBe("replan");
    expect(tiersOf(SEAM_TIER_MAX * RETAIN_MAX + 1, "terraced")).toBe("replan");
    expect(tiersOf(SEAM_TIER_MAX * RETAIN_MAX + 1, "revetted")).toBe("replan");
    // The bound is on the count, not on the dressing: how tall the faces are is
    // arithmetic, what they are made of is S5.
    expect(tierCountOf(19)).toBeGreaterThan(SEAM_TIER_MAX);
  });

  it("carries the dressing's tread on every tier, and nothing else differs", () => {
    const revetted = tiersOf(14, "revetted");
    const terraced = tiersOf(14, "terraced");
    if (revetted === "replan" || terraced === "replan") throw new Error("unreachable");
    expect(revetted.map((t) => t.tread)).toEqual([SEAM_SETBACK, SEAM_SETBACK, SEAM_SETBACK]);
    expect(terraced.map((t) => t.tread)).toEqual([SEAM_TREAD, SEAM_TREAD, SEAM_TREAD]);
    // One arithmetic (S5): the faces are the same numbers either way.
    expect(revetted.map((t) => t.face)).toEqual(terraced.map((t) => t.face));
  });
});

describe("the run a stack reserves — S5's price, and why revetted is the fallback", () => {
  it("is `tiers · (1 + tread)`", () => {
    expect(tieredRun(3, "revetted")).toBe(3 * (1 + SEAM_SETBACK));
    expect(tieredRun(3, "terraced")).toBe(3 * (1 + SEAM_TREAD));
  });

  it("a revetted stack fits wherever a single wall's soft answer fitted", () => {
    // "always fits where a single wall fitted" (S5), stated as the two runs a
    // seam ever had to find: the smooth bank §3.8 sizes, and the benched bank
    // §5.2 rule 5 grades. A revetted stack is cheaper than both, at every drop
    // the stack serves — so a seam that had room for the answer it used to get
    // has room for the stack.
    for (const drop of SERVED) {
      const tiers = faceList(drop).length;
      expect(tieredRun(tiers, "revetted"), `drop ${drop}`).toBeLessThanOrEqual(bankRun(drop));
      expect(tieredRun(tiers, "revetted"), `drop ${drop}`).toBeLessThanOrEqual(benchedRun(drop));
    }
  });

  it("…and a terraced one needs room, which is the whole reason there are two", () => {
    // The tall end of the range is where it bites: 18 blocks of terraces cost 12
    // columns of hillside where the revetted stack costs 6. Still cheaper than
    // the smooth bank §3.8 sizes — which is why a terraced stack is a *better*
    // answer than the bank wherever there is room for it at all.
    expect(tieredRun(3, "terraced")).toBeGreaterThan(tieredRun(3, "revetted"));
    for (const drop of STACKED) {
      const tiers = faceList(drop).length;
      expect(tieredRun(tiers, "terraced"), `drop ${drop}`).toBeGreaterThan(
        tieredRun(tiers, "revetted"),
      );
      // Still no dearer than either answer it replaces, at any drop — the room
      // clause is a fallback for a face with a lot pressing on the ground below
      // it, not a confession that the terraces cost more than the bank did.
      expect(tieredRun(tiers, "terraced"), `drop ${drop}`).toBeLessThanOrEqual(bankRun(drop));
      expect(tieredRun(tiers, "terraced"), `drop ${drop}`).toBeLessThanOrEqual(benchedRun(drop));
    }
  });
});

describe("seamDressing — S5's choice, and it is `pressedShare` first", () => {
  const roomy = 1000;

  it("at or above EDGE_PRESSED_SHARE the stack is revetted — the citadel reading", () => {
    expect(seamDressing(EDGE_PRESSED_SHARE, roomy, 2)).toBe("revetted");
    expect(seamDressing(1, roomy, 2)).toBe("revetted");
  });

  it("below it, with room, the stack is terraced — the hill-town reading", () => {
    expect(seamDressing(EDGE_PRESSED_SHARE - 0.01, roomy, 2)).toBe("terraced");
    expect(seamDressing(0, tieredRun(2, "terraced"), 2)).toBe("terraced");
  });

  it("below it, without room, the stack is revetted — the structural fallback", () => {
    // Not a tuning: the geometry never fails for want of ground, it only changes
    // what it is made of.
    expect(seamDressing(0, tieredRun(2, "terraced") - 1, 2)).toBe("revetted");
    expect(seamDressing(0, 0, 3)).toBe("revetted");
  });

  it("the threshold is EDGE_PRESSED_SHARE itself — the same number rule 3 reads", () => {
    expect(seamDressing(EDGE_PRESSED_SHARE, 0, 2)).toBe("revetted");
    expect(seamDressing(EDGE_PRESSED_SHARE - 1e-9, roomy, 2)).toBe("terraced");
  });
});

describe("treatmentForEdge rule 5 — a tall fill face is a stack, behind the flag", () => {
  const tall = (over: Partial<ReturnType<typeof seamContext>>) => ({
    ...seamContext(RETAIN_MAX + 2, MIN_RETAIN_RUN * 4),
    ...over,
  });

  it("without the flag it is `replan`, exactly as it shipped", () => {
    // Re-pinned at 11F: the bare context now takes `tiered` from `SEAM_TIERS`,
    // which is `true`, so the untiered answer must be asked for. What it
    // asserts — one face past the ceiling is a terrace that claimed ground it
    // should not have — is unchanged, and the next test is still its control.
    expect(treatmentForEdge(tall({ tiered: false }))).toBe("replan");
    expect(treatmentForEdge(tall({}))).toBe("tiered");
  });

  it("with it, a drop the stack serves is `tiered`", () => {
    expect(treatmentForEdge(tall({ tiered: true }))).toBe("tiered");
    expect(treatmentForEdge(tall({ tiered: true, drop: SEAM_TIER_MAX * RETAIN_MAX }))).toBe(
      "tiered",
    );
  });

  it("and past the stack it is `replan` again — S3's backstop, now with a caller", () => {
    expect(treatmentForEdge(tall({ tiered: true, drop: SEAM_TIER_MAX * RETAIN_MAX + 1 }))).toBe(
      "replan",
    );
  });

  it("a cut face is unchanged: a cliff is what a hillside is made of", () => {
    expect(treatmentForEdge(tall({ tiered: true, side: "cut" }))).toBe("rock");
  });

  it("and nothing before rule 5 moves — a short run is still soft, a kerb still a kerb", () => {
    expect(treatmentForEdge(tall({ tiered: true, run: MIN_RETAIN_RUN - 1 }))).toBe("bank");
    expect(treatmentForEdge(tall({ tiered: true, drop: 1 }))).toBe("kerb");
    expect(treatmentForEdge(tall({ tiered: true, builtShare: 1 }))).toBe("built");
  });
});

/* -------------------------------------------------------------------------- */
/* 2 — the construction, on production-shaped fixtures                        */
/* -------------------------------------------------------------------------- */

const SIZE = 64;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const BOUNDS = { x0: 0, z0: 0, x1: SIZE - 1, z1: SIZE - 1 } as const;
const at = (x: number, z: number): number => z * SIZE + x;

/** Two storeys, which is the drop six of Troy's citadel seams actually have. */
const UPPER_Y = 74;
const LOWER_Y = 66;
const DROP = UPPER_Y - LOWER_Y;
const SEAM_Z = 24;

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
      caveAir: 0,
    },
  } as unknown as ColumnPlan;
}

function districtOf(
  benches: FormBench[],
  over: {
    readonly tiered?: boolean;
    readonly carriagewayFrom?: number;
  } = {},
) {
  const levels = groundLevelsOf(BOUNDS, benches);
  if (levels === null) throw new Error("fixture has no platforms");
  const carriageway = new Uint8Array(SIZE * SIZE);
  if (over.carriagewayFrom !== undefined) {
    for (let z = over.carriagewayFrom; z < SIZE; z++)
      for (let x = 0; x < SIZE; x++) carriageway[at(x, z)] = 1;
  }
  return {
    nodePath: "world.quarter",
    bounds: BOUNDS,
    carriageway,
    sidewalk: new Uint8Array(SIZE * SIZE),
    levels,
    // 11F: the seam list has to be derived at the same `tiered` the district
    // declares, or a fixture that asks for the flag-off world is handed
    // treatments the flag-off pass cannot build. Before the flip the global
    // default happened to agree with every fixture here; it no longer does.
    seams: levelSeams(levels, ...(over.tiered === undefined ? [] : [{ tiered: over.tiered }])),
    ...(over.tiered === undefined ? {} : { tiered: over.tiered }),
  };
}

/**
 * **The citadel**: two platforms a full storey pair apart, with a terrace
 * standing two columns back from the seam on the low side. The building is what
 * presses on the edge — `pressedShare` 1 — so S5's answer is the revetted
 * dressing, which is the reading Kai's Troy verdict asked for.
 */
function citadel(tiered: boolean) {
  const benches: FormBench[] = [
    { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y },
    { id: "lower", runs: [{ x0: 0, z0: SEAM_Z, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y },
  ];
  const footprints: Rect[] = [{ x0: 0, z0: SEAM_Z + 2, x1: SIZE - 1, z1: SEAM_Z + 8 }];
  return {
    district: districtOf(benches, { tiered }),
    footprints,
    height: (x: number, z: number): number => (z < SEAM_Z ? UPPER_Y : LOWER_Y),
  };
}

/**
 * **The mid-town seam**: one platform standing over open hillside, with a
 * terrace far enough away to bound the run without pressing on the edge.
 *
 * The run beyond the face is 10 columns — past `tieredRun(2, "terraced")`'s 8,
 * short of `bankRun(8)`'s 16 — which is exactly the band where §5.2 rule 3
 * declines to grade a bank and S5 grants a terraced stack. This is the "stepped
 * earth you can plant" answer the inversion was written for and which has never
 * once run on a quarter that shipped (§4.0a M2).
 */
function midtown(tiered: boolean) {
  const benches: FormBench[] = [
    { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y },
  ];
  const footprints: Rect[] = [{ x0: 0, z0: SEAM_Z + 10, x1: SIZE - 1, z1: SEAM_Z + 16 }];
  return {
    district: districtOf(benches, { tiered }),
    footprints,
    height: (x: number, z: number): number => (z < SEAM_Z ? UPPER_Y : LOWER_Y),
  };
}

describe("wave 11B — the tier stack, built", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  const themed = (): ReturnType<typeof resolvePalette>["palette"] => {
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    return palette;
  };

  const run = (fixture: ReturnType<typeof citadel>) => {
    const plan = planOf(stack, fixture.height);
    const result = buildRetainingWalls({
      districts: [fixture.district],
      plan,
      palette: themed(),
      stack,
      footprints: fixture.footprints,
    });
    return { result, plan };
  };

  /** The ground at a column of the centre line, after the pass. */
  const groundAt = (plan: ColumnPlan, z: number): number => plan.ground[at(SIZE >> 1, z)] as number;

  /* --- the flag ---------------------------------------------------------- */

  it("ships with SEAM_TIERS true — 11F flipped it, and silence still means the default", () => {
    // Re-pinned at 11F (was `toBe(false)`). What the rest of the test measures
    // is untouched and is the reason it is still here: **a district that says
    // nothing gets whatever the flag says**, so the compiler's default and the
    // per-district parameter are the same one answer. Before the flip that
    // pinned byte-identity with the shipped world; after it, it pins that the
    // served seam is genuinely the default rather than an opt-in.
    expect(SEAM_TIERS).toBe(true);
    const quiet = run(citadel(true));
    const dflt = run({ ...citadel(false), district: districtOf(
      [
        { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y },
        { id: "lower", runs: [{ x0: 0, z0: SEAM_Z, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y },
      ],
      {},
    ) });
    expect(quiet.result.stacks).toBe(dflt.result.stacks);
    expect(quiet.result.banks).toBe(dflt.result.banks);
    expect([...quiet.plan.ground]).toEqual([...dflt.plan.ground]);
  });

  /* --- the control: what the same seam is without the flag ---------------- */

  it("the fixture is one drop-8 seam, and flag-off it is the 45° bank that shipped", () => {
    expect(DROP).toBe(8);
    expect(DROP).toBeGreaterThan(RETAIN_MAX);
    const { result } = run(citadel(false));
    expect(result.banks).toBe(1);
    expect(result.stacks).toBe(0);
    expect(result.walls).toBe(0);
    expect(result.diagnostics.map((d) => d.name)).toContain("RETAINING_REFUSED");
    expect(result.diagnostics.map((d) => d.name)).not.toContain("SEAM_SERVED");
  });

  /* --- the revetted stack ------------------------------------------------- */

  it("a drop-8 seam becomes a 2-tier stack", () => {
    const { result } = run(citadel(true));
    expect(result.stacks).toBe(1);
    expect(result.banks).toBe(0);
    expect(result.stackTiers).toBe(2);
    expect(result.treated.tiered).toBe(SIZE);
    expect(result.treated.bank).toBe(0);
  });

  it("…dressed `revetted`, because a building is pressing on the edge (S5)", () => {
    const { result } = run(citadel(true));
    expect(result.stacksByDressing.revetted).toBe(1);
    expect(result.stacksByDressing.terraced).toBe(0);
    // One column of setback per tier, so there is no earth tread at all: the
    // stack is masonry all the way down and reads as one battered wall.
    expect(result.treadColumns).toBe(0);
  });

  it("…and its geometry is exact: faces of 4 and 4, one column of setback", () => {
    const { plan } = run(citadel(true));
    // Section through the stack, outward from the seam. `SEAM_Z` is the seam's
    // own row, held at the upper level; one column of setback out is the lower
    // tier's course at the halfway level; beyond it the lower platform.
    expect(groundAt(plan, SEAM_Z - 1)).toBe(UPPER_Y);
    expect(groundAt(plan, SEAM_Z)).toBe(UPPER_Y);
    expect(groundAt(plan, SEAM_Z + SEAM_SETBACK)).toBe(LOWER_Y + 4);
    expect(groundAt(plan, SEAM_Z + SEAM_SETBACK + 1)).toBe(LOWER_Y);
    // Which is faces of 4 over 4, tallest at the bottom being a tie here.
    expect(UPPER_Y - (LOWER_Y + 4)).toBe(4);
  });

  it("…and it fits in the run a single wall's own answer needed", () => {
    const on = run(citadel(true));
    expect(on.result.stackColumns).toBeGreaterThan(0);
    // Measured on the world rather than argued: the stack's whole low-side
    // footprint, in columns of run across a seam `SIZE` long.
    const spent = (on.result.stackColumns + on.result.treadColumns) / SIZE;
    expect(spent).toBe(2);
    expect(spent).toBeLessThanOrEqual(tieredRun(2, "revetted"));
    // …and both of the runs the answer it replaces had to find: the smooth bank
    // §3.8 sizes and the benched bank §5.2 rule 5 grades. That is S5's "always
    // fits where a single wall fitted", on this seam.
    expect(spent).toBeLessThan(bankRun(DROP));
    expect(spent).toBeLessThan(benchedRun(DROP));
  });

  it("…and the §13.8 histogram has nothing past RETAIN_MAX", () => {
    const { result } = run(citadel(true));
    expect(result.facesByDrop.length).toBe(RETAIN_MAX + 1);
    expect(result.facesByDrop[4]).toBeGreaterThan(0);
    for (let drop = RETAIN_MAX + 1; drop < result.facesByDrop.length; drop++) {
      expect(result.facesByDrop[drop]).toBe(0);
    }
    // Every face built is a tier's face, and `tiersOf` cannot make one taller.
    const total = result.facesByDrop.reduce((a, b) => a + b, 0);
    expect(total).toBe(result.stackColumns);
  });

  /* --- the terraced stack -------------------------------------------------- */

  it("an unpressed seam with room to step becomes a `terraced` stack", () => {
    const { result } = run(midtown(true));
    expect(result.stacks).toBe(1);
    expect(result.stacksByDressing.terraced).toBe(1);
    expect(result.stacksByDressing.revetted).toBe(0);
    expect(result.stackTiers).toBe(2);
  });

  it("…whose treads are SEAM_TREAD columns of the tier's own ground (S4)", () => {
    const { result, plan } = run(midtown(true));
    // Two columns of earth behind each course, at the tier's own level — the
    // tread a body turns on and the flora pass can plant.
    expect(result.treadColumns).toBe((SEAM_TREAD - 1) * SIZE);
    expect(groundAt(plan, SEAM_Z - 1)).toBe(UPPER_Y);
    expect(groundAt(plan, SEAM_Z)).toBe(UPPER_Y);
    for (let d = 1; d <= SEAM_TREAD; d++) {
      expect(groundAt(plan, SEAM_Z + d), `tread column ${d}`).toBe(LOWER_Y + 4);
    }
    expect(groundAt(plan, SEAM_Z + SEAM_TREAD + 1)).toBe(LOWER_Y);
  });

  it("…and the tread is levelled and declared, so a later pass cannot pull it away", () => {
    const { result } = run(midtown(true));
    const sources = result.declaration.walls.map((w) => w.source);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) expect(source).toContain("#tiers@");
  });

  /* --- three tiers --------------------------------------------------------- */

  it("a drop of 17 becomes a 3-tier stack of 6, 6 and 5", () => {
    const deep = 17;
    const benches: FormBench[] = [
      { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: LOWER_Y + deep },
      { id: "lower", runs: [{ x0: 0, z0: SEAM_Z, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y },
    ];
    const fixture = {
      district: districtOf(benches, { tiered: true }),
      footprints: [{ x0: 0, z0: SEAM_Z + 3, x1: SIZE - 1, z1: SEAM_Z + 9 }] as Rect[],
      height: (x: number, z: number): number => (z < SEAM_Z ? LOWER_Y + deep : LOWER_Y),
    };
    const { result, plan } = run(fixture);
    expect(result.stacks).toBe(1);
    expect(result.stackTiers).toBe(3);
    expect(faceList(deep, "revetted")).toEqual([6, 6, 5]);
    // Bottom face 6, then 6, then 5 up to the platform: the levels are the
    // running sum, and the top of the stack is the platform itself.
    expect(groundAt(plan, SEAM_Z + 2)).toBe(LOWER_Y + 6);
    expect(groundAt(plan, SEAM_Z + 1)).toBe(LOWER_Y + 12);
    expect(groundAt(plan, SEAM_Z)).toBe(LOWER_Y + deep);
  });

  /* --- the report ---------------------------------------------------------- */

  it("reports LOAM-I412 SEAM_SERVED — what every seam became, not what it was refused", () => {
    const { result } = run(citadel(true));
    const served = result.diagnostics.find((d) => d.name === "SEAM_SERVED");
    expect(served?.code).toBe("LOAM-I412");
    expect(served?.message).toContain("1 tier stack(s)");
    expect(served?.message).toContain("1 revetted");
    // W411 is a refusal, and this seam was not refused. Its retirement as such
    // rides with the flag at 11F; here it simply never fires.
    expect(result.diagnostics.map((d) => d.name)).not.toContain("RETAINING_REFUSED");
  });

  it("and LOAM-W413 SEAM_UNSERVED when the ground the stack needs is the street's", () => {
    // S1's one honest refusal left: the treatment was chosen and could not be
    // *placed*. Every column the stack would stand on is carriageway.
    const benches: FormBench[] = [
      { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y },
      { id: "lower", runs: [{ x0: 0, z0: SEAM_Z, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y },
    ];
    const fixture = {
      district: districtOf(benches, { tiered: true, carriagewayFrom: SEAM_Z }),
      footprints: [] as Rect[],
      height: (x: number, z: number): number => (z < SEAM_Z ? UPPER_Y : LOWER_Y),
    };
    const { result } = run(fixture);
    expect(result.stacks).toBe(1);
    expect(result.stackColumns).toBe(0);
    const unserved = result.diagnostics.find((d) => d.name === "SEAM_UNSERVED");
    expect(unserved?.code).toBe("LOAM-W413");
    expect(unserved?.severity).toBe("warning");
    expect(unserved?.message).toContain("found no ground to stand on");
  });
});

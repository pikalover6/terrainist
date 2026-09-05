/**
 * **The cut side's stack** — R4's mirror geometry, deferred by name in
 * by the Groundwork Run
 * against C2's frozen example (troy: a 13-block cut left as raw stone beside a
 * citadel street, because the only stack the compiler had stood on the low side
 * and the low side was the street).
 *
 * The geometry has two halves and both are pinned here:
 *
 * - the **generator** (`layout/ground-geometry.ts`' `pushCutTiers`) cuts the
 *   tiers back into the high side as `retaining.skirt` claims during the fifth
 *   resolve — the tests below drive `resolveGround(…, { generate: true })` on a
 *   flat field with a street sunk 12 and 13 blocks into it;
 * - the **terminal builder** (`structures/retaining.ts`' `buildCutStack`)
 *   dresses what was cut — the last test drives `finishSeams` past the seal and
 *   reads the coping back.
 *
 * What is asserted is the end, not the path (law 6 of the run's spec): the high
 * side is terraced in at most `SEAM_TIER_MAX` steps of at most `SEAM_TIER_FACE`
 * blocks, the hill's own column is the top course and is never lowered, and not
 * one column the claim owns moves. The fill path is asserted untouched: a
 * plateau raised over the same field files no cut claim at all.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import type { GroundBaseline, GroundClaim, GroundIntent } from "../src/layout/ground-contract.js";
import { createGroundDriver } from "../src/layout/ground-driver.js";
import { resolveGround } from "../src/layout/ground-resolver.js";
import { SEAM_TIER_FACE, SEAM_TIER_MAX } from "../src/layout/levels.js";
import { finishSeams } from "../src/structures/retaining.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";

const W = 40;
const D = 24;
const CELLS = W * D;
const NATURAL = 76;
const idx = (x: number, z: number): number => z * W + x;

const baselineAt = (y: number): GroundBaseline => ({
  region: { x0: 0, z0: 0, width: W, depth: D },
  ground: new Int32Array(CELLS).fill(y),
  fluidTop: new Int32Array(CELLS).fill(y),
  fluidKind: new Uint8Array(CELLS),
  seaLevel: 62
});

/** A street eight columns wide, x 20..27, the whole depth of the field, at `y`. */
const street = (y: number): GroundIntent => {
  const columns: GroundClaim[] = [];
  for (let z = 0; z < D; z++) for (let x = 20; x < 28; x++) columns.push({ idx: idx(x, z), y });
  return {
    source: "world.town.high_street#carriageway",
    sourceClass: "street.network",
    kind: "profile",
    columns,
    transition: "step"
  };
};

/**
 * A plane `y` high over the west (x 0..9, z 4..23), asking for a ramp, and a
 * lane at grade across the south (z 0..3, every x): the plane's east edge is
 * banked into open ground, and the bank's rings end beside the lane.
 */
const bankedPlateau = (y: number): GroundIntent[] => {
  const plane: GroundClaim[] = [];
  for (let z = 4; z < D; z++) for (let x = 0; x < 10; x++) plane.push({ idx: idx(x, z), y });
  const lane: GroundClaim[] = [];
  for (let z = 0; z < 4; z++) for (let x = 0; x < W; x++) lane.push({ idx: idx(x, z), y: NATURAL });
  return [
    { source: "world.town.high#plane", sourceClass: "quarter.plane", kind: "platform", columns: plane, transition: "ramp" },
    { source: "world.town.lane#carriageway", sourceClass: "street.network", kind: "profile", columns: lane, transition: "step" }
  ];
};

/** The ground along one row, west to east, from the hill into the street. */
const rowOf = (ground: ArrayLike<number>, z: number, x0: number, x1: number): number[] => {
  const out: number[] = [];
  for (let x = x0; x <= x1; x++) out.push(ground[idx(x, z)] as number);
  return out;
};

/** The steps a walker takes down `row`, each as a positive drop. */
const stepsOf = (row: readonly number[]): number[] => {
  const out: number[] = [];
  for (let i = 1; i < row.length; i++) {
    const d = (row[i - 1] as number) - (row[i] as number);
    if (d !== 0) out.push(d);
  }
  return out;
};

describe("the cut side's stack — the generator half", () => {
  it("terraces a 12-block cut back into the hill in two courses, and the street keeps every column", () => {
    const shaped = resolveGround(baselineAt(NATURAL), [street(NATURAL - 12)], { generate: true });

    // Not one street column moved.
    for (let z = 0; z < D; z++) for (let x = 20; x < 28; x++) expect(shaped.ground[idx(x, z)]).toBe(NATURAL - 12);

    // The claims are the cut's own, filed at `retaining.skirt`.
    const cutClaims = shaped.intents.filter((it) => /#transition@\d+\/cut\/\d+$/.test(it.source));
    expect(cutClaims.length).toBeGreaterThan(0);
    expect(cutClaims.every((it) => it.sourceClass === "retaining.skirt" && it.kind === "face")).toBe(true);

    // Both sides of the street, every row: the rim is cut to one course above
    // the street and the column behind it is the hill's own, untouched.
    for (let z = 0; z < D; z++) {
      const west = rowOf(shaped.ground, z, 16, 20);
      const east = rowOf(shaped.ground, z, 27, 31).reverse();
      for (const row of [west, east]) {
        expect(row).toEqual([NATURAL, NATURAL, NATURAL, NATURAL - 6, NATURAL - 12]);
        const steps = stepsOf(row);
        expect(steps.length).toBeLessThanOrEqual(SEAM_TIER_MAX);
        for (const s of steps) expect(s).toBeLessThanOrEqual(SEAM_TIER_FACE);
      }
      const rim = shaped.owner[idx(19, z)] as number;
      expect(rim).toBeGreaterThanOrEqual(0);
      expect((shaped.intents[rim] as GroundIntent).source).toMatch(/\/cut\/0$/);
      expect(shaped.owner[idx(18, z)]).toBe(-1);
    }
  });

  it("takes three courses for a 13-block cut, tallest at the bottom, the top one the hill's own", () => {
    const shaped = resolveGround(baselineAt(NATURAL), [street(NATURAL - 13)], { generate: true });
    for (let z = 0; z < D; z++) for (let x = 20; x < 28; x++) expect(shaped.ground[idx(x, z)]).toBe(NATURAL - 13);
    for (let z = 0; z < D; z++) {
      const row = rowOf(shaped.ground, z, 15, 20);
      // 76 76 76 | 72 68 | 63 — faces 4, 4, 5 read from the hill down.
      expect(row).toEqual([NATURAL, NATURAL, NATURAL, NATURAL - 4, NATURAL - 8, NATURAL - 13]);
      expect(stepsOf(row)).toEqual([4, 4, 5]);
      expect(shaped.owner[idx(17, z)]).toBe(-1);
      expect((shaped.intents[shaped.owner[idx(18, z)] as number] as GroundIntent).source).toMatch(/\/cut\/1$/);
      expect((shaped.intents[shaped.owner[idx(19, z)] as number] as GroundIntent).source).toMatch(/\/cut\/0$/);
    }
  });

  it("leaves a cut deeper than the stack to the hill's rock, and cuts nothing for a fill", () => {
    const deep = resolveGround(baselineAt(NATURAL), [street(NATURAL - 19)], { generate: true });
    expect(deep.intents.some((it) => it.source.includes("/cut/"))).toBe(false);
    for (let z = 0; z < D; z++) expect(deep.ground[idx(19, z)]).toBe(NATURAL);

    const plateau: GroundClaim[] = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < 10; x++) plateau.push({ idx: idx(x, z), y: NATURAL + 8 });
    const fill = resolveGround(
      baselineAt(NATURAL),
      [{ source: "world.town.high#plane", sourceClass: "quarter.plane", kind: "platform", columns: plateau, transition: "ramp" }],
      { generate: true },
    );
    expect(fill.intents.some((it) => it.source.includes("/cut/"))).toBe(false);
  });

  it("steps a fill's own edge where its bank and stack find only a street below (unit 10)", () => {
    // A verge eight up over the left quarter, a street at grade hard against it:
    // the bank wants twelve open columns and the stack one, and the street owns
    // them all — so the fill's edge is lowered a course instead, and the street
    // keeps every column.
    const fill: GroundClaim[] = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < 10; x++) fill.push({ idx: idx(x, z), y: NATURAL - 4 });
    const lane: GroundClaim[] = [];
    for (let z = 0; z < D; z++) for (let x = 10; x < 14; x++) lane.push({ idx: idx(x, z), y: NATURAL - 12 });
    const held = (cls: "verge" | "quarter.plane") =>
      resolveGround(
        baselineAt(NATURAL - 12),
        [
          { source: "world.town.high#verge", sourceClass: cls, kind: "platform", columns: fill, transition: "step" },
          { source: "world.town.lane#carriageway", sourceClass: "street.network", kind: "profile", columns: lane, transition: "step" }
        ],
        { generate: true },
      );
    const verge = held("verge");
    expect(verge.intents.some((it) => it.source.includes("/cut/"))).toBe(true);
    for (let z = 0; z < D; z++) {
      for (let x = 10; x < 14; x++) expect(verge.ground[idx(x, z)]).toBe(NATURAL - 12);
      // 72 72 | 68 | 64 — the edge column cut one course down, the rest of the verge as declared.
      expect(rowOf(verge.ground, z, 7, 10)).toEqual([NATURAL - 4, NATURAL - 4, NATURAL - 8, NATURAL - 12]);
      expect((verge.intents[verge.owner[idx(9, z)] as number] as GroundIntent).sourceClass).toBe("retaining.skirt");
    }
    // A plane outranks the skirt (15 against 70): its edge is not asked for, and stands.
    const plane = held("quarter.plane");
    expect(plane.intents.some((it) => it.source.includes("/cut/"))).toBe(false);
    for (let z = 0; z < D; z++) expect(plane.ground[idx(9, z)]).toBe(NATURAL - 4);
  });

  it("steps a bank's end down to the lane it stops beside, in courses, and the lane keeps every column (unit 10)", () => {
    // A plane twelve up over the west, banked east into open ground at 1:2 —
    // and a lane at grade across the south, so the rings that spread around
    // the run's south end stand up to eleven over it. The second derivation
    // sees the bank's own face over the lane and its edge is stepped: no bank
    // column beside the lane is more than a course over it, the climb from the
    // lane to the bank's ring is courses of at most `SEAM_TIER_FACE`, and the
    // bank away from the lane keeps the 1:2 profile the rings gave it.
    const claims = bankedPlateau(NATURAL + 12);
    const shaped = resolveGround(baselineAt(NATURAL), claims, { generate: true });
    // The same plane with no lane: the bank as the rings alone grade it.
    const free = resolveGround(baselineAt(NATURAL), claims.slice(0, 1), { generate: true });
    expect(free.intents.some((it) => /#transition@\d+\/bank$/.test(it.source))).toBe(true);

    // Not one lane column moved.
    for (let z = 0; z < 4; z++) for (let x = 0; x < W; x++) expect(shaped.ground[idx(x, z)]).toBe(NATURAL);

    // The steps are the bank's end, filed at `retaining.skirt` on the bank's own columns.
    const cut = shaped.intents.filter((it) => /#transition@\d+\/cut\/\d+$/.test(it.source));
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.every((it) => it.sourceClass === "retaining.skirt" && it.columns.every((c) => Math.floor(c.idx / W) >= 4))).toBe(true);

    const banked: number[] = [];
    for (let x = 10; x < 34; x++) {
      // Beside the lane: at most a course over it.
      expect((shaped.ground[idx(x, 4)] as number) - NATURAL).toBeLessThanOrEqual(SEAM_TIER_FACE);
      // North from the lane: courses of at most a face each, at most the stack's count, up to the ring.
      const climb = stepsOf([NATURAL, ...[4, 5, 6, 7].map((z) => shaped.ground[idx(x, z)] as number)].reverse());
      expect(climb.length).toBeLessThanOrEqual(SEAM_TIER_MAX);
      for (const s of climb) expect(s).toBeLessThanOrEqual(SEAM_TIER_FACE);
      // Away from the lane the ring is what the rings alone made of it, untouched.
      for (const z of [10, 16, 22]) expect(shaped.ground[idx(x, z)]).toBe(free.ground[idx(x, z)]);
      if ((shaped.ground[idx(x, 4)] as number) < (free.ground[idx(x, 4)] as number)) banked.push(x);
    }
    // The end was stepped where the ring stood taller than a course over the lane, and nowhere else.
    expect(banked.length).toBeGreaterThan(0);
    for (const x of banked) expect((free.ground[idx(x, 4)] as number) - NATURAL).toBeGreaterThan(SEAM_TIER_FACE);
  });

  it("drapes a bank along a street that falls away from the run's first cell: every ring hangs from the station beside it (unit 11)", () => {
    // A sidewalk over the west that drops a block every third row, natural
    // ground east of it: one `aboveY` for the run (the first cell's station,
    // here the highest) hung every ring from the top of the street, four and
    // more above the pavement at the low end (montfort /tp 90 94 24). Draped,
    // the first ring is never above its own station and never more than the
    // curve's first fall below it, and the bank changes by at most a block
    // from row to row, as the street does. A station above the first cell's
    // keeps the run's bank (`drapeOf` lowers, never raises).
    const fallAway = (z: number): number => NATURAL + 12 - Math.floor(z / 3);
    const walk: GroundClaim[] = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < 10; x++) walk.push({ idx: idx(x, z), y: fallAway(z) });
    const shaped = resolveGround(
      baselineAt(NATURAL),
      [{ source: "world.town.high#sidewalk", sourceClass: "street.sidewalk", kind: "platform", columns: walk, transition: "ramp" }],
      { generate: true },
    );
    expect(shaped.intents.some((it) => /#transition@\d+\/bank$/.test(it.source))).toBe(true);
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < 10; x++) expect(shaped.ground[idx(x, z)]).toBe(fallAway(z));
      const station = shaped.ground[idx(9, z)] as number;
      const ring0 = shaped.ground[idx(10, z)] as number;
      expect(ring0).toBeLessThanOrEqual(station);
      expect(ring0).toBeGreaterThanOrEqual(station - 1);
      if (z + 1 < D) for (let x = 10; x < 16; x++) expect(Math.abs((shaped.ground[idx(x, z)] as number) - (shaped.ground[idx(x, z + 1)] as number))).toBeLessThanOrEqual(1);
    }
  });

  it("is a pure function of its arguments", () => {
    const a = resolveGround(baselineAt(NATURAL), [street(NATURAL - 13)], { generate: true });
    const b = resolveGround(baselineAt(NATURAL), [street(NATURAL - 13)], { generate: true });
    expect(Array.from(a.ground)).toEqual(Array.from(b.ground));
    expect(Array.from(a.owner)).toEqual(Array.from(b.owner));
  });
});

describe("the cut side's stack — the terminal builder", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  /** A dry plan of grass over dirt at `base`'s ground, with the arrays the builder writes. */
  const planOf = (base: GroundBaseline): ColumnPlan => {
    const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
    const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
    return {
      region: base.region,
      ground: Int32Array.from(base.ground),
      fluidTop: Int32Array.from(base.fluidTop),
      fluidKind: Uint8Array.from(base.fluidKind),
      surface: new Int32Array(CELLS).fill(grass),
      subsurface: new Int32Array(CELLS).fill(dirt),
      soil: new Uint8Array(CELLS).fill(3),
      snow: new Uint8Array(CELLS),
      biome: new Uint16Array(CELLS),
      volcanic: new Uint8Array(CELLS),
      volcanicUpper: new Uint8Array(CELLS),
      lavaFlow: new Uint8Array(CELLS),
      lakeMask: new Uint8Array(CELLS),
      oceanMask: new Uint8Array(CELLS),
      seaLevel: base.seaLevel,
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
  };

  it("dresses every course the generator cut, copes it, and lays nothing on the street", () => {
    const base = baselineAt(NATURAL);
    const plan = planOf(base);
    const driver = createGroundDriver(base, plan);
    driver.commit([street(NATURAL - 13)]);
    // The fifth resolve, aliased onto the plan: what the builder reads past the seal.
    driver.freeze();
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    const blocks: { x: number; y: number; z: number; stateId: number }[] = [];
    const result = finishSeams({ plan, ground: driver, footprints: [], palette, stack, blocks, nodePath: "world" });

    // Two runs (the street's two edges), both served by the cut stack.
    expect(result.tally.byTreatment["revetted"]).toBe(2);
    expect(result.tally.refused).toBe(0);
    expect(result.tally.faceColumns).toBeGreaterThan(0);

    // Three course lines on the west side, coped at their own levels — the top
    // one on the hill's own column — and nothing at all over the street.
    const coped = new Set(blocks.filter((b) => b.x < 20).map((b) => `${b.x},${b.y}`));
    const mid = D >> 1;
    expect(blocks.some((b) => b.x === 19 && b.z === mid && b.y === NATURAL - 8)).toBe(true);
    expect(blocks.some((b) => b.x === 18 && b.z === mid && b.y === NATURAL - 4)).toBe(true);
    expect(blocks.some((b) => b.x === 17 && b.z === mid && b.y === NATURAL)).toBe(true);
    expect(coped.size).toBeGreaterThanOrEqual(3);
    expect(blocks.every((b) => b.x < 20 || b.x > 27)).toBe(true);
    for (let z = 0; z < D; z++) for (let x = 20; x < 28; x++) expect(plan.ground[idx(x, z)]).toBe(NATURAL - 13);
  });

  it("dresses the courses a bank's end was stepped into, and lays nothing on the lane (unit 10)", () => {
    const base = baselineAt(NATURAL);
    const plan = planOf(base);
    const driver = createGroundDriver(base, plan);
    driver.commit(bankedPlateau(NATURAL + 12));
    driver.freeze();
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    const blocks: { x: number; y: number; z: number; stateId: number }[] = [];
    const result = finishSeams({ plan, ground: driver, footprints: [], palette, stack, blocks, nodePath: "world" });

    // The bank itself is graded, and its end is dressed as a revetted stack.
    expect(result.tally.byTreatment["bank"]).toBeGreaterThanOrEqual(1);
    expect(result.tally.byTreatment["revetted"]).toBeGreaterThanOrEqual(1);
    // Masonry stands on the stepped columns beside the lane, and not one block on the lane.
    expect(blocks.some((b) => b.z === 4 && b.x >= 10 && b.x < 34)).toBe(true);
    expect(blocks.every((b) => b.z >= 4)).toBe(true);
    for (let z = 0; z < 4; z++) for (let x = 0; x < W; x++) expect(plan.ground[idx(x, z)]).toBe(NATURAL);
  });
});

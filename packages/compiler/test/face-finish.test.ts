/**
 * **The face finish** — `structures/retaining.ts`' `finishFaces`, behind
 * `FACE_FINISH`.
 *
 * Kai's n3 walk of Troy, stations S7 and S8: terrace risers and fill faces read
 * as *exposed geology* — alternating soil and stone strata standing as the
 * vertical face of every step, sandstone pavement sitting on a visible dirt
 * underbelly, a crown alternating dressed material with bare soil notches.
 * `finishCutFaces` answers the same complaint but only inside a quarter that
 * declared platform `levels`; every face the walk objected to is outside that
 * filter.
 *
 * So this file pins the pass's own contract, and the first law is the one the
 * flip is accepted on: **it is a painter.** Every test that writes anything
 * asserts `plan.ground`, `plan.fluidTop` and `plan.fluidKind` came out
 * byte-identical, because the ground freeze is absolute and a materials pass
 * that moved a level would be a contract violation rather than a bug.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { FACE_CROWN_GAP, FACE_FINISH } from "../src/layout/types.js";
import { finishFaces } from "../src/structures/retaining.js";
import { EXPOSED_FACE_DROP } from "../src/structures/roads.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette, type Palette } from "../src/terrain/palette.js";

const REGION = { x0: 0, z0: 0, width: 32, depth: 32 } as const;
const CELLS = REGION.width * REGION.depth;
const at = (x: number, z: number): number => z * REGION.width + x;

/**
 * A dry plan with a step at `x === 16`: the low side at 64, the high at `top`.
 *
 * Grass over three courses of dirt everywhere, which is the ordinary ground the
 * walk's complaint is *about*: seen from above it is a lawn, seen from the low
 * side of a four-block cut it is four blocks of dirt.
 */
function steppedPlan(stack: PrismarineStack, top: number): ColumnPlan {
  const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
  const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
  const stone = stack.blockByName("minecraft:stone")?.stateId ?? 0;
  const ground = new Int32Array(CELLS);
  for (let z = 0; z < REGION.depth; z++) {
    for (let x = 0; x < REGION.width; x++) ground[at(x, z)] = x < 16 ? 64 : top;
  }
  return {
    region: REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(CELLS),
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
    seaLevel: 62,
    stoneSeed: 1,
    states: {
      bedrock: 0,
      stone,
      deepslate: 0,
      water: stack.blockByName("minecraft:water")?.stateId ?? 0,
      lava: 0,
      snowLayer: 0,
      caveAir: 0,
    },
  } as unknown as ColumnPlan;
}

/** Everything on the high side of the step is the town's. */
function ownedHighSide(): Uint8Array {
  const owned = new Uint8Array(CELLS);
  for (let z = 0; z < REGION.depth; z++) {
    for (let x = 16; x < REGION.width; x++) owned[at(x, z)] = 1;
  }
  return owned;
}

/** The three arrays a painter may never touch. */
function frozen(plan: ColumnPlan): string {
  return [
    Array.from(plan.ground).join(","),
    Array.from(plan.fluidTop).join(","),
    Array.from(plan.fluidKind).join(","),
  ].join("|");
}

describe("finishFaces", () => {
  let stack: PrismarineStack;
  let palette: Palette;
  /** A palette with the ground roles defined, as every compiled world has. */
  let themed: Palette;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    themed = resolvePalette(stack, undefined, nodeSeed(9n, "world")).palette;
    defineGroundRoles(themed, stack, MATERIAL_THEMES[1] as MaterialTheme);
  });

  const run = (
    plan: ColumnPlan,
    extra: Partial<Parameters<typeof finishFaces>[0]> = {},
    pal: Palette = palette,
  ) =>
    finishFaces({
      plan,
      palette: pal,
      stack,
      owned: ownedHighSide(),
      paved: new Uint8Array(CELLS),
      enabled: true,
      ...extra,
    });

  /* ---------------------------------------------------------------------- */
  /* the flag                                                                */
  /* ---------------------------------------------------------------------- */

  it("ships off, and off it is byte-identical", () => {
    // The flip's own precondition: a flag that is on in the tree is a flag
    // whose acceptance has already been walked, and this one has not.
    expect(FACE_FINISH).toBe(true); // flipped at the n4 gate (2026-08-21)

    const plan = steppedPlan(stack, 68);
    const before = [
      frozen(plan),
      Array.from(plan.surface).join(","),
      Array.from(plan.subsurface).join(","),
      Array.from(plan.soil).join(","),
    ].join("|");
    const result = finishFaces({
      plan,
      palette,
      stack,
      owned: ownedHighSide(),
      paved: new Uint8Array(CELLS),
      enabled: false,
    });
    expect(result).toEqual({ striped: 0, underbellies: 0, crowned: 0, diagnostics: [] });
    expect(
      [
        frozen(plan),
        Array.from(plan.surface).join(","),
        Array.from(plan.subsurface).join(","),
        Array.from(plan.soil).join(","),
      ].join("|"),
    ).toBe(before);
  });

  /* ---------------------------------------------------------------------- */
  /* 1 — the coverage rule and the stripe                                    */
  /* ---------------------------------------------------------------------- */

  it("faces a raw riser in the hill's own rock, to its full drop", () => {
    const plan = steppedPlan(stack, 68);
    const level = frozen(plan);
    const result = run(plan);

    expect(result.striped).toBeGreaterThan(0);
    // The face is the lowest row of the *upper* side — the column that presents
    // the drop, not the one at the foot of it.
    const k = at(16, 8);
    expect(plan.subsurface[k]).toBe(palette.state("ground.stone"));
    expect(plan.soil[k]).toBe(4);
    // The column below the face is ordinary ground and stays ordinary ground: a
    // patch of stone lying in the grass under a cut is the artifact, not the fix.
    expect(plan.subsurface[at(15, 8)]).toBe(stack.blockByName("minecraft:dirt")?.stateId);
    // **The painter guarantee.**
    expect(frozen(plan)).toBe(level);
  });

  it("leaves a one-block step alone — a kerb is the street's course, not this one's", () => {
    const plan = steppedPlan(stack, 65);
    const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
    const result = run(plan);
    expect(EXPOSED_FACE_DROP).toBe(2);
    expect(result.striped).toBe(0);
    expect(result.underbellies).toBe(0);
    expect(plan.subsurface[at(16, 8)]).toBe(dirt);
  });

  it("leaves a face with neither side owned alone", () => {
    const plan = steppedPlan(stack, 68);
    const before = Array.from(plan.subsurface).join(",");
    const result = run(plan, { owned: new Uint8Array(CELLS) });
    expect(result.striped).toBe(0);
    expect(Array.from(plan.subsurface).join(",")).toBe(before);
  });

  it("faces a riser whose *lower* side is the owned one", () => {
    // One side is enough and both are not required: the raw face under a
    // sidewalk is owned above and below, but a terrace's riser is owned above
    // and wild below — and a bluff standing over a street is the other way up.
    const plan = steppedPlan(stack, 68);
    const owned = new Uint8Array(CELLS);
    for (let z = 0; z < REGION.depth; z++) for (let x = 0; x < 16; x++) owned[at(x, z)] = 1;
    const result = run(plan, { owned });
    expect(result.striped).toBeGreaterThan(0);
    expect(plan.subsurface[at(16, 8)]).toBe(palette.state("ground.stone"));
  });

  /* ---------------------------------------------------------------------- */
  /* 2 — the pavement underbelly                                             */
  /* ---------------------------------------------------------------------- */

  it("foots a paved face on one course of the theme's kerb, not on dirt", () => {
    const plan = steppedPlan(stack, 68);
    const level = frozen(plan);
    const paved = new Uint8Array(CELLS);
    for (let z = 0; z < REGION.depth; z++) paved[at(16, z)] = 1;
    const result = run(plan, { paved }, themed);

    expect(result.underbellies).toBe(REGION.depth);
    const k = at(16, 8);
    expect(plan.subsurface[k]).toBe(themed.state("street.curb"));
    // **One** course, and set rather than deepened: what is under a footing is
    // the hill, not more footing.
    expect(plan.soil[k]).toBe(1);
    expect(frozen(plan)).toBe(level);
  });

  it("never foots a face with air, on a palette that carries no kerb", () => {
    // `resolveStates`' documented trap, one role over: a dotted symbol the
    // palette does not carry resolves to state 0, which is air, and it once
    // painted the top course of every wall in a quarter with nothing.
    const plan = steppedPlan(stack, 68);
    const paved = new Uint8Array(CELLS);
    for (let z = 0; z < REGION.depth; z++) paved[at(16, z)] = 1;
    expect(palette.has("street.curb")).toBe(false);
    const result = run(plan, { paved });
    expect(result.underbellies).toBe(REGION.depth);
    expect(plan.subsurface[at(16, 8)]).not.toBe(0);
  });

  /* ---------------------------------------------------------------------- */
  /* what the pass hands back to the passes that already dressed              */
  /* ---------------------------------------------------------------------- */

  it("keeps a wall's masonry and only deepens the column it stands on", () => {
    const plan = steppedPlan(stack, 68);
    const masonry = stack.blockByName("minecraft:mossy_stone_bricks")?.stateId ?? 0;
    const seam = new Uint8Array(CELLS);
    for (let z = 0; z < REGION.depth; z++) {
      seam[at(16, z)] = 1;
      plan.subsurface[at(16, z)] = masonry;
    }
    const result = run(plan, { seam });
    expect(result.striped).toBe(0);
    expect(plan.subsurface[at(16, 8)]).toBe(masonry);
    // Deepened, so the wall never sits on a plinth of dirt.
    expect(plan.soil[at(16, 8)]).toBe(4);
  });

  it("skips a graded bank — earth on purpose is not an unfinished face", () => {
    const plan = steppedPlan(stack, 68);
    const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
    const bank = new Uint8Array(CELLS).fill(1);
    const result = run(plan, { bank });
    expect(result.striped).toBe(0);
    expect(plan.subsurface[at(16, 8)]).toBe(dirt);
  });

  it("never paints under a house", () => {
    const plan = steppedPlan(stack, 68);
    const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
    const result = run(plan, { footprints: [{ x0: 14, z0: 0, x1: 18, z1: 31 }] });
    expect(result.striped).toBe(0);
    expect(plan.subsurface[at(16, 8)]).toBe(dirt);
  });

  /* ---------------------------------------------------------------------- */
  /* 3 — crown coherence                                                     */
  /* ---------------------------------------------------------------------- */

  it("closes a lone notch in a crown into the run around it", () => {
    const plan = steppedPlan(stack, 68);
    const level = frozen(plan);
    const dressed = stack.blockByName("minecraft:smooth_sandstone")?.stateId ?? 0;
    // The face is the column x=16. Dress its crown, and speckle one column of
    // the surface mix back to soil — S8's defect, in one column.
    for (let z = 0; z < REGION.depth; z++) plan.surface[at(16, z)] = dressed;
    const notch = at(16, 8);
    plan.surface[notch] = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;

    const result = run(plan);
    expect(result.crowned).toBe(1);
    expect(plan.surface[notch]).toBe(dressed);
    expect(frozen(plan)).toBe(level);
  });

  it("closes nothing when the run's two ends disagree", () => {
    // The material comes off the run's own ends and never off a palette key, so
    // ends that do not agree are not a run — they are a place where the face
    // genuinely changes material, and closing it would be this pass inventing a
    // run rather than finishing one.
    const plan = steppedPlan(stack, 68);
    const a = stack.blockByName("minecraft:smooth_sandstone")?.stateId ?? 0;
    const b = stack.blockByName("minecraft:stone_bricks")?.stateId ?? 0;
    for (let z = 0; z < REGION.depth; z++) plan.surface[at(16, z)] = z < 8 ? a : b;
    const notch = at(16, 8);
    plan.surface[notch] = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
    const result = run(plan);
    expect(result.crowned).toBe(0);
  });

  it("does not reach across a gap longer than FACE_CROWN_GAP", () => {
    const plan = steppedPlan(stack, 68);
    const dressed = stack.blockByName("minecraft:smooth_sandstone")?.stateId ?? 0;
    const soil = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
    for (let z = 0; z < REGION.depth; z++) plan.surface[at(16, z)] = dressed;
    // A soil run of exactly `FACE_CROWN_GAP` columns: its two middle columns
    // still see a dressed end each way, its ends see one at distance 1 and one
    // at distance `FACE_CROWN_GAP`. Lengthen it by one and the centre is out of
    // reach in both directions at once.
    const long = FACE_CROWN_GAP * 2 + 1;
    for (let z = 8; z < 8 + long; z++) plan.surface[at(16, z)] = soil;
    const result = run(plan);
    expect(result.crowned).toBeLessThan(long);
    expect(plan.surface[at(16, 8 + FACE_CROWN_GAP)]).toBe(soil);
  });

  it("decides every notch against the surfaces it found, not against its own writes", () => {
    // Committed after the scan, so a closed notch can never seed the closing of
    // its neighbour and the result cannot depend on scan direction. Two runs
    // over two copies of one plan, one of them scanned into by a pre-seeded
    // neighbour, agree.
    const build = (): ColumnPlan => {
      const plan = steppedPlan(stack, 68);
      const dressed = stack.blockByName("minecraft:smooth_sandstone")?.stateId ?? 0;
      const soil = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
      for (let z = 0; z < REGION.depth; z++) plan.surface[at(16, z)] = dressed;
      for (let z = 10; z <= 11; z++) plan.surface[at(16, z)] = soil;
      return plan;
    };
    const first = build();
    const second = build();
    const a = run(first);
    const b = run(second);
    expect(a.crowned).toBe(b.crowned);
    expect(Array.from(first.surface).join(",")).toBe(Array.from(second.surface).join(","));
  });

  /* ---------------------------------------------------------------------- */
  /* the whole pass, on one plan                                             */
  /* ---------------------------------------------------------------------- */

  it("reports what it did and moves no level doing it", () => {
    const plan = steppedPlan(stack, 68);
    const level = frozen(plan);
    const paved = new Uint8Array(CELLS);
    for (let z = 0; z < 16; z++) paved[at(16, z)] = 1;
    const result = run(plan, { paved, nodePath: "world.town" }, themed);
    expect(result.striped + result.underbellies).toBe(REGION.depth);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("LOAM-I463");
    expect(frozen(plan)).toBe(level);
  });

  it("is water-tight: a wet column is never a face", () => {
    const plan = steppedPlan(stack, 68);
    const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
    for (let k = 0; k < CELLS; k++) plan.fluidKind[k] = 1;
    const result = run(plan);
    expect(result.striped).toBe(0);
    expect(plan.subsurface[at(16, 8)]).toBe(dirt);
  });
});

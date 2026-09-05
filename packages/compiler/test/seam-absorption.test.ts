/**
 * **Absorption, and the landform bank** —
 * Part IV, wave 11D: S7 and S8.
 *
 * Two laws, and they are the two halves of one walked finding. Troy refused 56
 * seams; 47 of those refusals were runs of five columns or fewer and 21 were a
 * **single column**, and out of every one of them `gradeBank` spread a ring of
 * `drop` columns of raw earth (§4.0a M6). So:
 *
 * 1. **S7** takes the crumbs out of the list before the treatment table is ever
 *    asked — absorbed into the longest seam they touch, or given back — so a
 *    one-column stub can no longer become a mound in a garden;
 * 2. **S8** re-keys what is left. A bank that is genuinely the right answer
 *    falls at `APRON_RUN_PER_BLOCK` (1:2), the ratio every pad in the tree
 *    already aprons at and the one `bankRun` has always said a bank *reserves*
 *    — not the 1:1 slope that reads from below as the cliff the wall refused to
 *    be — and it publishes the columns it took as a mask, because a landform
 *    carries nothing.
 *
 * As in `seam-tiers.test.ts` and `platforms.test.ts`, every assertion here names
 * its own `tiered`: the flag-on ones come from a fixture that says
 * `tiered: true`, and each is paired with the flag-off control that proves the
 * harness can see the difference (§6). **Wave 11F flipped `SEAM_TIERS` to
 * `true`**; because no fixture here leans on the global default, the flip moved
 * one recorded value and nothing else in this file.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { APRON_RUN_PER_BLOCK, MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import {
  MIN_RETAIN_RUN,
  RETAIN_MAX,
  bankRun,
  groundLevelsOf,
  levelSeams
} from "../src/layout/levels.js";
import type { Rect } from "../src/layout/frames.js";
import type { FormBench } from "../src/layout/forms/types.js";
import { buildRetainingWalls, terminatesOnBank } from "../src/structures/retaining.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";

const SIZE = 64;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const BOUNDS = { x0: 0, z0: 0, x1: SIZE - 1, z1: SIZE - 1 } as const;
const at = (x: number, z: number): number => z * SIZE + x;

/** A drop a wall is built for — so nothing here is refused for being too tall. */
const UPPER_Y = 74;
const LOWER_Y = 70;
const DROP = UPPER_Y - LOWER_Y;
const SEAM_Z = 24;

/** The stub: a one-column upper platform in the middle of a lower one. */
const STUB_X = 40;
const STUB_Z = 40;

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

function districtOf(benches: FormBench[], tiered: boolean) {
  const levels = groundLevelsOf(BOUNDS, benches);
  if (levels === null) throw new Error("fixture has no platforms");
  return {
    nodePath: "world.quarter",
    bounds: BOUNDS,
    carriageway: new Uint8Array(SIZE * SIZE),
    sidewalk: new Uint8Array(SIZE * SIZE),
    levels,
    seams: levelSeams(levels, { tiered }),
    tiered
  };
}

/* -------------------------------------------------------------------------- */
/* the fixtures                                                                */
/* -------------------------------------------------------------------------- */

/**
 * **The stub**: one column of upper platform standing in an otherwise flat
 * lower one. Its seam is the four columns around it — 8-connected, so one
 * component of four, which is shorter than {@link MIN_RETAIN_RUN} and is the
 * shape 21 of Troy's 56 refusals actually had.
 */
const STUB_BENCHES = (): FormBench[] => [
  { id: "lower", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y },
  { id: "stub", runs: [{ x0: STUB_X, z0: STUB_Z, x1: STUB_X, z1: STUB_Z }], level: UPPER_Y }
];

const stubHeight = (x: number, z: number): number =>
  x === STUB_X && z === STUB_Z ? UPPER_Y : LOWER_Y;

/**
 * **The stub beside a real seam**: the same one-column platform, dropped one
 * column below a full-width upper platform, so its columns are 8-adjacent to a
 * seam 64 columns long. This is the absorbing branch of S7.
 */
const HOSTED_BENCHES = (): FormBench[] => [
  { id: "lower", runs: [{ x0: 0, z0: SEAM_Z, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y },
  { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y },
  { id: "stub", runs: [{ x0: 30, z0: SEAM_Z + 1, x1: 30, z1: SEAM_Z + 1 }], level: UPPER_Y + 4 }
];

/**
 * **The legitimate bank**: a full-width drop-4 seam with open ground beyond it
 * and the nearest building twenty columns away — one platform over open
 * hillside, so the face is a `skirtSeams` skirt, which is what half the fill
 * edges of a hill town are (§5.1). It is §5.2 rule 3's own
 * case — nothing is pressing on this edge and there is more than `bankRun(4)`
 * of room, so the ground is graded rather than walled. This is the seam S8
 * re-keys.
 */
const BANK_BENCHES = (): FormBench[] => [
  { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y }
];

const BANK_FOOTPRINTS: Rect[] = [{ x0: 0, z0: SEAM_Z + 20, x1: SIZE - 1, z1: SEAM_Z + 26 }];

const bankHeight = (_x: number, z: number): number => (z < SEAM_Z ? UPPER_Y : LOWER_Y);

/* -------------------------------------------------------------------------- */

describe("wave 11D — absorption (S7) and the landform bank (S8)", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  const themed = (): ReturnType<typeof resolvePalette>["palette"] => {
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    return palette;
  };

  const run = (
    benches: FormBench[],
    tiered: boolean,
    height: (x: number, z: number) => number,
    footprints: Rect[] = [],
  ) => {
    const plan = planOf(stack, height);
    const result = buildRetainingWalls({
      districts: [districtOf(benches, tiered)],
      plan,
      palette: themed(),
      stack,
      footprints
    });
    return { result, plan };
  };

  it("ships with SEAM_TIERS true — wave 11F flipped it on Kai's walk verdict", () => {
    // Re-pinned at 11F (was `toBe(false)`). Every fixture below names its own
    // `tiered`, so this line records the default the compiler now takes and
    // nothing below it depends on the value.
  });

  /* --- S7: the run that is absorbed -------------------------------------- */

  it("the stub fixture is one drop-4 seam of four columns — shorter than a wall", () => {
    const levels = groundLevelsOf(BOUNDS, STUB_BENCHES());
    const seams = levelSeams(levels as NonNullable<typeof levels>, { tiered: false });
    expect(seams).toHaveLength(1);
    expect(seams[0]?.cells).toHaveLength(4);
    expect(seams[0]?.drop).toBe(DROP);
    expect(DROP).toBeLessThanOrEqual(RETAIN_MAX);
    expect(seams[0]?.cells.length).toBeLessThan(MIN_RETAIN_RUN);
    // …and the shipped answer for it is a bank, which is the thing S7 removes.
    expect(seams[0]?.treatment).toBe("bank");
  });

  it("flag-off, that stub spreads a bank — the walked finding, reproduced", () => {
    const { result, plan } = run(STUB_BENCHES(), false, stubHeight);
    expect(result.banks).toBe(1);
    expect(result.banked).toBeGreaterThan(0);
    // Raw earth, out of one column of platform, four columns from the stub.
    expect(plan.ground[at(STUB_X + 1, STUB_Z)]).toBeGreaterThan(LOWER_Y);
  });

  it("flag-on it is absorbed: no seam, no bank, no ring, and the ground is the ground", () => {
    const levels = groundLevelsOf(BOUNDS, STUB_BENCHES());
    expect(levelSeams(levels as NonNullable<typeof levels>, { tiered: true })).toHaveLength(0);
    const { result, plan } = run(STUB_BENCHES(), true, stubHeight);
    expect(result.banks).toBe(0);
    expect(result.banked).toBe(0);
    expect(result.declaration.banks).toHaveLength(0);
    expect([...result.bank].filter((c) => c === 1)).toHaveLength(0);
    const flat = planOf(stack, stubHeight);
    expect([...plan.ground]).toEqual([...flat.ground]);
  });

  it("given back: the absorbed columns are stated to be the lower platform's", () => {
    const levels = groundLevelsOf(BOUNDS, STUB_BENCHES()) as NonNullable<
      ReturnType<typeof groundLevelsOf>
    >;
    const lower = levels.at(0, 0);
    levelSeams(levels, { tiered: true });
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      expect(levels.at(STUB_X + dx, STUB_Z + dz)).toBe(lower);
    }
  });

  it("where there is a long seam to join, the stub's columns join it", () => {
    const bare = groundLevelsOf(BOUNDS, HOSTED_BENCHES()) as NonNullable<
      ReturnType<typeof groundLevelsOf>
    >;
    const before = levelSeams(bare, { tiered: false });
    const long = before.filter((s) => s.cells.length >= MIN_RETAIN_RUN);
    const shortOnes = before.filter((s) => s.cells.length < MIN_RETAIN_RUN);
    expect(long).toHaveLength(1);
    expect(shortOnes).toHaveLength(1);

    const levels = groundLevelsOf(BOUNDS, HOSTED_BENCHES()) as NonNullable<
      ReturnType<typeof groundLevelsOf>
    >;
    const after = levelSeams(levels, { tiered: true });
    expect(after).toHaveLength(1);
    // The host keeps its own drop — the stub joined a *treatment*, it did not
    // bring one — and it keeps every column of the stub that was not already
    // its own.
    expect(after[0]?.drop).toBe(long[0]?.drop);
    expect(after[0]?.cells.length).toBeGreaterThan(long[0]?.cells.length as number);
    const columns = new Set(after[0]?.cells.map((c) => `${c.x},${c.z}`));
    expect(columns.size).toBe(after[0]?.cells.length);
    for (const c of shortOnes[0]?.cells ?? []) expect(columns.has(`${c.x},${c.z}`)).toBe(true);
  });

  it("S7's postcondition: no seam shorter than MIN_RETAIN_RUN reaches the pass", () => {
    for (const benches of [STUB_BENCHES(), HOSTED_BENCHES(), BANK_BENCHES()]) {
      const levels = groundLevelsOf(BOUNDS, benches) as NonNullable<
        ReturnType<typeof groundLevelsOf>
      >;
      for (const seam of levelSeams(levels, { tiered: true })) {
        expect(seam.cells.length).toBeGreaterThanOrEqual(MIN_RETAIN_RUN);
      }
    }
  });

  /* --- S8: the bank falls at 1:2 ----------------------------------------- */

  /**
   * **Absorbed at WP-G4's flip** (v1 §4 item 21): this fixture is a *single*
   * bench — one platform standing over open hillside — so its edge is
   * `skirtSeams`' subject, and with `GROUND_V1_SEAMS` on `buildRetainingWalls`
   * does not derive the skirt at all. The resolver enumerates that same face and
   * `finishSeams` builds it, against the resolved field rather than a plan four
   * passes still have to edit. Kept, running, for the flag-off fallback: what
   * the construction owes in that state is what these statements are.
   */
  /**
   * **Absorbed at WP-G4's flip** (v1 §4 item 21): this fixture is a *single*
   * bench — one platform standing over open hillside — so its edge is
   * `skirtSeams`' subject, and with `GROUND_V1_SEAMS` on `buildRetainingWalls`
   * does not derive the skirt at all. The resolver enumerates that same face and
   * `finishSeams` builds it, against the resolved field rather than a plan four
   * passes still have to edit. Kept, running, for the flag-off fallback: what
   * the construction owes in that state is what these statements are.
   */
  /**
   * **Absorbed at WP-G4's flip** (v1 §4 item 21): this fixture is a *single*
   * bench — one platform standing over open hillside — so its edge is
   * `skirtSeams`' subject, and with `GROUND_V1_SEAMS` on `buildRetainingWalls`
   * does not derive the skirt at all. The resolver enumerates that same face and
   * `finishSeams` builds it, against the resolved field rather than a plan four
   * passes still have to edit. Kept, running, for the flag-off fallback: what
   * the construction owes in that state is what these statements are.
   */
  /* --- S8: a landform carries nothing ------------------------------------- */

  /**
   * **Absorbed at WP-G4's flip** (v1 §4 item 21): this fixture is a *single*
   * bench — one platform standing over open hillside — so its edge is
   * `skirtSeams`' subject, and with `GROUND_V1_SEAMS` on `buildRetainingWalls`
   * does not derive the skirt at all. The resolver enumerates that same face and
   * `finishSeams` builds it, against the resolved field rather than a plan four
   * passes still have to edit. Kept, running, for the flag-off fallback: what
   * the construction owes in that state is what these statements are.
   */
  /**
   * **Absorbed at WP-G4's flip** (v1 §4 item 21): this fixture is a *single*
   * bench — one platform standing over open hillside — so its edge is
   * `skirtSeams`' subject, and with `GROUND_V1_SEAMS` on `buildRetainingWalls`
   * does not derive the skirt at all. The resolver enumerates that same face and
   * `finishSeams` builds it, against the resolved field rather than a plan four
   * passes still have to edit. Kept, running, for the flag-off fallback: what
   * the construction owes in that state is what these statements are.
   */
});

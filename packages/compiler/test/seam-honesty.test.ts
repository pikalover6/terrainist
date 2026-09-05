/**
 * **The honest refusal** — Part IV, wave 11A.
 *
 * §4.0a M2's finding, in one sentence: `buildRetainingWalls` gated the whole of
 * WP-3's §5 machinery on `district.plannedEdges !== undefined`, a field exactly
 * one form produces (`layout/forms/hillside.ts`), so on every `grown`, `grid`
 * and `radial` quarter the edge context was never *measured*, a tall bank was
 * never benched, and the `transitions by context (§5)` note could not even say
 * so. Troy's citadel is `fabric: "grown"`, `ground: "stepped"`: 56 banks, 337
 * `tallDrop` columns, 1,983 columns graded at 45°, and a report that named none
 * of it.
 *
 * Wave 11A splits that one flag in two, and the split is the whole of this file:
 *
 * - **measuring is unconditional.** `edgeContextOf` runs for every district with
 *   levels, and the seam accounting behind the note runs with it. Report bytes
 *   move — Troy gains one note — and §6's rule applies: *a world hash that moves
 *   at 11A is a bug, not a golden update.*
 * - **building waits for the flag.** Whether the context is allowed to *choose*
 *   the treatment, and whether a tall bank is benched rather than ramped 1:1,
 *   were held behind the served seam's flag.
 *
 * **Wave 11F flipped the flag**, and this file is where that is visible: the
 * unplanned quarter now chooses like the planned one, its drop-8 seam is a
 * 2-tier stack rather than a bank, and `LOAM-W411` is retired for
 * `LOAM-I412 SEAM_SERVED` — not by deletion, but because the flip empties the
 * only path that fired it (§4.1 S1, §7). Every one of those assertions was
 * re-pinned here with its cause written down; the pre-flip answers were not
 * dropped but *moved* to the two flag-off controls at the foot of the file,
 * which are 11A's own tests run at `tiered: false`. That is the control §6
 * demands — **prove the harness can see a difference before trusting that it
 * saw none** — kept pointing the other way round.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { groundLevelsOf, levelSeams, RETAIN_MAX } from "../src/layout/levels.js";
import type { FormBench } from "../src/layout/forms/types.js";
import { buildRetainingWalls } from "../src/structures/retaining.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";

const SIZE = 48;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const BOUNDS = { x0: 0, z0: 0, x1: SIZE - 1, z1: SIZE - 1 } as const;
const at = (x: number, z: number): number => z * SIZE + x;

/** Two storeys, which is the drop six of Troy's seams actually have. */
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
      caveAir: 0
    }
  } as unknown as ColumnPlan;
}

/**
 * One quarter, two platforms, a straight seam of full width dropping {@link DROP}
 * blocks — Troy's citadel geometry at fixture scale.
 *
 * `planned` is the *only* difference between the two cases in this file. A
 * `grown` quarter has no `plannedEdges` at all; a site-planned one declares its
 * cut edges, and an empty array is a quarter that declared none.
 */
function quarter(planned: boolean, tiered: boolean = true) {
  const benches: FormBench[] = [
    { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y },
    { id: "lower", runs: [{ x0: 0, z0: SEAM_Z, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y }
  ];
  const levels = groundLevelsOf(BOUNDS, benches);
  if (levels === null) throw new Error("fixture has no platforms");
  return {
    district: {
      nodePath: "world.quarter",
      bounds: BOUNDS,
      carriageway: new Uint8Array(SIZE * SIZE),
      sidewalk: new Uint8Array(SIZE * SIZE),
      levels,
      // Derived at the district's own `tiered` — 11F's rule for every fixture
      // in the seam family: a quarter that asks for the untiered world must not
      // be handed treatments the untiered pass cannot build.
      seams: levelSeams(levels, { tiered }),
      tiered,
      ...(planned ? { plannedEdges: [] } : {})
    },
    height: (x: number, z: number): number => (z < SEAM_Z ? UPPER_Y : LOWER_Y)
  };
}

describe("wave 11A — the seam is measured on every quarter, and built behind the flag", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  const themed = (): ReturnType<typeof resolvePalette>["palette"] => {
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    return palette;
  };

  const run = (planned: boolean, tiered: boolean = true) => {
    const fixture = quarter(planned, tiered);
    return buildRetainingWalls({
      districts: [fixture.district],
      plan: planOf(stack, fixture.height),
      palette: themed(),
      stack
    });
  };

  const transitions = (result: ReturnType<typeof buildRetainingWalls>): string | undefined =>
    result.diagnostics
      .map((d) => d.message)
      .find((m) => m.includes("transitions by context (§5)"));

  /** The fixture is the finding's geometry, or the rest of the file is theatre. */
  it("the fixture is one drop-8 seam past the wall ceiling", () => {
    expect(DROP).toBeGreaterThan(RETAIN_MAX);
    expect(DROP).toBe(8);
    // Re-pinned at 11F, attributed to §4.1 S2: the drop that was one bank is
    // now `ceil(8 / RETAIN_MAX)` = 2 faces of masonry. The line below read
    // `result.banks).toBe(1)` before the flip; the historical answer is not
    // lost, it moved to the flag-off control at the foot of this file.
    const result = run(false);
    expect(result.stacks).toBe(1);
    expect(result.banks).toBe(0);
    expect(result.walls).toBe(0);
  });

  it("a quarter with no plannedEdges reports what its seams became (§4.0a M2)", () => {
    // The note M2 proved was missing from `p3-tie2/generate.log`. It fires here
    // because the accounting behind it no longer asks whether a site planner
    // drew this quarter — measuring is honest, and the report is the
    // measurement. **11F re-pin:** the word in the note moved from `bank` to
    // `tiered` with the construction it names. That the note fires at all —
    // M2's actual finding — is unchanged.
    const note = transitions(run(false));
    expect(note).toBeDefined();
    expect(note).toContain(`${SIZE} edge column(s)`);
    expect(note).toContain("fill 48 (48 tiered)");
  });

  it("and retires the W411 refusal for I412, because the seam is served (S1)", () => {
    // Re-pinned at 11F, and this is §4.1 S1's retirement *happening*: before
    // the flip this test asserted `unfaced.tallDrop === 48` and a
    // `RETAINING_REFUSED` in the list, which is the accounting the battery logs
    // carried. The flip empties the path that fired it — 11A/11B built the
    // retirement as a flag, not as a deletion — so on a served seam the
    // warning has no columns left to count and `SEAM_SERVED` says what the
    // seam became instead.
    const result = run(false);
    expect(result.unfaced.tallDrop).toBe(0);
    expect(result.diagnostics.map((d) => d.name)).not.toContain("RETAINING_REFUSED");
    expect(result.diagnostics.map((d) => d.name)).toContain("SEAM_SERVED");
  });

  it("answers a site-planned quarter and an unplanned one alike, which is what the flip is", () => {
    // 11A's split — *the context may only choose where a site planner drew* —
    // was the asymmetry `SEAM_TIERS` existed to remove (§4.1 S1). It is gone:
    // `chooses` is now `planned || tiered` with `tiered` true everywhere, so
    // the same seam gets the same construction and the same accounting on both
    // quarters. Two tests at the foot of this file used to pin the two halves
    // of the asymmetry; they are the flag-off control below now.
    expect(run(true).unfaced.tallDrop).toBe(0);
    expect(run(false).unfaced.tallDrop).toBe(0);
    expect(run(true).stacks).toBe(run(false).stacks);
    expect(transitions(run(true))).toEqual(transitions(run(false)));
  });

  /* ---------------------------------------------------------------------- */
  /* the control — prove the harness can see a difference (§6)               */
  /* ---------------------------------------------------------------------- */


  it("the flag-off world is still the 45° ramp that shipped — so the tests above can fail", () => {
    // **The historical case, kept verbatim as the control.** These are 11A's
    // own assertions, moved rather than deleted: with the flag off, the same
    // unplanned quarter grades its drop-8 seam into the raw bank of §4.0a M3,
    // counts all 48 columns as an unfaced `tallDrop`, and says so in
    // `LOAM-W411`'s original words. Every re-pin above is therefore a
    // measurement of the flip and not a test that cannot fail.
    const result = run(false, false);
    expect(result.banks).toBe(1);
    expect(result.stacks).toBe(0);
    expect(result.unfaced.tallDrop).toBe(SIZE);
    const refusal = result.diagnostics.find((d) => d.name === "RETAINING_REFUSED");
    expect(refusal?.message).toContain("graded into each other as a bank");
    expect(refusal?.message).not.toContain("benched bank");
    expect(transitions(result)).toContain("fill 48 (48 bank)");
    expect(transitions(result)).not.toContain("benched rather than ramped");
  });

  it("and flag-off a site-planned quarter still benches, which is 11A's own control", () => {
    // 11A's second control, also kept: with the flag off the split is still
    // there, so what the flip removed is visible from both sides.
    const result = run(true, false);
    const refusal = result.diagnostics.find((d) => d.name === "RETAINING_REFUSED");
    expect(refusal?.message).toContain("benched bank");
    expect(transitions(result)).toContain("1 bank(s) benched rather than ramped");
    expect(result.unfaced.tallDrop).toBe(0);
  });
});

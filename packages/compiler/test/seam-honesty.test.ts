/**
 * **The honest refusal** — `docs/GROUND-UNIFICATION-v0.md` Part IV, wave 11A.
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
 *   are held behind {@link SEAM_TIERS} until 11F flips it on Kai's walk verdict.
 *
 * The last two tests are the control §6 demands: **prove the harness can see a
 * difference before trusting that it saw none.** The same fixture, given
 * `plannedEdges`, benches its drop-8 seam and reports it — so "the unplanned
 * quarter did not bench" is a measurement, not a test that cannot fail.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { groundLevelsOf, levelSeams, RETAIN_MAX } from "../src/layout/levels.js";
import { SEAM_TIERS } from "../src/layout/types.js";
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
      caveAir: 0,
    },
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
function quarter(planned: boolean) {
  const benches: FormBench[] = [
    { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y },
    { id: "lower", runs: [{ x0: 0, z0: SEAM_Z, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y },
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
      seams: levelSeams(levels),
      ...(planned ? { plannedEdges: [] } : {}),
    },
    height: (x: number, z: number): number => (z < SEAM_Z ? UPPER_Y : LOWER_Y),
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

  const run = (planned: boolean) => {
    const fixture = quarter(planned);
    return buildRetainingWalls({
      districts: [fixture.district],
      plan: planOf(stack, fixture.height),
      palette: themed(),
      stack,
    });
  };

  const transitions = (result: ReturnType<typeof buildRetainingWalls>): string | undefined =>
    result.diagnostics
      .map((d) => d.message)
      .find((m) => m.includes("transitions by context (§5)"));

  /** The fixture is the finding's geometry, or the rest of the file is theatre. */
  it("the fixture is one drop-8 seam past the wall ceiling", () => {
    const result = run(false);
    expect(DROP).toBeGreaterThan(RETAIN_MAX);
    expect(DROP).toBe(8);
    expect(result.banks).toBe(1);
    expect(result.walls).toBe(0);
  });

  it("a quarter with no plannedEdges now reports what its seams became (§4.0a M2)", () => {
    // The note M2 proved was missing from `p3-tie2/generate.log`. It fires here
    // because the accounting behind it no longer asks whether a site planner
    // drew this quarter — measuring is honest, and the report is the
    // measurement.
    const note = transitions(run(false));
    expect(note).toBeDefined();
    expect(note).toContain(`${SIZE} edge column(s)`);
    expect(note).toContain("fill 48 (48 bank)");
  });

  it("and still counts the refusal in `unfaced`, which is the W411 accounting", () => {
    // 11A moves report bytes, not world bytes, and it does not retire
    // `LOAM-W411` either: that is S1's `LOAM-I412`, and it lands with the
    // constructions that justify it. Until then the tallDrop column count is
    // exactly what the battery logs carry.
    const result = run(false);
    expect(result.unfaced.tallDrop).toBe(SIZE);
    expect(result.diagnostics.map((d) => d.name)).toContain("RETAINING_REFUSED");
  });

  it("does NOT bench that seam while SEAM_TIERS is off — the world is what shipped", () => {
    // §4.3's `retaining.ts:582` row is a *world* change and therefore waits for
    // the flag. With it off the drop-8 bank is the 45° ramp of §4.0a M3, and
    // the report says so in the same words it always did.
    expect(SEAM_TIERS).toBe(false);
    const result = run(false);
    const refusal = result.diagnostics.find((d) => d.name === "RETAINING_REFUSED");
    expect(refusal?.message).toContain("graded into each other as a bank");
    expect(refusal?.message).not.toContain("benched bank");
    expect(transitions(result)).not.toContain("benched rather than ramped");
  });

  /* ---------------------------------------------------------------------- */
  /* the control — prove the harness can see a difference (§6)               */
  /* ---------------------------------------------------------------------- */

  it("the same seam on a site-planned quarter IS benched — so the test above can fail", () => {
    const result = run(true);
    const refusal = result.diagnostics.find((d) => d.name === "RETAINING_REFUSED");
    expect(refusal?.message).toContain("benched bank");
    expect(transitions(result)).toContain("1 bank(s) benched rather than ramped");
  });

  it("and answers `unfaced` differently, because there a bank is a treatment", () => {
    // The other half of the split: where the context chooses, a bank is what
    // the edge *wanted*, so it is counted in `treated` and not as a wall that
    // failed. That asymmetry is what {@link SEAM_TIERS} removes at 11F.
    expect(run(true).unfaced.tallDrop).toBe(0);
    expect(run(false).unfaced.tallDrop).toBe(SIZE);
  });
});

/**
 * The ground a bespoke instance stands on: the pad's edge and the waterline.
 *
 * Kai's walk of the final battery deck named one defect class as the run's
 * biggest: **"bespoke program sites sit on raised, hard-edged platforms instead
 * of integrating with the terrain"**, with three measured exhibits. Two of them
 * are compiler defects and are pinned here:
 *
 * - **The hard edge** (`p7`, `glowing_mushroom_vale`). The pad graded out over
 *   one to three rings *keyed on the instance's size*, so a pad lifted eight
 *   blocks stepped down three and then fell off a cliff. The apron is keyed on
 *   the **lift** now, and the property below is the one a walker sees: crossing
 *   the pad's edge is a run of one-block steps, never a face.
 * - **The elevated ocean** (`p5`, `modern_hellenist_siege`). A sea monster stood
 *   in "a SLAB OF ELEVATED WATER — a raised rectangle of ocean above sea level
 *   with visible falling-edge faces": 1,811 columns of it, exactly the
 *   program's 64 × 64 footprint. The pad was innocent — a `wade` site is never
 *   padded — the *program* laid its own sea, because a wading program's
 *   node-local `y = 0` is the seabed and nothing tells it how deep the water
 *   over it is. The compiler holds the line the program cannot see.
 *
 * The third exhibit (a ship on a hilltop, two rival landmarks on one island) is
 * authoring, not compilation: those documents never asked for water or for a
 * tighter target. What the compiler owes them is a *word* — `LOAM-W521` — and
 * that is pinned in `layout.test.ts`'s neighbourhood, not here.
 */

import { describe, expect, it } from "vitest";

import { centeredRegion } from "@terrainist/stdlib";
import type { AuthoredProgramRecord } from "@terrainist/spec";

import { buildPrograms, gateDoubleRun, sourceHashOf } from "../src/programs/index.js";
import {
  PROGRAM_APRON_RUN_PER_BLOCK,
  siteWaterLine,
  treatProgramSite,
} from "../src/programs/site-treatment.js";
import { PROGRAM_GENTLE_LIFT, padLiftUnder, planProgramSites } from "../src/programs/place.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import type { Rect } from "../src/layout/frames.js";

const stack = loadPrismarine("1.21.11");

/** Column index of a world column. */
function idx(plan: ColumnPlan, x: number, z: number): number {
  return (z - plan.region.z0) * plan.region.width + (x - plan.region.x0);
}

/** A plan with a bowl in it: the ground inside `rect` sits `depth` blocks low. */
function hollow(width: number, rect: Rect, depth: number): ColumnPlan {
  const plan = devColumnPlan(centeredRegion(width, width), stack);
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = idx(plan, x, z);
      plan.ground[i] = (plan.ground[i] as number) - depth;
      plan.fluidTop[i] = plan.ground[i] as number;
    }
  }
  return plan;
}

/**
 * The worst outward step in the ground around `rect`, over `margin` columns.
 *
 * Chebyshev rings, each column compared with its neighbour one column further
 * out — which is exactly what a walker's legs measure leaving the pad.
 */
function worstOutwardStep(plan: ColumnPlan, rect: Rect, margin: number): number {
  let worst = 0;
  // The two bands the pad's edge is crossed in — due west and due east of the
  // footprint. Deliberately not the corners: a diagonal neighbour crosses two
  // columns of *terrain* at once, and this is a measurement of the pad.
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let step = 1; step < margin; step++) {
      for (const x of [rect.x0 - step, rect.x1 + step]) {
        const ox = x < rect.x0 ? x - 1 : x + 1;
        const here = plan.ground[idx(plan, x, z)] as number;
        const out = plan.ground[idx(plan, ox, z)] as number;
        worst = Math.max(worst, Math.abs(out - here));
      }
    }
  }
  return worst;
}

/** A plan whose whole western half sits `drop` blocks lower. */
function westLow(width: number, atX: number, drop: number): ColumnPlan {
  const plan = devColumnPlan(centeredRegion(width, width), stack);
  const { region } = plan;
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      if (region.x0 + i >= atX) continue;
      const k = j * region.width + i;
      plan.ground[k] = (plan.ground[k] as number) - drop;
      plan.fluidTop[k] = plan.ground[k] as number;
    }
  }
  return plan;
}

describe("the pad under a bespoke instance grades back into the terrain", () => {
  it("steps at most one block per column all the way out to the ground", () => {
    // A 16 × 16 instance standing in a bowl eight blocks deep — the shape that
    // produced a hard-edged platform on the walk.
    const footprint: Rect = { x0: -8, z0: -8, x1: 7, z1: 7 };
    const plan = hollow(128, { x0: -20, z0: -20, x1: 19, z1: 19 }, 8);
    const baseY = (plan.ground[idx(plan, 0, 0)] as number) + 1;
    const lift = padLiftUnder(plan, footprint, baseY);
    expect(lift).toBe(0); // the whole bowl is level: nothing to lift.

    // Now the real case: the seat plane is the *median* of a footprint that
    // straddles a rim, so half the pad is fill.
    const stepped = westLow(128, 0, 8);
    const seat = (stepped.ground[idx(stepped, 4, 0)] as number) + 1;
    expect(padLiftUnder(stepped, footprint, seat)).toBe(8);

    treatProgramSite({ plan: stepped, footprint, baseY: seat, source: "world.hut#pad@0" });

    // The property: leaving the pad is a staircase, never a face. The margin is
    // the apron's own reach plus slack, so the last rings are natural ground.
    expect(worstOutwardStep(stepped, footprint, 8 * PROGRAM_APRON_RUN_PER_BLOCK + 4)).toBe(1);
  });

  it("leaves the hard edge behind only where the ground itself is a cliff", () => {
    // The apron never *cuts*: a column already higher than the ramp keeps its
    // own height, so a natural cliff beside the pad is still a cliff. What the
    // apron owes is that no step is of the pad's own making.
    const footprint: Rect = { x0: -8, z0: -8, x1: 7, z1: 7 };
    const plan = westLow(128, 0, 6);
    const seat = (plan.ground[idx(plan, 4, 0)] as number) + 1;
    const before = plan.ground.slice();
    treatProgramSite({ plan, footprint, baseY: seat, source: "world.hut#pad@0" });
    // Fill only, everywhere.
    for (let k = 0; k < plan.ground.length; k++) {
      expect(plan.ground[k] as number).toBeGreaterThanOrEqual(before[k] as number);
    }
  });

  it("keeps a flat site exactly as cheap as it was", () => {
    const plan = devColumnPlan(centeredRegion(64, 64), stack);
    const before = plan.ground.slice();
    const blocks = treatProgramSite({
      plan,
      footprint: { x0: -7, z0: -7, x1: 8, z1: 8 },
      baseY: (plan.ground[0] as number) + 1,
      source: "world.hut#pad@0",
    });
    expect(blocks).toEqual([]);
    expect([...plan.ground]).toEqual([...before]);
  });
});

/* -------------------------------------------------------------------------- */
/* the placer prefers ground it barely has to lift                             */
/* -------------------------------------------------------------------------- */

describe("a scatter's sites", () => {
  it("takes the gentle ground when there is enough of it", () => {
    // West half level, east half a field of pits: both admit an instance, and
    // only the west needs no plinth.
    const plan = devColumnPlan(centeredRegion(256, 256), stack);
    for (let z = -120; z <= 120; z++) {
      for (let x = 4; x <= 120; x++) {
        const i = idx(plan, x, z);
        if (((x >> 2) + (z >> 2)) % 2 !== 0) continue;
        plan.ground[i] = (plan.ground[i] as number) - 6;
        plan.fluidTop[i] = plan.ground[i] as number;
      }
    }
    const sites = planProgramSites({
      params: { program: "hut", count: 6, area: { at: [0.5, 0.5], radius: 0.5 }, spacing: 12 },
      envelope: [9, 9, 9],
      plan,
      seed: new Uint8Array(32).fill(7) as unknown as Parameters<typeof planProgramSites>[0]["seed"],
    });
    expect(sites.length).toBe(6);
    for (const site of sites) {
      expect(padLiftUnder(plan, site.footprint, site.baseY)).toBeLessThanOrEqual(
        PROGRAM_GENTLE_LIFT,
      );
    }
  });

  it("never trades an instance for a gentler site", () => {
    // Ground that is lumpy everywhere: the gentle walk cannot fill the count,
    // so the plain walk's answer stands and the author still gets what they
    // asked for. (W337 exists because rounding a count down silently was
    // already a defect once.)
    const plan = devColumnPlan(centeredRegion(128, 128), stack);
    for (let z = -64; z < 64; z++) {
      for (let x = -64; x < 64; x++) {
        const i = idx(plan, x, z);
        if (((x >> 1) + (z >> 1)) % 2 !== 0) continue;
        plan.ground[i] = (plan.ground[i] as number) - 7;
        plan.fluidTop[i] = plan.ground[i] as number;
      }
    }
    const params = {
      program: "hut",
      count: 4,
      area: { at: [0.5, 0.5], radius: 0.5 },
      spacing: 10,
    } as const;
    const seed = new Uint8Array(32).fill(3) as unknown as Parameters<
      typeof planProgramSites
    >[0]["seed"];
    const sites = planProgramSites({ params, envelope: [9, 9, 9], plan, seed });
    expect(sites.length).toBe(4);
    // Deterministic: the same inputs give the same list, twice.
    expect(planProgramSites({ params, envelope: [9, 9, 9], plan, seed })).toEqual(sites);
  });
});

/* -------------------------------------------------------------------------- */
/* the water law                                                               */
/* -------------------------------------------------------------------------- */

/** A plan that is all ocean: a shallow seabed, water to `seaLevel`. */
function bay(width: number): ColumnPlan {
  const plan = devColumnPlan(centeredRegion(width, width), stack);
  const sea = plan.seaLevel;
  for (let k = 0; k < plan.ground.length; k++) {
    plan.ground[k] = sea - 2;
    plan.fluidTop[k] = sea;
    plan.fluidKind[k] = FluidKind.WATER;
  }
  return plan;
}

/** A wading monster that models four blocks of its own sea, as the kraken did. */
const SEA_MONSTER_SOURCE = [
  "export const envelope = [8, 10, 8];",
  "export default function build(api) {",
  "  for (let z = 0; z < 8; z++) {",
  "    for (let x = 0; x < 8; x++) {",
  "      api.set(x, 0, z, 'minecraft:gravel');",
  "      for (let y = 1; y <= 4; y++) api.set(x, y, z, 'minecraft:water');",
  "    }",
  "  }",
  "  for (let y = 1; y <= 9; y++) api.set(4, y, 4, 'minecraft:prismarine');",
  "  return { name: 'monster', seatY: 0 };",
  "}",
].join("\n");

function monster(): AuthoredProgramRecord {
  const base: AuthoredProgramRecord = {
    mode: "landmark",
    envelope: [8, 10, 8],
    source: SEA_MONSTER_SOURCE,
    sourceHash: sourceHashOf(SEA_MONSTER_SOURCE),
    outputHash: "b3:0000000000000000",
  };
  return { ...base, outputHash: gateDoubleRun("monster", base, 0n).outputHash };
}

describe("a program standing in water never raises it", () => {
  it("drops the fluid it wrote above the waterline, and says so", () => {
    const plan = bay(96);
    const footprint: Rect = { x0: -4, z0: -4, x1: 3, z1: 3 };
    expect(siteWaterLine(plan, footprint)).toBe(plan.seaLevel);

    const result = buildPrograms({
      jobs: [
        {
          nodePath: "world.leviathan",
          programId: "monster",
          program: monster(),
          mode: "landmark",
          placement: { footprint, baseY: plan.seaLevel - 1, seat: { policy: "wade" } },
        },
      ],
      plan,
      stack,
      worldSeed: 0n,
    });

    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // The invariant, read off the blocks the world will actually get.
    const fluid = new Set(
      ["water", "flowing_water", "bubble_column"].flatMap((n) => {
        const id = stack.blockByName(n)?.stateId;
        return id === undefined ? [] : [id];
      }),
    );
    const raised = result.blocks.filter((b) => fluid.has(b.stateId) && b.y > plan.seaLevel);
    expect(raised).toEqual([]);
    // …and the water it was *entitled* to — at and below the surface — is still
    // there, so the fix is a clamp and not a ban.
    expect(result.blocks.some((b) => fluid.has(b.stateId))).toBe(true);
    // The monster itself is untouched: only fluid is clamped.
    const prismarine = stack.blockByName("prismarine")?.stateId;
    expect(result.blocks.filter((b) => b.stateId === prismarine).length).toBe(9);

    const clamped = result.diagnostics.find((d) => d.code === "LOAM-W339");
    expect(clamped).toBeDefined();
    expect(clamped?.severity).toBe("warning");
    expect(clamped?.message).toContain("above the waterline");
  });

  it("leaves a dry site's fountain alone", () => {
    // The clamp is a statement about a body of water an instance stands *in*.
    // On dry land a program may build whatever pool it likes; the physics lint
    // is what refuses an unstable one.
    const plan = devColumnPlan(centeredRegion(96, 96), stack);
    const footprint: Rect = { x0: -4, z0: -4, x1: 3, z1: 3 };
    const result = buildPrograms({
      jobs: [
        {
          nodePath: "world.fountain",
          programId: "monster",
          program: monster(),
          mode: "landmark",
          placement: { footprint, baseY: plan.ground[0] as number },
        },
      ],
      plan,
      stack,
      worldSeed: 0n,
    });
    const water = stack.blockByName("water")?.stateId;
    // 256 columns of water less the four the spine overwrites.
    expect(result.blocks.filter((b) => b.stateId === water).length).toBe(8 * 8 * 4 - 4);
    expect(result.diagnostics.some((d) => d.code === "LOAM-W339")).toBe(false);
  });

  it("reads a pond's own surface, not the world's sea level", () => {
    // A tarn at altitude is still a body of water: what the instance may not do
    // is stack it higher, whatever height it sits at.
    const plan = devColumnPlan(centeredRegion(96, 96), stack);
    const pond: Rect = { x0: -6, z0: -6, x1: 5, z1: 5 };
    const surface = (plan.ground[0] as number) + 2;
    for (let z = pond.z0; z <= pond.z1; z++) {
      for (let x = pond.x0; x <= pond.x1; x++) {
        const i = idx(plan, x, z);
        plan.fluidKind[i] = FluidKind.WATER;
        plan.fluidTop[i] = surface;
      }
    }
    expect(siteWaterLine(plan, pond)).toBe(surface);
    expect(siteWaterLine(plan, { x0: 20, z0: 20, x1: 24, z1: 24 })).toBe(plan.seaLevel);
  });
});

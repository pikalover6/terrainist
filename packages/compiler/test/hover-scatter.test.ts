/**
 * Hovering scatters — `"params": {"hover": N}` on a `scatter.program@0` node.
 *
 * The defect this file exists to prevent is a live one (invasion v2): a prompt
 * asked for hovering saucers "scattered across the fields and hills", the model
 * wrote `hover` on the scatter node, the validator rejected the key, and the
 * correction dropped it — so a node named `world.hovering_saucers` shipped
 * sitting on the dirt.
 *
 * The claims:
 *
 * 1. Every instance floats `hover` blocks above the **highest** ground column
 *    under its **own** footprint — per instance, exactly as a landmark's rule
 *    is per footprint.
 * 2. The ground has no say: a hovering scatter places instances over water,
 *    where a grounded one places none.
 * 3. A hovering instance claims no ground and gets no pad.
 * 4. A scatter without `hover` is untouched — same sites, same blocks.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { centeredRegion, nodeSeed } from "@terrainist/stdlib";
import type { AuthoredProgramRecord, ProgramScatterParams } from "@terrainist/spec";

import { buildPrograms, gateDoubleRun, sourceHashOf } from "../src/programs/index.js";
import { planProgramSites } from "../src/programs/place.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { FluidKind } from "../src/terrain/columns.js";
import type { Rect } from "../src/layout/frames.js";
import type { ColumnPlan } from "../src/terrain/columns.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const stack = loadPrismarine("1.21.11");
const region = centeredRegion(192, 192);
const plan = devColumnPlan(region, stack);

/**
 * A dry landscape with a shape the assertions can name: a sawtooth 8 blocks
 * deep (so a footprint has real relief for a pad to fill) riding a staircase
 * that climbs 20 blocks every 64 in +X (so two instances far apart cannot
 * share an altitude).
 */
const stepped: ColumnPlan = (() => {
  const ground = new Int32Array(plan.ground.length);
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      ground[j * region.width + i] = 70 + (i % 8) + Math.floor(i / 64) * 20;
    }
  }
  return {
    ...plan,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(plan.fluidKind.length),
  };
})();

/** The same landscape, drowned: every column carries water. */
const flooded: ColumnPlan = {
  ...plan,
  fluidKind: new Uint8Array(plan.fluidKind.length).fill(FluidKind.WATER),
};

function fixture(name: string): string {
  return readFileSync(path.join(here, "fixtures", "programs", name), "utf8");
}

function record(
  id: string,
  file: string,
  envelope: readonly [number, number, number],
): AuthoredProgramRecord {
  const source = fixture(file);
  const draft: AuthoredProgramRecord = {
    mode: "plugin",
    envelope,
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000",
  };
  return { ...draft, outputHash: gateDoubleRun(id, draft, 0n).outputHash };
}

const SAUCER = record("saucer", "saucer.js", [21, 13, 21]);
const ENVELOPE: readonly [number, number, number] = [21, 13, 21];
const SEED = nodeSeed(0n, "world.hovering_saucers", "");

/** The highest ground column under a rect — what `hover` is measured from. */
function maxGround(p: ColumnPlan, rect: Rect): number {
  let top = -Infinity;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const g = p.ground[(z - p.region.z0) * p.region.width + (x - p.region.x0)] as number;
      if (g > top) top = g;
    }
  }
  return top;
}

function params(extra: Record<string, unknown> = {}): ProgramScatterParams {
  return {
    program: "saucer",
    count: 8,
    area: { all: true },
    spacing: 30,
    ...extra,
  } as unknown as ProgramScatterParams;
}

function sites(p: ColumnPlan, extra: Record<string, unknown> = {}) {
  return planProgramSites({
    params: params(extra),
    envelope: ENVELOPE,
    plan: p,
    seed: SEED,
  });
}

describe("planProgramSites, given a hovering scatter", () => {
  it("still honours the avoidTags the author wrote", () => {
    // Fluid and relief are facts about ground a thing stands on, and a
    // hovering instance is exempt from them. `avoidTags` is not a fact about
    // ground — it is an instruction, and a param the compiler accepts and
    // quietly ignores is a document that lies about the world it describes.
    const everywhere = new Uint8Array(region.width * region.depth).fill(1);
    const occupancy = { region, mask: everywhere, byTag: new Map([["road", everywhere]]) };
    const base = { envelope: ENVELOPE, plan: stepped, seed: SEED, occupancy };

    // Told to avoid roads, over a world that is entirely road: nowhere to fly.
    expect(planProgramSites({ ...base, params: params({ hover: 40, avoidTags: ["road"] }) })).toHaveLength(0);

    // The same sky, with no `avoidTags`: the plain occupancy mask is a claim on
    // the *ground*, and a hovering instance is not standing on it. This is the
    // mothership-over-the-town case, so it must keep flying.
    expect(planProgramSites({ ...base, params: params({ hover: 40 }) }).length).toBeGreaterThan(0);

    // And a grounded scatter is still stopped by that same mask.
    expect(planProgramSites({ ...base, params: params({}) })).toHaveLength(0);
  });


  it("floats every instance above the highest column under its own footprint", () => {
    const hovered = sites(stepped, { hover: 40 });
    expect(hovered.length).toBeGreaterThan(1);
    for (const site of hovered) {
      expect(site.baseY).toBe(maxGround(stepped, site.footprint) + 40);
    }
    // Per instance, not one shared plane: the dev landscape has relief, so at
    // least two instances must disagree about their altitude.
    expect(new Set(hovered.map((s) => s.baseY)).size).toBeGreaterThan(1);
    expect(sites(stepped, {}).length).toBeGreaterThan(0);
  });

  it("places over water, where a grounded scatter places nothing", () => {
    expect(sites(flooded, {}).length).toBe(0);
    expect(sites(flooded, { hover: 40 }).length).toBeGreaterThan(0);
  });

  it("ignores ground already claimed by something else", () => {
    const whole: Rect = {
      x0: region.x0,
      z0: region.z0,
      x1: region.x0 + region.width - 1,
      z1: region.z0 + region.depth - 1,
    };
    const taken = (hover: number | undefined) =>
      planProgramSites({
        params: params(hover === undefined ? {} : { hover }),
        envelope: ENVELOPE,
        plan,
        seed: SEED,
        taken: [whole],
      }).length;
    expect(taken(undefined)).toBe(0);
    expect(taken(40)).toBeGreaterThan(0);
  });

  it("is a pure function of the ground and the params", () => {
    expect(sites(plan, { hover: 40 })).toEqual(sites(plan, { hover: 40 }));
  });
});

describe("the pass, given a hovering scatter", () => {
  function run(extra: Record<string, unknown>) {
    return buildPrograms({
      jobs: [
        {
          nodePath: "world.hovering_saucers",
          programId: "saucer",
          program: SAUCER,
          mode: "plugin" as const,
          params: params(extra),
        },
      ],
      plan: stepped,
      stack,
      worldSeed: 0n,
    });
  }

  it("builds every instance in the air, at max-ground + hover", () => {
    const result = run({ hover: 40 });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.placed.length).toBeGreaterThan(1);
    for (const placed of result.placed) {
      expect(placed.hovering).toBe(true);
      expect(placed.baseY).toBe(maxGround(stepped, placed.footprint) + 40);
    }
  });

  it("lays no pad — every block belongs to an instance, none to the ground", () => {
    const result = run({ hover: 40 });
    const fromInstances = result.placed.reduce((sum, p) => sum + p.blockCount, 0);
    expect(result.blocks.length).toBe(fromInstances);
    // And nothing sits at or below the terrain it floats over.
    const floor = Math.min(...result.placed.map((p) => p.baseY));
    expect(Math.min(...result.blocks.map((b) => b.y))).toBeGreaterThanOrEqual(floor);
  });

  it("marks a grounded scatter as claiming ground, and pads it", () => {
    const seated = run({});
    expect(seated.placed.length).toBeGreaterThan(0);
    for (const placed of seated.placed) expect(placed.hovering).toBeUndefined();
    const fromInstances = seated.placed.reduce((sum, p) => sum + p.blockCount, 0);
    expect(seated.blocks.length).toBeGreaterThan(fromInstances);
  });

  it("leaves a scatter without hover byte-identical run to run", () => {
    expect(run({}).blocks).toEqual(run({}).blocks);
  });
});

/**
 * The bespoke tier's integration contract: `api.theme`, the site treatment a
 * plugin instance gets, and the authored wall's materials.
 *
 * All three come from one walk of a Troy built in `sun_clay`: a plugin program
 * that invented four palettes of its own, twenty-four instances sitting raw on
 * a hillside with no pad, no foundation and no transition, and an author-invoked
 * curtain wall in default grey stone inside a mud-brick city. Every test below
 * pins one half of the fix — the compiler now *offers* the world's palette and
 * the world's ground, and the wall takes the theme unless the author overrode
 * it by name.
 */

import { describe, expect, it } from "vitest";

import { centeredRegion } from "@terrainist/stdlib";
import { MATERIAL_THEMES, type MaterialTheme } from "@terrainist/stdlib";
import type { AuthoredProgramRecord } from "@terrainist/spec";

import {
  buildPrograms,
  gateDoubleRun,
  programThemeOf,
  materialThemeById,
  runProgramInstance,
  sourceHashOf,
  VERIFICATION_THEME,
} from "../src/programs/index.js";
import {
  programApronRings,
  siteIsWet,
  treatProgramSite,
  underpinProgramInstance,
} from "../src/programs/site-treatment.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { driverForPlan } from "../src/layout/ground-driver.js";
import { wallJobsOf, wallMaterialsOfTheme } from "../src/structures/index.js";
import { FluidKind } from "../src/terrain/columns.js";
import type { ColumnPlan } from "../src/terrain/columns.js";

const stack = loadPrismarine("1.21.11");

function record(
  source: string,
  envelope: readonly [number, number, number],
  mode: AuthoredProgramRecord["mode"] = "landmark",
): AuthoredProgramRecord {
  return {
    mode,
    envelope,
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000",
  };
}

function frozen(program: AuthoredProgramRecord, id: string): AuthoredProgramRecord {
  return { ...program, outputHash: gateDoubleRun(id, program, 0n).outputHash };
}

/** A program that builds itself out of whatever the world is made of. */
const THEMED = record(
  [
    "export const envelope = [5, 6, 5];",
    "export default function build(api) {",
    "  for (let y = 0; y < 5; y++) {",
    "    for (let z = 0; z < 5; z++) {",
    "      for (let x = 0; x < 5; x++) {",
    "        const block = y === 4 ? api.theme.roof.solid : api.theme.ground.plinth;",
    "        api.set(x, y, z, block);",
    "      }",
    "    }",
    "  }",
    "  return { name: 'themed', seatY: 0 };",
    "}",
  ].join("\n"),
  [5, 6, 5],
);

describe("api.theme", () => {
  it("hands the program the roles the rest of the compiler builds from", () => {
    const theme = programThemeOf(MATERIAL_THEMES[0] as MaterialTheme);
    expect(theme.id).toBe((MATERIAL_THEMES[0] as MaterialTheme).id);
    // The ground roles, verbatim — the same twelve the streets and the
    // retaining walls take.
    for (const role of [
      "pavement",
      "kerb",
      "tread",
      "revetment",
      "coping",
      "plinth",
      "weep",
      "rail",
      "stairs",
      "slab",
      "bank",
      "scree",
    ] as const) {
      expect(theme.ground[role], role).toMatch(/^minecraft:[a-z0-9_]+$/);
    }
    // The wall roles are the curtain's own five, and they agree with the
    // fortification dial's derivation block for block.
    const dial = wallMaterialsOfTheme(MATERIAL_THEMES[0] as MaterialTheme);
    expect(theme.wall.core).toBe(`minecraft:${dial.core}`.replace("minecraft:minecraft:", "minecraft:"));
    expect(theme.wood.planks).toContain("planks");
    expect(theme.stone.primary.length).toBeGreaterThan(0);
    expect(theme.roof.solid.length).toBeGreaterThan(0);
  });

  it("is frozen — one instance cannot hand the next a different world", () => {
    const theme = programThemeOf(MATERIAL_THEMES[1] as MaterialTheme);
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.ground)).toBe(true);
    expect(Object.isFrozen(theme.wall)).toBe(true);
    expect(() => {
      (theme.ground as unknown as Record<string, string>)["plinth"] = "minecraft:tnt";
    }).toThrow();
  });

  it("is the pinned verification theme when the caller has no world", () => {
    const run = runProgramInstance({
      programId: "themed",
      program: THEMED,
      nodePath: "loam.verify",
      worldSeed: 0n,
      index: 0,
      count: 1,
    });
    expect(run.ok).toBe(true);
    expect([...run.voxels.values()]).toContain(VERIFICATION_THEME.ground.plinth);
  });

  it("builds a landmark out of the world's own theme, and repeats exactly", () => {
    const plan = devColumnPlan(centeredRegion(96, 96), stack);
    const themeId = (MATERIAL_THEMES[1] as MaterialTheme).id;
    const job = {
      nodePath: "world.icon",
      programId: "themed",
      program: frozen(THEMED, "themed"),
      mode: "landmark" as const,
      placement: { footprint: { x0: 0, z0: 0, x1: 4, z1: 4 }, baseY: 64 },
    };
    const once = buildPrograms({ jobs: [job], plan, stack, worldSeed: 0n, themeId });
    const twice = buildPrograms({ jobs: [job], plan, stack, worldSeed: 0n, themeId });
    expect(once.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(twice.blocks).toEqual(once.blocks);

    const expected = programThemeOf(materialThemeById(themeId));
    const plinth = stack.blockByName(expected.ground.plinth.replace("minecraft:", ""))?.stateId;
    expect(plinth).toBeDefined();
    expect(once.blocks.some((b) => b.stateId === plinth)).toBe(true);

    // …and a *different* theme id builds the same shape out of different blocks.
    const other = buildPrograms({
      jobs: [job],
      plan,
      stack,
      worldSeed: 0n,
      themeId: (MATERIAL_THEMES[2] as MaterialTheme).id,
    });
    expect(other.blocks.length).toBe(once.blocks.length);
    expect(other.blocks).not.toEqual(once.blocks);
  });

  it("leaves a document with no programs at all untouched", () => {
    const plan = devColumnPlan(centeredRegion(64, 64), stack);
    expect(buildPrograms({ jobs: [], plan, stack, worldSeed: 0n }).blocks).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* the site treatment                                                          */
/* -------------------------------------------------------------------------- */

/** A plan with a step in it: everything east of `atX` is `drop` blocks lower. */
function stepped(width: number, atX: number, drop: number): ColumnPlan {
  const plan = devColumnPlan(centeredRegion(width, width), stack);
  const { region } = plan;
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      if (region.x0 + i < atX) continue;
      const idx = j * region.width + i;
      plan.ground[idx] = (plan.ground[idx] as number) - drop;
      plan.fluidTop[idx] = plan.ground[idx] as number;
    }
  }
  return plan;
}

describe("a plugin instance's site treatment", () => {
  it("scales the apron with the instance, and never terraforms", () => {
    expect(programApronRings({ x0: 0, z0: 0, x1: 14, z1: 14 })).toBe(1);
    expect(programApronRings({ x0: 0, z0: 0, x1: 31, z1: 31 })).toBe(3);
    expect(programApronRings({ x0: 0, z0: 0, x1: 199, z1: 199 })).toBe(3);
  });

  it("declares its pad and its apron to the ground driver rather than writing them", () => {
    const plan = stepped(96, 4, 3);
    const driver = driverForPlan(plan);
    const footprint = { x0: -3, z0: -3, x1: 11, z1: 11 };
    const baseY = (plan.ground[0] as number) + 1;
    const blocks = treatProgramSite({
      plan,
      footprint,
      baseY,
      ground: driver,
      source: "world.greeks#pad@0",
    });
    expect(blocks.length).toBeGreaterThan(0);
    const sources = driver.intents.map((i) => i.source);
    expect(sources).toContain("world.greeks#pad@0");
    expect(sources).toContain("world.greeks#pad@0.apron");
    for (const intent of driver.intents) {
      expect(intent.sourceClass).toBe("prop.pad");
      expect(intent.kind).toBe("platform");
    }
    // The apron is the transition, and says so.
    const apron = driver.intents.find((i) => i.source.endsWith(".apron"));
    expect(apron?.transition).toBe("ramp");
    // …and it steps *down* from the pad, one block per ring, so the pad does
    // not end in a cliff of its own making.
    const levels = [...(apron?.columns ?? [])].map((c) => c.y);
    expect(Math.max(...levels)).toBeLessThan(baseY);
  });

  it("is a no-op on ground already flat enough to stand on", () => {
    const plan = devColumnPlan(centeredRegion(64, 64), stack);
    const driver = driverForPlan(plan);
    const blocks = treatProgramSite({
      plan,
      footprint: { x0: 0, z0: 0, x1: 14, z1: 14 },
      baseY: (plan.ground[0] as number) + 1,
      ground: driver,
      source: "world.flat#pad@0",
    });
    expect(blocks).toEqual([]);
    expect(driver.intents).toEqual([]);
  });

  it("sinks a foundation under every column with daylight beneath it", () => {
    const plan = stepped(64, 4, 4);
    const g = plan.ground[0] as number;
    // Two legs of an instance seated on the high side, spanning the step.
    const instance = [
      { x: 0, y: g + 1, z: 0, stateId: 1 },
      { x: 8, y: g + 1, z: 0, stateId: 1 },
    ];
    const skirt = underpinProgramInstance({
      plan,
      stack,
      blocks: instance,
      seatPlane: g + 1,
      plinth: "minecraft:stone_bricks",
    });
    // The column on the high side is already on the ground; the one past the
    // step is four blocks in the air, and gets four courses under it.
    expect(skirt.filter((b) => b.x === 0)).toEqual([]);
    expect(skirt.filter((b) => b.x === 8)).toHaveLength(4);
    expect(new Set(skirt.map((b) => b.stateId)).size).toBe(1);
    // Deterministic: the same call twice is the same list.
    expect(
      underpinProgramInstance({
        plan,
        stack,
        blocks: instance,
        seatPlane: g + 1,
        plinth: "minecraft:stone_bricks",
      }),
    ).toEqual(skirt);
  });

  it("leaves a span alone — an arch's opening is not a column to underpin", () => {
    const plan = stepped(64, 4, 4);
    const g = plan.ground[0] as number;
    const skirt = underpinProgramInstance({
      plan,
      stack,
      // The underside of an arch, four blocks above the seat course.
      blocks: [{ x: 8, y: g + 5, z: 0, stateId: 1 }],
      seatPlane: g + 1,
      plinth: "minecraft:stone_bricks",
    });
    expect(skirt).toEqual([]);
  });

  it("gives a water-seated instance no land pad at all", () => {
    const plan = devColumnPlan(centeredRegion(64, 64), stack);
    const { region } = plan;
    const rect = { x0: 0, z0: 0, x1: 10, z1: 10 };
    for (let z = rect.z0; z <= rect.z1; z++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        const idx = (z - region.z0) * region.width + (x - region.x0);
        plan.fluidKind[idx] = FluidKind.WATER;
        plan.ground[idx] = (plan.ground[idx] as number) - 6;
      }
    }
    expect(siteIsWet(plan, rect)).toBe(true);
    expect(siteIsWet(plan, { x0: 20, z0: 20, x1: 24, z1: 24 })).toBe(false);
    // A sea monster is not given a gravel pad: the skirt refuses wet columns
    // even when handed blocks that hang over them.
    const skirt = underpinProgramInstance({
      plan,
      stack,
      blocks: [{ x: 5, y: (plan.ground[0] as number) + 2, z: 5, stateId: 1 }],
      seatPlane: (plan.ground[0] as number) + 2,
      plinth: "minecraft:stone_bricks",
    });
    expect(skirt).toEqual([]);
  });

  it("treats a scattered plugin's sites through the pass, on rough ground", () => {
    // A ramp — one block down per column — so a 5 × 5 instance spans four
    // blocks of relief around its median seat: rough enough to need a pad,
    // gentle enough that the placer does not refuse the site as a cliff.
    const plan = devColumnPlan(centeredRegion(160, 160), stack);
    for (let j = 0; j < plan.region.depth; j++) {
      for (let i = 0; i < plan.region.width; i++) {
        const idx = j * plan.region.width + i;
        plan.ground[idx] = (plan.ground[idx] as number) - i;
        plan.fluidTop[idx] = plan.ground[idx] as number;
      }
    }
    const driver = driverForPlan(plan);
    const job = {
      nodePath: "world.greeks",
      programId: "themed",
      program: frozen({ ...THEMED, mode: "plugin" as const }, "themed"),
      mode: "plugin" as const,
      params: { program: "themed", count: 3, spacing: 10, area: { all: true as const } },
    };
    const result = buildPrograms({ jobs: [job], plan, stack, worldSeed: 7n, ground: driver });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.placed.length).toBeGreaterThan(0);
    // Every claim the pass filed is a pad claim, and it filed at least one.
    expect(driver.intents.length).toBeGreaterThan(0);
    for (const intent of driver.intents) expect(intent.sourceClass).toBe("prop.pad");
  });
});

/* -------------------------------------------------------------------------- */
/* the authored wall                                                           */
/* -------------------------------------------------------------------------- */

function walledDoc(walls: Record<string, unknown>): Parameters<typeof wallJobsOf>[0] {
  return {
    root: {
      kind: "settlement",
      id: "troy",
      children: [{ kind: "district", id: "lower", params: { fabric: "organic", walls } }],
    },
  } as unknown as Parameters<typeof wallJobsOf>[0];
}

describe("an authored `params.walls`", () => {
  const theme = MATERIAL_THEMES[1] as MaterialTheme;
  const rect = { x0: 0, z0: 0, x1: 40, z1: 40 };
  const rectOf = (): typeof rect => rect;

  it("takes the settlement's own stone when the author named no materials", () => {
    const [job] = wallJobsOf(walledDoc({}), "world", [], rectOf, () => theme);
    expect(job?.materials).toEqual(wallMaterialsOfTheme(theme));
  });

  it("keeps the style table for a style that *is* its material", () => {
    const [job] = wallJobsOf(walledDoc({ style: "palisade" }), "world", [], rectOf, () => theme);
    expect(job?.materials).toBeUndefined();
  });

  it("lets the author's own materials win, role by role", () => {
    const [job] = wallJobsOf(
      walledDoc({ materials: { merlon: "chiseled_sandstone" } }),
      "world",
      [],
      rectOf,
      () => theme,
    );
    const derived = wallMaterialsOfTheme(theme);
    expect(job?.materials?.merlon).toBe("chiseled_sandstone");
    // Every role the author left alone is still the town's own stone.
    expect(job?.materials?.core).toBe(derived.core);
    expect(job?.materials?.walk).toBe(derived.walk);
  });

  it("leaves the topology params exactly where they were", () => {
    const [job] = wallJobsOf(
      walledDoc({ margin: 6, towerPitch: 24, height: 9, gates: false }),
      "world",
      [],
      rectOf,
      () => theme,
    );
    expect(job?.margin).toBe(6);
    expect(job?.towerPitch).toBe(24);
    expect(job?.height).toBe(9);
    expect(job?.gates).toBe(false);
  });

  it("is unchanged for a caller that hands it no theme at all", () => {
    const [job] = wallJobsOf(walledDoc({}), "world", [], rectOf);
    expect(job?.materials).toBeUndefined();
    expect(job?.style).toBe("masonry");
  });
});

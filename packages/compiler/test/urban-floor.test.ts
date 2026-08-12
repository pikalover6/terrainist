/**
 * The urban floor and the arid ambient — Kai's two verdicts on Troy c4
 * (2026-08-11): *"the city interior still looks more green than I'd expect"*,
 * and the country outside it reads lush Ireland rather than Aegean gold.
 *
 * Both fixes are **gated**, and the gate is what most of this file tests: a
 * world with no wall circuit and a world whose theme does not call itself arid
 * must come out of the compiler exactly as they did yesterday. Everything else
 * is the shape of the conversion — the circuit's own interior, the gardens that
 * survive inside it, and the tones being the town's own rather than a table's.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ALL_MATERIAL_THEMES,
  MATERIAL_THEMES,
  SUN_CLAY_THEME,
  nodeSeed,
  type MaterialTheme,
} from "@terrainist/stdlib";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import type { StructurePassResult } from "../src/structures/index.js";
import { multiStationSpecs } from "../src/terrarium-stations.js";
import { materialThemeById } from "../src/programs/theme.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  ARID_COLD_OFFSET,
  ARID_WET_OFFSET,
  aridAmbientBiome,
  climateOutranksArid,
  type ProfileBiome,
} from "../src/terrain/biomes.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { groundMaterials, resolvePalette, type Palette } from "../src/terrain/palette.js";
import {
  PLANT_HALO,
  TREE_HALO,
  floorTones,
  insideRing,
  isPlantBlock,
  isTuftBlock,
  layUrbanFloor,
  ringOrientation,
  turfStates,
  type FloorBlock,
  type FloorPoint,
} from "../src/terrain/urban-floor.js";

const REGION = { x0: 0, z0: 0, width: 64, depth: 64 } as const;
const idx = (x: number, z: number): number => (z - REGION.z0) * REGION.width + (x - REGION.x0);

/** A flat, dry, grassy column plan at y = 64. */
function flatPlan(stack: PrismarineStack): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
  const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
  return {
    region: REGION,
    ground: new Int32Array(n).fill(64),
    fluidTop: new Int32Array(n).fill(64),
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

/** A square circuit — the shape a support hull takes over a square town. */
const SQUARE: readonly FloorPoint[] = Object.freeze([
  { x: 16, z: 16 },
  { x: 47, z: 16 },
  { x: 47, z: 47 },
  { x: 16, z: 47 },
]);

interface Harness {
  readonly stack: PrismarineStack;
  readonly palette: Palette;
  readonly plan: ColumnPlan;
}

function harness(): Harness {
  const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
  return { stack, palette, plan: flatPlan(stack) };
}

/* -------------------------------------------------------------------------- */
/* 1 — the circuit is the gate                                                 */
/* -------------------------------------------------------------------------- */

describe("the wall circuit gates the whole pass", () => {
  it("converts the bare turf inside a circuit and nothing outside it", () => {
    const { stack, palette, plan } = harness();
    const before = Int32Array.from(plan.surface);
    const result = layUrbanFloor({
      plan,
      palette,
      stack,
      seed: 1234,
      circuits: [SQUARE],
      theme: SUN_CLAY_THEME,
    });

    expect(result.converted).toBeGreaterThan(0);
    // The square is 32×32 columns, boundary included, and nothing grows on it.
    expect(result.converted).toBe(32 * 32);

    for (let z = 0; z < REGION.depth; z++) {
      for (let x = 0; x < REGION.width; x++) {
        const k = idx(x, z);
        const within = x >= 16 && x <= 47 && z >= 16 && z <= 47;
        if (within) expect(plan.surface[k]).not.toBe(before[k]);
        else expect(plan.surface[k]).toBe(before[k]);
      }
    }
  });

  it("is a byte-for-byte identity when no circuit was built", () => {
    const { stack, palette, plan } = harness();
    const before = Int32Array.from(plan.surface);
    const result = layUrbanFloor({ plan, palette, stack, seed: 1234, circuits: [], theme: SUN_CLAY_THEME });
    expect(result).toEqual({ converted: 0, kept: 0, claimed: 0 });
    expect(Array.from(plan.surface)).toEqual(Array.from(before));
  });

  it("writes the surface only — never the ground, the fluid or the snow", () => {
    const { stack, palette, plan } = harness();
    const ground = Int32Array.from(plan.ground);
    const fluidTop = Int32Array.from(plan.fluidTop);
    const snow = Uint8Array.from(plan.snow);
    const soil = Uint8Array.from(plan.soil);
    layUrbanFloor({ plan, palette, stack, seed: 3, circuits: [SQUARE], theme: SUN_CLAY_THEME });
    expect(Array.from(plan.ground)).toEqual(Array.from(ground));
    expect(Array.from(plan.fluidTop)).toEqual(Array.from(fluidTop));
    expect(Array.from(plan.snow)).toEqual(Array.from(snow));
    expect(Array.from(plan.soil)).toEqual(Array.from(soil));
  });

  it("is deterministic: two runs from one seed agree column for column", () => {
    const a = harness();
    const b = harness();
    layUrbanFloor({ plan: a.plan, palette: a.palette, stack: a.stack, seed: 99, circuits: [SQUARE], theme: SUN_CLAY_THEME });
    layUrbanFloor({ plan: b.plan, palette: b.palette, stack: b.stack, seed: 99, circuits: [SQUARE], theme: SUN_CLAY_THEME });
    expect(Array.from(a.plan.surface)).toEqual(Array.from(b.plan.surface));
  });

  it("leaves water, and every surface somebody already dressed, alone", () => {
    const { stack, palette, plan } = harness();
    const stone = stack.blockByName("minecraft:stone_bricks")?.stateId ?? 0;
    // A paved lane and a pond, both inside the circuit.
    for (let x = 20; x <= 40; x++) plan.surface[idx(x, 30)] = stone;
    for (let x = 20; x <= 24; x++) {
      plan.fluidKind[idx(x, 35)] = FluidKind.WATER;
    }
    layUrbanFloor({ plan, palette, stack, seed: 5, circuits: [SQUARE], theme: SUN_CLAY_THEME });
    for (let x = 20; x <= 40; x++) expect(plan.surface[idx(x, 30)]).toBe(stone);
    const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
    for (let x = 20; x <= 24; x++) expect(plan.surface[idx(x, 35)]).toBe(grass);
  });
});

/* -------------------------------------------------------------------------- */
/* 2 — green survives as gardens                                               */
/* -------------------------------------------------------------------------- */

describe("deliberate green survives", () => {
  const grassOf = (stack: PrismarineStack): number =>
    stack.blockByName("minecraft:grass_block")?.stateId ?? 0;

  it("keeps the grass under a plant and inside its halo", () => {
    const { stack, palette, plan } = harness();
    const grass = grassOf(stack);
    const poppy = stack.blockByName("minecraft:poppy")?.stateId ?? 0;
    const decor: FloorBlock[] = [{ x: 30, y: 65, z: 30, stateId: poppy }];
    const result = layUrbanFloor({
      plan,
      palette,
      stack,
      seed: 11,
      circuits: [SQUARE],
      theme: SUN_CLAY_THEME,
      decor,
    });

    const kept = (2 * PLANT_HALO + 1) ** 2;
    expect(result.kept).toBe(kept);
    for (let dz = -PLANT_HALO; dz <= PLANT_HALO; dz++) {
      for (let dx = -PLANT_HALO; dx <= PLANT_HALO; dx++) {
        expect(plan.surface[idx(30 + dx, 30 + dz)]).toBe(grass);
      }
    }
    // One column past the halo has converted.
    expect(plan.surface[idx(30 + PLANT_HALO + 1, 30)]).not.toBe(grass);
  });

  it("keeps a wider halo under a tree", () => {
    const { stack, palette, plan } = harness();
    const grass = grassOf(stack);
    layUrbanFloor({
      plan,
      palette,
      stack,
      seed: 12,
      circuits: [SQUARE],
      theme: SUN_CLAY_THEME,
      trees: [{ x: 30, z: 30 }],
    });
    expect(plan.surface[idx(30 + TREE_HALO, 30)]).toBe(grass);
    expect(plan.surface[idx(30 + TREE_HALO + 1, 30)]).not.toBe(grass);
  });

  it("keeps a garden's whole lawn, not a speckle of it", () => {
    const { stack, palette, plan } = harness();
    const grass = grassOf(stack);
    const flower = stack.blockByName("minecraft:cornflower")?.stateId ?? 0;
    // A cottage garden at the density `structures/grounds.ts` plants one:
    // roughly one column in five carries a flower. Every column of the plot
    // must stay green, not only the planted ones.
    const laid: FloorBlock[] = [];
    for (let z = 25; z <= 34; z++) {
      for (let x = 25; x <= 34; x++) {
        if ((x * 7 + z * 3) % 5 === 0) laid.push({ x, y: 65, z, stateId: flower });
      }
    }
    layUrbanFloor({ plan, palette, stack, seed: 13, circuits: [SQUARE], theme: SUN_CLAY_THEME, laid });
    for (let z = 27; z <= 32; z++) {
      for (let x = 27; x <= 32; x++) expect(plan.surface[idx(x, z)]).toBe(grass);
    }
  });

  it("gives an ambient tuft its own column and no border", () => {
    // The measurement behind the rule: the town green speckles a settlement's
    // whole unbuilt ground with tufts, so a border round every one of them kept
    // three quarters of Troy's interior green — the walk would have seen no
    // change at all. A tuft still keeps its own soil; it just does not claim
    // the street around it.
    const { stack, palette, plan } = harness();
    const grass = grassOf(stack);
    const tuft = stack.blockByName("minecraft:short_grass")?.stateId ?? 0;
    expect(isTuftBlock(stack, tuft)).toBe(true);
    expect(isTuftBlock(stack, stack.blockByName("minecraft:poppy")?.stateId ?? 0)).toBe(false);
    layUrbanFloor({
      plan,
      palette,
      stack,
      seed: 16,
      circuits: [SQUARE],
      theme: SUN_CLAY_THEME,
      decor: [{ x: 30, y: 65, z: 30, stateId: tuft }],
    });
    expect(plan.surface[idx(30, 30)]).toBe(grass);
    expect(plan.surface[idx(31, 30)]).not.toBe(grass);
  });

  it("does not treat a timber wall as a plant", () => {
    // The trap this guards: half the shipped themes build in logs and planks,
    // and a `log`-matching plant test would green two columns of street around
    // every cottage in a walled village.
    const { stack, palette, plan } = harness();
    const grass = grassOf(stack);
    const log = stack.blockByName("minecraft:oak_log")?.stateId ?? 0;
    const planks = stack.blockByName("minecraft:oak_planks")?.stateId ?? 0;
    expect(isPlantBlock(stack, log)).toBe(false);
    expect(isPlantBlock(stack, planks)).toBe(false);
    expect(isPlantBlock(stack, stack.blockByName("minecraft:oak_leaves")?.stateId ?? 0)).toBe(false);
    layUrbanFloor({
      plan,
      palette,
      stack,
      seed: 14,
      circuits: [SQUARE],
      theme: SUN_CLAY_THEME,
      laid: [{ x: 30, y: 65, z: 30, stateId: log }],
    });
    // The wall's own column is claimed and untouched; its neighbour is floor.
    expect(plan.surface[idx(30, 30)]).toBe(grass);
    expect(plan.surface[idx(32, 30)]).not.toBe(grass);
  });

  it("never repaints under a block somebody laid", () => {
    const { stack, palette, plan } = harness();
    const grass = grassOf(stack);
    const stone = stack.blockByName("minecraft:stone_bricks")?.stateId ?? 0;
    const result = layUrbanFloor({
      plan,
      palette,
      stack,
      seed: 15,
      circuits: [SQUARE],
      theme: SUN_CLAY_THEME,
      laid: [{ x: 20, y: 64, z: 20, stateId: stone }],
    });
    expect(plan.surface[idx(20, 20)]).toBe(grass);
    expect(result.claimed).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 3 — the tones are the town's own                                            */
/* -------------------------------------------------------------------------- */

describe("the floor palette is derived from the theme", () => {
  const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;

  it("takes its earth, grit and flag from the theme's ground roles", () => {
    for (const theme of ALL_MATERIAL_THEMES) {
      const roles = groundMaterials(theme);
      const tones = floorTones(theme, palette, stack);
      expect(tones.earth).toBe(stack.blockByName(roles.bank)?.stateId);
      expect(tones.grit).toBe(stack.blockByName(roles.scree)?.stateId);
      expect(tones.flag).toBe(stack.blockByName(roles.tread)?.stateId);
      expect(tones.trodden).toBe(palette.state("road.surface"));
    }
  });

  it("gives the sun-clay town a sandstone floor and a timber town a stone one", () => {
    const sun = floorTones(SUN_CLAY_THEME, palette, stack);
    expect(stack.blockNameByStateId(sun.flag)).toBe("sandstone");
    const timber = floorTones(MATERIAL_THEMES[0] as MaterialTheme, palette, stack);
    expect(stack.blockNameByStateId(timber.flag)).toBe("stone_bricks");
  });

  it("lays a dry town's floor paler than a wet town's", () => {
    // Not a table lookup: the mix itself is chosen by the theme's own
    // `aridAmbient` declaration, so the dry town takes more grit and flag and
    // less dark trodden earth.
    const dry = harness();
    const wet = harness();
    layUrbanFloor({ ...dry, seed: 21, circuits: [SQUARE], theme: SUN_CLAY_THEME });
    layUrbanFloor({ ...wet, seed: 21, circuits: [SQUARE], theme: { ...SUN_CLAY_THEME, aridAmbient: false } });
    const tones = floorTones(SUN_CLAY_THEME, dry.palette, dry.stack);
    const count = (plan: ColumnPlan, state: number): number => {
      let n = 0;
      for (const s of plan.surface) if (s === state) n++;
      return n;
    };
    expect(count(dry.plan, tones.trodden)).toBeLessThan(count(wet.plan, tones.trodden));
    expect(count(dry.plan, tones.flag)).toBeGreaterThan(count(wet.plan, tones.flag));
  });

  it("uses graded earth rather than a path under snow", () => {
    // A snow layer reverts `dirt_path` to `dirt` on load, so the trodden tone
    // is withheld from a snowed column.
    const { stack: s, palette: p, plan } = harness();
    plan.snow.fill(1);
    const tones = floorTones(SUN_CLAY_THEME, p, s);
    layUrbanFloor({ plan, palette: p, stack: s, seed: 22, circuits: [SQUARE], theme: SUN_CLAY_THEME });
    for (const surface of plan.surface) expect(surface).not.toBe(tones.trodden);
  });

  it("only ever converts bare turf", () => {
    const { stack: s, palette: p } = harness();
    const turf = turfStates(p, s);
    expect(turf.has(s.blockByName("minecraft:grass_block")?.stateId ?? -1)).toBe(true);
    for (const name of ["minecraft:podzol", "minecraft:gravel", "minecraft:sand", "minecraft:dirt_path"]) {
      expect(turf.has(s.blockByName(name)?.stateId ?? -1)).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 4 — the ring test                                                           */
/* -------------------------------------------------------------------------- */

describe("point-in-circuit", () => {
  it("answers the same either way round the ring", () => {
    const reversed = [...SQUARE].reverse();
    const o1 = ringOrientation(SQUARE);
    const o2 = ringOrientation(reversed);
    expect(o1).toBe(-o2);
    for (const [x, z] of [
      [30, 30],
      [16, 16],
      [47, 47],
      [15, 30],
      [48, 30],
      [30, 60],
    ] as const) {
      expect(insideRing(SQUARE, o1, x, z)).toBe(insideRing(reversed, o2, x, z));
    }
  });

  it("includes the boundary and excludes the column outside it", () => {
    const o = ringOrientation(SQUARE);
    expect(insideRing(SQUARE, o, 16, 16)).toBe(true);
    expect(insideRing(SQUARE, o, 15, 16)).toBe(false);
    expect(insideRing(SQUARE, o, 47, 47)).toBe(true);
    expect(insideRing(SQUARE, o, 48, 47)).toBe(false);
  });

  it("handles a non-rectangular convex ring", () => {
    // An octagon, which is what a 24-direction support hull actually produces.
    const octagon: readonly FloorPoint[] = [
      { x: 20, z: 10 },
      { x: 40, z: 10 },
      { x: 50, z: 20 },
      { x: 50, z: 40 },
      { x: 40, z: 50 },
      { x: 20, z: 50 },
      { x: 10, z: 40 },
      { x: 10, z: 20 },
    ];
    const o = ringOrientation(octagon);
    expect(insideRing(octagon, o, 30, 30)).toBe(true);
    // The clipped corners are outside.
    expect(insideRing(octagon, o, 11, 11)).toBe(false);
    expect(insideRing(octagon, o, 49, 49)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 5 — the arid ambient bias                                                   */
/* -------------------------------------------------------------------------- */

describe("the arid ambient biome bias", () => {
  const warm = { arid: true, authored: false, temperature: 0.8 } as const;

  it("is declared on the theme, and only the sun-clay theme declares it", () => {
    expect(SUN_CLAY_THEME.aridAmbient).toBe(true);
    for (const theme of ALL_MATERIAL_THEMES) {
      if (theme.id === SUN_CLAY_THEME.id) continue;
      expect(theme.aridAmbient).toBeUndefined();
    }
  });

  it("moves the derived grassland family into the savanna family", () => {
    expect(aridAmbientBiome("minecraft:plains", warm)).toBe("minecraft:savanna");
    expect(aridAmbientBiome("minecraft:windswept_hills", warm)).toBe("minecraft:windswept_savanna");
  });

  it("leaves woodland, rock, sand, snow and water exactly as derived", () => {
    for (const biome of [
      "minecraft:forest",
      "minecraft:taiga",
      "minecraft:stony_peaks",
      "minecraft:snowy_slopes",
      "minecraft:beach",
      "minecraft:ocean",
      "minecraft:river",
      "minecraft:basalt_deltas",
    ] as const) {
      expect(aridAmbientBiome(biome, warm)).toBe(biome);
    }
  });

  it("is identity for a theme that does not declare itself arid", () => {
    for (const biome of ["minecraft:plains", "minecraft:windswept_hills"] as const) {
      expect(aridAmbientBiome(biome, { ...warm, arid: false })).toBe(biome);
    }
  });

  it("yields to an authored climate — explicit intent always wins", () => {
    for (const biome of ["minecraft:plains", "minecraft:windswept_hills"] as const) {
      expect(aridAmbientBiome(biome, { ...warm, authored: true })).toBe(biome);
    }
  });

  describe("what counts as an authored climate", () => {
    it("yields to a lush, cold or wet biome named out loud", () => {
      for (const biome of [
        "minecraft:snowy_plains",
        "minecraft:snowy_taiga",
        "minecraft:taiga",
        "minecraft:swamp",
        "minecraft:jungle",
        "minecraft:frozen_peaks",
      ]) {
        expect(climateOutranksArid({ biome })).toBe(true);
      }
    });

    it("yields to a snow policy of always, and to a real cold or wet offset", () => {
      expect(climateOutranksArid({ snow: "always" })).toBe(true);
      expect(climateOutranksArid({ temperature: ARID_COLD_OFFSET })).toBe(true);
      expect(climateOutranksArid({ humidity: ARID_WET_OFFSET })).toBe(true);
    });

    it("does not yield to Troy's own document", () => {
      // The world this feature was built for: an authored `beach` (which names
      // the settlement's ground and is honoured by the clamp at rung 1), a warm
      // offset, and a humidity *nudge* on a prompt that says "warm dry Aegean".
      // A gate that fired on any of those would switch the fix off for the very
      // walk that asked for it.
      expect(
        climateOutranksArid({
          biome: "minecraft:beach",
          snow: "never",
          temperature: 0.5,
          humidity: 0.3,
        }),
      ).toBe(false);
    });

    it("does not yield to an empty climate", () => {
      expect(climateOutranksArid({})).toBe(false);
    });
  });

  it("leaves a cold column temperate even in a dry-themed world", () => {
    expect(aridAmbientBiome("minecraft:plains", { ...warm, temperature: 0.2 })).toBe(
      "minecraft:plains",
    );
  });

  it("names only biomes the emitter carries", () => {
    const table: readonly ProfileBiome[] = ["minecraft:savanna", "minecraft:windswept_savanna"];
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    for (const biome of table) expect(stack.biomeIdByName(biome)).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* 6 — a compiled walled world                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The Terrarium's own walled-quarter station, which is the one station in the
 * tree that rings itself — so it is the one world whose floor this feature is
 * supposed to move, and the walk a reviewer will take.
 */
describe("the walled-quarter station", () => {
  let report: TerrainCompileReport;
  let dir: string;
  let physics: PhysicsReport;
  let columnPlan: ColumnPlan;
  let palette: Palette;

  beforeAll(async () => {
    const spec = multiStationSpecs().find((s) => s.id === "multi__walled_quarter");
    dir = await mkdtemp(path.join(tmpdir(), "terrainist-urban-floor-"));
    const world = path.join(dir, "walled_quarter");
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    let plan: ColumnPlan | undefined;
    const compiled = await compileTerrain((spec as NonNullable<typeof spec>).document, {
      outDir: world,
      onColumnPlan: (p) => {
        plan = p;
      },
    });
    if (!compiled.ok) throw new Error("the walled-quarter station did not compile");
    report = compiled.report;
    const structures = report.layout?.structures as StructurePassResult;
    const columns = plan as ColumnPlan;
    columnPlan = columns;
    palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    physics = await lintWorldPhysics(world, stack, {
      buildings: structures.buildings as never,
      roads: (structures.roads?.routes ?? []) as never,
      tunnels: structures.tunnels.map((t) => ({
        id: t.id,
        from: t.endpoints[0],
        to: t.endpoints[1],
      })),
      terrainTop: {
        x0: columns.region.x0,
        z0: columns.region.z0,
        width: columns.region.width,
        depth: columns.region.depth,
        ground: columns.ground,
        entrances:
          (columns.caves as { entranceColumns?: Uint8Array } | undefined)?.entranceColumns ??
          new Uint8Array(columns.region.width * columns.region.depth),
      },
    });
  }, 300_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("floors the quarter inside its circuit, and keeps green where green grows", () => {
    const floor = report.stats.urbanFloor;
    expect(floor).toBeDefined();
    expect((floor as NonNullable<typeof floor>).converted).toBeGreaterThan(0);
    expect((floor as NonNullable<typeof floor>).kept).toBeGreaterThan(0);
  });

  /**
   * The rule this asserts is *"nothing stands unsupported on a floor this pass
   * laid"* rather than "the station lints zero", and the difference is one
   * finding that has nothing to do with the floor: compiled **standalone**
   * (rather than transplanted onto its Terrarium platform, which is how
   * `terrarium.test.ts` lints it) the station puts a potted poppy on a fence at
   * `14,-61` — one column *outside the terrain region*, where there is no ground
   * at all and this pass cannot reach. Asserting a flat zero here would pin a
   * defect that is neither this feature's nor this file's.
   */
  it("leaves nothing unsupported on the floor it laid", () => {
    const tones = floorTones(
      materialThemeById(report.stats.structures?.theme),
      palette as Palette,
      loadPrismarine(EMIT_MINECRAFT_VERSION),
    );
    const laid = new Set<number>([tones.trodden, tones.earth, tones.grit, tones.flag]);
    const r = columnPlan.region;
    const onFloor = physics.findings.filter((f) => {
      const i = f.x - r.x0;
      const j = f.z - r.z0;
      if (i < 0 || j < 0 || i >= r.width || j >= r.depth) return false;
      return laid.has(columnPlan.surface[j * r.width + i] as number);
    });
    expect(onFloor.map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}`)).toEqual([]);
  });

  it("finds nothing wrong anywhere the terrain reaches", () => {
    const r = columnPlan.region;
    const inRegion = physics.findings.filter(
      (f) => f.x >= r.x0 && f.z >= r.z0 && f.x < r.x0 + r.width && f.z < r.z0 + r.depth,
    );
    expect(inRegion.map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}`)).toEqual([]);
    for (const rule of PHYSICS_RULES) expect(physics.counts[rule], rule).toBeLessThanOrEqual(1);
  });

  it("agrees with itself across two compiles", async () => {
    const spec = multiStationSpecs().find((s) => s.id === "multi__walled_quarter");
    const again = await compileTerrain((spec as NonNullable<typeof spec>).document, {
      outDir: path.join(dir, "walled_quarter_2"),
    });
    expect(again.ok).toBe(true);
    expect(again.ok && again.report.stats.urbanFloor).toEqual(report.stats.urbanFloor);
  }, 180_000);
});

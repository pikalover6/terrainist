/**
 * **Multi-level ground** — `docs/COURTYARDS-AND-LEVELS-v0.md` §3, WP-B.
 *
 * Three layers, and the third is the one that matters:
 *
 * 1. `layout/platforms.ts` — the block-median construction (§3.3): does a
 *    quarter's ground come out as whole storeys, does a block whose relief
 *    exceeds one storey split, and is the answer a pure function of the field.
 * 2. `structures/retaining.ts` — the wall (§3.4): does a seam of a buildable
 *    drop get a stone face, does a tall one get a rail, does a shallow one get
 *    a kerb and not a wall, and is a seam under a building left alone.
 * 3. **A compiled world.** Phase 4.1 shipped three defects that passed every
 *    unit test and were only exposed by compiling — the piece was correct and
 *    the *composition* was not. So the last describe compiles a stepped quarter
 *    end to end, reads the world back off disk, and runs all twenty-six physics
 *    rules over it. Retaining walls and split-level blocks are exactly where a
 *    floating block, an unsupported chain or unreachable ground would appear.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nodeSeed } from "@terrainist/stdlib";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  NO_PLATFORM,
  RETAIN_MAX,
  RETAIN_RAIL,
  groundLevelsOf,
  levelSeams,
  treatmentForDrop,
} from "../src/layout/levels.js";
import { MIN_PLATFORM_COLUMNS, derivePlatforms } from "../src/layout/platforms.js";
import { FLOOR_HEIGHT } from "../src/layout/district.js";
import type { FormBench } from "../src/layout/forms/types.js";
import { RETAINING_PROFILE, retainingProfile } from "../src/structures/profiles.js";
import { buildRetainingWalls } from "../src/structures/retaining.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { resolvePalette } from "../src/terrain/palette.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";

/* -------------------------------------------------------------------------- */
/* 1. platforms from blocks (§3.3)                                             */
/* -------------------------------------------------------------------------- */

const BOUNDS = { x0: 0, z0: 0, x1: 63, z1: 63 } as const;

/**
 * A field over {@link BOUNDS} whose height is a function of `x` only — a clean
 * ramp, so every assertion below is about the construction and not about noise.
 */
function ramp(rise: (x: number) => number) {
  const values = new Float64Array(64 * 64);
  for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) values[z * 64 + x] = rise(x);
  return { region: { x0: 0, z0: 0, width: 64, depth: 64 }, values } as never;
}

/** A `blocked` mask with `count` streets cut across it, one column wide. */
function streets(at: readonly number[]): Uint8Array {
  const blocked = new Uint8Array(64 * 64);
  for (const x of at) for (let z = 0; z < 64; z++) blocked[z * 64 + x] = 1;
  return blocked;
}

describe("derivePlatforms — the block-median construction", () => {
  it("gives each block its own platform, quantised to whole storeys", () => {
    // Four blocks across a slope that climbs one block every two columns: 32
    // blocks of relief over the quarter, ~8 across each block.
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: streets([15, 31, 47]),
      field: ramp((x) => 70 + x / 2),
    });
    expect(benches.length).toBeGreaterThan(1);
    for (const bench of benches) {
      // Every level is a whole storey above the quarter's base, which is what
      // makes a party wall and a cornice step cleanly rather than by three
      // blocks. `base` is the lowest column, 70.
      expect((bench.level - 70) % FLOOR_HEIGHT).toBe(0);
    }
  });

  it("splits a block whose own relief exceeds a storey", () => {
    // One block, no streets, eight blocks of relief. It cannot be one platform.
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: new Uint8Array(64 * 64),
      field: ramp((x) => 70 + x / 8),
    });
    expect(benches.length).toBeGreaterThan(1);
    const levels = new Set(benches.map((b) => b.level));
    expect(levels.size).toBeGreaterThan(1);
  });

  it("never emits a platform smaller than a platform", () => {
    const benches = derivePlatforms({
      bounds: BOUNDS,
      blocked: new Uint8Array(64 * 64),
      field: ramp((x) => 70 + x / 8),
    });
    for (const bench of benches) {
      let columns = 0;
      for (const run of bench.runs) columns += run.x1 - run.x0 + 1;
      expect(columns).toBeGreaterThanOrEqual(MIN_PLATFORM_COLUMNS);
    }
  });

  it("says nothing at all on ground that does not step", () => {
    // One platform is no platform: the caller reports `DISTRICT_GROUND` and
    // compiles the quarter as the pad it turned out to be.
    expect(
      derivePlatforms({
        bounds: BOUNDS,
        blocked: streets([31]),
        field: ramp(() => 70),
      }),
    ).toEqual([]);
    expect(
      derivePlatforms({
        bounds: BOUNDS,
        blocked: streets([31]),
        field: ramp((x) => 70 + x / 64),
      }),
    ).toEqual([]);
  });

  it("is a pure function of the field", () => {
    const once = derivePlatforms({
      bounds: BOUNDS,
      blocked: streets([15, 31, 47]),
      field: ramp((x) => 70 + x / 2),
    });
    const twice = derivePlatforms({
      bounds: BOUNDS,
      blocked: streets([15, 31, 47]),
      field: ramp((x) => 70 + x / 2),
    });
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the seams those platforms make (§3.1, §3.4)                              */
/* -------------------------------------------------------------------------- */

describe("derived platforms and the seams between them", () => {
  const benches = derivePlatforms({
    bounds: BOUNDS,
    blocked: new Uint8Array(64 * 64),
    field: ramp((x) => 70 + x / 8),
  });
  const levels = groundLevelsOf(BOUNDS, benches);

  it("covers the free ground with platforms", () => {
    expect(levels).not.toBeNull();
    expect((levels as NonNullable<typeof levels>).levelY.length).toBe(benches.length);
  });

  it("puts every 4-adjacent pair of differing platforms in exactly one seam", () => {
    const field = levels as NonNullable<typeof levels>;
    const seams = levelSeams(field);
    const covered = new Set<string>();
    for (const seam of seams) {
      for (const cell of seam.cells) covered.add(`${cell.x},${cell.z}:${seam.above}`);
    }
    for (let z = BOUNDS.z0; z <= BOUNDS.z1; z++) {
      for (let x = BOUNDS.x0; x <= BOUNDS.x1; x++) {
        const here = field.at(x, z);
        if (here === NO_PLATFORM) continue;
        const hy = field.levelY[here] as number;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = field.at(x + dx, z + dz);
          if (n === NO_PLATFORM || n === here) continue;
          if ((field.levelY[n] as number) <= hy) continue;
          expect(covered.has(`${x},${z}:${n}`)).toBe(true);
        }
      }
    }
  });

  it("gives every seam a treatment its drop justifies", () => {
    for (const seam of levelSeams(levels as NonNullable<typeof levels>)) {
      expect(seam.treatment).toBe(treatmentForDrop(seam.drop));
      expect(seam.drop).toBeGreaterThan(0);
    }
    expect(treatmentForDrop(1)).toBe("kerb");
    expect(treatmentForDrop(RETAIN_MAX)).toBe("retaining");
    expect(treatmentForDrop(RETAIN_MAX + 1)).toBe("bank");
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the profile (§3.4)                                                       */
/* -------------------------------------------------------------------------- */

describe("RETAINING_PROFILE", () => {
  it("is asymmetric, one column of face and one of verge", () => {
    expect(RETAINING_PROFILE.asymmetric).toBe(true);
    expect(RETAINING_PROFILE.bands.map((b) => b.id)).toEqual(["face", "verge"]);
    for (const band of RETAINING_PROFILE.bands) expect(band.width).toBe(1);
    // A seam component can run between two different platform pairs along its
    // length, so the datum steps rather than holding one level.
    expect(RETAINING_PROFILE.follow).toBe("step");
    expect(RETAINING_PROFILE.crossing).toBe("stop");
  });

  it("rails a wall you could walk off, and only that one", () => {
    expect(retainingProfile(RETAIN_RAIL - 1, RETAIN_RAIL, "stone_brick_wall")).toBe(
      RETAINING_PROFILE,
    );
    const railed = retainingProfile(RETAIN_RAIL, RETAIN_RAIL, "stone_brick_wall");
    const face = railed.bands.find((b) => b.id === "face");
    expect(face?.cap?.rail).toBe(true);
    // Never on the verge: a rail one column back from the edge is a fence in
    // the middle of a terrace.
    expect(railed.bands.find((b) => b.id === "verge")?.cap).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* 4. the pass, on a synthetic plan (§3.4)                                     */
/* -------------------------------------------------------------------------- */

const REGION = { x0: 0, z0: 0, width: 48, depth: 48 } as const;

/** A dry plan with a step at `x === 24`: the low side at 64, the high at `top`. */
function steppedPlan(stack: PrismarineStack, top: number): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
  const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
  const ground = new Int32Array(n);
  for (let z = 0; z < REGION.depth; z++) {
    for (let x = 0; x < REGION.width; x++) ground[z * REGION.width + x] = x < 24 ? 64 : top;
  }
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

/** Two platforms either side of `x === 24`, as a form would declare them. */
function twoPlatforms(top: number): FormBench[] {
  return [
    { id: "low", runs: rowsOf(0, 23), level: 64 },
    { id: "high", runs: rowsOf(24, 47), level: top },
  ];
}

function rowsOf(x0: number, x1: number) {
  const runs = [];
  for (let z = 0; z < REGION.depth; z++) runs.push({ x0, z0: z, x1, z1: z });
  return runs;
}

/** The quarter as the pass reads one, with no streets anywhere near the seam. */
function district(top: number) {
  const bounds = { x0: 0, z0: 0, x1: 47, z1: 47 };
  const benches = twoPlatforms(top);
  const levels = groundLevelsOf(bounds, benches);
  return {
    nodePath: "world.quarter",
    bounds,
    carriageway: new Uint8Array(48 * 48),
    sidewalk: new Uint8Array(48 * 48),
    levels: levels as NonNullable<typeof levels>,
    seams: levelSeams(levels as NonNullable<typeof levels>),
  };
}

describe("buildRetainingWalls", () => {
  let stack: PrismarineStack;
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  const paletteOf = (s: PrismarineStack) => resolvePalette(s, undefined, nodeSeed(7n, "world")).palette;

  it("returns untouched when no quarter declared platforms", () => {
    const plan = steppedPlan(stack, 64);
    const result = buildRetainingWalls({
      districts: [
        {
          nodePath: "world.quarter",
          bounds: { x0: 0, z0: 0, x1: 47, z1: 47 },
          carriageway: new Uint8Array(48 * 48),
          sidewalk: new Uint8Array(48 * 48),
        },
      ],
      plan,
      palette: paletteOf(stack),
      stack,
    });
    expect(result.blocks).toEqual([]);
    expect(result.walls).toBe(0);
    expect(result.seam.some((v) => v === 1)).toBe(false);
  });

  it("builds a face along a seam of a buildable drop", () => {
    const top = 64 + 4;
    const plan = steppedPlan(stack, top);
    const result = buildRetainingWalls({
      districts: [district(top)],
      plan,
      palette: paletteOf(stack),
      stack,
    });
    expect(result.walls).toBeGreaterThan(0);
    expect(result.wallColumns).toBeGreaterThan(0);
    // The face is the lowest row of the *upper* platform, held at the upper
    // level: it must never stand on the platform below, which would eat it.
    for (const block of result.blocks) expect(block.x).toBeGreaterThanOrEqual(24);
    // Every wall column is in the seam mask the surfacer is handed.
    let masked = 0;
    for (const v of result.seam) masked += v === 1 ? 1 : 0;
    expect(masked).toBeGreaterThanOrEqual(result.wallColumns);
    // The coping is a real block at the wall's own top, not only a plan column.
    const coping = result.blocks.filter((b) => b.y === top);
    expect(coping.length).toBeGreaterThan(0);
  });

  it("never paints the wall with air", () => {
    // Measured, and it is the whole reason the pass resolves the profile's
    // symbols itself: `sweep`'s `stateOf` takes a palette symbol *or* a
    // Minecraft block name, and a dotted symbol the theme's palette does not
    // carry is neither — `blockByName("street.curb")` is `undefined`, which is
    // state 0, which is air. It painted the top course of every wall in a
    // compiled quarter with air, and the physics lint found it as unsupported
    // fence posts on the platform behind.
    const top = 64 + 4;
    const plan = steppedPlan(stack, top);
    const result = buildRetainingWalls({
      districts: [district(top)],
      plan,
      palette: paletteOf(stack),
      stack,
    });
    expect(result.wallColumns).toBeGreaterThan(0);
    for (let k = 0; k < result.seam.length; k++) {
      if (result.seam[k] !== 1) continue;
      expect(plan.surface[k], `column ${k}`).not.toBe(0);
      expect(plan.subsurface[k], `column ${k}`).not.toBe(0);
    }
    for (const block of result.blocks) expect(block.stateId).not.toBe(0);
  });

  it("rails a wall you could walk off and does not rail one you could not", () => {
    const tall = 64 + RETAIN_RAIL + 1;
    const railed = buildRetainingWalls({
      districts: [district(tall)],
      plan: steppedPlan(stack, tall),
      palette: paletteOf(stack),
      stack,
    });
    expect(railed.blocks.some((b) => b.y === tall + 1)).toBe(true);

    const short = 64 + 2;
    const plain = buildRetainingWalls({
      districts: [district(short)],
      plan: steppedPlan(stack, short),
      palette: paletteOf(stack),
      stack,
    });
    expect(plain.walls).toBeGreaterThan(0);
    expect(plain.blocks.some((b) => b.y === short + 1)).toBe(false);
  });

  it("lays a kerb, not a wall, for a drop of one", () => {
    const plan = steppedPlan(stack, 65);
    const result = buildRetainingWalls({
      districts: [district(65)],
      plan,
      palette: paletteOf(stack),
      stack,
    });
    expect(result.kerbs).toBeGreaterThan(0);
    expect(result.walls).toBe(0);
    expect(result.blocks).toEqual([]);
  });

  it("leaves a seam a building already stands on to the building", () => {
    const top = 64 + 4;
    const plan = steppedPlan(stack, top);
    const result = buildRetainingWalls({
      districts: [district(top)],
      plan,
      palette: paletteOf(stack),
      stack,
      // A terrace standing the whole length of the face: its own foundation
      // skirt is the wall, and a second wall in front of it is a second wall.
      footprints: [{ x0: 24, z0: 0, x1: 26, z1: 47 }],
    });
    expect(result.built).toBeGreaterThan(0);
    expect(result.walls).toBe(0);
  });

  it("grades a bank rather than leaving a cliff, and says so", () => {
    const top = 64 + RETAIN_MAX + 4;
    const plan = steppedPlan(stack, top);
    const before = Int32Array.from(plan.ground);
    const result = buildRetainingWalls({
      districts: [district(top)],
      plan,
      palette: paletteOf(stack),
      stack,
    });
    expect(result.banks).toBeGreaterThan(0);
    expect(result.diagnostics.some((d) => d.name === "RETAINING_REFUSED")).toBe(true);
    // Something moved on the low side, and nothing was lowered anywhere.
    let raised = 0;
    for (let k = 0; k < before.length; k++) {
      expect(plan.ground[k] as number).toBeGreaterThanOrEqual(before[k] as number);
      if ((plan.ground[k] as number) > (before[k] as number)) raised++;
    }
    expect(raised).toBeGreaterThan(0);
  });

  it("skips a seam a street *crosses*, and only for as long as it is street", () => {
    const top = 64 + 4;
    const quarter = district(top);
    // A flight climbing *through* the seam: a band perpendicular to it, so the
    // walk back into the platform is street all the way and finds no ground.
    // There the street is the connection between the levels and a wall across
    // it would be a wall across a road.
    const carriageway = new Uint8Array(48 * 48);
    for (let z = 20; z <= 26; z++) for (let x = 20; x < 48; x++) carriageway[z * 48 + x] = 1;
    const result = buildRetainingWalls({
      districts: [{ ...quarter, carriageway }],
      plan: steppedPlan(stack, top),
      palette: paletteOf(stack),
      stack,
    });
    // The crossing stays open — no coping over the carriageway — and the rest
    // of the seam is still walled.
    for (const block of result.blocks) {
      expect(carriageway[block.z * 48 + block.x], `${block.x},${block.z}`).not.toBe(1);
    }
    expect(result.wallColumns).toBeGreaterThan(30);
    expect(result.unfaced.street).toBeGreaterThan(0);
  });

  /**
   * **The 85%.** A contour street runs *along* the seam, which is what a
   * `terraced` quarter looks like everywhere — its bench field partitions the
   * whole quarter, streets included. The face, the lowest row of the upper
   * platform, is therefore carriageway for its whole length, and the pass used
   * to skip it whole: measured on `stepped_hilltown`, 2,489 seam columns
   * classified `retaining` and 365 walled. What was left standing beside the
   * road was the raw dirt face the walk reported.
   *
   * A street *along* a seam is not the connection between its levels — it is
   * the thing the wall holds the ground above. So the wall steps back to the
   * first free column of the platform and is faced end to end.
   */
  it("faces a seam a street runs along, end to end, behind the pavement", () => {
    const top = 64 + 4;
    const quarter = district(top);
    const carriageway = new Uint8Array(48 * 48);
    for (let z = 0; z < 48; z++) for (let x = 24; x <= 29; x++) carriageway[z * 48 + x] = 1;
    const result = buildRetainingWalls({
      districts: [{ ...quarter, carriageway }],
      plan: steppedPlan(stack, top),
      palette: paletteOf(stack),
      stack,
    });
    // End to end: the seam is 48 columns long and every one of them is faced.
    const seam = quarter.seams.reduce((n, s) => n + s.cells.length, 0);
    expect(seam).toBe(48);
    expect(result.wallColumns).toBeGreaterThanOrEqual(48);
    // Behind the pavement, never on it, and never over the platform below.
    for (const block of result.blocks) {
      expect(carriageway[block.z * 48 + block.x], `${block.x},${block.z}`).not.toBe(1);
      expect(block.x).toBeGreaterThan(29);
    }
    // And nothing is left unexplained.
    expect(result.unfaced.street).toBe(0);
  });

  it("never lays a kerb course inside a building", () => {
    // `kerbSeam` took the street mask and not the footprint mask, unlike
    // `gradeBank` and the wall path: a drop-1 seam running under a terrace
    // would have written a course of kerb across its ground floor.
    const plan = steppedPlan(stack, 65);
    const before = Int32Array.from(plan.surface);
    const result = buildRetainingWalls({
      districts: [district(65)],
      plan,
      palette: paletteOf(stack),
      stack,
      footprints: [{ x0: 0, z0: 0, x1: 23, z1: 47 }],
    });
    expect(result.kerbs).toBe(0);
    for (let k = 0; k < before.length; k++) expect(plan.surface[k]).toBe(before[k]);
  });

  it("writes the same wall twice", () => {
    const top = 64 + 4;
    const a = buildRetainingWalls({
      districts: [district(top)],
      plan: steppedPlan(stack, top),
      palette: paletteOf(stack),
      stack,
    });
    const b = buildRetainingWalls({
      districts: [district(top)],
      plan: steppedPlan(stack, top),
      palette: paletteOf(stack),
      stack,
    });
    expect(JSON.stringify(b.blocks)).toBe(JSON.stringify(a.blocks));
  });
});

/* -------------------------------------------------------------------------- */
/* 5. a compiled world — what a unit test cannot see (§8.2)                     */
/* -------------------------------------------------------------------------- */

/** A small sloped world with one `"stepped"` quarter. */
function steppedWorld(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "levels_scarp", worldSeed: 4242 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [176, 176] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 26, seaLevel: 63, baseHeight: 74, erosionPasses: 1 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "quarter",
          kind: "district",
          envelope: { shape: "region", size: [104, 104] },
          constraints: [{ zone: "center" }],
          params: {
            fabric: "grid",
            density: "medium",
            mix: ["townhouse", "cottage"],
            ground: "stepped",
          },
        },
      ],
    },
  };
}

describe("a compiled stepped quarter", () => {
  const scratch: string[] = [];
  let stack: PrismarineStack;
  let report: PhysicsReport;
  let compiled: TerrainCompileReport;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-levels-"));
    scratch.push(root);
    const dir = path.join(root, "levels_scarp");
    const out = await compileTerrain(steppedWorld(), { outDir: dir });
    if (!out.ok) throw new Error("stepped compile failed");
    compiled = out.report;
    const structures = (compiled as unknown as {
      layout?: { structures?: { buildings?: unknown[]; roads?: { routes?: unknown[] }; props?: unknown[] } };
    }).layout?.structures;
    report = await lintWorldPhysics(dir, stack, {
      buildings: (structures?.buildings ?? []) as never,
      roads: (structures?.roads?.routes ?? []) as never,
      props: (structures?.props ?? []) as never,
    });
  }, 600_000);

  afterAll(async () => {
    for (const dir of scratch) await rm(dir, { recursive: true, force: true });
  });

  it("actually stepped — the quarter came out on more than one platform", () => {
    const districts = (compiled as unknown as {
      layout?: { districts?: readonly { readonly levels?: { readonly levelY: readonly number[] } }[] };
    }).layout?.districts;
    const quarter = districts?.[0];
    // Either the quarter stepped, or it said `DISTRICT_GROUND` and did not.
    // Both are legal; a silent flat answer is not.
    const said = compiled.diagnostics.some((d) => d.name === "DISTRICT_GROUND");
    const stepped = (quarter?.levels?.levelY.length ?? 0) > 1;
    expect(stepped || said).toBe(true);
    expect(stepped).toBe(true);
  });

  it("lints zero on all twenty-six physics rules", () => {
    const first = report.findings
      .slice(0, 12)
      .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
      .join("\n");
    expect(first).toBe("");
    for (const rule of PHYSICS_RULES) expect(report.counts[rule], rule).toBe(0);
  });

  it("read back a world worth linting", () => {
    expect(report.examined).toBeGreaterThan(100_000);
  });
});

/**
 * **The shadow declarers** — `docs/GROUND-CONTRACT-v0.md` §3, §8.1 item 2.
 *
 * WP-2 converts no caller: `structures/ground-declare.ts` recomputes, from the
 * passes' own outputs, the `GroundIntent`s each pass *would* declare after
 * conversion. These tests are about that set — that it exists, that it is
 * well-formed against §2 and §4, and that it says the two things the mutating
 * pipeline does not say out loud:
 *
 * - a wall run is a `face`, from a retaining class, over columns in the region;
 * - a sidewalk's declared level is the flanking carriageway's **arc-station**
 *   level, not the `plan.ground` of a centre cell (inversion I6).
 *
 * The fixture is a stepped quarter built the way `test/street-ownership.test.ts`
 * builds one — a synthetic hillside and a real street graph, passes called
 * directly — rather than `levels.test.ts`'s `steppedWorld()` document. Same
 * shape of world, and it is the shape that matters here: `compileTerrain` hands
 * back a report, not the pass results the declarers read, and plumbing them out
 * of it is the equivalence shim's work item, not this one. The flat control is
 * the same fixture on one plane, where §8.3's `CONFLICT` set must be empty.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme, type Region } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  GROUND_TIERS,
  INTENT_RANK,
  compareIntent,
  isLegalKind,
  type GroundIntent,
} from "../src/layout/ground-contract.js";
import { groundLevelsOf, levelSeams } from "../src/layout/levels.js";
import type { FormBench } from "../src/layout/forms/types.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import { declareRetaining, levelClaimsByColumn } from "../src/structures/ground-declare.js";
import { driverForPlan, type GroundDriver } from "../src/layout/ground-driver.js";
import { dressStreets, type SegmentArc, type StreetscapeResult } from "../src/structures/streetscape.js";
import { surfaceStreetGraph, type StreetSurfaceResult } from "../src/structures/roads.js";
import { buildRetainingWalls, type RetainingPassResult } from "../src/structures/retaining.js";
import { sweep } from "../src/structures/sweep.js";
import { RETAINING_PROFILE } from "../src/structures/profiles.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette, type Palette } from "../src/terrain/palette.js";

const SIZE = 96;
const REGION: Region = { x0: -SIZE / 2, z0: -SIZE / 2, width: SIZE, depth: SIZE };
const BOUNDS = { x0: -SIZE / 2, z0: -SIZE / 2, x1: SIZE / 2 - 1, z1: SIZE / 2 - 1 } as const;
const SEA = 63;
const CELLS = SIZE * SIZE;

/** The upper platform's level, the lower one's, and the drop between them. */
const HIGH = 76;
const LOW = 70;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function planOf(stack: PrismarineStack, height: (x: number, z: number) => number): ColumnPlan {
  const grass = stack.blockByName("minecraft:grass_block")?.stateId ?? 0;
  const dirt = stack.blockByName("minecraft:dirt")?.stateId ?? 0;
  const ground = new Int32Array(CELLS);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      ground[j * SIZE + i] = height(REGION.x0 + i, REGION.z0 + j);
    }
  }
  return {
    region: REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(CELLS).fill(FluidKind.NONE),
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
    seaLevel: SEA,
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

/** The scarp: everything west of `x = 0` a storey up, everything east a storey down. */
const stepped = (x: number): number => (x < 0 ? HIGH : LOW);

/** A north–south lane crossing an east–west avenue — `street-ownership`'s fixture. */
function crossroads(): StreetGraph {
  const avenue: { x: number; z: number }[] = [];
  const lane: { x: number; z: number }[] = [];
  for (let x = -30; x <= 30; x++) avenue.push({ x, z: 0 });
  for (let z = -30; z <= 30; z++) lane.push({ x: 8, z });
  const segments: StreetSegment[] = [
    // Narrow first, so document order and rank order disagree.
    { id: "b-lane", kind: "lane", width: 3, path: lane },
    { id: "a-avenue", kind: "avenue", width: 7, path: avenue },
  ];
  return { segments, intersections: [{ x: 8, z: 0, segments: ["a-avenue", "b-lane"] }], sidewalk: 2 };
}

/** The quarter as the retaining pass reads one: two benches and the seam between. */
function steppedDistrict(graph: StreetGraph) {
  const benches: FormBench[] = [
    { id: "upper", runs: [{ x0: BOUNDS.x0, z0: BOUNDS.z0, x1: -1, z1: BOUNDS.z1 }], level: HIGH },
    { id: "lower", runs: [{ x0: 0, z0: BOUNDS.z0, x1: BOUNDS.x1, z1: BOUNDS.z1 }], level: LOW },
  ];
  const levels = groundLevelsOf(BOUNDS, benches);
  if (levels === null) throw new Error("fixture: no levels");
  return {
    nodePath: "world.quarter",
    bounds: BOUNDS,
    // The masks the pass dilates into its street clearance. Rasterized from the
    // graph rather than left empty, so the wall lands where a wall would.
    carriageway: carriagewayMask(graph),
    sidewalk: new Uint8Array(CELLS),
    levels,
    seams: levelSeams(levels),
  };
}

/** 1 on a carriageway column, row-major over `BOUNDS` (which is the region here). */
function carriagewayMask(graph: StreetGraph): Uint8Array {
  const mask = new Uint8Array(CELLS);
  for (const segment of graph.segments) {
    const half = (segment.width - 1) >> 1;
    for (const cell of segment.path) {
      for (let dx = -half; dx <= half; dx++) {
        for (let dz = -half; dz <= half; dz++) {
          const x = cell.x + dx;
          const z = cell.z + dz;
          if (x < BOUNDS.x0 || z < BOUNDS.z0 || x > BOUNDS.x1 || z > BOUNDS.z1) continue;
          mask[(z - BOUNDS.z0) * SIZE + (x - BOUNDS.x0)] = 1;
        }
      }
    }
  }
  return mask;
}

/** One run of the pipeline: retaining, then the surfacer, then the dressing. */
interface Run {
  readonly plan: ColumnPlan;
  readonly graph: StreetGraph;
  readonly retaining: RetainingPassResult;
  readonly streets: StreetSurfaceResult;
  readonly dressed: StreetscapeResult;
  /** The one accumulator, as `buildStructures` threads one (§9a.1, rule 1). */
  readonly driver: GroundDriver;
  readonly intents: readonly GroundIntent[];
}

function runPipeline(stack: PrismarineStack, palette: Palette, flat: boolean): Run {
  const plan = planOf(stack, flat ? () => LOW : (x) => stepped(x));
  const graph = crossroads();
  const district = flat
    ? {
        nodePath: "world.quarter",
        bounds: BOUNDS,
        carriageway: carriagewayMask(graph),
        sidewalk: new Uint8Array(CELLS),
        levels: groundLevelsOf(BOUNDS, [
          { id: "all", runs: [{ ...BOUNDS }], level: LOW },
        ] as FormBench[]),
        seams: [],
      }
    : steppedDistrict(graph);
  const retaining = buildRetainingWalls({
    districts: [district as never],
    plan,
    palette,
    stack,
  });
  // WP-3: the street family declares for itself, so the fixture threads a driver
  // exactly as `buildStructures` does — the surfacer and the dressing commit into
  // it, and the still-unconverted retaining pass records into it at its own
  // pipeline position, which is before them.
  const driver = driverForPlan(plan);
  driver.record(declareRetaining(retaining));
  const streets = surfaceStreetGraph({
    graphs: [graph],
    ground: driver,
    plan,
    palette,
    stack,
    placements: [],
    buildingPaths: new Set<string>(),
    seed: nodeSeed(11n, "world.quarter"),
    theme: "medieval_village",
    ...(retaining.wallColumns === 0 ? {} : { seam: retaining.seam }),
  });
  const segmentArcs = new Map<string, SegmentArc>();
  for (const segment of streets.declaration.segments) {
    if (segment.frame === undefined || segment.levels === undefined) continue;
    segmentArcs.set(segment.source, { frame: segment.frame, levels: segment.levels });
  }
  const dressed = dressStreets(graph, {
    plan,
    ground: driver,
    levels: segmentArcs,
    stack,
    seed: nodeSeed(11n, "world.quarter"),
    furniture: "village",
    palette,
    nodePath: "world.quarter",
    surfaced: streets.road,
  });
  return { plan, graph, retaining, streets, dressed, driver, intents: driver.intents };
}

const classesOf = (intents: readonly GroundIntent[]): Set<string> =>
  new Set(intents.map((i) => i.sourceClass));

const columnCount = (intent: GroundIntent): number => [...intent.columns].length;

/** Every `street.sidewalk` claim the dressing committed, column -> level. */
function sidewalkClaims(run: Run): Map<number, number> {
  const out = new Map<number, number>();
  for (const intent of run.intents) {
    if (intent.sourceClass !== "street.sidewalk") continue;
    for (const claim of intent.columns) out.set(claim.idx, claim.y);
  }
  return out;
}

/* -------------------------------------------------------------------------- */

describe("the shadow declarers, on a stepped quarter", () => {
  let stack: PrismarineStack;
  let palette: Palette;
  let run: Run;

  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    run = runPipeline(stack, palette, false);
  }, 120_000);

  it("the fixture actually stepped: a wall was built and streets were surfaced", () => {
    expect(run.retaining.wallColumns).toBeGreaterThan(0);
    expect(run.streets.surfacedColumns).toBeGreaterThan(0);
    expect(sidewalkClaims(run).size).toBeGreaterThan(0);
  });

  it("every class that should appear does — streets, retaining, sidewalk, verge", () => {
    const classes = classesOf(run.intents);
    expect(classes.has("street.network")).toBe(true);
    expect(classes.has("street.sidewalk")).toBe(true);
    expect([...classes].some((c) => c.startsWith("retaining."))).toBe(true);
    expect(classes.has("verge")).toBe(true);
    // Retaining declares its `preserve` beside its `face`, always — that is the
    // `unsupported.chain` finding, and a face without one is the defect back.
    const faces = run.intents.filter((i) => i.kind === "face");
    const preserves = run.intents.filter(
      (i) => i.kind === "preserve" && i.sourceClass.startsWith("retaining."),
    );
    expect(faces.length).toBeGreaterThan(0);
    expect(preserves.length).toBe(faces.length);
  });

  it("every intent is non-empty and every declared column is in region", () => {
    expect(run.intents.length).toBeGreaterThan(0);
    for (const intent of run.intents) {
      expect(columnCount(intent), intent.source).toBeGreaterThan(0);
      for (const claim of intent.columns) {
        expect(Number.isInteger(claim.idx)).toBe(true);
        expect(claim.idx, `${intent.source} @ ${claim.idx}`).toBeGreaterThanOrEqual(0);
        expect(claim.idx, `${intent.source} @ ${claim.idx}`).toBeLessThan(CELLS);
        expect(Number.isInteger(claim.y)).toBe(true);
      }
    }
  });

  it("every kind is legal for its class, and every face is a retaining class", () => {
    for (const intent of run.intents) {
      expect(isLegalKind(intent.kind, intent.sourceClass), `${intent.kind}/${intent.sourceClass}`)
        .toBe(true);
      if (intent.kind !== "face") continue;
      expect(["retaining.seam", "retaining.skirt"]).toContain(intent.sourceClass);
    }
  });

  it("street intents carry distinct subRanks, consistent with compareStreetRank", () => {
    const streetIntents = run.intents.filter(
      (i) => i.sourceClass === "street.network" && i.kind === "profile",
    );
    expect(streetIntents.length).toBeGreaterThan(1);
    const subRanks = streetIntents.map((i) => i.subRank);
    expect(new Set(subRanks).size).toBe(subRanks.length);
    // The surfacer sorted them; the declaration preserves that order, and
    // `compareIntent` reads it back the same way.
    for (let i = 1; i < streetIntents.length; i++) {
      expect(
        compareIntent(streetIntents[i - 1] as GroundIntent, streetIntents[i] as GroundIntent),
      ).toBeLessThan(0);
    }
    // The avenue is wider, so it outranks the lane — the proven order, unmoved.
    expect((streetIntents[0] as GroundIntent).source).toBe("street:segment:a-avenue");
  });

  it("sources are unique per (class, source, kind) triple — §4.5 has no ties", () => {
    const seen = new Set<string>();
    for (const intent of run.intents) {
      const key = `${intent.sourceClass} ${intent.source} ${intent.kind}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    // And no two *distinct* level claims compare equal, which is what makes the
    // resolver's answer independent of enumeration order.
    const levelClaims = run.intents.filter(
      (i) => i.kind === "platform" || i.kind === "profile" || i.kind === "face",
    );
    for (let a = 0; a < levelClaims.length; a++) {
      for (let b = a + 1; b < levelClaims.length; b++) {
        expect(
          compareIntent(levelClaims[a] as GroundIntent, levelClaims[b] as GroundIntent),
          `${(levelClaims[a] as GroundIntent).source} vs ${(levelClaims[b] as GroundIntent).source}`,
        ).not.toBe(0);
      }
    }
  });

  it("ranks and tiers agree: a retaining face outranks a street, a verge is last", () => {
    expect(INTENT_RANK["retaining.seam"]).toBeLessThan(INTENT_RANK["street.network"]);
    expect(INTENT_RANK["street.network"]).toBeLessThan(INTENT_RANK["street.sidewalk"]);
    expect(GROUND_TIERS["verge"]).toBe("D");
  });

  it("I6 has landed: the sidewalk's level IS the carriageway's, by construction", () => {
    // WP-2 could only *declare* the arc-station level beside a pass that wrote
    // the centre cell's, and this test measured the gap between the two. WP-3
    // converted the pass, so there is no gap to measure: what is asserted is the
    // substantive half of I6 directly on the plan.
    const claims = sidewalkClaims(run);
    expect(claims.size).toBeGreaterThan(50);
    const carriageway = new Map<number, number>();
    for (const segment of run.streets.declaration.segments) {
      for (const column of segment.columns) carriageway.set(column.idx, column.y);
    }
    // No seven-block step across a street's own width: a band column stands
    // within one block of the carriageway it touches. Under WP-2's centre-cell
    // read this was violated by up to seven on the hill town, which is the
    // measured size of the defect I6 fixes.
    let checked = 0;
    let worst = 0;
    for (const [idx, y] of claims) {
      const flank: number[] = [];
      for (const n of [idx - 1, idx + 1, idx - SIZE, idx + SIZE]) {
        const c = carriageway.get(n);
        if (c !== undefined) flank.push(c);
      }
      if (flank.length === 0) continue;
      worst = Math.max(worst, ...flank.map((c) => Math.abs(c - y)));
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
    expect(worst).toBeLessThanOrEqual(1);

    // And the plan carries the resolver's answer on every column the sidewalk
    // won — the driver's write-through, seen from the outside (§9a.1 rule 2).
    const resolved = run.driver.finish();
    for (const idx of claims.keys()) {
      if (resolved.owner[idx] === -1) continue;
      expect(run.plan.ground[idx], `plan at ${idx}`).toBe(resolved.ground[idx]);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("the flat control", () => {
  let stack: PrismarineStack;
  let palette: Palette;
  let run: Run;

  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
    run = runPipeline(stack, palette, true);
  }, 120_000);

  it("declarations exist on flat ground too", () => {
    expect(run.intents.length).toBeGreaterThan(0);
    const classes = classesOf(run.intents);
    expect(classes.has("street.network")).toBe(true);
    expect(classes.has("street.sidewalk")).toBe(true);
  });

  it("§8.3's CONFLICT set is empty: every shared column proposes one level", () => {
    // The partition, computed from the declaration set alone — never from the
    // two answers, so it cannot be tuned to make the test pass.
    const byColumn = levelClaimsByColumn(run.intents);
    const conflicts: string[] = [];
    for (const [idx, levels] of byColumn) {
      if (levels.size < 2) continue;
      conflicts.push(`column ${idx}: ${[...levels].sort((a, b) => a - b).join(", ")}`);
    }
    expect(conflicts.slice(0, 8).join("\n")).toBe("");
    // And the set is not vacuous: columns *are* claimed by more than one intent.
    expect(byColumn.size).toBeGreaterThan(100);
  });

  it("no retaining face is declared where there is nothing to retain", () => {
    expect(declareRetaining(run.retaining).filter((i) => i.kind === "face")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("sweep's declaration mode (§3.13)", () => {
  let stack: PrismarineStack;
  let palette: Palette;

  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
  }, 120_000);

  const path = Array.from({ length: 24 }, (_, i) => ({ x: -12 + i, z: 3 }));

  it("writes nothing, and returns the run the mutating pass would have written", () => {
    const mutated = planOf(stack, (x) => stepped(x));
    const untouched = planOf(stack, (x) => stepped(x));
    const before = {
      ground: Int32Array.from(untouched.ground),
      fluidTop: Int32Array.from(untouched.fluidTop),
      fluidKind: Uint8Array.from(untouched.fluidKind),
      surface: Int32Array.from(untouched.surface),
      soil: Uint8Array.from(untouched.soil),
      snow: Uint8Array.from(untouched.snow),
    };

    const wrote = sweep({ profile: RETAINING_PROFILE, path, plan: mutated, palette, stack });
    const declaredRun = sweep({
      profile: RETAINING_PROFILE,
      path,
      plan: untouched,
      palette,
      stack,
      declareOnly: { sourceClass: "retaining.seam", transition: "wall" },
    });

    // 1. The declare-only plan is untouched, byte for byte.
    expect(Array.from(untouched.ground)).toEqual(Array.from(before.ground));
    expect(Array.from(untouched.fluidTop)).toEqual(Array.from(before.fluidTop));
    expect(Array.from(untouched.fluidKind)).toEqual(Array.from(before.fluidKind));
    expect(Array.from(untouched.surface)).toEqual(Array.from(before.surface));
    expect(Array.from(untouched.soil)).toEqual(Array.from(before.soil));
    expect(Array.from(untouched.snow)).toEqual(Array.from(before.snow));
    expect(declaredRun.blocks).toHaveLength(0);

    // 2. The intent carries the class the caller supplied — the engine picks none.
    const intent = declaredRun.intent;
    expect(intent).toBeDefined();
    expect((intent as GroundIntent).sourceClass).toBe("retaining.seam");
    expect((intent as GroundIntent).transition).toBe("wall");
    expect((intent as GroundIntent).kind).toBe("profile");

    // 3. Its columns are the mutating run's claimed columns, at the levels the
    //    mutating run wrote there.
    const claimedColumns: number[] = [];
    for (let k = 0; k < CELLS; k++) if (wrote.claimed[k] === 1) claimedColumns.push(k);
    expect(claimedColumns.length).toBeGreaterThan(0);
    const declaredColumns = [...(intent as GroundIntent).columns];
    expect(declaredColumns.map((c) => c.idx).sort((a, b) => a - b)).toEqual(claimedColumns);
    for (const claim of declaredColumns) {
      expect(claim.y, `column ${claim.idx}`).toBe(mutated.ground[claim.idx] as number);
    }
  });

  it("the mutating path is unchanged by the flag's existence", () => {
    const a = planOf(stack, (x) => stepped(x));
    const b = planOf(stack, (x) => stepped(x));
    sweep({ profile: RETAINING_PROFILE, path, plan: a, palette, stack });
    sweep({ profile: RETAINING_PROFILE, path, plan: b, palette, stack });
    expect(Array.from(a.ground)).toEqual(Array.from(b.ground));
    expect(Array.from(a.surface)).toEqual(Array.from(b.surface));
  });
});

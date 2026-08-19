/**
 * **Wave 11F — the wiring, end to end.**
 *
 * 11B built the tier stack, 11D measured the bank, 11E specified S9, S10 and
 * S11 and proved each law on a hand-made fixture. This file proves the *lines
 * that join them* — the three the structure pass now runs:
 *
 * 1. the landings come out of `buildRetainingWalls` rather than out of a
 *    literal, bottom first, floor to the platform the stack holds;
 * 2. `deriveSeamStairs` is called over **those** landings and the quarter's own
 *    carriageway, and the flight it cuts goes to `structures/street-stairs.ts`
 *    — the existing tread law — and comes back climbable, riser by riser, over
 *    ground that steps four blocks at a time;
 * 3. `buildDoorsteps` is handed the same landings, and a door on the low
 *    terrace whose flight foots at the stack's own floor becomes a door.
 *
 * Each is paired with the control §6 demands — *prove the harness can see a
 * difference before trusting that it saw none.* The flag-off run publishes
 * nothing; the doorstep without the landings is refused on the very fixture the
 * landings let through.
 *
 * **The global flag is never flipped**: `SEAM_TIERS` ships `false` and 11F
 * flips it on Kai's walk verdict and nothing else. Every assertion below rides
 * the per-district `tiered: true` that `seam-tiers.test.ts` already uses.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { SEAM_STAIR_JOIN, deriveSeamStairs } from "../src/layout/district.js";
import type { Rect } from "../src/layout/frames.js";
import type { FormBench } from "../src/layout/forms/types.js";
import { groundLevelsOf, levelSeams } from "../src/layout/levels.js";
import { SEAM_TIERS, type ResolvedPort } from "../src/layout/types.js";
import type { BuiltBuilding } from "../src/structures/buildings.js";
import { buildDoorsteps } from "../src/structures/doorsteps.js";
import { buildRetainingWalls } from "../src/structures/retaining.js";
import { streetStairGeometry, streetStairLevels } from "../src/structures/street-stairs.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";

const SIZE = 64;
const REGION = { x0: 0, z0: 0, width: SIZE, depth: SIZE } as const;
const BOUNDS = { x0: 0, z0: 0, x1: SIZE - 1, z1: SIZE - 1 } as const;
const at = (x: number, z: number): number => z * SIZE + x;

/** Two storeys — the drop six of Troy's citadel seams actually have. */
const UPPER_Y = 74;
const LOWER_Y = 66;
const SEAM_Z = 24;

/**
 * The low-side lane, exactly {@link SEAM_STAIR_JOIN} columns from the stack's
 * floor — the far edge of the reach, and out of reach of the platform above, so
 * the flight runs *up* rather than back down to the lane it started on.
 */
const STREET_Z = SEAM_Z + 8;

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

/** The quarter: two platforms a drop of 8 apart, and an optional low-side lane. */
function quarter(over: { readonly tiered: boolean; readonly street: boolean }) {
  const benches: FormBench[] = [
    { id: "upper", runs: [{ x0: 0, z0: 0, x1: SIZE - 1, z1: SEAM_Z - 1 }], level: UPPER_Y },
    { id: "lower", runs: [{ x0: 0, z0: SEAM_Z, x1: SIZE - 1, z1: SIZE - 1 }], level: LOWER_Y },
  ];
  const levels = groundLevelsOf(BOUNDS, benches);
  if (levels === null) throw new Error("fixture has no platforms");
  const carriageway = new Uint8Array(SIZE * SIZE);
  if (over.street) {
    for (let z = STREET_Z; z <= STREET_Z + 2; z++)
      for (let x = 0; x < SIZE; x++) carriageway[at(x, z)] = 1;
  }
  return {
    nodePath: "world.quarter",
    bounds: BOUNDS,
    carriageway,
    sidewalk: new Uint8Array(SIZE * SIZE),
    levels,
    seams: levelSeams(levels),
    ...(over.tiered ? { tiered: true } : {}),
  };
}

/** `structures/index.ts`'s own `onStreet`, character for character. */
const onStreetOf = (d: ReturnType<typeof quarter>) => {
  const width = d.bounds.x1 - d.bounds.x0 + 1;
  return (x: number, z: number): boolean => {
    if (x < d.bounds.x0 || x > d.bounds.x1 || z < d.bounds.z0 || z > d.bounds.z1) return false;
    const k = (z - d.bounds.z0) * width + (x - d.bounds.x0);
    return d.carriageway[k] === 1 || d.sidewalk[k] === 1;
  };
};

/** A terrace of houses on the low side, facing the stack across four columns. */
const TERRACE: Rect = { x0: 0, z0: SEAM_Z + 4, x1: SIZE - 1, z1: SEAM_Z + 10 };
const DOOR_FLOOR = LOWER_Y + 1;
function terraceHouse(): BuiltBuilding {
  return {
    nodePath: "world.terrace",
    footprint: TERRACE,
    floorY: DOOR_FLOOR,
  } as unknown as BuiltBuilding;
}
function terraceDoor(): ResolvedPort {
  return {
    nodePath: "world.terrace",
    ref: "door",
    type: "door",
    position: [13, DOOR_FLOOR, TERRACE.z0],
    outwardNormal: [0, 0, -1],
  } as unknown as ResolvedPort;
}

describe("11F — buildRetainingWalls → deriveSeamStairs → the tread law → the doorstep", () => {
  let stack: PrismarineStack;
  let palette: ReturnType<typeof resolvePalette>["palette"];
  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(palette, stack, MATERIAL_THEMES[1] as MaterialTheme);
  });

  const run = (over: {
    readonly tiered: boolean;
    readonly street: boolean;
    readonly footprints?: readonly Rect[];
  }) => {
    const district = quarter(over);
    const plan = planOf(stack, (_x, z) => (z < SEAM_Z ? UPPER_Y : LOWER_Y));
    const retaining = buildRetainingWalls({
      districts: [district],
      plan,
      palette,
      stack,
      footprints: over.footprints ?? [],
    });
    return { district, plan, retaining };
  };

  /* --- the flag, and the control ----------------------------------------- */

  it("publishes nothing with the flag off, which is every world that ships today", () => {
    expect(SEAM_TIERS).toBe(false);
    const off = run({ tiered: false, street: true });
    expect(off.retaining.stacks).toBe(0);
    expect(off.retaining.landings).toEqual([]);
    // …so the derivation over them cannot produce a segment, whatever it is told.
    expect(
      deriveSeamStairs({
        nodePath: off.district.nodePath,
        landings: off.retaining.landings,
        onStreet: onStreetOf(off.district),
        tiered: true,
      }).segments,
    ).toEqual([]);
  });

  /* --- 1: the landings, published by the pass that built the stack -------- */

  it("serves the drop-8 seam with tier masonry and publishes its landings, bottom first", () => {
    const { retaining } = run({ tiered: true, street: true });
    expect(retaining.stacks).toBe(1);
    expect(retaining.stackTiers).toBe(2); // `tiersOf(8)` — two faces of four
    expect(retaining.stackColumns).toBeGreaterThan(0);
    expect(retaining.blocks.length).toBeGreaterThan(0);

    expect(retaining.landings).toHaveLength(1);
    const published = retaining.landings[0];
    expect(published).toBeDefined();
    if (published === undefined) return;
    expect(published.nodePath).toBe("world.quarter");
    expect(published.source).toMatch(/^world\.quarter#tiers@\d+$/);
    // Bottom first and strictly ascending: the seam floor, then whatever tread
    // the dressing left, then the platform the stack holds.
    const ys = published.landings.map((l) => l.y);
    expect(ys[0]).toBe(LOWER_Y);
    expect(ys[ys.length - 1]).toBe(UPPER_Y);
    for (let k = 1; k < ys.length; k++) expect(ys[k]).toBeGreaterThan(ys[k - 1] as number);
    for (const landing of published.landings) expect(landing.columns.length).toBeGreaterThan(0);

    const floor = published.landings[0];
    const top = published.landings[published.landings.length - 1];
    if (floor === undefined || top === undefined) return;
    // Every landing is ground *beside* the stack, never a column the stack took:
    // the platform it holds is the row inside the seam, and the floor stands one
    // column outside the outermost band.
    expect(new Set(top.columns.map((c) => c.z))).toEqual(new Set([SEAM_Z - 1]));
    for (const c of floor.columns) {
      expect(c.z).toBeGreaterThan(SEAM_Z);
      // …and inside the lane's reach, which is what lets a flight land on the
      // street rather than beside it.
      expect(STREET_Z - c.z).toBeLessThanOrEqual(SEAM_STAIR_JOIN);
    }
  });

  /* --- 2: one flight, cut over those landings and surfaced by the old law -- */

  const flightOf = () => {
    const { district, plan, retaining } = run({ tiered: true, street: true });
    const derived = deriveSeamStairs({
      nodePath: district.nodePath,
      landings: retaining.landings.filter((l) => l.nodePath === district.nodePath),
      onStreet: onStreetOf(district),
      tiered: true,
    });
    return { district, plan, derived };
  };

  it("cuts ONE flight over them, as an `sst*` steps segment on the quarter's graph", () => {
    const { district, derived } = flightOf();
    expect(derived.cut).toBe(1);
    expect(derived.refused).toBe(0);
    expect(derived.diagnostics.map((d) => d.code)).toContain("LOAM-I414");
    const flight = derived.segments[0];
    expect(flight).toBeDefined();
    if (flight === undefined) return;
    expect(flight.id).toMatch(/^sst\d+$/);
    expect(flight.role).toBe("steps");
    // It starts on the lane and ends on the platform the stack holds — the whole
    // point of publishing the two ends rather than the construction between.
    const first = flight.path[0];
    const last = flight.path[flight.path.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) return;
    expect(onStreetOf(district)(first.x, first.z)).toBe(true);
    expect(last.z).toBe(SEAM_Z - 1);
    // 4-connected and unit-stepped, which is what the surfacer will walk.
    for (let k = 1; k < flight.path.length; k++) {
      const a = flight.path[k - 1] as { x: number; z: number };
      const b = flight.path[k] as { x: number; z: number };
      expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1);
    }
  });

  it("…and the EXISTING tread law makes it climbable over ground that steps by four", () => {
    const { plan, derived } = flightOf();
    const flight = derived.segments[0];
    expect(flight).toBeDefined();
    if (flight === undefined) return;
    const n = SIZE * SIZE;
    const geometry = streetStairGeometry({
      region: REGION,
      plan,
      blocked: new Uint8Array(n),
      paved: new Uint8Array(n),
      water: new Uint8Array(n),
      path: flight.path,
      width: flight.width,
    });
    expect(geometry.refusedBecause).toBeUndefined();
    const levels = streetStairLevels(geometry, (x, z) => plan.ground[at(x, z)] as number);
    // **No new stair code is under test here, and that is the assertion.**
    // `need[k] = max(g[k] + 1, need[k+1] − 1)` was written two rounds ago; it
    // spends the flat lane approach on masonry so the faces can be climbed, and
    // that is exactly why the flight is carried onto the street at all.
    expect(levels.refusedBecause).toBeUndefined();
    expect(levels.levels.length).toBe(geometry.centre.length);
    for (let k = 1; k < levels.levels.length; k++) {
      const rise = Math.abs((levels.levels[k] as number) - (levels.levels[k - 1] as number));
      expect(rise, `riser at ${k}`).toBeLessThanOrEqual(1);
    }
    // The control: the ground it stands over is *not* climbable — the stack's
    // faces are four blocks each. The flight is the difference, not the fixture.
    const raw = geometry.centre.map((c) => plan.ground[at(c.x, c.z)] as number);
    const steepest = Math.max(
      ...raw.map((g, i) => (i === 0 ? 0 : Math.abs(g - (raw[i - 1] as number)))),
    );
    expect(steepest).toBe(4);
  });

  /* --- 3: the doorstep, over the same landings ---------------------------- */

  it("hands the same landings to the doorstep gate — refused without them, built with", () => {
    // A terrace on the low side, its doors facing the stack four columns away.
    // The flight foots on the seam floor: real ground the stack stands on, whose
    // *far* side is the stack's own bottom face, so the two-column brink test
    // reads it as the edge of a bank. This is the one case S10 exists for, and
    // here the landing that answers it is the one the pass just published.
    const doorstep = (withLandings: boolean) => {
      const { plan, retaining } = run({ tiered: true, street: false, footprints: [TERRACE] });
      return buildDoorsteps({
        buildings: [terraceHouse()],
        ports: [terraceDoor()],
        plan,
        palette,
        stack,
        ...(withLandings ? { landings: retaining.landings, bank: retaining.bank } : {}),
      });
    };
    const bare = doorstep(false);
    expect(bare.refused).toBe(1);
    expect(bare.stepped).toBe(0);
    expect(bare.blocks).toEqual([]);

    const wired = doorstep(true);
    expect(wired.refused).toBe(0);
    expect(wired.stepped).toBe(1);
    expect(wired.blocks.length).toBeGreaterThan(0);
    // The step stands outside the house, between it and the seam.
    for (const b of wired.blocks) expect(b.z).toBeLessThan(TERRACE.z0);
  });
});

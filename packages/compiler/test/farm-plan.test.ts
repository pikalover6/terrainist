/**
 * `precinct.farm@0` — WP-2, the planner (`docs/FARM-PLAN-v0.md` §13).
 *
 * WP-2's claim: a holding seats a yard, packs as many gentle-ground fields as
 * it was asked for, and **claims** them as `farm.parcel` at rank 125. It still
 * lays no block, so everything here is asserted against the declaration set and
 * the resolved ground rather than against a compiled world — which is the right
 * instrument for a work package whose whole output is claims.
 *
 * The three tests §13 names for WP-2 are the three `describe`s that carry its
 * name: seatability at the `FIELD_MAX_RELIEF` corners, the packing as a pure
 * function of the declaration set (shuffle the cell enumeration, same answer),
 * and the conflict case — a lane through a holding takes its columns and the
 * parcel reports the loss.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region, type Seed256 } from "@terrainist/stdlib";

import {
  FIELD_MAX_RELIEF,
  buildFarms,
  isSeated,
  orderParcelCells,
  seatRect,
  type FarmPassResult,
  type FarmScan,
} from "../src/structures/farm.js";
import { INTENT_RANK } from "../src/layout/ground-contract.js";
import { driverForPlan } from "../src/layout/ground-driver.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import type { OccupancyGrid, Placement } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const SOIL = 7;
const ROCK = 9;
const SEA = 63;

function region(width: number, depth = width): Region {
  return { x0: 0, z0: 0, width, depth };
}

function plan(r: Region, height: (x: number, z: number) => number): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
  const surface = new Int32Array(n).fill(SOIL);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      const k = j * r.width + i;
      ground[k] = height(r.x0 + i, r.z0 + j);
      fluidTop[k] = ground[k] as number;
    }
  }
  return {
    region: r,
    ground,
    fluidTop,
    fluidKind: new Uint8Array(n),
    surface,
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    seaLevel: SEA,
    stoneSeed: 0,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 },
  } as unknown as ColumnPlan;
}

/** A hand-built scan, so §5.1 can be asked about one rectangle at a time. */
function scan(r: Region, height: (x: number, z: number) => number): FarmScan {
  const p = plan(r, height);
  return {
    region: r,
    ground: p.ground,
    fluidKind: p.fluidKind,
    surface: p.surface,
    soil: new Set([SOIL]),
    stronger: new Uint8Array(r.width * r.depth),
    occupied: new Uint8Array(r.width * r.depth),
  };
}

const SEED: Seed256 = nodeSeed(302n, "world.east_farm");

function placement(footprint: Rect): Placement {
  return {
    nodePath: "world.east_farm",
    id: "east_farm",
    translation: [footprint.x0, 64, footprint.z0],
    yaw: 0,
    mirror: false,
    size: [footprint.x1 - footprint.x0 + 1, 1, footprint.z1 - footprint.z0 + 1],
    footprint,
    anchor: { x: (footprint.x0 + footprint.x1) >> 1, z: (footprint.z0 + footprint.z1) >> 1 },
    foundationY: 64,
  };
}

function occupancyWith(r: Region, tag: string, set: (x: number, z: number) => boolean): OccupancyGrid {
  const mask = new Uint8Array(r.width * r.depth);
  const tagged = new Uint8Array(r.width * r.depth);
  for (let j = 0; j < r.depth; j++) {
    for (let i = 0; i < r.width; i++) {
      if (!set(r.x0 + i, r.z0 + j)) continue;
      mask[j * r.width + i] = 1;
      tagged[j * r.width + i] = 1;
    }
  }
  return { region: r, mask, byTag: new Map([[tag, tagged]]) };
}

/** Run the pass over one holding on a plan of its own. */
function run(
  p: ColumnPlan,
  footprint: Rect,
  params: Record<string, unknown> = {},
  extra: { occupancy?: OccupancyGrid; before?: (driver: ReturnType<typeof driverForPlan>) => void } = {},
): { result: FarmPassResult; driver: ReturnType<typeof driverForPlan> } {
  const driver = driverForPlan(p);
  extra.before?.(driver);
  const result = buildFarms({
    jobs: [
      {
        nodePath: "world.east_farm",
        placement: placement(footprint),
        params,
        seed: SEED,
        tags: ["farm"],
        ports: {},
      },
    ],
    ground: driver,
    plan: p,
    soil: new Set([SOIL]),
    ...(extra.occupancy === undefined ? {} : { occupancy: extra.occupancy }),
  });
  return { result, driver };
}

const AREA = (rect: Rect): number => (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1);

/* -------------------------------------------------------------------------- */
/* §5.3 the class                                                              */
/* -------------------------------------------------------------------------- */

describe("farm.parcel, rank 125", () => {
  it("is inserted between the doorstep and the pad, and renumbers nothing", () => {
    expect(INTENT_RANK["farm.parcel"]).toBe(125);
    // The insertion argument in full: the neighbours keep the numbers they had,
    // which is why no world without a farm can move a byte.
    expect(INTENT_RANK["doorstep.landing"]).toBe(120);
    expect(INTENT_RANK["prop.pad"]).toBe(130);
    expect(INTENT_RANK.verge).toBe(140);
    expect(INTENT_RANK["road.network"]).toBe(100);
  });
});

/* -------------------------------------------------------------------------- */
/* §5.1 the gentle-ground scan, at its corners                                 */
/* -------------------------------------------------------------------------- */

describe("the gentle-ground scan (§5.1)", () => {
  const rect: Rect = { x0: 2, z0: 2, x1: 13, z1: 13 };

  it("seats a rectangle at exactly FIELD_MAX_RELIEF and refuses one block more", () => {
    const ok = seatRect(rect, scan(region(32), (x) => 64 + Math.min(FIELD_MAX_RELIEF, x - 2)));
    expect(isSeated(ok)).toBe(true);
    const tooSteep = seatRect(
      rect,
      scan(region(32), (x) => 64 + Math.min(FIELD_MAX_RELIEF + 1, x - 2)),
    );
    expect(tooSteep).toEqual({ refusal: "relief" });
  });

  it("takes the median of the ground as the level, rounded half-up", () => {
    // Half the columns at 64 and half at 65: the median is 64.5, and half-up is
    // the rule — a field that rounded down would sit a block into the hill.
    const answer = seatRect(rect, scan(region(32), (_x, z) => (z <= 7 ? 64 : 65)));
    expect(answer).toMatchObject({ level: 65, relief: 1 });
  });

  it("refuses water, rock and a column something stronger already claimed", () => {
    const flat = (): number => 64;
    const wet = scan(region(32), flat);
    (wet.fluidKind as unknown as Uint8Array)[4 * 32 + 4] = FluidKind.WATER;
    expect(seatRect(rect, wet)).toEqual({ refusal: "wet" });

    const rocky = scan(region(32), flat);
    (rocky.surface as Int32Array)[4 * 32 + 4] = ROCK;
    expect(seatRect(rect, rocky)).toEqual({ refusal: "soil" });

    const claimed = scan(region(32), flat);
    (claimed.stronger as Uint8Array)[4 * 32 + 4] = 1;
    expect(seatRect(rect, claimed)).toEqual({ refusal: "claimed" });

    const occupied = scan(region(32), flat);
    (occupied.occupied as Uint8Array)[4 * 32 + 4] = 1;
    expect(seatRect(rect, occupied)).toEqual({ refusal: "claimed" });
  });

  it("refuses a rectangle that leaves the region", () => {
    expect(seatRect({ x0: 28, z0: 2, x1: 40, z1: 13 }, scan(region(32), () => 64))).toEqual({
      refusal: "envelope",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* §5.2 the packing                                                            */
/* -------------------------------------------------------------------------- */

describe("the packing (§5.2)", () => {
  const envelope: Rect = { x0: 8, z0: 8, x1: 103, z1: 87 };
  const flat = plan(region(128), () => 64);

  it("delivers the fields it was asked for, disjoint and inside the envelope", () => {
    const { result } = run(flat, envelope, { parcels: 6, parcelSize: 18 });
    const row = result.farms[0];
    expect(row?.parcelsSeated).toBe(6);
    // Nothing was refused, so nothing is warned about. The one diagnostic a
    // healthy holding does raise is §7.3's `LOAM-I504`, which names the anchor.
    expect(result.diagnostics.map((d) => d.code)).toEqual(["LOAM-I504"]);
    for (const parcel of row?.parcels ?? []) {
      expect(parcel.rect.x0).toBeGreaterThanOrEqual(envelope.x0);
      expect(parcel.rect.x1).toBeLessThanOrEqual(envelope.x1);
      expect(parcel.rect.z0).toBeGreaterThanOrEqual(envelope.z0);
      expect(parcel.rect.z1).toBeLessThanOrEqual(envelope.z1);
      // §3.3's floor survives the jitter.
      expect(parcel.rect.x1 - parcel.rect.x0 + 1).toBeGreaterThanOrEqual(10);
      expect(parcel.rect.z1 - parcel.rect.z0 + 1).toBeGreaterThanOrEqual(10);
    }
    const parcels = row?.parcels ?? [];
    for (let i = 0; i < parcels.length; i++) {
      for (let j = i + 1; j < parcels.length; j++) {
        const a = (parcels[i] as { rect: Rect }).rect;
        const b = (parcels[j] as { rect: Rect }).rect;
        expect(a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1).toBe(false);
      }
    }
  });

  it("declares one platform per parcel, class farm.parcel, transition step", () => {
    const { result, driver } = run(flat, envelope, { parcels: 4 });
    // Every `farm.parcel` intent: the yard's own claim (§7.1 — "the yard is a
    // field the farmer paved with mud") first, then one per field.
    const all = driver.intents.filter((i) => i.sourceClass === "farm.parcel");
    expect(all[0]?.source).toBe("world.east_farm#yard");
    const mine = all.slice(1);
    expect(mine).toHaveLength(result.farms[0]?.parcelsSeated ?? 0);
    for (const [i, intent] of mine.entries()) {
      expect(intent.kind).toBe("platform");
      expect(intent.transition).toBe("step");
      expect(intent.source).toBe(`world.east_farm#parcel_${i}`);
      // No `preserve` anywhere (§5.3): losing a column is normal.
      expect(intent.minColumns).toBeUndefined();
    }
    expect(driver.intents.some((i) => i.kind === "preserve")).toBe(false);
  });

  it("is a pure function of the cell set — shuffling the enumeration changes nothing", () => {
    const yard: Rect = { x0: 10, z0: 10, x1: 25, z1: 25 };
    const cells: Rect[] = [];
    for (let z = 0; z < 5; z++) {
      for (let x = 0; x < 5; x++) {
        cells.push({ x0: x * 16, z0: z * 16, x1: x * 16 + 15, z1: z * 16 + 15 });
      }
    }
    const ordered = orderParcelCells(cells, yard);
    // A fixed, seed-free shuffle: a test that shuffles randomly proves nothing
    // twice in a row.
    const shuffled = [...cells].reverse();
    for (let i = 0; i < shuffled.length; i += 3) {
      const a = shuffled[i] as Rect;
      shuffled[i] = shuffled[shuffled.length - 1 - i] as Rect;
      shuffled[shuffled.length - 1 - i] = a;
    }
    expect(orderParcelCells(shuffled, yard)).toEqual(ordered);
    // And the order really is total: no two cells compare equal.
    const keys = ordered.map((c) => `${c.z0},${c.x0}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("plans the same holding twice, block for block of ground", () => {
    const a = run(plan(region(128), () => 64), envelope, { parcels: 6 });
    const b = run(plan(region(128), () => 64), envelope, { parcels: 6 });
    expect(b.result.farms).toEqual(a.result.farms);
  });

  it("commits the parcels' levels through the driver", () => {
    const rolling = plan(region(128), (x, z) => 64 + (((x >> 5) + (z >> 5)) & 1));
    const { result } = run(rolling, envelope, { parcels: 4 });
    for (const parcel of result.farms[0]?.parcels ?? []) {
      for (let z = parcel.rect.z0; z <= parcel.rect.z1; z++) {
        for (let x = parcel.rect.x0; x <= parcel.rect.x1; x++) {
          expect(rolling.ground[z * 128 + x]).toBe(parcel.level);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §5.4 the conflict                                                           */
/* -------------------------------------------------------------------------- */

describe("a lane through a holding (§5.4)", () => {
  const envelope: Rect = { x0: 8, z0: 8, x1: 103, z1: 87 };
  const laneZ = 60;
  const lane = (driver: ReturnType<typeof driverForPlan>): void => {
    const columns = [];
    for (let x = envelope.x0; x <= envelope.x1; x++) columns.push({ idx: laneZ * 128 + x, y: 70 });
    driver.commit([
      {
        source: "world.lanes#run_0",
        sourceClass: "road.network",
        kind: "platform",
        columns,
        transition: "ramp",
      },
    ]);
  };

  it("takes its columns before the fields are seated: no parcel covers the lane", () => {
    // §5.4's first bullet, and §5.1's `claimed(R)` doing the work: a road at
    // rank 100 beats a field at 125, and the road pass runs *before* this one,
    // so the field never claims the lane's columns in the first place — the
    // resolver's transition at the boundary is what makes it read as a lane
    // through a field. The refusal is counted, not silent.
    const p = plan(region(128), () => 64);
    const { result } = run(p, envelope, { parcels: 6, parcelSize: 18 }, { before: lane });
    const parcels = result.farms[0]?.parcels ?? [];
    expect(parcels.length).toBeGreaterThan(0);
    for (const parcel of parcels) {
      expect(parcel.rect.z0 <= laneZ && laneZ <= parcel.rect.z1).toBe(false);
      // Every column accounted for: what a parcel claims, a parcel wins here.
      expect(parcel.columnsWon + parcel.columnsLost).toBe(AREA(parcel.rect));
    }
    // And the lane kept its own level all the way across the holding.
    expect(p.ground[laneZ * 128 + envelope.x0]).toBe(70);
    expect(result.farms[0]?.refusals["claimed"]).toBeGreaterThan(0);
    expect(result.farms[0]?.columnsClaimed).toBe(
      parcels.reduce((n, f) => n + f.columnsWon, 0),
    );
  });

  it("yields a field's columns to a doorstep that lands after it", () => {
    // The other direction of §5.4, and the one the rank actually arbitrates: a
    // doorstep (120) is declared *after* this pass runs, so the scan cannot see
    // it, and the contract — not the scan — is what gives it the columns. A
    // farmhouse whose door faces its own field gets a flush threshold rather
    // than a step into the crop.
    const p = plan(region(128), () => 64);
    const { result, driver } = run(p, envelope, { parcels: 4, parcelSize: 18 });
    const parcel = result.farms[0]?.parcels[0];
    expect(parcel).toBeDefined();
    const idx = (parcel?.rect.z0 ?? 0) * 128 + (parcel?.rect.x0 ?? 0);
    driver.commit([
      {
        source: "world.east_farm.farmhouse#doorstep",
        sourceClass: "doorstep.landing",
        kind: "platform",
        columns: [{ idx, y: 66 }],
        transition: "step",
      },
    ]);
    const resolved = driver.finish();
    const owner = resolved.owner[idx] as number;
    expect(driver.intents[owner]?.sourceClass).toBe("doorstep.landing");
    expect(p.ground[idx]).toBe(66);
    // And a prop pad, one rank below, does not: a scarecrow's plinth must not
    // re-level a field.
    const inField = (parcel?.rect.z0 ?? 0) * 128 + (parcel?.rect.x0 ?? 0) + 4;
    driver.commit([
      {
        source: "world.east_farm.scarecrow#pad",
        sourceClass: "prop.pad",
        kind: "platform",
        columns: [{ idx: inField, y: 66 }],
        transition: "step",
      },
    ]);
    const after = driver.finish();
    expect(after.owner[inField]).not.toBe(-1);
    expect(driver.intents[after.owner[inField] as number]?.sourceClass).toBe("farm.parcel");
  });
});

/* -------------------------------------------------------------------------- */
/* §12 the refusals                                                            */
/* -------------------------------------------------------------------------- */

describe("the refusals (§12)", () => {
  it("W501 when the ground allows fewer fields than the document asked for", () => {
    // The crop-circle rule: a count you asked for is delivered or diagnosed.
    const envelope: Rect = { x0: 8, z0: 8, x1: 71, z1: 71 };
    const { result } = run(plan(region(96), () => 64), envelope, { parcels: 24, parcelSize: 28 });
    const row = result.farms[0];
    expect(row?.parcelsSeated).toBeLessThan(24);
    expect(row?.parcelsSeated).toBeGreaterThan(0);
    const short = result.diagnostics.find((d) => d.code === "LOAM-W501");
    expect(short?.message).toContain("asked for 24 fields");
    expect(short?.message).toContain(`seated ${row?.parcelsSeated ?? 0}`);
    expect(short?.severity).toBe("warning");
  });

  it("W500 when the yard seats and not one field does", () => {
    // Everything but one corner is somebody else's ground: the yard fits in the
    // corner, and no field fits anywhere.
    const envelope: Rect = { x0: 0, z0: 0, x1: 47, z1: 47 };
    const free = (x: number, z: number): boolean => x <= 19 && z <= 19;
    const { result } = run(plan(region(64), () => 64), envelope, { parcels: 4 }, {
      occupancy: occupancyWith(region(64), "plaza", (x, z) => !free(x, z)),
    });
    const row = result.farms[0];
    expect(row?.refused).toBeUndefined();
    expect(row?.parcelsSeated).toBe(0);
    const none = result.diagnostics.find((d) => d.code === "LOAM-W500");
    expect(none?.name).toBe("FARM_NO_GROUND");
    expect(none?.message).toContain("not one field");
    expect(result.stats.farmParcels).toBe(0);
  });

  it("W503 when no yard can be seated — the holding places nothing", () => {
    const envelope: Rect = { x0: 0, z0: 0, x1: 63, z1: 63 };
    const cliff = plan(region(64), (x) => 64 + 3 * x);
    const { result, driver } = run(cliff, envelope, { parcels: 4 });
    const row = result.farms[0];
    expect(row?.refused).toBe("yard");
    expect(row?.parcelsSeated).toBe(0);
    expect(row?.parcels).toEqual([]);
    const refused = result.diagnostics.find((d) => d.code === "LOAM-W503");
    expect(refused?.name).toBe("FARM_REFUSED");
    expect(refused?.message).toContain("places nothing");
    // Refused whole: not one column claimed anywhere.
    expect(driver.intents.filter((i) => i.sourceClass === "farm.parcel")).toEqual([]);
    expect(result.stats.farmColumns).toBe(0);
  });
});

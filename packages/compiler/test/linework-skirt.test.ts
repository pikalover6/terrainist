/**
 * **The bed skirt** — `docs/GROUND-UNIFICATION-v0.md` §3.2, laws B1/B2/B3.
 *
 * A declared linework bed is a berm, and `gradeBank` steps a berm's outer face
 * back down at one block per column — 45°, which is the ratio
 * `APRON_RUN_PER_BLOCK = 2` was chosen against. B1 gives the bed the same
 * lift-keyed apron every pad in the tree already grades: a ring band outside the
 * bed at 1:2, filling only where the ground is actually below the falloff, and
 * capped twice. B2 puts it at `verge` (140) so an apron can never outrank a
 * street. B3 says nobody may author one.
 */

import { describe, expect, it } from "vitest";

import { APRON_MAX, APRON_RUN_PER_BLOCK, nodeSeed, type Region } from "@terrainist/stdlib";
import { INFRA_ENTRIES } from "@terrainist/stdlib";

import { INTENT_RANK, type GroundIntent } from "../src/layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../src/layout/ground-driver.js";
import {
  declareLinework,
  lineworkSkirt,
  lineworkSkirtRings,
  type LineworkBedColumn,
} from "../src/structures/linework.js";
import type { InfraEntryJob, InfraPlacementView } from "../src/structures/infra-entry.js";
import { index } from "../src/structures/roads.js";
import type { CoursePoint } from "../src/structures/wall-course.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function region(size = 160): Region {
  return { x0: -size / 2, z0: -size / 2, width: size, depth: size };
}

function plan(r: Region, height: (x: number, z: number) => number = () => 70): ColumnPlan {
  const n = r.width * r.depth;
  const ground = new Int32Array(n);
  const fluidTop = new Int32Array(n);
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
    fluidKind: new Uint8Array(n).fill(FluidKind.NONE),
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n).fill(3),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    seaLevel: 63,
    stoneSeed: 0,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0 },
  };
}

/** A one-column bed at `(0,0)`, standing `lift` blocks above flat ground. */
function loneBed(r: Region, y: number): LineworkBedColumn[] {
  return [{ x: 0, z: 0, idx: index(r, 0, 0), y }];
}

interface SkirtSpec {
  readonly groundY?: number;
  readonly bedY?: number;
  readonly crossWidth?: number;
  readonly ground?: (x: number, z: number) => number | undefined;
  readonly carriageway?: Uint8Array;
  readonly fluidKind?: Uint8Array;
  readonly bed?: LineworkBedColumn[];
  readonly region?: Region;
}

function skirtOf(spec: SkirtSpec = {}) {
  const r = spec.region ?? region(96);
  const n = r.width * r.depth;
  const flat = spec.groundY ?? 60;
  return {
    region: r,
    claims: lineworkSkirt({
      region: r,
      bed: spec.bed ?? loneBed(r, spec.bedY ?? 80),
      crossWidth: spec.crossWidth ?? 64,
      ground: spec.ground ?? (() => flat),
      carriageway: spec.carriageway ?? new Uint8Array(n),
      fluidKind: spec.fluidKind ?? new Uint8Array(n).fill(FluidKind.NONE),
    }),
  };
}

/** Chebyshev ring of a claim around the origin column. */
function ringOf(r: Region, idx: number): number {
  const i = idx % r.width;
  const j = Math.floor(idx / r.width);
  return Math.max(Math.abs(r.x0 + i), Math.abs(r.z0 + j));
}

/* -------------------------------------------------------------------------- */
/* B1 — the shape                                                              */
/* -------------------------------------------------------------------------- */

describe("B1 — the skirt falls at 1:2 from the bed", () => {
  it("drops one block every APRON_RUN_PER_BLOCK columns of ring", () => {
    const { region: r, claims } = skirtOf({ bedY: 80, groundY: 40 });
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      const ring = ringOf(r, claim.idx);
      expect(claim.y).toBe(80 - Math.ceil(ring / APRON_RUN_PER_BLOCK));
    }
    // Two rings per block is the whole doctrine: rings 1 and 2 sit at 79.
    const first = claims.filter((c) => ringOf(r, c.idx) <= 2);
    expect(first.length).toBe(24);
    for (const c of first) expect(c.y).toBe(79);
  });

  it("never claims the bed's own columns", () => {
    const { region: r, claims } = skirtOf({ bedY: 80, groundY: 40 });
    expect(claims.some((c) => c.idx === index(r, 0, 0))).toBe(false);
  });

  it("hands the resolver a strictly ascending, duplicate-free column list", () => {
    const { claims } = skirtOf({ bedY: 80, groundY: 40 });
    for (let i = 1; i < claims.length; i++) {
      expect(claims[i]?.idx).toBeGreaterThan(claims[i - 1]?.idx as number);
    }
  });

  it("takes the lower level where two bed columns reach the same ring", () => {
    const r = region(96);
    const bed: LineworkBedColumn[] = [
      { x: -4, z: 0, idx: index(r, -4, 0), y: 90 },
      { x: 4, z: 0, idx: index(r, 4, 0), y: 80 },
    ];
    const { claims } = skirtOf({ region: r, bed, bedY: 0, groundY: 40 });
    // The midpoint is ring 4 from the high bed and ring 4 from the low one; the
    // bed's own tie-break — lower level first — decides it.
    const mid = claims.find((c) => c.idx === index(r, 0, 0));
    expect(mid?.y).toBe(80 - Math.ceil(4 / APRON_RUN_PER_BLOCK));
  });
});

describe("B1 — the drop-on-higher-ground rule", () => {
  it("claims nothing at all where the ground already stands at the target", () => {
    // Flat ground level *with* the bed: every target is at or below it.
    const { claims } = skirtOf({ bedY: 70, groundY: 70 });
    expect(claims).toEqual([]);
  });

  it("skips the high columns and keeps the low ones on a split field", () => {
    const r = region(96);
    const { claims } = skirtOf({
      region: r,
      bedY: 80,
      // A cliff down the z axis: the west half is high ground, the east a dip.
      ground: (x) => (x < 0 ? 100 : 40),
    });
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      const i = claim.idx % r.width;
      expect(r.x0 + i).toBeGreaterThanOrEqual(0);
    }
  });

  it("fills only downward — every claim is above the ground it feathers", () => {
    const { claims } = skirtOf({ bedY: 80, groundY: 40 });
    for (const claim of claims) expect(claim.y).toBeGreaterThan(40);
  });

  it("still measures rings geometrically across a skipped column", () => {
    // A wall of high ground at ring 1 must not stop ring 2 from being ring 2:
    // the band's shape is a fact about the bed, not about the terrain.
    const r = region(96);
    const { claims } = skirtOf({
      region: r,
      bedY: 80,
      ground: (x, z) => (Math.max(Math.abs(x), Math.abs(z)) === 1 ? 100 : 40),
    });
    const ringTwo = claims.filter((c) => ringOf(r, c.idx) === 2);
    expect(ringTwo.length).toBe(16);
    for (const c of ringTwo) expect(c.y).toBe(79);
  });
});

describe("B1 — both caps", () => {
  it("caps at APRON_MAX for a wide bed", () => {
    expect(lineworkSkirtRings(64)).toBe(APRON_MAX);
    const { region: r, claims } = skirtOf({ bedY: 200, groundY: 0, crossWidth: 64 });
    let furthest = 0;
    for (const c of claims) furthest = Math.max(furthest, ringOf(r, c.idx));
    expect(furthest).toBe(APRON_MAX);
  });

  it("caps at twice its own cross-section width for a narrow bed", () => {
    // `programApronRings`' sentence: inside its own width the apron is
    // landscaping; past that it is landscape.
    expect(lineworkSkirtRings(3)).toBe(6);
    const { region: r, claims } = skirtOf({ bedY: 200, groundY: 0, crossWidth: 3 });
    let furthest = 0;
    for (const c of claims) furthest = Math.max(furthest, ringOf(r, c.idx));
    expect(furthest).toBe(6);
  });

  it("takes whichever cap is smaller, and never a negative one", () => {
    expect(lineworkSkirtRings(11)).toBe(22);
    expect(lineworkSkirtRings(13)).toBe(APRON_MAX);
    expect(lineworkSkirtRings(0)).toBe(0);
    expect(skirtOf({ crossWidth: 0 }).claims).toEqual([]);
  });
});

describe("B1 — the crossing subtraction applies to the skirt too", () => {
  it("gives a carriageway column no claim of any kind", () => {
    const r = region(96);
    const carriageway = new Uint8Array(r.width * r.depth);
    for (let z = -20; z <= 20; z++) carriageway[index(r, 5, z)] = 1;
    const { claims } = skirtOf({ region: r, bedY: 80, groundY: 40, carriageway });
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) expect(carriageway[claim.idx]).toBe(0);
  });

  it("gives a wet column no claim either", () => {
    const r = region(96);
    const fluidKind = new Uint8Array(r.width * r.depth).fill(FluidKind.NONE);
    for (let z = -20; z <= 20; z++) fluidKind[index(r, -5, z)] = FluidKind.WATER;
    const { claims } = skirtOf({ region: r, bedY: 80, groundY: 40, fluidKind });
    for (const claim of claims) expect(fluidKind[claim.idx]).toBe(FluidKind.NONE);
  });
});

/* -------------------------------------------------------------------------- */
/* the pass: B2, B3, one arbitration, and the reach law                        */
/* -------------------------------------------------------------------------- */

/** A 3×3 patch of ground a route may name. */
function patch(cx: number, cz: number): CoursePoint[] {
  const columns: CoursePoint[] = [];
  for (let z = cz - 1; z <= cz + 1; z++) {
    for (let x = cx - 1; x <= cx + 1; x++) columns.push({ x, z });
  }
  return columns;
}

/** The one viaduct fixture, plus a driver that remembers its commit batches. */
function runViaduct() {
  const r = region(160);
  const p = plan(r, (x) => {
    const base = 70 + Math.max(0, Math.min(6, Math.floor((x + 60) / 8)));
    const into = 16 - Math.abs(x);
    return into > 0 ? base - Math.min(16, into * 2) : base;
  });
  const carriageway = new Uint8Array(r.width * r.depth);
  const extents = new Map<string, CoursePoint[]>([
    ["west_yard", patch(-68, 0)],
    ["east_yard", patch(68, 0)],
  ]);
  const view: InfraPlacementView = {
    bounds: { x0: r.x0, z0: r.z0, width: r.width, depth: r.depth },
    extentOf: (id) => extents.get(id),
    corridorOf: () => undefined,
    maskOf: () => undefined,
    ground: (x, z) => {
      if (x < r.x0 || z < r.z0 || x >= r.x0 + r.width || z >= r.z0 + r.depth) return undefined;
      const k = index(r, x, z);
      if (p.fluidKind[k] !== FluidKind.NONE) return undefined;
      return p.ground[k] as number;
    },
    onRoad: (x, z) => carriageway[index(r, x, z)] === 1,
  };

  const def = INFRA_ENTRIES["viaduct"];
  if (def === undefined) throw new Error('the registry has no "viaduct" row');
  const job: InfraEntryJob = {
    nodePath: "world.viaduct",
    def,
    route: { form: "between", target: "west_yard → east_yard", targets: ["west_yard", "east_yard"] },
    params: {},
    seed: nodeSeed(20260817n, "world.viaduct", ""),
    gates: true,
  };

  const inner = driverForPlan(p);
  const batches: (readonly GroundIntent[])[] = [];
  const driver: GroundDriver = {
    get baseline() {
      return inner.baseline;
    },
    get intents() {
      return inner.intents;
    },
    record: (intents) => inner.record(intents),
    commit: (intents) => {
      batches.push([...intents]);
      inner.commit(intents);
    },
    view: () => inner.view(),
    finish: () => inner.finish(),
  };

  const result = declareLinework({
    region: r,
    jobs: [job],
    view,
    ground: driver,
    carriageway,
    fluidKind: inner.baseline.fluidKind,
  });
  return { result, batches, region: r, plan: p, driver };
}

describe("B2 — the skirt declares at `verge`, never at `structure.linework`", () => {
  it("names `verge`, whose rank is 140", () => {
    const { batches } = runViaduct();
    const intents = batches.flat();
    const skirts = intents.filter((i) => i.source.endsWith("#linework-skirt"));
    expect(skirts.length).toBe(1);
    const skirt = skirts[0] as GroundIntent;
    expect(skirt.sourceClass).toBe("verge");
    expect(INTENT_RANK[skirt.sourceClass]).toBe(140);
    // An apron outranking a street is the one thing the crossing subtraction
    // exists to prevent; rank is the belt to that brace.
    expect(INTENT_RANK[skirt.sourceClass]).toBeGreaterThan(INTENT_RANK["street.network"]);
    expect(INTENT_RANK[skirt.sourceClass]).toBeGreaterThan(INTENT_RANK["road.network"]);
    expect(skirt.kind).toBe("profile");
    expect(skirt.transition).toBe("ramp");
    expect([...skirt.columns].length).toBeGreaterThan(0);
  });

  it("leaves the bed itself at rank 25, unchanged", () => {
    const { batches } = runViaduct();
    const bedIntents = batches.flat().filter((i) => i.source.endsWith("#linework"));
    expect(bedIntents.length).toBeGreaterThan(0);
    for (const i of bedIntents) expect(i.sourceClass).toBe("structure.linework");
  });
});

describe("§3.13 — companion intents belong in one arbitration", () => {
  it("commits the skirt in the same `driver.commit` call as the bed", () => {
    const { batches } = runViaduct();
    expect(batches.length).toBe(1);
    const batch = batches[0] as readonly GroundIntent[];
    expect(batch.some((i) => i.sourceClass === "structure.linework" && i.kind === "profile")).toBe(
      true,
    );
    expect(batch.some((i) => i.sourceClass === "verge")).toBe(true);
    // The skirt rides last, after the bed's own three kinds.
    expect(batch[batch.length - 1]?.sourceClass).toBe("verge");
  });

  it("reports the skirt's size in the pass stats", () => {
    const { result, batches } = runViaduct();
    const skirt = batches.flat().find((i) => i.sourceClass === "verge") as GroundIntent;
    expect(result.stats["lineworkSkirtColumns"]).toBe([...skirt.columns].length);
    expect(result.stats["lineworkSkirtColumns"]).toBeGreaterThan(0);
  });
});

describe("B3 / the reach law — derived, never authored, and total on an empty list", () => {
  it("declares nothing when no job declares linework", () => {
    const r = region(64);
    const p = plan(r);
    const driver = driverForPlan(p);
    const before = [...p.ground];
    const result = declareLinework({
      region: r,
      jobs: [],
      view: {
        bounds: { x0: r.x0, z0: r.z0, width: r.width, depth: r.depth },
        extentOf: () => undefined,
        corridorOf: () => undefined,
        maskOf: () => undefined,
        ground: () => 70,
        onRoad: () => false,
      },
      ground: driver,
      carriageway: new Uint8Array(r.width * r.depth),
      fluidKind: driver.baseline.fluidKind,
    });
    expect(result.beds.size).toBe(0);
    expect(result.stats).toEqual({});
    expect(driver.intents).toEqual([]);
    expect([...p.ground]).toEqual(before);
  });

  it("takes no apron from the entry: the skirt is a function of the bed alone", () => {
    // B3's falsifiable form — the only inputs are the bed, its width and the
    // ground. Two calls with the same three agree column for column, and no
    // registry row, param or theme appears in the signature at all.
    const a = skirtOf({ bedY: 80, groundY: 40 });
    const b = skirtOf({ bedY: 80, groundY: 40 });
    expect(b.claims).toEqual(a.claims);
    const rows = Object.values(INFRA_ENTRIES);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row.params ?? {}).some((k) => /apron|skirt/i.test(k))).toBe(false);
    }
  });
});

/**
 * `layout.storeyCeiling` — the era's veto over how tall ordinary fabric builds.
 *
 * ## The walk this comes from
 *
 * Kai walked Troy (P3 c5, 2026-08-12): "it still chose modern building types
 * alongside the appropriate ones" — four-storey flat-fronted street walls with
 * a regular window grid standing among two-storey flat-roofed Aegean houses.
 * The archetypes were never the problem. The compile report's histogram shows
 * every tall building was a `terrace` whose *bays* were `megaron` and
 * `peristyle_house` out of the `classical_mediterranean` pack — the right
 * buildings, sixteen blocks of wall high. A regular grid of windows that tall
 * is an apartment block whatever it is made of.
 *
 * The terrace run drew its storeys straight from `INFILL_FLOORS[density]`
 * (medium is `[2, 4]`) and never asked the prominence field, so nothing between
 * the document's `era` and the street wall's height existed at all.
 *
 * ## What is pinned here
 *
 * 1. The row is registered under exactly the id `district.ts` calls, and is
 *    **total**: no `era` — or an era class the table has no opinion about —
 *    returns `ctx.today`, which is the byte-identity argument for every world
 *    that is not ancient.
 * 2. The ceiling reaches the two places a storey count is decided: the
 *    prominence field (per-lot infill) and the terrace run's floor range.
 * 3. The ceiling only ever lowers. It is not a target — an ancient quarter
 *    whose lots would have built two storeys still builds two.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { HeightField, centeredRegion, nodeSeed, type Region } from "@terrainist/stdlib";
import { validateSettlementDocument } from "@terrainist/spec";

import { fanOut, fanOutRow, installFanOutRows, intentFor, resolveIntents } from "../src/intent/index.js";
import { solveDistricts, type DistrictPassResult } from "../src/layout/district.js";
import { buildProminenceField } from "../src/layout/prominence.js";
import { ERA_STOREY_CEILING, LAYOUT_ROWS } from "../src/layout/streets-intent.js";
import type { Placement } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";

beforeAll(() => {
  installFanOutRows();
});

/** The resolved record for one world-scope intent. */
function scope(intent: unknown) {
  return intentFor(resolveIntents({ intent: intent as never, root: { id: "world" } }), "world");
}

const ROW = "layout.storeyCeiling";

function ceiling(intent: unknown, today: number | undefined = undefined): number | undefined {
  return fanOut<number | undefined>(ROW, scope(intent), { nodePath: "world", today });
}

/* -------------------------------------------------------------------------- */
/* the row exists, under the id its caller spells                              */
/* -------------------------------------------------------------------------- */

describe("the row", () => {
  it("is registered under exactly the id district.ts calls", () => {
    expect(fanOutRow(ROW)).toBeDefined();
    expect(LAYOUT_ROWS.storeyCeiling).toBe(ROW);
  });

  it("declares what it reads, for the registry dump", () => {
    expect(fanOutRow(ROW)?.reads).toEqual(["era"]);
    expect(fanOutRow(ROW)?.status).toBe("today");
    expect((fanOutRow(ROW)?.drives ?? "").length).toBeGreaterThan(20);
  });
});

/* -------------------------------------------------------------------------- */
/* totality — the gate                                                         */
/* -------------------------------------------------------------------------- */

describe("layout.storeyCeiling is total", () => {
  it("has no opinion for an intent that declares nothing", () => {
    expect(ceiling(undefined)).toBeUndefined();
    expect(ceiling(undefined, 5)).toBe(5);
  });

  it("has no opinion for an intent that declares every dial but era", () => {
    const busy = {
      wealth: 0.9,
      formality: 0.8,
      decline: 0.3,
      character: { label: "old town", urbanForm: "grown", motifs: { roofType: "flat" } },
    };
    expect(ceiling(busy)).toBeUndefined();
  });

  it("leaves every era class the table stays quiet about exactly as it was", () => {
    // The whole byte-identity argument for the worlds this must not move. If a
    // class is added to the table, this list shrinks *and* someone re-pins the
    // goldens for it deliberately.
    for (const era of ["medieval", "renaissance", "industrial", "modern", "far_future"]) {
      expect(ERA_STOREY_CEILING[era as keyof typeof ERA_STOREY_CEILING]).toBeUndefined();
      expect(ceiling({ era })).toBeUndefined();
      expect(ceiling({ era }, 9)).toBe(9);
    }
  });

  it("keeps an unknown era string on the default class, which has no ceiling", () => {
    // `LOAM-W480` already reported the word; the default class is `medieval`,
    // and the table says nothing about it.
    expect(ceiling({ era: "dieselpunk_moon" })).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* what it says where it does speak                                            */
/* -------------------------------------------------------------------------- */

describe("the ancient ceiling", () => {
  it("caps ancient fabric at three storeys, by every alias of the class", () => {
    for (const era of ["ancient", "antiquity", "classical", "roman", "greek", "bronze_age"]) {
      expect(ceiling({ era })).toBe(3);
    }
  });

  it("only ever lowers: a shorter ceiling already asked for survives", () => {
    expect(ceiling({ era: "ancient" }, 2)).toBe(2);
    expect(ceiling({ era: "ancient" }, 8)).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* the field honours it                                                        */
/* -------------------------------------------------------------------------- */

describe("the prominence field", () => {
  const bounds = { x0: 0, z0: 0, x1: 127, z1: 127 };
  const seed = nodeSeed(4242n, "world.downtown", "");

  /** Tallest storey count the field hands out over the whole region. */
  function tallest(storeyCeiling: number | undefined): number {
    const field = buildProminenceField({
      bounds,
      seed,
      ...(storeyCeiling === undefined ? {} : { storeyCeiling }),
    });
    let max = 0;
    for (let x = bounds.x0; x <= bounds.x1; x += 3) {
      for (let z = bounds.z0; z <= bounds.z1; z += 3) {
        const n = field.storeys(x, z, { density: "high", archetype: "townhouse" });
        if (n > max) max = n;
      }
    }
    return max;
  }

  it("builds as tall as it always did when no ceiling is passed", () => {
    // `high` density's floor is 3 and the lowrise cap is 3, so the assertion
    // that matters is the *identity* one below; this pins the baseline.
    expect(tallest(undefined)).toBeGreaterThanOrEqual(3);
  });

  it("never exceeds the ceiling it is given", () => {
    expect(tallest(2)).toBeLessThanOrEqual(2);
    expect(tallest(1)).toBe(1);
  });

  it("is byte-identical column by column with an absent ceiling and one above the range", () => {
    const open = buildProminenceField({ bounds, seed });
    const high = buildProminenceField({ bounds, seed, storeyCeiling: 64 });
    for (let x = bounds.x0; x <= bounds.x1; x += 7) {
      for (let z = bounds.z0; z <= bounds.z1; z += 7) {
        const ctx = { density: "high", archetype: "tower_block" } as const;
        expect(high.storeys(x, z, ctx)).toBe(open.storeys(x, z, ctx));
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the street wall honours it — the thing the walk actually saw                */
/* -------------------------------------------------------------------------- */

/**
 * The terrace run is where the Troy read came from, and it is a different code
 * path from the field: `INFILL_FLOORS[density]` with no prominence in it at
 * all. So the ceiling is asserted against a real fabric pass rather than
 * against the row alone — a row nobody reads is the failure mode this project
 * names in `docs/DESIGN.md`.
 */
describe("the terrace run under an ancient era", () => {
  const BOUNDS: Rect = { x0: -80, z0: -80, x1: 79, z1: 79 };
  /** A quarter that builds street walls: medium density draws floors 2..4. */
  const WALL = { fabric: "grid", density: "medium", mix: ["courtyard_house", "townhouse", "hall"] };

  function flatField(region: Region, height = 72): HeightField {
    const field = new HeightField(region);
    field.values.fill(height);
    return field;
  }

  function placement(): Placement {
    return {
      nodePath: "world.downtown",
      id: "downtown",
      translation: [BOUNDS.x0, 72, BOUNDS.z0],
      yaw: 0,
      mirror: false,
      size: [BOUNDS.x1 - BOUNDS.x0 + 1, 1, BOUNDS.z1 - BOUNDS.z0 + 1],
      footprint: BOUNDS,
      anchor: { x: 0, z: 0 },
      foundationY: 72,
    };
  }

  function lay(intent: unknown): DistrictPassResult {
    const validated = validateSettlementDocument({
      loam: "0.1",
      profile: "settlement",
      meta: { name: "storey_ceiling_fixture", worldSeed: 20260731 },
      ...(intent === undefined ? {} : { intent }),
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [256, 256] },
        children: [
          {
            id: "terrain",
            kind: "generator",
            generator: "terrain.heightfield@0",
            params: { amplitude: 4, baseHeight: 76, seaLevel: 62, octaves: 3, frequency: 0.004 },
          },
          { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
          {
            id: "downtown",
            kind: "district",
            envelope: { shape: "region", size: [160, 160] },
            params: WALL,
            constraints: [{ zone: "center" }],
          },
        ],
      },
    });
    const doc = validated.document;
    if (doc === undefined) {
      throw new Error(validated.diagnostics.map((d) => `${d.code} ${d.message}`).join("; "));
    }
    return solveDistricts({
      doc,
      worldSeed: 20260731n,
      field: flatField(centeredRegion(256, 256)),
      placements: [placement()],
    });
  }

  /** Every bay's storey count, over every terrace in the quarter. */
  function bayFloors(laid: DistrictPassResult): number[] {
    const out: number[] = [];
    for (const p of laid.placements) {
      if (!p.nodePath.includes(".terrace_")) continue;
      const params = laid.params.get(p.nodePath) as Record<string, unknown> | undefined;
      for (const bay of (params?.["bays"] ?? []) as readonly { floors: number }[]) {
        out.push(bay.floors);
      }
    }
    return out;
  }

  it("builds four-storey street walls with no era declared — the walk's world", () => {
    const floors = bayFloors(lay(undefined));
    expect(floors.length).toBeGreaterThan(4);
    expect(Math.max(...floors)).toBe(4);
  });

  it("caps every bay at three storeys once the era is ancient", () => {
    const floors = bayFloors(lay({ era: "ancient" }));
    expect(floors.length).toBeGreaterThan(4);
    expect(Math.max(...floors)).toBeLessThanOrEqual(3);
    // Still a street wall with variety in it, not one flattened height.
    expect(new Set(floors).size).toBeGreaterThan(1);
  });

  it("leaves a medieval quarter byte-identical to no era at all", () => {
    // The gate, measured on the product rather than on the row: the table has
    // no opinion about `medieval`, so nothing in the fabric may move.
    const none = lay(undefined);
    const medieval = lay({ era: "medieval" });
    expect(JSON.stringify(medieval.placements)).toBe(JSON.stringify(none.placements));
    expect(JSON.stringify([...medieval.params])).toBe(JSON.stringify([...none.params]));
  });
});

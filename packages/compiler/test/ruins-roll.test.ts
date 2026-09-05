/**
 * The ruin roll —.
 *
 * WP-1 extracted the engine and moved nothing; WP-2 made it take an arbitrary
 * shell. This is the work package where the word "ruins" finally reaches more
 * than one building at a time: a district's infill lots roll deterministically
 * into their ruined-variant shells, and how far gone each one is comes from
 * §6's band table rather than from a straight line through it.
 *
 * The plan names three tests and they are the three below, plus the reach law
 * (a district with no `decline`, and one below the onset, roll nothing at all)
 * and the band table itself.
 */

import { describe, expect, it } from "vitest";

import {
  DECAY_BANDS,
  HeightField,
  RUIN_ONSET,
  bandForDecline,
  bandForIntensity,
  centeredRegion,
  generateBuilding,
  nodeSeed,
  ruinShare,
  type Region
} from "@terrainist/stdlib";
import { validateSettlementDocument } from "@terrainist/spec/ir";

import { solveDistricts, type DistrictPassResult } from "../src/layout/district.js";
import type { Placement } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";

/* -------------------------------------------------------------------------- */
/* the fixture                                                                 */
/* -------------------------------------------------------------------------- */

const BOUNDS: Rect = { x0: -100, z0: -100, x1: 99, z1: 99 };
const SEED = 20260809n;

function flatField(region: Region, height = 72): HeightField {
  const field = new HeightField(region);
  field.values.fill(height);
  return field;
}

/** The ordinary quarter §10 tells an author to write: no ruin in the `mix`. */
const QUARTER = {
  fabric: "grid",
  density: "medium",
  mix: ["townhouse", "shop_row", "warehouse"]
};

function doc(intent: unknown, extraChild?: unknown): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "ruin_fixture", worldSeed: 20260809 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 4, baseHeight: 76, seaLevel: 62, frequency: 0.004 }
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "old_quarter",
          kind: "district",
          envelope: { shape: "region", size: [200, 200] },
          params: QUARTER,
          ...(intent === undefined ? {} : { intent }),
          constraints: [
            { zone: "center" },
            { terrain_conform: "flatten", reference: "median" }
          ],
          ...(extraChild === undefined ? {} : { children: [extraChild] })
        }
      ]
    }
  };
}

function lay(intent: unknown, extraChild?: unknown): DistrictPassResult {
  const validated = validateSettlementDocument(doc(intent, extraChild));
  const document = validated.document;
  if (document === undefined) {
    throw new Error(
      `fixture did not validate: ${validated.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  const region = centeredRegion(256, 256);
  const placement: Placement = {
    nodePath: "world.old_quarter",
    id: "old_quarter",
    translation: [BOUNDS.x0, 72, BOUNDS.z0],
    yaw: 0,
    mirror: false,
    size: [200, 1, 200],
    footprint: BOUNDS,
    anchor: { x: 0, z: 0 },
    foundationY: 72
  };
  return solveDistricts({
    doc: document,
    worldSeed: SEED,
    field: flatField(region),
    placements: [placement]
  });
}

/** Every infill node the fabric produced, with the decay it rolled (or none). */
function infillDecay(result: DistrictPassResult): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>();
  for (const node of result.nodes) {
    if (!node.tags?.includes("infill")) continue;
    const decay = result.params.get(node.nodePath)?.["decay"];
    out.set(node.id, typeof decay === "number" ? decay : undefined);
  }
  return out;
}

const ruinedCount = (result: DistrictPassResult): number =>
  [...infillDecay(result).values()].filter((d) => d !== undefined).length;

/* -------------------------------------------------------------------------- */
/* 1. the curve                                                                */
/* -------------------------------------------------------------------------- */

describe("the onset curve (§4.1)", () => {
  it("is exactly zero below the onset, and square above it", () => {
    expect(ruinShare(0)).toBe(0);
    expect(ruinShare(0.34)).toBe(0);
    expect(ruinShare(RUIN_ONSET)).toBeCloseTo(0.1225);
    expect(ruinShare(0.5)).toBeCloseTo(0.25);
    expect(ruinShare(0.7)).toBeCloseTo(0.49);
  });

  it("has no survivor cap: a dead city is total (Kai, 2026-08-09)", () => {
    expect(ruinShare(1)).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the band table                                                           */
/* -------------------------------------------------------------------------- */

describe("the intensity bands (§6)", () => {
  it("carries §6's three rows and nothing else", () => {
    expect(DECAY_BANDS.light.intensity).toBe(0.35);
    expect(DECAY_BANDS.heavy.intensity).toBe(0.6);
    expect(DECAY_BANDS.total.intensity).toBe(0.85);
    expect(DECAY_BANDS.heavy.collapseFloor(9)).toBe(3);
    expect(DECAY_BANDS.total.collapseFloor(9)).toBe(1);
    expect(DECAY_BANDS.light.collapseFloor(9)).toBe(7);
    expect(DECAY_BANDS.total.cornersStand).toBe(true);
  });

  it("puts each band's own intensity back in its own band", () => {
    for (const band of ["light", "heavy", "total"] as const) {
      expect(bandForIntensity(DECAY_BANDS[band].intensity)).toBe(band);
    }
  });

  it("bands decline at §6's boundaries, and jitters one lot in six", () => {
    expect(bandForDecline(0.4, 0.5)).toBe("light");
    expect(bandForDecline(0.6, 0.5)).toBe("heavy");
    expect(bandForDecline(0.9, 0.5)).toBe("total");
    // A twelfth each way, clamped at the ends of the table.
    expect(bandForDecline(0.6, 0.01)).toBe("light");
    expect(bandForDecline(0.6, 0.99)).toBe("total");
    expect(bandForDecline(0.9, 0.99)).toBe("total");
    expect(bandForDecline(0.4, 0.01)).toBe("light");
  });

  it("drives a deeper band to a lower wall and a heavier floor", () => {
    const build = (decay: number | undefined) =>
      generateBuilding({
        size: [11, 14, 11],
        params: { archetype: "townhouse", floors: 2, ...(decay === undefined ? {} : { decay }) },
        seed: nodeSeed(SEED, "world.ruin", ""),
        door: { face: "north", offset: 4 }
      });
    const light = build(DECAY_BANDS.light.intensity);
    const total = build(DECAY_BANDS.total.intensity);
    // Both ruined, and the deeper band takes more of the shell away.
    expect(light.meta.decay?.mode).toBe("shell");
    expect(total.meta.decay?.mode).toBe("shell");
    // The dials, one at a time. §6's `total` row is a deeper ruin in three
    // measurable ways: more rubble on the floor, more green on the survivors,
    // and a lower crumble line everywhere the corners are not standing (the
    // corners are §6's own "corner stumps", and they go to the plate).
    const count = (r: ReturnType<typeof generateBuilding>, pred: (b: string) => boolean): number =>
      r.ops.filter((op) => pred(op.block)).length;
    expect(count(total, (b) => b === "vine")).toBeGreaterThan(count(light, (b) => b === "vine"));
    expect(count(total, (b) => b === "moss_carpet")).toBeGreaterThanOrEqual(
      count(light, (b) => b === "moss_carpet"),
    );
    /** How much wall is left standing between the corners. */
    const curtain = (r: ReturnType<typeof generateBuilding>): number => {
      const wallTop = r.meta.wallTop;
      let standing = 0;
      for (const op of r.ops) {
        if (op.block === "air" || op.y < 2 || op.y > wallTop) continue;
        const edgeX = op.x === 0 || op.x === 10;
        const edgeZ = op.z === 0 || op.z === 10;
        if (!(edgeX || edgeZ) || (edgeX && edgeZ)) continue;
        standing++;
      }
      return standing;
    };
    expect(curtain(total)).toBeLessThan(curtain(light));
    // …and neither is refused, so neither reaches `LOAM-W510`.
    expect(light.meta.decay?.refused).toBe(false);
    expect(total.meta.decay?.refused).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the roll                                                                 */
/* -------------------------------------------------------------------------- */

describe("the per-lot roll (§4.2)", () => {
  it("rolls nothing at all with no decline — the reach law", () => {
    expect(ruinedCount(lay(undefined))).toBe(0);
    expect(ruinedCount(lay({ wealth: 0.6 }))).toBe(0);
  });

  it("rolls nothing below the onset, so a tired town is not a war", () => {
    expect(ruinedCount(lay({ decline: 0.2 }))).toBe(0);
    expect(ruinedCount(lay({ decline: 0.34 }))).toBe(0);
  });

  it("is deterministic: the same document twice, the same lots ruined", () => {
    const a = infillDecay(lay({ decline: 0.7 }));
    const b = infillDecay(lay({ decline: 0.7 }));
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect([...a.values()].some((d) => d !== undefined)).toBe(true);
  });

  it("is positional: a landmark elsewhere leaves the same lots ruined", () => {
    const plain = infillDecay(lay({ decline: 0.7 }));
    const withLandmark = infillDecay(
      lay({ decline: 0.7 }, {
        id: "cathedral",
        kind: "generator",
        generator: "building.grammar@0",
        envelope: { shape: "box", size: [20, 24, 30] },
        params: { archetype: "cathedral" }
      }),
    );
    // Every lot both fabrics built decided the same way. (The landmark claims
    // lots, so the sets are not identical — the *decisions* are.)
    let shared = 0;
    for (const [id, decay] of plain) {
      if (!withLandmark.has(id)) continue;
      shared++;
      expect(withLandmark.get(id), id).toBe(decay);
    }
    expect(shared).toBeGreaterThan(10);
  });

  it("ruins more of the street the further the decline runs", () => {
    const counts = [0.4, 0.55, 0.7, 0.85, 1].map((decline) => ruinedCount(lay({ decline })));
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i] as number, `decline step ${i}`).toBeGreaterThanOrEqual(
        counts[i - 1] as number,
      );
    }
    // The two ends are the claim: a quarter at the onset has survivors, and a
    // dead city has none.
    expect(counts[0] as number).toBeGreaterThan(0);
    const total = infillDecay(lay({ decline: 1 }));
    expect([...total.values()].every((d) => d !== undefined)).toBe(true);
  });

  it("never ruins a landmark the author declared", () => {
    const result = lay({ decline: 0.95 }, {
      id: "cathedral",
      kind: "generator",
      generator: "building.grammar@0",
      envelope: { shape: "box", size: [20, 24, 30] },
      params: { archetype: "cathedral" }
    });
    const landmark = result.nodes.find((n) => n.id === "cathedral");
    expect(landmark).toBeDefined();
    expect(result.params.get(landmark?.nodePath ?? "")?.["decay"]).toBeUndefined();
  });

  it("says what it did, every time, in LOAM-I512", () => {
    const quiet = lay({ decline: 0.2 }).diagnostics.find((d) => d.code === "LOAM-I512");
    expect(quiet?.severity).toBe("note");
    expect(quiet?.message).toContain("0 of");
    const loud = lay({ decline: 0.9 }).diagnostics.find((d) => d.code === "LOAM-I512");
    expect(loud?.message).toMatch(/\d+ of \d+ infill lots/);
    expect(loud?.message).toContain("total");
  });

  it("clusters: whole blocks go and pockets stand", () => {
    // The cluster field is keyed on the *block's* corner, so at a middling
    // share the ruined share of one block and of another differ by more than
    // independent per-lot rolls would explain. Measured as: not every block
    // has the same ruined share, and at least one block is entirely one way.
    const result = lay({ decline: 0.6 });
    const byBlock = new Map<string, { n: number; ruined: number }>();
    for (const node of result.nodes) {
      if (!node.tags?.includes("infill")) continue;
      // `infill_<x>_<z>` — the block is not on the node, so bucket by the
      // 40-column block grid the fixture laid.
      const [, x, z] = node.id.split("_").map(Number) as [number, number, number];
      const key = `${Math.floor(x / 40)},${Math.floor(z / 40)}`;
      const cell = byBlock.get(key) ?? { n: 0, ruined: 0 };
      cell.n++;
      if (result.params.get(node.nodePath)?.["decay"] !== undefined) {
        cell.ruined++;
      }
      byBlock.set(key, cell);
    }
    const shares = [...byBlock.values()].filter((c) => c.n >= 3).map((c) => c.ruined / c.n);
    expect(shares.length).toBeGreaterThan(3);
    expect(Math.max(...shares) - Math.min(...shares)).toBeGreaterThan(0.3);
  });
});

/**
 * The facing, taken again once the sites are real.
 *
 * The walked defect, second edition: a wading leviathan told to face the city
 * it was invading, whose `zone` hint was outbid by the ground, was carried four
 * hundred blocks past the city — and kept the quarter turn it had taken against
 * the hint, so it showed the city its back and the open sea its face.
 *
 * The correction is bounded by the footprint the solver already reserved: a
 * 180° flip never changes it, a quarter turn changes it unless the envelope is
 * square, and a turn that would change it is refused. These tests are that
 * boundary, from both sides.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { centeredRegion } from "@terrainist/stdlib";
import type { AuthoredProgramRecord, SettlementDocument } from "@terrainist/spec";

import {
  gateDoubleRun,
  planProgramFacings,
  remeasureLandmarkFacings,
  sourceHashOf,
} from "../src/programs/index.js";
import type { Placement } from "../src/layout/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function record(
  id: string,
  file: string,
  envelope: readonly [number, number, number],
): AuthoredProgramRecord {
  const source = readFileSync(path.join(here, "fixtures", "programs", file), "utf8");
  const draft: AuthoredProgramRecord = {
    mode: "landmark",
    envelope,
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000",
  };
  return { ...draft, outputHash: gateDoubleRun(id, draft, 0n).outputHash };
}

/** A front on a long plinth: 11 by 21, so a quarter turn is visible. */
const SENTINEL = record("sentinel", "sentinel.js", [11, 12, 21]);
/** A front on a square envelope: 9 by 9, so a quarter turn costs nothing. */
const WADER = record("wader", "wader.js", [9, 10, 9]);
/** No front at all — a target to face, which is never turned itself. */
const TOWER = record("tower", "tower.js", [17, 34, 17]);

const REGION = centeredRegion(256, 256);

function docWith(children: readonly Record<string, unknown>[]): SettlementDocument {
  return {
    programs: { sentinel: SENTINEL, wader: WADER, tower: TOWER },
    root: { id: "world", kind: "composite", children },
  } as unknown as SettlementDocument;
}

function landmark(
  id: string,
  zone: string,
  program: string,
  params?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id,
    kind: "generator",
    generator: `authored:${program}`,
    constraints: [{ zone }],
    ...(params === undefined ? {} : { params }),
  };
}

/** A placement, as much of one as the re-measurement reads. */
function placed(id: string, x: number, z: number, w: number, d: number): Placement {
  const x0 = x - Math.floor(w / 2);
  const z0 = z - Math.floor(d / 2);
  return {
    nodePath: `world.${id}`,
    id,
    footprint: { x0, z0, x1: x0 + w - 1, z1: z0 + d - 1 },
    anchor: { x, z },
  } as unknown as Placement;
}

/** The pre-solve answer and the post-solve one, for one document. */
function facings(
  children: readonly Record<string, unknown>[],
  placements: readonly Placement[],
): {
  before: ReadonlyMap<string, number>;
  after: ReadonlyMap<string, number>;
  codes: readonly string[];
} {
  const doc = docWith(children);
  const plan = planProgramFacings({
    doc,
    rootPath: "world",
    region: REGION,
    worldSeed: 0n,
    scope: "landmark",
  });
  const remeasured = remeasureLandmarkFacings({
    doc,
    rootPath: "world",
    region: REGION,
    worldSeed: 0n,
    placements,
    facings: plan.facings,
  });
  return {
    before: new Map([...plan.facings].map(([p, f]) => [p, f.rotation ?? 0])),
    after: remeasured.rotations,
    codes: remeasured.diagnostics.map((d) => d.code),
  };
}

describe("re-measuring a landmark's facing after the solve", () => {
  const children = [
    landmark("leviathan", "north", "sentinel", { face: { toward: "downtown" } }),
    landmark("downtown", "south", "tower"),
  ];

  it("turns the monster round when the ground carried it past the city", () => {
    // Estimated in the north, facing the town in the south: 180°. Placed in the
    // *far* south, past the town, where facing the town is 0° — and the flip
    // reserves the same 11 × 21 hole the solver already dug.
    const { before, after, codes } = facings(children, [
      placed("leviathan", 0, 120, 11, 21),
      placed("downtown", 0, 40, 17, 17),
    ]);
    expect(before.get("world.leviathan")).toBe(180);
    expect(after.get("world.leviathan")).toBe(0);
    expect(codes).toEqual(["LOAM-W522"]);
  });

  it("says nothing when the landmark stood where it was estimated", () => {
    const { before, after, codes } = facings(children, [
      placed("leviathan", 0, -100, 11, 21),
      placed("downtown", 0, 100, 17, 17),
    ]);
    expect(after.get("world.leviathan")).toBe(before.get("world.leviathan"));
    expect(after.get("world.leviathan")).toBe(180);
    expect(codes).toEqual([]);
  });

  it("refuses a quarter turn that would not fit the footprint the solver reserved", () => {
    // Carried due *east* of the town, the honest answer is west — a quarter
    // turn, which on an 11 × 21 envelope is a 21 × 11 hole the solver never
    // reserved. The estimate stands, and nothing is said about it.
    const { before, after, codes } = facings(children, [
      placed("leviathan", 110, 40, 11, 21),
      placed("downtown", 0, 40, 17, 17),
    ]);
    expect(before.get("world.leviathan")).toBe(180);
    expect(after.get("world.leviathan")).toBe(180);
    expect(codes).toEqual([]);
  });

  it("takes any turn for a square envelope, because a square hole is the same hole", () => {
    const square = [
      landmark("leviathan", "north", "wader", { face: { toward: "downtown" } }),
      landmark("downtown", "south", "tower"),
    ];
    const { before, after, codes } = facings(square, [
      placed("leviathan", 110, 40, 9, 9),
      placed("downtown", 0, 40, 17, 17),
    ]);
    expect(before.get("world.leviathan")).toBe(180);
    expect(after.get("world.leviathan")).toBe(270);
    expect(codes).toEqual(["LOAM-W522"]);
  });

  it("keeps the estimate for a landmark the solver never placed", () => {
    // No site, no better measurement: the town moved north of where the monster
    // expected to stand, but the monster has no `where` to measure from.
    const { before, after, codes } = facings(children, [placed("downtown", 0, -120, 17, 17)]);
    expect(after.get("world.leviathan")).toBe(before.get("world.leviathan"));
    expect(codes).toEqual([]);
  });

  it("is the same answer twice, and never turns a program with no front", () => {
    const placements = [placed("leviathan", 0, 120, 11, 21), placed("downtown", 0, 40, 17, 17)];
    const once = facings(children, placements);
    const twice = facings(children, placements);
    expect([...twice.after]).toEqual([...once.after]);
    // The frontless target is absent from both maps, before and after.
    expect(once.before.has("world.downtown")).toBe(false);
    expect(once.after.has("world.downtown")).toBe(false);
  });
});

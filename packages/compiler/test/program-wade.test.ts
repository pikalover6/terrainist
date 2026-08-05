/**
 * `seat: "wade"` — a landmark that stands *in* the water.
 *
 * The defect this file exists to prevent was walked in-game: a document asked
 * for a colossal sea god lying half-submerged in the shallows, and the compiler
 * put its 63,636 blocks on dry grass seventeen above sea level, with an
 * `UNSATISFIABLE` warning the author could do nothing about. Nothing they could
 * have written would have worked: the solver's freeboard veto refuses every
 * candidate footprint that reaches below sea level, and it was reachable only
 * from a harbour or a city.
 *
 * The claims:
 *
 * 1. `wade` reaches the solver — the node comes out of the document amphibious,
 *    and a pad one does not.
 * 2. A wading node is placed on a footprint that reaches below sea level, where
 *    the same node seated `pad` is pushed onto dry land.
 * 3. Wanting water is a *cost*, not a veto: a wading node on a map with no
 *    water is still placed, on the ground, rather than dropped.
 * 4. A wading node lays no pad — neither the solver's nor the program pass's.
 *    Filling a bay with dirt is the one thing it must never do.
 * 5. It seats on the **seabed**, so the waterline cuts it wherever its own
 *    height puts it.
 * 6. A wading scatter takes sites over water that a `pad` scatter refuses.
 * 7. `wade` + `hover` is a validation error, as every other seat is.
 * 8. A document using none of this is unchanged.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  HeightField,
  centeredRegion,
  classify,
  nodeSeed,
  resolveHeightfieldParams,
  type Classification,
  type Region,
} from "@terrainist/stdlib";
import type { AuthoredProgramRecord, ProgramScatterParams, SettlementDocument } from "@terrainist/spec";
import { validateLandmarkParams, type LoamDiagnostic } from "@terrainist/spec";

import { layoutNodesFrom } from "../src/layout/from-document.js";
import { padFor, solveLayout, type LayoutRequest, type Placement } from "../src/layout/index.js";
import { buildPrograms, gateDoubleRun, sourceHashOf } from "../src/programs/index.js";
import { planProgramSites, programGroundPlane } from "../src/programs/place.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import type { Rect } from "../src/layout/frames.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const stack = loadPrismarine("1.21.11");
const REGION: Region = centeredRegion(96, 96);
const SEA_LEVEL = 63;

function fixture(name: string): string {
  return readFileSync(path.join(here, "fixtures", "programs", name), "utf8");
}

function record(
  id: string,
  file: string,
  envelope: readonly [number, number, number],
  mode: AuthoredProgramRecord["mode"] = "both",
): AuthoredProgramRecord {
  const source = fixture(file);
  const draft: AuthoredProgramRecord = {
    mode,
    envelope,
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000",
  };
  return { ...draft, outputHash: gateDoubleRun(id, draft, 0n).outputHash };
}

const COLOSSUS = record("pylon", "pylon.js", [9, 14, 9]);

/* -------------------------------------------------------------------------- */
/* 1–3: the solver                                                             */
/* -------------------------------------------------------------------------- */

/** Flat land, with the western third eight blocks under the sea when asked. */
function makeWorld(water: boolean): { field: HeightField; classification: Classification } {
  const field = new HeightField(REGION);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      const wet = water && i < REGION.width / 3;
      field.values[j * REGION.width + i] = wet ? SEA_LEVEL - 8 : SEA_LEVEL + 6;
    }
  }
  const params = resolveHeightfieldParams({ seaLevel: SEA_LEVEL });
  return { field, classification: classify(field, params, {}) };
}

function hazards(classification: Classification, water: boolean): Uint8Array {
  const mask = new Uint8Array(REGION.width * REGION.depth);
  if (!water) return mask;
  for (let k = 0; k < mask.length; k++) {
    if (classification.oceanMask[k] === 1 || classification.lakeMask[k] === 1) mask[k] = 1;
  }
  return mask;
}

/** A one-landmark settlement document, seated however the caller says. */
function wadeDocument(seat: string | undefined): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "drowned_god", worldSeed: 5150 },
    programs: { pylon: COLOSSUS },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [96, 96] },
      children: [
        {
          id: "shrine",
          kind: "generator",
          generator: "authored:pylon",
          ...(seat === undefined ? {} : { params: { seat } }),
        },
      ],
    },
  };
}

function nodesOf(seat: string | undefined) {
  return layoutNodesFrom(wadeDocument(seat) as unknown as SettlementDocument, 5150n).nodes;
}

function solve(seat: string | undefined, water: boolean): Placement {
  const world = makeWorld(water);
  const request: LayoutRequest = {
    region: REGION,
    field: world.field,
    classification: world.classification,
    seaLevel: SEA_LEVEL,
    rootPath: "world",
    nodes: nodesOf(seat),
    hazardMask: hazards(world.classification, water),
    amphibiousHazardMask: new Uint8Array(REGION.width * REGION.depth),
  };
  const result = solveLayout(request);
  const placement = result.placements.find((p) => p.id === "shrine");
  if (placement === undefined) throw new Error("the shrine was not placed at all");
  return placement;
}

/** The lowest terrain column under a footprint. */
function minGround(field: HeightField, rect: Rect): number {
  let lo = Infinity;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const v = field.values[(z - REGION.z0) * REGION.width + (x - REGION.x0)] as number;
      if (v < lo) lo = v;
    }
  }
  return lo;
}

describe("wade reaches the solver", () => {
  it("makes the node amphibious, and water-seeking, where pad does not", () => {
    const [wading] = nodesOf("wade");
    const [padded] = nodesOf("pad");
    const [defaulted] = nodesOf(undefined);
    expect(wading?.amphibious).toBe(true);
    expect(wading?.wantsWater).toBe(true);
    expect(padded?.amphibious).toBeUndefined();
    expect(padded?.wantsWater).toBeUndefined();
    // The default seat is `pad`, and a document that says nothing is a document
    // that changed in no way at all.
    expect(defaulted?.amphibious).toBeUndefined();
  });

  it("does not make every authored landmark amphibious", () => {
    for (const seat of ["pad", "embed", "drape"]) {
      expect(nodesOf(seat)[0]?.amphibious).toBeUndefined();
    }
  });
});

describe("a wading landmark is placed in the water", () => {
  it("takes a footprint that reaches below sea level, where a pad one is pushed inland", () => {
    const world = makeWorld(true);
    const wading = solve("wade", true);
    const padded = solve("pad", true);
    expect(minGround(world.field, wading.footprint)).toBeLessThan(SEA_LEVEL);
    expect(minGround(world.field, padded.footprint)).toBeGreaterThan(SEA_LEVEL);
  });

  it("is still placed when the map turned out to be dry — water is a cost, not a veto", () => {
    const world = makeWorld(false);
    const wading = solve("wade", false);
    expect(minGround(world.field, wading.footprint)).toBeGreaterThan(SEA_LEVEL);
  });

  it("gets no pad edit: nobody fills a bay with dirt to make a plinth", () => {
    const [wading] = nodesOf("wade");
    const [padded] = nodesOf("pad");
    expect(padFor(wading!, solve("wade", true))).toBeNull();
    expect(padFor(padded!, solve("pad", true))).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 4–5: the program pass                                                       */
/* -------------------------------------------------------------------------- */

const FOOT: Rect = { x0: -4, z0: -4, x1: 4, z1: 4 };

function idx(plan: ColumnPlan, x: number, z: number): number {
  return (z - plan.region.z0) * plan.region.width + (x - plan.region.x0);
}

/** A dev plan with the whole western half flooded to a shallow bay. */
function floodedPlan(): ColumnPlan {
  const plan = devColumnPlan(REGION, stack);
  const waterY = plan.seaLevel;
  for (let z = REGION.z0; z < REGION.z0 + REGION.depth; z++) {
    for (let x = REGION.x0; x < REGION.x0 + Math.floor(REGION.width / 2); x++) {
      const i = idx(plan, x, z);
      plan.ground[i] = waterY - 5;
      plan.fluidTop[i] = waterY;
      plan.fluidKind[i] = FluidKind.WATER;
      plan.oceanMask[i] = 1;
    }
  }
  return plan;
}

/** A footprint wholly inside the bay. */
const BAY: Rect = { x0: REGION.x0 + 8, z0: REGION.z0 + 8, x1: REGION.x0 + 16, z1: REGION.z0 + 16 };

describe("programGroundPlane over water", () => {
  it("refuses a fluid column for pad, and takes it for wade", () => {
    const plan = floodedPlan();
    expect(programGroundPlane(plan, BAY)).toBeUndefined();
    const seabed = programGroundPlane(plan, BAY, undefined, true) as number;
    expect(seabed).toBe((plan.ground[idx(plan, BAY.x0, BAY.z0)] as number) + 1);
    expect(seabed).toBeLessThan(plan.seaLevel);
  });

  it("still refuses a seabed that falls away like a cliff", () => {
    const plan = floodedPlan();
    for (let z = BAY.z0; z <= BAY.z1; z++) {
      plan.ground[idx(plan, BAY.x0, z)] = (plan.ground[idx(plan, BAY.x0, z)] as number) - 40;
    }
    const refusals = { cliff: 0 };
    expect(programGroundPlane(plan, BAY, refusals, true)).toBeUndefined();
    expect(refusals.cliff).toBe(1);
  });
});

describe("a wading landmark seats on the seabed", () => {
  it("puts its seat plane on the seabed and emits no pad", () => {
    const plan = floodedPlan();
    const seabed = programGroundPlane(plan, BAY, undefined, true) as number;
    const before = plan.ground.slice();
    const result = buildPrograms({
      jobs: [
        {
          nodePath: "world.shrine",
          programId: "pylon",
          program: COLOSSUS,
          mode: "landmark",
          placement: { footprint: BAY, baseY: seabed, seat: { policy: "wade", embedDepth: 3 } },
        },
      ],
      plan,
      stack,
      worldSeed: 0n,
    });
    const placed = result.placed[0];
    // Node-local y = 0 lands on the seabed plane: seatY is 0 for this program,
    // and `wade` sinks it no further the way `embed` would.
    expect(placed?.baseY).toBe(seabed);
    expect(placed?.baseY).toBeLessThan(plan.seaLevel);
    // No pad: the ground the bay had is the ground the bay keeps.
    expect(Array.from(plan.ground)).toEqual(Array.from(before));
    // …and no block was written below the structure to make one.
    expect(result.blocks.some((b) => b.y < seabed)).toBe(false);
    // The waterline cuts it: part of the figure is under the sea, part above.
    const top = Math.max(...result.blocks.map((b) => b.y));
    expect(top).toBeGreaterThan(plan.seaLevel);
  });
});

/* -------------------------------------------------------------------------- */
/* 6: the plugin path                                                          */
/* -------------------------------------------------------------------------- */

describe("a wading scatter", () => {
  function sites(seat: string | undefined) {
    const plan = floodedPlan();
    const params = {
      program: "pylon",
      count: 6,
      spacing: 4,
      ...(seat === undefined ? {} : { seat }),
    } as unknown as ProgramScatterParams;
    return planProgramSites({
      params,
      envelope: COLOSSUS.envelope,
      plan,
      seed: nodeSeed(7n, "world.wrecks", ""),
    }).filter((s) => s.footprint.x1 < REGION.x0 + Math.floor(REGION.width / 2));
  }

  it("places instances over water where a pad scatter places none", () => {
    expect(sites("wade").length).toBeGreaterThan(0);
    expect(sites("pad")).toHaveLength(0);
    expect(sites(undefined)).toHaveLength(0);
  });

  it("is deterministic", () => {
    expect(sites("wade")).toEqual(sites("wade"));
  });
});

/* -------------------------------------------------------------------------- */
/* 7: validation                                                               */
/* -------------------------------------------------------------------------- */

describe("validation", () => {
  function diagnose(params: Record<string, unknown>): LoamDiagnostic[] {
    const out: LoamDiagnostic[] = [];
    validateLandmarkParams(out, params, "world.shrine");
    return out.filter((d) => d.severity === "error");
  }

  it("accepts wade on its own", () => {
    expect(diagnose({ seat: "wade" })).toEqual([]);
  });

  it("rejects wade together with hover", () => {
    const errors = diagnose({ seat: "wade", hover: 48 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => d.nodePath === "world.shrine.params.seat")).toBe(true);
  });

  it("rejects embedDepth beside wade — depth belongs to embed", () => {
    const errors = diagnose({ seat: "wade", embedDepth: 6 });
    expect(errors.some((d) => d.nodePath === "world.shrine.params.embedDepth")).toBe(true);
  });
});

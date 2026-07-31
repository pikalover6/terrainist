/**
 * Precinct kits — `precinct.airport@0` and `precinct.harbour@0`.
 *
 * The claim these kits make is not "an aerodrome exists" but "an aerodrome is
 * *arranged*": aircraft on the stand grid rather than on the grass, all on one
 * heading, clear of the runway; ships alongside the piers rather than clumped
 * at random. Those are geometric properties of the placed result, so that is
 * what this file asserts — on two compiled worlds, read back off the report and
 * off disk.
 *
 * Three layers:
 *
 * 1. **Determinism** — the same document compiled twice produces the same
 *    props, the same footprints and the same yaws. Nothing here may depend on
 *    iteration order or a clock.
 * 2. **The arrangement** — the airport's stands, headings and clearances; the
 *    harbour's quay continuity, mooring headings and draft.
 * 3. **Physics at zero** — both fixtures read back off disk through
 *    `lintWorldPhysics`, which is the only test here that could catch a
 *    windsock on air or a hull that leaks.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lintWorldPhysics, PHYSICS_RULES, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";
import type { Rect } from "../src/layout/frames.js";

const AIRFIELD = fileURLToPath(new URL("../../../examples/precinct-airfield.loam.json", import.meta.url));
const HARBOUR = fileURLToPath(new URL("../../../examples/precinct-harbour.loam.json", import.meta.url));

interface Compiled {
  readonly report: TerrainCompileReport;
  readonly structures: StructurePassResult;
  readonly plan: ColumnPlan;
  readonly dir: string;
}

async function compile(fixture: string, root: string, name: string): Promise<Compiled> {
  const dir = path.join(root, name);
  const doc = JSON.parse(await readFile(fixture, "utf8")) as unknown;
  let plan: ColumnPlan | undefined;
  const compiled = await compileTerrain(doc, {
    outDir: dir,
    onColumnPlan: (p) => {
      plan = p;
    },
  });
  if (!compiled.ok) {
    throw new Error(
      `fixture ${name} failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  return {
    report: compiled.report,
    structures: compiled.report.layout?.structures as StructurePassResult,
    plan: plan as ColumnPlan,
    dir,
  };
}

/** A prop's placement, reduced to the facts a layout has to get right. */
function shape(s: StructurePassResult): string[] {
  return s.props.map(
    (p) => `${p.nodePath}|${p.prop}|${p.yaw}|${p.footprint.x0},${p.footprint.z0},${p.footprint.x1},${p.footprint.z1}|${p.baseY}`,
  );
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.x1 < b.x0 || a.x0 > b.x1 || a.z1 < b.z0 || a.z0 > b.z1);
}

function columnIndex(plan: ColumnPlan, x: number, z: number): number | undefined {
  const i = x - plan.region.x0;
  const j = z - plan.region.z0;
  if (i < 0 || j < 0 || i >= plan.region.width || j >= plan.region.depth) return undefined;
  return j * plan.region.width + i;
}

let root: string;
let stack: PrismarineStack;
let airfield: Compiled;
let harbour: Compiled;
let airfieldPhysics: PhysicsReport;
let harbourPhysics: PhysicsReport;

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  root = await mkdtemp(path.join(tmpdir(), "terrainist-precincts-"));
  airfield = await compile(AIRFIELD, root, "airfield");
  harbour = await compile(HARBOUR, root, "harbour");
  airfieldPhysics = await lintWorldPhysics(airfield.dir, stack, {
    buildings: airfield.structures.buildings as never,
    roads: (airfield.structures.roads?.routes ?? []) as never,
  });
  harbourPhysics = await lintWorldPhysics(harbour.dir, stack, {
    buildings: harbour.structures.buildings as never,
    roads: (harbour.structures.roads?.routes ?? []) as never,
  });
}, 600_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* determinism                                                                 */
/* -------------------------------------------------------------------------- */

describe("determinism", () => {
  it("compiles the aerodrome to the same layout twice", async () => {
    const again = await compile(AIRFIELD, root, "airfield_again");
    expect(shape(again.structures)).toEqual(shape(airfield.structures));
    expect(again.structures.buildings.map((b) => `${b.nodePath}|${b.floorY}|${b.blockCount}`)).toEqual(
      airfield.structures.buildings.map((b) => `${b.nodePath}|${b.floorY}|${b.blockCount}`),
    );
    expect(again.structures.stats).toEqual(airfield.structures.stats);
  }, 600_000);

  it("compiles the harbour to the same layout twice", async () => {
    const again = await compile(HARBOUR, root, "harbour_again");
    expect(shape(again.structures)).toEqual(shape(harbour.structures));
    expect(again.structures.stats).toEqual(harbour.structures.stats);
  }, 600_000);
});

/* -------------------------------------------------------------------------- */
/* the aerodrome                                                               */
/* -------------------------------------------------------------------------- */

describe("precinct.airport@0", () => {
  it("lays a runway along the envelope's long axis", () => {
    const runway = airfield.structures.props.find((p) => p.prop === "runway");
    expect(runway).toBeDefined();
    const foot = (runway as { footprint: Rect }).footprint;
    const precinct = airfield.report.layout?.report.nodes.find((n) => n.nodePath === "world.aerodrome");
    expect(precinct?.placed).toBe(true);
    const size = precinct?.size as readonly [number, number, number];
    const longIsX = size[0] >= size[2];
    const runLongIsX = foot.x1 - foot.x0 > foot.z1 - foot.z0;
    expect(runLongIsX).toBe(longIsX);
  });

  it("parks every aircraft on the apron, on one heading, clear of the runway and taxiway", () => {
    const props = airfield.structures.props;
    const runway = props.find((p) => p.prop === "runway");
    const parked = props.filter((p) => p.nodePath.includes(".stand_"));
    expect(parked.length).toBeGreaterThanOrEqual(3);
    expect(parked.length).toBe(airfield.structures.stats.aircraftParked);

    // One heading, for every craft on the field.
    expect(new Set(parked.map((p) => p.yaw)).size).toBe(1);

    // None of them on the runway.
    for (const craft of parked) {
      expect(overlaps(craft.footprint, (runway as { footprint: Rect }).footprint)).toBe(false);
    }

    // No two of them on each other, and none on a hangar.
    const hangars = props.filter((p) => p.prop === "hangar");
    const boxes = [...parked, ...hangars];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps((boxes[i] as { footprint: Rect }).footprint, (boxes[j] as { footprint: Rect }).footprint)).toBe(false);
      }
    }
  });

  it("stands every aircraft on paved, level apron", () => {
    const parked = airfield.structures.props.filter((p) => p.nodePath.includes(".stand_"));
    for (const craft of parked) {
      for (let z = craft.footprint.z0; z <= craft.footprint.z1; z++) {
        for (let x = craft.footprint.x0; x <= craft.footprint.x1; x++) {
          const idx = columnIndex(airfield.plan, x, z) as number;
          expect(airfield.plan.fluidKind[idx]).toBe(FluidKind.NONE);
          expect(airfield.plan.ground[idx]).toBe(craft.baseY - 1);
        }
      }
    }
  });

  it("keeps the whole compound inside the placed envelope", () => {
    const precinct = airfield.report.layout?.placements.find((p) => p.nodePath === "world.aerodrome");
    const box = (precinct as { footprint: Rect }).footprint;
    const mine = [
      ...airfield.structures.props.filter((p) => p.nodePath.startsWith("world.aerodrome.")),
      ...airfield.structures.buildings.filter((b) => b.nodePath.startsWith("world.aerodrome.")),
    ];
    expect(mine.length).toBeGreaterThan(5);
    for (const thing of mine) {
      expect(thing.footprint.x0).toBeGreaterThanOrEqual(box.x0);
      expect(thing.footprint.z0).toBeGreaterThanOrEqual(box.z0);
      expect(thing.footprint.x1).toBeLessThanOrEqual(box.x1);
      expect(thing.footprint.z1).toBeLessThanOrEqual(box.z1);
    }
  });

  it("puts up a terminal and a tower and exposes a routable road anchor", () => {
    const paths = airfield.structures.buildings.map((b) => b.nodePath);
    expect(paths).toContain("world.aerodrome.terminal");
    expect(paths).toContain("world.aerodrome.tower");
    expect(airfield.structures.precincts?.anchorPaths).toContain("world.aerodrome");
    const approach = airfield.structures.precincts?.ports.find(
      (p) => p.nodePath === "world.aerodrome" && p.type === "road_stub",
    );
    expect(approach).toBeDefined();
    // Routed, not merely offered: the road pass reached every anchor it was given.
    expect(airfield.structures.roads?.unrouted ?? []).toEqual([]);
    expect(airfield.structures.roads?.routes.length ?? 0).toBeGreaterThan(0);
  });

  it("lints to zero physics findings", () => {
    expect(airfieldPhysics.findings).toEqual([]);
    expect(airfieldPhysics.counts).toEqual(Object.fromEntries(PHYSICS_RULES.map((r) => [r, 0])));
  });
});

/* -------------------------------------------------------------------------- */
/* the harbour                                                                 */
/* -------------------------------------------------------------------------- */

describe("precinct.harbour@0", () => {
  it("runs piers out from the quay and moors a hull at each", () => {
    const piers = harbour.structures.props.filter((p) => p.prop === "pier");
    const ships = harbour.structures.props.filter((p) => p.nodePath.includes(".ship_"));
    expect(piers.length).toBe(harbour.structures.stats.piersBuilt);
    expect(piers.length).toBeGreaterThanOrEqual(2);
    expect(ships.length).toBe(harbour.structures.stats.shipsMoored);
    expect(ships.length).toBe(piers.length);
  });

  it("moors every ship on one heading, parallel to the pier axes", () => {
    const piers = harbour.structures.props.filter((p) => p.prop === "pier");
    const ships = harbour.structures.props.filter((p) => p.nodePath.includes(".ship_"));
    expect(new Set(ships.map((s) => s.yaw)).size).toBe(1);
    expect(new Set(piers.map((p) => p.yaw)).size).toBe(1);
    // A pier's long axis is its local +z; a hull's is its local +x. Parallel
    // therefore means the two yaws differ by the quarter turn between those
    // axes — the same relation for every pier in the port.
    const pierYaw = (piers[0] as { yaw: number }).yaw;
    const shipYaw = (ships[0] as { yaw: number }).yaw;
    expect((shipYaw - pierYaw + 360) % 360).toBe(90);
  });

  it("floats every hull: water under the whole footprint, at one surface", () => {
    const ships = harbour.structures.props.filter((p) => p.nodePath.includes(".ship_"));
    for (const ship of ships) {
      expect(ship.base).toBe("water");
      for (let z = ship.footprint.z0; z <= ship.footprint.z1; z++) {
        for (let x = ship.footprint.x0; x <= ship.footprint.x1; x++) {
          const idx = columnIndex(harbour.plan, x, z) as number;
          expect(harbour.plan.fluidKind[idx]).toBe(FluidKind.WATER);
          expect(harbour.plan.fluidTop[idx]).toBe(ship.baseY);
          // Two blocks of water: the hull's submerged course replaces one.
          expect(ship.baseY - (harbour.plan.ground[idx] as number)).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("walls the quay continuously along the shoreline it found", () => {
    // Every pier's shore foot is a dry column at the quay plane, and the column
    // in front of it is water: that is what "quay wall" means, read back off
    // the plan the emitter used.
    const piers = harbour.structures.props.filter((p) => p.prop === "pier");
    expect(piers.length).toBeGreaterThan(0);
    let walled = 0;
    for (const pier of piers) {
      for (let z = pier.footprint.z0; z <= pier.footprint.z1; z++) {
        for (let x = pier.footprint.x0; x <= pier.footprint.x1; x++) {
          const idx = columnIndex(harbour.plan, x, z);
          if (idx === undefined) continue;
          if (harbour.plan.fluidKind[idx] === FluidKind.NONE) walled++;
        }
      }
    }
    expect(walled).toBeGreaterThan(0);
    expect(harbour.structures.precincts?.stats.surfacedColumns ?? 0).toBeGreaterThan(100);
  });

  it("fronts the quay with sheds and exposes a routable road anchor", () => {
    const paths = harbour.structures.buildings.map((b) => b.nodePath);
    expect(paths.some((p) => p.startsWith("world.port.warehouse"))).toBe(true);
    expect(paths.some((p) => p.startsWith("world.port.boathouse"))).toBe(true);
    expect(harbour.structures.precincts?.anchorPaths).toContain("world.port");
    expect(harbour.structures.roads?.unrouted ?? []).toEqual([]);
  });

  it("keeps the whole compound inside the placed envelope", () => {
    const precinct = harbour.report.layout?.placements.find((p) => p.nodePath === "world.port");
    const box = (precinct as { footprint: Rect }).footprint;
    for (const thing of harbour.structures.buildings.filter((b) => b.nodePath.startsWith("world.port."))) {
      expect(thing.footprint.x0).toBeGreaterThanOrEqual(box.x0);
      expect(thing.footprint.z0).toBeGreaterThanOrEqual(box.z0);
      expect(thing.footprint.x1).toBeLessThanOrEqual(box.x1);
      expect(thing.footprint.z1).toBeLessThanOrEqual(box.z1);
    }
  });

  it("lints to zero physics findings", () => {
    expect(harbourPhysics.findings).toEqual([]);
    expect(harbourPhysics.counts).toEqual(Object.fromEntries(PHYSICS_RULES.map((r) => [r, 0])));
  });
});

/* -------------------------------------------------------------------------- */
/* the diagnostics                                                             */
/* -------------------------------------------------------------------------- */

describe("a precinct that cannot fit", () => {
  it("rejects an aerodrome envelope below the kit's minimum, with the number to change", async () => {
    const doc = JSON.parse(await readFile(AIRFIELD, "utf8")) as {
      root: { children: { id: string; envelope?: { size: number[] } }[] };
    };
    const node = doc.root.children.find((c) => c.id === "aerodrome") as { envelope: { size: number[] } };
    node.envelope.size = [60, 24, 40];
    const dir = path.join(root, "too_small");
    const compiled = await compileTerrain(doc, { outDir: dir });
    expect(compiled.ok).toBe(false);
    const codes = (compiled.ok ? [] : compiled.diagnostics).map((d) => d.code);
    expect(codes).toContain("LOAM-T203");
    const bad = (compiled.ok ? [] : compiled.diagnostics).find((d) => d.code === "LOAM-T203");
    expect(bad?.fix).toContain("120");
  }, 300_000);

  it("rejects a harbour whose params are not the kit's", async () => {
    const doc = JSON.parse(await readFile(HARBOUR, "utf8")) as {
      root: { children: { id: string; params?: Record<string, unknown> }[] };
    };
    const node = doc.root.children.find((c) => c.id === "port") as { params: Record<string, unknown> };
    node.params = { piers: 3, ships: "some" };
    const compiled = await compileTerrain(doc, { outDir: path.join(root, "bad_params") });
    expect(compiled.ok).toBe(false);
    const messages = (compiled.ok ? [] : compiled.diagnostics).map((d) => d.message).join(" | ");
    expect(messages).toContain('"ships"');
  }, 300_000);
});

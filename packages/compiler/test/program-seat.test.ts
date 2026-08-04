/**
 * Seating an authored program on the ground — `seatY`, and `params.seat`.
 *
 * The defect this file exists to prevent was walked in-game: a bespoke hull
 * resting with visible grass gaps under it, "just placed in" rather than
 * integrated. Three causes, one per claim below.
 *
 * The claims:
 *
 * 1. `seatY` is APPLIED. A program that models three blocks of landing gear
 *    below its seat plane lands three blocks lower than one that does not, so
 *    the plane it declared is the plane that meets the ground.
 * 2. A hovering landmark ignores `seatY` — `hover` means "node-local y = 0 sits
 *    `hover` above the highest ground", and seating it would drop it.
 * 3. `seat: "pad"` (the default) raises the low columns under the footprint and
 *    updates `plan.ground`, so everything downstream measures the pad.
 * 4. `seat: "embed"` sinks the structure `embedDepth` further, cutting nothing.
 * 5. `seat: "drape"` does neither: no pad, no re-seat.
 * 6. A rough site is padded, not refused — and a cliff is refused out loud.
 */

import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { centeredRegion } from "@terrainist/stdlib";
import type { AuthoredProgramRecord, SeatDecision } from "@terrainist/spec";

import { buildPrograms, gateDoubleRun, sourceHashOf } from "../src/programs/index.js";
import { programGroundPlane, PROGRAM_MAX_RELIEF } from "../src/programs/place.js";
import { groundBase } from "../src/structures/props.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { compileTerrain } from "../src/terrain/compile.js";
import type { Rect } from "../src/layout/frames.js";
import type { ColumnPlan } from "../src/terrain/columns.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const stack = loadPrismarine("1.21.11");
const region = centeredRegion(96, 96);

function fixture(name: string): string {
  return readFileSync(path.join(here, "fixtures", "programs", name), "utf8");
}

function record(
  id: string,
  file: string,
  envelope: readonly [number, number, number],
  mode: AuthoredProgramRecord["mode"] = "landmark",
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

const FLAT = record("pylon", "pylon.js", [9, 14, 9]);
const GEAR = record("pylon_gear", "pylon-gear.js", [9, 17, 9]);

/** A fresh, flat dev plan — the pad mutates it, so no test may share one. */
function freshPlan(): ColumnPlan {
  return devColumnPlan(region, stack);
}

function idx(plan: ColumnPlan, x: number, z: number): number {
  return (z - plan.region.z0) * plan.region.width + (x - plan.region.x0);
}

const FOOT: Rect = { x0: -4, z0: -4, x1: 4, z1: 4 };

interface RunOptions {
  readonly program?: AuthoredProgramRecord;
  readonly hovering?: boolean;
  readonly seat?: SeatDecision;
  readonly plan?: ColumnPlan;
  readonly baseY?: number;
}

function seatRun(options: RunOptions = {}) {
  const plan = options.plan ?? freshPlan();
  const program = options.program ?? FLAT;
  const baseY = options.baseY ?? (programGroundPlane(plan, FOOT) as number);
  const result = buildPrograms({
    jobs: [
      {
        nodePath: "world.thing",
        programId: "pylon",
        program,
        mode: "landmark",
        placement: {
          footprint: FOOT,
          baseY,
          ...(options.hovering === true ? { hovering: true as const } : {}),
          ...(options.seat === undefined ? {} : { seat: options.seat }),
        },
      },
    ],
    plan,
    stack,
    worldSeed: 0n,
  });
  return { result, plan, baseY, placed: result.placed[0] };
}

describe("seatY", () => {
  it("is applied: gear below the seat plane goes below the ground plane", () => {
    const flat = seatRun({ program: FLAT });
    const gear = seatRun({ program: GEAR });
    expect(flat.placed?.seatY).toBe(0);
    expect(gear.placed?.seatY).toBe(3);
    // Same ground plane, same footprint: the only difference is the declared
    // seat, and it is worth exactly three blocks of elevation.
    expect(flat.baseY).toBe(gear.baseY);
    expect(gear.placed?.baseY).toBe((flat.placed?.baseY as number) - 3);
  });

  it("puts both programs' seat courses on the same world plane", () => {
    const flat = seatRun({ program: FLAT });
    const gear = seatRun({ program: GEAR });
    // Node-local seat course → world Y. That is the whole point.
    expect((flat.placed?.baseY as number) + 0).toBe((gear.placed?.baseY as number) + 3);
  });

  it("moves the anchors with the structure", () => {
    const gear = seatRun({ program: GEAR });
    const door = gear.result.markers.find((m) => m.id === "world.thing#door");
    // node-local y = 4 is one above the seat course, which sits on the plane.
    expect(door?.y).toBe(gear.baseY + 1);
  });

  it("is ignored by a hovering landmark — hover already fixed y = 0", () => {
    const hovering = seatRun({ program: GEAR, hovering: true, baseY: 200 });
    expect(hovering.placed?.baseY).toBe(200);
    expect(hovering.placed?.hovering).toBe(true);
    expect(hovering.placed?.seatY).toBe(3);
  });
});

describe("params.seat", () => {
  /** Sink a square of columns under the footprint, so the site is rough. */
  function dig(plan: ColumnPlan, depth: number): void {
    for (let z = FOOT.z0; z <= FOOT.z0 + 2; z++) {
      for (let x = FOOT.x0; x <= FOOT.x0 + 2; x++) {
        plan.ground[idx(plan, x, z)] = (plan.ground[idx(plan, x, z)] as number) - depth;
      }
    }
  }

  it('"pad" raises the low columns and updates plan.ground', () => {
    const plan = freshPlan();
    dig(plan, 6);
    const before = plan.ground[idx(plan, FOOT.x0, FOOT.z0)] as number;
    const run = seatRun({ plan, seat: { policy: "pad", embedDepth: 3 } });
    const after = plan.ground[idx(plan, FOOT.x0, FOOT.z0)] as number;
    expect(after).toBeGreaterThan(before);
    // Fill only, and exactly to the plane the structure seats on.
    expect(after).toBe(run.baseY - 1);
    expect(run.result.blocks.some((b) => b.x === FOOT.x0 && b.z === FOOT.z0 && b.y === after)).toBe(
      true,
    );
  });

  it('"drape" pads nothing and re-seats nothing', () => {
    const plan = freshPlan();
    dig(plan, 6);
    const before = plan.ground[idx(plan, FOOT.x0, FOOT.z0)] as number;
    const run = seatRun({ plan, program: GEAR, seat: { policy: "drape", embedDepth: 3 } });
    expect(plan.ground[idx(plan, FOOT.x0, FOOT.z0)]).toBe(before);
    expect(run.placed?.baseY).toBe(run.baseY);
  });

  it('"embed" sinks the structure by embedDepth, and cuts nothing', () => {
    const padded = seatRun({ seat: { policy: "pad", embedDepth: 3 } });
    const plan = freshPlan();
    const embedded = seatRun({ plan, seat: { policy: "embed", embedDepth: 5 } });
    expect(embedded.placed?.baseY).toBe((padded.placed?.baseY as number) - 5);
    // No terrain was removed to make room: the ground stands where it stood.
    expect(plan.ground[idx(plan, 0, 0)]).toBe(freshPlan().ground[idx(plan, 0, 0)]);
  });

  it("defaults to pad when the placement names no policy", () => {
    const plan = freshPlan();
    dig(plan, 6);
    const before = plan.ground[idx(plan, FOOT.x0, FOOT.z0)] as number;
    seatRun({ plan });
    expect(plan.ground[idx(plan, FOOT.x0, FOOT.z0)]).toBeGreaterThan(before);
  });
});

describe("programGroundPlane", () => {
  it("seats on the median column, not the highest — one boulder lifts nothing", () => {
    const plan = freshPlan();
    const flat = programGroundPlane(plan, FOOT) as number;
    plan.ground[idx(plan, 0, 0)] = (plan.ground[idx(plan, 0, 0)] as number) + 5;
    expect(programGroundPlane(plan, FOOT)).toBe(flat);
  });

  it("pads a rough site the prop tolerance used to refuse outright", () => {
    const plan = freshPlan();
    for (let z = FOOT.z0; z <= FOOT.z0 + 3; z++) {
      for (let x = FOOT.x0; x <= FOOT.x1; x++) {
        plan.ground[idx(plan, x, z)] = (plan.ground[idx(plan, x, z)] as number) - 6;
      }
    }
    expect(groundBase(plan, FOOT)).toBeUndefined();
    expect(programGroundPlane(plan, FOOT)).toBeGreaterThan(0);
  });

  it("still refuses a cliff, and counts the refusal for the caller to report", () => {
    const plan = freshPlan();
    for (let z = FOOT.z0; z <= FOOT.z1; z++) {
      plan.ground[idx(plan, FOOT.x0, z)] =
        (plan.ground[idx(plan, FOOT.x0, z)] as number) - (PROGRAM_MAX_RELIEF + 4);
    }
    const refusals = { cliff: 0 };
    expect(programGroundPlane(plan, FOOT, refusals)).toBeUndefined();
    expect(refusals.cliff).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* end to end: an embedded landmark through a compile                          */
/* -------------------------------------------------------------------------- */

function embedDocument(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "crash_moor", worldSeed: 5150 },
    programs: { pylon: record("pylon", "pylon.js", [9, 14, 9]) },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 10, seaLevel: 63, baseHeight: 78, erosionPasses: 1 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: { forceTheme: "temperate" } },
        {
          id: "wreck",
          kind: "generator",
          generator: "authored:pylon",
          params: { seat: "embed", embedDepth: 6 },
          constraints: [{ zone: "center" }],
        },
      ],
    },
  };
}

describe("an embedded landmark through the compile pipeline", () => {
  it("compiles clean and buries the hull rather than parking it on the lawn", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-seat-"));
    try {
      const result = await compileTerrain(embedDocument(), { outDir: path.join(dir, "crash_moor") });
      expect(result.ok).toBe(true);
      const report = result.report;
      expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      const row = (report.stats.programs ?? []).find((r) => r.nodePath === "world.wreck");
      expect(row).toMatchObject({ programId: "pylon", mode: "landmark", instances: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 300_000);
});

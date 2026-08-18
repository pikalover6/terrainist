/**
 * The `conform` seat — `docs/GROUND-UNIFICATION-v0.md` Part II, wave 9B.
 *
 * The shift this file guards is *pad under a prefab* → *conform by default*:
 * a program the gate certified seats on the real ground of the site it landed
 * on, and every program that was not certified — which is every archived
 * document — keeps today's pad, byte for byte.
 *
 * The claims:
 *
 * 1. The default is the record's verdict: `conforms: true` → `conform`,
 *    `false` or absent → `pad`. An explicit seat always wins.
 * 2. A conforming instance gets NO pad and NO apron: nothing outside its own
 *    footprint is written and `plan.ground` is left exactly as it was found.
 * 3. `underpinProgramInstance` still runs for it — the only ground courtesy
 *    left, a footing under the columns that would otherwise hang in the air.
 * 4. `conformSeatPlane` is the front anchor's own column plus one, and the
 *    median when there is no front.
 * 5. `rotatedHeightAt(nodeLocalHeight(...), r)` round-trips on a non-flat plan
 *    for all four rotations (§2.6's named hazard).
 * 6. `LOAM-T341` says why an instance is on a platform; `LOAM-T342` reports
 *    what the skirt and the hill were left holding.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { centeredRegion } from "@terrainist/stdlib";
import {
  hasErrors,
  validateSettlementDocument,
  type AuthoredProgramRecord,
  type SeatDecision,
} from "@terrainist/spec";

import { buildPrograms, gateDoubleRun, sourceHashOf } from "../src/programs/index.js";
import { nodeLocalHeight } from "../src/programs/pass.js";
import {
  conformSeatPlane,
  frontColumnOf,
  programGroundPlane,
  reliefUnder,
  type ProgramSite,
} from "../src/programs/place.js";
import { rotatedHeightAt, rotateLocalPoint, type ProgramRotation } from "../src/programs/rotate.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import type { Rect } from "../src/layout/frames.js";
import type { ColumnPlan } from "../src/terrain/columns.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const stack = loadPrismarine("1.21.11");
const region = centeredRegion(96, 96);

/** The 16×16 footprint both fixtures declare. */
const FOOT: Rect = { x0: -8, z0: -8, x1: 7, z1: 7 };
const ENVELOPE: readonly [number, number, number] = [16, 24, 16];

function fixture(name: string): string {
  return readFileSync(path.join(here, "fixtures", "programs", name), "utf8");
}

function record(
  id: string,
  file: string,
  envelope: readonly [number, number, number],
  extra: Partial<AuthoredProgramRecord> = {},
): AuthoredProgramRecord {
  const source = fixture(file);
  const draft: AuthoredProgramRecord = {
    mode: "landmark",
    envelope,
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000",
  };
  return { ...draft, outputHash: gateDoubleRun(id, draft, 0n).outputHash, ...extra };
}

const SHED = record("shed", "conforming-shed.js", ENVELOPE);
const PREFAB = record("prefab", "rigid-prefab.js", [16, 12, 16]);

function verdict(base: AuthoredProgramRecord, conforms?: boolean): AuthoredProgramRecord {
  return conforms === undefined ? base : { ...base, conforms };
}

function idx(plan: ColumnPlan, x: number, z: number): number {
  return (z - plan.region.z0) * plan.region.width + (x - plan.region.x0);
}

/** A flat dev plan; the pad mutates it, so no test shares one. */
function freshPlan(): ColumnPlan {
  return devColumnPlan(region, stack);
}

/** The same plan, falling one block per column toward local +Z. */
function slopedPlan(fall = 1): ColumnPlan {
  const plan = freshPlan();
  for (let z = FOOT.z0; z <= FOOT.z1; z++) {
    for (let x = FOOT.x0; x <= FOOT.x1; x++) {
      const i = idx(plan, x, z);
      plan.ground[i] = (plan.ground[i] as number) - fall * (z - FOOT.z0);
    }
  }
  return plan;
}

function groundSnapshot(plan: ColumnPlan): number[] {
  return [...plan.ground];
}

interface RunOptions {
  readonly program?: AuthoredProgramRecord;
  readonly plan?: ColumnPlan;
  readonly seat?: SeatDecision;
  readonly seatExplicit?: boolean;
  readonly rotation?: ProgramRotation;
}

function build(options: RunOptions = {}) {
  const plan = options.plan ?? freshPlan();
  const program = options.program ?? SHED;
  const baseY = programGroundPlane(plan, FOOT) as number;
  const result = buildPrograms({
    jobs: [
      {
        nodePath: "world.thing",
        programId: "shed",
        program,
        mode: "landmark",
        placement: {
          footprint: FOOT,
          baseY,
          ...(options.seat === undefined ? {} : { seat: options.seat }),
          ...(options.seatExplicit === undefined ? {} : { seatExplicit: options.seatExplicit }),
          ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
        },
      },
    ],
    plan,
    stack,
    worldSeed: 0n,
  });
  return { result, plan, baseY };
}

/** True when the pad ran: it raises `plan.ground` under the footprint. */
function padded(plan: ColumnPlan, before: readonly number[]): boolean {
  return plan.ground.some((g, i) => g !== before[i]);
}

describe("the seat a verdict resolves to", () => {
  it("conforms: true seats conform — nothing is levelled", () => {
    const plan = slopedPlan();
    const before = groundSnapshot(plan);
    build({ plan, program: verdict(SHED, true) });
    expect(padded(plan, before)).toBe(false);
  });

  it("conforms: false seats pad, exactly as today", () => {
    const plan = slopedPlan();
    const before = groundSnapshot(plan);
    build({ plan, program: verdict(PREFAB, false) });
    expect(padded(plan, before)).toBe(true);
  });

  it("no verdict at all seats pad — the archived-document story", () => {
    const plan = slopedPlan();
    const before = groundSnapshot(plan);
    build({ plan, program: PREFAB });
    expect(padded(plan, before)).toBe(true);
  });

  it("an explicit non-default seat beats the verdict", () => {
    const plan = slopedPlan();
    const before = groundSnapshot(plan);
    const run = build({
      plan,
      program: verdict(SHED, true),
      seat: { policy: "embed", embedDepth: 5 },
    });
    expect(padded(plan, before)).toBe(false);
    // Embedded, not conformed: the structure went down by `embedDepth`.
    expect(run.result.placed[0]?.baseY).toBe(run.baseY - 12 - 5);
  });

  it("an explicit pad beats the verdict when the placement says it was written", () => {
    const plan = slopedPlan();
    const before = groundSnapshot(plan);
    build({
      plan,
      program: verdict(SHED, true),
      seat: { policy: "pad", embedDepth: 3 },
      seatExplicit: true,
    });
    expect(padded(plan, before)).toBe(true);
  });

  it("rejects conform together with hover, like every other seat", () => {
    const doc = {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "hollow_dale", worldSeed: 42 },
      intent: {
        era: "modern",
        character: {
          programs: [{ id: "shed", mode: "both", brief: "a shed", envelope: [16, 24, 16] }],
        },
      },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [256, 256] },
        children: [
          { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
          { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
          {
            id: "the_shed",
            kind: "generator",
            generator: "authored:shed",
            constraints: [{ zone: "center" }],
            params: { hover: 20, seat: "conform" },
          },
        ],
      },
    };
    const out = validateSettlementDocument(doc);
    expect(hasErrors(out.diagnostics)).toBe(true);
    expect(out.diagnostics.some((d) => d.message.includes('"seat": "conform"'))).toBe(true);
  });
});

describe("what a conforming instance is given instead of a pad", () => {
  it("writes nothing outside its own footprint — no pad, no apron", () => {
    const plan = slopedPlan();
    const run = build({ plan, program: verdict(SHED, true) });
    const outside = run.result.blocks.filter(
      (b) => b.x < FOOT.x0 || b.x > FOOT.x1 || b.z < FOOT.z0 || b.z > FOOT.z1,
    );
    expect(outside).toHaveLength(0);
  });

  it("still gets the skirt: a half-conformed instance is footed, not floated", () => {
    // A rigid sole, seated `conform` on purpose: every downhill column of it
    // hangs in the air, which is exactly the case `underpinProgramInstance`
    // exists for and the only ground courtesy a conform seat has left.
    const plan = slopedPlan();
    const before = groundSnapshot(plan);
    const run = build({ plan, program: verdict(PREFAB, true) });
    expect(padded(plan, before)).toBe(false);
    const lowest = new Map<string, number>();
    for (const b of run.result.blocks) {
      const key = `${b.x},${b.z}`;
      const known = lowest.get(key);
      if (known === undefined || b.y < known) lowest.set(key, b.y);
    }
    // The downhill corner: the sole is well above its ground, and the skirt
    // reached down for it rather than leaving daylight.
    const deep = `${FOOT.x0},${FOOT.z1}`;
    const g = plan.ground[idx(plan, FOOT.x0, FOOT.z1)] as number;
    expect(lowest.get(deep)).toBeLessThan(run.result.placed[0]?.baseY as number);
    expect(lowest.get(deep)).toBeLessThanOrEqual(g + 1);
  });
});

describe("conformSeatPlane", () => {
  it("is the front anchor's own column plus one on a slope", () => {
    const plan = slopedPlan();
    const front = frontColumnOf(FOOT, 0, ENVELOPE);
    // Local −Z, mid-edge: the front of an unturned instance.
    expect(front).toEqual({ x: FOOT.x0 + 7, z: FOOT.z0 });
    expect(conformSeatPlane(plan, FOOT, front)).toBe(
      (plan.ground[idx(plan, front.x, front.z)] as number) + 1,
    );
    // The median plane is lower: the front is the high end of this slope.
    expect(conformSeatPlane(plan, FOOT, front)).toBeGreaterThan(
      programGroundPlane(plan, FOOT) as number,
    );
  });

  it("falls back to the median when there is no front", () => {
    const plan = slopedPlan();
    expect(conformSeatPlane(plan, FOOT)).toBe(programGroundPlane(plan, FOOT));
  });

  it("turns the front column with the instance", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const front = frontColumnOf(FOOT, rotation, ENVELOPE);
      expect(front.x).toBeGreaterThanOrEqual(FOOT.x0);
      expect(front.x).toBeLessThanOrEqual(FOOT.x1);
      expect(front.z).toBeGreaterThanOrEqual(FOOT.z0);
      expect(front.z).toBeLessThanOrEqual(FOOT.z1);
    }
    // A quarter turn moves the face to a different edge.
    expect(frontColumnOf(FOOT, 90, ENVELOPE)).not.toEqual(frontColumnOf(FOOT, 0, ENVELOPE));
  });

  it("seats a conforming landmark on its front, not on the median", () => {
    const plan = slopedPlan();
    const run = build({ plan, program: verdict(SHED, true), rotation: 0 });
    const front = frontColumnOf(FOOT, 0, ENVELOPE);
    const plane = (plan.ground[idx(plan, front.x, front.z)] as number) + 1;
    // `seatY` is 12, so node-local y = 0 is twelve below the seat plane.
    expect(run.result.placed[0]?.baseY).toBe(plane - 12);
  });
});

describe("reliefUnder — what PROGRAM_GENTLE_LIFT measures for a conform site", () => {
  it("is the fall across the footprint", () => {
    expect(reliefUnder(slopedPlan(1), FOOT)).toBe(15);
    expect(reliefUnder(freshPlan(), FOOT)).toBe(0);
  });
});

describe("the rotation round trip (§2.6)", () => {
  it("asks the terrain in the program's own frame, all four ways round", () => {
    const plan = slopedPlan(1);
    // A second axis of variation, so a swapped x/z cannot pass by symmetry.
    for (let x = FOOT.x0; x <= FOOT.x1; x++) {
      const i = idx(plan, x, FOOT.z0 + 3);
      plan.ground[i] = (plan.ground[i] as number) + (x - FOOT.x0);
    }
    const [w, , d] = ENVELOPE;
    for (const rotation of [0, 90, 180, 270] as const) {
      const site: ProgramSite = {
        index: 0,
        footprint: FOOT,
        baseY: 0,
        ...(rotation === 0 ? {} : { rotation }),
      };
      const turned = rotatedHeightAt(nodeLocalHeight(plan, site), rotation, ENVELOPE);
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          // The program asks in its unturned frame; the answer must be the
          // ground under the column that local point actually occupies once
          // the instance is turned into the world.
          const [rx, rz] = rotateLocalPoint(x, z, rotation, w, d);
          expect(turned(x, z)).toBe(plan.ground[idx(plan, FOOT.x0 + rx, FOOT.z0 + rz)] as number);
        }
      }
    }
  });
});

describe("the diagnostics", () => {
  it("LOAM-T341 says why an instance is on a platform", () => {
    const run = build({ plan: slopedPlan(), program: verdict(PREFAB, false) });
    const t341 = run.result.diagnostics.find((d) => d.code === "LOAM-T341");
    expect(t341?.name).toBe("PROGRAM_SEATED_PAD");
    expect(t341?.severity).toBe("note");
    expect(t341?.nodePath).toBe("world.thing");
  });

  it("says nothing about a record nobody judged", () => {
    const run = build({ plan: slopedPlan(), program: PREFAB });
    expect(run.result.diagnostics.some((d) => d.code === "LOAM-T341")).toBe(false);
  });

  it("LOAM-T342 reports the residual once per conforming node", () => {
    const run = build({ plan: slopedPlan(), program: verdict(SHED, true) });
    const t342 = run.result.diagnostics.filter((d) => d.code === "LOAM-T342");
    expect(t342).toHaveLength(1);
    expect(t342[0]?.name).toBe("PROGRAM_CONFORM_RESIDUAL");
    expect(t342[0]?.severity).toBe("note");
    expect(t342[0]?.message).toMatch(/of \d+ occupied columns/);
  });

  it("does not report a residual for a padded node", () => {
    const run = build({ plan: slopedPlan(), program: verdict(PREFAB, false) });
    expect(run.result.diagnostics.some((d) => d.code === "LOAM-T342")).toBe(false);
  });
});

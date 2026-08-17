/**
 * `infra.entry@0` — **family B**, the retaining / terrain-defining entries
 * (`docs/INFRA-ENTRIES-v0.md` §2 B, W7).
 *
 * The family is one sentence — *"a declared `face` between two levels"* — and
 * that sentence is the whole of what is worth testing here. A retaining wall
 * built as blocks stood on a hillside is a facade with raw dirt behind it; a
 * retaining wall built as a claim at `retaining.seam` is terrain, and the
 * difference is visible in exactly one place: `ColumnPlan.ground` after the
 * driver has resolved.
 *
 * So these tests read the *plan*, not the block list, for everything that
 * matters, and read the block list only for the two things a plan cannot say —
 * that the dressed course is the entry's own stone, and that the top of it is
 * standable.
 */

import { describe, expect, it } from "vitest";

import { INFRA_ENTRIES, nodeSeed, type InfraEntryDef, type Region } from "@terrainist/stdlib";

import { driverForPlan } from "../src/layout/ground-driver.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { index } from "../src/structures/roads.js";
import {
  buildInfraEntries,
  type InfraPlacementView,
  type InfraRouteSpec,
} from "../src/structures/infra-entry.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEED = nodeSeed(0x1f4a0n, "world.terrace");
const REGION: Region = { x0: -64, z0: -64, width: 128, depth: 128 };
const BOUNDS = { x0: REGION.x0, z0: REGION.z0, width: REGION.width, depth: REGION.depth };
const GROUND = 96;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** A field. `slope` tilts it east, which is the hillside a face is cut into. */
function flatPlan(slope = 0): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const ground = new Int32Array(n);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      ground[j * REGION.width + i] = GROUND + Math.round(slope * i);
    }
  }
  return {
    region: REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: 63,
    stoneSeed: 1,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0, caveAir: 0 },
  } as unknown as ColumnPlan;
}

/** The corridor a face runs `along` (and a flight runs `across`): x = 0. */
function roadLine(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = -40; z <= 40; z++) out.push({ x: 0, z });
  return out;
}

/** A holding to `ring`. */
const HOLDING = [
  { x: -20, z: -20 },
  { x: 20, z: -20 },
  { x: 20, z: 20 },
  { x: -20, z: 20 },
];

/** The corridor as a mask — what `across` measures its bounded chord against. */
function roadMask(): Uint8Array {
  const mask = new Uint8Array(REGION.width * REGION.depth);
  for (let z = -40; z <= 40; z++) {
    for (let x = -2; x <= 2; x++) mask[index(REGION, x, z)] = 1;
  }
  return mask;
}

const ROAD = roadMask();

function view(plan: ColumnPlan): InfraPlacementView {
  return {
    bounds: BOUNDS,
    extentOf: (id) => (id === "holding" ? HOLDING : undefined),
    corridorOf: (id) => (id === "high_road" ? roadLine() : undefined),
    maskOf: () => undefined,
    ground: (x, z) =>
      x >= BOUNDS.x0 &&
      z >= BOUNDS.z0 &&
      x < BOUNDS.x0 + BOUNDS.width &&
      z < BOUNDS.z0 + BOUNDS.depth
        ? (plan.ground[index(REGION, x, z)] as number)
        : undefined,
    onRoad: (x, z) =>
      x >= BOUNDS.x0 &&
      z >= BOUNDS.z0 &&
      x < BOUNDS.x0 + BOUNDS.width &&
      z < BOUNDS.z0 + BOUNDS.depth &&
      ROAD[index(REGION, x, z)] === 1,
  };
}

function entryDef(id: string): InfraEntryDef {
  return INFRA_ENTRIES[id] as InfraEntryDef;
}

function job(
  route: InfraRouteSpec,
  def: InfraEntryDef,
): {
  nodePath: string;
  def: InfraEntryDef;
  route: InfraRouteSpec;
  params: Record<string, unknown>;
  seed: Uint8Array;
  gates: boolean;
} {
  return { nodePath: "world.terrace", def, route, params: {}, seed: SEED, gates: true };
}

/** Build one family-B entry, with or without the ground driver. */
function build(
  id: string,
  route: InfraRouteSpec,
  options: { driver?: boolean; slope?: number } = {},
): { result: ReturnType<typeof buildInfraEntries>; plan: ColumnPlan; before: Int32Array } {
  const plan = flatPlan(options.slope ?? 0);
  const before = Int32Array.from(plan.ground);
  const driver = driverForPlan(plan);
  const result = buildInfraEntries({
    plan,
    stack,
    jobs: [job(route, entryDef(id))],
    view: view(plan),
    ...(options.driver === false ? {} : { ground: driver }),
  });
  return { result, plan, before };
}

/** The four rows W7 landed, in registry order. */
const FAMILY_B = ["retaining_wall", "terrace_steps", "acropolis_terrace", "castle_base_wall"];

/** Each row with a route it actually accepts. */
const ROUTES: Readonly<Record<string, InfraRouteSpec>> = {
  retaining_wall: { form: "along", target: "high_road", offset: 4 },
  terrace_steps: { form: "across", target: "high_road" },
  acropolis_terrace: { form: "ring", target: "holding" },
  castle_base_wall: { form: "ring", target: "holding" },
};

/* -------------------------------------------------------------------------- */

describe("family B declares rather than stacks", () => {
  it("moves the plan's own ground — the face is terrain, not a facade", () => {
    for (const id of FAMILY_B) {
      // The flight is measured on a hillside *steeper than its own cap*,
      // because on ground it can already follow a flight correctly declares
      // the levels it found — the run only cuts where the hill outruns it.
      const { result, plan, before } = build(id, ROUTES[id] as InfraRouteSpec, {
        slope: id === "terrace_steps" ? 2 : 0,
      });
      const built = result.entries[0];
      expect(built, id).toBeDefined();
      expect(built?.declared, id).toBeGreaterThan(0);
      // The claim went in *before* a block was laid, so the plan is different
      // from the field it was cut into. That is the whole family in one line.
      let moved = 0;
      for (let i = 0; i < before.length; i++) {
        if ((before[i] as number) !== (plan.ground[i] as number)) moved++;
      }
      expect(moved, id).toBeGreaterThan(0);
    }
  });

  it("raises rather than cuts, on the three rows whose bands are lifted", () => {
    // `terrace_steps` is the exception and is meant to be: a flight follows the
    // grade, so on flat ground it declares the ground it already had.
    for (const id of ["retaining_wall", "acropolis_terrace", "castle_base_wall"]) {
      const { plan, before } = build(id, ROUTES[id] as InfraRouteSpec);
      let lowered = 0;
      let raised = 0;
      for (let i = 0; i < before.length; i++) {
        const d = (plan.ground[i] as number) - (before[i] as number);
        if (d > 0) raised++;
        if (d < 0) lowered++;
      }
      expect(raised, id).toBeGreaterThan(0);
      // A retaining wall never digs: the low side is whatever was already
      // there, which is what "asymmetric, inward hand only" means in the plan.
      expect(lowered, id).toBe(0);
    }
  });

  it("makes a step, and the step is as tall as the row's own lift", () => {
    // A face between two levels: somewhere on the plan there is a pair of
    // 4-adjacent columns whose ground differs by the full lift. A row that
    // ramped its levels out would never produce one.
    const lifts: Readonly<Record<string, number>> = {
      retaining_wall: 3,
      acropolis_terrace: 6,
      castle_base_wall: 6,
    };
    for (const [id, lift] of Object.entries(lifts)) {
      const { plan } = build(id, ROUTES[id] as InfraRouteSpec);
      let tallest = 0;
      for (let z = REGION.z0 + 1; z < REGION.z0 + REGION.depth - 1; z++) {
        for (let x = REGION.x0 + 1; x < REGION.x0 + REGION.width - 1; x++) {
          const here = plan.ground[index(REGION, x, z)] as number;
          for (const [dx, dz] of [
            [1, 0],
            [0, 1],
          ] as const) {
            const drop = Math.abs(here - (plan.ground[index(REGION, x + dx, z + dz)] as number));
            if (drop > tallest) tallest = drop;
          }
        }
      }
      expect(tallest, id).toBe(lift);
    }
  });

  it("stands on the ground it finds when there is no driver — §3.12's fallback", () => {
    for (const id of FAMILY_B) {
      const { result } = build(id, ROUTES[id] as InfraRouteSpec, { driver: false });
      expect(result.entries[0]?.declared, id).toBe(0);
      expect(result.entries[0]?.columns, id).toBeGreaterThan(0);
    }
  });
});

describe("the flight — terrace_steps across a hillside", () => {
  it("never asks the walker for more than one block at a time", () => {
    // `follow: "grade"` at `maxGrade: 1` *is* the stair. On a hillside steep
    // enough to need one, consecutive columns of the declared run rise by at
    // most a block — which is the tread law's own geometry, arrived at by
    // declaring terrain rather than by stacking stair blocks.
    const { result, plan } = build(
      "terrace_steps",
      { form: "across", target: "high_road" },
      { slope: 2 },
    );
    const built = result.entries[0];
    expect(built?.declared).toBeGreaterThan(0);
    // Along the run's own axis (east–west, since the corridor runs north-south)
    // through the flight's centre line.
    const zs = new Set(result.blocks.map((b) => b.z));
    expect(zs.size).toBeGreaterThan(0);
    for (const z of zs) {
      const xs = result.blocks.filter((b) => b.z === z).map((b) => b.x);
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      for (let x = lo; x < hi; x++) {
        const a = plan.ground[index(REGION, x, z)] as number;
        const b = plan.ground[index(REGION, x + 1, z)] as number;
        expect(Math.abs(b - a), `${x},${z}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("what a walker finds on top", () => {
  it("is a solid, non-water course with two blocks of air over it", () => {
    // The walkability rule, and the reason no family-B row carries a `cap`.
    // Every column the entry wrote is the top course of the ground the resolver
    // gave, so the two courses above it must be untouched by this pass.
    for (const id of FAMILY_B) {
      const { result, plan } = build(id, ROUTES[id] as InfraRouteSpec);
      const written = new Set(result.blocks.map((b) => `${b.x},${b.y},${b.z}`));
      const names = new Set(
        result.blocks.map((b) => stack.blockNameByStateId(b.stateId) ?? "?"),
      );
      expect(names.size, id).toBeGreaterThan(0);
      for (const name of names) {
        // No water, no lava, no slab/stair/fence: the top of a terrace is
        // masonry a player stands on.
        expect(name, `${id}: ${name}`).not.toMatch(/water|lava|_(slab|stairs|fence|wall|gate)$/);
      }
      let standable = 0;
      let obstructed = 0;
      for (const b of result.blocks) {
        const g = plan.ground[index(REGION, b.x, b.z)] as number;
        // The dressed course is the resolved ground's own top block.
        if (b.y !== g) continue;
        standable++;
        // Air at the two courses a walker occupies. The only thing this pass
        // ever stands on its own terrace is a seated fitting — the sanctuary's
        // votive — and there are exactly as many of those as it seated.
        if (
          written.has(`${b.x},${g + 1},${b.z}`) ||
          written.has(`${b.x},${g + 2},${b.z}`)
        ) {
          obstructed++;
        }
      }
      expect(standable, id).toBeGreaterThan(0);
      expect(obstructed, id).toBeLessThanOrEqual(result.entries[0]?.fittings ?? 0);
      expect(obstructed, id).toBeLessThan(standable / 4);
    }
  });
});

describe("determinism", () => {
  it("builds the same face twice, block for block and level for level", () => {
    for (const id of FAMILY_B) {
      const a = build(id, ROUTES[id] as InfraRouteSpec);
      const b = build(id, ROUTES[id] as InfraRouteSpec);
      expect(JSON.stringify(a.result.blocks), id).toBe(JSON.stringify(b.result.blocks));
      expect([...a.plan.ground], id).toEqual([...b.plan.ground]);
    }
  });
});

describe("the diagnostics an unhostable face gets", () => {
  it("LOAM-T233 when the route names something that is not there", () => {
    const plan = flatPlan();
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [job({ form: "along", target: "nowhere" }, entryDef("retaining_wall"))],
      view: view(plan),
      ground: driverForPlan(plan),
    });
    expect(result.entries).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toContain("LOAM-T233");
    expect(result.blocks).toEqual([]);
  });

  it("LOAM-T232 for a face shorter than the row's own minRun", () => {
    const plan = flatPlan();
    const result = buildInfraEntries({
      plan,
      stack,
      jobs: [
        job({ form: "along", target: "high_road", offset: 4, run: 6 }, {
          ...entryDef("acropolis_terrace"),
          minRun: 200,
        }),
      ],
      view: view(plan),
      ground: driverForPlan(plan),
    });
    expect(result.diagnostics.map((d) => d.code)).toContain("LOAM-T232");
  });
});

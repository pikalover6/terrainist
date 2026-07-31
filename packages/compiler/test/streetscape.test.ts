/**
 * F4 — streetscape dressing, against a hand-built street graph.
 *
 * F1 is not merged, so there is no producer of a `StreetGraph` yet. The
 * fixture below *is* the contract: two avenues, three streets, six junctions
 * and a flat column plan, built the way `tunnels.test.ts` builds its plans —
 * which is the point of a hand-built fixture. It lets every property be
 * asserted against geometry chosen to provoke exactly that property (a step in
 * the ground for the curb rule; a flat field for the lamp rhythm) with no
 * compile in the way.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, type Region } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { FluidKind, type ColumnPlan } from "../src/terrain/columns.js";
import { index } from "../src/structures/roads.js";
import {
  CROSSING_DEPTH,
  CROSSING_SETBACK,
  FURNITURE_MIN_GAP,
  LAMP_SPACING,
  carriagewayOffsets,
  dressStreets,
  perp,
  walkStreet,
  type StreetGraph,
  type StreetscapeResult,
} from "../src/structures/streetscape.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEED = nodeSeed(0x5711eebn, "district.downtown");
const REGION: Region = { x0: -48, z0: -48, width: 96, depth: 96 };
const GROUND = 100;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** A flat plan, built exactly like `tunnels.test.ts`'s. */
function flatPlan(
  groundY = GROUND,
  height?: (x: number, z: number) => number,
): ColumnPlan {
  const n = REGION.width * REGION.depth;
  const ground = new Int32Array(n);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      ground[j * REGION.width + i] =
        height === undefined ? groundY : height(REGION.x0 + i, REGION.z0 + j);
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
    states: {
      bedrock: 0,
      stone: 0,
      deepslate: 0,
      water: 0,
      lava: 0,
      snowLayer: 0,
      caveAir: 0,
    },
  } as unknown as ColumnPlan;
}

/** Two avenues, three streets, six junctions, two-column sidewalks. */
function fixtureGraph(sidewalk = 2): StreetGraph {
  const avenues = [-16, 16];
  const streets = [-24, 0, 24];
  return {
    sidewalk,
    segments: [
      ...avenues.map((x, i) => ({
        id: `avenue-${i}`,
        kind: "avenue" as const,
        width: 7,
        path: [
          { x, z: -40 },
          { x, z: 40 },
        ],
      })),
      ...streets.map((z, i) => ({
        id: `street-${i}`,
        kind: "street" as const,
        width: 5,
        path: [
          { x: -40, z },
          { x: 40, z },
        ],
      })),
    ],
    intersections: avenues.flatMap((x, i) =>
      streets.map((z, j) => ({
        x,
        z,
        segments: [`avenue-${i}`, `street-${j}`],
      })),
    ),
  };
}

function dress(
  graph: StreetGraph,
  plan: ColumnPlan,
  furniture: "downtown" | "village" | "none" = "downtown",
): StreetscapeResult {
  return dressStreets(graph, { plan, stack, seed: SEED, furniture });
}

const at = (x: number, z: number): number => index(REGION, x, z);

/* -------------------------------------------------------------------------- */
/* determinism                                                                 */
/* -------------------------------------------------------------------------- */

describe("streetscape determinism", () => {
  it("two runs over identical inputs produce identical output", () => {
    const a = dress(fixtureGraph(), flatPlan());
    const b = dress(fixtureGraph(), flatPlan());
    expect(a.blocks).toEqual(b.blocks);
    expect(a.props).toEqual(b.props);
    expect(a.crossingColumns).toBe(b.crossingColumns);
    expect([...a.masks.sidewalk]).toEqual([...b.masks.sidewalk]);
    expect([...a.masks.curb]).toEqual([...b.masks.curb]);
  });

  it("mutates the plan identically on both runs", () => {
    const p1 = flatPlan();
    const p2 = flatPlan();
    dress(fixtureGraph(), p1);
    dress(fixtureGraph(), p2);
    expect([...p1.surface]).toEqual([...p2.surface]);
    expect([...p1.ground]).toEqual([...p2.ground]);
  });
});

/* -------------------------------------------------------------------------- */
/* sidewalks and curbs                                                         */
/* -------------------------------------------------------------------------- */

describe("sidewalk bands", () => {
  it("flank every carriageway on both sides", () => {
    const graph = fixtureGraph();
    const plan = flatPlan();
    const { masks } = dress(graph, plan);

    for (const segment of graph.segments) {
      const inner = ((segment.width - 1) >> 1) + 1;
      const outer = inner + graph.sidewalk - 1;
      for (const step of walkStreet(segment.path)) {
        for (const side of [1, -1]) {
          for (let k = inner; k <= outer; k++) {
            const c = perp(step, side * k);
            const idx = at(c.x, c.z);
            // Either this street's sidewalk, or another street's carriageway
            // where the two cross — junctions win, by construction.
            expect(
              masks.sidewalk[idx] === 1 || masks.carriageway[idx] === 1,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("paves the band flush with the carriageway and never on the carriageway", () => {
    const graph = fixtureGraph();
    const plan = flatPlan();
    const { masks } = dress(graph, plan);
    let paved = 0;
    for (let i = 0; i < masks.sidewalk.length; i++) {
      if (masks.sidewalk[i] !== 1) continue;
      expect(masks.carriageway[i]).toBe(0);
      expect(plan.ground[i]).toBe(GROUND);
      expect(plan.surface[i]).not.toBe(0);
      paved++;
    }
    expect(paved).toBeGreaterThan(1000);
  });

  it("reserves a continuous clear walk lane per side", () => {
    const graph = fixtureGraph();
    const plan = flatPlan();
    const { masks, blocks } = dress(graph, plan);
    const solid = new Set(blocks.map((b) => `${b.x},${b.z}`));

    // Every lane column is paved, and nothing at all stands on it — so the
    // 1x2 body of the physics walk passes down the whole run.
    const avenue = graph.segments[0] as StreetGraph["segments"][number];
    const inner = ((avenue.width - 1) >> 1) + 1;
    let lane = 0;
    for (const step of walkStreet(avenue.path)) {
      for (const side of [1, -1]) {
        const c = perp(step, side * inner);
        const idx = at(c.x, c.z);
        if (masks.carriageway[idx] === 1) continue; // a junction, not a lane
        expect(masks.walkLane[idx]).toBe(1);
        expect(solid.has(`${c.x},${c.z}`)).toBe(false);
        expect(plan.ground[idx]).toBe(GROUND);
        lane++;
      }
    }
    expect(lane).toBeGreaterThan(100);
  });

  it("lays the curb course only where the ground was already level", () => {
    const graph = fixtureGraph();
    // A ridge on the +x side of the first avenue: those columns are two blocks
    // proud of the carriageway, so they are cut to meet it and get no kerb.
    const plan = flatPlan(GROUND, (x) =>
      x >= -12 && x <= -11 ? GROUND + 2 : GROUND,
    );
    const { masks } = dress(graph, plan);

    let level = 0;
    let stepped = 0;
    for (let j = 0; j < REGION.depth; j++) {
      for (let i = 0; i < REGION.width; i++) {
        const idx = j * REGION.width + i;
        if (masks.sidewalk[idx] !== 1) continue;
        const x = REGION.x0 + i;
        if (x === -12 && masks.sidewalk[idx] === 1) {
          expect(masks.curb[idx]).toBe(0);
          stepped++;
        }
        if (masks.curb[idx] === 1) level++;
      }
    }
    expect(stepped).toBeGreaterThan(10);
    expect(level).toBeGreaterThan(100);

    // And on wholly flat ground the inner column of the band *is* the kerb.
    const flat = flatPlan();
    const flatRun = dress(fixtureGraph(), flat);
    const avenue = graph.segments[0] as StreetGraph["segments"][number];
    const inner = ((avenue.width - 1) >> 1) + 1;
    for (const step of walkStreet(avenue.path)) {
      const c = perp(step, inner);
      const idx = at(c.x, c.z);
      if (flatRun.masks.sidewalk[idx] !== 1) continue;
      expect(flatRun.masks.curb[idx]).toBe(1);
    }
  });

  it("never paves a wet column or one beside water", () => {
    const graph = fixtureGraph();
    const plan = flatPlan();
    // A pond straddling the first avenue's west sidewalk.
    for (let z = -10; z <= 10; z++) {
      for (let x = -22; x <= -20; x++) {
        plan.fluidKind[at(x, z)] = FluidKind.WATER;
      }
    }
    const { masks, blocks } = dress(graph, plan);
    for (let z = -10; z <= 10; z++) {
      for (let x = -22; x <= -20; x++) {
        expect(masks.y[at(x, z)]).toBe(-2147483648);
      }
    }
    for (const b of blocks) {
      expect(plan.fluidKind[at(b.x, b.z)]).toBe(FluidKind.NONE);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* lamps                                                                       */
/* -------------------------------------------------------------------------- */

describe("lamp posts", () => {
  it("stand at the fixed spacing, alternating sides, on solid sidewalk", () => {
    const graph = fixtureGraph();
    const plan = flatPlan();
    const { props, masks } = dress(graph, plan, "none");
    const lamps = props.filter((p) => p.prop === "lamp_post");
    expect(lamps.length).toBeGreaterThan(15);

    // Every lamp lands on a slot the schedule predicts, with the schedule's
    // side — computed here from the same rule, not read back from the output.
    const expected = new Set<string>();
    for (const segment of graph.segments) {
      const cells = walkStreet(segment.path);
      const outer = ((segment.width - 1) >> 1) + graph.sidewalk;
      let n = 0;
      for (let i = LAMP_SPACING >> 1; i < cells.length; i += LAMP_SPACING) {
        const side = n % 2 === 0 ? 1 : -1;
        n++;
        const a = perp(cells[i] as never, side * outer);
        expected.add(`${a.x},${a.z}`);
      }
    }
    let bothSides = 0;
    for (const lamp of lamps) {
      const ax = lamp.x + 1;
      const az = lamp.z + 1;
      expect(expected.has(`${ax},${az}`)).toBe(true);
      const idx = at(ax, az);
      // Solid sidewalk, paved by this pass, and never the walk lane.
      expect(masks.sidewalk[idx]).toBe(1);
      expect(masks.walkLane[idx]).toBe(0);
      expect(masks.y[idx]).toBe(GROUND);
      expect(lamp.baseY).toBe(GROUND);
      bothSides |= ax > -16 ? 1 : 2;
    }
    expect(bothSides).toBe(3);
  });

  it("plants nothing floating — every lamp block sits over paved ground", () => {
    const graph = fixtureGraph();
    const plan = flatPlan();
    const { blocks, masks } = dress(graph, plan, "none");
    for (const b of blocks) {
      const idx = at(b.x, b.z);
      expect(masks.sidewalk[idx]).toBe(1);
      expect(masks.y[idx]).toBe(GROUND);
      expect(b.y).toBeGreaterThan(GROUND);
    }
  });

  it("skips lighting a one-column sidewalk, and says why", () => {
    const { props, diagnostics } = dress(fixtureGraph(1), flatPlan(), "none");
    expect(props.filter((p) => p.prop === "lamp_post")).toHaveLength(0);
    expect(diagnostics.map((d) => d.code)).toContain("LOAM-E170");
  });
});

/* -------------------------------------------------------------------------- */
/* crossings                                                                   */
/* -------------------------------------------------------------------------- */

describe("crossings", () => {
  it("stripe every approach to every intersection", () => {
    const graph = fixtureGraph();
    const plan = flatPlan();
    const { masks } = dress(graph, plan, "none");
    expect(masks.carriageway.some((v) => v === 1)).toBe(true);

    for (const junction of graph.intersections) {
      for (const id of junction.segments) {
        const segment = graph.segments.find(
          (s) => s.id === id,
        ) as StreetGraph["segments"][number];
        const cells = walkStreet(segment.path);
        let best = 0;
        let bestD = Infinity;
        for (const [i, c] of cells.entries()) {
          const d = Math.abs(c.x - junction.x) + Math.abs(c.z - junction.z);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        const widest = Math.max(
          ...junction.segments.map(
            (s) =>
              (graph.segments.find((q) => q.id === s) as { width: number })
                .width,
          ),
        );
        const clear = ((widest - 1) >> 1) + CROSSING_SETBACK;
        for (const dir of [1, -1]) {
          let painted = 0;
          for (let d = 0; d < CROSSING_DEPTH; d++) {
            const step = cells[best + dir * (clear + 1 + d)];
            if (step === undefined) continue;
            for (const offset of carriagewayOffsets(segment.width)) {
              const c = perp(step as never, offset);
              const idx = at(c.x, c.z);
              if (masks.carriageway[idx] !== 1) continue;
              // Painted: the surface is no longer the plan's default 0.
              expect(plan.surface[idx]).not.toBe(0);
              painted++;
            }
          }
          expect(painted).toBeGreaterThan(0);
        }
      }
    }
  });

  it("is paint, not blocks — the carriageway keeps its height and carries no op", () => {
    const graph = fixtureGraph();
    const plan = flatPlan();
    const { blocks, masks, crossingColumns } = dress(graph, plan);
    expect(crossingColumns).toBeGreaterThan(50);
    for (let i = 0; i < masks.carriageway.length; i++) {
      if (masks.carriageway[i] === 1) expect(plan.ground[i]).toBe(GROUND);
    }
    for (const b of blocks) {
      expect(masks.carriageway[at(b.x, b.z)]).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* furniture                                                                   */
/* -------------------------------------------------------------------------- */

describe("district furniture", () => {
  it('places nothing at all for "none"', () => {
    const bare = dress(fixtureGraph(), flatPlan(), "none");
    expect(bare.props.every((p) => p.prop === "lamp_post")).toBe(true);
  });

  it("dresses downtown more densely than a village, and both off the walk lane", () => {
    for (const kit of ["downtown", "village"] as const) {
      const graph = fixtureGraph();
      const plan = flatPlan();
      const { props, blocks, masks } = dress(graph, plan, kit);
      const furniture = props.filter((p) => p.prop !== "lamp_post");
      expect(furniture.length).toBeGreaterThan(0);
      for (const b of blocks) {
        expect(masks.walkLane[at(b.x, b.z)]).toBe(0);
        expect(masks.sidewalk[at(b.x, b.z)]).toBe(1);
      }
    }
    const downtown = dress(fixtureGraph(), flatPlan(), "downtown").props.length;
    const village = dress(fixtureGraph(), flatPlan(), "village").props.length;
    expect(downtown).toBeGreaterThan(village);
  });

  it("never clumps: every object keeps the minimum gap", () => {
    const { props } = dress(fixtureGraph(), flatPlan(), "downtown");
    const anchors = props.map((p) =>
      p.prop === "lamp_post" ? { x: p.x + 1, z: p.z + 1 } : { x: p.x, z: p.z },
    );
    for (const [i, a] of anchors.entries()) {
      for (const b of anchors.slice(i + 1)) {
        const cheb = Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
        expect(cheb).toBeGreaterThanOrEqual(FURNITURE_MIN_GAP);
      }
    }
  });
});

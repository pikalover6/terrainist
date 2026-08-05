/**
 * `canal` — the form, the pass, and a compiled canal world at zero findings
 * (`docs/URBAN-FORMS-v0.md` §3.5, §4.3, §8.1, §8.2).
 *
 * Three layers, and the third is the one that can catch the interesting
 * failure. The form is a graph transform and is cheap to assert on. The pass
 * mutates the column plan, and every claim §8.2 makes about the *water* — one
 * Y, a solid shell, a bank exactly one proud — is a claim about what the pass
 * wrote, so it is asserted against a plan the test built itself. Then a real
 * canal quarter is compiled to a world folder and read back through all
 * twenty-six physics rules, because the risk this package carries is not "does
 * the canal look like a canal", it is "does everything downstream of the water
 * still hold" (§9.1).
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nodeSeed } from "@terrainist/stdlib";

import { CANAL_EVERY, CANAL_FORM, CANAL_MAX_FALL, canalDatum } from "../src/layout/forms/canal.js";
import { flatGround, type FormContext, type GroundSample } from "../src/layout/forms/types.js";
import { drawFabric } from "../src/layout/forms/registry.js";
import type { StreetGraph, StreetSegment } from "../src/layout/streets.js";
import { devColumnPlan } from "../src/devworld.js";
import { digCanals } from "../src/structures/canals.js";
import { CANAL_DEPTH } from "../src/structures/profiles.js";
import { surfaceStreetGraph } from "../src/structures/roads.js";
import { FluidKind } from "../src/terrain/columns.js";
import { checkFluidStability } from "../src/terrain/validate.js";
import { resolvePalette } from "../src/terrain/palette.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { compileTerrain } from "../src/terrain/compile.js";

const BOUNDS = { x0: 0, z0: 0, x1: 219, z1: 179 };
const SEED = nodeSeed(20260804n, "world.old_quarter", "");

const context = (over: Partial<FormContext> = {}): FormContext => ({
  bounds: BOUNDS,
  seed: SEED,
  blockSize: 44,
  sidewalk: 2,
  density: "medium",
  ground: flatGround(),
  focus: [],
  ...over,
});

/** A flat ground sample at `y`, with a sea `reach` columns away. */
function groundAt(y: number, over: Partial<GroundSample> = {}): GroundSample {
  return { ...flatGround(), height: () => y, ...over } as GroundSample;
}

function channelsOf(graph: StreetGraph): StreetSegment[] {
  return graph.segments.filter((s) => s.role === "channel");
}

/* -------------------------------------------------------------------------- */
/* the form                                                                    */
/* -------------------------------------------------------------------------- */

describe("the canal form", () => {
  it("draws the same quarter twice from one seed", () => {
    const a = CANAL_FORM.draw(context());
    const b = CANAL_FORM.draw(context());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(JSON.stringify(b.plan)).toBe(JSON.stringify(a.plan));
  });

  it("ignores the inputs it says it ignores, byte for byte", () => {
    // `FormRecord.ignored` is a promise, not a note: a silently ignored input is
    // this repo's most expensive recurring defect, so the claim is tested.
    const plain = CANAL_FORM.draw(context());
    const withFocus = CANAL_FORM.draw(
      context({
        focus: [{ kind: "plaza", at: { x: 40, z: 40 }, weight: 1 }],
        corridor: [{ x: 0, z: 90 }, { x: 1, z: 90 }],
      }),
    );
    expect(plain.ok && withFocus.ok).toBe(true);
    if (!plain.ok || !withFocus.ok) return;
    expect(JSON.stringify(withFocus.plan.graph)).toBe(JSON.stringify(plain.plan.graph));
    expect(plain.plan.record.ignored.join(" ")).toMatch(/focus/);
  });

  it("promotes lines on the quarter's long axis and declares one channel each", () => {
    const drawn = CANAL_FORM.draw(context());
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    const channels = channelsOf(drawn.plan.graph);
    expect(channels.length).toBeGreaterThan(0);
    // 220 × 180: the long axis is x, and a line running along x is an `ew` line.
    for (const segment of channels) expect(segment.id.startsWith("ew")).toBe(true);
    expect(drawn.plan.channels?.map((c) => c.segment).sort()).toEqual(
      channels.map((s) => s.id).sort(),
    );
    for (const channel of drawn.plan.channels ?? []) {
      expect(channel.depth).toBe(CANAL_DEPTH);
    }
    // Every `canalEvery`th line, and never the first or the last: those two are
    // the quarter's boundary streets and the next quarter anchors on them.
    const every = CANAL_EVERY.medium;
    const ew = drawn.plan.graph.segments.filter((s) => s.id.startsWith("ew"));
    const promoted = new Set(channels.map((s) => s.id));
    expect(promoted.has(ew[0]?.id as string)).toBe(false);
    expect(promoted.has(ew[ew.length - 1]?.id as string)).toBe(false);
    for (const segment of ew) {
      const line = Number.parseInt(segment.id.slice(2), 10);
      if (line === 0 || line === ew.length - 1) continue;
      expect(promoted.has(segment.id)).toBe(line % every === 1);
    }
  });

  it("keeps every path 4-connected and inside the quarter", () => {
    const drawn = CANAL_FORM.draw(context());
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    for (const segment of drawn.plan.graph.segments) {
      for (const [i, cell] of segment.path.entries()) {
        expect(cell.x).toBeGreaterThanOrEqual(BOUNDS.x0);
        expect(cell.x).toBeLessThanOrEqual(BOUNDS.x1);
        expect(cell.z).toBeGreaterThanOrEqual(BOUNDS.z0);
        expect(cell.z).toBeLessThanOrEqual(BOUNDS.z1);
        if (i === 0) continue;
        const previous = segment.path[i - 1] as { x: number; z: number };
        expect(Math.abs(cell.x - previous.x) + Math.abs(cell.z - previous.z)).toBe(1);
      }
    }
  });

  it("trims a channel clear of both ends of the quarter", () => {
    const ctx = context();
    const drawn = CANAL_FORM.draw(ctx);
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    // §3.5 step 3: a channel never opens onto an arterial or off the district.
    const trim = ctx.sidewalk + 2;
    for (const segment of channelsOf(drawn.plan.graph)) {
      const first = segment.path[0] as { x: number };
      const last = segment.path[segment.path.length - 1] as { x: number };
      expect(Math.min(first.x, last.x) - BOUNDS.x0).toBeGreaterThanOrEqual(trim);
      expect(BOUNDS.x1 - Math.max(first.x, last.x)).toBeGreaterThanOrEqual(trim);
    }
  });

  it("leaves the quarter connected as a graph, channels included", () => {
    const drawn = CANAL_FORM.draw(context());
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    // Segment adjacency: two segments are joined when they share a column. The
    // cross streets are what hold the quarter together once the canals cut it,
    // and this is the graph-level half of the claim the walking lint completes.
    const segments = drawn.plan.graph.segments;
    const cells = segments.map((s) => new Set(s.path.map((c) => `${c.x},${c.z}`)));
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const at = queue.pop() as number;
      for (const [j, other] of cells.entries()) {
        if (seen.has(j)) continue;
        let touches = false;
        for (const key of cells[at] as Set<string>) {
          if (other.has(key)) {
            touches = true;
            break;
          }
        }
        if (!touches) continue;
        seen.add(j);
        queue.push(j);
      }
    }
    expect(seen.size).toBe(segments.length);
  });

  it("cuts to the quarter's own level, and to the sea when the sea is near", () => {
    const pound = canalDatum(context({ ground: groundAt(80) }));
    expect(pound).toMatchObject({ surfaceY: 79, shared: false, low: 80, fall: 0 });

    const shore = canalDatum(
      context({ ground: groundAt(64, { seaLevel: 63, waterReach: 6 }) }),
    );
    expect(shore).toMatchObject({ surfaceY: 63, shared: true });

    // Far from the water the sea level is not the quarter's business, however
    // close the two numbers happen to be.
    const inland = canalDatum(context({ ground: groundAt(64, { seaLevel: 63, waterReach: 90 }) }));
    expect(inland).toMatchObject({ surfaceY: 63, shared: false });

    // A quay is never at or below its own canal, whatever the sea says.
    const low = canalDatum(context({ ground: groundAt(62, { seaLevel: 63, waterReach: 4 }) }));
    expect(low.surfaceY).toBe(61);
  });

  it("falls back to a grid, announced, when the quarter is too narrow", () => {
    // The real failure is size: a channel, two quays and a street behind each.
    const drawn = drawFabric({
      ...context({ blockSize: 70 }),
      fabric: "canal",
      nodePath: "world.old_quarter",
    });
    expect(drawn.ok).toBe(true);
    if (!drawn.ok) return;
    expect(drawn.outcome.plan.record.id).toBe("grid");
    expect(drawn.outcome.plan.record.requested).toBe("canal");
    expect(drawn.outcome.diagnostics).toHaveLength(1);
    const note = drawn.outcome.diagnostics[0] as { message: string; fix?: string };
    expect(note.message).toMatch(/blockSize 70/);
    expect(`${note.fix}`).toMatch(/envelope\.size|blockSize/);
    expect(channelsOf(drawn.outcome.plan.graph)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

describe("the canal pass", () => {
  let stack: PrismarineStack;

  beforeAll(() => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  });

  /** Dig one quarter's canals into a flat, dry plan. */
  const dig = () => {
    const region = { x0: BOUNDS.x0, z0: BOUNDS.z0, width: 220, depth: 180 };
    const plan = devColumnPlan(region, stack);
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    const quayY = plan.ground[0] as number;
    const drawn = CANAL_FORM.draw(context({ ground: groundAt(quayY) }));
    if (!drawn.ok) throw new Error("the canal form refused a 220 × 180 quarter");
    const result = digCanals({
      districts: [
        {
          nodePath: "world.old_quarter",
          bounds: BOUNDS,
          streets: drawn.plan.graph,
          ...(drawn.plan.channels === undefined ? {} : { channels: drawn.plan.channels }),
        },
      ],
      plan,
      palette,
      stack,
    });
    return { plan, region, result, quayY };
  };

  it("writes water at one Y over a solid shell", () => {
    const { plan, result, quayY } = dig();
    expect(result.water).toBeGreaterThan(500);
    const tops = new Set<number>();
    for (let k = 0; k < result.channelMask.length; k++) {
      if (result.channelMask[k] !== 1) continue;
      expect(plan.fluidKind[k]).toBe(FluidKind.WATER);
      tops.add(plan.fluidTop[k] as number);
      // The shell: `ground` is the bed, and everything under it is the terrain
      // body, so there is nothing to leak through.
      expect(plan.fluidTop[k] as number).toBe((plan.ground[k] as number) + CANAL_DEPTH);
      expect(plan.lakeMask[k]).toBe(0);
      expect(plan.oceanMask[k]).toBe(0);
    }
    expect([...tops]).toEqual([quayY - 1]);
  });

  it("leaves every bank exactly one block above the water", () => {
    const { plan, region, result, quayY } = dig();
    const surface = quayY - 1;
    let banks = 0;
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        const idx = j * region.width + i;
        if (result.channelMask[idx] !== 1) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const x = i + dx;
          const z = j + dz;
          if (x < 0 || z < 0 || x >= region.width || z >= region.depth) continue;
          const nidx = z * region.width + x;
          if (result.channelMask[nidx] === 1) continue;
          banks++;
          // One proud: the step a player takes out of the canal, the thing
          // `road.proud` measures, and the reason the fluid is stable.
          expect(plan.ground[nidx] as number).toBe(surface + 1);
          expect(plan.fluidKind[nidx]).toBe(FluidKind.NONE);
        }
      }
    }
    expect(banks).toBeGreaterThan(100);
  });

  it("leaves no fluid block with an exposed horizontal face", () => {
    // The whole of `checkFluidStability`, restated locally so the failure names
    // the canal rather than a compile-wide count.
    const { plan, region, result } = dig();
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        const idx = j * region.width + i;
        if (result.channelMask[idx] !== 1) continue;
        const top = plan.fluidTop[idx] as number;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const x = i + dx;
          const z = j + dz;
          if (x < 0 || z < 0 || x >= region.width || z >= region.depth) continue;
          const nidx = z * region.width + x;
          const g = plan.ground[nidx] as number;
          const f = plan.fluidTop[nidx] as number;
          expect(Math.max(g, f)).toBeGreaterThanOrEqual(top);
        }
      }
    }
  });

  it("notes a closed pound exactly once, and digs the canals anyway", () => {
    const { result } = dig();
    expect(result.diagnostics).toHaveLength(1);
    const note = result.diagnostics[0] as { code: string; message: string; fix?: string };
    expect(note.code).toBe("LOAM-T222");
    expect(note.message).toMatch(/closed pound/);
    expect(`${note.fix}`).toMatch(/river|shore/);
    expect(result.water).toBeGreaterThan(0);
  });

  it("decks every crossing of a channel by a street, with a rail", () => {
    // §4.1's whole point. Before the `canal` package a district street that met
    // water was marked "bridged" and given nothing at all: the deck was built
    // only for arterials. A crossing with no deck is a hole in the street.
    const { plan, region, result } = dig();
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    const drawn = CANAL_FORM.draw(context({ ground: groundAt(plan.ground[0] as number) }));
    if (!drawn.ok) throw new Error("the canal form refused a 220 × 180 quarter");
    const surfaced = surfaceStreetGraph({
      graphs: [drawn.plan.graph],
      plan,
      palette,
      stack,
      placements: [],
      buildingPaths: new Set<string>(),
    });
    expect(surfaced.bridgeColumns).toBeGreaterThan(0);

    // Every column a cross street carries over the water is decked, and the
    // deck carries a rail: `buildBridgeKit` is the arterial's kit, unchanged.
    const decked = new Set<string>();
    const railed = new Set<string>();
    const surfaceY = (plan.ground[0] as number) - 1;
    for (const block of surfaced.blocks) {
      const i = block.x - region.x0;
      const j = block.z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
      if (result.channelMask[j * region.width + i] !== 1) continue;
      if (block.y === surfaceY + 1) decked.add(`${block.x},${block.z}`);
      if (block.y > surfaceY + 1) railed.add(`${block.x},${block.z}`);
    }
    expect(decked.size).toBeGreaterThan(0);
    expect(railed.size).toBeGreaterThan(0);
  });

  /**
   * Dig one quarter's canals into a plan whose ground is `planY`, with the
   * heightfield the form reads reporting `formY`.
   *
   * The two are separate on purpose. `planY` is what the *column plan* says the
   * ground is by the time the canal pass runs — after the terrain edits, the
   * pads, the terracing and the dredging — and `formY` is what the heightfield
   * the form measured its datum against said two passes earlier. On a real
   * document they differ, and every leak this pass has ever sprung lived in the
   * gap between them.
   */
  const digOver = (formY: number, planY: number) => {
    const region = { x0: BOUNDS.x0, z0: BOUNDS.z0, width: 220, depth: 180 };
    const plan = devColumnPlan(region, stack);
    for (let k = 0; k < plan.ground.length; k++) {
      plan.ground[k] = planY;
      plan.fluidTop[k] = planY;
      plan.fluidKind[k] = FluidKind.NONE;
    }
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    const drawn = CANAL_FORM.draw(context({ ground: groundAt(formY) }));
    if (!drawn.ok) throw new Error("the canal form refused a 220 × 180 quarter");
    const result = digCanals({
      districts: [
        {
          nodePath: "world.old_quarter",
          bounds: BOUNDS,
          streets: drawn.plan.graph,
          ...(drawn.plan.channels === undefined ? {} : { channels: drawn.plan.channels }),
        },
      ],
      plan,
      palette,
      stack,
    });
    return { plan, result };
  };

  it("caps the ends of every run when the plan sits below the datum", () => {
    // The regression. A swept profile draws a *cross-section*: it covers the two
    // flanks of a run and says nothing about the columns off its two **ends**.
    // While the ground happened to be exactly the datum those end columns held
    // the water by luck; four blocks lower — which is what the terrain under a
    // real quarter does — every run poured out of both ends, and that is the
    // forty-block LOAM-T110 a generated canal city failed on.
    const { plan, result } = digOver(76, 72);
    expect(result.water).toBeGreaterThan(500);
    expect(checkFluidStability(plan).unstable).toBe(0);
  });

  it("holds its water when the plan stands above the datum too", () => {
    // The mirror case, for the same reason: a canal cut into a shelf that is
    // higher than the heightfield said must not leave a bank *below* its water.
    const { plan, result } = digOver(76, 80);
    expect(result.water).toBeGreaterThan(500);
    expect(checkFluidStability(plan).unstable).toBe(0);
  });

  it("touches nothing when no quarter declared a channel", () => {
    const region = { x0: 0, z0: 0, width: 64, depth: 64 };
    const plan = devColumnPlan(region, stack);
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    const before = JSON.stringify([...plan.ground, ...plan.fluidKind, ...plan.fluidTop]);
    const result = digCanals({ districts: [], plan, palette, stack });
    expect(result).toMatchObject({ water: 0, banks: 0, diagnostics: [] });
    expect(JSON.stringify([...plan.ground, ...plan.fluidKind, ...plan.fluidTop])).toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/* a compiled canal world                                                      */
/* -------------------------------------------------------------------------- */

/** A canal quarter on a coastal plain — the acceptance world for §3.5. */
const CANAL_DOC = {
  loam: "0.1",
  profile: "settlement",
  meta: { name: "canal_quarter", worldSeed: 20260804, prompt: "a canal quarter of merchant houses" },
  root: {
    id: "world",
    kind: "composite",
    envelope: { shape: "region", size: [320, 320] },
    children: [
      {
        id: "terrain",
        kind: "generator",
        generator: "terrain.heightfield@0",
        params: {
          seaLevel: 63,
          baseHeight: 70,
          amplitude: 6,
          octaves: 3,
          frequency: 0.004,
          lacunarity: 2,
          gain: 0.5,
          erosionPasses: 1,
          cliffThreshold: 70,
          soilDepth: 4,
          beachWidth: 4,
          snowLineFraction: 1,
        },
      },
      { id: "climate", kind: "generator", generator: "terrain.climate@0", params: { forceTheme: "temperate" } },
      {
        id: "old_quarter",
        kind: "district",
        label: "the canal quarter",
        envelope: { shape: "region", size: [220, 180] },
        params: {
          fabric: "canal",
          density: "medium",
          mix: ["townhouse", "warehouse", "shop_row"],
          blockSize: 44,
        },
        constraints: [{ zone: "center" }, { terrain_conform: "flatten", reference: "median", blend: 8 }],
        tags: ["district", "urban"],
      },
    ],
  },
};

describe("a compiled canal world", () => {
  const scratch: string[] = [];
  let stack: PrismarineStack;
  let dir: string;
  let report: PhysicsReport;
  let compiled: Awaited<ReturnType<typeof compileTerrain>>;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-canal-"));
    scratch.push(root);
    dir = path.join(root, "canal_quarter");
    compiled = await compileTerrain(structuredClone(CANAL_DOC), { outDir: dir });
    if (!compiled.ok) {
      throw new Error(`canal compile failed: ${compiled.diagnostics.map((d) => d.message).join("; ")}`);
    }
    const structures = (compiled.report as unknown as {
      layout?: { structures?: { buildings?: unknown[]; roads?: { routes?: unknown[] }; props?: unknown[] } };
    }).layout?.structures;
    report = await lintWorldPhysics(dir, stack, {
      buildings: (structures?.buildings ?? []) as never,
      roads: (structures?.roads?.routes ?? []) as never,
      props: (structures?.props ?? []) as never,
    });
  }, 600_000);

  afterAll(async () => {
    for (const root of scratch) await rm(root, { recursive: true, force: true });
  });

  it("draws the quarter the document asked for", () => {
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const districts = (compiled.report as unknown as {
      layout?: { districts?: readonly { form: { id: string }; channels?: readonly unknown[] }[] };
    }).layout?.districts;
    const quarter = districts?.[0];
    expect(quarter?.form.id).toBe("canal");
    expect((quarter?.channels ?? []).length).toBeGreaterThan(0);
  });

  it("settles every block of its water", () => {
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.report.stats.unstableFluidBlocks).toBe(0);
  });

  it("finds nothing wrong, under every physics rule", () => {
    const summary = report.findings
      .slice(0, 12)
      .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
      .join("\n");
    expect(summary).toBe("");
    for (const rule of PHYSICS_RULES) expect(report.counts[rule], rule).toBe(0);
  });
});

/**
 * The same quarter on ground nobody flattened — the acceptance case for the
 * leak.
 *
 * {@link CANAL_DOC} carries a `terrain_conform: "flatten"` constraint, so its
 * quarter is levelled before the canal pass ever sees it and one water datum
 * fits it exactly. That is the easy half of the world and it is the half that
 * shipped green while a generated canal city failed LOAM-T110 on forty blocks
 * of water pouring out of the ends of its runs. This document drops the flatten
 * and puts a hill through the middle of the quarter, so the ground under the
 * runs genuinely falls away, and asserts the whole claim end to end: the canals
 * are still dug, none of their water moves, and the emitted world reads back
 * clean under all twenty-six physics rules.
 */
const SLOPED_CANAL_DOC = (() => {
  const doc = structuredClone(CANAL_DOC) as unknown as {
    meta: { name: string };
    root: {
      children: {
        id: string;
        children?: unknown[];
        constraints?: unknown[];
        params?: Record<string, unknown>;
      }[];
    };
  };
  doc.meta.name = "canal_slope";
  const terrain = doc.root.children.find((c) => c.id === "terrain");
  if (terrain === undefined) throw new Error("the fixture lost its terrain node");
  terrain.children = [
    {
      id: "quarter_shelf",
      kind: "generator",
      generator: "terrain.edit@0",
      label: "the shelf the canal quarter half stands on",
      params: { verb: "plateau", at: [0.5, 0.3], radius: 130, height: 8, profile: "rounded" },
    },
  ];
  const quarter = doc.root.children.find((c) => c.id === "old_quarter");
  if (quarter === undefined) throw new Error("the fixture lost its quarter");
  // `drape` is the solver's "leave the ground alone": the default `cut_fill`
  // would level the quarter under the quarter and there would be nothing to
  // fall away. This is the one constraint that makes the document a test.
  quarter.constraints = [{ zone: "center" }, { terrain_conform: "drape" }];
  return doc as unknown as typeof CANAL_DOC;
})();

describe("a canal quarter on ground that falls away", () => {
  const scratch: string[] = [];
  let stack: PrismarineStack;
  let dir: string;
  let report: PhysicsReport;
  let compiled: Awaited<ReturnType<typeof compileTerrain>>;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-canal-slope-"));
    scratch.push(root);
    dir = path.join(root, "canal_slope");
    compiled = await compileTerrain(structuredClone(SLOPED_CANAL_DOC), { outDir: dir });
    if (!compiled.ok) {
      throw new Error(`sloped canal compile failed: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`);
    }
    const structures = (compiled.report as unknown as {
      layout?: { structures?: { buildings?: unknown[]; roads?: { routes?: unknown[] }; props?: unknown[] } };
    }).layout?.structures;
    report = await lintWorldPhysics(dir, stack, {
      buildings: (structures?.buildings ?? []) as never,
      roads: (structures?.roads?.routes ?? []) as never,
      props: (structures?.props ?? []) as never,
    });
  }, 600_000);

  afterAll(async () => {
    for (const root of scratch) await rm(root, { recursive: true, force: true });
  });

  it("still digs canals rather than quietly drawing a grid", () => {
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const districts = (compiled.report as unknown as {
      layout?: { districts?: readonly { form: { id: string }; channels?: readonly unknown[] }[] };
    }).layout?.districts;
    const quarter = districts?.[0];
    expect(quarter?.form.id).toBe("canal");
    expect((quarter?.channels ?? []).length).toBeGreaterThan(0);
  });

  it("settles every block of its water on unlevelled ground", () => {
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.report.stats.unstableFluidBlocks).toBe(0);
  });

  it("finds nothing wrong, under every physics rule", () => {
    const summary = report.findings
      .slice(0, 12)
      .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
      .join("\n");
    expect(summary).toBe("");
    for (const rule of PHYSICS_RULES) expect(report.counts[rule], rule).toBe(0);
  });
});

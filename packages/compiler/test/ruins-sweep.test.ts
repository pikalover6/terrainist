/**
 * **The catalog sweep** — RUINS-PLAN-v0 WP-2's acceptance bar.
 *
 * > Test: a **catalog sweep** — a sample across every catalog category × three
 * > bands, each emitted into a real world and linted on all 26 rules, with the
 * > refusal rate reported. This is the WP that either works or tells us the
 * > feature is smaller than we thought.
 *
 * The bar is deliberately a **compiled world read back off disk and linted**,
 * not a unit test over an op list (RUINS-PLAN §8: "Phase 4.1 shipped three
 * defects that passed every unit test"). So this file builds one flat world of
 * ruined shells — one archetype per catalog category that has a building
 * archetype, at three intensities each — writes it through the ordinary Anvil
 * writer, and asks the physics lint the same question it asks of the shipped
 * worlds: zero findings, under every rule.
 *
 * What is really under test is §5.6's `settleFixtures` fixpoint. RUINS-PLAN §12
 * calls it the place this feature fails: 343 archetypes' worth of fixture
 * arrangements, and a single unsupported banner is a finding. A sweep is the
 * measurement; a spot check would not be.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  STRUCTURE_CATALOG,
  generateBuilding,
  nodeSeed,
  type LocalVoxelOp,
} from "@terrainist/stdlib";

import { applyConnectionStates } from "../src/emit/connections.js";
import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type EmitChunk, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { writeWorldFiles } from "../src/emit/write.js";

/** The three bands RUINS-PLAN §6 names, as the dial an author writes. */
const BANDS = [0.35, 0.6, 0.9] as const;

/** One shell per plot, and the plot is the same everywhere. */
const SIZE = [13, 17, 15] as const;
const SPACING = 26;
const COLUMNS = 6;
const GROUND_Y = 63;
const FLOOR_Y = GROUND_Y + 1;

/**
 * One building archetype per catalog category.
 *
 * Derived from the catalog rather than listed, which is the same discipline the
 * Terrarium's station plan uses: a category that gains its first archetype gets
 * swept the day it lands, and nobody has to remember to add it here.
 */
function sample(): readonly string[] {
  const known = new Set<string>(BUILDING_ARCHETYPES as readonly string[]);
  const byCategory = new Map<string, string>();
  for (const entry of STRUCTURE_CATALOG) {
    if (!known.has(entry.id)) continue;
    if (byCategory.has(entry.category)) continue;
    // The five relics run the engine from their own profiles and are WP-1's
    // list-identity golden; `params.decay` on one would be a decay over a decay.
    if (entry.category === "ruins") continue;
    byCategory.set(entry.category, entry.id);
  }
  return [...byCategory.values()];
}

/**
 * Shells that never reach the decay pass, and why each is honest.
 *
 * - **`watchtower`** is a solid tower with a shaft, built by its own generator,
 *   which never calls `furnish`. A ruined watchtower is `collapsed_tower` — a
 *   relic — and that is the right answer for it.
 * - **`skyscraper`** is the high-rise builder. RUINS-PLAN §5.4 gives high-rise
 *   its own answer (`mode: "facade"`), schedules it **last** (WP-6) and makes
 *   it **cuttable**: a crumble line has no meaning above the eave plate of an
 *   eight-storey frame. Excluded here on purpose, not by accident.
 *
 * Recorded rather than papered over: "the document asked for decay and got an
 * intact building" must never be silent, and WP-3's `LOAM-W511
 * DECAY_MODE_FALLBACK` is where it stops being silent for an author.
 */
const NO_FIT_OUT: ReadonlySet<string> = new Set(["watchtower", "skyscraper"]);

interface Plot {
  readonly archetype: string;
  readonly decay: number;
  readonly ox: number;
  readonly oz: number;
  readonly ops: readonly LocalVoxelOp[];
  readonly meta: ReturnType<typeof generateBuilding>["meta"];
}

const scratch: string[] = [];
let stack: PrismarineStack;
let report: PhysicsReport;
let plots: readonly Plot[];

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  const seed = nodeSeed(0xf19n, "world.ruin");
  const built: Plot[] = [];
  let index = 0;
  for (const archetype of sample()) {
    for (const decay of BANDS) {
      const ox = (index % COLUMNS) * SPACING;
      const oz = Math.floor(index / COLUMNS) * SPACING;
      index++;
      const result = generateBuilding({
        size: SIZE as unknown as [number, number, number],
        params: { archetype, floors: 2, decay },
        seed,
        style: BUILDING_STYLE_DEFAULTS,
      });
      built.push({ archetype, decay, ox, oz, ops: result.ops, meta: result.meta });
    }
  }
  plots = built;

  const chunks = new Map<string, EmitChunk>();
  const chunkFor = (x: number, z: number): EmitChunk => {
    const key = `${x >> 4},${z >> 4}`;
    let chunk = chunks.get(key);
    if (chunk === undefined) {
      chunk = stack.createChunk();
      chunks.set(key, chunk);
    }
    return chunk;
  };
  const setBlock = (x: number, y: number, z: number, stateId: number): void => {
    chunkFor(x, z).setStateId(x - (x >> 4) * 16, y, z - (z >> 4) * 16, stateId);
  };
  const stone = stack.blockByName("stone")?.stateId as number;
  const grass = stack.blockByName("grass_block")?.stateId as number;
  const air = 0;

  // The ground: solid to the surface under every plot and its apron, so a
  // support chain that reaches the floor has reached something.
  const width = COLUMNS * SPACING;
  const depth = Math.ceil(plots.length / COLUMNS) * SPACING;
  for (let z = -2; z < depth; z++) {
    for (let x = -2; x < width; x++) {
      for (let y = 56; y < GROUND_Y; y++) setBlock(x, y, z, stone);
      setBlock(x, GROUND_Y, z, grass);
    }
  }

  const missing = new Set<string>();
  for (const plot of plots) {
    for (const op of plot.ops) {
      const state =
        op.props === undefined
          ? undefined
          : (stack.blockStateOf(op.block, op.props) as number | undefined);
      const resolved =
        state ??
        (op.block === "air" ? air : (stack.blockByName(op.block)?.stateId as number | undefined));
      if (resolved === undefined) {
        missing.add(op.block);
        continue;
      }
      setBlock(plot.ox + op.x, FLOOR_Y + op.y, plot.oz + op.z, resolved);
    }
  }
  expect([...missing], "every block the decay writes is in the pinned set").toEqual([]);

  // The connection pass, exactly as the pipeline runs it before writing: a
  // fence carrying the default "connected to nothing" state is `connection.stale`
  // and is a fact about the writer, not about the decay.
  applyConnectionStates(
    chunks,
    plots.flatMap((plot) =>
      plot.ops.map((op) => ({
        x: plot.ox + op.x,
        y: FLOOR_Y + op.y,
        z: plot.oz + op.z,
      })),
    ),
    stack,
  );

  const root = await mkdtemp(path.join(tmpdir(), "terrainist-ruins-"));
  scratch.push(root);
  const worldDir = path.join(root, "ruins");
  await writeWorldFiles({
    chunks,
    worldDir,
    levelName: "ruins",
    spawn: { x: 0, y: FLOOR_Y + 1, z: 0 },
    stack,
  });

  report = await lintWorldPhysics(worldDir, stack, {
    minY: 50,
    maxY: 120,
    buildings: plots.map((plot) => ({
      footprint: {
        x0: plot.ox,
        z0: plot.oz,
        x1: plot.ox + SIZE[0] - 1,
        z1: plot.oz + SIZE[2] - 1,
      },
      interior: {
        x0: plot.ox + plot.meta.interior.x0,
        z0: plot.oz + plot.meta.interior.z0,
        x1: plot.ox + plot.meta.interior.x1,
        z1: plot.oz + plot.meta.interior.z1,
      },
      floorY: FLOOR_Y,
      meta: plot.meta,
    })) as never,
  });
}, 600_000);

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

/** Render a report's findings compactly, so a failure names the block. */
function summarize(r: PhysicsReport): string {
  return r.findings
    .slice(0, 12)
    .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
    .join("\n");
}

describe("WP-2 catalog sweep — an arbitrary archetype, ruined", () => {
  it("covers every catalog category that has a building archetype, at three bands", () => {
    expect(plots.length).toBe(sample().length * BANDS.length);
    expect(sample().length).toBeGreaterThan(10);
  });

  it("reads back a world with something in it", () => {
    expect(report.examined).toBeGreaterThan(100_000);
  });

  it("lints zero, under every one of the 26 rules", () => {
    expect(summarize(report)).toBe("");
    for (const rule of PHYSICS_RULES) {
      expect(report.counts[rule], rule).toBe(0);
    }
  });

  it("refuses no lot — and reports the rate either way (§5.7)", () => {
    const refused = plots.filter((plot) => plot.meta.decay?.refused === true);
    const rate = refused.length / plots.length;
    // A refusal rate above a few percent on a walked world is a finding about
    // the operators, not about the lot — so the number is asserted, not logged.
    expect(
      rate,
      `refused: ${refused.map((p) => `${p.archetype}@${p.decay}`).join(", ")}`,
    ).toBeLessThan(0.05);
  });

  it("decays every shell it was asked to, and records what it did", () => {
    for (const plot of plots) {
      // The watchtower is not a fit-out at all: it is a solid tower with a
      // shaft, built by its own generator, which never calls `furnish` and so
      // never reaches the decay pass. That is the honest answer for it — a
      // ruined watchtower is `collapsed_tower`, a relic — and it is recorded
      // here rather than papered over, because "the document asked for decay
      // and got an intact building" must never be silent (RUINS-PLAN §9's
      // `LOAM-W511`, WP-3).
      if (NO_FIT_OUT.has(plot.archetype)) {
        expect(plot.meta.decay, `${plot.archetype} has no fit-out to decay`).toBeUndefined();
        continue;
      }
      expect(plot.meta.decay, `${plot.archetype}@${plot.decay}`).toBeDefined();
    }
    // Not every shell can take a shell-shaped decay — a plan that is not a
    // plain rect, or a wall of fewer than three courses, is refused by
    // `decayPlan` and keeps its shell (RUINS-PLAN §9's `LOAM-W511`). But most
    // of the sweep must actually have been written over, or the sweep is
    // measuring nothing.
    const written = plots.filter((plot) => (plot.meta.decay?.written ?? 0) > 0);
    expect(written.length / plots.length).toBeGreaterThan(0.5);
  });

  it("is cold and dry: no fire and no fluid survives a ruin", () => {
    for (const plot of plots) {
      for (const op of plot.ops) {
        // The cellar is out of scope in v0 (§13.9): a ruined shell keeps its
        // intact cellar, lantern and all, which is a perfectly good hideout.
        if (op.y < 0) continue;
        if (NO_FIT_OUT.has(plot.archetype)) continue;
        expect(op.block, `${plot.archetype}@${plot.decay}`).not.toMatch(
          /^(fire|soul_fire|lava|water|torch|soul_torch|lantern|soul_lantern|campfire)$/,
        );
        expect(op.props?.["waterlogged"], `${plot.archetype}@${plot.decay}`).not.toBe("true");
        expect(op.props?.["lit"], `${plot.archetype}@${plot.decay}`).not.toBe("true");
      }
    }
  });

  it("is deterministic: the same shell twice is the same op list", () => {
    const seed = nodeSeed(0xf19n, "world.ruin");
    for (const plot of plots.slice(0, 6)) {
      const again = generateBuilding({
        size: SIZE as unknown as [number, number, number],
        params: { archetype: plot.archetype, floors: 2, decay: plot.decay },
        seed,
        style: BUILDING_STYLE_DEFAULTS,
      });
      expect(again.ops).toEqual(plot.ops);
    }
  });
});

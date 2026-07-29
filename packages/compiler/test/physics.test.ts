/**
 * The physics lint, and the connection-state pass it checks.
 *
 * These are the tests for the class of defect that a human found by walking the
 * compiled village in the Minecraft client and that nothing else in this suite
 * could see: ladders fixed to air, a flight of stairs you had to jump to mount,
 * a bed whose halves were paired backwards, fences carrying the default
 * "connected to nothing" state, and a lane laid a block proud of its field.
 * Renders miss all of it, because every one of them is a *gameplay* property.
 *
 * Both shipped worlds are linted, not just the village: `devworld` is the
 * building grammar's showroom — sixty-odd houses, every archetype, every yaw —
 * so it is where a regression in the grammar shows up first.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyConnectionStates, connectiveKindOf } from "../src/emit/connections.js";
import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type EmitChunk, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { buildDevWorld } from "../src/devworld.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import { writeWorldFiles } from "../src/emit/write.js";

const EXAMPLE = fileURLToPath(new URL("../../../examples/hillside-village.loam.json", import.meta.url));

const scratch: string[] = [];
let stack: PrismarineStack;
let village: { dir: string; report: TerrainCompileReport };
let dev: {
  dir: string;
  buildings: readonly unknown[];
  props: readonly unknown[];
  blocks: readonly { readonly stateId: number }[];
};

async function scratchDir(label: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `terrainist-physics-${label}-`));
  scratch.push(root);
  return root;
}

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);

  const villageRoot = await scratchDir("village");
  const villageDir = path.join(villageRoot, "hillside_village");
  const doc = JSON.parse(await readFile(EXAMPLE, "utf8")) as unknown;
  const compiled = await compileTerrain(doc, { outDir: villageDir });
  if (!compiled.ok) throw new Error("village compile failed");
  village = { dir: villageDir, report: compiled.report };

  const devRoot = await scratchDir("dev");
  const built = await buildDevWorld(devRoot);
  dev = {
    dir: built.emit.worldDir,
    buildings: built.buildings,
    props: built.placedProps,
    blocks: built.blocks,
  };
}, 120_000);

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

/** Render a report's findings compactly, so a failure names the block. */
function summarize(report: PhysicsReport): string {
  return report.findings
    .slice(0, 12)
    .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
    .join("\n");
}

describe("physics lint — the hillside village", () => {
  let report: PhysicsReport;

  beforeAll(async () => {
    const structures = (village.report as unknown as {
      layout?: { structures?: { buildings?: unknown[]; roads?: { routes?: unknown[] } } };
    }).layout?.structures;
    report = await lintWorldPhysics(village.dir, stack, {
      buildings: (structures?.buildings ?? []) as never,
      roads: (structures?.roads?.routes ?? []) as never,
      // The pier and the boat moored at it: `prop.fluid_leak` is bounded to
      // the prop footprints, so without this the rule is asked nothing.
      props: (structures?.props ?? []) as never,
    });
  }, 120_000);

  it("reads back a substantial world", () => {
    expect(report.examined).toBeGreaterThan(1_000_000);
  });

  it("finds nothing wrong, under every rule", () => {
    expect(summarize(report)).toBe("");
    for (const rule of PHYSICS_RULES) {
      expect(report.counts[rule], rule).toBe(0);
    }
  });
});

describe("physics lint — the dev world", () => {
  let report: PhysicsReport;

  beforeAll(async () => {
    // The dev world gets the *same* context the village does. It is the
    // building grammar's showroom — every archetype crossed with every size,
    // storey count and yaw — so it is where a grammar regression shows up
    // first, and the interior rules (which need the building list) are exactly
    // the ones a grammar regression trips.
    report = await lintWorldPhysics(dev.dir, stack, {
      buildings: dev.buildings as never,
      props: dev.props as never,
    });
  }, 120_000);

  it("finds nothing wrong, under every rule", () => {
    expect(summarize(report)).toBe("");
    for (const rule of PHYSICS_RULES) {
      expect(report.counts[rule], rule).toBe(0);
    }
  });

  it("actually contains the blocks the newest rules are about", () => {
    // A rule that finds nothing because the world holds nothing it could find
    // anything in is not a passing rule, it is an untested one. The dev world
    // is the fixture for all three of the newest ones, so it has to carry a
    // rail line (the connection-state diff), a bell (the steeple rule) and
    // water a prop put there (the fluid rule) — and the assertion above is
    // what then means something.
    const names = new Map<number, string>();
    const nameOf = (id: number): string => {
      let n = names.get(id);
      if (n === undefined) {
        n = stack.blockNameByStateId(id) ?? "air";
        names.set(id, n);
      }
      return n;
    };
    const seen = new Set(dev.blocks.map((b) => nameOf(b.stateId)));
    expect([...seen].some((n) => n.endsWith("rail")), "a rail line").toBe(true);
    expect(seen.has("bell"), "a steeple bell").toBe(true);
    expect(seen.has("water"), "the fountain's bowl").toBe(true);
    expect(dev.props.length, "props placed").toBeGreaterThan(0);
  });
});

describe("the walking agent", () => {
  /**
   * A one-room shell with a door, a floor, a ceiling and a stair flight, built
   * block by block so the traversal simulation can be pointed at a *known*
   * geometry rather than at whatever the grammar happened to emit.
   *
   * `stairFootZ` is the whole experiment: at `z0 + 1` the flight has an open
   * front face and the climb is a walk; at `z0` its front face is buried in the
   * north wall, which is the geometry a player reported as "the stairs still
   * need a jump" and which every previous version of this lint passed.
   */
  async function shell(stairFootZ: number): Promise<PhysicsReport> {
    const dir = path.join(await scratchDir("shell"), "shell");
    const chunk = stack.createChunk();
    const id = (name: string, props?: Record<string, string>): number =>
      (props === undefined ? stack.blockByName(name)?.stateId : stack.blockStateOf(name, props)) as number;
    const stone = id("stone");
    const planks = id("oak_planks");

    const x0 = 2;
    const z0 = 2;
    const x1 = 10;
    const z1 = 12;
    const floorY = 64;
    const storey = 4;
    // Ground under it, floor plane, walls up to the ceiling, ceiling.
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        chunk.setStateId(x, floorY - 1, z, stone);
        chunk.setStateId(x, floorY, z, planks);
        chunk.setStateId(x, floorY + storey, z, planks);
        chunk.setStateId(x, floorY + storey * 2, z, planks);
        const wall = x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1;
        if (!wall) continue;
        for (let y = floorY + 1; y < floorY + storey * 2; y++) chunk.setStateId(x, y, z, stone);
      }
    }
    // A door in the south wall.
    const dx = 6;
    for (const half of ["lower", "upper"] as const) {
      chunk.setStateId(dx, floorY + (half === "lower" ? 1 : 2), z1 + 1, id("oak_door", {
        facing: "north",
        half,
        hinge: "left",
        open: "false",
        powered: "false",
      }));
    }
    // The well first, then the flight — the top step lives *in* the upper floor
    // plane, so carving afterwards would delete it.
    for (let z = z0; z <= stairFootZ + storey - 1; z++) {
      chunk.setStateId(x0, floorY + storey, z, 0);
    }
    for (let i = 0; i < storey; i++) {
      chunk.setStateId(x0, floorY + 1 + i, stairFootZ + i, id("oak_stairs", {
        facing: "south",
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      }));
    }

    await writeWorldFiles({
      chunks: new Map([["0,0", chunk]]),
      worldDir: dir,
      levelName: "shell",
      spawn: { x: 6, y: floorY + 1, z: 6 },
      stack,
    });
    return await lintWorldPhysics(dir, stack, {
      minY: 60,
      maxY: 80,
      buildings: [
        {
          footprint: { x0: x0 - 1, z0: z0 - 1, x1: x1 + 1, z1: z1 + 1 },
          interior: { x0, z0, x1, z1 },
          floorY,
          meta: { roofTop: storey * 2, foundationDepth: 1, wallTop: storey * 2, floorLevels: [0, storey] },
        },
      ],
    });
  }

  it("cannot climb a flight whose front face is buried in the wall", async () => {
    const report = await shell(2);
    expect(report.counts["traversal.unreachable"]).toBeGreaterThan(0);
  }, 60_000);

  it("climbs the same flight once it stands one cell off the wall", async () => {
    const report = await shell(3);
    expect(report.counts["traversal.unreachable"]).toBe(0);
  }, 60_000);
});

describe("the connection-state pass", () => {
  const fence = (s: PrismarineStack): number =>
    s.blockStateOf("oak_fence", {
      north: "false",
      east: "false",
      south: "false",
      west: "false",
      waterlogged: "false",
    }) as number;

  /** Two adjacent chunks, so a connection has to cross the boundary. */
  function twoChunks(): Map<string, EmitChunk> {
    return new Map([
      ["0,0", stack.createChunk()],
      ["1,0", stack.createChunk()],
    ]);
  }

  it("classifies the connective block families", () => {
    expect(connectiveKindOf("oak_fence")).toBe("fence");
    expect(connectiveKindOf("cobblestone_wall")).toBe("wall");
    expect(connectiveKindOf("glass_pane")).toBe("pane");
    expect(connectiveKindOf("iron_bars")).toBe("pane");
    expect(connectiveKindOf("oak_planks")).toBeUndefined();
    // A fence *gate* is not a connective block: it stores a facing, not a set
    // of neighbours, and the pass must leave it alone.
    expect(connectiveKindOf("oak_fence_gate")).toBeUndefined();
  });

  it("connects a fence to its neighbour across a chunk boundary", () => {
    const chunks = twoChunks();
    const state = fence(stack);
    // x = 15 is the last column of chunk 0; x = 16 is the first of chunk 1.
    (chunks.get("0,0") as EmitChunk).setStateId(15, 70, 5, state);
    (chunks.get("1,0") as EmitChunk).setStateId(0, 70, 5, state);

    const stats = applyConnectionStates(
      chunks,
      [
        { x: 15, y: 70, z: 5 },
        { x: 16, y: 70, z: 5 },
      ],
      stack,
    );
    expect(stats.examined).toBe(2);
    expect(stats.rewritten).toBe(2);

    const west = stack.blockStateProps((chunks.get("0,0") as EmitChunk).getBlockStateId(15, 70, 5));
    const east = stack.blockStateProps((chunks.get("1,0") as EmitChunk).getBlockStateId(0, 70, 5));
    expect(west?.props["east"]).toBe("true");
    expect(west?.props["west"]).toBe("false");
    expect(east?.props["west"]).toBe("true");
    expect(east?.props["east"]).toBe("false");
  });

  it("connects a fence to a solid block but not to a path or a slab", () => {
    const chunks = twoChunks();
    const chunk = chunks.get("0,0") as EmitChunk;
    chunk.setStateId(5, 70, 5, fence(stack));
    chunk.setStateId(6, 70, 5, stack.blockByName("stone")?.stateId as number);
    chunk.setStateId(4, 70, 5, stack.blockByName("dirt_path")?.stateId as number);
    chunk.setStateId(5, 70, 6, stack.blockByName("oak_slab")?.stateId as number);

    applyConnectionStates(chunks, [{ x: 5, y: 70, z: 5 }], stack);
    const props = stack.blockStateProps(chunk.getBlockStateId(5, 70, 5))?.props;
    expect(props?.["east"]).toBe("true");
    expect(props?.["west"]).toBe("false");
    expect(props?.["south"]).toBe("false");
    expect(props?.["north"]).toBe("false");
  });

  it("gives a wall a post at a corner and none along a straight run", () => {
    const chunks = twoChunks();
    const chunk = chunks.get("0,0") as EmitChunk;
    const wall = stack.blockByName("cobblestone_wall")?.stateId as number;
    // An L: (4,5) — (5,5) — (5,6). The middle block is the corner.
    for (const [x, z] of [
      [4, 5],
      [5, 5],
      [5, 6],
    ] as const) {
      chunk.setStateId(x, 70, z, wall);
    }
    applyConnectionStates(
      chunks,
      [
        { x: 4, y: 70, z: 5 },
        { x: 5, y: 70, z: 5 },
        { x: 5, y: 70, z: 6 },
      ],
      stack,
    );
    const corner = stack.blockStateProps(chunk.getBlockStateId(5, 70, 5))?.props;
    expect(corner?.["west"]).toBe("low");
    expect(corner?.["south"]).toBe("low");
    expect(corner?.["up"]).toBe("true");
    // A dead end is a post too — there is nothing else holding the run up.
    const end = stack.blockStateProps(chunk.getBlockStateId(4, 70, 5))?.props;
    expect(end?.["east"]).toBe("low");
    expect(end?.["up"]).toBe("true");
  });

  it("is idempotent: a second pass over a settled world rewrites nothing", () => {
    const chunks = twoChunks();
    const chunk = chunks.get("0,0") as EmitChunk;
    for (let x = 3; x <= 7; x++) chunk.setStateId(x, 70, 5, fence(stack));
    const cells = [3, 4, 5, 6, 7].map((x) => ({ x, y: 70, z: 5 }));
    expect(applyConnectionStates(chunks, cells, stack).rewritten).toBe(5);
    expect(applyConnectionStates(chunks, cells, stack).rewritten).toBe(0);
  });
});

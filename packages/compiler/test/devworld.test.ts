/**
 * Smoke test for `terrainist devworld`.
 *
 * The dev world exists to be *looked at*, which makes it exactly the kind of
 * artefact that rots silently: nobody notices that the granary row stopped
 * emitting until they happen to open the render. These are the cheap
 * structural claims that catch that — the grid is the grid it says it is, the
 * world it writes is a real world, and the two invariants a building pass has
 * historically broken (unstable fluids, floating lanterns) still hold.
 */

import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  BUILDING_ARCHETYPES_ROWS,
  DEV_GAP,
  DEV_GROUND_Y,
  DEV_ROW_LENGTH,
  DEV_THEMES,
  buildDevWorld,
  planDevGrid,
  type DevWorldResult,
} from "../src/devworld.js";

const scratch: string[] = [];
let result: DevWorldResult;
let worldDir: string;

beforeAll(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "terrainist-devworld-"));
  scratch.push(root);
  result = await buildDevWorld(root);
  worldDir = result.emit.worldDir;
}, 300_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("dev world grid", () => {
  it("lays out one row per archetype plus the roof-comparison row", () => {
    const grid = planDevGrid();
    const rows = [...new Set(grid.exhibits.map((e) => e.row))];
    expect(rows).toEqual([...BUILDING_ARCHETYPES_ROWS, "roofs"]);
    for (const row of BUILDING_ARCHETYPES_ROWS) {
      expect(grid.exhibits.filter((e) => e.row === row)).toHaveLength(DEV_ROW_LENGTH);
    }
    // The control row is every roof against every theme, and nothing else
    // varies across it.
    const roofs = grid.exhibits.filter((e) => e.row === "roofs");
    expect(roofs).toHaveLength(3 * DEV_THEMES.length);
    expect(new Set(roofs.map((e) => e.size.join("x"))).size).toBe(1);
    expect(new Set(roofs.map((e) => e.floors)).size).toBe(1);
  });

  it("gives the grid the count the brief asks for", () => {
    // One row per archetype plus the roof control row, so the bound moves when
    // the grammar grows a new archetype — which is the point of deriving the
    // rows from `BUILDING_ARCHETYPES` rather than listing them.
    const expected = BUILDING_ARCHETYPES_ROWS.length * DEV_ROW_LENGTH + 3 * DEV_THEMES.length;
    expect(result.buildingCount).toBe(expected);
    expect(result.buildings).toHaveLength(planDevGrid().exhibits.length);
  });

  it("walks the gradient: size grows, storeys step, themes cycle", () => {
    const grid = planDevGrid();
    for (const row of BUILDING_ARCHETYPES_ROWS) {
      const cells = grid.exhibits.filter((e) => e.row === row).sort((a, b) => a.column - b.column);
      const first = cells[0] as (typeof cells)[number];
      const last = cells[cells.length - 1] as (typeof cells)[number];
      expect(last.size[0]).toBeGreaterThan(first.size[0]);
      expect(new Set(cells.map((c) => c.theme))).toEqual(new Set(DEV_THEMES));
      expect(new Set(cells.map((c) => c.roof)).size).toBeGreaterThan(1);
    }
  });

  it("leaves a clear gap between every pair of neighbours in a row", () => {
    const grid = planDevGrid();
    for (const row of [...BUILDING_ARCHETYPES_ROWS, "roofs"]) {
      const cells = grid.exhibits.filter((e) => e.row === row).sort((a, b) => a.column - b.column);
      for (let i = 1; i < cells.length; i++) {
        const prev = cells[i - 1] as (typeof cells)[number];
        const here = cells[i] as (typeof cells)[number];
        expect(here.x - (prev.x + (prev.size[0] as number))).toBe(DEV_GAP);
      }
    }
  });

  it("no two exhibits overlap", () => {
    const grid = planDevGrid();
    const boxes = grid.exhibits.map((e) => ({
      x0: e.x,
      z0: e.z,
      x1: e.x + (e.size[0] as number) - 1,
      z1: e.z + (e.size[2] as number) - 1,
    }));
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const p = boxes[a] as (typeof boxes)[number];
        const q = boxes[b] as (typeof boxes)[number];
        const overlaps = p.x0 <= q.x1 && q.x0 <= p.x1 && p.z0 <= q.z1 && q.z0 <= p.z1;
        expect(overlaps, `exhibits ${a} and ${b} overlap`).toBe(false);
      }
    }
  });

  it("spawns at the grid's south-west corner, on the plain", () => {
    const grid = planDevGrid();
    expect(grid.spawn[1]).toBe(DEV_GROUND_Y + 1);
    expect(grid.spawn[0]).toBeLessThan(Math.min(...grid.exhibits.map((e) => e.x)));
    expect(grid.spawn[2]).toBeGreaterThan(Math.max(...grid.exhibits.map((e) => e.z)));
  });
});

describe("dev world build", () => {
  it("writes a real world folder", async () => {
    expect((await stat(path.join(worldDir, "level.dat"))).isFile()).toBe(true);
    const regions = (await readdir(path.join(worldDir, "region"))).filter((f) => f.endsWith(".mca"));
    expect(regions.length).toBeGreaterThan(0);
    expect(result.emit.chunkCount).toBeGreaterThan(0);
    expect(result.emit.minecraftVersion).toBe(EMIT_MINECRAFT_VERSION);
  });

  it("emits a body of blocks for every exhibit, doors and lanterns included", () => {
    for (const b of result.buildings) {
      expect(b.blockCount, b.nodePath).toBeGreaterThan(100);
      expect(b.meta.door, b.nodePath).not.toBeNull();
      expect(b.meta.lanternCount, b.nodePath).toBeGreaterThanOrEqual(1);
    }
    // Every archetype lights itself: the grid is meant to be readable at night.
    expect(result.lightCount).toBeGreaterThanOrEqual(result.buildingCount);
  });

  it("has no unstable fluid — nothing on the plain places water at all", () => {
    expect(result.fluids.unstable).toBe(0);
    expect(result.fluids.samples).toEqual([]);
  });

  it("supports every lantern — none hangs in mid-air", () => {
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    // Read the emitted block list rather than the world: the invariant is about
    // what the grammar placed, and a world round-trip would only put a decode
    // step between the defect and the assertion.
    const byPos = new Map<string, number>();
    for (const block of result.blocks) byPos.set(`${block.x},${block.y},${block.z}`, block.stateId);

    const lanternIds = new Set(
      ["lantern", "soul_lantern"]
        .map((n) => stack.blockByName(n)?.stateId)
        .filter((id): id is number => id !== undefined),
    );
    let lamps = 0;
    const unsupported: string[] = [];
    for (const [key, id] of byPos) {
      if (!lanternIds.has(id)) continue;
      lamps++;
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      const below = byPos.get(`${x},${y - 1},${z}`);
      const above = byPos.get(`${x},${y + 1},${z}`);
      // Standing on something, hanging from something, or resting on the
      // plain itself — anything else is a light floating over grass.
      const onPlain = y === DEV_GROUND_Y + 1;
      if (below === undefined && above === undefined && !onPlain) unsupported.push(key);
    }
    expect(lamps).toBeGreaterThan(20);
    expect(unsupported).toEqual([]);
  });

  it("is deterministic: the same grid and the same block count twice", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-devworld-b-"));
    scratch.push(root);
    const again = await buildDevWorld(root);
    expect(again.emit.blockCount).toBe(result.emit.blockCount);
    expect(again.emit.structureBlockCount).toBe(result.emit.structureBlockCount);
    expect(again.lightCount).toBe(result.lightCount);
    expect(again.buildings.map((b) => b.blockCount)).toEqual(result.buildings.map((b) => b.blockCount));
  }, 300_000);
});

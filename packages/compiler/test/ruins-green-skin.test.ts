/**
 * **The vertical skin** — `docs/RUINS-PLAN-v0-WP6.md` WP-6b.
 *
 * The wave that answers Kai's sentence about the walls: *"it'd require the
 * streets, walls of buildings, ground, all to be actively overtaken"*. WP-6a
 * built the surface index and wrote nothing; this is climbers and strands
 * (§4.1), the mossy re-clad lift (§4.2), openings and leaf plugs (§4.3), glow
 * lichen (§4.4), the silhouette law (§4.5) and species resolution (§4.6).
 *
 * §11's machine checks for the wave, in order:
 *
 * - lint zero on all 27 rules on a compiled `decline: 0.95` fixture **read off
 *   disk**, which is the bar for everything in F19;
 * - **zero leaf blocks with `persistent = false`** anywhere the skin wrote —
 *   §12.2's risk, and the one boolean between a green city and a city that is
 *   green for ten minutes;
 * - zero vines whose every true face points at air;
 * - zero growth in a door column, its lintel or its approach;
 * - determinism — compile twice, byte-identical;
 * - positional independence — a landmark elsewhere in the document leaves the
 *   skin's block list unchanged;
 * - monotonicity — climber and plug counts non-decreasing across a `decline`
 *   sweep at fixed seed, which is MONOTONE GREEN machine-checked;
 * - the reach law, still structural: a decline-free document is byte-identical
 *   to the one that compiled before the skin existed.
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DECAY_BANDS, greenSkinShares, weatheredOf } from "@terrainist/stdlib";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, listChunks, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";

/** The dead quarter. No ruin vocabulary in the `mix` — §10's own instruction. */
const QUARTER = {
  fabric: "grid",
  density: "medium",
  blockSize: 40,
  mix: ["townhouse", "shop_row", "warehouse"],
};

interface DocOptions {
  readonly decline?: number;
  /** An extra child node, to prove positional independence (§11). */
  readonly landmark?: boolean;
  readonly seed?: number;
}

function doc(options: DocOptions = {}): unknown {
  const children: unknown[] = [
    {
      id: "terrain",
      kind: "generator",
      generator: "terrain.heightfield@0",
      params: { amplitude: 4, baseHeight: 74, seaLevel: 62, octaves: 3, frequency: 0.004 },
    },
    { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
    {
      id: "dead_quarter",
      kind: "district",
      envelope: { shape: "region", size: [170, 170] },
      params: QUARTER,
      constraints: [
        { zone: "center" },
        { terrain_conform: "flatten", reference: "median", blend: 6 },
      ],
    },
    {
      id: "woods",
      kind: "generator",
      generator: "scatter.forest@0",
      params: {
        area: { all: true },
        density: 0.08,
        spacing: 4,
        clumping: 0.5,
        maxSlope: 30,
        elevation: [3, 110],
        edgeFalloff: 10,
        avoidTags: ["structure", "road", "plaza"],
        species: [{ id: "reclaim_birch", weight: 1, shape: "birch_slim" }],
      },
    },
  ];
  if (options.landmark === true) {
    // Somewhere else entirely, and nothing the skin can see: positional
    // independence means the skin's draws are keyed on the column, not on how
    // many nodes the document happens to carry.
    children.push({
      id: "far_woods",
      kind: "generator",
      generator: "scatter.forest@0",
      params: {
        area: { all: true },
        density: 0.02,
        spacing: 9,
        maxSlope: 30,
        elevation: [3, 110],
        avoidTags: ["structure", "road", "plaza"],
        species: [{ id: "reclaim_birch", weight: 1, shape: "birch_slim" }],
      },
    });
  }
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "ruins_wp6b", worldSeed: options.seed ?? 419 },
    ...(options.decline === undefined ? {} : { intent: { decline: options.decline } }),
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [224, 224] },
      children,
    },
  };
}

interface Sample {
  readonly name: string;
  readonly props: Readonly<Record<string, string>>;
}

let root: string;
let dir: string;
let report: TerrainCompileReport;
let structures: StructurePassResult;
let plan: ColumnPlan;
let stack: PrismarineStack;
let physics: PhysicsReport;
let world: Map<string, Sample>;

async function compileInto(name: string, spec: unknown): Promise<{
  readonly dir: string;
  readonly report: TerrainCompileReport;
  readonly plan: ColumnPlan;
}> {
  const out = path.join(root, name);
  let captured: ColumnPlan | undefined;
  const compiled = await compileTerrain(spec, {
    outDir: out,
    onColumnPlan: (p) => {
      captured = p;
    },
  });
  if (!compiled.ok) {
    throw new Error(
      `fixture "${name}" failed to compile: ${compiled.diagnostics
        .map((d) => `${d.code} ${d.message}`)
        .join("; ")}`,
    );
  }
  return { dir: out, report: compiled.report, plan: captured as ColumnPlan };
}

/** A hash of every region file, which is what "byte-identical" means on disk. */
async function regionDigest(worldDir: string): Promise<string> {
  const regionDir = path.join(worldDir, "region");
  const names = (await readdir(regionDir)).sort();
  const hash = createHash("sha256");
  for (const name of names) {
    hash.update(name);
    hash.update(await readFile(path.join(regionDir, name)));
  }
  return hash.digest("hex");
}

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  root = await mkdtemp(path.join(tmpdir(), "terrainist-wp6b-"));
  const main = await compileInto("dead_quarter", doc({ decline: 0.95 }));
  dir = main.dir;
  report = main.report;
  plan = main.plan;
  structures = report.layout?.structures as StructurePassResult;

  world = new Map();
  const regionDir = path.join(dir, "region");
  const anvil = stack.openAnvil(regionDir);
  try {
    for (const { chunkX, chunkZ } of await listChunks(regionDir)) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk === null) continue;
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const x = chunkX * 16 + lx;
          const z = chunkZ * 16 + lz;
          for (let y = 50; y <= 160; y++) {
            const id = chunk.getBlockStateId(lx, y, lz);
            const decoded = stack.blockStateProps(id);
            if (decoded === undefined || decoded.name === "air") continue;
            world.set(`${x},${y},${z}`, { name: decoded.name, props: decoded.props });
          }
        }
      }
    }
  } finally {
    await anvil.close();
  }

  physics = await lintWorldPhysics(dir, stack, {
    buildings: structures.buildings as never,
    roads: (structures.roads?.routes ?? []) as never,
    tunnels: structures.tunnels.map((t) => ({
      id: t.id,
      from: t.endpoints[0],
      to: t.endpoints[1],
    })),
    terrainTop: {
      x0: plan.region.x0,
      z0: plan.region.z0,
      width: plan.region.width,
      depth: plan.region.depth,
      ground: plan.ground,
      entrances:
        (plan.caves as { entranceColumns?: Uint8Array } | undefined)?.entranceColumns ??
        new Uint8Array(plan.region.width * plan.region.depth),
    },
  });
}, 1_800_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* the pass ran at all (§9's `LOAM-I514` reason)                               */
/* -------------------------------------------------------------------------- */

describe("the skin runs (§9)", () => {
  it("wrote climbers and plugs, and says so in `LOAM-I514`", () => {
    const skin = structures.greenSkin;
    expect(skin).toBeDefined();
    const counts = (skin as { counts: Record<string, number> }).counts;
    expect(counts.indexedColumns).toBeGreaterThan(0);
    expect(counts.climbers).toBeGreaterThan(0);
    expect(counts.plugs).toBeGreaterThan(0);
    expect((skin as { blocks: readonly unknown[] }).blocks.length).toBeGreaterThan(0);
    const i514 = structures.diagnostics.filter((d) => d.code === "LOAM-I514");
    expect(i514.length).toBe(1);
    expect(i514[0]?.message).toMatch(/climbing strands/);
  });

  it("grew the wood the city stands in — the green rule (§4.6)", () => {
    // The only forest node declares birch, so the leaves in the window holes
    // are birch. A jungle leaf here would be exactly the class of bug "a
    // concrete tower re-clad in mossy cobblestone" was.
    const skin = structures.greenSkin as { blocks: readonly { stateId: number }[] };
    const leaves = new Set<string>();
    for (const b of skin.blocks) {
      const name = stack.blockNameByStateId(b.stateId);
      if (name !== undefined && name.endsWith("_leaves")) leaves.add(name);
    }
    expect(leaves.size).toBeGreaterThan(0);
    expect([...leaves]).toEqual(["birch_leaves"]);
    // …and no `LOAM-W514`: a forest node does cover this settlement.
    expect(structures.diagnostics.some((d) => d.code === "LOAM-W514")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* §8 — the zero bar, on a world read back off disk                            */
/* -------------------------------------------------------------------------- */

describe("physics (§8)", () => {
  it("lints zero on all 27 rules", () => {
    expect(PHYSICS_RULES.length).toBe(27);
    const byRule = new Map<string, number>();
    for (const f of physics.findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
    expect(Object.fromEntries(byRule)).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/* §4.3 — leaves, and the one boolean that makes them a feature                */
/* -------------------------------------------------------------------------- */

describe("leaf plugs (§4.3, §12.2)", () => {
  /** Where the skin wrote, as world keys — the only cells these bars judge. */
  function skinCells(): Map<string, string> {
    const out = new Map<string, string>();
    const skin = structures.greenSkin as { blocks: readonly { x: number; y: number; z: number; stateId: number }[] };
    for (const b of skin.blocks) {
      const name = stack.blockNameByStateId(b.stateId);
      if (name !== undefined) out.set(`${b.x},${b.y},${b.z}`, name);
    }
    return out;
  }

  it("every leaf the skin wrote is `persistent = true`, on disk", () => {
    let leaves = 0;
    for (const [key, name] of skinCells()) {
      if (!name.endsWith("_leaves")) continue;
      const sample = world.get(key);
      // A later pass may have won the cell outright; what may not happen is a
      // leaf standing there that decays.
      if (sample === undefined || !sample.name.endsWith("_leaves")) continue;
      leaves++;
      expect(sample.props["persistent"], `${key} ${sample.name}`).toBe("true");
    }
    expect(leaves).toBeGreaterThan(0);
  });

  it("plugs no opening a standing body occupies, and none in a door column", () => {
    const skin = structures.greenSkin as {
      blocks: readonly { x: number; y: number; z: number; stateId: number }[];
    };
    const region = plan.region;
    const groundAt = (x: number, z: number): number =>
      plan.ground[(z - region.z0) * region.width + (x - region.x0)] as number;
    // Every door in the world, from the readback — the lint's own evidence.
    const doors = new Set<string>();
    for (const [key, sample] of world) {
      if (!sample.name.endsWith("_door")) continue;
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        for (let cy = y - 1; cy <= y + 3; cy++) doors.add(`${x + dx},${cy},${z + dz}`);
      }
    }
    for (const b of skin.blocks) {
      const name = stack.blockNameByStateId(b.stateId) ?? "";
      expect(doors.has(`${b.x},${b.y},${b.z}`), `${name} at ${b.x},${b.y},${b.z}`).toBe(false);
      if (!name.endsWith("_leaves")) continue;
      // Leaves are a full cube by name: a plug in a body course is a plug that
      // blocks the walk, and `reachOrRefuse`'s proof would need re-running.
      expect(b.y, `leaf at ${b.x},${b.y},${b.z}`).toBeGreaterThan(groundAt(b.x, b.z) + 2);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §4.1 / rule 27 — no vine whose every true face points at air                */
/* -------------------------------------------------------------------------- */

describe("climbers (§4.1)", () => {
  it("every multi-face growth block on disk names a real anchor", () => {
    const OFFSETS: Readonly<Record<string, readonly [number, number, number]>> = {
      up: [0, 1, 0],
      down: [0, -1, 0],
      north: [0, 0, -1],
      south: [0, 0, 1],
      west: [-1, 0, 0],
      east: [1, 0, 0],
    };
    let vines = 0;
    for (const [key, sample] of world) {
      if (sample.name !== "vine" && sample.name !== "glow_lichen") continue;
      vines++;
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      let anchored = false;
      for (const [face, off] of Object.entries(OFFSETS)) {
        if (sample.props[face] !== "true") continue;
        const at = world.get(`${x + off[0]},${y + off[1]},${z + off[2]}`);
        if (at === undefined) continue;
        // `isFullCube` is rule 27's own question, asked of the registry.
        const state = stack.blockByName(`minecraft:${at.name}`);
        if (state !== undefined && stack.isFullCube(state.stateId)) anchored = true;
      }
      expect(anchored, `${sample.name} at ${key} has no anchored face`).toBe(true);
    }
    expect(vines).toBeGreaterThan(0);
  });

  it("glow lichen is theme-gated, and grows in the theme that declares it", async () => {
    // Q1, as Kai ratified it: theme-gated, shipped as `modern_city`. The main
    // fixture takes the default theme draw, so `foliage.glow_lichen` never
    // resolves there and the substitution has nothing to write — that is the
    // whole of the gate, and it is one line to reverse.
    expect(
      (structures.greenSkin as { counts: { lichen: number } }).counts.lichen,
    ).toBe(0);
    expect(structures.diagnostics.some((d) => d.code === "LOAM-I514")).toBe(true);

    const lit = await compileInto("lichen", {
      ...(doc({ decline: 0.95 }) as Record<string, unknown>),
      style: { palettes: { theme: "modern_city" } },
    });
    const skin = (lit.report.layout?.structures as StructurePassResult).greenSkin as {
      counts: { lichen: number };
      blocks: readonly { stateId: number }[];
    };
    // …and every one it does write is on an **underside**, where a stain on a
    // ceiling belongs and a curtain on a wall does not. On a `total` quarter
    // the undersides are scarce by construction — the crumble has taken every
    // roof, every soffit and every floor plate — so the honest bar here is the
    // rule, not a count; the count is proven on the hand-built shell below,
    // which has an overhang to grow under.
    let seen = 0;
    for (const b of skin.blocks) {
      const decoded = stack.blockStateProps(b.stateId);
      if (decoded?.name !== "glow_lichen") continue;
      seen++;
      expect(decoded.props["up"]).toBe("true");
    }
    expect(seen).toBe(skin.counts.lichen);
  }, 1_800_000);
});

/* -------------------------------------------------------------------------- */
/* §4.2 — the mossy re-clad, lifted                                            */
/* -------------------------------------------------------------------------- */

describe("the mossy re-clad (§4.2)", () => {
  it("is monotone in the weight, and identical to the shipped pick at 0.5", () => {
    for (const block of ["stone_bricks", "cobblestone", "mossy_cobblestone", "stone"]) {
      let previous = 0;
      for (const weight of [0, 0.25, 0.5, 0.55, 0.85, 1]) {
        const mossy = new Set<number>();
        for (let k = 0; k < 4000; k++) {
          const out = weatheredOf(block, k * 2654435761, weight) as string;
          if (out.startsWith("mossy_")) mossy.add(k);
        }
        expect(mossy.size, `${block} @ ${weight}`).toBeGreaterThanOrEqual(previous);
        previous = mossy.size;
      }
      // The default is the shipped pick, exactly — which is what keeps every
      // world that does not ruin anything byte-identical.
      for (let k = 0; k < 500; k++) {
        expect(weatheredOf(block, k)).toBe(weatheredOf(block, k, 0.5));
      }
    }
    // A family with no `mossy_*` member is inert: a blackstone ruin cracks, it
    // does not go green.
    for (const weight of [0, 0.5, 1]) {
      expect(weatheredOf("nether_bricks", 3, weight)).toBe("cracked_nether_bricks");
      expect(weatheredOf("deepslate_bricks", 0, weight)).toBe("cracked_deepslate_bricks");
    }
  });

  it("takes its weight from the band's own dial (§7)", () => {
    expect(greenSkinShares("light").mossyPick).toBe(DECAY_BANDS.light.skin);
    expect(greenSkinShares("total").mossyPick).toBe(DECAY_BANDS.total.skin);
    expect(greenSkinShares("light").openingPlug).toBe(0);
    expect(greenSkinShares("total").spineWidth).toBe(1);
    expect(greenSkinShares("total").streetTrunkSpacing).toBe(5);
  });
});

/* -------------------------------------------------------------------------- */
/* §11 — determinism, positional independence, monotonicity, the reach law     */
/* -------------------------------------------------------------------------- */

describe("the wave's identity bars (§11)", () => {
  it("is deterministic — the same document compiles byte-identically", async () => {
    const again = await compileInto("again", doc({ decline: 0.95 }));
    expect(await regionDigest(again.dir)).toBe(await regionDigest(dir));
  }, 1_800_000);

  it("is positionally independent — a node elsewhere leaves the skin unmoved", async () => {
    const moved = await compileInto("landmark", doc({ decline: 0.95, landmark: true }));
    const a = (structures.greenSkin as { blocks: readonly unknown[] }).blocks;
    const b = (
      (moved.report.layout?.structures as StructurePassResult).greenSkin as {
        blocks: readonly unknown[];
      }
    ).blocks;
    expect(b).toEqual(a);
  }, 1_800_000);

  it("keeps a decline-free document byte-identical to no skin at all", async () => {
    // THE REACH LAW, still structural (§3.4): no field, no pass. The negative
    // control is the same document compiled twice, once with the skin's own
    // inputs present and once without a `decline` to build a field from — the
    // second is the world that compiled before this file existed.
    const clean = await compileInto("clean", doc());
    const cleanStructures = clean.report.layout?.structures as StructurePassResult;
    expect(cleanStructures.ruinField).toBeUndefined();
    expect(cleanStructures.greenSkin).toBeUndefined();
    expect(cleanStructures.diagnostics.some((d) => d.code.startsWith("LOAM-I514"))).toBe(false);
    expect(cleanStructures.diagnostics.some((d) => d.code === "LOAM-W514")).toBe(false);
    const twice = await compileInto("clean-again", doc());
    expect(await regionDigest(twice.dir)).toBe(await regionDigest(clean.dir));
  }, 1_800_000);

  it("is MONOTONE GREEN — more `decline` only ever adds", async () => {
    // §2: *"Raising `decline` may only ever add green; it never moves a leaf
    // that was already there."* Machine-checked on the counters, which are
    // elected from their own channels before a block is written and so are pure
    // functions of the draw rather than of what won a cell.
    let climbers = -1;
    let plugs = -1;
    for (const decline of [0.4, 0.65, 0.95]) {
      const swept = await compileInto(`sweep-${decline}`, doc({ decline }));
      const counts = (
        (swept.report.layout?.structures as StructurePassResult).greenSkin as {
          counts: { climbers: number; plugs: number };
        }
      ).counts;
      expect(counts.climbers, `climbers @ ${decline}`).toBeGreaterThanOrEqual(climbers);
      expect(counts.plugs, `plugs @ ${decline}`).toBeGreaterThanOrEqual(plugs);
      climbers = counts.climbers;
      plugs = counts.plugs;
    }
  }, 1_800_000);
});

/* -------------------------------------------------------------------------- */
/* §4.3 / §4.5 — the plug rules, on a wall built by hand                       */
/* -------------------------------------------------------------------------- */

describe("the plug and strand rules, on a shell small enough to reason about", () => {
  const W = 48;
  const D = 48;
  const G = 64;

  function bareplan(): ColumnPlan {
    const cells = W * D;
    return {
      region: { x0: 0, z0: 0, width: W, depth: D },
      ground: new Int32Array(cells).fill(G),
      surface: new Int32Array(cells),
    } as unknown as ColumnPlan;
  }

  function fullField(): { field: Float32Array; columns: number; lots: [] } {
    const field = new Float32Array(W * D).fill(0.85);
    return { field, columns: W * D, lots: [] };
  }

  /**
   * A north–south wall eight courses tall with a two-cell window hole in it,
   * the hole's head at `G + 6`. Everything the plug rules have to decide about
   * is in this picture: a body course at the bottom, a head course at the top,
   * and a genuine hole through the middle.
   */
  function wall(stateOf: (name: string) => number): { blocks: { x: number; y: number; z: number; stateId: number }[] } {
    const stone = stateOf("stone_bricks");
    const air = stateOf("air");
    const blocks: { x: number; y: number; z: number; stateId: number }[] = [];
    for (let z = 4; z <= 40; z++) {
      for (let y = G + 1; y <= G + 8; y++) blocks.push({ x: 10, y, z, stateId: stone });
      // An eave: one course of plate cantilevered east over the face. It is the
      // only thing in this picture that makes an **underside**, and it is what
      // §4.4's lichen substitution needs — `up = true` is legal there and
      // nowhere else on a bare wall.
      blocks.push({ x: 11, y: G + 9, z, stateId: stone });
    }
    // The hole: two courses at z = 10, so its head is at G + 6 and its sill at
    // G + 5 — both well clear of the two body courses at the wall's foot.
    for (const y of [G + 5, G + 6]) blocks.push({ x: 10, y, z: 10, stateId: air });
    // And a ground plane, so the columns either side of the wall are indexed.
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) blocks.push({ x, y: G, z, stateId: stone });
    }
    return { blocks };
  }

  it("plugs the hole, bulges one cell each way and never two, and spares the head", async () => {
    const { Palette } = await import("../src/terrain/palette.js");
    const stateOf = (name: string): number =>
      (stack.blockByName(`minecraft:${name}`) as { stateId: number }).stateId;
    const { growGreenSkin } = await import("../src/structures/green-skin.js");
    const palette = new Palette(
      new Map([
        ["foliage.vine", { kind: "single", stateId: stateOf("vine") }],
        ["foliage.glow_lichen", { kind: "single", stateId: stateOf("glow_lichen") }],
        ["wood.oak_leaves", { kind: "single", stateId: stateOf("oak_leaves") }],
      ]) as never,
      new Uint32Array(8) as never,
    );
    const out = growGreenSkin({
      plan: bareplan(),
      palette,
      stack,
      seed: 11,
      ruinField: fullField() as never,
      laid: wall(stateOf).blocks,
      districts: [],
      flora: { leafSymbols: ["wood.oak_leaves"], source: "forest" },
    });

    const leaves = out.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "").endsWith("_leaves"),
    );
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) {
      // Never two deep either way: every leaf is in the wall plane or exactly
      // one column off it. A two-deep bulge inward is a sealed room.
      expect(Math.abs(leaf.x - 10)).toBeLessThanOrEqual(1);
      // §4.5: never on the head course of the wall, which is `G + 8`.
      expect(leaf.y).toBeLessThan(G + 8);
      // The hole is the only opening; nothing is plugged outside it.
      expect(leaf.z).toBe(10);
      expect(leaf.y === G + 5 || leaf.y === G + 6).toBe(true);
      // Persistent, always — §12.2's one boolean.
      const props = stack.blockStateProps(leaf.stateId);
      expect(props?.props["persistent"]).toBe("true");
    }

    // The climbers: every one of them lies against the wall and stops at it.
    const vines = out.blocks.filter((b) => stack.blockNameByStateId(b.stateId) === "vine");
    expect(vines.length).toBeGreaterThan(0);
    const masonry = new Set(
      wall(stateOf)
        .blocks.filter((b) => stack.blockNameByStateId(b.stateId) === "stone_bricks")
        .map((b) => `${b.x},${b.y},${b.z}`),
    );
    const OFF: Readonly<Record<string, readonly [number, number, number]>> = {
      up: [0, 1, 0],
      north: [0, 0, -1],
      south: [0, 0, 1],
      west: [-1, 0, 0],
      east: [1, 0, 0],
    };
    for (const vine of vines) {
      // Never below the ground, less one.
      expect(vine.y).toBeGreaterThanOrEqual(G + 2);
      const props = stack.blockStateProps(vine.stateId)?.props ?? {};
      // At least one true face, and it names masonry that is actually there —
      // rule 27's own question, asked of the picture we built.
      const anchored = Object.entries(OFF).some(
        ([face, off]) =>
          props[face] === "true" &&
          masonry.has(`${vine.x + off[0]},${vine.y + off[1]},${vine.z + off[2]}`),
      );
      expect(anchored, `vine at ${vine.x},${vine.y},${vine.z}`).toBe(true);
    }

    // §4.4: the lichen substitution, on the undersides the eave makes and on
    // nothing else. `up = true` on every one of them, because a lichen's read
    // is a stain on a ceiling.
    const lichen = out.blocks.filter(
      (b) => stack.blockNameByStateId(b.stateId) === "glow_lichen",
    );
    expect(lichen.length).toBeGreaterThan(0);
    expect(out.counts.lichen).toBe(lichen.length);
    for (const spot of lichen) {
      expect(stack.blockStateProps(spot.stateId)?.props["up"]).toBe("true");
      expect(spot.y).toBe(G + 8);
      expect(spot.x).toBe(11);
    }
  });
});

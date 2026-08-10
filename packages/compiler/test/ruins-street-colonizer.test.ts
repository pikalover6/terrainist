/**
 * **The street colonizer** — `docs/RUINS-PLAN-v0-WP6.md` WP-6d.
 *
 * Kai's own addition to the green skin, and the wave that answers the first
 * clause of his sentence about the walk:
 *
 * > **Ruling (Kai, 2026-08-10): trees and plants in the middle of a road are
 * > part of an overgrown settlement.** This supersedes the closure's
 * > streets-stay-clear rule **for ruined quarters only.**
 *
 * §11's machine checks for the wave, in order:
 *
 * - the differential walkability bar of §6.3 — colonizer on vs off, **no metric
 *   worse** — which is also Q6's ruling put into practice: a ruined fixture
 *   carries its **own** golden set, and its baseline is the colonizer-off
 *   compile rather than the town goldens, so *"the ruin got more overgrown"*
 *   can never read as *"the town got worse"*;
 * - every spine unbroken end to end;
 * - the shortest sight-line run ≥ `SIGHT_MIN` on every street of the fixture;
 * - zero trunks within `JUNCTION_CLEAR` of an intersection;
 * - zero trunks on `building` / `interior` / `farm` / `courtyard` / `prop`;
 * - zero trunks anywhere in a world whose ruin field is empty — the closure,
 *   still closed, which is every world that ruins nothing;
 * - the `W513` withdrawal rate, reported and under 5 %;
 * - lint zero on all 27 rules, on a world read back off disk.
 *
 * And the one bar §11 does not name but the walk assertion does — *"there are
 * trees standing in the street"* — because an election no tree ever reaches is
 * the countable-proxy trap with a new hat on.
 */

import { mkdtemp, readFile, readdir, rm, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { greenSkinShares } from "@terrainist/stdlib";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, listChunks, type PrismarineStack } from "../src/emit/prismarine.js";
import { auditWalkability, walkabilityContextOf } from "../src/emit/walkability.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { JUNCTION_CLEAR, SIGHT_MIN } from "../src/structures/green-skin.js";
import { compileTerrain } from "../src/terrain/compile.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { StructurePassResult } from "../src/structures/index.js";

const QUARTER = {
  fabric: "grid",
  density: "medium",
  blockSize: 40,
  mix: ["townhouse", "shop_row", "warehouse"],
};

function doc(decline?: number): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "ruins_wp6d", worldSeed: 419 },
    ...(decline === undefined ? {} : { intent: { decline } }),
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [224, 224] },
      children: [
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
            // The kit's standing line — §10's amendment is the compiler's, not
            // the author's, so this document says exactly what every other one
            // says and still gets trees in its dead streets.
            avoidTags: ["structure", "road", "plaza"],
            species: [{ id: "reclaim_birch", weight: 1, shape: "birch_slim" }],
          },
        },
      ],
    },
  };
}

let root: string;
let dir: string;
let plan: ColumnPlan;
let structures: StructurePassResult;
let stack: PrismarineStack;
let physics: PhysicsReport;
/** Every log column of the emitted world. */
let woodColumns: Set<string>;

interface Skin {
  readonly colonized: Uint8Array;
  readonly shellTrunks: Uint8Array;
  readonly counts: Record<string, number>;
  readonly legibility: Record<string, number>;
}

const skin = (result: StructurePassResult): Skin => result.greenSkin as unknown as Skin;

async function compileInto(name: string, spec: unknown): Promise<{
  readonly dir: string;
  readonly plan: ColumnPlan;
  readonly structures: StructurePassResult;
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
      `fixture "${name}" failed: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  return {
    dir: out,
    plan: captured as ColumnPlan,
    structures: compiled.report.layout?.structures as StructurePassResult,
  };
}

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

/** The column key of a world column, or -1 outside the region. */
function columnOf(p: ColumnPlan, x: number, z: number): number {
  const i = x - p.region.x0;
  const j = z - p.region.z0;
  if (i < 0 || j < 0 || i >= p.region.width || j >= p.region.depth) return -1;
  return j * p.region.width + i;
}

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  root = await mkdtemp(path.join(tmpdir(), "terrainist-wp6d-"));
  const main = await compileInto("dead_quarter", doc(0.95));
  dir = main.dir;
  plan = main.plan;
  structures = main.structures;

  woodColumns = new Set();
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
          for (let y = 60; y <= 140; y++) {
            const name = stack.blockNameByStateId(chunk.getBlockStateId(lx, y, lz));
            if (name === undefined) continue;
            if (name.endsWith("_log") || name.endsWith("_wood")) {
              woodColumns.add(`${x},${z}`);
              break;
            }
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

/** Every elected column, as world coordinates. */
function trunkColumns(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const mask = skin(structures).colonized;
  for (let k = 0; k < mask.length; k++) {
    if (mask[k] !== 1) continue;
    const i = k % plan.region.width;
    out.push({
      x: plan.region.x0 + i,
      z: plan.region.z0 + (k - i) / plan.region.width,
    });
  }
  return out;
}

describe("the election ran, and it says so (§9)", () => {
  it("elected street trunks and reported them in `LOAM-I514`", () => {
    expect(skin(structures).counts.streetTrunks).toBeGreaterThan(0);
    const i514 = structures.diagnostics.filter((d) => d.code === "LOAM-I514");
    expect(i514.length).toBe(1);
    expect(i514[0]?.message).toMatch(/street trunks/);
    expect(i514[0]?.message).toMatch(/shortest sight-line run/);
  });

  it("withdrew under 5 % of what it elected (§11, §6.3)", () => {
    const { elected, withdrawn } = skin(structures).legibility;
    expect(elected).toBeGreaterThan(0);
    // > A sustained `W513` rate is a finding about `STREET_TRUNK_SHARE`, not
    // > about the withdraw loop.
    expect(withdrawn / elected).toBeLessThan(0.05);
    const w513 = structures.diagnostics.filter((d) => d.code === "LOAM-W513");
    expect(w513.length).toBe(withdrawn > 0 ? 1 : 0);
  });

  it("stood real trees on what it elected — the offer was taken (§6.4)", () => {
    // The countable-proxy trap, closed: an election no tree ever reaches spends
    // the spine, the junction clearance, the sight lines and the spacing on
    // nothing at all. The bar is the emitted world, not the mask.
    const elected = trunkColumns();
    const standing = elected.filter((p) => woodColumns.has(`${p.x},${p.z}`));
    expect(elected.length).toBeGreaterThan(0);
    expect(standing.length / elected.length).toBeGreaterThan(0.5);
  });
});

describe("physics (§8)", () => {
  it("lints zero on all 27 rules", () => {
    expect(PHYSICS_RULES.length).toBe(27);
    const byRule = new Map<string, number>();
    for (const f of physics.findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
    expect(Object.fromEntries(byRule)).toEqual({});
  });
});

describe("the legibility law (§6.2)", () => {
  it("keeps every spine unbroken end to end", () => {
    expect(skin(structures).legibility.spineColumns).toBeGreaterThan(0);
    expect(skin(structures).legibility.spineBreaks).toBe(0);
  });

  it("keeps every sight-line run at or above `SIGHT_MIN`", () => {
    // *"This is the number that makes 'grid at city scale' a measurement rather
    // than an opinion."*
    expect(skin(structures).legibility.sightViolations).toBe(0);
    expect(skin(structures).legibility.shortestSightRun).toBeGreaterThanOrEqual(SIGHT_MIN);
  });

  it("stands no trunk within `JUNCTION_CLEAR` of an intersection", () => {
    const trunks = trunkColumns();
    expect(trunks.length).toBeGreaterThan(0);
    for (const district of structures.districts) {
      for (const node of district.streets.intersections) {
        for (const p of trunks) {
          expect(
            Math.max(Math.abs(node.x - p.x), Math.abs(node.z - p.z)),
            `trunk ${p.x},${p.z} at junction ${node.x},${node.z}`,
          ).toBeGreaterThan(JUNCTION_CLEAR);
        }
      }
    }
  });

  it("keeps elected trunks `STREET_TRUNK_SPACING` apart", () => {
    // *"Independent per-column election gives a hedge, not a colonnade."* The
    // bar is the loosest band's spacing, because a fixture spans bands and a
    // pair may be elected one from each.
    const loosest = Math.min(
      ...(["light", "heavy", "total"] as const).map((b) => greenSkinShares(b).streetTrunkSpacing),
    );
    const trunks = trunkColumns();
    for (let a = 0; a < trunks.length; a++) {
      for (let b = a + 1; b < trunks.length; b++) {
        const pa = trunks[a] as { x: number; z: number };
        const pb = trunks[b] as { x: number; z: number };
        expect(
          Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.z - pb.z)),
          `${pa.x},${pa.z} and ${pb.x},${pb.z}`,
        ).toBeGreaterThanOrEqual(loosest);
      }
    }
  });
});

describe("what stays closed (§6.1)", () => {
  it("elects no column inside a shell, a cellar or on a prop's stand", () => {
    // > `building`, `interior`, `farm`, `courtyard` and `prop` stay hard, so no
    // > trunk ever stands in a shell, in a cellar mouth, in a field or on a
    // > prop's stand.
    const closed = new Set<string>();
    for (const b of structures.buildings) {
      for (const cell of b.cells) closed.add(cell);
      for (const cell of b.interiorCells) closed.add(cell);
      for (const cell of b.basementCells ?? []) closed.add(cell);
    }
    for (const p of structures.props) {
      for (let z = p.footprint.z0; z <= p.footprint.z1; z++) {
        for (let x = p.footprint.x0; x <= p.footprint.x1; x++) closed.add(`${x},${z}`);
      }
    }
    for (const p of trunkColumns()) {
      expect(closed.has(`${p.x},${p.z}`), `trunk at ${p.x},${p.z}`).toBe(false);
    }
  });

  it("elects only inside the ruin field — the closure, still closed", () => {
    // Every elected column sits where the field is positive. Everywhere the
    // field is zero the closure stands exactly as written, which is every
    // column of every world that ruins nothing.
    const field = (structures.ruinField as { field: Float32Array }).field;
    for (const p of trunkColumns()) {
      const k = columnOf(plan, p.x, p.z);
      expect(k).toBeGreaterThanOrEqual(0);
      expect((field[k] as number) > 0, `trunk at ${p.x},${p.z} outside the field`).toBe(true);
    }
  });

  it("does not run at all where there is no field — the reach law", async () => {
    // THE REACH LAW (§3.4). A decline-free document builds no field, so the
    // skin does not run, so the mask has no bits and `reclaimOpen`'s new clause
    // opens nothing. The negative control is the same document twice.
    const clean = await compileInto("clean", doc());
    expect(clean.structures.ruinField).toBeUndefined();
    expect(clean.structures.greenSkin).toBeUndefined();
    expect(clean.structures.diagnostics.some((d) => d.code === "LOAM-W513")).toBe(false);
    const twice = await compileInto("clean-again", doc());
    expect(await regionDigest(twice.dir)).toBe(await regionDigest(clean.dir));
  }, 1_800_000);
});

describe("U2 — growth never seals a route (§6.3, Q6)", () => {
  it("costs the walkability audit nothing — the differential bar", async () => {
    // §6.3's acceptance, and Q6's ruling: *"give ruined fixtures their own
    // golden set, with the colonizer-off compile as their baseline"*. A golden
    // number cannot say whether a change was caused by this pass; a
    // differential can, and it makes the ruin's goldens say the thing they
    // should say — **the growth cost nothing**.
    const off = path.join(root, "colonizer-off");
    await cp(dir, off, { recursive: true });
    // The colonizer taken back off the world, and **only** the colonizer: the
    // wood standing in each elected column's own shaft, put back to air. The
    // wider crown is deliberately left alone — clearing a 9x9 around every
    // trunk also fells the ambient trees beside it, and a baseline that is
    // *more* open than the real one turns a fair differential into a rigged
    // one (measured: it reported 1 component against 2 for that reason).
    // What a walker stands on in a street is the shaft, and the shaft is what
    // the election put there.
    const trunks = trunkColumns();
    const byChunk = new Map<string, { x: number; z: number }[]>();
    for (const p of trunks) {
      const chunkKey = `${p.x >> 4},${p.z >> 4}`;
      const list = byChunk.get(chunkKey);
      if (list === undefined) byChunk.set(chunkKey, [p]);
      else list.push(p);
    }
    const air = stack.blockByName("minecraft:air")?.stateId as number;
    const anvil = stack.openAnvil(path.join(off, "region"));
    try {
      for (const [key, list] of byChunk) {
        const [cx, cz] = key.split(",").map(Number) as [number, number];
        const chunk = await anvil.load(cx, cz);
        if (chunk === null) continue;
        for (const { x, z } of list) {
          const k = columnOf(plan, x, z);
          if (k < 0) continue;
          const ground = plan.ground[k] as number;
          for (let y = ground + 1; y <= ground + 32; y++) {
            const name = stack.blockNameByStateId(chunk.getBlockStateId(x - cx * 16, y, z - cz * 16));
            if (name === undefined) continue;
            if (!name.endsWith("_log") && !name.endsWith("_wood") && !name.endsWith("_leaves")) {
              continue;
            }
            chunk.setStateId(x - cx * 16, y, z - cz * 16, air);
          }
        }
        await anvil.save(cx, cz, chunk);
      }
    } finally {
      await anvil.close();
    }

    const context = walkabilityContextOf(plan, structures, {
      ...(structures.districts[0] === undefined ? {} : { town: structures.districts[0].bounds }),
    });
    const on = await auditWalkability(dir, stack, context);
    const without = await auditWalkability(off, stack, context);
    // > The colonizer's contribution to each must be exactly zero.
    expect(on.components.length).toBeLessThanOrEqual(without.components.length);
    expect(on.orphanColumns).toBeLessThanOrEqual(without.orphanColumns);
    expect(on.entranceReachableShare).toBeGreaterThanOrEqual(without.entranceReachableShare);
  }, 1_800_000);
});

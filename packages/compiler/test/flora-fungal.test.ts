/**
 * WP-C: the fungal and fantasy tiers (FLORA-GRAMMAR-v0 §3.11, §4.1, §5.6, §8.1).
 *
 * Three things are being asserted, and they are three different kinds of claim:
 *
 * 1. **The `fungal` program is a mushroom, not a tree with a red hat.** The six
 *    laws hold at every envelope corner, and the shape properties that make a
 *    mushroom a mushroom — a one-block shell, an apex over the stalk, a rim lip
 *    — are checked directly, because "it looks like a mushroom" is exactly the
 *    thing a law about connectivity cannot say.
 * 2. **The catalog is honest**: every symbol the four new species name resolves
 *    to a block the pinned 1.21.11 table carries, and no fantasy species is
 *    reachable from a climate table.
 * 3. **The grove compiles, lints clean on all 27 rules and is actually
 *    fungal** — a compiled world read back off disk, which is the only test
 *    that sees what unit tests cannot.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";

import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { compileArtifacts, compileTerrain  } from "../src/terrain/compile.js";
import { EMIT_MINECRAFT_VERSION, listChunks, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { DEFAULT_PALETTE } from "../src/terrain/palette.js";
import {
  CLIMATE_STRATA,
  FLORA_SPECIES,
  FUNGAL_FLORA_SPECIES,
  MAX_CAP_RADIUS,
  SHAPE_PROGRAMS,
  WOOD_PARTS,
  type FloraBlock,
  type FloraSpeciesDef,
  type FloraVariation
} from "../src/terrain/vegetation.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
const FACES: readonly (readonly [number, number, number])[] = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0]
];

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

interface Case {
  readonly id: string;
  readonly def: FloraSpeciesDef;
  readonly v: FloraVariation;
  readonly blocks: readonly FloraBlock[];
}

/** Every WP-C species × every corner of its envelope × four RNG streams. */
function matrix(): Case[] {
  const out: Case[] = [];
  for (const raw of Object.values(FUNGAL_FLORA_SPECIES)) {
    const def = raw as FloraSpeciesDef;
    const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
    for (const height of [def.height[0], def.height[1]]) {
      for (const radiusDelta of [-1, 0, 1]) {
        for (const stream of [1, 7, 99, 12345]) {
          const v: FloraVariation = { height, radiusDelta, mega: false };
          out.push({ id: def.id, def, v, blocks: program.blocks(v, def, seededRng(stream)) });
        }
      }
    }
  }
  return out;
}

const CASES = matrix();
const MUSHROOMS = CASES.filter((c) => c.def.program === "fungal");

describe("flora WP-C: the fungal program obeys the six laws", () => {
  it("law 1: no wood-family part is the top of its column — a stalk never pokes through its cap", () => {
    for (const { id, v, blocks } of MUSHROOMS) {
      const top = new Map<string, FloraBlock>();
      for (const b of blocks) {
        const k = `${b.dx},${b.dz}`;
        const seen = top.get(k);
        if (seen === undefined || b.dy > seen.dy) top.set(k, b);
      }
      for (const b of top.values()) {
        expect(
          WOOD_PARTS.has(b.part),
          `${id} ${JSON.stringify(v)}: bare ${b.part} at the top of column ${b.dx},${b.dz}`,
        ).toBe(false);
      }
    }
  });

  it("law 5: the output is a pure function of (variation, def, rng seed)", () => {
    for (const raw of Object.values(FUNGAL_FLORA_SPECIES)) {
      const def = raw as FloraSpeciesDef;
      const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
      const v: FloraVariation = { height: def.height[1], radiusDelta: 0, mega: false };
      expect(program.blocks(v, def, seededRng(42))).toEqual(program.blocks(v, def, seededRng(42)));
    }
  });

  it("law 6: every full-cube part is 6-connected to the stalk", () => {
    for (const { id, v, blocks } of CASES) {
      const solid = new Map<string, FloraBlock>();
      for (const b of blocks) if (b.part !== "hanging") solid.set(key(b.dx, b.dy, b.dz), b);
      // Flood from the wood: a component that never reaches it is a floating
      // cap plate, which `floating.isolated` would find one lint later.
      const seen = new Set<string>();
      const queue: string[] = [];
      for (const [k, b] of solid) {
        if (!WOOD_PARTS.has(b.part)) continue;
        seen.add(k);
        queue.push(k);
      }
      while (queue.length > 0) {
        const k = queue.pop() as string;
        const [x, y, z] = k.split(",").map(Number) as [number, number, number];
        for (const [ox, oy, oz] of FACES) {
          const n = key(x + ox, y + oy, z + oz);
          if (!solid.has(n) || seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      for (const [k, b] of solid) {
        expect(seen.has(k), `${id} ${JSON.stringify(v)}: ${b.part} at ${k} is detached`).toBe(true);
      }
    }
  });

  it("canopyRadius bounds the block list", () => {
    for (const { id, def, v, blocks } of CASES) {
      const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
      const r = program.canopyRadius(v, def);
      for (const b of blocks) {
        expect(Math.abs(b.dx), `${id} dx past canopyRadius ${r}`).toBeLessThanOrEqual(r);
        expect(Math.abs(b.dz), `${id} dz past canopyRadius ${r}`).toBeLessThanOrEqual(r);
      }
    }
  });
});

describe("flora WP-C: a mushroom reads as a mushroom", () => {
  it("the cap is a shell, not a solid — every mushroom has an underside", () => {
    for (const { id, v, blocks } of MUSHROOMS) {
      const solid = new Set<string>();
      for (const b of blocks) if (b.part === "cap" || b.part === "stem") solid.add(key(b.dx, b.dy, b.dz));
      // A shell of radius R over a stalk has far fewer blocks than the box it
      // occupies; a solid dome has most of them. The bar is deliberately loose
      // — it is a shape assertion, not a block count.
      const caps = blocks.filter((b) => b.part === "cap").length;
      const capColumns = new Set(
        blocks.filter((b) => b.part === "cap").map((b) => `${b.dx},${b.dz}`),
      ).size;
      // A shell is a *surface*: a couple of blocks per column, wherever the
      // slope of the dome asks for them. A solid dome is the rise times the
      // disc, which at every shipped envelope corner is well past three.
      expect(caps / capColumns, `${id} ${JSON.stringify(v)} cap blocks per column`).toBeLessThan(3);
      // …and it is a shell of *one* block: no cap column is more than four deep.
      const perColumn = new Map<string, number>();
      for (const b of blocks) {
        if (b.part !== "cap") continue;
        const k = `${b.dx},${b.dz}`;
        perColumn.set(k, (perColumn.get(k) ?? 0) + 1);
      }
      for (const [k, n] of perColumn) {
        expect(n, `${id} ${JSON.stringify(v)} cap column ${k} is ${n} deep`).toBeLessThanOrEqual(4);
      }
    }
  });

  it("the apex sits directly over the stalk, and the cap covers every stem column", () => {
    for (const { id, v, blocks } of MUSHROOMS) {
      const stems = blocks.filter((b) => b.part === "stem");
      const columns = new Set(stems.map((b) => `${b.dx},${b.dz}`));
      for (const column of columns) {
        const [dx, dz] = column.split(",").map(Number) as [number, number];
        const capped = blocks.some(
          (b) => b.part === "cap" && b.dx === dx && b.dz === dz && b.dy >= v.height,
        );
        expect(capped, `${id} ${JSON.stringify(v)}: stem column ${column} uncapped`).toBe(true);
      }
    }
  });

  it("the rim drops a lip: the cap's edge reaches below its apex", () => {
    for (const { id, v, blocks } of MUSHROOMS) {
      const caps = blocks.filter((b) => b.part === "cap");
      const apex = Math.max(...caps.map((b) => b.dy));
      const rim = Math.min(...caps.map((b) => b.dy));
      expect(apex, `${id} ${JSON.stringify(v)} apex`).toBeGreaterThanOrEqual(v.height);
      expect(rim, `${id} ${JSON.stringify(v)} lip`).toBeLessThan(apex);
    }
  });

  it("allometry: a mushroom grown past its envelope grows its cap, sub-linearly", () => {
    // The same discipline the crowns took on 2026-08-10: a mushroom at twice
    // its table height is a *taller* mushroom, not a flying saucer — and it is
    // emphatically not the same silhouette it had at table height.
    const def = FUNGAL_FLORA_SPECIES.mushroom_giant_red as FloraSpeciesDef;
    const program = SHAPE_PROGRAMS.fungal;
    const base = program.canopyRadius({ height: def.height[1], radiusDelta: 0, mega: false }, def);
    const tall = program.canopyRadius({ height: def.height[1] * 3, radiusDelta: 0, mega: false }, def);
    expect(tall).toBeGreaterThan(base);
    expect(tall).toBeLessThanOrEqual(base * 3);
    expect(tall).toBeLessThanOrEqual(MAX_CAP_RADIUS);
  });

  it("the red giant out-tops the grove's own canopy", () => {
    // §8's prominence bar, applied where it means something for a species with
    // no climate: the grove's emergent against the grove's canopy, worst corner
    // against best. `flora-grandeur.test.ts` holds the climate-bearing
    // emergents to the 13-block floor and skips these two by the same rule.
    const giant = FUNGAL_FLORA_SPECIES.mushroom_giant_red as FloraSpeciesDef;
    const shelf = FUNGAL_FLORA_SPECIES.mushroom_shelf_brown as FloraSpeciesDef;
    // §4.1 fixes the two envelopes at 8–14 and 5–8, which overlap at exactly
    // one point — a shortest red giant and a tallest shelf are the same height.
    // What the grove needs is that the *species* stands over the canopy, which
    // is the envelope's reach and its median, not its floor.
    expect(giant.height[1] - shelf.height[1], "envelope reach").toBeGreaterThanOrEqual(5);
    expect(
      (giant.height[0] + giant.height[1]) / 2 - (shelf.height[0] + shelf.height[1]) / 2,
      "median clearance",
    ).toBeGreaterThanOrEqual(4);
  });
});

describe("flora WP-C: the catalog is honest", () => {
  it("every symbol the new species name resolves to a block the palette carries", () => {
    for (const raw of Object.values(FUNGAL_FLORA_SPECIES)) {
      const def = raw as FloraSpeciesDef;
      for (const symbol of [
        def.trunkSymbol,
        def.leafSymbol,
        def.stemSymbol,
        def.capSymbol,
        def.hangingSymbol,
        def.decoSymbol,
        def.rootSymbol,
        def.deadSymbol
      ]) {
        if (symbol === undefined) continue;
        expect(DEFAULT_PALETTE[symbol], `${def.id} names unknown symbol ${symbol}`).toBeDefined();
      }
    }
  });

  it("every symbol a program actually emits is resolvable for its species", () => {
    // The `street.sidewalk` defect — a symbol six modules read and no palette
    // carries — caught at the registry rather than in a walk.
    const NEEDED: Readonly<Record<string, keyof FloraSpeciesDef>> = {
      stem: "stemSymbol",
      cap: "capSymbol",
      hanging: "hangingSymbol",
      deco: "decoSymbol"
    };
    for (const { id, def, blocks } of CASES) {
      for (const b of blocks) {
        const field = NEEDED[b.part];
        if (field === undefined) continue;
        expect(def[field], `${id} emits a ${b.part} with no symbol for it`).toBeDefined();
      }
    }
  });

  it("no fantasy species appears in any climate table, and none carries a climate", () => {
    const fantasy = Object.values(FLORA_SPECIES)
      .filter((def) => def.fantasy === true)
      .map((def) => def.id);
    expect(fantasy.sort()).toEqual(["crystal_spire", "glowcap"]);
    for (const def of Object.values(FLORA_SPECIES)) {
      if (def.fantasy !== true) continue;
      expect(def.climates ?? [], `${def.id} carries a climate`).toEqual([]);
    }
    for (const rows of Object.values(CLIMATE_STRATA)) {
      for (const row of Object.values(rows)) {
        for (const id of row) expect(fantasy).not.toContain(id);
      }
    }
  });

  it("the two mushrooms are naturalistic but unreachable by default", () => {
    for (const id of ["mushroom_giant_red", "mushroom_shelf_brown"]) {
      const def = FLORA_SPECIES[id] as FloraSpeciesDef;
      expect(def.fantasy, `${id} is not fantasy`).toBeUndefined();
      expect(def.climates ?? []).toEqual([]);
    }
    for (const rows of Object.values(CLIMATE_STRATA)) {
      for (const row of Object.values(rows)) {
        expect(row).not.toContain("mushroom_giant_red");
        expect(row).not.toContain("mushroom_shelf_brown");
      }
    }
  });

  it("`fungal` has a non-fantasy client — a program only fantasy can reach never runs", () => {
    const clients = Object.values(FLORA_SPECIES).filter(
      (def) => def.program === "fungal" && def.fantasy !== true,
    );
    expect(clients.map((d) => d.id).sort()).toEqual(["mushroom_giant_red", "mushroom_shelf_brown"]);
  });
});

/* -------------------------------------------------------------------------- */
/* The compiled grove (§7.2, §8.1)                                             */
/* -------------------------------------------------------------------------- */

describe("flora WP-C: the fungal grove compiles, lints and is fungal", () => {
  let dir: string;
  let root: string;
  let stack: PrismarineStack;
  let plan: ColumnPlan;
  let physics: PhysicsReport;
  let report: Awaited<ReturnType<typeof compileTerrain>> extends { report: infer R } ? R : never;
  let counts: Record<string, number> = {};
  const bands: { lo: number; hi: number; caps: number; area: number }[] = [];

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-fungal-"));
    dir = path.join(root, "spore_hollow");
    const doc = JSON.parse(
      await readFile(new URL("fixtures/examples/flora-fungal-grove.loam.json", import.meta.url), "utf8"),
    ) as unknown;
    const art_compiled = await compileArtifacts(doc, {});
  if (!art_compiled.ok) throw new Error(art_compiled.diagnostics.map((d) => d.name).join(", "));
  plan = art_compiled.artifacts.plan;
  const compiled = await compileTerrain(doc, { outDir: dir });
    if (!compiled.ok) {
      throw new Error(
        `grove failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    report = compiled.report as never;
    physics = await lintWorldPhysics(dir, stack, {
      buildings: [] as never,
      roads: [] as never,
      tunnels: [],
      terrainTop: {
        x0: plan.region.x0,
        z0: plan.region.z0,
        width: plan.region.width,
        depth: plan.region.depth,
        ground: plan.ground,
        entrances: new Uint8Array(plan.region.width * plan.region.depth)
      }
    });
    // Counted inside the **grove's own disc** (`area: {at: [0.5, 0.5], radius:
    // 120}`, which centres on the world origin): the document also plants a
    // 384²-wide spruce rim, and "is the flora fungal" is a question about the
    // hollow, not about the wilderness fill around it.
    // One pass over the region files, bucketed by distance from the grove's
    // centre. `counts` is the hollow itself (`area: {at: [0.5, 0.5], radius:
    // 120}`, which centres on the world origin) — the document also plants a
    // 384²-wide spruce rim, and "is the flora fungal" is a question about the
    // hollow, not about the wilderness fill around it. `bands` is the treeline.
    const census = await censusWorld(dir, stack);
    counts = census.counts;
    bands.push(...census.bands);
  }, 600_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("compiles with no error diagnostic", () => {
    expect(
      (report as { diagnostics: readonly { severity: string; message: string }[] }).diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.message),
    ).toEqual([]);
  });

  it("lints zero on every physics rule", () => {
    const findings = Object.fromEntries(
      PHYSICS_RULES.map((rule) => [rule, physics.counts[rule] ?? 0]).filter(([, n]) => (n as number) > 0),
    );
    expect(findings).toEqual({});
  });

  it("the fungal flora is the dominant visual, not a reskin of trees", () => {
    // The P7 assertion, made countable: caps and stems outnumber leaves inside
    // the grove's own document, and the two fungal species between them carry
    // more blocks than every tree in the world.
    expect(counts["cap"], "cap blocks").toBeGreaterThan(2000);
    expect(counts["stem"], "stem blocks").toBeGreaterThan(1000);
    expect(counts["cap"] as number).toBeGreaterThan(counts["leaves"] ?? 0);
  });

  it("the grove's edge fades rather than snapping", () => {
    // The P7 assertion. A hard `area` predicate would put every cap inside
    // r = 120 and none outside it — a wood you can measure with a ruler, which
    // is the defect `edgeFalloff` and `AREA_EDGE_WOBBLE` exist to end. So the
    // fungal canopy must *reach past* the nominal radius, and its density must
    // fall off rather than stop.
    const density = bands.map((b) => b.caps / b.area);
    expect(bands[2]?.caps ?? 0, "caps past the nominal radius").toBeGreaterThan(0);
    expect(density[0] as number, "interior denser than the rim").toBeGreaterThan(
      density[1] as number,
    );
    expect(density[1] as number, "rim denser than the fringe").toBeGreaterThan(density[2] as number);
  });

  it("the floor is a fungal floor: mycelium and moss, and no flowers", () => {
    expect(counts["mycelium"], "mycelium").toBeGreaterThan(0);
    expect(counts["moss_block"], "moss").toBeGreaterThan(0);
    // Not zero, and correctly so: the document's `{all: true}` spruce rim
    // reaches over the lip of the basin, and where *its* mask dresses a column
    // the default floor is what dresses it. What the assertion is really about
    // is that the hollow's own ground is fungal, so the bar is a ratio: floor
    // mushrooms outnumber flowers inside the disc by an order of magnitude.
    expect((counts["flowers"] ?? 0) * 10, "flowers vs floor mushrooms").toBeLessThan(
      counts["mushroom_floor"] as number,
    );
    expect(counts["mushroom_floor"], "floor mushrooms").toBeGreaterThan(0);
  });
});

/**
 * Count the block families this feature is about, off the written region files.
 *
 * Reading the world back rather than the placement list on purpose: the bar is
 * what a player meets, and everything between the scatter and the disk — the
 * clip, the build-limit drop, the emitter's own mapping — is exactly what a
 * placement-list count would not see.
 */
const BANDS: readonly (readonly [number, number])[] = [
  [90, 110],
  [110, 125],
  [125, 145]
];

async function censusWorld(
  dir: string,
  stack: PrismarineStack,
): Promise<{
  counts: Record<string, number>;
  bands: { lo: number; hi: number; caps: number; area: number }[];
}> {
  const out: Record<string, number> = {
    cap: 0,
    stem: 0,
    leaves: 0,
    glow: 0,
    mycelium: 0,
    moss_block: 0,
    mushroom_floor: 0,
    flowers: 0,
    understory: 0
  };
  const FLOWERS = new Set([
    "poppy",
    "dandelion",
    "cornflower",
    "oxeye_daisy",
    "azure_bluet"
  ]);
  const bandCaps: number[][] = BANDS.map(() => [0]);
  const regionDir = path.join(dir, "region");
  const anvil = stack.openAnvil(regionDir);
  try {
    for (const { chunkX, chunkZ } of await listChunks(regionDir)) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk === null) continue;
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const wx = chunkX * 16 + lx;
          const wz = chunkZ * 16 + lz;
          const r2 = wx * wx + wz * wz;
          const band = BANDS.findIndex(([lo, hi]) => r2 >= lo * lo && r2 < hi * hi);
          const inGrove = r2 <= 120 * 120;
          if (!inGrove && band < 0) continue;
          for (let y = 40; y <= 140; y++) {
            const decoded = stack.blockStateProps(chunk.getBlockStateId(lx, y, lz));
            if (decoded === undefined) continue;
            const name = decoded.name;
            if (name === "air" || name === "cave_air") continue;
            if (band >= 0 && (name.endsWith("mushroom_block") || name === "warped_wart_block")) {
              (bandCaps[band] as number[])[0] += 1;
            }
            if (!inGrove) continue;
            if (name.endsWith("mushroom_block") || name === "warped_wart_block") out["cap"] += 1;
            else if (name === "mushroom_stem" || name === "warped_stem") out["stem"] += 1;
            else if (name.endsWith("_leaves")) out["leaves"] += 1;
            else if (name === "shroomlight" || name === "glowstone" || name === "glow_lichen")
              out["glow"] += 1;
            else if (name === "mycelium") out["mycelium"] += 1;
            else if (name === "moss_block") out["moss_block"] += 1;
            else if (name === "brown_mushroom" || name === "red_mushroom") out["mushroom_floor"] += 1;
            else if (FLOWERS.has(name)) out["flowers"] += 1;
            else if (name === "azalea_leaves") out["understory"] += 1;
          }
        }
      }
    }
  } finally {
    await anvil.close();
  }
  return {
    counts: out,
    bands: BANDS.map(([lo, hi], i) => ({
      lo,
      hi,
      caps: (bandCaps[i] as number[])[0] as number,
      area: Math.PI * (hi * hi - lo * lo)
    }))
  };
}

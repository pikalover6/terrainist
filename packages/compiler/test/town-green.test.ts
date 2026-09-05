/**
 * The town green — small vegetation inside the settlement's claim.
 *
 * `UNDERGROWTH_FEATHER` (2026-08-07) fixed the *outside* of the boundary the
 * layout solver's occupancy rectangles draw: a hard line across natural terrace
 * after natural terrace, plants on one side and none on the other. Kai's walk of
 * `hillside_town-8` (2026-08-08) found the inside of that same boundary — the
 * town itself — *"completely bare except a couple trees and flowers in a
 * backyard"*.
 *
 * The measurement behind the fix, taken on the compiled `site-plan-hillside`
 * fixture: of **26,529** columns the occupancy union claims, **6,891 (26%)**
 * have anything built or paved on them. The other **74%** is ground the
 * rectangle merely covers — yards, gaps between lots, the natural pockets the
 * fabric never reached. Suppressing plants there is suppressing them on natural
 * ground, which is the rectangle-union lesson one level in.
 *
 * What the tests below hold:
 *
 * 1. `townGreenMask` is exactly "claimed, natural, and nothing built on it or
 *    within {@link TOWN_GREEN_STANDOFF} columns" — asserted on a synthetic grid
 *    where every case is visible by eye.
 * 2. The coarse tags are *not* honoured as avoid tags, and the fine ones are.
 *    Every fixture in the tree writes ``, and
 *    `structure` is the rectangle union itself: honouring it left 8 green
 *    columns out of 15,918.
 * 3. On the compiled fixture the town is no longer bare — hundreds of plants
 *    inside the district — and **not one of them stands on built or paved
 *    ground**, checked by reading the world back off disk rather than by asking
 *    the compiler what it meant to do.
 * 4. Two compiles of the same document agree, block for block, on what grew.
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ERA_CLASSES } from "@terrainist/spec/ir";

import { fanOut, installFanOutRows } from "../src/intent/index.js";
import { resolveIntents, intentFor, type ResolvedIntent } from "../src/intent/resolve.js";
import { SETTLEMENT_GREENERY, TERRAIN_ROWS } from "../src/terrain/climate-intent.js";
import { EMIT_MINECRAFT_VERSION, listChunks, loadPrismarine, type EmitChunk, type PrismarineStack } from "../src/emit/prismarine.js";
import { compileArtifacts, compileTerrain } from "../src/terrain/compile.js";
import type { OccupancyGrid } from "../src/layout/types.js";
import {
  BUILT_OCCUPANCY_TAGS,
  TOWN_GREEN_DENSITY,
  TOWN_GREEN_STANDOFF,
  townGreenMask
} from "../src/terrain/vegetation.js";

/* -------------------------------------------------------------------------- */
/* 1 — the mask, on ground small enough to check by hand                       */
/* -------------------------------------------------------------------------- */

const W = 24;
const D = 24;

function grid(fill: number): Uint8Array {
  return new Uint8Array(W * D).fill(fill);
}

/** An occupancy grid claiming `x in [4,19], z in [4,19]` as one rectangle. */
function claimRect(tags: Record<string, readonly [number, number][]> = {}): OccupancyGrid {
  const mask = new Uint8Array(W * D);
  for (let z = 4; z <= 19; z++) for (let x = 4; x <= 19; x++) mask[z * W + x] = 1;
  const byTag = new Map<string, Uint8Array>();
  // The solver's own tag: the whole rectangle, which is the point.
  byTag.set("structure", Uint8Array.from(mask));
  for (const [tag, cells] of Object.entries(tags)) {
    const m = new Uint8Array(W * D);
    for (const [x, z] of cells) m[z * W + x] = 1;
    byTag.set(tag, m);
  }
  return { region: { x0: 0, z0: 0, width: W, depth: D }, mask, byTag } as unknown as OccupancyGrid;
}

describe("townGreenMask", () => {
  it("is empty outside the settlement's claim", () => {
    const green = townGreenMask(grid(1), claimRect(), W, D);
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        if (x >= 4 && x <= 19 && z >= 4 && z <= 19) continue;
        expect(green[z * W + x], `${x},${z}`).toBe(0);
      }
    }
  });

  it("fills the claim when nothing was built in it", () => {
    const green = townGreenMask(grid(1), claimRect(), W, D);
    let n = 0;
    for (let k = 0; k < green.length; k++) if (green[k] === 1) n++;
    expect(n).toBe(16 * 16);
  });

  it("keeps a standoff around a building's blocks", () => {
    // One 2×2 building at (10,10)-(11,11), as the clip's column mask reports it.
    const built = new Uint8Array(W * D);
    for (let z = 10; z <= 11; z++) for (let x = 10; x <= 11; x++) built[z * W + x] = 1;
    const green = townGreenMask(grid(1), claimRect(), W, D, built);
    for (let z = 10 - TOWN_GREEN_STANDOFF; z <= 11 + TOWN_GREEN_STANDOFF; z++) {
      for (let x = 10 - TOWN_GREEN_STANDOFF; x <= 11 + TOWN_GREEN_STANDOFF; x++) {
        expect(green[z * W + x], `${x},${z}`).toBe(0);
      }
    }
    // …and one column further out is green astandoff is a hairline,
    // not a second rectangle.
    expect(green[(9 - TOWN_GREEN_STANDOFF) * W + 10]).toBe(1);
    expect(green[10 * W + (9 - TOWN_GREEN_STANDOFF)]).toBe(1);
  });

  it("keeps the same standoff around every per-column claim a pass declared", () => {
    for (const tag of BUILT_OCCUPANCY_TAGS) {
      const green = townGreenMask(grid(1), claimRect({ [tag]: [[8, 8]] }), W, D);
      expect(green[8 * W + 8], tag).toBe(0);
      expect(green[(8 + TOWN_GREEN_STANDOFF) * W + 8], tag).toBe(0);
      expect(green[(8 + TOWN_GREEN_STANDOFF + 1) * W + 8], tag).toBe(1);
    }
  });

  it("never grows where the node would not have planted anyway", () => {
    const natural = grid(1);
    for (let z = 4; z <= 11; z++) for (let x = 4; x <= 19; x++) natural[z * W + x] = 0;
    const green = townGreenMask(natural, claimRect(), W, D);
    for (let z = 4; z <= 11; z++) {
      for (let x = 4; x <= 19; x++) expect(green[z * W + x], `${x},${z}`).toBe(0);
    }
    expect(green[12 * W + 4]).toBe(1);
  });

  it("ignores the solver's area tags as avoid tags, and honours the paved ones", () => {
    // `structure` covers the whole claim. Honouring it would empty the green —
    // and did, on the first run: 8 columns out of 15,918.
    const coarse = townGreenMask(grid(1), claimRect(), W, D, undefined, ["structure"]);
    let n = 0;
    for (let k = 0; k < coarse.length; k++) if (coarse[k] === 1) n++;
    expect(n).toBe(16 * 16);

    const fine = townGreenMask(grid(1), claimRect({ plaza: [[8, 8]] }), W, D, undefined, ["plaza"]);
    expect(fine[8 * W + 8]).toBe(0);
  });

  it("thins rather than clears: the density constant is a tended yard, not a meadow", () => {
    expect(TOWN_GREEN_DENSITY).toBeGreaterThanOrEqual(0.4);
    expect(TOWN_GREEN_DENSITY).toBeLessThanOrEqual(0.6);
  });
});

/* -------------------------------------------------------------------------- */
/* 1b — the weak author dial                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `terrain.settlementGreenery` — one number, nudged by era, read twice.
 *
 * Kai's walk (2026-08-09) asked for interior density to be *weakly* controlled
 * by the author model, "influenced by era/theme", without overcomplicating it.
 * Weak means: three values, one of which is today's, and the dial moves the
 * share and nothing else — not the band width, not the standoff, not what grows.
 */
describe("the settlement-greenery dial", () => {
  beforeAll(() => {
    installFanOutRows();
  });
  const scope = (intent: Record<string, unknown>): ResolvedIntent =>
    intentFor(resolveIntents({ intent, root: { id: "world" } }), "world");

  it("is today's constant when nothing declares an era — law 2", () => {
    expect(
      fanOut<number>(TERRAIN_ROWS.settlementGreenery, scope({}), {
        nodePath: "world",
        today: TOWN_GREEN_DENSITY
      }),
    ).toBe(TOWN_GREEN_DENSITY);
    // And the named default *is* that constant, not a number that happens to
    // match it: the reach law downstream depends on the two being one value.
    expect(SETTLEMENT_GREENERY.tended).toBe(TOWN_GREEN_DENSITY);
  });

  it("leans lush for the pre-industrial eras and sparse for the paved ones", () => {
    const share = (era: string): number =>
      fanOut<number>(TERRAIN_ROWS.settlementGreenery, scope({ era }), {
        nodePath: "world",
        today: TOWN_GREEN_DENSITY
      });
    expect(share("medieval")).toBe(SETTLEMENT_GREENERY.lush);
    expect(share("primitive")).toBe(SETTLEMENT_GREENERY.lush);
    expect(share("modern")).toBe(SETTLEMENT_GREENERY.sparse);
    expect(share("far_future")).toBe(SETTLEMENT_GREENERY.sparse);
    // The middle of the table stays on today's value on purpose.
    expect(share("renaissance")).toBe(SETTLEMENT_GREENERY.tended);
    expect(share("industrial")).toBe(SETTLEMENT_GREENERY.tended);
    // An open era word dispatches through the alias table like every other row.
    expect(share("viking")).toBe(SETTLEMENT_GREENERY.lush);
    expect(share("cyberpunk")).toBe(SETTLEMENT_GREENERY.sparse);
    // ...and an era nobody knows lands on DEFAULT_ERA_CLASS (medieval), warned
    // about by the resolver — never off the table.
    expect(share("gronkulon")).toBe(SETTLEMENT_GREENERY.lush);
  });

  it("is a closed set of three — a weak dial cannot invent a density", () => {
    for (const era of ERA_CLASSES) {
      const answer = fanOut<number>(TERRAIN_ROWS.settlementGreenery, scope({ era }), {
        nodePath: "world",
        today: TOWN_GREEN_DENSITY
      });
      expect(GREENERY_VALUES.has(answer)).toBe(true);
    }
  });
});

const GREENERY_VALUES = new Set<number>(Object.values(SETTLEMENT_GREENERY));

/* -------------------------------------------------------------------------- */
/* 1c — the dial, through a whole compile                                      */
/* -------------------------------------------------------------------------- */

/** A settlement small enough to compile three times in a test. */
function dialDocument(intent?: unknown): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "greenery_dale", worldSeed: 8109 },
    ...(intent === undefined ? {} : { intent }),
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [192, 192] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 18, seaLevel: 63, baseHeight: 70}
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" }
        },
        {
          id: "quarter",
          kind: "district",
          envelope: { shape: "region", size: [96, 96] },
          constraints: [{ zone: "center" }],
          params: { fabric: "grid", density: "medium", mix: ["townhouse", "cottage"] }
        },
        {
          id: "wood",
          kind: "generator",
          generator: "scatter.forest@0",
          params: {
            area: { all: true },
            density: 0.06,
            elevation: [2, 140],
            undergrowth: { grass: 0.3, flowers: 0.02, deadwood: 0.03 },
            species: [{ id: "oak", weight: 1, shape: "oak_round" }]
          }
        }
      ]
    }
  };
}

async function decorHash(doc: Record<string, unknown>): Promise<{ hash: string; plants: number }> {
  const h = createHash("sha256");
  let plants = 0;
  const result = await compileArtifacts(doc, {});
  if (!result.ok) throw new Error(`compile failed: ${result.diagnostics.map((d) => d.code).join(", ")}`);
  for (const d of result.artifacts.decor) {
    h.update(`${d.x},${d.y},${d.z}=${d.stateId}\n`);
    plants++;
  }
  return { hash: h.digest("hex"), plants };
}

describe("the settlement-greenery dial, compiled", () => {
  let none: { hash: string; plants: number };
  let modern: { hash: string; plants: number };
  let medieval: { hash: string; plants: number };

  beforeAll(async () => {
    installFanOutRows();
    none = await decorHash(dialDocument());
    modern = await decorHash(dialDocument({ era: "modern" }));
    medieval = await decorHash(dialDocument({ era: "medieval" }));
  }, 600_000);

  it("reaches: a declared era changes what grows in the town", () => {
    // Sensitivity first — a reach law asserted by a harness that cannot see a
    // difference is not a law.
    expect(modern.hash).not.toBe(none.hash);
    expect(medieval.hash).not.toBe(none.hash);
    expect(modern.plants).toBeLessThan(none.plants);
    expect(medieval.plants).toBeGreaterThan(none.plants);
  });

  it("stays weak: the dial moves plants, and only by its own share", () => {
    // Three quarters against a quarter is a factor of three on the interior and
    // the ramp beside it, and *nothing* elsewhere — so the whole-world plant
    // count moves by far less than that. If this ever fails high, the dial has
    // reached past the settlement.
    expect(medieval.plants / modern.plants).toBeLessThan(1.5);
  });
});

/* -------------------------------------------------------------------------- */
/* 2 — the compiled fixture, read back off disk                                */
/* -------------------------------------------------------------------------- */

/** Blocks the undergrowth pass may place on the green. */
const SMALL_PLANT =
  /^(?:minecraft:)?(short_grass|tall_grass|fern|large_fern|dead_bush|poppy|dandelion|cornflower|oxeye_daisy|azure_bluet|moss_carpet|brown_mushroom|red_mushroom|sweet_berry_bush)$/;

/**
 * Ground a plant may legitimately stand on.
 *
 * Deliberately a whitelist of *natural* surfaces: the assertion this list backs
 * is that no plant grew on something a pass paved, and a blacklist of paving
 * materials would pass anything the fabric learns to build with next.
 */
const NATURAL_GROUND =
  /^(?:minecraft:)?(grass_block|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|gravel|sand|red_sand|snow_block|moss_block|mud|clay|farmland)$/;

interface Scan {
  /** Small plants inside the rect, by ground block below them. */
  readonly plants: number;
  readonly onNatural: number;
  readonly offenders: readonly string[];
  /** `x,y,z=name` of every small plant, for the determinism comparison. */
  readonly digest: string[];
}

async function scanPlants(
  worldDir: string,
  stack: PrismarineStack,
  rect: { x0: number; z0: number; x1: number; z1: number },
): Promise<Scan> {
  const regionDir = path.join(worldDir, "region");
  const positions = await listChunks(regionDir);
  const anvil = stack.openAnvil(regionDir);
  const chunks = new Map<string, EmitChunk>();
  try {
    for (const { chunkX, chunkZ } of positions) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk !== null) chunks.set(`${chunkX},${chunkZ}`, chunk);
    }
  } finally {
    await anvil.close();
  }
  const names = new Map<number, string>();
  const nameOf = (id: number): string => {
    let n = names.get(id);
    if (n === undefined) {
      n = stack.blockNameByStateId(id) ?? "air";
      names.set(id, n);
    }
    return n;
  };
  const stateAt = (x: number, y: number, z: number): number => {
    const chunk = chunks.get(`${x >> 4},${z >> 4}`);
    if (chunk === undefined) return 0;
    return chunk.getBlockStateId(x - (x >> 4) * 16, y, z - (z >> 4) * 16);
  };

  let plants = 0;
  let onNatural = 0;
  const offenders: string[] = [];
  const digest: string[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      for (let y = 60; y <= 220; y++) {
        const id = stateAt(x, y, z);
        if (id === 0) continue;
        const name = nameOf(id);
        if (!SMALL_PLANT.test(name)) continue;
        plants++;
        digest.push(`${x},${y},${z}=${name}`);
        const below = nameOf(stateAt(x, y - 1, z));
        if (NATURAL_GROUND.test(below)) onNatural++;
        // The upper half of a tall grass stands on its own lower half.
        else if (/(?:^|:)(tall_grass|large_fern)$/.test(name)) onNatural++;
        else if (offenders.length < 12) offenders.push(`${name} @ ${x},${y},${z} on ${below}`);
      }
    }
  }
  return { plants, onNatural, offenders, digest };
}

const scratch: string[] = [];
afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("the hill town's yards, compiled", () => {
  let stack: PrismarineStack;
  let scan: Scan;
  let second: Scan;
  let districtColumns: number;

  beforeAll(async () => {
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    const doc = JSON.parse(
      await readFile(
        fileURLToPath(new URL("fixtures/examples/site-plan-hillside.loam.json", import.meta.url)),
        "utf8",
      ),
    ) as unknown;
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-town-green-"));
    scratch.push(root);
    const compiled = await compileTerrain(doc, { outDir: path.join(root, "a") });
    if (!compiled.ok) throw new Error("fixture compile failed");
    const report = compiled.report as unknown as {
      layout: { districts: { bounds: { x0: number; z0: number; x1: number; z1: number } }[] };
    };
    const bounds = report.layout.districts[0]?.bounds;
    if (bounds === undefined) throw new Error("fixture produced no district");
    districtColumns = (bounds.x1 - bounds.x0 + 1) * (bounds.z1 - bounds.z0 + 1);
    scan = await scanPlants(path.join(root, "a"), stack, bounds);

    const again = await compileTerrain(JSON.parse(JSON.stringify(doc)) as unknown, {
      outDir: path.join(root, "b")
    });
    if (!again.ok) throw new Error("second compile failed");
    second = await scanPlants(path.join(root, "b"), stack, bounds);
  }, 600_000);

  it("is no longer bare: hundreds of plants stand inside the district", () => {
    // Before the green the same scan found 8 columns' worth — the eight columns
    // of natural ground the rectangle union happened not to cover.
    expect(scan.plants).toBeGreaterThan(300);
  });

  it("still reads as a town rather than a meadow", () => {
    // A tended yard, not the wood outside it: `TOWN_GREEN_DENSITY` halves the
    // ambient draw and the built ground takes its share out of the middle.
    expect(scan.plants / districtColumns).toBeLessThan(0.25);
  });

  it("grew nothing on built or paved ground", () => {
    expect(scan.offenders.join("\n")).toBe("");
    expect(scan.onNatural).toBe(scan.plants);
  });

  it("grows the same plants in the same places twice over", () => {
    expect(second.plants).toBe(scan.plants);
    expect(second.digest.join("\n")).toBe(scan.digest.join("\n"));
  });
});

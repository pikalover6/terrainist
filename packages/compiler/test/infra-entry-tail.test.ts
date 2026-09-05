/**
 * W2 + W3 — the content tail.
 *
 * Six rows: the shore battery P1 actually gains, and the cheap tail —
 * a hedgerow, a dry stone wall, a cart track, a boardwalk and an avenue of
 * plinth-figures. They are tested here rather than in `infra-entry.test.ts`
 * because that file's subject is the **host** and this one's is the **content**:
 * nothing below asks whether `ring` derives a hull or whether a gap is one
 * doorway — those are settled — and everything below asks whether a row builds
 * the thing its catalog note claims, out of the materials the design says it
 * should, without standing on air.
 *
 * The idiom is W1's, deliberately: a fixture plan, a fixture placement view,
 * one entry per `describe`, and the four questions each row has to answer —
 * *does it build*, *what is it made of*, *what happens where a road crosses*,
 * and *is it the same twice*.
 *
 * The seventh and eighth rows of W3 are **not here**: `log_flume` and
 * `sluice_box` want a route form that follows a fall, and the host has none.
 * The reason is written over the W2/W3 rows in
 * `stdlib/structures/infra-entries.ts`; the test that keeps it honest is
 * `catalog.test.ts`, which will fail from the other side the moment somebody
 * flips either row to `implemented` without a registry row behind it.
 */

import { describe, expect, it } from "vitest";

import {
  ALL_MATERIAL_THEMES,
  INFRA_ENTRIES,
  nodeSeed,
  type InfraEntryDef,
  type MaterialTheme,
  type Region
} from "@terrainist/stdlib";

import { driverForPlan } from "../src/layout/ground-driver.js";
import { infraEntryJobsOf } from "../src/structures/index.js";
import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { index } from "../src/structures/sweep.js";
import { extentOfRects } from "../src/structures/walls.js";
import {
  buildInfraEntries,
  type InfraEntryJob,
  type InfraEntryPassResult,
  type InfraPlacementView,
  type InfraRouteSpec
} from "../src/structures/infra-entry.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const SEED = nodeSeed(0x2b17n, "world.fabric");
const REGION: Region = { x0: -64, z0: -64, width: 128, depth: 128 };
const BOUNDS = { x0: REGION.x0, z0: REGION.z0, width: REGION.width, depth: REGION.depth };
const GROUND = 96;

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** A flat field. `slope` tilts it east, so a graded run has something to do. */
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
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0, caveAir: 0 }
  } as unknown as ColumnPlan;
}

/** A holding: the fields a boundary is derived round. */
const HOLDING = extentOfRects([{ x0: -24, z0: -24, x1: 24, z1: 24 }]);

/** A road running north–south at x = 0, five columns wide. */
function roadMask(): Uint8Array {
  const mask = new Uint8Array(REGION.width * REGION.depth);
  for (let z = REGION.z0; z < REGION.z0 + REGION.depth; z++) {
    for (let x = -2; x <= 2; x++) mask[index(REGION, x, z)] = 1;
  }
  return mask;
}

/** A corridor running east–west at z = 0 — it crosses the road at the origin. */
function crossLine(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let x = -50; x <= 50; x++) out.push({ x, z: 0 });
  return out;
}

/** A shoreline: the same corridor, named as the thing a battery lines. */
const SHORE = crossLine();

function view(
  plan: ColumnPlan,
  options: { road?: Uint8Array; corridor?: readonly { x: number; z: number }[] } = {},
): InfraPlacementView {
  const road = options.road;
  const inBounds = (x: number, z: number): boolean =>
    x >= BOUNDS.x0 && z >= BOUNDS.z0 && x < BOUNDS.x0 + BOUNDS.width && z < BOUNDS.z0 + BOUNDS.depth;
  return {
    bounds: BOUNDS,
    extentOf: (id) => (id === "holding" ? HOLDING : undefined),
    corridorOf: (id) => (id === "way" ? (options.corridor ?? crossLine()) : undefined),
    maskOf: () => undefined,
    ground: (x, z) => (inBounds(x, z) ? (plan.ground[index(REGION, x, z)] as number) : undefined),
    onRoad: (x, z) => road !== undefined && inBounds(x, z) && road[index(REGION, x, z)] === 1
  };
}

function entryDef(id: string): InfraEntryDef {
  return INFRA_ENTRIES[id] as InfraEntryDef;
}

function job(def: InfraEntryDef, route: InfraRouteSpec, theme?: MaterialTheme): InfraEntryJob {
  return {
    nodePath: "world.fabric",
    def,
    route,
    params: {},
    seed: SEED,
    gates: true,
    ...(theme === undefined ? {} : { theme })
  };
}

/** Build one entry on a flat fixture and hand back everything it produced. */
function build(
  id: string,
  route: InfraRouteSpec,
  options: {
    theme?: MaterialTheme;
    road?: Uint8Array;
    slope?: number;
    ground?: boolean;
    corridor?: readonly { x: number; z: number }[];
  } = {},
): { result: InfraEntryPassResult; plan: ColumnPlan } {
  const plan = flatPlan(options.slope ?? 0);
  const result = buildInfraEntries({
    plan,
    stack,
    jobs: [job(entryDef(id), route, options.theme)],
    view: view(plan, {
      ...(options.road === undefined ? {} : { road: options.road }),
      ...(options.corridor === undefined ? {} : { corridor: options.corridor })
    }),
    ...(options.ground === true ? { ground: driverForPlan(plan) } : {})
  });
  return { result, plan };
}

/** Every distinct block name a run wrote. */
function names(result: InfraEntryPassResult): Set<string> {
  return new Set(result.blocks.map((b) => stack.blockNameByStateId(b.stateId) ?? "?"));
}

/** The one theme every fixture below uses when it wants a *named* palette. */
const BIRCH_THEME = ALL_MATERIAL_THEMES.find((t) => t.id === "birchwood_downs") as MaterialTheme;

/* -------------------------------------------------------------------------- */
/* the whole tail, held to the rules that apply to all of it                   */
/* -------------------------------------------------------------------------- */

/** The six rows W2 and W3 landed. */
const TAIL = [
  "cannon_battery",
  "hedgerow",
  "dry_stone_wall",
  "cart_track",
  "boardwalk",
  "sphinx_avenue"
] as const;

describe("the W2/W3 tail — what every row of it must be true of", () => {
  it("is in the registry, declares sweep.run, and opens for a carriageway", () => {
    for (const id of TAIL) {
      const def = entryDef(id);
      expect(def, id).toBeDefined();
      // §3.5's line, defended per row: no pre-freeze entry declares tier A, and
      // a row that named `structure.linework` would be refused by the driver
      // rather than built.
      expect(def.sourceClass, id).toBe("sweep.run");
      // Peacetime fabric yields to a street. Every one of these six.
      expect(def.crossings, id).toBe("open");
      expect(def.minRun, id).toBeGreaterThanOrEqual(12);
      expect(def.internal, id).toBeUndefined();
    }
  });

  it("writes no lantern, no chain, no banner and no sign", () => {
    // `props-response.ts` rules 4 and 5, and the lint's name rule: a lit block
    // is glowstone against solid, wire is `iron_bars` because `chain` is not in
    // the pinned table, and a banner or a sign is a block entity this op stream
    // cannot carry.
    for (const [id, route] of ROUTES) {
      const written = [...names(build(id, route, { theme: BIRCH_THEME }).result)];
      expect(written.length, id).toBeGreaterThan(0);
      for (const n of written) {
        expect(n.endsWith("_lantern"), `${id}: ${n}`).toBe(false);
        expect(n === "chain", `${id}: ${n}`).toBe(false);
        expect(n.endsWith("_banner") || n.endsWith("_sign"), `${id}: ${n}`).toBe(false);
      }
    }
  });

  it("is the same twice — the determinism claim, per row", () => {
    for (const [id, route] of ROUTES) {
      const once = build(id, route, { theme: BIRCH_THEME, slope: 0.15 }).result.blocks;
      const twice = build(id, route, { theme: BIRCH_THEME, slope: 0.15 }).result.blocks;
      expect(JSON.stringify(once), id).toBe(JSON.stringify(twice));
    }
  });

  it("stands every block on something — nothing hangs over the fixture's air", () => {
    // The fixture is flat, so the rule is exact: the lowest block of any column
    // this pass writes is at the stand height or below it (a declaring row
    // repaints the ground's own top course), never above it with a gap under.
    for (const [id, route] of ROUTES) {
      const { result } = build(id, route, { theme: BIRCH_THEME });
      const lowest = new Map<string, number>();
      for (const b of result.blocks) {
        const key = `${b.x},${b.z}`;
        lowest.set(key, Math.min(lowest.get(key) ?? Infinity, b.y));
      }
      for (const [key, y] of lowest) expect(y, `${id} @ ${key}`).toBeLessThanOrEqual(GROUND + 1);
    }
  });

  it("adds no job to a document that declares no entry — byte identity, still", () => {
    // The structural half of the claim, re-asserted because this wave added six
    // rows to the registry the walk consults: a document with no
    // `infra.entry@0` node still produces no jobs, so the caller never
    // constructs the pass and nothing here can reach a world.
    const document = {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "tail_identity", worldSeed: 11 },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [128, 128] },
        children: [
          {
            id: "quarter",
            kind: "district",
            envelope: { shape: "region", size: [64, 64] },
            params: { fabric: "grid", density: "medium", mix: ["cottage"] }
          }
        ]
      }
    } as unknown as Parameters<typeof infraEntryJobsOf>[0];
    expect(infraEntryJobsOf(document, "world", 11n)).toEqual([]);
  });
});

/** One buildable route per row, for the rules that hold across the tail. */
const ROUTES: readonly (readonly [string, InfraRouteSpec])[] = [
  ["cannon_battery", { form: "along", target: "way", offset: 3 }],
  ["hedgerow", { form: "ring", target: "holding", margin: 8 }],
  ["dry_stone_wall", { form: "ring", target: "holding", margin: 8 }],
  ["cart_track", { form: "along", target: "way", offset: 6 }],
  ["boardwalk", { form: "along", target: "way", offset: 4 }],
  ["sphinx_avenue", { form: "along", target: "way", offset: 0 }]
];

/* -------------------------------------------------------------------------- */
/* W2 — the shore battery                                                      */
/* -------------------------------------------------------------------------- */

describe("cannon_battery — the parapet, the bays, the guns (W2)", () => {
  const route: InfraRouteSpec = { form: "along", target: "way", offset: 3 };

  it("builds a platform with a parapet on one hand only — a battery faces the sea", () => {
    const { result } = build("cannon_battery", route, { theme: BIRCH_THEME });
    const built = result.entries[0] as { columns: number; fittings: number };
    expect(built.columns).toBeGreaterThan(60);
    // The corridor runs east–west at z = 0 and the run is offset to z = 3, so
    // the profile's hands are north and south of it. Asymmetric means the
    // parapet's own courses stand on exactly one of them: the run's blocks
    // reach further to one side than the other.
    const zs = result.blocks.map((b) => b.z);
    const line = 3;
    const out = Math.max(...zs) - line;
    const back = line - Math.min(...zs);
    expect(out).not.toBe(back);
  });

  it("seats a gun on its truck at every bay, and the powder behind them", () => {
    const { result } = build("cannon_battery", route, { theme: BIRCH_THEME });
    const written = names(result);
    // The `martello_tower` gun, stood on its truck: the pack's dark cube on a
    // wooden bed. Both, or it is a block on the beach.
    expect(written.has("polished_blackstone")).toBe(true);
    expect(written.has("dark_oak_trapdoor")).toBe(true);
    // The powder, well back from the guns.
    expect(written.has("barrel")).toBe(true);
    const guns = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "polished_blackstone",
    );
    const powder = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "barrel",
    );
    expect(guns.length).toBeGreaterThan(2);
    // Opposite hands of the line: the guns forward of it, the powder behind.
    expect(Math.min(...guns.map((b) => b.z))).toBeGreaterThan(Math.max(...powder.map((b) => b.z)));
    // Every gun stands on its own truck rather than over a gap: the barrel is
    // one course up and the bed is on the ground under it.
    const beds = new Set(
      result.blocks
        .filter((b) => (stack.blockNameByStateId(b.stateId) ?? "") === "dark_oak_trapdoor")
        .map((b) => `${b.x},${b.z}`),
    );
    for (const g of guns) expect(beds.has(`${g.x},${g.z}`), `${g.x},${g.z}`).toBe(true);
  });

  it("takes the theme's masonry, and cobble when there is no theme", () => {
    expect(names(build("cannon_battery", route, { theme: BIRCH_THEME }).result)).toContain(
      "stone_bricks",
    );
    expect(names(build("cannon_battery", route).result)).toContain("cobblestone");
  });

  it("lets the road through — a battery's powder arrives by cart", () => {
    const road = roadMask();
    const { result } = build("cannon_battery", route, { theme: BIRCH_THEME, road });
    const built = result.entries[0] as { openings: number };
    // The run crosses the north–south road once, so one crossing is found…
    expect(built.openings).toBe(1);
    // …and nothing of the battery is written in the carriageway.
    for (const b of result.blocks) expect(Math.abs(b.x)).toBeGreaterThan(2);
  });
});

/* -------------------------------------------------------------------------- */
/* W3 — the agrarian three                                                     */
/* -------------------------------------------------------------------------- */

describe("hedgerow — leaves over a log heart, with a gap at the gate (W3)", () => {
  const route: InfraRouteSpec = { form: "ring", target: "holding", margin: 8 };

  it("stands three courses of hedge on the grade it is planted in", () => {
    const { result } = build("hedgerow", route, { theme: BIRCH_THEME });
    const written = names(result);
    // The theme's own timber, because a hedge is planted by the people who
    // built the houses: `birchwood_downs` leads with birch.
    expect(written.has("birch_log")).toBe(true);
    expect(written.has("birch_leaves")).toBe(true);
    expect(written.has("coarse_dirt")).toBe(true);
    // The heart's own column: log on the ground, two courses of leaf over it,
    // and nothing above that.
    const logs = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "birch_log",
    );
    expect(logs.length).toBeGreaterThan(50);
    for (const l of logs) expect(l.y).toBe(GROUND + 1);
    const tops = result.blocks.map((b) => b.y);
    expect(Math.max(...tops)).toBe(GROUND + 3);
  });

  it("falls back to oak where the palette has no tree in it", () => {
    // A `WoodSet` is a shape, not a claim about trees — the modern palette's
    // `log` role is concrete — so a hedge takes the theme's first *leafy* wood
    // and oak when there is none.
    const modern = ALL_MATERIAL_THEMES.find((t) => t.id === "modern_city") as MaterialTheme;
    const written = names(build("hedgerow", route, { theme: modern }).result);
    expect(written.has("oak_log")).toBe(true);
    expect(written.has("oak_leaves")).toBe(true);
  });

  it("stands its flowers on their own ground rather than on somebody's soil", () => {
    const { result } = build("hedgerow", route, { theme: BIRCH_THEME });
    const written = names(result);
    expect(written.has("moss_block")).toBe(true);
    expect(written.has("oxeye_daisy") || written.has("poppy")).toBe(true);
    // Every flower has a moss block directly under it — the two-block fitting
    // is what makes a flower legal on a column whose top course is not soil.
    const moss = new Set(
      result.blocks
        .filter((b) => (stack.blockNameByStateId(b.stateId) ?? "") === "moss_block")
        .map((b) => `${b.x},${b.y},${b.z}`),
    );
    for (const b of result.blocks) {
      const n = stack.blockNameByStateId(b.stateId) ?? "";
      if (n !== "oxeye_daisy" && n !== "poppy") continue;
      expect(moss.has(`${b.x},${b.y - 1},${b.z}`), `${b.x},${b.z}`).toBe(true);
    }
  });

  it("stops either side of a carriageway — the field gate, found", () => {
    const road = roadMask();
    const { result } = build("hedgerow", route, { theme: BIRCH_THEME, road });
    const built = result.entries[0] as { openings: number };
    // The ring crosses the north–south road twice: two gates, neither authored.
    expect(built.openings).toBe(2);
    for (const b of result.blocks) expect(Math.abs(b.x)).toBeGreaterThan(2);
  });
});

describe("dry_stone_wall — one course wide, coped, with a stile (W3)", () => {
  const route: InfraRouteSpec = { form: "ring", target: "holding", margin: 8 };

  it("builds a body and a coping course of the theme's accent stone", () => {
    const { result } = build("dry_stone_wall", route, { theme: BIRCH_THEME });
    const written = names(result);
    // `birchwood_downs` leads with stone brick, whose accent is cobble: body
    // and coping are different stones, which is the whole read of a coped wall.
    expect(written.has("stone_bricks")).toBe(true);
    expect(written.has("cobblestone")).toBe(true);
    const body = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "stone_bricks",
    );
    const cope = result.blocks.filter(
      (b) =>
        (stack.blockNameByStateId(b.stateId) ?? "") === "cobblestone" && b.y === GROUND + 2,
    );
    expect(body.length).toBeGreaterThan(50);
    expect(cope.length).toBeGreaterThan(50);
    // Two courses, and no third: a field wall, not a rampart.
    expect(Math.max(...result.blocks.map((b) => b.y))).toBe(GROUND + 2);
  });

  it("puts a stile on both hands at once, so the wall can be got over", () => {
    const { result } = build("dry_stone_wall", route, { theme: BIRCH_THEME });
    const built = result.entries[0] as { fittings: number };
    // A stile is a *pair*: one step up on the field side and one down on the
    // lane side, at the same pitch and phase.
    expect(built.fittings).toBeGreaterThan(1);
    expect(built.fittings % 2).toBe(0);
  });

  it("opens for the road and writes nothing in it", () => {
    const road = roadMask();
    const { result } = build("dry_stone_wall", route, { theme: BIRCH_THEME, road });
    expect((result.entries[0] as { openings: number }).openings).toBe(2);
    for (const b of result.blocks) expect(Math.abs(b.x)).toBeGreaterThan(2);
  });
});

describe("cart_track — two ruts worn into the field (W3)", () => {
  const route: InfraRouteSpec = { form: "along", target: "way", offset: 6 };

  it("wears its ruts into the ground rather than laying them on it", () => {
    const { result, plan } = build("cart_track", route, { theme: BIRCH_THEME, ground: true });
    const built = result.entries[0] as { declared: number; columns: number };
    // Declared through the ground contract at `sweep.run`, then painted on the
    // answer: the top course of the column, never a course above it.
    expect(built.declared).toBeGreaterThan(60);
    expect(built.columns).toBeGreaterThan(60);
    for (const b of result.blocks) {
      expect(b.y).toBeLessThanOrEqual(plan.ground[index(REGION, b.x, b.z)] as number);
    }
  });

  it("is two ruts of path with a baulk between them, three columns and no more", () => {
    const { result } = build("cart_track", route, { theme: BIRCH_THEME, ground: true });
    const written = names(result);
    expect(written.has("dirt_path")).toBe(true);
    expect(written.has("grass_block")).toBe(true);
    // No kerb, no verge, no furniture: two materials, and that is the entry.
    expect([...written].sort()).toEqual(["dirt_path", "grass_block"]);
    // The run is offset to z = 6 and the section is one column either side of
    // it, so the track is exactly three columns wide.
    const zs = new Set(result.blocks.map((b) => b.z));
    expect([...zs].sort((a, b) => a - b)).toEqual([5, 6, 7]);
    const ruts = new Set(
      result.blocks
        .filter((b) => (stack.blockNameByStateId(b.stateId) ?? "") === "dirt_path")
        .map((b) => b.z),
    );
    expect([...ruts].sort((a, b) => a - b)).toEqual([5, 7]);
  });

  it("puts coarse dirt between the ruts in a dry country", () => {
    // The theme's one statement about the land it stands in: a green baulk in a
    // sun-baked valley is the mistake `aridAmbient` exists to fix.
    const arid = ALL_MATERIAL_THEMES.find((t) => t.aridAmbient === true);
    if (arid === undefined) return;
    const written = names(build("cart_track", route, { theme: arid, ground: true }).result);
    expect(written.has("coarse_dirt")).toBe(true);
    expect(written.has("grass_block")).toBe(false);
  });

  it("leaves the carriageway its own surface where a road crosses", () => {
    const road = roadMask();
    const { result } = build("cart_track", route, { theme: BIRCH_THEME, road, ground: true });
    expect((result.entries[0] as { openings: number }).openings).toBe(1);
    for (const b of result.blocks) expect(Math.abs(b.x)).toBeGreaterThan(2);
  });
});

/* -------------------------------------------------------------------------- */
/* W3 — the frontier and the Nile                                              */
/* -------------------------------------------------------------------------- */

describe("boardwalk — planks on posts, one course proud (W3)", () => {
  const route: InfraRouteSpec = { form: "along", target: "way", offset: 4 };

  it("stands its deck exactly one course over the grade, on its own posts", () => {
    const { result } = build("boardwalk", route, { theme: BIRCH_THEME });
    const deck = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "birch_planks",
    );
    const posts = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "birch_log",
    );
    expect(deck.length).toBeGreaterThan(60);
    expect(posts.length).toBeGreaterThan(60);
    // A walker's feet are at GROUND + 1 on the field; the deck is at + 2, and
    // the post course fills the gap under it so there is nothing to fall into.
    for (const b of deck) expect(b.y).toBe(GROUND + 2);
    for (const b of posts) expect(b.y).toBe(GROUND + 1);
    const under = new Set(posts.map((b) => `${b.x},${b.z}`));
    for (const b of deck) expect(under.has(`${b.x},${b.z}`), `${b.x},${b.z}`).toBe(true);
  });

  it("is three columns wide — a frontage's walk, not a road", () => {
    const { result } = build("boardwalk", route, { theme: BIRCH_THEME });
    const zs = new Set(result.blocks.map((b) => b.z));
    expect([...zs].sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });

  it("steps aside at the cross-street", () => {
    const road = roadMask();
    const { result } = build("boardwalk", route, { theme: BIRCH_THEME, road });
    expect((result.entries[0] as { openings: number }).openings).toBe(1);
    for (const b of result.blocks) expect(Math.abs(b.x)).toBeGreaterThan(2);
  });
});

describe("sphinx_avenue — a rank at a fixed bay, both sides (W3)", () => {
  const route: InfraRouteSpec = { form: "along", target: "way", offset: 0 };

  it("paves a way five columns wide with a kerb on each hand", () => {
    const { result } = build("sphinx_avenue", route, { theme: BIRCH_THEME });
    const written = names(result);
    // Fixed sandstone, not the theme's stone: an avenue of cobblestone figures
    // is not an avenue of sphinxes.
    expect(written.has("smooth_sandstone")).toBe(true);
    expect(written.has("cut_sandstone")).toBe(true);
    expect(written.has("chiseled_sandstone")).toBe(true);
    expect(written.has("stone_bricks")).toBe(false);
    const paving = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "smooth_sandstone",
    );
    const zs = new Set(paving.map((b) => b.z));
    expect([...zs].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });

  it("stands the figures in pairs, one each hand, at the same bay", () => {
    const { result } = build("sphinx_avenue", route, { theme: BIRCH_THEME });
    const plinths = result.blocks.filter(
      (b) => (stack.blockNameByStateId(b.stateId) ?? "") === "cut_sandstone" && b.y === GROUND + 1,
    );
    const east = plinths.filter((b) => b.z > 0).map((b) => b.x);
    const west = plinths.filter((b) => b.z < 0).map((b) => b.x);
    expect(east.length).toBeGreaterThan(2);
    // A pair is a pair: the same count on each hand, at the same arc positions.
    expect(east.length).toBe(west.length);
    expect([...east].sort((a, b) => a - b)).toEqual([...west].sort((a, b) => a - b));
    // Each figure is a plinth and two courses of mass on top of it — grounded,
    // and three courses tall.
    const tops = result.blocks
      .filter((b) => (stack.blockNameByStateId(b.stateId) ?? "") === "chiseled_sandstone")
      .map((b) => b.y);
    expect(new Set(tops)).toEqual(new Set([GROUND + 2, GROUND + 3]));
  });

  it("carries the processional way through a crossing without paving it", () => {
    const road = roadMask();
    const { result } = build("sphinx_avenue", route, { theme: BIRCH_THEME, road });
    expect((result.entries[0] as { openings: number }).openings).toBe(1);
    for (const b of result.blocks) expect(Math.abs(b.x)).toBeGreaterThan(2);
  });
});

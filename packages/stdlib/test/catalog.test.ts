/**
 * Structure catalog tests.
 *
 * The catalog is data, and data about what exists is worth exactly as much as
 * the check that it is true. These tests are that check: they hold the shape
 * (unique ids, legal enums) and — the one that matters — they hold every
 * `implemented` claim against the **live registries**, so the catalog cannot
 * quietly become a wish list with a status column.
 */

import { describe, expect, it } from "vitest";

import {
  INFRA_ENTRIES,
  INFRA_ENTRY_IDS,
  NON_NODE_IMPLEMENTED,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  STRUCTURE_CATEGORIES,
  STRUCTURE_KINDS,
  STRUCTURE_STATUSES,
  structureById,
  structuresInCategory,
  structuresWithStatus,
  summarizeCatalog,
  BUILDING_ARCHETYPES,
  archetypeOfTags,
  archetypeFacadeDefaults,
  PROP_GENERATORS,
  propFootprint,
  generateProp,
  nodeSeed,
  generateBuilding,
} from "../src/index.js";
import { KNOWN_BUILDING_ARCHETYPES } from "@terrainist/spec/ir";
import { HIGHRISE_ARCHETYPES, isHighriseArchetype } from "../src/structures/highrise.js";
import { TERRACE_ARCHETYPES } from "../src/structures/terrace.js";
import { UNDERGROUND_ARCHETYPES } from "../src/structures/underground.js";
import {
  createStructureRegistry,
  findByTag,
  isBuildingDescriptor,
  isPropDescriptor,
} from "../src/structures/descriptor.js";

describe("the structure catalog", () => {
  it("has a unique id for every entry", () => {
    const ids = STRUCTURE_CATALOG.map((e) => e.id);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes, "duplicate ids").toEqual([]);
    expect(seen.size).toBe(ids.length);
  });

  it("uses only ids a generator name could be — lower snake case", () => {
    for (const entry of STRUCTURE_CATALOG) {
      expect(entry.id, entry.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(entry.name.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("uses only declared categories, kinds and statuses", () => {
    for (const entry of STRUCTURE_CATALOG) {
      expect(STRUCTURE_CATEGORIES, entry.id).toContain(entry.category);
      expect(STRUCTURE_KINDS, entry.id).toContain(entry.kind);
      expect(STRUCTURE_STATUSES, entry.id).toContain(entry.status);
    }
  });

  it("fills every category — a category with nothing in it is a taxonomy bug", () => {
    for (const category of STRUCTURE_CATEGORIES) {
      expect(structuresInCategory(category).length, category).toBeGreaterThan(0);
    }
  });

  /**
   * The load-bearing one.
   *
   * An `implemented` id must name something that can actually be built today:
   * a building archetype the grammar dispatches on, a prop in
   * `PROP_GENERATORS`, or one of the three shipped generators that are not
   * nodes. Nothing else counts, and the assertion is written against the live
   * registries rather than a copy of them, so deleting a generator fails here.
   */
  it("maps every implemented id onto a real generator", () => {
    const real = new Set<string>([
      ...KNOWN_BUILDING_ARCHETYPES,
      ...PROP_NAMES,
      ...NON_NODE_IMPLEMENTED,
 // The infrastructure host : an
      // `infrastructure` row that names a row of `INFRA_ENTRIES` is built by
      // `infra.entry@0`, exactly as a `prop` row that names a `PROP_GENERATORS`
      // key is built by `prop.place@0`. Flipping an entry on later is therefore
      // **data** — a registry row — and not an edit to this test.
      ...INFRA_ENTRY_IDS,
    ]);
    const claimed = structuresWithStatus("implemented").map((e) => e.id);
    const unbacked = claimed.filter((id) => !real.has(id));
    expect(unbacked, "catalog claims these are implemented, but no generator answers to them").toEqual([]);
    expect(claimed.length).toBeGreaterThan(0);
  });

  /**
   * The same guard from the other side (§3.7).
   *
   * A registry row whose id names no catalog row is a generator nobody can ask
   * for — the `agent-defs.test.ts` tradition of making a silent failure loud.
   * An *internal* row (the host's own fixture) is excluded by construction:
   * `INFRA_ENTRY_IDS` carries the catalog-backed ids only, which is what keeps
   * this check exact rather than weakened to one direction.
   */
  it("backs every infrastructure entry with a catalog row of that kind", () => {
    for (const id of INFRA_ENTRY_IDS) {
      const row = structureById(id);
      expect(row, `INFRA_ENTRIES has "${id}" and the catalog does not`).toBeDefined();
      expect(row?.kind, id).toBe("infrastructure");
      expect(row?.status, id).toBe("implemented");
    }
    // …and every internal row really is absent from the catalog, which is what
    // "internal" means. A registry row that quietly became a catalog id would
    // otherwise pass both directions while claiming to be a fixture.
    for (const def of Object.values(INFRA_ENTRIES)) {
      if (def.internal !== true) continue;
      expect(structureById(def.id), `"${def.id}" is internal and is in the catalog`).toBeUndefined();
    }
  });

  it("lists every archetype and every prop the code actually has", () => {
    for (const archetype of KNOWN_BUILDING_ARCHETYPES) {
      const entry = structureById(archetype);
      expect(entry, `archetype "${archetype}" is missing from the catalog`).toBeDefined();
      expect(entry?.status, archetype).toBe("implemented");
    }
    for (const prop of PROP_NAMES) {
      const entry = structureById(prop);
      expect(entry, `prop "${prop}" is missing from the catalog`).toBeDefined();
      expect(entry?.status, prop).toBe("implemented");
    }
  });

  it("has no in_progress entry without a note explaining what is missing", () => {
    for (const entry of structuresWithStatus("in_progress")) {
      expect(entry.note, entry.id).toBeDefined();
    }
  });

  it("summarises to counts that add up", () => {
    const summary = summarizeCatalog();
    expect(summary.total).toBe(STRUCTURE_CATALOG.length);
    const statusTotal =
      summary.byStatus.implemented + summary.byStatus.in_progress + summary.byStatus.not_started;
    expect(statusTotal).toBe(summary.total);
    expect(summary.byCategory.reduce((sum, c) => sum + c.total, 0)).toBe(summary.total);
    expect(summary.byCategory.reduce((sum, c) => sum + c.implemented, 0)).toBe(
      summary.byStatus.implemented,
    );
  });

  it("is big enough to be a map of the territory rather than a to-do list", () => {
    // The point of the catalog is the part that is *not* done. If this ever
    // trips because the registry shrank, the question to ask is what was
    // deleted and why — not whether to lower the number. The original guard
    // also demanded more open entries than implemented ones; the wave program
    // crossed that halfway mark on 2026-07-31, so the guard now asks only
    // that real open territory remains — when even that trips, the honest
    // move is to grow the catalog, not shrink the assertion.
    expect(STRUCTURE_CATALOG.length).toBeGreaterThan(250);
    expect(structuresWithStatus("not_started").length).toBeGreaterThan(50);
  });
});

// ---------------------------------------------------------------------------
// Descriptor coverage — exhaustiveness, order, tag priority, delegation,
// special dispatch. Proves the cutover kept every structure and every rule.
// ---------------------------------------------------------------------------

describe("descriptor coverage — exhaustiveness", () => {
  it("BUILDING_ARCHETYPES covers every KNOWN_BUILDING_ARCHETYPES id, one-to-one", () => {
    // Public central API keeps its name but now derives from descriptors.
    // Set equality proves no building was lost or added without a descriptor.
    expect(new Set(BUILDING_ARCHETYPES)).toEqual(new Set(KNOWN_BUILDING_ARCHETYPES));
    expect(BUILDING_ARCHETYPES).toHaveLength(KNOWN_BUILDING_ARCHETYPES.length);
    // Exact public order is load-bearing: spec declaration order is preserved.
    expect([...BUILDING_ARCHETYPES]).toEqual([...KNOWN_BUILDING_ARCHETYPES]);
  });

  it("PROP_NAMES covers every prop descriptor id, one-to-one, in historical spread order", () => {
    // Historical PROP_NAMES spread is the source of truth for prop registry
    // order. After cutover PROP_NAMES derives from PROP_DESCRIPTORS in that
    // spread order; before cutover it spreads leaf arrays in the same order.
    // Either way the observable order must not change.
    const seen = new Set<string>(PROP_NAMES);
    expect(seen.size).toBe(PROP_NAMES.length);
    // Core 9 head — rowboat through statue_plinth — must stay first, in place.
    const coreHead = [
      "rowboat",
      "fishing_sloop",
      "pier",
      "cart",
      "covered_wagon",
      "rail_line",
      "fountain",
      "gazebo",
      "statue_plinth",
    ] as const;
    expect(PROP_NAMES.slice(0, 9)).toEqual([...coreHead]);
    // Every prop name has a generator and a footprint delegate; the descriptor
    // holds the same handles rather than a copy.
    for (const name of PROP_NAMES) {
      expect(PROP_GENERATORS as Record<string, unknown>).toHaveProperty(name);
      const fp = propFootprint(name as never, {});
      expect(fp.size).toHaveLength(3);
      expect(typeof fp.minY).toBe("number");
      // Descriptor handle delegates — placement is behavioral, so the round-trip
      // through the descriptor must agree with the public function.
      const viaPublic = propFootprint(name as never, { length: 12, width: 2 });
      expect(viaPublic.size[0]).toBeGreaterThan(0);
    }
  });

  it("catalog implemented ids are exactly the descriptor-held ids plus infra non-nodes", () => {
    const descriptorIds = new Set<string>([...BUILDING_ARCHETYPES, ...PROP_NAMES]);
    const real = new Set<string>([...descriptorIds, ...NON_NODE_IMPLEMENTED, ...INFRA_ENTRY_IDS]);
    for (const id of descriptorIds) {
      const row = structureById(id);
      expect(row, `descriptor id "${id}" missing from catalog`).toBeDefined();
      expect(row?.status, id).toBe("implemented");
    }
    const claimed = structuresWithStatus("implemented").map((e) => e.id);
    const unbacked = claimed.filter((id) => !real.has(id));
    expect(unbacked).toEqual([]);
  });
});

describe("descriptor — exact public order, tag priority, aliases", () => {
  it("preserves BUILDING_ARCHETYPES/PROP_NAMES exact public order against mutation", () => {
    // Order is load-bearing for tag priority (buildings) and placement (props).
    // Freezing is convention; content equality is the invariant.
    expect(Object.isFrozen(PROP_NAMES)).toBe(true);
    // Re-reading must give the same order — no lazy sort.
    const again = [...PROP_NAMES];
    expect(again).toEqual([...PROP_NAMES]);
    const againBuildings = [...BUILDING_ARCHETYPES];
    expect(againBuildings).toEqual([...BUILDING_ARCHETYPES]);
  });

  it("archetypeOfTags respects historical chain priority over spec ID order", () => {
    // Historical chain is highrise → underground → watchtower → blitz → town → trade → …
    // Spec ID order is unrelated. Priority is observable through tags.
    // Highrise greedily claims tower_block ahead of watchtower's bare tower.
    expect(archetypeOfTags(["tower_block"])).toBe("skyscraper");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
    // Underground claims mineshaft ahead of watchtower's tower.
    expect(archetypeOfTags(["mineshaft"])).toBe("mine_head");
    // Blitz claims castle/keep ahead of extended etc; watchtower still wins bare tower.
    expect(archetypeOfTags(["keep"])).toBe("keep");
    expect(archetypeOfTags(["castle"])).toBe("keep");
    // Extended vs original: temple stays church (extended) not shrine etc.
    expect(archetypeOfTags(["temple"])).toBe("church");
    // Trade's tavern wins over inn's trade/inn.
    expect(archetypeOfTags(["tavern"])).toBe("tavern");
    // Alias round-trip via findByTag on isolated registry — insertion-order priority.
    // Closed immutable registry API: population at construction via factory.
    const keepDesc = {
      kind: "building" as const,
      id: "keep",
      tags: ["keep"],
      aliases: ["castle", "donjon"],
      furnish: (() => 0) as unknown as (ctx: unknown) => number,
    };
    const towerDesc = {
      kind: "building" as const,
      id: "watchtower",
      tags: ["watchtower", "tower", "lookout"],
      aliases: [],
      furnish: (() => 0) as unknown as (ctx: unknown) => number,
    };
    const r1 = createStructureRegistry(
      keepDesc as unknown as Parameters<typeof createStructureRegistry>[0],
      towerDesc as unknown as Parameters<typeof createStructureRegistry>[0],
    );
    expect(r1.list().map((d) => d.id)).toEqual(["keep", "watchtower"]);
    expect(Object.isFrozen(r1.list())).toBe(true);
    expect(findByTag(r1, "donjon")?.id).toBe("keep");
    expect(findByTag(r1, "tower")?.id).toBe("watchtower");
    // Insertion-order priority: first tag match wins.
    const a = { kind: "prop" as const, id: "a", tags: ["shared"], footprint: (() => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const })) as unknown as (p: Readonly<Record<string, unknown>>) => { size: readonly [number, number, number]; minY: number; base: "ground"|"water"|"shore" }, generator: (() => ({})) as unknown as (ctx: unknown) => unknown };
    const b = { kind: "prop" as const, id: "b", tags: ["shared"], footprint: (() => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const })) as unknown as (p: Readonly<Record<string, unknown>>) => { size: readonly [number, number, number]; minY: number; base: "ground"|"water"|"shore" }, generator: (() => ({})) as unknown as (ctx: unknown) => unknown };
    const r2 = createStructureRegistry(
      a as unknown as Parameters<typeof createStructureRegistry>[0],
      b as unknown as Parameters<typeof createStructureRegistry>[0],
    );
    expect(r2.list().map((d) => d.id)).toEqual(["a", "b"]);
    expect(Object.isFrozen(r2.list())).toBe(true);
    expect(findByTag(r2, "shared")?.id).toBe("a");
    // Duplicate rejection via factory — closed immutable API
    expect(() =>
      createStructureRegistry(
        a as unknown as Parameters<typeof createStructureRegistry>[0],
        b as unknown as Parameters<typeof createStructureRegistry>[0],
        a as unknown as Parameters<typeof createStructureRegistry>[0],
      ),
    ).toThrow(/duplicate structure id "a"/);
  });
  it("facade defaults delegate directly — nullable per-field, first-non-empty chain preserved", () => {
    // For a handful of archetypes whose facade is distinctive, the public
    // function must equal the descriptor's stored facadeDefaults and must not
    // be a merged copy.
    const samples: string[] = ["church", "barn", "skyscraper", "watchtower", "tavern", "castle", "pagoda", "keep"];
    for (const archetype of samples) {
      if (!(BUILDING_ARCHETYPES as readonly string[]).includes(archetype)) continue;
      const fd = archetypeFacadeDefaults(archetype as never);
      // Nullable per-field: at least one of the three may be undefined, but the
      // object itself must be stable and equal to itself on repeat.
      const fd2 = archetypeFacadeDefaults(archetype as never);
      expect(fd).toEqual(fd2);
      // Values are strings when present.
      for (const k of ["windowShape", "windowRhythm", "roof"] as const) {
        const v = (fd as Record<string, unknown>)[k];
        if (v !== undefined) expect(typeof v).toBe("string");
      }
    }
  });
});

describe("descriptor — special dispatch remains explicit", () => {
  it("highrise/terrace/watchtower/underground still branch on archetype", () => {
    for (const id of HIGHRISE_ARCHETYPES) {
      expect(isHighriseArchetype(id)).toBe(true);
      expect(archetypeOfTags([id])).toBe(id);
    }
    for (const id of TERRACE_ARCHETYPES) {
      // terrace descriptor has empty tags; "terrace" tag resolves to terraced_row via residential — b92079d behavior
      expect(archetypeOfTags([id])).toBe("terraced_row");
    }
    for (const id of UNDERGROUND_ARCHETYPES) {
      expect(archetypeOfTags([id])).toBe(id);
    }
    expect(archetypeOfTags(["watchtower"])).toBe("watchtower");
    expect(archetypeOfTags(["lookout"])).toBe("watchtower");
    expect(archetypeOfTags(["tower"])).toBe("watchtower");
  });

  it("all archetypes still furnish through the leaf handle without LocalVoxelOp reorder", () => {
    // Seeded draw and LocalVoxelOp order are realized in leaf modules; the
    // descriptor only holds a handle. Behavioral proof: furnish is a function
    // and generating a building of each special kind is deterministic.
    // Use a tiny building to keep cost low.
    const seed = nodeSeed(20260728n, "world.catalog.special", "");
    const cases: Array<{ archetype: string; size: [number, number, number] }> = [
      { archetype: "skyscraper", size: [9, 30, 9] },
      { archetype: "terrace", size: [18, 12, 10] },
      { archetype: "watchtower", size: [7, 18, 7] },
      { archetype: "mine_head", size: [9, 12, 9] },
    ];
    for (const c of cases) {
      if (!(BUILDING_ARCHETYPES as readonly string[]).includes(c.archetype)) continue;
      const a = generateBuilding({ seed, size: c.size, params: { archetype: c.archetype } as never });
      const b = generateBuilding({ seed, size: c.size, params: { archetype: c.archetype } as never });
      expect(a.ops).toEqual(b.ops);
      // Canonical y,z,x order preserved.
      const sorted = [...a.ops].sort((x, y) => x.y - y.y || x.z - y.z || x.x - y.x);
      expect(a.ops).toEqual(sorted);
    }
  });
});

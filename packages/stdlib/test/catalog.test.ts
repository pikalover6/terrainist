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
  BUILDING_ARCHETYPES,
  INFRA_ENTRIES,
  INFRA_ENTRY_IDS,
  NON_NODE_IMPLEMENTED,
  PROP_GENERATORS,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  STRUCTURE_CATEGORIES,
  STRUCTURE_KINDS,
  STRUCTURE_STATUSES,
  structureById,
  structuresInCategory,
  structuresWithStatus,
  summarizeCatalog,
} from "../src/index.js";

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
      ...BUILDING_ARCHETYPES,
      ...PROP_NAMES,
      ...NON_NODE_IMPLEMENTED,
      // The infrastructure host (`docs/INFRA-ENTRIES-v0.md` §3.7): an
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
    for (const archetype of BUILDING_ARCHETYPES) {
      const entry = structureById(archetype);
      expect(entry, `archetype "${archetype}" is missing from the catalog`).toBeDefined();
      expect(entry?.status, archetype).toBe("implemented");
    }
    for (const prop of PROP_NAMES) {
      const entry = structureById(prop);
      expect(entry, `prop "${prop}" is missing from the catalog`).toBeDefined();
      expect(entry?.status, prop).toBe("implemented");
    }
    // …and the prop registry and the prop name list agree with each other,
    // which is what makes the loop above exhaustive rather than merely long.
    expect(Object.keys(PROP_GENERATORS).sort()).toEqual([...PROP_NAMES].sort());
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

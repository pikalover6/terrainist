/**
 * The kit-vs-registry drift ratchet (the Stocktake Run's slop census, class 2
 * seam 4 / S6; ledger F18). The settlement kit presents its archetype tables
 * as the author's whole vocabulary, and the registries are larger: measured
 * 2026-08-25, 175 of the 428 `KNOWN_BUILDING_ARCHETYPES` and 253 of the 654
 * implemented `STRUCTURE_CATALOG` entries are never named anywhere in
 * `docs/kits/settlement-author.md`, and nothing the kit names is missing from
 * a registry.
 *
 * This is a **ratchet**, not a gate: the ceilings are the measured numbers, so
 * a registry entry added without a kit line fails here, and a kit that names
 * more of the registry lowers the ceiling (update the constants when it does).
 * Presence is the census's rule — the id as a whole token anywhere in the
 * kit's text.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { KNOWN_BUILDING_ARCHETYPES } from "@terrainist/spec";
import { STRUCTURE_CATALOG } from "@terrainist/stdlib";

const KIT = readFileSync(fileURLToPath(new URL("../../../docs/kits/settlement-author.md", import.meta.url)), "utf8");
const named = (id: string): boolean => new RegExp(`(^|[^a-z0-9_])${id}([^a-z0-9_]|$)`).test(KIT);

/** Measured 2026-08-25 (census class 2 seam 4). Lower them when the kit grows. */
const UNNAMED_ARCHETYPES_CEILING = 175;
const UNNAMED_CATALOG_CEILING = 253;

describe("the settlement kit vs the compiler registries", () => {
  it("names no more of the archetype registry than it did — a new archetype needs a kit line", () => {
    const unnamed = KNOWN_BUILDING_ARCHETYPES.filter((id) => !named(id));
    expect(
      unnamed.length,
      `archetypes never named in the kit: ${unnamed.length} > ${UNNAMED_ARCHETYPES_CEILING}; new: ${unnamed.slice(-8).join(", ")}`,
    ).toBeLessThanOrEqual(UNNAMED_ARCHETYPES_CEILING);
    // The ratchet is honest in both directions: if the kit now names more,
    // the ceiling is stale and should come down.
    expect(unnamed.length).toBeGreaterThan(UNNAMED_ARCHETYPES_CEILING - 25);
  });

  it("names no more of the implemented catalog than it did", () => {
    const implemented = STRUCTURE_CATALOG.filter((e) => e.status === "implemented");
    const unnamed = implemented.filter((e) => !named(e.id));
    expect(
      unnamed.length,
      `implemented catalog entries never named in the kit: ${unnamed.length} > ${UNNAMED_CATALOG_CEILING}; new: ${unnamed.slice(-8).map((e) => e.id).join(", ")}`,
    ).toBeLessThanOrEqual(UNNAMED_CATALOG_CEILING);
    expect(unnamed.length).toBeGreaterThan(UNNAMED_CATALOG_CEILING - 25);
  });

  it("measures what the census measured", () => {
    expect(KNOWN_BUILDING_ARCHETYPES.length).toBeGreaterThanOrEqual(428);
    expect(STRUCTURE_CATALOG.filter((e) => e.status === "implemented").length).toBeGreaterThanOrEqual(654);
  });
});

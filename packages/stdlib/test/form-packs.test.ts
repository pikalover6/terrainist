/**
 * `FORM_PACKS` — the registry's own invariants.
 *
 * A form pack is a *word an author writes*, and everything about it is
 * silently-failing data: a mistyped member id never expands, a duplicated one
 * is an invisible extra weight in a positional mix, and a pack id that drifts
 * is a migration nobody performed. None of that shows up in a walked world, so
 * it is asserted here.
 */

import { describe, expect, it } from "vitest";

import { ERA_CLASSES } from "@terrainist/spec";

import {
  FORM_PACKS,
  formPackById,
  formPackIds,
  formPackMembers,
} from "../src/structures/form-packs.js";
import { structureById } from "../src/structures/catalog.js";

describe("the registry", () => {
  it("carries the nine packs of CATALOG-EXPANSION-v0 §3", () => {
    expect(formPackIds()).toEqual([
      "classical_mediterranean",
      "nautical_pirate",
      "arcane_magical",
      "alien_scifi",
      "agrarian",
      "wilds_camps",
      "frontier_west",
      "nile_egypt",
      "east_asian",
    ]);
  });

  it("has a unique, snake_case id and a thesis for every pack", () => {
    const ids = formPackIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const pack of FORM_PACKS) {
      expect(pack.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(pack.name.length).toBeGreaterThan(0);
      // A thesis is a sentence, not a label: it is what the classifier reads.
      expect(pack.thesis.length).toBeGreaterThan(40);
      expect(pack.eras.length).toBeGreaterThan(0);
      expect(pack.members.length).toBeGreaterThan(0);
    }
  });

  it("declares affinity only against real era classes", () => {
    for (const pack of FORM_PACKS) {
      for (const era of pack.eras) {
        expect(ERA_CLASSES as readonly string[]).toContain(era);
      }
    }
  });

  it("names every member exactly once, across the whole registry", () => {
    const seen = new Map<string, string>();
    for (const pack of FORM_PACKS) {
      for (const member of pack.members) {
        expect(member).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(seen.get(member)).toBeUndefined();
        seen.set(member, pack.id);
      }
    }
    expect(seen.size).toBe(144); // 145 proposed, less `sphinx`, ratified out.
  });

  it("leaves `sphinx` out of the Nile pack — ratified out 2026-08-11", () => {
    expect(formPackMembers("nile_egypt")).not.toContain("sphinx");
    expect(formPackMembers("nile_egypt")).toContain("sphinx_avenue");
  });
});

describe("lookup", () => {
  it("normalises the spelling a classifier is likely to write", () => {
    expect(formPackById("classical_mediterranean")?.id).toBe("classical_mediterranean");
    expect(formPackById("Classical Mediterranean")?.id).toBe("classical_mediterranean");
    expect(formPackById("classical-mediterranean")?.id).toBe("classical_mediterranean");
  });

  it("is not a thesaurus — a word that is not a pack finds nothing", () => {
    expect(formPackById("hellenistic")).toBeUndefined();
    expect(formPackById("")).toBeUndefined();
    expect(formPackMembers("nothing_like_a_pack")).toEqual([]);
  });
});

describe("against the catalog", () => {
  // The registry ships ahead of its content by design: every member was
  // `not_started` the day the packs landed, and this file cannot assert
  // otherwise without asserting the roadmap. What it *can* assert is that a
  // member the catalog does carry is carried under exactly the id written here
  // — the failure mode that is otherwise invisible, because a mistyped member
  // simply never expands.
  it("agrees with the catalog on every member the catalog carries", () => {
    for (const pack of FORM_PACKS) {
      for (const member of pack.members) {
        const entry = structureById(member);
        if (entry === undefined) continue;
        expect(entry.id).toBe(member);
      }
    }
  });
});

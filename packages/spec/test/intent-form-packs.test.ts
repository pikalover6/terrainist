/**
 * `character.formPacks` — the spec surface (CATALOG-EXPANSION-v0 §4.2).
 *
 * The fourth grounded list. Only its *type* is an error here: an unknown pack
 * word is grounded in the compiler as `LOAM-W516`, exactly as every other
 * intent vocabulary is, because a classifier typo must never cost a document
 * its whole intent.
 */

import { describe, expect, it } from "vitest";

import { CHARACTER_KEYS } from "../src/intent/types.js";
import { validateIntentValue } from "../src/intent/validate.js";
import { TERRAIN_DIAGNOSTICS } from "../src/terrain/diagnostics.js";

function check(character: unknown) {
  return validateIntentValue({ character }, "world").diagnostics;
}

describe("the key", () => {
  it("is a character key, beside the other three lists", () => {
    expect(CHARACTER_KEYS).toContain("formPacks");
    for (const sibling of ["archetypes", "props", "flora"] as const) {
      expect(CHARACTER_KEYS).toContain(sibling);
    }
  });

  it("owns two codes of its own, and they collide with nothing", () => {
    expect(TERRAIN_DIAGNOSTICS.INTENT_FORM_PACK_UNKNOWN).toBe("LOAM-W516");
    expect(TERRAIN_DIAGNOSTICS.INTENT_FORM_PACK_ERA).toBe("LOAM-W517");
    const codes = Object.values(TERRAIN_DIAGNOSTICS);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("validation", () => {
  it("accepts a list of pack words, and an empty list", () => {
    expect(check({ formPacks: ["classical_mediterranean"] })).toHaveLength(0);
    expect(check({ formPacks: ["nile_egypt", "east_asian"] })).toHaveLength(0);
    expect(check({ formPacks: [] })).toHaveLength(0);
  });

  it("does not object to a word no pack carries — that is the compiler's warning", () => {
    expect(check({ formPacks: ["atlantean"] })).toHaveLength(0);
  });

  it("rejects a non-list, and a list with a hole in it", () => {
    for (const bad of ["classical_mediterranean", 7, {}, [""], ["ok", 3], [null]]) {
      const out = check({ formPacks: bad });
      expect(out).toHaveLength(1);
      expect(out[0]?.name).toBe("BAD_TYPE");
      expect(out[0]?.severity).toBe("error");
      expect(out[0]?.nodePath).toBe("world.character.formPacks");
    }
  });

  it("is a known key — it does not draw the unknown-key diagnostic", () => {
    const out = check({ formPacks: ["agrarian"], formpacks: ["agrarian"] });
    expect(out.map((d) => d.nodePath)).not.toContain("world.character.formPacks");
    expect(out.length).toBeGreaterThan(0); // the mis-cased one is still unknown
  });
});

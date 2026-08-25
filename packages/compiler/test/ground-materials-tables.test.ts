/**
 * **Two authorities for one family** — census `docs/STOCKTAKE-SLOP-CENSUS.md`
 * §3, M3.
 *
 * `GROUND_MATERIALS_BY_THEME` (a hand-written table) and
 * `deriveGroundMaterials` (a greedy allocation over the theme's own sets) both
 * answer the question "what are the twelve ground roles for this theme?".
 * `groundMaterials()` prefers the table, so for every theme the table names the
 * derivation never runs — and the table names all of them today.
 *
 * This file does two jobs and only two. It asserts the *resolved* roles name
 * blocks that exist, which is a property; and it **pins** where the derivation
 * disagrees with the table it is the fallback for. The pin is a census finding
 * written down, not a design: nobody has ruled that the derivation ought to
 * reproduce the table. If the derivation is ever retired, this file goes with
 * it; if it is ever promoted, this file is where the argument has to be won.
 */

import { describe, expect, it } from "vitest";

import { ALL_MATERIAL_THEMES } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  GROUND_MATERIALS_BY_THEME,
  STREET_MATERIALS_BY_THEME,
  deriveGroundMaterials,
  groundMaterials,
  streetMaterials,
  type GroundMaterials,
} from "../src/terrain/palette.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);

/**
 * Census M3's finding, pinned: for every shipped theme the derivation
 * reproduces **almost none** of the table it is the fallback for — ten of the
 * twelve roles differ in five themes, eleven in `boreal_pine`, all twelve in
 * `xeno_resin`, and `modern_city` included, whose table *is*
 * `MODERN_GROUND_MATERIALS` and which the derivation still fails to reproduce.
 * The two authorities are not two spellings of one answer; they are two
 * answers. Recorded, not endorsed.
 */
const SOLID_TEN = [
  "pavement",
  "kerb",
  "tread",
  "revetment",
  "coping",
  "plinth",
  "weep",
  "rail",
  "stairs",
  "slab",
];
const EXPECTED_DIVERGENCE: Record<string, string[]> = {
  temperate_timber: SOLID_TEN,
  boreal_pine: [...SOLID_TEN, "bank"],
  birchwood_downs: SOLID_TEN,
  modern_city: SOLID_TEN,
  white_quartz: SOLID_TEN,
  sun_clay: SOLID_TEN,
  xeno_resin: [...SOLID_TEN, "bank", "scree"],
};

const known = (name: string): boolean =>
  stack.blockByName(name.replace(/^minecraft:/, "")) !== undefined;

const roles = (m: GroundMaterials): (keyof GroundMaterials)[] =>
  Object.keys(m) as (keyof GroundMaterials)[];

/** The roles where the derivation and the table differ, in table order. */
function divergence(theme: (typeof ALL_MATERIAL_THEMES)[number]): string[] {
  const table = GROUND_MATERIALS_BY_THEME[theme.id];
  if (table === undefined) return [];
  const derived = deriveGroundMaterials(theme);
  return roles(table)
    .filter((role) => table[role] !== derived[role])
    .map((role) => String(role));
}

describe("ground materials: table vs derivation", () => {
  it("resolves every role of every shipped theme to a block this version knows", () => {
    for (const theme of ALL_MATERIAL_THEMES) {
      const resolved = groundMaterials(theme);
      for (const role of roles(resolved)) {
        expect(known(resolved[role]), `${theme.id}.${String(role)} = ${resolved[role]}`).toBe(true);
      }
    }
  });

  it("derives every role to a block this version knows, table or no table", () => {
    for (const theme of ALL_MATERIAL_THEMES) {
      const derived = deriveGroundMaterials(theme);
      for (const role of roles(derived)) {
        expect(known(derived[role]), `${theme.id}.${String(role)} = ${derived[role]}`).toBe(true);
      }
    }
  });

  it("names every shipped theme in the table, so the derivation is unreachable in a compile", () => {
    // The census read the table as six themes against seven shipped; it is
    // seven today. `groundMaterials()` therefore never derives for a theme we
    // ship, which is exactly why the disagreements below are inert — and
    // exactly why nothing but a test would ever notice them.
    expect(ALL_MATERIAL_THEMES.filter((t) => GROUND_MATERIALS_BY_THEME[t.id] === undefined)).toEqual(
      [],
    );
  });

  it("pins where the derivation disagrees with the table it falls back to", () => {
    // NOT a design. Each entry is census M3's finding written down: the roles
    // where `deriveGroundMaterials(theme)` does not reproduce
    // `GROUND_MATERIALS_BY_THEME[theme.id]`. An empty array means the two
    // authorities happen to agree for that theme. Changing either authority
    // will move these lists; that is the point of pinning them.
    const pinned: Record<string, string[]> = {};
    for (const theme of ALL_MATERIAL_THEMES) pinned[theme.id] = divergence(theme);
    expect(pinned).toEqual(EXPECTED_DIVERGENCE);
  });
});

describe("street materials: one authority only", () => {
  it("has no derivation to disagree with", () => {
    // There is no `deriveStreetMaterials`: `streetMaterials()` is the table
    // else `MODERN_STREET_MATERIALS`, so M3's second half is a table-vs-default
    // question, not a table-vs-derivation one. All that can be pinned is that
    // the table answers for every shipped theme.
    expect(ALL_MATERIAL_THEMES.filter((t) => STREET_MATERIALS_BY_THEME[t.id] === undefined)).toEqual(
      [],
    );
    for (const theme of ALL_MATERIAL_THEMES) {
      const m = streetMaterials(theme.id);
      for (const name of Object.values(m)) expect(known(name), `${theme.id} ${name}`).toBe(true);
    }
  });
});

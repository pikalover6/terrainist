/**
 * The built ground's **material roles** — `terrain/palette.ts`.
 *
 * The defect, in the words of a vision model shown the walked hill town cold:
 * *"Everything — pathways, retaining walls, platform bases, and building tops —
 * is constructed from the exact same grey stone brick palette. The eye
 * perceives the entire generation as one contiguous, carved stone monolith
 * rather than individual buildings on a hill."*
 *
 * The cause was not taste, it was arithmetic. `street.sidewalk` and
 * `street.curb` are read by six modules and are **not** members of
 * `DEFAULT_PALETTE`, so every one of them fell through to its own hard-coded
 * default — `smooth_stone` and `stone_bricks` — in every theme; the retaining
 * wall's fill was literally `ground.stone`, which is the block the hill itself
 * is made of; and `road.step` had one value for every settlement that has ever
 * compiled. Four jobs, one grey.
 *
 * So what is asserted here is the **structure**, never the choice. Which block
 * reads best beside a spruce cottage is a walk's decision and Kai's; that a
 * pavement, a kerb, a revetment, a coping, a plinth and a weep course are six
 * *different* blocks in every theme we ship is a property, and it is the
 * property the defect violated.
 */

import { describe, expect, it } from "vitest";

import { ALL_MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import {
  GROUND_MATERIALS_BY_THEME,
  GROUND_ROLE_SYMBOLS,
  GROUND_SOLID_ROLES,
  MODERN_GROUND_MATERIALS,
  defineGroundRoles,
  deriveGroundMaterials,
  groundMaterials,
  resolvePalette,
  streetMaterials,
  type GroundMaterials
} from "../src/terrain/palette.js";
import { RETAINING_PROFILE, STAIR_PROFILE } from "../src/structures/profiles.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);

/** The three themes the report tables: a hill town, a market town, a monastery. */
const HEADLINE = ["boreal_pine", "temperate_timber", "white_quartz"] as const;

/* -------------------------------------------------------------------------- */
/* 1. every shipped theme fills the same twelve jobs, with twelve materials     */
/* -------------------------------------------------------------------------- */

describe("the ground-role table", () => {
  it("names every shipped theme", () => {
    for (const theme of ALL_MATERIAL_THEMES) {
      expect(GROUND_MATERIALS_BY_THEME[theme.id], theme.id).toBeDefined();
    }
  });

  it.each([...ALL_MATERIAL_THEMES.map((t) => t.id)])(
    "%s: the nine solid roles are nine different blocks",
    (id) => {
      const theme = ALL_MATERIAL_THEMES.find((t) => t.id === id) as MaterialTheme;
      const materials = groundMaterials(theme);
      const solids = GROUND_SOLID_ROLES.map((role) => materials[role]);
      // The whole defect, as one assertion: a settlement whose pavement, kerb,
      // tread, revetment, coping, plinth, weep, bank and scree are the same
      // block is the grey monolith the walk found.
      expect(new Set(solids).size, solids.join(" ")).toBe(GROUND_SOLID_ROLES.length);
    },
  );

  it.each([...ALL_MATERIAL_THEMES.map((t) => t.id)])(
    "%s: nothing you walk on is the colour of the road",
    (id) => {
      const theme = ALL_MATERIAL_THEMES.find((t) => t.id === id) as MaterialTheme;
      const materials = groundMaterials(theme);
      const street = streetMaterials(id);
      // A kerb that matches the carriageway is not a kerb, and a pavement that
      // matches it is a wider road. The *worn* tone and the centre line are
      // deliberately not in this test: they are minority marks on the
      // carriageway itself, not the surface beside it.
      for (const role of ["pavement", "kerb", "tread"] as const) {
        expect(materials[role], `${id}.${role}`).not.toBe(street.carriageway);
      }
    },
  );

  it.each([...ALL_MATERIAL_THEMES.map((t) => t.id)])(
    "%s: every block exists in the pinned Minecraft version, in the right shape",
    (id) => {
      const materials = groundMaterials(
        ALL_MATERIAL_THEMES.find((t) => t.id === id) as MaterialTheme,
      );
      for (const [role, name] of Object.entries(materials)) {
        expect(stack.blockByName(name), `${id}.${role} = ${name}`).toBeDefined();
      }
      // A balustrade has to be a wall, a nosing a stair and a half course a
      // slab: the physics lint agrees with vanilla that a wall carries a
      // support chain and iron bars do not, and a "stairs" role that named a
      // full block would silently stop dressing treads.
      expect(materials.rail.endsWith("_wall"), materials.rail).toBe(true);
      expect(materials.stairs.endsWith("_stairs"), materials.stairs).toBe(true);
      expect(materials.slab.endsWith("_slab"), materials.slab).toBe(true);
    },
  );

  it("gives a hill town, a market town and a monastery different ground", () => {
    const tables = HEADLINE.map(
      (id) => groundMaterials(ALL_MATERIAL_THEMES.find((t) => t.id === id) as MaterialTheme),
    );
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        expect(JSON.stringify(tables[i]), `${HEADLINE[i]} vs ${HEADLINE[j]}`).not.toBe(
          JSON.stringify(tables[j]),
        );
      }
    }
    // And per role, not merely as a whole: the three shipped headline themes
    // disagree about what a revetment, a kerb, a plinth and a balustrade are
    // made of, which is the difference between a themed palette and a themed
    // *label*.
    for (const role of ["revetment", "kerb", "plinth", "rail", "pavement", "coping"] as const) {
      const chosen = tables.map((t) => t[role]);
      expect(new Set(chosen).size, `${role}: ${chosen.join(" ")}`).toBe(HEADLINE.length);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. a theme nobody has walked still comes out legible                        */
/* -------------------------------------------------------------------------- */

describe("deriveGroundMaterials", () => {
  /**
   * The awkward shape, on purpose: two stone sets whose `accent` is the
   * other's `primary`, which is exactly how the shipped sets are written and
   * why a naive "take primary and accent" derivation collapses to three blocks.
   */
  const cross: MaterialTheme = {
    id: "unwalked",
    woods: [
      {
        id: "w",
        planks: "oak_planks",
        log: "oak_log",
        stripped: "stripped_oak_log",
        stairs: "oak_stairs",
        slab: "oak_slab",
        fence: "oak_fence",
        door: "oak_door",
        trapdoor: "oak_trapdoor"
      }
    ],
    stones: [
      {
        id: "a",
        primary: "tuff_bricks",
        accent: "polished_tuff",
        stairs: "tuff_brick_stairs",
        slab: "tuff_brick_slab",
        wall: "tuff_brick_wall"
      },
      {
        id: "b",
        primary: "polished_tuff",
        accent: "tuff_bricks",
        stairs: "polished_tuff_stairs",
        slab: "polished_tuff_slab",
        wall: "polished_tuff_wall"
      }
    ],
    roofs: [{ id: "r", stairs: "brick_stairs", slab: "brick_slab", solid: "bricks" }]
  };

  it("keeps the nine solid roles distinct even when the sets cross-reference", () => {
    const materials = deriveGroundMaterials(cross);
    const solids = GROUND_SOLID_ROLES.map((role) => materials[role]);
    expect(new Set(solids).size, solids.join(" ")).toBe(GROUND_SOLID_ROLES.length);
  });

  it("builds with the first stone family and paves with the last", () => {
    const materials = deriveGroundMaterials(cross);
    expect(materials.revetment).toBe("tuff_bricks");
    expect(materials.rail).toBe("tuff_brick_wall");
    expect(materials.stairs).toBe("tuff_brick_stairs");
    expect(materials.slab).toBe("tuff_brick_slab");
  });

  it("is a pure function of the theme", () => {
    expect(deriveGroundMaterials(cross)).toEqual(deriveGroundMaterials(cross));
  });

  it("falls back to the modern set when there is no theme at all", () => {
    expect(groundMaterials(undefined)).toBe(MODERN_GROUND_MATERIALS);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the palette is where the fix lands                                       */
/* -------------------------------------------------------------------------- */

describe("defineGroundRoles", () => {
  const paletteOf = (palettes?: Record<string, string>) =>
    resolvePalette(
      stack,
      palettes === undefined ? undefined : ({ palettes } as never),
      nodeSeed(7n, "world"),
    ).palette;
  const boreal = ALL_MATERIAL_THEMES.find((t) => t.id === "boreal_pine") as MaterialTheme;

  it("answers for two symbols that six modules read and nothing ever defined", () => {
    const palette = paletteOf();
    // The defect, before: every consumer of these asked, got "no", and fell
    // back to its own hard-coded grey.
    expect(palette.has("street.sidewalk")).toBe(false);
    expect(palette.has("street.curb")).toBe(false);

    expect(defineGroundRoles(palette, stack, boreal)).toEqual([]);
    expect(palette.has("street.sidewalk")).toBe(true);
    expect(palette.has("street.curb")).toBe(true);
    const materials = groundMaterials(boreal);
    expect(palette.state("street.sidewalk")).toBe(
      stack.blockByName(materials.pavement)?.stateId,
    );
    expect(palette.state("street.curb")).toBe(stack.blockByName(materials.kerb)?.stateId);
  });

  it("moves a profile default the theme has an opinion about", () => {
    const palette = paletteOf();
    const before = palette.state("road.step");
    defineGroundRoles(palette, stack, boreal);
    // `road.step` had a value — `stone_bricks` — and it was the same value in
    // every settlement ever compiled. A stepped street is paving and a theme
    // paves in its own material.
    expect(palette.state("road.step")).not.toBe(before);
    expect(palette.state("road.step")).toBe(
      stack.blockByName(groundMaterials(boreal).tread)?.stateId,
    );
  });

  it("never moves a symbol the document itself wrote", () => {
    const authored = {
      "street.curb": "minecraft:blackstone",
      "road.step": "minecraft:tuff_bricks"
    };
    const palette = paletteOf(authored);
    defineGroundRoles(palette, stack, boreal);
    for (const [symbol, block] of Object.entries(authored)) {
      expect(palette.isAuthored(symbol), symbol).toBe(true);
      expect(palette.state(symbol), symbol).toBe(stack.blockByName(block)?.stateId);
    }
    // …and the roles the author said nothing about still land.
    expect(palette.state("ground.revetment")).toBe(
      stack.blockByName(groundMaterials(boreal).revetment)?.stateId,
    );
  });

  it("gives every role a symbol, and every symbol a distinct name", () => {
    const symbols = Object.values(GROUND_ROLE_SYMBOLS);
    expect(new Set(symbols).size).toBe(symbols.length);
    const palette = paletteOf();
    defineGroundRoles(palette, stack, boreal);
    for (const symbol of symbols) expect(palette.has(symbol), symbol).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. the profiles ask for roles, not for grey                                 */
/* -------------------------------------------------------------------------- */

describe("the swept profiles", () => {
  it("builds a retaining wall out of revetment under coping, not kerb over bedrock", () => {
    const face = RETAINING_PROFILE.bands.find((b) => b.id === "face");
    // The old pair, and why each was wrong: `street.curb` is the *street's*
    // edge course, so a wall was capped in the same block the kerb beside it
    // used; `ground.stone` is the block the hill is made of, so the wall's body
    // was literally the hillside — "a WorldEdit cut without the facade".
    expect(face?.surface).toBe(GROUND_ROLE_SYMBOLS.coping);
    expect(face?.fill).toBe(GROUND_ROLE_SYMBOLS.revetment);
    expect(face?.fill).not.toBe("ground.stone");
    const verge = RETAINING_PROFILE.bands.find((b) => b.id === "verge");
    expect(verge?.surface).toBe(GROUND_ROLE_SYMBOLS.pavement);
  });

  it("paves a public flight in the settlement's own paving", () => {
    for (const band of STAIR_PROFILE.bands) {
      expect(band.surface, band.id).toBe(GROUND_ROLE_SYMBOLS.tread);
      expect(band.surface, band.id).not.toBe("stone_bricks");
    }
    expect(STAIR_PROFILE.bands.find((b) => b.id === "balustrade")?.cap?.block).toBe(
      GROUND_ROLE_SYMBOLS.rail,
    );
  });

  it("names only symbols the compile has defined by the time a sweep reads one", () => {
    // `sweep`'s `stateOf` resolves a palette symbol *or* a Minecraft block
    // name; a dotted symbol that is neither is state 0, which is **air**, and
    // that is how the top course of every wall in a quarter once came out
    // invisible. So every dotted band symbol has to be a real role.
    const roles = new Set(Object.values(GROUND_ROLE_SYMBOLS));
    const palette = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
    defineGroundRoles(
      palette,
      stack,
      ALL_MATERIAL_THEMES.find((t) => t.id === "white_quartz") as MaterialTheme,
    );
    for (const profile of [RETAINING_PROFILE, STAIR_PROFILE]) {
      for (const band of profile.bands) {
        for (const symbol of [band.surface, band.fill, band.cap?.block]) {
          if (symbol === undefined || !symbol.includes(".")) continue;
          expect(roles.has(symbol) || palette.has(symbol), `${profile.id}:${symbol}`).toBe(true);
          expect(palette.state(symbol), `${profile.id}:${symbol}`).not.toBe(0);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 5. the table, as a table — the thing a reviewer actually wants to read      */
/* -------------------------------------------------------------------------- */

describe("the roles, side by side", () => {
  it("reads as three coherent palettes rather than three labels on one", () => {
    const rows: string[] = [];
    const roles = Object.keys(GROUND_ROLE_SYMBOLS) as (keyof GroundMaterials)[];
    for (const role of roles) {
      rows.push(
        `${role}: ` +
          HEADLINE.map(
            (id) =>
              `${id}=${groundMaterials(ALL_MATERIAL_THEMES.find((t) => t.id === id) as MaterialTheme)[role]}`,
          ).join(" "),
      );
    }
    // Not a snapshot — a snapshot of a look is a look nobody may change without
    // a walk. What is pinned is that no piece of *masonry* is answered the same
    // way by all three, which is what "themed" has to mean to be worth the
    // plumbing. `bank` and `scree` are deliberately exempt: earth is earth, and
    // gravel at the toe of a slope is gravel in any palette.
    const masonry = roles.filter((role) => role !== "bank" && role !== "scree");
    for (const role of masonry) {
      const chosen = HEADLINE.map(
        (id) =>
          groundMaterials(ALL_MATERIAL_THEMES.find((t) => t.id === id) as MaterialTheme)[role],
      );
      expect(new Set(chosen).size, `${role}: ${chosen.join(" ")}`).toBeGreaterThan(1);
    }
    expect(rows.length).toBe(roles.length);
  });
});

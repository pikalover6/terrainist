/**
 * The wired rows, one dial at a time.
 *
 * Unit-level on purpose: a full compile proves the *identity* law (see
 * `intent-identity.test.ts`), and these prove the other half — that a dial an
 * author actually turns reaches a different value. Each case states the value
 * the subsystem would have used and asserts what the row does with it.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { fanOut, installFanOutRows } from "../src/intent/index.js";
import { resolveIntents, intentFor } from "../src/intent/resolve.js";
import { LAYOUT_ROWS } from "../src/layout/streets-intent.js";
import { COLD_CROPS, FARM_ROWS, FARM_TODAY, WARM_CROPS } from "../src/structures/farm-intent.js";
import { FARM_DEFAULT_CROPS, farmSettings } from "../src/structures/farm.js";
import { STRUCTURE_ROWS } from "../src/structures/themes-intent.js";
import { BLEND_FEATHER, TERRAIN_ROWS, NO_CLIMATE_OFFSET } from "../src/terrain/climate-intent.js";
import { BIOME_CELL } from "../src/terrain/landuse.js";
import type { ClimateIntent } from "../src/terrain/landuse.js";

beforeAll(() => {
  installFanOutRows();
});

/** The resolved record for one world-scope intent. */
function scope(intent: unknown) {
  return intentFor(resolveIntents({ intent: intent as never, root: { id: "world" } }), "world");
}

const NOTHING = scope(undefined);

describe("material theme", () => {
  it("takes character.materialTheme over the seeded draw", () => {
    const answer = fanOut<string | undefined>(STRUCTURE_ROWS.materialTheme, scope({ character: { materialTheme: "boreal_pine" } }), { nodePath: "world", today: undefined });
    expect(answer).toBe("boreal_pine");
  });

  it("ignores a theme id the stdlib does not carry", () => {
    const answer = fanOut<string | undefined>(STRUCTURE_ROWS.materialTheme, scope({ character: { materialTheme: "unicorn_marble" } }), { nodePath: "world", today: undefined });
    expect(answer).toBeUndefined();
  });

  it("lets an era pick a theme, but never over an explicit style override", () => {
    expect(
      fanOut<string | undefined>(STRUCTURE_ROWS.materialTheme, scope({ era: "far_future" }), { nodePath: "world", today: undefined }),
    ).toBe("modern_city");
    expect(
      fanOut<string | undefined>(STRUCTURE_ROWS.materialTheme, scope({ era: "far_future" }), { nodePath: "world", today: "boreal_pine" }),
    ).toBe("boreal_pine");
  });
});

describe("roofs, ornament, wear and decay", () => {
  it("gives each era its roof, and a motif beats the era", () => {
    expect(fanOut(STRUCTURE_ROWS.roofForm, scope({ era: "modern" }), { nodePath: "w", today: undefined })).toBe("flat");
    expect(
      fanOut(STRUCTURE_ROWS.roofForm, scope({ era: "modern", character: { motifs: { roofType: "gable" } } }), { nodePath: "w", today: undefined }),
    ).toBe("gable");
  });

  it("centres ornament on today's value at wealth 0.5", () => {
    expect(fanOut(STRUCTURE_ROWS.ornamentDensity, scope({ wealth: 0.5 }), { nodePath: "w", today: 0.4 })).toBeCloseTo(0.4);
    expect(fanOut(STRUCTURE_ROWS.ornamentDensity, scope({ wealth: 1 }), { nodePath: "w", today: 0.4 })).toBeCloseTo(0.9);
  });

  it("never polishes a road below the wear it already had", () => {
    expect(fanOut(STRUCTURE_ROWS.wearIntensity, scope({ decline: 0 }), { nodePath: "w", today: 0.3 })).toBeCloseTo(0.3);
    expect(fanOut(STRUCTURE_ROWS.wearIntensity, scope({ decline: 1 }), { nodePath: "w", today: 0.3 })).toBeCloseTo(1);
  });

  it("ruins few buildings at half decline and most at full", () => {
    expect(fanOut(STRUCTURE_ROWS.decayCoverage, scope({ decline: 0.5 }), { nodePath: "w", today: 0 })).toBeCloseTo(0.25);
    expect(fanOut(STRUCTURE_ROWS.decayCoverage, scope({ decline: 1 }), { nodePath: "w", today: 0 })).toBeCloseTo(1);
    expect(fanOut(STRUCTURE_ROWS.vegetationReclaim, scope({ decline: 1 }), { nodePath: "w", today: 0 })).toBeCloseTo(0.6);
  });

  it("switches the prop family on the era", () => {
    // Every era's answer is a real catalog prop id, because a family word the
    // life pass cannot build is a fan-out that changes nothing.
    expect(fanOut(STRUCTURE_ROWS.propFamily, scope({ era: "far_future" }), { nodePath: "w", today: undefined })).toBe("floating_platform");
    expect(fanOut(STRUCTURE_ROWS.propFamily, NOTHING, { nodePath: "w", today: "cart" })).toBe("cart");
  });

  it("gates the modern street fittings on the era, and defaults to today", () => {
    const gate = (intent: unknown, today: boolean): boolean =>
      fanOut<boolean>(STRUCTURE_ROWS.modernFittings, scope(intent), { nodePath: "w", today });
    // Declared and modern: allowed. Declared and pre-modern: shut.
    expect(gate({ era: "modern" }, true)).toBe(true);
    expect(gate({ era: "cyberpunk" }, true)).toBe(true);
    expect(gate({ era: "medieval" }, true)).toBe(false);
    expect(gate({ era: "victorian" }, true)).toBe(false);
    // Not declared: today, whatever today is. This is the identity law — a
    // document with no `era` must not lose a single AC unit.
    expect(fanOut<boolean>(STRUCTURE_ROWS.modernFittings, NOTHING, { nodePath: "w", today: true })).toBe(true);
    expect(fanOut<boolean>(STRUCTURE_ROWS.modernFittings, NOTHING, { nodePath: "w", today: false })).toBe(false);
    // An unknown word falls back to the default class, which is pre-modern.
    expect(gate({ era: "swashbuckling" }, true)).toBe(false);
  });

  it("gates the downtown kerbside kit on the era, and defaults to today", () => {
    const kit = (intent: unknown, today: string): string =>
      fanOut<string>(STRUCTURE_ROWS.kerbsideKit, scope(intent), { nodePath: "w", today });
    // Declared and modern: the wide band keeps its downtown kit.
    expect(kit({ era: "modern" }, "downtown")).toBe("downtown");
    expect(kit({ era: "cyberpunk" }, "downtown")).toBe("downtown");
    // Declared and pre-modern: the rustic substitution, however wide the band.
    expect(kit({ era: "medieval" }, "downtown")).toBe("village");
    expect(kit({ era: "victorian" }, "downtown")).toBe("village");
    expect(kit({ era: "swashbuckling" }, "downtown")).toBe("village");
    // The gate only ever downgrades: a village lane is never promoted.
    expect(kit({ era: "modern" }, "village")).toBe("village");
    expect(kit({ era: "medieval" }, "none")).toBe("none");
    // Not declared: today, whatever today is — the identity law.
    expect(fanOut<string>(STRUCTURE_ROWS.kerbsideKit, NOTHING, { nodePath: "w", today: "downtown" })).toBe("downtown");
    expect(fanOut<string>(STRUCTURE_ROWS.kerbsideKit, NOTHING, { nodePath: "w", today: "village" })).toBe("village");
  });
});

describe("the holding's rows (FARM-PLAN §10)", () => {
  it("walls a holding's fields only for the one era that means dry stone", () => {
    const edge = (intent: unknown): string =>
      fanOut<string>(FARM_ROWS.edgeKit, scope(intent), { nodePath: "w", today: FARM_TODAY.edge });
    expect(edge({ era: "ancient" })).toBe("wall");
    expect(edge({ era: "roman" })).toBe("wall");
    expect(edge({ era: "medieval" })).toBe("fence");
    expect(edge({ era: "modern" })).toBe("fence");
    // Absent: today's default, which is the fence — the reach law, stated at
    // the one row an author is most likely to leave alone.
    expect(edge(undefined)).toBe(FARM_TODAY.edge);
    expect(fanOut<string>(FARM_ROWS.edgeKit, NOTHING, { nodePath: "w", today: "none" })).toBe("none");
  });

  it("rests a few fields at half decline and most of them at full", () => {
    const fallow = (intent: unknown, today = FARM_TODAY.fallow): number =>
      fanOut<number>(FARM_ROWS.fallowShare, scope(intent), { nodePath: "w", today });
    expect(fallow(undefined)).toBe(0);
    expect(fallow({ decline: 0 })).toBe(0);
    expect(fallow({ decline: 0.5 })).toBeCloseTo(0.25);
    expect(fallow({ decline: 1 })).toBeCloseTo(1);
    // Never un-rests a share the author already asked for.
    expect(fallow({ decline: 0.2 }, 0.5)).toBeCloseTo(0.5);
  });

  it("gives a hot country and a cold one different crops, and silence the temperate list", () => {
    const crops = (intent: unknown): readonly string[] =>
      fanOut<readonly string[]>(FARM_ROWS.cropList, scope(intent), {
        nodePath: "w",
        today: FARM_TODAY.crops
      });
    // Law 2, by reference: an absent climate hands back the very list the pass
    // was about to use.
    expect(crops(undefined)).toBe(FARM_TODAY.crops);
    expect(crops({ climate: { humidity: 0.8 } })).toBe(FARM_TODAY.crops);
    expect(crops({ climate: { biome: "minecraft:desert" } })).toEqual(WARM_CROPS);
    expect(crops({ climate: { temperature: 0.6 } })).toEqual(WARM_CROPS);
    expect(crops({ climate: { biome: "minecraft:snowy_taiga" } })).toEqual(COLD_CROPS);
    expect(crops({ climate: { temperature: -0.6 } })).toEqual(COLD_CROPS);
    // A biome named but unknown to the keyword table is not a guess.
    expect(crops({ climate: { biome: "minecraft:plains" } })).toBe(FARM_TODAY.crops);
    // A temperature inside the band is "a bit warm", not a different farm.
    expect(crops({ climate: { temperature: 0.2 } })).toBe(FARM_TODAY.crops);
  });

  it("lets an author name crops, and forbid them, over the climate", () => {
    const crops = (intent: unknown): readonly string[] =>
      fanOut<readonly string[]>(FARM_ROWS.cropList, scope(intent), {
        nodePath: "w",
        today: FARM_TODAY.crops
      });
    // `prefer` in declaration order, and only ids the crop table grows: an
    // ungrounded word (a tree shape, a phrase) must never become a crop.
    expect(crops({ character: { flora: { prefer: ["pumpkin", "broadleaf", "wheat"] } } })).toEqual([
      "pumpkin",
      "wheat"
    ]);
    expect(crops({ character: { flora: { prefer: ["conifer"] } } })).toBe(FARM_TODAY.crops);
    // `forbid` filters whatever the climate chose.
    expect(
      crops({ climate: { biome: "minecraft:desert" }, character: { flora: { forbid: ["pasture"] } } }),
    ).toEqual(["wheat", "pumpkin", "beetroots"]);
    // Forbidding the whole table is not a holding of empty fields.
    expect(crops({ character: { flora: { forbid: [...FARM_TODAY.crops] } } })).toBe(FARM_TODAY.crops);
  });
});

describe("the holding's seam", () => {
  it("hands farmSettings exactly its own defaults when nothing is declared", () => {
    // The reach law at the one place it could leak: the rows are consulted per
    // holding and their answers become `farmSettings`'s defaults, so a document
    // with no intent must produce the settings the pass would have chosen on its
    // own — not merely equal values, but the same holding.
    const defaults = {
      edge: fanOut<"fence" | "wall" | "none">(FARM_ROWS.edgeKit, NOTHING, {
        nodePath: "w",
        today: FARM_TODAY.edge
      }),
      fallow: fanOut<number>(FARM_ROWS.fallowShare, NOTHING, { nodePath: "w", today: FARM_TODAY.fallow }),
      crops: fanOut<readonly string[]>(FARM_ROWS.cropList, NOTHING, {
        nodePath: "w",
        today: FARM_TODAY.crops
      })
    };
    for (const params of [{}, { parcels: 6, parcelSize: 18 }, { edge: "wall", fallow: 0.4 }]) {
      const withRows = farmSettings(params, defaults);
      const without = farmSettings(params);
      // The crop list is the one field the seam fills in rather than leaves
      // empty, and it fills it with the very list the emitter falls back to.
      expect(withRows.crops).toEqual(FARM_DEFAULT_CROPS);
      expect({ ...withRows, crops: [] }).toEqual({ ...without, crops: [] });
    }
  });

  it("lets an intent move a holding that wrote no params, and never one that did", () => {
    const defaults = (intent: unknown) => ({
      edge: fanOut<"fence" | "wall" | "none">(FARM_ROWS.edgeKit, scope(intent), {
        nodePath: "w",
        today: FARM_TODAY.edge
      }),
      fallow: fanOut<number>(FARM_ROWS.fallowShare, scope(intent), {
        nodePath: "w",
        today: FARM_TODAY.fallow
      }),
      crops: fanOut<readonly string[]>(FARM_ROWS.cropList, scope(intent), {
        nodePath: "w",
        today: FARM_TODAY.crops
      })
    });
    const declared = defaults({
      era: "ancient",
      decline: 0.6,
      climate: { biome: "minecraft:desert" }
    });
    const silent = farmSettings({}, declared);
    expect(silent.edge).toBe("wall");
    expect(silent.fallow).toBeCloseTo(0.36);
    expect(silent.crops).toEqual(WARM_CROPS);
    // The author outranks every one of them.
    const written = farmSettings({ edge: "none", fallow: 0, crops: ["berries"] }, declared);
    expect(written.edge).toBe("none");
    expect(written.fallow).toBe(0);
    expect(written.crops).toEqual(["berries"]);
  });
});

describe("the urban rows", () => {
  it("scales block size with wealth and leaves the middle alone", () => {
    expect(fanOut(LAYOUT_ROWS.blockSize, scope({ wealth: 0.5 }), { nodePath: "w", today: 32 })).toBe(32);
    expect(fanOut(LAYOUT_ROWS.blockSize, scope({ wealth: 1 }), { nodePath: "w", today: 32 })).toBe(40);
    expect(fanOut(LAYOUT_ROWS.blockSize, scope({ wealth: 0 }), { nodePath: "w", today: 32 })).toBe(24);
  });

  it("thins a district only once it is properly abandoned", () => {
    expect(fanOut(LAYOUT_ROWS.density, scope({ decline: 0.5 }), { nodePath: "w", today: "high" })).toBe("high");
    expect(fanOut(LAYOUT_ROWS.density, scope({ decline: 0.9 }), { nodePath: "w", today: "high" })).toBe("medium");
    expect(fanOut(LAYOUT_ROWS.density, scope({ decline: 0.9 }), { nodePath: "w", today: "medium" })).toBe("low");
  });
});

describe("the climate hand-off", () => {
  it("passes biome and snow through to the land-use clamp's rung 1", () => {
    const answer = fanOut<ClimateIntent | undefined>(
      TERRAIN_ROWS.landUse,
      scope({ climate: { biome: "minecraft:jungle", snow: "never" } }),
      { nodePath: "w", today: undefined },
    );
    expect(answer).toEqual({ biome: "minecraft:jungle", snow: "never" });
  });

  it("hands the clamp nothing when climate says only temperature", () => {
    const answer = fanOut<ClimateIntent | undefined>(TERRAIN_ROWS.landUse, scope({ climate: { temperature: 0.4 } }), {
      nodePath: "w",
      today: undefined
    });
    expect(answer).toBeUndefined();
  });

  it("adds the field offsets rather than replacing them", () => {
    expect(
      fanOut(TERRAIN_ROWS.offsets, scope({ climate: { temperature: 0.4, humidity: -0.2 } }), {
        nodePath: "w",
        today: NO_CLIMATE_OFFSET
      }),
    ).toEqual({ temperature: 0.4, humidity: -0.2 });
    expect(fanOut(TERRAIN_ROWS.offsets, NOTHING, { nodePath: "w", today: NO_CLIMATE_OFFSET })).toBe(NO_CLIMATE_OFFSET);
  });

  it("turns climate.blend into a feather width and leaves it alone otherwise", () => {
    const width = (intent: unknown) =>
      fanOut<number | undefined>(TERRAIN_ROWS.blend, scope(intent), { nodePath: "w", today: undefined });
    expect(width({ climate: { blend: "sharp" } })).toBe(BLEND_FEATHER.sharp);
    expect(width({ climate: { blend: "soft" } })).toBe(BLEND_FEATHER.soft);
    expect(width({ climate: { blend: "wide" } })).toBe(BLEND_FEATHER.wide);
    // Law 2: no climate, or a climate with no blend, is today's size-scaling.
    expect(width({ climate: { snow: "never" } })).toBeUndefined();
    expect(fanOut(TERRAIN_ROWS.blend, NOTHING, { nodePath: "w", today: undefined })).toBeUndefined();
    // Every width is a whole number of stored biome cells, widening in order.
    expect(BLEND_FEATHER.sharp).toBeLessThan(BLEND_FEATHER.soft);
    expect(BLEND_FEATHER.soft).toBeLessThan(BLEND_FEATHER.wide);
    for (const w of Object.values(BLEND_FEATHER)) expect(w % BIOME_CELL).toBe(0);
  });
});

describe("two regions, two answers", () => {
  const doc = {
    intent: { era: "fantasy", formality: 0.3 },
    root: {
      id: "world",
      kind: "composite",
      children: [
        {
          id: "unicorn_isle",
          kind: "district",
          intent: { wealth: 0.9, character: { motifs: { roofType: "dome" } } }
        },
        {
          id: "pirate_isle",
          kind: "district",
          intent: { era: "pirate", wealth: 0.25, decline: 0.6 }
        }
      ]
    }
  };

  it("gives the two islands different roofs, block sizes and wear", () => {
    const resolved = resolveIntents(doc);
    const unicorn = intentFor(resolved, "world.unicorn_isle");
    const pirate = intentFor(resolved, "world.pirate_isle");

    expect(fanOut(STRUCTURE_ROWS.roofForm, unicorn, { nodePath: "u", today: undefined })).toBe("dome");
    // "pirate" dispatches to renaissance, whose roof is a mansard.
    expect(fanOut(STRUCTURE_ROWS.roofForm, pirate, { nodePath: "p", today: undefined })).toBe("mansard");

    const uBlock = fanOut(LAYOUT_ROWS.blockSize, unicorn, { nodePath: "u", today: 32 });
    const pBlock = fanOut(LAYOUT_ROWS.blockSize, pirate, { nodePath: "p", today: 32 });
    expect(uBlock).toBeGreaterThan(pBlock);

    expect(fanOut(STRUCTURE_ROWS.wearIntensity, pirate, { nodePath: "p", today: 0.2 })).toBeGreaterThan(
      fanOut(STRUCTURE_ROWS.wearIntensity, unicorn, { nodePath: "u", today: 0.2 }),
    );
  });
});

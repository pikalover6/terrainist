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
import { STRUCTURE_ROWS } from "../src/structures/themes-intent.js";
import { TERRAIN_ROWS, NO_CLIMATE_OFFSET } from "../src/terrain/climate-intent.js";
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
});

describe("the urban rows", () => {
  it("scales block size with wealth and leaves the middle alone", () => {
    expect(fanOut(LAYOUT_ROWS.blockSize, scope({ wealth: 0.5 }), { nodePath: "w", today: 32 })).toBe(32);
    expect(fanOut(LAYOUT_ROWS.blockSize, scope({ wealth: 1 }), { nodePath: "w", today: 32 })).toBe(40);
    expect(fanOut(LAYOUT_ROWS.blockSize, scope({ wealth: 0 }), { nodePath: "w", today: 32 })).toBe(24);
  });

  it("only the ends of formality choose a fabric", () => {
    expect(fanOut(LAYOUT_ROWS.fabric, scope({ formality: 0.9 }), { nodePath: "w", today: "organic" })).toBe("grid");
    expect(fanOut(LAYOUT_ROWS.fabric, scope({ formality: 0.1 }), { nodePath: "w", today: "grid" })).toBe("organic");
    expect(fanOut(LAYOUT_ROWS.fabric, scope({ formality: 0.5 }), { nodePath: "w", today: "grid" })).toBe("grid");
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
      today: undefined,
    });
    expect(answer).toBeUndefined();
  });

  it("adds the field offsets rather than replacing them", () => {
    expect(
      fanOut(TERRAIN_ROWS.offsets, scope({ climate: { temperature: 0.4, humidity: -0.2 } }), {
        nodePath: "w",
        today: NO_CLIMATE_OFFSET,
      }),
    ).toEqual({ temperature: 0.4, humidity: -0.2 });
    expect(fanOut(TERRAIN_ROWS.offsets, NOTHING, { nodePath: "w", today: NO_CLIMATE_OFFSET })).toBe(NO_CLIMATE_OFFSET);
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
          intent: { wealth: 0.9, character: { motifs: { roofType: "dome" } } },
        },
        {
          id: "pirate_isle",
          kind: "district",
          intent: { era: "pirate", wealth: 0.25, decline: 0.6 },
        },
      ],
    },
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

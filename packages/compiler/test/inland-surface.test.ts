/**
 * Shoreline material in an ambient soil mix (Troy c5, 2026-08-12).
 *
 * Kai's walk: *"the city's floor is appropriate, but the sandstone mixed with
 * dirt OUTSIDE the city is ugly and unnecessary."* The countryside was a
 * checkerboard of pale single columns, and no pass wrote them: the **document**
 * did. Luna, asked for a city "above the sandy Aegean coast", wrote
 * `ground.surface` as a `coarse_dirt 3 / sand 1` mix — a coast expressed as the
 * ambient soil of a whole 512² region, drawn per column, 46,051 sand columns of
 * it.
 *
 * The rule under test: a *mixed* ambient surface leaves its shoreline members
 * to the shore, where `ground.beach` already paints them, and keeps its soil
 * members inland. Everything else — every single-block surface, every mix of
 * soils, and an outright sandy palette — is untouched, which is what makes this
 * shippable beside every world already walked.
 */

import {
  HeightField,
  SurfaceClass,
  centeredRegion,
  classify,
  nodeSeed,
  resolveHeightfieldParams,
} from "@terrainist/stdlib";
import { describe, expect, it } from "vitest";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { buildColumnPlan } from "../src/terrain/columns.js";
import { resolvePalette } from "../src/terrain/palette.js";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const nameOf = (stateId: number): string => stack.blockNameByStateId(stateId) ?? String(stateId);

const paletteOf = (palettes?: Record<string, unknown>) =>
  resolvePalette(
    stack,
    palettes === undefined ? undefined : ({ palettes } as never),
    nodeSeed(303n, "world"),
  ).palette;

/** Troy c5's own ambient surface, verbatim. */
const TROY_SURFACE = {
  mix: [
    ["minecraft:coarse_dirt", 3],
    ["minecraft:sand", 1],
  ],
};

/** A grid of columns wide enough for a 3:1 mix to show every member. */
const GRID: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let x = -60; x < 60; x++) for (let z = -60; z < 60; z++) out.push([x, z]);
  return out;
})();

describe("an ambient surface mix keeps its shoreline members on the shore", () => {
  it("drops the sand of a soil-and-sand mix inland, and keeps the soil's own draw", () => {
    const palette = paletteOf({ "ground.surface": TROY_SURFACE });

    const ambient = new Set(GRID.map(([x, z]) => nameOf(palette.stateAt("ground.surface", x, z))));
    expect(ambient).toEqual(new Set(["coarse_dirt", "sand"]));

    const inland = new Set(
      GRID.map(([x, z]) => nameOf(palette.inlandStateAt("ground.surface", x, z))),
    );
    expect(inland).toEqual(new Set(["coarse_dirt"]));
  });

  it("keeps the remaining soils' relative weights when more than one survives", () => {
    const palette = paletteOf({
      "ground.surface": {
        mix: [
          ["minecraft:coarse_dirt", 3],
          ["minecraft:sand", 4],
          ["minecraft:gravel", 1],
        ],
      },
    });
    const counts = new Map<string, number>();
    for (const [x, z] of GRID) {
      const name = nameOf(palette.inlandStateAt("ground.surface", x, z));
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(["coarse_dirt", "gravel"]);
    // 3:1 by weight, with the sand's share redistributed in proportion.
    const ratio = (counts.get("coarse_dirt") as number) / (counts.get("gravel") as number);
    expect(ratio).toBeGreaterThan(2.4);
    expect(ratio).toBeLessThan(3.6);
  });

  it("is identity for the profile default, a mix of soils, and an outright sandy palette", () => {
    const cases = [
      // The profile's own `grass_block` — every terrain-profile world ever shipped.
      undefined,
      // A single block the document named.
      { "ground.surface": "minecraft:podzol" },
      // p4-c2's overgrown hideout: three soils, nothing coastal.
      {
        "ground.surface": {
          mix: [
            ["minecraft:grass_block", 1],
            ["minecraft:moss_block", 3],
            ["minecraft:coarse_dirt", 1],
          ],
        },
      },
      // luna-p3's oasis: sand and red sand, and no soil at all. A document that
      // asks for a desert gets a desert — the filter needs *both* families.
      {
        "ground.surface": {
          mix: [
            ["minecraft:sand", 4],
            ["minecraft:red_sand", 1],
          ],
        },
      },
    ];
    for (const palettes of cases) {
      const palette = paletteOf(palettes as Record<string, unknown> | undefined);
      for (const [x, z] of GRID) {
        expect(palette.inlandStateAt("ground.surface", x, z)).toBe(
          palette.stateAt("ground.surface", x, z),
        );
      }
    }
  });

  it("is identity for every other symbol, mixed or not", () => {
    // `road.shoulder` is a profile-default mix; the filter is `ground.surface`
    // only, because that is the only symbol laid over a whole world's country.
    const palette = paletteOf({
      "ground.beach": { mix: [["minecraft:sand", 3], ["minecraft:gravel", 1]] },
    } as unknown as Record<string, unknown>);
    for (const symbol of ["road.shoulder", "ground.beach"]) {
      for (const [x, z] of GRID) {
        expect(palette.inlandStateAt(symbol, x, z)).toBe(palette.stateAt(symbol, x, z));
      }
    }
  });
});

describe("a c5-shaped coast: sand on the beach, none in the country", () => {
  /**
   * A shelving coast — sea to the west, rising land to the east — under Troy's
   * own ambient surface mix. The classifier's beach band is the genuine
   * shoreline; everything east of it is open country.
   */
  const planOf = (surface: unknown) => {
    const size = 64;
    const region = centeredRegion(size, size);
    const field = new HeightField(region);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        field.values[j * size + i] = 50 + i;
      }
    }
    const classification = classify(field, resolveHeightfieldParams({}));
    const palette = paletteOf({ "ground.surface": surface } as Record<string, unknown>);
    const plan = buildColumnPlan({
      field,
      classification,
      palette,
      seaLevel: 63,
      soilDepth: 3,
      calderas: [],
      basins: [],
    });
    return { plan, classification, size };
  };

  it("leaves no sand outside the beach band, and does not touch the band", () => {
    const { plan, classification, size } = planOf(TROY_SURFACE);

    let beachSand = 0;
    let inlandSand = 0;
    let inlandSoil = 0;
    for (let idx = 0; idx < size * size; idx++) {
      const name = nameOf(plan.surface[idx] as number);
      const isBeach = classification.classes[idx] === SurfaceClass.BEACH;
      if (isBeach) {
        if (name === "sand") beachSand++;
        continue;
      }
      if (plan.fluidKind[idx] !== 0) continue;
      if (name === "sand") inlandSand++;
      if (name === "coarse_dirt") inlandSoil++;
    }
    expect(beachSand).toBeGreaterThan(0);
    expect(inlandSand).toBe(0);
    expect(inlandSoil).toBeGreaterThan(0);
  });

  it("still speckles the country when the document's soil is all soil", () => {
    // The same coast under a mix with nothing coastal in it: unchanged, so the
    // fixture is measuring the filter and not the classifier.
    const { plan, size } = planOf({
      mix: [
        ["minecraft:coarse_dirt", 3],
        ["minecraft:podzol", 1],
      ],
    });
    const names = new Set<string>();
    for (let idx = 0; idx < size * size; idx++) names.add(nameOf(plan.surface[idx] as number));
    expect(names.has("coarse_dirt")).toBe(true);
    expect(names.has("podzol")).toBe(true);
  });
});

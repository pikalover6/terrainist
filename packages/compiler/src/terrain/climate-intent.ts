/**
 * Fan-out rows owned by the terrain passes.
 *
 * Two rows, and the important one is the hand-off: `landuse.ts` documented a
 * seam for `intent.climate` (precedence rung 1 of the biome contract) and left
 * it `undefined` for Phase 2 to fill. This is Phase 2 filling it, from the
 * resolved intent and through the registry, so the clamp keeps knowing nothing
 * about the intent layer beyond the shape it declared.
 */

import type { EraClass } from "@terrainist/spec";

import { registerFanOut } from "../intent/fanout.js";
import { BIOME_CELL } from "./landuse.js";
import type { ClimateIntent } from "./landuse.js";

/** Row ids owned by the terrain passes. */
export const TERRAIN_ROWS = {
  /** The `ClimateIntent` handed to the land-use clamp. */
  landUse: "climate.landUse",
  /** Offsets applied to the climate field over a footprint. */
  offsets: "climate.offsets",
  /** Width of the land-use clamp's feather band, in columns. */
  blend: "climate.blend",
  /** How green a settlement's own unbuilt ground is, as a share of ambient. */
  settlementGreenery: "terrain.settlementGreenery",
} as const;

/**
 * The closed set of interior undergrowth shares — a settlement's plant density
 * on its own unbuilt ground, as a fraction of the ambient wood outside it.
 *
 * Three values and no arithmetic, because this is a *weak* dial: it moves one
 * number that the feather ramp and the town green already share, and it moves
 * it by one notch either side of today. `tended` is exactly
 * `TOWN_GREEN_DENSITY`, so the default is not a coincidence — it is the same
 * constant, named.
 */
export const SETTLEMENT_GREENERY = Object.freeze({
  /** Swept, paved, municipal. */
  sparse: 0.25,
  /** Today's value: a yard somebody looks after. */
  tended: 0.5,
  /** Kitchen gardens, goats, and whatever seeded itself. */
  lush: 0.75,
});

/**
 * How green each era keeps its ground.
 *
 * Deliberately three buckets over seven eras. The read is about *groundskeeping
 * technology and habit*, not about wealth or climate: a medieval or primitive
 * settlement has no lawn, it has the ground between the houses plus whatever it
 * planted there, so it leans `lush`. A modern or far-future one paves, mows and
 * kerbs, so it leans `sparse` — the same closed set and the same reasoning as
 * `MODERN_FITTING_ERAS` in structures/themes-intent.ts. Everything in between
 * (ancient, renaissance, industrial) stays on today's value, because a defensible
 * argument in either direction exists and the dial is not worth a coin-flip.
 */
const GREENERY_BY_ERA: Readonly<Record<EraClass, number>> = Object.freeze({
  primitive: SETTLEMENT_GREENERY.lush,
  ancient: SETTLEMENT_GREENERY.tended,
  medieval: SETTLEMENT_GREENERY.lush,
  renaissance: SETTLEMENT_GREENERY.tended,
  industrial: SETTLEMENT_GREENERY.tended,
  modern: SETTLEMENT_GREENERY.sparse,
  far_future: SETTLEMENT_GREENERY.sparse,
});

/**
 * `intent.climate.blend` in **columns** of feather band.
 *
 * Walk-4's verdict was that the biome gradient needs a dial: some transitions
 * read as jarring and some want to be jarring (a walled city that stops dead at
 * its ditch). The mechanism is already there — the clamp's per-cell smoothstep
 * dither, whose width is a caller-supplied number of columns — so this only
 * makes the width authored.
 *
 * Every value is a whole number of {@link BIOME_CELL}s, because that is the
 * granularity the dither actually renders at: `sharp` is 4 cells, below today's
 * floor of 6 but still wide enough that the band is a gradient rather than a
 * ring; `soft` is 8 cells, the middle of today's size-scaled range; `wide` is
 * 16 cells, past its ceiling — a fade you walk for four seconds. Absent, the
 * clamp keeps scaling the band by the footprint's perimeter, so a document that
 * does not write the field compiles byte-identically.
 */
export const BLEND_FEATHER = Object.freeze({
  sharp: 4 * BIOME_CELL,
  soft: 8 * BIOME_CELL,
  wide: 16 * BIOME_CELL,
});

/** A temperature/humidity offset pair, in the climate field's own units. */
export interface ClimateOffsets {
  readonly temperature: number;
  readonly humidity: number;
}

/** Neither dial moved. The identity of {@link TERRAIN_ROWS.offsets}. */
export const NO_CLIMATE_OFFSET: ClimateOffsets = Object.freeze({ temperature: 0, humidity: 0 });

/** Register every terrain-owned row. */
export function registerTerrainFanOut(): void {
  /* --- intent.climate → the land-use clamp's rung 1 ----------------------- */
  registerFanOut<ClimateIntent | undefined>({
    id: TERRAIN_ROWS.landUse,
    reads: ["climate"],
    status: "today",
    drives: "biome + snow precedence rung 1 in terrain/landuse.ts",
    resolve(intent, ctx) {
      const climate = intent.intent.climate;
      if (climate === undefined) return ctx.today;
      const biome = climate.biome;
      const snow = climate.snow;
      if (biome === undefined && snow === undefined) return ctx.today;
      return {
        ...(biome === undefined ? {} : { biome }),
        ...(snow === undefined ? {} : { snow }),
      };
    },
  });

  /* --- intent.climate → field offsets ------------------------------------ */
  registerFanOut<ClimateOffsets>({
    id: TERRAIN_ROWS.offsets,
    reads: ["climate"],
    status: "today",
    drives: "temperature/humidity offsets into the climate field (terrain/climate.ts)",
    resolve(intent, ctx) {
      const climate = intent.intent.climate;
      if (climate === undefined) return ctx.today;
      const temperature = climate.temperature;
      const humidity = climate.humidity;
      if (temperature === undefined && humidity === undefined) return ctx.today;
      return {
        temperature: ctx.today.temperature + (temperature ?? 0),
        humidity: ctx.today.humidity + (humidity ?? 0),
      };
    },
  });

  /* --- intent.climate.blend → the clamp's feather width -------------------- */
  registerFanOut<number | undefined>({
    id: TERRAIN_ROWS.blend,
    reads: ["climate"],
    status: "today",
    drives: "width of the land-use clamp's biome feather band (terrain/landuse.ts)",
    resolve(intent, ctx) {
      // Law 2. `undefined` is today: the clamp scales the band by perimeter.
      const blend = intent.intent.climate?.blend;
      if (blend === undefined) return ctx.today;
      return BLEND_FEATHER[blend];
    },
  });

  /* --- era → how green the settlement's own ground is --------------------- */
  registerFanOut<number>({
    id: TERRAIN_ROWS.settlementGreenery,
    reads: ["era"],
    status: "today",
    drives:
      "interior undergrowth share: the town green's density and the settlement-edge feather's inner endpoint (terrain/vegetation.ts)",
    resolve(intent, ctx) {
      // Law 2. No `era`, today's constant — which is `SETTLEMENT_GREENERY.tended`
      // by construction, so a document without intent compiles byte-identically.
      if (!intent.eraDeclared) return ctx.today;
      return GREENERY_BY_ERA[intent.eraClass];
    },
  });
}

/**
 * Fan-out rows owned by the terrain passes.
 *
 * Two rows, and the important one is the hand-off: `landuse.ts` documented a
 * seam for `intent.climate` (precedence rung 1 of the biome contract) and left
 * it `undefined` for Phase 2 to fill. This is Phase 2 filling it, from the
 * resolved intent and through the registry, so the clamp keeps knowing nothing
 * about the intent layer beyond the shape it declared.
 */

import { registerFanOut } from "../intent/fanout.js";
import type { ClimateIntent } from "./landuse.js";

/** Row ids owned by the terrain passes. */
export const TERRAIN_ROWS = {
  /** The `ClimateIntent` handed to the land-use clamp. */
  landUse: "climate.landUse",
  /** Offsets applied to the climate field over a footprint. */
  offsets: "climate.offsets",
} as const;

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
}

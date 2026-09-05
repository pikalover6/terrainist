/**
 * `terrain.climate@0` — the per-column temperature and humidity fields.
 *
 * Both are plain fBm in `[0, 1]`, drawn from the node's **`climate` stream** so
 * that changing the terrain seed salt does not reshuffle the climate and vice
 * versa. `forceTheme` narrows both fields around a theme centre instead of
 * replacing them, so a "boreal" world still has warmer valleys and colder
 * ridges — it just never becomes a desert.
 */

import { clamp01, fbm2, seed32, streamSeed, type Seed256 } from "@terrainist/stdlib";
import type { ClimateParams, ClimateTheme } from "@terrainist/spec/ir";
import type { Region } from "@terrainist/stdlib";

/** Resolved `terrain.climate@0` parameters. */
export interface ResolvedClimateParams {
  readonly temperatureFrequency: number;
  readonly humidityFrequency: number;
  readonly blendRadius: number;
  readonly latitudeGradient: number;
  readonly forceTheme?: ClimateTheme;
}

/** §7 defaults for `terrain.climate@0`. */
export const CLIMATE_DEFAULTS: Readonly<ResolvedClimateParams> = Object.freeze({
  temperatureFrequency: 0.0012,
  humidityFrequency: 0.0015,
  blendRadius: 8,
  latitudeGradient: 0,
});

/** Theme centres: `[temperature, humidity]`, both in `[0, 1]`. */
export const THEME_CENTERS: Readonly<Record<ClimateTheme, readonly [number, number]>> =
  Object.freeze({
    boreal: [0.18, 0.55],
    temperate: [0.5, 0.5],
    arid: [0.82, 0.15],
    tropical: [0.88, 0.82],
  });

/** How far a forced theme still lets the noise wander from its centre. */
export const THEME_SPREAD = 0.12;

/** Octave settings shared by both climate channels. */
const CLIMATE_OCTAVES = { octaves: 3, lacunarity: 2, gain: 0.5 };

/** The materialized climate fields, one entry per column, row-major. */
export interface ClimateFields {
  readonly temperature: Float32Array;
  readonly humidity: Float32Array;
  readonly params: ResolvedClimateParams;
}

/** Fill in `terrain.climate@0` defaults. */
export function resolveClimateParams(partial: ClimateParams | undefined): ResolvedClimateParams {
  const p = partial ?? {};
  return {
    temperatureFrequency: p.temperatureFrequency ?? CLIMATE_DEFAULTS.temperatureFrequency,
    humidityFrequency: p.humidityFrequency ?? CLIMATE_DEFAULTS.humidityFrequency,
    blendRadius: p.blendRadius ?? CLIMATE_DEFAULTS.blendRadius,
    latitudeGradient: p.latitudeGradient ?? CLIMATE_DEFAULTS.latitudeGradient,
    ...(p.forceTheme === undefined ? {} : { forceTheme: p.forceTheme }),
  };
}

/**
 * Build the climate fields over `region`.
 *
 * @param node the `terrain.climate@0` node seed.
 */
export function buildClimateFields(
  region: Region,
  params: ResolvedClimateParams,
  node: Seed256,
): ClimateFields {
  const tSeed = seed32(streamSeed(node, "climate.temperature"));
  const hSeed = seed32(streamSeed(node, "climate.humidity"));
  const n = region.width * region.depth;
  const temperature = new Float32Array(n);
  const humidity = new Float32Array(n);

  const center = params.forceTheme ? THEME_CENTERS[params.forceTheme] : undefined;

  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    // The latitude bias is expressed per 1000 blocks of Z (§7).
    const latitude = (params.latitudeGradient * z) / 1000;
    for (let i = 0; i < region.width; i++) {
      const x = region.x0 + i;
      const idx = j * region.width + i;
      const tn = fbm2(tSeed, x, z, { ...CLIMATE_OCTAVES, frequency: params.temperatureFrequency });
      const hn = fbm2(hSeed, x, z, { ...CLIMATE_OCTAVES, frequency: params.humidityFrequency });
      if (center === undefined) {
        temperature[idx] = clamp01(0.5 + 0.5 * tn + latitude);
        humidity[idx] = clamp01(0.5 + 0.5 * hn);
      } else {
        temperature[idx] = clamp01(center[0] + THEME_SPREAD * tn + latitude);
        humidity[idx] = clamp01(center[1] + THEME_SPREAD * hn);
      }
    }
  }

  return { temperature, humidity, params };
}

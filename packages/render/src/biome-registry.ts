/**
 * Biome id → name for a pinned Minecraft version.
 *
 * The compiler's prismarine adapter resolves names *to* ids (that is all emit
 * needs); reading a world back needs the other direction, and rebuilding the
 * map here keeps this a render-only addition — the emit path is untouched, so
 * world bytes are unaffected.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface RawBiomeDef {
  readonly id: number;
  readonly name: string;
}

interface RawMinecraftData {
  readonly biomesByName: Record<string, RawBiomeDef | undefined>;
}

const cache = new Map<string, ReadonlyMap<number, string>>();

/** `{ id → "minecraft:<name>" }` for `version`, memoised per version. */
export function biomeNamesById(version: string): ReadonlyMap<number, string> {
  const cached = cache.get(version);
  if (cached !== undefined) return cached;

  const data = (require("minecraft-data") as (v: string) => RawMinecraftData | null)(version);
  if (data === null) {
    throw new Error(`render: minecraft-data has no version "${version}"`);
  }
  const map = new Map<number, string>();
  for (const def of Object.values(data.biomesByName)) {
    if (def === undefined) continue;
    map.set(def.id, `minecraft:${def.name}`);
  }
  cache.set(version, map);
  return map;
}

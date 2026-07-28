/**
 * Block → RGB colour for the top-down renderer.
 *
 * The colours themselves come from the vendored `voxel/palette.ts` table, so
 * the top-down map and the voxel views agree on what oak or cobble looks like —
 * there is exactly one palette in this package. What is added here is the
 * fallback: `appearanceOf` answers `DEFAULT_COLOR` for anything its table and
 * heuristics do not recognise, and painting every unknown block the same beige
 * hides structure. Those get a hash of their name instead — stable across runs
 * and machines, never random.
 */

import { DEFAULT_COLOR, appearanceOf, isRenderAir } from "./voxel/palette.js";

/** An 8-bit RGB triple. */
export type Rgb = readonly [number, number, number];

/** Namespace prefix that minecraft-data omits but callers may not. */
const NAMESPACE = "minecraft:";

/** Colour for a block id (namespaced or not, with or without a state suffix). */
export function blockColor(blockName: string): Rgb {
  const appearance = appearanceOf(blockName);
  // `heuristic()` returns the DEFAULT_COLOR array itself when nothing matched,
  // so identity is an exact "the palette had no opinion" test.
  if (appearance.color !== DEFAULT_COLOR) return appearance.color;
  return hashedColor(
    blockName.startsWith(NAMESPACE) ? blockName.slice(NAMESPACE.length) : blockName,
  );
}

/** True if this block should be treated as "nothing here" by a renderer. */
export function isAir(blockName: string): boolean {
  return isRenderAir(blockName);
}

/** FNV-1a (32-bit). Deterministic, well-spread, and trivially portable. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Map a name onto a mid-saturation, mid-value colour: distinct enough to read
 * as "some block", never so bright it is mistaken for a known material.
 */
function hashedColor(name: string): Rgb {
  const hash = fnv1a(name);
  const hue = hash % 360;
  // Two low bits of entropy for a little variety without going neon.
  const saturation = 0.4 + ((hash >>> 9) % 3) * 0.1; // 0.4 / 0.5 / 0.6
  const value = 0.5 + ((hash >>> 17) % 3) * 0.1; // 0.5 / 0.6 / 0.7
  return hsvToRgb(hue, saturation, value);
}

function hsvToRgb(hue: number, saturation: number, value: number): Rgb {
  const sector = hue / 60;
  const chroma = value * saturation;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = value - chroma;

  let r = 0;
  let g = 0;
  let b = 0;
  if (sector < 1) [r, g, b] = [chroma, second, 0];
  else if (sector < 2) [r, g, b] = [second, chroma, 0];
  else if (sector < 3) [r, g, b] = [0, chroma, second];
  else if (sector < 4) [r, g, b] = [0, second, chroma];
  else if (sector < 5) [r, g, b] = [second, 0, chroma];
  else [r, g, b] = [chroma, 0, second];

  return [
    Math.round((r + base) * 255),
    Math.round((g + base) * 255),
    Math.round((b + base) * 255),
  ];
}

/**
 * Every block name the vendoring should ask the texture table about.
 *
 * Three sources, unioned: the names `src/textures.js` lists outright, the
 * combinations its family rules can reach (species × part, dye × part, and the
 * shape suffixes on top of both), and the palettes of any world already
 * exported into `worlds/`. The last one is what keeps the vendored set honest
 * — a world on disk is the only evidence of which blocks the compiler really
 * emits.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { DYE_NAMES, EXACT_BLOCK_NAMES, WOOD_SPECIES } from "../src/textures.js";

const here = path.dirname(new URL(import.meta.url).pathname);

const WOOD_PARTS = [
  "planks",
  "log",
  "wood",
  "leaves",
  "door",
  "trapdoor",
  "sign",
  "fence",
  "fence_gate",
  "stairs",
  "slab",
  "button",
  "pressure_plate",
];

const DYE_PARTS = [
  "wool",
  "carpet",
  "concrete",
  "concrete_powder",
  "terracotta",
  "glazed_terracotta",
  "stained_glass",
  "stained_glass_pane",
  "bed",
  "banner",
  "wall_banner",
  "candle",
];

const SHAPES = ["stairs", "slab", "wall"];

/** The union described above, sorted and de-duplicated. */
export function blockNameUniverse(extra = []) {
  const names = new Set(EXACT_BLOCK_NAMES);
  for (const name of extra) names.add(name);
  for (const species of WOOD_SPECIES) {
    for (const part of WOOD_PARTS) {
      names.add(`${species}_${part}`);
      names.add(`stripped_${species}_${part}`);
    }
  }
  for (const dye of DYE_NAMES) {
    for (const part of DYE_PARTS) names.add(`${dye}_${part}`);
  }
  for (const base of [...names]) {
    for (const shape of SHAPES) names.add(`${base}_${shape}`);
  }
  return [...names].sort();
}

/** Palette entries of every export under `worlds/`. */
export async function exportedPalettes() {
  const worlds = path.join(here, "..", "worlds");
  if (!existsSync(worlds)) return [];
  const names = new Set();
  for (const entry of await readdir(worlds, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(worlds, entry.name, "manifest.json");
    if (!existsSync(manifest)) continue;
    const parsed = JSON.parse(await readFile(manifest, "utf8"));
    for (const name of parsed.palette ?? []) names.add(name);
  }
  return [...names].sort();
}

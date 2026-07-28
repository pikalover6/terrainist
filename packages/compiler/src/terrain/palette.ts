/**
 * Style palettes for the terrain profile.
 *
 * A palette symbol resolves to either a single block or a weighted `mix`. A
 * mix is resolved **per column by position-keyed hash**, never by a sequential
 * RNG draw — so a black-sand beach looks the same whether the compiler walked
 * the region row-major, chunk-major, or in parallel.
 */

import {
  positionWeighted,
  streamSeed,
  type Seed256,
} from "@terrainist/stdlib";
import type { PaletteValue, TerrainStyle } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";

/** The profile's default symbol table (`docs/LOAM-TERRAIN-PROFILE-v0.md`). */
export const DEFAULT_PALETTE: Readonly<Record<string, string>> = Object.freeze({
  "ground.bedrock": "minecraft:bedrock",
  "ground.stone": "minecraft:stone",
  "ground.surface": "minecraft:grass_block",
  "ground.subsurface": "minecraft:dirt",
  "ground.cliff": "minecraft:stone",
  "ground.beach": "minecraft:sand",
  "ground.underwater": "minecraft:gravel",
  "ground.peak": "minecraft:stone",
  "liquid.water": "minecraft:water",
  "liquid.lava": "minecraft:lava",
  "foliage.snow_layer": "minecraft:snow",
  "wood.spruce_log": "minecraft:spruce_log",
  "wood.spruce_leaves": "minecraft:spruce_leaves",
  "wood.oak_log": "minecraft:oak_log",
  "wood.oak_leaves": "minecraft:oak_leaves",
  "wood.birch_log": "minecraft:birch_log",
  "wood.birch_leaves": "minecraft:birch_leaves",
});

/** A palette symbol resolved down to block state ids. */
export type ResolvedSymbol =
  | { readonly kind: "single"; readonly stateId: number }
  | { readonly kind: "mix"; readonly stateIds: Int32Array; readonly weights: number[] };

/** Every symbol of a document, resolved against one Minecraft version. */
export class Palette {
  private readonly symbols: Map<string, ResolvedSymbol>;
  private readonly stream: Seed256;

  constructor(symbols: Map<string, ResolvedSymbol>, stream: Seed256) {
    this.symbols = symbols;
    this.stream = stream;
  }

  /** True when the symbol is defined. */
  has(symbol: string): boolean {
    return this.symbols.has(symbol);
  }

  /** The resolved entry, or throw — unknown symbols are a compiler bug. */
  entry(symbol: string): ResolvedSymbol {
    const found = this.symbols.get(symbol);
    if (found === undefined) throw new Error(`palette: undefined symbol "${symbol}"`);
    return found;
  }

  /**
   * The block state for `symbol` at column `(x, z)`. Single-block symbols
   * ignore the position; mixes hash it.
   */
  stateAt(symbol: string, x: number, z: number): number {
    const entry = this.entry(symbol);
    if (entry.kind === "single") return entry.stateId;
    const pick = positionWeighted(this.stream, x, 0, z, entry.weights);
    return entry.stateIds[pick] as number;
  }

  /** The block state for a symbol that is known to be a single block. */
  state(symbol: string): number {
    const entry = this.entry(symbol);
    if (entry.kind === "mix") return entry.stateIds[0] as number;
    return entry.stateId;
  }

  /** Symbol names, sorted — for the compile report. */
  names(): string[] {
    return [...this.symbols.keys()].sort();
  }
}

/** Anything wrong with a palette that only the block table can detect. */
export interface PaletteResolution {
  readonly palette: Palette;
  /** `symbol -> block name` pairs the block table did not recognize. */
  readonly unknownBlocks: readonly { readonly symbol: string; readonly block: string }[];
}

/**
 * Resolve the default symbol table plus any `style.palettes` overrides.
 *
 * @param stack the version-pinned block table.
 * @param style the document's `style` block, if any.
 * @param nodeSeedValue the root node's seed; the mix stream hangs off it.
 */
export function resolvePalette(
  stack: PrismarineStack,
  style: TerrainStyle | undefined,
  nodeSeedValue: Seed256,
): PaletteResolution {
  const merged: Record<string, PaletteValue> = { ...DEFAULT_PALETTE, ...(style?.palettes ?? {}) };
  const symbols = new Map<string, ResolvedSymbol>();
  const unknownBlocks: { symbol: string; block: string }[] = [];

  for (const symbol of Object.keys(merged).sort()) {
    const value = merged[symbol] as PaletteValue;
    if (typeof value === "string") {
      const block = stack.blockByName(value);
      if (block === undefined) {
        unknownBlocks.push({ symbol, block: value });
        continue;
      }
      symbols.set(symbol, { kind: "single", stateId: block.stateId });
      continue;
    }
    const stateIds: number[] = [];
    const weights: number[] = [];
    for (const [name, weight] of value.mix) {
      const block = stack.blockByName(name);
      if (block === undefined) {
        unknownBlocks.push({ symbol, block: name });
        continue;
      }
      stateIds.push(block.stateId);
      weights.push(weight);
    }
    if (stateIds.length === 0) continue;
    symbols.set(
      symbol,
      stateIds.length === 1
        ? { kind: "single", stateId: stateIds[0] as number }
        : { kind: "mix", stateIds: Int32Array.from(stateIds), weights },
    );
  }

  return { palette: new Palette(symbols, streamSeed(nodeSeedValue, "palette")), unknownBlocks };
}

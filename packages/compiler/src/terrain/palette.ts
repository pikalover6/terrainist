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
export const DEFAULT_PALETTE: Readonly<Record<string, PaletteValue>> = Object.freeze({
  "ground.bedrock": "minecraft:bedrock",
  "ground.stone": "minecraft:stone",
  "ground.surface": "minecraft:grass_block",
  "ground.subsurface": "minecraft:dirt",
  "ground.cliff": "minecraft:stone",
  "ground.beach": "minecraft:sand",
  "ground.underwater": "minecraft:gravel",
  "ground.peak": "minecraft:stone",
  // --- rock detail (G2.5b) -------------------------------------------------
  "ground.deepslate": "minecraft:deepslate",
  "ground.andesite": "minecraft:andesite",
  "ground.tuff": "minecraft:tuff",
  "ground.cobblestone": "minecraft:cobblestone",
  "ground.gravel": "minecraft:gravel",
  "ground.sand": "minecraft:sand",
  "ground.clay": "minecraft:clay",
  "ground.mud": "minecraft:mud",
  "ground.coarse_dirt": "minecraft:coarse_dirt",
  "ground.rooted_dirt": "minecraft:rooted_dirt",
  "ground.podzol": "minecraft:podzol",
  "ground.snow_block": "minecraft:snow_block",
  // --- volcanic ------------------------------------------------------------
  "ground.basalt": "minecraft:basalt",
  "ground.blackstone": "minecraft:blackstone",
  "ground.magma": "minecraft:magma_block",
  // --- caves (G5a) ---------------------------------------------------------
  // `cave_air` rather than `air`: Minecraft distinguishes the two for light
  // propagation and mob spawning, and it also gives the physics readback a way
  // to tell a carved interval from the sky above the terrain.
  "cave.air": "minecraft:cave_air",
  "cave.floor": "minecraft:dripstone_block",
  "cave.dripstone": "minecraft:pointed_dripstone",
  "cave.moss": "minecraft:moss_carpet",
  "cave.cobweb": "minecraft:cobweb",
  // --- ground cover --------------------------------------------------------
  "foliage.short_grass": "minecraft:short_grass",
  "foliage.tall_grass": "minecraft:tall_grass",
  "foliage.fern": "minecraft:fern",
  "foliage.dead_bush": "minecraft:dead_bush",
  "foliage.moss_carpet": "minecraft:moss_carpet",
  "foliage.brown_mushroom": "minecraft:brown_mushroom",
  "foliage.red_mushroom": "minecraft:red_mushroom",
  "foliage.sweet_berry_bush": "minecraft:sweet_berry_bush",
  "foliage.azalea": "minecraft:azalea",
  "foliage.lily_pad": "minecraft:lily_pad",
  "foliage.seagrass": "minecraft:seagrass",
  "foliage.tall_seagrass": "minecraft:tall_seagrass",
  "foliage.kelp": "minecraft:kelp",
  "foliage.kelp_plant": "minecraft:kelp_plant",
  "flower.poppy": "minecraft:poppy",
  "flower.dandelion": "minecraft:dandelion",
  "flower.cornflower": "minecraft:cornflower",
  "flower.oxeye_daisy": "minecraft:oxeye_daisy",
  "flower.azure_bluet": "minecraft:azure_bluet",
  "liquid.water": "minecraft:water",
  "liquid.lava": "minecraft:lava",
  "foliage.snow_layer": "minecraft:snow",
  "wood.spruce_log": "minecraft:spruce_log",
  "wood.spruce_leaves": "minecraft:spruce_leaves",
  "wood.oak_log": "minecraft:oak_log",
  "wood.oak_leaves": "minecraft:oak_leaves",
  "wood.birch_log": "minecraft:birch_log",
  "wood.birch_leaves": "minecraft:birch_leaves",
  // --- roads (G4b) ---------------------------------------------------------
  "road.surface": "minecraft:dirt_path",
  "road.shoulder": {
    mix: [
      ["minecraft:gravel", 3] as const,
      ["minecraft:cobblestone", 2] as const,
    ],
  },
  "road.step": "minecraft:stone_bricks",
  "road.subsurface": "minecraft:dirt",
  "road.post": "minecraft:oak_fence",
  "road.lantern": "minecraft:lantern",

  // --- the plaza (G4.5a) ---------------------------------------------------
  "plaza.path": "minecraft:dirt_path",
  "plaza.gravel": "minecraft:gravel",
  "plaza.cobble": "minecraft:cobblestone",
  "plaza.border": "minecraft:stone_bricks",
  "plaza.well_wall": "minecraft:cobblestone_wall",
});

/* -------------------------------------------------------------------------- */
/* urban street materials (U1)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The four symbols a **district street** is surfaced from.
 *
 * A rural lane and a downtown avenue used to be the same two blocks — dirt
 * path with a gravel verge — on the theory that "a player cannot tell the
 * difference". A player walked the headline city and told the difference
 * immediately. So a street has its own material class, chosen by the
 * segment's width class:
 *
 * - `carriageway` is the tarmac body of an avenue or a street;
 * - `carriageway.worn` is a second, close tone mixed in at a low positional
 *   frequency, so the road reads as patched asphalt rather than one flat slab;
 * - `marking` is the dashed centre line, painted on avenues only;
 * - `lane.surface` is what a back lane gets — older, rougher, no markings.
 *
 * These are **not** members of {@link DEFAULT_PALETTE}: their default depends
 * on the settlement's material theme, and the palette is resolved long before
 * a theme is drawn. The street pass asks the palette first (so
 * `style.palettes` still overrides everything) and falls back to the theme
 * table below. That is the same "symbol, else named default" idiom the
 * streetscape's `street.crossing.*` symbols already use.
 */
export interface StreetMaterials {
  readonly carriageway: string;
  readonly worn: string;
  readonly marking: string;
  readonly lane: string;
}

/** Palette symbol names for {@link StreetMaterials}, in the same order. */
export const STREET_CARRIAGEWAY_SYMBOL = "street.carriageway";
/** @see STREET_CARRIAGEWAY_SYMBOL */
export const STREET_CARRIAGEWAY_WORN_SYMBOL = "street.carriageway.worn";
/** @see STREET_CARRIAGEWAY_SYMBOL */
export const STREET_MARKING_SYMBOL = "street.marking";
/** @see STREET_CARRIAGEWAY_SYMBOL */
export const STREET_LANE_SYMBOL = "street.lane.surface";

/**
 * Concrete tarmac and painted lines — the modern default.
 *
 * Every block name here is checked against the pinned 1.21.11 block table by
 * a test, because a theme whose stair or slab variant does not exist in the
 * pinned version has bitten this codebase before.
 */
export const MODERN_STREET_MATERIALS: StreetMaterials = Object.freeze({
  carriageway: "minecraft:gray_concrete",
  worn: "minecraft:light_gray_concrete",
  marking: "minecraft:white_concrete",
  lane: "minecraft:cobblestone",
});

/**
 * Street materials per material theme id (`@terrainist/stdlib`'s themes).
 *
 * The rustic themes get stone, not concrete: a timber village with a poured
 * concrete avenue reads as two worlds spliced together. Each one keeps the
 * same *structure* — a body, a close second tone, a paler line, a rougher
 * back lane — so the wear mix and the centre line read identically whatever
 * the theme is.
 */
export const STREET_MATERIALS_BY_THEME: Readonly<Record<string, StreetMaterials>> =
  Object.freeze({
    // Cobbled market town: cobble body, mossy patching, a pale stone-brick
    // centre course, gravel back lanes.
    temperate_timber: Object.freeze({
      carriageway: "minecraft:cobblestone",
      worn: "minecraft:mossy_cobblestone",
      marking: "minecraft:stone_bricks",
      lane: "minecraft:gravel",
    }),
    // Northern pine: the local rock is deepslate, so the street is too.
    boreal_pine: Object.freeze({
      carriageway: "minecraft:cobbled_deepslate",
      worn: "minecraft:deepslate_bricks",
      marking: "minecraft:polished_diorite",
      lane: "minecraft:gravel",
    }),
    // Chalk downs: pale, dry, andesite-and-smooth-stone.
    birchwood_downs: Object.freeze({
      carriageway: "minecraft:andesite",
      worn: "minecraft:cobblestone",
      marking: "minecraft:smooth_stone",
      lane: "minecraft:coarse_dirt",
    }),
    modern_city: MODERN_STREET_MATERIALS,
  });

/** The street materials for a theme id; the modern set when it is unknown. */
export function streetMaterials(themeId: string | undefined): StreetMaterials {
  if (themeId === undefined) return MODERN_STREET_MATERIALS;
  return STREET_MATERIALS_BY_THEME[themeId] ?? MODERN_STREET_MATERIALS;
}

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
 * The `style.palettes` key that names a village material theme.
 *
 * It is the documented override for the settlement profile's theme draw, read
 * by `themeOverride` in the structure pass — and it is *not* a block symbol.
 * Exported so that the reader and the resolver share one name: when they did
 * not, `"theme": "modern_city"` resolved as a symbol, failed the block lookup
 * and produced a bogus LOAM-T106 on every document that used the documented
 * feature.
 */
export const PALETTE_THEME_KEY = "theme";

/**
 * `style.palettes` keys that carry something other than a block.
 *
 * The single source of truth for "this key is not a symbol". Anything listed
 * here is skipped by {@link resolvePalette} and belongs to whichever pass
 * declares it.
 */
export const NON_SYMBOL_PALETTE_KEYS: ReadonlySet<string> = new Set([PALETTE_THEME_KEY]);

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
    if (NON_SYMBOL_PALETTE_KEYS.has(symbol)) continue;
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

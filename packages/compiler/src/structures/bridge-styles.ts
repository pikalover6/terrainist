/**
 * The **three bridge styles** — `stone_bridge`, `timber_bridge`,
 * `suspension_bridge` — as variants of the one bridge kit.
 *
 * `docs/INFRA-ENTRIES-v0.md` §2 A settles what these are: *"the three bridges
 * are the bridge kit's, already a sweep client with piers, rails and
 * approaches, so they are profile variants and the cheapest three rows here"*.
 * So there is no new host, no new pass and no new geometry engine here — only
 * a **material set per style** and the small amount of extra section each style
 * adds over the kit's own deck / rail / pier:
 *
 * - **timber** is the kit as it has always built: a plank deck (a top slab, so
 *   it is flush with the lane at both banks), a fence rail and log piers. Its
 *   materials are the road states the palette already resolved, which is why a
 *   world that names no style at all builds exactly what it built before.
 * - **stone** swaps the wood family for the theme's *ground* masonry roles —
 *   `ground.slab` for the deck, `ground.coping` for a **solid** parapet,
 *   `ground.revetment` for the piers — and springs an arch haunch off each
 *   pier under the deck.
 * - **suspension** keeps the deck and rail, stands a tower over each abutment
 *   pier, runs a taut main cable of `iron_chain` between the tower tops and
 *   hangs the deck from it on chain hangers whose *lengths* trace the sag.
 *
 * ## Materials are the theme's, never a palette
 *
 * Every block below is resolved through a palette symbol whose value the theme
 * derived (`GROUND_ROLE_SYMBOLS`, `terrain/palette.ts`) or through the road
 * states, which are themselves symbol-resolved. Nothing here names a stone.
 * Where a symbol is absent the style falls back to the kit's own state rather
 * than to a hard-coded block, so a themeless world gets the kit, not grey.
 *
 * ## The chain law
 *
 * A suspension bridge is the one style that hangs something, and a floating
 * chain is the defect the `unsupported.chain` finding is named after. The
 * closure this module guarantees, and `bridges.test.ts` asserts: **every chain
 * block either has a chain or a solid block directly above it, or is a member
 * of a horizontal cable run that terminates in tower blocks at both ends.**
 */

import type { Palette } from "../terrain/palette.js";
import type { PrismarineStack } from "../emit/prismarine.js";

/** The three catalog ids, as the kit knows them. */
export type BridgeStyle = "stone" | "timber" | "suspension";

/** Catalog id ⇄ style, so a document may spell either. */
export const BRIDGE_STYLE_IDS: Readonly<Record<string, BridgeStyle>> = Object.freeze({
  stone: "stone",
  stone_bridge: "stone",
  timber: "timber",
  timber_bridge: "timber",
  wooden_bridge: "timber",
  suspension: "suspension",
  suspension_bridge: "suspension",
});

/**
 * The shortest span that gets stone.
 *
 * Below this a crossing is a creek, and a creek in a settlement is planked.
 */
export const STONE_MIN_SPAN = 10;

/**
 * The shortest span that gets a suspension bridge.
 *
 * A cable bridge is a *long* bridge — the towers and the sag need room to read,
 * and a suspension deck over a twelve-block river is a toy. Piers can carry an
 * arch this far; past it, nothing standing in the water can.
 */
export const SUSPENSION_MIN_SPAN = 28;

/** Blocks of tower standing above the deck at each abutment. */
export const BRIDGE_TOWER_HEIGHT = 8;

/** Columns of span between hangers. */
export const BRIDGE_HANGER_PITCH = 2;

/**
 * Head clearance kept under the lowest chain: the deck floor plus two air
 * blocks a player occupies, so a hanger can never make the deck untraversable.
 */
export const BRIDGE_HANGER_CLEARANCE = 3;

/**
 * Which style a span of `length` columns is built in.
 *
 * **The selection rule.** An explicitly requested style always wins — that is
 * the doc-facing spelling, and a document that asked for timber gets timber
 * over a chasm. Otherwise the span's own length decides, and nothing else does:
 * no seed, no draw, no theme. The same river recompiles to the same bridge, and
 * a longer river gets a bigger idea of a bridge.
 */
export function selectBridgeStyle(length: number, requested?: string): BridgeStyle {
  const named = requested === undefined ? undefined : BRIDGE_STYLE_IDS[requested];
  if (named !== undefined) return named;
  if (length >= SUSPENSION_MIN_SPAN) return "suspension";
  if (length >= STONE_MIN_SPAN) return "stone";
  return "timber";
}

/** The block states one style draws from. Every field is a resolved state id. */
export interface BridgeStyleStates {
  readonly style: BridgeStyle;
  /** The walking surface of the deck. Solid-topped, never water. */
  readonly deck: number;
  /** What stands on the parapet column: a fence, or a solid coping course. */
  readonly parapet: number;
  /** The founded column from the bed to the deck. */
  readonly pier: number;
  /** The arch haunch stone, or `undefined` for a style with no arch. */
  readonly haunch?: number;
  /** The tower standing over an abutment pier, or `undefined`. */
  readonly tower?: number;
  /** The cable and hanger block, or `undefined`. */
  readonly chain?: number;
}

/** All three styles, resolved once per pass. */
export interface BridgeStyleSet {
  readonly stone: BridgeStyleStates;
  readonly timber: BridgeStyleStates;
  readonly suspension: BridgeStyleStates;
  /** A style the document named for every crossing of this pass, if any. */
  readonly requested?: string;
}

/** The kit's own three states — what a style falls back to, field by field. */
export interface BridgeBaseStates {
  readonly deck: number;
  readonly post: number;
  readonly pier: number;
}

/**
 * Resolve the three styles against the palette the theme derived.
 *
 * `symbol` is asked first and the base state is the fallback, which is the same
 * precedence `resolveRoadStates` uses — `style.palettes` outranks the derived
 * roles (though intent's `character.palettes` merges over `style.palettes`
 * upstream: census `docs/STOCKTAKE-SLOP-CENSUS.md` §8, M5), a theme that derived
 * its ground roles gets its own masonry, and a world with neither gets the kit
 * unchanged.
 */
export function resolveBridgeStyles(
  palette: Palette,
  stack: PrismarineStack,
  base: BridgeBaseStates,
  requested?: string,
): BridgeStyleSet {
  const state = (symbol: string, fallback: number): number =>
    palette.has(symbol) ? palette.state(symbol) : fallback;
  /** The **top** half of a slab role, so a stone deck is flush like the wood one. */
  const topSlab = (symbol: string, fallback: number): number => {
    if (!palette.has(symbol)) return fallback;
    const name = stack.blockNameByStateId(palette.state(symbol));
    if (name === undefined) return palette.state(symbol);
    const bare = name.replace(/^minecraft:/, "");
    if (!bare.endsWith("_slab")) return fallback;
    return stack.blockStateOf(bare, { type: "top", waterlogged: "false" }) ?? fallback;
  };
  const chain =
    stack.blockStateOf("iron_chain", { axis: "y", waterlogged: "false" }) ??
    stack.blockByName("iron_chain")?.stateId ??
    stack.blockStateOf("chain", { axis: "y", waterlogged: "false" }) ??
    stack.blockByName("chain")?.stateId;
  const revetment = state("ground.revetment", base.pier);
  const timber: BridgeStyleStates = {
    style: "timber",
    deck: base.deck,
    parapet: base.post,
    pier: base.pier,
  };
  return {
    timber,
    stone: {
      style: "stone",
      deck: topSlab("ground.slab", base.deck),
      // A solid parapet, not a fence: masonry is what a stone bridge holds you
      // in with, and the coping role is the dressed course a theme caps its
      // masonry in.
      parapet: state("ground.coping", base.post),
      pier: revetment,
      haunch: revetment,
    },
    suspension: {
      style: "suspension",
      deck: base.deck,
      parapet: base.post,
      pier: revetment,
      tower: revetment,
      ...(chain === undefined ? {} : { chain }),
    },
    ...(requested === undefined ? {} : { requested }),
  };
}

/** The style states for one span, given the set and the span's own length. */
export function bridgeStatesFor(set: BridgeStyleSet, length: number): BridgeStyleStates {
  return set[selectBridgeStyle(length, set.requested)];
}

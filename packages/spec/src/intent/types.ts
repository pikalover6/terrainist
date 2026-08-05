/**
 * `SemanticIntent` — the author-facing dials (Phase 0 contract 1).
 *
 * Intent is **not** a generator and it places nothing. It is a *context* that
 * resolves to values the existing knobs already take: a material theme, a block
 * size, a roof form, a wear mix. The problem it exists to remove is the
 * two-islands case — a unicorn island and a pirate island in one world must
 * differ in palette, flora, props and architecture, and before this layer
 * nothing in a document said so except the archetype names the authoring model
 * happened to pick for each.
 *
 * Two laws govern everything downstream (see
 * `packages/compiler/src/intent/fanout.ts`):
 *
 * 1. The intent package never imports a subsystem. Rows are owned by the
 *    subsystem they drive and registered through one seam file.
 * 2. Every row is **total**: a document that declares no `intent` resolves to
 *    the values the code produces today, so the layer is byte-identical until
 *    an author uses it.
 *
 * Where it may appear: the document root, any `composite` region node, and
 * `district` / `city` nodes. **Not** a leaf building, prop or generator node —
 * intent is a context, and per-building overrides are what `params` are for
 * (`LOAM-W481`, ignored).
 */

import type { DistrictFabric } from "../settlement/types.js";
import type { PaletteValue } from "../terrain/types.js";

/**
 * A 0..1 dial.
 *
 * **Absent is never the same as 0.** Absent means "no opinion" and the fan-out
 * answers with today's value; `0` is an opinion (destitute, kept up, organic)
 * and the fan-out acts on it.
 */
export type Dial = number;

/**
 * The closed dispatch classes the fan-out switches on.
 *
 * `intent.era` itself stays an **open string** — §2.4 says so, and the
 * product's premise is wacky prompts. It is resolved once, through
 * {@link ERA_ALIASES}, to one of these; an unknown string is reported
 * (`LOAM-W480`) and defaults to {@link DEFAULT_ERA_CLASS}.
 */
export const ERA_CLASSES = [
  "primitive",
  "ancient",
  "medieval",
  "renaissance",
  "industrial",
  "modern",
  "far_future",
] as const;

/** One of {@link ERA_CLASSES}. */
export type EraClass = (typeof ERA_CLASSES)[number];

/**
 * What an unrecognised era string resolves to.
 *
 * `medieval` because it is our densest archetype coverage, so the failure mode
 * of a word we do not know is "generic", not "empty".
 */
export const DEFAULT_ERA_CLASS: EraClass = "medieval";

/**
 * The closed alias table from an open `era` string to an {@link EraClass}.
 *
 * Deliberately small and boring. It is a *dispatch* table, not a thesaurus:
 * anything it misses lands on {@link DEFAULT_ERA_CLASS} with a warning, which
 * is a world that reads generic rather than a world that fails to compile.
 */
export const ERA_ALIASES: Readonly<Record<string, EraClass>> = Object.freeze({
  primitive: "primitive",
  prehistoric: "primitive",
  stone_age: "primitive",
  neolithic: "primitive",
  tribal: "primitive",

  ancient: "ancient",
  antiquity: "ancient",
  classical: "ancient",
  roman: "ancient",
  greek: "ancient",
  egyptian: "ancient",
  bronze_age: "ancient",
  iron_age: "ancient",

  medieval: "medieval",
  dark_ages: "medieval",
  feudal: "medieval",
  viking: "medieval",
  norse: "medieval",
  fantasy: "medieval",
  high_fantasy: "medieval",

  renaissance: "renaissance",
  baroque: "renaissance",
  tudor: "renaissance",
  early_modern: "renaissance",
  colonial: "renaissance",
  age_of_sail: "renaissance",
  pirate: "renaissance",

  industrial: "industrial",
  victorian: "industrial",
  steam: "industrial",
  steampunk: "industrial",
  frontier: "industrial",
  wild_west: "industrial",

  modern: "modern",
  contemporary: "modern",
  present_day: "modern",
  art_deco: "modern",
  brutalist: "modern",
  near_future: "modern",
  cyberpunk: "modern",

  far_future: "far_future",
  futuristic: "far_future",
  space_age: "far_future",
  scifi: "far_future",
  sci_fi: "far_future",
  alien: "far_future",
});

/** Kinds of one-off event a region can be dressed as having lived through. */
export const EVENT_KINDS = ["flood", "fire", "siege", "boom"] as const;

/** One of {@link EVENT_KINDS}. */
export type EventKind = (typeof EVENT_KINDS)[number];

/** A one-off event the region is dressed as having lived through. */
export interface IntentEvent {
  readonly kind: EventKind;
  readonly severity: Dial;
  /** 0 = it is happening now, 1 = a lifetime ago and mostly healed. */
  readonly recency: Dial;
}

/** How `intent.climate.snow` may resolve. */
export const SNOW_POLICIES = ["auto", "never", "always"] as const;

/** One of {@link SNOW_POLICIES}. */
export type SnowIntent = (typeof SNOW_POLICIES)[number];

/**
 * Explicit author intent about the ground's climate.
 *
 * Precedence rung 1 of the biome contract (§4): an author who says "this island
 * is tropical" outranks the land-use clamp and the climate-derived rule alike.
 */
export interface ClimateIntent {
  /** A vanilla biome id, or a `style.biomeThemes` id. Outranks everything. */
  readonly biome?: string;
  /** −1..1, offsets the climate field over this node's footprint. */
  readonly temperature?: number;
  /** −1..1, likewise for humidity. */
  readonly humidity?: number;
  readonly snow?: SnowIntent;
}

/** The closed motif enums the building grammar switches on (§2.4 `motifs`). */
export const ROOF_TYPES = ["gable", "hip", "flat", "dome", "shed", "mansard"] as const;

/** One of {@link ROOF_TYPES}. */
export type RoofType = (typeof ROOF_TYPES)[number];

/** How a building's mass is arranged. */
export const MASSING_STYLES = ["blocky", "stepped", "towered", "sprawling"] as const;

/** One of {@link MASSING_STYLES}. */
export type MassingStyle = (typeof MASSING_STYLES)[number];

/** How windows march across a facade. */
export const WINDOW_RHYTHMS = ["sparse", "regular", "dense", "banded"] as const;

/** One of {@link WINDOW_RHYTHMS}. */
export type WindowRhythm = (typeof WINDOW_RHYTHMS)[number];

/** §2.4 `motifs` — the closed enums the building grammar switches on. */
export interface Motifs {
  readonly roofType?: RoofType;
  readonly massing?: MassingStyle;
  readonly windowRhythm?: WindowRhythm;
  /** 0..1 — how much decoration a facade carries. */
  readonly ornamentDensity?: Dial;
}

/** A prefer/forbid pair over some named vocabulary. */
export interface SelectionBias {
  readonly prefer?: readonly string[];
  readonly forbid?: readonly string[];
}

/** {@link SelectionBias} plus explicit weights, for archetype mixes. */
export interface ArchetypeBias extends SelectionBias {
  readonly weights?: Readonly<Record<string, number>>;
}

/**
 * Authored programs this region asks for (contract 2, Phase 3).
 *
 * Carried by the type now so a document written today keeps its meaning when
 * Phase 3 lands; the fan-out row for it is registered as a **reserved no-op**.
 */
export interface ProgramRequest {
  /** How many landmark-mode programs this region would like. */
  readonly landmarks?: number;
  /** How many plugin-mode programs, each invoked N times. */
  readonly plugins?: number;
  /** Free-text briefs handed to the program author, one per program. */
  readonly briefs?: readonly string[];
}

/**
 * The unicorn-island-vs-pirate-island case: everything that makes a region read
 * as a different place, in one object, at one scope.
 *
 * Ratified disposition 9: `character` is **canonical**; `style.biomeThemes`
 * stays as the power-user hatch.
 */
export interface CharacterIntent {
  /** Free text, e.g. "pirate haven". Reaches prompts, never a switch. */
  readonly label?: string;
  /** A stdlib `MaterialTheme` id (`packages/stdlib/src/structures/themes.ts`). */
  readonly materialTheme?: string;
  /** Merged over the document's `style.palettes` within this node's subtree. */
  readonly palettes?: Readonly<Record<string, PaletteValue>>;
  readonly archetypes?: ArchetypeBias;
  readonly props?: SelectionBias;
  readonly flora?: SelectionBias;
  readonly motifs?: Motifs;
  readonly programs?: ProgramRequest;
  /**
   * The urban form every quarter in scope is drawn with
   * (`docs/URBAN-FORMS-v0.md` §6.1).
   *
   * One of `DISTRICT_FABRICS`. This is the key the classifier writes when the
   * prompt says "canal town" or "hill town", and it is the only route by which
   * a *compiler-chosen* quarter — a city cell — gets anything but the frozen
   * `CELL_FABRIC` table. Outranked by an explicit `params.fabric`; an unknown
   * value is `LOAM-W487`, a warning naming the legal ids, never a silent drop.
   */
  readonly urbanForm?: DistrictFabric;
}

/** The author-facing dials. Every field is optional; absent means no opinion. */
export interface SemanticIntent {
  /** Open vocabulary per §2.4; dispatched through {@link EraClass}. */
  readonly era?: string;
  /** 0 = destitute, 0.5 = ordinary, 1 = rich. */
  readonly wealth?: Dial;
  /** 0 = kept up, 1 = abandoned. Orthogonal to wealth: a rich ruin exists. */
  readonly decline?: Dial;
  /** 0 = organic vernacular, 1 = planned and monumental. */
  readonly formality?: Dial;
  readonly event?: IntentEvent;
  readonly climate?: ClimateIntent;
  readonly character?: CharacterIntent;
  /** Open extension bag, per §2.7. Never switched on by stdlib code. */
  readonly tokens?: Readonly<Record<string, string | number | boolean>>;
}

/** Keys a `SemanticIntent` object may carry. */
export const INTENT_KEYS = [
  "era",
  "wealth",
  "decline",
  "formality",
  "event",
  "climate",
  "character",
  "tokens",
] as const;

/** Keys a {@link CharacterIntent} may carry. */
export const CHARACTER_KEYS = [
  "label",
  "materialTheme",
  "palettes",
  "archetypes",
  "props",
  "flora",
  "motifs",
  "programs",
  "urbanForm",
] as const;

/** The key an intent object hangs off a node under. */
export const INTENT_KEY = "intent";

/**
 * Node kinds that may carry `intent`.
 *
 * The document root is included by way of its `composite` root node; a
 * document-level `intent` beside `style` is world scope.
 */
export const INTENT_NODE_KINDS = ["composite", "district", "city"] as const;

/** Depth (world = 0) past which `LOAM-I482` reports the table is thinner. */
export const INTENT_TABLE_DEPTH = 2;

/** Resolve an open `era` string to its {@link EraClass}, or `undefined`. */
export function eraClassOf(era: string | undefined): EraClass | undefined {
  if (era === undefined) return undefined;
  const key = era.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ERA_ALIASES[key];
}

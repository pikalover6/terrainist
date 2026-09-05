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

import type { DistrictFabric, DistrictGroundPolicy } from "../settlement/types.js";
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

/** The material themes an author may name in `character.materialTheme`. */
export const MATERIAL_THEME_IDS = [
  "temperate_timber",
  "boreal_pine",
  "birchwood_downs",
  "modern_city",
  "white_quartz",
  "sun_clay",
  "xeno_resin",
] as const;

/** One of {@link MATERIAL_THEME_IDS}. */
export type MaterialThemeId = (typeof MATERIAL_THEME_IDS)[number];

/**
 * One form-pack as the author sees it: ID, human name, classifier thesis, era affinities.
 *
 * This is the **author-visible** slice of the form-pack registry. The spec owns it
 * because it is the vocabulary the classifier is taught and the validator names;
 * the stdlib owns the pack's **implementation** slice — the members, the
 * theme/character advice, the palette — and builds its full `FORM_PACKS` registry
 * by joining this catalog with that implementation data. The compiler owns
 * resolution. See `packages/stdlib/src/structures/form-packs.ts` for the join.
 */
export interface FormPackSpec {
  readonly id: string;
  readonly name: string;
  readonly thesis: string;
  readonly eras: readonly EraClass[];
}

/**
 * The author-visible form-pack catalog — IDs, names, theses and era affinities.
 *
 * Order is the registry order. Every entry's `thesis` is the exact line the
 * classifier prompt is taught, so the prompt text is a pure function of this
 * table. Members, themes and characters are **not** here; they live in
 * `@terrainist/stdlib`.
 */
export const FORM_PACK_SPECS: readonly FormPackSpec[] = Object.freeze([
  Object.freeze({
    id: "classical_mediterranean",
    name: "Classical Mediterranean",
    thesis:
      "colonnades, stoas, peristyle courts, temples, a citadel megaron — antiquity as FORMS. Troy, Athens, a Roman forum, a Hellenist waterfront.",
    eras: Object.freeze(["ancient"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "nautical_pirate",
    name: "Nautical & Pirate",
    thesis:
      "the SHORE rather than the fleet: jolly roger, gallows on the point, careened hulls, shore batteries, a chain across the harbour mouth.",
    eras: Object.freeze(["renaissance", "industrial"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "arcane_magical",
    name: "Arcane & Magical",
    thesis:
      "a magical PLACE: rune circles in the ground, ley markers along the paths, a mage academy, stabling for winged mounts.",
    eras: Object.freeze(["medieval", "ancient"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "alien_scifi",
    name: "Alien & Sci-fi",
    thesis:
      "an invasion's fabric: crop circles, quarantine lines, field labs, barricades, hive mounds, blast doors.",
    eras: Object.freeze(["modern", "far_future"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "agrarian",
    name: "Agrarian",
    thesis:
      "the countryside BETWEEN the fields: hedgerows, dry stone walls, byres, dairies, hay barns, middens.",
    eras: Object.freeze(["medieval", "renaissance", "industrial"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "wilds_camps",
    name: "Wilds & Camps",
    thesis:
      "extraction in the wilderness: logging camps, flumes, sawpits, log booms, fire lookouts, cut-over ground.",
    eras: Object.freeze(["medieval", "renaissance", "industrial"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "frontier_west",
    name: "Frontier West",
    thesis:
      "the wild west town the industrial era does not give you: false-front saloons, boardwalks, assay offices, livery stables, a mission church.",
    eras: Object.freeze(["industrial"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "nile_egypt",
    name: "Nile & Ancient Egypt",
    thesis:
      "pyramids, hypostyle halls, pylon gates, mastabas, an avenue of sphinxes — the one silhouette everybody knows.",
    eras: Object.freeze(["ancient"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "east_asian",
    name: "East Asian",
    thesis:
      "the PUBLIC forms around the houses: torii, moon gates, paifang arches, dry gardens, a tiered castle keep.",
    eras: Object.freeze(["medieval", "renaissance"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "mesoamerican_jungle",
    name: "Mesoamerican Jungle",
    thesis:
      "maya/aztec in the rainforest: step pyramids with a stair up the face, ball courts, stelae, a caracol, sacbes, thatch dwellings.",
    eras: Object.freeze(["ancient"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "nordic_viking",
    name: "Nordic & Viking",
    thesis:
      "vikings/norse/fjords: mead halls with the fire down the middle, a chieftain's high seat, longship sheds on the water, turf houses, a heathen hof, rune stones, boat burials, fish drying racks.",
    eras: Object.freeze(["medieval"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "dwarven_volcanic",
    name: "Dwarven & Volcanic",
    thesis:
      "a dwarven hold in the black rock: a great forge with the furnace pit down its middle, a monumental hold gate, a pillared deep hall, smelters, a gem cuttery, a stone brewhouse, miners' dormitories, a rune forge, a cart depot, a king's treasury behind bars and a worked cavern shrine.",
    eras: Object.freeze(["ancient", "medieval"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "steppe_nomad",
    name: "Steppe Nomad",
    thesis:
      "mongols/nomads/the open grass: round felt gers with a crown ring at the top, a khan's ger on its dais, a ger on a cart, kumis tents, horse lines, a felt works, a bowyer, borts racks, an ovoo cairn, a horsetail standard and a wrestling ground.",
    eras: Object.freeze(["medieval"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "swamp_witch",
    name: "Swamp Witch",
    thesis:
      "witches/bogs/fens/the marsh: huts up on stilt posts over the wet, herb drying lofts, a bog apothecary, a chapel the bog pulled over, eel smokehouses, moss cottages, leech pools, a candle workshop, a fortune teller, a coven stone circle and bone charm racks.",
    eras: Object.freeze(["medieval"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "atlantean",
    name: "Atlantean",
    thesis:
      "atlantis/a sunken city risen/a drowned empire on dry land: a tidal palace colonnaded in prismarine and quartz, a trident temple, a domed sea oracle, a conch amphitheatre, a pearl divers' hall, hippocamp stables, a monumental tide gate over a water channel, coral garden courts, a navigators' academy, salt baths, a water-stained archive, a tide bell hung on iron chain, a moon pool, a leviathan altar and the fallen fragment of a bronze colossus.",
    eras: Object.freeze(["ancient"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "desert_caravanserai",
    name: "Desert Caravanserai",
    thesis:
      "a silk road oasis/a caravan town/a desert serai: an arcaded serai court with traders' cells round it, a gatehouse wide enough for a loaded animal, a qanat wellhead, houses with wind towers on their heads, a spice godown, camel lines, an arcade of shaded stalls, a date store, a cistern, a dye yard, a glassblower's kiln, a domed shrine at the spring, a watch minaret, date palm groves and stacked caravan loads.",
    eras: Object.freeze(["medieval"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "himalayan_monastery",
    name: "Himalayan Monastery",
    thesis:
      "a mountain monastery/a dzong/a lamasery on a ridge/tibet/the himalaya: a battered whitewashed assembly hall banded in dark timber and gold, a gallery of prayer wheels, a chorten at the gate, a butter tea kitchen, monks' cells, a scripture library, a yak byre, a bell cote, a debating yard, a hermit's retreat, a kora gatehouse, a granary up on stone stilts, an incense kiln, prayer flag lines and mani stone cairns.",
    eras: Object.freeze(["medieval"] as const as readonly EraClass[]),
  }),
  Object.freeze({
    id: "feudal_japanese",
    name: "Feudal Japanese",
    thesis:
      "a samurai castle town/a sengoku village/an edo street/feudal japan: a white keep on a stone batter banded in dark timber, a terrace of machiya shop-houses, a five-storey pagoda, a vermilion gate on the shrine approach, a dojo, a hot-spring bathhouse, a stage for the plays, a raked gravel court, a plastered rice store up on stilts, a four-mat tea room, a swordsmith, a corner turret with the alarm bell and a box gate, with stone lanterns, koi ponds and nobori banners.",
    eras: Object.freeze(["medieval"] as const as readonly EraClass[]),
  }),
] as const);

/** Every legal pack word, in registry order. */
export const FORM_PACK_IDS = Object.freeze(FORM_PACK_SPECS.map((p) => p.id));

/** The pack id → thesis table, exactly as the classifier is shown it. */
export const FORM_PACK_THESES: readonly (readonly [string, string])[] = Object.freeze(
  FORM_PACK_SPECS.map((p) => [p.id, p.thesis] as const),
);


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
 * How wide the biome transition around a settlement's ground reads.
 *
 * A closed vocabulary rather than a column count, for the same reason
 * `intent.climate.snow` is: an author saying "this desert town should fade
 * into the dunes" is expressing a *look*, not a measurement, and a raw width
 * invites numbers the dither cannot render (a band narrower than a stored
 * biome cell is a hard seam whatever the author meant). Three names, mapped by
 * the compiler to whole stored-cell counts. Omitted means today's behaviour:
 * the band is scaled by the footprint's perimeter.
 */
export const BLEND_WIDTHS = ["sharp", "soft", "wide"] as const;

/** One of {@link BLEND_WIDTHS}. */
export type BlendWidth = (typeof BLEND_WIDTHS)[number];

/**
 * Explicit author intent about the ground's climate.
 *
 * Precedence rung 1 of the biome contract (§4): an author who says "this island
 * is tropical" outranks the land-use clamp and the climate-derived rule alike.
 */
export interface ClimateIntent {
  /** A vanilla biome id (ids outside the profile's palette raise `LOAM-W472` at compile). Outranks everything. */
  readonly biome?: string;
  /** −1..1, offsets the climate field over this node's footprint. */
  readonly temperature?: number;
  /** −1..1, likewise for humidity. */
  readonly humidity?: number;
  readonly snow?: SnowIntent;
  /**
   * How wide the settlement's biome transition band is. Omitted = today's
   * perimeter-scaled width.
   */
  readonly blend?: BlendWidth;
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

/**
 * The unicorn-island-vs-pirate-island case: everything that makes a region read
 * as a different place, in one object, at one scope.
 *
 * Ratified disposition 9: `character` is **canonical**; the `style.biomeThemes`
 * power-user hatch was never built (the validator accepts only `style.palettes`;
 * its phantom mentions were removed from model-facing text 2026-08-24).
 */
export interface CharacterIntent {
  /** Free text, e.g. "pirate haven". Reaches prompts, never a switch. */
  readonly label?: string;
  /** A stdlib `MaterialTheme` id (`packages/stdlib/src/structures/themes.ts`). */
  readonly materialTheme?: string;
  /** Merged over the document's `style.palettes` within this node's subtree. */
  readonly palettes?: Readonly<Record<string, PaletteValue>>;
  readonly props?: SelectionBias;
  readonly flora?: SelectionBias;
  /**
   * Form packs this scope draws its building vocabulary from
   *
   * The **fourth grounded list**, beside {@link archetypes}, {@link props} and
   * {@link flora}, and deliberately a list rather than a new
   * `architecturalStyle` dial: a style is not a scalar, it is *a set of nouns*,
   * and a second scalar beside `era` would be a second place to say "Troy" and
   * one place for the two to contradict each other.
   *
   * One word buys a whole form vocabulary — `"classical_mediterranean"` names
   * the colonnade, the peristyle and the stoa the way `sun_clay` names the
   * palette, and a prompt from antiquity wants both. A pack expands, at
   * fan-out time, to its **fabric-eligible members** (the catalog's implemented
   * *building* entries); props and infrastructure never enter a lot draw.
   *
   * Precedence, one order and stated once: `archetypes.forbid` > explicit
   * `archetypes.prefer` > `formPacks` expansion > the mix the quarter was about
   * to use. A pack is a *default vocabulary*, so an author who names a specific
   * archetype always outranks the pack that also contains it.
   *
   * Inheritance is the array rule every other list keeps: a scope that writes
   * `formPacks` **replaces** the inherited list whole, it does not add to it.
   *
   * Grounded against the stdlib `FORM_PACKS` registry: an unknown word is one
   * aggregated `LOAM-W516`, never a fatal. A pack whose eras do not include the
   * scope's resolved era class is `LOAM-W517` — advice, never a gate, because a
   * modern Hellenist city is the legal case. **No pack is ever implied by an
   * era**: a document that names none compiles byte-identically.
   */
  readonly formPacks?: readonly string[];
  readonly motifs?: Motifs;
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
] as const;

/** Keys a {@link CharacterIntent} may carry. */
export const CHARACTER_KEYS = [
  "label",
  "materialTheme",
  "palettes",
  "props",
  "flora",
  "formPacks",
  "motifs",
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

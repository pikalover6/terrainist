import { FORM_PACK_SPECS } from "@terrainist/spec/ir";

/**
 * `FORM_PACKS` — the named form vocabularies a document reaches for by word.
 *
 * ## Why this registry exists
 *
 * The Troy walk is the lesson : the
 * `sun_clay` theme did its job — sandstone, plaster, pale flat roofs — and the
 * world still did not read as Troy, because **the palette was right and every
 * form was borrowed**. A medieval townhouse in sandstone is a medieval
 * townhouse. Themes, motifs and eras are *modifiers*; the noun is the
 * archetype, and the catalog's nouns cluster in the medieval-village corner the
 * project started in.
 *
 * A **form pack** is the missing noun-set: a named group of catalog entries
 * answering one culture, era or genre, shipped and accepted together. It
 * carries
 *
 * - a **thesis** — one line naming what a prompt in this space cannot currently
 *   say. It is not decoration: this exact line is what the classifier pre-pass
 *   is taught, and it is therefore the whole reachability path from ordinary
 *   prompt language to the pack;
 * - its **members**, catalog ids;
 * - its **affinity** — `eras`, `themes`, `characters`. Affinity is **advice,
 *   never a gate** (§4.3). It reaches exactly two places: the classifier's
 *   prompt, and one warning (`LOAM-W517`) when a scope's resolved era class is
 *   not among a named pack's eras. A modern Hellenist city — era `modern` plus
 *   `classical_mediterranean` — is precisely the legal case that must not be
 *   blocked, so this can never be an error.
 *
 * ## What is deliberately *not* here
 *
 * **No status.** Whether a member can be built is the catalog's answer and only
 * the catalog's: expansion asks `structureById` at fan-out time, so a member
 * that is `not_started` today contributes nothing and lights up with no further
 * wiring the day its generator lands. Duplicating status here would be a second
 * source of truth that can disagree with the first.
 *
 * **No sizes.** Size classes (`XS`…`XL`, `LIN`) are a curator's column in the
 * expansion document and are not a field of `StructureEntry`; the design's
 * "members whose size class the quarter's lots can hold" therefore degrades, for
 * now, to "the pack's implemented *buildings*" — props and infrastructure never
 * enter a lot draw regardless. When a size class becomes a catalog field the
 * filter tightens in `mix-intent.ts` and nothing here changes.
 *
 * **No expansion.** This file is data. The expansion order — `forbid` >
 * explicit `prefer` > pack > the mix the quarter was about to use — is stated
 * once, in `packages/compiler/src/layout/mix-intent.ts`.
 *
 * ## Ids
 *
 * Pack ids are as stable as catalog ids: they are words an author and a
 * classifier write, so a rename is a migration. Member ids are checked against
 * the catalog by `test/form-packs.test.ts` — a member no catalog row carries is
 * a typo, and a typo in a member list is invisible at runtime (it simply never
 * expands), which is exactly the silent failure the test exists to prevent.
 */

/** One named form vocabulary. */
export interface FormPack {
  /** The word an author or the classifier writes. Stable forever. */
  readonly id: string;
  /** Human-facing name, for the catalog artifact and the kit. */
  readonly name: string;
  /**
   * One line naming what a prompt in this space cannot currently say.
   *
   * Taught verbatim to the classifier pre-pass, so it is written for a model
   * reading nine of them in a row: what the pack is *for*, not what it contains.
   */
  readonly thesis: string;
  /** Era classes this pack sits naturally in. Advice; `LOAM-W517`, never a gate. */
  readonly eras: readonly string[];
  /** Material themes that flatter it. Advice only — the palette is never forced. */
  readonly themes: readonly string[];
  /** District characters it belongs to. Advice only. */
  readonly characters: readonly string[];
  /**
   * The pack's catalog ids, in the expansion document's order.
   *
   * Every kind, not just buildings: the list is the pack's *inventory*, and the
   * fabric-eligibility filter is applied at expansion time by the consumer.
   */
  readonly members: readonly string[];
}

/**
 * The packs every pack shipped
 * since (the Mesoamerican jungle pack is the first of those).
 *
 * Order is the document's. Every member list is that section's table, with one
 * deliberate omission recorded here rather than silently: **`sphinx` was
 * ratified out of the Nile pack** (2026-08-11) — a recumbent sculpt is bespoke-
 * tier work, not fabric, and `sphinx_avenue` carries the icon at street level.
 */
/**
 * The packs every pack shipped
 * since (the Mesoamerican jungle pack is the first of those).
 *
 * Order is the document's. Every member list is that section's table, with one
 * deliberate omission recorded here rather than silently: **`sphinx` was
 * ratified out of the Nile pack** (2026-08-11) — a recumbent sculpt is bespoke-
 * tier work, not fabric, and `sphinx_avenue` carries the icon at street level.
 *
 * The author-visible slice (id, name, thesis, eras) is owned by `@terrainist/spec`
 * (`FORM_PACK_SPECS`); this file owns the implementation slice (members, themes,
 * characters) and joins the two. The split keeps the classifier vocabulary single-
 * sourced while leaving block and palette data where the generators live.
 */
const PACK_IMPL: Readonly<
  Record<string, { readonly themes: readonly string[]; readonly characters: readonly string[]; readonly members: readonly string[] }>
> = Object.freeze({
  classical_mediterranean: Object.freeze({
    themes: Object.freeze(["sun_clay", "white_quartz"]),
    characters: Object.freeze(["civic", "core", "waterfront"]),
    members: Object.freeze([
      "stoa",
      "peristyle_house",
      "megaron",
      "propylaea",
      "bouleuterion",
      "peripteral_temple",
      "tholos",
      "sanctuary_treasury",
      "palaestra",
      "gymnasion",
      "odeon",
      "hippodrome_spina",
      "agora_colonnade",
      "triumphal_arch",
      "rostra",
      "herm_post",
      "votive_column",
      "column_drums",
      "ship_shed",
      "trireme",
      "nymphaeum",
      "acropolis_terrace",
      "olive_press",
      "pithos_store",
    ]),
  }),
  nautical_pirate: Object.freeze({
    themes: Object.freeze(["boreal_pine", "temperate_timber"]),
    characters: Object.freeze(["waterfront", "lanes"]),
    members: Object.freeze([
      "jolly_roger_mast",
      "gallows",
      "gibbet_cage",
      "careening_beach",
      "beached_wreck",
      "cannon_battery",
      "powder_magazine",
      "martello_tower",
      "chandlery",
      "sail_loft",
      "fish_drying_rack",
      "salt_house",
      "treasure_cache",
      "smugglers_landing",
      "capstan",
      "treadwheel_crane",
      "anchor_stack",
      "daymark",
      "harbour_chain_tower",
      "whalebone_arch",
    ]),
  }),
  arcane_magical: Object.freeze({
    themes: Object.freeze(["white_quartz", "temperate_timber"]),
    characters: Object.freeze(["civic", "lanes", "park"]),
    members: Object.freeze([
      "rune_circle",
      "ley_marker",
      "crystal_outcrop",
      "arcane_academy",
      "summoning_hall",
      "arcane_library",
      "scrying_pool",
      "blossom_shrine",
      "pegasus_stable",
      "unicorn_paddock",
      "arcane_orrery",
      "floating_stair",
      "warded_gate",
      "spirit_lantern_row",
      "dragon_skeleton",
      "moon_dial",
    ]),
  }),
  alien_scifi: Object.freeze({
    themes: Object.freeze(["modern_city"]),
    characters: Object.freeze(["core", "industrial", "grid"]),
    members: Object.freeze([
      "crop_circle",
      "quarantine_fence",
      "containment_tent",
      "field_lab_trailer",
      "sensor_mast",
      "dish_array",
      "xeno_spire",
      "hive_mound",
      "bio_pod_cluster",
      "crash_furrow",
      "barricade_line",
      "sandbag_emplacement",
      "mobile_command_post",
      "blast_door",
      "hydroponics_bay",
      "sentry_turret",
      "airlock_vestibule",
      "maglev_pylon",
      "derelict_mech",
    ]),
  }),
  agrarian: Object.freeze({
    themes: Object.freeze(["temperate_timber", "birchwood_downs"]),
    characters: Object.freeze(["lanes", "rowhouse"]),
    members: Object.freeze([
      "hedgerow",
      "dry_stone_wall",
      "field_gate",
      "cart_track",
      "cow_byre",
      "duck_pond",
      "midden_heap",
      "dutch_barn",
      "smokehouse",
      "dairy",
      "sheep_dip",
      "wool_shed",
      "staddle_granary",
      "hop_yard",
      "stock_pens",
      "well_sweep",
    ]),
  }),
  wilds_camps: Object.freeze({
    themes: Object.freeze(["boreal_pine"]),
    characters: Object.freeze(["industrial", "lanes"]),
    members: Object.freeze([
      "logging_camp",
      "log_flume",
      "log_landing",
      "sawpit",
      "river_log_boom",
      "fire_lookout_tower",
      "stump_field",
      "rope_bridge",
      "waystation",
      "hunting_lodge",
      "spar_pole",
      "hunters_cache",
    ]),
  }),
  frontier_west: Object.freeze({
    themes: Object.freeze(["temperate_timber", "boreal_pine"]),
    characters: Object.freeze(["lanes", "rowhouse"]),
    members: Object.freeze([
      "false_front_saloon",
      "boardwalk",
      "water_tank_trestle",
      "assay_office",
      "stamp_mill",
      "sluice_box",
      "placer_claim",
      "telegraph_office",
      "livery_stable",
      "wagon_shop",
      "mission_church",
      "cantina",
      "boot_hill_row",
      "dugout_shanty",
    ]),
  }),
  nile_egypt: Object.freeze({
    themes: Object.freeze(["sun_clay"]),
    characters: Object.freeze(["civic", "core"]),
    members: Object.freeze([
      "pyramid",
      "mastaba",
      "hypostyle_hall",
      "mortuary_temple",
      "pylon_gate",
      "sphinx_avenue",
      "nilometer",
      "sacred_lake",
      "mudbrick_granary",
      "felucca",
      "canopic_shrine",
    ]),
  }),
  east_asian: Object.freeze({
    themes: Object.freeze(["temperate_timber", "white_quartz"]),
    characters: Object.freeze(["civic", "lanes", "park"]),
    members: Object.freeze([
      "torii",
      "moon_gate",
      "paifang",
      "zen_garden",
      "tenshu_keep",
      "castle_base_wall",
      "drum_tower",
      "shoji_teahouse",
      "spirit_wall",
      "stone_lantern",
      "dragon_boat",
      "bell_pavilion",
    ]),
  }),
  mesoamerican_jungle: Object.freeze({
    themes: Object.freeze(["sun_clay", "white_quartz"]),
    characters: Object.freeze(["civic", "core"]),
    members: Object.freeze([
      "step_pyramid",
      "jaguar_temple",
      "serpent_stair",
      "stela_plaza",
      "ball_court",
      "round_observatory",
      "palace_range",
      "market_ramada",
      "tzompantli_rack",
      "chultun_cistern",
      "sacbe_terminus",
      "milpa_terrace",
      "canoe_landing",
      "thatch_dwelling",
      "temazcal_bath",
    ]),
  }),
  nordic_viking: Object.freeze({
    themes: Object.freeze(["boreal_pine", "temperate_timber"]),
    characters: Object.freeze(["waterfront", "lanes", "civic"]),
    members: Object.freeze([
      "norse_mead_hall",
      "jarls_hall",
      "longship_shed",
      "turf_house",
      "stave_belfry",
      "norse_forge",
      "hof_shrine",
      "fishermans_cabin",
      "weaving_hall",
      "shield_wall_gate",
      "palisade_watchtower",
      "norse_storehouse",
      "wool_shed_norse",
      "rune_stone",
      "boat_burial_mound",
      "drying_rack_yard",
    ]),
  }),
  dwarven_volcanic: Object.freeze({
    themes: Object.freeze(["white_quartz", "sun_clay"]),
    characters: Object.freeze(["core", "civic", "industrial"]),
    members: Object.freeze([
      "great_forge",
      "dwarf_hold_gate",
      "deep_hall",
      "smelter_works",
      "gem_cutter_workshop",
      "stone_brewhouse",
      "miners_dormitory",
      "tool_vault",
      "rune_forge_shrine",
      "cart_depot",
      "ore_assay_hall",
      "stone_bath_house",
      "beacon_brazier_tower",
      "kings_treasury",
      "stalactite_shrine",
    ]),
  }),
  steppe_nomad: Object.freeze({
    themes: Object.freeze(["sun_clay", "temperate_timber"]),
    characters: Object.freeze(["lanes", "park", "civic"]),
    members: Object.freeze([
      "ger_round_tent",
      "khans_ger",
      "cart_ger",
      "kumis_tent",
      "horse_line",
      "felt_workshop",
      "bowyer_tent",
      "caravan_rest",
      "wrestling_ground",
      "watch_platform_steppe",
      "borts_rack",
      "winter_corral",
      "khan_banner_pole",
      "shaman_ovoo",
      "balbal_stone",
    ]),
  }),
  swamp_witch: Object.freeze({
    themes: Object.freeze(["temperate_timber", "boreal_pine"]),
    characters: Object.freeze(["lanes", "park", "core"]),
    members: Object.freeze([
      "witch_stilt_hut",
      "herb_drying_loft",
      "bog_apothecary",
      "fen_chapel_ruin",
      "eel_smokehouse",
      "moss_cottage",
      "fen_landing_stage",
      "leech_pools",
      "candle_workshop",
      "black_goat_pen",
      "fortune_tellers_tent",
      "mangrove_root_cellar",
      "coven_stone_circle",
      "bone_charm_rack",
      "waterlogged_shrine",
    ]),
  }),
  atlantean: Object.freeze({
    themes: Object.freeze(["white_quartz", "sun_clay"]),
    characters: Object.freeze(["civic", "waterfront", "core"]),
    members: Object.freeze([
      "tidal_palace",
      "trident_temple",
      "sea_oracle_rotunda",
      "conch_amphitheater",
      "pearl_diver_hall",
      "hippocamp_stable",
      "tide_gate_arch",
      "coral_garden_court",
      "navigator_academy",
      "salt_bath_terme",
      "drowned_archive",
      "tide_bell_tower",
      "moon_pool_shrine",
      "leviathan_altar",
      "bronze_colossus_fragment",
    ]),
  }),
  desert_caravanserai: Object.freeze({
    themes: Object.freeze(["sun_clay", "white_quartz"]),
    characters: Object.freeze(["lanes", "core", "civic"]),
    members: Object.freeze([
      "serai_court",
      "caravan_gatehouse",
      "qanat_wellhead",
      "windcatcher_house",
      "spice_godown",
      "camel_lines",
      "shade_arcade_row",
      "date_store_tower",
      "serai_cistern",
      "dye_yard",
      "desert_glass_kiln",
      "oasis_shrine",
      "watch_minaret",
      "date_palm_grove",
      "caravan_pack_stack",
    ]),
  }),
  himalayan_monastery: Object.freeze({
    themes: Object.freeze(["boreal_pine", "white_quartz"]),
    characters: Object.freeze(["civic", "core", "lanes"]),
    members: Object.freeze([
      "dzong_hall",
      "prayer_wheel_gallery",
      "chorten_shrine",
      "butter_tea_kitchen",
      "monk_cell_row",
      "scripture_library",
      "yak_byre",
      "dzong_bell_cote",
      "debate_courtyard",
      "hermit_retreat",
      "kora_gatehouse",
      "stilt_granary",
      "incense_kiln",
      "prayer_flag_line",
      "mani_stone_cairn",
    ]),
  }),
  feudal_japanese: Object.freeze({
    themes: Object.freeze(["temperate_timber", "white_quartz"]),
    characters: Object.freeze(["lanes", "civic", "core"]),
    members: Object.freeze([
      "yamashiro_tenshu",
      "machiya_shop_row",
      "gojunoto_pagoda",
      "sando_torii",
      "dojo_hall",
      "onsen_bathhouse",
      "noh_stage",
      "karesansui_court",
      "kura_storehouse",
      "chashitsu_teahouse",
      "kaji_forge",
      "yagura_watchtower",
      "masugata_gate",
      "toro_lantern",
      "koi_pond",
      "nobori_banner_line",
    ]),
  }),
});

export const FORM_PACKS: readonly FormPack[] = Object.freeze(
  FORM_PACK_SPECS.map((spec) =>
    Object.freeze({
      id: spec.id,
      name: spec.name,
      thesis: spec.thesis,
      eras: spec.eras,
      themes: PACK_IMPL[spec.id]!.themes,
      characters: PACK_IMPL[spec.id]!.characters,
      members: PACK_IMPL[spec.id]!.members,
    }),
  ),
);

/** Every legal pack word, in registry order. */
export function formPackIds(): readonly string[] {
  return FORM_PACKS.map((p) => p.id);
}

/**
 * The pack a word names, or `undefined`.
 *
 * Normalising — `"Classical Mediterranean"` and `"classical-mediterranean"`
 * both find the pack — for the same reason the intent grounding normalises:
 * these words are written by a language model reading a prose list, and a
 * capital letter is not an authoring error worth a silent drop. It is *not* a
 * thesaurus: a word that is not a spelling of a pack id finds nothing.
 */
export function formPackById(id: string): FormPack | undefined {
  const wanted = id.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return FORM_PACKS.find((p) => p.id === wanted);
}

/**
 * A pack's members, or the empty list for a word no pack carries.
 *
 * The default member lookup the mix expansion uses. Unfiltered: eligibility is
 * the consumer's rule, not the registry's.
 */
export function formPackMembers(id: string): readonly string[] {
  return formPackById(id)?.members ?? [];
}

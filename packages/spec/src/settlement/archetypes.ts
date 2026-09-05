/**
 * The building-archetype vocabulary — the author-visible set of building
 * archetypes.
 *
 * `spec` owns the identifiers; `stdlib` attaches the grammar, dispatch and
 * fit-out to them. `stdlib` imports this list and satisfies it exhaustively
 * rather than restating it. The list exists for exactly one caller: a
 * `district` node's `mix`, which is a list of archetype names and is the only
 * place in the authoring surface where an archetype is named as a *value*
 * rather than implied by tags. Getting one wrong there is silent and
 * expensive — the infill would fall back to a cottage and the author would
 * never be told — so it is an error with near-misses attached.
 */

/**
 * Every archetype the building grammar knows, in declaration order.
 *
 * Order is load-bearing only for the near-miss suggestions below, which break
 * ties on it so the same typo always suggests the same three names.
 */
export const KNOWN_BUILDING_ARCHETYPES = [
  "cottage", "hall", "inn", "smithy",
  "granary", "watchtower", "church", "barn",
  "windmill", "warehouse", "market_stall", "library",
  "bakery", "keep", "gatehouse", "barracks",
  "pagoda", "wizard_tower", "observatory", "greenhouse",
  "gym", "mausoleum", "windpump", "town_hall",
  "school", "bathhouse", "tavern", "general_store",
  "apothecary", "alpine_chalet", "saltbox_house", "dutch_gable_house",
  "tudor_row", "mediterranean_villa", "trullo", "courthouse",
  "post_office", "infirmary", "sawmill", "kiln",
  "tannery", "stable", "silo", "dovecote",
  "chicken_coop", "apiary", "hop_kiln", "cider_press",
  "root_cellar_mound", "witch_hut", "mushroom_house", "hobbit_hole",
  "gingerbread_cottage", "farmstead", "pigsty", "sheepfold",
  "cattle_pen", "orchard", "vineyard", "terraced_field",
  "threshing_floor", "marketplace",
  // The nautical & pirate pack's buildings, in the order `BUILDING_ARCHETYPES`
  // spreads them — immediately after the agrarian pack. Order is load-bearing
  // here, same as every other pack block.
  "salt_house", "treadwheel_crane",
  // The wilds & camps pack's buildings (CATALOG-EXPANSION §3.6), in the order
  // `BUILDING_ARCHETYPES` spreads them — immediately after the nautical pack.
  "fire_lookout_tower", "waystation", "hunting_lodge",
  // The agrarian expansion pack's buildings (CATALOG-EXPANSION §3.5), in the
  // order `BUILDING_ARCHETYPES` spreads them — immediately after the wilds
  // pack.
  "cow_byre", "dutch_barn", "smokehouse", "dairy", "wool_shed",
  // The frontier West pack's buildings (CATALOG-EXPANSION §3.7), in the order
  // `BUILDING_ARCHETYPES` spreads them — immediately after the agrarian
  // expansion pack.
  "false_front_saloon", "assay_office", "stamp_mill", "telegraph_office",
  "livery_stable", "wagon_shop", "mission_church", "cantina",
  "dugout_shanty",
  "brewery", "distillery",
  "butchery",
  "tea_house", "trading_post", "pawnshop", "cooperage",
  "glassworks", "papermill", "textile_mill", "cannery",
  "foundry", "museum", "guildhall", "prison",
  "police_station", "fire_station", "hospital", "workhouse",
  "orphanage", "mint", "customs_house", "bank",
  "counting_house", "theater", "opera_house", "cinema",
  "dance_hall", "boxing_gym", "sauna", "ski_lodge",
  "clubhouse", "glass_pavilion", "convenience_store", "laboratory",
  "lecture_hall", "farmhouse", "townhouse", "terraced_row",
  "manor_house", "mansion", "longhouse", "bungalow",
  "hut", "log_cabin", "courtyard_house", "dormitory",
  "almshouse", "shopping_mall", "department_store", "food_court",
  "auction_house", "caravanserai", "spice_market", "shop_row",
  "university_hall", "embassy", "council_chamber", "boarding_house",
  "gate_lodge", "train_station", "signal_box", "roundhouse",
  "coach_house", "toll_house", "transit_hub", "control_tower",
  "airport_terminal", "boathouse", "shipyard", "lighthouse",
  "climbing_wall", "brickworks", "blast_furnace_works", "factory_hall",
  "machine_shop", "refinery", "charcoal_burner", "ropewalk",
  "parking_garage", "gas_station", "data_center", "conference_center",
  "brutalist_block", "water_tower", "cistern", "well",
  "pumping_station", "substation", "gasworks", "steam_plant",
  "biomass_shed", "battery_shed", "coal_tipple", "castle",
  "barbican", "bastion", "armory", "arsenal",
  "bunker", "pillbox", "guard_post", "checkpoint",
  "beacon_tower", "gravedigger_hut", "shepherds_bothy",
  // The siegeworks pack, in the order `BUILDING_ARCHETYPES` spreads it —
  // straight after the garrison and before the science wave. This list is
  // asserted to equal the grammar's list exactly, so its ORDER is load-bearing.
  "star_fort", "motte_and_bailey", "palisade", "moat",
  "drawbridge", "drill_yard", "siege_camp",
  // The classical Mediterranean pack's buildings, in the order
  // `BUILDING_ARCHETYPES` spreads them — immediately after the siegeworks.
  // Order is load-bearing here, same as every other pack block.
  "ship_shed", "nymphaeum", "olive_press",
  "telescope_dome",
  "planetarium", "alchemy_lab", "herbarium", "aviary",
  "botanical_garden", "seed_vault", "weather_station", "field_station",
  "penthouse", "atrium_block", "modern_villa", "alchemists_tower",
  "dragon_roost", "crystal_shrine", "dwarven_gate", "beacon_spire",
  "cenotaph", "war_memorial", "urn_wall", "remembrance_arch",
  "pyre_platform", "bathing_pavilion", "servants_quarters", "ruined_cottage",
  "ruined_keep", "ruined_church", "collapsed_tower", "overgrown_villa",
  "big_top", "hall_of_mirrors", "funhouse", "dodgems_pavilion",
  "aquarium", "hedge_maze", "cathedral", "monastery",
  "abbey", "cloister", "hermitage", "mosque",
  "synagogue", "stupa", "ziggurat", "bell_tower",
  "minaret", "tomb",
  // The sanctum pack, in the order `BUILDING_ARCHETYPES` spreads it —
  // straight after the faith wave. Order is load-bearing, same as siegeworks.
  "temple", "chapel", "shrine", "altar_stone", "wayside_cross",
  "obelisk", "colossus", "amphitheater", "arena", "stadium",
  // The arcane & magical pack (CATALOG-EXPANSION §3.3), in the order
  // `BUILDING_ARCHETYPES` spreads it — straight after the sanctum. Order is
  // load-bearing here, same as every other pack block.
  "arcane_academy", "summoning_hall", "arcane_library", "blossom_shrine",
  "pegasus_stable",
  // The East Asian pack (CATALOG-EXPANSION §3.9), in the order
  // `BUILDING_ARCHETYPES` spreads it — straight after the arcane pack. Order
  // is load-bearing here, same as every other pack block.
  "tenshu_keep", "drum_tower", "shoji_teahouse", "bell_pavilion",
  // The classical Mediterranean pack, in the order `BUILDING_ARCHETYPES`
  // spreads it — straight after the sanctum. Order is load-bearing, same as
  // siegeworks.
  "stoa", "peristyle_house", "megaron", "propylaea", "bouleuterion",
  "peripteral_temple", "tholos", "sanctuary_treasury", "palaestra",
  "gymnasion", "odeon",
  // The alien & sci-fi pack's organic half (CATALOG-EXPANSION §3.4), in the
  // order `BUILDING_ARCHETYPES` spreads it — straight after the classical
  // pack. Order is load-bearing here, same as every other pack block.
  "xeno_spire", "hive_mound", "hydroponics_bay",
  // The nautical & pirate pack's buildings (CATALOG-EXPANSION §3.2), in the
  // order `BUILDING_ARCHETYPES` spreads it — straight after the alien pack.
  // Order is load-bearing here, same as every other pack block.
  "powder_magazine", "martello_tower", "chandlery", "sail_loft",
  // The Nile & ancient Egypt pack (CATALOG-EXPANSION §3.8), in the order
  // `BUILDING_ARCHETYPES` spreads it — straight after the nautical pack.
  // Order is load-bearing here, same as every other pack block. §3.8's
  // `pyramid` is deliberately absent: it is a PROP, not an archetype.
  "mastaba", "hypostyle_hall", "mortuary_temple", "pylon_gate",
  "nilometer", "mudbrick_granary", "canopic_shrine",
  "hanok", "machiya",
  "riad", "cycladic_house", "adobe_pueblo", "stilt_house",
  "sod_house", "igloo", "thatched_roundhouse", "colonial_veranda_house",
  "hacienda", "fachwerk_barn", "skyscraper", "office",
  "hotel", "apartment_block", "mine_head", "bunker_complex",
  "subway_station", "underground_silo",
  // --- nordic_viking pack ---------------------------------------------------
  // The Nordic & Viking pack's buildings, in the order `BUILDING_ARCHETYPES`
  // spreads them — after the depths wave and BEFORE the terrace, which is where
  // that list spreads them. Order is load-bearing here, same as every other
  // pack block. The pack's `rune_stone`, `boat_burial_mound` and
  // `drying_rack_yard` are deliberately absent: all three are PROPS.
  "norse_mead_hall", "jarls_hall", "longship_shed", "turf_house",
  "stave_belfry", "norse_forge", "hof_shrine", "fishermans_cabin",
  "weaving_hall", "shield_wall_gate", "palisade_watchtower", "norse_storehouse",
  "wool_shed_norse",
  // The terrace, last for the same reason it is last in `stdlib`: it is the
  // newest wave, and this list's order is `BUILDING_ARCHETYPES`'s order.
  "terrace",
  // --- mesoamerican_jungle pack -------------------------------------------
  // The Mesoamerican jungle pack, LAST, because `BUILDING_ARCHETYPES` spreads
  // it last: this list mirrors that one element for element and the seam is
  // pinned by `fabric.test.ts`.
  "step_pyramid", "jaguar_temple", "serpent_stair", "stela_plaza",
  "ball_court", "round_observatory", "palace_range", "market_ramada",
  "tzompantli_rack", "chultun_cistern", "sacbe_terminus", "milpa_terrace",
  "canoe_landing", "thatch_dwelling", "temazcal_bath",
  // --- dwarven_volcanic pack ----------------------------------------------
  // The Dwarven & Volcanic pack, LAST, because `BUILDING_ARCHETYPES` spreads
  // it last: this list mirrors that one element for element and the seam is
  // pinned by `fabric.test.ts`. The pack ships no props, so nothing of it
  // appears in `SETTLEMENT_PROP_NAMES`.
  "great_forge", "dwarf_hold_gate", "deep_hall", "smelter_works",
  "gem_cutter_workshop", "stone_brewhouse", "miners_dormitory", "tool_vault",
  "rune_forge_shrine", "cart_depot", "ore_assay_hall", "stone_bath_house",
  "beacon_brazier_tower", "kings_treasury", "stalactite_shrine",
  // --- steppe_nomad pack --------------------------------------------------
  // The Steppe Nomad pack, LAST, because `BUILDING_ARCHETYPES` spreads it
  // last: this list mirrors that one element for element and the seam is
  // pinned by `fabric.test.ts`. The pack's `khan_banner_pole`, `shaman_ovoo`
  // and `balbal_stone` are deliberately absent: all three are PROPS.
  "ger_round_tent", "khans_ger", "cart_ger", "kumis_tent",
  "horse_line", "felt_workshop", "bowyer_tent", "caravan_rest",
  "wrestling_ground", "watch_platform_steppe", "borts_rack", "winter_corral",
  // --- swamp_witch pack ---------------------------------------------------
  // The Swamp Witch pack, LAST, because `BUILDING_ARCHETYPES` spreads it last:
  // this list mirrors that one element for element and the seam is pinned by
  // `fabric.test.ts`. The pack's `coven_stone_circle`, `bone_charm_rack` and
  // `waterlogged_shrine` are deliberately absent: all three are PROPS.
  "witch_stilt_hut", "herb_drying_loft", "bog_apothecary", "fen_chapel_ruin",
  "eel_smokehouse", "moss_cottage", "fen_landing_stage", "leech_pools",
  "candle_workshop", "black_goat_pen", "fortune_tellers_tent",
  "mangrove_root_cellar",
  // --- atlantean pack -----------------------------------------------------
  // The Atlantean pack, LAST, because `BUILDING_ARCHETYPES` spreads it last:
  // this list mirrors that one element for element and the seam is pinned by
  // `fabric.test.ts`. The pack's `leviathan_altar` and
  // `bronze_colossus_fragment` are deliberately absent: both are PROPS.
  "tidal_palace", "trident_temple", "sea_oracle_rotunda", "conch_amphitheater",
  "pearl_diver_hall", "hippocamp_stable", "tide_gate_arch",
  "coral_garden_court", "navigator_academy", "salt_bath_terme",
  "drowned_archive", "tide_bell_tower", "moon_pool_shrine",
  // --- desert_caravanserai pack -------------------------------------------
  // The desert_caravanserai pack, LAST, because `BUILDING_ARCHETYPES` spreads
  // it last: this list mirrors that one element for element and the seam is
  // pinned by `fabric.test.ts`. The pack's `date_palm_grove` and
  // `caravan_pack_stack` are deliberately absent: both are PROPS.
  "serai_court", "caravan_gatehouse", "qanat_wellhead", "windcatcher_house",
  "spice_godown", "camel_lines", "shade_arcade_row", "date_store_tower",
  "serai_cistern", "dye_yard", "desert_glass_kiln", "oasis_shrine",
  "watch_minaret",
  // --- himalayan_monastery pack -------------------------------------------
  // The himalayan_monastery pack, LAST, because `BUILDING_ARCHETYPES` spreads
  // it last: this list mirrors that one element for element and the seam is
  // pinned by `fabric.test.ts`. The pack's `prayer_flag_line` and
  // `mani_stone_cairn` are deliberately absent: both are PROPS.
  "dzong_hall", "prayer_wheel_gallery", "chorten_shrine", "butter_tea_kitchen",
  "monk_cell_row", "scripture_library", "yak_byre", "dzong_bell_cote",
  "debate_courtyard", "hermit_retreat", "kora_gatehouse", "stilt_granary",
  "incense_kiln",
  // --- feudal_japanese pack -----------------------------------------------
  // The feudal_japanese pack, LAST, because `BUILDING_ARCHETYPES` spreads it
  // last: this list mirrors that one element for element and the seam is
  // pinned by `fabric.test.ts`. The pack's `toro_lantern`, `koi_pond` and
  // `nobori_banner_line` are deliberately absent: all three are PROPS.
  "yamashiro_tenshu", "machiya_shop_row", "gojunoto_pagoda", "sando_torii",
  "dojo_hall", "onsen_bathhouse", "noh_stage", "karesansui_court",
  "kura_storehouse", "chashitsu_teahouse", "kaji_forge", "yagura_watchtower",
  "masugata_gate",
] as const;

/** A building archetype name, as the authoring surface spells it. */
export type KnownBuildingArchetype = (typeof KNOWN_BUILDING_ARCHETYPES)[number];

/** True for a name the building grammar dispatches on. */
export function isKnownArchetype(name: string): name is KnownBuildingArchetype {
  return (KNOWN_BUILDING_ARCHETYPES as readonly string[]).includes(name);
}

/**
 * Levenshtein distance, capped — the near-miss metric.
 *
 * Capped because the only question asked of it is "is this within two edits",
 * and an uncapped distance over a 226-entry vocabulary for every bad name is
 * work nobody reads.
 */
export function editDistance(a: string, b: string, cap = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(
        (prev[j] as number) + 1,
        (curr[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      curr[j] = v;
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length] as number;
}

/** How many suggestions a near-miss list carries. */
export const ARCHETYPE_SUGGESTIONS = 3;

/**
 * The closest archetype names to `name`, best first.
 *
 * Substring containment counts as one edit's worth of closeness, so
 * `"apartment"` suggests `"apartment_block"` before anything the raw edit
 * distance would rank higher. Ties break on the vocabulary's own order, which
 * is what makes the suggestion list reproducible.
 */
export function nearestArchetypes(name: string, limit = ARCHETYPE_SUGGESTIONS): string[] {
  const needle = name.toLowerCase();
  const scored: { name: string; score: number; index: number }[] = [];
  for (const [index, candidate] of KNOWN_BUILDING_ARCHETYPES.entries()) {
    const contains = candidate.includes(needle) || needle.includes(candidate);
    const distance = editDistance(needle, candidate);
    const score = contains ? Math.min(distance, 1) : distance;
    if (score > 3) continue;
    scored.push({ name: candidate, score, index });
  }
  scored.sort((a, b) => (a.score !== b.score ? a.score - b.score : a.index - b.index));
  return scored.slice(0, limit).map((s) => s.name);
}

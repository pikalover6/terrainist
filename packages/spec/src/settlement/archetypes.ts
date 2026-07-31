/**
 * The building-archetype vocabulary, restated for the validator.
 *
 * `stdlib` owns the archetypes — `BUILDING_ARCHETYPES` there is what the
 * grammar actually dispatches on. `spec` sits *below* `stdlib` in the
 * dependency graph and cannot import it, so it restates the handful of grammar
 * constants it validates against; `HIGHRISE_TAGS` and `WING_MIN_OVERLAP` are
 * the precedent. `packages/compiler/test/fabric.test.ts` is where the two
 * lists are pinned to each other, because the compiler is the first package
 * that can see both.
 *
 * The list exists for exactly one caller: a `district` node's `mix`, which is a
 * list of archetype names and is the only place in the authoring surface where
 * an archetype is named as a *value* rather than implied by tags. Getting one
 * wrong there is silent and expensive — the infill would fall back to a
 * cottage and the author would never be told — so it is an error with
 * near-misses attached.
 */

/**
 * Every archetype the building grammar knows, in `stdlib`'s declaration order.
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
  "gingerbread_cottage", "brewery", "distillery", "butchery",
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
  "beacon_tower", "gravedigger_hut", "shepherds_bothy", "telescope_dome",
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
  "minaret", "tomb", "hanok", "machiya",
  "riad", "cycladic_house", "adobe_pueblo", "stilt_house",
  "sod_house", "igloo", "thatched_roundhouse", "colonial_veranda_house",
  "hacienda", "fachwerk_barn", "skyscraper", "office",
  "hotel", "apartment_block", "mine_head", "bunker_complex",
  "subway_station", "underground_silo",
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

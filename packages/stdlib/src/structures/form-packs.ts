/**
 * `FORM_PACKS` — the named form vocabularies a document reaches for by word.
 *
 * ## Why this registry exists
 *
 * The Troy walk is the lesson (`docs/CATALOG-EXPANSION-v0.md` §1): the
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
 * The packs of `docs/CATALOG-EXPANSION-v0.md` §3, plus every pack shipped
 * since (the Mesoamerican jungle pack is the first of those).
 *
 * Order is the document's. Every member list is that section's table, with one
 * deliberate omission recorded here rather than silently: **`sphinx` was
 * ratified out of the Nile pack** (2026-08-11) — a recumbent sculpt is bespoke-
 * tier work, not fabric, and `sphinx_avenue` carries the icon at street level.
 */
export const FORM_PACKS: readonly FormPack[] = Object.freeze([
  Object.freeze({
    id: "classical_mediterranean",
    name: "Classical Mediterranean",
    thesis:
      "Antiquity is a form vocabulary — the colonnade, the peristyle, the stepped sanctuary terrace — and without it Troy, Athens and a Roman forum are medieval towns in sandstone.",
    eras: Object.freeze(["ancient"]),
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
  Object.freeze({
    id: "nautical_pirate",
    name: "Nautical & Pirate",
    thesis:
      "The catalog has an excellent fleet and almost no shore: a pirate haven needs the jolly roger, the gallows on the point, the careened hull and the chain across the harbour mouth, none of which is a ship.",
    eras: Object.freeze(["renaissance", "industrial"]),
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
  Object.freeze({
    id: "arcane_magical",
    name: "Arcane & Magical",
    thesis:
      "The fantasy corner has towers and one shrine; a magical place needs the ground to glow, the paths to be marked and the beasts to have somewhere to live.",
    eras: Object.freeze(["medieval", "ancient"]),
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
  Object.freeze({
    id: "alien_scifi",
    name: "Alien & Sci-fi",
    thesis:
      "An invasion's fabric — the traces, the barricades and the human side's answer to it — so that a world whose only alien thing is the landmark stops reading as a museum.",
    eras: Object.freeze(["modern", "far_future"]),
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
  Object.freeze({
    id: "agrarian",
    name: "Agrarian",
    thesis:
      "The countryside between the fields and the farmstead — hedges, walls, byres and middens — which is what makes a farm town read as agriculture at eye level.",
    eras: Object.freeze(["medieval", "renaissance", "industrial"]),
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
  Object.freeze({
    id: "wilds_camps",
    name: "Wilds & Camps",
    thesis:
      "Extraction in the wilderness — logging, trapping, placer work — is a whole settlement idiom, and the catalog answers it with a tent.",
    eras: Object.freeze(["medieval", "renaissance", "industrial"]),
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
  Object.freeze({
    id: "frontier_west",
    name: "Frontier West",
    thesis:
      "\"A wild west town\" routes to the industrial era and arrives as a Victorian mill town: no false fronts, no boardwalk, no saloon.",
    eras: Object.freeze(["industrial"]),
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
  Object.freeze({
    id: "nile_egypt",
    name: "Nile & Ancient Egypt",
    thesis:
      "The catalog cannot say pyramid, nor hypostyle hall, nor pylon gate — and a ziggurat is not it.",
    eras: Object.freeze(["ancient"]),
    themes: Object.freeze(["sun_clay"]),
    characters: Object.freeze(["civic", "core"]),
    members: Object.freeze([
      "pyramid",
      // `sphinx` was ratified out (2026-08-11) — bespoke-tier sculpt, not fabric.
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
  Object.freeze({
    id: "east_asian",
    name: "East Asian",
    thesis:
      "The public forms that frame an East Asian town — the gate, the wall, the garden, the castle — are missing, so the prompt produces one correct house in a European town.",
    eras: Object.freeze(["medieval", "renaissance"]),
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
  /* --- mesoamerican_jungle pack --- */
  Object.freeze({
    id: "mesoamerican_jungle",
    name: "Mesoamerican Jungle",
    thesis:
      "A Maya or Aztec centre in the rainforest: the catalog cannot say step pyramid, ball court, stela, sacbe or chultun, and a ziggurat in mossy stone is Mesopotamia in a hat.",
    eras: Object.freeze(["ancient"]),
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
  /* --- nordic_viking pack --- */
  Object.freeze({
    id: "nordic_viking",
    name: "Nordic & Viking",
    thesis:
      "\"A viking settlement\" routes to the medieval era and arrives as a European village in spruce: no mead hall, no naust, no turf house, no hof, no rune stone.",
    eras: Object.freeze(["medieval"]),
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
      // `wool_shed` is the agrarian pack's and a member belongs to one pack
      // only, so the id carries the pack and the words stay where they were.
      "wool_shed_norse",
      "rune_stone",
      "boat_burial_mound",
      "drying_rack_yard",
    ]),
  }),
]);

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

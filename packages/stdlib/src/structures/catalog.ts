/**
 * The structure catalog — everything Terrainist builds, or intends to.
 *
 * One canonical, typed, exhaustive registry of structures, with an honest
 * status against each. It exists for three readers:
 *
 * - **a human**, deciding what to build next, and wanting to see the shape of
 *   the whole space rather than the shape of what happens to be done;
 * - **the authoring model**, which needs to know what a document may ask for
 *   and — just as importantly — what it may not, so a prompt for a cathedral
 *   is answered with "not yet" instead of with a church wearing a hat;
 * - **the artifact build**, via `terrainist catalog --json`, which renders this
 *   registry as a coverage map.
 *
 * ## What "implemented" means here
 *
 * Exactly one thing: **a generator exists and can build it today**. The id of
 * an implemented entry is therefore not decoration — it is the name of a real
 * `BuildingArchetype`, a real entry of `PROP_GENERATORS`, or one of the
 * {@link NON_NODE_IMPLEMENTED} generators that are not nodes at all (the
 * cellar, the tunnel network, the cave system). `test/catalog.test.ts` asserts
 * that mapping against the live registries, so this file cannot drift into
 * optimism: claiming something is implemented fails the suite unless it is.
 *
 * Everything else is `not_started`. There is no credit for a plan.
 *
 * ## What is in it
 *
 * The bounds are Minecraft's, not a genre's. A structure belongs here if a
 * competent builder could make it out of blocks and a player could recognise it
 * — which admits the medieval village this project started with, and equally a
 * container yard, a ferris wheel, a yurt, a burial mound, a canal lock, a
 * radio mast and a wizard's tower. The catalog is deliberately much larger than
 * the roadmap: a registry that only lists the achievable is a to-do list, and a
 * to-do list cannot tell you what you are not thinking about.
 *
 * Ids are unique across the whole catalog and stable — they are the key the
 * status of a thing is tracked by, so a rename is a migration, not an edit.
 */

/** The taxonomy. Bigger than a genre, because the subject matter is. */
export const STRUCTURE_CATEGORIES = [
  "residential",
  "vernacular",
  "civic",
  "commercial",
  "industrial",
  "energy",
  "military",
  "religious",
  "memorial",
  "leisure",
  "amusement",
  "modern",
  "science",
  "transport-land",
  "transport-water",
  "transport-air",
  "infrastructure",
  "waterworks",
  "street-furniture",
  "nomadic",
  "rural",
  "fantasy",
  "ruins",
  "underground",
] as const;

/** One category of the taxonomy. */
export type StructureCategory = (typeof STRUCTURE_CATEGORIES)[number];

/**
 * How a structure is realised, which is a different question from what it is.
 *
 * `building` is anything the building grammar could plausibly own — a shell
 * with an interior. `prop` is a placed object with no interior worth walking
 * (a cart, a bench, a boat). `underground` is dug rather than built.
 * `infrastructure` is linear or networked: it follows a route or a grid rather
 * than sitting in an envelope.
 */
export const STRUCTURE_KINDS = ["building", "prop", "underground", "infrastructure"] as const;

/** How a structure is realised. */
export type StructureKind = (typeof STRUCTURE_KINDS)[number];

/** Build status. Only `implemented` is a claim; the other two are intent. */
export const STRUCTURE_STATUSES = ["implemented", "in_progress", "not_started"] as const;

/** A build status. */
export type StructureStatus = (typeof STRUCTURE_STATUSES)[number];

/** One catalog entry. */
export interface StructureEntry {
  /** Stable key. For an implemented entry, the generator's own name. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  readonly category: StructureCategory;
  readonly kind: StructureKind;
  readonly status: StructureStatus;
  /** Free-form search/grouping hints. */
  readonly tags?: readonly string[];
  /** A sentence for a reader who needs to know why the entry is worded so. */
  readonly note?: string;
  /**
   * Build-order wave. Before three parallel tracks pick their corners, the
   * orchestrator stamps the next wave here — an entry with a wave number is
   * claimed, an entry without one is open. Once an entry is `implemented` the
   * number stays as the record of which wave built it. Ids are the stable
   * keys; a wave is a field added beside them, never a reordering.
   */
  readonly wave?: number;
}

/**
 * Implemented generators that are not archetypes and not props.
 *
 * The cellar is a stage of the building grammar rather than a building; the
 * tunnel network and the cave system are dug by passes of their own. All three
 * are shipped, so the catalog says so — and the test that checks implemented
 * ids against the live registries has to know they are legitimate.
 */
export const NON_NODE_IMPLEMENTED: readonly string[] = Object.freeze([
  "cellar",
  "tunnel",
  "caves",
  // The themed underground. None of these is a node either: a crypt is a
  // `basement` style, a mine gallery is a `connected … via "tunnel"` style, and
  // an ore chamber is a room that style digs at its far end. They are named
  // here because an author needs to know they can ask for them.
  "crypt",
  "catacombs",
  "vault",
  "wine_cellar",
  "mineshaft",
  "ore_chamber",
]);

/**
 * Curried entry builder — one per (category, kind) pair.
 *
 * The kind is the category's *usual* one, not a law: a category groups things
 * by what they are for, and how a thing is realised does not always follow.
 * A graveyard sits in `memorial` beside the mausoleums and is a compound prop;
 * a curtain wall is `military` and is linear infrastructure. Rather than
 * inventing a `memorial-prop` group for each of them, an entry may say
 * `{ kind: … }` and override its group — which is also the only way the
 * exception stays visible at the entry that makes it.
 */
function group(
  category: StructureCategory,
  kind: StructureKind,
): (
  id: string,
  name: string,
  status?: StructureStatus,
  extra?: {
    readonly tags?: readonly string[];
    readonly note?: string;
    /** Overrides the group's kind for this entry alone. */
    readonly kind?: StructureKind;
    readonly wave?: number;
  },
) => StructureEntry {
  return (id, name, status = "not_started", extra = {}) => ({
    id,
    name,
    category,
    kind: extra.kind ?? kind,
    status,
    ...(extra.tags === undefined ? {} : { tags: extra.tags }),
    ...(extra.note === undefined ? {} : { note: extra.note }),
    ...(extra.wave === undefined ? {} : { wave: extra.wave }),
  });
}

const res = group("residential", "building");
const ver = group("vernacular", "building");
const civ = group("civic", "building");
const com = group("commercial", "building");
const ind = group("industrial", "building");
const enr = group("energy", "infrastructure");
const mil = group("military", "building");
const rel = group("religious", "building");
const mem = group("memorial", "building");
const lei = group("leisure", "building");
const amu = group("amusement", "prop");
const mod = group("modern", "building");
const sci = group("science", "building");
const land = group("transport-land", "prop");
const water = group("transport-water", "prop");
const air = group("transport-air", "prop");
const infra = group("infrastructure", "infrastructure");
const wat = group("waterworks", "infrastructure");
const street = group("street-furniture", "prop");
const nom = group("nomadic", "prop");
const rur = group("rural", "building");
const fan = group("fantasy", "building");
const ruin = group("ruins", "building");
const und = group("underground", "underground");

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every structure, in category order.
 *
 * Read it as a map of the territory. The implemented entries cluster in the
 * medieval-village corner because that is where the project started, and the
 * emptiness everywhere else is the point of writing the rest down.
 */
export const STRUCTURE_CATALOG: readonly StructureEntry[] = Object.freeze([
  /* --- residential ------------------------------------------------------ */
  res("cottage", "Cottage", "implemented", { tags: ["village", "small"] }),
  res("hall", "Great hall", "implemented", { tags: ["village", "communal"] }),
  res("inn", "Inn", "implemented", { tags: ["village", "lodging"] }),
  res("farmhouse", "Farmhouse"),
  res("townhouse", "Townhouse"),
  res("terraced_row", "Terraced row", "not_started", { tags: ["row", "urban"] }),
  res("manor_house", "Manor house"),
  res("mansion", "Mansion"),
  res("longhouse", "Longhouse"),
  res("bungalow", "Bungalow"),
  res("hut", "Hut"),
  res("log_cabin", "Log cabin"),
  res("courtyard_house", "Courtyard house"),
  res("dormitory", "Dormitory"),
  res("almshouse", "Almshouse"),
  res("servants_quarters", "Servants' quarters"),
  res("gate_lodge", "Gate lodge"),
  res("houseboat", "Houseboat", "not_started", { tags: ["water"] }),
  res("shepherds_bothy", "Shepherd's bothy"),
  res("boarding_house", "Boarding house"),

  /* --- vernacular / regional -------------------------------------------- */
  ver("stilt_house", "Stilt house", "not_started", { tags: ["water", "tropical"] }),
  ver("adobe_pueblo", "Adobe pueblo"),
  ver("tudor_row", "Tudor row", "implemented", {
    wave: 2,
    tags: ["row", "half-timber"],
    note: "The house shell re-clad in plaster panels between dark studwork, with a trapdoor jetty course in the apron at each storey line.",
  }),
  ver("mediterranean_villa", "Mediterranean villa", "implemented", {
    tags: ["stucco", "terrace"],
    note: "Smooth-sandstone stucco with a terracotta cornice, and the roof replaced by a parapeted terrace with a corner pergola.",
  }),
  ver("cycladic_house", "Cycladic house"),
  ver("riad", "Riad"),
  ver("hanok", "Hanok"),
  ver("machiya", "Machiya townhouse"),
  ver("trullo", "Trullo", "implemented", {
    wave: 2,
    tags: ["drystone", "conical"],
    note: "A corbelled drystone cone — rings one course higher and one cell further in — closing on a capstone over a single room.",
  }),
  ver("sod_house", "Sod house"),
  ver("igloo", "Igloo"),
  ver("alpine_chalet", "Alpine chalet", "implemented", {
    wave: 1,
    note: "Timber re-clad of the building shell: boxed spruce-log corners, banded courses, a deep apron eave and shutters beside the lights.",
  }),
  ver("thatched_roundhouse", "Thatched roundhouse"),
  ver("dutch_gable_house", "Dutch gable house", "implemented", {
    wave: 1,
    note: "Brick re-clad with the roof rebuilt front-to-back under a stepped parapet gable and a hoist beam over the facade.",
  }),
  ver("colonial_veranda_house", "Colonial veranda house"),
  ver("hacienda", "Hacienda"),
  ver("saltbox_house", "Saltbox house", "implemented", {
    wave: 1,
    note: "The signature asymmetric gable rebuilt off-centre — a short front pitch and a long shallow one down the back — over a clapboard re-clad.",
  }),
  ver("fachwerk_barn", "Fachwerk barn"),
  ver("cave_dwelling", "Cave dwelling", "not_started", { tags: ["cliff"] }),
  ver("wat_pavilion", "Wat pavilion"),

  /* --- civic ------------------------------------------------------------- */
  civ("library", "Library", "implemented", { tags: ["village"] }),
  civ("town_hall", "Town hall", "implemented", {
    wave: 1,
    note: "Masonry plinth, quoins and string course, a clock-and-bell gable over the front bay, and a council chamber inside.",
  }),
  civ("courthouse", "Courthouse", "implemented", {
    wave: 2,
    tags: ["civic", "bench"],
    note: "A dais and lectern at the far end, short bar rails from each side wall, and gallery benches either side of a two-column aisle.",
  }),
  civ("school", "School", "implemented", {
    wave: 1,
    note: "Rows of desks and seats facing a dark board across the end wall, with a modest bell cote over the roof.",
  }),
  civ("university_hall", "University hall"),
  civ("hospital", "Hospital"),
  civ("infirmary", "Infirmary", "implemented", {
    wave: 2,
    tags: ["civic", "cots"],
    note: "Cots head-to-wall up the side walls with banner screens between them, and an apothecary corner of brewing stand and cauldron.",
  }),
  civ("prison", "Prison"),
  civ("police_station", "Police station"),
  civ("fire_station", "Fire station"),
  civ("post_office", "Post office", "implemented", {
    wave: 2,
    tags: ["civic", "counter"],
    note: "A timber counter with a sign along the far wall, stacked barrels as pigeonholes up the sides, and parcel chests by the door.",
  }),
  civ("orphanage", "Orphanage"),
  civ("bathhouse", "Bathhouse", "implemented", {
    wave: 1,
    note: "Pools written into the floor plane inside a solid coping, smooth stone and quartz walls, steam braziers and benches.",
  }),
  civ("museum", "Museum"),
  civ("archive", "Archive"),
  civ("embassy", "Embassy"),
  civ("guildhall", "Guildhall"),
  civ("mint", "Mint"),
  civ("customs_house", "Customs house"),
  civ("workhouse", "Workhouse"),
  civ("council_chamber", "Council chamber"),

  /* --- commercial -------------------------------------------------------- */
  com("market_stall", "Market stall", "implemented", { tags: ["village"] }),
  com("bakery", "Bakery", "implemented", { tags: ["village"] }),
  com("warehouse", "Warehouse", "implemented", { tags: ["village", "storage"] }),
  com("marketplace", "Marketplace", "not_started", { tags: ["open-air"] }),
  com("shop_row", "Shop row"),
  com("general_store", "General store", "implemented", {
    wave: 1,
    note: "Stock walls of barrels, shelves and chests, a service counter and an apron awning over the door.",
  }),
  com("tavern", "Tavern", "implemented", {
    wave: 1,
    note: "Bar counter and stools, trestle tables, stacked barrels and a fire, under a timber wainscot band.",
  }),
  com("brewery", "Brewery"),
  com("distillery", "Distillery"),
  com("butchery", "Butchery"),
  com("apothecary", "Apothecary", "implemented", {
    wave: 1,
    note: "A stone bench carrying brewing stands, a cauldron, candle-topped bottle shelves and herb pots at the windows.",
  }),
  com("bank", "Bank"),
  com("counting_house", "Counting house"),
  com("pawnshop", "Pawnshop"),
  com("auction_house", "Auction house"),
  com("trading_post", "Trading post"),
  com("caravanserai", "Caravanserai"),
  com("tea_house", "Tea house"),
  com("spice_market", "Spice market"),
  com("shopping_mall", "Shopping mall"),
  com("department_store", "Department store"),
  com("food_court", "Food court"),

  /* --- industrial -------------------------------------------------------- */
  ind("smithy", "Smithy", "implemented", { tags: ["village", "craft"] }),
  ind("sawmill", "Sawmill", "implemented", {
    wave: 2,
    tags: ["craft", "timber"],
    note: "A run of saw benches down one wall facing stacked log stores down the other, with the sawyer's deck left open between them.",
  }),
  ind("quarry", "Quarry", "not_started", { tags: ["excavation"] }),
  ind("kiln", "Kiln", "implemented", {
    wave: 2,
    tags: ["craft", "fire"],
    note: "A brick core with its fire in the mouth, kept on the wall row so the fire never pinches the floor, and trapdoor drying racks.",
  }),
  ind("brickworks", "Brickworks"),
  ind("foundry", "Foundry"),
  ind("blast_furnace_works", "Blast furnace works"),
  ind("tannery", "Tannery", "implemented", {
    wave: 2,
    tags: ["craft", "leather"],
    note: "Soaking vats and liquor cauldrons up one wall, stretching frames of stripped log up the other, and a drying line under the plate.",
  }),
  ind("glassworks", "Glassworks"),
  ind("textile_mill", "Textile mill"),
  ind("papermill", "Paper mill"),
  ind("cannery", "Cannery"),
  ind("cooperage", "Cooperage"),
  ind("ropewalk", "Ropewalk"),
  ind("charcoal_burner", "Charcoal burner"),
  ind("salt_pans", "Salt pans"),
  ind("factory_hall", "Factory hall"),
  ind("machine_shop", "Machine shop"),
  ind("refinery", "Refinery"),
  ind("container_yard", "Container yard", "not_started", { tags: ["modern", "port"] }),
  ind("gantry_crane", "Gantry crane"),
  ind("scrapyard", "Scrapyard"),

  /* --- energy ------------------------------------------------------------ */
  enr("wind_turbine", "Wind turbine"),
  enr("solar_array", "Solar array"),
  enr("hydro_station", "Hydroelectric station"),
  enr("cooling_tower", "Cooling tower"),
  enr("transformer_yard", "Transformer yard"),
  enr("substation", "Substation"),
  enr("gasworks", "Gasworks"),
  enr("coal_tipple", "Coal tipple"),
  enr("oil_derrick", "Oil derrick"),
  enr("steam_plant", "Steam plant"),
  enr("nuclear_dome", "Reactor dome"),
  enr("biomass_shed", "Biomass shed"),
  enr("battery_shed", "Battery shed"),

  /* --- military / fortification ----------------------------------------- */
  mil("watchtower", "Watchtower", "implemented", { tags: ["village", "lookout"] }),
  mil("castle", "Castle"),
  mil("keep", "Keep", "implemented", { note: "Masonry re-clad of the building shell, with a fighting deck and a crenellated parapet." }),
  // Linear, not a shell: it follows a line the way a wall or an aqueduct does.
  mil("curtain_wall", "Curtain wall", "implemented", { tags: ["linear"], kind: "infrastructure" }),
  mil("gatehouse", "Gatehouse", "implemented", { note: "The keep's battlement plus a raised portcullis and a machicolation over the gate." }),
  mil("barbican", "Barbican"),
  mil("bastion", "Bastion"),
  mil("star_fort", "Star fort"),
  mil("motte_and_bailey", "Motte and bailey"),
  mil("palisade", "Palisade"),
  mil("moat", "Moat", "not_started", { tags: ["water"] }),
  mil("drawbridge", "Drawbridge"),
  mil("barracks", "Barracks", "implemented"),
  mil("armory", "Armory"),
  mil("arsenal", "Arsenal"),
  mil("drill_yard", "Drill yard"),
  mil("siege_camp", "Siege camp"),
  mil("bunker", "Bunker"),
  mil("pillbox", "Pillbox"),
  mil("guard_post", "Guard post"),
  mil("checkpoint", "Checkpoint"),
  mil("beacon_tower", "Beacon tower"),

  /* --- religious / monuments -------------------------------------------- */
  rel("church", "Church", "implemented", { tags: ["village", "steeple"] }),
  rel("cathedral", "Cathedral"),
  rel("chapel", "Chapel"),
  rel("monastery", "Monastery"),
  rel("abbey", "Abbey"),
  rel("cloister", "Cloister"),
  rel("hermitage", "Hermitage"),
  rel("mosque", "Mosque"),
  rel("minaret", "Minaret"),
  rel("synagogue", "Synagogue"),
  rel("pagoda", "Pagoda", "implemented", { note: "Three to five stacked eave tiers replacing the shell roof." }),
  rel("stupa", "Stupa"),
  rel("ziggurat", "Ziggurat"),
  rel("temple", "Temple"),
  rel("shrine", "Shrine"),
  rel("altar_stone", "Altar stone"),
  rel("wayside_cross", "Wayside cross"),
  rel("bell_tower", "Bell tower"),
  rel("obelisk", "Obelisk"),
  rel("colossus", "Colossus"),

  /* --- memorial ---------------------------------------------------------- */
  mem("statue_plinth", "Statue plinth", "implemented", { tags: ["prop", "plaza"] }),
  mem("graveyard", "Graveyard", "implemented", {
    kind: "prop",
    note: "Compound prop: fenced yard, seeded headstone variety, corner mausoleum.",
  }),
  mem("mausoleum", "Mausoleum", "implemented"),
  mem("tomb", "Tomb"),
  mem("cenotaph", "Cenotaph"),
  mem("war_memorial", "War memorial"),
  mem("memorial_garden", "Memorial garden"),
  mem("urn_wall", "Urn wall"),
  mem("remembrance_arch", "Remembrance arch"),
  mem("gravedigger_hut", "Gravedigger's hut"),
  mem("pyre_platform", "Funeral pyre platform"),

  /* --- leisure / sport --------------------------------------------------- */
  lei("gazebo", "Gazebo", "implemented", { tags: ["prop", "plaza"] }),
  lei("stadium", "Stadium"),
  lei("arena", "Arena"),
  lei("amphitheater", "Amphitheatre"),
  lei("theater", "Theatre"),
  lei("opera_house", "Opera house"),
  lei("cinema", "Cinema"),
  lei("dance_hall", "Dance hall"),
  lei("gym", "Gymnasium", "implemented", { note: "Wool mats, a glass mirror wall, anvils and a hanging bag." }),
  lei("boxing_gym", "Boxing gym"),
  // A basin sunk into the ground with no interior to walk: a prop, not a shell.
  lei("swimming_pool", "Swimming pool", "implemented", { tags: ["water"], kind: "prop" }),
  lei("bathing_pavilion", "Bathing pavilion"),
  lei("sauna", "Sauna"),
  lei("tennis_court", "Tennis court"),
  lei("bowling_green", "Bowling green"),
  lei("racetrack", "Racetrack"),
  lei("climbing_wall", "Climbing wall"),
  lei("ski_lodge", "Ski lodge"),
  lei("bandstand", "Bandstand"),
  lei("clubhouse", "Clubhouse"),

  /* --- amusement --------------------------------------------------------- */
  amu("ferris_wheel", "Ferris wheel"),
  amu("carousel", "Carousel", "implemented"),
  amu("roller_coaster", "Roller coaster", "not_started", { tags: ["rail"] }),
  amu("helter_skelter", "Helter skelter"),
  amu("swing_boats", "Swing boats"),
  amu("big_top", "Big top"),
  amu("fairground_stall", "Fairground stall"),
  amu("shooting_gallery", "Shooting gallery"),
  amu("hall_of_mirrors", "Hall of mirrors"),
  amu("funhouse", "Funhouse"),
  amu("ticket_booth", "Ticket booth"),
  amu("midway_arch", "Midway arch"),
  amu("prize_wheel", "Prize wheel"),
  amu("dodgems_pavilion", "Dodgems pavilion"),

  /* --- modern / high-rise ------------------------------------------------ */
  mod("skyscraper", "Skyscraper", "implemented", {
    tags: ["highrise", "core", "curtain-wall"],
    note: "building.grammar@0 tall path: switchback core, curtain wall, roof deck.",
  }),
  mod("office", "Office block", "implemented", { tags: ["highrise", "core"] }),
  mod("hotel", "Hotel", "implemented", {
    tags: ["highrise", "lodging"],
    note: "Repeated guest floors: corridor, bay partitions, a bed per bay.",
  }),
  mod("apartment_block", "Apartment block", "implemented", {
    tags: ["highrise", "balcony"],
    note: "Tall massing with projecting slab-and-bar balconies.",
  }),
  mod("penthouse", "Penthouse"),
  mod("atrium_block", "Atrium block"),
  mod("glass_pavilion", "Glass pavilion"),
  mod("brutalist_block", "Brutalist block"),
  mod("conference_center", "Conference centre"),
  mod("parking_garage", "Parking garage"),
  mod("gas_station", "Filling station"),
  mod("convenience_store", "Convenience store"),
  mod("data_center", "Data centre"),
  mod("corporate_campus", "Corporate campus"),
  mod("modern_villa", "Modern villa"),
  mod("billboard_tower", "Billboard tower"),

  /* --- science / education ---------------------------------------------- */
  sci("observatory", "Observatory", "implemented", { note: "A stepped dome with an open slit, and an instrument under it." }),
  sci("telescope_dome", "Telescope dome"),
  sci("planetarium", "Planetarium"),
  sci("alchemy_lab", "Alchemy laboratory"),
  sci("laboratory", "Laboratory"),
  sci("lecture_hall", "Lecture hall"),
  sci("botanical_garden", "Botanical garden"),
  sci("herbarium", "Herbarium"),
  sci("aviary", "Aviary"),
  sci("aquarium", "Aquarium"),
  sci("weather_station", "Weather station"),
  sci("seed_vault", "Seed vault"),
  sci("field_station", "Field station"),

  /* --- transport: land --------------------------------------------------- */
  land("cart", "Handcart", "implemented", { tags: ["prop"] }),
  land("covered_wagon", "Covered wagon", "implemented", { tags: ["prop"] }),
  land("rail_line", "Rail line", "implemented", { tags: ["linear"] }),
  land("locomotive", "Steam locomotive"),
  land("passenger_car", "Passenger car"),
  land("freight_car", "Freight car"),
  land("caboose", "Caboose"),
  land("train_station", "Train station", "not_started", { tags: ["building"] }),
  land("roundhouse", "Engine roundhouse"),
  land("signal_box", "Signal box"),
  land("level_crossing", "Level crossing"),
  land("tram_line", "Tram line"),
  land("bus_stop", "Bus stop"),
  land("transit_hub", "Transit hub"),
  land("stagecoach", "Stagecoach"),
  land("coach_house", "Coach house"),
  land("toll_house", "Toll house"),
  land("stone_bridge", "Stone bridge"),
  land("timber_bridge", "Timber bridge"),
  land("suspension_bridge", "Suspension bridge"),
  land("tunnel_portal", "Road tunnel portal"),
  land("milestone", "Milestone"),

  /* --- transport: water -------------------------------------------------- */
  water("rowboat", "Rowboat", "implemented", { tags: ["prop", "small"] }),
  water("fishing_sloop", "Fishing sloop", "implemented", { tags: ["prop", "sail"] }),
  water("pier", "Pier", "implemented", { tags: ["prop", "shore"] }),
  water("cog", "Medieval cog", "implemented", { tags: ["prop", "sail"] }),
  water("caravel", "Caravel", "implemented", { tags: ["prop", "sail"] }),
  water("galleon", "Galleon", "implemented", { tags: ["prop", "sail", "large"] }),
  water("longship", "Longship", "implemented", { tags: ["prop", "sail"] }),
  water("junk", "Junk"),
  water("gondola", "Gondola"),
  water("barge", "Barge"),
  water("paddle_steamer", "Paddle steamer"),
  water("ferry", "Ferry", "implemented", { tags: ["prop"] }),
  water("yacht", "Yacht", "implemented", { tags: ["prop"] }),
  water("speedboat", "Speedboat", "implemented", { tags: ["prop", "small"] }),
  water("tugboat", "Tugboat", "implemented", { tags: ["prop"] }),
  water("fishing_trawler", "Fishing trawler", "implemented", { tags: ["prop"] }),
  water("container_ship", "Container ship"),
  water("lighthouse", "Lighthouse", "not_started", { tags: ["tower", "beacon"] }),
  water("harbour_wall", "Harbour wall"),
  water("quay", "Quay"),
  water("slipway", "Slipway"),
  water("marina", "Marina"),
  water("boathouse", "Boathouse"),
  water("shipyard", "Shipyard"),
  water("buoy", "Buoy", "implemented", { tags: ["prop", "small"] }),

  /* --- transport: air ---------------------------------------------------- */
  air("airship", "Airship", "implemented", { tags: ["prop", "large"] }),
  air("zeppelin_mast", "Mooring mast", "implemented", { tags: ["prop"] }),
  air("hot_air_balloon", "Hot air balloon"),
  air("biplane", "Biplane", "implemented", { tags: ["prop"] }),
  air("light_plane", "Light aeroplane", "implemented", { tags: ["prop", "small"] }),
  air("airliner", "Airliner", "implemented", { tags: ["prop", "large"] }),
  air("cargo_plane", "Cargo plane", "implemented", { tags: ["prop", "large"] }),
  air("seaplane", "Seaplane"),
  air("glider", "Glider"),
  air("hangar", "Hangar", "implemented", { tags: ["prop", "building"] }),
  air("control_tower", "Control tower"),
  air("airport_terminal", "Airport terminal"),
  air("runway", "Runway", "implemented", { tags: ["prop", "linear"] }),
  air("helipad", "Helipad"),
  air("windsock", "Windsock"),

  /* --- infrastructure ---------------------------------------------------- */
  infra("aqueduct", "Aqueduct"),
  infra("viaduct", "Viaduct"),
  infra("water_tower", "Water tower"),
  infra("cistern", "Cistern"),
  infra("well", "Well"),
  infra("pumping_station", "Pumping station"),
  infra("culvert", "Culvert"),
  infra("storm_drain", "Storm drain"),
  infra("retaining_wall", "Retaining wall"),
  infra("power_pylon", "Power pylon"),
  infra("radio_mast", "Radio mast"),
  infra("telegraph_line", "Telegraph line"),
  infra("street_lamp_run", "Street lighting run"),
  infra("city_gate", "City gate"),
  infra("terrace_steps", "Terrace steps"),

  /* --- waterworks -------------------------------------------------------- */
  wat("dam", "Dam"),
  wat("weir", "Weir"),
  wat("canal_lock", "Canal lock"),
  wat("canal_basin", "Canal basin"),
  wat("sluice_gate", "Sluice gate"),
  wat("watermill", "Watermill"),
  // A standing machine, not a network: it pumps where it stands.
  wat("windpump", "Windpump", "implemented", { kind: "prop" }),
  wat("millpond", "Millpond"),
  wat("reservoir", "Reservoir"),
  wat("drydock", "Dry dock", "implemented", { tags: ["prop"] }),
  wat("floating_dock", "Floating dock"),
  wat("fish_ladder", "Fish ladder"),
  wat("fishing_hut", "Fishing hut"),
  wat("irrigation_channel", "Irrigation channel"),
  wat("stepping_stones", "Stepping stones"),

  /* --- street furniture and smallcraft ----------------------------------- */
  street("fountain", "Fountain", "implemented", { tags: ["plaza", "water"] }),
  street("bench", "Bench", "implemented"),
  street("planter", "Planter", "implemented"),
  street("clothesline", "Clothesline", "implemented"),
  street("scarecrow", "Scarecrow", "implemented"),
  street("market_barrow", "Market barrow", "implemented"),
  street("well_head", "Well head"),
  street("notice_board", "Notice board"),
  street("signpost", "Signpost", "implemented"),
  street("hitching_post", "Hitching post"),
  street("horse_trough", "Horse trough"),
  street("lamp_post", "Lamp post"),
  street("litter_bin", "Litter bin"),
  street("bicycle_rack", "Bicycle rack"),
  street("bus_shelter", "Bus shelter"),
  street("phone_box", "Phone box"),
  street("mailbox", "Mailbox"),
  street("drinking_fountain", "Drinking fountain"),
  street("flagpole", "Flagpole"),
  street("bollard_row", "Bollard row"),
  street("shop_awning", "Shop awning"),
  street("sandwich_board", "Sandwich board"),
  street("dog_kennel", "Dog kennel"),
  street("log_pile", "Log pile"),

  /* --- nomadic / temporary ------------------------------------------------ */
  nom("tent", "Tent", "implemented"),
  nom("yurt", "Yurt"),
  nom("caravan", "Caravan", "implemented"),
  nom("wagon_circle", "Wagon circle"),
  nom("campsite", "Campsite", "implemented", { note: "Compound prop: two tents, a caravan, a fire and the seating round it." }),
  nom("field_kitchen", "Field kitchen"),
  nom("lean_to", "Lean-to"),
  nom("hunters_blind", "Hunter's blind"),
  nom("fishing_camp", "Fishing camp"),
  nom("nomad_corral", "Nomad corral"),
  nom("trading_caravan", "Trading caravan"),
  nom("refugee_camp", "Refugee camp"),

  /* --- rural / agrarian --------------------------------------------------- */
  rur("barn", "Barn", "implemented", { tags: ["village", "farm"] }),
  rur("granary", "Granary", "implemented", { tags: ["village", "store"] }),
  rur("windmill", "Windmill", "implemented", { tags: ["village", "mill"] }),
  rur("farmstead", "Farmstead"),
  rur("silo", "Silo"),
  rur("greenhouse", "Greenhouse", "implemented", { note: "Glazed walls and roof over farmland beds written into the floor plane." }),
  rur("apiary", "Apiary"),
  rur("chicken_coop", "Chicken coop"),
  rur("pigsty", "Pigsty"),
  rur("sheepfold", "Sheepfold"),
  rur("cattle_pen", "Cattle pen"),
  rur("stable", "Stable"),
  rur("dovecote", "Dovecote"),
  rur("orchard", "Orchard"),
  rur("vineyard", "Vineyard"),
  rur("terraced_field", "Terraced field"),
  rur("hop_kiln", "Hop kiln"),
  rur("threshing_floor", "Threshing floor"),
  rur("hayrick", "Hayrick"),
  rur("cider_press", "Cider press"),
  rur("root_cellar_mound", "Root cellar mound"),

  /* --- fantasy / whimsy ---------------------------------------------------- */
  fan("wizard_tower", "Wizard's tower", "implemented", { note: "Glowstone-set masonry under a steep cone." }),
  fan("alchemists_tower", "Alchemist's tower"),
  fan("treehouse", "Treehouse", "implemented", {
    kind: "prop",
    note: "Compound prop: a mega trunk it grows itself, a deck, a hut and a ladder.",
  }),
  fan("hedge_maze", "Hedge maze"),
  fan("mushroom_house", "Mushroom house"),
  fan("witch_hut", "Witch's hut"),
  fan("hobbit_hole", "Hobbit hole"),
  fan("gingerbread_cottage", "Gingerbread cottage"),
  fan("dragon_roost", "Dragon roost"),
  fan("floating_platform", "Floating island platform"),
  fan("portal_frame", "Portal frame"),
  fan("crystal_shrine", "Crystal shrine"),
  fan("elven_bridge", "Elven bridge"),
  fan("dwarven_gate", "Dwarven gate"),
  fan("beacon_spire", "Beacon spire"),
  fan("giant_chessboard", "Giant chessboard"),
  fan("fairy_ring", "Fairy ring"),
  fan("clock_tower", "Clock tower"),

  /* --- ruins / archaeology ------------------------------------------------- */
  ruin("standing_stones", "Standing stones"),
  ruin("henge", "Henge"),
  ruin("monolith", "Monolith"),
  // A heap of stones. There has never been anything to walk into.
  ruin("cairn", "Cairn", "implemented", { kind: "prop" }),
  ruin("burial_mound", "Burial mound"),
  ruin("dig_site", "Dig site"),
  ruin("excavation_trench", "Excavation trench"),
  ruin("fossil_dig", "Fossil dig"),
  ruin("ruined_cottage", "Ruined cottage", "not_started", { tags: ["ruin-of"] }),
  ruin("ruined_keep", "Ruined keep", "not_started", { tags: ["ruin-of"] }),
  ruin("ruined_church", "Ruined church", "not_started", { tags: ["ruin-of"] }),
  ruin("ruined_bridge", "Ruined bridge", "not_started", { tags: ["ruin-of"] }),
  ruin("ruined_aqueduct", "Ruined aqueduct", "not_started", { tags: ["ruin-of"] }),
  ruin("collapsed_tower", "Collapsed tower", "not_started", { tags: ["ruin-of"] }),
  ruin("overgrown_villa", "Overgrown villa", "not_started", { tags: ["ruin-of"] }),
  ruin("sunken_ship", "Sunken ship", "not_started", { tags: ["ruin-of", "water"] }),
  ruin("ancient_road", "Ancient road"),
  ruin("shattered_obelisk", "Shattered obelisk"),

  /* --- underground --------------------------------------------------------- */
  und("cellar", "Cellar", "implemented", {
    tags: ["grammar-stage"],
    note: "A stage of building.grammar@0, not a node of its own.",
  }),
  und("tunnel", "Tunnel", "implemented", { tags: ["network"] }),
  und("caves", "Cave system", "implemented", { tags: ["network", "natural"] }),
  und("mineshaft", "Mineshaft network", "implemented", {
    tags: ["network", "style"],
    note: 'connected … via "tunnel" with style "mine": rough bore, timber frames, rails, ore studding, flooded dips.',
  }),
  und("mine_head", "Mine head", "implemented", {
    tags: ["village", "mine"],
    note: "building.grammar@0 archetype: headframe hut over the laddered shaft into a mine-style cellar.",
  }),
  und("ore_chamber", "Ore chamber", "implemented", {
    tags: ["network", "mine"],
    note: 'the widened terminal room of a mine gallery — "oreChamber": true on the constraint.',
  }),
  und("catacombs", "Catacombs", "implemented", {
    tags: ["network", "style"],
    note: 'connected … via "tunnel" with style "crypt": mossy stone brick with burial niches along the passage.',
  }),
  und("crypt", "Crypt", "implemented", {
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "crypt" } — niches, coffin, cobwebs. A cellar style, not a node.',
  }),
  und("ossuary", "Ossuary"),
  und("undercroft", "Undercroft"),
  und("dungeon_room", "Dungeon room"),
  und("vault", "Vault", "implemented", {
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "vault" } — bar gate, dense chests and barrels.',
  }),
  und("wine_cellar", "Wine cellar", "implemented", {
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "wine_cellar" } — stacked barrel walls and a bottle gesture.',
  }),
  und("root_cellar", "Root cellar"),
  und("smugglers_cove", "Smugglers' cove"),
  und("sewer_network", "Sewer network"),
  und("cistern_hall", "Cistern hall"),
  und("bunker_complex", "Bunker complex"),
  und("subway_station", "Subway station"),
  und("hermit_grotto", "Hermit's grotto"),
  und("underground_silo", "Underground silo"),
]);

/* -------------------------------------------------------------------------- */
/* queries                                                                     */
/* -------------------------------------------------------------------------- */

/** Look one up by id. */
export function structureById(id: string): StructureEntry | undefined {
  return STRUCTURE_CATALOG.find((entry) => entry.id === id);
}

/** Every entry in one category, in catalog order. */
export function structuresInCategory(category: StructureCategory): readonly StructureEntry[] {
  return STRUCTURE_CATALOG.filter((entry) => entry.category === category);
}

/** Every entry with one status, in catalog order. */
export function structuresWithStatus(status: StructureStatus): readonly StructureEntry[] {
  return STRUCTURE_CATALOG.filter((entry) => entry.status === status);
}

/** Counts by category and by status — what the coverage map is drawn from. */
export interface CatalogSummary {
  readonly total: number;
  readonly byStatus: Readonly<Record<StructureStatus, number>>;
  readonly byCategory: readonly {
    readonly category: StructureCategory;
    readonly total: number;
    readonly implemented: number;
  }[];
}

/** Summarise the catalog. Pure, so the CLI and a test can both call it. */
export function summarizeCatalog(): CatalogSummary {
  const byStatus = { implemented: 0, in_progress: 0, not_started: 0 };
  for (const entry of STRUCTURE_CATALOG) byStatus[entry.status]++;
  const byCategory = STRUCTURE_CATEGORIES.map((category) => {
    const rows = structuresInCategory(category);
    return {
      category,
      total: rows.length,
      implemented: rows.filter((r) => r.status === "implemented").length,
    };
  });
  return { total: STRUCTURE_CATALOG.length, byStatus, byCategory };
}

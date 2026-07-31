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
  res("farmhouse", "Farmhouse", "implemented", {
    wave: 4,
    tags: ["rural", "hearth"],
    note: "A kitchen range of smoker, cauldron and furnace across the far wall, a larder of stacked barrels and hay up one side, a boot room by the door and a board down the other side.",
  }),
  res("townhouse", "Townhouse", "implemented", {
    wave: 4,
    tags: ["urban", "genteel"],
    note: "Brick re-clad banded in stone with a slab cornice in the apron; inside a carpeted stair-hall runner up one wall row and a parlour of table, chair and bookshelf.",
  }),
  res("terraced_row", "Terraced row", "implemented", {
    wave: 4,
    tags: ["row", "urban"],
    note: "Stone-brick party piers every fourth column between plinth and eaves bands — the repeating bay read of a row built as one building — over a modest one-table interior.",
  }),
  res("manor_house", "Manor house", "implemented", {
    wave: 4,
    tags: ["gentry", "hall"],
    note: "A trapdoor dado panelling both side walls, a long board off the middle column with seats turned away from it, and a study of lectern and bookshelves on the far wall.",
  }),
  res("mansion", "Mansion", "implemented", {
    wave: 4,
    tags: ["gentry", "grand"],
    note: "A double range of boards either side of an empty middle column, carpeted gallery runs up both wall rows, and a state end of lectern between bookshelves.",
  }),
  res("longhouse", "Longhouse", "implemented", {
    wave: 4,
    tags: ["norse", "communal"],
    note: "Mead benches up both wall rows with their backrests to the wall, banner shields in the gaps between the runs, and a hearth with ale barrels at the head of the hall.",
  }),
  res("bungalow", "Bungalow", "implemented", {
    wave: 4,
    tags: ["single_storey"],
    note: "A posted porch under a slab canopy along the door face of the apron, standing from the actual ground; inside a bed, a table and chair, a hearth cauldron and a chest.",
  }),
  res("hut", "Hut", "implemented", {
    wave: 4,
    tags: ["small", "minimal"],
    note: "One room and nothing spare: a cot against a wall, a hearth fire on the far wall row with a stool turned to it, and a tool chest.",
  }),
  res("log_cabin", "Log cabin", "implemented", {
    wave: 4,
    tags: ["rustic", "timber"],
    note: "Every wall course re-clad in horizontal logs with the axis running along the wall and the corners interlocked; fur carpets up one wall row, a fire and a crafting corner.",
  }),
  res("courtyard_house", "Courtyard house", "implemented", {
    wave: 4,
    tags: ["court", "inward"],
    note: "The riad idiom secularised: a fence colonnade down both wall rows, a planted pot at each interior corner, a cauldron well on the far wall, and the middle left deliberately empty.",
  }),
  res("dormitory", "Dormitory", "implemented", {
    wave: 4,
    tags: ["lodging", "cots"],
    note: "Bunk ranges head-to-wall up both walls (the second only when the room is seven wide or more), barrel lockers in the gaps between cot heads, one broad aisle down the middle.",
  }),
  res("almshouse", "Almshouse", "implemented", {
    wave: 4,
    tags: ["charity", "cells"],
    note: "A row of identical bays down one range, each a bed and a chest with a fence partition between it and the next, and one shared hearth room across the far wall.",
  }),
  res("servants_quarters", "Servants' quarters", "not_started", { wave: 5 }),
  res("gate_lodge", "Gate lodge", "implemented", {
    wave: 5,
    tags: ["gatehouse"],
    note: "One cosy room: a watch seat on the far wall turned back down the room at the door, a small board beside it, a cot head-to-wall, and a trapdoor key rack by the entry.",
  }),
  res("houseboat", "Houseboat", "not_started", { tags: ["water"] }),
  res("boarding_house", "Boarding house", "implemented", {
    wave: 5,
    tags: ["lodging_house"],
    note: "The inn's residential cousin: bed-and-chest bays with fence partitions down one range only, the other left as the corridor, a shared kitchen range across the far wall under the house-rules banner.",
  }),
  res("shepherds_bothy", "Shepherd's bothy", "implemented", {
    wave: 5,
    tags: ["stone", "one_room"],
    note: "A one-room stone hut: a cot against the wall, a hearth with a stool turned to it, a crook rack, and fleece bales of white wool up the other wall row.",
  }),

  /* --- vernacular / regional -------------------------------------------- */
  ver("stilt_house", "Stilt house", "implemented", {
    wave: 3,
    tags: ["water", "tropical"],
    note: "Jungle-plank re-clad over a dark under-plinth, with fence stilt posts and a trapdoor porch trim in the apron ring — the raised-floor read, on ordinary ground.",
  }),
  ver("adobe_pueblo", "Adobe pueblo", "implemented", {
    wave: 3,
    note: "Two-tone terracotta render under a flat stepped-parapet terrace, with stripped-log vigas protruding through the wall plane at the plate.",
  }),
  ver("tudor_row", "Tudor row", "implemented", {
    wave: 2,
    tags: ["row", "half-timber"],
    note: "The house shell re-clad in plaster panels between dark studwork, with a trapdoor jetty course in the apron at each storey line.",
  }),
  ver("mediterranean_villa", "Mediterranean villa", "implemented", {
    wave: 2,
    tags: ["stucco", "terrace"],
    note: "Smooth-sandstone stucco with a terracotta cornice, and the roof replaced by a parapeted terrace with a corner pergola.",
  }),
  ver("cycladic_house", "Cycladic house", "implemented", {
    wave: 3,
    note: "Whitewashed concrete re-clad under a level parapeted terrace, with a blue band at the plate and blue-trimmed shutters in the apron.",
  }),
  ver("riad", "Riad", "implemented", {
    wave: 3,
    note: "Plain sandstone outside, and inside a 2x2 basin written into the floor plane with a solid rim, carpet corners and lattice trim under the plate.",
  }),
  ver("hanok", "Hanok", "implemented", {
    wave: 3,
    note: "Dark post-and-beam bands on white plaster under a tiered deepslate corbel, with a stair course in the apron for the upturned eave.",
  }),
  ver("machiya", "Machiya townhouse", "implemented", {
    wave: 3,
    note: "A koshi lattice of trapdoors over the street face, stripped-spruce walls, and a shop front at the door end with the living room behind it.",
  }),
  ver("trullo", "Trullo", "implemented", {
    wave: 2,
    tags: ["drystone", "conical"],
    note: "A corbelled drystone cone — rings one course higher and one cell further in — closing on a capstone over a single room.",
  }),
  ver("sod_house", "Sod house", "implemented", {
    wave: 3,
    note: "Coarse-dirt and packed-mud turf walls under a shallow grass-surfaced corbel — one room, a bed, a chest and a pot.",
  }),
  ver("igloo", "Igloo", "implemented", {
    wave: 3,
    note: "A snow-block dome corbelled over a snow drum and capped in packed ice, with a tunnel-mouth porch flanking the doorstep.",
  }),
  ver("alpine_chalet", "Alpine chalet", "implemented", {
    wave: 1,
    note: "Timber re-clad of the building shell: boxed spruce-log corners, banded courses, a deep apron eave and shutters beside the lights.",
  }),
  ver("thatched_roundhouse", "Thatched roundhouse", "implemented", {
    wave: 3,
    note: "Stripped-log posts with packed-mud wattle between them, under a deep hay cone closing on a spruce finial; the centre floor left open.",
  }),
  ver("dutch_gable_house", "Dutch gable house", "implemented", {
    wave: 1,
    note: "Brick re-clad with the roof rebuilt front-to-back under a stepped parapet gable and a hoist beam over the facade.",
  }),
  ver("colonial_veranda_house", "Colonial veranda house", "implemented", {
    wave: 3,
    note: "A posted veranda under a slab canopy in the apron, birch clapboard banded white at each storey line, and a parlour inside.",
  }),
  ver("hacienda", "Hacienda", "implemented", {
    wave: 3,
    note: "Sandstone stucco under a terracotta eave course, with hitching posts and a trough in the apron on the door face.",
  }),
  ver("saltbox_house", "Saltbox house", "implemented", {
    wave: 1,
    note: "The signature asymmetric gable rebuilt off-centre — a short front pitch and a long shallow one down the back — over a clapboard re-clad.",
  }),
  ver("fachwerk_barn", "Fachwerk barn", "implemented", {
    wave: 3,
    note: "The tudor idiom at barn scale — X-braced dark timber on white infill — with hay piled along the side walls and the threshing floor left clear.",
  }),
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
  civ("university_hall", "University hall", "implemented", {
    wave: 5,
    tags: ["civic", "university"],
    note: "The lecture hall's grand parent: a slab dais and lectern between book walls, flat rows off a three-column aisle, a trapdoor gallery rail run high on both side walls.",
  }),
  civ("hospital", "Hospital", "implemented", {
    wave: 3,
    tags: ["civic", "cots"],
    note: "Wards of cots head-to-wall up both side walls with banner screens between the bays, and a dispensary of brewing stand and cauldron on the far wall.",
  }),
  civ("infirmary", "Infirmary", "implemented", {
    wave: 2,
    tags: ["civic", "cots"],
    note: "Cots head-to-wall up the side walls with banner screens between them, and an apothecary corner of brewing stand and cauldron.",
  }),
  civ("prison", "Prison", "implemented", {
    wave: 3,
    tags: ["civic", "bars"],
    note: "A run of iron-bar cell fronts down one wall with a door gap every third cell, and the corridor kept off the centre line.",
  }),
  civ("police_station", "Police station", "implemented", {
    wave: 3,
    tags: ["civic", "counter"],
    note: "A front desk of cartography table and day-book lectern, one barred corner cell, and notice banners by the door.",
  }),
  civ("fire_station", "Fire station", "implemented", {
    wave: 3,
    tags: ["civic", "bell"],
    note: "A muster bell on the far wall, cauldron water butts up one side and trapdoor ladder racks up the other, with the appliance bay left empty.",
  }),
  civ("post_office", "Post office", "implemented", {
    wave: 2,
    tags: ["civic", "counter"],
    note: "A timber counter with a sign along the far wall, stacked barrels as pigeonholes up the sides, and parcel chests by the door.",
  }),
  civ("orphanage", "Orphanage", "implemented", {
    wave: 3,
    tags: ["civic", "beds"],
    note: "Small beds head-to-wall, a furnace hearth and matron's chest on the far wall, and a carpet play mat inset clear of both side lanes.",
  }),
  civ("bathhouse", "Bathhouse", "implemented", {
    wave: 1,
    note: "Pools written into the floor plane inside a solid coping, smooth stone and quartz walls, steam braziers and benches.",
  }),
  civ("museum", "Museum", "implemented", {
    wave: 3,
    tags: ["civic", "exhibits"],
    note: "Chiseled-stone plinths carrying position-chosen exhibits up both walls behind a fence rope, and a banner-hung gallery wall with an accession lectern.",
  }),
  civ("archive", "Archive"),
  civ("embassy", "Embassy", "implemented", {
    wave: 5,
    tags: ["civic", "consulate"],
    note: "A timber reception desk and lectern under a flag wall of banners, waiting benches backed to both side walls, and an iron-trimmed records corner by the door.",
  }),
  civ("guildhall", "Guildhall", "implemented", {
    wave: 3,
    tags: ["civic", "hall"],
    note: "A top table and warden's lectern across the far end, guild colours up both walls, and two ranks of benches turned away from the table they face.",
  }),
  civ("mint", "Mint", "implemented", {
    wave: 3,
    tags: ["civic", "strongroom"],
    note: "An iron-trimmed strongroom corner with coin chests, anvil and smithing-table presses up one wall, and an assay counter along the far wall.",
  }),
  civ("customs_house", "Customs house", "implemented", {
    wave: 3,
    tags: ["civic", "counter"],
    note: "A bonded store of stacked barrels, a fence tally line, ledger desks on the far wall and chains hung over the weighing hall on a single-storey plan.",
  }),
  civ("workhouse", "Workhouse", "implemented", {
    wave: 3,
    tags: ["civic", "benches"],
    note: "Ranks of looms and crafting benches up one wall, meagre cots up the other, and barrel stores with an overseer's desk at the far end.",
  }),
  civ("council_chamber", "Council chamber", "implemented", {
    wave: 5,
    tags: ["civic", "council"],
    note: "A ring of wall-row benches broken at the aisle, a board set either side of the lantern column and never under it, and the speaker's dais and lectern at the head.",
  }),

  /* --- commercial -------------------------------------------------------- */
  com("market_stall", "Market stall", "implemented", { tags: ["village"] }),
  com("bakery", "Bakery", "implemented", { tags: ["village"] }),
  com("warehouse", "Warehouse", "implemented", { tags: ["village", "storage"] }),
  com("marketplace", "Marketplace", "not_started", { tags: ["open-air"] }),
  com("shop_row", "Shop row", "implemented", {
    wave: 5,
    tags: ["parade"],
    note: "Stone-brick piers every fourth column of the street face under a slab cornice — the repeating shopfront bay — over counter-and-crate bays down both wall rows.",
  }),
  com("general_store", "General store", "implemented", {
    wave: 1,
    note: "Stock walls of barrels, shelves and chests, a service counter and an apron awning over the door.",
  }),
  com("tavern", "Tavern", "implemented", {
    wave: 1,
    note: "Bar counter and stools, trestle tables, stacked barrels and a fire, under a timber wainscot band.",
  }),
  com("brewery", "Brewery", "implemented", {
    wave: 3,
    tags: ["craft"],
    note: "Mash-tun cauldrons and grain sacks up one wall, a maturing store of stacked barrels up the other, and a brewing bench across the far wall.",
  }),
  com("distillery", "Distillery", "implemented", {
    wave: 3,
    tags: ["craft"],
    note: "A waxed-copper still with a lightning-rod condenser arm on the far wall, bottle racks up one side and the cask store up the other.",
  }),
  com("butchery", "Butchery", "implemented", {
    wave: 3,
    tags: ["craft", "food"],
    note: "Stripped-log chopping stumps and iron-bar hanging racks down one wall, smokers and brine cauldrons down the other, a cold store at the end.",
  }),
  com("apothecary", "Apothecary", "implemented", {
    wave: 1,
    note: "A stone bench carrying brewing stands, a cauldron, candle-topped bottle shelves and herb pots at the windows.",
  }),
  com("pawnshop", "Pawnshop", "implemented", {
    wave: 3,
    note: "A slab counter with an iron-bar grille standing on it, the strongbox behind, and shelves of unredeemed pledges up the side walls.",
  }),
  com("bank", "Bank", "implemented", {
    wave: 3,
    tags: ["counter", "strongroom"],
    note: "A counter under an iron-bar grille with one unbarred teller's window, an iron-trimmed strongroom corner, and lockbox barrels in the hall.",
  }),
  com("counting_house", "Counting house", "implemented", {
    wave: 3,
    tags: ["desks"],
    note: "Two ranks of ledger desks with clerks stools turned away from the desk they read, a masters lectern, bookshelves and a strongbox corner.",
  }),
  com("auction_house", "Auction house", "implemented", {
    wave: 5,
    tags: ["auction"],
    note: "A slab rostrum with the auctioneer's lectern in the middle of it under red sold-banners, flat seat rows off a three-column aisle, lot tables at the door end.",
  }),
  com("trading_post", "Trading post", "implemented", {
    wave: 3,
    tags: ["trade"],
    note: "Mixed goods walls cycling barrels, chests and hay, a timber trade counter across the far wall and a banner over the middle of it.",
  }),
  com("caravanserai", "Caravanserai", "implemented", {
    wave: 5,
    tags: ["khan", "trade"],
    note: "The courtyard house gone mercantile: traveller cells of chest and fence partition down both wall rows, carpet-topped pack-saddle racks, a hay store and a well at the head, the court left empty.",
  }),
  com("tea_house", "Tea house", "implemented", {
    wave: 3,
    note: "Low slab tables in the side bays with a seat either side turned by the backrest rule, a kettle counter on the far wall and pots at the windows.",
  }),
  com("spice_market", "Spice market", "implemented", {
    wave: 5,
    tags: ["souk", "bazaar"],
    note: "A souk lane of dense terracotta-and-wool sack stalls off the lantern aisle, warm lanterns standing only on the sacks, trapdoor and iron-bar hanging bunches on the walls.",
  }),
  com("shopping_mall", "Shopping mall", "implemented", {
    wave: 5,
    tags: ["mall"],
    note: "A galleried retail hall: distinct shop-bay stock down both wall rows with fence piers between bays, a painted three-column promenade off the lantern, planters at its head.",
  }),
  com("department_store", "Department store", "implemented", {
    wave: 5,
    note: "Timber counters per department up both walls with wool-bust mannequins standing on them, stacked stock walls between, haberdashery looms across the far wall.",
  }),
  com("food_court", "Food court", "implemented", {
    wave: 5,
    tags: ["food"],
    note: "Counter stalls of smoker, cauldron and timber across the far wall under a row of menu banners, and one shared seating field of tables and backrest-rule seats on the school's aisle discipline.",
  }),

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
  ind("brickworks", "Brickworks", "implemented", {
    wave: 5,
    note:
      "A wave-two kiln core on the far wall with its fire in the mouth, brick drying stacks and trapdoor shelves, and clay pits read as mud-and-clay floor bays.",
  }),
  ind("foundry", "Foundry", "implemented", {
    wave: 3,
    tags: ["craft", "fire"],
    note: "Blast furnaces and furnaces alternating across the far wall, anvils and ingot stock up one side, and the casting floor left completely open.",
  }),
  ind("blast_furnace_works", "Blast furnace works", "implemented", {
    wave: 5,
    note:
      "A blast-furnace bank set into a deepslate core with waxed-copper tuyeres standing on the masonry, slag barrels, and a slab charging deck where a body fits on it.",
  }),
  ind("tannery", "Tannery", "implemented", {
    wave: 2,
    tags: ["craft", "leather"],
    note: "Soaking vats and liquor cauldrons up one wall, stretching frames of stripped log up the other, and a drying line under the plate.",
  }),
  ind("glassworks", "Glassworks", "implemented", {
    wave: 3,
    tags: ["craft", "fire"],
    note: "A furnace bank on the far wall row, stacked sand stores up one side and finished glass on trapdoor shelves up the other.",
  }),
  ind("textile_mill", "Textile mill", "implemented", {
    wave: 3,
    tags: ["craft", "cloth"],
    note: "A run of looms up one wall facing dye cauldrons and fleece stacked in three colours up the other, with more looms at the far end.",
  }),
  ind("papermill", "Paper mill", "implemented", {
    wave: 3,
    tags: ["craft"],
    note: "Pulp cauldrons and drying racks up one wall, quartz-slab reams up the other, and a cartography-table press at the far end.",
  }),
  ind("cannery", "Cannery", "implemented", {
    wave: 3,
    tags: ["craft", "food"],
    note: "A full-length slab processing bench down one wall, brine cauldrons and barrel intake down the other, and the sealing furnaces across the end.",
  }),
  ind("cooperage", "Cooperage", "implemented", {
    wave: 3,
    tags: ["craft", "timber"],
    note: "Finished casks stacked open and shut up one wall, stave racks and posts up the other, and a smithing-table hooping bench at the end.",
  }),
  ind("ropewalk", "Ropewalk", "implemented", {
    wave: 5,
    note:
      "Wool rope lines run at working height between fence posts down both walls, log-and-iron-bar winding drums at the far end, and coil stacks by the door.",
  }),
  ind("charcoal_burner", "Charcoal burner", "implemented", {
    wave: 5,
    note:
      "A coarse-dirt burn pile against the far wall closing on a solid turf cap, a podzol clearing in the floor plane, log stores and the collier's corner.",
  }),
  ind("salt_pans", "Salt pans"),
  ind("factory_hall", "Factory hall", "implemented", {
    wave: 5,
    note:
      "Smithing and fletching benches alternating up both walls, a fence drive shaft hung off the ceiling down the middle, and a clocking desk by the door.",
  }),
  ind("machine_shop", "Machine shop", "implemented", {
    wave: 5,
    note:
      "Stonecutter lathes up one wall, trapdoor tool boards and swarf barrels up the other, wall-torch work lights, and a grindstone-and-anvil bench end.",
  }),
  ind("refinery", "Refinery", "implemented", {
    wave: 5,
    note:
      "Iron tank pedestals on both wall rows with waxed-copper pipe courses standing on them, catch cauldrons between, a lever control desk - and no flame at all.",
  }),
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
  mil("castle", "Castle", "implemented", {
    wave: 5,
    tags: ["fortress", "hall"],
    note: "The keep grand: full masonry re-clad, a crenellated fighting deck with corner turrets proud of the merlons, a great-hall board, wall-banner heraldry and an armoury corner. Tags `fortress`/`stronghold` — `castle` and `citadel` remain the keep's.",
  }),
  mil("keep", "Keep", "implemented", { note: "Masonry re-clad of the building shell, with a fighting deck and a crenellated parapet." }),
  // Linear, not a shell: it follows a line the way a wall or an aqueduct does.
  mil("curtain_wall", "Curtain wall", "implemented", { tags: ["linear"], kind: "infrastructure" }),
  mil("gatehouse", "Gatehouse", "implemented", { note: "The keep's battlement plus a raised portcullis and a machicolation over the gate." }),
  mil("barbican", "Barbican", "implemented", {
    wave: 5,
    tags: ["gate", "outer_work"],
    note: "The gatehouse's outer work: a masonry arch springing either side of the door head, a machicolation course in the apron with murder-hole trapdoors hung under its soffit, and a guard room. Tags `outer_gate`/`gateworks` — `barbican` itself remains the gatehouse's.",
  }),
  mil("bastion", "Bastion", "implemented", {
    wave: 5,
    tags: ["angular", "platform"],
    note: "Angular masonry re-clad with battered plinth courses, a flat gun-platform deck under a parapet, and a powder store of stacked barrels behind wall racks.",
  }),
  mil("star_fort", "Star fort"),
  mil("motte_and_bailey", "Motte and bailey"),
  mil("palisade", "Palisade"),
  mil("moat", "Moat", "not_started", { tags: ["water"] }),
  mil("drawbridge", "Drawbridge"),
  mil("barracks", "Barracks", "implemented"),
  mil("armory", "Armory", "implemented", {
    wave: 5,
    tags: ["store", "racks"],
    note: "Rack walls of fence stems under trapdoor boards up both wall rows, a smith's corner of smithing table, iron block and anvil, and crate rows by the door.",
  }),
  mil("arsenal", "Arsenal", "implemented", {
    wave: 5,
    tags: ["store", "powder"],
    note: "The armory scaled up: a barrel powder store shut off by an iron-barred partition, stacked shell racks up the other wall, and a loading bench with a seat at the door end.",
  }),
  mil("drill_yard", "Drill yard"),
  mil("siege_camp", "Siege camp"),
  mil("bunker", "Bunker", "implemented", {
    wave: 5,
    tags: ["modern", "concrete"],
    note: "A poured-concrete re-clad banded darker at the plinth, firing-slit window rhythm from the facade defaults, a map table and a cot corner.",
  }),
  mil("pillbox", "Pillbox", "implemented", {
    wave: 5,
    tags: ["modern", "concrete"],
    note: "One room and nothing spare: a concrete re-clad, a slit rhythm, a mounted position of stair and iron block turned out of the far wall, one crate.",
  }),
  mil("guard_post", "Guard post", "implemented", {
    wave: 5,
    tags: ["outpost", "brazier"],
    note: "A grounded brazier pedestal and an alarm bell on the two corners of the door face, a watch bench turned into the room, and a water butt.",
  }),
  mil("checkpoint", "Checkpoint", "implemented", {
    wave: 5,
    tags: ["outpost", "barrier"],
    note: "A barrier arm across the apron on the door face — grounded posts with a trapdoor boom between them and the doorstep left clear — lantern posts, and a document desk inside.",
  }),
  mil("beacon_tower", "Beacon tower", "implemented", {
    wave: 5,
    tags: ["signal", "tower"],
    note: "The bell tower militarised: masonry re-clad under a crenellated deck, a signal campfire on a solid pedestal at the middle of the deck, and signal banners on the walls below. Tag `beacon_tower` only — `beacon`/`beacon_spire` stay the fantasy track's.",
  }),

  /* --- religious / monuments -------------------------------------------- */
  rel("church", "Church", "implemented", { tags: ["village", "steeple"] }),
  rel("cathedral", "Cathedral", "implemented", {
    wave: 4,
    note: "The church idiom writ large: apron buttresses, a three-column centre aisle with side-aisle pew blocks, a crossing band and a steeple.",
  }),
  rel("chapel", "Chapel"),
  rel("monastery", "Monastery", "implemented", {
    wave: 4,
    note: "Refectory table run with benches, scriptorium desks along the far wall, fence cell partitions.",
  }),
  rel("abbey", "Abbey", "implemented", {
    wave: 4,
    note: "Nave with two facing ranks of choir stalls either side of the aisle, an altar, and a cloister-walk slab cornice.",
  }),
  rel("cloister", "Cloister", "implemented", {
    wave: 4,
    note: "Open garth with planted corners and a well head off the lantern column, arcaded walk of fence posts on the wall rows.",
  }),
  rel("hermitage", "Hermitage", "implemented", {
    wave: 4,
    note: "One austere cell: cot, lectern and a shrine niche re-clad into the far wall.",
  }),
  rel("mosque", "Mosque", "implemented", {
    wave: 4,
    note: "Mihrab niche with an arch suggestion in the qibla wall, carpet prayer rows across the floor, a two-step minbar. No figural decor.",
  }),
  rel("minaret", "Minaret", "implemented", {
    wave: 4,
    note: "The bell tower slimmed: masonry shaft, a trapdoor balcony ring near the top, a corbelled cone on a solid cap with a spike finial.",
  }),
  rel("synagogue", "Synagogue", "implemented", {
    wave: 4,
    note: "Central bimah dais with a reading lectern, an ark cabinet with doors on the far wall, bench ranks turned to the bimah.",
  }),
  rel("pagoda", "Pagoda", "implemented", { note: "Three to five stacked eave tiers replacing the shell roof." }),
  rel("stupa", "Stupa", "implemented", {
    wave: 4,
    note: "Corbelled solid dome on a plinth ring, a solid core with a clear circumambulation lane round it, spire finial.",
  }),
  rel("ziggurat", "Ziggurat", "implemented", {
    wave: 4,
    note: "Two to three stepped terraces rebuilt over the shell, with a shrine cell on the crown.",
  }),
  rel("temple", "Temple"),
  rel("shrine", "Shrine"),
  rel("altar_stone", "Altar stone"),
  rel("wayside_cross", "Wayside cross"),
  rel("bell_tower", "Bell tower", "implemented", {
    wave: 4,
    note: "Tall masonry shaft with a trapdoor louvre band and the bell hung under the ceiling plane at the head of it.",
  }),
  rel("obelisk", "Obelisk"),
  rel("colossus", "Colossus"),

  /* --- memorial ---------------------------------------------------------- */
  mem("statue_plinth", "Statue plinth", "implemented", { tags: ["prop", "plaza"] }),
  mem("graveyard", "Graveyard", "implemented", {
    kind: "prop",
    note: "Compound prop: fenced yard, seeded headstone variety, corner mausoleum.",
  }),
  mem("mausoleum", "Mausoleum", "implemented"),
  mem("tomb", "Tomb", "implemented", {
    wave: 4,
    note: "The mausoleum's quieter cousin: sealed masonry with an apron plinth course, a slab cist and unlit candles.",
  }),
  mem("cenotaph", "Cenotaph", "not_started", { wave: 5 }),
  mem("war_memorial", "War memorial", "not_started", { wave: 5 }),
  mem("memorial_garden", "Memorial garden"),
  mem("urn_wall", "Urn wall", "not_started", { wave: 5 }),
  mem("remembrance_arch", "Remembrance arch", "not_started", { wave: 5 }),
  mem("gravedigger_hut", "Gravedigger's hut", "implemented", {
    wave: 5,
    tags: ["modest", "tools"],
    note: "Tool racks up one wall row, a slab coffin bench down the other, a lime composter and a fire at the far wall, and one lantern's comfort by the door.",
  }),
  mem("pyre_platform", "Funeral pyre platform", "not_started", { wave: 5 }),

  /* --- leisure / sport --------------------------------------------------- */
  lei("gazebo", "Gazebo", "implemented", { tags: ["prop", "plaza"] }),
  lei("stadium", "Stadium"),
  lei("arena", "Arena"),
  lei("amphitheater", "Amphitheatre"),
  lei("theater", "Theatre", "implemented", {
    wave: 4,
    note: "A slab stage dais, banner wing curtains and flat seat rows facing it.",
  }),
  lei("opera_house", "Opera house", "implemented", {
    wave: 4,
    note: "The theatre plus a quartz proscenium, side boxes and a red floor runner.",
  }),
  lei("cinema", "Cinema", "implemented", {
    wave: 4,
    note: "A pale screen on a dark end wall, seat rows and a projector plinth at the back.",
  }),
  lei("dance_hall", "Dance hall", "implemented", {
    wave: 4,
    note: "A striped sprung floor, a band dais with jukebox and note block, wall benches.",
  }),
  lei("gym", "Gymnasium", "implemented", { note: "Wool mats, a glass mirror wall, anvils and a hanging bag." }),
  lei("boxing_gym", "Boxing gym", "implemented", {
    wave: 4,
    note: "Wool mats, a slab ring with fence corner posts on it, hanging bags and a bench row.",
  }),
  // A basin sunk into the ground with no interior to walk: a prop, not a shell.
  lei("swimming_pool", "Swimming pool", "implemented", { tags: ["water"], kind: "prop" }),
  lei("bathing_pavilion", "Bathing pavilion", "not_started", { wave: 5 }),
  lei("sauna", "Sauna", "implemented", {
    wave: 4,
    note: "The bathhouse's dry cousin: flat slab bench tiers and a brazier plinth, no water. Tags `dry_sauna`/`sweat_lodge` \u2014 bare `sauna` is the bathhouse's.",
  }),
  lei("tennis_court", "Tennis court"),
  lei("bowling_green", "Bowling green"),
  lei("racetrack", "Racetrack"),
  lei("climbing_wall", "Climbing wall"),
  lei("ski_lodge", "Ski lodge", "implemented", {
    wave: 4,
    note: "Fur rugs in the floor plane, trapdoor ski racks and a log mantel with fence antlers.",
  }),
  lei("bandstand", "Bandstand"),
  lei("clubhouse", "Clubhouse", "implemented", {
    wave: 4,
    note: "A trophy shelf and banner honours board, lounge chairs and tables, a short bar.",
  }),

  /* --- amusement --------------------------------------------------------- */
  amu("ferris_wheel", "Ferris wheel"),
  amu("carousel", "Carousel", "implemented"),
  amu("roller_coaster", "Roller coaster", "not_started", { tags: ["rail"] }),
  amu("helter_skelter", "Helter skelter", "implemented", {
    wave: 5,
    note: "A striped tower core with twenty-four stair treads spiralling down two laps of the ring around it, a cone crown with a solid cap and a stone entrance arch at the foot; every tread is orthogonally against the core, so the slide is supported cell by cell.",
  }),
  amu("swing_boats", "Swing boats", "implemented", { wave: 4 }),
  amu("big_top", "Big top"),
  amu("fairground_stall", "Fairground stall", "implemented", { wave: 4 }),
  amu("shooting_gallery", "Shooting gallery", "implemented", {
    wave: 5,
    note: "A booth: plank counter on two log posts, a concrete back wall with three button-on-white-concrete target reads, a prize shelf under the eaves and a striped canopy with two hanging lanterns.",
  }),
  amu("hall_of_mirrors", "Hall of mirrors"),
  amu("funhouse", "Funhouse"),
  amu("ticket_booth", "Ticket booth", "implemented", { wave: 4 }),
  amu("midway_arch", "Midway arch", "implemented", {
    wave: 5,
    note: "Two striped pillar towers with a continuous block span between them, standing banners along the span and iron-bar bunting plus hung lanterns beneath it - no cube in the arch has six air faces.",
  }),
  amu("prize_wheel", "Prize wheel", "implemented", { wave: 4 }),
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
  mod("penthouse", "Penthouse", "implemented", {
    wave: 5,
    note: "The top-floor flat at house scale: a parapeted roof terrace with planters, a wide glass band, a sparse open plan.",
  }),
  mod("atrium_block", "Atrium block", "implemented", {
    wave: 5,
    note: "A light-well core: a painted court and gallery ring, corner planting, a glazed roof light inset from the eave.",
  }),
  mod("glass_pavilion", "Glass pavilion", "implemented", {
    wave: 4,
    note: "The greenhouse domesticated: sill-rule glazing, a solid glass deck, an open plan.",
  }),
  mod("brutalist_block", "Brutalist block", "implemented", {
    wave: 5,
    note:
      "Gray concrete over the whole wall field with polished fins every third column and bands at plinth and plate, small openings, an honest interior.",
  }),
  mod("conference_center", "Conference centre", "implemented", {
    wave: 5,
    note:
      "A slab stage dais with banner flanks, flat seat rows turned away from the stage off a three-column aisle, breakout tables and a lobby.",
  }),
  mod("parking_garage", "Parking garage", "implemented", {
    wave: 5,
    note:
      "Gray-and-white bay stripes in the floor plane, a stair ramp run against one wall where the storey allows, a concrete trim course, and a barrier arm beside the door.",
  }),
  mod("gas_station", "Filling station", "implemented", {
    wave: 5,
    note:
      "A forecourt canopy in the apron on grounded posts over iron-and-lever pumps, a convenience-store shop corner, and a wall-banner price board.",
  }),
  mod("convenience_store", "Convenience store", "implemented", {
    wave: 4,
    note: "Shelf gondolas on the seat-bank aisle discipline, a grilled counter, cold cabinets.",
  }),
  mod("data_center", "Data centre", "implemented", {
    wave: 5,
    note:
      "Iron server racks on the bank aisle discipline with levers standing on them, a checkered raised-floor grid, cooling cauldrons and an ops desk.",
  }),
  mod("corporate_campus", "Corporate campus"),
  mod("modern_villa", "Modern villa", "implemented", {
    wave: 5,
    note: "Flat-roofed minimalism: a white re-clad, a four-course glass band, a wall-backed floating-stair read, sparse furniture.",
  }),
  mod("billboard_tower", "Billboard tower"),

  /* --- science / education ---------------------------------------------- */
  sci("observatory", "Observatory", "implemented", { note: "A stepped dome with an open slit, and an instrument under it." }),
  sci("telescope_dome", "Telescope dome", "implemented", {
    wave: 5,
    note: "The modern white dome: a smooth-quartz corbel with a two-cell shutter, a pier-mounted instrument and a control desk.",
  }),
  sci("planetarium", "Planetarium", "implemented", {
    wave: 5,
    note: "The dome inverted: a closed dark shell with glowstone stars in the masonry, a projector pedestal and a ring of inward seats.",
  }),
  sci("alchemy_lab", "Alchemy laboratory", "implemented", {
    wave: 5,
    note: "The apothecary gone arcane: brewing benches with candles, a bottle wall, a distillation run and chalk circles in the floor plane.",
  }),
  sci("laboratory", "Laboratory", "implemented", {
    wave: 4,
    note: "Stone benches with brewing stands, an iron fume-hood canopy and a chalk board.",
  }),
  sci("lecture_hall", "Lecture hall", "implemented", {
    wave: 4,
    note: "The school at scale: a board, a lectern on a dais, flat rows off a three-column aisle.",
  }),
  sci("botanical_garden", "Botanical garden", "implemented", {
    wave: 5,
    note: "The glass pavilion grown up: full sill-rule glazing, raised planter rows, gravel path discipline and a rimmed pond where the predicate holds.",
  }),
  sci("herbarium", "Herbarium", "implemented", {
    wave: 5,
    note: "Specimen presses and hung drying racks in trapdoors, potted rows off the aisle and a cataloguing lectern.",
  }),
  sci("aviary", "Aviary", "implemented", {
    wave: 5,
    note: "Iron-bar cages built core-first round solid planting - never round the route - with fence perches and a green floor plane.",
  }),
  sci("aquarium", "Aquarium"),
  sci("weather_station", "Weather station", "implemented", {
    wave: 5,
    note: "A roof mast carrying a lightning rod, a grounded apron pole with a banner windsock, a chart desk and a barometer wall.",
  }),
  sci("seed_vault", "Seed vault", "implemented", {
    wave: 5,
    note: "The bunker civil: an iron-trimmed door face, a frost band at the plate, barrel shelf rows under banner labels and backup lanterns.",
  }),
  sci("field_station", "Field station", "implemented", {
    wave: 5,
    note: "The hut scientific: a bunk, sample shelves, an observer-and-lever radio on a bench and a map table.",
  }),

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
  land("bus_stop", "Bus stop", "implemented", {
    wave: 5,
    note: "The shelter's cheap cousin: a fence pole with a banner flag, an open-trapdoor timetable and a two-seat stair bench on a small paved pad.",
  }),
  land("transit_hub", "Transit hub"),
  land("stagecoach", "Stagecoach", "implemented", {
    wave: 5,
    note: "The caravan's grander cousin: an enclosed body with trapdoor doors and glass, four two-course trapdoor wheels on stripped-log axles, a driver's box, a drawbar and a fence luggage rail standing on the roof slabs.",
  }),
  land("coach_house", "Coach house"),
  land("toll_house", "Toll house"),
  land("stone_bridge", "Stone bridge"),
  land("timber_bridge", "Timber bridge"),
  land("suspension_bridge", "Suspension bridge"),
  land("tunnel_portal", "Road tunnel portal"),
  land("milestone", "Milestone", "implemented", {
    wave: 5,
    note: "A single carved waypost - mossy cobble plinth with corner walls and moss carpet, two courses of chiselled stone and a slab cap.",
  }),

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
  street("well_head", "Well head", "implemented", {
    wave: 4,
    note: "Stone ring with a coping course, a windlass axle on two posts, a bucket on an iron line and a pitched roof; the water is a cauldron, so there is no fluid to leak.",
  }),
  street("notice_board", "Notice board", "implemented", {
    wave: 4,
    note: "Two posts under a plank board, a sheet of open trapdoors for the notices and a small roof - the paper read without a sign block entity.",
  }),
  street("signpost", "Signpost", "implemented"),
  street("hitching_post", "Hitching post", "implemented", {
    wave: 4,
    note: "Two fence posts with a stripped-log rail between them and an iron ring plate on each head; the rail is a log so it is a beam, not an unsupported fence.",
  }),
  street("horse_trough", "Horse trough", "implemented", {
    wave: 4,
    note: "A hollowed stone trough - solid floor, wall ring, two cauldrons in the hollow: a filled trough that cannot spill.",
  }),
  street("lamp_post", "Lamp post", "implemented", {
    wave: 4,
    note: "Paved pad, fence column, two bottom-slab arms with a lantern hung under each, and a third lantern standing on the head.",
  }),
  street("litter_bin", "Litter bin", "implemented", {
    wave: 4,
    note: "A composter and a barrel on a paved corner, with a slab kerb and a trapdoor lid half off the composter.",
  }),
  street("bicycle_rack", "Bicycle rack", "implemented", {
    wave: 5,
    note: "Three low hoops - fence posts with a trapdoor laid over each head - on a two-cell paved strip.",
  }),
  street("bus_shelter", "Bus shelter", "implemented", {
    wave: 5,
    note: "Three sides of glass pane on a paved pad, a slab roof, a stair bench and a route banner standing on a masonry footing set into the ridge.",
  }),
  street("phone_box", "Phone box", "implemented", {
    wave: 5,
    note: "The classic one-cell kiosk: red concrete plinth, three courses of glass, a lantern hung from the terracotta cap and a slab crown - the narrowest prop in the catalog, and the silhouette is the read.",
  }),
  street("mailbox", "Mailbox", "implemented", {
    wave: 5,
    note: "A fence post under a concrete head with an iron trapdoor lid and a second iron trapdoor standing off its face for the slot.",
  }),
  street("drinking_fountain", "Drinking fountain", "implemented", {
    wave: 4,
    note: "Pedestal, cauldron basin and a back plate with an open-trapdoor spout pointing at the water.",
  }),
  street("flagpole", "Flagpole", "implemented", {
    wave: 4,
    note: "Stone pad with corner stumps, a seven-block fence pole and a seed-drawn standing banner at the masthead.",
  }),
  street("bollard_row", "Bollard row", "implemented", {
    wave: 4,
    note: "A parameterised run of short stone posts along a kerb; length 5..33 (9), with a bollard always at both ends.",
  }),
  street("shop_awning", "Shop awning", "implemented", {
    wave: 5,
    note: "A freestanding striped canopy on two grounded log posts over a paved pad - the fairground stall's canopy with no counter, no back wall and no wares, so the silhouette is distinct from it.",
  }),
  street("sandwich_board", "Sandwich board", "implemented", {
    wave: 4,
    note: "The A-frame outside a shop: two pairs of leaning trapdoors on a slab base, 2x2x2 - the smallest prop in the catalog.",
  }),
  street("dog_kennel", "Dog kennel", "implemented", {
    wave: 4,
    note: "A plank box with a south doorway, a pitched roof, a pressure-plate bowl inside and a name banner on the ridge.",
  }),
  street("log_pile", "Log pile", "implemented", {
    wave: 4,
    note: "A stacked cord of firewood running along x between four chocks, crowned by a narrower top course.",
  }),

  /* --- nomadic / temporary ------------------------------------------------ */
  nom("tent", "Tent", "implemented"),
  nom("yurt", "Yurt", "implemented", {
    wave: 5,
    note: "The tent's round cousin: a two-band wool cylinder, a shallow cone to a SOLID centre cap, a carpet rug floor, a doorway with a trapdoor flap and a campfire on a stone pedestal; the smoke hole is a gap one course below the cap with nothing above it.",
  }),
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
  rur("silo", "Silo", "implemented", {
    wave: 4,
    note:
      "Banded stone-brick re-clad under a corbelled cap, hay grain columns behind inspection hatches and a filling head of trapdoors near the plate.",
  }),
  rur("greenhouse", "Greenhouse", "implemented", { note: "Glazed walls and roof over farmland beds written into the floor plane." }),
  rur("apiary", "Apiary", "implemented", {
    wave: 4,
    note:
      "Hay skeps on grounded fence pedestals and real beehives in the apron ring, honeycomb-flecked walls and a cauldron extraction bench inside.",
  }),
  rur("chicken_coop", "Chicken coop", "implemented", {
    wave: 4,
    note:
      "A low birch-and-oak house of trapdoor nesting cubbies over hay, floor-standing fence roosts, feed barrels and a hay nest in the apron.",
  }),
  rur("pigsty", "Pigsty"),
  rur("sheepfold", "Sheepfold"),
  rur("cattle_pen", "Cattle pen"),
  rur("stable", "Stable", "implemented", {
    wave: 4,
    note:
      "Fence-and-gate stall partitions down one wall row off an off-centre corridor, hay-net trapdoors, a tack wall of chests and barrels and a cauldron trough in the apron.",
  }),
  rur("dovecote", "Dovecote", "implemented", {
    wave: 4,
    note:
      "A slim stone tower whose faces are a dense nesting-hole trapdoor grid, a corbelled cone with a perch finial and a ladder up the inside.",
  }),
  rur("orchard", "Orchard"),
  rur("vineyard", "Vineyard"),
  rur("terraced_field", "Terraced field"),
  rur("hop_kiln", "Hop kiln", "implemented", {
    wave: 4,
    note:
      "The oast: a brick corbel cone on a solid cap under a white cowl, a slatted drying-floor band under the plate and a furnace at the base.",
  }),
  rur("threshing_floor", "Threshing floor"),
  rur("hayrick", "Hayrick"),
  rur("cider_press", "Cider press", "implemented", {
    wave: 4,
    note:
      "A fence screw under a slab platen beside its catching cauldron, apple barrels along the far row and a bottle shelf of trapdoors.",
  }),
  rur("root_cellar_mound", "Root cellar mound", "implemented", {
    wave: 4,
    note:
      "Cobble-and-mud retaining walls under a shallow grass-surfaced corbel mound, shelved with barrels and crates under lidded hatches. It does not dig.",
  }),

  /* --- fantasy / whimsy ---------------------------------------------------- */
  fan("wizard_tower", "Wizard's tower", "implemented", { note: "Glowstone-set masonry under a steep cone." }),
  fan("alchemists_tower", "Alchemist's tower", "not_started", { wave: 5 }),
  fan("treehouse", "Treehouse", "implemented", {
    kind: "prop",
    note: "Compound prop: a mega trunk it grows itself, a deck, a hut and a ladder.",
  }),
  fan("hedge_maze", "Hedge maze"),
  fan("mushroom_house", "Mushroom house", "implemented", {
    wave: 4,
    note:
      "A corbelled red-mushroom cap closing on a solid cap block, over spotted mushroom-stem walls; a stool, a table and shroom stores inside.",
  }),
  fan("witch_hut", "Witch's hut", "implemented", {
    wave: 4,
    note:
      "Swamp spruce over a dark under-course under a crooked saltbox ridge, with a corner cauldron, potion bookshelves and a carpet cushion.",
  }),
  fan("hobbit_hole", "Hobbit hole", "implemented", {
    wave: 4,
    note:
      "A stripped-log ring trimming the doorway round, a turf corbel roof over mud walls, and a settle, a rug and a pantry inside.",
  }),
  fan("gingerbread_cottage", "Gingerbread cottage", "implemented", {
    wave: 4,
    note:
      "Brown biscuit walls with white icing courses and pink and lime candy dots, a quartz icing eave in the apron and a sweets counter with a cake.",
  }),
  fan("dragon_roost", "Dragon roost", "not_started", { wave: 5 }),
  fan("floating_platform", "Floating island platform"),
  fan("portal_frame", "Portal frame"),
  fan("crystal_shrine", "Crystal shrine", "not_started", { wave: 5 }),
  fan("elven_bridge", "Elven bridge"),
  fan("dwarven_gate", "Dwarven gate", "not_started", { wave: 5 }),
  fan("beacon_spire", "Beacon spire", "not_started", { wave: 5 }),
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

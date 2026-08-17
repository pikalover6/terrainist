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
export const STRUCTURE_KINDS = [
  "building",
  "prop",
  "underground",
  "infrastructure",
] as const;

/** How a structure is realised. */
export type StructureKind = (typeof STRUCTURE_KINDS)[number];

/** Build status. Only `implemented` is a claim; the other two are intent. */
export const STRUCTURE_STATUSES = [
  "implemented",
  "in_progress",
  "not_started",
] as const;

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
  // Wave six. Eight more cellar styles, on exactly the same footing as the
  // crypt: each is a `"basement": { "style": ... }` and not a node, and each is
  // named here because an author needs to know they can ask for it. The wave's
  // other four entries are deliberately NOT here -- `bunker_complex`,
  // `subway_station` and `underground_silo` are real archetypes and `helipad`
  // is a real prop, so the live registries back those four directly.
  "ossuary",
  "undercroft",
  "dungeon_room",
  "root_cellar",
  "cistern_hall",
  "smugglers_cove",
  "hermit_grotto",
  "sewer_network",
  // Precinct-built (docs/INFRA-ENTRIES-v0.md family "already answered",
  // ratified 2026-08-14): `precinct.harbour@0` raises both. The catalog's
  // standard is "a generator exists and can build it today", and it does.
  "harbour_wall",
  "quay",
  // Family D — a fitting *in* another structure (docs/INFRA-ENTRIES-v0.md §2 D).
  // Neither is a node and neither ever will be: a blast door is what the way in
  // is made of, and the way in is a column the port solver placed. Both are
  // reached by `"entrance": { "treatment": <this id> }` on the host building,
  // which is the same footing the cellar styles above are on — a stage of the
  // building grammar, named here because an author needs to know they can ask.
  "blast_door",
  "airlock_vestibule",
  // The three bridges (docs/INFRA-ENTRIES-v0.md §2 A, ratified 2026-08-15).
  // None is a node: a bridge is a *style* the bridge kit builds where a route
  // it did not author crosses water, picked by span length or named outright
  // with `road.network@0`'s `bridgeStyle`.
  "stone_bridge",
  "timber_bridge",
  "suspension_bridge",
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
  res("terrace", "Terrace (street wall)", "implemented", {
    tags: ["row", "urban", "fabric"],
    note: "A run of bays sharing party walls — one wall between neighbours, not two — under a stepped cornice, over a continuous shopfront band with a door and an awning per bay. Distinct from `terraced_row`, which is one house wearing the look of a row; this is the row.",
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
  res("gate_lodge", "Gate lodge", "implemented", {
    wave: 5,
    tags: ["gatehouse"],
    note: "One cosy room: a watch seat on the far wall turned back down the room at the door, a small board beside it, a cot head-to-wall, and a trapdoor key rack by the entry.",
  }),
  res("servants_quarters", "Servants' quarters", "implemented", {
    wave: 5,
    tags: ["lodging", "spare"],
    note: "Plain bunks up one wall row with barrel racks between the cot heads, a shared table on the far row in the storey's own idiom, a wash cauldron and a crafting table. Honest and spare.",
  }),
  res("houseboat", "Houseboat", "implemented", {
    wave: 6,
    kind: "prop",
    tags: ["water"],
    note: "Built on the W2 watercraft template rather than in the building grammar: a blunt barge hull that displaces water instead of boxing it in, a glazed cabin amidships under a slab roof with a chimney and roof planters, a fore-deck table, a railed after-deck and iron-bar moorings.",
  }),
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
  com("warehouse", "Warehouse", "implemented", {
    tags: ["village", "storage"],
  }),
  com("marketplace", "Marketplace", "implemented", {
    wave: 7,
    tags: ["open-air"],
    note: "The square as a market hall: masonry piers every fourth bay with a fenced arcade between them above head height and below the plate, over counter-and-crate bays on both wall rows.",
  }),
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
    note: "A wave-two kiln core on the far wall with its fire in the mouth, brick drying stacks and trapdoor shelves, and clay pits read as mud-and-clay floor bays.",
  }),
  ind("foundry", "Foundry", "implemented", {
    wave: 3,
    tags: ["craft", "fire"],
    note: "Blast furnaces and furnaces alternating across the far wall, anvils and ingot stock up one side, and the casting floor left completely open.",
  }),
  ind("blast_furnace_works", "Blast furnace works", "implemented", {
    wave: 5,
    note: "A blast-furnace bank set into a deepslate core with waxed-copper tuyeres standing on the masonry, slag barrels, and a slab charging deck where a body fits on it.",
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
    note: "Wool rope lines run at working height between fence posts down both walls, log-and-iron-bar winding drums at the far end, and coil stacks by the door.",
  }),
  ind("charcoal_burner", "Charcoal burner", "implemented", {
    wave: 5,
    note: "A coarse-dirt burn pile against the far wall closing on a solid turf cap, a podzol clearing in the floor plane, log stores and the collier's corner.",
  }),
  ind("salt_pans", "Salt pans"),
  ind("factory_hall", "Factory hall", "implemented", {
    wave: 5,
    note: "Smithing and fletching benches alternating up both walls, a fence drive shaft hung off the ceiling down the middle, and a clocking desk by the door.",
  }),
  ind("machine_shop", "Machine shop", "implemented", {
    wave: 5,
    note: "Stonecutter lathes up one wall, trapdoor tool boards and swarf barrels up the other, wall-torch work lights, and a grindstone-and-anvil bench end.",
  }),
  ind("refinery", "Refinery", "implemented", {
    wave: 5,
    note: "Iron tank pedestals on both wall rows with waxed-copper pipe courses standing on them, catch cauldrons between, a lever control desk - and no flame at all.",
  }),
  ind("container_yard", "Container yard", "not_started", {
    tags: ["modern", "port"],
  }),
  ind("gantry_crane", "Gantry crane"),
  ind("scrapyard", "Scrapyard"),

  /* --- energy ------------------------------------------------------------ */
  // A mast with three arms on it has no inside; it goes down the prop
  // pipeline, exactly as the windpump did.
  enr("wind_turbine", "Wind turbine", "implemented", {
    wave: 6,
    kind: "prop",
    note: "A continuous white-concrete mast with a hub on its head and a three-arm rotor drawn outward from it - every blade block touching the one inboard - over a stone pad, with an iron transformer cabinet behind the mast. Tags `wind_turbine`/`turbine`; `windpump` stays the waterworks prop's.",
  }),
  enr("solar_array", "Solar array", "implemented", {
    wave: 6,
    kind: "prop",
    note: "Rows of `daylight_detector` panels, each on its own plinth cube, laid two apart so every pair has a service lane; a full-block cable trench along the front and an inverter cabinet at the head of it.",
  }),
  // The five below carried the group's `infrastructure` kind by accident of
  // the builder (docs/INFRA-ENTRIES-v0.md family E, 2026-08-14): each is
  // honestly a building or a prop, and the kind override says which, so the
  // wave that implements them hosts them right.
  enr("hydro_station", "Hydroelectric station", "not_started", { kind: "building" }),
  enr("cooling_tower", "Cooling tower", "not_started", { kind: "building" }),
  enr("transformer_yard", "Transformer yard", "not_started", { kind: "prop" }),
  enr("substation", "Substation", "implemented", {
    wave: 6,
    kind: "building",
    note: "A switchyard read inside the walls: transformer tanks with lightning rods standing on them, a fence run of insulators rather than an enclosure, yellow warning banners, and a gravel-and-andesite yard in the floor plane.",
  }),
  enr("gasworks", "Gasworks", "implemented", {
    wave: 6,
    kind: "building",
    note: "The gasholder read on the OUTSIDE - the wall field re-clad in stone with iron banding every third course - over a retort bench of unlit furnaces and tar cauldrons. Plain rect; an interior drum would be a blocked column.",
  }),
  enr("coal_tipple", "Coal tipple", "implemented", {
    wave: 6,
    kind: "building",
    note: "A mine-side loader: grounded timber posts up the apron carrying a beam, an elevated bin on the beam closing on a solid cap, a chute of stairs on stepped grounded columns, and coal-block bays in the floor plane. Plain rect.",
  }),
  enr("oil_derrick", "Oil derrick", "not_started", { kind: "prop" }),
  enr("steam_plant", "Steam plant", "implemented", {
    wave: 6,
    kind: "building",
    note: "A boiler bank of furnaces with an iron steam drum standing on each, a waxed-copper header, condenser cauldrons, and a turbine-hall shaft run of stripped log under the plate - never a fence line.",
  }),
  enr("nuclear_dome", "Reactor dome", "not_started", { kind: "building" }),
  enr("biomass_shed", "Biomass shed", "implemented", {
    wave: 6,
    kind: "building",
    note: "The barn energetic: four full-block chip bays of coarse dirt, podzol and packed mud in the floor plane, a hopper-and-composter intake run, hay and barrel stores, and an unlit boiler corner.",
  }),
  enr("battery_shed", "Battery shed", "implemented", {
    wave: 6,
    kind: "building",
    note: "Rack rows of iron-and-waxed-copper cells up both wall rows with a stripped-log bus bar laid ON the racks themselves, a painted plate grid floor, and a dial-wall monitoring desk.",
  }),

  /* --- military / fortification ----------------------------------------- */
  mil("watchtower", "Watchtower", "implemented", {
    tags: ["village", "lookout"],
  }),
  mil("castle", "Castle", "implemented", {
    wave: 5,
    tags: ["fortress", "hall"],
    note: "The keep grand: full masonry re-clad, a crenellated fighting deck with corner turrets proud of the merlons, a great-hall board, wall-banner heraldry and an armoury corner. Tags `fortress`/`stronghold` — `castle` and `citadel` remain the keep's.",
  }),
  mil("keep", "Keep", "implemented", {
    note: "Masonry re-clad of the building shell, with a fighting deck and a crenellated parapet.",
  }),
  // Linear, not a shell: it follows a line the way a wall or an aqueduct does.
  mil("curtain_wall", "Curtain wall", "implemented", {
    tags: ["linear"],
    kind: "infrastructure",
  }),
  mil("gatehouse", "Gatehouse", "implemented", {
    note: "The keep's battlement plus a raised portcullis and a machicolation over the gate.",
  }),
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
  mil("star_fort", "Star fort", "implemented", {
    wave: 7,
    tags: ["angular", "earthwork"],
    note: "The bastion trace made legible: a battered masonry re-clad over a heavy plinth, a crenellated gun deck, and a star trace stepped up out of the apron — corners highest, a salient at the middle of each face — so the pointed outline reads from above and as an angular work from the ground. Tags `star_fort`/`bastion_trace` — bare `bastion` stays the garrison bastion's.",
  }),
  mil("motte_and_bailey", "Motte and bailey", "implemented", {
    wave: 7,
    tags: ["timber", "mound"],
    note: "Earth and trees in a season: a battered coarse-dirt motte skirt with a grass crown round the apron, a timber re-clad of the whole shell, and a plank fighting deck behind a fence stockade instead of merlons. Tags `motte`/`bailey` — `castle`/`keep` stay the breadth keep's.",
  }),
  mil("palisade", "Palisade", "implemented", {
    wave: 7,
    tags: ["timber", "enclosure"],
    note: "A stockade enclosure: the wall ring re-clad in whole-block timber with pointed tips on every other column one course over the plate, a slab fighting walkway down both wall rows, and a short outer stake row in the apron. Tags `palisade`/`stockade`/`timber_wall` — `wall`/`curtain_wall` stay the linework engine's.",
  }),
  mil("moat", "Moat", "implemented", {
    wave: 7,
    tags: ["water"],
    note: "The work is the water: the apron ring laid as water over a masonry bed, a battered stone plinth on the shell, and the doorstep with a shoulder either side left as a dry causeway — a moat across the way in is a building nobody can enter.",
  }),
  mil("drawbridge", "Drawbridge", "implemented", {
    wave: 7,
    tags: ["gate", "water"],
    note: "The moat plus the span: a plank deck over the causeway, timber winch cheeks either side of the door, and the leaf stood upright over the doorstep as a trapdoor panel from the third course up. Tags `drawbridge`/`bascule` — bare `bridge` stays the linework engine's.",
  }),
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
  mil("drill_yard", "Drill yard", "implemented", {
    wave: 7,
    tags: ["yard", "training"],
    note: "A parade ground: the floor plane written as a two-tone marked-out surface of gravel and coarse dirt, pell posts with hay heads up one wall row, weapon racks up the other, a slab dais with the colours over it at the far end, and hay butts in the apron behind. Tags `drill_yard`/`parade_ground`.",
  }),
  mil("siege_camp", "Siege camp", "implemented", {
    wave: 7,
    tags: ["camp", "earthwork", "engine"],
    note: "Tents, earthworks and an engine, all facing away from the door: the roof rebuilt as a stepped wool tent on a log ridge pole, the walls re-clad as canvas between timber posts, a coarse-dirt bank with a stake row along the far apron, and a trebuchet read of two legs, a stair arm and a stone counterweight standing on it. Claims `camp`/`encampment`/`siege`.",
  }),
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
  rel("chapel", "Chapel", "implemented", {
    wave: 7,
    tags: ["village", "bellcote"],
    note: "The church at village scale, read by its bellcote: two piers and a lintel on the gable end with the bell hung under them, a short carpet aisle and two bays of pews.",
  }),
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
  rel("pagoda", "Pagoda", "implemented", {
    note: "Three to five stacked eave tiers replacing the shell roof.",
  }),
  rel("stupa", "Stupa", "implemented", {
    wave: 4,
    note: "Corbelled solid dome on a plinth ring, a solid core with a clear circumambulation lane round it, spire finial.",
  }),
  rel("ziggurat", "Ziggurat", "implemented", {
    wave: 4,
    note: "Two to three stepped terraces rebuilt over the shell, with a shrine cell on the crown.",
  }),
  rel("temple", "Temple", "implemented", {
    wave: 7,
    tags: ["classical", "colonnade"],
    note: "The classical temple: a stylobate, a peristyle of columns in every other apron bay under a continuous entablature, and a roof rebuilt as a pediment mass that insets in x only. Inside is a blind cella with an inner colonnade and a cult figure. Tags `classical_temple`/`greek_temple`/`peristyle` \u2014 bare `temple` stays the church's.",
  }),
  rel("shrine", "Shrine", "implemented", {
    wave: 7,
    tags: ["niche", "canopy"],
    note: "A niche under a stepped canopy: the roof rebuilt as a solid stepped cap with a standing lantern on it, and the cult figure at the head of the room. Tags `votive_shrine`/`roadside_shrine` \u2014 bare `shrine` stays the church's.",
  }),
  rel("altar_stone", "Altar stone", "implemented", {
    wave: 7,
    tags: ["megalith", "capstone"],
    note: "A megalith: two solid courses of capstone over the chamber with an overhanging apron lip, four standing stones in the apron corners rising past it, and a three-cell dressed table inside laid off the lantern column.",
  }),
  rel("wayside_cross", "Wayside cross", "implemented", {
    wave: 7,
    tags: ["monument", "calvary"],
    note: "A cross on a stepped calvary built over the shell: a lid, two shrinking steps, a shaft and a bar of arms under its head. Inside, a kneeler and candles.",
  }),
  rel("bell_tower", "Bell tower", "implemented", {
    wave: 4,
    note: "Tall masonry shaft with a trapdoor louvre band and the bell hung under the ceiling plane at the head of it.",
  }),
  rel("obelisk", "Obelisk", "implemented", {
    wave: 7,
    tags: ["monument", "monolith"],
    note: "The tall shell dressed as one stone: banded ashlar with no openings, an apron plinth at the foot, and a pyramidion at the head closing on a cap with a spike.",
  }),
  rel("colossus", "Colossus", "implemented", {
    wave: 7,
    tags: ["monument", "statue"],
    note: "A block-built figure at landmark scale standing on the shell as its pedestal: two legs, a torso bridging them, shoulders, a head, one arm hanging and one raised with a torch. Proportions derive from the room over the plate, so a short envelope gives a herm rather than a broken figure.",
  }),

  /* --- memorial ---------------------------------------------------------- */
  mem("statue_plinth", "Statue plinth", "implemented", {
    tags: ["prop", "plaza"],
  }),
  mem("graveyard", "Graveyard", "implemented", {
    kind: "prop",
    note: "Compound prop: fenced yard, seeded headstone variety, corner mausoleum.",
  }),
  mem("mausoleum", "Mausoleum", "implemented"),
  mem("tomb", "Tomb", "implemented", {
    wave: 4,
    note: "The mausoleum's quieter cousin: sealed masonry with an apron plinth course, a slab cist and unlit candles.",
  }),
  mem("cenotaph", "Cenotaph", "implemented", {
    wave: 5,
    tags: ["monument", "empty tomb"],
    note: "A sealed masonry shell round a slab-lidded cist laid off the lantern column, a green-carpet wreath ring on the floor cells and a name wall of chiseled stone with wall banners.",
  }),
  mem("war_memorial", "War memorial", "implemented", {
    wave: 5,
    tags: ["monument", "plinth"],
    note: "A block-built figure on a chiseled plinth off the lantern column, flanking benches with their backrests to the walls, and red wall banners with unlit candles under them.",
  }),
  mem("memorial_garden", "Memorial garden", "implemented", {
    wave: 6,
    kind: "prop",
    note: "Compound prop on the graveyard's precedent: a cross path, four planted beds hedged in persistent leaves, a slab-capped monument with a carpet wreath, two benches with their backrests turned away from it and a low wall along two edges.",
  }),
  mem("gravedigger_hut", "Gravedigger's hut", "implemented", {
    wave: 5,
    tags: ["modest", "tools"],
    note: "Tool racks up one wall row, a slab coffin bench down the other, a lime composter and a fire at the far wall, and one lantern's comfort by the door.",
  }),
  mem("urn_wall", "Urn wall", "implemented", {
    wave: 5,
    tags: ["niches", "columbarium"],
    note: "Trapdoor-fronted niches from the second course to the plate up both interior wall rows, a clear aisle between them, unlit candles and a register lectern. Tags `urn_wall`/`urns` \u2014 `columbarium` is the dovecote's.",
  }),
  mem("remembrance_arch", "Remembrance arch", "implemented", {
    wave: 5,
    tags: ["monument", "arch"],
    note: "A continuous full-block crown spanning wall to wall at the top interior course with piers under it, a names band, and a carpet processional runner. Refused outright under a four-course storey.",
  }),
  mem("pyre_platform", "Funeral pyre platform", "implemented", {
    wave: 5,
    tags: ["monument", "unlit"],
    note: "A log-cribbed dais with slab tops off the lantern column carrying an UNLIT campfire, and mourners' benches back on the wall rows so the ring round it stays walkable.",
  }),

  /* --- leisure / sport --------------------------------------------------- */
  lei("gazebo", "Gazebo", "implemented", { tags: ["prop", "plaza"] }),
  lei("stadium", "Stadium", "implemented", {
    wave: 7,
    tags: ["classical", "floodlights"],
    note: "A rectangular pitch of green with a halfway line and goal lines on the rebuilt roof deck, a straight seat bank down each long side, and a floodlight mast with a lit head at each corner.",
  }),
  lei("arena", "Arena", "implemented", {
    wave: 7,
    tags: ["classical", "ring"],
    note: "The amphitheatre closed into a full elliptical ring round a floor of sand, with velarium fence masts on the crown of the bank and cage partitions in the hypogeum below.",
  }),
  lei("amphitheater", "Amphitheatre", "implemented", {
    wave: 7,
    tags: ["classical", "cavea"],
    note: "A semicircular tiered bowl on a Roman podium: the walls dressed as the substructure, the roof rebuilt as a deck, and the cavea built on it as solid columns capped by stairs whose backrests face outward. The open half carries the stage.",
  }),
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
  lei("gym", "Gymnasium", "implemented", {
    note: "Wool mats, a glass mirror wall, anvils and a hanging bag.",
  }),
  lei("boxing_gym", "Boxing gym", "implemented", {
    wave: 4,
    note: "Wool mats, a slab ring with fence corner posts on it, hanging bags and a bench row.",
  }),
  // A basin sunk into the ground with no interior to walk: a prop, not a shell.
  lei("swimming_pool", "Swimming pool", "implemented", {
    tags: ["water"],
    kind: "prop",
  }),
  lei("bathing_pavilion", "Bathing pavilion", "implemented", {
    wave: 5,
    tags: ["water", "garden"],
    note: "The bathhouse's airier cousin on the bathhouse's exact pool argument: water in the floor plane inside a smooth-quartz coping, pedestals carved from the pool corners, a divider off the lantern row and benches only where a stander fits. Tags `bathing_pavilion`/`bath_pavilion` \u2014 bare `baths`/`sauna`/`hammam` are the bathhouse's.",
  }),
  lei("sauna", "Sauna", "implemented", {
    wave: 4,
    note: "The bathhouse's dry cousin: flat slab bench tiers and a brazier plinth, no water. Tags `dry_sauna`/`sweat_lodge` \u2014 bare `sauna` is the bathhouse's.",
  }),
  lei("tennis_court", "Tennis court"),
  lei("bowling_green", "Bowling green"),
  lei("racetrack", "Racetrack"),
  lei("climbing_wall", "Climbing wall", "implemented", {
    wave: 6,
    note: "An interior hold wall: scattered stone-button holds up one tall wall face (bracketed only to full blocks, never glazing), wool crash mats painted into the floor plane, and a top ledge of a slab standing on a post.",
  }),
  lei("ski_lodge", "Ski lodge", "implemented", {
    wave: 4,
    note: "Fur rugs in the floor plane, trapdoor ski racks and a log mantel with fence antlers.",
  }),
  lei("bandstand", "Bandstand", "implemented", {
    wave: 6,
    kind: "prop",
    note: "Prop: a paved octagonal pad, eight log pillars with a fence rail between them and one arc left open as the way in, and a stepped conical roof closing on a solid finial with a flag standing on it.",
  }),
  lei("clubhouse", "Clubhouse", "implemented", {
    wave: 4,
    note: "A trophy shelf and banner honours board, lounge chairs and tables, a short bar.",
  }),

  /* --- amusement --------------------------------------------------------- */
  amu("ferris_wheel", "Ferris wheel", "implemented", {
    wave: 6,
    note: "Two log A-frames carrying a log axle, a trapdoor-and-wool rim on four axis spokes in the frames' own plane, and four gondola boxes hung under the lower arc on iron-bar links. No centre post: at this diameter the rim's own bottom cell lands in that column.",
  }),
  amu("carousel", "Carousel", "implemented"),
  amu("roller_coaster", "Roller coaster", "not_started", { tags: ["rail"] }),
  amu("helter_skelter", "Helter skelter", "implemented", {
    wave: 5,
    note: "A striped tower core with twenty-four stair treads spiralling down two laps of the ring around it, a cone crown with a solid cap and a stone entrance arch at the foot; every tread is orthogonally against the core, so the slide is supported cell by cell.",
  }),
  amu("swing_boats", "Swing boats", "implemented", { wave: 4 }),
  amu("big_top", "Big top", "implemented", {
    wave: 6,
    kind: "building",
    note: "The shell re-roofed as a great striped wool cone closing on a SOLID cap with a banner finial, king poles inside the crown rather than through the room, a sand ring recoloured into the floor plane and tiered benches on both wall rows.",
  }),
  amu("fairground_stall", "Fairground stall", "implemented", { wave: 4 }),
  amu("shooting_gallery", "Shooting gallery", "implemented", {
    wave: 5,
    note: "A booth: plank counter on two log posts, a concrete back wall with three button-on-white-concrete target reads, a prize shelf under the eaves and a striped canopy with two hanging lanterns.",
  }),
  amu("hall_of_mirrors", "Hall of mirrors", "implemented", {
    wave: 6,
    kind: "building",
    note: "A checkerboard floor plane, a mirror band of glass panes written into the wall ring over white and light-grey backing courses, and a glass-pane comb maze whose fingers leave a corridor open at both ends.",
  }),
  amu("funhouse", "Funhouse", "implemented", {
    wave: 6,
    kind: "building",
    note: "A tilted-floor read of bright bands and set-in top slabs written entirely into the floor plane, a spinning-tunnel of concentric wool rings on the far wall, and a deliberately mismatched trim round the doorway.",
  }),
  amu("ticket_booth", "Ticket booth", "implemented", { wave: 4 }),
  amu("midway_arch", "Midway arch", "implemented", {
    wave: 5,
    note: "Two striped pillar towers with a continuous block span between them, standing banners along the span and iron-bar bunting plus hung lanterns beneath it - no cube in the arch has six air faces.",
  }),
  amu("prize_wheel", "Prize wheel", "implemented", { wave: 4 }),
  amu("dodgems_pavilion", "Dodgems pavilion", "implemented", {
    wave: 6,
    kind: "building",
    note: "An open hall: a blackstone arena painted into the floor plane inside a full-block yellow kerb (never a raised rail across a one-wide walkway), a stripped-log power grid at the plate, and stair-and-trapdoor dodgem cars parked on the wall rows.",
  }),

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
    note: "Gray concrete over the whole wall field with polished fins every third column and bands at plinth and plate, small openings, an honest interior.",
  }),
  mod("conference_center", "Conference centre", "implemented", {
    wave: 5,
    note: "A slab stage dais with banner flanks, flat seat rows turned away from the stage off a three-column aisle, breakout tables and a lobby.",
  }),
  mod("parking_garage", "Parking garage", "implemented", {
    wave: 5,
    note: "Gray-and-white bay stripes in the floor plane, a stair ramp run against one wall where the storey allows, a concrete trim course, and a barrier arm beside the door.",
  }),
  mod("gas_station", "Filling station", "implemented", {
    wave: 5,
    note: "A forecourt canopy in the apron on grounded posts over iron-and-lever pumps, a convenience-store shop corner, and a wall-banner price board.",
  }),
  mod("convenience_store", "Convenience store", "implemented", {
    wave: 4,
    note: "Shelf gondolas on the seat-bank aisle discipline, a grilled counter, cold cabinets.",
  }),
  mod("data_center", "Data centre", "implemented", {
    wave: 5,
    note: "Iron server racks on the bank aisle discipline with levers standing on them, a checkered raised-floor grid, cooling cauldrons and an ops desk.",
  }),
  mod("corporate_campus", "Corporate campus"),
  mod("modern_villa", "Modern villa", "implemented", {
    wave: 5,
    note: "Flat-roofed minimalism: a white re-clad, a four-course glass band, a wall-backed floating-stair read, sparse furniture.",
  }),
  mod("billboard_tower", "Billboard tower"),

  /* --- science / education ---------------------------------------------- */
  sci("observatory", "Observatory", "implemented", {
    note: "A stepped dome with an open slit, and an instrument under it.",
  }),
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
  sci("aquarium", "Aquarium", "implemented", {
    wave: 6,
    note: "The bathhouse pool predicate verbatim - water in the floor plane, inset one cell, inside a dark-prismarine rim - plus wall tanks written into the wall ring as glass over blue concrete with dry coral specimens. The tanks are deliberately NOT fluid: a wall tank cannot be proved sealed on every envelope.",
  }),
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
  land("train_station", "Train station", "implemented", {
    wave: 6,
    tags: ["building"],
    kind: "building",
    note: "The platform hall: a rail line laid on the floor cells of one wall row (rails are passable) beside a painted platform edge, waiting benches down the other, a ticket counter and clerk's window at the head under a departure-banner board and a glazed clock roundel.",
  }),
  land("roundhouse", "Engine roundhouse", "implemented", {
    wave: 6,
    kind: "building",
    note: "The engine shed - short rail stubs off the head wall on alternate columns, an inspection pit read as a floor-plane recolour (never a hole), trapdoor tool walls down both sides and a fitter's bench. Wave three's thatched roundhouse keeps `thatched_roundhouse`/`wattle`; this id claims bare `roundhouse` plus `engine_shed`/`engine_roundhouse`.",
  }),
  land("signal_box", "Signal box", "implemented", {
    wave: 6,
    kind: "building",
    note: "The small box: a timber frame desk across the head with the levers standing on it where the storey has four courses, wall-face switches where it has three, dense mullion windows on every side, and the signalman's stool, stove and register.",
  }),
  land("locomotive", "Steam locomotive", "implemented", {
    wave: 6,
    tags: ["prop"],
    note: "Tank engine on its own ballast and rail: an octagon boiler barrel, smokebox and chimney, tall trapdoor drivers, a glazed cab with a coal bunker and a stepped pilot at the stem.",
  }),
  land("passenger_car", "Passenger car", "implemented", {
    wave: 6,
    tags: ["prop"],
    note: "A walkable carriage on two bogies - trapdoor doors, a glazed waist, stair benches either side of the aisle, hung lanterns and a slab roof walk.",
  }),
  land("freight_car", "Freight car", "implemented", {
    wave: 6,
    tags: ["prop"],
    note: "Open-top gondola wagon: ribbed side panels on a steel frame, four wheelsets and a seeded load of barrels and hay in fixed cells.",
  }),
  land("caboose", "Caboose", "implemented", {
    wave: 6,
    tags: ["prop"],
    note: "The red one: a glazed cupola over the roof, fenced end platforms with marker lanterns, and a stove pipe forward of the lookout.",
  }),
  land("level_crossing", "Level crossing"),
  land("tram_line", "Tram line"),
  land("bus_stop", "Bus stop", "implemented", {
    wave: 5,
    note: "The shelter's cheap cousin: a fence pole with a banner flag, an open-trapdoor timetable and a two-seat stair bench on a small paved pad.",
  }),
  land("transit_hub", "Transit hub", "implemented", {
    wave: 6,
    kind: "building",
    note: "The bus shelter grown into a building: bay benches down both wall rows over painted bay markers, a route wall of banners over the enquiries counter, and a kiosk corner by the way in.",
  }),
  land("stagecoach", "Stagecoach", "implemented", {
    wave: 5,
    note: "The caravan's grander cousin: an enclosed body with trapdoor doors and glass, four two-course trapdoor wheels on stripped-log axles, a driver's box, a drawbar and a fence luggage rail standing on the roof slabs.",
  }),
  land("coach_house", "Coach house", "implemented", {
    wave: 6,
    kind: "building",
    note: "The carriage bay: the middle of the room left open for the vehicle that is not there, tack racks and harness chests on the wall rows, a hay corner, and stone-brick piers under a slab cornice trimming the wide door face.",
  }),
  land("toll_house", "Toll house", "implemented", {
    wave: 6,
    kind: "building",
    note: "The gate lodge's road cousin: a toll counter with a window seat in the middle of it, a strongbox chest under an iron grille, the rate board on the wall, and a barrier outside on grounded apron posts with a trapdoor arm between them.",
  }),
  // The three bridges are the **bridge kit's** styles, not nodes: a crossing is
  // built where a route meets water, by the pass that routed it
  // (docs/INFRA-ENTRIES-v0.md §2 A). Named in `NON_NODE_IMPLEMENTED` for the
  // same reason the cellar styles are — an author needs to know they can ask,
  // and the spelling they ask with is `roads.bridgeStyle`.
  land("stone_bridge", "Stone bridge", "implemented", {
    note: "The masonry crossing: a dressed-slab deck flush with the lane, a solid coping parapet instead of a fence, revetment piers founded on the bed at the profile's pitch, and an arch haunch springing off each pier under the deck. Chosen for a span of ten columns or more.",
  }),
  land("timber_bridge", "Timber bridge", "implemented", {
    note: "The plank crossing: a top-slab deck, a fence rail on the parapet column and log piers to the bed. What every short span gets, and what the kit has always built.",
  }),
  land("suspension_bridge", "Suspension bridge", "implemented", {
    note: "The cable crossing: a tower over each abutment pier, a taut main cable of iron chain between the tower heads, and chain hangers grown downwards from it whose lengths trace the sag — stopping three blocks clear of the deck, so the walking surface keeps its head room. Chosen for a span of twenty-eight columns or more.",
  }),
  land("tunnel_portal", "Road tunnel portal"),
  land("milestone", "Milestone", "implemented", {
    wave: 5,
    note: "A single carved waypost - mossy cobble plinth with corner walls and moss carpet, two courses of chiselled stone and a slab cap.",
  }),

  /* --- transport: water -------------------------------------------------- */
  water("rowboat", "Rowboat", "implemented", { tags: ["prop", "small"] }),
  water("fishing_sloop", "Fishing sloop", "implemented", {
    tags: ["prop", "sail"],
  }),
  water("pier", "Pier", "implemented", { tags: ["prop", "shore"] }),
  water("cog", "Medieval cog", "implemented", { tags: ["prop", "sail"] }),
  water("caravel", "Caravel", "implemented", { tags: ["prop", "sail"] }),
  water("galleon", "Galleon", "implemented", {
    tags: ["prop", "sail", "large"],
  }),
  water("longship", "Longship", "implemented", { tags: ["prop", "sail"] }),
  water("junk", "Junk", "implemented", {
    wave: 6,
    tags: ["prop", "sail"],
    note: "Battened lugsails - wool panels with a trapdoor batten every other course - on three masts, over a slab-sided transom hull with a two-stage poop.",
  }),
  water("gondola", "Gondola", "implemented", {
    wave: 6,
    tags: ["prop", "small"],
    note: "The narrowest hull in the catalog: one column of beam, a black sheer, an iron ferro at the stem and a single oar post aft.",
  }),
  water("barge", "Barge", "implemented", {
    wave: 6,
    tags: ["prop"],
    note: "Flat cargo hull with a slab coping, open hold rows drawn from the barge's own seed, a glazed tiller hut aft and a banner name-board.",
  }),
  water("paddle_steamer", "Paddle steamer", "implemented", {
    wave: 6,
    tags: ["prop", "large"],
    note: "Side paddle boxes with trapdoor wheels in the housings, a promenade deck with fence rails, a texas and wheelhouse, and twin black stacks.",
  }),
  water("ferry", "Ferry", "implemented", { tags: ["prop"] }),
  water("yacht", "Yacht", "implemented", { tags: ["prop"] }),
  water("speedboat", "Speedboat", "implemented", { tags: ["prop", "small"] }),
  water("tugboat", "Tugboat", "implemented", { tags: ["prop"] }),
  water("fishing_trawler", "Fishing trawler", "implemented", {
    tags: ["prop"],
  }),
  water("lighthouse", "Lighthouse", "implemented", {
    wave: 6,
    tags: ["tower", "beacon"],
    kind: "building",
    note: "The beacon spire, maritime: white-and-red terracotta bands from plinth to plate, a solid gallery deck with a parapet over the plate, and a sea-lantern lamp on a continuous masonry column raised from it. Keeper's room below; the shell owns the way up.",
  }),
  water("container_ship", "Container ship", "implemented", {
    wave: 6,
    tags: ["prop", "large"],
    note: "The modern giant at the galleon's extents: coloured container stacks on hatch covers over a coamed hold, a bulbous stem and a bridge castle with wings and a funnel aft.",
  }),
  // Built today by `precinct.harbour@0` — the precinct-credit doctrine
  // (docs/INFRA-ENTRIES-v0.md, ratified 2026-08-14): a structure a precinct
  // builds IS implemented; the ids live in NON_NODE_IMPLEMENTED because no
  // node names them directly.
  water("harbour_wall", "Harbour wall", "implemented", {
    note: "The mole the harbour precinct raises around its basin — ask for a harbour and the wall comes with it.",
  }),
  water("quay", "Quay", "implemented", {
    note: "The harbour precinct's dressed working edge, cranes and bollards included.",
  }),
  water("slipway", "Slipway"),
  water("marina", "Marina"),
  water("boathouse", "Boathouse", "implemented", {
    wave: 6,
    kind: "building",
    note: "A hall over a water slip: the bathhouse's boxed-pool predicate verbatim - water in the floor plane inset one cell from the interior on every side, rimmed with a solid coping - a hauled-out stair-and-slab rowboat on the slip rim, and trapdoor oar racks.",
  }),
  water("shipyard", "Shipyard", "implemented", {
    wave: 6,
    kind: "building",
    note: "A hull under construction: a stripped-log keel offset off the lantern lane, ribs standing on solid floor beside it and rising only where the storey has the height, fence-and-slab scaffolds on the ground, and plank stores down one range.",
  }),
  water("buoy", "Buoy", "implemented", { tags: ["prop", "small"] }),

  /* --- transport: air ---------------------------------------------------- */
  air("airship", "Airship", "implemented", { tags: ["prop", "large"] }),
  air("zeppelin_mast", "Mooring mast", "implemented", { tags: ["prop"] }),
  air("hot_air_balloon", "Hot air balloon", "implemented", {
    wave: 6,
    tags: ["prop"],
    note: "A hollow wool envelope in two gores held over a fence-and-trapdoor basket by a timber mast that reaches the ground - a moored balloon rather than a floating one - with a campfire burner on a full-cube pedestal.",
  }),
  air("biplane", "Biplane", "implemented", { tags: ["prop"] }),
  air("light_plane", "Light aeroplane", "implemented", {
    tags: ["prop", "small"],
  }),
  air("airliner", "Airliner", "implemented", { tags: ["prop", "large"] }),
  air("cargo_plane", "Cargo plane", "implemented", { tags: ["prop", "large"] }),
  air("seaplane", "Seaplane", "implemented", {
    wave: 6,
    tags: ["prop"],
    note: "The light aeroplane on floats: two stepped pontoons on the ground carrying cross-strutted gear up to the keel, a high wing with lift struts and a bar propeller.",
  }),
  air("glider", "Glider", "implemented", {
    wave: 6,
    tags: ["prop", "small"],
    note: "Almost all wing - 25 blocks of span, three chords at the root and two at the tip - over a slim pod on a skid, with a wingtip resting on the grass.",
  }),
  air("hangar", "Hangar", "implemented", { tags: ["prop", "building"] }),
  air("control_tower", "Control tower", "implemented", {
    wave: 6,
    kind: "building",
    note: "The watchtower modernized: a concrete shaft re-clad from plinth to plate, a glazed top from the facade defaults (tall, dense), console desks with wall-face switches, and a radar dish on a continuous column raised from the solid roof deck.",
  }),
  air("airport_terminal", "Airport terminal", "implemented", {
    wave: 6,
    kind: "building",
    note: "Check-in counters across the head, departure rows on the school's aisle discipline, gates read as painted floor bands under numbered banners, and baggage barrows by the way in.",
  }),
  air("runway", "Runway", "implemented", { tags: ["prop", "linear"] }),
  air("helipad", "Helipad", "implemented", {
    wave: 6,
    tags: ["prop"],
    note: "prop.place@0: a marked concrete disc with a white ring and an H, four edge lanterns, and a corner mast carrying a wall-banner windsock.",
  }),
  air("windsock", "Windsock"),

  /* --- infrastructure ---------------------------------------------------- */
  // The `between` form's carried client (docs/INFRA-ENTRIES-v0.md §3.2, landed
  // 2026-08-15). Not a sweep and never was: a swept datum follows the ground
  // and the whole read of an arcade is that the water on it does not.
  infra("aqueduct", "Aqueduct", "implemented", {
    tags: ["water", "size_lin"],
    note: 'infra.entry@0 `"between"` two anchors: a level masonry channel nine courses up on an arcade, three columns of held water between lined walls with a maintenance walk outside each, and piers to the ground every seven columns so the passage under it stays open at grade. The water is written whole or not at all, so a trough that cannot be sealed comes out dry rather than leaking.',
  }),
  // The ground contract's first `structure.linework` client (rank 25, tier A —
  // GROUND-CONTRACT §13.2's 2026-08-17 amendment). The aqueduct's sibling, and
  // the one member of the carried family whose deck something walks onto.
  infra("viaduct", "Viaduct", "implemented", {
    tags: ["size_lin"],
    note: 'infra.entry@0 `"between"` two anchors: a seven-wide masonry carriageway eleven courses up on an arcade, a rail course down each edge, and piers to the ground every seven columns so the passage under it stays open at grade. Its two approach embankments are declared through the ground contract at rank 25 before the streets exist, so a lane crossing one passes through by declaration rather than by rank, and a street that meets the deck joins it instead of cutting it.',
  }),
  infra("water_tower", "Water tower", "implemented", {
    wave: 6,
    kind: "building",
    note: "A rebuilt solid roof deck carrying an iron-banded tank that rises course on course from it and closes on a full-block cap, grounded corner legs, an apron ladder up the west face, and a valve house of cauldrons inside. Plain rect, and wants height over the plate.",
  }),
  infra("cistern", "Cistern", "implemented", {
    wave: 6,
    kind: "building",
    note: "The bathhouse pool predicate verbatim, as pure storage: water in the floor plane inset one cell from the interior, a smooth-stone rim, a slab divider nudged off the lantern row, measuring posts carved out of the pool's own corners - and an inspection walkway that carries nothing at all.",
  }),
  infra("well", "Well", "implemented", {
    wave: 6,
    kind: "building",
    note: "The street prop's building cousin: a covered well house with a cauldron draw hole, a dressed coping in the floor plane, two fence posts carrying a log windlass axle, an iron-bar rope on tall storeys, and a bucket bench. Tags `well`/`well_house`; `well_head` stays the prop's.",
  }),
  infra("pumping_station", "Pumping station", "implemented", {
    wave: 6,
    kind: "building",
    note: "A flywheel read as a hub on a solid post with trapdoor spokes on the wall beside it, iron pump-rod columns down the far wall, a gauge wall of buttons and levers on solid masonry, and an unlit boiler corner.",
  }),
  infra("culvert", "Culvert"),
  infra("storm_drain", "Storm drain"),
  infra("retaining_wall", "Retaining wall", "implemented", {
    tags: ["size_lin"],
    note: 'infra.entry@0 `"along"` or `"ring"`, family B: a declared face between two levels at `retaining.seam` rather than masonry stood on a slope — one dressed course at the lip and a two-column terrace behind it, three blocks over the ground the wall stands on. A street that crosses stays open, because there the street is the connection between the levels.',
  }),
  infra("power_pylon", "Power pylon"),
  // A mast is a declared box and a yaw, not a line over ground nobody owns
  // (docs/INFRA-ENTRIES-v0.md family E, 2026-08-14).
  infra("radio_mast", "Radio mast", "not_started", { kind: "prop" }),
  infra("telegraph_line", "Telegraph line", "implemented", {
    tags: ["size_lin"],
    note: 'infra.entry@0 `"between"` two anchors: timber poles every twelve columns following the ground, an iron-bar wire strung head to head with barely any sag, and a pole that would stand in a street dropped so the wire crosses over it instead.',
  }),
  infra("street_lamp_run", "Street lighting run"),
  infra("city_gate", "City gate"),
  infra("terrace_steps", "Terrace steps", "implemented", {
    tags: ["size_lin"],
    note: 'infra.entry@0 `"across"` a face, family B: the flight that makes one passable. The datum follows the hillside a course at a time and the levels go through the ground contract, so the run is terrain the walker climbs rather than stair blocks laid on a slope. A cheek on each hand.',
  }),

  /* --- waterworks -------------------------------------------------------- */
  // The three water movers (docs/INFRA-ENTRIES-v0.md families B and D, landed
  // 2026-08-15). All three are `infra.entry@0` rows whose real content is a
  // `fluid.channel` declaration — rank 0, tier A — rather than a cross-section:
  // what makes a dam a dam is that the water behind it is somewhere else.
  wat("dam", "Dam", "implemented", {
    tags: ["water", "size_lin"],
    note: 'infra.entry@0 `"across"` a watercourse: a masonry line with a walkable crest between parapets, the valley behind it impounded up to five blocks over the natural surface, and a dressed face cut into the mass. The head steps down until the pool closes, so it never floods what it cannot hold.',
  }),
  wat("weir", "Weir", "implemented", {
    tags: ["water", "size_s"],
    note: "The low-water sibling: a dressed lip a single block over the natural surface with a rough shoulder either side, and no parapet. Zero freeboard, so the pool comes right to the lip and the step reads as the thing water goes over.",
  }),
  wat("canal_lock", "Canal lock", "implemented", {
    tags: ["water", "size_m"],
    note: "A chamber on a watercourse: two closed timber gates a narrowboat apart, stone catwalks flanking each leaf, walls round a dug flat floor, and the water inside standing at the upper reach. Sculpture with correct water — no moving parts.",
  }),
  wat("canal_basin", "Canal basin"),
  wat("sluice_gate", "Sluice gate"),
  // Family E again (docs/INFRA-ENTRIES-v0.md, 2026-08-14): the waterworks
  // group's `infrastructure` kind is the builder's default, and a mill is a
  // shell with an interior — a building.
  wat("watermill", "Watermill", "not_started", { kind: "building" }),
  // A standing machine, not a network: it pumps where it stands.
  wat("windpump", "Windpump", "implemented", { kind: "prop" }),
  wat("millpond", "Millpond"),
  wat("reservoir", "Reservoir"),
  wat("drydock", "Dry dock", "implemented", { tags: ["prop"] }),
  // Family E: a pontoon in one envelope, no network in it — a prop.
  wat("floating_dock", "Floating dock", "not_started", { kind: "prop" }),
  wat("fish_ladder", "Fish ladder"),
  // Family E: a hut is a shell with an interior — a building.
  wat("fishing_hut", "Fishing hut", "not_started", { kind: "building" }),
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
  nom("campsite", "Campsite", "implemented", {
    note: "Compound prop: two tents, a caravan, a fire and the seating round it.",
  }),
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
  rur("farmstead", "Farmstead", "implemented", {
    wave: 7,
    tags: ["village", "farm"],
    note: "A timber-framed farmhouse on a cobble plinth: table and hearth-side cauldron inside, composter and stores at the far wall, a trough and bales out in the yard.",
  }),
  rur("silo", "Silo", "implemented", {
    wave: 4,
    note: "Banded stone-brick re-clad under a corbelled cap, hay grain columns behind inspection hatches and a filling head of trapdoors near the plate.",
  }),
  rur("greenhouse", "Greenhouse", "implemented", {
    note: "Glazed walls and roof over farmland beds written into the floor plane.",
  }),
  rur("apiary", "Apiary", "implemented", {
    wave: 4,
    note: "Hay skeps on grounded fence pedestals and real beehives in the apron ring, honeycomb-flecked walls and a cauldron extraction bench inside.",
  }),
  rur("chicken_coop", "Chicken coop", "implemented", {
    wave: 4,
    note: "A low birch-and-oak house of trapdoor nesting cubbies over hay, floor-standing fence roosts, feed barrels and a hay nest in the apron.",
  }),
  rur("pigsty", "Pigsty", "implemented", {
    wave: 7,
    tags: ["farm"],
    note: "A packed-mud hut with a mud wallow written into its floor plane, standing inside a two-course fence pen whose gate is at the far side and whose entrance is the doorstep.",
  }),
  rur("sheepfold", "Sheepfold", "implemented", {
    wave: 7,
    tags: ["farm"],
    note: "The shepherd's stone hut inside a single-course dry-stone fold, fleeces on the wall row and a dip by the far wall.",
  }),
  rur("cattle_pen", "Cattle pen", "implemented", {
    wave: 7,
    tags: ["farm"],
    note: "A boarded byre in a post-and-rail corral with solid log corner posts, hay and hay-net trapdoors down one wall row and a trough down the other.",
  }),
  rur("stable", "Stable", "implemented", {
    wave: 4,
    note: "Fence-and-gate stall partitions down one wall row off an off-centre corridor, hay-net trapdoors, a tack wall of chests and barrels and a cauldron trough in the apron.",
  }),
  rur("dovecote", "Dovecote", "implemented", {
    wave: 4,
    note: "A slim stone tower whose faces are a dense nesting-hole trapdoor grid, a corbelled cone with a perch finial and a ladder up the inside.",
  }),
  rur("orchard", "Orchard", "implemented", {
    wave: 7,
    tags: ["farm"],
    note: "The fruit store standing in its trees: single-column oak trunks under two courses of crown every third apron cell, barrels and a picking ladder inside.",
  }),
  rur("vineyard", "Vineyard", "implemented", {
    wave: 7,
    tags: ["farm"],
    note: "The vintner's stone shed between trellis rows — fence posts under a leaf canopy with sweet-berry fruit between them — over barrels and a cauldron vat.",
  }),
  rur("terraced_field", "Terraced field", "implemented", {
    wave: 7,
    tags: ["farm"],
    note: "The field house on the lip of its terrace: dry-stone banded walls, and an apron of farmland under mature wheat in the farm precinct's own crop vocabulary.",
  }),
  rur("hop_kiln", "Hop kiln", "implemented", {
    wave: 4,
    note: "The oast: a brick corbel cone on a solid cap under a white cowl, a slatted drying-floor band under the plate and a furnace at the base.",
  }),
  rur("threshing_floor", "Threshing floor", "implemented", {
    wave: 7,
    tags: ["farm"],
    note: "A swept smooth-stone floor plane under a boarded shed, sheaves down one wall row and winnowing baskets and the grain store down the other.",
  }),
  rur("hayrick", "Hayrick"),
  rur("cider_press", "Cider press", "implemented", {
    wave: 4,
    note: "A fence screw under a slab platen beside its catching cauldron, apple barrels along the far row and a bottle shelf of trapdoors.",
  }),
  rur("root_cellar_mound", "Root cellar mound", "implemented", {
    wave: 4,
    note: "Cobble-and-mud retaining walls under a shallow grass-surfaced corbel mound, shelved with barrels and crates under lidded hatches. It does not dig.",
  }),

  /* --- fantasy / whimsy ---------------------------------------------------- */
  fan("wizard_tower", "Wizard's tower", "implemented", {
    note: "Glowstone-set masonry under a steep cone.",
  }),
  fan("alchemists_tower", "Alchemist's tower", "implemented", {
    wave: 5,
    tags: ["tower", "lab"],
    note: "Copper-banded stone brick under a corbelled cone on a solid cap with a lightning-rod vent; a brewing stand, the still, specimen shelves behind hatch fronts and a reading press. Tags `alchemists_tower`/`alchemy_tower` \u2014 bare `alchemist` is the apothecary's.",
  }),
  fan("treehouse", "Treehouse", "implemented", {
    kind: "prop",
    note: "Compound prop: a mega trunk it grows itself, a deck, a hut and a ladder.",
  }),
  fan("hedge_maze", "Hedge maze", "implemented", {
    wave: 6,
    note: "Built as a BUILDING so the maze can be proved walkable: persistent oak-leaf hedges on coarse-dirt beds in a comb whose fingers leave a corridor open at both ends, every cell taken through the ground floor's own connectivity guard, in a mossy walled garden with grounded apron urns.",
  }),
  fan("mushroom_house", "Mushroom house", "implemented", {
    wave: 4,
    note: "A corbelled red-mushroom cap closing on a solid cap block, over spotted mushroom-stem walls; a stool, a table and shroom stores inside.",
  }),
  fan("witch_hut", "Witch's hut", "implemented", {
    wave: 4,
    note: "Swamp spruce over a dark under-course under a crooked saltbox ridge, with a corner cauldron, potion bookshelves and a carpet cushion.",
  }),
  fan("hobbit_hole", "Hobbit hole", "implemented", {
    wave: 4,
    note: "A stripped-log ring trimming the doorway round, a turf corbel roof over mud walls, and a settle, a rug and a pantry inside.",
  }),
  fan("gingerbread_cottage", "Gingerbread cottage", "implemented", {
    wave: 4,
    note: "Brown biscuit walls with white icing courses and pink and lime candy dots, a quartz icing eave in the apron and a sweets counter with a cake.",
  }),
  fan("dragon_roost", "Dragon roost", "implemented", {
    wave: 5,
    tags: ["hall", "charred"],
    note: "A great open hall in blackstone and basalt with a scorched floor recolour, an open-sided nest crescent of hay and bone laid off the lantern column, and a sparing hoard corner.",
  }),
  fan("floating_platform", "Floating island platform", "implemented", {
    wave: 6,
    kind: "prop",
    note: "Prop. The trick is a disguised stem: a one-column end-stone core veiled on all four sides with iron bars (never chain), carrying a disc that oversails it by three cells in every direction - the eye reads the overhang, not the thread under it.",
  }),
  fan("portal_frame", "Portal frame", "implemented", {
    wave: 6,
    kind: "prop",
    note: "Prop: an obsidian and crying-obsidian rectangle with a chiseled-deepslate keystone and a DELIBERATELY empty interior - no portal block anywhere - over four deepslate rune pedestals with amethyst clusters on them.",
  }),
  fan("crystal_shrine", "Crystal shrine", "implemented", {
    wave: 5,
    tags: ["amethyst", "focus"],
    note: "An amethyst pedestal with a cluster on it, standing off the lantern column, in purpur-and-quartz trim, with kneeling benches whose backrests point away from the crystal.",
  }),
  fan("elven_bridge", "Elven bridge"),
  fan("dwarven_gate", "Dwarven gate", "implemented", {
    wave: 5,
    tags: ["gate", "forge"],
    note: "A deepslate megalith trim round the doorway with a chiseled rune band, grounded brazier pedestals in the apron, and a forge hall of anvil, smithing table and lit furnace inside.",
  }),
  fan("beacon_spire", "Beacon spire", "implemented", {
    wave: 5,
    tags: ["tower", "light"],
    note: "A slim corbelled cone closing on a SOLID smooth-stone cap with a sea-lantern crown standing on it, and a keeper's room below. Tags `beacon_spire`/`spire` \u2014 bare `beacon` is left free.",
  }),
  fan("giant_chessboard", "Giant chessboard"),
  fan("fairy_ring", "Fairy ring"),
  fan("clock_tower", "Clock tower"),

  /* --- ruins / archaeology ------------------------------------------------- */
  // Wave 6E's monuments are PROPS, not buildings: a megalith has no room in
  // it, and the building grammar exists to make rooms. Each therefore carries
  // a `kind` override, exactly as the graveyard and the cairn already do.
  ruin("standing_stones", "Standing stones", "implemented", {
    wave: 6,
    kind: "prop",
    note: "A seeded ring of megalith PAIRS on a turf pad, each stone a stack of two to four courses resting on the pad, with a low altar slab at the centre.",
  }),
  ruin("henge", "Henge", "implemented", {
    wave: 6,
    kind: "prop",
    note: "The big ring: a banked earth rim of full blocks and eight trilithons \u2014 two posts with a LINTEL lying across both, its span one cell so no lintel block is more than a cell from a post head.",
  }),
  ruin("monolith", "Monolith", "implemented", {
    wave: 6,
    kind: "prop",
    note: "One great banded stone that LEANS, read as offset courses \u2014 the 2x2 footprint shifts one cell every third course, so every block still rests on stone \u2014 over a mossy skirt.",
  }),
  // A heap of stones. There has never been anything to walk into.
  ruin("cairn", "Cairn", "implemented", { kind: "prop" }),
  ruin("burial_mound", "Burial mound", "implemented", {
    wave: 6,
    kind: "prop",
    note: "A sod corbel dome closing on a SOLID cap, with a stone-framed doorway READ backed solid \u2014 no interior, because a sealed chamber is a pocket and an open one is a building.",
  }),
  ruin("dig_site", "Dig site", "implemented", {
    wave: 6,
    kind: "prop",
    note: "A roped trench as a shallow recolour of coarse dirt and packed mud (never plain mud), grounded peg-and-rope fences, a finds barrel with a banner marker, and a spoil heap.",
  }),
  ruin("excavation_trench", "Excavation trench"),
  ruin("fossil_dig", "Fossil dig", "implemented", {
    wave: 6,
    kind: "prop",
    note: "The dig site with bone-block ribs half-exposed in the recolour bed: a spine laid flush in the base plane and rib blocks standing one course proud on it.",
  }),
  // The ruined *buildings* stay buildings: each is the ordinary shell fit-out
  // decayed, so each has a room, a door and a walkable floor.
  ruin("ruined_cottage", "Ruined cottage", "implemented", {
    wave: 6,
    tags: ["ruin-of"],
    note: "The reference decay: an even crumble line two or three courses up, mossy-cobble survivors, the roof gone but for fragments resting on surviving wall heads, rubble heaps and vines.",
  }),
  ruin("ruined_keep", "Ruined keep", "implemented", {
    wave: 6,
    tags: ["ruin-of"],
    note: "A structured collapse: the four corners stand to the eave plate and the curtains between them are gone almost to the plinth, in cracked and mossy stone brick over a heavy rubble field.",
  }),
  ruin("ruined_church", "Ruined church", "implemented", {
    wave: 6,
    tags: ["ruin-of"],
    note: "A roofless nave with tall survivors and a chiseled band at the third course, and a cold altar stump \u2014 one chiseled block with a slab on it \u2014 at the end furthest from the door.",
  }),
  ruin("ruined_bridge", "Ruined bridge", "not_started", { tags: ["ruin-of"] }),
  ruin("ruined_aqueduct", "Ruined aqueduct", "not_started", {
    tags: ["ruin-of"],
  }),
  ruin("collapsed_tower", "Collapsed tower", "implemented", {
    wave: 6,
    tags: ["ruin-of"],
    note: "The one LEANING collapse: the surviving wall height falls off linearly along +x, so the wall head slopes from a standing stub to nothing, with a heavy grounded spill in the apron.",
  }),
  ruin("overgrown_villa", "Overgrown villa", "implemented", {
    wave: 6,
    tags: ["ruin-of"],
    note: "The gentlest crumble and the greenest: moss-block survivors, vines on every second inside face, moss carpet on the rubble, and a run of fallen column drums down one wall row.",
  }),
  ruin("sunken_ship", "Sunken ship", "not_started", {
    tags: ["ruin-of", "water"],
  }),
  ruin("ancient_road", "Ancient road"),
  ruin("shattered_obelisk", "Shattered obelisk", "implemented", {
    wave: 6,
    kind: "prop",
    note: "The obelisk broken: a ragged 2x2 stump on its plinth, the fallen upper section lying along the pad beside it (every block grounded or on the run), and a scatter of fragments.",
  }),

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
  und("ossuary", "Ossuary", "implemented", {
    wave: 6,
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "ossuary" } - bone in the walls, skulls and bone blocks in the niches, bone stacks on the floor.',
  }),
  und("undercroft", "Undercroft", "implemented", {
    wave: 6,
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "undercroft" } - dry vaulted stone with a course of stair springers, crates and a working table. The springers want a cellar 4 deep or more.',
  }),
  und("dungeon_room", "Dungeon room", "implemented", {
    wave: 6,
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "dungeon_room" } - mossy cobble, iron bars set into the wall ring, straw and a cauldron. The bars are never across the way out.',
  }),
  und("vault", "Vault", "implemented", {
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "vault" } — bar gate, dense chests and barrels.',
  }),
  und("wine_cellar", "Wine cellar", "implemented", {
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "wine_cellar" } — stacked barrel walls and a bottle gesture.',
  }),
  und("root_cellar", "Root cellar", "implemented", {
    wave: 6,
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "root_cellar" } - packed mud and coarse dirt, board shelves cut into the wall with jars and crates on them, sacks and a composter.',
  }),
  und("smugglers_cove", "Smugglers\' cove", "implemented", {
    wave: 6,
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "smugglers_cove" } - rough mossy cobble with the chests hidden in wall niches rather than stood on the floor.',
  }),
  und("sewer_network", "Sewer network", "implemented", {
    wave: 6,
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "sewer_network" } - a brick channel with a contained water runnel sunk into the floor slab and slab grates over it. The NETWORK is deliberately not built: a network of galleries is tunnel machinery, and a cellar style is one room.',
  }),
  und("cistern_hall", "Cistern hall", "implemented", {
    wave: 6,
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "cistern_hall" } - a boxed tank sunk into the floor slab with a lit walk round it. The bathhouse pool predicate, taken underground.',
  }),
  und("bunker_complex", "Bunker complex", "implemented", {
    wave: 6,
    kind: "building",
    tags: ["village", "underground", "archetype"],
    note: "building.grammar@0 archetype: a concrete blockhouse that digs itself a `bunker`-style cellar - the mine head\'s pattern, entrance above and archetype below.",
  }),
  und("subway_station", "Subway station", "implemented", {
    wave: 6,
    kind: "building",
    tags: ["village", "underground", "archetype", "transport"],
    note: "building.grammar@0 archetype: a ticket hall over a `subway`-style cellar - platform, rail and tile. Tags: subway_station/metro_station/underground_station; bare `station` stays unclaimed.",
  }),
  und("hermit_grotto", "Hermit\'s grotto", "implemented", {
    wave: 6,
    tags: ["grammar-stage", "style"],
    note: '"basement": { "style": "hermit_grotto" } - natural stone in three shades, a cot, a lectern, a composter and a candle shrine.',
  }),
  und("underground_silo", "Underground silo", "implemented", {
    wave: 6,
    kind: "building",
    tags: ["village", "underground", "archetype"],
    note: "building.grammar@0 archetype: a hatch hut over a `silo`-style cellar - deepslate, a copper band and a shaft read. Tags: underground_silo/missile_silo; bare `silo` is the homestead\'s.",
  }),

  /* ========================================================================
   * The catalog-expansion form packs (docs/CATALOG-EXPANSION-v0.md §3).
   *
   * Nine packs, landed together as open territory. Every row here is
   * `not_started` — no generator answers to any of them yet — and each pack is
   * kept contiguous rather than filed by category, because a pack ships and is
   * accepted as one thing. The `tags` carry the pack name and the doc's size
   * class, which the schema has no field for. One entry the doc proposes is
   * deliberately absent: `sphinx` goes to the bespoke tier.
   * ====================================================================== */

  /* --- the classical Mediterranean pack (docs/CATALOG-EXPANSION-v0.md §3.1) --- */
  com("stoa", "Stoa", "implemented", {
    tags: ["classical_mediterranean", "size_xl"],
    note: "The agora's long side: a two-deep colonnade of the full run with a closed shop wall behind it, so the street face is columns and the back is trade.",
  }),
  res("peristyle_house", "Peristyle house", "implemented", {
    tags: ["classical_mediterranean", "size_m"],
    note: "The courtyard house with its court colonnaded — a post ring standing on a stylobate course one cell in from the wall, rooms opening only inward.",
  }),
  res("megaron", "Megaron", "implemented", {
    tags: ["classical_mediterranean", "size_l"],
    note: "The palace hall: a deep porch of two columns in antis between projecting wall stubs, one long room behind it, a raised hearth ring off the lantern column.",
  }),
  civ("propylaea", "Propylaea", "implemented", {
    tags: ["classical_mediterranean", "size_l"],
    note: "A gateway that is only a gateway — a columned front and back with a through-passage and no room at all, straddling the way into a sanctuary.",
  }),
  civ("bouleuterion", "Bouleuterion", "implemented", {
    tags: ["classical_mediterranean", "size_m"],
    note: "The council chamber's ancient parent: stepped seating in a half-ring turned to a speaker's floor, roofed, with the entry cut through the flat side.",
  }),
  rel("peripteral_temple", "Peripteral temple", "implemented", {
    tags: ["classical_mediterranean", "size_l"],
    note: "The colonnade on all four sides, a solid cella inside it, a pediment gable over the short face. The generic `temple` (Track A) stays the cella-and-porch one.",
  }),
  rel("tholos", "Tholos", "implemented", {
    tags: ["classical_mediterranean", "size_m"],
    note: "The round one: a ring of columns on a stepped circular crepidoma under a shallow conical roof, a drum wall inside the ring.",
  }),
  rel("sanctuary_treasury", "Treasury", "implemented", {
    tags: ["classical_mediterranean", "size_s"],
    note: "A miniature temple with two columns and no room to speak of — the votive building a sanctuary carries a dozen of.",
  }),
  lei("palaestra", "Palaestra", "implemented", {
    tags: ["classical_mediterranean", "size_l"],
    note: "A square sand court with a colonnade on all four sides and changing cells behind one range; the middle is deliberately empty.",
  }),
  lei("gymnasion", "Gymnasion", "implemented", {
    tags: ["classical_mediterranean", "size_xl"],
    note: "The palaestra plus a covered running track down one long flank — the longest colonnade in the pack.",
  }),
  lei("odeon", "Odeon", "implemented", {
    tags: ["classical_mediterranean", "size_l"],
    note: "The roofed small theatre: stepped seating in a half-ring under a full roof, a low stage wall across the chord.",
  }),
  lei("hippodrome_spina", "Spina", "implemented", {
    kind: "prop",
    tags: ["classical_mediterranean", "size_xl"],
    note: "The racecourse's central barrier — a long low plinth with turning posts at both ends and an obelisk or two standing on it.",
  }),
  // The three infrastructure-kind rows of this pack carry a **`kind`
  // override**, because the honest answer to "how is it realised" changed when
  // it was built: a colonnade and an arch are placed objects with a declared
  // box, which is what a prop is, and the registry that answers to them is
  // `PROP_GENERATORS`. The override is the only way the exception stays
  // visible where it is made. `acropolis_terrace` keeps `infrastructure` and
  // keeps `not_started`: it is the retaining pass's client, and neither the
  // building grammar nor the prop registry can host a wall that retains ground
  // it did not make.
  infra("agora_colonnade", "Free-standing colonnade", "implemented", {
    kind: "prop",
    tags: ["classical_mediterranean", "size_lin"],
    note: "A sweep client: columns at a fixed interval on a stylobate with a continuous entablature over them, following a street or a square's edge.",
  }),
  mem("triumphal_arch", "Triumphal arch", "implemented", {
    kind: "prop",
    tags: ["classical_mediterranean", "size_l"],
    note: "The arch that spans a road, not a room: piers either side of the carriageway, a continuous crown, an attic band of names over it.",
  }),
  civ("rostra", "Rostra", "implemented", {
    kind: "prop",
    tags: ["classical_mediterranean", "size_m"],
    note: "The speaker's platform in a forum: a stepped masonry dais with a rail, facing the open ground.",
  }),
  street("herm_post", "Herm", "implemented", {
    tags: ["classical_mediterranean", "size_xs"],
    note: "A square shaft with a blocky head course on it, at corners and boundaries. The cheapest classical repeat in the pack, and the saturation piece.",
  }),
  mem("votive_column", "Votive column", "implemented", {
    kind: "prop",
    tags: ["classical_mediterranean", "size_m"],
    note: "One column standing alone on a plinth with a figure, urn or tripod on its capital.",
  }),
  ruin("column_drums", "Fallen column drums", "implemented", {
    kind: "prop",
    tags: ["classical_mediterranean", "size_m"],
    note: "A row of cylinder drums lying where the shaft fell, half in the grass, with the capital at the end of the run.",
  }),
  water("ship_shed", "Ship shed", "implemented", {
    kind: "building",
    tags: ["classical_mediterranean", "size_xl"],
    note: "The neosoikos: a long open-fronted shed running down to the water on a slipway floor, one hull's width, in a row of its own kind.",
  }),
  water("trireme", "Trireme", "implemented", {
    tags: ["classical_mediterranean", "size_l"],
    note: "The oared warship: a low slim hull with a bronze ram at the stem, a single square sail, oar ports in two banks and an eye painted at the bow.",
  }),
  wat("nymphaeum", "Nymphaeum", "implemented", {
    kind: "building",
    tags: ["classical_mediterranean", "size_m"],
    note: "The monumental fountain: a niched screen wall with basins under it, water in the floor plane on the bathhouse's pool predicate.",
  }),
  infra("acropolis_terrace", "Sanctuary terrace", "implemented", {
    tags: ["classical_mediterranean", "size_lin"],
    note: 'infra.entry@0 `"ring"` or `"along"`, family B\'s grandest row: two columns of polygonal face six blocks proud and a four-column peribolos behind it, declared as a face so the sanctuary stands on its own ground. Votives at a long pitch on the walk. The stair into the face is `terrace_steps` placed across the same seam.',
  }),
  rur("olive_press", "Olive press", "implemented", {
    tags: ["classical_mediterranean", "size_s"],
    note: "A stone trough press with a beam and weight stone, jars ranked along the far wall.",
  }),
  com("pithos_store", "Pithos store", "implemented", {
    kind: "prop",
    tags: ["classical_mediterranean", "size_s"],
    note: "Great storage jars sunk to the shoulder in a paved yard, lids beside them — the classical warehouse, outdoors.",
  }),

  /* --- the nautical & pirate pack (docs/CATALOG-EXPANSION-v0.md §3.2) --- */
  mil("jolly_roger_mast", "Jolly roger mast", "implemented", {
    kind: "prop",
    tags: ["nautical_pirate", "size_m"],
    note: "A ship's mast standing on land over the harbour with a black banner at the head and a yard crossing it — the pirate icon, and it costs two hundred blocks.",
  }),
  civ("gallows", "Gallows", "implemented", {
    kind: "prop",
    tags: ["nautical_pirate", "size_s"],
    note: "Two posts, a beam, a noose of chain and a trap platform, on a paved point where the harbour can see it.",
  }),
  civ("gibbet_cage", "Gibbet cage", "implemented", {
    kind: "prop",
    tags: ["nautical_pirate", "size_xs"],
    note: "An iron-bar cage hung from a single arm at a crossroads. Repeats cheaply; three of them say more than one gallows.",
  }),
  water("careening_beach", "Careening beach", "implemented", {
    kind: "infrastructure",
    tags: ["nautical_pirate", "size_l"],
    note: "A hull hove down on its side on the sand, tackle running from the mastheads to shore anchors, fires and pitch barrels under it. Realised as a PROP: it sits in one envelope and follows no route, so the prop registry is its honest host — the `curtain_wall` precedent for an infrastructure entry with no network in it.",
  }),
  ruin("beached_wreck", "Beached wreck", "implemented", {
    kind: "prop",
    tags: ["nautical_pirate", "size_l"],
    note: "A broken hull driven up the strand — ribs open to the sky, the stern half gone, cargo spilled up the tideline. Distinct from Track A's submerged `sunken_ship`.",
  }),
  mil("cannon_battery", "Shore battery", "implemented", {
    kind: "infrastructure",
    tags: ["nautical_pirate", "size_lin"],
    note: "A firing platform with a parapet two courses proud on the seaward hand, a gun on its truck at every bay in front of it and the powder behind. `infra.entry@0`, `along` a shore or `ring` a headland; the gun is `martello_tower`'s dark cube stood on its truck.",
  }),
  mil("powder_magazine", "Powder magazine", "implemented", {
    tags: ["nautical_pirate", "size_s"],
    note: "Set apart from everything: thick buttressed walls, a vaulted roof, one door, no windows, lanterns outside the wall only.",
  }),
  mil("martello_tower", "Sea tower", "implemented", {
    tags: ["nautical_pirate", "size_m"],
    note: "A squat round tower on a rock or a mole, battered walls, one gun platform on top, entered by a ladder at first-floor height.",
  }),
  com("chandlery", "Ship chandlery", "implemented", {
    tags: ["nautical_pirate", "size_m"],
    note: "The shop that sells a voyage: rope coils, blocks and lanterns hung from the ceiling plane, barrels of tar and salt beef, a counter under a hanging model.",
  }),
  ind("sail_loft", "Sail loft", "implemented", {
    tags: ["nautical_pirate", "size_l"],
    note: "One long clear upper floor with the cloth laid out on it, seam benches down the walls, a hoist door in the gable.",
  }),
  rur("fish_drying_rack", "Drying racks", "implemented", {
    kind: "prop",
    tags: ["nautical_pirate", "size_m"],
    note: "Split fish on horizontal poles between A-frames, in ranks. Repeats down a whole shoreline and reads at fifty blocks.",
  }),
  ind("salt_house", "Salt house", "implemented", {
    tags: ["nautical_pirate", "size_s"],
    note: "The store beside Track A's `salt_pans`: white heaps in bays, a raking floor, wide low doors.",
  }),
  ruin("treasure_cache", "Treasure cache", "implemented", {
    kind: "prop",
    tags: ["nautical_pirate", "size_xs"],
    note: "Chests half out of the sand under a lone palm, a spade standing in the spoil, one lid open. The most literal icon in the catalog and unapologetic about it.",
  }),
  water("smugglers_landing", "Smugglers' landing", "implemented", {
    tags: ["nautical_pirate", "size_m"],
    note: "A stair cut into a cove wall down to mooring rings, crates stacked above the tideline, a shuttered lantern on a hook.",
  }),
  street("capstan", "Quay capstan", "implemented", {
    tags: ["nautical_pirate", "size_xs"],
    note: "A drum with bar sockets on a paved quay, hawser coiled at its foot.",
  }),
  ind("treadwheel_crane", "Treadwheel crane", "implemented", {
    tags: ["nautical_pirate", "size_l"],
    note: "The harbour crane: a timber housing with the great wheel inside it and a jib swinging out over the water. A silhouette, not a shed.",
  }),
  street("anchor_stack", "Anchor stack", "implemented", {
    tags: ["nautical_pirate", "size_s"],
    note: "Old anchors leaned together with chain heaped round them at the head of a quay.",
  }),
  water("daymark", "Daymark", "implemented", {
    tags: ["nautical_pirate", "size_m"],
    note: "A whitewashed stone cone on a headland with no light in it — the lighthouse's mute cousin, and cheap enough to put on three headlands.",
  }),
  mil("harbour_chain_tower", "Chain tower", "implemented", {
    // Family E (docs/INFRA-ENTRIES-v0.md, 2026-08-14) filed this as two props
    // and a catenary, and held the chain. Landed 2026-08-15 as the first client
    // of the `between` route form: what the pair *is* is the relation between
    // the two towers, no box contains it, and `infra.entry@0`'s new `span`
    // geometry is where a member that hangs rather than sweeps belongs.
    kind: "infrastructure",
    tags: ["nautical_pirate", "size_l"],
    note: "The pair that closes a port: two towers on opposite moles with a chain slung between them across the water. Ships as a pair or not at all.",
  }),
  mem("whalebone_arch", "Whalebone arch", "implemented", {
    kind: "prop",
    tags: ["nautical_pirate", "size_m"],
    note: "Two jaw bones meeting over a path at the top of the town. Niche, immediate, and it names a whaling port in one glance.",
  }),

  /* --- the arcane & magical pack (docs/CATALOG-EXPANSION-v0.md §3.3) --- */
  fan("rune_circle", "Rune circle", "implemented", {
    kind: "prop",
    tags: ["arcane", "size_m"],
    note: "A ring inlaid into the floor plane — glowing symbol courses on polished stone, no vertical stone at all. The counterpart to `standing_stones`, which is all vertical.",
  }),
  fan("ley_marker", "Ley marker", "implemented", {
    kind: "prop",
    tags: ["arcane", "size_xs"],
    note: "A knee-high waystone with one glowing glyph face, set beside a path. Twenty of these along a road is what makes a valley read as enchanted.",
  }),
  fan("crystal_outcrop", "Crystal outcrop", "implemented", {
    kind: "prop",
    tags: ["arcane", "size_m"],
    note: "Amethyst and quartz spires erupting from the ground at an angle, budding smaller clusters at the base.",
  }),
  fan("arcane_academy", "Arcane academy", "implemented", {
    tags: ["arcane", "size_xl"],
    note: "The wizard's tower gone collegiate: a cloistered teaching hall with two unequal towers, orrery hall, and shelves where a chapel would put pews.",
  }),
  fan("summoning_hall", "Summoning hall", "implemented", {
    tags: ["arcane", "size_l"],
    note: "One tall room, a circle written into the floor plane, brazier pedestals at the cardinal points and a gallery rail high on the walls.",
  }),
  fan("arcane_library", "Arcane library", "implemented", {
    tags: ["arcane", "size_l"],
    note: "Shelf ranges to the ceiling plane with ladder rails, reading lecterns lit by hung lanterns, one shelf bay left as a gap that goes nowhere.",
  }),
  fan("scrying_pool", "Scrying pool", "implemented", {
    kind: "prop",
    tags: ["arcane", "size_s"],
    note: "A still rimmed basin on the pool predicate with glow under the water and a kneeling step on one side.",
  }),
  fan("blossom_shrine", "Blossom shrine", "implemented", {
    tags: ["arcane", "size_s"],
    note: "An open pavilion of pale timber under a cherry canopy, ribbons on the posts, a low altar with no figure on it.",
  }),
  fan("pegasus_stable", "Winged-mount stable", "implemented", {
    tags: ["arcane", "size_l"],
    note: "Stalls with no doors and an open loft above them — the mounts leave upward — with a landing ledge projecting from the gable.",
  }),
  fan("unicorn_paddock", "Paddock", "implemented", {
    kind: "prop",
    tags: ["arcane", "size_l"],
    note: "White fencing round grazed ground with a blossom tree, a trough and a gate; the icon is the enclosure, not an occupant.",
  }),
  fan("arcane_orrery", "Orrery", "implemented", {
    kind: "prop",
    tags: ["arcane", "size_m"],
    note: "Armillary rings on a plinth with a lit core, each ring a course of blocks in its own plane.",
  }),
  fan("floating_stair", "Floating stair", "not_started", {
    kind: "infrastructure",
    tags: ["arcane", "size_lin"],
    note: "Detached treads climbing to a door, on `floating_platform`'s disguised-stem trick — a veiled thread carries each tread, and the eye reads the gap.",
  }),
  fan("warded_gate", "Warded gate", "not_started", {
    // Family E: `triumphal_arch` with different mouldings, and the shipped
    // arch proves an arch over a road is a prop with a declared box
    // (docs/INFRA-ENTRIES-v0.md, 2026-08-14).
    kind: "prop",
    tags: ["arcane", "size_m"],
    note: "An arch across a road with a rune band up both piers and a glowing keystone; nothing hangs in the opening.",
  }),
  fan("spirit_lantern_row", "Lantern row", "implemented", {
    kind: "prop",
    tags: ["arcane", "size_lin"],
    note: "A run of posts with paper lanterns at head height along a path, spaced by arc length. The pack's saturation piece.",
  }),
  fan("dragon_skeleton", "Dragon skeleton", "implemented", {
    kind: "prop",
    tags: ["arcane", "size_xl"],
    note: "A picked wyrm laid out where it fell: spine flush in the ground plane, ribs standing on it, the skull turned to one side.",
  }),
  fan("moon_dial", "Moon dial", "implemented", {
    kind: "prop",
    tags: ["arcane", "size_m"],
    note: "A great disc set into a paved terrace with a leaning gnomon and glowing hour marks.",
  }),

  /* --- the alien & sci-fi pack (docs/CATALOG-EXPANSION-v0.md §3.4) --- */
  rur("crop_circle", "Crop circle", "implemented", {
    kind: "infrastructure",
    tags: ["alien_scifi", "size_xl"],
    note: "Rings and spokes pressed into a standing field: the disc levels its own footprint through the ground contract and lays the crop down. `infra.entry@0`, `over` a farm holding's parcel mask.",
  }),
  mil("quarantine_fence", "Quarantine line", "implemented", {
    kind: "infrastructure",
    tags: ["alien_scifi", "size_lin"],
    note: "Chain-link on posts with warning banners at intervals, floodlight masts every fifth panel and a gate where a road crosses it. A sweep client.",
  }),
  sci("containment_tent", "Containment tent", "implemented", {
    kind: "prop",
    tags: ["alien_scifi", "size_m"],
    note: "An inflated white dome with a ribbed skin, an airlock tube out one side and a generator humming at the back.",
  }),
  sci("field_lab_trailer", "Field lab trailer", "implemented", {
    kind: "prop",
    tags: ["alien_scifi", "size_s"],
    note: "A boxed trailer up on jacks with a step, an aerial and a shuttered hatch; three in a row is a response, one is a rumour.",
  }),
  sci("sensor_mast", "Sensor mast", "implemented", {
    kind: "prop",
    tags: ["alien_scifi", "size_s"],
    note: "A tripod carrying a small dish, a solar panel and a blinking head.",
  }),
  sci("dish_array", "Dish array", "implemented", {
    kind: "prop",
    tags: ["alien_scifi", "size_l"],
    note: "Several big parabolic dishes on pedestals, all aimed the same way — the aim is the read.",
  }),
  fan("xeno_spire", "Xeno spire", "implemented", {
    tags: ["alien_scifi", "size_xl"],
    note: "Chitinous organic massing that tapers and twists, grown rather than built, with openings where the shell parted.",
  }),
  fan("hive_mound", "Hive mound", "implemented", {
    tags: ["alien_scifi", "size_l"],
    note: "A low resinous mound with three tunnel mouths at ground level and a vent crown; inside is chambered, not roomed.",
  }),
  fan("bio_pod_cluster", "Bio-pod cluster", "implemented", {
    kind: "prop",
    tags: ["alien_scifi", "size_s"],
    note: "Glowing egg pods in a huddle, two split open, the ground under them stained. Built for double-digit counts.",
  }),
  ruin("crash_furrow", "Crash furrow", "implemented", {
    kind: "infrastructure",
    tags: ["alien_scifi", "size_lin"],
    note: "A scorched gouge dragged across the terrain with debris thrown out either side and the thing that made it at the end of the run. Gives a scatter its direction.",
  }),
  mil("barricade_line", "Street barricade", "implemented", {
    kind: "infrastructure",
    tags: ["alien_scifi", "size_lin"],
    note: "Improvised across a carriageway: wrecked vehicles, sandbags, concrete blocks and wire, with one deliberate gap.",
  }),
  mil("sandbag_emplacement", "Sandbag emplacement", "implemented", {
    kind: "prop",
    tags: ["alien_scifi", "size_s"],
    note: "A horseshoe of bags at a corner with a firing step and an ammunition crate.",
  }),
  mil("mobile_command_post", "Command vehicle", "implemented", {
    kind: "prop",
    tags: ["alien_scifi", "size_m"],
    note: "An armoured box body with an awning off one flank, map table under it and a mast of antennae.",
  }),
  // Family D (docs/INFRA-ENTRIES-v0.md §2 D): a fitting *in* something else is
  // never a node, so this is a param on the building that owns the door —
  // `"entrance": { "treatment": "blast_door" }` — and it lives in
  // NON_NODE_IMPLEMENTED for the same reason `cellar` does.
  und("blast_door", "Blast door", "implemented", {
    kind: "infrastructure",
    tags: ["alien_scifi", "size_m"],
    note: 'The way into a hillside: iron leaves in a hydraulic frame, a concrete surround and a warning band across the head. Reached as a param on the host building — "entrance": { "treatment": "blast_door" } — on a bunker_complex, underground_silo, bunker or pillbox; the cut and the ramp down to it are the doorstep pass\'s, not a second digger\'s.',
  }),
  sci("hydroponics_bay", "Hydroponics bay", "implemented", {
    tags: ["alien_scifi", "size_l"],
    note: "Racked trays under grow-lamp glow, pipe runs at the plate, a water plant at one end. What a hideout eats.",
  }),
  mil("sentry_turret", "Sentry turret", "implemented", {
    kind: "prop",
    tags: ["alien_scifi", "size_xs"],
    note: "A short pedestal with a swivelling head and a lamp, at a gate or on a roof parapet.",
  }),
  // Family D again, same doctrine and the same param.
  mod("airlock_vestibule", "Airlock vestibule", "implemented", {
    kind: "infrastructure",
    tags: ["alien_scifi", "size_s"],
    note: 'A double-door chamber at the way in: a copper step-through sill, a second iron plane one cell inside, and a lit porch projecting into the apron with a warning band round it. Reached as a param on the host building — "entrance": { "treatment": "airlock_vestibule" } — on a hydroponics_bay, laboratory, field_station or bunker_complex.',
  }),
  // Not the sweep engine in the end: a guideway is level and a sweep's datum
  // follows the ground, so it landed 2026-08-15 as the aqueduct's dry sibling
  // on `infra.entry@0`'s carried span.
  infra("maglev_pylon", "Guideway pylon", "implemented", {
    tags: ["alien_scifi", "size_lin"],
    note: 'infra.entry@0 `"between"` two anchors: a three-wide smooth-stone guideway twelve courses up with a cut-copper rail on each edge, walkable end to end, on a single slender concrete pylon every ten columns.',
  }),
  ruin("derelict_mech", "Derelict walker", "implemented", {
    kind: "prop",
    tags: ["alien_scifi", "size_xl"],
    note: "A fallen machine on its side, one leg still folded under it, hull plates open and the cockpit dark.",
  }),

  /* --- the agrarian pack (docs/CATALOG-EXPANSION-v0.md §3.5) --- */
  rur("hedgerow", "Hedgerow", "implemented", {
    kind: "infrastructure",
    tags: ["agrarian", "size_lin"],
    note: "The living boundary FARM-PLAN §14.2 named as missing: leaves over a log heart on a bank of coarse dirt, seasonal flowers along it, and a gap wherever a track crosses — the field gate, found and never placed. `infra.entry@0`, `along` a way or `ring` a holding.",
  }),
  rur("dry_stone_wall", "Dry stone wall", "implemented", {
    kind: "infrastructure",
    tags: ["agrarian", "size_lin"],
    note: "The upland field wall: one course wide, two tall, coped in the theme's accent stone, with a paired stile at intervals so it can be got over. `infra.entry@0`, `along` or `ring`.",
  }),
  rur("field_gate", "Field gate", "implemented", {
    kind: "prop",
    tags: ["agrarian", "size_xs"],
    note: "A five-bar gate hung between a hanging post and a slapping post, with a stile stone beside it. Every wall and hedge run wants one.",
  }),
  rur("cart_track", "Cart track", "implemented", {
    kind: "infrastructure",
    tags: ["agrarian", "size_lin"],
    note: "Two ruts with a grass baulk between them, unpaved, following the ground rather than cutting it — the road engine's humblest profile. `infra.entry@0`, `along`; it declares the ground it found so the ruts are worn into the field rather than laid on it.",
  }),
  rur("cow_byre", "Byre", "implemented", {
    tags: ["agrarian", "size_m"],
    note: "Standings either side of a central dunging passage, a feed walk at the head, half-doors on the yard.",
  }),
  rur("duck_pond", "Duck pond", "implemented", {
    kind: "prop",
    tags: ["agrarian", "size_m"],
    note: "A rimmed pond on the pool predicate with reeds at one edge, a plank ramp and a small house on stilts over the water.",
  }),
  rur("midden_heap", "Midden", "implemented", {
    kind: "prop",
    tags: ["agrarian", "size_s"],
    note: "The muck heap by the yard: coarse dirt banked against three walls with a fork standing in it and steam where the season allows.",
  }),
  rur("dutch_barn", "Dutch barn", "implemented", {
    tags: ["agrarian", "size_l"],
    note: "Open on all four sides: piers, a curved roof, and nothing but stacked hay between them. The read is the absence of walls.",
  }),
  rur("smokehouse", "Smokehouse", "implemented", {
    tags: ["agrarian", "size_s"],
    note: "A small blind hut with a low fire pit and racks up in the roof; the only opening is the door.",
  }),
  rur("dairy", "Dairy", "implemented", {
    tags: ["agrarian", "size_s"],
    note: "Deliberately cold and north-facing: slate shelves round three walls, churns, a stone floor kept wet, small high windows.",
  }),
  rur("sheep_dip", "Sheep dip", "implemented", {
    kind: "prop",
    tags: ["agrarian", "size_s"],
    note: "A narrow sunken trough with a race of hurdles funnelling into it and a draining pen the far side.",
  }),
  rur("wool_shed", "Shearing shed", "implemented", {
    tags: ["agrarian", "size_l"],
    note: "A raised board floor with catching pens under one end and the wool table down the middle.",
  }),
  rur("staddle_granary", "Staddle granary", "implemented", {
    kind: "prop",
    tags: ["agrarian", "size_s"],
    note: "A grain box raised on mushroom-shaped stones so the rats cannot climb, reached by a ladder that does not touch it.",
  }),
  rur("hop_yard", "Hop yard", "implemented", {
    kind: "infrastructure",
    tags: ["agrarian", "size_xl"],
    note: "Poles on a grid with wire runs between their heads; the plants are the flora grammar's problem and the frame is not.",
  }),
  rur("stock_pens", "Stock pens", "implemented", {
    kind: "prop",
    tags: ["agrarian", "size_l"],
    note: "A grid of hurdle pens off a droving lane with a weigh crush and an auctioneer's step.",
  }),
  rur("well_sweep", "Well sweep", "implemented", {
    kind: "prop",
    tags: ["agrarian", "size_m"],
    note: "The counterweighted lever over an open well — a raked beam on a forked post, bucket at one end and a stone at the other.",
  }),

  /* --- the wilds & camps pack (docs/CATALOG-EXPANSION-v0.md §3.6) --- */
  nom("logging_camp", "Logging camp", "implemented", {
    tags: ["wilds_camps", "size_xl"],
    note: "A compound on `campsite`'s precedent: bunk shanty, cook shack, a saw trestle, the fire, and the ground churned to mud between them.",
  }),
  infra("log_flume", "Log flume", "not_started", {
    tags: ["wilds_camps", "size_lin"],
    note: "A V-trough on trestles running downhill with water in it — the sweep engine carrying a contained channel rather than a carriageway.",
  }),
  ind("log_landing", "Log landing", "implemented", {
    kind: "prop",
    tags: ["wilds_camps", "size_l"],
    note: "The deck at the road head: whole trunks cross-stacked between anchor posts, ends squared to the track.",
  }),
  ind("sawpit", "Sawpit", "implemented", {
    kind: "prop",
    tags: ["wilds_camps", "size_s"],
    note: "A trestle over an open pit with a two-man saw standing in the kerf and sawdust banked at one end.",
  }),
  wat("river_log_boom", "Log boom", "not_started", {
    tags: ["wilds_camps", "size_lin"],
    note: "Chained trunks strung across a river corralling a raft of loose logs behind them, anchored to a bank pier at each end.",
  }),
  civ("fire_lookout_tower", "Fire lookout", "implemented", {
    tags: ["wilds_camps", "size_l"],
    note: "A glazed cab on braced legs above the canopy, with a switchback stair and a map table you can see from below.",
  }),
  ruin("stump_field", "Cut-over", "implemented", {
    kind: "infrastructure",
    tags: ["wilds_camps", "size_xl"],
    note: "The ground a camp leaves: stumps at plausible spacing, slash piles, and one great stump too big to have been worth taking.",
  }),
  infra("rope_bridge", "Rope bridge", "not_started", {
    tags: ["wilds_camps", "size_lin"],
    note: "Plank treads slung between two cable runs with hand lines, sagging to the middle and anchored to trees or posts.",
  }),
  rur("waystation", "Waystation", "implemented", {
    tags: ["wilds_camps", "size_s"],
    note: "A shelter on a long road: three walls, a hearth, a bench, a woodpile kept full, and no door.",
  }),
  lei("hunting_lodge", "Hunting lodge", "implemented", {
    tags: ["wilds_camps", "size_l"],
    note: "A trophy hall with a great hearth, antlers on the beam, a gun rack and boots by the door.",
  }),
  ind("spar_pole", "Spar pole", "implemented", {
    kind: "prop",
    tags: ["wilds_camps", "size_l"],
    note: "A topped tree rigged with blocks and guy lines as a yarding mast — the tallest thing in a cut-over and visible from everywhere.",
  }),
  nom("hunters_cache", "Cache", "implemented", {
    tags: ["wilds_camps", "size_xs"],
    note: "A box on four peeled poles above bear height with the bark stripped off the legs.",
  }),

  /* --- the frontier West pack (docs/CATALOG-EXPANSION-v0.md §3.7) --- */
  com("false_front_saloon", "Saloon", "implemented", {
    tags: ["frontier_west", "size_m"],
    note: "The false front is the entry: a flat parapet screen carried a storey above the real roof, swing doors, a long bar and a stair to the rooms.",
  }),
  infra("boardwalk", "Boardwalk", "implemented", {
    tags: ["frontier_west", "size_lin"],
    note: "A plank sidewalk on posts standing one course proud of grade, with a step down at each cross-street — the frontage's own sweep profile. `infra.entry@0`, `along` a street.",
  }),
  infra("water_tank_trestle", "Water tank", "implemented", {
    kind: "prop",
    tags: ["frontier_west", "size_l"],
    note: "A banded timber tank on a braced trestle beside the track with a swing spout hanging off it.",
  }),
  com("assay_office", "Assay office", "implemented", {
    tags: ["frontier_west", "size_s"],
    note: "A barred counter, a small furnace and scales, a strongbox in the corner and a shingle over the door.",
  }),
  ind("stamp_mill", "Stamp mill", "implemented", {
    tags: ["frontier_west", "size_xl"],
    note: "Built down a slope in stages: ore bin at the top, the stamp battery under it, tables below that. The stepping is the read.",
  }),
  ind("sluice_box", "Sluice box", "not_started", {
    kind: "infrastructure",
    tags: ["frontier_west", "size_lin"],
    note: "A riffled trough on trestles with water running through it, tailings fanned out at the low end.",
  }),
  ind("placer_claim", "Placer claim", "implemented", {
    kind: "prop",
    tags: ["frontier_west", "size_m"],
    note: "A worked gravel bar: spoil ridges, a rocker cradle, a claim post with a board nailed to it.",
  }),
  civ("telegraph_office", "Telegraph office", "implemented", {
    tags: ["frontier_west", "size_s"],
    note: "One room, a key desk under the window, wire coming in through the gable to a pole outside.",
  }),
  rur("livery_stable", "Livery stable", "implemented", {
    tags: ["frontier_west", "size_l"],
    note: "Wide doors both ends, a straw floor, a loft with a hay door, and rigs parked in the aisle.",
  }),
  ind("wagon_shop", "Wagon shop", "implemented", {
    tags: ["frontier_west", "size_m"],
    note: "Wheels on the wall, a tyring platform outside the door, a forge in the corner and half a wagon on trestles.",
  }),
  rel("mission_church", "Mission church", "implemented", {
    tags: ["frontier_west", "size_m"],
    note: "Adobe massing with a stepped bell gable carrying two bells, buttressed side walls, a single deep door.",
  }),
  com("cantina", "Cantina", "implemented", {
    tags: ["frontier_west", "size_s"],
    note: "A shaded arcade off the street, a plain bar inside, terracotta and whitewash, shutters instead of glass.",
  }),
  mem("boot_hill_row", "Boot hill", "implemented", {
    kind: "prop",
    tags: ["frontier_west", "size_m"],
    note: "A crooked line of timber grave markers on a bare rise outside town, fenced with wire, no two the same height.",
  }),
  ver("dugout_shanty", "Dugout", "implemented", {
    tags: ["frontier_west", "size_s"],
    note: "Cut back into a bank with a timber front wall and a turf roof at the level of the ground behind it.",
  }),

  /* --- the Nile & ancient Egypt pack (docs/CATALOG-EXPANSION-v0.md §3.8) --- */
  rel("pyramid", "Pyramid", "implemented", {
    kind: "prop",
    tags: ["nile", "size_xl"],
    note: "prop.place@0: a 33-block battered mass on a square base, cased, closing on a pyramidion, with a walkable passage low on the north face into a chamber. A PROP, not an archetype - a building\'s roof rebuild has six courses and a sealed storey is `interior.blocked_column`. `pyramid`/`great_pyramid` are deliberately NOT claimed as archetype tags: they name this prop, and `pyramid` is a roof-value alias in `core.ts`.",
  }),
  mem("mastaba", "Mastaba", "implemented", {
    tags: ["nile", "size_m"],
    note: "The bench tomb: a battered rectangular block with a flat top, a false door on one face and a real one nowhere.",
  }),
  rel("hypostyle_hall", "Hypostyle hall", "implemented", {
    tags: ["nile", "size_xl"],
    note: "A forest of columns on a grid, the central aisle's columns taller than the rest so a clerestory band opens between them.",
  }),
  rel("mortuary_temple", "Mortuary temple", "implemented", {
    tags: ["nile", "size_xl"],
    note: "Terraced against a cliff: colonnaded storeys stepping back, a ramp on the axis climbing through all of them.",
  }),
  rel("pylon_gate", "Pylon gate", "implemented", {
    kind: "infrastructure",
    tags: ["nile", "size_xl"],
    note: "building.grammar@0 archetype: two battered trapezoid towers rebuilt over the roof either side of a lower doorway, flagstaff grooves up the faces, banners standing on the tower tops. Tags: pylon_gate/pylon/temple_pylon/pylon_gateway; bare `gate` stays the gatehouse\'s. The `infrastructure` kind is the curator\'s and is left as written - the realisation is a building, the `careening_beach` precedent.",
  }),
  mem("sphinx_avenue", "Avenue of sphinxes", "implemented", {
    kind: "infrastructure",
    tags: ["nile", "size_lin"],
    note: "Paired plinth-figures at a fixed bay down both sides of a paved processional way — small chiselled-sandstone masses, NOT the bespoke-tier sphinx: the read is the rank and its rhythm. `infra.entry@0`, `along` a way.",
  }),
  wat("nilometer", "Nilometer", "implemented", {
    kind: "building",
    tags: ["nile", "size_m"],
    note: "A stepped shaft down to river level with a graduated column in it and a covered head at the top.",
  }),
  wat("sacred_lake", "Sacred lake", "implemented", {
    kind: "prop",
    tags: ["nile", "size_l"],
    note: "A rectangular stone-lined basin with steps down all four sides, on the pool predicate, inside a precinct wall.",
  }),
  rur("mudbrick_granary", "Beehive granary", "implemented", {
    tags: ["nile", "size_s"],
    note: "Corbelled mud domes in a row on a shared plinth, filled from a hatch at the crown and drawn from a hole at the foot.",
  }),
  water("felucca", "Felucca", "implemented", {
    tags: ["nile", "size_m"],
    note: "One raked mast with a long lateen yard, a shallow open hull and an awning aft.",
  }),
  rel("canopic_shrine", "Shrine chapel", "implemented", {
    tags: ["nile", "size_s"],
    note: "A small chapel with a cavetto cornice and a torus roll at every corner — the two mouldings that make a block read as Egyptian.",
  }),

  /* --- the East Asian pack (docs/CATALOG-EXPANSION-v0.md §3.9) --- */
  rel("torii", "Torii", "implemented", {
    kind: "prop",
    tags: ["east_asian", "size_m"],
    note: "Two posts, a curved upper lintel and a straight tie under it. Repeats down an approach in ranks and is the pack's saturation piece.",
  }),
  infra("moon_gate", "Moon gate", "not_started", {
    tags: ["east_asian", "size_m"],
    note: "A perfect circular opening in a garden wall, coped round, with the path passing through it.",
  }),
  infra("paifang", "Paifang", "not_started", {
    // Family E: `triumphal_arch` with different mouldings — a prop with a
    // declared box (docs/INFRA-ENTRIES-v0.md, 2026-08-14).
    kind: "prop",
    tags: ["east_asian", "size_l"],
    note: "A multi-bay ceremonial arch over a street with tiled eaves over each bay and a name board in the middle span.",
  }),
  lei("zen_garden", "Dry garden", "implemented", {
    kind: "prop",
    tags: ["east_asian", "size_m"],
    note: "Raked gravel written into the floor plane with placed stones and moss, walled on three sides and viewed from a veranda on the fourth.",
  }),
  mil("tenshu_keep", "Castle keep", "implemented", {
    tags: ["east_asian", "size_xl"],
    note: "Stacked tiered storeys, each smaller than the one below, over a battered stone base with a curved cyclopean face; gables break every second eave.",
  }),
  mil("castle_base_wall", "Battered stone base", "implemented", {
    kind: "infrastructure",
    tags: ["east_asian", "size_lin"],
    note: 'infra.entry@0 `"ring"` or `"along"`, family B: the ōgi revetment the keep stands on, drawn as three courses receding inward as they climb — a batter in one-column steps — with a coping and the bailey behind it, all declared as one face.',
  }),
  civ("drum_tower", "Drum tower", "implemented", {
    tags: ["east_asian", "size_l"],
    note: "A tiered gate tower on a masonry podium with an arch through it and a drum hung in the upper storey.",
  }),
  lei("shoji_teahouse", "Tea house pavilion", "implemented", {
    tags: ["east_asian", "size_s"],
    note: "The garden pavilion: a low crawl-in entry, a mat floor, a hearth recess and one alcove. Distinct from Track A's commercial `tea_house`.",
  }),
  infra("spirit_wall", "Spirit wall", "not_started", {
    // Family E: a free-standing screen of fixed extent set inside one gate —
    // a declared box and a yaw, not a route (docs/INFRA-ENTRIES-v0.md,
    // 2026-08-14).
    kind: "prop",
    tags: ["east_asian", "size_s"],
    note: "A free-standing screen wall set one pace inside a gate so the way in must turn.",
  }),
  street("stone_lantern", "Stone lantern", "implemented", {
    tags: ["east_asian", "size_xs"],
    note: "A pedestal, a fire box with cut faces and a capstone, at a path's turn or a pond's edge.",
  }),
  water("dragon_boat", "Dragon boat", "implemented", {
    tags: ["east_asian", "size_l"],
    note: "A long narrow hull with a carved head at the stem and a tail at the stern, oars ranked along both sides.",
  }),
  rel("bell_pavilion", "Bell pavilion", "implemented", {
    tags: ["east_asian", "size_m"],
    note: "An open pavilion on a raised podium with a great bell hung from the beam and a striking log slung beside it — the tiered-eave answer to `bell_tower`'s masonry shaft.",
  }),

  /* --- mesoamerican_jungle pack --- */
  rel("step_pyramid", "Step pyramid", "implemented", {
    tags: ["mesoamerican_jungle", "size_xl"],
    note: "The anchor: tiers stepping inward over the plate, a real climbable stair up the axial face of them, a carved temple crown on top. A temple PLATFORM rather than a solid mass — a building's rebuild budget is the room between the eave plate and the allowance, and a filled storey is `interior.blocked_column` for every column of it (the Nile pack's arithmetic, restated).",
  }),
  rel("jaguar_temple", "Jaguar temple", "implemented", {
    tags: ["mesoamerican_jungle", "size_l"],
    note: "A mossy limestone shrine under a roof comb — a thin filled wall standing on the ridge, taller than the room and carrying nothing — with a carved throne facing the door.",
  }),
  mem("serpent_stair", "Feathered serpent stair", "implemented", {
    tags: ["mesoamerican_jungle", "size_l"],
    note: "A balustraded flight up the tiers: real stair treads with a wall rail either side and carved heads where the rails land at the foot.",
  }),
  mem("stela_plaza", "Stela plaza", "implemented", {
    tags: ["mesoamerican_jungle", "size_m"],
    note: "Carved standing stones ranked round an open floor, each capped short of the ceiling, with a low altar slab at the head of the rank.",
  }),
  lei("ball_court", "Ball court", "implemented", {
    tags: ["mesoamerican_jungle", "size_l"],
    note: "Two banked walls either side of an alley, sloped by a stair course on their inner faces, with a stone ring standing on each bank.",
  }),
  sci("round_observatory", "Round observatory", "implemented", {
    tags: ["mesoamerican_jungle", "size_m"],
    note: "The caracol: a round drum built as filled discs stepping in per course under a dome, lit by glowstone in its own skin. Bare `observatory` stays the science wave's.",
  }),
  civ("palace_range", "Palace range", "implemented", {
    tags: ["mesoamerican_jungle", "size_xl"],
    note: "A long low range whose whole front is a rank of openings under one roofline, on an apron colonnade of posts and lintels.",
  }),
  com("market_ramada", "Market ramada", "implemented", {
    tags: ["mesoamerican_jungle", "size_m"],
    note: "Open post-and-thatch stalls: posts round the apron, thatch stepping in over them, trestles and baskets instead of rooms.",
  }),
  mem("tzompantli_rack", "Skull rack", "implemented", {
    tags: ["mesoamerican_jungle", "size_m"],
    note: "Deliberately RESTRAINED: posts and two cross beams standing in the apron of a plain platform, and what such a frame carried left to the reader. Nothing here is a head.",
  }),
  wat("chultun_cistern", "Chultun", "implemented", {
    kind: "building",
    tags: ["mesoamerican_jungle", "size_s"],
    note: "The bottle cistern's curbed mouth under a corbelled shoulder. The flask itself is below the floor plane, where a building fit-out may not go, so it is implied by the curb rather than lied about.",
  }),
  infra("sacbe_terminus", "Sacbe terminus", "implemented", {
    kind: "building",
    tags: ["mesoamerican_jungle", "size_l"],
    note: "The raised white-road platform a causeway climbs onto: a plinth with outward-facing steps all round, a clear deck and a pair of markers.",
  }),
  rur("milpa_terrace", "Milpa terrace", "implemented", {
    tags: ["mesoamerican_jungle", "size_m"],
    note: "Maize beds written INTO the floor plane in whole blocks (moss and coarse dirt, never `farmland` — fifteen sixteenths of a cube is the `mud` lesson in a hat), behind an apron retaining course.",
  }),
  water("canoe_landing", "Canoe landing", "implemented", {
    kind: "building",
    tags: ["mesoamerican_jungle", "size_m"],
    note: "Pole walls under thatch with a plank slipway of stairs stepping down the water face and dugouts racked inside.",
  }),
  ver("thatch_dwelling", "Thatch dwelling", "implemented", {
    tags: ["mesoamerican_jungle", "size_s"],
    note: "The house that has not changed in two thousand years: pole-and-daub walls, a steep four-sided thatch built as filled courses, a hearth block at the near end.",
  }),
  ver("temazcal_bath", "Temazcal", "implemented", {
    tags: ["mesoamerican_jungle", "size_xs"],
    note: "The low domed sweat bath: discs stepping in fast over the plate, hot stones capped short of the ceiling against the far wall and a water cauldron beside them.",
  }),

  /* --- nordic_viking pack --------------------------------------------------
   * The Norse noun set. "A viking settlement" routes to the medieval era and
   * arrives as a generic European village in spruce: the palette was never
   * the problem, the nouns were. Sixteen entries — thirteen buildings and three
   * ground pieces. Wave 4A's `longhouse` is already exactly this pack's plain
   * dwelling and no second copy of it is shipped — it is simply not listed as
   * a member, because a member may belong to only one pack and `longhouse` is
   * the residential wave's building rather than this pack's.
   */
  res("norse_mead_hall", "Mead hall", "implemented", {
    tags: ["nordic_viking", "size_l"],
    note: "The long drinking hall: the fire running the length of the axis rather than sitting in a wall, benches down both sides of it, carved gable posts at the head. Tags: norse_mead_hall/mjod_hall/drinking_hall - bare `mead_hall` and bare `longhouse` stay wave 4A's longhouse, which is already the right building.",
  }),
  res("jarls_hall", "Chieftain's hall", "implemented", {
    tags: ["nordic_viking", "size_l"],
    note: "The mead hall organised round the high seat: a slab dais across the head, the high chair in front of it and a carved pillar either side.",
  }),
  rur("longship_shed", "Naust", "implemented", {
    tags: ["nordic_viking", "size_l"],
    note: "The boat shed, open-gabled to the water: keel blocks in a broken run down the middle of an otherwise empty floor, spars racked overhead and oars against the far wall.",
  }),
  ver("turf_house", "Turf house", "implemented", {
    tags: ["nordic_viking", "size_s"],
    note: "The torfbaer: dark, warm, one long bench down the wall away from the door and the hearth at the middle of the floor. Distinct from wave three's `sod_house`, which keeps `sod`/`turf` and every plain spelling of them.",
  }),
  rel("stave_belfry", "Stave belfry", "implemented", {
    tags: ["nordic_viking", "size_s"],
    note: "The small stave tower: four corner staves carrying the bell frame under the boards with the striking rope beside it. Answers to `stave_church` too - nothing else in the catalog claims the word - while `bell_tower`/`belfry`/`campanile` stay the faith wave's masonry shaft's.",
  }),
  ind("norse_forge", "Norse forge", "implemented", {
    tags: ["nordic_viking", "size_s"],
    note: "Anvil out on the floor a pace in front of the fire, bellows box and tool barrels down one wall, charcoal in the far corner. Bare `smithy` and bare `forge` stay where they were.",
  }),
  rel("hof_shrine", "Hof", "implemented", {
    tags: ["nordic_viking", "size_m"],
    note: "The heathen temple: three idol posts across the head, the offering bowl on a stone stall in front of them, unlit candles round the walls. Bare `shrine`/`temple`/`chapel` stay the church's.",
  }),
  ver("fishermans_cabin", "Fisherman's cabin", "implemented", {
    tags: ["nordic_viking", "size_xs"],
    note: "One room on a cold shore: a slab bunk along the wall away from the door, the net rail overhead on the other, catch barrels by the way in.",
  }),
  ind("weaving_hall", "Weaving hall", "implemented", {
    tags: ["nordic_viking", "size_m"],
    note: "Warp-weighted looms leaning against both long walls with the wool bins in the bays between them and the cloth table across the head.",
  }),
  mil("shield_wall_gate", "Shield gate", "implemented", {
    tags: ["nordic_viking", "size_m"],
    note: "The stockade's gate room, shields hung at eye height down the inner wall, the watch bench under them and the spear rack opposite. Bare `gate`/`gatehouse`/`barbican` stay the town and garrison waves'.",
  }),
  mil("palisade_watchtower", "Palisade watchtower", "implemented", {
    tags: ["nordic_viking", "size_s"],
    note: "The lookout floor over a stockade: a fence rail at intervals round the edge so a watch can see out, the signal brazier bedded in stone at the head, the ladder well left clear.",
  }),
  rur("norse_storehouse", "Stabbur", "implemented", {
    tags: ["nordic_viking", "size_s"],
    note: "The raised storehouse: everything kept off the floor on a slab plinth down both walls, grain bins along the head, the middle bare because that is where a body carrying a sack walks.",
  }),
  rur("wool_shed_norse", "Fleece store", "implemented", {
    tags: ["nordic_viking", "size_m"],
    note: "The northern half of the wool trade: hurdles down one wall, a winter's clip baled up on a slab plinth off the cold floor, the sorting table across the head. The id carries the pack because `wool_shed` is the agrarian expansion's shearing shed and a form pack's members must be unique registry-wide; bare `wool_shed`/`woolshed`/`shearing_shed` all still reach that one, and this answers to wool_shed_norse/norse_wool_shed/fleece_shed.",
  }),
  mem("rune_stone", "Rune stone", "implemented", {
    kind: "prop",
    tags: ["nordic_viking", "size_xs"],
    note: "prop.place@0: the carved memorial slab on its packed cairn, the band of carving cut round its face, two kerb stones at the cairn's corners.",
  }),
  mem("boat_burial_mound", "Boat burial", "implemented", {
    kind: "prop",
    tags: ["nordic_viking", "size_l"],
    note: "prop.place@0: a grassed mound heaped filled-course on filled-course with the ship's stem and stern posts still standing out of the crown, the gunwale line showing through the turf and a boulder kerb round the foot with the way up left open.",
  }),
  rur("drying_rack_yard", "Fish drying yard", "implemented", {
    kind: "prop",
    tags: ["nordic_viking", "size_m"],
    note: "prop.place@0: the hjell - two ranks of split cod hung from a timber rail carried above head height, so every lane of the yard under it stays walkable. Salting barrels at one end, the gutting table at the other.",
  }),

  /* --- dwarven_volcanic pack -----------------------------------------------
   * The hold's noun set. "A dwarven hold under the volcano" routes to the
   * medieval era and arrives as a stone village with a smithy in it: the
   * palette was never the problem, the nouns were. Fifteen entries, every one
   * of them a building - this pack ships no props at all. Two ids carry the
   * hold because the plain words are already taken and stay taken:
   * `dwarven_gate` is the ARCANA wave's fantasy gate and `assay_office` is the
   * frontier wave's, word for word.
   */
  ind("great_forge", "Great forge", "implemented", {
    tags: ["dwarven_volcanic", "size_l"],
    note: "The anchor: the furnace pit running the LENGTH of the axis rather than sitting in a wall, the anvil rank against the working wall with smithing tables in the bays, the chimney breast at the head. Bare `forge`, `smithy` and `foundry` stay the founding table's and the industry wave's; this answers to great_forge/forge_pit/deep_forge.",
  }),
  civ("dwarf_hold_gate", "Hold gate", "implemented", {
    tags: ["dwarven_volcanic", "size_l"],
    note: "The monumental doorway face cut into the mountain: paired pillars flanking the head, the lintel course carried across their heads, the rune band at their feet and a brazier under the span. The id carries the hold because `dwarven_gate` is the arcana wave's and keeps every plain spelling; this answers to dwarf_hold_gate/hold_gate/under_gate.",
  }),
  civ("deep_hall", "Deep hall", "implemented", {
    tags: ["dwarven_volcanic", "size_xl"],
    note: "The pillared hall: pillar pairs one cell in from each side wall in bays, the vault springing off each as a stair course turned back to the wall, the glow bedded into the pillar at eye height and the central aisle never touched. Bare `hall` and `great_hall` stay the original table's.",
  }),
  ind("smelter_works", "Smelter works", "implemented", {
    tags: ["dwarven_volcanic", "size_l"],
    note: "The furnace bank across the head, every furnace COLD by rule (a lit furnace is a fire, and the volcanic pack has an argument to keep), the ore bins stacked two high down one wall and the tapping floor in front of the bank left clear.",
  }),
  ind("gem_cutter_workshop", "Gem cuttery", "implemented", {
    tags: ["dwarven_volcanic", "size_m"],
    note: "The one room in the pack that wants windows: cutting benches down both walls against the light, a grindstone at every third bay, the rough on the bench and the polished stone laid out at the head.",
  }),
  com("stone_brewhouse", "Dwarven brewhouse", "implemented", {
    tags: ["dwarven_volcanic", "size_m"],
    note: "The kettle rank across the head - cauldrons on stone stalls with the glow bedded between them, which is how a heated brewhouse is said without lighting a fire - and the barrel racks stacked two high down the cold wall. Bare `brewery`/`brewhouse` stay the commerce wave's.",
  }),
  res("miners_dormitory", "Miners' dormitory", "implemented", {
    tags: ["dwarven_volcanic", "size_m"],
    note: "Slab bunks in bays down both walls with a lamp niche bedded over every second one, the wash trough at the head and the kit at the door. Written as SLABS and not as beds: a bed is a two-cell block whose halves must agree, and a head with no foot is a broken block rather than a sparser room.",
  }),
  ind("tool_vault", "Tool vault", "implemented", {
    tags: ["dwarven_volcanic", "size_s"],
    note: "Barred racks up under the boards on both walls (`iron_bars`, never `chain` - not in the pinned 1.21.11 table), the issue bench of slabs under them and the iron strongbox on its plinth at the head. Bare `vault` and `armoury` stay where they were.",
  }),
  rel("rune_forge_shrine", "Rune forge", "implemented", {
    tags: ["dwarven_volcanic", "size_m"],
    note: "The rune anvil out on the floor a pace in front of a chiselled altar band, the glow bedded behind it, unlit candles round the walls. Bare `shrine`/`temple`/`chapel` stay the church's.",
  }),
  infra("cart_depot", "Cart depot", "implemented", {
    kind: "building",
    tags: ["dwarven_volcanic", "size_m"],
    note: "The minecart staging floor: rails run down the axis - a rail is a PASSABLE block, which is the only reason a line of them down the middle of a room is legal - with a buffer block at the head end, the hoist rack overhead and the spare wheels against the walls. Bare `depot`/`station`/`yard` stay the terminus wave's.",
  }),
  civ("ore_assay_hall", "Ore assay hall", "implemented", {
    tags: ["dwarven_volcanic", "size_m"],
    note: "Sample slabs ranked down both walls with a DIFFERENT ore standing on each (a rank of identical cubes reads as shelving, not as samples), the stonecutter and the ledger table at the head. The id carries the ore because `assay_office` is the frontier wave's word for word, and that one keeps it.",
  }),
  lei("stone_bath_house", "Hot-stone bath", "implemented", {
    tags: ["dwarven_volcanic", "size_s"],
    note: "Heated benches round the walls with a water cauldron at every third bay and the hot stones bedded under a dressed cap at the head. NO standing water is written anywhere in it: a water cell is not a walkable floor, and a bath house a body cannot cross is a pool. Bare `bathhouse`/`baths` stay the leisure wave's.",
  }),
  mil("beacon_brazier_tower", "Brazier tower", "implemented", {
    tags: ["dwarven_volcanic", "size_s"],
    note: "The signal floor over the hold's gate road: a fence rail at intervals round the edge so a watch can see out, the brazier bedded in stone at the head, the fuel in the far corner and the ladder well left clear. Bare `beacon_tower`, `beacon_spire`, `watchtower` and `lookout` all stay where they were.",
  }),
  civ("kings_treasury", "King's treasury", "implemented", {
    tags: ["dwarven_volcanic", "size_m"],
    note: "The barred vault face across the head - bars at the floor course and again at eye height, so the head wall is seen THROUGH rather than walked into - with the bullion on slab plinths down both walls, gold one side and iron the other. Bare `treasury` and `sanctuary_treasury` stay where they were.",
  }),
  rel("stalactite_shrine", "Cavern shrine", "implemented", {
    tags: ["dwarven_volcanic", "size_m"],
    note: "The worked cavern shrine: dripstone hanging from the boards along both walls, amethyst set into the plinth under each hanging, the calcite altar across the head with the glow bedded at it. INTERIOR FIT-OUT ONLY - this carves no cave; a cavern is the terrain's business and the cave system's.",
  }),

  /* --- steppe_nomad pack ---------------------------------------------------
   * The steppe noun set. "A Mongol camp", "a steppe horde", "the khan's ordu"
   * all route to the medieval era and arrive as a European village with the
   * wayside pack's single `yurt` PROP parked outside it: the palette was never
   * the problem, the nouns were. Fifteen entries - twelve buildings and three
   * ground pieces. Bare `yurt` stays the wayside prop's, word for word; this
   * pack's tent answers to `ger`, which is what the thing is actually called
   * and which no table in the catalog had ever claimed.
   */
  ver("ger_round_tent", "Ger", "implemented", {
    tags: ["steppe_nomad", "size_m"],
    note: "The anchor: the felt-and-lattice round tent, its dome rebuilt over the eave plate as filled discs stepping in under a timber crown ring, the hearth under the crown where the smoke goes out and the bed platform round the wall. Tags: ger_round_tent/ger/round_tent - bare `yurt` stays the wayside pack's prop.",
  }),
  res("khans_ger", "Khan's ger", "implemented", {
    tags: ["steppe_nomad", "size_l"],
    note: "The ger organised round the dais at the head: a slab dais across the honoured side, the seat in front of it and a banner post either side, with the tribute chests at the door end.",
  }),
  ver("cart_ger", "Cart ger", "implemented", {
    tags: ["steppe_nomad", "size_m"],
    note: "The ger that never comes down: the same felt dome standing on a cart bed of plank decking, the axle logs across the floor at both ends and the drawbar at the head. The wheels are deliberately NOT written - a wheel proud of the footprint is a cell in the apron with nothing under it.",
  }),
  ind("kumis_tent", "Kumis tent", "implemented", {
    tags: ["steppe_nomad", "size_m"],
    note: "Fermented mare's milk: the churns ranked down one wall, the skin bags hung on a rail over them at head height and the stirring post at the head. Bare `brewery` and bare `dairy` stay where they were.",
  }),
  rur("horse_line", "Horse line", "implemented", {
    tags: ["steppe_nomad", "size_m"],
    note: "The picket, and NOT a stable: a steppe horse is never stalled, it is tied to a line strung between posts with the troughs in the bays and the middle of the floor bare. Bare `stable`, `paddock` and `corral` stay the founding table's and the agrarian expansion's.",
  }),
  ind("felt_workshop", "Felt works", "implemented", {
    tags: ["steppe_nomad", "size_m"],
    note: "Where the camp's walls are made: the wool bales up on a slab plinth off the damp floor, the rolling frame overhead, the wetting vats under it and the sorting table across the head.",
  }),
  ind("bowyer_tent", "Bowyer's tent", "implemented", {
    tags: ["steppe_nomad", "size_s"],
    note: "The composite bow, the one technology the whole steppe is organised around: horn and sinew seasoning on racks overhead down both walls, the bench under them and the glue pot at the head. Bare `fletcher` and bare `workshop` stay where they were.",
  }),
  com("caravan_rest", "Caravan halt", "implemented", {
    tags: ["steppe_nomad", "size_m"],
    note: "The open-sided shelter a track has one of every day's ride: cargo stacked clear of the ground on plinths down both walls, water by the way in, fodder at the head. Bare `caravanserai` stays the trade wave's walled masonry courtyard.",
  }),
  lei("wrestling_ground", "Wrestling ground", "implemented", {
    tags: ["steppe_nomad", "size_m"],
    note: "The bokh ring, whose content is the ABSENCE of content: the floor is left completely bare because two men are about to fall over on it, and the whole fit-out is a low bank of seats round the edge with the judges' posts at the head. Bare `arena` and `stadium` stay the sanctum and leisure waves'.",
  }),
  mil("watch_platform_steppe", "Steppe watch platform", "implemented", {
    tags: ["steppe_nomad", "size_s"],
    note: "The raised lookout over open grass: a fence rail at intervals round the edge so a watch can see thirty miles, the signal brazier bedded in stone at the head, the horn rack overhead and the ladder well left clear. Bare `watchtower` and `lookout` stay the watchtower's.",
  }),
  rur("borts_rack", "Borts rack", "implemented", {
    tags: ["steppe_nomad", "size_m"],
    note: "Air-dried beef on HORIZONTAL poles inside a dark room, hung at the top of the storey so every lane under them stays walkable. Distinct in id and in form from the Nordic pack's `drying_rack_yard`, which is split cod hung vertically off an outdoor shore frame; the two share no word.",
  }),
  rur("winter_corral", "Winter corral", "implemented", {
    tags: ["steppe_nomad", "size_m"],
    note: "The khashaa, the one fixed thing a nomad household owns: hurdles down one wall, the fodder stacked on a plinth so it never sits on frozen ground, the troughs in the bays and the lean-to shelf across the head.",
  }),
  mem("khan_banner_pole", "Tug", "implemented", {
    kind: "prop",
    tags: ["steppe_nomad", "size_xs"],
    note: "prop.place@0: the horsetail standard on its pole - the object that says WHOSE camp this is. A full-block column on a packed slab base, the standard spreading in four cantilevered slabs well over head height so the whole pad stays walkable, a spear point on top.",
  }),
  mem("shaman_ovoo", "Ovoo", "implemented", {
    kind: "prop",
    tags: ["steppe_nomad", "size_s"],
    note: "prop.place@0: the heaped stone cairn at a pass, built as filled courses stepping in - never a ring - with four ribbon poles at the corners and the lines strung between their heads above head height, because the point of an ovoo is that a traveller walks round it three times.",
  }),
  mem("balbal_stone", "Balbal", "implemented", {
    kind: "prop",
    tags: ["steppe_nomad", "size_xs"],
    note: "prop.place@0: the carved ancestor stone over a grave, face to the east - three courses of the theme's stone with the carved band at the middle and a slab cap, two low kerb stones a body steps over. Bare `stele` stays the sanctum wave's obelisk's.",
  }),
]);

/* -------------------------------------------------------------------------- */
/* queries                                                                     */
/* -------------------------------------------------------------------------- */

/** Look one up by id. */
export function structureById(id: string): StructureEntry | undefined {
  return STRUCTURE_CATALOG.find((entry) => entry.id === id);
}

/** Every entry in one category, in catalog order. */
export function structuresInCategory(
  category: StructureCategory,
): readonly StructureEntry[] {
  return STRUCTURE_CATALOG.filter((entry) => entry.category === category);
}

/** Every entry with one status, in catalog order. */
export function structuresWithStatus(
  status: StructureStatus,
): readonly StructureEntry[] {
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

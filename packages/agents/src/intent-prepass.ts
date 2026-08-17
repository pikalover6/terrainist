/**
 * The authoring **pre-pass**: prompt → `SemanticIntent`, before anything is
 * authored.
 *
 * Ratified disposition 3: *intent comes from a classify-the-prompt pre-pass,
 * and its output is inspectable before the main authoring call.* It costs one
 * cheap call and buys a place to look when a world comes out wrong — "the model
 * thought this was a rich, planned, far-future city" is a diagnosis; "the world
 * came out wrong" is not.
 *
 * Why a separate call rather than a field the main authoring turn fills in:
 *
 * 1. **Inspectability.** The intent exists as an object before the expensive
 *    call, so `--intent` can override it and a human can read it.
 * 2. **Separation of jobs.** Classifying a sentence is a small, closed task
 *    with a fixed output shape; authoring a document is a large open one. Asked
 *    together, the large one swamps the small one — the model writes a document
 *    and back-fills an intent that agrees with what it already wrote.
 * 3. **Cheapness.** One small completion at the pinned model, no reasoning
 *    budget, a few hundred tokens out.
 *
 * The output is validated by the *same* validator the compiler uses, and one
 * retry carries the diagnostics back verbatim. If both attempts fail the run
 * proceeds **without** intent: a classifier that cannot classify must not be
 * able to stop a world being made.
 */

import {
  COURTYARD_SHARE_MAX,
  COURTYARD_SHARE_MIN,
  DISTRICT_FABRIC_ALIASES,
  DISTRICT_FABRICS,
  DISTRICT_GROUND_POLICIES,
  ERA_ALIASES,
  ERA_CLASSES,
  EVENT_KINDS,
  DEFAULT_ERA_CLASS,
  formatDiagnostic,
  MASSING_STYLES,
  ROOF_TYPES,
  SNOW_POLICIES,
  FLORA_SPECIES_IDS,
  validateIntentValue,
  WINDOW_RHYTHMS,
  type EraClass,
  type LoamDiagnostic,
  type SemanticIntent,
} from "@terrainist/spec";

import { AUTHORING_MODEL_ID, AUTHORING_TEMPERATURE } from "./config.js";
import { loadOpenRouterKey } from "./env.js";
import { extractJson } from "./json.js";
import { chatComplete, sumUsage, type ChatMessage, type FetchLike, type Usage } from "./openrouter.js";

/** Attempts the pre-pass makes: one call, one retry with the diagnostics. */
export const MAX_INTENT_ATTEMPTS = 2;

/**
 * The classifier's system prompt.
 *
 * Small on purpose. It teaches the dials, not the document: nothing here says
 * anything about Loam, node kinds or generators, because a classifier that
 * knows about documents starts writing them.
 */
/**
 * The six material theme ids the structure grammar ships.
 *
 * Hand-listed because the theme table lives in `@terrainist/stdlib`, which the
 * agents package deliberately does not depend on (agents talk to the *spec*,
 * not to the block palettes). `packages/agents/test/intent-prepass.test.ts`
 * pins the list so a drift shows up as a failing test rather than as a
 * silently-dropped theme id.
 */
export const MATERIAL_THEME_IDS = [
  "temperate_timber",
  "boreal_pine",
  "birchwood_downs",
  "modern_city",
  "white_quartz",
  "sun_clay",
  "xeno_resin",
] as const;

/**
 * The nine `character.flora` keywords (FLORA-GRAMMAR-v0 §6.1).
 *
 * Hand-listed for the same reason {@link MATERIAL_THEME_IDS} is: the table
 * itself lives in `@terrainist/compiler`, which the agents package deliberately
 * does not depend on — a classifier talks to the *spec*, not to the scatterer.
 * `packages/cli/test/intent-flora-vocabulary.test.ts` sits downstream of both
 * and pins the two lists against each other, so drift is a failing test rather
 * than a word the classifier can write and nothing grounds.
 */
export const FLORA_CHARACTER_WORDS = [
  "old_growth",
  "ancient",
  "emergent",
  "understory",
  "deadwood",
  "sparse",
  "fungal",
  "glow",
  "crystal",
] as const;

/**
 * The two species no prompt reaches by accident (FLORA-GRAMMAR-v0 §2).
 *
 * Naming them here is what lets the prompt *forbid* naming them: the gate is
 * structural in the compiler, but a classifier that writes `glowcap` for a
 * fishing village has still mis-read the prompt, and a wrong dial is exactly
 * what the pre-pass exists to make visible.
 */
export const FANTASY_FLORA_IDS = ["glowcap", "crystal_spire"] as const;

/** The shape programs a flora word may name — a whole family at once. */
export const FLORA_PROGRAM_WORDS = [
  "conifer",
  "blob",
  "broadleaf",
  "giant",
  "ancient",
  "columnar",
  "umbrella",
  "fungal",
  "weeping",
] as const;

/** Representative archetype ids, shown so the model writes ids, not phrases. */
export const EXAMPLE_ARCHETYPE_IDS = [
  "cottage",
  "manor",
  "tavern",
  "church",
  "warehouse",
  "watchtower",
  "lighthouse",
  "windmill",
] as const;

/** Representative prop ids, shown for the same reason. */
export const EXAMPLE_PROP_IDS = [
  "fountain",
  "gazebo",
  "cart",
  "galleon",
  "standing_stones",
  "market_barrow",
  "well_head",
  "notice_board",
] as const;

/**
 * The form packs, `id -> thesis`, exactly as the classifier is shown them.
 *
 * Hand-listed for the same reason {@link MATERIAL_THEME_IDS} is: the registry
 * lives in `@terrainist/stdlib`, which the agents package deliberately does not
 * depend on. `packages/cli/test/intent-form-packs-vocabulary.test.ts` sits
 * downstream of both and pins this table against `FORM_PACKS`, so a pack added
 * to the registry and not taught here is a failing test rather than a
 * vocabulary the classifier can never reach — and reachability is the whole
 * point of a pack (`docs/CATALOG-EXPANSION-v0.md` §4.3: the classifier's prompt
 * is the first of the two reachability paths).
 *
 * Each line is a *thesis* — what a prompt in that space cannot say without the
 * pack — because the model is choosing between nine of them at once and a list
 * of contents would not separate them.
 */
export const FORM_PACK_THESES: readonly (readonly [string, string])[] = [
  [
    "classical_mediterranean",
    "colonnades, stoas, peristyle courts, temples, a citadel megaron — antiquity as FORMS. Troy, Athens, a Roman forum, a Hellenist waterfront.",
  ],
  [
    "nautical_pirate",
    "the SHORE rather than the fleet: jolly roger, gallows on the point, careened hulls, shore batteries, a chain across the harbour mouth.",
  ],
  [
    "arcane_magical",
    "a magical PLACE: rune circles in the ground, ley markers along the paths, a mage academy, stabling for winged mounts.",
  ],
  [
    "alien_scifi",
    "an invasion's fabric: crop circles, quarantine lines, field labs, barricades, hive mounds, blast doors.",
  ],
  [
    "agrarian",
    "the countryside BETWEEN the fields: hedgerows, dry stone walls, byres, dairies, hay barns, middens.",
  ],
  [
    "wilds_camps",
    "extraction in the wilderness: logging camps, flumes, sawpits, log booms, fire lookouts, cut-over ground.",
  ],
  [
    "frontier_west",
    "the wild west town the industrial era does not give you: false-front saloons, boardwalks, assay offices, livery stables, a mission church.",
  ],
  [
    "nile_egypt",
    "pyramids, hypostyle halls, pylon gates, mastabas, an avenue of sphinxes — the one silhouette everybody knows.",
  ],
  [
    "east_asian",
    "the PUBLIC forms around the houses: torii, moon gates, paifang arches, dry gardens, a tiered castle keep.",
  ],
  // --- mesoamerican_jungle pack ---
  [
    "mesoamerican_jungle",
    "maya/aztec in the rainforest: step pyramids with a stair up the face, ball courts, stelae, a caracol, sacbes, thatch dwellings.",
  ],
  // --- nordic_viking pack ---
  [
    "nordic_viking",
    "vikings/norse/fjords: mead halls with the fire down the middle, a chieftain's high seat, longship sheds on the water, turf houses, a heathen hof, rune stones, boat burials, fish drying racks.",
  ],
  // --- dwarven_volcanic pack ---
  [
    "dwarven_volcanic",
    "a dwarven hold in the black rock: a great forge with the furnace pit down its middle, a monumental hold gate, a pillared deep hall, smelters, a gem cuttery, a stone brewhouse, miners' dormitories, a rune forge, a cart depot, a king's treasury behind bars and a worked cavern shrine.",
  ],
  // --- steppe_nomad pack ---
  [
    "steppe_nomad",
    "mongols/nomads/the open grass: round felt gers with a crown ring at the top, a khan's ger on its dais, a ger on a cart, kumis tents, horse lines, a felt works, a bowyer, borts racks, an ovoo cairn, a horsetail standard and a wrestling ground.",
  ],
] as const;

/** One `id  <- thesis` line per pack, for the prompt. */
function formPackLines(): string {
  const width = Math.max(...FORM_PACK_THESES.map(([id]) => id.length));
  return FORM_PACK_THESES.map(([id, thesis]) => `    ${id.padEnd(width)}  <- ${thesis}`).join("\n");
}

/** One `class: alias, alias, …` line per era class, built from `ERA_ALIASES`. */
function eraVocabularyLines(): string {
  const byClass = new Map<EraClass, string[]>(ERA_CLASSES.map((c) => [c, []]));
  for (const [alias, cls] of Object.entries(ERA_ALIASES)) {
    if (alias === cls) continue;
    byClass.get(cls)?.push(alias);
  }
  const width = Math.max(...ERA_CLASSES.map((c) => c.length));
  return ERA_CLASSES.map(
    (cls) => `    ${cls.padEnd(width)}  <- ${(byClass.get(cls) ?? []).join(", ")}`,
  ).join("\n");
}

const list = (xs: readonly string[]): string => xs.join(", ");

/**
 * Ids the classifier is never shown.
 *
 * **Exactly the aliases** (`docs/SITE-PLAN-v0.md` §7.1, cutover 2026-08-08).
 * `terraced` is now a legal spelling of `hillside`, so teaching it would teach
 * the model an indirection for nothing; a document that already says it still
 * compiles, and says so. Deriving this set from `DISTRICT_FABRIC_ALIASES` rather
 * than hand-listing keeps the rest of the table total against
 * `DISTRICT_FABRICS` — a form added to the vocabulary with no hint line is still
 * a build error — and makes "a form nothing can select cannot exist" a property
 * of the vocabulary rather than of this file.
 */
const UNOFFERED_FORMS: ReadonlySet<string> = new Set(Object.keys(DISTRICT_FABRIC_ALIASES));

/** An offered urban form — every id in the vocabulary that is not an alias. */
type OfferedForm = Exclude<(typeof DISTRICT_FABRICS)[number], keyof typeof DISTRICT_FABRIC_ALIASES>;

/**
 * What a prompt has to say for each urban form, one line per id.
 *
 * Keyed off `DISTRICT_FABRICS` rather than hand-listed, so a form added to the
 * vocabulary without a line here is a missing key at build time rather than a
 * form the classifier can never choose. This is §6.3's table: **`era` on its own
 * deliberately does not pick a form** — a mapping from era to form would move
 * every intent-carrying world that already has an `era`, so the guess lives here
 * in the pre-pass, where a human can read the answer before the expensive call.
 */
const URBAN_FORM_HINTS: Readonly<Record<OfferedForm, string>> = {
  canal: 'canal town, Venice, Amsterdam, "streets of water", a quarter built on a lagoon',
  hillside: 'hill town, cliffside, Cinque Terre, "a town on a mountainside", terraces, stepped streets',
  radial: 'ring town, baroque capital, star fort, "everything faces the palace or the cathedral"',
  linear: 'ribbon village, roadside village, valley village, "strung along the road"',
  grown: 'medieval, an old quarter, "grew over centuries", "no two streets parallel", winding lanes',
  grid: "planned, colonial, gridiron, a modern downtown, a company town",
  organic: "(legacy — write grown instead)",
};

/** The hint table as prompt lines, in vocabulary order. */
const URBAN_FORM_LINES = DISTRICT_FABRICS.filter((id) => !UNOFFERED_FORMS.has(id))
  .map(
    (id) =>
      `    ${id.padEnd(Math.max(...DISTRICT_FABRICS.map((f) => f.length)))}  <- ${URBAN_FORM_HINTS[id as OfferedForm]}`,
  )
  .join("\n");

/**
 * What a prompt has to say for each ground policy, one line per id.
 *
 * Keyed off `DISTRICT_GROUND_POLICIES` for the same reason
 * {@link URBAN_FORM_HINTS} is keyed off `DISTRICT_FABRICS`: a policy added to
 * the vocabulary without a line here is a missing key at **build time**, not a
 * value the classifier can never choose. A kit doc and a validator drifting
 * apart cost a revision round on most worlds until that was caught.
 */
const GROUND_POLICY_HINTS: Readonly<Record<(typeof DISTRICT_GROUND_POLICIES)[number], string>> = {
  pad: 'the ordinary answer — one flat platform per quarter. Omit "ground" rather than writing this',
  benched:
    "the quarter cuts its own terraces and nothing is built between them. Written by a form, not usually by you",
  stepped:
    'hill town, cliffside, "streets on different levels", "steps between the levels", "terraces held up by stone walls"',
};

/** The ground hint table as prompt lines, in vocabulary order. */
const GROUND_POLICY_LINES = DISTRICT_GROUND_POLICIES.map(
  (id) =>
    `    ${id.padEnd(Math.max(...DISTRICT_GROUND_POLICIES.map((g) => g.length)))}  <- ${GROUND_POLICY_HINTS[id]}`,
).join("\n");

/**
 * What a prompt has to say for a courtyard share.
 *
 * Not a closed vocabulary — it is a number — so this is one paragraph rather
 * than a table, and the number it names is the one
 * `docs/COURTYARDS-AND-LEVELS-v0.md` §5.2 names.
 */
const COURTYARD_HINT = `courtyards: a number in ${COURTYARD_SHARE_MIN}..${COURTYARD_SHARE_MAX}. The share of the blocks that CAN close
around a shared interior which actually do. A courtyard block is introverted:
an unbroken street wall, an arched passage cut under a building, and a real
place inside — a well, a tree, a cloister walk. Write ~0.7 when the prompt says
old quarter, medina, casbah, kasbah, cloister, "buildings around a courtyard",
"narrow lanes and hidden yards". Omit it otherwise; omitted means none, and a
village of detached houses in gardens should have none.`;

/** The one worked example. Short on purpose: shape first, content second. */
const WORKED_EXAMPLE = `EXAMPLE
Prompt: "two islands in a warm sea — a white unicorn shrine isle and a
ramshackle pirate cove"
Good reply:
{
  "climate": { "temperature": 0.6, "humidity": 0.4, "snow": "never" },
  "tokens": {
    "region_unicorn_isle": "era renaissance, wealth 0.8, decline 0.05, formality 0.7; materialTheme white_quartz; prefer archetypes church, manor; airy shrine terraces, unicorns kept as sacred animals",
    "region_pirate_cove": "era renaissance, wealth 0.3, decline 0.7, formality 0.15; materialTheme temperate_timber; prefer archetypes tavern, warehouse, lighthouse; props galleon, cart; moored ships, salvaged planking"
  }
}
Note what it did NOT do: no single averaged "character" block for both isles,
no "era": "pirate" (pirate is an alias — the class is renaissance), and no
"unicorn island" in a prefer list (that is prose, so it lives in a token).`;

export const INTENT_CLASSIFIER_PROMPT = `You classify a world-building prompt into a small JSON object of "intent" dials.
You never write a world. You only describe what kind of place the prompt asks for.

Reply with a JSON object and nothing else. Every field is OPTIONAL, and omitting
a field means "the prompt does not say" — which is NOT the same as zero.

{
  "era": string        // A CLASS or a listed ALIAS. Nothing else is legal.
  "wealth": 0..1       // 0 destitute, 0.5 ordinary, 1 rich
  "decline": 0..1      // 0 kept up, 1 abandoned. Orthogonal to wealth:
                       // a rich ruin exists.
  "formality": 0..1    // 0 organic vernacular lanes, 1 planned and monumental
  "event": { "kind": one of [${list(EVENT_KINDS)}],
             "severity": 0..1, "recency": 0..1 }   // 0 recency = happening now
  "climate": { "biome": "minecraft:<id>", "temperature": -1..1,
               "humidity": -1..1, "snow": one of [${list(SNOW_POLICIES)}],
               "blend": one of ["sharp", "soft", "wide"] }  // how the named
                       // biome fades into the ambient; omit for the default
  "character": {
    "label": string,             // free text, e.g. "pirate haven"
    "materialTheme": one of the six ids below,
    "fortification": "walled",   // a closed circuit wall with gates and
                       // towers around the settlement. WRITE IT whenever the
                       // prompt names a walled or fortified city, a fortress
                       // town, a citadel, a siege, or a city of antiquity
                       // that history walled (Troy, Babylon, a Greek
                       // city-state). Omit it for an open place — absent
                       // means no wall, and prose in the brief will NOT
                       // produce one: only this dial builds the circuit.
    "formPacks": [pack ids],     // whole FORM vocabularies — see below. The
                       // palette says what a town is made of; a form pack says
                       // what its buildings ARE.
    "archetypes": { "prefer": [ids], "forbid": [ids] },
    "props":      { "prefer": [ids], "forbid": [ids] },
    "flora":      { "prefer": [tree shapes], "forbid": [tree shapes] },
    "motifs": { "roofType": one of [${list(ROOF_TYPES)}],
                "massing": one of [${list(MASSING_STYLES)}],
                "windowRhythm": one of [${list(WINDOW_RHYTHMS)}],
                "ornamentDensity": 0..1 },
    "urbanForm": one of [${list(DISTRICT_FABRICS)}],   // the shape of the streets
    "courtyards": ${COURTYARD_SHARE_MIN}..${COURTYARD_SHARE_MAX},   // how many blocks close around a shared interior
    "ground": one of [${list(DISTRICT_GROUND_POLICIES)}]   // how the ground under a quarter is prepared
  },
  "tokens": { "<name>": string|number|boolean }   // anything else worth keeping
}

CLOSED VOCABULARIES — a value outside these is a warning, not a world.

era: exactly these ${ERA_CLASSES.length} classes; the words after "<-" are the ONLY other
accepted spellings, and each resolves to the class on its line:
${eraVocabularyLines()}
  Write the class or one of its aliases verbatim. "pirate" is legal (it means
  renaissance); "piratical", "swashbuckling" and "unicorn" are not. Any other
  word is discarded and falls back to ${DEFAULT_ERA_CLASS}.

  ALWAYS WRITE "era" WHEN THE PROMPT IMPLIES A PERIOD AT ALL. It is the one
  dial that should almost never be omitted. Omitting it is NOT neutral: the
  street furniture pass then keeps its full modern kit, so a mountain village
  with no "era" comes out with air-conditioning units on its walls, fire
  hydrants and phone boxes along its kerbs, wheeled dumpsters in its back
  courts and cars parked on its lanes. A period is implied far more often than
  it is stated:
    - mountain village, hillside town, old hill town, fishing village, farming
      hamlet, a town with a chapel or a castle  -> medieval
    - colonial, age of sail, pirate, baroque                 -> renaissance
    - victorian, steampunk, mill town, wild west             -> industrial
    - downtown, suburb, contemporary, cyberpunk              -> modern / far_future
    - roman, greek, classical -> ancient;  tribal, prehistoric -> primitive
  Leave "era" out ONLY when the prompt fixes no period AND a present-day street
  full of cars and hydrants would look right.

  ERA DESCRIBES THE SETTLEMENT, NEVER AN EVENT OR ITS VISITORS. A place that
  is invaded, attacked, haunted or visited keeps its own period: "a farm town
  being invaded by aliens" is a rural town (medieval or industrial by its own
  look) — the aliens live in "event" and in bespoke programs, not in "era".
  Writing far_future there re-clads every cottage in alien materials, which is
  exactly backwards: the horror of an invasion is modern things standing over
  ordinary ones. Write far_future only when the PLACE ITSELF is far-future — a
  cyberpunk city, a space colony, an arcology.

  AN EVENT WITH A DIRECTION KEEPS ITS DIRECTION. When the prompt has something
  coming at the place, leaving it, or squaring up to something else — "invaded
  from the sea", "the caravan sets out for the desert", "two giants facing off
  across the valley" — write that in a token, in the prompt's own words:
  "event_direction": "the sea monsters come out of the northern water AT the old
  town". The world author turns it into a facing relation on the bespoke node,
  and it is the whole difference between an invasion and twenty-four monsters
  standing with their backs to the city.

materialTheme: exactly these ${MATERIAL_THEME_IDS.length} ids, and no others exist:
    ${list(MATERIAL_THEME_IDS)}

  Pick by the place's own material logic, and default toward the modest end:
  villages, farms, ports, market towns -> temperate_timber; taiga, alpine,
  fjord -> boreal_pine; parkland, downs, spa towns -> birchwood_downs;
  contemporary or futuristic cities -> modern_city.

  sun_clay is THE ANCIENT MEDITERRANEAN AND THE DESERT — sun-baked stone and
  clay: sandstone, plaster, terracotta, mud brick, pale flat roofs. Write it
  for Troy, Greek and Roman antiquity, Carthage, holy cities (Jerusalem,
  Babylon), Aegean island towns, oasis and desert trade towns, anything
  described as adobe, whitewashed, sandstone or sun-baked. It is ORDINARY
  antiquity, not a prestige palette: an ancient fishing village, a mud-brick
  farming town and a marble-less hill town on a hot coast are all sun_clay.
  Nothing else in this list can say antiquity — an ancient city written as
  modern_city comes out grey, and written as white_quartz comes out a wedding
  cake.

  xeno_resin is THE ALIEN ORGANIC — chitin, resin and carapace: wart blocks,
  fungal stems, purpur, blackstone. Write it ONLY for a settlement that IS
  alien (a hive city, an infested quarter, a xeno colony) — never for the
  human side of an invasion prompt, whose towns keep their own palette while
  the alien things arrive as formPacks buildings and bespoke programs. A
  farm town being invaded is temperate_timber with alien icons, not
  xeno_resin.

  "white_quartz" is the PRESTIGE exception and is almost always the wrong
  answer: write it only for the sacred, the palatial or the
  otherworldly-refined (a temple city, a wizard's citadel, an elven capital) —
  never for an ordinary town however scenic, and never merely because the
  prompt says "stone" or "white". Stone-built ordinary towns are a palette
  question the compiler already answers; a medieval hill town in white_quartz
  reads as a wedding cake, and so does an ancient one, which is what sun_clay
  is for.

flora: what the wilderness is made of. Three kinds of word ground here, and
nothing else does. Write flora ONLY when the prompt says something about the
trees, the wood or the ground cover; an omitted flora leaves every forest the
one the climate would have chosen, which is always safe.

  1. CHARACTER WORDS — the usual answer, because a prompt describes a wood
     rather than a species list:
    ${list(FLORA_CHARACTER_WORDS)}
     old_growth  <- ancient forest, primeval, virgin wood, mossy old wood
     ancient     <- gnarled, veteran trees, "trees older than the town"
     emergent    <- "giant trees", "trees towering over the canopy"
     understory  <- "dense undergrowth", "thick, deep wood"
     deadwood    <- blighted, dying, "fallen trees everywhere"
     sparse      <- thin wood, scattered trees, "a few trees"
     fungal      <- mushroom forest, fungal, mycelial, "giant mushrooms"
     glow        <- glowing, bioluminescent, luminous
     crystal     <- crystalline, amethyst
  2. SPECIES IDS — a precise dial, when the prompt names a kind of tree:
    ${list(FLORA_SPECIES_IDS)}
  3. SHAPE PROGRAMS — a whole family at once: ${list(FLORA_PROGRAM_WORDS)}

  "glow" and "crystal", and the two species ${list(FANTASY_FLORA_IDS)}, are the
  FANTASY gate. Nothing else can reach them, by design — a medieval fishing
  village must never sprout glow trees. Write one only when the prompt is
  itself fantastical (a fae wood, a spore-lit hollow, a crystal waste), never
  because a place merely sounds magical.

archetypes: single-word building ids, e.g. ${list(EXAMPLE_ARCHETYPE_IDS)}.
props: single-word object ids, e.g. ${list(EXAMPLE_PROP_IDS)}.

formPacks: exactly these ${FORM_PACK_THESES.length} pack ids, and nothing else. A pack is a whole
FORM vocabulary — the nouns a culture or genre builds — and it is a DIFFERENT
axis from materialTheme, which is only the palette. sun_clay is the palette;
classical_mediterranean is the FORMS; a prompt from antiquity wants BOTH,
because a medieval townhouse in sandstone is still a medieval townhouse.
${formPackLines()}
  Write a pack whenever the prompt sits in its space — usually one, at most
  two, and it is normal to write none. A pack is a DEFAULT vocabulary: any
  archetypes you prefer or forbid still outrank it. Affinity is advice, so an
  ancient pack in a modern city is legal and sometimes the whole point (a
  modern Hellenist capital). Omitting formPacks changes nothing at all.

  In a STRONGLY-DATED world (a named ancient city, a medieval siege, a
  frontier town), keep the era's own words in any mix or prefer list you
  write: pack members and era-plausible vernacular (courtyard_house, hall,
  granary) over anachronisms (townhouse, warehouse, office read as modern
  words even where the compiler builds them plainly). This is a style rule,
  not a gate — nothing is forbidden by it.

urbanForm: exactly these ${DISTRICT_FABRICS.length} ids. This is the single field that decides whether
two towns look like different places, so read the prompt for it deliberately —
but write it ONLY when the prompt actually says something about the shape of the
place. An omitted urbanForm means every quarter keeps the form it would have
had, which is always safe; a guessed one restyles the whole settlement.

${URBAN_FORM_LINES}

  Notes on three of them:
  - "hillside" needs a genuinely steep site. Write it for a town that is ON a
    mountainside or a cliff, not for one that merely has hills nearby — on
    gentle ground it falls back and warns. It is the form for anything the
    prompt calls terraced.
  - "grown" is the medieval default. "organic" is a legacy value that means
    much the same thing but flatter; prefer "grown".
  - "grid" is worth writing explicitly for a planned or colonial town, because
    it says the plan was deliberate rather than a default.

ground: exactly these ${DISTRICT_GROUND_POLICIES.length} ids. It is ORTHOGONAL to urbanForm — any form can
have any ground — so write it when the prompt says something about levels, not
because you already wrote "hillside".

${GROUND_POLICY_LINES}

  "stepped" is what builds retaining walls, steps between the levels and
  terrace gardens above the walls. On genuinely flat ground the quarter comes
  out as one platform and says so; it is never a failed world.

${COURTYARD_HINT}

  Courtyards are NOT a form. "old hill town" is BOTH "courtyards": 0.7 AND
  "ground": "stepped" (and probably "urbanForm": "grown") — never a choice
  between the two halves of the phrase.

PROSE GOES IN "tokens", NEVER IN A PREFER LIST.
prefer/forbid entries are matched against real catalogs; anything that is not
an id is dropped with a warning. So "unicorn island", "pirate cove",
"shrine village", "moored ships", "pastel meadows" are all WRONG in a prefer
list. If you cannot name a legal id, write the idea as a sentence in "tokens" —
prose is what that field is for, and it reaches the author intact.

AN EMERGENCY HAS FABRIC, AND IT IS NOT A PROP.
When the prompt is an invasion, an outbreak, a quarantine, a crash, a siege or
an evacuation, the thing that reads on a walk is the LINEWORK the emergency put
across the ordinary place — a cordon round the fields, a barricade across the
street, a gouge in the ground ending at whatever made it, a figure pressed into
a crop. The compiler builds those as infrastructure entries and NOT as props or
buildings, so they cannot arrive through a prefer list. Name them in "tokens"
and the author writes the nodes:
  "infra": "quarantine_fence ringing the north holding; crop_circle over its
  fields; barricade_line across the road into town; crash_furrow into the
  wreck"
Write only the ones the prompt actually implies, each against a place: a fence
rings SOMETHING, a barricade crosses SOME road, a furrow ends at SOME thing.
A furrow with nothing at the end of it is refused outright, so if you write one,
also say what it ends at (a bespoke landmark, usually).
Keep the town's own era and palette while you do it — see the era note above:
the horror is modern things standing over ordinary ones.

PEACETIME HAS FABRIC TOO, AND IT IS THE SAME FIELD.
An ordinary place's lines go in the same "infra" token and are just as much of
the walk: hedgerow / dry_stone_wall round a holding or along a lane, cart_track
between them, boardwalk along a frontier street, sphinx_avenue up to a temple,
cannon_battery along a defended shore — each one against a place it borders.

A FITTING IS NOT A THING — IT IS HOW A DOOR IS MADE.
blast_door and airlock_vestibule are not props, not buildings and not entries:
each is the WAY IN to a building, written on that building. Name them in
"tokens" against the building they belong to and the author writes the param:
  "fittings": "blast_door on the hillside bunker_complex; airlock_vestibule on
  the hydroponics_bay"
A blast door suits a bunker_complex, underground_silo, bunker or pillbox; an
airlock a hydroponics_bay, laboratory, field_station or bunker_complex. Write
one only when the prompt implies a way in that is sealed — a hideout, a shelter,
a clean room, a quarantine.

ONE PLACE PER TOKEN — DO NOT MERGE PLACES.
If the prompt names SEVERAL distinct places (two islands, a city and a ruin),
you must NOT write one "character" block covering both: an averaged intent is
what makes every region come out looking the same. Instead, structurally:
  1. Top level (era/wealth/decline/formality/character) carries ONLY what is
     genuinely shared by every place — often just "climate". When the places
     disagree on a dial, OMIT that dial at the top level.
  2. Emit one entry in "tokens" per place, keyed "region_<place>", whose value
     names that place's own era, wealth, decline, formality, materialTheme and
     preferred archetypes/props. The document author turns one token into one
     region's own character block, so a missing token is a missing region.

Only state what the prompt actually implies. Guessing every dial is worse than
leaving one out.

A NAMED PLACE IS A FULL IDENTITY — EXPAND IT.
When the prompt names a real or legendary place (Troy, Venice, Babylon, New
York, Atlantis), the name IS the brief, and a stranger walking the world must
recognise the place in ten seconds. Write the place's WHOLE identity, not the
one noun the prompt mentioned: its era; its materialTheme; its terrain (write
a "tokens" sentence — Troy and Venice are COASTAL, the sea and the ships are
half the postcard); its urbanForm and motifs (antiquity is flat-roofed,
dense, party-walled — "roofType": "flat", "massing": "dense" where the
vocabulary allows); its fortification (history walled most ancient cities —
write "walled"); and a "tokens" line listing the place's ICONS by name so the
author delivers each one. Worked example — "The Trojan horse in Troy":
  era ancient; materialTheme sun_clay; formPacks ["classical_mediterranean"];
  fortification "walled";
  motifs roofType flat; climate "blend" as the coast wants;
  tokens: { "terrain": "a walled city on a rise above a sandy coast; the
  Aegean shore in view", "icons": "the wooden horse at the gates; the city
  wall with towers; beached war-ships along the shore; a citadel-palace
  rising above the flat-roofed town" }
A named place that comes out generic has failed the prompt however well it
compiles.

${WORKED_EXAMPLE}

Reply with the JSON object alone. No prose, no markdown fence.`;

/** What the pre-pass produced. */
export interface IntentClassification {
  /** The classified intent. `{}` when the model had nothing to say. */
  readonly intent: SemanticIntent;
  readonly attempts: number;
  readonly usage: Usage;
  readonly model: string;
  /** Raw model text of the final attempt, kept for inspection. */
  readonly raw: string;
  /** Diagnostics from the last attempt; empty on success. */
  readonly diagnostics: readonly LoamDiagnostic[];
  /** True when both attempts failed and the run continues without intent. */
  readonly failed: boolean;
}

/** Request for {@link classifyPromptIntent}. */
export interface ClassifyIntentRequest {
  readonly prompt: string;
  /** Override the pinned model. Defaults to {@link AUTHORING_MODEL_ID}. */
  readonly model?: string;
  readonly maxAttempts?: number;
  /** Injected for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
  /** Injected for tests; defaults to `.env` / the process environment. */
  readonly apiKey?: string;
  /** Override the classifier's system prompt. Tests and experiments only. */
  readonly systemPrompt?: string;
}

/**
 * Classify a prompt into an intent object.
 *
 * Never throws for a model that misbehaves: a classification that cannot be
 * had comes back `failed` with an empty intent, and the caller authors exactly
 * as it did before this pass existed.
 */
export async function classifyPromptIntent(
  request: ClassifyIntentRequest,
): Promise<IntentClassification> {
  const apiKey = request.apiKey ?? loadOpenRouterKey();
  const model = request.model ?? AUTHORING_MODEL_ID;
  const maxAttempts = Math.max(1, request.maxAttempts ?? MAX_INTENT_ATTEMPTS);

  const messages: ChatMessage[] = [
    { role: "system", content: request.systemPrompt ?? INTENT_CLASSIFIER_PROMPT },
    { role: "user", content: `Prompt:\n${request.prompt}` },
  ];

  const usages: Usage[] = [];
  let raw = "";
  let diagnostics: readonly LoamDiagnostic[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const completion = await chatComplete({
      apiKey,
      model,
      messages,
      temperature: AUTHORING_TEMPERATURE,
      ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
    });
    usages.push(completion.usage);
    raw = completion.text;

    const extracted = extractJson(completion.text);
    if (extracted.ok) {
      const validation = validateIntentValue(extracted.value);
      diagnostics = validation.diagnostics;
      if (validation.intent !== undefined) {
        return {
          intent: validation.intent,
          attempts: attempt,
          usage: sumUsage(usages),
          model: completion.model,
          raw,
          diagnostics,
          failed: false,
        };
      }
    } else {
      diagnostics = [];
    }

    if (attempt === maxAttempts) break;
    messages.push({ role: "assistant", content: completion.text });
    messages.push({
      role: "user",
      content: retryIntentPrompt(extracted.ok ? diagnostics : [], extracted.ok ? undefined : "the reply was not a JSON object"),
    });
  }

  return {
    intent: {},
    attempts: usages.length,
    usage: sumUsage(usages),
    model,
    raw,
    diagnostics,
    failed: true,
  };
}

/** The pre-pass's one retry turn. */
export function retryIntentPrompt(
  diagnostics: readonly LoamDiagnostic[],
  reason: string | undefined,
): string {
  return [
    reason === undefined
      ? `That object is not a valid intent. The validator reported ${diagnostics.length} problem(s):`
      : `That reply could not be used: ${reason}.`,
    ``,
    ...diagnostics.map(formatDiagnostic),
    ``,
    `Reply with a corrected JSON intent object alone. Omit any field you are not`,
    `sure about — an omitted dial means "the prompt does not say", which is`,
    `always a safe answer.`,
  ].join("\n");
}

/**
 * Render an intent as the block the authoring conversation carries.
 *
 * The document author gets the classification as **context**, not as an
 * instruction to copy: it is told to put it in the document and, crucially, to
 * *differentiate* per region — which is the whole unicorn-island-vs-pirate-
 * island acceptance case.
 */
export function intentKitContext(intent: SemanticIntent): string {
  const json = JSON.stringify(intent, null, 2);
  return [
    `A classifier has already read this prompt and produced the world's intent:`,
    ``,
    json,
    ``,
    `Carry it into the document as a top-level "intent" object, adjusting`,
    `anything it got wrong. Where the prompt describes two or more places that`,
    `should read differently, give each region node its own "intent" with its`,
    `own "character" block — that is how one world holds two themes. A district`,
    `or city node inherits the world's intent and overrides only what differs.`,
  ].join("\n");
}

/** Render a classification for a human to look at before the expensive call. */
export function formatClassification(c: IntentClassification): string {
  if (c.failed) {
    return `intent     (classification failed after ${c.attempts} attempt(s); authoring without it)`;
  }
  return [`intent     ${JSON.stringify(c.intent)}`, `           ${c.attempts} attempt(s), ${c.usage.totalTokens} tokens`].join("\n");
}

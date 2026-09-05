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
  ERA_ALIASES,
  ERA_CLASSES,
  EVENT_KINDS,
  DEFAULT_ERA_CLASS,
  FLORA_SPECIES_IDS,
  FORM_PACK_THESES,
  formatDiagnostic,
  MASSING_STYLES,
  MATERIAL_THEME_IDS,
  ROOF_TYPES,
  SNOW_POLICIES,
  validateIntentValue,
  WINDOW_RHYTHMS,
  type EraClass,
  type LoamDiagnostic,
  type SemanticIntent,
} from "@terrainist/spec/ir";

import { apiBaseUrl, defaultModel, loadApiKey } from "./env.js";
import { extractJson } from "./json.js";
import { executeWithRetry, type RetryClientOptions } from "./retry-executor.js";
import type { ChatMessage, FetchLike, Usage } from "./chat.js";

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
 * Re-exported from `@terrainist/spec` — the author-visible material theme vocabulary.
 *
 * Spec is the single owner; agents consume the canonical list so the prompt and
 * the validator name the same ids in the same order. The prompt text is a pure
 * function of that list, so moving the definition does not move a byte.
 */
export { MATERIAL_THEME_IDS };

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
 * Re-exported from `@terrainist/spec` — the author-visible form-pack vocabulary.
 *
 * Spec is the single owner; agents consume the canonical table so the prompt
 * `id <- thesis` lines are a pure function of that table. The prompt text is
 * byte-identical to the hand-listed table this re-export replaces, and the
 * re-export keeps the public API (`import { FORM_PACK_THESES } from
 * "@terrainist/agents"`) stable for downstream tests. See `FORM_PACK_SPECS` in
 * `@terrainist/spec` for the full spec (name, thesis, eras).
 */
export { FORM_PACK_THESES };

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

/** The one worked example. Short on purpose: shape first, content second. */
const WORKED_EXAMPLE = `EXAMPLE
Prompt: "two islands in a warm sea — a white unicorn shrine isle and a
ramshackle pirate cove"
Good reply:
{
  "climate": { "temperature": 0.6, "humidity": 0.4, "snow": "never" },
  "tokens": {
    "region_unicorn_isle": "era renaissance, wealth 0.8, decline 0.05, formality 0.7; materialTheme white_quartz; buildings church, manor; airy shrine terraces, unicorns kept as sacred animals",
    "region_pirate_cove": "era renaissance, wealth 0.3, decline 0.7, formality 0.15; materialTheme temperate_timber; buildings tavern, warehouse, lighthouse; props galleon, cart; moored ships, salvaged planking"
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
    "formPacks": [pack ids],     // whole FORM vocabularies — see below. The
                       // palette says what a town is made of; a form pack says
                       // what its buildings ARE.
    "props":      { "prefer": [ids], "forbid": [ids] },
    "flora":      { "prefer": [tree shapes], "forbid": [tree shapes] },
    "motifs": { "roofType": one of [${list(ROOF_TYPES)}],
                "massing": one of [${list(MASSING_STYLES)}],
                "windowRhythm": one of [${list(WINDOW_RHYTHMS)}],
                "ornamentDensity": 0..1 }
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
  A NAMED antique place is as decisive as the word itself, and more common in
  practice: Troy, Ilium, Mycenae, Athens, Sparta, Corinth, Knossos, Rome,
  Pompeii, Carthage, Alexandria, Babylon, Ur, Nineveh, Persepolis, Thebes,
  Memphis, Giza, and any Homeric, Biblical or Greco-Roman-myth setting are
  "era": "ancient" — write it even when the prompt's own subject is an event
  (a siege, a horse, a burning) rather than the period.
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

props: single-word object ids, e.g. ${list(EXAMPLE_PROP_IDS)}.
buildings are NOT a dial here: the document author chooses every quarter's
"mix" from the catalog (ids like ${list(EXAMPLE_ARCHETYPE_IDS)}). When the
prompt implies particular buildings, name them in a "buildings" token.

formPacks: exactly these ${FORM_PACK_THESES.length} pack ids, and nothing else. A pack is a whole
FORM vocabulary — the nouns a culture or genre builds — and it is a DIFFERENT
axis from materialTheme, which is only the palette. sun_clay is the palette;
classical_mediterranean is the FORMS; a prompt from antiquity wants BOTH,
because a medieval townhouse in sandstone is still a medieval townhouse.
${formPackLines()}
  Write a pack whenever the prompt sits in its space — usually one, at most
  two, and it is normal to write none. A pack is a DEFAULT vocabulary the
  author's own "mix" outranks. Affinity is advice, so an ancient pack in a
  modern city is legal and sometimes the whole point (a modern Hellenist
  capital). Omitting formPacks changes nothing at all.

  In a STRONGLY-DATED world (a named ancient city, a medieval siege, a
  frontier town), a pack on its own is not enough: ALSO write a "buildings"
  token naming five to eight of that pack's forms (for classical_mediterranean:
  peristyle_house and megaron for the houses, stoa for the street edge, and
  among peripteral_temple, propylaea, bouleuterion, tholos, palaestra,
  gymnasion, odeon for what the quarter is about) and the anachronisms to
  keep out (townhouse, terraced_row, shop_row, office, apartment_block). The
  document author builds every quarter's "mix" from that token.

THE SHAPE OF THE STREETS, THE LEVELS AND THE WALLS ARE THE AUTHOR'S.
Urban form, stepped ground, courtyards and a city wall are written on the
district or city node by the document author, not here. When the prompt says
something about them — a hill town on terraces, a walled city, a medina of
hidden yards, a canal town, a planned grid — put it in a "settlement" token
in plain words so the author writes the right params:
  "settlement": "walled hill town; stepped streets on terraces; old quarter of
  courtyards"

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

PIN THE PROMPT'S TERRAIN NOUNS — COUNT THEM AND NAME THEM.
The prompt's landforms and water bodies are REQUIREMENTS, not atmosphere, and
the document author only receives what you write down. So the "terrain" token
must state each one the prompt names, WITH ITS COUNT, in plain words:
  "two islands separated by open water"
  "a coastal city with a harbour and open sea"
  "a river through the town"
Never soften a count or a body of water into a mood. "Two islands at war" is
TWO islands and the water between them — one landmass deletes the war, because
the strait IS the war. A harbour city needs its sea BESIDE it, not instead of
it, and sea monsters need a sea to come out of; a document that dries the water
to make room for the land has failed the prompt as surely as one that drowns
the town. Write the land AND the water in the same sentence — they sit side by
side, never traded — and the author sizes both.

A NAMED PLACE IS A FULL IDENTITY — EXPAND IT.
When the prompt names a real or legendary place (Troy, Venice, Babylon, New
York, Atlantis), the name IS the brief, and a stranger walking the world must
recognise the place in ten seconds. Write the place's WHOLE identity, not the
one noun the prompt mentioned: its era; its materialTheme; its terrain (write
a "tokens" sentence — Troy and Venice are COASTAL, the sea and the ships are
half the postcard); its motifs (antiquity is flat-roofed, dense, party-walled —
"roofType": "flat" where the vocabulary allows); its settlement (history walled
most ancient cities — say so in the "settlement" token); and a "tokens" line
listing the place's ICONS by name so the author delivers each one. Worked
example — "The Trojan horse in Troy":
  era ancient; materialTheme sun_clay; formPacks ["classical_mediterranean"];
  motifs roofType flat; climate "blend" as the coast wants;
  tokens: { "terrain": "a walled city on a rise above a sandy coast; the
  Aegean shore in view", "settlement": "walled city on the rise; grown
  lanes; a citadel quarter above the town", "buildings": "peristyle_house,
  megaron, stoa, peripteral_temple, palaestra, olive_press; no townhouse,
  terraced_row, shop_row, office, apartment_block", "icons": "the wooden
  horse at the gates; the city wall with towers; beached war-ships along the
  shore; a citadel-palace rising above the flat-roofed town" }
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
  /** Override the model (`TERRAINIST_MODEL`, else the pinned default). */
  readonly model?: string;
  /** Override the API root. */
  readonly baseUrl?: string;
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
  const apiKey = request.apiKey ?? loadApiKey();
  const model = request.model ?? defaultModel();
  const baseUrl = request.baseUrl ?? apiBaseUrl();
  const maxAttempts = Math.max(1, request.maxAttempts ?? MAX_INTENT_ATTEMPTS);

  const initialMessages: ChatMessage[] = [
    { role: "system", content: request.systemPrompt ?? INTENT_CLASSIFIER_PROMPT },
    { role: "user", content: `Prompt:\n${request.prompt}` },
  ];

  const client: RetryClientOptions = {
    apiKey,
    baseUrl,
    model,
    ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
  };

  const result = await executeWithRetry<unknown, SemanticIntent>({
    client,
    initialMessages,
    maxAttempts,
    extract: (raw) => {
      const extracted = extractJson(raw);
      if (extracted.ok) return { ok: true, value: extracted.value, source: extracted.source, raw };
      return { ok: false, reason: extracted.reason, raw };
    },
    validate: (extraction) => {
      if (!extraction.ok) return { diagnostics: [] };
      const validation = validateIntentValue(extraction.value);
      if (validation.intent !== undefined) return { diagnostics: validation.diagnostics, value: validation.intent };
      return { diagnostics: validation.diagnostics };
    },
    buildRetryMessage: ({ extraction, validation }) =>
      retryIntentPrompt(
        extraction.ok ? validation.diagnostics : [],
        extraction.ok ? undefined : "the reply was not a JSON object",
      ),
    getAssistantContent: (extraction) => extraction.raw,
  });

  if (!result.failed && result.value !== undefined) {
    return {
      intent: result.value,
      attempts: result.attempts,
      usage: result.usage,
      model: result.model,
      raw: result.raw,
      diagnostics: result.diagnostics,
      failed: false,
    };
  }

  return {
    intent: {},
    attempts: result.attempts,
    usage: result.usage,
    model,
    raw: result.raw,
    diagnostics: result.diagnostics,
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
  const json = JSON.stringify(loamIntent(intent), null, 2);
  return [
    `A classifier has already read this prompt and produced the world's intent:`,
    ``,
    json,
    ``,
    `Carry it into the document as a top-level "intent" object, adjusting`,
    `anything it got wrong. Where the prompt describes two or more places that`,
    `should read differently, give each district or city thing its own "intent"`,
    `with its own "character" block — that is how one world holds two themes. A`,
    `district or city inherits the world's intent and overrides only what differs.`,
  ].join("\n");
}

/**
 * The classifier speaks the internal representation's spellings
 * (`character.materialTheme`, `character.formPacks`); a Loam 1 document says
 * `materials` and `packs`. The lowering accepts both, but the model is shown
 * only Loam 1.
 */
export function loamIntent(intent: SemanticIntent): Record<string, unknown> {
  const out: Record<string, unknown> = { ...intent };
  const character = (intent as { character?: Record<string, unknown> }).character;
  if (character !== undefined && character !== null && typeof character === "object") {
    const c: Record<string, unknown> = { ...character };
    if (c["materialTheme"] !== undefined) {
      c["materials"] = c["materialTheme"];
      delete c["materialTheme"];
    }
    if (c["formPacks"] !== undefined) {
      c["packs"] = c["formPacks"];
      delete c["formPacks"];
    }
    out["character"] = c;
  }
  return out;
}

/** Render a classification for a human to look at before the expensive call. */
export function formatClassification(c: IntentClassification): string {
  if (c.failed) {
    return `intent     (classification failed after ${c.attempts} attempt(s); authoring without it)`;
  }
  return [`intent     ${JSON.stringify(c.intent)}`, `           ${c.attempts} attempt(s), ${c.usage.totalTokens} tokens`].join("\n");
}

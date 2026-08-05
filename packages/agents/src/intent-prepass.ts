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
  TREE_SHAPES,
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
 * The five material theme ids the structure grammar ships.
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
 * What a prompt has to say for each urban form, one line per id.
 *
 * Keyed off `DISTRICT_FABRICS` rather than hand-listed, so a form added to the
 * vocabulary without a line here is a missing key at build time rather than a
 * form the classifier can never choose. This is §6.3's table: **`era` on its own
 * deliberately does not pick a form** — a mapping from era to form would move
 * every intent-carrying world that already has an `era`, so the guess lives here
 * in the pre-pass, where a human can read the answer before the expensive call.
 */
const URBAN_FORM_HINTS: Readonly<Record<(typeof DISTRICT_FABRICS)[number], string>> = {
  canal: 'canal town, Venice, Amsterdam, "streets of water", a quarter built on a lagoon',
  terraced: 'hill town, cliffside, Cinque Terre, "a town on a mountainside", stepped streets',
  radial: 'ring town, baroque capital, star fort, "everything faces the palace or the cathedral"',
  linear: 'ribbon village, roadside village, valley village, "strung along the road"',
  grown: 'medieval, an old quarter, "grew over centuries", "no two streets parallel", winding lanes',
  grid: "planned, colonial, gridiron, a modern downtown, a company town",
  organic: "(legacy — write grown instead)",
};

/** The hint table as prompt lines, in vocabulary order. */
const URBAN_FORM_LINES = DISTRICT_FABRICS.map(
  (id) => `    ${id.padEnd(Math.max(...DISTRICT_FABRICS.map((f) => f.length)))}  <- ${URBAN_FORM_HINTS[id]}`,
).join("\n");

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
               "humidity": -1..1, "snow": one of [${list(SNOW_POLICIES)}] }
  "character": {
    "label": string,             // free text, e.g. "pirate haven"
    "materialTheme": one of the five ids below,
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

materialTheme: exactly these ${MATERIAL_THEME_IDS.length} ids, and no others exist:
    ${list(MATERIAL_THEME_IDS)}

flora: exactly these ${TREE_SHAPES.length} tree shapes:
    ${list(TREE_SHAPES)}

archetypes: single-word building ids, e.g. ${list(EXAMPLE_ARCHETYPE_IDS)}.
props: single-word object ids, e.g. ${list(EXAMPLE_PROP_IDS)}.

urbanForm: exactly these ${DISTRICT_FABRICS.length} ids. This is the single field that decides whether
two towns look like different places, so read the prompt for it deliberately —
but write it ONLY when the prompt actually says something about the shape of the
place. An omitted urbanForm means every quarter keeps the form it would have
had, which is always safe; a guessed one restyles the whole settlement.

${URBAN_FORM_LINES}

  Notes on three of them:
  - "terraced" needs a genuinely steep site. Write it for a town that is ON a
    mountainside or a cliff, not for one that merely has hills nearby — on
    gentle ground it falls back and warns.
  - "grown" is the medieval default. "organic" is a legacy value that means
    much the same thing but flatter; prefer "grown".
  - "grid" is worth writing explicitly for a planned or colonial town, because
    it says the plan was deliberate rather than a default.

ground: exactly these ${DISTRICT_GROUND_POLICIES.length} ids. It is ORTHOGONAL to urbanForm — any form can
have any ground — so write it when the prompt says something about levels, not
because you already wrote "terraced".

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

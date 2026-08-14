/**
 * Grounding the intent layer's free strings against the real registries.
 *
 * `SemanticIntent` is written by a language model, so its string-valued fields
 * — `character.materialTheme`, `character.formPacks`, and the `prefer` /
 * `forbid` lists for archetypes, props and flora — arrive as *words*, not as
 * ids. Three things can be true of such a word:
 *
 * 1. it **is** a registered id (`"cottage"`, `"fountain"`, `"oak_round"`);
 * 2. it is a near miss a small alias table can carry (`"quartz"`,
 *    `"white stone"` → the `white_quartz` theme, `"adobe"` → `sun_clay`);
 * 3. it is prose (`"rainbow-hued crystal formations"`).
 *
 * Case 3 used to be silent — the compiler dropped it and the world came out
 * generic, which is exactly the defect this module exists to end. Every
 * ungrounded word now draws a warning naming the legal values (and, where the
 * spelling is close, the nearest ones), so the authoring loop can see what it
 * missed. Nothing here is ever fatal: an intent is a *wish*, and a wish the
 * compiler cannot grant should cost a world a warning, not a compile.
 *
 * This file lives beside the structure passes, not inside `intent/`, for the
 * same reason the fan-out rows do — fan-out law 1 says the intent package never
 * imports a subsystem, and the registries are subsystems.
 */

import {
  ALL_MATERIAL_THEMES,
  PROP_NAMES,
  STRUCTURE_CATALOG,
  formPackById,
  formPackIds,
  isPropName,
  structureById,
} from "@terrainist/stdlib";
import {
  COURTYARD_SHARE_MAX,
  COURTYARD_SHARE_MIN,
  DISTRICT_FABRICS,
  DISTRICT_GROUND_POLICIES,
  eraClassOf,
  warning,
  type DistrictFabric,
  type LoamDiagnostic,
} from "@terrainist/spec";

import type { IntentResolution, ResolvedIntent } from "../intent/index.js";
import { FLORA_KEYWORDS, FLORA_KIND_WORDS, isFloraWord } from "../terrain/flora-intent.js";
import { installUrbanForms, urbanForm, urbanForms } from "../layout/forms/index.js";

/* -------------------------------------------------------------------------- */
/* material themes                                                             */
/* -------------------------------------------------------------------------- */

/** Every material theme an author may name. */
export function materialThemeIds(): readonly string[] {
  return ALL_MATERIAL_THEMES.map((t) => t.id);
}

/**
 * Words that mean a registered theme without spelling it.
 *
 * Deliberately small and hand-written. An alias is a claim that two words name
 * the *same* palette, which is a design judgement — a fuzzy string distance
 * would happily map "boreal" onto "brick" and call it a synonym.
 */
export const THEME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  quartz: "white_quartz",
  white: "white_quartz",
  white_stone: "white_quartz",
  whitestone: "white_quartz",
  pale_stone: "white_quartz",
  marble: "white_quartz",
  calcite: "white_quartz",
  crystal: "white_quartz",
  ivory: "white_quartz",
  concrete: "modern_city",
  glass: "modern_city",
  steel: "modern_city",
  modern: "modern_city",
  futuristic: "modern_city",
  timber: "temperate_timber",
  wood: "temperate_timber",
  oak: "temperate_timber",
  half_timbered: "temperate_timber",
  cottage: "temperate_timber",
  pine: "boreal_pine",
  spruce: "boreal_pine",
  boreal: "boreal_pine",
  dark_wood: "boreal_pine",
  weathered: "boreal_pine",
  weathered_timber: "boreal_pine",
  weathered_pirate: "boreal_pine",
  driftwood: "boreal_pine",
  tarred_wood: "boreal_pine",
  birch: "birchwood_downs",
  pale_timber: "birchwood_downs",
  downs: "birchwood_downs",
  // The ancient Mediterranean and the desert. Words a model reaches for when
  // it means sandstone-and-plaster antiquity — and note what is deliberately
  // *not* here: "white" and "marble" still reach `white_quartz`, because a
  // marble temple is the prestige palette and a sun-baked town is not.
  sandstone: "sun_clay",
  sand_stone: "sun_clay",
  adobe: "sun_clay",
  mud_brick: "sun_clay",
  mudbrick: "sun_clay",
  clay: "sun_clay",
  terracotta: "sun_clay",
  plaster: "sun_clay",
  stucco: "sun_clay",
  limewash: "sun_clay",
  mediterranean: "sun_clay",
  aegean: "sun_clay",
  greek: "sun_clay",
  roman: "sun_clay",
  classical: "sun_clay",
  antiquity: "sun_clay",
  desert: "sun_clay",
  oasis: "sun_clay",
  sun_baked: "sun_clay",
  sunbaked: "sun_clay",
  // The hive. Words a model reaches for when it means a palette that was
  // *grown* rather than quarried — and note what is deliberately *not* here:
  // "futuristic", "steel" and "sci_fi"-adjacent words still reach
  // `modern_city`, because the human half of an invasion prompt (the
  // barricades, the field lab, the hideout) is concrete and glass. This table
  // is only for the half that came out of the ground.
  xeno: "xeno_resin",
  alien: "xeno_resin",
  hive: "xeno_resin",
  hive_flesh: "xeno_resin",
  chitin: "xeno_resin",
  chitinous: "xeno_resin",
  carapace: "xeno_resin",
  resin: "xeno_resin",
  resinous: "xeno_resin",
  organic: "xeno_resin",
  biological: "xeno_resin",
  biomechanical: "xeno_resin",
  fleshy: "xeno_resin",
  insectoid: "xeno_resin",
  infested: "xeno_resin",
  sculk: "xeno_resin",
  spore: "xeno_resin",
  fungal: "xeno_resin",
  nether_growth: "xeno_resin",
});

/** Normalise a free word to the alias table's key shape. */
function key(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** What {@link resolveMaterialTheme} decided, and why. */
export interface ThemeResolution {
  /** A registered theme id, or `undefined` when the word grounded nowhere. */
  readonly id?: string;
  /** True when the word was already an id (no aliasing needed). */
  readonly exact: boolean;
  readonly diagnostic?: LoamDiagnostic;
}

/**
 * Ground `character.materialTheme` against the real registry.
 *
 * Exact match wins; then the alias table; otherwise a warning naming every
 * legal value — never a silent fallback, and never a guess.
 */
export function resolveMaterialTheme(named: string, nodePath: string): ThemeResolution {
  const ids = materialThemeIds();
  if (ids.includes(named)) return { id: named, exact: true };
  const k = key(named);
  if (ids.includes(k)) return { id: k, exact: false };
  const alias = THEME_ALIASES[k];
  if (alias !== undefined) return { id: alias, exact: false };
  return {
    exact: false,
    diagnostic: warning(
      "INTENT_THEME_UNKNOWN",
      nodePath,
      `intent.character.materialTheme "${named}" is not a registered material theme; the settlement keeps its seeded draw`,
      `use one of: ${ids.join(", ")} — or say it in words the alias table carries, e.g. "quartz", "timber", "birch", "concrete"`,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* prefer / forbid lists                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Legal flora words (FLORA-GRAMMAR-v0 §6.1).
 *
 * The union of three closed sets — every species id of the catalog, every shape
 * program name, and the nine character keywords — owned by the flora grammar
 * and re-exported here so the grounding pass has one vocabulary to check
 * against. It used to be the four tree shapes; widening it is additive, so
 * every word that grounded before still grounds.
 */
export const FLORA_KINDS: readonly string[] = FLORA_KIND_WORDS;

/** Every archetype id the structure catalog implements. */
export function archetypeIds(): readonly string[] {
  return STRUCTURE_CATALOG.map((e) => e.id);
}

/** True for a word that names something the archetype catalog builds. */
export function isArchetypeId(word: string): boolean {
  return structureById(word) !== undefined || structureById(key(word)) !== undefined;
}

/** Grounded entries of a prefer/forbid list, plus the words that grounded nowhere. */
export interface ListGrounding {
  readonly known: readonly string[];
  readonly unknown: readonly string[];
}

/** Split a prefer/forbid list into what the registry carries and what it does not. */
export function groundList(
  words: readonly string[] | undefined,
  isKnown: (w: string) => boolean,
): ListGrounding {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const word of words ?? []) {
    if (isKnown(word)) known.push(word);
    else if (isKnown(key(word))) known.push(key(word));
    else unknown.push(word);
  }
  return { known, unknown };
}

/**
 * Names in the vocabulary that share a word with the ungrounded entry.
 *
 * Token overlap, not edit distance: "moored pirate ships" should suggest the
 * ships, and no character-level metric gets there.
 */
export function closeMatches(word: string, vocabulary: readonly string[], limit = 6): string[] {
  const tokens = key(word).split("_").filter((t) => t.length > 2);
  if (tokens.length === 0) return [];
  const hits: string[] = [];
  for (const candidate of vocabulary) {
    if (tokens.some((t) => candidate.includes(t) || t.includes(candidate))) hits.push(candidate);
    if (hits.length >= limit) break;
  }
  return hits;
}

function listWarning(
  name:
    | "INTENT_ARCHETYPE_UNKNOWN"
    | "INTENT_PROP_UNKNOWN"
    | "INTENT_FLORA_UNKNOWN"
    | "INTENT_FORM_PACK_UNKNOWN",
  nodePath: string,
  field: string,
  unknown: readonly string[],
  vocabulary: readonly string[],
  legalHint: string,
): LoamDiagnostic {
  const suggestions = unknown
    .map((w) => {
      const near = closeMatches(w, vocabulary);
      return near.length === 0 ? undefined : `"${w}" → ${near.join(", ")}`;
    })
    .filter((s): s is string => s !== undefined);
  return warning(
    name,
    nodePath,
    `intent.character.${field} names ${unknown.length} value${unknown.length === 1 ? "" : "s"} no registry carries: ${unknown.map((w) => `"${w}"`).join(", ")} — ${unknown.length === 1 ? "it is" : "they are"} ignored`,
    suggestions.length > 0
      ? `did you mean: ${suggestions.join("; ")}`
      : legalHint,
  );
}

/**
 * Check every scope's `character` vocabulary and report what grounded nowhere.
 *
 * **One aggregated warning per list per scope**, never one per word: a
 * seven-word prose list is one authoring mistake, and seven diagnostics for it
 * would drown the feedback set the authoring loop reads.
 */
export function checkIntentVocabulary(resolution: IntentResolution): readonly LoamDiagnostic[] {
  const out: LoamDiagnostic[] = [];
  // An intent inherits down the whole tree, so a list written once at the
  // world scope is *resolved* at every node under it. Reporting each scope
  // would turn one authoring mistake into thirty diagnostics, so a finding is
  // reported at the shallowest path that carries it and nowhere else — the map
  // is in insertion order, which is the root first and then depth-first.
  const reported = new Set<string>();
  for (const scope of resolution.byPath.values()) {
    if (!scope.declared || scope.nodePath === "") continue;
    for (const d of checkScopeVocabulary(scope)) {
      const key = `${d.name}|${d.message}`;
      if (reported.has(key)) continue;
      reported.add(key);
      out.push(d);
    }
  }
  return out;
}

/** The vocabulary check for one resolved scope. Exported for the tests. */
export function checkScopeVocabulary(scope: ResolvedIntent): readonly LoamDiagnostic[] {
  const out: LoamDiagnostic[] = [];
  const character = scope.intent.character;
  if (character === undefined) return out;
  const path = scope.nodePath;

  if (character.materialTheme !== undefined) {
    const resolved = resolveMaterialTheme(character.materialTheme, path);
    if (resolved.diagnostic !== undefined) out.push(resolved.diagnostic);
  }

  const archetypes = [...(character.archetypes?.prefer ?? []), ...(character.archetypes?.forbid ?? [])];
  const badArchetypes = groundList(archetypes, isArchetypeId).unknown;
  if (badArchetypes.length > 0) {
    out.push(
      listWarning(
        "INTENT_ARCHETYPE_UNKNOWN",
        path,
        "archetypes",
        badArchetypes,
        archetypeIds(),
        `use catalog ids — e.g. ${archetypeIds().slice(0, 8).join(", ")} (see docs/kits/settlement-author.md §9d)`,
      ),
    );
  }

  const props = [...(character.props?.prefer ?? []), ...(character.props?.forbid ?? [])];
  const badProps = groundList(props, isPropName).unknown;
  if (badProps.length > 0) {
    out.push(
      listWarning(
        "INTENT_PROP_UNKNOWN",
        path,
        "props",
        badProps,
        PROP_NAMES as readonly string[],
        `use prop catalog ids — e.g. ${(PROP_NAMES as readonly string[]).slice(0, 8).join(", ")} (see docs/kits/settlement-author.md §9d)`,
      ),
    );
  }

  // The urban form is grounded against the **live registry**, not against a
  // list: a form the vocabulary names but no module draws would be a word the
  // author could write and nothing could honour, and the registry is the only
  // thing that knows. Unknown is a warning naming the legal ids, never a silent
  // drop — an ungrounded form is invisible in the finished world otherwise.
  if (character.urbanForm !== undefined && !isUrbanFormId(character.urbanForm)) {
    out.push(
      warning(
        "INTENT_FORM_UNKNOWN",
        path,
        `intent.character.urbanForm names "${character.urbanForm}", which is not an urban form — it is ignored, and each quarter keeps the form it would have had`,
        `write one of: ${urbanFormIds().join(", ")}`,
      ),
    );
  }

  // The ground policy is a closed vocabulary in the spec, so it is grounded
  // against `DISTRICT_GROUND_POLICIES` itself rather than against a registry —
  // there is no module list to disagree with. Unknown is a warning naming the
  // legal values; the quarter keeps the ground it would have had.
  if (
    character.ground !== undefined &&
    !(DISTRICT_GROUND_POLICIES as readonly string[]).includes(character.ground)
  ) {
    out.push(
      warning(
        "INTENT_GROUND_UNKNOWN",
        path,
        `intent.character.ground names "${character.ground}", which is not a ground policy — it is ignored, and each quarter keeps the ground it would have had`,
        `write one of: ${DISTRICT_GROUND_POLICIES.join(", ")}`,
      ),
    );
  }

  // A share is a number, so "ungrounded" means "outside the range". It is
  // warned and *not* clamped: clamping honours half a request the author can
  // then not see was refused, which is the silent-decline defect this module
  // exists to end.
  const share = character.courtyards;
  if (
    share !== undefined &&
    (!Number.isFinite(share) || share < COURTYARD_SHARE_MIN || share > COURTYARD_SHARE_MAX)
  ) {
    out.push(
      warning(
        "INTENT_GROUND_UNKNOWN",
        path,
        `intent.character.courtyards is ${share}, which is outside ${COURTYARD_SHARE_MIN}..${COURTYARD_SHARE_MAX} — it is ignored, and each quarter keeps the courtyard share it would have had`,
        `write a share between ${COURTYARD_SHARE_MIN} and ${COURTYARD_SHARE_MAX}, e.g. 0.7 — the fraction of the blocks that *can* close that actually do`,
      ),
    );
  }

  const flora = [...(character.flora?.prefer ?? []), ...(character.flora?.forbid ?? [])];
  // Alias-aware: `mossy`, `mushroom` and `bioluminescent` are near misses the
  // hand-written table carries, and a word the table resolves is grounded.
  const badFlora = groundList(flora, isFloraWord).unknown;
  if (badFlora.length > 0) {
    out.push(
      listWarning(
        "INTENT_FLORA_UNKNOWN",
        path,
        "flora",
        badFlora,
        FLORA_KINDS,
        `flora words are species ids, shape programs, or one of: ${FLORA_KEYWORDS.join(", ")}`,
      ),
    );
  }

  out.push(...checkFormPacks(character.formPacks, scope.intent.era, path));

  return out;
}

/* -------------------------------------------------------------------------- */
/* form packs                                                                  */
/* -------------------------------------------------------------------------- */

/** True for a word the `FORM_PACKS` registry carries. */
export function isFormPackId(word: string): boolean {
  return formPackById(word) !== undefined;
}

/**
 * Ground `character.formPacks`, and check each grounded pack's era affinity.
 *
 * Two diagnostics, and neither is ever fatal:
 *
 * - **`LOAM-W516`**, one aggregated warning per scope for the words no pack
 *   carries, naming the legal packs and the near matches. A pack word is a
 *   *wish*, and the failure mode this ends is the silent one — a document that
 *   asked for antiquity and got a medieval town with nothing said about it.
 * - **`LOAM-W517`**, affinity. A pack whose `eras` do not include the scope's
 *   resolved era class is *reported*, naming both, and then built anyway. This
 *   can never be an error: "a modern Hellenist city" is the legal case, and a
 *   gate here would refuse the exact prompt the packs exist for. Aggregated
 *   into one diagnostic per scope for the same reason W516 is.
 *
 * A pack every one of whose members is still `not_started` is **not** a
 * finding. It grounds, it warns about nothing, and it contributes nothing to
 * any mix until its generators land — which is the whole shape of a registry
 * that ships ahead of its content.
 */
export function checkFormPacks(
  packs: readonly string[] | undefined,
  era: string | undefined,
  path: string,
): readonly LoamDiagnostic[] {
  if (packs === undefined || packs.length === 0) return [];
  const out: LoamDiagnostic[] = [];

  const grounding = groundList(packs, isFormPackId);
  if (grounding.unknown.length > 0) {
    out.push(
      listWarning(
        "INTENT_FORM_PACK_UNKNOWN",
        path,
        "formPacks",
        grounding.unknown,
        formPackIds(),
        `name a form pack: ${formPackIds().join(", ")} (see docs/kits/settlement-author.md §9d)`,
      ),
    );
  }

  // Affinity is advice. It is only checkable when the scope resolved an era at
  // all — an absent or unrecognised era is a scope with no opinion about the
  // period, and advice against no opinion is noise.
  const eraClass = eraClassOf(era);
  if (eraClass === undefined) return out;
  const mismatched = grounding.known
    .map((word) => formPackById(word))
    .filter((pack): pack is NonNullable<typeof pack> => pack !== undefined)
    .filter((pack) => !pack.eras.includes(eraClass));
  if (mismatched.length > 0) {
    out.push(
      warning(
        "INTENT_FORM_PACK_ERA",
        path,
        `intent.era resolves to "${eraClass}", which is outside the affinity of ${mismatched.length === 1 ? "the form pack" : "the form packs"} ${mismatched.map((p) => `"${p.id}" (${p.eras.join(", ")})`).join(", ")} — the pack is used as written`,
        "affinity is advice, never a gate: an ancient form vocabulary in a modern city is a legal and deliberate combination. Change the era or the pack only if the pairing was not what you meant",
      ),
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* urban forms                                                                 */
/* -------------------------------------------------------------------------- */

/** Every registered urban form id, sorted — the legal values, from the registry. */
export function urbanFormIds(): readonly string[] {
  installUrbanForms();
  return urbanForms().map((f) => f.id);
}

/**
 * True when the word is an id the form registry can actually draw.
 *
 * **Including an alias** (`docs/SITE-PLAN-v0.md` §7.1). `terraced` is a legal
 * spelling of `hillside`, so an intent that names it is honoured — the row
 * resolves it and the registry draws a hill town. Warning about it here would
 * refuse, in the intent surface, a word the document surface accepts. The *fix*
 * line still lists {@link urbanFormIds} — the forms themselves — so an author
 * who wrote something genuinely unknown is pointed at what to write, and the
 * retired spelling is never taught back to anyone.
 */
export function isUrbanFormId(word: string): boolean {
  installUrbanForms();
  if (!(DISTRICT_FABRICS as readonly string[]).includes(word)) return false;
  return urbanForm(word as DistrictFabric) !== undefined;
}

/**
 * `character.flora` — the reserved row comes alive (FLORA-GRAMMAR-v0 §6, WP-C).
 *
 * The machinery around it does not change: `character.flora` is already a
 * `SelectionBias` (`{prefer, forbid}`), already grounded against
 * {@link FLORA_KIND_WORDS} with `INTENT_FLORA_UNKNOWN` (`LOAM-W486`) naming the
 * legal values and the near misses. What changes is the *vocabulary* it grounds
 * against and the fan-out that reads the result.
 *
 * Two laws, both structural:
 *
 * - **Fan-out law 1** — the row lives beside the subsystem it drives (the
 *   scatter), registered through the one seam file. The intent package still
 *   imports nothing.
 * - **Fan-out law 2** — the row is *total*. With no `character.flora` it
 *   returns `ctx.today`, which is {@link NO_FLORA_BIAS}, and every consumer
 *   short-circuits on {@link isNeutralFlora}. A document that says nothing
 *   about flora compiles byte-identically, which is what the intent
 *   byte-identity suite already asserts for the layer as a whole.
 *
 * **The fantasy gate** is the clause that makes §2's promise real: a
 * `fantasy: true` species enters a composition only when `prefer` names it, or
 * names a keyword whose table admits it. No climate row, no program keyword and
 * no near-miss alias can reach one — a "medieval fishing village" prompt cannot
 * sprout glow trees by accident. `forbid` needs no gate, because forbidding
 * something unreachable is a no-op.
 */

import { FLORA_SPECIES_IDS } from "@terrainist/spec";

import { registerFanOut } from "../intent/fanout.js";

import { FLORA_SPECIES, SHAPE_PROGRAMS } from "./flora/index.js";

/** Row ids owned by the flora grammar. */
export const FLORA_ROWS = {
  /** The composition bias the scatter applies to every stratum. */
  composition: "flora.composition",
} as const;

/**
 * What the row answers with: a bias over the composition, never a composition.
 *
 * Every field is neutral in {@link NO_FLORA_BIAS}, and every consumer applies
 * the bias only when {@link isNeutralFlora} is false — so the row's identity is
 * the *absence* of code on the hot path rather than a multiplication by one.
 */
export interface FloraBias {
  /** Species id → weight multiplier, applied wherever the species is legal. */
  readonly weights: Readonly<Record<string, number>>;
  /** Species admitted into their own stratum even if the table never named them. */
  readonly admit: readonly string[];
  /** Species removed from every stratum. */
  readonly forbid: readonly string[];
  /** Switch the emergent stratum on for a node that declared no `strata`. */
  readonly emergent: boolean;
  /** Switch the understory on, and by what multiple of its default density. */
  readonly understory: number;
  /** Multiplier on the canopy's own density. */
  readonly canopyDensity: number;
  /** Multiplier on `undergrowth.deadwood`. */
  readonly deadwood: number;
  /** Which floor table the undergrowth pass dresses from (§5.6). */
  readonly floor?: "fungal" | "glow";
  /** Added to an `ancient`'s drawn `age`: more gnarl, more dead limbs. */
  readonly ageShift: number;
}

/** No opinion: the value the compile produces with no intent layer at all. */
export const NO_FLORA_BIAS: FloraBias = Object.freeze({
  weights: Object.freeze({}),
  admit: Object.freeze([]),
  forbid: Object.freeze([]),
  emergent: false,
  understory: 0,
  canopyDensity: 1,
  deadwood: 1,
  ageShift: 0,
});

/** True when the bias would change nothing, which is the common case. */
export function isNeutralFlora(bias: FloraBias | undefined): boolean {
  return (
    bias === undefined ||
    (Object.keys(bias.weights).length === 0 &&
      bias.admit.length === 0 &&
      bias.forbid.length === 0 &&
      !bias.emergent &&
      bias.understory === 0 &&
      bias.canopyDensity === 1 &&
      bias.deadwood === 1 &&
      bias.floor === undefined &&
      bias.ageShift === 0)
  );
}

/** The nine character keywords of §6.1, each a named bias. */
export const FLORA_KEYWORDS = [
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

/** One of {@link FLORA_KEYWORDS}. */
export type FloraKeyword = (typeof FLORA_KEYWORDS)[number];

/**
 * Near misses, hand-written.
 *
 * Hand-written because an alias is a claim that two words name the same thing,
 * and a string metric will happily decide `crystal` and `coastal` are synonyms
 * — the same reasoning `THEME_ALIASES` is built on.
 */
export const FLORA_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  mossy: "old_growth",
  primeval: "old_growth",
  primaeval: "old_growth",
  virgin: "old_growth",
  oldgrowth: "old_growth",
  old_growth_forest: "old_growth",
  mushroom: "fungal",
  mushrooms: "fungal",
  fungus: "fungal",
  fungi: "fungal",
  mycelial: "fungal",
  glowing: "glow",
  bioluminescent: "glow",
  luminous: "glow",
  gnarled: "ancient",
  veteran: "ancient",
  crystalline: "crystal",
  amethyst: "crystal",
});

/** Every program name the registry knows — a whole family at once. */
export const FLORA_PROGRAM_WORDS: readonly string[] = Object.freeze(Object.keys(SHAPE_PROGRAMS));

/**
 * The legal flora vocabulary: species ids, program names, character keywords.
 *
 * A superset of the four tree shapes it used to be, so every word that grounds
 * today still grounds — widening an accepted vocabulary is additive.
 */
export const FLORA_KIND_WORDS: readonly string[] = Object.freeze([
  ...FLORA_SPECIES_IDS,
  ...FLORA_PROGRAM_WORDS,
  ...FLORA_KEYWORDS,
]);

/** True for a word the vocabulary carries, alias table included. */
export function isFloraWord(word: string): boolean {
  return FLORA_KIND_WORDS.includes(word) || FLORA_ALIASES[word] !== undefined;
}

/** Resolve a word to its canonical form, or `undefined` when it grounds nowhere. */
export function resolveFloraWord(word: string): string | undefined {
  if (FLORA_KIND_WORDS.includes(word)) return word;
  return FLORA_ALIASES[word];
}

/** Mutable accumulator; the frozen {@link FloraBias} is built from it. */
interface Draft {
  weights: Record<string, number>;
  admit: Set<string>;
  forbid: Set<string>;
  emergent: boolean;
  understory: number;
  canopyDensity: number;
  deadwood: number;
  floor?: "fungal" | "glow";
  ageShift: number;
}

function multiply(draft: Draft, id: string, factor: number): void {
  draft.weights[id] = (draft.weights[id] ?? 1) * factor;
}

/** Every catalog species that runs a given program. */
function speciesOfProgram(program: string, includeFantasy: boolean): readonly string[] {
  return Object.values(FLORA_SPECIES)
    .filter((def) => def.program === program && (includeFantasy || def.fantasy !== true))
    .map((def) => def.id);
}

/** Species whose program is one of the two "big old tree" programs. */
const OLD_GROWTH_PROGRAMS: readonly string[] = ["ancient", "giant"];

function applyKeyword(draft: Draft, keyword: string): void {
  switch (keyword) {
    case "old_growth":
      draft.emergent = true;
      draft.understory = Math.max(draft.understory, 1);
      for (const program of OLD_GROWTH_PROGRAMS) {
        for (const id of speciesOfProgram(program, false)) multiply(draft, id, 3);
      }
      break;
    case "ancient":
      for (const id of speciesOfProgram("ancient", false)) multiply(draft, id, 4);
      // The `age` envelope shifted up: more gnarl, more dead limbs, a thinner
      // crown — which is what the word means in the geometry.
      draft.ageShift = Math.max(draft.ageShift, 0.15);
      break;
    case "emergent":
      draft.emergent = true;
      break;
    case "understory":
      draft.understory = Math.max(draft.understory, 1.5);
      break;
    case "deadwood":
      draft.deadwood *= 2;
      draft.ageShift = Math.max(draft.ageShift, 0.15);
      break;
    case "sparse":
      // Fewer trees, the same landmarks: the emergent budget is untouched on
      // purpose, because a sparse wood with no anchor is a field.
      draft.canopyDensity *= 0.5;
      break;
    case "fungal":
      draft.floor = "fungal";
      // Naturalistic, but not what a temperate wood is made of — so the two
      // mushrooms are *admitted* rather than reachable, exactly as §4.1 says.
      draft.admit.add("mushroom_giant_red");
      draft.admit.add("mushroom_shelf_brown");
      multiply(draft, "mushroom_giant_red", 3);
      multiply(draft, "mushroom_shelf_brown", 3);
      break;
    case "glow":
      // The fantasy gate, opened by name.
      draft.floor = "glow";
      draft.admit.add("glowcap");
      multiply(draft, "glowcap", 3);
      break;
    case "crystal":
      draft.admit.add("crystal_spire");
      multiply(draft, "crystal_spire", 3);
      break;
    default:
      break;
  }
}

/**
 * Build the bias from one `character.flora` selection.
 *
 * Exported for the tests, which are the only caller besides the row itself: the
 * fantasy gate and the keyword table are properties worth asserting directly
 * rather than through a compiled world.
 */
export function floraBiasFrom(
  prefer: readonly string[] | undefined,
  forbid: readonly string[] | undefined,
): FloraBias {
  const draft: Draft = {
    weights: {},
    admit: new Set<string>(),
    forbid: new Set<string>(),
    emergent: false,
    understory: 0,
    canopyDensity: 1,
    deadwood: 1,
    ageShift: 0,
  };
  for (const raw of prefer ?? []) {
    const word = resolveFloraWord(raw);
    if (word === undefined) continue;
    // **Keywords are checked first**, and two words need it: `ancient` and
    // `fungal` each appear in §6.1 twice — once as a shape program and once as
    // a character keyword. The keyword is the richer reading of both (`ancient`
    // is the program's weight *and* an `age` shift; `fungal` is the program's
    // species *and* the mycelium floor), and it strictly contains what the
    // program word would have done, so nothing is lost by preferring it.
    if ((FLORA_KEYWORDS as readonly string[]).includes(word)) {
      applyKeyword(draft, word);
      continue;
    }
    if (FLORA_SPECIES[word] !== undefined) {
      // An author naming a species outranks the climate table — the same
      // precedence `character.materialTheme` has over the era's preference —
      // and naming it is exactly what the fantasy gate asks for.
      draft.admit.add(word);
      multiply(draft, word, 3);
      continue;
    }
    if (SHAPE_PROGRAMS[word as keyof typeof SHAPE_PROGRAMS] !== undefined) {
      // A whole family at once, **fantasy excluded**: a program word is not a
      // name, and §2 says only a name (or a fantasy keyword) reaches a fantasy
      // species.
      for (const id of speciesOfProgram(word, false)) {
        draft.admit.add(id);
        multiply(draft, id, 3);
      }
      continue;
    }
  }
  for (const raw of forbid ?? []) {
    const word = resolveFloraWord(raw);
    if (word === undefined) continue;
    if (FLORA_SPECIES[word] !== undefined) {
      draft.forbid.add(word);
      continue;
    }
    if (SHAPE_PROGRAMS[word as keyof typeof SHAPE_PROGRAMS] !== undefined) {
      for (const id of speciesOfProgram(word, true)) draft.forbid.add(id);
    }
    // A forbidden *keyword* is deliberately inert: "not old growth" is not a
    // composition, and inventing one from a negation is how a dial starts
    // meaning something the author cannot predict.
  }
  // A forbidden species is forbidden however it was admitted.
  for (const id of draft.forbid) {
    draft.admit.delete(id);
    delete draft.weights[id];
  }
  return Object.freeze({
    weights: Object.freeze({ ...draft.weights }),
    admit: Object.freeze([...draft.admit].sort()),
    forbid: Object.freeze([...draft.forbid].sort()),
    emergent: draft.emergent,
    understory: draft.understory,
    canopyDensity: draft.canopyDensity,
    deadwood: draft.deadwood,
    ...(draft.floor === undefined ? {} : { floor: draft.floor }),
    ageShift: draft.ageShift,
  });
}

/** Register the flora grammar's fan-out row. */
export function registerFloraFanOut(): void {
  registerFanOut<FloraBias>({
    id: FLORA_ROWS.composition,
    reads: ["character"],
    status: "today",
    drives:
      "species weights, stratum admission and the floor table of scatter.forest@0 (terrain/vegetation.ts, terrain/decorate.ts)",
    resolve(intent, ctx) {
      const flora = intent.intent.character?.flora;
      if (flora === undefined) return ctx.today;
      const bias = floraBiasFrom(flora.prefer, flora.forbid);
      // Law 2 again, one level down: a `character.flora` whose every word
      // grounded nowhere is the same as no `character.flora` at all.
      return isNeutralFlora(bias) ? ctx.today : bias;
    },
  });
}

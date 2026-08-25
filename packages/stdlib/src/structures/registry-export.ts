/**
 * The **candidate menu** — a prompt-conditioned, read-only view over the
 * structure registries, assembled for one authoring run.
 *
 * ## Why this exists
 *
 * The model-behavior audit (`docs/audits/model-behavior-2026-08-24.md`) read 50
 * authored documents and found the same thing three ways: catalog reach is
 * 147/722 entries, six of seven declared form packs have **zero** member reach,
 * `acropolis_terrace` has been used exactly never across ten Troy rolls — and
 * yet there is **one** hallucinated id in the whole corpus. The model does not
 * guess ids. It cannot see them. A 722-entry registry mentioned once in prose
 * is not retrievable; the kit's fenced worked examples are, and 84% of documents
 * use archetype vocabulary contained entirely in the kit's own text.
 *
 * **Reach is retrieval, not capability.** So this module does the retrieval: it
 * turns the classifier's `SemanticIntent` into ~60 ids the model is *shown*,
 * each with the sentence the catalog already wrote about it. Roughly 2k tokens
 * against a kit that costs ~70k — the cheapest line item in the run.
 *
 * ## What it is not
 *
 * Not a gate and not a vocabulary. Nothing here forbids an id that is off the
 * menu; the menu is advice in exactly the sense `FormPack.eras` is advice. It
 * is also **pure**: no clock, no RNG, no mutation, no I/O. The same request
 * produces the same bytes, which is what lets a run's injected context be
 * archived next to its document and compared.
 *
 * ## One tier, and the two that were cut
 *
 * The menu is **the packs the intent named, and nothing else** — every
 * implemented member of each, in the pack's own order, never rationed. A pack a
 * prompt named and the world then does not spend is the exact failure the audit
 * measured, so those ids are what the budget is for.
 *
 * Two other tiers were built, measured and removed. Both removals are results,
 * not opinions.
 *
 * - An **era-affine** tier (packs whose `eras` include the intent's resolved
 *   era class, round-robin) shipped in the first build and was cut by
 *   measurement (Kai, 2026-08-24). Across both candidate-menu measurements — 19
 *   menu-bearing authoring runs, four eras — it was shown **580 ids and adopted
 *   0**, against tier one's 198 shown and 49 adopted. It was ~75% of the menu's
 *   tokens and never once used. Worse than useless: `medieval` spans eleven
 *   culturally incompatible packs, so "a walled medieval city on a hill" was
 *   offered `torii`, `ger_round_tent`, `dzong_hall` and `machiya_shop_row`, and
 *   the model correctly ignored all sixty ids and wrote a European town. Gating
 *   it on the affinity `FORM_PACKS` already carries does not rescue it: those
 *   fields are advice for `LOAM-W517`, too coarse to separate cultures —
 *   `temperate_timber` is an affinity of the Japanese, Mongolian, Norse,
 *   swamp-witch, arcane and agrarian packs alike.
 * - An **everyday fabric** tier was prototyped and cut before shipping: the
 *   catalog's oldest entries — `cottage`, `church`, `inn`, `barn` — carry no
 *   `note`, so it rendered as bare names, and they are precisely the ids the kit
 *   already spells out in its worked examples.
 *
 * So a request that names no pack gets an **empty** menu, and an empty menu is
 * injected as nothing at all: the no-intent path and the flag's off-state are
 * the same path, which is one fewer behaviour to prove.
 *
 * ## Status
 *
 * `implemented` only, by default and on purpose. The catalog's 68 unbuilt
 * entries are honest intent, and showing the model an id no generator answers
 * is teaching it to hallucinate. {@link CandidateMenuRequest.statuses} is the
 * knob that opens them later; nothing else has to change when it does.
 */

import { eraClassOf, type EraClass, type SemanticIntent } from "@terrainist/spec";

import { STRUCTURE_CATALOG, type StructureEntry, type StructureStatus } from "./catalog.js";
import { FORM_PACKS } from "./form-packs.js";

/** Entries a menu carries before the budget stops it. */
export const DEFAULT_MENU_ENTRIES = 60;

/**
 * Characters of `note` kept per entry.
 *
 * The notes average 189 characters and run to 253; the whole menu is a token
 * budget, so the tail is trimmed at the first sentence or clause boundary
 * before this many characters. 110 keeps the sentence that says what the thing
 * *is* and drops the one that says how it is built.
 */
export const DEFAULT_MENU_BLURB_CHARS = 110;

/** The statuses a menu shows when the caller does not say. */
export const DEFAULT_MENU_STATUSES: readonly StructureStatus[] = Object.freeze(["implemented"]);

/** What to assemble a menu for. Every field is advice from the pre-pass. */
export interface CandidateMenuRequest {
  /**
   * The intent's open `era` string; resolved through `eraClassOf`.
   *
   * **Reported, never selective.** It names the era the chosen packs sit in, on
   * the menu's header line and in {@link CandidateMenu.eraClass} for a run's
   * record — it does not put anything on the menu. Era-affine selection was
   * measured and cut; see the file header.
   */
  readonly era?: string;
  /** Pack ids the classifier named. Unknown ids are ignored, never fatal. */
  readonly formPacks?: readonly string[];
  /** Hard cap on entries. Default {@link DEFAULT_MENU_ENTRIES}. */
  readonly maxEntries?: number;
  /** Blurb budget per entry. Default {@link DEFAULT_MENU_BLURB_CHARS}. */
  readonly blurbChars?: number;
  /**
   * Which catalog statuses may appear. Default {@link DEFAULT_MENU_STATUSES} —
   * implemented alone. This is the one argument that opens the unbuilt half of
   * the catalog to the model, and it is deliberately not the default.
   */
  readonly statuses?: readonly StructureStatus[];
}

/**
 * Why an entry is on the menu.
 *
 * One value, kept as a named type rather than dropped: it is written into every
 * entry and into the run records a measurement reads, and a second source would
 * have to earn its place the way the era tier failed to.
 */
export type CandidateSource = "pack";

/** One line of the menu, before it is rendered. */
export interface CandidateMenuEntry {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly kind: string;
  readonly status: StructureStatus;
  /** `XS`…`XL`, `LIN`, or `""` — read off the entry's `size_*` tag. */
  readonly size: string;
  /** The catalog's note, trimmed to the blurb budget. `""` when it has none. */
  readonly blurb: string;
  readonly source: CandidateSource;
  /** The pack that put it on the menu. */
  readonly pack: string;
}

/** An assembled menu. `text` is the only part the model ever sees. */
export interface CandidateMenu {
  readonly entries: readonly CandidateMenuEntry[];
  /** Just the ids, in menu order — the handle a measurement harness wants. */
  readonly ids: readonly string[];
  /** Pack ids the request named that the registry knows, in registry order. */
  readonly packs: readonly string[];
  /** The era class the request's `era` resolved to, when it resolved to one. */
  readonly eraClass?: EraClass;
  /** The rendered menu. **Empty string when there are no entries.** */
  readonly text: string;
  readonly chars: number;
  /** chars/4 — the usual rough count, for budgeting only. */
  readonly estimatedTokens: number;
}

/** Short kind labels; the column is four characters of prompt, not prose. */
const KIND_LABELS: Readonly<Record<string, string>> = Object.freeze({
  building: "bldg",
  prop: "prop",
  infrastructure: "infra",
  underground: "under",
});

/** `size_*` tag → the curator's size class (`docs/CATALOG-EXPANSION-v0.md`). */
const SIZE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  size_xs: "XS",
  size_s: "S",
  size_m: "M",
  size_l: "L",
  size_xl: "XL",
  size_lin: "LIN",
});

/** The entry's size class, or `""` — 280 of 654 implemented entries carry one. */
function sizeClassOf(entry: StructureEntry): string {
  for (const tag of entry.tags ?? []) {
    const label = SIZE_LABELS[tag];
    if (label !== undefined) return label;
  }
  return "";
}

/**
 * The note, trimmed to `max` characters at a boundary a reader would stop at.
 *
 * Sentence or clause first, then a word, then a hard cut with an ellipsis. The
 * half-length floor keeps a note whose first sentence is very long from being
 * cut to three words by an early colon.
 */
function blurbOf(entry: StructureEntry, max: number): string {
  const note = (entry.note ?? "").replace(/\s+/g, " ").trim();
  if (note.length <= max) return note;
  const head = note.slice(0, max + 1);
  const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf(": "), head.lastIndexOf("; "));
  // A clause boundary is a fine place to stop reading and a poor place to stop
  // writing: cutting at one leaves a dangling `:` promising a list that is not
  // there, so the punctuation itself becomes the ellipsis.
  if (stop > max / 2) {
    const kept = note.slice(0, stop + 1);
    return kept.endsWith(".") ? kept : `${kept.slice(0, -1)}…`;
  }
  const space = head.lastIndexOf(" ");
  return `${note.slice(0, space > 0 ? space : max)}…`;
}

/** One rendered line. Columns are padded so the model reads a table, not prose. */
function renderEntry(entry: CandidateMenuEntry): string {
  const head = `  ${entry.id.padEnd(24)} ${entry.kind.padEnd(5)} ${entry.size.padEnd(3)} ${entry.name}`;
  return entry.blurb === "" ? head : `${head} — ${entry.blurb}`;
}

/**
 * Assemble the candidate menu for one run.
 *
 * Deterministic and total: an unknown pack id, an unknown era and an empty
 * request are all answered with a menu rather than an error, because this sits
 * upstream of an expensive call that must not be stoppable by a classifier's
 * bad word.
 */
export function buildCandidateMenu(request: CandidateMenuRequest = {}): CandidateMenu {
  const maxEntries = Math.max(0, request.maxEntries ?? DEFAULT_MENU_ENTRIES);
  const blurbChars = Math.max(0, request.blurbChars ?? DEFAULT_MENU_BLURB_CHARS);
  const statuses = new Set<StructureStatus>(request.statuses ?? DEFAULT_MENU_STATUSES);
  const named = new Set(request.formPacks ?? []);
  const eraClass = eraClassOf(request.era);

  const byId = new Map(STRUCTURE_CATALOG.map((entry) => [entry.id, entry] as const));
  const showable = (id: string): StructureEntry | undefined => {
    const entry = byId.get(id);
    return entry !== undefined && statuses.has(entry.status) ? entry : undefined;
  };

  const entries: CandidateMenuEntry[] = [];
  const seen = new Set<string>();
  const take = (entry: StructureEntry, source: CandidateSource, pack: string): void => {
    if (seen.has(entry.id) || entries.length >= maxEntries) return;
    seen.add(entry.id);
    entries.push({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      kind: KIND_LABELS[entry.kind] ?? entry.kind,
      status: entry.status,
      size: sizeClassOf(entry),
      blurb: blurbOf(entry, blurbChars),
      source,
      pack,
    });
  };

  // The packs the prompt named, whole and unrationed. Nothing else: see the
  // file header for the 580-shown/0-adopted measurement that removed the rest.
  const namedPacks = FORM_PACKS.filter((pack) => named.has(pack.id));
  for (const pack of namedPacks) {
    for (const id of pack.members) {
      const entry = showable(id);
      if (entry !== undefined) take(entry, "pack", pack.id);
    }
  }

  const text = renderCandidateMenu(entries, namedPacks.map((pack) => pack.id), eraClass);
  return {
    entries,
    ids: entries.map((entry) => entry.id),
    packs: namedPacks.map((pack) => pack.id),
    ...(eraClass === undefined ? {} : { eraClass }),
    text,
    chars: text.length,
    estimatedTokens: Math.round(text.length / 4),
  };
}

/**
 * The menu as the model sees it — or `""` when there is nothing to show.
 *
 * The empty case is load-bearing: an empty menu is injected as no message at
 * all, so a prompt with no era and no pack takes exactly the path it takes
 * today.
 */
export function renderCandidateMenu(
  entries: readonly CandidateMenuEntry[],
  packIds: readonly string[],
  eraClass: EraClass | undefined,
): string {
  if (entries.length === 0) return "";
  const nameOf = new Map(FORM_PACKS.map((pack) => [pack.id, pack.name] as const));
  const lines: string[] = [
    "CANDIDATE STRUCTURES for this world — ids read from the live registry, every",
    "one of them buildable today. Prefer these ids where they fit the prompt; they",
    "are not a limit, and an id you know that is not listed here is still legal.",
    "Columns: id · kind · size class · name — what it is.",
    "",
  ];
  for (const packId of packIds) {
    const rows = entries.filter((entry) => entry.pack === packId);
    if (rows.length === 0) continue;
    const era = eraClass === undefined ? "" : ` (${eraClass})`;
    lines.push(`${nameOf.get(packId) ?? packId}${era} — the pack this prompt asked for:`);
    lines.push(...rows.map(renderEntry), "");
  }
  return lines.join("\n").trimEnd();
}

/**
 * The menu for a classified intent — the form the production pipeline calls.
 *
 * Reads `character.formPacks` to choose the ids and `era` only to name them;
 * see {@link CandidateMenuRequest.era}. Historically both selected, which is
 * why both are still read. Everything else the classifier decides (wealth,
 * decline, formality, climate) steers *how* a form is built, not *which* forms
 * exist, and is left to the kit.
 */
export function candidateMenuForIntent(
  intent: SemanticIntent | undefined,
  options: Omit<CandidateMenuRequest, "era" | "formPacks"> = {},
): CandidateMenu {
  return buildCandidateMenu({
    ...options,
    ...(intent?.era === undefined ? {} : { era: intent.era }),
    ...(intent?.character?.formPacks === undefined
      ? {}
      : { formPacks: intent.character.formPacks }),
  });
}

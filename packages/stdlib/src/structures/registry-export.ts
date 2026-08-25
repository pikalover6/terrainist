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
 * ## Two tiers, and why there is no third
 *
 * 1. **Named packs** — every implemented member of every pack the intent asked
 *    for, in the pack's own order. These are never rationed: a pack that a
 *    prompt named and that the world then does not spend is the exact failure
 *    the audit measured.
 * 2. **Era-affine packs** — packs whose `eras` include the intent's resolved
 *    era class, **round-robin** across packs rather than pack-by-pack. Ancient
 *    pulls six affine packs (~94 implemented members) and medieval eight
 *    (~110); taken in order, one pack would eat the whole budget and the rest
 *    would stay as unreachable as they are today.
 *
 * A third "everyday fabric" tier was prototyped and cut (Kai, 2026-08-24): the
 * catalog's oldest entries — `cottage`, `church`, `inn`, `barn` — carry no
 * `note`, so the tier rendered as bare names, and they are precisely the ids the
 * kit already spells out in its worked examples. A request that names no pack
 * and resolves no era therefore gets an **empty** menu, and an empty menu is
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
  /** The intent's open `era` string; resolved through `eraClassOf`. */
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

/** Why an entry is on the menu. */
export type CandidateSource = "pack" | "era";

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
  if (stop > max / 2) return note.slice(0, stop + 1);
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

  // Tier 1 — the packs the prompt named, whole and unrationed.
  const namedPacks = FORM_PACKS.filter((pack) => named.has(pack.id));
  for (const pack of namedPacks) {
    for (const id of pack.members) {
      const entry = showable(id);
      if (entry !== undefined) take(entry, "pack", pack.id);
    }
  }

  // Tier 2 — era-affine packs, round-robin so no pack starves the others.
  const affinePacks = FORM_PACKS.filter(
    (pack) => eraClass !== undefined && pack.eras.includes(eraClass) && !named.has(pack.id),
  );
  const queues = affinePacks.map((pack) =>
    pack.members.map(showable).filter((entry): entry is StructureEntry => entry !== undefined),
  );
  const deepest = queues.reduce((max, queue) => Math.max(max, queue.length), 0);
  for (let rank = 0; rank < deepest && entries.length < maxEntries; rank++) {
    for (let k = 0; k < queues.length && entries.length < maxEntries; k++) {
      const entry = queues[k]?.[rank];
      if (entry !== undefined) take(entry, "era", affinePacks[k]?.id ?? "");
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
    const rows = entries.filter((entry) => entry.source === "pack" && entry.pack === packId);
    if (rows.length === 0) continue;
    lines.push(`${nameOf.get(packId) ?? packId} — the pack this prompt asked for:`);
    lines.push(...rows.map(renderEntry), "");
  }
  const affine = entries.filter((entry) => entry.source === "era");
  if (affine.length > 0) {
    lines.push(
      eraClass === undefined
        ? "Also at home in this world:"
        : `Also at home in a world of the ${eraClass} era:`,
    );
    lines.push(...affine.map(renderEntry), "");
  }
  return lines.join("\n").trimEnd();
}

/**
 * The menu for a classified intent — the form the production pipeline calls.
 *
 * Reads only `era` and `character.formPacks`, which are the two dials that say
 * what a world is made of. Everything else the classifier decides (wealth,
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

/**
 * Compiler-resolved intent — the single inheritance point for typed grounded values.
 *
 * `resolve.ts` merges the document's `intent` blocks down the node path and
 * dispatches `era` through the alias table. Nothing there imports a subsystem.
 * Every other fact an author wrote is still a string in `intent.character` or
 * `intent.climate`. Two consumers that each ground `"sun_clay"` or
 * `"classical_mediterranean"` against the same registry will eventually disagree
 * about it — the same discipline `ResolvedStyle` was created to end.
 *
 * This module is the one fan-in that does the grounding once, per scope, and
 * keeps it: climate offsets and feather, flora bias, palette overrides, and the
 * form/phrase that later climate/flora/land-use/palette/form passes read. Fan-
 * out rows still answer `today + dial`, but the dial is now a typed value taken
 * from here rather than a string the row re-parses.
 *
 * Installed through the static seam (`intent/seam.ts`), never through
 * `resolve.ts`, so the merge stays pure and the registry stays in one file.
 * The map is insertion-ordered, diagnostics are byte-identical to the callers
 * they replace, and a document with no `intent` yields today's values by
 * reference — the byte-identity law, only cached.
 */

import {
  type BlendWidth,
  type CharacterIntent,
  type ClimateIntent,
  type EraClass,
  type LoamDiagnostic,
  type Motifs,
  type PaletteValue,
  type SemanticIntent,
  type SnowIntent,
} from "@terrainist/spec/ir";
import { warning } from "@terrainist/spec";
import { BLEND_FEATHER, NO_CLIMATE_OFFSET, type ClimateOffsets } from "../terrain/climate-intent.js";
import { floraBiasFrom, type FloraBias } from "../terrain/flora-intent.js";
import {
  checkFormPacks,
  checkScopeVocabulary,
  groundList,
  isFormPackId,
  resolveMaterialTheme,
} from "../structures/vocabulary.js";
import { ensureFanOutRows } from "./seam.js";

import {
  EMPTY_INTENT,
  emptyResolvedIntent,
  type IntentDocumentLike,
  type IntentResolution,
  type ResolvedIntent,
  resolveIntents,
} from "./resolve.js";

// ---------------------------------------------------------------------------
// grounded value shapes
// ---------------------------------------------------------------------------

export interface ClimateGrounded {
  /** The author's raw `intent.climate`, if any. */
  readonly raw?: ClimateIntent;
  readonly biome?: string;
  readonly snow?: SnowIntent;
  readonly temperature?: number;
  readonly humidity?: number;
  readonly blend?: BlendWidth;
  /** Offsets added to the climate field — `NO_CLIMATE_OFFSET` when nothing moved. */
  readonly offsets: ClimateOffsets;
  /** Feather band width in columns, or `undefined` for today's perimeter-scaled band. */
  readonly feather: number | undefined;
  /** Precedence rung 1 for the land-use clamp: biome + snow only. */
  readonly landUse?: Readonly<{ readonly biome?: string; readonly snow?: SnowIntent }>;
}

export interface FloraGrounded {
  readonly raw?: Readonly<{ readonly prefer?: readonly string[]; readonly forbid?: readonly string[] }>;
  readonly bias: FloraBias;
}

export interface PaletteGrounded {
  readonly overrides?: Readonly<Record<string, PaletteValue>>;
}

export interface FormPackGrounded {
  readonly raw?: readonly string[];
  readonly known: readonly string[];
  readonly unknown: readonly string[];
  /** Diagnostics about the list itself (unknown ids, era affinity). */
  readonly diagnostics: readonly LoamDiagnostic[];
}

export interface FormGrounded {
  /** Grounded material theme id, if the word named one. */
  readonly materialTheme?: string;
  readonly materialThemeDiagnostic?: LoamDiagnostic;
  readonly motifs?: Motifs;
  readonly formPacks: FormPackGrounded;
}

// ---------------------------------------------------------------------------
// the per-scope resolved record
// ---------------------------------------------------------------------------

/**
 * One scope's intent, grounded.
 *
 * Wraps the merge result in `base` and carries the typed values climate,
 * flora, land-use, palette and form consumers would otherwise each derive from
 * `base.intent` on their own. `diagnostics` is the vocabulary check for this
 * scope alone (checkScopeVocabulary), not the document-wide deduplicated set —
 * that stays where the compiler already emits it.
 */
export interface CompilerResolvedIntent extends ResolvedIntent {
  /** The merge result this grounding was derived from. */
  readonly base: ResolvedIntent;
  readonly climate: ClimateGrounded;
  readonly flora: FloraGrounded;
  readonly palette: PaletteGrounded;
  readonly form: FormGrounded;
  /** Vocabulary diagnostics for this scope alone. */
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Every scope's grounded intent, plus the merge diagnostics.
 *
 * `diagnostics` is exactly `base.diagnostics` (currently `INTENT_ERA_UNKNOWN`
 * only) — no new warning timing, no changed message. Per-scope vocabulary
 * diagnostics live on each `CompilerResolvedIntent` in `byPath` and are cached
 * there so the next consumer does not re-ground the same strings.
 */
export interface CompilerIntentResolution {
  readonly byPath: ReadonlyMap<string, CompilerResolvedIntent>;
  readonly root: CompilerResolvedIntent;
  /** The underlying merge resolution. */
  readonly base: IntentResolution;
  /** `base.diagnostics` — preserved verbatim. */
  readonly diagnostics: readonly LoamDiagnostic[];
}

// ---------------------------------------------------------------------------
// construction — one pass over the merge, one grounding per scope
// ---------------------------------------------------------------------------

function climateGrounded(intent: SemanticIntent): ClimateGrounded {
  const raw = intent.climate;
  const offsets =
    raw !== undefined && (raw.temperature !== undefined || raw.humidity !== undefined)
      ? {
          temperature: raw.temperature ?? 0,
          humidity: raw.humidity ?? 0,
        }
      : NO_CLIMATE_OFFSET;
  const feather =
    raw?.blend !== undefined ? (BLEND_FEATHER as Record<string, number>)[raw.blend] : undefined;
  const landUse =
    raw !== undefined && (raw.biome !== undefined || raw.snow !== undefined)
      ? {
          ...(raw.biome === undefined ? {} : { biome: raw.biome }),
          ...(raw.snow === undefined ? {} : { snow: raw.snow }),
        }
      : undefined;
  return {
    ...(raw !== undefined ? { raw } : {}),
    ...(raw?.biome !== undefined ? { biome: raw.biome } : {}),
    ...(raw?.snow !== undefined ? { snow: raw.snow as SnowIntent } : {}),
    ...(raw?.temperature !== undefined ? { temperature: raw.temperature } : {}),
    ...(raw?.humidity !== undefined ? { humidity: raw.humidity } : {}),
    ...(raw?.blend !== undefined ? { blend: raw.blend as BlendWidth } : {}),
    offsets,
    feather,
    ...(landUse !== undefined ? { landUse } : {}),
  };
}

function floraGrounded(intent: SemanticIntent): FloraGrounded {
  const raw = intent.character?.flora as FloraGrounded["raw"] | undefined;
  const bias = floraBiasFrom(raw?.prefer, raw?.forbid);
  return { ...(raw !== undefined ? { raw } : {}), bias };
}

function paletteGrounded(intent: SemanticIntent): PaletteGrounded {
  const overrides = intent.character?.palettes;
  return { ...(overrides !== undefined ? { overrides } : {}) };
}

function formGrounded(base: ResolvedIntent): FormGrounded {
  const character: CharacterIntent | undefined = base.intent.character;
  const materialThemeRaw = character?.materialTheme;
  const materialThemeResolved =
    materialThemeRaw !== undefined ? resolveMaterialTheme(materialThemeRaw, base.nodePath) : undefined;

  const motifs = character?.motifs;

  const packsRaw = character?.formPacks;
  const packGrounding =
    packsRaw !== undefined ? groundList(packsRaw, isFormPackId) : { known: [] as string[], unknown: [] as string[] };
  const packDiagnostics =
    packsRaw !== undefined ? checkFormPacks(packsRaw, base.intent.era, base.nodePath) : [];

  return {
    ...(materialThemeResolved?.id !== undefined ? { materialTheme: materialThemeResolved.id } : {}),
    ...(materialThemeResolved?.diagnostic !== undefined
      ? { materialThemeDiagnostic: materialThemeResolved.diagnostic }
      : {}),
    ...(motifs !== undefined ? { motifs } : {}),
    formPacks: {
      ...(packsRaw !== undefined ? { raw: packsRaw } : {}),
      known: packGrounding.known,
      unknown: packGrounding.unknown,
      diagnostics: packDiagnostics,
    },
  };
}

function derive(base: ResolvedIntent): CompilerResolvedIntent {
  const climate = climateGrounded(base.intent);
  const flora = floraGrounded(base.intent);
  const palette = paletteGrounded(base.intent);
  const form = formGrounded(base);
  // Vocabulary check for this scope — one aggregated warning per list per scope,
  // same code/message/fix as the existing `checkIntentVocabulary` path.
  const vocabDiagnostics = checkScopeVocabulary(base);
  const diagnostics = [...vocabDiagnostics];
  return {
    ...base,
    base,
    climate,
    flora,
    palette,
    form,
    diagnostics,
  };
}

/** The grounded record for a document that declares no intent at all. */
export function emptyCompilerResolvedIntent(nodePath = "", depth = 0): CompilerResolvedIntent {
  return derive(emptyResolvedIntent(nodePath, depth));
}

/**
 * Resolve every node path's intent and ground it.
 *
 * Wraps {@link resolveIntents} — the document is read once, the merge is the
 * existing one, and the grounded values are derived from the merged result
 * without a second walk. Insertion order and `base.diagnostics` are preserved
 * verbatim. The seam is ensured first so registries (urban forms, material
 * themes) are ready for grounding.
 */
export function resolveCompilerIntents(doc: IntentDocumentLike): CompilerIntentResolution {
  ensureFanOutRows();
  const base = resolveIntents(doc);
  const byPath = new Map<string, CompilerResolvedIntent>();
  for (const [path, resolved] of base.byPath) {
    byPath.set(path, derive(resolved));
  }
  const root = byPath.get(base.root.nodePath) ?? derive(base.root);
  byPath.set("", byPath.get("") ?? derive({ ...base.root, nodePath: "" }));
  return {
    byPath,
    root,
    base,
    diagnostics: base.diagnostics,
  };
}

/**
 * Look up the nearest enclosing scope's grounded intent.
 *
 * Mirrors {@link import("./resolve.js").intentFor} — dotted walk up the path so
 * synthetic solver paths under a district inherit the district's character.
 */
export function compilerIntentFor(
  resolution: CompilerIntentResolution,
  nodePath: string,
): CompilerResolvedIntent {
  let path = nodePath;
  for (;;) {
    const hit = resolution.byPath.get(path);
    if (hit !== undefined) return hit;
    const cut = path.lastIndexOf(".");
    if (cut === -1) break;
    path = path.slice(0, cut);
  }
  return resolution.root;
}

// ---------------------------------------------------------------------------
// no-duplicate-parsing guarantee
// ---------------------------------------------------------------------------

/**
 * The grounded value for one scope, without re-reading the document.
 *
 * Exported so a fan-out row that already holds a `ResolvedIntent` can obtain
 * the grounded view for that single scope without paying for a second walk.
 * The result is the same object `resolveCompilerIntents` would have produced
 * for that path — derived once, returned by reference on repeated calls for the
 * same `base` instance via the caller's own cache.
 */
let SINGLETON_CACHE = new WeakMap<ResolvedIntent, CompilerResolvedIntent>();

export function compilerResolvedFromBase(base: ResolvedIntent): CompilerResolvedIntent {
  const cached = SINGLETON_CACHE.get(base);
  if (cached !== undefined) return cached;
  const derived = derive(base);
  SINGLETON_CACHE.set(base, derived);
  return derived;
}

/** For tests: clear the per-base singleton cache. */
export function __clearCompilerResolvedCache(): void {
  SINGLETON_CACHE = new WeakMap<ResolvedIntent, CompilerResolvedIntent>();
}

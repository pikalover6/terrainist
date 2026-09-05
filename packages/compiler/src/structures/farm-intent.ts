/**
 * Fan-out rows owned by the holding.
 *
 * Three rows and one reserved, registered through the one seam file, and every
 * one of them **total** in the fan-out layer's strict sense: an intent that
 * declares nothing gets `ctx.today`, and `ctx.today` for each of these is the
 * value `structures/farm.ts` was about to use with no intent layer at all —
 * `FARM_PARAM_DEFAULTS.edge`, `FARM_PARAM_DEFAULTS.fallow`, and
 * `FARM_DEFAULT_CROPS`. That is what makes the reach law (§2) hold: a document
 * with no `intent` compiles to the same holding it compiled to before this file
 * existed, and a document with no farm node never asks.
 *
 * All three rows drive a **default**, never an override. `params.edge`,
 * `params.fallow` and `params.crops` are the author speaking directly, and an
 * author who wrote a value outranks a dial that implied one — the same
 * precedence `params.fabric` has over `character.urbanForm`. The wiring is in
 * `structures/index.ts`, which asks the three rows once per holding and hands
 * the answers to `farmSettings` as its defaults.
 *
 * Fan-out law 1 (the intent package never imports a subsystem) is why this file
 * sits beside the pass it drives rather than inside `intent/`.
 */

import { FARM_CROPS, FARM_PARAM_DEFAULTS, type FarmEdge } from "@terrainist/spec/ir";

import { compilerResolvedFromBase, type CompilerResolvedIntent } from "../intent/compiler-resolved.js";
import { registerFanOut, type FanOutContext } from "../intent/fanout.js";
import type { ResolvedIntent } from "../intent/resolve.js";
import { FARM_DEFAULT_CROPS } from "./farm.js";

/** Row ids, so a caller never spells one as a bare string. */
export const FARM_ROWS = {
  edgeKit: "farm.edgeKit",
  fallowShare: "farm.fallowShare",
  cropList: "farm.cropList",
} as const;

/**
 * The temperate crop list — §10's answer when no `climate` has spoken.
 *
 * The pass's own constant, aliased rather than copied: it is this row's `today`,
 * and two hand-kept copies of "what a holding grows by default" would drift into
 * a fan-out that silently changes a world nobody gave an intent to.
 */
const TEMPERATE_CROPS: readonly string[] = FARM_DEFAULT_CROPS;

/**
 * Hot, dry country: the crops that read as agriculture without reading as an
 * English allotment.
 *
 * `pumpkin` and `pasture` are the two that carry it — a lattice of pumpkins and
 * a grazed field with hay in the corner say "warm smallholding" where four beds
 * of root vegetables say "temperate". `carrots` and `potatoes` drop out; `wheat`
 * stays, because it is the one crop every climate on Earth grows and the most
 * legible block in the table.
 */
export const WARM_CROPS: readonly string[] = ["wheat", "pumpkin", "beetroots", "pasture"];

/**
 * Cold country: roots first, and grazing rather than a third bed of vegetables.
 *
 * The order matters — the crop draw walks forward from a positional index, so
 * the head of the list is what a one-field holding is most likely to grow, and
 * a lone potato field above the treeline is right where a lone pumpkin patch is
 * not.
 */
export const COLD_CROPS: readonly string[] = ["potatoes", "beetroots", "wheat", "pasture"];

/**
 * How far `climate.temperature` must move before the crop list changes.
 *
 * A third of the dial each way, so "a bit warm" keeps the temperate list and
 * only a prompt that actually said desert or tundra moves it. A lower bar would
 * make the list flip on rounding noise from the classifier.
 */
const CLIMATE_BAND = 0.33;

/** Biome ids whose name alone settles the question. Matched as substrings. */
const WARM_BIOME_WORDS: readonly string[] = ["desert", "savanna", "badlands", "mesa", "jungle"];

/** Likewise, cold. `grove` is the snowy-slopes one whose name does not say so. */
const COLD_BIOME_WORDS: readonly string[] = [
  "snowy",
  "frozen",
  "ice",
  "taiga",
  "tundra",
  "grove",
];

/** Register every holding-owned row. Idempotent; the seam calls it once. */
export function registerFarmFanOut(): void {
  /* --- era → what a field is bounded by ---------------------------------- */
  registerFanOut<FarmEdge>({
    id: FARM_ROWS.edgeKit,
    reads: ["era"],
    status: "today",
    drives: "the default params.edge of precinct.farm@0 — fence, dry-stone wall, or open field",
    resolve(intent, ctx) {
      // Law 2: no `era`, today's default, which is `fence`.
      if (!intent.eraDeclared) return ctx.today;
      // §10's row, verbatim: `wall` for `ancient`, `fence` otherwise. The
      // dry-stone course is the Mediterranean and upland read, and `ancient` is
      // the one era class that reliably means it; every other class gets the
      // paling, including `primitive`, whose fields are cleared and staked
      // rather than walled.
      return intent.eraClass === "ancient" ? "wall" : "fence";
    },
  });

  /* --- decline → how much of a holding is resting ------------------------ */
  registerFanOut<number>({
    id: FARM_ROWS.fallowShare,
    reads: ["decline"],
    status: "today",
    drives: "the default params.fallow of precinct.farm@0 — the share of fields left unsown",
    resolve(intent, ctx) {
      const decline = intent.intent.decline;
      if (decline === undefined) return ctx.today;
      // Squared, and for the reason `decay.coverage` states: the visual read of
      // "half abandoned" is nowhere near half the fields gone over, and a linear
      // dial makes 0.3 look like a famine. `max` rather than replace, so a
      // kept-up holding (decline 0) never *un*-rests a field somebody asked for.
      return clamp01(Math.max(ctx.today, decline * decline));
    },
  });

  /* --- climate + character → what the holding grows ---------------------- */
  registerFanOut<readonly string[]>({
    id: FARM_ROWS.cropList,
    reads: ["climate", "character"],
    status: "today",
    drives: "the crop vocabulary a holding draws from when params.crops is absent",
    resolve(intent, ctx) {
      // An author naming plants outranks the climate, but only for names the
      // crop table actually grows: `character.flora` is a prefer/forbid pair
      // over plant ids, and the tree shapes in it are for the flora grammar and
      // are simply not crops. An ungrounded word must never become a crop.
      // Flora grounding is owned by `CompilerResolvedIntent`; this row consumes
      // the grounded raw rather than re-reading the free strings so crop
      // validation stays single-sourced via the spec `FARM_CROPS` catalog.
      const grounded = compilerResolvedFromBase(intent);
      const flora = grounded.flora.raw;
      const preferred = cropsIn(flora?.prefer);
      const forbidden = cropsIn(flora?.forbid);
      const base = preferred.length > 0 ? preferred : climateCrops(grounded, ctx.today);
      // **by reference**, never a copy of it. `intent-identity.test.ts` hands
      // every row a sentinel as its `today` and asserts identity back, which is
      // exactly the guard that catches a row that "does nothing" by rebuilding
      // the value it was given.
      if (forbidden.length === 0) return base;
      const drop = new Set(forbidden);
      const kept = base.filter((crop) => !drop.has(crop));
      // agriculture; the holding keeps the list it would have had rather than
      // seating fields with nothing in them.
      return kept.length > 0 ? kept : ctx.today;
    },
  });
}

/**
 * §10's climate half: three lists, chosen by the named biome first and the
 * temperature dial second.
 *
 * The biome comes first because it is the stronger statement — precedence rung
 * 1 of the biome contract is an author saying "this island is tropical", and a
 * temperature offset is a nudge to a field the terrain already computed.
 * Climate is read from `CompilerResolvedIntent` so the spec's biome/temperature
 * grounding is single-sourced and the structure cluster has no hand-copied
 * author climate catalog.
 */
function climateCrops(grounded: CompilerResolvedIntent, today: readonly string[]): readonly string[] {
  if (grounded.climate.raw === undefined) return today;
  const biome = grounded.climate.biome?.toLowerCase();
  if (biome !== undefined) {
    if (WARM_BIOME_WORDS.some((word) => biome.includes(word))) return WARM_CROPS;
    if (COLD_BIOME_WORDS.some((word) => biome.includes(word))) return COLD_CROPS;
  }
  const temperature = grounded.climate.temperature;
  if (temperature !== undefined) {
    if (temperature >= CLIMATE_BAND) return WARM_CROPS;
    if (temperature <= -CLIMATE_BAND) return COLD_CROPS;
  }
  // A declared climate that says only "humid", or a biome nobody's keyword
  // table knows: today's list. Law 2 does not stop at the absent case.
  return today;
}
/** The crop ids in a free list, in declaration order, deduplicated. */
function cropsIn(names: readonly string[] | undefined): readonly string[] {
  if (names === undefined) return [];
  const out: string[] = [];
  for (const name of names) {
    if (!(FARM_CROPS as readonly string[]).includes(name)) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** The three rows' `today` values, in one place for the caller that asks. */
export const FARM_TODAY = Object.freeze({
  edge: FARM_PARAM_DEFAULTS.edge,
  fallow: FARM_PARAM_DEFAULTS.fallow,
  crops: TEMPERATE_CROPS,
});

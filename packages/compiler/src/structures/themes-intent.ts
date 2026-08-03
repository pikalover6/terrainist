/**
 * Fan-out rows owned by the structure passes.
 *
 * Fan-out law 1: a row lives beside the subsystem it drives, never inside the
 * intent package. These are the rows the *building* half of the Phase 0 table
 * names — materials, roof form, ornament, wear, prop family, decay — plus the
 * reserved ones that belong to passes that do not exist yet.
 *
 * Law 2 is visible in every `resolve`: the first thing each does is establish
 * what "no opinion" means, and that is always `ctx.today`.
 */

import { ALL_MATERIAL_THEMES } from "@terrainist/stdlib";
import type { EraClass, RoofType } from "@terrainist/spec";

import { registerFanOut, type FanOutContext } from "../intent/fanout.js";
import type { ResolvedIntent } from "../intent/resolve.js";

/** Row ids, so a caller never spells one as a bare string. */
export const STRUCTURE_ROWS = {
  materialTheme: "themes.materialTheme",
  roofForm: "grammar.roofForm",
  ornamentDensity: "grammar.ornamentDensity",
  wearIntensity: "roads.wearIntensity",
  propFamily: "props.family",
  decayCoverage: "decay.coverage",
  vegetationReclaim: "decay.vegetationReclaim",
} as const;

/**
 * Material themes an era class reaches for, most preferred first.
 *
 * Only ids that exist in {@link ALL_MATERIAL_THEMES} are ever returned — an
 * era whose list is entirely unimplemented falls through to `ctx.today`, which
 * is the seeded draw. That keeps a new era word from silently emptying a
 * village of materials.
 */
const THEME_BY_ERA: Readonly<Record<EraClass, readonly string[]>> = Object.freeze({
  primitive: ["temperate_timber"],
  ancient: ["birchwood_downs"],
  medieval: ["temperate_timber"],
  renaissance: ["temperate_timber"],
  industrial: ["birchwood_downs"],
  modern: ["modern_city", "concrete_light"],
  far_future: ["modern_city", "concrete_white"],
});

/** The roof form an era builds when nothing more specific is said. */
const ROOF_BY_ERA: Readonly<Record<EraClass, RoofType>> = Object.freeze({
  primitive: "shed",
  ancient: "hip",
  medieval: "gable",
  renaissance: "mansard",
  industrial: "gable",
  modern: "flat",
  far_future: "dome",
});

/** The prop/vehicle family an era furnishes its streets with. */
export const PROP_FAMILY_BY_ERA: Readonly<Record<EraClass, string>> = Object.freeze({
  primitive: "handcart",
  ancient: "handcart",
  medieval: "cart",
  renaissance: "cart",
  industrial: "wagon",
  modern: "truck",
  far_future: "skimmer",
});

/** Register every structure-owned row. Idempotent; the seam calls it once. */
export function registerStructureFanOut(): void {
  /* --- era → material theme ---------------------------------------------- */
  registerFanOut<string | undefined>({
    id: STRUCTURE_ROWS.materialTheme,
    reads: ["era", "wealth", "character"],
    status: "today",
    drives: "which MaterialTheme a settlement is built in (stdlib/structures/themes.ts)",
    resolve(intent, ctx) {
      // `character.materialTheme` is an author naming a theme outright, so it
      // outranks the era's preference and the seeded draw alike.
      const named = intent.intent.character?.materialTheme;
      if (named !== undefined && isKnownTheme(named)) return named;
      if (!intent.eraDeclared) return ctx.today;
      // An explicit override already in the document (`style.palettes.theme`)
      // stays authoritative: it is the power-user hatch and intent is not a
      // reason to take it away.
      if (ctx.today !== undefined) return ctx.today;
      for (const id of THEME_BY_ERA[intent.eraClass]) {
        if (isKnownTheme(id)) return id;
      }
      return ctx.today;
    },
  });

  /* --- era + motifs → roof form ------------------------------------------ */
  registerFanOut<RoofType | undefined>({
    id: STRUCTURE_ROWS.roofForm,
    reads: ["era", "character"],
    status: "today",
    drives: "the default roof form of building.grammar@0",
    resolve(intent, ctx) {
      const motif = intent.intent.character?.motifs?.roofType;
      if (motif !== undefined) return motif;
      if (!intent.eraDeclared) return ctx.today;
      return ROOF_BY_ERA[intent.eraClass];
    },
  });

  /* --- wealth → facade richness ------------------------------------------ */
  registerFanOut<number>({
    id: STRUCTURE_ROWS.ornamentDensity,
    reads: ["wealth", "character"],
    status: "today",
    drives: "motifs.ornamentDensity → how much decoration a facade carries",
    resolve(intent, ctx) {
      const motif = intent.intent.character?.motifs?.ornamentDensity;
      if (motif !== undefined) return motif;
      const wealth = intent.intent.wealth;
      if (wealth === undefined) return ctx.today;
      // Centred on today's value: 0.5 wealth is "ordinary", which must mean
      // "exactly what the grammar does now" or the dial is not orthogonal to
      // the code it modulates.
      return clamp01(ctx.today + (wealth - 0.5));
    },
  });

  /* --- decline → road wear ----------------------------------------------- */
  registerFanOut<number>({
    id: STRUCTURE_ROWS.wearIntensity,
    reads: ["decline", "event"],
    status: "today",
    drives: "road surface erosion / patch density (the road pass's wear mix)",
    resolve(intent, ctx) {
      const decline = intent.intent.decline;
      if (decline === undefined) return ctx.today;
      // Kept-up (0) leaves today's wear alone rather than polishing the road
      // to nothing: a lived-in street has wear, and 0 means "maintained", not
      // "resurfaced this morning".
      return clamp01(ctx.today + decline * (1 - ctx.today));
    },
  });

  /* --- era → prop and vehicle family ------------------------------------- */
  registerFanOut<string | undefined>({
    id: STRUCTURE_ROWS.propFamily,
    reads: ["era"],
    status: "today",
    drives: "which vehicle/prop family the life and prop passes draw from",
    resolve(intent, ctx) {
      if (!intent.eraDeclared) return ctx.today;
      return PROP_FAMILY_BY_ERA[intent.eraClass];
    },
  });

  /* --- decline → ruin coverage ------------------------------------------- */
  registerFanOut<number>({
    id: STRUCTURE_ROWS.decayCoverage,
    reads: ["decline"],
    status: "today",
    drives: "fraction of buildings re-clad as ruins (archetypes-relic.ts)",
    resolve(intent, ctx) {
      const decline = intent.intent.decline;
      if (decline === undefined) return ctx.today;
      // Squared: the visual read of "half abandoned" is nowhere near half the
      // buildings ruined, and a linear dial makes 0.3 look like a war.
      return clamp01(Math.max(ctx.today, decline * decline));
    },
  });

  /* --- decline → vegetation reclaim -------------------------------------- */
  registerFanOut<number>({
    id: STRUCTURE_ROWS.vegetationReclaim,
    reads: ["decline"],
    status: "today",
    drives: "moss, vines and volunteer saplings over claimed ground",
    resolve(intent, ctx) {
      const decline = intent.intent.decline;
      if (decline === undefined) return ctx.today;
      return clamp01(Math.max(ctx.today, decline * 0.6));
    },
  });

  /* --- reserved ----------------------------------------------------------- */
  // Registered, total, and doing nothing: the row exists so the table is
  // inspectable before the feature that owns it is written, and so the phase
  // that writes it changes one `resolve` rather than adding a new seam.
  reserved("life.declineDressing", ["decline"], "Phase 4", "lit-interior fraction, prop breakage, missing roofs");
  reserved("event.flood", ["event"], "Phase 4", "silt paint, waterlogged courses, debris line");
  reserved("event.fire", ["event"], "Phase 4", "charred substitution, roof gaps, standing chimneys, soot");
  reserved("event.siege", ["event"], "Phase 4", "wall breaches, rubble aprons, a camp outside the wall");
  reserved("event.boom", ["event"], "Phase 4", "scaffolds, new-material bias, density and storey lift");
  reserved("character.props", ["character"], "Phase 4", "prop family bias in the life and prop passes");
  reserved("character.flora", ["character"], "Phase 4", "species tables for scatter.forest@0 (flora grammar)");
  reserved("character.programs", ["character"], "Phase 3", "how many authored programs a region asks for");
}

function reserved(
  id: string,
  reads: readonly ("era" | "wealth" | "decline" | "formality" | "event" | "climate" | "character" | "tokens")[],
  phase: string,
  drives: string,
): void {
  registerFanOut<unknown>({
    id,
    reads,
    status: "reserved",
    phase,
    drives,
    resolve: (_intent: ResolvedIntent, ctx: FanOutContext<unknown>) => ctx.today,
  });
}

function isKnownTheme(id: string): boolean {
  return ALL_MATERIAL_THEMES.some((t) => t.id === id);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

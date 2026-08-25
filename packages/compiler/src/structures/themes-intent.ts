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

import { isPropName } from "@terrainist/stdlib";
import type { EraClass, RoofType } from "@terrainist/spec";

import { registerFanOut, type FanOutContext } from "../intent/fanout.js";
import type { ResolvedIntent } from "../intent/resolve.js";
import { groundList, materialThemeIds, resolveMaterialTheme } from "./vocabulary.js";

/** Row ids, so a caller never spells one as a bare string. */
export const STRUCTURE_ROWS = {
  materialTheme: "themes.materialTheme",
  roofForm: "grammar.roofForm",
  ornamentDensity: "grammar.ornamentDensity",
  windowRhythm: "grammar.windowRhythm",
  wearIntensity: "roads.wearIntensity",
  propFamily: "props.family",
  modernFittings: "life.modernFittings",
  kerbsideKit: "streetscape.kerbsideKit",
  decayCoverage: "decay.coverage",
  vegetationReclaim: "decay.vegetationReclaim",
  streetBreak: "decay.streetBreak",
} as const;

/**
 * The `decline` at which a street stops being worn and starts breaking up
 * (RUINS-PLAN-v0 §7.3).
 *
 * Well above `RUIN_ONSET`: a quarter with a quarter of its houses fallen in
 * still has a street you can drive a cart down, and paving that has gone back
 * to soil is a much later stage of the same story than paving that is patched.
 */
export const STREET_BREAK_ONSET = 0.8;

/** Share of carriageway columns broken back to soil at `decline = 1`. */
export const STREET_BREAK_MAX = 0.35;

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
  // sun_clay joined the draw 2026-08-14 (Kai, after the Troy walks validated
  // the palette): antiquity without a named theme can now come out sun-baked.
  ancient: ["birchwood_downs", "sun_clay"],
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

/**
 * The window rhythm an era punches into a facade **that nothing else spoke
 * for** — not the node's own `params.windowRhythm`, and not the archetype's
 * intrinsic facade.
 *
 * ## Why this table exists (the Troy defect, 2026-08-19)
 *
 * Kai walked `trojan_horse_in_troy` and reported "modern houses" in a Bronze
 * Age citadel. The archetype draw was **not** the culprit and the mix bias is
 * not broken: with `era: ancient`, the `classical_mediterranean` pack and the
 * doc's `prefer`/`forbid`, every one of the 44 lot draws came back classical
 * (`peristyle_house`, `megaron`, `stoa`, `propylaea`, `nymphaeum`, …) and not
 * one forbidden or modern id was drawn. What read as modern was the *facade*:
 * an archetype with no intrinsic facade (`hall`, and any word outside the
 * `archetypeFacadeDefaults` chain) fell through to the grammar's own default
 * rhythm, which is `"regular"` — an evenly spaced window grid on every storey.
 * A regular grid of identical punched windows is the single strongest modern
 * tell a wall has, and antiquity does not have one: it has a blank wall, a
 * colonnade, and the occasional slot.
 *
 * So this is the hole-filler, and it fills **only** the hole. The order it
 * takes part in is unchanged and stated in the row below: an explicit
 * `motifs.windowRhythm` wins, then the node's own param or the archetype's
 * identity (`ctx.today`), and this table speaks last, only when both were
 * silent and only when the author declared an era at all.
 *
 * `undefined` means "the grammar's own default is already right for this era" —
 * and it is right for every era from the Renaissance on, which is why a modern
 * document is byte-identical across this change rather than merely equivalent.
 */
const RHYTHM_BY_ERA: Readonly<Record<EraClass, string | undefined>> = Object.freeze({
  // A wall with a hole in it, and not many of those.
  primitive: "none",
  // Antiquity's wall is blank; the openings are the colonnade's business.
  ancient: "sparse",
  // Small openings, unevenly, wherever the frame allowed one.
  medieval: "sparse",
  // The regular grid *is* the Renaissance's invention: from here the
  // grammar's own default is the period answer.
  renaissance: undefined,
  industrial: undefined,
  modern: undefined,
  far_future: undefined,
});

/**
 * The prop an era furnishes its streets with.
 *
 * **Every value is a real `PROP_NAMES` id.** It used to be a family *word*
 * (`"handcart"`, `"truck"`, `"skimmer"`) — words no catalog carries, so the row
 * answered with something the life pass could not build, which is a fan-out
 * that reports success and changes nothing. An era whose ideal vehicle is not
 * in the catalog takes the nearest thing that is.
 */
export const PROP_FAMILY_BY_ERA: Readonly<Record<EraClass, string>> = Object.freeze({
  primitive: "cart",
  ancient: "cart",
  medieval: "cart",
  renaissance: "stagecoach",
  industrial: "covered_wagon",
  modern: "bicycle_rack",
  far_future: "floating_platform",
});

/**
 * Era classes whose streets may carry the *modern* fittings.
 *
 * An air-conditioning condenser, a fire hydrant, a phone box, a wheeled
 * dumpster, a newspaper box, a parked car and a bus shelter all say "twentieth
 * century" louder than any material does, and a boreal mountain village with
 * seventeen AC units reads as a film set. `industrial` is deliberately *out*:
 * the gaslit-terrace read is the one that era buys, and it is spoiled by a
 * satellite dish.
 */
const MODERN_FITTING_ERAS: ReadonlySet<EraClass> = new Set<EraClass>(["modern", "far_future"]);

/**
 * Era classes whose sidewalks may be dressed from the **downtown** kerbside kit.
 *
 * The kit is selected today by band width alone (`streets.sidewalk >= 2`), and
 * band width is a *fabric* fact: a dense hill village laid out at high coverage
 * gets a two-column walk and, with it, bicycle racks and bollard rows. Those two
 * props are the kit's whole difference from the village kit, and both say
 * "twentieth-century street" as loudly as a fire hydrant does — so the gate is
 * the same closed set as {@link MODERN_FITTING_ERAS}, for the same reason. Any
 * other declared era keeps the width (that is layout's business) and takes the
 * rustic substitution: the village kit's bench, planter and litter bin.
 */
const DOWNTOWN_KERBSIDE_ERAS: ReadonlySet<EraClass> = new Set<EraClass>([
  "modern",
  "far_future",
]);

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
      // outranks the era's preference, the seeded draw, and — because it returns
      // above the `ctx.today` guard below — `style.palettes["theme"]` too
      // (census `docs/STOCKTAKE-SLOP-CENSUS.md` §8, M5). But it is a
      // free string from a language model, so it
      // is *grounded* rather than trusted: exact id, then the alias table, then
      // nothing (and `vocabulary.ts` has already drawn the warning that says
      // so). An ungrounded word must never silently become a theme.
      const named = intent.intent.character?.materialTheme;
      if (named !== undefined) {
        const ground = resolveMaterialTheme(named, intent.nodePath);
        if (ground.id !== undefined) return ground.id;
      }
      if (!intent.eraDeclared) return ctx.today;
      // An explicit override already in the document (`style.palettes.theme`)
      // is authoritative *from here down* — over the era table and the seeded
      // draw. It does not outrank a grounded `character.materialTheme`, which
      // returned above (census `docs/STOCKTAKE-SLOP-CENSUS.md` §8, M5).
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

  /* --- motifs → window rhythm -------------------------------------------- */
  registerFanOut<string | undefined>({
    id: STRUCTURE_ROWS.windowRhythm,
    reads: ["era", "character"],
    status: "today",
    drives: "motifs.windowRhythm → the window grid of a facade and of a terrace bay",
    resolve(intent, ctx) {
      // Same shape as `grammar.roofForm`: the motif is a closed enum the spec
      // already validated, so it is taken as written. Silence is `ctx.today` —
      // whatever the node's own `params.windowRhythm` said, which is how a
      // document without intent stays byte-identical, and how an author who
      // named a rhythm on one building keeps it.
      const motif = intent.intent.character?.motifs?.windowRhythm;
      if (motif !== undefined) return motif;
      // The era's hole-filler, and it is a hole-filler: it speaks only where
      // the node's param and the archetype's own facade both said nothing, so
      // a church keeps its bay lights and a warehouse keeps its blank wall in
      // every century. See {@link RHYTHM_BY_ERA} for why the row grew this
      // rung — a `"regular"` grid on a Bronze Age wall is the modern read.
      if (ctx.today !== undefined) return ctx.today;
      if (!intent.eraDeclared) return ctx.today;
      return RHYTHM_BY_ERA[intent.eraClass] ?? ctx.today;
    },
  });

  /* --- wealth → facade richness ------------------------------------------ */
  registerFanOut<number>({
    id: STRUCTURE_ROWS.ornamentDensity,
    reads: ["wealth", "character"],
    status: "today",
    drives: "motifs.ornamentDensity → shutter and window-box density on a facade",
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
    drives: "share of carriageway columns painted in the worn tone (roads.ts)",
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
    reads: ["era", "character"],
    status: "today",
    drives: "which prop the life pass's pavement furniture draw reaches for",
    resolve(intent, ctx) {
      // An author naming props outranks the era, but only for names the
      // catalog actually builds — `vocabulary.ts` warns about the rest.
      const preferred = groundList(intent.intent.character?.props?.prefer, isPropName).known[0];
      if (preferred !== undefined) return preferred;
      if (!intent.eraDeclared) return ctx.today;
      return PROP_FAMILY_BY_ERA[intent.eraClass];
    },
  });

  /* --- era → may the life pass plant modern fittings? --------------------- */
  registerFanOut<boolean>({
    id: STRUCTURE_ROWS.modernFittings,
    reads: ["era"],
    status: "today",
    drives: "whether life.ts plants AC units, hydrants, phone boxes, dumpsters, cars",
    resolve(intent, ctx) {
      // Law 2, and it bites hardest here: a document with no `era` gets today's
      // behaviour, which is "modern fittings allowed". The gate only closes when
      // an era is actually declared and resolves to a pre-modern class.
      if (!intent.eraDeclared) return ctx.today;
      return MODERN_FITTING_ERAS.has(intent.eraClass);
    },
  });

  /* --- era → which kerbside furniture kit dresses a sidewalk -------------- */
  registerFanOut<string>({
    id: STRUCTURE_ROWS.kerbsideKit,
    reads: ["era"],
    status: "today",
    drives: "which furniture kit streetscape.ts scatters along a district's sidewalks",
    resolve(intent, ctx) {
      // Law 2: no `era`, today's kit — which is the pure band-width rule, so a
      // document without intent compiles byte-identically. The gate only ever
      // *downgrades*: it never promotes a village lane to the downtown kit,
      // because the band is too narrow to hold it whichever era asked.
      if (!intent.eraDeclared) return ctx.today;
      if (ctx.today !== "downtown") return ctx.today;
      return DOWNTOWN_KERBSIDE_ERAS.has(intent.eraClass) ? "downtown" : "village";
    },
  });

  /* --- decline → ruin coverage ------------------------------------------- */
  registerFanOut<number>({
    id: STRUCTURE_ROWS.decayCoverage,
    reads: ["decline"],
    status: "today",
    drives: "how much of a settlement's open ground is worn through (grounds.ts)",
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
    drives: "volunteer grass and flowers over claimed ground (grounds.ts gardens)",
    resolve(intent, ctx) {
      const decline = intent.intent.decline;
      if (decline === undefined) return ctx.today;
      return clamp01(Math.max(ctx.today, decline * 0.6));
    },
  });

  /* --- decline → the street break-up -------------------------------------- */
  registerFanOut<number>({
    id: STRUCTURE_ROWS.streetBreak,
    reads: ["decline"],
    status: "today",
    drives: "share of carriageway columns broken back to soil (roads.ts, §7.3)",
    resolve(intent, ctx) {
      const decline = intent.intent.decline;
      if (decline === undefined) return ctx.today;
      // Total, like every row, and exactly zero below the onset: `today` is 0,
      // so a document that never reaches 0.8 surfaces the street it always did.
      if (decline < STREET_BREAK_ONSET) return ctx.today;
      const past = (decline - STREET_BREAK_ONSET) / (1 - STREET_BREAK_ONSET);
      return clamp01(Math.max(ctx.today, STREET_BREAK_MAX * past));
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
  return materialThemeIds().includes(id);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Loam terrain-profile diagnostics.
 *
 * Every diagnostic carries a stable machine code, the `nodePath` it applies
 * to, a human message, and a **fix hint**. The hint is not decoration: G3 feeds
 * these verbatim back to the authoring LLM, so each one must say precisely
 * what to change in the document.
 */

/**
 * Severity of a diagnostic.
 *
 * `error` fails the compile; `warning` does not but asks the author to change
 * something; `note` is informational — the compiler recovered on its own and is
 * only reporting what it did.
 */
export type DiagnosticSeverity = "error" | "warning" | "note";

/** One validation or compilation finding. */
export interface LoamDiagnostic {
  /** Stable code, e.g. `"LOAM-T001"`. */
  readonly code: string;
  /** Symbolic name of the code, e.g. `"GENERATOR_NOT_IN_PROFILE"`. */
  readonly name: string;
  readonly severity: DiagnosticSeverity;
  /** Dotted node path, e.g. `"world.terrain.the_divide"`; `""` for the document. */
  readonly nodePath: string;
  /** What is wrong. */
  readonly message: string;
  /** What the author must change to make it right. */
  readonly fix: string;
}

/** The terrain-profile diagnostic catalog. */
export const TERRAIN_DIAGNOSTICS = {
  // --- LOAM-T0xx: structural -----------------------------------------------
  BAD_DOCUMENT: "LOAM-T000",
  GENERATOR_NOT_IN_PROFILE: "LOAM-T001",
  CONSTRAINTS_NOT_ALLOWED: "LOAM-T002",
  GENERATOR_CARDINALITY: "LOAM-T003",
  EDIT_NOT_UNDER_HEIGHTFIELD: "LOAM-T004",
  DEPTH_EXCEEDED: "LOAM-T005",
  BAD_ID: "LOAM-T006",
  DUPLICATE_ID: "LOAM-T007",
  UNKNOWN_KEY: "LOAM-T008",
  MISSING_KEY: "LOAM-T009",
  BAD_TYPE: "LOAM-T010",

  // --- LOAM-T1xx: semantic -------------------------------------------------
  FRACTIONAL_OUT_OF_RANGE: "LOAM-T100",
  BAD_ENUM: "LOAM-T101",
  BAD_PLACEMENT: "LOAM-T102",
  BAD_COURSE: "LOAM-T103",
  PARAM_OUT_OF_RANGE: "LOAM-T104",
  BASIN_RIM_NOT_CLOSED: "LOAM-T105",
  BAD_PALETTE: "LOAM-T106",
  SPAWN_UNRESOLVED: "LOAM-T107",
  UNSTABLE_FLUID: "LOAM-T110",
  FLOATING_VEGETATION: "LOAM-T111",
  /** G4.5a — a `river` with no sea to reach, demoted to a chain of ponds. */
  RIVER_PONDED: "LOAM-T112",
  /**
   * G5.1 — a carve that asked to flood (`flooded: "auto"`) ended up with no
   * ocean-connected water at all, because its course points away from where the
   * coast actually fell.
   */
  CARVE_DRY: "LOAM-T113",
  /**
   * G5a — a param this profile does not implement, named rather than silently
   * dropped. Used by `cave.carver@0` for the half of the v0.2 §7 table it
   * leaves out.
   */
  PARAM_NOT_IMPLEMENTED: "LOAM-T114",
  /**
   * G5a — a carved cave interval comes within four blocks of a fluid column,
   * or below sea level near the ocean. Structurally impossible; the check is a
   * second opinion on the carve band, and a compiler bug if it ever fires.
   */
  CAVE_FLUID_BREACH: "LOAM-T115",
  /**
   * G5a — a cave removed a column's top solid block somewhere that is not a
   * declared entrance mouth. Interior caves must leave the heightmap alone.
   */
  CAVE_SURFACE_BREACH: "LOAM-T116",
  /**
   * U6 — `scaleReference` was declared on a heightfield that has no spatial
   * parameter for it to act on, so the landform will not scale with the region
   * however large the world is made. Inert rather than wrong, hence a warning.
   */
  SCALE_REFERENCE_INERT: "LOAM-T117",

  // --- LOAM-T2xx: settlement-profile structure -----------------------------
  // Profile-scoped rules with no Loam v0.2 counterpart. Anything the core spec
  // already names keeps the core code (below), per the profile's aliasing rule.
  STRUCTURE_GENERATOR_NOT_IN_PROFILE: "LOAM-T200",
  STRUCTURE_NODE_SHAPE: "LOAM-T201",
  PLAZA_CARDINALITY: "LOAM-T202",
  BAD_ENVELOPE: "LOAM-T203",
  BAD_CONSTRAINT: "LOAM-T204",
  BAD_PORT: "LOAM-T205",
  PORT_FEATURE_NOT_IMPLEMENTED: "LOAM-T206",
  STRUCTURE_PARAM: "LOAM-T207",
  GENERATOR_NOT_IMPLEMENTED: "LOAM-T208",
  /** G4b `road.network@0` — a route between two anchors has no legal path. */
  ROAD_UNROUTABLE: "LOAM-T209",
  /**
   * F1 `district` — a field of the district node is missing, malformed, or
   * names something the grammar does not know (an unspellable `mix` entry).
   */
  DISTRICT_PARAM: "LOAM-T210",
  /**
   * F1 `district` — the envelope is too small to hold a street skeleton at
   * all: fewer than two streets on an axis, or no block deep enough for a lot.
   */
  DISTRICT_TOO_SMALL: "LOAM-T211",
  /**
   * C3 life pass — there was frontage to dress and none of it took.
   *
   * Informational, and deliberately **not** `CANNOT_FIT`. What it diagnoses is
   * this pass running before the streetscape rather than after it, which is a
   * compiler-ordering defect no edit to the document can repair; borrowing the
   * author-actionable `LOAM-E170` sent it into the authoring loop's feedback
   * codes and cost every small world two revision rounds it could not satisfy.
   */
  LIFE_PASS_EMPTY: "LOAM-T212",
  /**
   * C1 `city` — a field of the city node is missing, malformed, or names
   * something the grammar does not know (an unspellable `mix` entry, a
   * character key outside the eight).
   */
  CITY_PARAM: "LOAM-T213",
  /**
   * C1 `city` — the envelope is too small to hold an arterial armature: the
   * plan cannot draw a spine and leave a district cell either side of it.
   */
  CITY_TOO_SMALL: "LOAM-T214",
  /**
   * C4 `city` — `params.setPieces` is malformed: not a boolean or object, a
   * `max` outside 1..6, or a `kinds` entry outside the five kinds.
   */
  CITY_SET_PIECES: "LOAM-T215",
  /**
   * C4 — `params.vista` on a landmark is malformed, names an arterial kind
   * that has no terminus to stand at (a ring), or is written on a building
   * that is not a child of a `city`, where nothing would ever read it.
   */
  VISTA_PIN: "LOAM-T216",
  /**
   * C4 — a landmark pinned with `params.vista` could not take an axis: every
   * axis was already claimed, or the node does not fit the ground reserved at
   * the end of any of them. A warning, because the landmark is still built —
   * it just goes wherever the fabric would have put it.
   */
  VISTA_UNCLAIMED: "LOAM-T217",
  /**
   * C4 — there were set pieces to dress and none of them took.
   *
   * Informational, and deliberately its own code rather than a borrowed one.
   * What it diagnoses is a pass-ordering or occupancy fact, not anything the
   * document can change: the same mistake `LIFE_PASS_EMPTY` was created to undo
   * when it was first spelt `LOAM-E170` and cost the authoring loop two model
   * calls per world. It is also only raised when there was something *other
   * than a landmark* to build — a landmark is a building the grammar put up
   * three passes earlier, so a city whose only anchors are landmarks writing no
   * blocks here is the expected outcome, not a report.
   */
  SET_PIECES_EMPTY: "LOAM-T218",
  /**
   * `infra.wall@0` — `params.walls` is malformed: not an object, an unknown
   * style, or a margin/pitch/height outside its band.
   */
  WALL_PARAM: "LOAM-T219",
  /**
   * `infra.wall@0` — a wall was asked for and no course could be derived.
   *
   * Informational, and its own code for `LIFE_PASS_EMPTY`'s reason: what it
   * diagnoses is that the settlement's finished footprint was too small or too
   * scattered to hull, which is a fact about the ground and the placement
   * rather than anything the document can restate.
   */
  WALL_COURSE_EMPTY: "LOAM-T220",
  /**
   * C4 — a hillside stair was refused because it connected to nothing.
   *
   * Informational, for `LIFE_PASS_EMPTY`'s reason: it reports a fact about the
   * finished ground and the street network, not anything the document said. A
   * public stair is a *connection*, so the pass requires each end to reach a
   * road, street, plaza cell or building pad; the sweep will happily relocate
   * the strip to find one, and only when no candidate in the window connects
   * at both ends does the piece decline whole. That refusal is the right
   * outcome — masonry, balustrade and lanterns stranded mid-slope with no path
   * at either end is a folly, and one Kai walked — but it is worth saying out
   * loud, because "the plan asked for a stair and there is no stair" should
   * never be silent.
   */
  STAIR_UNCONNECTED: "LOAM-T221",
  /**
   * Phase 4.1 urban forms — the requested form could not be drawn on this
   * quarter, so its **announced fallback** was drawn instead.
   *
   * A warning rather than an error, deliberately: a terrain mismatch is
   * something an author may not have been able to predict, and losing a whole
   * quarter over one costs more than the form did. The message names the
   * measurement that failed and the thing in the document to change, and the
   * fallback is recorded on the district in the compile report — so a fallback
   * is legible in the finished artifact, not only in a feedback round.
   *
   * Also carries a form's own notes about the ground it was given (a canal
   * quarter that is a closed pound; a flight of steps that could not be made
   * climbable).
   */
  DISTRICT_FORM: "LOAM-T222",

  // --- Phase 0 contract 2: authored programs -------------------------------
  // The contract's own numbering (W330–W337), kept verbatim so a diagnostic
  // quoted in the design doc and one printed by the compiler are the same
  // string.
  /** A node overrode the envelope the program declared for itself. */
  PROGRAM_ENVELOPE_OVERRIDDEN: "LOAM-W330",
  /** More than `clipTolerance` of an instance's writes fell outside the envelope. */
  PROGRAM_WRITES_CLIPPED: "LOAM-W331",
  /** An instance exhausted fuel, writes or heap. Dropped whole, never half-written. */
  PROGRAM_BUDGET_EXCEEDED: "LOAM-E332",
  /** `sourceHash` does not match the source carried beside it. */
  PROGRAM_SOURCE_HASH_MISMATCH: "LOAM-E333",
  /** Re-execution produced a different op stream from the recorded `outputHash`. */
  PROGRAM_OUTPUT_HASH_MISMATCH: "LOAM-E334",
  /** The written solid is not one 6-connected component. */
  PROGRAM_DISCONNECTED: "LOAM-E335",
  /** A gate step failed: static lint, block registry, physics, or the nonsense guard. */
  PROGRAM_GATE_FAILED: "LOAM-E336",
  /** The program was dropped and the node fell back. */
  PROGRAM_DROPPED: "LOAM-W337",
  /** The `programs` map or a reference into it is malformed. */
  PROGRAM_SCHEMA: "LOAM-E338",

  // --- Loam v0.2 core codes, used verbatim ---------------------------------
  /** §3.3 — a `region`/`path` envelope given three-element `size`. */
  ENVELOPE_SIZE_COERCED: "LOAM-W152",
  /** §3.3 — a box-family envelope given two-element `size`. */
  ENVELOPE_SIZE_ARITY: "LOAM-E153",
  /** §1.5 / §7.10 — a constraint type outside the v0.2 registry. */
  UNKNOWN_CONSTRAINT_TYPE: "LOAM-E104",
  /** §5.3 — a port type outside the v0.2 table. */
  UNKNOWN_PORT_TYPE: "LOAM-E105",
  /** §4.1 — two type keys, neither a declared field of the other. */
  AMBIGUOUS_SHORTHAND: "LOAM-E169",
  /** §4.1 — a type name used as a field the resolved type does not declare. */
  SHADOWED_TYPE_KEY: "LOAM-W173",
  /** §4.4 `zone` — token outside the nine-grid. */
  UNKNOWN_ZONE: "LOAM-E162",
  /** §4.9.1 — a fractional component outside [0,1]. */
  COARSE_COORD_RANGE: "LOAM-E166",
  /** §4.9.4 — two hard coarse domains intersect to nothing. */
  COARSE_DOMAIN_EMPTY: "LOAM-E165",
  /** §4.4 `within` — the domain is non-empty but too small for the node. */
  CANNOT_FIT: "LOAM-E170",
  /** §4 — the constraint parses and is ignored by this solver. */
  CONSTRAINT_NOT_IMPLEMENTED: "LOAM-W407",

  // --- solver report codes (§4.6 relaxation ladder) ------------------------
  /** §4.6 rung 2. */
  TOLERANCE_RELAXED: "LOAM-W401",
  /** §4.6 rung 5. */
  CONSTRAINT_DEMOTED: "LOAM-E404",
  /** §4.6 rung 6. */
  NODE_DROPPED: "LOAM-E405",
  /** §4.6 rung 7. */
  UNSATISFIABLE: "LOAM-E406",
  /** §4.9.4 — a coarse `mode: "center"` fighting `centered_in`/`on_axis`. */
  COMPETING_PLACEMENT: "LOAM-W167",

  // --- the connective pass (§4 `connected`, pass 6) ------------------------
  /** §4 `connected` — no route between the two ends, or past `maxLength`. */
  TUNNEL_UNROUTABLE: "LOAM-E180",
  /** A gallery came too near water, or left too little rock over its ceiling. */
  TUNNEL_INTEGRITY: "LOAM-W408",
  /**
   * U6 — a precinct kit seated itself away from the footprint the solver gave
   * it, because the ground the kit needs is a fact about the world rather than
   * about the envelope. Emitted by `precinct.harbour@0` when it goes and finds
   * the coast.
   */
  PRECINCT_RESEATED: "LOAM-W409",

  // --- the SweptProfile engine (Phase 0 contract 3) ------------------------
  /** A swept run was refused whole: unclimbable, or past the fill cap. */
  SWEEP_RUN_REFUSED: "LOAM-W460",
  /** Columns of a swept run were skipped because something else owned them. */
  SWEEP_COLUMNS_SKIPPED: "LOAM-W461",
  /** A swept run met water it has no crossing behaviour for. */
  SWEEP_CROSSING_UNSPANNED: "LOAM-W462",
  /** Interval features (towers, piers, lamps) placed along a swept run. */
  SWEEP_FEATURES_PLACED: "LOAM-I463",

  // --- the biome / snow land-use clamp (Phase 0 contract 4) ----------------
  /**
   * A settlement footprint's biome and snow cover were clamped to one coherent
   * ground. Names the biome, the column count and the snow vote.
   *
   * `note`, not `warning`: nothing the author did is wrong and nothing in the
   * document can change it. It fires on every settlement world, and the
   * `LIFE_PASS_EMPTY` comment above records what happens when a code like that
   * lands in the authoring loop's feedback set.
   */
  BIOME_CLAMPED: "LOAM-W470",
  /** Snow removed from settlement ground the pre-settlement climate frosted. */
  SNOW_SUPPRESSED: "LOAM-W471",
  /**
   * `intent.climate.biome` names a biome id the emitter's table does not
   * carry. Author-actionable, so a real warning; the clamp falls back to its
   * derived biome.
   */
  BIOME_INTENT_UNKNOWN: "LOAM-W472",

  // --- SemanticIntent (Phase 0 contract 1) ---------------------------------
  /** `intent.era` names a word the closed alias table does not carry. */
  INTENT_ERA_UNKNOWN: "LOAM-W480",
  /** `intent` on a node kind that carries none. Ignored, never fatal. */
  INTENT_NOT_ALLOWED: "LOAM-W481",
  /** `intent` declared below district depth, where the fan-out table thins. */
  INTENT_TOO_DEEP: "LOAM-I482",
  /** `character.archetypes` names an archetype the catalog does not implement. */
  INTENT_ARCHETYPE_UNKNOWN: "LOAM-W483",
  /** `character.materialTheme` names a theme the material registry does not carry. */
  INTENT_THEME_UNKNOWN: "LOAM-W484",
  /** `character.props` names a prop the prop catalog does not build. */
  INTENT_PROP_UNKNOWN: "LOAM-W485",
  /** `character.flora` names a species/kind the vegetation pass does not know. */
  INTENT_FLORA_UNKNOWN: "LOAM-W486",
  /** `character.urbanForm` names a form outside the district-fabric vocabulary. */
  INTENT_FORM_UNKNOWN: "LOAM-W487",
} as const;

/** Symbolic diagnostic name. */
export type TerrainDiagnosticName = keyof typeof TERRAIN_DIAGNOSTICS;

/** Build a diagnostic from the catalog. */
export function diagnostic(
  name: TerrainDiagnosticName,
  severity: DiagnosticSeverity,
  nodePath: string,
  message: string,
  fix: string,
): LoamDiagnostic {
  return { code: TERRAIN_DIAGNOSTICS[name], name, severity, nodePath, message, fix };
}

/** Convenience: an error-severity diagnostic. */
export function error(
  name: TerrainDiagnosticName,
  nodePath: string,
  message: string,
  fix: string,
): LoamDiagnostic {
  return diagnostic(name, "error", nodePath, message, fix);
}

/** Convenience: a warning-severity diagnostic. */
export function warning(
  name: TerrainDiagnosticName,
  nodePath: string,
  message: string,
  fix: string,
): LoamDiagnostic {
  return diagnostic(name, "warning", nodePath, message, fix);
}

/** Convenience: an informational diagnostic about a recovery the compiler made. */
export function note(
  name: TerrainDiagnosticName,
  nodePath: string,
  message: string,
  fix: string,
): LoamDiagnostic {
  return diagnostic(name, "note", nodePath, message, fix);
}

/** Render a diagnostic as one human/LLM readable line. */
export function formatDiagnostic(d: LoamDiagnostic): string {
  const where = d.nodePath === "" ? "<document>" : d.nodePath;
  return `${d.severity} ${d.code} ${d.name} at ${where}: ${d.message}\n  fix: ${d.fix}`;
}

/** True when any diagnostic is fatal. */
export function hasErrors(diagnostics: readonly LoamDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/**
 * The catalog under its profile-neutral name. `TERRAIN_DIAGNOSTICS` is kept
 * because G2/G3 code imports it; new code should prefer this.
 */
export const LOAM_DIAGNOSTICS = TERRAIN_DIAGNOSTICS;

/** Symbolic diagnostic name (profile-neutral alias). */
export type LoamDiagnosticName = TerrainDiagnosticName;

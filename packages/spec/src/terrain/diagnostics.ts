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
  /**
   * F21 — a scatter `area.at` radius small enough to be a units mistake.
   *
   * A terrain verb's `area.radius` is in **blocks** while `at` is fractional,
   * and a model that has just written `[0.5, 0.5]` reaches for the same units
   * for the radius beside it. `radius: 0.55` is legal (it means "half a
   * block"), draws no tree, and says nothing — so this warns and the document
   * still compiles. Never an error: a sub-block radius is legal Loam.
   */
  SCATTER_RADIUS_UNITS: "LOAM-T118",
  /**
   * F21 — a `scatter.forest@0` node that planted **zero** trees while asking
   * for a non-degenerate region. Author-actionable, and in the compile
   * feedback set: a wood nobody can see is the silent decline DESIGN.md's
   * first failure mode is about.
   */
  SCATTER_EMPTY: "LOAM-T119",

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
  /**
   * Phase 4.2 — `params.ground: "stepped"` was asked for and the quarter came
   * out as **one platform**, so there is nothing to retain and no step to cut.
   *
   * A note, not a failure: the quarter still compiles, as `"pad"`. It names the
   * relief measured and the storey it needed, because "the document asked for a
   * hill town and got a flat one" is exactly the class of request this repo has
   * accepted and quietly not met before.
   */
  DISTRICT_GROUND: "LOAM-T223",
  /**
   * Phase 4.2 — `params.courtyards > 0` and **not one block closed**.
   *
   * Names the measurement that failed and how many blocks failed on it, plus
   * the thing in the document to change: a bigger `blockSize`, or `density:
   * "high"` so the perimeter builds a continuous street wall. Same reason as
   * `DISTRICT_GROUND`: never silent, never fatal.
   */
  COURTYARD_NONE: "LOAM-T224",

  // --- F17: the holding (`docs/FARM-PLAN-v0.md` §12) ------------------------
  /**
   * A `precinct.farm@0` envelope that is not a `region`, or is below the
   * 40 × 40 floor — one yard plus one parcel plus the setbacks.
   *
   * Rejected at validate rather than at compile for the reason the precinct
   * minima are: a holding that does not fit builds nothing, and an author would
   * far rather be told the number to change.
   */
  FARM_TOO_SMALL: "LOAM-T225",
  /** A `precinct.farm@0` param outside the range §3.3 states; names the range. */
  FARM_PARAM: "LOAM-T226",
  /**
   * A `params.crops` entry outside §6.2's table.
   *
   * A warning, not an error: the holding keeps its seeded draw over the crops
   * it *does* understand, so the fields are still fields.
   */
  FARM_CROP_UNKNOWN: "LOAM-W502",

  // --- F19: the ruins treatment (`docs/RUINS-PLAN-v0.md` §9) ---------------
  /**
   * `building.grammar@0` — `params.decay` is not a number in 0..1.
   *
   * The one authoring surface for ruining a **named** building. An error rather
   * than a clamp-and-carry-on because "decay": 80 is an author who meant 0.8 and
   * would far rather be told than handed an intact building.
   */
  DECAY_PARAM: "LOAM-T227",
  /**
   * `prop.place@0` — a water-borne or shore prop found no water within its
   * search radius of the coarse target it was given, and sought the waterline.
   *
   * The recovery, not the failure: the pier or the ship is built, on the
   * nearest column that can carry it, and the note says where. `CANNOT_FIT` is
   * kept for the honest case — a pinned prop, or a world with no water at all.
   * The same shape as `PRECINCT_RESEATED`, one scale down.
   */
  PROP_RESEATED: "LOAM-T228",
  /**
   * A rolled lot's decay was **refused whole** (RUINS-PLAN §5.7): an open
   * interior cell was still unreachable from the door after the rubble that
   * sealed it had been withdrawn, so the **intact** shell was built instead.
   *
   * Refused whole rather than shipped broken is the standing pattern (props,
   * set pieces, programs). A refusal rate above a few percent on a walked world
   * is a finding about the decay operators, not about the document — which is
   * why the lot and the reason are both named.
   */
  RUIN_LOT_REFUSED: "LOAM-W510",
  /**
   * A shell could not take the `shell` decay mode and took `facade`, or took
   * nothing: a footprint that is not a plain rect, or a wall of fewer than
   * three courses (table 14: a crumble line drawn on a three-course wall has
   * nothing to take away).
   *
   * A warning rather than a silence because the author's `params.decay` — or
   * the district's roll — asked for a ruin and got a shell with the sweeping
   * undone and nothing crumbled. The watchtower and the skyscraper are the two
   * shapes that reach it.
   */
  DECAY_MODE_FALLBACK: "LOAM-W511",
  /**
   * Per district: `decline`, the ruin share, lots rolled / ruined / refused.
   *
   * **Not optional.** DESIGN's second failure mode is machinery that exists and
   * never runs, and "the district ruined 0 of 84 lots because `decline` never
   * reached the row" is a sentence that must appear somewhere a human looks.
   */
  DISTRICT_RUINS: "LOAM-I512",
  /**
   * Per settlement: what the green skin wrote (RUINS-PLAN-v0-WP6 §9).
   *
   * **Not optional**, for {@link DISTRICT_RUINS}'s reason one storey up: *"the
   * skin wrote 0 blocks because the field was empty"* is the same sentence
   * about the same failure mode, and DESIGN's second failure mode is machinery
   * that exists and never runs.
   */
  GREEN_SKIN: "LOAM-I514",
  /**
   * The street colonizer's withdraw loop removed elected trunks (WP-6 §6.3).
   *
   * U2 — *growth never seals a route* — is not argued, it is checked and then
   * repaired: the pedestrian graph over the district's street bands must keep
   * exactly the components it had with the colonizer off, and any trunk that
   * breaks that is withdrawn in reverse election order. A sustained rate here
   * is a finding about `STREET_TRUNK_SHARE`, not about the withdraw loop.
   */
  GREEN_SKIN_WITHDRAWN: "LOAM-W513",
  /**
   * The green rule fell through to the climate fallback (WP-6 §4.6, Q2).
   *
   * No `scatter.forest@0` node covers this settlement, so the skin cannot grow
   * the wood the city stands in and takes the climate table instead. Visible
   * rather than silent, because the eye compares the leaves in a window hole
   * against the surrounding landscape.
   */
  GREEN_SKIN_NO_SPECIES: "LOAM-W514",
  /**
   * A holding seated its yard and **not one field**.
   *
   * Names the relief measured against `FIELD_MAX_RELIEF`, because the fix is
   * almost always the ground rather than the params: a holding is fields on
   * ground that is already close to level, and a mountainside has none.
   */
  FARM_NO_GROUND: "LOAM-W500",
  /**
   * Fewer fields than `params.parcels` — the crop-circle rule applied to
   * fields: a count you asked for is delivered or diagnosed, never silently
   * rounded. Names requested, delivered, and the dominant refusal reason.
   */
  FARM_PARCELS_SHORT: "LOAM-W501",
  /**
   * No seatable yard anywhere in the envelope, so the holding places nothing.
   *
   * A refusal rather than a farmstead floating over its fields, and a warning
   * rather than a silence: the report row says so too.
   */
  FARM_REFUSED: "LOAM-W503",
  /**
   * The holding's gate anchor, named so an author can see what to route to.
   *
   * `docs/FARM-PLAN-v0.md` §7.3: a holding publishes a `road_stub` at its gate
   * and an ordinary `road.network@0` node anchored on the holding's id runs the
   * lane to it. The anchor is a node path, and a node path is exactly the thing
   * an author cannot guess — so it is said rather than left to be inferred.
   */
  FARM_TRACK: "LOAM-I504",

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
  /**
   * Phase 4.2 — a level platform no street network could reach gave its level
   * back, and its columns took the level of the neighbouring platform they
   * touch most (ties to the lower).
   *
   * The honest degradation behind "a platform you cannot reach is not a
   * platform": the quarter ships with fewer levels rather than with an
   * unreachable one, and the note names the platform and the measurement.
   */
  LEVEL_DISSOLVED: "LOAM-W410",
  /**
   * Phase 4.2 — a seam was too tall for a retaining wall (`drop` past
   * `RETAIN_MAX`), so the two platforms were graded into each other as a bank.
   *
   * Names the drop. There is no unbuilt cliff either way; this says which of
   * the two answers the ground got.
   */
  RETAINING_REFUSED: "LOAM-W411",

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
  /**
   * `character.ground` names a policy outside the ground vocabulary, or
   * `character.courtyards` is outside 0..1. Ignored, and each quarter keeps the
   * ground it would have had.
   */
  INTENT_GROUND_UNKNOWN: "LOAM-W488",
  /**
   * `character.fortification` names a word outside `FORTIFICATIONS`.
   * Ignored, and the settlement keeps the walls it would have had — which,
   * unless a node wrote `params.walls`, is none.
   */
  INTENT_FORTIFICATION_UNKNOWN: "LOAM-W489",

  // --- the ground contract (docs/GROUND-CONTRACT-v0.md §6) -----------------
  // `resolveGround` reconciles every subsystem's claim on a column's level.
  // Precedence resolving a disagreement is normal and silent; these are the
  // cases worth a word. None belongs in `FEEDBACK_CODES` (§13.6): a claim table
  // is not author-actionable.
  /**
   * A level claim lost a column another source declared `preserve`. Deliberately
   * narrow — a lane losing a junction column to a boulevard happens thousands of
   * times per world; a doorstep cutting into a column a retaining wall's
   * balustrade stands on is news, and today it is invisible until somebody walks
   * the world.
   */
  GROUND_CONFLICT: "LOAM-W490",
  /**
   * A claim lost columns to higher ranks, **aggregated per claim, never per
   * column** — a hill town would otherwise produce thousands, and a note that
   * fires on every world is a report nobody reads.
   */
  GROUND_CLAIM_ADJUSTED: "LOAM-I491",
  /** A claim kept fewer columns than its `minColumns`. The resolver never acts on it. */
  GROUND_CLAIM_REFUSED: "LOAM-W492",
  /**
   * A winning level exceeded a `clearance` ceiling and was clamped to it.
   * Clamping rather than refusing is deliberate: a clamped column is walkable
   * and reported; a refused one is a hole.
   */
  GROUND_CLEARANCE_VIOLATED: "LOAM-W493",
  /**
   * A ground-contract invariant: a level outside the world range, a `fluidTop`
   * below its ground, a duplicate column within one intent, a `preserve` on an
   * unowned column, a precedence tie. **A compiler bug**, in the class of
   * `CAVE_FLUID_BREACH`: no legal document can produce it, and the caller aborts
   * loudly rather than feeding it back to an author.
   */
  GROUND_INVARIANT: "LOAM-E494",
  /** Once per compile, summarising the transitions built and the requests overridden. */
  GROUND_TRANSITION: "LOAM-I495",
  /**
   * A site-planned quarter (`docs/SITE-PLAN-v0.md` §6.3) whose composition
   * missed a gate on every rung of the replan ladder.
   *
   * A note rather than a warning: the ladder has already replanned the quarter
   * smaller and shipped the best composition it found, so the world is drawn
   * and walkable; what the author is being told is that this footprint on this
   * slope is more engineering than town, and which measurement says so.
   */
  SITE_COMPOSITION: "LOAM-I496",
  /**
   * A site-planned quarter reported a transition its own plan makes
   * unrepresentable (`docs/SITE-PLAN-v0.md` §5.5).
   *
   * Today that is `walkBack`'s `offPlatform`: a seam whose upper platform is
   * narrower than the road running on it, so there is no ground of the
   * platform's own for a wall to stand on. §3.4 rule 2 refuses to claim such a
   * station in the first place, so a non-zero count is a **compiler bug**, and
   * an error rather than a warning for the reason `docs/DESIGN.md` records about
   * the physics lint: it proves a world is well-formed, not that it is any good,
   * and 395 columns of a planning failure once shipped green. The planner's
   * guarantee is checkable, so it is checked.
   */
  SITE_PLAN_FAILED: "LOAM-E497",
  /**
   * A district named an urban form that is an **alias** of another
   * (`docs/SITE-PLAN-v0.md` §7.1) — today `terraced`, which draws `hillside`.
   *
   * Informational, and never suppressible: the reach law says a document that
   * names a retired form keeps compiling, and the other half of that bargain is
   * that the substitution is stated. The author is told what was written, what
   * was drawn, and what to write instead.
   */
  DISTRICT_FORM_ALIAS: "LOAM-I498",
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

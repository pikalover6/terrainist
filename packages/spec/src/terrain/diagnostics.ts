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
   * A wall's requested `margin` pushed the offset ring outside the world
   * region, and the ring was stepped in (two columns at a time, floor
   * `WALL_MIN_MARGIN`) until it fit — the circuit built at the reduced margin.
   *
   * The same shape as `PROP_RESEATED`: the author's parameter is advice, the
   * icon is the thing. A walled city with a slightly tighter ring beats an
   * unwalled one every time a stranger looks at it (Troy c5, 2026-08-11, was
   * the measured case: `params.walls` on a settlement grown to the region
   * edge, and the old answer was silently no wall at all).
   */
  WALL_MARGIN_REDUCED: "LOAM-T229",
  /**
   * The wall's ring met the world-region edge and flattened along it (the
   * bounds fold into the course's support fan as four more half-planes), so
   * the circuit stayed CLOSED where the old answer was no wall at all.
   * Buildings standing on the flattened stretch read as houses built into the
   * wall. Ratified 2026-08-11; Troy c5 — a city grown flush to z −256 — was
   * the measured case.
   */
  WALL_COURSE_CLAMPED: "LOAM-T230",

  // --- the infrastructure host (`docs/INFRA-ENTRIES-v0.md` §3.7) -----------
  // Four codes, continuing from LOAM-T230. Per §13.6's precedent none of them
  // enters `FEEDBACK_CODES` initially: `BIOME_CLAMPED`'s history is that a code
  // firing on every world costs money in the authoring loop and buys an
  // invented change.
  /**
   * `infra.entry@0` — the node's params do not name a buildable entry: an
   * unknown `entry`, a `route` that is not one of the closed forms, or a form
   * the named entry does not accept.
   *
   * An error rather than a clamp, and it names the legal values *and* the
   * near-misses: an entry id is a closed vocabulary, and "unknown entry" with
   * no list is the diagnostic an author can do least with.
   */
  INFRA_ENTRY_PARAM: "LOAM-T231",
  /**
   * `infra.entry@0` — the route resolved shorter than the entry's `minRun`.
   *
   * The `WALL_COURSE_EMPTY` analogue, one scale down: the anchor was found and
   * the derivation ran, and what came back is too short to be the thing the
   * author asked for. A fence of six columns is not a cordon.
   */
  INFRA_ROUTE_EMPTY: "LOAM-T232",
  /**
   * `infra.entry@0` — the named anchor is absent, unplaced, or not linear.
   *
   * The loud version of the mistake the linework kit already warns about
   * ("pointing `along` at a building buys you nothing"): a route is named
   * relative to something the compiler placed, so a name that resolves to
   * nothing is a route that cannot exist.
   */
  INFRA_ROUTE_UNANCHORED: "LOAM-T233",
  /**
   * `infra.entry@0` — the run built, and lost more than a stated fraction of
   * its columns to collision or unbuildable ground.
   *
   * So an author *reads* "a fence full of holes" rather than walking into one.
   * A note, not a warning: the entry is built, and the honest recovery is
   * reported the way `WALL_MARGIN_REDUCED` reports its own.
   */
  INFRA_RUN_REFUSED: "LOAM-T234",

  // --- the linework declaration slot (GROUND-CONTRACT §13.2c) --------------
  // Two codes, continuing from LOAM-T234, and neither enters `FEEDBACK_CODES`
  // for the reason the four above it do not: a code that fires on every world
  // costs money in the authoring loop and buys an invented change (§13.6).
  //
  // The resolver's `LOAM-W49x` family already does the *arbitration* half — a
  // bed that loses columns to rank 0/10/20 is `GROUND_CLAIM_ADJUSTED`, below
  // `minColumns` it is `GROUND_CLAIM_REFUSED`, a guarded loss is
  // `GROUND_CONFLICT`. These two carry the half the resolver cannot see,
  // because it is about the **crossing subtraction** and happens before
  // anything is declared.
  /**
   * `structure.linework` — the bed kept fewer than `minColumns` columns after
   * the crossing subtraction, so **no bed is declared at all** and the run is
   * built on the ground it finds.
   *
   * The message names the count and which of the two subtractions took them —
   * carriageway or water — because "my viaduct has no approach" and "my viaduct
   * is in a river" are different news.
   */
  LINEWORK_BED_REFUSED: "LOAM-T235",
  /**
   * `structure.linework` — the bed was declared, and the crossing subtraction
   * cut it into more than one run or removed more than
   * `INFRA_REFUSAL_FRACTION` of its columns.
   *
   * A note, not a warning: the entry is built, and the honest recovery is
   * reported the way `WALL_MARGIN_REDUCED` and `INFRA_RUN_REFUSED` report
   * theirs.
   */
  LINEWORK_BED_INTERRUPTED: "LOAM-T236",
  /**
   * The frontage tie (`docs/GROUND-UNIFICATION-v0.md` F8): the surfacer's final
   * level for a segment departs from the datum it was handed by ≥ 1 block at ≥ 1
   * station. Names the count and the maximum.
   *
   * The one legal cause is the per-station water floor, which the datum cannot
   * apply because `routeFloorAt` needs a `fluidTop` that does not exist at
   * layout time (F3 step 4). The same lift is Part III's berm, so this finding
   * and that one are the same measurement seen from two sides.
   *
   * A note: the world is correct either way — a street that rose out of the
   * water is a street doing the right thing. It is reported because a *large*
   * drift means the datum and the surfacer have become two graders, which is
   * exactly the defect F2 exists to prevent.
   */
  FRONTAGE_TIE_DRIFT: "LOAM-T237",
  /**
   * A district's lots were seated with no datum in reach — the fabric drew a
   * street the datum could not grade, or the lots front the district boundary.
   *
   * F6 ("no frontage, no tie") makes an untied lot a legal outcome: it keeps
   * exactly the seat it had before the tie existed. So this is a note and never
   * a warning. It earns its code because a district where *every* lot is untied
   * is the fabric and the grader disagreeing about where the streets are, and
   * that is invisible in a world that otherwise looks merely old.
   */
  FRONTAGE_UNTIED: "LOAM-T238",
  /**
   * The road berm cap bound (`docs/GROUND-UNIFICATION-v0.md` §3.1, W1): a
   * route's per-station water floor asked to stand more than `ROAD_BERM_MAX`
   * above that station's own natural ground, and was clamped to it before
   * `gradeProfile`'s unit-cone envelope could propagate the lift. Names the
   * route and the station count, and the height it wanted.
   *
   * A note, never a warning: the clamp is the *correct* answer — the rim floor
   * exists to cancel a cut, not to licence a fill — and the world is right
   * either way. It earns a code because it is the measurement 10C's viaduct
   * promotion is waiting on: a run that repeatedly wants to stand well above
   * its own ground is a span, not a street.
   */
  ROAD_BERM_CLAMPED: "LOAM-T239",
  /**
   * A block was deeper than two rows of frontage reach across, and an alley was
   * cut through it.
   *
   * `subdivide` cuts **rim** frontage — one lot depth against each side that has
   * a street behind it — so a block whose short axis is past
   * `2 · LOT_DEPTH + MIN_COURT_SIDE` keeps a core that is not a courtyard but a
   * field: land inside the fabric that no lot can ever be cut from. The forms
   * that split a domain (`grown`) bound a leaf's *long* axis and say nothing
   * about this, so the compiler adds the street the fabric did not: a `lane`
   * through the block's middle, connected at both ends, carrying a real segment
   * id so the lots it creates front something.
   *
   * A note: the repair is the intended one and it changes nothing the author
   * wrote. It is reported because an alley the document did not ask for *is* a
   * street in the finished world, and because the count is the measurement that
   * says a quarter's `blockSize` and its form are pulling against each other.
   */
  DISTRICT_BLOCK_ALLEY: "LOAM-T240",
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
  /**
   * An instance standing in water wrote fluid above that water's own surface,
   * and the compiler dropped it.
   *
   * The walked defect: a sea monster in a raised rectangle of ocean, three
   * blocks proud of the bay, with falling-edge faces. A `wade` seat puts
   * node-local `y = 0` on the **seabed**, so a program that models its own sea
   * has no way to know where the real surface is — the compiler holds the line
   * the program cannot see.
   */
  PROGRAM_WATER_CLAMPED: "LOAM-W339",
  /**
   * The program wrote the same sole on every column of at least one member of
   * the terrain suite: it is a prefab, not a thing that stands on ground.
   *
   * `docs/GROUND-UNIFICATION-v0.md` §2.5 — and this is **never a failure**. It
   * is a routing decision: the program is seated `pad` and built exactly as it
   * is today. Gate leniency is permanent, and a beautiful non-conforming
   * structure is precisely the case leniency exists to protect. What the
   * warning buys is a change the author can actually make, which is why it is
   * the one code whose purpose is to teach the authoring model something.
   */
  PROGRAM_DID_NOT_CONFORM: "LOAM-W340",
  /**
   * This instance stands on a platform because its program did not conform.
   *
   * `docs/GROUND-UNIFICATION-v0.md` §2.5 — the compile-report half of
   * {@link PROGRAM_DID_NOT_CONFORM}. A note, never a failure: "this thing is on
   * a plinth because the program that wrote it writes the same sole on every
   * column" is the sentence a walker needs and cannot otherwise get.
   */
  PROGRAM_SEATED_PAD: "LOAM-T341",
  /**
   * What a conforming instance left for the compiler: how many of its occupied
   * columns the skirt underpinned, and how many are buried in the hill.
   *
   * `docs/GROUND-UNIFICATION-v0.md` §2.8 — the measurement §2.9's carve is
   * gated on. It has to exist before the carve is built, because building an
   * earthwork around a hut before knowing how much burial survives site
   * preference and the program's own answer is inventing one.
   */
  PROGRAM_CONFORM_RESIDUAL: "LOAM-T342",

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
  /**
   * **The served seam** (`docs/GROUND-UNIFICATION-v0.md` §4.1 S1) — once per
   * quarter, what every seam *became*: walls, tier stacks (revetted or
   * terraced), banks, kerbs, and the seams a building already stood on.
   *
   * The reversal `LOAM-W411` needed. Fifty-six warnings saying "we did the other
   * thing" is a report nobody can act on; one note saying "12 walls, 6 stacks,
   * 3 banks, 41 absorbed" is. It is a note and enters no feedback set for the
   * `BIOME_CLAMPED` reason: it fires on every stepped quarter, and a code that
   * fires on every world costs money in the authoring loop and buys an invented
   * change (§13.6).
   *
   * Silent until the tier stack is switched on: while `SEAM_TIERS` is false the
   * seam accounting is the same accounting `LOAM-W411` reports, so saying it
   * twice would only move report bytes. `LOAM-W411` is retired when the flag
   * flips, not before — the warning and the note never both describe one seam.
   */
  SEAM_SERVED: "LOAM-I412",
  /**
   * A seam whose chosen treatment could not be **placed** — a street, a
   * footprint or water owns every column it would have used
   * (`docs/GROUND-UNIFICATION-v0.md` §4.1 S1).
   *
   * The only honest refusal left once every drop has an answer. A warning rather
   * than a note precisely because it is rare: under S1 a seam leaves the pass
   * with a built treatment, so a seam that did not is news.
   */
  SEAM_UNSERVED: "LOAM-W413",
  /**
   * **S9's derived flights** (`docs/GROUND-UNIFICATION-v0.md` §4.1 S9): how many
   * stairs were cut through a quarter's served seams, and how many stacks the
   * `MAX_DERIVED_STAIRS` cap refused one.
   *
   * `docs/COURTYARDS-AND-LEVELS-v0.md` §3.5 step 2, built at last — the step
   * that has never existed, which is why nothing has ever guaranteed that a
   * platform is reachable and why a walkthrough found 46 doorstep flights
   * climbing a bank to doors the bank made unreachable (§4.0a M7).
   *
   * A note and in no feedback set: a flight refused by the cap is a level
   * election that stepped more times than its ground can carry, and S6's
   * dissolve is the mechanism that answers that — not a re-authoring.
   */
  SEAM_STAIR_CUT: "LOAM-I414",
  /**
   * **S11's measurement, and it moves nothing.** A fortification course or an
   * `infra.entry` ring whose fill stands as a face across a platform boundary:
   * `structures/walls.ts` sweeps its own 1-Lipschitz datum and fills each column
   * down to ground, so where a circuit crosses a level change the wall material
   * *is* the face — the eight sheer faces of drop 14 the Troy audit attributed
   * to walls (§4.1 S11).
   *
   * Names how many crossings and the deepest one. Promoting a circuit's crossing
   * to a tier stack is a real feature and is deliberately **not** built on this
   * measurement's evidence: §10.8 decides it on the walk with the number in
   * hand, exactly as WP-10C does for viaduct promotion. Measured, not moved.
   */
  WALL_COURSE_CROSSES_SEAM: "LOAM-I415",

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
  /**
   * `character.archetypes.forbid` emptied a quarter's whole mix.
   *
   * The bias row falls back to the mix the quarter was about to use rather than
   * to no buildings: a forbid list that names everything is an author mistake,
   * and an empty quarter is a worse answer to it than a stated one.
   */
  INTENT_ARCHETYPE_MIX_EMPTY: "LOAM-W515",
  /**
   * `character.formPacks` names a pack the `FORM_PACKS` registry does not
   * carry. One aggregated warning per scope naming the legal packs and the near
   * matches; the unknown words are ignored and never fatal.
   */
  INTENT_FORM_PACK_UNKNOWN: "LOAM-W516",
  /**
   * A scope names a form pack whose eras do not include the scope's resolved
   * era class.
   *
   * **Advice, and it can never be an error.** A modern Hellenist city is
   * exactly the legal case — era `modern` plus `classical_mediterranean` is the
   * *point* of that prompt — so this names both and builds the pack anyway.
   */
  INTENT_FORM_PACK_ERA: "LOAM-W517",

  // --- the bespoke tier's facing (spec v0.2 amendment 2026-08-14) -----------
  /**
   * A bespoke invocation's `face` relation names a target nothing in the
   * document places — an id no node carries, a tag no node wears, or a node the
   * solver dropped.
   *
   * **Never fatal.** A facing hint is the one thing in a document that can be
   * wrong without anything being missing: the instance still stands, the
   * default rule (the road it connects to, else the settlement centre) still
   * points it somewhere sensible, and the author is told which way it went.
   */
  PROGRAM_FACE_UNRESOLVED: "LOAM-W518",
  /**
   * A constraint on a bespoke invocation that the compiler cannot act on.
   *
   * Two shapes, one code, because they are the same author mistake — a
   * constraint written where placement is not decided by constraints:
   *
   * - **A `facing` constraint on a landmark.** A bespoke instance's yaw is not
   *   the solver's to pick (its box is reserved already turned), so a `facing`
   *   here can never turn anything; the ratified spelling is
   *   `params.face: { "toward": "<node>" }` (LOAM-SPEC §15.1). Left scored it
   *   would be worse than useless: with the yaw frozen the only way to satisfy
   *   it is to *move* the landmark, which is how a colossus ends up on the
   *   wrong island.
   * - **Anything but `zone`/`at` in the terrain profile**, which has no layout
   *   solver at all: the two coarse hints are read (they steer the landmark's
   *   ground search) and everything else is parsed and dropped.
   *
   * **Never fatal.** The instance still stands; the author is told which part
   * of what they wrote did nothing.
   */
  LANDMARK_CONSTRAINT_IGNORED: "LOAM-W519",
  /**
   * A landmark's coarse `at`/`zone` target was refused by the *building* slope
   * veto, and the landmark was seated on it anyway.
   *
   * A bespoke landmark is not a building: it is padded like one and its site is
   * levelled, and the terrain profile's own landmark placer refuses cliffs
   * rather than slopes. So when an author points a colossus at a bluff they
   * raised for it, the honest answer is the bluff — the alternative the solver
   * used to take was the cheapest *flat* ground in the region, which can be
   * three hundred blocks and one island away, with nothing said about it.
   */
  LANDMARK_COARSE_SEATED: "LOAM-W520",
  /**
   * A landmark finished outside the coarse `at`/`zone` target it declared,
   * because a site there cost more than one somewhere else.
   *
   * `W520`'s quiet sibling: there the target was *refused* and taken anyway,
   * here it was merely outbid, and a soft cost that loses leaves no trace. The
   * walked defect was two rival landmarks — one per faction, one per island —
   * standing on the same island with nothing said about it.
   */
  LANDMARK_COARSE_ABANDONED: "LOAM-W521",
  /**
   * A landmark's facing was measured again after the solve, because the site it
   * was measured *from* is not the site it ended up on.
   *
   * A quarter turn has to be known before the fit (it swaps the envelope's
   * width and depth), so the first answer is taken against the best estimate
   * available then — the coarse `zone`/`at` hint. That estimate is a soft cost
   * the ground can outbid (`W521`), and when it loses the landmark can finish
   * on the *other side* of the thing it was told to face: the walked defect was
   * a wading leviathan that asked to face the city and, having been moved four
   * hundred blocks past it, faced the open sea.
   *
   * So the answer is re-measured from the real site — and adopted only when the
   * new turn reserves the same footprint the solver already gave it (a 180°
   * flip always does; every turn does for a square envelope). A turn that would
   * change the footprint is refused and the pre-solve answer stands, because
   * the hole in the ground is already the shape it is.
   *
   * **Never fatal.** Informational: the instance stands where it stood and
   * points at what it was told to point at.
   */
  PROGRAM_FACE_REMEASURED: "LOAM-W522",
  /**
   * A relational constraint names a target that resolves to **nothing at all**,
   * and was therefore never evaluated against anything.
   *
   * The solver's costing loop has a legitimate "target not placed *yet*" state:
   * a sibling scored before its neighbour exists contributes no cost, and the
   * local-improvement pass scores it in full once every sibling has a position.
   * That branch used to swallow a second, entirely different case — a selector
   * that matches **no node the solver knows about** — and report the constraint
   * `satisfied: true` in the layout report. The walked defect was a Trojan horse
   * told to stand 14..42 blocks from `priams_megaron` and standing ~200 away:
   * `priams_megaron` is a *district child*, placed by the city pass after the
   * root solve, so the root solver's node list has never heard of it. The same
   * unresolved id on `face` is loud (`W518`); on `distance` it was silent.
   *
   * **A district's children cannot be targeted from a root-level node.** Bind to
   * the district itself.
   *
   * **Never fatal, and it changes no placement.** The constraint is reported
   * unresolved instead of satisfied and the world is exactly the world that was
   * being built before; enforcement is future design work.
   */
  CONSTRAINT_TARGET_UNRESOLVED: "LOAM-W523",
  /**
   * A settlement envelope was seated on ground that is mostly **not land**.
   *
   * The walked defect (Kai, `modern_hellenist_invasion`): the document asked
   * for "a grand coastal metropolis with a wide harbour", authored a full
   * `city` node with a 340 × 240 envelope — and authored a heightfield that
   * left 7% of the region above sea level. The world ships as open ocean with
   * two islets and three buildings on them.
   *
   * Nothing in the compile said so, and the reason is precise:
   * `groundFeasible` reads a ground-scale footprint's **median**, so an
   * envelope that is nine-tenths sea is feasible as long as its middle column
   * is dry. No candidate is vetoed, no rung of the ladder is climbed, `E406`
   * never fires, and the city is "placed" over water. The measurement this
   * code carries — buildable columns inside the envelope, against the columns
   * the envelope asked for — is the only one that can tell that world from a
   * city on a plain.
   *
   * **Never fatal**, and it changes no block: gate leniency is permanent
   * (LOAM-SPEC §15.2) and a deliberate hamlet on a rock is a legal world. It
   * is in the authoring feedback set instead, because the repair is one the
   * *document* can make and the model will not guess it: the landmass is
   * written before the settlement and sized to it.
   */
  SETTLEMENT_LAND_SHORT: "LOAM-W526",
  /**
   * A **walled** quarter whose blocks are mostly empty ground.
   *
   * The sibling of {@link SETTLEMENT_LAND_SHORT}, one scale in: that code
   * catches an envelope seated on water, this one catches an envelope that is
   * dry, subdivided, walled — and still not a town. The walked defect (Kai,
   * `trojan_horse_in_troy`, twice): a `grown` × `medium` quarter whose leaf
   * blocks came out up to 1.8 · `blockSize` across, so `subdivide` cut rim
   * frontage strips one `LOT_DEPTH` deep and left a core half the block wide
   * that was never even a lot. Built ground came to 0.34 of the block land
   * against 0.61 in a walked-good grid quarter — the wall enclosed a field.
   *
   * Measured only where the measurement means something: a quarter that
   * declared `params.walls`, or whose intent named
   * `character.fortification: "walled"`. A wall is a claim that what is inside
   * it is dense; an unwalled hamlet at the same coverage is a hamlet.
   *
   * **Report-only** and never fatal — gate leniency is permanent
   * (LOAM-SPEC §15.2), and a deliberate citadel around a parade ground is a
   * legal world. It earns a code because "the walls are up and there is nothing
   * behind them" is invisible in every other statistic the report carries and
   * cost two walks to find.
   */
  WALLED_QUARTER_SPARSE: "LOAM-W527",
  /**
   * A wall run crossed ground low enough that its footing became the structure.
   *
   * A curtain column extrudes its footing straight down to the ground, up to
   * {@link WALL_MAX_FILL} courses, and anything under that cap is built in
   * silence. Across a dip that reads as a **dam**: the walked defect was a
   * 5-wide pier standing 12-15 courses proud of the valley floor, sheer on both
   * faces, with nothing in the report between "built" and "refused".
   *
   * Informational, and it changes nothing: the wall is the wall it was. It names
   * the run, its length, and the mean and maximum footing so the number is on
   * the page before somebody walks it.
   */
  WALL_FOOTING_DEEP: "LOAM-I524",
  /**
   * `ground.cliff` was overridden to a **worked** material, and the cliff class
   * covers a lot of ground nowhere near anything the document builds.
   *
   * `ground.cliff` is a *world* palette, not a settlement palette: it paints
   * every natural slope past the classifier's cliff threshold anywhere in the
   * region. The walked defect was a city's sandstone-and-terracotta masonry
   * applied to 3,701 columns of a wooded ridge 60-100 blocks away — a mountain
   * dressed in city stone.
   *
   * Informational; no block changes. Only worked materials fire it (a stone,
   * deepslate or tuff cliff is what the default already is), and only when the
   * painted columns are far from every placement footprint.
   */
  CLIFF_PALETTE_REGIONAL: "LOAM-I525",

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

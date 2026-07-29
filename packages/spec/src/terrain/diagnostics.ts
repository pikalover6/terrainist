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

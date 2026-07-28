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

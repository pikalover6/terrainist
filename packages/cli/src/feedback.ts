/**
 * Turning a compile report into something worth sending back to the author.
 *
 * A compile produces three very different kinds of finding, and conflating
 * them is how a feedback loop turns into a spend loop:
 *
 * 1. **Author-actionable.** The document asks for something the compiler can
 *    describe but not deliver: a basin whose rim never closes (`LOAM-T105`), a
 *    river with no sea to reach (`LOAM-T112`), a cove aimed away from the coast
 *    the seed produced (`LOAM-T113`), a building the road network
 *    cannot get to (`LOAM-T209`), a city envelope that turned out to be mostly
 *    open water (`LOAM-W526`), and every rung of the solver's relaxation
 *    ladder — a demoted constraint, a dropped node, an unsatisfiable set. Each
 *    of these has a fix hint written for exactly this purpose. These go back.
 * 2. **Informational.** `LOAM-T208` says the road network is routed after
 *    placement, and its own fix hint says "nothing to change". Sending it back
 *    invites the model to invent a change that cannot help. These stay here.
 * 3. **Ours.** `LOAM-T110` (fluid that would flow) and `LOAM-T111` (a tree with
 *    no ground under it) are physics-lint failures. No legal document should be
 *    able to produce them; if one does, the compiler has a bug and no amount of
 *    re-prompting will fix it. {@link physicsLintFailures} finds them and the
 *    caller aborts loudly.
 */

import type { LoamDiagnostic, TerrainCompileReport } from "@terrainist/compiler";
import { formatDiagnostic } from "@terrainist/compiler";

/** Codes that describe something the *document* should change. */
export const FEEDBACK_CODES: readonly string[] = [
  "LOAM-T105", // BASIN_RIM_NOT_CLOSED
  "LOAM-T112", // RIVER_PONDED
  "LOAM-T113", // CARVE_DRY
  "LOAM-T118", // SCATTER_RADIUS_UNITS  — the blocks/fraction trap
  "LOAM-T119", // SCATTER_EMPTY         — a wood with no trees in it
  "LOAM-T209", // ROAD_UNROUTABLE
  "LOAM-E170", // CANNOT_FIT
  "LOAM-E165", // COARSE_DOMAIN_EMPTY
  "LOAM-E404", // CONSTRAINT_DEMOTED   — ladder rung 5
  "LOAM-E405", // NODE_DROPPED         — ladder rung 6
  "LOAM-E406", // UNSATISFIABLE        — ladder rung 7
  // A landmark's constraint that did nothing — a `facing` where `params.face`
  // was meant, or anything relational in a profile with no solver. Purely a
  // document fix, and the one an authoring model gets wrong by improvising the
  // syntax, so it is worth the revision round.
  "LOAM-W519", // LANDMARK_CONSTRAINT_IGNORED
  // A settlement envelope seated on ground that is mostly not land. The whole
  // reason this code exists is this list: it is never fatal (leniency is
  // permanent — a hamlet on a rock is a legal world), it changes no block, and
  // the only thing it can accomplish is telling the author to write the
  // landmass before the city and size it to the city. Outside the feedback set
  // it accomplishes nothing at all.
  "LOAM-W526", // SETTLEMENT_LAND_SHORT
  // A walled quarter that built under half the land inside its streets: the
  // circuit reads as a fence round a meadow. It changes no block and is never
  // fatal; its fix hint names the form (the Stocktake Run's F31: a walled
  // city drawn with the village-scale `hillside` form fired this in the final
  // compile of every round and the author never heard it).
  "LOAM-W527", // WALLED_QUARTER_SPARSE
];

/** Codes that mean the compiler misbehaved, not the document. */
export const PHYSICS_LINT_CODES: readonly string[] = [
  "LOAM-T110", // UNSTABLE_FLUID
  "LOAM-T111", // FLOATING_VEGETATION
];

/** The physics-lint diagnostics among `diagnostics`. Non-empty means: our bug. */
export function physicsLintFailures(
  diagnostics: readonly LoamDiagnostic[],
): readonly LoamDiagnostic[] {
  return diagnostics.filter((d) => PHYSICS_LINT_CODES.includes(d.code));
}

/** The diagnostics worth sending back to the author. */
export function feedbackDiagnostics(
  diagnostics: readonly LoamDiagnostic[],
): readonly LoamDiagnostic[] {
  return diagnostics.filter(
    (d) =>
      !PHYSICS_LINT_CODES.includes(d.code) &&
      (d.severity === "error" || FEEDBACK_CODES.includes(d.code)),
  );
}

/**
 * Render a compile report as a feedback turn, or `undefined` when it is clean.
 *
 * The diagnostics go in verbatim — `formatDiagnostic` output, fix hint and all —
 * followed by the solver-report lines that explain *why* a placement went the
 * way it did. Those lines are the difference between "the smithy was dropped"
 * and "the smithy was dropped, and here are the two constraints that fought".
 */
export function renderCompileFeedback(report: TerrainCompileReport): string | undefined {
  const diagnostics = feedbackDiagnostics(report.diagnostics);
  const solver = solverReportLines(report);
  if (diagnostics.length === 0 && solver.length === 0) return undefined;

  const lines: string[] = [];
  if (diagnostics.length > 0) {
    lines.push(
      `The compiler reported ${diagnostics.length} problem(s) with the compiled world:`,
      "",
      ...diagnostics.map(formatDiagnostic),
    );
  }
  if (solver.length > 0) {
    lines.push("", "Layout solver report:", "", ...solver);
  }
  return lines.join("\n");
}

/** Render the diagnostics of a *failed* compile as a feedback turn. */
export function renderDiagnosticFeedback(
  diagnostics: readonly LoamDiagnostic[],
): string | undefined {
  const wanted = feedbackDiagnostics(diagnostics);
  if (wanted.length === 0) return undefined;
  return [
    `The document failed to compile — ${wanted.length} problem(s):`,
    "",
    ...wanted.map(formatDiagnostic),
  ].join("\n");
}

/**
 * The solver-report lines relevant to a revision.
 *
 * Only nodes the ladder actually touched: a node placed with `absorbed` (every
 * constraint satisfied as written) says nothing a reviser needs to hear.
 */
export function solverReportLines(report: TerrainCompileReport): readonly string[] {
  const layout = report.layout;
  if (layout === undefined) return [];
  const out: string[] = [];

  if (layout.report.dropped.length > 0) {
    out.push(`  dropped: ${layout.report.dropped.join(", ")}`);
  }
  for (const node of layout.report.nodes) {
    const rungs = node.appliedRungs.filter((r) => r !== "absorbed");
    if (rungs.length === 0) continue;
    out.push(
      `  ${node.nodePath}: ${node.placed ? "placed" : "not placed"}` +
        ` after ${rungs.join(", ")} (${node.candidatesConsidered} candidates considered)`,
    );
    for (const c of node.constraints) {
      if (c.satisfied) continue;
      out.push(
        `    unsatisfied ${c.type} constraint [${c.index}]` +
          ` (declared ${c.declaredStrength}, now ${c.effectiveStrength},` +
          ` weight ${c.weight}, cost ${c.cost.toFixed(2)})`,
      );
    }
  }
  return out;
}

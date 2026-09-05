/**
 * Which compile findings go back to the author, and how they are rendered.
 *
 * The selection rule is the load-bearing part: send back what the document can
 * change, keep the informational notes, and never send back a physics-lint
 * failure — that one is ours. The policy lives in `@terrainist/spec`; this
 * suite pins that the CLI delegates to it and that the pinned cases still hold.
 */

import { describe, expect, it } from "vitest";

import type { LoamDiagnostic, TerrainCompileReport } from "@terrainist/compiler";

import {
  feedbackDiagnostics,
  physicsLintFailures,
  renderCompileFeedback,
  renderDiagnosticFeedback,
  solverReportLines
} from "../src/feedback.js";
import {
  DIAGNOSTIC_METADATA,
  FEEDBACK_CODES,
  PHYSICS_LINT_CODES,
  isFeedbackCode,
  isFeedbackDiagnostic,
  isPhysicsLint
} from "@terrainist/spec";

function diag(
  code: string,
  name: string,
  severity: LoamDiagnostic["severity"] = "warning",
): LoamDiagnostic {
  return { code, name, severity, nodePath: `world.${name.toLowerCase()}`, message: `${name} happened`, fix: `fix ${name}` };
}

const T105 = diag("LOAM-T105", "BASIN_RIM_NOT_CLOSED");
const T209 = diag("LOAM-T209", "ROAD_UNROUTABLE");
const T208 = diag("LOAM-T208", "GENERATOR_NOT_IMPLEMENTED", "note");
const T212 = diag("LOAM-T212", "LIFE_PASS_EMPTY", "note");
const T110 = diag("LOAM-T110", "UNSTABLE_FLUID", "error");
const T111 = diag("LOAM-T111", "FLOATING_VEGETATION", "error");
const E405 = diag("LOAM-E405", "NODE_DROPPED");
const W407 = diag("LOAM-W407", "CONSTRAINT_NOT_IMPLEMENTED");
const BAD = diag("LOAM-T104", "PARAM_OUT_OF_RANGE", "error");
/** A warning the author *must* act on: the city seated on open water. */
const W526 = diag("LOAM-W526", "SETTLEMENT_LAND_SHORT");
/** A note the author *can* act on: the cove that missed the coast. */
const T113 = diag("LOAM-T113", "CARVE_DRY", "note");
/** Requested authored-program instances that the Compiler could not place. */
const W337 = diag("LOAM-W337", "PROGRAM_DROPPED");
/** A deliberate bounded canopy erased by settlement clearing. */
const T120 = diag("LOAM-T120", "FOREST_SETTLEMENT_SUPPRESSED");

/** A report carrying `diagnostics` and, optionally, a solver outcome. */
function report(
  diagnostics: readonly LoamDiagnostic[],
  layout?: TerrainCompileReport["layout"],
): TerrainCompileReport {
  return {
    name: "test",
    worldSeed: "1",
    markers: [],
    stats: {} as TerrainCompileReport["stats"],
    diagnostics,
    timings: {} as TerrainCompileReport["timings"],
    emit: {} as TerrainCompileReport["emit"],
    ...(layout === undefined ? {} : { layout })
  };
}

describe("physicsLintFailures", () => {
  it("finds unstable fluid and floating vegetation, and nothing else — via the canonical spec source", () => {
    const input = [T105, T110, T111, BAD];
    // CLI delegates to the spec predicate; the spec is the single source
    expect(physicsLintFailures(input).map((d) => d.code)).toEqual(input.filter((d) => isPhysicsLint(d.code)).map((d) => d.code));
    expect(physicsLintFailures(input).map((d) => d.code)).toEqual([...PHYSICS_LINT_CODES].filter((code) => input.some((d) => d.code === code)));
    // Pin the canonical physics-lint codes themselves (one spec source)
    expect([...PHYSICS_LINT_CODES]).toEqual(["LOAM-T110", "LOAM-T111"]);
    expect(isPhysicsLint("LOAM-T110")).toBe(true);
    expect(isPhysicsLint("LOAM-T111")).toBe(true);
    expect(isPhysicsLint("LOAM-T105")).toBe(false);
    expect(DIAGNOSTIC_METADATA.UNSTABLE_FLUID.physicsLint).toBe(true);
    expect(DIAGNOSTIC_METADATA.FLOATING_VEGETATION.physicsLint).toBe(true);
    expect(physicsLintFailures([T105, T208])).toEqual([]);
  });
});

describe("feedbackDiagnostics", () => {
  it("selects the author-actionable findings — matching the canonical feedback predicate", () => {
    const input = [T105, T209, E405];
    expect(feedbackDiagnostics(input).map((d) => d.code)).toEqual([
      "LOAM-T105",
      "LOAM-T209",
      "LOAM-E405"
    ]);
    // Canonical behavior: CLI delegates to spec's isFeedbackDiagnostic
    expect(feedbackDiagnostics(input).map((d) => d.code)).toEqual(input.filter(isFeedbackDiagnostic).map((d) => d.code));
    expect(isFeedbackCode("LOAM-T105")).toBe(true);
    expect(isFeedbackCode("LOAM-T209")).toBe(true);
    expect(DIAGNOSTIC_METADATA.BASIN_RIM_NOT_CLOSED.feedback).toBe(true);
  });

  it("keeps every error — canonical error inclusion", () => {
    expect(feedbackDiagnostics([BAD]).map((d) => d.code)).toEqual(["LOAM-T104"]);
    expect(isFeedbackDiagnostic(BAD)).toBe(true);
    expect(feedbackDiagnostics([BAD]).map((d) => d.code)).toEqual([BAD].filter(isFeedbackDiagnostic).map((d) => d.code));
  });

  it("drops the informational notes and the advisory warnings", () => {
    expect(feedbackDiagnostics([T208, W407])).toEqual([]);
    expect(isFeedbackDiagnostic(T208)).toBe(false);
    expect(isFeedbackDiagnostic(W407)).toBe(false);
    expect(DIAGNOSTIC_METADATA.GENERATOR_NOT_IMPLEMENTED.feedback).toBe(false);
  });

  it("keeps a compiler-ordering note out of the loop the model pays for", () => {
    // The life pass first reported "planted nothing" as LOAM-E170, which is in
    // FEEDBACK_CODES by code regardless of severity — so every small world sent
    // the model two revision rounds asking it to fix a pass-ordering defect no
    // document edit can reach. Its own code is the fix; this guards the seam.
    expect(feedbackDiagnostics([T212])).toEqual([]);
    expect(isFeedbackDiagnostic(T212)).toBe(false);
    expect(DIAGNOSTIC_METADATA.LIFE_PASS_EMPTY.feedback).toBe(false);
  });

  it("sends the dry-carve note back even though it is only a note", () => {
    // Severity says "the compiler recovered"; the code says "only the document
    // can fix this". For LOAM-T112/T113 the code wins — a cove that compiled dry
    // is precisely what a revision round exists to repair.
    expect(feedbackDiagnostics([T113]).map((d) => d.code)).toEqual(["LOAM-T113"]);
    expect(isFeedbackDiagnostic(T113)).toBe(true);
    expect(isFeedbackCode("LOAM-T113")).toBe(true);
    expect(DIAGNOSTIC_METADATA.CARVE_DRY.feedback).toBe(true);
    expect(renderCompileFeedback(report([T113])) ?? "").toContain("CARVE_DRY");
  });

  it("sends the walled-quarter warning back (F31: a fenced meadow is the document's to fix)", () => {
    const W527 = diag("LOAM-W527", "WALLED_QUARTER_SPARSE");
    expect(feedbackDiagnostics([W527]).map((d) => d.code)).toEqual(["LOAM-W527"]);
    expect(isFeedbackDiagnostic(W527)).toBe(true);
    expect(DIAGNOSTIC_METADATA.WALLED_QUARTER_SPARSE.feedback).toBe(true);
    expect(renderCompileFeedback(report([W527])) ?? "").toContain("WALLED_QUARTER_SPARSE");
  });

  it("sends the land budget back — the whole reason that code exists", () => {
    // LOAM-W526 is never fatal (leniency is permanent) and changes no block, so
    // outside this set it would accomplish nothing at all: the walked failure is
    // a metropolis authored over open ocean, and only the *document* can raise
    // the land. If this assertion ever goes red the diagnostic is decorative.
    expect(feedbackDiagnostics([W526]).map((d) => d.code)).toEqual(["LOAM-W526"]);
    expect(isFeedbackDiagnostic(W526)).toBe(true);
    expect(DIAGNOSTIC_METADATA.SETTLEMENT_LAND_SHORT.feedback).toBe(true);
    expect(renderCompileFeedback(report([W526])) ?? "").toContain("SETTLEMENT_LAND_SHORT");
  });

  it("sends missing requested program instances and suppressed canopy back", () => {
    expect(feedbackDiagnostics([W337, T120]).map((d) => d.code)).toEqual([
      "LOAM-W337",
      "LOAM-T120"
    ]);
    expect(DIAGNOSTIC_METADATA.PROGRAM_DROPPED.feedback).toBe(true);
    expect(DIAGNOSTIC_METADATA.FOREST_SETTLEMENT_SUPPRESSED.feedback).toBe(true);
  });

  it("never sends a physics-lint failure back to the model — canonical separation", () => {
    expect(feedbackDiagnostics([T110, T111])).toEqual([]);
    expect(isPhysicsLint(T110.code)).toBe(true);
    expect(isPhysicsLint(T111.code)).toBe(true);
    expect(isFeedbackDiagnostic(T110)).toBe(false);
    expect(isFeedbackDiagnostic(T111)).toBe(false);
  });

  it("canonical FEEDBACK_CODES contains every pinned case and matches metadata", () => {
    const pinned = ["LOAM-T105", "LOAM-T113", "LOAM-T120", "LOAM-T209", "LOAM-W337", "LOAM-W526", "LOAM-W527", "LOAM-T118", "LOAM-T119"];
    for (const code of pinned) {
      expect([...FEEDBACK_CODES]).toContain(code);
      expect(isFeedbackCode(code)).toBe(true);
    }
    // FEEDBACK_CODES is exactly the set of metadata where feedback === true, in CLI order
    const fromMetadata = Object.values(DIAGNOSTIC_METADATA)
      .filter((m) => m.feedback)
      .map((m) => m.code);
    expect(new Set(FEEDBACK_CODES)).toEqual(new Set(fromMetadata));
  });
});

describe("renderCompileFeedback", () => {
  it("is undefined for a clean compile", () => {
    expect(renderCompileFeedback(report([T208]))).toBeUndefined();
  });

  it("renders the diagnostics verbatim, fix hints included", () => {
    const text = renderCompileFeedback(report([T105, T208])) ?? "";
    expect(text).toContain("LOAM-T105");
    expect(text).toContain("BASIN_RIM_NOT_CLOSED");
    expect(text).toContain("fix: fix BASIN_RIM_NOT_CLOSED");
    expect(text).not.toContain("LOAM-T208");
  });

  it("adds the solver report for the nodes the ladder touched", () => {
    const layout = {
      report: {
        dropped: ["world.watchtower"],
        improvementRounds: 1,
        improvements: 0,
        nodes: [
          {
            nodePath: "world.inn",
            placed: true,
            size: [9, 8, 8] as const,
            appliedRungs: ["absorbed"] as const,
            constraints: [],
            coarse: [],
            score: { terrain: 0, soft: 0, total: 0 },
            candidatesConsidered: 400
          },
          {
            nodePath: "world.smithy",
            placed: true,
            size: [9, 8, 9] as const,
            appliedRungs: ["constraint_demoted"] as const,
            constraints: [
              {
                index: 1,
                type: "distance",
                declaredStrength: "hard" as const,
                effectiveStrength: "soft" as const,
                weight: 1,
                cost: 0.42,
                satisfied: false
              }
            ],
            coarse: [],
            score: { terrain: 0.1, soft: 0.4, total: 0.5 },
            candidatesConsidered: 512
          }
        ]
      },
      placements: [],
      ports: [],
      padEdits: []
    } as unknown as TerrainCompileReport["layout"];

    const text = renderCompileFeedback(report([E405], layout)) ?? "";
    expect(text).toContain("Layout solver report:");
    expect(text).toContain("dropped: world.watchtower");
    expect(text).toContain("world.smithy: placed after constraint_demoted");
    expect(text).toContain("unsatisfied distance constraint [1]");
    expect(text).toContain("declared hard, now soft");
    // A node that absorbed every constraint has nothing to say.
    expect(text).not.toContain("world.inn");
  });

  it("reports a solver outcome even when no diagnostic survived the filter", () => {
    const layout = {
      report: { dropped: ["world.barn"], improvementRounds: 0, improvements: 0, nodes: [] },
      placements: [],
      ports: [],
      padEdits: []
    } as unknown as TerrainCompileReport["layout"];
    expect(renderCompileFeedback(report([T208], layout))).toContain("dropped: world.barn");
  });

  it("has nothing to say about a terrain-profile compile", () => {
    expect(solverReportLines(report([]))).toEqual([]);
  });
});

describe("renderDiagnosticFeedback", () => {
  it("renders a failed compile's errors", () => {
    expect(renderDiagnosticFeedback([BAD])).toContain("failed to compile — 1 problem(s)");
  });

  it("is undefined when only lint failures stopped the compile", () => {
    expect(renderDiagnosticFeedback([T110])).toBeUndefined();
    expect(isPhysicsLint(T110.code)).toBe(true);
  });
});

// --- F21: the two scatter findings reach the authoring model ----------------
describe("the scatter findings (F21)", () => {
  const T118 = diag("LOAM-T118", "SCATTER_RADIUS_UNITS");
  const T119 = diag("LOAM-T119", "SCATTER_EMPTY");

  it("sends both back even though they are warnings, not errors — via canonical feedback", () => {
    const out = feedbackDiagnostics([T118, T119]);
    expect(out.map((d) => d.code)).toEqual(["LOAM-T118", "LOAM-T119"]);
    expect(out.map((d) => d.code)).toEqual([T118, T119].filter(isFeedbackDiagnostic).map((d) => d.code));
    expect(isFeedbackCode("LOAM-T118")).toBe(true);
    expect(isFeedbackCode("LOAM-T119")).toBe(true);
    expect(DIAGNOSTIC_METADATA.SCATTER_RADIUS_UNITS.feedback).toBe(true);
    expect(DIAGNOSTIC_METADATA.SCATTER_EMPTY.feedback).toBe(true);
  });

  it("renders them into the feedback turn, fix hint and all", () => {
    const text = renderCompileFeedback(report([T119])) ?? "";
    expect(text).toContain("LOAM-T119");
    expect(text).toContain("fix SCATTER_EMPTY");
  });

  it("neither is a physics-lint failure, so neither aborts the run — canonical lint separation", () => {
    expect(physicsLintFailures([T118, T119])).toEqual([]);
    expect(isPhysicsLint(T118.code)).toBe(false);
    expect(isPhysicsLint(T119.code)).toBe(false);
  });
});

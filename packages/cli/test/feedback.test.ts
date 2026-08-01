/**
 * Which compile findings go back to the author, and how they are rendered.
 *
 * The selection rule is the load-bearing part: send back what the document can
 * change, keep the informational notes, and never send back a physics-lint
 * failure — that one is ours.
 */

import { describe, expect, it } from "vitest";

import type { LoamDiagnostic, TerrainCompileReport } from "@terrainist/compiler";

import {
  feedbackDiagnostics,
  physicsLintFailures,
  renderCompileFeedback,
  renderDiagnosticFeedback,
  solverReportLines,
} from "../src/feedback.js";

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
/** A note the author *can* act on: the cove that missed the coast. */
const T113 = diag("LOAM-T113", "CARVE_DRY", "note");

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
    ...(layout === undefined ? {} : { layout }),
  };
}

describe("physicsLintFailures", () => {
  it("finds unstable fluid and floating vegetation, and nothing else", () => {
    expect(physicsLintFailures([T105, T110, T111, BAD]).map((d) => d.code)).toEqual([
      "LOAM-T110",
      "LOAM-T111",
    ]);
    expect(physicsLintFailures([T105, T208])).toEqual([]);
  });
});

describe("feedbackDiagnostics", () => {
  it("selects the author-actionable findings", () => {
    expect(feedbackDiagnostics([T105, T209, E405]).map((d) => d.code)).toEqual([
      "LOAM-T105",
      "LOAM-T209",
      "LOAM-E405",
    ]);
  });

  it("keeps every error", () => {
    expect(feedbackDiagnostics([BAD]).map((d) => d.code)).toEqual(["LOAM-T104"]);
  });

  it("drops the informational notes and the advisory warnings", () => {
    expect(feedbackDiagnostics([T208, W407])).toEqual([]);
  });

  it("keeps a compiler-ordering note out of the loop the model pays for", () => {
    // The life pass first reported "planted nothing" as LOAM-E170, which is in
    // FEEDBACK_CODES by code regardless of severity — so every small world sent
    // the model two revision rounds asking it to fix a pass-ordering defect no
    // document edit can reach. Its own code is the fix; this guards the seam.
    expect(feedbackDiagnostics([T212])).toEqual([]);
  });

  it("sends the dry-carve note back even though it is only a note", () => {
    // Severity says "the compiler recovered"; the code says "only the document
    // can fix this". For LOAM-T112/T113 the code wins — a cove that compiled dry
    // is precisely what a revision round exists to repair.
    expect(feedbackDiagnostics([T113]).map((d) => d.code)).toEqual(["LOAM-T113"]);
    expect(renderCompileFeedback(report([T113])) ?? "").toContain("CARVE_DRY");
  });

  it("never sends a physics-lint failure back to the model", () => {
    expect(feedbackDiagnostics([T110, T111])).toEqual([]);
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
            candidatesConsidered: 400,
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
                satisfied: false,
              },
            ],
            coarse: [],
            score: { terrain: 0.1, soft: 0.4, total: 0.5 },
            candidatesConsidered: 512,
          },
        ],
      },
      placements: [],
      ports: [],
      padEdits: [],
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
      padEdits: [],
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
  });
});

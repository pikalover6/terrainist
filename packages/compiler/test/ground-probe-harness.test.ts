/**
 * The ground probe as a harness (GROUND-CONTRACT-v1 WP-G0).
 *
 * `tools/worlds/ground-probe.mjs` is the acceptance instrument for the whole
 * ground rewrite: it compiles a document with `groundEquivalence` on, emits a
 * world, reads the walkable surface back, and cross-attributes every ground
 * discontinuity to the subsystem that owns the column. This test pins its
 * output against a committed baseline per document, so any stage of the rewrite
 * that moves a column moves a number here first.
 *
 * The last test is the one that makes the other three trustworthy: an
 * instrument that reports "no difference" is worthless until it has been shown
 * to report a difference. It perturbs exactly one ground column by one block in
 * a *copy* of a probe context, re-runs the (pure) census, and asserts the
 * differ flags it.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The probe is plain ESM under tools/; it imports the built compiler dist.
const probe = (await import(
  fileURLToPath(new URL("../../../tools/worlds/ground-probe.mjs", import.meta.url))
)) as {
  buildProbeContext: (doc: unknown, worldDir: string | null) => Promise<ProbeContext>;
  censusFromContext: (ctx: ProbeContext) => Report;
  cloneContext: (ctx: ProbeContext) => ProbeContext;
};

type ProbeContext = { ground: Int32Array; [k: string]: unknown };
type Report = Record<string, unknown>;

const repoFile = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));

/**
 * The report's top-level sections, in order.
 *
 * Spelled out rather than left to the whole-JSON comparison below: a section
 * added to the census is a change to a committed artifact three baselines
 * share, and a list here says *which* section and in what position, instead of
 * a 40,000-character string mismatch. `floaters` is last, and additive — the
 * unsupported/floating physics families, wired in for Kai's floating-structure
 * probe (2026-08-21).
 */
const REPORT_KEYS = [
  "region",
  "bbox",
  "ownedColumns",
  "intents",
  "columnsWonByClass",
  "sanity",
  "writtenVsResolved",
  "finalPlanVsWritten",
  "cliffCensus",
  "buildingSeats",
  "streetFlank",
  "clusters",
  "floaters",
] as const;

/** Every physics rule the `floaters` section names, in order, zero or not. */
const FLOATER_RULES = [
  "unsupported.chain",
  "unsupported.lantern",
  "unsupported.ladder",
  "unsupported.multiface",
  "floating.stair",
  "floating.isolated",
] as const;

const DOCS = [
  { id: "troy", doc: "battery/candidates/troy_r22/trojan_horse_troy.loam.json" },
  { id: "hellenist", doc: "battery/candidates/hellenist_r22/thalassa_polis.loam.json" },
  { id: "pirates", doc: "battery/candidates/pirates_r22/pirates_vs_unicorns.loam.json" },
] as const;

/* -------------------------------------------------------------------------- */
/* a differ that names the path of a mismatch, not just "objects differ"       */
/* -------------------------------------------------------------------------- */

function diffPaths(actual: unknown, expected: unknown, path = "", out: string[] = []): string[] {
  if (out.length >= 8) return out;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) {
      out.push(`${path}: array vs non-array`);
      return out;
    }
    if (actual.length !== expected.length)
      out.push(`${path}.length: ${actual.length} !== ${expected.length}`);
    for (let i = 0; i < Math.min(actual.length, expected.length); i++)
      diffPaths(actual[i], expected[i], `${path}[${i}]`, out);
    return out;
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") {
      out.push(`${path}: object vs ${typeof actual}`);
      return out;
    }
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(e), ...Object.keys(a)])].sort();
    for (const k of keys) {
      if (!(k in a)) out.push(`${path}.${k}: missing`);
      else if (!(k in e)) out.push(`${path}.${k}: unexpected`);
      else diffPaths(a[k], e[k], `${path}.${k}`, out);
    }
    return out;
  }
  if (actual !== expected) out.push(`${path}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  return out;
}

/* -------------------------------------------------------------------------- */
/* the three documents against their baselines                                 */
/* -------------------------------------------------------------------------- */

// One shared context per document: the census is pure, so the perturbation test
// reuses troy's compile rather than paying for a second 512×512 world.
const contexts = new Map<string, ProbeContext>();

describe.each(DOCS)("ground probe: $id", ({ id, doc }) => {
  it(
    "matches its committed baseline",
    async () => {
      const parsed = JSON.parse(await readFile(repoFile(doc), "utf8")) as unknown;
      const ctx = await probe.buildProbeContext(parsed, null);
      contexts.set(id, ctx);
      const report = probe.censusFromContext(ctx);
      const baseline = JSON.parse(
        await readFile(repoFile(`tools/worlds/ground-probe-baselines/${id}.json`), "utf8"),
      ) as Report;
      const diffs = diffPaths(report, baseline);
      expect(diffs.join("\n")).toBe("");
      // key order is part of the contract: the baseline is a committed artifact
      expect(Object.keys(report)).toEqual([...REPORT_KEYS]);
      expect(Object.keys(baseline)).toEqual([...REPORT_KEYS]);
      const floaters = report.floaters as {
        total: number;
        byRule: { rule: string; n: number; witnesses: unknown[] }[];
      };
      // Every rule, zero or not, and never more witnesses than the probe keeps:
      // a rule that vanishes when it finds nothing looks exactly like a rule
      // that stopped running.
      expect(floaters.byRule.map((r) => r.rule)).toEqual([...FLOATER_RULES]);
      expect(floaters.byRule.reduce((n, r) => n + r.n, 0)).toBe(floaters.total);
      for (const r of floaters.byRule)
        expect(r.witnesses.length).toBe(Math.min(r.n, 10));
      expect(JSON.stringify(report)).toBe(JSON.stringify(baseline));
    },
    900_000,
  );
});

/* -------------------------------------------------------------------------- */
/* the harness can see a difference                                            */
/* -------------------------------------------------------------------------- */

describe("the harness sees a one-block perturbation", () => {
  it(
    "flags a single ground column moved by one",
    async () => {
      let ctx = contexts.get("troy");
      if (!ctx) {
        const parsed = JSON.parse(
          await readFile(repoFile(DOCS[0].doc), "utf8"),
        ) as unknown;
        ctx = await probe.buildProbeContext(parsed, null);
        contexts.set("troy", ctx);
      }
      const clean = probe.censusFromContext(ctx);
      expect(diffPaths(clean, clean)).toEqual([]);

      // pick the column at the centre of the worst cliff cluster: guaranteed to
      // be inside the audited bbox and adjacent to owned ground.
      const region = clean.region as { x0: number; z0: number; width: number };
      const top = (clean.clusters as { top: { cx: number; cz: number }[] }).top[0];
      const idx = (top.cz - region.z0) * region.width + (top.cx - region.x0);

      const perturbed = probe.cloneContext(ctx);
      perturbed.ground[idx] += 1;
      const after = probe.censusFromContext(perturbed);

      const diffs = diffPaths(after, clean);
      expect(diffs.length).toBeGreaterThan(0);
      expect(JSON.stringify(after)).not.toBe(JSON.stringify(clean));
    },
    900_000,
  );
});

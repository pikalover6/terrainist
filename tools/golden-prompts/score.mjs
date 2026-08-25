// Score a golden-prompt run, or diff two of them.
//
//   node tools/golden-prompts/score.mjs runs/baseline-pre-edit
//   node tools/golden-prompts/score.mjs runs/baseline-pre-edit runs/after-units
//   node tools/golden-prompts/score.mjs runs/baseline-pre-edit runs/after-units --gate
//
// With one run it prints that run's scoreboard. With two it prints BEFORE →
// AFTER for every number, and `--gate` turns the two that matter into an exit
// code: authoring must not get less reliable, and LOAM-T118 must not come back.
//
// Every metric here exists because some audit finding predicted it would move.
// A metric nobody has a hypothesis about is noise, and noise is what makes a
// regression harness stop being read.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const stdlib = await import(new URL("../../packages/stdlib/dist/index.js", import.meta.url).href);
const CATALOG_SIZE = stdlib.STRUCTURE_CATALOG.length;
const ARCHETYPE_COUNT = stdlib.BUILDING_ARCHETYPES.length;
const PACK_COUNT = stdlib.formPackIds().length;

function parseArgs(argv) {
  const runs = [];
  const options = { gate: false, json: false };
  for (const arg of argv) {
    if (arg === "--gate") options.gate = true;
    else if (arg === "--json") options.json = true;
    else if (arg.startsWith("--")) throw new Error(`unexpected argument ${arg}`);
    else runs.push(arg);
  }
  if (runs.length === 0 || runs.length > 2) {
    throw new Error("usage: score.mjs <run-dir> [<other-run-dir>] [--gate] [--json]");
  }
  return { runs, options };
}

function loadRun(dir) {
  const resolved = path.isAbsolute(dir) ? dir : path.resolve(dir);
  const file = fs.existsSync(path.join(resolved, "summary.json"))
    ? path.join(resolved, "summary.json")
    : path.join(HERE, dir, "summary.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const union = (records, pick) => {
  const set = new Set();
  for (const r of records) for (const v of pick(r.census ?? {}) ?? []) set.add(v);
  return set;
};

const sumCensus = (records, pick) =>
  records.reduce((n, r) => n + (r.census === undefined ? 0 : (pick(r.census) ?? 0)), 0);

function countDiagnostic(summary, code) {
  return summary.totals.diagnosticCodes?.[code] ?? 0;
}

/**
 * The scoreboard of one run.
 *
 * Grouped by the question each number answers, because the point of the suite
 * is to make a kit edit argue for itself.
 */
function scoreboard(summary) {
  const records = summary.records;
  const ok = records.filter((r) => r.ok);
  const kitLiterals = new Set(Object.values(summary.kits).flatMap((k) => k.envelopeLiterals ?? []));
  const envelopes = records.flatMap((r) => r.census?.envelopes ?? []);
  const kitLiteralEnvelopes = envelopes.filter((e) => kitLiterals.has(e)).length;

  return {
    // --- does it author at all -------------------------------------------
    prompts: records.length,
    authoredClean: ok.length,
    oneShot: records.filter((r) => r.attempts === 1).length,
    attemptsTotal: summary.totals.attempts,

    // --- the price lever --------------------------------------------------
    promptTokens: summary.totals.promptTokens,
    completionTokens: summary.totals.completionTokens,
    cost: summary.totals.cost,
    costPerPrompt: records.length === 0 ? 0 : summary.totals.cost / records.length,

    // --- the retry loop, by cause ----------------------------------------
    // T118 SCATTER_RADIUS_UNITS is 53% of all authoring rejections in the
    // battery corpus. It is the single number the units cluster exists to move.
    "LOAM-T118": countDiagnostic(summary, "LOAM-T118"),
    "LOAM-E404": countDiagnostic(summary, "LOAM-E404"),
    diagnosticsTotal: Object.values(summary.totals.diagnosticCodes ?? {}).reduce((a, b) => a + b, 0),

    // --- catalog reach (the parroting hypothesis) -------------------------
    archetypesReached: union(ok, (c) => c.archetypes).size,
    archetypeReachPct: (union(ok, (c) => c.archetypes).size / ARCHETYPE_COUNT) * 100,
    formPacksReached: union(ok, (c) => c.formPacks).size,
    propsReached: union(ok, (c) => c.props).size,
    speciesReached: union(ok, (c) => c.species).size,
    generatorsReached: union(ok, (c) => c.generators).size,

    // --- the kit's fingerprints on the output -----------------------------
    envelopes: envelopes.length,
    kitLiteralEnvelopes,
    kitLiteralEnvelopePct: envelopes.length === 0 ? 0 : (kitLiteralEnvelopes / envelopes.length) * 100,
    explicitArchetypeParams: sumCensus(ok, (c) => c.explicitArchetypeParams),

    // --- audit-specific counters ------------------------------------------
    forestNodes: sumCensus(ok, (c) => c.forests),
    forestFillsAtOrAboveCoverage: sumCensus(ok, (c) => c.forestFillsAtOrAboveCoverage),
    forestRadiiBelowTwo: sumCensus(ok, (c) => c.forestRadiiBelowTwo),
    docsWithZeroForests: ok.filter((r) => (r.census?.forests ?? 0) === 0).length,

    // --- what the authored layer actually binds ---------------------------
    constraints: sumCensus(ok, (c) => c.constraints),
    constraintsWithStrength: sumCensus(ok, (c) => c.constraintsWithStrength),
    hardConstraints: sumCensus(ok, (c) => c.hardConstraints),
    conformsTrue: sumCensus(ok, (c) => c.conformsTrue),
    maxTreeDepth: ok.reduce((n, r) => Math.max(n, r.census?.maxDepth ?? 0), 0),
    nodesTotal: sumCensus(ok, (c) => c.nodes),
    programReferences: sumCensus(ok, (c) => c.programReferences),
    docBytes: sumCensus(ok, (c) => c.bytes),
  };
}

const INTEGER_METRICS = new Set(["cost", "costPerPrompt", "archetypeReachPct", "kitLiteralEnvelopePct"]);
const format = (key, value) =>
  key === "cost" || key === "costPerPrompt"
    ? `$${value.toFixed(4)}`
    : INTEGER_METRICS.has(key)
      ? `${value.toFixed(1)}%`
      : String(value);

/** Metrics where a bigger number is worse. Everything else is neutral or better. */
const LOWER_IS_BETTER = new Set([
  "attemptsTotal",
  "promptTokens",
  "completionTokens",
  "cost",
  "costPerPrompt",
  "LOAM-T118",
  "LOAM-E404",
  "diagnosticsTotal",
  "forestFillsAtOrAboveCoverage",
  "forestRadiiBelowTwo",
]);

function printSingle(summary) {
  const board = scoreboard(summary);
  console.log(`golden-prompt scoreboard — ${summary.label}`);
  console.log(`model ${summary.model} at effort ${summary.effort}`);
  for (const [kit, fp] of Object.entries(summary.kits)) {
    console.log(`kit   ${kit.padEnd(11)} ${fp.sha256.slice(0, 16)}  ${fp.bytes} B`);
  }
  console.log(`catalog: ${ARCHETYPE_COUNT} archetypes, ${PACK_COUNT} form packs, ${CATALOG_SIZE} entries\n`);
  for (const [key, value] of Object.entries(board)) {
    console.log(`  ${key.padEnd(30)} ${format(key, value)}`);
  }
  console.log("\nper prompt:\n");
  for (const r of summary.records) {
    const c = r.census;
    console.log(
      `  ${(r.ok ? "ok  " : "FAIL")} ${r.id.padEnd(22)} ${String(r.attempts ?? "-").padStart(2)} att  ` +
        `${String(c?.nodes ?? "-").padStart(3)} nodes  ${String(c?.archetypes.length ?? "-").padStart(2)} arch  ` +
        `${String(c?.forests ?? "-").padStart(2)} forest  $${(r.usage?.cost ?? 0).toFixed(4)}`,
    );
    const codes = [...new Set((r.diagnostics ?? []).flat().map((d) => d.code))];
    if (codes.length > 0) console.log(`       ${codes.join(" ")}`);
  }
}

/**
 * Restrict a summary to a set of prompt ids, totals included.
 *
 * A subset re-run is the normal cadence — a cluster that touches forest units
 * has no business re-authoring the railway town — so a diff has to compare the
 * prompts the two runs share, and recompute the totals over exactly those.
 * Diffing an 11-prompt baseline against a 6-prompt re-run without this reads as
 * a catastrophic collapse in every count.
 */
function restrict(summary, ids) {
  const records = summary.records.filter((r) => ids.has(r.id));
  const diagnosticCodes = {};
  for (const r of records) {
    for (const per of r.diagnostics ?? []) {
      for (const d of per) diagnosticCodes[d.code] = (diagnosticCodes[d.code] ?? 0) + 1;
    }
  }
  return {
    ...summary,
    records,
    totals: {
      ok: records.filter((r) => r.ok).length,
      attempts: records.reduce((n, r) => n + (r.attempts ?? 0), 0),
      oneShot: records.filter((r) => r.attempts === 1).length,
      promptTokens: records.reduce((n, r) => n + (r.usage?.promptTokens ?? 0), 0),
      completionTokens: records.reduce((n, r) => n + (r.usage?.completionTokens ?? 0), 0),
      cost: records.reduce((n, r) => n + (r.usage?.cost ?? 0), 0),
      diagnosticCodes,
    },
  };
}

function printDiff(beforeAll, afterAll, gate) {
  const shared = new Set(
    beforeAll.records.map((r) => r.id).filter((id) => afterAll.records.some((r) => r.id === id)),
  );
  const skipped = [...beforeAll.records, ...afterAll.records]
    .map((r) => r.id)
    .filter((id) => !shared.has(id));
  const before = restrict(beforeAll, shared);
  const after = restrict(afterAll, shared);

  console.log(`golden-prompt delta — ${before.label} → ${after.label}\n`);
  if (skipped.length > 0) {
    console.log(
      `comparing the ${shared.size} prompt(s) both runs authored; ` +
        `not re-authored: ${[...new Set(skipped)].join(", ")}\n`,
    );
  }
  const kits = new Set([...Object.keys(before.kits), ...Object.keys(after.kits)]);
  for (const kit of kits) {
    const b = before.kits[kit];
    const a = after.kits[kit];
    // A subset re-run may not touch a kit at all. That is "not exercised", not
    // "shrank to zero bytes" — the scorer must not invent a change it did not see.
    if (b === undefined || a === undefined) {
      console.log(`kit ${kit.padEnd(11)} not exercised by ${b === undefined ? before.label : after.label}`);
      continue;
    }
    const moved = b.sha256 !== a.sha256;
    console.log(
      `kit ${kit.padEnd(11)} ${b.sha256.slice(0, 12)} → ${a.sha256.slice(0, 12)}` +
        `  ${moved ? `CHANGED (${b.bytes} → ${a.bytes} B)` : "unchanged"}`,
    );
  }
  if (before.model !== after.model || before.effort !== after.effort) {
    console.log(`\n!! model/effort differ (${before.model}/${before.effort} → ${after.model}/${after.effort});`);
    console.log(`   this delta is not a clean read on the kit bytes.`);
  }
  console.log("");

  const b = scoreboard(before);
  const a = scoreboard(after);
  for (const key of Object.keys(b)) {
    const delta = a[key] - b[key];
    const arrow =
      delta === 0 ? "  " : LOWER_IS_BETTER.has(key) === delta < 0 ? "++" : "--";
    const shown = delta === 0 ? "" : ` (${delta > 0 ? "+" : ""}${format(key, delta)}) ${arrow}`;
    console.log(`  ${key.padEnd(30)} ${format(key, b[key]).padStart(10)} → ${format(key, a[key]).padStart(10)}${shown}`);
  }

  console.log("\nper prompt:\n");
  const byId = new Map(before.records.map((r) => [r.id, r]));
  for (const r of after.records) {
    const prior = byId.get(r.id);
    if (prior === undefined) {
      console.log(`  NEW  ${r.id}`);
      continue;
    }
    const flip =
      prior.ok === r.ok ? (r.ok ? "ok  " : "FAIL") : prior.ok ? "BROKE" : "FIXED";
    console.log(
      `  ${flip.padEnd(5)} ${r.id.padEnd(22)} attempts ${prior.attempts ?? "-"} → ${r.attempts ?? "-"}   ` +
        `archetypes ${prior.census?.archetypes.length ?? "-"} → ${r.census?.archetypes.length ?? "-"}   ` +
        `$${(prior.usage?.cost ?? 0).toFixed(4)} → $${(r.usage?.cost ?? 0).toFixed(4)}`,
    );
    const gained = (r.census?.archetypes ?? []).filter((x) => !(prior.census?.archetypes ?? []).includes(x));
    const lost = (prior.census?.archetypes ?? []).filter((x) => !(r.census?.archetypes ?? []).includes(x));
    if (gained.length > 0) console.log(`       + ${gained.join(" ")}`);
    if (lost.length > 0) console.log(`       - ${lost.join(" ")}`);
  }

  if (!gate) return 0;
  // Two gates, and only two. The suite is a measuring instrument, not a
  // verdict: everything else is for a human to read.
  const failures = [];
  if (a.authoredClean < b.authoredClean) {
    failures.push(`authoring got less reliable: ${b.authoredClean} → ${a.authoredClean} clean`);
  }
  if (a["LOAM-T118"] > b["LOAM-T118"]) {
    failures.push(`LOAM-T118 came back: ${b["LOAM-T118"]} → ${a["LOAM-T118"]}`);
  }
  console.log("");
  if (failures.length === 0) {
    console.log("gate: pass");
    return 0;
  }
  for (const f of failures) console.log(`gate: FAIL — ${f}`);
  return 1;
}

function main() {
  const { runs, options } = parseArgs(process.argv.slice(2));
  const summaries = runs.map(loadRun);
  if (options.json) {
    console.log(JSON.stringify(summaries.map(scoreboard), null, 2));
    return 0;
  }
  if (summaries.length === 1) {
    printSingle(summaries[0]);
    return 0;
  }
  return printDiff(summaries[0], summaries[1], options.gate);
}

process.exitCode = main();

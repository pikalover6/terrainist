// Exercise the census and the scorer with ZERO API spend.
//
// The battery archive is 50-odd authored documents that real model runs
// produced. That makes it the right test material for the parts of this suite
// that are pure functions of a document: if `censusDocument` can read Troy's
// archived doc and count its archetypes, it can read tomorrow's.
//
// It builds two synthetic run directories out of archived docs and scores one
// against the other, so the whole `run.mjs` → `summary.json` → `score.mjs`
// path is walked before a single authoring call is paid for.
//
//   node tools/golden-prompts/test-census.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { censusDocument, kitEnvelopeLiterals } from "./run.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const ARCHIVE = path.join(REPO, "battery/candidates");
const OUT = path.join(HERE, "runs/.smoke");

let failures = 0;
const check = (label, condition, detail = "") => {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail === "" ? "" : `  — ${detail}`}`);
  }
};

/** Every archived document, newest cohort first, with the slug it came from. */
function archivedDocs() {
  const found = [];
  for (const dir of fs.readdirSync(ARCHIVE)) {
    const full = path.join(ARCHIVE, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith(".json")) continue;
      let doc;
      try {
        doc = JSON.parse(fs.readFileSync(path.join(full, file), "utf8"));
      } catch {
        continue;
      }
      if (doc?.root === undefined) continue;
      found.push({ id: `${dir}/${file.replace(/\.json$/, "")}`, doc });
    }
  }
  return found;
}

console.log("census over the battery archive\n");
const docs = archivedDocs();
check(`found archived documents (${docs.length})`, docs.length >= 10);

let totalArchetypes = 0;
let docsWithForests = 0;
for (const { id, doc } of docs) {
  const census = censusDocument(doc);
  check(
    `${id}: census reads`,
    census.nodes > 0 && Array.isArray(census.archetypes) && typeof census.bytes === "number",
    JSON.stringify({ nodes: census.nodes }),
  );
  totalArchetypes += census.archetypes.length;
  if (census.forests > 0) docsWithForests++;
}

// WS-C's own numbers over this corpus, as a sanity floor: tree depth is 2 in
// every doc, and archetype vocabulary is real and small. If the census silently
// returned empties these would both be zero.
check(`archetypes found across the corpus (${totalArchetypes})`, totalArchetypes > 50);
check(`documents with forest nodes (${docsWithForests})`, docsWithForests > 5);

console.log("\nkit envelope literals\n");
for (const kit of ["settlement-author.md", "terrain-author.md"]) {
  const literals = kitEnvelopeLiterals(fs.readFileSync(path.join(REPO, "docs/kits", kit), "utf8"));
  check(`${kit}: printed envelope sizes (${literals.length})`, literals.length > 0, literals.join(" "));
}

/* -------------------------------------------------------------------------- */
/* a synthetic run pair, so score.mjs is walked end to end                    */
/* -------------------------------------------------------------------------- */

function syntheticRun(label, sample, kitSha) {
  const settlement = fs.readFileSync(path.join(REPO, "docs/kits/settlement-author.md"), "utf8");
  const records = sample.map(({ id, doc }, i) => ({
    id: id.replace(/[^a-z0-9_]/gi, "_"),
    family: "archive",
    kit: "settlement",
    prompt: doc.meta?.prompt ?? "",
    seed: doc.meta?.worldSeed ?? 0,
    size: 512,
    model: "archive",
    effort: "n/a",
    ok: true,
    attempts: (i % 3) + 1,
    diagnostics: i % 2 === 0 ? [[{ code: "LOAM-T118", name: "SCATTER_RADIUS_UNITS", severity: "error", nodePath: "x" }]] : [[]],
    usage: { promptTokens: 99000, completionTokens: 8000, reasoningTokens: 4000, cost: 0.24 },
    census: censusDocument(doc),
  }));
  const diagnosticCodes = {};
  for (const r of records) {
    for (const per of r.diagnostics) for (const d of per) diagnosticCodes[d.code] = (diagnosticCodes[d.code] ?? 0) + 1;
  }
  return {
    suite: "golden-prompts-v0",
    label,
    model: "archive",
    effort: "n/a",
    intentPrepass: false,
    kits: {
      settlement: {
        path: "docs/kits/settlement-author.md",
        sha256: kitSha,
        bytes: settlement.length,
        envelopeLiterals: kitEnvelopeLiterals(settlement),
      },
    },
    totals: {
      ok: records.length,
      attempts: records.reduce((n, r) => n + r.attempts, 0),
      oneShot: records.filter((r) => r.attempts === 1).length,
      promptTokens: records.reduce((n, r) => n + r.usage.promptTokens, 0),
      completionTokens: records.reduce((n, r) => n + r.usage.completionTokens, 0),
      cost: records.reduce((n, r) => n + r.usage.cost, 0),
      diagnosticCodes,
    },
    records,
  };
}

console.log("\nsynthetic run pair → score.mjs\n");
const sample = docs.slice(0, 6);
const other = docs.slice(2, 8);
for (const [label, set, sha] of [
  ["before", sample, "a".repeat(64)],
  ["after", other, "b".repeat(64)],
]) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "summary.json"), `${JSON.stringify(syntheticRun(label, set, sha), null, 2)}\n`);
}

const { execFileSync } = await import("node:child_process");
const output = execFileSync(
  process.execPath,
  [path.join(HERE, "score.mjs"), path.join(OUT, "before"), path.join(OUT, "after"), "--gate"],
  { encoding: "utf8" },
);
check("score.mjs diffs two runs", output.includes("golden-prompt delta"), output.slice(0, 200));
check("score.mjs names the kit sha change", output.includes("CHANGED"));
check("score.mjs reports the gate", /gate: (pass|FAIL)/.test(output));

const single = execFileSync(process.execPath, [path.join(HERE, "score.mjs"), path.join(OUT, "before")], {
  encoding: "utf8",
});
check("score.mjs scores a single run", single.includes("archetypesReached"));

fs.rmSync(OUT, { recursive: true, force: true });

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) FAILED`}`);
process.exitCode = failures === 0 ? 0 : 1;

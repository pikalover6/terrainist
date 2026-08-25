// Turn a generate-all.mjs output folder into a golden-harness run directory
// (<id>.doc.json + <id>.record.json + summary.json) so score.mjs can read it,
// plus a one-line-per-prompt table for the deck README.
//   node tools/golden-prompts/record-generate-run.mjs <generateDir> <runOutDir> <label>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { censusDocument, kitEnvelopeLiterals } from "./run.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [B0, RUN, LABEL] = process.argv.slice(2);
const suite = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/golden-prompts/prompts.json"), "utf8"));
const status = fs.readFileSync(path.join(B0, "status.txt"), "utf8");
fs.mkdirSync(RUN, { recursive: true });

const money = (s) => { const m = s.match(/\(\$([0-9.]+)\)/); return m ? Number(m[1]) : 0; };
const KITS = { settlement: "docs/kits/settlement-author.md", terrain: "docs/kits/terrain-author.md" };
const kits = {};
for (const [k, rel] of Object.entries(KITS)) {
  const bytes = fs.readFileSync(path.join(ROOT, rel));
  kits[k] = { path: rel, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length,
    envelopeLiterals: kitEnvelopeLiterals(bytes.toString("utf8")) };
}

const records = [];
const rows = [];
for (const p of suite.prompts) {
  const dir = path.join(B0, p.id);
  const logPath = path.join(dir, "generate.log");
  if (!fs.existsSync(logPath)) continue;
  const log = fs.readFileSync(logPath, "utf8");
  const lines = log.split("\n");
  const exitM = status.match(new RegExp(`^${p.id} exit=(\\S+) secs=(\\d+)`, "m"));
  const docs = fs.existsSync(path.join(dir, "out")) ? fs.readdirSync(path.join(dir, "out")).filter((f) => f.endsWith(".loam.json")) : [];
  const docPath = docs.length ? path.join(dir, "out", docs[0]) : null;
  const doc = docPath ? JSON.parse(fs.readFileSync(docPath, "utf8")) : null;

  const attemptsM = log.match(/authored with (\S+) in (\d+) attempt/);
  const summaryM = log.match(/authoring\s+(\d+) model run\(s\), (\d+) compile-feedback round\(s\), (\d+) in \+ (\d+) out = \d+ tokens[^\n]*\(\$([0-9.]+)\)/);
  const intentM = log.match(/^intent\s+(\{.*\})$/m);
  const modelM = log.match(/^model\s+(\S+)/m);
  const effortM = log.match(/^effort\s+(\S+)/m);
  // programs block: header line, then ok/fail lines, then its tokens line
  const progIdx = lines.findIndex((l) => /^programs\s/.test(l));
  const programs = [];
  let programCost = 0;
  if (progIdx >= 0) {
    for (let i = progIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s+(ok|fail|drop|skip)\s/.test(l)) programs.push(l.trim().replace(/\s+/g, " ").slice(0, 90));
      else if (/^\s+tokens\s/.test(l)) { programCost = money(l); break; }
      else if (!/^\s/.test(l) && l.trim()) break;
    }
  }
  const compiledIdx = lines.map((l, i) => (/^compiled "/.test(l) ? i : -1)).filter((i) => i >= 0);
  const lastCompiled = compiledIdx.length ? compiledIdx[compiledIdx.length - 1] : -1;
  const finalDiag = {};
  if (lastCompiled >= 0) for (const l of lines.slice(lastCompiled)) {
    const m = l.match(/^(warning|note|error) (LOAM-[A-Z]\d+)/);
    if (m) finalDiag[m[2]] = (finalDiag[m[2]] ?? 0) + 1;
  }
  const crash = lines.filter((l) => /^terrainist: /.test(l)).map((l) => l.slice(0, 160));
  const worldM = log.match(/^\s+world\s+(\S+)/m);
  const authoringCost = summaryM ? Number(summaryM[5]) : 0;
  const rec = {
    id: p.id, family: p.family, kit: p.kit ?? "settlement", prompt: p.prompt, seed: p.seed, size: 512,
    model: modelM?.[1] ?? null, effort: effortM?.[1] ?? null,
    ok: Boolean(doc) && exitM?.[1] === "0",
    intent: intentM ? JSON.parse(intentM[1]) : null,
    attempts: attemptsM ? Number(attemptsM[2]) : null,
    diagnostics: [],
    usage: summaryM ? { promptTokens: Number(summaryM[3]), completionTokens: Number(summaryM[4]), cost: authoringCost } : null,
    resolvedModel: attemptsM?.[1] ?? null,
    census: doc ? censusDocument(doc) : null,
    wallMs: exitM ? Number(exitM[2]) * 1000 : null,
    generate: {
      exit: exitM ? exitM[1] : null,
      modelRuns: summaryM ? Number(summaryM[1]) : null,
      feedbackRounds: summaryM ? Number(summaryM[2]) : null,
      programs, programCost, totalCost: Number((authoringCost + programCost).toFixed(4)),
      compiled: lastCompiled >= 0, worldDir: worldM?.[1] ?? null, finalDiagnostics: finalDiag, crash,
      docName: docs[0] ?? null,
    },
  };
  records.push(rec);
  if (doc) fs.writeFileSync(path.join(RUN, `${p.id}.doc.json`), JSON.stringify(doc, null, 2) + "\n");
  fs.writeFileSync(path.join(RUN, `${p.id}.record.json`), JSON.stringify(rec, null, 2) + "\n");
  const c = rec.census;
  rows.push(`| ${p.id} | ${p.seed} | ${rec.ok ? "ok" : "FAIL"} | ${rec.attempts ?? "-"} | ${rec.generate.feedbackRounds ?? "-"} | ${programs.length} | ${c?.nodes ?? "-"} | ${c?.archetypes?.length ?? "-"} | ${Object.values(finalDiag).reduce((a, b) => a + b, 0)} | $${rec.generate.totalCost.toFixed(3)} | ${Math.round((rec.wallMs ?? 0) / 60000)} min |`);
}
const totals = {
  ok: records.filter((r) => r.ok).length, attempts: records.reduce((n, r) => n + (r.attempts ?? 0), 0),
  oneShot: records.filter((r) => r.attempts === 1).length,
  promptTokens: records.reduce((n, r) => n + (r.usage?.promptTokens ?? 0), 0),
  completionTokens: records.reduce((n, r) => n + (r.usage?.completionTokens ?? 0), 0),
  cost: Number(records.reduce((n, r) => n + (r.usage?.cost ?? 0), 0).toFixed(4)),
  generateCost: Number(records.reduce((n, r) => n + (r.generate.totalCost ?? 0), 0).toFixed(4)),
};
const summary = { suite: suite.suite, label: LABEL, model: records[0]?.model, effort: records[0]?.effort, intentPrepass: true,
  source: "terrainist generate (full pipeline: intent, authoring, programs, compile-feedback rounds, emit)", kits, totals, records };
fs.writeFileSync(path.join(RUN, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log("| prompt | seed | status | attempts | rounds | programs | nodes | archetypes | final diags | cost | wall |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(r);
console.log(JSON.stringify(totals));

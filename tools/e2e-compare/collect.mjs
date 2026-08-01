#!/usr/bin/env node
/**
 * Collect the 3x3 e2e comparison metrics from `out/e2e/<run>/`.
 *
 * Everything comes from what `terrainist generate --keep-doc` already leaves on
 * disk: the run log (usage, attempts, revision rounds, diagnostics), the
 * authored document (structure/building/prop counts) and the world zip. No
 * model is called and nothing is recompiled, so this is re-runnable at will.
 *
 * Usage: node tools/e2e-compare/collect.mjs [outDir]   (default out/e2e)
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "out/e2e");

/**
 * Count generator nodes by family anywhere in an authored document.
 *
 * Every Loam node is `kind: "generator"`; the interesting distinction is the
 * generator id, so the families (`building.*`, `prop.*`, ...) are the counts
 * worth comparing between models.
 */
function countNodes(doc) {
  const counts = { terrain: 0, scatter: 0, building: 0, structure: 0, prop: 0, road: 0, other: 0, total: 0 };
  const byGenerator = {};
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== "object") return;
    const generator = typeof node.generator === "string" ? node.generator : undefined;
    if (generator !== undefined) {
      counts.total++;
      byGenerator[generator] = (byGenerator[generator] ?? 0) + 1;
      const family = generator.split(".")[0];
      if (family in counts) counts[family]++;
      else counts.other++;
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(doc);
  return { ...counts, byGenerator };
}

/** Pull what the generate log records about the model side of the run. */
function parseLog(log) {
  const attempts = /authored with (\S+) in (\d+) attempt\(s\)/.exec(log);
  const usage = /(\d+) model run\(s\), (\d+) compile-feedback round\(s\), (\d+) in \+ (\d+) out = (\d+) tokens(?: \(\$([\d.]+)\))?/.exec(log);
  // Fall back to the per-attempt cost lines when the run never reached the summary.
  const costs = [...log.matchAll(/\(\$([\d.]+)\)/g)].map((m) => Number(m[1]));
  const revisions = [...log.matchAll(/revision (\d+) authored in (\d+) attempt\(s\)/g)];
  const diagnostics = { error: 0, warning: 0, info: 0 };
  for (const m of log.matchAll(/^(error|warning|info) LOAM-/gm)) diagnostics[m[1]]++;
  return {
    model: attempts?.[1],
    authorAttempts: attempts === null ? undefined : Number(attempts[2]),
    revisionRounds: usage === null ? revisions.length : Number(usage[2]),
    revisionAttempts: revisions.map((m) => Number(m[2])),
    promptTokens: usage === null ? undefined : Number(usage[3]),
    completionTokens: usage === null ? undefined : Number(usage[4]),
    totalTokens: usage === null ? undefined : Number(usage[5]),
    cost: usage?.[6] !== undefined ? Number(usage[6]) : costs.reduce((a, b) => a + b, 0),
    diagnostics,
    physicsLint: /PHYSICS LINT FAILED/.test(log),
  };
}

async function sizeOf(file) {
  try {
    return (await stat(file)).size;
  } catch {
    return undefined;
  }
}

const rows = [];
for (const name of (await readdir(root, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()) {
  const dir = path.join(root, name);
  const files = await readdir(dir);
  const row = { run: name };

  const metaFile = files.find((f) => f === "meta.txt");
  if (metaFile !== undefined) {
    const meta = await readFile(path.join(dir, metaFile), "utf8");
    row.exitCode = Number(/exit=(-?\d+)/.exec(meta)?.[1] ?? NaN);
    row.seconds = Number(/seconds=(\d+)/.exec(meta)?.[1] ?? NaN);
  }

  const logFile = files.find((f) => f === "run.log");
  if (logFile !== undefined) Object.assign(row, parseLog(await readFile(path.join(dir, logFile), "utf8")));

  const docFile = files.find((f) => f.endsWith(".loam.json"));
  if (docFile !== undefined) {
    row.doc = docFile;
    row.nodes = countNodes(JSON.parse(await readFile(path.join(dir, docFile), "utf8")));
  }

  const zipFile = files.find((f) => f.endsWith(".zip"));
  if (zipFile !== undefined) {
    row.zip = zipFile;
    row.zipBytes = await sizeOf(path.join(dir, zipFile));
  }

  rows.push(row);
}

console.log(JSON.stringify(rows, null, 2));

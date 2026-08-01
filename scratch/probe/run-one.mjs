// U3 probe runner: compile one scaled Bayline, record timings, peak RSS, counts.
// Usage: node --max-old-space-size=NNNN scratch/probe/run-one.mjs <size> [outJson]
import fs from "node:fs";
import path from "node:path";
import { compileTerrain } from "@terrainist/compiler";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const N = Number(process.argv[2]);
const VARIANT = process.argv[3] ?? ""; // "" = terrain params verbatim, "T" = terrain scaled
const tag = `bayline${VARIANT}-${N}`;
const outJson = path.join(HERE, "results", `${tag}.json`);
fs.mkdirSync(path.dirname(outJson), { recursive: true });

const docPath = path.join(HERE, "worlds", `${tag}.loam.json`);
const worldDir = path.join(HERE, "out", tag);
fs.rmSync(worldDir, { recursive: true, force: true });
fs.mkdirSync(worldDir, { recursive: true });

let peakRss = 0;
let peakHeap = 0;
const sampler = setInterval(() => {
  const m = process.memoryUsage();
  if (m.rss > peakRss) peakRss = m.rss;
  if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;
}, 100);
sampler.unref();

const doc = JSON.parse(fs.readFileSync(docPath, "utf8"));
const t0 = Date.now();
let result;
let err;
try {
  result = await compileTerrain(doc, { outDir: worldDir });
} catch (e) {
  err = e;
}
const wall = Date.now() - t0;
clearInterval(sampler);

function dirSize(d) {
  let total = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

const g = globalThis;
// VmHWM is the kernel's own peak-RSS watermark — trustworthy even when the
// compile is synchronous enough that the 100ms sampler never gets to run.
let hwm = 0;
try {
  const m = /VmHWM:\s+(\d+) kB/.exec(fs.readFileSync("/proc/self/status", "utf8"));
  if (m) hwm = Number(m[1]) * 1024;
} catch {}

const out = {
  size: N,
  variant: VARIANT === "T" ? "terrain-scaled" : "terrain-verbatim",
  wallMs: wall,
  peakRssMB: +(Math.max(hwm, peakRss) / 1048576).toFixed(1),
  peakHeapMB: +(peakHeap / 1048576).toFixed(1),
  ok: result?.ok ?? false,
  error: err ? String(err && err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : err) : undefined,
};

if (result?.ok) {
  const r = result.report;
  out.timings = r.timings;
  // U3 temporary instrumentation: split emit into stamp vs region-write.
  out.emitSplit = {
    fillMs: +(g.__u3_fillDoneMs - g.__u3_emitStart).toFixed(1),
    connectionsMs: +(g.__u3_stampMs - g.__u3_fillDoneMs).toFixed(1),
    regionWriteMs: +(r.timings.emit - (g.__u3_stampMs - g.__u3_emitStart)).toFixed(1),
  };
  out.stats = {
    columns: r.stats.columns,
    chunkCount: r.stats.chunkCount,
    blockCount: r.stats.blockCount,
    structureBlockCount: r.emit.structureBlockCount,
    treeCount: r.stats.treeCount,
    regionFiles: r.emit.regionFiles.length,
  };
  const L = r.layout;
  if (L) {
    out.city = {
      placements: L.placements?.length ?? 0,
      structureBlocks: L.structures?.blocks?.length ?? 0,
      districts: (L.districts ?? []).map((d) => ({
        nodePath: d.nodePath,
        bounds: [d.bounds?.width, d.bounds?.depth],
        streetNodes: d.streets?.nodes?.length,
        streetEdges: d.streets?.edges?.length,
        carriagewayBytes: d.carriageway?.length,
        stats: d.stats,
      })),
    };
    if (r.stats.structures) out.city.structureStats = r.stats.structures;
  }
  out.errors = r.diagnostics.filter((d) => d.severity === "error").length;
  out.warnings = r.diagnostics.filter((d) => d.severity === "warning").length;
} else if (result) {
  out.diagnostics = result.diagnostics.slice(0, 10).map((d) => `${d.code}: ${d.message}`);
}

if (fs.existsSync(worldDir)) out.outputBytes = dirSize(worldDir);
fs.writeFileSync(outJson, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));

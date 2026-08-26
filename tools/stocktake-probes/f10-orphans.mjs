// F10 probe: where the walkability audit's orphan paving is, by component and emitter.
//   node orphans.mjs <label> <doc>...   → prints one JSON line per doc
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compileTerrain } from "/Users/kaihoward/Dev/terrainist/packages/compiler/dist/terrain/compile.js";
const [label, ...files] = process.argv.slice(2);
for (const file of files) {
  const doc = JSON.parse(await readFile(file, "utf8"));
  const root = await mkdtemp(path.join(tmpdir(), "f10-"));
  const c = await compileTerrain(doc, { outDir: path.join(root, "w"), walkability: { worstJunctions: 4 } });
  if (!c.ok) { console.log(JSON.stringify({ label, doc: path.basename(file), failed: true })); continue; }
  const w = c.walkability; const s = c.report.stats.structures; const d = c.report.stats.districts ?? {};
  const comps = w.components.filter((k) => !k.main).sort((a, b) => b.columns - a.columns);
  const byEmitter = w.orphansByEmitter;
  const sizes = {}; for (const k of comps) { const b = k.columns <= 4 ? "≤4" : k.columns <= 20 ? "5-20" : k.columns <= 100 ? "21-100" : ">100"; sizes[b] = (sizes[b] ?? 0) + 1; }
  console.log(JSON.stringify({ label, doc: path.basename(file).replace(/\..*/, ""), buildings: s.buildingCount, lots: d.lotColumns !== undefined ? { lotColumns: d.lotColumns, seatedColumns: d.seatedColumns } : undefined,
    network: w.columns, orphans: w.orphanColumns, share: +(w.orphanColumns / w.columns).toFixed(3), entranceReach: +w.entranceReachableShare.toFixed(3),
    components: comps.length, sizes, byEmitter, top: comps.slice(0, 6).map((k) => ({ n: k.columns, at: [k.sample.x, k.sample.y, k.sample.z], e: Object.entries(k.emitters).slice(0, 3).map(([e, n]) => `${e}:${n}`) })) }));
  await rm(root, { recursive: true, force: true });
}

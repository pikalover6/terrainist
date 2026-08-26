// F14 probe: the physics lint over compiled worlds. node physics.mjs <worldDir>... → one JSON line each
import path from "node:path";
const { loadPrismarine, lintWorldPhysics, EMIT_MINECRAFT_VERSION } = await import("/Users/kaihoward/Dev/terrainist/packages/compiler/dist/index.js");
const mc = await loadPrismarine(EMIT_MINECRAFT_VERSION);
for (const dir of process.argv.slice(2)) {
  const t0 = Date.now();
  const r = await lintWorldPhysics(dir, mc, {});
  const byBlock = {};
  for (const f of r.findings) { const k = `${f.rule}|${f.block.replace(/\[.*$/, "")}`; byBlock[k] = (byBlock[k] ?? 0) + 1; }
  const top = Object.entries(byBlock).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sample = r.findings.slice(0, 3).map((f) => [f.rule, f.x, f.y, f.z, f.block.replace(/\[.*$/, ""), f.detail.slice(0, 60)]);
  console.log(JSON.stringify({ doc: path.basename(path.dirname(dir.replace(/\/$/, ""))), examined: r.examined, total: r.findings.length, counts: r.counts, top, sample, ms: Date.now() - t0 }));
}

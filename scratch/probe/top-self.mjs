// Summarise a V8 .cpuprofile by self time.
import fs from "node:fs";
const p = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const self = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const dt = p.timeDeltas[i] ?? 0;
  self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + dt);
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
const rows = [...self.entries()]
  .map(([id, us]) => {
    const n = byId.get(id);
    const cf = n?.callFrame ?? {};
    const file = (cf.url ?? "").replace(/^file:\/\//, "").split("/").slice(-3).join("/");
    return { fn: cf.functionName || "(anonymous)", where: `${file}:${cf.lineNumber + 1}`, self_s: +(us / 1e6).toFixed(2), pct: +((us / total) * 100).toFixed(1) };
  })
  .sort((a, b) => b.self_s - a.self_s)
  .slice(0, Number(process.argv[3] ?? 25));
console.log(`total sampled: ${(total / 1e6).toFixed(1)}s`);
console.table(rows);

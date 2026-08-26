import { mkdtemp, readFile, rm } from "node:fs/promises"; import { tmpdir } from "node:os"; import path from "node:path";
import { compileTerrain } from "/Users/kaihoward/Dev/terrainist/packages/compiler/dist/terrain/compile.js";
const [label, file] = process.argv.slice(2); const doc = JSON.parse(await readFile(file, "utf8"));
const root = await mkdtemp(path.join(tmpdir(), "f10s-")); const c = await compileTerrain(doc, { outDir: path.join(root, "w"), walkability: { worstJunctions: 4 } });
const { laidBy, feet } = c.walkability; const Q = ["-5,86","-5,88","-4,88","-3,89","-2,90","0,90","2,89","-1,93","-5,92"];
const ext = {}; const short = (e) => e.replace(/#route@world\./, "#").replace(/world\./g, "");
for (const [k, es] of laidBy) { const [x, z] = k.split(",").map(Number); const y = feet.get(k);
  for (const e0 of es) { const e = short(e0); const near = z >= 80 && z <= 100 && x >= -12 && x <= 8; const isPlaza = e0 === "plaza";
    if (near || isPlaza) { const key = (near ? "near:" : "all:") + e; const r = ext[key] ??= [999, 999, -999, -999, 0, 999, -999]; r[0] = Math.min(r[0], x); r[1] = Math.min(r[1], z); r[2] = Math.max(r[2], x); r[3] = Math.max(r[3], z); r[4]++; r[5] = Math.min(r[5], y); r[6] = Math.max(r[6], y); } } }
console.log(label, "network", feet.size); for (const [k, v] of Object.entries(ext)) if (k.startsWith("all:") || v[4] >= 3) console.log("  ", k, "x0 z0 x1 z1 n ymin ymax", v.join(" "));
console.log("  at cut:", Q.map((k) => `${k}=${feet.has(k) ? feet.get(k) + ":" + [...laidBy.get(k)].map(short).join("+") : "-"}`).join("  "));
await rm(root, { recursive: true, force: true });

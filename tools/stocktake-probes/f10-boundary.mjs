// F10 probe 2: the cut. Needs the dist audit patched to expose each component's keys+feet.
//   node boundary.mjs <label> <doc> <outDir>
import { readFile, writeFile } from "node:fs/promises";
import { compileTerrain } from "/Users/kaihoward/Dev/terrainist/packages/compiler/dist/terrain/compile.js";
const [label, file, outDir] = process.argv.slice(2);
const doc = JSON.parse(await readFile(file, "utf8"));
const c = await compileTerrain(doc, { outDir, walkability: { worstJunctions: 4 } });
const w = c.walkability;
const comps = w.components.map((k, i) => ({ i, main: k.main, n: k.columns, keys: k.keys, feet: k.feet }));
await writeFile(`${outDir}-net.json`, JSON.stringify(comps));
const main = comps.find((k) => k.main); const mainFeet = new Map(main.keys.map((k, j) => [k, main.feet[j]]));
const big = comps.filter((k) => !k.main).sort((a, b) => b.n - a.n)[0];
console.log(label, "main", main.n, "largest orphan", big?.n ?? 0);
if (!big || big.n < 20) process.exit(0);
const dys = {}; let adj = 0; const gaps = [];
const bigSet = new Set(big.keys);
for (let j = 0; j < big.keys.length; j++) {
  const [x, z] = big.keys[j].split(",").map(Number); const y = big.feet[j];
  for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const k = `${x+dx},${z+dz}`;
    if (mainFeet.has(k)) { adj++; const dy = mainFeet.get(k) - y; dys[dy] = (dys[dy] ?? 0) + 1; if (Object.keys(dys).length < 6 && adj < 8) gaps.push(["adj", x, y, z, "→", x+dx, mainFeet.get(k), z+dz]); }
  }
}
console.log("adjacent main pairs", adj, "dy histogram", JSON.stringify(dys)); for (const g of gaps) console.log("  ", g.join(" "));
if (adj === 0) {
  // nearest main columns to the orphan component
  const near = [];
  for (let j = 0; j < big.keys.length; j++) { const [x, z] = big.keys[j].split(",").map(Number);
    for (const [k, my] of mainFeet) { const [mx, mz] = k.split(",").map(Number); const d = Math.abs(mx - x) + Math.abs(mz - z); if (d <= 4) near.push([d, x, big.feet[j], z, "…", mx, my, mz]); } }
  near.sort((a, b) => a[0] - b[0]); console.log("near pairs ≤4:", near.length); for (const p of near.slice(0, 8)) console.log("  ", p.join(" "));
}

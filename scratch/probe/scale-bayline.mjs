// U3 probe: derive scaled copies of showcase-bayline at N x N.
// Scales the root region and each district envelope proportionally.
// Keeps seed, terrain params, mixes, precincts and individual building sizes.
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "../..");
const SRC = path.join(ROOT, "examples/showcase-bayline.loam.json");
const OUT = path.join(HERE, "worlds");
fs.mkdirSync(OUT, { recursive: true });

const BASE = 512;
// Variant B: also divide the terrain noise frequencies by the scale factor, so
// the coastline/landform scales with the region instead of tiling. Needed
// because variant A (terrain params verbatim) puts the sea outside the
// precinct zones and hard-errors. Pass --scale-terrain.
const SCALE_TERRAIN = process.argv.includes("--scale-terrain");
const sizes = process.argv.slice(2).filter((a) => !a.startsWith("--")).map(Number);

for (const N of sizes) {
  const doc = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const k = N / BASE;
  doc.meta.name = SCALE_TERRAIN ? `baylinet${N}` : `bayline${N}`;
  if (SCALE_TERRAIN) {
    const t = doc.root.children.find((c) => c.generator === "terrain.heightfield@0");
    t.params.frequency /= k;
    t.params.continentalness.frequency /= k;
    const river = t.children.find((c) => c.generator === "terrain.edit@0");
    river.params.width = Math.round(river.params.width * k);
  }
  doc.root.envelope.size = [N, N];
  doc.root.label = `Bayline @ ${N}x${N}`;
  for (const child of doc.root.children) {
    if (child.kind === "district" && child.envelope?.shape === "region") {
      child.envelope.size = child.envelope.size.map((v) => Math.round(v * k));
    }
  }
  const p = path.join(OUT, `bayline${SCALE_TERRAIN ? "T" : ""}-${N}.loam.json`);
  fs.writeFileSync(p, JSON.stringify(doc, null, 2) + "\n");
  console.log(p, N, "districts:", doc.root.children.filter((c) => c.kind === "district").map((c) => c.envelope.size.join("x")).join(" "));
}

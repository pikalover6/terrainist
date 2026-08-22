// **WP-D0's face census** — `docs/DESCENT-SOLVE-v0.md` §6.1.
//
// > `tools/worlds/descent-census.mjs` publishes per world: scarp seeds, faces,
// > face column counts, the demands each face carries and their terminal drops.
// > The committed baseline every later row is read against. No source change.
//
// It reads the **pristine baseline** off a `groundEquivalence` compile — the
// same `materialisedGround` array the street datum samples and the descent
// solve reads (§1.1) — and runs §1.2's recognition over it verbatim, by
// importing the compiler's own `scarpMask` rather than by restating the rule.
//
// What it cannot do from outside the pipeline is enumerate **demands**: those
// are a function of each quarter's `StreetGraph`, which lives inside
// `layDistrict` and reaches no compile result. So the demand half is measured
// the way an outsider can measure it — against the `street.network` claims the
// contract already publishes, which is where the flights are. A face carrying a
// flight claim is a face the network already descends; that count is the
// population §7.1 calls the suspect one.
//
// usage: node descent-census.mjs <docPath> [--json] [--out <file>]
import fs from "node:fs";

const dist = new URL("../../packages/compiler/dist/index.js", import.meta.url);
const solveUrl = new URL("../../packages/compiler/dist/layout/descent-solve.js", import.meta.url);

const [docPath, ...rest] = process.argv.slice(2);
const asJson = rest.includes("--json");
const outAt = rest.indexOf("--out");
const outFile = outAt >= 0 ? rest[outAt + 1] : null;

const { compileTerrain } = await import(dist);
const { scarpMask } = await import(solveUrl);
const doc = JSON.parse(fs.readFileSync(docPath, "utf8"));

const res = await compileTerrain(doc, {
  outDir: "/dev/null-unused",
  skipEmit: true,
  groundEquivalence: true,
  allowUnstable: true,
});
if (!res.groundEquivalence) throw new Error("no groundEquivalence on compile result");
const { baseline, intents, resolved } = res.groundEquivalence;
const region = baseline.region;
const W = region.width;
const D = region.depth;
const cells = W * D;

// §1.2 S1/S2, from the compiler's own module.
const { seed, mask } = scarpMask(region, baseline.ground);
let seeds = 0;
for (const v of seed) if (v === 1) seeds += 1;

// 4-connected components of the dilated mask — §1.2 S2's faces.
const faceOf = new Int32Array(cells).fill(-1);
const faces = [];
const queue = new Int32Array(cells);
for (let start = 0; start < cells; start++) {
  if (mask[start] !== 1 || faceOf[start] >= 0) continue;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  faceOf[start] = faces.length;
  const piece = [];
  while (head < tail) {
    const k = queue[head++];
    piece.push(k);
    const i = k % W;
    const j = (k - i) / W;
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const ii = i + dx;
      const jj = j + dz;
      if (ii < 0 || jj < 0 || ii >= W || jj >= D) continue;
      const n = jj * W + ii;
      if (mask[n] !== 1 || faceOf[n] >= 0) continue;
      faceOf[n] = faces.length;
      queue[tail++] = n;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const k of piece) {
    const y = baseline.ground[k];
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  faces.push({ id: faces.length, columns: piece.length, relief: hi - lo, seedIdx: piece[0] });
}

// The flights the shipped compiler drew, as the contract publishes them.
const flight = new Uint8Array(cells);
for (const [o, intent] of intents.entries()) {
  if (intent.sourceClass !== "street.network") continue;
  if (!/:steps|steps:/.test(intent.source ?? "") && !/street:/.test(intent.source ?? "")) continue;
  for (let k = 0; k < resolved.owner.length; k++) if (resolved.owner[k] === o) flight[k] = 1;
}
for (const face of faces) face.flightColumns = 0;
for (let k = 0; k < cells; k++) {
  if (flight[k] !== 1) continue;
  const f = faceOf[k];
  if (f >= 0) faces[f].flightColumns += 1;
}

// **The same recognition, clipped to the built fabric.**
//
// The pipeline runs this datum per *quarter* (`layDistrict`, pass 4), so a face
// is a component of the scarp mask **inside one district's bounds** — never of
// the whole world's wild terrain. The unclipped rows above are the honest
// world-scale measurement and they are dominated by the hill itself; this is
// the population the solve would actually see. The clip is the union of every
// tier-A footprint the contract published (`quarter.plane`, `building.footprint`,
// `street.network`, `street.sidewalk`), dilated by the face's own dilation.
const built = new Uint8Array(cells);
for (const [o, intent] of intents.entries()) {
  if (!/^(quarter\.plane|building\.footprint|street\.network|street\.sidewalk|precinct\.ground)$/.test(intent.sourceClass)) {
    continue;
  }
  for (let k = 0; k < resolved.owner.length; k++) if (resolved.owner[k] === o) built[k] = 1;
}
const clippedMask = new Uint8Array(cells);
for (let k = 0; k < cells; k++) if (mask[k] === 1 && built[k] === 1) clippedMask[k] = 1;
const clippedFaces = [];
{
  const seen = new Int32Array(cells).fill(-1);
  for (let start = 0; start < cells; start++) {
    if (clippedMask[start] !== 1 || seen[start] >= 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = clippedFaces.length;
    let n = 0;
    let lo = Infinity;
    let hi = -Infinity;
    let first = start;
    while (head < tail) {
      const k = queue[head++];
      n += 1;
      const y = baseline.ground[k];
      if (y < lo) lo = y;
      if (y > hi) hi = y;
      const i = k % W;
      const j = (k - i) / W;
      for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const ii = i + dx;
        const jj = j + dz;
        if (ii < 0 || jj < 0 || ii >= W || jj >= D) continue;
        const m = jj * W + ii;
        if (clippedMask[m] !== 1 || seen[m] >= 0) continue;
        seen[m] = clippedFaces.length;
        queue[tail++] = m;
      }
    }
    clippedFaces.push({ columns: n, relief: hi - lo, seedIdx: first });
  }
}

const withFlight = faces.filter((f) => f.flightColumns > 0);
const big = [...faces].sort((a, b) => b.columns - a.columns).slice(0, 10);
const world = (k) => [region.x0 + (k % W), region.z0 + Math.floor(k / W)];

const report = {
  doc: docPath,
  region: { x0: region.x0, z0: region.z0, width: W, depth: D },
  seeds,
  faces: faces.length,
  faceColumns: faces.reduce((n, f) => n + f.columns, 0),
  // §7.1's suspect population: relief 6–8 faces, where a kerb and a short
  // flight might have done.
  suspect: faces.filter((f) => f.relief >= 6 && f.relief <= 8).length,
  reliefHistogram: faces.reduce((h, f) => {
    const bucket = f.relief >= 20 ? "20+" : String(f.relief);
    h[bucket] = (h[bucket] ?? 0) + 1;
    return h;
  }, {}),
  facesCarryingNetwork: withFlight.length,
  clipped: {
    faces: clippedFaces.length,
    overCap: clippedFaces.filter((f) => f.columns > 4096).length,
    largest: [...clippedFaces]
      .sort((a, b) => b.columns - a.columns)
      .slice(0, 10)
      .map((f) => ({ columns: f.columns, relief: f.relief, at: world(f.seedIdx) })),
  },
  largest: big.map((f) => ({ columns: f.columns, relief: f.relief, at: world(f.seedIdx), network: f.flightColumns })),
};

const text = asJson
  ? JSON.stringify(report, null, 2)
  : [
      `— descent census: ${docPath}`,
      `scarp seeds        ${report.seeds}`,
      `faces              ${report.faces}  (${report.faceColumns} columns)`,
      `relief 6–8 faces   ${report.suspect}   (§7.1's suspect population)`,
      `faces the network  ${report.facesCarryingNetwork}`,
      `relief histogram   ${JSON.stringify(report.reliefHistogram)}`,
      `clipped to fabric  ${report.clipped.faces} faces, ${report.clipped.overCap} over FACE_MAX_COLUMNS`,
      ...report.clipped.largest.map(
        (f) => `  clip ${String(f.columns).padStart(6)} cols  relief ${String(f.relief).padStart(3)}  at ${f.at.join(",")}`,
      ),
      `largest ten:`,
      ...report.largest.map(
        (f) => `  ${String(f.columns).padStart(6)} cols  relief ${String(f.relief).padStart(3)}  at ${f.at.join(",")}  network ${f.network}`,
      ),
    ].join("\n");

if (outFile) fs.writeFileSync(outFile, text + "\n");
console.log(text);

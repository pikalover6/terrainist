// D3 probe: a placed footprint's foundationY vs the frozen ground beneath it, and who won the columns that differ.
//   node probe.mjs <doc>...   → one JSON line per document
import { mkdtemp, readFile, rm } from "node:fs/promises"; import { tmpdir } from "node:os"; import path from "node:path";
import { compileTerrain } from "/Users/kaihoward/Dev/terrainist/packages/compiler/dist/terrain/compile.js";
for (const file of process.argv.slice(2)) {
  const doc = JSON.parse(await readFile(file, "utf8"));
  const root = await mkdtemp(path.join(tmpdir(), "d3-"));
  const c = await compileTerrain(doc, { outDir: path.join(root, "w"), groundEquivalence: true });
  const name = path.basename(file).replace(/\..*$/, "");
  if (!c.ok || !c.groundEquivalence) { console.log(JSON.stringify({ doc: name, failed: !c.ok, noGround: !c.groundEquivalence })); await rm(root, { recursive: true, force: true }); continue; }
  const ge = c.groundEquivalence; const res = ge.driver; const region = ge.baseline.region; const intents = ge.intents;
  const idxOf = (x, z) => (x < region.x0 || z < region.z0 || x >= region.x0 + region.width || z >= region.z0 + region.depth) ? -1 : (z - region.z0) * region.width + (x - region.x0);
  const placements = c.report.layout.placements.filter((p) => p.footprint && p.foundationY !== undefined && (p.footprint.x1 - p.footprint.x0) < 120);
  let columns = 0, mismatched = 0, owned = 0, unowned = 0; const deltas = {}; const winners = {}; const perPlacement = [];
  for (const p of placements) {
    let bad = 0, n = 0; const fp = p.footprint;
    for (let z = fp.z0; z <= fp.z1; z++) for (let x = fp.x0; x <= fp.x1; x++) {
      const i = idxOf(x, z); if (i < 0) continue; n++; columns++;
      const d = res.ground[i] - p.foundationY;
      const o = res.owner[i]; const cls = o >= 0 && intents[o] ? intents[o].sourceClass : "none";
      if (cls === "building.footprint") owned++;
      if (d !== 0) { if (cls === "building.footprint") { bad++; mismatched++; deltas[d] = (deltas[d] ?? 0) + 1; } else { unowned++; winners[cls] = (winners[cls] ?? 0) + 1; } }
    }
    if (bad > 0) perPlacement.push({ id: p.id ?? p.nodePath, n, bad });
  }
  const rows = (res.report?.claims ?? []).filter((r) => r.sourceClass === "building.footprint");
  const fpRow = rows.reduce((a, r) => ({ declared: a.declared + r.declared, satisfied: a.satisfied + r.satisfied, adjusted: a.adjusted + r.adjusted, refused: a.refused + r.refused }), { declared: 0, satisfied: 0, adjusted: 0, refused: 0 });
  const refusedTo = {}; for (const r of rows) for (const [k, v] of Object.entries(r.refusedTo ?? {})) refusedTo[k] = (refusedTo[k] ?? 0) + v;
  console.log(JSON.stringify({ doc: name, placements: placements.length, columns, owned, mismatched, unownedMismatch: unowned, share: +(mismatched / Math.max(1, columns)).toFixed(4), deltas, winners, footprintRow: fpRow, refusedTo, worst: perPlacement.sort((a, b) => b.bad - a.bad).slice(0, 4) }));
  await rm(root, { recursive: true, force: true });
}

#!/usr/bin/env node
// The icon metric (docs/STOCKTAKE-RUN-SPEC.md §6).
//
//   node tools/golden-prompts/icon-metric.mjs <runDir> [--only a,b] [--json] [--out <file>]
//
// For every document in a golden-prompt run directory (`<id>.doc.json`, the
// shape `run.mjs` and `record-generate-run.mjs` write), compile it in-process
// for its report and score, against the prompt's own icon list in
// `prompts.json`:
//
//   (i)   icon presence — each icon's terms matched against the document's
//         node ids, labels, archetypes, tags, programs and intent tokens ("asked
//         for"), and against the compiled world's placements and buildings
//         ("placed");
//   (ii)  icon dominance — for an icon marked `dominant`, the tallest and
//         broadest placed match against the median building: height ≥ 1.5×
//         and footprint ≥ 2× is dominant (alarm thresholds, not a verdict);
//   (iii) density — lots per 10k envelope cells across the districts, against
//         the prompt's `densityFloor`;
//   (iv)  archetype-less boxes — buildings with no archetype in a pre-modern
//         world (T3: zero is the bar);
//   (v)   era fidelity — buildings whose archetype the intent forbids, and the
//         form-pack/era mismatch note;
//   (vi)  the old floors — did it compile, how many errors, how many
//         diagnostics.
//
// Law 7: the read wins over the number. Everything here is a floor or an
// alarm; a node *named* statue_of_liberty that is a box passes (i) and fails
// (ii), and a world can pass every line here and still fail the walk.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

export const DOMINANT_HEIGHT = 1.5;
export const DOMINANT_FOOTPRINT = 2;
/** A placed program's block volume against the median building's: dominant at this multiple. */
export const DOMINANT_VOLUME = 4;
export const MODERN_ERAS = new Set(["modern", "contemporary", "industrial", "far_future", "future", "near_future", "sci_fi", "victorian"]);

/** Every node in the document, flattened, with the strings an icon may match. */
export function walkDocument(doc) {
  const out = [];
  const walk = (node, p) => {
    if (!node || typeof node !== "object") return;
    const id = node.id ?? "";
    const path = p ? `${p}.${id}` : id;
    out.push({
      path,
      id,
      kind: node.kind ?? node.generator ?? "",
      archetype: node.params?.archetype ?? "",
      tags: Array.isArray(node.tags) ? node.tags.map(String) : [],
      // A bespoke program reference is either `params.program` or the
      // `authored:<id>` generator the kit's request form produces.
      program:
        node.params?.program ??
        (typeof node.generator === "string" && node.generator.startsWith("authored:") ? node.generator.slice("authored:".length) : ""),
      label: node.label ?? node.params?.label ?? "",
    });
    for (const c of node.children ?? []) walk(c, path);
  };
  walk(doc.root, "");
  return out;
}

const has = (hay, term) => typeof hay === "string" && hay.toLowerCase().includes(term.toLowerCase());

/** (i) presence: what the document asked for, and what the world placed. */
export function iconPresence(icon, doc, report) {
  const nodes = walkDocument(doc);
  const programs = Object.keys(doc.programs ?? {});
  const tokens = JSON.stringify(doc.intent?.tokens ?? {});
  const inDocument = new Set();
  const inWorld = new Set();
  for (const term of icon.terms ?? []) {
    for (const n of nodes) {
      if (has(n.id, term) || has(n.archetype, term) || has(n.program, term) || has(n.label, term) || n.tags.some((t) => has(t, term))) {
        inDocument.add(n.path || n.id);
      }
    }
    for (const pr of programs) if (has(pr, term)) inDocument.add(`program:${pr}`);
    if (has(tokens, term)) inDocument.add("intent.tokens");
    if (report) {
      const st = report.layout?.structures ?? {};
      // A placement is matched by its id, its path, and the program the
      // document's node carries (`scout_ship` carrying `crashed_saucer` is the
      // saucer, placed).
      const programOf = new Map(nodes.map((n) => [n.path, n.program]));
      for (const pl of report.layout?.placements ?? []) {
        const prog = programOf.get(pl.nodePath ?? "") ?? "";
        if (has(pl.id, term) || has(pl.nodePath, term) || has(prog, term)) inWorld.add(pl.id);
      }
      for (const b of st.buildings ?? []) {
        const arch = b.meta?.params?.archetype ?? "";
        if (has(arch, term) || has(b.nodePath, term)) inWorld.add(b.nodePath);
      }
      // What is built but is not a placement: the wall circuits, the props,
      // the farms, and the forests (by the node each tree was planted for).
      for (const w of st.walls ?? []) {
        if (has(`wall ${w.style ?? ""} ${w.nodePath ?? ""}`, term)) inWorld.add(`wall:${w.nodePath ?? w.style ?? "?"}`);
      }
      for (const pr of st.props ?? []) {
        if (has(pr.prop ?? "", term) || has(pr.nodePath ?? "", term)) inWorld.add(`prop:${pr.nodePath ?? pr.prop}`);
      }
      if ((st.farms?.blocks?.length ?? 0) > 0 && has("farm field crop", term)) inWorld.add("farms");
      for (const node of Object.keys(report.stats?.treesPerNode ?? {})) {
        if (has(node, term)) inWorld.add(`forest:${node}`);
      }
      // Bespoke programs that ran: the report's own account (`stats.programs`),
      // by the node they stood on and the program they were — a hovering
      // mothership is here and in the markers, never in the placements.
      for (const pr of report.stats?.programs ?? []) {
        if (has(pr.programId ?? "", term) || has(pr.nodePath ?? "", term)) inWorld.add(`program:${pr.nodePath ?? pr.programId}`);
      }
      for (const mk of report.markers ?? []) {
        if (has(mk.id ?? "", term)) inWorld.add(`marker:${String(mk.id).split("#")[0]}`);
      }
    }
  }
  if (icon.absentBuildings) {
    const n = report ? (report.layout?.structures?.buildings ?? []).length : null;
    return { inDocument: [], inWorld: [], present: n === 0, note: n === null ? "no report" : `${n} building(s)` };
  }
  // An icon the document carries as a bespoke program (`params.program`) that
  // this document has no source for — an authoring-only harness run never
  // authors programs — cannot be placed by any compile of it. The read is the
  // document's, says so, and is the same for every arm of an experiment.
  const programOnly = [...inDocument].some((p) => {
    const n = nodes.find((x) => x.path === p);
    return n !== undefined && n.program !== "" && !(n.program in (doc.programs ?? {}));
  });
  if (programOnly && inWorld.size === 0 && inDocument.size > 0) {
    return { inDocument: [...inDocument].slice(0, 12), inWorld: [], present: true, note: "asked for as a program this document has no source for (authoring-only run): document read" };
  }
  // A terrain icon (a fjord, a ridge of pines, a salt flat) is a shape the
  // compiled world has no name for: the read is the document's, and says so.
  if (icon.terrain) {
    return { inDocument: [...inDocument].slice(0, 12), inWorld: [...inWorld].slice(0, 12), present: inDocument.size > 0, note: "terrain icon: document read" };
  }
  return { inDocument: [...inDocument].slice(0, 12), inWorld: [...inWorld].slice(0, 12), present: inWorld.size > 0 || (report === null && inDocument.size > 0) };
}

/** The median building's height and footprint, from the report. */
export function medianBuilding(report) {
  const B = report?.layout?.structures?.buildings ?? [];
  const heights = B.map((b) => b.meta?.height ?? b.meta?.size?.[1] ?? 0).sort((a, b) => a - b);
  const areas = B.map((b) => (b.footprint.x1 - b.footprint.x0 + 1) * (b.footprint.z1 - b.footprint.z0 + 1)).sort((a, b) => a - b);
  const med = (a) => (a.length === 0 ? 0 : a[a.length >> 1]);
  return { count: B.length, height: med(heights), footprint: med(areas) };
}

/** (ii) dominance: the biggest placed match of an icon against the median building. */
export function iconDominance(icon, report, presence) {
  if (!icon.dominant || !report) return null;
  const median = medianBuilding(report);
  let best = null;
  for (const pl of report.layout?.placements ?? []) {
    if (!presence.inWorld.includes(pl.id)) continue;
    // districts and cities are envelopes, not icons
    if (pl.size?.[1] <= 1 && (pl.size?.[0] ?? 0) * (pl.size?.[2] ?? 0) > 2000) continue;
    const h = pl.size?.[1] ?? 0;
    const a = (pl.footprint.x1 - pl.footprint.x0 + 1) * (pl.footprint.z1 - pl.footprint.z0 + 1);
    if (best === null || h * a > best.h * best.a) best = { id: pl.id, h, a };
  }
  for (const b of report.layout?.structures?.buildings ?? []) {
    if (!presence.inWorld.includes(b.nodePath)) continue;
    const h = b.meta?.height ?? 0;
    const a = (b.footprint.x1 - b.footprint.x0 + 1) * (b.footprint.z1 - b.footprint.z0 + 1);
    if (best === null || h * a > best.h * best.a) best = { id: b.nodePath, h, a };
  }
  // A bespoke program that ran has no placement height; it has a block
  // volume and a site footprint (`stats.programs`), read against the median
  // building's block count and footprint.
  let program = null;
  const B = report.layout?.structures?.buildings ?? [];
  const blockCounts = B.map((b) => b.blockCount ?? 0).sort((a, b) => a - b);
  const medianBlocks = blockCounts.length === 0 ? 0 : blockCounts[blockCounts.length >> 1];
  for (const pr of report.stats?.programs ?? []) {
    if (!presence.inWorld.includes(`program:${pr.nodePath ?? pr.programId}`)) continue;
    const site = (pr.sites ?? []).map((st) => (st.footprint ? (st.footprint.x1 - st.footprint.x0 + 1) * (st.footprint.z1 - st.footprint.z0 + 1) : 0)).sort((a, b) => b - a)[0] ?? 0;
    const blocks = pr.blockCount ?? 0;
    if (program === null || blocks > program.blocks) program = { id: pr.nodePath ?? pr.programId, blocks, site, hovering: (pr.sites ?? []).some((st) => st.hovering === true) };
  }
  if (program !== null && (best === null || program.blocks > best.h * best.a)) {
    const volumeRatio = medianBlocks === 0 ? Infinity : program.blocks / medianBlocks;
    const footprintRatio = median.footprint === 0 ? Infinity : program.site / median.footprint;
    return {
      dominant: volumeRatio >= DOMINANT_VOLUME,
      by: program.id, blocks: program.blocks, footprint: program.site, hovering: program.hovering,
      medianBlocks, medianFootprint: median.footprint,
      volumeRatio: +volumeRatio.toFixed(2), footprintRatio: +footprintRatio.toFixed(2),
    };
  }
  if (best === null) return { dominant: false, note: presence.note ? "program not authored in this run" : "nothing placed to measure" };
  const heightRatio = median.height === 0 ? Infinity : best.h / median.height;
  const footprintRatio = median.footprint === 0 ? Infinity : best.a / median.footprint;
  return {
    dominant: heightRatio >= DOMINANT_HEIGHT && footprintRatio >= DOMINANT_FOOTPRINT,
    by: best.id, height: best.h, footprint: best.a,
    medianHeight: median.height, medianFootprint: median.footprint,
    heightRatio: +heightRatio.toFixed(2), footprintRatio: +footprintRatio.toFixed(2),
  };
}

/** (iii) density: lots per 10k envelope cells, across every district. */
export function density(report) {
  let lots = 0, area = 0, blocks = 0;
  for (const d of report?.layout?.districts ?? []) {
    const b = d.bounds;
    area += (b.x1 - b.x0 + 1) * (b.z1 - b.z0 + 1);
    lots += d.stats?.lots ?? 0;
    blocks += d.stats?.blocks ?? 0;
  }
  if (area > 0) return { basis: "districts", lots, blocks, envelope: area, lotsPer10k: +((lots / area) * 1e4).toFixed(1) };
  // No district: a hamlet, a camp, a farm town of root-level buildings. Read
  // the buildings against their own hull, and say that is the basis.
  const B = report?.layout?.structures?.buildings ?? [];
  if (B.length === 0) return { basis: "none", lots: 0, blocks: 0, envelope: 0, lotsPer10k: 0 };
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const b of B) {
    x0 = Math.min(x0, b.footprint.x0); z0 = Math.min(z0, b.footprint.z0);
    x1 = Math.max(x1, b.footprint.x1); z1 = Math.max(z1, b.footprint.z1);
  }
  const hull = (x1 - x0 + 1) * (z1 - z0 + 1);
  return { basis: "buildings-hull", lots: B.length, blocks: 0, envelope: hull, lotsPer10k: +((B.length / hull) * 1e4).toFixed(1) };
}

/** (iv) archetype-less boxes in a pre-modern world. */
export function boxes(doc, report) {
  const era = doc.intent?.era ?? "";
  const preModern = era !== "" && !MODERN_ERAS.has(era);
  const B = report?.layout?.structures?.buildings ?? [];
  const bare = B.filter((b) => !b.meta?.params?.archetype);
  return { era, preModern, count: bare.length, of: B.length, sample: bare.slice(0, 5).map((b) => b.nodePath.split(".").pop()) };
}

/** (v) era fidelity: forbidden archetypes placed, and the pack/era mismatch note. */
export function eraFidelity(doc, report) {
  const forbid = new Set((doc.intent?.character?.archetypes?.forbid ?? []).map(String));
  const B = report?.layout?.structures?.buildings ?? [];
  const violations = B.filter((b) => forbid.has(b.meta?.params?.archetype ?? "")).map((b) => b.meta.params.archetype);
  const packEra = (report?.diagnostics ?? []).filter((d) => d.code === "LOAM-W517").length;
  return { era: doc.intent?.era ?? "", forbidden: [...forbid].slice(0, 8), violations, packEraMismatch: packEra };
}

/** (vi) the old floors. */
export function floors(report, ok) {
  const D = report?.diagnostics ?? [];
  return { compiled: ok, errors: D.filter((d) => /-E\d+$/.test(d.code)).length, diagnostics: D.length };
}

export function scoreDocument(prompt, doc, report, ok) {
  const icons = (prompt.icons ?? []).map((icon) => {
    const presence = iconPresence(icon, doc, report);
    const dom = iconDominance(icon, report, presence);
    return { id: icon.id, dominantRequired: icon.dominant === true, ...presence, dominance: dom };
  });
  const dens = density(report);
  const floor = prompt.densityFloor ?? 0;
  const alarms = [];
  for (const i of icons) {
    if (!i.present) alarms.push(`icon ${i.id} absent`);
    else if (i.dominantRequired && i.dominance && !i.dominance.dominant) {
      const d = i.dominance;
      alarms.push(
        d.note ? `icon ${i.id} placed but unmeasured (${d.note})`
        : d.volumeRatio !== undefined ? `icon ${i.id} not dominant (v×${d.volumeRatio}, a×${d.footprintRatio})`
        : `icon ${i.id} not dominant (h×${d.heightRatio}, a×${d.footprintRatio})`,
      );
    }
  }
  if (floor > 0 && dens.lotsPer10k < floor) alarms.push(`density ${dens.lotsPer10k} < floor ${floor}`);
  const bx = boxes(doc, report);
  if (bx.preModern && bx.count > 0) alarms.push(`${bx.count} archetype-less box(es) in a ${bx.era} world`);
  const era = eraFidelity(doc, report);
  if (era.violations.length > 0) alarms.push(`forbidden archetype(s): ${[...new Set(era.violations)].join(",")}`);
  const fl = floors(report, ok);
  if (!fl.compiled) alarms.push("did not compile");
  return { id: prompt.id, icons, density: { ...dens, floor, ok: floor === 0 || dens.lotsPer10k >= floor }, boxes: bx, era, floors: fl, alarms };
}

export function renderTable(scores) {
  const lines = ["| prompt | icons present | dominance | lots/10k (floor) | boxes | era | errors | alarms |", "|---|---|---|---|---|---|---|---|"];
  for (const s of scores) {
    const present = `${s.icons.filter((i) => i.present).length}/${s.icons.length}`;
    const dom = s.icons.filter((i) => i.dominantRequired).map((i) => {
      const d = i.dominance;
      if (!d) return `${i.id}:—`;
      if (d.dominant) return `${i.id}:yes`;
      if (d.note) return `${i.id}:unmeasured`;
      return d.volumeRatio !== undefined ? `${i.id}:no (v×${d.volumeRatio}, a×${d.footprintRatio})` : `${i.id}:no (h×${d.heightRatio}, a×${d.footprintRatio})`;
    }).join("; ") || "—";
    lines.push(`| ${s.id} | ${present} | ${dom} | ${s.density.lotsPer10k} (${s.density.floor}) | ${s.boxes.preModern ? s.boxes.count : "n/a"} | ${s.era.era}${s.era.violations.length ? " ✗" : ""} | ${s.floors.errors} | ${s.alarms.length ? s.alarms.join("; ") : "none"} |`);
  }
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const runDir = args.find((a) => !a.startsWith("--"));
  if (!runDir) {
    console.error("usage: icon-metric.mjs <runDir> [--only a,b] [--json] [--out <file>]");
    process.exit(2);
  }
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
  const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(runDir, "icon-metric.json");
  const suite = JSON.parse(fs.readFileSync(path.join(HERE, "prompts.json"), "utf8"));
  const { compileTerrain } = await import(path.join(REPO, "packages/compiler/dist/terrain/compile.js"));
  const scores = [];
  for (const prompt of suite.prompts) {
    if (only && !only.includes(prompt.id)) continue;
    const docPath = path.join(runDir, `${prompt.id}.doc.json`);
    if (!fs.existsSync(docPath)) continue;
    const doc = JSON.parse(fs.readFileSync(docPath, "utf8"));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "icon-metric-"));
    let report = null, ok = false;
    try {
      const result = await compileTerrain(doc, { outDir: path.join(tmp, "w") });
      ok = result.ok === true;
      report = result.report ?? null;
    } catch (e) {
      report = null;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    const s = scoreDocument(prompt, doc, report, ok);
    scores.push(s);
    console.error(`${prompt.id}: ${s.alarms.length ? s.alarms.join("; ") : "no alarms"}`);
  }
  const out = { run: path.basename(runDir), scoredAt: new Date().toISOString().slice(0, 10), thresholds: { dominantHeight: DOMINANT_HEIGHT, dominantFootprint: DOMINANT_FOOTPRINT }, scores };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
  if (args.includes("--json")) console.log(JSON.stringify(out));
  else console.log(renderTable(scores));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  await main();
}

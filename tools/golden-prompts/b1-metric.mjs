// B1 — the citadel. The metric, PRE-REGISTERED before the before-triplicate ran.
//
// Written down first, and deliberately, because this is the one measurement in
// the campaign where the tempting metric is saturated: WS-C's "the citadel is a
// plain box with no archetype" was half-fixed by cluster 3, and troy now names
// `megaron` in 15 runs out of 15. A `civicSetPiecePresent` metric would have
// read 15/15 BEFORE anything changed and reported success for free.
//
// What is actually still wrong is scale. The set-piece is named and is the same
// ~15x21 box as the houses — WS-C's "grand-named buildings are only 1.8x
// ordinary floor area, capped by the kit's cathedral box". So:
//
//   setPieceDominance   the largest CIVIC building's footprint area divided by
//                       the MEDIAN building footprint area in the same document.
//                       Measured over `building.grammar@0` nodes only. A citadel
//                       that reads as a citadel is several times the houses; the
//                       archived corpus sits at ~1.8x.
//
//   civicProgramPresent true when the document invokes a landmark program that
//                       is NOT the prompt's own noun — the civic heart getting
//                       its own bespoke budget rather than the budget going
//                       entirely to the horse/monster/ship. Currently true in
//                       1 run out of 14.
//
// CIVIC is a fixed list, fixed HERE, before the run. It is the class a
// settlement organises itself around — not every large building.
//
//   node b1-metric.mjs <run-dir> [<run-dir> …]        # per run, per prompt
import fs from "node:fs";
import path from "node:path";

/** The civic set-piece class. Fixed before measurement; every id verified to exist. */
export const CIVIC_ARCHETYPES = new Set([
  "megaron", "keep", "castle", "peripteral_temple", "temple", "cathedral",
  "bouleuterion", "palaestra", "sanctuary_treasury",
  "town_hall", "council_chamber", "manor_house", "hall",
  "tholos", "propylaea", "stoa",
]);

/**
 * The prompt's own noun — the icon a program is expected to be spent on anyway.
 * A program matching one of these does NOT count as the civic set-piece.
 */
const PROMPT_NOUNS = [
  "horse", "monster", "kraken", "leviathan", "saucer", "ufo", "alien", "ship",
  "galleon", "wreck", "unicorn", "pirate", "mothership", "pod", "spire",
];

const isPromptNoun = (id) => PROMPT_NOUNS.some((n) => id.toLowerCase().includes(n));

function buildings(doc) {
  const out = [];
  const walk = (n) => {
    if (n === null || typeof n !== "object") return;
    if (n.generator === "building.grammar@0") {
      const size = n.envelope?.size;
      if (Array.isArray(size) && size.length === 3) {
        out.push({ id: n.id, archetype: n.params?.archetype, area: size[0] * size[2], size: size.join("x") });
      }
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(doc.root);
  return out;
}

function programsOf(doc) {
  const out = [];
  const walk = (n) => {
    if (n === null || typeof n !== "object") return;
    if (typeof n.generator === "string" && n.generator.startsWith("authored:")) out.push(n.generator.slice(9));
    for (const c of n.children ?? []) walk(c);
  };
  walk(doc.root);
  return out;
}

const median = (xs) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function b1Metrics(doc) {
  const b = buildings(doc);
  const med = median(b.map((x) => x.area));
  const civic = b.filter((x) => x.archetype !== undefined && CIVIC_ARCHETYPES.has(x.archetype));
  const top = civic.sort((x, y) => y.area - x.area)[0];
  const progs = programsOf(doc);
  const civicProgs = progs.filter((p) => !isPromptNoun(p));
  return {
    buildings: b.length,
    medianArea: med,
    setPiece: top === undefined ? null : `${top.archetype} ${top.size}`,
    setPieceArea: top?.area ?? 0,
    setPieceDominance: top === undefined || med === 0 ? 0 : +(top.area / med).toFixed(2),
    programs: progs,
    civicProgramPresent: civicProgs.length > 0,
  };
}

// Importable: the CLI runs only when this file is the entry point, so
// `b1Metrics` can be reused by an analysis script without printing anything.
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

const dirs = invokedDirectly ? process.argv.slice(2) : [];
if (invokedDirectly && dirs.length === 0) {
  console.error("usage: node b1-metric.mjs <run-dir> [<run-dir> …]");
  process.exit(2);
}

for (const dir of dirs) {
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved)) continue;
  for (const file of fs.readdirSync(resolved).filter((f) => f.endsWith(".doc.json")).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(resolved, file), "utf8"));
    const m = b1Metrics(doc);
    console.log(
      `${path.basename(resolved).padEnd(18)} ${file.replace(".doc.json", "").padEnd(22)}` +
        ` dominance ${String(m.setPieceDominance).padStart(5)}` +
        `  set-piece ${(m.setPiece ?? "(none)").padEnd(28)}` +
        ` civicProgram ${m.civicProgramPresent ? "YES" : "no "}  [${m.programs.join(",")}]`,
    );
  }
}

#!/usr/bin/env node
/**
 * Retroactively rename the standing battery's worlds to `<slug>_v<N>`.
 *
 * The battery rolls the same seven prompts over and over, and the authoring
 * model picks a fresh world name every single roll: the Trojan-horse prompt
 * alone has landed in the saves folder as `troy_luna`, `trojan_horse_troy_gem`,
 * `troy_horse_c1`..`__c5b`, `trojan_horse_in_troy_final`, `_padfix`, `_tie`,
 * `_tie2` and `_gem2`. Nothing in those names says which prompt they belong to
 * or which came first, so the world list is unwalkable.
 *
 * The fix is to make the PROMPT the identity. Each prompt gets one canonical
 * slug, and each world gets its ordinal within that slug in generation order —
 * `troy_v1` … `troy_v13`. The ordering authority is the DECK (the battery run
 * that produced it: luna, gem1, the c-series, final, padfix, tie, tie2, gem2,
 * gemhero), not the folder mtime: the saves folder has been reinstalled from
 * archives repeatedly, so mtimes reflect when a world was last copied, not
 * when it was generated. Deck membership is read off the folder name and
 * pinned in the table below, one line per world, cross-checked against
 * battery/candidates/p<N>-<deck>/ and its doc's world name.
 *
 * Renaming touches two things and nothing else: the directory name, and the
 * `LevelName` string inside `level.dat` so the in-game list agrees with the
 * disk. Region files are never opened. The NBT round-trip is the compiler's
 * own `stampLevelDat`, imported rather than reimplemented.
 *
 * Anything not in the table is left strictly alone — the example worlds, the
 * devworlds, the bespoke gauntlets, and every battery-adjacent one-off whose
 * deck could not be established with confidence. A wrong rename is worse than
 * no rename, so the default for ambiguity is "leave it and say so".
 *
 * Usage:
 *   node tools/worlds/rename-worlds.mjs --dry-run   # plan only, writes RENAME-PLAN.md
 *   node tools/worlds/rename-worlds.mjs             # execute, writes RENAME-LEDGER.md
 *   ... [--saves <dir>]
 */

import { readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stampLevelDat } from "../../packages/cli/dist/install.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SAVES =
  "/Users/kaihoward/Library/Application Support/PrismLauncher/instances/Fabulously Optimized/minecraft/saves";

/** The seven standing prompts, and the canonical slug each one owns. */
export const SLUGS = {
  pirates_v_unicorns: "p1 — A pirate island and a unicorn island, at war.",
  alien_farm: "p2 — alien invasion of a farming town",
  troy: "p3 — the Trojan horse, in Troy",
  metropolis_hideout: "p4 — hideout in an overgrown metropolis",
  hellenist_city: "p5 — modern Hellenist city under assault",
  redwood_camp: "p6 — redwood logging camp",
  glowcap_vale: "p7 — glowing mushroom vale",
};

/**
 * Deck ordering. The battery's runs happened in this sequence, so a world's
 * deck fixes its place in its prompt's series regardless of when the folder
 * was last touched on disk. Within the c-series the candidate index orders
 * them, with `b` re-rolls sitting immediately after the candidate they redo.
 */
const DECK_RANK = {
  luna: 100,
  "luna-intent": 101,
  "luna-full": 102,
  "luna-hh": 103,
  gem1: 200,
  c1: 300,
  c2: 310,
  c3: 320,
  c3b: 325,
  c4: 330,
  c5: 340,
  c5b: 345,
  final: 400,
  padfix: 500,
  tie: 600,
  tie2: 700,
  gem2: 800,
  hero1: 900,
  hero2: 910,
  hero3: 920,
};

/**
 * Every saves-folder name that could be tied to a prompt and a deck.
 *
 * `doc` is the world name the authoring model chose in that deck's Loam
 * document (from battery/candidates/p<N>-<deck>/*.loam.json), kept here so the
 * ledger records what each version *used* to be called in its own document.
 * Decks that predate the archive (the luna era) and the two later decks that
 * were never archived (tie, gem2, gemhero) carry the folder's own name.
 */
const WORLDS = [
  // p1 — pirates vs unicorns
  ["unicorn_pirate_isles_luna", "pirates_v_unicorns", "luna", "unicorn_pirate_isles"],
  ["unicorn_pirate_isles_luna-intent", "pirates_v_unicorns", "luna-intent", "unicorn_pirate_isles"],
  ["unicorn_pirate_isles_luna-full", "pirates_v_unicorns", "luna-full", "unicorn_pirate_isles"],
  ["twin_isles_war_luna-hh", "pirates_v_unicorns", "luna-hh", "twin_isles_war"],
  ["pirate_vs_unicorn_isles_gem", "pirates_v_unicorns", "gem1", "pirate_vs_unicorn_isles"],
  ["pirate_unicorn_war_c1", "pirates_v_unicorns", "c1", "pirate_unicorn_war"],
  ["pirate_unicorn_war_c2", "pirates_v_unicorns", "c2", "pirate_unicorn_war"],
  ["pirate_unicorn_war__c3", "pirates_v_unicorns", "c3", "pirate_unicorn_war"],
  ["pirate_unicorn_war_final", "pirates_v_unicorns", "final", "pirate_unicorn_war"],
  ["pirate_unicorn_war_padfix", "pirates_v_unicorns", "padfix", "pirate_unicorn_war"],
  ["pirates_vs_unicorns_tie", "pirates_v_unicorns", "tie", "pirates_vs_unicorns"],
  ["pirate_unicorn_war_tie2", "pirates_v_unicorns", "tie2", "pirate_unicorn_war"],
  ["corsair_and_unicorn_gem2", "pirates_v_unicorns", "gem2", "corsair_and_unicorn"],
  ["isles_of_war_gem37-hh", "pirates_v_unicorns", "hero1", "isles_of_war"],
  ["isles_of_war_gem37-v2", "pirates_v_unicorns", "hero2", "isles_of_war"],
  ["isles_of_war_gem37-v3", "pirates_v_unicorns", "hero3", "isles_of_war"],

  // p2 — alien invasion farm
  ["alien_farm_invasion_gem", "alien_farm", "gem1", "alien_farm_invasion"],
  ["alien_farm_town_c1", "alien_farm", "c1", "alien_farm_town"],
  ["farmtown_invasion_c2", "alien_farm", "c2", "farmtown_invasion"],
  ["alien_farm_town__c3", "alien_farm", "c3", "alien_farm_town"],
  ["alien_invasion_farm_final", "alien_farm", "final", "alien_invasion_farm"],

  // p3 — Troy
  ["troy_luna", "troy", "luna", "troy"],
  ["trojan_horse_troy_gem", "troy", "gem1", "trojan_horse_troy"],
  ["troy_horse_c1", "troy", "c1", "troy_horse"],
  ["troy_horse_c2", "troy", "c2", "troy_horse"],
  ["troy_horse_c3", "troy", "c3", "troy_horse"],
  ["troy_horse__c4", "troy", "c4", "troy_horse"],
  ["troy_horse__c5", "troy", "c5", "troy_horse"],
  ["troy_horse__c5b", "troy", "c5b", "troy_horse"],
  ["trojan_horse_in_troy_final", "troy", "final", "trojan_horse_in_troy"],
  ["trojan_horse_in_troy_padfix", "troy", "padfix", "trojan_horse_in_troy"],
  ["trojan_horse_troy_tie", "troy", "tie", "trojan_horse_troy"],
  ["trojan_horse_in_troy_tie2", "troy", "tie2", "trojan_horse_in_troy"],
  ["trojan_horse_in_troy_gem2", "troy", "gem2", "trojan_horse_in_troy"],

  // p4 — metropolis hideout
  ["overgrown_metropolis_hideout_gem", "metropolis_hideout", "gem1", "overgrown_metropolis_hideout"],
  ["overgrown_metropolis_c1", "metropolis_hideout", "c1", "overgrown_metropolis"],
  ["overgrown_hideout_c2", "metropolis_hideout", "c2", "overgrown_hideout"],
  ["overgrown_hideout__c3", "metropolis_hideout", "c3", "overgrown_hideout"],
  ["overgrown_hideout_c3b", "metropolis_hideout", "c3b", "overgrown_hideout"],
  ["metropolis_hideout_final", "metropolis_hideout", "final", "metropolis_hideout"],

  // p5 — modern Hellenist city
  ["modern_hellenist_assault_gem", "hellenist_city", "gem1", "modern_hellenist_assault"],
  ["hellenist_siege_c1", "hellenist_city", "c1", "hellenist_siege"],
  ["hellenist_sea_siege_c3", "hellenist_city", "c3", "hellenist_sea_siege"],
  ["hellenist_sea_siege__c4", "hellenist_city", "c4", "hellenist_sea_siege"],
  ["modern_hellenist_siege_final", "hellenist_city", "final", "modern_hellenist_siege"],
  ["neopolis_abyssal_siege_padfix", "hellenist_city", "padfix", "neopolis_abyssal_siege"],
  ["neo_hellas_invasion_tie", "hellenist_city", "tie", "neo_hellas_invasion"],
  ["modern_hellenist_invasion_tie2", "hellenist_city", "tie2", "modern_hellenist_invasion"],
  ["neo_athens_invasion_gem2", "hellenist_city", "gem2", "neo_athens_invasion"],

  // p6 — redwood logging camp
  ["redwood_logging_camp_gem", "redwood_camp", "gem1", "redwood_logging_camp"],
  ["redwood_camp_c1", "redwood_camp", "c1", "redwood_camp"],
  ["redwood_camp__c2", "redwood_camp", "c2", "redwood_camp"],
  ["redwood_logging_camp_final", "redwood_camp", "final", "redwood_logging_camp"],

  // p7 — glowing mushroom vale
  ["glowing_mushroom_vale_gem", "glowcap_vale", "gem1", "glowing_mushroom_vale"],
  ["mushroom_vale_c1", "glowcap_vale", "c1", "mushroom_vale"],
  ["glowcap_vale__c2", "glowcap_vale", "c2", "glowcap_vale"],
  ["glowing_mushroom_vale_final", "glowcap_vale", "final", "glowing_mushroom_vale"],
  ["glowing_mushroom_vale_padfix", "glowcap_vale", "padfix", "glowing_mushroom_vale"],
  ["glowing_mushroom_vale_tie", "glowcap_vale", "tie", "glowing_mushroom_vale"],
  ["glowcap_vale_tie2", "glowcap_vale", "tie2", "glowcap_vale"],
];

/**
 * Build the old→new plan from the table, restricted to what is actually on disk.
 *
 * Versions are assigned per slug over the worlds *present*, in deck order. A
 * world listed in the table but missing from this saves folder simply does not
 * consume a number — the sequence is over what exists here, so it is dense and
 * the highest version is also the count. That makes `--series` (which picks
 * highest + 1) land exactly on the next one.
 */
export function buildPlan(present) {
  const here = new Set(present);
  const bySlug = new Map();
  for (const [folder, slug, deck, doc] of WORLDS) {
    if (!here.has(folder)) continue;
    const rank = DECK_RANK[deck];
    if (rank === undefined) throw new Error(`unknown deck "${deck}" for ${folder}`);
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push({ folder, slug, deck, doc, rank });
  }

  const plan = [];
  for (const slug of Object.keys(SLUGS)) {
    const rows = (bySlug.get(slug) ?? []).sort((a, b) => a.rank - b.rank);
    rows.forEach((row, index) => {
      plan.push({ ...row, version: index + 1, to: `${slug}_v${index + 1}` });
    });
  }

  const known = new Set(WORLDS.map(([folder]) => folder));
  const unmatched = present.filter((folder) => !known.has(folder)).sort();
  return { plan, unmatched, missing: WORLDS.map(([f]) => f).filter((f) => !here.has(f)) };
}

/**
 * Refuse a plan that could destroy a world.
 *
 * Two failure modes matter: two sources aiming at one target (the second
 * rename would clobber the first), and a target that already exists on disk
 * and is not itself being renamed away. Both are checked before a single
 * `rename` call runs, because a half-applied plan is the worst outcome.
 */
export function checkPlan(plan, present) {
  const problems = [];
  const targets = new Map();
  for (const row of plan) {
    if (targets.has(row.to)) problems.push(`${row.to} claimed by both ${targets.get(row.to)} and ${row.folder}`);
    targets.set(row.to, row.folder);
  }
  const moving = new Set(plan.map((row) => row.folder));
  for (const row of plan) {
    if (present.includes(row.to) && !moving.has(row.to)) {
      problems.push(`${row.to} already exists on disk and is not being renamed away`);
    }
  }
  return problems;
}

/**
 * Folder names in `plan` that Minecraft currently has open.
 *
 * Renaming a directory the game is running from does not stop the game: it
 * keeps writing through its open handles and, on quit, flushes its own
 * level.dat back over whatever we put there — including the LevelName we just
 * rewrote — while the player's world list now shows two entries for one save.
 * `session.lock` is the file the client holds for exactly this purpose, so we
 * ask the OS who has it. If `lsof` cannot be run at all we return nothing
 * rather than block: an un-runnable check is not evidence of danger.
 */
async function openInMinecraft(savesDir, plan) {
  const { execFile } = await import("node:child_process");
  const locks = plan.map((row) => path.join(savesDir, row.folder, "session.lock"));
  const held = await new Promise((resolve) => {
    execFile("lsof", ["-t", "--", ...locks], (error, stdout) => {
      if (error !== null && stdout.trim() === "") resolve("");
      else resolve(stdout);
    });
  }).catch(() => "");
  if (held.trim() === "") return [];
  // `lsof -t` prints pids only, so re-ask per file to learn *which* is held.
  const busy = [];
  for (const row of plan) {
    const lock = path.join(savesDir, row.folder, "session.lock");
    const out = await new Promise((resolve) => {
      execFile("lsof", ["-t", "--", lock], (error, stdout) => resolve(error !== null && stdout.trim() === "" ? "" : stdout));
    });
    if (out.trim() !== "") busy.push(row.folder);
  }
  return busy;
}

function table(plan) {
  const lines = ["| old name | new name | deck | doc world name |", "| --- | --- | --- | --- |"];
  for (const row of plan) lines.push(`| \`${row.folder}\` | \`${row.to}\` | ${row.deck} | ${row.doc} |`);
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const savesIndex = args.indexOf("--saves");
  const savesDir = savesIndex === -1 ? DEFAULT_SAVES : args[savesIndex + 1];

  const entries = await readdir(savesDir, { withFileTypes: true });
  const present = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const built = buildPlan(present);
  const { unmatched, missing } = built;
  // A world the game has open keeps its old name and its slot: versions are
  // assigned from the table, not from a running counter, so dropping one row
  // leaves every other version exactly where the dry run said it would be.
  const busy = await openInMinecraft(savesDir, built.plan);
  const plan = built.plan.filter((row) => !busy.includes(row.folder));
  const problems = checkPlan(plan, present);

  console.log(table(plan));
  console.log(`\n${plan.length} world(s) to rename; ${unmatched.length} left untouched.`);
  if (missing.length > 0) console.log(`not present in this saves folder: ${missing.join(", ")}`);
  if (busy.length > 0) {
    console.log(
      `SKIPPED (open in Minecraft right now): ${busy.join(", ")} — ` +
        "quit to the title screen and re-run to finish them.",
    );
  }
  if (problems.length > 0) {
    console.error(`\nREFUSING — plan is not safe:\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
    return;
  }

  const header = [
    `# World rename ${dryRun ? "plan" : "ledger"}`,
    "",
    `Saves directory: \`${savesDir}\``,
    "",
    "Canonical per-prompt slugs, versioned in generation (deck) order.",
    "",
    table(plan),
    "",
    "## Left untouched",
    "",
    "Not part of the standing battery, or deck could not be established:",
    "",
    ...unmatched.map((name) => `- \`${name}\``),
    "",
    ...(busy.length === 0
      ? []
      : ["## Skipped — open in Minecraft", "", ...busy.map((name) => `- \`${name}\``), ""]),
  ].join("\n");

  if (dryRun) {
    await writeFile(path.join(HERE, "RENAME-PLAN.md"), header);
    console.log(`\ndry run — wrote ${path.join(HERE, "RENAME-PLAN.md")}; nothing on disk changed.`);
    return;
  }

  // Two phases through a scratch prefix: a plan can legitimately map A→B while
  // some other world maps B→C, and renaming in place would collide mid-flight.
  const staged = [];
  for (const row of plan) {
    const temp = path.join(savesDir, `.renaming__${row.to}`);
    await rename(path.join(savesDir, row.folder), temp);
    staged.push([temp, row]);
  }
  for (const [temp, row] of staged) {
    const final = path.join(savesDir, row.to);
    await rename(temp, final);
    const levelDat = path.join(final, "level.dat");
    const info = await stat(levelDat);
    await stampLevelDat(levelDat, Math.floor(info.mtimeMs), row.to);
    console.log(`renamed ${row.folder} -> ${row.to}`);
  }

  await writeFile(path.join(HERE, "RENAME-LEDGER.md"), header);
  console.log(`\nrenamed ${plan.length} world(s); wrote ${path.join(HERE, "RENAME-LEDGER.md")}.`);
}

if (process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  await main();
}

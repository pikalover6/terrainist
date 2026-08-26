#!/usr/bin/env node
/**
 * Re-rename the battery's worlds from `<slug>_v<N>` to `<slug>_r<N>` cohorts.
 *
 * The first rename (`rename-worlds.mjs`) made the PROMPT the identity, which
 * fixed the unreadable model-chosen names. It left one thing broken: the
 * number. Each slug got its own private counter, so a single compiler build
 * shipped as `alien_farm_v5` and `pirates_v_unicorns_v17` on the same
 * afternoon — two names that say nothing whatever about being siblings, and a
 * comparison between `troy_v14` and `hellenist_city_v10` reads like a
 * comparison across seven versions when it is in fact the same build.
 *
 * The fix is to make the BUILD the number. A *release* is one deck: one
 * compiler build, one authoring batch. Every world from that deck carries the
 * release's number, so `troy_r16`, `hellenist_city_r16` and
 * `pirates_v_unicorns_r16` are one build seen through three prompts. Numbers
 * are dense per release, never per slug — a prompt absent from a deck has no
 * world at that number, and the gap is information.
 *
 * The deck order is not re-litigated here: it is the order already ratified in
 * RENAME-LEDGER.md, which is what every existing `_v` number encodes. That
 * makes the mapping monotone within each slug — v1 < v2 implies r(v1) < r(v2)
 * — so no walk note that says "v12 was better than v9" is contradicted by the
 * rename. The full table, with dates, archive commits and per-deck notes,
 * lives in `battery/RELEASES.md`; this script is its executable half.
 *
 * Discipline is unchanged from the first rename: dry run first, refuse any
 * plan that could clobber a world, skip whatever Minecraft has open, rewrite
 * both the directory name and `LevelName`, never touch region data, and append
 * to the ledger rather than rewriting it.
 *
 * Usage:
 *   node tools/worlds/rerename-worlds.mjs --dry-run   # plan only, writes RERENAME-PLAN.md
 *   node tools/worlds/rerename-worlds.mjs             # execute, appends to RENAME-LEDGER.md
 *   ... [--saves <dir>]
 */

import { readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stampLevelDat } from "../../../packages/cli/dist/install.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SAVES =
  "/Users/kaihoward/Library/Application Support/PrismLauncher/instances/Fabulously Optimized/minecraft/saves";

/**
 * The releases, in generation order. Index + 1 is the release number.
 *
 * This is the same deck sequence `rename-worlds.mjs` used to order the `_v`
 * counters, extended with the `v14` deck that landed after it. Keeping it
 * identical is deliberate: it is the ordering Kai's walk notes already assume.
 */
export const RELEASES = [
  "luna",
  "luna-intent",
  "luna-full",
  "luna-hh",
  "gem1",
  "c1",
  "c2",
  "c3",
  "c3b",
  "c4",
  "c5",
  "c5b",
  "final",
  "padfix",
  "tie",
  "tie2",
  "gem2",
  "hero1",
  "hero2",
  "hero3",
  "v14",
];

/** Deck name -> release number. */
export const RELEASE_OF = Object.fromEntries(RELEASES.map((deck, i) => [deck, i + 1]));

/**
 * Every battery world on disk today, with the deck that produced it.
 *
 * Keyed by the world's CURRENT folder name rather than by the model's original
 * name, because the first rename already happened: what is on disk is
 * `troy_v9`, not `trojan_horse_in_troy_final`. The decks are carried straight
 * over from RENAME-LEDGER.md, plus the three worlds of the `v14` deck (which
 * installed themselves under series naming and so never appeared in that
 * ledger) and `glowcap_vale_tie2`, which the first rename skipped because the
 * game had it open.
 */
const WORLDS = [
  // p1 — pirates vs unicorns
  ["pirates_v_unicorns_v1", "pirates_v_unicorns", "luna"],
  ["pirates_v_unicorns_v2", "pirates_v_unicorns", "luna-intent"],
  ["pirates_v_unicorns_v3", "pirates_v_unicorns", "luna-full"],
  ["pirates_v_unicorns_v4", "pirates_v_unicorns", "luna-hh"],
  ["pirates_v_unicorns_v5", "pirates_v_unicorns", "gem1"],
  ["pirates_v_unicorns_v6", "pirates_v_unicorns", "c1"],
  ["pirates_v_unicorns_v7", "pirates_v_unicorns", "c2"],
  ["pirates_v_unicorns_v8", "pirates_v_unicorns", "c3"],
  ["pirates_v_unicorns_v9", "pirates_v_unicorns", "final"],
  ["pirates_v_unicorns_v10", "pirates_v_unicorns", "padfix"],
  ["pirates_v_unicorns_v11", "pirates_v_unicorns", "tie"],
  ["pirates_v_unicorns_v12", "pirates_v_unicorns", "tie2"],
  ["pirates_v_unicorns_v13", "pirates_v_unicorns", "gem2"],
  ["pirates_v_unicorns_v14", "pirates_v_unicorns", "hero1"],
  ["pirates_v_unicorns_v15", "pirates_v_unicorns", "hero2"],
  ["pirates_v_unicorns_v16", "pirates_v_unicorns", "hero3"],
  ["pirates_v_unicorns_v17", "pirates_v_unicorns", "v14"],

  // p2 — alien invasion farm
  ["alien_farm_v1", "alien_farm", "gem1"],
  ["alien_farm_v2", "alien_farm", "c1"],
  ["alien_farm_v3", "alien_farm", "c2"],
  ["alien_farm_v4", "alien_farm", "c3"],
  ["alien_farm_v5", "alien_farm", "final"],

  // p3 — Troy
  ["troy_v1", "troy", "luna"],
  ["troy_v2", "troy", "gem1"],
  ["troy_v3", "troy", "c1"],
  ["troy_v4", "troy", "c2"],
  ["troy_v5", "troy", "c3"],
  ["troy_v6", "troy", "c4"],
  ["troy_v7", "troy", "c5"],
  ["troy_v8", "troy", "c5b"],
  ["troy_v9", "troy", "final"],
  ["troy_v10", "troy", "padfix"],
  ["troy_v11", "troy", "tie"],
  ["troy_v12", "troy", "tie2"],
  ["troy_v13", "troy", "gem2"],
  ["troy_v14", "troy", "v14"],

  // p4 — metropolis hideout
  ["metropolis_hideout_v1", "metropolis_hideout", "gem1"],
  ["metropolis_hideout_v2", "metropolis_hideout", "c1"],
  ["metropolis_hideout_v3", "metropolis_hideout", "c2"],
  ["metropolis_hideout_v4", "metropolis_hideout", "c3"],
  ["metropolis_hideout_v5", "metropolis_hideout", "c3b"],
  ["metropolis_hideout_v6", "metropolis_hideout", "final"],

  // p5 — modern Hellenist city
  ["hellenist_city_v1", "hellenist_city", "gem1"],
  ["hellenist_city_v2", "hellenist_city", "c1"],
  ["hellenist_city_v3", "hellenist_city", "c3"],
  ["hellenist_city_v4", "hellenist_city", "c4"],
  ["hellenist_city_v5", "hellenist_city", "final"],
  ["hellenist_city_v6", "hellenist_city", "padfix"],
  ["hellenist_city_v7", "hellenist_city", "tie"],
  ["hellenist_city_v8", "hellenist_city", "tie2"],
  ["hellenist_city_v9", "hellenist_city", "gem2"],
  ["hellenist_city_v10", "hellenist_city", "v14"],

  // p6 — redwood logging camp
  ["redwood_camp_v1", "redwood_camp", "gem1"],
  ["redwood_camp_v2", "redwood_camp", "c1"],
  ["redwood_camp_v3", "redwood_camp", "c2"],
  ["redwood_camp_v4", "redwood_camp", "final"],

  // p7 — glowing mushroom vale
  ["glowcap_vale_v1", "glowcap_vale", "gem1"],
  ["glowcap_vale_v2", "glowcap_vale", "c1"],
  ["glowcap_vale_v3", "glowcap_vale", "c2"],
  ["glowcap_vale_v4", "glowcap_vale", "final"],
  ["glowcap_vale_v5", "glowcap_vale", "padfix"],
  ["glowcap_vale_v6", "glowcap_vale", "tie"],
  // Skipped by the first rename — the game had it open, so it still wears its
  // deck name. It folds straight into the cohort scheme.
  ["glowcap_vale_tie2", "glowcap_vale", "tie2"],
];

/** The folder (and display) name for `slug` in release `release`. */
export function releaseName(slug, release) {
  return `${slug}_r${release}`;
}

/**
 * Build the old->new plan from the table, restricted to what is on disk.
 *
 * Unlike the first rename there is no counting here: a world's number is a
 * property of its deck, so a world missing from this saves folder changes
 * nothing about any other world's name. That is the whole point — the numbers
 * are stable facts about builds, not positions in a list.
 */
export function buildPlan(present) {
  const here = new Set(present);
  const plan = [];
  for (const [folder, slug, deck] of WORLDS) {
    const release = RELEASE_OF[deck];
    if (release === undefined) throw new Error(`unknown deck "${deck}" for ${folder}`);
    if (!here.has(folder)) continue;
    plan.push({ folder, slug, deck, release, to: releaseName(slug, release) });
  }
  const known = new Set(WORLDS.map(([folder]) => folder));
  const unmatched = present.filter((folder) => !known.has(folder)).sort();
  const missing = WORLDS.map(([f]) => f).filter((f) => !here.has(f));
  return { plan, unmatched, missing };
}

/**
 * Refuse a plan that could destroy a world.
 *
 * Same two failure modes as the first rename — two sources aiming at one
 * target, and a target already on disk that is not itself moving away — plus
 * one this scheme makes possible: a slug/deck pair appearing twice would mean
 * two worlds claiming to be the same build of the same prompt, which is a
 * table error rather than a disk accident and is worth naming as such.
 */
export function checkPlan(plan, present) {
  const problems = [];
  const targets = new Map();
  for (const row of plan) {
    const seen = targets.get(row.to);
    if (seen !== undefined) {
      problems.push(
        `${row.to} claimed by both ${seen} and ${row.folder} — ` +
          `two worlds cannot both be ${row.slug} at release r${row.release}`,
      );
    }
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
  const busy = [];
  for (const row of plan) {
    const lock = path.join(savesDir, row.folder, "session.lock");
    const out = await new Promise((resolve) => {
      execFile("lsof", ["-t", "--", lock], (error, stdout) =>
        resolve(error !== null && stdout.trim() === "" ? "" : stdout),
      );
    }).catch(() => "");
    if (out.trim() !== "") busy.push(row.folder);
  }
  return busy;
}

function table(plan) {
  const lines = ["| v-name | r-name | release | deck |", "| --- | --- | --- | --- |"];
  for (const row of plan) {
    lines.push(`| \`${row.folder}\` | \`${row.to}\` | r${row.release} | ${row.deck} |`);
  }
  return lines.join("\n");
}

/** Releases in this plan, each with the slugs that made it — the manifest view. */
function cohorts(plan) {
  const byRelease = new Map();
  for (const row of plan) {
    if (!byRelease.has(row.release)) byRelease.set(row.release, { deck: row.deck, slugs: [] });
    byRelease.get(row.release).slugs.push(row.slug);
  }
  const lines = ["| release | deck | slugs |", "| --- | --- | --- |"];
  for (const release of [...byRelease.keys()].sort((a, b) => a - b)) {
    const { deck, slugs } = byRelease.get(release);
    lines.push(`| r${release} | ${deck} | ${slugs.join(", ")} |`);
  }
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

  const body = [
    `Saves directory: \`${savesDir}\``,
    "",
    "Release (build cohort) names: every world from one deck shares its number,",
    "across prompts. Numbers are dense per release, never per slug — a gap in a",
    "slug's series means that prompt was not rolled in that deck. The manifest is",
    "`battery/RELEASES.md`.",
    "",
    table(plan),
    "",
    "### Cohorts",
    "",
    cohorts(plan),
    "",
    ...(busy.length === 0 ? [] : ["### Skipped — open in Minecraft", "", ...busy.map((n) => `- \`${n}\``), ""]),
  ].join("\n");

  if (dryRun) {
    await writeFile(
      path.join(HERE, "RERENAME-PLAN.md"),
      `# World re-rename plan — v-numbers to release cohorts\n\n${body}`,
    );
    console.log(`\ndry run — wrote ${path.join(HERE, "RERENAME-PLAN.md")}; nothing on disk changed.`);
    return;
  }

  // Two phases through a scratch prefix: a plan can legitimately map A->B while
  // some other world maps B->C, and renaming in place would collide mid-flight.
  const staged = [];
  for (const row of plan) {
    const temp = path.join(savesDir, `.rerenaming__${row.to}`);
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

  // Append, never rewrite: the first mapping is how a walk note from before
  // today is read, and deleting it would make those notes unresolvable.
  const ledger = path.join(HERE, "RENAME-LEDGER.md");
  const previous = await readFile(ledger, "utf8");
  const marker = "## Second mapping — release cohorts";
  const kept = previous.includes(marker) ? previous.slice(0, previous.indexOf(marker)) : previous;
  await writeFile(ledger, `${kept.trimEnd()}\n\n${marker}\n\n${body}\n`);
  console.log(`\nrenamed ${plan.length} world(s); appended the mapping to ${ledger}.`);
}

if (process.argv[1] !== undefined && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  await main();
}

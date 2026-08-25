// Dynamic context assembly for the golden-prompt harness (A3, offline form):
// which example modules a prompt gets, chosen from its classified intent and
// its own words — never from a draw. The Stocktake Run's E1 arm 3.
//
// Selection is by *topic*, because the settlement kit fences its examples per
// topic (only one of its 67 fences names a form pack — `split-kit.mjs`). The
// complete-example module is never selected: a whole-document copy is the
// copy-mode side effect A3 exists to retire, and arm 3 measures targeted
// examples, not a shorter kit.
import fs from "node:fs";
import path from "node:path";

export const ALWAYS = ["1-document-skeleton", "2-coordinates-and-zones"];
export const NEVER = ["13-complete-example"];

/** The modules a prompt gets: `[slug, why]` pairs, in a fixed order. */
export function selectModules(prompt, kitName, intent) {
  const text = String(prompt.prompt ?? "").toLowerCase();
  const c = intent?.character ?? {};
  const out = [];
  const add = (slug, why) => {
    if (NEVER.includes(slug) || out.some(([s]) => s === slug)) return;
    out.push([slug, why]);
  };
  for (const s of ALWAYS) add(s, "always");
  if (kitName === "terrain") {
    for (const s of ["3-terrain-heightfield", "5-terrain-climate", "6-scatter-forest", "strata", "8-worked-terrain-patterns"]) add(s, "terrain kit");
    return out;
  }
  for (const s of ["building-grammar", "district", "road-network", "the-plaza", "11-worked-settlement-fragments"]) add(s, "settlement");
  const urban = String(c.urbanForm ?? "");
  if (/city|metropolis|downtown/.test(text) || ["grid", "radial", "axial", "city"].includes(urban)) {
    add("city", `urbanForm ${urban || "(prompt says city)"}`);
    add("the-urban-forms", "city forms");
  }
  if (c.fortification === "walled" || /wall|citadel|fort/.test(text)) {
    for (const s of ["9c-infra-entry", "the-entries-and-one-worked-example-each", "multi-level-ground"]) add(s, "walled");
  }
  if ((intent?.decline ?? 0) >= 0.5 || /ruin|overgrown|abandon|apocalyp/.test(text)) add("a-ruined-city-is-a-district-with-a-high-", `decline ${intent?.decline ?? "(prompt)"}`);
  const icons = String(intent?.tokens?.icons ?? "");
  if (icons.trim() !== "" || /statue|horse|colossus|monster|alien|ufo|saucer|mothership/.test(text)) {
    for (const s of ["bespoke-programs-must-belong-to-the-worl", "how-to-write-the-request", "what-you-get-back-and-what-to-do-with-it", "seating-how-a-grounded-thing-meets-the-g", "facing-which-way-it-looks"]) add(s, "icons");
    if (/hover|fly|airborne|mothership|ufo|saucer|airship/.test(text + " " + icons.toLowerCase())) add("hovering-airborne-things", "airborne icon");
  }
  if (/\bisland\b.*\bisland\b|\btwo\b|\band a\b.*\bat war\b/.test(text)) add("two-regions-in-one-world", "two places");
  if (/harbour|harbor|port|quay|sea|coast|pirate/.test(text)) add("precinct-harbour", "water");
  if (/farm|agrar|crop|barn/.test(text) || (c.formPacks ?? []).includes("agrarian")) add("precinct-farm", "farm");
  if (/airport|airfield|runway/.test(text)) add("precinct-airport", "airport");
  if ((c.formPacks ?? []).some((p) => /swamp|witch|fung|mushroom/.test(p)) || /mushroom|fung|glow/.test(text)) add("a-fungal-grove-you-can-copy", "fungal pack");
  if (/tunnel|cellar|mine|underground|bunker/.test(text)) add("tunnels-and-cellars", "underground");
  if (/river|canal|millpond|lake|water/.test(text)) add("worked-water", "water feature");
  return out;
}

/** Read the selected modules from `dir` into one system message; missing modules are named, not silently skipped. */
export function assembleModules(dir, selected) {
  const parts = [];
  const missing = [];
  for (const [slug] of selected) {
    const file = path.join(dir, `${slug}.md`);
    if (!fs.existsSync(file)) {
      missing.push(slug);
      continue;
    }
    parts.push(fs.readFileSync(file, "utf8").trim());
  }
  const text =
    parts.length === 0
      ? ""
      : "# Worked examples for this prompt\n\nThe kit above withholds its fenced examples. These are the ones that apply here; the kit's rules govern them.\n\n" +
        parts.join("\n\n---\n\n") +
        "\n";
  return { text, bytes: text.length, used: selected.filter(([s]) => !missing.includes(s)).map(([s]) => s), missing };
}

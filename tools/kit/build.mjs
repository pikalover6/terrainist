#!/usr/bin/env node
// Build the settlement author kit from its prose source and the code's own
// registries.
//
//   node tools/kit/build.mjs            # write kits/settlement-author.md
//   node tools/kit/build.mjs --check    # exit 1 if the committed kit is stale
//   node tools/kit/build.mjs --print    # print the complete kit to stdout
//
// The prose lives in `kits/src/settlement-author.md`. Two kinds of directive
// are expanded from `@terrainist/spec`, `@terrainist/stdlib` and
// `@terrainist/compiler` (built `dist/`):
//
//   <!-- gen:NAME -->        a whole-line block: a table or a list
//   {{enum:EXPORT}}          an inline `a`, `b`, `c` list of a string-array export
//   {{const:EXPORT[.path]}}  an inline number or string
//
// Every id the kit shows the model therefore comes from a registry, and the
// kit cannot name a thing the compiler cannot build. What the prose says is a
// human's; what it enumerates is the code's.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as loam from "@terrainist/spec";
import * as ir from "@terrainist/spec/ir";
import * as stdlib from "@terrainist/stdlib";
import * as compiler from "@terrainist/compiler";

// The kit states Loam 1; the registries it expands from are the IR's.
const spec = { ...ir, ...loam };

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SOURCE = path.join(REPO, "kits/src/settlement-author.md");
export const OUTPUT = path.join(REPO, "kits/settlement-author.md");

const REGISTRIES = { ...compiler, ...stdlib, ...spec };

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

const code = (s) => `\`${s}\``;
const list = (ids) => ids.map(code).join(", ");
const row = (cells) => `| ${cells.join(" | ")} |`;
const table = (head, rows) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");

function lookup(name) {
  const [head, ...rest] = name.split(".");
  let value = REGISTRIES[head];
  if (value === undefined) throw new Error(`kit build: no export named ${head}`);
  for (const key of rest) {
    value = value[key];
    if (value === undefined) throw new Error(`kit build: ${name} resolves to nothing`);
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* hand-written columns                                                       */
/*                                                                            */
/* The one place prose and registry meet in this file: a sentence per id for  */
/* the tables whose rows are generated. An id in a registry with no sentence  */
/* here is rendered bare, never dropped; a sentence for an id no registry     */
/* carries is a build error.                                                  */
/* -------------------------------------------------------------------------- */

const HEIGHTFIELD = {
  seaLevel: ["−64..319, int", "water surface. Keep 63 unless you have a reason."],
  baseHeight: ["−64..319", "mean land height before noise. Below `seaLevel` means mostly ocean. For open plains keep it within ~6 of `seaLevel`."],
  amplitude: ["0..320", "vertical relief. 6 = open plains, 20 = rolling, 50 = hilly, 90 = alpine."],
  octaves: ["1..10, int", "detail layers. 5–6 is right."],
  frequency: ["0..1", "terrain scale. 0.001 = huge landforms, 0.008 = busy and small."],
  lacunarity: ["1..8", "frequency step per octave."],
  gain: ["0..1", "amplitude step per octave. 0.6 = rougher."],
  ridged: ["bool", "ridged multifractal: sharp crests and knife-edge spurs. Mountains and fjord walls."],
  warp: ["`{amount 0..512, frequency 0..1}`", "domain warp; bends ridgelines so they stop looking like noise. `{\"amount\": 24, \"frequency\": 0.004}` for organic shapes."],
  erosionPasses: ["0..8, int", "smooths and settles slopes. 1–3 helps almost every landscape; a settlement wants 2."],
  curve: ["`[[in, out], …]` in 0..1", "remaps normalized height. `[[0,0],[0.6,0.3],[1,1]]` flattens lowlands and keeps peaks."],
  continentalness: ["`{frequency, seaFraction}`", "carves ocean out of the region: `seaFraction` of columns go below sea level, `frequency` sets landmass size (0.0009 = a couple of big masses, 0.003 = an archipelago). Omit for an all-land world."],
  cliffThreshold: ["0..90", "slope in degrees above which the surface is bare rock."],
  soilDepth: ["0..32, int", "dirt under the surface block."],
  beachWidth: ["0..64, int", "how far the beach band reaches inland."],
  snowLineFraction: ["0..1", "fraction of max relief above which snow settles."],
};

const EDIT_MODIFIERS = {
  irregularity: ["0..0.5", "organic outline for a radial verb. **The default is right**; `0` only for a deliberate geometric circle."],
  meander: ["0..1", "lateral wander, width variation and end taper for a corridor verb. **The default is right**; `0` is a ruled channel."],
  flooded: ["`\"auto\"` / `\"never\"`", "`auto` lets a carve take sea water where it reaches the ocean; `never` keeps it dry."],
  lavaFlows: ["0..4, int", "frozen magma flows down a volcano's flanks. Solid blocks, never fluid."],
};

const SPECIES_LOOK = {
  spruce_tall: "the dark northern conifer wall",
  spruce_squat: "the scrubby treeline",
  oak_round: "the ordinary tree",
  birch_slim: "the pale vertical stroke",
  oak_spreading: "a real oak: lumpy, asymmetric, sky between its masses. The biggest upgrade to an ordinary wood",
  larch_columnar: "a pale-green exclamation mark; breaks a conifer wall into vertical rhythm",
  willow_weeping: "a curtain over water; reads \"riverbank\" in one glance",
  cherry_blossom: "pink, and the only pink there is",
  acacia_umbrella: "the savannah plate on a bare trunk",
  jungle_broadleaf: "the bulk tropical canopy",
  hazel_shrub: "the layer between grass and canopy; why an old wood feels deep",
  juniper_scrub: "knee-to-shoulder scrub; a floor that looks occupied instead of mown",
  tree_fern: "a small plate at head height; makes the ground feel humid",
  beech_giant: "the cathedral column: buttressed roots you stand between",
  kapok_emergent: "*the* canopy giant, vines off every limb",
  spruce_ancient: "the leaning grandfather: half its limbs dead, shelf fungi up one side",
  desert_ironwood: "a bent, mostly-dead hardwood holding one live limb",
  mushroom_giant_red: "a red dome on a pale stalk, visible across a valley",
  mushroom_shelf_brown: "flat brown plates at mid height; a fungal grove's canopy",
  glowcap: "a lantern in the woods: warped stalk, shroomlight in the cap. **Fantasy**",
  crystal_spire: "an amethyst \"tree\" that reads as *not a tree* at sixty blocks. **Fantasy**",
};

const CONSTRAINTS = {
  zone: ["`{\"zone\": \"north\"}`", "pull the node toward a nine-grid cell"],
  at: ["`{\"at\": [0.4, 0.6]}`", "pull it toward a fractional point"],
  adjacent_to: ["`{\"adjacent_to\": \"plaza\", \"gap\": [1, 8]}`", "keep its nearest face 1–8 blocks from the target"],
  distance: ["`{\"distance\": \"#tag:house\", \"min\": 6, \"max\": 60}`", "a separation band, measured face to face (`\"measure\": \"center\"` for centres)"],
  facing: ["`{\"facing\": \"plaza\"}`", "turn its `door` port toward the target"],
  clearance: ["`{\"clearance\": 2}`", "blocks of empty space kept around it"],
  not_overlapping: ["`{\"not_overlapping\": \"#tag:house\", \"margin\": 2}`", "never needed: placement never overlaps"],
  terrain_conform: ["`{\"terrain_conform\": \"cut_fill\", \"reference\": \"median\", \"blend\": 4}`", "level the ground under the footprint; modes `flatten`, `cut_fill`, `terrace`"],
  on: ["`{\"on\": \"@terrain:coastline\", \"band\": 24}`", "restrict placement to a derived terrain product"],
  along: ["`{\"along\": \"lanes\", \"offset\": [1, 4], \"faceRoad\": true}`", "line the node up on a road or course-verb corridor"],
  beside: ["`{\"beside\": \"the_river\", \"offset\": [4, 12]}`", "`along` with a wider band and no facing"],
  connected: ["`{\"connected\": \"great_hall\", \"via\": \"tunnel\"}`", "dig a gallery between two cellars (`via` must be `tunnel`)"],
};

const INFRA = {
  test_fence: "the host's own test fixture; do not write it",
  quarantine_fence: "chain-link cordon on a kerb, floodlight masts, a gate wherever a road crosses",
  barricade_line: "sandbags, boards and wire across a street with one deliberate way through",
  crash_furrow: "a scorched trench ending at the thing that made it; refuses to build without one",
  crop_circle: "rings and spokes pressed into a holding's standing crop",
  cannon_battery: "a parapeted firing platform with a gun at every bay",
  hedgerow: "a leafy bank three courses tall; the gap where a track crosses is the field gate",
  dry_stone_wall: "the upland field wall, coped, with stiles",
  cart_track: "two ruts and a grass baulk, worn into the field",
  boardwalk: "a plank sidewalk on posts along a street",
  sphinx_avenue: "a paved processional way with plinth figures at a fixed bay; the sphinx itself is an `authored:` landmark",
  harbour_chain_tower: "two towers with a chain slung between them over the harbour mouth; a pair or nothing",
  aqueduct: "a level water channel on an arcade from a source to a town",
  telegraph_line: "poles and wire between two places that talk",
  maglev_pylon: "a walkable guideway beam on pylons between two stations",
  viaduct: "a carriageway on arches; a road arrives on its deck",
  dam: "a masonry barrier across running water; floods the valley behind it as far as the pool closes",
  weir: "a low lip across a river; the water comes right to it",
  canal_lock: "two timber gates a narrowboat apart, water standing at the upper reach",
  retaining_wall: "a dressed face between two levels with a terrace behind it",
  terrace_steps: "the flight that makes a face passable",
  acropolis_terrace: "polygonal face six blocks proud with a sanctuary platform behind it",
  castle_base_wall: "the battered revetment a keep stands on",
};

const CELLARS = {
  plain: "a stone shell with a barrel or two",
  crypt: "burial niches, a coffin, cobwebs",
  vault: "iron-barred strongroom, chests, a lantern",
  wine_cellar: "racked barrels and bottles",
  mine: "a rough working: timber, rails, ore in the walls",
  ossuary: "bone in the walls and niches",
  undercroft: "dry vaulted stone; wants depth 4 or 5",
  dungeon_room: "mossy cobble, bars in the wall, straw and a cauldron",
  root_cellar: "packed earth, board shelves, jars and sacks",
  cistern_hall: "a tank of water sunk into the floor slab with a lit walk round it",
  smugglers_cove: "rough cobble with chests hidden in the wall niches",
  hermit_grotto: "natural stone: a cot, a lectern, a candle shrine",
  sewer_network: "a brick channel with a runnel sunk into the floor",
  bunker_hold: "poured concrete, bunks and stores",
  subway_platform: "tile, a rail and benches",
  silo_shaft: "deepslate and a copper band",
};

function assertKnown(map, ids, what) {
  const known = new Set(ids);
  for (const id of Object.keys(map)) {
    if (!known.has(id)) throw new Error(`kit build: ${what} sentence for unknown id ${id}`);
  }
}

/* -------------------------------------------------------------------------- */
/* generated blocks                                                           */
/* -------------------------------------------------------------------------- */

const GENERATORS = {
  "terrain-params": () => {
    const d = stdlib.HEIGHTFIELD_DEFAULTS;
    return table(
      ["key", "default", "value"],
      [
        [code("sea"), String(d.seaLevel), "the water surface, −64..319. Keep it unless you have a reason"],
        [code("base"), String(d.baseHeight), "mean land height before relief. Below `sea` is mostly ocean; for open plains keep it within ~6 of `sea`"],
        [code("relief"), String(d.amplitude), "vertical relief in blocks: 6 open plains, 20 rolling, 50 hilly, 90 alpine"],
        [code("scale"), String(Math.round(1 / d.frequency)), "the size of a landform in blocks: 120 is busy and small, 1000 is a few huge masses"],
        [code("ridged"), String(d.ridged), "sharp crests and knife-edge spurs: mountains, fjord walls"],
        [code("curve"), "none", "`[[in, out], …]` in 0..1, remaps height: `[[0,0],[0.6,0.3],[1,1]]` flattens lowlands and keeps peaks"],
        [code("ocean"), "none", "`{\"share\": 0..1, \"scale\": <blocks>}` carves sea out of the region: `share` of the columns go below sea level, `scale` sets the size of a landmass (900 a couple of big masses, 300 an archipelago). Omit for an all-land world"],
        [code("beach"), String(d.beachWidth), "how far the beach band reaches inland, 0..64"],
        [code("snowline"), String(d.snowLineFraction), "fraction of the relief above which snow settles"],
      ],
    );
  },

  "edit-verbs": () => {
    const rows = spec.EDIT_VERBS.map((verb) => {
      const keys = spec.SHAPE_BY_VERB[verb];
      const defaults = stdlib.EDIT_DEFAULTS[verb];
      const group = keys.includes("depth") ? "carve" : "raise";
      const placement = spec.COURSE_VERBS.includes(verb) ? "`course`" : "`at` / `zone`";
      const shape = keys
        .map((k) => {
          const d = defaults[k] ?? (k === "flooded" ? stdlib.FLOODED_DEFAULT : k === "lavaFlows" ? 2 : undefined);
          return d === undefined ? code(k) : `${code(k)} (${typeof d === "string" ? `"${d}"` : d})`;
        })
        .join(", ");
      return [code(verb), group, placement, shape];
    });
    return table(["verb", "group", "placement", "shape params (defaults)"], rows);
  },

  "edit-modifiers": () =>
    table(
      ["param", "range", "what it does"],
      Object.entries(EDIT_MODIFIERS).map(([k, [range, what]]) => [code(k), range, what]),
    ),

  species: () => {
    const defs = compiler.FLORA_SPECIES;
    assertKnown(SPECIES_LOOK, Object.keys(defs), "species");
    const order = ["canopy", "understory", "emergent"];
    const rows = spec.FLORA_SPECIES_IDS.map((id) => defs[id])
      .sort((a, b) => order.indexOf(a.stratum) - order.indexOf(b.stratum))
      .map((d) => [
        code(d.id),
        d.stratum,
        `${d.height[0]}–${d.height[1]}`,
        d.climates.length === 0 ? "*(name it)*" : d.climates.join(", "),
        SPECIES_LOOK[d.id] ?? "",
      ]);
    return table(["shape", "layer", "height", "climates", "what it looks like"], rows);
  },

  relations: () => {
    const WHAT = {
      zone: ["`{\"zone\": <zone>}`", "pull it toward a nine-grid cell (soft)"],
      at: ["`{\"at\": <fx, fz>}`", "pull it toward a point (soft); `radius` widens the target"],
      near: ["`{\"near\": <sel>, \"gap\": [<min>, <max>]}`", "keep its nearest face that many blocks from the thing"],
      distance: ["`{\"distance\": <sel>, \"min\": <n>, \"max\": <n>}`", "a separation band, face to face"],
      facing: ["`{\"facing\": <sel>}`", "turn its door toward the thing"],
      on: ["`{\"on\": <one of " + spec.ON_TARGETS.join(" | ") + ">, \"band\": <blocks>}`", "stand on a feature of the land you wrote"],
      along: ["`{\"along\": <road or edit id>, \"offset\": <n>, \"side\": <left|right|any>, \"at\": 0..1}`", "line it up on a road or a ridge, valley or river, facing the line; `at` is the position along the run"],
      beside: ["`{\"beside\": <road or edit id>, …}`", "`along` with a wider band and no facing"],
      tunnel: ["`{\"tunnel\": <building id>, \"style\": <dressed|mine|crypt>, \"oreChamber\": <bool>}`", "dig a walkable gallery between the two cellars; declare it on one side"],
    };
    return table(
      ["relation", "written as", "what it does"],
      spec.RELATIONS.map((r) => [code(r), WHAT[r][0], WHAT[r][1]]),
    );
  },

  "era-aliases": () => {
    const byClass = new Map(spec.ERA_CLASSES.map((c) => [c, []]));
    for (const [alias, cls] of Object.entries(spec.ERA_ALIASES)) {
      if (alias !== cls) byClass.get(cls).push(alias);
    }
    return table(
      ["class", "words that reach it"],
      [...byClass.entries()].map(([cls, aliases]) => [code(cls), list(aliases)]),
    );
  },

  "wall-params": () =>
    table(
      ["field", "values", "default", "notes"],
      [
        [code("style"), list(spec.WALL_STYLES), code("masonry"), "three constructions: a stone curtain, a timber palisade, a revetted rampart"],
        [code("height"), `${spec.WALL_MIN_HEIGHT}..${spec.WALL_MAX_HEIGHT}`, "6", "ground to wall-walk"],
        [code("every"), `${spec.WALL_MIN_TOWER_PITCH}..${spec.WALL_MAX_TOWER_PITCH}`, "40", "columns of wall between towers; every corner gets one too"],
        [code("margin"), `${spec.WALL_MIN_MARGIN}..${spec.WALL_MAX_MARGIN}`, "10", "columns between the last houses and the wall, measured from what was built"],
        [code("gates"), "bool", code("true"), "`false` is a siege wall: the roads are cut"],
        [code("enclose"), "`[<bespoke thing id>, …]`", "—", "bespoke things outside the fabric the circuit must also ring"],
        [code("materials"), "`{\"core\", \"walk\", \"parapet\", \"merlon\", \"tower\"}` of blocks", "the theme's", "a wall that is deliberately not the town's own stone"],
      ],
    ),

  "farm-params": () => {
    const d = spec.FARM_PARAM_DEFAULTS;
    const r = spec.FARM_PARAM_RANGES;
    return table(
      ["param", "values", "default", "meaning"],
      [
        [code("parcels"), `${r.parcels.min}..${r.parcels.max}, int`, String(d.parcels), "fields to seat; you get that many or a warning naming how many the ground allowed"],
        [code("parcelSize"), `${r.parcelSize.min}..${r.parcelSize.max}, int`, String(d.parcelSize), "target side of a field before jitter"],
        [code("crops"), list(spec.FARM_CROPS), "the climate's list", "one crop to a field, always; `pasture` is a grazed field"],
        [code("farmstead"), "`\"auto\"`, `\"none\"`, or archetype ids from " + list(spec.FARMSTEAD_ARCHETYPES), code("auto"), "`none` is fields with no yard"],
        [code("edge"), list(spec.FARM_EDGES), code(d.edge), "`wall` is a dry-stone course for upland and Mediterranean holdings"],
        [code("fallow"), `${r.fallow.min}..${r.fallow.max}`, String(d.fallow), "share of fields rested; `intent.decline` drives this for you"],
      ],
    );
  },

  "infra-entries": () => {
    const entries = spec.KNOWN_INFRA_ENTRIES.filter((id) => id !== "test_fence");
    assertKnown(INFRA, spec.KNOWN_INFRA_ENTRIES, "infra entry");
    const crossing = { open: "opens", gap: "one gap", block: "blocks" };
    return table(
      ["entry", "routes", "at a road", "what it builds"],
      entries.map((id) => [
        code(id),
        list(spec.INFRA_ENTRY_ROUTES[id]),
        crossing[stdlib.INFRA_ENTRIES[id].crossings] ?? "",
        INFRA[id] ?? "",
      ]),
    );
  },

  "cellar-styles": () => {
    assertKnown(CELLARS, stdlib.CELLAR_STYLES, "cellar style");
    return table(
      ["style", "what the room is"],
      stdlib.CELLAR_STYLES.map((s) => [code(s), CELLARS[s] ?? ""]),
    );
  },

  "form-packs": () => {
    const implemented = new Set(
      stdlib.STRUCTURE_CATALOG.filter((e) => e.status === "implemented").map((e) => e.id),
    );
    const kindOf = new Map(stdlib.STRUCTURE_CATALOG.map((e) => [e.id, e.kind]));
    return stdlib.FORM_PACKS.map((pack) => {
      const members = pack.members.filter((m) => implemented.has(m));
      const buildings = members.filter((m) => kindOf.get(m) === "building");
      const other = members.filter((m) => kindOf.get(m) !== "building");
      const lines = [
        `**${code(pack.id)}** — ${pack.thesis} *(eras: ${pack.eras.join(", ")}; themes: ${pack.themes.join(", ")})*`,
        `- buildings (legal in a \`mix\`): ${list(buildings)}`,
      ];
      if (other.length > 0) lines.push(`- props and infrastructure (never in a \`mix\`): ${list(other)}`);
      return lines.join("\n");
    }).join("\n\n");
  },

  "catalog-buildings": () => {
    const inPack = new Set(stdlib.FORM_PACKS.flatMap((p) => p.members));
    const byCategory = new Map();
    for (const e of stdlib.STRUCTURE_CATALOG) {
      if (e.status !== "implemented" || e.kind !== "building" || inPack.has(e.id)) continue;
      if (!spec.isKnownArchetype(e.id)) continue;
      if (!byCategory.has(e.category)) byCategory.set(e.category, []);
      byCategory.get(e.category).push(e.id);
    }
    return [...byCategory.entries()].map(([cat, ids]) => `- **${cat}**: ${list(ids)}`).join("\n");
  },

  "catalog-props": () => {
    const inPack = new Set(stdlib.FORM_PACKS.flatMap((p) => p.members));
    const byCategory = new Map();
    for (const e of stdlib.STRUCTURE_CATALOG) {
      if (e.status !== "implemented" || e.kind !== "prop") continue;
      if (!stdlib.isPropName(e.id)) continue;
      const fp = stdlib.propFootprint(e.id);
      const size = fp.size.join("×");
      const base = fp.base === "ground" ? "" : `, ${fp.base}`;
      const tag = inPack.has(e.id) ? "" : "";
      if (!byCategory.has(e.category)) byCategory.set(e.category, []);
      byCategory.get(e.category).push(`${code(e.id)} ${size}${base}${tag}`);
    }
    return [...byCategory.entries()].map(([cat, ids]) => `- **${cat}**: ${ids.join(", ")}`).join("\n");
  },

  "high-rise": () =>
    table(
      ["archetype", "max `floors`"],
      stdlib.HIGHRISE_ARCHETYPES.map((id) => [code(id), String(stdlib.HIGHRISE_MAX_FLOORS[id])]),
    ),

  "program-limits": () => {
    const l = spec.PROGRAM_LIMITS;
    return [
      `- largest envelope edge ${l.maxEnvelopeEdge} blocks, largest volume ${l.maxEnvelopeVolume.toLocaleString("en-US")} blocks³`,
      `- a program must place at least ${l.minSolidVoxels} solid blocks and reach ${l.minHeight} blocks high, or it is nonsense and dropped`,
      `- source ≤ ${l.maxSourceBytes / 1024} KiB; a plugin may lose ${Math.round(l.maxInstanceFailureFraction * 100)}% of its instances before the node fails`,
    ].join("\n");
  },
};

/* -------------------------------------------------------------------------- */
/* expansion                                                                  */
/* -------------------------------------------------------------------------- */

const HEADER =
  "<!-- GENERATED by tools/kit/build.mjs from kits/src/settlement-author.md. Do not edit this file: edit the source and run `npm run kit`. -->\n\n";

export function buildKit(source = fs.readFileSync(SOURCE, "utf8")) {
  const lines = source.split("\n").map((line) => {
    const block = /^<!-- gen:([a-z-]+) -->$/.exec(line.trim());
    if (block !== null) {
      const gen = GENERATORS[block[1]];
      if (gen === undefined) throw new Error(`kit build: unknown block gen:${block[1]}`);
      return gen();
    }
    return line
      .replace(/\{\{enum:([A-Za-z_.]+)\}\}/g, (_, name) => {
        const value = lookup(name);
        if (!Array.isArray(value)) throw new Error(`kit build: enum:${name} is not an array`);
        return list(value);
      })
      .replace(/\{\{const:([A-Za-z_.]+)\}\}/g, (_, name) => String(lookup(name)));
  });
  return HEADER + lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* the id check                                                               */
/*                                                                            */
/* Every id a JSON example writes in a registry position must be an id the    */
/* registry carries. The prose can say what it likes; the examples cannot.    */
/* -------------------------------------------------------------------------- */

export function checkKitIds(text) {
  const problems = [];
  const has = (set, id) => set.has(id);
  const archetypes = new Set(spec.KNOWN_BUILDING_ARCHETYPES);
  const props = new Set(stdlib.PROP_NAMES);
  const species = new Set(spec.FLORA_SPECIES_IDS);
  const entries = new Set(spec.KNOWN_INFRA_ENTRIES);
  const packs = new Set(stdlib.FORM_PACKS.map((p) => p.id));
  const themes = new Set(spec.MATERIAL_THEME_IDS);
  const fabrics = new Set(spec.DISTRICT_FABRICS);
  const check = (re, set, what) => {
    for (const m of text.matchAll(re)) {
      if (!has(set, m[1])) problems.push(`${what} "${m[1]}" is not in the registry`);
    }
  };
  check(/"archetype":\s*"([a-z0-9_]+)"/g, archetypes, "archetype");
  check(/"prop":\s*"([a-z0-9_]+)"/g, props, "prop");
  check(/"shape":\s*"([a-z0-9_]+)"/g, new Set([...species, "box", "region"]), "shape");
  check(/"entry":\s*"([a-z0-9_]+)"/g, entries, "infra entry");
  check(/"materialTheme":\s*"([a-z0-9_]+)"/g, themes, "material theme");
  check(/"fabric":\s*"([a-z0-9_]+)"/g, fabrics, "fabric");
  for (const m of text.matchAll(/"(mix|formPacks)":\s*\[([^\]]*)\]/g)) {
    const set = m[1] === "mix" ? archetypes : packs;
    for (const id of m[2].matchAll(/"([a-z0-9_]+)"/g)) {
      if (!has(set, id[1])) problems.push(`${m[1]} entry "${id[1]}" is not in the registry`);
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* cli                                                                        */
/* -------------------------------------------------------------------------- */

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === new URL(`file://${path.resolve(entry)}`).href) {
  const args = new Set(process.argv.slice(2));
  const built = buildKit();
  const problems = checkKitIds(built);
  if (problems.length > 0) {
    console.error(problems.map((p) => `kit: ${p}`).join("\n"));
    process.exit(1);
  }
  if (args.has("--print")) {
    process.stdout.write(built);
  } else if (args.has("--check")) {
    const committed = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, "utf8") : "";
    if (committed !== built) {
      console.error(`kit: ${path.relative(REPO, OUTPUT)} is stale — run \`npm run kit\``);
      process.exit(1);
    }
    console.log("kit: up to date");
  } else {
    fs.writeFileSync(OUTPUT, built);
    const words = built.split(/\s+/).length;
    console.log(`kit: wrote ${path.relative(REPO, OUTPUT)} (${(built.length / 1024).toFixed(0)} KB, ~${words} words)`);
  }
}

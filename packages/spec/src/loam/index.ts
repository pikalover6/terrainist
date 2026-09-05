/**
 * Loam 1 — the authoring surface.
 *
 * One document, one node shape. A document is a region of terrain, the woods
 * on it, and a list of **things**; every thing says what it `is` (a catalog
 * id, a quarter, a compound, or — with a `brief` — anything at all), how big
 * it is, and `where` it belongs, in the same nine relations whatever it is.
 *
 * The compiler speaks the older, wider settlement profile. {@link lowerLoam}
 * is the one bridge: it rewrites a Loam 1 document into that profile, and the
 * profile's own validator runs on the result, so nothing here has to repeat a
 * range check the compiler already owns. What this module owns is the shape a
 * model writes and the rules a kit can state in a paragraph each.
 */

import { KNOWN_BUILDING_ARCHETYPES, isKnownArchetype } from "../settlement/archetypes.js";
import { KNOWN_INFRA_ENTRIES, INFRA_ROUTE_KEYS } from "../settlement/infra-entries.js";
import {
  CITY_SIZES,
  DISTRICT_CHARACTERS,
  DISTRICT_DENSITIES,
  DISTRICT_FABRICS,
  FARM_CROPS,
  FARM_EDGES,
  HORIZONTAL_FACES,
  SET_PIECE_KINDS,
  VISTA_ARTERIALS,
  WALL_STYLES,
} from "../settlement/types.js";
import { validateSettlementDocument, type SettlementValidation } from "../settlement/validate.js";
import { error, type LoamDiagnostic } from "../terrain/diagnostics.js";
import {
  CLIMATE_THEMES,
  COURSE_VERBS,
  EDIT_VERBS,
  FLORA_SPECIES_IDS,
  ID_PATTERN,
  ZONE_TOKENS,
} from "../terrain/types.js";
import { SEAT_POLICIES } from "../programs/types.js";
import { slugProgramId } from "../programs/requests.js";

type Obj = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* the vocabulary a kit states                                                 */
/* -------------------------------------------------------------------------- */

/** Top-level keys of a Loam 1 document. `programs` is the pipeline's, never the author's. */
export const LOAM1_KEYS = [
  "loam", "name", "seed", "prompt", "spawn", "size", "palette", "intent",
  "terrain", "land", "climate", "woods", "roads", "things", "programs",
] as const;

export const TERRAIN_KEYS = ["sea", "base", "relief", "scale", "ridged", "curve", "ocean", "beach", "snowline"] as const;
export const EDIT_KEYS = [
  "id", "verb", "at", "zone", "course", "width", "height", "radius", "depth", "profile",
  "caldera", "calderaDepth", "lava", "lavaFlows", "water", "flooded", "wild", "label", "note",
] as const;
export const CLIMATE_KEYS = ["theme", "gradient"] as const;
export const WOOD_KEYS = [
  "id", "area", "density", "species", "layers", "floor", "grove", "undergrowth", "elevation",
  "treeline", "inside", "label", "note",
] as const;
export const SPECIES_KEYS = ["id", "shape", "weight", "height", "trunk", "leaves"] as const;
export const ROAD_KEYS = ["pattern", "width", "lit", "junctions", "reach"] as const;
export const ROAD_PATTERNS = ["organic", "grid", "radial", "ribbon", "minimal_spanning"] as const;
export const JUNCTION_STYLES = ["plain", "plaza", "roundabout", "stairs"] as const;

/** Every key a thing may carry, whatever it is. The kind-specific ones are checked per kind. */
export const THING_COMMON_KEYS = [
  "id", "is", "brief", "size", "where", "ground", "clearance", "tags", "optional", "label", "note",
] as const;
export const BUILDING_KEYS = [
  "floors", "storey", "roof", "windows", "wing", "cellar", "decay", "entrance", "vista", "door", "materials",
] as const;
export const PROP_KEYS = ["yaw", "length", "width", "curve", "grade", "platform"] as const;
export const INFRA_KEYS = ["route", "gates"] as const;
export const BESPOKE_KEYS = ["count", "spacing", "hover", "seat", "depth", "face", "elevation"] as const;
export const DISTRICT_KEYS = [
  "form", "density", "mix", "blocks", "plaza", "focus", "courtyards", "terraced", "walls", "children", "intent",
] as const;
export const CITY_KEYS = [
  "plan", "mix", "characters", "forms", "coastal", "ring", "diagonals", "setPieces", "courtyards",
  "terraced", "walls", "children", "intent",
] as const;
export const WALL_KEYS = ["style", "height", "gates", "every", "margin", "enclose", "materials"] as const;
export const FARM_KEYS = ["parcels", "parcelSize", "crops", "farmstead", "edge", "fallow"] as const;
export const AIRPORT_KEYS = ["stands", "hangars", "terminal"] as const;
export const HARBOUR_KEYS = ["piers", "ships"] as const;

/** The nine relations a `where` list is made of, in the order shorthand resolves them. */
export const RELATIONS = ["zone", "at", "near", "distance", "facing", "on", "along", "beside", "tunnel"] as const;
export type Relation = (typeof RELATIONS)[number];
export const RELATION_FIELDS: Readonly<Record<Relation, readonly string[]>> = Object.freeze({
  zone: [],
  at: ["radius"],
  near: ["gap"],
  distance: ["min", "max"],
  facing: [],
  on: ["band"],
  along: ["offset", "side", "at"],
  beside: ["offset", "side", "at"],
  tunnel: ["style", "oreChamber"],
});
export const GROUND_MODES = ["flatten", "cut_fill", "terrace", "keep"] as const;

/**
 * Read a `where` list the way an author meant it.
 *
 * The JSON instinct is to put several relations in one object; the rule is one
 * relation per object, and the two are the same statement, so a merged object
 * is split rather than refused. Each relation takes its own fields
 * ({@link RELATION_FIELDS}) and the object's `strength`; `at` is a field of
 * `along`/`beside` when it is a number and a relation when it is a point.
 */
export function normalizeWhere(where: unknown): Obj[] {
  if (!Array.isArray(where)) return [];
  const out: Obj[] = [];
  for (const raw of where) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) { out.push(raw as Obj); continue; }
    const rel = raw as Obj;
    const corridor = rel["along"] !== undefined || rel["beside"] !== undefined;
    const atIsField = corridor && typeof rel["at"] === "number";
    const present = RELATIONS.filter((name) => rel[name] !== undefined && !(name === "at" && atIsField));
    if (present.length <= 1) { out.push(rel); continue; }
    const strength = rel["strength"] === undefined ? {} : { strength: rel["strength"] };
    for (const name of present) {
      const own: Obj = { [name]: rel[name], ...strength };
      for (const field of RELATION_FIELDS[name]) {
        if (field === "at" && !atIsField) continue;
        if (rel[field] !== undefined && !(RELATIONS as readonly string[]).includes(field)) own[field] = rel[field];
        if (field === "at" && atIsField) own["at"] = rel["at"];
      }
      out.push(own);
    }
  }
  return out;
}
export const ON_TARGETS = ["coastline", "ridge", "peak"] as const;
export const COMPOUNDS = ["farm", "airport", "harbour"] as const;
export const FABRICS = ["plaza", "district", "city"] as const;

/** What a thing's `is` resolves to. */
export type ThingKind =
  | "plaza" | "district" | "city" | "farm" | "airport" | "harbour"
  | "building" | "prop" | "infra" | "bespoke";

/** Prop names are the stdlib's; the spec cannot import the stdlib, so a caller hands them in. */
export interface LoamRegistries {
  readonly props: ReadonlySet<string>;
}

/** Resolve `is`. Anything the catalog does not build is bespoke. */
export function kindOf(is: string, registries: LoamRegistries): ThingKind {
  if ((FABRICS as readonly string[]).includes(is)) return is as ThingKind;
  if ((COMPOUNDS as readonly string[]).includes(is)) return is as ThingKind;
  if (isKnownArchetype(is)) return "building";
  if (registries.props.has(is)) return "prop";
  if ((KNOWN_INFRA_ENTRIES as readonly string[]).includes(is)) return "infra";
  return "bespoke";
}

/* -------------------------------------------------------------------------- */
/* validation                                                                  */
/* -------------------------------------------------------------------------- */

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const describe = (v: unknown): string => (v === undefined ? "nothing" : JSON.stringify(v)?.slice(0, 60) ?? String(v));

class Report {
  readonly out: LoamDiagnostic[] = [];
  fail(path: string, message: string, fix: string): void {
    this.out.push(error("BAD_DOCUMENT", path, message, fix));
  }
  keys(path: string, obj: Obj, allowed: readonly string[], what: string): void {
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) {
        this.out.push(error("UNKNOWN_KEY", path, `unknown key "${key}" on ${what}`, `${what} takes only: ${allowed.join(", ")}`));
      }
    }
  }
  enumeration(path: string, value: unknown, allowed: readonly string[], key: string): void {
    if (value !== undefined && (!isStr(value) || !allowed.includes(value))) {
      this.out.push(error("BAD_ENUM", path, `"${key}" must be one of ${allowed.join(", ")}, got ${describe(value)}`, `set "${key}" to one of: ${allowed.join(", ")}`));
    }
  }
  number(path: string, value: unknown, key: string, min?: number, max?: number): void {
    if (value === undefined) return;
    if (!isNum(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) {
      const range = min !== undefined || max !== undefined ? ` in ${min ?? "-∞"}..${max ?? "∞"}` : "";
      this.out.push(error("PARAM_OUT_OF_RANGE", path, `"${key}" must be a number${range}, got ${describe(value)}`, `write "${key}" as a number${range}`));
    }
  }
  bool(path: string, value: unknown, key: string): void {
    if (value !== undefined && typeof value !== "boolean") {
      this.out.push(error("BAD_TYPE", path, `"${key}" must be true or false, got ${describe(value)}`, `write "${key}": true or leave it out`));
    }
  }
  id(path: string, value: unknown, what: string): boolean {
    if (!isStr(value) || !ID_PATTERN.test(value)) {
      this.out.push(error("BAD_DOCUMENT", path, `${what} must be an id matching ${ID_PATTERN.source}, got ${describe(value)}`, "use lowercase letters, digits and underscores, starting with a letter"));
      return false;
    }
    return true;
  }
}

function checkPoint(r: Report, path: string, value: unknown, key: string): void {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => isNum(n) && n >= 0 && n <= 1)) {
    r.fail(path, `"${key}" must be [fx, fz] with both in 0..1, got ${describe(value)}`, `write "${key}": [0.5, 0.5]`);
  }
}

function checkPlacement(r: Report, path: string, obj: Obj, allowCourse: boolean): void {
  const keys = ["at", "zone", ...(allowCourse ? ["course"] : [])].filter((k) => obj[k] !== undefined);
  if (keys.length !== 1) {
    r.fail(path, `exactly one of ${allowCourse ? '"at", "zone", "course"' : '"at", "zone"'} is required, found ${keys.length === 0 ? "none" : keys.join(" and ")}`, "keep one placement key");
    return;
  }
  if (obj["at"] !== undefined) checkPoint(r, path, obj["at"], "at");
  if (obj["zone"] !== undefined) r.enumeration(path, obj["zone"], ZONE_TOKENS, "zone");
  if (obj["course"] !== undefined) {
    const course = obj["course"];
    if (!Array.isArray(course) || course.length < 2 || course.length > 8) {
      r.fail(path, `"course" must be 2–8 waypoints, got ${describe(course)}`, 'write "course": [[fx, fz], [fx, fz], "coast"]');
    } else {
      course.forEach((w, i) => {
        if (w === "coast") {
          if (i !== 0 && i !== course.length - 1) r.fail(path, '"coast" may only be the first or last waypoint', "move \"coast\" to an end of the course");
        } else checkPoint(r, `${path}.course[${i}]`, w, "course waypoint");
      });
    }
  }
}

function checkTerrain(r: Report, terrain: unknown): void {
  if (terrain === undefined) return;
  if (!isObj(terrain)) return r.fail("terrain", `"terrain" must be an object, got ${describe(terrain)}`, 'write "terrain": {}');
  r.keys("terrain", terrain, TERRAIN_KEYS, "terrain");
  r.number("terrain", terrain["sea"], "sea", -64, 319);
  r.number("terrain", terrain["base"], "base", -64, 319);
  r.number("terrain", terrain["relief"], "relief", 0, 320);
  r.number("terrain", terrain["scale"], "scale", 8, 4096);
  r.bool("terrain", terrain["ridged"], "ridged");
  r.number("terrain", terrain["beach"], "beach", 0, 64);
  r.number("terrain", terrain["snowline"], "snowline", 0, 1);
  const ocean = terrain["ocean"];
  if (ocean !== undefined) {
    if (!isObj(ocean)) r.fail("terrain.ocean", `"ocean" must be { "share", "scale" }, got ${describe(ocean)}`, 'write "ocean": { "share": 0.4, "scale": 900 }');
    else {
      r.keys("terrain.ocean", ocean, ["share", "scale"], "ocean");
      r.number("terrain.ocean", ocean["share"], "share", 0, 1);
      r.number("terrain.ocean", ocean["scale"], "scale", 8, 8192);
      if (ocean["share"] === undefined) r.fail("terrain.ocean", '"ocean" needs a "share"', 'add "share": the fraction of the region under the sea');
    }
  }
  const curve = terrain["curve"];
  if (curve !== undefined && (!Array.isArray(curve) || !curve.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => isNum(n) && n >= 0 && n <= 1)))) {
    r.fail("terrain", `"curve" must be [[in, out], …] in 0..1, got ${describe(curve)}`, 'write "curve": [[0, 0], [0.6, 0.3], [1, 1]]');
  }
}

export const SHAPE_BY_VERB: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ridge: ["width", "height"],
  peak: ["radius", "height"],
  volcano: ["radius", "height", "caldera", "calderaDepth", "lava", "lavaFlows"],
  plateau: ["radius", "height"],
  island: ["radius", "height"],
  valley: ["width", "depth", "flooded"],
  river: ["width", "depth", "flooded"],
  basin: ["radius", "depth", "water", "flooded"],
});

function checkLand(r: Report, land: unknown, ids: Set<string>): void {
  if (land === undefined) return;
  if (!Array.isArray(land)) return r.fail("land", `"land" must be a list of edits, got ${describe(land)}`, 'write "land": [{ "id": "the_mere", "verb": "basin", "at": [0.5, 0.4], "radius": 60, "depth": 12, "water": true }]');
  land.forEach((edit, i) => {
    const path = `land[${i}]`;
    if (!isObj(edit)) return r.fail(path, `an edit must be an object, got ${describe(edit)}`, "write { \"id\", \"verb\", … }");
    r.keys(path, edit, EDIT_KEYS, "a land edit");
    if (r.id(path, edit["id"], "an edit's \"id\"")) {
      if (ids.has(edit["id"] as string)) r.out.push(error("DUPLICATE_ID", path, `id "${edit["id"] as string}" is used twice`, "ids are unique across the whole document"));
      ids.add(edit["id"] as string);
    }
    const verb = edit["verb"];
    if (!isStr(verb) || !(EDIT_VERBS as readonly string[]).includes(verb)) {
      return r.enumeration(path, verb, EDIT_VERBS, "verb");
    }
    const course = (COURSE_VERBS as readonly string[]).includes(verb);
    checkPlacement(r, path, edit, course);
    if (course && edit["course"] === undefined) r.fail(path, `"${verb}" runs along a "course"`, 'write "course": [[fx, fz], …]');
    if (!course && edit["course"] !== undefined) r.fail(path, `"${verb}" is placed with "at" or "zone", not a "course"`, 'replace "course" with "at": [fx, fz]');
    const allowed = SHAPE_BY_VERB[verb] ?? [];
    for (const key of ["width", "height", "radius", "depth", "caldera", "calderaDepth", "lava", "lavaFlows", "water", "flooded"]) {
      if (edit[key] !== undefined && !allowed.includes(key)) {
        r.out.push(error("PARAM_OUT_OF_RANGE", path, `"${key}" is not a parameter of verb "${verb}"`, `"${verb}" takes: ${allowed.join(", ")}`));
      }
    }
    r.number(path, edit["width"], "width", 1, 2048);
    r.number(path, edit["radius"], "radius", 1, 2048);
    r.number(path, edit["height"], "height", 0, 320);
    r.number(path, edit["depth"], "depth", 0, 320);
    r.number(path, edit["wild"], "wild", 0, 1);
    r.number(path, edit["calderaDepth"], "calderaDepth", 0, 320);
    r.number(path, edit["lavaFlows"], "lavaFlows", 0, 4);
    r.enumeration(path, edit["profile"], ["sharp", "rounded"], "profile");
    r.enumeration(path, edit["flooded"], ["auto", "never"], "flooded");
    for (const key of ["caldera", "lava", "water"]) r.bool(path, edit[key], key);
  });
}

function checkClimate(r: Report, climate: unknown): void {
  if (climate === undefined) return;
  if (!isObj(climate)) return r.fail("climate", `"climate" must be an object, got ${describe(climate)}`, 'write "climate": { "theme": "temperate" }');
  r.keys("climate", climate, CLIMATE_KEYS, "climate");
  r.enumeration("climate", climate["theme"], CLIMATE_THEMES, "theme");
  r.number("climate", climate["gradient"], "gradient", -4, 4);
}

function checkSpecies(r: Report, path: string, list: unknown, required: boolean): void {
  if (list === undefined) {
    if (required) r.fail(path, '"species" is required', 'write "species": [{ "shape": "oak_round" }]');
    return;
  }
  if (!Array.isArray(list) || list.length === 0) return r.fail(path, `"species" must be a non-empty list, got ${describe(list)}`, 'write "species": [{ "shape": "oak_round", "weight": 2 }]');
  list.forEach((entry, i) => {
    const at = `${path}.species[${i}]`;
    if (!isObj(entry)) return r.fail(at, `a species must be an object, got ${describe(entry)}`, 'write { "shape": "oak_round" }');
    r.keys(at, entry, SPECIES_KEYS, "a species");
    r.enumeration(at, entry["shape"], FLORA_SPECIES_IDS, "shape");
    if (entry["shape"] === undefined) r.fail(at, '"shape" is required', `set "shape" to one of: ${FLORA_SPECIES_IDS.join(", ")}`);
    if (entry["id"] !== undefined) r.id(at, entry["id"], '"id"');
    r.number(at, entry["weight"], "weight", 0);
    const h = entry["height"];
    if (h !== undefined && (!Array.isArray(h) || h.length !== 2 || !h.every((n) => Number.isInteger(n) && n >= 2 && n <= 64) || (h[0] as number) > (h[1] as number))) {
      r.fail(at, `"height" must be [min, max] integers in 2..64, got ${describe(h)}`, 'write "height": [6, 10]');
    }
    for (const key of ["trunk", "leaves"]) if (entry[key] !== undefined && !isStr(entry[key])) r.fail(at, `"${key}" must be a block id`, `write "${key}": "minecraft:dark_oak_log"`);
  });
}

function checkWoods(r: Report, woods: unknown, ids: Set<string>): void {
  if (woods === undefined) return;
  if (!Array.isArray(woods)) return r.fail("woods", `"woods" must be a list, got ${describe(woods)}`, 'write "woods": [{ "id": "pines", "species": [{ "shape": "spruce_tall" }] }]');
  woods.forEach((wood, i) => {
    const path = `woods[${i}]`;
    if (!isObj(wood)) return r.fail(path, `a wood must be an object, got ${describe(wood)}`, "write { \"id\", \"species\" }");
    r.keys(path, wood, WOOD_KEYS, "a wood");
    if (r.id(path, wood["id"], "a wood's \"id\"")) {
      if (ids.has(wood["id"] as string)) r.out.push(error("DUPLICATE_ID", path, `id "${wood["id"] as string}" is used twice`, "ids are unique across the whole document"));
      ids.add(wood["id"] as string);
    }
    checkSpecies(r, path, wood["species"], true);
    const area = wood["area"];
    if (area !== undefined && area !== "all") {
      if (!isObj(area)) r.fail(path, `"area" must be "all", { "zone" } or { "at", "radius" }, got ${describe(area)}`, 'write "area": { "zone": "north" }');
      else {
        r.keys(`${path}.area`, area, ["zone", "at", "radius"], "an area");
        checkPlacement(r, `${path}.area`, area, false);
        if (area["at"] !== undefined) r.number(`${path}.area`, area["radius"], "radius", 1, 4096);
        if (area["at"] !== undefined && area["radius"] === undefined) r.fail(`${path}.area`, '"at" needs a "radius" in blocks', 'add "radius": 120');
      }
    }
    r.number(path, wood["density"], "density", 0, 1);
    r.number(path, wood["grove"], "grove", 0, 1);
    r.number(path, wood["treeline"], "treeline", -64, 319);
    r.bool(path, wood["inside"], "inside");
    r.enumeration(path, wood["floor"], ["default", "fungal", "glow"], "floor");
    const el = wood["elevation"];
    if (el !== undefined && (!Array.isArray(el) || el.length !== 2 || !el.every(isNum) || (el[0] as number) > (el[1] as number))) {
      r.fail(path, `"elevation" must be [min, max] relative to sea level, got ${describe(el)}`, 'write "elevation": [2, 80]');
    }
    const ug = wood["undergrowth"];
    if (ug !== undefined) {
      if (!isObj(ug)) r.fail(path, `"undergrowth" must be an object, got ${describe(ug)}`, 'write "undergrowth": { "grass": 0.4, "flowers": 0.05, "deadwood": 0.02 }');
      else { r.keys(`${path}.undergrowth`, ug, ["grass", "flowers", "deadwood"], "undergrowth"); for (const k of ["grass", "flowers", "deadwood"]) r.number(`${path}.undergrowth`, ug[k], k, 0, 1); }
    }
    const layers = wood["layers"];
    if (layers !== undefined && layers !== true) {
      if (!isObj(layers)) r.fail(path, `"layers" must be true or { "emergent", "understory" }, got ${describe(layers)}`, 'write "layers": true');
      else {
        r.keys(`${path}.layers`, layers, ["emergent", "understory"], "layers");
        for (const layer of ["emergent", "understory"]) {
          const v = layers[layer];
          if (v === undefined || v === "default" || v === "none") continue;
          if (!isObj(v)) r.fail(`${path}.layers.${layer}`, `"${layer}" must be "default", "none" or { "species": [...] }, got ${describe(v)}`, `write "${layer}": "default"`);
          else { r.keys(`${path}.layers.${layer}`, v, ["species"], "a layer"); checkSpecies(r, `${path}.layers.${layer}`, v["species"], true); }
        }
      }
    }
  });
}

function checkRoads(r: Report, roads: unknown): void {
  if (roads === undefined) return;
  if (!isObj(roads)) return r.fail("roads", `"roads" must be an object, got ${describe(roads)}`, 'write "roads": { "pattern": "organic", "lit": true }');
  r.keys("roads", roads, ROAD_KEYS, "roads");
  r.enumeration("roads", roads["pattern"], ROAD_PATTERNS, "pattern");
  r.enumeration("roads", roads["junctions"], JUNCTION_STYLES, "junctions");
  r.number("roads", roads["width"], "width", 2, 3);
  r.bool("roads", roads["lit"], "lit");
  const reach = roads["reach"];
  if (reach !== undefined && (!Array.isArray(reach) || reach.length === 0 || !reach.every(isStr))) r.fail("roads", `"reach" must be a non-empty list of ids or #tag: selectors, got ${describe(reach)}`, 'omit "reach" to reach everything');
}

function checkWhere(r: Report, path: string, where: unknown, kind: ThingKind): void {
  if (where === undefined) return;
  if (!Array.isArray(where)) return r.fail(path, `"where" must be a list of relations, got ${describe(where)}`, 'write "where": [{ "zone": "center" }]');
  normalizeWhere(where).forEach((rel, i) => {
    const at = `${path}.where[${i}]`;
    if (!isObj(rel)) return r.fail(at, `a relation must be an object, got ${describe(rel)}`, 'write { "near": "plaza" }');
    const present = RELATIONS.filter((name) => rel[name] !== undefined);
    if (present.length === 0) return r.fail(at, `a relation names exactly one of ${RELATIONS.join(", ")}`, 'write { "zone": "north" }');
    const type = present[0] as Relation;
    for (const other of present.slice(1)) {
      if (!RELATION_FIELDS[type].includes(other)) r.fail(at, `"${type}" and "${other}" are two relations; write them as two objects`, "split the object");
    }
    r.keys(at, rel, [type, ...RELATION_FIELDS[type], "strength"], `a "${type}" relation`);
    r.enumeration(at, rel["strength"], ["hard", "soft"], "strength");
    if (kind === "bespoke" && rel["count"] !== undefined) r.fail(at, "count belongs on the thing, not the relation", "move it");
    switch (type) {
      case "zone": r.enumeration(at, rel["zone"], ZONE_TOKENS, "zone"); break;
      case "at":
        if (rel["at"] === "pier" && kind === "prop") break;
        checkPoint(r, at, rel["at"], "at");
        r.number(at, rel["radius"], "radius", 0.01, 1);
        break;
      case "near": case "facing": case "distance": case "along": case "beside": case "tunnel":
        if (!isStr(rel[type]) || rel[type] === "") r.fail(at, `"${type}" names a thing's id or a #tag: selector, got ${describe(rel[type])}`, `write "${type}": "plaza"`);
        break;
      case "on":
        r.enumeration(at, rel["on"], ON_TARGETS, "on");
        r.number(at, rel["band"], "band", 1, 512);
        break;
    }
    if (type === "near") {
      const gap = rel["gap"];
      if (gap !== undefined && (!Array.isArray(gap) || gap.length !== 2 || !gap.every(isNum))) r.fail(at, `"gap" must be [min, max] blocks, got ${describe(gap)}`, 'write "gap": [1, 8]');
    }
    if (type === "distance") { r.number(at, rel["min"], "min", 0); r.number(at, rel["max"], "max", 0); }
    if (type === "along" || type === "beside") {
      r.enumeration(at, rel["side"], ["left", "right", "any"], "side");
      r.number(at, rel["at"], "at", 0, 1);
    }
    if (type === "tunnel") { r.enumeration(at, rel["style"], ["dressed", "mine", "crypt"], "style"); r.bool(at, rel["oreChamber"], "oreChamber"); }
  });
}

function checkSize(r: Report, path: string, size: unknown, dims: 2 | 3 | "either", required: boolean): void {
  if (size === undefined) {
    if (required) r.fail(path, `"size" is required here`, dims === 2 ? 'write "size": [x, z]' : 'write "size": [x, y, z]');
    return;
  }
  const ok = Array.isArray(size) && size.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 4096) &&
    (dims === "either" ? size.length === 2 || size.length === 3 : size.length === dims);
  if (!ok) r.fail(path, `"size" must be ${dims === 2 ? "[x, z]" : dims === 3 ? "[x, y, z]" : "[x, y, z] or [x, z]"} in blocks, got ${describe(size)}`, "write integer blocks");
}

function checkWalls(r: Report, path: string, walls: unknown): void {
  if (walls === undefined) return;
  if (!isObj(walls)) return r.fail(path, `"walls" must be an object, got ${describe(walls)}`, 'write "walls": {}');
  r.keys(path, walls, WALL_KEYS, "walls");
  r.enumeration(path, walls["style"], WALL_STYLES, "style");
  r.number(path, walls["height"], "height", 4, 14);
  r.number(path, walls["every"], "every", 16, 128);
  r.number(path, walls["margin"], "margin", 4, 64);
  r.bool(path, walls["gates"], "gates");
  const enclose = walls["enclose"];
  if (enclose !== undefined && (!Array.isArray(enclose) || !enclose.every(isStr))) r.fail(path, `"enclose" must be a list of ids, got ${describe(enclose)}`, 'write "enclose": ["the_keep"]');
  const materials = walls["materials"];
  if (materials !== undefined) {
    if (!isObj(materials)) r.fail(path, `"materials" must be an object of role → block`, 'write "materials": { "core": "minecraft:sandstone" }');
    else r.keys(`${path}.materials`, materials, ["core", "walk", "parapet", "merlon", "tower"], "wall materials");
  }
}

function checkIntent(r: Report, path: string, intent: unknown): void {
  // The intent object is passed through to the profile validator, which owns
  // its ranges; here only the two renamed keys are checked so the fix reads in
  // Loam 1's own words.
  if (intent === undefined) return;
  if (!isObj(intent)) return r.fail(path, `"intent" must be an object, got ${describe(intent)}`, 'write "intent": { "era": "medieval" }');
  void path;
}

function checkThing(r: Report, path: string, thing: unknown, ids: Set<string>, registries: LoamRegistries, inFabric: boolean): void {
  if (!isObj(thing)) return r.fail(path, `a thing must be an object, got ${describe(thing)}`, 'write { "id": "inn", "is": "inn" }');
  const is = thing["is"];
  if (!isStr(is) || is === "") return r.fail(path, `a thing says what it "is"`, 'write "is": a catalog id, "plaza", "district", "city", "farm", "airport", "harbour", or a new name with a "brief"');
  const kind = kindOf(is, registries);
  if (r.id(path, thing["id"], `a thing's "id"`)) {
    if (ids.has(thing["id"] as string)) r.out.push(error("DUPLICATE_ID", path, `id "${thing["id"] as string}" is used twice`, "ids are unique across the whole document"));
    ids.add(thing["id"] as string);
  }
  const kindKeys: readonly string[] =
    kind === "building" ? BUILDING_KEYS
    : kind === "prop" ? PROP_KEYS
    : kind === "infra" ? INFRA_KEYS
    : kind === "bespoke" ? BESPOKE_KEYS
    : kind === "district" ? DISTRICT_KEYS
    : kind === "city" ? CITY_KEYS
    : kind === "farm" ? FARM_KEYS
    : kind === "airport" ? AIRPORT_KEYS
    : kind === "harbour" ? HARBOUR_KEYS
    : [];
  r.keys(path, thing, [...THING_COMMON_KEYS, ...kindKeys], `"${is}" (${kind === "bespoke" ? "a bespoke thing" : kind})`);
  if (inFabric && kind !== "building") r.fail(path, `a district's or city's children are buildings; "${is}" is ${kind}`, "move it to the top-level things");
  if (kind === "bespoke" && (!isStr(thing["brief"]) || (thing["brief"] as string).trim() === "")) {
    r.fail(path, `"${is}" is not in the catalog, so it is bespoke and needs a "brief"`, `add "brief": one or two sentences saying what it is, what it reads as, and what it is made of — or use a catalog id`);
  }
  if (kind !== "bespoke" && thing["brief"] !== undefined) r.fail(path, `"${is}" is in the catalog; a "brief" is only for a thing the catalog cannot make`, "drop the brief or invent a new name");
  checkWhere(r, path, thing["where"], kind);
  r.enumeration(path, thing["ground"], GROUND_MODES, "ground");
  r.number(path, thing["clearance"], "clearance", 0, 64);
  r.bool(path, thing["optional"], "optional");
  const tags = thing["tags"];
  if (tags !== undefined && (!Array.isArray(tags) || !tags.every(isStr))) r.fail(path, `"tags" must be a list of strings`, 'write "tags": ["house"]');

  switch (kind) {
    case "plaza": checkSize(r, path, thing["size"], 2, true); break;
    case "district": case "city": {
      checkSize(r, path, thing["size"], 2, true);
      if (kind === "district") {
        r.enumeration(path, thing["form"], DISTRICT_FABRICS, "form");
        r.enumeration(path, thing["density"], DISTRICT_DENSITIES, "density");
        if (thing["form"] === undefined) r.fail(path, 'a district needs a "form"', `set "form" to one of: ${DISTRICT_FABRICS.join(", ")}`);
        if (thing["density"] === undefined) r.fail(path, 'a district needs a "density"', `set "density" to one of: ${DISTRICT_DENSITIES.join(", ")}`);
        r.number(path, thing["blocks"], "blocks", 16, 96);
        r.bool(path, thing["plaza"], "plaza");
        if (thing["focus"] !== undefined && !isStr(thing["focus"])) r.fail(path, '"focus" is "plaza" or a child id', 'write "focus": "plaza"');
      } else {
        r.enumeration(path, thing["plan"], CITY_SIZES, "plan");
        if (thing["plan"] === undefined) r.fail(path, 'a city needs a "plan"', `set "plan" to one of: ${CITY_SIZES.join(", ")}`);
        for (const key of ["coastal", "ring"]) r.bool(path, thing[key], key);
        r.number(path, thing["diagonals"], "diagonals", 0, 2);
        for (const key of ["characters", "forms"]) {
          const v = thing[key];
          if (v !== undefined) {
            if (!isObj(v)) r.fail(path, `"${key}" is an object keyed by character`, `write "${key}": { "core": … }`);
            else r.keys(`${path}.${key}`, v, DISTRICT_CHARACTERS, key);
          }
        }
        const sp = thing["setPieces"];
        if (sp !== undefined && typeof sp !== "boolean") {
          if (!isObj(sp)) r.fail(path, `"setPieces" is true, false or { "max", "kinds" }`, 'write "setPieces": true');
          else { r.keys(`${path}.setPieces`, sp, ["max", "kinds"], "setPieces"); r.number(`${path}.setPieces`, sp["max"], "max", 1, 6); const k = sp["kinds"]; if (k !== undefined && (!Array.isArray(k) || !k.every((x) => (SET_PIECE_KINDS as readonly string[]).includes(x as string)))) r.fail(`${path}.setPieces`, `"kinds" must be from ${SET_PIECE_KINDS.join(", ")}`, "fix the list"); }
        }
      }
      const mix = thing["mix"];
      if (!Array.isArray(mix) || mix.length === 0 || !mix.every(isStr)) r.fail(path, `a ${kind} needs a "mix": the building ids its streets are filled from`, 'write "mix": ["townhouse", "shop_row"]');
      else for (const m of mix) if (!isKnownArchetype(m as string)) r.out.push(error("STRUCTURE_PARAM", path, `mix entry "${m as string}" is not a building the catalog builds`, "use building ids from the catalog; props and infrastructure never enter a mix"));
      r.number(path, thing["courtyards"], "courtyards", 0, 1);
      r.bool(path, thing["terraced"], "terraced");
      checkWalls(r, `${path}.walls`, thing["walls"]);
      checkIntent(r, `${path}.intent`, thing["intent"]);
      const children = thing["children"];
      if (children !== undefined) {
        if (!Array.isArray(children)) r.fail(path, `"children" must be a list of buildings`, 'write "children": [{ "id": "minster", "is": "cathedral" }]');
        else children.forEach((c, i) => checkThing(r, `${path}.children[${i}]`, c, ids, registries, true));
      }
      break;
    }
    case "farm":
      checkSize(r, path, thing["size"], 2, true);
      r.number(path, thing["parcels"], "parcels", 1, 24);
      r.number(path, thing["parcelSize"], "parcelSize", 10, 28);
      r.number(path, thing["fallow"], "fallow", 0, 1);
      r.enumeration(path, thing["edge"], FARM_EDGES, "edge");
      { const crops = thing["crops"]; if (crops !== undefined && (!Array.isArray(crops) || !crops.every((c) => (FARM_CROPS as readonly string[]).includes(c as string)))) r.fail(path, `"crops" must be from ${FARM_CROPS.join(", ")}`, "fix the list"); }
      { const f = thing["farmstead"]; if (f !== undefined && f !== "auto" && f !== "none" && (!Array.isArray(f) || !f.every((x) => isKnownArchetype(x as string)))) r.fail(path, `"farmstead" is "auto", "none" or a list of building ids`, 'write "farmstead": "auto"'); }
      break;
    case "airport":
      checkSize(r, path, thing["size"], "either", true);
      r.number(path, thing["stands"], "stands", 1, 12); r.number(path, thing["hangars"], "hangars", 0, 4); r.bool(path, thing["terminal"], "terminal");
      break;
    case "harbour":
      checkSize(r, path, thing["size"], "either", true);
      r.number(path, thing["piers"], "piers", 1, 8);
      { const s = thing["ships"]; if (s !== undefined && s !== "fill" && !(Number.isInteger(s) && (s as number) >= 0 && (s as number) <= 8)) r.fail(path, `"ships" is 0..8 or "fill"`, 'write "ships": "fill"'); }
      break;
    case "building":
      checkSize(r, path, thing["size"], 3, false);
      r.number(path, thing["floors"], "floors", 1, 30);
      r.number(path, thing["storey"], "storey", 3, 8);
      r.enumeration(path, thing["roof"], ["gable", "hip", "flat"], "roof");
      r.enumeration(path, thing["windows"], ["regular", "dense", "sparse", "paired", "none"], "windows");
      r.enumeration(path, thing["door"], HORIZONTAL_FACES, "door");
      r.number(path, thing["decay"], "decay", 0, 1);
      { const v = thing["vista"]; if (v !== undefined && v !== true && v !== false && !(isStr(v) && (VISTA_ARTERIALS as readonly string[]).includes(v))) r.fail(path, `"vista" is true, false or one of ${VISTA_ARTERIALS.join(", ")}`, 'write "vista": true'); }
      { const c = thing["cellar"]; if (c !== undefined && c !== true && c !== false && !(Number.isInteger(c) && (c as number) >= 3 && (c as number) <= 5) && !(isObj(c))) r.fail(path, `"cellar" is true, 3..5, or { "depth", "style" }`, 'write "cellar": { "depth": 4, "style": "crypt" }'); }
      { const e = thing["entrance"]; if (e !== undefined && !(isStr(e) && ["blast_door", "airlock_vestibule"].includes(e))) r.fail(path, `"entrance" is "blast_door" or "airlock_vestibule"`, 'write "entrance": "blast_door"'); }
      { const w = thing["wing"]; if (w !== undefined && !isObj(w)) r.fail(path, `"wing" is { "size": [w, d], "side", "offset" }`, 'write "wing": { "size": [5, 4], "side": "south" }'); }
      { const m = thing["materials"]; if (m !== undefined) { if (!isObj(m)) r.fail(path, `"materials" is { "wall", "trim", "roof" } of block ids`, 'write "materials": { "wall": "minecraft:sandstone" }'); else r.keys(`${path}.materials`, m, ["wall", "trim", "roof"], "materials"); } }
      break;
    case "prop":
      r.number(path, thing["yaw"], "yaw");
      for (const key of ["length", "width", "grade"]) r.number(path, thing[key], key);
      for (const key of ["curve", "platform"]) r.bool(path, thing[key], key);
      break;
    case "infra": {
      const route = thing["route"];
      if (!isObj(route)) r.fail(path, `"${is}" needs a "route": one of ${INFRA_ROUTE_KEYS.join(", ")} naming a thing`, 'write "route": { "ring": "north_farm", "margin": 8 }');
      else {
        const forms = INFRA_ROUTE_KEYS.filter((k) => route[k] !== undefined);
        if (forms.length !== 1) r.fail(`${path}.route`, `a route names exactly one form, found ${forms.length}`, `use one of: ${INFRA_ROUTE_KEYS.join(", ")}`);
        r.keys(`${path}.route`, route, [...INFRA_ROUTE_KEYS, "margin", "offset", "side", "run"], "a route");
      }
      r.bool(path, thing["gates"], "gates");
      break;
    }
    case "bespoke":
      checkSize(r, path, thing["size"], 3, false);
      r.number(path, thing["count"], "count", 1, 500);
      r.number(path, thing["spacing"], "spacing", 1, 512);
      r.number(path, thing["hover"], "hover", 8, 256);
      r.number(path, thing["depth"], "depth", 1, 32);
      r.enumeration(path, thing["seat"], SEAT_POLICIES, "seat");
      if (thing["hover"] !== undefined && thing["seat"] !== undefined) r.fail(path, `a thing either hovers or is seated, not both`, 'drop "hover" or "seat"');
      { const f = thing["face"]; if (f !== undefined && !(isObj(f) && ["toward", "away_from"].filter((k) => isStr(f[k])).length === 1 && Object.keys(f).length === 1)) r.fail(path, `"face" is { "toward": <id> } or { "away_from": <id> }`, 'write "face": { "toward": "old_town" }'); }
      { const el = thing["elevation"]; if (el !== undefined && (!Array.isArray(el) || el.length !== 2 || !el.every(isNum))) r.fail(path, `"elevation" is [min, max] relative to sea level`, 'write "elevation": [2, 80]'); }
      break;
  }
}

/** Result of validating a Loam 1 document. */
export interface LoamValidation {
  readonly diagnostics: readonly LoamDiagnostic[];
  /** The lowered settlement-profile document, present only when nothing is wrong at either level. */
  readonly document?: SettlementValidation["document"];
}

/**
 * Validate a Loam 1 document: its own shape first, then the lowered document
 * against the profile validator. Diagnostics from the second pass name the
 * lowered node paths, which keep the author's ids.
 */
export function validateLoam(input: unknown, registries: LoamRegistries): LoamValidation {
  const r = new Report();
  if (!isObj(input)) {
    r.fail("", `the document must be a JSON object, got ${describe(input)}`, "reply with one JSON object");
    return { diagnostics: r.out };
  }
  r.keys("", input, LOAM1_KEYS, "the document");
  if (input["loam"] !== "1") r.fail("", `"loam" must be "1", got ${describe(input["loam"])}`, 'set "loam": "1"');
  r.id("name", input["name"], '"name"');
  const seed = input["seed"];
  if (!(Number.isInteger(seed) && Math.abs(seed as number) < 2 ** 53) && !(isStr(seed) && /^-?\d+$/.test(seed))) r.fail("seed", `"seed" must be an integer or a decimal string, got ${describe(seed)}`, 'write "seed": 42');
  if (input["prompt"] !== undefined && !isStr(input["prompt"])) r.fail("prompt", '"prompt" must be text', "quote it");
  const size = input["size"];
  if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => Number.isInteger(n) && (n as number) >= 16 && (n as number) <= 4096)) r.fail("size", `"size" must be [width, depth] in 16..4096, got ${describe(size)}`, 'write "size": [512, 512]');
  const spawn = input["spawn"];
  if (spawn !== undefined) {
    if (!isObj(spawn)) r.fail("spawn", `"spawn" is { "zone" } or { "at" }`, 'write "spawn": { "zone": "center" }');
    else { r.keys("spawn", spawn, ["zone", "at"], "spawn"); checkPlacement(r, "spawn", spawn, false); }
  }
  const palette = input["palette"];
  if (palette !== undefined && !isObj(palette)) r.fail("palette", `"palette" is a map of symbol → block or { "mix": [...] }`, 'write "palette": { "ground.beach": "minecraft:sand" }');
  checkIntent(r, "intent", input["intent"]);
  const ids = new Set<string>();
  checkTerrain(r, input["terrain"]);
  checkLand(r, input["land"], ids);
  checkClimate(r, input["climate"]);
  checkWoods(r, input["woods"], ids);
  checkRoads(r, input["roads"]);
  const things = input["things"];
  if (things !== undefined) {
    if (!Array.isArray(things)) r.fail("things", `"things" must be a list`, 'write "things": []');
    else things.forEach((t, i) => checkThing(r, `things[${i}]`, t, ids, registries, false));
  }
  if (r.out.some((d) => d.severity === "error")) return { diagnostics: r.out };

  const lowered = lowerLoam(input, registries);
  const deep = validateSettlementDocument(lowered);
  return { diagnostics: [...r.out, ...deep.diagnostics], ...(deep.document === undefined ? {} : { document: deep.document }) };
}

/* -------------------------------------------------------------------------- */
/* lowering                                                                    */
/* -------------------------------------------------------------------------- */

const defined = (o: Obj): Obj => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

function lowerWhere(where: unknown, ground: unknown, clearance: unknown): Obj[] {
  const out: Obj[] = [];
  if (Array.isArray(where)) {
    for (const rel of normalizeWhere(where)) {
      const type = RELATIONS.find((n) => rel[n] !== undefined) as Relation;
      const strength = rel["strength"] === undefined ? {} : { strength: rel["strength"] };
      switch (type) {
        case "zone": out.push({ zone: rel["zone"], ...strength }); break;
        case "at": out.push(defined({ at: rel["at"], radius: rel["radius"], ...strength })); break;
        case "near": out.push(defined({ adjacent_to: rel["near"], gap: rel["gap"], ...strength })); break;
        case "distance": out.push(defined({ distance: rel["distance"], min: rel["min"], max: rel["max"], ...strength })); break;
        case "facing": out.push({ facing: rel["facing"], ...strength }); break;
        case "on": out.push(defined({ on: `@terrain:${rel["on"] as string}`, band: rel["band"], ...strength })); break;
        case "along": out.push(defined({ along: rel["along"], offset: rel["offset"], side: rel["side"], at: rel["at"], ...strength })); break;
        case "beside": out.push(defined({ beside: rel["beside"], offset: rel["offset"], side: rel["side"], at: rel["at"], ...strength })); break;
        case "tunnel": out.push(defined({ connected: rel["tunnel"], via: "tunnel", style: rel["style"], oreChamber: rel["oreChamber"], ...strength })); break;
      }
    }
  }
  if (isStr(ground) && ground !== "keep") out.push({ terrain_conform: ground, reference: "median" });
  if (isNum(clearance)) out.push({ clearance });
  return out;
}

/**
 * A prop's placement. The profile spells a prop's `at` as an absolute column
 * (the one place it does), so the author's fraction is resolved here against
 * the centred region — the author still never wrote a coordinate.
 */
function propPlacement(where: unknown, ctx: Lowering, hops = 0): Obj {
  const [width, depth] = [ctx.size[0] ?? 512, ctx.size[1] ?? 512];
  const rels = normalizeWhere(where);
  for (const rel of rels) {
    if (rel["zone"] !== undefined) return { zone: rel["zone"] };
    const at = rel["at"];
    if (at === "pier") return { at: "pier" };
    if (Array.isArray(at) && isNum(at[0]) && isNum(at[1])) {
      return { at: { x: -Math.floor(width / 2) + Math.round(at[0] * width), z: -Math.floor(depth / 2) + Math.round(at[1] * depth) } };
    }
  }
  // A prop placed by its relation to another thing goes where that thing
  // goes: the solver never sees a prop, so the target's own coarse placement
  // is the prop's. Piers moor hulls; anything else is coarse.
  if (hops < 4) {
    for (const rel of rels) {
      const target = rel["near"] ?? rel["distance"] ?? rel["facing"] ?? rel["along"] ?? rel["beside"];
      if (!isStr(target)) continue;
      const thing = ctx.things.get(target) ?? [...ctx.things.values()].find((t) => target.startsWith("#tag:") && Array.isArray(t["tags"]) && (t["tags"] as string[]).includes(target.slice(5)));
      if (thing === undefined) continue;
      if (thing["is"] === "pier") return { at: "pier" };
      const found = propPlacement(thing["where"], ctx, hops + 1);
      if (Object.keys(found).length > 0) return found;
    }
  }
  return {};
}

/** Clamp a prop's run params into the ranges the profile builds. */
function clampProp(thing: Obj): Obj {
  const clamp = (v: unknown, lo: number, hi: number) => (isNum(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined);
  const yaw = isNum(thing["yaw"]) ? ((Math.round(thing["yaw"] / 90) * 90) % 360 + 360) % 360 : undefined;
  return defined({ yaw, length: clamp(thing["length"], 3, 64), width: clamp(thing["width"], 1, 5), grade: clamp(thing["grade"], 0, 4), curve: thing["curve"], platform: thing["platform"] });
}

function scatterArea(where: unknown): Obj {
  if (!Array.isArray(where)) return { all: true };
  for (const rel of normalizeWhere(where)) {
    if (rel["zone"] !== undefined) return { zone: rel["zone"] };
    if (rel["at"] !== undefined) return { at: rel["at"], radius: rel["radius"] ?? 0.25 };
  }
  return { all: true };
}

function lowerWalls(walls: unknown): Obj | undefined {
  if (!isObj(walls)) return undefined;
  return defined({ style: walls["style"], height: walls["height"], gates: walls["gates"], towerPitch: walls["every"], margin: walls["margin"], enclose: walls["enclose"], materials: walls["materials"] });
}

function lowerIntent(intent: unknown): Obj | undefined {
  if (!isObj(intent)) return undefined;
  const out: Obj = { ...intent };
  const character = intent["character"];
  if (isObj(character)) {
    const c: Obj = { ...character };
    if (c["materials"] !== undefined) { c["materialTheme"] = c["materials"]; delete c["materials"]; }
    if (c["packs"] !== undefined) { c["formPacks"] = c["packs"]; delete c["packs"]; }
    out["character"] = c;
  }
  return out;
}

interface Lowering {
  readonly registries: LoamRegistries;
  readonly palettes: Obj;
  readonly size: readonly number[];
  /** Every top-level thing by id, for relations that resolve through another thing. */
  readonly things: ReadonlyMap<string, Obj>;
}

function lowerThing(thing: Obj, ctx: Lowering, inFabric: boolean): Obj {
  const id = thing["id"] as string;
  const is = thing["is"] as string;
  const kind = kindOf(is, ctx.registries);
  const base = defined({ id, tags: thing["tags"], optional: thing["optional"], label: thing["label"], note: thing["note"] });
  const constraints = inFabric ? undefined : lowerWhere(thing["where"], thing["ground"], thing["clearance"]);
  const withConstraints = constraints !== undefined && constraints.length > 0 ? { constraints } : {};
  const size = thing["size"] as number[] | undefined;
  const region = (s: number[] | undefined) => (s === undefined ? undefined : { shape: "region", size: [s[0], s[s.length - 1]] });
  const box = (s: number[] | undefined, y = 20) => (s === undefined ? undefined : { shape: "box", size: s.length === 3 ? s : [s[0], y, s[1]] });

  switch (kind) {
    case "plaza":
      return { ...base, kind: "primitive", envelope: region(size), ...withConstraints, tags: [...new Set([...(thing["tags"] as string[] | undefined ?? []), "plaza"])] };
    case "district": case "city": {
      const walls = lowerWalls(thing["walls"]);
      const params = kind === "district"
        ? defined({ fabric: thing["form"], density: thing["density"], mix: thing["mix"], blockSize: thing["blocks"], plaza: thing["plaza"], focus: thing["focus"], courtyards: thing["courtyards"], ground: thing["terraced"] === true ? "stepped" : undefined, walls })
        : defined({ size: thing["plan"], mix: thing["mix"], characters: thing["characters"], forms: thing["forms"], coastal: thing["coastal"], ring: thing["ring"], diagonals: thing["diagonals"], setPieces: thing["setPieces"], courtyards: thing["courtyards"], ground: thing["terraced"] === true ? "stepped" : undefined, walls });
      const children = Array.isArray(thing["children"]) ? (thing["children"] as Obj[]).map((c) => lowerThing(c, ctx, true)) : undefined;
      return defined({ ...base, kind, envelope: region(size), params, ...withConstraints, intent: lowerIntent(thing["intent"]), children });
    }
    case "farm":
      return defined({ ...base, kind: "generator", generator: "precinct.farm@0", envelope: region(size), params: defined({ parcels: thing["parcels"], parcelSize: thing["parcelSize"], crops: thing["crops"], farmstead: thing["farmstead"], edge: thing["edge"], fallow: thing["fallow"] }), ...withConstraints, ports: { gate: { type: "road_stub", face: "south" } } });
    case "airport":
      return defined({ ...base, kind: "generator", generator: "precinct.airport@0", envelope: box(size, 24), params: defined({ stands: thing["stands"], hangars: thing["hangars"], terminal: thing["terminal"] }), ...withConstraints });
    case "harbour":
      return defined({ ...base, kind: "generator", generator: "precinct.harbour@0", envelope: box(size, 16), params: defined({ piers: thing["piers"], ships: thing["ships"] }), ...withConstraints });
    case "building": {
      const materials = isObj(thing["materials"]) ? (thing["materials"] as Obj) : {};
      // The building stage resolves a style symbol by block name first, so a
      // block id is the symbol.
      const symbol = (role: string): string | undefined => (isStr(materials[role]) ? (materials[role] as string) : undefined);
      const entrance = thing["entrance"];
      const params = defined({
        archetype: is, floors: thing["floors"], floorHeight: thing["storey"], roof: thing["roof"], windowRhythm: thing["windows"],
        wing: thing["wing"], basement: thing["cellar"], decay: thing["decay"], vista: thing["vista"],
        entrance: isStr(entrance) ? { treatment: entrance } : undefined,
        wallSymbol: symbol("wall"), trimSymbol: symbol("trim"), roofSymbol: symbol("roof"),
      });
      const door = thing["door"];
      return defined({ ...base, kind: "generator", generator: "building.grammar@0", envelope: box(size), params, ...withConstraints, ports: isStr(door) ? { door: { type: "door", face: door } } : undefined });
    }
    case "prop":
      return defined({ ...base, kind: "generator", generator: "prop.place@0", params: defined({ prop: is, ...propPlacement(thing["where"], ctx), ...clampProp(thing) }) });
    case "infra":
      return defined({ ...base, kind: "generator", generator: "infra.entry@0", params: defined({ entry: is, route: thing["route"], gates: thing["gates"] }) });
    case "bespoke": {
      const slug = slugProgramId(is);
      // A bespoke thing's front is turned by its program's `face`, never by a
      // solver constraint, so a `facing` relation becomes `face.toward`.
      const facingRel = normalizeWhere(thing["where"]).find((r) => isStr(r["facing"]));
      const face = thing["face"] ?? (facingRel === undefined ? undefined : { toward: facingRel["facing"] });
      const seating = defined({ hover: thing["hover"], seat: thing["seat"], embedDepth: thing["depth"], face });
      if (isNum(thing["count"]) && thing["count"] > 1) {
        return defined({ ...base, kind: "generator", generator: "scatter.program@0", params: defined({ program: slug, brief: thing["brief"], envelope: size, count: thing["count"], area: scatterArea(thing["where"]), spacing: thing["spacing"], elevation: thing["elevation"], ...seating }) });
      }
      const bespokeConstraints = (constraints ?? []).filter((c) => c["facing"] === undefined);
      return defined({ ...base, kind: "generator", generator: `authored:${slug}`, envelope: box(size), params: { brief: thing["brief"], ...seating }, ...(bespokeConstraints.length > 0 ? { constraints: bespokeConstraints } : {}) });
    }
  }
}

function lowerWood(wood: Obj, ctx: Lowering): Obj {
  const id = wood["id"] as string;
  const species = (list: unknown, prefix: string): Obj[] | undefined => {
    if (!Array.isArray(list)) return undefined;
    return (list as Obj[]).map((s, i) => {
      const sid = isStr(s["id"]) ? s["id"] : `${prefix}_${s["shape"] as string}_${i}`;
      const height = s["height"] as number[] | undefined;
      const palette = (role: "trunk" | "leaves"): string | undefined => {
        const block = s[role];
        if (!isStr(block)) return undefined;
        const name = `flora.${sid}.${role}`;
        ctx.palettes[name] = block;
        return name;
      };
      return defined({ id: sid, shape: s["shape"], weight: s["weight"], minHeight: height?.[0], maxHeight: height?.[1], trunkPalette: palette("trunk"), leafPalette: palette("leaves") });
    });
  };
  const layers = wood["layers"];
  const floor = wood["floor"];
  let strata: unknown;
  if (layers === true && floor === undefined) strata = true;
  else if (layers !== undefined || floor !== undefined) {
    const l = isObj(layers) ? layers : {};
    const lift = (v: unknown, layer: string) => (isObj(v) ? { species: species(v["species"], `${id}_${layer}`) } : v);
    strata = defined({
      emergent: layers === true ? "default" : lift(l["emergent"], "emergent"),
      understory: layers === true ? "default" : lift(l["understory"], "understory"),
      floor,
    });
  }
  const area = wood["area"];
  return defined({
    id, kind: "generator", generator: "scatter.forest@0", label: wood["label"], note: wood["note"],
    params: defined({
      area: area === undefined || area === "all" ? undefined : area,
      density: wood["density"], elevation: wood["elevation"], undergrowth: wood["undergrowth"],
      snowLine: wood["treeline"], clumping: wood["grove"], preserveCanopy: wood["inside"], strata,
      species: species(wood["species"], id),
    }),
  });
}

/**
 * Rewrite a Loam 1 document into the settlement profile the compiler compiles.
 *
 * Pure: the input is not touched. Assumes the shape checks of {@link validateLoam}
 * passed; the profile validator is the second, deeper check.
 */
export function lowerLoam(input: Obj, registries: LoamRegistries): Obj {
  const thingsIn = Array.isArray(input["things"]) ? (input["things"] as Obj[]) : [];
  const ctx: Lowering = {
    registries,
    palettes: {},
    size: Array.isArray(input["size"]) ? (input["size"] as number[]) : [512, 512],
    things: new Map(thingsIn.filter((t) => isStr(t["id"])).map((t) => [t["id"] as string, t])),
  };
  const terrain = isObj(input["terrain"]) ? (input["terrain"] as Obj) : {};
  const ocean = isObj(terrain["ocean"]) ? (terrain["ocean"] as Obj) : undefined;
  const heightfield: Obj = {
    id: "terrain", kind: "generator", generator: "terrain.heightfield@0",
    params: defined({
      seaLevel: terrain["sea"], baseHeight: terrain["base"], amplitude: terrain["relief"],
      frequency: isNum(terrain["scale"]) ? 1 / terrain["scale"] : undefined,
      ridged: terrain["ridged"], curve: terrain["curve"], beachWidth: terrain["beach"], snowLineFraction: terrain["snowline"],
      continentalness: ocean === undefined ? undefined : { seaFraction: ocean["share"], frequency: 1 / (isNum(ocean["scale"]) ? ocean["scale"] : 1100) },
    }),
    children: (Array.isArray(input["land"]) ? (input["land"] as Obj[]) : []).map((e) => {
      const wild = isNum(e["wild"]) ? e["wild"] : 0.5;
      const verb = e["verb"] as string;
      const radial = !(COURSE_VERBS as readonly string[]).includes(verb);
      return defined({
        id: e["id"], kind: "generator", generator: "terrain.edit@0", label: e["label"], note: e["note"],
        params: defined({
          verb, at: e["at"], zone: e["zone"], course: e["course"], width: e["width"], height: e["height"], radius: e["radius"], depth: e["depth"],
          profile: e["profile"], caldera: e["caldera"], calderaDepth: e["calderaDepth"], lava: e["lava"], lavaFlows: e["lavaFlows"], water: e["water"], flooded: e["flooded"],
          irregularity: radial ? Math.round(wild * 0.36 * 1000) / 1000 : undefined,
          meander: radial ? undefined : wild,
        }),
      });
    }),
  };
  const climateIn = isObj(input["climate"]) ? (input["climate"] as Obj) : {};
  const climate: Obj = { id: "climate", kind: "generator", generator: "terrain.climate@0", params: defined({ forceTheme: climateIn["theme"], latitudeGradient: climateIn["gradient"] }) };
  const woods = (Array.isArray(input["woods"]) ? (input["woods"] as Obj[]) : []).map((w) => lowerWood(w, ctx));
  const things = (Array.isArray(input["things"]) ? (input["things"] as Obj[]) : []).map((t) => lowerThing(t, ctx, false));
  const roadsIn = input["roads"];
  // Omitted `reach` means every thing a lane can arrive at: buildings, the
  // plaza, quarters, compounds and single bespoke things — never a prop, a
  // line, or a scattered thing.
  const reachable = (Array.isArray(input["things"]) ? (input["things"] as Obj[]) : [])
    .filter((t) => {
      const kind = kindOf(t["is"] as string, registries);
      if (kind === "prop" || kind === "infra") return false;
      if (kind === "bespoke" && isNum(t["count"]) && t["count"] > 1) return false;
      return true;
    })
    .map((t) => t["id"] as string);
  const roads: Obj[] = isObj(roadsIn)
    ? [{ id: "roads", kind: "generator", generator: "road.network@0", params: defined({ anchors: roadsIn["reach"] ?? (reachable.length > 0 ? reachable : undefined), pattern: roadsIn["pattern"], width: roadsIn["width"], lanterns: roadsIn["lit"], junctionStyle: roadsIn["junctions"] }) }]
    : [];
  const palettes = { ...(isObj(input["palette"]) ? (input["palette"] as Obj) : {}), ...ctx.palettes };
  const spawn = input["spawn"];
  return defined({
    loam: "0.1",
    profile: "settlement",
    meta: defined({ name: input["name"], worldSeed: input["seed"], prompt: input["prompt"], spawn }),
    style: { palettes },
    intent: lowerIntent(input["intent"]),
    programs: input["programs"],
    root: {
      id: "world", kind: "composite",
      envelope: { shape: "region", size: input["size"] },
      children: [heightfield, climate, ...woods, ...things, ...roads],
    },
  });
}

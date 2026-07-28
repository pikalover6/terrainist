/**
 * Strict, hand-rolled validator for terrain-profile documents.
 *
 * Hand-rolled rather than schema-driven on purpose: every rejection has to
 * produce a diagnostic whose `fix` hint is specific enough to hand straight to
 * an LLM retry loop, and a generic JSON-Schema error ("must match pattern
 * ^[a-z]...") is not that.
 *
 * The validator never throws on bad input and never stops at the first
 * problem — it reports as much as it can in one pass, because a retry loop
 * that fixes one error per round trip is a retry loop that never converges.
 */

import { type LoamDiagnostic, error, hasErrors } from "./diagnostics.js";
import {
  CLIMATE_THEMES,
  COURSE_VERBS,
  EDIT_VERBS,
  FALLOFF_PROFILES,
  ID_PATTERN,
  PROFILE_GENERATORS,
  TREE_SHAPES,
  ZONE_TOKENS,
  type ClimateTheme,
  type EditVerbName,
  type TerrainDocument,
  type TreeShape,
  type ZoneToken,
} from "./types.js";

/** Result of validating a candidate terrain document. */
export interface TerrainValidation {
  readonly diagnostics: readonly LoamDiagnostic[];
  /** The validated document, present only when no `error` diagnostic was produced. */
  readonly document?: TerrainDocument;
}

/** Maximum node depth (world → generator → edit). */
export const MAX_PROFILE_DEPTH = 3;

/** Keys accepted on every node, everywhere. */
const ALWAYS_ALLOWED = ["label", "note"] as const;

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Numeric-parameter schema entry. */
interface NumSpec {
  readonly min?: number;
  readonly max?: number;
  readonly int?: boolean;
}

const HEIGHTFIELD_NUMS: Readonly<Record<string, NumSpec>> = {
  seaLevel: { min: -64, max: 319, int: true },
  baseHeight: { min: -64, max: 319 },
  amplitude: { min: 0, max: 320 },
  octaves: { min: 1, max: 10, int: true },
  frequency: { min: 0, max: 1 },
  lacunarity: { min: 1, max: 8 },
  gain: { min: 0, max: 1 },
  erosionPasses: { min: 0, max: 8, int: true },
  cliffThreshold: { min: 0, max: 90 },
  soilDepth: { min: 0, max: 32, int: true },
  beachWidth: { min: 0, max: 64, int: true },
  snowLineFraction: { min: 0, max: 1 },
};

const EDIT_NUMS: Readonly<Record<string, NumSpec>> = {
  strength: { min: 0, max: 1 },
  width: { min: 1, max: 2048 },
  height: { min: 0, max: 320 },
  radius: { min: 1, max: 2048 },
  depth: { min: 0, max: 320 },
  rim: { min: 0, max: 512 },
  calderaDepth: { min: 0, max: 320 },
};

const CLIMATE_NUMS: Readonly<Record<string, NumSpec>> = {
  temperatureFrequency: { min: 0, max: 1 },
  humidityFrequency: { min: 0, max: 1 },
  blendRadius: { min: 0, max: 64, int: true },
  latitudeGradient: { min: -4, max: 4 },
};

const FOREST_NUMS: Readonly<Record<string, NumSpec>> = {
  density: { min: 0, max: 1 },
  spacing: { min: 1, max: 64 },
  clumping: { min: 0, max: 1 },
  maxSlope: { min: 0, max: 90 },
  edgeFalloff: { min: 0, max: 256, int: true },
  snowLine: { min: -64, max: 319, int: true },
};

/** Per-verb required/forbidden shape params, for the T104 "wrong knob" hint. */
const VERB_SHAPE_KEYS: Readonly<Record<EditVerbName, readonly string[]>> = {
  ridge: ["width", "height", "profile"],
  peak: ["radius", "height", "profile"],
  volcano: ["radius", "height", "caldera", "calderaDepth", "lava", "profile"],
  plateau: ["radius", "height", "rim", "profile"],
  island: ["radius", "height", "profile"],
  valley: ["width", "depth", "profile"],
  river: ["width", "depth", "profile"],
  basin: ["radius", "depth", "water", "profile"],
};

/**
 * Validate a parsed JSON value as a terrain-profile document.
 *
 * @param input any JSON value (typically `JSON.parse` output).
 */
export function validateTerrainDocument(input: unknown): TerrainValidation {
  const out: LoamDiagnostic[] = [];

  if (!isObject(input)) {
    out.push(
      error(
        "BAD_DOCUMENT",
        "",
        `the document must be a JSON object, got ${describe(input)}`,
        'wrap the whole spec in an object with "loam", "profile", "meta" and "root" keys',
      ),
    );
    return { diagnostics: out };
  }

  unknownKeys(out, input, "", ["loam", "profile", "meta", "style", "root"], "document");

  if (input["loam"] !== "0.1") {
    out.push(
      error(
        "BAD_DOCUMENT",
        "",
        `"loam" must be the string "0.1", got ${describe(input["loam"])}`,
        'set "loam": "0.1" at the top of the document',
      ),
    );
  }
  if (input["profile"] !== "terrain") {
    out.push(
      error(
        "BAD_DOCUMENT",
        "",
        `"profile" must be the string "terrain", got ${describe(input["profile"])}`,
        'set "profile": "terrain" — this compiler only accepts the terrain profile',
      ),
    );
  }

  validateMeta(out, input["meta"]);
  validateStyle(out, input["style"]);
  validateRoot(out, input["root"]);

  if (hasErrors(out)) return { diagnostics: out };
  return { diagnostics: out, document: input as unknown as TerrainDocument };
}

/* -------------------------------------------------------------------------- */
/* meta                                                                        */
/* -------------------------------------------------------------------------- */

function validateMeta(out: LoamDiagnostic[], meta: unknown): void {
  if (meta === undefined) {
    out.push(
      error(
        "MISSING_KEY",
        "",
        'the document has no "meta" block',
        'add "meta": { "name": "<world_id>", "worldSeed": <integer> }',
      ),
    );
    return;
  }
  if (!isObject(meta)) {
    out.push(
      error("BAD_TYPE", "", `"meta" must be an object, got ${describe(meta)}`, 'replace "meta" with an object holding "name" and "worldSeed"'),
    );
    return;
  }
  unknownKeys(out, meta, "meta", ["name", "worldSeed", "prompt", "spawn"], "meta");

  const name = meta["name"];
  if (typeof name !== "string") {
    out.push(
      error("MISSING_KEY", "meta", `"meta.name" must be a string, got ${describe(name)}`, 'set "meta.name" to the world folder name, e.g. "misty_fjords"'),
    );
  } else if (!ID_PATTERN.test(name)) {
    out.push(
      error(
        "BAD_ID",
        "meta",
        `"meta.name" is "${name}", which is not a valid Loam id`,
        "rename it to match ^[a-z][a-z0-9_]{0,62}$ — lowercase letters, digits and underscores, starting with a letter (e.g. \"misty_fjords\")",
      ),
    );
  }

  const seed = meta["worldSeed"];
  if (typeof seed === "number") {
    if (!Number.isInteger(seed) || Math.abs(seed) >= 2 ** 53) {
      out.push(
        error(
          "PARAM_OUT_OF_RANGE",
          "meta",
          `"meta.worldSeed" must be an integer with |seed| < 2^53, got ${seed}`,
          "use a whole number such as 813205, or a decimal string for a full 64-bit seed",
        ),
      );
    }
  } else if (typeof seed === "string") {
    if (!/^-?\d+$/.test(seed)) {
      out.push(
        error(
          "BAD_TYPE",
          "meta",
          `"meta.worldSeed" is the string "${seed}", which is not a decimal integer`,
          'use a decimal string of digits only, e.g. "-4172819402713945201"',
        ),
      );
    }
  } else {
    out.push(
      error("MISSING_KEY", "meta", `"meta.worldSeed" must be an integer or decimal string, got ${describe(seed)}`, 'set "meta.worldSeed" to an integer, e.g. 813205'),
    );
  }

  if (meta["prompt"] !== undefined && typeof meta["prompt"] !== "string") {
    out.push(error("BAD_TYPE", "meta", `"meta.prompt" must be a string, got ${describe(meta["prompt"])}`, 'set "meta.prompt" to the original text prompt, or omit it'));
  }

  const spawn = meta["spawn"];
  if (spawn !== undefined) {
    if (!isObject(spawn)) {
      out.push(error("BAD_TYPE", "meta.spawn", `"meta.spawn" must be an object, got ${describe(spawn)}`, 'use { "zone": "center" } or { "at": [0.5, 0.5] }, or omit "meta.spawn" entirely'));
    } else {
      unknownKeys(out, spawn, "meta.spawn", ["zone", "at"], "spawn");
      const hasZone = spawn["zone"] !== undefined;
      const hasAt = spawn["at"] !== undefined;
      if (hasZone === hasAt) {
        out.push(
          error(
            "BAD_PLACEMENT",
            "meta.spawn",
            hasZone ? '"meta.spawn" sets both "zone" and "at"' : '"meta.spawn" sets neither "zone" nor "at"',
            'give exactly one: { "zone": "west" } or { "at": [0.2, 0.5] }',
          ),
        );
      }
      if (hasZone) checkZone(out, "meta.spawn", "zone", spawn["zone"]);
      if (hasAt) checkFractional(out, "meta.spawn", "at", spawn["at"]);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* style                                                                       */
/* -------------------------------------------------------------------------- */

function validateStyle(out: LoamDiagnostic[], style: unknown): void {
  if (style === undefined) return;
  if (!isObject(style)) {
    out.push(error("BAD_TYPE", "style", `"style" must be an object, got ${describe(style)}`, 'use "style": { "palettes": { "ground.beach": "minecraft:sand" } } or omit "style"'));
    return;
  }
  unknownKeys(out, style, "style", ["palettes"], "style");
  const palettes = style["palettes"];
  if (palettes === undefined) return;
  if (!isObject(palettes)) {
    out.push(error("BAD_TYPE", "style.palettes", `"style.palettes" must be an object, got ${describe(palettes)}`, 'map each symbol to a block name or a mix, e.g. { "ground.beach": "minecraft:sand" }'));
    return;
  }
  for (const [symbol, value] of Object.entries(palettes)) {
    const at = `style.palettes.${symbol}`;
    if (typeof value === "string") {
      if (value.trim() === "") {
        out.push(error("BAD_PALETTE", at, `palette symbol "${symbol}" maps to an empty block name`, 'use a namespaced block id such as "minecraft:gravel"'));
      }
      continue;
    }
    if (!isObject(value) || !Array.isArray(value["mix"])) {
      out.push(
        error(
          "BAD_PALETTE",
          at,
          `palette symbol "${symbol}" must map to a block name or { "mix": [[block, weight], ...] }, got ${describe(value)}`,
          'use "minecraft:sand", or { "mix": [["minecraft:black_concrete_powder", 3], ["minecraft:gravel", 2]] }',
        ),
      );
      continue;
    }
    unknownKeys(out, value, at, ["mix"], "palette entry");
    const mix = value["mix"] as unknown[];
    if (mix.length === 0) {
      out.push(error("BAD_PALETTE", at, `palette symbol "${symbol}" has an empty "mix"`, "list at least one [block, weight] pair inside \"mix\""));
    }
    for (const [i, entry] of mix.entries()) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || typeof entry[1] !== "number" || !(entry[1] > 0)) {
        out.push(
          error(
            "BAD_PALETTE",
            at,
            `"mix"[${i}] of symbol "${symbol}" must be [blockName, positiveWeight], got ${describe(entry)}`,
            'write each entry as ["minecraft:gravel", 2] — a block id and a weight greater than zero',
          ),
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* root + nodes                                                                */
/* -------------------------------------------------------------------------- */

function validateRoot(out: LoamDiagnostic[], root: unknown): void {
  if (root === undefined) {
    out.push(error("MISSING_KEY", "", 'the document has no "root" node', 'add a "root" composite: { "id": "world", "kind": "composite", "envelope": { "shape": "region", "size": [512, 512] }, "children": [...] }'));
    return;
  }
  if (!isObject(root)) {
    out.push(error("BAD_TYPE", "", `"root" must be an object, got ${describe(root)}`, 'make "root" a composite node object'));
    return;
  }

  unknownKeys(out, root, "root", ["id", "kind", "envelope", "children", "tags", "seedSalt", "constraints", "ports"], "root node");

  const id = typeof root["id"] === "string" ? root["id"] : "root";
  checkId(out, "", root["id"], "root");
  const path = id;

  if (root["kind"] !== "composite") {
    out.push(error("BAD_ENUM", path, `the root node's "kind" must be "composite", got ${describe(root["kind"])}`, 'set "kind": "composite" on the root node'));
  }
  checkNoConstraints(out, path, root);
  validateRootEnvelope(out, path, root["envelope"]);

  const children = root["children"];
  if (!Array.isArray(children) || children.length === 0) {
    out.push(error("MISSING_KEY", path, `the root node needs a non-empty "children" array, got ${describe(children)}`, 'add at least a terrain.heightfield@0 node and a terrain.climate@0 node to "root.children"'));
    return;
  }

  const seenIds = new Set<string>();
  let heightfields = 0;
  let climates = 0;

  for (const [index, raw] of children.entries()) {
    if (!isObject(raw)) {
      out.push(error("BAD_TYPE", `${path}.children[${index}]`, `each child must be an object, got ${describe(raw)}`, "replace this array entry with a generator node object"));
      continue;
    }
    const childId = typeof raw["id"] === "string" ? raw["id"] : `children[${index}]`;
    const childPath = `${path}.${childId}`;
    checkId(out, path, raw["id"], `children[${index}]`);
    if (typeof raw["id"] === "string") {
      if (seenIds.has(raw["id"])) {
        out.push(error("DUPLICATE_ID", childPath, `two children of "${path}" share the id "${raw["id"]}"`, `rename one of them — sibling ids must be unique (e.g. "${raw["id"]}_2")`));
      }
      seenIds.add(raw["id"]);
    }

    const generator = raw["generator"];
    if (raw["kind"] !== "generator") {
      out.push(error("BAD_ENUM", childPath, `children of the root must have "kind": "generator", got ${describe(raw["kind"])}`, 'set "kind": "generator" — the terrain profile has no nested composites'));
    }
    if (typeof generator !== "string" || !(PROFILE_GENERATORS as readonly string[]).includes(generator)) {
      out.push(
        error(
          "GENERATOR_NOT_IN_PROFILE",
          childPath,
          `generator ${describe(generator)} is not allowed by the terrain profile`,
          `use one of: ${PROFILE_GENERATORS.join(", ")}`,
        ),
      );
      continue;
    }
    checkNoConstraints(out, childPath, raw);

    switch (generator) {
      case "terrain.heightfield@0":
        heightfields++;
        validateHeightfieldNode(out, childPath, raw);
        break;
      case "terrain.climate@0":
        climates++;
        validateClimateNode(out, childPath, raw);
        break;
      case "scatter.forest@0":
        validateForestNode(out, childPath, raw);
        break;
      case "terrain.edit@0":
        out.push(
          error(
            "EDIT_NOT_UNDER_HEIGHTFIELD",
            childPath,
            "terrain.edit@0 appears as a child of the root",
            'move this node into the "children" array of the terrain.heightfield@0 node — edits compose into the master field, they are not siblings of it',
          ),
        );
        break;
    }
  }

  if (heightfields !== 1) {
    out.push(
      error(
        "GENERATOR_CARDINALITY",
        path,
        `the document has ${heightfields} terrain.heightfield@0 nodes; the profile requires exactly one`,
        heightfields === 0
          ? 'add one { "kind": "generator", "generator": "terrain.heightfield@0", "params": { ... } } child to the root'
          : "merge the extra heightfield nodes into one — express their differences as terrain.edit@0 children instead",
      ),
    );
  }
  if (climates !== 1) {
    out.push(
      error(
        "GENERATOR_CARDINALITY",
        path,
        `the document has ${climates} terrain.climate@0 nodes; the profile requires exactly one`,
        climates === 0
          ? 'add one { "kind": "generator", "generator": "terrain.climate@0", "params": {} } child to the root'
          : "keep a single climate node and delete the others",
      ),
    );
  }
}

function validateRootEnvelope(out: LoamDiagnostic[], path: string, envelope: unknown): void {
  if (!isObject(envelope)) {
    out.push(error("MISSING_KEY", path, `the root node needs an "envelope", got ${describe(envelope)}`, 'add "envelope": { "shape": "region", "size": [512, 512] }'));
    return;
  }
  unknownKeys(out, envelope, `${path}.envelope`, ["shape", "size", "follows"], "envelope");
  if (envelope["shape"] !== "region") {
    out.push(error("BAD_ENUM", `${path}.envelope`, `the root envelope "shape" must be "region", got ${describe(envelope["shape"])}`, 'set "shape": "region" — the terrain profile only supports rectangular regions'));
  }
  const size = envelope["size"];
  if (!Array.isArray(size) || size.length !== 2) {
    out.push(error("MISSING_KEY", `${path}.envelope`, `the root envelope needs "size": [width, depth], got ${describe(size)}`, 'add "size": [512, 512] (blocks along X and Z)'));
    return;
  }
  for (const [i, v] of size.entries()) {
    const axis = i === 0 ? "width" : "depth";
    if (typeof v !== "number" || !Number.isInteger(v) || v < 16 || v > 4096) {
      out.push(
        error(
          "PARAM_OUT_OF_RANGE",
          `${path}.envelope`,
          `envelope size ${axis} must be an integer in 16..4096, got ${describe(v)}`,
          "use a multiple of 16 between 16 and 4096, e.g. 512",
        ),
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* generator nodes                                                             */
/* -------------------------------------------------------------------------- */

function validateHeightfieldNode(out: LoamDiagnostic[], path: string, node: Obj): void {
  unknownKeys(out, node, path, ["id", "kind", "generator", "envelope", "params", "children", "tags", "seedSalt", "constraints", "ports"], "terrain.heightfield@0 node");
  const params = requireParams(out, path, node, "terrain.heightfield@0");
  if (params) validateHeightfieldParams(out, path, params);

  const children = node["children"];
  if (children === undefined) return;
  if (!Array.isArray(children)) {
    out.push(error("BAD_TYPE", path, `"children" must be an array, got ${describe(children)}`, 'make "children" an array of terrain.edit@0 nodes, or remove it'));
    return;
  }
  const seen = new Set<string>();
  for (const [index, raw] of children.entries()) {
    if (!isObject(raw)) {
      out.push(error("BAD_TYPE", `${path}.children[${index}]`, `each edit child must be an object, got ${describe(raw)}`, "replace this entry with a terrain.edit@0 node object"));
      continue;
    }
    const editId = typeof raw["id"] === "string" ? raw["id"] : `children[${index}]`;
    const editPath = `${path}.${editId}`;
    checkId(out, path, raw["id"], `children[${index}]`);
    if (typeof raw["id"] === "string") {
      if (seen.has(raw["id"])) {
        out.push(error("DUPLICATE_ID", editPath, `two edits under "${path}" share the id "${raw["id"]}"`, `rename one of them — sibling ids must be unique (e.g. "${raw["id"]}_2")`));
      }
      seen.add(raw["id"]);
    }
    if (raw["generator"] !== "terrain.edit@0") {
      out.push(
        error(
          "EDIT_NOT_UNDER_HEIGHTFIELD",
          editPath,
          `children of terrain.heightfield@0 must be terrain.edit@0 nodes, got ${describe(raw["generator"])}`,
          "only terrain.edit@0 may nest under the heightfield; move any other generator up to root.children",
        ),
      );
      continue;
    }
    checkNoConstraints(out, editPath, raw);
    validateEditNode(out, editPath, raw);
    if (Array.isArray(raw["children"]) && raw["children"].length > 0) {
      out.push(
        error(
          "DEPTH_EXCEEDED",
          editPath,
          `terrain.edit@0 node "${editId}" has children, which would make the tree deeper than ${MAX_PROFILE_DEPTH} levels`,
          "flatten it: list every edit directly under the heightfield node — edits do not nest",
        ),
      );
    }
  }
}

function validateEditNode(out: LoamDiagnostic[], path: string, node: Obj): void {
  unknownKeys(out, node, path, ["id", "kind", "generator", "envelope", "params", "children", "tags", "seedSalt", "constraints", "ports"], "terrain.edit@0 node");
  if (node["kind"] !== "generator") {
    out.push(error("BAD_ENUM", path, `edit nodes must have "kind": "generator", got ${describe(node["kind"])}`, 'set "kind": "generator"'));
  }
  const params = requireParams(out, path, node, "terrain.edit@0");
  if (!params) return;

  unknownKeys(out, params, `${path}.params`, ["verb", "strength", "at", "zone", "course", "width", "height", "radius", "depth", "profile", "rim", "caldera", "calderaDepth", "lava", "water"], "terrain.edit@0 params");

  const verb = params["verb"];
  if (typeof verb !== "string" || !(EDIT_VERBS as readonly string[]).includes(verb)) {
    out.push(error("BAD_ENUM", `${path}.params`, `"verb" must be one of the eight terrain verbs, got ${describe(verb)}`, `set "verb" to one of: ${EDIT_VERBS.join(", ")}`));
    return;
  }
  const v = verb as EditVerbName;

  checkNumbers(out, `${path}.params`, params, EDIT_NUMS);
  checkBooleans(out, `${path}.params`, params, ["caldera", "lava", "water"]);
  if (params["profile"] !== undefined && !(FALLOFF_PROFILES as readonly string[]).includes(params["profile"] as string)) {
    out.push(error("BAD_ENUM", `${path}.params`, `"profile" must be "sharp" or "rounded", got ${describe(params["profile"])}`, 'set "profile": "sharp" for a crisp cone or "rounded" for a soft dome'));
  }

  // Placement.
  const wantsCourse = COURSE_VERBS.includes(v);
  const given = (["at", "zone", "course"] as const).filter((k) => params[k] !== undefined);
  if (given.length !== 1) {
    out.push(
      error(
        "BAD_PLACEMENT",
        `${path}.params`,
        given.length === 0
          ? `verb "${v}" has no placement`
          : `verb "${v}" sets ${given.length} placement params (${given.join(", ")}); exactly one is allowed`,
        wantsCourse
          ? `give "${v}" a "course": [[fx, fz], ...] of 2–8 fractional waypoints and remove any "at"/"zone"`
          : `give "${v}" either "at": [fx, fz] or "zone": "<token>" and remove the others`,
      ),
    );
  } else if (wantsCourse && given[0] !== "course") {
    out.push(
      error(
        "BAD_PLACEMENT",
        `${path}.params`,
        `verb "${v}" is a linear feature but is placed with "${given[0]}"`,
        `replace "${given[0]}" with "course": [[fx0, fz0], [fx1, fz1]] — 2–8 fractional waypoints tracing where the ${v} runs`,
      ),
    );
  } else if (!wantsCourse && given[0] === "course") {
    out.push(
      error(
        "BAD_PLACEMENT",
        `${path}.params`,
        `verb "${v}" is a radial feature but is placed with "course"`,
        `replace "course" with "at": [fx, fz] or "zone": "<token>"`,
      ),
    );
  }

  if (params["at"] !== undefined) checkFractional(out, `${path}.params`, "at", params["at"]);
  if (params["zone"] !== undefined) checkZone(out, `${path}.params`, "zone", params["zone"]);
  if (params["course"] !== undefined) checkCourse(out, `${path}.params`, params["course"]);

  // Shape params that belong to a different verb are a common LLM slip.
  const allowedShape = VERB_SHAPE_KEYS[v];
  for (const key of ["width", "height", "radius", "depth", "rim", "caldera", "calderaDepth", "lava", "water"]) {
    if (params[key] !== undefined && !allowedShape.includes(key)) {
      out.push(
        error(
          "PARAM_OUT_OF_RANGE",
          `${path}.params`,
          `"${key}" is not a parameter of verb "${v}"`,
          `remove "${key}" — "${v}" accepts: ${allowedShape.join(", ")}`,
        ),
      );
    }
  }
}

function validateClimateNode(out: LoamDiagnostic[], path: string, node: Obj): void {
  unknownKeys(out, node, path, ["id", "kind", "generator", "envelope", "params", "tags", "seedSalt", "constraints", "ports"], "terrain.climate@0 node");
  const params = node["params"];
  if (params === undefined) return;
  if (!isObject(params)) {
    out.push(error("BAD_TYPE", path, `"params" must be an object, got ${describe(params)}`, 'use "params": {} to accept every terrain.climate@0 default'));
    return;
  }
  unknownKeys(out, params, `${path}.params`, ["temperatureFrequency", "humidityFrequency", "blendRadius", "latitudeGradient", "forceTheme"], "terrain.climate@0 params");
  checkNumbers(out, `${path}.params`, params, CLIMATE_NUMS);
  const theme = params["forceTheme"];
  if (theme !== undefined && !(CLIMATE_THEMES as readonly string[]).includes(theme as ClimateTheme)) {
    out.push(error("BAD_ENUM", `${path}.params`, `"forceTheme" must be a known climate theme, got ${describe(theme)}`, `set "forceTheme" to one of: ${CLIMATE_THEMES.join(", ")} — or omit it to let the noise decide`));
  }
}

function validateForestNode(out: LoamDiagnostic[], path: string, node: Obj): void {
  unknownKeys(out, node, path, ["id", "kind", "generator", "envelope", "params", "tags", "seedSalt", "constraints", "ports"], "scatter.forest@0 node");
  const params = requireParams(out, path, node, "scatter.forest@0");
  if (!params) return;
  unknownKeys(out, params, `${path}.params`, ["species", "area", "density", "spacing", "clumping", "maxSlope", "elevation", "edgeFalloff", "avoidTags", "snowLine"], "scatter.forest@0 params");
  checkNumbers(out, `${path}.params`, params, FOREST_NUMS);

  const species = params["species"];
  if (!Array.isArray(species) || species.length === 0) {
    out.push(
      error(
        "MISSING_KEY",
        `${path}.params`,
        `"species" must be a non-empty array, got ${describe(species)}`,
        'add at least one species, e.g. "species": [{ "id": "spruce", "weight": 1, "shape": "spruce_tall" }]',
      ),
    );
  } else {
    for (const [i, entry] of species.entries()) {
      const at = `${path}.params.species[${i}]`;
      if (!isObject(entry)) {
        out.push(error("BAD_TYPE", at, `each species must be an object, got ${describe(entry)}`, 'write { "id": "spruce", "weight": 1, "shape": "spruce_tall" }'));
        continue;
      }
      unknownKeys(out, entry, at, ["id", "weight", "shape", "minHeight", "maxHeight", "trunkPalette", "leafPalette"], "species entry");
      checkId(out, at, entry["id"], "species id");
      const shape = entry["shape"];
      if (typeof shape !== "string" || !(TREE_SHAPES as readonly string[]).includes(shape as TreeShape)) {
        out.push(error("BAD_ENUM", at, `"shape" must be a tree shape this profile implements, got ${describe(shape)}`, `set "shape" to one of: ${TREE_SHAPES.join(", ")}`));
      }
      checkNumbers(out, at, entry, { weight: { min: 0 }, minHeight: { min: 2, max: 64, int: true }, maxHeight: { min: 2, max: 64, int: true } });
      const lo = entry["minHeight"];
      const hi = entry["maxHeight"];
      if (typeof lo === "number" && typeof hi === "number" && lo > hi) {
        out.push(error("PARAM_OUT_OF_RANGE", at, `"minHeight" (${lo}) is greater than "maxHeight" (${hi})`, "swap them, or widen the range so minHeight ≤ maxHeight"));
      }
    }
  }

  const elevation = params["elevation"];
  if (elevation !== undefined) {
    if (!Array.isArray(elevation) || elevation.length !== 2 || typeof elevation[0] !== "number" || typeof elevation[1] !== "number") {
      out.push(error("BAD_TYPE", `${path}.params`, `"elevation" must be [min, max] numbers relative to sea level, got ${describe(elevation)}`, 'write "elevation": [1, 90] — heights above sea level where trees may grow'));
    } else if (elevation[0] > elevation[1]) {
      out.push(error("PARAM_OUT_OF_RANGE", `${path}.params`, `"elevation" min (${elevation[0]}) exceeds max (${elevation[1]})`, "swap the two numbers so the range reads [min, max]"));
    }
  }

  if (params["avoidTags"] !== undefined && (!Array.isArray(params["avoidTags"]) || params["avoidTags"].some((t) => typeof t !== "string"))) {
    out.push(error("BAD_TYPE", `${path}.params`, `"avoidTags" must be an array of strings, got ${describe(params["avoidTags"])}`, 'write "avoidTags": ["road", "building"], or omit it'));
  }

  const area = params["area"];
  if (area === undefined) return;
  if (!isObject(area)) {
    out.push(error("BAD_TYPE", `${path}.params.area`, `"area" must be an object, got ${describe(area)}`, 'use { "zone": "west" }, { "at": [0.5, 0.5], "radius": 120 } or { "all": true }'));
    return;
  }
  unknownKeys(out, area, `${path}.params.area`, ["zone", "at", "radius", "all"], "area");
  const forms = (["zone", "at", "all"] as const).filter((k) => area[k] !== undefined);
  if (forms.length !== 1) {
    out.push(
      error(
        "BAD_PLACEMENT",
        `${path}.params.area`,
        forms.length === 0 ? '"area" names no placement form' : `"area" mixes ${forms.join(" and ")}`,
        'pick exactly one form: { "zone": "<token>" }, { "at": [fx, fz], "radius": <blocks> } or { "all": true }',
      ),
    );
    return;
  }
  if (forms[0] === "zone") checkZone(out, `${path}.params.area`, "zone", area["zone"]);
  if (forms[0] === "all" && area["all"] !== true) {
    out.push(error("BAD_ENUM", `${path}.params.area`, `"all" must be literally true, got ${describe(area["all"])}`, 'write { "all": true } to cover the whole region, or use "zone"/"at" instead'));
  }
  if (forms[0] === "at") {
    checkFractional(out, `${path}.params.area`, "at", area["at"]);
    const radius = area["radius"];
    if (typeof radius !== "number" || !(radius > 0)) {
      out.push(error("MISSING_KEY", `${path}.params.area`, `"area.at" needs a positive "radius" in blocks, got ${describe(radius)}`, 'add "radius": 120 next to "at"'));
    }
  }
}

function validateHeightfieldParams(out: LoamDiagnostic[], path: string, params: Obj): void {
  unknownKeys(
    out,
    params,
    `${path}.params`,
    [
      "seaLevel", "baseHeight", "amplitude", "octaves", "frequency", "lacunarity", "gain",
      "ridged", "warp", "erosionPasses", "curve", "continentalness",
      "cliffThreshold", "soilDepth", "beachWidth", "snowLineFraction",
    ],
    "terrain.heightfield@0 params",
  );
  checkNumbers(out, `${path}.params`, params, HEIGHTFIELD_NUMS);
  checkBooleans(out, `${path}.params`, params, ["ridged"]);

  const warp = params["warp"];
  if (warp !== undefined) {
    if (!isObject(warp)) {
      out.push(error("BAD_TYPE", `${path}.params`, `"warp" must be an object, got ${describe(warp)}`, 'write "warp": { "amount": 24, "frequency": 0.004 }, or omit it'));
    } else {
      unknownKeys(out, warp, `${path}.params.warp`, ["amount", "frequency"], "warp");
      checkNumbers(out, `${path}.params.warp`, warp, { amount: { min: 0, max: 512 }, frequency: { min: 0, max: 1 } });
    }
  }

  const cont = params["continentalness"];
  if (cont !== undefined) {
    if (!isObject(cont)) {
      out.push(error("BAD_TYPE", `${path}.params`, `"continentalness" must be an object, got ${describe(cont)}`, 'write "continentalness": { "frequency": 0.0009, "seaFraction": 0.45 }, or omit it for an all-land world'));
    } else {
      unknownKeys(out, cont, `${path}.params.continentalness`, ["frequency", "seaFraction"], "continentalness");
      checkNumbers(out, `${path}.params.continentalness`, cont, { frequency: { min: 0, max: 1 }, seaFraction: { min: 0, max: 1 } });
      if (cont["frequency"] === undefined) {
        out.push(error("MISSING_KEY", `${path}.params.continentalness`, '"continentalness" needs a "frequency"', 'add "frequency": 0.0009 — smaller values make bigger landmasses'));
      }
      if (cont["seaFraction"] === undefined) {
        out.push(error("MISSING_KEY", `${path}.params.continentalness`, '"continentalness" needs a "seaFraction"', 'add "seaFraction": 0.45 — the fraction of the region that should end up below sea level'));
      }
    }
  }

  const curve = params["curve"];
  if (curve !== undefined) {
    if (!Array.isArray(curve)) {
      out.push(error("BAD_TYPE", `${path}.params`, `"curve" must be an array of [in, out] points, got ${describe(curve)}`, 'write "curve": [[0, 0], [0.5, 0.35], [1, 1]], or omit it for the identity remap'));
    } else {
      for (const [i, pt] of curve.entries()) {
        if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== "number" || typeof pt[1] !== "number") {
          out.push(error("BAD_TYPE", `${path}.params.curve`, `"curve"[${i}] must be [in, out] numbers, got ${describe(pt)}`, "write each control point as a two-number array such as [0.5, 0.35]"));
        } else if (pt[0] < 0 || pt[0] > 1 || pt[1] < 0 || pt[1] > 1) {
          out.push(error("PARAM_OUT_OF_RANGE", `${path}.params.curve`, `"curve"[${i}] = [${pt[0]}, ${pt[1]}] is outside [0,1]`, "keep both curve coordinates within 0..1 — the curve remaps normalized height"));
        }
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* shared checks                                                               */
/* -------------------------------------------------------------------------- */

function requireParams(out: LoamDiagnostic[], path: string, node: Obj, generator: string): Obj | undefined {
  const params = node["params"];
  if (params === undefined) {
    out.push(error("MISSING_KEY", path, `${generator} node needs a "params" object`, `add "params": { ... } to this ${generator} node (an empty object is fine when every default suits you)`));
    return undefined;
  }
  if (!isObject(params)) {
    out.push(error("BAD_TYPE", path, `"params" must be an object, got ${describe(params)}`, 'replace "params" with a JSON object of parameter name/value pairs'));
    return undefined;
  }
  return params;
}

function checkNoConstraints(out: LoamDiagnostic[], path: string, node: Obj): void {
  for (const key of ["constraints", "ports"] as const) {
    const value = node[key];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out.push(
      error(
        "CONSTRAINTS_NOT_ALLOWED",
        path,
        `"${key}" is present and non-empty; the terrain profile has no layout solver`,
        `delete "${key}" — express placement with the coarse params instead ("zone", "at", "course", "area")`,
      ),
    );
  }
}

function checkId(out: LoamDiagnostic[], parentPath: string, id: unknown, what: string): void {
  if (typeof id !== "string") {
    out.push(error("MISSING_KEY", parentPath, `${what} has no string "id", got ${describe(id)}`, 'give the node an "id" such as "the_divide" — ids name features and key their seeds'));
    return;
  }
  if (!ID_PATTERN.test(id)) {
    out.push(
      error(
        "BAD_ID",
        parentPath === "" ? id : `${parentPath}.${id}`,
        `id "${id}" is not a valid Loam id`,
        'rename it to match ^[a-z][a-z0-9_]{0,62}$ — start with a lowercase letter, then lowercase letters, digits or underscores (e.g. "north_fjord")',
      ),
    );
  }
}

function checkZone(out: LoamDiagnostic[], path: string, key: string, value: unknown): void {
  if (typeof value !== "string" || !(ZONE_TOKENS as readonly string[]).includes(value as ZoneToken)) {
    out.push(error("BAD_ENUM", path, `"${key}" must be a nine-grid zone token, got ${describe(value)}`, `set "${key}" to one of: ${ZONE_TOKENS.join(", ")}`));
  }
}

function checkFractional(out: LoamDiagnostic[], path: string, key: string, value: unknown): void {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" || typeof value[1] !== "number") {
    out.push(error("BAD_TYPE", path, `"${key}" must be [fx, fz], got ${describe(value)}`, `write "${key}": [0.5, 0.5] — fractional coordinates of the region, never absolute blocks`));
    return;
  }
  for (const [i, v] of value.entries()) {
    if (!(v >= 0 && v <= 1)) {
      out.push(
        error(
          "FRACTIONAL_OUT_OF_RANGE",
          path,
          `"${key}"[${i}] = ${v} is outside [0, 1]`,
          "coarse coordinates are fractions of the root region: 0 is the west/north edge, 1 the east/south edge. Divide any block coordinate by the region size",
        ),
      );
    }
  }
}

function checkCourse(out: LoamDiagnostic[], path: string, value: unknown): void {
  if (!Array.isArray(value)) {
    out.push(error("BAD_TYPE", path, `"course" must be an array of waypoints, got ${describe(value)}`, 'write "course": [[0.15, 0.5], [0.5, 0.42], [0.85, 0.55]]'));
    return;
  }
  if (value.length < 2 || value.length > 8) {
    out.push(
      error(
        "BAD_COURSE",
        path,
        `"course" has ${value.length} waypoints; 2–8 are required`,
        value.length < 2
          ? "add waypoints — a course needs at least a start and an end; the compiler smooths the curve between them"
          : "reduce the course to at most 8 waypoints; the compiler refines them into a smooth Catmull-Rom curve, so coarse intent is enough",
      ),
    );
  }
  for (const [i, pt] of value.entries()) {
    checkFractional(out, path, `course[${i}]`, pt);
  }
}

function checkNumbers(out: LoamDiagnostic[], path: string, obj: Obj, specs: Readonly<Record<string, NumSpec>>): void {
  for (const [key, spec] of Object.entries(specs)) {
    const value = obj[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      out.push(error("BAD_TYPE", path, `"${key}" must be a finite number, got ${describe(value)}`, `set "${key}" to a number${spec.min !== undefined ? ` in ${spec.min}..${spec.max ?? "∞"}` : ""}`));
      continue;
    }
    if (spec.int && !Number.isInteger(value)) {
      out.push(error("PARAM_OUT_OF_RANGE", path, `"${key}" must be a whole number, got ${value}`, `round "${key}" to an integer, e.g. ${Math.round(value)}`));
      continue;
    }
    if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max)) {
      out.push(
        error(
          "PARAM_OUT_OF_RANGE",
          path,
          `"${key}" = ${value} is outside the allowed range ${spec.min ?? "-∞"}..${spec.max ?? "∞"}`,
          `clamp "${key}" into ${spec.min ?? "-∞"}..${spec.max ?? "∞"}`,
        ),
      );
    }
  }
}

function checkBooleans(out: LoamDiagnostic[], path: string, obj: Obj, keys: readonly string[]): void {
  for (const key of keys) {
    const value = obj[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      out.push(error("BAD_TYPE", path, `"${key}" must be true or false, got ${describe(value)}`, `set "${key}": true or "${key}": false (JSON booleans, not strings)`));
    }
  }
}

function unknownKeys(
  out: LoamDiagnostic[],
  obj: Obj,
  path: string,
  allowed: readonly string[],
  what: string,
): void {
  const permitted = new Set<string>([...allowed, ...ALWAYS_ALLOWED]);
  for (const key of Object.keys(obj)) {
    if (permitted.has(key)) continue;
    out.push(
      error(
        "UNKNOWN_KEY",
        path,
        `unknown key "${key}" on ${what}`,
        `remove "${key}"; ${what} accepts only: ${[...allowed].join(", ")} (plus "label" and "note", which are always allowed)`,
      ),
    );
  }
}

function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === "object") return "an object";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

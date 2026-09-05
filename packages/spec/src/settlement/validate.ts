/**
 * Strict validator for settlement-profile documents.
 *
 * The rule that shapes this file: **a legal Loam v0.2 document must not be
 * rejected for asking for more than this compiler implements.** So the
 * constraint and port vocabularies are checked against the *whole* v0.2
 * registry, and the gap between "v0.2 knows this" and "the solver does this"
 * is reported as `LOAM-W407` / `LOAM-T206` warnings, never as errors. Only
 * something outside v0.2 altogether (`LOAM-E104`, `LOAM-E105`) is fatal.
 *
 * Everything the terrain profile validates is validated identically here — the
 * terrain node validators are imported, not re-implemented.
 */

import {
  checkBooleans,
  checkFractional,
  checkId,
  checkNumbers,
  checkZone,
  describe,
  isObject,
  unknownKeys,
  type NumSpec,
  type Obj,
} from "../checks.js";
import { validateIntentPlacement } from "../intent/validate.js";
import {
  validateAuthoredReference,
  validateLandmarkConstraints,
  validateLandmarkParams,
  validateProgramMap,
  validateProgramScatterParams,
} from "../programs/validate.js";
import type { ProgramMap } from "../programs/types.js";
import { collectPendingPrograms, type PendingPrograms } from "../programs/requests.js";
import { type LoamDiagnostic, error, hasErrors, warning } from "../terrain/diagnostics.js";
import { PROFILE_GENERATORS, ZONE_TOKENS, type ZoneToken } from "../terrain/types.js";
import {
  checkNoConstraints,
  validateClimateNode,
  validateForestNode,
  validateHeightfieldNode,
  validateMeta,
  validateRootEnvelope,
  validateStyle,
} from "../terrain/validate.js";
import {
  CONSTRAINT_FIELDS,
  COMMON_CONSTRAINT_FIELDS,
  CONNECTED_VIA_IMPLEMENTED,
  ON_TARGET_PRODUCTS as ON_TARGETS,
  bareProduct,
  canonicalize,
  isImplementedVia,
  resolveTypeKey,
  type ConstraintType,
} from "./constraints.js";
import { isKnownArchetype, nearestArchetypes } from "./archetypes.js";
import {
  INFRA_ENTRY_GENERATOR,
  INFRA_ENTRY_PARAM_KEYS,
  INFRA_ENTRY_ROUTES,
  INFRA_MARGIN_MAX,
  INFRA_MARGIN_MIN,
  INFRA_OFFSET_MAX,
  INFRA_OFFSET_MIN,
  INFRA_ROUTE_KEYS,
  INFRA_ROUTE_PARAM_KEYS,
  INFRA_ROUTE_SIDES,
  INFRA_RUN_MAX,
  INFRA_RUN_MIN,
  KNOWN_INFRA_ENTRIES,
  isKnownInfraEntry,
  nearestInfraEntries,
} from "./infra-entries.js";
import {
  CITY_MAX_DIAGONALS,
  CITY_SIZES,
  DISTRICT_CHARACTERS,
  COURTYARD_SHARE_MAX,
  COURTYARD_SHARE_MIN,
  DISTRICT_DENSITIES,
  DISTRICT_FABRICS,
  DISTRICT_GROUND_POLICIES,
  HORIZONTAL_FACES,
  PORT_TYPES,
  SET_PIECE_KINDS,
  SET_PIECE_MAX_COUNT,
  SET_PIECE_MIN_COUNT,
  STRUCTURE_GENERATORS,
  VISTA_ARTERIALS,
  WALL_MAX_HEIGHT,
  WALL_MIN_HEIGHT,
  WALL_STYLES,
  FARM_CROPS,
  FARM_EDGES,
  FARM_MIN_ENVELOPE,
  FARM_PARAM_RANGES,
  isFarmGenerator,
  isPrecinctGenerator,
  YAWS,
  type SettlementDocument,
} from "./types.js";

/** Result of validating a candidate settlement document. */
export interface SettlementValidation {
  readonly diagnostics: readonly LoamDiagnostic[];
  /** The validated document, present only when no `error` diagnostic was produced. */
  readonly document?: SettlementDocument;
}

/** Keys a structure node may carry. */
const STRUCTURE_KEYS = [
  "id",
  "kind",
  "generator",
  "params",
  "envelope",
  "constraints",
  "ports",
  "optional",
  "seedSalt",
  "tags",
  // Legal only on a district/city; on a structure node the intent walker
  // reports LOAM-W481 and ignores it, which is friendlier than a hard
  // UNKNOWN_KEY error for a dial that simply has no effect there.
  "intent",
] as const;

/** Envelope size limits, so a footprint stays inside a plausible region. */
const ENVELOPE_AXIS: NumSpec = { min: 1, max: 4096, int: true };

/**
 * Validate a parsed JSON value as a settlement-profile document.
 *
 * @param input any JSON value (typically `JSON.parse` output).
 */
export function validateSettlementDocument(input: unknown): SettlementValidation {
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

  unknownKeys(out, input, "", ["loam", "profile", "meta", "style", "intent", "programs", "root"], "document");

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
  if (input["profile"] !== "settlement") {
    out.push(
      error(
        "BAD_DOCUMENT",
        "",
        `"profile" must be the string "settlement", got ${describe(input["profile"])}`,
        'set "profile": "settlement" — or compile this document with the terrain-profile validator instead',
      ),
    );
  }

  validateMeta(out, input["meta"]);
  validateStyle(out, input["style"]);
  validateIntentPlacement(out, input);
  const programMap = validateProgramMap(input["programs"]);
  out.push(...programMap.diagnostics);
  validateRoot(out, input["root"], programMap.programs, collectPendingPrograms(input));

  if (hasErrors(out)) return { diagnostics: out };
  return { diagnostics: out, document: input as unknown as SettlementDocument };
}

/* -------------------------------------------------------------------------- */
/* root                                                                        */
/* -------------------------------------------------------------------------- */

function validateRoot(
  out: LoamDiagnostic[],
  root: unknown,
  programs: ProgramMap = {},
  pending: PendingPrograms = new Map(),
): void {
  if (root === undefined) {
    out.push(
      error(
        "MISSING_KEY",
        "",
        'the document has no "root" node',
        'add a "root" composite: { "id": "world", "kind": "composite", "envelope": { "shape": "region", "size": [512, 512] }, "children": [...] }',
      ),
    );
    return;
  }
  if (!isObject(root)) {
    out.push(error("BAD_TYPE", "", `"root" must be an object, got ${describe(root)}`, 'make "root" a composite node object'));
    return;
  }

  unknownKeys(out, root, "root", ["id", "kind", "envelope", "children", "tags", "seedSalt", "constraints", "ports", "intent"], "root node");

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
    out.push(
      error(
        "MISSING_KEY",
        path,
        `the root node needs a non-empty "children" array, got ${describe(children)}`,
        'add at least a terrain.heightfield@0 node and a terrain.climate@0 node to "root.children"',
      ),
    );
    return;
  }

  const seenIds = new Set<string>();
  /** Sibling id → what kind of node it is, for `connected` target resolution. */
  const siblings = new Map<string, string>();
  /** Every `connected` constraint seen, resolved against `siblings` afterwards. */
  const connections: ConnectedRef[] = [];
  let heightfields = 0;
  let climates = 0;
  let plazas = 0;

  for (const [index, raw] of children.entries()) {
    if (!isObject(raw)) {
      out.push(error("BAD_TYPE", `${path}.children[${index}]`, `each child must be an object, got ${describe(raw)}`, "replace this array entry with a generator or primitive node object"));
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
    if (typeof raw["id"] === "string" && typeof raw["kind"] === "string") {
      siblings.set(
        raw["id"],
        raw["kind"] === "primitive"
          ? "primitive"
          : raw["kind"] === "district"
            ? "district"
            : raw["kind"] === "city"
              ? "city"
              : typeof raw["generator"] === "string"
                ? raw["generator"]
                : "generator",
      );
    }

    if (raw["kind"] === "primitive") {
      plazas++;
      if (plazas > 1) {
        out.push(
          error(
            "PLAZA_CARDINALITY",
            childPath,
            "the settlement profile allows at most one plaza (kind: \"primitive\") node",
            'keep a single plaza and express the others as building.grammar@0 nodes, or widen the one plaza\'s envelope',
          ),
        );
      }
      validatePlazaNode(out, childPath, raw, connections);
      continue;
    }

    if (raw["kind"] === "district") {
      validateDistrictNode(out, childPath, raw, connections);
      continue;
    }

    if (raw["kind"] === "city") {
      validateCityNode(out, childPath, raw, connections);
      continue;
    }

    if (raw["kind"] !== "generator") {
      out.push(
        error(
          "STRUCTURE_NODE_SHAPE",
          childPath,
          `children of the root must have "kind": "generator", "kind": "primitive", "kind": "district" or "kind": "city", got ${describe(raw["kind"])}`,
          'set "kind": "generator" for a terrain or structure generator, "kind": "primitive" for the plaza, "kind": "district" for one street-fabric quarter, or "kind": "city" for a whole arterial-first city — the settlement profile has no other composites',
        ),
      );
      continue;
    }

    const generator = raw["generator"];
    // The bespoke tier: a landmark invokes its program by reference, a plugin
    // scatters one. Both were authored against the same document, so the map
    // is the source of truth for what may be named here.
    if (typeof generator === "string" && generator.startsWith("authored:")) {
      // A pending (requested-but-not-yet-authored) reference returns no record
      // and yet is legal, so "did this reference check out" is measured by
      // diagnostics, not by the record — otherwise a faithful first-pass
      // document would silently skip its constraint and port checks.
      const beforeRef = out.length;
      validateAuthoredReference(out, generator, programs, childPath, {
        envelopeDeclared: raw["envelope"] !== undefined,
        pending,
      });
      if (out.length === beforeRef || !out.slice(beforeRef).some((d) => d.severity === "error")) {
        checkTags(out, childPath, raw["tags"]);
        checkSeedSalt(out, childPath, raw["seedSalt"]);
        validateConstraints(out, childPath, raw["constraints"], raw["id"], connections);
        // …and the half a general constraint check cannot know: what a
        // *landmark* can be told by a constraint at all (`facing` cannot turn
        // one — `params.face` does).
        validateLandmarkConstraints(out, raw["constraints"], childPath, { solver: true });
        validatePorts(out, childPath, raw["ports"]);
        validateLandmarkParams(out, raw["params"], childPath);
      }
      continue;
    }
    if (generator === "scatter.program@0") {
      validateProgramScatterParams(out, raw["params"], programs, childPath, pending);
      continue;
    }
    if (typeof generator === "string" && (STRUCTURE_GENERATORS as readonly string[]).includes(generator)) {
      validateStructureNode(out, childPath, raw, connections);
      continue;
    }
    if (generator === PROP_GENERATOR) {
      validatePropNode(out, childPath, raw, connections);
      continue;
    }
 // The infrastructure host. Beside the
    // prop rather than inside `STRUCTURE_GENERATORS` for the same reason the
    // prop is: it takes no part in the layout solve, so `isPlaceableNode` must
    // keep saying no about it.
    if (generator === INFRA_ENTRY_GENERATOR) {
      validateInfraEntryNode(out, childPath, raw, connections);
      continue;
    }
    if (
      typeof generator !== "string" ||
      !(PROFILE_GENERATORS as readonly string[]).includes(generator)
    ) {
      out.push(
        error(
          "STRUCTURE_GENERATOR_NOT_IN_PROFILE",
          childPath,
          `generator ${describe(generator)} is not allowed by the settlement profile`,
          `use one of: ${[...PROFILE_GENERATORS, ...STRUCTURE_GENERATORS, PROP_GENERATOR, INFRA_ENTRY_GENERATOR].join(", ")}`,
        ),
      );
      continue;
    }

    // A terrain generator: identical rules to the terrain profile.
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

  resolveConnections(out, connections, siblings);

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

/* -------------------------------------------------------------------------- */
/* structure nodes                                                             */
/* -------------------------------------------------------------------------- */

function validateStructureNode(
  out: LoamDiagnostic[],
  path: string,
  node: Obj,
  connections: ConnectedRef[],
  /**
   * True when this node is a child of a `city`.
   *
   * The only thing that reads it is `params.vista` (C4), which is meaningless
   * anywhere else — a vista axis is the end of an arterial, and a district or a
   * root-level building has none. Threaded rather than inferred from the path
   * because a path is a string and an id may be spelt anything.
   */
  inCity = false,
): void {
  unknownKeys(out, node, path, STRUCTURE_KEYS, "structure node");
  checkBooleans(out, path, node, ["optional"]);
  checkTags(out, path, node["tags"]);
  checkSeedSalt(out, path, node["seedSalt"]);

  if (node["children"] !== undefined) {
    out.push(
      error(
        "STRUCTURE_NODE_SHAPE",
        path,
        "structure nodes have no children in the settlement profile",
        'remove "children" — building.grammar@0, road.network@0 and the precinct kits emit their own geometry; declare siblings under the root instead',
      ),
    );
  }

  const generator = node["generator"] as string;
  const params = node["params"];
  if (params !== undefined && !isObject(params)) {
    out.push(error("BAD_TYPE", path, `"params" must be an object, got ${describe(params)}`, 'use "params": {} to accept every generator default'));
  } else if (isObject(params)) {
    if (generator === "building.grammar@0") validateBuildingParams(out, `${path}.params`, params, inCity);
    else if (generator === "precinct.airport@0") validateAirportParams(out, `${path}.params`, params);
    else if (generator === "precinct.harbour@0") validateHarbourParams(out, `${path}.params`, params);
    else if (isFarmGenerator(generator)) validateFarmParams(out, `${path}.params`, params);
    else validateRoadParams(out, `${path}.params`, params);
  }

  // A holding's envelope is a *region* — see `FarmEnvelope` — so it is checked
  // by its own rule and never against the box vocabulary.
  if (isFarmGenerator(generator)) validateFarmEnvelope(out, path, node["envelope"]);
  else validateBoxEnvelope(out, path, node["envelope"]);
  if (generator === "building.grammar@0") {
    validateHighriseEnvelope(out, path, node, isObject(params) ? params : {});
  }
  if (isPrecinctGenerator(generator)) validatePrecinctEnvelope(out, path, node, generator);
  validateConstraints(out, path, node["constraints"], node["id"], connections);
  validatePorts(out, path, node["ports"]);
}

function validatePlazaNode(
  out: LoamDiagnostic[],
  path: string,
  node: Obj,
  connections: ConnectedRef[],
): void {
  unknownKeys(out, node, path, ["id", "kind", "envelope", "params", "constraints", "ports", "optional", "seedSalt", "tags", "intent"], "plaza node");
  checkBooleans(out, path, node, ["optional"]);
  checkTags(out, path, node["tags"]);
  checkSeedSalt(out, path, node["seedSalt"]);

  const envelope = node["envelope"];
  if (!isObject(envelope)) {
    out.push(
      error(
        "BAD_ENVELOPE",
        path,
        `the plaza needs a region envelope, got ${describe(envelope)}`,
        'add "envelope": { "shape": "region", "size": [24, 24] } — a plaza is a horizontal footprint, so its size has two elements',
      ),
    );
  } else {
    unknownKeys(out, envelope, `${path}.envelope`, ["shape", "size", "follows"], "plaza envelope");
    if (envelope["shape"] !== "region") {
      out.push(
        error(
          "BAD_ENVELOPE",
          `${path}.envelope`,
          `the plaza envelope "shape" must be "region", got ${describe(envelope["shape"])}`,
          'set "shape": "region" — a plaza is open ground, not a box',
        ),
      );
    }
    checkFootprintSize(out, `${path}.envelope`, envelope["size"], "region");
  }

  validateConstraints(out, path, node["constraints"], node["id"], connections);
  validatePorts(out, path, node["ports"]);
}

/* -------------------------------------------------------------------------- */
/* districts (fabric v2, F1)                                                   */
/* -------------------------------------------------------------------------- */

/** Keys a `district` node may carry. */
const DISTRICT_KEYS = [
  "id",
  "kind",
  "envelope",
  "params",
  "children",
  "constraints",
  "ports",
  "optional",
  "seedSalt",
  "tags",
  // Legal only on a district/city; on a structure node the intent walker
  // reports LOAM-W481 and ignores it, which is friendlier than a hard
  // UNKNOWN_KEY error for a dial that simply has no effect there.
  "intent",
] as const;

/** Keys a district's `params` may carry. */
const DISTRICT_PARAM_KEYS = [
  "fabric",
  "density",
  "mix",
  "blockSize",
  "focus",
  "plaza",
  "courtyards",
  "ground",
  "walls",
] as const;

/**
 * Block size a district may ask for, in blocks between street centre lines.
 *
 * The floor is two lot depths plus an avenue: below it there is no block left
 * to subdivide once the carriageway and its sidewalks are taken out, and the
 * skeleton degenerates into pavement. The ceiling is a superblock — past it
 * the "district" is a field with four roads round it, which the ordinary
 * solver already does better.
 */
export const DISTRICT_MIN_BLOCK = 16;
export const DISTRICT_MAX_BLOCK = 96;

/** Longest `mix` this profile reads; past it the cycle is not a mix, it is noise. */
export const DISTRICT_MAX_MIX = 24;

/**
 * Validate a `district` node.
 *
 * The shape is deliberately narrow. A district owns its interior completely —
 * the street skeleton decides where its buildings go — so the only things it
 * accepts are the fabric knobs, an envelope saying how much ground it covers,
 * constraints saying where that ground is, and landmark children.
 */
function validateDistrictNode(
  out: LoamDiagnostic[],
  path: string,
  node: Obj,
  connections: ConnectedRef[],
): void {
  unknownKeys(out, node, path, DISTRICT_KEYS, "district node");
  checkBooleans(out, path, node, ["optional"]);
  checkTags(out, path, node["tags"]);
  checkSeedSalt(out, path, node["seedSalt"]);

  // --- envelope ------------------------------------------------------------
  const envelope = node["envelope"];
  if (!isObject(envelope)) {
    out.push(
      error(
        "BAD_ENVELOPE",
        path,
        `a district needs a region envelope, got ${describe(envelope)}`,
        'add "envelope": { "shape": "region", "size": [140, 120] } — a district is a piece of ground, so its size has two elements',
      ),
    );
  } else {
    unknownKeys(out, envelope, `${path}.envelope`, ["shape", "size", "follows"], "district envelope");
    if (envelope["shape"] !== "region") {
      out.push(
        error(
          "BAD_ENVELOPE",
          `${path}.envelope`,
          `the district envelope "shape" must be "region", got ${describe(envelope["shape"])}`,
          'set "shape": "region" — a district is ground the fabric pass subdivides, not a box',
        ),
      );
    }
    checkFootprintSize(out, `${path}.envelope`, envelope["size"], "region");
  }

  // --- params --------------------------------------------------------------
  const params = node["params"];
  if (!isObject(params)) {
    out.push(
      error(
        "DISTRICT_PARAM",
        path,
        `a district needs "params", got ${describe(params)}`,
        'write "params": { "fabric": "grid", "density": "high", "mix": ["office", "apartment_block"] } — a district with no fabric and no mix has nothing to build',
      ),
    );
  } else {
    validateDistrictParams(out, `${path}.params`, params, districtChildIds(node["children"]));
  }

  // --- landmark children ---------------------------------------------------
  const children = node["children"];
  if (children !== undefined) {
    if (!Array.isArray(children)) {
      out.push(
        error(
          "STRUCTURE_NODE_SHAPE",
          path,
          `"children" must be an array of landmark buildings, got ${describe(children)}`,
          'write "children": [ { "id": "tower", "kind": "generator", "generator": "building.grammar@0", ... } ] — or drop the key entirely and let the mix fill every lot',
        ),
      );
    } else {
      const seen = new Set<string>();
      for (const [index, raw] of children.entries()) {
        const childPath = `${path}.${isObject(raw) && typeof raw["id"] === "string" ? raw["id"] : `children[${index}]`}`;
        if (!isObject(raw)) {
          out.push(
            error(
              "STRUCTURE_NODE_SHAPE",
              childPath,
              `each district child must be a building node object, got ${describe(raw)}`,
              "replace this array entry with a building.grammar@0 generator node",
            ),
          );
          continue;
        }
        checkId(out, path, raw["id"], `children[${index}]`);
        if (typeof raw["id"] === "string") {
          if (seen.has(raw["id"])) {
            out.push(
              error(
                "DUPLICATE_ID",
                childPath,
                `two landmarks of "${path}" share the id "${raw["id"]}"`,
                `rename one of them — sibling ids must be unique (e.g. "${raw["id"]}_2")`,
              ),
            );
          }
          seen.add(raw["id"]);
        }
        if (raw["kind"] !== "generator" || raw["generator"] !== "building.grammar@0") {
          out.push(
            error(
              "STRUCTURE_NODE_SHAPE",
              childPath,
              `a district's children are landmark buildings; this one is ${describe(raw["generator"] ?? raw["kind"])}`,
              'give every district child "kind": "generator" and "generator": "building.grammar@0" — roads, plazas and props belong under the root, not inside a district',
            ),
          );
          continue;
        }
        if (raw["constraints"] !== undefined) {
          out.push(
            error(
              "CONSTRAINTS_NOT_ALLOWED",
              childPath,
              "a district landmark is placed by frontage, not by the solver, so it takes no constraints",
              "delete the constraints — a landmark's position comes from the lot it claims; move the node out of the district if you need constraint-driven placement",
            ),
          );
        }
        validateStructureNode(out, childPath, raw, connections);
      }
    }
  }

  validateConstraints(out, path, node["constraints"], node["id"], connections);
  validatePorts(out, path, node["ports"]);
}

/** Validate a district's `params` object. */
function validateDistrictParams(
  out: LoamDiagnostic[],
  at: string,
  params: Obj,
  childIds: readonly string[] = [],
): void {
  unknownKeys(out, params, at, DISTRICT_PARAM_KEYS, "district params");
  validateDistrictFocus(out, at, params["focus"], childIds);

  for (const [key, allowed, example] of [
    ["fabric", DISTRICT_FABRICS, "grid"],
    ["density", DISTRICT_DENSITIES, "high"],
  ] as const) {
    const v = params[key];
    if (v === undefined) {
      out.push(
        error(
          "DISTRICT_PARAM",
          at,
          `"${key}" is required on a district`,
          `set "${key}": "${example}" — one of: ${allowed.join(", ")}`,
        ),
      );
    } else if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
      out.push(
        error(
          "DISTRICT_PARAM",
          at,
          `"${key}" must be one of ${allowed.join(", ")}, got ${describe(v)}`,
          `set "${key}": "${example}"`,
        ),
      );
    }
  }

  checkBooleans(out, at, params, ["plaza"]);
  checkNumbers(out, at, params, {
    blockSize: { min: DISTRICT_MIN_BLOCK, max: DISTRICT_MAX_BLOCK, int: true },
  });
  validateCourtyardShare(out, at, params["courtyards"]);
  validateGroundPolicy(out, at, params["ground"]);

  validateDistrictMix(out, at, params["mix"]);
  validateWallsParam(out, at, params["walls"]);
}

/**
 * Validate `params.courtyards` — the share of *eligible* blocks that close.
 *
 * A share, so 0..1, and out of range is an error naming the range rather than a
 * clamp: "0.7" and "70" are the same intention and only one of them is what the
 * author meant, so guessing costs a quarter.
 */
function validateCourtyardShare(
  out: LoamDiagnostic[],
  at: string,
  value: unknown,
  code: "DISTRICT_PARAM" | "CITY_PARAM" = "DISTRICT_PARAM",
): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    out.push(
      error(
        code,
        at,
        `"courtyards" must be a number in ${COURTYARD_SHARE_MIN}..${COURTYARD_SHARE_MAX}, got ${describe(value)}`,
        'write "courtyards": 0.7 — the share of the blocks that *can* hold a courtyard which actually close',
      ),
    );
    return;
  }
  if (value < COURTYARD_SHARE_MIN || value > COURTYARD_SHARE_MAX) {
    out.push(
      error(
        code,
        at,
        `"courtyards" = ${value} is outside ${COURTYARD_SHARE_MIN}..${COURTYARD_SHARE_MAX}`,
        `write a share, not a percentage — ${COURTYARD_SHARE_MAX} closes every eligible block, 0 closes none`,
      ),
    );
  }
}

/** Validate `params.ground` / `city.params.ground`. */
function validateGroundPolicy(
  out: LoamDiagnostic[],
  at: string,
  value: unknown,
  code: "DISTRICT_PARAM" | "CITY_PARAM" = "DISTRICT_PARAM",
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || !(DISTRICT_GROUND_POLICIES as readonly string[]).includes(value)) {
    out.push(
      error(
        code,
        at,
        `"ground" must be one of ${DISTRICT_GROUND_POLICIES.join(", ")}, got ${describe(value)}`,
        'write "ground": "stepped" for a quarter on a hill — levels with retaining walls and steps between them; omit it for one plane',
      ),
    );
  }
}

/**
 * Validate a district's `mix`.
 *
 * An unknown name is an **error**, not a warning, and that is the one place
 * this profile is stricter than its usual rule. Everywhere else a name the
 * compiler does not implement degrades to something visible — a constraint is
 * reported as ignored, a port type as unresolved. A misspelt archetype degrades
 * to *a hundred cottages*, silently, in a district the author asked to be an
 * office quarter. There is no recovery worth having, so it stops the compile
 * and the near-misses come with it.
 */
function validateDistrictMix(out: LoamDiagnostic[], at: string, mix: unknown): void {
  if (mix === undefined) {
    out.push(
      error(
        "DISTRICT_PARAM",
        at,
        '"mix" is required on a district — it is what the auto-infill builds',
        'write "mix": ["office", "apartment_block", "shop_row"] — archetype names, in the proportion you want them cycled',
      ),
    );
    return;
  }
  if (!Array.isArray(mix) || mix.length === 0) {
    out.push(
      error(
        "DISTRICT_PARAM",
        at,
        `"mix" must be a non-empty array of archetype names, got ${describe(mix)}`,
        'write "mix": ["townhouse", "shop_row"] — the infill cycles these across the lots the landmarks did not claim',
      ),
    );
    return;
  }
  if (mix.length > DISTRICT_MAX_MIX) {
    out.push(
      error(
        "DISTRICT_PARAM",
        at,
        `"mix" has ${mix.length} entries; this profile reads at most ${DISTRICT_MAX_MIX}`,
        `keep the ${DISTRICT_MAX_MIX} archetypes that carry the district's character — past that the block reads as noise rather than as a mix`,
      ),
    );
  }
  for (const [index, name] of mix.entries()) {
    if (typeof name !== "string") {
      out.push(
        error(
          "DISTRICT_PARAM",
          at,
          `"mix"[${index}] must be an archetype name, got ${describe(name)}`,
          'every entry is a string, e.g. "mix": ["office", "hotel"]',
        ),
      );
      continue;
    }
    if (isKnownArchetype(name)) continue;
    const near = nearestArchetypes(name);
    out.push(
      error(
        "DISTRICT_PARAM",
        at,
        `"mix"[${index}] names "${name}", which is not a building archetype`,
        near.length === 0
          ? `replace it with an archetype the grammar knows — the vocabulary is the same one "params.archetype" and the building tags draw on`
          : `did you mean ${near.map((n) => `"${n}"`).join(", ")}?`,
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* cities (fabric v3, C1)                                                      */
/* -------------------------------------------------------------------------- */

/** Keys a `city` node may carry. */
const CITY_KEYS = [
  "id",
  "kind",
  "envelope",
  "params",
  "children",
  "constraints",
  "ports",
  "optional",
  "seedSalt",
  "tags",
  // Legal only on a district/city; on a structure node the intent walker
  // reports LOAM-W481 and ignores it, which is friendlier than a hard
  // UNKNOWN_KEY error for a dial that simply has no effect there.
  "intent",
] as const;

/** Keys a city's `params` may carry. */
const CITY_PARAM_KEYS = [
  "size",
  "mix",
  "characters",
  "coastal",
  "diagonals",
  "ring",
  "blockSize",
  "forms",
  "courtyards",
  "ground",
  "setPieces",
  "walls",
] as const;

/**
 * Smallest city envelope, per axis, in blocks.
 *
 * A city is an *armature* plus the faces it leaves behind, and the smallest
 * armature worth drawing is a spine with one cell either side of it. A spine is
 * thirteen columns; a cell that can hold a fabric is another thirty-eight
 * (`MIN_DISTRICT_SPAN`) — twice, plus margins. Below this the author wants one
 * `district`, which is a node that already exists and does the job better.
 */
export const CITY_MIN_SPAN = 200;

/**
 * Validate a `city` node.
 *
 * The shape is narrower than a district's, deliberately: a district authors a
 * rectangle and its fabric; a city authors *ground and intent*. There is no key
 * here that names a quarter, a street or a coordinate, and there is no way to
 * add one — a plan the author enumerates is the rectangle problem again with
 * more typing.
 */
function validateCityNode(
  out: LoamDiagnostic[],
  path: string,
  node: Obj,
  connections: ConnectedRef[],
): void {
  unknownKeys(out, node, path, CITY_KEYS, "city node");
  checkBooleans(out, path, node, ["optional"]);
  checkTags(out, path, node["tags"]);
  checkSeedSalt(out, path, node["seedSalt"]);

  // --- envelope ------------------------------------------------------------
  const envelope = node["envelope"];
  if (!isObject(envelope)) {
    out.push(
      error(
        "BAD_ENVELOPE",
        path,
        `a city needs a region envelope, got ${describe(envelope)}`,
        `add "envelope": { "shape": "region", "size": [${CITY_MIN_SPAN + 60}, ${CITY_MIN_SPAN + 20}] } — a city is a piece of ground, so its size has two elements`,
      ),
    );
  } else {
    unknownKeys(out, envelope, `${path}.envelope`, ["shape", "size", "follows"], "city envelope");
    if (envelope["shape"] !== "region") {
      out.push(
        error(
          "BAD_ENVELOPE",
          `${path}.envelope`,
          `the city envelope "shape" must be "region", got ${describe(envelope["shape"])}`,
          'set "shape": "region" — a city is ground the plan layer cuts up, not a box',
        ),
      );
    }
    checkFootprintSize(out, `${path}.envelope`, envelope["size"], "region");
    const size = envelope["size"];
    if (Array.isArray(size) && size.length >= 2) {
      const [w, d] = size as unknown[];
      if (typeof w === "number" && typeof d === "number" && (w < CITY_MIN_SPAN || d < CITY_MIN_SPAN)) {
        out.push(
          error(
            "CITY_TOO_SMALL",
            `${path}.envelope`,
            `a city needs at least ${CITY_MIN_SPAN} blocks on each axis to hold an arterial and a district cell either side of it; this one is ${w} × ${d}`,
            `grow "envelope.size" to at least [${CITY_MIN_SPAN}, ${CITY_MIN_SPAN}] — or express this as a single "kind": "district" node, which is what one quarter of fabric is`,
          ),
        );
      }
    }
  }

  // --- params --------------------------------------------------------------
  const params = node["params"];
  if (!isObject(params)) {
    out.push(
      error(
        "CITY_PARAM",
        path,
        `a city needs "params", got ${describe(params)}`,
        'write "params": { "size": "medium", "mix": ["office", "apartment_block", "shop_row"] } — a city with no size and no mix has nothing to build',
      ),
    );
  } else {
    validateCityParams(out, `${path}.params`, params);
  }

  // --- landmark and precinct children --------------------------------------
  const children = node["children"];
  if (children !== undefined) {
    if (!Array.isArray(children)) {
      out.push(
        error(
          "STRUCTURE_NODE_SHAPE",
          path,
          `"children" must be an array of landmarks and precincts, got ${describe(children)}`,
          'write "children": [ { "id": "tower", "kind": "generator", "generator": "building.grammar@0", ... } ] — or drop the key entirely and let the plan infill every cell',
        ),
      );
    } else {
      const seen = new Set<string>();
      for (const [index, raw] of children.entries()) {
        const childPath = `${path}.${isObject(raw) && typeof raw["id"] === "string" ? raw["id"] : `children[${index}]`}`;
        if (!isObject(raw)) {
          out.push(
            error(
              "STRUCTURE_NODE_SHAPE",
              childPath,
              `each city child must be a building or precinct node object, got ${describe(raw)}`,
              "replace this array entry with a building.grammar@0 or precinct.*@0 generator node",
            ),
          );
          continue;
        }
        checkId(out, path, raw["id"], `children[${index}]`);
        if (typeof raw["id"] === "string") {
          if (seen.has(raw["id"])) {
            out.push(
              error(
                "DUPLICATE_ID",
                childPath,
                `two children of "${path}" share the id "${raw["id"]}"`,
                `rename one of them — sibling ids must be unique (e.g. "${raw["id"]}_2")`,
              ),
            );
          }
          seen.add(raw["id"]);
        }
        const generator = raw["generator"];
        const allowed =
          raw["kind"] === "generator" &&
          typeof generator === "string" &&
          (generator === "building.grammar@0" || isPrecinctGenerator(generator));
        if (!allowed) {
          out.push(
            error(
              "STRUCTURE_NODE_SHAPE",
              childPath,
              `a city's children are landmark buildings and precinct kits; this one is ${describe(raw["generator"] ?? raw["kind"])}`,
              'give every city child "kind": "generator" and either "generator": "building.grammar@0" or one of the precinct.*@0 kits — roads, plazas, props and nested districts belong under the root, not inside a city',
            ),
          );
          continue;
        }
        validateStructureNode(out, childPath, raw, connections, true);
      }
    }
  }

  validateConstraints(out, path, node["constraints"], node["id"], connections);
  validatePorts(out, path, node["ports"]);
}

/** The ids of a district's landmark children, for `params.focus` to name. */
function districtChildIds(children: unknown): readonly string[] {
  if (!Array.isArray(children)) return [];
  const out: string[] = [];
  for (const raw of children) {
    if (isObject(raw) && typeof raw["id"] === "string") out.push(raw["id"]);
  }
  return out;
}

/**
 * Validate `params.focus` — what the plan is about.
 *
 * `"plaza"`, or the id of one of this district's own children. An id naming
 * nothing is an error rather than a degrade, for the `mix` reason: the
 * alternative is invisible in the finished world, because the quarter still
 * gets a hub — just not around the thing the author meant.
 */
function validateDistrictFocus(
  out: LoamDiagnostic[],
  at: string,
  value: unknown,
  childIds: readonly string[],
): void {
  if (value === undefined) return;
  const legal = ["plaza", ...childIds];
  if (typeof value !== "string" || !legal.includes(value)) {
    out.push(
      error(
        "DISTRICT_PARAM",
        at,
        `"focus" must be "plaza" or the id of one of this district's children, got ${describe(value)}`,
        childIds.length === 0
          ? 'write "focus": "plaza" — or add the building you meant to this district\'s "children" first'
          : `write "focus": "plaza", or one of: ${childIds.join(", ")}`,
      ),
    );
  }
}

/**
 * Validate `params.forms` — the per-character urban form table.
 *
 * Exactly parallel to `params.characters`: an unknown character key or an
 * unknown form id is a `CITY_PARAM` error naming the legal values, because a
 * quarter silently drawn as the compiler's default is not something an author
 * can see in the finished world.
 */
function validateCityForms(out: LoamDiagnostic[], at: string, forms: unknown): void {
  if (forms === undefined) return;
  const path = `${at}.forms`;
  if (!isObject(forms)) {
    out.push(
      error(
        "CITY_PARAM",
        at,
        `"forms" must be an object keyed by district character, got ${describe(forms)}`,
        `write "forms": { "lanes": "grown" } — the keys are: ${DISTRICT_CHARACTERS.join(", ")}`,
      ),
    );
    return;
  }
  unknownKeys(out, forms, path, DISTRICT_CHARACTERS, "city forms");
  for (const key of DISTRICT_CHARACTERS) {
    const value = forms[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !(DISTRICT_FABRICS as readonly string[]).includes(value)) {
      out.push(
        error(
          "CITY_PARAM",
          path,
          `"${key}" must be one of ${DISTRICT_FABRICS.join(", ")}, got ${describe(value)}`,
          `write "forms": { "${key}": "grid" }`,
        ),
      );
    }
  }
}

/** Validate a city's `params` object. */
function validateCityParams(out: LoamDiagnostic[], at: string, params: Obj): void {
  unknownKeys(out, params, at, CITY_PARAM_KEYS, "city params");

  const size = params["size"];
  if (size === undefined) {
    out.push(
      error(
        "CITY_PARAM",
        at,
        '"size" is required on a city — it is what decides how much armature gets drawn',
        `set "size": "medium" — one of: ${CITY_SIZES.join(", ")}`,
      ),
    );
  } else if (typeof size !== "string" || !(CITY_SIZES as readonly string[]).includes(size)) {
    out.push(
      error(
        "CITY_PARAM",
        at,
        `"size" must be one of ${CITY_SIZES.join(", ")}, got ${describe(size)}`,
        'set "size": "medium"',
      ),
    );
  }

  checkBooleans(out, at, params, ["coastal", "ring"]);
  checkNumbers(out, at, params, {
    diagonals: { min: 0, max: CITY_MAX_DIAGONALS, int: true },
    blockSize: { min: DISTRICT_MIN_BLOCK, max: DISTRICT_MAX_BLOCK, int: true },
  });

  validateCourtyardShare(out, at, params["courtyards"], "CITY_PARAM");
  validateGroundPolicy(out, at, params["ground"], "CITY_PARAM");
  validateCityMix(out, at, "mix", params["mix"], true);
  validateCityCharacters(out, at, params["characters"]);
  validateCityForms(out, at, params["forms"]);
  validateSetPiecesParam(out, at, params["setPieces"]);
  validateWallsParam(out, at, params["walls"]);
}

/**
 * Validate `params.walls` (`infra.wall@0`).
 *
 * One spelling, and no `false`: a wall is opted *into*, so its absence is the
 * off switch and a second way to spell "no" would be a second thing to get
 * wrong. `{}` is the whole answer for "yes, the usual one", which is what an
 * author reaches for most.
 */
function validateWallsParam(out: LoamDiagnostic[], at: string, value: unknown): void {
  if (value === undefined) return;
  const path = `${at}.walls`;
  if (!isObject(value)) {
    out.push(
      error(
        "WALL_PARAM",
        path,
        `"walls" must be an object, got ${describe(value)}`,
        `write "walls": {} for the usual curtain wall, or "walls": { "style": "masonry", "height": 6 } — the styles are: ${WALL_STYLES.join(", ")}. Omit "walls" entirely for no wall`,
      ),
    );
    return;
  }
  unknownKeys(
    out,
    value,
    path,
    ["style", "margin", "towerPitch", "height", "gates", "materials", "enclose"],
    "walls",
  );
  validateWallMaterials(out, path, value["materials"]);
  const enclose = value["enclose"];
  if (enclose !== undefined && (!Array.isArray(enclose) || enclose.some((id) => typeof id !== "string" || id.length === 0))) {
    out.push(
      error(
        "WALL_PARAM",
        path,
        `"enclose" must be an array of node ids, got ${describe(enclose)}`,
        'list the ids of authored program nodes to ring inside the wall, e.g. "enclose": ["castle_keep"]',
      ),
    );
  }
  const style = value["style"];
  if (style !== undefined && (typeof style !== "string" || !(WALL_STYLES as readonly string[]).includes(style))) {
    out.push(
      error(
        "WALL_PARAM",
        path,
        `"style" must be one of ${WALL_STYLES.join(", ")}, got ${describe(style)}`,
        'set "style": "masonry" — a stone curtain with a crenellated cap, which is the default',
      ),
    );
  }
  checkBooleans(out, path, value, ["gates"]);
  checkNumbers(out, path, value, {
    margin: { min: 4, max: 64, int: true },
    towerPitch: { min: 16, max: 128, int: true },
    height: { min: WALL_MIN_HEIGHT, max: WALL_MAX_HEIGHT, int: true },
  });
}

/**
 * Validate `walls.materials` — the per-role override.
 *
 * Five optional roles, each a block name. The **default** is not a table here
 * but the settlement's own material theme, so an author who writes nothing gets
 * a wall in the town's stone; this key is for the wall that is deliberately not
 * that. Block names are checked for shape only — whether the pinned registry
 * knows one is the emit's answer, and the same one it gives `style.palettes`.
 */
function validateWallMaterials(out: LoamDiagnostic[], at: string, value: unknown): void {
  if (value === undefined) return;
  const path = `${at}.materials`;
  if (!isObject(value)) {
    out.push(
      error(
        "WALL_PARAM",
        path,
        `"materials" must be an object of role → block, got ${describe(value)}`,
        'write "materials": { "core": "sandstone", "merlon": "chiseled_sandstone" } — or omit it entirely, which is the usual answer: the wall is then built from the settlement\'s own material theme',
      ),
    );
    return;
  }
  unknownKeys(out, value, path, ["core", "walk", "parapet", "merlon", "tower"], "walls.materials");
  for (const role of ["core", "walk", "parapet", "merlon", "tower"]) {
    const block = value[role];
    if (block === undefined) continue;
    if (typeof block !== "string" || block.trim().length === 0) {
      out.push(
        error(
          "WALL_PARAM",
          `${path}.${role}`,
          `"${role}" must be a block name, got ${describe(block)}`,
          'a full cube, named as the palette names one: "sandstone", "minecraft:mud_bricks". A slab or a fence in a curtain is a hole a mob walks through',
        ),
      );
    }
  }
}

/**
 * Validate `params.setPieces` (C4).
 *
 * Two spellings on purpose. `false` is the whole answer for "not on this city",
 * and it is the one an author reaches for most; the object form exists for the
 * two knobs that are genuinely worth turning — how many anchors, and which
 * kinds. Neither spelling names a coordinate, a quarter or a street, which is
 * the constraint the `city` node was designed under: an enumerated plan is the
 * rectangle problem again with more typing.
 */
function validateSetPiecesParam(out: LoamDiagnostic[], at: string, value: unknown): void {
  if (value === undefined || typeof value === "boolean") return;
  const path = `${at}.setPieces`;
  if (!isObject(value)) {
    out.push(
      error(
        "CITY_SET_PIECES",
        path,
        `"setPieces" must be a boolean or an object, got ${describe(value)}`,
        `write "setPieces": false to turn the anchors off, or "setPieces": { "max": 4, "kinds": ["landmark", "bridge"] } — the kinds are: ${SET_PIECE_KINDS.join(", ")}`,
      ),
    );
    return;
  }
  unknownKeys(out, value, path, ["max", "kinds"], "city setPieces");
  const max = value["max"];
  if (max !== undefined) {
    if (
      typeof max !== "number" ||
      !Number.isInteger(max) ||
      max < SET_PIECE_MIN_COUNT ||
      max > SET_PIECE_MAX_COUNT
    ) {
      out.push(
        error(
          "CITY_SET_PIECES",
          path,
          `"setPieces.max" must be an integer between ${SET_PIECE_MIN_COUNT} and ${SET_PIECE_MAX_COUNT}, got ${describe(max)}`,
          `write "setPieces": { "max": 4 } — past ${SET_PIECE_MAX_COUNT} anchors a city stops having anchors and starts having furniture`,
        ),
      );
    }
  }
  const kinds = value["kinds"];
  if (kinds === undefined) return;
  if (!Array.isArray(kinds) || kinds.length === 0) {
    out.push(
      error(
        "CITY_SET_PIECES",
        path,
        `"setPieces.kinds" must be a non-empty array of kind names, got ${describe(kinds)}`,
        `write "setPieces": { "kinds": ["landmark", "square"] } — or drop the key to consider all of: ${SET_PIECE_KINDS.join(", ")}`,
      ),
    );
    return;
  }
  const seen = new Set<string>();
  for (const [index, raw] of kinds.entries()) {
    if (typeof raw !== "string" || !(SET_PIECE_KINDS as readonly string[]).includes(raw)) {
      out.push(
        error(
          "CITY_SET_PIECES",
          `${path}.kinds[${index}]`,
          `"${describe(raw)}" is not a set-piece kind`,
          `use one of: ${SET_PIECE_KINDS.join(", ")}`,
        ),
      );
      continue;
    }
    if (seen.has(raw)) {
      out.push(
        error(
          "CITY_SET_PIECES",
          `${path}.kinds[${index}]`,
          `"${raw}" is listed twice in "setPieces.kinds"`,
          `delete the duplicate — the list is a filter, not a weighting, so repeating a kind asks for nothing extra`,
        ),
      );
    }
    seen.add(raw);
  }
}

/**
 * Validate the per-character mix table.
 *
 * A key outside the eight characters is an **error** for the same reason a
 * misspelt archetype is: `"industral": [...]` is not a mix the plan will
 * quietly ignore in one quarter, it is a whole port district silently built out
 * of the default mix, and nothing in the finished world says so.
 */
function validateCityCharacters(out: LoamDiagnostic[], at: string, characters: unknown): void {
  if (characters === undefined) return;
  if (!isObject(characters)) {
    out.push(
      error(
        "CITY_PARAM",
        at,
        `"characters" must be an object keyed by district character, got ${describe(characters)}`,
        `write "characters": { "industrial": ["warehouse", "factory"] } — the keys are: ${DISTRICT_CHARACTERS.join(", ")}`,
      ),
    );
    return;
  }
  unknownKeys(out, characters, `${at}.characters`, DISTRICT_CHARACTERS, "city characters");
  for (const key of DISTRICT_CHARACTERS) {
    const value = characters[key];
    if (value === undefined) continue;
    validateCityMix(out, `${at}.characters`, key, value, false);
  }
}

/**
 * Validate one archetype list on a city — the default `mix`, or one character's
 * override. The rules are the district's, restated against the city's keys so
 * the `fix` names a field the author can actually find.
 */
function validateCityMix(
  out: LoamDiagnostic[],
  at: string,
  key: string,
  mix: unknown,
  required: boolean,
): void {
  if (mix === undefined) {
    if (!required) return;
    out.push(
      error(
        "CITY_PARAM",
        at,
        '"mix" is required on a city — it is what every cell the author did not name builds from',
        'write "mix": ["office", "apartment_block", "shop_row"] — archetype names, in the proportion you want them cycled',
      ),
    );
    return;
  }
  if (!Array.isArray(mix) || mix.length === 0) {
    out.push(
      error(
        "CITY_PARAM",
        at,
        `"${key}" must be a non-empty array of archetype names, got ${describe(mix)}`,
        `write "${key}": ["townhouse", "shop_row"] — the infill cycles these across the cell's lots`,
      ),
    );
    return;
  }
  if (mix.length > DISTRICT_MAX_MIX) {
    out.push(
      error(
        "CITY_PARAM",
        at,
        `"${key}" has ${mix.length} entries; this profile reads at most ${DISTRICT_MAX_MIX}`,
        `keep the ${DISTRICT_MAX_MIX} archetypes that carry the quarter's character — past that the block reads as noise rather than as a mix`,
      ),
    );
  }
  for (const [index, name] of mix.entries()) {
    if (typeof name !== "string") {
      out.push(
        error(
          "CITY_PARAM",
          at,
          `"${key}"[${index}] must be an archetype name, got ${describe(name)}`,
          `every entry is a string, e.g. "${key}": ["office", "hotel"]`,
        ),
      );
      continue;
    }
    if (isKnownArchetype(name)) continue;
    const near = nearestArchetypes(name);
    out.push(
      error(
        "CITY_PARAM",
        at,
        `"${key}"[${index}] names "${name}", which is not a building archetype`,
        near.length === 0
          ? `replace it with an archetype the grammar knows — the vocabulary is the same one "params.archetype" and the building tags draw on`
          : `did you mean ${near.map((n) => `"${n}"`).join(", ")}?`,
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* envelopes (§3.3 subset)                                                     */
/* -------------------------------------------------------------------------- */

function validateBoxEnvelope(out: LoamDiagnostic[], path: string, envelope: unknown): void {
  if (envelope === undefined) return;
  const at = `${path}.envelope`;
  if (!isObject(envelope)) {
    // v0.2 §3.3: not yet — the terse `"envelope": [x, y, z]` array sugar is not
    // desugared here, because the validated document is handed to the compiler
    // unrewritten and nothing downstream would see the canonical form.
    out.push(
      error(
        "BAD_ENVELOPE",
        at,
        `"envelope" must be an object, got ${describe(envelope)}`,
        'write "envelope": { "shape": "box", "size": [12, 8, 10] } — the terse array form is not accepted by this profile yet',
      ),
    );
    return;
  }
  unknownKeys(out, envelope, at, ["shape", "size"], "structure envelope");

  if (envelope["shape"] !== undefined && envelope["shape"] !== "box") {
    out.push(
      error(
        "BAD_ENVELOPE",
        at,
        `structure envelopes must have "shape": "box", got ${describe(envelope["shape"])}`,
        'set "shape": "box" — cylinder, dome, prism and path envelopes are Loam v0.2 shapes this profile does not place yet',
      ),
    );
  }

  checkFootprintSize(out, at, envelope["size"], "box");
  for (const key of ["minSize", "maxSize"] as const) {
    if (envelope[key] !== undefined) checkFootprintSize(out, at, envelope[key], "box", key);
  }
  checkBooleans(out, at, envelope, ["flexible"]);
  checkNumbers(out, at, envelope, { padding: { min: 0, max: 64, int: true } });

  const size = envelope["size"];
  const flexible = envelope["flexible"] === true;
  if (!flexible && (envelope["minSize"] !== undefined || envelope["maxSize"] !== undefined)) {
    out.push(
      warning(
        "BAD_ENVELOPE",
        at,
        '"minSize"/"maxSize" are set but "flexible" is false, so the solver may not resize this node',
        'add "flexible": true to let the solver shrink or grow this envelope, or drop "minSize"/"maxSize"',
      ),
    );
  }
  if (Array.isArray(size) && size.length === 3) {
    for (const key of ["minSize", "maxSize"] as const) {
      const other = envelope[key];
      if (!Array.isArray(other) || other.length !== 3) continue;
      for (let axis = 0; axis < 3; axis++) {
        const s = size[axis] as number;
        const o = other[axis] as number;
        const bad = key === "minSize" ? o > s : o < s;
        if (typeof s === "number" && typeof o === "number" && bad) {
          out.push(
            error(
              "BAD_ENVELOPE",
              at,
              `"${key}"[${axis}] = ${o} is on the wrong side of "size"[${axis}] = ${s}`,
              `keep minSize ≤ size ≤ maxSize on every axis — "size" is the request, the other two bound how far the solver may move it`,
            ),
          );
        }
      }
    }
  }

  const rotations = envelope["rotations"];
  if (rotations !== undefined) {
    if (!Array.isArray(rotations) || rotations.length === 0) {
      out.push(
        error(
          "BAD_ENVELOPE",
          at,
          `"rotations" must be a non-empty array of yaw values, got ${describe(rotations)}`,
          'write "rotations": [0, 90, 180, 270] to allow every yaw, or "rotations": [0] to pin the orientation',
        ),
      );
    } else {
      for (const [i, yaw] of rotations.entries()) {
        if (!(YAWS as readonly number[]).includes(yaw as number)) {
          out.push(
            error(
              "BAD_ENVELOPE",
              at,
              `"rotations"[${i}] = ${describe(yaw)} is not a quantized yaw`,
              "use only 0, 90, 180 or 270 — Loam transforms are voxel-preserving, so arbitrary rotation does not exist",
            ),
          );
        }
      }
    }
  }
}

/** Check a `size`-like array, applying the §3.3 arity rules for its shape. */
function checkFootprintSize(
  out: LoamDiagnostic[],
  at: string,
  size: unknown,
  shape: "box" | "region",
  key = "size",
): void {
  const wanted = shape === "box" ? 3 : 2;
  if (!Array.isArray(size)) {
    out.push(
      error(
        key === "size" ? "BAD_ENVELOPE" : "BAD_ENVELOPE",
        at,
        `"${key}" must be an array of ${wanted} integers, got ${describe(size)}`,
        shape === "box"
          ? `write "${key}": [x, y, z] in blocks`
          : `write "${key}": [x, z] in blocks — a region's vertical extent comes from "follows"/"yMin"/"yMax", not from "size"`,
      ),
    );
    return;
  }
  if (shape === "region" && size.length === 3) {
    out.push(
      warning(
        "ENVELOPE_SIZE_COERCED",
        at,
        `a region "${key}" was given 3 elements; the middle one was dropped`,
        'write "size": [x, z] — a region\'s Y comes from "follows": "terrain" (or "yMin"/"yMax"), never from "size"',
      ),
    );
  } else if (size.length !== wanted) {
    out.push(
      error(
        shape === "box" ? "ENVELOPE_SIZE_ARITY" : "BAD_ENVELOPE",
        at,
        `"${key}" has ${size.length} elements; a ${shape} needs ${wanted}`,
        shape === "box"
          ? `write "${key}": [x, y, z] — the missing axis is the vertical one, in blocks`
          : `write "${key}": [x, z] — a horizontal footprint in blocks`,
      ),
    );
    return;
  }
  const axisNames = shape === "box" ? ["x", "y", "z"] : ["x", "z"];
  for (let i = 0; i < Math.min(size.length, 3); i++) {
    const v = size[i];
    const spec = ENVELOPE_AXIS;
    if (typeof v !== "number" || !Number.isInteger(v) || v < (spec.min as number) || v > (spec.max as number)) {
      out.push(
        error(
          "BAD_ENVELOPE",
          at,
          `"${key}" ${axisNames[Math.min(i, axisNames.length - 1)]} must be an integer in ${spec.min}..${spec.max}, got ${describe(v)}`,
          `use whole blocks, e.g. "${key}": ${shape === "box" ? "[12, 8, 10]" : "[24, 24]"}`,
        ),
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* constraints (§4 subset)                                                     */
/* -------------------------------------------------------------------------- */

function validateConstraints(
  out: LoamDiagnostic[],
  path: string,
  constraints: unknown,
  selfId: unknown,
  connections: ConnectedRef[],
): void {
  if (constraints === undefined) return;
  if (!Array.isArray(constraints)) {
    out.push(
      error(
        "BAD_CONSTRAINT",
        path,
        `"constraints" must be an array, got ${describe(constraints)}`,
        'write "constraints": [ { "zone": "center" }, { "distance": "town_hall", "min": 8 } ]',
      ),
    );
    return;
  }
  for (const [i, raw] of constraints.entries()) {
    const at = `${path}.constraints[${i}]`;
    if (!isObject(raw)) {
      out.push(
        error(
          "BAD_CONSTRAINT",
          at,
          `each constraint must be an object, got ${describe(raw)}`,
          'write a shorthand constraint such as { "zone": "north" } or a canonical one such as { "type": "distance", "target": "well", "min": 6 }',
        ),
      );
      continue;
    }
    const resolved = resolveTypeKey(raw);
    if (!resolved.ok) {
      if (resolved.reason === "none") {
        // One unrecognized key reads as a misspelled (or invented) shorthand
        // type, which is what §1.5 means by LOAM-E104: anything that could
        // change geometry fails loud rather than being silently dropped.
        const candidates = Object.keys(raw).filter(
          (k) => !(COMMON_CONSTRAINT_FIELDS as readonly string[]).includes(k),
        );
        if (candidates.length === 1) {
          out.push(
            error(
              "UNKNOWN_CONSTRAINT_TYPE",
              at,
              `"${candidates[0] as string}" is not a Loam v0.2 constraint type`,
              'use a type from the v0.2 registry (zone, at, within, adjacent_to, distance, facing, clearance, terrain_conform, not_overlapping, …); ordering constraints such as "after" do not exist — execution order follows each generator\'s stage',
            ),
          );
        } else {
          out.push(
            error(
              "BAD_CONSTRAINT",
              at,
              `this constraint names no type (keys: ${resolved.detail || "none"})`,
              'give it a type key: { "zone": "center" }, or the canonical { "type": "zone", "zone": "center" }',
            ),
          );
        }
      } else if (resolved.reason === "ambiguous") {
        out.push(
          error(
            "AMBIGUOUS_SHORTHAND",
            at,
            `two independent constraint types (${resolved.detail}) share one object`,
            "split them into two entries of the \"constraints\" array — shorthand carries exactly one type key",
          ),
        );
      } else {
        out.push(
          error(
            "UNKNOWN_CONSTRAINT_TYPE",
            at,
            `"${resolved.detail}" is not a Loam v0.2 constraint type`,
            'use a type from the v0.2 registry (zone, at, within, adjacent_to, distance, facing, clearance, terrain_conform, not_overlapping, …); ordering constraints such as "after" do not exist — execution order follows each generator\'s stage',
          ),
        );
      }
      continue;
    }

    for (const shadow of resolved.shadowed) {
      out.push(
        warning(
          "SHADOWED_TYPE_KEY",
          at,
          `"${shadow}" is a constraint type name but reads here as a field of "${resolved.type}"`,
          `rename or split this constraint if you meant a "${shadow}" constraint — registry order resolved it as "${resolved.type}"`,
        ),
      );
    }

    const c = canonicalize(raw, resolved.type, resolved.shorthand);
    const allowed = [...COMMON_CONSTRAINT_FIELDS, ...CONSTRAINT_FIELDS[resolved.type]];
    unknownKeys(out, c as Obj, at, allowed, `a "${resolved.type}" constraint`);
    checkCommonFields(out, at, c as Obj);

    if (resolved.type === "connected") {
      validateConnected(out, at, c as Obj, selfId, connections);
      continue;
    }
    if (resolved.type === "along" || resolved.type === "beside") {
      // Both bind to a route corridor registered at substage 3b.
      validateAlong(out, at, resolved.type, c as Obj);
      continue;
    }

    validateTier1(out, at, resolved.type, c as Obj);
  }
}

/* -------------------------------------------------------------------------- */
/* `connected` (§4, tier 2)                                                    */
/* -------------------------------------------------------------------------- */

/** One `connected` constraint, held back for the sibling-resolution pass. */
interface ConnectedRef {
  readonly at: string;
  readonly selfId: string | undefined;
  readonly to: string;
  readonly via: string;
}

/**
 * Check one `connected` constraint's own fields, and record it for
 * {@link resolveConnections}.
 *
 * Only `via: "tunnel"` is realized. Anything else parses, is scored as the same
 * soft proximity term, and says so — a `via: "road"` between two houses is
 * already what a `road.network@0` node does, and quietly building a second,
 * constraint-driven lane on top of the network's would be worse than the
 * warning.
 */
function validateConnected(
  out: LoamDiagnostic[],
  at: string,
  c: Obj,
  selfId: unknown,
  connections: ConnectedRef[],
): void {
  const to = c["to"];
  if (typeof to !== "string" || to.trim() === "") {
    out.push(
      error(
        "BAD_CONSTRAINT",
        at,
        `"connected" needs a "to" selector naming the other end, got ${describe(to)}`,
        'write { "connected": "town_hall", "via": "tunnel" } — the primary argument of a "connected" constraint is the node it reaches',
      ),
    );
    return;
  }

  const via = c["via"];
  if (via !== undefined && typeof via !== "string") {
    out.push(
      error(
        "BAD_CONSTRAINT",
        at,
        `"via" must name a connector kind, got ${describe(via)}`,
        'write "via": "tunnel" — the only kind this compiler builds; road, path, bridge, rail, stair and canal parse but are not realized',
      ),
    );
    return;
  }
  // §4 `connected`: `via` defaults from the port types. This profile has no
  // port-pair inference yet, so an unstated `via` reads as the kind it builds.
  const kind = typeof via === "string" ? via : "tunnel";

  // `style` is read for a tunnel and carried for everything else. A gallery is
  // dug `dressed`, `mine` or `crypt`; anything else names a hand nobody has.
  const styleValue = c["style"];
  if (styleValue !== undefined && typeof styleValue !== "string") {
    out.push(error("BAD_CONSTRAINT", at, `"style" must be a string, got ${describe(styleValue)}`, 'write "style": "mine" for a rough working, "crypt" for a burial passage, or omit it for the dressed gallery'));
  } else if (
    typeof styleValue === "string" &&
    kind === "tunnel" &&
    !(TUNNEL_STYLE_VALUES as readonly string[]).includes(styleValue)
  ) {
    out.push(
      error(
        "BAD_CONSTRAINT",
        at,
        `"style" must name a tunnel style — one of ${TUNNEL_STYLE_VALUES.join(", ")} — got ${describe(styleValue)}`,
        'write "style": "mine" for a rough working with rails and ore, "crypt" for a burial passage with niches, or omit it for the dressed stone-brick gallery',
      ),
    );
  }
  const prefer = c["prefer"];
  if (prefer !== undefined && typeof prefer !== "string") {
    out.push(error("BAD_CONSTRAINT", at, `"prefer" must be a string, got ${describe(prefer)}`, 'omit "prefer" — it is carried but not read yet'));
  }
  // `oreChamber` widens a mine gallery into a working face near its far end.
  if (c["oreChamber"] !== undefined && typeof c["oreChamber"] !== "boolean") {
    out.push(error("BAD_CONSTRAINT", at, `"oreChamber" must be a boolean, got ${describe(c["oreChamber"])}`, 'write "oreChamber": true beside "style": "mine" to widen the far end into an ore chamber'));
  } else if (c["oreChamber"] === true && styleValue !== "mine") {
    out.push(
      error(
        "BAD_CONSTRAINT",
        at,
        '"oreChamber" is only dug on a mine gallery; this constraint asks for one on a ' +
          `${typeof styleValue === "string" ? `"${styleValue}"` : "dressed"} tunnel`,
        'add "style": "mine" to the same constraint, or drop "oreChamber"',
      ),
    );
  }
  checkNumbers(out, at, c, {
    width: { min: 1, max: 16, int: true },
    height: { min: 2, max: 16, int: true },
    maxGrade: { min: 0, max: 4 },
    maxLength: { min: 1, max: 4096, int: true },
  });
  checkBooleans(out, at, c, ["bidirectional"]);
  for (const key of ["from"] as const) {
    const v = c[key];
    if (v !== undefined && typeof v !== "string") {
      out.push(error("BAD_CONSTRAINT", at, `"${key}" must be a port ref, got ${describe(v)}`, `write "${key}": "self#tunnel_stub", or omit it and let the compiler pick the cellar wall facing the other end`));
    }
  }

  if (!isImplementedVia(kind)) {
    out.push(
      error(
        "BAD_CONSTRAINT",
        at,
        `"connected" via "${kind}" is not a connector this compiler builds; "via" must be one of: ${CONNECTED_VIA_IMPLEMENTED.join(", ")}`,
        kind === "road" || kind === "path"
          ? 'add both nodes to a road.network@0 node\'s "anchors" — that is what routes lanes between doors'
          : 'use "via": "tunnel" for an underground connection',
      ),
    );
    return;
  }

  connections.push({
    at,
    selfId: typeof selfId === "string" ? selfId : undefined,
    to: to.trim(),
    via: kind,
  });
}

/**
 * Resolve every recorded `connected` target against the root's children.
 *
 * §4 makes both endpoints existing and compatible a **hard precondition**, not
 * a cost, so all three failures here are errors: a target nobody declared, a
 * node connected to itself, and a target that is not something a tunnel can end
 * inside. Each carries the fix, because "unknown target" without the list of
 * ids that *are* there is the least useful diagnostic a compiler can emit.
 */
function resolveConnections(
  out: LoamDiagnostic[],
  connections: readonly ConnectedRef[],
  siblings: ReadonlyMap<string, string>,
): void {
  if (connections.length === 0) return;
  const buildings = [...siblings.entries()]
    .filter(([, kind]) => kind === "building.grammar@0")
    .map(([id]) => id);

  for (const ref of connections) {
    // §4.2 selectors: only a bare sibling id (or `^.id`) resolves here; a tag
    // set or a port ref names its node through the same leaf.
    const bare = ref.to.startsWith("^.") ? ref.to.slice(2) : ref.to;
    const leaf = (bare.split("#")[0] as string).split(".").pop() as string;

    if (ref.to.startsWith("#tag:")) {
      out.push(
        error(
          "BAD_CONSTRAINT",
          ref.at,
          `"connected" was given the tag set "${ref.to}"; a tunnel has exactly two ends, so its target must name one node`,
          `name a single building, e.g. "connected": "${buildings[0] ?? "town_hall"}" — one constraint per tunnel`,
        ),
      );
      continue;
    }

    if (leaf === ref.selfId) {
      out.push(
        error(
          "BAD_CONSTRAINT",
          ref.at,
          `"${leaf}" is connected to itself`,
          `point "connected" at the other end of the tunnel${buildings.length > 1 ? `, e.g. "${(buildings.find((id) => id !== leaf) as string)}"` : " — this document declares only one building, so there is nothing to connect it to"}`,
        ),
      );
      continue;
    }

    const kind = siblings.get(leaf);
    if (kind === undefined) {
      out.push(
        error(
          "BAD_CONSTRAINT",
          ref.at,
          `"connected" names "${ref.to}", which is not a child of the root`,
          buildings.length === 0
            ? "declare the building this tunnel reaches as a building.grammar@0 child of the root first"
            : `use one of the ids that exist: ${buildings.join(", ")}`,
        ),
      );
      continue;
    }

    if (kind !== "building.grammar@0") {
      out.push(
        error(
          "BAD_CONSTRAINT",
          ref.at,
          `"connected" names "${leaf}", which is a ${kind === "primitive" ? "plaza" : kind} — a tunnel has to end inside something with a cellar`,
          buildings.length === 0
            ? "point it at a building.grammar@0 node; only buildings get the cellar a tunnel opens into"
            : `point it at a building instead: ${buildings.join(", ")}`,
        ),
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* `along` / `beside` (§4.4, tier 2)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Check an `along` (or its `beside` sugar) against §4.4.
 *
 * The one thing worth saying loudly is what the target has to *be*: `along`
 * only means anything against something linear that exists at substage 3b — a
 * `road.network@0` node, or a `terrain.edit@0` running a course verb. Pointing
 * it at a house is the mistake an author actually makes, and the solver's
 * silence about it (no corridor, no cost, no placement change) is exactly the
 * kind of quiet nothing this validator exists to prevent.
 */
function validateAlong(out: LoamDiagnostic[], at: string, type: string, c: Obj): void {
  checkSelector(out, at, c["target"], "target", true);
  const offset = c["offset"];
  if (offset !== undefined && typeof offset !== "number") {
    if (
      !Array.isArray(offset) ||
      offset.length !== 2 ||
      typeof offset[0] !== "number" ||
      typeof offset[1] !== "number"
    ) {
      out.push(
        error(
          "BAD_CONSTRAINT",
          at,
          `"offset" must be a number of blocks or [min, max], got ${describe(offset)}`,
          'write "offset": [3, 6] — how far the footprint sits from the corridor\'s edge',
        ),
      );
    } else if ((offset[0] as number) > (offset[1] as number)) {
      out.push(
        error(
          "BAD_CONSTRAINT",
          at,
          `"offset" min (${offset[0]}) exceeds max (${offset[1]})`,
          "swap them so the band reads [near, far]",
        ),
      );
    }
  }
  checkEnum(out, at, c, "side", ["left", "right", "any"], "which side of the line, in its direction of travel");
  checkBooleans(out, at, c, ["faceRoad"]);
  checkNumbers(out, at, c, { spacing: { min: 0, max: 512, int: true } });
  const position = c["at"];
  if (position !== undefined) {
    const pair = Array.isArray(position) ? position : [position, position];
    const bad =
      pair.length !== 2 ||
      typeof pair[0] !== "number" ||
      typeof pair[1] !== "number" ||
      !((pair[0] as number) >= 0 && (pair[0] as number) <= 1) ||
      !((pair[1] as number) >= 0 && (pair[1] as number) <= 1);
    if (bad) {
      out.push(
        error(
          "BAD_CONSTRAINT",
          at,
          `"at" on an "${type}" constraint is a normalized position along the line, got ${describe(position)}`,
          'write "at": 0.5 for the middle of the run, or "at": [0.2, 0.4] for a stretch of it',
        ),
      );
    }
  }
  // `along` `spacing` is not enforced — the solver's implicit `not_overlapping`
  // plus `clearance` keeps siblings apart, and a second, corridor-relative
  // spacing rule would fight it — so it is refused rather than carried.
  if (c["spacing"] !== undefined) {
    out.push(
      error(
        "BAD_CONSTRAINT",
        at,
        `"spacing" on an "${type}" constraint is not enforced; sibling separation comes from "clearance" and the implicit "not_overlapping"`,
        'set "clearance" on this node instead — it is the keep-clear margin the solver actually applies',
      ),
    );
  }
}

function checkCommonFields(out: LoamDiagnostic[], at: string, c: Obj): void {
  const strength = c["strength"];
  if (strength !== undefined && strength !== "hard" && strength !== "soft") {
    out.push(
      error(
        "BAD_CONSTRAINT",
        at,
        `"strength" must be "hard" or "soft", got ${describe(strength)}`,
        'use "strength": "soft" for something you want but can live without — it is the single most useful habit for avoiding unsatisfiable specs',
      ),
    );
  }
  const weight = c["weight"];
  if (weight !== undefined && (typeof weight !== "number" || !(weight > 0))) {
    out.push(error("BAD_CONSTRAINT", at, `"weight" must be a number greater than zero, got ${describe(weight)}`, 'set "weight": 2.0 to make this soft constraint twice as important as a default one'));
  }
  const tolerance = c["tolerance"];
  if (tolerance !== undefined && (typeof tolerance !== "number" || !(tolerance >= 0))) {
    out.push(error("BAD_CONSTRAINT", at, `"tolerance" must be a non-negative number, got ${describe(tolerance)}`, 'set "tolerance" to the slack you accept before the constraint counts as violated'));
  }
}

function validateTier1(out: LoamDiagnostic[], at: string, type: ConstraintType, c: Obj): void {
  switch (type) {
    case "zone": {
      const zone = c["zone"];
      if (typeof zone !== "string" || !(ZONE_TOKENS as readonly string[]).includes(zone as ZoneToken)) {
        out.push(
          error(
            "UNKNOWN_ZONE",
            at,
            `"zone" must be one of the nine-grid tokens, got ${describe(zone)}`,
            `set "zone" to one of: ${ZONE_TOKENS.join(", ")} — those nine are the complete vocabulary`,
          ),
        );
      }
      checkEnum(out, at, c, "mode", ["center", "contain"], '"center" pulls the node toward the cell (soft); "contain" keeps its footprint inside the cell (hard)');
      checkNumbers(out, at, c, { jitter: { min: 0, max: 1 }, inset: { min: 0, max: 512, int: true }, partial: { min: 0, max: 1 } });
      checkSelector(out, at, c["of"], "of");
      break;
    }
    case "at": {
      const value = c["at"];
      checkFractionalCoarse(out, at, "at", value);
      checkEnum(out, at, c, "mode", ["center", "contain"], '"center" is a soft pull toward the point; "contain" restricts the footprint to the tolerance disc');
      checkNumbers(out, at, c, { radius: { min: 1, max: 4096, int: true } });
      checkSelector(out, at, c["of"], "of");
      break;
    }
    case "adjacent_to": {
      checkSelector(out, at, c["target"], "target", true);
      const gap = c["gap"];
      if (gap !== undefined && typeof gap !== "number") {
        if (!Array.isArray(gap) || gap.length !== 2 || typeof gap[0] !== "number" || typeof gap[1] !== "number") {
          out.push(error("BAD_CONSTRAINT", at, `"gap" must be a number or [min, max], got ${describe(gap)}`, 'write "gap": [0, 1] — the allowed nearest-face distance in blocks'));
        }
      }
      checkEnum(out, at, c, "face", ["north", "south", "east", "west", "up", "down", "any"], "which face of this node touches the target");
      checkEnum(out, at, c, "share", ["edge", "face"], 'use "face" for a shared wall, "edge" to allow a corner touch');
      if (c["overlap"] !== undefined && c["overlap"] !== "full" && typeof c["overlap"] !== "number") {
        out.push(error("BAD_CONSTRAINT", at, `"overlap" must be a number of blocks or "full", got ${describe(c["overlap"])}`, 'write "overlap": 2 — the minimum shared face length'));
      }
      break;
    }
    case "distance": {
      checkSelector(out, at, c["target"], "target", true);
      checkNumbers(out, at, c, { min: { min: 0 }, max: { min: 0 } });
      const min = c["min"];
      const max = c["max"];
      if (typeof min === "number" && typeof max === "number" && min > max) {
        out.push(error("BAD_CONSTRAINT", at, `"min" (${min}) exceeds "max" (${max})`, "swap them so the range reads min ≤ max"));
      }
      checkEnum(out, at, c, "measure", ["center", "surface", "port"], '"surface" measures between the nearest faces, "center" between centres');
      checkEnum(out, at, c, "axis", ["3d", "horizontal", "vertical"], '"horizontal" is what "don\'t crowd" almost always means');
      checkEnum(out, at, c, "aggregate", ["all", "any", "nearest"], "how a tag-set target is reduced to one number");
      break;
    }
    case "facing": {
      checkSelector(out, at, c["target"], "target", true);
      checkBooleans(out, at, c, ["strict"]);
      if (c["frontPort"] !== undefined && typeof c["frontPort"] !== "string") {
        out.push(error("BAD_CONSTRAINT", at, `"frontPort" must be a port name, got ${describe(c["frontPort"])}`, 'name a port declared on this node, e.g. "frontPort": "main_door"'));
      }
      break;
    }
    case "not_overlapping": {
      checkSelector(out, at, c["target"], "target", true);
      checkNumbers(out, at, c, { margin: { min: 0, max: 512, int: true } });
      checkBooleans(out, at, c, ["overlapAllowed"]);
      break;
    }
    case "clearance": {
      const amount = c["amount"];
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
        out.push(error("BAD_CONSTRAINT", at, `"clearance" needs a whole number of blocks, got ${describe(amount)}`, 'write { "clearance": 3 } — blocks of empty space kept around this node'));
      }
      checkEnum(out, at, c, "direction", ["up", "down", "north", "south", "east", "west", "front", "horizontal", "all"], "which side must stay clear");
      checkEnum(out, at, c, "against", ["solid", "any_node", "terrain"], "what counts as an obstruction");
      if (c["of"] !== undefined && typeof c["of"] !== "string") {
        out.push(error("BAD_CONSTRAINT", at, `"of" must be "self" or a port ref on self, got ${describe(c["of"])}`, 'write "of": "self#main_door" to keep the space in front of a door clear'));
      }
      break;
    }
    case "terrain_conform": {
      checkEnum(
        out,
        at,
        c,
        "mode",
        ["flatten", "cut_fill", "terrace"],
        'the solver levels the ground under a footprint for "flatten"/"cut_fill"/"terrace"',
      );
      checkEnum(out, at, c, "reference", ["min", "max", "mean", "median"], "which statistic of the footprint's ground heights becomes the foundation elevation");
      checkNumbers(out, at, c, { blend: { min: 0, max: 64, int: true }, maxSlope: { min: 0, max: 90 }, step: { min: 1, max: 32, int: true } });
      checkBooleans(out, at, c, ["skirt"]);
      break;
    }
    case "on": {
      const target = c["target"];
      checkSelector(out, at, target, "target", true);
      if (typeof target === "string" && !(ON_TARGETS as readonly string[]).includes(bareProduct(target))) {
        out.push(
          error(
            "BAD_CONSTRAINT",
            at,
            `"on" was given "${target}"; this compiler resolves only the terrain products ${ON_TARGETS.map((t) => `"@terrain:${t}"`).join(", ")}`,
            `write "on": "@terrain:coastline" (or ${ON_TARGETS.slice(1)
              .map((t) => `"@terrain:${t}"`)
              .join(", ")}) — a feature-marker target such as "volcano#rim" is valid v0.2 but not resolved here yet`,
          ),
        );
      }
      checkNumbers(out, at, c, { band: { min: 1, max: 512, int: true }, partial: { min: 0, max: 1 } });
      checkEnum(out, at, c, "side", ["left", "right", "any"], "for a polyline product, which side of it in its direction of travel");
      break;
    }
    /* c8 ignore next 2 — every tier-1 type is handled above. */
    default:
      break;
  }
}

function checkFractionalCoarse(out: LoamDiagnostic[], at: string, key: string, value: unknown): void {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" || typeof value[1] !== "number") {
    out.push(
      error(
        "BAD_CONSTRAINT",
        at,
        `"${key}" must be [fx, fz] or a terrain anchor string, got ${describe(value)}`,
        `write "${key}": [0.5, 0.5] — fractions of the frame, never absolute blocks`,
      ),
    );
    return;
  }
  for (const [i, v] of value.entries()) {
    if (!(v >= 0 && v <= 1)) {
      out.push(
        error(
          "COARSE_COORD_RANGE",
          at,
          `"${key}"[${i}] = ${v} is outside [0, 1]`,
          "coarse coordinates are fractions of the frame: 0 is the west/north edge, 1 the east/south edge",
        ),
      );
    }
  }
}

function checkSelector(out: LoamDiagnostic[], at: string, value: unknown, key: string, required = false): void {
  if (value === undefined) {
    if (required) {
      out.push(
        error(
          "BAD_CONSTRAINT",
          at,
          `this constraint needs a "${key}" selector`,
          `name the other node, e.g. "${key}": "town_hall" or "${key}": "^.main_street"`,
        ),
      );
    }
    return;
  }
  if (typeof value !== "string" || value.trim() === "") {
    out.push(error("BAD_CONSTRAINT", at, `"${key}" must be a selector string, got ${describe(value)}`, `write "${key}": "well" (a sibling id), "#tag:house" (a tag set) or "root"`));
  }
}

function checkEnum(out: LoamDiagnostic[], at: string, obj: Obj, key: string, allowed: readonly string[], hint: string): void {
  const value = obj[key];
  if (value === undefined) return;
  if (typeof value !== "string" || !allowed.includes(value)) {
    out.push(error("BAD_CONSTRAINT", at, `"${key}" must be one of ${allowed.join(", ")}, got ${describe(value)}`, `${hint}; pick one of: ${allowed.join(", ")}`));
  }
}

/* -------------------------------------------------------------------------- */
/* ports (§5 subset)                                                           */
/* -------------------------------------------------------------------------- */

function validatePorts(out: LoamDiagnostic[], path: string, ports: unknown): void {
  if (ports === undefined) return;
  if (!isObject(ports)) {
    out.push(
      error(
        "BAD_PORT",
        path,
        `"ports" must be an object mapping port names to declarations, got ${describe(ports)}`,
        'write "ports": { "main_door": { "type": "door", "face": "south" } }',
      ),
    );
    return;
  }
  for (const [name, raw] of Object.entries(ports)) {
    const at = `${path}.ports.${name}`;
    checkId(out, `${path}.ports`, name, `port name "${name}"`);
    if (!isObject(raw)) {
      out.push(error("BAD_PORT", at, `port "${name}" must be an object, got ${describe(raw)}`, 'write { "type": "door", "face": "south" } — everything else defaults sensibly'));
      continue;
    }
    unknownKeys(out, raw, at, ["type", "face"], `port "${name}"`);

    const type = raw["type"];
    if (typeof type !== "string" || !(PORT_TYPES as readonly string[]).includes(type)) {
      out.push(
        error(
          "UNKNOWN_PORT_TYPE",
          at,
          `port "${name}" has type ${describe(type)}, which is not a port type`,
          `set "type" to one of: ${PORT_TYPES.join(", ")} — a dropped port silently disconnects a world, so this is an error, not a warning`,
        ),
      );
    }

    const face = raw["face"];
    if (face !== undefined) {
      if (typeof face !== "string" || !(HORIZONTAL_FACES as readonly string[]).includes(face)) {
        out.push(
          error(
            "BAD_PORT",
            at,
            `port "${name}" has face ${describe(face)}`,
            `set "face" to one of: ${HORIZONTAL_FACES.join(", ")} — faces are node-local and rotate with the solved yaw`,
          ),
        );
      }
    }

    const atField = raw["at"];
    if (atField !== undefined && atField !== "center") {
      if (!Array.isArray(atField) || atField.length !== 2 || typeof atField[0] !== "number" || typeof atField[1] !== "number") {
        out.push(error("BAD_PORT", at, `port "${name}" has "at" = ${describe(atField)}`, 'write "at": "center" or "at": [u, v] with both in 0..1 along and up the face'));
      } else {
        for (const [i, v] of atField.entries()) {
          if (!(v >= 0 && v <= 1)) {
            out.push(error("BAD_PORT", at, `port "${name}" has "at"[${i}] = ${v} outside [0, 1]`, '"at" is normalized on the face: [0, 0] is its bottom-left corner, [1, 1] its top-right'));
          }
        }
      }
    }

    checkNumbers(out, at, raw, { width: { min: 1, max: 64, int: true }, height: { min: 1, max: 64, int: true } });
    checkTags(out, at, raw["tags"]);
  }
}

/* -------------------------------------------------------------------------- */
/* generator params (structural only — G4b implements the generators)          */
/* -------------------------------------------------------------------------- */

const BUILDING_NUMS: Readonly<Record<string, NumSpec>> = {
  floors: { min: 1, max: 24, int: true },
  floorHeight: { min: 2, max: 32, int: true },
  bays: { min: 1, max: 32, int: true },
  roofPitch: { min: 0, max: 4 },
  windowRatio: { min: 0, max: 1 },
  furnish: { min: 0, max: 1 },
  variance: { min: 0, max: 1 },
  decayOverride: { min: 0, max: 1 },
};


function validateBuildingParams(
  out: LoamDiagnostic[],
  at: string,
  params: Obj,
  inCity = false,
): void {
  unknownKeys(
    out,
    params,
    at,
    ["archetype", "floors", "floorHeight", "roof", "windowRhythm", "wallSymbol", "trimSymbol", "roofSymbol", "wing", "basement", "decay", "entrance", "vista"],
    "building.grammar@0 params",
  );
  validateVistaParam(out, at, params["vista"], inCity);
  checkNumbers(out, at, params, BUILDING_NUMS);
  validateArchetypeParam(out, at, params["archetype"]);
  validateDecayParam(out, at, params["decay"]);
  validateBasementParam(out, at, params["basement"]);
  validateWingParam(out, at, params["wing"]);
  for (const key of ["roof", "windowRhythm", "wallSymbol", "trimSymbol", "roofSymbol"]) {
    const v = params[key];
    if (v !== undefined && typeof v !== "string") {
      out.push(error("STRUCTURE_PARAM", at, `"${key}" must be a string, got ${describe(v)}`, `set "${key}" to a name from the style vocabulary, or omit it to inherit from "style"`));
    }
  }
  const entrance = params["entrance"];
  if (entrance !== undefined && !isObject(entrance)) {
    out.push(error("STRUCTURE_PARAM", at, `"entrance" must be an object, got ${describe(entrance)}`, 'write "entrance": { "treatment": "blast_door" }'));
  }
  validateEntranceTreatment(out, at, params["entrance"]);
}

/**
 * The entrance fittings — the catalog's **family D**
 *
 * A fitting *in* another structure is never a node: a blast door is what the
 * way in is made of, and the way in is a column the port solver placed. So the
 * one authoring surface is `"entrance": { "treatment": "blast_door" }` on the
 * building that owns the door, and the vocabulary is closed for the reason
 * every closed vocabulary in this compiler is closed — a near miss should be a
 * sentence, not a silently unfitted door.
 */
const ENTRANCE_TREATMENTS = ["blast_door", "airlock_vestibule"] as const;

function validateEntranceTreatment(out: LoamDiagnostic[], at: string, value: unknown): void {
  if (!isObject(value)) return;
  const treatment = (value as Obj)["treatment"];
  if (treatment === undefined) return;
  if (typeof treatment === "string" && (ENTRANCE_TREATMENTS as readonly string[]).includes(treatment)) {
    return;
  }
  out.push(
    error(
      "STRUCTURE_PARAM",
      at,
      `"entrance.treatment" = ${describe(treatment)} is not a fitting this grammar builds`,
      `use one of: ${ENTRANCE_TREATMENTS.join(", ")} — a blast door suits a bunker_complex, underground_silo, bunker or pillbox; an airlock vestibule a hydroponics_bay, laboratory, field_station or bunker_complex`,
    ),
  );
}

/**
 * Validate `params.decay` (RUINS-PLAN-v0 §4.3) — "ruin this one building".
 *
 * A `0..1` scalar and nothing else. It is how an author ruins **one named
 * thing** — a broken watchtower on a ridge — without a district: the ordinary
 * shell is built and furnished, and the decay engine writes over it. A district
 * says the same thing at scale with `intent.decline`, and a landmark declared as
 * a child is never ruined by that roll, which is why this key exists.
 */
function validateDecayParam(out: LoamDiagnostic[], at: string, value: unknown): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    out.push(
      error(
        "DECAY_PARAM",
        at,
        `"decay" must be a number in 0..1, got ${describe(value)}`,
        'write "decay": 0.8 for a building that has fallen in — or set "decline" on the district to ruin a share of a whole quarter',
      ),
    );
  }
}

/**
 * Validate `params.vista` (C4) — "put this at the end of the main boulevard".
 *
 * The one authoring surface for the terminating landmark, and it is deliberately
 * *relational*: `true` says "seat this on whichever axis the plan rates
 * highest", and a string names the **kind** of arterial to close. Neither names
 * a coordinate, which is the rule the whole `city` node is written under.
 *
 * An author-pinned landmark always wins the axis it asks for. The plan chooses
 * a building only for an axis nobody claimed.
 */
function validateVistaParam(
  out: LoamDiagnostic[],
  at: string,
  value: unknown,
  inCity: boolean,
): void {
  if (value === undefined) return;
  if (typeof value !== "boolean" && typeof value !== "string") {
    out.push(
      error(
        "VISTA_PIN",
        at,
        `"vista" must be true, false, or the kind of arterial to close, got ${describe(value)}`,
        `write "vista": true to take whichever axis the plan rates highest, or name one of: ${VISTA_ARTERIALS.join(", ")}`,
      ),
    );
    return;
  }
  if (typeof value === "string" && !(VISTA_ARTERIALS as readonly string[]).includes(value)) {
    out.push(
      error(
        "VISTA_PIN",
        at,
        value === "ring"
          ? '"vista": "ring" names a closed loop, which has no end to stand at and look down'
          : `"vista" names "${value}", which is not an arterial kind a vista can close`,
        `use one of: ${VISTA_ARTERIALS.join(", ")} — or "vista": true to take whichever axis the plan rates highest`,
      ),
    );
    return;
  }
  // `false` is the default; writing it anywhere is inert and harmless.
  if (value === false) return;
  if (inCity) return;
  out.push(
    error(
      "VISTA_PIN",
      at,
      '"vista" only means something on a landmark inside a "kind": "city" node — a vista axis is the end of an arterial, and only a city draws arterials',
      'move this node into the city\'s "children", or drop "vista" and place the building with an ordinary constraint',
    ),
  );
}

/**
 * Validate `params.archetype`, the explicit spelling of what a building is for.
 *
 * The grammar has always read this key — `archetypeOfTags` is only the
 * *fallback* for a node that does not name one — and until fabric v2 the
 * validator rejected it as unknown, which meant the one unambiguous way to say
 * "this is a bakery" was the one way a document could not say it. Districts
 * made the gap untenable: their `mix` is a list of these names, and an author
 * who can name an archetype for an infill lot but not for a landmark would be
 * right to be confused.
 */
function validateArchetypeParam(out: LoamDiagnostic[], at: string, value: unknown): void {
  if (value === undefined) return;
  if (typeof value !== "string") {
    out.push(
      error(
        "STRUCTURE_PARAM",
        at,
        `"archetype" must be an archetype name, got ${describe(value)}`,
        'write "archetype": "bakery" — or drop the key and let the node\'s "tags" imply one',
      ),
    );
    return;
  }
  if (isKnownArchetype(value)) return;
  const near = nearestArchetypes(value);
  out.push(
    error(
      "STRUCTURE_PARAM",
      at,
      `"archetype" names "${value}", which is not a building archetype`,
      near.length === 0
        ? 'drop "archetype" and let the node\'s "tags" choose one'
        : `did you mean ${near.map((n) => `"${n}"`).join(", ")}?`,
    ),
  );
}

/** Shortest shared run between a wing and the main block, in cells. */
export const WING_MIN_OVERLAP = 3;

/** Shallowest wing this grammar builds, in blocks. */
export const WING_MIN_DEPTH = 3;

const WING_SIDES = ["north", "east", "south", "west"] as const;

/**
 * `wing`: `{ "size": [x, z], "side": "north"|"east"|"south"|"west",
 * "offset": int }` — the second rect of an L- or T-shaped plan.
 *
 * The bounding box does not change: a wing carves the node's envelope rather
 * than growing it, so nothing here needs the envelope to check. What it *can*
 * check without one is the shape: that the run along the shared face is long
 * enough to be a doorway rather than two corner posts, that the wing is deep
 * enough to be a room, and that the offset does not run the wing off the end of
 * the face it hangs off — the "straight edges only" rule, which exists because
 * a wing that overhangs would need a wall segment standing over open air.
 */
function validateWingParam(out: LoamDiagnostic[], at: string, value: unknown): void {
  if (value === undefined) return;
  const fix =
    'write "wing": { "size": [5, 4], "side": "south", "offset": 0 } — the wing is carved out of the node\'s own envelope, so its depth must leave at least 3 blocks of main block behind it';
  if (!isObject(value)) {
    out.push(error("STRUCTURE_PARAM", at, `"wing" must be an object, got ${describe(value)}`, fix));
    return;
  }
  const path = `${at}.wing`;
  unknownKeys(out, value, path, ["size", "side", "offset"], "a wing");

  const side = value["side"];
  if (side === undefined) {
    out.push(error("STRUCTURE_PARAM", path, `"wing" needs a "side"`, `add "side": "south" — which face of the main block the wing hangs off (${WING_SIDES.join(", ")})`));
  } else if (typeof side !== "string" || !(WING_SIDES as readonly string[]).includes(side)) {
    out.push(error("STRUCTURE_PARAM", path, `"side" must be one of ${WING_SIDES.join(", ")}, got ${describe(side)}`, `set "side" to the face the wing hangs off, e.g. "south"`));
  }

  const size = value["size"];
  let span: number | null = null;
  let depth: number | null = null;
  if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => Number.isInteger(n))) {
    out.push(error("STRUCTURE_PARAM", path, `"size" must be a pair of integers [x, z], got ${describe(size)}`, fix));
  } else {
    const [wx, wz] = size as [number, number];
    if (wx < 1 || wz < 1) {
      out.push(error("STRUCTURE_PARAM", path, `"size" must be positive in both axes, got [${wx}, ${wz}]`, fix));
    } else if (typeof side === "string" && (WING_SIDES as readonly string[]).includes(side)) {
      const alongX = side === "north" || side === "south";
      span = alongX ? wx : wz;
      depth = alongX ? wz : wx;
      if (span < WING_MIN_OVERLAP) {
        out.push(error("STRUCTURE_PARAM", path, `a "${side}" wing shares a ${span}-cell run with the main block; ${WING_MIN_OVERLAP} is the shortest that leaves a doorway between the two rooms`, `widen the wing along its ${alongX ? "x" : "z"} axis to at least ${WING_MIN_OVERLAP}`));
      }
      if (depth < WING_MIN_DEPTH) {
        out.push(error("STRUCTURE_PARAM", path, `a "${side}" wing ${depth} deep is a buttress, not a room`, `deepen the wing along its ${alongX ? "z" : "x"} axis to at least ${WING_MIN_DEPTH}`));
      }
    }
  }

  const offset = value["offset"];
  if (offset !== undefined && !Number.isInteger(offset)) {
    out.push(error("STRUCTURE_PARAM", path, `"offset" must be an integer, got ${describe(offset)}`, `set "offset" to how far along the face the wing starts, counted from the envelope's min corner — 0 for a flush L, or centre it for a T`));
  } else if (typeof offset === "number" && offset < 0) {
    out.push(error("STRUCTURE_PARAM", path, `"offset" must not be negative, got ${offset}`, `a wing may not overhang the face it hangs off — straight edges only; use 0 for a wing flush with the corner`));
  }
}

/** Cellar depths this grammar digs, in blocks of headroom. */
/* -------------------------------------------------------------------------- */
/* the tall archetypes                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Tags that ask for a tall building, and the archetype each one means.
 *
 * Duplicated from `stdlib`'s `highriseArchetypeOfTags` rather than imported —
 * `spec` sits *below* `stdlib` in the dependency graph and has always restated
 * the handful of grammar constants it validates against (`WING_MIN_OVERLAP` is
 * the precedent). `test/settlement-validate.test.ts` is where the two are
 * pinned to each other.
 */
const HIGHRISE_TAGS: Readonly<Record<string, string>> = Object.freeze({
  skyscraper: "skyscraper",
  high_rise: "skyscraper",
  highrise: "skyscraper",
  tower_block: "skyscraper",
  hotel: "hotel",
  lodging: "hotel",
  guesthouse: "hotel",
  apartment: "apartment_block",
  apartment_block: "apartment_block",
  tenement: "apartment_block",
  flats: "apartment_block",
  office: "office",
  offices: "office",
  corporate: "office",
  headquarters: "office",
});

/**
 * Storey caps, per tall archetype.
 *
 * The general `floors` range in {@link BUILDING_NUMS} stays 1..24 for every
 * other building, unchanged: this is a *narrowing* that applies only where a
 * tall tag has been asked for, and it is here rather than in the number table
 * because 24 storeys of hotel and 24 storeys of skyscraper are not the same
 * request.
 */
export const HIGHRISE_FLOOR_CAPS: Readonly<Record<string, number>> = Object.freeze({
  skyscraper: 20,
  office: 16,
  hotel: 14,
  apartment_block: 10,
});

/**
 * Envelope width a tall building may ask for, in blocks.
 *
 * The raise that makes the tall grammar usable: the village archetypes top out
 * around fifteen blocks on a side in practice, and a tower needs a plate wide
 * enough to hold a stair core *and* a room beside it. Both ends are checked —
 * a nine-storey office on a 6 × 6 footprint is a chimney, not an office.
 */
export const HIGHRISE_WIDTH_RANGE = [7, 24] as const;

/**
 * Check a tall building's envelope and storey count.
 *
 * Only ever fires on a node whose tags ask for a tall archetype; a node without
 * one is not touched, which is what "existing archetypes' caps unchanged"
 * means in code.
 */
function validateHighriseEnvelope(out: LoamDiagnostic[], path: string, node: Obj, params: Obj): void {
  const tags = node["tags"];
  if (!Array.isArray(tags)) return;
  let archetype: string | undefined;
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const named = HIGHRISE_TAGS[tag];
    if (named !== undefined) {
      archetype = named;
      break;
    }
  }
  if (archetype === undefined) return;

  const cap = HIGHRISE_FLOOR_CAPS[archetype] as number;
  const floors = params["floors"];
  if (typeof floors === "number" && Number.isInteger(floors) && floors > cap) {
    out.push(
      error(
        "STRUCTURE_PARAM",
        `${path}.params`,
        `a "${archetype}" builds at most ${cap} storeys; "floors" is ${floors}`,
        `lower "floors" to ${cap} or below, or retag the node as "skyscraper" (${HIGHRISE_FLOOR_CAPS["skyscraper"] as number} storeys) if it really is that tall`,
      ),
    );
  }

  const envelope = node["envelope"];
  if (!isObject(envelope)) return;
  const size = envelope["size"];
  if (!Array.isArray(size) || size.length !== 3) return;
  const [lo, hi] = HIGHRISE_WIDTH_RANGE;
  for (const axis of [0, 2] as const) {
    const v = size[axis];
    if (typeof v !== "number" || !Number.isInteger(v)) continue;
    if (v < lo) {
      out.push(
        error(
          "BAD_ENVELOPE",
          `${path}.envelope`,
          `a "${archetype}" needs at least ${lo} blocks on each horizontal axis for a stair core and a floor plate; "size"[${axis}] is ${v}`,
          `write "size": [${lo + 5}, ${(typeof floors === "number" ? floors : 8) * 4 + 4}, ${lo + 5}] — the tall grammar builds at 4 blocks per storey`,
        ),
      );
    } else if (v > hi) {
      out.push(
        error(
          "BAD_ENVELOPE",
          `${path}.envelope`,
          `a "${archetype}" footprint is capped at ${hi} blocks per horizontal axis; "size"[${axis}] is ${v}`,
          `lower "size"[${axis}] to ${hi} or below — a wider plate is a podium, which is a second node under the same parent rather than one bigger envelope`,
        ),
      );
    }
  }
  const height = size[1];
  const wanted = (typeof floors === "number" && Number.isInteger(floors) ? floors : 1) * 4 + 4;
  if (typeof height === "number" && Number.isInteger(height) && typeof floors === "number" && height < wanted) {
    out.push(
      warning(
        "ENVELOPE_SIZE_COERCED",
        `${path}.envelope`,
        `"size"[1] is ${height}, which is shorter than ${floors} storeys at 4 blocks each plus a parapet`,
        `raise "size"[1] to ${wanted} — the tall grammar builds to its storey count and the envelope's Y is advisory, so a short box only misleads a reader`,
      ),
    );
  }
}

export const BASEMENT_DEPTH_RANGE = [3, 5] as const;

/**
 * How a cellar may be dressed.
 *
 * `plain` is what every cellar was before the themed rooms existed and is
 * still the default. The rest change the masonry and the contents and nothing
 * else — same shell, same ladder, same walkable plane — which is why this is a
 * param of `basement` rather than an archetype of its own.
 */
export const CELLAR_STYLE_VALUES = [
  "plain",
  "crypt",
  "vault",
  "wine_cellar",
  "mine",
  // Wave six. The first eight are rooms an author asks for by name; the last
  // three are what the depths archetypes dress themselves in, listed because a
  // value the grammar accepts and the validator refuses is the worst of both.
  "ossuary",
  "undercroft",
  "dungeon_room",
  "root_cellar",
  "cistern_hall",
  "smugglers_cove",
  "hermit_grotto",
  "sewer_network",
  "bunker_hold",
  "subway_platform",
  "silo_shaft",
] as const;

/** How a `connected … via "tunnel"` gallery may be dug. */
export const TUNNEL_STYLE_VALUES = ["dressed", "mine", "crypt"] as const;

/**
 * `basement`: `true`, or `{ "depth": 3..5 }`.
 *
 * The bare-number form (`"basement": 4`) is accepted as the same thing, because
 * the v0.2 catalog types the param as an int and a document written against the
 * catalog must not be rejected for it.
 */
function validateBasementParam(out: LoamDiagnostic[], at: string, value: unknown): void {
  if (value === undefined || typeof value === "boolean") return;
  const [lo, hi] = BASEMENT_DEPTH_RANGE;
  const fix = `write "basement": true for the default ${lo + 1}-high cellar, or "basement": { "depth": ${lo + 1} } to set its headroom (${lo}..${hi})`;
  if (typeof value === "number") {
    if (value === 0) return; // "no cellar", spelled as a depth.
    if (!Number.isInteger(value) || value < lo || value > hi) {
      out.push(error("STRUCTURE_PARAM", at, `"basement" depth must be an integer in ${lo}..${hi} (or 0 for none), got ${describe(value)}`, fix));
    }
    return;
  }
  if (!isObject(value)) {
    out.push(error("STRUCTURE_PARAM", at, `"basement" must be a boolean or an object, got ${describe(value)}`, fix));
    return;
  }
  unknownKeys(out, value, `${at}.basement`, ["depth", "style"], "a basement");
  const style = value["style"];
  if (style !== undefined && !(CELLAR_STYLE_VALUES as readonly unknown[]).includes(style)) {
    out.push(
      error(
        "STRUCTURE_PARAM",
        `${at}.basement`,
        `"style" must name a cellar style — one of ${CELLAR_STYLE_VALUES.join(", ")} — got ${describe(style)}`,
        'write "basement": { "depth": 4, "style": "crypt" } for a burial vault, or omit "style" for the plain cellar',
      ),
    );
  }
  const depth = value["depth"];
  if (depth === undefined) return;
  if (typeof depth !== "number" || !Number.isInteger(depth) || depth < lo || depth > hi) {
    out.push(error("STRUCTURE_PARAM", `${at}.basement`, `"depth" must be an integer in ${lo}..${hi}, got ${describe(depth)}`, fix));
  }
}

const ROAD_PATTERNS = ["grid", "organic", "radial", "ribbon", "minimal_spanning"] as const;

function validateRoadParams(out: LoamDiagnostic[], at: string, params: Obj): void {
  unknownKeys(out, params, at, ["anchors", "pattern", "width", "lanterns", "junctionStyle"], "road.network@0 params");
  checkNumbers(out, at, params, { width: { min: 2, max: 3, int: true } });
  checkBooleans(out, at, params, ["lanterns"]);
  checkEnumParam(out, at, params, "pattern", ROAD_PATTERNS);
  checkEnumParam(out, at, params, "junctionStyle", ["plain", "plaza", "roundabout", "stairs"] as const);

  // Optional: a network with no `anchors` reaches every building, district,
  // precinct and landmark in the document, which is what a settlement's lanes
  // do. The list exists to add or restrict.
  const anchors = params["anchors"];
  if (anchors !== undefined && (!Array.isArray(anchors) || anchors.length === 0 || anchors.some((a) => typeof a !== "string"))) {
    out.push(error("STRUCTURE_PARAM", at, `"anchors" must be a non-empty array of selector strings, got ${describe(anchors)}`, 'write "anchors": ["town_hall", "#tag:house"], or omit it to reach everything'));
  }
}

function checkEnumParam(out: LoamDiagnostic[], at: string, params: Obj, key: string, allowed: readonly string[]): void {
  const v = params[key];
  if (v === undefined) return;
  if (typeof v !== "string" || !allowed.includes(v)) {
    out.push(error("STRUCTURE_PARAM", at, `"${key}" must be one of ${allowed.join(", ")}, got ${describe(v)}`, `set "${key}" to one of: ${allowed.join(", ")}`));
  }
}

/* -------------------------------------------------------------------------- */

function checkTags(out: LoamDiagnostic[], path: string, tags: unknown): void {
  if (tags === undefined) return;
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) {
    out.push(error("BAD_TYPE", path, `"tags" must be an array of strings, got ${describe(tags)}`, 'write "tags": ["house", "residential"] — tags are selector targets and decorate filters'));
  }
}

function checkSeedSalt(out: LoamDiagnostic[], path: string, salt: unknown): void {
  if (salt === undefined) return;
  if (typeof salt !== "string") {
    out.push(error("BAD_TYPE", path, `"seedSalt" must be a string, got ${describe(salt)}`, 'write "seedSalt": "v2" to reroll this node without renaming it'));
  }
}

/* -------------------------------------------------------------------------- */
/* prop.place@0                                                                */
/* -------------------------------------------------------------------------- */

/** The vehicle-and-prop generator the settlement profile accepts. */
export const PROP_GENERATOR = "prop.place@0";

/**
 * Every prop `prop.place@0` builds, in catalog order.
 *
 * Duplicated from the stdlib grammar's `PROP_NAMES` rather than imported: the
 * spec package is the *bottom* of the dependency graph — stdlib depends on it,
 * not the other way round — and a validator that could not run without the
 * generator it validates would be a layering inversion. The compiler's
 * `test/props.test.ts` asserts the two lists are identical, which is what
 * keeps the duplication honest.
 */
export const SETTLEMENT_PROP_NAMES = [
  "rowboat",
  "fishing_sloop",
  "pier",
  "cart",
  "covered_wagon",
  "rail_line",
  "fountain",
  "gazebo",
  "statue_plinth",
  // transport: air
  "airliner",
  "cargo_plane",
  "biplane",
  "light_plane",
  "airship",
  "zeppelin_mast",
  "hangar",
  "runway",
  // transport: water
  "longship",
  "cog",
  "caravel",
  "galleon",
  "yacht",
  "speedboat",
  "ferry",
  "tugboat",
  "fishing_trawler",
  "drydock",
  "buoy",
  "houseboat",
  // Wave 6: three more machines for the airfield, five more hulls, and the
  // first rolling stock. Order matches `PROP_NAMES` in the stdlib, which
  // `compiler/test/props.test.ts` asserts element by element.
  "hot_air_balloon",
  "seaplane",
  "glider",
  "junk",
  "gondola",
  "barge",
  "paddle_steamer",
  "container_ship",
  "locomotive",
  "passenger_car",
  "freight_car",
  "caboose",
  // Wave 6D. A houseboat is a dwelling, but a dwelling on open water is the
  // watercraft template's question rather than the building grammar's, so it
  // is a hull and lives with the fleet.
  // The breadth wave: street furniture, works, camps, yards and smallcraft.
  "bench",
  "planter",
  "clothesline",
  "scarecrow",
  "market_barrow",
  "signpost",
  "swimming_pool",
  "curtain_wall",
  "graveyard",
  "tent",
  "caravan",
  "campsite",
  "treehouse",
  "cairn",
  "carousel",
  // Wave 4: street furniture — the small, cheap density props.
  "well_head",
  "notice_board",
  "hitching_post",
  "horse_trough",
  "lamp_post",
  "litter_bin",
  "drinking_fountain",
  "flagpole",
  "bollard_row",
  "sandwich_board",
  "dog_kennel",
  "log_pile",
  "fairground_stall",
  "ticket_booth",
  "prize_wheel",
  "swing_boats",
  // Wave 5: the wayside — kerb, road, pitch and midway.
  "bus_shelter",
  "phone_box",
  "mailbox",
  "bicycle_rack",
  "shop_awning",
  "milestone",
  "bus_stop",
  "stagecoach",
  "yurt",
  "helter_skelter",
  "midway_arch",
  "shooting_gallery",
  // Wave six, the one air-group prop.
  "helipad",
  "standing_stones",
  "henge",
  "monolith",
  "burial_mound",
  "dig_site",
  "fossil_dig",
  "shattered_obelisk",
  // Wave 6D: spectacle and oddities. The wave's other six entries are
  // buildings; these five are things you walk past rather than into.
  "ferris_wheel",
  "bandstand",
  "memorial_garden",
  "portal_frame",
  "floating_platform",
  // The classical Mediterranean pack's one prop in this half: the racecourse
  // barrier. Order matches `PROP_NAMES` in the stdlib.
  "hippodrome_spina",
  // The alien & sci-fi pack's organic props (CATALOG-EXPANSION §3.4): the
  // saturation huddle and the one-per-street wreck. Order matches `PROP_NAMES`
  // in the stdlib, which `compiler/test/props.test.ts` asserts element by
  // element.
  "bio_pod_cluster",
  "derelict_mech",
  // The nautical & pirate pack's shore props (CATALOG-EXPANSION §3.2), in the
  // order `PROP_NAMES` spreads them — straight after the alien pack's organic
  // pair. `compiler/test/props.test.ts` asserts this list element by element.
  "jolly_roger_mast",
  "gallows",
  "gibbet_cage",
  "careening_beach",
  "beached_wreck",
  // The Nile & ancient Egypt pack's props (CATALOG-EXPANSION §3.8), in the
  // order `PROP_NAMES` spreads them — straight after the nautical pack's
  // shore props. `compiler/test/props.test.ts` asserts this list element by
  // element. The pyramid is a prop for the height-budget reason
  // `props-nile.ts` gives: a building cannot host a thirty-three block mass.
  "pyramid",
  "sacred_lake",
  "felucca",
  // Wave 6C: the two energy objects that are props rather than buildings.
  "wind_turbine",
  "solar_array",
  // The classical Mediterranean pack (CATALOG-EXPANSION §3.1), second half:
  // the eight entries of that pack that are props. Order matches `PROP_NAMES`
  // in the stdlib, which `compiler/test/props.test.ts` asserts element by
  // element.
  "agora_colonnade",
  "triumphal_arch",
  "rostra",
  "herm_post",
  "votive_column",
  "column_drums",
  "trireme",
  "pithos_store",
  // The arcane & magical pack (CATALOG-EXPANSION §3.3), prop half: the nine
  // entries of that pack that are things you walk past rather than into. Order
  // matches `PROP_NAMES` in the stdlib, which `compiler/test/props.test.ts`
  // asserts element by element.
  "rune_circle",
  "ley_marker",
  "crystal_outcrop",
  "scrying_pool",
  "unicorn_paddock",
  "arcane_orrery",
  "spirit_lantern_row",
  "dragon_skeleton",
  "moon_dial",
  // The East Asian pack (CATALOG-EXPANSION §3.9), prop half: the four entries
  // of that pack that are things you walk past, under or along. Order matches
  // `PROP_NAMES` in the stdlib, which `compiler/test/props.test.ts` asserts
  // element by element.
  "torii",
  "zen_garden",
  "stone_lantern",
  "dragon_boat",
  // The alien & sci-fi pack (CATALOG-EXPANSION §3.4), human-response half:
  // the seven entries of that pack that are props. Order matches `PROP_NAMES`
  // in the stdlib, which `compiler/test/props.test.ts` asserts element by
  // element.
  "containment_tent",
  "field_lab_trailer",
  "sensor_mast",
  "dish_array",
  "sandbag_emplacement",
  "mobile_command_post",
  "sentry_turret",
  // The nautical & pirate pack (CATALOG-EXPANSION §3.2), shore half: the seven
  // entries of that pack that are props on the quay, the strand and the
  // headland. Order matches `PROP_NAMES` in the stdlib, which
  // `compiler/test/props.test.ts` asserts element by element.
  "fish_drying_rack",
  "treasure_cache",
  "smugglers_landing",
  "capstan",
  "anchor_stack",
  "daymark",
  "whalebone_arch",
  // The wilds & camps pack (CATALOG-EXPANSION §3.6), ground half: the six
  // entries of that pack that stand in a cut-over rather than roofing a room.
  // Order matches `PROP_NAMES` in the stdlib, which
  // `compiler/test/props.test.ts` asserts element by element.
  "logging_camp",
  "log_landing",
  "sawpit",
  "stump_field",
  "spar_pole",
  "hunters_cache",
  // The agrarian expansion pack (CATALOG-EXPANSION §3.5), ground half: the
  // eight entries of that pack that stand in a yard rather than roofing a
  // room. Order matches `PROP_NAMES` in the stdlib, which
  // `compiler/test/props.test.ts` asserts element by element.
  "field_gate",
  "duck_pond",
  "midden_heap",
  "sheep_dip",
  "staddle_granary",
  "hop_yard",
  "stock_pens",
  "well_sweep",
  // The frontier West pack (CATALOG-EXPANSION §3.7), ground half: the three
  // entries of that pack that stand on the ground rather than roofing a room
  // or running along a route. Order matches `PROP_NAMES` in the stdlib, which
  // `compiler/test/props.test.ts` asserts element by element.
  "water_tank_trestle",
  "placer_claim",
  "boot_hill_row",
  // --- nordic_viking pack ---
  // The Nordic & Viking pack's ground half: the three entries of that pack
  // which stand on the open ground rather than roofing a room. Order matches
  // `PROP_NAMES` in the stdlib, which `compiler/test/props.test.ts` asserts
  // element by element.
  "rune_stone",
  "boat_burial_mound",
  "drying_rack_yard",
  // --- steppe_nomad pack ---
  // The Steppe Nomad pack's ground half: the three entries of that pack which
  // stand on the open grass rather than roofing a room. Order matches
  // `PROP_NAMES` in the stdlib, which `compiler/test/props.test.ts` asserts
  // element by element.
  "khan_banner_pole",
  "shaman_ovoo",
  "balbal_stone",
  // --- swamp_witch pack ---
  // The Swamp Witch pack's ground half: the three entries of that pack which
  // stand on the wet ground rather than roofing a room. Order matches
  // `PROP_NAMES` in the stdlib, which `compiler/test/props.test.ts` asserts
  // element by element.
  "coven_stone_circle",
  "bone_charm_rack",
  "waterlogged_shrine",
  // --- atlantean pack ---
  // The Atlantean pack's ground half: the two entries of that pack which stand
  // on the bare ground rather than roofing a room. Order matches `PROP_NAMES`
  // in the stdlib, which `compiler/test/props.test.ts` asserts element by
  // element.
  "leviathan_altar",
  "bronze_colossus_fragment",
  // --- desert_caravanserai pack ---
  // The oasis pack's ground half: the two entries of that pack which stand on
  // the bare ground rather than roofing a room. Order matches `PROP_NAMES` in
  // the stdlib, which `compiler/test/props.test.ts` asserts element by
  // element.
  "date_palm_grove",
  "caravan_pack_stack",
  // --- himalayan_monastery pack ---
  // The dzong pack's ground half: the two entries of that pack which stand on
  // the bare ridge rather than roofing a room. Order matches `PROP_NAMES` in
  // the stdlib, which `compiler/test/props.test.ts` asserts element by element.
  "prayer_flag_line",
  "mani_stone_cairn",
  // --- feudal_japanese pack ---
  // The castle-town pack's ground half: the three entries of that pack which
  // stand on the bare ground rather than roofing a room. Order matches
  // `PROP_NAMES` in the stdlib, which `compiler/test/props.test.ts` asserts
  // element by element.
  "toro_lantern",
  "koi_pond",
  "nobori_banner_line",
] as const;

/** Params a `prop.place@0` node may carry. */
const PROP_PARAM_KEYS = [
  // What to build.
  "prop",
  // Coarse placement — the same vocabulary every profile node speaks.
  "zone",
  "at",
  "yaw",
  // Per-prop geometry.
  "length",
  "width",
  "curve",
  "grade",
  "platform",
] as const;

/**
 * A `prop.place@0` node.
 *
 * Deliberately *not* routed through `validateStructureNode`: a prop has no
 * road params and no building params, so the only checks it shares with those
 * are the node-shape ones. What it adds is the one param carrying all the
 * meaning — `prop` — and a fix hint naming every legal value, because
 * "unknown prop" with no list is the diagnostic an author can do least with.
 */
function validatePropNode(
  out: LoamDiagnostic[],
  path: string,
  node: Obj,
  connections: ConnectedRef[],
): void {
  unknownKeys(out, node, path, STRUCTURE_KEYS, "structure node");
  checkBooleans(out, path, node, ["optional"]);
  checkTags(out, path, node["tags"]);
  checkSeedSalt(out, path, node["seedSalt"]);

  if (node["children"] !== undefined) {
    out.push(
      error(
        "STRUCTURE_NODE_SHAPE",
        path,
        "prop.place@0 nodes have no children",
        'remove "children" — a prop is a leaf; declare another prop.place@0 sibling under the root instead',
      ),
    );
  }

  if (node["constraints"] !== undefined) {
    out.push(
      error(
        "CONSTRAINTS_NOT_ALLOWED",
        path,
        "prop.place@0 does not go through the layout solver, so it takes no constraints",
        'props take zone/at/jitter params — move the placement into "params", e.g. "params": { "zone": "north", "at": [0.4, 0.7], "jitter": 3 }',
      ),
    );
  }

  const params = node["params"];
  if (params !== undefined && !isObject(params)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"params" must be an object, got ${describe(params)}`,
        'write "params": { "prop": "rowboat" } — prop.place@0 has to be told what to build',
      ),
    );
  } else {
    validatePropParams(out, `${path}.params`, isObject(params) ? params : {});
  }

  validateBoxEnvelope(out, path, node["envelope"]);
  validateConstraints(out, path, node["constraints"], node["id"], connections);
  validatePorts(out, path, node["ports"]);
}

function validatePropParams(out: LoamDiagnostic[], at: string, params: Obj): void {
  unknownKeys(out, params, at, PROP_PARAM_KEYS, "prop.place@0 params");

  const prop = params["prop"];
  const list = SETTLEMENT_PROP_NAMES.join(", ");
  if (prop === undefined) {
    out.push(
      error(
        "STRUCTURE_PARAM",
        at,
        'prop.place@0 needs a "prop" — the thing to build',
        `set "prop" to one of: ${list}`,
      ),
    );
  } else if (
    typeof prop !== "string" ||
    !(SETTLEMENT_PROP_NAMES as readonly string[]).includes(prop)
  ) {
    out.push(
      error(
        "STRUCTURE_PARAM",
        at,
        `prop.place@0 does not build ${describe(prop)}`,
        `set "prop" to one of: ${list}`,
      ),
    );
  }

  if (params["zone"] !== undefined) checkZone(out, at, "zone", params["zone"]);
  checkBooleans(out, at, params, ["curve", "platform"]);
  checkNumbers(out, at, params, {
    length: { min: 3, max: 64, int: true },
    width: { min: 1, max: 5, int: true },
    grade: { min: 0, max: 4, int: true },
    jitter: { min: 0, max: 1 },
  });

  const yaw = params["yaw"];
  if (yaw !== undefined && !(YAWS as readonly unknown[]).includes(yaw)) {
    out.push(
      error(
        "STRUCTURE_PARAM",
        at,
        `"yaw" must be one of ${YAWS.join(", ")}, got ${describe(yaw)}`,
        'write "yaw": 90 — a prop is placed on the quarter-turn lattice, like every other node',
      ),
    );
  }

  const anchor = params["at"];
  if (anchor !== undefined && anchor !== "pier" && !isObject(anchor)) {
    out.push(
      error(
        "STRUCTURE_PARAM",
        at,
        `"at" must be "pier" or an { "x", "z" } column, got ${describe(anchor)}`,
        'write "at": "pier" to moor at the nearest pier end, or use "zone": "north" to place it coarsely',
      ),
    );
  }

  const on = params["on"];
  if (on !== undefined && on !== "water" && on !== "ground") {
    out.push(
      error(
        "STRUCTURE_PARAM",
        at,
        `"on" must be "water" or "ground", got ${describe(on)}`,
        'write "on": "water" to put the prop on the nearest suitable water columns — boats declare it by default',
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* infra.entry@0                                                               */
/* -------------------------------------------------------------------------- */

/**
 * An `infra.entry@0` node.
 *
 * Routed the way {@link validatePropNode} is and for the same reason: an entry
 * has no road params and no building params, and takes no part in the layout
 * solve, so the only checks it shares with a structure node are the node-shape
 * ones. What it adds is the two params carrying all the meaning — `entry` and
 * `route` — and a fix hint naming every legal value.
 *
 * **No coordinates, checked structurally.** `margin`, `offset` and `run` are
 * distances and are legal; the form keys take a *name*, never a vertex, a
 * bearing or an `[x, z]`. A route key whose value is not a string (or, for
 * `between`, a pair of strings) is rejected outright rather than coerced —
 * which is the closed-vocabulary half of §5's "no absolute coordinates, ever".
 */
function validateInfraEntryNode(
  out: LoamDiagnostic[],
  path: string,
  node: Obj,
  connections: ConnectedRef[],
): void {
  unknownKeys(out, node, path, STRUCTURE_KEYS, "structure node");
  checkBooleans(out, path, node, ["optional"]);
  checkTags(out, path, node["tags"]);
  checkSeedSalt(out, path, node["seedSalt"]);

  if (node["children"] !== undefined) {
    out.push(
      error(
        "STRUCTURE_NODE_SHAPE",
        path,
        "infra.entry@0 nodes have no children",
        'remove "children" — an entry is a leaf; declare another infra.entry@0 sibling under the root instead',
      ),
    );
  }

  const params = node["params"];
  if (params !== undefined && !isObject(params)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"params" must be an object, got ${describe(params)}`,
        'write "params": { "entry": "test_fence", "route": { "ring": "the_holding", "margin": 12 } } — infra.entry@0 has to be told what to build and where it runs',
      ),
    );
  } else {
    validateInfraEntryParams(out, `${path}.params`, isObject(params) ? params : {});
  }

  validateBoxEnvelope(out, path, node["envelope"]);
  validateConstraints(out, path, node["constraints"], node["id"], connections);
  validatePorts(out, path, node["ports"]);
}

function validateInfraEntryParams(out: LoamDiagnostic[], at: string, params: Obj): void {
  unknownKeys(out, params, at, INFRA_ENTRY_PARAM_KEYS, "infra.entry@0 params");

  const list = KNOWN_INFRA_ENTRIES.join(", ");
  const entry = params["entry"];
  let def: string | undefined;
  if (entry === undefined) {
    out.push(
      error(
        "INFRA_ENTRY_PARAM",
        at,
        'infra.entry@0 needs an "entry" — the thing to build',
        `set "entry" to one of: ${list}`,
      ),
    );
  } else if (typeof entry !== "string" || !isKnownInfraEntry(entry)) {
    const near = typeof entry === "string" ? nearestInfraEntries(entry) : [];
    out.push(
      error(
        "INFRA_ENTRY_PARAM",
        at,
        `infra.entry@0 does not build ${describe(entry)}`,
        near.length > 0
          ? `did you mean ${near.map((n) => `"${n}"`).join(", ")}? "entry" must be one of: ${list}`
          : `set "entry" to one of: ${list}`,
      ),
    );
  } else {
    def = entry;
  }

  checkBooleans(out, at, params, ["gates"]);
  checkNumbers(out, at, params, { height: { min: 1, max: 16, int: true } });
  validateInfraRoute(out, at, params["route"], def);
}

/**
 * The `route` param: exactly one form key, and the distances that form takes.
 *
 * "Exactly one" is checked rather than assumed. A route naming two anchors in
 * two different forms is not a route the compiler could resolve into one line,
 * and silently taking the first key would make the document's meaning depend on
 * JSON key order.
 */
function validateInfraRoute(
  out: LoamDiagnostic[],
  at: string,
  route: unknown,
  entry: string | undefined,
): void {
  const where = `${at}.route`;
  const forms = INFRA_ROUTE_KEYS.join(", ");
  if (route === undefined) {
    out.push(
      error(
        "INFRA_ENTRY_PARAM",
        at,
        'infra.entry@0 needs a "route" — where the entry runs',
        `write "route": { "ring": "<node id>", "margin": 12 }; the forms are: ${forms}`,
      ),
    );
    return;
  }
  if (!isObject(route)) {
    out.push(
      error(
        "INFRA_ENTRY_PARAM",
        where,
        `"route" must be an object naming one form, got ${describe(route)}`,
        `write "route": { "along": "<road id>", "offset": 3 }; the forms are: ${forms}`,
      ),
    );
    return;
  }
  unknownKeys(out, route, where, INFRA_ROUTE_PARAM_KEYS, "an infra.entry@0 route");

  const named = INFRA_ROUTE_KEYS.filter((k) => route[k] !== undefined);
  if (named.length === 0) {
    out.push(
      error(
        "INFRA_ENTRY_PARAM",
        where,
        "a route names no form",
        `write exactly one of: ${forms} — e.g. "route": { "ring": "north_holding", "margin": 12 }`,
      ),
    );
    return;
  }
  if (named.length > 1) {
    out.push(
      error(
        "INFRA_ENTRY_PARAM",
        where,
        `a route names ${named.length} forms (${named.join(", ")}) and a route is one line`,
        `keep exactly one of: ${forms} — declare a second infra.entry@0 node for the second line`,
      ),
    );
    return;
  }

  const form = named[0] as (typeof INFRA_ROUTE_KEYS)[number];
  const value = route[form];
  // The anchor. A name, never a coordinate — see the module note on §5.
  // `between` is the one form that names *two* anchors, so it is the one form
  // whose value is not a string. Checked here in full — two entries, both
  // named, and not the same name twice — because every one of those mistakes
  // resolves to something the compiler would have to guess at: a span with one
  // end, or a span of length zero.
  if (form === "between") {
    if (!Array.isArray(value) || value.length !== 2) {
      out.push(
        error(
          "INFRA_ENTRY_PARAM",
          where,
          `"between" names two placed anchors, got ${describe(value)}`,
          'write "between": ["<node id>", "<node id>"] — the two things the run is strung between, named, never written as coordinates',
        ),
      );
      return;
    }
    const [a, b] = value as unknown[];
    if (typeof a !== "string" || a.length === 0 || typeof b !== "string" || b.length === 0) {
      out.push(
        error(
          "INFRA_ENTRY_PARAM",
          where,
          `both ends of a "between" route must name a placed node, got [${describe(a)}, ${describe(b)}]`,
          'write "between": ["north_mole", "south_mole"] — each end is a node id the compiler placed',
        ),
      );
      return;
    }
    if (a === b) {
      out.push(
        error(
          "INFRA_ENTRY_PARAM",
          where,
          `a "between" route names "${a}" at both ends, and a run between a thing and itself has no length`,
          "name two different placed nodes — or use a different route form if what you meant was a line around or beside one thing",
        ),
      );
      return;
    }
    validateRouteTail(out, where, route, entry, form);
    return;
  }
  if (typeof value !== "string" || value.length === 0) {
    out.push(
      error(
        "INFRA_ENTRY_PARAM",
        where,
        `"${form}" must name a placed node, got ${describe(value)}`,
        `write "${form}": "<node id>" — a route is named relative to something the compiler placed, never written as coordinates`,
      ),
    );
    return;
  }

  validateRouteTail(out, where, route, entry, form);
}

/**
 * The part of a route every form shares: its distances, its side, and whether
 * the entry accepts the form at all.
 *
 * Extracted when `between` landed, because `between`'s anchor is an array and
 * every other form's is a string: the two branches differ only in how they read
 * the value the form key carries, and duplicating the tail is how the two would
 * quietly drift apart.
 */
function validateRouteTail(
  out: LoamDiagnostic[],
  where: string,
  route: Record<string, unknown>,
  entry: string | undefined,
  form: (typeof INFRA_ROUTE_KEYS)[number],
): void {
  checkNumbers(out, where, route, {
    margin: { min: INFRA_MARGIN_MIN, max: INFRA_MARGIN_MAX, int: true },
    offset: { min: INFRA_OFFSET_MIN, max: INFRA_OFFSET_MAX, int: true },
    run: { min: INFRA_RUN_MIN, max: INFRA_RUN_MAX, int: true },
  });
  const side = route["side"];
  if (side !== undefined && !(INFRA_ROUTE_SIDES as readonly unknown[]).includes(side)) {
    out.push(
      error(
        "INFRA_ENTRY_PARAM",
        where,
        `"side" must be one of ${INFRA_ROUTE_SIDES.join(", ")}, got ${describe(side)}`,
        'write "side": "left" — which hand of the corridor the run stands on, measured along its own direction',
      ),
    );
  }

  // …and which forms this particular entry accepts (§3.7's second half). An
  // entry naming a form it has no geometry for would compile to a world
  // silently missing the thing the document asked for.
  if (entry === undefined) return;
  const accepted = INFRA_ENTRY_ROUTES[entry];
  if (accepted !== undefined && !accepted.includes(form)) {
    out.push(
      error(
        "INFRA_ENTRY_PARAM",
        where,
        `"${entry}" does not accept the "${form}" route form`,
        `"${entry}" accepts: ${accepted.join(", ")} — or name an entry whose geometry suits the line you want`,
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* precinct.*@0                                                                */
/* -------------------------------------------------------------------------- */

/** Smallest `precinct.airport@0` envelope, as `[long, cross]`. */
export const AIRPORT_MIN_ENVELOPE = Object.freeze([120, 80] as const);

/** Smallest `precinct.harbour@0` envelope, as `[quay, reach]`. */
export const HARBOUR_MIN_ENVELOPE = Object.freeze([64, 48] as const);

/**
 * A precinct's envelope, checked against the kit's minimum.
 *
 * Rejected here rather than at compile time because a precinct that does not
 * fit builds *nothing* — the kits refuse to emit half a layout — and an author
 * would much rather be told the number to change than be handed an empty box
 * and a warning. The compiler checks it again against the *placed* footprint,
 * which is the one the solver may have shrunk.
 */
function validatePrecinctEnvelope(
  out: LoamDiagnostic[],
  path: string,
  node: Obj,
  generator: string,
): void {
  const envelope = node["envelope"];
  const min = generator === "precinct.airport@0" ? AIRPORT_MIN_ENVELOPE : HARBOUR_MIN_ENVELOPE;
  const kind = generator === "precinct.airport@0" ? "an aerodrome" : "a harbour";
  if (!isObject(envelope) || !Array.isArray(envelope["size"])) {
    out.push(
      error(
        "BAD_ENVELOPE",
        path,
        `${generator} needs an explicit box envelope; ${kind} is a piece of ground, not a building`,
        `add "envelope": { "shape": "box", "size": [${min[0]}, 24, ${min[1]}] }`,
      ),
    );
    return;
  }
  const size = envelope["size"] as unknown[];
  const x = typeof size[0] === "number" ? size[0] : 0;
  const z = typeof size[2] === "number" ? size[2] : 0;
  const long = Math.max(x, z);
  const cross = Math.min(x, z);
  if (long < min[0] || cross < min[1]) {
    out.push(
      error(
        "BAD_ENVELOPE",
        `${path}.envelope`,
        `${generator} was given a ${x}×${z} footprint; ${kind} needs at least ${min[0]}×${min[1]} (either way round)`,
        `set "size": [${min[0]}, ${(envelope["size"] as unknown[])[1] ?? 24}, ${min[1]}] or larger — the kit refuses to build a partial compound`,
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* precinct.farm@0 — the holding */
/* -------------------------------------------------------------------------- */

/**
 * A holding's envelope: required, `"shape": "region"`, and at least 40 × 40.
 *
 * The floor is one farmstead yard (20 × 20) plus one parcel plus the setbacks:
 * below it there is nowhere to put a field, and a holding with no fields is not
 * a holding.
 */
function validateFarmEnvelope(out: LoamDiagnostic[], path: string, envelope: unknown): void {
  const at = `${path}.envelope`;
  const [minX, minZ] = FARM_MIN_ENVELOPE;
  const fix = `add "envelope": { "shape": "region", "size": [64, 64] } — a holding is a piece of ground, so its size has two elements, and it needs at least ${minX} × ${minZ}`;
  if (!isObject(envelope)) {
    out.push(
      error("FARM_TOO_SMALL", at, `precinct.farm@0 needs a region envelope, got ${describe(envelope)}`, fix),
    );
    return;
  }
  unknownKeys(out, envelope, at, ["shape", "size", "padding"], "farm envelope");
  if (envelope["shape"] !== "region") {
    out.push(
      error(
        "FARM_TOO_SMALL",
        at,
        `the farm envelope "shape" must be "region", got ${describe(envelope["shape"])}`,
        fix,
      ),
    );
  }
  checkNumbers(out, at, envelope, { padding: { min: 0, max: 64, int: true } });
  const size = envelope["size"];
  if (!Array.isArray(size) || size.length !== 2 || size.some((v) => typeof v !== "number")) {
    out.push(
      error("FARM_TOO_SMALL", at, `the farm envelope "size" must be [x, z], got ${describe(size)}`, fix),
    );
    return;
  }
  const [x, z] = size as [number, number];
  if (!Number.isInteger(x) || !Number.isInteger(z) || x < minX || z < minZ) {
    out.push(
      error(
        "FARM_TOO_SMALL",
        at,
        `precinct.farm@0 was given a ${x}×${z} envelope; a holding needs at least ${minX}×${minZ} in whole blocks — one yard, one field and the setbacks`,
        fix,
      ),
    );
  }
}

/** `precinct.farm@0` params. */
function validateFarmParams(out: LoamDiagnostic[], at: string, params: Obj): void {
  unknownKeys(
    out,
    params,
    at,
    ["parcels", "parcelSize", "crops", "farmstead", "edge", "fallow"],
    "precinct.farm@0 params",
  );

  for (const [key, range, hint] of [
    ["parcels", FARM_PARAM_RANGES.parcels, 'write "parcels": 6 for a holding that reads as a working farm'],
    ["parcelSize", FARM_PARAM_RANGES.parcelSize, 'write "parcelSize": 18 — below 10 the rows have no rhythm'],
    ["fallow", FARM_PARAM_RANGES.fallow, 'write "fallow": 0.25 to rest a quarter of the fields'],
  ] as const) {
    const value = params[key];
    if (value === undefined) continue;
    const whole = key !== "fallow";
    const bad =
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (whole && !Number.isInteger(value)) ||
      value < range.min ||
      value > range.max;
    if (bad) {
      out.push(
        error(
          "FARM_PARAM",
          at,
          `"${key}" must be ${whole ? "a whole number" : "a number"} from ${range.min} to ${range.max}, got ${describe(value)}`,
          hint,
        ),
      );
    }
  }

  const crops = params["crops"];
  if (crops !== undefined) {
    if (!Array.isArray(crops) || crops.length === 0) {
      out.push(
        error(
          "FARM_PARAM",
          at,
          `"crops" must be a non-empty array of crop ids, got ${describe(crops)}`,
          `write "crops": ["wheat", "potatoes"] — the vocabulary is ${FARM_CROPS.join(", ")}`,
        ),
      );
    } else {
      for (const crop of crops) {
        if (typeof crop === "string" && (FARM_CROPS as readonly string[]).includes(crop)) continue;
        out.push(
          warning(
            "FARM_CROP_UNKNOWN",
            at,
            `"crops" names ${describe(crop)}, which is not a crop this kit grows; the holding keeps its seeded draw over the crops it understands`,
            `use one of ${FARM_CROPS.join(", ")}`,
          ),
        );
      }
    }
  }

  const edge = params["edge"];
  if (edge !== undefined && !(typeof edge === "string" && (FARM_EDGES as readonly string[]).includes(edge))) {
    out.push(
      error(
        "FARM_PARAM",
        at,
        `"edge" must be one of ${FARM_EDGES.join(", ")}, got ${describe(edge)}`,
        'write "edge": "fence" for the ordinary field boundary, or "wall" for dry stone',
      ),
    );
  }

  const farmstead = params["farmstead"];
  const farmsteadOk =
    farmstead === undefined ||
    farmstead === "auto" ||
    farmstead === "none" ||
    (Array.isArray(farmstead) &&
      farmstead.length > 0 &&
      farmstead.every((a) => typeof a === "string"));
  if (!farmsteadOk) {
    out.push(
      error(
        "FARM_PARAM",
        at,
        `"farmstead" must be "auto", "none", or a non-empty array of archetype ids, got ${describe(farmstead)}`,
        'write "farmstead": "auto" and let the holding size choose, or ["farmhouse", "barn"] to name them',
      ),
    );
  }
}

/** `precinct.airport@0` params. */
function validateAirportParams(out: LoamDiagnostic[], at: string, params: Obj): void {
  unknownKeys(out, params, at, ["stands", "hangars", "terminal"], "precinct.airport@0 params");
  checkNumbers(out, at, params, {
    stands: { min: 1, max: 12, int: true },
    hangars: { min: 0, max: 4, int: true },
  });
  checkBooleans(out, at, params, ["terminal"]);
}

/** `precinct.harbour@0` params. */
function validateHarbourParams(out: LoamDiagnostic[], at: string, params: Obj): void {
  unknownKeys(out, params, at, ["piers", "ships"], "precinct.harbour@0 params");
  checkNumbers(out, at, params, { piers: { min: 1, max: 8, int: true } });
  const ships = params["ships"];
  if (ships !== undefined && ships !== "fill" && typeof ships !== "number") {
    out.push(
      error(
        "STRUCTURE_PARAM",
        at,
        `"ships" must be a count or the token "fill", got ${describe(ships)}`,
        'write "ships": "fill" to moor one hull at every pier, or "ships": 2 for a quieter port',
      ),
    );
  }
  if (typeof ships === "number" && (!Number.isInteger(ships) || ships < 0 || ships > 8)) {
    out.push(
      error("STRUCTURE_PARAM", at, `"ships" must be a whole number from 0 to 8, got ${describe(ships)}`, 'write "ships": 3'),
    );
  }
}

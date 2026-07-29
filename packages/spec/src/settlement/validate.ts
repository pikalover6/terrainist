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
  isTier1,
  isTier2,
  resolveTypeKey,
  type ConstraintType,
} from "./constraints.js";
import {
  HORIZONTAL_FACES,
  PORT_TYPES,
  SETTLEMENT_EXCLUDED_GENERATORS,
  STRUCTURE_GENERATORS,
  V02_FACES,
  V02_PORT_TYPES,
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
  validateRoot(out, input["root"]);

  if (hasErrors(out)) return { diagnostics: out };
  return { diagnostics: out, document: input as unknown as SettlementDocument };
}

/* -------------------------------------------------------------------------- */
/* root                                                                        */
/* -------------------------------------------------------------------------- */

function validateRoot(out: LoamDiagnostic[], root: unknown): void {
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

    if (raw["kind"] !== "generator") {
      out.push(
        error(
          "STRUCTURE_NODE_SHAPE",
          childPath,
          `children of the root must have "kind": "generator" or "kind": "primitive", got ${describe(raw["kind"])}`,
          'set "kind": "generator" for a terrain or structure generator, or "kind": "primitive" for the plaza — the settlement profile has no nested composites',
        ),
      );
      continue;
    }

    const generator = raw["generator"];
    if (typeof generator === "string" && (STRUCTURE_GENERATORS as readonly string[]).includes(generator)) {
      validateStructureNode(out, childPath, raw, connections);
      continue;
    }
    if (generator === PROP_GENERATOR) {
      validatePropNode(out, childPath, raw, connections);
      continue;
    }
    if (
      typeof generator !== "string" ||
      !(PROFILE_GENERATORS as readonly string[]).includes(generator) ||
      (SETTLEMENT_EXCLUDED_GENERATORS as readonly string[]).includes(generator)
    ) {
      out.push(
        error(
          "STRUCTURE_GENERATOR_NOT_IN_PROFILE",
          childPath,
          `generator ${describe(generator)} is not allowed by the settlement profile`,
          `use one of: ${[...PROFILE_GENERATORS.filter((g) => !(SETTLEMENT_EXCLUDED_GENERATORS as readonly string[]).includes(g)), ...STRUCTURE_GENERATORS, PROP_GENERATOR].join(", ")}`,
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
        'remove "children" — building.grammar@0 and road.network@0 emit their own geometry; declare siblings under the root instead',
      ),
    );
  }

  const generator = node["generator"] as string;
  const params = node["params"];
  if (params !== undefined && !isObject(params)) {
    out.push(error("BAD_TYPE", path, `"params" must be an object, got ${describe(params)}`, 'use "params": {} to accept every generator default'));
  } else if (isObject(params)) {
    if (generator === "building.grammar@0") validateBuildingParams(out, `${path}.params`, params);
    else validateRoadParams(out, `${path}.params`, params);
  }

  validateBoxEnvelope(out, path, node["envelope"]);
  if (generator === "building.grammar@0") {
    validateHighriseEnvelope(out, path, node, isObject(params) ? params : {});
  }
  validateConstraints(out, path, node["constraints"], node["id"], connections);
  validatePorts(out, path, node["ports"]);
}

function validatePlazaNode(
  out: LoamDiagnostic[],
  path: string,
  node: Obj,
  connections: ConnectedRef[],
): void {
  unknownKeys(out, node, path, ["id", "kind", "envelope", "params", "constraints", "ports", "optional", "seedSalt", "tags"], "plaza node");
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
  unknownKeys(out, envelope, at, ["shape", "size", "minSize", "maxSize", "flexible", "rotations", "padding"], "structure envelope");

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
    if (isTier2(resolved.type)) {
      // `along` / `beside` — §4.4 and §4.9.6. Both bind to a route corridor
      // registered at substage 3b, so both are checked here and neither is a
      // W407 pass-through any more.
      validateAlong(out, at, resolved.type, c as Obj);
      continue;
    }

    if (!isTier1(resolved.type)) {
      out.push(
        warning(
          "CONSTRAINT_NOT_IMPLEMENTED",
          at,
          `"${resolved.type}" is a valid Loam v0.2 constraint that the layout solver does not implement yet; it is parsed and ignored`,
          `express the same intent with an implemented constraint if placement matters — the solver understands: zone, at, adjacent_to, distance, facing, not_overlapping, clearance, terrain_conform, connected`,
        ),
      );
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
      warning(
        "CONSTRAINT_NOT_IMPLEMENTED",
        at,
        '"oreChamber" is only dug on a mine gallery; this constraint asks for one on a ' +
          `${typeof styleValue === "string" ? `"${styleValue}"` : "dressed"} tunnel, and none will be`,
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
      warning(
        "CONSTRAINT_NOT_IMPLEMENTED",
        at,
        `"connected" with via "${kind}" is valid Loam v0.2, but this compiler only builds ${CONNECTED_VIA_IMPLEMENTED.join(", ")} connectors; the pair is still pulled together, and nothing is built between them`,
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
  // §4.4 `along` `spacing`: parsed, carried, and not enforced — the solver's
  // implicit `not_overlapping` plus `clearance` already keeps siblings apart,
  // and a second, corridor-relative spacing rule would fight it.
  if (c["spacing"] !== undefined) {
    out.push(
      warning(
        "CONSTRAINT_NOT_IMPLEMENTED",
        at,
        `"spacing" on an "${type}" constraint parses but is not enforced; sibling separation comes from "clearance" and the implicit "not_overlapping"`,
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
      if (typeof value === "string") {
        out.push(
          warning(
            "CONSTRAINT_NOT_IMPLEMENTED",
            at,
            `"at" was given the terrain anchor "${value}"; the solver only resolves the fractional [fx, fz] form so far`,
            'write "at": [0.4, 0.6] — fractions of the root region — until terrain-anchor placement lands',
          ),
        );
      } else {
        checkFractionalCoarse(out, at, "at", value);
      }
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
        ["flatten", "cut_fill", "drape", "terrace", "stilts", "float", "bury"],
        'the solver levels the ground under a footprint for "flatten"/"cut_fill"/"terrace" and leaves it alone otherwise',
      );
      const mode = c["mode"];
      if (typeof mode === "string" && ["drape", "stilts", "float", "bury"].includes(mode)) {
        out.push(
          warning(
            "CONSTRAINT_NOT_IMPLEMENTED",
            at,
            `terrain_conform mode "${mode}" parses but the solver treats it as "no ground adjustment" for now`,
            'use "cut_fill" (the default) or "flatten" if the node needs level ground under it',
          ),
        );
      }
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
          warning(
            "CONSTRAINT_NOT_IMPLEMENTED",
            at,
            `"on" was given "${target}"; this compiler resolves the terrain products ${ON_TARGETS.map((t) => `"@terrain:${t}"`).join(", ")}, and treats anything else as no restriction at all`,
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
    unknownKeys(out, raw, at, ["type", "face", "at", "width", "height", "tags"], `port "${name}"`);

    const type = raw["type"];
    if (typeof type !== "string" || !(V02_PORT_TYPES as readonly string[]).includes(type)) {
      out.push(
        error(
          "UNKNOWN_PORT_TYPE",
          at,
          `port "${name}" has type ${describe(type)}, which is not a Loam v0.2 port type`,
          `set "type" to one of: ${V02_PORT_TYPES.join(", ")} — a dropped port silently disconnects a world, so this is an error, not a warning`,
        ),
      );
    } else if (!(PORT_TYPES as readonly string[]).includes(type)) {
      out.push(
        warning(
          "PORT_FEATURE_NOT_IMPLEMENTED",
          at,
          `port type "${type}" is valid Loam v0.2 but this profile only resolves ${PORT_TYPES.join(" and ")} ports`,
          `use "door" for a pedestrian entrance or "road_stub" where a road meets the plot; "${type}" is parsed and carried, but no world position is resolved for it yet`,
        ),
      );
    }

    const face = raw["face"];
    if (face !== undefined) {
      if (typeof face !== "string" || !(V02_FACES as readonly string[]).includes(face)) {
        out.push(
          error(
            "BAD_PORT",
            at,
            `port "${name}" has face ${describe(face)}`,
            `set "face" to one of: ${V02_FACES.join(", ")} — faces are node-local and rotate with the solved yaw`,
          ),
        );
      } else if (!(HORIZONTAL_FACES as readonly string[]).includes(face)) {
        out.push(
          warning(
            "PORT_FEATURE_NOT_IMPLEMENTED",
            at,
            `port "${name}" declares face "${face}"; the solver resolves horizontal faces only`,
            `use one of: ${HORIZONTAL_FACES.join(", ")} — "auto"/"any" fall back to "south", and "up"/"down" ports get no resolved position yet`,
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

const BUILDING_FOOTPRINTS = ["rect", "l_shape", "t_shape", "u_shape", "cross", "courtyard", "irregular"] as const;
const BUILDING_INTERIORS = ["none", "open", "rooms", "hall", "warehouse"] as const;

function validateBuildingParams(out: LoamDiagnostic[], at: string, params: Obj): void {
  unknownKeys(
    out,
    params,
    at,
    [
      "floors", "floorHeight", "footprint", "bays", "roof", "roofPitch",
      "wallSymbol", "trimSymbol", "roofSymbol", "windowRhythm", "windowRatio",
      "entrance", "interior", "furnish", "basement", "tower", "variance", "decayOverride",
      "wing",
    ],
    "building.grammar@0 params",
  );
  checkNumbers(out, at, params, BUILDING_NUMS);
  validateBasementParam(out, at, params["basement"]);
  validateWingParam(out, at, params["wing"]);
  checkEnumParam(out, at, params, "footprint", BUILDING_FOOTPRINTS);
  checkEnumParam(out, at, params, "interior", BUILDING_INTERIORS);
  for (const key of ["roof", "windowRhythm", "wallSymbol", "trimSymbol", "roofSymbol"]) {
    const v = params[key];
    if (v !== undefined && typeof v !== "string") {
      out.push(error("STRUCTURE_PARAM", at, `"${key}" must be a string, got ${describe(v)}`, `set "${key}" to a name from the style vocabulary, or omit it to inherit from "style"`));
    }
  }
  for (const key of ["entrance", "tower"]) {
    const v = params[key];
    if (v !== undefined && !isObject(v)) {
      out.push(error("STRUCTURE_PARAM", at, `"${key}" must be an object, got ${describe(v)}`, key === "entrance" ? 'write "entrance": { "port": "door", "porch": false, "steps": true }' : 'write "tower": { "count": 2, "height": 12, "placement": "corner" }'));
    }
  }
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
export const CELLAR_STYLE_VALUES = ["plain", "crypt", "vault", "wine_cellar", "mine"] as const;

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
const JUNCTION_STYLES = ["plain", "plaza", "roundabout", "stairs"] as const;

function validateRoadParams(out: LoamDiagnostic[], at: string, params: Obj): void {
  unknownKeys(
    out,
    params,
    at,
    [
      "anchors", "pattern", "hierarchy", "blockSize", "maxGrade", "bridgeThreshold",
      "tunnelThreshold", "junctionStyle", "curvature", "crown", "lighting",
      // Profile shorthands for the single-class case, in the same spirit as the
      // terrain profile's flattened `terrain.edit@0` params: `width` is
      // `hierarchy[0].width` and `lanterns`/`lanternSpacing` are `lighting`.
      "width", "lanterns", "lanternSpacing",
    ],
    "road.network@0 params",
  );
  checkNumbers(out, at, params, {
    maxGrade: { min: 0, max: 4 },
    bridgeThreshold: { min: 0, max: 256, int: true },
    tunnelThreshold: { min: 0, max: 256, int: true },
    curvature: { min: 0, max: 1 },
    crown: { min: 0, max: 8, int: true },
    width: { min: 2, max: 3, int: true },
    lanternSpacing: { min: 4, max: 64, int: true },
  });
  checkBooleans(out, at, params, ["lanterns"]);
  checkEnumParam(out, at, params, "pattern", ROAD_PATTERNS);
  checkEnumParam(out, at, params, "junctionStyle", JUNCTION_STYLES);

  const anchors = params["anchors"];
  if (anchors === undefined) {
    out.push(
      error(
        "STRUCTURE_PARAM",
        at,
        'road.network@0 needs "anchors" — the nodes or ports the network must reach',
        'add "anchors": ["town_hall", "#tag:house"] — selectors naming what the roads connect',
      ),
    );
  } else if (!Array.isArray(anchors) || anchors.length === 0 || anchors.some((a) => typeof a !== "string")) {
    out.push(error("STRUCTURE_PARAM", at, `"anchors" must be a non-empty array of selector strings, got ${describe(anchors)}`, 'write "anchors": ["town_hall", "#tag:house"]'));
  }

  const blockSize = params["blockSize"];
  if (blockSize !== undefined && (!Array.isArray(blockSize) || blockSize.length !== 2 || blockSize.some((v) => typeof v !== "number" || !Number.isInteger(v) || v < 4))) {
    out.push(error("STRUCTURE_PARAM", at, `"blockSize" must be [x, z] integers of at least 4, got ${describe(blockSize)}`, 'write "blockSize": [24, 24] — the city-block size the grid pattern aims for'));
  }

  const hierarchy = params["hierarchy"];
  if (hierarchy !== undefined) {
    if (!Array.isArray(hierarchy)) {
      out.push(error("STRUCTURE_PARAM", at, `"hierarchy" must be an array of road classes, got ${describe(hierarchy)}`, 'write "hierarchy": [{ "class": "main", "width": 7 }, { "class": "lane", "width": 3 }] — widest first'));
    } else {
      for (const [i, entry] of hierarchy.entries()) {
        const where = `${at}.hierarchy[${i}]`;
        if (!isObject(entry)) {
          out.push(error("STRUCTURE_PARAM", where, `each hierarchy entry must be an object, got ${describe(entry)}`, 'write { "class": "main", "width": 7, "surface": "@road.surface" }'));
          continue;
        }
        unknownKeys(out, entry, where, ["class", "width", "surface", "edge", "maxGrade", "connects"], "a road class");
        if (typeof entry["class"] !== "string") {
          out.push(error("STRUCTURE_PARAM", where, `a road class needs a string "class", got ${describe(entry["class"])}`, 'name the class, e.g. "class": "main"'));
        }
        checkNumbers(out, where, entry, { width: { min: 1, max: 32, int: true }, maxGrade: { min: 0, max: 4 } });
      }
    }
  }

  const lighting = params["lighting"];
  if (lighting !== undefined && !isObject(lighting)) {
    out.push(error("STRUCTURE_PARAM", at, `"lighting" must be an object, got ${describe(lighting)}`, 'write "lighting": { "spacing": 12, "symbol": "@light.wall" }'));
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
] as const;

/** Params a `prop.place@0` node may carry. */
const PROP_PARAM_KEYS = [
  // What to build.
  "prop",
  // Coarse placement — the same vocabulary every profile node speaks.
  "zone",
  "at",
  "jitter",
  "yaw",
  // Per-prop geometry.
  "length",
  "width",
  "curve",
  "grade",
  "platform",
  "on",
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

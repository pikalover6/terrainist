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
  canonicalize,
  isTier1,
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
      validatePlazaNode(out, childPath, raw);
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
      validateStructureNode(out, childPath, raw);
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
          `use one of: ${[...PROFILE_GENERATORS.filter((g) => !(SETTLEMENT_EXCLUDED_GENERATORS as readonly string[]).includes(g)), ...STRUCTURE_GENERATORS].join(", ")}`,
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

function validateStructureNode(out: LoamDiagnostic[], path: string, node: Obj): void {
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
  validateConstraints(out, path, node["constraints"]);
  validatePorts(out, path, node["ports"]);
}

function validatePlazaNode(out: LoamDiagnostic[], path: string, node: Obj): void {
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

  validateConstraints(out, path, node["constraints"]);
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

function validateConstraints(out: LoamDiagnostic[], path: string, constraints: unknown): void {
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

    if (!isTier1(resolved.type)) {
      out.push(
        warning(
          "CONSTRAINT_NOT_IMPLEMENTED",
          at,
          `"${resolved.type}" is a valid Loam v0.2 constraint that the layout solver does not implement yet; it is parsed and ignored`,
          `express the same intent with an implemented constraint if placement matters — the solver understands: zone, at, adjacent_to, distance, facing, not_overlapping, clearance, terrain_conform`,
        ),
      );
      continue;
    }
    validateTier1(out, at, resolved.type, c as Obj);
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
  basement: { min: 0, max: 8, int: true },
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
    ],
    "building.grammar@0 params",
  );
  checkNumbers(out, at, params, BUILDING_NUMS);
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

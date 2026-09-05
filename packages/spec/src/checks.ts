/**
 * Shared low-level validator helpers.
 *
 * Extracted from `terrain/validate.ts` when the settlement profile arrived and
 * needed exactly the same rejection style: every failure carries a fix hint
 * specific enough to hand straight to an authoring LLM. Behaviour is unchanged
 * from the terrain-only version — these functions moved, they did not change.
 */

import { type LoamDiagnostic, error } from "./terrain/diagnostics.js";
import { ID_PATTERN, ZONE_TOKENS, type ZoneToken } from "./terrain/types.js";

/** A plain JSON object. */
export type Obj = Record<string, unknown>;

/** Keys accepted on every node, everywhere. */
const ALWAYS_ALLOWED = ["label", "note"] as const;

/** True for a non-null, non-array object. */
export function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Numeric-parameter schema entry. */
export interface NumSpec {
  readonly min?: number;
  readonly max?: number;
  readonly int?: boolean;
}

/** Human description of an arbitrary JSON value, for diagnostic messages. */
export function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === "object") return "an object";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

/** Reject keys outside `allowed` (plus `label`/`note`). */
export function unknownKeys(
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

/** Require a valid Loam id. */
export function checkId(
  out: LoamDiagnostic[],
  parentPath: string,
  id: unknown,
  what: string,
): void {
  if (typeof id !== "string") {
    out.push(
      error(
        "MISSING_KEY",
        parentPath,
        `${what} has no string "id", got ${describe(id)}`,
        'give the node an "id" such as "the_divide" — ids name features and key their seeds',
      ),
    );
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

/** Require one of the nine zone tokens. */
export function checkZone(
  out: LoamDiagnostic[],
  path: string,
  key: string,
  value: unknown,
): void {
  if (typeof value !== "string" || !(ZONE_TOKENS as readonly string[]).includes(value as ZoneToken)) {
    out.push(
      error(
        "BAD_ENUM",
        path,
        `"${key}" must be a nine-grid zone token, got ${describe(value)}`,
        `set "${key}" to one of: ${ZONE_TOKENS.join(", ")}`,
      ),
    );
  }
}

/** Require a fractional `[fx, fz] ∈ [0,1]²` pair. */
export function checkFractional(
  out: LoamDiagnostic[],
  path: string,
  key: string,
  value: unknown,
): void {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number"
  ) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"${key}" must be [fx, fz], got ${describe(value)}`,
        `write "${key}": [0.5, 0.5] — fractional coordinates of the region, never absolute blocks`,
      ),
    );
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

/** Range/type-check every numeric key named by `specs` that is present. */
export function checkNumbers(
  out: LoamDiagnostic[],
  path: string,
  obj: Obj,
  specs: Readonly<Record<string, NumSpec>>,
): void {
  for (const [key, spec] of Object.entries(specs)) {
    const value = obj[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      out.push(
        error(
          "BAD_TYPE",
          path,
          `"${key}" must be a finite number, got ${describe(value)}`,
          `set "${key}" to a number${spec.min !== undefined ? ` in ${spec.min}..${spec.max ?? "∞"}` : ""}`,
        ),
      );
      continue;
    }
    if (spec.int && !Number.isInteger(value)) {
      out.push(
        error(
          "PARAM_OUT_OF_RANGE",
          path,
          `"${key}" must be a whole number, got ${value}`,
          `round "${key}" to an integer, e.g. ${Math.round(value)}`,
        ),
      );
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

/** Require JSON booleans for the named keys, when present. */
export function checkBooleans(
  out: LoamDiagnostic[],
  path: string,
  obj: Obj,
  keys: readonly string[],
): void {
  for (const key of keys) {
    const value = obj[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      out.push(
        error(
          "BAD_TYPE",
          path,
          `"${key}" must be true or false, got ${describe(value)}`,
          `set "${key}": true or "${key}": false (JSON booleans, not strings)`,
        ),
      );
    }
  }
}

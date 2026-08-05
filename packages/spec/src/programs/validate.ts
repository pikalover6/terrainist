/**
 * Validation for the document-level `programs` map and the two ways a node
 * refers into it.
 *
 * Same style as every other validator here: hand-rolled, never throwing, never
 * stopping at the first problem, every rejection carrying a fix hint specific
 * enough to hand straight to the authoring model.
 *
 * What this file does *not* do is execute anything. Hash verification, the
 * sandbox and the five-step gate live in `@terrainist/compiler`; the spec
 * package owns what is legal to write down.
 */

import { describe, isObject, unknownKeys, type Obj } from "../checks.js";
import { error, hasErrors, warning, type LoamDiagnostic } from "../terrain/diagnostics.js";
import { ID_PATTERN, ZONE_TOKENS } from "../terrain/types.js";
import { lintProgramSource, sourceFindingsToDiagnostics } from "./lint.js";
import type { PendingPrograms } from "./requests.js";
import {
  PROGRAMS_KEY,
  PROGRAM_KEYS,
  PROGRAM_LIMITS,
  PROGRAM_MODES,
  EMBED_DEPTH_RANGE,
  HOVER_RANGE,
  LANDMARK_PARAM_KEYS,
  SEAT_POLICIES,
  PROGRAM_SCATTER_KEYS,
  allowsLandmark,
  allowsPlugin,
  authoredProgramId,
  type AuthoredProgramRecord,
  type ProgramMap,
  type ProgramMode,
  type ProgramScatterParams,
} from "./types.js";

/** Result of validating a `programs` map. */
export interface ProgramMapValidation {
  readonly diagnostics: readonly LoamDiagnostic[];
  /** Present only when no `error` diagnostic was produced. */
  readonly programs?: ProgramMap;
}

const HASH_PATTERN = /^b3:[0-9a-f]{16,64}$/;

/**
 * Validate the document-level `programs` map.
 *
 * `undefined` is always fine and yields an empty map: a document with no
 * bespoke tier is the common case and must cost nothing.
 */
export function validateProgramMap(
  input: unknown,
  path = PROGRAMS_KEY,
): ProgramMapValidation {
  const out: LoamDiagnostic[] = [];
  if (input === undefined) return { diagnostics: out, programs: Object.freeze({}) };
  if (!isObject(input)) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        path,
        `"${PROGRAMS_KEY}" must be an object mapping program id to program, got ${describe(input)}`,
        'write "programs": { "earth_god_statue": { "mode": "landmark", … } } — or omit the key entirely',
      ),
    );
    return { diagnostics: out };
  }

  const programs: Record<string, AuthoredProgramRecord> = {};
  for (const [id, value] of Object.entries(input)) {
    const at = `${path}.${id}`;
    if (!ID_PATTERN.test(id)) {
      out.push(
        error(
          "PROGRAM_SCHEMA",
          at,
          `program id ${JSON.stringify(id)} is not a Loam id`,
          "use lowercase letters, digits and underscores, starting with a letter — e.g. \"earth_god_statue\"",
        ),
      );
      continue;
    }
    const record = validateProgram(out, value, at, id);
    if (record !== undefined) programs[id] = record;
  }

  if (hasErrors(out)) return { diagnostics: out };
  return { diagnostics: out, programs: Object.freeze(programs) };
}

/** Validate one `programs` map entry. */
export function validateProgram(
  out: LoamDiagnostic[],
  value: unknown,
  path: string,
  id: string,
): AuthoredProgramRecord | undefined {
  if (!isObject(value)) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        path,
        `program ${JSON.stringify(id)} must be an object, got ${describe(value)}`,
        `give it ${PROGRAM_KEYS.join(", ")}`,
      ),
    );
    return undefined;
  }
  unknownKeys(out, value, path, [...PROGRAM_KEYS], "an authored program");

  const before = out.length;
  const mode = readMode(out, value, path, id);
  const envelope = readEnvelope(out, value, path, id);
  const source = readSource(out, value, path, id);
  const sourceHash = readHash(out, value["sourceHash"], `${path}.sourceHash`, id);
  const outputHash = readHash(out, value["outputHash"], `${path}.outputHash`, id);

  if (source !== undefined) {
    out.push(
      ...sourceFindingsToDiagnostics(lintProgramSource(source), path, id),
    );
  }
  if (out.length !== before) return undefined;
  return {
    mode: mode as ProgramMode,
    envelope: envelope as readonly [number, number, number],
    source: source as string,
    sourceHash: sourceHash as string,
    outputHash: outputHash as string,
  };
}

function readMode(out: LoamDiagnostic[], obj: Obj, path: string, id: string): ProgramMode | undefined {
  const mode = obj["mode"];
  if (typeof mode !== "string" || !(PROGRAM_MODES as readonly string[]).includes(mode)) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        `${path}.mode`,
        `program ${JSON.stringify(id)} has mode ${describe(mode)}`,
        `use one of: ${PROGRAM_MODES.join(", ")} — "landmark" is invoked once, "plugin" is invoked N times by scatter.program@0`,
      ),
    );
    return undefined;
  }
  return mode as ProgramMode;
}

function readEnvelope(
  out: LoamDiagnostic[],
  obj: Obj,
  path: string,
  id: string,
): readonly [number, number, number] | undefined {
  const at = `${path}.envelope`;
  const value = obj["envelope"];
  if (!Array.isArray(value) || value.length !== 3) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        at,
        `program ${JSON.stringify(id)} must declare "envelope": [w, h, d], got ${describe(value)}`,
        'write the node-local size the program needs, e.g. "envelope": [34, 52, 30]',
      ),
    );
    return undefined;
  }
  const dims = value as unknown[];
  for (const [i, dim] of dims.entries()) {
    if (typeof dim !== "number" || !Number.isInteger(dim) || dim < 1 || dim > PROGRAM_LIMITS.maxEnvelopeEdge) {
      out.push(
        error(
          "PROGRAM_SCHEMA",
          at,
          `envelope[${i}] is ${describe(dim)}`,
          `each edge is a whole number of blocks in 1..${PROGRAM_LIMITS.maxEnvelopeEdge}`,
        ),
      );
      return undefined;
    }
  }
  const [w, h, d] = dims as [number, number, number];
  if (w * h * d > PROGRAM_LIMITS.maxEnvelopeVolume) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        at,
        `envelope volume ${w * h * d} exceeds the ${PROGRAM_LIMITS.maxEnvelopeVolume} block cap`,
        "declare a smaller envelope; a program that needs more than this is a district, not a landmark",
      ),
    );
    return undefined;
  }
  return [w, h, d];
}

function readSource(out: LoamDiagnostic[], obj: Obj, path: string, id: string): string | undefined {
  const at = `${path}.source`;
  const source = obj["source"];
  if (typeof source !== "string" || source.trim().length === 0) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        at,
        `program ${JSON.stringify(id)} carries no source text`,
        "the source is the canonical artifact — the document carries the program, not an expansion of it",
      ),
    );
    return undefined;
  }
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > PROGRAM_LIMITS.maxSourceBytes) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        at,
        `source is ${bytes} bytes, over the ${PROGRAM_LIMITS.maxSourceBytes} byte cap`,
        "shorten the program — compute the repetitive parts in a loop instead of writing them out",
      ),
    );
    return undefined;
  }
  return source;
}

function readHash(
  out: LoamDiagnostic[],
  value: unknown,
  path: string,
  id: string,
): string | undefined {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        path,
        `program ${JSON.stringify(id)} has ${describe(value)} where a "b3:<hex>" digest belongs`,
        "the authoring gate records both hashes; a document written by hand has to run the gate to get them",
      ),
    );
    return undefined;
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* references into the map                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Check a node's `generator: "authored:<id>"` reference against the map.
 *
 * `envelopeDeclared` says the node also carried its own `envelope`, which the
 * program's declaration outranks (`W330`) — the solver reserves what the
 * program says it needs, because the program is the thing that knows.
 */
export function validateAuthoredReference(
  out: LoamDiagnostic[],
  generator: unknown,
  programs: ProgramMap,
  nodePath: string,
  options: { readonly envelopeDeclared?: boolean; readonly pending?: PendingPrograms } = {},
): AuthoredProgramRecord | undefined {
  const id = authoredProgramId(generator);
  if (id === undefined) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        nodePath,
        `${describe(generator)} is not a well-formed authored generator reference`,
        'write "generator": "authored:<id>" naming a key of the document\'s "programs" map',
      ),
    );
    return undefined;
  }
  const program = programs[id];
  if (program === undefined) {
    // The reference may still be legal: during initial authoring the document
    // *requests* its bespoke programs in `intent.character.programs` and the
    // map is attached by a later phase. A reference to a requested id is a
    // promise, not a mistake — so it validates, with no record to return.
    const pendingMode = options.pending?.get(id);
    if (pendingMode !== undefined) {
      if (!allowsLandmark(pendingMode)) {
        out.push(
          error(
            "PROGRAM_SCHEMA",
            nodePath,
            `program ${JSON.stringify(id)} is requested with mode "${pendingMode}" and cannot be invoked as a landmark`,
            'invoke it through scatter.program@0, or request it with "mode": "both"',
          ),
        );
      }
      // No PROGRAM_ENVELOPE_OVERRIDDEN here: until the program exists, the
      // node's own envelope is the only size hint anything has.
      return undefined;
    }
    out.push(
      error(
        "PROGRAM_SCHEMA",
        nodePath,
        `no program ${JSON.stringify(id)} in the document's "programs" map, and no request for it in "intent.character.programs"`,
        `known programs: ${Object.keys(programs).join(", ") || "(none)"} — either name one the document carries, or request it in "intent.character.programs": [{ "id": ${JSON.stringify(id)}, "mode": "landmark", "brief": "…" }]`,
      ),
    );
    return undefined;
  }
  if (!allowsLandmark(program.mode)) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        nodePath,
        `program ${JSON.stringify(id)} is mode "${program.mode}" and cannot be invoked as a landmark`,
        'invoke it through scatter.program@0, or author it with "mode": "both"',
      ),
    );
    return undefined;
  }
  if (options.envelopeDeclared === true) {
    out.push(
      warning(
        "PROGRAM_ENVELOPE_OVERRIDDEN",
        nodePath,
        `this node declares an envelope; program ${JSON.stringify(id)} declares [${program.envelope.join(", ")}] and the program wins`,
        'drop the node\'s "envelope" — the program is what knows how much room it needs',
      ),
    );
  }
  return program;
}

/** Validate `scatter.program@0` params against the map. */
export function validateProgramScatterParams(
  out: LoamDiagnostic[],
  params: unknown,
  programs: ProgramMap,
  nodePath: string,
  pending?: PendingPrograms,
): ProgramScatterParams | undefined {
  const path = `${nodePath}.params`;
  if (!isObject(params)) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        path,
        `scatter.program@0 needs params, got ${describe(params)}`,
        'write "params": { "program": "ufo_lander", "count": 24, "area": { "zone": "north" }, "spacing": 40 }',
      ),
    );
    return undefined;
  }
  unknownKeys(out, params, path, [...PROGRAM_SCATTER_KEYS], "scatter.program@0");

  const before = out.length;
  const id = params["program"];
  let program: AuthoredProgramRecord | undefined;
  // A requested-but-not-yet-authored id is legal here for the same reason it
  // is legal on an `authored:` reference — see validateAuthoredReference.
  let pendingMode: ProgramMode | undefined;
  if (typeof id === "string" && programs[id] === undefined) pendingMode = pending?.get(id);
  if (pendingMode !== undefined) {
    if (!allowsPlugin(pendingMode)) {
      out.push(
        error(
          "PROGRAM_SCHEMA",
          `${path}.program`,
          `program ${JSON.stringify(id)} is requested with mode "${pendingMode}" and cannot be scattered`,
          'request it with "mode": "plugin" or "both", or invoke it once as a landmark node',
        ),
      );
    }
  } else if (typeof id !== "string" || programs[id] === undefined) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        `${path}.program`,
        `scatter.program@0 names ${describe(id)}, which is neither a key of "programs" nor a request in "intent.character.programs"`,
        `known programs: ${Object.keys(programs).join(", ") || "(none)"} — or request it in "intent.character.programs": [{ "id": "…", "mode": "plugin", "brief": "…" }]`,
      ),
    );
  } else {
    program = programs[id];
    if (!allowsPlugin(program.mode)) {
      out.push(
        error(
          "PROGRAM_SCHEMA",
          `${path}.program`,
          `program ${JSON.stringify(id)} is mode "${program.mode}" and cannot be scattered`,
          'author it with "mode": "plugin" or "both", or invoke it once as a landmark node',
        ),
      );
    }
  }

  const count = params["count"];
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 512) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        `${path}.count`,
        `"count" is ${describe(count)}`,
        "give a whole number of instances in 1..512; the placer may return fewer if the ground refuses them",
      ),
    );
  }

  checkArea(out, params["area"], `${path}.area`);
  num(out, params["spacing"], `${path}.spacing`, 1, 512, "blocks between two instance footprints");
  num(out, params["maxSlope"], `${path}.maxSlope`, 0, 89, "degrees of ground slope a site tolerates");
  num(out, params["maxRelief"], `${path}.maxRelief`, 0, 64, "blocks of relief across the footprint");
  checkElevation(out, params["elevation"], `${path}.elevation`);
  checkTags(out, params["avoidTags"], `${path}.avoidTags`);
  // A scatter hovers the same way a landmark does — every instance floats over
  // its own footprint — so the same two checks, and the same exclusion.
  const hovering = checkHover(out, params, path, "instance");
  checkSeat(out, params, path, hovering);

  if (out.length !== before || (program === undefined && pendingMode === undefined)) return undefined;
  return params as unknown as ProgramScatterParams;
}

function checkArea(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    out.push(
      error("PROGRAM_SCHEMA", path, `"area" is ${describe(value)}`, 'use { "zone": "north" }, { "at": [fx, fz], "radius": r } or { "all": true }'),
    );
    return;
  }
  if ("zone" in value) {
    if (typeof value["zone"] !== "string" || !(ZONE_TOKENS as readonly string[]).includes(value["zone"])) {
      out.push(
        error("UNKNOWN_ZONE", path, `"zone" is ${describe(value["zone"])}`, `use one of: ${ZONE_TOKENS.join(", ")}`),
      );
    }
    return;
  }
  if ("all" in value) {
    if (value["all"] !== true) {
      out.push(error("PROGRAM_SCHEMA", path, `"all" is ${describe(value["all"])}`, 'write { "all": true } or drop "area" entirely'));
    }
    return;
  }
  const at = value["at"];
  if (!Array.isArray(at) || at.length !== 2 || at.some((v) => typeof v !== "number" || v < 0 || v > 1)) {
    out.push(
      error("COARSE_COORD_RANGE", path, `"at" is ${describe(at)}`, 'use fractional region coordinates, e.g. "at": [0.3, 0.7]'),
    );
  }
  num(out, value["radius"], `${path}.radius`, 0.01, 1, "fraction of the region radius the instances spread over");
}

function checkElevation(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length !== 2 || value.some((v) => typeof v !== "number")) {
    out.push(
      error("PROGRAM_SCHEMA", path, `"elevation" is ${describe(value)}`, 'write "elevation": [yMin, yMax] in absolute world Y'),
    );
    return;
  }
  const [lo, hi] = value as [number, number];
  if (lo > hi) {
    out.push(error("PROGRAM_SCHEMA", path, `"elevation" is empty: [${lo}, ${hi}]`, "write the lower bound first"));
  }
}

function checkTags(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    out.push(
      error("PROGRAM_SCHEMA", path, `"avoidTags" is ${describe(value)}`, 'write a list of occupancy tags, e.g. "avoidTags": ["settlement", "road"]'),
    );
  }
}

function num(
  out: LoamDiagnostic[],
  value: unknown,
  path: string,
  min: number,
  max: number,
  meaning: string,
): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    out.push(
      error(
        "PARAM_OUT_OF_RANGE",
        path,
        `expected ${min}..${max}, got ${describe(value)}`,
        `${meaning}; keep it inside ${min}..${max}`,
      ),
    );
  }
}

/**
 * Validate the `params` of an `authored:<id>` landmark node.
 *
 * A landmark node takes no generator params in general — its geometry is the
 * program's business — so the one key here is placement: `hover`, the number
 * of blocks between the highest ground under the footprint and the program's
 * node-local `y = 0`. Anything below {@link HOVER_RANGE}`.min` would read as
 * ground clutter rather than as an airborne thing, so it is rejected outright.
 */
export function validateLandmarkParams(
  out: LoamDiagnostic[],
  params: unknown,
  nodePath: string,
): void {
  if (params === undefined) return;
  const path = `${nodePath}.params`;
  if (!isObject(params)) {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        path,
        `an authored: landmark node's params must be an object, got ${describe(params)}`,
        'write "params": { "hover": 48 }, or drop "params" entirely',
      ),
    );
    return;
  }
  unknownKeys(out, params, path, [...LANDMARK_PARAM_KEYS], "an authored: landmark node");
  const hovering = checkHover(out, params, path, "landmark");
  checkSeat(out, params, path, hovering);
}

/**
 * `hover`, shared by a landmark node and `scatter.program@0`.
 *
 * `subject` is what floats — one `"landmark"`, or each scattered `"instance"`
 * — so the fix text names the thing the author wrote. Returns true when the
 * params carry a `hover` at all, malformed or not: a document that asked to
 * float and also asked to seat is wrong either way, and saying so once beats
 * saying nothing because the altitude was also out of range.
 */
function checkHover(
  out: LoamDiagnostic[],
  params: Obj,
  path: string,
  subject: "landmark" | "instance",
): boolean {
  const hover = params["hover"];
  if (hover === undefined) return false;
  if (typeof hover !== "number" || !Number.isInteger(hover) || hover < HOVER_RANGE.min || hover > HOVER_RANGE.max) {
    out.push(
      error(
        "PARAM_OUT_OF_RANGE",
        `${path}.hover`,
        `"hover" must be an integer ${HOVER_RANGE.min}..${HOVER_RANGE.max}, got ${describe(hover)}`,
        `hover floats the ${subject} that many blocks above the highest ground under its footprint; below ${HOVER_RANGE.min} it reads as ground clutter, so seat it on the ground by dropping "hover" instead`,
      ),
    );
  }
  return true;
}

/**
 * `seat` / `embedDepth`, shared by a landmark node and `scatter.program@0`.
 *
 * `hovering` says the same params also carried a `hover`, which is the one
 * combination that cannot mean anything: a thing cannot both float and meet
 * the ground.
 */
function checkSeat(
  out: LoamDiagnostic[],
  params: Obj,
  path: string,
  hovering: boolean,
): void {
  const seat = params["seat"];
  const depth = params["embedDepth"];
  if (seat !== undefined) {
    if (typeof seat !== "string" || !(SEAT_POLICIES as readonly string[]).includes(seat)) {
      out.push(
        error(
          "BAD_ENUM",
          `${path}.seat`,
          `"seat" is ${describe(seat)}`,
          `use one of: ${SEAT_POLICIES.join(", ")} — "pad" seats it on a levelled plane, "embed" sinks it into the ground, "drape" lets the program follow the terrain itself`,
        ),
      );
    } else if (hovering) {
      out.push(
        error(
          "PROGRAM_SCHEMA",
          `${path}.seat`,
          `this node asks for both "hover" and "seat": "${seat}" — a thing that floats does not meet the ground`,
          'keep "hover" for something airborne, or drop it and keep "seat"',
        ),
      );
    }
  }
  if (depth === undefined) return;
  if (
    typeof depth !== "number" ||
    !Number.isInteger(depth) ||
    depth < EMBED_DEPTH_RANGE.min ||
    depth > EMBED_DEPTH_RANGE.max
  ) {
    out.push(
      error(
        "PARAM_OUT_OF_RANGE",
        `${path}.embedDepth`,
        `"embedDepth" must be an integer ${EMBED_DEPTH_RANGE.min}..${EMBED_DEPTH_RANGE.max}, got ${describe(depth)}`,
        `embedDepth is how many blocks below the ground plane the structure sinks; keep it inside ${EMBED_DEPTH_RANGE.min}..${EMBED_DEPTH_RANGE.max}`,
      ),
    );
    return;
  }
  if (seat !== "embed") {
    out.push(
      error(
        "PROGRAM_SCHEMA",
        `${path}.embedDepth`,
        `"embedDepth" only means something with "seat": "embed", and this node's seat is ${describe(seat)}`,
        'write "seat": "embed" beside it, or drop "embedDepth"',
      ),
    );
  }
}

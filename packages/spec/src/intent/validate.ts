/**
 * Validation for `intent` blocks.
 *
 * Same style as every other validator in this package: hand-rolled, never
 * throwing, never stopping at the first problem, and every rejection carries a
 * `fix` hint specific enough to hand straight to an authoring model — because
 * that is exactly where these go.
 *
 * Two entry points. {@link validateIntent} checks one `intent` object against
 * the contract's schema. {@link validateIntentPlacement} walks a raw document
 * and checks *where* intent was written: legal on the root composite, on a
 * `composite`, `district` or `city` node, and nowhere else (`LOAM-W481`,
 * warned and ignored rather than fatal — an ignored dial should not cost a
 * world its compile). Below district depth the table is thinner, which is a
 * note (`LOAM-I482`), not a complaint.
 */

import { describe, isObject, unknownKeys, type Obj } from "../checks.js";
import { DISTRICT_FABRICS, DISTRICT_GROUND_POLICIES } from "../settlement/types.js";
import { error, hasErrors, note, warning, type LoamDiagnostic } from "../terrain/diagnostics.js";
import { validatePaletteMap } from "../terrain/validate.js";
import {
  CHARACTER_KEYS,
  ERA_CLASSES,
  BLEND_WIDTHS,
  EVENT_KINDS,
  FORTIFICATIONS,
  INTENT_KEY,
  INTENT_KEYS,
  INTENT_NODE_KINDS,
  INTENT_TABLE_DEPTH,
  MASSING_STYLES,
  ROOF_TYPES,
  SNOW_POLICIES,
  WINDOW_RHYTHMS,
  eraClassOf,
  type SemanticIntent,
} from "./types.js";

/** Result of validating a standalone intent object (the authoring pre-pass). */
export interface IntentValidation {
  readonly diagnostics: readonly LoamDiagnostic[];
  /** Present only when no `error` diagnostic was produced. */
  readonly intent?: SemanticIntent;
}

/**
 * Validate a candidate intent object on its own.
 *
 * Used by the authoring pre-pass, which gets one JSON object back from a cheap
 * model and has to decide whether to keep it or ask again.
 */
export function validateIntentValue(input: unknown, path = INTENT_KEY): IntentValidation {
  const out: LoamDiagnostic[] = [];
  validateIntent(out, input, path);
  if (hasErrors(out)) return { diagnostics: out };
  return { diagnostics: out, intent: (input ?? {}) as SemanticIntent };
}

/** Validate one `intent` object in place. `undefined` is always fine. */
export function validateIntent(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"intent" must be an object, got ${describe(value)}`,
        'use "intent": { "era": "medieval", "wealth": 0.4 } — or omit it entirely, which means "no opinion"',
      ),
    );
    return;
  }
  unknownKeys(out, value, path, [...INTENT_KEYS], "intent");

  checkEra(out, value["era"], path);
  dial(out, value["wealth"], `${path}.wealth`, "0 = destitute, 0.5 = ordinary, 1 = rich");
  dial(out, value["decline"], `${path}.decline`, "0 = kept up, 1 = abandoned");
  dial(out, value["formality"], `${path}.formality`, "0 = organic vernacular, 1 = planned and monumental");
  checkEvent(out, value["event"], `${path}.event`);
  checkClimate(out, value["climate"], `${path}.climate`);
  checkCharacter(out, value["character"], `${path}.character`);
  checkTokens(out, value["tokens"], `${path}.tokens`);
}

/**
 * Walk a raw document and check where `intent` was written.
 *
 * Deliberately raw-object based and profile-agnostic: both validators call it
 * with the document they were handed, before either has narrowed anything.
 */
export function validateIntentPlacement(out: LoamDiagnostic[], input: unknown): void {
  if (!isObject(input)) return;
  validateIntent(out, input[INTENT_KEY], INTENT_KEY);

  const root = input["root"];
  if (!isObject(root)) return;
  walk(out, root, typeof root["id"] === "string" ? root["id"] : "root", 0);
}

function walk(out: LoamDiagnostic[], node: Obj, path: string, depth: number): void {
  const raw = node[INTENT_KEY];
  if (raw !== undefined) {
    const kind = node["kind"];
    if (typeof kind !== "string" || !(INTENT_NODE_KINDS as readonly string[]).includes(kind)) {
      out.push(
        warning(
          "INTENT_NOT_ALLOWED",
          path,
          `"intent" on a ${typeof kind === "string" ? `"${kind}"` : "kind-less"} node is ignored — intent is a context, carried by the root, a composite, a district or a city`,
          'move this "intent" up to the enclosing district, city or composite node; a per-building override is what "params" are for',
        ),
      );
    } else {
      validateIntent(out, raw, `${path}.intent`);
      if (depth > INTENT_TABLE_DEPTH) {
        out.push(
          note(
            "INTENT_TOO_DEEP",
            path,
            `"intent" declared at depth ${depth}; the fan-out table is written for three levels — world, region, district`,
            "declare this intent on the enclosing district, city or region node, where every row of the table is meaningful",
          ),
        );
      }
    }
  }

  const children = node["children"];
  if (!Array.isArray(children)) return;
  for (const [index, child] of children.entries()) {
    if (!isObject(child)) continue;
    const id = typeof child["id"] === "string" ? child["id"] : `children[${index}]`;
    walk(out, child, `${path}.${id}`, depth + 1);
  }
}

/* -------------------------------------------------------------------------- */
/* field checks                                                                */
/* -------------------------------------------------------------------------- */

function checkEra(out: LoamDiagnostic[], era: unknown, path: string): void {
  if (era === undefined) return;
  if (typeof era !== "string" || era.trim() === "") {
    out.push(
      error(
        "BAD_TYPE",
        `${path}.era`,
        `"era" must be a non-empty string, got ${describe(era)}`,
        'use a word for the period, e.g. "medieval", "victorian", "far_future" — the vocabulary is open',
      ),
    );
    return;
  }
  if (eraClassOf(era) === undefined) {
    out.push(
      warning(
        "INTENT_ERA_UNKNOWN",
        `${path}.era`,
        `era "${era}" is not in the dispatch table, so it resolves to "medieval"`,
        `keep the word if it is what the world is about — it still reaches prompts — or use one that dispatches: ${ERA_CLASSES.join(", ")}`,
      ),
    );
  }
}

function dial(out: LoamDiagnostic[], value: unknown, path: string, meaning: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    out.push(
      error(
        "PARAM_OUT_OF_RANGE",
        path,
        `a dial must be a number in 0..1, got ${describe(value)}`,
        `set it in 0..1 (${meaning}) — or omit it, which means "no opinion" and is never the same as 0`,
      ),
    );
  }
}

function signed(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < -1 || value > 1) {
    out.push(
      error(
        "PARAM_OUT_OF_RANGE",
        path,
        `must be a number in −1..1, got ${describe(value)}`,
        "use a small offset such as 0.2 (warmer/wetter) or −0.3 (colder/drier); it shifts the climate field, it does not replace it",
      ),
    );
  }
}

function checkEvent(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"event" must be an object, got ${describe(value)}`,
        'use "event": { "kind": "fire", "severity": 0.6, "recency": 0.2 }',
      ),
    );
    return;
  }
  unknownKeys(out, value, path, ["kind", "severity", "recency"], "intent.event");
  const kind = value["kind"];
  if (typeof kind !== "string" || !(EVENT_KINDS as readonly string[]).includes(kind)) {
    out.push(
      error(
        "BAD_ENUM",
        `${path}.kind`,
        `"kind" must be one of ${EVENT_KINDS.join(", ")}, got ${describe(kind)}`,
        `set "kind" to one of: ${EVENT_KINDS.join(", ")}`,
      ),
    );
  }
  dial(out, value["severity"], `${path}.severity`, "0 = barely marked, 1 = devastating");
  dial(out, value["recency"], `${path}.recency`, "0 = happening now, 1 = a lifetime ago");
}

function checkClimate(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"climate" must be an object, got ${describe(value)}`,
        'use "climate": { "biome": "minecraft:jungle", "snow": "never" }',
      ),
    );
    return;
  }
  unknownKeys(out, value, path, ["biome", "temperature", "humidity", "snow", "blend"], "intent.climate");
  const biome = value["biome"];
  if (biome !== undefined && (typeof biome !== "string" || biome.trim() === "")) {
    out.push(
      error(
        "BAD_TYPE",
        `${path}.biome`,
        `"biome" must be a biome id string, got ${describe(biome)}`,
        'use a vanilla biome id such as "minecraft:jungle", or a "style.biomeThemes" id',
      ),
    );
  }
  signed(out, value["temperature"], `${path}.temperature`);
  signed(out, value["humidity"], `${path}.humidity`);
  const snow = value["snow"];
  if (snow !== undefined && (typeof snow !== "string" || !(SNOW_POLICIES as readonly string[]).includes(snow))) {
    out.push(
      error(
        "BAD_ENUM",
        `${path}.snow`,
        `"snow" must be one of ${SNOW_POLICIES.join(", ")}, got ${describe(snow)}`,
        '"auto" lets the footprint vote, "never" and "always" are absolute',
      ),
    );
  }
  const blend = value["blend"];
  if (blend !== undefined && (typeof blend !== "string" || !(BLEND_WIDTHS as readonly string[]).includes(blend))) {
    out.push(
      error(
        "BAD_ENUM",
        `${path}.blend`,
        `"blend" must be one of ${BLEND_WIDTHS.join(", ")}, got ${describe(blend)}`,
        '"sharp" is an abrupt edge, "soft" a walkable gradient, "wide" a long fade; omit it for the size-scaled default',
      ),
    );
  }
}

function checkCharacter(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"character" must be an object, got ${describe(value)}`,
        'use "character": { "label": "pirate haven", "materialTheme": "weathered_timber" }',
      ),
    );
    return;
  }
  unknownKeys(out, value, path, [...CHARACTER_KEYS], "intent.character");

  // `urbanForm` is type-checked here and *grounded* in the compiler, against
  // the live form registry: an id outside the vocabulary is `LOAM-W487`, a
  // warning naming the legal values, exactly as every other intent vocabulary
  // is handled. An error here would let a classifier typo cost the whole intent.
  // `courtyards` is a share, so 0..1, and — like every other intent vocabulary
  // — an out-of-range value is *grounded* in the compiler as `LOAM-W488`, a
  // warning naming the range. Only the type is an error here.
  const courtyards = value["courtyards"];
  if (courtyards !== undefined && (typeof courtyards !== "number" || !Number.isFinite(courtyards))) {
    out.push(
      error(
        "BAD_TYPE",
        `${path}.courtyards`,
        `"courtyards" must be a number in 0..1, got ${describe(courtyards)}`,
        'write "courtyards": 0.7 — the share of eligible blocks that close around a courtyard',
      ),
    );
  }

  for (const key of ["label", "materialTheme", "urbanForm", "ground", "fortification"] as const) {
    const v = value[key];
    if (v !== undefined && (typeof v !== "string" || v.trim() === "")) {
      out.push(
        error(
          "BAD_TYPE",
          `${path}.${key}`,
          `"${key}" must be a non-empty string, got ${describe(v)}`,
          key === "label"
            ? 'write what the place is, e.g. "pirate haven" — free text, it reaches prompts and never a switch'
            : key === "urbanForm"
              ? `name an urban form: ${DISTRICT_FABRICS.join(", ")}`
              : key === "fortification"
                ? `name a fortification: ${FORTIFICATIONS.join(", ")} — "walled" rings the settlement with a gated curtain wall`
                : key === "ground"
                  ? `name a ground policy: ${DISTRICT_GROUND_POLICIES.join(", ")}`
                  : 'name a stdlib material theme id, e.g. "stone_slate"',
        ),
      );
    }
  }

  const palettes = value["palettes"];
  if (palettes !== undefined) {
    if (!isObject(palettes)) {
      out.push(
        error(
          "BAD_TYPE",
          `${path}.palettes`,
          `"palettes" must be an object, got ${describe(palettes)}`,
          'map each symbol to a block name or a mix, e.g. { "ground.beach": "minecraft:sand" }',
        ),
      );
    } else {
      validatePaletteMap(out, palettes, `${path}.palettes`);
    }
  }

  checkBias(out, value["archetypes"], `${path}.archetypes`, true);
  checkBias(out, value["props"], `${path}.props`, false);
  checkBias(out, value["flora"], `${path}.flora`, false);
  checkMotifs(out, value["motifs"], `${path}.motifs`);
  checkPrograms(out, value["programs"], `${path}.programs`);
}

function checkBias(out: LoamDiagnostic[], value: unknown, path: string, weights: boolean): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `must be an object, got ${describe(value)}`,
        'use { "prefer": ["cottage"], "forbid": ["skyscraper"] } — lists replace, they never accumulate over the parent scope',
      ),
    );
    return;
  }
  unknownKeys(out, value, path, weights ? ["prefer", "forbid", "weights"] : ["prefer", "forbid"], "a selection bias");
  for (const key of ["prefer", "forbid"] as const) {
    const list = value[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.some((e) => typeof e !== "string" || e.trim() === "")) {
      out.push(
        error(
          "BAD_TYPE",
          `${path}.${key}`,
          `"${key}" must be an array of non-empty strings, got ${describe(list)}`,
          `write "${key}": ["cottage", "workshop"] — names, not objects`,
        ),
      );
    }
  }
  if (!weights) return;
  const w = value["weights"];
  if (w === undefined) return;
  if (!isObject(w)) {
    out.push(
      error(
        "BAD_TYPE",
        `${path}.weights`,
        `"weights" must be an object, got ${describe(w)}`,
        'map each name to a non-negative number, e.g. { "cottage": 3, "manor": 1 }',
      ),
    );
    return;
  }
  for (const [name, weight] of Object.entries(w)) {
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      out.push(
        error(
          "PARAM_OUT_OF_RANGE",
          `${path}.weights.${name}`,
          `weight must be a non-negative number, got ${describe(weight)}`,
          "use a relative weight such as 3; zero means never drawn",
        ),
      );
    }
  }
}

function checkMotifs(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"motifs" must be an object, got ${describe(value)}`,
        'use "motifs": { "roofType": "gable", "ornamentDensity": 0.7 }',
      ),
    );
    return;
  }
  unknownKeys(out, value, path, ["roofType", "massing", "windowRhythm", "ornamentDensity"], "motifs");
  enumField(out, value["roofType"], `${path}.roofType`, ROOF_TYPES);
  enumField(out, value["massing"], `${path}.massing`, MASSING_STYLES);
  enumField(out, value["windowRhythm"], `${path}.windowRhythm`, WINDOW_RHYTHMS);
  dial(out, value["ornamentDensity"], `${path}.ornamentDensity`, "0 = plain, 1 = encrusted");
}

function enumField(
  out: LoamDiagnostic[],
  value: unknown,
  path: string,
  allowed: readonly string[],
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || !allowed.includes(value)) {
    out.push(
      error(
        "BAD_ENUM",
        path,
        `must be one of ${allowed.join(", ")}, got ${describe(value)}`,
        `set it to one of: ${allowed.join(", ")} — or omit it and let the era decide`,
      ),
    );
  }
}

const PROGRAMS_SHAPE_HINT =
  'use "programs": [{ "id": "earth_god_statue", "mode": "landmark", "brief": "a colossal statue of an earth god", "envelope": [24, 40, 24] }]';

const PROGRAM_REQUEST_KEYS = ["id", "mode", "brief", "envelope", "count"] as const;
const PROGRAM_REQUEST_MODES = ["landmark", "plugin", "both"] as const;

/**
 * `intent.character.programs` — bespoke-program **requests**.
 *
 * Two shapes are legal. The one the settlement kit (§9e) teaches, and the one
 * the program-author phase actually reads, is an array of request objects; a
 * single bare object is tolerated because the normaliser coerces it. The older
 * `{ landmarks, plugins, briefs }` counts-and-briefs object still validates so
 * that documents written against it keep working.
 */
function checkPrograms(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => checkProgramRequest(out, entry, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"programs" must be an array of program requests, got ${describe(value)}`,
        PROGRAMS_SHAPE_HINT,
      ),
    );
    return;
  }
  // A bare request object: `id`/`brief`/`mode`/`envelope`/`count` and none of
  // the legacy keys. `normalizeRequests` wraps it in an array; mirror that.
  if ("id" in value || "brief" in value || "mode" in value) {
    checkProgramRequest(out, value, path);
    return;
  }
  unknownKeys(out, value, path, ["landmarks", "plugins", "briefs"], "intent.character.programs");
  for (const key of ["landmarks", "plugins"] as const) {
    const v = value[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 12) {
      out.push(
        error(
          "PARAM_OUT_OF_RANGE",
          `${path}.${key}`,
          `"${key}" must be an integer in 0..12, got ${describe(v)}`,
          "ask for a small number; the budget rule scales the real count with the region's area",
        ),
      );
    }
  }
  const briefs = value["briefs"];
  if (briefs !== undefined && (!Array.isArray(briefs) || briefs.some((b) => typeof b !== "string"))) {
    out.push(
      error(
        "BAD_TYPE",
        `${path}.briefs`,
        `"briefs" must be an array of strings, got ${describe(briefs)}`,
        'write one sentence per program, e.g. ["a colossal statue of an earth god"]',
      ),
    );
  }
}

/** One `{ id, mode, brief, envelope, count }` request. */
function checkProgramRequest(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (!isObject(value)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `a program request must be an object, got ${describe(value)}`,
        PROGRAMS_SHAPE_HINT,
      ),
    );
    return;
  }
  unknownKeys(out, value, path, [...PROGRAM_REQUEST_KEYS], "a program request");

  const id = value["id"];
  if (typeof id !== "string" || id.trim() === "") {
    out.push(
      error(
        "MISSING_KEY",
        `${path}.id`,
        `a program request needs an "id", got ${describe(id)}`,
        'give it a short snake_case name — it becomes the "programs" key and the "authored:<id>" reference',
      ),
    );
  } else if (!/[a-z0-9]/i.test(id)) {
    out.push(
      error(
        "BAD_ID",
        `${path}.id`,
        `"id" ${JSON.stringify(id)} has no letters or digits to make a name out of`,
        'use letters, digits and underscores, e.g. "earth_god_statue"',
      ),
    );
  }

  const brief = value["brief"];
  if (typeof brief !== "string" || brief.trim() === "") {
    out.push(
      error(
        "MISSING_KEY",
        `${path}.brief`,
        `a program request needs a "brief", got ${describe(brief)}`,
        "write one sentence saying what it should be — that sentence is the whole prompt the program author gets",
      ),
    );
  }

  const mode = value["mode"];
  if (mode !== undefined && (typeof mode !== "string" || !(PROGRAM_REQUEST_MODES as readonly string[]).includes(mode))) {
    out.push(
      error(
        "BAD_ENUM",
        `${path}.mode`,
        `"mode" must be one of ${PROGRAM_REQUEST_MODES.join(", ")}, got ${describe(mode)}`,
        'omit it for a one-off landmark, or use "plugin" for something scatter.program@0 places many of',
      ),
    );
  }

  const envelope = value["envelope"];
  if (envelope !== undefined) {
    const ok =
      Array.isArray(envelope) &&
      envelope.length === 3 &&
      envelope.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
    if (!ok) {
      out.push(
        error(
          "BAD_TYPE",
          `${path}.envelope`,
          `"envelope" must be [w, h, d] positive numbers, got ${describe(envelope)}`,
          'write "envelope": [24, 40, 24] — a suggestion; the program may declare its own',
        ),
      );
    }
  }

  const count = value["count"];
  if (count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 1)) {
    out.push(
      error(
        "PARAM_OUT_OF_RANGE",
        `${path}.count`,
        `"count" must be a positive integer, got ${describe(count)}`,
        'give how many instances a "plugin" request wants, e.g. 12 — leave it off for a landmark',
      ),
    );
  }
}

function checkTokens(out: LoamDiagnostic[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    out.push(
      error(
        "BAD_TYPE",
        path,
        `"tokens" must be an object, got ${describe(value)}`,
        'use "tokens": { "guild": "cartographers" } — an open bag no stdlib code switches on',
      ),
    );
    return;
  }
  for (const [name, v] of Object.entries(value)) {
    const t = typeof v;
    if (t !== "string" && t !== "number" && t !== "boolean") {
      out.push(
        error(
          "BAD_TYPE",
          `${path}.${name}`,
          `token values must be a string, number or boolean, got ${describe(v)}`,
          "flatten it — tokens are a flat bag of scalars, never nested structure",
        ),
      );
    }
  }
}

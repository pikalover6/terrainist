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
import { error, hasErrors, note, warning, type LoamDiagnostic } from "../terrain/diagnostics.js";
import { validatePaletteMap } from "../terrain/validate.js";
import {
  CHARACTER_KEYS,
  ERA_CLASSES,
  BLEND_WIDTHS,
  EVENT_KINDS,
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
        'use a vanilla biome id this profile paints, such as "minecraft:jungle"',
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

  for (const key of ["label", "materialTheme"] as const) {
    const v = value[key];
    if (v !== undefined && (typeof v !== "string" || v.trim() === "")) {
      out.push(
        error(
          "BAD_TYPE",
          `${path}.${key}`,
          `"${key}" must be a non-empty string, got ${describe(v)}`,
          key === "label"
            ? 'write what the place is, e.g. "pirate haven" — free text, it reaches prompts and never a switch'
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

  checkBias(out, value["props"], `${path}.props`, false);
  checkBias(out, value["flora"], `${path}.flora`, false);
  // `formPacks` is a *list of words*, so only its type is an error here; an
  // unknown pack name is grounded in the compiler as `LOAM-W516`, exactly as
  // every other intent vocabulary is. A classifier typo must never cost the
  // whole intent.
  const packs = value["formPacks"];
  if (
    packs !== undefined &&
    (!Array.isArray(packs) || packs.some((e) => typeof e !== "string" || e.trim() === ""))
  ) {
    out.push(
      error(
        "BAD_TYPE",
        `${path}.formPacks`,
        `"formPacks" must be an array of non-empty strings, got ${describe(packs)}`,
        'write "formPacks": ["classical_mediterranean"] — pack names, not objects; the list replaces the parent scope\'s, it never accumulates',
      ),
    );
  }

  checkMotifs(out, value["motifs"], `${path}.motifs`);
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



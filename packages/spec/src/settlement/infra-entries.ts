/**
 * The `infra.entry@0` vocabulary, restated for the validator.
 *
 * `stdlib` owns the registry — `INFRA_ENTRIES` there is what the compiler
 * dispatches on — and `spec` sits *below* `stdlib` in the dependency graph, so
 * it restates the one list it validates against. Exactly the arrangement
 * {@link KNOWN_BUILDING_ARCHETYPES} has, and it is kept honest the same way:
 * `packages/compiler/test/infra-entry.test.ts` is the first place that can see
 * both registries, and it pins them to each other element by element.
 *
 * The list is small on purpose. W0 ships the host and no content, so the only
 * name an author may write today is the host's own fixture; a document naming
 * `crop_circle` gets `LOAM-T231` with the legal values and the near-misses
 * attached, which is the honest answer until W1 lands the row.
 */

import { editDistance } from "./archetypes.js";

/** The node kind the infrastructure host provides (`docs/INFRA-ENTRIES-v0.md` §3.1). */
export const INFRA_ENTRY_GENERATOR = "infra.entry@0";

/**
 * Every entry the registry carries, in `stdlib`'s declaration order.
 *
 * Order is load-bearing only for the near-miss suggestions below, which break
 * ties on it so the same typo always suggests the same names.
 */
export const KNOWN_INFRA_ENTRIES = [
  // W0's internal fixture — the host's own client, and the only entry that
  // exists before W1. It is a real, buildable entry rather than a stub, which
  // is what makes the exhibit and the driver tests worth anything.
  "test_fence",
] as const;

/** An entry id. */
export type InfraEntryId = (typeof KNOWN_INFRA_ENTRIES)[number];

/**
 * Which route forms each entry accepts, restated from the registry's `routes`.
 *
 * The second half of §3.7's `INFRA_ENTRY_PARAM`: "an unknown `entry`, **or a
 * route form that entry does not accept**". Restated here rather than deferred
 * to the compiler because it is the difference between a document that fails
 * validation and a document that compiles to a world silently missing the thing
 * it asked for. Pinned to `INFRA_ENTRIES[id].routes` element by element in
 * `packages/compiler/test/infra-entry.test.ts`.
 */
export const INFRA_ENTRY_ROUTES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  test_fence: Object.freeze(["ring", "along", "across", "into"]),
});

/** True for an entry the registry knows. */
export function isKnownInfraEntry(name: string): name is InfraEntryId {
  return (KNOWN_INFRA_ENTRIES as readonly string[]).includes(name);
}

/** How many suggestions a near-miss list carries. */
export const INFRA_ENTRY_SUGGESTIONS = 3;

/**
 * The closest entry names to `name`, best first — {@link nearestArchetypes}'s
 * construction, over this vocabulary.
 */
export function nearestInfraEntries(name: string, limit = INFRA_ENTRY_SUGGESTIONS): string[] {
  const needle = name.toLowerCase();
  const scored: { name: string; score: number; index: number }[] = [];
  for (const [index, candidate] of KNOWN_INFRA_ENTRIES.entries()) {
    const contains = candidate.includes(needle) || needle.includes(candidate);
    const distance = editDistance(needle, candidate);
    const score = contains ? Math.min(distance, 1) : distance;
    if (score > 3) continue;
    scored.push({ name: candidate, score, index });
  }
  scored.sort((a, b) => (a.score !== b.score ? a.score - b.score : a.index - b.index));
  return scored.slice(0, limit).map((s) => s.name);
}

/* -------------------------------------------------------------------------- */
/* the route forms (§3.2)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The five coordinate-free route forms, plus the one areal form.
 *
 * The project law is that a model never writes a coordinate, so a route is
 * always **named relative to something the compiler placed** and is derived
 * after placement, exactly as a wall course is. `margin`, `offset` and `run`
 * are distances and are legal; a vertex, a bearing in degrees or an `[x, z]` is
 * not, and the vocabulary is closed specifically so a model cannot reach for
 * one.
 */
export const INFRA_ROUTE_KEYS = ["ring", "along", "across", "between", "into", "over"] as const;

/** One route form. */
export type InfraRouteKey = (typeof INFRA_ROUTE_KEYS)[number];

/**
 * The forms the host resolves today.
 *
 * `between` needs the road router and a tier-A ground declaration and is
 * deliberately held (§3.2, §5). It is in the vocabulary — the design named it —
 * and it is refused with a fix hint rather than treated as a typo, which is the
 * difference between "not yet" and "never heard of it".
 */
export const INFRA_ROUTE_KEYS_IMPLEMENTED = ["ring", "along", "across", "into", "over"] as const;

/** Which side of a corridor an `along` route stands on. */
export const INFRA_ROUTE_SIDES = ["left", "right"] as const;

/** A side. */
export type InfraRouteSide = (typeof INFRA_ROUTE_SIDES)[number];

/** Bounds on the three distances the route forms carry. */
export const INFRA_MARGIN_MIN = 0;
export const INFRA_MARGIN_MAX = 64;
export const INFRA_OFFSET_MIN = 0;
export const INFRA_OFFSET_MAX = 32;
export const INFRA_RUN_MIN = 4;
export const INFRA_RUN_MAX = 256;

/** Params an `infra.entry@0` node may carry. */
export const INFRA_ENTRY_PARAM_KEYS = ["entry", "route", "gates", "height"] as const;

/** Keys a `route` object may carry, beyond the one that names its form. */
export const INFRA_ROUTE_PARAM_KEYS = [
  ...INFRA_ROUTE_KEYS,
  "margin",
  "offset",
  "side",
  "run",
] as const;

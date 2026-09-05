/**
 * The `infra.entry@0` vocabulary — the author-visible set of infrastructure
 * entries and their route forms.
 *
 * `spec` owns the identifiers; `stdlib` attaches the registry rows and profile
 * functions to them. The list is small on purpose. W0 shipped the host and no
 * content; W1 adds P2's four and nothing else. A document naming an entry no
 * wave has landed gets `LOAM-T231` with the legal values and the near-misses
 * attached, which is the honest answer until the row exists.
 */

import { editDistance } from "./archetypes.js";

/** The node kind the infrastructure host provides. */
export const INFRA_ENTRY_GENERATOR = "infra.entry@0";

/**
 * Every entry the registry carries, in declaration order.
 *
 * Order is load-bearing only for the near-miss suggestions below, which break
 * ties on it so the same typo always suggests the same names.
 */
export const KNOWN_INFRA_ENTRIES = [
  // W0's internal fixture — the host's own client. It is a real, buildable
  // entry rather than a stub, which is what makes the exhibit and the driver
  // tests worth anything.
  "test_fence",
  // W1 — P2's four. One prompt's world ("a small farm town being invaded by
  // aliens") and four different mechanisms: a ring with found gates, a chord
  // with one deliberate gap, a run that cuts below the ground, and an areal
  // figure that flattens one.
  "quarantine_fence",
  "barricade_line",
  "crash_furrow",
  "crop_circle",
  // W2 — P1's shore battery, the one row that prompt actually gains (the
  // harbour wall and the quay are `precinct.harbour@0`'s and always were).
  "cannon_battery",
  // W3 — the cheap tail: peacetime fabric, every one of it a line beside or
  // around something the compiler already placed.
  "hedgerow",
  "dry_stone_wall",
  "cart_track",
  "boardwalk",
  "sphinx_avenue",
  // W4 — the `between` form's first client, and the one row of family E that
  // is not honestly a prop: the pair is a curve over water, and a curve
  // between two anchors is the form the design held back until now.
  "harbour_chain_tower",
  // W6 — the other three clients the route-forms table names for `between`: an
  // arcade carrying water, a pole line carrying wire, and a guideway carrying
  // itself. Two of them are *carried* rather than hanging, which is the one
  // geometry the span kind gained to land them.
  "aqueduct",
  "telegraph_line",
  "maglev_pylon",
  // The fourth carried client, and the ground contract's first
  // `structure.linework` row (GROUND-CONTRACT §13.2e, 2026-08-17): the one
  // member of the family whose deck something *walks onto*, so its approach
  // embankments are ground the street network joins rather than cuts.
  "viaduct",
 // W5 — the water movers. The
  // three rows whose real content is a `fluid.channel` declaration rather than
  // a cross-section: what makes a dam a dam is that the water behind it is
  // somewhere else.
  "dam",
  "weir",
  "canal_lock",
  // W7 — family B, the retaining / terrain-defining entries. The four rows
  // whose real content is a declared `face` between two levels at
  // `retaining.seam`, rank 60 / tier B, rather than a thing stood on a slope.
  // (The family's other five are already answered: `harbour_wall` and `quay`
  // are `precinct.harbour@0`'s, `dam` and `weir` are W5's, and `slipway` waits
  // on the water side.)
  "retaining_wall",
  "terrace_steps",
  "acropolis_terrace",
  "castle_base_wall",
] as const;

/** An entry id. */
export type InfraEntryId = (typeof KNOWN_INFRA_ENTRIES)[number];

/**
 * Which route forms each entry accepts.
 *
 * The second half of §3.7's `INFRA_ENTRY_PARAM`: "an unknown `entry`, **or a
 * route form that entry does not accept**". `stdlib` satisfies this table
 * exhaustively via its registry's `routes` — every entry's routes here are the
 * routes its registry row declares, element by element.
 */
export const INFRA_ENTRY_ROUTES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  test_fence: Object.freeze(["ring", "along", "across", "into"]),
  // One form each, and the narrowness is the teaching: a cordon rings, a
  // barricade goes across, a furrow runs into the thing that made it, and a
  // crop circle lies over a field. `crash_furrow`'s single form is also the
  // ratified refusal — a scar with no cause is set dressing, so a furrow that
  // names nothing gets `LOAM-T231` rather than a shorter furrow.
  quarantine_fence: Object.freeze(["ring"]),
  barricade_line: Object.freeze(["across"]),
  crash_furrow: Object.freeze(["into"]),
  crop_circle: Object.freeze(["over"]),
  // W2/W3. The same narrowness, and the same teaching: a battery lines a shore
  // or rings a headland, a hedge and a field wall bound something or run beside
  // a way, and a track, a boardwalk and a processional avenue are all a line
  // *along* a way somebody else drew. None of them goes `across` anything —
  // that form belongs to the entries whose point is stopping a street.
  cannon_battery: Object.freeze(["along", "ring"]),
  hedgerow: Object.freeze(["along", "ring"]),
  dry_stone_wall: Object.freeze(["along", "ring"]),
  cart_track: Object.freeze(["along"]),
  boardwalk: Object.freeze(["along"]),
  sphinx_avenue: Object.freeze(["along"]),
  // The only `between` client, and `between` is its only form: a chain tower on
  // its own is a tower, and "ships as a pair or not at all" is the catalog's
  // own sentence about it.
  harbour_chain_tower: Object.freeze(["between"]),
  // W6's three, and `between` is the only form any of them has for the same
  // reason: each one *is* the relation between two anchors — a source and a
  // town, an office and an office, a station and a station — and no single
  // anchor contains it.
  aqueduct: Object.freeze(["between"]),
  telegraph_line: Object.freeze(["between"]),
  maglev_pylon: Object.freeze(["between"]),
  viaduct: Object.freeze(["between"]),
  // The three water movers, and `across` is the only form any of them has: a
  // barrier is a line *across* a watercourse. The host reads that form against
  // the water in the column plan rather than against a carriageway, which is
  // the one place `across` means two different things — and it has to, because
  // a dam thrown across a street is a wall.
  dam: Object.freeze(["across"]),
  weir: Object.freeze(["across"]),
  canal_lock: Object.freeze(["across"]),
  // Family B. A face bounds something or runs beside a way, so `ring` and
  // `along`; the one exception is the flight, and `across` is the whole of what
  // a flight is — the connection between the two levels a face separates.
  retaining_wall: Object.freeze(["along", "ring"]),
  terrace_steps: Object.freeze(["across"]),
  acropolis_terrace: Object.freeze(["ring", "along"]),
  castle_base_wall: Object.freeze(["ring", "along"]),
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
 * (Five linear: `ring`, `along`, `across`, `between`, `into`. `between` is the
 * one that names a *pair* of anchors, and so the one whose value is an array.)
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
 * All six, since 2026-08-15: `between` landed with `harbour_chain_tower` as its
 * first client, routed through the road router's own cost field at the entry's
 * grade cap (§3.2). The tier-A ground declaration §5 paired it with turned out
 * to be needed by three of the four clients: `aqueduct` and `maglev_pylon`
 * landed without it too (2026-08-15), because a carried run stands on the
 * ground it finds and is refused where it cannot — nothing walks onto an
 * aqueduct's water or a guideway's beam, so neither asks the ground for
 * anything. `viaduct` is the exception and the reason rank 25 exists: its deck
 * is a carriageway, a road has to arrive on it, and its approach embankments
 * are declared at `structure.linework` from the linework slot (2026-08-17).
 *
 * Kept as a separate list from {@link INFRA_ROUTE_KEYS} rather than deleted:
 * the next form the design names will be held the same way, and the
 * "not yet" / "never heard of it" distinction is the thing worth keeping.
 */
export const INFRA_ROUTE_KEYS_IMPLEMENTED = [
  "ring",
  "along",
  "across",
  "between",
  "into",
  "over",
] as const;

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

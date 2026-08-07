/**
 * Column ownership for the street surfacer (`docs/COURTYARDS-AND-LEVELS-v0.md`
 * §2).
 *
 * **Every column a street network touches has exactly one owner, decided before
 * anything is written; the owner decides the column's level; nothing that stands
 * above a column is emitted until every column has been written.**
 *
 * The defect this exists to remove is not subtle once stated. `surfaceStreetGraph`
 * used to grade each segment against `plan.ground` *as it stood* and then write
 * `plan.ground` back, segment by segment, in document order. Both halves are
 * order-dependent: a street's elevation profile depended on which streets
 * happened to be drawn before it, and where two segments shared a column — every
 * junction, every stair landing on a contour street — the last writer won over
 * ground the first had already committed to, leaving the first one's neighbours
 * standing proud of a level that no longer existed. On a hill that is pavement at
 * two heights in one junction, and it is why `street-stairs.ts` could not build a
 * balustrade: a rail laid on a tread could be left floating by a later segment
 * that lowered the column beneath it.
 *
 * This module owns the part of the fix that is a pure function: **the total order
 * that decides who owns a shared column**, and the two little primitives the
 * claim and level phases are written in. It deliberately holds no `ColumnPlan`
 * and no region, so the rule can be tested without compiling a world.
 *
 * ```
 * rank(s) = ( −width(s), roleRank(s), kindRank(s), id(s) )      // lower tuple wins
 *   roleRank:  channel 0,  carriageway 1,  cart 2,  steps 3
 *   kindRank:  arterial 0, avenue 1, street 2, lane 3
 * ```
 *
 * **The role ranks are not the ones §2.2's table prints**, and the difference is
 * deliberate: that table reads `channel 0, steps 1, carriageway 2`, which under
 * "lower tuple wins" makes a flight of steps *outrank* a street of its width —
 * the exact opposite of what the same section's prose asks for twice ("a `steps`
 * segment ranks below any street"; "a flight arrives at the street's level, the
 * street does not arrive at the flight's; that is what a stair landing is"). The
 * prose is the requirement — it is the thing a landing *is* — so the table is
 * read as a typo and the ranks are ordered to match it.
 *
 * Width first, because a street *meets* a boulevard rather than the other way
 * round — the wider carriageway is the one that should survive a shared column,
 * which is what the arterial loop's own comment always claimed and what
 * last-write-wins quietly contradicted. Role second, so a channel is never paved
 * over by a carriageway of the same width. `id` last, lexicographically, so the
 * order is a pure function of the graph rather than of the traversal.
 *
 * A `steps` segment ranks below any street of the same width, which is the
 * architecturally correct answer: a flight *arrives* at the street's level; the
 * street does not arrive at the flight's. That is what a stair landing is.
 *
 * **Ownership decides geometry and deliberately does not decide material.**
 * Painting keeps the surfacer's existing last-write-wins traversal order, and
 * that split is what makes the flat-world identity argument hold (§2.3): on
 * levelled ground every owner's level and every non-owner's level are the same
 * number, so the geometry written is bit-for-bit what was written before, and the
 * material sequence is untouched.
 */

/** What is inside a segment's width. */
export type StreetOwnerRole = "carriageway" | "channel" | "steps" | "cart";

/** Width class. `"arterial"` is C1's boulevard, which outranks every street. */
export type StreetOwnerKind = "arterial" | "avenue" | "street" | "lane";

/** Everything the rank order reads off a segment. */
export interface StreetRank {
  readonly id: string;
  readonly width: number;
  readonly role: StreetOwnerRole;
  readonly kind: StreetOwnerKind;
}

/**
 * Role precedence: a channel is never paved over by a carriageway.
 *
 * `cart` sits between a carriageway and a flight, and the two neighbours are the
 * argument: a carriage spine (`docs/SITE-PLAN-v0.md` §3.6a) **arrives** at the
 * contour street it joins — its junction is the street's level, which is what
 * pins the spine's tread run — and a stair connector arrives at *it*, because a
 * shortcut lands on the road and the road does not land on the shortcut. Only
 * the order of these four numbers is read, so nothing that ships today moves
 * when `steps` is renumbered around the new entry.
 */
export const ROLE_RANK: Readonly<Record<StreetOwnerRole, number>> = Object.freeze({
  channel: 0,
  carriageway: 1,
  cart: 2,
  steps: 3,
});

/** Width-class precedence, used only to break a tie on actual width. */
export const KIND_RANK: Readonly<Record<StreetOwnerKind, number>> = Object.freeze({
  arterial: 0,
  avenue: 1,
  street: 2,
  lane: 3,
});

/**
 * The total order on segments. Negative when `a` owns a column `b` also wants.
 *
 * Total in the strict sense: two distinct segments never compare equal, because
 * ids are unique within a surfacing pass. That is what makes the claim phase's
 * result independent of the order the segments are enumerated in.
 */
export function compareStreetRank(a: StreetRank, b: StreetRank): number {
  if (a.width !== b.width) return b.width - a.width;
  const ra = ROLE_RANK[a.role];
  const rb = ROLE_RANK[b.role];
  if (ra !== rb) return ra - rb;
  const ka = KIND_RANK[a.kind];
  const kb = KIND_RANK[b.kind];
  if (ka !== kb) return ka - kb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Claim every unowned column of `columns` for segment `job`.
 *
 * First writer wins *in rank order*, which is the whole point: the caller sorts
 * once and this stays a one-liner. Returns how many columns were taken.
 */
export function claimColumns(owner: Int32Array, columns: Iterable<number>, job: number): number {
  let taken = 0;
  for (const idx of columns) {
    if (owner[idx] !== -1) continue;
    owner[idx] = job;
    taken++;
  }
  return taken;
}

/**
 * Pin one index of a grading problem to an exact level.
 *
 * No new grading primitive is needed, and this is the four lines that say why.
 * `gradeProfile(ground, seaLevel, band, deckFloor)` already takes a per-cell
 * floor and already upper-envelopes it into a 1-Lipschitz function before taking
 * the pointwise maximum — machinery that exists for bridge decks, and the
 * argument is the same here:
 *
 * - `ground[i] = pin` with `band[i] = 0` makes the lower envelope of unit cones
 *   satisfy `out[i] ≤ pin`;
 * - `deckFloor[i] = pin` makes the final max give `out[i] ≥ pin`.
 *
 * The two together give `out[i] === pin` exactly, and every column either side is
 * ramped to it at one block per column. That is a street that *arrives* at a
 * junction instead of stepping at it.
 *
 * One caveat, stated rather than hidden: `gradeProfile` floors everything at
 * `seaLevel + 1`, so a pin below the waterline cannot be expressed. Street
 * columns are above it by construction — the grade already floors there — so this
 * is a note, not a case. A deck floor already higher than the pin is kept, since
 * a deck that dips into the water it spans is a worse answer than a step.
 */
export function pinLevel(
  ground: number[],
  band: number[],
  deckFloor: number[],
  i: number,
  pin: number,
): void {
  ground[i] = pin;
  band[i] = 0;
  deckFloor[i] = Math.max(deckFloor[i] as number, pin);
}

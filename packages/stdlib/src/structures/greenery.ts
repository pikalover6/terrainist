/**
 * **What a multi-face growth block may legally carry** — one vocabulary, two
 * readers (RUINS-PLAN-v0-WP6 §4.1).
 *
 * `vine`, `glow_lichen` and the `sculk_vein` family are not blocks that stand
 * on something or hang off something: they carry five booleans, one per face,
 * each meaning *"attached to the block in that direction"*, and each true face
 * draws a panel on that side of the cube. Get the set wrong and the block does
 * not fail loudly — it renders as a flat plate in mid-air and vanilla pops it
 * on the first block update. That is the defect Kai walked twice on the flora
 * side (`oldgrowth_vale-2` and `-3`), and it is the defect the green skin would
 * ship at city scale if the masonry side derived its faces its own way.
 *
 * So the derivation lives here, in the shape `support.ts` already established
 * for the support vocabulary and for exactly its reason: the flora side
 * (`terrain/flora/parts.ts`'s `hangingFaces`, which works over a plant's own
 * block set) and the masonry side (the green skin, which works over a surface
 * index) must not be two implementations of one rule. `parts.ts` calls
 * {@link chooseGrowthFace} and {@link growthFaces} rather than keeping its own
 * copies, and a property test asserts the two readers agree on every input the
 * flora side produces.
 *
 * **The three laws, verbatim from `hangingFaces` and from vanilla's
 * `VineBlock.getUpdatedState`:**
 *
 * 1. every **horizontal** neighbour that is solid sets that face `true` — the
 *    sheet lies against the wall;
 * 2. **`up` is never inherited.** `up = true` only when the block directly
 *    above is itself solid — an eave soffit, an arch springing, a floor plate
 *    overhang. A strand carries `up` on its head cell and never below it. (A
 *    vine is not a sturdy down-face, so an inherited `up` is illegal and would
 *    pop on the first block update.)
 * 3. a strand propagates **exactly one thing: one horizontal face**, chosen at
 *    the head from the faces that cell genuinely touches, with the
 *    position-keyed tiebreak below. A cell left with no legal face is **not
 *    emitted**.
 *
 * Determinism: no RNG, no traversal order, no wall clock. The tiebreak is a
 * small integer hash of the cell's own coordinates, so the same cell in the
 * same plant — or on the same wall — always picks the same face.
 */

/** The six faces, in the fixed order both readers write them. */
export const GROWTH_FACES: readonly (readonly [string, number, number, number])[] = Object.freeze([
  ["down", 0, -1, 0],
  ["up", 0, 1, 0],
  ["north", 0, 0, -1],
  ["south", 0, 0, 1],
  ["west", -1, 0, 0],
  ["east", 1, 0, 0],
] as const);

/** The four a strand may carry down a wall. */
export const GROWTH_HORIZONTAL_FACES: readonly (readonly [string, number, number, number])[] =
  Object.freeze(GROWTH_FACES.filter(([face]) => face !== "up" && face !== "down"));

/**
 * Pick one horizontal face out of the several a cell genuinely touches.
 *
 * Deterministic and position-keyed: the same cell always picks the same face,
 * and two neighbouring curtains off the same limb — or two strands founded on
 * the same wall — do not all pick `north`. Candidates arrive in
 * {@link GROWTH_HORIZONTAL_FACES} order, which is fixed, so the choice does not
 * depend on traversal order.
 */
export function chooseGrowthFace(
  candidates: readonly string[],
  at: { readonly x: number; readonly y: number; readonly z: number },
): string {
  if (candidates.length === 1) return candidates[0] as string;
  // A small, stable integer hash of the position — no RNG, no wall clock.
  let h = 2166136261;
  for (const v of [at.x, at.y, at.z]) {
    h = Math.imul(h ^ (v + 0x7fff), 16777619) >>> 0;
  }
  return candidates[h % candidates.length] as string;
}

/**
 * The face booleans a multi-face growth block may legally carry at one cell.
 *
 * @param at the cell the block would occupy.
 * @param solid answers "is the block at this cell something a growth sheet may
 *   lie against" — the flora side asks its own plant's part table, the masonry
 *   side asks the surface index through `support.ts`'s `canSupport`. Both are
 *   *conservative in the direction that removes*: a slab, a stair, a fence or a
 *   pane is not something to hang a vine off.
 * @param carried the strand's canonical horizontal face, if this cell is below
 *   the head of one. Law 3: exactly one thing propagates, and it is horizontal.
 * @returns the full six-key face record, or `null` when the cell has no legal
 *   face at all — **do not emit** a block there.
 */
export function growthFaces(
  at: { readonly x: number; readonly y: number; readonly z: number },
  solid: (x: number, y: number, z: number) => boolean,
  carried?: string,
): Readonly<Record<string, string>> | null {
  const on = new Set<string>();
  // Law 1 — every horizontal neighbour it is genuinely flush against.
  for (const [face, ox, oy, oz] of GROWTH_HORIZONTAL_FACES) {
    if (solid(at.x + ox, at.y + oy, at.z + oz)) on.add(face);
  }
  // Law 3 — and the one face the strand hands down, which is legal on the
  // head's merits and stays legal for as long as the wall runs.
  if (carried !== undefined) on.add(carried);
  // Law 2 — `up` is derived here and nowhere else, and never inherited.
  if (solid(at.x, at.y + 1, at.z)) on.add("up");
  if (on.size === 0) return null;
  const props: Record<string, string> = {};
  for (const [face] of GROWTH_FACES) props[face] = on.has(face) ? "true" : "false";
  return Object.freeze(props);
}

/**
 * The horizontal faces a cell genuinely touches, in fixed order.
 *
 * Exported because founding a strand is a two-step question — *which faces does
 * this cell have* and then *which one does it carry* — and both readers ask the
 * first one before calling {@link chooseGrowthFace}.
 */
export function ownGrowthFaces(
  at: { readonly x: number; readonly y: number; readonly z: number },
  solid: (x: number, y: number, z: number) => boolean,
): readonly string[] {
  const own: string[] = [];
  for (const [face, ox, oy, oz] of GROWTH_HORIZONTAL_FACES) {
    if (solid(at.x + ox, at.y + oy, at.z + oz)) own.push(face);
  }
  return own;
}

/** The names this vocabulary governs — the blocks rule 27 polices. */
export const MULTIFACE_GROWTH = /^(vine|glow_lichen|sculk_vein|resin_clump)$/;

/** True for a block whose state is a set of attachment faces. */
export function isMultifaceGrowth(name: string): boolean {
  return MULTIFACE_GROWTH.test(name);
}

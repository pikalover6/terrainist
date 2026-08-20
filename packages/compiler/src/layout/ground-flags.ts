/**
 * The ground-contract v1 flag ladder — `docs/GROUND-CONTRACT-v1.md` §6.
 *
 * §6 puts the four flags — `GROUND_V1_RANKS`, `GROUND_V1_SEAMS`,
 * `GROUND_V1_FREEZE`, `GROUND_V1_PRISTINE` — in `layout/types.ts`, beside
 * `FRONTAGE_TIE`, `SEAM_TIERS` and `GROUND_PLANE_TIE`, with a test asserting the
 * implication ordering exactly as G9 does for `GROUND_PLANE_TIE ⟹ FRONTAGE_TIE`.
 *
 * **This module is a staging post, not the final home.** WP-G4 and WP-G3 land in
 * parallel and `layout/types.ts` belongs to the other wave for the duration, so
 * the seam flag is declared here and the ladder test unifies the four into
 * `layout/types.ts` once both waves have landed. Nothing but the flag's address
 * changes when it moves.
 */

/**
 * WP-G4 — `finishSeams` builds the transitions the resolver derived.
 *
 * **Off, and this is the only state WP-G4 ships.** With the flag off the whole
 * v1 seam path *derives and reports* and builds nothing: `deriveGroundSeams`
 * enumerates every boundary, §3.2's coverage invariant runs on every settlement
 * compile, `LOAM-I497 GROUND_STAGE` records the counts, and every world is
 * byte-identical to the one before the stage. That is §6/WP-G4's front-loaded
 * comparison — the risky question is answered by a diff before a block moves.
 */
export const GROUND_V1_SEAMS = false;

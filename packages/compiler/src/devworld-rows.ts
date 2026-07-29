/**
 * Extra dev-world exhibit rows.
 *
 * **Seam file.** `devworld.ts` is shared ground: three tracks adding exhibits
 * to it at once would collide on every edit. So it stays closed, and this file
 * is the one place it reads from.
 *
 * A track that wants its work shown in the dev world writes the rows in **its
 * own file** and registers them here — one import and one spread per track,
 * which is a conflict a merge can resolve. `devworld.ts` itself must not be
 * edited by the parallel tracks.
 *
 * Round E wired the three tracks that came back with rows:
 *
 * - the **extended archetypes**, each on a footprint shaped like the thing it
 *   is rather than on the cottage gradient (`exhibits/archetypes.ts`);
 * - the **L and the T** — the wing, on every side and under every roof shape
 *   (`exhibits/footprints.ts`);
 * - the **props**, which are not buildings at all and so come with a builder
 *   of their own rather than a row of envelopes (`exhibits/props.ts`).
 *
 * Order here is grid order, north to south, below the base grid's own rows.
 */

import { ARCHETYPE_EXHIBIT_ROWS } from "./exhibits/archetypes.js";
import { FOOTPRINT_EXHIBIT_ROWS } from "./exhibits/footprints.js";
import type { DevExhibitRow } from "./exhibits/types.js";

export { DEV_ROOFS, DEV_THEMES } from "./exhibits/types.js";
export type { DevExhibitCell, DevExhibitRow } from "./exhibits/types.js";

/**
 * The prop grid: a plan, a pond digger and a builder.
 *
 * Re-exported rather than spread into {@link EXTRA_EXHIBIT_ROWS} because a
 * prop is not a building: it has no envelope for the solver-shaped grid to
 * lay out, it is placed against the *ground* by its own coarse placer, and
 * three of them need a pond dug before they can be placed at all. The dev
 * world calls {@link buildPropExhibits} once, after the plain exists.
 */
export {
  PROP_EXHIBIT_GAP,
  PROP_EXHIBIT_PLAN,
  PROP_POND_DEPTH,
  buildPropExhibits,
  digPropPond,
  planPropExhibits,
  type PropExhibit,
  type PropExhibitGrid,
  type PropExhibitResult,
  type PropExhibitRow,
} from "./exhibits/props.js";

/**
 * Rows appended to the dev world by the parallel tracks, in grid order.
 *
 * The extended archetypes come first because they are the ones a grammar
 * change is most likely to break, and the two footprint rows last because they
 * are the widest — a reader scanning south sees the buildings before the
 * geometry exhibit.
 */
export const EXTRA_EXHIBIT_ROWS: readonly DevExhibitRow[] = Object.freeze([
  ...ARCHETYPE_EXHIBIT_ROWS,
  ...FOOTPRINT_EXHIBIT_ROWS,
]);

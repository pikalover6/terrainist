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
import { BREAKPOINT_EXHIBIT_ROWS } from "./exhibits/breakpoints.js";
import { FOOTPRINT_EXHIBIT_ROWS } from "./exhibits/footprints.js";
import { HIGHRISE_EXHIBIT_ROWS } from "./exhibits/highrise.js";
import { SEED_EXHIBIT_ROWS } from "./exhibits/seeds.js";
import type { DevExhibitRow } from "./exhibits/types.js";
import { UNDERGROUND_EXHIBIT_ROWS } from "./exhibits/underground.js";

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
  ...UNDERGROUND_EXHIBIT_ROWS,
  ...HIGHRISE_EXHIBIT_ROWS,
  ...FOOTPRINT_EXHIBIT_ROWS,
  ...SEED_EXHIBIT_ROWS,
  ...BREAKPOINT_EXHIBIT_ROWS,
]);

/**
 * The context section: strips of hand-written ground, built on by the real
 * pipeline.
 *
 * Re-exported rather than spread into {@link EXTRA_EXHIBIT_ROWS} for the same
 * reason the props are: these cells are not grid cells. They carry a yaw, they
 * stand on ground that is not the plain, their foundation elevation is derived
 * per cell rather than fixed, and building them runs three passes the grid does
 * not (the pad kernel, the prop placer, the doorstep pass). The dev world calls
 * {@link buildContextExhibits} once, after everything else has finished writing
 * into the plan.
 */
export {
  CONTEXT_SIZE,
  CONTEXT_YAWS,
  SLOPE_POSITIONS,
  SLOPE_RISE,
  SLOPE_RUN,
  buildContextExhibits,
  contextFootprint,
  contextGroundAt,
  planContextSection,
  shapeContextGround,
  type ContextCell,
  type ContextResult,
  type ContextSection,
  type ContextStrip,
} from "./exhibits/context.js";

/** The tall rows, for tests that assert on the high-rise gradient itself. */
export {
  HIGHRISE_EXHIBIT_ROWS,
  HIGHRISE_FLOOR_GRADIENT,
  HIGHRISE_ROW_LENGTH,
  highriseSizeFor,
} from "./exhibits/highrise.js";

/** The breakpoint rows, for tests that assert on the thresholds themselves. */
export { BREAKPOINT_EXHIBIT_ROWS, exactRoofHeight } from "./exhibits/breakpoints.js";

/** The seed sweep, for the same reason. */
export { SEED_EXHIBIT_ROWS, SEED_SWEEP_LENGTH, SEED_SWEEP_ROW_LABEL } from "./exhibits/seeds.js";

/** The themed underground: the cellar styles, and the mine head over one. */
export {
  CELLAR_STYLE_ROW,
  MINE_HEAD_ROW,
  UNDERGROUND_EXHIBIT_DEPTH,
  UNDERGROUND_EXHIBIT_ROWS,
  cellarStyleSize,
} from "./exhibits/underground.js";

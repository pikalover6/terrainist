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
 * The element type is `unknown` until the exhibit-row shape is settled; narrow
 * it here, in one place, once it is.
 */

/** Rows appended to the dev world by the parallel tracks. Empty for now. */
export const EXTRA_EXHIBIT_ROWS: unknown[] = [];

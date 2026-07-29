/**
 * Dev-world exhibit rows for the themed underground.
 *
 * The awkward thing about everything in this round is that **none of it is
 * above ground**. A dev-world grid is a plain with buildings on it, read from
 * a hundred blocks up; a burial niche, an ore seam and a rail line are things
 * a reader has to be standing in a cellar to see. So these rows exhibit the
 * only part of the work the grid can honestly show — the cellar styles, one
 * cell per style, each on a footprint big enough for its contents, plus the
 * mine head, whose headframe is the one piece of this round that is visible
 * from the air.
 *
 * The tunnel styles are not here and cannot be: a gallery is a *relation*
 * between two cellars, and the grid's cells are laid out by a solver that
 * knows nothing about the pairs. They are exhibited by
 * `examples/mine-and-crypt.loam.json` instead, which compiles a mine-style
 * gallery with an ore chamber and a crypt-style gallery between four
 * buildings, and by `test/underground.test.ts`, which walks both.
 *
 * **Seam file, one way.** `devworld-rows.ts` is shared ground; this file only
 * exports. Registering it is one import and one spread there.
 */

import { CELLAR_STYLES } from "@terrainist/stdlib";

import { DEV_THEMES, type DevExhibitCell, type DevExhibitRow } from "./types.js";

/** Cellar headroom every underground exhibit is dug to — the deepest legal. */
export const UNDERGROUND_EXHIBIT_DEPTH = 5;

/**
 * Footprint for a cellar-style exhibit.
 *
 * Square and generous: a crypt needs a wall long enough to carry more than one
 * niche and a floor wide enough for a coffin that is not also the doorway, and
 * the guard that refuses furniture it cannot fit would quietly hide the whole
 * style on a five-by-five.
 */
export function cellarStyleSize(index: number): [number, number, number] {
  const side = 9 + (index % 3) * 2;
  return [side, 8, side];
}

/**
 * One cell per cellar style, in the styles' own order.
 *
 * `plain` is included on purpose and is first: a row of themed rooms with
 * nothing to compare them against is a row of assertions, and the whole use of
 * this grid is the reader's eye moving left to right.
 */
export const CELLAR_STYLE_ROW: readonly DevExhibitCell[] = CELLAR_STYLES.map((style, i) => {
  const cell: DevExhibitCell = {
    id: `cellar_${style}`,
    archetype: "cottage",
    theme: DEV_THEMES[i % DEV_THEMES.length] as string,
    roof: "gable",
    floors: 1,
    size: cellarStyleSize(i),
    params: {
      basement: UNDERGROUND_EXHIBIT_DEPTH,
      cellarStyle: style,
    },
  };
  return cell;
});

/**
 * The mine head, at three sizes.
 *
 * The archetype's cellar dresses itself `mine` when the document says nothing,
 * so these three cells exercise the default as well as the headframe: what the
 * grid shows is the timber over the roof, and what the reader who climbs down
 * the ladder finds is the bottom of the shaft.
 */
export const MINE_HEAD_ROW: readonly DevExhibitCell[] = [0, 1, 2].map((i) => {
  const side = 7 + i * 2;
  const cell: DevExhibitCell = {
    id: `mine_head_${side}`,
    archetype: "mine_head",
    theme: DEV_THEMES[i % DEV_THEMES.length] as string,
    roof: i === 2 ? "hip" : "gable",
    floors: 1,
    size: [side, 8, side],
    params: { basement: UNDERGROUND_EXHIBIT_DEPTH },
  };
  return cell;
});

/** Both rows, in grid order. */
export const UNDERGROUND_EXHIBIT_ROWS: readonly DevExhibitRow[] = Object.freeze([
  { row: "cellar_styles", cells: CELLAR_STYLE_ROW },
  { row: "mine_shafts", cells: MINE_HEAD_ROW },
]);

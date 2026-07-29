/**
 * The exhibit vocabulary the dev-world grid and its rows agree on.
 *
 * A leaf module, and that is its whole reason for existing. Round E wired four
 * exhibit files into one grid and found the cycle immediately: the rows needed
 * the grid's themes and its cell type, and the grid needed the rows. Anything
 * two of those files share therefore lives *below* both of them, here, where
 * nothing imports back up.
 */

import { MATERIAL_THEMES, type BuildingArchetype } from "@terrainist/stdlib";

/** The themes the grid walks through, in this order. */
export const DEV_THEMES: readonly string[] = MATERIAL_THEMES.map((t) => t.id);

/** The roof shapes the grid walks through, in this order. */
export const DEV_ROOFS = ["gable", "hip", "flat"] as const;

/**
 * One exhibit cell, before the grid gives it a position.
 *
 * `params` is the escape hatch every row past the first needed: the base grid
 * has a column for size, storeys, theme and roof and for nothing else, and a
 * wing, an archetype-intrinsic window shape and a prop's length are all things
 * a row has to be able to say. The grid reads it through an explicit
 * whitelist, so an unimplemented param can no more reach the grammar from here
 * than it can from a document.
 */
export interface DevExhibitCell {
  readonly id: string;
  readonly archetype: BuildingArchetype;
  readonly theme: string;
  readonly roof: string;
  readonly floors: number;
  readonly size: readonly [number, number, number];
  /** Extra generator params for this cell. */
  readonly params?: Readonly<Record<string, unknown>>;
}

/** One dev-world row: a label and its cells, west to east. */
export interface DevExhibitRow {
  readonly row: string;
  readonly cells: readonly DevExhibitCell[];
}

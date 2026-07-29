/**
 * Dev-world exhibit rows for multi-rect footprints — the L and the T.
 *
 * A wing is the first thing the grammar builds that is not a box, and it is
 * exactly the kind of change the dev world exists for: the defects it can
 * produce (a hole at the elbow, a roof valley that leaks, a shutter hung round
 * a corner, a lantern-less back room) are all things you see instantly on a
 * flat plain and never find in a village on a hillside.
 *
 * Two rows, and the split between them is the point:
 *
 * - **`footprint_l`** — the wing flush with one end of its face, on each of the
 *   four sides in turn, then the same L again at each roof shape. Every cell
 *   has a *reflex* corner, which is the geometry the outline tracer had to be
 *   generalized for.
 * - **`footprint_t`** — the wing centred on its face, so the plan has two
 *   reflex corners and two notches. A T is the case where the eave course has
 *   to close two elbows and the roof has to clip two valleys.
 *
 * The rows are written here rather than in `devworld.ts` because that file is
 * shared ground between parallel tracks; `devworld-rows.ts` is the seam that
 * collects them, and Round E wires the import.
 */

import { MATERIAL_THEMES, type BuildingArchetype, type BuildingWing } from "@terrainist/stdlib";

/**
 * One exhibit cell.
 *
 * Structurally the `DevExhibit` fields `devworld.ts` fills in per row — id,
 * archetype, theme, roof, floors, size — plus the `params` this row needs and
 * the base grid has no column for. A wirer that spreads `params` over the job's
 * params gets a wing; one that ignores it gets a plain rect, which is a
 * degradation rather than a break.
 */
export interface ExhibitCell {
  readonly id: string;
  readonly archetype: BuildingArchetype;
  readonly theme: string;
  readonly roof: string;
  readonly floors: number;
  readonly size: readonly [number, number, number];
  /** Extra generator params for this cell — here, always a `wing`. */
  readonly params?: { readonly wing: BuildingWing };
}

/** One dev-world row: a label and its cells, west to east. */
export interface ExhibitRow {
  readonly row: string;
  readonly cells: readonly ExhibitCell[];
}

/** The themes these rows cycle, so the two rows are comparable cell for cell. */
const THEMES = MATERIAL_THEMES.map((t) => t.id);

/**
 * The envelope every footprint exhibit uses.
 *
 * One size across both rows, deliberately: the variable under test is the
 * *plan*, and a row that also grew would confound the two. 13 × 13 is the
 * smallest square that leaves a 4-deep wing with 10 blocks of main block behind
 * it, which is enough for the stair run and the chimney to both still fit.
 */
const ENVELOPE: readonly [number, number, number] = [13, 9, 13];

/** Wing depth and run, shared by both rows. */
const WING_DEPTH = 4;
const WING_RUN = 5;

/** The wing for a flush L on `side` — hard against the min-corner end. */
function ellWing(side: BuildingWing["side"]): BuildingWing {
  const alongX = side === "north" || side === "south";
  return {
    size: alongX ? [WING_RUN, WING_DEPTH] : [WING_DEPTH, WING_RUN],
    side,
    offset: 0,
  };
}

/** The wing for a T on `side` — centred on the face. */
function teeWing(side: BuildingWing["side"]): BuildingWing {
  const alongX = side === "north" || side === "south";
  const box = alongX ? ENVELOPE[0] : ENVELOPE[2];
  return {
    size: alongX ? [WING_RUN, WING_DEPTH] : [WING_DEPTH, WING_RUN],
    side,
    offset: (box - WING_RUN) >> 1,
  };
}

const SIDES = ["north", "east", "south", "west"] as const;

/** The roof shapes the last three cells of each row walk through. */
const ROOFS = ["gable", "hip", "flat"] as const;

function rowFor(
  label: string,
  wingOf: (side: BuildingWing["side"]) => BuildingWing,
): ExhibitRow {
  const cells: ExhibitCell[] = [];
  // Four cells: one wing per side, at the default roof. This is the rotation
  // exhibit — the same plan turned four ways, which is what makes a yaw bug
  // visible as an asymmetry across the four rather than as "that one looks odd".
  for (const [i, side] of SIDES.entries()) {
    cells.push({
      id: `${label}_${side}`,
      archetype: "cottage",
      theme: THEMES[i % THEMES.length] as string,
      roof: "gable",
      floors: 1,
      size: ENVELOPE,
      params: { wing: wingOf(side) },
    });
  }
  // Three more: one south wing under each roof shape, so the valley is shown
  // against the hip and the flat as well as the gable it was designed for.
  for (const [i, roof] of ROOFS.entries()) {
    cells.push({
      id: `${label}_roof_${roof}`,
      archetype: "cottage",
      theme: THEMES[i % THEMES.length] as string,
      roof,
      floors: 2,
      size: ENVELOPE,
      params: { wing: wingOf("south") },
    });
  }
  return { row: label, cells };
}

/** The L row: a wing flush with the corner, on every side and every roof. */
export const FOOTPRINT_L_ROW: ExhibitRow = rowFor("footprint_l", ellWing);

/** The T row: the same wing centred on its face. */
export const FOOTPRINT_T_ROW: ExhibitRow = rowFor("footprint_t", teeWing);

/** Both rows, in grid order. Registered from `devworld-rows.ts`. */
export const FOOTPRINT_EXHIBIT_ROWS: readonly ExhibitRow[] = Object.freeze([
  FOOTPRINT_L_ROW,
  FOOTPRINT_T_ROW,
]);

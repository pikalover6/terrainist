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
import { BLITZ_EXHIBIT_ROWS } from "./exhibits/blitz.js";
import { BREAKPOINT_EXHIBIT_ROWS } from "./exhibits/breakpoints.js";
import { DEPTHS_EXHIBIT_ROWS } from "./exhibits/depths.js";
import { ARCANA_EXHIBIT_ROWS } from "./exhibits/arcana.js";
import { RELIC_EXHIBIT_ROWS } from "./exhibits/relic.js";
import { SPECTACLE_EXHIBIT_ROWS } from "./exhibits/spectacle.js";
import { FAITH_EXHIBIT_ROWS } from "./exhibits/faith.js";
import { FOOTPRINT_EXHIBIT_ROWS } from "./exhibits/footprints.js";
import { GARRISON_EXHIBIT_ROWS } from "./exhibits/garrison.js";
import { HIGHRISE_EXHIBIT_ROWS } from "./exhibits/highrise.js";
import { HOMESTEAD_EXHIBIT_ROWS } from "./exhibits/homestead.js";
import { INSTITUTION_EXHIBIT_ROWS } from "./exhibits/institution.js";
import { COMMERCE_EXHIBIT_ROWS } from "./exhibits/commerce.js";
import { LEISURE_EXHIBIT_ROWS } from "./exhibits/leisure.js";
import { REGIONAL_EXHIBIT_ROWS } from "./exhibits/regional.js";
import { RESIDENTIAL_EXHIBIT_ROWS } from "./exhibits/residential.js";
import { SCIENCE_EXHIBIT_ROWS } from "./exhibits/science.js";
import { SEED_EXHIBIT_ROWS } from "./exhibits/seeds.js";
import { TERMINUS_EXHIBIT_ROWS } from "./exhibits/terminus.js";
import { SIEGEWORKS_EXHIBIT_ROWS } from "./exhibits/siegeworks.js";
import { TOWN_EXHIBIT_ROWS } from "./exhibits/town.js";
import { TRADE_EXHIBIT_ROWS } from "./exhibits/trade.js";
import type { DevExhibitRow } from "./exhibits/types.js";
import { UNDERGROUND_EXHIBIT_ROWS } from "./exhibits/underground.js";
import { VERNACULAR_EXHIBIT_ROWS } from "./exhibits/vernacular.js";
import { SANCTUM_EXHIBIT_ROWS } from "./exhibits/sanctum.js";
import { CLASSICAL_EXHIBIT_ROWS } from "./exhibits/classical.js";
import { XENO_EXHIBIT_ROWS } from "./exhibits/xeno.js";
import { AGRARIAN_EXHIBIT_ROWS } from "./exhibits/agrarian.js";
import { NAUTICAL_EXHIBIT_ROWS } from "./exhibits/nautical.js";
import { ARCANE_PACK_EXHIBIT_ROWS } from "./exhibits/arcane.js";
import { WILDS_EXHIBIT_ROWS } from "./exhibits/wilds.js";
import { FRONTIER_EXHIBIT_ROWS } from "./exhibits/frontier.js";
import { NILE_EXHIBIT_ROWS } from "./exhibits/nile.js";
import { EASTERN_EXHIBIT_ROWS } from "./exhibits/eastern.js";

/** The nordic_viking rows, for tests that assert on the gradient. */
export { NORSE_EXHIBIT_ROWS, NORSE_ROW_LENGTH, norseSizeFor } from "./exhibits/norse.js";

/** The mesoamerican_jungle rows, for tests that assert on the gradient. */
export {
  MESOAMERICAN_EXHIBIT_ROWS,
  MESOAMERICAN_ROW_LENGTH,
  mesoamericanSizeFor,
} from "./exhibits/mesoam.js";
import { NORSE_EXHIBIT_ROWS } from "./exhibits/norse.js";
import { MESOAMERICAN_EXHIBIT_ROWS } from "./exhibits/mesoam.js";
import { WAVE2_EXHIBIT_ROWS } from "./exhibits/wave2.js";
import { WORKS_EXHIBIT_ROWS } from "./exhibits/works.js";
import { INDUSTRY_EXHIBIT_ROWS } from "./exhibits/industry.js";
import { UTILITY_EXHIBIT_ROWS } from "./exhibits/utility.js";

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
 * The vehicle grid: the transport-air and transport-water craft.
 *
 * Re-exported for the same reason the prop grid is — these are not buildings —
 * and kept separate from it because its water rows need a *harbour* rather than
 * a pond: a galleon wants 46 × 13 of open water at one level, which is an order
 * of magnitude more digging than a rowboat.
 */
export {
  VEHICLE_EXHIBIT_GAP,
  VEHICLE_EXHIBIT_PLAN,
  VEHICLE_POND_MARGIN,
  buildVehicleExhibits,
  planVehicleExhibits,
  type VehicleExhibit,
  type VehicleExhibitGrid,
  type VehicleExhibitResult,
  type VehicleExhibitRow,
} from "./exhibits/vehicles.js";

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
  // The W2 breadth blitz. Its prop rows were registered in `exhibits/props.ts`
  // from the start, but this building spread was missed when the round landed —
  // so the ten blitz archetypes had no exhibit at their own footprints until
  // now.
  ...BLITZ_EXHIBIT_ROWS,
  ...TRADE_EXHIBIT_ROWS,
  ...UNDERGROUND_EXHIBIT_ROWS,
  ...VERNACULAR_EXHIBIT_ROWS,
  // The sanctum pack: ten buildings the icon law asks for by name.
  ...SANCTUM_EXHIBIT_ROWS,
  // The classical Mediterranean pack: the forms Troy was missing.
  ...CLASSICAL_EXHIBIT_ROWS,
  // The alien pack's grown things: the invasion's own architecture.
  ...XENO_EXHIBIT_ROWS,
  // The agrarian burn-down: the farm town's working fabric.
  ...AGRARIAN_EXHIBIT_ROWS,
  // The nautical pack: the pirate island's working shore.
  ...NAUTICAL_EXHIBIT_ROWS,
  // The arcane pack: the unicorn island's magic.
  ...ARCANE_PACK_EXHIBIT_ROWS,
  // The wilds pack: the old-growth's camps.
  ...WILDS_EXHIBIT_ROWS,
  // The frontier pack: the wild west's main street.
  ...FRONTIER_EXHIBIT_ROWS,
  // The Nile pack: the necropolis and the river works.
  ...NILE_EXHIBIT_ROWS,
  // The east-asian pack: the public forms around the houses.
  ...EASTERN_EXHIBIT_ROWS,
  // The nordic_viking pack: the hall, the naust and the heath.
  ...NORSE_EXHIBIT_ROWS,
  // The mesoamerican_jungle pack: the plaza and its monuments.
  ...MESOAMERICAN_EXHIBIT_ROWS,
  ...HIGHRISE_EXHIBIT_ROWS,
  ...TOWN_EXHIBIT_ROWS,
  ...FOOTPRINT_EXHIBIT_ROWS,
  ...SEED_EXHIBIT_ROWS,
  ...BREAKPOINT_EXHIBIT_ROWS,
  ...WAVE2_EXHIBIT_ROWS,
  ...WORKS_EXHIBIT_ROWS,
  ...INSTITUTION_EXHIBIT_ROWS,
  ...LEISURE_EXHIBIT_ROWS,
  ...INDUSTRY_EXHIBIT_ROWS,
  ...UTILITY_EXHIBIT_ROWS,
  ...REGIONAL_EXHIBIT_ROWS,
  ...HOMESTEAD_EXHIBIT_ROWS,
  ...RESIDENTIAL_EXHIBIT_ROWS,
  ...GARRISON_EXHIBIT_ROWS,
  ...FAITH_EXHIBIT_ROWS,
  ...COMMERCE_EXHIBIT_ROWS,
  ...SCIENCE_EXHIBIT_ROWS,
  ...ARCANA_EXHIBIT_ROWS,
  // Wave six A, the transport buildings.
  ...TERMINUS_EXHIBIT_ROWS,
  ...SIEGEWORKS_EXHIBIT_ROWS,
  ...RELIC_EXHIBIT_ROWS,
  ...SPECTACLE_EXHIBIT_ROWS,
  ...DEPTHS_EXHIBIT_ROWS,
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

/** The wave-two rows, for tests that assert on the gradient itself. */
export { WAVE2_EXHIBIT_ROWS, WAVE2_ROW_LENGTH, wave2SizeFor } from "./exhibits/wave2.js";

/** The wave-3B works rows, for tests that assert on the gradient itself. */
export { WORKS_EXHIBIT_ROWS, WORKS_ROW_LENGTH, worksSizeFor } from "./exhibits/works.js";
/** The institution rows, for tests that assert on the gradient itself. */
export {
  INSTITUTION_EXHIBIT_ROWS,
  INSTITUTION_ROW_LENGTH,
  institutionSizeFor,
} from "./exhibits/institution.js";
/** The wave-5B commerce rows, for tests that assert on the gradient itself. */
export {
  COMMERCE_EXHIBIT_ROWS,
  COMMERCE_ROW_LENGTH,
  commerceSizeFor,
} from "./exhibits/commerce.js";
/** The wave-6A transport rows, for tests that assert on the gradient itself. */
export {
  TERMINUS_EXHIBIT_ROWS,
  TERMINUS_ROW_LENGTH,
  terminusSizeFor,
} from "./exhibits/terminus.js";
/** The wave-5D science rows, for tests that assert on the gradient itself. */
export { SCIENCE_EXHIBIT_ROWS, SCIENCE_ROW_LENGTH, scienceSizeFor } from "./exhibits/science.js";
/** The wave-4C leisure rows, for tests that assert on the gradient itself. */
export { LEISURE_EXHIBIT_ROWS, LEISURE_ROW_LENGTH, leisureSizeFor } from "./exhibits/leisure.js";
/** The wave-5C industry rows, for tests that assert on the gradient itself. */
export {
  INDUSTRY_EXHIBIT_ROWS,
  INDUSTRY_ROW_LENGTH,
  industrySizeFor,
} from "./exhibits/industry.js";
/** The wave-6C waterworks-and-energy rows, for tests that assert on the gradient. */
export {
  UTILITY_EXHIBIT_ROWS,
  UTILITY_ROW_LENGTH,
  utilitySizeFor,
} from "./exhibits/utility.js";
/** The wave-three regional rows, for tests that assert on the gradient. */
export {
  REGIONAL_EXHIBIT_ROWS,
  REGIONAL_ROW_LENGTH,
  regionalSizeFor,
} from "./exhibits/regional.js";

/** The wave-four homestead rows, for tests that assert on the gradient. */
export {
  HOMESTEAD_EXHIBIT_ROWS,
  HOMESTEAD_ROW_LENGTH,
  homesteadSizeFor,
} from "./exhibits/homestead.js";
/** The wave-four A residential rows, for tests that assert on the gradient. */
export {
  RESIDENTIAL_EXHIBIT_ROWS,
  RESIDENTIAL_ROW_LENGTH,
  residentialSizeFor,
} from "./exhibits/residential.js";
/** The wave-five A garrison rows, for tests that assert on the gradient. */
export {
  GARRISON_EXHIBIT_ROWS,
  GARRISON_ROW_LENGTH,
  garrisonSizeFor,
} from "./exhibits/garrison.js";
/** The wave-4B faith rows, for tests that assert on the gradient. */
export { FAITH_EXHIBIT_ROWS, FAITH_ROW_LENGTH, faithSizeFor } from "./exhibits/faith.js";

/** The siegeworks rows, for tests that assert on the gradient. */
export {
  SIEGEWORKS_EXHIBIT_ROWS,
  SIEGEWORKS_ROW_LENGTH,
  siegeworksSizeFor,
} from "./exhibits/siegeworks.js";

/** The sanctum-pack rows, for tests that assert on the gradient. */
export { SANCTUM_EXHIBIT_ROWS, SANCTUM_ROW_LENGTH, sanctumSizeFor } from "./exhibits/sanctum.js";

/** The classical Mediterranean rows, for tests that assert on the gradient. */
export {
  CLASSICAL_EXHIBIT_ROWS,
  CLASSICAL_ROW_LENGTH,
  classicalSizeFor,
} from "./exhibits/classical.js";

/** The xeno rows, for tests that assert on the gradient. */
export { XENO_EXHIBIT_ROWS, XENO_ROW_LENGTH, xenoSizeFor } from "./exhibits/xeno.js";

/** The agrarian rows, for tests that assert on the gradient. */
export {
  AGRARIAN_EXHIBIT_ROWS,
  AGRARIAN_ROW_LENGTH,
  agrarianSizeFor,
} from "./exhibits/agrarian.js";

/** The nautical rows, for tests that assert on the gradient. */
export {
  NAUTICAL_EXHIBIT_ROWS,
  NAUTICAL_ROW_LENGTH,
  nauticalSizeFor,
} from "./exhibits/nautical.js";

/** The arcane pack rows, for tests that assert on the gradient. */
export {
  ARCANE_PACK_EXHIBIT_ROWS,
  ARCANE_PACK_ROW_LENGTH,
  arcanePackSizeFor,
} from "./exhibits/arcane.js";

/** The wilds rows, for tests that assert on the gradient. */
export { WILDS_EXHIBIT_ROWS, WILDS_ROW_LENGTH, wildsSizeFor } from "./exhibits/wilds.js";

/** The frontier rows, for tests that assert on the gradient. */
export {
  FRONTIER_EXHIBIT_ROWS,
  FRONTIER_ROW_LENGTH,
  frontierSizeFor,
} from "./exhibits/frontier.js";

/** The Nile rows, for tests that assert on the gradient. */
export { NILE_EXHIBIT_ROWS, NILE_ROW_LENGTH, nileSizeFor } from "./exhibits/nile.js";

/** The east-asian rows, for tests that assert on the gradient. */
export {
  EASTERN_EXHIBIT_ROWS,
  EASTERN_ROW_LENGTH,
  easternSizeFor,
} from "./exhibits/eastern.js";

/** The wave-5E arcana rows, for tests that assert on the gradient. */
export { ARCANA_EXHIBIT_ROWS, ARCANA_ROW_LENGTH, arcanaSizeFor } from "./exhibits/arcana.js";

/** The wave-6E relic rows, for tests that assert on the gradient. */
export { RELIC_EXHIBIT_ROWS, RELIC_ROW_LENGTH, relicSizeFor } from "./exhibits/relic.js";
/** The wave-6D spectacle rows, for tests that assert on the gradient. */
export {
  SPECTACLE_EXHIBIT_ROWS,
  SPECTACLE_ROW_LENGTH,
  spectacleSizeFor,
} from "./exhibits/spectacle.js";
/** The wave-six depths rows, for tests that assert on the gradient. */
export { DEPTHS_EXHIBIT_ROWS, DEPTHS_ROW_LENGTH, depthsSizeFor } from "./exhibits/depths.js";

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

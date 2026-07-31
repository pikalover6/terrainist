/**
 * Structure generators — the voxel half of the settlement profile.
 *
 * A thin barrel. The grammar lives in two files so parallel work does not
 * collide on one:
 *
 * - `core.ts` — SHAPE: footprint and perimeter geometry, walls, windows, doors
 *   and entrances, roofs (gable/hip/flat, eaves, gable ends, ridge caps),
 *   stairs, ladders, the cellar shell, the watchtower, `LocalVoxelOp` and the
 *   `rotateOps` family, and the theme/style plumbing.
 * - `archetypes.ts` — CONTENTS: the tag → archetype mapping and every
 *   archetype's fit-out, including the cellar's.
 * - `themes.ts` — the material palettes.
 * - `props.ts` — vehicle/prop grammars (seam; see the file).
 *
 * Everything either file exports is re-exported here, so `structures/index.js`
 * remains the one import path callers need.
 */

export * from "./core.js";
export * from "./highrise.js";
export * from "./catalog.js";
export * from "./archetypes.js";
export * from "./themes.js";
export * from "./props.js";
export * from "./aircraft.js";
export * from "./ships.js";
export * from "./aircraft-wave6.js";
export * from "./ships-wave6.js";
export * from "./railcraft.js";
export * from "./props-blitz.js";
export * from "./props-street.js";
export * from "./props-amusement.js";
export * from "./props-wayside.js";
export * from "./props-relics.js";
export * from "./archetypes-town.js";
export * from "./archetypes-trade.js";
export * from "./archetypes-vernacular.js";
export * from "./archetypes-wave2.js";
export * from "./archetypes-works.js";
export * from "./archetypes-institution.js";
export * from "./archetypes-leisure.js";
export * from "./archetypes-industry.js";
export * from "./archetypes-residential.js";
export * from "./archetypes-commerce.js";
export * from "./archetypes-terminus.js";
export * from "./archetypes-garrison.js";
export * from "./archetypes-science.js";
export * from "./archetypes-regional.js";
export * from "./archetypes-homestead.js";
export * from "./archetypes-faith.js";
export * from "./archetypes-arcana.js";
export * from "./archetypes-relic.js";

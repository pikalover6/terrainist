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
export * from "./archetypes.js";
export * from "./themes.js";

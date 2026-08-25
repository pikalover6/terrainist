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
export * from "./terrace.js";
export * from "./catalog.js";
export * from "./form-packs.js";
// The per-run candidate menu (WS-A2): a read-only view over the two registries
// above, conditioned on a classified intent.
export * from "./registry-export.js";
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
export * from "./props-energy.js";
export * from "./props-amusement.js";
export * from "./props-wayside.js";
export * from "./props-relics.js";
export * from "./props-spectacle.js";
// The arcane & magical pack (CATALOG-EXPANSION §3.3), prop half.
export * from "./props-arcane.js";
// The East Asian pack (CATALOG-EXPANSION §3.9), prop half.
export * from "./props-eastern.js";
export * from "./props-classical.js";
export * from "./props-xeno.js";
export * from "./props-corsair.js";
export * from "./props-nile.js";
export * from "./archetypes-town.js";
export * from "./archetypes-trade.js";
export * from "./archetypes-vernacular.js";
export * from "./archetypes-wave2.js";
export * from "./archetypes-works.js";
export * from "./archetypes-institution.js";
export * from "./archetypes-leisure.js";
export * from "./archetypes-industry.js";
export * from "./archetypes-utility.js";
export * from "./archetypes-residential.js";
export * from "./archetypes-commerce.js";
export * from "./archetypes-terminus.js";
export * from "./archetypes-garrison.js";
export * from "./archetypes-siegeworks.js";
export * from "./archetypes-classical-b.js";
export * from "./props-classical-b.js";
export * from "./props-response.js";
export * from "./props-brine.js";
export * from "./props-wilds.js";
export * from "./props-hedgerow.js";
export * from "./props-frontier.js";
// --- nordic_viking pack ---
export * from "./props-norse.js";
export * from "./archetypes-norse.js";
// --- steppe_nomad pack ---
export * from "./props-steppe.js";
export * from "./archetypes-steppe.js";
// --- dwarven_volcanic pack ---
export * from "./archetypes-dwarven.js";
// --- atlantean pack ---
export * from "./props-atlantean.js";
// --- swamp_witch pack ---
export * from "./props-swamp.js";
export * from "./archetypes-swamp.js";
// --- desert_caravanserai pack ---
export * from "./props-caravan.js";
export * from "./archetypes-caravan.js";
// --- himalayan_monastery pack ---
export * from "./props-himalayan.js";
export * from "./archetypes-himalayan.js";
// --- feudal_japanese pack ---
export * from "./props-feudal.js";
export * from "./archetypes-feudal.js";
export * from "./archetypes-depths.js";
export * from "./archetypes-science.js";
export * from "./archetypes-regional.js";
export * from "./archetypes-homestead.js";
export * from "./archetypes-agrarian.js";
export * from "./archetypes-faith.js";
export * from "./archetypes-arcana.js";
export * from "./archetypes-relic.js";
export * from "./decay.js";
export * from "./support.js";
export * from "./greenery.js";
export * from "./archetypes-spectacle.js";
// The infrastructure-entry registry (`docs/INFRA-ENTRIES-v0.md` §3.3).
export * from "./infra-entries.js";

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

export { StructureRegistry, createStructureRegistry, findByTag, isBuildingDescriptor, isPropDescriptor, type DescriptorKind, type BuildingFacadeDefaults, type DescriptorCatalog, type BuildingDescriptor, type PropDescriptor, type StructureDescriptor } from "./descriptor.js";
export { BUILDING_STYLE_DEFAULTS, type BuildingDoor, type BuildingMeta, type BuildingParams, type BuildingWing, type Cardinal, CARDINALS, DEFAULT_BASEMENT_DEPTH, DEFAULT_ORNAMENT_DENSITY, type LocalRect, type LocalVoxelOp, MAX_BASEMENT_DEPTH, MAX_FLOORS, MAX_ROOF_LAYERS, MAX_STORY_HEIGHT, MIN_BASEMENT_DEPTH, MIN_MAIN_DEPTH, MIN_STORY_HEIGHT, MIN_WING_DEPTH, MIN_WING_OVERLAP, ROOF_RESERVE, type StructureYaw, generateBuilding, resolveFootprint, rotateCells, rotateLocalColumn, rotateOps, traceShell, rotateFacing, yawBetween } from "./core.js";
export { HIGHRISE_ARCHETYPES, HIGHRISE_MAX_FLOORS, HIGHRISE_MAX_WIDTH, HIGHRISE_MIN_WIDTH, isHighriseArchetype } from "./highrise.js";
export { TERRACE_MIN_FRONTAGE, type TerraceBay, planTerrace, terraceMinDepth } from "./terrace.js";
export { STRUCTURE_CATEGORIES, STRUCTURE_KINDS, STRUCTURE_STATUSES, STRUCTURE_CATALOG, NON_NODE_IMPLEMENTED, structureById, structuresInCategory, structuresWithStatus, summarizeCatalog, type StructureCategory, type StructureKind, type StructureStatus, type StructureEntry, type CatalogSummary } from "./catalog.js";
export { FORM_PACKS, formPackById, formPackIds, formPackMembers, type FormPack } from "./form-packs.js";
export { BUILDING_ARCHETYPES, type BuildingArchetype, buildingRegistry, BUILDING_DESCRIPTORS_IN_HISTORICAL_ORDER, archetypeOfTags, resolveArchetype, archetypeFacadeDefaults, furnish, furnishCellar } from "./archetypes.js";
export { ALL_MATERIAL_THEMES, MATERIAL_THEMES, type BuildingMaterials, type MaterialTheme, type WoodSet, type StoneSet, type RoofSet, MODERN_CITY_THEME_ID, SUN_CLAY_THEME, assignMaterials, materialKey, pickTheme, styleOf } from "./themes.js";
export { PROP_DESCRIPTORS, PROP_NAMES, type PropName, isPropName, PROP_GENERATORS, propRegistry, propFootprint, generateProp, type PropBase, resolvePropPalette } from "./props.js";
export { AIRCRAFT_PROP_NAMES, AIRCRAFT_FOOTPRINTS, RUNWAY_LENGTH, RUNWAY_WIDTH } from "./aircraft.js";
export { SHIP_PROP_NAMES, SHIP_FOOTPRINTS } from "./ships.js";
export { AIRCRAFT6_PROP_NAMES } from "./aircraft-wave6.js";
export { SHIP6_PROP_NAMES } from "./ships-wave6.js";
export { RAILCRAFT_PROP_NAMES } from "./railcraft.js";
export { CLASSICAL_A_PROP_EXHIBIT_PLAN } from "./props-classical.js";
export { CORSAIR_PROP_EXHIBIT_PLAN } from "./props-corsair.js";
export { ENERGY_PROP_EXHIBIT_PLAN } from "./props-energy.js";
export { NILE_PROP_EXHIBIT_PLAN } from "./props-nile.js";
export { RELIC_PROP_EXHIBIT_PLAN } from "./props-relics.js";
export { SPECTACLE_PROP_EXHIBIT_PLAN } from "./props-spectacle.js";
export { STREET_PROP_EXHIBIT_PLAN } from "./props-street.js";
export { WAYSIDE_PROP_EXHIBIT_PLAN } from "./props-wayside.js";
export { XENO_PROP_EXHIBIT_PLAN } from "./props-xeno.js";
export { AGRARIAN_BUILDING_ARCHETYPES, agrarianFacadeDefaults } from "./archetypes-agrarian.js";
export { ARCANA_BUILDING_ARCHETYPES, arcanaFacadeDefaults } from "./archetypes-arcana.js";
export { ARCANE_BUILDING_ARCHETYPES, arcaneFacadeDefaults } from "./archetypes-arcane.js";
export { ATLANTEAN_BUILDING_ARCHETYPES, atlanteanFacadeDefaults } from "./archetypes-atlantean.js";
export { BLITZ_BUILDING_ARCHETYPES, blitzFacadeDefaults } from "./archetypes-blitz.js";
export { BRINE_BUILDING_ARCHETYPES, brineFacadeDefaults } from "./archetypes-brine.js";
export { CARAVAN_BUILDING_ARCHETYPES, caravanFacadeDefaults } from "./archetypes-caravan.js";
export { EXTENDED_BUILDING_ARCHETYPES } from "./archetypes-civic.js";
export { CLASSICAL_BUILDING_ARCHETYPES, classicalFacadeDefaults } from "./archetypes-classical.js";
export { CLASSICAL_B_BUILDING_ARCHETYPES, classicalBFacadeDefaults } from "./archetypes-classical-b.js";
export { COMMERCE_BUILDING_ARCHETYPES, commerceFacadeDefaults } from "./archetypes-commerce.js";
export { CORSAIR_BUILDING_ARCHETYPES, corsairFacadeDefaults } from "./archetypes-corsair.js";
export { DEPTHS_BUILDING_ARCHETYPES, depthsFacadeDefaults } from "./archetypes-depths.js";
export { DWARVEN_BUILDING_ARCHETYPES, dwarvenFacadeDefaults } from "./archetypes-dwarven.js";
export { EASTERN_BUILDING_ARCHETYPES, easternFacadeDefaults } from "./archetypes-eastern.js";
export { FAITH_BUILDING_ARCHETYPES, faithFacadeDefaults } from "./archetypes-faith.js";
export { FEUDAL_BUILDING_ARCHETYPES, feudalFacadeDefaults } from "./archetypes-feudal.js";
export { FRONTIER_BUILDING_ARCHETYPES, frontierFacadeDefaults } from "./archetypes-frontier.js";
export { GARRISON_BUILDING_ARCHETYPES, garrisonFacadeDefaults } from "./archetypes-garrison.js";
export { HEDGEROW_BUILDING_ARCHETYPES, hedgerowFacadeDefaults } from "./archetypes-hedgerow.js";
export { HIMALAYAN_BUILDING_ARCHETYPES, himalayanFacadeDefaults } from "./archetypes-himalayan.js";
export { HOMESTEAD_BUILDING_ARCHETYPES, homesteadFacadeDefaults } from "./archetypes-homestead.js";
export { INDUSTRY_BUILDING_ARCHETYPES, industryFacadeDefaults } from "./archetypes-industry.js";
export { INSTITUTION_BUILDING_ARCHETYPES, institutionFacadeDefaults } from "./archetypes-institution.js";
export { LEISURE_BUILDING_ARCHETYPES, leisureFacadeDefaults } from "./archetypes-leisure.js";
export { MESOAMERICAN_BUILDING_ARCHETYPES, mesoamericanFacadeDefaults } from "./archetypes-mesoamerican.js";
export { NILE_BUILDING_ARCHETYPES, nileFacadeDefaults } from "./archetypes-nile.js";
export { NORSE_BUILDING_ARCHETYPES, norseFacadeDefaults } from "./archetypes-norse.js";
export { REGIONAL_BUILDING_ARCHETYPES, regionalFacadeDefaults } from "./archetypes-regional.js";
export { RELIC_BUILDING_ARCHETYPES, relicFacadeDefaults } from "./archetypes-relic.js";
export { RESIDENTIAL_BUILDING_ARCHETYPES, residentialFacadeDefaults } from "./archetypes-residential.js";
export { SANCTUM_BUILDING_ARCHETYPES, sanctumFacadeDefaults } from "./archetypes-sanctum.js";
export { SCIENCE_BUILDING_ARCHETYPES, scienceFacadeDefaults } from "./archetypes-science.js";
export { SIEGEWORKS_BUILDING_ARCHETYPES, siegeworksFacadeDefaults } from "./archetypes-siegeworks.js";
export { SPECTACLE_BUILDING_ARCHETYPES, spectacleFacadeDefaults } from "./archetypes-spectacle.js";
export { STEPPE_BUILDING_ARCHETYPES, steppeFacadeDefaults } from "./archetypes-steppe.js";
export { SWAMP_BUILDING_ARCHETYPES, swampFacadeDefaults } from "./archetypes-swamp.js";
export { TERMINUS_BUILDING_ARCHETYPES, terminusFacadeDefaults } from "./archetypes-terminus.js";
export { TOWN_BUILDING_ARCHETYPES, townFacadeDefaults } from "./archetypes-town.js";
export { TRADE_BUILDING_ARCHETYPES, tradeFacadeDefaults } from "./archetypes-trade.js";
export { UTILITY_BUILDING_ARCHETYPES, utilityFacadeDefaults } from "./archetypes-utility.js";
export { VERNACULAR_BUILDING_ARCHETYPES, vernacularFacadeDefaults } from "./archetypes-vernacular.js";
export { WAVE2_BUILDING_ARCHETYPES, wave2FacadeDefaults } from "./archetypes-wave2.js";
export { WILDS_BUILDING_ARCHETYPES, wildsFacadeDefaults } from "./archetypes-wilds.js";
export { WORKS_BUILDING_ARCHETYPES, worksFacadeDefaults } from "./archetypes-works.js";
export { XENO_BUILDING_ARCHETYPES, xenoFacadeDefaults } from "./archetypes-xeno.js";
export { DECAY_BANDS, RUIN_ONSET, bandForDecline, bandForIntensity, greenSkinShares, ruinShare, weatheredOf, type DecayBand } from "./decay.js";
export { needsGround, bodyBlocking, bodyFits, canSupport } from "./support.js";
export { GROWTH_FACES, chooseGrowthFace, growthFaces, ownGrowthFaces, isMultifaceGrowth } from "./greenery.js";
export { INFRA_ENTRIES, INFRA_TEST_ENTRY, type InfraAreaCell, type InfraContext, type InfraEntryDef, type InfraRouteForm, type InfraSpanDef, type InfraSweptProfile, infraEntry } from "./infra-entries.js";
export { CELLAR_STYLES, UNDERGROUND_ARCHETYPES, resolveCellarStyle } from "./underground.js";
export { bulkheadCells, ellipseRadius, octaDisc, ringCells } from "./aircraft.js";
export { isAgrarianArchetype } from "./archetypes-agrarian.js";
export { isArcanaArchetype } from "./archetypes-arcana.js";
export { isArcaneArchetype } from "./archetypes-arcane.js";
export { isAtlanteanArchetype } from "./archetypes-atlantean.js";
export { isBlitzArchetype } from "./archetypes-blitz.js";
export { isBrineArchetype } from "./archetypes-brine.js";
export { isCaravanArchetype } from "./archetypes-caravan.js";
export { ROOF_FLOURISH_RISE } from "./archetypes-civic.js";
export { isClassicalBArchetype } from "./archetypes-classical-b.js";
export { isClassicalArchetype } from "./archetypes-classical.js";
export { isCommerceArchetype } from "./archetypes-commerce.js";
export { isCorsairArchetype } from "./archetypes-corsair.js";
export { depthsArchetypeOfTags, isDepthsArchetype } from "./archetypes-depths.js";
export { isDwarvenArchetype } from "./archetypes-dwarven.js";
export { isEasternArchetype } from "./archetypes-eastern.js";
export { isFaithArchetype } from "./archetypes-faith.js";
export { isFeudalArchetype } from "./archetypes-feudal.js";
export { isFrontierArchetype } from "./archetypes-frontier.js";
export { isGarrisonArchetype } from "./archetypes-garrison.js";
export { isHedgerowArchetype } from "./archetypes-hedgerow.js";
export { isHimalayanArchetype } from "./archetypes-himalayan.js";
export { isHomesteadArchetype } from "./archetypes-homestead.js";
export { isIndustryArchetype } from "./archetypes-industry.js";
export { isInstitutionArchetype } from "./archetypes-institution.js";
export { isLeisureArchetype } from "./archetypes-leisure.js";
export { isMesoamericanArchetype } from "./archetypes-mesoamerican.js";
export { isNileArchetype } from "./archetypes-nile.js";
export { isNorseArchetype } from "./archetypes-norse.js";
export { isRegionalArchetype } from "./archetypes-regional.js";
export { RELIC_DECAY_PROFILES, isRelicArchetype } from "./archetypes-relic.js";
export { isResidentialArchetype } from "./archetypes-residential.js";
export { isSanctumArchetype } from "./archetypes-sanctum.js";
export { isScienceArchetype } from "./archetypes-science.js";
export { isSiegeworksArchetype } from "./archetypes-siegeworks.js";
export { isSpectacleArchetype } from "./archetypes-spectacle.js";
export { isSteppeArchetype } from "./archetypes-steppe.js";
export { isSwampArchetype } from "./archetypes-swamp.js";
export { isTerminusArchetype } from "./archetypes-terminus.js";
export { isTownArchetype } from "./archetypes-town.js";
export { isTradeArchetype } from "./archetypes-trade.js";
export { isUtilityArchetype } from "./archetypes-utility.js";
export { isVernacularArchetype } from "./archetypes-vernacular.js";
export { isWave2Archetype, pottedAt } from "./archetypes-wave2.js";
export { isWildsArchetype } from "./archetypes-wilds.js";
export { isWorksArchetype } from "./archetypes-works.js";
export { isXenoArchetype } from "./archetypes-xeno.js";
export { cardinalStep, checkWing, footprintCovers, inRect, outlineIndex, rotateProps, type BuildingResult, type BuildingRoof } from "./core.js";
export { TIMBER_EXTRA, WEATHERED_VARIANTS, collapseForShell } from "./decay.js";
export { ENTRANCE_TREATMENT_HOSTS, ENTRANCE_TREATMENTS, isEntranceTreatment } from "./entrance-fittings.js";
export { HIGHRISE_STOREY_HEIGHT, SETBACK_MIN_FLOORS, coreDepthFor, highriseArchetypeOfTags, planTiers } from "./highrise.js";
export { INFRA_ENTRY_IDS, INFRA_ROUTE_FORMS, INFRA_ROUTE_FORMS_IMPLEMENTED, entryAcceptsRoute, isImplementedRouteForm } from "./infra-entries.js";
export { AMUSEMENT_PROP_NAMES, amusementPropFootprint, isAmusementProp } from "./props-amusement.js";
export { ARCANE_PROP_NAMES, DRAGON_D, DRAGON_L, LANTERN_MAX, LANTERN_MIN, RUNE_SPAN, arcanePropFootprint, isArcaneProp, quarterArc, ringOffsets } from "./props-arcane.js";
export { ALTAR_H, ALTAR_LINTEL, ALTAR_SPAN, ATLANTEAN_PROP_NAMES, COLOSSUS_H, COLOSSUS_SPAN, atlanteanPropFootprint, isAtlanteanProp } from "./props-atlantean.js";
export { BLITZ_PROP_NAMES, POOL_FLOOR_Y, POOL_WATER_Y, blitzPropFootprint, isBlitzProp } from "./props-blitz.js";
export { BRINE_PROP_NAMES, DAYMARK_MAX, DAYMARK_MIN, RACK_MAX, RACK_MIN, brinePropFootprint, isBrineProp } from "./props-brine.js";
export { CARAVAN_PROP_NAMES, GROVE_H, GROVE_SPAN, PACK_H, PACK_SPAN, caravanPropFootprint, isCaravanProp } from "./props-caravan.js";
export { CLASSICAL_B_PROP_NAMES, COLONNADE_MAX, COLONNADE_MIN, classicalBPropFootprint, isClassicalBProp } from "./props-classical-b.js";
export { CLASSICAL_PROP_NAMES, isClassicalProp } from "./props-classical.js";
export { CORSAIR_PROP_NAMES, isCorsairProp } from "./props-corsair.js";
export { DRAGON_BOAT_B, DRAGON_BOAT_L, EASTERN_PROP_NAMES, STONE_LANTERN_SPAN, TORII_D, TORII_LINTEL_Y, TORII_TIE_Y, TORII_W, ZEN_GARDEN_SPAN, easternPropFootprint, isEasternProp } from "./props-eastern.js";
export { ENERGY_PROP_NAMES, TURBINE_HEIGHT_DEFAULT, energyPropFootprint, isEnergyProp } from "./props-energy.js";
export { FEUDAL_PROP_NAMES, KOI_H, KOI_SPAN, NOBORI_DEPTH, NOBORI_H, NOBORI_POLE, NOBORI_SPAN, TORO_H, TORO_SPAN, feudalPropFootprint, isFeudalProp } from "./props-feudal.js";
export { BOOT_D, BOOT_H, BOOT_MARKER_MAX, BOOT_MARKER_MIN, BOOT_W, FRONTIER_PROP_NAMES, PLACER_SPAN, TANK_DECK, TANK_SPAN, frontierPropFootprint, isFrontierProp } from "./props-frontier.js";
export { HEDGEROW_PROP_NAMES, HOP_D, HOP_MAX, HOP_MIN, PENS_D, PENS_MAX, PENS_MIN, POND_SPAN, SWEEP_SPAN, hedgerowPropFootprint, isHedgerowProp } from "./props-hedgerow.js";
export { CAIRN_H, CAIRN_SPAN, FLAG_COURSE, FLAG_DEPTH, FLAG_H, FLAG_SPAN, HIMALAYAN_PROP_NAMES, himalayanPropFootprint, isHimalayanProp } from "./props-himalayan.js";
export { FELUCCA_BEAM, FELUCCA_LENGTH, NILE_PROP_NAMES, PYRAMID_BASE, PYRAMID_HEIGHT, SACRED_LAKE_SPAN, isNileProp, nilePropFootprint } from "./props-nile.js";
export { HJELL_D, HJELL_RAIL, HJELL_W, MOUND_D, MOUND_W, NORSE_PROP_NAMES, RUNESTONE_SPAN, isNorseProp, norsePropFootprint } from "./props-norse.js";
export { RELIC_PROP_NAMES, isRelicProp, relicPropFootprint } from "./props-relics.js";
export { ARRAY_DISHES, RESPONSE_PROP_NAMES, dishStations, isResponseProp, responsePropFootprint } from "./props-response.js";
export { FERRIS_HUB, FERRIS_RADIUS, SPECTACLE_PROP_NAMES, isSpectacleProp, onFerrisRim, spectaclePropFootprint } from "./props-spectacle.js";
export { BALBAL_SPAN, OVOO_RIBBON, OVOO_SPAN, STEPPE_PROP_NAMES, TUG_SPAN, TUG_SPREAD, isSteppeProp, steppePropFootprint } from "./props-steppe.js";
export { BOLLARD_ROW_DEFAULT, STREET_PROP_NAMES, isStreetProp, streetPropFootprint } from "./props-street.js";
export { CHARM_BAR, CHARM_SPAN, CIRCLE_RADIUS, CIRCLE_SPAN, SHRINE_SPAN, SWAMP_PROP_NAMES, isSwampProp, swampPropFootprint } from "./props-swamp.js";
export { WAYSIDE_PROP_NAMES, isWaysideProp, waysidePropFootprint } from "./props-wayside.js";
export { CAMP_MAX, CAMP_MIN, SPAR_MAX, SPAR_MIN, SPAR_SPAN, STUMP_MAX, STUMP_MIN, WILDS_PROP_NAMES, isWildsProp, wildsPropFootprint } from "./props-wilds.js";
export { XENO_PROP_NAMES, isXenoProp } from "./props-xeno.js";
export { PROP_YAWS, propBounds } from "./props.js";
export { RAIL_CZ } from "./railcraft.js";
export { hullHalfAt } from "./ships.js";
export { BODY_BLOCKING, INSUBSTANTIAL, anchorNeedsFullCube, substantial, supportDirection } from "./support.js";
export { TERRACE_ARCHETYPES, TERRACE_MAX_CORNICE_RUN, TERRACE_MAX_PITCH, TERRACE_MIN_PITCH, isTerraceArchetype, snapCornice, terraceBayUse } from "./terrace.js";
export { MODERN_CITY_THEME, XENO_RESIN_THEME, XENO_RESIN_THEME_ID } from "./themes.js";
export { defaultBasementDepth, defaultCellarStyle } from "./underground.js";

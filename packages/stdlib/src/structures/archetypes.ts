/**
 * Building **contents** — archetypes and their fit-out.
 *
 * `core.ts` owns SHAPE (footprint, walls, openings, roof, stairs, the cellar
 * shell, rotation). This module owns CONTENTS: what a building is *for*, the
 * tag → archetype mapping, and the props each archetype puts on its floor.
 * Split out of `structures/index.ts` verbatim in the structures refactor;
 * `index.ts` re-exports both halves, so every existing import path is unchanged.
 */

import { positionFloat, type Seed256 } from "../determinism/index.js";

import { cardinalStep, type Cardinal, type LocalRect, type LocalVoxelOp, type Put } from "./core.js";
import {
  FloorPlan,
  EXTENDED_BUILDING_ARCHETYPES,
  extendedArchetypeOfTags,
  furnishExtended,
  furnishUpperFloors,
  furnishWing,
  isPassable,
  PropCounter,
  wholeFloorPlan,
  type FitOutContext,
} from "./archetypes-civic.js";

export * from "./archetypes-civic.js";

import {
  BLITZ_BUILDING_ARCHETYPES,
  blitzArchetypeOfTags,
  furnishBlitz,
} from "./archetypes-blitz.js";

export * from "./archetypes-blitz.js";

import {
  TOWN_BUILDING_ARCHETYPES,
  furnishTown,
  townArchetypeOfTags,
} from "./archetypes-town.js";

// The trade wave is *not* re-exported here: `structures/index.ts` exports it
// directly, and exporting it twice through the same barrel is an ambiguity
// TypeScript resolves by dropping the names.
import {
  TRADE_BUILDING_ARCHETYPES,
  furnishTrade,
  tradeArchetypeOfTags,
} from "./archetypes-trade.js";

import {
  VERNACULAR_BUILDING_ARCHETYPES,
  furnishVernacular,
  vernacularArchetypeOfTags,
} from "./archetypes-vernacular.js";

export * from "./archetypes-vernacular.js";

import {
  REGIONAL_BUILDING_ARCHETYPES,
  furnishRegional,
  regionalArchetypeOfTags,
} from "./archetypes-regional.js";

export * from "./archetypes-regional.js";

import {
  WAVE2_BUILDING_ARCHETYPES,
  furnishWave2,
  wave2ArchetypeOfTags,
} from "./archetypes-wave2.js";

export * from "./archetypes-wave2.js";

import {
  WORKS_BUILDING_ARCHETYPES,
  furnishWorks,
  worksArchetypeOfTags,
} from "./archetypes-works.js";

export * from "./archetypes-works.js";

import {
  INSTITUTION_BUILDING_ARCHETYPES,
  furnishInstitution,
  institutionArchetypeOfTags,
} from "./archetypes-institution.js";

export * from "./archetypes-institution.js";

import {
  LEISURE_BUILDING_ARCHETYPES,
  furnishLeisure,
  leisureArchetypeOfTags,
} from "./archetypes-leisure.js";

export * from "./archetypes-leisure.js";

import {
  HOMESTEAD_BUILDING_ARCHETYPES,
  furnishHomestead,
  homesteadArchetypeOfTags,
} from "./archetypes-homestead.js";

export * from "./archetypes-homestead.js";

import {
  AGRARIAN_BUILDING_ARCHETYPES,
  agrarianArchetypeOfTags,
  furnishAgrarian,
} from "./archetypes-agrarian.js";

export * from "./archetypes-agrarian.js";

// The nautical & pirate pack's buildings — the two entries of §3.2 that have
// an inside: the salt store beside the pans and the harbour's treadwheel crane.
import {
  BRINE_BUILDING_ARCHETYPES,
  brineArchetypeOfTags,
  furnishBrine,
} from "./archetypes-brine.js";

export * from "./archetypes-brine.js";

// The wilds & camps pack's buildings — the three entries of §3.6 that have an
// inside: the fire lookout's cab, the road's waystation and the trophy hall.
import {
  WILDS_BUILDING_ARCHETYPES,
  furnishWilds,
  wildsArchetypeOfTags,
} from "./archetypes-wilds.js";

export * from "./archetypes-wilds.js";

// The agrarian expansion pack's buildings — the five entries of §3.5 that have
// an inside: the byre, the dutch barn, the smokehouse, the dairy and the
// shearing shed.
import {
  HEDGEROW_BUILDING_ARCHETYPES,
  furnishHedgerow,
  hedgerowArchetypeOfTags,
} from "./archetypes-hedgerow.js";

export * from "./archetypes-hedgerow.js";

// The frontier West pack's buildings — the nine entries of §3.7 that have an
// inside: the saloon, the assay office, the stamp mill, the telegraph office,
// the livery, the wagon shop, the mission, the cantina and the dugout.
import {
  FRONTIER_BUILDING_ARCHETYPES,
  frontierArchetypeOfTags,
  furnishFrontier,
} from "./archetypes-frontier.js";

export * from "./archetypes-frontier.js";

import {
  RESIDENTIAL_BUILDING_ARCHETYPES,
  furnishResidential,
  residentialArchetypeOfTags,
} from "./archetypes-residential.js";

export * from "./archetypes-residential.js";

import {
  COMMERCE_BUILDING_ARCHETYPES,
  commerceArchetypeOfTags,
  furnishCommerce,
} from "./archetypes-commerce.js";

export * from "./archetypes-commerce.js";

import {
  TERMINUS_BUILDING_ARCHETYPES,
  furnishTerminus,
  terminusArchetypeOfTags,
} from "./archetypes-terminus.js";

export * from "./archetypes-terminus.js";

import {
  INDUSTRY_BUILDING_ARCHETYPES,
  furnishIndustry,
  industryArchetypeOfTags,
} from "./archetypes-industry.js";

export * from "./archetypes-industry.js";

import {
  UTILITY_BUILDING_ARCHETYPES,
  furnishUtility,
  utilityArchetypeOfTags,
} from "./archetypes-utility.js";

export * from "./archetypes-utility.js";

import {
  GARRISON_BUILDING_ARCHETYPES,
  furnishGarrison,
  garrisonArchetypeOfTags,
} from "./archetypes-garrison.js";

export * from "./archetypes-garrison.js";

import {
  SIEGEWORKS_BUILDING_ARCHETYPES,
  furnishSiegeworks,
  siegeworksArchetypeOfTags,
} from "./archetypes-siegeworks.js";

export * from "./archetypes-siegeworks.js";

import {
  CLASSICAL_B_BUILDING_ARCHETYPES,
  classicalBArchetypeOfTags,
  furnishClassicalB,
} from "./archetypes-classical-b.js";

export * from "./archetypes-classical-b.js";

import {
  SCIENCE_BUILDING_ARCHETYPES,
  furnishScience,
  scienceArchetypeOfTags,
} from "./archetypes-science.js";

export * from "./archetypes-science.js";

import {
  ARCANA_BUILDING_ARCHETYPES,
  arcanaArchetypeOfTags,
  furnishArcana,
} from "./archetypes-arcana.js";

export * from "./archetypes-arcana.js";

import {
  RELIC_BUILDING_ARCHETYPES,
  furnishRelic,
  isRelicArchetype,
  relicArchetypeOfTags,
  relicBareRuinArchetype,
} from "./archetypes-relic.js";
import {
  decayProfileFor,
  decayShellChecked,
  settleDecayedFixtures,
  type DecayPassReport,
} from "./decay.js";

export * from "./archetypes-relic.js";

import {
  SPECTACLE_BUILDING_ARCHETYPES,
  furnishSpectacle,
  spectacleArchetypeOfTags,
} from "./archetypes-spectacle.js";

export * from "./archetypes-spectacle.js";

import {
  FAITH_BUILDING_ARCHETYPES,
  faithArchetypeOfTags,
  furnishFaith,
} from "./archetypes-faith.js";

export * from "./archetypes-faith.js";

import {
  SANCTUM_BUILDING_ARCHETYPES,
  furnishSanctum,
  sanctumArchetypeOfTags,
} from "./archetypes-sanctum.js";

export * from "./archetypes-sanctum.js";

// The arcane & magical pack's built half (CATALOG-EXPANSION §3.3) — the
// college, the shrine and the winged-mount stable. Wired in immediately after
// the sanctum, which is the seam every later pack takes.
import {
  ARCANE_BUILDING_ARCHETYPES,
  arcaneArchetypeOfTags,
  furnishArcane,
} from "./archetypes-arcane.js";

export * from "./archetypes-arcane.js";

// The East Asian pack's built half (CATALOG-EXPANSION §3.9) — the keep, the
// gate tower, the garden pavilion and the bell pavilion. Wired in immediately
// after the arcane pack, which is the seam every later pack takes.
import {
  EASTERN_BUILDING_ARCHETYPES,
  easternArchetypeOfTags,
  furnishEastern,
} from "./archetypes-eastern.js";

export * from "./archetypes-eastern.js";

import {
  CLASSICAL_BUILDING_ARCHETYPES,
  classicalArchetypeOfTags,
  furnishClassical,
} from "./archetypes-classical.js";

export * from "./archetypes-classical.js";

import {
  XENO_BUILDING_ARCHETYPES,
  furnishXeno,
  xenoArchetypeOfTags,
} from "./archetypes-xeno.js";

export * from "./archetypes-xeno.js";

// The nautical & pirate pack's buildings — the four shore buildings of §3.2
// that have an inside: the magazine, the sea tower, the chandlery, the loft.
import {
  CORSAIR_BUILDING_ARCHETYPES,
  corsairArchetypeOfTags,
  furnishCorsair,
} from "./archetypes-corsair.js";

export * from "./archetypes-corsair.js";

// The Nile & ancient Egypt pack's buildings — the seven entries of §3.8 that
// have an inside. §3.8's pyramid is a PROP (`props-nile.ts`): a six-course
// roof rebuild cannot close a thirty-three block base, and filling a storey
// solid is `interior.blocked_column` for every column of it.
import {
  NILE_BUILDING_ARCHETYPES,
  furnishNile,
  nileArchetypeOfTags,
} from "./archetypes-nile.js";

export * from "./archetypes-nile.js";

import {
  DEPTHS_BUILDING_ARCHETYPES,
  depthsArchetypeOfTags,
  furnishDepths,
} from "./archetypes-depths.js";

export * from "./archetypes-depths.js";

import { HIGHRISE_ARCHETYPES, highriseArchetypeOfTags } from "./highrise.js";
// Not re-exported here: `structures/index.ts` exports the terrace directly, and
// exporting it twice through the same barrel is an ambiguity TypeScript
// resolves by dropping the names — the same trap the trade wave documents.
import { TERRACE_ARCHETYPES } from "./terrace.js";

import {
  UNDERGROUND_ARCHETYPES,
  furnishMineHead,
  undergroundArchetypeOfTags,
} from "./underground.js";

export * from "./underground.js";

/* -------------------------------------------------------------------------- */
/* archetypes                                                                  */
/* -------------------------------------------------------------------------- */

/** Most of a granary floor that hay bales may stand on. */
const GRANARY_HAY_SHARE = 0.25;

/** What a building is *for* — the thing that drives its furniture and massing. */
export const BUILDING_ARCHETYPES = [
  "cottage",
  "hall",
  "inn",
  "smithy",
  "granary",
  "watchtower",
  ...EXTENDED_BUILDING_ARCHETYPES,
  ...BLITZ_BUILDING_ARCHETYPES,
  ...TOWN_BUILDING_ARCHETYPES,
  ...TRADE_BUILDING_ARCHETYPES,
  ...VERNACULAR_BUILDING_ARCHETYPES,
  ...WAVE2_BUILDING_ARCHETYPES,
  ...HOMESTEAD_BUILDING_ARCHETYPES,
  ...AGRARIAN_BUILDING_ARCHETYPES,
  ...BRINE_BUILDING_ARCHETYPES,
  ...WILDS_BUILDING_ARCHETYPES,
  ...HEDGEROW_BUILDING_ARCHETYPES,
  ...FRONTIER_BUILDING_ARCHETYPES,
  ...WORKS_BUILDING_ARCHETYPES,
  ...INSTITUTION_BUILDING_ARCHETYPES,
  ...LEISURE_BUILDING_ARCHETYPES,
  ...RESIDENTIAL_BUILDING_ARCHETYPES,
  ...COMMERCE_BUILDING_ARCHETYPES,
  ...TERMINUS_BUILDING_ARCHETYPES,
  ...INDUSTRY_BUILDING_ARCHETYPES,
  ...UTILITY_BUILDING_ARCHETYPES,
  ...GARRISON_BUILDING_ARCHETYPES,
  ...SIEGEWORKS_BUILDING_ARCHETYPES,
  ...CLASSICAL_B_BUILDING_ARCHETYPES,
  ...SCIENCE_BUILDING_ARCHETYPES,
  ...ARCANA_BUILDING_ARCHETYPES,
  ...RELIC_BUILDING_ARCHETYPES,
  ...SPECTACLE_BUILDING_ARCHETYPES,
  ...FAITH_BUILDING_ARCHETYPES,
  ...SANCTUM_BUILDING_ARCHETYPES,
  ...ARCANE_BUILDING_ARCHETYPES,
  ...EASTERN_BUILDING_ARCHETYPES,
  ...CLASSICAL_BUILDING_ARCHETYPES,
  ...XENO_BUILDING_ARCHETYPES,
  ...CORSAIR_BUILDING_ARCHETYPES,
  ...NILE_BUILDING_ARCHETYPES,
  ...REGIONAL_BUILDING_ARCHETYPES,
  ...HIGHRISE_ARCHETYPES,
  ...UNDERGROUND_ARCHETYPES,
  ...DEPTHS_BUILDING_ARCHETYPES,
  // Last, and with no tag table of its own: the terrace is asked for by name
  // by the district fabric, and `terrace`/`terraced_row` already belong to
  // wave 4A's single house with party piers. See `terrace.ts`.
  ...TERRACE_ARCHETYPES,
] as const;

/** A building archetype. */
export type BuildingArchetype = (typeof BUILDING_ARCHETYPES)[number];

/** Map a node's tags onto an archetype; `cottage` when nothing matches. */
export function archetypeOfTags(tags: readonly string[]): BuildingArchetype {
  const has = (t: string): boolean => tags.includes(t);
  // The tall table goes first, ahead of even the watchtower: `tower` is the
  // greediest tag in the whole vocabulary, and `tower_block` means a block of
  // flats rather than a stone lookout.
  const tall = highriseArchetypeOfTags(tags);
  if (tall !== null) return tall;
  // The mine head, ahead of the lookout table: "tower" is greedy and a
  // headframe over a shaft is a tower to that rule, which is not what a
  // document tagged `mineshaft` is asking for.
  const dug = undergroundArchetypeOfTags(tags);
  if (dug !== null) return dug;
  if (has("lookout") || has("tower") || has("watchtower")) return "watchtower";
  // The breadth table, ahead of the extended one for the same reason the
  // extended one goes ahead of the original: `temple` means church over there,
  // and a pagoda would never reach its own building if this ran second.
  const blitz = blitzArchetypeOfTags(tags);
  if (blitz !== null) return blitz;
  // The town wave, between the breadth table and the extended one: the tables
  // below it are greedy, and a document tagged `academy` would otherwise never
  // reach a school. It claims only compounds — bare `hall` still belongs to the
  // original table, where it means a great hall.
  const town = townArchetypeOfTags(tags);
  if (town !== null) return town;
  // The trade table, for the reason every later table goes earlier: the older
  // ones are greedy. `trade` and `inn` mean inn down there and `store` means
  // granary, so this table claims none of those three — only `tavern`, `shop`
  // and their kin.
  const trade = tradeArchetypeOfTags(tags);
  if (trade !== null) return trade;
  // The vernacular wave, for the same reason: its archetypes are all houses,
  // and every table below it is greedier about dwellings than it is.
  const regional = vernacularArchetypeOfTags(tags);
  if (regional !== null) return regional;
  // Wave two, last of the new tables. It claims no tag any earlier table
  // claims — `mill` still reaches the windmill and `gate` the gatehouse — so
  // its position is about the greedy tables *below* it, not the ones above.
  const wave2 = wave2ArchetypeOfTags(tags);
  if (wave2 !== null) return wave2;
  // Wave 3B's works, immediately before the extended table for the same reason
  // every later wave sits here: the tables below are greedy. It claims no tag
  // an earlier one claims — `trade` still reaches the inn, `store` the granary,
  // `market` the market stall, `mill` the windmill and `craft` the smithy — so
  // its position is about what is *under* it, not what is over it.
  const works = worksArchetypeOfTags(tags);
  if (works !== null) return works;
  // The institutions, straight after wave two and for the same reason: they
  // claim only compounds and words no earlier table wants — `hall` still means
  // a great hall down there, `court` is the courthouse's and `clinic` the
  // infirmary's — so the position is about the greedy tables below.
  const institution = institutionArchetypeOfTags(tags);
  if (institution !== null) return institution;
  // Wave 4C's leisure, modern and science interiors, immediately after the
  // institutions and for the same reason: it claims nothing an earlier table
  // claims — `sauna` still reaches the bathhouse (this file's dry one answers
  // to `dry_sauna`), `gym` still reaches the blitz gym, `store`, `shop` and
  // `grocer` still reach the granary and the general store, and `lodging`
  // still reaches the hotel — so the position is about the greedy tables
  // *below* it.
  const leisure = leisureArchetypeOfTags(tags);
  if (leisure !== null) return leisure;
  // Wave four A's dwellings, after the institutions and before the extended
  // table for the reason every later wave sits here: the tables below are
  // greedy. It claims nothing an earlier one claims — `house` still falls
  // through to a cottage, `hall` is still the great hall's, `villa` the
  // Mediterranean villa's and `apartment` the tall grammar's.
  const residential = residentialArchetypeOfTags(tags);
  if (residential !== null) return residential;
  // Wave five B, commerce and civic. Immediately after the dwellings and well
  // before the extended table, for the reason every later wave sits here: the
  // tables below are greedy. It claims nothing an earlier one claims —
  // `market`, `stall` and `vendor` still reach the market stall, `shop` and
  // `grocer` the general store, bare `store` the granary, `trade` and `inn`
  // the inn, bare `hall` the great hall, `court` the courthouse, `academy` the
  // school, `lodging` the hotel and `hospice` the almshouse.
  const commerce = commerceArchetypeOfTags(tags);
  if (commerce !== null) return commerce;
  // Wave six A, the transport buildings, straight after the commerce table and
  // well before the extended table, for the reason every later wave sits here:
  // the tables below are greedy. It claims nothing an earlier table claims —
  // `tower` is still the watchtower's and `tower_block` the tall grammar's,
  // `beacon`/`beacon_spire`/`beacon_tower` still reach the fantasy spire and
  // wave 5A's tower, `depot` still reaches the warehouse, and `gym` the blitz
  // gym. Bare `station` and bare `roundhouse` were both left unclaimed by the
  // tables above (wave 5D and wave three say so in their own docs) and are
  // claimed here.
  const terminus = terminusArchetypeOfTags(tags);
  if (terminus !== null) return terminus;
  // Wave 5C, industry and modern works, straight after the dwellings and well
  // before the extended table: it claims nothing an earlier table claims —
  // `kiln` still reaches wave two's, `foundry` and `casting` wave 3B's, `mill`
  // the windmill, `craft` the smithy, `shop` and `store` the general store and
  // the granary, and `auditorium` the lecture hall.
  const industry = industryArchetypeOfTags(tags);
  if (industry !== null) return industry;
  // Wave 6C, waterworks and energy, straight after wave 5C for the same
  // reason: the tables below are greedy, and it claims nothing an earlier one
  // claims — `well_head` is still the street prop's, bare `tower` still the
  // watchtower's, `bath`/`baths` still the bathhouse's, `gas_station` still
  // wave 5C's, and `barn`, `granary` and `store` still their own tables'.
  const utility = utilityArchetypeOfTags(tags);
  if (utility !== null) return utility;
  // Wave five A's garrison, straight after the dwellings and before the
  // extended table, for the reason every later wave sits here: the tables
  // below are greedy. It claims nothing an earlier table claims — `castle`,
  // `citadel`, `keep` and `donjon` still reach the breadth keep, `barbican`
  // and `gate` still reach the gatehouse (so the outer work here answers to
  // `outer_gate`/`gateworks`), `garrison` and `barracks` still reach the
  // barracks, and bare `beacon`/`beacon_spire` are left for the fantasy track.
  const garrison = garrisonArchetypeOfTags(tags);
  if (garrison !== null) return garrison;
  // The siegeworks pack, straight after the garrison it belongs beside: same
  // corner of the vocabulary, and it claims nothing the garrison or an earlier
  // table claims — `fortress`/`stronghold` stay the castle's, `bastion` the
  // bastion's, `castle`/`keep` the breadth keep's, and `wall` and `bridge`
  // stay the linework engine's. Its one greedy claim is `camp`, which no
  // earlier table wanted.
  const siegeworks = siegeworksArchetypeOfTags(tags);
  if (siegeworks !== null) return siegeworks;
  // The classical Mediterranean pack's buildings, straight after the
  // siegeworks and for the reason every later wave sits here: the tables below
  // are greedy. It claims nothing an earlier table claims — bare `shed`,
  // `boat_shed`, `slipway`, `fountain`, `press` and `mill` are all left where
  // they were, and every claim here is a compound of this pack's own ids.
  const classicalB = classicalBArchetypeOfTags(tags);
  if (classicalB !== null) return classicalB;
  // Wave 5D, science and modern living: after the dwellings and before the
  // extended table, for the reason every later wave sits here — the tables
  // below are greedy. It claims nothing an earlier one claims: `observatory`,
  // `telescope` and `astronomy` still reach the blitz observatory, `alchemist`
  // the trade apothecary, `lab`/`laboratory` wave 4C's laboratory, and bare
  // `villa` the Mediterranean one.
  const science = scienceArchetypeOfTags(tags);
  if (science !== null) return science;
  // Wave six, the depths. Every claim it makes is a compound, so its position
  // in the chain is very nearly free: `bunker` stays the garrison's, `silo`
  // the homestead's, and bare `station` stays unclaimed by anybody.
  const depths = depthsArchetypeOfTags(tags);
  if (depths !== null) return depths;
  // Wave 5E, arcana: the fantastical and the remembered. Straight after the
  // dwellings and well before the extended table, and it claims nothing an
  // earlier one claims — `alchemist` is still the apothecary's, `wizard` and
  // `arcane` the wizard tower's, bare `shrine` and `temple` the church's, bare
  // `beacon` the parallel military track's, `tomb` and `sepulchre` the
  // mausoleum's, `columbarium` the dovecote's, and bare `sauna`, `baths` and
  // `hammam` the bathhouse's.
  const arcana = arcanaArchetypeOfTags(tags);
  if (arcana !== null) return arcana;
  // Wave 6E, the relics: five ruined buildings. It sits after the commerce and
  // arcana tables and well before the extended one for the reason every later
  // wave sits here — the tables below are greedy — and it claims **compounds
  // only**: bare `ruin` and `ruins` are claimed far below, after the extended
  // table, so that an adjective never outranks a noun; bare `abbey` stays
  // wave 4B's, bare `keep`, `castle` and `tower` stay the garrison's and the
  // watchtower's, bare `villa` the Mediterranean villa's, and bare `house`
  // still falls through to a cottage.
  const relic = relicArchetypeOfTags(tags);
  if (relic !== null) return relic;
  // Wave 6D, spectacle: the buildings you go *into* to be amazed. It sits here
  // for the reason every later wave sits high — the tables below are greedy —
  // and it claims nothing an earlier one claims: bare `tent` is still the
  // nomadic vocabulary's, bare `hall` the great hall's, bare `arcade` the
  // leisure wave's, bare `pavilion` the leisure/arcana pavilions', bare
  // `museum` and `zoo` the institution wave's, and `labyrinth` the underground
  // catalog's.
  const spectacle = spectacleArchetypeOfTags(tags);
  if (spectacle !== null) return spectacle;
  // Wave 4B, faith and memorial, straight after the institutions and well
  // before the extended table — which is the table it must not be behind, for
  // once not because that one is greedy but because it is *right*: `temple`,
  // `shrine`, `chapel` and `worship` all mean church down there and stay the
  // church's. This table claims only its own names, and `tomb`/`sepulchre`
  // remain the breadth mausoleum's — the tomb here answers to
  // `burial_chamber` and `cist`.
  const faith = faithArchetypeOfTags(tags);
  if (faith !== null) return faith;
  // The sanctum pack, immediately after wave 4B and for exactly its reason:
  // this table must not sit behind the extended one, because `temple`,
  // `shrine`, `chapel` and `worship` all mean church down there and stay the
  // church's. It claims none of those four words — the classical temple
  // answers to `classical_temple` and its kin, the chapel to `oratory`, the
  // shrine to `votive_shrine` — and nothing else it claims is claimed above:
  // bare `statue` is still the memorial track's, `circus` still the big top's
  // and `pavilion` still the leisure wave's.
  const sanctum = sanctumArchetypeOfTags(tags);
  if (sanctum !== null) return sanctum;
  // The arcane & magical pack, immediately after the sanctum and high for the
  // reason every later pack is high: the tables below are greedy. It claims
  // nothing an earlier table claims — bare `arcane`, `wizard` and `sorcerer`
  // are still the blitz wizard tower's, `library`/`study`/`scriptorium` still
  // the civic library's, `school`/`academy` still the town school's,
  // `college`/`university` still the university hall's, `stable`/`barn` still
  // wave 4A's barn's, and `shrine`/`temple`/`chapel` still the church's. Its
  // own two most fantastical nouns, `crystal` and `dragon`, are left where
  // wave 4B put them: this pack's crystal outcrop and dragon skeleton are
  // props reached by name, and a node tagged `dragon` must keep building the
  // roost.
  const arcane = arcaneArchetypeOfTags(tags);
  if (arcane !== null) return arcane;
  // The East Asian pack, immediately after the arcane pack and high for the
  // same reason: the tables below are greedy. It claims nothing an earlier
  // table claims — `pagoda`, `tea_house`, `hanok` and `machiya` are still the
  // shipped houses', `keep`/`castle`/`donjon` still the garrison keep's,
  // `bell`/`bell_tower`/`belfry`/`campanile` still the faith wave's masonry
  // shaft's, `tower`/`gate`/`gatehouse` still the garrison and town waves',
  // and `shrine`/`temple` still the church's. Bare `pavilion` is left
  // unclaimed here as everywhere else.
  const eastern = easternArchetypeOfTags(tags);
  if (eastern !== null) return eastern;
  // The classical Mediterranean pack, immediately after the sanctum it was
  // written beside and for the same reason both sit high: neither may fall
  // behind the extended table, whose `temple`/`shrine`/`chapel` claims are
  // right and stay the church's. It claims nothing an earlier table claims —
  // `odeon` is still the sanctum amphitheatre's, `peristyle` still the sanctum
  // temple's, `gymnasium` still the blitz school gym's, `courtyard` still wave
  // 4A's courtyard house's, and `treasury` is left unclaimed on purpose.
  const classical = classicalArchetypeOfTags(tags);
  if (classical !== null) return classical;
  // The alien & sci-fi pack's organic half, immediately after the classical
  // pack and high for the same reason every later wave is: the tables below
  // are greedy. It claims nothing an earlier table claims — bare `spire` is
  // still the garrison beacon's, `greenhouse` still the blitz wave's,
  // `farm`/`garden` still where they were — and bare `alien` is deliberately
  // left unclaimed, because an adjective belongs to the palette (the
  // compiler's `THEME_ALIASES`) and not to one building.
  const xeno = xenoArchetypeOfTags(tags);
  if (xeno !== null) return xeno;
  // The nautical & pirate pack's buildings, immediately after the alien pack
  // and high for the same reason every later wave is: the tables below are
  // greedy. It claims nothing an earlier table claims — bare `tower` is still
  // the watchtower's, `lighthouse` and `pier` are still Track A's, `ropewalk`
  // still the industry wave's, and bare `store`, `shop` and `depot` still
  // reach the granary, the general store and the warehouse. Bare `arsenal`
  // and bare `battery` stay the garrison arsenal's and the battery shed's;
  // §3.2's own shore battery is a sweep client rather than a node, so there
  // was never a case for taking either word back.
  const corsair = corsairArchetypeOfTags(tags);
  if (corsair !== null) return corsair;
  // The Nile & ancient Egypt pack's buildings, immediately after the nautical
  // pack and high for the reason every later wave is: the tables below are
  // greedy. It claims nothing an earlier table claims — bare `temple` is still
  // the church's, bare `tomb` the faith wave's, bare `shrine` and bare
  // `chapel` where they were, bare `granary` the homestead's, bare `hall` the
  // guildhall's and bare `gate` the gatehouse's. `pyramid`, `great_pyramid`,
  // `sacred_lake` and `felucca` are claimed by NOBODY on purpose: they name
  // this pack's props, which are reached by name, and `pyramid` is a roof
  // value in `core.ts` besides.
  const nile = nileArchetypeOfTags(tags);
  if (nile !== null) return nile;
  // Wave three's regional houses, immediately before the extended table and
  // after wave two: it claims nothing an earlier table claims — `barn` still
  // reaches the extended barn, `house` still falls through to a cottage, and
  // `villa`, `trullo` and `half_timber` still belong to the vernacular waves.
  // Wave four D, the homestead. It sits after the institutions and before the
  // regional houses for the same reason every later wave sits high: the tables
  // below are greedy. It claims nothing an earlier table claims — bare
  // `stable` and `byre` still reach the extended barn, bare `mill` the
  // windmill, bare `kiln` wave two's pottery kiln, bare `hut` the residential
  // track's own, and `house` still falls through to a cottage.
  const homestead = homesteadArchetypeOfTags(tags);
  if (homestead !== null) return homestead;
  // The agrarian pack, beside the homestead it belongs to: the yards, the
  // planting and the market square. It claims no word an earlier table owns —
  // bare `farm`, `market`, `sty`, `fold` and `terrace` all still go where they
  // went.
  const agrarian = agrarianArchetypeOfTags(tags);
  if (agrarian !== null) return agrarian;
  // The nautical & pirate pack's buildings, straight after the agrarian table
  // and well before the extended one, for the reason every later wave sits
  // here: the tables below are greedy. It claims nothing an earlier table
  // claims — bare `crane`, bare `salt`, `warehouse`, `store`, `shipyard`,
  // `boathouse`, `dock` and `harbour` are all left exactly where they were,
  // and every claim here is a compound of this pack's own ids.
  const brine = brineArchetypeOfTags(tags);
  if (brine !== null) return brine;
  // The wilds & camps pack's buildings, beside the nautical table they were
  // wired in after. It claims nothing an earlier table claims — bare `tower`,
  // `watchtower`, `lookout`, `lodge`, `shelter`, `hut`, `cabin`, `camp` and
  // `sawmill` are all left exactly where they were, and every claim here is a
  // compound of this pack's own ids.
  const wilds = wildsArchetypeOfTags(tags);
  if (wilds !== null) return wilds;
  // The agrarian expansion pack's buildings, beside the wilds table they were
  // wired in after. It claims nothing an earlier table claims — bare `byre`,
  // `barn`, `stable`, `shed`, `cattle`, `farm`, `field` and `granary` are all
  // left exactly where they were, and every claim here is a compound of this
  // pack's own ids or a word no table had.
  const hedgerow = hedgerowArchetypeOfTags(tags);
  if (hedgerow !== null) return hedgerow;
  // The frontier West pack's buildings, beside the agrarian table they were
  // wired in after. It claims nothing an earlier table claims — bare `bar`,
  // `tavern`, `inn`, `church`, `chapel`, `adobe`, `stable`, `mill`, `sawmill`,
  // `forge`, `smithy`, `jail`, `bank`, `post_office`, `general_store`,
  // `sod_house`, `hut` and `cabin` are all left exactly where they were, and
  // every claim here is a compound of this pack's own ids or a word no table
  // had.
  const frontier = frontierArchetypeOfTags(tags);
  if (frontier !== null) return frontier;
  const regionalWave = regionalArchetypeOfTags(tags);
  if (regionalWave !== null) return regionalWave;
  // The extended table is consulted before the original one, not after: the
  // original is greedy (`trade` → inn, `store` → granary) and would otherwise
  // swallow `market` and `storehouse` before either reached its own building.
  const extended = extendedArchetypeOfTags(tags);
  if (extended !== null) return extended;
  // The bare `ruin` / `ruins` tags, last of all (RUINS-PLAN-v0 Q3, ratified
  // 2026-08-09). Down here rather than up beside the relic compounds because
  // an adjective must never outrank a noun: `["ruins", "keep"]` is still the
  // garrison's keep, and only a tag list that has run out of nouns falls to a
  // ruined cottage instead of to the plain one.
  const bareRuin = relicBareRuinArchetype(tags);
  if (bareRuin !== null) return bareRuin;
  if (has("hall")) return "hall";
  if (has("trade") || has("inn")) return "inn";
  if (has("craft") || has("smithy")) return "smithy";
  if (has("store") || has("granary")) return "granary";
  return "cottage";
}

export function resolveArchetype(value: string | undefined): BuildingArchetype {
  if (value !== undefined && (BUILDING_ARCHETYPES as readonly string[]).includes(value)) {
    return value as BuildingArchetype;
  }
  return "cottage";
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Block names a wall-mounted torch, sign or bracket may hang on.
 *
 * The grammar's wall vocabulary is small and closed — planks, logs, stone,
 * brick, glass panes, doors, trapdoors — so a positive match on the solid part
 * of it is both exact and cheap. Anything unrecognised is treated as *not* a
 * face, which is the safe direction: the cost of a false negative is a torch
 * one cell further along the wall.
 */
const SOLID_BACKING = /(planks|_log$|_wood$|bricks?$|cobblestone$|stone$|_block$|deepslate$|terracotta$|sandstone$|_tiles$|glass$)/;

/* -------------------------------------------------------------------------- */
/* interiors                                                                   */
/* -------------------------------------------------------------------------- */

interface FurnishRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly archetype: BuildingArchetype;
  readonly interior: LocalRect;
  readonly door: { x: number; z: number; face: Cardinal } | null;
  readonly storyHeight: number;
  readonly floors: number;
  readonly choice: Seed256;
  /** Ground-floor columns the inter-storey stair run stands in. */
  readonly stairColumns: ReadonlySet<string>;
  /** Interior columns at and around the hearth; nothing may be pushed into a fire. */
  readonly hearthColumns: ReadonlySet<string>;
  /** The building's unrotated envelope, `[sizeX, sizeY, sizeZ]`. */
  readonly size: readonly [number, number, number];
  /** Y of the eave plate — the ceiling plane over the top storey. */
  readonly wallTop: number;
  /** Y of the roof's highest course, as the roof generator actually built it. */
  readonly roofTop: number;
  /**
   * Every enclosed floor cell, across **both** rects of the footprint.
   *
   * The generalization of {@link FurnishRequest.interior}: on a rect plan it
   * is exactly the interior rectangle's cells, and on an L or a T it also
   * carries the wing's room. The fit-out reasons about it rather than about
   * the rectangle so that a wing is part of the floor the walkability guard
   * keeps connected, and so a wing can be furnished at all.
   */
  readonly floorCells: readonly { readonly x: number; readonly z: number }[];
  /** What the earlier stages have already written at a cell, if anything. */
  readonly blockAt: (x: number, y: number, z: number) => LocalVoxelOp | undefined;
  /**
   * `params.decay` — how far gone this one building is, 0..1 (RUINS-PLAN §4.3).
   *
   * The author's way to ruin **one named thing** — a broken watchtower on a
   * ridge — without a district and without a second grammar: the ordinary shell
   * is built and fitted out exactly as it always is, and then written over by
   * the decay engine. Absent, or zero, and not one cell changes, which is what
   * keeps every world with no `decay` byte-identical.
   */
  readonly decay?: number;
  /** Where the decay pass records what it did. See {@link FitOutContext}. */
  readonly decayReport?: DecayPassReport;
}

/**
 * Fit out the ground floor for what the building is *for*.
 *
 * Modest on purpose: a handful of props that say "someone lives/works here" and
 * that a player can use. Everything stands on the floor plane at `y = 0`, which
 * exists over the whole interior, so nothing here can float. Cells adjacent to
 * the door are left clear so a prop never blocks the way in.
 */
export function furnish(r: FurnishRequest): number {
  const { put, style, interior, door } = r;
  const w = interior.x1 - interior.x0 + 1;
  const d = interior.z1 - interior.z0 + 1;
  if (w < 2 || d < 2) return 0;

  let n = 0;
  /**
   * The ground floor's walkable region, maintained as props land on it.
   *
   * The granary learned this rule for hay and nothing else learned it at all:
   * an inn on a nine-wide plan put a table and two chairs across the room and
   * cut its own front half off from its back. Routing every solid prop through
   * one guard makes "you can cross the room" a property of the fit-out rather
   * than of each archetype's arithmetic.
   */
  const plan = wholeFloorPlan(interior, r.blockAt, r.floorCells);
  /** Every cell of the room, both rects — what `free` is bounded by. */
  const floorSet = new Set(r.floorCells.map((c) => `${c.x},${c.z}`));
  const take = (cells: readonly (readonly [number, number])[], block: string): boolean =>
    isPassable(block) || plan.occupy(cells);
  const free = (x: number, z: number): boolean => {
    // The room, not the rectangle. On a rect plan the two are the same set;
    // on an L or a T the difference is the wing, which is floor a player can
    // stand on and therefore floor the fit-out may use.
    if (!floorSet.has(`${x},${z}`)) return false;
    // Never on the stairs: a bed head in the bottom step is both ugly and a
    // broken climb, and it is exactly what happened the first time round.
    if (r.stairColumns.has(`${x},${z}`)) return false;
    // Never at the hearth: the chimney is in the wall now, and the cell it
    // opens onto is the fireside, not a shelf. A bed or a table there is the
    // "cobblestone directly above a bed" defect in its other form.
    if (r.hearthColumns.has(`${x},${z}`)) return false;
    if (door === null) return true;
    // The door column and the cell straight inside it stay clear.
    const [dx, dz] = cardinalStep(door.face);
    return !((x === door.x && z === door.z) || (x === door.x - dx && z === door.z - dz));
  };
  const place = (x: number, z: number, block: string, props?: Record<string, string>): boolean => {
    if (!free(x, z)) return false;
    if (!take([[x, z]], block)) return false;
    put(x, 1, z, block, props);
    n++;
    return true;
  };
  /**
   * Lay a bed, both halves or neither.
   *
   * Minecraft stores a bed as two blocks sharing one `facing`, with the head
   * at `foot + facing`. The first version had the pair the other way round —
   * head at the anchor, foot at `+z` with `facing = south` — and the client
   * renders that mismatch as two overlapping bed pieces, which is what a
   * walkthrough reported. It also placed each half through `place`, so a foot
   * that landed on a blocked cell left a headboard on its own. Both halves are
   * now checked before either is written, and the head offset is taken from
   * the same `facing` the blocks carry, so {@link rotateOps} — which rotates
   * coordinates and `facing` by the same yaw — keeps the pair together.
   */
  const placeBed = (x: number, z: number, facing: Cardinal, block: string): void => {
    const [dx, dz] = cardinalStep(facing);
    const hx = x + dx;
    const hz = z + dz;
    if (!free(x, z) || !free(hx, hz)) return;
    if (!take([[x, z], [hx, hz]], block)) return;
    put(x, 1, z, block, { facing, part: "foot", occupied: "false" });
    put(hx, 1, hz, block, { facing, part: "head", occupied: "false" });
    n += 2;
  };
  // Wall torches, on the interior face of the two long walls.
  const torchY = Math.min(3, r.storyHeight - 1);
  const torch = style["light.torch"] as string;
  const wallTorch = torch === "torch" ? "wall_torch" : torch;
  for (const [tx0, tz, facing, slide] of [
    [interior.x0, interior.z0, "south", 1],
    [interior.x1, interior.z1, "north", -1],
  ] as const) {
    // A torch bracketed to the north or south wall may slide *along* that wall
    // but never off it, because `facing` names the block it hangs on. It has
    // to slide for two reasons, both found by a world readback: a torch two
    // blocks over the bottom step of a stair is a low bridge you cannot walk
    // under, and a torch whose backing cell is a **window** is bracketed to a
    // pane, which is not a solid face and which the game would drop on the
    // first block update.
    const [bx, bz] = cardinalStep(facing);
    let tx: number | null = null;
    for (let k = 0; k <= interior.x1 - interior.x0; k++) {
      const candidate = tx0 + slide * k;
      if (candidate < interior.x0 || candidate > interior.x1) break;
      if (r.stairColumns.has(`${candidate},${tz}`)) continue;
      const backing = r.blockAt(candidate + bx, torchY, tz + bz);
      if (backing === undefined || !SOLID_BACKING.test(backing.block)) continue;
      tx = candidate;
      break;
    }
    if (tx === null) continue;
    put(tx, torchY, tz, wallTorch, { facing });
    n++;
  }

  const x0 = interior.x0;
  const x1 = interior.x1;
  const z0 = interior.z0;
  const z1 = interior.z1;

  switch (r.archetype) {
    case "cottage": {
      // Head to the wall, foot into the room — the same idiom the upper-storey
      // `beds()` uses. `facing` names the direction from foot to head, so a bed
      // standing at the north edge of the room takes `facing: "north"` with its
      // foot one cell south of the headboard. The first version anchored the
      // foot at the north-west interior corner and faced it *south*, which put
      // the headboard in the middle of the floor and the foot against the wall.
      placeBed(x0, z0 + 1, "north", "red_bed");
      place(x1, z0, "chest", { facing: "west", type: "single" });
      place(x1, z1, "crafting_table");
      place(x1 - 1 >= x0 ? x1 - 1 : x1, z1, "barrel", { facing: "up", open: "false" });
      break;
    }
    case "inn": {
      // Two or three tables: a fence stem with a pressure plate for a top, and
      // stair chairs turned in towards it.
      for (let i = 0; i < 3; i++) {
        const tx = x0 + 1 + i * 2;
        const tz = z0 + 1 + (i % 2);
        if (tx > x1 - 1 || tz > z1 - 1) continue;
        // No table, no chairs: a refused fence cell (the hearth, a reserve)
        // must not leave a pair of seats drawn up to nothing.
        if (!place(tx, tz, style["wall.fence"] as string)) continue;
        if (free(tx, tz)) {
          put(tx, 2, tz, "oak_pressure_plate", { powered: "false" });
          n++;
        }
        // RULE: a stair-chair's `facing` points AWAY from the thing it faces.
        // A stair's `facing` is the direction its HIGH half — the backrest —
        // stands in; the seat opens the opposite way. So the chair *west* of
        // the table takes `facing: "west"` (back to the west, seat opening
        // east, towards the table) and the chair east of it takes "east".
        // This pair was exactly inverted, and both chairs sat with their backs
        // to the table.
        place(tx - 1, tz, style["stair.interior"] as string, { facing: "west", half: "bottom" });
        place(tx + 1, tz, style["stair.interior"] as string, { facing: "east", half: "bottom" });
      }
      place(x1, z0, "barrel", { facing: "up", open: "false" });
      place(x1, z0 + 1, "barrel", { facing: "up", open: "false" });
      place(x0, z1, "cauldron", { level: "0" });
      break;
    }
    case "smithy": {
      // The forge works the *east* wall. It used to work the west one, which
      // is the wall the stair climbs: the anvil landed in the single cell
      // between the room and the foot of the flight and sealed the stairs off
      // from the shop floor.
      place(x1, z0, "blast_furnace", { facing: "west", lit: "false" });
      place(x1, z0 + 1 <= z1 ? z0 + 1 : z0, "anvil", { facing: "west" });
      place(x1, z1, "smithing_table");
      place(x0, z1, "chest", { facing: "east", type: "single" });
      place(x0 + 1 <= x1 ? x0 + 1 : x0, z1, "cauldron", { level: "0" });
      break;
    }
    case "granary": {
      // Stacks against the walls, never a field of them. The first version
      // filled every other cell of the whole floor, and a checkerboard of
      // full blocks is not a granary — it is a maze with no legal move, because
      // the free cells only touch each other at their corners. A walkthrough
      // called it exactly that. Hay now goes where hay goes: piled one to three
      // high along the walls, leaving the floor of the room open.
      const cap = Math.max(1, Math.floor(w * d * GRANARY_HAY_SHARE));
      let stacks = 0;
      // Bales are *stores*, so they go down as neat rectangular piles rather
      // than as single bales dropped one every third cell — the old
      // `(x + z * 2) % 3` pattern, which reads in game as random scatter. Each
      // pile is a 1x2 run of cells along one wall, laid level and with one
      // shared axis, and a pile is only drawn when BOTH of its cells are
      // legal — a half-laid pile is the lone stranded bale all over again.
      // Everything here is derived from position; no RNG.
      const walls = [
        { fixed: z0, along: "x" as const },
        { fixed: z1, along: "x" as const },
        { fixed: x0, along: "z" as const },
        { fixed: x1, along: "z" as const },
      ];
      /** Corners and their neighbours stay bare: a bale each side of a corner
       * boxes the corner in, and a floor cell you can see and not reach is the
       * checkerboard defect one cell wide. */
      const nearCorner = (x: number, z: number): boolean =>
        ((x === x0 || x === x1) && (z <= z0 + 1 || z >= z1 - 1)) ||
        ((z === z0 || z === z1) && (x <= x0 + 1 || x >= x1 - 1));
      for (const wall of walls) {
        if (stacks >= cap) break;
        const onXWall = wall.along === "x";
        const lo = onXWall ? x0 : z0;
        const hi = onXWall ? x1 : z1;
        // Runs of two with a two-cell gap between them, anchored to the room
        // so both ends of a wall read the same way.
        for (let t = lo; t + 1 <= hi && stacks + 2 <= cap; t += 4) {
          const cells: [number, number][] = [
            onXWall ? [t, wall.fixed] : [wall.fixed, t],
            onXWall ? [t + 1, wall.fixed] : [wall.fixed, t + 1],
          ];
          if (cells.some(([cx, cz]) => nearCorner(cx, cz) || !free(cx, cz))) continue;
          if (!take(cells, "hay_block")) continue;
          // Two-high wherever the ceiling allows, single elsewhere, and never
          // up to the joists: a pile that reaches them is a column through the
          // room, which is the defect one door along.
          const height = Math.max(
            1,
            Math.min(1 + (((t - lo) / 4 + wall.fixed) % 2 === 0 ? 1 : 0), r.storyHeight - 2),
          );
          for (const [cx, cz] of cells) {
            for (let h = 0; h < height; h++) {
              // The upper course lies along the wall, the whole pile matching.
              put(cx, 1 + h, cz, "hay_block", { axis: h === 0 ? "y" : onXWall ? "x" : "z" });
              n++;
            }
            stacks++;
          }
        }
      }
      place(x1, z1, "composter", { level: "0" });
      place(x0, z1, "barrel", { facing: "up", open: "false" });
      break;
    }
    case "hall": {
      // A long table down the middle, a carpet runner beside it, banners high on
      // the end wall.
      const mid = Math.floor((x0 + x1) / 2);
      for (let z = z0 + 1; z <= z1 - 1; z++) {
        // The plate is the table top and the fence is its trestle: the plate
        // goes on ONLY where the trestle landed. `place` may refuse a cell
        // (reserved, or it would cut the room in two), and a plate written
        // over that refusal is a table top floating on air.
        if (place(mid, z, style["wall.fence"] as string)) {
          put(mid, 2, z, "oak_pressure_plate", { powered: "false" });
          n++;
        }
        place(mid - 1, z, "white_carpet");
        place(mid + 1, z, "white_carpet");
      }
      for (const bx of [mid - 1, mid + 1]) {
        if (bx < x0 || bx > x1) continue;
        put(bx, Math.min(4, r.storyHeight - 1), z0, "blue_banner", { rotation: "8" });
        n++;
      }
      place(x0, z1, "barrel", { facing: "up", open: "false" });
      place(x1, z1, "bookshelf");
      break;
    }
    default:
      break;
  }

  // The extended archetypes, and then every storey above the ground one.
  // Both go through the same context, so the door/stair/hearth reserve the
  // ground floor built above is the one they honour too.
  const ctx: FitOutContext = {
    put,
    style,
    archetype: r.archetype,
    interior,
    door,
    storyHeight: r.storyHeight,
    floors: r.floors,
    free,
    place,
    placeBed,
    take,
    size: r.size,
    wallTop: r.wallTop,
    roofTop: r.roofTop,
    floorCells: r.floorCells,
    blockAt: r.blockAt,
    ...(r.decay === undefined ? {} : { decay: r.decay }),
    ...(r.decayReport === undefined ? {} : { decayReport: r.decayReport }),
  };
  n += furnishExtended(ctx);
  n += furnishBlitz(ctx);
  n += furnishTown(ctx);
  n += furnishTrade(ctx);
  n += furnishVernacular(ctx);
  n += furnishWave2(ctx);
  n += furnishWorks(ctx);
  n += furnishInstitution(ctx);
  n += furnishLeisure(ctx);
  n += furnishHomestead(ctx);
  n += furnishAgrarian(ctx);
  n += furnishBrine(ctx);
  n += furnishWilds(ctx);
  n += furnishHedgerow(ctx);
  n += furnishFrontier(ctx);
  n += furnishResidential(ctx);
  n += furnishCommerce(ctx);
  n += furnishTerminus(ctx);
  n += furnishIndustry(ctx);
  n += furnishUtility(ctx);
  n += furnishGarrison(ctx);
  n += furnishSiegeworks(ctx);
  n += furnishClassicalB(ctx);
  n += furnishScience(ctx);
  n += furnishArcana(ctx);
  n += furnishRelic(ctx);
  n += furnishSpectacle(ctx);
  n += furnishFaith(ctx);
  n += furnishSanctum(ctx);
  n += furnishArcane(ctx);
  n += furnishEastern(ctx);
  n += furnishClassical(ctx);
  n += furnishXeno(ctx);
  n += furnishCorsair(ctx);
  n += furnishNile(ctx);
  n += furnishRegional(ctx);
  n += furnishMineHead(ctx);
  n += furnishDepths(ctx);
  n += furnishWing(ctx);
  n += furnishUpperFloors(ctx);
  // --- the decay (RUINS-PLAN-v0 WP-2) --------------------------------------
  // **Last, and after every `furnish*` pass**, because THE RUIN LAW says a
  // ruined building is the ordinary shell fit-out DECAYED: the same shell is
  // built, the same archetype furnishes it, and then it is written over. A
  // decay that ran earlier would be decorating a ruin, which is the second
  // grammar the law forbids.
  //
  // The five relics are exempt because they run the engine themselves, from
  // their own profiles — `params.decay` on a `ruined_cottage` would be a decay
  // over a decay, and the relic's own list is a WP-1 golden.
  if (r.decay !== undefined && r.decay > 0 && !isRelicArchetype(r.archetype)) {
    const c = new PropCounter(ctx);
    const outcome = decayShellChecked(ctx, c, decayProfileFor(ctx, r.decay));
    // Nothing the decay unsupported may survive it. One entry point, one
    // invariant — see the note on `settleDecayedFixtures`.
    const settled = settleDecayedFixtures(ctx);
    if (r.decayReport !== undefined) {
      r.decayReport.written = outcome.written;
      r.decayReport.quenched = outcome.quenched;
      r.decayReport.withdrawn = outcome.withdrawn;
      r.decayReport.refused = outcome.refused;
      r.decayReport.settled = settled;
      r.decayReport.mode = outcome.mode;
    }
    n += c.n;
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* cellar fit-out                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What a cellar is for.
 *
 * Barrels on the floor and cobwebs under the beams, both position-keyed and
 * both kept off the ladder's column and the two cells that reach it — the
 * approach a player needs is the one thing the decoration may not take.
 */
export function furnishCellar(
  put: Put,
  style: Readonly<Record<string, string>>,
  choice: Seed256,
  interior: LocalRect,
  access: { readonly x: number; readonly z: number },
  center: { readonly x: number; readonly z: number },
  floorY: number,
  /**
   * Interior columns that are not really room — a pilaster the cellar's own
   * geometry stands inside it. They are neither furnished nor counted as floor
   * by the walkability guard, because they are solid stone.
   */
  blocked?: ReadonlySet<string>,
): void {
  const { x: cx, z: cz } = center;
  const reserved = new Set([
    `${access.x},${access.z}`,
    `${access.x - 1},${access.z}`,
    `${access.x},${access.z - 1}`,
    `${cx},${cz}`,
  ]);
  // The cellar's copy of the walkability invariant, and it needed one: two
  // crates drawn independently against a wall boxed the corner between them
  // in, and the physics lint duly reported a standable cellar cell with no
  // route to it. The draw is unchanged — the guard only ever *refuses*.
  const cells: string[] = [];
  for (let z = interior.z0; z <= interior.z1; z++) {
    for (let x = interior.x0; x <= interior.x1; x++) {
      if (blocked?.has(`${x},${z}`) === true) continue;
      cells.push(`${x},${z}`);
    }
  }
  const plan = new FloorPlan(cells, reserved);
  for (let z = interior.z0; z <= interior.z1; z++) {
    for (let x = interior.x0; x <= interior.x1; x++) {
      if (reserved.has(`${x},${z}`) || blocked?.has(`${x},${z}`) === true) continue;
      const wall =
        x === interior.x0 || x === interior.x1 || z === interior.z0 || z === interior.z1;
      if (wall && positionFloat(choice, x, floorY, z) < 0.22) {
        if (!plan.occupy([[x, z]])) continue;
        put(x, floorY, z, style["cellar.crate"] as string);
      } else if (positionFloat(choice, z, floorY, x) < 0.1) {
        // Under the beams, never at head height on the floor: a cobweb a player
        // has to wade through to cross their own cellar is a bug, not a mood.
        put(x, -1, z, style["cellar.cobweb"] as string);
      }
    }
  }
}

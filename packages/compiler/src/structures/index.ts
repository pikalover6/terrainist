/**
 * The structure pass (G4b) — where a solved layout becomes blocks.
 *
 * Runs between column materialization and the scatter, which is the only place
 * it can: it needs the finished ground to sink foundations into and to grade
 * roads over, and the scatter needs the occupancy the buildings and roads claim
 * before it decides where trees may stand.
 *
 * Two generators, in this order:
 *
 * 1. **`building.grammar@0`** — each placed building is generated unrotated in
 *    node-local space, rotated by its solved yaw, and translated into the
 *    world. Buildings write *over* the terrain, as blocks.
 * 2. **`road.network@0`** — the routes are laid after the buildings exist, so
 *    the router can treat their footprints as obstacles. Roads write *into* the
 *    column plan, because a road is a change to the ground, not something
 *    sitting on it.
 */

import {
  archetypeFacadeDefaults,
  resolveArchetype,
  DEFAULT_BASEMENT_DEPTH,
  DEFAULT_ORNAMENT_DENSITY,
  archetypeOfTags,
  assignMaterials,
  INFRA_ENTRIES,
  materialKey,
  nodeSeed,
  pickTheme,
  seed32,
  streamSeed,
  type BuildingMaterials,
  type CaveSpans,
  type MaterialTheme,
  type Seed256,
} from "@terrainist/stdlib";
import { INFRA_ROUTE_KEYS } from "@terrainist/spec";
import {
  canonicalize,
  isFarmGenerator,
  isImplementedVia,
  isInfraEntryNode,
  isPropNode,
  resolveTypeKey,
  warning,
} from "@terrainist/spec";
import type {
  FarmEdge,
  LoamDiagnostic,
  PortDeclaration,
  SemanticIntent,
  SettlementDocument,
  StructureNode,
} from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import { ensureFanOutRows, fanOut, intentFor, resolveIntents } from "../intent/index.js";
import { FARM_ROWS, FARM_TODAY } from "./farm-intent.js";
import { STRUCTURE_ROWS } from "./themes-intent.js";
import { checkIntentVocabulary } from "./vocabulary.js";
import { resolvePorts } from "../layout/ports.js";
import { landmarkRoadAnchors } from "../programs/road-anchors.js";
import type { ProgramRotation } from "../programs/rotate.js";
import type { CityProduct } from "../layout/city-pass.js";
import { deriveSeamStairs, type DistrictProduct } from "../layout/district.js";
import type { StreetGraph } from "../layout/streets.js";
import {
  dressStreets,
  type SegmentArc,
  type StreetscapeFurnishing,
} from "./streetscape.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import { solvedCarriagewayMask } from "../layout/solved-carriageway.js";
import type { GroundTier } from "../layout/ground-contract.js";
import { FACE_FINISH, GROUND_V1_FREEZE, ROAD_SOVEREIGN } from "../layout/types.js";
import { NO_PLATFORM } from "../layout/levels.js";
import type { LayoutNodeInput, OccupancyGrid, Placement, ResolvedPort } from "../layout/types.js";
import { mergeSpanSets } from "../terrain/caves.js";
import type { ColumnPlan } from "../terrain/columns.js";
import {
  PALETTE_THEME_KEY,
  defineGreenSkinSymbols,
  defineGroundRoles,
  type Palette,
} from "../terrain/palette.js";

import {
  buildBuildings,
  terraceBaysParamOf,
  underpinAprons,
  wingParamOf,
  type BuildingJob,
  type BuiltBuilding,
  type StructureBlock,
} from "./buildings.js";
import { digCanals, type CanalPassResult } from "./canals.js";
import {
  EMPTY_PARCEL_DATUM,
  declareInfraEntries,
  declaresGround,
  parcelExtentOf,
  parcelMaskOf,
  type InfraSiting,
  type InfraSitings,
  type ParcelDatum,
} from "./infra-entry-declare.js";
import {
  buildInfraEntries,
  type InfraEntryJob,
  type InfraPlacementView,
  type InfraRouteSpec,
} from "./infra-entry.js";
import {
  buildRetainingWalls,
  finishCutFaces,
  finishFaces,
  finishSeams,
  type RetainingPassResult,
  type RetainingPlane,
} from "./retaining.js";
import { furnishCourtyards, type CourtyardPassResult } from "./courtyards.js";
import { buildDoorsteps, paintDoorsteps, type DoorstepResult } from "./doorsteps.js";
import { buildGrounds, softSurfaceStates, type GroundPassResult } from "./grounds.js";
import { buildJunctionSteps, type PavedSurface } from "./junction-steps.js";
import { buildRuinField, type RuinField } from "./ruin-field.js";
import { growGreenSkin, type GreenSkinResult } from "./green-skin.js";
import { resolveReclaimSpecies } from "./reclaim-species.js";
import { dressLife, type LifeBuilding, type LifeStreets } from "./life.js";
import { declareLinework, declaresLinework } from "./linework.js";
import { pavePlaza, type PlazaResult } from "./plaza.js";
import { dressSetPieces } from "./setpieces.js";
import {
  buildProps,
  reseatProps,
  checkPropFluidSafety,
  type PlacedProp,
  type PropJob,
  type PropPassResult,
} from "./props.js";

import { buildFarms, type FarmJob, type FarmPassResult } from "./farm.js";
import {
  buildPrecincts,
  isPrecinctGenerator,
  type PrecinctJob,
  type PrecinctPassResult,
} from "./precincts.js";
import {
  buildRoadNetwork,
  SEGMENT_ID_SEPARATOR,
  STREET_WEAR_CHANCE,
  index,
  inside,
  surfaceStreetGraph,
  type RoadNetworkResult,
  type RoadParams,
  type StreetSurfaceResult,
} from "./roads.js";
import type { FurnitureKit, StreetscapeResult } from "./streetscape.js";
import { buildTunnels, resolveTunnelStyle, type BuiltTunnel, type TunnelLink } from "./tunnels.js";
import { fabricExtent, type FabricField } from "./fabric-hull.js";
import {
  WALL_DEFAULT_HEIGHT,
  WALL_DEFAULT_MARGIN,
  WALL_DEFAULT_TOWER_PITCH,
  WALL_MATERIALS,
  buildWalls,
  extentOfRects,
  wallMaterialsOfTheme,
  wallStyleFixesMaterials,
  type BuiltWall,
  type WallJob,
  type WallMaterials,
} from "./walls.js";
import { fortificationJobs, type FabricNode } from "./walls-intent.js";

export * from "./buildings.js";
export * from "./reclaim-species.js";
export * from "./canals.js";
export * from "./retaining.js";
export * from "./courtyards.js";
export * from "./doorsteps.js";
export * from "./life.js";
export * from "./linework.js";
export * from "./grounds.js";
export * from "./plaza.js";
export * from "./farm.js";
export * from "./precincts.js";
export * from "./setpieces.js";
export * from "./props.js";
export * from "./roads.js";
export * from "./tunnels.js";
export * from "./wall-course.js";
export * from "./walls.js";
export * from "./walls-intent.js";
export * from "./vocabulary.js";

/** Everything {@link buildStructures} reads. */
export interface StructurePassInput {
  readonly doc: SettlementDocument;
  readonly worldSeed: bigint;
  /** The solver's node list, in document order. */
  readonly nodes: readonly LayoutNodeInput[];
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  /** Mutated by the road pass. */
  readonly plan: ColumnPlan;
  /**
   * The ground contract's driver (`docs/GROUND-CONTRACT-v0.md` §9a).
   *
   * **The one accumulator for the whole compile.** Every pass contributes at its
   * own pipeline position (§9a.1, rule 1), and with WP-3, WP-4 and WP-5 landed
   * every one of the eleven contributes by **committing**: it hands the driver
   * the levels it wants, the driver resolves the whole accumulated prefix and
   * writes the answer back over that pass's own columns, and the pass then lays
   * its materials against the answer. There are no shadow declarers left to
   * `record` — the last `record` in the compile is the layout solver's pads
   * (§3.12), which happens before this pass runs. That is why there is no
   * `declareAll` any more: §3's inventory is the list of call sites below.
   *
   * Required: `terrain/compile.ts` builds it beside the baseline snapshot, and
   * the baseline is no longer optional on the settlement path.
   */
  readonly ground: GroundDriver;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Mutated by both passes, and read by the scatter that follows. */
  readonly occupancy?: OccupancyGrid;
  /**
   * The road network's frozen route corridor as a column mask (§4.9.6).
   *
   * Registered at substage 3b, long before this pass runs, and handed straight
   * through to the router — which discounts it rather than being confined to
   * it. Absent when the document has no road node or its anchors had no coarse
   * constraints to string a corridor through.
   */
  readonly roadCorridor?: Uint8Array;
  /**
   * The fabric pass's output, one entry per `district` node.
   *
   * Its street skeletons are surfaced by the road machinery before the
   * inter-district network is routed, and handed to {@link dressStreets} — the
   * F4 seam — immediately afterwards.
   */
  readonly districts?: readonly DistrictProduct[];
  /**
   * C1's city plans, one per `city` node.
   *
   * Only the arterials are read here: they are surfaced through the same pass
   * that surfaces streets, before it, so a street *meets* a boulevard. The
   * cells themselves already arrived as ordinary entries in `districts`.
   */
  readonly cities?: readonly CityProduct[];
  /**
   * `building.grammar@0` params for placements that have no document node.
   *
   * Every auto-infilled building in a district is a real placement with no line
   * of JSON behind it: its archetype and storey count were chosen by the fabric
   * pass, and this is how they reach the grammar. Consulted only for paths the
   * document itself does not carry, so an authored node always wins.
   */
  readonly paramsByPath?: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  /**
   * The quarter turn each landmark program stands at (`programs/facing.ts`).
   *
   * Read by one thing here: the road approach a landmark publishes, which is an
   * anchor in the program's local frame and has to be turned with the rest of
   * the instance before a lane is routed to it.
   */
  readonly programRotations?: ReadonlyMap<string, ProgramRotation>;
}

/** Aggregate numbers about what the structure pass built. */
export interface StructureStats {
  readonly buildingCount: number;
  readonly buildingBlocks: number;
  readonly roadRoutes: number;
  readonly roadColumns: number;
  /** Of those, columns carried on a bridge deck over water. */
  readonly roadBridgeColumns: number;
  readonly unroutedAnchors: number;
  /** The village's material theme id. */
  readonly theme: string;
  /** Distinct (wall, stone, roof) triples across the village's buildings. */
  readonly distinctMaterials: number;
  /** Plaza columns surfaced; 0 when the document declares no plaza. */
  readonly plazaColumns: number;
  readonly plazaBenches: number;
  readonly plazaWell: boolean;
  /** Doors given a flight of steps out to the ground. */
  readonly doorstepsStepped: number;
  /** Doors whose approach was cut down to the threshold. */
  readonly doorstepsDropped: number;
  /** Doors whose flight was refused: its foot landed on no walkable ground. */
  readonly doorstepsRefused: number;
  /** Buildings given a cellar, whether asked for or implied by a tunnel. */
  readonly cellars: number;
  /** Tunnels routed and dug. */
  readonly tunnels: number;
  /** Blocks of stone the tunnel bores removed. */
  readonly tunnelCarvedBlocks: number;
  /** Centre-line cells, summed over every tunnel — the walk, in blocks. */
  readonly tunnelLength: number;
  readonly tunnelStairSteps: number;
  readonly tunnelLanterns: number;
  /** Shared chambers dug where two galleries crossed. */
  readonly tunnelJunctions: number;
  /** Districts whose fabric was laid. */
  readonly districts: number;
  /** Buildings the fabric pass produced — landmarks plus auto-infill. */
  readonly districtBuildings: number;
  /** Columns surfaced as district streets. */
  readonly streetColumns: number;
  /** C1 city plans laid. */
  readonly cities: number;
  /** Arterials drawn across them, of every kind. */
  readonly arterials: number;
  /** Of `streetColumns`, the ones that are arterial carriageway. */
  readonly arterialColumns: number;
  /** Of those, the ones carried on a bridge deck over water. */
  readonly arterialBridgeColumns: number;
  /** Props built by `prop.place@0`. */
  readonly props: number;
  /** Prop nodes the placer could find no site for. */
  readonly propsUnplaced: number;
  /** Water blocks the props wrote that could flow. Zero is required. */
  readonly propWaterLeaks: number;
  /**
   * Lamps, benches and planters the F4 streetscape dressed the sidewalks with.
   *
   * Reported because "streetlights everywhere" is a thing a document asks for
   * and nothing else in the report would notice it disappearing: the dressing
   * skips any column a building already wrote in, so a facade that reaches into
   * the apron — a terrace's awning does — trades furniture for architecture,
   * and that trade is worth being able to see.
   */
  readonly streetFurniture: number;
  /** Columns rewritten by lot dressing (F2). */
  readonly dressedColumns: number;
  /** Columns speckled with worn path paint (F2). */
  readonly wornColumns: number;
  /** Lots dressed as a ruin yard (F19, RUINS-PLAN §7.2). */
  readonly ruinYards: number;
  /** Columns the ruin field reaches at all (§7.1). */
  readonly ruinFieldColumns: number;
  /** Ruined columns the green skin's surface index covered (WP-6 §3.2). */
  readonly greenSkinColumns: number;
  /** Blocks the green skin wrote. Zero at WP-6a, by design. */
  readonly greenSkinBlocks: number;
  /** Carriageway columns broken back to soil (§7.3). */
  readonly brokenStreetColumns: number;
  /** Volunteer plants grown on those broken columns (§7.3). */
  readonly streetReclaimBlocks: number;
  /** Precinct compounds laid out, by kit. */
  readonly airports: number;
  readonly harbours: number;
  /** Apron stands cut, and aircraft parked on them. */
  readonly standsCut: number;
  readonly aircraftParked: number;
  /** Piers run out from a quay, and hulls moored alongside them. */
  readonly piersBuilt: number;
  readonly shipsMoored: number;
  /** F17 holdings placed, the fields seated in them, and the columns tilled. */
  readonly holdings: number;
  readonly farmParcels: number;
  readonly farmColumns: number;
  /**
   * The life pass's own counters, one per prop kind plus `lifeTotal` and
   * `lifeBlocks`.
   *
   * Open rather than enumerated: the whole point of C3 is that its vocabulary
   * grows, and a fixed field per awning kind would make adding one a
   * three-file change for no reader's benefit.
   */
  readonly [lifeStat: string]: number | string | boolean;
}

/**
 * Which pass pushed a run of {@link StructurePassResult.blocks} — the audit's
 * attribution seam.
 *
 * A `StructureBlock` is four numbers and deliberately stays four numbers: it is
 * written tens of thousands of times per world and a provenance string on each
 * one would cost more than the whole rest of the pass. But *some* instrument has
 * to be able to answer "which pass put this cobblestone wall here", because the
 * defects that survive every other check are the ones that only exist where two
 * passes meet — a junction is a maze because four emitters each laid something
 * defensible there, and no pass sees the fifth thing they add up to.
 *
 * The block list is built by concatenation, in pass order, and nothing ever
 * removes from it. So a half-open index range per push is a complete, exact and
 * free record of who laid what. It is a *return value only*: nothing downstream
 * reads it, so the emitted world is byte-identical with or without it.
 */
export interface BlockSpan {
  /** The pass, as `walkability.ts` and the report name it. */
  readonly emitter: string;
  /** First index into `blocks`, inclusive. */
  readonly from: number;
  /** One past the last, exclusive. */
  readonly to: number;
}

/** Elements copied per `push` when a pass's blocks are appended. See `lay`. */
const LAY_CHUNK = 8192;

/**
 * `ROAD_SOVEREIGN` item 2 — the clear headroom a road column keeps, in blocks.
 *
 * Three: a player is two blocks tall and the third is the block they step up
 * onto, so a road with three clear blocks above its surface is a road that can
 * be walked down. Anything a foreign pass puts inside that band across a road
 * severs it, whatever the pass meant by it; anything above it — a bridge, an
 * arch, a gatehouse spanning the way — is a structure the road runs under and
 * is left alone.
 */
const ROAD_SOVEREIGN_HEADROOM = 3;

/**
 * The emitters whose blocks **are** the road, and so are never cleared by it.
 *
 * Item 2 exempts "the road passes themselves", and that is a statement about
 * *authorship*, not about a span's name. Two of the road family's own writers
 * are laid under names of their own only because the freeze defers them past
 * pass 5c — `road-lanterns` is the route lamps the road pass planted itself off
 * the staged path, and `streetscape:furniture` is the kerbside dressing
 * `dressStreets` held back so that a lamp is sited on the frozen ground rather
 * than on the view a tier-C declarer gets. Both stand *on* the road family's own
 * surface, at the level the drape gave that column, so both are inside the
 * headroom band by construction: leaving them out of the exemption is the mask
 * eating its own street lamps, which it did — a lamp post's lower mast dropped
 * and its head left hanging (`unsupported.chain` on six worlds), or the whole
 * post deleted where the mast was short enough to fit inside the band.
 *
 * A wall sweep, a retaining course, a building or a doorstep crossing a road is
 * a different author and stays subject to the clear.
 */
const ROAD_SOVEREIGN_OWN_EMITTERS: ReadonlySet<string> = new Set([
  "roads",
  "streets",
  "road-lanterns",
  "streetscape:furniture",
]);

/** What the structure pass produced. */
export interface StructurePassResult {
  /** Blocks to stamp after the terrain columns are written. */
  readonly blocks: readonly StructureBlock[];
  /** Who pushed each run of {@link StructurePassResult.blocks}. See {@link BlockSpan}. */
  readonly blockSpans: readonly BlockSpan[];
  readonly buildings: readonly BuiltBuilding[];
  readonly plaza?: PlazaResult;
  readonly roads?: RoadNetworkResult;
  /**
   * The district street skeletons, as surfaced.
   *
   * `streets` here is the *surfacing*; the graphs themselves live on
   * `report.layout.districts[i].streets`, which is the pinned F4 contract.
   */
  readonly streets?: StreetSurfaceResult;
  /** The fabric pass's per-district products, carried through for the report. */
  readonly districts: readonly DistrictProduct[];
  readonly tunnels: readonly BuiltTunnel[];
  /** `infra.wall@0` — one per settlement node that opted in and got a course. */
  readonly walls: readonly BuiltWall[];
  readonly props: readonly PlacedProp[];
  /** F2's ground treatment: what each lot got, and how much ground it took. */
  readonly grounds?: GroundPassResult;
  /**
   * Every door's landing — carried out so the walkability audit can put a
   * doorstep in the pedestrian graph. A house whose step is not on the network
   * is a house you cannot walk out of, and nothing else here would notice.
   */
  readonly doorsteps: DoorstepResult;
  /**
   * The courtyards this world furnished, and the passages it roofed. Absent
   * when no quarter closed a block (`docs/COURTYARDS-AND-LEVELS-v0.md` §4).
   */
  readonly courtyards?: CourtyardPassResult;
  readonly precincts?: PrecinctPassResult;
  /** F17's holdings; absent for a document with no `precinct.farm@0` node. */
  readonly farms?: FarmPassResult;
  /**
   * F19's per-column ruin field (RUINS-PLAN §7.1), absent when no shell ruined.
   *
   * Carried out of the pass because the **clearing** reads it: §7.4 lifts the
   * tree-density multiplier over ruined ground so the wood comes back through
   * the fabric, and the clearing is built after the structures precisely
   * because it is derived from what they actually put on the ground.
   */
  readonly ruinField?: RuinField;
  /**
   * WP-6's green skin, absent when no shell ruined (the reach law, §3.4).
   *
   * Carried out of the pass because WP-6d's `colonized` mask travels to
   * `terrain/compile.ts`, where the scatter reads it. At WP-6a the mask is
   * empty and the block list is empty, so nothing downstream moves.
   */
  readonly greenSkin?: GreenSkinResult;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly stats: StructureStats;
}

/** How many columns a mask claims; 0 when there is no mask. */
function countMask(mask: Uint8Array | undefined): number {
  if (mask === undefined) return 0;
  let count = 0;
  for (let k = 0; k < mask.length; k++) if (mask[k] === 1) count++;
  return count;
}

/** The set bits of a column mask, as indices. */
function setColumns(mask: Uint8Array): number[] {
  const out: number[] = [];
  for (let idx = 0; idx < mask.length; idx++) if (mask[idx] === 1) out.push(idx);
  return out;
}

/** One city arterial, as `surfaceStreetGraph` and the stats read it. */
type Arterial = CityProduct["plan"]["arterials"][number];

/**
 * **What {@link declareStructures} computed, handed to {@link buildStructures}.**
 *
 * `docs/GROUND-CONTRACT-v1.md` §6/WP-G5. The structure pass used to be one
 * function and one closure: twenty-seven passes sharing thirty-odd locals —
 * masks, arc frames, occupancy claims, the material deal, the emitted block
 * list — with no name for any of it. §1.6's target shape needs the pass roster
 * to be *two* rosters (declare in tier order, then build), and a closure cannot
 * be cut in half. This interface is that cut, made explicit.
 *
 * Two properties are load-bearing and are what makes WP-G5 provably inert:
 *
 * 1. **Nothing here is recomputed.** Every field is the *same object* the
 *    declaring half produced — `blocks` and `blockSpans` by reference, so the
 *    build half appends to the one list the declare half was already appending
 *    to; `lay` is the same closure, so a span's attribution is unbroken;
 *    `built`, `retaining`, `streets`, `roads` are the pass results themselves.
 *    A field recomputed between the halves is a byte waiting to move.
 * 2. **The order of statements across the two halves is exactly the order of
 *    statements in the one function they came from.** WP-G5 introduces the seam;
 *    WP-G6 is what moves passes across it. So the driver's `commit`
 *    write-through fires at the same relative position it always did, and every
 *    build half reads the plan it read before.
 */
export interface StructurePlan {
  readonly rootPath: string;
  /** Accumulated by both halves; the result's `diagnostics`. */
  readonly diagnostics: LoamDiagnostic[];
  /** The one emitted block list, appended to by both halves. */
  readonly blocks: StructureBlock[];
  readonly blockSpans: BlockSpan[];
  /** The one `lay`, so attribution spans are continuous across the seam. */
  readonly lay: (emitter: string, list: readonly StructureBlock[]) => void;
  readonly placementByPath: ReadonlyMap<string, Placement>;
  readonly districts: readonly DistrictProduct[];
  readonly cities: readonly CityProduct[];
  readonly districtPaths: ReadonlySet<string>;
  /** Grows through the declare half — the farmstead and the precinct add to it. */
  readonly buildingPaths: ReadonlySet<string>;
  readonly precincts: PrecinctPassResult | undefined;
  /**
   * `ROAD_SOVEREIGN`'s hand-off across the WP-G5 seam, and **undefined while
   * the flag is off** so nothing is allocated and nothing is carried.
   *
   * `mask` is 1 on every column of road — street ribbon, lane ribbon and both
   * stone-brick borders. `surface` is what the top block of each of those
   * columns must be when the build half is finished with the world. Taken at
   * the moment the road was whole (the declaring half, right after the lane
   * network) because that is the last moment it is uncontested; enforced at the
   * very end of the build half, because that is the first moment the claim
   * "nothing writes over a road" can be true.
   */
  readonly sovereign: { readonly mask: Uint8Array; readonly surface: Int32Array } | undefined;
  /** R1's claimed planes, shared by the retaining pass and the cut-face finish. */
  readonly planes: readonly RetainingPlane[];
  readonly themeSeed: Seed256;
  readonly theme: MaterialTheme;
  /** The one per-scope theme resolver; the wall's own jobs still ask it. */
  readonly themeForNode: (nodePath: string) => MaterialTheme;
  readonly intents: ReturnType<typeof resolveIntents>;
  readonly rootIntent: ReturnType<typeof intentFor>;
  readonly linework: ReturnType<typeof declareLinework> | undefined;
  /**
   * **WP-G6a's declaring-half hand-off** (§6a.3): node path → the siting the
   * tier slots produced, for the *declaring* rows only.
   *
   * Empty with `GROUND_V1_FREEZE` off, which is what makes the split inert: the
   * build half then sites every row itself, exactly as it always did.
   */
  readonly infraSitings: InfraSitings;
  /** The settlement's material deal, in job order. */
  readonly deal: readonly BuildingMaterials[];
  /** Tags by node path, farmsteads included — the life pass's view. */
  readonly jobTags: ReadonlyMap<string, readonly string[]>;
  /** Every building the world holds, the farmstead included. */
  readonly built: readonly BuiltBuilding[];
  readonly ruinField: RuinField | undefined;
  readonly tunnelPass: ReturnType<typeof buildTunnels>;
  readonly plaza: PlazaResult | undefined;
  readonly retaining: RetainingPassResult;
  readonly courtyardPass: CourtyardPassResult;
  readonly canals: CanalPassResult;
  readonly streets: StreetSurfaceResult | undefined;
  /** C3's per-quarter walk lanes, kept rather than re-rasterized. */
  readonly streetMasks: readonly LifeStreets[];
  readonly streetFurniture: number;
  /**
   * **The kerbside dressing, held back for the building half** — v1 §2's
   * `masks.y` row (see `StreetscapeResult.furnish`).
   *
   * One closure per quarter, in quarter order. Empty with `GROUND_V1_FREEZE`
   * off, which is what makes the move inert: `dressStreets` then plants its own
   * lamps where it always did, and {@link StructurePlan.streetFurniture} is
   * already their count.
   */
  readonly streetFurnishings: readonly (() => StreetscapeFurnishing)[];
  readonly arterials: readonly Arterial[];
  readonly roads: RoadNetworkResult | undefined;
  readonly farms: FarmPassResult | undefined;
  readonly farmPorts: readonly ResolvedPort[];
  readonly props: PropPassResult;
  readonly propJobs: readonly PropJob[];
  readonly propFluids: ReturnType<typeof checkPropFluidSafety>;
  /**
   * **The doorstep walk, decided in the declaring half** — §6a.10 i, finished.
   *
   * `doorstep.landing` is tier D, and tier order (§1.6) requires every declarer
   * before every builder, so under `GROUND_V1_FREEZE` the walk runs here, last
   * in the declaring half, reading `view("D")` — the tiers strictly above it,
   * which is precisely §1.4's entitlement. The building half lays its blocks and
   * applies its paint at the pipeline position the pass has always occupied.
   *
   * `undefined` with the flag off, which is what makes the move inert: the
   * building half then runs the walk itself, exactly where it always did.
   */
  readonly doorsteps: DoorstepResult | undefined;
}

/**
 * **The declaring half** of the structure pass (§6/WP-G5).
 *
 * Every pass from the precincts through `prop.place@0`, in the order they have
 * always run, each ending in exactly the `driver.commit` its old body performed.
 * At WP-G5 a declaring pass's *emission* has not moved — `buildBuildings` still
 * lays its masonry here, at pass 9, with an absolute Y (§6/WP-G5's risk note);
 * WP-G6 is what moves it to pass 5e. What has moved is the seam: the eleven
 * passes after this line now run in {@link buildStructures}, reading a named
 * {@link StructurePlan} rather than a closure.
 */
export function declareStructures(input: StructurePassInput): StructurePlan {
  const rootPath = input.doc.root.id;
  const diagnostics: LoamDiagnostic[] = [];
  const byId = new Map(input.nodes.map((n) => [n.nodePath, n] as const));
  const placementByPath = new Map(input.placements.map((p) => [p.nodePath, p] as const));
  const docNodes = structureNodesOf(input.doc, rootPath);
  const districts = input.districts ?? [];
  const cities = input.cities ?? [];
  /** Every building the fabric pass produced, by node path. */
  const districtPaths = new Set<string>();
  // A city's own prefix as well as each cell's: a landmark the author wrote as
  // a child of the city keeps its `world.city.spire` path however deep in the
  // plan it actually landed, and it is still on a street rather than a
  // destination the road router must reach.
  for (const owner of [...districts.map((d) => d.nodePath), ...cities.map((c) => c.nodePath)]) {
    const prefix = `${owner}.`;
    for (const placement of input.placements) {
      if (placement.nodePath.startsWith(prefix)) districtPaths.add(placement.nodePath);
    }
  }

  // --- what the tunnels imply ----------------------------------------------
  // Read *before* the buildings are generated, because a building at the end of
  // a tunnel needs a cellar whether or not it asked for one — the constraint
  // says the two are connected, and there is nowhere else for a gallery to end.
  const links = tunnelLinksOf(input.doc, rootPath);
  const needsCellar = new Set<string>();
  /**
   * The cellar style a gallery implies at each of its ends.
   *
   * A mine gallery that arrives into a plain grey box has arrived nowhere: the
   * room at the end of a working is the bottom of the working. So a tunnel's
   * style carries into the cellars it opens into — and only where the document
   * did not say, because an explicit `basement.style` is a decision and this is
   * a default.
   */
  const impliedStyle = new Map<string, string>();
  for (const link of links) {
    needsCellar.add(link.fromPath);
    needsCellar.add(link.toPath);
    const implied = link.style === "mine" ? "mine" : link.style === "crypt" ? "crypt" : null;
    if (implied === null) continue;
    for (const path of [link.fromPath, link.toPath]) {
      if (!impliedStyle.has(path)) impliedStyle.set(path, implied);
    }
  }

  // --- precincts -----------------------------------------------------------
  // First of everything, and it has to be: a precinct grades its own apron or
  // quay, and every pass after this one — the buildings that front it, the
  // props parked on it, the roads that arrive at it — measures the ground it
  // left behind. It also *produces* buildings and props, which are folded into
  // the ordinary job lists below so that a terminal gets the village theme, a
  // foundation and a doorstep exactly like a cottage does.
  const precinctJobs: PrecinctJob[] = [];
  for (const placement of input.placements) {
    const node = byId.get(placement.nodePath);
    if (node?.generator === undefined || !isPrecinctGenerator(node.generator)) continue;
    precinctJobs.push({
      nodePath: placement.nodePath,
      generator: node.generator,
      placement,
      params: (docNodes.get(placement.nodePath)?.params ?? {}) as Record<string, unknown>,
      seed: node.seed,
      tags: node.tags,
      ports: node.ports as Readonly<Record<string, PortDeclaration>>,
      constraints: node.constraints as readonly Readonly<Record<string, unknown>>[],
    });
  }
  const precincts =
    precinctJobs.length === 0
      ? undefined
      : buildPrecincts({
          jobs: precinctJobs,
          plan: input.plan,
          ground: input.ground,
          stack: input.stack,
          ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
        });
  if (precincts !== undefined) diagnostics.push(...precincts.diagnostics);

  /**
   * **R1's claimed planes** (`docs/GROUND-UNIFICATION-v0.md` §11.2, wave 12E) —
   * levelled ground no quarter drew, handed to the two passes that serve an edge.
   *
   * The qualifying family is the *non-district* one §11.2 names: "the quay, the
   * airport apron, and every later pass that levels ground outside a quarter" —
   * which is exactly `PrecinctPassResult.declarations`, one per precinct kit that
   * graded anything, `precinct.harbour@0` and `precinct.airport@0` alike. Nothing
   * is filtered by kit: a claim family qualifies because it *levelled ground and
   * stopped*, not because of whose kit levelled it, and the airport's forecourt
   * cut into a hillside presents the same raw face the walked quay does.
   *
   * `tiered` is left off, so each plane defaults to `GROUND_PLANE_TIE` and this
   * whole list is inert — measured not at all, allocated not at all — until 12F
   * flips it. A test builds one plane's flag-on world by passing `tiered: true`.
   */
  const planes: RetainingPlane[] = (precincts?.declarations ?? []).map((d) => ({
    nodePath: d.nodePath,
    columns: d.columns,
    planeY: d.planeY,
  }));

  /**
   * The placements every pass after this one reads.
   *
   * Identical to the solver's list except where a precinct reseated itself — a
   * harbour that had to go and find the coast. Substituting here rather than
   * mutating the solver's record keeps one truth in play downstream: the roads
   * route to the quay that was built, the props measure the ground that was
   * graded, and nothing is left arriving at an empty box.
   */
  const placements =
    precincts === undefined || precincts.relocations.size === 0
      ? input.placements
      : input.placements.map((p) => precincts.relocations.get(p.nodePath) ?? p);

  // --- buildings -----------------------------------------------------------
  const jobs: BuildingJob[] = [];
  const buildingPaths = new Set<string>();
  for (const placement of placements) {
    const node = byId.get(placement.nodePath);
    if (node?.generator !== "building.grammar@0") continue;
    buildingPaths.add(placement.nodePath);
    const params = (docNodes.get(placement.nodePath)?.params ??
      input.paramsByPath?.get(placement.nodePath) ??
      {}) as Record<string, unknown>;
    const basement = resolveBasementParam(params["basement"], needsCellar.has(placement.nodePath));
    const cellarStyle = resolveBasementStyle(
      params["basement"],
      impliedStyle.get(placement.nodePath),
    );
    const wing = wingParamOf(params["wing"]);
    const bays = terraceBaysParamOf(params["bays"]);
    jobs.push({
      nodePath: placement.nodePath,
      placement,
      size: node.size,
      params: {
        ...(typeof params["floors"] === "number" ? { floors: params["floors"] } : {}),
        ...(typeof params["floorHeight"] === "number" ? { floorHeight: params["floorHeight"] } : {}),
        ...(typeof params["roof"] === "string" ? { roof: params["roof"] } : {}),
        ...(typeof params["windowRhythm"] === "string" ? { windowRhythm: params["windowRhythm"] } : {}),
        ...(typeof params["wallSymbol"] === "string" ? { wallSymbol: params["wallSymbol"] } : {}),
        ...(typeof params["trimSymbol"] === "string" ? { trimSymbol: params["trimSymbol"] } : {}),
        ...(typeof params["roofSymbol"] === "string" ? { roofSymbol: params["roofSymbol"] } : {}),
        ...(basement === 0 ? {} : { basement }),
        ...(cellarStyle === undefined ? {} : { cellarStyle }),
        // The L and the T. Read through `wingParamOf`, which is where a
        // defective shape becomes `undefined` rather than an exception — the
        // profile validator is what tells the author about it, with a hint.
        ...(wing === undefined ? {} : { wing }),
        // The terrace's bays, read through `terraceBaysParamOf` for the same
        // reason: a defective list becomes `undefined` here rather than an
        // exception, and the terrace grammar draws its own bays when it gets
        // nothing. The two corner flags travel with them.
        ...(bays === undefined ? {} : { bays }),
        // `params.decay` — RUINS-PLAN-v0 §4.3, the author's way to ruin one
        // named building. Read straight through: the grammar clamps it, and
        // `LOAM-T227` is what tells an author who wrote 1.5.
        ...(typeof params["decay"] === "number" ? { decay: params["decay"] } : {}),
        // `params.entrance` — the family-D fitting on the way in
        // (docs/INFRA-ENTRIES-v0.md §2 D: `blast_door`, `airlock_vestibule`).
        // Only the treatment travels: the rest of the `entrance` object is the
        // port/porch/steps vocabulary the shell has always drawn for itself.
        ...(entranceTreatmentOf(params["entrance"]) === undefined
          ? {}
          : { entrance: { treatment: entranceTreatmentOf(params["entrance"]) as string } }),
        ...(params["cornerStart"] === true ? { cornerStart: true } : {}),
        ...(params["cornerEnd"] === true ? { cornerEnd: true } : {}),
        archetype:
          typeof params["archetype"] === "string"
            ? params["archetype"]
            : archetypeOfTags(node.tags),
      },
      ports: node.ports as Readonly<Record<string, PortDeclaration>>,
      seed: node.seed,
      tags: node.tags,
    });
  }

  // The precinct's own buildings, appended after the document's so that adding
  // an aerodrome never reshuffles the material deal of the houses in the town.
  const precinctPorts: ResolvedPort[] = [];
  if (precincts !== undefined) {
    precinctPorts.push(...precincts.ports);
    for (const spec of precincts.buildings) {
      buildingPaths.add(spec.nodePath);
      jobs.push({
        nodePath: spec.nodePath,
        placement: spec.placement,
        size: spec.size,
        params: { archetype: spec.archetype },
        ports: spec.ports,
        seed: nodeSeed(input.worldSeed, spec.nodePath, ""),
        tags: spec.tags,
      });
      precinctPorts.push(...resolvePorts(spec.placement, spec.size, spec.ports));
    }
  }

  // --- the village theme ---------------------------------------------------
  // One theme for the settlement, drawn from the root node's seed, then one
  // distinct (wood, stone, roof) triple dealt to each building in document
  // order. Dealing centrally rather than per-building is what makes "no two
  // houses alike" a property of the village rather than a coincidence.
  const themeSeed: Seed256 = nodeSeed(input.worldSeed, rootPath, "");
  // The theme the document already asked for, then the intent layer's chance
  // to answer instead. `themes.materialTheme` is total: with no intent
  // declared it hands back exactly what `themeOverride` said, which is what
  // the byte-identity law requires.
  ensureFanOutRows();
  const intents = resolveIntents(input.doc);
  const rootIntent = intentFor(intents, rootPath);
  const declaredTheme = themeOverride(input.doc);
  const themeId = fanOut<string | undefined>(STRUCTURE_ROWS.materialTheme, rootIntent, {
    nodePath: rootPath,
    today: declaredTheme,
  });
  const theme: MaterialTheme = pickTheme(themeSeed, themeId);

  // --- the built ground's material roles ------------------------------------
  // The theme is drawn; the palette can now answer for the ground a settlement
  // *builds* rather than the ground it stands on. This is one call and it is
  // where the "everything is the same grey" defect is actually fixed: the
  // streetscape's pavement and kerb, the canal's coping and quay, the
  // courtyard's edge, the retaining wall's face and the stair's tread all ask
  // the palette for a symbol that used to have no value and fell back to one
  // hard-coded block each. `Palette.derive` refuses to move anything the
  // document itself wrote, so `style.palettes` is still the last word.
  //
  // It runs here, before the first pass reads a symbol, because a role that
  // arrived halfway through would make two columns of one wall different
  // colours. Per-scope themes deliberately do **not** re-derive: the built
  // ground between two quarters is one continuous thing, and a kerb that
  // changed colour at a district boundary would read as a seam, not a place.
  for (const bad of defineGroundRoles(input.palette, input.stack, theme)) {
    diagnostics.push(
      warning(
        "BAD_PALETTE",
        rootPath,
        `the "${theme.id}" material theme gives ground role "${bad.symbol}" the block "${bad.block}", which does not exist in this Minecraft version`,
        "this is a compiler bug rather than a document problem — the role keeps its previous value meanwhile",
      ),
    );
  }

  // RUINS-PLAN-v0-WP6 §4.4 / Q1: the green skin's one theme-gated symbol. It
  // resolves in the themes that declare it and simply does not exist in the
  // others, which is the whole of the gate — a theme with no `foliage.glow_lichen`
  // grows no lichen because the substitution has nothing to write.
  for (const bad of defineGreenSkinSymbols(input.palette, input.stack, theme)) {
    diagnostics.push(
      warning(
        "BAD_PALETTE",
        rootPath,
        `the "${theme.id}" material theme gives green-skin symbol "${bad.symbol}" the block "${bad.block}", which does not exist in this Minecraft version`,
        "this is a compiler bug rather than a document problem — the symbol stays unresolved and the skin writes no lichen",
      ),
    );
  }

  // Every string the intent layer carries, checked against the real registries
  // exactly once. An ungrounded word is a warning naming the legal values —
  // never a silent drop, which is what made a "white_quartz" village come out
  // looking like every other village.
  diagnostics.push(...checkIntentVocabulary(intents));

  // --- per-scope themes ----------------------------------------------------
  // A district that named its own `character.materialTheme` is built in it.
  // Jobs are grouped by the theme they resolved to, in document order, and each
  // group is dealt from its own theme — so a world where every job resolves to
  // the same theme (which is every world with no intent) takes exactly one
  // deal of exactly the length it always took, and is byte-identical.
  //
  // One resolver, so a wall round a quarter and the houses inside it cannot
  // disagree about which theme that quarter is in.
  const themeForNode = (nodePath: string): MaterialTheme => {
    const scoped = intentFor(intents, nodePath);
    const id = fanOut<string | undefined>(STRUCTURE_ROWS.materialTheme, scoped, {
      nodePath,
      today: declaredTheme,
    });
    return id === themeId || id === undefined ? theme : pickTheme(themeSeed, id);
  };
  // --- the linework declaration slot (GROUND-CONTRACT §13.2a) --------------
  // **After `buildPrecincts` (rank 20) and before `pavePlaza` (rank 30)**, so
  // pipeline order and rank order agree from 0 through 30 — which is what makes
  // this slot's view a legal tier-A read rather than a convenient one (rule 2).
  //
  // It is also as early inside that window as the theme resolver allows, and
  // deliberately: rule 8 says a rank-25 bed does **not** move blocks a
  // lower-ranked pass has already emitted, and `StructureBlock`s carry an
  // absolute Y. Declaring before `buildBuildings` means there is no emitted
  // masonry in the world at all when the bed lands, so the rule has nothing to
  // bite on rather than being obeyed by hand.
  //
  // It writes no block. The materials stay in the wall's slot with the rest of
  // the infrastructure host and are laid against `plan.ground` — the resolver's
  // answer — through the `LineworkBeds` handoff below (rule 9).
  const allInfraJobs = infraEntryJobsOf(input.doc, rootPath, input.worldSeed, (p) =>
    themeForNode(p),
  );
  const lineworkJobs = allInfraJobs.filter(declaresLinework);
  // **WP-G6a's declaring rows** (§6a.2): the ones with a tier at all. A painter
  // is not here — it declares nothing, §1.4 does not govern it, and it is sited
  // from the finished world in the build half exactly as it always was.
  const declaringInfraJobs = GROUND_V1_FREEZE ? allInfraJobs.filter(declaresGround) : [];
  // §13.2a rule 5's first bullet: the **solved** carriageway, not the surfaced
  // one. The street graphs, the arterials and the frozen road corridor are all
  // decided in the layout stage, which is exactly the distinction that let the
  // rank stop being reserved.
  const solvedCarriageway =
    lineworkJobs.length === 0 && declaringInfraJobs.length === 0
      ? undefined
      : solvedCarriagewayMask(input.plan.region, districts, cities, [], input.roadCorridor);
  /**
   * **The parcel layout as a datum** (§6a.5).
   *
   * Published by the farm pass from the rects `packHolding` decided *before* its
   * own commit, so it is a fact about the layout rather than about arbitration
   * and any tier may read it. It is empty at the tier-A and tier-B slots because
   * the holdings are packed at tier D — a farm-anchored *declaring* entry
   * therefore resolves `unanchored` and says so, which is the honest report
   * until `packHolding` itself moves up to pass 4.
   */
  let parcelDatum: ParcelDatum = EMPTY_PARCEL_DATUM;
  /** Every declaring entry's siting, accumulated across the three tier slots. */
  const infraSitings = new Map<string, InfraSiting>();
  /**
   * The layout view one declaring tier sees (§6a.4).
   *
   * `declareLinework`'s view generalised, and narrow for the same reason: the
   * solver's footprint rather than a fabric hull (no fabric exists yet), the
   * widest **solved** street rather than a surfaced one, the parcel *datum*
   * rather than the resolved parcel mask, and `driver.view(tier)` — §1.4's
   * prefix — as the ground.
   */
  const layoutInfraView = (tier: GroundTier): InfraPlacementView => {
    const region = input.plan.region;
    const carriageway = solvedCarriageway;
    return {
      bounds: { x0: region.x0, z0: region.z0, width: region.width, depth: region.depth },
      extentOf: (id: string) => {
        const nodePath = `${rootPath}.${id}`;
        const fields = parcelExtentOf(parcelDatum, nodePath);
        if (fields !== undefined) return fields;
        const footprint = placementByPath.get(nodePath)?.footprint;
        if (footprint === undefined) return undefined;
        return [
          { x: footprint.x0, z: footprint.z0 },
          { x: footprint.x1, z: footprint.z0 },
          { x: footprint.x1, z: footprint.z1 },
          { x: footprint.x0, z: footprint.z1 },
        ];
      },
      corridorOf: (id: string) => widestSolvedStreet(districts, `${rootPath}.${id}`),
      maskOf: (id: string) => parcelMaskOf(parcelDatum, `${rootPath}.${id}`, region),
      ground: (x: number, z: number) => {
        const view = input.ground.view(tier);
        if (!inside(view.region, x, z)) return undefined;
        const k = index(view.region, x, z);
        if (view.fluidKind[k] !== 0) return undefined;
        return (view.ground[k] as number) + 1;
      },
      onRoad: (x: number, z: number): boolean => {
        if (carriageway === undefined || !inside(region, x, z)) return false;
        return carriageway[index(region, x, z)] === 1;
      },
    };
  };
  /** Site and declare every declaring row whose class sits in `tier` (§6a.3). */
  const declareInfraAt = (tier: GroundTier): void => {
    if (declaringInfraJobs.length === 0 || solvedCarriageway === undefined) return;
    const out = declareInfraEntries(
      {
        region: input.plan.region,
        baseline: input.ground.baseline,
        jobs: declaringInfraJobs,
        ground: input.ground,
        solvedCarriageway,
        ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
        view: layoutInfraView(tier),
      },
      tier,
    );
    for (const [path, siting] of out.sitings) infraSitings.set(path, siting);
    diagnostics.push(...out.diagnostics);
  };
  const linework =
    lineworkJobs.length === 0 || solvedCarriageway === undefined
      ? undefined
      : declareLinework({
          region: input.plan.region,
          jobs: lineworkJobs,
          ground: input.ground,
          carriageway: solvedCarriageway,
          // The baseline's water. `digCanals` is rank 0 and runs *later*
          // (§9a.4's named approximation), so a linework keeps off water by
          // reading this rather than by waiting for the canal pass; where it
          // collides anyway rank 0 settles it silently and correctly.
          fluidKind: input.ground.baseline.fluidKind,
          view: {
            bounds: {
              x0: input.plan.region.x0,
              z0: input.plan.region.z0,
              width: input.plan.region.width,
              depth: input.plan.region.depth,
            },
            // The **finished placement** (rule 3), which is what a tier-A
            // declarer is entitled to and all it is entitled to: the solver's
            // footprint, never a fabric hull, because no fabric exists yet.
            extentOf: (id: string) => {
              const footprint = placementByPath.get(`${rootPath}.${id}`)?.footprint;
              if (footprint === undefined) return undefined;
              return [
                { x: footprint.x0, z: footprint.z0 },
                { x: footprint.x1, z: footprint.z0 },
                { x: footprint.x1, z: footprint.z1 },
                { x: footprint.x0, z: footprint.z1 },
              ];
            },
            // A district's or a city's widest solved street, by the same stated
            // total order the host's own view uses (greatest width, then the
            // lowest segment id) so two compiles pick the same one.
            corridorOf: (id: string) => widestSolvedStreet(districts, `${rootPath}.${id}`),
            maskOf: () => undefined,
            // `driver.view()` at this position, which here *is* the baseline
            // plus the precinct grading written through (rule 3).
            ground: (x: number, z: number) => {
              const view = input.ground.view();
              if (!inside(view.region, x, z)) return undefined;
              const k = index(view.region, x, z);
              if (view.fluidKind[k] !== 0) return undefined;
              return view.ground[k] as number;
            },
            // The same mask the subtraction uses, so the two route forms that
            // ask about a road (`across`, and `open`'s gate finding) and the
            // subtraction cannot disagree about where one is.
            onRoad: (x: number, z: number): boolean => {
              if (!inside(input.plan.region, x, z)) return false;
              return solvedCarriageway[index(input.plan.region, x, z)] === 1;
            },
          },
        });
  if (linework !== undefined) diagnostics.push(...linework.diagnostics);
  // **Tier A** (§6a.3): `fluid.channel` — the water movers — and any row whose
  // class is `structure.linework`. Beside the linework slot, and for its reason:
  // pipeline order and rank order agree from 0 through 30 here, so this view is
  // a legal tier-A read rather than a convenient one.
  declareInfraAt("A");

  const jobThemes = jobs.map((job) => themeForNode(job.nodePath));
  const groups = new Map<string, number[]>();
  for (const [i, t] of jobThemes.entries()) {
    const bucket = groups.get(t.id);
    if (bucket === undefined) groups.set(t.id, [i]);
    else bucket.push(i);
  }
  const deal: BuildingMaterials[] = new Array(jobs.length) as BuildingMaterials[];
  for (const [themeKey, indices] of groups) {
    const groupTheme = jobThemes[indices[0] as number] as MaterialTheme;
    void themeKey;
    const groupDeal = assignMaterials(groupTheme, indices.length, themeSeed);
    for (const [k, jobIndex] of indices.entries()) {
      deal[jobIndex] = groupDeal[k] as BuildingMaterials;
    }
  }
  // The whole palette rides along beside the triple, not instead of it. Only
  // the terrace reads it, and it reads it for a reason no other building has:
  // a terrace is several buildings, so one triple cannot clothe it — each bay
  // takes its own from the same theme, which is what makes a run read as a
  // street rather than as one long building painted one colour.
  const themed = jobs.map((job, i) => {
    // `grammar.ornamentDensity`: how much shutter-and-window-box the facade
    // carries. Absent intent hands the grammar its own constant back, so the
    // param is only written when the row actually moved it.
    const scoped = intentFor(intents, job.nodePath);
    const ornament = fanOut<number>(STRUCTURE_ROWS.ornamentDensity, scoped, {
      nodePath: job.nodePath,
      today: DEFAULT_ORNAMENT_DENSITY,
    });
    // `grammar.windowRhythm`: how windows march across a facade. `today` is
    // what this building would have built anyway — the node's own param if it
    // named one, else its archetype's intrinsic facade — so a document that
    // declares no motif is byte-identical, and the row only ever speaks where
    // *nothing else did*. That last clause is deliberate and is where this row
    // differs from `grammar.roofForm`: a warehouse with `windowRhythm: "none"`
    // and a church with its bay lights are archetype identity, and a settlement
    // motif that punches a regular grid into every blank wall in town is the
    // "one long shed" failure one level up.
    const declared =
      typeof job.params.windowRhythm === "string"
        ? job.params.windowRhythm
        : archetypeFacadeDefaults(resolveArchetype(job.params.archetype)).windowRhythm;
    const rhythm = fanOut<string | undefined>(STRUCTURE_ROWS.windowRhythm, scoped, {
      nodePath: job.nodePath,
      today: declared,
    });
    const withRhythm =
      declared !== undefined || rhythm === undefined
        ? job.params
        : { ...job.params, windowRhythm: rhythm };
    return {
      ...job,
      params:
        ornament === DEFAULT_ORNAMENT_DENSITY
          ? withRhythm
          : { ...withRhythm, ornamentDensity: ornament },
      materials: deal[i] as BuildingMaterials,
      theme: jobThemes[i] as MaterialTheme,
    };
  });

  const jobTags = new Map(jobs.map((job) => [job.nodePath, job.tags] as const));

  const buildings = buildBuildings(themed, input.plan, input.stack);
  diagnostics.push(...buildings.diagnostics);
  // --- the ruin field (RUINS-PLAN-v0 §7.1) ---------------------------------
  // Built here because here is the first moment it can be: WP-3 rolled the
  // lots, the grammar has just told us which shells came back decayed, and the
  // three passes that read it — the street surfacer, the ground treatment, and
  // the clearing lift out in `terrain/compile.ts` — all run after this line.
  // `undefined` when nothing ruined, which is the reach law made structural.
  const ruinField = buildRuinField(
    input.plan.region,
    buildings.built,
    new Map(
      themed.map(
        (job) =>
          [job.nodePath, typeof job.params.decay === "number" ? job.params.decay : 0] as const,
      ),
    ),
  );
  const blocks: StructureBlock[] = [];
  /** See {@link BlockSpan}. A return value only; nothing downstream reads it. */
  const blockSpans: BlockSpan[] = [];
  /**
   * Append a pass's blocks and record the range they landed in.
   *
   * Copied in chunks rather than spread: `push(...list)` puts every element on
   * the argument stack, and a harbour town's building pass hands over enough
   * blocks to overflow it. (Measured — `c1-harbourtown`.) The old
   * `[...a, ...b]` array literal this replaced had no such limit, so the
   * failure only appeared once the concatenation became a call.
   */
  const lay = (emitter: string, list: readonly StructureBlock[]): void => {
    if (list.length === 0) return;
    const from = blocks.length;
    for (let i = 0; i < list.length; i += LAY_CHUNK) {
      blocks.push(...list.slice(i, i + LAY_CHUNK));
    }
    blockSpans.push({ emitter, from, to: blocks.length });
  };
  lay("precincts", precincts?.blocks ?? []);
  lay("buildings", buildings.blocks);
  if (input.occupancy !== undefined) {
    for (const built of buildings.built) claimFootprint(input.occupancy, built);
  }

  // --- tunnels -------------------------------------------------------------
  // Immediately after the buildings, because it needs their cellars and nothing
  // else — and immediately *before* the plaza and the roads, because it claims
  // its portal mouths in the occupancy grid and those two passes read it. A
  // tunnel that surfaced under a lamp post would leave the post standing on
  // air, which is exactly what happened when this ran last.
  const tunnelPass = buildTunnels({
    links,
    buildings: buildings.built,
    placements,
    ports: input.ports,
    declaredPorts: new Map(input.nodes.map((n) => [n.nodePath, n.ports] as const)),
    plan: input.plan,
    stack: input.stack,
    seed: themeSeed,
    ...(deal[0] === undefined ? {} : { materials: deal[0] as BuildingMaterials }),
    ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
  });
  diagnostics.push(...tunnelPass.diagnostics);
  lay("tunnels", tunnelPass.blocks);
  if (tunnelPass.tunnels.length > 0) attachTunnelSpans(input.plan, tunnelPass);

  // --- the plaza -----------------------------------------------------------
  // Before the roads, so a lane arriving on the green blends into paving that
  // already exists rather than being overwritten by it.
  const plazaNode = input.nodes.find((n) => n.kind === "primitive");
  const plazaPlacement =
    plazaNode === undefined ? undefined : placementByPath.get(plazaNode.nodePath);
  let plaza: PlazaResult | undefined;
  if (plazaNode !== undefined && plazaPlacement !== undefined) {
    plaza = pavePlaza({
      nodePath: plazaNode.nodePath,
      placement: plazaPlacement,
      plan: input.plan,
      ground: input.ground,
      palette: input.palette,
      stack: input.stack,
      seed: seed32(streamSeed(plazaNode.seed, "plaza")),
      ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
    });
    diagnostics.push(...plaza.diagnostics);
    lay("plaza", plaza.blocks);
  }

  // --- district streets ----------------------------------------------------
  // Before the inter-district roads and after the buildings, and both halves of
  // that are load-bearing. After the buildings, because a street may not cut
  // into a facade it was drawn to meet. Before the roads, because a lane
  // arriving from the next district should *join* the street grid, and the
  // router discounts existing road cells — which is exactly how a lane finds a
  // street rather than running alongside it.
  // --- the retaining walls (Phase 4.2, WP-B) -------------------------------
  // SLOT, filled by `structures/retaining.ts`. The
  // ordering is load-bearing and is stated here once, beside the canal comment
  // that states the other half (`docs/COURTYARDS-AND-LEVELS-v0.md` §3.4, §9.8):
  // the retaining pass runs **after the buildings and before the canals and the
  // street surfacing**. After the buildings, because a seam a building already
  // stands on is `treatment: "built"` — its own foundation skirt is the wall
  // and nothing else may be built there. Before the surfacing, because the
  // surfacer must see the finished ground and a wall must not be cut into by a
  // street drawn before it existed; a seam column a street already claims is
  // skipped, since the street is the connection, not a wall across it.
  //
  // The balustrade on top of a wall is emitted with the wall, as a cap on the
  // `face` band, and it clears the furnish bar a different way from the stair
  // rail's: the wall's columns are kept clear of the street network, its coping
  // is emitted as a structure block as well as a plan column, and its seam mask
  // goes to the surfacer so `blendShoulders` never smooths a face. "The furnish
  // phase runs after every ground write" is false — WP-A measured it — so
  // nothing here relies on it (§3.4's correction).
  const retaining = buildRetainingWalls({
    districts,
    // R1's claimed planes ride in beside the quarters and take exactly the same
    // path through this pass — see `planes` above.
    ...(planes.length === 0 ? {} : { planes }),
    plan: input.plan,
    ground: input.ground,
    palette: input.palette,
    stack: input.stack,
    footprints: buildings.built.map((b) => b.footprint),
  });
  diagnostics.push(...retaining.diagnostics);
  lay("retaining", retaining.blocks);
  // §3.3's built-set, published to the stage the moment it exists. The
  // generator inside the fifth resolve and `finishSeams`' complement walk must
  // skip *the same* runs, and this mask is the only evidence either of them has;
  // reading it off the owner map instead cost pirates 77 skirt-owned cliff pairs
  // and 139 spurious ones (see `ResolveOptions.built`).
  if (retaining.wallColumns > 0) input.ground.reportBuilt(retaining.seam);
  // **Tier B** (§6a.3): `retaining.seam` and `retaining.skirt` — the entries
  // that are not a run following the ground but the step itself. Beside the
  // retaining pass, whose tier they share and whose `face`+`preserve` pairing
  // they borrow, and before any tier-C read.
  declareInfraAt("B");

  // --- the seam stairs (S9) ------------------------------------------------
  // Here, and it can be nowhere else: the retaining pass has just published the
  // landings a served seam left — its floor, its treads and the platform it
  // holds — and the surfacer has not run yet. A derived flight is registered as
  // an ordinary `role: "steps"` segment on the quarter's own graph, so
  // `surfaceStreetGraph` lays it under the existing tread law and refuses it
  // whole where it cannot be made climbable. No stair code is added anywhere.
  //
  // Empty, and allocating nothing, on every quarter whose seams published no
  // landings — which is every quarter until `SEAM_TIERS` flips or a fixture
  // asks one for `tiered: true`.
  //
  // **`ROAD_SOVEREIGN` skips S9 whole** (item 3). A derived seam flight is a
  // staircase cut into the ground by a pass that exists to reconcile a tier
  // stack with a street; under the flag the street is draped on the ground the
  // tier stack left, so there is no reconciliation to make and no stair to make
  // it with. The retaining pass keeps its landings — they are a wall's own
  // geometry — and nothing derives a flight from them.
  if (!ROAD_SOVEREIGN && retaining.landings.length > 0) {
    for (const d of districts) {
      const mine = retaining.landings.filter((l) => l.nodePath === d.nodePath);
      if (mine.length === 0) continue;
      const bounds = d.bounds;
      const width = bounds.x1 - bounds.x0 + 1;
      const descent = d.descent;
      const derived = deriveSeamStairs({
        nodePath: d.nodePath,
        landings: mine,
        // The landings *are* the flag: they only exist where a tier stack was
        // allowed to build, which is `SEAM_TIERS` or a fixture's `tiered: true`
        // on this one quarter. Reading the compile-time flag again here would
        // drop the fixture's stairs on the floor.
        tiered: true,
        // §5.3: S9 may not cut a flight through a face a descent already
        // claims. The demand belongs to the descent — as its trunk or as a
        // branch joining at a landing — and a second staircase down the same
        // cliff, drawn by a pass that cannot see the cliff, is exactly S4's
        // defect. Absent while `DESCENT_SOLVE` is off, so the pass is called
        // with the argument object it has always been called with.
        ...(descent === undefined
          ? {}
          : {
              claimed: (x: number, z: number): boolean => {
                const r = descent.region;
                const i = x - r.x0;
                const j = z - r.z0;
                if (i < 0 || j < 0 || i >= r.width || j >= r.depth) return false;
                return descent.claimed[j * r.width + i] === 1;
              },
            }),
        onStreet: (x: number, z: number): boolean => {
          if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return false;
          const at = (z - bounds.z0) * width + (x - bounds.x0);
          return d.carriageway[at] === 1 || d.sidewalk[at] === 1;
        },
      });
      diagnostics.push(...derived.diagnostics);
      if (derived.segments.length === 0) continue;
      (d as { streets: StreetGraph }).streets = {
        ...d.streets,
        segments: [...d.streets.segments, ...derived.segments],
      };
    }
  }

  // --- the courtyards (Phase 4.2, WP-C) ------------------------------------
  // SLOT, filled. It runs after `buildBuildings` and before the streetscape,
  // because the passage arch springs from the flanking bays' walls and is only
  // built when a readback of the emitted block list finds both of them solid at
  // the arch height — a floating arch is never built (§4.4). The interior
  // treatments claim their columns in the occupancy grid, so no scatter, ground
  // treatment or prop lands in a courtyard the pass has furnished.
  //
  // `furnishCourtyards` returns untouched when no quarter closed a block, which
  // is every document written before this phase.
  const courtyardPass = furnishCourtyards({
    districts,
    plan: input.plan,
    ground: input.ground,
    palette: input.palette,
    stack: input.stack,
    emitted: blocks,
    seed: seed32(streamSeed(themeSeed, "courtyard")),
    ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
  });
  diagnostics.push(...courtyardPass.diagnostics);
  lay("courtyards", courtyardPass.blocks);

  // --- the canals ----------------------------------------------------------
  // After the column plan, before the streets are surfaced, and that ordering
  // is the whole risk-management story of the `canal` form
  // (`docs/URBAN-FORMS-v0.md` §4.3 and §9): `surfaceStreetGraph`'s
  // `buildBridgeableMask` reads `plan.fluidKind`, so the water has to exist
  // before a bridge over it can be priced — and once it does exist, every
  // water-aware pass after this point (biomes, the land-use clamp, the scatter
  // clip, the life pass, the props' shore probes, three physics rules) sees the
  // one answer instead of a second mask. `digCanals` returns untouched when no
  // quarter declared a channel, which is every document written before this
  // phase.
  const canals: CanalPassResult = digCanals({
    districts,
    plan: input.plan,
    ground: input.ground,
    nodePath: rootPath,
    palette: input.palette,
    stack: input.stack,
  });
  diagnostics.push(...canals.diagnostics);

  let streets: StreetSurfaceResult | undefined;
  const streetMasks: LifeStreets[] = [];
  const streetFurnishings: (() => StreetscapeFurnishing)[] = [];
  let streetFurniture = 0;
  // Qualified by the city that drew them, for the same reason a district's
  // segments are (`StreetSurfaceInput.graphPaths`): every city plan calls its
  // runs `drive`/`spine`/`ring`, so two cities in one document would mint one
  // rank id — and one `street:` intent source — for two different boulevards.
  // The qualifier trails the id behind `SEGMENT_ID_SEPARATOR`, so a one-city
  // world ranks its arterials in exactly the order it always did.
  const arterials = cities.flatMap((c) =>
    c.plan.arterials.map((a) => ({ ...a, id: `${a.id}${SEGMENT_ID_SEPARATOR}${c.nodePath}` })),
  );
  if (districts.length > 0 || arterials.length > 0) {
    streets = surfaceStreetGraph({
      graphs: districts.map((d) => d.streets),
      // What makes a segment id unique across quarters — without it two `grid`
      // districts both name their runs `ns0…` and the arc-levels map below keeps
      // only the last one's frames. See `StreetSurfaceInput.graphPaths`.
      graphPaths: districts.map((d) => d.nodePath),
      // F8: the datum the quarter graded when its graph was drawn, lined up with
      // `graphs` by the same `districts` walk that lines up `graphPaths`. Handed
      // over only when at least one quarter has one — which is never while
      // `FRONTAGE_TIE` is off — so the surfacer is called with exactly the
      // argument object it has always been called with.
      ...(districts.some((d) => d.datum !== undefined)
        ? { datums: districts.map((d) => d.datum) }
        : {}),
      // §4.2's registration, lined up with `graphs` by the same `districts`
      // walk: where a demand was solved, the descent's **run** is the flight —
      // its alignment and its profile both — and it files exactly the claim
      // this pass already files for a flight (`street.network`, rank 80,
      // `preserve` over its band). The second thing it carries is §5.2's
      // scoping: `terminusLandings` is skipped on a claimed face, where T5's
      // equality means there is nothing to negotiate. Handed over only when at
      // least one quarter solved one, so the flag's off state calls the
      // surfacer with the argument object it has always been called with.
      ...(districts.some((d) => d.descent !== undefined)
        ? { descents: districts.map((d) => d.descent) }
        : {}),
      ground: input.ground,
      ...(arterials.length === 0
        ? {}
        : { arterials: arterials.map((a) => ({ id: a.id, width: a.width, path: a.path })) }),
      plan: input.plan,
      palette: input.palette,
      stack: input.stack,
      placements,
      buildingPaths,
      theme: theme.id,
      // F10: a quarter that named its own `character.materialTheme` gets that
      // theme's street family. Resolved with the very same `themes.materialTheme`
      // fan-out row the building jobs use, so a district's road and its buildings
      // can no longer disagree about what the place is built of. Every entry is
      // `undefined` when no quarter overrides — which is every single-theme
      // world — and the surfacer then takes the root path unchanged.
      graphThemes: districts.map((d) => {
        const scoped = intentFor(intents, d.nodePath);
        const id = fanOut<string | undefined>(STRUCTURE_ROWS.materialTheme, scoped, {
          nodePath: d.nodePath,
          today: declaredTheme,
        });
        return id === undefined || id === themeId || id === theme.id ? undefined : id;
      }),
      seed: themeSeed,
      // `roads.wearIntensity`: how patched the carriageway reads.
      wearChance: fanOut<number>(STRUCTURE_ROWS.wearIntensity, rootIntent, {
        nodePath: rootPath,
        today: STREET_WEAR_CHANCE,
      }),
      // §2.4: a column a retaining wall holds is a *face*, not a bank, and
      // `blendShoulders` would smooth it into a ramp. Omitted entirely when no
      // quarter built one, so the surfacer's behaviour is untouched for every
      // document written before this phase.
      ...(retaining.wallColumns === 0 ? {} : { seam: retaining.seam }),
      ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
      // `decay.streetBreak` (§7.3): above `decline 0.8` a share of the
      // carriageway goes past worn to broken. Handed over only when there is
      // both a ruin field to cluster it on and a row asking for it, so every
      // document below the onset surfaces exactly the street it always did.
      ...(ruinField === undefined
        ? {}
        : (() => {
            const chance = fanOut<number>(STRUCTURE_ROWS.streetBreak, rootIntent, {
              nodePath: rootPath,
              today: 0,
            });
            return chance <= 0 ? {} : { breakUp: { chance, ruinField: ruinField.field } };
          })()),
    });
    lay("streets", streets.blocks);
    // F8's `LOAM-T237`. Absent — not empty — whenever no segment drifted, which
    // is every compile that was handed no datum.
    if (streets.diagnostics !== undefined) diagnostics.push(...streets.diagnostics);
    // §3.8b: one entry per surfaced segment, keyed by the surfacer's own source
    // id, so the sidewalk band takes its level from the very `ArcLevels` the
    // carriageway was graded to. A segment with no frame (a flight of steps, a
    // refused run) is simply absent, and the band falls back to the centre cell.
    const segmentArcs = new Map<string, SegmentArc>();
    for (const segment of streets.declaration.segments) {
      if (segment.frame === undefined || segment.levels === undefined) continue;
      // `ROAD_PULL`'s field rides along when it exists: the band blends at its
      // own column off the flanking station's pull, which is the same sentence
      // the carriageway's own level is.
      segmentArcs.set(segment.source, {
        frame: segment.frame,
        levels: segment.levels,
        ...(segment.pull === undefined ? {} : { pull: segment.pull }),
      });
    }
    // The F4 seam, filled: curbs, sidewalk paving, lamps, crossings and the
    // district's furniture. The kit is read off the contract itself — a
    // two-column sidewalk is the downtown band, one column is a village lane.
    // Columns the buildings pass already wrote (porch lamps and shutters jut
    // one cell into the apron, which on a build-to-line lot is the sidewalk)
    // are off limits to the dressing, whole-prop.
    const builtColumns = new Set<string>();
    for (const b of blocks) builtColumns.add(`${b.x},${b.z}`);
    for (const district of districts) {
      const dressed: StreetscapeResult = dressStreets(district.streets, {
        plan: input.plan,
        ground: input.ground,
        // §3.8b / inversion I6: the sidewalk's level is the flanking
        // carriageway's **arc-station** level, so the surfacer hands over the
        // frames and levels it graded rather than the pass reading `plan.ground`
        // at a centre cell a cross-section away.
        levels: segmentArcs,
        stack: input.stack,
        seed: nodeSeed(input.worldSeed, district.nodePath, ""),
        // `streetscape.kerbsideKit`: the band width proposes, the era disposes.
        // Today's kit is the pure width rule, so a document with no `era`
        // compiles byte-identically; a declared pre-modern era swaps the
        // downtown kit (bicycle racks, bollard rows) for the rustic one.
        furniture: fanOut<string>(STRUCTURE_ROWS.kerbsideKit, intentFor(intents, district.nodePath), {
          nodePath: district.nodePath,
          today: district.streets.sidewalk >= 2 ? "downtown" : "village",
        }) as FurnitureKit,
        palette: input.palette,
        nodePath: district.nodePath,
        // What there is to light. Street lighting scales with the buildings on
        // a quarter, not with the pavement the fabric spent on it — see
        // `LAMP_STREET_PER_BUILDING`.
        buildings: [...districtPaths].filter((p) => p.startsWith(`${district.nodePath}.`))
          .length,
        avoid: (x, z) => builtColumns.has(`${x},${z}`),
        // The surfacer's own answer to "where is the street". Without it this
        // pass re-derives the carriageway from the raster and gets a *different*
        // set on any diagonal street — and then re-levels the columns it wrongly
        // called sidewalk, undoing the levels the surfacer just committed to.
        // See `StreetscapeContext.surfaced`.
        surfaced: streets.road,
      });
      lay(`streetscape:${district.nodePath}`, dressed.blocks);
      streetFurniture += dressed.props.length;
      diagnostics.push(...dressed.diagnostics);
      // Under the freeze the props are not in `dressed` at all: they are sited
      // in the building half, against the frozen ground, by this closure.
      if (dressed.furnish !== undefined) streetFurnishings.push(dressed.furnish);
      // Kept for C3: the life pass needs the walk lane it must not touch and
      // the carriageway it parks against, and re-deriving either from the
      // graph would be the same rasterization with a second chance to differ.
      streetMasks.push({
        nodePath: district.nodePath,
        bounds: district.bounds,
        graph: district.streets,
        masks: dressed.masks,
        // § the empty-block law: the blocks this quarter elected and built
        // nothing on. Absent for every quarter that is not walled, so the life
        // pass sees exactly the input it saw before for a village.
        ...(district.dressed === undefined ? {} : { dressed: district.dressed }),
      });
    }
  }

  // --- roads ---------------------------------------------------------------
  // §4.9.6: `road.network@0` reserved its route corridor at substage 3b, and
  // `roadCorridor` is that reservation — but it is still not a *placed* node,
  // with no envelope, no yaw and no occupancy of its own before routing, so it
  // is found by walking the document rather than the solver's placement list.
  let roads: RoadNetworkResult | undefined;
  const roadNode = [...docNodes.values()].find((n) => n.generator === "road.network@0");
  if (roadNode !== undefined) {
    const nodePath = `${rootPath}.${roadNode.id}`;
    const seed: Seed256 = nodeSeed(input.worldSeed, nodePath, roadNode.seedSalt ?? "");
    // A landmark program named in `params.anchors` is a destination too: its
    // published `door` anchor becomes a synthetic approach port, so the router
    // reaches it through the same machinery it reaches a house's door through.
    // The author never writes a coordinate — that is the bespoke contract's
    // promise, and this is where the road half of it is kept.
    const landmarks = landmarkRoadAnchors({
      doc: input.doc,
      rootPath,
      worldSeed: input.worldSeed,
      plan: input.plan,
      placements,
      roadNodePath: nodePath,
      selectors: anchorSelectorsOf(roadNode.params),
      ...(input.programRotations === undefined ? {} : { rotations: input.programRotations }),
    });
    diagnostics.push(...landmarks.diagnostics);
    // Destinations *and* obstacles: a lane that cut through the shrine to reach
    // the next house would be a lane through the shrine.
    const roadObstacles = new Set([
      ...precinctAnchors(buildingPaths, precincts),
      ...landmarks.paths,
    ]);
    const roadDestinations = new Set([...roadObstacles].filter((p) => !districtPaths.has(p)));
    roads = buildRoadNetwork({
      nodePath,
      ground: input.ground,
      params: roadParamsOf(roadNode.params),
      seed,
      plan: input.plan,
      palette: input.palette,
      stack: input.stack,
      placements,
      // The precinct approach ports are appended, not merged: the road pass
      // reads a placement's ports by node path, and a precinct has no shell for
      // the generic resolver to hang a stub on, so the kit states its own.
      ports: [...input.ports, ...precinctPorts, ...landmarks.ports],
      buildingPaths: roadObstacles,
      // A district's own buildings are obstacles, never destinations — they are
      // already on a street; a precinct's landside anchor and a named landmark
      // ARE destinations. See `RoadNetworkInput.anchorPaths`.
      ...(districtPaths.size === 0 ? {} : { anchorPaths: roadDestinations }),
      ...(plazaPlacement === undefined ? {} : { plaza: plazaPlacement }),
      ...(plaza === undefined ? {} : { paved: plaza.paved, keepClear: plaza.keepClear }),
      ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
      ...(input.roadCorridor === undefined ? {} : { corridor: input.roadCorridor }),
    });
    diagnostics.push(...roads.diagnostics);
    lay("roads", roads.blocks);
  }

  /* --- ROAD_SOVEREIGN: the mask, taken the moment the road is whole --------- */
  //
  // Item 2 needs two things and this is the first moment both exist: **which
  // columns are road** (the street ribbon, the lane ribbon and both borders)
  // and **what the road's own top block is**. Every pass that could repaint a
  // road column runs after this line — the farms, the doorstep cuts, the ground
  // treatment, the life pass, the sweep — so the material is snapshotted here
  // and re-asserted at the very end, which is "stamp road surfaces last so they
  // win" stated as one array rather than as a build-order argument.
  //
  // Undefined while the flag is off: not one array is allocated and not one
  // column is walked.
  const sovereign = ((): { readonly mask: Uint8Array; readonly surface: Int32Array } | undefined => {
    if (!ROAD_SOVEREIGN) return undefined;
    const region = input.plan.region;
    const cells = region.width * region.depth;
    const mask = new Uint8Array(cells);
    const surface = new Int32Array(cells);
    // The ribbon first, at whatever the surfacers painted it: the wear mix, the
    // gutter dither, the centre dashes and the break-up are the road's own
    // material and this is the only copy of it.
    for (const layer of [streets?.road, roads?.roadColumns]) {
      if (layer === undefined) continue;
      for (let k = 0; k < cells; k++) {
        if (layer[k] !== 1 || mask[k] === 1) continue;
        mask[k] = 1;
        surface[k] = input.plan.surface[k] as number;
      }
    }
    // Then the border, at `stone_bricks` **by definition** rather than by
    // re-reading the plan: the sidewalk band is laid between the surfacer and
    // this line and covers exactly the columns the border does, so a snapshot
    // taken here would record the pavement that overwrote it. Item 4 says the
    // flanks of the ribbon are stone brick; this is that sentence, and the
    // ribbon's own claim above already won every column the two share (surface
    // beats border).
    const bricks = input.stack.blockByName("stone_bricks")?.stateId;
    if (bricks !== undefined) {
      for (const layer of [streets?.border, roads?.border]) {
        if (layer === undefined) continue;
        for (let k = 0; k < cells; k++) {
          if (layer[k] !== 1 || mask[k] === 1) continue;
          mask[k] = 1;
          surface[k] = bricks;
        }
      }
    }
    return { mask, surface };
  })();

  // **Tier C** (§6a.3): `sweep.run` — the furrow, the crop circle, the terrace
  // flight. After the streets and the roads, whose tier it shares, and before
  // the holdings: a scar outranks a field and yields to every built thing,
  // which is the disposition a gouge across a farm should have.
  declareInfraAt("C");

  // --- farms ---------------------------------------------------------------
  // `docs/FARM-PLAN-v0.md` §5.5: after the roads, the streets, the precincts
  // and the retaining, and before the grounds, the props and the life pass. A
  // holding seats its fields against the ground the lanes have already cut and
  // yields every column a built thing claimed, so it must not run until the
  // built things have run; and the grounds pass must not dress a field, so it
  // must not run before this one.
  //
  // WP-2 still emits no blocks: the pass seats each holding's yard, packs its
  // fields on gentle ground, and declares them as `farm.parcel` (rank 125) —
  // so the fields are level and their edges have transitions, and nothing is
  // sown on them until WP-3.
  const farmJobs: FarmJob[] = [];
  for (const placement of placements) {
    const node = byId.get(placement.nodePath);
    if (node?.generator === undefined || !isFarmGenerator(node.generator)) continue;
    // FARM-PLAN §10: the three fan-out rows, asked once per holding at the
    // holding's own scope, because `intent` is not legal on a leaf and a
    // holding's character is its region's. Each row's `today` is the value
    // §3.3 defaults to, so a document with no intent hands `farmSettings`
    // exactly the defaults it would have taken on its own.
    const scoped = intentFor(intents, placement.nodePath);
    const ctx = { nodePath: placement.nodePath };
    farmJobs.push({
      nodePath: placement.nodePath,
      placement,
      params: (docNodes.get(placement.nodePath)?.params ?? {}) as Record<string, unknown>,
      seed: node.seed,
      tags: node.tags,
      ports: node.ports as Readonly<Record<string, PortDeclaration>>,
      defaults: {
        edge: fanOut<FarmEdge>(FARM_ROWS.edgeKit, scoped, { ...ctx, today: FARM_TODAY.edge }),
        fallow: fanOut<number>(FARM_ROWS.fallowShare, scoped, { ...ctx, today: FARM_TODAY.fallow }),
        crops: fanOut<readonly string[]>(FARM_ROWS.cropList, scoped, {
          ...ctx,
          today: FARM_TODAY.crops,
        }),
      },
    });
  }
  const farms: FarmPassResult | undefined =
    farmJobs.length === 0
      ? undefined
      : buildFarms({
          jobs: farmJobs,
          ground: input.ground,
          plan: input.plan,
          // One copy of "what counts as soil", shared with the pass that dresses
          // it: two hand-kept copies would drift, and the drift would look like
          // a farm refusing perfectly good ground.
          soil: softSurfaceStates(input.palette, input.stack),
          // WP-3's emitter: the crop table is addressed through the pinned block
          // set, and the edge course and the dry-stone wall through the theme's
          // ground roles.
          palette: input.palette,
          stack: input.stack,
          ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
          // §4.1's second rung: with no road in the region, the gate faces the
          // nearest thing anybody built.
          buildings: placements
            .filter((p) => buildingPaths.has(p.nodePath))
            .map((p) => p.footprint),
        });
  if (farms !== undefined) diagnostics.push(...farms.diagnostics);
  lay("farms", farms?.blocks ?? []);

  // --- the farmstead (FARM-PLAN §7.2) --------------------------------------
  // A second call into the building pass, and the position is forced: a
  // farmstead stands on a yard, the yard is levelled by the farm pass, and the
  // farm pass cannot run until the lanes have cut (§5.5). A precinct solves the
  // same problem by running *before* the buildings and handing its specs into
  // the one job list; a holding cannot, so its buildings are built here from
  // the same `PrecinctBuildingSpec` shape, with their own material deal drawn
  // off the holding's own seed. A world with no farm makes no second call and
  // keeps `buildings.built` by reference, which is what the reach law needs.
  const farmsteadJobs: (BuildingJob & { materials: BuildingMaterials; theme: MaterialTheme })[] = [];
  const farmPorts: ResolvedPort[] = [];
  for (const spec of farms?.buildings ?? []) {
    const seed: Seed256 = nodeSeed(input.worldSeed, spec.nodePath, "");
    buildingPaths.add(spec.nodePath);
    farmsteadJobs.push({
      nodePath: spec.nodePath,
      placement: spec.placement,
      size: spec.size,
      params: { archetype: spec.archetype },
      ports: spec.ports,
      seed,
      tags: spec.tags,
      materials: assignMaterials(theme, 1, seed)[0] as BuildingMaterials,
      theme,
    });
    farmPorts.push(...resolvePorts(spec.placement, spec.size, spec.ports));
  }
  const farmsteads =
    farmsteadJobs.length === 0 ? undefined : buildBuildings(farmsteadJobs, input.plan, input.stack);
  if (farmsteads !== undefined) {
    diagnostics.push(...farmsteads.diagnostics);
    lay("farmsteads", farmsteads.blocks);
    for (const job of farmsteadJobs) jobTags.set(job.nodePath, job.tags);
    if (input.occupancy !== undefined) {
      for (const b of farmsteads.built) claimFootprint(input.occupancy, b);
    }
  }
  /**
   * Every building the world holds, the farmstead included.
   *
   * Identical to `buildings.built` **by reference** when there is no farmstead,
   * so every pass below this line is handed the same array it was handed before
   * this block existed.
   */
  const built: readonly BuiltBuilding[] =
    farmsteads === undefined ? buildings.built : [...buildings.built, ...farmsteads.built];

  // §9.3: the fields are claimed ground. The life pass and `prop.place@0` both
  // read the occupancy grid, and neither should be planting a bus shelter in
  // the wheat.
  if (farms !== undefined && input.occupancy !== undefined) {
    const tags = input.occupancy.byTag as Map<string, Uint8Array>;
    let tag = tags.get("farm");
    if (tag === undefined) {
      tag = new Uint8Array(input.occupancy.mask.length);
      tags.set("farm", tag);
    }
    for (let idx = 0; idx < tag.length; idx++) {
      if (farms.parcelMask[idx] === 1 || farms.yardMask[idx] === 1) {
        tag[idx] = 1;
        input.occupancy.mask[idx] = 1;
      }
    }
  }

  // --- props ---------------------------------------------------------------
  // After the roads, and that ordering is the point: a prop is placed against
  // the *finished* ground, and until the lanes have cut and their shoulders
  // have blended, the ground a cart stands on is not the ground the emitter
  // will lay. It is also after the buildings, whose footprints it is given as
  // reserved rectangles — a rowboat inside the granary is not a rowboat.
  //
  // Document order is load-bearing in exactly one direction: a `pier` placed
  // earlier is the anchor a later `at: "pier"` boat moors to.
  const propJobs: PropJob[] = [];
  // The precinct's props first, and in its own layout order: a pier has to be
  // placed before the hull that moors beside it, and both were sited by the kit
  // against the ground it graded a moment ago.
  for (const spec of farms?.props ?? []) {
    const seed: Seed256 = nodeSeed(input.worldSeed, spec.nodePath, "");
    propJobs.push({
      nodePath: spec.nodePath,
      prop: spec.prop,
      params: spec.params,
      seed,
      materials: assignMaterials(theme, 1, seed)[0] as BuildingMaterials,
    });
  }
  for (const spec of precincts?.props ?? []) {
    const seed: Seed256 = nodeSeed(input.worldSeed, spec.nodePath, "");
    propJobs.push({
      nodePath: spec.nodePath,
      prop: spec.prop,
      params: spec.params,
      seed,
      materials: assignMaterials(theme, 1, seed)[0] as BuildingMaterials,
    });
  }
  for (const child of input.doc.root.children) {
    if (!isPropNode(child)) continue;
    const nodePath = `${rootPath}.${child.id}`;
    const params = (child.params ?? {}) as Record<string, unknown>;
    const seed: Seed256 = nodeSeed(input.worldSeed, nodePath, child.seedSalt ?? "");
    // A prop never reaches the layout solver: `buildProps` sites it itself,
    // from its own `zone`/`at`/`jitter` params against the finished ground. A
    // constraint on a prop node therefore validates cleanly and then does
    // nothing at all — which is worse than rejecting it, because the author
    // reads a clean compile as agreement. Say so, and name the way out.
    const ignored = ignoredPropConstraints(child.constraints);
    if (ignored.length > 0) {
      diagnostics.push(
        warning(
          "CONSTRAINT_NOT_IMPLEMENTED",
          nodePath,
          `prop.place@0 does not go through the layout solver, so the ${ignored.length === 1 ? "constraint" : "constraints"} on this node ${ignored.length === 1 ? "is" : "are"} ignored: ${ignored.map((t) => `"${t}"`).join(", ")}`,
          'props take zone/at/jitter params — move the placement into "params", e.g. "params": { "zone": "north", "at": [0.4, 0.7], "jitter": 3 }',
        ),
      );
    }
    propJobs.push({
      nodePath,
      prop: typeof params["prop"] === "string" ? params["prop"] : "",
      params,
      seed,
      materials: assignMaterials(theme, 1, seed)[0] as BuildingMaterials,
    });
  }
  const props: PropPassResult =
    propJobs.length === 0
      ? {
          blocks: [] as StructureBlock[],
          placed: [] as PlacedProp[],
          diagnostics: [] as LoamDiagnostic[],
          padDeclarations: [],
        }
      : buildProps({
          jobs: propJobs,
          plan: input.plan,
          ground: input.ground,
          stack: input.stack,
          reserved: built.map((b) => b.footprint),
          // 8E, F1's prop client. Handed over on exactly the condition the
          // surfacer's `datums` is — at least one quarter graded one, which is
          // never while `FRONTAGE_TIE` is off — so a compile with no datum calls
          // `buildProps` with the identical argument object it always has.
          ...(districts.some((d) => d.datum !== undefined)
            ? { datums: districts.map((d) => d.datum) }
            : {}),
          ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
        });
  diagnostics.push(...props.diagnostics);
  lay("props", props.blocks);
  // §9a.1 rule 1: converted at WP-5 — `levelPropPad` commits its own `prop.pad`
  // claims as it lays each plinth, so there is nothing to record here.
  // The grammar's fluid claim, re-derived from what it actually emitted. It is
  // reported here as well as by the readback lint because a leak is cheapest
  // to attribute at the pass that caused it.
  const propFluids = checkPropFluidSafety(props.blocks, input.plan, input.stack);

  // --- the doorstep walk (§6a.10 i, finished at G6) ------------------------
  // The last tier-D declarer, and the last declaration there is. It runs here
  // rather than in the building half for one reason and it is the whole of
  // §1.6: `doorstep.landing` is tier D, and a tier-D claim arriving after the
  // fifth resolve is either silently inert or a sixth resolve. Its read is
  // `view("D")` — tiers A through C — which is exactly what §1.4 entitles a
  // tier-D declarer to, and every input it takes (the seated buildings, the
  // farm's own ports, the retaining pass's landings and bank mask) is a fact
  // the declaring half has already produced.
  //
  // `deferMaterials` is the other half: the walk decides here and the paint
  // lands at 5e, so a threshold's surface does not change places with another
  // material pass's. With the flag off this is `undefined` and the building
  // half runs the walk itself, unmoved.
  const doorsteps: DoorstepResult | undefined = !GROUND_V1_FREEZE
    ? undefined
    : buildDoorsteps({
        buildings: built,
        ports: farmPorts.length === 0 ? input.ports : [...input.ports, ...farmPorts],
        plan: input.plan,
        ground: input.ground,
        palette: input.palette,
        stack: input.stack,
        landings: retaining.landings,
        bank: retaining.bank,
        deferMaterials: true,
      });

  // === the WP-G5 seam ======================================================
  // Everything above declared; everything below builds. The cut is *here* and
  // not one line either side of it, because `prop.place@0` is the last pass
  // whose declaration and whose emission are still one act — `levelPropPad`
  // commits each plinth's `prop.pad` as it lays it — and the eleven passes
  // below are the ones that can be lifted whole without a statement changing
  // places with another. Nothing is recomputed across the seam: every field is
  // the object the declaring half already built. See {@link StructurePlan}.
  return {
    rootPath,
    diagnostics,
    blocks,
    blockSpans,
    lay,
    placementByPath,
    districts,
    cities,
    districtPaths,
    buildingPaths,
    precincts,
    planes,
    themeSeed,
    theme,
    themeForNode,
    intents,
    rootIntent,
    linework,
    infraSitings,
    deal,
    jobTags,
    built,
    ruinField,
    tunnelPass,
    plaza,
    retaining,
    courtyardPass,
    canals,
    sovereign,
    streets,
    streetMasks,
    streetFurniture,
    streetFurnishings,
    arterials,
    roads,
    farms,
    farmPorts,
    props,
    propJobs,
    propFluids,
    doorsteps,
  };
}

/**
 * **The building half** of the structure pass (§6/WP-G5).
 *
 * Called back-to-back with {@link declareStructures}, at the same pipeline
 * position the one old function occupied, over the plan it produced. The eleven
 * passes here are the tail: the two that still declare at WP-G5 and are lifted
 * at WP-G6 (`buildDoorsteps`, `buildJunctionSteps`, and `buildInfraEntries`'s
 * two level-writing entries), and the painters — `finishCutFaces`,
 * `finishSeams`, `buildGrounds`, `dressSetPieces`, `buildWalls`, `dressLife`,
 * `growGreenSkin` — which declare nothing at all and therefore have a **no-op
 * declare**: their absence from `declareStructures` *is* it.
 *
 * It reads exactly what it read before: the plan's ground arrays as the last
 * commit above left them, the emitted block list as far as the declaring half
 * filled it, and the occupancy grid every pass has been claiming into. The
 * driver's write-through survives one more stage for precisely this reason
 * (§6/WP-G5), so no snapshot is needed and none is taken.
 */
export function buildStructures(
  input: StructurePassInput,
  plan: StructurePlan,
): StructurePassResult {
  const {
    rootPath,
    diagnostics,
    blocks,
    blockSpans,
    lay,
    placementByPath,
    districts,
    cities,
    districtPaths,
    // `buildingPaths` is deliberately not taken: its readers — the street
    // surfacer and the road router — are still in the declaring half. It stays
    // on the plan for the WP-G6 move rather than being a field with no reader.
    precincts,
    sovereign,
    planes,
    themeSeed,
    theme,
    themeForNode,
    intents,
    rootIntent,
    linework,
    infraSitings,
    deal,
    jobTags,
    built,
    ruinField,
    tunnelPass,
    plaza,
    retaining,
    courtyardPass,
    streets,
    streetMasks,
    streetFurniture,
    streetFurnishings,
    arterials,
    roads,
    farms,
    farmPorts,
    props,
    propJobs,
    propFluids,
  } = plan;

  // --- the props, re-seated -------------------------------------------------
  // See {@link reseatProps}: `buildProps` had to run in the declaring half, and
  // the ground it read there was the pristine baseline. Off the staged path the
  // plan it read was already final, so this is a no-op by construction — every
  // `groundBase` recomputation returns the number it returned before.
  if (input.ground.staged) reseatProps(input.plan, props.blocks, props.placed);

  // --- the route lamps ------------------------------------------------------
  // The road pass's own "dead last" rule, re-stated for the freeze: a lamp
  // stands on the finished ground, and the finished ground exists from pass 5c.
  // See `plantLanterns`' call site. Absent off the staged path, where the pass
  // planted them itself.
  if (roads?.lanterns !== undefined) lay("road-lanterns", roads.lanterns());

  // --- the kerbside dressing ----------------------------------------------
  // **v1 §2's `masks.y` row, landed.** Every lamp post and every bench in the
  // settlement is sited here, past pass 5c, so the column it stands on is the
  // column the emitter will lay. `dressStreets` decided *where* the band is in
  // the declaring half — that is geometry, and it was always right; what it
  // could not know there is the level, because the only view §1.4 grants a
  // tier-C declarer is the one taken before the street family claimed anything.
  // Planting on that view is what left six lamps hanging over the hillside
  // village. Empty off the staged path, where the props are already in
  // `dressed.blocks`.
  let furnishedProps = 0;
  for (const furnish of plan.streetFurnishings) {
    const furnished = furnish();
    lay("streetscape:furniture", furnished.blocks);
    furnishedProps += furnished.props.length;
    diagnostics.push(...furnished.diagnostics);
  }

  // --- doorsteps -----------------------------------------------------------
  // Last, and it has to be: a doorstep reconciles a threshold with the ground
  // *outside* it, and until the roads have cut and the shoulders have blended,
  // that ground is not final.
  // The apron, a second time: the roads have cut and the shoulders have
  // blended, so the ground a porch lamp stands in is only now the ground the
  // emitter will lay. Adds nothing on a world with no roads.
  lay("aprons", underpinAprons(built, input.plan));

  // Decided in the declaring half under the freeze (§6a.10 i); the walk is here
  // only on the control path. Either way the paint and the masonry land here.
  const doorsteps =
    plan.doorsteps ??
    buildDoorsteps({
      buildings: built,
      // The farmstead's own doors, appended: a farmhouse whose door faces its own
      // field gets a flush threshold rather than a step into the crop (§5.4).
      ports: farmPorts.length === 0 ? input.ports : [...input.ports, ...farmPorts],
      plan: input.plan,
      ground: input.ground,
      palette: input.palette,
      stack: input.stack,
      // S10's two sources of truth, straight from the retaining pass: the ground
      // a served seam left walkable, and the ground a bank took.
      landings: retaining.landings,
      bank: retaining.bank,
    });
  paintDoorsteps(input.plan, doorsteps.materials);
  lay("doorsteps", doorsteps.blocks);

  // --- junction steps ------------------------------------------------------
  // Here, and not one line earlier, because this is the first point at which
  // *every* paved surface exists: the streets, the flights, the lanes, the
  // plaza and — the one that actually causes a third of the cuts — the
  // doorsteps, which raise a column of a lane they do not own. A pass that
  // reconciles seams cannot run before the surface that makes the seam.
  // See `structures/junction-steps.ts` for the three mechanisms it treats.
  const pavedSurfaces: PavedSurface[] = [];
  for (const segment of streets?.declaration.segments ?? []) {
    pavedSurfaces.push({
      kind: segment.role === "steps" ? "steps" : "street",
      sourceClass: "street.network",
      columns: segment.columns.map((c) => c.idx),
    });
  }
  for (const route of roads?.declaration.routes ?? []) {
    pavedSurfaces.push({
      kind: "road",
      sourceClass: "road.network",
      columns: route.columns.map((c) => c.idx),
    });
  }
  if (plaza !== undefined) {
    pavedSurfaces.push({
      kind: "plaza",
      sourceClass: "plaza.ground",
      columns: setColumns(plaza.paved),
    });
  }
  pavedSurfaces.push({
    kind: "doorstep",
    sourceClass: "doorstep.landing",
    columns: setColumns(doorsteps.touched),
  });
  // Gated to multi-level ground (Kai's standing discipline, 2026-08-07): on
  // the hillside fixtures the reconciliation is strictly beneficial and
  // undressedCutoffs reaches 0, but flat towns were never clean — running it
  // on c1-harbourtown lifts 1,036 columns and regresses unservedFaces 18→29.
  // A flat world therefore keeps byte-identity (and its pre-existing cutoffs)
  // until Kai decides the global enable with those numbers in front of him.
  //
  // **Deleted on the freeze path** — v1 §4 item 7. The pass exists to reconcile
  // two paved claims that disagree about a column; under one resolve they
  // cannot disagree, because the higher-ranked claim owns the column outright
  // and the loser's report row records the loss. It is also the last pass that
  // declares a tier-C class (`street.network`/`road.network`) from the build
  // half, which is a tier-order violation by construction rather than by
  // accident: there is no legal position for it after the seal. With the flag
  // off every line of it survives untouched, which is what the byte-identity
  // control set pins.
  //
  // `ROAD_SOVEREIGN` names it too (item 3) even though the freeze already
  // reaches it first: this pass is the definition of "a pass that exists only
  // to reconcile stairs with something else", and the flag should not depend on
  // another flag's value to be true about it.
  if (!GROUND_V1_FREEZE && !ROAD_SOVEREIGN && districts.some((d) => (d.levels?.levelY.length ?? 0) > 1)) {
    const junctions = buildJunctionSteps({
      region: input.plan.region,
      plan: input.plan,
      stack: input.stack,
      palette: input.palette,
      paved: pavedSurfaces,
      // WP-G2: required, not spread-if-present. `StructurePassInput.ground` is
      // non-optional, so the old conditional was vestigial — and it was the
      // only thing that made the pass's `plan.ground` write look reachable from
      // here.
      ground: input.ground,
      blocks,
    });
    lay("junction-steps", junctions.blocks);
  }


  // --- the cut-face finish -------------------------------------------------
  // The other half of the retaining pass, and it runs *here* rather than up
  // there with the walls. Walked (the hillside prototype, 2026-08-06): a street
  // ending at a sheer drop showed a band of raw dirt mid-face, under the
  // coping. The walls were built before the streets were surfaced — they have
  // to be — but `dressStreetStairs` drops every tread to `level − 1`, the road
  // pass cuts its lanes, the props level their plinths and `buildDoorsteps`
  // cuts a landing at every threshold, and each of those exposes a face the
  // finish never saw. An unseen face is the terrain's soil band, which is dirt.
  //
  // Materials only — `subsurface` and `soil`, never a level and never a
  // surface — so under the ground contract this is free to sit anywhere its
  // inputs allow (materials are last-write-wins; the contract protects levels).
  // Its input is the finished ground, which is only finished here.
  const cutFaces = finishCutFaces({
    districts,
    // R4's "the hill's own rock for everything taller", for a plane's cut edge
    // as much as for a quarter's.
    ...(planes.length === 0 ? {} : { planes }),
    plan: input.plan,
    palette: input.palette,
    stack: input.stack,
    footprints: built.map((b) => b.footprint),
    // The wall masonry stays the wall's: a seam column is deepened, not
    // repainted in rock.
    seam: retaining.seam,
  });
  diagnostics.push(...cutFaces.diagnostics);

  // --- the face finish -----------------------------------------------------
  // Kai's n3 walk, S7 and S8: the faces `finishCutFaces` does *not* reach still
  // read as exposed geology — a bank shoulder, a pad edge cut beside a street
  // the quarter never claimed, the dirt underbelly of a sidewalk graded flush
  // over ground that fell away behind it. `finishCutFaces` asks "did this
  // quarter declare a cut here"; this asks the question the walker asks, which
  // is "is there a face here and does the town own either side of it".
  //
  // Materials only, exactly as above, and one pass later so that every column
  // the declared finish already dressed is dressed before this one measures.
  // Off by default: `FACE_FINISH`.
  if (FACE_FINISH) {
    const faceCells = input.plan.region.width * input.plan.region.depth;
    /** Paved: a walking or driving surface. Also owned, by construction. */
    const facePaved = new Uint8Array(faceCells);
    /** Owned: paved, plus every lot ground a quarter or a plane decided. */
    const faceOwned = new Uint8Array(faceCells);
    for (const surface of pavedSurfaces) {
      for (const idx of surface.columns) {
        if (idx < 0 || idx >= faceCells) continue;
        facePaved[idx] = 1;
        faceOwned[idx] = 1;
      }
    }
    for (const district of streetMasks) {
      for (let idx = 0; idx < faceCells; idx++) {
        if (district.masks.carriageway[idx] !== 1 && district.masks.sidewalk[idx] !== 1) continue;
        facePaved[idx] = 1;
        faceOwned[idx] = 1;
      }
    }
    for (const district of districts) {
      const levels = district.levels;
      if (levels === undefined) continue;
      const b = levels.bounds;
      for (let z = b.z0; z <= b.z1; z++) {
        for (let x = b.x0; x <= b.x1; x++) {
          if (!inside(input.plan.region, x, z)) continue;
          if (levels.at(x, z) === NO_PLATFORM) continue;
          faceOwned[index(input.plan.region, x, z)] = 1;
        }
      }
    }
    for (const plane of planes) {
      for (const claim of plane.columns) {
        if (claim.idx < 0 || claim.idx >= faceCells) continue;
        faceOwned[claim.idx] = 1;
      }
    }
    const faces = finishFaces({
      plan: input.plan,
      palette: input.palette,
      stack: input.stack,
      owned: faceOwned,
      paved: facePaved,
      seam: retaining.seam,
      // A graded bank is earth on purpose; facing it would undo the grading.
      bank: retaining.bank,
      footprints: built.map((b) => b.footprint),
      nodePath: rootPath,
    });
    diagnostics.push(...faces.diagnostics);
  }

  // --- the terminal transition consumer (WP-G4) ----------------------------
  // `docs/GROUND-CONTRACT-v1.md` §3.3, §6/WP-G4. **Derives and reports; builds
  // nothing**, because `GROUND_V1_SEAMS` is off and building is the flag-on
  // half. Here, immediately after the cut-face finish it will absorb, and after
  // every pass that declares: `input.ground.finish()` is the finished field, so
  // §3.2's coverage invariant is being asked of the thing it is a statement
  // about. It runs on every settlement compile regardless of the flag — that is
  // the point of the stage: the counts are a golden before a block moves.
  const seamStage = finishSeams({
    plan: input.plan,
    ground: input.ground,
    footprints: built.map((b) => b.footprint),
    // The only built-set any pass publishes at HEAD (§3.3's refusal column is
    // WP-G5's work), and what the `wouldBuild` count is measured against.
    seam: retaining.seam,
    nodePath: rootPath,
    // The flag-on half's masonry: with `GROUND_V1_SEAMS` off none of the three
    // is read, and the pass builds nothing.
    palette: input.palette,
    stack: input.stack,
    blocks: [],
    // §3.4: `LOAM-W413` is aggregated **per quarter**, and the quarter a run
    // belongs to is the one whose bounds hold it.
    quarters: districts.map((d) => ({ nodePath: d.nodePath, bounds: d.bounds })),
  });
  diagnostics.push(...seamStage.diagnostics);
  if (seamStage.blocks.length > 0) lay("seam-finish", seamStage.blocks);

  // --- ground treatment (F2) -----------------------------------------------
  // Dead last, and that is the whole design: every other pass has by now
  // declared the ground it owns — roads, plaza, doorsteps, footprints, props —
  // so this one can treat what is left without ever having to guess.
  const grounds = buildGrounds({
    buildings: built,
    plan: input.plan,
    palette: input.palette,
    stack: input.stack,
    seed: seed32(streamSeed(themeSeed, "grounds")),
    ...(roads === undefined ? {} : { roadColumns: roads.roadColumns }),
    ...(plaza === undefined ? {} : { paved: plaza.paved, keepClear: plaza.keepClear }),
    doorstepColumns: doorsteps.touched,
    // `decay.coverage` and `decay.vegetationReclaim`: how worn and how grown
    // over the settlement's open ground is.
    decayCoverage: fanOut<number>(STRUCTURE_ROWS.decayCoverage, rootIntent, {
      nodePath: rootPath,
      today: 0,
    }),
    vegetationReclaim: fanOut<number>(STRUCTURE_ROWS.vegetationReclaim, rootIntent, {
      nodePath: rootPath,
      today: 0,
    }),
    ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
    // §9.2: `grounds.ts` must not dress a parcel, and the wear sweep must not
    // reach into one either — a worn path across a sown field is a defect, not
    // decay. The **yard** is deliberately absent from this mask: it is the one
    // exception, and it takes the existing `yard` treatment.
    ...(farms === undefined ? {} : { farmColumns: farms.parcelMask }),
    // §7.2 and §7.3: the ruin field chooses `ruin_yard` and lifts the wear
    // sweep locally; the broken mask is where the volunteer green goes.
    ...(ruinField === undefined ? {} : { ruinField: ruinField.field }),
    ...(streets?.broken === undefined ? {} : { brokenStreet: streets.broken }),
  });
  lay("grounds", grounds.blocks);


  // --- the set pieces (C4) -------------------------------------------------
  // After the ground treatment and before the life pass, and both halves are
  // load-bearing. After F2, because a parapet, a stair tread and a monument
  // plinth all stand on the *finished* ground. Before C3, because the life
  // pass is contractually last and is handed the emitted block list — run this
  // after it and a bridge pylon would be free to grow through an awning C3 had
  // already proved the support for.
  const setPieceCities = cities
    .filter((c) => c.setPieces.length > 0)
    .map((c) => ({ nodePath: c.nodePath, setPieces: c.setPieces }));
  const setPieces =
    setPieceCities.length === 0
      ? undefined
      : dressSetPieces({
          plan: input.plan,
          stack: input.stack,
          seed: themeSeed,
          nodePath: rootPath,
          cities: setPieceCities,
          existing: blocks,
          // Where a player already walks. The hillside stair reads this and
          // nothing else does: a flight has to *land* on the city at both
          // ends or it is a folly on a slope. Roads, streets and arterials,
          // the plaza's paving, and any building's own footprint all count.
          connects: (x: number, z: number): boolean => {
            const region = input.plan.region;
            if (!inside(region, x, z)) return false;
            const at = index(region, x, z);
            if (roads !== undefined && (roads as RoadNetworkResult).roadColumns[at] === 1) return true;
            if (streets !== undefined && (streets as StreetSurfaceResult).road[at] === 1) return true;
            if (plaza !== undefined && plaza.paved[at] === 1) return true;
            return built.some(
              (b) =>
                x >= b.footprint.x0 && x <= b.footprint.x1 && z >= b.footprint.z0 && z <= b.footprint.z1,
            );
          },
          ...(roads === undefined
            ? {}
            : {
                avoid: (x: number, z: number): boolean => {
                  const region = input.plan.region;
                  if (!inside(region, x, z)) return false;
                  return (roads as RoadNetworkResult).roadColumns[index(region, x, z)] === 1;
                },
              }),
        });
  if (setPieces !== undefined) {
    diagnostics.push(...setPieces.diagnostics);
    lay("setpieces", setPieces.blocks);
  }

  // --- the wall (`infra.wall@0`) -------------------------------------------
  // After the set pieces and before the life pass, and for both of the reasons
  // the set pieces run where they do: a curtain wall stands on the *finished*
  // ground, and C3 is contractually last with the emitted block list in hand.
  // It also has to be after the roads and the streets, because a gate is not
  // sited — it is *found*, where a carriageway already crosses the derived
  // course, and until the surfacing has run there is no carriageway to find.
  // Two sources, one job list. `params.walls` is the author speaking directly
  // and is read exactly as it always was; `intent.character.fortification` is
  // the dial, and it only speaks where the parameters are silent — see
  // `structures/walls-intent.ts` for why the wall had to become a dial at all.
  // The settlement's paved ground, as one predicate. Both wall paths read it to
  // find the *fabric's* edge rather than the reservation's: a quarter's blocks
  // pack to their own footprint inside the rectangle the solver gave them, and
  // a circuit drawn round the rectangle is the lawn Kai walked in Troy.
  const wallField: FabricField = {
    region: input.plan.region,
    paved: (x: number, z: number): boolean => {
      const region = input.plan.region;
      if (!inside(region, x, z)) return false;
      const at = index(region, x, z);
      if (roads !== undefined && (roads as RoadNetworkResult).roadColumns[at] === 1) return true;
      if (streets !== undefined && (streets as StreetSurfaceResult).road[at] === 1) return true;
      return plaza !== undefined && plaza.paved[at] === 1;
    },
  };
  const authoredWallJobs = wallJobsOf(
    input.doc,
    rootPath,
    built,
    (p) => placementByPath.get(p)?.footprint,
    // The quarter's own theme where it named one, the settlement's otherwise:
    // an authored wall is built from the stone of the town it rings, exactly as
    // the fortification dial's is. `themeForNode` is the same resolver the
    // buildings inside that quarter were dealt from.
    (p) => themeForNode(p),
    wallField,
  );
  const fortification = fortificationJobs({
    rootPath,
    intents,
    theme,
    authored: authoredWallJobs,
    fabric: fabricNodesOf(input.doc, rootPath, built, (p) => placementByPath.get(p)?.footprint),
    field: wallField,
  });
  diagnostics.push(...fortification.diagnostics);
  const wallJobs = fortification.jobs;
  const wallPass =
    wallJobs.length === 0
      ? undefined
      : buildWalls({
          plan: input.plan,
          stack: input.stack,
          jobs: wallJobs,
          existing: blocks,
          onRoad: (x: number, z: number): boolean => {
            const region = input.plan.region;
            if (!inside(region, x, z)) return false;
            const at = index(region, x, z);
            if (roads !== undefined && (roads as RoadNetworkResult).roadColumns[at] === 1) return true;
            return streets !== undefined && (streets as StreetSurfaceResult).road[at] === 1;
          },
          // S11 — *measured, not moved*. The quarters' own `GroundLevels`,
          // stitched into one field: each district's platform indices are
          // shifted into a private band so two quarters' platform 0 can never
          // read as the same ground, and natural ground is −1 everywhere. A
          // circuit that never crosses a level change reports nothing, which is
          // every world without platforms.
          platformAt: (x: number, z: number): number => {
            let band = 0;
            for (const d of districts) {
              band += 1024;
              if (d.levels === undefined) continue;
              const p = d.levels.at(x, z);
              if (p >= 0) return band + p;
            }
            return -1;
          },
        });
  if (wallPass !== undefined) {
    diagnostics.push(...wallPass.diagnostics);
    lay("walls", wallPass.blocks);
  }

  // --- the infrastructure entries (`infra.entry@0`) ------------------------
  // In the wall's slot, and beside it rather than inside it
  // (`docs/INFRA-ENTRIES-v0.md` §3.8). The position is not a convenience: it is
  // the only point at which the carriageway a crossing is found against is
  // finished, and it is where the one shipped entry already runs. Area
  // treatments run here too, after everything that could move the ground under
  // them. Family B's entries do NOT run here — they run inside
  // `buildRetainingWalls`, where they always did.
  //
  // The wall runs first of the two so an entry meets a finished circuit: a
  // cordon that would cross a curtain wall loses those columns to the wall's,
  // which is the right answer — the wall is the fence there.
  const infraOnRoad = (x: number, z: number): boolean => {
    const region = input.plan.region;
    if (!inside(region, x, z)) return false;
    const at = index(region, x, z);
    if (roads !== undefined && (roads as RoadNetworkResult).roadColumns[at] === 1) return true;
    return streets !== undefined && (streets as StreetSurfaceResult).road[at] === 1;
  };
  const infraJobs = infraEntryJobsOf(
    input.doc,
    rootPath,
    input.worldSeed,
    (p) => themeForNode(p),
  );
  const infraPass =
    infraJobs.length === 0
      ? undefined
      : buildInfraEntries({
          plan: input.plan,
          stack: input.stack,
          jobs: infraJobs,
          existing: blocks,
          // W1: the pipeline's one driver, for the two entries whose levels are
          // the entry (`crash_furrow` cuts below the ground, `crop_circle`
          // flattens it). Every other entry declares nothing and never reaches
          // it — handing it over costs a document with no such entry exactly
          // nothing, because the pass is not constructed at all.
          ground: input.ground,
          // §13.2a rule 9's handoff — declare early, build late. The levels went
          // in at rank 25 in the linework slot; these are the columns they went
          // in on, so the materials can be laid here, on the resolver's answer.
          ...(linework === undefined ? {} : { lineworkBeds: linework.beds }),
          // §6a.3's hand-off. Empty with the flag off, so every row below is
          // sited from the finished world exactly as it always was; flag on it
          // carries every *declaring* row's course, openings, gates and water
          // plan, and this pass re-derives nothing on them.
          ...(infraSitings.size === 0 ? {} : { sitings: infraSitings }),
          view: {
            bounds: {
              x0: input.plan.region.x0,
              z0: input.plan.region.z0,
              width: input.plan.region.width,
              depth: input.plan.region.depth,
            },
            // The **fabric's** hull, exactly as the wall's own course reads it:
            // a ring round a holding is drawn outside what the holding built,
            // not outside the rectangle the solver reserved for it.
            extentOf: (id: string) => {
              const nodePath = `${rootPath}.${id}`;
              const own = placementByPath.get(nodePath)?.footprint;
              const prefix = `${nodePath}.`;
              // W1: **a holding's fabric is its fields.** A farm's buildings
              // are a farmstead in one corner of it, so a cordon hulled off
              // them alone would ring the barn and leave the crop outside —
              // which is the opposite of the ratified read (the fence and
              // whatever is in the fields belong in one frame). The parcel
              // mask F17 publishes is the holding's real extent, and it is
              // core fabric here rather than a clipping window for the same
              // reason a building is.
              const fields =
                farms !== undefined && farms.nodePaths.includes(nodePath)
                  ? maskRect(farms.parcelMask, input.plan.region)
                  : undefined;
              const extent = fabricExtent({
                clip: own === undefined ? [] : [own],
                buildings: [
                  ...built
                    .filter((b) => b.nodePath === nodePath || b.nodePath.startsWith(prefix))
                    .map((b) => b.footprint),
                  ...(fields === undefined ? [] : [fields]),
                ],
                margin: 0,
                field: wallField,
              });
              return extent.length === 0 ? undefined : extent;
            },
            // A corridor is a *road route* — the only linework the compiler
            // publishes as a polyline with a name on it. A street segment has
            // no author-visible id, which is the honest reason `along` binds to
            // roads first: an author can only name what they wrote.
            corridorOf: (id: string) => {
              const route = (roads as RoadNetworkResult | undefined)?.routes.find(
                (r) => r.from === id || r.to === id,
              );
              if (route !== undefined) return route.path.map((p) => ({ x: p.x, z: p.z }));
              // W1: **a settlement's own high street is a corridor too.**
              // `road.network@0`'s `routes` are the lanes that arrive from
              // outside, and a great many worlds have none — a city's own
              // streets are routed by the connective pass, which is exactly
              // what `LOAM-T208` says. Binding `across`/`along` to the arriving
              // lanes alone left `barricade_line` unreachable in every world
              // whose roads are internal, so a named district or city also
              // resolves to **its widest street**: the road a stranger would
              // call the high street, chosen by a stated total order (greatest
              // width, then the lowest segment id) so two compiles barricade
              // the same one.
              const nodePath = `${rootPath}.${id}`;
              const prefix = `${nodePath}.`;
              let best: { width: number; segId: string; path: readonly { x: number; z: number }[] } | undefined;
              for (const district of districts) {
                if (district.nodePath !== nodePath && !district.nodePath.startsWith(prefix)) continue;
                for (const segment of district.streets.segments) {
                  if (segment.path.length < 2) continue;
                  if (
                    best === undefined ||
                    segment.width > best.width ||
                    (segment.width === best.width && segment.id < best.segId)
                  ) {
                    best = { width: segment.width, segId: segment.id, path: segment.path };
                  }
                }
              }
              return best === undefined ? undefined : best.path.map((p) => ({ x: p.x, z: p.z }));
            },
            // F17's published parcel mask, per §3.2's `over`. A holding names
            // its own mask; nothing else publishes one yet.
            maskOf: (id: string) => {
              const nodePath = `${rootPath}.${id}`;
              if (farms === undefined) return undefined;
              return farms.nodePaths.includes(nodePath) ? farms.parcelMask : undefined;
            },
            ground: (x: number, z: number) =>
              inside(input.plan.region, x, z) ? input.plan.ground[index(input.plan.region, x, z)] : undefined,
            onRoad: infraOnRoad,
          },
        });
  if (infraPass !== undefined) {
    diagnostics.push(...infraPass.diagnostics);
    lay("infra_entries", infraPass.blocks);
  }

  // --- the life pass (C3) --------------------------------------------------
  // After *everything*, including the ground treatment, and that is the whole
  // contract: this stage adds eye-level incident into columns nobody else
  // claimed, so "nobody else claimed" has to be a finished fact rather than a
  // prediction. It is handed the emitted block list rather than a summary,
  // because a recipe that brackets an awning to a wall has to be able to ask
  // whether that particular wall is a full cube at that particular height.
  const life = dressLife({
    plan: input.plan,
    stack: input.stack,
    seed: themeSeed,
    nodePath: rootPath,
    // **A ruin is not dressed** (RUINS-PLAN-v0 WP-3). The life pass hangs
    // awnings, signs, planters and interior lanterns off a building's walls,
    // and it runs long after the decay has taken those walls away — the first
    // district sweep left nine awning slabs and stairs floating in the street
    // over shells that had crumbled under them (`floating.slab`,
    // `floating.stair`). A decayed shell is therefore withheld from the pass
    // outright, which is also the right read: an abandoned house has no awning
    // over its shopfront and no lamp lit in its front room. Absent on every
    // building in a world that never says `decline`, so nothing else moves.
    buildings: built
      .filter((b) => b.meta.decay === undefined)
      .map((b) => lifeBuildingOf(b, jobTags.get(b.nodePath) ?? [])),
    districts: streetMasks,
    existing: blocks,
    // `props.family`: the prop the pavement furniture draw reaches for first.
    ...((): { propFamily?: string } => {
      const family = fanOut<string | undefined>(STRUCTURE_ROWS.propFamily, rootIntent, {
        nodePath: rootPath,
        today: undefined,
      });
      return family === undefined ? {} : { propFamily: family };
    })(),
    // `life.modernFittings`: may the street carry AC units, hydrants, phone
    // boxes, dumpsters and parked cars? True is today's behaviour, so a
    // document with no `era` compiles byte-identically.
    modernFittings: fanOut<boolean>(STRUCTURE_ROWS.modernFittings, rootIntent, {
      nodePath: rootPath,
      today: true,
    }),
    ...(roads === undefined
      ? {}
      : {
          avoid: (x: number, z: number): boolean => {
            const region = input.plan.region;
            if (!inside(region, x, z)) return false;
            return (roads as RoadNetworkResult).roadColumns[index(region, x, z)] === 1;
          },
        }),
  });
  diagnostics.push(...life.diagnostics);
  lay("life", life.blocks);

  // --- the green skin (RUINS-PLAN-v0-WP6 §3.1) -----------------------------
  // The last structure pass, and there is no other legal slot: it must see the
  // ruin field (built right after `buildBuildings`), the *finished* ground (a
  // substitution on a column the ground pass is about to repaint never
  // happened), and every built surface — the streetscape's kerbs and the life
  // pass's awnings are among the last blocks laid.
  //
  // WP-6a writes **no blocks**: this call builds the surface index, proves the
  // reach law structurally, and returns an empty list and an empty `colonized`
  // mask. Guarded on the field as well as returning early on it, so a world
  // that ruins nothing does not even walk the laid list.
  const greenSkin =
    ruinField === undefined
      ? undefined
      : growGreenSkin({
          plan: input.plan,
          palette: input.palette,
          stack: input.stack,
          seed: seed32(streamSeed(themeSeed, "green-skin")),
          ruinField,
          laid: blocks,
          districts,
          buildings: built,
          doorstepColumns: doorsteps.touched,
          // §4.6, THE GREEN RULE: the species the place already grows, resolved
          // once per settlement and only when there is a field to write on — a
          // world that ruins nothing must not even emit `LOAM-W514`.
          flora: (() => {
            const resolved = resolveReclaimSpecies(input.doc, input.plan.region);
            diagnostics.push(...resolved.diagnostics);
            return resolved.species;
          })(),
          ...(grounds.ruinYardColumns === undefined
            ? {}
            : { ruinYardColumns: grounds.ruinYardColumns }),
        });
  if (greenSkin !== undefined) {
    diagnostics.push(...greenSkin.diagnostics);
    lay("green-skin", greenSkin.blocks);
  }

  /* --- ROAD_SOVEREIGN: nothing writes over a road ---------------------------- */
  //
  // Item 2, and it is deliberately the **last** thing the structure half does,
  // because "no other writer's block may occupy a road-surface position" is a
  // statement about the finished build and not about any one pass. Two moves,
  // in this order:
  //
  // 1. **The surface is the road's again.** Every road and border column takes
  //    back the material the surfacer gave it (item 4's `stone_bricks` for the
  //    flanks), undoing anything the doorstep cuts, the ground treatment, the
  //    life pass or the sweep repainted on it. The *level* is untouched: the
  //    road is draped on the resolved ground and the resolved ground is what
  //    the emitter will lay it at.
  // 2. **The headroom is cleared.** A block at the road's own surface position,
  //    or in the three blocks above it, is dropped — a road column keeps its
  //    surface and a walker's clearance, which is what stops a retaining course
  //    or a wall sweep crossing a road from severing it. Three, because that is
  //    a player plus the block they can step onto.
  //
  // The road family is exempt from its own clear — see
  // {@link ROAD_SOVEREIGN_OWN_EMITTERS}. Its blocks *are* the road: a bridge
  // deck, its rails, its piers, and the lamps and benches the freeze defers
  // past pass 5c so they stand on the frozen ground. A bridge is the one
  // structure that may legitimately stand above a road column, which is exactly
  // why item 2 admits it by name.
  if (sovereign !== undefined) {
    enforceRoadSovereignty(input.plan, sovereign, blocks, blockSpans);
  }

  return {
    blocks,
    blockSpans,
    doorsteps,
    buildings: built,
    tunnels: tunnelPass.tunnels,
    walls: wallPass?.walls ?? [],
    props: props.placed,
    grounds,
    ...(courtyardPass.courtyards.length === 0 ? {} : { courtyards: courtyardPass }),
    ...(precincts === undefined ? {} : { precincts }),
    ...(farms === undefined ? {} : { farms }),
    ...(ruinField === undefined ? {} : { ruinField }),
    ...(greenSkin === undefined ? {} : { greenSkin }),
    districts,
    ...(plaza === undefined ? {} : { plaza }),
    ...(roads === undefined ? {} : { roads }),
    ...(streets === undefined ? {} : { streets }),
    diagnostics,
    stats: {
      theme: theme.id,
      distinctMaterials: new Set(deal.map((m) => materialKey(m))).size,
      buildingCount: built.length,
      buildingBlocks: built.reduce((sum, b) => sum + b.blockCount, 0),
      roadRoutes: roads?.routes.length ?? 0,
      roadColumns: roads?.surfacedColumns ?? 0,
      roadBridgeColumns: roads?.bridgeColumns ?? 0,
      unroutedAnchors: roads?.unrouted.length ?? 0,
      plazaColumns: plaza?.pavedColumns ?? 0,
      plazaBenches: plaza?.benches ?? 0,
      plazaWell: plaza?.well ?? false,
      doorstepsStepped: doorsteps.stepped,
      doorstepsDropped: doorsteps.dropped,
      doorstepsRefused: doorsteps.refused,
      cellars: built.filter((b) => b.basementDepth > 0).length,
      tunnels: tunnelPass.tunnels.length,
      tunnelCarvedBlocks: tunnelPass.tunnels.reduce((sum, t) => sum + t.carvedBlocks, 0),
      tunnelLength: tunnelPass.tunnels.reduce((sum, t) => sum + t.path.length, 0),
      tunnelStairSteps: tunnelPass.tunnels.reduce((sum, t) => sum + t.stairSteps, 0),
      tunnelLanterns: tunnelPass.tunnels.reduce((sum, t) => sum + t.lanterns, 0),
      tunnelJunctions: tunnelPass.tunnels.reduce((sum, t) => sum + t.junctions.length, 0),
      districts: districts.length,
      districtBuildings: districtPaths.size,
      streetColumns: streets?.surfacedColumns ?? 0,
      cities: cities.length,
      arterials: arterials.length,
      arterialColumns: streets?.arterialColumns ?? 0,
      arterialBridgeColumns: streets?.bridgeColumns ?? 0,
      props: props.placed.length,
      propsUnplaced: propJobs.length - props.placed.length,
      propWaterLeaks: propFluids.leaks.length,
      // The declaring half's own count plus whatever the deferred kerbside
      // dressing laid: one number, wherever the props were actually sited.
      streetFurniture: streetFurniture + furnishedProps,
      dressedColumns: grounds.dressedColumns,
      wornColumns: grounds.wornColumns,
      ruinYards: grounds.ruinYards,
      ruinFieldColumns: ruinField?.columns ?? 0,
      greenSkinColumns: greenSkin?.counts.indexedColumns ?? 0,
      greenSkinBlocks: greenSkin?.blocks.length ?? 0,
      brokenStreetColumns: countMask(streets?.broken),
      streetReclaimBlocks: grounds.streetReclaim,
      airports: precincts?.stats.airports ?? 0,
      harbours: precincts?.stats.harbours ?? 0,
      holdings: farms?.stats.holdings ?? 0,
      farmParcels: farms?.stats.farmParcels ?? 0,
      farmColumns: farms?.stats.farmColumns ?? 0,
      standsCut: precincts?.stats.stands ?? 0,
      aircraftParked: precincts?.stats.aircraft ?? 0,
      piersBuilt: precincts?.stats.piers ?? 0,
      shipsMoored: precincts?.stats.ships ?? 0,
      ...(setPieces?.stats ?? {}),
      ...(wallPass?.stats ?? {}),
      ...(infraPass?.stats ?? {}),
      ...life.stats,
    },
  };
}

/**
 * `ROAD_SOVEREIGN` item 2 — **nothing writes over a road**, enforced once, last.
 *
 * Exported so the law can be tested as the sentence it is rather than through a
 * whole compile: hand it a plan, a road mask with the material the road must
 * end up wearing, and the emitted block list with its attribution spans, and
 * afterwards every masked column's top block is road material with three clear
 * blocks above it.
 *
 * Two moves, in this order.
 *
 * 1. **The surface is the road's again.** Every masked column takes back the
 *    material the surfacer gave it — the carriageway's own wear mix, or item
 *    4's `stone_bricks` on the flanks — undoing whatever the doorstep cuts, the
 *    ground treatment, the life pass or the sweep repainted on it. The *level*
 *    is never touched: the road is draped on the resolved ground and the
 *    resolved ground is where the emitter will lay it.
 * 2. **The headroom is cleared.** A foreign block standing in the road's own
 *    surface position, or in the {@link ROAD_SOVEREIGN_HEADROOM} blocks above
 *    it, is dropped. That is what stops a retaining course or a wall sweep
 *    crossing a road from severing it, and it is stated as a band rather than
 *    as a single block precisely so the severing case — a course *above* the
 *    pavement — is caught along with the colliding one.
 *
 * The road family is exempt from its own clear — {@link
 * ROAD_SOVEREIGN_OWN_EMITTERS}. Its blocks **are** the road: a bridge deck, its
 * rails, its piers, and the route lamps and kerbside dressing the freeze defers
 * past pass 5c. A bridge is the one structure item 2 admits may legitimately
 * stand above a road. Anything spanning higher than the headroom band across
 * clear air is left alone whoever laid it, which is the same admission stated
 * for everybody else — but a foreign stack that is *continuous* out of the band
 * is taken with it, because half a window box is a flower pot standing on air.
 *
 * `blocks` and `blockSpans` are rewritten in place and stay consistent: a span
 * that loses every block loses its row too, and the survivors' ranges are
 * recomputed rather than patched.
 */
export function enforceRoadSovereignty(
  plan: ColumnPlan,
  sovereign: { readonly mask: Uint8Array; readonly surface: Int32Array },
  blocks: StructureBlock[],
  blockSpans: BlockSpan[],
): void {
  const region = plan.region;
  const cells = region.width * region.depth;
  for (let k = 0; k < cells; k++) {
    if (sovereign.mask[k] === 1) plan.surface[k] = sovereign.surface[k] as number;
  }

  // Pass 1 — index every foreign block standing at or above a masked column's
  // surface, by column and by level, and mark the ones inside the band.
  const foreign = new Map<number, Map<number, number[]>>();
  const drop = new Uint8Array(blocks.length);
  const cleared = new Set<number>();
  for (const span of blockSpans) {
    if (ROAD_SOVEREIGN_OWN_EMITTERS.has(span.emitter)) continue;
    for (let i = span.from; i < span.to; i++) {
      const b = blocks[i] as StructureBlock;
      if (!inside(region, b.x, b.z)) continue;
      const k = index(region, b.x, b.z);
      if (sovereign.mask[k] !== 1) continue;
      const top = plan.ground[k] as number;
      if (b.y < top) continue;
      let byY = foreign.get(k);
      if (byY === undefined) {
        byY = new Map();
        foreign.set(k, byY);
      }
      const row = byY.get(b.y);
      if (row === undefined) byY.set(b.y, [i]);
      else row.push(i);
      if (b.y <= top + ROAD_SOVEREIGN_HEADROOM) {
        drop[i] = 1;
        cleared.add(k);
      }
    }
  }

  // Pass 2 — **the clear leaves no stump.** Where the band took a block, it
  // keeps taking upward for as long as the foreign stack is unbroken. A window
  // box is a fence course with a flower pot on top of it and a porch lamp is
  // two fence posts under a lantern; both reach one column into the apron, and
  // on a build-to-line lot that column is inside the border. Clearing only the
  // band beheads them — the mast goes, the lantern stays where it was, and the
  // lint reads exactly what it is: `unsupported.chain`, three findings on the
  // bridge fixture and the same shape on the hill town. The gap is what admits
  // the bridge: a deck spanning the road starts above clear air, so the walk
  // stops at the first empty level and the span is left alone, which is item
  // 2's own admission stated as a mechanism rather than as a height.
  for (const k of cleared) {
    const byY = foreign.get(k);
    if (byY === undefined) continue;
    const top = plan.ground[k] as number;
    for (let y = top + ROAD_SOVEREIGN_HEADROOM + 1; ; y++) {
      const row = byY.get(y);
      if (row === undefined) break;
      for (const i of row) drop[i] = 1;
    }
  }

  const kept: StructureBlock[] = [];
  const keptSpans: BlockSpan[] = [];
  for (const span of blockSpans) {
    const from = kept.length;
    for (let i = span.from; i < span.to; i++) {
      if (drop[i] === 1) continue;
      kept.push(blocks[i] as StructureBlock);
    }
    if (kept.length > from) keptSpans.push({ emitter: span.emitter, from, to: kept.length });
  }
  blocks.length = 0;
  for (let i = 0; i < kept.length; i += LAY_CHUNK) blocks.push(...kept.slice(i, i + LAY_CHUNK));
  blockSpans.length = 0;
  blockSpans.push(...keptSpans);
}

/**
 * Adapt a built building into the flat view the life pass reads.
 *
 * The life pass takes a *view*, not `BuiltBuilding` itself, for the same reason
 * F4 took a `StreetGraph` rather than a district: it has to be constructible by
 * hand in a test, and half of `BuiltBuilding` — apron floors, skirt states,
 * cellar cell sets — is meaningless to a pass that only ever writes outside the
 * walls.
 */
function lifeBuildingOf(built: BuiltBuilding, tags: readonly string[]): LifeBuilding {
  const archetype = built.meta.params.archetype;
  return {
    nodePath: built.nodePath,
    footprint: built.footprint,
    cells: built.cells,
    interiorCells: built.interiorCells,
    ...(built.stairCells === undefined ? {} : { stairCells: built.stairCells }),
    floorY: built.floorY,
    wallTopY: built.floorY + built.meta.wallTop,
    // A cellar's floor is in `floorLevels` too, and a lantern hung down there
    // is a lantern nobody sees; everything at or below the ground plane is
    // dropped rather than special-cased downstream.
    floorLevels: built.meta.floorLevels
      .map((y) => built.floorY + y)
      .filter((y) => y >= built.floorY),
    ...(archetype === undefined ? {} : { archetype }),
    tags,
  };
}

/**
 * The set of node paths the road pass may anchor to.
 *
 * Buildings, plus every precinct — a precinct is not a building, but it is a
 * destination, and a port with no road to it is the same defect as a door with
 * no path. Returns the original set unchanged when there are no precincts, so
 * a town without one routes exactly as it always did.
 */
function precinctAnchors(
  buildingPaths: ReadonlySet<string>,
  precincts: PrecinctPassResult | undefined,
): ReadonlySet<string> {
  if (precincts === undefined || precincts.anchorPaths.length === 0) return buildingPaths;
  return new Set([...buildingPaths, ...precincts.anchorPaths]);
}

/**
 * The constraint types declared on a prop node, in document order, deduplicated.
 *
 * Every one of them is ignored — this is not a list of the unsupported ones,
 * it is a list of what was written, because `prop.place@0` skips the solver
 * entirely. An entry whose type key cannot be resolved is left out: the profile
 * validator has already reported it as a malformed constraint, and saying it
 * twice in two vocabularies helps nobody.
 */
function ignoredPropConstraints(constraints: unknown): string[] {
  if (!Array.isArray(constraints)) return [];
  const out: string[] = [];
  for (const raw of constraints) {
    if (typeof raw !== "object" || raw === null) continue;
    const resolved = resolveTypeKey(raw as Record<string, unknown>);
    if (!resolved.ok) continue;
    if (!out.includes(resolved.type)) out.push(resolved.type);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* `infra.wall@0` inputs                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every settlement node that opted into a wall, with its extent resolved.
 *
 * The opt-in is `params.walls` on a `district` or a `city` — see
 * `packages/spec/src/settlement/types.ts`'s `WallOptions` for why that is the
 * whole authoring surface.
 *
 * The **extent** is the union of two things, and both halves are load-bearing:
 *
 * - the node's own placed footprint, which is the quarter's *ground* — its
 *   street skeleton, its blocks, its lots, all of which are inside it. Without
 *   this the hull is drawn round the buildings alone and the ring lands in the
 *   middle of the quarter's own street grid, where every column is a
 *   carriageway and the whole wall dissolves into one enormous gate;
 * - every building the node owns, found by node-path prefix, so a landmark
 *   that the solver pushed past the district's edge is still enclosed. The
 *   path is the only thing that says which quarter a building belongs to: a
 *   district's auto-infill has no line of JSON behind it at all.
 */
/**
 * The `infra.entry@0` nodes of a document, as jobs.
 *
 * Root children only, exactly like `prop.place@0`'s walk above it: an entry
 * takes no part in the layout solve, so there is no nesting for it to inherit
 * anything from, and a line round a holding is a sibling of the holding rather
 * than a child of it.
 *
 * Everything here is a *read* of what the validator already grounded — the
 * entry id is in the registry, the route names exactly one form, the distances
 * are in range. What this function adds is the registry row itself, looked up
 * once so the driver never has to know the registry exists, and the node's
 * seed, which is `hash(worldSeed, nodePath)` like every other node's.
 */
export function infraEntryJobsOf(
  doc: SettlementDocument,
  rootPath: string,
  worldSeed: bigint,
  themeOf?: (nodePath: string) => MaterialTheme | undefined,
): InfraEntryJob[] {
  const jobs: InfraEntryJob[] = [];
  for (const child of doc.root.children) {
    if (!isInfraEntryNode(child)) continue;
    const nodePath = `${rootPath}.${child.id}`;
    const params = (child.params ?? {}) as Record<string, unknown>;
    const id = typeof params["entry"] === "string" ? (params["entry"] as string) : "";
    const def = INFRA_ENTRIES[id];
    const route = routeSpecOf(params["route"]);
    // A node the validator would have rejected. Skipped in silence *here* and
    // reported there: two voices on one mistake is the defect `LOAM-T208`'s
    // coverage sweep exists to avoid, not to duplicate.
    if (def === undefined || route === undefined || !def.routes.includes(route.form)) continue;
    const theme = themeOf?.(nodePath);
    jobs.push({
      nodePath,
      def,
      route,
      params,
      seed: nodeSeed(worldSeed, nodePath, child.seedSalt ?? ""),
      ...(theme === undefined ? {} : { theme }),
      gates: params["gates"] !== false,
      ...(typeof params["height"] === "number" ? { height: params["height"] as number } : {}),
    });
  }
  return jobs;
}

/**
 * A settlement's widest **solved** street, for the linework slot's own view.
 *
 * The host's view answers `corridorOf` from the finished road network and falls
 * back to the widest street of a named district; the linework slot runs before
 * either exists as surfaced ground, so it answers the same question from the
 * layout stage's `StreetGraph` alone. Same stated total order — greatest width,
 * then the lowest segment id — so a route that names a quarter resolves to the
 * same line in both slots.
 */
function widestSolvedStreet(
  districts: readonly DistrictProduct[],
  nodePath: string,
): readonly { readonly x: number; readonly z: number }[] | undefined {
  const prefix = `${nodePath}.`;
  let best: { width: number; segId: string; path: readonly { x: number; z: number }[] } | undefined;
  for (const district of districts) {
    if (district.nodePath !== nodePath && !district.nodePath.startsWith(prefix)) continue;
    for (const segment of district.streets.segments) {
      if (segment.path.length < 2) continue;
      if (
        best === undefined ||
        segment.width > best.width ||
        (segment.width === best.width && segment.id < best.segId)
      ) {
        best = { width: segment.width, segId: segment.id, path: segment.path };
      }
    }
  }
  return best === undefined ? undefined : best.path.map((p) => ({ x: p.x, z: p.z }));
}

/**
 * The bounding rectangle of a published column mask, or `undefined` when it
 * claims nothing.
 *
 * A rectangle rather than the mask's own outline, because what consumes it is
 * `fabricExtent`, which takes a 24-normal support hull: the hull of a set of
 * columns and the hull of their bounding box differ only where the set is
 * concave, and a cordon that followed a field's concavities would be a fence
 * nobody could walk beside.
 */
function maskRect(
  mask: Uint8Array,
  region: { x0: number; z0: number; width: number; depth: number },
): { x0: number; z0: number; x1: number; z1: number } | undefined {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      if (mask[j * region.width + i] !== 1) continue;
      const x = region.x0 + i;
      const z = region.z0 + j;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
  }
  return x1 < x0 ? undefined : { x0, z0, x1, z1 };
}

/** The one route form a validated `route` object names, with its distances. */
function routeSpecOf(raw: unknown): InfraRouteSpec | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const route = raw as Record<string, unknown>;
  for (const form of INFRA_ROUTE_KEYS) {
    const raw = route[form];
    // `between` is the one form whose value is a *pair* — two placed anchors,
    // in the node's own order, which the resolver keeps because a run's start
    // is what an interval feature's phase is locked to. Every other form names
    // one thing and reads as a string.
    const pair =
      Array.isArray(raw) &&
      raw.length === 2 &&
      typeof raw[0] === "string" &&
      raw[0].length > 0 &&
      typeof raw[1] === "string" &&
      raw[1].length > 0
        ? ([raw[0], raw[1]] as const)
        : undefined;
    if (pair === undefined && (typeof raw !== "string" || raw.length === 0)) continue;
    const target = pair === undefined ? (raw as string) : `${pair[0]} → ${pair[1]}`;
    return {
      form: form as InfraRouteSpec["form"],
      target,
      ...(pair === undefined ? {} : { targets: [pair[0], pair[1]] as [string, string] }),
      ...(typeof route["margin"] === "number" ? { margin: route["margin"] as number } : {}),
      ...(typeof route["offset"] === "number" ? { offset: route["offset"] as number } : {}),
      ...(route["side"] === "left" || route["side"] === "right"
        ? { side: route["side"] as "left" | "right" }
        : {}),
      ...(typeof route["run"] === "number" ? { run: route["run"] as number } : {}),
    };
  }
  return undefined;
}

export function wallJobsOf(
  doc: SettlementDocument,
  rootPath: string,
  built: readonly BuiltBuilding[],
  rectOf: (nodePath: string) => { x0: number; z0: number; x1: number; z1: number } | undefined,
  themeOf?: (nodePath: string) => MaterialTheme | undefined,
  field?: FabricField,
): WallJob[] {
  const jobs: WallJob[] = [];
  for (const child of doc.root.children) {
    if (child.kind !== "district" && child.kind !== "city") continue;
    const params = (child.params ?? {}) as unknown as Record<string, unknown>;
    const walls = params["walls"];
    if (walls === undefined || walls === null || typeof walls !== "object") continue;
    const w = walls as Record<string, unknown>;
    const nodePath = `${rootPath}.${child.id}`;
    const prefix = `${nodePath}.`;
    const own = rectOf(nodePath);
    const margin = typeof w["margin"] === "number" ? (w["margin"] as number) : WALL_DEFAULT_MARGIN;
    // The **fabric's** hull, not the reservation's: `margin` is measured from
    // the city's edge — the ground the quarter actually built on — and the rect
    // survives only as the window that says which fabric is this quarter's.
    // See `structures/fabric-hull.ts` for the walk that forced the change.
    const extent = fabricExtent({
      clip: own === undefined ? [] : [own],
      buildings: built
        .filter((b) => b.nodePath === nodePath || b.nodePath.startsWith(prefix))
        .map((b) => b.footprint),
      margin,
      ...(field === undefined ? {} : { field }),
    });
    if (extent.length === 0) continue;
    const style = typeof w["style"] === "string" ? (w["style"] as string) : "masonry";
    // The theme, then the author. A `masonry` wall with nothing said about its
    // materials is built from the settlement's *own* built-ground roles — the
    // same derivation the `structures.fortification` dial uses, and the same
    // function — because "the author asked for a wall" is not the same claim as
    // "the author asked for grey stone bricks". A walked Troy in sun clay came
    // out ringed in default masonry for exactly as long as this path had no
    // theme to read. A style that *is* its material (palisade, earthwork) keeps
    // its table, and any role the author named outranks both.
    const derived =
      themeOf === undefined || wallStyleFixesMaterials(style)
        ? undefined
        : wallMaterialsOfTheme(themeOf(nodePath));
    const materials = withMaterialOverrides(derived, w["materials"], style);
    jobs.push({
      nodePath,
      extent,
      style,
      ...(materials === undefined ? {} : { materials }),
      margin,
      towerPitch:
        typeof w["towerPitch"] === "number" ? (w["towerPitch"] as number) : WALL_DEFAULT_TOWER_PITCH,
      height: typeof w["height"] === "number" ? (w["height"] as number) : WALL_DEFAULT_HEIGHT,
      gates: w["gates"] !== false,
    });
  }
  return jobs;
}

/**
 * The five wall roles the job is built from, or `undefined` for "the style's
 * own table".
 *
 * Three sources, in precedence order: the author's `walls.materials`, then the
 * theme-derived set, then nothing (the style table `buildWalls` falls back to).
 * Partial overrides compose — naming `merlon` alone re-caps a wall that is
 * otherwise the town's own stone — which is why the author's roles are merged
 * over the derived set rather than replacing it whole.
 *
 * A style that fixes its own materials (palisade, earthwork) has no derived set
 * to merge into, so an override there starts from that style's table.
 */
function withMaterialOverrides(
  derived: WallMaterials | undefined,
  raw: unknown,
  style: string,
): WallMaterials | undefined {
  if (typeof raw !== "object" || raw === null) return derived;
  const named = raw as Record<string, unknown>;
  const base =
    derived ??
    ((WALL_MATERIALS[style] ?? WALL_MATERIALS["masonry"]) as WallMaterials);
  const out: Record<string, string> = { ...base };
  let touched = false;
  for (const role of ["core", "walk", "parapet", "merlon", "tower"] as const) {
    const block = named[role];
    if (typeof block !== "string" || block.trim().length === 0) continue;
    out[role] = block.trim();
    touched = true;
  }
  if (!touched) return derived;
  return out as unknown as WallMaterials;
}

/**
 * The settlement's **fabric**: every `district` and `city` child of the root,
 * with what it declared and what it got placed as.
 *
 * The document-reading half of `intent.character.fortification` — the dial's
 * own file decides what to do with these, and deliberately does not walk a
 * document to find them, because "which node is a quarter" is a fact this
 * module already answers for `wallJobsOf` and two walkers would eventually
 * disagree about it.
 *
 * `declared` is the node's **own** `intent`, not the resolved merge: the
 * difference is what separates "the town is walled" (said once, at the root,
 * and answered with one circuit round the whole fabric) from "this quarter is
 * walled" (said on the quarter, and answered with a ring round it).
 */
export function fabricNodesOf(
  doc: SettlementDocument,
  rootPath: string,
  built: readonly BuiltBuilding[],
  rectOf: (nodePath: string) => { x0: number; z0: number; x1: number; z1: number } | undefined,
): FabricNode[] {
  const out: FabricNode[] = [];
  for (const child of doc.root.children) {
    if (child.kind !== "district" && child.kind !== "city") continue;
    const nodePath = `${rootPath}.${child.id}`;
    const prefix = `${nodePath}.`;
    const rect = rectOf(nodePath);
    const declared = (child as { intent?: SemanticIntent }).intent;
    out.push({
      nodePath,
      ...(declared === undefined ? {} : { declared }),
      ...(rect === undefined ? {} : { rect }),
      buildings: built
        .filter((b) => b.nodePath === nodePath || b.nodePath.startsWith(prefix))
        .map((b) => b.footprint),
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the connective pass's inputs                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every `connected … via "tunnel"` pair the document declares, deduplicated.
 *
 * §4 `connected.bidirectional` defaults true, so declaring the constraint on
 * one side is enough and declaring it on both is not two tunnels. The pair key
 * is order-independent for exactly that reason; the first declaration wins the
 * direction, which decides which end the router starts from and therefore which
 * end wins the straight line.
 */
export function tunnelLinksOf(doc: SettlementDocument, rootPath: string): TunnelLink[] {
  const out: TunnelLink[] = [];
  const seen = new Set<string>();
  for (const child of doc.root.children) {
    if (child.kind !== "generator" || child.generator !== "building.grammar@0") continue;
    for (const raw of child.constraints ?? []) {
      const resolved = resolveTypeKey(raw as Record<string, unknown>);
      if (!resolved.ok || resolved.type !== "connected") continue;
      const c = canonicalize(raw as Record<string, unknown>, resolved.type, resolved.shorthand);
      const target = c["to"];
      if (typeof target !== "string") continue;
      const via = typeof c["via"] === "string" ? c["via"] : "tunnel";
      if (!isImplementedVia(via)) continue;
      const bare = target.startsWith("^.") ? target.slice(2) : target;
      const leaf = (bare.split("#")[0] as string).split(".").pop() as string;
      if (leaf === child.id) continue;
      const key = [child.id, leaf].sort().join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `${rootPath}.${child.id}__${leaf}`,
        fromPath: `${rootPath}.${child.id}`,
        toPath: `${rootPath}.${leaf}`,
        ...(typeof c["from"] === "string" ? { fromPort: portNameOf(c["from"]) } : {}),
        ...(target.includes("#") ? { toPort: portNameOf(target) } : {}),
        ...(typeof c["maxLength"] === "number" ? { maxLength: c["maxLength"] } : {}),
        // §4 `connected` carries a `style`; for a tunnel it is the hand the
        // gallery is dug by. Unrecognised spellings resolve to `dressed`, which
        // is what the pass has always built — the profile validator is where an
        // author is told they wrote something it does not know.
        style: resolveTunnelStyle(c["style"]),
        ...(c["oreChamber"] === true ? { oreChamber: true } : {}),
      });
    }
  }
  return out;
}

function portNameOf(ref: string): string {
  return ref.includes("#") ? (ref.split("#")[1] as string) : ref;
}

/**
 * The `entrance.treatment` a building asked for, or `undefined`.
 *
 * Family D's whole authoring surface (docs/INFRA-ENTRIES-v0.md §2 D): a fitting
 * *in* another structure is a param on that structure, never a node. Read
 * defensively and read narrowly — a malformed `entrance` is dropped here rather
 * than thrown, because the compiler never fails a document on a param the
 * validator has already spoken about (`STRUCTURE_PARAM`), and the grammar
 * itself refuses a treatment id it does not build.
 */
export function entranceTreatmentOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const treatment = (value as { treatment?: unknown }).treatment;
  return typeof treatment === "string" ? treatment : undefined;
}

/**
 * Resolve the `basement` param's three legal spellings to a headroom.
 *
 * `implied` is the tunnel pass talking: a building at the end of a `connected`
 * tunnel gets the default cellar without asking, because the alternative is a
 * gallery that ends in a wall.
 */
export function resolveBasementParam(value: unknown, implied: boolean): number {
  const fallback = implied ? DEFAULT_BASEMENT_DEPTH : 0;
  if (value === undefined) return fallback;
  if (value === true) return DEFAULT_BASEMENT_DEPTH;
  if (value === false) return fallback;
  if (typeof value === "number") return value > 0 ? Math.round(value) : fallback;
  if (typeof value === "object" && value !== null) {
    const depth = (value as { depth?: unknown }).depth;
    return typeof depth === "number" ? Math.round(depth) : DEFAULT_BASEMENT_DEPTH;
  }
  return fallback;
}

/**
 * The cellar style a `basement` param asks for, or the one its tunnel implies.
 *
 * `undefined` means "say nothing", which is how the grammar's own default —
 * plain, except under a mine head — stays the grammar's business rather than
 * this function's.
 */
export function resolveBasementStyle(value: unknown, implied?: string): string | undefined {
  if (typeof value === "object" && value !== null) {
    const style = (value as { style?: unknown }).style;
    if (typeof style === "string") return style;
  }
  return implied;
}

/**
 * Fold the tunnel bores into the column plan's carved spans.
 *
 * A gallery *is* interior air, so it rides the same mechanism a cave does — one
 * punch-out per column at emit, one `cave_air` fill, one set of readback rules.
 * What it adds is `structuralColumns`: the columns whose roof thickness is the
 * structure pass's business rather than the carver's, which is what keeps
 * `checkCaveIntegrity` from reporting a cellar's own portal as a breach.
 */
function attachTunnelSpans(
  plan: ColumnPlan,
  pass: { spans: CaveSpans; columns: Uint8Array; portalColumns: Uint8Array },
): void {
  const n = plan.region.width * plan.region.depth;
  const existing = plan.caves;
  const spans = existing === undefined ? pass.spans : mergeSpanSets([existing.spans, pass.spans], n);
  let carvedBlocks = 0;
  for (let k = 0; k < spans.lo.length; k++) {
    carvedBlocks += (spans.hi[k] as number) - (spans.lo[k] as number) + 1;
  }
  const structuralColumns = existing?.structuralColumns ?? new Uint8Array(n);
  const portalColumns = existing?.portalColumns ?? new Uint8Array(n);
  for (let idx = 0; idx < n; idx++) {
    if (pass.columns[idx] === 1) structuralColumns[idx] = 1;
    if (pass.portalColumns[idx] === 1) portalColumns[idx] = 1;
  }
  plan.caves = {
    spans,
    entranceColumns: existing?.entranceColumns ?? new Uint8Array(n),
    markers: existing?.markers ?? [],
    carvedBlocks,
    systems: existing?.systems ?? 0,
    chambers: existing?.chambers ?? 0,
    decorate: existing?.decorate ?? false,
    // Carried through so a tunnel merging into the cave plan does not cost the
    // carver's spans their style, and with it their dressing.
    ...(existing?.styleByColumn === undefined ? {} : { styleByColumn: existing.styleByColumn }),
    structuralColumns,
    portalColumns,
  };
}

/* -------------------------------------------------------------------------- */

/**
 * A document's chosen material theme, if it names one.
 *
 * `style.palettes["theme"]` is the escape hatch: an author who wants a specific
 * village palette says so there, and the seed draw is skipped.
 */
function themeOverride(doc: SettlementDocument): string | undefined {
  const palettes = (doc.style as { palettes?: Record<string, unknown> } | undefined)?.palettes;
  const named = palettes?.[PALETTE_THEME_KEY];
  return typeof named === "string" ? named : undefined;
}

/** Structure generator nodes of the document, keyed by node path. */
function structureNodesOf(
  doc: SettlementDocument,
  rootPath: string,
): Map<string, StructureNode> {
  const out = new Map<string, StructureNode>();
  const take = (node: StructureNode, path: string): void => {
    if (
      node.generator !== "building.grammar@0" &&
      node.generator !== "road.network@0" &&
      !isPrecinctGenerator(node.generator) &&
      // F17: a holding is in the precinct family but not in the kit set that
      // levels its envelope, so it is named here explicitly.
      !isFarmGenerator(node.generator)
    ) {
      return;
    }
    out.set(path, node);
  };
  for (const child of doc.root.children) {
    // C1: a precinct written as a child of a `city` is placed by the city pass
    // against the cell it claimed, but its *params* still live in the document
    // and the precinct kit reads them from here.
    if (child.kind === "city") {
      for (const grand of child.children ?? []) {
        take(grand, `${rootPath}.${child.id}.${grand.id}`);
      }
      continue;
    }
    if (child.kind !== "generator") continue;
    take(child as StructureNode, `${rootPath}.${child.id}`);
  }
  return out;
}

/** Read the `road.network@0` params this v0 implements. */
export function roadParamsOf(params: Readonly<Record<string, unknown>> | undefined): RoadParams {
  const p = params ?? {};
  // This profile's `width`/`lanterns` shorthand for v0.2's `hierarchy[0].width`
  // and `lighting`; both spellings are read, the shorthand wins.
  const hierarchy = p["hierarchy"];
  const first = Array.isArray(hierarchy) ? (hierarchy[0] as Record<string, unknown> | undefined) : undefined;
  const lighting = p["lighting"] as Record<string, unknown> | undefined;
  const width =
    typeof p["width"] === "number"
      ? p["width"]
      : typeof first?.["width"] === "number"
        ? (first["width"] as number)
        : undefined;
  const spacing =
    typeof p["lanternSpacing"] === "number"
      ? p["lanternSpacing"]
      : typeof lighting?.["spacing"] === "number"
        ? (lighting["spacing"] as number)
        : undefined;
  return {
    ...(width === undefined ? {} : { width }),
    ...(typeof p["lanterns"] === "boolean" ? { lanterns: p["lanterns"] } : {}),
    ...(spacing === undefined ? {} : { lanternSpacing: spacing }),
  };
}

/**
 * The `anchors` selector list off a `road.network@0` node.
 *
 * Required by the validator, so an absent or malformed list here means the
 * document never reached validation; an empty list is the honest answer and
 * leaves the router on its default (every building is a destination).
 */
export function anchorSelectorsOf(
  params: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  const anchors = (params ?? {})["anchors"];
  if (!Array.isArray(anchors)) return [];
  return anchors.filter((a): a is string => typeof a === "string");
}

/**
 * Claim a building's footprint — and, separately, its interior — in the
 * occupancy grid.
 *
 * The solver already claimed the footprint *plus clearance* under the
 * `structure` tag. This adds the `building` and `interior` tags, which is what
 * lets a later pass say "decorate around houses but never inside one".
 */
function claimFootprint(occupancy: OccupancyGrid, built: BuiltBuilding): void {
  const { region } = occupancy;
  const tags = occupancy.byTag as Map<string, Uint8Array>;
  const tagMask = (name: string): Uint8Array => {
    let mask = tags.get(name);
    if (mask === undefined) {
      mask = new Uint8Array(occupancy.mask.length);
      tags.set(name, mask);
    }
    return mask;
  };
  const building = tagMask("building");
  const interior = tagMask("interior");

  for (let z = built.footprint.z0; z <= built.footprint.z1; z++) {
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = built.footprint.x0; x <= built.footprint.x1; x++) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      const idx = j * region.width + i;
      occupancy.mask[idx] = 1;
      building[idx] = 1;
      const inner =
        x >= built.interior.x0 && x <= built.interior.x1 && z >= built.interior.z0 && z <= built.interior.z1;
      if (inner) interior[idx] = 1;
    }
  }
}

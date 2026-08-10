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
  DEFAULT_BASEMENT_DEPTH,
  DEFAULT_ORNAMENT_DENSITY,
  archetypeOfTags,
  assignMaterials,
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
import {
  canonicalize,
  isFarmGenerator,
  isImplementedVia,
  isPropNode,
  resolveTypeKey,
  warning,
} from "@terrainist/spec";
import type {
  FarmEdge,
  LoamDiagnostic,
  PortDeclaration,
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
import type { CityProduct } from "../layout/city-pass.js";
import type { DistrictProduct } from "../layout/district.js";
import { dressStreets, type SegmentArc } from "./streetscape.js";
import type { GroundDriver } from "../layout/ground-driver.js";
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
  buildRetainingWalls,
  finishCutFaces,
  type RetainingPassResult,
} from "./retaining.js";
import { furnishCourtyards, type CourtyardPassResult } from "./courtyards.js";
import { buildDoorsteps, type DoorstepResult } from "./doorsteps.js";
import { buildGrounds, softSurfaceStates, type GroundPassResult } from "./grounds.js";
import { buildJunctionSteps, type PavedSurface } from "./junction-steps.js";
import { buildRuinField, type RuinField } from "./ruin-field.js";
import { growGreenSkin, type GreenSkinResult } from "./green-skin.js";
import { dressLife, type LifeBuilding, type LifeStreets } from "./life.js";
import { pavePlaza, type PlazaResult } from "./plaza.js";
import { dressSetPieces } from "./setpieces.js";
import {
  buildProps,
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
import {
  WALL_DEFAULT_HEIGHT,
  WALL_DEFAULT_MARGIN,
  WALL_DEFAULT_TOWER_PITCH,
  buildWalls,
  extentOfRects,
  type BuiltWall,
  type WallJob,
} from "./walls.js";

export * from "./buildings.js";
export * from "./canals.js";
export * from "./retaining.js";
export * from "./courtyards.js";
export * from "./doorsteps.js";
export * from "./life.js";
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

/** Build every placed structure, then connect them. */
export function buildStructures(input: StructurePassInput): StructurePassResult {
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
  const jobThemes = jobs.map((job) => {
    const scoped = intentFor(intents, job.nodePath);
    const id = fanOut<string | undefined>(STRUCTURE_ROWS.materialTheme, scoped, {
      nodePath: job.nodePath,
      today: declaredTheme,
    });
    return id === themeId || id === undefined ? theme : pickTheme(themeSeed, id);
  });
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
    return {
      ...job,
      params:
        ornament === DEFAULT_ORNAMENT_DENSITY
          ? job.params
          : { ...job.params, ornamentDensity: ornament },
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
    plan: input.plan,
    ground: input.ground,
    palette: input.palette,
    stack: input.stack,
    footprints: buildings.built.map((b) => b.footprint),
  });
  diagnostics.push(...retaining.diagnostics);
  lay("retaining", retaining.blocks);

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
  let streetFurniture = 0;
  const arterials = cities.flatMap((c) => c.plan.arterials);
  if (districts.length > 0 || arterials.length > 0) {
    streets = surfaceStreetGraph({
      graphs: districts.map((d) => d.streets),
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
    // §3.8b: one entry per surfaced segment, keyed by the surfacer's own source
    // id, so the sidewalk band takes its level from the very `ArcLevels` the
    // carriageway was graded to. A segment with no frame (a flight of steps, a
    // refused run) is simply absent, and the band falls back to the centre cell.
    const segmentArcs = new Map<string, SegmentArc>();
    for (const segment of streets.declaration.segments) {
      if (segment.frame === undefined || segment.levels === undefined) continue;
      segmentArcs.set(segment.source, { frame: segment.frame, levels: segment.levels });
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
      // Kept for C3: the life pass needs the walk lane it must not touch and
      // the carriageway it parks against, and re-deriving either from the
      // graph would be the same rasterization with a second chance to differ.
      streetMasks.push({
        nodePath: district.nodePath,
        bounds: district.bounds,
        graph: district.streets,
        masks: dressed.masks,
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

  // --- doorsteps -----------------------------------------------------------
  // Last, and it has to be: a doorstep reconciles a threshold with the ground
  // *outside* it, and until the roads have cut and the shoulders have blended,
  // that ground is not final.
  // The apron, a second time: the roads have cut and the shoulders have
  // blended, so the ground a porch lamp stands in is only now the ground the
  // emitter will lay. Adds nothing on a world with no roads.
  lay("aprons", underpinAprons(built, input.plan));

  const doorsteps = buildDoorsteps({
    buildings: built,
    // The farmstead's own doors, appended: a farmhouse whose door faces its own
    // field gets a flush threshold rather than a step into the crop (§5.4).
    ports: farmPorts.length === 0 ? input.ports : [...input.ports, ...farmPorts],
    plan: input.plan,
    ground: input.ground,
    palette: input.palette,
    stack: input.stack,
  });
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
  if (districts.some((d) => (d.levels?.levelY.length ?? 0) > 1)) {
    const junctions = buildJunctionSteps({
      region: input.plan.region,
      plan: input.plan,
      stack: input.stack,
      palette: input.palette,
      paved: pavedSurfaces,
      ...(input.ground === undefined ? {} : { ground: input.ground }),
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
    plan: input.plan,
    palette: input.palette,
    stack: input.stack,
    footprints: built.map((b) => b.footprint),
    // The wall masonry stays the wall's: a seam column is deepened, not
    // repainted in rock.
    seam: retaining.seam,
  });
  diagnostics.push(...cutFaces.diagnostics);

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
  const wallJobs = wallJobsOf(input.doc, rootPath, built, (p) =>
    placementByPath.get(p)?.footprint,
  );
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
        });
  if (wallPass !== undefined) {
    diagnostics.push(...wallPass.diagnostics);
    lay("walls", wallPass.blocks);
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
          ...(grounds.ruinYardColumns === undefined
            ? {}
            : { ruinYardColumns: grounds.ruinYardColumns }),
        });
  if (greenSkin !== undefined) {
    diagnostics.push(...greenSkin.diagnostics);
    lay("green-skin", greenSkin.blocks);
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
      streetFurniture,
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
      ...life.stats,
    },
  };
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
export function wallJobsOf(
  doc: SettlementDocument,
  rootPath: string,
  built: readonly BuiltBuilding[],
  rectOf: (nodePath: string) => { x0: number; z0: number; x1: number; z1: number } | undefined,
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
    const extent = extentOfRects([
      ...(own === undefined ? [] : [own]),
      ...built
        .filter((b) => b.nodePath === nodePath || b.nodePath.startsWith(prefix))
        .map((b) => b.footprint),
    ]);
    if (extent.length === 0) continue;
    jobs.push({
      nodePath,
      extent,
      style: typeof w["style"] === "string" ? (w["style"] as string) : "masonry",
      margin: typeof w["margin"] === "number" ? (w["margin"] as number) : WALL_DEFAULT_MARGIN,
      towerPitch:
        typeof w["towerPitch"] === "number" ? (w["towerPitch"] as number) : WALL_DEFAULT_TOWER_PITCH,
      height: typeof w["height"] === "number" ? (w["height"] as number) : WALL_DEFAULT_HEIGHT,
      gates: w["gates"] !== false,
    });
  }
  return jobs;
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

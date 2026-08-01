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
  isImplementedVia,
  isPropNode,
  resolveTypeKey,
  warning,
} from "@terrainist/spec";
import type {
  LoamDiagnostic,
  PortDeclaration,
  SettlementDocument,
  StructureNode,
} from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import { resolvePorts } from "../layout/ports.js";
import type { DistrictProduct } from "../layout/district.js";
import { dressStreets } from "./streetscape.js";
import type { LayoutNodeInput, OccupancyGrid, Placement, ResolvedPort } from "../layout/types.js";
import { mergeSpanSets } from "../terrain/caves.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { PALETTE_THEME_KEY, type Palette } from "../terrain/palette.js";

import {
  buildBuildings,
  terraceBaysParamOf,
  underpinAprons,
  wingParamOf,
  type BuildingJob,
  type BuiltBuilding,
  type StructureBlock,
} from "./buildings.js";
import { buildDoorsteps } from "./doorsteps.js";
import { buildGrounds, type GroundPassResult } from "./grounds.js";
import { dressLife, type LifeBuilding, type LifeStreets } from "./life.js";
import { pavePlaza, type PlazaResult } from "./plaza.js";
import { buildProps, checkPropFluidSafety, type PlacedProp, type PropJob } from "./props.js";

import {
  buildPrecincts,
  isPrecinctGenerator,
  type PrecinctJob,
  type PrecinctPassResult,
} from "./precincts.js";
import {
  buildRoadNetwork,
  index,
  inside,
  surfaceStreetGraph,
  type RoadNetworkResult,
  type RoadParams,
  type StreetSurfaceResult,
} from "./roads.js";
import type { StreetscapeResult } from "./streetscape.js";
import { buildTunnels, resolveTunnelStyle, type BuiltTunnel, type TunnelLink } from "./tunnels.js";

export * from "./buildings.js";
export * from "./doorsteps.js";
export * from "./life.js";
export * from "./grounds.js";
export * from "./plaza.js";
export * from "./precincts.js";
export * from "./props.js";
export * from "./roads.js";
export * from "./tunnels.js";

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
  /** Precinct compounds laid out, by kit. */
  readonly airports: number;
  readonly harbours: number;
  /** Apron stands cut, and aircraft parked on them. */
  readonly standsCut: number;
  readonly aircraftParked: number;
  /** Piers run out from a quay, and hulls moored alongside them. */
  readonly piersBuilt: number;
  readonly shipsMoored: number;
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

/** What the structure pass produced. */
export interface StructurePassResult {
  /** Blocks to stamp after the terrain columns are written. */
  readonly blocks: readonly StructureBlock[];
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
  readonly props: readonly PlacedProp[];
  /** F2's ground treatment: what each lot got, and how much ground it took. */
  readonly grounds?: GroundPassResult;
  readonly precincts?: PrecinctPassResult;
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly stats: StructureStats;
}

/** Build every placed structure, then connect them. */
export function buildStructures(input: StructurePassInput): StructurePassResult {
  const rootPath = input.doc.root.id;
  const diagnostics: LoamDiagnostic[] = [];
  const byId = new Map(input.nodes.map((n) => [n.nodePath, n] as const));
  const placementByPath = new Map(input.placements.map((p) => [p.nodePath, p] as const));
  const docNodes = structureNodesOf(input.doc, rootPath);
  const districts = input.districts ?? [];
  /** Every building the fabric pass produced, by node path. */
  const districtPaths = new Set<string>();
  for (const district of districts) {
    const prefix = `${district.nodePath}.`;
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
  const theme: MaterialTheme = pickTheme(themeSeed, themeOverride(input.doc));
  const deal = assignMaterials(theme, jobs.length, themeSeed);
  // The whole palette rides along beside the triple, not instead of it. Only
  // the terrace reads it, and it reads it for a reason no other building has:
  // a terrace is several buildings, so one triple cannot clothe it — each bay
  // takes its own from the same theme, which is what makes a run read as a
  // street rather than as one long building painted one colour.
  const themed = jobs.map((job, i) => ({
    ...job,
    materials: deal[i] as BuildingMaterials,
    theme,
  }));

  const jobTags = new Map(jobs.map((job) => [job.nodePath, job.tags] as const));

  const buildings = buildBuildings(themed, input.plan, input.stack);
  diagnostics.push(...buildings.diagnostics);
  const blocks: StructureBlock[] = [...(precincts?.blocks ?? []), ...buildings.blocks];
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
  blocks.push(...tunnelPass.blocks);
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
      palette: input.palette,
      stack: input.stack,
      seed: seed32(streamSeed(plazaNode.seed, "plaza")),
      ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
    });
    diagnostics.push(...plaza.diagnostics);
    blocks.push(...plaza.blocks);
  }

  // --- district streets ----------------------------------------------------
  // Before the inter-district roads and after the buildings, and both halves of
  // that are load-bearing. After the buildings, because a street may not cut
  // into a facade it was drawn to meet. Before the roads, because a lane
  // arriving from the next district should *join* the street grid, and the
  // router discounts existing road cells — which is exactly how a lane finds a
  // street rather than running alongside it.
  let streets: StreetSurfaceResult | undefined;
  const streetMasks: LifeStreets[] = [];
  let streetFurniture = 0;
  if (districts.length > 0) {
    streets = surfaceStreetGraph({
      graphs: districts.map((d) => d.streets),
      plan: input.plan,
      palette: input.palette,
      stack: input.stack,
      placements,
      buildingPaths,
      theme: theme.id,
      seed: themeSeed,
      ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
    });
    blocks.push(...streets.blocks);
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
        stack: input.stack,
        seed: nodeSeed(input.worldSeed, district.nodePath, ""),
        furniture: district.streets.sidewalk >= 2 ? "downtown" : "village",
        palette: input.palette,
        nodePath: district.nodePath,
        avoid: (x, z) => builtColumns.has(`${x},${z}`),
      });
      blocks.push(...dressed.blocks);
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
    roads = buildRoadNetwork({
      nodePath,
      params: roadParamsOf(roadNode.params),
      seed,
      plan: input.plan,
      palette: input.palette,
      stack: input.stack,
      placements,
      // The precinct approach ports are appended, not merged: the road pass
      // reads a placement's ports by node path, and a precinct has no shell for
      // the generic resolver to hang a stub on, so the kit states its own.
      ports: precinctPorts.length === 0 ? input.ports : [...input.ports, ...precinctPorts],
      buildingPaths: precinctAnchors(buildingPaths, precincts),
      // A district's own buildings are obstacles, never destinations — they are
      // already on a street; a precinct's landside anchor IS a destination.
      // See `RoadNetworkInput.anchorPaths`.
      ...(districtPaths.size === 0
        ? {}
        : {
            anchorPaths: new Set(
              [...precinctAnchors(buildingPaths, precincts)].filter((p) => !districtPaths.has(p)),
            ),
          }),
      ...(plazaPlacement === undefined ? {} : { plaza: plazaPlacement }),
      ...(plaza === undefined ? {} : { paved: plaza.paved, keepClear: plaza.keepClear }),
      ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
      ...(input.roadCorridor === undefined ? {} : { corridor: input.roadCorridor }),
    });
    diagnostics.push(...roads.diagnostics);
    blocks.push(...roads.blocks);
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
  const props =
    propJobs.length === 0
      ? { blocks: [] as StructureBlock[], placed: [] as PlacedProp[], diagnostics: [] as LoamDiagnostic[] }
      : buildProps({
          jobs: propJobs,
          plan: input.plan,
          stack: input.stack,
          reserved: buildings.built.map((b) => b.footprint),
          ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
        });
  diagnostics.push(...props.diagnostics);
  blocks.push(...props.blocks);
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
  blocks.push(...underpinAprons(buildings.built, input.plan));

  const doorsteps = buildDoorsteps({
    buildings: buildings.built,
    ports: input.ports,
    plan: input.plan,
    palette: input.palette,
    stack: input.stack,
  });
  blocks.push(...doorsteps.blocks);

  // --- ground treatment (F2) -----------------------------------------------
  // Dead last, and that is the whole design: every other pass has by now
  // declared the ground it owns — roads, plaza, doorsteps, footprints, props —
  // so this one can treat what is left without ever having to guess.
  const grounds = buildGrounds({
    buildings: buildings.built,
    plan: input.plan,
    palette: input.palette,
    stack: input.stack,
    seed: seed32(streamSeed(themeSeed, "grounds")),
    ...(roads === undefined ? {} : { roadColumns: roads.roadColumns }),
    ...(plaza === undefined ? {} : { paved: plaza.paved, keepClear: plaza.keepClear }),
    doorstepColumns: doorsteps.touched,
    ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
  });
  blocks.push(...grounds.blocks);

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
    buildings: buildings.built.map((b) => lifeBuildingOf(b, jobTags.get(b.nodePath) ?? [])),
    districts: streetMasks,
    existing: blocks,
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
  blocks.push(...life.blocks);

  return {
    blocks,
    buildings: buildings.built,
    tunnels: tunnelPass.tunnels,
    props: props.placed,
    grounds,
    ...(precincts === undefined ? {} : { precincts }),
    districts,
    ...(plaza === undefined ? {} : { plaza }),
    ...(roads === undefined ? {} : { roads }),
    ...(streets === undefined ? {} : { streets }),
    diagnostics,
    stats: {
      theme: theme.id,
      distinctMaterials: new Set(deal.map((m) => materialKey(m))).size,
      buildingCount: buildings.built.length,
      buildingBlocks: buildings.built.reduce((sum, b) => sum + b.blockCount, 0),
      roadRoutes: roads?.routes.length ?? 0,
      roadColumns: roads?.surfacedColumns ?? 0,
      roadBridgeColumns: roads?.bridgeColumns ?? 0,
      unroutedAnchors: roads?.unrouted.length ?? 0,
      plazaColumns: plaza?.pavedColumns ?? 0,
      plazaBenches: plaza?.benches ?? 0,
      plazaWell: plaza?.well ?? false,
      doorstepsStepped: doorsteps.stepped,
      doorstepsDropped: doorsteps.dropped,
      cellars: buildings.built.filter((b) => b.basementDepth > 0).length,
      tunnels: tunnelPass.tunnels.length,
      tunnelCarvedBlocks: tunnelPass.tunnels.reduce((sum, t) => sum + t.carvedBlocks, 0),
      tunnelLength: tunnelPass.tunnels.reduce((sum, t) => sum + t.path.length, 0),
      tunnelStairSteps: tunnelPass.tunnels.reduce((sum, t) => sum + t.stairSteps, 0),
      tunnelLanterns: tunnelPass.tunnels.reduce((sum, t) => sum + t.lanterns, 0),
      tunnelJunctions: tunnelPass.tunnels.reduce((sum, t) => sum + t.junctions.length, 0),
      districts: districts.length,
      districtBuildings: districtPaths.size,
      streetColumns: streets?.surfacedColumns ?? 0,
      props: props.placed.length,
      propsUnplaced: propJobs.length - props.placed.length,
      propWaterLeaks: propFluids.leaks.length,
      streetFurniture,
      dressedColumns: grounds.dressedColumns,
      wornColumns: grounds.wornColumns,
      airports: precincts?.stats.airports ?? 0,
      harbours: precincts?.stats.harbours ?? 0,
      standsCut: precincts?.stats.stands ?? 0,
      aircraftParked: precincts?.stats.aircraft ?? 0,
      piersBuilt: precincts?.stats.piers ?? 0,
      shipsMoored: precincts?.stats.ships ?? 0,
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
  for (const child of doc.root.children) {
    if (child.kind !== "generator") continue;
    if (
      child.generator !== "building.grammar@0" &&
      child.generator !== "road.network@0" &&
      !isPrecinctGenerator(child.generator)
    ) {
      continue;
    }
    out.set(`${rootPath}.${child.id}`, child as StructureNode);
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

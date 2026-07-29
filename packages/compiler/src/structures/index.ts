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
import { canonicalize, isImplementedVia, isPropNode, resolveTypeKey } from "@terrainist/spec";
import type {
  LoamDiagnostic,
  PortDeclaration,
  SettlementDocument,
  StructureNode,
} from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { LayoutNodeInput, OccupancyGrid, Placement, ResolvedPort } from "../layout/types.js";
import { mergeSpanSets } from "../terrain/caves.js";
import type { ColumnPlan } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";

import {
  buildBuildings,
  underpinAprons,
  wingParamOf,
  type BuildingJob,
  type BuiltBuilding,
  type StructureBlock,
} from "./buildings.js";
import { buildDoorsteps } from "./doorsteps.js";
import { pavePlaza, type PlazaResult } from "./plaza.js";
import { buildProps, checkPropFluidSafety, type PlacedProp, type PropJob } from "./props.js";

import { buildRoadNetwork, type RoadNetworkResult, type RoadParams } from "./roads.js";
import { buildTunnels, type BuiltTunnel, type TunnelLink } from "./tunnels.js";

export * from "./buildings.js";
export * from "./doorsteps.js";
export * from "./plaza.js";
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
  /** Props built by `prop.place@0`. */
  readonly props: number;
  /** Prop nodes the placer could find no site for. */
  readonly propsUnplaced: number;
  /** Water blocks the props wrote that could flow. Zero is required. */
  readonly propWaterLeaks: number;
}

/** What the structure pass produced. */
export interface StructurePassResult {
  /** Blocks to stamp after the terrain columns are written. */
  readonly blocks: readonly StructureBlock[];
  readonly buildings: readonly BuiltBuilding[];
  readonly plaza?: PlazaResult;
  readonly roads?: RoadNetworkResult;
  readonly tunnels: readonly BuiltTunnel[];
  readonly props: readonly PlacedProp[];
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

  // --- what the tunnels imply ----------------------------------------------
  // Read *before* the buildings are generated, because a building at the end of
  // a tunnel needs a cellar whether or not it asked for one — the constraint
  // says the two are connected, and there is nowhere else for a gallery to end.
  const links = tunnelLinksOf(input.doc, rootPath);
  const needsCellar = new Set<string>();
  for (const link of links) {
    needsCellar.add(link.fromPath);
    needsCellar.add(link.toPath);
  }

  // --- buildings -----------------------------------------------------------
  const jobs: BuildingJob[] = [];
  const buildingPaths = new Set<string>();
  for (const placement of input.placements) {
    const node = byId.get(placement.nodePath);
    if (node?.generator !== "building.grammar@0") continue;
    buildingPaths.add(placement.nodePath);
    const params = (docNodes.get(placement.nodePath)?.params ?? {}) as Record<string, unknown>;
    const basement = resolveBasementParam(params["basement"], needsCellar.has(placement.nodePath));
    const wing = wingParamOf(params["wing"]);
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
        // The L and the T. Read through `wingParamOf`, which is where a
        // defective shape becomes `undefined` rather than an exception — the
        // profile validator is what tells the author about it, with a hint.
        ...(wing === undefined ? {} : { wing }),
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

  // --- the village theme ---------------------------------------------------
  // One theme for the settlement, drawn from the root node's seed, then one
  // distinct (wood, stone, roof) triple dealt to each building in document
  // order. Dealing centrally rather than per-building is what makes "no two
  // houses alike" a property of the village rather than a coincidence.
  const themeSeed: Seed256 = nodeSeed(input.worldSeed, rootPath, "");
  const theme: MaterialTheme = pickTheme(themeSeed, themeOverride(input.doc));
  const deal = assignMaterials(theme, jobs.length, themeSeed);
  const themed = jobs.map((job, i) => ({ ...job, materials: deal[i] as BuildingMaterials }));

  const buildings = buildBuildings(themed, input.plan, input.stack);
  diagnostics.push(...buildings.diagnostics);
  const blocks: StructureBlock[] = [...buildings.blocks];
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
    placements: input.placements,
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
      placements: input.placements,
      ports: input.ports,
      buildingPaths,
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
  for (const child of input.doc.root.children) {
    if (!isPropNode(child)) continue;
    const nodePath = `${rootPath}.${child.id}`;
    const params = (child.params ?? {}) as Record<string, unknown>;
    const seed: Seed256 = nodeSeed(input.worldSeed, nodePath, child.seedSalt ?? "");
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

  return {
    blocks,
    buildings: buildings.built,
    tunnels: tunnelPass.tunnels,
    props: props.placed,
    ...(plaza === undefined ? {} : { plaza }),
    ...(roads === undefined ? {} : { roads }),
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
      props: props.placed.length,
      propsUnplaced: propJobs.length - props.placed.length,
      propWaterLeaks: propFluids.leaks.length,
    },
  };
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
  const named = palettes?.["theme"];
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
    if (child.generator !== "building.grammar@0" && child.generator !== "road.network@0") continue;
    out.set(`${rootPath}.${child.id}`, child);
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

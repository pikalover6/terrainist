/**
 * `road.network@0` v0 — routing, grading and surfacing.
 *
 * The shape of the problem: the solver has already placed every building and
 * resolved its ports, and the terrain has already been levelled under each pad.
 * What is left is to *connect* them over ground that is still hilly, without
 * walking through water, through another building, or up a cliff.
 *
 * The algorithm is a **successive-shortest-path tree**:
 *
 * 1. pick a hub — the plaza's centre when there is one, else the largest
 *    building's approach;
 * 2. route each remaining anchor to the hub with A* over the post-pad
 *    heightfield, 4-connected, cost = base + slope + turn penalties, with
 *    water/lava and foreign footprints hard-forbidden;
 * 3. **discount cells that are already road**, and make the target of each
 *    later search the *whole* network built so far rather than the hub alone.
 *    That is what makes a village grow a spine with lanes joining it, instead
 *    of a star of parallel tracks all running to the middle.
 *
 * Then each route is *graded* — its elevation profile replaced with the tightest
 * 1-Lipschitz envelope that never rises more than two blocks above the natural
 * ground and never drops below the water table — and *surfaced*, which mutates
 * the column plan directly. Mutating the plan (rather than emitting blocks over
 * the top of it) is deliberate: it keeps the heightmap, the fluid validator and
 * the biome pass all looking at the same ground the player will walk on.
 */

import {
  Rng,
  streamSeed,
  type Region,
  type Seed256,
} from "@terrainist/stdlib";
import { note, warning, type LoamDiagnostic } from "@terrainist/spec";

import { buildBridgeKit } from "./bridge.js";
import { resolveBridgeStyles, type BridgeStyleSet } from "./bridge-styles.js";
import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import type { StreetGraph } from "../layout/streets.js";
// Type-only, and it must stay type-only: `layout/street-datum.ts` imports this
// module's kernels (`gradeProfile`, `index`, `clampX/Z`), so a *value* import
// back the other way would close a runtime cycle. A type import erases.
import type { StreetDatum } from "../layout/street-datum.js";
import type { OccupancyGrid, Placement, ResolvedPort } from "../layout/types.js";
import type {
  GroundClaim,
  GroundIntent,
  GroundView,
  ReadonlyInt32Array,
} from "../layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../layout/ground-driver.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { clusterCell, isSteepGround } from "../terrain/cluster.js";
import { detailSeed, hash2 } from "../terrain/detail.js";
import {
  STREET_CARRIAGEWAY_SYMBOL,
  STREET_CARRIAGEWAY_WORN_SYMBOL,
  STREET_COURSE_SYMBOL,
  STREET_KERB_SYMBOL,
  STREET_LANE_SYMBOL,
  STREET_MARKING_SYMBOL,
  streetMaterials,
  type Palette,
} from "../terrain/palette.js";

import type { StructureBlock } from "./buildings.js";
import {
  claimColumns,
  compareStreetRank,
  pinLevel,
  type StreetOwnerKind,
  type StreetRank,
} from "./street-owner.js";
import {
  dressStreetStairs,
  streetStairGeometry,
  streetStairLevels,
  streetStairRail,
  type StreetStairGeometry,
  type StreetStairLevels,
} from "./street-stairs.js";
import {
  arcFrame,
  arcLevels,
  MAX_TREAD_CUT,
  carriagewaySpans,
  simplifyPath,
  sweptColumns,
  type ArcFrame,
  type ArcLevels,
  type SweptColumn,
} from "./sweep.js";

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * True for the two roles the **tread law** lays rather than the grader.
 *
 * A flight of steps and a carriage spine (`docs/SITE-PLAN-v0.md` §3.6a) take the
 * identical path through all four phases of {@link surfaceStreetGraph} — the
 * same geometry, the same endpoint pins, the same whole-run refusal, the same
 * `street.network` declaration with `preserve` over the tread band. The one
 * thing that differs is which law computes the levels, and that is one flag
 * handed to `streetStairLevels`. Everything else asking "is this a flight?"
 * asks this instead, so the two can never drift apart.
 */
function isTreadRole(role: "carriageway" | "steps" | "cart"): boolean {
  return role === "steps" || role === "cart";
}

/** Cost of one flat step along virgin ground. */
export const ROAD_BASE_COST = 10;
/** Cost of one flat diagonal step — `ROAD_BASE_COST · √2`, rounded. */
export const ROAD_DIAGONAL_COST = 14;
/** Extra cost per block of vertical change. */
export const ROAD_SLOPE_COST = 8;
/** Extra cost for a 90° change of heading; a 45° kink costs half of it. */
export const ROAD_TURN_COST = 6;
/** Longest straight a smoothing pass will pull, in cells. */
export const ROAD_SMOOTH_REACH = 20;
/** Multiplier applied when stepping onto an existing road cell. */
export const ROAD_REUSE_DISCOUNT = 0.35;

/**
 * Multiplier applied inside this network's own reserved route corridor.
 *
 * §4.9.6 says pass-6 routing "MUST be a refinement *inside* those polygons",
 * and a stricter compiler would make the corridor a hard channel. This one
 * makes it a strong preference instead, and the reason is what the corridor is
 * built from: at substage 3b there is no placed geometry, so the polygon is
 * strung through the anchors' *coarse* target points — jittered zone centres —
 * with no knowledge of where the ground is steep, where the water is, or where
 * a building will end up standing. Forcing a lane to stay inside a guess of
 * that provenance turns an unroutable anchor into a diagnostic where a
 * fifteen-block excursion would have produced a road.
 *
 * What the discount does buy is the thing the corridor exists for: where two
 * lines are otherwise comparable, the lane takes the one the buildings were
 * placed against, so `along` houses face a street that is actually there.
 *
 * Deliberately weaker than {@link ROAD_REUSE_DISCOUNT}: sharing tarmac with an
 * existing lane is a real economy, and staying in the reservation is a
 * preference, and the router should not confuse the two.
 */
export const ROAD_CORRIDOR_DISCOUNT = 0.7;
/** Blocks between lantern posts. */
export const ROAD_LANTERN_SPACING = 14;

/**
 * How far above natural ground a graded route may sit — the **cut bias**.
 *
 * This was 2, and 2 is why the first village's lanes read as dikes: the cone
 * envelope roots every apex at `ground + band`, so on flat ground the whole
 * lane sits `band` blocks *above* the field it crosses and shows a vertical
 * face of that height on both sides for its entire length. A road is a thing
 * cut into the land, not a causeway laid on top of it, and the grading should
 * prefer to remove material rather than add it.
 *
 * At 1 the profile is biased downward — the apex is one block over natural
 * ground, so the envelope's minimum almost always lands *at or below* it — and
 * any fill face that does survive is capped at one block by construction,
 * which is the property {@link gradeProfile}'s test asserts. What smooths over
 * the remaining edges is {@link blendShoulders}, not a taller embankment.
 *
 * At **0** it is not biased downward, it is *flush*: the envelope's apex is
 * natural ground, so `min_j (ground[j] + |i − j|) ≤ ground[i]` holds
 * everywhere and a lane is only ever cut into the land, never laid on it. One
 * was still one too many — a walkthrough of the first village reported the
 * lanes as raised causeways with a cobble kerb showing a full block of face
 * beside the grass, which is exactly what a uniform `+1` apex builds on flat
 * ground. The road surface block now *replaces* the terrain's top block in its
 * column, which is what "a path worn into a field" means.
 */
export const ROAD_FILL_BAND = 0;

/**
 * The deepest a **tied** carriageway may cut below its own natural ground at
 * any station — `docs/GROUND-UNIFICATION-v0.md` F9.
 *
 * `gradeProfile`'s doc-comment states the gap plainly: "Fill is capped at
 * `band` by construction. **Cut is not** — a route crossing a narrow gully digs
 * as deep as the gully." Under F1 the carriageway is the ground authority, so
 * that cut is inherited by every lot on the street: a street that digs six
 * blocks through a saddle drags a whole terrace of frontages down with it.
 * Capping it turns the dig into a **break** — the floor holds the profile up,
 * `gradeProfile`'s 1-Lipschitz envelope then has to step down to reach it, and
 * `ArcLevels.steps` already dresses a stepping station as a tread. A street on
 * a hill becomes a flight, which is what a street on a hill is.
 *
 * **The measurement (§13.8 tradition, pinned beside the constant).** §3.1's
 * forensics verdict: there was no walked berm to measure — the walked earthwork
 * was `infra.entry@0`'s wall course, not a graded route — so the road-relief
 * family is set from *hazard geometry*, and `ROAD_BERM_MAX` landed at **2**,
 * "a step and a half, the point past which a raised road reads as an
 * earthwork". F9 sets this constant from that same measurement: a carriageway
 * standing 2 blocks proud of its ground reads as an embankment, and one sunk 2
 * blocks into it reads as a cutting. Above that the street stops being ground
 * and becomes civil engineering.
 *
 * **How this divides with the lot cut cap.** `FRONTAGE_CUT_MAX = RETAIN_MAX`
 * (6, `layout/types.ts`) is the *lot's* budget: the deepest face the retaining
 * table will build, so a tied lot can never ask for a wall the wall pass
 * refuses. The two caps stack rather than compete — the street stays within 2
 * of the natural ground it runs over, and each lot may then cut up to 6 further
 * into the hill *behind* its frontage. The street's cap is the tighter one
 * precisely because its cut is inherited by every lot on it, while a lot's cut
 * is spent by that lot alone and is answered by a wall the lot pays for.
 *
 * **Live only on the datum path.** The cap is applied where a segment carries a
 * {@link StreetSurfaceInput.datums} profile, which is where F1's inheritance
 * exists. The arterial path, the `road.network@0` path and every ungraded-datum
 * street keep the uncapped cut they have always had, so `FRONTAGE_TIE = false`
 * is byte-identical. Wave 8F revisits the number on walk evidence.
 */
export const STREET_CUT_MAX = 2;

/**
 * How far above its own natural ground a graded route may be *lifted by a
 * floor* — `docs/GROUND-UNIFICATION-v0.md` §3.1, W1/W2. The mirror of
 * {@link STREET_CUT_MAX}: that one caps the dig, this one caps the fill.
 *
 * **The measurement (§13.8 tradition, pinned beside the constant).** §3.1's
 * forensics verdict: **there was no walked berm to measure.** The earthwork on
 * the walked world was `world.unicorn_defense_terrace`, an `infra.entry@0`
 * (`acropolis_terrace`, sourceClass `retaining.seam`, `ACROPOLIS_LIFT = 6`,
 * `follow: "step"` → `sweepDatum`), so neither {@link gradeProfile} nor
 * {@link routeFloorAt} ever ran on it; its `deriveWallCourse` ring crossed the
 * sacred lake and filled 208 of the lake's 791 above-sea water columns. The
 * predicted `routeFloorAt` symptom was *absent* there — no fill cluster along
 * any street near the lake — so the `b9f808d` floor is **exonerated on the
 * walked evidence**. The cone-propagation hazard is nonetheless confirmed real
 * by instrumentation: a rim floor of 95 propagates 94, 93, 92 … along the
 * profile, so a route leaving a tarn onto ground 6 lower builds an embankment
 * up to 6 stations long. With no berm to measure, the constant is set from the
 * hazard geometry: **2** — "a step and a half, the point past which a raised
 * road reads as an earthwork", the same number F9 reads for the cut.
 *
 * Per §3.1's reconciliation rule the pre-envelope clamp in {@link routeFloorAt}
 * is the load-bearing half; {@link bermExcursion} is W2, a cheap assertion.
 */
export const ROAD_BERM_MAX = 2;

/**
 * Extra cost for a cell that touches a building's perimeter.
 *
 * A* has no opinion about walls: a lane that grazes a smithy for fifteen cells
 * costs exactly what the same lane one block further out costs, so the
 * tie-break decides, and half the time the tie-break picks the wall. From the
 * ground the result is a road that scrapes along the side of a building and
 * then turns away from its door, which no village has ever looked like.
 *
 * The penalty is deliberately soft — three flat steps — because it must lose
 * to genuine geometry: squeezing between two houses is sometimes the only way
 * through, and the router should still take it rather than declare the anchor
 * unroutable. It only has to break ties.
 */
export const ROAD_WALL_HUG_COST = 30;

/** How far a building's perimeter reaches when charging {@link ROAD_WALL_HUG_COST}. */
export const ROAD_WALL_HUG_REACH = 1;

/**
 * How many cells of the final approach are forced straight out from the door.
 *
 * The corridor is exempt from the wall-hug penalty (a road *must* touch the
 * building it serves) and the stub is prepended to the search result rather
 * than searched for, so the lane always meets the door face square on instead
 * of sidling up to it diagonally.
 */
export const ROAD_APPROACH_CELLS = 3;

/**
 * One-off cost of leaving dry land for water, and the cost of each further
 * water cell.
 *
 * Together these are the bridge threshold, expressed the way the router can
 * actually use it: crossing an `n`-cell channel costs
 * `ROAD_BRIDGE_ENTRY + n · ROAD_WATER_COST`, so a crossing is taken exactly
 * when going round would cost more than that. At these numbers a ten-block
 * river is worth about 240 blocks of detour — which is the right answer for a
 * village on one bank and a cottage on the other, and the wrong answer for a
 * pond you can walk around, which is the distinction that matters.
 */
export const ROAD_BRIDGE_ENTRY = 1200;
/** Cost of one further cell out over water. */
export const ROAD_WATER_COST = 120;

/**
 * The widest water a bridge may span, in cells.
 *
 * Not a cost — a hard limit, and the difference is the point. A cost says "a
 * lake is expensive"; a limit says "you do not bridge a lake", which is what
 * stops the router from answering a hard routing problem with a four-hundred
 * block viaduct. A cell is bridgeable when the water run through it is at most
 * this long along one of the two axes, which is exactly "there is a near bank
 * in some direction".
 */
export const ROAD_BRIDGE_MAX_SPAN = 22;

/** How many columns either side of a lane are graded into it. */
export const ROAD_SHOULDER_REACH = 2;

/** Widths this v0 surfaces. */
export const ROAD_MIN_WIDTH = 2;
export const ROAD_MAX_WIDTH = 3;

/** The `road.network@0` params this v0 reads. */
export interface RoadParams {
  /** Surfaced width, 2..3. */
  readonly width?: number;
  /** Plant fence-post lanterns along the routes. Default `true`. */
  readonly lanterns?: boolean;
  /** Blocks between lantern posts. Default {@link ROAD_LANTERN_SPACING}. */
  readonly lanternSpacing?: number;
  /**
   * The bridge style every crossing of this network is built in —
   * `stone_bridge`, `timber_bridge`, `suspension_bridge` (or the bare
   * `stone` / `timber` / `suspension`).
   *
   * Omitted, each span picks its own by length: see `selectBridgeStyle`.
   */
  readonly bridgeStyle?: string;
}

/** One anchor the network must reach. */
export interface RoadAnchor {
  readonly nodePath: string;
  /** The column the route starts from — one block outside the footprint. */
  readonly x: number;
  readonly z: number;
  /** The port's outward normal — the direction the final approach must run. */
  readonly nx: number;
  readonly nz: number;
  /** Footprint area, used only to pick the hub deterministically. */
  readonly area: number;
}

/** Everything {@link buildRoadNetwork} reads. */
export interface RoadNetworkInput {
  readonly nodePath: string;
  readonly params: RoadParams;
  readonly seed: Seed256;
  /** Mutated in place: surface, subsurface and soil along each route. */
  readonly plan: ColumnPlan;
  /**
   * The ground contract's driver (`docs/GROUND-CONTRACT-v0.md` §9a).
   *
   * See {@link StreetSurfaceInput.ground}: every level goes through `commit`, and
   * the only callers that omit it are the unit tests that route a network on a
   * bare plan.
   */
  readonly ground?: GroundDriver;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Every placed node — buildings supply anchors, the plaza supplies the hub. */
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  /** The plaza's placement, when the document has one. */
  readonly plaza?: Placement;
  /**
   * Columns the plaza pass has already surfaced.
   *
   * Routes cross them freely — the green is where the lanes are *going* — but
   * they are graded to the plaza's own level rather than lifted onto the fill
   * band, and their paving is left alone. Without this a lane runs straight
   * across the square two blocks up and cuts it in half.
   */
  readonly paved?: Uint8Array;
  /** Columns no route may enter even though they are on the plaza — the well. */
  readonly keepClear?: Uint8Array;
  /** Node paths that are buildings (their footprints are hard obstacles). */
  readonly buildingPaths: ReadonlySet<string>;
  /**
   * Node paths the network must actually *reach*. Defaults to `buildingPaths`.
   *
   * The two lists came apart when districts arrived. A district's infill is
   * hundreds of buildings, every one of them with a door — and every one of
   * them already on a street, because that is what the fabric pass is for.
   * Routing a lane from each of them to the village hub would cut the district
   * to ribbons and cost an A* search per house. They stay obstacles; they stop
   * being destinations.
   */
  readonly anchorPaths?: ReadonlySet<string>;
  /** Updated with a `road` tag for every surfaced column. */
  readonly occupancy?: OccupancyGrid;
  /**
   * 1 for a column inside this network's own frozen route corridor (§4.9.6).
   *
   * A **preference**, not a channel: cells inside it are discounted by
   * {@link ROAD_CORRIDOR_DISCOUNT}, exactly the way an existing road cell is,
   * and the router is otherwise free to leave. See the constant for why the
   * corridor is not a hard bound.
   */
  readonly corridor?: Uint8Array;
}

/**
 * The only thing the router actually reads off a column plan.
 *
 * Narrowed from `ColumnPlan` on purpose, and it is the whole reason C1's city
 * plan can reuse this router rather than grow a second one: arterials are
 * routed in the **layout** stage, where the composed heightfield exists and the
 * column plan does not. Every caller that has a real `ColumnPlan` still passes
 * one — it satisfies this shape structurally.
 */
export type RouteGround = { readonly ground: Int32Array };

/** One routed road. */
export interface RoadRoute {
  readonly from: string;
  readonly to: string;
  /** Centre-line columns, from the anchor to the network. */
  readonly path: readonly { readonly x: number; readonly z: number; readonly y: number }[];
  readonly cost: number;
}

/** What the road pass produced. */
export interface RoadNetworkResult {
  readonly blocks: readonly StructureBlock[];
  readonly routes: readonly RoadRoute[];
  /** Every column the network surfaced. */
  readonly surfacedColumns: number;
  /**
   * 1 on every column that counts as road — surfaced lane, shoulder, bridge
   * deck and the plaza cells a route crossed. Row-major over the plan region.
   *
   * Handed out so a later ground pass can meet a lane without guessing where
   * one is: F2's lot aprons abut it and its worn paint fans out from it.
   */
  readonly roadColumns: Uint8Array;
  /** Of those, the columns carried on a bridge deck over water. */
  readonly bridgeColumns: number;
  /** The surfaced width the pass used, for the canopy clip. */
  readonly width: number;
  readonly diagnostics: readonly LoamDiagnostic[];
  /** Anchors that could not be reached. */
  readonly unrouted: readonly string[];
  /**
   * What this pass would declare under the ground contract
   * (`docs/GROUND-CONTRACT-v0.md` §3.9b), recorded as it surfaces.
   *
   * A **return value only**, read by WP-2's shadow declarers
   * (`structures/ground-declare.ts`).
   */
  readonly declaration: RoadDeclaration;
}

/** The raw material of §3.9b's intents. */
export interface RoadDeclaration {
  /** One `road.network` profile per route, over the columns it levelled. */
  readonly routes: readonly {
    readonly source: string;
    readonly columns: readonly GroundClaim[];
    /** Water columns a deck spans: `clearance` at the fluid surface, plus `preserve`. */
    readonly bridged: readonly GroundClaim[];
  }[];
  /** `blendShoulders`' ring targets, declared `verge` exactly as §3.6b's are. */
  readonly shoulders: readonly GroundClaim[];
}

/* -------------------------------------------------------------------------- */
/* anchors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The approach column of one placement: the port's position stepped one block
 * along its outward normal, so the route starts outside the wall it leaves.
 *
 * `road_stub` wins over `door` — a building that declares both wants its
 * traffic on the stub. With neither, the placement contributes no anchor.
 */
export function approachOf(
  placement: Placement,
  ports: readonly ResolvedPort[],
): RoadAnchor | null {
  const mine = ports.filter((p) => p.nodePath === placement.nodePath);
  const port = mine.find((p) => p.type === "road_stub") ?? mine.find((p) => p.type === "door");
  const area =
    (placement.footprint.x1 - placement.footprint.x0 + 1) *
    (placement.footprint.z1 - placement.footprint.z0 + 1);
  if (port === undefined) return null;
  const nx = Math.sign(port.outwardNormal[0]);
  const nz = Math.sign(port.outwardNormal[2]);
  return {
    nodePath: placement.nodePath,
    x: port.position[0] + port.outwardNormal[0],
    z: port.position[2] + port.outwardNormal[2],
    nx,
    nz,
    area,
  };
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** Route, grade and surface the whole network. */
export function buildRoadNetwork(input: RoadNetworkInput): RoadNetworkResult {
  const { plan, occupancy } = input;
  const { region } = plan;
  const cells = region.width * region.depth;
  const driver = input.ground ?? driverForPlan(plan);
  const view = driver.view();

  const width = clampInt(Math.round(input.params.width ?? 3), ROAD_MIN_WIDTH, ROAD_MAX_WIDTH);
  const spacing = Math.max(4, Math.round(input.params.lanternSpacing ?? ROAD_LANTERN_SPACING));
  const wantLanterns = input.params.lanterns !== false;

  const water = buildBridgeableMask(plan);
  const blocked = buildBlockedMask(input, water);
  const paved = input.paved ?? new Uint8Array(cells);
  const road = new Uint8Array(cells);
  const roadY = new Int32Array(cells);
  const bridged = new Uint8Array(cells);

  const diagnostics: LoamDiagnostic[] = [];
  const routes: RoadRoute[] = [];
  const unrouted: string[] = [];
  /** §3.9b, recorded as the routes are surfaced. Never read here. */
  const declaredRoutes: RoadDeclaration["routes"][number][] = [];
  const blocks: StructureBlock[] = [];

  // --- anchors, in document order ------------------------------------------
  const anchorPaths = input.anchorPaths ?? input.buildingPaths;
  const anchors: RoadAnchor[] = [];
  for (const placement of input.placements) {
    if (!anchorPaths.has(placement.nodePath)) continue;
    const anchor = approachOf(placement, input.ports);
    if (anchor === null) continue;
    if (!inside(region, anchor.x, anchor.z)) continue;
    anchors.push(anchor);
  }

  // --- the hub -------------------------------------------------------------
  const hub = pickHub(input, anchors, region, blocked);
  if (hub === null || anchors.length === 0) {
    return {
      blocks,
      routes,
      surfacedColumns: 0,
      bridgeColumns: 0,
      roadColumns: road,
      width,
      diagnostics,
      unrouted,
      declaration: { routes: [], shoulders: [] },
    };
  }
  const hubIdx = index(region, hub.x, hub.z);
  road[hubIdx] = 1;
  // …and its level, which is the ground it stands on until a route surfaces
  // through it. `roadY` is zero-initialised, and a hub nothing routes to keeps
  // that zero: `blendShoulders` would then seed its dilation at y=0 and grade
  // the five-by-five around it down toward bedrock, leaving a sheer shaft with
  // an unclaimed natural pillar at its centre. Wherever a route *is* surfaced
  // this write is overwritten by `surfaceRoute` before anything reads it, so
  // the fix is invisible on every world that routes.
  roadY[hubIdx] = view.ground[hubIdx] as number;

  const wallHug = buildWallHugMask(
    region,
    input.placements,
    input.buildingPaths,
    anchors,
    ROAD_APPROACH_CELLS,
    width,
  );

  const states = resolveRoadStates(input.palette, input.stack, input.params.bridgeStyle);
  const rng = new Rng(streamSeed(input.seed, "grammar"));
  const lanternSide = new Map<string, number>();

  for (const anchor of anchors) {
    if (anchor.nodePath === hub.nodePath) continue;
    // The straight stub out of the door. Searching *from its far end* and
    // pasting the stub back on is what makes the approach perpendicular: A*
    // never gets the chance to sidle up to the door face diagonally, because
    // by the time it has any freedom the lane is already three cells clear of
    // the wall and pointing away from it.
    const stub = doorStub(region, blocked, road, anchor);
    const head = stub[stub.length - 1] ?? { x: anchor.x, z: anchor.z };
    const start = freeCellNear(region, blocked, road, head.x, head.z);
    if (start === null) {
      unrouted.push(anchor.nodePath);
      diagnostics.push(unroutable(input.nodePath, anchor.nodePath, hub.nodePath, "its approach column is blocked"));
      continue;
    }

    const found = routeTo(region, blocked, road, plan, start, {
      water,
      wallHug,
      ...(input.corridor === undefined ? {} : { corridor: input.corridor }),
    });
    if (found === null) {
      unrouted.push(anchor.nodePath);
      diagnostics.push(unroutable(input.nodePath, anchor.nodePath, hub.nodePath, "no legal path exists"));
      continue;
    }
    // Smooth first, grade second: the elevation profile has to belong to the
    // cells that will actually be surfaced, or the lane steps where the route
    // no longer goes.
    const smoothed = smoothRoute(region, blocked, road, plan, found, ROAD_SMOOTH_REACH, water);
    // The stub is prepended *after* smoothing, so the smoother cannot pull a
    // straight through it and undo the perpendicular arrival.
    const path = joinStub(stub, smoothed);

    // Graded on the arc frame, for the reason {@link ArcFrame} gives: a lane's
    // height is a function of how far along the lane you are, and the raster is
    // only a drawing of that. A lane routed 8-connected is less distorted than a
    // 4-connected street — a diagonal step is one cell and √2 of arc — but the
    // grade cap still has to mean one block of rise per block of ground, and a
    // cross-section still has to be level across the lane's width.
    const frame = arcFrame(path);
    const spots = sweptColumns(region, path, carriagewaySpans(width).lanes, { line: frame.line });
    const at = (p: { x: number; z: number }): number =>
      index(region, clampX(region, p.x), clampZ(region, p.z));
    // The shore floor is asked over the whole cross-section, not the centreline
    // this profile is graded on. {@link routeFloorAt}.
    const sectionReach = carriagewaySpans(width).outer + 1;
    // W1's counter, reported as `LOAM-T239` below.
    const bites = { clamped: 0, worst: 0 };
    const levels = arcLevels(
      frame,
      gradeProfile(
        // §9 step 9: the level-deciding read is the view — the plan at this
        // route's own position, which already carries the routes committed
        // before it.
        frame.stations.map((p) => view.ground[at(p)] as number),
        plan.seaLevel,
        frame.stations.map((p) => (paved[at(p)] === 1 ? 0 : ROAD_FILL_BAND)),
        // A deck clears the water it spans; a shore cell keeps the rim of the
        // water beside it. {@link routeFloorAt}.
        frame.stations.map((p) =>
          routeFloorAt(view, water, at(p), plan.seaLevel, true, sectionReach, bites),
        ),
      ),
    );
    if (bites.clamped > 0) {
      diagnostics.push(
        note(
          "ROAD_BERM_CLAMPED",
          `${input.nodePath} → ${anchor.nodePath}`,
          `the water floor asked this route to stand above its own natural ground at ${bites.clamped} of ${frame.stations.length} station(s), by up to ${bites.worst + ROAD_BERM_MAX} block(s); clamped to ${ROAD_BERM_MAX} so the rim's lift could not propagate along the profile`,
          `No change needed — the lane keeps the rim it is beside and drops back to the ground it crosses. A run that wants this at most of its stations is a span rather than a road.`,
        ),
      );
    }
    const surfaced: { x: number; z: number; y: number }[] = [];
    for (const [i, cell] of path.entries()) {
      surfaced.push({ x: cell.x, z: cell.z, y: levels.at(frame.pathArc[i] as number) });
    }

    // §3.9b — one `road.network` profile per route over its swept columns at the
    // graded profile, `transition: "none"`; the bridged columns get the same
    // `clearance` + `preserve` a street's deck does. Committed **before** the
    // route is dressed and before the next route is routed, because the next
    // route's A* and its grade both read the ground this one settled.
    //
    // Routing order, later-wins: `surfaceRoute` has no "already surfaced" guard,
    // so where two lanes share a column the pipeline's level is the last route's.
    // Negative because lower wins (§4.1); without it the winner would be whichever
    // route's source string sorted first — measured on `hillside-village` at 5
    // columns, up to 4 blocks, decided by alphabetical accident.
    const source = `${input.nodePath}#route@${anchor.nodePath}→${hub.nodePath}`;
    const subRank = -declaredRoutes.length;
    const claimed = declareRoute(view, blocked, spots, levels, paved, water);
    // Before the commit: the relief test sees the land this lane is cut into.
    const steep = reliefOf(region, view.ground, spots);
    driver.commit(routeIntents(source, subRank, claimed));
    declaredRoutes.push({ source, columns: claimed.level, bridged: claimed.bridged });
    surfaceRoute(region, plan, blocked, road, roadY, spots, width, levels, states, occupancy, paved, water, bridged, steep);
    blocks.push(
      ...buildBridgeKit(
        region,
        plan,
        surfaced,
        width,
        { deck: states.deck, post: states.post, pier: states.pier, styles: states.bridge },
        water,
      ).blocks,
    );

    routes.push({
      from: anchor.nodePath,
      to: hub.nodePath,
      path: surfaced,
      cost: path.length,
    });
  }

  // --- shoulders, after every route is graded -----------------------------
  // A verge blended against a lane that a later route then re-cuts is a verge
  // blended to the wrong height, so this waits for every route.
  //
  // And it waits for every *other* pass's road too. The street surfacer runs
  // before this one and tags every column it laid on the occupancy grid, and
  // those columns are not in this pass's own `road` mask — so without this the
  // village blend was free to drop a column a district street had already
  // surfaced, which is the same "moves the height, never the surface block"
  // defect §2.4 fixes inside the surfacer: a street left standing proud of its
  // own kerb, and anything the surfacer stood on that column (a stair
  // balustrade, a lamp) left hanging over the drop.
  const foreign = occupancy?.byTag.get("road");
  const keepOut = foreign === undefined ? blocked : new Uint8Array(blocked);
  if (foreign !== undefined) {
    for (let k = 0; k < cells; k++) if (foreign[k] === 1) keepOut[k] = 1;
  }
  const declaredShoulders = blendShoulders(
    region,
    plan,
    view,
    driver,
    "road#shoulders",
    road,
    roadY,
    keepOut,
    paved,
  );

  // --- lanterns, dead last -------------------------------------------------
  // A post planted while routes were still being laid could have a later route
  // regrade the ground out from under it, which is how the first village ended
  // up with nine lanterns hanging in mid-air. Moving the planting after routing
  // fixed those and left a subtler version of the same bug: a lamp stands one
  // column *off* the lane, which is precisely a shoulder column, and
  // `blendShoulders` rewrites `plan.ground` there. Where the east lane cut down
  // the lip of a gorge the blend dropped the shoulder twelve blocks and left
  // the post it had already planted hanging over the drop. Planting is now the
  // last thing the pass does, so `plan.ground` is the ground the emitter will
  // actually lay.
  if (wantLanterns) {
    for (const route of routes) {
      plantLanterns(region, plan, road, blocked, route.path, width, spacing, states, blocks, rng, lanternSide);
    }
  }

  let surfacedColumns = 0;
  let bridgeColumns = 0;
  for (let k = 0; k < cells; k++) {
    if (road[k] === 1) surfacedColumns++;
    if (bridged[k] === 1) bridgeColumns++;
  }

  return {
    blocks,
    routes,
    surfacedColumns,
    bridgeColumns,
    roadColumns: road,
    width,
    diagnostics,
    unrouted,
    declaration: { routes: declaredRoutes, shoulders: declaredShoulders },
  };
}

/**
 * §3.9b's intents for one route.
 *
 * `road.network` sits **below** `street.network`, which is inversion I2: the
 * router already discounts existing road cells so a lane *joins* the grid rather
 * than running alongside it, and the levels should join too. Today the road pass
 * runs after the district streets and overwrites the shared columns; under rank
 * it does not.
 */
function routeIntents(
  source: string,
  subRank: number,
  claimed: { readonly level: readonly GroundClaim[]; readonly bridged: readonly GroundClaim[] },
): GroundIntent[] {
  const out: GroundIntent[] = [];
  if (claimed.level.length > 0) {
    out.push({
      source,
      sourceClass: "road.network",
      kind: "profile",
      columns: claimed.level,
      transition: "none",
      subRank,
    });
  }
  if (claimed.bridged.length > 0) {
    out.push(
      {
        source: `${source}#deck`,
        sourceClass: "road.network",
        kind: "clearance",
        columns: claimed.bridged,
        transition: "none",
        subRank,
      },
      {
        source: `${source}#deck`,
        sourceClass: "road.network",
        kind: "preserve",
        columns: claimed.bridged,
        transition: "none",
        subRank,
      },
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* district streets (fabric v2, F1)                                            */
/* -------------------------------------------------------------------------- */

/**
 * The separator between a segment's own id and the graph that owns it.
 *
 * `"!"` (0x21) sorts below every character a form puts in a segment id — digits,
 * letters and `_` — which is the whole reason it was chosen. `compareStreetRank`
 * breaks its last tie on this string, so a separator *above* those characters
 * would reorder `ns0` against `ns00` and move blocks in worlds that have no
 * collision to fix. Below them, the qualified order restricted to one graph is
 * exactly the bare-id order, and a single-quarter world is byte-identical.
 */
export const SEGMENT_ID_SEPARATOR = "!";

/**
 * A street segment's id, qualified by the graph it belongs to.
 *
 * The one place the qualified id is spelled, so the surfacer that mints it and
 * the sidewalk declarer that looks it up cannot drift apart — drifting apart is
 * how the sidewalk silently fell back to the centre cell.
 *
 * @see StreetSurfaceInput.graphPaths
 */
export function qualifySegmentId(segmentId: string, graphPath: string): string {
  return `segment:${segmentId}${SEGMENT_ID_SEPARATOR}${graphPath}`;
}

/** Everything {@link surfaceStreetGraph} reads. */
export interface StreetSurfaceInput {
  /** The skeletons to surface, one per district, in document order. */
  readonly graphs: readonly StreetGraph[];
  /**
   * The node path each graph belongs to, parallel to
   * {@link StreetSurfaceInput.graphs} — **what makes a segment id unique.**
   *
   * A {@link StreetGraph}'s segment ids are named by the *form* that drew it and
   * are therefore only unique inside their own district: every `grid` quarter in
   * every document calls its runs `ns0…`/`ew0…`, so two quarters in one world
   * name the same segments. Until this array existed the surfacer built its rank
   * ids — and therefore its {@link StreetSegmentDeclaration.source} strings, which
   * §4.1 requires to be unique — out of that id alone, and two districts collided:
   * the total order in {@link compareStreetRank} stopped being total, and the
   * arc-levels map keyed on those sources in `structures/index.ts` kept only the
   * *last* district's frames. The sidewalk declarer then graded one quarter's
   * bands to another quarter's levels, which on two islands at different heights
   * is a paved trench several blocks under its own carriageway.
   *
   * Absent (or short) at a position falls back to the graph's index, which keeps
   * the ids unique for the unit tests that surface a bare graph. Nothing but the
   * uniqueness is read: {@link qualifySegmentId} appends it after the segment's
   * own id behind a separator that sorts below every character an id can carry,
   * so the rank order within a graph is exactly the order the bare ids gave.
   */
  readonly graphPaths?: readonly string[];
  /**
   * The street datum of each graph, parallel to {@link StreetSurfaceInput.graphs}
   * — `docs/GROUND-UNIFICATION-v0.md` F2/F8.
   *
   * > `surfaceStreetGraph` does not re-grade a segment that carries a datum. It
   * > takes the datum as its profile and applies exactly one further
   * > constraint: the per-station water floor (`routeFloorAt`), maxed in
   * > through `gradeProfile`'s existing floor envelope.
   *
   * This is the demotion F8 describes: the surfacer stops being a **grader** of
   * the segments it is handed a datum for and becomes their **consumer**. The
   * levels the lots were seated against in `layDistrict` and the levels the
   * street is actually built at are then one number rather than two numbers
   * that usually agree, which is the whole of F2.
   *
   * A datum reaches this pass riding on `DistrictProduct.datum`, which already
   * crosses `terrain/compile.ts` into `buildStructures`; `structures/index.ts`
   * lines the array up with `graphs`. Absent entries — and an absent array — are
   * the ungraded case and grade exactly as they always did.
   *
   * **Nothing else consumes it.** There is no arterial datum and no
   * `road.network@0` datum: an arterial is drawn by the city armature and a
   * lane is routed by A*, neither has a `StreetGraph` to grade, and F1's
   * inheritance therefore does not exist on either path. Both are provably
   * unmoved by this field — see `test/roads-datum.test.ts`.
   */
  readonly datums?: readonly (StreetDatum | undefined)[];
  /**
   * C1's city arterials, surfaced through this same pass and deliberately so.
   *
   * An arterial is a street that happens to be eleven columns wide: it wants
   * the same grade, the same materials and the same shoulder blend a street
   * gets, and forking a third surfacing path would be the third place a change
   * of road palette has to be made. It was for a long time the only thing that
   * got a **bridge deck**, on the grounds that a district's grid never crosses
   * water and a city's drive is expected to. The `canal` form ended that: a
   * quarter that carries a channel decks its own crossings, on exactly the same
   * kit, and the segment loop below says so.
   */
  readonly arterials?: readonly {
    readonly id: string;
    readonly width: number;
    readonly path: readonly { readonly x: number; readonly z: number }[];
  }[];
  /** Mutated in place, exactly as the road pass mutates it — materials only. */
  readonly plan: ColumnPlan;
  /**
   * The ground contract's driver (`docs/GROUND-CONTRACT-v0.md` §9a).
   *
   * Every level this pass decides goes through `commit`; nothing here writes
   * `plan.ground` any more. Omitted only by callers that are not the pipeline —
   * the unit tests that surface a graph on a bare plan — which then get a driver
   * of their own over the plan as it stands (`driverForPlan`). `buildStructures`
   * always supplies the one driver the whole compile accumulates into.
   */
  readonly ground?: GroundDriver;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Footprints no street may cut into — every building, district or not. */
  readonly placements: readonly Placement[];
  readonly buildingPaths: ReadonlySet<string>;
  readonly occupancy?: OccupancyGrid;
  /**
   * The settlement's material theme id, which chooses the street materials
   * when the document declares no `street.*` symbols of its own.
   */
  readonly theme?: string;
  /** @see RoadParams.bridgeStyle — a street's canal crossings read the same knob. */
  readonly bridgeStyle?: string;
  /**
   * Per-district street theme ids, parallel to {@link StreetSurfaceInput.graphs}
   * — **F10**.
   *
   * Streets used to take the settlement *root* theme everywhere, so a quarter
   * that named its own `character.materialTheme` got its buildings in one family
   * and its road in another's. A quarter listed here is surfaced from its own
   * theme's street family instead.
   *
   * `undefined` at a position — and an omitted array — means "the root theme",
   * which is every district of every single-theme world, so those worlds keep
   * resolving through exactly the path they always did, `style.palettes`
   * overrides included. A district whose entry *differs* from the root
   * deliberately stops consulting the palette's `street.*` symbols: a root-level
   * override would otherwise silently defeat the theme the district asked for,
   * which is the same defect one level down.
   */
  readonly graphThemes?: readonly (string | undefined)[];
  /** Node seed the wear mix and the dash phase hang off. */
  readonly seed?: Seed256;
  /**
   * Share of carriageway columns painted in the worn tone, 0..1.
   *
   * The `roads.wearIntensity` fan-out row's landing place. Omitted means
   * {@link STREET_WEAR_CHANCE} — the value the pass used before the intent
   * layer existed, which is what makes a no-intent compile byte-identical.
   */
  readonly wearChance?: number;
  /**
   * 1 on every column a retaining wall holds, row-major over the plan's region
   * (`docs/COURTYARDS-AND-LEVELS-v0.md` §2.4).
   *
   * Handed to {@link blendShoulders}, which never writes a column marked in it:
   * a column where the ground changes level by more than the ring allowance is
   * not a bank to be smoothed, it is a **face**, and §3.4 owns what stands on
   * it. Omitted by every caller that built no wall, which is every document
   * written before Phase 4.2, so the pass is unmoved by its presence.
   */
  readonly seam?: Uint8Array;
  /**
   * The street break-up (RUINS-PLAN-v0 §7.3), or absent when nothing broke.
   *
   * Above `decline ≥ 0.8` a share of carriageway columns goes past *worn* to
   * **broken**: the paving is replaced by soil, and the ground pass grows the
   * volunteer green on top of it. This is what turns a grid of clean roads
   * between ruins into P4's street-grid remnants.
   *
   * It stays a **surface** change, by law (§13.3): no linework client learns a
   * collapse mode, the levels are untouched, and every broken column is still
   * a road the walkability audit can walk down.
   */
  readonly breakUp?: StreetBreakUp;
}

/** §7.3's break-up, as the surfacer takes it. */
export interface StreetBreakUp {
  /**
   * Share of carriageway columns broken back to soil at the hottest part of
   * the ruin field, 0..1 — the `decay.streetBreak` row's landing place.
   */
  readonly chance: number;
  /** The per-column ruin field; the break clusters where the buildings fell. */
  readonly ruinField: Float32Array;
}

/**
 * How much of the break-up happens away from a ruined lot.
 *
 * Not zero: a dead city's streets are broken everywhere, not only outside the
 * shells that happen to have fallen. Not one either — the field is what makes
 * the worst ground line up with the worst buildings, which is the difference
 * between a ruined quarter and a uniformly scruffy one.
 */
/* 0.5 is the ratified value: default chosen under the never-wait rule,
 * 2026-08-14; revisit on walk evidence. */
export const STREET_BREAK_FLOOR = 0.5;

/** Hash salts for the break draw and the soil it picks — positional only. */
const STREET_BREAK_SALT = 0x6b;
const STREET_BREAK_MIX_SALT = 0x6c;

/** What the street surfacing wrote. */
export interface StreetSurfaceResult {
  readonly blocks: readonly StructureBlock[];
  readonly surfacedColumns: number;
  /** 1 for a column this pass surfaced, row-major over the plan's region. */
  readonly road: Uint8Array;
  /** Of those, columns carried on an arterial bridge deck over water. */
  readonly bridgeColumns: number;
  /** Arterial carriageway columns, of the total. */
  readonly arterialColumns: number;
  /**
   * 1 on every carriageway column §7.3's break-up took back to soil.
   *
   * Absent when the document asked for no break-up, which is every document
   * below `decline 0.8` and every document with no `decline` at all.
   */
  readonly broken?: Uint8Array;
  /**
   * What this pass would declare under the ground contract
   * (`docs/GROUND-CONTRACT-v0.md` §3.6b, and §3.7b's flights folded into it),
   * recorded as it runs.
   *
   * A **return value only**, read by WP-2's shadow declarers
   * (`structures/ground-declare.ts`) — and by the sidewalk declarer, which is
   * why {@link StreetSegmentDeclaration.frame} and `levels` are handed out: a
   * sidewalk's level is the flanking carriageway's **arc-station** level, not
   * the `plan.ground` of a centre cell, and that difference is inversion I6.
   */
  readonly declaration: StreetDeclaration;
  /**
   * `LOAM-T237 FRONTAGE_TIE_DRIFT`, one per segment whose final level departed
   * from its datum (F8). **Absent, not empty**, when nothing drifted — which is
   * every compile with no datum at all — so a pass that was handed no datum
   * returns exactly the object it always returned.
   */
  readonly diagnostics?: readonly LoamDiagnostic[];
}

/** The raw material of §3.6–§3.8's intents. */
export interface StreetDeclaration {
  /** One entry per surfaced segment, in `compareStreetRank` order. */
  readonly segments: readonly StreetSegmentDeclaration[];
  /** `blendShoulders`' ring targets — a `verge` profile (§3.6b, last bullet). */
  readonly shoulders: readonly GroundClaim[];
}

/** One surfaced segment, as §3.6b declares it. */
export interface StreetSegmentDeclaration {
  /** `street:<rank id>` — unique within the class, as §4.1 requires. */
  readonly source: string;
  /** Position in the `compareStreetRank` sort. The class's `subRank`. */
  readonly subRank: number;
  readonly role: "carriageway" | "steps";
  /** The segment's own id, so a sidewalk can find the carriageway it flanks. */
  readonly id: string;
  /** Owned columns at the surfacer's own levels. */
  readonly columns: readonly GroundClaim[];
  /** Water columns under a deck: `clearance` at the fluid surface, plus `preserve`. */
  readonly bridged: readonly GroundClaim[];
  /**
   * True when something *stands* on this run — a stair balustrade or a bridge
   * rail — which is what §3.6b/§3.7b declare `preserve` over.
   */
  readonly preserve: boolean;
  /** The run's arc frame and levels, for the sidewalk's declarer. Steps carry none. */
  readonly frame?: ArcFrame;
  readonly levels?: ArcLevels;
}

/**
 * Grade and surface a district's streets.
 *
 * **Streets are roads geometrically, and are not roads materially.** They get
 * the same 1-Lipschitz grade, the same shoulder blend and the same occupancy
 * claim as a lane between two villages. What they do *not* share is the
 * surface: this pass used to write `@road.surface` and `@road.shoulder` on the
 * theory that "a player cannot tell the difference", and the first walk of the
 * headline city falsified that in about ten seconds — a downtown avenue was
 * dirt path with a gravel verge, exactly like a farm track. Streets are now
 * surfaced from the `street.*` material class (see {@link streetMaterials}),
 * chosen per segment by width class: avenues and streets get the carriageway
 * with its worn patching and, on avenues, a dashed centre line; lanes get the
 * rougher back-lane surface. The verge is the carriageway itself, not gravel —
 * inside a district the sidewalk band already covers that edge, and a gravel
 * fringe between tarmac and sidewalk is a seam nobody asked for.
 *
 * What they do not get is the router: a street's centre line was decided by the fabric pass
 * before a single building existed, which is the whole inversion — the road
 * pass finds its way *between* districts, and inside one the way was the first
 * thing drawn.
 *
 * Grading is nearly a formality here, and deliberately so: a district's own pad
 * levelled its ground before this pass ran, so the profile is flat and the
 * shoulder blend has nothing to do. It is run anyway, because a district on the
 * edge of its own apron is exactly where "nearly" stops being true.
 *
 * **The pass runs in four phases — claim, level, dress, furnish — each completing
 * over every segment of every graph before the next begins**
 * (`docs/COURTYARDS-AND-LEVELS-v0.md` §2). It used to be one loop that graded a
 * segment against `plan.ground` as it stood and wrote `plan.ground` back, which
 * made both the read and the write depend on document order: on stepped ground
 * that is pavement at two levels in one junction, blocks left proud of their
 * neighbours, and a stair flight whose landings move after it has been laid.
 *
 * 1. **Claim.** `plan.ground` is snapshotted into a frozen `natural` array, and
 *    every segment's swept columns are computed in {@link compareStreetRank}
 *    order, each taking the columns nobody wider, nobody with a stronger role and
 *    nobody with a lower id has taken. The column lists are kept, so the dress
 *    phase recomputes nothing.
 * 2. **Level.** Each segment's elevation profile is graded from `natural` —
 *    never from the mutating plan — with the columns it does *not* own pinned
 *    exactly to the level their owner chose ({@link pinLevel}).
 * 3. **Dress.** One walk in the original traversal order. The owner writes the
 *    geometry — ground, fluid top, snow, subsurface, soil, road tag and level —
 *    once, at the owner's level. **Painting keeps the old last-write-wins
 *    order**: every segment that claimed a column may still write
 *    `plan.surface`. Ownership decides geometry and deliberately not material,
 *    which is what makes a flat world provably unmoved: on levelled ground every
 *    owner's level and every non-owner's are the same number.
 * 4. **Furnish.** Only then: the centre lines, the stair balustrades and their
 *    lamps — anything that *stands on* a column rather than being one — and last
 *    of all the shoulder blend.
 */
export function surfaceStreetGraph(input: StreetSurfaceInput): StreetSurfaceResult {
  const { plan, occupancy } = input;
  const { region } = plan;
  const cells = region.width * region.depth;
  const driver = input.ground ?? driverForPlan(plan);
  const view = driver.view();

  const water = buildBridgeableMask(plan);
  const blocked = new Uint8Array(cells);
  for (let k = 0; k < cells; k++) {
    if (plan.fluidKind[k] !== FluidKind.NONE) blocked[k] = 1;
  }
  for (const placement of input.placements) {
    if (!input.buildingPaths.has(placement.nodePath)) continue;
    stamp(region, blocked, placement.footprint, 1);
  }

  const road = new Uint8Array(cells);
  const roadY = new Int32Array(cells);
  const bridged = new Uint8Array(cells);
  const paved = new Uint8Array(cells);
  const rural = resolveRoadStates(input.palette, input.stack, input.bridgeStyle);
  // §7.3's mask, allocated only when a document asked for a break-up: the
  // surfacer hands it out, and the ground pass grows the green on it.
  const broken =
    input.breakUp === undefined || input.breakUp.chance <= 0 ? undefined : new Uint8Array(cells);
  const urban = resolveStreetStates(
    input.palette,
    input.stack,
    rural,
    input.theme,
    input.seed,
    input.wearChance,
    broken === undefined || input.breakUp === undefined
      ? undefined
      : { spec: input.breakUp, mark: broken, region },
  );
  /**
   * F10: one {@link StreetStateSet} per distinct district theme, memoized.
   *
   * The root theme's set is `urban` itself and is never rebuilt, so a
   * single-theme world allocates exactly what it always allocated and resolves
   * every symbol through exactly the path it always did.
   */
  const scopedStates = new Map<string, StreetStateSet>();
  const statesFor = (themeId: string | undefined): StreetStateSet => {
    if (themeId === undefined || themeId === input.theme) return urban;
    const hit = scopedStates.get(themeId);
    if (hit !== undefined) return hit;
    const built = resolveStreetStates(
      input.palette,
      input.stack,
      rural,
      themeId,
      input.seed,
      input.wearChance,
      broken === undefined || input.breakUp === undefined
        ? undefined
        : { spec: input.breakUp, mark: broken, region },
      true,
    );
    scopedStates.set(themeId, built);
    return built;
  };
  const blocks: StructureBlock[] = [];
  /** F8's `LOAM-T237` rows, one per drifted segment. Empty without a datum. */
  const streetDiagnostics: LoamDiagnostic[] = [];
  /** §3.6b, recorded as the pass runs. Never read here. */
  const declaredSegments: StreetSegmentDeclaration[] = [];
  /** Avenue centre lines, kept until every segment has been surfaced. */
  const avenues: {
    readonly cells: readonly { x: number; z: number }[];
    readonly states: RoadStates;
    readonly marking: number;
  }[] = [];

  /* --- the segments, in traversal order ---------------------------------- */

  /** One thing to surface: an arterial, a street, a flight, or a cart road. */
  interface StreetJob {
    readonly rank: StreetRank;
    /** Position in the document-order walk — the painting order, unchanged. */
    readonly order: number;
    readonly role: "carriageway" | "steps" | "cart";
    readonly width: number;
    readonly path: readonly { readonly x: number; readonly z: number }[];
    readonly states: RoadStates;
    /** Lift the profile clear of water it spans, and build the bridge kit. */
    readonly decks: boolean;
    /** Avenues collect a dashed centre line, against their own graph. */
    readonly graph?: StreetGraph;
    readonly marked: boolean;
    /** The centre-line state of *this run's* street family (F10). */
    readonly marking: number;
    /**
     * F8: the datum's per-station profile for this run, when it has one.
     *
     * Present only for a district segment whose graph carried a datum *and*
     * whose path survived the region filter whole — a clipped path builds a
     * different {@link ArcFrame}, and a profile bound to one frame is not a
     * profile for another. A clipped run therefore falls back to grading, which
     * is today's path exactly.
     */
    readonly datumY?: readonly number[];
    /** Where a `LOAM-T237` about this run is reported. */
    readonly datumPath?: string;
    /** Set by the claim phase. */
    spots?: readonly SweptColumn[];
    /** The run's arc frame — where its height lives. Set by the claim phase. */
    frame?: ArcFrame;
    geometry?: StreetStairGeometry;
    /** Set by the level phase: one level per station of {@link frame}. */
    levels?: ArcLevels;
    stairs?: StreetStairLevels;
  }

  const jobs: StreetJob[] = [];
  for (const arterial of input.arterials ?? []) {
    const path = arterial.path.filter((c) => inside(region, c.x, c.z));
    if (path.length === 0) continue;
    jobs.push({
      // An arterial is the widest thing in the pass and outranks every street
      // by width alone; the kind rank is only ever consulted on a tie.
      rank: { id: `arterial:${arterial.id}`, width: arterial.width, role: "carriageway", kind: "arterial" },
      order: jobs.length,
      role: "carriageway",
      width: arterial.width,
      path,
      // A boulevard is wider than any avenue, so it takes the widest urban
      // surface the theme defines rather than the rural one this pass was
      // written against before street classes existed.
      states: urban.avenue,
      decks: true,
      marked: false,
      marking: urban.marking,
    });
  }
  for (const [graphIndex, graph] of input.graphs.entries()) {
    // F10: this quarter's own street family, or the root's when it named none.
    const urbanHere = statesFor(input.graphThemes?.[graphIndex]);
    // Which quarter's segments these are — see `graphPaths`. Without it two
    // quarters' `ns0` are one id, and one of them loses its levels.
    const graphPath = input.graphPaths?.[graphIndex] ?? `#${graphIndex}`;
    // Does this quarter carry water? Two things hang off the answer, and both
    // are gated on it so that a document naming no `canal` quarter grades and
    // surfaces exactly the columns it grades and surfaces today: a street that
    // crosses a channel needs its deck lifted clear of the water (the per-cell
    // floor the arterial loop has always passed and this one never did), and it
    // needs the bridge kit — otherwise a district street over a canal is a
    // graded deck with no rails and no piers, which is a hole in the street with
    // a name.
    const hasChannel = graph.segments.some((s) => s.role === "channel");
    for (const segment of graph.segments) {
      const path = segment.path.filter((c) => inside(region, c.x, c.z));
      if (path.length === 0) continue;
      // The urban-form seam (`docs/URBAN-FORMS-v0.md` §4.1). A segment's *role*
      // says what is inside its width: a channel is a street whose carriageway
      // is water, and a flight of steps is a street the tread law lays instead
      // of the grader.
      const role = segment.role ?? "carriageway";
      if (role === "channel") {
        // The water is already there: `digCanals` (`structures/canals.ts`) ran
        // between the column plan and this pass, so every channel column is
        // already priced as bridgeable by `buildBridgeableMask` and every cross
        // street that meets one is decked *above* it rather than paving it. A
        // channel therefore surfaces nothing and claims nothing — its columns
        // are held by the fluid mask, which is a stronger claim than ownership
        // and one no carriageway has ever been able to overwrite.
        continue;
      }
      // F8's demotion, decided here because here is where the segment and its
      // graph's datum are both in hand. A `steps` run is deliberately included:
      // the tread law reads `naturalAt`, not this profile, so the field is
      // simply never consulted for it.
      const datumLevels =
        path.length === segment.path.length
          ? input.datums?.[graphIndex]?.bySegment.get(segment.id)
          : undefined;
      jobs.push({
        rank: {
          id: qualifySegmentId(segment.id, graphPath),
          width: segment.width,
          role,
          kind: segment.kind,
        },
        ...(datumLevels === undefined ? {} : { datumY: datumLevels.y, datumPath: graphPath }),
        order: jobs.length,
        role: role === "steps" ? "steps" : role === "cart" ? "cart" : "carriageway",
        width: segment.width,
        path,
        states: urbanHere[segment.kind],
        decks: hasChannel,
        graph,
        marked: segment.kind === "avenue",
        marking: urbanHere.marking,
      });
    }
  }

  /* --- phase 1: claim ----------------------------------------------------- */

  // The frozen ground. Every level below is measured against this and never
  // against the live view, which the commit is about to start moving. §9 step 9:
  // the read is `driver.view()` — the plan at this pass's own pipeline position,
  // which holds the resolver's answer wherever a converted pass has won and the
  // unconverted passes' writes everywhere else. (§10 retires this snapshot at
  // WP-6: the baseline *is* the snapshot, and there is only one.)
  const natural = Int32Array.from(view.ground);
  const naturalAt = (x: number, z: number): number => natural[index(region, x, z)] as number;
  const owner = new Int32Array(cells).fill(-1);
  /** The level each owned column was given — what a pin reads. */
  const columnY = new Int32Array(cells);
  /** 1 where the *owner's* profile steps, which is what chooses `states.step`. */
  const stepFlag = new Uint8Array(cells);

  const ranked = jobs.map((_, i) => i);
  ranked.sort((a, b) => compareStreetRank((jobs[a] as StreetJob).rank, (jobs[b] as StreetJob).rank));
  /**
   * §3.6b's `subRank`: a job's position in the `compareStreetRank` sort, which
   * is the proven order `(−width, roleRank, kindRank, id)` and is not
   * re-litigated by the contract. Built here so the declaration and the
   * ownership map come from one sort.
   */
  const subRankOf = new Map<number, number>();
  for (const [position, j] of ranked.entries()) subRankOf.set(j, position);

  for (const j of ranked) {
    const job = jobs[j] as StreetJob;
    if (isTreadRole(job.role)) {
      const geometry = streetStairGeometry({
        region,
        plan,
        blocked,
        paved,
        water,
        path: job.path,
        width: job.width,
      });
      job.geometry = geometry;
      if (geometry.refusedBecause !== undefined) continue;
      // Whole-run refusal is settled *here*, against the snapshot and before a
      // single column is taken. A flight refused after claiming would leave its
      // columns owned by nobody — grass down the middle of a street that would
      // otherwise have dressed them — so the flight either can be built on the
      // natural ground or it never enters the ownership map at all.
      const trial = streetStairLevels(geometry, naturalAt, {}, { cart: job.role === "cart" });
      if (trial.refusedBecause !== undefined) {
        job.geometry = { ...geometry, refusedBecause: trial.refusedBecause };
        continue;
      }
      job.stairs = trial;
      claimColumns(
        owner,
        geometry.columns.map((c) => c.idx),
        j,
      );
      continue;
    }
    // One simplified line, shared by the sweep and the frame: the arcs they
    // speak in must be the same coordinate or the level a column reads is not
    // the level its cross-section was graded to.
    const line = simplifyPath(job.path);
    const spots = sweptColumns(region, job.path, carriagewaySpans(job.width).lanes, { line });
    job.spots = spots;
    job.frame = arcFrame(job.path, line);
    // A foreign footprint is never surfaced by anybody, so it is never owned:
    // claiming it would only stop the column being painted by a segment that is
    // allowed to paint it. **Water is the exception**, and it has to be: a wet
    // column is `blocked` too, and a street still carries a *deck* over it — the
    // one thing a bridge column gets is a road tag and a level, and both are the
    // owner's to write.
    claimColumns(
      owner,
      spots.filter((s) => blocked[s.idx] !== 1 || water[s.idx] === 1).map((s) => s.idx),
      j,
    );
  }

  /* --- phase 2: level ----------------------------------------------------- */

  for (const j of ranked) {
    const job = jobs[j] as StreetJob;
    if (isTreadRole(job.role)) {
      const geometry = job.geometry;
      const trial = job.stairs;
      if (geometry === undefined || trial === undefined || geometry.refusedBecause !== undefined) {
        continue;
      }
      // The landing at each end: when the column belongs to the street the
      // flight meets, the flight lands on *that* level. A `steps` segment ranks
      // below any street of its width precisely so this is the direction the
      // constraint runs in — a flight arrives at a street; a street does not
      // arrive at a flight.
      const pinOf = (i: number): number | undefined => {
        const cell = geometry.centre[i];
        if (cell === undefined) return undefined;
        const k = index(region, cell.x, cell.z);
        return owner[k] === j || owner[k] === -1 ? undefined : (columnY[k] as number);
      };
      const first = pinOf(0);
      const last = pinOf(geometry.centre.length - 1);
      const pinned =
        first === undefined && last === undefined
          ? trial
          : streetStairLevels(
              geometry,
              naturalAt,
              {
                ...(first === undefined ? {} : { first }),
                ...(last === undefined ? {} : { last }),
              },
              { cart: job.role === "cart" },
            );
      // A flight the pins refuse keeps the levels the snapshot allowed. It has
      // already claimed its columns, and dropping them here would leave a hole
      // in the fabric that nothing else is going to fill.
      const levels = pinned.refusedBecause === undefined ? pinned : trial;
      job.stairs = levels;
      for (const column of geometry.columns) {
        if (owner[column.idx] !== j) continue;
        columnY[column.idx] = (levels.levels[column.k] as number) - 1;
      }
      continue;
    }

    const path = job.path;
    const frame = job.frame as ArcFrame;
    // **The profile is graded over the arc frame's stations, not over the raster
    // cells.** Two things follow, and both are the defect this replaces. The
    // grade cap becomes one block of rise per block of *ground travelled* rather
    // than per raster cell — on a diagonal those differ by √2, which is why a
    // diagonal street used to climb half again as fast as its own grade cap
    // claimed. And the ground it is graded from is sampled *along the true
    // line*, which does not zigzag: the 4-connected raster of a diagonal
    // oscillates across the contour every step, `gradeProfile` is a lower
    // envelope of unit cones and preserves a ±1 oscillation exactly, and the
    // result was a washboard written into the street. See {@link ArcFrame}.
    const ground: number[] = [];
    const band: number[] = [];
    const deckFloor: number[] = [];
    // The shore floor is asked over the whole cross-section, not the centreline
    // this profile is graded on. {@link routeFloorAt}.
    const sectionReach = carriagewaySpans(job.width).outer + 1;
    // W1's counter, reported as `LOAM-T239` once the stations are sampled.
    const bites = { clamped: 0, worst: 0 };
    for (const p of frame.stations) {
      const k = index(region, clampX(region, p.x), clampZ(region, p.z));
      ground.push(natural[k] as number);
      band.push(paved[k] === 1 ? 0 : ROAD_FILL_BAND);
      // A deck has to clear the water it spans — without it the grade would
      // follow the channel's *bed*, a ramp down into the canal and out the other
      // side, because `plan.ground` under water is the bed — and a shore cell
      // has to keep the rim of the water beside it. {@link routeFloorAt}.
      deckFloor.push(
        routeFloorAt(view, water, k, plan.seaLevel, job.decks === true, sectionReach, bites),
      );
    }
    if (bites.clamped > 0) {
      streetDiagnostics.push(
        note(
          "ROAD_BERM_CLAMPED",
          job.rank.id,
          `the water floor asked street segment "${job.rank.id}" to stand above its own natural ground at ${bites.clamped} of ${frame.stations.length} station(s), by up to ${bites.worst + ROAD_BERM_MAX} block(s); clamped to ${ROAD_BERM_MAX} so the rim's lift could not propagate along the profile`,
          `No change needed — the street keeps the rim it is beside and drops back to the ground it crosses. A run that wants this at most of its stations is a span rather than a street.`,
        ),
      );
    }
    // --- F8: consume, or grade -------------------------------------------
    // A run that carries a datum is **not re-graded**. Its profile is the
    // datum's; the only further constraints are floors, and a floor can only
    // ever lift. So the two graders F2 exists to prevent cannot appear: every
    // departure from the datum is a floor biting, and every floor that bites is
    // reported as `LOAM-T237`.
    //
    // The pins are deliberately *not* re-run on this path. A district's own
    // crossings were pinned by the datum, in the same `compareStreetRank` order,
    // with the same `pinLevel` — re-pinning here against `columnY` would be the
    // second grading F8 removes.
    const datumY = job.datumY;
    const tied = datumY !== undefined && datumY.length === frame.stations.length;
    let profile: number[];
    if (tied && datumY !== undefined) {
      // F9's cap, folded in as a floor beside the water's: "a carriageway may
      // not cut more than `STREET_CUT_MAX` below its own natural ground at any
      // station. Where the cap binds, the profile breaks instead of digging."
      // Both are floors, so `gradeProfile`'s existing upper envelope of unit
      // cones carries them — F8's "maxed in through `gradeProfile`'s existing
      // floor envelope", and W3's "the descent is already right".
      const floor = deckFloor.map((f, i) => Math.max(f, (ground[i] as number) - STREET_CUT_MAX));
      // `band` is `ROAD_FILL_BAND` (0) or 0, so the lower envelope of a profile
      // that is already 1-Lipschitz and already at or below its own ground is
      // that profile: this call adds the floor and changes nothing else.
      profile = gradeProfile(datumY, plan.seaLevel, band, floor);
      let drifted = 0;
      let worst = 0;
      for (const [i, y] of profile.entries()) {
        const lift = y - (datumY[i] as number);
        if (lift >= 1) {
          drifted++;
          if (lift > worst) worst = lift;
        }
      }
      if (drifted > 0) {
        streetDiagnostics.push(
          note(
            "FRONTAGE_TIE_DRIFT",
            job.datumPath ?? "",
            `street segment "${job.rank.id}" was surfaced above its datum at ${drifted} of ${profile.length} station(s), by up to ${worst} block(s); the lots seated against that datum keep the level the datum gave them`,
            `No change needed if the run crosses or skirts water — a deck and a shore rim are the one legal cause, and a street that rose out of the water is a street doing the right thing. A large drift away from water means the datum and the surfacer have become two graders: report it.`,
          ),
        );
      }
    } else {
      for (const [i, c] of path.entries()) {
        const k = index(region, c.x, c.z);
        if (owner[k] === j || owner[k] === -1) continue;
        // A junction is a *place*, not a path cell: the pin lands on the station
        // whose cross-section covers the shared column, so the whole width of this
        // street arrives at the owner's level rather than one lane of it.
        pinLevel(ground, band, deckFloor, frame.station(frame.pathArc[i] as number), columnY[k] as number);
      }
      profile = gradeProfile(ground, plan.seaLevel, band, deckFloor);
    }
    const levels = arcLevels(frame, profile);
    job.levels = levels;
    for (const spot of job.spots ?? []) {
      if (owner[spot.idx] !== j) continue;
      // A plaza surfaced itself and keeps its own level; the lane is *on* the
      // green, which is what the dress phase writes there too.
      columnY[spot.idx] =
        paved[spot.idx] === 1 ? (natural[spot.idx] as number) : levels.at(spot.arc);
      stepFlag[spot.idx] = levels.steps(spot.arc) ? 1 : 0;
    }
  }

  /* --- phase 2a: the terminus landing (§5.4, the verge opening) ------------ */
  // The one negotiation the two laws cannot do inside themselves. Computed here
  // because here is the first moment both are known: the flight's treads are
  // settled and so is the street's graded profile, and nothing has been
  // declared or painted yet.
  const landing = terminusLandings(region, jobs, owner, columnY, blocked, paved, water);
  for (const [idx, y] of landing) {
    columnY[idx] = y;
    // A yielded column *is* a step, and is painted as one: the mix that dresses
    // a tread is the same mix that should dress the landing it arrives on.
    stepFlag[idx] = 1;
  }

  /* --- phase 2b: declare, and commit the whole subsystem ------------------- */
  // §3.6b: the street family declares as **one subsystem**, because its internal
  // arbitration — rank, ownership, endpoint pins — is already correct and is not
  // the resolver's business. So every segment's claim is computed here, after the
  // level phase has settled all of them against `natural`, and the whole set goes
  // to the driver in one commit. Only then does anything paint.

  for (const job of jobs) {
    if (isTreadRole(job.role)) {
      const geometry = job.geometry;
      const levels = job.stairs;
      if (geometry === undefined || levels === undefined || geometry.refusedBecause !== undefined) {
        continue;
      }
      // §3.7b: a flight is a `street.network` profile whose `subRank` puts it
      // below any street of its width — a flight arrives at a street; a street
      // does not arrive at a flight — plus `preserve` over the whole tread band,
      // which is the balustrade problem stated as a claim.
      declaredSegments.push({
        source: `street:${job.rank.id}`,
        subRank: subRankOf.get(job.order) ?? job.order,
        role: "steps",
        id: job.rank.id,
        columns: geometry.columns
          .filter((c) => owner[c.idx] === job.order)
          .map((c) => ({ idx: c.idx, y: columnY[c.idx] as number })),
        bridged: [],
        preserve: true,
      });
      continue;
    }
    const levels = job.levels;
    const spots = job.spots;
    if (levels === undefined || spots === undefined) continue;
    const claimed = declareRoute(view, blocked, spots, levels, paved, water, {
      owner,
      job: job.order,
      landing,
    });
    declaredSegments.push({
      source: `street:${job.rank.id}`,
      subRank: subRankOf.get(job.order) ?? job.order,
      role: "carriageway",
      id: job.rank.id,
      columns: claimed.level,
      bridged: claimed.bridged,
      // A run that decks water carries a rail; §3.6b preserves those columns.
      preserve: claimed.bridged.length > 0,
      frame: levels.frame,
      levels,
    });
  }

  // Declared in rank order, which is the order the resolver reads them in and the
  // order the report prints them in.
  declaredSegments.sort((a, b) => a.subRank - b.subRank);
  driver.commit(streetIntents(declaredSegments));

  /* --- phase 3: dress ----------------------------------------------------- */

  for (const job of jobs) {
    if (isTreadRole(job.role)) {
      const geometry = job.geometry;
      const levels = job.stairs;
      if (geometry === undefined || levels === undefined || geometry.refusedBecause !== undefined) {
        // A flight that cannot be made climbable is not built, and the bench
        // that lost its only stair is found by the physics lint's
        // `traversal.unreachable` rather than shipped as a jump.
        continue;
      }
      const flight = dressStreetStairs(geometry, levels, {
        region,
        plan,
        road,
        roadY,
        states: { step: job.states.step, subsurface: job.states.subsurface },
        stack: input.stack,
        palette: input.palette,
        owner,
        job: job.order,
        ...(occupancy === undefined ? {} : { occupancy }),
      });
      blocks.push(...flight.blocks);
      continue;
    }

    const levels = job.levels;
    const spots = job.spots;
    if (levels === undefined || spots === undefined) continue;
    // The path-indexed form, for everything that still walks the raster: the
    // bridge kit's spans and the avenue's dash phase. Each cell takes the level
    // of the cross-section it sits in, so the two views never disagree.
    const surfaced = job.path.map((cell, i) => ({
      x: cell.x,
      z: cell.z,
      y: levels.at(levels.frame.pathArc[i] as number),
    }));
    surfaceRoute(
      region,
      plan,
      blocked,
      road,
      roadY,
      spots,
      job.width,
      levels,
      job.states,
      occupancy,
      paved,
      water,
      bridged,
      // The surfacer's relief is measured against the pass-entry snapshot, which
      // no commit moves, so its timing was never in question.
      reliefOf(region, natural, spots),
      { owner, job: job.order, step: stepFlag, landing },
    );
    if (job.decks) {
      // The same call the arterial loop makes, so a canal bridge gets the same
      // deck, the same rail, the same pier rhythm and the same approaches a
      // river crossing gets. `buildBridgeKit` finds its own wet runs and refuses
      // any run too short to be a bridge, so a street that never meets the water
      // contributes nothing.
      blocks.push(
        ...buildBridgeKit(
          region,
          plan,
          surfaced,
          job.width,
          {
            deck: job.states.deck,
            post: job.states.post,
            pier: job.states.pier,
            styles: job.states.bridge,
          },
          water,
        ).blocks,
      );
    }
    if (job.marked && job.graph !== undefined) {
      avenues.push({ cells: markableCells(surfaced, job.graph, job.width), states: job.states, marking: job.marking });
    }
  }

  const arterialMask = new Uint8Array(cells);
  for (const job of jobs) {
    if (job.rank.kind !== "arterial") continue;
    for (const spot of job.spots ?? []) if (road[spot.idx] === 1) arterialMask[spot.idx] = 1;
  }

  /* --- phase 4: furnish --------------------------------------------------- */

  // After every segment: a street laid later crosses an earlier one, and a dash
  // painted before that crossing would simply be overwritten.
  paintCentreLines(region, plan, road, paved, water, avenues);

  // The balustrade, at last. It stands *above* a column rather than being one,
  // which is why it could not be built until `plan.ground` was final — see the
  // note at the head of `street-stairs.ts`.
  for (const job of jobs) {
    if (!isTreadRole(job.role)) continue;
    const geometry = job.geometry;
    const levels = job.stairs;
    if (geometry === undefined || levels === undefined || geometry.refusedBecause !== undefined) {
      continue;
    }
    blocks.push(
      ...streetStairRail(geometry, levels, {
        region,
        plan,
        stack: input.stack,
        palette: input.palette,
        lantern: job.states.lantern,
      }),
    );
  }

  const declaredShoulders = blendShoulders(
    region,
    plan,
    view,
    driver,
    "street#shoulders",
    road,
    roadY,
    blocked,
    paved,
    input.seam,
  );

  let surfacedColumns = 0;
  let bridgeColumns = 0;
  let arterialColumns = 0;
  for (let k = 0; k < cells; k++) {
    if (road[k] === 1) surfacedColumns++;
    if (bridged[k] === 1) bridgeColumns++;
    if (arterialMask[k] === 1) arterialColumns++;
    // The state resolver is asked about columns it does not end up painting
    // (a claim that lost, a run that was refused), so a break is only real
    // where the pass actually surfaced the ground — and never on a deck.
    if (broken !== undefined && broken[k] === 1 && (road[k] !== 1 || bridged[k] === 1)) {
      broken[k] = 0;
    }
  }
  return {
    blocks,
    surfacedColumns,
    road,
    bridgeColumns,
    arterialColumns,
    ...(broken === undefined ? {} : { broken }),
    ...(streetDiagnostics.length === 0 ? {} : { diagnostics: streetDiagnostics }),
    declaration: { segments: declaredSegments, shoulders: declaredShoulders },
  };
}

/**
 * The level a graded route may not be cut below, at one station.
 *
 * Two floors, and until this function there was one. A **deck** station floors
 * at the surface of the water it spans plus one, so the profile clears the
 * channel instead of following its bed. A **shore** station floors at the
 * surface of whatever water its own cross-section stands beside, because
 * cutting a shore column lower opens that body's rim: the block that was
 * holding the water in becomes the block the water pours over, and the physics
 * lint counts every voxel that would run out of the hole
 * (`checkFluidStability`, LOAM-T110).
 *
 * **The walked defect.** A street bridged a hill basin whose surface stood at
 * y = 95 and graded the two approaches to 94 — one block *through* the rim the
 * lake was resting against — and six columns of the lake's edge were left with
 * an open face. `gradeProfile` had a floor for exactly this and it was
 * `seaLevel + 1`: a single world constant, so the ocean was safe and every
 * tarn, pond and basin above it was not. This is that constant per body.
 *
 * Three details, each of which is the difference between a fix and a new
 * defect:
 *
 * 1. **The cross-section, not the centreline.** A station's level is written to
 *    every column the sweep covers, so a centreline three columns from the
 *    water still cuts the rim through its own kerb. The search is the square of
 *    radius `reach` — the outer lane offset plus one, the sweep's own footprint
 *    with room for the column beyond it.
 * 2. **Dry columns only.** The floor is the surface of water *beside* a dry
 *    column of the section, never the surface of water the section is standing
 *    in — that case is the deck's, above.
 * 3. **The surface, and not one above it.** A dry column adjacent to a stable
 *    body is already at or above that body's surface — that is what makes it
 *    the rim — so this floor can only ever cancel a cut, never raise an
 *    embankment the route never asked for. It is also why the lift is bounded:
 *    the answer is some nearby column's own natural ground.
 *
 * **W1 — that third claim is true pointwise and false after propagation**
 * (`docs/GROUND-UNIFICATION-v0.md` §3.1). `gradeProfile` does not take a
 * per-cell floor as given: a per-cell floor is not 1-Lipschitz, so it is first
 * replaced by the *upper* envelope of unit cones, `max_j (floor[j] − |i − j|)`.
 * One rim station therefore holds the profile up for `rimTop − ground` stations
 * in **both** directions, across ground nowhere near the water — an embankment
 * the route never asked for, inherited by every lot tied to that street (F1).
 * So the rim floor is clamped **here**, per station, to
 * `ground[k] + ROAD_BERM_MAX`, *before* the envelope runs: clamping a per-cell
 * array pointwise and then enveloping is the same construction, so the
 * 1-Lipschitz guarantee is untouched, and the cone now only carries the ramp
 * needed to get back down. The deck floor above is deliberately **not**
 * clamped — a deck's own ground is the channel bed, and clearing the water it
 * spans is the whole point of it.
 */
function routeFloorAt(
  view: GroundView,
  water: Uint8Array,
  k: number,
  seaLevel: number,
  decks: boolean,
  reach: number,
  /** W1's counter: incremented once per station where the clamp actually bit. */
  bites?: { clamped: number; worst: number },
): number {
  if (decks && water[k] === 1) return Math.max(seaLevel, view.fluidTop[k] as number) + 1;
  const { region } = view;
  const i0 = k % region.width;
  const j0 = (k - i0) / region.width;
  let floor = 0;
  for (let j = Math.max(0, j0 - reach); j <= Math.min(region.depth - 1, j0 + reach); j++) {
    for (let i = Math.max(0, i0 - reach); i <= Math.min(region.width - 1, i0 + reach); i++) {
      const c = j * region.width + i;
      // Water the section stands *in* is the deck's business, not the rim's.
      if (view.fluidKind[c] !== FluidKind.NONE) continue;
      const consider = (n: number): void => {
        if (view.fluidKind[n] === FluidKind.NONE) return;
        const top = view.fluidTop[n] as number;
        if (top > floor) floor = top;
      };
      if (i > 0) consider(c - 1);
      if (i < region.width - 1) consider(c + 1);
      if (j > 0) consider(c - region.width);
      if (j < region.depth - 1) consider(c + region.width);
    }
  }
  // W1: a cap on cutting, never a licence to fill.
  const cap = (view.ground[k] as number) + ROAD_BERM_MAX;
  if (floor > cap) {
    if (bites !== undefined) {
      bites.clamped++;
      if (floor - cap > bites.worst) bites.worst = floor - cap;
    }
    return cap;
  }
  return floor;
}

/**
 * §3.6b and §3.7b's intents, from the segments the pass has just declared.
 *
 * One `profile` per surfaced segment at class `street.network`, `subRank` = its
 * position in the `compareStreetRank` sort — so the proven order
 * `(−width, roleRank, kindRank, id)` is preserved exactly and is not re-litigated
 * by the contract — and `transition: "none"`, because a carriageway's own
 * cross-section takes no kerb. Plus `preserve` over any run something *stands*
 * on (a stair balustrade, a bridge rail), and `clearance` + `preserve` over the
 * bridged water columns at the fluid surface: the deck is meant to stand over its
 * channel, and the column beneath it must not move.
 */
function streetIntents(segments: readonly StreetSegmentDeclaration[]): GroundIntent[] {
  const out: GroundIntent[] = [];
  for (const segment of segments) {
    if (segment.columns.length > 0) {
      out.push({
        source: segment.source,
        sourceClass: "street.network",
        kind: "profile",
        columns: segment.columns,
        transition: "none",
        subRank: segment.subRank,
      });
    }
    if (segment.preserve && segment.columns.length > 0) {
      out.push({
        source: segment.source,
        sourceClass: "street.network",
        kind: "preserve",
        columns: segment.columns,
        transition: "none",
        subRank: segment.subRank,
      });
    }
    if (segment.bridged.length > 0) {
      out.push(
        {
          source: `${segment.source}#deck`,
          sourceClass: "street.network",
          kind: "clearance",
          columns: segment.bridged,
          transition: "none",
          subRank: segment.subRank,
        },
        {
          source: `${segment.source}#deck`,
          sourceClass: "street.network",
          kind: "preserve",
          columns: segment.bridged,
          transition: "none",
          subRank: segment.subRank,
        },
      );
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* obstacles + hub                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Columns a route may never enter: any fluid, and any building footprint.
 *
 * The plaza is deliberately *not* an obstacle — it is where the roads are meant
 * to arrive — and neither is the one-block approach of each anchor, which sits
 * outside its own footprint by construction.
 */
function buildBlockedMask(input: RoadNetworkInput, water: Uint8Array): Uint8Array {
  const plan = input.plan;
  const region = plan.region;
  const mask = new Uint8Array(region.width * region.depth);
  for (let k = 0; k < mask.length; k++) {
    // Water is no longer a hard obstacle — it is a priced one, and `water`
    // says which cells a bridge may legally reach. Lava, and any water too
    // wide to span, stay forbidden outright.
    if (plan.fluidKind[k] !== FluidKind.NONE && water[k] === 0) mask[k] = 1;
  }
  for (const placement of input.placements) {
    if (!input.buildingPaths.has(placement.nodePath)) continue;
    stamp(region, mask, placement.footprint, 1);
  }
  if (input.keepClear !== undefined) {
    for (let k = 0; k < mask.length; k++) if (input.keepClear[k] === 1) mask[k] = 1;
  }
  return mask;
}

/**
 * Water cells a bridge may cross: fresh or salt water whose run is at most
 * {@link ROAD_BRIDGE_MAX_SPAN} cells along the x or the z axis.
 *
 * Run lengths are read off the rows and the columns in two linear sweeps, so
 * this is O(cells) and, being a pure function of the fluid mask, deterministic.
 */
export function buildBridgeableMask(
  plan: { readonly region: Region; readonly fluidKind: Uint8Array },
): Uint8Array {
  const { region, fluidKind } = plan;
  const n = region.width * region.depth;
  const wet = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (fluidKind[k] === FluidKind.WATER) wet[k] = 1;

  const out = new Uint8Array(n);
  const runs = new Int32Array(n);

  // Rows.
  for (let j = 0; j < region.depth; j++) {
    let i = 0;
    while (i < region.width) {
      const base = j * region.width;
      if (wet[base + i] === 0) {
        i++;
        continue;
      }
      let end = i;
      while (end < region.width && wet[base + end] === 1) end++;
      const span = end - i;
      for (let k = i; k < end; k++) runs[base + k] = span;
      i = end;
    }
  }
  for (let k = 0; k < n; k++) {
    if (wet[k] === 1 && (runs[k] as number) > 0 && (runs[k] as number) <= ROAD_BRIDGE_MAX_SPAN) {
      out[k] = 1;
    }
  }

  // Columns.
  runs.fill(0);
  for (let i = 0; i < region.width; i++) {
    let j = 0;
    while (j < region.depth) {
      if (wet[j * region.width + i] === 0) {
        j++;
        continue;
      }
      let end = j;
      while (end < region.depth && wet[end * region.width + i] === 1) end++;
      const span = end - j;
      for (let k = j; k < end; k++) runs[k * region.width + i] = span;
      j = end;
    }
  }
  for (let k = 0; k < n; k++) {
    if (wet[k] === 1 && (runs[k] as number) > 0 && (runs[k] as number) <= ROAD_BRIDGE_MAX_SPAN) {
      out[k] = 1;
    }
  }

  return out;
}

/**
 * Cells that touch a building's perimeter and are not part of anyone's door
 * approach — the columns {@link ROAD_WALL_HUG_COST} is charged on.
 *
 * The exemption is subtracted after the whole penalty field is stamped, so a
 * door corridor clears the penalty even where it runs past a *neighbouring*
 * building's wall: arriving at your own door matters more than keeping a
 * polite distance from someone else's.
 */
export function buildWallHugMask(
  region: Region,
  placements: readonly Placement[],
  buildingPaths: ReadonlySet<string>,
  anchors: readonly RoadAnchor[],
  approach: number,
  width: number,
): Uint8Array {
  const mask = new Uint8Array(region.width * region.depth);
  const reach = ROAD_WALL_HUG_REACH;
  for (const placement of placements) {
    if (!buildingPaths.has(placement.nodePath)) continue;
    const f = placement.footprint;
    for (let z = f.z0 - reach; z <= f.z1 + reach; z++) {
      for (let x = f.x0 - reach; x <= f.x1 + reach; x++) {
        if (!inside(region, x, z)) continue;
        // Inside the footprint is already a hard obstacle; only the collar
        // around it carries a penalty.
        if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) continue;
        mask[index(region, x, z)] = 1;
      }
    }
  }
  const half = (width - 1) >> 1;
  for (const anchor of anchors) {
    for (let step = 0; step < approach + 1; step++) {
      for (let o = -half - 1; o <= half + 1; o++) {
        const x = anchor.x + anchor.nx * step + anchor.nz * o;
        const z = anchor.z + anchor.nz * step + anchor.nx * o;
        if (!inside(region, x, z)) continue;
        mask[index(region, x, z)] = 0;
      }
    }
  }
  return mask;
}

/** The plaza's centre, or the largest building's approach. */
function pickHub(
  input: RoadNetworkInput,
  anchors: readonly RoadAnchor[],
  region: Region,
  blocked: Uint8Array,
): RoadAnchor | null {
  if (input.plaza !== undefined) {
    const rect = input.plaza.footprint;
    const x = Math.floor((rect.x0 + rect.x1) / 2);
    const z = Math.floor((rect.z0 + rect.z1) / 2);
    // The exact centre is not always available — since G4.5a the plaza pass puts
    // a well there, and a well is water, which is a hard obstacle. Step outward
    // in a fixed spiral until a paved column turns up; anywhere on the green is
    // as good a hub as any, and giving up would demote the plaza to "not the
    // hub" and scatter the lanes to the largest building instead.
    for (let r = 0; r <= 4; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const hx = x + dx;
          const hz = z + dz;
          if (!inside(region, hx, hz)) continue;
          if (hx < rect.x0 || hx > rect.x1 || hz < rect.z0 || hz > rect.z1) continue;
          if (blocked[index(region, hx, hz)] === 1) continue;
          return { nodePath: input.plaza.nodePath, x: hx, z: hz, nx: 0, nz: 0, area: 0 };
        }
      }
    }
  }
  let best: RoadAnchor | null = null;
  for (const anchor of anchors) {
    if (blocked[index(region, anchor.x, anchor.z)] === 1) continue;
    // Ties break on the earlier (document-order) anchor, never on area alone.
    if (best === null || anchor.area > best.area) best = anchor;
  }
  return best;
}

/** The nearest unblocked column to `(x, z)`, searched in a fixed spiral. */
function freeCellNear(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  x: number,
  z: number,
): { x: number; z: number } | null {
  for (let r = 0; r <= 4; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = x + dx;
        const cz = z + dz;
        if (!inside(region, cx, cz)) continue;
        const idx = index(region, cx, cz);
        if (blocked[idx] === 1 && road[idx] === 0) continue;
        return { x: cx, z: cz };
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* A*                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Step deltas, in the fixed order the search expands them: the four cardinals
 * first, then the four diagonals, so a tie between an orthogonal and a diagonal
 * route resolves the same way every run.
 *
 * Eight-connectivity is what stopped roads reading as staircases. A 4-connected
 * A* has no way to express "head north-east"; it can only alternate north and
 * east, and the turn penalty then decides whether it does so in one long L or in
 * a flight of steps. Neither looks like a lane.
 */
const STEPS: readonly (readonly [number, number])[] = Object.freeze([
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
] as const);

/** Heading states per cell: the eight directions plus "no heading yet". */
const DIR_STATES = STEPS.length + 1;
/** The index of the "no heading yet" state. */
const NO_DIR = STEPS.length;

/** Lowest possible per-step cost — the A* heuristic's scale factor. */
const MIN_STEP_COST = ROAD_BASE_COST * ROAD_REUSE_DISCOUNT;
/** Lowest possible diagonal step cost. */
const MIN_DIAGONAL_COST = ROAD_DIAGONAL_COST * ROAD_REUSE_DISCOUNT;

/**
 * Route from `start` to the nearest cell of the existing network.
 *
 * Searched **backwards**: the open set starts as every road cell at zero cost
 * and the goal is the anchor, which turns "nearest of many targets" into an
 * ordinary single-goal A*. The heuristic is Manhattan distance scaled by the
 * cheapest possible step, so it never over-estimates and the first expansion of
 * the goal is optimal.
 *
 * State is `(cell, incoming heading)` so the turn penalty is expressible; ties
 * break on the lower state key, which makes the result independent of heap
 * implementation details.
 */
export function routeTo(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  plan: RouteGround,
  start: { x: number; z: number },
  costs: {
    water?: Uint8Array;
    wallHug?: Uint8Array;
    corridor?: Uint8Array;
    /** One-off charge for leaving dry land. Default {@link ROAD_BRIDGE_ENTRY}. */
    bridgeEntry?: number;
    /** Charge per further water cell. Default {@link ROAD_WATER_COST}. */
    waterCost?: number;
    /**
     * Blocks of rise or fall one step may take. Absent means no cap.
     *
     * A **veto**, not a charge, and that is the difference between a grade cap
     * and `ROAD_SLOPE_COST`: a cost says "prefer the flatter way" and a cap
     * says "this way does not exist for me". Added for the infrastructure
     * host's `between` route form, whose whole derivation is
     * `docs/INFRA-ENTRIES-v0.md` §3.2's sentence — "the road router's cost
     * field **at the entry's own grade cap**" — and an aqueduct that climbed a
     * cliff because the cliff was merely expensive would be exactly the thing
     * that sentence forbids. A step onto or off water is exempt, as it is for
     * the slope charge: over water the profile is the deck, not the bed.
     */
    maxDrop?: number;
  } = {},
): { x: number; z: number }[] | null {
  const water = costs.water;
  const wallHug = costs.wallHug;
  const corridor = costs.corridor;
  // A city arterial is *expected* to bridge: the whole reason a waterfront
  // city reads as one is that its boulevards cross the water rather than
  // detouring round the head of it. The defaults stay the village lane's.
  const bridgeEntry = costs.bridgeEntry ?? ROAD_BRIDGE_ENTRY;
  const waterCost = costs.waterCost ?? ROAD_WATER_COST;
  const cells = region.width * region.depth;
  const states = cells * DIR_STATES;
  const goal = index(region, start.x, start.z);

  const g = new Float64Array(states).fill(Infinity);
  const from = new Int32Array(states).fill(-1);
  const heap = new Heap();

  // Octile distance at the cheapest achievable per-step costs. Never an
  // over-estimate: no real step can beat a fully discounted straight or
  // diagonal, so the first expansion of the goal is still optimal.
  const heuristic = (idx: number): number => {
    const dx = Math.abs((idx % region.width) - (goal % region.width));
    const dz = Math.abs(Math.floor(idx / region.width) - Math.floor(goal / region.width));
    const lo = dx < dz ? dx : dz;
    return (dx + dz) * MIN_STEP_COST + lo * (MIN_DIAGONAL_COST - 2 * MIN_STEP_COST);
  };

  for (let idx = 0; idx < cells; idx++) {
    if (road[idx] !== 1) continue;
    const state = idx * DIR_STATES + NO_DIR;
    g[state] = 0;
    heap.push(heuristic(idx), state);
  }
  if (heap.size === 0) return null;

  let found = -1;
  const closed = new Uint8Array(states);
  while (heap.size > 0) {
    const state = heap.pop();
    if (closed[state] === 1) continue;
    closed[state] = 1;
    const idx = Math.floor(state / DIR_STATES);
    if (idx === goal) {
      found = state;
      break;
    }
    const dir = state % DIR_STATES;
    const x = region.x0 + (idx % region.width);
    const z = region.z0 + Math.floor(idx / region.width);
    const here = plan.ground[idx] as number;

    for (const [d, step] of STEPS.entries()) {
      const sx = step[0] as number;
      const sz = step[1] as number;
      const nx = x + sx;
      const nz = z + sz;
      if (!inside(region, nx, nz)) continue;
      const nIdx = index(region, nx, nz);
      const onRoad = road[nIdx] === 1;
      if (blocked[nIdx] === 1 && !onRoad && nIdx !== goal) continue;
      const diagonal = sx !== 0 && sz !== 0;
      // No cutting a corner through a wall or a pond: a diagonal step is only
      // legal when both of the orthogonal cells it squeezes between are legal
      // too. Without this a lane slips between two building corners.
      if (diagonal && !cornerOpen(region, blocked, road, x, z, sx, sz)) continue;
      const wetHere = water !== undefined && water[idx] === 1;
      const wetNext = water !== undefined && water[nIdx] === 1;
      // A bridge runs square across its channel. A diagonal deck would need
      // stepped slabs and a staircase of piers, and neither reads as a bridge
      // from any angle, so a step that touches water must be orthogonal.
      if (diagonal && (wetHere || wetNext)) continue;
      const nState = nIdx * DIR_STATES + d;
      if (closed[nState] === 1) continue;

      // Over water the profile is the deck, not the bed, so the bed's drop is
      // not a cost the route pays.
      const drop = wetHere || wetNext ? 0 : Math.abs((plan.ground[nIdx] as number) - here);
      // The grade cap, when one was asked for: a step steeper than this is not
      // an expensive step, it is not a step.
      if (costs.maxDrop !== undefined && drop > costs.maxDrop) continue;
      let cost = (diagonal ? ROAD_DIAGONAL_COST : ROAD_BASE_COST) + ROAD_SLOPE_COST * drop;
      if (wetNext) cost += waterCost + (wetHere ? 0 : bridgeEntry);
      if (wallHug !== undefined && wallHug[nIdx] === 1) cost += ROAD_WALL_HUG_COST;
      // A 45° kink is half a turn — which is exactly what buys flowing lanes
      // instead of staircases, because the search can now bend gently.
      if (dir !== NO_DIR && dir !== d) cost += (ROAD_TURN_COST * turnEighths(dir, d)) / 2;
      // The **better** of the two discounts, never their product. Compounding
      // them would put a step onto a road cell inside the corridor below
      // `MIN_STEP_COST`, which is what the heuristic is scaled by — and an
      // over-estimating heuristic is an A* that no longer returns the cheapest
      // path, silently, on exactly the routes this feature is meant to improve.
      const inCorridor = corridor !== undefined && corridor[nIdx] === 1;
      const discount = onRoad
        ? ROAD_REUSE_DISCOUNT
        : inCorridor
          ? ROAD_CORRIDOR_DISCOUNT
          : 1;
      if (discount !== 1) cost *= discount;

      const tentative = (g[state] as number) + cost;
      if (tentative >= (g[nState] as number)) continue;
      g[nState] = tentative;
      from[nState] = state;
      heap.push(tentative + heuristic(nIdx), nState);
    }
  }

  if (found < 0) return null;
  const path: { x: number; z: number }[] = [];
  for (let s = found; s >= 0; s = from[s] as number) {
    const idx = Math.floor(s / DIR_STATES);
    path.push({ x: region.x0 + (idx % region.width), z: region.z0 + Math.floor(idx / region.width) });
    if ((from[s] as number) < 0) break;
  }
  return path;
}

/**
 * The straight run of cells out of a door, nearest the door first.
 *
 * Stops at the first cell it cannot enter, so a door facing a wall or the
 * region edge degrades to a shorter stub — or to none, in which case the
 * caller simply searches from the anchor as before.
 */
export function doorStub(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  anchor: RoadAnchor,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  if (anchor.nx === 0 && anchor.nz === 0) return out;
  for (let step = 0; step < ROAD_APPROACH_CELLS; step++) {
    const x = anchor.x + anchor.nx * step;
    const z = anchor.z + anchor.nz * step;
    if (!inside(region, x, z)) break;
    const k = index(region, x, z);
    if (blocked[k] === 1 && road[k] === 0) break;
    out.push({ x, z });
  }
  return out;
}

/**
 * Paste a door stub onto the front of a routed path.
 *
 * The search started at the stub's far end, so that cell is `path[0]`; the
 * stub's own last entry is therefore dropped rather than duplicated. Cells the
 * route already revisits are dropped too, so the joined path stays simple.
 */
export function joinStub(
  stub: readonly { x: number; z: number }[],
  path: readonly { x: number; z: number }[],
): { x: number; z: number }[] {
  if (stub.length === 0) return path.slice();
  const out: { x: number; z: number }[] = [];
  const seen = new Set<string>();
  for (const c of [...stub, ...path]) {
    const key = `${c.x},${c.z}`;
    if (seen.has(key)) continue;
    // Only ever 8-connected: if the stub and the search head are not adjacent
    // (the anchor's own cell was blocked and `freeCellNear` stepped aside),
    // drop the stub rather than emit a jump.
    const prev = out[out.length - 1];
    if (prev !== undefined && Math.max(Math.abs(prev.x - c.x), Math.abs(prev.z - c.z)) > 1) {
      return path.slice();
    }
    seen.add(key);
    out.push({ x: c.x, z: c.z });
  }
  return out;
}

/** Both orthogonal cells a diagonal step squeezes between are enterable. */
function cornerOpen(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  x: number,
  z: number,
  sx: number,
  sz: number,
): boolean {
  for (const [cx, cz] of [
    [x + sx, z],
    [x, z + sz],
  ] as const) {
    if (!inside(region, cx, cz)) return false;
    const k = index(region, cx, cz);
    if (blocked[k] === 1 && road[k] === 0) return false;
  }
  return true;
}

/** How many eighths of a turn separate two heading indices, 0..4. */
function turnEighths(a: number, b: number): number {
  // STEPS is ordered cardinals-then-diagonals, which is not angular order, so
  // the angle is read off the deltas rather than off the indices.
  const angle = (d: number): number => {
    const [dx, dz] = STEPS[d] as readonly [number, number];
    // Eighths clockwise from north.
    if (dx === 0 && dz === -1) return 0;
    if (dx === 1 && dz === -1) return 1;
    if (dx === 1 && dz === 0) return 2;
    if (dx === 1 && dz === 1) return 3;
    if (dx === 0 && dz === 1) return 4;
    if (dx === -1 && dz === 1) return 5;
    if (dx === -1 && dz === 0) return 6;
    return 7;
  };
  const d = Math.abs(angle(a) - angle(b));
  return Math.min(d, 8 - d);
}

/**
 * String-pull a found route straight.
 *
 * A\* returns the cheapest *lattice* path, and the cheapest lattice path across
 * gently varying ground is full of one-cell jogs: every one of them costs the
 * same as its neighbour, so the tie-break decides, and the eye reads the result
 * as a wobble. Pulling a string taut through the corridor removes exactly those
 * jogs and nothing else.
 *
 * The rule is conservative on purpose. A segment `i → j` replaces the path
 * between them only when every cell of the straight line is enterable *and* the
 * line's own ground profile is no steeper than the path it replaces — so a lane
 * still walks round a knoll instead of driving through it.
 */
export function smoothRoute(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  plan: RouteGround,
  path: readonly { x: number; z: number }[],
  reach: number = ROAD_SMOOTH_REACH,
  water?: Uint8Array,
): { x: number; z: number }[] {
  if (path.length < 3) return path.slice();
  const out: { x: number; z: number }[] = [path[0] as { x: number; z: number }];
  let i = 0;
  while (i < path.length - 1) {
    let best = i + 1;
    let bestLine: { x: number; z: number }[] | null = null;
    const limit = Math.min(path.length - 1, i + reach);
    for (let j = limit; j > i + 1; j--) {
      const a = path[i] as { x: number; z: number };
      const b = path[j] as { x: number; z: number };
      const line = lineCells(a, b);
      if (!lineLegal(region, blocked, road, line, water)) continue;
      if (roughness(region, plan, line) > roughness(region, plan, path.slice(i, j + 1))) continue;
      best = j;
      bestLine = line;
      break;
    }
    if (bestLine === null) {
      out.push(path[best] as { x: number; z: number });
    } else {
      for (let k = 1; k < bestLine.length; k++) out.push(bestLine[k] as { x: number; z: number });
    }
    i = best;
  }
  return out;
}

/**
 * The 8-connected line between two cells: a Bresenham walk that emits one cell
 * per step and never a diagonal whose corners are both skipped.
 */
export function lineCells(
  a: { x: number; z: number },
  b: { x: number; z: number },
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [{ x: a.x, z: a.z }];
  let x = a.x;
  let z = a.z;
  const dx = Math.abs(b.x - x);
  const dz = Math.abs(b.z - z);
  const sx = x < b.x ? 1 : -1;
  const sz = z < b.z ? 1 : -1;
  let err = dx - dz;
  while (x !== b.x || z !== b.z) {
    const e2 = 2 * err;
    if (e2 > -dz && e2 < dx) {
      // A true diagonal step.
      err += dx - dz;
      x += sx;
      z += sz;
    } else if (e2 > -dz) {
      err -= dz;
      x += sx;
    } else {
      err += dx;
      z += sz;
    }
    out.push({ x, z });
  }
  return out;
}

/** Every cell of a candidate straight is enterable. */
function lineLegal(
  region: Region,
  blocked: Uint8Array,
  road: Uint8Array,
  line: readonly { x: number; z: number }[],
  water?: Uint8Array,
): boolean {
  for (const [i, c] of line.entries()) {
    if (!inside(region, c.x, c.z)) return false;
    const k = index(region, c.x, c.z);
    if (blocked[k] === 1 && road[k] === 0) return false;
    // The smoother knows nothing about bridge cost or deck geometry, so it is
    // simply not allowed to invent or reroute a crossing: any candidate
    // straight that touches water is rejected and the route keeps the cells
    // the priced search chose.
    if (water !== undefined && water[k] === 1) return false;
    if (i === 0) continue;
    const p = line[i - 1] as { x: number; z: number };
    const sx = c.x - p.x;
    const sz = c.z - p.z;
    if (sx !== 0 && sz !== 0 && !cornerOpen(region, blocked, road, p.x, p.z, sx, sz)) return false;
  }
  return true;
}

/** Total absolute ground change along a run of cells — its "steepness bill". */
function roughness(
  region: Region,
  plan: RouteGround,
  cells: readonly { x: number; z: number }[],
): number {
  let sum = 0;
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1] as { x: number; z: number };
    const b = cells[i] as { x: number; z: number };
    if (!inside(region, a.x, a.z) || !inside(region, b.x, b.z)) return Infinity;
    sum += Math.abs(
      (plan.ground[index(region, b.x, b.z)] as number) -
        (plan.ground[index(region, a.x, a.z)] as number),
    );
  }
  return sum;
}

/**
 * A binary min-heap of `(priority, state)`.
 *
 * Ties break on the lower state id rather than on insertion order, so the
 * search is reproducible regardless of how the heap happens to sift.
 */
class Heap {
  private readonly priority: number[] = [];
  private readonly value: number[] = [];

  get size(): number {
    return this.value.length;
  }

  push(priority: number, value: number): void {
    this.priority.push(priority);
    this.value.push(value);
    let i = this.value.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.value[0] as number;
    const lastP = this.priority.pop() as number;
    const lastV = this.value.pop() as number;
    if (this.value.length > 0) {
      this.priority[0] = lastP;
      this.value[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < this.value.length && this.less(l, best)) best = l;
        if (r < this.value.length && this.less(r, best)) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const pa = this.priority[a] as number;
    const pb = this.priority[b] as number;
    if (pa !== pb) return pa < pb;
    return (this.value[a] as number) < (this.value[b] as number);
  }

  private swap(a: number, b: number): void {
    const p = this.priority[a] as number;
    this.priority[a] = this.priority[b] as number;
    this.priority[b] = p;
    const v = this.value[a] as number;
    this.value[a] = this.value[b] as number;
    this.value[b] = v;
  }
}

/* -------------------------------------------------------------------------- */
/* grading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Grade an elevation profile to a maximum step of one block.
 *
 * The result is the lower envelope of cones of slope 1 rooted at
 * `ground + ROAD_FILL_BAND`, floored at the water table:
 *
 *     s[i] = max(waterTable + 1, min_j (o[j] + band[j] + |i − j|))
 *
 * Two properties fall straight out of that form and are what the tests assert:
 * a lower envelope of unit cones is 1-Lipschitz, so `|s[i+1] − s[i]| ≤ 1`
 * everywhere; and taking `max` with a constant preserves that. Fill is capped
 * at `band` by construction. Cut is not — a route crossing a narrow gully digs
 * as deep as the gully, because this v0 has no bridges.
 *
 * `band` may vary per cell, which is what lets a lane arriving at the plaza
 * *descend onto* the green instead of running across it two blocks up on an
 * embankment: the plaza's cells are given band 0, the cone construction ramps
 * the approach down to meet them, and the 1-Lipschitz guarantee is untouched
 * because a per-cone apex height was always allowed to differ.
 *
 * v0.2 §7 `road.network@0`: not yet — `maxGrade`, `bridgeThreshold`,
 * `tunnelThreshold` and `crown` would each change this function; none is read.
 */
export function gradeProfile(
  ground: readonly number[],
  seaLevel: number,
  band: readonly number[] | number = ROAD_FILL_BAND,
  deckFloor: readonly number[] | number = 0,
): number[] {
  const n = ground.length;
  const out = new Array<number>(n);
  const bandAt = (i: number): number => (typeof band === "number" ? band : (band[i] as number));
  const floorAt = (i: number): number =>
    Math.max(seaLevel + 1, typeof deckFloor === "number" ? deckFloor : (deckFloor[i] as number));

  for (let i = 0; i < n; i++) out[i] = (ground[i] as number) + bandAt(i);
  for (let i = 1; i < n; i++) out[i] = Math.min(out[i] as number, (out[i - 1] as number) + 1);
  for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i] as number, (out[i + 1] as number) + 1);

  // The floor is now per-cell — a bridge deck has to clear the water it spans,
  // and the water it spans need not be the sea. A per-cell floor is not
  // 1-Lipschitz on its own, so it is first replaced by its *upper* envelope of
  // unit cones, `max_j (floor[j] − |i − j|)`. That is 1-Lipschitz by the same
  // argument the lower envelope is, and the pointwise max of two 1-Lipschitz
  // functions is 1-Lipschitz — which is how the grade cap survives a bridge,
  // and why the ramp onto a deck is graded rather than a step.
  const floor = new Array<number>(n);
  for (let i = 0; i < n; i++) floor[i] = floorAt(i);
  for (let i = 1; i < n; i++) floor[i] = Math.max(floor[i] as number, (floor[i - 1] as number) - 1);
  for (let i = n - 2; i >= 0; i--) floor[i] = Math.max(floor[i] as number, (floor[i + 1] as number) - 1);

  for (let i = 0; i < n; i++) out[i] = Math.max(out[i] as number, floor[i] as number);
  return out;
}

/**
 * **W2, the cheap assertion** (`docs/GROUND-UNIFICATION-v0.md` §3.1): the
 * longest run of consecutive stations at which a graded profile stands more
 * than `max` blocks above its own natural ground.
 *
 * §3.1's formulation is W4's: *"where a run would need to stand more than
 * `ROAD_BERM_MAX` above its own ground for more than `VIADUCT_MIN_SPAN`
 * stations, it is a viaduct"*. W1's pre-envelope clamp is what makes the
 * measurement bounded — the cone then carries only the ramp needed to get back
 * down, over at most {@link ROAD_BERM_MAX} cells — so over ground that is
 * itself 1-Lipschitz this returns **0**, and any non-zero answer on a
 * deck-free run is either a cliff in the sampled ground or a floor that
 * escaped the clamp. Pure, allocation-free, and asserted by the tests rather
 * than thrown from the pipeline: per §3.1's reconciliation rule W2 ships as an
 * assertion, not as a second grader.
 *
 * Deck stations are the one legal exception (a deck's ground is the channel
 * bed), so callers pass a profile they know is not bridged, or subtract the
 * bridged stations first.
 */
export function bermExcursion(
  profile: readonly number[],
  ground: readonly number[],
  max: number = ROAD_BERM_MAX,
): number {
  let run = 0;
  let worst = 0;
  for (const [i, y] of profile.entries()) {
    if (y - (ground[i] as number) > max) {
      run++;
      if (run > worst) worst = run;
    } else {
      run = 0;
    }
  }
  return worst;
}

/* -------------------------------------------------------------------------- */
/* surfacing                                                                   */
/* -------------------------------------------------------------------------- */

/** The block states the road pass writes. */
interface RoadStates {
  /**
   * The carriageway body.
   *
   * `edge` is the column's distance, in columns, from the nearest carriageway
   * edge, already clamped by {@link surfaceRoute} to the three values the
   * texture distinguishes: `0` is the border course (never reaches this
   * function — {@link RoadStates.shoulder} paints it), `1` is the gutter course
   * and `2` is the body proper. A rural lane never passes it and every rural
   * implementation ignores it, which is what keeps a countryside road
   * byte-identical.
   */
  readonly surface: (x: number, z: number, edge?: number) => number;
  readonly shoulder: (x: number, z: number, edge?: number) => number;
  /**
   * Is this an **urban street** surface class?
   *
   * The flag, rather than a duck test, is what lets one {@link surfaceRoute}
   * serve both: a rural verge is chosen by `SweptColumn.outer` exactly as it
   * always was, and only a street's cross-section is read as
   * border / gutter / body.
   */
  readonly urban?: boolean;
  readonly step: number;
  readonly subsurface: number;
  readonly post: number;
  readonly lantern: number;
  /** Bridge deck: a top slab, so the deck is flush with the lane it joins. */
  readonly deck: number;
  /** Bridge pier: the column dropped from the deck to the bed at each end. */
  readonly pier: number;
  /**
   * The three bridge styles, resolved from the same palette (and so from the
   * same theme) as everything else here. `buildBridgeKit` picks one per span.
   */
  readonly bridge?: BridgeStyleSet;
}

function resolveRoadStates(
  palette: Palette,
  stack: PrismarineStack,
  bridgeStyle?: string,
): RoadStates {
  const fallback = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const at = (symbol: string, name: string) =>
    palette.has(symbol)
      ? (x: number, z: number): number => palette.stateAt(symbol, x, z)
      : (): number => fallback(name);
  // The kit's three states, named once: the styles below fall back to them
  // field by field, so a world with no ground roles builds what it always did.
  const base = {
    // A *top* slab, not a bottom one: the lane it meets has its walking
    // surface at `y + 1`, and a bottom slab would put the deck half a block
    // below that — a step at both banks and a visible seam from every angle.
    deck: palette.has("road.deck")
      ? palette.state("road.deck")
      : (stack.blockStateOf("oak_slab", { type: "top", waterlogged: "false" }) ??
        fallback("oak_planks")),
    post: palette.has("road.post") ? palette.state("road.post") : fallback("oak_fence"),
    pier: palette.has("road.pier") ? palette.state("road.pier") : fallback("oak_log"),
  };
  return {
    surface: at("road.surface", "dirt_path"),
    shoulder: at("road.shoulder", "gravel"),
    step: palette.has("road.step") ? palette.state("road.step") : fallback("stone_bricks"),
    subsurface: palette.has("road.subsurface") ? palette.state("road.subsurface") : fallback("dirt"),
    post: base.post,
    lantern: palette.has("road.lantern") ? palette.state("road.lantern") : fallback("lantern"),
    deck: base.deck,
    pier: base.pier,
    bridge: resolveBridgeStyles(palette, stack, base, bridgeStyle),
  };
}

/* -------------------------------------------------------------------------- */
/* urban street surfacing (U1)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Share of carriageway columns painted in the worn tone.
 *
 * Low on purpose. Above roughly a fifth the two tones stop reading as patched
 * asphalt and start reading as noise; below a tenth the road is a flat slab
 * again. An eighth is the middle of that window.
 */
export const STREET_WEAR_CHANCE = 0.12;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Hash salt for the wear draw — positional only, never a sequential RNG. */
const STREET_WEAR_SALT = 0x5f;
/** Hash salt for the coarse wear-*patch* draw. @see STREET_PATCH_SPAN */
const STREET_PATCH_SALT = 0x8d;
/** Hash salt for the gutter course's dither. */
const STREET_GUTTER_SALT = 0xc3;

/**
 * Edge of the coarse cell the wear draw is taken on, in columns.
 *
 * The walk's verdict on the old surface was "a gray blob with speckles", and
 * *speckles* is the operative word: a per-column draw at 12% scatters single
 * blocks, which at eye level is dithering noise rather than a patched road. The
 * draw is now taken twice — once on a {@link STREET_PATCH_SPAN}-column cell,
 * which decides *where* a patch is, and once per column, which decides how
 * ragged its edge is. Same hash, same determinism, no new RNG; what changes is
 * that worn columns arrive in clumps of two to four, which reads as repair.
 */
const STREET_PATCH_SPAN = 2;
/**
 * How much likelier a *patch* is than a column was, and how much of a patch
 * survives the per-column draw.
 *
 * Their product is deliberately near 1 (1.4 × 0.72 ≈ 1.008), so the share of
 * worn carriageway is the share {@link STREET_WEAR_CHANCE} and
 * `roads.wearIntensity` have always meant — only its *shape* moves.
 */
const STREET_PATCH_SPREAD = 1.4;
/** @see STREET_PATCH_SPREAD */
const STREET_PATCH_KEEP = 0.72;

/**
 * Least carriageway width that takes a border course.
 *
 * Three: the border is one column each side, so at width 2 there would be no
 * body left between the two and at width 1 the road *is* its own border. Every
 * street class in the fabric — avenue, street, lane, cart road, arterial — is
 * at or above it, which is the point: **the border is the rule, not the
 * exception it used to be.**
 */
export const KERB_MIN_WIDTH = 3;

/**
 * Least carriageway width that also carries the gutter course.
 *
 * Seven, so the section reads border / gutter / body / gutter / border with at
 * least three columns of body down the middle. Below it the second course would
 * squeeze the road to a stripe, so a five-wide street takes the border alone.
 */
export const GUTTER_MIN_WIDTH = 7;

/**
 * Share of gutter columns that take the course tone rather than the body.
 *
 * Not 1: a solid line inboard of the kerb reads as paint, and this is meant to
 * read as laid stone. Just under two thirds leaves the course dominant and
 * still broken.
 */
export const GUTTER_DENSITY = 0.62;

/**
 * How the wear draw is scaled by a column's distance from the road edge.
 *
 * A real carriageway wears where it is driven — down the middle — and stays
 * clean in the gutter. `min(1, EDGE_WEAR_FLOOR + EDGE_WEAR_RISE * edge)` is the
 * whole of it, and it is what makes the texture read as a crown rather than as
 * uniform grain.
 */
const EDGE_WEAR_FLOOR = 0.45;
/** @see EDGE_WEAR_FLOOR */
const EDGE_WEAR_RISE = 0.35;

/** The body's `edge` value: everything two columns or more off the kerb. */
const BODY_EDGE = 2;

/** Floor-divide by {@link STREET_PATCH_SPAN}, correct for negative columns. */
function patchCell(v: number): number {
  return Math.floor(v / STREET_PATCH_SPAN);
}

/** Painted columns per dash. */
export const MARKING_DASH = 2;
/** Dash period along the centre line: two painted, three clear. */
export const MARKING_PERIOD = 5;

/**
 * Columns of centre line kept clear either side of a junction's carriageway.
 *
 * It has to cover the zebra the streetscape lays on every approach, plus a
 * column of breathing room: `CROSSING_SETBACK` (1) + `CROSSING_DEPTH` (2) + 1.
 * The constants are duplicated rather than imported because `streetscape.ts`
 * imports *this* module, and the cycle is not worth a shared constants file.
 */
export const MARKING_JUNCTION_CLEAR = 4;

/** The surfacing states for each street width class, plus the paint. */
interface StreetStateSet {
  readonly avenue: RoadStates;
  readonly street: RoadStates;
  readonly lane: RoadStates;
  /** `street.marking` — the dashed centre line. */
  readonly marking: number;
}

/**
 * Resolve the urban material class.
 *
 * Precedence is palette symbol, then theme table, then the rural states —
 * so `style.palettes` still overrides everything and a document that declares
 * nothing gets a street that matches the buildings beside it.
 *
 * The verge deliberately reuses the carriageway: see the note on
 * {@link surfaceStreetGraph}.
 */
function resolveStreetStates(
  palette: Palette,
  stack: PrismarineStack,
  rural: RoadStates,
  theme: string | undefined,
  seed: Seed256 | undefined,
  wearChance: number | undefined,
  breakUp: { spec: StreetBreakUp; mark: Uint8Array; region: Region } | undefined,
  /**
   * True when `theme` is a *district's* theme rather than the settlement root's
   * (F10). The palette's `street.*` symbols are then skipped: they were resolved
   * against the root theme, and letting them win would defeat the very override
   * that put this district in a different family.
   */
  scoped: boolean = false,
): StreetStateSet {
  const materials = streetMaterials(theme);
  const named = (name: string, fallback: number): number =>
    stack.blockByName(name.replace(/^minecraft:/, ""))?.stateId ?? fallback;
  const at = (
    symbol: string,
    name: string,
    fallback: number,
  ): ((x: number, z: number) => number) => {
    if (!scoped && palette.has(symbol)) return (x, z) => palette.stateAt(symbol, x, z);
    const id = named(name, fallback);
    return () => id;
  };

  const body = at(STREET_CARRIAGEWAY_SYMBOL, materials.carriageway, rural.surface(0, 0));
  const worn = at(STREET_CARRIAGEWAY_WORN_SYMBOL, materials.worn, body(0, 0));
  const lane = at(STREET_LANE_SYMBOL, materials.lane, body(0, 0));
  // The border and the gutter: two more members of the same family, resolved by
  // the same "symbol, else theme table" idiom as the body. `street.curb` is the
  // sidewalk kerb's own symbol on purpose — where a sidewalk flanks the road the
  // two courses are one continuous line of one material, and where none does the
  // carriageway lays it alone, which is the coverage hole this closes.
  const kerb = at(STREET_KERB_SYMBOL, materials.kerb, body(0, 0));
  const course = at(STREET_COURSE_SYMBOL, materials.course, body(0, 0));
  // No wall clock, no `Math.random`, no transcendentals: the wear draw is the
  // column's own hash, so the same document and seed give the same patching
  // forever, whatever order the segments were walked in.
  const wearSeed = seed === undefined ? 0x5157_2ea1 : detailSeed(seed, "street.wear");
  const wear = wearChance === undefined ? STREET_WEAR_CHANCE : clamp01(wearChance);
  // Two draws, one hash stream, no sequential RNG: the coarse one places the
  // patch, the fine one frays its edge, and `edge` thins both towards the kerb
  // so the road wears down its travelled crown. Their product keeps the overall
  // worn share at `wear`, so `roads.wearIntensity` still means what it meant.
  const painted = (x: number, z: number, edge: number = BODY_EDGE): number => {
    const centrality = Math.min(1, EDGE_WEAR_FLOOR + EDGE_WEAR_RISE * edge);
    const local = wear * centrality * STREET_PATCH_SPREAD;
    if (hash2(wearSeed, patchCell(x), patchCell(z), STREET_PATCH_SALT) >= local) return body(x, z);
    if (hash2(wearSeed, x, z, STREET_WEAR_SALT) >= STREET_PATCH_KEEP) return body(x, z);
    return worn(x, z);
  };
  /** The body plus the dithered gutter course, keyed on the clamped `edge`. */
  const textured = (x: number, z: number, edge: number = BODY_EDGE): number =>
    edge === 1 && hash2(wearSeed, x, z, STREET_GUTTER_SALT) < GUTTER_DENSITY
      ? course(x, z)
      : painted(x, z, edge);
  // §7.3: past worn is broken. The draw is the column's own hash on its own
  // salt, so turning the break-up on never moves the wear pattern under it —
  // a broken column is a column that *would* have been worn or clean, decided
  // independently, which is what keeps `decline 0.79` and `0.8` comparable.
  const soilA = named("coarse_dirt", painted(0, 0));
  const soilB = named("grass_block", soilA);
  const carriageway =
    breakUp === undefined
      ? textured
      : (x: number, z: number, edge: number = BODY_EDGE): number => {
          const { spec, mark, region } = breakUp;
          const i = x - region.x0;
          const j = z - region.z0;
          if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return textured(x, z, edge);
          const idx = j * region.width + i;
          const ruin = spec.ruinField[idx] as number;
          const local = spec.chance * (STREET_BREAK_FLOOR + (1 - STREET_BREAK_FLOOR) * ruin);
          if (hash2(wearSeed, x, z, STREET_BREAK_SALT) >= local) return textured(x, z, edge);
          mark[idx] = 1;
          return hash2(wearSeed, x, z, STREET_BREAK_MIX_SALT) < 0.55 ? soilA : soilB;
        };
  // A broken street loses its kerb where it loses its body: the border runs
  // through the same break-up draw, so a ruined avenue does not keep a crisp
  // dressed edge around a road that has gone back to soil.
  const border =
    breakUp === undefined
      ? kerb
      : (x: number, z: number): number => {
          const { spec, mark, region } = breakUp;
          const i = x - region.x0;
          const j = z - region.z0;
          if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return kerb(x, z);
          const idx = j * region.width + i;
          const ruin = spec.ruinField[idx] as number;
          const local = spec.chance * (STREET_BREAK_FLOOR + (1 - STREET_BREAK_FLOOR) * ruin);
          if (hash2(wearSeed, x, z, STREET_BREAK_SALT) >= local) return kerb(x, z);
          mark[idx] = 1;
          return hash2(wearSeed, x, z, STREET_BREAK_MIX_SALT) < 0.55 ? soilA : soilB;
        };

  const paved: RoadStates = { ...rural, surface: carriageway, shoulder: border, urban: true };
  return {
    avenue: paved,
    street: paved,
    lane: { ...rural, surface: lane, shoulder: border, urban: true },
    marking: !scoped && palette.has(STREET_MARKING_SYMBOL)
      ? palette.state(STREET_MARKING_SYMBOL)
      : named(materials.marking, body(0, 0)),
  };
}

/**
 * The centre-line columns of one avenue: dashed, and clear of every junction.
 *
 * A dash laid through an intersection is a dash under the zebra the
 * streetscape paints there, and the zebra has to win — the streetscape runs
 * after this pass and would overwrite it anyway, but leaving the line out
 * altogether is what a real stop line looks like.
 */
function markableCells(
  path: readonly { x: number; z: number; y: number }[],
  graph: StreetGraph,
  width: number,
): { x: number; z: number }[] {
  let widest = width;
  for (const s of graph.segments) if (s.width > widest) widest = s.width;
  const clear = ((widest - 1) >> 1) + MARKING_JUNCTION_CLEAR;
  const out: { x: number; z: number }[] = [];
  for (const [i, cell] of path.entries()) {
    if (i % MARKING_PERIOD >= MARKING_DASH) continue;
    let nearJunction = false;
    for (const j of graph.intersections) {
      if (Math.abs(cell.x - j.x) <= clear && Math.abs(cell.z - j.z) <= clear) {
        nearJunction = true;
        break;
      }
    }
    if (nearJunction) continue;
    out.push({ x: cell.x, z: cell.z });
  }
  return out;
}

/**
 * Paint the collected avenue centre lines.
 *
 * The guard is exact rather than approximate: a column is repainted only when
 * its current surface is *still* the carriageway state this pass would write
 * there. Anything else — a graded step, a plaza, a lane that crossed later —
 * already owns the column and keeps it.
 */
function paintCentreLines(
  region: Region,
  plan: ColumnPlan,
  road: Uint8Array,
  paved: Uint8Array,
  water: Uint8Array,
  /**
   * Each avenue carries the state set it was *surfaced* from (F10), so a
   * district in its own material theme gets that theme's centre line rather than
   * the root's — and the exactness guard below compares against the very
   * function that painted the column.
   */
  avenues: readonly {
    readonly cells: readonly { x: number; z: number }[];
    readonly states: RoadStates;
    readonly marking: number;
  }[],
): void {
  for (const avenue of avenues) {
    for (const cell of avenue.cells) {
      if (!inside(region, cell.x, cell.z)) continue;
      const idx = index(region, cell.x, cell.z);
      if (road[idx] !== 1 || paved[idx] === 1 || water[idx] === 1) continue;
      if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
      // The centre column of an avenue is always body (`BODY_EDGE`): an avenue is
      // wide enough that its middle is never the border or the gutter, so this
      // reproduces the exact state the dress phase wrote there. A column some
      // narrower street later claimed as *its* kerb fails the test and keeps it,
      // which is the guard doing its job.
      if (plan.surface[idx] !== avenue.states.surface(cell.x, cell.z, BODY_EDGE)) continue;
      plan.surface[idx] = avenue.marking;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the terminus landing — a street yields to the flight it dies against        */
/* -------------------------------------------------------------------------- */

/**
 * Drop, in blocks, at which a street's terminal columns are yielded.
 *
 * Two, because two is the drop at which a step stops being a step: the
 * pedestrian graph joins columns whose feet differ by one, so a street standing
 * two or more above the flight beside it is not connected to it however short
 * the gap, and at three the walkability audit calls the edge an **unserved
 * face** (`emit/walkability.ts`, `EARN_RATIO`).
 */
export const LANDING_MIN_DROP = 2;

/**
 * Longest landing, in columns, and it is {@link MAX_TREAD_CUT} for the same
 * reason the tread law is.
 *
 * The landing is a **recess cut into the terrace**, exactly like the slot
 * `synthesizeTreads` may cut to begin a descent, and it is bounded by the same
 * number so that one law cannot dig deeper into a platform than the other. In
 * practice the bound almost never binds: the run a landing needs is derived
 * from the drop it stages, one column per block, so a three-block riser yields
 * two columns and stops.
 */
export const LANDING_RUN_MAX = MAX_TREAD_CUT;

/**
 * No corridor level known at this column.
 *
 * `Int32Array`'s own floor, deliberately: the sentinel is stored in one, and a
 * value outside 32 bits comes back truncated — `Number.MIN_SAFE_INTEGER` reads
 * back as `0`, which is a perfectly plausible level and makes every column in
 * the region look like a corridor.
 */
const NO_CORRIDOR = -0x8000_0000;

/**
 * Where a street dies against a flight, the **street** yields — §5.4's verge
 * opening, and Kai's ruling of 2026-08-07.
 *
 * The situation, walked on `hillside_town` and diagnosed to the column: a
 * terrace street's band pinches out one column short of the flight running down
 * past it, and the verge line between them carries the whole terrace riser in
 * one step — three blocks at (5, 44). It is not fixable on the verge, and the
 * proof is one line: the street's edge and the flight's treads are both
 * 1-Lipschitz lines falling in *parallel*, so no amount of work on the column
 * between them makes them meet. Something has to give ground, and the ranking
 * says which: a flight arrives at a street and a street does not arrive at a
 * flight, so the flight's levels are fixed and the **street's terminal columns
 * are the negotiable ones**.
 *
 * So they are yielded. A street column standing {@link LANDING_MIN_DROP} or more
 * above the flight corridor beside it steps down to one block above it, and the
 * street columns behind it step in turn, one block per column, until they meet
 * the level the street was already at. The run is not a constant: it is
 * `drop − 1` columns, derived from the geometry, which is exactly the arc a
 * stair of one-block steps needs and is why the three-block riser at (5, 44)
 * yields two columns and the terrace behind them does not move.
 *
 * Three properties this is built to have:
 *
 * 1. **It is a rule of the form, not a coordinate patch.** The seed is a
 *    predicate on any street column beside any flight, so the same situation
 *    anywhere on any fixture gets the same landing.
 * 2. **It only ever lowers, and only by one block per column.** The result is a
 *    1-Lipschitz surface joined to the street plane it cuts into, so the columns
 *    it moves stay connected to the ones it does not — a landing that stranded
 *    its own terminus would trade an unserved face for an orphan.
 * 3. **The corridor is the flight's, verge included.** The column between the
 *    street and the tread is unowned — it is the shoulder the blend lays flush
 *    with the flight — so seeding on flight *ownership* alone would never fire
 *    at the one place it is needed. A column no job owns that touches a tread
 *    takes that tread's level, and that is the corridor the street measures
 *    itself against.
 *
 * `cart` roles are deliberately **not** corridor: a carriage spine is graded at
 * 1 in 6 and meets its streets at junctions the pins already reconcile, so it
 * never presents the riser this exists to open.
 */
export function terminusLandings(
  region: Region,
  jobs: readonly { readonly role: "carriageway" | "steps" | "cart" }[],
  owner: Int32Array,
  columnY: Int32Array,
  blocked: Uint8Array,
  paved: Uint8Array,
  water: Uint8Array,
): ReadonlyMap<number, number> {
  const cells = region.width * region.depth;
  const roleOf = (k: number): "carriageway" | "steps" | "cart" | undefined => {
    const j = owner[k] as number;
    return j < 0 ? undefined : jobs[j]?.role;
  };
  /** The level of the flight corridor at a column, or {@link NO_CORRIDOR}. */
  const corridor = new Int32Array(cells).fill(NO_CORRIDOR);
  let anyFlight = false;
  for (let k = 0; k < cells; k++) {
    if (roleOf(k) !== "steps") continue;
    corridor[k] = columnY[k] as number;
    anyFlight = true;
  }
  // The early out is what keeps a town with no flight in it byte-identical: not
  // one array is walked twice and not one column is looked at again.
  if (!anyFlight) return new Map();
  // The verge: a column nobody owns, 4-adjacent to a tread, is the shoulder that
  // will be blended flush with it, so it stands at the tread's level. The lowest
  // adjacent tread wins — a shoulder between two treads is at the foot of the
  // step, not at its head.
  const verge = Int32Array.from(corridor);
  for (let z = region.z0; z < region.z0 + region.depth; z++) {
    for (let x = region.x0; x < region.x0 + region.width; x++) {
      const k = index(region, x, z);
      if ((owner[k] as number) >= 0) continue;
      let best = NO_CORRIDOR;
      for (const [dx, dz] of LANDING_NEIGHBOURS) {
        const nx = x + dx;
        const nz = z + dz;
        if (!inside(region, nx, nz)) continue;
        const n = index(region, nx, nz);
        if (roleOf(n) !== "steps") continue;
        const y = columnY[n] as number;
        if (best === NO_CORRIDOR || y < best) best = y;
      }
      verge[k] = best;
    }
  }

  /** The level each yielded column steps down to; unset is `NO_CORRIDOR`. */
  const target = new Int32Array(cells).fill(NO_CORRIDOR);
  const queue: number[] = [];
  const yieldable = (k: number): boolean => {
    const role = roleOf(k);
    if (role === undefined || role === "steps") return false;
    // Nothing this pass may not move the ground under: a foreign footprint, a
    // plaza that surfaced itself, a deck over water.
    return blocked[k] !== 1 && paved[k] !== 1 && water[k] !== 1;
  };
  for (let z = region.z0; z < region.z0 + region.depth; z++) {
    for (let x = region.x0; x < region.x0 + region.width; x++) {
      const k = index(region, x, z);
      if (!yieldable(k)) continue;
      const y = columnY[k] as number;
      let foot = NO_CORRIDOR;
      for (const [dx, dz] of LANDING_NEIGHBOURS) {
        const nx = x + dx;
        const nz = z + dz;
        if (!inside(region, nx, nz)) continue;
        const c = verge[index(region, nx, nz)] as number;
        if (c === NO_CORRIDOR || y - c < LANDING_MIN_DROP) continue;
        if (foot === NO_CORRIDOR || c < foot) foot = c;
      }
      if (foot === NO_CORRIDOR) continue;
      // The cap is a **clamp, not a refusal**. Refusing a riser too deep to
      // stage leaves the landing beside it standing four blocks over the column
      // that was not staged — the rule would cut its own cliff. Clamping cuts as
      // deep as the tread law may and leaves the remainder to the wall that was
      // always going to hold it, and it keeps the seeds themselves 1-Lipschitz,
      // which is what makes the walk below lay a staircase rather than a step.
      target[k] = Math.max(foot + 1, y - LANDING_RUN_MAX);
      queue.push(k);
    }
  }
  // One block per column, back into the street, 4-connected — the adjacency the
  // walkability audit measures a face over, so a step this walk lays is a step
  // that audit can see. It terminates on its own: a column whose target has
  // climbed back to the level the street was already at is not lowered, and
  // there is nothing beyond it to relax.
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head] as number;
    const y = target[k] as number;
    const x = region.x0 + (k % region.width);
    const z = region.z0 + Math.floor(k / region.width);
    for (const [dx, dz] of LANDING_NEIGHBOURS) {
      const nx = x + dx;
      const nz = z + dz;
      if (!inside(region, nx, nz)) continue;
      const n = index(region, nx, nz);
      if (!yieldable(n)) continue;
      const next = y + 1;
      if (next >= (columnY[n] as number)) continue;
      const seen = target[n] as number;
      if (seen !== NO_CORRIDOR && seen <= next) continue;
      target[n] = next;
      queue.push(n);
    }
  }

  const out = new Map<number, number>();
  for (let k = 0; k < cells; k++) {
    const y = target[k] as number;
    if (y === NO_CORRIDOR) continue;
    if (y >= (columnY[k] as number)) continue;
    out.set(k, y);
  }
  return out;
}

/** 4-connected, because that is the adjacency a face and a footfall are measured over. */
const LANDING_NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Write one route into the column plan.
 *
 * The cross-section is a {@link SweptProfile} band system resolved by the
 * sweep engine: the centre lane gets `@road.surface`, the outermost band the
 * shoulder mix, and any cell where the graded profile steps gets `@road.step`
 * so the change of level reads as a deliberate stair rather than a glitch.
 *
 * **The bands come from the true line, not from the raster.** This function
 * used to walk the rasterized cells and offset each one along its own local
 * perpendicular. On an axis-aligned run that is exactly right; on a diagonal
 * avenue it dithers — the perpendicular flips between two orthogonal columns
 * step by step, so the kerb comes out as a two-block mix rather than one
 * border course, which is precisely what the first walk of the headline city
 * showed. `sweptColumns` instead recovers the polyline the raster is a picture
 * of and asks each nearby column for its **perpendicular distance** to it, so
 * a diagonal gets one clean edge course and a coherent carriageway between
 * them. The lane lattice is the one this function always used
 * ({@link carriagewaySpans}), so a straight road is unchanged block for block.
 *
 * **And the level comes from the arc frame, not from the raster either.** A
 * column's height used to be read at `path[spot.index].y` — the height of
 * whichever *rasterized cell* the column projected nearest to. On a diagonal run
 * the raster carries √2 cross-sections per block of street, so one block of
 * carriageway was written at two heights, and those two cross-sections interleave
 * on the lattice: every column's four neighbours belong to the other one. That is
 * the chessboard of full blocks and half slabs the hill-town walk reported, and
 * it is not noise. {@link ArcLevels} gives one level per block of arc length, so
 * a cross-section is level across its width and a grade change is one clean step
 * across the whole carriageway. See {@link ArcFrame}.
 *
 * **`ownership`, when present, splits geometry from material.** Without it —
 * which is every call the village road pass makes — this writes everything it
 * sweeps, exactly as it always has. With it (the street surfacer's dress phase)
 * only the columns this segment *owns* have their level, fluid top, snow,
 * subsurface, soil and road tag written; every swept column is still painted, in
 * the same last-write-wins traversal order. See
 * `docs/COURTYARDS-AND-LEVELS-v0.md` §2.3 for why that split is what makes a
 * flat world provably unmoved.
 *
 * **What it no longer does is move the ground** (`docs/GROUND-CONTRACT-v0.md`
 * §9, WP-3). {@link declareRoute} computes this run's `GroundClaim`s from exactly
 * the filters below, the caller commits them through the driver, and the driver
 * writes `ground`, `fluidTop` and `snow`. What is left here is §9 step 2's
 * "second loop": the surface mix, the subsurface, the soil, the road tag, the
 * level mask and the occupancy claim — and it runs over the columns this segment
 * **claimed**, never the ones it won, because ownership decides geometry and
 * deliberately not material.
 */
function surfaceRoute(
  region: Region,
  plan: ColumnPlan,
  blocked: Uint8Array,
  road: Uint8Array,
  roadY: Int32Array,
  spots: readonly SweptColumn[],
  /** The run's carriageway width — what the border and gutter courses key on. */
  width: number,
  levels: ArcLevels,
  states: RoadStates,
  occupancy: OccupancyGrid | undefined,
  paved: Uint8Array,
  water: Uint8Array,
  bridged: Uint8Array,
  /**
   * Per swept column: does it sit on a face rather than a floor?
   *
   * **Computed by the caller, before this run's levels reach the plan**, and that
   * timing is the whole of it: the relief test has to see the land, not the road.
   * It used to be taken here from `plan.ground` on the way in, which was the same
   * instant because this function did the writing; now the driver writes first
   * (§9, step 2), so a test taken here would read the road it is asking about.
   * See {@link reliefOf}.
   */
  steep: readonly boolean[],
  ownership?: {
    readonly owner: Int32Array;
    readonly job: number;
    /** 1 where the owning segment's profile steps — a step is geometry. */
    readonly step: Uint8Array;
    /** §5.4's yielded terminal columns, `idx` → the level they stepped down to. */
    readonly landing?: ReadonlyMap<number, number>;
  },
): void {
  // The same lattice `carriagewaySpans` walks, so `lane` and the edge distance
  // below are measured in the coordinate the sweep produced them in.
  const halfWidth = (width - 1) >> 1;
  const laneLo = halfWidth === 0 ? 0 : -halfWidth;
  const laneHi = width - 1 - halfWidth;
  for (const [n, spot] of spots.entries()) {
    const x = spot.x;
    const z = spot.z;
    const idx = spot.idx;
    // The level of this column's **cross-section**, keyed on arc length — or, on
    // a column the run yielded to a stepped landing, the level it stepped to.
    // One map, read by the declaration and by the paint, so the ground the
    // resolver was told about and the ground that gets surfaced are one number.
    const y = ownership?.landing?.get(idx) ?? levels.at(spot.arc);
    // Whether this segment may move the ground here. Painting is not gated on
    // it: ownership decides geometry and deliberately not material.
    const owned = ownership === undefined || ownership.owner[idx] === ownership.job;
    const isStep = ownership === undefined ? levels.steps(spot.arc) : ownership.step[idx] === 1;
    // A bridge cell is *not* surfaced. The whole point of a deck is that the
    // water underneath it is undisturbed — rewriting the column here would
    // fill the channel with dirt path and, worse, would move `ground` and
    // `fluidTop` under a river the fluid validator has already settled.
    // It still counts as road, so the network stays connected and the
    // canopy clip keeps the deck clear.
    if (water[idx] === 1) {
      if (!owned) continue;
      road[idx] = 1;
      roadY[idx] = y;
      bridged[idx] = 1;
      if (occupancy !== undefined) claim(occupancy, idx);
      continue;
    }
    // Never surface a foreign footprint, even in the shoulder.
    if (blocked[idx] === 1) continue;
    // The plaza surfaced itself; a lane crossing the green is *on* the green.
    // It still counts as road for routing, occupancy and lantern spacing.
    if (paved[idx] === 1) {
      if (!owned) continue;
      road[idx] = 1;
      roadY[idx] = plan.ground[idx] as number;
      if (occupancy !== undefined) claim(occupancy, idx);
      continue;
    }

    const outer = spot.outer;
    // The urban cross-section, as three values (§F10). `edgeRaw` is the column's
    // distance from the nearer carriageway edge; the clamp below is what turns a
    // number into the border / gutter / body the texture distinguishes, and it is
    // where both width floors live — a road too narrow for a border gets none,
    // and one too narrow for a gutter gets body all the way in from the kerb.
    const edgeRaw = Math.min(spot.lane - laneLo, laneHi - spot.lane);
    let edge = BODY_EDGE;
    if (states.urban === true) {
      if (width >= KERB_MIN_WIDTH && edgeRaw <= 0) edge = 0;
      else if (width >= GUTTER_MIN_WIDTH && edgeRaw === 1) edge = 1;
    }
    // The surface mix is sampled at the *cluster* cell wherever the ground the
    // road is cut into is a face rather than a floor. A carriageway or shoulder
    // mix drawn per column is fine underfoot on the flat and reads as static on
    // a gorge apron, where every column is a visible vertical facet. Relief is
    // read before this column is flattened, so the test sees the land, not the
    // road. On gentle ground the draw is byte-for-byte what it always was.
    const s = steep[n] === true ? clusterCell(x, z) : { x, z };
    if (owned) {
      // `ground`, `fluidTop` and `snow` are the driver's, from this run's
      // committed claim (§9a.1 rule 2). What is left is material.
      //
      // …except on a column that presents a tall exposed face. A street along
      // the lip of a cut would otherwise repaint the substrate an earlier pass
      // finished as revetment, and the face below the carriageway shows courses
      // of raw dirt (see {@link presentsExposedFace}). The surface block below
      // still paves the top; only the face's material is left alone. `soil` is
      // raised and never shortened, so an earlier `deepen` keeps its depth.
      if (!presentsExposedFace(plan, region, x, z)) {
        plan.subsurface[idx] = states.subsurface;
        if (plan.soil[idx] === 0) plan.soil[idx] = 1;
      }
      road[idx] = 1;
      roadY[idx] = y;
      if (occupancy !== undefined) claim(occupancy, idx);
    }
    plan.surface[idx] = isStep
      ? states.step
      : states.urban === true
        ? edge === 0
          ? states.shoulder(s.x, s.z)
          : states.surface(s.x, s.z, edge)
        : outer
          ? states.shoulder(s.x, s.z)
          : states.surface(s.x, s.z);
  }
}

/**
 * Which of a run's swept columns sit on a **face** rather than a floor.
 *
 * The surface mix is sampled at the *cluster* cell wherever the ground the road
 * is cut into is a face: a mix drawn per column is fine underfoot on the flat and
 * reads as static on a gorge apron, where every column is a visible vertical
 * facet. The read has to be taken **before** the run's own levels reach the
 * ground, or the test sees the road instead of the land — which is why this is a
 * function the caller invokes at a chosen moment rather than a line inside
 * {@link surfaceRoute}. The street surfacer passes its frozen pass-entry
 * snapshot; the road pass passes the view, immediately before its commit.
 */
function reliefOf(
  region: Region,
  // Read-only by intent — a converted pass may not write through its own read
  // (§9a.4) — and widened for `isSteepGround`, which predates the alias and takes
  // the array itself. The one place the two meet, and it reads.
  ground: ReadonlyInt32Array,
  spots: readonly SweptColumn[],
): boolean[] {
  const field = ground as Int32Array;
  return spots.map((spot) => isSteepGround(region, field, spot.x, spot.z));
}

/**
 * What one surfaced run claims (`docs/GROUND-CONTRACT-v0.md` §3.6b, §3.9b).
 *
 * The declaration half of {@link surfaceRoute}, and deliberately the *same*
 * filters read in the *same* order: a wet column the run owns is a deck, so the
 * water beneath it is declared rather than levelled (`clearance` at the fluid
 * surface, plus `preserve` — the deck is meant to stand over its channel and the
 * column beneath it must not move); a foreign footprint is never surfaced by
 * anybody; a plaza surfaced itself and keeps its own level; and a column some
 * other segment owns is that segment's to level, not this one's.
 *
 * Pure: it reads the view and writes only its return value, so a pass may
 * declare, commit, and only then dress.
 */
function declareRoute(
  view: GroundView,
  blocked: Uint8Array,
  spots: readonly SweptColumn[],
  levels: ArcLevels,
  paved: Uint8Array,
  water: Uint8Array,
  ownership?: {
    readonly owner: Int32Array;
    readonly job: number;
    /** §5.4's yielded terminal columns, `idx` → the level they stepped down to. */
    readonly landing?: ReadonlyMap<number, number>;
  },
): { readonly level: GroundClaim[]; readonly bridged: GroundClaim[] } {
  const level: GroundClaim[] = [];
  const bridged: GroundClaim[] = [];
  for (const spot of spots) {
    const idx = spot.idx;
    const owned = ownership === undefined || ownership.owner[idx] === ownership.job;
    if (water[idx] === 1) {
      if (owned) bridged.push({ idx, y: view.fluidTop[idx] as number });
      continue;
    }
    if (blocked[idx] === 1) continue;
    if (paved[idx] === 1) continue;
    if (!owned) continue;
    level.push({ idx, y: ownership?.landing?.get(idx) ?? levels.at(spot.arc) });
  }
  return { level, bridged };
}

/**
 * Grade the two columns either side of a lane into it.
 *
 * Grading gives the lane a 1-Lipschitz profile; it says nothing about what the
 * lane's *edge* looks like. Across a slope that edge is a cut face on the
 * uphill side and a fill face on the downhill one, and at the road's own
 * grade those faces can be several blocks tall — which is what makes a lane
 * read as a shelf bulldozed across a field rather than a track worn into it.
 *
 * The fix is a verge: within {@link ROAD_SHOULDER_REACH} columns of the lane,
 * the ground is pulled to within `k + 1` blocks of the road surface at ring
 * `k`, so the land ramps up to (or down to) the lane over two columns instead
 * of stepping. Only the *height* moves — the surface block is left alone, so a
 * lane through grass keeps grass right up to its shoulder.
 *
 * Three columns are never touched: anything claimed (road, plaza, footprint),
 * anything wet, and anything **next to** something wet. The last is the fluid
 * invariant: lowering a dry column beside a river opens a face the river would
 * flow into on the first tick, and a bridge that drains its own channel is a
 * worse defect than the embankment this fixes.
 *
 * **Nearest, not first** (`docs/COURTYARDS-AND-LEVELS-v0.md` §2.4). The dilation
 * is a proper multi-source BFS: a column takes its level from the road it is
 * *nearest* to, and a tie between two roads at different levels resolves to the
 * **lower** one. The old form marked a column claimed the instant any frontier
 * cell reached it, so a column between an upper street and a lower one took
 * whichever the row-major scan happened to touch first — and since the blend
 * moves only the *height* and never the surface block, taking the upper level is
 * literally a grass column standing at pavement height in the middle of a
 * street. A verge should meet the lower street and let the upper one retain.
 *
 * `seam`, when given, is never written: a column where the ground changes level
 * by more than the ring allowance is not a bank to be smoothed, it is a face, and
 * §3.4 owns what stands on it.
 *
 * **Converted at WP-3** (`docs/GROUND-CONTRACT-v0.md` §3.6b's last bullet, §9).
 * The pass still computes the BFS — the resolver only arbitrates (§13.9) — but
 * the ring targets are now a `verge` profile, committed through the driver.
 * `verge` is rank 140, the last built rank there is, so a bank can only move
 * ground nothing else claimed: that is inversion I5, and it replaces the
 * hand-written guard list (claimed / wet / near-wet / on the `seam` mask) with
 * one rank. The guards below stay for this round, because deleting a defence the
 * rank makes redundant is §10's work and not a conversion's.
 *
 * The rings are collected before anything is committed, which is sound because a
 * column belongs to exactly one ring: ring `k + 1` reads `plan.ground` on columns
 * ring `k` never wrote, so the answer is the same one the interleaved form gave.
 */
function blendShoulders(
  region: Region,
  plan: ColumnPlan,
  view: GroundView,
  driver: GroundDriver,
  /** `<pass>#shoulders` — the `verge` claim's source, unique and stable (§9 step 3). */
  source: string,
  road: Uint8Array,
  roadY: Int32Array,
  blocked: Uint8Array,
  paved: Uint8Array,
  seam?: Uint8Array,
): readonly GroundClaim[] {
  const declared: GroundClaim[] = [];
  const n = region.width * region.depth;
  // Ring dilation of the finished road mask, not perpendicular offsets from a
  // centre line. The offset form was the obvious one and it is wrong on a
  // diagonal: cells at perpendicular distance 2 and 3 from a 45° lane are
  // themselves √2 apart, so the verge came out as a checkerboard of graded and
  // ungraded columns — clearly visible from the map as a dithered swathe
  // beside every diagonal lane. A dilation has no such gaps by construction,
  // and it needs no notion of heading at all.
  const seeds = new Uint8Array(road);
  let frontier: Uint8Array = seeds;
  const claimed = new Uint8Array(n);
  const height = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    if (road[k] === 1) {
      claimed[k] = 1;
      const y = roadY[k] as number;
      // Defence in depth against an undeclared level (see the hub seed in
      // `buildRoadNetwork`). A verge is a bank beside a lane; it must be
      // structurally incapable of moving ground the height of a mountain. A
      // road cell whose declared level sits *below the sea* while its own
      // column stands above it is not a road level at all — it is a hole in
      // the array — so it is claimed (nothing may grade it) and never seeds.
      if (y < plan.seaLevel && (view.ground[k] as number) > plan.seaLevel) {
        seeds[k] = 0;
        continue;
      }
      height[k] = y;
    }
  }

  for (let ring = 1; ring <= ROAD_SHOULDER_REACH; ring++) {
    const next = new Uint8Array(n);
    // The whole ring is collected before anything is marked claimed, so every
    // road at this distance gets a vote and the lowest of them wins. Marking
    // inside the scan is what made the answer depend on row-major order.
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        const idx = j * region.width + i;
        if (frontier[idx] !== 1) continue;
        const y = height[idx] as number;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= region.width || jj >= region.depth) continue;
            const k = jj * region.width + ii;
            if (claimed[k] === 1) continue;
            if (next[k] === 1) {
              if (y < (height[k] as number)) height[k] = y;
              continue;
            }
            next[k] = 1;
            height[k] = y;
          }
        }
      }
    }
    for (let k = 0; k < n; k++) if (next[k] === 1) claimed[k] = 1;

    const allowed = ring;
    for (let j = 0; j < region.depth; j++) {
      for (let i = 0; i < region.width; i++) {
        const idx = j * region.width + i;
        if (next[idx] !== 1) continue;
        if (blocked[idx] === 1 || paved[idx] === 1) continue;
        // A seam is a face, not a bank: smoothing it would undo the wall that
        // holds the platform above it.
        if (seam !== undefined && seam[idx] === 1) continue;
        if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
        const x = region.x0 + i;
        const z = region.z0 + j;
        // Lowering a dry column beside water opens a face the water would flow
        // into on the first tick. A verge is never worth draining a river for.
        if (nearFluid(region, plan, x, z)) continue;

        const y = height[idx] as number;
        const g = view.ground[idx] as number;
        const target = g > y + allowed ? y + allowed : g < y - allowed ? y - allowed : g;
        if (target === g) continue;
        declared.push({ idx, y: target });
      }
    }
    frontier = next;
  }

  if (declared.length > 0) {
    driver.commit([
      { source, sourceClass: "verge", kind: "profile", columns: declared, transition: "ramp" },
    ]);
    // §9 step 2's second loop, over the columns the blend **claimed**: a verge
    // moves only the height, never the surface block, so a lane through grass
    // keeps grass right up to its shoulder — and the soil depth follows the cut
    // whether or not the rank let the bank have the column.
    for (const claim of declared) {
      if (plan.soil[claim.idx] === 0) plan.soil[claim.idx] = 1;
    }
  }
  return declared;
}

/** True when `(x, z)` or any of its four neighbours holds a fluid. */
function nearFluid(region: Region, plan: ColumnPlan, x: number, z: number): boolean {
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const nz = z + dz;
    if (!inside(region, nx, nz)) continue;
    if (plan.fluidKind[index(region, nx, nz)] !== FluidKind.NONE) return true;
  }
  return false;
}

/** Unit heading at path index `i`, and the perpendicular used for the band. */
function headingAt(
  path: readonly { x: number; z: number }[],
  i: number,
): { px: number; pz: number } {
  const a = path[Math.max(0, i - 1)] as { x: number; z: number };
  const b = path[Math.min(path.length - 1, i + 1)] as { x: number; z: number };
  const dx = Math.sign(b.x - a.x);
  const dz = Math.sign(b.z - a.z);
  // Perpendicular of (dx, dz) is (-dz, dx); the band walks that axis.
  return dx === 0 && dz === 0 ? { px: 0, pz: 1 } : { px: dx, pz: -dz };
}

/**
 * Plant lamp posts along a route, alternating sides.
 *
 * A lamp is **two** fence posts and a lantern on top, not one. A single post
 * puts the light at eye level of the ground it stands on, and from any angle
 * above — which is every angle a render or a player on a hill has — it reads as
 * a lantern half-buried in the grass. Two courses lift it clear.
 *
 * Support is checked, not assumed: the post stands on the finished ground of a
 * dry, non-road, **unbuilt** column, and each block of the lamp rests on the
 * one below it. The unbuilt part is not hypothetical: the Terrarium's village
 * slice put a lane's lamp one column off the lane and one column *inside the
 * inn*, where it stood in the middle of the taproom floor as a two-block post
 * a player could not walk through. `blocked` already carries every building's
 * footprint — the router has been steering around them all along — so the
 * planter asks the same mask the routes did.
 *
 * The side alternates per route *and* per post, and which side a route starts
 * on is drawn from the node's `grammar` stream, so two parallel lanes do not
 * end up with all their lights on the same edge.
 */
function plantLanterns(
  region: Region,
  plan: ColumnPlan,
  road: Uint8Array,
  /** Columns the router treated as obstacles — building footprints included. */
  blocked: Uint8Array,
  path: readonly { x: number; z: number; y: number }[],
  width: number,
  spacing: number,
  states: RoadStates,
  out: StructureBlock[],
  rng: Rng,
  sides: Map<string, number>,
): void {
  const offset = ((width - 1) >> 1) + 1;
  let flip = rng.int(0, 1);
  for (let i = spacing; i < path.length; i += spacing) {
    const cell = path[i] as { x: number; z: number; y: number };
    const heading = headingAt(path, i);
    const side = flip === 0 ? 1 : -1;
    flip = 1 - flip;
    const x = cell.x + heading.pz * offset * side;
    const z = cell.z + heading.px * offset * side;
    if (!inside(region, x, z)) continue;
    const idx = index(region, x, z);
    if (road[idx] === 1) continue;
    if (blocked[idx] === 1) continue;
    if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
    const key = `${x},${z}`;
    if (sides.has(key)) continue;
    sides.set(key, side);
    const base = (plan.ground[idx] as number) + 1;
    out.push({ x, y: base, z, stateId: states.post });
    out.push({ x, y: base + 1, z, stateId: states.post });
    out.push({ x, y: base + 2, z, stateId: states.lantern });
  }
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Mark one column as road-occupied, in the union mask and the `road` tag. */
function claim(occupancy: OccupancyGrid, idx: number): void {
  occupancy.mask[idx] = 1;
  let tag = occupancy.byTag.get("road");
  if (tag === undefined) {
    tag = new Uint8Array(occupancy.mask.length);
    (occupancy.byTag as Map<string, Uint8Array>).set("road", tag);
  }
  tag[idx] = 1;
}

function stamp(region: Region, mask: Uint8Array, rect: Rect, value: number): void {
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(region, x, z)) continue;
      mask[index(region, x, z)] = value;
    }
  }
}

function unroutable(nodePath: string, from: string, to: string, why: string): LoamDiagnostic {
  return warning(
    "ROAD_UNROUTABLE",
    nodePath,
    `no road could be routed from "${from}" to the network hub "${to}": ${why}`,
    `move "${from}" onto ground the network can reach — a route may not cross water, lava or another building's footprint, so check for a lake or a wall of houses between the two`,
  );
}

/** Row-major column index. Callers must have checked {@link inside}. */
export function index(region: Region, x: number, z: number): number {
  return (z - region.z0) * region.width + (x - region.x0);
}

/**
 * Clamp a column into the region.
 *
 * A station of the arc frame is the true centre line rounded to the lattice, and
 * near the region's edge that rounding can land one column outside it. Reading
 * the nearest in-region column is at most one block from the point asked for; the
 * alternative is a hole in the elevation profile at the world's edge.
 */
export function clampX(region: Region, x: number): number {
  return x < region.x0 ? region.x0 : x > region.x0 + region.width - 1 ? region.x0 + region.width - 1 : x;
}

/** Clamp a column into the region. See {@link clampX}. */
export function clampZ(region: Region, z: number): number {
  return z < region.z0 ? region.z0 : z > region.z0 + region.depth - 1 ? region.z0 + region.depth - 1 : z;
}

/** True when `(x, z)` is a column of the region. */
/**
 * Least drop to an 8-neighbour that makes this column's side a *face* a viewer
 * reads as masonry rather than as a slope.
 */
export const EXPOSED_FACE_DROP = 2;

/**
 * True when the column presents a tall exposed vertical face.
 *
 * **The defect this exists for:** `ColumnPlan` carries exactly one `subsurface`
 * state per column, so a street running along the top of a cut writes its dirt
 * substrate into the same column whose exposed side an earlier pass finished as
 * revetment — and because the road runs later, it wins. The result is courses of
 * raw dirt under a contour street's edge, mid-face in the masonry, which is what
 * makes a hill town read as a quarry.
 *
 * The guard is materials-only: the carriageway's *surface* block still paves the
 * top of the column, and levels are untouched — the ground contract's driver and
 * resolver never see this.
 */
export function presentsExposedFace(plan: ColumnPlan, region: Region, x: number, z: number): boolean {
  if (!inside(region, x, z)) return false;
  const here = plan.ground[index(region, x, z)] as number;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (!inside(region, nx, nz)) continue;
      const there = plan.ground[index(region, nx, nz)] as number;
      if (here - there >= EXPOSED_FACE_DROP) return true;
    }
  }
  return false;
}

export function inside(region: Region, x: number, z: number): boolean {
  return (
    x >= region.x0 && x < region.x0 + region.width && z >= region.z0 && z < region.z0 + region.depth
  );
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/*
 * v0.2 §7 `road.network@0` — implemented vs deferred
 * --------------------------------------------------
 * implemented: `width` (2..3, this profile's shorthand for a one-class
 *   `hierarchy`), `lanterns`/`lanternSpacing` (this profile's shorthand for
 *   `lighting`), and the `road_stub`/`door` anchors.
 *
 * v0.2 §7: not yet — `anchors` selectors: every placed building is an anchor,
 *   selector syntax (`#tag:house`) is parsed by the validator and ignored here.
 * v0.2 §7: not yet — `pattern`; the network is always `minimal_spanning`-ish.
 * v0.2 §7: not yet — `hierarchy`, `blockSize`, `junctionStyle`, `curvature`.
 * v0.2 §7: not yet — `maxGrade`, `bridgeThreshold`, `tunnelThreshold`, `crown`.
 * implemented: `corridors()` at substage 3b (§4.9.6) — the network registers a
 *   frozen route corridor from its anchors' coarse points before anything is
 *   placed, `along`/`beside` bind to it, structures are costed against it, and
 *   the routing here prefers it (`ROAD_CORRIDOR_DISCOUNT`).
 *
 * v0.2 §4.9.6: not yet — the corridor is a *preference* here, not the hard
 *   channel the spec's "refinement inside those polygons" asks for, and there
 *   is no substage 3.5: no re-route-and-nudge round runs after placement, so a
 *   lane that leaves its corridor does not pull its `along` dependants after it
 *   (`LOAM-I409`/`LOAM-W408` are never emitted). See `ROAD_CORRIDOR_DISCOUNT`.
 * v0.2 §7.5: not yet — `corridors()` reserves one chain through the anchors,
 *   not a `pattern`-shaped graph, and an anchor with no coarse constraint
 *   contributes no waypoint.
 * v0.2 §4.9.6: not yet — the network is still not a *placed* node: no envelope,
 *   no yaw, no footprint of its own.
 * v0.2 §7.10: not yet — `LOAM-W430 DISCONNECTED_ROAD_GRAPH`; an unreachable
 *   anchor is reported per route as `LOAM-T209 ROAD_UNROUTABLE` instead.
 */

/**
 * Layout solver v1.
 *
 * Runs at substages 3c–3f: after the master height field is composed and
 * classified, before anything is materialized. It answers exactly one
 * question — where does each structure go — and answers it the way §4.7 asks:
 * deterministically, terminating, and accounting for every node in a report.
 *
 * The algorithm is deliberately simple, because §4.7's non-obligations say it
 * may be: **greedy insertion in document order over a seeded candidate pool,
 * then a bounded local-improvement pass.** No backtracking, no global
 * optimality, no SAT. Every constraint is either a domain restriction or a
 * cost, which is what lets a better solver drop in later without the language
 * moving.
 *
 * Determinism, concretely: candidate pools come from the node's `layout`
 * stream, iteration is document order then candidate index, ties break by the
 * earlier candidate, and there is no wall-clock, no `Math.random`, and no
 * hash-map iteration order anywhere in the loop.
 */

import {
  Rng,
  streamSeed,
  type Region,
} from "@terrainist/stdlib";
import {
  isImplementedConstraint,
  isTier2,
  strengthOf,
  weightOf,
  warning,
  type CanonicalConstraint,
  type LoamDiagnostic,
  type Yaw,
} from "@terrainist/spec";

import {
  clampInt,
  frameRect,
  frameNorm as computeFrameNorm,
  intersectRect,
  type Frame,
  type Point2,
  type Rect,
} from "./frames.js";
import {
  CORRIDOR_RESERVATION_COST,
  corridorOverlap,
  roadCorridors,
  type RoadCorridorAnchor,
  type RouteCorridor,
} from "./corridors.js";
import {
  coarseAtRegion,
  coarseZoneRegion,
  evaluateConstraint,
  type Candidate,
  type EvalContext,
} from "./cost.js";
import { footprintStats, terrainCost, terrainFeasible, type FootprintStats } from "./fitness.js";
import { resolvePorts, rotatedSize } from "./ports.js";
import {
  DEFAULT_BLEND,
  DEFAULT_CANDIDATES,
  DEFAULT_IMPROVEMENT_ROUNDS,
  DEFAULT_MAX_SLOPE,
  type ConstraintReport,
  type CorridorReport,
  type CoarseReport,
  type LadderRung,
  type LayoutNodeInput,
  type LayoutRequest,
  type LayoutResult,
  type OccupancyGrid,
  type PadEdit,
  type Placement,
  type ResolvedPort,
  type SolverNodeReport,
} from "./types.js";

// v0.2 §4.6 rungs 2–4: not yet — `tolerance` relaxation, shrinking a flexible
// envelope toward `minSize`, and growing a flexible parent are all declared in
// `LadderRung` and reported, but never applied: this solver's only composite is
// the root region, and no node resizes. `envelope.flexible`/`minSize` are
// therefore carried and ignored.
// v0.2 §4.3: not yet — `mirror` is always false; the solver chooses yaw only.

/** Cost difference below which a local-improvement move is not worth making. */
const IMPROVEMENT_EPSILON = 1e-9;

/** How far above sea level a footprint's lowest column must sit. */
const MIN_FREEBOARD = 1;

/** Fraction of the candidate pool drawn from the coarse zero-cost region. */
const COARSE_SAMPLE_SHARE = 0.7;

/** A scored candidate. */
interface Scored {
  readonly candidate: Candidate;
  readonly stats: FootprintStats;
  readonly terrain: number;
  readonly soft: number;
  readonly total: number;
  readonly feasible: boolean;
  readonly evals: readonly { index: number; cost: number; satisfied: boolean; feasible: boolean }[];
  /** How badly an infeasible candidate misses, for the last-resort fallback. */
  readonly penalty: number;
}

/** Place every structure node. */
export function solveLayout(request: LayoutRequest): LayoutResult {
  const { region, nodes } = request;
  const frame: Frame = { x0: region.x0, z0: region.z0, width: region.width, depth: region.depth };
  const norm = computeFrameNorm(frame);
  const diagnostics: LoamDiagnostic[] = [];
  const placed = new Map<string, Placement>();
  const reports = new Map<string, MutableNodeReport>();
  const pools = new Map<string, readonly Candidate[]>();
  const dropped: string[] = [];

  for (const node of nodes) {
    const ctx: EvalContext = {
      frame,
      frameNorm: norm,
      self: node,
      placed,
      nodes,
      ...(request.corridors === undefined ? {} : { corridors: request.corridors }),
      ...(request.products === undefined ? {} : { products: request.products }),
    };
    const pool = buildCandidates(node, ctx, request);
    pools.set(node.id, pool);

    const report: MutableNodeReport = {
      nodePath: node.nodePath,
      placed: false,
      size: node.size,
      appliedRungs: [],
      constraints: [],
      coarse: coarseReports(node, ctx),
      score: { terrain: 0, soft: 0, total: 0 },
      candidatesConsidered: pool.length,
    };
    reports.set(node.id, report);

    const demoted = new Set<number>();
    let best = bestOf(node, pool, ctx, request, demoted);

    // --- the relaxation ladder (§4.6) ---------------------------------------
    if (best === null && node.optional) {
      // The task's ordering: drop optional nodes before demoting anything.
      // v0.2 §4.6: not yet — the spec demotes (rung 5) before dropping (rung 6);
      // this solver drops first, so an optional node never silently costs a
      // sibling its declared constraint.
      report.appliedRungs.push("node_dropped");
      dropped.push(node.nodePath);
      diagnostics.push(
        warning(
          "NODE_DROPPED",
          node.nodePath,
          `no placement satisfies this node's hard constraints; it is optional, so it was dropped`,
          'relax a hard constraint (add "strength": "soft"), widen its envelope, or set "optional": false to see the conflict reported instead of the node disappearing',
        ),
      );
      continue;
    }

    if (best === null) {
      for (const index of demotionOrder(node, "coarse")) {
        demoted.add(index);
        report.appliedRungs.push("constraint_demoted");
        diagnostics.push(demotionDiagnostic(node, index, "coarse containment"));
        best = bestOf(node, pool, ctx, request, demoted);
        if (best !== null) break;
      }
    }
    if (best === null) {
      for (const index of demotionOrder(node, "other")) {
        demoted.add(index);
        report.appliedRungs.push("constraint_demoted");
        diagnostics.push(demotionDiagnostic(node, index, "constraint"));
        best = bestOf(node, pool, ctx, request, demoted);
        if (best !== null) break;
      }
    }
    if (best === null) {
      // v0.2 §4.6 rung 7: not yet — the spec *fails* the compile here, naming a
      // minimal conflicting set. This solver reports the conflict and places
      // the least-bad candidate anyway, so a repair loop always has a world to
      // look at.
      best = leastBad(node, pool, ctx, request, demoted);
      report.appliedRungs.push("unsatisfiable");
      diagnostics.push(
        warning(
          "UNSATISFIABLE",
          node.nodePath,
          "no candidate satisfies this node's hard constraints even after demotion; it was placed at the least-violating position",
          "loosen the constraints that fight each other — the solver report lists each one's final cost, and the largest is usually the one to soften",
        ),
      );
    }
    if (best === null) continue; // Only when the pool is empty (a degenerate region).

    if (report.appliedRungs.length === 0) report.appliedRungs.push("absorbed");
    commit(node, best, placed, report, demoted);
  }

  // --- bounded local improvement (§4.7 obligation 3: terminate) -------------
  const rounds = request.improvementRounds ?? DEFAULT_IMPROVEMENT_ROUNDS;
  let improvements = 0;
  let roundsRun = 0;
  for (let round = 0; round < rounds; round++) {
    roundsRun = round + 1;
    let moved = 0;
    for (const node of nodes) {
      const current = placed.get(node.id);
      const pool = pools.get(node.id);
      const report = reports.get(node.id);
      if (current === undefined || pool === undefined || report === undefined) continue;
      placed.delete(node.id);
      const ctx: EvalContext = {
      frame,
      frameNorm: norm,
      self: node,
      placed,
      nodes,
      ...(request.corridors === undefined ? {} : { corridors: request.corridors }),
      ...(request.products === undefined ? {} : { products: request.products }),
    };
      const demoted = new Set<number>(report.demotedIndices ?? []);
      const best = bestOf(node, pool, ctx, request, demoted);
      if (best !== null && best.total < report.score.total - IMPROVEMENT_EPSILON) {
        commit(node, best, placed, report, demoted);
        moved++;
      } else {
        placed.set(node.id, current);
      }
    }
    improvements += moved;
    if (moved === 0) break;
  }

  // --- products ------------------------------------------------------------
  const placements: Placement[] = [];
  const ports: ResolvedPort[] = [];
  const padEdits: PadEdit[] = [];
  for (const node of nodes) {
    const placement = placed.get(node.id);
    if (placement === undefined) continue;
    placements.push(placement);
    ports.push(...resolvePorts(placement, node.size, node.ports));
    const pad = padFor(node, placement);
    if (pad !== null) padEdits.push(pad);
  }

  return {
    placements,
    report: {
      nodes: nodes.map((n) => finalizeReport(reports.get(n.id) as MutableNodeReport)),
      dropped,
      corridors: (request.corridors ?? []).map((c) => corridorReport(c, region)),
      improvementRounds: roundsRun,
      improvements,
    },
    occupancy: buildOccupancy(region, nodes, placed),
    padEdits,
    ports,
    diagnostics,
  };
}

/* -------------------------------------------------------------------------- */
/* candidates                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build a node's candidate pool.
 *
 * Coarse constraints seed the search (§4.9.4): their jittered point is the
 * node's *preferred initial anchor*, and the rest of the pool is sampled from
 * the zero-cost region first, the whole domain second — so a zoned node lands
 * naturally inside its cell but is never trapped there when the ground is bad.
 */
export function buildCandidates(
  node: LayoutNodeInput,
  ctx: EvalContext,
  request: LayoutRequest,
): Candidate[] {
  const count = request.candidateCount ?? DEFAULT_CANDIDATES;
  const domain = frameRect(ctx.frame);

  let zeroCost: Rect | null = null;
  const seeds: Point2[] = [];
  for (const [index, constraint] of node.constraints.entries()) {
    if (constraint.type !== "zone" && constraint.type !== "at") continue;
    const coarse =
      constraint.type === "zone" ? coarseZoneRegion(constraint, index, ctx) : coarseAtRegion(constraint, ctx);
    if (coarse.region === null) continue;
    seeds.push(coarse.seedPoint);
    zeroCost = zeroCost === null ? coarse.region : (intersectRect(zeroCost, coarse.region) ?? zeroCost);
  }
  const sampleRect = zeroCost === null ? domain : (intersectRect(zeroCost, domain) ?? domain);

  const rng = new Rng(streamSeed(node.seed, "layout"));
  const anchors: Point2[] = [...seeds];
  const near = Math.ceil(count * COARSE_SAMPLE_SHARE);
  for (let i = 0; i < count; i++) {
    const rect = i < near ? sampleRect : domain;
    anchors.push({
      x: rect.x0 + Math.floor(rng.float() * (rect.x1 - rect.x0 + 1)),
      z: rect.z0 + Math.floor(rng.float() * (rect.z1 - rect.z0 + 1)),
    });
  }

  const yaws = node.rotations.length > 0 ? node.rotations : ([0] as readonly Yaw[]);
  const out: Candidate[] = [];
  for (const anchor of anchors) {
    for (const yaw of yaws) {
      out.push(candidateAt(node, anchor, yaw, ctx.frame));
    }
  }
  return out;
}

/** Place a node's footprint so its centre is as close to `anchor` as the frame allows. */
function candidateAt(node: LayoutNodeInput, anchor: Point2, yaw: Yaw, frame: Frame): Candidate {
  const [w, , d] = rotatedSize(node.size, yaw);
  const maxX = frame.x0 + frame.width - w;
  const maxZ = frame.z0 + frame.depth - d;
  const x0 = clampInt(anchor.x - ((w - 1) >> 1), frame.x0, Math.max(frame.x0, maxX));
  const z0 = clampInt(anchor.z - ((d - 1) >> 1), frame.z0, Math.max(frame.z0, maxZ));
  const rect: Rect = { x0, z0, x1: x0 + w - 1, z1: z0 + d - 1 };
  return { rect, anchor: { x: x0 + ((w - 1) >> 1), z: z0 + ((d - 1) >> 1) }, yaw };
}

/* -------------------------------------------------------------------------- */
/* scoring                                                                     */
/* -------------------------------------------------------------------------- */

/** `terrain_conform.maxSlope`, or the profile default. */
export function maxSlopeOf(node: LayoutNodeInput): number {
  for (const c of node.constraints) {
    if (c.type === "terrain_conform" && typeof c["maxSlope"] === "number") return c["maxSlope"];
  }
  return DEFAULT_MAX_SLOPE;
}

/** The keep-clear margin around a node: `clearance` plus envelope `padding`. */
export function clearanceOf(node: LayoutNodeInput): number {
  let amount = 0;
  for (const c of node.constraints) {
    if (c.type !== "clearance") continue;
    const direction = c["direction"];
    // Only horizontal clearance affects the footprint domain; `up`/`down`
    // clearance is a voxel-level lint after pass 6 (§4.4).
    if (direction === "up" || direction === "down") continue;
    if (typeof c["amount"] === "number") amount = Math.max(amount, c["amount"]);
  }
  return amount + node.padding;
}

/** True when this node accepts overlapping a sibling (`overlapAllowed: true`). */
function allowsOverlap(node: LayoutNodeInput): boolean {
  return node.constraints.some((c) => c.type === "not_overlapping" && c["overlapAllowed"] === true);
}

function inflate(rect: Rect, by: number): Rect {
  return { x0: rect.x0 - by, z0: rect.z0 - by, x1: rect.x1 + by, z1: rect.z1 + by };
}

/** Overlap area between two rectangles, in columns. */
function overlapArea(a: Rect, b: Rect): number {
  const r = intersectRect(a, b);
  if (r === null) return 0;
  return (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
}

function scoreCandidate(
  node: LayoutNodeInput,
  candidate: Candidate,
  ctx: EvalContext,
  request: LayoutRequest,
  demoted: ReadonlySet<number>,
): Scored {
  const stats = footprintStats(request.field, request.classification, candidate.rect, request.hazardMask);
  const slopeLimit = maxSlopeOf(node);
  const veto = terrainFeasible(stats, slopeLimit, request.seaLevel + MIN_FREEBOARD);
  let feasible = veto === null;
  let penalty = veto === null ? 0 : veto === "too_steep" ? stats.maxSlope - slopeLimit : 1000;

  // `not_overlapping` is implicit between all siblings (§4.4).
  if (!allowsOverlap(node)) {
    const self = inflate(candidate.rect, clearanceOf(node));
    for (const [id, other] of ctx.placed) {
      const otherNode = ctx.nodes.find((n) => n.id === id);
      const margin = otherNode === undefined ? 0 : clearanceOf(otherNode);
      const area = overlapArea(self, inflate(other.footprint, margin));
      if (area > 0) {
        feasible = false;
        penalty += area;
      }
    }
  }

  let soft = 0;
  const evals: { index: number; cost: number; satisfied: boolean; feasible: boolean }[] = [];
  for (const [index, constraint] of node.constraints.entries()) {
    const result = evaluateConstraint(constraint, index, candidate, ctx, demoted.has(index));
    evals.push({ index, cost: result.cost, satisfied: result.satisfied, feasible: result.feasible });
    soft += result.cost;
    if (!result.feasible) {
      feasible = false;
      penalty += 1;
    }
  }

  // --- the corridor reservation (§4.9.6) ------------------------------------
  // Soft, and only soft. A corridor is a *reservation*, not a wall: it was
  // drawn at 3b from coarse anchor points, before anything knew where the
  // ground was steep or where the water was, and a hard veto against a guess of
  // that vintage would throw away buildable placements to protect a line the
  // router may not even take. What it must do is stop the default outcome —
  // sixteen houses scattered across the future high street because nothing in
  // the cost model had heard of it — and a cost does that.
  //
  // A node that binds itself to the corridor with `along`/`beside` is exempt:
  // charging it for being near the street it asked to be near would be the two
  // halves of §4.4 fighting each other.
  //
  // Only **road** corridors reserve ground, and the asymmetry is the point. A
  // road corridor is a reservation for something that will be built there; a
  // course corridor is the record of something that already was. Nothing is
  // going to be routed along a ridge later, so charging a house for standing on
  // one would be the corridor mechanism inventing a keep-out the author never
  // asked for — and a `ridge` edit is seventy blocks wide, so it would be a
  // keep-out over most of the map. A river's channel is already unbuildable
  // ground and the hazard mask says so. Course corridors exist here for one
  // reason: `along` and `beside` need something to bind to (§4.4 `course`).
  const corridors = ctx.corridors ?? [];
  if (corridors.length > 0 && !bindsToCorridor(node)) {
    const area = (candidate.rect.x1 - candidate.rect.x0 + 1) * (candidate.rect.z1 - candidate.rect.z0 + 1);
    let claimed = 0;
    for (const corridor of corridors) {
      if (corridor.kind !== "road") continue;
      if (corridor.anchors.includes(node.nodePath)) continue;
      claimed += corridorOverlap(corridor, candidate.rect);
    }
    if (claimed > 0) soft += (CORRIDOR_RESERVATION_COST * Math.min(claimed, area)) / area;
  }

  const terrain = terrainCost(stats, slopeLimit);
  return { candidate, stats, terrain, soft, total: terrain + soft, feasible, evals, penalty };
}

/** True when the node declares an `along` (or desugared `beside`) constraint. */
function bindsToCorridor(node: LayoutNodeInput): boolean {
  return node.constraints.some((c) => c.type === "along");
}

/** The cheapest feasible candidate, or `null`. Ties break by candidate order. */
function bestOf(
  node: LayoutNodeInput,
  pool: readonly Candidate[],
  ctx: EvalContext,
  request: LayoutRequest,
  demoted: ReadonlySet<number>,
): Scored | null {
  let best: Scored | null = null;
  for (const candidate of pool) {
    const scored = scoreCandidate(node, candidate, ctx, request, demoted);
    if (!scored.feasible) continue;
    if (best === null || scored.total < best.total - IMPROVEMENT_EPSILON) best = scored;
  }
  return best;
}

/** The least-violating candidate, used only at the bottom of the ladder. */
function leastBad(
  node: LayoutNodeInput,
  pool: readonly Candidate[],
  ctx: EvalContext,
  request: LayoutRequest,
  demoted: ReadonlySet<number>,
): Scored | null {
  let best: Scored | null = null;
  for (const candidate of pool) {
    const scored = scoreCandidate(node, candidate, ctx, request, demoted);
    if (best === null) {
      best = scored;
      continue;
    }
    const better =
      scored.penalty < best.penalty - IMPROVEMENT_EPSILON ||
      (scored.penalty <= best.penalty + IMPROVEMENT_EPSILON && scored.total < best.total - IMPROVEMENT_EPSILON);
    if (better) best = scored;
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* the ladder                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Constraint indices eligible for demotion, in §4.6's fixed order: lowest
 * `weight` first, then reverse declaration order.
 *
 * `within` and `not_overlapping` are never demotable — the first would leave
 * the domain unbounded, the second would let bodies interpenetrate. Coarse
 * containment *is*, because the implicit `within: "^"` still bounds the domain
 * afterwards.
 */
export function demotionOrder(node: LayoutNodeInput, group: "coarse" | "other"): number[] {
  const eligible: { index: number; weight: number }[] = [];
  for (const [index, c] of node.constraints.entries()) {
    if (strengthOf(c) !== "hard") continue;
    if (c.type === "within" || c.type === "not_overlapping") continue;
    const isCoarse = (c.type === "zone" || c.type === "at") && c["mode"] === "contain";
    if (group === "coarse" ? !isCoarse : isCoarse) continue;
    eligible.push({ index, weight: weightOf(c) });
  }
  eligible.sort((a, b) => (a.weight !== b.weight ? a.weight - b.weight : b.index - a.index));
  return eligible.map((e) => e.index);
}

function demotionDiagnostic(node: LayoutNodeInput, index: number, what: string): LoamDiagnostic {
  const c = node.constraints[index] as CanonicalConstraint;
  return warning(
    // v0.2 §4.6: not yet — the spec gives LOAM-E404 error severity ("does not
    // stop the compile but gates the repair loop"). This compiler has no
    // severity that behaves that way yet, so a demotion is a warning and the
    // solver report carries the machine-readable record.
    "CONSTRAINT_DEMOTED",
    node.nodePath,
    `hard "${c.type}" constraint [${index}] was demoted to soft so this node could be placed`,
    `write "strength": "soft" on that constraint if you meant it as a preference, or change what it asks for — the solver report lists its final cost`,
  );
}

/* -------------------------------------------------------------------------- */
/* commit + report                                                             */
/* -------------------------------------------------------------------------- */

interface MutableNodeReport {
  nodePath: string;
  placed: boolean;
  translation?: readonly [number, number, number];
  yaw?: Yaw;
  size: readonly [number, number, number];
  appliedRungs: LadderRung[];
  constraints: ConstraintReport[];
  coarse: CoarseReport[];
  score: { terrain: number; soft: number; total: number };
  candidatesConsidered: number;
  demotedIndices?: number[];
}

function commit(
  node: LayoutNodeInput,
  scored: Scored,
  placed: Map<string, Placement>,
  report: MutableNodeReport,
  demoted: ReadonlySet<number>,
): void {
  const { candidate, stats } = scored;
  const [w, h, d] = rotatedSize(node.size, candidate.yaw);
  const foundationY = referenceY(node, stats);
  const placement: Placement = {
    nodePath: node.nodePath,
    id: node.id,
    translation: [candidate.rect.x0, foundationY, candidate.rect.z0],
    yaw: candidate.yaw,
    mirror: false,
    size: [w, h, d],
    footprint: candidate.rect,
    anchor: candidate.anchor,
    foundationY,
  };
  placed.set(node.id, placement);

  report.placed = true;
  report.translation = placement.translation;
  report.yaw = candidate.yaw;
  report.score = { terrain: scored.terrain, soft: scored.soft, total: scored.total };
  report.demotedIndices = [...demoted].sort((a, b) => a - b);
  report.constraints = node.constraints.map((c, index) => {
    const e = scored.evals[index];
    const declared = strengthOf(c);
    const implemented = isImplemented(c);
    // §4.4: a desugared `beside` reports as the `beside` the author wrote, not
    // as the `along` the solver ran. The rewrite is an implementation detail
    // and a report that leaked it would send them looking for a constraint
    // their document does not contain.
    const declaredType = typeof c["desugaredFrom"] === "string" ? (c["desugaredFrom"] as string) : c.type;
    return {
      index,
      type: declaredType,
      ...(typeof c["target"] === "string" ? { target: c["target"] as string } : {}),
      declaredStrength: declared,
      // A tier-2 type is scored soft whatever it declares (§4 `connected`,
      // §4.9.6 `along`): the half of it the solver owns is a cost, and the
      // half that could veto belongs to a later pass. Reporting the declared
      // `hard` as the effective strength would be the report lying about which
      // knob the author has.
      effectiveStrength: !implemented
        ? "ignored"
        : isTier2(c.type) || demoted.has(index)
          ? "soft"
          : declared,
      weight: weightOf(c),
      cost: e?.cost ?? 0,
      satisfied: e?.satisfied ?? true,
    } satisfies ConstraintReport;
  });
  // §4.7 obligation 7: record the realized coarse cost, not just the intent.
  report.coarse = report.coarse.map((entry) => ({
    ...entry,
    cost: report.constraints[entry.index]?.cost ?? 0,
  }));
}

function isImplemented(c: CanonicalConstraint): boolean {
  return isImplementedConstraint(c.type);
}

function corridorReport(corridor: RouteCorridor, region: Region): CorridorReport {
  let reserved = 0;
  const clipped = intersectRect(corridor.bounds, {
    x0: region.x0,
    z0: region.z0,
    x1: region.x0 + region.width - 1,
    z1: region.z0 + region.depth - 1,
  });
  if (clipped !== null) reserved = corridorOverlap(corridor, clipped);
  return {
    nodePath: corridor.nodePath,
    id: corridor.id,
    kind: corridor.kind,
    ...(corridor.verb === undefined ? {} : { verb: corridor.verb }),
    halfWidth: corridor.halfWidth,
    centerline: corridor.centerline.map((p) => [p.x, p.z] as const),
    reservedColumns: reserved,
  };
}

/**
 * `road.network@0.corridors()`, resolved against the solver's own node list —
 * substage 3b (§7.5).
 *
 * The anchors are selectors, and the only thing a selector can be resolved
 * *to* before placement is a node's coarse target point: the jittered `zone`
 * cell centre or the `at` fraction the search will start from (§4.9.3/§4.9.4).
 * A node with neither is invisible here, which is the honest answer — it has no
 * pre-placement position for a corridor to be strung through, and inventing one
 * would reserve ground on the strength of nothing.
 *
 * Anchors are taken in **document order**, not in the order the `anchors`
 * array names them, so that adding a selector to the array cannot re-topologize
 * an already-frozen corridor.
 */
export function registerRoadCorridors(
  nodePath: string,
  anchorIds: readonly string[],
  nodes: readonly LayoutNodeInput[],
  region: Region,
  laneWidth: number,
): RouteCorridor[] {
  const frame: Frame = { x0: region.x0, z0: region.z0, width: region.width, depth: region.depth };
  const norm = computeFrameNorm(frame);
  const wanted = new Set(anchorIds.map(leafOf));
  const anchors: RoadCorridorAnchor[] = [];

  for (const node of nodes) {
    // No `anchors` at all reads as "every placed node", which is what the road
    // pass itself already does with its own anchor list.
    if (wanted.size > 0 && !wanted.has(node.id) && !node.tags.some((t) => wanted.has(`#tag:${t}`))) {
      continue;
    }
    const ctx: EvalContext = { frame, frameNorm: norm, self: node, placed: new Map(), nodes };
    let point: Point2 | null = null;
    for (const [index, c] of node.constraints.entries()) {
      if (c.type !== "zone" && c.type !== "at") continue;
      const coarse = c.type === "zone" ? coarseZoneRegion(c, index, ctx) : coarseAtRegion(c, ctx);
      if (coarse.region === null) continue;
      point = coarse.seedPoint;
      break;
    }
    if (point === null) continue;
    anchors.push({ nodePath: node.nodePath, point });
  }

  return roadCorridors(nodePath, anchors, laneWidth, frame);
}

/** The leaf id of a selector: `"^.town_hall"` and `"world.town_hall"` → `"town_hall"`. */
function leafOf(selector: string): string {
  const s = selector.trim();
  if (s.startsWith("#tag:")) return s;
  const bare = s.startsWith("^.") ? s.slice(2) : s;
  const withoutPort = bare.split("#")[0] as string;
  return withoutPort.includes(".") ? (withoutPort.split(".").pop() as string) : withoutPort;
}

function coarseReports(node: LayoutNodeInput, ctx: EvalContext): CoarseReport[] {
  const out: CoarseReport[] = [];
  for (const [index, c] of node.constraints.entries()) {
    if (c.type !== "zone" && c.type !== "at") continue;
    const coarse = c.type === "zone" ? coarseZoneRegion(c, index, ctx) : coarseAtRegion(c, ctx);
    if (coarse.region === null) continue;
    out.push({
      index,
      type: c.type,
      frame: frameRect(ctx.frame),
      targetPoint: [coarse.seedPoint.x, coarse.seedPoint.z],
      targetRegion: coarse.region,
      mode: coarse.mode,
      cost: 0,
    });
  }
  return out;
}

function finalizeReport(report: MutableNodeReport): SolverNodeReport {
  const { demotedIndices: _drop, ...rest } = report;
  return rest as SolverNodeReport;
}

/** The foundation elevation: `terrain_conform.reference` over the footprint. */
export function referenceY(node: LayoutNodeInput, stats: FootprintStats): number {
  let reference = "median";
  for (const c of node.constraints) {
    if (c.type === "terrain_conform" && typeof c["reference"] === "string") reference = c["reference"];
  }
  switch (reference) {
    case "min":
      return Math.round(stats.min);
    case "max":
      return Math.round(stats.max);
    case "mean":
      return Math.round(stats.mean);
    default:
      return Math.round(stats.median);
  }
}

/* -------------------------------------------------------------------------- */
/* terrain adjustment + occupancy                                              */
/* -------------------------------------------------------------------------- */

/** `terrain_conform` modes that level the ground under the footprint. */
const LEVELLING_MODES = new Set(["flatten", "cut_fill", "terrace"]);

/** The pad edit for one placement, or `null` when the node does not touch the ground. */
export function padFor(node: LayoutNodeInput, placement: Placement): PadEdit | null {
  let mode = "cut_fill";
  let blend = DEFAULT_BLEND;
  for (const c of node.constraints) {
    if (c.type !== "terrain_conform") continue;
    if (typeof c["mode"] === "string") mode = c["mode"];
    if (typeof c["blend"] === "number") blend = c["blend"];
  }
  // v0.2 §4.4 `terrain_conform`: not yet — `terrace` levels to one Y like
  // `flatten` rather than stepping, and `drape`/`stilts`/`float`/`bury` make no
  // field edit at all.
  if (!LEVELLING_MODES.has(mode)) return null;
  return { nodePath: placement.nodePath, footprint: placement.footprint, targetY: placement.foundationY, apron: blend };
}

/** Build the occupancy grid the scatter pass reads. */
export function buildOccupancy(
  region: Region,
  nodes: readonly LayoutNodeInput[],
  placed: ReadonlyMap<string, Placement>,
): OccupancyGrid {
  const mask = new Uint8Array(region.width * region.depth);
  const byTag = new Map<string, Uint8Array>();

  for (const node of nodes) {
    const placement = placed.get(node.id);
    if (placement === undefined) continue;
    const rect = inflate(placement.footprint, clearanceOf(node));
    const tagMasks = ["structure", ...node.tags].map((tag) => {
      let m = byTag.get(tag);
      if (m === undefined) {
        m = new Uint8Array(mask.length);
        byTag.set(tag, m);
      }
      return m;
    });
    for (let z = rect.z0; z <= rect.z1; z++) {
      const j = z - region.z0;
      if (j < 0 || j >= region.depth) continue;
      for (let x = rect.x0; x <= rect.x1; x++) {
        const i = x - region.x0;
        if (i < 0 || i >= region.width) continue;
        const idx = j * region.width + i;
        mask[idx] = 1;
        for (const m of tagMasks) m[idx] = 1;
      }
    }
  }
  return { region, mask, byTag };
}

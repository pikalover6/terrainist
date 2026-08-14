/**
 * Landmark programs as road destinations.
 *
 * The bespoke contract promises that a landmark's anchors publish as §7.3
 * markers *and* that a road can be routed to them — "a landmark is reachable
 * without the author knowing a coordinate of it". The marker half lives in
 * `pass.ts`. This file is the other half: it turns the anchor a program
 * publishes into a synthetic `road_stub` {@link ResolvedPort}, so the router
 * reaches a landmark through exactly the machinery it already reaches a
 * building's door through — no second destination mechanism.
 *
 * How a document asks: `road.network@0`'s **`anchors`** param, the selector
 * list that already names what the network must reach. Name the landmark node
 * there by id (or by a tag it carries) and it becomes a destination:
 *
 * ```json
 * { "id": "roads", "generator": "road.network@0",
 *   "params": { "anchors": ["town_hall", "shrine"] } }
 * ```
 *
 * Which anchor: the **door-ish** one — an anchor whose name reads as a way in
 * (`door`, `entrance`, `gate`, `porch`, …), and failing that the `front` a
 * program publishes to declare which side of it is its face. The two are the
 * same statement made for two reasons — "arrive here" and "this side points at
 * the world" — so a program that declares a front is routable without also
 * declaring a door. A program with neither gets a `ROAD_UNROUTABLE` warning
 * naming the anchors it *did* publish, and the lane falls back to the footprint
 * edge facing the rest of the settlement, so the landmark is still reachable.
 *
 * Anchors are read in the program's local frame and turned into the world frame
 * by the same quarter turn the pass builds the instance with (`facing.ts`), so
 * the approach follows the face round.
 *
 * Ordering caveat: the programs pass runs *after* the structure pass, so the
 * anchors cannot be read off its output — the program is invoked here, once,
 * and only for a landmark the document actually named. The invocation is
 * deterministic (same seed, same envelope), so it agrees with the run that
 * builds the blocks; only a program that derives an anchor's x/z from ground
 * height could disagree, and then only by the pad grading the roads do after.
 */

import {
  FRONT_ANCHOR,
  authoredProgramId,
  isAuthoredGenerator,
  warning,
  type LoamDiagnostic,
  type ProgramNode,
  type SettlementDocument,
} from "@terrainist/spec";

import type { Rect } from "../layout/frames.js";
import type { Placement, ResolvedPort } from "../layout/types.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { invokeLandmark } from "./invoke.js";
import { nodeLocalHeight } from "./pass.js";
import { rotateLocalPoint, type ProgramRotation } from "./rotate.js";

/** An anchor name that reads as a way in. */
const DOOR_WORDS = [
  "door",
  "entrance",
  "entry",
  "gate",
  "gateway",
  "porch",
  "threshold",
  "mouth",
  "stair",
  "steps",
];

/** True when an anchor name reads as the way in. */
export function isDoorAnchor(name: string): boolean {
  const lower = name.toLowerCase();
  return DOOR_WORDS.some((w) => lower === w || lower.includes(w));
}

/** Everything {@link landmarkRoadAnchors} reads. */
export interface LandmarkAnchorInput {
  readonly doc: SettlementDocument;
  readonly rootPath: string;
  readonly worldSeed: bigint;
  readonly plan: ColumnPlan;
  /** The solver's placements — a landmark program is a placed node. */
  readonly placements: readonly Placement[];
  /** Node path of the `road.network@0` node, for the diagnostics. */
  readonly roadNodePath: string;
  /** The road node's `params.anchors` selectors, verbatim. */
  readonly selectors: readonly string[];
  /**
   * The quarter turn each landmark stands at, by node path (`facing.ts`).
   *
   * The same map the pass builds with — an anchor read in the local frame and
   * placed in the world without it would put the lane at whichever side of the
   * instance used to be the front.
   */
  readonly rotations?: ReadonlyMap<string, ProgramRotation>;
}

/** What {@link landmarkRoadAnchors} produced. */
export interface LandmarkAnchorResult {
  /** Synthetic approach ports, one per reachable landmark. */
  readonly ports: readonly ResolvedPort[];
  /** Node paths the router must treat as destinations (and as obstacles). */
  readonly paths: readonly string[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Resolve every landmark program the road node named into an approach port.
 *
 * Nothing happens for a document whose `anchors` list names no landmark, which
 * is every document that has none — the cost is one program invocation per
 * named landmark and zero otherwise.
 */
export function landmarkRoadAnchors(input: LandmarkAnchorInput): LandmarkAnchorResult {
  const ports: ResolvedPort[] = [];
  const paths: string[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  const placementByPath = new Map(input.placements.map((p) => [p.nodePath, p] as const));
  const programs = input.doc.programs ?? {};

  for (const child of input.doc.root.children) {
    if (child.kind !== "generator") continue;
    const node = child as ProgramNode;
    if (!isAuthoredGenerator(node.generator)) continue;
    if (!selectorsName(input.selectors, node)) continue;

    const nodePath = `${input.rootPath}.${node.id}`;
    const placement = placementByPath.get(nodePath);
    // No placement means the node hovers or the solver dropped it; either way
    // there is no ground under it for a lane to arrive at, and the programs
    // pass has already said so.
    if (placement === undefined) continue;
    const programId = authoredProgramId(node.generator);
    if (programId === undefined) continue;
    const program = programs[programId];
    if (program === undefined) continue;

    const run = invokeLandmark({
      programId,
      program,
      nodePath,
      worldSeed: input.worldSeed,
      heightAt: nodeLocalHeight(input.plan, {
        index: 0,
        footprint: placement.footprint,
        baseY: placement.foundationY,
      }),
      ...(node.seedSalt === undefined ? {} : { seedSalt: node.seedSalt }),
    });
    const anchors = run.ok ? (run.result?.anchors ?? {}) : {};
    const names = Object.keys(anchors).sort();
    const door = names.find((n) => isDoorAnchor(n)) ?? names.find((n) => n === FRONT_ANCHOR);

    let approach: { x: number; z: number };
    if (door !== undefined) {
      const [ax, , az] = anchors[door] as readonly [number, number, number];
      const [w, , d] = program.envelope;
      const [rx, rz] = rotateLocalPoint(ax, az, input.rotations?.get(nodePath) ?? 0, w, d);
      approach = { x: placement.footprint.x0 + rx, z: placement.footprint.z0 + rz };
    } else {
      diagnostics.push(
        warning(
          "ROAD_UNROUTABLE",
          nodePath,
          `"${input.roadNodePath}" was asked to reach this landmark, but program ${JSON.stringify(programId)} published no door-ish anchor${
            names.length === 0
              ? " — it published no anchors at all"
              : `; it published ${names.map((n) => JSON.stringify(n)).join(", ")}`
          }. The lane arrives at the footprint edge facing the settlement instead.`,
          `have the program return an anchor named "door" (or "entrance", "gate", "porch") at the way in — or the "front" anchor that declares which side of it faces the world — and the lane will arrive there`,
        ),
      );
      approach = towardsCentre(placement.footprint, centreOfOthers(input.placements, nodePath, placement));
    }

    ports.push(edgePort(nodePath, placement, approach));
    paths.push(nodePath);
  }

  return { ports, paths, diagnostics };
}

/** True when one of the road node's selectors names this node. */
function selectorsName(selectors: readonly string[], node: ProgramNode): boolean {
  const tags = node.tags ?? [];
  for (const raw of selectors) {
    const selector = raw.trim();
    if (selector === node.id) return true;
    // `"world.shrine"` and `"world.shrine#door"` both name the node; the port
    // suffix is ignored, because a program's door is the port here.
    const head = (selector.split("#")[0] as string).split(".").pop();
    if (head === node.id) return true;
    if (selector.startsWith("#tag:") && tags.includes(selector.slice("#tag:".length))) return true;
    if (selector === "*") return true;
  }
  return false;
}

/**
 * Project an approach point onto the nearest footprint edge and face outward.
 *
 * The router steps one block along the outward normal (`approachOf`), so the
 * lane starts outside the wall it leaves — exactly as it does for a door.
 */
function edgePort(nodePath: string, placement: Placement, at: { x: number; z: number }): ResolvedPort {
  const f = placement.footprint;
  const x = clamp(at.x, f.x0, f.x1);
  const z = clamp(at.z, f.z0, f.z1);
  const options = [
    { d: x - f.x0, x: f.x0, z, nx: -1, nz: 0, face: "west" },
    { d: f.x1 - x, x: f.x1, z, nx: 1, nz: 0, face: "east" },
    { d: z - f.z0, x, z: f.z0, nx: 0, nz: -1, face: "north" },
    { d: f.z1 - z, x, z: f.z1, nx: 0, nz: 1, face: "south" },
  ];
  // Ties break in declaration order, which is what keeps this deterministic.
  const best = options.reduce((a, b) => (b.d < a.d ? b : a));
  const y = placement.foundationY;
  return {
    ref: `${nodePath}#road`,
    nodePath,
    name: "road",
    type: "road_stub",
    position: [best.x, y, best.z],
    outwardNormal: [best.nx, 0, best.nz],
    face: best.face as ResolvedPort["face"],
    width: 1,
    height: 2,
    floorY: y,
  };
}

/** The point the fallback edge should face: the rest of the settlement. */
function centreOfOthers(
  placements: readonly Placement[],
  self: string,
  fallback: Placement,
): { x: number; z: number } {
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const p of placements) {
    if (p.nodePath === self) continue;
    sx += (p.footprint.x0 + p.footprint.x1) / 2;
    sz += (p.footprint.z0 + p.footprint.z1) / 2;
    n++;
  }
  if (n === 0) {
    return {
      x: (fallback.footprint.x0 + fallback.footprint.x1) / 2,
      z: (fallback.footprint.z0 + fallback.footprint.z1) / 2 - 1,
    };
  }
  return { x: Math.round(sx / n), z: Math.round(sz / n) };
}

/** The point on the footprint closest to `to` — the edge the lane comes from. */
function towardsCentre(f: Rect, to: { x: number; z: number }): { x: number; z: number } {
  return { x: clamp(Math.round(to.x), f.x0, f.x1), z: clamp(Math.round(to.z), f.z0, f.z1) };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

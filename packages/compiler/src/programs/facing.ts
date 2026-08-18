/**
 * Which way a bespoke program ends up pointing.
 *
 * The walked defect: twenty-four sea monsters came out of the water and faced
 * away from the city they were invading. A program is authored in its own
 * envelope with no knowledge of where the world will put it, so unless the
 * compiler turns it, a subject with a front points wherever the author's local
 * axes happened to point — which is north, every time, for every instance.
 *
 * The fix is two coordinate-free halves.
 *
 * - **The program declares a front** by building it toward local −Z and
 *   publishing a `front` anchor (`FRONT_ANCHOR`). No `front`, no rotation,
 *   ever: that is what keeps every world authored before this compiling to the
 *   blocks it always did.
 * - **The document declares a relation** — `"face": { "toward": "old_town" }`
 *   or `{ "away_from": … }` — naming *another node*, never a direction and
 *   never an angle. This file turns the pair into a quarter turn.
 *
 * ## Why the estimate is binding
 *
 * Rotation has to be known *before* the fit, because a quarter turn swaps the
 * envelope's width and depth and the fit is what reserves that footprint. So
 * the direction is measured against the best estimate available at that moment
 * — the target's placed site if it already has one, else the coarse hint its
 * own constraints carry (`zone`, `at`), else the region's centre — and that
 * answer is then **binding for the fit**: the box the solver reserves is the
 * turned box, and nothing may later ask for a different one. That is not a
 * concession to convenience. Two programs each declared `toward` the other is a
 * cycle, and a binding estimate is what makes it terminate — both are aimed at
 * where the other is *going to be*, both turn, and the pair faces off.
 *
 * The one thing the estimate does *not* bind is the direction itself when the
 * turn costs the reservation nothing. A coarse hint is a soft cost the ground
 * can outbid, and a landmark moved past the node it was told to face would
 * otherwise keep pointing at where it thought it was going to stand — the
 * walked defect a second time over. So {@link remeasureLandmarkFacings} takes
 * the measurement again from the solved site and adopts it only when the new
 * turn reserves the same footprint as the old.
 */

import {
  FRONT_ANCHOR,
  PROGRAM_SCATTER_GENERATOR,
  authoredProgramId,
  faceOf,
  faceOfParams,
  isAuthoredGenerator,
  note,
  warning,
  type AuthoredProgramRecord,
  type FaceSense,
  type LoamDiagnostic,
  type ProgramNode,
  type ProgramScatterParams,
  type SettlementDocument,
  type TerrainDocument,
} from "@terrainist/spec";
import type { Region } from "@terrainist/stdlib";

import type { Placement } from "../layout/types.js";
import { areaRect, coarseHintPoint } from "./place.js";
import { invokeLandmark } from "./invoke.js";
import {
  cardinalToward,
  oppositeCardinal,
  rotationFacing,
  type ProgramRotation,
} from "./rotate.js";

/** A horizontal point — the only geometry this file traffics in. */
export interface FacingPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * How one node's instances are turned.
 *
 * A landmark resolves to a single `rotation` here and carries it through the
 * solve; a scatter carries the *target* instead, because each instance stands
 * somewhere else and each one is entitled to its own answer — a ring of statues
 * around a square all facing the square is one relation and eight rotations.
 */
export interface ProgramFacing {
  /** The whole-instance answer, for a node invoked once. */
  readonly rotation?: ProgramRotation;
  /** The point every instance measures against, for a scattered node. */
  readonly target?: FacingPoint;
  /** Which way round the measurement runs. */
  readonly sense: FaceSense;
}

/** The rotation one instance standing at `site` takes. */
export function facingRotationAt(facing: ProgramFacing, site: FacingPoint): ProgramRotation {
  if (facing.rotation !== undefined) return facing.rotation;
  const target = facing.target;
  /* c8 ignore next — a facing carries one or the other. */
  if (target === undefined) return 0;
  return rotationBetween(site, target, facing.sense);
}

/** The quarter turn that puts `from`'s front toward (or away from) `to`. */
function rotationBetween(from: FacingPoint, to: FacingPoint, sense: FaceSense): ProgramRotation {
  const cardinal = cardinalToward(to.x - from.x, to.z - from.z);
  // Nothing to face: the two points coincide, which is what an unresolvable
  // target and a self-reference both come out as. Leave it as it was authored.
  if (cardinal === undefined) return 0;
  return rotationFacing(sense === "toward" ? cardinal : oppositeCardinal(cardinal));
}

/** Everything {@link planProgramFacings} reads. */
export interface FacingPlanInput {
  readonly doc: SettlementDocument | TerrainDocument;
  readonly rootPath: string;
  readonly region: Region;
  readonly worldSeed: bigint;
  /**
   * Which spelling to resolve. The two are resolved at different moments — a
   * landmark's turn has to be known before the solver reserves its box, a
   * scatter's before the placer walks its candidates — and each call reports
   * only on the nodes it answered, so no document is warned at twice.
   */
  readonly scope: "landmark" | "plugin";
  /** Placements decided so far. Empty before the solve, which is legal. */
  readonly placements?: readonly Placement[];
}

/** What {@link planProgramFacings} decided. */
export interface FacingPlanResult {
  /** Node path → facing, for the nodes that face at all. */
  readonly facings: ReadonlyMap<string, ProgramFacing>;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Resolve the facing of every bespoke node of one spelling.
 *
 * A node is absent from the result — and therefore never rotated — unless its
 * program publishes a `front` anchor. Everything else about the document may
 * be as it likes.
 */
export function planProgramFacings(input: FacingPlanInput): FacingPlanResult {
  const facings = new Map<string, ProgramFacing>();
  const diagnostics: LoamDiagnostic[] = [];
  const programs = input.doc.programs ?? {};
  const children = input.doc.root.children as readonly ProgramNode[];
  const placed = new Map((input.placements ?? []).map((p) => [p.nodePath, p] as const));

  for (const child of children) {
    if (child.kind !== "generator") continue;
    const landmark = isAuthoredGenerator(child.generator);
    if (landmark !== (input.scope === "landmark")) continue;
    if (!landmark && child.generator !== PROGRAM_SCATTER_GENERATOR) continue;

    const params = child.params as unknown as ProgramScatterParams | undefined;
    const programId = landmark ? authoredProgramId(child.generator) : params?.program;
    if (programId === undefined) continue;
    const program = programs[programId];
    if (program === undefined) continue;

    const nodePath = `${input.rootPath}.${child.id}`;
    const relation = landmark ? faceOf(child) : faceOfParams(params);
    // The program's own declaration is the gate, and it is checked before the
    // relation: a `face` on a program with no front is a statement about
    // nothing, and rotating it would move a thing whose author never said which
    // side was the front.
    if (!declaresFront(programId, program, nodePath, input.worldSeed, child.seedSalt)) continue;

    const site = estimatedCentre(child, nodePath, input.region, placed);
    let target: FacingPoint | undefined;
    let sense: FaceSense = "toward";
    if (relation !== undefined) {
      sense = relation.sense;
      target = targetCentre(relation.target, child, input, placed);
      if (target === undefined) {
        diagnostics.push(
          warning(
            "PROGRAM_FACE_UNRESOLVED",
            nodePath,
            `"face": { "${relation.sense}": ${JSON.stringify(relation.target)} } names nothing this document places, so ${JSON.stringify(programId)} keeps the facing it would have had`,
            `name a sibling node id (${siblingIds(children, child.id) || "—"}), a tag set such as "#tag:civic", or "root" for the settlement as a whole`,
          ),
        );
      }
    }
    // No relation, or one that resolved to nothing: the default rule. A lane
    // that arrives is the strongest statement a document makes about which side
    // of a landmark is the front, and the settlement itself is the next best.
    if (target === undefined) {
      sense = "toward";
      target = defaultTarget(child, nodePath, input, placed);
    }
    if (target === undefined) continue;

    facings.set(
      nodePath,
      input.scope === "landmark"
        ? { rotation: rotationBetween(site, target, sense), sense }
        : { target, sense },
    );
  }

  return { facings, diagnostics };
}

/* -------------------------------------------------------------------------- */
/* the one correction the binding estimate allows                              */
/* -------------------------------------------------------------------------- */

/** Everything {@link remeasureLandmarkFacings} reads. */
export interface FacingRemeasureInput extends Omit<FacingPlanInput, "scope" | "placements"> {
  /** What the solver decided. */
  readonly placements: readonly Placement[];
  /** The pre-solve answers, as {@link planProgramFacings} gave them. */
  readonly facings: ReadonlyMap<string, ProgramFacing>;
}

/** What {@link remeasureLandmarkFacings} decided. */
export interface FacingRemeasureResult {
  /** Node path → the rotation that stands, corrected or not. */
  readonly rotations: ReadonlyMap<string, ProgramRotation>;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Measure the landmark facings again, now that the sites are real.
 *
 * The estimate a facing is first taken against is binding *for the fit* — a
 * quarter turn swaps the envelope's edges, and the solver reserves the turned
 * box — but it is not binding for its own sake. `zone`/`at` is a soft cost the
 * ground can outbid (`LANDMARK_COARSE_ABANDONED`), and a landmark that is moved
 * past the node it was told to face ends up pointing at nothing: the walked
 * defect was a wading leviathan asked to face the city, placed four hundred
 * blocks beyond it, showing the city its back and the open sea its face.
 *
 * The correction is narrow on purpose, and it is the footprint that draws the
 * line. A new turn is adopted only when it reserves **the same footprint** the
 * solver already gave this landmark — a 180° flip always does, and every turn
 * does for a square envelope — so nothing this returns can invalidate a
 * reservation, move a pad, or shift a block by anything but its facing. A turn
 * that would swap width for depth is refused and the pre-solve answer stands.
 *
 * One pass, no iteration: every site is final, so two landmarks each declared
 * `toward` the other resolve against real positions and still face off.
 */
export function remeasureLandmarkFacings(input: FacingRemeasureInput): FacingRemeasureResult {
  const rotations = new Map<string, ProgramRotation>(
    [...input.facings].map(([path, facing]) => [path, facing.rotation ?? 0] as const),
  );
  const diagnostics: LoamDiagnostic[] = [];
  if (rotations.size === 0) return { rotations, diagnostics };

  // Diagnostics are dropped deliberately: this is the same plan re-run against
  // better positions, and an unresolvable `face` was already reported once.
  const replanned = planProgramFacings({
    doc: input.doc,
    rootPath: input.rootPath,
    region: input.region,
    worldSeed: input.worldSeed,
    scope: "landmark",
    placements: input.placements,
  }).facings;
  const placed = new Map(input.placements.map((p) => [p.nodePath, p] as const));

  for (const [nodePath, before] of rotations) {
    const after = replanned.get(nodePath)?.rotation;
    if (after === undefined || after === before) continue;
    const site = placed.get(nodePath);
    // Never placed (dropped, or a profile with no solver): there is no better
    // measurement to be had, so the estimate stands.
    if (site === undefined) continue;
    const square = site.footprint.x1 - site.footprint.x0 === site.footprint.z1 - site.footprint.z0;
    if (!square && (after - before) % 180 !== 0) continue;
    rotations.set(nodePath, after);
    diagnostics.push(
      note(
        "PROGRAM_FACE_REMEASURED",
        nodePath,
        `this landmark was placed at (${site.anchor.x}, ${site.anchor.z}), not where its facing was first measured from, so the facing was taken again from the real site: ${before}° becomes ${after}°`,
        "nothing to change — the front points where the document asked it to. To pin the site as well, tighten the coarse target with a \"radius\"/\"tolerance\" or a hard \"zone\"",
      ),
    );
  }

  return { rotations, diagnostics };
}

/* -------------------------------------------------------------------------- */
/* does this program have a front?                                             */
/* -------------------------------------------------------------------------- */

/** Memo of the probe below, keyed by everything its answer depends on. */
const frontCache = new Map<string, boolean>();

/**
 * True when this program publishes a `front` anchor.
 *
 * Two steps, cheap one first. The **text** of a program that publishes an
 * anchor named `front` contains the word; a program whose source does not
 * mention it cannot be publishing it, so every world authored before this
 * feature existed answers `false` for the price of a regex and is never run an
 * extra time. Only a source that *might* declare a front is actually invoked,
 * once, and the answer is memoized.
 *
 * The probe runs the program the way the authoring gate does — flat ground, the
 * pinned verification theme — because it has to answer before there is a site
 * to stand on. A program that decided whether it has a front by reading the
 * terrain under it could disagree with its own real run; the same caveat
 * `road-anchors.ts` carries, and the same answer: an anchor set that depends on
 * the ground is a program bug, not a contract this compiler can keep.
 */
function declaresFront(
  programId: string,
  program: AuthoredProgramRecord,
  nodePath: string,
  worldSeed: bigint,
  seedSalt: string | undefined,
): boolean {
  if (!/\bfront\b/.test(program.source)) return false;
  const key = `${program.sourceHash}|${worldSeed}|${nodePath}|${seedSalt ?? ""}`;
  const hit = frontCache.get(key);
  if (hit !== undefined) return hit;
  const run = invokeLandmark({
    programId,
    program,
    nodePath,
    worldSeed,
    ...(seedSalt === undefined ? {} : { seedSalt }),
  });
  const declared = run.ok && run.result?.anchors?.[FRONT_ANCHOR] !== undefined;
  frontCache.set(key, declared);
  return declared;
}

/* -------------------------------------------------------------------------- */
/* where things are, as well as anything can know yet                          */
/* -------------------------------------------------------------------------- */

/** The centre of a rect, rounded the one way. */
function centreOf(rect: { x0: number; z0: number; x1: number; z1: number }): FacingPoint {
  return { x: Math.floor((rect.x0 + rect.x1) / 2), z: Math.floor((rect.z0 + rect.z1) / 2) };
}

/** The region's own centre — the answer when nothing else is known. */
function regionCentre(region: Region): FacingPoint {
  return {
    x: region.x0 + Math.floor((region.width - 1) / 2),
    z: region.z0 + Math.floor((region.depth - 1) / 2),
  };
}

/**
 * Where a node is, or is going to be.
 *
 * In order: the site it has already been given; the coarse hint its own
 * constraints carry (`zone`'s nine-grid cell, `at`'s fractional point — the
 * two things a document says about placement without saying a coordinate); and
 * finally the region's centre, which is where a node with no opinion ends up
 * often enough to be the honest guess.
 */
function estimatedCentre(
  node: { readonly constraints?: readonly Record<string, unknown>[] },
  nodePath: string,
  region: Region,
  placed: ReadonlyMap<string, Placement>,
): FacingPoint {
  const site = placed.get(nodePath);
  if (site !== undefined) return { x: site.anchor.x, z: site.anchor.z };
  // One reader for the coarse hint, shared with the placer that acts on it
  // (`programs/place.ts`): the direction a landmark is turned and the ground it
  // is turned on have to be answers about the same point.
  return coarseHintPoint(node, region) ?? regionCentre(region);
}

/**
 * The point a `face` relation names, or `undefined` when it names nothing.
 *
 * The selector vocabulary is §4.2's, as far as this can honour it: a sibling
 * id, a dotted path whose leaf is one, a `#tag:` set (whose members are
 * averaged, so "face the docks" works when the docks are three nodes), and
 * `root` for the settlement as a whole — which is also how a *region* target is
 * spelt, since a region's centroid is what the relation would use anyway.
 */
function targetCentre(
  selector: string,
  self: ProgramNode,
  input: FacingPlanInput,
  placed: ReadonlyMap<string, Placement>,
): FacingPoint | undefined {
  const sel = selector.trim();
  if (sel === "self") return undefined;
  if (sel === "root" || sel === "^" || sel === "parent") return regionCentre(input.region);

  const children = input.doc.root.children as readonly ProgramNode[];
  const matches = children.filter((child) => child.id !== self.id && names(sel, child));
  if (matches.length === 0) return undefined;
  const points = matches.map((child) =>
    estimatedCentre(child, `${input.rootPath}.${child.id}`, input.region, placed),
  );
  return meanPoint(points);
}

/** True when a §4.2 selector names this child. */
function names(selector: string, child: { readonly id: string; readonly tags?: readonly string[] }): boolean {
  if (selector.startsWith("#tag:")) return (child.tags ?? []).includes(selector.slice("#tag:".length));
  const bare = selector.startsWith("^.") ? selector.slice(2) : selector;
  const leaf = (bare.split("#")[0] as string).split(".").pop();
  return leaf === child.id;
}

/** The mean of some points, rounded the one way. */
function meanPoint(points: readonly FacingPoint[]): FacingPoint | undefined {
  if (points.length === 0) return undefined;
  let sx = 0;
  let sz = 0;
  for (const p of points) {
    sx += p.x;
    sz += p.z;
  }
  return { x: Math.round(sx / points.length), z: Math.round(sz / points.length) };
}

/**
 * Where a front points when the document declared no relation for it.
 *
 * A road that arrives is the strongest statement a document makes about which
 * side of a thing is its front, so a landmark the road network was told to
 * reach faces the rest of that network. Failing that, the settlement: the mean
 * of everything else the document places, which is the town this thing is
 * standing in.
 */
function defaultTarget(
  self: ProgramNode,
  nodePath: string,
  input: FacingPlanInput,
  placed: ReadonlyMap<string, Placement>,
): FacingPoint | undefined {
  const children = input.doc.root.children as readonly ProgramNode[];
  const road = children.find(
    (child) => child.kind === "generator" && child.generator === "road.network@0",
  );
  const anchors = anchorSelectors(road?.params);
  if (anchors.some((selector) => names(selector, self))) {
    const others = children.filter(
      (child) =>
        child.id !== self.id && anchors.some((selector) => names(selector, child)),
    );
    const point = meanPoint(
      others.map((child) => estimatedCentre(child, `${input.rootPath}.${child.id}`, input.region, placed)),
    );
    if (point !== undefined) return point;
  }
  const rest = children.filter((child) => child.id !== self.id && isPlaceable(child));
  const settlement = meanPoint(
    rest
      .map((child) => ({
        child,
        hint:
          placed.get(`${input.rootPath}.${child.id}`) === undefined
            ? coarseHintPoint(child, input.region)
            : estimatedCentre(child, `${input.rootPath}.${child.id}`, input.region, placed),
      }))
      // Only the nodes that actually say where they are: averaging in a dozen
      // region centres would drag every answer to the middle and call it a
      // settlement.
      .filter((row): row is { child: ProgramNode; hint: FacingPoint } => row.hint !== undefined)
      .map((row) => row.hint),
  );
  if (settlement !== undefined) return settlement;
  // Nothing in the document says where anything is. `estimatedCentre` will read
  // the region's centre for this node too, so this is a facing of zero — said
  // once, here, rather than by accident downstream.
  const here = estimatedCentre(self, nodePath, input.region, placed);
  return here;
}

/** True for a child kind that occupies ground somewhere. */
function isPlaceable(child: { readonly kind: string; readonly generator?: string }): boolean {
  if (child.kind === "district" || child.kind === "city" || child.kind === "primitive") return true;
  if (child.kind !== "generator") return false;
  const generator = child.generator;
  if (typeof generator !== "string") return false;
  // Terrain, climate and the road network cover the whole region rather than
  // standing anywhere in it; averaging them in says nothing.
  return !generator.startsWith("terrain.") && generator !== "road.network@0";
}

/** `road.network@0`'s `anchors` selector list, defensively. */
function anchorSelectors(params: unknown): readonly string[] {
  if (typeof params !== "object" || params === null) return [];
  const anchors = (params as { anchors?: unknown }).anchors;
  if (!Array.isArray(anchors)) return [];
  return anchors.filter((a): a is string => typeof a === "string");
}

/** The sibling ids a fix hint offers, capped so the message stays readable. */
function siblingIds(children: readonly { readonly id: string }[], self: string): string {
  return children
    .filter((child) => child.id !== self)
    .slice(0, 8)
    .map((child) => JSON.stringify(child.id))
    .join(", ");
}

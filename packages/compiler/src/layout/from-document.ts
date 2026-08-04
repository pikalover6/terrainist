/**
 * Turning a validated settlement document into solver input.
 *
 * The document is the author's intent; `LayoutNodeInput` is the solver's
 * working shape. Everything defaulted here is defaulted *once*, so the solver
 * never has to ask "did they say that or not".
 */

import { nodeSeed, type Seed256 } from "@terrainist/stdlib";
import {
  authoredProgramId,
  canonicalize,
  hoverOf,
  isAuthoredGenerator,
  isPlaceableNode,
  note,
  resolveTypeKey,
  type AuthoredProgramRecord,
  type CanonicalConstraint,
  type CityNode,
  type DistrictNode,
  type LoamDiagnostic,
  type PlazaNode,
  type ProgramNode,
  type SettlementDocument,
  type StructureNode,
  type Yaw,
} from "@terrainist/spec";

import type { LayoutNodeInput } from "./types.js";

/** Footprint a `building.grammar@0` node gets when it declares no envelope. */
export const DEFAULT_BUILDING_FOOTPRINT = 9;

/** Floors × floor height, when the params say nothing. */
export const DEFAULT_BUILDING_FLOORS = 2;

/** Blocks per floor, when the params and style say nothing (§7.5). */
export const DEFAULT_FLOOR_HEIGHT = 4;

/** Every yaw, in the order the solver tries them. */
const ALL_YAWS: readonly Yaw[] = [0, 90, 180, 270];

/** Solver input extracted from a document. */
export interface LayoutExtraction {
  readonly nodes: readonly LayoutNodeInput[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** Build the solver's node list from a validated settlement document. */
export function layoutNodesFrom(doc: SettlementDocument, worldSeed: bigint): LayoutExtraction {
  const rootPath = doc.root.id;
  const nodes: LayoutNodeInput[] = [];
  const diagnostics: LoamDiagnostic[] = [];

  for (const child of doc.root.children) {
    const nodePath = `${rootPath}.${child.id}`;
    // A landmark program is a placed node like any other — it just gets its box
    // from the program's declared envelope instead of from the document, since
    // §7.6 forbids the node from restating it.
    if (child.kind === "generator" && isAuthoredGenerator((child as ProgramNode).generator)) {
      // A hovering landmark does not compete for ground: it floats above
      // whatever the solver puts down, so it never enters the node list.
      if (hoverOf(child) !== undefined) continue;
      const program = programOf(doc, (child as ProgramNode).generator);
      if (program === undefined) continue;
      nodes.push(
        programInput(
          child as ProgramNode,
          program,
          nodePath,
          nodeSeed(worldSeed, nodePath, child.seedSalt ?? ""),
        ),
      );
      continue;
    }
    if (!isPlaceableNode(child)) continue;
    const seed: Seed256 = nodeSeed(worldSeed, nodePath, child.seedSalt ?? "");

    if (child.kind === "primitive") {
      nodes.push(plazaInput(child, nodePath, seed));
      continue;
    }

    if (child.kind === "district") {
      nodes.push(districtInput(child, nodePath, seed));
      continue;
    }

    if (child.kind === "city") {
      nodes.push(cityInput(child, nodePath, seed));
      continue;
    }

    const structure = child;
    if (structure.generator === "road.network@0" && structure.envelope === undefined) {
      // §4.9.6 / §7.5: the network *does* reserve a route corridor at substage
      // 3b now — see `roadCorridors` — but it is still not a *placed* node: it
      // has no box, no yaw and no footprint, so it contributes nothing to the
      // solver's node list. The corridor is registered separately, from the
      // anchors' coarse points, and the routing itself is still pass 6.
      diagnostics.push(
        note(
          "GENERATOR_NOT_IMPLEMENTED",
          nodePath,
          "road.network@0 reserves a route corridor at substage 3b (which `along` binds to and structures are costed against) but is not itself a placed node: it has no envelope, no yaw and no footprint, and its lanes are routed in the connective pass",
          'nothing to change — give the node an "envelope" only if you want the solver to reserve a box for it as well',
        ),
      );
      continue;
    }
    nodes.push(structureInput(structure, nodePath, seed));
  }

  return { nodes, diagnostics };
}

function structureInput(node: StructureNode, nodePath: string, seed: Seed256): LayoutNodeInput {
  const envelope = node.envelope;
  const size = envelope?.size ?? defaultBuildingSize(node);
  return {
    id: node.id,
    nodePath,
    kind: "generator",
    generator: node.generator,
    size,
    ...(envelope?.minSize === undefined ? {} : { minSize: envelope.minSize }),
    flexible: envelope?.flexible === true,
    padding: envelope?.padding ?? 0,
    rotations: envelope?.rotations ?? ALL_YAWS,
    constraints: canonicalConstraints(node.constraints),
    ports: node.ports ?? {},
    optional: node.optional === true,
    tags: node.tags ?? [],
    seed,
  };
}

/** The record an `authored:<id>` reference names, if the document has one. */
export function programOf(
  doc: SettlementDocument,
  generator: string,
): AuthoredProgramRecord | undefined {
  const id = authoredProgramId(generator);
  if (id === undefined) return undefined;
  return doc.programs?.[id];
}

/**
 * A landmark program, as the solver sees it: **the program's own box.**
 *
 * One rotation only. The pass lowers a run's node-local voxels straight into
 * the world, so a yaw the solver chose would be a yaw nothing ever applied.
 */
function programInput(
  node: ProgramNode,
  program: AuthoredProgramRecord,
  nodePath: string,
  seed: Seed256,
): LayoutNodeInput {
  const [w, h, d] = program.envelope;
  return {
    id: node.id,
    nodePath,
    kind: "generator",
    generator: node.generator,
    size: [w, h, d],
    flexible: false,
    padding: 0,
    rotations: [0],
    constraints: canonicalConstraints(node.constraints),
    ports: node.ports ?? {},
    optional: node.optional === true,
    tags: node.tags ?? [],
    seed,
  };
}

function plazaInput(node: PlazaNode, nodePath: string, seed: Seed256): LayoutNodeInput {
  const [w, d] = node.envelope.size ?? [24, 24];
  return {
    id: node.id,
    nodePath,
    kind: "primitive",
    size: [w, 1, d],
    flexible: false,
    padding: 0,
    // A plaza is symmetric ground; rotating it would only churn the seed.
    rotations: [0],
    constraints: canonicalConstraints(node.constraints),
    ports: node.ports ?? {},
    optional: node.optional === true,
    tags: node.tags ?? [],
    seed,
  };
}

/**
 * A district, as the solver sees it: **one footprint and nothing else.**
 *
 * The solver's whole job for a district is to decide where it sits — against
 * `zone`, `at`, `distance`, the water and the slopes, exactly as for any other
 * node. What is inside it is not the solver's business, so the node carries no
 * ports, no rotations worth trying (a fabric is drawn against world axes; the
 * streets would only have to be un-rotated again) and a height of 1, because
 * the pad it emits is what the fabric pass then builds on.
 */
function districtInput(node: DistrictNode, nodePath: string, seed: Seed256): LayoutNodeInput {
  const [w, d] = node.envelope.size ?? [128, 128];
  return {
    id: node.id,
    nodePath,
    kind: "district",
    size: [w, 1, d],
    flexible: false,
    padding: 0,
    rotations: [0],
    constraints: canonicalConstraints(node.constraints),
    ports: node.ports ?? {},
    optional: node.optional === true,
    tags: node.tags ?? [],
    seed,
  };
}

/**
 * A city, as the solver sees it: **one amphibious footprint and nothing else.**
 *
 * Two things separate it from a district, and both come from the same fact —
 * a city is placed *against the coast*, not merely near it.
 *
 * `amphibious` lifts the freeboard veto so a candidate footprint may reach
 * below sea level; `wantsWater` is only set when the author asked for a coastal
 * city, so an inland one is not pushed towards a lake it never mentioned.
 * And no pad: levelling a whole city to one plane would raise the sea bed
 * inside its own bay and there would be no waterfront left to build on. Each
 * building levels its own footprint, as it always did, and the arterials and
 * streets grade themselves — which is also what lets a city step down a hill.
 */
function cityInput(node: CityNode, nodePath: string, seed: Seed256): LayoutNodeInput {
  const [w, d] = node.envelope.size ?? [320, 320];
  return {
    id: node.id,
    nodePath,
    kind: "city",
    size: [w, 1, d],
    flexible: false,
    padding: 0,
    rotations: [0],
    constraints: canonicalConstraints(node.constraints),
    ports: node.ports ?? {},
    optional: node.optional === true,
    tags: node.tags ?? [],
    amphibious: true,
    ...(node.params.coastal === true ? { wantsWater: true } : {}),
    seed,
  };
}

/** Footprint and height for a building that declared no envelope. */
function defaultBuildingSize(node: StructureNode): [number, number, number] {
  const params = node.params ?? {};
  const floors = typeof params["floors"] === "number" ? params["floors"] : DEFAULT_BUILDING_FLOORS;
  const floorHeight =
    typeof params["floorHeight"] === "number" ? params["floorHeight"] : DEFAULT_FLOOR_HEIGHT;
  return [
    DEFAULT_BUILDING_FOOTPRINT,
    Math.max(1, Math.round(floors * floorHeight)),
    DEFAULT_BUILDING_FOOTPRINT,
  ];
}

/**
 * Canonicalize declared constraints (§4.1), preserving declaration order —
 * the index is load-bearing for `zone` jitter (§4.9.3).
 *
 * Anything that does not resolve was already reported by the validator, so it
 * is dropped silently here rather than diagnosed twice.
 */
export function canonicalConstraints(
  constraints: readonly CanonicalConstraint[] | undefined,
): CanonicalConstraint[] {
  if (constraints === undefined) return [];
  const out: CanonicalConstraint[] = [];
  for (const raw of constraints) {
    if (typeof raw !== "object" || raw === null) continue;
    const resolved = resolveTypeKey(raw as Record<string, unknown>);
    if (!resolved.ok) continue;
    out.push(desugarBeside(canonicalize(raw as Record<string, unknown>, resolved.type, resolved.shorthand)));
  }
  return out;
}

/**
 * `beside` → `along`, per §4.4: *"pure sugar … no new solver primitive is
 * involved"*.
 *
 * Desugaring here rather than in `canonicalize` is deliberate. The spec
 * package's canonical form is what the *validator* reports against, and an
 * author who wrote `beside` should be told about their `beside`; the solver, on
 * the other hand, must not grow a second copy of the corridor machinery just to
 * spell the same question differently. So the rewrite happens exactly once, on
 * the way into the solver, and leaves `desugaredFrom` behind so the solver
 * report can still name what the document said.
 *
 * The two defaults §4.4 gives it — a wider band, and no `faceRoad` — are
 * applied only where the author did not state them.
 */
export function desugarBeside(constraint: CanonicalConstraint): CanonicalConstraint {
  if (constraint.type !== "beside") return constraint;
  return {
    ...constraint,
    type: "along",
    desugaredFrom: "beside",
    offset: constraint["offset"] ?? [2, 8],
    faceRoad: constraint["faceRoad"] ?? false,
  } as CanonicalConstraint;
}

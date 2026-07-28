/**
 * Turning a validated settlement document into solver input.
 *
 * The document is the author's intent; `LayoutNodeInput` is the solver's
 * working shape. Everything defaulted here is defaulted *once*, so the solver
 * never has to ask "did they say that or not".
 */

import { nodeSeed, type Seed256 } from "@terrainist/stdlib";
import {
  canonicalize,
  isPlaceableNode,
  note,
  resolveTypeKey,
  type CanonicalConstraint,
  type LoamDiagnostic,
  type PlazaNode,
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
    if (!isPlaceableNode(child)) continue;
    const nodePath = `${rootPath}.${child.id}`;
    const seed: Seed256 = nodeSeed(worldSeed, nodePath, child.seedSalt ?? "");

    if (child.kind === "primitive") {
      nodes.push(plazaInput(child, nodePath, seed));
      continue;
    }

    const structure = child;
    if (structure.generator === "road.network@0" && structure.envelope === undefined) {
      // v0.2 §4.9.6 / §7.5: not yet — `road.network@0.corridors()` should
      // register frozen route corridors at substage 3b. Corridor construction
      // and routing land in G4b, so an envelope-less road network contributes
      // no placement and no occupancy yet.
      diagnostics.push(
        note(
          "GENERATOR_NOT_IMPLEMENTED",
          nodePath,
          "road.network@0 registers route corridors at substage 3b; corridor construction is not implemented yet, so this node is carried but not placed",
          'nothing to change — give the node an "envelope" only if you want the solver to reserve a box for it in the meantime',
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
    out.push(canonicalize(raw as Record<string, unknown>, resolved.type, resolved.shorthand));
  }
  return out;
}

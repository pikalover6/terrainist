/**
 * Settlement-profile document types.
 *
 * `"profile": "settlement"` is a **superset** of the terrain profile: every
 * terrain construct is legal and carries exactly the terrain profile's
 * restrictions (no constraints, no ports, edits only under the heightfield,
 * one heightfield and one climate node). On top of that the root may carry
 * **structure nodes** — `building.grammar@0` and `road.network@0` generators —
 * and at most one `plaza` primitive, all of which go through the layout solver.
 *
 * Like the terrain types, these are the *validated* shapes: a value typed
 * {@link SettlementDocument} has already been through
 * {@link validateSettlementDocument}.
 */

import type {
  ClimateNode,
  ForestNode,
  HeightfieldNode,
  RegionEnvelope,
  TerrainMeta,
  TerrainStyle,
} from "../terrain/types.js";
import type { CanonicalConstraint } from "./constraints.js";

/** Generators the settlement profile adds on top of the terrain set. */
export const STRUCTURE_GENERATORS = [
  "building.grammar@0",
  "road.network@0",
  // The precinct kits (F3). They are structure nodes in every sense the solver
  // cares about — a box, a yaw, a footprint it reserves like any other — and
  // differ only in what the structure pass does with the box once it is placed:
  // a whole compound of ground works, props and buildings, laid out
  // deterministically rather than solved.
  "precinct.airport@0",
  "precinct.harbour@0",
] as const;

/** The `precinct.*@0` family, which lays out a compound from one envelope. */
export const PRECINCT_GENERATORS = ["precinct.airport@0", "precinct.harbour@0"] as const;

/** A precinct generator id. */
export type PrecinctGenerator = (typeof PRECINCT_GENERATORS)[number];

/** True for a node that is one of the precinct kits. */
export function isPrecinctGenerator(generator: string): generator is PrecinctGenerator {
  return (PRECINCT_GENERATORS as readonly string[]).includes(generator);
}

/** A structure generator id. */
export type StructureGenerator = (typeof STRUCTURE_GENERATORS)[number];

/**
 * Terrain-profile generators the settlement profile does **not** inherit.
 *
 * `cave.carver@0` is excluded because it has no occupancy to respect yet: the
 * v0.2 `protectTags` param — the field that keeps a cave from eating a town's
 * foundations — is unimplemented, so a cave under a settlement would be a
 * lottery on whether the smithy still has a floor. It comes back when
 * `protectTags` does.
 */
export const SETTLEMENT_EXCLUDED_GENERATORS = ["cave.carver@0"] as const;

/**
 * Port types the profile implements. Other v0.2 types parse with `LOAM-T206`.
 *
 * `tunnel_stub` joined the set with the underground connective pass: it is the
 * one port type whose *position* is not on the node's above-ground shell, so it
 * is resolved by the tunnel pass against the building's cellar rather than by
 * the generic port geometry — but it is resolved, and a document that declares
 * one gets the opening it asked for.
 */
export const PORT_TYPES = ["door", "road_stub", "tunnel_stub"] as const;

/** A port type the profile implements. */
export type PortType = (typeof PORT_TYPES)[number];

/** Every port type Loam v0.2 §5.3 defines — the set that parses without error. */
export const V02_PORT_TYPES = [
  "door",
  "gate",
  "arch",
  "window",
  "road_stub",
  "path_stub",
  "tunnel_stub",
  "bridge_stub",
  "rail_stub",
  "dock",
  "canal_stub",
  "stair_top",
  "stair_bottom",
  "shaft",
  "socket",
  "interior",
] as const;

/** The four horizontal faces the solver can place a port on. */
export const HORIZONTAL_FACES = ["north", "south", "east", "west"] as const;

/** A horizontal face. */
export type HorizontalFace = (typeof HORIZONTAL_FACES)[number];

/** Every `face` value v0.2 §5.1 allows. */
export const V02_FACES = [...HORIZONTAL_FACES, "up", "down", "any", "auto"] as const;

/** A declared face. */
export type PortFace = (typeof V02_FACES)[number];

/** A declared port (§5.1 subset). */
export interface PortDeclaration {
  readonly type: string;
  readonly face?: PortFace;
  /** `"center"` or `[u, v]` along/up the face. */
  readonly at?: "center" | readonly [number, number];
  readonly width?: number;
  readonly height?: number;
  readonly tags?: readonly string[];
  readonly note?: string;
}

/** The yaw values the solver may choose. */
export const YAWS = [0, 90, 180, 270] as const;

/** A quantized yaw. */
export type Yaw = (typeof YAWS)[number];

/** A box envelope (§3.3 subset): a requested volume with no position. */
export interface BoxEnvelope {
  readonly shape: "box";
  readonly size: readonly [number, number, number];
  readonly minSize?: readonly [number, number, number];
  readonly maxSize?: readonly [number, number, number];
  readonly flexible?: boolean;
  readonly rotations?: readonly Yaw[];
  readonly padding?: number;
}

/** Fields every structure-ish node shares. */
interface StructureBase {
  readonly id: string;
  readonly constraints?: readonly CanonicalConstraint[];
  readonly ports?: Readonly<Record<string, PortDeclaration>>;
  readonly optional?: boolean;
  readonly seedSalt?: string;
  readonly tags?: readonly string[];
  readonly label?: string;
  readonly note?: string;
}

/** A `building.grammar@0` / `road.network@0` node under the root. */
export interface StructureNode extends StructureBase {
  readonly kind: "generator";
  readonly generator: StructureGenerator;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly envelope?: BoxEnvelope;
}

/**
 * A `prop.place@0` node under the root.
 *
 * Its own type rather than a third {@link StructureGenerator}, because it is
 * not one: a prop takes no part in the layout solve. It carries the *coarse*
 * placement vocabulary in its params (`zone`, `at`, `jitter`, `yaw`) and is
 * resolved against the finished ground by the structure pass, which is the
 * only stage that knows where the water and the lanes ended up.
 */
export interface PropNode extends StructureBase {
  readonly kind: "generator";
  readonly generator: "prop.place@0";
  readonly params?: Readonly<Record<string, unknown>>;
  readonly envelope?: BoxEnvelope;
}

/** True for a `prop.place@0` node. */
export function isPropNode(node: SettlementChildNode): node is PropNode {
  return node.kind === "generator" && node.generator === "prop.place@0";
}

/** The optional single plaza: a primitive holding a region of open ground. */
export interface PlazaNode extends StructureBase {
  readonly kind: "primitive";
  readonly envelope: RegionEnvelope;
  readonly params?: Readonly<Record<string, unknown>>;
}

/** Any node the settlement profile allows below the root. */
export type SettlementChildNode =
  | HeightfieldNode
  | ClimateNode
  | ForestNode
  | StructureNode
  | PropNode
  | PlazaNode;

/** True for the nodes the layout solver places. */
export function isPlaceableNode(node: SettlementChildNode): node is StructureNode | PlazaNode {
  if (node.kind === "primitive") return true;
  // A prop node is deliberately not placeable: it is resolved coarsely by the
  // structure pass against the finished ground, not by the solver.
  return (STRUCTURE_GENERATORS as readonly string[]).includes(node.generator);
}

/** The root composite of a settlement document. */
export interface SettlementRootNode {
  readonly id: string;
  readonly kind: "composite";
  readonly envelope: RegionEnvelope;
  readonly children: readonly SettlementChildNode[];
  readonly tags?: readonly string[];
  readonly seedSalt?: string;
  readonly label?: string;
  readonly note?: string;
}

/** A validated settlement-profile document. */
export interface SettlementDocument {
  readonly loam: string;
  readonly profile: "settlement";
  readonly meta: TerrainMeta;
  readonly style?: TerrainStyle;
  readonly root: SettlementRootNode;
}

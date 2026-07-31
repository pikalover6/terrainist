/**
 * `precinct.*@0` — the building grammar's philosophy at settlement scale.
 *
 * A precinct is a *compound*: a deterministic layout of ground works, props and
 * buildings derived from one envelope and a handful of params. Nothing inside
 * it is placed by the layout solver — the solver places the precinct's box, and
 * everything within is arithmetic on that box.
 *
 * That inversion is the whole point. The old settlement solver treats a town as
 * a bag of buildings with pairwise constraints, which is why an aerodrome came
 * out as three aeroplanes resting on grass at three unrelated headings and a
 * harbour as ships clumped at random. Neither of those is a *placement* problem
 * — an apron stand grid and a line of moorings are geometry, and geometry is
 * what this module does.
 *
 * Two kits ship in v0:
 *
 * - **`precinct.airport@0`** — runway on the long axis, a parallel taxiway,
 *   an apron of stands between the taxiway and the terminal frontage, aircraft
 *   parked one to a stand with a single nose-out heading, hangars at the apron
 *   ends, a terminal and a control tower fronting the apron with their doors
 *   landside, and a windsock at the runway threshold.
 * - **`precinct.harbour@0`** — a quay wall along the *actual* shoreline inside
 *   the envelope, a quay surface behind it, piers perpendicular to the quay at
 *   deterministic spacing, ships moored parallel to the pier axes on one
 *   heading, gantry cranes on the quay and warehouses fronting it.
 *
 * ## Contracts this module holds
 *
 * - **Determinism.** Every choice is either arithmetic on the footprint or a
 *   draw from `streamSeed(nodeSeed, …)`. There is no iteration-order
 *   dependence and no wall clock.
 * - **The envelope is exact.** Nothing this module emits leaves the placed
 *   footprint. A precinct that cannot fit its own minimum emits a diagnostic
 *   with a fix hint and builds *nothing* — never half a layout.
 * - **Physics.** Ground works go into the column plan (like a road or a plaza)
 *   rather than over it, so the heightmap, the fluid validator and the scatter
 *   all see the same world. Ships are placed by the ordinary prop placer, which
 *   is the one thing in the compiler that knows how a hull displaces water.
 * - **Buildings flow through the ordinary buildings pass**, so they get the
 *   village theme, foundations, doorsteps and the physics discipline every
 *   other building gets.
 */

import {
  AIRCRAFT_FOOTPRINTS,
  RUNWAY_LENGTH,
  RUNWAY_WIDTH,
  SHIP_FOOTPRINTS,
  seed32,
  streamSeed,
  type Seed256,
  type StructureYaw,
} from "@terrainist/stdlib";
import { error, type LoamDiagnostic, type PortDeclaration } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import { resolvePorts } from "../layout/ports.js";
import type { OccupancyGrid, Placement, ResolvedPort } from "../layout/types.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";

import type { StructureBlock } from "./buildings.js";

/* -------------------------------------------------------------------------- */
/* the generator family                                                        */
/* -------------------------------------------------------------------------- */

/** The precinct generators this compiler implements, in catalog order. */
export const PRECINCT_GENERATORS = ["precinct.airport@0", "precinct.harbour@0"] as const;

/** A precinct generator id. */
export type PrecinctGenerator = (typeof PRECINCT_GENERATORS)[number];

/** True for a generator this module builds. */
export function isPrecinctGenerator(g: string): g is PrecinctGenerator {
  return (PRECINCT_GENERATORS as readonly string[]).includes(g);
}

/** Smallest airport envelope, as `[long, cross]`. */
export const AIRPORT_MIN = Object.freeze({ long: 120, cross: 80 });

/** Smallest harbour envelope, as `[quay, depth]` — the quay run and the reach. */
export const HARBOUR_MIN = Object.freeze({ quay: 64, depth: 48 });

/** Cross-axis band plan of an aerodrome, in columns from the airside edge. */
export const AIRPORT_BANDS = Object.freeze({
  /** Clear ground outside the runway. */
  margin: 3,
  runway: RUNWAY_WIDTH,
  /** Runway-to-taxiway separation. */
  strip: 5,
  taxiway: 6,
  /** Taxiway-to-apron separation. */
  fillet: 2,
  /** Depth of the terminal frontage band. */
  terminal: 14,
  /** Apron-to-terminal separation. */
  forecourt: 2,
});

/** Columns of quay surface behind the retaining wall. */
export const QUAY_DEPTH = 7;

/** How far a pier reaches out from the quay. */
export const PIER_LENGTH = 12;

/** Width of a pier deck. */
export const PIER_WIDTH = 2;

/** Height of a quay crane's mast above the quay, in blocks. */
export const CRANE_HEIGHT = 9;

/** How far a crane's jib reaches out over the water. */
export const CRANE_REACH = 5;

/* -------------------------------------------------------------------------- */
/* inputs and outputs                                                          */
/* -------------------------------------------------------------------------- */

/** One precinct the structure pass is asked to lay out. */
export interface PrecinctJob {
  readonly nodePath: string;
  readonly generator: PrecinctGenerator;
  readonly placement: Placement;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: Seed256;
  readonly tags: readonly string[];
  /** Ports the document declared on the precinct node. */
  readonly ports: Readonly<Record<string, PortDeclaration>>;
}

/**
 * A building the precinct wants built.
 *
 * Deliberately *not* a `BuildingJob`: the theme deal is the settlement's
 * business, so the caller folds these into its own job list and hands each one
 * a material triple before the buildings pass runs.
 */
export interface PrecinctBuildingSpec {
  readonly nodePath: string;
  readonly placement: Placement;
  /** The unrotated envelope — precinct buildings are always placed at yaw 0. */
  readonly size: readonly [number, number, number];
  readonly archetype: string;
  readonly tags: readonly string[];
  readonly ports: Readonly<Record<string, PortDeclaration>>;
}

/** A prop the precinct wants placed, already resolved to a column and a yaw. */
export interface PrecinctPropSpec {
  readonly nodePath: string;
  readonly prop: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Aggregate numbers about what the precincts laid out. */
export interface PrecinctStats {
  readonly airports: number;
  readonly harbours: number;
  readonly stands: number;
  readonly aircraft: number;
  readonly hangars: number;
  readonly piers: number;
  readonly ships: number;
  readonly cranes: number;
  /** Columns of apron, taxiway and quay surfaced. */
  readonly surfacedColumns: number;
}

/** What {@link buildPrecincts} produced. */
export interface PrecinctPassResult {
  readonly blocks: readonly StructureBlock[];
  readonly buildings: readonly PrecinctBuildingSpec[];
  readonly props: readonly PrecinctPropSpec[];
  /** Synthetic `road_stub` ports — the landside approach of each precinct. */
  readonly ports: readonly ResolvedPort[];
  /** Node paths the road pass may treat as anchors. */
  readonly anchorPaths: readonly string[];
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly stats: PrecinctStats;
}

/** Everything {@link buildPrecincts} reads. */
export interface PrecinctPassInput {
  readonly jobs: readonly PrecinctJob[];
  /** Mutated: ground works are a change to the ground, not a thing upon it. */
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  readonly occupancy?: OccupancyGrid;
}

/* -------------------------------------------------------------------------- */
/* the frame                                                                   */
/* -------------------------------------------------------------------------- */

/** A unit step in the world's column plane. */
interface Dir {
  readonly dx: number;
  readonly dz: number;
}

/**
 * An oriented `(u, v)` frame over a footprint.
 *
 * Both axes are cardinal and both run non-negative from the frame origin, so a
 * rectangle in `(u, v)` is a rectangle in the world and no layout arithmetic
 * ever has to think about which way round the world is.
 */
interface Frame2 {
  readonly ox: number;
  readonly oz: number;
  readonly u: Dir;
  readonly v: Dir;
  readonly uLen: number;
  readonly vLen: number;
}

/** The frame whose `+v` points the given way over a footprint. */
function frameFacing(rect: Rect, v: Dir): Frame2 {
  const u: Dir = { dx: -v.dz, dz: v.dx };
  const w = rect.x1 - rect.x0 + 1;
  const d = rect.z1 - rect.z0 + 1;
  return {
    ox: u.dx === -1 || v.dx === -1 ? rect.x1 : rect.x0,
    oz: u.dz === -1 || v.dz === -1 ? rect.z1 : rect.z0,
    u,
    v,
    uLen: u.dx !== 0 ? w : d,
    vLen: v.dx !== 0 ? w : d,
  };
}

/** The world column at frame coordinates. */
function at(f: Frame2, u: number, v: number): { x: number; z: number } {
  return { x: f.ox + f.u.dx * u + f.v.dx * v, z: f.oz + f.u.dz * u + f.v.dz * v };
}

/** The world rectangle covering a frame rectangle, inclusive at both ends. */
function frameRect(f: Frame2, u0: number, v0: number, u1: number, v1: number): Rect {
  const a = at(f, u0, v0);
  const b = at(f, u1, v1);
  return {
    x0: Math.min(a.x, b.x),
    z0: Math.min(a.z, b.z),
    x1: Math.max(a.x, b.x),
    z1: Math.max(a.z, b.z),
  };
}

/** The yaw that carries a prop's local `+x` onto a world direction. */
function yawAlongX(d: Dir): StructureYaw {
  if (d.dx === 1) return 0;
  if (d.dz === 1) return 90;
  if (d.dx === -1) return 180;
  return 270;
}

/** The yaw that carries a prop's local `+z` onto a world direction. */
function yawAlongZ(d: Dir): StructureYaw {
  if (d.dz === 1) return 0;
  if (d.dx === -1) return 90;
  if (d.dz === -1) return 180;
  return 270;
}

/** The cardinal face name a direction points at. */
function faceOf(d: Dir): "north" | "south" | "east" | "west" {
  if (d.dz === 1) return "south";
  if (d.dz === -1) return "north";
  return d.dx === 1 ? "east" : "west";
}

/**
 * The min corner of the world rectangle a prop occupies, given the frame
 * rectangle it should fill.
 *
 * `prop.place@0` targets a prop's *min corner*, so a layout that thinks in
 * `(u, v)` has to hand it the corner rather than the frame origin — which are
 * the same column only when both axes run positive.
 */
function propCorner(f: Frame2, u0: number, v0: number, uSpan: number, vSpan: number): { x: number; z: number } {
  return {
    x: frameRect(f, u0, v0, u0 + uSpan - 1, v0 + vSpan - 1).x0,
    z: frameRect(f, u0, v0, u0 + uSpan - 1, v0 + vSpan - 1).z0,
  };
}

/* -------------------------------------------------------------------------- */
/* deterministic draws                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A 32-bit value from a node seed stream and one integer.
 *
 * The `stands` and `moorings` draws want "the same answer for stand 3 of this
 * precinct on every run and a different one for stand 4", which is exactly a
 * positional hash — no sequential RNG, so inserting a stand never reshuffles
 * the ones after it.
 */
function pick(seed: Seed256, stream: string, index: number): number {
  return seed32(streamSeed(seed, `${stream}.${index}`)) >>> 0;
}

/* -------------------------------------------------------------------------- */
/* ground works                                                                */
/* -------------------------------------------------------------------------- */

/** The block states the precinct kits surface with. */
interface PrecinctStates {
  readonly apron: number;
  readonly taxiway: number;
  readonly marking: number;
  readonly quay: number;
  readonly quayEdge: number;
  readonly stone: number;
  readonly mast: number;
  readonly jib: number;
  readonly banner: number;
  readonly pole: number;
}

function resolveStates(stack: PrismarineStack): PrecinctStates {
  const of = (name: string, props: Record<string, string> = {}, fallback = "stone"): number =>
    stack.blockStateOf(name, props) ?? stack.blockStateOf(fallback, {}) ?? 0;
  return {
    apron: of("light_gray_concrete"),
    taxiway: of("gray_concrete"),
    marking: of("white_concrete"),
    quay: of("smooth_stone"),
    quayEdge: of("stone_bricks"),
    stone: of("stone"),
    mast: of("iron_block"),
    jib: of("iron_bars", { east: "false", north: "false", south: "false", waterlogged: "false", west: "false" }),
    banner: of("white_wall_banner", { rotation: "0" }, "white_wool"),
    pole: of("stripped_oak_log", { axis: "y" }),
  };
}

/**
 * Bring one column to a plane, cutting or filling, and surface it.
 *
 * The plan is the record of record: the emitter lays terrain from `ground` and
 * `surface`, the scatter reads `ground`, and the fluid validator reads
 * `fluidTop`. Writing all three is what makes an apron a change to the ground
 * rather than a slab lying on it — and cutting is safe here because the
 * structure pass runs *before* the scatter, so nothing is standing on the
 * blocks a cut removes.
 */
function surfaceColumn(plan: ColumnPlan, idx: number, top: number, state: number, states: PrecinctStates): void {
  plan.ground[idx] = top;
  plan.surface[idx] = state;
  plan.subsurface[idx] = states.stone;
  plan.soil[idx] = 0;
  plan.snow[idx] = 0;
  plan.fluidKind[idx] = FluidKind.NONE;
  plan.fluidTop[idx] = top;
  plan.lakeMask[idx] = 0;
  plan.oceanMask[idx] = 0;
}

/** Column index of a world column, or `undefined` outside the region. */
function indexOf(plan: ColumnPlan, x: number, z: number): number | undefined {
  const i = x - plan.region.x0;
  const j = z - plan.region.z0;
  if (i < 0 || j < 0 || i >= plan.region.width || j >= plan.region.depth) return undefined;
  return j * plan.region.width + i;
}

/** Claim a rectangle in the occupancy grid under `structure` and `precinct`. */
function claim(occupancy: OccupancyGrid | undefined, rect: Rect, tag: string): void {
  if (occupancy === undefined) return;
  const { region } = occupancy;
  const tags = occupancy.byTag as Map<string, Uint8Array>;
  const masks = ["structure", tag].map((name) => {
    let mask = tags.get(name);
    if (mask === undefined) {
      mask = new Uint8Array(occupancy.mask.length);
      tags.set(name, mask);
    }
    return mask;
  });
  for (let z = rect.z0; z <= rect.z1; z++) {
    const j = z - region.z0;
    if (j < 0 || j >= region.depth) continue;
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = x - region.x0;
      if (i < 0 || i >= region.width) continue;
      const idx = j * region.width + i;
      occupancy.mask[idx] = 1;
      for (const mask of masks) mask[idx] = 1;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** Lay out every precinct, in document order. */
export function buildPrecincts(input: PrecinctPassInput): PrecinctPassResult {
  const blocks: StructureBlock[] = [];
  const buildings: PrecinctBuildingSpec[] = [];
  const props: PrecinctPropSpec[] = [];
  const ports: ResolvedPort[] = [];
  const anchorPaths: string[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  const states = resolveStates(input.stack);
  let airports = 0;
  let harbours = 0;
  let stands = 0;
  let aircraft = 0;
  let hangars = 0;
  let piers = 0;
  let ships = 0;
  let cranes = 0;
  let surfacedColumns = 0;

  for (const job of input.jobs) {
    const out =
      job.generator === "precinct.airport@0"
        ? layOutAirport(job, input, states)
        : layOutHarbour(job, input, states);
    diagnostics.push(...out.diagnostics);
    if (!out.ok) continue;
    blocks.push(...out.blocks);
    buildings.push(...out.buildings);
    props.push(...out.props);
    ports.push(...out.ports);
    anchorPaths.push(job.nodePath);
    if (job.generator === "precinct.airport@0") airports++;
    else harbours++;
    stands += out.counts.stands;
    aircraft += out.counts.aircraft;
    hangars += out.counts.hangars;
    piers += out.counts.piers;
    ships += out.counts.ships;
    cranes += out.counts.cranes;
    surfacedColumns += out.counts.surfaced;
  }

  return {
    blocks,
    buildings,
    props,
    ports,
    anchorPaths,
    diagnostics,
    stats: { airports, harbours, stands, aircraft, hangars, piers, ships, cranes, surfacedColumns },
  };
}

/** What one precinct laid out. */
interface OneResult {
  readonly ok: boolean;
  readonly blocks: StructureBlock[];
  readonly buildings: PrecinctBuildingSpec[];
  readonly props: PrecinctPropSpec[];
  readonly ports: ResolvedPort[];
  readonly diagnostics: LoamDiagnostic[];
  readonly counts: {
    stands: number;
    aircraft: number;
    hangars: number;
    piers: number;
    ships: number;
    cranes: number;
    surfaced: number;
  };
}

function empty(diagnostics: LoamDiagnostic[]): OneResult {
  return {
    ok: false,
    blocks: [],
    buildings: [],
    props: [],
    ports: [],
    diagnostics,
    counts: { stands: 0, aircraft: 0, hangars: 0, piers: 0, ships: 0, cranes: 0, surfaced: 0 },
  };
}

/**
 * The landside approach of a precinct, as a `road_stub` the road pass can see.
 *
 * A precinct is a placed node with a footprint but no walls, so the generic
 * port resolver has nothing to hang an opening off. The precinct knows where
 * its own gate is — the middle of its landside edge — so it says so directly.
 */
function approachPort(
  job: PrecinctJob,
  f: Frame2,
  u: number,
  v: number,
  outward: Dir,
  y: number,
): ResolvedPort {
  const c = at(f, u, v);
  return {
    ref: `${job.nodePath}#approach`,
    nodePath: job.nodePath,
    name: "approach",
    type: "road_stub",
    position: [c.x, y + 1, c.z],
    outwardNormal: [outward.dx, 0, outward.dz],
    face: faceOf(outward),
    width: 3,
    height: 1,
    floorY: y + 1,
  };
}

/**
 * A synthetic placement for a building the precinct puts down itself.
 *
 * Always yaw 0. A precinct already worked out which way the world faces when it
 * chose its frame, so rotating the building as well would mean composing two
 * rotations to answer "which wall does the door go in" — and a door in the
 * wrong wall is the defect this whole module exists to prevent.
 */
function placementAt(nodePath: string, id: string, rect: Rect, height: number, groundY: number): Placement {
  return {
    nodePath,
    id,
    translation: [rect.x0, groundY, rect.z0],
    yaw: 0,
    mirror: false,
    size: [rect.x1 - rect.x0 + 1, height, rect.z1 - rect.z0 + 1],
    footprint: rect,
    anchor: { x: (rect.x0 + rect.x1) >> 1, z: (rect.z0 + rect.z1) >> 1 },
    foundationY: groundY,
  };
}

/* -------------------------------------------------------------------------- */
/* precinct.airport@0                                                          */
/* -------------------------------------------------------------------------- */

/** Aircraft the apron parks, smallest first. */
const APRON_FLEET = ["light_plane", "biplane", "cargo_plane", "airliner"] as const;

/** Smallest stand this kit will cut, in columns across the apron. */
export const MIN_STAND_WIDTH = 16;

/**
 * Lay out an aerodrome.
 *
 * Bands run across the short axis from the airside edge inwards: margin,
 * runway, strip, taxiway, fillet, apron, forecourt, terminal frontage. That
 * ordering *is* the design — an apron between the taxiway and the terminal is
 * what makes aeroplanes face the terminal and the terminal's doors face the
 * road, without either fact ever being stated as a constraint.
 */
function layOutAirport(job: PrecinctJob, input: PrecinctPassInput, states: PrecinctStates): OneResult {
  const { plan } = input;
  const rect = job.placement.footprint;
  const w = rect.x1 - rect.x0 + 1;
  const d = rect.z1 - rect.z0 + 1;
  const longIsX = w >= d;
  const long = longIsX ? w : d;
  const cross = longIsX ? d : w;

  if (long < AIRPORT_MIN.long || cross < AIRPORT_MIN.cross) {
    return empty([
      error(
        "CANNOT_FIT",
        job.nodePath,
        `precinct.airport@0 was placed in a ${long}×${cross} box; a runway, a taxiway and an apron of stands need at least ${AIRPORT_MIN.long}×${AIRPORT_MIN.cross}`,
        `grow the node's "envelope.size" to at least [${AIRPORT_MIN.long}, 24, ${AIRPORT_MIN.cross}] — an aerodrome is a large piece of ground and this kit will not build half of one`,
      ),
    ]);
  }

  // The frame: `+v` runs from the airside edge (the runway) inland to the
  // terminal frontage and the road beyond it.
  const f = frameFacing(rect, longIsX ? { dx: 0, dz: 1 } : { dx: 1, dz: 0 });
  const airside: Dir = { dx: -f.v.dx, dz: -f.v.dz };
  const groundY = job.placement.foundationY;
  const baseY = groundY + 1;

  const b = AIRPORT_BANDS;
  const runwayV0 = b.margin;
  const taxiV0 = runwayV0 + b.runway + b.strip;
  const apronV0 = taxiV0 + b.taxiway + b.fillet;
  const wantTerminal = job.params["terminal"] !== false;
  const terminalBand = wantTerminal ? b.terminal + b.forecourt : 0;
  const apronV1 = cross - 1 - b.margin - terminalBand;
  const apronDepth = apronV1 - apronV0 + 1;
  if (apronDepth < 14) {
    return empty([
      error(
        "CANNOT_FIT",
        job.nodePath,
        `precinct.airport@0 has only ${apronDepth} columns of apron between its taxiway and its terminal frontage; a stand needs 14`,
        'widen the envelope across the short axis, or set "terminal": false for a bare airstrip',
      ),
    ]);
  }

  const u0 = b.margin;
  const u1 = long - 1 - b.margin;
  const usableU = u1 - u0 + 1;

  const blocks: StructureBlock[] = [];
  const buildings: PrecinctBuildingSpec[] = [];
  const props: PrecinctPropSpec[] = [];

  // --- 1: the ground -------------------------------------------------------
  // One plane over the whole precinct. The solver's pad edit has normally done
  // this already (a placed node gets `cut_fill` by default), so on a healthy
  // compile this loop writes surfaces and changes no heights at all; it is here
  // because a stand grid on rolling ground is not a stand grid.
  let surfaced = 0;
  for (let v = 0; v < cross; v++) {
    for (let u = 0; u < long; u++) {
      const c = at(f, u, v);
      const idx = indexOf(plan, c.x, c.z);
      if (idx === undefined) continue;
      const onTaxiway = v >= taxiV0 && v < taxiV0 + b.taxiway;
      const onApron = v >= apronV0 && v <= apronV1;
      if (onTaxiway) {
        // A dashed centreline down the taxiway, so it reads as a taxiway rather
        // than as a grey rectangle.
        const centre = v === taxiV0 + (b.taxiway >> 1);
        surfaceColumn(plan, idx, groundY, centre && u % 5 < 3 ? states.marking : states.taxiway, states);
        surfaced++;
      } else if (onApron) {
        surfaceColumn(plan, idx, groundY, states.apron, states);
        surfaced++;
      } else if (plan.fluidKind[idx] === FluidKind.NONE) {
        // Grass, but level: the runway strip and the forecourt are graded
        // ground, not paving.
        plan.ground[idx] = groundY;
        plan.fluidTop[idx] = groundY;
        plan.snow[idx] = 0;
      }
    }
  }
  claim(input.occupancy, rect, "precinct");

  // --- 2: the runway -------------------------------------------------------
  const runwayLength = Math.min(RUNWAY_LENGTH.hi, Math.max(RUNWAY_LENGTH.lo, usableU));
  const runwayU0 = u0 + ((usableU - runwayLength) >> 1);
  props.push({
    nodePath: `${job.nodePath}.runway`,
    prop: "runway",
    params: {
      length: runwayLength,
      yaw: yawAlongX(f.u),
      at: propCorner(f, runwayU0, runwayV0, runwayLength, RUNWAY_WIDTH),
    },
  });

  // --- 3: the windsock at the threshold ------------------------------------
  // Built here rather than drawn from the prop catalog: `windsock` is a catalog
  // entry with no generator behind it, and a mast is four blocks.
  const sock = at(f, Math.max(1, runwayU0 - 2), runwayV0 + (RUNWAY_WIDTH >> 1));
  const sockIdx = indexOf(plan, sock.x, sock.z);
  if (sockIdx !== undefined) {
    for (let dy = 0; dy < 4; dy++) {
      blocks.push({ x: sock.x, y: baseY + dy, z: sock.z, stateId: states.pole });
    }
    // The banner brackets to the mast's top log, which is a full block — a
    // banner on a fence is the classic floating-decoration finding.
    const side = at(f, Math.max(1, runwayU0 - 2) - 1, runwayV0 + (RUNWAY_WIDTH >> 1));
    blocks.push({ x: side.x, y: baseY + 3, z: side.z, stateId: states.banner });
  }

  // --- 4: the hangars ------------------------------------------------------
  const hangarFoot = AIRCRAFT_FOOTPRINTS["hangar"]?.({}) ?? { size: [25, 14, 19] as const, minY: 0 };
  const hangarU = hangarFoot.size[2];
  const hangarV = hangarFoot.size[0];
  const wantHangars = clampInt(job.params["hangars"], 2, 0, 4);
  const craftYaw = yawAlongX(airside);
  const hangarBays: number[] = [];
  const canHangar = hangarV <= apronDepth;
  for (let i = 0; i < wantHangars && canHangar; i++) {
    const leftSide = i % 2 === 0;
    const slot = i >> 1;
    const bu = leftSide ? u0 + slot * (hangarU + 2) : u1 - hangarU + 1 - slot * (hangarU + 2);
    if (bu < u0 || bu + hangarU - 1 > u1) break;
    hangarBays.push(bu);
    props.push({
      nodePath: `${job.nodePath}.hangar_${i}`,
      prop: "hangar",
      params: { yaw: craftYaw, at: propCorner(f, bu, apronV0, hangarU, hangarV) },
    });
  }

  // --- 5: the stand grid ---------------------------------------------------
  // What the hangars left, in the middle of the apron.
  let standU0: number = u0;
  let standU1: number = u1;
  for (const bu of hangarBays) {
    if (bu - u0 < u1 - (bu + hangarU - 1)) standU0 = Math.max(standU0, bu + hangarU + 1);
    else standU1 = Math.min(standU1, bu - 2);
  }
  const standSpan = standU1 - standU0 + 1;
  const wantStands = clampInt(job.params["stands"], 5, 1, 12);
  const standCount = Math.max(0, Math.min(wantStands, Math.floor(standSpan / MIN_STAND_WIDTH)));
  if (standCount === 0) {
    return empty([
      error(
        "CANNOT_FIT",
        job.nodePath,
        `precinct.airport@0 has ${standSpan} columns of apron frontage left after its hangars — not enough for one ${MIN_STAND_WIDTH}-column stand`,
        'lengthen the envelope along its long axis, or set "hangars": 0 to give the whole apron over to stands',
      ),
    ]);
  }
  const standWidth = Math.floor(standSpan / standCount);
  let parked = 0;
  for (let k = 0; k < standCount; k++) {
    const su = standU0 + k * standWidth;
    // The stand's lead-in line: what a nose wheel is steered along, and what
    // makes an apron read as an apron from the air.
    for (let dv = 0; dv < Math.min(apronDepth, 10); dv++) {
      const c = at(f, su + (standWidth >> 1), apronV0 + dv);
      const idx = indexOf(plan, c.x, c.z);
      if (idx !== undefined) plan.surface[idx] = states.marking;
    }
    const fits = APRON_FLEET.filter((name) => {
      const foot = AIRCRAFT_FOOTPRINTS[name]?.({});
      if (foot === undefined) return false;
      return foot.size[0] <= apronDepth && foot.size[2] <= standWidth - 2;
    });
    if (fits.length === 0) continue;
    const craft = fits[pick(job.seed, "stand", k) % fits.length] as string;
    const foot = AIRCRAFT_FOOTPRINTS[craft]?.({}) as { size: readonly [number, number, number] };
    const uSpan = foot.size[2];
    const vSpan = foot.size[0];
    props.push({
      nodePath: `${job.nodePath}.stand_${k}`,
      prop: craft,
      params: {
        yaw: craftYaw,
        at: propCorner(f, su + ((standWidth - uSpan) >> 1), apronV0, uSpan, vSpan),
      },
    });
    parked++;
  }

  // --- 6: the terminal and the tower ---------------------------------------
  const landside = f.v;
  if (wantTerminal) {
    const termV0 = apronV1 + 1 + b.forecourt;
    const termDepth = b.terminal;
    const termWidth = Math.min(34, Math.max(16, standSpan - 8));
    const termU0 = standU0 + ((standSpan - termWidth) >> 1);
    const termRect = frameRect(f, termU0, termV0, termU0 + termWidth - 1, termV0 + termDepth - 1);
    const termSize: [number, number, number] = [
      termRect.x1 - termRect.x0 + 1,
      12,
      termRect.z1 - termRect.z0 + 1,
    ];
    buildings.push({
      nodePath: `${job.nodePath}.terminal`,
      placement: placementAt(`${job.nodePath}.terminal`, "terminal", termRect, 12, groundY),
      size: termSize,
      archetype: "airport_terminal",
      tags: [...job.tags, "precinct", "terminal"],
      ports: { main_door: { type: "door", face: faceOf(landside), at: "center" } },
    });

    // The tower, beside the terminal on the apron side of the frontage, its
    // door landside like the terminal's.
    const towerWidth = 9;
    const towerU0 = Math.min(termU0 + termWidth + 3, standU1 - towerWidth + 1);
    if (towerU0 > termU0 + termWidth) {
      const towerRect = frameRect(f, towerU0, termV0, towerU0 + towerWidth - 1, termV0 + towerWidth - 1);
      buildings.push({
        nodePath: `${job.nodePath}.tower`,
        placement: placementAt(`${job.nodePath}.tower`, "tower", towerRect, 20, groundY),
        size: [
          towerRect.x1 - towerRect.x0 + 1,
          20,
          towerRect.z1 - towerRect.z0 + 1,
        ],
        archetype: "control_tower",
        tags: [...job.tags, "precinct", "tower"],
        ports: { main_door: { type: "door", face: faceOf(landside), at: "center" } },
      });
    }
  }

  const port = approachPort(job, f, (u0 + u1) >> 1, cross - 1, landside, groundY);
  return {
    ok: true,
    blocks,
    buildings,
    props,
    ports: [port, ...resolvePorts(job.placement, job.placement.size, job.ports)],
    diagnostics: [],
    counts: {
      stands: standCount,
      aircraft: parked,
      hangars: hangarBays.length,
      piers: 0,
      ships: 0,
      cranes: 0,
      surfaced,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* precinct.harbour@0                                                          */
/* -------------------------------------------------------------------------- */

/** Hulls the harbour moors, smallest first. */
const MOORING_FLEET = ["speedboat", "tugboat", "fishing_trawler", "yacht", "cog", "ferry", "caravel"] as const;

/**
 * Lay out a harbour.
 *
 * Unlike the aerodrome, whose geometry is invented, a harbour's is *found*: the
 * quay follows the shoreline that is actually in the envelope, which is why the
 * first thing this does is read the column plan rather than divide up a
 * rectangle. An envelope with no water in it is not a harbour with a problem,
 * it is not a harbour, and it says so.
 */
function layOutHarbour(job: PrecinctJob, input: PrecinctPassInput, states: PrecinctStates): OneResult {
  const { plan } = input;
  const rect = job.placement.footprint;

  // --- 1: which way is the sea? --------------------------------------------
  let waterCount = 0;
  let waterX = 0;
  let waterZ = 0;
  let landCount = 0;
  let landX = 0;
  let landZ = 0;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const idx = indexOf(plan, x, z);
      if (idx === undefined) continue;
      if (plan.fluidKind[idx] === FluidKind.WATER) {
        waterCount++;
        waterX += x;
        waterZ += z;
      } else if (plan.fluidKind[idx] === FluidKind.NONE) {
        landCount++;
        landX += x;
        landZ += z;
      }
    }
  }
  if (waterCount === 0 || landCount === 0) {
    return empty([
      error(
        "CANNOT_FIT",
        job.nodePath,
        waterCount === 0
          ? "precinct.harbour@0 was placed on a footprint with no water in it — a quay has nothing to face"
          : "precinct.harbour@0 was placed entirely in water — a quay has no landward side",
        'constrain the node to the shore: add {"near": "^.the_sea"} or {"zone": "south"} so the solver puts its envelope across the waterline, and check the heightfield\'s "seaLevel" actually floods there',
      ),
    ]);
  }
  const dx = waterX / waterCount - landX / landCount;
  const dz = waterZ / waterCount - landZ / landCount;
  const sea: Dir =
    Math.abs(dx) >= Math.abs(dz) ? { dx: dx >= 0 ? 1 : -1, dz: 0 } : { dx: 0, dz: dz >= 0 ? 1 : -1 };
  const f = frameFacing(rect, sea);
  const land: Dir = { dx: -sea.dx, dz: -sea.dz };

  // --- 2: where is the waterline? ------------------------------------------
  // For each line across the quay axis, the first water column walking seaward.
  // A line with no water, or water pressed against the landward edge, has no
  // quay on it — a harbour built on the honest shoreline is bumpy, and that is
  // the point.
  const shore = new Int32Array(f.uLen).fill(-1);
  let waterY = Number.NEGATIVE_INFINITY;
  let shoreLines = 0;
  for (let u = 0; u < f.uLen; u++) {
    for (let v = QUAY_DEPTH; v < f.vLen - 4; v++) {
      const c = at(f, u, v);
      const idx = indexOf(plan, c.x, c.z);
      if (idx === undefined) break;
      if (plan.fluidKind[idx] !== FluidKind.WATER) continue;
      shore[u] = v;
      shoreLines++;
      if (waterY === Number.NEGATIVE_INFINITY) waterY = plan.fluidTop[idx] as number;
      break;
    }
  }
  if (shoreLines < 16 || waterY === Number.NEGATIVE_INFINITY) {
    return empty([
      error(
        "CANNOT_FIT",
        job.nodePath,
        `precinct.harbour@0 found only ${shoreLines} columns of usable shoreline inside its envelope; a quay needs at least 16, with ${QUAY_DEPTH} columns of dry land behind it`,
        `grow the envelope to at least [${HARBOUR_MIN.quay}, 16, ${HARBOUR_MIN.depth}] and constrain it so the waterline crosses the middle of the box, not its edge`,
      ),
    ]);
  }
  const quayTop = waterY + 1;

  const blocks: StructureBlock[] = [];
  const buildings: PrecinctBuildingSpec[] = [];
  const props: PrecinctPropSpec[] = [];

  // --- 3: the quay ---------------------------------------------------------
  // The retaining course is the shoreline column itself, filled from its bed to
  // one above the water; the quay surface is the `QUAY_DEPTH - 1` columns
  // behind it, cut or filled to the same plane. Both go into the plan, so the
  // emitter lays them as terrain and the fluid validator sees a wall rather
  // than a wall-shaped hole in a sea.
  let surfaced = 0;
  for (let u = 0; u < f.uLen; u++) {
    const s = shore[u] as number;
    if (s < 0) continue;
    for (let back = 0; back < QUAY_DEPTH; back++) {
      const v = s - back;
      if (v < 0) break;
      const c = at(f, u, v);
      const idx = indexOf(plan, c.x, c.z);
      if (idx === undefined) continue;
      surfaceColumn(plan, idx, quayTop, back === 0 ? states.quayEdge : states.quay, states);
      surfaced++;
    }
  }
  claim(input.occupancy, rect, "precinct");

  // --- 4: the piers, and the ships alongside them --------------------------
  const wantPiers = clampInt(job.params["piers"], 3, 1, 8);
  const usable: number[] = [];
  for (let u = 0; u < f.uLen; u++) if ((shore[u] as number) >= 0) usable.push(u);
  const spacing = Math.floor(usable.length / (wantPiers + 1));
  const pierYaw = yawAlongZ(sea);
  const shipYaw = yawAlongX(sea);
  const shipsParam = job.params["ships"];
  const wantShips =
    typeof shipsParam === "number" ? clampInt(shipsParam, wantPiers, 0, wantPiers) : wantPiers;

  let pierCount = 0;
  let shipCount = 0;
  for (let i = 0; i < wantPiers; i++) {
    const u = usable[(i + 1) * spacing];
    if (u === undefined) break;
    const s = shore[u] as number;
    const corner = propCorner(f, u, s, PIER_WIDTH, PIER_LENGTH);
    props.push({
      nodePath: `${job.nodePath}.pier_${i}`,
      prop: "pier",
      params: { length: PIER_LENGTH, width: PIER_WIDTH, yaw: pierYaw, at: corner },
    });
    pierCount++;

    if (shipCount >= wantShips) continue;
    // Moored alongside, on the same heading as every other ship in the port:
    // hull long axis along the pier axis, three columns clear of the deck, and
    // started far enough out that the placer's spiral has deep water to find.
    const fits = MOORING_FLEET.filter((name) => {
      const foot = SHIP_FOOTPRINTS[name]?.({});
      return foot !== undefined && foot.size[0] <= PIER_LENGTH + 6;
    });
    if (fits.length === 0) continue;
    const hull = fits[pick(job.seed, "mooring", i) % fits.length] as string;
    const foot = SHIP_FOOTPRINTS[hull]?.({}) as { size: readonly [number, number, number] };
    props.push({
      nodePath: `${job.nodePath}.ship_${i}`,
      prop: hull,
      params: {
        yaw: shipYaw,
        at: propCorner(f, u + PIER_WIDTH + 2, s + 2, foot.size[2], foot.size[0]),
      },
    });
    shipCount++;
  }

  // --- 5: the cranes -------------------------------------------------------
  // A mast of iron on the quay with a jib of bars reaching out over the water.
  // No `chain` — it is not in the pinned block table — and nothing hanging off
  // the jib's far end, which would be a block with air under it.
  let cranes = 0;
  for (let i = 0; i < wantPiers - 1 && usable.length > 0; i++) {
    const u = usable[Math.floor(((i + 1) * usable.length) / wantPiers)];
    if (u === undefined) continue;
    const s = shore[u] as number;
    if (s < 2) continue;
    const foot = at(f, u, s - 2);
    for (let dy = 1; dy <= CRANE_HEIGHT; dy++) {
      blocks.push({ x: foot.x, y: quayTop + dy, z: foot.z, stateId: states.mast });
    }
    for (let reach = 1; reach <= CRANE_REACH; reach++) {
      const c = at(f, u, s - 2 + reach);
      blocks.push({ x: c.x, y: quayTop + CRANE_HEIGHT, z: c.z, stateId: states.jib });
    }
    cranes++;
  }

  // --- 6: the sheds on the quay road ---------------------------------------
  // Landward of the quay, fronting it, doors to the road behind them.
  const shedV = maxOf(shore) - QUAY_DEPTH - 12;
  if (shedV >= 0) {
    const sheds: readonly { readonly archetype: string; readonly width: number }[] = [
      { archetype: "warehouse", width: 15 },
      { archetype: "boathouse", width: 11 },
    ];
    let cursor = Math.max(0, ((f.uLen - 30) >> 1));
    for (const [i, shed] of sheds.entries()) {
      if (cursor + shed.width - 1 >= f.uLen) break;
      const shedRect = frameRect(f, cursor, shedV, cursor + shed.width - 1, shedV + 11);
      buildings.push({
        nodePath: `${job.nodePath}.${shed.archetype}_${i}`,
        placement: placementAt(
          `${job.nodePath}.${shed.archetype}_${i}`,
          `${shed.archetype}_${i}`,
          shedRect,
          10,
          quayTop,
        ),
        size: [shedRect.x1 - shedRect.x0 + 1, 10, shedRect.z1 - shedRect.z0 + 1],
        archetype: shed.archetype,
        tags: [...job.tags, "precinct", "quay"],
        ports: { main_door: { type: "door", face: faceOf(land), at: "center" } },
      });
      cursor += shed.width + 3;
    }
  }

  const port = approachPort(job, f, f.uLen >> 1, 0, land, quayTop);
  return {
    ok: true,
    blocks,
    buildings,
    props,
    ports: [port, ...resolvePorts(job.placement, job.placement.size, job.ports)],
    diagnostics: [],
    counts: {
      stands: 0,
      aircraft: 0,
      hangars: 0,
      piers: pierCount,
      ships: shipCount,
      cranes,
      surfaced,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** A numeric param, rounded and clamped, or the fallback when it is not one. */
function clampInt(raw: unknown, fallback: number, lo: number, hi: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(raw)));
}

/** The largest entry of an `Int32Array`, or `-1` when it is all `-1`. */
function maxOf(values: Int32Array): number {
  let best = -1;
  for (const v of values) if (v > best) best = v;
  return best;
}

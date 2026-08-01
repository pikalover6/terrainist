/**
 * Laying a city's fabric — fabric v3, C1, the second half.
 *
 * {@link buildCityPlan} decides the armature and the cells; this file turns
 * each cell into buildings by handing it to the *district* fabric pass with a
 * mask and an orientation. That reuse is the whole design: a cell is a district
 * whose outline happens to be a polygon and whose knobs were decided by where
 * it sits, so blocks, lots, frontage seating, landmark claiming and auto-infill
 * are shared code and there is exactly one place a change to any of them lands.
 *
 * It lives beside `district.ts` rather than inside it for two reasons: the
 * terrace-run work is live in that file and this should not collide with it,
 * and `city.ts` → `district.ts` → `city.ts` would be an import cycle. The
 * compiler runs the two passes back to back at the same stage.
 */

import { nodeSeed, type Seed256 } from "@terrainist/stdlib";
import {
  SET_PIECE_KINDS,
  error,
  isCityNode,
  isPrecinctGenerator,
  note,
  warning,
  type CityNode,
  type DistrictNode,
  type LoamDiagnostic,
  type PortDeclaration,
  type SetPieceKindName,
  type StructureNode,
} from "@terrainist/spec";

import {
  CELL_MIN_BUILDING,
  buildCityPlan,
  type CityPlan,
  type CityPlanStats,
  type DistrictCell,
} from "./city.js";
import {
  layDistrict,
  medianGround,
  yawFacing,
  type DistrictPassInput,
  type DistrictProduct,
} from "./district.js";
import type { Rect } from "./frames.js";
import { frontFace, resolvePorts, rotatedSize } from "./ports.js";
import { MIN_DISTRICT_SPAN, SIDEWALK_BY_DENSITY } from "./streets.js";
import type { LayoutNodeInput, PadEdit, Placement, ResolvedPort } from "./types.js";
import {
  SET_PIECE_MAX,
  planVistas,
  seatOnAxis,
  terminatingLandmark,
  type SetPiece,
  type SetPieceKind,
  type SetPieceParams,
  type VistaAxis,
} from "./vistas.js";

/** One city's plan, as the compile report carries it. */
export interface CityProduct {
  readonly nodePath: string;
  readonly plan: CityPlan;
  readonly stats: CityPlanStats;
  /** Cells that got no fabric: parks, and anything too thin to hold a grid. */
  readonly openCells: number;
  /**
   * Cells given over whole to a precinct kit. Always zero for now — see the
   * precinct note in {@link solveCities}'s per-city pass.
   */
  readonly precinctCells: number;
  /** C4's vista axes, in the order the plan rated them. */
  readonly vistas: readonly VistaAxis[];
  /** C4's seated anchors. The structure pass dresses the ones that need it. */
  readonly setPieces: readonly SetPiece[];
}

/** What the city pass hands back — the district pass's shape, plus the plans. */
export interface CityPassResult {
  readonly nodes: readonly LayoutNodeInput[];
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  readonly padEdits: readonly PadEdit[];
  readonly params: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  /** One per *cell* — the cells are districts and flow on as districts. */
  readonly districts: readonly DistrictProduct[];
  readonly cities: readonly CityProduct[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Columns a cell's block spacing spends on road before any building sees it:
 * the widest carriageway plus a sidewalk band either side, plus a column of
 * slack for the jitter. What is left is the deepest landmark the cell can hold.
 */
export const LANDMARK_BLOCK_OVERHEAD = 13;

/**
 * How much bigger than its landmark's block a cell must be to be offered it.
 *
 * `blockSize` is the spacing a cell *would* use, not a promise that it owns a
 * block that size: a cell is an arbitrary polygon and its blocks are the
 * skeleton clipped to it, so a small wedge and the core quarter can carry the
 * same nominal number. Ranking on the nominal alone sent three of Bayline's
 * five landmarks — the tallest tower among them — into cells with no block
 * that could take them, and dropped them. Raising `blockSize` to compensate
 * cost 79 buildings and moved which three failed, because the nominal was
 * never the binding constraint.
 */
export const CELL_LANDMARK_SLACK = 1.6;

/** Lay the fabric of every city in the document. */
export function solveCities(input: DistrictPassInput): CityPassResult {
  const rootPath = input.doc.root.id;
  const byPath = new Map(input.placements.map((p) => [p.nodePath, p] as const));

  const nodes: LayoutNodeInput[] = [];
  const placements: Placement[] = [];
  const ports: ResolvedPort[] = [];
  const padEdits: PadEdit[] = [];
  const params = new Map<string, Readonly<Record<string, unknown>>>();
  const districts: DistrictProduct[] = [];
  const cities: CityProduct[] = [];
  const diagnostics: LoamDiagnostic[] = [];

  for (const child of input.doc.root.children) {
    if (!isCityNode(child)) continue;
    const nodePath = `${rootPath}.${child.id}`;
    const placement = byPath.get(nodePath);
    if (placement === undefined) continue; // dropped by the solver; already reported.
    const laid = layCity(child, nodePath, placement, input, diagnostics);
    if (laid === null) continue;
    nodes.push(...laid.nodes);
    placements.push(...laid.placements);
    ports.push(...laid.ports);
    padEdits.push(...laid.padEdits);
    for (const [path, p] of laid.params) params.set(path, p);
    districts.push(...laid.districts);
    cities.push(laid.product);
  }

  return { nodes, placements, ports, padEdits, params, districts, cities, diagnostics };
}

/* -------------------------------------------------------------------------- */
/* one city                                                                    */
/* -------------------------------------------------------------------------- */

interface LaidCity {
  readonly nodes: readonly LayoutNodeInput[];
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  readonly padEdits: readonly PadEdit[];
  readonly params: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly districts: readonly DistrictProduct[];
  readonly product: CityProduct;
}

function layCity(
  node: CityNode,
  nodePath: string,
  placement: Placement,
  input: DistrictPassInput,
  diagnostics: LoamDiagnostic[],
): LaidCity | null {
  const seed: Seed256 = nodeSeed(input.worldSeed, nodePath, node.seedSalt ?? "");
  const planned = buildCityPlan({
    bounds: placement.footprint,
    field: input.field,
    ...(input.water === undefined ? {} : { water: input.water }),
    seaLevel: input.seaLevel ?? 63,
    seed,
    params: {
      size: node.params.size,
      ...(node.params.coastal === undefined ? {} : { coastal: node.params.coastal }),
      ...(node.params.diagonals === undefined ? {} : { diagonals: node.params.diagonals }),
      ...(node.params.ring === undefined ? {} : { ring: node.params.ring }),
      ...(node.params.blockSize === undefined ? {} : { blockSize: node.params.blockSize }),
    },
  });
  if (!planned.ok) {
    diagnostics.push(error("CITY_TOO_SMALL", nodePath, planned.reason, planned.fix));
    return null;
  }
  const plan = planned.plan;
  if (node.params.coastal === true && !planned.stats.coastal) {
    diagnostics.push(
      note(
        "CITY_PARAM",
        nodePath,
        'this city asked to be coastal but the ground the solver found it has no shore, so no drive was drawn',
        'drop "params.coastal", or give the city an "at"/"zone" constraint that puts it on the water — the terrain node decides where the water is',
      ),
    );
  }

  // --- C4: where the intent goes -------------------------------------------
  // Planned here, off the finished armature and before anything is seated, so
  // the axes are a function of the plan alone: which landmark ends up closing
  // one, or whether any does, cannot move it.
  const vistaPlan = planVistas({
    plan,
    field: input.field,
    ...(input.water === undefined ? {} : { water: input.water }),
    seaLevel: input.seaLevel ?? 63,
    seed,
    params: resolveSetPieceParams(node.params.setPieces),
  });

  // --- what the author put in the city -------------------------------------
  const landmarks: StructureNode[] = [];
  const pinned: StructureNode[] = [];
  const precincts: StructureNode[] = [];
  for (const child of node.children ?? []) {
    const structure = child as StructureNode;
    if (isPrecinctGenerator(structure.generator)) precincts.push(structure);
    else if (vistaPinOf(structure) !== null) pinned.push(structure);
    else landmarks.push(structure);
  }

  const nodes: LayoutNodeInput[] = [];
  const placements: Placement[] = [];
  const ports: ResolvedPort[] = [];
  const padEdits: PadEdit[] = [];
  const params = new Map<string, Readonly<Record<string, unknown>>>();
  const districts: DistrictProduct[] = [];

  // --- precincts: parsed, reserved, and not yet seated ---------------------
  //
  // A harbour or an airport is a *quarter*, not a lot, and giving one the cell
  // it belongs in is the city-scale version of a landmark claiming a block. The
  // machinery to do it works — rank the cells, seat the box on the waterline,
  // cut it out of the neighbouring fabric — and the result still lints two
  // hundred `interior.blocked_column` findings, because `precinct.harbour@0`
  // grades its quay from the waterline and lays its sheds at quay level, and a
  // box C1 chose puts those sheds against a bank the ordinary solver would have
  // scored and refused. Getting that agreement right is the harbour kit's
  // problem as much as C1's, and shipping a path that produces two hundred
  // findings to save an authoring line is the wrong trade.
  //
  // So: the node **validates** (the authoring surface is real and the other
  // tracks can code against it), and the plan says plainly where to put it
  // instead. Writing the precinct beside the city is what every shipped world
  // does today and it costs one constraint.
  for (const spec of precincts) {
    diagnostics.push(
      note(
        "GENERATOR_NOT_IMPLEMENTED",
        `${nodePath}.${spec.id}`,
        `a ${spec.generator} inside a city is parsed but not yet laid: C1 can choose the quarter for it, and the kit cannot yet grade its own ground to a plot the city chose`,
        `move this node out of "${nodePath}" and make it a sibling of the city, with a "distance" or "at" constraint to keep it beside the right edge — the solver scores the shore and the apron for it, which is what the kit needs`,
      ),
    );
  }

  // --- C4: the set pieces ---------------------------------------------------
  // Before the cells are laid, and that ordering is the whole of the track. A
  // terminating landmark and a civic square are the only two things in a city
  // that take ground *away* from the fabric; every other set piece is dressing
  // added later over ground somebody else already owns. Ask for the ground
  // after the quarters have been subdivided and the answer is a building
  // standing in a terrace.
  const seated = seatSetPieces({
    node,
    nodePath,
    plan,
    seed,
    input,
    pinned,
    vistas: vistaPlan.axes,
    diagnostics,
  });
  nodes.push(...seated.nodes);
  placements.push(...seated.placements);
  ports.push(...seated.ports);
  padEdits.push(...seated.padEdits);
  for (const [path, p] of seated.params) params.set(path, p);
  // A landmark the author pinned that could take no axis is still a landmark:
  // it falls back into the ordinary distribution rather than being dropped.
  landmarks.push(...seated.unclaimed);
  const setPieces: SetPiece[] = [...seated.pieces, ...vistaPlan.pieces];
  // Ground the fabric may not have. The seated footprints get a collar so a
  // terrace does not come up hard against a cathedral's buttress; the square
  // is exact, because its edge *is* the frontage that faces it.
  const reserved: Rect[] = [
    ...seated.reserved.map((r) => grow(r, SET_PIECE_COLLAR)),
    ...vistaPlan.pieces.filter((p) => p.kind === "square").map((p) => p.site),
  ];

  // --- landmarks are spread across the cells that carry the skyline --------
  const buildable = plan.cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => hasFabric(cell));
  const ranked = [...buildable].sort((a, b) => {
    const rank = LANDMARK_RANK[a.cell.character] - LANDMARK_RANK[b.cell.character];
    if (rank !== 0) return rank;
    if (a.cell.area !== b.cell.area) return b.cell.area - a.cell.area;
    return a.index - b.index;
  });
  const byCell = new Map<number, StructureNode[]>();
  const sortedLandmarks = landmarks
    .map((l, index) => ({ l, index }))
    .sort((a, b) => {
      const areaA = (a.l.envelope?.size?.[0] ?? 11) * (a.l.envelope?.size?.[2] ?? 11);
      const areaB = (b.l.envelope?.size?.[0] ?? 11) * (b.l.envelope?.size?.[2] ?? 11);
      return areaA !== areaB ? areaB - areaA : a.index - b.index;
    })
    .map((e) => e.l);
  if (ranked.length > 0) {
    // Biggest landmark first, into the highest-ranked cell whose *blocks* can
    // actually hold it and that has taken the fewest so far. Rank alone put a
    // twenty-nine-block hall in the core and a nineteen-block tower in a turned
    // rowhouse quarter, and both came back `CANNOT_FIT`: a landmark needs a
    // block, and a block is the cell's spacing less its carriageway and verges.
    const load = new Map<number, number>();
    for (const landmark of sortedLandmarks) {
      const [w, , d] = landmark.envelope?.size ?? [11, 11, 11];
      const need = Math.max(w as number, d as number);
      const span = need + LANDMARK_BLOCK_OVERHEAD;
      const fits = ranked.filter(({ cell }) => {
        if (cell.blockSize - LANDMARK_BLOCK_OVERHEAD < need) return false;
        // The cell has to be able to *contain* a block that big, not merely to
        // have chosen that spacing. Its bounding box is the loosest honest
        // test — a polygon narrower than the block cannot hold it however the
        // skeleton falls — and the area slack stands in for the fact that the
        // box is not the cell.
        const bw = cell.bounds.x1 - cell.bounds.x0 + 1;
        const bd = cell.bounds.z1 - cell.bounds.z0 + 1;
        if (Math.min(bw, bd) < span) return false;
        return cell.area >= span * span * CELL_LANDMARK_SLACK;
      });
      const pool = fits.length > 0 ? fits : ranked;
      let target = (pool[0] as { index: number }).index;
      let least = Infinity;
      for (const { index } of pool) {
        const taken = load.get(index) ?? 0;
        if (taken < least) {
          least = taken;
          target = index;
        }
      }
      load.set(target, least + 1);
      const list = byCell.get(target);
      if (list === undefined) byCell.set(target, [landmark]);
      else list.push(landmark);
    }
  } else {
    for (const landmark of sortedLandmarks) {
      diagnostics.push(
        warning(
          "CANNOT_FIT",
          `${nodePath}.${landmark.id}`,
          `"${nodePath}" has no district cell that can hold a fabric, so this landmark has nowhere to stand`,
          "grow the city's envelope, or lower its \"params.blockSize\" so its cells subdivide",
        ),
      );
    }
  }

  // --- every cell that is not a park and not a precinct gets a fabric ------
  let open = 0;
  for (const [index, cell] of plan.cells.entries()) {
    if (!hasFabric(cell)) {
      open++;
      continue;
    }
    const cellPath = `${nodePath}.${cell.id}`;
    const width = cell.bounds.x1 - cell.bounds.x0 + 1;
    const depth = cell.bounds.z1 - cell.bounds.z0 + 1;

    const synthetic: DistrictNode = {
      id: cell.id,
      kind: "district",
      envelope: { shape: "region", size: [width, depth] },
      params: {
        fabric: CELL_FABRIC[cell.character],
        density: cell.density,
        mix: mixFor(node, cell.character),
        blockSize: cell.blockSize,
        ...(cell.character === "civic" || cell.character === "core" ? { plaza: true } : {}),
      },
      seedSalt: cell.paletteSalt,
      children: byCell.get(index) ?? [],
    };
    const foundationY = maskMedian(input.field, cell);
    const seat: Placement = {
      nodePath: cellPath,
      id: cell.id,
      translation: [cell.bounds.x0, foundationY, cell.bounds.z0],
      yaw: 0,
      mirror: false,
      size: [width, 1, depth],
      footprint: cell.bounds,
      anchor: { x: cell.bounds.x0 + ((width - 1) >> 1), z: cell.bounds.z0 + ((depth - 1) >> 1) },
      foundationY,
    };
    // --- the cell's terrace -------------------------------------------------
    // A city gets no city-wide pad (see `padFor`), but a *quarter* is one
    // terrace: without this its buildings stand at the cell's median while its
    // own streets grade to the natural ground beside them, and the kerb ends up
    // two blocks below the shopfront — visible as a window box hanging in mid
    // air, which is how the probe found it.
    //
    // Two pads and the order matters. The ramp goes first: the largest
    // rectangle inside the cell with a six-block apron, which pulls the
    // *boulevard* outside the cell towards the quarter's level so the two meet
    // on a slope instead of a step. Then the mask itself, run by run at apron
    // zero, which pins every column of the quarter exactly — including the
    // wedges the ramp's rectangle could not reach. Arterials are at least nine
    // columns wide, so one cell's ramp can never reach across one into the
    // next cell's pinned ground.
    const ramp = largestRect(cell.bounds, cell.mask);
    if (ramp !== null) {
      padEdits.push({ nodePath: cellPath, footprint: ramp, targetY: foundationY, apron: 6 });
    }
    for (const run of maskRuns(cell.bounds, cell.mask)) {
      padEdits.push({ nodePath: cellPath, footprint: run, targetY: foundationY, apron: 0 });
    }

    const sidewalk = SIDEWALK_BY_DENSITY[cell.density] ?? 1;
    // The cell's diagnostics are filtered, and only this one is dropped: a
    // *district* too small to hold a fabric is an authoring error with an
    // envelope to grow, and a *cell* too small is a shape nobody wrote. The
    // plan drew it, the plan is allowed to leave it as open ground, and there
    // is nothing in the document for `DISTRICT_TOO_SMALL` to tell the author
    // to change — it would only fail the compile of a perfectly good city.
    const cellDiagnostics: LoamDiagnostic[] = [];
    const laid = layDistrict(synthetic, cellPath, seat, input, cellDiagnostics, {
      mask: cell.mask,
      lotMask: withoutReserved(
        erode(cell.mask, width, depth, sidewalk),
        cell.bounds,
        reserved,
      ),
      orientation: cell.orientation,
      blockSize: cell.blockSize,
      density: cell.density,
      foundationY,
      minBuilding: CELL_MIN_BUILDING,
      landmarkBase: nodePath,
    });
    diagnostics.push(...cellDiagnostics.filter((d) => d.name !== "DISTRICT_TOO_SMALL"));
    if (laid === null) {
      // A cell the fabric refused is open ground, not an error: the author
      // never drew this outline and there is nothing in the document to fix.
      // The park treatment and the ground pass have it from here.
      open++;
      continue;
    }
    nodes.push(...laid.nodes);
    placements.push(...laid.placements);
    ports.push(...laid.ports);
    padEdits.push(...laid.padEdits);
    for (const [path, p] of laid.params) params.set(path, p);
    districts.push(laid.product);
  }

  return {
    nodes,
    placements,
    ports,
    padEdits,
    params,
    districts,
    product: {
      nodePath,
      plan,
      stats: planned.stats,
      openCells: open,
      precinctCells: 0,
      vistas: seated.vistas,
      setPieces,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* C4 — set pieces and vista axes                                              */
/* -------------------------------------------------------------------------- */

/**
 * Columns of slack kept around a seated set piece before the fabric may build.
 *
 * Two, and it is the same number the district's own landmark pad uses. Zero
 * would let a terrace's party wall arrive flush against a cathedral's buttress
 * on a lot the subdivision never knew was contested; more would ring every
 * anchor with a moat, which is its own kind of generated-looking.
 */
export const SET_PIECE_COLLAR = 2;

/** Read `params.setPieces` into the planner's shape, defaulted. */
export function resolveSetPieceParams(raw: CityNode["params"]["setPieces"]): SetPieceParams {
  if (raw === false) return { enabled: false, max: 0 };
  if (raw === undefined || raw === true) return { enabled: true, max: SET_PIECE_MAX };
  const max = typeof raw.max === "number" ? Math.round(raw.max) : SET_PIECE_MAX;
  const kinds = raw.kinds?.filter((k): k is SetPieceKindName =>
    (SET_PIECE_KINDS as readonly string[]).includes(k),
  );
  return {
    enabled: max > 0,
    max: Math.max(0, Math.min(SET_PIECE_MAX, max)),
    ...(kinds === undefined || kinds.length === 0
      ? {}
      : { kinds: kinds as readonly SetPieceKind[] }),
  };
}

/**
 * What a landmark's `params.vista` asks for: any axis, or one arterial kind.
 *
 * `null` for a node that is not pinned at all, which is the ordinary case and
 * the one the caller branches on.
 */
export function vistaPinOf(node: StructureNode): true | string | null {
  const value = (node.params ?? {})["vista"];
  if (value === true) return true;
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

/** The door a plan-chosen landmark declares, on its own local south. */
const VISTA_PORTS: Readonly<Record<string, PortDeclaration>> = Object.freeze({
  door: Object.freeze({ type: "door", face: "south", tags: Object.freeze(["primary"]) }),
});

interface SeatInput {
  readonly node: CityNode;
  readonly nodePath: string;
  readonly plan: CityPlan;
  readonly seed: Seed256;
  readonly input: DistrictPassInput;
  readonly pinned: readonly StructureNode[];
  readonly vistas: readonly VistaAxis[];
  readonly diagnostics: LoamDiagnostic[];
}

interface SeatResult {
  readonly nodes: readonly LayoutNodeInput[];
  readonly placements: readonly Placement[];
  readonly ports: readonly ResolvedPort[];
  readonly padEdits: readonly PadEdit[];
  readonly params: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly pieces: readonly SetPiece[];
  /** The axes, with `closedBy` filled in where one was. */
  readonly vistas: readonly VistaAxis[];
  /** Footprints the fabric must leave alone. */
  readonly reserved: readonly Rect[];
  /** Pinned landmarks that took no axis, for the ordinary distribution. */
  readonly unclaimed: readonly StructureNode[];
}

/**
 * Close every vista axis: the author's landmarks first, then the plan's.
 *
 * **Author-pinned wins.** A document that says "the cathedral goes at the end
 * of the main boulevard" has already made the decision this pass would
 * otherwise make, and a plan that competes with it puts two landmarks on one
 * street. So the pinned nodes are offered every axis in the plan's own rating
 * order — filtered to the arterial kind when they named one — and only the
 * axes nobody asked for get a building chosen for them.
 */
function seatSetPieces(args: SeatInput): SeatResult {
  const { nodePath, seed, input, diagnostics } = args;
  const nodes: LayoutNodeInput[] = [];
  const placements: Placement[] = [];
  const ports: ResolvedPort[] = [];
  const padEdits: PadEdit[] = [];
  const params = new Map<string, Readonly<Record<string, unknown>>>();
  const pieces: SetPiece[] = [];
  const reserved: Rect[] = [];
  const unclaimed: StructureNode[] = [];
  const axes = args.vistas.map((a) => ({ ...a }) as VistaAxis & { closedBy?: string; authored?: boolean });
  const taken = new Set<string>();
  const usedIds = new Set<string>((args.node.children ?? []).map((c) => c.id));

  const seat = (
    axis: VistaAxis,
    id: string,
    size: readonly [number, number, number],
    declared: Readonly<Record<string, PortDeclaration>>,
    nodeParams: Readonly<Record<string, unknown>>,
    tags: readonly string[],
    salt: string,
  ): Rect | null => {
    const yaw = yawFacing(frontFace(declared, undefined), axis.facing);
    const [rw, rh, rd] = rotatedSize(size, yaw);
    const rect = seatOnAxis(axis, rw, rd);
    if (rect === null) return null;
    const childPath = `${nodePath}.${id}`;
    const foundationY = medianGround(input.field, rect);
    const made: Placement = {
      nodePath: childPath,
      id,
      translation: [rect.x0, foundationY, rect.z0],
      yaw,
      mirror: false,
      size: [rw, rh, rd],
      footprint: rect,
      anchor: { x: rect.x0 + ((rw - 1) >> 1), z: rect.z0 + ((rd - 1) >> 1) },
      foundationY,
    };
    nodes.push({
      id,
      nodePath: childPath,
      kind: "generator",
      generator: "building.grammar@0",
      size,
      flexible: false,
      padding: 0,
      rotations: [yaw],
      constraints: [],
      ports: declared,
      optional: false,
      tags,
      seed: nodeSeed(input.worldSeed, childPath, salt),
    });
    placements.push(made);
    ports.push(...resolvePorts(made, size, declared));
    // The same pad a district gives its own landmarks. The arterial corridor is
    // the one strip of a city nobody levels — a cell's terrace stops at the
    // kerb — so without this the building would sit on whatever the router
    // happened to climb over on its way to the boundary.
    padEdits.push({ nodePath: childPath, footprint: rect, targetY: foundationY, apron: 2 });
    params.set(childPath, nodeParams);
    return rect;
  };

  // --- the author's pins ----------------------------------------------------
  for (const landmark of args.pinned) {
    const want = vistaPinOf(landmark);
    if (want === null) continue;
    const size = landmarkSize(landmark);
    const declared = landmark.ports ?? VISTA_PORTS;
    let claimed: (VistaAxis & { closedBy?: string; authored?: boolean }) | null = null;
    for (const axis of axes) {
      if (taken.has(axis.id)) continue;
      if (typeof want === "string" && axis.arterialKind !== want) continue;
      const yaw = yawFacing(frontFace(declared, undefined), axis.facing);
      const [rw, , rd] = rotatedSize(size, yaw);
      if (seatOnAxis(axis, rw, rd) === null) continue;
      claimed = axis;
      break;
    }
    if (claimed === null) {
      diagnostics.push(
        warning(
          "VISTA_UNCLAIMED",
          `${nodePath}.${landmark.id}`,
          typeof want === "string"
            ? `no "${want}" in this city has an end with room for this landmark's ${size[0]} × ${size[2]} footprint, so it is placed on an ordinary frontage instead`
            : `every vista axis this city has is either already claimed or too small for this landmark's ${size[0]} × ${size[2]} footprint, so it is placed on an ordinary frontage instead`,
          typeof want === "string"
            ? 'write "vista": true to take whichever axis the plan rates highest, or shrink "envelope.size"'
            : 'shrink "envelope.size", or drop "vista" — the plan will choose its own building for the axis',
        ),
      );
      unclaimed.push(landmark);
      continue;
    }
    const rect = seat(
      claimed,
      landmark.id,
      size,
      declared,
      landmark.params ?? {},
      landmark.tags ?? [],
      landmark.seedSalt ?? "",
    );
    if (rect === null) {
      unclaimed.push(landmark);
      continue;
    }
    taken.add(claimed.id);
    reserved.push(rect);
    (claimed as { closedBy?: string }).closedBy = `${nodePath}.${landmark.id}`;
    (claimed as { authored?: boolean }).authored = true;
    pieces.push({
      id: `${claimed.id}_landmark`,
      kind: "landmark",
      site: rect,
      detail: `"${landmark.id}" closes the ${claimed.arterialKind} "${claimed.arterialId}", framed for ${claimed.run} columns of approach`,
      axisId: claimed.id,
      facing: claimed.facing,
      nodePath: `${nodePath}.${landmark.id}`,
    });
  }

  // --- and the plan's, for the axes nobody asked for -----------------------
  let ordinal = 0;
  for (const axis of axes) {
    if (taken.has(axis.id)) continue;
    let placed = false;
    // Walk the whole rotation before giving up: an axis whose reserve is too
    // shallow for a cathedral may still take a courthouse, and a vista closed
    // by a small building is a vista.
    for (let attempt = 0; attempt < 5 && !placed; attempt++) {
      const choice = terminatingLandmark(seed, ordinal + attempt);
      const id = uniqueId(usedIds, `vista_${choice.archetype}`);
      const rect = seat(
        axis,
        id,
        choice.size,
        VISTA_PORTS,
        { archetype: choice.archetype, floors: choice.floors },
        ["landmark", "vista", choice.archetype],
        `c4:${axis.id}`,
      );
      if (rect === null) {
        usedIds.delete(id);
        continue;
      }
      placed = true;
      ordinal++;
      taken.add(axis.id);
      reserved.push(rect);
      (axis as { closedBy?: string }).closedBy = `${nodePath}.${id}`;
      pieces.push({
        id: `${axis.id}_landmark`,
        kind: "landmark",
        site: rect,
        detail: `${article(choice.archetype)} ${choice.archetype} closes the ${axis.arterialKind} "${axis.arterialId}", framed for ${axis.run} columns of approach`,
        axisId: axis.id,
        facing: axis.facing,
        nodePath: `${nodePath}.${id}`,
        archetype: choice.archetype,
      });
    }
  }

  return { nodes, placements, ports, padEdits, params, pieces, vistas: axes, reserved, unclaimed };
}

/** The unrotated footprint a city landmark asks for. */
function landmarkSize(node: StructureNode): readonly [number, number, number] {
  const declared = node.envelope?.size;
  if (declared !== undefined && declared.length === 3) {
    return declared as readonly [number, number, number];
  }
  const floors = typeof (node.params ?? {})["floors"] === "number"
    ? ((node.params ?? {})["floors"] as number)
    : 2;
  return [11, Math.max(4, Math.round(floors * 4)), 11];
}

/** A node id nothing else in this city has taken, reserving it as it goes. */
function uniqueId(used: Set<string>, base: string): string {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}_${n++}`;
  used.add(id);
  return id;
}

/** "a" or "an", for a report line a human reads. */
function article(word: string): string {
  return "aeiou".includes(word[0] ?? "") ? "an" : "a";
}

/** A rect grown by `margin` columns on every side. */
function grow(rect: Rect, margin: number): Rect {
  return {
    x0: rect.x0 - margin,
    z0: rect.z0 - margin,
    x1: rect.x1 + margin,
    z1: rect.z1 + margin,
  };
}

/**
 * A lot mask with the set pieces punched out of it.
 *
 * The only moment in the whole pipeline at which a district can be told "not
 * here". After this the cell subdivides, and the subdivision has no vocabulary
 * for ground that is spoken for — which is exactly why the reservation has to
 * be a hole in the mask rather than a veto somewhere downstream.
 */
function withoutReserved(mask: Uint8Array, bounds: Rect, reserved: readonly Rect[]): Uint8Array {
  if (reserved.length === 0) return mask;
  const stride = bounds.x1 - bounds.x0 + 1;
  for (const rect of reserved) {
    const x0 = Math.max(bounds.x0, rect.x0);
    const x1 = Math.min(bounds.x1, rect.x1);
    const z0 = Math.max(bounds.z0, rect.z0);
    const z1 = Math.min(bounds.z1, rect.z1);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) mask[(z - bounds.z0) * stride + (x - bounds.x0)] = 0;
    }
  }
  return mask;
}

/* -------------------------------------------------------------------------- */
/* the character → fabric table                                                */
/* -------------------------------------------------------------------------- */

/** Which skeleton a character's cell is drawn with. */
const CELL_FABRIC: Readonly<Record<DistrictCell["character"], "grid" | "organic">> = Object.freeze({
  core: "grid",
  grid: "grid",
  rowhouse: "grid",
  // A lane quarter and a promenade are the two that predate the surveyor.
  lanes: "organic",
  industrial: "grid",
  civic: "grid",
  park: "organic",
  waterfront: "organic",
});

/** Which cells a landmark is offered first: the ones that carry the skyline. */
const LANDMARK_RANK: Readonly<Record<DistrictCell["character"], number>> = Object.freeze({
  core: 0,
  civic: 1,
  waterfront: 2,
  grid: 3,
  rowhouse: 4,
  industrial: 5,
  lanes: 6,
  park: 7,
});

/** The archetypes one character builds from: its own list, or the city's. */
function mixFor(node: CityNode, character: DistrictCell["character"]): readonly string[] {
  const named = node.params.characters?.[character];
  return named !== undefined && named.length > 0 ? named : node.params.mix;
}

/** A cell only gets a fabric if it is a built quarter with room for a grid. */
function hasFabric(cell: DistrictCell): boolean {
  if (cell.character === "park") return false;
  const width = cell.bounds.x1 - cell.bounds.x0 + 1;
  const depth = cell.bounds.z1 - cell.bounds.z0 + 1;
  return width >= MIN_DISTRICT_SPAN && depth >= MIN_DISTRICT_SPAN;
}

/* -------------------------------------------------------------------------- */
/* precinct seating                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The largest axis-aligned rectangle entirely inside a cell's mask.
 *
 * The standard maximal-rectangle-under-a-histogram sweep, O(area), with ties
 * broken by the earlier row and the earlier column so it is stable.
 */
function largestRect(b: Rect, mask: Uint8Array): Rect | null {
  const width = b.x1 - b.x0 + 1;
  const depth = b.z1 - b.z0 + 1;
  const heights = new Int32Array(width);
  let best: Rect | null = null;
  let bestArea = 0;

  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      heights[i] = mask[j * width + i] === 1 ? (heights[i] as number) + 1 : 0;
    }
    const stack: number[] = [];
    for (let i = 0; i <= width; i++) {
      const h = i === width ? 0 : (heights[i] as number);
      while (stack.length > 0 && (heights[stack[stack.length - 1] as number] as number) >= h) {
        const top = stack.pop() as number;
        const height = heights[top] as number;
        const left = stack.length === 0 ? 0 : (stack[stack.length - 1] as number) + 1;
        const area = height * (i - left);
        if (height > 0 && area > bestArea) {
          bestArea = area;
          best = {
            x0: b.x0 + left,
            z0: b.z0 + j - height + 1,
            x1: b.x0 + i - 1,
            z1: b.z0 + j,
          };
        }
      }
      stack.push(i);
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* masks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A cell's mask as maximal horizontal runs — one flat rectangle per run.
 *
 * The only way to level an arbitrary polygon with an API that takes rectangles.
 * Every run is one row tall and carries no apron, so adjacent runs cannot blend
 * against each other and the union is exactly the mask at exactly one height.
 */
function maskRuns(b: Rect, mask: Uint8Array): Rect[] {
  const stride = b.x1 - b.x0 + 1;
  const out: Rect[] = [];
  for (let z = b.z0; z <= b.z1; z++) {
    let start = -1;
    for (let x = b.x0; x <= b.x1 + 1; x++) {
      const inside = x <= b.x1 && mask[(z - b.z0) * stride + (x - b.x0)] === 1;
      if (inside && start < 0) start = x;
      if (!inside && start >= 0) {
        out.push({ x0: start, z0: z, x1: x - 1, z1: z });
        start = -1;
      }
    }
  }
  return out;
}

/**
 * The median ground height over a cell's *mask*, not its bounding box.
 *
 * The distinction matters on the waterfront, where a cell's box takes in a
 * corner of the bay: a bounding-box median of a shoreline quarter is dragged
 * down by the sea bed and the whole terrace ends up below the tideline.
 */
function maskMedian(field: { region: { x0: number; z0: number; width: number; depth: number }; values: Float64Array }, cell: DistrictCell): number {
  const b = cell.bounds;
  const stride = b.x1 - b.x0 + 1;
  const region = field.region;
  const heights: number[] = [];
  for (let z = b.z0; z <= b.z1; z++) {
    for (let x = b.x0; x <= b.x1; x++) {
      if (cell.mask[(z - b.z0) * stride + (x - b.x0)] !== 1) continue;
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
      heights.push(field.values[j * region.width + i] as number);
    }
  }
  if (heights.length === 0) return 0;
  heights.sort((a, b2) => a - b2);
  return Math.round(heights[heights.length >> 1] as number);
}

/**
 * Pull a mask back by `rings` columns.
 *
 * The cell's outline is the arterial's kerb. Streets are clipped to the outline
 * so they reach it; lots are held inside this erosion so a facade always has a
 * verge between it and eleven columns of tarmac.
 */
export function erode(mask: Uint8Array, width: number, depth: number, rings: number): Uint8Array {
  if (rings <= 0) return Uint8Array.from(mask);
  let current = Uint8Array.from(mask);
  for (let ring = 0; ring < rings; ring++) {
    const next = new Uint8Array(current.length);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        const k = j * width + i;
        if (current[k] !== 1) continue;
        let keep = true;
        for (let dj = -1; dj <= 1 && keep; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= width || jj >= depth || current[jj * width + ii] !== 1) {
              keep = false;
              break;
            }
          }
        }
        if (keep) next[k] = 1;
      }
    }
    current = next;
  }
  return current;
}

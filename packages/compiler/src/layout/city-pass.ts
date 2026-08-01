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
  error,
  isCityNode,
  isPrecinctGenerator,
  note,
  warning,
  type CityNode,
  type DistrictNode,
  type LoamDiagnostic,
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
  type DistrictPassInput,
  type DistrictProduct,
} from "./district.js";
import type { Rect } from "./frames.js";
import { MIN_DISTRICT_SPAN, SIDEWALK_BY_DENSITY } from "./streets.js";
import type { LayoutNodeInput, PadEdit, Placement, ResolvedPort } from "./types.js";

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

  // --- what the author put in the city -------------------------------------
  const landmarks: StructureNode[] = [];
  const precincts: StructureNode[] = [];
  for (const child of node.children ?? []) {
    const structure = child as StructureNode;
    if (isPrecinctGenerator(structure.generator)) precincts.push(structure);
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
      const fits = ranked.filter(({ cell }) => cell.blockSize - LANDMARK_BLOCK_OVERHEAD >= need);
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
      lotMask: erode(cell.mask, width, depth, sidewalk),
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
    },
  };
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

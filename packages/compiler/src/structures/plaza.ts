/**
 * The plaza — paving the village green.
 *
 * The layout solver treats the plaza as a placed primitive: it reserves the
 * rectangle, flattens the ground under it, and gives the road network a hub to
 * route to. What it never did was *build* anything, so the first village compile
 * put its lanes, its hall and its inn around a 22×22 patch of ordinary grass.
 * Every road arrived at nothing.
 *
 * This pass surfaces it. Three parts, all deterministic and all modest — a
 * village green is not a cathedral square:
 *
 * 1. a **border ring** of stone brick, one block wide, which is what makes the
 *    space read as deliberate rather than as a gap between buildings;
 * 2. a **paved field** inside it: a position-keyed mix of dirt path, gravel and
 *    cobblestone, weighted so path dominates and the other two break it up;
 * 3. a **well** at the centre and two or three **stair benches** near the
 *    border, facing in.
 *
 * Like the road pass, paving mutates the column plan rather than emitting blocks
 * over the top of it: the plaza is a change to the ground, and writing it into
 * `surface` keeps the heightmap, the biome pass and the fluid validator all
 * looking at the same world.
 *
 * ## The well, and why its water is stable by construction
 *
 * The well is 3×3. Its eight perimeter columns keep the plaza's ground level and
 * carry a cobblestone-wall ring with stone-brick corner posts; the centre column
 * is dug one block down and filled to the plaza's level, giving exactly one
 * block of water. That water's four horizontal neighbours are all perimeter
 * columns whose solid ground stands at the water's own surface level, so
 * {@link checkFluidStability}'s "the lowest neighbouring surface" is never below
 * it and the block cannot flow. The pass does not *hope* the validator passes —
 * the geometry is the proof.
 */

import { fbm2 } from "@terrainist/stdlib";
import { warning, type LoamDiagnostic } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";
import type { Rect } from "../layout/frames.js";
import type { OccupancyGrid, Placement } from "../layout/types.js";
import type { GroundClaim, GroundView } from "../layout/ground-contract.js";
import { driverForPlan, type GroundDriver } from "../layout/ground-driver.js";
import { FluidKind, type ColumnPlan } from "../terrain/columns.js";
import { hash2, hashInt } from "../terrain/detail.js";
import type { Palette } from "../terrain/palette.js";

import type { StructureBlock } from "./buildings.js";

/** Smallest plaza this pass will pave; below it there is no room for a border. */
export const MIN_PLAZA_SIZE = 7;

/** Half-width of the well: the well is `2 · WELL_RADIUS + 1` square. */
export const WELL_RADIUS = 1;

/** Benches placed around the border, when the plaza is big enough to hold them. */
export const MAX_BENCHES = 3;

/** Everything {@link pavePlaza} reads. */
export interface PlazaInput {
  readonly nodePath: string;
  readonly placement: Placement;
  /** Mutated: the paving's surface, and the well's rim. */
  readonly plan: ColumnPlan;
  /**
   * The ground contract's driver (`docs/GROUND-CONTRACT-v0.md` §9a).
   *
   * The plaza's own level is the solver's pad and this pass never moved it; what
   * goes through `commit` is the claim on it — `plaza.ground`, which is
   * inversion I7: the `paved` mask's level behaviour becomes a rank — and the
   * well's dig. Omitted only by callers that are not the pipeline, which then
   * get a driver of their own over the plan as it stands (`driverForPlan`).
   */
  readonly ground?: GroundDriver;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  /** Detail seed for the paving mix and the bench positions. */
  readonly seed: number;
  /** Claims the plaza under the `plaza` and `structure` tags. */
  readonly occupancy?: OccupancyGrid;
}

/** What the plaza pass produced. */
export interface PlazaResult {
  readonly blocks: readonly StructureBlock[];
  /** 1 on every column this pass surfaced — the road pass grades to it, not over it. */
  readonly paved: Uint8Array;
  /** 1 on the well's 3×3, which no route may cross. */
  readonly keepClear: Uint8Array;
  /** Columns whose surface this pass rewrote. */
  readonly pavedColumns: number;
  readonly benches: number;
  /** True when the well was built; false when the plaza was too small or wet. */
  readonly well: boolean;
  readonly diagnostics: readonly LoamDiagnostic[];
  /**
   * What this pass declared under the ground contract
   * (`docs/GROUND-CONTRACT-v0.md` §3.2b): the intents it handed to the driver,
   * kept as a return value for the report and the tests.
   */
  readonly declaration: PlazaDeclaration;
}

/** The raw material of §3.2b's two intents. */
export interface PlazaDeclaration {
  /** The paved rect at the pad's level — `plaza.ground`. */
  readonly paved: readonly GroundClaim[];
  /** The dug centre column and the eight it stands on — `plaza.well`. */
  readonly well?: {
    readonly centre: GroundClaim;
    readonly perimeter: readonly GroundClaim[];
  };
}

/** The block states the plaza pass writes. */
interface PlazaStates {
  readonly path: number;
  readonly gravel: number;
  readonly cobble: number;
  readonly border: number;
  readonly wall: number;
  readonly post: number;
  readonly lantern: number;
  readonly bench: Readonly<Record<"north" | "south" | "east" | "west", number>>;
}

function resolveStates(palette: Palette, stack: PrismarineStack): PlazaStates {
  const named = (name: string): number => stack.blockByName(name)?.stateId ?? 0;
  const symbol = (s: string, fallback: string): number =>
    palette.has(s) ? palette.state(s) : named(fallback);
  const stair = (facing: string): number =>
    stack.blockStateOf("minecraft:oak_stairs", { facing, half: "bottom", shape: "straight" }) ??
    named("minecraft:oak_stairs");
  return {
    path: symbol("plaza.path", "minecraft:dirt_path"),
    gravel: symbol("plaza.gravel", "minecraft:gravel"),
    cobble: symbol("plaza.cobble", "minecraft:cobblestone"),
    border: symbol("plaza.border", "minecraft:stone_bricks"),
    wall: symbol("plaza.well_wall", "minecraft:cobblestone_wall"),
    post: symbol("road.post", "minecraft:oak_fence"),
    lantern: symbol("road.lantern", "minecraft:lantern"),
    bench: {
      north: stair("north"),
      south: stair("south"),
      east: stair("east"),
      west: stair("west"),
    },
  };
}

/**
 * Pave one plaza.
 *
 * Runs before the road network and hands it two masks. `paved` says "this ground
 * is already surfaced": routes cross it freely and count it as road, but they
 * grade *to* it rather than onto the two-block fill band, so a lane arrives on
 * the green instead of running across it on an embankment. `keepClear` is the
 * well, which no route may enter at all.
 */
export function pavePlaza(input: PlazaInput): PlazaResult {
  const { plan, placement } = input;
  const { region } = plan;
  const rect = placement.footprint;
  const diagnostics: LoamDiagnostic[] = [];
  const blocks: StructureBlock[] = [];
  const paved = new Uint8Array(region.width * region.depth);
  const keepClear = new Uint8Array(region.width * region.depth);

  const sizeX = rect.x1 - rect.x0 + 1;
  const sizeZ = rect.z1 - rect.z0 + 1;
  if (sizeX < MIN_PLAZA_SIZE || sizeZ < MIN_PLAZA_SIZE) {
    diagnostics.push(
      warning(
        "STRUCTURE_PARAM",
        input.nodePath,
        `the plaza is ${sizeX}×${sizeZ}, too small to pave — a bordered square needs at least ${MIN_PLAZA_SIZE} blocks on each side`,
        `grow the plaza's "envelope.size" to at least [${MIN_PLAZA_SIZE}, ${MIN_PLAZA_SIZE}], or drop the node if the village wants no green`,
      ),
    );
    return {
      blocks,
      paved,
      keepClear,
      pavedColumns: 0,
      benches: 0,
      well: false,
      diagnostics,
      declaration: { paved: [] },
    };
  }

  const states = resolveStates(input.palette, input.stack);
  const driver = input.ground ?? driverForPlan(plan);
  const view = driver.view("B");
  const index = (x: number, z: number): number =>
    (z - region.z0) * region.width + (x - region.x0);
  const inside = (x: number, z: number): boolean =>
    x >= region.x0 &&
    z >= region.z0 &&
    x < region.x0 + region.width &&
    z < region.z0 + region.depth;

  // --- 1 + 2: the border ring and the paved field --------------------------
  let pavedCount = 0;
  /** §3.2b's `plaza.ground` claim, sampled at the pad's own level. */
  const declaredPaved: GroundClaim[] = [];
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      if (!inside(x, z)) continue;
      const idx = index(x, z);
      // Never pave over water: a plaza corner clipping a pond stays a pond.
      if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
      const edge = x === rect.x0 || x === rect.x1 || z === rect.z0 || z === rect.z1;
      plan.surface[idx] = edge ? states.border : fieldState(states, input.seed, x, z);
      // The snow clear is the driver's now (§9 step 10): `commit` clears it on
      // every column this claim wins, which is bit-for-bit the line that was
      // here.
      if (plan.soil[idx] === 0) plan.soil[idx] = 1;
      pavedCount++;
      declaredPaved.push({ idx, y: view.ground[idx] as number });
      paved[idx] = 1;
      if (input.occupancy !== undefined) claim(input.occupancy, idx);
    }
  }

  // --- 3a: the well --------------------------------------------------------
  const cx = Math.floor((rect.x0 + rect.x1) / 2);
  const cz = Math.floor((rect.z0 + rect.z1) / 2);
  // §3.2b's `plaza.ground`, committed before the well is dug: the well's
  // 3×3 flatness test then reads the answer, exactly as it used to read the
  // paving's untouched ground. The centre column is dropped from the claim
  // because `plaza.ground` (30) outranks `plaza.well` (40) and would otherwise
  // fill the well in — the pass does not own that column when it is finished.
  const site = wellSite(view, cx, cz, index, inside);
  if (declaredPaved.length > 0) {
    const columns =
      site === undefined ? declaredPaved : declaredPaved.filter((c) => c.idx !== site.centre);
    if (columns.length > 0) {
      driver.commit([
        {
          source: input.nodePath,
          sourceClass: "plaza.ground",
          kind: "platform",
          columns,
          transition: "ramp",
        },
      ]);
    }
  }
  const wellClaim =
    site === undefined
      ? undefined
      : buildWell(input, states, site, blocks, index, driver, `${input.nodePath}#well`);
  const well = wellClaim !== undefined;
  if (well) {
    for (let z = cz - WELL_RADIUS; z <= cz + WELL_RADIUS; z++) {
      for (let x = cx - WELL_RADIUS; x <= cx + WELL_RADIUS; x++) {
        if (inside(x, z)) keepClear[index(x, z)] = 1;
      }
    }
  }

  // --- 3b: the benches -----------------------------------------------------
  const benches = placeBenches(input, states, rect, blocks, index, inside);

  return {
    blocks,
    paved,
    keepClear,
    pavedColumns: pavedCount,
    benches,
    well,
    diagnostics,
    declaration: {
      paved: declaredPaved,
      ...(wellClaim === undefined ? {} : { well: wellClaim }),
    },
  };
}

/* -------------------------------------------------------------------------- */

/**
 * The paving mix at one column.
 *
 * Weighted toward dirt path, with gravel and cobble breaking it up — but *in
 * patches*, not per block. A flat 6 : 3 : 2 per-column roll turns the square
 * into confetti; a low-frequency noise field decides which parts of the plaza
 * are worn to gravel or laid in cobble, and the per-column hash only softens
 * those boundaries. Both terms are position-keyed, so the result is stable under
 * any traversal order.
 */
function fieldState(states: PlazaStates, seed: number, x: number, z: number): number {
  const patch = fbm2(seed, x, z, { octaves: 2, frequency: 0.09, lacunarity: 2, gain: 0.5 });
  const r = hash2(seed, x, z, 1);
  // `patch` runs roughly −1..1; shift it into a bias and let the hash blur the
  // edge by a couple of blocks so no patch has a drawn outline.
  const wear = patch + 0.35 * (r - 0.5);
  if (wear > 0.34) return states.cobble;
  if (wear > 0.1) return states.gravel;
  return states.path;
}

/** Where a well may stand: the flat, dry 3×3 the construction assumes. */
export interface WellSite {
  readonly cx: number;
  readonly cz: number;
  readonly centre: number;
  /** The one level all nine columns stand at — the water's own surface. */
  readonly groundY: number;
}

/**
 * The 3×3 test, taken **before** anything is committed.
 *
 * The whole square must be in-region, dry and level: the stability argument
 * depends on the eight perimeter columns standing at exactly the water level.
 * Split out of {@link buildWell} because the paving's claim has to know whether
 * a well will be dug before it declares — `plaza.ground` (30) outranks
 * `plaza.well` (40), so a paving claim that kept the centre column would win it
 * and fill the well in.
 *
 * Pure: reads the view (§9a.4) and writes nothing.
 */
export function wellSite(
  view: GroundView,
  cx: number,
  cz: number,
  index: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): WellSite | undefined {
  const r = WELL_RADIUS;
  let level: number | null = null;
  for (let z = cz - r; z <= cz + r; z++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inside(x, z)) return undefined;
      const idx = index(x, z);
      if (view.fluidKind[idx] !== FluidKind.NONE) return undefined;
      const y = view.ground[idx] as number;
      if (level === null) level = y;
      else if (y !== level) return undefined;
    }
  }
  if (level === null) return undefined;
  return { cx, cz, centre: index(cx, cz), groundY: level };
}

/**
 * The centrepiece well: a cobblestone-wall ring on stone-brick corners around
 * one block of enclosed water, with fence-and-lantern posts on two corners.
 *
 * §3.2b's two claims go to the driver first — the dug centre carrying its water,
 * and a `preserve` over the eight perimeter columns whose standing still *is*
 * the stability proof, which is the cleanest use of the kind in the codebase —
 * and the masonry follows. `plaza.well` is rank 40, so nothing below it can fill
 * the hole back in and nothing at all can drop a column the proof stands on.
 */
function buildWell(
  input: PlazaInput,
  states: PlazaStates,
  site: WellSite,
  blocks: StructureBlock[],
  index: (x: number, z: number) => number,
  driver: GroundDriver,
  source: string,
): PlazaDeclaration["well"] {
  const { plan } = input;
  const r = WELL_RADIUS;
  const { cx, cz, centre, groundY } = site;

  /** §3.2b's `preserve`: the eight columns the stability proof stands on. */
  const perimeter: GroundClaim[] = [];
  for (let z = cz - r; z <= cz + r; z++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x === cx && z === cz) continue;
      perimeter.push({ idx: index(x, z), y: groundY });
    }
  }
  // Dig one block and fill it. The water's surface is the plaza's ground level,
  // and every horizontal neighbour is solid *to* that level — so the one-tick
  // spread simulation finds no exposed face. See this module's header.
  const dug: GroundClaim = {
    idx: centre,
    y: groundY - 1,
    fluid: { kind: FluidKind.WATER, top: groundY },
  };
  driver.commit([
    {
      source,
      sourceClass: "plaza.well",
      kind: "platform",
      columns: [dug],
      transition: "step",
    },
    {
      source,
      sourceClass: "plaza.well",
      kind: "preserve",
      columns: perimeter,
      transition: "none",
    },
  ]);
  plan.surface[centre] = states.cobble;

  // The ring, one block above the plaza surface: stone brick on the corners,
  // cobblestone wall along the sides.
  for (let z = cz - r; z <= cz + r; z++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x === cx && z === cz) continue;
      const corner = x !== cx && z !== cz;
      blocks.push({ x, y: groundY + 1, z, stateId: corner ? states.border : states.wall });
      // The rim itself is stone brick underfoot, not paving.
      plan.surface[index(x, z)] = states.border;
    }
  }

  // Two diagonal corners carry a fence post and a lantern: a lit well is what
  // makes the square legible at night, and two posts is enough to say so.
  for (const [dx, dz] of [
    [-r, -r],
    [r, r],
  ] as const) {
    blocks.push({ x: cx + dx, y: groundY + 2, z: cz + dz, stateId: states.post });
    blocks.push({ x: cx + dx, y: groundY + 3, z: cz + dz, stateId: states.post });
    blocks.push({ x: cx + dx, y: groundY + 4, z: cz + dz, stateId: states.lantern });
  }

  return { centre: dug, perimeter };
}

/**
 * Two or three stair benches set just inside the border, each facing the middle
 * of the square.
 *
 * A stair's `facing` names the direction its *back* is toward, so a bench on the
 * north edge that seats someone looking south faces north.
 */
function placeBenches(
  input: PlazaInput,
  states: PlazaStates,
  rect: Rect,
  blocks: StructureBlock[],
  index: (x: number, z: number) => number,
  inside: (x: number, z: number) => boolean,
): number {
  const { plan, seed } = input;
  const cx = Math.floor((rect.x0 + rect.x1) / 2);
  const cz = Math.floor((rect.z0 + rect.z1) / 2);

  // Candidate seats, one per edge, offset two blocks in from the border so a
  // bench never sits on the ring itself. Fixed order; the count is seeded.
  const candidates: { x: number; z: number; facing: "north" | "south" | "east" | "west" }[] = [
    { x: cx, z: rect.z0 + 2, facing: "north" },
    { x: rect.x1 - 2, z: cz, facing: "east" },
    { x: cx, z: rect.z1 - 2, facing: "south" },
    { x: rect.x0 + 2, z: cz, facing: "west" },
  ];

  const wanted = hashInt(seed, rect.x0, rect.z0, 2, 2, MAX_BENCHES);
  let placed = 0;
  for (const seat of candidates) {
    if (placed >= wanted) break;
    // Offset along the edge so the four benches are not all on the centre line.
    const along = hashInt(seed, seat.x, seat.z, 3, -2, 2);
    const x = seat.facing === "north" || seat.facing === "south" ? seat.x + along : seat.x;
    const z = seat.facing === "east" || seat.facing === "west" ? seat.z + along : seat.z;
    if (!inside(x, z)) continue;
    const idx = index(x, z);
    if (plan.fluidKind[idx] !== FluidKind.NONE) continue;
    blocks.push({
      x,
      y: (plan.ground[idx] as number) + 1,
      z,
      stateId: states.bench[seat.facing],
    });
    placed++;
  }
  return placed;
}

/** Claim one plaza column in the occupancy grid, under `plaza` and the union. */
function claim(occupancy: OccupancyGrid, idx: number): void {
  occupancy.mask[idx] = 1;
  const tags = occupancy.byTag as Map<string, Uint8Array>;
  let tag = tags.get("plaza");
  if (tag === undefined) {
    tag = new Uint8Array(occupancy.mask.length);
    tags.set("plaza", tag);
  }
  tag[idx] = 1;
}

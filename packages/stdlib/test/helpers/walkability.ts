/**
 * The shared pocket detector: the physics lint's ground-floor walk, run at the
 * stdlib op-list level.
 *
 * ## Why this file exists
 *
 * Every wave of archetypes so far grew its own `freeCells`/`oneRegion` harness
 * inside its own test file, and every one of those harnesses modelled the same
 * two things: "is there a block standing in this cell" and "is the set of empty
 * cells 4-connected". That is *not* what
 * `packages/compiler/src/emit/physics.ts` checks. The lint walks a 1x2 body
 * from the cell inside the front door, and it is the difference between those
 * two models that cost this session three full debug cycles — the school, the
 * bathhouse and the hall divider each passed their wave test and then failed
 * `traversal.unreachable` hours later, in the terrarium, because:
 *
 * - a **hanging lantern at head height** blocks a cell whose floor is empty
 *   (`freeCells` never looked at `y = 2`);
 * - a **slab or a stair** is not "empty" and not "wall" — it is a mount, and
 *   only from the sides the lint's `halfStepFrom` allows;
 * - **connectivity is not reachability**: the start is the door cell, so a
 *   region connected to itself but not to the door is still a pocket.
 *
 * ## What this replicates
 *
 * Faithfully, function for function, from `physics.ts`:
 * `BODY_BLOCKING` / `STANDABLE_PARTIAL` / `SOLID_TOP`, `passableAt`,
 * `supportAt`, `halfStepFrom` (including the perpendicular stair-mount rule),
 * `standable`, the ladder climb, the ≤3 drop, and the door-cell start.
 *
 * ## What it deliberately omits
 *
 * - **The block table.** The compiler asks `stack.isFullCube(id)`; there is no
 *   block table in stdlib, so full-cubeness is decided by
 *   {@link PASSABLE_NON_CUBE}: anything not recognised as a decoration is
 *   treated as a full cube. That errs the way the lint errs — toward calling
 *   things blocking — so this helper may report a pocket the lint forgives, but
 *   should not miss one the lint finds.
 * - **World context.** No terrain, no neighbouring buildings, no cellar or
 *   upper-storey walk (pass `level` to walk another storey; the default is the
 *   ground floor, which is where the failures were).
 * - **The other lint rules.** Support closure, fluids, roof margins and the
 *   `interior.blocked_column` rule are not modelled here.
 */

/* -------------------------------------------------------------------------- */
/* the block vocabulary (mirrors physics.ts)                                   */
/* -------------------------------------------------------------------------- */

/** Blocks a 1x2 player body cannot stand inside. Copied from `physics.ts`. */
const BODY_BLOCKING =
  /(_slab|_stairs|_fence|_wall|_bed|_pane|iron_bars|_gate|chest|barrel|furnace|smithing_table|crafting_table|fletching_table|cartography_table|loom|anvil|cauldron|composter|bookshelf|lectern|campfire|_shulker_box|hopper|beacon|conduit|lantern|bell|grindstone|stonecutter|brewing_stand|enchanting_table|_cake|dragon_egg)$/;

/** Blocks a foot may rest on even though they are not full cubes. */
const STANDABLE_PARTIAL = /(_slab|_stairs)$/;

/** Not full cubes, but with a solid flush top. */
const SOLID_TOP = /^(dirt_path|farmland)$/;

const AIR = new Set(["air", "cave_air", "void_air"]);

/**
 * Blocks that are not full cubes, standing in for the compiler's block table.
 *
 * Everything a building's fit-out places that a body passes through. Anything
 * *not* matched here and not matched by {@link BODY_BLOCKING} is treated as a
 * full cube — the conservative answer, and the one `physics.ts` documents as
 * the direction to be wrong in.
 */
const PASSABLE_NON_CUBE =
  /(^(torch|ladder|vine|chain|lever|tripwire|tripwire_hook|cobweb|snow|lily_pad|flower_pot|scaffolding|end_rod|lightning_rod|rail|powered_rail|detector_rail|activator_rail|water|lava|kelp|seagrass|sugar_cane|bamboo|fire|soul_fire|redstone_wire|comparator|repeater|tripwire)$)|(^potted_)|(_torch|_door|_trapdoor|_sign|_banner|_carpet|_button|_pressure_plate|_sapling|_head|_skull|_rail|_candle|_sprout|_roots|_fan|_bush|_grass|_fern|_tulip|_orchid|_daisy|_lily|_poppy|_dandelion|_amethyst_bud|_cluster|_plate)$/;

/**
 * Can a player's body occupy a cell holding this block?
 *
 * The physics lint's `passableAt`, by name alone, for tests that build their
 * own free-cell sets: air and decorations pass, `BODY_BLOCKING` refuses, and
 * anything unrecognised is treated as a full cube — the safe direction.
 */
export function passableBlock(block: string | undefined): boolean {
  if (block === undefined || AIR.has(block)) return true;
  if (block.endsWith("wall_torch")) return true;
  if (BODY_BLOCKING.test(block)) return false;
  return PASSABLE_NON_CUBE.test(block);
}

/* -------------------------------------------------------------------------- */
/* inputs                                                                      */
/* -------------------------------------------------------------------------- */

/** The op shape this helper reads — structurally `LocalVoxelOp`. */
export interface WalkOp {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly block: string;
  readonly props?: Readonly<Record<string, string>>;
}

/** The slice of a `generateBuilding` result the walk needs. */
export interface WalkInput {
  readonly ops: readonly WalkOp[];
  readonly meta: {
    readonly floorCells: readonly { readonly x: number; readonly z: number }[];
    readonly floorLevels?: readonly number[];
    readonly door?: { readonly x: number; readonly z: number } | null;
  };
}

export interface WalkabilityOptions {
  /**
   * The storey's floor plane, in the sense of `meta.floorLevels`. Feet stand at
   * `level + 1`. Defaults to `0`, the ground floor.
   */
  readonly level?: number;
  /** Cells to leave out of the report, e.g. the lantern column. */
  readonly exclude?: readonly (readonly [number, number])[];
  /** An explicit start, when the fixture has no door. */
  readonly start?: { readonly x: number; readonly z: number };
  /**
   * The storey the walk *begins* on, when it is not the storey being checked.
   *
   * The doors are on the ground floor, so asking "can a player reach the third
   * storey" means starting there and climbing — which is exactly what the
   * physics lint does: one flood from the door cells, then every storey's own
   * floor cells checked against it. Defaults to {@link WalkabilityOptions.level}
   * so a single-storey check is unchanged.
   */
  readonly startLevel?: number;
}

/** How the walk classified one floor cell. */
export type CellState =
  /** A player can stand here and the walk got here. */
  | "reachable"
  /** No player fits here: furniture, a wall, or a lantern at head height. */
  | "blocked"
  /** A player fits here and the walk never arrived: the defect. */
  | "pocket";

export interface WalkabilityReport {
  /** The door cell the walk started from, or `null` when none was found. */
  readonly start: { readonly x: number; readonly y: number; readonly z: number } | null;
  /** Y the feet of this storey stand at. */
  readonly feetY: number;
  readonly cells: readonly {
    readonly x: number;
    readonly z: number;
    readonly state: CellState;
  }[];
  readonly reachable: readonly string[];
  readonly blocked: readonly string[];
  readonly pocket: readonly string[];
  /** True when there is a start and no pocket. */
  readonly ok: boolean;
  /** A printable ASCII plan of the storey. */
  readonly map: string;
}

/* -------------------------------------------------------------------------- */
/* the walk                                                                    */
/* -------------------------------------------------------------------------- */

const STEP: Readonly<Record<string, readonly [number, number]>> = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * The physics lint's ground-floor walk, over a structure generator's op list.
 *
 * Later ops win, exactly as the emit pass writes them.
 */
export function walkabilityReport(
  result: WalkInput,
  opts: WalkabilityOptions = {},
): WalkabilityReport {
  const at = new Map<string, WalkOp>();
  for (const op of result.ops) at.set(`${op.x},${op.y},${op.z}`, op);
  const nameAt = (x: number, y: number, z: number): string | undefined =>
    at.get(`${x},${y},${z}`)?.block;

  const passableAt = (x: number, y: number, z: number): boolean => {
    const name = nameAt(x, y, z);
    if (name === undefined || AIR.has(name)) return true;
    if (name.endsWith("wall_torch")) return true;
    if (BODY_BLOCKING.test(name)) return false;
    return PASSABLE_NON_CUBE.test(name);
  };

  const supportAt = (x: number, y: number, z: number): boolean => {
    const name = nameAt(x, y, z);
    if (name === undefined || AIR.has(name)) return false;
    if (STANDABLE_PARTIAL.test(name) || SOLID_TOP.test(name)) return true;
    return !PASSABLE_NON_CUBE.test(name);
  };

  const halfStepFrom = (x: number, y: number, z: number, dx: number, dz: number): boolean => {
    const op = at.get(`${x},${y},${z}`);
    if (op === undefined) return false;
    const props = op.props ?? {};
    if (op.block.endsWith("_slab")) return props["type"] === "bottom";
    if (!op.block.endsWith("_stairs")) return false;
    if ((props["half"] ?? "bottom") !== "bottom") return false;
    const [fx, fz] = STEP[props["facing"] ?? "north"] ?? ([0, -1] as const);
    if (dx === fx && dz === fz) return true;
    if (dx * fx + dz * fz !== 0) return false;
    return passableAt(x - fx, y + 1, z - fz);
  };

  const standable = (x: number, y: number, z: number): boolean =>
    supportAt(x, y - 1, z) && passableAt(x, y, z) && passableAt(x, y + 1, z);

  const isLadder = (x: number, y: number, z: number): boolean => nameAt(x, y, z) === "ladder";

  const level = opts.level ?? 0;
  const feetY = level + 1;
  const startFeetY = (opts.startLevel ?? level) + 1;

  const excluded = new Set((opts.exclude ?? []).map(([x, z]) => `${x},${z}`));
  const floor = result.meta.floorCells.filter((c) => !excluded.has(`${c.x},${c.z}`));
  const inRoom = new Set(floor.map((c) => `${c.x},${c.z}`));

  // --- the starts: the interior cells beside the lower half of every door ---
  //
  // Every door, not the first one found — which mirrors the change
  // `physics.ts` made for the same reason. A terrace is one building with a
  // door per bay and a party wall between each pair of them, so no single door
  // reaches the whole of it, and "reachable from *a* street door" is the
  // property a building with more than one way in actually has. For a building
  // with one door this is the same single start and the same flood.
  const starts: { x: number; y: number; z: number }[] = [];
  const seenStart = new Set<string>();
  if (opts.start !== undefined) {
    starts.push({ x: opts.start.x, y: startFeetY, z: opts.start.z });
  } else {
    for (const op of result.ops) {
      if (op.y !== startFeetY) continue;
      if (!op.block.endsWith("_door")) continue;
      if ((op.props?.["half"] ?? "lower") !== "lower") continue;
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = op.x + dx;
        const nz = op.z + dz;
        if (!inRoom.has(`${nx},${nz}`)) continue;
        if (!standable(nx, startFeetY, nz)) continue;
        const key = `${nx},${nz}`;
        if (!seenStart.has(key)) {
          seenStart.add(key);
          starts.push({ x: nx, y: startFeetY, z: nz });
        }
        break;
      }
    }
    // Fall back to the recorded door column when the door block is a plain
    // gap (an archway archetype): the cell inside it is still the way in.
    if (starts.length === 0 && result.meta.door != null) {
      const d = result.meta.door;
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = d.x + dx;
        const nz = d.z + dz;
        if (inRoom.has(`${nx},${nz}`) && standable(nx, startFeetY, nz)) {
          starts.push({ x: nx, y: startFeetY, z: nz });
          break;
        }
      }
    }
  }
  const start: { x: number; y: number; z: number } | null = starts[0] ?? null;

  // --- flood ---------------------------------------------------------------
  const seen = new Set<string>();
  if (start !== null) {
    for (const s of starts) seen.add(`${s.x},${s.y},${s.z}`);
    const queue: { x: number; y: number; z: number }[] = [...starts];
    const visit = (x: number, y: number, z: number): void => {
      const key = `${x},${y},${z}`;
      if (seen.has(key)) return;
      seen.add(key);
      queue.push({ x, y, z });
    };
    for (let head = 0; head < queue.length; head++) {
      const { x, y, z } = queue[head] as { x: number; y: number; z: number };
      if (isLadder(x, y, z)) {
        if (passableAt(x, y + 1, z) && passableAt(x, y + 2, z) && isLadder(x, y + 1, z)) {
          visit(x, y + 1, z);
        }
        if (isLadder(x, y - 1, z) || standable(x, y - 1, z)) visit(x, y - 1, z);
      }
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = x + dx;
        const nz = z + dz;
        if (
          halfStepFrom(nx, y, nz, dx, dz) &&
          passableAt(x, y + 2, z) &&
          passableAt(nx, y + 1, nz) &&
          passableAt(nx, y + 2, nz)
        ) {
          visit(nx, y + 1, nz);
        }
        for (let ny = y; ny >= y - 3; ny--) {
          if (!passableAt(nx, ny, nz) || !passableAt(nx, ny + 1, nz)) break;
          if (supportAt(nx, ny - 1, nz)) {
            visit(nx, ny, nz);
            break;
          }
          if (isLadder(nx, ny, nz)) {
            visit(nx, ny, nz);
            break;
          }
        }
      }
    }
  }

  // --- classify ------------------------------------------------------------
  const cells = floor.map((c) => {
    let state: CellState;
    if (!standable(c.x, feetY, c.z)) state = "blocked";
    else if (seen.has(`${c.x},${feetY},${c.z}`)) state = "reachable";
    else state = "pocket";
    return { x: c.x, z: c.z, state };
  });

  const pick = (s: CellState): string[] =>
    cells.filter((c) => c.state === s).map((c) => `${c.x},${c.z}`);

  return {
    start,
    feetY,
    cells,
    reachable: pick("reachable"),
    blocked: pick("blocked"),
    pocket: pick("pocket"),
    ok: start !== null && cells.every((c) => c.state !== "pocket"),
    map: renderMap(cells, start),
  };
}

/**
 * An ASCII plan of the storey, so the next agent debugs from test output
 * instead of building a terrarium.
 *
 * `S` start, `.` reachable, `#` blocked, `!` pocket, ` ` outside the room.
 */
function renderMap(
  cells: readonly { x: number; z: number; state: CellState }[],
  start: { x: number; y: number; z: number } | null,
): string {
  if (cells.length === 0) return "(no floor cells)";
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.z);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  const glyph = new Map(
    cells.map((c) => [
      `${c.x},${c.z}`,
      c.state === "reachable" ? "." : c.state === "blocked" ? "#" : "!",
    ]),
  );
  if (start !== null) glyph.set(`${start.x},${start.z}`, "S");
  const rows: string[] = [];
  for (let z = z0; z <= z1; z++) {
    let row = "";
    for (let x = x0; x <= x1; x++) row += glyph.get(`${x},${z}`) ?? " ";
    rows.push(`z=${String(z).padStart(3)} |${row}|`);
  }
  return [
    `x ${x0}..${x1}, z ${z0}..${z1}   S=start . reachable # blocked ! POCKET`,
    ...rows,
  ].join("\n");
}

/**
 * Throw unless the storey is one reachable region from the door.
 *
 * The message carries the plan, the start, and the pocket list.
 */
export function assertNoPockets(
  result: WalkInput,
  opts: WalkabilityOptions & { readonly label?: string } = {},
): WalkabilityReport {
  const report = walkabilityReport(result, opts);
  const label = opts.label === undefined ? "" : `${opts.label}: `;
  if (report.start === null) {
    throw new Error(
      `${label}no walkable cell inside the door — the way in is blocked\n${report.map}`,
    );
  }
  if (report.pocket.length > 0) {
    throw new Error(
      `${label}${report.pocket.length} floor cell(s) a player cannot reach from the door ` +
        `at ${report.start.x},${report.start.y},${report.start.z}: ` +
        `${report.pocket.join(" ")}\n${report.map}`,
    );
  }
  return report;
}

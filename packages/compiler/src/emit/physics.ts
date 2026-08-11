/**
 * The physics lint — a world **readback** validator.
 *
 * Every other check in this compiler reads a plan, a placement list or an op
 * list: it asks whether the compiler meant to do the right thing. This one
 * opens the finished region files and asks whether the world on disk is one a
 * player can actually walk through. The distinction is not academic — every
 * defect this module checks for survived the whole existing test suite and was
 * found by a human walking the village in the game client:
 *
 * - ladders fixed to open air, because the wall behind them had an arrow slit;
 * - a torch bracket with nothing to bracket to;
 * - an interior stair flight whose top step was one block short of the floor it
 *   served, so you had to jump to get upstairs;
 * - a bed whose two halves were paired the wrong way round;
 * - fences carrying the default "connected to nothing" state;
 * - a road laid a block proud of the field it crossed;
 * - a half-block hole over every doorway;
 * - a cobblestone flue running floor to ceiling through the middle of a room;
 * - a granary checkerboarded with hay bales, so no cell touched another;
 * - a lamp post standing on air twelve blocks over a gorge.
 *
 * Renders miss all of it. A readback does not.
 *
 * Two of those got past an *earlier* version of this file, which is the reason
 * for its shape now. The old stair rule matched a list of geometries that had
 * gone wrong before, and passed a flight that was a jump for a reason not on
 * the list; the old support rules asked each block about the one below it, and
 * passed a lantern on a fence on a fence on air. Both are replaced by rules
 * that simulate the property instead of enumerating its failures: a walking
 * agent that has to reach every floor of every building from the front door,
 * and a support check that walks each chain all the way to the ground.
 *
 * Each check returns findings rather than throwing, so a caller can report a
 * count, sample the worst offenders, and assert zero.
 */

import { readFile } from "node:fs/promises";

import { GROWTH_FACES, bodyBlocking, isMultifaceGrowth, needsGround } from "@terrainist/stdlib";

import type { EmitAnvil, EmitChunk, PrismarineStack } from "./prismarine.js";
import { listChunks, listRegionFiles, readRegionChunksNbt } from "./prismarine.js";
import { applyConnectionStates, connectiveKindOf } from "./connections.js";
import { blockEntityIdOf, requiredBlockEntityId } from "./block-entities.js";

/** One thing wrong with the world. */
export interface PhysicsFinding {
  /** Machine-readable rule id, e.g. `"unsupported.ladder"`. */
  readonly rule: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The offending block, as `name[prop=value,…]`. */
  readonly block: string;
  readonly detail: string;
}

/** What {@link lintWorldPhysics} found, per rule and in full. */
export interface PhysicsReport {
  readonly findings: readonly PhysicsFinding[];
  /** Finding count per rule id, including rules that found nothing. */
  readonly counts: Readonly<Record<string, number>>;
  /** Blocks examined — the size of the readback, for context. */
  readonly examined: number;
}

/** Context the lint needs from the compile that produced the world. */
export interface PhysicsContext {
  /** Placed buildings, as the compile report carries them. */
  readonly buildings?: readonly {
    readonly footprint: { x0: number; z0: number; x1: number; z1: number };
    /** The enclosed interior in world columns; derived from the footprint when absent. */
    readonly interior?: { x0: number; z0: number; x1: number; z1: number };
    /**
     * The building's true floor columns, as `"x,z"` keys.
     *
     * The interior rectangle is the envelope's, and on an L or a T the envelope
     * lies about the room in both directions: it spans the notch, which is open
     * ground with somebody's outside wall standing in it, and it misses the
     * wing, which is floor. Every interior rule is bounded by this set when it
     * is supplied, and falls back to the rectangle when it is not.
     */
    readonly interiorCells?: ReadonlySet<string>;
    /**
     * The building's floor columns **per storey**, aligned with
     * `meta.floorLevels`.
     *
     * Absent for every building whose storeys all have the same plan, which was
     * every building until the terrace. There the bays of one run differ in
     * height, so at the fifth level a six-storey bay is a room and the
     * three-storey bay beside it is a *roof* — and reading one column set for
     * all levels would have this lint demand a walking route onto the roof of
     * every short bay in the street. When present it is what
     * `columnsAt` answers with; when absent the single set is used at every
     * level, exactly as before.
     */
    readonly interiorCellsByLevel?: readonly ReadonlySet<string>[];
    /**
     * The cellar's own floor columns, as `"x,z"` keys.
     *
     * A cellar is dug under the main rect only, so below the ground floor the
     * room is a *different* set of columns from the one above it. Without
     * this, the interior rules read the four courses of foundation under a
     * wing as a blocked room and the cell over them as unreachable floor.
     */
    readonly basementCells?: ReadonlySet<string>;
    readonly floorY: number;
    readonly meta: {
      readonly roofTop: number;
      readonly foundationDepth: number;
      /** Y of the topmost wall course, node-local. Enables the interior rules. */
      readonly wallTop?: number;
      /** Node-local Y of each storey's floor plane. Enables the interior rules. */
      readonly floorLevels?: readonly number[];
      /**
       * What the decay pass did to this lot, when one ran — `BuildingMeta.decay`,
       * carried through unchanged.
       *
       * Absent on every intact building, which is every building in a document
       * that never says `decay`, so nothing here can loosen a rule for a world
       * with no ruin in it. `mode` is the only field the lint reads, and it
       * reads it for exactly one purpose: {@link lostStorey}.
       */
      readonly decay?: { readonly mode: "shell" | "facade" | "none" };
    };
  }[];
  /**
   * Tunnels, as the two cellar cells each one has to join.
   *
   * The walking agent is pointed at `from` and has to reach `to`. That single
   * assertion covers the whole chain — the cellar ladder, the doorway through
   * the cellar wall, every stair flight in the gallery and the ladder at the
   * far end — because the agent has no other way to get there.
   */
  readonly tunnels?: readonly {
    readonly id?: string;
    readonly from: { readonly x: number; readonly y: number; readonly z: number };
    readonly to: { readonly x: number; readonly y: number; readonly z: number };
  }[];
  /**
   * Props, as the footprint and base plane each one was placed on.
   *
   * `prop.place@0` is the one generator that writes *water* — the fountain's
   * bowl — and the one that stands blocks in water that was already there —
   * the piers and the boats. `checkPropFluidSafety` re-derives that claim from
   * the op list at the pass; this is the same property asked of the world on
   * disk, which is where a leak would actually flood a village green.
   */
  readonly props?: readonly {
    readonly nodePath?: string;
    readonly prop?: string;
    readonly footprint: { x0: number; z0: number; x1: number; z1: number };
    readonly baseY: number;
  }[];
  /** Road centre lines; bridge decks are exempt from the flush-road rule. */
  readonly roads?: readonly {
    readonly path: readonly { readonly x: number; readonly z: number; readonly y: number }[];
  }[];
  /**
   * The terrain's expected top solid block per column, so the cave rules can
   * check that carving left the heightmap alone.
   *
   * `entrances` marks the columns a declared cave mouth is allowed to open;
   * every other column's top must match `ground` exactly. Without this the
   * cave rules are skipped — a caller who has no column plan (a readback of a
   * world from disk, say) can still run every other rule.
   */
  readonly terrainTop?: {
    readonly x0: number;
    readonly z0: number;
    readonly width: number;
    readonly depth: number;
    readonly ground: Int32Array;
    readonly entrances: Uint8Array;
  };
  /**
   * Interior columns the green skin **elected** to stand a shell trunk on —
   * RUINS-PLAN-v0-WP6, Kai's 6e ruling (2026-08-10).
   *
   * > a deliberately elected shell trunk, verifiable from the plan, is not an
   * > accidental obstruction; interior reachability stays enforced.
   *
   * This is `growGreenSkin`'s own `shellTrunks` mask, in the same
   * region-plus-`Uint8Array` shape `terrainTop` uses, and it is the *only*
   * thing that exempts a column from `interior.blocked_column`. That shape is
   * the point: the lint still runs against the world on disk, and what the
   * plan supplies is not permission to skip a check but the fact that this
   * particular column was chosen by a pass whose siting rule is itself
   * checked. A trunk somebody put there by accident is in no mask and still
   * fires.
   *
   * **Neither `traversal.unreachable` nor `traversal.no_start` is exempted by
   * this mask.** The obstruction is the image; a room cut off from its door is
   * a defect. `electShellTrees` keeps the room one component *before* it
   * elects, so the two rules never disagree about the same trunk. (A decayed
   * shell's *upper* storey is exempt from `traversal.unreachable` under a
   * separate and later ruling — see `lostStorey` in the traversal rule — which
   * reads `meta.decay`, not this mask.)
   *
   * Absent — every world that grows no shell trunk — leaves rule 17 exactly as
   * it was.
   */
  readonly shellTrunks?: {
    readonly x0: number;
    readonly z0: number;
    readonly width: number;
    readonly depth: number;
    readonly mask: Uint8Array;
  };
  /** Y range to read back. Defaults to a generous band around the surface. */
  readonly minY?: number;
  readonly maxY?: number;
}

/** Every rule this module can report, so a clean world still lists them all. */
export const PHYSICS_RULES: readonly string[] = Object.freeze([
  "palette.registry",
  "palette.biome",
  "unsupported.ladder",
  "unsupported.wall_torch",
  "unsupported.wall_sign",
  "unsupported.torch",
  "unsupported.lantern",
  "unsupported.door",
  "door.half_mismatch",
  "bed.pairing",
  "floating.slab",
  "floating.stair",
  "floating.isolated",
  "unsupported.chain",
  "unsupported.bell",
  "prop.fluid_leak",
  "interior.blocked_column",
  "traversal.no_start",
  "traversal.unreachable",
  "traversal.tunnel",
  "connection.stale",
  "road.proud",
  "dripstone.unattached",
  "cave.fluid_shell",
  "cave.surface_breach",
  "blockentity.orphan",
  // RUINS-PLAN-v0-WP6 §8's rule 27, and the first rule in this list that
  // polices a block whose whole state *is* its attachment.
  "unsupported.multiface",
]);

/** The six faces a multi-face growth block may claim, and where each points. */
const MULTIFACE_STEP = GROWTH_FACES;

const AIR = new Set(["air", "cave_air", "void_air"]);

/* -------------------------------------------------------------------------- */
/* the walking agent's block vocabulary                                        */
/* -------------------------------------------------------------------------- */

// **Blocks a 1x2 player body cannot stand inside** — `bodyBlocking`, imported
// above. Deliberately a positive list of *obstacles* rather than a list of
// things you can walk through: the failure mode that matters is calling
// something passable that is not, because that makes the traversal simulation
// report a route the player does not have. Anything unrecognised falls through
// to `isFullCube`, which is the block table's own answer.
//
// The set itself lives in `structures/support.ts`, for the reason RUINS-PLAN
// §5.6 already moved the *support* vocabulary there: the decay's
// `reachOrRefuse` flood asks the same question of an op list, and a flood that
// called a flower pot's cell sealed while this rule called it a place a player
// stands is exactly the `traversal.unreachable` defect that made it shared.

/** Blocks that a foot may rest on even though they are not full cubes. */
const STANDABLE_PARTIAL = /(_slab|_stairs)$/;

/**
 * Blocks that are not full cubes but whose *top* face is solid and flush.
 *
 * A dirt path is fifteen sixteenths tall with a full square top: vanilla lets a
 * player walk it and lets a fence, a torch or a lamp post stand on it, and a
 * road made of them is the whole point of `road.surface`. Treating them as
 * unsupportive made the porch lamp of any building whose doorstep met a lane
 * read as a lamp standing on air — a lint finding with no defect under it.
 */
const SOLID_TOP = /^(dirt_path|farmland)$/;

/**
 * Blocks that stand on whatever is under them and fall over without it.
 *
 * The old `unsupported.*` rules asked each of these for its *immediate*
 * neighbour only, which is why a lantern on a fence on a fence on air passed:
 * every link in the chain was happy with the link below it and nobody asked
 * whether the chain reached the ground.
 */
// RUINS-PLAN-v0 §5.6: the set and the predicate now live in
// `structures/support.ts`, imported above, because the decay's `settleFixtures`
// fixpoint sweeps for exactly this property before the world exists and two
// mechanisms for one invariant is how `CURB_LEVEL_TOLERANCE` happened. The
// comment that used to live here is the shared module's.

/** `(dx, dz)` per cardinal name. */
const STEP: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
});

/**
 * Read a world back and check it.
 *
 * The whole emitted region is loaded into an in-memory grid first. That is
 * deliberate: half these rules are about a block's *neighbours*, and three of
 * them (the connection diff above all) have to compare against neighbours that
 * may be in a different chunk, so a scan that could only see one chunk at a
 * time would be checking a weaker property than the one that matters.
 */
export async function lintWorldPhysics(
  worldDir: string,
  stack: PrismarineStack,
  context: PhysicsContext = {},
): Promise<PhysicsReport> {
  const minY = context.minY ?? 40;
  const maxY = context.maxY ?? 200;
  const regionDir = `${worldDir}/region`;

  // First, and on its own: a world whose palette does not typecheck against the
  // registry is not a world any reader can open — not the game, and not the
  // readback below, which resolves palette entries through `prismarine-block`
  // and throws on an entry it cannot match. So the registry check runs before
  // anything touches a chunk, and a failure short-circuits: the remaining rules
  // describe how a world plays, and there is no point asking that of one the
  // client would refuse to load.
  const paletteFindings = await lintPalettes(worldDir, stack);
  if (paletteFindings.length > 0) return report(paletteFindings, 0);

  const positions = await listChunks(regionDir);
  const anvil: EmitAnvil = stack.openAnvil(regionDir);
  const chunks = new Map<string, EmitChunk>();
  try {
    for (const { chunkX, chunkZ } of positions) {
      const chunk = await anvil.load(chunkX, chunkZ);
      if (chunk !== null) chunks.set(`${chunkX},${chunkZ}`, chunk);
    }
  } finally {
    await anvil.close();
  }

  const stateAt = (x: number, y: number, z: number): number => {
    if (y < minY || y > maxY) return 0;
    const chunk = chunks.get(`${x >> 4},${z >> 4}`);
    if (chunk === undefined) return 0;
    return chunk.getBlockStateId(x - (x >> 4) * 16, y, z - (z >> 4) * 16);
  };
  const nameCache = new Map<number, string>();
  const nameAt = (x: number, y: number, z: number): string => {
    const id = stateAt(x, y, z);
    let name = nameCache.get(id);
    if (name === undefined) {
      name = stack.blockNameByStateId(id) ?? "air";
      nameCache.set(id, name);
    }
    return name;
  };
  const solidAt = (x: number, y: number, z: number): boolean => stack.isFullCube(stateAt(x, y, z));
  const airAt = (x: number, y: number, z: number): boolean => AIR.has(nameAt(x, y, z));
  const describe = (id: number): string => {
    const decoded = stack.blockStateProps(id);
    if (decoded === undefined) return `#${id}`;
    const props = Object.entries(decoded.props)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return props === "" ? decoded.name : `${decoded.name}[${props}]`;
  };

  const findings: PhysicsFinding[] = [];
  const add = (rule: string, x: number, y: number, z: number, detail: string): void => {
    findings.push({ rule, x, y, z, block: describe(stateAt(x, y, z)), detail });
  };

  let examined = 0;
  const connective: { x: number; y: number; z: number }[] = [];
  /** Blocks that are meaningless without a block entity, and which one. */
  const needsEntity: { x: number; y: number; z: number; id: string }[] = [];

  for (const [key, chunk] of chunks) {
    const [cx, cz] = key.split(",").map(Number) as [number, number];
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const x = cx * 16 + lx;
        const z = cz * 16 + lz;
        for (let y = minY; y <= maxY; y++) {
          const id = chunk.getBlockStateId(lx, y, lz);
          if (id === 0) continue;
          const decoded = stack.blockStateProps(id);
          if (decoded === undefined) continue;
          const { name, props } = decoded;
          if (name === "cave_air" && context.terrainTop !== undefined) {
            // The four-block water shell, re-derived from the world on disk.
            //
            // Sampled rather than exhaustive: the exact rule is horizontal, so
            // the scan is a 9x9 column window taken at three heights, which is
            // 243 lookups per carved block instead of 729. The column plan's
            // `checkCaveIntegrity` is the exhaustive check; this one exists to
            // catch an emitter that wrote spans the plan never held.
            if (fluidNear(x, y, z)) {
              add("cave.fluid_shell", x, y, z, "carved air within four blocks of water or lava");
            }
          }
          if (AIR.has(name)) continue;
          examined++;

          // --- attachment ------------------------------------------------
          if (name === "ladder") {
            const [dx, dz] = STEP[props["facing"] ?? "north"] ?? [0, -1];
            if (!solidAt(x - dx, y, z - dz)) {
              add("unsupported.ladder", x, y, z, `nothing solid behind it at ${x - dx},${y},${z - dz}`);
            }
          } else if (name.endsWith("wall_torch")) {
            const [dx, dz] = STEP[props["facing"] ?? "north"] ?? [0, -1];
            if (!solidAt(x - dx, y, z - dz)) {
              add("unsupported.wall_torch", x, y, z, `nothing to bracket to at ${x - dx},${y},${z - dz}`);
            }
          } else if (name.endsWith("_wall_sign")) {
            // A wall sign brackets to the block *behind* it, exactly as a wall
            // torch does — `facing` is the direction it reads towards, so the
            // block it hangs on is one step the other way.
            const [dx, dz] = STEP[props["facing"] ?? "north"] ?? [0, -1];
            if (!solidAt(x - dx, y, z - dz)) {
              add("unsupported.wall_sign", x, y, z, `nothing to hang on at ${x - dx},${y},${z - dz}`);
            }
          } else if (name === "torch" || name === "soul_torch" || name === "redstone_torch") {
            if (!solidAt(x, y - 1, z)) add("unsupported.torch", x, y, z, "no solid block below");
          } else if (name.endsWith("lantern")) {
            const hanging = props["hanging"] === "true";
            const ok = hanging ? !airAt(x, y + 1, z) : !airAt(x, y - 1, z);
            if (!ok) {
              add("unsupported.lantern", x, y, z, hanging ? "hangs from air" : "stands on air");
            }
          } else if (name.endsWith("_door")) {
            if (props["half"] === "lower") {
              if (!solidAt(x, y - 1, z)) add("unsupported.door", x, y, z, "no solid block below");
              const above = stack.blockStateProps(stateAt(x, y + 1, z));
              const paired =
                above !== undefined &&
                above.name === name &&
                above.props["half"] === "upper" &&
                above.props["facing"] === props["facing"] &&
                above.props["hinge"] === props["hinge"];
              if (!paired) add("door.half_mismatch", x, y, z, "no matching upper half above");
            }
          } else if (name.endsWith("_bed")) {
            const facing = props["facing"] ?? "north";
            const [dx, dz] = STEP[facing] ?? [0, -1];
            const part = props["part"];
            // The head is one step along `facing` from the foot; look the
            // right way for whichever half this is.
            const sign = part === "foot" ? 1 : -1;
            const other = stack.blockStateProps(stateAt(x + dx * sign, y, z + dz * sign));
            const ok =
              other !== undefined &&
              other.name === name &&
              other.props["facing"] === facing &&
              other.props["part"] === (part === "foot" ? "head" : "foot");
            if (!ok) {
              add("bed.pairing", x, y, z, `${part} has no matching half at ${x + dx * sign},${y},${z + dz * sign}`);
            }
          }

          // --- multi-face growth (rule 27) --------------------------------
          // RUINS-PLAN-v0-WP6 §8. A `vine`, a `glow_lichen` or a `sculk_vein`
          // does not stand on anything and does not hang off anything: its
          // whole state is a set of attachment faces, and each true face draws
          // a panel on that side of the cube. The other 26 rules cannot see
          // this class of defect at all — `support.ts` puts `vine` in
          // `INSUBSTANTIAL` and `supportDirection` returns `null` for it, which
          // is right for what those rules ask and leaves a mis-faced vine
          // invisible to every one of them. It is also the exact defect Kai
          // found by eye twice on the flora side (`oldgrowth_vale-2` and `-3`):
          // a face set whose every true face points at air renders as a flat
          // plate in mid-air and vanilla pops it on the first block update.
          //
          // Two clauses, matching `growthFaces`' laws 1 and 2 read back off
          // disk: at least one true face names a full cube, and `up` is true
          // only under one.
          if (isMultifaceGrowth(name)) {
            // Vanilla's own two ways for a face to be held, and no third:
            // the neighbour on that face is a full cube, or the block directly
            // above is the same growth carrying the same face — which is how a
            // legal strand runs down a wall and one course past its last block
            // without popping (`VineBlock.getUpdatedState`). `up` gets no such
            // clause: a vine is not a sturdy down-face, so an inherited `up` is
            // the flat plate hanging in space and is always a finding.
            const above = stack.blockStateProps(stateAt(x, y + 1, z));
            const carried =
              above !== undefined && above.name === name ? above.props : undefined;
            const anchored: string[] = [];
            for (const [face, ox, oy, oz] of MULTIFACE_STEP) {
              if (props[face] !== "true") continue;
              if (face === "up" || face === "down") continue;
              if (solidAt(x + ox, y + oy, z + oz) || carried?.[face] === "true") {
                anchored.push(face);
              }
            }
            const ceiling = props["up"] === "true" && solidAt(x, y + 1, z);
            if (anchored.length === 0 && !ceiling) {
              add(
                "unsupported.multiface",
                x,
                y,
                z,
                "no true face names a full cube — every face it claims points at air",
              );
            }
            if (props["up"] === "true" && !solidAt(x, y + 1, z)) {
              add(
                "unsupported.multiface",
                x,
                y,
                z,
                `up=true but nothing solid above at ${x},${y + 1},${z}`,
              );
            }
          }

          // --- dripstone attachment ---------------------------------------
          // A pointed dripstone is fixed to the rock it grows out of, and a
          // multi-block spike is fixed to the block of dripstone before it.
          // Vanilla breaks one that loses its anchor, so a floating spike is
          // not a cosmetic defect: it is a block that vanishes on first tick.
          if (name === "pointed_dripstone") {
            const up = props["vertical_direction"] === "up";
            const ax = x;
            const ay = up ? y - 1 : y + 1;
            const az = z;
            const anchor = stack.blockStateProps(stateAt(ax, ay, az));
            const chained =
              anchor !== undefined &&
              anchor.name === "pointed_dripstone" &&
              anchor.props["vertical_direction"] === props["vertical_direction"];
            if (!chained && !solidAt(ax, ay, az)) {
              add(
                "dripstone.unattached",
                x,
                y,
                z,
                `${up ? "stalagmite" : "stalactite"} has nothing to grow from at ${ax},${ay},${az}`,
              );
            }
          }

          // --- floating half-blocks --------------------------------------
          if (name.endsWith("_slab") || name.endsWith("_stairs")) {
            const below = !airAt(x, y - 1, z);
            const sideways =
              !airAt(x + 1, y, z) || !airAt(x - 1, y, z) || !airAt(x, y, z + 1) || !airAt(x, y, z - 1);
            const above = !airAt(x, y + 1, z);
            if (!below && !sideways && !above) {
              add(name.endsWith("_slab") ? "floating.slab" : "floating.stair", x, y, z, "air on every side");
            }
          }

          // --- transitive support ----------------------------------------
          // A block that stands on the one below it is only up if the whole
          // chain under it reaches something grounded. Checking one link was
          // enough to pass a lantern on a fence on a fence on air.
          if (name.endsWith("lantern") && props["hanging"] === "true") {
            if (!hungChain(x, y, z)) {
              add("unsupported.chain", x, y, z, "nothing above it to hang from");
            }
          } else if (needsGround(name)) {
            // A wall or a fence is *also* up if it is bracketed sideways to
            // something solid: the statue's outstretched arms are wall posts
            // fixed to its torso, and a cantilever is not a floating block.
            // Nothing else gets the exemption — a torch, a carpet or a lamp
            // post over a gorge still has to reach the ground.
            const braced =
              (name.endsWith("_wall") || name.endsWith("_fence")) && bracedSideways(x, y, z);
            if (!braced && !groundedChain(x, y, z)) {
              add("unsupported.chain", x, y, z, "its support chain does not reach a solid block");
            }
          }

          // --- the bell ---------------------------------------------------
          // A church bell names the thing it hangs on in its own state, and
          // nothing else in the lint reads `attachment`. Vanilla drops one
          // whose anchor is missing on the first block update, so a steeple
          // with a bell hung from nothing is a steeple that empties itself.
          if (name === "bell") {
            const attachment = props["attachment"] ?? "floor";
            const [fdx, fdz] = STEP[props["facing"] ?? "north"] ?? [0, -1];
            const anchors: [number, number, number][] =
              attachment === "ceiling"
                ? [[x, y + 1, z]]
                : attachment === "floor"
                  ? [[x, y - 1, z]]
                  : attachment === "double_wall"
                    ? [
                        [x + fdz, y, z + fdx],
                        [x - fdz, y, z - fdx],
                      ]
                    : [[x - fdx, y, z - fdz]];
            const missing = anchors.filter(([ax, ay, az]) => !solidAt(ax, ay, az));
            if (missing.length > 0) {
              const [ax, ay, az] = missing[0] as [number, number, number];
              add(
                "unsupported.bell",
                x,
                y,
                z,
                `attachment=${attachment} but nothing solid at ${ax},${ay},${az}`,
              );
            }
          }

          // --- isolated blocks -------------------------------------------
          // A full cube with air on all six faces is not a design; it is the
          // residue of a pass that emitted a landing, a pad or a marker and
          // forgot to attach it to anything.
          if (
            stack.isFullCube(id) &&
            airAt(x + 1, y, z) &&
            airAt(x - 1, y, z) &&
            airAt(x, y + 1, z) &&
            airAt(x, y - 1, z) &&
            airAt(x, y, z + 1) &&
            airAt(x, y, z - 1)
          ) {
            add("floating.isolated", x, y, z, "a full block with air on all six faces");
          }

          if (connectiveKindOf(name) !== undefined) connective.push({ x, y, z });
          const wants = requiredBlockEntityId(name);
          if (wants !== undefined) needsEntity.push({ x, y, z, id: wants });
        }
      }
    }
  }

  // --- interior traversal --------------------------------------------------
  // The rule this replaces (`stair.unmountable`) checked a stair flight against
  // a list of things that had gone wrong before: a foot with no floor beside
  // it, a top step with no landing, a step with a torch over it. It passed a
  // flight whose bottom step had its low face buried in a wall — walkable in
  // the checker's model, a jump in the game, because the half-block gap between
  // the wall and the step's raised half is narrower than a player.
  //
  // So the check is no longer a list of shapes. It is a walking agent: a 1x2
  // body that starts on the cell inside the front door and may step up half a
  // block onto a stair or a slab, step down up to three, and climb a ladder. It
  // may not jump. Every interior floor cell a player could stand on, on every
  // storey, has to be somewhere that agent can reach — which makes "the stairs
  // work", "the furniture leaves a path" and "the doorway is clear" one
  // property with one implementation.
  for (const b of context.buildings ?? []) {
    const levels = b.meta.floorLevels;
    if (levels === undefined || b.meta.wallTop === undefined) continue;
    const interior = b.interior ?? {
      x0: b.footprint.x0 + 1,
      z0: b.footprint.z0 + 1,
      x1: b.footprint.x1 - 1,
      z1: b.footprint.z1 - 1,
    };
    if (interior.x0 > interior.x1 || interior.z0 > interior.z1) continue;
    // The room. Beyond the rectangle for a wing, inside it for a notch.
    const cells = b.interiorCells;
    const inRoom = (x: number, z: number): boolean =>
      cells === undefined
        ? x >= interior.x0 && x <= interior.x1 && z >= interior.z0 && z <= interior.z1
        : cells.has(`${x},${z}`);
    const columns: { x: number; z: number }[] = [];
    if (cells === undefined) {
      for (let z = interior.z0; z <= interior.z1; z++) {
        for (let x = interior.x0; x <= interior.x1; x++) columns.push({ x, z });
      }
    } else {
      columns.push(...columnsOf(cells));
    }

    // --- a full-block column through the room ------------------------------
    // A chimney flue, a misplaced pillar or a stack of anything that runs from
    // the floor to the ceiling of an interior cell is furniture nobody can walk
    // round and, in the case that prompted the rule, a cobblestone shaft
    // standing in the middle of a smithy with a cauldron for a hearth.
    // Below the ground floor the room is the cellar's, not the building's:
    // `columnsAt` answers "which columns is this storey's floor made of".
    const cellarColumns =
      b.basementCells === undefined ? undefined : columnsOf(b.basementCells);
    // Per-storey plans, when the building has them. A terrace's bays differ in
    // height, so "which columns is this storey's floor made of" stops being one
    // answer for the whole building — and taking the ground floor's answer at
    // the fifth level would demand a route onto every short bay's roof.
    const byLevel = b.interiorCellsByLevel?.map((set) => columnsOf(set));
    const columnsAt = (level: number): { x: number; z: number }[] => {
      if (level < 0 && cellarColumns !== undefined) return cellarColumns;
      if (byLevel !== undefined) {
        const index = levels.indexOf(level);
        const set = index < 0 ? undefined : byLevel[index];
        if (set !== undefined) return set;
      }
      return columns;
    };

    const bands: { lo: number; hi: number; columns: { x: number; z: number }[] }[] = [];
    for (const [i, level] of levels.entries()) {
      const next = levels[i + 1] ?? b.meta.wallTop;
      const lo = b.floorY + level + 1;
      const hi = b.floorY + next - 1;
      if (hi >= lo) bands.push({ lo, hi, columns: columnsAt(level) });
    }
    for (const band of bands) {
      for (const { x, z } of band.columns) {
        let blockedAll = true;
        for (let y = band.lo; y <= band.hi && blockedAll; y++) {
          if (passableAt(x, y, z)) blockedAll = false;
        }
        // A column a ladder is fixed to is wall, not obstruction: the
        // watchtower supplies its own pilaster inside the shaft precisely so
        // the rungs have something to hold on to.
        if (blockedAll && ladderBacking(x, band.lo, band.hi, z)) continue;
        // A column the green skin **elected** for a shell trunk is the image,
        // not the defect — Kai's 6e ruling. Reachability is not exempted with
        // it: the walking agent below still has to reach every standable cell
        // of this room, and a trunk that cut the room in two would be reported
        // there, by the rule that means it.
        if (blockedAll && electedShellTrunk(x, z)) continue;
        if (blockedAll) {
          add(
            "interior.blocked_column",
            x,
            band.lo,
            z,
            `interior column is solid from y ${band.lo} to y ${band.hi}`,
          );
        }
      }
    }

    // --- the walking agent -------------------------------------------------
    // From **every** street door, not the first one found. A terrace is one
    // building with a door per bay and a party wall between each pair of them,
    // so no single door reaches the whole of it — and "reachable from *a*
    // street door" is the property a building with more than one way in
    // actually has. Nothing changes for a building with one door: there is
    // still exactly one start, and the flood from it is the same flood.
    const starts = doorApproaches(b, inRoom);
    if (starts.length === 0) {
      const anchor = { x: interior.x0, y: b.floorY + 1, z: interior.z0 };
      add(
        "traversal.no_start",
        anchor.x,
        anchor.y,
        anchor.z,
        "no standable cell inside the door — the way in is blocked",
      );
      continue;
    }
    const start = starts[0] as { x: number; y: number; z: number };

    // **Legal lost storeys** — Kai's ruling on the stranded upper storey
    // (2026-08-10), and the one exemption `traversal.unreachable` has.
    //
    // > the traversal rule learns that a decayed shell's upper storey may be
    // > unreachable, because collapse means some floors are lost; the ground
    // > floor stays fully guaranteed.
    //
    // A shell whose walls were crumbled has, by construction, lost the stair
    // head, the landing, or the floor plane the stair arrived on — that is what
    // a crumble line *is*. Demanding a walking route to the second storey of a
    // roofless ruin is demanding the building not be ruined, and it is the same
    // calibration Kai already ratified for ruin scenes: walkability matters
    // less where the fiction is collapse.
    //
    // The scope is deliberately narrow, and every clause is load-bearing:
    //
    // - **`meta.decay` must be present.** An intact building carries no decay
    //   report at all, so no intact building can reach this branch. The lint
    //   still runs against the world on disk; what the plan supplies is the
    //   fact that a named pass ruined this lot.
    // - **`mode` must be `"shell"`.** `"none"` is a lot the decay *refused* a
    //   crumble on — it took floor paint and rubble and kept all its walls, so
    //   nothing was lost and nothing is exempt. `"facade"` likewise keeps the
    //   shell standing behind the front.
    // - **The ground storey is never exempt.** `groundStorey` is the lowest
    //   floor plane at or above the door's own plane; that storey, and every
    //   cellar below it, is checked exactly as before, for every building in
    //   every world.
    //
    // `traversal.no_start` is **not** exempted, here or anywhere: it says the
    // way in is blocked, which is a ground-floor property, and the ground floor
    // is the thing this ruling guarantees.
    const lostStorey = b.meta.decay?.mode === "shell";
    const groundStorey = levels.reduce(
      (lowest, level) => (level >= 0 && level < lowest ? level : lowest),
      Number.POSITIVE_INFINITY,
    );

    const reached = walk(...starts);
    for (const level of levels) {
      // A storey the collapse may legally have stranded. Never the ground
      // floor, never a cellar, never an intact building.
      if (lostStorey && level > groundStorey) continue;
      const feet = b.floorY + level + 1;
      for (const { x, z } of columnsAt(level)) {
        if (!standable(x, feet, z)) continue;
        if (reached.has(`${x},${feet},${z}`)) continue;
        add(
          "traversal.unreachable",
          x,
          feet,
          z,
          starts.length === 1
            ? `no walking route from the door cell ${start.x},${start.y},${start.z}`
            : `no walking route from any of this building's ${starts.length} street doors`,
        );
      }
    }
  }

  // --- the tunnels ---------------------------------------------------------
  // Underground, so no other rule sees them: the interior rules are bounded by
  // a building's footprint and the road rules by a route's surface. A gallery
  // whose stair flights are a jump, whose doorway is a block short or whose
  // frame posts block the walkway is a gallery nobody can use, and this is the
  // only check that would notice.
  for (const tunnel of context.tunnels ?? []) {
    const from = nearestStandable(tunnel.from);
    const to = nearestStandable(tunnel.to);
    if (from === null || to === null) {
      const anchor = from ?? tunnel.from;
      add(
        "traversal.tunnel",
        anchor.x,
        anchor.y,
        anchor.z,
        `${tunnel.id ?? "tunnel"}: no standable cell at ${from === null ? "the near" : "the far"} end`,
      );
      continue;
    }
    if (!walk(from).has(`${to.x},${to.y},${to.z}`)) {
      add(
        "traversal.tunnel",
        from.x,
        from.y,
        from.z,
        `${tunnel.id ?? "tunnel"}: no walking route to the far cellar at ${to.x},${to.y},${to.z}`,
      );
    }
  }

  // --- the props' water ----------------------------------------------------
  // Every water block a prop's footprint holds has to be boxed in: something
  // under it and something on all four sides. A fountain that satisfies that
  // cannot spread, and a pier or a boat cannot have opened a face in the water
  // it was set into — removing water only ever *reduces* the faces the rest of
  // it has, so the rule is exactly as tight for a boat as for a bowl.
  //
  // Bounded to the footprints, which is what makes it safe to run against a
  // world with an ocean in it: the sea's own surface is nobody's prop.
  for (const prop of context.props ?? []) {
    const { footprint: fp } = prop;
    for (let y = prop.baseY - 2; y <= prop.baseY + 2; y++) {
      for (let z = fp.z0; z <= fp.z1; z++) {
        for (let x = fp.x0; x <= fp.x1; x++) {
          if (nameAt(x, y, z) !== "water") continue;
          const faces: readonly (readonly [string, number, number, number])[] = [
            ["down", 0, -1, 0],
            ["north", 0, 0, -1],
            ["east", 1, 0, 0],
            ["south", 0, 0, 1],
            ["west", -1, 0, 0],
          ];
          for (const [face, dx, dy, dz] of faces) {
            if (!airAt(x + dx, y + dy, z + dz)) continue;
            add(
              "prop.fluid_leak",
              x,
              y,
              z,
              `${prop.prop ?? prop.nodePath ?? "prop"}: water with an open ${face} face`,
            );
            break;
          }
        }
      }
    }
  }

  // --- connection states ---------------------------------------------------
  // Recompute every connective block against the world as read back, and diff.
  // A non-zero diff means the state on disk disagrees with the neighbourhood,
  // which is exactly the defect the emit-side pass exists to prevent — and,
  // because Minecraft never recomputes these on load, exactly what a player
  // would see.
  const before = new Map<string, number>();
  for (const cell of connective) before.set(`${cell.x},${cell.y},${cell.z}`, stateAt(cell.x, cell.y, cell.z));
  const diff = applyConnectionStates(chunks, connective, stack);
  for (const cell of connective) {
    const key = `${cell.x},${cell.y},${cell.z}`;
    const was = before.get(key) as number;
    const now = stateAt(cell.x, cell.y, cell.z);
    if (was === now) continue;
    findings.push({
      rule: "connection.stale",
      x: cell.x,
      y: cell.y,
      z: cell.z,
      block: describe(was),
      detail: `stored state disagrees with its neighbours; should be ${describe(now)}`,
    });
  }
  void diff;

  // --- block entities ------------------------------------------------------
  // A sign's text and a command block's command live in a compound in the
  // chunk's `block_entities` list, not in the block state — so this is the one
  // pairing no block-level rule can see, and it fails in both directions.
  //
  // A compound with no block under it (or the wrong block under it) is dropped
  // by the game on load, silently. A sign with no compound is a blank plank on
  // a post, and a command block with no compound is a decorative cube. Both are
  // exactly the defect the human-review rig would ship: the labels missing and
  // the teleport pads inert, in a world that lints clean under every other rule.
  //
  // The compounds are read from the region files as raw NBT rather than through
  // the chunk adapter, for the same reason `palette.registry` is: the property
  // under test is what the *serializer wrote*, and prismarine-chunk's own
  // block-entity table would launder a fault in it back through the code that
  // produced it.
  const entityAt = new Map<string, string>();
  for (const entity of await readBlockEntities(worldDir)) {
    const key = `${entity.x},${entity.y},${entity.z}`;
    entityAt.set(key, entity.id);
    // Unbounded in Y, unlike the scan above: a cellar sign sits below the
    // default band, and a compound down there is still a compound on disk.
    const chunk = chunks.get(`${entity.x >> 4},${entity.z >> 4}`);
    const stateId =
      chunk === undefined
        ? 0
        : chunk.getBlockStateId(entity.x - (entity.x >> 4) * 16, entity.y, entity.z - (entity.z >> 4) * 16);
    const blockName = stack.blockNameByStateId(stateId) ?? "air";
    const carries = blockEntityIdOf(blockName);
    if (carries === entity.id) continue;
    findings.push({
      rule: "blockentity.orphan",
      x: entity.x,
      y: entity.y,
      z: entity.z,
      block: describe(stateId),
      detail:
        carries === undefined
          ? `a ${entity.id} compound sits on ${blockName}, which carries no block entity`
          : `a ${entity.id} compound sits on ${blockName}, which carries ${carries}`,
    });
  }
  for (const cell of needsEntity) {
    const found = entityAt.get(`${cell.x},${cell.y},${cell.z}`);
    if (found === cell.id) continue;
    add(
      "blockentity.orphan",
      cell.x,
      cell.y,
      cell.z,
      found === undefined
        ? `placed without its ${cell.id} block entity`
        : `expects a ${cell.id} block entity but carries ${found}`,
    );
  }

  // --- road flushness ------------------------------------------------------
  // A lane is a thing cut into the land. If its surface stands proud of the
  // ground either side of it, it reads as a causeway — which is what the first
  // village looked like. Bridge decks are exempt: a deck is *meant* to be
  // above the channel it spans.
  for (const route of context.roads ?? []) {
    for (const cell of route.path) {
      const surfaceY = topOf(cell.x, cell.z, cell.y + 2);
      if (surfaceY === null) continue;
      // A bridge deck is *meant* to stand over its channel, and so is the ramp
      // onto it; both are slabs, and both sit beside water.
      if (nameAt(cell.x, surfaceY, cell.z).endsWith("_slab")) continue;
      let worst = 0;
      let where = "";
      let proudOnEverySide = true;
      for (const [dx, dz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ] as const) {
        const x = cell.x + dx;
        const z = cell.z + dz;
        const neighbour = topOf(x, z, cell.y + 2);
        if (neighbour === null || wetNear(x, z, cell.y)) {
          proudOnEverySide = false;
          break;
        }
        const rise = surfaceY - neighbour;
        if (rise <= 0) {
          proudOnEverySide = false;
          break;
        }
        if (rise > worst) {
          worst = rise;
          where = `${x},${z}`;
        }
      }
      // Proud on *every* side is a causeway. Proud on one side is a road cut
      // across a slope, which is what a road on a hill looks like.
      if (proudOnEverySide) {
        add("road.proud", cell.x, surfaceY, cell.z, `road stands ${worst} above the ground all round (worst at ${where})`);
      }
    }
  }

  // --- the terrain's top surface ------------------------------------------
  // An interior cave may not change what a column looks like from above. Only
  // the columns of a declared entrance mouth are exempt, and they are exempt
  // *by name*: a mouth that drifted one column sideways is still a hole in the
  // heightmap nobody asked for.
  const top = context.terrainTop;
  if (top !== undefined) {
    // A building owns every column of its own footprint, from the roof down to
    // the bottom of its cellar: the pad levelled the ground there, the skirt
    // replaced it, and a cellar deliberately hollows it out. The rule is about
    // what an *interior cave* did to the terrain, so a footprint is not its
    // business — and without this the first cellar ever dug reads as 150
    // breaches.
    const owned = context.buildings ?? [];
    for (let j = 0; j < top.depth; j++) {
      const z = top.z0 + j;
      for (let i = 0; i < top.width; i++) {
        const idx = j * top.width + i;
        if (top.entrances[idx] === 1) continue;
        const x = top.x0 + i;
        if (owned.some((b) => x >= b.footprint.x0 && x <= b.footprint.x1 && z >= b.footprint.z0 && z <= b.footprint.z1)) {
          continue;
        }
        const expected = top.ground[idx] as number;
        if (expected < minY || expected > maxY) continue;
        // The property is precisely "the cave did not eat this column's surface
        // block", so it is asked that way rather than through `topOf`: whether
        // mud, a slab or a dirt path counts as "the ground" is a question about
        // materials, and answering it here would make the rule fail on worlds
        // with no caves in them at all.
        if (!airAt(x, expected, z)) continue;
        add("cave.surface_breach", x, expected, z, `the surface block at y ${expected} is air`);
      }
    }
  }

  /** True when any block within the cave shell of this cell is a fluid. */
  function fluidNear(x: number, y: number, z: number): boolean {
    for (const dy of [-2, 0, 2] as const) {
      for (let dz = -4; dz <= 4; dz++) {
        for (let dx = -4; dx <= 4; dx++) {
          const name = nameAt(x + dx, y + dy, z + dz);
          if (name === "water" || name === "lava") return true;
        }
      }
    }
    return false;
  }

  /** True when a 1x1x1 cell is one a player's body may occupy. */
  function passableAt(x: number, y: number, z: number): boolean {
    const id = stateAt(x, y, z);
    if (id === 0) return true;
    const name = nameAt(x, y, z);
    if (AIR.has(name)) return true;
    if (stack.isFullCube(id)) return false;
    if (name.endsWith("wall_torch")) return true;
    return !bodyBlocking(name);
  }

  /** True when a foot resting on the top of this cell has something under it. */
  function supportAt(x: number, y: number, z: number): boolean {
    const id = stateAt(x, y, z);
    if (id === 0) return false;
    if (stack.isFullCube(id)) return true;
    const name = nameAt(x, y, z);
    return STANDABLE_PARTIAL.test(name) || SOLID_TOP.test(name);
  }

  /**
   * Whether stepping onto this block from `(dx, dz)` costs only half a block.
   *
   * A bottom slab is half a block from any side. A stair is not, and the
   * difference is the whole reason this simulation exists: its front half is
   * half-height and its back half is a full block, so it is a step from the
   * front, a wall from the back, and from the side it is a step *only if the
   * player has somewhere to put the other half of their body*. A player is 0.6
   * wide and the low half of a stair is 0.5 deep, so mounting sideways needs
   * the cell beyond the low face to be open. When that cell is a wall — which
   * is where a flight run hard against one puts it — there is no legal
   * approach, and this is exactly the case that walked past every earlier
   * version of the check.
   */
  function halfStepFrom(x: number, y: number, z: number, dx: number, dz: number): boolean {
    const id = stateAt(x, y, z);
    if (id === 0 || stack.isFullCube(id)) return false;
    const decoded = stack.blockStateProps(id);
    if (decoded === undefined) return false;
    const { name, props } = decoded;
    if (name.endsWith("_slab")) return props["type"] === "bottom";
    if (!name.endsWith("_stairs")) return false;
    if (props["half"] !== "bottom") return false;
    const [fx, fz] = STEP[props["facing"] ?? "north"] ?? [0, -1];
    if (dx === fx && dz === fz) return true;
    // Perpendicular: legal only with room to stand in the low half.
    if (dx * fx + dz * fz !== 0) return false;
    return passableAt(x - fx, y + 1, z - fz);
  }

  /** True when `(x, y, z)` is a cell a standing player fits in, feet included. */
  function standable(x: number, y: number, z: number): boolean {
    return supportAt(x, y - 1, z) && passableAt(x, y, z) && passableAt(x, y + 1, z);
  }

  /** True when the cell holds a ladder, which the agent may climb. */
  function isLadder(x: number, y: number, z: number): boolean {
    return nameAt(x, y, z) === "ladder";
  }

  /**
   * Flood the cells a walking player can reach from `start`.
   *
   * Moves are the ones a player has without pressing jump: level steps, a
   * half-block rise onto a stair or a slab, a drop of up to three, and a ladder
   * climb. The rise needs clearance over the cell being left as well as over
   * the one being entered, because a player who cannot lift their head cannot
   * lift their feet either.
   */
  function walk(...starts: readonly { x: number; y: number; z: number }[]): Set<string> {
    const seen = new Set<string>(starts.map((s) => `${s.x},${s.y},${s.z}`));
    const queue: { x: number; y: number; z: number }[] = [...starts];
    const visit = (x: number, y: number, z: number): void => {
      const key = `${x},${y},${z}`;
      if (seen.has(key)) return;
      seen.add(key);
      queue.push({ x, y, z });
    };
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head] as { x: number; y: number; z: number };
      const { x, y, z } = cell;
      if (isLadder(x, y, z)) {
        if (passableAt(x, y + 1, z) && passableAt(x, y + 2, z) && isLadder(x, y + 1, z)) {
          visit(x, y + 1, z);
        }
        if (isLadder(x, y - 1, z) || standable(x, y - 1, z)) visit(x, y - 1, z);
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const nz = z + dz;
        // Up: only onto a half-height support, and only with headroom to rise.
        if (
          halfStepFrom(nx, y, nz, dx, dz) &&
          passableAt(x, y + 2, z) &&
          passableAt(nx, y + 1, nz) &&
          passableAt(nx, y + 2, nz)
        ) {
          visit(nx, y + 1, nz);
        }
        // Level, then down: the first standable landing within a safe drop.
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
    return seen;
  }

  /**
   * The cell just inside the front door, found in the world rather than taken
   * on trust: the lower half of a door in the building's shell, then whichever
   * of its four neighbours is an interior cell.
   */
  function doorApproaches(
    b: NonNullable<PhysicsContext["buildings"]>[number],
    inRoom: (x: number, z: number) => boolean,
  ): { x: number; y: number; z: number }[] {
    const y = b.floorY + 1;
    const found: { x: number; y: number; z: number }[] = [];
    const seen = new Set<string>();
    // Every column of the envelope, not just its outer ring. A wing puts wall
    // — and can put the door — on a face that is nowhere near the bounding
    // box's edge, and a door the lint cannot find is a building the agent
    // never gets into.
    for (let z = b.footprint.z0; z <= b.footprint.z1; z++) {
      for (let x = b.footprint.x0; x <= b.footprint.x1; x++) {
        const decoded = stack.blockStateProps(stateAt(x, y, z));
        if (decoded === undefined) continue;
        if (!decoded.name.endsWith("_door") || decoded.props["half"] !== "lower") continue;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const nz = z + dz;
          if (!inRoom(nx, nz)) continue;
          if (!standable(nx, y, nz)) continue;
          const key = `${nx},${nz}`;
          if (seen.has(key)) break;
          seen.add(key);
          found.push({ x: nx, y, z: nz });
          break;
        }
      }
    }
    return found;
  }

  /**
   * The cell itself if a player fits in it, else the nearest of its four
   * neighbours that one does.
   *
   * A tunnel endpoint is the cellar cell in front of the opening, which the
   * compiler computed from geometry rather than read back — and the cellar's
   * own decoration may have put a barrel there. Nudging one block is the honest
   * amount of slack: it still proves the gallery reaches the room.
   */
  function nearestStandable(
    at: { x: number; y: number; z: number },
  ): { x: number; y: number; z: number } | null {
    if (standable(at.x, at.y, at.z)) return at;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (standable(at.x + dx, at.y, at.z + dz)) return { x: at.x + dx, y: at.y, z: at.z + dz };
    }
    return null;
  }

  /**
   * True when the plan says the green skin **elected** this column for a shell
   * trunk — Kai's 6e ruling, and the one exemption rule 17 has beyond the
   * ladder's pilaster.
   *
   * Verifiable rather than trusted: the mask is a plan artefact keyed by world
   * column, so a reader can name the pass, the column and the ruling that put
   * the bit there. Without the mask nothing is exempt.
   */
  function electedShellTrunk(x: number, z: number): boolean {
    const trunks = context.shellTrunks;
    if (trunks === undefined) return false;
    const i = x - trunks.x0;
    const j = z - trunks.z0;
    if (i < 0 || j < 0 || i >= trunks.width || j >= trunks.depth) return false;
    return trunks.mask[j * trunks.width + i] === 1;
  }

  /** True when a ladder anywhere in this column's band is fixed to it. */
  function ladderBacking(x: number, lo: number, hi: number, z: number): boolean {
    for (let y = lo; y <= hi; y++) {
      for (const [dir, [dx, dz]] of Object.entries(STEP)) {
        if (nameAt(x + dx, y, z + dz) !== "ladder") continue;
        const props = stack.blockStateProps(stateAt(x + dx, y, z + dz))?.props;
        if ((props?.["facing"] ?? "north") === dir) return true;
      }
    }
    return false;
  }

  /** Walk a standing block's support chain down to something grounded. */
  function groundedChain(x: number, y: number, z: number): boolean {
    for (let depth = 0; depth < 64; depth++) {
      const by = y - 1 - depth;
      const id = stateAt(x, by, z);
      if (id === 0) return false;
      if (stack.isFullCube(id)) return true;
      const name = nameAt(x, by, z);
      if (AIR.has(name)) return false;
      if (STANDABLE_PARTIAL.test(name) || SOLID_TOP.test(name)) return true;
      if (!needsGround(name)) return false;
    }
    return false;
  }

  /** The same walk, upward, for anything that hangs. */
  function hungChain(x: number, y: number, z: number): boolean {
    for (let depth = 0; depth < 64; depth++) {
      const ay = y + 1 + depth;
      const id = stateAt(x, ay, z);
      if (id === 0) return false;
      if (stack.isFullCube(id)) return true;
      const name = nameAt(x, ay, z);
      if (AIR.has(name)) return false;
      if (name.endsWith("_fence") || name.endsWith("_wall") || name === "chain") return true;
      // A soffit: the underside of a bottom slab or a bottom stair is a full,
      // flush square, which is exactly what vanilla asks of the block a
      // lantern hangs from. The gazebo's ridge lantern hangs from its slab
      // roof, and calling that unsupported was the lint being stricter than
      // the game.
      if (solidUnderside(x, ay, z)) return true;
      if (name.endsWith("lantern")) continue;
      return false;
    }
    return false;
  }

  /** A `"x,z"` key set as columns, in a sorted — and therefore stable — order. */
  function columnsOf(keys: ReadonlySet<string>): { x: number; z: number }[] {
    return [...keys].sort().map((key) => {
      const [x, z] = key.split(",").map(Number) as [number, number];
      return { x, z };
    });
  }

  /**
   * True when the block at `(x, y, z)` presents a full, flush **bottom** face.
   *
   * A full cube does, and so does the lower half of a bottom slab or a bottom
   * stair — which is what a canopy, a gazebo roof and a market stall's awning
   * are all made of.
   */
  function solidUnderside(x: number, y: number, z: number): boolean {
    const id = stateAt(x, y, z);
    if (id === 0) return false;
    if (stack.isFullCube(id)) return true;
    const decoded = stack.blockStateProps(id);
    if (decoded === undefined) return false;
    const { name, props } = decoded;
    if (name.endsWith("_slab")) return props["type"] === "bottom" || props["type"] === "double";
    if (name.endsWith("_stairs")) return props["half"] === "bottom";
    return false;
  }

  /** True when a full cube stands beside this cell, at its own level. */
  function bracedSideways(x: number, y: number, z: number): boolean {
    return (
      solidAt(x + 1, y, z) || solidAt(x - 1, y, z) || solidAt(x, y, z + 1) || solidAt(x, y, z - 1)
    );
  }

  /** True when any column within one block holds a fluid at this height. */
  function wetNear(x: number, z: number, y: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -2; dy <= 1; dy++) {
          const name = nameAt(x + dx, y + dy, z + dz);
          if (name === "water" || name === "lava") return true;
        }
      }
    }
    return false;
  }

  /** The highest full-cube ground block of a column, ignoring vegetation. */
  function topOf(x: number, z: number, from: number): number | null {
    for (let y = Math.min(from, maxY); y >= minY; y--) {
      const id = stateAt(x, y, z);
      if (id === 0) continue;
      const name = nameAt(x, y, z);
      if (AIR.has(name)) continue;
      // Plants, snow, loose decor and tree canopy are not "the ground".
      if (name.endsWith("_leaves") || name.endsWith("_log") || name.endsWith("_wood")) continue;
      // A dirt path IS the ground — fifteen sixteenths tall with a solid flush
      // top, same as the SOLID_TOP carve-out in supportAt. Skipping it made
      // every road with worn shoulders read one block proud of ground that a
      // player stands on level with the lane.
      if (!stack.isFullCube(id) && !SOLID_TOP.test(name)) continue;
      return y;
    }
    return null;
  }

  return report(findings, examined);
}

/** Tally findings per rule, listing every rule so a clean world reports zeroes. */
function report(findings: readonly PhysicsFinding[], examined: number): PhysicsReport {
  const counts: Record<string, number> = {};
  for (const rule of PHYSICS_RULES) counts[rule] = 0;
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
  return { findings, counts, examined };
}

/* -------------------------------------------------------------------------- */
/* palette.registry / palette.biome                                            */
/* -------------------------------------------------------------------------- */

/** One `block_states` container as it sits in a section's NBT. */
interface RawPaletteEntry {
  readonly Name?: unknown;
  readonly Properties?: unknown;
}

/**
 * Check every palette entry of every section of every region file against the
 * pinned registry.
 *
 * This is the cheapest rule in the file and the one with the worst failure
 * mode. Every other rule here describes a world that is wrong to walk through;
 * this one describes a world the client will not open at all. A palette entry
 * naming a block that does not exist, or carrying a property that block does
 * not declare, is not a defect a player finds — it is a chunk the game rejects,
 * and on a bad day a `level.dat`/registry parse failure that presents to the
 * player as "world corrupted" with no way back in.
 *
 * It reads the region files directly rather than going through the chunk
 * adapter, because the property under test is what the *serializer wrote*, and
 * a readback through `prismarine-chunk` would launder any fault in it back
 * through the same table that produced it.
 *
 * The scan is unbounded in Y on purpose: `lintWorldPhysics`'s other rules work
 * a surface band, but an illegal state anywhere in the column — a cellar, a
 * tunnel, a cave — breaks the same chunk.
 */
async function lintPalettes(
  worldDir: string,
  stack: PrismarineStack,
): Promise<PhysicsFinding[]> {
  const findings: PhysicsFinding[] = [];
  // A world's distinct states number in the hundreds against millions of
  // blocks; caching the verdict keeps this a per-state check, not a per-entry one.
  const blockVerdicts = new Map<string, string | undefined>();
  const biomeVerdicts = new Map<string, boolean>();

  for (const file of await listRegionFiles(`${worldDir}/region`)) {
    const buffer = await readFile(file);
    for (const { chunkX, chunkZ, root } of readRegionChunksNbt(file, buffer)) {
      const sections = Array.isArray(root["sections"]) ? (root["sections"] as unknown[]) : [];
      for (const raw of sections) {
        const section = raw as { Y?: unknown; block_states?: unknown; biomes?: unknown };
        const sectionY = typeof section.Y === "number" ? section.Y : 0;
        // The section's own corner, so a finding points at a real place.
        const x = chunkX * 16;
        const y = sectionY * 16;
        const z = chunkZ * 16;

        const palette = (section.block_states as { palette?: unknown } | undefined)?.palette;
        if (Array.isArray(palette)) {
          for (const entry of palette as RawPaletteEntry[]) {
            const name = typeof entry.Name === "string" ? entry.Name : "";
            const props = normaliseProperties(entry.Properties);
            const key = `${name} ${Object.entries(props)
              .map(([k, v]) => `${k}=${v}`)
              .join(",")}`;
            let issue = blockVerdicts.get(key);
            if (!blockVerdicts.has(key)) {
              issue = name === "" ? "palette entry has no Name" : stack.blockStateIssue(name, props);
              blockVerdicts.set(key, issue);
            }
            if (issue !== undefined) {
              findings.push({
                rule: "palette.registry",
                x,
                y,
                z,
                block: describePaletteEntry(name, props),
                detail: `${issue} (section y=${sectionY} of chunk ${chunkX},${chunkZ})`,
              });
            }
          }
        }

        const biomes = (section.biomes as { palette?: unknown } | undefined)?.palette;
        if (Array.isArray(biomes)) {
          for (const biome of biomes as unknown[]) {
            const name = typeof biome === "string" ? biome : "";
            let known = biomeVerdicts.get(name);
            if (known === undefined) {
              known = name !== "" && stack.hasBiome(name);
              biomeVerdicts.set(name, known);
            }
            if (!known) {
              findings.push({
                rule: "palette.biome",
                x,
                y,
                z,
                block: name === "" ? "<unnamed biome>" : name,
                detail: `no such biome in ${stack.minecraftVersion} (section y=${sectionY} of chunk ${chunkX},${chunkZ})`,
              });
            }
          }
        }
      }
    }
  }
  return findings;
}

/** One block entity as it sits on disk: where it is and what type it claims. */
export interface PlacedBlockEntity {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The namespaced block-entity type from the compound's `id` field. */
  readonly id: string;
}

/**
 * Every block entity in a world's region files, in region/chunk order.
 *
 * Reads the Anvil container directly, like {@link lintPalettes}: the whole
 * point of the `blockentity.orphan` rule is to check what the writer put on
 * disk, so it may not go back through the writer's own in-memory table.
 */
export async function readBlockEntities(worldDir: string): Promise<PlacedBlockEntity[]> {
  const out: PlacedBlockEntity[] = [];
  for (const file of await listRegionFiles(`${worldDir}/region`)) {
    const buffer = await readFile(file);
    for (const { root } of readRegionChunksNbt(file, buffer)) {
      const list = root["block_entities"];
      if (!Array.isArray(list)) continue;
      for (const raw of list as Record<string, unknown>[]) {
        const id = typeof raw["id"] === "string" ? raw["id"] : "";
        out.push({
          x: Number(raw["x"] ?? 0),
          y: Number(raw["y"] ?? 0),
          z: Number(raw["z"] ?? 0),
          id: id === "" ? "<unnamed>" : id,
        });
      }
    }
  }
  return out;
}

/** Coerce an NBT `Properties` compound into the `string -> string` map the registry speaks. */
function normaliseProperties(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = String(raw);
  }
  return out;
}

function describePaletteEntry(name: string, props: Record<string, string>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return name === "" ? "<unnamed>" : name;
  return `${name}[${entries.map(([k, v]) => `${k}=${v}`).join(",")}]`;
}

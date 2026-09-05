/**
 * Furnishing an authored landmark's declared interiors (Phase 0 contract 2, v2).
 *
 * v1 shipped shells: a program wrote a mothership, a cathedral, a colossus, and
 * a player who found a way in found a hollow. v2 closes that without teaching
 * programs a furniture vocabulary — the program hollows the volume and *names*
 * it, and the building grammar's own fit-out puts the beds, tables, torches and
 * shelves in. That is deliberate: the fit-out is the code that already knows a
 * stair's `facing` is its backrest, that a hanging lantern at head height is a
 * wall across a narrow room, and that every prop must stand on something. A
 * program writing its own furniture would relearn all three, badly, in tokens.
 *
 * Two invariants this file owns:
 *
 * - **The program's geometry wins.** Every voxel the run wrote is occupied; the
 *   furnisher's writes are filtered against it, never merged over it.
 * - **Determinism.** The only randomness is `nodeSeed(worldSeed, nodePath, …)`
 *   salted with the instance index and the volume's index, exactly the way the
 *   rest of the program pass derives per-instance seeds.
 */

import type { InteriorVolume } from "@terrainist/spec/ir";
import {
  archetypeOfTags,
  assignMaterials,
  furnish,
  nodeSeed,
  pickTheme,
  streamSeed,
  styleOf,
  type LocalRect,
  type LocalVoxelOp,
} from "@terrainist/stdlib";

import type { StructureBlock } from "../structures/buildings.js";
import type { PrismarineStack } from "../emit/prismarine.js";
import type { ProgramRun } from "./run.js";
import type { ProgramSite } from "./place.js";
import { parseBlockString } from "../emit/blockstring.js";

/** Everything {@link furnishRunInteriors} reads. */
export interface InteriorFurnishInput {
  readonly run: ProgramRun;
  readonly site: ProgramSite;
  /**
   * World Y of the instance's node-local `y = 0`, **after seating** — the same
   * plane the pass lowers the run's own blocks against. Not `site.baseY`: a
   * program that declared `seatY` or was seated with `embed` has its shell
   * moved, and furniture that stayed on the site's plane would hang in the air
   * inside its own room.
   */
  readonly baseY: number;
  readonly stack: PrismarineStack;
  readonly worldSeed: bigint;
  readonly nodePath: string;
  readonly seedSalt?: string;
  /** The world's resolved material theme id; see {@link interiorVoxels}. */
  readonly themeId?: string;
}

/**
 * Furnish every interior one run declared, in world coordinates.
 *
 * Returns the furniture blocks only; the run's own blocks are lowered by the
 * pass and are untouched here. A run that declared nothing returns `[]`, which
 * is why an un-declaring program's output is byte-identical to v1's.
 */
export function furnishRunInteriors(input: InteriorFurnishInput): readonly StructureBlock[] {
  const blocks: StructureBlock[] = [];
  const voxels = interiorVoxels(input);
  for (const key of [...voxels.keys()].sort()) {
    const [lx, ly, lz] = key.split(",").map(Number) as [number, number, number];
    const parsed = parseBlockString(voxels.get(key) as string);
    const stateId = parsed === undefined ? undefined : input.stack.blockStateOf(parsed.name, parsed.props);
    // A prop the pinned registry does not know is dropped, not fatal: the
    // landmark itself is already standing, and a missing barrel is not a reason
    // to withdraw a cathedral.
    if (stateId === undefined) continue;
    blocks.push({
      x: input.site.footprint.x0 + lx,
      y: input.baseY + ly,
      z: input.site.footprint.z0 + lz,
      stateId,
    });
  }
  return blocks;
}

/**
 * The furniture as node-local `"x,y,z" -> block string`, before any site.
 *
 * The seam the physics gate wants: it emits a program's voxels into a scratch
 * world, and merging this map into them is how a *furnished* landmark gets
 * walked by the same rules the shell is.
 */
export function interiorVoxels(input: {
  readonly run: ProgramRun;
  readonly worldSeed: bigint;
  readonly nodePath: string;
  readonly seedSalt?: string;
  /**
   * The world's resolved material theme id.
   *
   * Absent, `pickTheme` deals from the seed alone — a different theme per
   * instance, agreeing with neither the houses outside nor the next landmark
   * over. Every other caller in the compiler passes the resolved id, and this
   * one omitting it was a live defect: a `white_quartz` monastery furnished
   * its shrine in whatever the seed happened to land on.
   */
  readonly themeId?: string;
}): Map<string, string> {
  const out = new Map<string, string>();
  const volumes = input.run.result?.interiors;
  if (volumes === undefined || volumes.length === 0) return out;
  const base = nodeSeed(
    input.worldSeed,
    input.nodePath,
    `${input.seedSalt ?? ""}#interiors:${input.run.index}`,
  );
  for (const [i, volume] of volumes.entries()) {
    for (const [key, block] of furnishOne(input.run, volume, i, streamSeed(base, `interior:${i}`), input.themeId)) {
      out.set(key, block);
    }
  }
  return out;
}

function furnishOne(
  run: ProgramRun,
  volume: InteriorVolume,
  index: number,
  seed: Uint8Array,
  themeId: string | undefined,
): ReadonlyMap<string, string> {
  const [x0, minY, z0] = volume.min;
  const [x1, maxY, z1] = volume.max;
  // The fit-out's y = 0 is the floor plane; the room's lowest standable cell is
  // y = 1. The program laid that floor one below `min.y`.
  const floorY = minY - 1;
  const openHeight = maxY - minY + 1;
  const storyHeight = openHeight + 1;
  const interior: LocalRect = { x0, z0, x1, z1 };

  /** What the program itself wrote, in fit-out-local coordinates. */
  const blockAt = (x: number, y: number, z: number): LocalVoxelOp | undefined => {
    const block = run.voxels.get(`${x},${floorY + y},${z}`);
    if (block === undefined) return undefined;
    return { x, y, z, block: bareName(block) };
  };

  // Only cells with a floor under them and air in them are room. This is the
  // whole of the "no floating furniture" guarantee: a prop can only land on a
  // cell the program itself gave a floor to.
  const floorCells: { x: number; z: number }[] = [];
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      if (blockAt(x, 0, z) === undefined) continue;
      if (blockAt(x, 1, z) !== undefined) continue;
      floorCells.push({ x, z });
    }
  }
  if (floorCells.length < 4) return EMPTY;

  // Last write wins, and the key is the cell — so the block list is a pure
  // function of the volume rather than of the order props happened to land in.
  const written = new Map<string, string>();
  const put = (
    x: number,
    y: number,
    z: number,
    block: string,
    props?: Record<string, string>,
  ): void => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return;
    if (y < 1 || y > openHeight) return;
    // The program's geometry wins, always.
    if (run.voxels.has(`${x},${floorY + y},${z}`)) return;
    written.set(`${x},${floorY + y},${z}`, blockString(block, props));
  };

  const materials = assignMaterials(pickTheme(seed, themeId), 1, seed)[0];
  if (materials === undefined) return EMPTY;

  furnish({
    put,
    style: styleOf(materials),
    archetype: archetypeOfTags(kindTags(volume.kind, index)),
    interior,
    // No door: a program's way in is its own business, and the fit-out's door
    // reserve exists to keep a prop out of a doorway it knows the position of.
    door: null,
    storyHeight,
    floors: 1,
    choice: seed,
    stairColumns: new Set<string>(),
    hearthColumns: new Set<string>(),
    size: [x1 - x0 + 1, storyHeight + 1, z1 - z0 + 1],
    wallTop: storyHeight,
    roofTop: storyHeight,
    floorCells,
    blockAt,
  });

  return written;
}

const EMPTY: ReadonlyMap<string, string> = new Map();

/**
 * A `kind` word, as tags the grammar's archetype table already understands.
 *
 * Unknown words fall through to `cottage`, which is the fit-out's own default
 * and furnishes a plain habitable room — the right answer for "some space
 * inside a landmark" when the author said nothing more.
 */
function kindTags(kind: string | undefined, index: number): readonly string[] {
  if (kind === undefined) return index === 0 ? ["hall"] : [];
  return kind.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

/** `"minecraft:oak_planks"` → `"oak_planks"`, for the fit-out's `blockAt`. */
function bareName(block: string): string {
  const colon = block.indexOf(":");
  const name = colon === -1 ? block : block.slice(colon + 1);
  const bracket = name.indexOf("[");
  return bracket === -1 ? name : name.slice(0, bracket);
}

/** The fit-out's `(name, props)` pair as a block string the registry reads. */
function blockString(block: string, props?: Record<string, string>): string {
  const name = block.includes(":") ? block : `minecraft:${block}`;
  const keys = props === undefined ? [] : Object.keys(props).sort();
  if (keys.length === 0) return name;
  return `${name}[${keys.map((k) => `${k}=${props?.[k] as string}`).join(",")}]`;
}

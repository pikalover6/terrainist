/**
 * Turning a finished program instance to face the way the document asked.
 *
 * A program is authored in its own envelope, in a frame that knows nothing
 * about the world: whatever front it has — a face, a prow, a door, a direction
 * of travel — it builds toward local **−Z (north)** and declares by publishing
 * a `front` anchor. This file is the other half of that bargain: the quarter
 * turn that takes local north to whichever cardinal the world wants.
 *
 * Three rules keep this honest.
 *
 * 1. **It happens outside the sandbox.** The run is executed in the local
 *    frame, hashed in the local frame, and only then rotated — so a program's
 *    `outputHash` stays a property of the program rather than of the world it
 *    lands in, and `verify.ts` never has to know this file exists.
 * 2. **It is a whole-quarter turn, in Minecraft's own sense of the word.** 90°
 *    here is exactly vanilla's `CLOCKWISE_90`: the coordinate map is
 *    `(x, z) → (−z, x)`, `facing` walks north → east → south → west, and the
 *    `rotation` property gains 4. That agreement is not decoration — it is why
 *    a rotated stair, rail or sign reads correctly in the client.
 * 3. **A rotation of 0 changes nothing at all, byte for byte.** Every function
 *    here short-circuits on it, and block strings are rewritten only when a
 *    property actually moves, so a world whose programs declare no front
 *    compiles to the blocks it always did.
 *
 * What is *not* rotated: the properties that are already relative to a block's
 * own facing (a stair's `shape`, a door's `hinge`, a chest's `type`, a bed's
 * `part`), which turn with it and would be turned twice; and the connection
 * states of fences, walls and panes, which the emit-side connection pass
 * recomputes from the finished neighbourhood (`emit/connections.ts`).
 */

import { connectiveKindOf } from "../emit/connections.js";
import type { HeightSampler, ProgramRun } from "./run.js";

/** A quarter turn, clockwise seen from above. Degrees, because that reads. */
export type ProgramRotation = 0 | 90 | 180 | 270;

/** The four, in the order everything here iterates them. */
export const PROGRAM_ROTATIONS: readonly ProgramRotation[] = [0, 90, 180, 270];

/** A horizontal direction, in Minecraft's spelling. */
export type Cardinal = "north" | "east" | "south" | "west";

/** Clockwise from above, which is the order `rotate` walks. */
const CARDINAL_CYCLE: readonly Cardinal[] = ["north", "east", "south", "west"];

/** True for a value this module is prepared to treat as a rotation. */
export function isProgramRotation(value: unknown): value is ProgramRotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

/** Quarter turns in a rotation: 0..3. */
function quarters(rotation: ProgramRotation): number {
  return rotation / 90;
}

/**
 * The rotation that takes a program's local front — **−Z, north** — to
 * `cardinal`.
 *
 * The whole facing feature is this function plus a direction: north is the
 * canonical front, so pointing it east is a quarter turn clockwise, and every
 * other answer follows.
 */
export function rotationFacing(cardinal: Cardinal): ProgramRotation {
  return (CARDINAL_CYCLE.indexOf(cardinal) * 90) as ProgramRotation;
}

/** Turn a cardinal `rotation` degrees clockwise. */
export function rotateCardinal(cardinal: Cardinal, rotation: ProgramRotation): Cardinal {
  const at = CARDINAL_CYCLE.indexOf(cardinal);
  /* c8 ignore next — the type admits nothing else. */
  if (at < 0) return cardinal;
  return CARDINAL_CYCLE[(at + quarters(rotation)) % 4] as Cardinal;
}

/**
 * The nearest cardinal to a bearing, or `undefined` when there is no bearing.
 *
 * The same quantization — and the same tie rule, X wins — the solver's
 * `facing` constraint already uses (`layout/cost.ts`'s `faceAngleTo`), because
 * two answers to "which way is that" in one compiler is one too many. A zero
 * delta is not a direction and says so, rather than silently reading as north.
 */
export function cardinalToward(dx: number, dz: number): Cardinal | undefined {
  if (dx === 0 && dz === 0) return undefined;
  if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? "east" : "west";
  return dz >= 0 ? "south" : "north";
}

/** The other way round — what `away_from` resolves through. */
export function oppositeCardinal(cardinal: Cardinal): Cardinal {
  return rotateCardinal(cardinal, 180);
}

/** `[w, h, d]` after the turn: the horizontal edges swap at 90° and 270°. */
export function rotatedEnvelope(
  envelope: readonly [number, number, number],
  rotation: ProgramRotation,
): readonly [number, number, number] {
  const [w, h, d] = envelope;
  return rotation === 90 || rotation === 270 ? [d, h, w] : [w, h, d];
}

/** The footprint edges after the turn. */
export function rotatedFootprint(
  w: number,
  d: number,
  rotation: ProgramRotation,
): readonly [number, number] {
  return rotation === 90 || rotation === 270 ? [d, w] : [w, d];
}

/**
 * A node-local point, turned inside its own envelope.
 *
 * `w` and `d` are the envelope's **unrotated** edges — the ones the program
 * declared and built against. The result is a point of the rotated envelope,
 * whose edges are {@link rotatedFootprint}, so the min corner stays the min
 * corner and the caller's `footprint.x0 + x` arithmetic is untouched.
 */
export function rotateLocalPoint(
  x: number,
  z: number,
  rotation: ProgramRotation,
  w: number,
  d: number,
): readonly [number, number] {
  switch (rotation) {
    case 90:
      return [d - 1 - z, x];
    case 180:
      return [w - 1 - x, d - 1 - z];
    case 270:
      return [z, w - 1 - x];
    default:
      return [x, z];
  }
}

/* -------------------------------------------------------------------------- */
/* block states                                                                */
/* -------------------------------------------------------------------------- */

/** Rail `shape` values that name a curve, and where a quarter turn sends them. */
const CURVE_CLOCKWISE: Readonly<Record<string, string>> = Object.freeze({
  north_east: "south_east",
  south_east: "south_west",
  south_west: "north_west",
  north_west: "north_east",
});

/** The straight rail pair. */
const STRAIGHT_CLOCKWISE: Readonly<Record<string, string>> = Object.freeze({
  north_south: "east_west",
  east_west: "north_south",
});

const CARDINALS = new Set<string>(CARDINAL_CYCLE);

/**
 * One block string, turned.
 *
 * Textual on purpose: the name is copied through exactly as the program wrote
 * it (`minecraft:` prefix or not), and the property list keeps its order, so a
 * block with nothing directional about it comes back as the *same string* and
 * a rotation of zero is provably a no-op.
 */
export function rotateBlockString(block: string, rotation: ProgramRotation): string {
  if (rotation === 0) return block;
  const open = block.indexOf("[");
  const close = block.lastIndexOf("]");
  // No properties, nothing to turn: a plain `minecraft:stone_bricks` is the
  // same block whichever way you look at it.
  if (open < 0 || close < open) return block;
  const name = block.slice(0, open).trim();
  const bare = (name.startsWith("minecraft:") ? name.slice("minecraft:".length) : name).trim();
  const body = block.slice(open + 1, close);
  if (body.trim().length === 0) return block;

  const pairs: [string, string][] = [];
  for (const pair of body.split(",")) {
    const eq = pair.indexOf("=");
    // A malformed property list is not this file's to repair: the pass resolves
    // the string against the registry a moment later and reports it there.
    if (eq < 0) return block;
    pairs.push([pair.slice(0, eq).trim(), pair.slice(eq + 1).trim()]);
  }

  // Fences, walls, panes and iron bars store their connections in exactly the
  // four properties this would otherwise turn — and the emit-side connection
  // pass recomputes those from the finished world, so turning them here would
  // be work undone twice.
  const connective = connectiveKindOf(bare);
  const turnsFaces = connective === undefined;

  const turned: [string, string][] = [];
  let changed = false;
  for (const [key, value] of pairs) {
    const next = rotateProperty(key, value, rotation, turnsFaces);
    if (next.key !== key || next.value !== value) changed = true;
    turned.push([next.key, next.value]);
  }
  if (!changed) return block;
  return `${name}[${turned.map(([k, v]) => `${k}=${v}`).join(",")}]${block.slice(close + 1)}`;
}

/** One property, turned. `key` may move as well as `value` (the face flags). */
function rotateProperty(
  key: string,
  value: string,
  rotation: ProgramRotation,
  turnsFaces: boolean,
): { readonly key: string; readonly value: string } {
  const same = { key, value };
  switch (key) {
    // `facing` is the workhorse — stairs, doors, furnaces, banners, heads, the
    // lot. `up` and `down` are invariant: a quarter turn about Y moves neither.
    case "facing":
      return CARDINALS.has(value)
        ? { key, value: rotateCardinal(value as Cardinal, rotation) }
        : same;
    // A pillar's axis. `y` is the axis being turned about, so it stays.
    case "axis":
      if (rotation === 180 || (value !== "x" && value !== "z")) return same;
      return { key, value: value === "x" ? "z" : "x" };
    // Signs, banners and skull rotations: sixteenths, and vanilla's own
    // `CLOCKWISE_90` adds four of them.
    case "rotation": {
      const at = Number.parseInt(value, 10);
      if (!Number.isInteger(at) || at < 0 || at > 15) return same;
      return { key, value: String((at + 4 * quarters(rotation)) % 16) };
    }
    // Rails, and rails alone: a stair's `shape` is relative to its own facing
    // (`inner_left` stays `inner_left` when the whole thing turns), which is
    // why this dispatches on the *value* rather than on the block name.
    case "shape":
      return { key, value: rotateShape(value, rotation) };
    default:
      break;
  }
  // The multi-face flags — vines, glow lichen, sculk veins, fire: four booleans
  // naming the sides the thing clings to. It is the **key** that turns and the
  // value that rides along, which is also what makes a partially-written state
  // (`vine[south=true]`, the rest left to the registry's defaults) come out
  // right rather than losing its one face.
  if (turnsFaces && CARDINALS.has(key)) {
    return { key: rotateCardinal(key as Cardinal, rotation), value };
  }
  return same;
}

/** A rail `shape`, turned; anything that is not one comes back untouched. */
function rotateShape(value: string, rotation: ProgramRotation): string {
  let out = value;
  for (let turn = 0; turn < quarters(rotation); turn++) {
    if (out.startsWith("ascending_")) {
      const direction = out.slice("ascending_".length);
      out = CARDINALS.has(direction)
        ? `ascending_${rotateCardinal(direction as Cardinal, 90)}`
        : out;
      continue;
    }
    out = STRAIGHT_CLOCKWISE[out] ?? CURVE_CLOCKWISE[out] ?? out;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* a whole run                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The ground under a rotated instance, as the **program** asks for it.
 *
 * `api.heightAt(x, z)` is a question in the program's own frame, and the
 * program's own frame is the unrotated one — so the question is turned before
 * it reaches the terrain. Without this a draped instance would conform itself
 * to a slope ninety degrees from the one it actually stands on, which is the
 * kind of defect that only shows up on a walk.
 */
export function rotatedHeightAt(
  sample: HeightSampler,
  rotation: ProgramRotation,
  envelope: readonly [number, number, number],
): HeightSampler {
  if (rotation === 0) return sample;
  const [w, , d] = envelope;
  return (x: number, z: number): number => {
    const [rx, rz] = rotateLocalPoint(x, z, rotation, w, d);
    return sample(rx, rz);
  };
}

/**
 * A finished run, turned into the frame the world will build it in.
 *
 * Everything the program published moves together — the voxels, the anchors
 * (the `front` one included, which is how the road approach follows the face
 * round), and the interior volumes the fit-out furnishes. What deliberately
 * does *not* move is `ops`, `opStream` and `outputHash`: those are the
 * program's identity, computed in the frame the program was written and
 * verified in, and a hash that changed with the world it landed in would pin
 * nothing at all.
 */
export function rotateRun(
  run: ProgramRun,
  rotation: ProgramRotation,
  envelope: readonly [number, number, number],
): ProgramRun {
  if (rotation === 0) return run;
  const [w, , d] = envelope;
  const voxels = new Map<string, string>();
  for (const [key, block] of run.voxels) {
    const [lx, ly, lz] = key.split(",").map(Number) as [number, number, number];
    const [rx, rz] = rotateLocalPoint(lx, lz, rotation, w, d);
    voxels.set(`${rx},${ly},${rz}`, rotateBlockString(block, rotation));
  }
  const result = run.result;
  if (result === undefined) return { ...run, voxels };

  let anchors: Record<string, readonly [number, number, number]> | undefined;
  if (result.anchors !== undefined) {
    anchors = {};
    for (const [name, point] of Object.entries(result.anchors)) {
      const [ax, ay, az] = point;
      const [rx, rz] = rotateLocalPoint(ax, az, rotation, w, d);
      anchors[name] = [rx, ay, rz];
    }
  }

  const interiors = result.interiors?.map((volume) => {
    const [x0, z0] = rotateLocalPoint(volume.min[0], volume.min[2], rotation, w, d);
    const [x1, z1] = rotateLocalPoint(volume.max[0], volume.max[2], rotation, w, d);
    return {
      ...volume,
      min: [Math.min(x0, x1), volume.min[1], Math.min(z0, z1)] as [number, number, number],
      max: [Math.max(x0, x1), volume.max[1], Math.max(z0, z1)] as [number, number, number],
    };
  });

  return {
    ...run,
    voxels,
    result: {
      ...result,
      ...(anchors === undefined ? {} : { anchors }),
      ...(interiors === undefined ? {} : { interiors }),
    },
  };
}

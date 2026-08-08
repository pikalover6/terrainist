/**
 * The parts → blockstate mapping (§3.2).
 *
 * One rule governs all of it:
 *
 * > **The palette symbol decides the block; the program's own block set decides
 * > the orientation.** Nothing else may look at the world to decide a state.
 *
 * That is why this module is a pure function of a block list plus a set of
 * resolved state ids: it can be unit-tested exhaustively, and it can never
 * develop a dependency on the plan, the chunk or the traversal order.
 *
 * WP-A ships and tests the mapping; `terrain/emit.ts` still writes the legacy
 * two-part mapping for the two legacy programs (which emit only `log` and
 * `leaves`, for which this function is byte-identical to it under
 * `LEAF_STATE_POLICY === "legacy"`). WP-B wires the seam when parts beyond
 * those two can actually be produced.
 */

import { WOOD_PARTS, type FloraBlock, type FloraPart } from "./types.js";

/**
 * The block-state codec the mapping needs — structurally typed, so this module
 * does not import the emit stack.
 */
export interface FloraStateCodec {
  blockStateProps(
    stateId: number,
  ): { readonly name: string; readonly props: Record<string, string> } | undefined;
  blockStateOf(name: string, properties: Readonly<Record<string, string>>): number | undefined;
}

/** Palette-resolved state ids, one per part a program may emit. */
export interface FloraStates {
  /** `log`, and the default for `branch` and `root`. */
  readonly log: number;
  readonly leaves: number;
  /** Dead limbs (a stripped log); defaults to {@link FloraStates.log}. */
  readonly branch?: number;
  readonly root?: number;
  readonly stem?: number;
  readonly cap?: number;
  readonly hanging?: number;
  readonly deco?: number;
}

/** One block of a plant, resolved to an absolute-ready offset and a state id. */
export interface EmittedFloraBlock {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly stateId: number;
}

/** What the mapping produced, and what it had to refuse. */
export interface FloraEmission {
  readonly blocks: readonly EmittedFloraBlock[];
  /** `hanging` blocks dropped for want of support above (§3.2). */
  readonly droppedHanging: number;
  /** `deco` blocks dropped for want of a wood neighbour to face (§3.2). */
  readonly droppedDeco: number;
  /** Canopy blocks the leaf BFS could not reach within 6 — see §9.1 and law 2. */
  readonly unreachableCanopy: number;
}

/**
 * Leaf state policy (§9.1).
 *
 * `"legacy"` writes the palette's default leaf state, which in the pinned
 * 1.21.11 table is `{distance: 7, persistent: false}` — vanilla's *decaying*
 * state. That is a defect (a wood a player walks into loses a scatter of canopy
 * and then stabilises), but fixing it moves every world that has a tree, so the
 * fix lands behind this constant and stays off until Kai has walked a world
 * compiled both ways.
 *
 * `"computed"` writes `distance` from a breadth-first search over the plant's
 * own wood, capped at 6, with `persistent = false`; a canopy block the search
 * cannot reach is written `persistent = true` and **counted**, and law 2's test
 * asserts that count is zero for every program at every envelope corner.
 */
export type LeafStatePolicy = "legacy" | "computed";

/**
 * The active policy.
 *
 * **Flipped to `"computed"` 2026-08-07 on Kai's go** — he saw live leaf decay
 * on the old-growth walk, which was the confirmation §9.1 was waiting for.
 * Every emitted leaf now carries a BFS `distance` with `persistent = false`;
 * canopy the search cannot reach within 6 is written `persistent = true` and
 * counted (law 2's frozen mega-spruce whorl exception, §3.3). The world diff
 * was measured first: on every fixture the move is a `*_leaves` state change
 * only — same block, different `distance`/`persistent`.
 */
export const LEAF_STATE_POLICY: LeafStatePolicy = "computed";

/** The maximum `distance` a non-persistent leaf may carry in vanilla. */
export const MAX_LEAF_DISTANCE = 6;

const FACES: readonly (readonly [string, number, number, number])[] = [
  ["down", 0, -1, 0],
  ["up", 0, 1, 0],
  ["north", 0, 0, -1],
  ["south", 0, 0, 1],
  ["west", -1, 0, 0],
  ["east", 1, 0, 0],
];

function key(dx: number, dy: number, dz: number): string {
  return `${dx},${dy},${dz}`;
}

/** Re-encode a state with overridden properties, falling back to the original. */
function withProps(
  codec: FloraStateCodec,
  stateId: number,
  overrides: Readonly<Record<string, string>>,
): number {
  const decoded = codec.blockStateProps(stateId);
  if (decoded === undefined) return stateId;
  const props: Record<string, string> = { ...decoded.props };
  let touched = false;
  for (const [name, value] of Object.entries(overrides)) {
    // Only set properties the block actually declares: a `vine` has `up`, a
    // `glow_lichen` has `up`, and a shroomlight has neither.
    if (Object.hasOwn(props, name)) {
      props[name] = value;
      touched = true;
    }
  }
  if (!touched) return stateId;
  return codec.blockStateOf(decoded.name, props) ?? stateId;
}

/**
 * Leaf `distance` per plant, by BFS from the plant's own wood.
 *
 * Returns the distance map and the canopy blocks it could not reach. Wood
 * blocks seed the frontier at distance 0; a leaf adjacent to wood is 1, which
 * is vanilla's own convention.
 */
export function leafDistances(blocks: readonly FloraBlock[]): {
  readonly distance: ReadonlyMap<string, number>;
  readonly unreachable: number;
} {
  const canopy = new Set<string>();
  const distance = new Map<string, number>();
  let frontier: FloraBlock[] = [];
  for (const b of blocks) {
    if (WOOD_PARTS.has(b.part)) {
      const k = key(b.dx, b.dy, b.dz);
      if (!distance.has(k)) {
        distance.set(k, 0);
        frontier.push(b);
      }
    } else if (b.part === "leaves") {
      canopy.add(key(b.dx, b.dy, b.dz));
    }
  }
  let d = 0;
  while (frontier.length > 0 && d < MAX_LEAF_DISTANCE) {
    d += 1;
    const next: FloraBlock[] = [];
    for (const b of frontier) {
      for (const [, ox, oy, oz] of FACES) {
        const nx = b.dx + ox;
        const ny = b.dy + oy;
        const nz = b.dz + oz;
        const k = key(nx, ny, nz);
        if (!canopy.has(k) || distance.has(k)) continue;
        distance.set(k, d);
        next.push({ dx: nx, dy: ny, dz: nz, part: "leaves" });
      }
    }
    frontier = next;
  }
  let unreachable = 0;
  for (const k of canopy) if (!distance.has(k)) unreachable += 1;
  return { distance, unreachable };
}

/** The parts a `hanging` block may attach to (§3.2, amended 2026-08-08). */
const HANGING_SUPPORT_PARTS: ReadonlySet<FloraPart> = new Set<FloraPart>([
  "log",
  "branch",
  "root",
  "stem",
  "leaves",
  "cap",
]);

const HORIZONTAL_FACES = FACES.filter(([face]) => face !== "up" && face !== "down");

/**
 * Attachment faces per `hanging` block (§3.2, amended 2026-08-08).
 *
 * Vanilla's `vine` carries five booleans, each meaning *"attached to the block
 * in that direction"*, and each true face draws a panel on that side of the
 * cube. Writing `up=true` universally — which is what this module did until
 * 2026-08-08 — draws a horizontal ceiling panel for every vine, so a curtain
 * running down beside a giant's trunk rendered as a stack of flat plates at
 * odd angles instead of a sheet against the wood (Kai's walk, `oldgrowth_vale-2`).
 *
 * The derivation reads the plant's own block set only (the §3.2 law):
 *
 * 1. every horizontal 6-neighbour that is a support part of the same plant
 *    gets its face set `true` — the sheet lies against the wood;
 * 2. `up=true` only when the block **directly above** is a support part, i.e.
 *    the vine genuinely hangs off a ceiling;
 * 3. otherwise the block inherits the faces of the `hanging` block directly
 *    above it — vanilla's own chain rule, so a strand keeps hanging off
 *    whatever the top of the strand caught, plus any wood it passes;
 * 4. a block that ends with no face at all has no deducible support and is
 *    **dropped**, as before.
 *
 * Blocks are resolved top-down so rule 3 always sees a settled parent.
 */
export function hangingFaces(
  blocks: readonly FloraBlock[],
): ReadonlyMap<string, Readonly<Record<string, string>>> {
  const occupied = new Map<string, FloraPart>();
  for (const b of blocks) occupied.set(key(b.dx, b.dy, b.dz), b.part);
  const hanging = blocks.filter((b) => b.part === "hanging").sort((a, b) => b.dy - a.dy);
  const faces = new Map<string, Readonly<Record<string, string>>>();
  for (const b of hanging) {
    const on = new Set<string>();
    for (const [face, ox, oy, oz] of HORIZONTAL_FACES) {
      const n = occupied.get(key(b.dx + ox, b.dy + oy, b.dz + oz));
      if (n !== undefined && HANGING_SUPPORT_PARTS.has(n)) on.add(face);
    }
    const aboveKey = key(b.dx, b.dy + 1, b.dz);
    const above = occupied.get(aboveKey);
    if (above !== undefined && HANGING_SUPPORT_PARTS.has(above)) {
      on.add("up");
    } else if (above === "hanging") {
      const parent = faces.get(aboveKey);
      // A dropped parent hands down nothing; the chain ends with it.
      if (parent !== undefined) {
        for (const [face, value] of Object.entries(parent)) if (value === "true") on.add(face);
      }
    }
    if (on.size === 0) continue; // dropped: no deducible support
    const props: Record<string, string> = {};
    for (const [face] of FACES) props[face] = on.has(face) ? "true" : "false";
    faces.set(key(b.dx, b.dy, b.dz), Object.freeze(props));
  }
  return faces;
}

function baseStateFor(part: FloraPart, states: FloraStates): number | undefined {
  switch (part) {
    case "log":
      return states.log;
    case "branch":
      // Live limbs are trunk wood; only a *dead* limb takes the stripped log.
      return states.log;
    case "root":
      return states.root ?? states.log;
    case "leaves":
      return states.leaves;
    case "stem":
      return states.stem;
    case "cap":
      return states.cap;
    case "hanging":
      return states.hanging;
    case "deco":
      return states.deco;
  }
}

/**
 * Map one plant's parts onto block states.
 *
 * A placement that resolves no symbol for a part its program emits is a
 * compiler bug, not a document error, so an unresolved part throws rather than
 * silently vanishing.
 */
export function emitFloraBlocks(
  blocks: readonly FloraBlock[],
  states: FloraStates,
  codec: FloraStateCodec,
  policy: LeafStatePolicy = LEAF_STATE_POLICY,
): FloraEmission {
  const occupied = new Map<string, FloraPart>();
  for (const b of blocks) occupied.set(key(b.dx, b.dy, b.dz), b.part);

  const leaf = policy === "computed" ? leafDistances(blocks) : undefined;
  const faces = hangingFaces(blocks);
  const out: EmittedFloraBlock[] = [];
  let droppedHanging = 0;
  let droppedDeco = 0;

  for (const b of blocks) {
    const base = baseStateFor(b.part, states);
    if (base === undefined) {
      throw new Error(`flora: no palette state resolved for part "${b.part}"`);
    }
    let stateId = base;
    switch (b.part) {
      case "branch":
        stateId = withProps(codec, b.dead === true ? (states.branch ?? base) : base, {
          axis: b.axis ?? "y",
        });
        break;
      case "root":
        stateId = withProps(codec, base, { axis: "y" });
        break;
      case "leaves":
        if (leaf !== undefined) {
          const d = leaf.distance.get(key(b.dx, b.dy, b.dz));
          stateId =
            d === undefined
              ? withProps(codec, base, { persistent: "true" })
              : withProps(codec, base, {
                  distance: String(Math.max(1, Math.min(MAX_LEAF_DISTANCE, d))),
                  persistent: "false",
                });
        }
        break;
      case "stem":
      case "cap": {
        // Vanilla's six booleans: a face shows cap texture when nothing of the
        // same plant sits against it, and pore texture when something does.
        // "Outward" is computable from the block set alone, which is what makes
        // a giant mushroom read as a mushroom rather than a red cube pile.
        const props: Record<string, string> = {};
        for (const [face, ox, oy, oz] of FACES) {
          const neighbour = occupied.get(key(b.dx + ox, b.dy + oy, b.dz + oz));
          props[face] = neighbour === "stem" || neighbour === "cap" ? "false" : "true";
        }
        stateId = withProps(codec, base, props);
        break;
      }
      case "hanging": {
        // Never emitted unsupported: a curtain clipped from above degrades to a
        // shorter curtain, not to a floating strand.
        const props = faces.get(key(b.dx, b.dy, b.dz));
        if (props === undefined) {
          droppedHanging += 1;
          continue;
        }
        stateId = withProps(codec, base, props);
        break;
      }
      case "deco": {
        const decoded = codec.blockStateProps(base);
        if (decoded !== undefined && Object.hasOwn(decoded.props, "facing")) {
          let facing: string | undefined;
          for (const [face, ox, oy, oz] of FACES) {
            const neighbour = occupied.get(key(b.dx + ox, b.dy + oy, b.dz + oz));
            if (neighbour !== undefined && WOOD_PARTS.has(neighbour)) {
              // `facing` names the direction the block's *back* is against, so
              // the block faces away from its support.
              facing = OPPOSITE[face] as string;
              break;
            }
          }
          if (facing === undefined) {
            droppedDeco += 1;
            continue;
          }
          stateId = withProps(codec, base, { facing });
        }
        break;
      }
      default:
        break;
    }
    out.push({ dx: b.dx, dy: b.dy, dz: b.dz, stateId });
  }

  return {
    blocks: out,
    droppedHanging,
    droppedDeco,
    unreachableCanopy: leaf?.unreachable ?? 0,
  };
}

const OPPOSITE: Readonly<Record<string, string>> = Object.freeze({
  up: "down",
  down: "up",
  north: "south",
  south: "north",
  east: "west",
  west: "east",
});

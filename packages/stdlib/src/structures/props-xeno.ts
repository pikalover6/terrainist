/**
 * `prop.place@0` — the alien & sci-fi pack's organic props (§3.4).
 *
 * Two props at opposite ends of the size table, and they are a pair on
 * purpose: the **bio-pod cluster** is the pack's saturation piece, cheap
 * enough that a district can carry twenty of them, and the **derelict walker**
 * is its one-per-street landmark. Between them they say the two things a
 * street corner has to say for battery P2 and P4 to read — *something laid
 * eggs here* and *something enormous lost here*.
 *
 * The contract is `props.ts`'s, unchanged, and the leaf discipline is
 * `props-classical.ts`'s: **types** are imported from `props.ts` and no values
 * at all, so the one edge `props.ts` → this file cannot become a cycle at
 * module-initialisation time. Node-local coordinates, `y = 0` is the base
 * plane, block *names* with a property map, every op inside the declared box
 * so `rotateOps` needs no special case.
 *
 * The lessons this file is written against, all of them somebody else's scars:
 *
 * 1. **Support closure.** Every block rests on the base plane or on another of
 *    this prop's own blocks. The mech's hull is one contiguous mass and every
 *    limb segment meets it, so nothing anywhere has six air faces.
 * 2. **No sign blocks**, no `chain` (not in the pinned 1.21.11 table), no open
 *    fluids, and **no lit fire** — the walker is a wreck, and a wreck that is
 *    still burning is a different prop.
 * 3. **A trapdoor is the cheapest hinge in the game.** The walker's sprung
 *    hull plates are `iron_trapdoor`s with `open=true`, each one hung on a
 *    hull block that is actually there — which is both the read and the
 *    support argument.
 * 4. **Seeded, never positional.** Unlike a building fit-out, a prop *does*
 *    get an RNG (`ctx.rng`), so the pod huddle and the mech's scarring are
 *    drawn from named streams of the node seed. Same seed, same wreck,
 *    forever.
 */

import type { LocalVoxelOp } from "./core.js";
import { definePropDescriptors } from "./descriptor.js";
import type { PropBase, PropGenerator, PropMeta } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/** Every prop this file builds, in catalog order. */
export const XENO_PROP_NAMES = ["bio_pod_cluster", "derelict_mech"] as const;

/** One of the props this file builds. */
export type XenoPropName = (typeof XENO_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isXenoProp(name: string): name is XenoPropName {
  return (XENO_PROP_NAMES as readonly string[]).includes(name);
}


/* -------------------------------------------------------------------------- */
/* the hive's own materials                                                    */
/* -------------------------------------------------------------------------- */

/** The pod's shell. */
const POD_SHELL = "nether_wart_block";
/** The other strain, so a huddle is never one flat colour. */
const POD_SHELL_ALT = "warped_wart_block";
/** What is inside a pod, and the only reason it reads at fifty blocks. */
const POD_CORE = "shroomlight";
/** The stain a pod leaves under it. */
const STAIN = "sculk";
/** The other stain — warmer, and what the ground turns where the pods split. */
const STAIN_WARM = "crimson_nylium";

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The pod cluster's plan — deliberately small: this prop is placed in tens. */
const POD_SPAN = 7;
/** The tallest a pod stands over the stain. */
const POD_HEIGHT = 3;

/** The walker's length along z — the run its silhouette is measured by. */
const MECH_LENGTH = 23;
/** The walker's width across the hull, thrown legs included. */
const MECH_WIDTH = 11;
/** The walker's height where the hull is deepest, canopy included. */
const MECH_HEIGHT = 5;

/** The declared box of one of this file's props, before it is generated. */
function xenoPropFootprint(prop: XenoPropName): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  if (prop === "derelict_mech") {
    return { size: [MECH_WIDTH, MECH_HEIGHT, MECH_LENGTH], minY: 0, base: "ground" };
  }
  return { size: [POD_SPAN, POD_HEIGHT, POD_SPAN], minY: 0, base: "ground" };
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: XenoPropName): PropMeta {
  const foot = xenoPropFootprint(prop);
  return {
    prop: prop as PropMeta["prop"],
    size: foot.size,
    minY: foot.minY,
    base: foot.base,
    piles: [],
  };
}

/** The empty op list every generator returns; `generateProp` reads the map. */
const NO_OPS: LocalVoxelOp[] = [];

/* -------------------------------------------------------------------------- */
/* the bio-pod cluster                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `bio_pod_cluster` — glowing egg pods in a huddle, two of them split open.
 *
 * **Built for double-digit counts**, which is the curator's note and the whole
 * design constraint: a seven-across box, three courses tall, a couple of dozen
 * blocks. A district can carry twenty of these on the same budget one derelict
 * walker costs, and twenty is what makes a farm town read as *infested*
 * rather than as *visited*.
 *
 * The three moves, in the order they are written:
 *
 * 1. **the stain** — an irregular crust in the base plane under the huddle,
 *    sculk mostly, going warm where the pods split. The stain is what stops
 *    the pods reading as ornaments set down on grass;
 * 2. **the closed pods** — a shell block with a lit head on it, which is the
 *    silhouette: a two-block egg that glows at the top;
 * 3. **the two split ones** — the shell peeled back into four stairs round an
 *    exposed core, so the huddle has a story in it. Exactly two, always: one
 *    is an accident and three is a pattern.
 *
 * Positions come from a seeded stream, so the same node gives the same huddle
 * forever and two clusters twenty blocks apart are different huddles.
 */
const bioPodCluster: PropGenerator = ({ put, rng }) => {
  const draw = rng("bio_pod");
  const mid = (POD_SPAN - 1) >> 1;

  // --- the pods -------------------------------------------------------------
  // A huddle, not a grid: candidate cells are drawn one at a time and rejected
  // when they touch a pod already placed, so the pods cluster without ever
  // fusing into a wall.
  // The candidate cells are **enumerated and shuffled**, not sampled: rejection
  // sampling on a diamond this small spends most of its draws on cells it has
  // already taken, and the first version of this generator duly produced
  // huddles of two. A Fisher-Yates over the legal set gives a full huddle every
  // time and costs one draw per cell.
  //
  // Legal means the stain below is guaranteed: inside the crust's radius, or
  // on one of its four axis extremes, which are the cells the stain always
  // writes. A pod whose base plane came out unstained would be an egg standing
  // on air.
  const candidates: { x: number; z: number }[] = [];
  for (let z = 0; z < POD_SPAN; z++) {
    for (let x = 0; x < POD_SPAN; x++) {
      const d = Math.abs(x - mid) + Math.abs(z - mid);
      if (d < mid || (d === mid && (x === mid || z === mid))) candidates.push({ x, z });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = draw.int(0, i);
    const tmp = candidates[i] as { x: number; z: number };
    candidates[i] = candidates[j] as { x: number; z: number };
    candidates[j] = tmp;
  }
  const pods: { x: number; z: number }[] = [];
  for (const cell of candidates) {
    if (pods.length >= 5) break;
    if (pods.some((p) => Math.abs(p.x - cell.x) <= 1 && Math.abs(p.z - cell.z) <= 1)) continue;
    pods.push(cell);
  }
  // Exactly two split open — the curator's note, and the right number: one is
  // an accident and three is a pattern. They are the last two of the shuffled
  // order, which keeps the choice inside the same stream.
  const splitFrom = Math.max(1, pods.length - 2);

  // --- the stain ------------------------------------------------------------
  // A diamond crust reaching the edge of the declared box on all four axes,
  // nibbled at the diagonals so it never reads as a drawn shape. The four
  // axis-extreme cells are **always** written, and deliberately: the prop
  // catalog's "uses the footprint it claims" rule wants a prop to touch all
  // four sides of the box it reserved, and a seeded blob that sometimes did
  // not would be a footprint that changed with the seed.
  for (let z = 0; z < POD_SPAN; z++) {
    for (let x = 0; x < POD_SPAN; x++) {
      const d = Math.abs(x - mid) + Math.abs(z - mid);
      if (d > mid) continue;
      const onAxis = x === mid || z === mid;
      if (d === mid && !onAxis && draw.int(0, 2) === 0) continue;
      const touching = pods.some((p) => Math.abs(p.x - x) + Math.abs(p.z - z) <= 1);
      put(x, 0, z, touching && draw.int(0, 1) === 0 ? STAIN_WARM : STAIN);
    }
  }

  // --- the pods themselves --------------------------------------------------
  for (const [i, pod] of pods.entries()) {
    const shell = i % 2 === 0 ? POD_SHELL : POD_SHELL_ALT;
    if (i < splitFrom) {
      // Closed: a shell with a lit head. Two blocks is the whole silhouette.
      put(pod.x, 1, pod.z, shell);
      put(pod.x, 2, pod.z, POD_CORE);
      continue;
    }
    // Split open: the core exposed at the foot, the shell peeled back round it
    // as four stairs, each one standing on the stain.
    put(pod.x, 1, pod.z, POD_CORE);
    for (const [dx, dz, facing] of [
      [1, 0, "west"],
      [-1, 0, "east"],
      [0, 1, "north"],
      [0, -1, "south"],
    ] as const) {
      const x = pod.x + dx;
      const z = pod.z + dz;
      if (x < 0 || x >= POD_SPAN || z < 0 || z >= POD_SPAN) continue;
      put(x, 0, z, STAIN_WARM);
      put(x, 1, z, `${shell === POD_SHELL ? "crimson" : "warped"}_stairs`, {
        facing,
        half: "bottom",
        shape: "straight",
        waterlogged: "false",
      });
    }
  }

  return { ops: NO_OPS, meta: metaOf("bio_pod_cluster") };
};

/* -------------------------------------------------------------------------- */
/* the derelict walker                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `derelict_mech` — a fallen machine on its side, one leg folded under it.
 *
 * The hardest icon in this half, because a walking machine is *read by its
 * legs* and a fallen one has lost the pose that made them legible. So the
 * silhouette is built out of four things a walker can name from the ground,
 * in descending order of how much of the budget they get:
 *
 * 1. **the hull**, lying along z: a long tapering mass three to five wide,
 *    deepest amidships, narrowing to a shoulder at the near end and a stern at
 *    the far one. Solid throughout — a hollow wreck is a wreck with holes in
 *    its support closure;
 * 2. **the cockpit, dark**: a tinted-glass canopy set into the shoulder with a
 *    dead lamp behind it. `tinted_glass` rather than any of the glow blocks is
 *    the entire point of the note — the cockpit is the one part of this thing
 *    that is *not* lit;
 * 3. **one leg folded under, one thrown out**: the folded one is a two-segment
 *    limb tucked against the hull's low flank, the thrown one is a longer
 *    limb reaching out across the ground with a knee standing proud of it. The
 *    asymmetry is the whole read: two legs the same way is a chassis, one
 *    under and one out is a *fall*;
 * 4. **the hull plates open**: sprung `iron_trapdoor`s along the upper flank,
 *    each hung on a hull block, with moss and copper showing through the gaps
 *    where the ruin has been out in the weather — the P4 half of the pack's
 *    brief, said in two blocks.
 *
 * Everything asymmetric is drawn from a named stream of the node seed, and the
 * pose (which flank folds) with it, so two wrecks in one world fell
 * differently and one wreck fell the same way forever.
 */
const derelictMech: PropGenerator = ({ put, palette, rng }) => {
  const draw = rng("derelict_mech");
  const plate = palette.stoneAccent;
  const frame = palette.stone;
  const mx = (MECH_WIDTH - 1) >> 1;
  /** Which flank the machine came down on. */
  const fell = draw.int(0, 1) === 0 ? -1 : 1;

  /**
   * The hull's half-width at a station along its length.
   *
   * Deepest amidships and tapering both ways — integer throughout, and never a
   * curve anybody has to trust a library for.
   */
  const beam = (z: number): number => {
    const from = Math.min(z, MECH_LENGTH - 1 - z);
    return from >= 7 ? 3 : from >= 3 ? 2 : 1;
  };
  /** How tall the hull stands at a station. */
  const rise = (z: number): number => {
    const from = Math.min(z, MECH_LENGTH - 1 - z);
    return from >= 5 ? 4 : from >= 2 ? 3 : 1;
  };

  // --- the hull -------------------------------------------------------------
  for (let z = 0; z < MECH_LENGTH; z++) {
    const b = beam(z);
    const r = rise(z);
    for (let y = 0; y <= r; y++) {
      for (let dx = -b; dx <= b; dx++) {
        const x = mx + dx;
        if (x < 0 || x >= MECH_WIDTH) continue;
        // The skin: plate mostly, frame where the ribs run, moss and copper
        // where the weather has been at it.
        const roll = draw.int(0, 11);
        const block =
          roll === 0 ? "moss_block" : roll === 1 ? "waxed_copper_block" : roll <= 4 ? frame : plate;
        put(x, y, z, block);
      }
    }
  }

  // --- the cockpit, dark ----------------------------------------------------
  // At the nose, set into the hull so the canopy is framed rather than stuck
  // on. `tinted_glass` and an UNLIT lamp behind it: this is the one part of
  // the machine the note insists is dark.
  const canopyZ = 3;
  for (let dx = -1; dx <= 1; dx++) {
    const x = mx + dx;
    if (x < 0 || x >= MECH_WIDTH) continue;
    put(x, 2, canopyZ, "tinted_glass");
  }
  put(mx, 2, canopyZ + 1, "redstone_lamp", { lit: "false" });
  put(mx, 3, canopyZ, "tinted_glass");

  // --- the legs -------------------------------------------------------------
  // The folded one: tucked under the hull on the flank it came down on, two
  // short segments, every block of it touching the hull or the segment before.
  const foldZ = MECH_LENGTH - 8;
  for (let i = 1; i <= 2; i++) {
    const x = mx + fell * (1 + i);
    if (x < 0 || x >= MECH_WIDTH) continue;
    put(x, 0, foldZ, frame);
    put(x, 0, foldZ + 1, frame);
    if (i === 2) put(x, 1, foldZ, frame);
  }
  // The thrown one: out across the ground on the other flank, with a knee, and
  // reaching the very edge of the declared box — a limb that stopped one cell
  // short would be ground the placer reserved and nothing ever stood on.
  const throwZ = MECH_LENGTH - 7;
  const reach = mx;
  for (let i = 1; i <= reach; i++) {
    const x = mx - fell * i;
    if (x < 0 || x >= MECH_WIDTH) continue;
    put(x, 0, throwZ, frame);
    // The knee stands proud halfway out, which is what makes a line of blocks
    // read as a limb rather than as a girder.
    if (i === 2) {
      put(x, 1, throwZ, plate);
      put(x, 2, throwZ, frame);
    }
    if (i >= 3) put(x, 0, throwZ + 1, plate);
  }

  // --- the hull plates, open ------------------------------------------------
  // Sprung along the upper flank, each on a hull block that exists: the flank
  // the machine did NOT come down on, because a plate under the wreck would be
  // pinned shut.
  const plateX = mx - fell;
  for (let z = 6; z < MECH_LENGTH - 5; z += 3) {
    if (plateX < 0 || plateX >= MECH_WIDTH) break;
    const y = Math.min(rise(z), 3);
    put(plateX, y, z, "iron_trapdoor", {
      facing: fell === 1 ? "west" : "east",
      half: "top",
      open: "true",
      powered: "false",
      waterlogged: "false",
    });
    // What shows through the opened plate.
    put(mx, y, z, draw.int(0, 1) === 0 ? "waxed_copper_block" : "moss_block");
  }

  // --- the debris ------------------------------------------------------------
  // Shed plating either side of the wreck, in the base plane. Its stations are
  // FIXED and its blocks are drawn: the pose flips with the seed, so the box
  // has to be filled by something that does not — the prop catalog's
  // "changes only dressing, never the footprint" rule, met head on.
  for (const z of [4, 10, 16, MECH_LENGTH - 3]) {
    for (const x of [0, MECH_WIDTH - 1]) {
      put(x, 0, z, draw.int(0, 2) === 0 ? "moss_block" : plate);
    }
  }

  return { ops: NO_OPS, meta: metaOf("derelict_mech") };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/** Name → generator, spread into `PROP_GENERATORS` by `props.ts`. */
const XENO_PROP_GENERATORS: Readonly<Record<XenoPropName, PropGenerator>> = Object.freeze({
  bio_pod_cluster: bioPodCluster,
  derelict_mech: derelictMech,
});

/**
 * Dev-world exhibit rows for this pack's organic props, in the shape
 * `exhibits/props.ts` spreads.
 *
 * It lives here rather than compiler-side for `props-wayside.ts`'s reason:
 * `exhibits/props.ts` is shared ground between parallel tracks, and registering
 * a wave there should be one import and one spread. **Nothing consumes it
 * yet** — the pack's exhibit is the orchestrator's, built once both halves of
 * §3.4 have landed — but it is the plan that half wants, and it is what makes
 * the compiler's `unsweptProps()` blind spot close in one line.
 *
 * Both yaws are shown for the walker, because it is the most asymmetric prop
 * this pack ships along one axis and a rotation that failed to take would be
 * invisible at yaw 0. The huddle is shown three times over, because the entry
 * is *for* being seen in numbers.
 */
export const XENO_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly {
    readonly prop: XenoPropName;
    readonly params: Record<string, unknown>;
  }[];
}[] = Object.freeze([
  {
    row: "xeno_hive",
    water: false,
    cells: [
      { prop: "bio_pod_cluster", params: { yaw: 0 } },
      { prop: "bio_pod_cluster", params: { yaw: 90 } },
      { prop: "bio_pod_cluster", params: { yaw: 180 } },
      { prop: "derelict_mech", params: { yaw: 0 } },
      { prop: "derelict_mech", params: { yaw: 90 } },
    ],
  },
]);

/**
 * Ordered prop descriptors for this pack, delegating to existing handles.
 *
 * Footprint delegates to {@link xenoPropFootprint}; generator is the leaf
 * {@link XENO_PROP_GENERATORS} handle. Preserves {@link XENO_PROP_NAMES}
 * order.
 */
export const XENO_PROP_DESCRIPTORS = definePropDescriptors(XENO_PROP_NAMES, {
  footprint: (id) => xenoPropFootprint(id),
  generator: XENO_PROP_GENERATORS,
});

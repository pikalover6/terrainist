/**
 * `prop.place@0` — the **arcane & magical pack's** props: the nine entries of
 * that are things you walk *past* rather
 * than into.
 *
 * The pack's thesis is that the fantasy corner has towers and one shrine, and
 * that a magical *place* — the unicorn island of battery P1, a mage college, a
 * warded valley — needs **the ground to glow, the paths to be marked, and the
 * beasts to have somewhere to live**. The buildings are in
 * `archetypes-arcane.ts`; everything here is what turns the ground between
 * them enchanted:
 *
 * - `rune_circle` — the ring inlaid *into* the floor plane, the counterpart to
 *   `standing_stones`, which is all vertical;
 * - `ley_marker` — the knee-high waystone with a glowing glyph. **Twenty of
 *   these along a road is what makes a valley read as enchanted**, so this is
 *   the pack's cheapest repeat piece;
 * - `crystal_outcrop` — amethyst and quartz erupting from the ground at an
 *   angle, budding at the base;
 * - `scrying_pool` — the still rimmed basin with glow *under* the water;
 * - `unicorn_paddock` — white fencing round grazed ground, a blossom tree, a
 *   trough and a gate. **The icon is the enclosure, not an occupant**;
 * - `arcane_orrery` — armillary rings on a plinth with a lit core, each ring a
 *   course of blocks in its own plane;
 * - `spirit_lantern_row` — the run of posts with hung lanterns at head height.
 *   The pack's saturation piece, and the one that takes a `length`;
 * - `dragon_skeleton` — **the headline**: a picked wyrm laid out where it
 *   fell, spine flush in the ground plane, ribs standing on it, the skull
 *   turned to one side. Pure silhouette;
 * - `moon_dial` — the great disc in a paved terrace with a leaning gnomon.
 *
 * ## What the pack must get right
 *
 * **Magic has to read at a glance**, which in this medium means three things
 * and nothing else: *glow*, *impossible geometry that is nevertheless legal*,
 * and *white-and-gold-and-amethyst against a world that is neither*. So the
 * materials here are **fixed blocks, not palette roles** — `calcite`,
 * `quartz_block`, `amethyst_block`, `gold_block` and `glowstone` come out the
 * same in `temperate_timber` as in `sun_clay`, and the icon survives a
 * document that never names a theme. What the theme changes is the *company*
 * these props keep, which is the right seam for a palette to work at.
 *
 * ## The contract, and why this file is a leaf
 *
 * Same shape as `props-response.ts` and `props-brine.ts`: this file imports
 * **types** from `props.ts` and no values at all, so the one edge
 * `props.ts` → here can never become a module-initialisation cycle.
 * Node-local coordinates, `y = 0` the base plane, block **names** with a
 * property map, every op inside the declared box so `rotateOps` needs no
 * special case.
 *
 * ## The rules every prop here obeys
 *
 * 1. **Nothing floats.** The physics lint's `floating.*` family fires on a
 *    full cube with **six air faces**. Every block here rests on the ground
 *    plane (`y = 0`, whose downward neighbour is the terrain the prop stands
 *    on), on a column chain run down to it, or on an orthogonal neighbour of
 *    its own. That is the whole reason the ribs and the orrery rings are
 *    generated as **orthogonally connected runs** rather than as radius tests:
 *    a diamond outline steps diagonally, and a diagonal step is a floating
 *    block wearing a circle's clothes. See {@link quarterArc}.
 * 2. **The glow rides the structure.** `glowstone` is a full cube and is
 *    therefore policed by the same rule; every one written here is either in
 *    the floor plane or against a solid neighbour.
 * 3. **A lantern is a support chain.** The lint's rule keys on any name ending
 *    `lantern`: hanging wants a full cube **above**, standing wants one
 *    **below**. The lantern row hangs each of its lanterns directly under a
 *    solid arm block, which is the only arrangement this file uses.
 * 4. **No `chain`** — not a block in the pinned 1.21.11 table. Where a chain
 *    is wanted, `iron_bars`.
 * 5. **Water is boxed.** The scrying pool is the one prop here that writes
 *    real `water`, and every water cell has this prop's own blocks on all four
 *    flanks and underneath, which is exactly what `checkPropFluidSafety`
 *    re-derives.
 * 6. **No sign blocks, no lit fire, no bare `flower_pot`.**
 * 7. **Determinism.** The only randomness is surface scuffing, drawn from a
 *    named stream of the node seed; every form is a pure function of position.
 *    No wall clock, no `Math.random`, no transcendental maths (`Math.sqrt` is
 *    IEEE-exact and is the only root taken here).
 */

import { definePropDescriptors } from "./descriptor.js";
import type { PropDescriptor } from "./descriptor.js";
import type { LocalVoxelOp } from "./core.js";
import type { PropBase, PropGenerator, PropMeta } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every prop this file builds, in catalog order.
 *
 * Spread into `PROP_NAMES` by `props.ts`, which stays the one place a prop
 * name is enumerated, and mirrored element-for-element by the spec package's
 * `SETTLEMENT_PROP_NAMES`.
 */
export const ARCANE_PROP_NAMES = [
  "rune_circle",
  "ley_marker",
  "crystal_outcrop",
  "scrying_pool",
  "unicorn_paddock",
  "arcane_orrery",
  "spirit_lantern_row",
  "dragon_skeleton",
  "moon_dial",
] as const;

/** One of the props this file builds. */
export type ArcanePropName = (typeof ARCANE_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isArcaneProp(name: string): name is ArcanePropName {
  return (ARCANE_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* the pack's own materials                                                    */
/* -------------------------------------------------------------------------- */

/** The pale ground every inlay is cut into. */
const PALE = "calcite";
/** The polished stone of a worked plane. */
const POLISHED = "smooth_quartz";
/** The worked block with a face on it. */
const CHISELED = "chiseled_quartz_block";
/** A shaft, and the one block here that carries an axis. */
const PILLAR = "quartz_pillar";
/** The colour magic is in this pack: violet, and never anything else. */
const AMETHYST = "amethyst_block";
/** The second half of the pack's colour claim. */
const GOLD = "gold_block";
/** The glow. Always a full cube, always against something solid. */
const GLOW = "glowstone";
/** A picked bone. */
const BONE = "bone_block";

/** A block standing on its end. */
const UPRIGHT: Record<string, string> = { axis: "y" };
/** A block laid along x — a spine, a beam. */
const ALONG_X: Record<string, string> = { axis: "x" };
/** Cherry foliage that will not decay when the tree is only three logs tall. */
const LEAF: Record<string, string> = { distance: "1", persistent: "true", waterlogged: "false" };

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Rune circle: the inlaid ring, edge to edge. Floor plane only. */
export const RUNE_SPAN = 13;
/** Rune circle height — one course, because *no vertical stone at all*. */
const RUNE_H = 1;

/** Ley marker pad, in x and z. */
const LEY_SPAN = 3;
/** Ley marker height: pad, glyph, cap. Knee-high, as the note asks. */
const LEY_H = 3;

/** Crystal outcrop span, in x and z. */
const OUTCROP_SPAN = 9;
/** Crystal outcrop height: the tallest spire, leaning. */
const OUTCROP_H = 8;
/** How many spires erupt. */
const OUTCROP_SPIRES = 4;

/** Scrying pool span, in x and z. */
const SCRY_SPAN = 7;
/** Scrying pool height: terrace, rim and the kneeling step. */
const SCRY_H = 3;

/** Paddock span, in x and z — the enclosure is the icon, so it is big. */
const PADDOCK_SPAN = 17;
/** Paddock height: the blossom tree's crown. */
const PADDOCK_H = 8;

/** Orrery span, in x and z. */
const ORRERY_SPAN = 11;
/** Orrery height: plinth, core and the rings around it. */
const ORRERY_H = 10;
/** Radius of every armillary ring, in cells. */
const ORRERY_R = 4;

/** Lantern row: the default run, in cells. */
const LANTERN_RUN = 15;
/** Shortest run the row will build. */
export const LANTERN_MIN = 3;
/** Longest run the row will build — the validator's own `length` clamp. */
export const LANTERN_MAX = 64;
/** Lantern row depth: the post and an arm either side of it. */
const LANTERN_D = 3;
/** Lantern row height: footing, post, arm. */
const LANTERN_H = 6;
/** Cells between one post and the next. */
const LANTERN_PITCH = 4;

/** Dragon skeleton: skull to tail tip. */
export const DRAGON_L = 27;
/** Dragon skeleton depth: the ribcage at its widest, plus the skull's turn. */
export const DRAGON_D = 15;
/** Dragon skeleton height: the tallest rib over the spine. */
const DRAGON_H = 8;
/**
 * The longest rib, amidships.
 *
 * Half the declared depth, so the widest pair of arcs reaches both sides of
 * the box: a ribcage that stops short of its own footprint has the placer
 * holding ground the wyrm never lay on.
 */
const DRAGON_RIB = (DRAGON_D - 1) / 2;

/** Moon dial span, in x and z. */
const DIAL_SPAN = 13;
/** Moon dial height: the leaning gnomon. */
const DIAL_H = 7;

/** Read the lantern row's `length` param the way the generator reads it. */
function lanternRun(params: Readonly<Record<string, unknown>>): number {
  const raw = params["length"];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return LANTERN_RUN;
  const v = Math.round(raw);
  return v < LANTERN_MIN ? LANTERN_MIN : v > LANTERN_MAX ? LANTERN_MAX : v;
}

/** The declared box of one of this file's props, before it is generated. */
export function arcanePropFootprint(
  prop: ArcanePropName,
  params: Readonly<Record<string, unknown>> = {},
): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  const ground = (
    size: readonly [number, number, number],
  ): { size: readonly [number, number, number]; minY: number; base: PropBase } => ({
    size,
    minY: 0,
    base: "ground",
  });
  switch (prop) {
    case "rune_circle":
      return ground([RUNE_SPAN, RUNE_H, RUNE_SPAN]);
    case "ley_marker":
      return ground([LEY_SPAN, LEY_H, LEY_SPAN]);
    case "crystal_outcrop":
      return ground([OUTCROP_SPAN, OUTCROP_H, OUTCROP_SPAN]);
    case "scrying_pool":
      return ground([SCRY_SPAN, SCRY_H, SCRY_SPAN]);
    case "unicorn_paddock":
      return ground([PADDOCK_SPAN, PADDOCK_H, PADDOCK_SPAN]);
    case "arcane_orrery":
      return ground([ORRERY_SPAN, ORRERY_H, ORRERY_SPAN]);
    case "spirit_lantern_row":
      return ground([lanternRun(params), LANTERN_H, LANTERN_D]);
    case "dragon_skeleton":
      return ground([DRAGON_L, DRAGON_H, DRAGON_D]);
    case "moon_dial":
    default:
      return ground([DIAL_SPAN, DIAL_H, DIAL_SPAN]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: ArcanePropName, params: Readonly<Record<string, unknown>> = {}): PropMeta {
  const foot = arcanePropFootprint(prop, params);
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

/** The `put` a generator is handed, narrowed for the helpers below. */
type PropContextPut = (
  x: number,
  y: number,
  z: number,
  block: string,
  props?: Record<string, string>,
) => void;

/* -------------------------------------------------------------------------- */
/* geometry: circles that are actually connected                               */
/* -------------------------------------------------------------------------- */

/**
 * A quarter arc of radius `r`, from `(0, r)` to `(r, 0)`, **orthogonally
 * connected end to end**.
 *
 * The whole pack's geometry rests on this function, and so does its legality.
 * The obvious way to draw a ring — "every cell whose distance flips at `r`" —
 * produces a figure whose cells touch only *diagonally* at the axes: at
 * `r = 5` the cell `(5, 0)` has no orthogonal neighbour in the set at all, so
 * an orrery ring drawn that way is a ring of floating blocks the moment it
 * leaves the ground plane. A rib whose every block touches a neighbour is
 * legal; a floating arc segment is not, and that is a defect round nobody
 * needs to pay for twice.
 *
 * So the arc is walked **by column**, bridging the gap between one column's
 * height and the next: every consecutive pair differs by exactly one cell in
 * exactly one axis. `Math.sqrt` is IEEE-exact, so this is reproducible
 * everywhere.
 */
export function quarterArc(r: number): readonly (readonly [number, number])[] {
  const out: [number, number][] = [];
  if (r < 1) return [[0, 0]];
  let prev = r;
  for (let a = 0; a <= r; a++) {
    const b = Math.floor(Math.sqrt(Math.max(0, r * r - a * a)) + 0.5);
    for (let k = prev; k >= b; k--) out.push([a, k]);
    prev = b;
  }
  return out;
}

/**
 * A whole ring of radius `r`, as offsets from its centre, connected all the
 * way round.
 *
 * The quarter arc turned through the four quadrants; the axis cells are shared
 * between neighbouring quadrants, which is what closes the loop.
 */
export function ringOffsets(r: number): readonly (readonly [number, number])[] {
  const seen = new Map<string, [number, number]>();
  for (const [a, b] of quarterArc(r)) {
    for (const cell of [
      [a, b],
      [b, -a],
      [-a, -b],
      [-b, a],
    ] as [number, number][]) {
      seen.set(`${cell[0]},${cell[1]}`, cell);
    }
  }
  return [...seen.values()];
}

/** True when an offset is inside the disc of radius `r`. */
function inDisc(dx: number, dz: number, r: number): boolean {
  return dx * dx + dz * dz <= r * r;
}

/**
 * A deterministic small draw, keyed on whatever the caller hands it.
 *
 * A pure integer hash of the position — the idiom every earlier wave uses —
 * so a form is the same form forever without ever asking for a seed.
 * `Math.imul` is exactly specified where `Math.pow` is not.
 */
function glyphHash(a: number, b: number, c: number, n: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % n;
}

/**
 * The pack's paving: pale stone, worked where the hash says so.
 *
 * A terrace under a magical object is *made*, not found, so it is never one
 * flat colour — but it is never busy either, because the inlay on top of it is
 * the thing that has to read.
 */
function paving(x: number, z: number, scuff: number): string {
  const k = glyphHash(x, z, scuff, 8);
  if (k === 0) return POLISHED;
  if (k === 1) return "quartz_block";
  return PALE;
}

/** Pave a disc of radius `r` about a centre, at `y = 0`. */
function paveDisc(put: PropContextPut, cx: number, cz: number, r: number, scuff: number): void {
  for (let z = cz - r; z <= cz + r; z++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inDisc(x - cx, z - cz, r)) continue;
      put(x, 0, z, paving(x, z, scuff));
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the rune circle                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `rune_circle` — the ring inlaid **into** the floor plane.
 *
 * The counterpart to `standing_stones`, which is all vertical: this prop
 * writes exactly one course and there is no stone above the ground anywhere in
 * it. What makes it read is the *drawing*, in four registers:
 *
 * - a pale disc, the plane the whole thing is cut into;
 * - the **outer band** at the disc's edge, in gold, which is what names the
 *   figure as made rather than natural;
 * - the **glyph courses**: the eight spokes, in amethyst, running from the
 *   heart out to the band. Deliberately eight and not sixteen — at render
 *   scale sixteen is a smudge;
 * - the **glowing ring** the spokes cross, and a lit heart, both in glowstone,
 *   which is the light that makes the ring visible at night from a road.
 */
const runeCircle: PropGenerator = (ctx) => {
  const { put } = ctx;
  const scuff = ctx.rng("rune.pad").int(0, 7);
  const c = (RUNE_SPAN - 1) / 2;
  const r = c;
  paveDisc(put, c, c, r, scuff);

  // The glowing ring, two cells inside the band.
  for (const [dx, dz] of ringOffsets(r - 2)) put(c + dx, 0, c + dz, GLOW);
  // The band at the rim.
  for (const [dx, dz] of ringOffsets(r)) put(c + dx, 0, c + dz, GOLD);
  for (const [dx, dz] of ringOffsets(r - 1)) put(c + dx, 0, c + dz, AMETHYST);

  // The eight glyph spokes, from the heart out to the band.
  for (let k = 1; k <= r - 1; k++) {
    for (const [dx, dz] of [
      [k, 0],
      [-k, 0],
      [0, k],
      [0, -k],
      [k, k],
      [k, -k],
      [-k, k],
      [-k, -k],
    ] as const) {
      if (!inDisc(dx, dz, r - 1)) continue;
      put(c + dx, 0, c + dz, k % 2 === 0 ? AMETHYST : CHISELED);
    }
  }

  // The heart: lit, and the one place a walker's eye lands.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      put(c + dx, 0, c + dz, dx === 0 && dz === 0 ? GLOW : AMETHYST);
    }
  }

  return { ops: NO_OPS, meta: metaOf("rune_circle") };
};

/* -------------------------------------------------------------------------- */
/* the ley marker                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `ley_marker` — the knee-high waystone that makes a road an enchanted one.
 *
 * *Twenty of these along a road is what makes a valley read as enchanted*, so
 * the whole design brief is **cheap and unmistakable at two blocks tall**: a
 * pale setting in the ground, a lit glyph course, and a worked cap over it.
 * The glow is the glyph — a face that is merely *carved* disappears at ten
 * metres, and this prop only exists at ten metres.
 */
const leyMarker: PropGenerator = (ctx) => {
  const { put } = ctx;
  const scuff = ctx.rng("ley.pad").int(0, 7);
  for (let z = 0; z < LEY_SPAN; z++) {
    for (let x = 0; x < LEY_SPAN; x++) {
      const corner = (x === 0 || x === LEY_SPAN - 1) && (z === 0 || z === LEY_SPAN - 1);
      put(x, 0, z, corner ? PALE : paving(x, z, scuff));
    }
  }
  put(1, 1, 1, GLOW);
  put(1, 2, 1, CHISELED);
  return { ops: NO_OPS, meta: metaOf("ley_marker") };
};

/* -------------------------------------------------------------------------- */
/* the crystal outcrop                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One leaning spire, as a **column chain**: up, over, up, over.
 *
 * The lean is the read — a vertical amethyst column is a fence post — and the
 * legality is the alternation: every cell of the chain is orthogonally
 * adjacent to the one before it, so nothing in a spire has six air faces even
 * where it hangs furthest out over the ground.
 */
function spire(
  put: PropContextPut,
  bx: number,
  bz: number,
  height: number,
  lean: readonly [number, number],
  pale: boolean,
): void {
  let x = bx;
  let z = bz;
  for (let y = 0; y <= height; y++) {
    put(x, y, z, pale && y % 3 === 2 ? "quartz_block" : AMETHYST);
    // Step out every other course, and only after the block at this level is
    // down: the sideways cell then touches the one under it as well.
    if (y % 2 === 1 && y < height) {
      x += lean[0];
      z += lean[1];
      put(x, y, z, AMETHYST);
    }
  }
}

/**
 * `crystal_outcrop` — amethyst and quartz erupting from the ground at an
 * angle.
 *
 * Four spires of unequal height leaning four different ways out of a calcite
 * scab, with smaller buds clustered round their feet. The angle is the entire
 * point: crystals that stand plumb read as a fence, and the note says
 * *erupting*, which is a direction.
 *
 * The base scab is deliberately not a square pad — this is the one prop in the
 * pack that is supposed to look like it happened rather than like it was laid.
 */
const crystalOutcrop: PropGenerator = (ctx) => {
  const { put } = ctx;
  const c = (OUTCROP_SPAN - 1) / 2;

  // The scab: a rough disc of calcite, the stone amethyst grows in.
  for (let z = 0; z < OUTCROP_SPAN; z++) {
    for (let x = 0; x < OUTCROP_SPAN; x++) {
      const dx = x - c;
      const dz = z - c;
      if (!inDisc(dx, dz, c)) continue;
      if (glyphHash(x, z, 3, 9) === 0 && !inDisc(dx, dz, c - 1)) continue;
      put(x, 0, z, glyphHash(x, z, 5, 6) === 0 ? "tuff" : PALE);
    }
  }

  // The scab's four extremities, always laid: the hash may thin the rim, and a
  // prop that does not reach the sides of its declared box has the placer
  // reserving ground it never builds on.
  for (const [x, z] of [
    [0, c],
    [OUTCROP_SPAN - 1, c],
    [c, 0],
    [c, OUTCROP_SPAN - 1],
  ] as const) {
    put(x, 0, z, PALE);
  }

  // The spires. Feet inside the scab, leans on the four diagonals so no two
  // read the same, heights unequal because a matched pair is a gate.
  const feet: readonly (readonly [number, number, number, readonly [number, number]])[] = [
    [c, c, OUTCROP_H - 2, [1, 0]],
    [c - 2, c + 1, OUTCROP_H - 4, [-1, 0]],
    [c + 1, c - 2, OUTCROP_H - 5, [0, -1]],
    [c + 2, c + 2, OUTCROP_H - 6, [0, 1]],
  ];
  for (let i = 0; i < OUTCROP_SPIRES; i++) {
    const [fx, fz, h, lean] = feet[i] as (typeof feet)[number];
    spire(put, fx, fz, h, lean, i % 2 === 1);
  }

  // The buds: single cells at the feet, each one against a spire's foot.
  for (const [bx, bz] of [
    [c + 1, c],
    [c, c + 1],
    [c - 1, c + 1],
    [c + 2, c + 1],
    [c + 1, c - 2],
  ] as const) {
    put(bx, 1, bz, AMETHYST);
  }
  // One lit vein in the scab, so the outcrop is visible after dark. It sits in
  // the ground plane, which is the one place a full cube is always supported.
  put(c, 0, c + 1, GLOW);
  put(c - 1, 0, c, GLOW);

  return { ops: NO_OPS, meta: metaOf("crystal_outcrop") };
};

/* -------------------------------------------------------------------------- */
/* the scrying pool                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `scrying_pool` — a still rimmed basin with the glow **under** the water.
 *
 * Three rings and one step:
 *
 * - the **terrace** at `y = 0`, pale and polished, the whole declared box;
 * - the **glowing floor**, a lit plate at `y = 0` under the water, which is
 *   what makes the surface read as a scrying pool rather than a puddle;
 * - the **rim** at `y = 1`, a closed ring of *full* blocks. Full, not stairs:
 *   the water inside is a real fluid, and `checkPropFluidSafety` requires
 *   every water cell to have this prop's own blocks on all four flanks and
 *   underneath. A stair leaves half a cell for the water to find;
 * - the **kneeling step**, one stair on the terrace outside the rim, on the
 *   south side, which is the one place the basin invites a body.
 */
const scryingPool: PropGenerator = (ctx) => {
  const { put } = ctx;
  const scuff = ctx.rng("scry.pad").int(0, 7);
  const c = (SCRY_SPAN - 1) / 2;

  for (let z = 0; z < SCRY_SPAN; z++) {
    for (let x = 0; x < SCRY_SPAN; x++) put(x, 0, z, paving(x, z, scuff));
  }

  // The lit floor of the basin, and the water over it.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      put(c + dx, 0, c + dz, dx === 0 && dz === 0 ? GLOW : AMETHYST);
      put(c + dx, 1, c + dz, "water", { level: "0" });
    }
  }

  // The rim: the closed ring at Chebyshev radius two, in worked quartz with a
  // gold cardinal at each of the four points of the compass.
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) !== 2 && Math.abs(dz) !== 2) continue;
      const cardinal = dx === 0 || dz === 0;
      put(c + dx, 1, c + dz, cardinal ? GOLD : POLISHED);
    }
  }

  // The kneeling step, on the terrace outside the rim.
  put(c, 1, SCRY_SPAN - 1, "smooth_quartz_stairs", {
    facing: "north",
    half: "bottom",
    shape: "straight",
    waterlogged: "false",
  });

  return { ops: NO_OPS, meta: metaOf("scrying_pool") };
};

/* -------------------------------------------------------------------------- */
/* the paddock                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `unicorn_paddock` — white fencing round grazed ground.
 *
 * **The icon is the enclosure, not an occupant**, which is the whole design:
 * an empty white-railed paddock with a blossom tree in one corner says
 * *something is kept here that you have not seen* far more loudly than any
 * mob would. Four parts:
 *
 * - the **ground**, grazed: grass with the bare patches a kept pasture has,
 *   laid edge to edge so the fence has something to stand on;
 * - the **rail**, birch fence all the way round — pale, which is the pack's
 *   colour — with a **gate** in the middle of the south run;
 * - the **blossom tree**, trunk and a persistent cherry crown;
 * - the **trough**, a `water_cauldron` rather than a fluid, for exactly the
 *   reason `props-street.ts` gives: a cauldron cannot leak.
 */
const unicornPaddock: PropGenerator = (ctx) => {
  const { put } = ctx;
  const scuff = ctx.rng("paddock.graze").int(0, 7);
  const last = PADDOCK_SPAN - 1;

  for (let z = 0; z < PADDOCK_SPAN; z++) {
    for (let x = 0; x < PADDOCK_SPAN; x++) {
      const edge = x === 0 || z === 0 || x === last || z === last;
      // The rail stands on grass; only the inside is worn through to dirt.
      const worn = !edge && glyphHash(x, z, scuff, 11) === 0;
      put(x, 0, z, worn ? "coarse_dirt" : "grass_block", worn ? undefined : { snowy: "false" });
    }
  }

  // The rail, and the one way in.
  const gate = (PADDOCK_SPAN - 1) / 2;
  for (let k = 0; k < PADDOCK_SPAN; k++) {
    for (const [x, z] of [
      [k, 0],
      [k, last],
      [0, k],
      [last, k],
    ] as const) {
      if (x === gate && z === last) continue;
      put(x, 1, z, "birch_fence", {
        east: "false",
        north: "false",
        south: "false",
        waterlogged: "false",
        west: "false",
      });
    }
  }
  put(gate, 1, last, "birch_fence_gate", {
    facing: "south",
    in_wall: "false",
    open: "false",
    powered: "false",
  });

  // The blossom tree, in the far corner from the gate.
  const tx = 4;
  const tz = 4;
  for (let y = 1; y <= 4; y++) put(tx, y, tz, "cherry_log", UPRIGHT);
  for (let y = 4; y <= 6; y++) {
    const r = y === 6 ? 1 : 2;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (!inDisc(dx, dz, r)) continue;
        if (dx === 0 && dz === 0 && y <= 4) continue;
        put(tx + dx, y, tz + dz, "cherry_leaves", LEAF);
      }
    }
  }

  // The trough, on the rail side away from the tree.
  put(last - 3, 0, last - 3, POLISHED);
  put(last - 3, 1, last - 3, "water_cauldron", { level: "3" });

  return { ops: NO_OPS, meta: metaOf("unicorn_paddock") };
};

/* -------------------------------------------------------------------------- */
/* the orrery                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `arcane_orrery` — armillary rings on a plinth with a lit core.
 *
 * *Each ring a course of blocks in its own plane*: three rings of the same
 * radius about one lit centre, one flat, two upright and at right angles to
 * each other, so from any approach at least one of them is edge-on and one is
 * face-on. That contrast is what makes the object read as a *mechanism*
 * instead of as a hoop.
 *
 * The rings are the reason {@link quarterArc} exists. A ring three courses
 * clear of everything else in the world is legal precisely because it is a
 * closed connected run: every cell in it touches two others. Its lowest cells
 * land at `y = 1`, on the pad, which is belt and braces.
 */
const arcaneOrrery: PropGenerator = (ctx) => {
  const { put } = ctx;
  const scuff = ctx.rng("orrery.pad").int(0, 7);
  const c = (ORRERY_SPAN - 1) / 2;
  paveDisc(put, c, c, c, scuff);

  // The plinth, and the shaft up to the core.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) put(c + dx, 1, c + dz, dx === 0 && dz === 0 ? PILLAR : CHISELED);
  }
  const core = 1 + ORRERY_R;
  for (let y = 2; y < core; y++) put(c, y, c, PILLAR, UPRIGHT);
  put(c, core, c, GLOW);

  // The three rings. Flat first, then the two uprights, so a shared cell comes
  // up in the upright ring's material — the flat one is the ring you see least
  // of from a street.
  for (const [dx, dz] of ringOffsets(ORRERY_R)) put(c + dx, core, c + dz, GOLD);
  for (const [dx, dy] of ringOffsets(ORRERY_R)) put(c + dx, core + dy, c, AMETHYST);
  for (const [dz, dy] of ringOffsets(ORRERY_R)) put(c, core + dy, c + dz, POLISHED);

  return { ops: NO_OPS, meta: metaOf("arcane_orrery") };
};

/* -------------------------------------------------------------------------- */
/* the lantern row                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `spirit_lantern_row` — the pack's saturation piece.
 *
 * A run of pale posts with a lantern hung either side of each, at head height.
 * Everything about it is about **repeating cheaply**: no pad (the path it
 * stands beside is already paved by whatever laid it), one footing stone per
 * post, and a fixed pitch so a long run reads as a rhythm rather than as a
 * fence.
 *
 * The lantern is the file's one support-chain case and is arranged the only
 * way this pack allows: `hanging: "true"` with a **full cube directly above
 * it** — the arm — which is what the lint's rule asks for. A lantern under a
 * fence arm would be the `unsupported.chain` finding that rule exists for.
 */
const spiritLanternRow: PropGenerator = (ctx) => {
  const { put } = ctx;
  const run = lanternRun(ctx.params);

  // The stations. The run's two ends are always posts, whatever the pitch
  // works out to: a declared box whose last cell is empty has the placer
  // reserving ground the row never builds on.
  const stations: number[] = [];
  for (let x = 0; x < run; x += LANTERN_PITCH) stations.push(x);
  if (stations[stations.length - 1] !== run - 1) stations.push(run - 1);

  for (const x of stations) {
    // The footing: one worked stone in the ground plane, which is what the
    // post stands on and what keeps the run legible where the path is grass.
    put(x, 0, 1, POLISHED);
    for (let y = 1; y <= 4; y++) put(x, y, 1, "stripped_birch_log", UPRIGHT);
    put(x, 4, 1, CHISELED);
    for (const dz of [-1, 1] as const) {
      const z = 1 + dz;
      if (z < 0 || z >= LANTERN_D) continue;
      // The arm, touching the post; then the lantern under it.
      put(x, 4, z, CHISELED);
      put(x, 3, z, "lantern", { hanging: "true", waterlogged: "false" });
    }
    // A glowing cap, so the run reads from above and from a distance as well
    // as at head height. It sits on the post's own top course.
    put(x, 5, 1, GLOW);
  }

  return { ops: NO_OPS, meta: metaOf("spirit_lantern_row", ctx.params) };
};

/* -------------------------------------------------------------------------- */
/* the dragon                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where the spine lies at a given station along the body.
 *
 * A dead thing does not lie straight. The curve is a triangle wave of the
 * station — pure, integer, and by construction never moving more than one cell
 * per station, so consecutive vertebrae always touch.
 */
function spineZ(cz: number, x: number): number {
  const period = 18;
  const k = ((x % period) + period) % period;
  const tri = k < period / 2 ? k : period - k;
  return cz + (tri >= 5 ? 1 : 0);
}

/**
 * `dragon_skeleton` — **the pack's headline**, and pure silhouette.
 *
 * *A picked wyrm laid out where it fell.* Ribs over a spine, half-buried, is
 * an image that survives any palette, any weather and any distance, and it is
 * the one thing in this catalog that a stranger names in less than a second.
 * Four parts:
 *
 * - the **spine**, flush in the ground plane — laid bone along x, curving
 *   through a triangle wave so the body reads as fallen rather than as
 *   installed. Being at `y = 0` is what "half-buried" means here: the vertebra
 *   is *in* the ground, and the ribs stand out of it;
 * - the **ribcage**: paired arcs springing from the spine, tallest amidships
 *   and tapering both ways. Each rib is a {@link quarterArc}, which is a
 *   connected run from the crown down to the ground — the legality and the
 *   shape are the same fact;
 * - the **skull**, at the head end and **turned to one side**, which is the
 *   detail that stops the thing reading as a boat;
 * - the **tail**, thinning to a single line of bone.
 */
const dragonSkeleton: PropGenerator = (ctx) => {
  const { put } = ctx;
  const cz = (DRAGON_D - 1) / 2;
  const headEnd = 4;
  const tailStart = DRAGON_L - 6;

  // The spine, in the ground plane, all the way from the neck to the tip.
  for (let x = 2; x < DRAGON_L; x++) {
    const z = spineZ(cz, x);
    put(x, 0, z, BONE, ALONG_X);
    // The vertebra's transverse process: one cell either side, amidships only,
    // so the spine has a width where the ribcage is and none in the tail.
    if (x > headEnd && x < tailStart && x % 3 === 0) {
      put(x, 0, z - 1, BONE, ALONG_X);
      put(x, 0, z + 1, BONE, ALONG_X);
    }
  }

  // The ribcage. The radius swells to the middle of the body and falls away,
  // which is what makes a rank of arcs read as a chest.
  for (let x = headEnd + 2; x < tailStart; x += 2) {
    const z = spineZ(cz, x);
    const span = tailStart - headEnd - 2;
    const t = x - headEnd - 2;
    const near = Math.min(t, span - t);
    // Clamped so both arcs land inside the declared box: a rib clipped by the
    // box edge would leave its lowest cell in the air rather than on the
    // ground, which is legal but reads as a broken rib.
    const r = Math.min(DRAGON_RIB, 2 + near, z, DRAGON_D - 1 - z);
    if (r < 2) continue;
    for (const side of [-1, 1] as const) {
      for (const [dz, dy] of quarterArc(r)) {
        const rz = z + side * dz;
        if (rz < 0 || rz >= DRAGON_D) continue;
        if (dy > DRAGON_H - 1) continue;
        put(x, dy, rz, BONE, UPRIGHT);
      }
    }
  }

  // The skull, turned to one side: a blunt wedge off the neck, with the jaw
  // running back along the body and a lit socket where the eye was.
  const sz = cz - 2;
  for (let x = 0; x <= headEnd; x++) {
    const wide = x >= 1 && x <= 3;
    for (let dz = 0; dz <= (wide ? 2 : 1); dz++) {
      put(x, 0, sz + dz, BONE, ALONG_X);
      if (wide) put(x, 1, sz + dz, BONE, ALONG_X);
    }
  }
  // The neck, joining the skull to the spine: two cells that touch both.
  put(headEnd, 0, sz + 2, BONE, ALONG_X);
  put(headEnd + 1, 0, spineZ(cz, headEnd + 1), BONE, ALONG_X);
  put(headEnd, 0, cz, BONE, ALONG_X);
  // The eye. A full cube against the skull's own bone, which is the only place
  // this pack ever writes one.
  put(2, 1, sz, GLOW);

  return { ops: NO_OPS, meta: metaOf("dragon_skeleton") };
};

/* -------------------------------------------------------------------------- */
/* the moon dial                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `moon_dial` — a great disc set into a paved terrace, with a leaning gnomon.
 *
 * The disc is drawn in the floor plane like the rune circle, but the reading
 * is different: a rune circle is a *figure*, a dial is an *instrument*, so
 * this one has a rim, hour marks at the eight points, and a gnomon that leans.
 * The lean is what makes it an instrument — a plumb post is a bollard.
 *
 * The gnomon is a column chain, alternating up and along, so every cell of it
 * touches the one before and the foot touches the disc.
 */
const moonDial: PropGenerator = (ctx) => {
  const { put } = ctx;
  const scuff = ctx.rng("dial.pad").int(0, 7);
  const c = (DIAL_SPAN - 1) / 2;

  // The terrace, square, and the disc set into it.
  for (let z = 0; z < DIAL_SPAN; z++) {
    for (let x = 0; x < DIAL_SPAN; x++) put(x, 0, z, paving(x, z, scuff));
  }
  for (let z = 0; z < DIAL_SPAN; z++) {
    for (let x = 0; x < DIAL_SPAN; x++) {
      if (!inDisc(x - c, z - c, c - 1)) continue;
      put(x, 0, z, "polished_blackstone");
    }
  }
  for (const [dx, dz] of ringOffsets(c - 1)) put(c + dx, 0, c + dz, GOLD);

  // The hour marks: eight of them, lit, one course inside the rim.
  const m = c - 2;
  for (const [dx, dz] of [
    [m, 0],
    [-m, 0],
    [0, m],
    [0, -m],
    [m - 1, m - 1],
    [m - 1, -(m - 1)],
    [-(m - 1), m - 1],
    [-(m - 1), -(m - 1)],
  ] as const) {
    put(c + dx, 0, c + dz, GLOW);
  }

  // The gnomon: up, along, up, along, leaning north over the face.
  let z = c;
  let y = 1;
  put(c, 0, c, CHISELED);
  for (let step = 0; step < 5; step++) {
    // `gold_block` has no axis; only the pillar carries one, and a property
    // map a block has no key for is a state the emitter has to fall back from.
    if (step === 4) put(c, y, z, GOLD);
    else put(c, y, z, PILLAR, UPRIGHT);
    y += 1;
    if (step % 2 === 0) {
      z -= 1;
      put(c, y - 1, z, PILLAR, UPRIGHT);
    }
  }
  put(c, y, z, AMETHYST);

  return { ops: NO_OPS, meta: metaOf("moon_dial") };
};

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The generators, keyed by name and merged into `PROP_GENERATORS`.
 *
 * `props.ts` stays the one place a prop is looked up; this map is what it
 * spreads.
 */
const ARCANE_PROP_GENERATORS: Readonly<Record<ArcanePropName, PropGenerator>> = Object.freeze(
  {
    rune_circle: runeCircle,
    ley_marker: leyMarker,
    crystal_outcrop: crystalOutcrop,
    scrying_pool: scryingPool,
    unicorn_paddock: unicornPaddock,
    arcane_orrery: arcaneOrrery,
    spirit_lantern_row: spiritLanternRow,
    dragon_skeleton: dragonSkeleton,
    moon_dial: moonDial,
  },
);

/* -------------------------------------------------------------------------- */
/* descriptors — Phase 4 leaf export (no self-registration)                    */
/* -------------------------------------------------------------------------- */

/**
 * Ordered prop descriptors for the arcane pack, one per {@link ARCANE_PROP_NAMES}.
 *
 * - Delegates footprint param-dependently to {@link arcanePropFootprint}:
 *   `spirit_lantern_row` reads `length` via {@link lanternRun} clamped to
 *   {@link LANTERN_MIN}–{@link LANTERN_MAX} (default {@link LANTERN_RUN});
 *   the remaining eight are static (`rune_circle`, `ley_marker`,
 *   `crystal_outcrop`, `scrying_pool`, `unicorn_paddock`, `arcane_orrery`,
 *   `dragon_skeleton`, `moon_dial`). Same helper as generator.
 * - Generator is the leaf handle from {@link ARCANE_PROP_GENERATORS}.
 * - Insertion order equals {@link ARCANE_PROP_NAMES} and local
 *   switch/generator order; preserves LocalVoxelOp order, seeded draws,
 *   `quarterArc`/`ringOffsets` usage and the rune/lantern rules.
 */
export const ARCANE_PROP_DESCRIPTORS: readonly PropDescriptor[] = definePropDescriptors(ARCANE_PROP_NAMES, {
  footprint: (id, params) => arcanePropFootprint(id, params),
  generator: ARCANE_PROP_GENERATORS,
});

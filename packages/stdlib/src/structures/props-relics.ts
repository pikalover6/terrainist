/**
 * `prop.place@0` — wave 6E: the monuments.
 *
 * Seven props that are older than anything around them: a ring of standing
 * stones, a henge, a single monolith, a burial mound, a dig site, a fossil dig
 * and a shattered obelisk. The five *ruined buildings* of the same wave are
 * archetypes and live in `archetypes-relic.ts` — a ruin is a shell with a room
 * in it, a monument is a lump of rock, and the two want opposite machinery.
 *
 * The contract is `props.ts`'s, unchanged, and this file is a **leaf** in
 * exactly the way `props-wayside.ts` and `props-amusement.ts` are: it imports
 * *types* from `props.ts` and no values at all, so the one edge
 * `props.ts` → here cannot become a module-initialisation cycle. Node-local
 * coordinates, `y = 0` the base plane, block **names** with a property map,
 * every op inside the declared box so `rotateOps` needs no special case.
 *
 * ## The rules this wave was written against
 *
 * 1. **Support closure, and the lintel case.** `physics.ts` walks
 *    `NEEDS_GROUND` (fences, walls, carpets, pressure plates, torches,
 *    campfires, standing lanterns) *down* to something solid, and its
 *    `floating.*` family fires on a full cube with **six air faces**. A
 *    trilithon's lintel is a full cube lying across two posts: the faces below
 *    it at each end are post, so it has non-air faces and is legal — and the
 *    span between the posts is only ever **one** cell wide here, so the middle
 *    of a lintel is never a block whose only neighbours are other lintel
 *    blocks hanging in the same void. Every fallen block of the obelisk is
 *    likewise on the ground or touching the run it fell from.
 * 2. **No `chain`.** Not in the pinned 1.21.11 table; `iron_bars` carries the
 *    read wherever ironwork is wanted. Nothing here wants any.
 * 3. **No sign blocks.** A sign is a block entity the op stream cannot carry.
 *    The dig's marker is a **banner**, standing on a solid block.
 * 4. **Apron and pad props are grounded.** Every fence peg of the dig's rope
 *    line stands on the pad the prop lays first, never on nothing.
 * 5. **No plain `mud`.** Mud is a sink block a player falls into and a colour
 *    nobody asked for. The dig beds are `coarse_dirt` and `packed_mud`, which
 *    is the same recolour without the trap.
 * 6. **Determinism.** Every draw is a named stream of the node seed —
 *    `ctx.rng("standing_stones")` and friends — exactly as the graveyard does
 *    it. No wall clock, no `Math.random`, no transcendentals.
 *
 * ## The idiom this wave adds: the leaning read
 *
 * A block cannot be tilted. A stone that *leans* is therefore built as a stack
 * of **offset courses**, each course shifted at most one cell from the one
 * below it, so every block in the stack still rests on part of the block
 * beneath it. That is how the monolith leans and how the obelisk's fallen
 * upper section lies down: geometry that reads as tilted while every single
 * cell is still fully supported.
 */

import type { LocalVoxelOp } from "./core.js";
import { definePropDescriptors } from "./descriptor.js";
import type { PropBase, PropGenerator, PropMeta, PropPalette } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every prop this file builds, in catalog order.
 *
 * Spread into `PROP_NAMES` by `props.ts`, which stays the one place a prop
 * name is enumerated.
 */
export const RELIC_PROP_NAMES = [
  "standing_stones",
  "henge",
  "monolith",
  "burial_mound",
  "dig_site",
  "fossil_dig",
  "shattered_obelisk",
] as const;

/** One of the props this file builds. */
export type RelicPropName = (typeof RELIC_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isRelicProp(name: string): name is RelicPropName {
  return (RELIC_PROP_NAMES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** Standing stones: the turf pad the ring of pairs stands on. */
const STONES_SPAN = 11;
/** Henge span — the banked rim, the ditch line and the trilithon circle. */
const HENGE_SPAN = 17;
/** Monolith pad, in x and z. */
const MONOLITH_SPAN = 5;
/** Monolith height, banding and all. */
const MONOLITH_H = 9;
/** Burial mound span — the sod dome plus its kerb. */
const MOUND_SPAN = 11;
/** Dig site width: spoil heap, trench, finds table. */
const DIG_W = 11;
/** Dig site depth. */
const DIG_D = 9;
/** Shattered obelisk span in x: the stump, then the fallen section beside it. */
const OBELISK_W = 11;
/** Shattered obelisk depth. */
const OBELISK_D = 5;
/** How tall the obelisk's surviving stump is. */
const OBELISK_STUMP_H = 5;

/** The declared box of one of this file's props, before it is generated. */
export function relicPropFootprint(prop: RelicPropName): {
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
    case "standing_stones":
      return ground([STONES_SPAN, 6, STONES_SPAN]);
    case "henge":
      return ground([HENGE_SPAN, 7, HENGE_SPAN]);
    case "monolith":
      return ground([MONOLITH_SPAN, MONOLITH_H, MONOLITH_SPAN]);
    case "burial_mound":
      return ground([MOUND_SPAN, 6, MOUND_SPAN]);
    case "dig_site":
      return ground([DIG_W, 4, DIG_D]);
    case "fossil_dig":
      return ground([DIG_W, 4, DIG_D]);
    case "shattered_obelisk":
    default:
      return ground([OBELISK_W, OBELISK_STUMP_H + 2, OBELISK_D]);
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: RelicPropName): PropMeta {
  const foot = relicPropFootprint(prop);
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

/**
 * The weathered face of a megalith, keyed by position.
 *
 * Deterministic by construction — a pure function of the cell — so the same
 * stone is the same stone at every yaw and on every re-run, and the banding
 * reads as bedding planes rather than as noise.
 */
function megalith(palette: PropPalette, x: number, y: number, z: number): string {
  const k = (x * 7 + y * 11 + z * 5) % 6;
  if (k === 0) return "mossy_cobblestone";
  if (k === 1) return palette.stoneAccent;
  if (k === 2) return "andesite";
  return palette.stone;
}

/** The banding of a dressed stone — a monolith's bedding, one course thick. */
function banded(palette: PropPalette, y: number): string {
  if (y % 4 === 3) return "mossy_cobblestone";
  if (y % 4 === 1) return "andesite";
  return palette.stoneAccent;
}

/** The disc mask of a span: every cell within the taxicab radius. */
function disc(span: number, radius: number): { x: number; z: number }[] {
  const c = (span - 1) / 2;
  const out: { x: number; z: number }[] = [];
  for (let x = 0; x < span; x++) {
    for (let z = 0; z < span; z++) {
      if (Math.abs(x - c) + Math.abs(z - c) > radius) continue;
      out.push({ x, z });
    }
  }
  return out;
}

/**
 * The eight compass points of a ring of radius `r` about the centre of `span`.
 *
 * A taxicab octagon rather than a circle, for the reason every ring in this
 * codebase is one: it is exact in integers, it is the same shape at every yaw,
 * and it needs no transcendental to compute.
 */
function ringPoints(span: number, r: number): { x: number; z: number }[] {
  const c = (span - 1) / 2;
  const h = r >> 1;
  return [
    { x: c, z: c - r },
    { x: c + h, z: c - h },
    { x: c + r, z: c },
    { x: c + h, z: c + h },
    { x: c, z: c + r },
    { x: c - h, z: c + h },
    { x: c - r, z: c },
    { x: c - h, z: c - h },
  ];
}

/* -------------------------------------------------------------------------- */
/* the stones                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `standing_stones` — a ring of megalith **pairs** on a turf pad.
 *
 * The pairs are the read: a lone stone every so often round a circle is a
 * fence, but two stones shoulder to shoulder with a gap to the next couple is
 * unmistakably a monument. Each stone is a column of one to three courses,
 * drawn per stone from the node's own stream so no two rings are the same
 * silhouette; every course sits on the one below it, and the bottom course
 * sits on the turf pad this prop lays first.
 */
const standingStones: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const span = STONES_SPAN;
  const rng = ctx.rng("standing_stones");

  // --- the pad -------------------------------------------------------------
  // Laid first, so every stone above has ground under it and the turf reads as
  // a tended clearing rather than as whatever the terrain happened to be.
  for (const { x, z } of disc(span, span - 2)) {
    put(x, 0, z, (x + z) % 5 === 0 ? "podzol" : "grass_block");
  }

  // --- the ring of pairs ---------------------------------------------------
  for (const point of ringPoints(span, (span - 1) / 2 - 1)) {
    // The partner: one cell round the ring, toward the centre's other axis.
    const c = (span - 1) / 2;
    const px = point.x + (point.z === c ? 0 : point.x <= c ? 1 : -1);
    const pz = point.z + (point.x === c ? 0 : point.z <= c ? 1 : -1);
    for (const stone of [point, { x: px, z: pz }]) {
      if (stone.x < 0 || stone.x >= span || stone.z < 0 || stone.z >= span) continue;
      const h = rng.int(2, 4);
      for (let y = 1; y <= h; y++) put(stone.x, y, stone.z, megalith(palette, stone.x, y, stone.z));
    }
  }

  // --- the centre ----------------------------------------------------------
  // A low altar slab in the middle: one block, with a slab on it.
  const c = (span - 1) / 2;
  put(c, 1, c, palette.stoneAccent);
  put(c, 2, c, palette.stoneSlab, { type: "bottom", waterlogged: "false" });

  return { ops: NO_OPS, meta: metaOf("standing_stones") };
};

/**
 * `henge` — the big ring: a banked earth rim and a circle of trilithons.
 *
 * Three parts, and each answers a support question before it answers an
 * aesthetic one:
 *
 * - **the bank** is a rim of *full blocks* one and two courses high round the
 *   outside, laid on the pad, so it is earth piled up rather than a wall
 *   standing on nothing;
 * - **the trilithons** are the monument. Two posts three courses tall, one
 *   cell apart, and a **lintel** lying across both at the fourth course. The
 *   lintel is a full cube whose faces below at each end are post — so it has
 *   non-air faces and `floating.isolated` never fires — and the one cell of
 *   lintel between the posts touches lintel on two faces and post beneath it
 *   diagonally, which is why the gap is one cell and never two;
 * - **the centre** is a low altar of dressed stone, the same idiom as the
 *   standing stones' but wider.
 */
const henge: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const span = HENGE_SPAN;
  const c = (span - 1) / 2;
  const rng = ctx.rng("henge");

  // --- the pad and the banked rim ------------------------------------------
  for (const { x, z } of disc(span, span - 2)) {
    put(x, 0, z, (x * 3 + z) % 7 === 0 ? "coarse_dirt" : "grass_block");
  }
  // The bank: the outermost ring of the disc, raised one course, with a second
  // course on every other cell so it reads as a weathered earthwork.
  const rim = disc(span, span - 2).filter(
    ({ x, z }) => Math.abs(x - c) + Math.abs(z - c) >= span - 4,
  );
  for (const { x, z } of rim) {
    put(x, 1, z, (x + z) % 4 === 0 ? "coarse_dirt" : "grass_block");
    if ((x * 5 + z * 3) % 3 === 0) put(x, 2, z, "grass_block");
  }

  // --- the trilithons ------------------------------------------------------
  // Eight of them, on the compass points of a ring inside the bank. Each is
  // built along whichever axis keeps its two posts tangential to the circle.
  for (const point of ringPoints(span, c - 3)) {
    const alongX = Math.abs(point.z - c) >= Math.abs(point.x - c);
    const ax = alongX ? 1 : 0;
    const az = alongX ? 0 : 1;
    const posts: { x: number; z: number }[] = [
      { x: point.x - ax, z: point.z - az },
      { x: point.x + ax, z: point.z + az },
    ];
    const height = rng.int(3, 4);
    let legal = true;
    for (const p of posts) {
      if (p.x < 1 || p.x >= span - 1 || p.z < 1 || p.z >= span - 1) legal = false;
    }
    if (!legal) continue;
    for (const p of posts) {
      for (let y = 1; y <= height; y++) put(p.x, y, p.z, megalith(palette, p.x, y, p.z));
    }
    // THE LINTEL. Three cells at `height + 1`: one over each post — resting
    // directly on it — and the single cell between them, which touches lintel
    // on both sides. Never wider than one cell of span, so no lintel block is
    // ever more than one cell from a post head.
    for (let d = -1; d <= 1; d++) {
      const lx = point.x + ax * d;
      const lz = point.z + az * d;
      put(lx, height + 1, lz, palette.stoneAccent);
    }
  }

  // --- the altar -----------------------------------------------------------
  for (let dx = -1; dx <= 1; dx++) {
    put(c + dx, 1, c, palette.stoneAccent);
    put(c + dx, 2, c, palette.stoneSlab, { type: "bottom", waterlogged: "false" });
  }

  return { ops: NO_OPS, meta: metaOf("henge") };
};

/**
 * `monolith` — one great stone, weathered, and leaning.
 *
 * The whole prop is one 2x2 column nine courses tall, and the lean is the
 * point. A block cannot be tilted, so the lean is **offset courses**: every
 * third course the footprint shifts one cell along `+x`, and because the shift
 * is one cell the new course still overlaps three of the four cells beneath
 * it. Every block therefore rests on stone; nothing is cantilevered into air.
 *
 * The banding is bedding-plane cladding by course, so the stone reads as
 * layered rock rather than as a brick pillar, and a mossy skirt at the base
 * says it has stood a long time.
 */
const monolith: PropGenerator = ({ put, palette }) => {
  const span = MONOLITH_SPAN;
  const base = 1;

  // --- the plinth of turf and rubble ---------------------------------------
  for (const { x, z } of disc(span, span - 2)) {
    put(x, 0, z, (x + z) % 3 === 0 ? "mossy_cobblestone" : "coarse_dirt");
  }

  // --- the stone -----------------------------------------------------------
  for (let y = 1; y < MONOLITH_H; y++) {
    const lean = Math.floor(y / 3); // 0, 0, 0, 1, 1, 1, 2, 2, 2 — one cell a time
    for (let dx = 0; dx <= 1; dx++) {
      for (let dz = 0; dz <= 1; dz++) {
        put(base + lean + dx, y, base + dz, banded(palette, y));
      }
    }
  }
  // The mossy skirt: the ring of cells round the foot of the stone.
  for (const [dx, dz] of [
    [-1, 0],
    [2, 0],
    [-1, 1],
    [2, 1],
    [0, -1],
    [1, -1],
    [0, 2],
    [1, 2],
  ] as const) {
    put(base + dx, 1, base + dz, "mossy_cobblestone");
  }

  return { ops: NO_OPS, meta: metaOf("monolith") };
};

/**
 * `burial_mound` — a sod dome with a stone doorway read, and no interior.
 *
 * The dome is the corbel idiom of the archetype files, run as a prop: a disc
 * of turf that steps in a cell per course and closes on a **solid** centre.
 * Every course rests on the ring below it and the cap is solid, so there is no
 * apex cell with nothing to join to.
 *
 * **There is no room inside.** A mound with a sealed chamber in it is a pocket
 * the traversal lint cannot reach, and a mound with an *open* chamber is a
 * building — which is what `ruined_*` is for. What this prop has is a
 * **doorway read**: a stone-framed recess two courses tall in the south face,
 * one cell deep, with a dark backing block. It looks like a way in from six
 * blocks away and is solid rock when you get there, which is exactly what a
 * sealed barrow is.
 */
const burialMound: PropGenerator = ({ put, palette }) => {
  const span = MOUND_SPAN;
  const c = (span - 1) / 2;

  // --- the kerb ------------------------------------------------------------
  for (const { x, z } of disc(span, span - 2)) {
    put(x, 0, z, Math.abs(x - c) + Math.abs(z - c) >= span - 3 ? "mossy_cobblestone" : "podzol");
  }

  // --- the dome ------------------------------------------------------------
  // A course per step in, closing on a solid cap. The mound is turf over the
  // whole of it except the cap, which is bare rock the weather got at.
  let y = 1;
  let radius = span - 3;
  let capX = c;
  let capZ = c;
  while (radius >= 0) {
    for (const cell of disc(span, radius)) {
      put(cell.x, y, cell.z, (cell.x + cell.z + y) % 6 === 0 ? "coarse_dirt" : "grass_block");
    }
    capX = c;
    capZ = c;
    if (radius === 0) break;
    y++;
    radius -= 2;
  }
  put(capX, y, capZ, "mossy_cobblestone");

  // --- the doorway read ----------------------------------------------------
  // A stone frame in the south face at the foot of the dome, one cell deep and
  // backed solid. The two jambs and the lintel over them are full blocks that
  // rest on the block below or on the jamb beside them.
  const dz = c + (span - 3) / 2 >= span - 1 ? span - 1 : c + 3;
  for (const dx of [c - 1, c + 1]) {
    for (let dy = 1; dy <= 2; dy++) put(dx, dy, dz, palette.stoneAccent);
  }
  for (let dx = c - 1; dx <= c + 1; dx++) put(dx, 3, dz, palette.stoneAccent);
  // The recess itself: air where the dome's turf would be, backed by the dome.
  for (let dy = 1; dy <= 2; dy++) put(c, dy, dz, "polished_deepslate");

  return { ops: NO_OPS, meta: metaOf("burial_mound") };
};

/* -------------------------------------------------------------------------- */
/* the digs                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The shared dig: a roped trench, a spoil heap and a finds table.
 *
 * A trench is a **recolour**, not a hole. Digging down would put the prop's
 * ops below `y = 0`, which the placer would have to reserve depth for and the
 * ground pass would have to agree to; a shallow bed of `coarse_dirt` and
 * `packed_mud` in the base plane reads as excavated ground and costs nothing.
 * **Never plain `mud`** — mud is a block a player sinks into, which is a trap
 * nobody asked a dig site for.
 *
 * The rope line is fence pegs with fences between them, every one of them
 * standing on the pad this function lays first — the grounded-apron rule, in
 * the only form a free-standing prop has of it. The marker is a **banner**,
 * standing on a solid block, because a sign is a block entity.
 *
 * `fossil` adds the ribs; everything else is identical, which is the point —
 * a fossil dig is a dig site with something in it.
 */
function digSite(ctx: Parameters<PropGenerator>[0], fossil: boolean): void {
  const { put, palette } = ctx;
  const w = DIG_W;
  const d = DIG_D;
  const rng = ctx.rng(fossil ? "fossil_dig" : "dig_site");

  // --- the ground ----------------------------------------------------------
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      const trench = x >= 2 && x <= w - 3 && z >= 2 && z <= d - 3;
      if (trench) {
        put(x, 0, z, (x + z) % 3 === 0 ? "packed_mud" : "coarse_dirt");
        continue;
      }
      put(x, 0, z, (x * 3 + z) % 5 === 0 ? "coarse_dirt" : "grass_block");
    }
  }

  // --- the rope line -------------------------------------------------------
  // Pegs at the corners of the trench, fence between them: the whole run rests
  // on the pad at `y = 0`, so `groundedChain` closes in one link everywhere.
  for (let x = 1; x <= w - 2; x++) {
    for (const z of [1, d - 2]) put(x, 1, z, palette.fence);
  }
  for (let z = 2; z <= d - 3; z++) {
    for (const x of [1, w - 2]) put(x, 1, z, palette.fence);
  }
  // The pegs stand a course taller than the rope, which is what makes it read
  // as a roped line rather than as a paddock fence.
  for (const [px, pz] of [
    [1, 1],
    [w - 2, 1],
    [1, d - 2],
    [w - 2, d - 2],
  ] as const) {
    put(px, 2, pz, palette.fence);
  }

  // --- the spoil heap ------------------------------------------------------
  // Outside the rope, on the pad. Two courses, the upper one narrower, so
  // every block rests on the heap or the ground.
  const hx = w - 2;
  const hz = d - 2;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const x = hx + dx;
      const z = hz + dz;
      if (x < 0 || x >= w || z < 0 || z >= d) continue;
      if (Math.abs(dx) + Math.abs(dz) > 1) continue;
      put(x, 1, z, (x + z) % 2 === 0 ? "coarse_dirt" : "gravel");
    }
  }
  put(hx, 2, hz, "gravel");

  // --- the finds table -----------------------------------------------------
  // A barrel of finds and a marker banner, on the dry side of the trench.
  put(1, 1, 1, "barrel", { facing: "up", open: "false" });
  put(1, 2, 1, "white_banner", { rotation: String(rng.int(0, 15)) });
  put(2, 1, 1, palette.stoneSlab, { type: "top", waterlogged: "false" });

  // --- the finds -----------------------------------------------------------
  // Suspicious sand in the bed: half-brushed, and a full block, so it takes no
  // support rule at all.
  for (let z = 3; z <= d - 4; z += 2) {
    for (let x = 3; x <= w - 4; x += 3) {
      if (rng.int(0, 3) === 0) continue;
      put(x, 0, z, "suspicious_sand");
    }
  }

  if (!fossil) return;

  // --- the ribs ------------------------------------------------------------
  // Bone blocks half-exposed in the bed: a run laid **in the base plane**, so
  // each rib block is flush with the ground it lies in and nothing is raised,
  // plus a pair of arcs one course up whose every block touches its neighbour
  // and the bed beneath it.
  const spine = (d - 1) >> 1;
  for (let x = 3; x <= w - 4; x++) {
    put(x, 0, spine, "bone_block", { axis: "x" });
  }
  for (let x = 4; x <= w - 5; x += 2) {
    for (const dz of [-1, 1]) {
      put(x, 0, spine + dz, "bone_block", { axis: "z" });
      // The rib standing proud of the bed: one block, on the rib below it.
      put(x, 1, spine + dz, "bone_block", { axis: "y" });
    }
  }
  put(3, 1, spine, "bone_block", { axis: "y" });
}

/** `dig_site` — the roped trench, without a find big enough to name. */
const digSitePlain: PropGenerator = (ctx) => {
  digSite(ctx, false);
  return { ops: NO_OPS, meta: metaOf("dig_site") };
};

/** `fossil_dig` — the same dig, with something enormous half out of the bed. */
const fossilDig: PropGenerator = (ctx) => {
  digSite(ctx, true);
  return { ops: NO_OPS, meta: metaOf("fossil_dig") };
};

/* -------------------------------------------------------------------------- */
/* the obelisk                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `shattered_obelisk` — a stump, the section that fell off it, and the scatter.
 *
 * Three pieces, and every one of them is grounded or joined:
 *
 * - **the stump**: a 2x2 column {@link OBELISK_STUMP_H} courses tall on a
 *   dressed pad, its top course deliberately ragged — the ragged read is
 *   *fewer* blocks on the last course, never blocks hanging off the side;
 * - **the fallen section**: a run lying along `+x` beside the stump, two cells
 *   wide, laid **on the pad** at `y = 1` with a second course over its middle.
 *   Every block of the run rests on the pad or on the run; the second course
 *   rests on the first;
 * - **the scatter**: single blocks and a slab or two on the pad around the
 *   break, each on the ground.
 */
const shatteredObelisk: PropGenerator = (ctx) => {
  const { put, palette } = ctx;
  const w = OBELISK_W;
  const d = OBELISK_D;
  const rng = ctx.rng("shattered_obelisk");

  // --- the pad -------------------------------------------------------------
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < d; z++) {
      put(x, 0, z, (x + z) % 4 === 0 ? "mossy_cobblestone" : "coarse_dirt");
    }
  }
  // The dressed base the obelisk stood on: a plinth ring one course high.
  for (let x = 0; x <= 3; x++) {
    for (let z = 1; z <= d - 2; z++) {
      if (x === 0 || x === 3 || z === 1 || z === d - 2) put(x, 1, z, palette.stoneAccent);
    }
  }

  // --- the stump -----------------------------------------------------------
  const bx = 1;
  const bz = (d - 1) >> 1;
  for (let y = 1; y <= OBELISK_STUMP_H; y++) {
    for (let dx = 0; dx <= 1; dx++) {
      for (let dz = 0; dz <= 1; dz++) {
        // The break: the top course loses a corner or two, chosen from the
        // node's own stream. Removing blocks can never strand one — what is
        // left still rests on the full course beneath it.
        if (y === OBELISK_STUMP_H && rng.int(0, 3) === 0) continue;
        put(bx + dx, y, bz + dz - 1, banded(palette, y));
      }
    }
  }

  // --- the fallen upper section --------------------------------------------
  // Lying along +x on the pad. Two cells wide, so the section reads as the
  // same stone that came off the top; a shorter second course rides its middle.
  const runFrom = 4;
  const runTo = w - 2;
  for (let x = runFrom; x <= runTo; x++) {
    for (let dz = 0; dz <= 1; dz++) put(x, 1, bz + dz - 1, banded(palette, x));
  }
  for (let x = runFrom + 1; x <= runTo - 1; x++) {
    put(x, 2, bz - 1, banded(palette, x + 1));
  }

  // --- the scatter ---------------------------------------------------------
  // Fragments on the pad around the break, each standing on the ground.
  for (const [sx, sz] of [
    [3, 0],
    [4, d - 1],
    [runTo, 0],
    [runTo - 2, d - 1],
  ] as const) {
    if (sx < 0 || sx >= w || sz < 0 || sz >= d) continue;
    put(sx, 1, sz, palette.stoneSlab, { type: "bottom", waterlogged: "false" });
  }
  put(runFrom - 1, 1, bz + 1, "cobblestone");

  return { ops: NO_OPS, meta: metaOf("shattered_obelisk") };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Name → generator, spread into `PROP_GENERATORS` by `props.ts`.
 *
 * Adding a prop is one entry here and one name in {@link RELIC_PROP_NAMES},
 * and the catalog test holds the two against each other.
 */
const RELIC_PROP_GENERATORS: Readonly<Record<RelicPropName, PropGenerator>> = Object.freeze({
  standing_stones: standingStones,
  henge,
  monolith,
  burial_mound: burialMound,
  dig_site: digSitePlain,
  fossil_dig: fossilDig,
  shattered_obelisk: shatteredObelisk,
});

/* -------------------------------------------------------------------------- */
/* the dev-world rows                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The exhibit rows for this wave, in the shape `PROP_EXHIBIT_PLAN` spreads.
 *
 * The plan lives here beside the generators for the reason
 * `props-wayside.ts`'s does: `exhibits/props.ts` is shared ground between
 * parallel tracks, and registering a wave there has to stay one import and one
 * spread. The compiler-side adapter re-types it.
 */
export const RELIC_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly {
    readonly prop: RelicPropName;
    readonly params: Record<string, unknown>;
  }[];
}[] = Object.freeze([
  {
    row: "relic_stones",
    water: false,
    cells: [
      { prop: "standing_stones", params: { yaw: 0 } },
      { prop: "henge", params: { yaw: 0 } },
      { prop: "monolith", params: { yaw: 0 } },
      { prop: "monolith", params: { yaw: 90 } },
      { prop: "shattered_obelisk", params: { yaw: 0 } },
      { prop: "shattered_obelisk", params: { yaw: 180 } },
    ],
  },
  {
    row: "relic_digs",
    water: false,
    cells: [
      { prop: "burial_mound", params: { yaw: 0 } },
      { prop: "dig_site", params: { yaw: 0 } },
      { prop: "dig_site", params: { yaw: 90 } },
      { prop: "fossil_dig", params: { yaw: 0 } },
      { prop: "fossil_dig", params: { yaw: 270 } },
    ],
  },
]);

/**
 * Ordered prop descriptors for this pack, delegating to existing handles.
 *
 * Footprint delegates to {@link relicPropFootprint}; generator is the leaf
 * {@link RELIC_PROP_GENERATORS} handle. No voxel or ordering change — this
 * array is for the Phase 4 registry and preserves {@link RELIC_PROP_NAMES}
 * order.
 */
export const RELIC_PROP_DESCRIPTORS = definePropDescriptors(RELIC_PROP_NAMES, {
  footprint: (id) => relicPropFootprint(id),
  generator: RELIC_PROP_GENERATORS,
});

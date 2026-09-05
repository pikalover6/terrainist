/**
 * `prop.place@0` — the **nautical & pirate pack**'s shore props (§3.2).
 *
 * Five things a body walks past on a pirate island, and between them they are
 * the whole of Kai's verdict on battery P1 (*"the pirate island NEEDS, like, a
 * jolly roger flag, treasure chests, parrots"*) that a **prop** can answer:
 *
 * - `jolly_roger_mast` — the icon. A ship's mast standing on land over the
 *   harbour with a black flag at the head;
 * - `gallows` and `gibbet_cage` — the law, on the point and at the crossroads.
 *   The gibbet is deliberately tiny, because three of them say more than one
 *   gallows and this pack is a *saturation* pack;
 * - `beached_wreck` and `careening_beach` — the two hulls that are not afloat:
 *   one driven up the strand with its ribs open to the sky, one hove down on
 *   its side with the tackle still on her.
 *
 * The contract is `props.ts`'s, unchanged, and the leaf discipline is
 * `props-classical.ts`'s: **types** are imported from `props.ts` and no values
 * at all, so the one edge `props.ts` → this file cannot become a cycle at
 * module-initialisation time. Node-local coordinates, `y = 0` is the base
 * plane, block *names* with a property map, every op inside the declared box
 * so `rotateOps` needs no special case.
 *
 * The lessons this file is written against, every one of them somebody else's
 * scar:
 *
 * 1. **Support closure.** Every block rests on the base plane or touches
 *    another of this prop's own blocks by a face. Nothing anywhere has six air
 *    faces, and there is not one diagonal chain in the file: a rib climbs by
 *    an L of two cells, never by a step across a corner.
 * 2. **`chain` does not exist in the pinned 1.21.11 table.** Every noose,
 *    fall, stay and tackle here is `iron_bars`, which is also not a full cube
 *    and not on the support-chain list, so a fall hanging off a beam is a
 *    fall rather than a finding.
 * 3. **No lit fire, no signs, no bare flower pots.** The careening fires are
 *    `campfire` with `lit=false` standing on the sand — a campfire is on the
 *    ground-chain list, so it goes in the base plane and nowhere else.
 * 4. **Gravity blocks only on a floor.** The wreck's spilled cargo puts sand
 *    in the base plane; there is no sand anywhere above it.
 * 5. **Seeded, never positional.** Unlike a building fit-out a prop *does* get
 *    an RNG (`ctx.rng`), so the dressing is drawn from named streams of the
 *    node seed. Same seed, same wreck, forever — and two wrecks a hundred
 *    blocks apart are different wrecks.
 *
 * ## The one thing this file must get right
 *
 * **The flag is black in every theme.** The palette is the town's and the
 * jolly roger is not: `black_wool` and `white_wool` are written as fixed
 * blocks, exactly as the alien pack writes its chitin, because a skull that
 * came out sandstone in `sun_clay` would be a flag nobody could name from
 * across the bay — and naming it from across the bay is the entire job.
 */

import type { LocalVoxelOp } from "./core.js";
import { definePropDescriptors } from "./descriptor.js";
import type { PropBase, PropGenerator, PropMeta } from "./props.js";

/* -------------------------------------------------------------------------- */
/* the catalog                                                                 */
/* -------------------------------------------------------------------------- */

/** Every prop this file builds, in catalog order. */
export const CORSAIR_PROP_NAMES = [
  "jolly_roger_mast",
  "gallows",
  "gibbet_cage",
  "careening_beach",
  "beached_wreck",
] as const;

/** One of the props this file builds. */
export type CorsairPropName = (typeof CORSAIR_PROP_NAMES)[number];

/** True for a name this file answers to. */
export function isCorsairProp(name: string): name is CorsairPropName {
  return (CORSAIR_PROP_NAMES as readonly string[]).includes(name);
}


/* -------------------------------------------------------------------------- */
/* the flag's own materials                                                    */
/* -------------------------------------------------------------------------- */

/** The field of the flag. Fixed, never the theme's — see the module docs. */
const FLAG_FIELD = "black_wool";
/** The skull and the bones on it. Fixed for the same reason. */
const FLAG_MARK = "white_wool";
/** The rigging, everywhere in this file. `chain` is not in the pinned table. */
const RIGGING = "iron_bars";
/** The rigging's state: a free-hanging length, joined to nothing sideways. */
const RIGGING_FREE: Record<string, string> = Object.freeze({
  north: "false",
  south: "false",
  east: "false",
  west: "false",
  waterlogged: "false",
}) as Record<string, string>;

/* -------------------------------------------------------------------------- */
/* extents                                                                     */
/* -------------------------------------------------------------------------- */

/** The mast's plan — a square of quay with the spar in the middle of it. */
const JOLLY_MAST_SPAN = 9;
/** How tall the mast stands, pennant included. */
const JOLLY_MAST_HEIGHT = 19;

/** The gallows' plan across the point. */
const GALLOWS_WIDTH = 7;
/** The gallows' plan along the approach. */
const GALLOWS_DEPTH = 5;

/** The gibbet is a post and an arm: three cells of ground and no more. */
const GIBBET_SPAN = 3;

/** The careened hull's beam, tackle and shore anchors included. */
const CAREEN_WIDTH = 15;
/** The careened hull's length along the strand. */
const CAREEN_LENGTH = 19;

/** The wreck's beam across the strand. */
const WRECK_WIDTH = 9;
/** The wreck's length up the strand, the spilled stern included. */
const WRECK_LENGTH = 25;

/** The declared box of one of this file's props, before it is generated. */
function corsairPropFootprint(prop: CorsairPropName): {
  readonly size: readonly [number, number, number];
  readonly minY: number;
  readonly base: PropBase;
} {
  switch (prop) {
    case "jolly_roger_mast":
      return { size: [JOLLY_MAST_SPAN, JOLLY_MAST_HEIGHT, JOLLY_MAST_SPAN], minY: 0, base: "ground" };
    case "gallows":
      return { size: [GALLOWS_WIDTH, 7, GALLOWS_DEPTH], minY: 0, base: "ground" };
    case "gibbet_cage":
      return { size: [GIBBET_SPAN, 5, GIBBET_SPAN], minY: 0, base: "ground" };
    case "careening_beach":
      return { size: [CAREEN_WIDTH, 7, CAREEN_LENGTH], minY: 0, base: "ground" };
    case "beached_wreck":
    default:
      return { size: [WRECK_WIDTH, 7, WRECK_LENGTH], minY: 0, base: "ground" };
  }
}

/** Build a `PropMeta` from the declared footprint, so the two cannot drift. */
function metaOf(prop: CorsairPropName): PropMeta {
  const foot = corsairPropFootprint(prop);
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
/* the jolly roger mast                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `jolly_roger_mast` — **the pack's headline**, and the cheapest way there is
 * to make a bay read as pirate.
 *
 * The curator's note prices it honestly ("it costs two hundred blocks") and
 * every one of them goes on the silhouette, which has exactly four parts:
 *
 * 1. **the mast**, a spar of the theme's own log standing sixteen courses out
 *    of a diamond of quay paving. Sixteen and not eight: the read is *ship's
 *    mast on dry land*, and a short pole is a flagpole, which the catalog
 *    already has;
 * 2. **the yard**, a stripped log crossing it near the head. The crossing spar
 *    is what tells the eye "ship" before it has read the flag at all — a mast
 *    without a yard is a mast in a marina;
 * 3. **the flag**, a seven by five field of `black_wool` hung under the yard
 *    with a `white_wool` skull and crossed bones in it. Written as fixed
 *    blocks in every palette, for the reason the module docs give;
 * 4. **the top and the ratlines** — a small platform at the hounds and a
 *    ladder up the mast to it, which is the detail that makes the whole thing
 *    read as *rigged* rather than as a pole with a sheet on it. The ladder
 *    brackets to the mast, so it is a ladder and not a finding.
 *
 * Everything else is quay dressing, drawn from a seeded stream: a coiled
 * hawser, a bitt, a barrel. The flag itself is never drawn — a jolly roger
 * that came out different on a different seed would be a different flag.
 */
const jollyRogerMast: PropGenerator = ({ put, palette, rng }) => {
  const draw = rng("jolly_roger");
  const mid = (JOLLY_MAST_SPAN - 1) >> 1;

  // **The mast stands to one side of its box, not in the middle of it.** A
  // flag flies *off* a mast: centred, its field would be written through the
  // spar and the skull would come out with a log through its face. So the
  // spar is at `x = 1`, the quay is the diamond round its foot, and the whole
  // rest of the box is the air the flag hangs in.
  const mastX = 1;

  // --- the quay -------------------------------------------------------------
  // A diamond of paving round the foot, reaching three sides of the declared
  // box; the diagonals are nibbled by the draw so it never reads as a drawn
  // shape.
  for (let z = 0; z < JOLLY_MAST_SPAN; z++) {
    for (let x = 0; x < JOLLY_MAST_SPAN; x++) {
      const d = Math.abs(x - mastX) + Math.abs(z - mid);
      if (d > mid) continue;
      const onAxis = x === mastX || z === mid;
      if (d === mid && !onAxis && draw.int(0, 2) === 0) continue;
      put(x, 0, z, (x + z) % 4 === 0 ? palette.stoneAccent : palette.stone);
    }
  }

  // --- the mast -------------------------------------------------------------
  const head = JOLLY_MAST_HEIGHT - 3;
  for (let y = 1; y <= head; y++) put(mastX, y, mid, palette.log, { axis: "y" });

  // --- the top --------------------------------------------------------------
  // A platform at the hounds: the four cells round the mast, each of them
  // touching it. A cantilever, not a floating ring — and it sits **below** the
  // flag's field rather than through it, because two writes to one cell is a
  // platform with a hole in the jolly roger.
  const topY = head - 8;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const x = mastX + dx;
    if (x < 0 || x >= JOLLY_MAST_SPAN) continue;
    put(x, topY, mid + dz, palette.planks);
  }

  // --- the ratlines ---------------------------------------------------------
  // Up the south face of the mast to the top, bracketing to the mast itself:
  // a ladder's support is the block its `facing` points away from.
  for (let y = 1; y < topY; y++) {
    put(mastX, y, mid + 1, "ladder", { facing: "south", waterlogged: "false" });
  }

  // --- the yard -------------------------------------------------------------
  const yardY = head - 1;
  for (let x = mastX; x < JOLLY_MAST_SPAN; x++) put(x, yardY, mid, palette.stripped, { axis: "x" });

  // --- the flag -------------------------------------------------------------
  // Seven wide and five deep, hung under the yard **abaft the mast** so its
  // top course touches the spar all the way along. The mark is a constant, not
  // a draw: rows read from the top down, `X` is white.
  const SKULL: readonly string[] = [
    ".XXXXX.",
    ".X.X.X.",
    "..XXX..",
    "XX...XX",
    "..XXX..",
  ];
  for (const [row, bits] of SKULL.entries()) {
    const y = yardY - 1 - row;
    for (let i = 0; i < bits.length; i++) {
      put(mastX + 1 + i, y, mid, bits.charAt(i) === "X" ? FLAG_MARK : FLAG_FIELD);
    }
  }

  // --- the pennant ----------------------------------------------------------
  // A standing banner on the masthead: it stands on the block below it, which
  // is the mast, which is the whole support argument.
  put(mastX, head + 1, mid, "black_banner", { rotation: "0" });

  // --- the quay dressing ----------------------------------------------------
  // Drawn, and deliberately the only drawn thing here.
  for (const [dx, dz] of [
    [2, 0],
    [1, 2],
    [1, -2],
    // Never the ratline's own column: a barrel written into it would leave the
    // ladder with a rung missing.
    [-1, 0],
  ] as const) {
    const x = mastX + dx;
    const z = mid + dz;
    const roll = draw.int(0, 2);
    if (roll === 0) put(x, 1, z, palette.cargo, { facing: "up", open: "false" });
    else if (roll === 1) put(x, 1, z, "brown_carpet");
    else put(x, 1, z, palette.stoneAccent);
  }

  return { ops: NO_OPS, meta: metaOf("jolly_roger_mast") };
};

/* -------------------------------------------------------------------------- */
/* the gallows                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `gallows` — two posts, a beam, a noose and a trap, on a paved point.
 *
 * The read is the **gate shape**: two uprights and a crossbeam, which the eye
 * names from further away than any amount of detail on the platform under it.
 * So the posts go the full height of the box and the beam spans them, and the
 * noose is three links of bar hanging from the middle of the beam — the one
 * place where the silhouette becomes unambiguous.
 *
 * The platform is a real platform: a deck of planks a course above the paving
 * with a stair up to it and the trap set in the middle. Standable, because a
 * prop with a deck a body cannot get onto is a prop with a decorative deck.
 */
const gallows: PropGenerator = ({ put, palette, rng }) => {
  const draw = rng("gallows");
  const mx = (GALLOWS_WIDTH - 1) >> 1;

  // --- the paving -----------------------------------------------------------
  for (let z = 0; z < GALLOWS_DEPTH; z++) {
    for (let x = 0; x < GALLOWS_WIDTH; x++) {
      put(x, 0, z, (x + z) % 3 === 0 ? palette.stoneAccent : palette.stone);
    }
  }

  // --- the deck -------------------------------------------------------------
  // Three by three, a course up, with the trap in the middle of it.
  for (let z = 1; z <= 3; z++) {
    for (let x = mx - 1; x <= mx + 1; x++) put(x, 1, z, palette.planks);
  }
  put(mx, 1, 2, palette.trapdoor, {
    facing: "north",
    half: "top",
    open: "false",
    powered: "false",
    waterlogged: "false",
  });
  // The step up: a stair on the paving at the front of the deck.
  put(mx, 1, 0, palette.stairs, {
    facing: "south",
    half: "bottom",
    shape: "straight",
    waterlogged: "false",
  });

  // --- the frame ------------------------------------------------------------
  const beamY = 5;
  for (const x of [mx - 2, mx + 2]) {
    for (let y = 1; y <= beamY; y++) put(x, y, 2, palette.log, { axis: "y" });
  }
  for (let x = mx - 2; x <= mx + 2; x++) put(x, beamY, 2, palette.log, { axis: "x" });

  // --- the noose ------------------------------------------------------------
  // Straight under the beam, the top link touching it.
  for (let y = beamY - 1; y >= beamY - 2; y--) put(mx, y, 2, RIGGING, RIGGING_FREE);

  // --- the dressing ---------------------------------------------------------
  // A barrel and a coil at the foot, on the paving, drawn from the seed.
  const side = draw.int(0, 1) === 0 ? 0 : GALLOWS_WIDTH - 1;
  put(side, 1, 1, palette.cargo, { facing: "up", open: "false" });
  put(GALLOWS_WIDTH - 1 - side, 1, GALLOWS_DEPTH - 1, "brown_carpet");

  return { ops: NO_OPS, meta: metaOf("gallows") };
};

/* -------------------------------------------------------------------------- */
/* the gibbet cage                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `gibbet_cage` — a cage on an arm at a crossroads, and the pack's cheapest
 * sentence.
 *
 * Twenty-odd blocks, which is the note's whole point: *three of them say more
 * than one gallows*, and three of anything is only affordable when one of them
 * is this size. The shape is a post, an arm off the top of it, and a cage of
 * bars hanging off the arm with something in it — every piece touching the
 * piece before it, so the whole assembly is one connected mass hanging off a
 * post that stands on the ground.
 *
 * The occupant is a `bone_block`, and the choice matters: a `skeleton_skull`
 * would be the obvious block and it is a fixture with a support rule, hung
 * inside a cage that is made of bars. A bone block is a full cube with iron
 * bars on top of it, which is a thing in a cage.
 */
const gibbetCage: PropGenerator = ({ put, palette, rng }) => {
  const draw = rng("gibbet");
  // --- the ground -----------------------------------------------------------
  for (let z = 0; z < GIBBET_SPAN; z++) {
    for (let x = 0; x < GIBBET_SPAN; x++) {
      put(x, 0, z, (x + z) % 2 === 0 ? palette.stone : palette.stoneAccent);
    }
  }

  // --- the post and the arm -------------------------------------------------
  const armY = 4;
  for (let y = 1; y <= armY; y++) put(0, y, 1, palette.log, { axis: "y" });
  put(1, armY, 1, palette.log, { axis: "x" });

  // --- the cage -------------------------------------------------------------
  // A bar under the arm, a bar either side of it, and the body under the lot.
  put(1, armY - 1, 1, RIGGING, RIGGING_FREE);
  put(1, armY - 2, 1, RIGGING, RIGGING_FREE);
  for (const dz of [-1, 1]) {
    put(1, armY - 2, 1 + dz, RIGGING, RIGGING_FREE);
  }
  put(1, armY - 3, 1, "bone_block", { axis: "y" });

  // --- the dressing ---------------------------------------------------------
  // A crow's perch or a bucket at the foot: one block, drawn, and always in
  // the far corner so the box is used.
  put(2, 1, draw.int(0, 1) === 0 ? 0 : GIBBET_SPAN - 1, palette.fence);

  return { ops: NO_OPS, meta: metaOf("gibbet_cage") };
};

/* -------------------------------------------------------------------------- */
/* the careening beach                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `careening_beach` — a hull hove down on her side on the sand.
 *
 * The hardest read in the file, because a ship on her beam ends is a ship
 * whose every familiar line is in the wrong place. What makes it legible is
 * the **heel**: the cross-section is drawn once and repeated down the strand —
 * a flat bilge lying in the sand, a side that climbs out of it, and nothing at
 * all on the other side, which is the shape of a hull rolled over. A symmetric
 * section would be a boat, and a boat is not what this is.
 *
 * Off the high side go the two things the note names and nothing else could
 * say: the **masts**, cantilevered out over the sand because that is where a
 * hove-down ship's masts point, and the **tackle** — falls of bar from each
 * masthead down to a shore anchor of posts and barrels at the edge of the box.
 * Under her, in the base plane where a campfire's support rule wants them, the
 * **fires and the pitch**: unlit campfires, cauldrons and barrels.
 *
 * Catalog note: §3.2 lists this entry as `infrastructure`, and it is realised
 * here as a **prop** — the whole thing sits in one envelope and follows no
 * route, so the prop registry is its honest host. The row's `kind` is left as
 * the curator wrote it, exactly as `curtain_wall` before it.
 */
const careeningBeach: PropGenerator = ({ put, palette, rng }) => {
  const draw = rng("careening");
  /** The high side of the hull — the flank that is rolled up out of the sand. */
  const high = 6;

  for (let z = 0; z < CAREEN_LENGTH; z++) {
    // The bilge, lying in the sand: five wide, tapering at bow and stern so
    // the mass reads as a hull rather than as a wall.
    const taper = Math.min(z, CAREEN_LENGTH - 1 - z) < 2 ? 1 : 0;
    for (let x = 2 + taper; x <= high; x++) {
      put(x, 0, z, (x + z) % 5 === 0 ? palette.stripped : palette.planks, { axis: "z" });
    }
    if (taper === 1) continue;
    // The side, climbing out of the bilge: a stepped face, each course
    // touching the one under it and the one inboard of it.
    for (let y = 1; y <= 4; y++) {
      put(high, y, z, (y + z) % 6 === 0 ? palette.stripped : palette.planks, { axis: "y" });
    }
    for (let y = 1; y <= 2; y++) put(high - 1, y, z, palette.planks);
    // The wale: a stripped course along the top of the side, which is the line
    // the eye follows down the whole hull.
    put(high, 5, z, palette.stripped, { axis: "z" });
  }

  // --- the masts and the tackle ---------------------------------------------
  // Out over the sand from the high side, at two stations. Each mast is a run
  // of cantilevered logs, every one touching the last; each fall hangs from
  // the masthead and reaches an anchor standing on the ground.
  const anchorX = CAREEN_WIDTH - 2;
  for (const z of [4, CAREEN_LENGTH - 5]) {
    for (let x = high + 1; x <= anchorX; x++) put(x, 5, z, palette.log, { axis: "x" });
    for (let y = 4; y >= 2; y--) put(anchorX, y, z, RIGGING, RIGGING_FREE);
    // The shore anchor: a post the fall comes down to, and a bitt beside it.
    put(anchorX, 1, z, palette.log, { axis: "y" });
    put(anchorX, 0, z, palette.stone);
    put(CAREEN_WIDTH - 1, 0, z, palette.stoneAccent);
    put(CAREEN_WIDTH - 1, 1, z, palette.cargo, { facing: "up", open: "false" });
  }

  // --- the fires and the pitch ----------------------------------------------
  // Under her, in the base plane: a campfire stands on the block below it and
  // its support chain has to reach the ground, so this is the only course it
  // may ever be written in. Never lit — a careening fire in a wooden ship is
  // one frame of a very short film.
  for (let z = 2; z < CAREEN_LENGTH - 2; z += 4) {
    const roll = draw.int(0, 2);
    put(1, 0, z, roll === 0 ? "campfire" : roll === 1 ? "cauldron" : palette.cargo,
      roll === 0
        ? { facing: "north", lit: "false", signal_fire: "false", waterlogged: "false" }
        : roll === 2
          ? { facing: "up", open: "false" }
          : {},
    );
    put(0, 0, z, palette.stone);
  }

  return { ops: NO_OPS, meta: metaOf("careening_beach") };
};

/* -------------------------------------------------------------------------- */
/* the beached wreck                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `beached_wreck` — a broken hull driven up the strand, ribs open to the sky.
 *
 * Distinct from Track A's submerged `sunken_ship` in the one way that matters:
 * this one is **open**. A hull with a deck on it is a boat, and a boat on a
 * beach is a boat somebody left there; what says *wreck* is the row of ribs
 * with nothing between them, which is why the ribs get most of the budget and
 * the planking gets almost none.
 *
 * Three moves down the length of the box:
 *
 * 1. **the keel and the garboards**, from the bow back to the break: a spine
 *    of log with two strakes either side of it lying in the sand;
 * 2. **the ribs**, every other station, each one an L-staircase out of the
 *    keel — two cells out, one up, two out, one up — so every cell of a rib
 *    shares a *face* with the last. A rib built as a diagonal is the floating
 *    rule with a nautical name. They shorten toward the break, which is what
 *    makes the hull look like it is coming apart rather than like it was built
 *    tapered;
 * 3. **the break and the spill**: past two thirds of the length the hull is
 *    gone, and what is left is the stern's scatter — a fallen mast lying in
 *    the sand, cargo out of the hold, and the sand itself piled up the
 *    tideline. The gravity block goes in the base plane and nowhere else.
 */
const beachedWreck: PropGenerator = ({ put, palette, rng }) => {
  const draw = rng("beached_wreck");
  const mid = (WRECK_WIDTH - 1) >> 1;
  /** Where the hull stops and the wreckage starts. */
  const brk = Math.floor((WRECK_LENGTH * 2) / 3);

  // --- the keel and the garboards -------------------------------------------
  for (let z = 0; z < brk; z++) {
    put(mid, 0, z, palette.log, { axis: "z" });
    put(mid, 1, z, palette.stripped, { axis: "z" });
    for (const dx of [-1, 1]) {
      put(mid + dx, 0, z, (z + dx) % 4 === 0 ? palette.stripped : palette.planks);
    }
  }

  // --- the ribs -------------------------------------------------------------
  // Tallest at the bow, shorter toward the break: `reach` is how far out the
  // staircase gets before it runs out of hull.
  for (let z = 1; z < brk; z += 2) {
    const reach = z < brk / 2 ? mid : Math.max(2, mid - 1);
    for (const side of [-1, 1]) {
      let y = 1;
      for (let step = 1; step <= reach; step++) {
        const x = mid + side * step;
        if (x < 0 || x >= WRECK_WIDTH) break;
        // Out one, and up one every other step: an L, never a diagonal.
        put(x, y, z, palette.planks);
        if (step % 2 === 0 && y < 4) {
          y++;
          put(x, y, z, palette.stripped, { axis: "y" });
        }
      }
    }
  }

  // --- the break and the spill ----------------------------------------------
  // The fallen mast, lying in the sand along the strand.
  const mastX = draw.int(0, 1) === 0 ? mid - 2 : mid + 2;
  for (let z = brk; z < WRECK_LENGTH; z++) put(mastX, 0, z, palette.log, { axis: "z" });
  // The cargo out of the hold, and the sand piled round it. Both in the base
  // plane: sand above a base plane cell is a gravity block over air the day the
  // world loads.
  for (let z = brk; z < WRECK_LENGTH; z++) {
    for (let x = 0; x < WRECK_WIDTH; x++) {
      if (x === mastX) continue;
      const roll = draw.int(0, 11);
      if (roll === 0) put(x, 0, z, "sand");
      else if (roll === 1) put(x, 0, z, palette.cargo, { facing: "up", open: "false" });
      else if (roll <= 3) put(x, 0, z, palette.planks);
    }
  }
  // Two ribs of the broken stern still standing out of the scatter — the
  // detail that ties the wreckage to the hull instead of leaving a spill of
  // barrels beside a boat. Each one stands on a plank of its own.
  for (const z of [brk + 1, brk + 3]) {
    if (z >= WRECK_LENGTH) break;
    for (const side of [-1, 1]) {
      const x = mid + side;
      put(x, 0, z, palette.planks);
      put(x, 1, z, palette.stripped, { axis: "y" });
    }
  }

  return { ops: NO_OPS, meta: metaOf("beached_wreck") };
};

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

/** Name → generator, spread into `PROP_GENERATORS` by `props.ts`. */
const CORSAIR_PROP_GENERATORS: Readonly<Record<CorsairPropName, PropGenerator>> = Object.freeze({
  jolly_roger_mast: jollyRogerMast,
  gallows,
  gibbet_cage: gibbetCage,
  careening_beach: careeningBeach,
  beached_wreck: beachedWreck,
});

/**
 * Dev-world exhibit rows for this pack's props, in the shape
 * `exhibits/props.ts` spreads.
 *
 * It lives here rather than compiler-side for `props-wayside.ts`'s reason:
 * `exhibits/props.ts` is shared ground between parallel tracks, and registering
 * a wave there should be one import and one spread. **Nothing consumes it
 * yet** — the pack's exhibit is the orchestrator's, built once both halves of
 * §3.2 have landed — but it is the plan this half wants.
 *
 * The gibbet is shown three times over, because the entry exists to be seen in
 * numbers; both long hulls are shown at two yaws, because they are the most
 * asymmetric things the pack ships along one axis and a rotation that failed
 * to take would be invisible at yaw 0.
 */
export const CORSAIR_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly {
    readonly prop: CorsairPropName;
    readonly params: Record<string, unknown>;
  }[];
}[] = Object.freeze([
  {
    row: "corsair_haven",
    water: false,
    cells: [
      { prop: "jolly_roger_mast", params: { yaw: 0 } },
      { prop: "gallows", params: { yaw: 0 } },
      { prop: "gibbet_cage", params: { yaw: 0 } },
      { prop: "gibbet_cage", params: { yaw: 90 } },
      { prop: "gibbet_cage", params: { yaw: 180 } },
    ],
  },
  {
    row: "corsair_strand",
    water: false,
    cells: [
      { prop: "beached_wreck", params: { yaw: 0 } },
      { prop: "beached_wreck", params: { yaw: 90 } },
      { prop: "careening_beach", params: { yaw: 0 } },
      { prop: "careening_beach", params: { yaw: 90 } },
    ],
  },
]);

/**
 * Ordered prop descriptors for this pack, delegating to existing handles.
 *
 * Footprint delegates to {@link corsairPropFootprint}; generator is the leaf
 * {@link CORSAIR_PROP_GENERATORS} handle. Preserves {@link CORSAIR_PROP_NAMES}
 * order.
 */
export const CORSAIR_PROP_DESCRIPTORS = definePropDescriptors(CORSAIR_PROP_NAMES, {
  footprint: (id) => corsairPropFootprint(id),
  generator: CORSAIR_PROP_GENERATORS,
});

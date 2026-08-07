/**
 * The **dressing audit** — four defect classes Kai walked on 2026-08-07 that
 * `walkability.ts` was blind to, each turned into a number.
 *
 * `walkability.ts` measures the town as a *graph*: can you get there, and does
 * a drop earn its run. It answers those well and it cannot see any of the four
 * things a walker actually complained about on the last pass over the hillside
 * fixtures, because all four are **legal, connected, well-formed geometry that
 * looks wrong**:
 *
 * 1. **A floating half-slab.** `dressStreetStairs` lays its tread mix *into* the
 *    flight's top course, so a `type: top` slab leaves the bottom half of its
 *    own block cell empty. Where the column beside it was cut lower and nothing
 *    filled the subsurface, that empty half opens sideways and the slab reads as
 *    cantilevered over a slot of bare earth. The graph does not care: you can
 *    still walk on it.
 * 2. **An intersection cutoff.** A street column two or more blocks below the
 *    street column beside it — a rectangular bite out of the pavement — and the
 *    lantern that was planted against the *pre-cut* level standing in the hole.
 *    Again legal: the two columns are simply not an edge.
 * 3. **A plinth road.** A carriageway sitting one block proud of unclaimed
 *    ground on *both* sides for a long run. Perfectly connected; reads as a
 *    paving slab dropped on a field.
 * 4. **A sheer built face.** `walkability.ts` measures faces only at the edge of
 *    *laid* paving, and only asks whether their drop is *served*. A six-block
 *    masonry wall with a stair round the corner passes that test and is still a
 *    six-block masonry wall. This one scans the whole town, not the paving, and
 *    asks a different question: is the face built, is it tall, and is it long.
 *
 * Everything here is a **readback**: it opens no plan and trusts no
 * declaration, because every one of these four is a disagreement *between* a
 * declaration and what got written. The audit is handed a small accessor
 * bundle ({@link DressingProbe}) rather than a world, so it shares
 * `walkability.ts`' single load of the region files.
 *
 * The numbers this returns are **defect goldens**. They must go DOWN.
 */

import type { AttributedBlock, WalkSurface } from "./walkability.js";

/* -------------------------------------------------------------------------- */
/* what the audit is handed                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The world, as the four detectors need to see it.
 *
 * Deliberately a bundle of closures rather than the chunk map: `walkability.ts`
 * has already paid for the load, the name cache and the block vocabulary, and a
 * second module re-deriving "can you stand here" is exactly how two audits come
 * to disagree about the same world.
 */
export interface DressingProbe {
  /** Block name at a cell, `"air"` when empty. */
  readonly nameAt: (x: number, y: number, z: number) => string;
  /** Name and blockstate properties, or `undefined` when the state is unknown. */
  readonly propsAt: (
    x: number,
    y: number,
    z: number,
  ) => { readonly name: string; readonly props: Readonly<Record<string, string>> } | undefined;
  /** True when the cell is empty (state id 0). */
  readonly airAt: (x: number, y: number, z: number) => boolean;
  /** True when a player standing on this cell has floor under their feet. */
  readonly supportAt: (x: number, y: number, z: number) => boolean;
  /** True when a 1×2 body fits at `(x, y, z)` with floor beneath. */
  readonly standable: (x: number, y: number, z: number) => boolean;
  /** First standable cell at or below `from`, looking down. */
  readonly groundStanding: (x: number, z: number, from: number) => number | null;
  /** `"x,z"` → the y a walker's feet occupy on the paving there. */
  readonly feet: ReadonlyMap<string, number>;
  /** `"x,z"` → every emitter that declared it. */
  readonly laidBy: ReadonlyMap<string, readonly string[]>;
  /** `"x,z"` → the roles declared there. */
  readonly roleAt: ReadonlyMap<string, ReadonlySet<WalkSurface["role"]>>;
  /** Every emitted structure block with the pass that placed it. */
  readonly blocks: readonly AttributedBlock[];
  /** The town's plan bounds — detector 4's scan window. */
  readonly town?: {
    readonly x0: number;
    readonly z0: number;
    readonly x1: number;
    readonly z1: number;
  };
  readonly minY: number;
  readonly maxY: number;
}

/* -------------------------------------------------------------------------- */
/* what it answers                                                             */
/* -------------------------------------------------------------------------- */

/** A tread whose underside is open to the air beside it. */
export interface FloatingSlab {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The dressing block itself — `stone_brick_slab`, `stone_brick_stairs`, … */
  readonly block: string;
  /** Emitters that declared this column. */
  readonly emitters: readonly string[];
  /** Blocks of open air under the slab's own half-cell, on the worst side. */
  readonly gap: number;
  /** What you see at the bottom of that gap, or `"void"`. */
  readonly floor: string;
  /** True when the slab has nothing at all in the cell below it. */
  readonly cantilevered: boolean;
}

/** A flight's own tread column that surfaced as bare ground. */
export interface SoilTread {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The block a walker stands on there. */
  readonly block: string;
  /** Every emitter that declared the column. */
  readonly emitters: readonly string[];
}

/** A lamp standing below the pavement it lights. */
export interface SunkenProp {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly block: string;
  readonly emitter: string;
  /** The level a walker stands on at the lamp's own foot. */
  readonly standsAt: number;
  /** The highest paved level within {@link FURNITURE_REACH} of it. */
  readonly pavementAt: number;
  /** `pavementAt − standsAt`. One is a kerb; two is a slot. */
  readonly sunkenBy: number;
  /**
   * True when the pavement it is measured against is a carriageway or road
   * rather than a flight. A flight climbing past a lamp is the flight doing its
   * job; a carriageway above a lamp is the lamp in a hole.
   */
  readonly viaCarriageway: boolean;
}

/** A paved column bitten below the paving beside it. */
export interface Cutoff {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Blocks below the highest paved neighbour. */
  readonly drop: number;
  /** The block a walker stands on here. */
  readonly tread: string;
  /** True when that block carries no stair or slab dressing — a raw cut. */
  readonly undressed: boolean;
  readonly emitters: readonly string[];
  readonly neighbourEmitters: readonly string[];
}

/** A run of carriageway standing proud of the ground on both sides. */
export interface PlinthRun {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** Columns in the run. */
  readonly length: number;
  /** The worst both-sides height above natural ground, in blocks. */
  readonly proud: number;
  readonly emitters: readonly string[];
  /**
   * True when some column of the run is within {@link STAIR_HEAD_REACH} of a
   * `steps` surface — Kai's observation that it happens at the tops of stairs,
   * as a number rather than as an impression.
   */
  readonly atStairHead: boolean;
}

/** A tall, long, built vertical face. */
export interface SheerFace {
  readonly x: number;
  readonly z: number;
  /** The level at the head of the face. */
  readonly y: number;
  /** Columns of face in the run. */
  readonly length: number;
  /** Blocks of fall at the worst column. */
  readonly drop: number;
  /** Share of the worst column's face cells that are masonry. */
  readonly builtShare: number;
  /** The passes that placed the face masonry, worst first. */
  readonly byEmitter: Readonly<Record<string, number>>;
  /** True when paving anybody declared is within two columns of the head. */
  readonly streetAdjacent: boolean;
  /**
   * The `treatmentForEdge` clause this run's shape lands in
   * (`layout/levels.ts`), inferred from the drop and the run because the
   * per-column choice is not carried out of the planner. See the module note in
   * the test file: this is a *derivation*, not a provenance read.
   */
  readonly clause: string;
}

/** What {@link auditDressing} found. */
export interface DressingReport {
  /* --- 1: floating dressing --------------------------------------------- */
  /** Laid columns whose tread is a top slab or a top-half stair. */
  readonly halfTreads: number;
  /** …of which the underside is open sideways at all. */
  readonly openSided: number;
  /**
   * …of which the floor of the opening is **soil** — the headline, and the
   * thing Kai photographed: a slab course cantilevered over bare earth.
   */
  readonly openOverSoil: number;
  /** …of which the opening is one cell deep: a flight's ordinary step down. */
  readonly shallowOpen: number;
  /**
   * …of which the opening is one cell deep **and shows soil under the lip**.
   *
   * The counter for the defect Kai photographed on 2026-08-07 and
   * {@link shallowLipShowsSoil} defines. A golden pinned at **0**.
   */
  readonly openSidedOverSoilShallow: number;
  /**
   * …of which the opening is **two cells or deeper**: visible daylight under
   * the tread, whatever is at the bottom of it.
   */
  readonly floatingDressing: number;
  /** …of which the floor of the opening is soil rather than masonry. */
  readonly floatingOverSoil: number;
  /** …of which the open column is one nobody declared: a gap, not a tread. */
  readonly floatingOffNetwork: number;
  /** …of which nothing at all stands in the cell below the slab. */
  readonly cantilevered: number;
  readonly floatingByEmitter: Readonly<Record<string, number>>;
  readonly worstFloating: readonly FloatingSlab[];

  /* --- 2: intersection cutoffs ------------------------------------------- */
  /**
   * Every lamp with paving of any role within {@link FURNITURE_REACH}, by how
   * far the pavement beside it stands above its own foot. The denominator, and
   * the reason a zero above is readable.
   */
  readonly lampCensus: Readonly<Record<string, number>>;
  /** Street lamps found standing on or beside declared paving. */
  readonly streetLamps: number;
  /** …standing at least a block below the pavement beside them. */
  readonly sunkenLamps: number;
  /** …standing two or more below it: in a slot, which is what Kai saw. */
  readonly deeplySunkenLamps: number;
  readonly worstSunken: readonly SunkenProp[];
  /** Paved columns two or more blocks below a paved neighbour. */
  readonly cutoffColumns: number;
  /** …whose own tread carries no stair or slab: a raw cut nobody dressed. */
  readonly undressedCutoffs: number;
  readonly worstCutoffs: readonly Cutoff[];

  /* --- 3: plinth roads ---------------------------------------------------- */
  /**
   * Every carriageway column, by what the both-sides measurement found:
   * `enclosed` (no open ground within the band on either axis), `flush`,
   * `proud1`, `proud2+`. The denominator {@link plinthColumns} needs.
   */
  readonly plinthCensus: Readonly<Record<string, number>>;
  /** Carriageway columns proud of unclaimed ground on both sides of an axis. */
  readonly plinthColumns: number;
  /** Runs of them, of any length. */
  readonly plinthRunCount: number;
  /** Runs of {@link PLINTH_MIN_RUN} columns or more — the ones you can see. */
  readonly plinthRuns: number;
  /** The longest run of all, whether or not it clears the bar. */
  readonly plinthLongestRun: number;
  /** Of the long runs, how many touch the head of a flight. */
  readonly plinthRunsAtStairHeads: number;
  readonly worstPlinths: readonly PlinthRun[];
  /** The same four numbers over `steps` surfaces — flights and their landings. */
  readonly stepPlinthCensus: Readonly<Record<string, number>>;
  readonly stepPlinthColumns: number;
  readonly stepPlinthRuns: number;
  readonly stepPlinthLongestRun: number;
  readonly worstStepPlinths: readonly PlinthRun[];

  /* --- 3a: a flight that is not paved ------------------------------------ */
  /**
   * Columns a flight declared and a walker can stand on — the denominator.
   *
   * Every one of them is a column `dressStreetStairs` wrote its step masonry
   * into, so the two numbers below are a straight readback of whether that
   * write survived to the world.
   */
  readonly stepColumns: number;
  /**
   * …whose walked tread is **natural ground cover** rather than the flight's
   * own masonry: grass, dirt, gravel, sand.
   *
   * Kai's walk, 2026-08-07: a connector crossing open terraced hillside on the
   * steep fixture read as bare stepped grass with a few slabs on it. A flight
   * is the most visible piece of built ground in a hill town and it has to read
   * as built for its whole run; a golden pinned at **0**.
   */
  readonly stepColumnsOnSoil: number;
  /** What those columns show, by block name. */
  readonly stepSoilCensus: Readonly<Record<string, number>>;
  readonly worstStepSoil: readonly SoilTread[];
  /**
   * …carrying a **stair or slab block**: the relief that makes a flight read as
   * a staircase rather than as a flat course of paving.
   *
   * The other half of Kai's 2026-08-07 walk. {@link stepColumnsOnSoil} answers
   * "is the flight paved"; this answers "does the paving read as steps". On the
   * steep fixture it reads 555 of 1409, and the flights emit no stair blocks at
   * all: the tread mix calls a column a `stair` only when the column *ahead* is
   * higher, and every flight on that hill is routed downwards.
   */
  readonly stepTreadsWithRelief: number;
  /** What every flight column reads back as, by block name. */
  readonly stepTreadCensus: Readonly<Record<string, number>>;

  /* --- 4: sheer built faces ----------------------------------------------- */
  /** Runs of built face at least {@link SHEER_DROP} tall and {@link SHEER_RUN} long. */
  readonly sheerFaces: number;
  /** Columns in them. */
  readonly sheerColumns: number;
  /** Deepest sheer face found, in blocks. */
  readonly sheerWorstDrop: number;
  readonly worstSheer: readonly SheerFace[];
  /**
   * Columns rejected because the face was the building pass's own wall.
   *
   * Reported rather than dropped: it is the size of the correction, and if a
   * later change makes buildings stop owning their own skirt this number moving
   * is how a reader finds out.
   */
  readonly buildingWalls: number;
  /**
   * Columns rejected because no structure pass owns the face: the hill's own
   * rock, which `finishCutFaces` writes into the column plan rather than as
   * attributed blocks. Not a defect — `docs/SITE-PLAN-v0.md` §5.4 says an
   * uphill cut is rock — but a large number here is where an unbuilt cliff
   * would hide, so it is reported.
   */
  readonly rockFaces: number;
}

/* -------------------------------------------------------------------------- */
/* the constants, each of which is a judgement                                 */
/* -------------------------------------------------------------------------- */

/**
 * How far a lamp may be from the pavement it lights before it stops being
 * street furniture.
 *
 * Two, and it was four until the instrument was checked against the world: at
 * four, both of the hillside fixture's worst "sunken" lamps were lamps standing
 * correctly on a flight's verge with a *terrace* four to six blocks above them,
 * and the finding was the hill, not the lamp. A lamp stands on the outer
 * sidewalk column, so the nearest carriageway column is `sidewalk` away — two
 * on every street this compiler lays — and anything further is a different
 * street.
 */
export const FURNITURE_REACH = 2;

/** Columns of both-sides plinth that read as a floating slab rather than a kerb. */
export const PLINTH_MIN_RUN = 6;

/**
 * How far out of a carriageway the street's own built band may reach before the
 * measurement gives up looking for natural ground.
 *
 * Five: the widest sidewalk this compiler lays is three columns, plus a kerb
 * and a column of slack for the apron a building throws across it.
 */
export const PLATFORM_BAND = 5;

/** How close a plinth run must come to a flight to be "at the top of a stair". */
export const STAIR_HEAD_REACH = 6;

/**
 * Blocks of fall at which an unbroken built face stops being a terrace wall and
 * starts being a cliff.
 *
 * Five, which is deliberately *below* `layout/levels.ts`' `RETAIN_MAX` of six:
 * the point of this detector is that the tallest wall the compiler is willing
 * to build is already taller than Kai wants to walk past, so a detector pinned
 * at the sanctioned ceiling would read zero and prove nothing.
 */
export const SHEER_DROP = 5;

/** Columns of face below which a tall drop is a corner, not a wall. */
export const SHEER_RUN = 3;

/** Share of a face's cells that must be masonry for it to be *built*. */
export const SHEER_BUILT_SHARE = 0.6;

/** How many rows of each finding the report lists. */
export const WORST_ROWS = 8;

/* -------------------------------------------------------------------------- */
/* the block vocabulary                                                        */
/* -------------------------------------------------------------------------- */

/** Ground a bank, a terrace or the hill itself is finished in. */
/**
 * True when the strip visible under a one-deep open slab lip is soil.
 *
 * Two coplanar faces make up that strip and either one spoils it: the top face
 * of the block directly under the slab (the floor of the slab's own empty lower
 * half) and the top face of the neighbour the lip opens toward.
 */
function shallowLipShowsSoil(probe: DressingProbe, x: number, sy: number, z: number): boolean {
  if (SOIL.test(probe.nameAt(x, sy - 1, z))) return true;
  for (const [dx, dz] of NEIGHBOURS4) {
    const nx = x + dx;
    const nz = z + dz;
    if (!probe.airAt(nx, sy, nz)) continue;
    if (probe.airAt(nx, sy - 1, nz)) continue;
    if (SOIL.test(probe.nameAt(nx, sy - 1, nz))) return true;
  }
  return false;
}

const SOIL =
  /(dirt|grass_block|coarse_dirt|rooted_dirt|podzol|mycelium|gravel|sand|red_sand|clay|mud|farmland|dirt_path|moss_block|snow_block)$/;

/**
 * **Worked** stone and joinery — the material that makes a face masonry rather
 * than hillside.
 *
 * Deliberately excludes bare `stone`, `andesite`, `granite`, `diorite`,
 * `deepslate`, `tuff`, `calcite` and `basalt`, every one of which this
 * compiler's strata put in an unquarried hill. A regex that took those in read
 * the two longest "sheer masonry" runs on the hillside fixture — 97 columns and
 * 60 — as walls, and they were the hill.
 */
const WORKED =
  /(_bricks|_brick|bricks|cobblestone|cobbled_deepslate|polished_[a-z_]+|smooth_[a-z_]+|chiseled_[a-z_]+|cut_[a-z_]+|mossy_[a-z_]+|deepslate_tiles|_planks|_wall|_stairs|_slab|_concrete|_terracotta|_glass|_pillar)$/;

/** A lamp's own light — the head of a street lamp post. */
const LAMP = /^(lantern|soul_lantern|redstone_lamp|shroomlight|end_rod)$/;

const NEIGHBOURS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/* -------------------------------------------------------------------------- */
/* the audit                                                                   */
/* -------------------------------------------------------------------------- */

/** Measure the four things a walk sees and the pedestrian graph does not. */
export function auditDressing(probe: DressingProbe): DressingReport {
  const keys = [...probe.feet.keys()].sort();

  /* --- 1: dressing whose underside is open ------------------------------- */

  const floating: FloatingSlab[] = [];
  const floatingCounts = new Map<string, number>();
  let halfTreads = 0;
  let openSided = 0;
  let openOverSoil = 0;
  let openSidedOverSoilShallow = 0;
  let shallowOpen = 0;
  let deepOpen = 0;
  let floatingOverSoil = 0;
  let floatingOffNetwork = 0;
  let cantilevered = 0;

  // **Every half-tread anybody placed, not only the ones on declared paving.**
  // The first cut of this walked the audit's own surface list and found three
  // findings on the whole hillside town, because a flight's slab band is its
  // *middle* three columns and its neighbours are always the flight's own verge.
  // The slabs Kai photographed are at the edges of things — a set-piece stair, a
  // ground treatment, a street's own nosing — so the scan is over the emitted
  // block list, which also hands each finding its owner for free.
  const seenSlab = new Set<string>();
  for (const block of probe.blocks) {
    const key3 = `${block.x},${block.y},${block.z}`;
    if (seenSlab.has(key3)) continue;
    seenSlab.add(key3);
    const { x, z } = block;
    const sy = block.y;
    const decoded = probe.propsAt(x, sy, z);
    if (decoded === undefined) continue;
    const isTopSlab = decoded.name.endsWith("_slab") && decoded.props["type"] === "top";
    const isTopStair = decoded.name.endsWith("_stairs") && decoded.props["half"] === "top";
    if (!isTopSlab && !isTopStair) continue;
    // Walkable dressing only: a top slab under a ceiling or inside a wall is
    // joinery, and its underside is meant to be seen.
    if (!probe.standable(x, sy + 1, z)) continue;
    // **On the walked ground plane.** Without this the detector's worst finding
    // on both fixtures was a building's *roof* — oak stairs at y 185 with eight
    // blocks of air under their overhang, cantilevered and correct. A roof is
    // standable and it is not paving. The test that separates them is the
    // pedestrian one: declared paving within two columns, at this slab's own
    // level give or take a block.
    if (!pavingAtLevel(probe, x, z, sy + 1, 2, 1)) continue;
    halfTreads++;

    // Sideways is the only direction that matters, and the *floor* of the
    // opening is the severity. A neighbour cell that is air at the slab's own
    // level opens the bottom half of the slab to view; when what you see down
    // there is the next tread's masonry that is a stair, and when it is soil it
    // is the thing in the screenshot.
    let gap = 0;
    let floor = "void";
    let overOpenGround = false;
    for (const [dx, dz] of NEIGHBOURS4) {
      const nx = x + dx;
      const nz = z + dz;
      if (!probe.airAt(nx, sy, nz)) continue;
      let depth = 1;
      while (depth < 8 && probe.airAt(nx, sy - depth, nz)) depth++;
      if (depth <= gap) continue;
      gap = depth;
      overOpenGround = !probe.feet.has(`${nx},${nz}`);
      const below = probe.groundStanding(nx, nz, sy - 1);
      floor = below === null ? "void" : probe.nameAt(nx, below - 1, nz);
    }
    if (gap === 0) continue;
    openSided++;
    // **The shallow cousin** (Kai's walk, 2026-08-07). `floor` above is read
    // with `groundStanding`, which needs a 1×2 body to fit and therefore answers
    // `"void"` for every one-cell opening — so `openOverSoil` is structurally
    // blind to the commonest case of all: a `type: top` slab whose neighbour is
    // exactly one block lower. There the empty lower half of the slab's own cell
    // is floored by the block *under the slab*, and that floor is coplanar with
    // the neighbour's top face, so the two read as one strip. When either is
    // soil, what you see under the lip is a course of bare dirt.
    if (gap === 1 && shallowLipShowsSoil(probe, x, sy, z)) openSidedOverSoilShallow++;
    const onSoil = SOIL.test(floor);
    if (onSoil) openOverSoil++;
    if (gap === 1) shallowOpen++;
    const hanging = !probe.supportAt(x, sy - 1, z);
    if (gap >= 2) {
      deepOpen++;
      if (hanging) cantilevered++;
      if (onSoil) floatingOverSoil++;
      if (overOpenGround) floatingOffNetwork++;
    }
    if (!onSoil && gap < 2) continue;
    floatingCounts.set(block.emitter, (floatingCounts.get(block.emitter) ?? 0) + 1);
    floating.push({
      x,
      y: sy,
      z,
      block: decoded.name,
      emitters: [block.emitter, ...(probe.laidBy.get(`${x},${z}`) ?? [])],
      gap,
      floor,
      cantilevered: hanging,
    });
  }
  floating.sort(
    (a, b) =>
      Number(SOIL.test(b.floor)) - Number(SOIL.test(a.floor)) ||
      b.gap - a.gap ||
      a.x - b.x ||
      a.z - b.z,
  );

  /* --- 2a: furniture standing below its pavement ------------------------- */

  const sunken: SunkenProp[] = [];
  const lampCensus = new Map<string, number>();
  let streetLamps = 0;
  let sunkenLamps = 0;
  let deeplySunkenLamps = 0;

  for (const block of probe.blocks) {
    const name = probe.nameAt(block.x, block.y, block.z);
    if (!LAMP.test(name)) continue;
    // **Street** furniture, and the qualifier does all the work. The first
    // version of this compared a lamp's foot against the highest paving within
    // four columns, and its two worst findings on the hillside fixture were both
    // a lamp standing correctly on a flight's own verge with a terrace six
    // blocks above it — the flight is *supposed* to climb past. So the
    // comparison is against the **carriageway** beside the lamp only: not a
    // flight, not a doorstep on the bank above, and within
    // {@link FURNITURE_REACH} columns, which is as far as a lamp's own street
    // can be.
    // The post's own foot: down the lamp's column to the first floor under it.
    const foot = probe.groundStanding(block.x, block.z, block.y);
    if (foot === null) continue;
    // The census first, over **any** paving within two columns, because a
    // number that reads zero has to show its working: this is what the whole
    // population of lamps beside paving looks like, before the strict rule
    // throws any of it away.
    const pavement = highestPavedNear(probe, block.x, block.z, FURNITURE_REACH);
    if (pavement === null) continue;
    streetLamps++;
    const sunkenBy = pavement - foot;
    const label =
      sunkenBy <= 0 ? "level" : sunkenBy === 1 ? "sunk1" : sunkenBy === 2 ? "sunk2" : "sunk3+";
    lampCensus.set(label, (lampCensus.get(label) ?? 0) + 1);
    if (sunkenBy < 1) continue;
    sunkenLamps++;
    if (sunkenBy >= 2) deeplySunkenLamps++;
    // Whether the reference pavement is a carriageway rather than a flight
    // climbing past: the discriminator that separates "planted in a slot" from
    // "standing beside a stair", carried per row so a reader can tell them apart
    // without re-running anything.
    const carriage = highestCarriagewayNear(probe, block.x, block.z, FURNITURE_REACH);
    sunken.push({
      x: block.x,
      y: block.y,
      z: block.z,
      block: name,
      emitter: block.emitter,
      standsAt: foot,
      pavementAt: pavement,
      sunkenBy,
      viaCarriageway: carriage !== null && carriage - foot >= sunkenBy,
    });
  }
  sunken.sort((a, b) => b.sunkenBy - a.sunkenBy || a.x - b.x || a.z - b.z);

  /* --- 2b: paved columns cut below the paving beside them ---------------- */

  const cutoffs: Cutoff[] = [];
  let undressedCutoffs = 0;
  for (const key of keys) {
    const [x, z] = splitKey(key);
    const y = probe.feet.get(key) as number;
    let drop = 0;
    let from: readonly string[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nk = `${x + dx},${z + dz}`;
        const ny = probe.feet.get(nk);
        if (ny === undefined) continue;
        if (ny - y <= drop) continue;
        drop = ny - y;
        from = probe.laidBy.get(nk) ?? [];
      }
    }
    // One block is the step every graded street takes by design. Two is a hole.
    if (drop < 2) continue;
    const tread = probe.nameAt(x, y - 1, z);
    const undressed = !/(_slab|_stairs)$/.test(tread);
    if (undressed) undressedCutoffs++;
    cutoffs.push({
      x,
      y,
      z,
      drop,
      tread,
      undressed,
      emitters: [...(probe.laidBy.get(key) ?? [])],
      neighbourEmitters: [...from],
    });
  }
  cutoffs.sort((a, b) => b.drop - a.drop || a.x - b.x || a.z - b.z);

  /* --- 3a: a flight that does not read as one --------------------------- */
  // Two readings of one loop, both of them Kai's walk of 2026-08-07 turned into
  // a number.
  //
  // A `steps` column is one `dressStreetStairs` painted with the street kit's
  // own step masonry, verges included, so a tread that reads back as **grass**
  // is not an aesthetic judgement — it is a write that did not survive, and the
  // walker sees the flight vanish into the field.
  //
  // The second is subtler and is the one the steep fixture actually fails: a
  // column carrying neither a stair nor a slab is a flat course of paving. It
  // is paved, it is correct underfoot, and on a hillside made of the same stone
  // it is invisible. A staircase reads as a staircase because of its *relief*.
  const soilTreads: SoilTread[] = [];
  const soilCensus = new Map<string, number>();
  const reliefCensus = new Map<string, number>();
  let stepColumns = 0;
  let stepTreadsWithRelief = 0;
  for (const key of keys) {
    const roles = probe.roleAt.get(key);
    if (roles === undefined || !roles.has("steps")) continue;
    stepColumns++;
    const [x, z] = splitKey(key);
    const y = probe.feet.get(key) as number;
    const tread = probe.nameAt(x, y - 1, z);
    reliefCensus.set(tread, (reliefCensus.get(tread) ?? 0) + 1);
    if (/_slab$|_stairs$/.test(tread)) stepTreadsWithRelief++;
    if (!SOIL.test(tread)) continue;
    soilCensus.set(tread, (soilCensus.get(tread) ?? 0) + 1);
    soilTreads.push({ x, y, z, block: tread, emitters: [...(probe.laidBy.get(key) ?? [])] });
  }
  soilTreads.sort((a, b) => a.x - b.x || a.z - b.z);

  /* --- 3: roads standing proud of the ground on both sides --------------- */

  // Measured twice over: once for the carriageways, and once for the flights.
  // Kai's observation was that the plinth reads "mostly at the tops of stairs",
  // and a flight was excluded from the first cut on the argument that a stair is
  // *meant* to stand proud — which is true of its middle and not of its head,
  // where it becomes a landing and joins a street. Both are measured; neither
  // is folded into the other.
  const carriageway = measurePlinth(probe, keys, "carriageway");
  const stepwork = measurePlinth(probe, keys, "steps");

  /* --- 4: sheer built faces, over the whole town rather than the paving --- */

  const blocksByColumn = new Map<string, AttributedBlock[]>();
  for (const block of probe.blocks) {
    const key = `${block.x},${block.z}`;
    const at = blocksByColumn.get(key);
    if (at === undefined) blocksByColumn.set(key, [block]);
    else at.push(block);
  }

  const window = scanWindow(probe, keys);
  const sheerOf = new Map<string, { drop: number; y: number; share: number }>();
  let buildingWalls = 0;
  let rockFaces = 0;
  for (let z = window.z0; z <= window.z1; z++) {
    for (let x = window.x0; x <= window.x1; x++) {
      const top = probe.groundStanding(x, z, probe.maxY - 2);
      if (top === null) continue;
      let drop = 0;
      for (const [dx, dz] of NEIGHBOURS4) {
        const below = probe.groundStanding(x + dx, z + dz, top - 1);
        if (below === null) continue;
        // A benched bank puts a tread two blocks down, so a fall of five or
        // more to the *immediate* neighbour is already "no intermediate bench":
        // the bench, if there were one, would be that neighbour.
        if (top - below > drop) drop = top - below;
      }
      if (drop < SHEER_DROP) continue;
      // **Built means a pass built it, not that the block looks like stone.**
      // The material test this started with counted `stone`, `andesite` and
      // `deepslate` as masonry — which is what an unquarried hillside is made
      // of — so the two longest "sheer masonry" runs on the hillside fixture
      // (97 and 60 columns) were the hill. Attribution is the honest test and it
      // also names the owner, which is the whole point of the finding.
      let worked = 0;
      for (let y = top - 1; y >= top - drop; y--) {
        if (WORKED.test(probe.nameAt(x, y, z))) worked++;
      }
      const share = worked / drop;
      const owners = faceOwners(blocksByColumn, x, z, top - drop, top);
      if (share < SHEER_BUILT_SHARE) {
        rockFaces++;
        continue;
      }
      // **A house is not a cliff.** Scanning down from the sky measures every
      // building on the slope from its ridge to the lane — 26 blocks of it — and
      // `buildings` owned the top four findings on both fixtures before this
      // clause. That is exactly the fictional finding `walkability.ts` warns
      // about in `topStanding`, and §5.2 rule 2 already says a building standing
      // on a face *is* the wall.
      if (owners.dominant === "buildings") {
        buildingWalls++;
        continue;
      }
      sheerOf.set(`${x},${z}`, { drop, y: top, share: round3(share) });
    }
  }

  const sheer: SheerFace[] = [];
  const sheerSeen = new Set<string>();
  let sheerColumns = 0;
  for (const key of sheerOf.keys()) {
    if (sheerSeen.has(key)) continue;
    const run = [key];
    sheerSeen.add(key);
    for (let head = 0; head < run.length; head++) {
      const [cx, cz] = splitKey(run[head] as string);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nk = `${cx + dx},${cz + dz}`;
          if (sheerSeen.has(nk) || !sheerOf.has(nk)) continue;
          sheerSeen.add(nk);
          run.push(nk);
        }
      }
    }
    if (run.length < SHEER_RUN) continue;
    sheerColumns += run.length;
    let worst = run[0] as string;
    for (const cell of run) {
      if ((sheerOf.get(cell) as { drop: number }).drop >
        (sheerOf.get(worst) as { drop: number }).drop) worst = cell;
    }
    const at = sheerOf.get(worst) as { drop: number; y: number; share: number };
    const [wx, wz] = splitKey(worst);
    const byEmitter = new Map<string, number>();
    for (const cell of run) {
      const [cx, cz] = splitKey(cell);
      const cellTop = (sheerOf.get(cell) as { y: number }).y;
      const cellDrop = (sheerOf.get(cell) as { drop: number }).drop;
      for (const block of blocksByColumn.get(cell) ?? []) {
        if (block.y >= cellTop || block.y < cellTop - cellDrop) continue;
        byEmitter.set(block.emitter, (byEmitter.get(block.emitter) ?? 0) + 1);
      }
    }
    sheer.push({
      x: wx,
      z: wz,
      y: at.y,
      length: run.length,
      drop: at.drop,
      builtShare: round3(at.share),
      byEmitter: sortedCounts(byEmitter),
      streetAdjacent: run.some((cell) => pavingWithin(probe, cell, 2)),
      clause: clauseFor(at.drop, run.length),
    });
  }
  sheer.sort((a, b) => b.drop - a.drop || b.length - a.length);

  return {
    halfTreads,
    openSided,
    openOverSoil,
    openSidedOverSoilShallow,
    shallowOpen,
    floatingDressing: deepOpen,
    floatingOverSoil,
    floatingOffNetwork,
    cantilevered,
    floatingByEmitter: sortedCounts(floatingCounts),
    worstFloating: floating.slice(0, WORST_ROWS),

    lampCensus: sortedCounts(lampCensus),
    streetLamps,
    sunkenLamps,
    deeplySunkenLamps,
    worstSunken: sunken.slice(0, WORST_ROWS),
    cutoffColumns: cutoffs.length,
    undressedCutoffs,
    worstCutoffs: cutoffs.slice(0, WORST_ROWS),

    plinthCensus: carriageway.census,
    plinthColumns: carriageway.columns,
    plinthRunCount: carriageway.runCount,
    plinthRuns: carriageway.longRuns,
    plinthLongestRun: carriageway.longest,
    plinthRunsAtStairHeads: carriageway.longAtStairHeads,
    worstPlinths: carriageway.worst,
    stepPlinthCensus: stepwork.census,
    stepPlinthColumns: stepwork.columns,
    stepPlinthRuns: stepwork.longRuns,
    stepPlinthLongestRun: stepwork.longest,
    worstStepPlinths: stepwork.worst,

    stepColumns,
    stepColumnsOnSoil: soilTreads.length,
    stepSoilCensus: sortedCounts(soilCensus),
    worstStepSoil: soilTreads.slice(0, WORST_ROWS),
    stepTreadsWithRelief,
    stepTreadCensus: sortedCounts(reliefCensus),

    sheerFaces: sheer.length,
    sheerColumns,
    sheerWorstDrop: sheer[0]?.drop ?? 0,
    worstSheer: sheer.slice(0, WORST_ROWS),
    buildingWalls,
    rockFaces,
  };
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** What one pass of the plinth measurement found over one role. */
interface PlinthMeasure {
  readonly census: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly runCount: number;
  readonly longRuns: number;
  readonly longest: number;
  readonly longAtStairHeads: number;
  readonly worst: readonly PlinthRun[];
}

/**
 * Measure how far one role's surface stands above the ground on **both** sides.
 *
 * One side proud is a hillside, and every road cut into a slope has one. Both
 * sides proud is a plinth: the paving is standing on a plate of fill with the
 * field falling away either way, which is what reads as a slab dropped on a
 * meadow.
 */
function measurePlinth(
  probe: DressingProbe,
  keys: readonly string[],
  role: WalkSurface["role"],
): PlinthMeasure {
  const plinthOf = new Map<string, { proud: number; y: number }>();
  const census = new Map<string, number>();
  for (const key of keys) {
    const roles = probe.roleAt.get(key);
    if (roles === undefined) continue;
    if (role === "carriageway") {
      if (!roles.has("carriageway") && !roles.has("road")) continue;
      if (roles.has("steps")) continue;
    } else if (!roles.has(role)) continue;
    const [x, z] = splitKey(key);
    const y = probe.feet.get(key) as number;
    let proud: number | null = null;
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const a = naturalGroundBeyondBand(probe, x, z, dx, dz, y);
      const b = naturalGroundBeyondBand(probe, x, z, -dx, -dz, y);
      if (a === null || b === null) continue;
      const both = Math.min(y - a, y - b);
      if (proud === null || both > proud) proud = both;
    }
    // The census exists because the first cut of this detector read **zero** on
    // both fixtures, and a zero is only a finding once you can see what it is
    // made of. `enclosed` means neither side of either axis reached open ground
    // within the band; the rest is the distribution of the drop when it did.
    const bucket =
      proud === null ? "enclosed" : proud <= 0 ? "flush" : proud === 1 ? "proud1" : "proud2+";
    census.set(bucket, (census.get(bucket) ?? 0) + 1);
    if (proud === null || proud < 1) continue;
    plinthOf.set(key, { proud, y });
  }

  const runs: PlinthRun[] = [];
  const seen = new Set<string>();
  for (const key of plinthOf.keys()) {
    if (seen.has(key)) continue;
    const run = [key];
    seen.add(key);
    for (let head = 0; head < run.length; head++) {
      const [cx, cz] = splitKey(run[head] as string);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nk = `${cx + dx},${cz + dz}`;
          if (seen.has(nk) || !plinthOf.has(nk)) continue;
          seen.add(nk);
          run.push(nk);
        }
      }
    }
    let worstCell = run[0] as string;
    for (const cell of run) {
      if (
        (plinthOf.get(cell) as { proud: number }).proud >
        (plinthOf.get(worstCell) as { proud: number }).proud
      ) {
        worstCell = cell;
      }
    }
    const [wx, wz] = splitKey(worstCell);
    const emitters = new Set<string>();
    let atStairHead = false;
    for (const cell of run) {
      for (const emitter of probe.laidBy.get(cell) ?? []) emitters.add(emitter);
      if (!atStairHead && nearSteps(probe, cell)) atStairHead = true;
    }
    runs.push({
      x: wx,
      z: wz,
      y: (plinthOf.get(worstCell) as { y: number }).y,
      length: run.length,
      proud: (plinthOf.get(worstCell) as { proud: number }).proud,
      emitters: [...emitters].sort(),
      atStairHead,
    });
  }
  runs.sort((a, b) => b.length - a.length || b.proud - a.proud);
  const long = runs.filter((r) => r.length >= PLINTH_MIN_RUN);
  return {
    census: sortedCounts(census),
    columns: plinthOf.size,
    runCount: runs.length,
    longRuns: long.length,
    longest: runs[0]?.length ?? 0,
    longAtStairHeads: long.filter((r) => r.atStairHead).length,
    worst: runs.slice(0, WORST_ROWS),
  };
}

/** How many cells of a column's face a structure pass placed, and which pass. */
function faceOwners(
  byColumn: ReadonlyMap<string, readonly AttributedBlock[]>,
  x: number,
  z: number,
  y0: number,
  y1: number,
): { attributed: number; dominant: string | null } {
  const counts = new Map<string, number>();
  const cells = new Set<number>();
  for (const block of byColumn.get(`${x},${z}`) ?? []) {
    if (block.y < y0 || block.y >= y1) continue;
    cells.add(block.y);
    counts.set(block.emitter, (counts.get(block.emitter) ?? 0) + 1);
  }
  let dominant: string | null = null;
  let bestN = 0;
  for (const [emitter, n] of counts) {
    if (n > bestN) {
      bestN = n;
      dominant = emitter;
    }
  }
  return { attributed: cells.size, dominant };
}

function splitKey(key: string): [number, number] {
  const comma = key.indexOf(",");
  return [Number(key.slice(0, comma)), Number(key.slice(comma + 1))];
}

/** The highest declared paving of any role within `radius` columns, or `null`. */
function highestPavedNear(
  probe: DressingProbe,
  x: number,
  z: number,
  radius: number,
): number | null {
  let best: number | null = null;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const y = probe.feet.get(`${x + dx},${z + dz}`);
      if (y === undefined) continue;
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

/**
 * The highest **carriageway or road** within `radius` columns, or `null`.
 *
 * Flights are excluded on purpose: a flight climbing past a lamp is the flight
 * doing its job, and measuring furniture against it manufactures a defect. So
 * is a doorstep, which sits on whatever terrace its house sits on.
 */
function highestCarriagewayNear(
  probe: DressingProbe,
  x: number,
  z: number,
  radius: number,
): number | null {
  let best: number | null = null;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const key = `${x + dx},${z + dz}`;
      const roles = probe.roleAt.get(key);
      if (roles === undefined) continue;
      if (roles.has("steps")) continue;
      if (!roles.has("carriageway") && !roles.has("road")) continue;
      const y = probe.feet.get(key);
      if (y === undefined) continue;
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

/**
 * The natural ground **outside the street's built band**, walking out from
 * `(x, z)` along `(dx, dz)`, or `null` when there is none within
 * {@link PLATFORM_BAND}.
 *
 * The first version of this looked at the immediate neighbour and found *zero*
 * plinth columns on both fixtures, which was not the ground telling the truth:
 * a carriageway's immediate neighbour is its own sidewalk, laid at the
 * carriageway's level and invisible to the audit's surface list, so every
 * measurement read a drop of nought. The thing Kai walked is the whole paved
 * band — carriageway, kerb and footway together — standing proud of the field,
 * so the measurement has to step *past* the band before it asks the ground
 * anything. Worked stone is band; soil is ground; more than
 * {@link PLATFORM_BAND} columns of stone is a plaza, not a road, and gets
 * `null`.
 */
function naturalGroundBeyondBand(
  probe: DressingProbe,
  x: number,
  z: number,
  dx: number,
  dz: number,
  from: number,
): number | null {
  for (let step = 1; step <= PLATFORM_BAND; step++) {
    const nx = x + dx * step;
    const nz = z + dz * step;
    // Still inside the network's own width — a five-wide carriageway is two
    // columns of it on each side of the centre — so keep walking. The first cut
    // of this returned `null` here and therefore classified **every** column of
    // both fixtures as `enclosed`: the road's own width had made the question
    // unanswerable everywhere.
    if (probe.feet.has(`${nx},${nz}`)) continue;
    const top = probe.groundStanding(nx, nz, from + 1);
    if (top === null) return null;
    const surface = probe.nameAt(nx, top - 1, nz);
    // Worked stone is still the street's built band — kerb, footway, apron.
    // Anything else is the ground the street is standing on.
    if (!WORKED.test(surface)) return top;
  }
  return null;
}

/** True when a `steps` surface is declared within {@link STAIR_HEAD_REACH}. */
function nearSteps(probe: DressingProbe, key: string): boolean {
  const [x, z] = splitKey(key);
  for (let dz = -STAIR_HEAD_REACH; dz <= STAIR_HEAD_REACH; dz++) {
    for (let dx = -STAIR_HEAD_REACH; dx <= STAIR_HEAD_REACH; dx++) {
      if (probe.roleAt.get(`${x + dx},${z + dz}`)?.has("steps") === true) return true;
    }
  }
  return false;
}

/**
 * True when declared paving stands within `radius` columns of `(x, z)` at a
 * level within `slack` of `y` — "this block is on the ground plane a walker is
 * on", which a roof is not.
 */
function pavingAtLevel(
  probe: DressingProbe,
  x: number,
  z: number,
  y: number,
  radius: number,
  slack: number,
): boolean {
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const at = probe.feet.get(`${x + dx},${z + dz}`);
      if (at !== undefined && Math.abs(at - y) <= slack) return true;
    }
  }
  return false;
}

/** True when anybody's paving is within `radius` of this column. */
function pavingWithin(probe: DressingProbe, key: string, radius: number): boolean {
  const [x, z] = splitKey(key);
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (probe.feet.has(`${x + dx},${z + dz}`)) return true;
    }
  }
  return false;
}

/**
 * The window detector 4 scans.
 *
 * The town bounds when the caller gave them, and otherwise the bounding box of
 * every laid column with a margin — because a face *beside* the paving is
 * exactly the one that matters and the paving's own box would clip it.
 */
function scanWindow(
  probe: DressingProbe,
  keys: readonly string[],
): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Number.POSITIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const key of keys) {
    const [x, z] = splitKey(key);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  if (!Number.isFinite(x0)) {
    return probe.town === undefined ? { x0: 0, z0: 0, x1: -1, z1: -1 } : { ...probe.town };
  }
  // The union of the paving's own box and the town's, both padded. `town` is
  // only ever the *first* district's bounds, so it alone would miss a second
  // quarter's terraces entirely; the paving's box alone would clip the face
  // standing just outside the last laid column, which is the one that matters.
  const town = probe.town;
  return {
    x0: Math.min(x0, town?.x0 ?? x0) - 8,
    z0: Math.min(z0, town?.z0 ?? z0) - 8,
    x1: Math.max(x1, town?.x1 ?? x1) + 8,
    z1: Math.max(z1, town?.z1 ?? z1) + 8,
  };
}

/**
 * Which `treatmentForEdge` clause a face of this shape lands in.
 *
 * **Derived, not read.** `layout/levels.ts` decides per edge and the decision is
 * not carried through `StructurePassResult`, so this restates the table's shape
 * tests — the two that depend on nothing but drop and run — and says so. Where
 * a face is tall *and* long, clause 9 built it on purpose and the defect is the
 * clause, not a leak.
 */
function clauseFor(drop: number, run: number): string {
  if (drop > 6) return "past RETAIN_MAX (rule 5) — replan on fill, rock on cut";
  if (run < 6) return "below MIN_RETAIN_RUN (rule 4) — soft, so this face is not the wall's";
  return "rule 9 retaining, at or under RETAIN_MAX — sanctioned sheer masonry";
}

function sortedCounts(counts: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...counts.entries()].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)),
  );
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

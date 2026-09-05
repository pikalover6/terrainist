/**
 * C4 — **set pieces and vista axes**: the part of a city that reads as intent.
 *
 * The six tracks before this one fixed the *fabric*. C1 drew arterials and took
 * the quarters as their residue, U2 made the street wall continuous, C2 gave
 * the skyline a peak and C3 filled eye level with incident. What none of them
 * produce is the thing Kai's verdict was actually about — *"what makes
 * terrainist stand out is the ability to create unique worlds that don't feel
 * like they were generated just with a script"*. A city reads as authored when
 * it contains **relationships**: a boulevard that ends *on* something, a
 * monument visible from three streets away, a bridge that is an event rather
 * than a crossing.
 *
 * So a set piece here is not a bigger building. It is a building — or a stair,
 * or a railing, or a deliberate hole in the fabric — placed because of *where
 * it is*:
 *
 * - a **terminating landmark** squared to a boulevard's axis, so the facade
 *   closes the view of everyone walking down it;
 * - a **bridge** made to read as one, where an arterial already crosses water;
 * - a **waterfront promenade** where the drive runs along the shore;
 * - a **hillside stair** where the ground between two quarters is too steep to
 *   walk, which is a genuine defect as well as a set piece;
 * - a **civic square**: a void that is deliberate rather than left over.
 *
 * ## What this module is, and is not
 *
 * It is the **planner**. It reads a {@link CityPlan}, the composed heightfield
 * and the water mask, and answers with {@link VistaAxis} and {@link SetPiece}
 * records: geometry, headings, reserved ground. It writes no blocks and seats
 * no node. `layout/city-pass.ts` seats the landmarks (that is where a document's
 * children live) and `structures/setpieces.ts` lays the blocks (that is where
 * the finished ground is).
 *
 * Splitting it this way is the same argument C1 made for `city.ts` versus
 * `city-pass.ts`: the *decision* about where a vista is has to be testable
 * without a compile, and the thing that reserves ground must run before the
 * fabric that would otherwise build on it.
 *
 * ## Determinism
 *
 * Every number below is arithmetic on the plan's own geometry, a lookup in
 * `TRIG_15`'s quantisation (via {@link cardinalOfHeading}), or a draw from
 * `Rng(streamSeed(seed, …))` taken in a fixed order. No `Math.random`, no wall
 * clock, no transcendental function, and no decision that depends on the
 * iteration order of a map: every candidate list is sorted by an explicit
 * comparator whose last key is a positional tiebreak.
 */

import type { HeightField, Region, Seed256 } from "@terrainist/stdlib";
import { Rng, streamSeed } from "@terrainist/stdlib";
import type { HorizontalFace } from "@terrainist/spec/ir";

import type { Arterial, CityPlan, DistrictCell } from "./city.js";
import { cellContains } from "./city.js";
import type { Point2, Rect } from "./frames.js";
import { findFirstOnChebyshevRing } from "../search.js";
import { headingOf } from "./streets.js";

/* -------------------------------------------------------------------------- */
/* the contract                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One axis of view: an arterial, the end it is closed at, and the ground kept
 * free there.
 *
 * The **axis is the product**; the landmark is only what fills it. That
 * distinction is why this type exists at all rather than the pass simply
 * emitting a building: an axis whose landmark the author pinned, an axis whose
 * landmark the plan chose and an axis nothing could be found for are all the
 * same geometric fact, and only the first two end up with a `closedBy`.
 */
export interface VistaAxis {
  readonly id: string;
  readonly arterialId: string;
  readonly arterialKind: Arterial["kind"];
  /** Carriageway width at the terminus — how wide the view actually is. */
  readonly width: number;
  /** The terminus itself, on the city boundary. */
  readonly at: Point2;
  /**
   * The way a viewer standing at the terminus looks: **inward**, degrees,
   * 0 = +Z, quantised to 15. Straight off `Arterial.termini[].heading`.
   */
  readonly heading: number;
  /**
   * The cardinal a terminating facade turns to — {@link heading} snapped to
   * 90°.
   *
   * This is what "squared to the axis" means in practice. The building grammar
   * rotates in quarter turns, so a 15°-quantised heading cannot be honoured
   * exactly; what *can* be honoured exactly is that the facade's outward normal
   * is the cardinal nearest the axis, which is the difference between a
   * building that closes a view and one that happens to be near the end of a
   * road.
   */
  readonly facing: HorizontalFace;
  /**
   * Ground reserved at the end of the axis, centred on the centre line.
   *
   * The *maximum* site: dry, level enough, inside the city and inside the
   * region, and clear of the boundary. Whatever closes the axis must fit inside
   * it; nothing else may build in it.
   */
  readonly reserve: Rect;
  /**
   * Straight carriageway cells running up to the terminus.
   *
   * The length of the actual view. A vista down 90 blocks of straight boulevard
   * is a vista; one down eleven blocks of a road that immediately bends is a
   * corner.
   */
  readonly run: number;
  /** Node path of the landmark that closes this axis, once one is seated. */
  readonly closedBy?: string;
  /** True when the author pinned that landmark rather than the plan choosing. */
  readonly authored?: boolean;
}

/** The five things a set piece can be. */
export type SetPieceKind = "landmark" | "bridge" | "promenade" | "stair" | "square";

/** Every set-piece kind, in the order the budget offers them. */
export const SET_PIECE_KINDS: readonly SetPieceKind[] = Object.freeze([
  "landmark",
  "bridge",
  "promenade",
  "stair",
  "square",
] as const);

/**
 * One seated anchor.
 *
 * Deliberately one type rather than five: the report, the budget and the
 * structure pass all want to say "the set pieces of this city" without a
 * five-way switch, and the per-kind fields are the small tail of what any of
 * them actually differ by.
 */
export interface SetPiece {
  readonly id: string;
  readonly kind: SetPieceKind;
  /** Ground the piece occupies, as the plan reserved it. */
  readonly site: Rect;
  /** A one-line reason, for the compile report. */
  readonly detail: string;
  /** For a landmark: the axis it closes. */
  readonly axisId?: string;
  /** For a landmark: the facade cardinal. */
  readonly facing?: HorizontalFace;
  /** For a landmark: the node path actually seated. */
  readonly nodePath?: string;
  /** For a landmark chosen by the plan rather than the author. */
  readonly archetype?: string;
  /**
   * For a bridge, a promenade or a stair: the centre line, cell by cell,
   * 4-connected, in travel order.
   */
  readonly path?: readonly Point2[];
  /** For a bridge or a promenade: the carriageway width it belongs to. */
  readonly width?: number;
  /**
   * For a promenade: which perpendicular side the water is on, as the sign
   * `perp()` takes — `+1` is the left-hand normal of the travel direction.
   */
  readonly waterSide?: 1 | -1;
  /** For a stair: total rise, in blocks, over `path`. */
  readonly rise?: number;
}

/** Numbers about the set pieces, for the compile report. */
interface VistaStats {
  /** Termini that could hold a vista at all. */
  readonly axesFound: number;
  /** …of which the plan kept. */
  readonly axes: number;
  readonly pieces: number;
  readonly byKind: Readonly<Record<string, number>>;
  /** Longest straight approach among the kept axes, in cells. */
  readonly longestRun: number;
}

/** What {@link planVistas} produces. */
export interface VistaPlan {
  readonly axes: readonly VistaAxis[];
  readonly pieces: readonly SetPiece[];
  readonly stats: VistaStats;
}

/** The knobs a city's `params.setPieces` turns, already defaulted. */
export interface SetPieceParams {
  /** `false` suppresses the whole track for this city. */
  readonly enabled: boolean;
  /** Most anchors seated, across every kind. */
  readonly max: number;
  /** When present, only these kinds are considered. */
  readonly kinds?: readonly SetPieceKind[];
}

/** What {@link planVistas} reads. */
export interface VistaInput {
  readonly plan: CityPlan;
  /** The composed, levelled heightfield. */
  readonly field: HeightField;
  /** 1 where a column holds water, row-major over `field.region`. */
  readonly water?: Uint8Array;
  readonly seaLevel: number;
  /** `nodeSeed(worldSeed, cityPath, seedSalt)`. */
  readonly seed: Seed256;
  readonly params: SetPieceParams;
}

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/** Anchors a city seats when the author says nothing. The brief's 3–6. */
export const SET_PIECE_MAX = 6;

/** Vista axes kept, at most. Past three the city stops having a *main* street. */
const MAX_VISTAS = 3;

/**
 * Columns between the city boundary and a terminating landmark's back wall.
 *
 * Not zero, and not large. Zero would put a facade on the region edge on a
 * city whose envelope fills the world, which is where chunk-boundary surprises
 * live; large would leave a stub of paved boulevard running past the landmark
 * to nowhere, which is exactly the "generated" read this track exists to
 * remove. Three columns is a kerb and a step.
 */
const VISTA_SETBACK = 3;

/** Deepest site a vista reserves, along the axis. */
const VISTA_DEPTH_MAX = 30;

/** Shallowest site worth reserving: below this nothing in the catalog fits. */
const VISTA_DEPTH_MIN = 13;

/** Widest half-site a vista reserves, across the axis. */
const VISTA_HALF_MAX = 15;

/** Narrowest half-site worth reserving. */
const VISTA_HALF_MIN = 6;

/**
 * Ground range across a vista site, past which it is not a site.
 *
 * A terminating landmark is placed by this pass rather than by a cell's
 * terrace, so it carries its own pad — and a pad with more relief under it than
 * this is a retaining wall the size of the building, on ground the arterial
 * corridor deliberately never levelled.
 */
const VISTA_MAX_RELIEF = 6;

/** Columns of margin kept between a reserved site and the region edge. */
const REGION_MARGIN = 4;

/**
 * Cells of approach a vista needs before it is one.
 *
 * The measure is {@link viewRun}'s — how far away the site is still framed by
 * the road — so this is literally "you can see it coming for two blocks of
 * city". Below it the terminus is a corner the road happens to end at, and
 * spending the plan's best ground on a landmark nobody approaches is the
 * expensive half of the mistake.
 */
const VISTA_MIN_RUN = 24;

/**
 * Columns from the city's own edge within which a terminus counts as one.
 *
 * The tolerance on "does this arterial actually end here". See
 * {@link onBoundary}.
 */
const TERMINUS_EDGE = 8;

/** Score bonus per arterial kind — which roads deserve to end on something. */
const VISTA_KIND_BONUS: Readonly<Record<Arterial["kind"], number>> = Object.freeze({
  spine: 90,
  boulevard: 70,
  diagonal: 60,
  drive: 40,
  ring: 0,
});

/** Water cells an arterial must span before the crossing is worth dressing. */
const BRIDGE_MIN_SPAN = 5;

/** Dry cells of approach carried on the bridge record, each side. */
const BRIDGE_ABUTMENT = 5;

/** Bridges dressed per city. Two is a river and its mouth; three is a habit. */
const MAX_BRIDGES = 2;

/** Columns from the drive's centre line within which the sea makes a shore. */
const PROMENADE_REACH = 14;

/** Shortest run of shoreline drive worth calling a promenade. */
const PROMENADE_MIN = 48;

/** Longest run dressed, so one promenade is not the whole coast. */
const PROMENADE_MAX = 260;

/** Columns a hillside stair climbs, along its own axis. */
const STAIR_RUN = 15;

/** Columns a hillside stair is wide. */
const STAIR_WIDTH = 7;

/** Total rise over {@link STAIR_RUN}, below which the ground is walkable. */
const STAIR_MIN_RISE = 7;

/** Sampling stride for the stair search — every column would be gratuitous. */
const STAIR_STRIDE = 3;

/**
 * Courses of masonry a flight may raise one column by.
 *
 * The same number `structures/setpieces.ts` enforces against the finished
 * ground, restated here so the plan does not propose a strip that pass was
 * always going to refuse. Beyond it the object is a retaining wall with steps
 * on top rather than a stair on a slope.
 */
const STAIR_MAX_FILL = 4;

/**
 * Courses the flight would have to lay under the worst column of a bank.
 *
 * The construction is one line: a player standing on column `k` must be able to
 * reach column `k + 1`, so `need[k] = max(g[k] + 1, need[k + 1] − 1)`, taken
 * backwards. The answer is the largest `need[k] − g[k]` over the run, which is
 * exactly how much masonry the steepest riser ahead forces onto the step before
 * it.
 */
export function fillNeeded(heights: readonly number[]): number {
  if (heights.length === 0) return 0;
  const need = heights.map((h) => h + 1);
  for (let k = need.length - 2; k >= 0; k--) {
    need[k] = Math.max(need[k] as number, (need[k + 1] as number) - 1);
  }
  let worst = 0;
  for (const [k, level] of need.entries()) {
    const courses = level - (heights[k] as number);
    if (courses > worst) worst = courses;
  }
  return worst;
}

/** Side of the civic square, in columns. */
const SQUARE_SIDE = 27;

/** Smallest cell that can give a square up without losing its fabric. */
const SQUARE_MIN_CELL = 6000;

/** Characters whose cell may be asked for a square, best first. */
const SQUARE_CHARACTERS: readonly string[] = Object.freeze(["civic", "core", "grid"]);

/**
 * Archetypes the plan reaches for when it has to close an axis itself.
 *
 * Every one of them is in `KNOWN_BUILDING_ARCHETYPES` and every one is a thing
 * a boulevard plausibly ends on. The footprints are the ones the archetype
 * table in `kits/settlement-author.md` states for each, so the shape the
 * grammar builds is the shape the site was reserved for; `depth` is along the
 * axis, because a nave, a train shed and an auditorium are all long in the
 * direction you walk into them.
 */
export const TERMINATING_LANDMARKS: readonly {
  readonly archetype: string;
  readonly size: readonly [number, number, number];
  readonly floors: number;
}[] = Object.freeze([
  { archetype: "cathedral", size: [15, 17, 21] as const, floors: 2 },
  { archetype: "train_station", size: [15, 13, 21] as const, floors: 2 },
  { archetype: "opera_house", size: [15, 15, 19] as const, floors: 2 },
  { archetype: "university_hall", size: [15, 15, 19] as const, floors: 2 },
  { archetype: "courthouse", size: [11, 13, 17] as const, floors: 1 },
]);

/* -------------------------------------------------------------------------- */
/* geometry helpers, exported because the seating pass needs the same answers   */
/* -------------------------------------------------------------------------- */

/** Cardinals in heading order: 0° = +Z = south, 90° = +X = east. */
const CARDINALS: readonly HorizontalFace[] = Object.freeze([
  "south",
  "east",
  "north",
  "west",
] as const);

/** A cardinal's unit column step. */
export const FACE_STEP: Readonly<Record<HorizontalFace, Point2>> = Object.freeze({
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  north: { x: 0, z: -1 },
  west: { x: -1, z: 0 },
});

/**
 * A 15°-quantised heading snapped to the nearest cardinal.
 *
 * Table arithmetic, not trigonometry: a heading is already an integer number of
 * degrees in `[0, 360)`, so the nearest quarter turn is a rounded division.
 * Ties (45°, 135°, …) round *up*, which is arbitrary but fixed — what matters
 * is that the same axis always snaps the same way on every machine.
 */
export function cardinalOfHeading(heading: number): HorizontalFace {
  const k = ((Math.round(heading / 90) % 4) + 4) % 4;
  return CARDINALS[k] as HorizontalFace;
}

/** The rect a footprint of `w × d` occupies inside a reserved vista site. */
export function seatOnAxis(axis: VistaAxis, w: number, d: number): Rect | null {
  const step = FACE_STEP[axis.facing];
  const reserve = axis.reserve;
  const along = step.x !== 0 ? w : d;
  const across = step.x !== 0 ? d : w;
  const spanAlong = step.x !== 0 ? reserve.x1 - reserve.x0 + 1 : reserve.z1 - reserve.z0 + 1;
  const spanAcross = step.x !== 0 ? reserve.z1 - reserve.z0 + 1 : reserve.x1 - reserve.x0 + 1;
  if (along > spanAlong || across > spanAcross) return null;

  // Along the axis the building is pushed to the *back* of the reserve — the
  // end nearest the city boundary — so the facade stands as far down the road
  // as the site allows and the ground behind it is the leftover, not in front.
  // Across the axis it is centred with `floor`, so a site and a landmark of
  // the same parity always agree on which column the centre line is.
  const backFirst = step.x > 0 || step.z > 0;
  const alongLo = step.x !== 0 ? reserve.x0 : reserve.z0;
  const alongStart = backFirst ? alongLo : alongLo + spanAlong - along;
  const acrossLo = step.x !== 0 ? reserve.z0 : reserve.x0;
  const acrossStart = acrossLo + ((spanAcross - across) >> 1);
  return step.x !== 0
    ? { x0: alongStart, z0: acrossStart, x1: alongStart + along - 1, z1: acrossStart + across - 1 }
    : { x0: acrossStart, z0: alongStart, x1: acrossStart + across - 1, z1: alongStart + along - 1 };
}

/* -------------------------------------------------------------------------- */
/* the pass                                                                    */
/* -------------------------------------------------------------------------- */

/** A local field view over the city, with the arterial mask folded in. */
interface Ground {
  readonly bounds: Rect;
  readonly width: number;
  readonly depth: number;
  height(x: number, z: number): number;
  wet(x: number, z: number): boolean;
  /** Inside the city bounds *and* far enough inside the region to build. */
  buildable(x: number, z: number): boolean;
  arterial(x: number, z: number): boolean;
}

function groundOf(input: VistaInput): Ground {
  const bounds = input.plan.bounds;
  const region: Region = input.field.region;
  const width = bounds.x1 - bounds.x0 + 1;
  const depth = bounds.z1 - bounds.z0 + 1;
  const at = (x: number, z: number): number => {
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return 0;
    return Math.round(input.field.values[j * region.width + i] as number);
  };
  const water = input.water;
  return {
    bounds,
    width,
    depth,
    height: at,
    wet(x: number, z: number): boolean {
      if (water === undefined) return false;
      const i = x - region.x0;
      const j = z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) return true;
      return water[j * region.width + i] === 1;
    },
    buildable(x: number, z: number): boolean {
      if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return false;
      const i = x - region.x0;
      const j = z - region.z0;
      return (
        i >= REGION_MARGIN &&
        j >= REGION_MARGIN &&
        i < region.width - REGION_MARGIN &&
        j < region.depth - REGION_MARGIN
      );
    },
    arterial(x: number, z: number): boolean {
      if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return false;
      return input.plan.arterialMask[(z - bounds.z0) * width + (x - bounds.x0)] === 1;
    },
  };
}

/**
 * Plan a city's vista axes and its set pieces.
 *
 * The order is a priority, not a pipeline: axes are found first because a
 * landmark is the only piece that can *change the fabric* (it reserves ground
 * the quarters would otherwise build on), and everything after it is additive
 * dressing on ground somebody else already owns.
 */
export function planVistas(input: VistaInput): VistaPlan {
  const empty: VistaPlan = {
    axes: [],
    pieces: [],
    stats: { axesFound: 0, axes: 0, pieces: 0, byKind: {}, longestRun: 0 },
  };
  if (!input.params.enabled || input.params.max <= 0) return empty;

  const ground = groundOf(input);
  const wants = (kind: SetPieceKind): boolean =>
    input.params.kinds === undefined || input.params.kinds.includes(kind);

  // --- axes -----------------------------------------------------------------
  const found = wants("landmark") ? candidateAxes(input.plan, ground) : [];
  const axes: VistaAxis[] = [];
  for (const candidate of found) {
    if (axes.length >= Math.min(MAX_VISTAS, input.params.max)) break;
    // A vista is not claimed twice: two termini whose reserves touch would put
    // two landmarks in each other's view, and the second one is the one that
    // reads as scenery.
    if (axes.some((kept) => overlaps(kept.reserve, candidate.axis.reserve, 6))) continue;
    axes.push(candidate.axis);
  }

  // --- everything else ------------------------------------------------------
  const pieces: SetPiece[] = [];
  const budget = Math.max(0, input.params.max - axes.length);
  const extras: { readonly score: number; readonly piece: SetPiece }[] = [];
  if (wants("bridge")) extras.push(...bridges(input.plan, ground));
  if (wants("promenade")) extras.push(...promenades(input.plan, ground));
  if (wants("square")) extras.push(...squares(input.plan, ground, axes));
  if (wants("stair")) extras.push(...stairs(input.plan, ground, axes));

  // Fixed order: by kind's own priority, then by score, then by site position.
  // Sorting by score alone would let two bridges crowd out the square, which is
  // the one piece that changes how a quarter is laid out.
  extras.sort((a, b) => {
    const ka = SET_PIECE_KINDS.indexOf(a.piece.kind);
    const kb = SET_PIECE_KINDS.indexOf(b.piece.kind);
    if (ka !== kb) return ka - kb;
    if (a.score !== b.score) return b.score - a.score;
    if (a.piece.site.z0 !== b.piece.site.z0) return a.piece.site.z0 - b.piece.site.z0;
    return a.piece.site.x0 - b.piece.site.x0;
  });
  // Two rounds, and the first one is what stops a city with two river mouths
  // spending its whole budget on bridges. Round one offers each kind exactly
  // one slot, so a plan that found four different things says four different
  // things; round two spends whatever is left, which is the only way a second
  // bridge is ever drawn.
  const perKind = new Map<SetPieceKind, number>();
  for (const round of [1, MAX_BRIDGES]) {
    for (const { piece } of extras) {
      if (pieces.length >= budget) break;
      const cap = Math.min(round, piece.kind === "bridge" ? MAX_BRIDGES : 1);
      const taken = perKind.get(piece.kind) ?? 0;
      if (taken >= cap) continue;
      if (pieces.some((p) => overlaps(p.site, piece.site, 0))) continue;
      perKind.set(piece.kind, taken + 1);
      pieces.push(piece);
    }
  }

  const byKind: Record<string, number> = {};
  for (const p of pieces) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  return {
    axes,
    pieces,
    stats: {
      axesFound: found.length,
      axes: axes.length,
      pieces: pieces.length,
      byKind,
      longestRun: axes.reduce((best, a) => Math.max(best, a.run), 0),
    },
  };
}

/**
 * The landmark the plan chooses for an axis nothing was pinned to.
 *
 * A rotation rather than a draw: the *set* is decided by the city's seed so two
 * cities do not both end on a cathedral, but the assignment within a city walks
 * the rotation so one city never ends on the same building twice. That is the
 * difference between variety and noise.
 */
export function terminatingLandmark(
  seed: Seed256,
  ordinal: number,
): (typeof TERMINATING_LANDMARKS)[number] {
  const start = new Rng(streamSeed(seed, "setpieces")).int(0, TERMINATING_LANDMARKS.length - 1);
  const k = (start + ordinal) % TERMINATING_LANDMARKS.length;
  return TERMINATING_LANDMARKS[k] as (typeof TERMINATING_LANDMARKS)[number];
}

/* -------------------------------------------------------------------------- */
/* axes                                                                        */
/* -------------------------------------------------------------------------- */

/** Every terminus that could hold a vista, best first. */
function candidateAxes(
  plan: CityPlan,
  ground: Ground,
): { readonly score: number; readonly axis: VistaAxis }[] {
  const out: { score: number; axis: VistaAxis }[] = [];
  for (const arterial of plan.arterials) {
    for (const [end, terminus] of arterial.termini.entries()) {
      // Only an end **on the city boundary** may be closed, and this is a
      // safety rule before it is an aesthetic one. Most arterials are run out
      // to the edge by C1's `toEdge`, but a `link` boulevard — the repair
      // `stitch` routes to a stranded component — ends wherever it met the
      // network, in the middle of the city. Seating a cathedral across *that*
      // end would sever the connection the link exists to make.
      if (!onBoundary(plan.bounds, terminus.at)) continue;
      const facing = cardinalOfHeading(terminus.heading);
      const reserve = reserveAt(ground, terminus.at, facing);
      if (reserve === null) continue;
      const step = FACE_STEP[facing];
      const half =
        (step.x === 0
          ? reserve.x1 - reserve.x0
          : reserve.z1 - reserve.z0) >> 1;
      const run = viewRun(arterial, end, facing, terminus.at, half);
      // A view of eleven blocks is a corner, not a vista, and putting a
      // cathedral on one spends the city's best ground on something nobody
      // approaches. Better to leave the axis open and let the fabric have it.
      if (run < VISTA_MIN_RUN) continue;
      const area = (reserve.x1 - reserve.x0 + 1) * (reserve.z1 - reserve.z0 + 1);
      out.push({
        score:
          run * 3 +
          (VISTA_KIND_BONUS[arterial.kind] as number) +
          Math.floor(area / 12) +
          arterial.width * 4,
        axis: {
          id: `${arterial.id}_vista${end}`,
          arterialId: arterial.id,
          arterialKind: arterial.kind,
          width: arterial.width,
          at: terminus.at,
          heading: terminus.heading,
          facing,
          reserve,
          run,
        },
      });
    }
  }
  out.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.axis.at.z !== b.axis.at.z) return a.axis.at.z - b.axis.at.z;
    if (a.axis.at.x !== b.axis.at.x) return a.axis.at.x - b.axis.at.x;
    return a.axis.id < b.axis.id ? -1 : 1;
  });
  return out;
}

/**
 * The largest legal rect at the end of an axis, centred on the centre line.
 *
 * Widest-first, then deepest: a vista's *width* is what closes the view, so a
 * shallow wide site beats a deep narrow one and the search gives up half a
 * column of width only when there is no depth to be had at that width.
 */
function reserveAt(ground: Ground, at: Point2, facing: HorizontalFace): Rect | null {
  const step = FACE_STEP[facing];
  const legal = (x: number, z: number): boolean =>
    ground.buildable(x, z) && !ground.wet(x, z);

  for (let half = VISTA_HALF_MAX; half >= VISTA_HALF_MIN; half--) {
    let depth = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let d = VISTA_SETBACK; d < VISTA_SETBACK + VISTA_DEPTH_MAX; d++) {
      let ok = true;
      let rowLo = Infinity;
      let rowHi = -Infinity;
      for (let a = -half; a <= half; a++) {
        // `step` is a cardinal, so its perpendicular is the other axis outright
        // — no rotation, no table, no rounding.
        const x = at.x + step.x * d + (step.x === 0 ? a : 0);
        const z = at.z + step.z * d + (step.z === 0 ? a : 0);
        if (!legal(x, z)) {
          ok = false;
          break;
        }
        const h = ground.height(x, z);
        if (h < rowLo) rowLo = h;
        if (h > rowHi) rowHi = h;
      }
      if (!ok) break;
      const nextLo = Math.min(lo, rowLo);
      const nextHi = Math.max(hi, rowHi);
      if (nextHi - nextLo > VISTA_MAX_RELIEF) break;
      lo = nextLo;
      hi = nextHi;
      depth++;
    }
    if (depth < VISTA_DEPTH_MIN) continue;
    const backX = at.x + step.x * VISTA_SETBACK;
    const backZ = at.z + step.z * VISTA_SETBACK;
    const frontX = at.x + step.x * (VISTA_SETBACK + depth - 1);
    const frontZ = at.z + step.z * (VISTA_SETBACK + depth - 1);
    const x0 = Math.min(backX, frontX) - (step.x === 0 ? half : 0);
    const x1 = Math.max(backX, frontX) + (step.x === 0 ? half : 0);
    const z0 = Math.min(backZ, frontZ) - (step.z === 0 ? half : 0);
    const z1 = Math.max(backZ, frontZ) + (step.z === 0 ? half : 0);
    return { x0, z0, x1, z1 };
  }
  return null;
}

/**
 * How far down the road the reserved site is still in view, in cells.
 *
 * Not "how straight is the road" — *"from how far away can you see the thing at
 * the end of it"*, which is the question a vista actually asks and the only one
 * whose answer is the same for a due-north boulevard and a 45° diagonal. The
 * measure is the run of consecutive centre-line cells, walking outward from the
 * terminus, whose perpendicular offset from the axis line still falls inside
 * the site's own half-width: the moment the road wanders further than the
 * building is wide, the building has left the frame.
 *
 * This is also what makes the 15° snap in {@link cardinalOfHeading} honest. A
 * boulevard whose true heading is 75° and whose facade squares to 90° drifts
 * across the frame as you walk it, and this run is exactly the distance over
 * which that drift stays under the facade's width.
 */
function viewRun(arterial: Arterial, end: number, facing: HorizontalFace, at: Point2, half: number): number {
  const path = arterial.path;
  if (path.length < 2) return 0;
  const step = FACE_STEP[facing];
  const fromStart = end === 0;
  let run = 0;
  for (let k = 0; k < path.length; k++) {
    const cell = path[(fromStart ? k : path.length - 1 - k) as number] as Point2;
    const dx = cell.x - at.x;
    const dz = cell.z - at.z;
    // Along the axis: positive is *into* the city, which is where the road is.
    const along = dx * step.x + dz * step.z;
    // Across it: the other cardinal outright, because `step` is a cardinal.
    const across = Math.abs(step.x === 0 ? dx : dz);
    if (along < 0 || across > half) break;
    run++;
  }
  return run;
}

/**
 * Whether a point is on the city's own edge, within {@link TERMINUS_EDGE}.
 *
 * A tolerance rather than an equality because `toEdge`'s straight run stops at
 * anything the router would refuse, so an arterial that met a cliff two columns
 * short of the boundary is still an arterial that ends at the boundary.
 */
function onBoundary(bounds: Rect, at: Point2): boolean {
  return (
    at.x - bounds.x0 <= TERMINUS_EDGE ||
    bounds.x1 - at.x <= TERMINUS_EDGE ||
    at.z - bounds.z0 <= TERMINUS_EDGE ||
    bounds.z1 - at.z <= TERMINUS_EDGE
  );
}

/** Two rects, with a margin of slack around the first. */
function overlaps(a: Rect, b: Rect, slack: number): boolean {
  return (
    a.x0 - slack <= b.x1 && b.x0 <= a.x1 + slack && a.z0 - slack <= b.z1 && b.z0 <= a.z1 + slack
  );
}

/* -------------------------------------------------------------------------- */
/* the bridge                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every water crossing worth making read as a bridge.
 *
 * C1 already *builds* the crossing — its router prices a span at
 * `ARTERIAL_BRIDGE_ENTRY` precisely so a city boulevard crosses rather than
 * detours, and Harbourtown carries forty centre-line cells over its river. What
 * it does not do is make the crossing an event: a deck flush with the road, no
 * parapet, no towers, nothing to tell you the ground has gone. That is what the
 * structure pass adds; this only says where.
 */
function bridges(
  plan: CityPlan,
  ground: Ground,
): { readonly score: number; readonly piece: SetPiece }[] {
  const out: { score: number; piece: SetPiece }[] = [];
  for (const arterial of plan.arterials) {
    let start = -1;
    for (let k = 0; k <= arterial.path.length; k++) {
      const cell = arterial.path[k];
      const wet = cell !== undefined && ground.wet(cell.x, cell.z);
      if (wet && start < 0) start = k;
      if (wet || start < 0) continue;
      const span = k - start;
      const from = start;
      start = -1;
      if (span < BRIDGE_MIN_SPAN) continue;
      const lo = Math.max(0, from - BRIDGE_ABUTMENT);
      const hi = Math.min(arterial.path.length - 1, from + span - 1 + BRIDGE_ABUTMENT);
      const path = arterial.path.slice(lo, hi + 1);
      if (path.length < span + 2) continue;
      const half = (arterial.width >> 1) + 2;
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (const c of path) {
        if (c.x < x0) x0 = c.x;
        if (c.x > x1) x1 = c.x;
        if (c.z < z0) z0 = c.z;
        if (c.z > z1) z1 = c.z;
      }
      out.push({
        score: span * 10 + arterial.width,
        piece: {
          id: `${arterial.id}_bridge${from}`,
          kind: "bridge",
          site: { x0: x0 - half, z0: z0 - half, x1: x1 + half, z1: z1 + half },
          detail: `${arterial.kind} "${arterial.id}" spans ${span} columns of water`,
          path,
          width: arterial.width,
        },
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the promenade                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The longest run of shoreline drive with the water on one side only.
 *
 * "On one side only" is the whole test. C1's drive is routed through a band of
 * dry land a fixed distance back from the water, so most of it has a shore —
 * but where it crosses a river mouth or threads a spit it has water on both
 * flanks, and a railing on both sides of a causeway is a causeway, not a
 * promenade.
 */
function promenades(
  plan: CityPlan,
  ground: Ground,
): { readonly score: number; readonly piece: SetPiece }[] {
  const drive = plan.arterials.find((a) => a.kind === "drive");
  if (drive === undefined) return [];
  const path = drive.path;

  const sideAt = (k: number): 1 | -1 | 0 => {
    const h = headingOf(path, k);
    const cell = path[k] as Point2;
    let left = false;
    let right = false;
    for (let r = 2; r <= PROMENADE_REACH; r++) {
      // The left-hand normal of (dx, dz) is (dz, -dx) — `perp`'s convention,
      // restated here because this module may not import the structure pass.
      if (!left && ground.wet(cell.x + h.dz * r, cell.z - h.dx * r)) left = true;
      if (!right && ground.wet(cell.x - h.dz * r, cell.z + h.dx * r)) right = true;
    }
    if (left === right) return 0;
    return left ? 1 : -1;
  };

  let best: { from: number; to: number; side: 1 | -1 } | null = null;
  let from = -1;
  let side: 1 | -1 = 1;
  for (let k = 0; k <= path.length; k++) {
    const here = k === path.length ? 0 : sideAt(k);
    if (here !== 0 && from < 0) {
      from = k;
      side = here;
      continue;
    }
    if (here === side) continue;
    if (from < 0) continue;
    const length = k - from;
    if (length >= PROMENADE_MIN && (best === null || length > best.to - best.from)) {
      best = { from, to: k - 1, side };
    }
    from = here === 0 ? -1 : k;
    if (here !== 0) side = here;
  }
  if (best === null) return [];

  // A promenade longer than this is the whole coastline, and dressing the whole
  // coastline is the "one rule applied everywhere at one frequency" failure the
  // design document names. Keep the middle of the best run.
  const length = best.to - best.from + 1;
  const keep = Math.min(length, PROMENADE_MAX);
  const lo = best.from + ((length - keep) >> 1);
  const run = path.slice(lo, lo + keep);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const c of run) {
    if (c.x < x0) x0 = c.x;
    if (c.x > x1) x1 = c.x;
    if (c.z < z0) z0 = c.z;
    if (c.z > z1) z1 = c.z;
  }
  const half = (drive.width >> 1) + 3;
  return [
    {
      score: keep,
      piece: {
        id: `${drive.id}_promenade`,
        kind: "promenade",
        site: { x0: x0 - half, z0: z0 - half, x1: x1 + half, z1: z1 + half },
        detail: `${keep} columns of shoreline drive with the water to its ${best.side === 1 ? "left" : "right"}`,
        path: run,
        width: drive.width,
        waterSide: best.side,
      },
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* the hillside stair                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The steepest walkable bank inside the city.
 *
 * A defect as much as a set piece. C1 levels each quarter to its own median and
 * deliberately does *not* level the city, so where two quarters at different
 * levels meet across an arterial verge there is a bank — and a bank of seven
 * blocks over fifteen columns is a wall a player has to jump up one block at a
 * time, or cannot climb at all. A public stair is what a real city puts there.
 *
 * The search is a sampled sweep rather than anything clever: every third column
 * of the city, four cardinal directions, take the monotone climb. The strip is
 * only a *proposal* — the structure pass rebuilds the steps against the ground
 * that actually got emitted, because the cell pads have not been applied yet
 * when this runs.
 */
function stairs(
  plan: CityPlan,
  ground: Ground,
  axes: readonly VistaAxis[],
): { readonly score: number; readonly piece: SetPiece }[] {
  const bounds = plan.bounds;
  const half = STAIR_WIDTH >> 1;
  let best: { rise: number; path: Point2[]; site: Rect } | null = null;

  for (const facing of CARDINALS) {
    const step = FACE_STEP[facing];
    for (let z = bounds.z0 + STAIR_RUN; z <= bounds.z1 - STAIR_RUN; z += STAIR_STRIDE) {
      for (let x = bounds.x0 + STAIR_RUN; x <= bounds.x1 - STAIR_RUN; x += STAIR_STRIDE) {
        const run: Point2[] = [];
        let rise = 0;
        let ok = true;
        let previous = ground.height(x, z);
        for (let d = 0; d < STAIR_RUN && ok; d++) {
          const cx = x + step.x * d;
          const cz = z + step.z * d;
          for (let a = -half; a <= half && ok; a++) {
            const px = cx + (step.x === 0 ? a : 0);
            const pz = cz + (step.z === 0 ? a : 0);
            // Never on a carriageway and never in the water: this is a flight
            // of steps across open ground, not a change to a road somebody
            // else already surfaced and graded.
            if (!ground.buildable(px, pz) || ground.wet(px, pz) || ground.arterial(px, pz)) {
              ok = false;
            }
          }
          if (!ok) break;
          const h = ground.height(cx, cz);
          // Monotone: a stair that goes up, flat, down and up again is a path,
          // and a path is the ground pass's business.
          if (h < previous) {
            ok = false;
            break;
          }
          rise += h - previous;
          previous = h;
          run.push({ x: cx, z: cz });
        }
        if (!ok || rise < STAIR_MIN_RISE || run.length < STAIR_RUN) continue;
        // Feasibility, decided here rather than discovered by the pass that
        // builds it. A flight is laid by raising each column until the next is
        // at most one block above it, and a bank with a five-block riser in the
        // middle would need five courses of masonry under the step before it —
        // a retaining wall, not a stair. The structure pass checks this again
        // against the *finished* ground, which is the only ground that counts;
        // checking it here as well is what stops the plan proposing a strip
        // that was never going to be built.
        if (fillNeeded(run.map((p) => ground.height(p.x, p.z))) > STAIR_MAX_FILL) continue;
        const first = run[0] as Point2;
        const last = run[run.length - 1] as Point2;
        const site: Rect = {
          x0: Math.min(first.x, last.x) - (step.x === 0 ? half : 0),
          z0: Math.min(first.z, last.z) - (step.z === 0 ? half : 0),
          x1: Math.max(first.x, last.x) + (step.x === 0 ? half : 0),
          z1: Math.max(first.z, last.z) + (step.z === 0 ? half : 0),
        };
        if (axes.some((a) => overlaps(a.reserve, site, 2))) continue;
        // Strictly greater, so the earliest cardinal and the lowest column win
        // a tie — the sweep order is the tiebreak and it is fixed.
        if (best !== null && rise <= best.rise) continue;
        best = { rise, path: run, site };
      }
    }
  }
  if (best === null) return [];
  return [
    {
      score: best.rise * 8,
      piece: {
        id: "hillside_stair",
        kind: "stair",
        site: best.site,
        detail: `a bank rising ${best.rise} blocks over ${best.path.length} columns`,
        path: best.path,
        rise: best.rise,
      },
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* the civic square                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A square cut *out* of a quarter, rather than left over between buildings.
 *
 * The distinction is the whole point. Every plaza this codebase has drawn
 * before is a block the fabric declined to fill; a civic square is ground the
 * fabric is told it may not have, in a quarter chosen because it is the civic
 * one. It is reserved here and subtracted from the cell's lot mask by the
 * seating pass, which is the only moment at which a district can be told no.
 */
function squares(
  plan: CityPlan,
  ground: Ground,
  axes: readonly VistaAxis[],
): { readonly score: number; readonly piece: SetPiece }[] {
  const ranked = plan.cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => SQUARE_CHARACTERS.includes(cell.character) && cell.area >= SQUARE_MIN_CELL)
    .sort((a, b) => {
      const ra = SQUARE_CHARACTERS.indexOf(a.cell.character);
      const rb = SQUARE_CHARACTERS.indexOf(b.cell.character);
      if (ra !== rb) return ra - rb;
      if (a.cell.area !== b.cell.area) return b.cell.area - a.cell.area;
      return a.index - b.index;
    });

  for (const { cell } of ranked) {
    const site = squareIn(cell, ground);
    if (site === null) continue;
    if (axes.some((a) => overlaps(a.reserve, site, 4))) continue;
    return [
      {
        score: cell.area,
        piece: {
          id: `${cell.id}_square`,
          kind: "square",
          site,
          detail: `a ${SQUARE_SIDE} × ${SQUARE_SIDE} void held open in the ${cell.character} quarter`,
        },
      },
    ];
  }
  return [];
}

/** The square's seat: as near the cell's middle as fits wholly inside it. */
function squareIn(cell: DistrictCell, ground: Ground): Rect | null {
  const b = cell.bounds;
  const cx = (b.x0 + b.x1) >> 1;
  const cz = (b.z0 + b.z1) >> 1;
  const side = SQUARE_SIDE;
  const fits = (x0: number, z0: number): boolean => {
    for (let z = z0; z < z0 + side; z++) {
      for (let x = x0; x < x0 + side; x++) {
        if (!cellContains(cell, x, z)) return false;
        if (!ground.buildable(x, z) || ground.wet(x, z)) return false;
      }
    }
    return true;
  };
  const start = { x: cx - (side >> 1), z: cz - (side >> 1) };
  // A fixed outward spiral by ring and then by row: the same cell always yields
  // the same square, and a cell whose middle is a street finds the nearest
  // whole block instead of failing.
  const found = findFirstOnChebyshevRing(start, {
    startRadius: 0,
    maxRadius: 64,
    step: 2,
    isEligible: (x, z) => fits(x, z),
  });
  if (found === null) return null;
  return { x0: found.x, z0: found.z, x1: found.x + side - 1, z1: found.z + side - 1 };
}

/**
 * The terrace grammar — the continuous street wall.
 *
 * `core.ts` builds a detached house and `highrise.ts` builds a tower; both are
 * **one shell with four walls**, and a dense city is not made of those. Set two
 * of them at zero spacing and you get two boxes back to back — eight walls
 * where a street has five, a seam of daylight down the middle, and two
 * silhouettes where the eye wants one. Kai walked the first Bayline and named
 * it exactly: "buildings are also often touching each other."
 *
 * A real dense block is a **terrace**: one building of N bays sharing party
 * walls, with
 *
 * - **one wall between neighbours, not two** — n bays stand on n+1 wall lines,
 *   which is the whole reason this file exists;
 * - **a continuous ground-floor band** — stall riser, shopfront glazing, one
 *   street door per bay, and an awning course running the length of the run,
 *   because the ground floor is the only storey a pedestrian ever reads;
 * - **a cornice discipline** — adjacent bays within one storey of each other
 *   snap to the same height, so the run has long unbroken cornice lines with
 *   occasional deliberate steps. Every bay a different height is noise; every
 *   bay the same height is a wall;
 * - **per-bay parapets, materials and window rhythms**, so the run reads as
 *   separate buildings that grew together rather than as one long shed;
 * - **a corner unit** where the run ends at an intersection: a quoined pier
 *   carried above the roofline, a raised parapet, an end elevation with real
 *   windows in it, and a finial lamp. (Of the three treatments the brief
 *   offered — chamfer, corner entrance, turret/parapet emphasis — this is the
 *   third. The other two both move a door off the street face, and "one street
 *   door per bay, on the street" is a property worth being able to state
 *   without an exception.)
 * - **a blind rear elevation** — small windows, no doors — because the block
 *   interior behind a terrace is a courtyard, and a courtyard is deliberate
 *   negative space, not a place to put more building.
 *
 * ## Why every roof here is flat
 *
 * Not a shortcut. A fabric lot is sixteen or seventeen blocks deep and six to
 * twelve wide, and a pitched roof over a plan that deep is eight courses of
 * slope — a barn on top of a shop. Dense-city terraces over deep plots have
 * always had flat or butterfly roofs behind a parapet, and the parapet is where
 * the variety goes: plain, raised, or a dentil course under the coping,
 * stepping with the cornice.
 *
 * ## Coordinates
 *
 * Node-local and unrotated, exactly as `core.ts`: `y = 0` is the ground-floor
 * plane, `y < 0` the foundation skirt, and the one-block ring outside the
 * footprint is the apron (the awning and the cornice live there). Bays run
 * along **+x**; the street is the **local south** face (`z = sz - 1`) and the
 * rear is the local north face (`z = 0`). That matches the door port the
 * district declares, so the solver's yaw turns the shopfronts onto the street
 * without this file knowing which street it is.
 *
 * ## The multi-door consequence
 *
 * A terrace has one door per bay, and every earlier building in this codebase
 * had exactly one door full stop. Two places assumed that and now do not: the
 * physics lint's walking agent and its stdlib mirror both start from *every*
 * street door rather than from the first one they find. Nothing about a
 * one-door building changes — there is still exactly one start — but "reachable
 * from the front door" becomes "reachable from a street door", which is the
 * property a terrace actually has.
 *
 * ## Determinism
 *
 * Every choice is a positional hash: bay pitches walk the frontage and each is
 * keyed on the column it starts at, heights and materials on the bay's own
 * start column, the door on the bay's interior. Nothing is keyed on a bay
 * *index*, so a run that starts at the same world column produces the same
 * street however the rest of the district was cut.
 *
 * ## Dependency direction
 *
 * `core.ts` imports {@link emitTerrace}; this file imports **only types** back,
 * the same arrangement `highrise.ts` has, so the cycle is type-level and
 * TypeScript erases it.
 */

import { positionInt, type Seed256 } from "../determinism/index.js";

import type {
  BuildingMeta,
  BuildingResult,
  Cardinal,
  Footprint,
  LocalRect,
  LocalVoxelOp,
  Put,
  ResolvedBuildingParams,
  Shell,
} from "./core.js";
import { materialKey, type BuildingMaterials, type MaterialTheme } from "./themes.js";

/* -------------------------------------------------------------------------- */
/* the archetype                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The terrace, as a one-entry family.
 *
 * A family rather than a bare string so it spreads into `BUILDING_ARCHETYPES`
 * the way every other wave does, and so a second member (a mews, an arcade) has
 * somewhere to land.
 *
 * It deliberately claims **no tags**. `terrace` and `terraced_row` both already
 * resolve to wave 4A's `terraced_row` — a single house wearing party piers —
 * and stealing them would silently re-point every document that says "terrace"
 * at a generator with a completely different footprint contract. This archetype
 * is asked for by name (`params.archetype: "terrace"`), which is how the
 * district fabric asks for it.
 */
export const TERRACE_ARCHETYPES = ["terrace"] as const;

/** The terrace archetype. */
export type TerraceArchetype = (typeof TERRACE_ARCHETYPES)[number];

/** True for a name in {@link TERRACE_ARCHETYPES}. */
export function isTerraceArchetype(name: string): name is TerraceArchetype {
  return (TERRACE_ARCHETYPES as readonly string[]).includes(name);
}

/* -------------------------------------------------------------------------- */
/* the knobs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Narrowest **bay pitch**, in columns.
 *
 * Pitch is party wall to party wall — what a person standing across the street
 * calls "one building". The interior is one less than the pitch, because the
 * wall on the low-x side belongs to this bay and the one on the high-x side
 * belongs to the next.
 */
export const TERRACE_MIN_PITCH = 6;
/** Widest bay pitch, in columns. */
export const TERRACE_MAX_PITCH = 12;

/** Most storeys one bay builds. Past this it is a tower, not a terrace. */
export const TERRACE_MAX_FLOORS = 8;

/** Storey height the terrace builds at when the document does not say. */
export const TERRACE_STOREY_HEIGHT = 4;

/**
 * Longest chain of bays the cornice may snap into one line.
 *
 * Without a cap a run whose storeys happen to sit within one of each other end
 * to end flattens into a single unbroken parapet — "all equal reads as a wall".
 * Breaking the chain every fourth bay only *allows* a step; where the drawn
 * storeys agree anyway the line stays flat, which is why this can never
 * manufacture a step the heights did not ask for.
 */
export const TERRACE_MAX_CORNICE_RUN = 4;

/** Shallowest terrace whose bays still fit a stair flight and its landing. */
export function terraceMinDepth(storeyHeight: number): number {
  return storeyHeight + 4;
}

/** Narrowest frontage that is a terrace rather than one wide shop. */
export const TERRACE_MIN_FRONTAGE = TERRACE_MIN_PITCH + TERRACE_MAX_PITCH + 1;

/* -------------------------------------------------------------------------- */
/* the bay                                                                     */
/* -------------------------------------------------------------------------- */

/** One bay, as a document or the district fabric asks for it. */
export interface TerraceBay {
  /** Pitch in columns — party wall to party wall. Clamped into the range. */
  readonly width: number;
  /** Storeys asked for, before the cornice snap. */
  readonly floors: number;
  /** What this bay is for; steers the upper-floor fit-out only. */
  readonly archetype?: string;
}

/** How a bay finishes at the roofline. */
export const TERRACE_PARAPETS = ["plain", "raised", "dentil"] as const;

/** A parapet profile. */
export type TerraceParapet = (typeof TERRACE_PARAPETS)[number];

/** One bay, resolved: where its walls are, how tall it came out, what it is. */
export interface TerraceBayPlan {
  /** Party wall column on the low-x side. Shared with the previous bay. */
  readonly wall0: number;
  /** Party wall column on the high-x side. Shared with the next bay. */
  readonly wall1: number;
  /** Interior x range, inclusive: `wall0 + 1 .. wall1 - 1`. */
  readonly x0: number;
  readonly x1: number;
  /** Storeys asked for, before the snap. */
  readonly asked: number;
  /** Storeys built, after the cornice snap. */
  readonly floors: number;
  readonly archetype: string;
  readonly parapet: TerraceParapet;
  /** Local x of this bay's street door. */
  readonly doorX: number;
  /** True when this bay stands at the end of the run, at an intersection. */
  readonly corner: boolean;
}

/** What one terrace's frontage came to. */
export interface TerracePlan {
  /** Wall lines, low to high: `walls[0] === 0`, the last is `sx - 1`. */
  readonly walls: readonly number[];
  readonly bays: readonly TerraceBayPlan[];
  readonly storeyHeight: number;
}

/** Input to {@link planTerrace}. */
export interface TerracePlanInput {
  /** Frontage in columns — the envelope's x extent. */
  readonly sx: number;
  readonly storeyHeight: number;
  /** What the caller asked for, bay by bay; extended or truncated to fit. */
  readonly bays?: readonly TerraceBay[];
  /** Storeys for a bay the caller did not describe. */
  readonly floors: number;
  readonly archetype?: string;
  /** True when the run's low-x / high-x end stands at an intersection. */
  readonly cornerStart?: boolean;
  readonly cornerEnd?: boolean;
  /** The node's positional stream. */
  readonly stream: Seed256;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Cut a frontage into bays, snap the cornice, and place the doors.
 *
 * Exported because **two** callers need the same answer and neither may guess
 * the other's: this file builds the doors, and the district fabric declares a
 * port for each of them so the doorstep pass can meet them. One function, two
 * readers, no second source of truth.
 *
 * The frontage walk is the positional part. Starting at the low-x end it draws
 * a pitch keyed on the column it is standing at and stops when the remainder is
 * one bay's worth — so a bay's width depends on where it starts along the run
 * and on nothing else. The one exception is the last bay, which absorbs
 * whatever is left; that is a property of the run's own length, which is the
 * granularity this is allowed to depend on.
 */
export function planTerrace(input: TerracePlanInput): TerracePlan {
  const { sx, stream } = input;
  const storeyHeight = input.storeyHeight;
  const span = Math.max(2, sx - 1); // n bays stand on n + 1 wall lines.

  const walls: number[] = [0];
  const asked = input.bays ?? [];
  let cursor = 0;
  let k = 0;
  while (span - cursor > TERRACE_MAX_PITCH) {
    const declared = asked[k]?.width;
    let pitch =
      declared === undefined
        ? positionInt(stream, cursor, 1, 0, TERRACE_MIN_PITCH, TERRACE_MAX_PITCH)
        : clamp(Math.round(declared), TERRACE_MIN_PITCH, TERRACE_MAX_PITCH);
    // Never leave a stub: a remainder below the minimum pitch is not a bay, so
    // this bay gives up the columns that would have made one.
    if (span - cursor - pitch < TERRACE_MIN_PITCH) pitch = span - cursor - TERRACE_MIN_PITCH;
    cursor += pitch;
    walls.push(cursor);
    k++;
  }
  walls.push(span);

  // --- storeys, then the snap ----------------------------------------------
  const count = walls.length - 1;
  const wanted: number[] = [];
  for (let i = 0; i < count; i++) {
    // No jitter when the caller did not describe this bay. A generator that
    // quietly builds three storeys when the document said two is a generator
    // whose `meta.params.floors` lies, and the variation a street needs is the
    // *district's* to author — it is the thing that knows what the block is for.
    wanted.push(clamp(Math.round(asked[i]?.floors ?? input.floors), 1, TERRACE_MAX_FLOORS));
  }
  const snapped = snapCornice(wanted);

  const bays: TerraceBayPlan[] = [];
  for (let i = 0; i < count; i++) {
    const wall0 = walls[i] as number;
    const wall1 = walls[i + 1] as number;
    const x0 = wall0 + 1;
    const x1 = wall1 - 1;
    const width = x1 - x0 + 1;
    // The door sits one clear column in from either party wall when there is
    // room, so a shopfront is never a door hard against a pier.
    const lo = width >= 5 ? x0 + 1 : x0;
    const hi = width >= 5 ? x1 - 1 : x1;
    bays.push({
      wall0,
      wall1,
      x0,
      x1,
      asked: wanted[i] as number,
      floors: snapped[i] as number,
      archetype: asked[i]?.archetype ?? input.archetype ?? "shop_row",
      parapet: TERRACE_PARAPETS[
        positionInt(stream, wall0, 5, 0, 0, TERRACE_PARAPETS.length - 1)
      ] as TerraceParapet,
      doorX: hi >= lo ? positionInt(stream, wall0, 2, 0, lo, hi) : x0,
      corner:
        (i === 0 && input.cornerStart === true) ||
        (i === count - 1 && input.cornerEnd === true),
    });
  }
  return { walls, bays, storeyHeight };
}

/**
 * The cornice discipline: adjacent bays within one storey take the same height.
 *
 * A left-to-right sweep with an anchor. Each bay either joins the run it is
 * standing in — taking that run's height, not its own — or, when it is more
 * than one storey away from it or the run has already gone on for
 * {@link TERRACE_MAX_CORNICE_RUN} bays, starts a new run at its own height.
 *
 * The result is a parapet made of a few long horizontals with deliberate steps
 * between them, which is what a real street of buildings that grew together
 * looks like. Every height it emits is a height some bay asked for; it never
 * invents one.
 */
export function snapCornice(floors: readonly number[]): number[] {
  const out: number[] = [];
  let anchor = -1;
  let run = 0;
  for (const want of floors) {
    if (anchor >= 0 && run < TERRACE_MAX_CORNICE_RUN && Math.abs(want - anchor) <= 1) {
      out.push(anchor);
      run++;
      continue;
    }
    anchor = want;
    run = 1;
    out.push(anchor);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the request                                                                 */
/* -------------------------------------------------------------------------- */

/** What `core.ts` hands over when it dispatches a terrace here. */
export interface TerraceRequest {
  readonly put: Put;
  readonly cells: Map<string, LocalVoxelOp>;
  readonly style: Readonly<Record<string, string>>;
  /** The node's material stream — every positional draw hangs off it. */
  readonly grammar: Seed256;
  /** The fit-out's stream. */
  readonly choice: Seed256;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly foundationDepth: number;
  readonly materials: BuildingMaterials;
  /** The village palette, when the caller has one: per-bay facades come from it. */
  readonly theme?: MaterialTheme;
  readonly params: ResolvedBuildingParams;
  readonly plan: TerracePlan;
  readonly footprint: Footprint;
  readonly shell: Shell;
}

/* -------------------------------------------------------------------------- */
/* the grammar                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build one terrace, deterministically.
 *
 * Stages: skirt → ground plane → wall lines (the party walls, once each) →
 * per-bay facade → plates, stairs and roof decks → parapets and cornice → the
 * continuous ground-floor band → fit-out → lights → the corner unit.
 *
 * Like every other emitter in this package each stage writes into one cell map,
 * so a later stage overwriting an earlier one is explicit rather than dependent
 * on emit order.
 */
/**
 * How far apart the upper-storey windows of a bay stand.
 *
 * `regular` — which is what an undeclared facade resolves to — hands back the
 * positionally drawn pitch the run always used, so a document that names no
 * rhythm is byte-identical. Only a named rhythm overrides it, and then the
 * whole run speaks with one voice: that is the point of asking for one.
 */
function rhythmPeriod(rhythm: string | undefined, drawn: number): number {
  switch (rhythm) {
    case "sparse":
      return 4;
    case "dense":
      return 2;
    default:
      return drawn;
  }
}

export function emitTerrace(r: TerraceRequest): BuildingResult {
  const { put, cells, style, grammar, choice, sx, sy, sz } = r;
  const h = r.plan.storeyHeight;
  const bays = r.plan.bays;
  const walls = r.plan.walls;

  const frame = style["wall.frame"] as string;
  const stair = style["stair.interior"] as string;
  const doorBlock = style["door.block"] as string;
  const band = style["foundation.accent"] as string;
  const pier = style["foundation.primary"] as string;
  const capSlab = style["stone.slab"] as string;
  const awningSlab = style["roof.slab"] as string;

  const foundationAt = (x: number, y: number, z: number): string =>
    positionInt(grammar, x, y, z, 0, 9) < 3 ? band : pier;

  /** The interior's near and far rows in z, shared by every bay. */
  const iz0 = 1;
  const iz1 = sz - 2;
  const hasInterior = iz1 >= iz0 && bays.some((b) => b.x1 >= b.x0);
  const front = sz - 1;

  /* --- per-bay materials --------------------------------------------------- */
  // The single biggest thing that stops a run reading as one long shed. Drawn
  // positionally off the bay's own start column, so a bay keeps its facade
  // whatever else changes about the street.
  const bayStyle = bays.map((bay) => perBayStyle(style, r.theme, grammar, bay.wall0));

  /* --- heights ------------------------------------------------------------- */
  const wallTopOf = (i: number): number => (bays[i] as TerraceBayPlan).floors * h;
  /** Courses of parapet over the eave line, before the coping slab. */
  const parapetCourses = (i: number): number => {
    const bay = bays[i] as TerraceBayPlan;
    return (bay.parapet === "plain" ? 1 : 2) + (bay.corner ? 2 : 0);
  };
  /** Y of the coping slab that finishes a bay's parapet. */
  const copingOf = (i: number): number => wallTopOf(i) + parapetCourses(i) + 1;
  const maxWallTop = Math.max(...bays.map((_, i) => wallTopOf(i)));
  const maxFloors = Math.max(...bays.map((b) => b.floors));
  let roofTop = maxWallTop;
  const raise = (y: number): void => {
    if (y > roofTop) roofTop = y;
  };

  /* --- foundation skirt ---------------------------------------------------- */
  for (let d = 1; d <= r.foundationDepth; d++) {
    for (const cell of r.shell.cells) put(cell.x, -d, cell.z, foundationAt(cell.x, -d, cell.z));
  }

  /* --- ground plane -------------------------------------------------------- */
  // Floor inside a bay, foundation everywhere a wall stands — including the
  // party wall columns, which are wall and not floor for their whole height.
  const interiorKeys = new Set<string>();
  for (const bay of bays) {
    for (let z = iz0; z <= iz1; z++) {
      for (let x = bay.x0; x <= bay.x1; x++) interiorKeys.add(`${x},${z}`);
    }
  }
  for (const cell of r.shell.cells) {
    const inside = interiorKeys.has(`${cell.x},${cell.z}`);
    put(
      cell.x,
      0,
      cell.z,
      inside
        ? ((bayStyle[bayAt(bays, cell.x)] ?? style)["floor.interior"] as string)
        : foundationAt(cell.x, 0, cell.z),
    );
  }

  /* --- the wall lines: ONE wall between neighbours ------------------------- */
  //
  // This loop is the point of the file. `walls` has n + 1 entries for n bays,
  // so the seam between two neighbours is a single column of masonry that both
  // of them own — not two walls with a crack between them. Each line runs to
  // the taller of the bays it separates and then one course higher, so the
  // roofline is broken by a fire-wall upstand at every bay boundary exactly as
  // a real terrace's is.
  for (const [j, w] of walls.entries()) {
    const left = j > 0 ? copingOf(j - 1) : -1;
    const right = j < bays.length ? copingOf(j) : -1;
    const endBay = j === 0 ? bays[0] : j === walls.length - 1 ? bays[bays.length - 1] : undefined;
    const upstand = Math.max(left, right) + (endBay?.corner === true ? 3 : 1);
    for (let z = 0; z < sz; z++) {
      for (let y = 1; y <= upstand; y++) put(w, y, z, pier);
      put(w, upstand + 1, z, capSlab, { type: "bottom" });
    }
    raise(upstand + 1);
  }

  /* --- per-bay facade ------------------------------------------------------ */
  let windowCount = 0;
  let apronOps = 0;
  const doors: { x: number; z: number; face: Cardinal }[] = [];

  for (const [i, bay] of bays.entries()) {
    if (bay.x1 < bay.x0) continue;
    const s = bayStyle[i] as Record<string, string>;
    const wall = s["wall.primary"] as string;
    const period = rhythmPeriod(r.params.windowRhythm, positionInt(grammar, bay.wall0, 3, 0, 2, 3));
    const offset = positionInt(grammar, bay.wall0, 4, 0, 0, period - 1);

    for (let f = 0; f < bay.floors; f++) {
      const base = f * h;
      for (let y = base + 1; y <= base + h; y++) {
        const bandCourse = y === base + h;
        for (let x = bay.x0; x <= bay.x1; x++) {
          /* ---- the street elevation ---- */
          if (bandCourse) {
            // The storey band: over the shopfront it is the fascia the awning
            // hangs under, and higher up it is the floor line. One material for
            // both, because on a real facade they are the same string course.
            put(x, y, front, band);
          } else if (f === 0) {
            if (x === bay.doorX && y <= base + 2) {
              // The door and its head are emitted below, with their frame.
            } else if (y === base + 1) {
              put(x, y, front, band); // the stall riser under the glazing
            } else {
              put(x, y, front, s["wall.window"] as string, { east: "true", west: "true" });
              windowCount++;
            }
          } else if (y === base + 1) {
            put(x, y, front, wall); // spandrel: the opaque waist under the sill
          } else if ((x - bay.x0) % period === offset) {
            put(x, y, front, s["wall.window"] as string, { east: "true", west: "true" });
            windowCount++;
          } else {
            put(x, y, front, wall);
          }

          /* ---- the rear elevation: blind, bar one small light per storey ---- */
          const rearLight = x === bay.x0 + ((bay.x1 - bay.x0) >> 1) && y === base + 2;
          if (bandCourse) put(x, y, 0, band);
          else if (rearLight) {
            put(x, y, 0, s["wall.window"] as string, { east: "true", west: "true" });
            windowCount++;
          } else put(x, y, 0, wall);
        }
      }
    }

    /* ---- the street door ------------------------------------------------ */
    for (const half of ["lower", "upper"] as const) {
      put(bay.doorX, half === "lower" ? 1 : 2, front, doorBlock, {
        facing: "south",
        half,
        hinge: (bay.doorX & 1) === 0 ? "left" : "right",
        open: "false",
      });
    }
    put(bay.doorX, 3, front, frame, { axis: "x" });
    doors.push({ x: bay.doorX, z: front, face: "south" });

    /* ---- the end elevation ---------------------------------------------- */
    // Only a corner unit gets one. Every other end wall of a terrace is a party
    // wall waiting for a neighbour, and blank is exactly what that is.
    if (bay.corner) {
      const endX = i === 0 ? 0 : sx - 1;
      for (let f = 1; f < bay.floors; f++) {
        const y = f * h + 2;
        for (let z = iz0 + 1; z <= iz1 - 1; z += 3) {
          put(endX, y, z, s["wall.window"] as string, { north: "true", south: "true" });
          windowCount++;
        }
      }
    }
  }

  /* --- plates, stairs and roof decks --------------------------------------- */
  const levels: number[] = [];
  for (let f = 0; f < maxFloors; f++) levels.push(f * h);
  const stairRuns: number[] = [];
  /** Ground-floor columns the stair flight stands in; furniture keeps off. */
  const stairColumns = new Set<string>();
  /**
   * Interior floor columns per entry of `levels`.
   *
   * The reason this exists. A terrace is the first building whose storeys are
   * not all the same plan: at level 5 a six-storey bay is a room and the
   * three-storey bay beside it is a roof. Reporting one column set for every
   * level would have the traversal lint demand a walking route onto the roof of
   * every short bay in the run.
   */
  const byLevel: { x: number; z: number }[][] = levels.map(() => []);

  const canStair = hasInterior && iz1 - iz0 >= h + 1;

  for (const [i, bay] of bays.entries()) {
    if (bay.x1 < bay.x0 || !hasInterior) continue;
    const s = bayStyle[i] as Record<string, string>;
    const plate = s["floor.interior"] as string;
    const deck = s["roof.solid"] as string;
    for (let f = 0; f < bay.floors; f++) {
      const rows = byLevel[f] as { x: number; z: number }[];
      for (let z = iz0; z <= iz1; z++) {
        for (let x = bay.x0; x <= bay.x1; x++) rows.push({ x, z });
      }
    }
    // The stair well runs up the bay's low-x party wall, which is the one
    // surface in a bay guaranteed to be blank masonry for its whole height.
    const holeZ1 = canStair ? iz0 + h : iz0;
    for (let f = 1; f <= bay.floors; f++) {
      const level = f * h;
      const top = f === bay.floors;
      for (let z = iz0; z <= iz1; z++) {
        for (let x = bay.x0; x <= bay.x1; x++) {
          // The top plate is the roof deck and is never holed: a run of open
          // stairwells in a row of roofs is a row of holes in the street.
          if (!top && x === bay.x0 && z >= iz0 && z <= holeZ1) continue;
          put(x, level, z, top ? deck : plate);
        }
      }
      if (top) continue;
      const base = level - h;
      stairRuns.push(base + 1);
      if (canStair) {
        // The flight `core.ts` learned the hard way: `h` steps long with its
        // top tread in the plane it arrives at, standing one cell off the rear
        // wall so its front face is open and the climb is a walk.
        for (let step = 0; step < h; step++) {
          put(bay.x0, base + 1 + step, iz0 + 1 + step, stair, {
            facing: "south",
            half: "bottom",
            shape: "straight",
          });
          if (base === 0) stairColumns.add(`${bay.x0},${iz0 + 1 + step}`);
        }
        if (base === 0) {
          stairColumns.add(`${bay.x0},${iz0}`);
          if (bay.x0 + 1 <= bay.x1) stairColumns.add(`${bay.x0 + 1},${iz0}`);
          stairColumns.add(`${bay.x0},${iz0 + h + 1}`);
        }
        // No rail along the well's open edge, for `highrise.ts`'s reason rather
        // than out of laziness: a bay is five to eleven columns wide, and a
        // fence course beside the well is a fence *across* the room.
      } else {
        // Too shallow for a flight: a ladder. Its backing is the party wall,
        // which this grammar guarantees is solid masonry for its whole height —
        // so unlike the cottage's ladder there is nothing to claim first.
        for (let y = base + 1; y <= level + 1; y++) {
          put(bay.x0, y, iz0, "ladder", { facing: "east" });
        }
        if (base === 0) {
          stairColumns.add(`${bay.x0},${iz0}`);
          if (bay.x0 + 1 <= bay.x1) stairColumns.add(`${bay.x0 + 1},${iz0}`);
        }
      }
    }
  }

  /* --- parapets and the cornice -------------------------------------------- */
  for (const [i, bay] of bays.entries()) {
    if (bay.x1 < bay.x0) continue;
    const s = bayStyle[i] as Record<string, string>;
    const parapet = s["roof.solid"] as string;
    const coping = s["roof.slab"] as string;
    const eave = wallTopOf(i);
    const courses = parapetCourses(i);
    for (const [z, outward] of [
      [0, "north"],
      [front, "south"],
    ] as const) {
      for (let x = bay.x0; x <= bay.x1; x++) {
        for (let c = 1; c <= courses; c++) {
          // The dentil: the first course of the parapet is a run of upside-down
          // stairs, which from the street is a toothed shadow line under the
          // coping. Structure above it, so nothing is a half-block in air.
          if (c === 1 && bay.parapet === "dentil") {
            put(x, eave + c, z, s["roof.stairs"] as string, {
              facing: outward,
              half: "top",
              shape: "straight",
            });
          } else {
            put(x, eave + c, z, parapet);
          }
        }
        put(x, eave + courses + 1, z, coping, { type: "bottom" });
      }
    }
    raise(eave + courses + 1);
    // The cornice: an overhanging course in the apron at the eave line, on the
    // street side only. One block of overhang is what gives a facade a shadow
    // line — `core.ts` says the same of its eave, and it is just as true forty
    // blocks up. Fixed sideways to the band course behind it, so no part of it
    // is a floating half-block.
    for (let x = bay.x0; x <= bay.x1; x++) {
      put(x, eave, sz, coping, { type: "top" });
      apronOps++;
    }
  }

  /* --- the continuous ground-floor band ------------------------------------ */
  // The awning: one unbroken course the length of the run, in the apron, at the
  // head of the shopfront — which is what makes N bays read as one street wall
  // rather than as N buildings that happen to be adjacent. A slab, so its lower
  // half is open and a pedestrian sees the shopfront under it, and fixed
  // sideways to the glazing behind it, so none of it hangs in air.
  if (h >= 4) {
    for (let x = 0; x < sx; x++) {
      put(x, h - 1, sz, awningSlab, { type: "top" });
      apronOps++;
    }
  }

  /* --- fit-out ------------------------------------------------------------- */
  let furnitureCount = 0;
  if (hasInterior) {
    for (const [i, bay] of bays.entries()) {
      if (bay.x1 < bay.x0) continue;
      furnitureCount += fitBay({
        put,
        style: bayStyle[i] as Record<string, string>,
        bay,
        iz0,
        iz1,
        storey: h,
        choice,
        stairColumns,
      });
    }
  }

  /* --- lighting ------------------------------------------------------------ */
  // One per bay per storey, hung from the plane above — which every storey has,
  // because the top plate is the roof deck. Never over the stair column, whose
  // plate is a hole, and never at head height: on a three-course storey a
  // hanging lantern is a wall across the middle of the room, so a short storey
  // gets a wall torch bracketed to the party wall instead.
  let lanternCount = 0;
  if (hasInterior) {
    for (const bay of bays) {
      if (bay.x1 < bay.x0) continue;
      const lx = Math.min(bay.x1, bay.x0 + 1 + ((bay.x1 - bay.x0 - 1) >> 1));
      const lz = iz0 + ((iz1 - iz0) >> 1);
      for (let f = 0; f < bay.floors; f++) {
        const y = (f + 1) * h - 1;
        if (h >= 4 && lx > bay.x0) {
          put(lx, y, lz, style["light.lantern"] as string, { hanging: "true" });
        } else {
          put(bay.x0, y, lz, "wall_torch", { facing: "east" });
        }
        lanternCount++;
      }
    }
  }

  /* --- the corner unit ----------------------------------------------------- */
  // The finial. The end wall line already stands three courses higher than the
  // rest of the roofline for a corner bay; this is the cap and the lamp that
  // make it read as a turret rather than as a wall somebody forgot to stop.
  for (const end of [0, bays.length - 1]) {
    const bay = bays[end];
    if (bay === undefined || !bay.corner) continue;
    const endX = end === 0 ? 0 : sx - 1;
    const j = end === 0 ? 0 : walls.length - 1;
    const left = j > 0 ? copingOf(j - 1) : -1;
    const right = j < bays.length ? copingOf(j) : -1;
    const top = Math.max(left, right) + 3;
    for (const z of [0, front]) {
      put(endX, top + 1, z, pier);
      put(endX, top + 2, z, style["light.lantern"] as string, { hanging: "false" });
      lanternCount++;
    }
    raise(top + 2);
  }

  /* --- what was built ------------------------------------------------------ */
  const floorCells: { x: number; z: number }[] = [];
  for (let z = iz0; z <= iz1; z++) {
    for (let x = 0; x < sx; x++) {
      if (interiorKeys.has(`${x},${z}`)) floorCells.push({ x, z });
    }
  }
  const first = bays.find((b) => b.x1 >= b.x0);
  const interior: LocalRect =
    hasInterior && first !== undefined
      ? { x0: first.x0, z0: iz0, x1: first.x1, z1: iz1 }
      : { x0: 1, z0: 1, x1: 0, z1: 0 };

  const meta: BuildingMeta = {
    params: { ...r.params, floors: maxFloors, storyHeight: h },
    size: [sx, sy, sz],
    wallTop: maxWallTop,
    roofBase: maxWallTop + 1,
    roofTop,
    height: roofTop + 1,
    foundationDepth: r.foundationDepth,
    door: doors[0] ?? null,
    doors,
    terraceBays: bays,
    interior,
    footprint: r.footprint,
    cells: r.shell.cells,
    floorCells,
    floorCellsByLevel: byLevel,
    floorLevels: levels,
    stairRuns,
    stairColumns,
    basementDepth: 0,
    basementInterior: null,
    basementAccess: null,
    windowCount,
    lanternCount,
    apronOps,
    furnitureCount,
    chimney: false,
    materialKey: materialKey(r.materials),
  };
  return { ops: sortOpsLocal([...cells.values()]), meta };
}

/** Index of the bay whose interior contains `x`, or 0 when none does. */
function bayAt(bays: readonly TerraceBayPlan[], x: number): number {
  for (const [i, bay] of bays.entries()) {
    if (x >= bay.x0 && x <= bay.x1) return i;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/* per-bay materials                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The style one bay is clad in.
 *
 * With a theme in hand the bay takes a whole triple from it — a wood, a stone
 * and a roof, each drawn positionally off the bay's own start column — which is
 * what makes a run read as buildings from the same street rather than as one
 * building painted one colour. Without a theme (a caller that passed only a
 * style map) it rotates the facade among the symbols the map already has, which
 * is a smaller variation but never an off-palette one.
 */
export function perBayStyle(
  base: Readonly<Record<string, string>>,
  theme: MaterialTheme | undefined,
  stream: Seed256,
  column: number,
): Record<string, string> {
  if (theme !== undefined && theme.woods.length > 0 && theme.roofs.length > 0) {
    const wood = theme.woods[positionInt(stream, column, 7, 0, 0, theme.woods.length - 1)];
    const roof = theme.roofs[positionInt(stream, column, 8, 0, 0, theme.roofs.length - 1)];
    const stone =
      theme.stones.length > 0
        ? theme.stones[positionInt(stream, column, 9, 0, 0, theme.stones.length - 1)]
        : undefined;
    return {
      ...base,
      ...(wood === undefined
        ? {}
        : {
            "wall.primary": wood.planks,
            "wall.accent": wood.log,
            "floor.interior": wood.planks,
            "stair.interior": wood.stairs,
            "wall.fence": wood.fence,
          }),
      ...(roof === undefined
        ? {}
        : { "roof.solid": roof.solid, "roof.slab": roof.slab, "roof.stairs": roof.stairs }),
      ...(stone === undefined ? {} : { "stone.slab": stone.slab }),
    };
  }
  const candidates = [
    base["wall.primary"] as string,
    base["foundation.primary"] as string,
    base["foundation.accent"] as string,
    base["roof.solid"] as string,
  ].filter((b) => typeof b === "string");
  if (candidates.length === 0) return { ...base };
  const wall = candidates[positionInt(stream, column, 7, 0, 0, candidates.length - 1)] as string;
  return { ...base, "wall.primary": wall };
}

/* -------------------------------------------------------------------------- */
/* the fit-out                                                                 */
/* -------------------------------------------------------------------------- */

interface BayFitRequest {
  readonly put: Put;
  readonly style: Readonly<Record<string, string>>;
  readonly bay: TerraceBayPlan;
  readonly iz0: number;
  readonly iz1: number;
  readonly storey: number;
  readonly choice: Seed256;
  readonly stairColumns: ReadonlySet<string>;
}

/**
 * What a bay is used for, from the archetype the district's mix dealt it.
 *
 * The **ground floor is always a shop** — that is what a continuous street wall
 * with a shopfront band means, and flats over shops is the normal arrangement
 * in every dense city there is. The use decides the storeys above, which is
 * where the difference between an office block and a tenement actually lives.
 */
export type TerraceBayUse = "retail" | "residential" | "office";

/** Map a bay's archetype onto what its upper floors are for. */
export function terraceBayUse(archetype: string): TerraceBayUse {
  if (/office|bank|counting|corporate|guild|chamber|embassy|post_office/.test(archetype)) {
    return "office";
  }
  if (/apartment|tenement|flat|house|hotel|dormitory|boarding|lodging|residen/.test(archetype)) {
    return "residential";
  }
  return "retail";
}

/**
 * Furnish one bay: a shop counter on the ground floor, and the use above it.
 *
 * Everything hugs the bay's **high-x** wall, because the low-x one is the stair
 * well for the bay's whole height. Nothing is placed in a stair column and
 * nothing is more than one block tall, so no column of a bay is ever solid from
 * floor to ceiling — which is `interior.blocked_column` asked and answered at
 * the geometry rather than patched afterwards.
 */
function fitBay(r: BayFitRequest): number {
  const { put, style, bay, iz0, iz1, storey } = r;
  const counter = style["stone.slab"] as string;
  let n = 0;

  const shopX = bay.x1;
  if (shopX <= bay.x0) return 0;

  // The counter: half-blocks along the shop's far wall, back from the door so a
  // customer walks the length of the shop to reach it. A top slab is a step
  // rather than an obstacle, so the lane past it stays open.
  for (let z = iz0 + 1; z <= Math.min(iz0 + 3, iz1 - 1); z++) {
    if (r.stairColumns.has(`${shopX},${z}`)) continue;
    put(shopX, 1, z, counter, { type: "top" });
    n++;
  }

  const use = terraceBayUse(bay.archetype);
  for (let f = 1; f < bay.floors; f++) {
    const level = f * storey;
    if (use === "residential") {
      // A bed per upper storey, head to the rear wall, clear of the well.
      const beds = ["red_bed", "white_bed", "light_gray_bed", "blue_bed"] as const;
      const block = beds[positionInt(r.choice, shopX, level, iz0, 0, beds.length - 1)] as string;
      const footZ = iz0 + 1;
      if (footZ <= iz1) {
        put(shopX, level + 1, iz0, block, { facing: "north", part: "head", occupied: "false" });
        put(shopX, level + 1, footZ, block, { facing: "north", part: "foot", occupied: "false" });
        n += 2;
      }
    } else if (use === "office") {
      for (let z = iz0 + 1; z <= iz1 - 1; z += 3) {
        put(shopX, level + 1, z, counter, { type: "top" });
        n++;
      }
    } else {
      // Retail storage: shelves along the far wall, one course, never a stack.
      for (let z = iz0; z <= iz1; z += 4) {
        put(shopX, level + 1, z, "bookshelf");
        n++;
      }
    }
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* local helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Canonical op order: y, then z, then x — the same order `core.ts` uses. */
function sortOpsLocal(ops: LocalVoxelOp[]): LocalVoxelOp[] {
  return ops.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}

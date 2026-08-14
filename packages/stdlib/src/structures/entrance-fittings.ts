/**
 * Entrance fittings — the catalog's **family D**, realised as a param on the
 * host building rather than as an entry of its own.
 *
 * `docs/INFRA-ENTRIES-v0.md` §2 classifies sixty-eight catalog rows by the
 * mechanism each needs, and family D is the nine that are *a fitting in
 * something else*: an opening dressed in a wall somebody else built, a chamber
 * hung on a door somebody else placed. The doctrine that file states, and this
 * one obeys, is that **a family-D row is never a node**:
 *
 * > `city_gate` is `infra.wall@0`'s found opening, dressed — a `city_gate`
 * > node would be an author placing a gate on a course they cannot see.
 *
 * The same argument holds one level down. A blast door is not a thing you put
 * somewhere; it is *what the way in is made of*, and the way in is a column
 * `layout/ports.ts` resolved and the doorstep pass already graded. So the
 * authoring surface for both fittings here is one param on the building that
 * owns the door:
 *
 * ```json
 * { "generator": "building.grammar@0", "tags": ["bunker_complex"],
 *   "params": { "entrance": { "treatment": "blast_door" } } }
 * ```
 *
 * ## What this file may not do
 *
 * **It digs nothing.** `docs/GROUND-CONTRACT-v0.md` §3.11's doorstep pass
 * already cuts a landing at the door and ramps the approach to it; a second
 * digger with its own idea of where the ground is would be two passes arguing
 * over one column. The cut and the ramp in `blast_door`'s catalog sentence are
 * *that* pass's, and this file's job is the face that stands in the cut.
 *
 * **It leaves the envelope only into the apron**, the one-block skirt every
 * exterior flourish in this codebase already uses, and it obeys the apron's two
 * standing rules: an apron column is **grounded** (`y = 0` filled where the
 * shell left air, the `apronPost` lesson from `archetypes-science.ts`), and the
 * **doorstep cell stays standable and enterable** — nothing is written at
 * `y = 1` or `y = 2` in the cell a player opens the door from, ever.
 *
 * ## The house rules it is held to
 *
 * - **both door planes traverse.** Every leaf is a full two-half door over a
 *   solid `y = 0` block (`unsupported.door`, `door.half_mismatch`), and the
 *   iron leaves carry a lever on each side, because an iron door with no
 *   redstone is a wall that looks like a door;
 * - **glowstone, never a lantern.** The porch light is the lintel itself — a
 *   full cube in the frame, so there is nothing to hang and nothing to support;
 * - **no `chain`**, and no floating cube: every block written here touches the
 *   wall it dresses, the jamb beside it or the ground under it
 *   (`floating.isolated`);
 * - **nothing that falls.** Concrete and copper, no sand and no gravel, so a
 *   floor course is a floor course after the first block update.
 */

import type { Cardinal } from "./core.js";
import { PropCounter, isPassable, type FitOutContext } from "./archetypes-civic.js";

/* -------------------------------------------------------------------------- */
/* the vocabulary                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The entrance treatments an author may ask for, by catalog id.
 *
 * A closed vocabulary, and deliberately keyed on the **catalog id** of the
 * thing it builds: the catalog says `blast_door` is implemented, and the way an
 * author reaches it is to write that exact word here.
 */
export const ENTRANCE_TREATMENTS = ["blast_door", "airlock_vestibule"] as const;

/** One of {@link ENTRANCE_TREATMENTS}. */
export type EntranceTreatment = (typeof ENTRANCE_TREATMENTS)[number];

/** True for a treatment this file builds. */
export function isEntranceTreatment(value: string): value is EntranceTreatment {
  return (ENTRANCE_TREATMENTS as readonly string[]).includes(value);
}

/**
 * The hosts each treatment was designed for — advice, not a gate.
 *
 * The grammar never fails a document, and it never silently drops one either:
 * a treatment an author wrote is built on whatever building carries it, because
 * a param that does nothing on the building it was written on is the worst of
 * the three outcomes. These lists are what the kit documents and what the
 * prepass asks for, and they are exported so a test can assert the hosts named
 * in the catalog note are the hosts that actually wear the fitting.
 */
export const ENTRANCE_TREATMENT_HOSTS: Readonly<Record<EntranceTreatment, readonly string[]>> =
  Object.freeze({
    // The way into a hillside. Every one of these is a building whose subject is
    // what is underneath it, and all four already dig (`bunker_complex` and
    // `underground_silo` default themselves a cellar in `underground.ts`).
    blast_door: Object.freeze(["bunker_complex", "underground_silo", "bunker", "pillbox"]),
    // The double-door chamber, on the buildings that would have one: a bay you
    // keep clean, a lab, a field station, and the hideout's front room.
    airlock_vestibule: Object.freeze([
      "hydroponics_bay",
      "laboratory",
      "field_station",
      "bunker_complex",
    ]),
  });

/* -------------------------------------------------------------------------- */
/* the block table                                                             */
/* -------------------------------------------------------------------------- */

/** The concrete surround. */
const SURROUND = "gray_concrete";
/** The vestibule's lighter concrete, so the porch reads as an addition. */
const VESTIBULE = "light_gray_concrete";
/** The hydraulic frame — iron, because a blast door's frame is machinery. */
const HYDRAULIC = "iron_block";
/** The warning band, alternating. */
const BAND = ["yellow_concrete", "black_concrete"] as const;
/** The light. A full cube in the frame: nothing hangs, nothing needs support. */
const LAMP = "glowstone";
/** The sill course under a door plane — flush, worked, and it does not fall. */
const SILL = "cut_copper";
/** The leaf. */
const LEAF = "iron_door";

/** The band colour at an index along the run. */
function bandAt(i: number): string {
  return BAND[(((i % 2) + 2) % 2) as 0 | 1];
}

/* -------------------------------------------------------------------------- */
/* geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** The step of a cardinal, as `[dx, dz]`. */
function step(facing: Cardinal): readonly [number, number] {
  switch (facing) {
    case "north":
      return [0, -1];
    case "south":
      return [0, 1];
    case "east":
      return [1, 0];
    default:
      return [-1, 0];
  }
}

/** The cardinal a `[dx, dz]` step points along. */
function cardinalOf(dx: number, dz: number): Cardinal {
  if (dx > 0) return "east";
  if (dx < 0) return "west";
  return dz > 0 ? "south" : "north";
}

/** The cardinal facing the other way. */
function opposite(facing: Cardinal): Cardinal {
  switch (facing) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    default:
      return "east";
  }
}

/** Everything both treatments measure off the door, or `null` when there is none. */
interface DoorFrame {
  readonly x: number;
  readonly z: number;
  readonly face: Cardinal;
  /** Outward, away from the building. */
  readonly out: readonly [number, number];
  /** Inward, into the room. */
  readonly into: readonly [number, number];
  /** Along the wall the door stands in. */
  readonly along: readonly [number, number];
  readonly sx: number;
  readonly sz: number;
}

function frameOf(ctx: FitOutContext): DoorFrame | null {
  const door = ctx.door;
  if (door === null) return null;
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  // A door on an x face stands in a wall that runs along z, and the other way
  // round. The shell resolved the port to this exact column, so the face it
  // carries and the column it stands in always agree.
  const alongZ = door.x === 0 || door.x === sx - 1;
  const [ox, oz] = step(door.face);
  return {
    x: door.x,
    z: door.z,
    face: door.face,
    out: [ox, oz],
    into: [-ox, -oz],
    along: alongZ ? [0, 1] : [1, 0],
    sx,
    sz,
  };
}

/** Is this cell one of the footprint's ring cells that is not a corner? */
function wallCell(f: DoorFrame, x: number, z: number): boolean {
  if (x < 0 || x >= f.sx || z < 0 || z >= f.sz) return false;
  const corner = (x === 0 || x === f.sx - 1) && (z === 0 || z === f.sz - 1);
  return !corner;
}

/** Is this cell inside the interior rect? */
function inside(ctx: FitOutContext, x: number, z: number): boolean {
  const it = ctx.interior;
  return x >= it.x0 && x <= it.x1 && z >= it.z0 && z <= it.z1;
}

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Build whatever `params.entrance.treatment` asked for. `0` when it asked for
 * nothing, when the value is not a treatment, or when the building has no door
 * to fit anything to.
 *
 * Runs **after** every archetype fit-out, for the reason the roof flourishes
 * run late: it writes over the shell's own entrance — the wooden leaf, the
 * frame posts, the awning slab — and the last write to a cell wins.
 */
export function fitEntranceTreatment(ctx: FitOutContext): number {
  const asked = ctx.entranceTreatment;
  if (asked === undefined || !isEntranceTreatment(asked)) return 0;
  const f = frameOf(ctx);
  if (f === null) return 0;
  // Below three courses there is no room for a two-high leaf and a head over
  // it, and a fitting that drew itself anyway would be a hole in the wall.
  if (ctx.wallTop < 3) return 0;
  const c = new PropCounter(ctx);
  if (asked === "blast_door") fitBlastDoor(ctx, c, f);
  else fitAirlockVestibule(ctx, c, f);
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* blast_door                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `blast_door` — the way into a hillside, dressed on the face the shell built.
 *
 * Everything here is written **in the wall plane**: a concrete surround round
 * the opening, an iron hydraulic frame either side of it, a pair of iron leaves
 * in the opening, and a warning band across the head with a glowstone at each
 * end of it. Nothing is written in the apron and nothing touches the ground,
 * because the cut and the ramp the catalog sentence describes are the doorstep
 * pass's work (GROUND-CONTRACT §3.11) and this fitting is the face standing in
 * the cut.
 *
 * The leaves are `iron_door`, and each side carries a **lever** on the frame:
 * the physics lint walks a door as passable whatever it is made of, but a
 * player at a hand-shut iron door is a player standing outside a building the
 * walk said they were inside.
 */
function fitBlastDoor(ctx: FitOutContext, c: PropCounter, f: DoorFrame): void {
  const [ax, az] = f.along;
  const [ox, oz] = f.out;
  const headY = 3;

  /**
   * The opening: the shell's leaf, plus a second one along the wall when the
   * wall has room for it. A blast door is a *pair* — one leaf reads as a back
   * door — but a second leaf in a corner cell would be a door with no room
   * behind it, so the wall is asked first.
   */
  const leaves: { x: number; z: number; hinge: "left" | "right" }[] = [
    { x: f.x, z: f.z, hinge: "left" },
  ];
  for (const side of [1, -1] as const) {
    const nx = f.x + ax * side;
    const nz = f.z + az * side;
    if (!wallCell(f, nx, nz)) continue;
    // The cell behind it has to be room, or the leaf opens into the wall ring.
    if (!inside(ctx, nx - ox, nz - oz)) continue;
    leaves.push({ x: nx, z: nz, hinge: side === 1 ? "right" : "left" });
    break;
  }
  for (const leaf of leaves) {
    // A door stands on the block below it (`unsupported.door`); the shell's
    // foundation course is that block, and it is filled here only if the shell
    // left the cell empty.
    if (ctx.blockAt(leaf.x, 0, leaf.z) === undefined) c.raw(leaf.x, 0, leaf.z, SURROUND);
    for (const half of ["lower", "upper"] as const) {
      c.raw(leaf.x, half === "lower" ? 1 : 2, leaf.z, LEAF, {
        facing: f.face,
        half,
        hinge: leaf.hinge,
        open: "false",
        powered: "false",
      });
    }
  }

  /** The run the surround spans: the leaves, plus one jamb cell either side. */
  const ordered = [...leaves].sort((p, q) => p.x - q.x || p.z - q.z);
  const first = ordered[0] as { x: number; z: number };
  const last = ordered[ordered.length - 1] as { x: number; z: number };
  const jambs = [
    { x: first.x - ax, z: first.z - az },
    { x: last.x + ax, z: last.z + az },
  ].filter((j) => j.x >= 0 && j.x < f.sx && j.z >= 0 && j.z < f.sz);

  // The hydraulic frame: iron either side of the opening, full height of it.
  for (const j of jambs) {
    for (let y = 1; y <= 2; y++) c.raw(j.x, y, j.z, HYDRAULIC);
  }

  // The warning band across the head, jamb to jamb, with a lamp at each end.
  // It replaces the shell's lintel course, which is exactly the course a band
  // belongs in: over the opening and under the wall.
  const runStart = { x: first.x - ax, z: first.z - az };
  const runEnd = { x: last.x + ax, z: last.z + az };
  const span = Math.abs(runEnd.x - runStart.x) + Math.abs(runEnd.z - runStart.z);
  for (let i = 0; i <= span; i++) {
    const bx = runStart.x + ax * i;
    const bz = runStart.z + az * i;
    if (bx < 0 || bx >= f.sx || bz < 0 || bz >= f.sz) continue;
    c.raw(bx, headY, bz, i === 0 || i === span ? LAMP : bandAt(i));
  }

  // The surround: one concrete course over the band, where the wall has one.
  if (headY + 1 <= ctx.wallTop) {
    for (let i = 0; i <= span; i++) {
      const bx = runStart.x + ax * i;
      const bz = runStart.z + az * i;
      if (bx < 0 || bx >= f.sx || bz < 0 || bz >= f.sz) continue;
      c.raw(bx, headY + 1, bz, SURROUND);
    }
  }

  // The levers, one per side, on the frame the door hangs in. Outside they sit
  // in the apron beside the doorstep — never in it — and inside they sit in the
  // room beside the way in.
  for (const j of jambs) {
    const outX = j.x + ox;
    const outZ = j.z + oz;
    c.raw(outX, 2, outZ, "lever", {
      face: "wall",
      facing: f.face,
      powered: "false",
    });
    const inX = j.x - ox;
    const inZ = j.z - oz;
    if (!inside(ctx, inX, inZ)) continue;
    c.raw(inX, 2, inZ, "lever", {
      face: "wall",
      facing: opposite(f.face),
      powered: "false",
    });
  }
}

/* -------------------------------------------------------------------------- */
/* airlock_vestibule                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `airlock_vestibule` — a double-door chamber at the way in.
 *
 * **Where the chamber is, and why.** The catalog sentence says "projecting from
 * a wall", and a chamber whose *far* plane carried the outer door would put the
 * cell a player stands in to open it one block beyond the apron — outside the
 * envelope the solver reserved, which is the one line no exterior flourish in
 * this codebase crosses. So the chamber is the cell **straight inside the
 * door** — the one cell `furnish`'s `free` already reserves and no fit-out may
 * ever build in — sealed by a partition with a second, iron plane in it; and
 * what projects into the apron is the vestibule's own porch: two grounded
 * concrete jambs either side of the doorstep, a glowstone lintel spanning them,
 * and the warning band round the head. Two door planes, a chamber between them,
 * a box standing proud of the wall, and every block inside the envelope.
 *
 * The doorstep cell itself gets nothing at `y = 1` or `y = 2`: it stays
 * standable and enterable, which is what the physics walk starts from.
 */
function fitAirlockVestibule(ctx: FitOutContext, c: PropCounter, f: DoorFrame): void {
  const [ax, az] = f.along;
  const [ox, oz] = f.out;
  const [ix, iz] = f.into;
  const headY = 3;

  // The chamber cell, the inner plane, and the two cells the partition takes.
  const chamber = { x: f.x + ix, z: f.z + iz };
  const inner = { x: chamber.x + ix, z: chamber.z + iz };
  const sides = [
    { x: chamber.x - ax, z: chamber.z - az },
    { x: chamber.x + ax, z: chamber.z + az },
  ];
  // Every piece has to fit, or none of them is drawn: half an airlock is a
  // doorway with a wall beside it.
  if (!inside(ctx, chamber.x, chamber.z) || !inside(ctx, inner.x, inner.z)) return;
  if (!sides.every((s) => inside(ctx, s.x, s.z))) return;
  // The walkability guard owns the floor. A partition that would strand part of
  // the room is refused here rather than drawn and regretted later.
  //
  // The one case where a refusal is *not* the answer is a cell the archetype's
  // own fit-out already filled with something solid: this pass runs last, the
  // free-cell set already counts that cell as taken, and swapping a bunker's
  // crate for the vestibule's wall leaves the room exactly as connected as it
  // was. A *passable* prop — a carpet, a torch — is a different thing, because
  // the guard still counts its cell as floor, so those go through `take`.
  const claimed: { x: number; z: number }[] = [];
  for (const s of sides) {
    const standing = ctx.blockAt(s.x, 1, s.z);
    if (standing !== undefined && !isPassable(standing.block)) {
      claimed.push(s);
      continue;
    }
    if (!ctx.free(s.x, s.z) || !ctx.take([[s.x, s.z]], VESTIBULE)) break;
    claimed.push(s);
  }
  if (claimed.length !== sides.length) return;

  // The sill course: the door plane, the chamber and the inner plane, worked in
  // copper and flush with the floor, so it is a step *through* rather than over.
  for (const cell of [{ x: f.x, z: f.z }, chamber, inner]) {
    c.raw(cell.x, 0, cell.z, SILL);
  }

  // The chamber's walls, floor to head.
  const wallTopY = Math.min(headY, Math.max(2, ctx.storyHeight - 1));
  for (const s of sides) {
    for (let y = 1; y <= wallTopY; y++) c.raw(s.x, y, s.z, VESTIBULE);
  }
  // Its ceiling, carried by those two walls on either side.
  if (headY <= ctx.wallTop) c.raw(chamber.x, headY, chamber.z, VESTIBULE);

  // The inner plane: the second door, iron, hung the other way round so the
  // pair reads as an airlock rather than as two front doors.
  for (const half of ["lower", "upper"] as const) {
    c.raw(inner.x, half === "lower" ? 1 : 2, inner.z, LEAF, {
      facing: f.face,
      half,
      hinge: "right",
      open: "false",
      powered: "false",
    });
  }
  // A lever each side of the iron plane, both on the partition wall: one in the
  // chamber, one in the room. Without them the inner plane never opens.
  const support = sides[0] as { x: number; z: number };
  const alongCardinal = cardinalOf(ax, az);
  c.raw(chamber.x, 2, chamber.z, "lever", {
    face: "wall",
    facing: alongCardinal,
    powered: "false",
  });
  const roomSide = { x: support.x + ix, z: support.z + iz };
  if (inside(ctx, roomSide.x, roomSide.z)) {
    c.raw(roomSide.x, 2, roomSide.z, "lever", {
      face: "wall",
      facing: alongCardinal,
      powered: "false",
    });
  }

  // The porch: two grounded jambs in the apron either side of the doorstep, a
  // glowstone lintel spanning them over it, and the band round the head. The
  // doorstep cell between them is left empty at every course a body occupies.
  const stepCell = { x: f.x + ox, z: f.z + oz };
  const posts = [
    { x: stepCell.x - ax, z: stepCell.z - az },
    { x: stepCell.x + ax, z: stepCell.z + az },
  ];
  for (const p of posts) {
    // The apron-post rule: an apron cell may have nothing under it, and a post
    // that starts at `y = 1` there is a column standing on air.
    if (ctx.blockAt(p.x, 0, p.z) === undefined) c.raw(p.x, 0, p.z, VESTIBULE);
    for (let y = 1; y <= 2; y++) c.raw(p.x, y, p.z, VESTIBULE);
    c.raw(p.x, headY, p.z, bandAt(p.x + p.z));
  }
  // The lintel *is* the light: a full cube between two posts, so there is
  // nothing hanging and nothing to hang it from.
  c.raw(stepCell.x, headY, stepCell.z, LAMP);
  // The band carries on round the head, onto the wall either side of the door.
  for (const side of [-1, 1] as const) {
    const bx = f.x + ax * side;
    const bz = f.z + az * side;
    if (bx < 0 || bx >= f.sx || bz < 0 || bz >= f.sz) continue;
    c.raw(bx, headY, bz, bandAt(bx + bz));
  }
}

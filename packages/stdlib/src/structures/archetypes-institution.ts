/**
 * Archetype breadth, **wave three A** — the institutions.
 *
 * `archetypes.ts` owns the first six archetypes and the tag table;
 * `archetypes-civic.ts` owns the seven civic/rural ones, the walkability guard
 * and the exterior flourishes; `archetypes-blitz.ts` states the design law
 * this file obeys; `archetypes-wave2.ts` is the template it was written from.
 * This file adds the twelve buildings a town gets once it has institutions:
 * ten civic — a museum, a guildhall, a prison, a police station, a fire
 * station, a hospital, a workhouse, an orphanage, a mint and a customs house —
 * and two commercial ones, a bank and a counting house.
 *
 * ## An archetype is a fit-out, not a second grammar
 *
 * Read the header of `archetypes-blitz.ts` in full; it is the normative
 * statement. The short form: a fit-out runs **after** every shape stage and
 * writes into the same cell map, so it can trim a facade and dress a room
 * without a line of `core.ts` changing — and every invariant the shell already
 * guarantees still holds. A prison is the same shell as a cottage with a run
 * of iron bars down one wall; a bank is the same shell with a barred counter
 * and a strongroom corner. Neither is a new grammar.
 *
 * ## The floor rules this file was written against
 *
 * Every one of these came back from a walkthrough or from a physics-lint
 * failure, and each is a rule here rather than a comment:
 *
 * - a stair's `facing` is its **backrest**; a clerk at a ledger desk therefore
 *   carries the cardinal *away* from the desk they are reading;
 * - a bare `flower_pot` renders **empty**, so every pot comes from
 *   {@link pottedAt};
 * - the shell hangs a lantern over the middle column of the room at head
 *   height. No route here is one cell wide through it: the prison corridor is
 *   pushed off the centre, and no furniture row is laid on the centre z row;
 * - the trestle table is refused under a three-course storey, so
 *   {@link deskTop} switches to a top slab there;
 * - a body-blocking prop on a one-cell lane seals it. Every heavy thing here
 *   stands on a **wall row**, and the two side lanes and the door lane are
 *   left clear so a refused cell can never become a sealed pocket;
 * - signage is a **banner**. A sign block demands a block entity the op stream
 *   cannot carry.
 */

import type { Cardinal, LocalRect } from "./core.js";
import {
  PropCounter,
  ROOF_FLOURISH_RISE,
  type FitOutContext,
} from "./archetypes-civic.js";
import { pottedAt } from "./archetypes-wave2.js";

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The twelve archetypes this file fits out, in catalog order.
 *
 * Spread into `BUILDING_ARCHETYPES` by `archetypes.ts`: the ten civic ones
 * first, then the two commercial ones.
 */
export const INSTITUTION_BUILDING_ARCHETYPES = [
  "museum",
  "guildhall",
  "prison",
  "police_station",
  "fire_station",
  "hospital",
  "workhouse",
  "orphanage",
  "mint",
  "customs_house",
  "bank",
  "counting_house",
] as const;

/** One of the archetypes this file fits out. */
export type InstitutionBuildingArchetype =
  (typeof INSTITUTION_BUILDING_ARCHETYPES)[number];

/** True for an archetype this file answers to. */
export function isInstitutionArchetype(
  value: string,
): value is InstitutionBuildingArchetype {
  return (INSTITUTION_BUILDING_ARCHETYPES as readonly string[]).includes(value);
}

/**
 * Tag → archetype, or `null` when nothing matches.
 *
 * Consulted after the wave-two table and *before* the extended one. Every tag
 * below is one no earlier table claims, and the near misses are the point:
 *
 * - `hall` still belongs to the original table, where it means a great hall;
 *   the guildhall answers to `guildhall` and `guild` only;
 * - `court` is the **courthouse**'s and `archive` the **library**'s, so the
 *   museum takes `museum` and `gallery`;
 * - `clinic` is the **infirmary**'s. The hospital — a catalog id that had no
 *   generator until this wave — takes `hospital` and `ward`;
 * - `vault` is an underground cellar style with its own generator, so the bank
 *   takes `bank` and `strongroom` rather than the shorter word.
 */
export function institutionArchetypeOfTags(
  tags: readonly string[],
): InstitutionBuildingArchetype | null {
  const has = (t: string): boolean => tags.includes(t);
  if (has("museum") || has("gallery")) return "museum";
  if (has("guildhall") || has("guild")) return "guildhall";
  if (has("prison") || has("jail") || has("gaol")) return "prison";
  if (has("police_station") || has("police") || has("constabulary")) {
    return "police_station";
  }
  if (has("fire_station") || has("firehouse")) return "fire_station";
  if (has("hospital") || has("ward")) return "hospital";
  if (has("workhouse") || has("poorhouse")) return "workhouse";
  if (has("orphanage")) return "orphanage";
  if (has("mint") || has("coinage")) return "mint";
  if (has("customs_house") || has("customs")) return "customs_house";
  if (has("bank") || has("strongroom")) return "bank";
  if (has("counting_house") || has("countinghouse")) return "counting_house";
  return null;
}

/**
 * Facade tendencies for this file's archetypes.
 *
 * Same contract as `archetypeFacadeDefaults`: defaults a caller merges into
 * its params, never something applied over an explicit one. Institutions are
 * mostly tall-windowed and hipped, because that is what a public building
 * looks like; the three that are not — the prison, the mint and the fire
 * station — are not for reasons a player can read off the street.
 */
export function institutionFacadeDefaults(
  archetype: string,
): { readonly windowShape?: string; readonly windowRhythm?: string; readonly roof?: string } {
  switch (archetype) {
    case "museum":
      return { windowShape: "tall", windowRhythm: "regular", roof: "hip" };
    case "guildhall":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    // Barely any light, and a low hip: a gaol is not a facade.
    case "prison":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "police_station":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    // A wide gable to run an appliance under, and all the light there is.
    case "fire_station":
      return { windowShape: "mullion", windowRhythm: "dense", roof: "gable" };
    case "hospital":
      return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
    case "workhouse":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    case "orphanage":
      return { windowShape: "single", windowRhythm: "regular", roof: "gable" };
    // Strongroom logic: as blind as the grammar will allow.
    case "mint":
      return { windowShape: "single", windowRhythm: "sparse", roof: "hip" };
    case "customs_house":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "hip" };
    case "bank":
      return { windowShape: "tall", windowRhythm: "sparse", roof: "hip" };
    case "counting_house":
      return { windowShape: "mullion", windowRhythm: "regular", roof: "gable" };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/* shared primitives                                                           */
/* -------------------------------------------------------------------------- */

/** The middle column of the room — where the shell hangs its lantern. */
function lanternColumn(it: LocalRect): { readonly x: number; readonly z: number } {
  return { x: Math.floor((it.x0 + it.x1) / 2), z: Math.floor((it.z0 + it.z1) / 2) };
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

/**
 * The end of the room furthest from the door.
 *
 * Returns the z of that end and the cardinal a person in the room faces to
 * look at it — the counter, the bench, the top table.
 */
function farEnd(ctx: FitOutContext): { readonly z: number; readonly look: Cardinal } {
  const it = ctx.interior;
  const north = ctx.door === null ? true : ctx.door.z > (it.z0 + it.z1) / 2;
  return north ? { z: it.z0, look: "north" } : { z: it.z1, look: "south" };
}

/** The near end — the door's own end of the room. */
function nearEndZ(ctx: FitOutContext): number {
  const it = ctx.interior;
  return farEnd(ctx).look === "north" ? it.z1 : it.z0;
}

/**
 * One desk or table cell, by the idiom the storey has headroom for.
 *
 * The trestle idiom — a fence stem with a pressure plate on it — is two blocks
 * in one column, and under a three-course storey the second is refused by the
 * stack guard, leaving a bare fence post that reads as a bollard. A top slab
 * is one block at table height and is the idiom the earlier waves settled on.
 */
function deskTop(ctx: FitOutContext, c: PropCounter, x: number, z: number): boolean {
  if (ctx.storyHeight < 4) {
    return c.put1(x, z, ctx.style["stone.slab"] as string, {
      type: "top",
      waterlogged: "false",
    });
  }
  if (!c.put1(x, z, ctx.style["wall.fence"] as string)) return false;
  c.stack(x, z, 2, "oak_pressure_plate", { powered: "false" });
  return true;
}

/**
 * A run up one side wall, every `stride` cells.
 *
 * Wall rows only. A free cell left between two occupied ones still has the
 * open floor beside it, so no gap this leaves can become a pocket.
 */
function wallRun(
  c: PropCounter,
  it: LocalRect,
  x: number,
  stride: number,
  place: (z: number) => void,
): void {
  for (let z = it.z0; z <= it.z1; z++) {
    if ((z - it.z0) % stride !== 0) continue;
    place(z);
  }
}

/**
 * A furniture row across the middle of the room, **inset two cells each side**.
 *
 * The two-cell inset is the rule that keeps every one of these buildings one
 * region: whatever the row does, a lane survives up each side wall, so the row
 * can never cut the floor in two and a cell it refuses can never be sealed.
 * Rows are also kept off the centre z row, where the lantern hangs.
 */
function midRow(ctx: FitOutContext, z: number, place: (x: number) => void): void {
  const it = ctx.interior;
  if (z < it.z0 || z > it.z1) return;
  if (z === lanternColumn(it).z) return;
  if (it.x1 - it.x0 < 5) return;
  for (let x = it.x0 + 2; x <= it.x1 - 2; x++) place(x);
}

/** A banner on a wall cell, turned to face into the room. */
function bannerAt(c: PropCounter, x: number, z: number, rotation: string, block = "white_banner"): boolean {
  return c.put1(x, z, block, { rotation });
}

/**
 * A slab cornice in the apron at the plate line.
 *
 * The cheapest way to make a box look public, and it lives in the one-block
 * ring the eave already occupies, so the envelope is unchanged. Refused
 * outright on anything but a plain rect, for the reason the earlier waves
 * give: an L has a reflex corner this ring has no rule for.
 */
function cornice(ctx: FitOutContext, c: PropCounter): void {
  const sx = ctx.size[0];
  const sz = ctx.size[2];
  const it = ctx.interior;
  if (it.x0 !== 1 || it.z0 !== 1 || it.x1 !== sx - 2 || it.z1 !== sz - 2) return;
  if (ctx.wallTop > ctx.roofTop + ROOF_FLOURISH_RISE) return;
  const slab = ctx.style["stone.slab"] as string;
  for (let x = -1; x <= sx; x++) {
    for (let z = -1; z <= sz; z++) {
      const outside = x === -1 || x === sx || z === -1 || z === sz;
      if (!outside) continue;
      ctx.put(x, ctx.wallTop, z, slab, { type: "top", waterlogged: "false" });
      c.n++;
    }
  }
}

/**
 * An iron-trimmed strongroom, three cells up a side wall from the far end.
 *
 * Tried on one side wall and then the other, because the side it *wants* can
 * already be spoken for: the ground floor reserves the inter-storey stair's
 * columns and the cells that reach them, and on a two-storey plan that reserve
 * lands exactly where a corner strongroom would go. Returns whether any of it
 * landed, so a caller can tell a refusal from a placement.
 */
function strongroom(ctx: FitOutContext, c: PropCounter, chestFacing: Cardinal): boolean {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const step = end.look === "north" ? 1 : -1;
  for (const x of [chestFacing === "east" ? it.x0 : it.x1, chestFacing === "east" ? it.x1 : it.x0]) {
    let placed = 0;
    for (let k = 0; k <= 2; k++) {
      const z = end.z + step * k;
      if (z < it.z0 || z > it.z1) break;
      const ok =
        k === 1
          ? c.put1(x, z, "chest", { facing: x === it.x0 ? "east" : "west", type: "single" })
          : c.put1(x, z, "iron_block");
      if (ok) placed++;
    }
    if (placed > 0) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* the entry point                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fit out one of this file's archetypes.
 *
 * Returns the number of blocks written, which `furnish` adds to its own count.
 * Zero, and not one cell touched, for anything that is not ours.
 */
export function furnishInstitution(ctx: FitOutContext): number {
  if (!isInstitutionArchetype(ctx.archetype)) return 0;
  const c = new PropCounter(ctx);
  switch (ctx.archetype) {
    case "museum":
      fitMuseum(ctx, c);
      break;
    case "guildhall":
      fitGuildhall(ctx, c);
      break;
    case "prison":
      fitPrison(ctx, c);
      break;
    case "police_station":
      fitPoliceStation(ctx, c);
      break;
    case "fire_station":
      fitFireStation(ctx, c);
      break;
    case "hospital":
      fitHospital(ctx, c);
      break;
    case "workhouse":
      fitWorkhouse(ctx, c);
      break;
    case "orphanage":
      fitOrphanage(ctx, c);
      break;
    case "mint":
      fitMint(ctx, c);
      break;
    case "customs_house":
      fitCustomsHouse(ctx, c);
      break;
    case "bank":
      fitBank(ctx, c);
      break;
    case "counting_house":
    default:
      fitCountingHouse(ctx, c);
      break;
  }
  return c.n;
}

/* -------------------------------------------------------------------------- */
/* civic                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `museum` — plinths under glass, roped rails and a hung gallery wall.
 *
 * The exhibits are **plinths**: a course of chiseled stone on the wall rows
 * with the object on top of it — an amethyst block, a piece of coral or a
 * gilded block, chosen from position so two plinths in a room are never the
 * same exhibit. In front of them, the **rope**: fences on the wall row between
 * plinths, which is what a museum uses instead of a wall. The far wall is the
 * gallery wall, hung with banners.
 */
function fitMuseum(ctx: FitOutContext, c: PropCounter): void {
  cornice(ctx, c);
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const exhibits = ["amethyst_block", "gold_block", "bone_block", "prismarine_bricks"];

  // The plinths: up both side walls, with a rope between them.
  for (const x of [it.x0, it.x1]) {
    wallRun(c, it, x, 2, (z) => {
      if (z === end.z) return;
      const kind = exhibits[(((x * 3 + z) % exhibits.length) + exhibits.length) % exhibits.length] as string;
      if (!c.put1(x, z, "chiseled_stone_bricks")) return;
      c.stack(x, z, 2, kind);
    });
    wallRun(c, it, x, 2, (z) => {
      if (z + 1 > it.z1 || z + 1 === end.z) return;
      c.put1(x, z + 1, ctx.style["wall.fence"] as string);
    });
  }

  // The gallery wall: banners along the far wall, and the accession desk under
  // the middle of it.
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (x === lamp.x) continue;
    if ((x - it.x0) % 2 !== 0) continue;
    bannerAt(c, x, end.z, end.look === "north" ? "8" : "0");
  }
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  const near = nearEndZ(ctx);
  c.put1(it.x0, near, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, near, pottedAt(it.x1, near));
}

/**
 * `guildhall` — a long hall, the guild's banners and a top table.
 *
 * The top table stands across the far end, a **lectern** at the middle of it
 * for the warden's book; the guild's colours hang either side. Down the hall,
 * benches face the top table — and therefore carry the **opposite** cardinal,
 * because a stair's `facing` is its backrest.
 */
function fitGuildhall(ctx: FitOutContext, c: PropCounter): void {
  cornice(ctx, c);
  const it = ctx.interior;
  const end = farEnd(ctx);
  const lamp = lanternColumn(it);
  const backrest = opposite(end.look);
  const step = end.look === "north" ? 1 : -1;

  // The top table, on the far wall row.
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (x === lamp.x) continue;
    deskTop(ctx, c, x, end.z);
  }
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  c.put1(it.x0, end.z, "chest", { facing: end.look === "north" ? "south" : "north", type: "single" });
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });

  // The colours: banners up both side walls.
  for (const x of [it.x0, it.x1]) {
    wallRun(c, it, x, 3, (z) => {
      if (z === end.z) return;
      bannerAt(c, x, z, x === it.x0 ? "4" : "12", "yellow_banner");
    });
  }

  // The benches: two ranks down the hall, inset two cells each side so the
  // side lanes survive, and facing away from the table they look at.
  for (const k of [3, 5]) {
    midRow(ctx, end.z + step * k, (x) => {
      c.put1(x, end.z + step * k, ctx.style["stair.interior"] as string, {
        facing: backrest,
        half: "bottom",
        shape: "straight",
      });
    });
  }
}

/**
 * `prison` — barred cells down one side of an off-centre corridor.
 *
 * The cells are a run of **iron bars** on the west wall row with a bar door in
 * every third cell; the corridor is the floor east of them, which is where the
 * corridor has to be: a corridor down the middle of the room is a corridor
 * through the column the shell hangs its lantern in. The gaoler's end carries
 * a chest of irons and a barrel.
 */
function fitPrison(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);

  // The cell fronts. Bars stand on the wall row, so the free cells between
  // them open onto the corridor rather than onto each other.
  wallRun(c, it, it.x0, 1, (z) => {
    if (z === end.z || z === near) return;
    if ((z - it.z0) % 3 === 2) return; // the cell door: left open
    c.put1(it.x0, z, "iron_bars", {
      north: "true",
      south: "true",
      east: "false",
      west: "false",
      waterlogged: "false",
    });
  });
  // The heavy trim of the block, opposite the cells.
  wallRun(c, it, it.x1, 3, (z) => {
    if (z === end.z) return;
    c.put1(it.x1, z, "polished_andesite");
  });

  c.put1(it.x0, end.z, "chest", { facing: end.look === "north" ? "south" : "north", type: "single" });
  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, near, "cauldron", { level: "3" });
  bannerAt(c, it.x0, near, end.look === "north" ? "0" : "8", "black_banner");
}

/**
 * `police_station` — a front desk, one cell and a notice board.
 *
 * The desk is a **cartography table** and a lectern for the day book, on the
 * far wall row; one barred cell takes the far corner; the notices hang beside
 * the door where a person waiting can read them.
 */
function fitPoliceStation(ctx: FitOutContext, c: PropCounter): void {
  cornice(ctx, c);
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);
  const lamp = lanternColumn(it);

  c.put1(lamp.x, end.z, "cartography_table");
  if (lamp.x - 1 >= it.x0) {
    c.put1(lamp.x - 1, end.z, "lectern", {
      facing: end.look === "north" ? "south" : "north",
      has_book: "false",
      powered: "false",
    });
  }
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (x === lamp.x || x === lamp.x - 1) continue;
    deskTop(ctx, c, x, end.z);
  }

  // The one cell: two courses of bars in the far corner, on the wall rows.
  const cellStep = end.look === "north" ? 1 : -1;
  for (let k = 0; k <= 2; k++) {
    const z = end.z + cellStep * k;
    if (z < it.z0 || z > it.z1) break;
    c.put1(it.x1, z, "iron_bars", {
      north: "true",
      south: "true",
      east: "false",
      west: "false",
      waterlogged: "false",
    });
  }

  // The notices, and the waiting-room furniture.
  bannerAt(c, it.x0, near, end.look === "north" ? "0" : "8");
  c.put1(it.x0, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x1, near, pottedAt(it.x1, near));
}

/**
 * `fire_station` — the bell, the butts and the ladder racks.
 *
 * The **bell** hangs over the far wall row where the crew muster; the water
 * butts are cauldrons up one wall, spaced so nothing blocks a lane; and the
 * ladders are trapdoor racks at shoulder height on the other, which is the
 * only honest shelf the palette has. The middle of the floor is the appliance
 * bay and stays empty.
 */
function fitFireStation(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);
  const lamp = lanternColumn(it);
  const trapdoor = ctx.style["wall.trapdoor"] as string;

  // The bell: on the wall row at the far end, hung a course up where the
  // storey has the headroom for it.
  const facing: Cardinal = end.look === "north" ? "south" : "north";
  const bellX = lamp.x - 1 >= it.x0 ? lamp.x - 1 : lamp.x;
  if (!c.put1(bellX, end.z, "bell", { facing, attachment: "floor", powered: "false" })) {
    c.put1(it.x0, end.z, "bell", { facing, attachment: "floor", powered: "false" });
  }

  // The butts, up the west wall.
  wallRun(c, it, it.x0, 2, (z) => {
    if (z === end.z) return;
    c.put1(it.x0, z, "cauldron", { level: "3" });
  });
  // The ladder racks, up the east wall, hung clear of the floor.
  const rackY = Math.min(2, ctx.storyHeight - 1);
  wallRun(c, it, it.x1, 2, (z) => {
    if (z === end.z) return;
    c.stack(it.x1, z, rackY, trapdoor, {
      facing: "west",
      half: "top",
      open: "false",
      powered: "false",
      waterlogged: "false",
    });
  });

  c.put1(it.x1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, near, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
  bannerAt(c, it.x1, near, end.look === "north" ? "0" : "8", "red_banner");
}

/**
 * `hospital` — wards of cots, screens, and an apothecary station.
 *
 * Bigger than the infirmary and organised rather than improvised: cots go up
 * **both** side walls, head against the wall, in a ward at each end of the
 * room; banners screen one bay from the next; and the dispensary works the
 * middle of the far wall with a brewing stand and a cauldron.
 *
 * The second range is only laid when the room keeps **three** columns of floor
 * between the two ranges. Two ranges in a narrow room leave a single-cell
 * corridor through the column the lantern hangs in.
 */
function fitHospital(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);
  const lamp = lanternColumn(it);
  const width = it.x1 - it.x0 + 1;
  const ranges: readonly { readonly x: number; readonly facing: Cardinal }[] =
    width >= 7
      ? [
          { x: it.x0 + 1, facing: "west" },
          { x: it.x1 - 1, facing: "east" },
        ]
      : [{ x: it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, facing: "west" }];

  for (const range of ranges) {
    for (let z = it.z0; z <= it.z1; z += 2) {
      if (z === end.z) continue;
      ctx.placeBed(range.x, z, range.facing, "white_bed");
    }
    // The screens between the bays.
    for (let z = it.z0 + 1; z <= it.z1 - 1; z += 2) {
      const wallX = range.facing === "west" ? it.x0 : it.x1;
      bannerAt(c, wallX, z, range.facing === "west" ? "4" : "12", "light_gray_banner");
    }
  }

  // The dispensary, in the middle of the far wall — the corners are cot heads.
  c.put1(lamp.x, end.z, "brewing_stand", {
    has_bottle_0: "false",
    has_bottle_1: "false",
    has_bottle_2: "false",
  });
  if (lamp.x - 1 >= it.x0) c.put1(lamp.x - 1, end.z, "cauldron", { level: "3" });
  if (lamp.x + 1 <= it.x1) c.put1(lamp.x + 1, end.z, "barrel", { facing: "up", open: "false" });
  c.put1(it.x0, near, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
  c.put1(it.x1, near, pottedAt(it.x1, near));
}

/**
 * `workhouse` — benches of work, thin cots and the stores.
 *
 * Rows of **looms and crafting benches** up one wall, a range of meagre cots
 * up the other, and the stores at the far end. The character is repetition: a
 * workhouse is the same cell over and over, which is exactly what a strided
 * wall run draws.
 */
function fitWorkhouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);
  const lamp = lanternColumn(it);

  // The work: benches on the east wall row, alternating loom and bench.
  wallRun(c, it, it.x1, 2, (z) => {
    if (z === end.z) return;
    c.put1(it.x1, z, (z - it.z0) % 4 === 0 ? "loom" : "crafting_table");
  });
  // The cots: heads against the west wall.
  for (let z = it.z0; z <= it.z1; z += 3) {
    if (z === end.z) continue;
    ctx.placeBed(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, z, "west", "brown_bed");
  }

  // The stores and the overseer's desk at the far end.
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (x === lamp.x) continue;
    if ((x - it.x0) % 2 !== 0) continue;
    c.put1(x, end.z, "barrel", { facing: "up", open: "false" });
  }
  deskTop(ctx, c, lamp.x, end.z);
  c.put1(it.x1, near, "composter", { level: "0" });
  c.put1(it.x0, near, "cauldron", { level: "3" });
}

/**
 * `orphanage` — small beds, a hearth-side common room and toys.
 *
 * Beds are short and paired up one wall; the common room is the near end, with
 * a **hearth** — a furnace on the wall row, never a campfire on the floor —
 * and carpets where the children sit. The carpets are the one thing here in
 * the middle of the floor, and a carpet is not a body block.
 */
function fitOrphanage(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);
  const lamp = lanternColumn(it);
  const step = end.look === "north" ? 1 : -1;

  // The dormitory end: beds head-to-wall up both side walls.
  for (let z = it.z0; z <= it.z1; z += 2) {
    if (z === end.z) continue;
    ctx.placeBed(it.x0 + 1 <= it.x1 ? it.x0 + 1 : it.x0, z, "west", "red_bed");
  }
  // The hearth, on the far wall row, with the matron's chest beside it.
  c.put1(lamp.x, end.z, "furnace", {
    facing: end.look === "north" ? "south" : "north",
    lit: "false",
  });
  if (lamp.x + 1 <= it.x1) {
    c.put1(lamp.x + 1, end.z, "chest", {
      facing: end.look === "north" ? "south" : "north",
      type: "single",
    });
  }
  // The play mat. Inset **three** cells on the dormitory side rather than the
  // usual two: a cot takes the wall row *and* the row inside it, so a mat that
  // started at `x0 + 2` would close the gap between two cots into a pocket the
  // physics lint reports as an unreachable cell.
  const matZ = end.z + step * 3;
  if (matZ >= it.z0 && matZ <= it.z1 && matZ !== lamp.z && it.x1 - it.x0 >= 6) {
    for (let x = it.x0 + 3; x <= it.x1 - 2; x++) c.put1(x, matZ, "white_carpet");
  }

  wallRun(c, it, it.x1, 3, (z) => {
    if (z === end.z) return;
    c.put1(it.x1, z, "barrel", { facing: "up", open: "false" });
  });
  c.put1(it.x0, near, pottedAt(it.x0, near));
  c.put1(it.x1, near, pottedAt(it.x1, near));
}

/**
 * `mint` — a strongroom, the presses and the coin chests.
 *
 * The strongroom is the far corner, trimmed in **iron** on the wall rows with
 * chests of coin inside it; the presses are anvils and a smithing table down
 * one wall, which is what striking a coin looks like at this fidelity; and the
 * counter is the far wall row, so the public side of the floor stays open.
 */
function fitMint(ctx: FitOutContext, c: PropCounter): void {
  cornice(ctx, c);
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);
  const lamp = lanternColumn(it);

  // The strongroom trim, on the wall rows of a far corner — the west one when
  // the floor will give it up, the east one when the stair reserve will not.
  strongroom(ctx, c, "east");

  // The presses, up the east wall.
  wallRun(c, it, it.x1, 2, (z) => {
    if (z === end.z) return;
    c.put1(
      it.x1,
      z,
      (z - it.z0) % 4 === 0 ? "anvil" : "smithing_table",
      (z - it.z0) % 4 === 0 ? { facing: end.look === "north" ? "east" : "west" } : undefined,
    );
  });

  // The counter along the far wall, and the assay lectern in the middle of it.
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (x === lamp.x) continue;
    deskTop(ctx, c, x, end.z);
  }
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  c.put1(it.x0, near, "barrel", { facing: "up", open: "false" });
  bannerAt(c, it.x1, near, end.look === "north" ? "0" : "8", "yellow_banner");
}

/**
 * `customs_house` — the weighing hall, the ledger desks and the bonded store.
 *
 * Bonded goods are barrels up one wall behind a fence line; the weighing hall
 * is the open floor with a **chain hung from the ceiling plane** over it,
 * which is as close to a set of scales as the palette gets, and only on a
 * single-storey building where that plane is roof rather than somebody's
 * floor. The ledger desks work the far wall.
 */
function fitCustomsHouse(ctx: FitOutContext, c: PropCounter): void {
  cornice(ctx, c);
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);
  const lamp = lanternColumn(it);

  // The bonded store, up the west wall.
  wallRun(c, it, it.x0, 2, (z) => {
    if (z === end.z) return;
    if (!c.put1(it.x0, z, "barrel", { facing: "up", open: "false" })) return;
    c.stack(it.x0, z, 2, "barrel", { facing: "up", open: "false" });
  });
  // The tally line, up the east wall.
  wallRun(c, it, it.x1, 3, (z) => {
    if (z === end.z) return;
    c.put1(it.x1, z, ctx.style["wall.fence"] as string);
  });

  // The desks along the far wall, with the ledger in the middle of them.
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (x === lamp.x) continue;
    deskTop(ctx, c, x, end.z);
  }
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });

  // The scales: a chain under the plate, clear of the floor entirely. A
  // chain hangs from the block above it, and over the middle of a
  // single-storey hall the eave plate is not there — the gable's slope is —
  // so each link is placed only where something actually holds it up.
  const lineY = ctx.wallTop - 1;
  if (ctx.floors === 1 && lineY >= 3) {
    for (let x = it.x0 + 2; x <= it.x1 - 2; x += 2) {
      if (ctx.blockAt(x, lineY, lamp.z) !== undefined) continue;
      if (ctx.blockAt(x, lineY + 1, lamp.z) === undefined) continue;
      // Iron bars, not `chain`: the 1.21.11 block table has no chain entry,
      // so a chain op is dropped with a BAD_PALETTE warning and the scales
      // simply never appeared. Bars hang the same read.
      ctx.put(x, lineY, lamp.z, "iron_bars");
      c.n++;
    }
  }

  c.put1(it.x1, near, "chest", { facing: end.look === "north" ? "north" : "south", type: "single" });
  bannerAt(c, it.x0, near, end.look === "north" ? "0" : "8", "blue_banner");
}

/* -------------------------------------------------------------------------- */
/* commercial                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `bank` — a barred counter and a strongroom behind it.
 *
 * The counter runs the far wall with **iron bars over it**, which is the read
 * a banking hall lives or dies on; the teller's window is the one cell left
 * unbarred, in the middle. Behind the counter — on the wall rows of a corner —
 * the strongroom: iron trim and lockbox chests.
 */
function fitBank(ctx: FitOutContext, c: PropCounter): void {
  cornice(ctx, c);
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);
  const lamp = lanternColumn(it);

  // The counter, and the grille standing on it.
  for (let x = it.x0 + 1; x <= it.x1 - 1; x++) {
    if (!deskTop(ctx, c, x, end.z)) continue;
    if (x === lamp.x) continue; // the teller's window
    c.stack(x, end.z, 2, "iron_bars", {
      north: "false",
      south: "false",
      east: "true",
      west: "true",
      waterlogged: "false",
    });
  }

  // The strongroom, on the wall rows of a far corner, with the same fallback.
  strongroom(ctx, c, "west");
  c.put1(it.x0, end.z, "chest", { facing: end.look === "north" ? "south" : "north", type: "single" });

  // The hall side: a lockbox run up the west wall, and the waiting furniture.
  wallRun(c, it, it.x0, 3, (z) => {
    if (z === end.z || z === near) return;
    c.put1(it.x0, z, "barrel", { facing: "up", open: "false" });
  });
  bannerAt(c, it.x1, near, end.look === "north" ? "0" : "8", "green_banner");
  c.put1(it.x0, near, pottedAt(it.x0, near));
}

/**
 * `counting_house` — ranks of ledger desks and a strongbox corner.
 *
 * Two ranks of desks run across the room, each with a clerk's stool behind it.
 * The stool carries the cardinal **away** from its desk, because a stair's
 * `facing` is its backrest — a clerk turned "towards" the ledger is a clerk
 * with his back to it. Both ranks are inset two cells, so a lane survives up
 * each side wall whatever the desks do.
 */
function fitCountingHouse(ctx: FitOutContext, c: PropCounter): void {
  const it = ctx.interior;
  const end = farEnd(ctx);
  const near = nearEndZ(ctx);
  const lamp = lanternColumn(it);
  const step = end.look === "north" ? 1 : -1;
  const backrest = opposite(end.look);

  // The desk ranks: a desk row, and the stools one cell behind it.
  for (const k of [2, 4]) {
    const z = end.z + step * k;
    midRow(ctx, z, (x) => {
      deskTop(ctx, c, x, z);
    });
    const seatZ = z + step;
    midRow(ctx, seatZ, (x) => {
      c.put1(x, seatZ, ctx.style["stair.interior"] as string, {
        facing: backrest,
        half: "bottom",
        shape: "straight",
      });
    });
  }

  // The master's ledger on the far wall, and the strongbox corner.
  c.put1(lamp.x, end.z, "lectern", {
    facing: end.look === "north" ? "south" : "north",
    has_book: "false",
    powered: "false",
  });
  c.put1(it.x0, end.z, "chest", { facing: end.look === "north" ? "south" : "north", type: "single" });
  c.put1(it.x1, end.z, "iron_block");
  wallRun(c, it, it.x1, 3, (z) => {
    if (z === end.z) return;
    c.put1(it.x1, z, "bookshelf");
  });
  c.put1(it.x0, near, "barrel", { facing: "up", open: "false" });
  bannerAt(c, it.x0, lamp.z, "4", "brown_banner");
}

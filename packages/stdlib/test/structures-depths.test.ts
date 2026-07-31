/**
 * Wave six, the underground: eight new cellar styles, three depths archetypes.
 *
 * The cellar styles are held to the contract `packages/compiler/test/underground.ts`
 * set for the crypt — every one of them is built **under a real shell**, by
 * `generateBuilding`, rather than by calling the dressing pass on a synthetic
 * room, because the whole design of `dressCellar` is that it dresses a room
 * somebody else dug and the interesting failures are all at that seam:
 *
 * - the room stays **reachable from the ladder**: the ladder column and its two
 *   approach cells carry nothing, in every style;
 * - nothing floats: every block a style writes rests on the slab, on the block
 *   below it, or is a niche cut into the wall ring, which is masonry either way;
 * - **fluids are contained by construction.** The cistern's tank and the sewer's
 *   runnel are sunk into the floor slab, so beside every water cell at that
 *   level is the slab the cellar laid solid across the whole footprint, and
 *   beneath it is a course this pass writes itself. The test walks all six
 *   neighbours of every water cell and asserts exactly that.
 *
 * The archetypes are held to the standing wave contract — registration, tags
 * without theft, the envelope, determinism, no signs/chains/bare pots — plus
 * `assertNoPockets` on the **ground floor**, which is the storey the shared
 * detector models. The depths themselves are argued rather than walked: each
 * archetype's cellar is the ordinary cellar geometry with a dressing pass over
 * it, and the dressing pass is what the first half of this file tests.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  CELLAR_STYLES,
  DEPTHS_BUILDING_ARCHETYPES,
  STRUCTURE_CATALOG,
  archetypeOfTags,
  defaultBasementDepth,
  defaultCellarStyle,
  depthsArchetypeOfTags,
  depthsFacadeDefaults,
  generateBuilding,
  isDepthsArchetype,
  nodeSeed,
  resolveArchetype,
  resolveCellarStyle,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets } from "./helpers/walkability.js";

const S = nodeSeed(0xdeb7n, "world.depths");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** The eight rooms an author may ask for by name. */
const NEW_STYLES = [
  "ossuary",
  "undercroft",
  "dungeon_room",
  "root_cellar",
  "cistern_hall",
  "smugglers_cove",
  "hermit_grotto",
  "sewer_network",
] as const;

/** The three the depths archetypes dress themselves in. */
const ARCHETYPE_STYLES = ["bunker_hold", "subway_platform", "silo_shaft"] as const;

const DEPTH = 5;

/** Build a cottage with a cellar in `style`, and return the cellar's ops. */
function cellar(style: string, size: [number, number, number] = [11, 8, 11]): LocalVoxelOp[] {
  const built = generateBuilding({
    seed: S,
    size,
    params: { floors: 1, roof: "gable", basement: DEPTH, cellarStyle: style },
    style: PINNED,
  });
  return built.ops.filter((op) => op.y < 0);
}

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

const names = (ops: readonly LocalVoxelOp[]): Set<string> => new Set(ops.map((o) => o.block));

/* -------------------------------------------------------------------------- */
/* the styles                                                                  */
/* -------------------------------------------------------------------------- */

describe("wave six cellar styles", () => {
  const ALL = [...NEW_STYLES, ...ARCHETYPE_STYLES];

  it("registers every one of them, and refuses anything else", () => {
    for (const style of ALL) {
      expect(CELLAR_STYLES as readonly string[], style).toContain(style);
      expect(resolveCellarStyle(style), style).toBe(style);
    }
    expect(resolveCellarStyle("ossuarium")).toBe("plain");
    expect(new Set(CELLAR_STYLES).size).toBe(CELLAR_STYLES.length);
  });

  it("is claimed by the catalog as wave six, implemented — the eight named rooms", () => {
    for (const style of NEW_STYLES) {
      const entry = structureById(style);
      expect(entry, style).toBeDefined();
      expect(entry?.status, style).toBe("implemented");
      expect(entry?.wave, style).toBe(6);
      expect(entry?.category, style).toBe("underground");
      expect(entry?.note, style).toBeDefined();
    }
    // The three archetype dressings are NOT catalog entries of their own: the
    // archetype is the entry, and the style is how it dresses itself.
    for (const style of ARCHETYPE_STYLES) {
      expect(structureById(style), style).toBeUndefined();
    }
  });

  it("builds a room under a real shell, in every style", () => {
    for (const style of ALL) {
      const ops = cellar(style);
      expect(ops.length, style).toBeGreaterThan(100);
      // The shell is there: a floor slab under the room, and the ladder out.
      expect(ops.some((o) => o.block === "ladder"), style).toBe(true);
    }
  });

  it("draws the same room twice from the same seed, and a different one per style", () => {
    const seen = new Set<string>();
    for (const style of CELLAR_STYLES) {
      const a = JSON.stringify(cellar(style));
      expect(a, style).toBe(JSON.stringify(cellar(style)));
      seen.add(a);
    }
    expect(seen.size, "every style is its own room").toBe(CELLAR_STYLES.length);
  });

  it("leaves the ladder and its approach clear, in every style", () => {
    for (const style of ALL) {
      const ops = cellar(style);
      const ladders = ops.filter((o) => o.block === "ladder");
      expect(ladders.length, style).toBeGreaterThan(0);
      const at = ladders[0] as LocalVoxelOp;
      const floor = -DEPTH;
      for (const [dx, dz] of [
        [0, 0],
        [-1, 0],
        [0, -1],
      ] as const) {
        const cell = ops.filter(
          (o) => o.x === at.x + dx && o.z === at.z + dz && o.y === floor && o.block !== "ladder",
        );
        expect(
          cell.filter((o) => o.block !== "air").map((o) => o.block),
          `${style}: the way out at ${dx},${dz}`,
        ).toEqual([]);
      }
    }
  });

  /**
   * The reachability argument for the depths, and the one that has teeth.
   *
   * The shared walk detector models a *storey*: it starts at the door cell and
   * cannot be pointed at a cellar. What it would have caught if it could — and
   * what the compiler's own `traversal.unreachable` did catch, a hundred lines
   * of it, when the undercroft's springer course was written into the ladder's
   * column — is a block in the **shaft**. The ladder runs from the walk plane
   * up past the ground-floor plane; anything else in that column between those
   * two stops the climb, and a cellar you cannot climb out of is a cellar the
   * whole of which is unreachable. So: the shaft carries the ladder and
   * nothing else, in every style, at every legal depth and on every plan.
   */
  it("keeps the ladder's shaft clear from the cellar floor to the plane", () => {
    for (const style of CELLAR_STYLES) {
      for (const depth of [3, 4, 5]) {
        for (const side of [9, 11, 13]) {
          const built = generateBuilding({
            seed: S,
            size: [side, 8, side],
            params: { floors: 1, roof: "gable", basement: depth, cellarStyle: style },
            style: PINNED,
          });
          const ladders = built.ops.filter((o) => o.block === "ladder");
          const at = ladders[0] as LocalVoxelOp;
          const intruders = built.ops.filter(
            (o) =>
              o.x === at.x &&
              o.z === at.z &&
              o.y >= -depth &&
              o.y <= 0 &&
              o.block !== "ladder" &&
              o.block !== "air",
          );
          expect(
            intruders.map((o) => `${o.block}@${o.y}`),
            `${style} ${side} deep ${depth}: the shaft is blocked`,
          ).toEqual([]);
        }
      }
    }
  });

  it("floats nothing: every block a style writes joins the room's own body", () => {
    for (const style of ALL) {
      const ops = cellar(style);
      const at = indexOf(ops);
      for (const op of ops) {
        if (op.block === "air" || op.block === "ladder" || op.block === "cobweb") continue;
        if (op.block.endsWith("lantern") || op.block === "candle") continue;
        const joined = (
          [
            [0, -1, 0],
            [0, 1, 0],
            [1, 0, 0],
            [-1, 0, 0],
            [0, 0, 1],
            [0, 0, -1],
          ] as const
        ).some(([dx, dy, dz]) => {
          const n = at.get(`${op.x + dx},${op.y + dy},${op.z + dz}`);
          return n !== undefined && n.block !== "air";
        });
        expect(joined, `${style}: ${op.block} at ${op.x},${op.y},${op.z} floats`).toBe(true);
      }
    }
  });

  it("boxes every fluid it writes — the cistern and the sewer", () => {
    for (const style of ["cistern_hall", "sewer_network"] as const) {
      const ops = cellar(style);
      const at = indexOf(ops);
      const water = ops.filter((o) => o.block === "water");
      expect(water.length, `${style} has a body of water`).toBeGreaterThan(0);
      for (const w of water) {
        // The sunk-fluid predicate: below and on all four sides is a block
        // this build wrote and it is not air and it is not another fluid's
        // escape route. Above may be air — a source block does not climb.
        for (const [dx, dy, dz] of [
          [0, -1, 0],
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ] as const) {
          const n = at.get(`${w.x + dx},${w.y + dy},${w.z + dz}`);
          expect(
            n !== undefined && (n.block !== "air" || false),
            `${style}: water at ${w.x},${w.y},${w.z} is open to ${dx},${dy},${dz}`,
          ).toBe(true);
        }
      }
    }
    // …and no other style writes a fluid at all.
    for (const style of CELLAR_STYLES) {
      if (style === "cistern_hall" || style === "sewer_network") continue;
      const blocks = names(cellar(style));
      expect(blocks.has("water"), `${style} writes no water`).toBe(false);
      expect(blocks.has("lava"), `${style} writes no lava`).toBe(false);
    }
  });

  it("writes no sign, no chain, no bare flower pot and no plain mud", () => {
    for (const style of CELLAR_STYLES) {
      for (const op of cellar(style)) {
        expect(op.block.endsWith("_sign"), `${style} ${op.block}`).toBe(false);
        expect(op.block, style).not.toBe("chain");
        expect(op.block, style).not.toBe("flower_pot");
        expect(op.block, style).not.toBe("mud");
      }
    }
  });

  it("gives each room the thing it is named for", () => {
    expect(names(cellar("ossuary")).has("bone_block")).toBe(true);
    expect(names(cellar("undercroft")).has("stone_brick_stairs")).toBe(true);
    expect(names(cellar("dungeon_room")).has("iron_bars")).toBe(true);
    expect(names(cellar("root_cellar")).has("packed_mud")).toBe(true);
    expect(names(cellar("root_cellar")).has("oak_slab"), "board shelves").toBe(true);
    expect(names(cellar("cistern_hall")).has("water")).toBe(true);
    expect(names(cellar("smugglers_cove")).has("chest")).toBe(true);
    expect(names(cellar("hermit_grotto")).has("lectern")).toBe(true);
    expect(names(cellar("sewer_network")).has("bricks")).toBe(true);
    expect(names(cellar("bunker_hold")).has("gray_concrete")).toBe(true);
    expect(names(cellar("subway_platform")).has("rail")).toBe(true);
    expect(names(cellar("silo_shaft")).has("deepslate_bricks")).toBe(true);
  });

  it("keeps the undercroft's springers out of a shallow cellar's headroom", () => {
    // At the shallowest legal depth the springer course would be one block over
    // the walk plane — a stair through a player's head — so it is not drawn.
    const shallow = generateBuilding({
      seed: S,
      size: [11, 8, 11],
      params: { floors: 1, roof: "gable", basement: 3, cellarStyle: "undercroft" },
      style: PINNED,
    }).ops.filter((op) => op.y < 0);
    expect(names(shallow).has("stone_brick_stairs")).toBe(false);
    expect(names(cellar("undercroft")).has("stone_brick_stairs")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* the archetypes                                                              */
/* -------------------------------------------------------------------------- */

const BIG: readonly [number, number, number] = [15, 12, 15];
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [13, 11, 13], [9, 10, 11]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = depthsFacadeDefaults(archetype);
  return generateBuilding({
    size,
    seed,
    style: PINNED,
    params: {
      archetype,
      floors: 1,
      ...(facade.roof === undefined ? {} : { roof: facade.roof }),
      ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
      ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
      ...extra,
    },
  });
}

describe("wave six archetypes — the depths", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of DEPTHS_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isDepthsArchetype(a)).toBe(true);
    }
    expect(isDepthsArchetype("mine_head")).toBe(false);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("is claimed by the catalog as wave six, implemented, and as a building", () => {
    for (const a of DEPTHS_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(6);
      // The group is `underground` because that is what these are *about*; the
      // kind is overridden to `building` because that is what they are.
      expect(entry?.category, a).toBe("underground");
      expect(entry?.kind, a).toBe("building");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === a), a).toHaveLength(1);
    }
  });

  it("reads each one off a node's tags, without stealing another's", () => {
    expect(archetypeOfTags(["bunker_complex"])).toBe("bunker_complex");
    expect(archetypeOfTags(["fallout_shelter"])).toBe("bunker_complex");
    expect(archetypeOfTags(["subway_station"])).toBe("subway_station");
    expect(archetypeOfTags(["metro_station"])).toBe("subway_station");
    expect(archetypeOfTags(["underground_station"])).toBe("subway_station");
    expect(archetypeOfTags(["underground_silo"])).toBe("underground_silo");
    expect(archetypeOfTags(["missile_silo"])).toBe("underground_silo");
    // The near misses, every one deliberate: `bunker` is the garrison's and
    // `silo` the homestead's, and both must still reach them.
    expect(archetypeOfTags(["bunker"])).not.toBe("bunker_complex");
    expect(archetypeOfTags(["silo"])).not.toBe("underground_silo");
    expect(depthsArchetypeOfTags(["station"])).toBeNull();
    expect(depthsArchetypeOfTags(["cottage"])).toBeNull();
  });

  it("digs itself a cellar and dresses it, when the document says nothing", () => {
    for (const a of DEPTHS_BUILDING_ARCHETYPES) {
      expect(defaultBasementDepth(a), a).toBe(5);
      expect(defaultCellarStyle(a), a).not.toBeNull();
      const ops = build(a).ops;
      const below = ops.filter((op) => op.y < 0);
      expect(below.length, `${a} dug nothing`).toBeGreaterThan(100);
      // …and it is the archetype's own room, not the plain grey box.
      const style = defaultCellarStyle(a) as string;
      const marker =
        style === "bunker_hold" ? "gray_concrete" : style === "subway_platform" ? "rail" : "deepslate_bricks";
      expect(names(below).has(marker), `${a} dressed its cellar ${style}`).toBe(true);
    }
    // The mine head is untouched by the new default: it has never forced one.
    expect(defaultBasementDepth("mine_head")).toBeNull();
    expect(defaultCellarStyle("mine_head")).toBe("mine");
    expect(defaultCellarStyle("cottage")).toBeNull();
    expect(defaultBasementDepth("cottage")).toBeNull();
  });

  it("still honours an explicit basement — including none at all", () => {
    const none = build("bunker_complex", BIG, { basement: 0 });
    expect(none.ops.some((op) => op.y < 0 && op.block === "ladder")).toBe(false);
    const shallow = build("subway_station", BIG, { basement: 3 });
    expect(Math.min(...shallow.ops.map((o) => o.y))).toBeGreaterThanOrEqual(-4);
  });

  it("keeps the ground floor one reachable region from the door", () => {
    for (const a of DEPTHS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        assertNoPockets(build(a, size), { label: `${a} ${size.join("x")}` });
      }
    }
  });

  it("stays inside the envelope, plus the one cell of doorstep every archetype has", () => {
    // The grammar's own exterior dressing — window boxes, a fence, a pot —
    // stands one cell *outside* the footprint, for every archetype since the
    // cottage. So the bound is the envelope grown by one, and the thing worth
    // asserting is that this wave adds nothing beyond it.
    for (const a of DEPTHS_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const built = build(a, size);
        for (const op of built.ops) {
          expect(op.x, `${a} x`).toBeGreaterThanOrEqual(-1);
          expect(op.x, `${a} x`).toBeLessThanOrEqual(size[0]);
          expect(op.z, `${a} z`).toBeGreaterThanOrEqual(-1);
          expect(op.z, `${a} z`).toBeLessThanOrEqual(size[2]);
        }
      }
    }
  });

  it("gives the same ops for the same seed, and different ones for another", () => {
    for (const a of DEPTHS_BUILDING_ARCHETYPES) {
      expect(JSON.stringify(build(a).ops), a).toBe(JSON.stringify(build(a).ops));
    }
  });

  it("writes no sign, no chain, no bare flower pot and no plain mud", () => {
    for (const a of DEPTHS_BUILDING_ARCHETYPES) {
      for (const op of build(a).ops) {
        expect(op.block.endsWith("_sign"), `${a} ${op.block}`).toBe(false);
        expect(op.block, a).not.toBe("chain");
        expect(op.block, a).not.toBe("flower_pot");
        expect(op.block, a).not.toBe("mud");
      }
    }
  });

  it("builds the entrance each one is for", () => {
    const bunker = names(build("bunker_complex").ops);
    expect(bunker.has("iron_block"), "the blast-door corner").toBe(true);
    expect(bunker.has("crafting_table"), "the duty desk").toBe(true);
    const subway = build("subway_station").ops;
    expect(names(subway).has("smooth_stone_stairs"), "the benches").toBe(true);
    expect(names(subway).has("lectern"), "the ticket line").toBe(true);
    expect(
      subway.some((op) => op.block.endsWith("_banner")),
      "the line colour, as a banner and never a sign",
    ).toBe(true);
    const silo = names(build("underground_silo").ops);
    expect(silo.has("cut_copper"), "the band").toBe(true);
    expect(silo.has("anvil"), "the hardware").toBe(true);
  });
});

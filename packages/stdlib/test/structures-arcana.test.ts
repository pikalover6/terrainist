/**
 * Archetype wave 5E: twelve arcana buildings — the fantastical and the
 * remembered — on wave two's contract, with the shared pocket detector.
 *
 * The harness is deliberately the *same* one every earlier wave was held to,
 * because a new archetype that needs a new kind of guarantee is a new
 * archetype nobody can reason about:
 *
 * - it registers, resolves, and reads off a node's tags without stealing one
 *   an earlier table already claims — and the near misses here are the whole
 *   of the review, because `alchemist` means **apothecary**, `wizard` means
 *   **wizard tower**, `shrine` and `temple` mean **church**, `tomb` and
 *   `sepulchre` mean **mausoleum**, `columbarium` means **dovecote** and
 *   `baths`, `sauna` and `hammam` all mean **bathhouse**;
 * - it puts something in the room it built, and the room stays walkable **from
 *   the door**, by `assertNoPockets`, across one and two storeys and three
 *   envelope sizes. A monument is not exempt: a cenotaph is a shell with a
 *   memorial in it, not a solid plug;
 * - the lantern column is never the room's only route;
 * - nothing it builds leaves the envelope the solver reserved;
 * - no bare flower pots, and the same seed gives the same ops forever.
 *
 * Plus the three this wave exists to prove:
 *
 * - **the pavilion's pool containment**, cell for cell: every water cell has
 *   something solid under it and pool-or-solid on all four sides, and no prop
 *   ever stands on one;
 * - **arch continuity**: no block of the remembrance arch's crown is a full
 *   cube with six air faces, which is exactly the `floating.*` rule a run of
 *   hung slabs would have failed;
 * - **the pyre is unlit**. A pyre that is already burning is a bonfire.
 */

import { describe, expect, it } from "vitest";

import {
  ARCANA_BUILDING_ARCHETYPES,
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ROOF_FLOURISH_RISE,
  STRUCTURE_CATALOG,
  arcanaFacadeDefaults,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  isArcanaArchetype,
  nodeSeed,
  resolveArchetype,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";
import { assertNoPockets, walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0x5e0an, "world.arcana");
const OTHER = nodeSeed(0x5e0an, "world.arcana.other");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A plan every archetype here has room for its whole fit-out on. */
const BIG: readonly [number, number, number] = [13, 17, 15];
/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [BIG, [11, 13, 13], [9, 11, 9]];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
  seed = S,
): ReturnType<typeof generateBuilding> {
  const facade = arcanaFacadeDefaults(archetype);
  return generateBuilding({
    size,
    params: {
      archetype,
      ...(facade.roof === undefined ? {} : { roof: facade.roof }),
      ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
      ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
      ...extra,
    },
    seed,
    style: PINNED,
  });
}

/** An op index, keyed by cell. Air is a *written* op and counts as empty. */
function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

const has = (result: ReturnType<typeof generateBuilding>, block: string): boolean =>
  result.ops.some((op) => op.block === block);

/* -------------------------------------------------------------------------- */
/* registry                                                                    */
/* -------------------------------------------------------------------------- */

describe("wave-5E arcana archetypes", () => {
  it("registers every one of them, and answers to its own name", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
      expect(isArcanaArchetype(a)).toBe(true);
      expect(archetypeOfTags([a])).toBe(a);
    }
  });

  it("is claimed by the catalog, with a note", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      const entry = structureById(a);
      expect(entry, a).toBeDefined();
      expect(entry?.status, a).toBe("implemented");
      expect(entry?.wave, a).toBe(5);
      expect((entry?.note ?? "").length, a).toBeGreaterThan(20);
    }
    expect(STRUCTURE_CATALOG.length).toBeGreaterThan(0);
  });

  /**
   * The tag review, as a test. Every line below is a tag an earlier table
   * already owns, and every one of them would have been a silent theft.
   */
  it("steals no tag an earlier table already claims", () => {
    expect(archetypeOfTags(["alchemist"])).toBe("apothecary");
    expect(archetypeOfTags(["wizard"])).toBe("wizard_tower");
    expect(archetypeOfTags(["arcane"])).toBe("wizard_tower");
    expect(archetypeOfTags(["sorcerer"])).toBe("wizard_tower");
    expect(archetypeOfTags(["tomb"])).toBe("mausoleum");
    expect(archetypeOfTags(["sepulchre"])).toBe("mausoleum");
    expect(archetypeOfTags(["mausoleum"])).toBe("mausoleum");
    expect(archetypeOfTags(["columbarium"])).toBe("dovecote");
    expect(archetypeOfTags(["shrine"])).toBe("church");
    expect(archetypeOfTags(["temple"])).toBe("church");
    expect(archetypeOfTags(["baths"])).toBe("bathhouse");
    expect(archetypeOfTags(["sauna"])).toBe("bathhouse");
    expect(archetypeOfTags(["hammam"])).toBe("bathhouse");
    expect(archetypeOfTags(["witch"])).toBe("witch_hut");
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags(["hall"])).toBe("hall");
    // `beacon` is deliberately left free for the parallel military track and
    // the lighthouse: this wave claims only the compound and `spire`.
    expect(archetypeOfTags(["beacon"])).not.toBe("beacon_spire");
    expect(archetypeOfTags(["spire"])).toBe("beacon_spire");
  });

  it("reads its own compound tags off a node", () => {
    const cases: readonly (readonly [string, string])[] = [
      ["alchemy_tower", "alchemists_tower"],
      ["alchemists", "alchemists_tower"],
      ["dragon", "dragon_roost"],
      ["roost", "dragon_roost"],
      ["crystal", "crystal_shrine"],
      ["amethyst_shrine", "crystal_shrine"],
      ["dwarven", "dwarven_gate"],
      ["deep_gate", "dwarven_gate"],
      ["memorial", "war_memorial"],
      ["urns", "urn_wall"],
      ["urn_niches", "urn_wall"],
      ["memorial_arch", "remembrance_arch"],
      ["triumphal_arch", "remembrance_arch"],
      ["pyre", "pyre_platform"],
      ["bath_pavilion", "bathing_pavilion"],
      ["servants", "servants_quarters"],
    ];
    for (const [tag, archetype] of cases) expect(archetypeOfTags([tag]), tag).toBe(archetype);
  });

  it("offers a facade tendency through the shared chain", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      const own = arcanaFacadeDefaults(a);
      expect(Object.keys(own).length, a).toBeGreaterThan(0);
      expect(archetypeFacadeDefaults(a), a).toEqual(own);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* the standard battery                                                      */
  /* ------------------------------------------------------------------------ */

  it("puts something in every room it builds", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      const result = build(a);
      expect(result.meta.furnitureCount, a).toBeGreaterThan(0);
      expect(result.meta.lanternCount, a).toBeGreaterThanOrEqual(1);
      expect(result.meta.door, a).not.toBeNull();
      expect(result.ops.length, a).toBeGreaterThan(200);
    }
  });

  /**
   * The shared detector, which walks a 1x2 body from the door cell — so
   * head-height blocks, stair mounts and drops are all modelled, and a region
   * connected to itself but not to the way in fails where plain 4-connectivity
   * of the empty cells passed it.
   *
   * The lantern column is excluded because the shell hangs a light in it at
   * head height: that cell is *blocked*, not a defect, and every wave since
   * wave two has excluded it here.
   */
  it("leaves every ground floor walkable from the door, with no pockets", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        for (const floors of [1, 2]) {
          const result = build(a, size, { floors });
          const it = result.meta.interior;
          const lamp: readonly [number, number] = [
            Math.floor((it.x0 + it.x1) / 2),
            Math.floor((it.z0 + it.z1) / 2),
          ];
          const label = `${a} ${size.join("x")} floors=${floors}`;
          const report = assertNoPockets(result, { label, exclude: [lamp] });
          expect(report.reachable.length, label).toBeGreaterThan(3);
        }
      }
    }
  });

  /**
   * The lantern lesson, as a property. `core.ts` hangs a lantern over the
   * middle column at head height, so a fit-out whose only route crosses that
   * column has built a room with a wall in the middle of it.
   */
  it("never routes the floor through the column the lantern hangs in", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const it = result.meta.interior;
        const lamp: readonly [number, number] = [
          Math.floor((it.x0 + it.x1) / 2),
          Math.floor((it.z0 + it.z1) / 2),
        ];
        const label = `${a} ${size.join("x")} without the lantern cell`;
        const report = walkabilityReport(result, { exclude: [lamp] });
        expect(report.pocket, `${label}\n${report.map}`).toEqual([]);
      }
    }
  });

  it("keeps the floor plane unbroken under every archetype", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      const result = build(a);
      const at = indexOf(result.ops);
      for (const cell of result.meta.floorCells) {
        const floor = at.get(`${cell.x},0,${cell.z}`);
        expect(floor, `${a} floor at ${cell.x},${cell.z}`).toBeDefined();
        expect(floor?.block, `${a} floor at ${cell.x},${cell.z}`).not.toBe("air");
      }
    }
  });

  it("stays inside the envelope, in plan and in height", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const result = build(a, size);
        const [sx, , sz] = result.meta.size;
        const ceiling = result.meta.roofTop + ROOF_FLOURISH_RISE;
        for (const op of result.ops) {
          if (op.block === "air") continue; // clearing is not building
          expect(op.x, `${a} ${size.join("x")} x`).toBeGreaterThanOrEqual(-1);
          expect(op.x, `${a} ${size.join("x")} x`).toBeLessThanOrEqual(sx);
          expect(op.z, `${a} ${size.join("x")} z`).toBeGreaterThanOrEqual(-1);
          expect(op.z, `${a} ${size.join("x")} z`).toBeLessThanOrEqual(sz);
          expect(op.y, `${a} ${size.join("x")} y`).toBeLessThanOrEqual(ceiling);
        }
      }
    }
  });

  it("never places a bare flower pot, a sign or a chain", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      for (const size of SIZES) {
        const label = `${a} ${size.join("x")}`;
        const result = build(a, size);
        expect(has(result, "flower_pot"), label).toBe(false);
        expect(has(result, "chain"), label).toBe(false);
        expect(
          result.ops.some((op) => op.block.endsWith("_sign") || op.block.endsWith("_hanging_sign")),
          label,
        ).toBe(false);
      }
    }
  });

  it("is deterministic, and reseeds cosmetically", () => {
    for (const a of ARCANA_BUILDING_ARCHETYPES) {
      const once = JSON.stringify(build(a).ops);
      expect(JSON.stringify(build(a).ops), a).toBe(once);
      const other = build(a, BIG, {}, OTHER);
      expect(other.meta.params.archetype, a).toBe(a);
      expect(other.ops.length, a).toBeGreaterThan(200);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* the thing each archetype is for                                           */
  /* ------------------------------------------------------------------------ */

  it("builds the thing each archetype is for", () => {
    // Fantasy.
    expect(has(build("alchemists_tower", [9, 19, 9]), "cut_copper"), "copper banding").toBe(true);
    expect(has(build("alchemists_tower", [9, 19, 9]), "lightning_rod"), "the vent").toBe(true);
    expect(has(build("alchemists_tower"), "brewing_stand"), "the lab").toBe(true);
    expect(has(build("dragon_roost", [17, 15, 21]), "blackstone"), "charred trim").toBe(true);
    expect(has(build("dragon_roost", [17, 15, 21]), "hay_block"), "the nest").toBe(true);
    expect(has(build("dragon_roost", [17, 15, 21]), "gold_block"), "the hoard").toBe(true);
    expect(has(build("crystal_shrine"), "amethyst_block"), "the focus").toBe(true);
    expect(has(build("crystal_shrine"), "purpur_block"), "the trim").toBe(true);
    expect(has(build("dwarven_gate", [15, 13, 13]), "chiseled_deepslate"), "the runes").toBe(true);
    expect(has(build("dwarven_gate", [15, 13, 13]), "anvil"), "the forge").toBe(true);
    expect(has(build("beacon_spire", [7, 21, 7]), "sea_lantern"), "the crown").toBe(true);
    // Memorial.
    expect(has(build("cenotaph"), "green_carpet"), "the wreath").toBe(true);
    expect(has(build("cenotaph"), "white_wall_banner"), "the name wall").toBe(true);
    expect(has(build("war_memorial"), "red_wall_banner"), "the flags").toBe(true);
    expect(has(build("war_memorial"), "chiseled_stone_bricks"), "the plinth").toBe(true);
    expect(has(build("urn_wall", [9, 12, 17]), "gray_candle"), "the candles").toBe(true);
    expect(has(build("remembrance_arch"), "red_carpet"), "the runner").toBe(true);
    expect(has(build("pyre_platform"), "stripped_spruce_log"), "the cribbing").toBe(true);
    // Leisure and residential.
    expect(has(build("bathing_pavilion"), "water"), "the pool").toBe(true);
    expect(has(build("bathing_pavilion"), "smooth_quartz"), "the coping").toBe(true);
    expect(has(build("servants_quarters", [11, 12, 17]), "white_bed"), "the bunks").toBe(true);
    expect(has(build("servants_quarters", [11, 12, 17]), "barrel"), "the racks").toBe(true);
  });

  /**
   * The urn wall's niches are on the **walls**, and the aisle between them is
   * clear: every trapdoor stands on an interior wall row, above the standing
   * plane, so no floor cell is ever taken by one.
   */
  it("hangs the urn wall's niches on the walls and leaves the aisle clear", () => {
    const result = build("urn_wall", [9, 12, 17]);
    const it = result.meta.interior;
    // The shell hangs shutters of its own out in the apron; the niches are the
    // ones on the interior wall rows.
    const niches = result.ops.filter(
      (op) =>
        op.block.endsWith("_trapdoor") &&
        op.y >= 2 &&
        op.x >= it.x0 &&
        op.x <= it.x1 &&
        op.z >= it.z0 &&
        op.z <= it.z1,
    );
    expect(niches.length).toBeGreaterThan(8);
    for (const op of niches) {
      expect([it.x0, it.x1], `niche at ${op.x},${op.y},${op.z}`).toContain(op.x);
      expect(op.y, `niche at ${op.x},${op.y},${op.z}`).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * The seat rule, geometrically. A stair's `facing` names its **high** half —
   * the backrest — so a kneeler looking at the crystal faces away from it.
   */
  it("turns the crystal shrine's benches away from the crystal", () => {
    const result = build("crystal_shrine", [13, 13, 15]);
    const it = result.meta.interior;
    const door = result.meta.door;
    expect(door).not.toBeNull();
    const focusNorth = (door?.z ?? it.z1) > (it.z0 + it.z1) / 2;
    const expected = focusNorth ? "south" : "north";
    const benches = result.ops.filter(
      (op) =>
        op.y === 1 &&
        op.block.endsWith("_stairs") &&
        op.props?.["half"] === "bottom" &&
        op.x !== it.x0 &&
        op.x !== it.x1,
    );
    expect(benches.length).toBeGreaterThan(0);
    for (const bench of benches) {
      expect(bench.props?.["facing"], `bench at ${bench.x},${bench.z}`).toBe(expected);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* the three this wave exists to prove                                       */
  /* ------------------------------------------------------------------------ */

  /**
   * The pavilion's pool containment, cell for cell — the bathhouse's fluid
   * argument, checked rather than asserted:
   *
   * - the water is in the **floor plane**, so under it is the foundation skirt;
   * - each of its four neighbours in plan is pool or a written solid;
   * - nothing stands in the cell above a water cell.
   */
  it("boxes the bathing pavilion's pool on every side", () => {
    for (const size of [BIG, [13, 13, 13], [11, 13, 13]] as const) {
      for (const floors of [1, 2]) {
        const result = build("bathing_pavilion", size, { floors });
        const label = `bathing_pavilion ${size.join("x")} floors=${floors}`;
        const at = indexOf(result.ops);
        const water = result.ops.filter((op) => op.block === "water");
        expect(water.length, label).toBeGreaterThan(0);
        for (const w of water) {
          expect(w.y, `${label}: water off the floor plane at ${w.x},${w.y},${w.z}`).toBe(0);
          // Under it: the foundation skirt, or the world below the plane.
          const under = at.get(`${w.x},${w.y - 1},${w.z}`);
          if (under !== undefined) {
            expect(under.block, `${label}: nothing under ${w.x},${w.z}`).not.toBe("air");
          }
          // Beside it: pool, or a written floor cell.
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const side = at.get(`${w.x + dx},0,${w.z + dz}`);
            expect(side, `${label}: nothing beside ${w.x},${w.z}`).toBeDefined();
            expect(side?.block, `${label}: air beside ${w.x},${w.z}`).not.toBe("air");
          }
          // Above it: clear. No prop ever stands on a pool cell.
          const over = at.get(`${w.x},1,${w.z}`);
          if (over !== undefined) {
            expect(over.block, `${label}: prop on the pool at ${w.x},${w.z}`).toBe("air");
          }
        }
      }
    }
  });

  /**
   * Arch continuity — the `floating.*` rule, restated as a property.
   *
   * No block of the remembrance arch's crown may be a full cube with six air
   * faces, which is exactly what a run of hung slabs across a room would be.
   * The crown is a continuous course, so every block in it has a neighbour in
   * the course or the shell's own wall beside it.
   */
  it("builds the remembrance arch as a continuous supported course", () => {
    for (const size of [BIG, [13, 15, 15], [11, 13, 13]] as const) {
      const result = build("remembrance_arch", size);
      const label = `remembrance_arch ${size.join("x")}`;
      const at = indexOf(result.ops);
      const solidAt = (x: number, y: number, z: number): boolean => {
        const op = at.get(`${x},${y},${z}`);
        return op !== undefined && op.block !== "air";
      };
      const crown = result.ops.filter((op) => op.block === "sandstone" || op.block === "chiseled_sandstone");
      expect(crown.length, label).toBeGreaterThan(0);
      for (const op of crown) {
        const faces = [
          solidAt(op.x + 1, op.y, op.z),
          solidAt(op.x - 1, op.y, op.z),
          solidAt(op.x, op.y + 1, op.z),
          solidAt(op.x, op.y - 1, op.z),
          solidAt(op.x, op.y, op.z + 1),
          solidAt(op.x, op.y, op.z - 1),
        ];
        expect(
          faces.some((f) => f),
          `${label}: floating arch block at ${op.x},${op.y},${op.z}`,
        ).toBe(true);
      }
      // And the crown is one unbroken run at one Y, wall to wall.
      const it = result.meta.interior;
      const ys = new Set(crown.filter((op) => op.y >= 3).map((op) => op.y));
      for (const y of ys) {
        const zs = new Set(crown.filter((op) => op.y === y).map((op) => op.z));
        for (const z of zs) {
          const xs = crown.filter((op) => op.y === y && op.z === z).map((op) => op.x);
          if (xs.length < 2) continue;
          for (let x = it.x0; x <= it.x1; x++) {
            expect(
              solidAt(x, y, z),
              `${label}: gap in the arch crown at ${x},${y},${z}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  /** The pyre is waiting to be lit. Every campfire it writes is `lit: false`. */
  it("leaves the pyre's campfire unlit", () => {
    for (const size of SIZES) {
      for (const floors of [1, 2]) {
        const result = build("pyre_platform", size, { floors });
        const label = `pyre_platform ${size.join("x")} floors=${floors}`;
        // The shell lays its own lit hearth at `y = 1`; the pyre is what this
        // fit-out writes — the dais fire standing on top of the plinth, or its
        // fallback on the far wall row. Both are unlit, and at least one of
        // them exists at every envelope.
        const it = result.meta.interior;
        const inside = (op: LocalVoxelOp): boolean =>
          op.x >= it.x0 && op.x <= it.x1 && op.z >= it.z0 && op.z <= it.z1;
        const dais = result.ops.filter(
          (op) => op.block === "campfire" && op.y === 2 && inside(op),
        );
        const fallback = result.ops.filter(
          (op) =>
            op.block === "campfire" &&
            op.y === 1 &&
            inside(op) &&
            op.props?.["lit"] === "false",
        );
        expect(dais.length + fallback.length, label).toBeGreaterThan(0);
        for (const fire of dais) {
          expect(fire.props?.["lit"], `${label}: fire at ${fire.x},${fire.y},${fire.z}`).toBe(
            "false",
          );
        }
      }
    }
  });

  /** Every memorial candle in this wave is unlit, for the same reason. */
  it("leaves every memorial candle unlit", () => {
    for (const a of ["cenotaph", "war_memorial", "urn_wall", "remembrance_arch", "pyre_platform"]) {
      const result = build(a);
      const lit = result.ops.filter(
        (op) => op.block.endsWith("_candle") && op.props?.["lit"] !== "false",
      );
      expect(lit.map((op) => `${op.block}@${op.x},${op.z}`), a).toEqual([]);
    }
  });
});

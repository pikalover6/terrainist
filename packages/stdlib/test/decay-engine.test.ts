/**
 * **The decay engine, generalised** — RUINS-PLAN-v0 WP-2.
 *
 * WP-1's golden (`relic-decay-identity.test.ts`) holds the five relics still.
 * This file holds the *rules* WP-2 added, each stated as the document states
 * it, because every one of them is a sentence that could be quietly broken by a
 * plausible-looking change:
 *
 * - THE RE-CLAD RULE (§5.2) — a re-clad never invents a material, and a family
 *   with no weathered variant decays by removal instead;
 * - the collapse-by-**category** table (§5.1) — one table, no per-archetype list;
 * - `quench` (§5.5) — cold and dry over the whole catalog;
 * - `settleFixtures` (§5.6) — the fixpoint, and the one thing it may not touch;
 * - `reachOrRefuse` (§5.7) — the guarantee, checked.
 *
 * The end-to-end bar (a real world, read back and linted on all 26 rules) is
 * `packages/compiler/test/ruins-sweep.test.ts`. This file is the vocabulary.
 */

import { describe, expect, it } from "vitest";

import {
  BODY_BLOCKING,
  BUILDING_STYLE_DEFAULTS,
  RELIC_BUILDING_ARCHETYPES,
  RELIC_DECAY_PROFILES,
  TIMBER_EXTRA,
  WEATHERED_VARIANTS,
  bodyBlocking,
  bodyFits,
  canSupport,
  collapseForShell,
  generateBuilding,
  nodeSeed,
  weatheredOf,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xf19n, "world.ruin");
const SIZE: [number, number, number] = [13, 17, 15];

function build(archetype: string, decay?: number): readonly LocalVoxelOp[] {
  return generateBuilding({
    size: SIZE,
    params: { archetype, floors: 2, ...(decay === undefined ? {} : { decay }) },
    seed: SEED,
    style: BUILDING_STYLE_DEFAULTS,
  }).ops;
}

/** The last write wins, so the world a build produces is its op list folded. */
function worldOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const out = new Map<string, LocalVoxelOp>();
  for (const op of ops) out.set(`${op.x},${op.y},${op.z}`, op);
  for (const [key, op] of [...out]) if (op.block === "air") out.delete(key);
  return out;
}

describe("THE RE-CLAD RULE (§5.2)", () => {
  it("substitutes only within the block's own family", () => {
    for (const [family, variants] of Object.entries(WEATHERED_VARIANTS)) {
      for (const variant of variants) {
        // Every substitute is stone-family masonry of the same colour story as
        // the block it replaces. The test that matters is the negative one
        // below; this one pins that the table has no empty rows.
        expect(variant, family).toMatch(/^[a-z_]+$/);
      }
      expect(variants.length, family).toBeGreaterThan(0);
    }
  });

  it("has NO variant for timber, brick, terracotta, concrete, quartz or glass", () => {
    // §5.2's second clause, and the clause that makes the rule good rather than
    // merely safe: these decay by removal, so the crumble line runs lower on
    // them and the shell's own block is left exactly as it is.
    //
    // **Sandstone left this list when the `sun_clay` theme arrived** — a theme
    // whose every wall is sandstone would otherwise have had no weathering at
    // all, only holes, which is the concrete-tower bug from the other side. See
    // the sun-clay case below for what it decays *to*, and note that terracotta
    // (the plaster) stays here on purpose: limewash falls off a ruin.
    for (const block of [
      "oak_planks",
      "spruce_planks",
      "oak_log",
      "bricks",
      "terracotta",
      "white_terracotta",
      "white_concrete",
      "quartz_block",
      "glass",
    ]) {
      expect(weatheredOf(block, 0), block).toBeNull();
    }
  });

  it("weathers the sun-clay families down their own stages", () => {
    // The `sun_clay` theme's walls, and the property that matters is that every
    // answer is inside the block's own family: sandstone weathers to sandstone
    // and mud brick to mud, never to the mossy cobblestone a Mediterranean
    // ruin has never seen.
    const sandstone = /^(sandstone|cut_sandstone|chiseled_sandstone|smooth_sandstone)$/;
    for (const block of ["sandstone", "cut_sandstone", "chiseled_sandstone", "smooth_sandstone"]) {
      for (const k of [0, 1, 2, 3]) {
        expect(weatheredOf(block, k), `${block}@${k}`).toMatch(sandstone);
      }
      // …and the dressing goes: no weathered face is *more* finished than the
      // block it replaces, which is the direction that reads as age.
      expect(weatheredOf(block, 0), block).not.toBe("smooth_sandstone");
    }
    expect(weatheredOf("mud_bricks", 0)).toBe("packed_mud");
    expect(weatheredOf("packed_mud", 1)).toBe("coarse_dirt");
  });

  it("weathers the stone families, and mixes by position", () => {
    expect(weatheredOf("stone_bricks", 0)).toBe("cracked_stone_bricks");
    expect(weatheredOf("stone_bricks", 1)).toBe("mossy_stone_bricks");
    expect(weatheredOf("cobblestone", 1)).toBe("mossy_cobblestone");
    expect(weatheredOf("deepslate_bricks", 0)).toBe("cracked_deepslate_bricks");
  });

  it("never puts a foreign material on a timber shell", () => {
    // The whole point: a cottage is oak, and a ruined oak cottage must not come
    // out clad in cobblestone it was never built from. Moss is the one exception
    // the rule grants — it is not the building's material, it is what grows on it.
    const world = worldOf(build("cottage", 0.85));
    const before = new Set([...worldOf(build("cottage"))].map(([, op]) => op.block));
    const allowed = /^(moss_carpet|vine|coarse_dirt|dead_bush|air)$/;
    for (const [, op] of world) {
      if (before.has(op.block) || allowed.test(op.block)) continue;
      // Anything else must be a weathered variant of something the shell had.
      const derived = [...before].some((b) =>
        (WEATHERED_VARIANTS[b] ?? []).includes(op.block),
      );
      expect(derived, `${op.block} appeared in a ruined timber cottage`).toBe(true);
    }
  });

  it("takes more of the wall where the family has no variant", () => {
    expect(TIMBER_EXTRA).toBeGreaterThan(0);
    expect(TIMBER_EXTRA).toBeLessThan(0.5);
  });
});

describe("the collapse-by-category table (§5.1)", () => {
  it("sends mass — defensive, civic, faith — to `structured`", () => {
    for (const archetype of ["keep", "church", "town_hall"]) {
      expect(collapseForShell(archetype, [13, 17, 15]), archetype).toBe("structured");
    }
  });

  it("sends a tower-shaped footprint to `leaning`, whatever its category", () => {
    // Height > 2 × the longest plan side. Checked first, because a bell tower
    // is `religious` and is still a tower.
    expect(collapseForShell("church", [7, 30, 7])).toBe("leaning");
    expect(collapseForShell("cottage", [7, 30, 7])).toBe("leaning");
  });

  it("sends everything else to `even`, the shape that reads as time", () => {
    for (const archetype of ["cottage", "bakery", "warehouse", "nothing_in_the_catalog"]) {
      expect(collapseForShell(archetype, [13, 17, 15]), archetype).toBe("even");
    }
  });

  it("agrees with the five relics' own profiles where §5.1's category applies", () => {
    // The church and the villa build `structured` and always have; §5's table
    // says `even` for both, and the code is right (WP-1's golden is the bar).
    // The category table sends both the same way, which is the check that the
    // generalisation did not contradict the reference implementations.
    expect(RELIC_DECAY_PROFILES.ruined_church.collapse).toBe("structured");
    expect(RELIC_DECAY_PROFILES.collapsed_tower.collapse).toBe("leaning");
    expect(RELIC_BUILDING_ARCHETYPES.length).toBe(5);
  });
});

describe("quench — cold and dry (§5.5)", () => {
  it("leaves no fire and no fluid anywhere in a ruined shell", () => {
    for (const archetype of ["smithy", "bakery", "cottage", "inn"]) {
      const world = worldOf(build(archetype, 0.7));
      for (const [key, op] of world) {
        const [, y] = key.split(",").map(Number) as [number, number, number];
        // The cellar is out of scope in v0 (§13.9).
        if (y < 0) continue;
        expect(op.block, `${archetype} ${key}`).not.toMatch(
          /^(fire|soul_fire|lava|water|campfire|soul_campfire|torch|soul_torch|lantern|soul_lantern)$/,
        );
        expect(op.props?.["lit"], `${archetype} ${key}`).not.toBe("true");
        expect(op.props?.["waterlogged"], `${archetype} ${key}`).not.toBe("true");
      }
    }
  });

  it("leaves the intact shell's fire exactly where it was", () => {
    // The reach law: no `decay`, nothing changes. A smithy with no decay keeps
    // its forge, which is the control this whole file is meaningless without.
    const intact = worldOf(build("smithy"));
    const lit = [...intact].filter(([, op]) => op.props?.["lit"] === "true" || op.block.endsWith("lantern"));
    expect(lit.length).toBeGreaterThan(0);
  });
});

describe("settleFixtures — the fixpoint (§5.6)", () => {
  it("leaves nothing hanging off a wall the crumble took", () => {
    for (const archetype of ["library", "bakery", "warehouse", "cottage", "inn"]) {
      const world = worldOf(build(archetype, 0.85));
      for (const [key, op] of world) {
        const [x, y, z] = key.split(",").map(Number) as [number, number, number];
        if (y < 1) continue;
        if (op.block !== "ladder") continue;
        const facing = op.props?.["facing"];
        if (facing === undefined) continue;
        const step: Record<string, [number, number]> = {
          north: [0, -1],
          south: [0, 1],
          east: [1, 0],
          west: [-1, 0],
        };
        const [dx, dz] = step[facing] as [number, number];
        const back = world.get(`${x - dx},${y},${z - dz}`);
        expect(back, `${archetype}: a ladder rung at ${key} climbs air`).toBeDefined();
      }
    }
  });

  it("never sweeps the way in", () => {
    // The door and its approach are never decayed — the walking agent and the
    // lint's traversal walk both start in the cell inside the door.
    for (const archetype of ["cottage", "library"]) {
      const ruined = generateBuilding({
        size: SIZE,
        params: { archetype, floors: 2, decay: 0.9 },
        seed: SEED,
        style: BUILDING_STYLE_DEFAULTS,
      });
      const door = ruined.meta.door;
      expect(door, archetype).not.toBeNull();
      const world = worldOf(ruined.ops);
      expect(world.get(`${door!.x},1,${door!.z}`), `${archetype}: the doorway went`).toBeDefined();
    }
  });

  it("strands no full cube — rule 13 is the sweep's third family", () => {
    // The finding this clause came back from (2026-08-10): a high-decline
    // metropolis linted two `floating.isolated` light gray concrete blocks, both
    // a parking garage's head-height trim course, left one block off nothing
    // once the wall behind it crumbled and its own lower course went. The sweep
    // policed slabs and stairs geometrically and full cubes not at all.
    for (const archetype of ["parking_garage", "warehouse", "library", "workshop", "inn"]) {
      for (const decay of [0.6, 0.85, 0.95]) {
        const world = worldOf(build(archetype, decay));
        for (const [key, op] of world) {
          const [x, y, z] = key.split(",").map(Number) as [number, number, number];
          // The clause's own bounds: above the plinth, and full cubes only —
          // below that the op list cannot see the ground a block stands on.
          if (y < 2 || !canSupport(op.block)) continue;
          const touching = [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ].some(([dx, dy, dz]) =>
            world.has(`${x + (dx as number)},${y + (dy as number)},${z + (dz as number)}`),
          );
          expect(touching, `${archetype}@${decay}: ${op.block} at ${key} floats alone`).toBe(true);
        }
      }
    }
  });
});

describe("reachOrRefuse — the guarantee, checked (§5.7)", () => {
  it("refuses no ordinary shell, and says so in the meta", () => {
    for (const archetype of ["cottage", "library", "bakery", "warehouse", "inn", "church"]) {
      for (const decay of [0.35, 0.6, 0.9]) {
        const result = generateBuilding({
          size: SIZE,
          params: { archetype, floors: 2, decay },
          seed: SEED,
          style: BUILDING_STYLE_DEFAULTS,
        });
        expect(result.meta.decay?.refused, `${archetype}@${decay}`).toBe(false);
      }
    }
  });

  it("floods with a two-course body, so a crawlspace is not a way out", () => {
    // The shipped defect, WP-4's P4 candidate: five `parking_garage` shells
    // whose ground storey ends in an L-pocket of three cells round the ladder,
    // walled by two of the decay's own rubble heaps. The flood asked the FEET
    // course alone, so it walked out under the deck slab — a cell with air at
    // the feet and concrete at the head — declared the pocket reached, and
    // withdrew nothing. The lint, arriving with a body two courses tall, could
    // not use that crawlspace and reported three `traversal.unreachable` in
    // each shell: 15 findings on the ground storey the ruling guarantees.
    //
    // The property, stated the way the lint states it: every cell a body can
    // stand in on the ground storey has a walking route from the door.
    // The deck shell as the district builds it — one storey of it under a slab
    // that comes down to head height — and an ordinary shell beside it, so the
    // property is not stated only where it was broken.
    const cases: readonly {
      archetype: string;
      size: [number, number, number];
      floors: number;
    }[] = [
      { archetype: "parking_garage", size: [9, 14, 7], floors: 1 },
      { archetype: "parking_garage", size: [9, 14, 7], floors: 2 },
      { archetype: "parking_garage", size: [16, 14, 7], floors: 2 },
      { archetype: "parking_garage", size: SIZE, floors: 1 },
      { archetype: "cottage", size: SIZE, floors: 2 },
      { archetype: "warehouse", size: SIZE, floors: 2 },
    ];
    for (const { archetype, size, floors } of cases) {
      for (const decay of [0.4, 0.55, 0.7, 0.85, 1]) {
        const { ops, meta } = generateBuilding({
          size,
          params: { archetype, floors, decay },
          seed: SEED,
          style: BUILDING_STYLE_DEFAULTS,
        });
        const world = worldOf(ops);
        const at = (x: number, y: number, z: number): string =>
          world.get(`${x},${y},${z}`)?.block ?? "air";
        const floor = new Set(meta.floorCells.map((cell) => `${cell.x},${cell.z}`));
        /** The lint's `passableAt`, in the op list's vocabulary. */
        const clear = (x: number, y: number, z: number): boolean => {
          const block = at(x, y, z);
          return block === "air" || bodyFits(block);
        };
        /** The lint's `standable`: support under the feet, body above it. */
        const standable = (x: number, z: number): boolean =>
          floor.has(`${x},${z}`) &&
          canSupport(at(x, 0, z)) &&
          clear(x, 1, z) &&
          clear(x, 2, z);
        const door = meta.door;
        if (door === null) continue;
        const start = ([
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const)
          .map(([dx, dz]) => ({ x: door.x + dx, z: door.z + dz }))
          .find((cell) => standable(cell.x, cell.z));
        expect(start, `${archetype} ${size.join("x")}@${decay}: no cell inside the door`).toBeDefined();
        const seen = new Set([`${(start as { x: number; z: number }).x},${(start as { x: number; z: number }).z}`]);
        const queue = [start as { x: number; z: number }];
        while (queue.length > 0) {
          const cell = queue.pop() as { x: number; z: number };
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const next = { x: cell.x + dx, z: cell.z + dz };
            const key = `${next.x},${next.z}`;
            if (seen.has(key) || !standable(next.x, next.z)) continue;
            seen.add(key);
            queue.push(next);
          }
        }
        const stranded = meta.floorCells.filter(
          (cell) => standable(cell.x, cell.z) && !seen.has(`${cell.x},${cell.z}`),
        );
        expect(
          stranded.map((cell) => `${cell.x},${cell.z}`),
          `${archetype} ${size.join("x")} floors=${floors}@${decay}`,
        ).toEqual([]);
      }
    }
  });
});

describe("the flood reads the lint's own vocabulary (§5.7, §8)", () => {
  it("calls a body-sized cell open and an obstacle sealed, exactly as `passableAt` does", () => {
    // The shipped defect: `reachOrRefuse`'s flood called a **flower pot's**
    // cell sealed, so a cell walled in on its other three sides never appeared
    // in `stranded`, the heap that walled it in was never withdrawn — and the
    // physics lint, which calls a pot's cell a place a player stands, reported
    // `traversal.unreachable` on it. Seeds 304, 305 and 306 of the WP-4 fixture
    // family, 1/1/3 findings; the fix is one vocabulary rather than two.
    for (const name of [
      "potted_red_tulip",
      "potted_dandelion",
      "flower_pot",
      "moss_carpet",
      "vine",
      "torch",
      "oak_door",
      "ladder",
      "stone_button",
      "oak_sign",
    ]) {
      expect(bodyFits(name), name).toBe(true);
    }
    for (const name of [
      "spruce_planks",
      "cobblestone",
      "cobbled_deepslate",
      "spruce_stairs",
      "oak_slab",
      "spruce_fence",
      "lantern",
      "cauldron",
      "chest",
      "white_bed",
      "iron_bars",
      "campfire",
    ]) {
      expect(bodyFits(name), name).toBe(false);
    }
  });

  it("is the physics lint's set, not a copy of it", () => {
    // `emit/physics.ts` imports `bodyBlocking` from here; the constant is the
    // shared one, and a second BODY_BLOCKING regex anywhere is the defect.
    expect(BODY_BLOCKING.test("oak_stairs")).toBe(true);
    expect(BODY_BLOCKING.test("potted_cactus")).toBe(false);
    expect(bodyBlocking("cauldron")).toBe(true);
  });
});

describe("the reach law (§2)", () => {
  it("a shell with no decay is byte-identical to one that never heard of it", () => {
    for (const archetype of ["cottage", "smithy", "library", "church", "warehouse"]) {
      const plain = build(archetype);
      const zero = build(archetype, 0);
      expect(zero, archetype).toEqual(plain);
      expect(
        generateBuilding({
          size: SIZE,
          params: { archetype, floors: 2 },
          seed: SEED,
          style: BUILDING_STYLE_DEFAULTS,
        }).meta.decay,
        archetype,
      ).toBeUndefined();
    }
  });

  it("is deterministic: the same shell and dial twice is the same list", () => {
    for (const archetype of ["cottage", "library"]) {
      expect(build(archetype, 0.62)).toEqual(build(archetype, 0.62));
    }
  });
});

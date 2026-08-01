/**
 * The extended archetypes, their flourishes, and the upper floors.
 *
 * The same contract `structures.test.ts` holds the first six archetypes to,
 * applied to the seven added on top of them — plus the two properties that are
 * new here and that a render would only show you by accident:
 *
 * - a steeple and a set of sails stay inside the envelope they were sized
 *   from, so the layout solver's reservation is still true;
 * - an upper storey is furnished *and* still walkable, with the head of the
 *   stairs inside the walkable region — the granary's lesson, one floor up.
 */

import { describe, expect, it } from "vitest";

import { passableBlock } from "./helpers/walkability.js";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  EXTENDED_BUILDING_ARCHETYPES,
  ROOF_FLOURISH_RISE,
  archetypeFacadeDefaults,
  archetypeOfTags,
  generateBuilding,
  nodeSeed,
  resolveArchetype,
  type BuildingArchetype,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0x5eedn, "world.civic");
const PINNED = BUILDING_STYLE_DEFAULTS;

/** A roomy plan: every extended archetype has space for its whole fit-out. */
const BIG: readonly [number, number, number] = [13, 15, 15];

function build(
  archetype: string,
  size: readonly [number, number, number] = BIG,
  extra: Record<string, unknown> = {},
): ReturnType<typeof generateBuilding> {
  return generateBuilding({
    size,
    params: { archetype, ...extra },
    seed: SEED,
    style: PINNED,
  });
}

/** Is every free floor cell of a storey 4-reachable from every other one? */
function oneRegion(free: readonly string[]): boolean {
  if (free.length === 0) return true;
  const open = new Set(free);
  const seen = new Set([free[0] as string]);
  const queue = [free[0] as string];
  while (queue.length > 0) {
    const [x, z] = (queue.pop() as string).split(",").map(Number) as [number, number];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const k = `${x + dx},${z + dz}`;
      if (!open.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(k);
    }
  }
  return seen.size === open.size;
}

describe("extended archetypes", () => {
  it("registers every new archetype in the catalog", () => {
    for (const a of EXTENDED_BUILDING_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(resolveArchetype(a)).toBe(a);
    }
    // The original six are still first, and still there.
    expect(BUILDING_ARCHETYPES.slice(0, 6)).toEqual([
      "cottage",
      "hall",
      "inn",
      "smithy",
      "granary",
      "watchtower",
    ]);
    expect(new Set(BUILDING_ARCHETYPES).size).toBe(BUILDING_ARCHETYPES.length);
  });

  it("reads every new archetype off a node's tags", () => {
    const cases: readonly (readonly [string[], BuildingArchetype])[] = [
      [["civic", "church"], "church"],
      [["chapel"], "church"],
      [["worship", "temple"], "church"],
      [["farm", "barn"], "barn"],
      [["stable"], "barn"],
      [["mill"], "windmill"],
      [["windmill"], "windmill"],
      [["warehouse"], "warehouse"],
      [["storehouse"], "warehouse"],
      [["depot"], "warehouse"],
      [["market"], "market_stall"],
      [["stall"], "market_stall"],
      [["market_stall"], "market_stall"],
      [["library"], "library"],
      [["study"], "library"],
      [["scriptorium"], "library"],
      [["bakery"], "bakery"],
      [["bakehouse"], "bakery"],
    ];
    for (const [tags, want] of cases) {
      expect(archetypeOfTags(tags), tags.join("+")).toBe(want);
    }
  });

  it("keeps the specific building when a generic tag rides along", () => {
    // The original mapping is greedy: `trade` → inn and `store` → granary would
    // both swallow a more specific building if they were consulted first.
    expect(archetypeOfTags(["trade", "market"])).toBe("market_stall");
    expect(archetypeOfTags(["store", "warehouse"])).toBe("warehouse");
    expect(archetypeOfTags(["craft", "bakery"])).toBe("bakery");
    expect(archetypeOfTags(["hall", "church"])).toBe("church");
    // ...but a lookout still outranks everything, because a tower is a shape,
    // not a use.
    expect(archetypeOfTags(["lookout", "church"])).toBe("watchtower");
    // And the originals are untouched.
    expect(archetypeOfTags(["trade"])).toBe("inn");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags([])).toBe("cottage");
  });

  it("furnishes each new archetype with something that says what it is", () => {
    const wanted: Record<string, string[]> = {
      church: ["red_carpet", "chiseled_stone_bricks", "lectern", "bell"],
      barn: ["hay_block", "composter", "cauldron"],
      windmill: ["smooth_stone", "grindstone", "white_wool"],
      warehouse: ["barrel", "chest"],
      market_stall: ["barrel", "composter", "white_wool"],
      library: ["bookshelf", "lectern", "chiseled_bookshelf"],
      bakery: ["furnace", "smoker", "cake"],
    };
    for (const [archetype, blocks] of Object.entries(wanted)) {
      const { ops, meta } = build(archetype);
      const present = new Set(ops.map((o) => o.block));
      for (const block of blocks) {
        expect(present.has(block), `${archetype}/${block}`).toBe(true);
      }
      expect(meta.params.archetype).toBe(archetype);
      expect(meta.furnitureCount, archetype).toBeGreaterThan(2);
    }
  });

  it("furnishes the same building the same way twice", () => {
    for (const archetype of BUILDING_ARCHETYPES) {
      const key = (ops: readonly LocalVoxelOp[]): string =>
        ops.map((o) => `${o.x},${o.y},${o.z}=${o.block}:${JSON.stringify(o.props ?? {})}`).join("|");
      const a = build(archetype, BIG, { floors: 2 });
      const b = build(archetype, BIG, { floors: 2 });
      expect(key(a.ops), archetype).toBe(key(b.ops));
      expect(a.meta.furnitureCount).toBe(b.meta.furnitureCount);
    }
  });

  it("leaves every ground floor one walkable region", () => {
    // The metric matches the walk the physics lint runs: a carpet or a
    // pressure plate is a route, not an obstacle, and a cell whose head course
    // is blocked (under the stair flight's second step, under a low-slung
    // lantern) is not a cell the demand covers — a player cannot stand in it.
    for (const archetype of BUILDING_ARCHETYPES) {
      if (archetype === "watchtower") continue; // a shaft, not a room
      for (const size of [BIG, [9, 11, 9], [17, 13, 11]] as const) {
        const { ops, meta } = build(archetype, size);
        const { interior } = meta;
        const at = new Map(ops.map((o) => [`${o.x},${o.y},${o.z}`, o]));
        const free: string[] = [];
        for (let z = interior.z0; z <= interior.z1; z++) {
          for (let x = interior.x0; x <= interior.x1; x++) {
            if (!passableBlock(at.get(`${x},1,${z}`)?.block)) continue;
            if (!passableBlock(at.get(`${x},2,${z}`)?.block)) continue;
            free.push(`${x},${z}`);
          }
        }
        expect(free.length, `${archetype} ${size.join("x")}`).toBeGreaterThan(2);
        expect(oneRegion(free), `${archetype} ${size.join("x")}`).toBe(true);
      }
    }
  });
});

describe("roof flourishes", () => {
  it("gives a church a steeple with a supported bell", () => {
    const { ops, meta } = build("church", [11, 15, 15]);
    const bell = ops.filter((o) => o.block === "bell");
    expect(bell).toHaveLength(1);
    const it = bell[0] as LocalVoxelOp;
    expect(it.props?.attachment).toBe("ceiling");
    // The bell hangs from something: `attachment: ceiling` names the block
    // directly above, and a bell attached to air is dropped on the first
    // block update.
    const above = ops.find((o) => o.x === it.x && o.y === it.y + 1 && o.z === it.z);
    expect(above, "cap over the bell").toBeDefined();
    // It is a tower, not a hat: it stands clear above the roof.
    expect(it.y).toBeGreaterThan(meta.roofBase);
  });

  it("keeps a steeple inside the envelope it was sized from", () => {
    for (const size of [
      [9, 13, 13],
      [11, 15, 15],
      [13, 17, 17],
      [15, 19, 15],
    ] as const) {
      const { ops, meta } = build("church", size);
      const [sx, sy, sz] = meta.size;
      const label = size.join("x");
      const high = ops.filter((o) => o.y > meta.roofBase);
      expect(high.length, label).toBeGreaterThan(0);
      for (const op of high) {
        // In plan: never outside the footprint. A steeple is a tower on the
        // building, not beside it.
        expect(op.x >= 0 && op.x < sx, `${label} x=${op.x}`).toBe(true);
        expect(op.z >= 0 && op.z < sz, `${label} z=${op.z}`).toBe(true);
      }
      // In height: the roof's own top, plus the flourish allowance, and not a
      // course more — and still inside the envelope's Y.
      const top = Math.max(...ops.map((o) => o.y));
      expect(top, label).toBeLessThanOrEqual(meta.roofTop + ROOF_FLOURISH_RISE);
      // The envelope's own Y, plus the one course of roof allowance the
      // grammar's ridge cap already takes. A steeple must not widen that.
      const plain = generateBuilding({
        size,
        params: { archetype: "cottage" },
        seed: SEED,
        style: PINNED,
      });
      const plainTop = Math.max(...plain.ops.map((o) => o.y));
      expect(top, label).toBeLessThanOrEqual(Math.max(plainTop, sy) + ROOF_FLOURISH_RISE);
    }
  });

  it("hangs a windmill's sails on the wall as a cross, within the apron", () => {
    for (const size of [
      [9, 14, 9],
      [11, 16, 11],
      [13, 18, 13],
    ] as const) {
      const { ops, meta } = build("windmill", size);
      const [sx, sy, sz] = meta.size;
      const label = size.join("x");
      const sails = ops.filter((o) => o.block.endsWith("_wool"));
      expect(sails.length, label).toBeGreaterThanOrEqual(8);
      // All in one plane, one block clear of the north wall — the apron ring
      // the eave and the window boxes already use, and no further out.
      const zs = new Set(sails.map((o) => o.z));
      expect([...zs], label).toEqual([-1]);
      for (const op of sails) {
        expect(op.x >= -1 && op.x <= sx, `${label} x=${op.x}`).toBe(true);
        expect(op.y, `${label} y=${op.y}`).toBeGreaterThan(0);
        expect(op.y, label).toBeLessThanOrEqual(meta.roofTop + ROOF_FLOURISH_RISE);
        expect(op.y, label).toBeLessThanOrEqual(sy);
      }
      // A cross: the arms share one row and one column with the axle.
      const cy = new Set(sails.map((o) => o.y));
      const cx = new Set(sails.map((o) => o.x));
      expect(cy.size, label).toBeGreaterThan(1);
      expect(cx.size, label).toBeGreaterThan(1);
      void zs;
    }
  });

  it("never puts a flourish on a building that is not asking for one", () => {
    for (const archetype of ["cottage", "hall", "inn", "library"]) {
      const { ops } = build(archetype);
      expect(ops.some((o) => o.block === "bell"), archetype).toBe(false);
      expect(ops.some((o) => o.z === -1 && o.block.endsWith("_wool")), archetype).toBe(false);
    }
  });
});

describe("upper floors", () => {
  const TWO_STOREY: readonly [number, number, number] = [13, 17, 15];

  it("furnishes the storey above the ground one", () => {
    for (const archetype of BUILDING_ARCHETYPES) {
      if (archetype === "watchtower") continue; // no storeys, only a shaft
      const { ops, meta } = build(archetype, TWO_STOREY, { floors: 2, floorHeight: 5 });
      expect(meta.params.floors).toBe(2);
      const level = meta.params.storyHeight;
      const props = ops.filter(
        (o) =>
          o.y === level + 1 &&
          o.x > meta.interior.x0 - 1 &&
          o.x < meta.interior.x1 + 1 &&
          o.z >= meta.interior.z0 &&
          o.z <= meta.interior.z1,
      );
      expect(props.length, `${archetype} upper props`).toBeGreaterThan(0);
    }
  });

  it("gives an inn beds upstairs, both halves of each", () => {
    const { ops, meta } = build("inn", TWO_STOREY, { floors: 2, floorHeight: 5 });
    const level = meta.params.storyHeight;
    const beds = ops.filter((o) => o.block.endsWith("_bed") && o.y === level + 1);
    expect(beds.length).toBeGreaterThanOrEqual(2);
    expect(beds.length % 2).toBe(0);
    const feet = beds.filter((o) => o.props?.part === "foot");
    const heads = beds.filter((o) => o.props?.part === "head");
    expect(feet).toHaveLength(heads.length);
    // Head at foot + facing, and the same facing on both — the pairing rule
    // the ground floor had to learn the hard way.
    for (const foot of feet) {
      const match = heads.find(
        (h) =>
          h.props?.facing === foot.props?.facing &&
          Math.abs(h.x - foot.x) + Math.abs(h.z - foot.z) === 1,
      );
      expect(match, `head for foot at ${foot.x},${foot.z}`).toBeDefined();
    }
  });

  it("keeps every upper storey walkable and the stair head reachable", () => {
    for (const archetype of BUILDING_ARCHETYPES) {
      if (archetype === "watchtower") continue;
      // A collapsed tower strips its own deck: the ladder that fed it lost its
      // backing wall to the crumble, and a deck no ladder reaches is exactly
      // the floating-disc defect the ruin law exists to prevent.
      if (archetype === "collapsed_tower") continue;
      for (const size of [TWO_STOREY, [11, 15, 13], [17, 19, 15]] as const) {
        const { ops, meta } = build(archetype, size, { floors: 2, floorHeight: 5 });
        const { interior } = meta;
        const level = meta.params.storyHeight;
        const label = `${archetype} ${size.join("x")}`;
        const floor = new Set(
          ops.filter((o) => o.y === level).map((o) => `${o.x},${o.z}`),
        );
        const taken = new Set(ops.filter((o) => o.y === level + 1).map((o) => `${o.x},${o.z}`));
        const free: string[] = [];
        for (let z = interior.z0; z <= interior.z1; z++) {
          for (let x = interior.x0; x <= interior.x1; x++) {
            const k = `${x},${z}`;
            if (!floor.has(k)) continue; // the stairwell: a hole, not a cell
            if (taken.has(k)) continue;
            free.push(k);
          }
        }
        expect(free.length, label).toBeGreaterThan(2);
        expect(oneRegion(free), label).toBe(true);

        // The landing — the floor cell touching the well — is never built on,
        // so the flight arrives somewhere a player can stand.
        const holes: string[] = [];
        for (let z = interior.z0; z <= interior.z1; z++) {
          for (let x = interior.x0; x <= interior.x1; x++) {
            if (!floor.has(`${x},${z}`)) holes.push(`${x},${z}`);
          }
        }
        expect(holes.length, `${label} stairwell`).toBeGreaterThan(0);
        const landings = new Set<string>();
        for (const hole of holes) {
          const [hx, hz] = hole.split(",").map(Number) as [number, number];
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const k = `${hx + dx},${hz + dz}`;
            if (floor.has(k)) landings.add(k);
          }
        }
        expect(landings.size, `${label} landings`).toBeGreaterThan(0);
        // The head of the flight: the floor cell one past the deepest cell of
        // the well, on the well's own column. That is where the climb ends,
        // and it is the one cell an upper-floor fit-out may never take. (Not
        // *every* landing — the rail along the well's open edge is core's own,
        // and is meant to be there.)
        const deepest = Math.max(
          ...holes.map((h) => Number((h.split(",")[1] as string))),
        );
        const head = `${interior.x0},${deepest + 1}`;
        expect(floor.has(head), `${label} stair head ${head} is floor`).toBe(true);
        expect(taken.has(head), `${label} stair head ${head} blocked`).toBe(false);
        expect(free, label).toContain(head);
      }
    }
  });

  it("puts nothing on a single-storey building's non-existent first floor", () => {
    const { ops, meta } = build("cottage", [11, 11, 11], { floors: 1, floorHeight: 5 });
    const level = meta.params.storyHeight;
    expect(meta.params.floors).toBe(1);
    const beds = ops.filter((o) => o.block.endsWith("_bed"));
    expect(beds.every((o) => o.y < level)).toBe(true);
  });
});

describe("facade tendencies", () => {
  it("gives each archetype a facade that suits it, in existing parameters", () => {
    expect(archetypeFacadeDefaults("church").windowShape).toBe("tall");
    expect(archetypeFacadeDefaults("warehouse").windowRhythm).toBe("sparse");
    expect(archetypeFacadeDefaults("market_stall").windowRhythm).toBe("dense");
    expect(archetypeFacadeDefaults("library").windowRhythm).toBe("paired");
    // Unknown archetypes get nothing rather than a guess.
    expect(archetypeFacadeDefaults("cottage")).toEqual({});
  });

  it("builds what the tendency asks for when a caller passes it through", () => {
    const facade = archetypeFacadeDefaults("church");
    const { meta } = build("church", [11, 17, 15], {
      floorHeight: 6,
      windowShape: facade.windowShape,
      windowRhythm: facade.windowRhythm,
      roof: facade.roof,
    });
    expect(meta.params.windowShape).toBe("tall");
    expect(meta.params.windowRhythm).toBe("regular");
    expect(meta.params.roof).toBe("gable");
    expect(meta.windowCount).toBeGreaterThan(0);
  });
});

describe("field-report fixes", () => {
  /** Which archetypes/sizes place a decorative pot at all. */
  const POT_CASES: readonly { archetype: string; floors: number }[] = [
    { archetype: "church", floors: 1 },
    { archetype: "church", floors: 2 },
    { archetype: "market_stall", floors: 1 },
    { archetype: "cottage", floors: 2 },
  ];

  it("never leaves a decorative pot empty", () => {
    // A bare `flower_pot` is an *empty* pot — in game it reads as a pot with
    // just dirt in it. Every pot this file places must be a `potted_*`.
    for (const { archetype, floors } of POT_CASES) {
      for (const size of [BIG, [9, 15, 11], [17, 15, 15]] as const) {
        const { ops } = build(archetype, size, { floors });
        expect(
          ops.filter((o) => o.block === "flower_pot"),
          `${archetype}/${floors}/${size.join("x")}`,
        ).toHaveLength(0);
      }
    }
  });

  it("places a potted plant at each known decoration site", () => {
    const seen = new Set<string>();
    for (const { archetype, floors } of POT_CASES) {
      const { ops } = build(archetype, BIG, { floors });
      const pots = ops.filter((o) => o.block.startsWith("potted_"));
      expect(pots.length, archetype).toBeGreaterThan(0);
      for (const p of pots) seen.add(p.block);
    }
    // The pick is position-derived, so a spread of buildings shows more than
    // one variant — proof it is not a hard-coded single plant.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("sits the congregation facing the altar, not away from it", () => {
    // A stair's `facing` is its high half — the backrest — so a seat's facing
    // points AWAY from what the sitter looks at. The lectern at the altar
    // looks back down the nave, so pew backrests and the lectern agree.
    for (const size of [BIG, [11, 15, 15], [9, 15, 13]] as const) {
      const { ops } = build("church", size, { floors: 2 });
      const lectern = ops.find((o) => o.block === "lectern" && o.y === 1);
      expect(lectern, size.join("x")).toBeDefined();
      const nave = (lectern as LocalVoxelOp).props?.facing;
      const stair = PINNED["stair.interior"] as string;
      const pews = ops.filter((o) => o.block === stair && o.props?.shape === "straight");
      expect(pews.length, size.join("x")).toBeGreaterThan(0);
      for (const pew of pews) {
        expect(pew.props?.facing, `pew at ${pew.x},${pew.y},${pew.z}`).toBe(nave);
      }
    }
  });

  it("sits the library reader facing the lectern", () => {
    const { ops } = build("library", BIG);
    const lectern = ops.find((o) => o.block === "lectern" && o.y === 1) as LocalVoxelOp;
    const stair = PINNED["stair.interior"] as string;
    // The reader's chair, not the staircase: the stair adjacent to the lectern.
    const chair = ops.find(
      (o) =>
        o.block === stair &&
        o.y === 1 &&
        Math.abs(o.x - lectern.x) + Math.abs(o.z - lectern.z) === 1,
    ) as LocalVoxelOp;
    expect(chair, "reader's chair beside the lectern").toBeDefined();
    // The chair stands beside the lectern and looks at it, so its backrest —
    // its `facing` — points the same way the lectern does (the lectern faces
    // the reader). Compared in the rotated frame, which is what ships.
    expect(Math.abs(chair.x - lectern.x) + Math.abs(chair.z - lectern.z)).toBe(1);
    expect(chair.props?.facing).toBe(lectern.props?.facing);
  });
});

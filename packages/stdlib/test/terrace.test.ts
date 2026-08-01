/**
 * The terrace grammar — the continuous street wall.
 *
 * The load-bearing test in this file is **the party wall**: a five-bay terrace
 * has six wall lines, not ten, and that is the difference between a street and
 * a row of boxes at zero spacing. Everything else is the discipline that keeps
 * the run readable — bay widths that vary, a cornice that snaps into long
 * horizontals with deliberate steps, one street door per bay, a blind back — and
 * the invariants every other emitter in this package is held to: same seed, same
 * ops; one op per cell; nothing outside the envelope plus its apron; every
 * enclosed floor cell reachable on foot.
 *
 * The walk is the same walk `compiler/src/emit/physics.ts` runs over a finished
 * world, via the shared helper. It starts from **every** street door, which is
 * the generalization the terrace forced on both: a party wall means no one door
 * reaches the whole building.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  MODERN_CITY_THEME,
  MODERN_CITY_THEME_ID,
  TERRACE_ARCHETYPES,
  TERRACE_MAX_CORNICE_RUN,
  TERRACE_MAX_PITCH,
  TERRACE_MIN_PITCH,
  archetypeOfTags,
  assignMaterials,
  generateBuilding,
  isTerraceArchetype,
  nodeSeed,
  pickTheme,
  planTerrace,
  resolveArchetype,
  snapCornice,
  streamSeed,
  structureById,
  terraceBayUse,
  type BuildingResult,
  type LocalVoxelOp,
  type TerraceBay,
} from "../src/index.js";

import { walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const STOREY = 4;

/** Five bays of varied width and height — the reference run. */
const FIVE: readonly TerraceBay[] = Object.freeze([
  { width: 8, floors: 4, archetype: "shop_row" },
  { width: 7, floors: 5, archetype: "apartment_block" },
  { width: 11, floors: 3, archetype: "office" },
  { width: 9, floors: 6, archetype: "shop_row" },
  { width: 6, floors: 6, archetype: "apartment_block" },
]);

function frontageOf(bays: readonly TerraceBay[]): number {
  return 1 + bays.reduce((sum, b) => sum + b.width, 0);
}

function build(
  bays: readonly TerraceBay[] | undefined,
  depth = 16,
  extra: Record<string, unknown> = {},
  path = "world.downtown.terrace_100_200",
): BuildingResult {
  const seed = nodeSeed(0x7e11n, path);
  const theme = pickTheme(seed, MODERN_CITY_THEME_ID);
  const materials = assignMaterials(theme, 1, seed)[0];
  const sx = bays === undefined ? 41 : frontageOf(bays);
  return generateBuilding({
    size: [sx, 48, depth],
    seed,
    materials,
    theme,
    params: {
      archetype: "terrace",
      floorHeight: STOREY,
      ...(bays === undefined ? { floors: 3 } : { bays }),
      ...extra,
    },
  });
}

/** One detached shell per bay, at the same interior width and depth. */
function detached(bays: readonly TerraceBay[], depth = 16): BuildingResult[] {
  return bays.map((bay, i) => {
    const seed = nodeSeed(0x7e11n, `world.downtown.detached_${i}`);
    const theme = pickTheme(seed, MODERN_CITY_THEME_ID);
    return generateBuilding({
      // A detached shell of the same *interior* needs two walls where a bay
      // needs one, so its envelope is the bay's pitch plus one.
      size: [bay.width + 1, bay.floors * STOREY + 6, depth],
      seed,
      materials: assignMaterials(theme, 1, seed)[0],
      params: { archetype: "shop_row", floors: 2, floorHeight: STOREY },
    });
  });
}

function key(ops: readonly LocalVoxelOp[]): string {
  return ops
    .map((o) => `${o.x},${o.y},${o.z}=${o.block}:${JSON.stringify(o.props ?? {})}`)
    .join("|");
}

/* -------------------------------------------------------------------------- */
/* registration                                                                */
/* -------------------------------------------------------------------------- */

describe("the terrace archetype", () => {
  it("registers, resolves and appears in the catalog", () => {
    for (const a of TERRACE_ARCHETYPES) {
      expect(BUILDING_ARCHETYPES as readonly string[]).toContain(a);
      expect(isTerraceArchetype(a)).toBe(true);
      expect(resolveArchetype(a)).toBe(a);
      const entry = structureById(a);
      expect(entry, `${a} is missing from the catalog`).toBeDefined();
      expect(entry?.status).toBe("implemented");
    }
    expect(isTerraceArchetype("cottage")).toBe(false);
  });

  it("steals no tag from the single house that already answers to them", () => {
    // `terrace` and `terraced_row` both belong to wave 4A's house with party
    // piers. The street wall is asked for by name, by the district fabric.
    expect(archetypeOfTags(["terrace"])).toBe("terraced_row");
    expect(archetypeOfTags(["terraced_row"])).toBe("terraced_row");
    expect(archetypeOfTags(["row"])).not.toBe("terrace");
  });

  it("maps a bay's archetype onto what its upper floors are for", () => {
    expect(terraceBayUse("shop_row")).toBe("retail");
    expect(terraceBayUse("apartment_block")).toBe("residential");
    expect(terraceBayUse("townhouse")).toBe("residential");
    expect(terraceBayUse("office")).toBe("office");
    expect(terraceBayUse("bank")).toBe("office");
    // Anything unrecognised is a shop, because the ground floor always is.
    expect(terraceBayUse("wildly_unknown")).toBe("retail");
  });
});

/* -------------------------------------------------------------------------- */
/* the party wall — the point of the file                                      */
/* -------------------------------------------------------------------------- */

describe("the party wall", () => {
  it("gives five bays six wall lines, not ten", () => {
    const { meta } = build(FIVE);
    const plan = meta.terraceBays;
    expect(plan, "a terrace reports its bays").toBeDefined();
    const bays = plan as NonNullable<typeof plan>;
    expect(bays).toHaveLength(5);
    const lines = new Set<number>();
    for (const bay of bays) {
      lines.add(bay.wall0);
      lines.add(bay.wall1);
    }
    expect([...lines].sort((a, b) => a - b)).toHaveLength(6);
    // ...and every one of them is a shared column: bay k's high wall is bay
    // k+1's low wall, by identity rather than by adjacency.
    for (let i = 1; i < bays.length; i++) {
      expect((bays[i] as (typeof bays)[number]).wall0).toBe(
        (bays[i - 1] as (typeof bays)[number]).wall1,
      );
    }
  });

  it("builds meaningfully fewer wall columns than five detached shells", () => {
    const terrace = build(FIVE);
    const shells = detached(FIVE);
    const sx = frontageOf(FIVE);

    // Every column of the terrace's rear row is built (it is one wall), so the
    // comparison that means something is the number of *cross* walls: columns
    // that are solid masonry from the ground floor to the top of the shortest
    // bay, all the way through the plan. In the terrace that is the six wall
    // lines; in five shells it is ten side walls.
    const solidThrough = (r: BuildingResult, width: number, depth: number): number => {
      const at = new Set(r.ops.map((o) => `${o.x},${o.y},${o.z}`));
      let n = 0;
      for (let x = 0; x < width; x++) {
        let solid = true;
        for (let z = 0; z < depth && solid; z++) {
          for (let y = 1; y <= STOREY && solid; y++) {
            if (!at.has(`${x},${y},${z}`)) solid = false;
          }
        }
        if (solid) n++;
      }
      return n;
    };
    const terraceLines = solidThrough(terrace, sx, 16);
    const shellLines = shells.reduce(
      (sum, s, i) => sum + solidThrough(s, (FIVE[i] as TerraceBay).width + 1, 16),
      0,
    );
    expect(terraceLines).toBe(6);
    expect(shellLines).toBeGreaterThanOrEqual(10);
    expect(terraceLines).toBeLessThan(shellLines * 0.7);
  });

  it("carries every wall line above the roofline as a fire-wall upstand", () => {
    const { ops, meta } = build(FIVE);
    const bays = meta.terraceBays as NonNullable<typeof meta.terraceBays>;
    const at = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
    for (const bay of bays) {
      const eave = bay.floors * STOREY;
      // The wall line stands at least one course over its own bay's eave.
      expect(at.has(`${bay.wall0},${eave + 2},0`), `upstand at x=${bay.wall0}`).toBe(true);
      expect(at.has(`${bay.wall1},${eave + 2},0`), `upstand at x=${bay.wall1}`).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the bays                                                                    */
/* -------------------------------------------------------------------------- */

describe("bay rhythm", () => {
  it("keeps every pitch in the six-to-twelve range, drawn or declared", () => {
    for (const sx of [19, 25, 33, 41, 47, 61]) {
      const plan = planTerrace({
        sx,
        storeyHeight: STOREY,
        floors: 3,
        stream: streamSeed(nodeSeed(0x7e11n, `world.t${sx}`), "terrace"),
      });
      expect(plan.bays.length, `sx=${sx}`).toBeGreaterThanOrEqual(2);
      for (const bay of plan.bays) {
        const pitch = bay.wall1 - bay.wall0;
        expect(pitch, `sx=${sx} pitch`).toBeGreaterThanOrEqual(TERRACE_MIN_PITCH);
        expect(pitch, `sx=${sx} pitch`).toBeLessThanOrEqual(TERRACE_MAX_PITCH);
      }
      // The walls span the whole frontage, exactly.
      expect(plan.walls[0]).toBe(0);
      expect(plan.walls[plan.walls.length - 1]).toBe(sx - 1);
    }
  });

  it("varies the pitch rather than repeating one width", () => {
    // Over a long frontage the drawn pitches have to be more than one number,
    // or the run is a comb.
    const plan = planTerrace({
      sx: 85,
      storeyHeight: STOREY,
      floors: 4,
      stream: streamSeed(nodeSeed(0x7e11n, "world.long"), "terrace"),
    });
    const pitches = new Set(plan.bays.map((b) => b.wall1 - b.wall0));
    expect(plan.bays.length).toBeGreaterThanOrEqual(7);
    expect(pitches.size).toBeGreaterThanOrEqual(3);
  });

  it("reproduces a declared bay list exactly, so the two planners agree", () => {
    // The district plans the frontage once and hands the widths over as params;
    // the grammar re-plans from them. If those two disagreed, the door ports
    // the district declared would miss the doors the grammar built.
    const plan = planTerrace({
      sx: frontageOf(FIVE),
      storeyHeight: STOREY,
      bays: FIVE,
      floors: 3,
      stream: streamSeed(nodeSeed(0x7e11n, "world.t"), "terrace"),
    });
    expect(plan.bays.map((b) => b.wall1 - b.wall0)).toEqual(FIVE.map((b) => b.width));
  });
});

/* -------------------------------------------------------------------------- */
/* the cornice                                                                 */
/* -------------------------------------------------------------------------- */

describe("the cornice discipline", () => {
  it("snaps neighbours within one storey onto the same line", () => {
    expect(snapCornice([4, 5, 3, 6, 6])).toEqual([4, 4, 4, 6, 6]);
    expect(snapCornice([2, 2, 2])).toEqual([2, 2, 2]);
    // A jump of two is a step, and the step is kept.
    expect(snapCornice([3, 6])).toEqual([3, 6]);
    // Every height it emits is a height some bay asked for.
    for (const want of [
      [1, 2, 3, 4, 5, 6, 7, 8],
      [8, 1, 8, 1],
      [5, 4, 5, 4, 5, 4, 5, 4, 5],
    ]) {
      for (const got of snapCornice(want)) expect(want).toContain(got);
    }
  });

  it("steps rather than drifting: the anchor is the line, not the neighbour", () => {
    // A staircase of asks does not become a staircase of buildings. Each bay is
    // compared with the *line it is standing in*, so a run that climbs one
    // storey at a time comes out as pairs of long horizontals with real steps
    // between them, which is what a street looks like.
    expect(snapCornice([3, 4, 5, 6, 7, 8, 8, 8, 8])).toEqual([3, 3, 5, 5, 7, 7, 7, 7, 8]);
    // The last entry is the cap doing its job: four bays had already taken the
    // seven line, so the fifth re-anchors instead of extending it further.
    const nine = snapCornice([3, 4, 5, 6, 7, 8, 8, 8, 8]);
    expect(nine.slice(4, 4 + TERRACE_MAX_CORNICE_RUN)).toEqual([7, 7, 7, 7]);
  });

  it("never invents a step the heights did not ask for", () => {
    // The cap breaks the *chain*, not the line: where every bay wants the same
    // height, re-anchoring lands on that height again.
    expect(snapCornice([5, 5, 5, 5, 5, 5, 5])).toEqual([5, 5, 5, 5, 5, 5, 5]);
    expect(snapCornice([2, 2, 2, 2, 2, 2, 2, 2, 2, 2])).toEqual(Array(10).fill(2));
  });

  it("builds the snapped height, not the asked one", () => {
    const { meta } = build(FIVE);
    const bays = meta.terraceBays as NonNullable<typeof meta.terraceBays>;
    expect(bays.map((b) => b.asked)).toEqual([4, 5, 3, 6, 6]);
    expect(bays.map((b) => b.floors)).toEqual([4, 4, 4, 6, 6]);
    expect(meta.params.floors).toBe(6);
    expect(meta.wallTop).toBe(6 * STOREY);
  });

  it("reports one floor-cell set per storey, so short bays keep their roofs", () => {
    const { meta } = build(FIVE);
    const byLevel = meta.floorCellsByLevel as NonNullable<typeof meta.floorCellsByLevel>;
    expect(byLevel).toBeDefined();
    expect(byLevel).toHaveLength(meta.floorLevels.length);
    // Four storeys of everything, then only the two six-storey bays.
    expect(byLevel[0]?.length).toBe(meta.floorCells.length);
    expect(byLevel[3]?.length).toBe(meta.floorCells.length);
    expect(byLevel[4]?.length).toBeLessThan(meta.floorCells.length);
    expect(byLevel[4]?.length).toBe(byLevel[5]?.length);
    expect(byLevel[5]?.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* the ground floor                                                            */
/* -------------------------------------------------------------------------- */

describe("the ground-floor band", () => {
  it("puts exactly one street door in every bay, on the street face", () => {
    const { ops, meta } = build(FIVE);
    const bays = meta.terraceBays as NonNullable<typeof meta.terraceBays>;
    const doors = meta.doors as NonNullable<typeof meta.doors>;
    const front = 16 - 1;
    expect(doors).toHaveLength(bays.length);
    for (const [i, bay] of bays.entries()) {
      const door = doors[i] as (typeof doors)[number];
      expect(door.z, `bay ${i} door is on the street face`).toBe(front);
      expect(door.face).toBe("south");
      expect(door.x, `bay ${i} door is inside bay ${i}`).toBeGreaterThanOrEqual(bay.x0);
      expect(door.x).toBeLessThanOrEqual(bay.x1);
      expect(door.x).toBe(bay.doorX);
    }
    // ...and nothing else in the building is a door. Counted off the ops, not
    // off the metadata, so the two cannot drift apart.
    const leaves = ops.filter((o) => o.block.endsWith("_door"));
    expect(leaves).toHaveLength(bays.length * 2);
    for (const leaf of leaves) expect(leaf.z).toBe(front);
    const lower = leaves.filter((o) => o.props?.["half"] === "lower");
    expect(lower).toHaveLength(bays.length);
    expect(new Set(lower.map((o) => o.x)).size).toBe(bays.length);
    // Every leaf is paired, which is what the door.half_mismatch rule asks.
    for (const l of lower) {
      expect(
        leaves.some((o) => o.x === l.x && o.z === l.z && o.y === l.y + 1 && o.props?.["half"] === "upper"),
        `upper half over ${l.x},${l.z}`,
      ).toBe(true);
    }
  });

  it("runs one unbroken awning course the length of the run, in the apron", () => {
    const { ops } = build(FIVE);
    const sx = frontageOf(FIVE);
    const awning = ops.filter((o) => o.z === 16 && o.y === STOREY - 1);
    expect(awning).toHaveLength(sx);
    expect(new Set(awning.map((o) => o.x)).size).toBe(sx);
    // A slab, so a pedestrian sees the shopfront under it.
    for (const op of awning) expect(op.block.endsWith("_slab")).toBe(true);
  });

  it("glazes the shopfront and leaves a stall riser under it", () => {
    const { ops, meta } = build(FIVE);
    const bays = meta.terraceBays as NonNullable<typeof meta.terraceBays>;
    const front = 16 - 1;
    const at = new Map(ops.map((o) => [`${o.x},${o.y},${o.z}`, o]));
    for (const bay of bays) {
      for (let x = bay.x0; x <= bay.x1; x++) {
        if (x === bay.doorX) continue;
        expect(at.get(`${x},2,${front}`)?.block, `glazing at ${x}`).toMatch(/glass/);
        expect(at.get(`${x},1,${front}`)?.block, `riser at ${x}`).not.toMatch(/glass/);
        expect(at.get(`${x},1,${front}`), `riser at ${x}`).toBeDefined();
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the back, and the block interior                                            */
/* -------------------------------------------------------------------------- */

describe("the rear elevation", () => {
  it("is blind: small windows, no doors, and no way through", () => {
    const { ops, meta } = build(FIVE);
    const bays = meta.terraceBays as NonNullable<typeof meta.terraceBays>;
    const rear = ops.filter((o) => o.z === 0);
    expect(rear.some((o) => o.block.endsWith("_door"))).toBe(false);
    const lights = rear.filter((o) => o.block.includes("glass"));
    // One small light per bay per storey, and no more than that.
    const storeys = bays.reduce((sum, b) => sum + b.floors, 0);
    expect(lights).toHaveLength(storeys);
  });

  it("leaves the block interior behind it alone", () => {
    // The courtyard is negative space. Nothing this grammar emits reaches past
    // the rear wall's own apron ring, in either direction.
    const { ops } = build(FIVE);
    const sx = frontageOf(FIVE);
    for (const op of ops) {
      expect(op.x, "west of the apron").toBeGreaterThanOrEqual(-1);
      expect(op.x, "east of the apron").toBeLessThanOrEqual(sx);
      expect(op.z, "behind the rear apron").toBeGreaterThanOrEqual(-1);
      expect(op.z, "in front of the street apron").toBeLessThanOrEqual(16);
    }
    // ...and in fact the rear apron is empty: the cornice and the awning are
    // both on the street.
    expect(ops.some((o) => o.z === -1)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* the corner unit                                                             */
/* -------------------------------------------------------------------------- */

describe("the corner unit", () => {
  it("stands its end bay above the roofline and lights the corner", () => {
    const plain = build(FIVE);
    const corner = build(FIVE, 16, { cornerEnd: true });
    expect(corner.meta.roofTop).toBeGreaterThan(plain.meta.roofTop);
    const bays = corner.meta.terraceBays as NonNullable<typeof corner.meta.terraceBays>;
    expect((bays[bays.length - 1] as (typeof bays)[number]).corner).toBe(true);
    expect((bays[0] as (typeof bays)[number]).corner).toBe(false);
    // A lamp on the finial, standing on something solid.
    const sx = frontageOf(FIVE);
    const at = new Set(corner.ops.map((o) => `${o.x},${o.y},${o.z}`));
    const finials = corner.ops.filter(
      (o) => o.block.endsWith("lantern") && o.x === sx - 1 && o.y > corner.meta.wallTop,
    );
    expect(finials.length).toBeGreaterThan(0);
    for (const lamp of finials) expect(at.has(`${lamp.x},${lamp.y - 1},${lamp.z}`)).toBe(true);
  });

  it("gives a corner bay an end elevation and every other end a blank wall", () => {
    const sx = frontageOf(FIVE);
    const plain = build(FIVE);
    const corner = build(FIVE, 16, { cornerEnd: true });
    const endGlass = (r: BuildingResult): number =>
      r.ops.filter((o) => o.x === sx - 1 && o.block.includes("glass")).length;
    expect(endGlass(plain)).toBe(0);
    expect(endGlass(corner)).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* variety                                                                     */
/* -------------------------------------------------------------------------- */

describe("per-bay variety", () => {
  it("clads the bays in more than one facade from the same theme", () => {
    const { ops, meta } = build(FIVE);
    const bays = meta.terraceBays as NonNullable<typeof meta.terraceBays>;
    const at = new Map(ops.map((o) => [`${o.x},${o.y},${o.z}`, o]));
    // The spandrel course of the first upper storey: wall, in the bay's own
    // facade material, on every bay that has an upper storey.
    const faces = new Set<string>();
    for (const bay of bays) {
      if (bay.floors < 2) continue;
      const block = at.get(`${bay.x0},${STOREY + 1},${16 - 1}`)?.block;
      if (block !== undefined) faces.add(block);
    }
    expect(faces.size, `facades: ${[...faces].join(", ")}`).toBeGreaterThan(1);
    // ...and every one of them is in the theme it was dealt.
    const palette = new Set(MODERN_CITY_THEME.woods.map((w) => w.planks));
    for (const face of faces) expect(palette.has(face), face).toBe(true);
  });

  it("varies the parapet profile, so the roofline is not one moulding", () => {
    const profiles = new Set<string>();
    for (const sx of [41, 55, 73, 85]) {
      const plan = planTerrace({
        sx,
        storeyHeight: STOREY,
        floors: 4,
        stream: streamSeed(nodeSeed(0x7e11n, `world.p${sx}`), "terrace"),
      });
      for (const bay of plan.bays) profiles.add(bay.parapet);
    }
    expect(profiles.size).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/* the invariants every emitter is held to                                     */
/* -------------------------------------------------------------------------- */

describe("terrace invariants", () => {
  const CASES: readonly { label: string; bays?: readonly TerraceBay[]; depth: number }[] = [
    { label: "five bays", bays: FIVE, depth: 16 },
    { label: "two bays", bays: [{ width: 9, floors: 3 }, { width: 7, floors: 3 }], depth: 12 },
    { label: "one wide bay", bays: [{ width: 12, floors: 2 }], depth: 11 },
    { label: "eight bays, tall", bays: Array.from({ length: 8 }, (_, i) => ({ width: 6 + (i % 5), floors: 5 + (i % 3) })), depth: 16 },
    { label: "drawn bays", depth: 14 },
    { label: "shallow", bays: [{ width: 8, floors: 2 }, { width: 8, floors: 2 }], depth: 9 },
  ];

  it("is deterministic: the same request twice is the same op list", () => {
    for (const c of CASES) {
      const a = build(c.bays, c.depth);
      const b = build(c.bays, c.depth);
      expect(key(a.ops), c.label).toBe(key(b.ops));
    }
  });

  it("depends on where the run starts, not on when it was built", () => {
    // Two terraces of identical shape at two node paths are two different
    // streets; the same node path is the same street, forever.
    const here = build(FIVE, 16, {}, "world.downtown.terrace_100_200");
    const again = build(FIVE, 16, {}, "world.downtown.terrace_100_200");
    const elsewhere = build(FIVE, 16, {}, "world.downtown.terrace_260_44");
    expect(key(here.ops)).toBe(key(again.ops));
    expect(key(here.ops)).not.toBe(key(elsewhere.ops));
  });

  it("emits one op per cell, in the canonical order", () => {
    for (const c of CASES) {
      const { ops } = build(c.bays, c.depth);
      const keys = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
      expect(keys.size, c.label).toBe(ops.length);
      for (let i = 1; i < ops.length; i++) {
        const p = ops[i - 1] as LocalVoxelOp;
        const q = ops[i] as LocalVoxelOp;
        expect(p.y < q.y || (p.y === q.y && (p.z < q.z || (p.z === q.z && p.x < q.x))), c.label).toBe(true);
      }
    }
  });

  it("stays inside the envelope and its one-block apron", () => {
    for (const c of CASES) {
      const sx = c.bays === undefined ? 41 : frontageOf(c.bays);
      const { ops } = build(c.bays, c.depth);
      for (const op of ops) {
        expect(op.x, c.label).toBeGreaterThanOrEqual(-1);
        expect(op.x, c.label).toBeLessThanOrEqual(sx);
        expect(op.z, c.label).toBeGreaterThanOrEqual(-1);
        expect(op.z, c.label).toBeLessThanOrEqual(c.depth);
      }
    }
  });

  it("hangs every lantern from something and stands every one on something", () => {
    for (const c of CASES) {
      const { ops } = build(c.bays, c.depth);
      const at = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
      for (const op of ops) {
        if (!op.block.endsWith("lantern")) continue;
        const above = op.props?.["hanging"] === "true";
        const anchor = above ? `${op.x},${op.y + 1},${op.z}` : `${op.x},${op.y - 1},${op.z}`;
        expect(at.has(anchor), `${c.label}: lantern at ${op.x},${op.y},${op.z}`).toBe(true);
      }
      // A wall torch brackets to the block behind it, which `facing: east`
      // names as the cell one step west.
      for (const op of ops) {
        if (op.block !== "wall_torch") continue;
        expect(at.has(`${op.x - 1},${op.y},${op.z}`), `${c.label}: torch backing`).toBe(true);
      }
    }
  });

  it("lights and furnishes every bay", () => {
    for (const c of CASES) {
      const { meta } = build(c.bays, c.depth);
      const bays = meta.terraceBays as NonNullable<typeof meta.terraceBays>;
      const storeys = bays.reduce((sum, b) => sum + b.floors, 0);
      // One light per bay per storey, before the corner finials.
      expect(meta.lanternCount, c.label).toBeGreaterThanOrEqual(storeys);
      expect(meta.furnitureCount, c.label).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the walk                                                                    */
/* -------------------------------------------------------------------------- */

describe("walkability", () => {
  it("reaches every ground-floor cell of every bay, from the bays' own doors", () => {
    for (const c of [
      { label: "five bays", bays: FIVE, depth: 16 },
      { label: "eight bays", bays: Array.from({ length: 8 }, (_, i) => ({ width: 6 + (i % 5), floors: 4 + (i % 3) })), depth: 16 },
      { label: "shallow", bays: [{ width: 8, floors: 2 }, { width: 8, floors: 2 }], depth: 9 },
    ] as const) {
      const result = build(c.bays, c.depth);
      const report = walkabilityReport(result);
      expect(report.start, `${c.label}: a way in`).not.toBeNull();
      expect(report.pocket, `${c.label}\n${report.map}`).toEqual([]);
      expect(report.reachable.length).toBeGreaterThan(20);
    }
  });

  it("reaches every upper storey a bay actually has, by its own stairs", () => {
    // Exactly the physics lint's shape: one flood from the ground-floor doors,
    // then each storey's *own* floor columns checked against it. Restricting
    // the cells per storey is not a softening — above a short bay's eave those
    // columns are its roof, and demanding a walking route onto a roof is what
    // `floorCellsByLevel` exists to stop.
    const result = build(FIVE);
    const byLevel = result.meta.floorCellsByLevel as NonNullable<
      typeof result.meta.floorCellsByLevel
    >;
    let checked = 0;
    for (const [i, level] of result.meta.floorLevels.entries()) {
      if (level === 0) continue;
      const rows = new Set(
        (byLevel[i] as (typeof byLevel)[number]).map((c) => `${c.x},${c.z}`),
      );
      const report = walkabilityReport(result, { level, startLevel: 0 });
      const stranded = report.pocket.filter((cell) => rows.has(cell));
      expect(stranded, `level ${level}\n${report.map}`).toEqual([]);
      const reached = report.reachable.filter((cell) => rows.has(cell));
      expect(reached.length, `level ${level}: somewhere to stand`).toBeGreaterThan(4);
      checked++;
    }
    expect(checked, "every upper storey was actually visited").toBe(5);
  });
});

/**
 * Smoke test for `terrainist devworld`.
 *
 * The dev world exists to be *looked at*, which makes it exactly the kind of
 * artefact that rots silently: nobody notices that the granary row stopped
 * emitting until they happen to open the render. These are the cheap
 * structural claims that catch that — the grid is the grid it says it is, the
 * world it writes is a real world, and the two invariants a building pass has
 * historically broken (unstable fluids, floating lanterns) still hold.
 */

import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  BASE_ARCHETYPE_ROWS,
  BUILDING_ARCHETYPES_ROWS,
  DEV_GAP,
  DEV_GROUND_Y,
  DEV_ROW_LENGTH,
  DEV_THEMES,
  buildDevWorld,
  planDevGrid,
  type DevWorldResult,
} from "../src/devworld.js";
import {
  BREAKPOINT_EXHIBIT_ROWS,
  CONTEXT_YAWS,
  EXTRA_EXHIBIT_ROWS,
  UNDERGROUND_EXHIBIT_ROWS,
  PROP_EXHIBIT_PLAN,
  SEED_SWEEP_LENGTH,
  SEED_SWEEP_ROW_LABEL,
  SLOPE_POSITIONS,
  SLOPE_RISE,
  SLOPE_RUN,
  contextFootprint,
  contextGroundAt,
  planContextSection,
} from "../src/devworld-rows.js";
import {
  BLITZ_BUILDING_ARCHETYPES,
  EXTENDED_BUILDING_ARCHETYPES,
  VERNACULAR_BUILDING_ARCHETYPES,
} from "@terrainist/stdlib";

import { ARCHETYPE_ROW_LENGTH } from "../src/exhibits/archetypes.js";
import { BLITZ_ROW_LENGTH } from "../src/exhibits/blitz.js";
import { HIGHRISE_EXHIBIT_ROWS, HIGHRISE_ROW_LENGTH } from "../src/exhibits/highrise.js";
import { TOWN_EXHIBIT_ROWS } from "../src/exhibits/town.js";
import { VERNACULAR_ROW_LENGTH } from "../src/exhibits/vernacular.js";
import { exactRoofHeight, STAIR_MIN_DEPTH } from "../src/exhibits/breakpoints.js";
import {
  MAX_BASEMENT_DEPTH,
  MAX_FLOORS,
  MAX_ROOF_LAYERS,
  MAX_STORY_HEIGHT,
  MIN_BASEMENT_DEPTH,
  MIN_STORY_HEIGHT,
} from "@terrainist/stdlib";

const scratch: string[] = [];
let result: DevWorldResult;
let worldDir: string;

beforeAll(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "terrainist-devworld-"));
  scratch.push(root);
  result = await buildDevWorld(root);
  worldDir = result.emit.worldDir;
}, 300_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("dev world grid", () => {
  it("lays out the base rows, the roof control row, and every registered extra", () => {
    const grid = planDevGrid();
    const rows = [...new Set(grid.exhibits.map((e) => e.row))];
    expect(rows).toEqual([
      ...BASE_ARCHETYPE_ROWS,
      "roofs",
      ...EXTRA_EXHIBIT_ROWS.map((r) => r.row),
    ]);
    for (const row of BASE_ARCHETYPE_ROWS) {
      expect(grid.exhibits.filter((e) => e.row === row)).toHaveLength(DEV_ROW_LENGTH);
    }
    // Every archetype the grammar knows appears somewhere, once: the base grid
    // carries the original six and the extended rows carry the other seven.
    for (const archetype of BUILDING_ARCHETYPES_ROWS) {
      expect(grid.exhibits.some((e) => e.row === archetype), archetype).toBe(true);
    }
    // The L and the T, on every side and under every roof shape.
    for (const label of ["footprint_l", "footprint_t"]) {
      const cells = grid.exhibits.filter((e) => e.row === label);
      expect(cells.length, label).toBe(7);
      expect(cells.every((c) => c.params?.["wing"] !== undefined), label).toBe(true);
    }
    // The control row is every roof against every theme, and nothing else
    // varies across it.
    const roofs = grid.exhibits.filter((e) => e.row === "roofs");
    expect(roofs).toHaveLength(3 * DEV_THEMES.length);
    expect(new Set(roofs.map((e) => e.size.join("x"))).size).toBe(1);
    expect(new Set(roofs.map((e) => e.floors)).size).toBe(1);
  });

  it("gives the grid the count the brief asks for", () => {
    // Derived, never listed: the base rows plus the roof control row plus
    // whatever the exhibit seam registered. The bound therefore moves on its
    // own when the grammar grows a new archetype or a track adds a row, which
    // is the point of building the grid out of `BUILDING_ARCHETYPES` and
    // `EXTRA_EXHIBIT_ROWS` rather than out of a literal.
    const extra = EXTRA_EXHIBIT_ROWS.reduce((sum, r) => sum + r.cells.length, 0);
    const breakpoints = BREAKPOINT_EXHIBIT_ROWS.reduce((sum, r) => sum + r.cells.length, 0);
    const tall = HIGHRISE_EXHIBIT_ROWS.length * HIGHRISE_ROW_LENGTH;
    const underground = UNDERGROUND_EXHIBIT_ROWS.reduce((sum, r) => sum + r.cells.length, 0);
    const town = TOWN_EXHIBIT_ROWS.reduce((sum, r) => sum + r.cells.length, 0);
    expect(extra).toBe(
      EXTENDED_BUILDING_ARCHETYPES.length * ARCHETYPE_ROW_LENGTH +
        BLITZ_BUILDING_ARCHETYPES.length * BLITZ_ROW_LENGTH +
        VERNACULAR_BUILDING_ARCHETYPES.length * VERNACULAR_ROW_LENGTH +
        tall +
        2 * 7 +
        SEED_SWEEP_LENGTH +
        breakpoints +
        underground +
        town,
    );
    const grid = planDevGrid();
    const expected = BASE_ARCHETYPE_ROWS.length * DEV_ROW_LENGTH + 3 * DEV_THEMES.length + extra;
    expect(grid.exhibits).toHaveLength(expected);
    // The context section's cells are buildings too, and are counted with the
    // grid's — the derivation is what keeps this honest when a strip grows.
    expect(result.buildingCount).toBe(expected + grid.context.cells.length);
    expect(result.buildings).toHaveLength(expected + grid.context.cells.length);
  });

  it("walks the gradient: size grows, storeys step, themes cycle", () => {
    const grid = planDevGrid();
    for (const row of BASE_ARCHETYPE_ROWS) {
      const cells = grid.exhibits.filter((e) => e.row === row).sort((a, b) => a.column - b.column);
      const first = cells[0] as (typeof cells)[number];
      const last = cells[cells.length - 1] as (typeof cells)[number];
      expect(last.size[0]).toBeGreaterThan(first.size[0]);
      expect(new Set(cells.map((c) => c.theme))).toEqual(new Set(DEV_THEMES));
      expect(new Set(cells.map((c) => c.roof)).size).toBeGreaterThan(1);
    }
  });

  it("leaves a clear gap between every pair of neighbours in a row", () => {
    const grid = planDevGrid();
    // Every row, not just the base ones: a row registered through the exhibit
    // seam is laid out by the same loop and has to obey the same rule, and the
    // rows most likely to break it are exactly the new ones.
    const rows = [...new Set(grid.exhibits.map((e) => e.row))];
    for (const row of rows) {
      const cells = grid.exhibits.filter((e) => e.row === row).sort((a, b) => a.column - b.column);
      for (let i = 1; i < cells.length; i++) {
        const prev = cells[i - 1] as (typeof cells)[number];
        const here = cells[i] as (typeof cells)[number];
        expect(here.x - (prev.x + (prev.size[0] as number))).toBe(DEV_GAP);
      }
    }
  });

  it("no two exhibits overlap — the context section's cells included", () => {
    const grid = planDevGrid();
    const boxes = [
      ...grid.exhibits.map((e) => ({
        x0: e.x,
        z0: e.z,
        x1: e.x + (e.size[0] as number) - 1,
        z1: e.z + (e.size[2] as number) - 1,
      })),
      // On its *rotated* extents: a yaw-90 cell claims a different rectangle
      // from the envelope the row was laid out against.
      ...grid.context.cells.map((c) => contextFootprint(c)),
    ];
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const p = boxes[a] as (typeof boxes)[number];
        const q = boxes[b] as (typeof boxes)[number];
        const overlaps = p.x0 <= q.x1 && q.x0 <= p.x1 && p.z0 <= q.z1 && q.z0 <= p.z1;
        expect(overlaps, `exhibits ${a} and ${b} overlap`).toBe(false);
      }
    }
  });

  it("spawns at the grid's south-west corner, on the plain", () => {
    const grid = planDevGrid();
    expect(grid.spawn[1]).toBe(DEV_GROUND_Y + 1);
    expect(grid.spawn[0]).toBeLessThan(Math.min(...grid.exhibits.map((e) => e.x)));
    expect(grid.spawn[2]).toBeGreaterThan(Math.max(...grid.exhibits.map((e) => e.z)));
  });
});

describe("dev world build", () => {
  it("writes a real world folder", async () => {
    expect((await stat(path.join(worldDir, "level.dat"))).isFile()).toBe(true);
    const regions = (await readdir(path.join(worldDir, "region"))).filter((f) => f.endsWith(".mca"));
    expect(regions.length).toBeGreaterThan(0);
    expect(result.emit.chunkCount).toBeGreaterThan(0);
    expect(result.emit.minecraftVersion).toBe(EMIT_MINECRAFT_VERSION);
  });

  it("emits a body of blocks for every exhibit, doors and lanterns included", () => {
    for (const b of result.buildings) {
      expect(b.blockCount, b.nodePath).toBeGreaterThan(100);
      expect(b.meta.door, b.nodePath).not.toBeNull();
      expect(b.meta.lanternCount, b.nodePath).toBeGreaterThanOrEqual(1);
    }
    // Every archetype lights itself: the grid is meant to be readable at night.
    expect(result.lightCount).toBeGreaterThanOrEqual(result.buildingCount);
  });

  it("has no unstable fluid — the harbour basin included", () => {
    // The plain itself is dry; the one body of water in the world is the
    // harbour row's basin, and it is a plain box whose every column sits a
    // block below its dry neighbours. If it were not, this is where it would
    // show up.
    expect(result.pondColumns).toBeGreaterThan(0);
    expect(result.fluids.unstable).toBe(0);
    expect(result.fluids.samples).toEqual([]);
  });

  it("builds every prop in the catalog, in its own row", () => {
    const planned = PROP_EXHIBIT_PLAN.reduce((sum, r) => sum + r.cells.length, 0);
    expect(result.props).toHaveLength(planned);
    // Every cell found a site: a prop grid with a hole in it is a prop grid
    // that is not showing you the prop you came to look at. The context
    // section's own props (the shore pier) are counted with them.
    const contextProps = result.grid.context.strips.reduce((sum, s) => sum + s.props.length, 0);
    expect(contextProps).toBeGreaterThan(0);
    expect(result.propCount).toBe(planned + contextProps);
  });

  it("supports every lantern — none hangs in mid-air", () => {
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    // Read the emitted block list rather than the world: the invariant is about
    // what the grammar placed, and a world round-trip would only put a decode
    // step between the defect and the assertion.
    const byPos = new Map<string, number>();
    for (const block of result.blocks) byPos.set(`${block.x},${block.y},${block.z}`, block.stateId);

    const lanternIds = new Set(
      ["lantern", "soul_lantern"]
        .map((n) => stack.blockByName(n)?.stateId)
        .filter((id): id is number => id !== undefined),
    );
    let lamps = 0;
    const unsupported: string[] = [];
    for (const [key, id] of byPos) {
      if (!lanternIds.has(id)) continue;
      lamps++;
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      const below = byPos.get(`${x},${y - 1},${z}`);
      const above = byPos.get(`${x},${y + 1},${z}`);
      // Standing on something, hanging from something, or resting on the
      // plain itself — anything else is a light floating over grass.
      const onPlain = y === DEV_GROUND_Y + 1;
      if (below === undefined && above === undefined && !onPlain) unsupported.push(key);
    }
    expect(lamps).toBeGreaterThan(20);
    expect(unsupported).toEqual([]);
  });

  it("is deterministic: the same grid and the same block count twice", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-devworld-b-"));
    scratch.push(root);
    const again = await buildDevWorld(root);
    expect(again.emit.blockCount).toBe(result.emit.blockCount);
    expect(again.emit.structureBlockCount).toBe(result.emit.structureBlockCount);
    expect(again.lightCount).toBe(result.lightCount);
    expect(again.buildings.map((b) => b.blockCount)).toEqual(result.buildings.map((b) => b.blockCount));
    expect(again.propCount).toBe(result.propCount);
    expect(again.pondColumns).toBe(result.pondColumns);
    // The context section is the one part of the world with derived ground, a
    // derived foundation elevation per cell and a pass (doorsteps) that mutates
    // the plan while reading it. Every one of those is a place a run could
    // disagree with itself, so the determinism claim names them.
    expect([...again.contextResult.foundations]).toEqual([...result.contextResult.foundations]);
    expect(again.contextResult.doorsteps.stepped).toBe(result.contextResult.doorsteps.stepped);
    expect(again.contextResult.doorsteps.dropped).toBe(result.contextResult.doorsteps.dropped);
    expect(again.contextResult.blocks.length).toBe(result.contextResult.blocks.length);
    expect(again.contextResult.padded).toEqual(result.contextResult.padded);
  }, 300_000);
});

/* -------------------------------------------------------------------------- */

describe("the seed-sweep row", () => {
  const cells = (): ReturnType<typeof planDevGrid>["exhibits"] =>
    planDevGrid().exhibits.filter((e) => e.row === SEED_SWEEP_ROW_LABEL);

  it("varies the salt and nothing else", () => {
    const row = cells();
    expect(row).toHaveLength(SEED_SWEEP_LENGTH);
    // One design, eight draws: everything a reader could point at is constant.
    for (const key of ["archetype", "theme", "roof", "floors"] as const) {
      expect(new Set(row.map((c) => c[key])).size, key).toBe(1);
    }
    expect(new Set(row.map((c) => c.size.join("x"))).size).toBe(1);
    expect(new Set(row.map((c) => c.seedSalt)).size).toBe(SEED_SWEEP_LENGTH);
    expect(row.every((c) => c.seedSalt !== undefined)).toBe(true);
  });

  it("actually produces eight different buildings", () => {
    // The point of the row is that it *spans* something. If every cell came out
    // identical the salt would not be reaching the grammar, and the row would
    // be eight copies of one house pretending to be a measurement.
    const ids = new Set(cells().map((c) => `dev.${SEED_SWEEP_ROW_LABEL}.${c.id}`));
    const built = result.buildings.filter((b) => ids.has(b.nodePath));
    expect(built).toHaveLength(SEED_SWEEP_LENGTH);
    const signatures = new Set(
      built.map((b) => `${b.blockCount}:${b.meta.windowCount}:${b.meta.params.windowShape}`),
    );
    expect(signatures.size).toBeGreaterThan(1);
    // ...and it varies only cosmetically: the envelope, the storeys and the
    // roof line are decisions, not draws, so they must agree across all eight.
    expect(new Set(built.map((b) => b.meta.roofTop)).size).toBe(1);
    expect(new Set(built.map((b) => b.meta.height)).size).toBe(1);
  });
});

describe("the breakpoint rows", () => {
  const metaOf = (id: string): (typeof result.buildings)[number]["meta"] => {
    const found = result.buildings.find((b) => b.nodePath.endsWith(`.${id}`));
    expect(found, id).toBeDefined();
    return (found as (typeof result.buildings)[number]).meta;
  };

  it("puts a stair flight in the shallowest footprint that fits one, and a ladder one below", () => {
    // `canStair` is `interior depth ≥ storyHeight + 1`; `STAIR_MIN_DEPTH` is the
    // envelope that meets it exactly, and one block less is the fallback.
    expect(metaOf("bp_stairs_flight_min").stairRuns.length).toBeGreaterThan(0);
    const flight = result.buildings.find((b) => b.nodePath.endsWith(".bp_stairs_flight_min"));
    const ladder = result.buildings.find((b) => b.nodePath.endsWith(".bp_stairs_ladder"));
    const depthOf = (b: typeof flight): number =>
      (b as NonNullable<typeof flight>).footprint.z1 -
      (b as NonNullable<typeof flight>).footprint.z0 +
      1;
    expect(depthOf(flight)).toBe(STAIR_MIN_DEPTH);
    expect(depthOf(ladder)).toBe(STAIR_MIN_DEPTH - 1);
    // The fallback is a ladder, so the flight's steps are gone. Read from the
    // emitted blocks rather than the meta, because the meta records the run
    // either way — `stairRuns` is the *plane* the climb starts at.
    const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    // By *name*, not by state id: a ladder carries a `facing`, so the id the
    // grammar emitted is not the block table's default one.
    const inFootprint = (b: NonNullable<typeof flight>): number => {
      let n = 0;
      for (const block of result.blocks) {
        if (block.x < b.footprint.x0 || block.x > b.footprint.x1) continue;
        if (block.z < b.footprint.z0 || block.z > b.footprint.z1) continue;
        if (stack.blockNameByStateId(block.stateId) === "ladder") n++;
      }
      return n;
    };
    expect(inFootprint(ladder as NonNullable<typeof flight>)).toBeGreaterThan(0);
    expect(inFootprint(flight as NonNullable<typeof flight>)).toBe(0);
  });

  it("accepts a wing exactly at each limit and drops it one step past", () => {
    // A dropped wing is silent by design — the grammar never fails a document —
    // so the only way to see it is `footprint.wing`, which is null for a rect.
    for (const [ok, bad] of [
      ["bp_wing_overlap_min", "bp_wing_overlap_short"],
      ["bp_wing_depth_min", "bp_wing_depth_shallow"],
      ["bp_wing_main_min", "bp_wing_main_thin"],
      ["bp_wing_flush_end", "bp_wing_overhang"],
    ] as const) {
      expect(metaOf(ok).footprint.wing, ok).not.toBeNull();
      expect(metaOf(bad).footprint.wing, bad).toBeNull();
    }
  });

  it("clamps the storey height when the envelope is one block short", () => {
    for (const floors of [1, 2]) {
      const exact = metaOf(`bp_height_${floors}f_exact`);
      const crushed = metaOf(`bp_height_${floors}f_crushed`);
      // Same walls either side of the line — the clamp is what makes them the
      // same — over an envelope one block shorter, so the roof is what gives.
      expect(exact.params.storyHeight, `${floors}f`).toBe(MIN_STORY_HEIGHT);
      expect(crushed.params.storyHeight, `${floors}f`).toBe(MIN_STORY_HEIGHT);
      expect(exact.wallTop).toBe(crushed.wallTop);
      expect(exact.size[1]).toBe(exactRoofHeight(floors));
      expect(crushed.size[1]).toBe(exactRoofHeight(floors) - 1);
      // The crush itself: the envelope lost a block and the building did not.
      // Below the line the storey division returns `MIN_STORY_HEIGHT − 1`, the
      // clamp puts it back, and what was a fit becomes an overrun — the same
      // house standing in a shorter box.
      expect(crushed.height).toBe(exact.height);
      expect(crushed.roofTop).toBe(exact.roofTop);
      expect(crushed.height).toBeGreaterThan(crushed.size[1]);
    }
  });

  it("clamps floors, storey height, roof layers and cellar depth at their stops", () => {
    expect(metaOf(`bp_clamp_floors_${MAX_FLOORS + 1}`).params.floors).toBe(MAX_FLOORS);
    expect(metaOf("bp_clamp_story_min").params.storyHeight).toBe(MIN_STORY_HEIGHT);
    expect(metaOf("bp_clamp_story_under").params.storyHeight).toBe(MIN_STORY_HEIGHT);
    expect(metaOf("bp_clamp_story_max").params.storyHeight).toBe(MAX_STORY_HEIGHT);
    expect(metaOf("bp_clamp_story_over").params.storyHeight).toBe(MAX_STORY_HEIGHT);
    // The roof-layer cap: the wide cell wants more courses than the cap allows
    // and gets the cap; the narrow one is under it and gets what it asked for.
    const capped = metaOf("bp_clamp_roof_cap");
    const under = metaOf("bp_clamp_roof_under");
    const layers = (m: typeof capped): number => m.roofTop - m.roofBase + 1;
    expect(layers(capped)).toBe(MAX_ROOF_LAYERS);
    expect(layers(under)).toBeLessThan(layers(capped));
    expect(metaOf("bp_clamp_cellar_min").basementDepth).toBe(MIN_BASEMENT_DEPTH);
    expect(metaOf("bp_clamp_cellar_under").basementDepth).toBe(MIN_BASEMENT_DEPTH);
    expect(metaOf("bp_clamp_cellar_max").basementDepth).toBe(MAX_BASEMENT_DEPTH);
    expect(metaOf("bp_clamp_cellar_over").basementDepth).toBe(MAX_BASEMENT_DEPTH);
  });
});

describe("the context section", () => {
  it("shapes each strip's band and leaves the plain between them alone", () => {
    const section = planContextSection(0, 0);
    expect(section.strips.map((s) => s.strip)).toEqual(["slope", "ridge", "shore", "yaw"]);
    // No two bands share a column: a strip's pad apron and its grade both reach
    // outside its cells, and two overlapping bands would be an exhibit of the
    // overlap rather than of either strip.
    for (let a = 0; a < section.strips.length; a++) {
      for (let b = a + 1; b < section.strips.length; b++) {
        const p = section.strips[a]?.band as { x0: number; x1: number };
        const q = section.strips[b]?.band as { x0: number; x1: number };
        expect(p.x1 < q.x0 || q.x1 < p.x0, `${a} vs ${b}`).toBe(true);
      }
    }
  });

  it("builds a grade that falls, a ridge that is symmetric, and flat ground for the yaws", () => {
    const section = planContextSection(0, 0);
    const strip = (name: string): (typeof section.strips)[number] =>
      section.strips.find((s) => s.strip === name) as (typeof section.strips)[number];

    const slope = strip("slope");
    let previous = Number.POSITIVE_INFINITY;
    for (let z = slope.band.z0; z <= slope.band.z1; z++) {
      const y = contextGroundAt(slope, 64, z);
      expect(y).toBeLessThanOrEqual(previous);
      previous = y;
    }
    // The grade is the one it claims to be: the fall over the band matches the
    // rise-over-run to within the rounding of a single block.
    const fall = contextGroundAt(slope, 64, slope.band.z0) - contextGroundAt(slope, 64, slope.band.z1);
    const span = slope.band.z1 - slope.band.z0;
    expect(Math.abs(fall - (span * SLOPE_RISE) / SLOPE_RUN)).toBeLessThanOrEqual(1);

    const ridge = strip("ridge");
    const crestZ = (ridge.ground as { crestZ: number }).crestZ;
    const crestY = contextGroundAt(ridge, 64, crestZ);
    for (let d = 1; d <= 8; d++) {
      expect(contextGroundAt(ridge, 64, crestZ - d)).toBe(contextGroundAt(ridge, 64, crestZ + d));
      expect(contextGroundAt(ridge, 64, crestZ - d)).toBeLessThanOrEqual(crestY);
    }

    const yaw = strip("yaw");
    for (let z = yaw.band.z0; z <= yaw.band.z1; z++) {
      expect(contextGroundAt(yaw, 64, z)).toBe(64);
    }
  });

  it("gives the slope's three cottages three different foundations", () => {
    const foundations = SLOPE_POSITIONS === 0
      ? []
      : Array.from({ length: SLOPE_POSITIONS }, (_, k) =>
          result.contextResult.foundations.get(`slope_${k}`) as number,
        );
    expect(new Set(foundations).size).toBe(SLOPE_POSITIONS);
    // Downhill, in order: the first cell is the highest.
    for (let k = 1; k < foundations.length; k++) {
      expect(foundations[k] as number).toBeLessThan(foundations[k - 1] as number);
    }
    // Every one of them had ground to move, which is the whole point of the
    // strip: a pad that moved nothing would be a flat exhibit with a grade
    // painted behind it.
    for (const entry of result.contextResult.padded.filter((p) => p.id.startsWith("slope_"))) {
      expect(entry.cutFill, entry.id).toBeGreaterThan(0);
    }
  });

  it("sits the ridge cottage on the crest, cutting one side and filling the other", () => {
    const crest = result.contextResult.padded.find((p) => p.id === "ridge_crest");
    expect(crest?.cutFill).toBeGreaterThan(0);

    const section = planContextSection(0, 0);
    const ridge = section.strips.find((s) => s.strip === "ridge") as (typeof section.strips)[number];
    const cell = section.cells.find((c) => c.id === "ridge_crest") as (typeof section.cells)[number];
    const rect = contextFootprint(cell);
    const crestZ = (ridge.ground as { crestZ: number }).crestZ;
    // Straddling means exactly this: the ridge line runs through the footprint,
    // and the ground at the two ends of it is lower than the ground in the
    // middle. A pad over that has to cut and fill in the same edit.
    expect(crestZ).toBeGreaterThan(rect.z0);
    expect(crestZ).toBeLessThan(rect.z1);
    const high = contextGroundAt(ridge, 64, crestZ);
    expect(contextGroundAt(ridge, 64, rect.z0)).toBeLessThan(high);
    expect(contextGroundAt(ridge, 64, rect.z1)).toBeLessThan(high);
    // ...and the foundation the solver's own rule picks lands between them, so
    // some of the footprint is cut down to it and some is filled up to it.
    const foundation = result.contextResult.foundations.get("ridge_crest") as number;
    expect(foundation).toBeLessThanOrEqual(64 + high - 64);
    expect(foundation).toBeGreaterThan(contextGroundAt(ridge, 64, rect.z0) - 1);
  });

  it("runs the doorstep pass — the one thing the flat grid can never do", () => {
    const steps = result.contextResult.doorsteps;
    const cells = planContextSection(0, 0).cells.length;
    // Every door in the section, at every yaw: the pass reaches all four strips
    // and leaves no threshold you have to jump into.
    expect(steps.stepped + steps.dropped).toBe(cells);
    expect(steps.stepped).toBeGreaterThanOrEqual(SLOPE_POSITIONS);
    // Exactly one stair per door, and that is the interesting number: the pad's
    // apron has already graded the four columns outside the footprint back to
    // the hill, so even on a 10° slope the approach arrives within half a block
    // of the threshold and one step closes it. If the apron ever stopped
    // grading — a blend set to zero, a pad that levelled only the footprint —
    // the flights on the slope strip would lengthen and this number would jump,
    // which is the regression this pins.
    expect(steps.blocks).toHaveLength(cells);
  });

  it("puts the same cottage at all four yaws, and a pier over the shore's water", () => {
    const section = planContextSection(0, 0);
    const yaws = section.cells.filter((c) => c.strip === "yaw").map((c) => c.yaw);
    expect(yaws).toEqual([...CONTEXT_YAWS]);
    const pier = result.contextResult.props.find((p) => p.prop === "pier");
    expect(pier, "the shore strip's pier found a site").toBeDefined();
    expect(result.contextResult.pondColumns).toBeGreaterThan(0);
  });
});

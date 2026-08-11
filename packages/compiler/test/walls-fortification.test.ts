/**
 * `intent.character.fortification` — the dial that puts a wall round a town.
 *
 * Three layers, tested apart because they fail apart:
 *
 * 1. **The row.** Totality (an intent that declares nothing gets `today`), the
 *    author's precedence, and what "walled" resolves to.
 * 2. **The job list.** Which node gets a circuit — one settlement, one ring —
 *    and what happens when there is nothing to ring.
 * 3. **A compiled world.** The whole point: a flat town whose document says
 *    `"fortification": "walled"` and nowhere writes `params.walls` comes out
 *    with a closed circuit, a gate on every arterial crossing, towers on it,
 *    zero physics findings and a town that is still reachable through the
 *    gates. Plus the negative control — the same document without the field
 *    compiles to a world with no wall in it at all.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import type { WalkabilityReport } from "../src/emit/walkability.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { intentFor, resolveIntents } from "../src/intent/resolve.js";
import { fanOutRow, installFanOutRows } from "../src/intent/index.js";
import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import type { StructurePassResult } from "../src/structures/index.js";
import { inGate, type CoursePoint } from "../src/structures/wall-course.js";
import {
  WALL_ROWS,
  fortificationJobs,
  fortificationStyle,
  wallMaterialsOfTheme,
  type FabricNode,
} from "../src/structures/walls-intent.js";
import type { WallJob } from "../src/structures/walls.js";
import { pickTheme } from "@terrainist/stdlib";

/* -------------------------------------------------------------------------- */
/* the fixture                                                                 */
/* -------------------------------------------------------------------------- */

/** A rectangle of "quarter", as the fabric hands one over. */
const QUARTER_RECT = { x0: -40, z0: -40, x1: 40, z1: 40 };

/**
 * A flat town: one district, two buildings outside it, one lane between them.
 *
 * Flat on purpose — the walled-quarter Terrarium station already proves the
 * circuit steps with a ridge, and what this fixture is for is the *dial*. The
 * lane between two buildings on opposite sides is what makes a gate exist:
 * a district is an obstacle to the road router and never a destination, so a
 * lane aimed past the quarter crosses the derived course and the wall opens
 * where it does. Nothing here names a gate, a tower or a wall.
 */
function document(fortification?: string): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "fortified_flat", worldSeed: 20260811 },
    ...(fortification === undefined
      ? {}
      : { intent: { era: "ancient", character: { fortification } } }),
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [192, 192] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: {
            amplitude: 0,
            baseHeight: 72,
            seaLevel: 50,
            octaves: 1,
            frequency: 0.012,
            gain: 0.5,
            lacunarity: 2.0,
            erosionPasses: 0,
            soilDepth: 4,
            beachWidth: 2,
          },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "quarter",
          kind: "district",
          envelope: { shape: "region", size: [64, 64] },
          params: {
            fabric: "grid",
            density: "medium",
            mix: ["cottage", "shop_row", "smithy"],
            blockSize: 24,
          },
          constraints: [{ zone: "center" }],
          tags: ["urban"],
        },
        {
          id: "north_farm",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [9, 9, 9] },
          params: { floors: 1, roof: "gable" },
          constraints: [{ zone: "north" }],
          ports: { door: { type: "door", face: "south", tags: ["primary"] } },
          tags: ["house"],
        },
        {
          id: "south_mill",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [9, 9, 9] },
          params: { floors: 1, roof: "gable" },
          constraints: [{ zone: "south" }],
          ports: { door: { type: "door", face: "north", tags: ["primary"] } },
          tags: ["house"],
        },
        {
          id: "approach",
          kind: "generator",
          generator: "road.network@0",
          params: { anchors: ["north_farm", "south_mill"], pattern: "organic", width: 3 },
        },
      ],
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 1. the row                                                                  */
/* -------------------------------------------------------------------------- */

/** A resolved intent for a document that declares exactly this. */
function resolved(intent?: unknown): ReturnType<typeof intentFor> {
  return intentFor(
    resolveIntents({ ...(intent === undefined ? {} : { intent: intent as never }), root: { id: "world" } }),
    "world",
  );
}

const EXTRA = {
  scope: "settlement",
  extent: [
    { x: -40, z: -40 },
    { x: 40, z: -40 },
    { x: -40, z: 40 },
    { x: 40, z: 40 },
  ] as readonly CoursePoint[],
  theme: pickTheme(new Uint8Array(32) as never, "stone_slate"),
};

describe("the structures.fortification row", () => {
  beforeAll(() => {
    installFanOutRows();
  });

  it("is registered under the id the wall step spells", () => {
    const row = fanOutRow(WALL_ROWS.fortification);
    expect(row, "structures.fortification is not registered").toBeDefined();
    expect(row?.status).toBe("today");
    expect(row?.reads).toContain("character");
  });

  it("is total: an intent that declares nothing gets today's answer", () => {
    const row = fanOutRow(WALL_ROWS.fortification);
    const sentinel = Symbol("today");
    expect(
      row?.resolve(resolved() as never, {
        nodePath: "world",
        today: sentinel as never,
        extra: EXTRA as never,
      }),
    ).toBe(sentinel);
  });

  it('answers "walled" with a job the wall pass can run', () => {
    const row = fanOutRow(WALL_ROWS.fortification);
    const job = row?.resolve(resolved({ era: "ancient", character: { fortification: "walled" } }) as never, {
      nodePath: "world.quarter",
      today: undefined as never,
      extra: EXTRA as never,
    }) as unknown as WallJob;
    expect(job).toBeDefined();
    expect(job.nodePath).toBe("world.quarter");
    expect(job.gates).toBe(true);
    expect(job.height).toBeGreaterThan(3);
    expect(job.extent.length).toBe(4);
    // The materials come from the settlement's own ground roles, not from the
    // style table — that is what keeps a mud-brick town from being walled in
    // grey stone.
    expect(job.materials).toEqual(wallMaterialsOfTheme(EXTRA.theme));
  });

  it('leaves "open" and an unknown word alone', () => {
    const row = fanOutRow(WALL_ROWS.fortification);
    for (const word of ["open", "moated", ""]) {
      expect(
        row?.resolve(resolved({ character: { fortification: word } }) as never, {
          nodePath: "world",
          today: undefined as never,
          extra: EXTRA as never,
        }),
      ).toBeUndefined();
    }
  });

  it("never overrides an authored wall", () => {
    const row = fanOutRow(WALL_ROWS.fortification);
    const authored = { nodePath: "world.quarter", style: "palisade" } as unknown as WallJob;
    expect(
      row?.resolve(resolved({ character: { fortification: "walled" } }) as never, {
        nodePath: "world.quarter",
        today: authored as never,
        extra: EXTRA as never,
      }),
    ).toBe(authored);
  });

  it("builds a primitive settlement a palisade and everyone else masonry", () => {
    expect(fortificationStyle("primitive")).toBe("palisade");
    for (const era of ["ancient", "medieval", "renaissance", "industrial", "modern"] as const) {
      expect(fortificationStyle(era)).toBe("masonry");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the job list                                                             */
/* -------------------------------------------------------------------------- */

function fabric(nodes: readonly Partial<FabricNode>[]): FabricNode[] {
  return nodes.map((n, i) => ({
    nodePath: n.nodePath ?? `world.q${i}`,
    ...(n.declared === undefined ? {} : { declared: n.declared }),
    rect: n.rect ?? QUARTER_RECT,
    buildings: n.buildings ?? [],
  }));
}

function jobsFor(intent: unknown, nodes: readonly Partial<FabricNode>[], authored: readonly WallJob[] = []) {
  const resolution = resolveIntents({
    ...(intent === undefined ? {} : { intent: intent as never }),
    root: {
      id: "world",
      kind: "composite",
      children: nodes.map((n, i) => ({
        id: (n.nodePath ?? `world.q${i}`).split(".").pop(),
        kind: "district",
        ...(n.declared === undefined ? {} : { intent: n.declared }),
      })),
    },
  });
  return fortificationJobs({
    rootPath: "world",
    intents: resolution,
    theme: EXTRA.theme,
    authored,
    fabric: fabric(nodes),
  });
}

describe("the job list", () => {
  beforeAll(() => {
    installFanOutRows();
  });

  it("adds nothing at all when nobody asks", () => {
    expect(jobsFor(undefined, [{}]).jobs).toEqual([]);
    expect(jobsFor({ era: "ancient", wealth: 0.8 }, [{}]).jobs).toEqual([]);
  });

  it("rings the whole fabric once when the settlement is walled, not each quarter", () => {
    const out = jobsFor({ character: { fortification: "walled" } }, [
      { nodePath: "world.old_town" },
      { nodePath: "world.harbour", rect: { x0: 60, z0: -20, x1: 100, z1: 20 } },
    ]);
    expect(out.jobs).toHaveLength(1);
    expect((out.jobs[0] as WallJob).nodePath).toBe("world");
    // Both quarters are inside the extent handed to the hull — eight corners.
    expect((out.jobs[0] as WallJob).extent).toHaveLength(8);
  });

  it("rings one quarter when the quarter is the thing that said it", () => {
    const out = jobsFor(undefined, [
      { nodePath: "world.old_town", declared: { character: { fortification: "walled" } } as never },
      { nodePath: "world.harbour" },
    ]);
    expect(out.jobs).toHaveLength(1);
    expect((out.jobs[0] as WallJob).nodePath).toBe("world.old_town");
  });

  it("stands down entirely when a node authored params.walls", () => {
    const authored = [{ nodePath: "world.old_town", style: "masonry" } as unknown as WallJob];
    const out = jobsFor({ character: { fortification: "walled" } }, [{ nodePath: "world.old_town" }], authored);
    expect(out.jobs).toEqual(authored);
    expect(out.diagnostics.map((d) => d.code)).toContain("LOAM-W489");
  });

  it("says so when there is no fabric to ring", () => {
    const out = jobsFor({ character: { fortification: "walled" } }, []);
    expect(out.jobs).toEqual([]);
    expect(out.diagnostics.map((d) => d.code)).toEqual(["LOAM-W489"]);
  });

  it("grounds a word the vocabulary does not carry, and builds nothing", () => {
    const out = jobsFor({ character: { fortification: "moated" } }, [{}]);
    expect(out.jobs).toEqual([]);
    expect(out.diagnostics.map((d) => d.code)).toEqual(["LOAM-W489"]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the compiled world                                                       */
/* -------------------------------------------------------------------------- */

describe("a flat town whose document only says it is walled", () => {
  let root: string;
  let dir: string;
  let report: TerrainCompileReport;
  let structures: StructurePassResult;
  let stack: PrismarineStack;
  let physics: PhysicsReport;
  /** The walled world's audit, and the same town with the dial off. */
  let walk: WalkabilityReport;
  let control: WalkabilityReport;
  let controlStats: Record<string, number>;

  beforeAll(async () => {
    installFanOutRows();
    stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
    root = await mkdtemp(path.join(tmpdir(), "terrainist-fortify-"));
    dir = path.join(root, "walled");
    const compiled = await compileTerrain(document("walled"), { outDir: dir, walkability: true });
    if (!compiled.ok) {
      throw new Error(
        `fixture failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
      );
    }
    report = compiled.report;
    structures = report.layout?.structures as StructurePassResult;
    walk = compiled.walkability as WalkabilityReport;
    physics = await lintWorldPhysics(dir, stack, {
      buildings: structures.buildings as never,
      roads: (structures.roads?.routes ?? []) as never,
      tunnels: [],
    });

    // The negative control: the same document with the field deleted, which is
    // the *only* difference between the two compiles.
    const off = await compileTerrain(document(), {
      outDir: path.join(root, "open"),
      walkability: true,
    });
    if (!off.ok) throw new Error("the unwalled control did not compile");
    control = off.walkability as WalkabilityReport;
    controlStats = (off.report.layout?.structures as StructurePassResult).stats as Record<
      string,
      number
    >;
  }, 900_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("builds exactly one circuit, with no line of JSON asking for one", () => {
    expect(structures.stats["walls"]).toBe(1);
    expect(structures.walls).toHaveLength(1);
    expect(structures.stats["wallColumns"]).toBeGreaterThan(200);
    expect(structures.stats["wallBlocks"]).toBeGreaterThan(2000);
  });

  it("closes: the course is a 4-connected ring that comes back to where it started", () => {
    const course = (structures.walls[0] as { course: { path: readonly CoursePoint[] } }).course;
    const ring = course.path;
    expect(ring.length).toBeGreaterThan(64);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i] as CoursePoint;
      const b = ring[(i + 1) % ring.length] as CoursePoint;
      const step = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      expect(step, `path breaks between ${i} and ${i + 1}`).toBe(1);
    }
  });

  it("stands towers on it", () => {
    expect(structures.stats["wallTowers"]).toBeGreaterThanOrEqual(4);
  });

  it("opens a gate where the lane crosses, and every gate is an opening in the course", () => {
    const wall = structures.walls[0] as {
      course: { path: readonly CoursePoint[] };
      gates: readonly { from: number; to: number }[];
    };
    expect(wall.gates.length).toBeGreaterThanOrEqual(1);
    // A gate is a run of course indices the sweep was told to skip, so the road
    // passes *through* the wall rather than into masonry.
    const opened = new Set<number>();
    for (const gate of wall.gates) {
      for (let i = 0; i < wall.course.path.length; i++) {
        if (inGate(gate as never, i, wall.course.path.length)) opened.add(i);
      }
    }
    expect(opened.size).toBeGreaterThanOrEqual(wall.gates.length * 3);
  });

  it("builds nearly all of the course it derived", () => {
    const built = structures.stats["wallColumns"] as number;
    const skipped = structures.stats["wallColumnsSkipped"] as number;
    expect(skipped / (built + skipped)).toBeLessThan(0.15);
  });

  it("lints zero on every physics rule", () => {
    for (const rule of PHYSICS_RULES) {
      expect(`${rule}=${physics.counts[rule] ?? 0}`).toBe(`${rule}=0`);
    }
    expect(physics.findings).toEqual([]);
  });

  it("keeps the town as walkable as it was unwalled — the gates are the reachability", () => {
    // A wall that sealed the town would show as doors the walking agent can no
    // longer reach and as paved ground broken into more components. Both are
    // read against the same town with the dial off, because an absolute number
    // could not say whether the wall was the cause.
    expect(walk.entranceReachableShare).toBeGreaterThanOrEqual(control.entranceReachableShare);
    expect(walk.orphanColumns).toBeLessThanOrEqual(control.orphanColumns);
    expect(walk.components.length).toBeLessThanOrEqual(control.components.length);
  });

  it("is the dial and nothing else: without the field, no wall is built", () => {
    expect(controlStats["walls"]).toBeUndefined();
    expect(controlStats["wallBlocks"]).toBeUndefined();
  });

  it("refuses nothing and warns about nothing", () => {
    expect(report.diagnostics.filter((d) => d.name.startsWith("WALL_"))).toEqual([]);
    expect(report.diagnostics.filter((d) => d.code === "LOAM-W489")).toEqual([]);
  });
});

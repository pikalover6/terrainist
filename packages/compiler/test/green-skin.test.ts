/**
 * **WP-6a** — the surface index, the shared growth-face vocabulary, and rule 27
 * (`docs/RUINS-PLAN-v0-WP6.md` §11).
 *
 * The wave that writes no blocks. Everything here is about the three things the
 * later waves stand on:
 *
 * 1. **the surface index** (§3.2) — built over ruined columns only, air
 *    recorded as air, last write wins, and its three predicates answered *by
 *    name* through `support.ts` so the skin and the lint cannot disagree;
 * 2. **`growthFaces`** (§4.1) — the three laws, shared with the flora side's
 *    `hangingFaces`, with the property test that keeps the two readers from
 *    drifting;
 * 3. **rule 27, `unsupported.multiface`** (§8) — proven to fire on the defect
 *    it is for, and proven to fire zero on a correctly faced world.
 *
 * The corpus-wide zero baseline for rule 27 is not here, and cannot be: it is
 * the whole suite. Every lint-zero assertion in this repo iterates
 * `PHYSICS_RULES`, so every compiled world in the suite now sweeps rule 27 as
 * well, which is exactly the bar §11 asks for — *proven not to fire before
 * anything relies on it*.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  chooseGrowthFace,
  growthFaces,
  isMultifaceGrowth,
  ownGrowthFaces,
} from "@terrainist/stdlib";

import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type EmitChunk, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { writeWorldFiles } from "../src/emit/write.js";
import {
  GREEN_SKIN_CHANNELS,
  GREEN_SKIN_CHANNEL_FIRST,
  GREEN_SKIN_CHANNEL_LAST,
  SURFACE_INDEX_UNSET,
  buildSurfaceIndex,
  growGreenSkin,
} from "../src/structures/green-skin.js";
import type { RuinField } from "../src/structures/ruin-field.js";
import type { StructureBlock } from "../src/structures/buildings.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import {
  FLORA_SPECIES,
  SHAPE_PROGRAMS,
  type FloraBlock,
  type FloraPart,
  type FloraSpeciesDef,
  type FloraVariation,
} from "../src/terrain/vegetation.js";
import { hangingFaces } from "../src/terrain/flora/parts.js";
import { Palette } from "../src/terrain/palette.js";

/** A palette with no symbol resolved: the skin then writes no vine and no leaf. */
function emptyPalette(): Palette {
  return new Palette(new Map(), new Uint32Array(8) as never);
}

let stack: PrismarineStack;
const scratch: string[] = [];

beforeAll(() => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
});

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* a plan and a field, small enough to reason about by hand                    */
/* -------------------------------------------------------------------------- */

const W = 16;
const D = 16;
const GROUND = 64;

function plan(): ColumnPlan {
  const cells = W * D;
  const ground = new Int32Array(cells).fill(GROUND);
  return {
    region: { x0: 0, z0: 0, width: W, depth: D },
    ground,
    fluidTop: new Int32Array(ground),
    fluidKind: new Uint8Array(cells),
    surface: new Int32Array(cells),
    subsurface: new Int32Array(cells),
    soil: new Uint8Array(cells).fill(3),
    snow: new Uint8Array(cells),
    biome: new Uint16Array(cells),
    volcanic: new Uint8Array(cells),
    volcanicUpper: new Uint8Array(cells),
    lavaFlow: new Uint8Array(cells),
    lakeMask: new Uint8Array(cells),
    oceanMask: new Uint8Array(cells),
  } as unknown as ColumnPlan;
}

/** A field that is 1 on `x < 8` and 0 elsewhere — half the plan is ruined. */
function halfField(): RuinField {
  const field = new Float32Array(W * D);
  for (let j = 0; j < D; j++) for (let i = 0; i < 8; i++) field[j * W + i] = 1;
  return { field, lots: [], columns: 8 * D };
}

function stateOf(name: string, props: Readonly<Record<string, string>> = {}): number {
  const id = stack.blockStateOf(name, props);
  if (id === undefined) throw new Error(`no state for ${name}`);
  return id;
}

/**
 * A `vine` carrying a face record, keeping only the properties the block
 * actually declares.
 *
 * The pinned 1.21.11 `vine` has `north/south/east/west/up` and no `down` — the
 * same filter `parts.ts`' `withProps` applies, and the reason it applies it.
 */
function vineOf(faces: Readonly<Record<string, string>>): number {
  const declared = stack.blockStateProps(stateOf("vine")) as {
    readonly props: Record<string, string>;
  };
  const props: Record<string, string> = { ...declared.props };
  for (const [face, value] of Object.entries(faces)) {
    if (Object.hasOwn(props, face)) props[face] = value;
  }
  return stateOf("vine", props);
}

/* -------------------------------------------------------------------------- */
/* §3.2 — the surface index                                                    */
/* -------------------------------------------------------------------------- */

describe("the surface index (§3.2)", () => {
  const stone = (): number => stateOf("stone_bricks");
  const air = (): number => stateOf("air");
  const slab = (): number => stateOf("stone_brick_slab", { type: "bottom", waterlogged: "false" });

  it("indexes ruined columns only — an unruined column is skipped at index time", () => {
    const laid: StructureBlock[] = [
      { x: 2, y: GROUND + 1, z: 2, stateId: stone() }, // ruined half
      { x: 12, y: GROUND + 1, z: 2, stateId: stone() }, // unruined half
    ];
    const { index, cost } = buildSurfaceIndex(plan(), halfField(), laid, stack);
    expect(index.columns).toBe(1);
    expect(cost.stored).toBe(1);
    expect(index.solidAt(2, GROUND + 1, 2)).toBe(true);
    // Not "air" and not "open": the index holds *nothing* about it, and every
    // predicate has to say so rather than guess.
    expect(index.stateAt(12, GROUND + 1, 2)).toBe(SURFACE_INDEX_UNSET);
    expect(index.solidAt(12, GROUND + 1, 2)).toBe(false);
  });

  it("last write wins, exactly as the emitter resolves it", () => {
    const laid: StructureBlock[] = [
      { x: 3, y: GROUND + 1, z: 3, stateId: stone() },
      { x: 3, y: GROUND + 1, z: 3, stateId: air() },
    ];
    const { index } = buildSurfaceIndex(plan(), halfField(), laid, stack);
    expect(index.nameAt(3, GROUND + 1, 3)).toBe("air");
    expect(index.solidAt(3, GROUND + 1, 3)).toBe(false);
  });

  it("records air as air — a cleared cell and an untouched cell are different facts", () => {
    const laid: StructureBlock[] = [
      { x: 4, y: GROUND + 1, z: 4, stateId: air() },
      { x: 4, y: GROUND + 4, z: 4, stateId: stone() },
    ];
    const { index } = buildSurfaceIndex(plan(), halfField(), laid, stack);
    // Cleared by the crumble: the index holds air.
    expect(index.stateAt(4, GROUND + 1, 4)).not.toBe(SURFACE_INDEX_UNSET);
    expect(index.openAt(4, GROUND + 1, 4)).toBe(true);
    // Never touched, but above the ground: open sky, which is also open.
    expect(index.stateAt(4, GROUND + 3, 4)).toBe(SURFACE_INDEX_UNSET);
    expect(index.openAt(4, GROUND + 3, 4)).toBe(true);
    // Never touched and *below* the ground: rock, not sky.
    expect(index.openAt(4, GROUND - 2, 4)).toBe(false);
  });

  it("`solidAt` is `canSupport` by name — it refuses to hang a vine off a slab", () => {
    const laid: StructureBlock[] = [
      { x: 5, y: GROUND + 1, z: 5, stateId: slab() },
      { x: 6, y: GROUND + 1, z: 5, stateId: stone() },
    ];
    const { index } = buildSurfaceIndex(plan(), halfField(), laid, stack);
    expect(index.solidAt(5, GROUND + 1, 5)).toBe(false);
    expect(index.solidAt(6, GROUND + 1, 5)).toBe(true);
  });

  it("`walkedAt` asks both body courses, in the physics lint's own vocabulary", () => {
    const laid: StructureBlock[] = [
      { x: 1, y: GROUND + 1, z: 1, stateId: stone() },
      { x: 2, y: GROUND + 1, z: 1, stateId: air() },
      { x: 2, y: GROUND + 2, z: 1, stateId: stone() },
    ];
    const { index } = buildSurfaceIndex(plan(), halfField(), laid, stack);
    expect(index.walkedAt(1, GROUND + 1, 1)).toBe(false); // a full cube in the feet
    expect(index.walkedAt(2, GROUND + 1, 1)).toBe(false); // head blocked
    expect(index.walkedAt(3, GROUND + 1, 1)).toBe(true); // open on both courses
  });

  it("the span reaches below the ground, so a cellar's courses are indexed", () => {
    const laid: StructureBlock[] = [{ x: 7, y: GROUND - 5, z: 7, stateId: stone() }];
    const { index } = buildSurfaceIndex(plan(), halfField(), laid, stack);
    expect(index.spanAt(7, 7)).toEqual({ y0: GROUND - 5, y1: GROUND });
    expect(index.solidAt(7, GROUND - 5, 7)).toBe(true);
  });

  it("is a pure function of its inputs — the same call twice, the same answers", () => {
    const laid: StructureBlock[] = [];
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        laid.push({ x, y: GROUND + ((x + z) % 5), z, stateId: stone() });
      }
    }
    const a = buildSurfaceIndex(plan(), halfField(), laid, stack);
    const b = buildSurfaceIndex(plan(), halfField(), laid, stack);
    expect(a.cost).toEqual(b.cost);
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        for (let y = GROUND; y < GROUND + 6; y++) {
          expect(a.index.stateAt(x, y, z)).toBe(b.index.stateAt(x, y, z));
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §3.4 — the reach law, and §11's "writes no blocks"                          */
/* -------------------------------------------------------------------------- */

describe("the pass (§3.1, §3.4)", () => {
  const laid: StructureBlock[] = [{ x: 2, y: GROUND + 1, z: 2, stateId: 1 }];

  it("no ruin field → the pass is structurally absent", () => {
    const out = growGreenSkin({
      plan: plan(),
      palette: undefined as never,
      stack,
      seed: 7,
      laid,
      districts: [],
    });
    expect(out.blocks).toEqual([]);
    expect(out.cost).toBeUndefined();
    expect(out.counts.indexedColumns).toBe(0);
    expect([...out.colonized].some((v) => v === 1)).toBe(false);
  });

  it("with a field it indexes — and a lone block has no eligible vertical surface", () => {
    const out = growGreenSkin({
      plan: plan(),
      palette: emptyPalette(),
      stack,
      seed: 7,
      ruinField: halfField(),
      laid: [{ x: 2, y: GROUND + 1, z: 2, stateId: stateOf("stone_bricks") }],
      districts: [],
    });
    // One course of masonry standing on the ground offers no face cell above
    // the two body courses and no opening at all, so the *vertical* skin writes
    // nothing — which is the eligibility discipline, not the reach law.
    expect(out.counts.climbers).toBe(0);
    expect(out.counts.plugs).toBe(0);
    // WP-6c's horizontal skin does see it: a full cube with sky over it, one
    // course off the ground, is surviving pavement, and it takes moss and a
    // cover on the moss — the level unmoved, which is what the level law is.
    expect(out.counts.pavement).toBe(1);
    expect(out.counts.carpets + out.counts.shrubs).toBe(1);
    expect(out.blocks.map((b) => b.y)).toEqual([GROUND + 1, GROUND + 2]);
    expect(out.blocks.map((b) => stack.blockNameByStateId(b.stateId))).toEqual([
      "moss_block",
      expect.stringMatching(/^(moss_carpet|short_grass|fern)$/) as unknown as string,
    ]);
    expect(out.counts.indexedColumns).toBe(1);
    expect(out.counts.indexedBlocks).toBe(1);
    // The closure stays exactly as closed as it was: an empty mask opens nothing.
    expect([...out.colonized].some((v) => v === 1)).toBe(false);
  });

  it("reserves channels 50–59, and takes none outside them", () => {
    const used = Object.values(GREEN_SKIN_CHANNELS);
    expect(new Set(used).size).toBe(used.length);
    for (const c of used) {
      expect(c).toBeGreaterThanOrEqual(GREEN_SKIN_CHANNEL_FIRST);
      expect(c).toBeLessThanOrEqual(GREEN_SKIN_CHANNEL_LAST);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §4.1 — the shared vocabulary                                                */
/* -------------------------------------------------------------------------- */

const HORIZONTALS: Readonly<Record<string, readonly [number, number, number]>> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

describe("growthFaces — the three laws (§4.1)", () => {
  it("law 1: every horizontal neighbour that is solid sets that face", () => {
    const solid = (x: number, _y: number, z: number): boolean => x === 0 && z === 1;
    const faces = growthFaces({ x: 1, y: 5, z: 1 }, solid);
    expect(faces).not.toBeNull();
    expect((faces as Record<string, string>)["west"]).toBe("true");
    expect((faces as Record<string, string>)["east"]).toBe("false");
  });

  it("law 2: `up` is derived, never inherited", () => {
    const ceiling = (_x: number, y: number, _z: number): boolean => y === 6;
    const head = growthFaces({ x: 1, y: 5, z: 1 }, ceiling);
    expect((head as Record<string, string>)["up"]).toBe("true");
    // One below the head, carrying the strand's face: `up` must be false, and
    // this is the defect that made `oldgrowth_vale-3` a stack of flat plates.
    const below = growthFaces({ x: 1, y: 4, z: 1 }, ceiling, "north");
    expect((below as Record<string, string>)["up"]).toBe("false");
    expect((below as Record<string, string>)["north"]).toBe("true");
  });

  it("law 3: a cell with no legal face is not emitted", () => {
    expect(growthFaces({ x: 1, y: 5, z: 1 }, () => false)).toBeNull();
  });

  it("the tiebreak is position-keyed and deterministic", () => {
    const candidates = ["north", "south", "west", "east"];
    const at = { x: 11, y: 71, z: -3 };
    expect(chooseGrowthFace(candidates, at)).toBe(chooseGrowthFace(candidates, at));
    expect(candidates).toContain(chooseGrowthFace(candidates, at));
    expect(chooseGrowthFace(["west"], at)).toBe("west");
  });

  it("names the blocks rule 27 polices, and nothing else", () => {
    expect(isMultifaceGrowth("vine")).toBe(true);
    expect(isMultifaceGrowth("glow_lichen")).toBe(true);
    expect(isMultifaceGrowth("sculk_vein")).toBe(true);
    expect(isMultifaceGrowth("oak_leaves")).toBe(false);
    expect(isMultifaceGrowth("stone_bricks")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* the property test: growthFaces and hangingFaces cannot drift                */
/* -------------------------------------------------------------------------- */

const HANGING_SUPPORT: ReadonlySet<FloraPart> = new Set<FloraPart>([
  "log",
  "branch",
  "root",
  "stem",
  "leaves",
  "cap",
]);

/** Every program × its envelope corners — the inputs the flora side produces. */
function floraMatrix(): { id: string; blocks: FloraBlock[] }[] {
  const out: { id: string; blocks: FloraBlock[] }[] = [];
  for (const [id, raw] of Object.entries(FLORA_SPECIES)) {
    const def = raw as FloraSpeciesDef;
    const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
    const [lo, hi] = def.height;
    for (const mega of [false, true]) {
      for (const radiusDelta of [-1, 0, 1]) {
        for (const height of [lo, hi, hi + 4]) {
          const v: FloraVariation = { height, radiusDelta, mega };
          let state = 0x9e3779b9;
          const rng = (): number => {
            state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
            return state / 4294967296;
          };
          out.push({ id: `${id}/${height}/${radiusDelta}/${mega}`, blocks: program.blocks(v, def, rng) });
        }
      }
    }
  }
  return out;
}

describe("growthFaces agrees with hangingFaces on every flora input (§4.1)", () => {
  const matrix = floraMatrix();

  it("produces a non-trivial number of hanging strands to check", () => {
    const hanging = matrix.reduce(
      (n, m) => n + m.blocks.filter((b) => b.part === "hanging").length,
      0,
    );
    expect(hanging).toBeGreaterThan(0);
  });

  it("law 1 and law 2 agree exactly, and law 3 propagates at most one face", () => {
    for (const { id, blocks } of matrix) {
      const occupied = new Map<string, FloraPart>();
      for (const b of blocks) occupied.set(`${b.dx},${b.dy},${b.dz}`, b.part);
      const solid = (x: number, y: number, z: number): boolean => {
        const part = occupied.get(`${x},${y},${z}`);
        return part !== undefined && HANGING_SUPPORT.has(part);
      };
      const faces = hangingFaces(blocks);
      for (const [key, props] of faces) {
        const [dx, dy, dz] = key.split(",").map(Number) as [number, number, number];
        const at = { x: dx, y: dy, z: dz };
        const base = growthFaces(at, solid);
        // Law 2, exactly: `up` is whatever the cell above genuinely is, in both
        // readers, whether or not the strand carried a face down.
        expect(props["up"], `${id} up @ ${key}`).toBe(solid(dx, dy + 1, dz) ? "true" : "false");
        // Law 1: every face the shared vocabulary derives on this cell's own
        // merits is set by the flora side too.
        if (base !== null) {
          for (const [face, value] of Object.entries(base)) {
            if (value === "true") expect(props[face], `${id} ${face} @ ${key}`).toBe("true");
          }
        }
        // Law 3: what the flora side sets *beyond* the cell's own merits is at
        // most one horizontal face — the strand's canonical one.
        const own = new Set(ownGrowthFaces(at, solid));
        const extra = Object.keys(HORIZONTALS).filter(
          (face) => props[face] === "true" && !own.has(face),
        );
        expect(extra.length, `${id} extra faces @ ${key}: ${extra.join(",")}`).toBeLessThanOrEqual(
          1,
        );
        // And the whole point, in vanilla's own terms: a face is held either by
        // a support on that face, or by the same growth directly above carrying
        // the same face (`VineBlock.getUpdatedState`'s chain clause) — which is
        // exactly what rule 27 asks of the world on disk.
        const carried = faces.get(`${dx},${dy + 1},${dz}`);
        const anchored = Object.entries(HORIZONTALS).some(
          ([face, [ox, oy, oz]]) =>
            props[face] === "true" &&
            (solid(dx + ox, dy + oy, dz + oz) || carried?.[face] === "true"),
        );
        expect(
          anchored || props["up"] === "true",
          `${id} @ ${key} has no true face that names a support`,
        ).toBe(true);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §8 — rule 27, read back off disk                                            */
/* -------------------------------------------------------------------------- */

/**
 * Write a hand-built block list into a real world and lint it.
 *
 * The bar is a **compiled world read back off disk**, not a unit test over an
 * op list — §8's own sentence, and RUINS-PLAN §8's before it.
 */
async function lintBlocks(
  label: string,
  blocks: readonly StructureBlock[],
): Promise<PhysicsReport> {
  const root = await mkdtemp(path.join(tmpdir(), `terrainist-green-skin-${label}-`));
  scratch.push(root);
  const dir = path.join(root, label);
  const chunks = new Map<string, EmitChunk>();
  const chunkFor = (x: number, z: number): EmitChunk => {
    const key = `${x >> 4},${z >> 4}`;
    let chunk = chunks.get(key);
    if (chunk === undefined) {
      chunk = stack.createChunk();
      chunks.set(key, chunk);
    }
    return chunk;
  };
  const setBlock = (x: number, y: number, z: number, stateId: number): void => {
    chunkFor(x, z).setStateId(x - (x >> 4) * 16, y, z - (z >> 4) * 16, stateId);
  };
  // Ground under everything, so the world reads back as a world and a support
  // chain that reaches the floor has reached something.
  const stone = stack.blockByName("stone")?.stateId as number;
  const grass = stack.blockByName("grass_block")?.stateId as number;
  for (let z = -2; z < 20; z++) {
    for (let x = -2; x < 20; x++) {
      for (let y = GROUND - 4; y < GROUND; y++) setBlock(x, y, z, stone);
      setBlock(x, GROUND, z, grass);
    }
  }
  for (const b of blocks) setBlock(b.x, b.y, b.z, b.stateId);
  await writeWorldFiles({
    chunks,
    worldDir: dir,
    levelName: label,
    spawn: { x: 0, y: GROUND + 1, z: 0 },
    stack,
  });
  return lintWorldPhysics(dir, stack, { minY: GROUND - 4, maxY: GROUND + 12 });
}

describe("rule 27 — unsupported.multiface (§8)", () => {
  it("is in the rule list, and the list is now 27 long", () => {
    expect(PHYSICS_RULES).toContain("unsupported.multiface");
    expect(PHYSICS_RULES.length).toBe(27);
  });

  it("fires zero on a wall whose vines were faced by `growthFaces`", async () => {
    const wall = stateOf("stone_bricks");
    const blocks: StructureBlock[] = [];
    // A wall along z = 8, and vines on its west face at x = 7.
    for (let z = 4; z < 12; z++) {
      for (let y = GROUND + 1; y <= GROUND + 5; y++) blocks.push({ x: 8, y, z, stateId: wall });
    }
    const solid = (x: number, y: number, z: number): boolean =>
      x === 8 && z >= 4 && z < 12 && y >= GROUND + 1 && y <= GROUND + 5;
    let vines = 0;
    for (let z = 4; z < 12; z++) {
      for (let y = GROUND + 1; y <= GROUND + 5; y++) {
        const at = { x: 7, y, z };
        const faces = growthFaces(at, solid);
        if (faces === null) continue;
        blocks.push({ x: 7, y, z, stateId: vineOf(faces) });
        vines++;
      }
    }
    expect(vines).toBeGreaterThan(20);
    const report = await lintBlocks("faced", blocks);
    expect(report.counts["unsupported.multiface"]).toBe(0);
    for (const rule of PHYSICS_RULES) expect(report.counts[rule], rule).toBe(0);
  }, 120_000);

  it("catches a vine whose every true face points at air, and an inherited `up`", async () => {
    const wall = stateOf("stone_bricks");
    const blocks: StructureBlock[] = [];
    for (let y = GROUND + 1; y <= GROUND + 5; y++) blocks.push({ x: 8, y, z: 8, stateId: wall });
    // Mis-faced: it claims `east`, and east of it is open air.
    blocks.push({
      x: 4,
      y: GROUND + 3,
      z: 4,
      stateId: vineOf({
        north: "false",
        south: "false",
        east: "true",
        west: "false",
        up: "false",
      }),
    });
    // Inherited `up`: flush against the wall, but claiming a ceiling it has not
    // got. This is the flat plate hanging in space.
    blocks.push({
      x: 7,
      y: GROUND + 2,
      z: 8,
      stateId: vineOf({
        north: "false",
        south: "false",
        east: "true",
        west: "false",
        up: "true",
      }),
    });
    const report = await lintBlocks("misfaced", blocks);
    expect(report.counts["unsupported.multiface"]).toBe(2);
    const details = report.findings.map((f) => f.detail).join("\n");
    expect(details).toContain("points at air");
    expect(details).toContain("nothing solid above");
  }, 120_000);
});

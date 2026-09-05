/**
 * **Nothing hangs on air in a ruin** — Kai's walk, 2026-08-13:
 *
 * > "a lot of the ruined/destroyed buildings often have floating trapdoors."
 *
 * He was right, and the number was 6,568: a window shutter is an *open*
 * trapdoor hinged to the wall beside the window, vanilla never pops a trapdoor
 * when that wall goes, and so no support rule in this repo had ever been asked
 * about one. `supportDirection` returned `null` for it, the `settleFixtures`
 * fixpoint's stranded-fitting clause skipped it (a trapdoor is not a full cube
 * and not in `FLOATABLE`), and every crumbled facade in every ruined building
 * kept its shutters hanging in mid-air. The buttons and levers of a control
 * panel went the same way for the same reason, in smaller numbers.
 *
 * The fix is a *vocabulary* fix, not a guard: `support.ts` now classifies the
 * shutter, the button and the lever, so the sweep and the lint ask the same
 * question about them as they already ask about a ladder. This file is the
 * measurement that says it worked, in the shape the defect had — **the whole
 * catalog, decayed** — because a spot check is what let 6,568 of them ship.
 *
 * Three things are pinned, and the middle one matters as much as the first:
 *
 * 1. no attachable in a decayed shell is anchored to air;
 * 2. a shutter hinged on a **window pane** survives — the sweep removes the
 *    defect, not the shutters;
 * 3. the sweep is scoped to decayed shells: an intact building is not swept,
 *    and the fixtures an intact archetype hangs off nothing are still there.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  INSUBSTANTIAL,
  anchorNeedsFullCube,
  canSupport,
  generateBuilding,
  nodeSeed,
  substantial,
  supportDirection,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xf19n, "world.ruin");
const SIZE: [number, number, number] = [13, 17, 15];

/**
 * The three bands RUINS-PLAN §6 names, as the dial an author writes — one per
 * archetype, rotating.
 *
 * Every archetype is swept; the band it is swept at rotates with its index, so
 * each band gets around eighty-six shells and the whole file stays inside a
 * minute. The alternative (every archetype × every band) is four times the work
 * for a measurement that already found the defect in every shell that had one.
 * `packages/compiler/test/ruins-sweep.test.ts` is the every-band pass, on a
 * category sample, through a real world.
 */
const BANDS = [0.35, 0.6, 0.9] as const;

/**
 * The families this file is about: the three `support.ts` learned on
 * 2026-08-13.
 *
 * Narrow on purpose. The other attachables were already swept and are already
 * pinned by `decay-engine.test.ts` and the compiler's ruins sweep, and two of
 * them answer a *different* question than a plain support scan does — the
 * doorway column is deliberately never swept, and a lantern standing on a
 * cobblestone wall is legal to the lint's own lenient test. Re-deriving those
 * exceptions here would make this file a second, weaker copy of the sweep
 * instead of a measurement of the defect Kai walked into.
 */
function isNewlyPoliced(name: string): boolean {
  return name.endsWith("_trapdoor") || name.endsWith("_button") || name === "lever";
}

/** `(dx, dz)` per cardinal name — the sweep's own step table. */
const STEP: Readonly<Record<string, readonly [number, number]>> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

function build(archetype: string, decay?: number): readonly LocalVoxelOp[] {
  return generateBuilding({
    size: SIZE,
    params: { archetype, floors: 2, ...(decay === undefined ? {} : { decay }) },
    seed: SEED,
    style: BUILDING_STYLE_DEFAULTS,
  }).ops;
}

/** The world an op list folds to: last write wins, air erases. */
function worldOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const out = new Map<string, LocalVoxelOp>();
  for (const op of ops) out.set(`${op.x},${op.y},${op.z}`, op);
  for (const [key, op] of [...out]) if (op.block === "air") out.delete(key);
  return out;
}

/**
 * Which cell holds this fixture up, **stated here rather than imported**.
 *
 * Deliberately a second statement of vanilla's rule, and the one place in this
 * repo where restating it is right. Everything else in the sweep asks
 * `supportDirection`, which is the whole point of `support.ts` — but a
 * regression test that asks the classifier where the anchor is cannot fail on
 * the code it was written against: the shipped bug *was* the classifier
 * answering `null`, so a scan built on it would have found zero orphans in the
 * 6,568-orphan world and passed. This function is what makes the test a
 * measurement of the shells instead of a tautology, and the unit test above
 * holds the two statements to each other.
 */
function anchorOf(op: LocalVoxelOp): readonly [number, number, number] | null {
  const p = op.props ?? {};
  const behind = (): readonly [number, number, number] | null => {
    const step = STEP[p["facing"] ?? ""];
    if (step === undefined) return null;
    return [op.x - step[0], op.y, op.z - step[1]];
  };
  if (op.block.endsWith("_trapdoor")) return p["open"] === "true" ? behind() : null;
  if (op.block.endsWith("_button") || op.block === "lever") {
    if (p["face"] === "floor") return [op.x, op.y - 1, op.z];
    if (p["face"] === "ceiling") return [op.x, op.y + 1, op.z];
    return behind();
  }
  return null;
}

/**
 * Every fixture in one shell whose anchor cell holds nothing.
 *
 * Below the shell's floor plane is ground, not nothing: a fit-out cannot see
 * the terrain it is dropped on, and the sweep grants `y === 1` its floor for
 * exactly that reason.
 */
function orphans(ops: readonly LocalVoxelOp[]): string[] {
  const world = worldOf(ops);
  const found: string[] = [];
  for (const [key, op] of world) {
    if (!isNewlyPoliced(op.block)) continue;
    const cell = anchorOf(op);
    if (cell === null || cell[1] < 1) continue;
    const holds = anchorNeedsFullCube(op.block) ? canSupport : substantial;
    const anchor = world.get(`${cell[0]},${cell[1]},${cell[2]}`)?.block;
    if (anchor !== undefined && holds(anchor)) continue;
    found.push(
      `${op.block} @${key} facing=${op.props?.["facing"] ?? "-"} anchor=${anchor ?? "air"}`,
    );
  }
  return found;
}

/** Open trapdoors in a shell, by what they are hinged to. */
function shutters(ops: readonly LocalVoxelOp[]): { onPane: number; total: number } {
  const world = worldOf(ops);
  let onPane = 0;
  let total = 0;
  for (const op of world.values()) {
    if (!op.block.endsWith("_trapdoor") || op.props?.["open"] !== "true") continue;
    total++;
    const step = STEP[op.props?.["facing"] ?? ""];
    if (step === undefined) continue;
    const anchor = world.get(`${op.x - step[0]},${op.y},${op.z - step[1]}`)?.block;
    if (anchor !== undefined && anchor.endsWith("_pane")) onPane++;
  }
  return { onPane, total };
}

describe("the shutter, in the shared support vocabulary", () => {
  it("hinges an open trapdoor behind it, and leaves a closed one alone", () => {
    expect(supportDirection("spruce_trapdoor", { facing: "north", open: "true" })).toBe("behind");
    // Closed: a horizontal panel — a table top, an awning, a cart wheel, a
    // ship's batten. Vanilla holds it up with nothing and so does this table.
    expect(supportDirection("spruce_trapdoor", { facing: "north", open: "false" })).toBeNull();
    expect(supportDirection("oak_trapdoor", undefined)).toBeNull();
  });

  it("reads a button and a lever off the face they are mounted on", () => {
    expect(supportDirection("stone_button", { face: "wall", facing: "south" })).toBe("behind");
    expect(supportDirection("stone_button", { face: "floor", facing: "south" })).toBe("below");
    expect(supportDirection("stone_button", { face: "ceiling", facing: "south" })).toBe("above");
    expect(supportDirection("lever", { face: "wall", facing: "west" })).toBe("behind");
  });

  it("does not mistake a trapdoor for a door", () => {
    // `"oak_trapdoor".endsWith("_door")` is false, and the whole door clause
    // rests on that. Pinned because it is one underscore from being true.
    expect(supportDirection("oak_door", { half: "lower" })).toBe("below");
    expect(supportDirection("oak_trapdoor", { open: "true", facing: "north" })).toBe("behind");
  });

  it("agrees with this file's own statement of vanilla's rule", () => {
    // The two statements, held to each other on every case the catalog
    // produces. `anchorOf` is the reason the sweep test is not a tautology;
    // this is the reason the two cannot drift apart in silence.
    const cases: readonly LocalVoxelOp[] = [
      { x: 5, y: 4, z: 6, block: "spruce_trapdoor", props: { open: "true", facing: "north" } },
      { x: 5, y: 4, z: 6, block: "spruce_trapdoor", props: { open: "true", facing: "east" } },
      { x: 5, y: 4, z: 6, block: "spruce_trapdoor", props: { open: "false", facing: "east" } },
      { x: 5, y: 4, z: 6, block: "stone_button", props: { face: "wall", facing: "south" } },
      { x: 5, y: 4, z: 6, block: "stone_button", props: { face: "floor", facing: "south" } },
      { x: 5, y: 4, z: 6, block: "lever", props: { face: "ceiling", facing: "west" } },
    ];
    for (const op of cases) {
      const dir = supportDirection(op.block, op.props);
      const cell = anchorOf(op);
      if (dir === null) {
        expect(cell, op.block).toBeNull();
        continue;
      }
      expect(cell, op.block).not.toBeNull();
      const [x, y, z] = cell as readonly [number, number, number];
      if (dir === "below") expect([x, y, z]).toEqual([op.x, op.y - 1, op.z]);
      else if (dir === "above") expect([x, y, z]).toEqual([op.x, op.y + 1, op.z]);
      else {
        const step = STEP[op.props?.["facing"] ?? ""] as readonly [number, number];
        expect([x, y, z]).toEqual([op.x - step[0], op.y, op.z - step[1]]);
      }
    }
  });

  it("asks only the shutter for the lenient anchor", () => {
    expect(anchorNeedsFullCube("spruce_trapdoor")).toBe(false);
    expect(anchorNeedsFullCube("ladder")).toBe(true);
    expect(anchorNeedsFullCube("oak_wall_sign")).toBe(true);
    // A shutter hangs on a pane; a ladder does not.
    expect(substantial("glass_pane")).toBe(true);
    expect(canSupport("glass_pane")).toBe(false);
    for (const nothing of ["air", "water", "vine", "cave_air"]) {
      expect(substantial(nothing), nothing).toBe(false);
      expect(INSUBSTANTIAL.test(nothing), nothing).toBe(true);
    }
  });
});

/** Every archetype, decayed once at its rotating band — built once, read thrice. */
const DECAYED = BUILDING_ARCHETYPES.map((archetype, i) => {
  const decay = BANDS[i % BANDS.length] as number;
  return { archetype, decay, ops: build(archetype, decay) };
});

describe("the catalog, decayed: nothing hangs on air", () => {
  it("leaves no orphaned shutter, button or lever in any shell", () => {
    const found: string[] = [];
    for (const { archetype, decay, ops } of DECAYED) {
      for (const line of orphans(ops)) found.push(`${archetype}@${decay}: ${line}`);
    }
    // Named rather than counted: a failure has to say which shell and which
    // fixture, because the fix is always in one of the two.
    expect(found.slice(0, 20).join("\n")).toBe("");
    expect(found.length).toBe(0);
  });

  it("still leaves shutters on the windows whose glass outlived the wall", () => {
    // The sweep removes the defect, not the fixture family. Held over the
    // whole catalog rather than one archetype, so no single pack's edit can
    // silently turn this into a vacuous pass.
    let onPane = 0;
    let total = 0;
    for (const { ops } of DECAYED) {
      const s = shutters(ops);
      onPane += s.onPane;
      total += s.total;
    }
    expect(total).toBeGreaterThan(100);
    expect(onPane).toBeGreaterThan(50);
  });
});

describe("the sweep is the decay's, and only the decay's", () => {
  it("does not touch an intact building", () => {
    // The proof that the fixpoint is scoped to a decayed shell, stated as the
    // property it would break if it were not: intact archetypes hang fixtures
    // off nothing all over the catalog — a chalet's shutters stand proud of
    // the facade, a weather station's panel is set into the wall plane — and
    // every one of them is still there. Those are the archetypes' business,
    // not the decay's, and this test exists so a later sweep cannot quietly
    // start deleting them.
    let intactOrphans = 0;
    for (const archetype of BUILDING_ARCHETYPES) intactOrphans += orphans(build(archetype)).length;
    expect(intactOrphans).toBeGreaterThan(0);
  });

  it("is deterministic: the same decayed shell twice is the same op list", () => {
    for (const { archetype, decay, ops } of DECAYED.slice(0, 8)) {
      expect(build(archetype, decay)).toEqual(ops);
    }
  });
});

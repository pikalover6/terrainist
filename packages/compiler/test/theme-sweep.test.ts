/**
 * The theme × archetype sweep.
 *
 * ## The defect class
 *
 * A theme is only as tested as the archetypes that happen to have used it.
 * Two bugs of exactly that shape shipped before this file existed:
 *
 * - **a block that does not exist.** A theme (and two underground fit-outs)
 *   named `smooth_stone_stairs`, which is not a block in the pinned emit
 *   version. Silent until something built with it.
 * - **a role that cannot carry what the grammar puts on it.** `modern_city`
 *   mapped `fence` to `iron_bars`; the grammar treats that role as a *post you
 *   can stand something on*, and iron bars carry no support chain. The first
 *   real settlement in that theme produced 489 `unsupported.chain` findings,
 *   because until then only the high-rise exhibit row had ever used it.
 *
 * ## What runs by default, and what does not
 *
 * **By default** (every push):
 *
 * | check | coverage |
 * | --- | --- |
 * | theme block ids exist | every role of every wood/stone/roof set of every theme in `ALL_MATERIAL_THEMES`, plus the derived family names |
 * | generated block ids exist | **the full cross-product** — every theme × every archetype the exhibit grid carries, and every theme × every prop |
 * | ground-floor walkability | **the full cross-product**, buildings |
 * | physics lint, zero findings | the **default subset** × every theme, buildings only, no props: one archetype per exhibit family, plus the two heaviest users of every style role (~67 of 226) |
 *
 * The role half of that subset is not decoration. Measured, with
 * `modern_city`'s `fence` put back to `iron_bars`: the family representatives
 * alone linted **clean**, the role subset found 223 `unsupported.chain`, and
 * the whole cross-product found 820. A breadth-only default would have missed
 * the very bug this file was written for.
 *
 * **Only under `TERRAINIST_THEME_SWEEP=1`**: the physics lint over the *whole*
 * cross-product — every archetype and every prop and vehicle, in every theme,
 * one world per theme. That is the mode that would have caught the `iron_bars`
 * bug on any archetype rather than on a representative one; it takes tens of
 * minutes, which is why it follows the `TERRAINIST_DEVWORLD_PHYSICS` precedent
 * rather than sitting in the per-push gate.
 *
 * So the honest statement of the default's limit: **the op-level checks are
 * exhaustive; the physics lint is not.** A theme role that only one non-
 * representative archetype stands something on is caught by the exhaustive run
 * and not by the fast one.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ALL_MATERIAL_THEMES,
  BUILDING_ARCHETYPES,
  PROP_GENERATORS,
  assignMaterials,
  generateBuilding,
  generateProp,
  nodeSeed,
  pickTheme,
  type BuildingMaterials,
  type MaterialTheme,
} from "@terrainist/stdlib";

// The shared walkability helper. It lives in stdlib's test tree because that
// is where the op-list-level walk belongs; importing it is deliberate — a
// third definition of "passable" is exactly the failure it was written to end.
import { walkabilityReport } from "../../stdlib/test/helpers/walkability.js";

import { connectiveKindOf } from "../src/emit/connections.js";
import { exhibitParams } from "../src/devworld.js";
import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import {
  SWEEP_SEED,
  buildSweepWorld,
  packSweep,
  sweepBuildingCells,
  sweepDefaultCells,
  sweepFamilyCells,
  sweepPropCells,
  sweepRoleCells,
  unsweptArchetypes,
  unsweptProps,
} from "../src/theme-sweep.js";

const EXHAUSTIVE = process.env["TERRAINIST_THEME_SWEEP"] === "1";

const stack: PrismarineStack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const scratch: string[] = [];

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Does the pinned version have this block at all? Cached; asked a lot. */
const knownCache = new Map<string, boolean>();
function known(name: string): boolean {
  let hit = knownCache.get(name);
  if (hit === undefined) {
    hit = stack.blockByName(name) != null;
    knownCache.set(name, hit);
  }
  return hit;
}

/** The materials one swept cell is dealt — the document's own code path. */
function materialsFor(theme: MaterialTheme, nodePath: string): BuildingMaterials {
  const seed = nodeSeed(SWEEP_SEED, nodePath, "");
  return assignMaterials(pickTheme(seed, theme.id), 1, seed)[0] as BuildingMaterials;
}

/* -------------------------------------------------------------------------- */
/* 1. the themes' own block ids                                                */
/* -------------------------------------------------------------------------- */

describe("every theme names blocks that exist", () => {
  it("resolves every role of every wood, stone and roof set", () => {
    const missing: string[] = [];
    for (const theme of ALL_MATERIAL_THEMES) {
      const sets: readonly (readonly [string, Record<string, string>])[] = [
        ...theme.woods.map((w) => ["wood", w as unknown as Record<string, string>] as const),
        ...theme.stones.map((s) => ["stone", s as unknown as Record<string, string>] as const),
        ...theme.roofs.map((r) => ["roof", r as unknown as Record<string, string>] as const),
      ];
      for (const [kind, set] of sets) {
        for (const [role, id] of Object.entries(set)) {
          if (role === "id") continue;
          if (!known(id)) missing.push(`${theme.id} ${kind}:${set["id"]} ${role} = ${id}`);
        }
      }
    }
    expect(missing.join("\n")).toBe("");
  });

  it("completes every wood family a set derives its names from", () => {
    // `wood()` in themes.ts builds a whole set by suffixing an id, and a
    // *derived* name is exactly where a missing block hides — `wood("bamboo")`
    // would name a `bamboo_log` that does not exist. So: whenever a set's id
    // is a real plank family, demand the whole family, not just the roles the
    // set happens to have filled in.
    const missing: string[] = [];
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const w of theme.woods) {
        if (!known(`${w.id}_planks`)) continue; // a concrete set: nothing derived
        for (const derived of [
          `${w.id}_planks`,
          `${w.id}_log`,
          `stripped_${w.id}_log`,
          `${w.id}_stairs`,
          `${w.id}_slab`,
          `${w.id}_fence`,
          `${w.id}_fence_gate`,
          `${w.id}_door`,
          `${w.id}_trapdoor`,
          `${w.id}_button`,
          `${w.id}_pressure_plate`,
          `${w.id}_sign`,
        ]) {
          if (!known(derived)) missing.push(`${theme.id} wood:${w.id} derived ${derived}`);
        }
      }
    }
    expect(missing.join("\n")).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* 2 + 4. the op-level cross-product: block ids and walkability                */
/* -------------------------------------------------------------------------- */

describe("the cross-product, at op level", () => {
  const buildings = sweepBuildingCells();
  const props = sweepPropCells();

  it("covers every archetype the registry declares", () => {
    // A sweep that silently checks a fraction reads as coverage and is worse
    // than none, so the hole is asserted rather than described.
    expect(unsweptArchetypes()).toEqual([]);
    expect(buildings).toHaveLength(BUILDING_ARCHETYPES.length);
  });

  it("covers every prop the registry declares", () => {
    expect(unsweptProps()).toEqual([]);
    expect(props).toHaveLength(Object.keys(PROP_GENERATORS).length);
  });

  it("generates only blocks and states that exist, for every theme × archetype", () => {
    // Both name-level claims in one generation pass: the cross-product is 900
    // buildings and generating it twice was half this file's runtime.
    //
    // Claim one: every block a cell emits is a block the pinned version has.
    // That is the `smooth_stone_stairs` class — a name that resolves nowhere,
    // silent until something builds with it.
    //
    // Claim two: every (block, properties) pair resolves to a real STATE.
    // When `blockStateOf` refuses a pair, `resolveState` in
    // `structures/buildings.ts` silently falls back to the block's default
    // state — so a property this version does not have is not an error anyone
    // sees, it is a block that quietly comes out wrong.
    //
    // Two classes of dropped property are provably inert and not reported:
    //
    // - **a block with no properties at all.** A theme that answers the
    //   `wall.accent` role with `light_gray_concrete` is asked for `axis=y`,
    //   because that role is a log in the timber themes. Concrete has one
    //   state, so the fallback IS the block — nothing is lost but a grain that
    //   was never there.
    // - **anything the connection pass owns.** A wall or a fence is emitted
    //   with placeholder connection flags and rewritten from its neighbours by
    //   `applyConnectionStates`; `physics.ts` then checks the result.
    //
    // And one waiver, left standing on purpose:
    //
    //   `cauldron[level=…]` — 1.21.11 moved the level onto `water_cauldron`,
    //   so every "full cauldron" this grammar places has been emitting an
    //   EMPTY cauldron. Swapping in `water_cauldron` would put visible water
    //   in a dozen archetypes' interiors, which is a change to how they look,
    //   and looks are Kai's call. Reported, not guessed at.
    const WAIVED = new Set(["cauldron"]);
    const inert = (block: string): boolean => {
      if (connectiveKindOf(block) !== undefined) return true;
      const def = stack.blockByName(block);
      if (def === undefined) return false;
      const decoded = stack.blockStateProps(def.stateId);
      return decoded !== undefined && Object.keys(decoded.props).length === 0;
    };

    const missing: string[] = [];
    const bad: string[] = [];
    const seenPairs = new Set<string>();
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const cell of buildings) {
        const nodePath = `sweep.${theme.id}.${cell.row}.${cell.id}`;
        const seed = nodeSeed(SWEEP_SEED, nodePath, "");
        const result = generateBuilding({
          size: cell.size,
          params: exhibitParams(cell),
          seed,
          materials: materialsFor(theme, nodePath),
        });
        const seen = new Set<string>();
        for (const op of result.ops) {
          if (!known(op.block)) {
            if (seen.has(op.block)) continue;
            seen.add(op.block);
            missing.push(`${theme.id} × ${cell.archetype}: ${op.block}`);
            continue;
          }
          if (op.props === undefined || WAIVED.has(op.block) || inert(op.block)) continue;
          const key = `${op.block}|${Object.entries(op.props)
            .sort()
            .map(([k, v]) => `${k}=${v}`)
            .join(",")}`;
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          if (stack.blockStateOf(op.block, { ...op.props }) === undefined) {
            bad.push(`${theme.id} × ${cell.archetype}: ${key}`);
          }
        }
      }
    }
    // Deduped across the whole sweep, so a failure reads as the list of
    // distinct broken names and states, not the first twenty cells to hit one.
    expect(missing.join("\n")).toBe("");
    expect(bad.join("\n")).toBe("");
  }, 300_000);

  it("generates only blocks that exist, for every theme × prop", () => {
    const missing: string[] = [];
    for (const theme of ALL_MATERIAL_THEMES) {
      for (const cell of props) {
        const nodePath = `sweep.${theme.id}.prop.${cell.row}.${cell.id}`;
        const result = generateProp({
          prop: cell.prop,
          seed: nodeSeed(SWEEP_SEED, nodePath, ""),
          params: cell.params,
          materials: materialsFor(theme, nodePath),
        });
        const seen = new Set<string>();
        for (const op of result.ops) {
          if (known(op.block) || seen.has(op.block)) continue;
          seen.add(op.block);
          missing.push(`${theme.id} × prop:${cell.prop}: ${op.block}`);
        }
      }
    }
    expect(missing.join("\n")).toBe("");
  }, 300_000);

});

/* -------------------------------------------------------------------------- */
/* 4. walkability, differentially                                              */
/* -------------------------------------------------------------------------- */

describe("no theme costs an archetype its walkable ground floor", () => {
  /**
   * The claim is **differential**, and deliberately so.
   *
   * `walkabilityReport` is the physics lint's walk run at op-list level, and
   * it errs toward calling an unrecognised block a full cube — so a handful of
   * archetypes report a cell it will not enter that their own wave test
   * exempts by hand. Re-litigating those here would be a third opinion about
   * what is passable, which is exactly what the shared helper exists to
   * prevent. What is *this* file's business is the theme: the geometry is
   * theme-independent, so whatever the baseline theme walks, every other theme
   * must walk too. A theme that swaps a role for something a body cannot pass
   * — or cannot stand on — shows up here as a cell the baseline had and this
   * theme lost.
   */
  it("walks the same floor in every theme as in the baseline", () => {
    const [baseline, ...rest] = ALL_MATERIAL_THEMES;
    const regressions: string[] = [];
    const walk = (theme: MaterialTheme, cell: ReturnType<typeof sweepBuildingCells>[number]) => {
      const nodePath = `sweep.${theme.id}.${cell.row}.${cell.id}`;
      const seed = nodeSeed(SWEEP_SEED, nodePath, "");
      const result = generateBuilding({
        size: cell.size,
        params: exhibitParams(cell),
        seed,
        materials: materialsFor(theme, nodePath),
      });
      return walkabilityReport(result as never);
    };
    for (const cell of sweepBuildingCells()) {
      const base = walk(baseline as MaterialTheme, cell);
      for (const theme of rest) {
        const here = walk(theme, cell);
        if (base.start !== null && here.start === null) {
          regressions.push(`${theme.id} × ${cell.archetype}: no way in, and the baseline had one`);
          continue;
        }
        if (here.reachable.length < base.reachable.length) {
          regressions.push(
            `${theme.id} × ${cell.archetype}: reaches ${here.reachable.length} of the ` +
              `${base.reachable.length} floor cells the baseline reaches\n${here.map}`,
          );
        }
      }
    }
    expect(regressions.slice(0, 5).join("\n")).toBe("");
  }, 600_000);
});

/* -------------------------------------------------------------------------- */
/* 3. the physics lint                                                         */
/* -------------------------------------------------------------------------- */

/** Render a report's findings compactly, so a failure names the block. */
function summarize(report: PhysicsReport): string {
  return report.findings
    .slice(0, 12)
    .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
    .join("\n");
}

describe("the physics lint, per theme", () => {
  const cells = EXHAUSTIVE ? sweepBuildingCells() : sweepDefaultCells();
  const reports = new Map<string, PhysicsReport>();

  beforeAll(async () => {
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-theme-sweep-"));
    scratch.push(root);
    for (const theme of ALL_MATERIAL_THEMES) {
      const world = await buildSweepWorld({
        outDir: root,
        theme: theme.id,
        cells,
        ...(EXHAUSTIVE ? { props: true } : {}),
      });
      reports.set(
        theme.id,
        await lintWorldPhysics(world.worldDir, stack, {
          buildings: world.buildings as never,
          props: world.props as never,
        }),
      );
      // One world at a time, and dropped as soon as it is linted: the
      // exhaustive run is four worlds of every archetype there is, and keeping
      // them all is gigabytes for no reader.
      await rm(world.worldDir, { recursive: true, force: true });
    }
  }, EXHAUSTIVE ? 7_200_000 : 1_200_000);

  it("swept a meaningful number of cells", () => {
    // The default subset is breadth *and* depth, and both halves are load
    // bearing — see the header. A change that quietly shrinks either one is a
    // change to what this gate covers, so it has to fail here.
    expect(sweepFamilyCells().length).toBeGreaterThanOrEqual(20);
    expect(sweepRoleCells().length).toBeGreaterThanOrEqual(20);
    const inDefault = new Set(sweepDefaultCells().map((e) => e.id));
    for (const e of sweepFamilyCells()) expect(inDefault.has(e.id), e.id).toBe(true);
    for (const e of sweepRoleCells()) expect(inDefault.has(e.id), e.id).toBe(true);
    expect(cells.length).toBeGreaterThanOrEqual(60);
    if (EXHAUSTIVE) expect(cells).toHaveLength(BUILDING_ARCHETYPES.length);
    expect(packSweep(cells).slots).toHaveLength(cells.length);
  });

  for (const theme of ALL_MATERIAL_THEMES) {
    it(`finds nothing wrong in ${theme.id}, under every rule`, () => {
      const report = reports.get(theme.id) as PhysicsReport;
      expect(report.examined).toBeGreaterThan(100_000);
      expect(summarize(report)).toBe("");
      for (const rule of PHYSICS_RULES) expect(report.counts[rule], `${theme.id} ${rule}`).toBe(0);
    });
  }
});

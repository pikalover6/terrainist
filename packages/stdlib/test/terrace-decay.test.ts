/**
 * The ruin dial (P6 part one, Stocktake Run unit 36; F22): a terrace ruins
 * with the shell's own decay operators, bay by bay. A terrace asked for with
 * `decay` is ruined and says so; asked for none it is whole and byte-identical
 * to one that never asked; the pure `decayTerraceBays` is exercised directly
 * on an emitted terrace. The `TERRACE_DECAY` switch was deleted with its dead
 * off-path by the Deslop Run (unit 9); ruin is unconditional now.
 */

import { describe, expect, it } from "vitest";

import { BUILDING_STYLE_DEFAULTS, generateBuilding, nodeSeed } from "../src/index.js";
import { TERRACE_STOREY_HEIGHT, decayTerraceBays, planTerrace } from "../src/structures/terrace.js";
import { streamSeed } from "../src/determinism/index.js";
import type { LocalVoxelOp } from "../src/structures/core.js";

const SEED = nodeSeed(0xf22n, "world.ruined_metropolis.terrace_0");
const SIZE: readonly [number, number, number] = [31, 30, 13];

function build(extra: Record<string, unknown>): ReturnType<typeof generateBuilding> {
  return generateBuilding({
    size: SIZE,
    params: { archetype: "terrace", floors: 2, ...extra },
    seed: SEED,
    style: BUILDING_STYLE_DEFAULTS,
  });
}

describe("a terrace can ruin", () => {
  it("on, a terrace asked for with decay is ruined and says so; asked for none, it is whole and byte-identical", () => {
    const whole = build({});
    const none = build({ decay: 0 });
    expect(JSON.stringify(none.ops)).toBe(JSON.stringify(whole.ops));
    expect((none.meta as { decay?: unknown }).decay).toBeUndefined();
    const asked = build({ decay: 0.8 });
    expect(JSON.stringify(asked.ops)).not.toBe(JSON.stringify(whole.ops));
    const report = (asked.meta as { decay?: { written: number; mode: string } }).decay;
    expect(report).toBeDefined();
    expect(report?.mode).not.toBe("none");
    expect(report?.written ?? 0).toBeGreaterThan(0);
  });

  it("the per-bay pass ruins an emitted terrace with the shell's operators", () => {
    const whole = build({});
    const cells = new Map<string, LocalVoxelOp>();
    for (const op of whole.ops) cells.set(`${op.x},${op.y},${op.z}`, op);
    const before = cells.size;
    const put = (x: number, y: number, z: number, block: string, props?: Record<string, string>): void => {
      cells.set(`${x},${y},${z}`, { x, y, z, block, ...(props === undefined ? {} : { props }) } as LocalVoxelOp);
    };
    const plan = planTerrace({
      sx: SIZE[0],
      storeyHeight: TERRACE_STOREY_HEIGHT,
      floors: 2,
      archetype: "terrace",
      stream: streamSeed(SEED, "terrace"),
    });
    const h = TERRACE_STOREY_HEIGHT;
    const report = decayTerraceBays({
      put,
      cells,
      bays: plan.bays,
      bayStyle: plan.bays.map(() => BUILDING_STYLE_DEFAULTS),
      storeyHeight: h,
      sz: SIZE[2],
      iz0: 1,
      iz1: SIZE[2] - 2,
      copingOf: (i) => (plan.bays[i]?.floors ?? 1) * h + 2,
      decay: 0.8,
    });
    expect(plan.bays.length).toBeGreaterThan(1);
    expect(report.mode).not.toBe("none");
    expect(report.written).toBeGreaterThan(0);
    // The pass wrote air over standing courses: some of the shell is gone.
    const air = [...cells.values()].filter((op) => op.block === "air").length;
    expect(air).toBeGreaterThan(0);
    expect(cells.size).toBeGreaterThanOrEqual(before);
  });
});

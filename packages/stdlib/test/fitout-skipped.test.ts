/**
 * `FitOutContext.skipped` — a fit-out says what it could not do (Stocktake
 * Run unit 34, F29). Probe pass 3 asked for `archetype: "lighthouse",
 * floors: 2, roof: "flat"` and got a two-floor box: the flat roof leaves one
 * course above the eave where the roof rebuild needs two, `roofPlan` is null,
 * and `fitLighthouse` skips its bands, gallery and lamp. The reason now lands
 * in `meta.fitOutSkipped`, which the compiler reports as `LOAM-W524`.
 */

import { describe, expect, it } from "vitest";

import { BUILDING_STYLE_DEFAULTS, generateBuilding, nodeSeed } from "../src/index.js";

const SEED = nodeSeed(0xf29n, "world.lighthouse_tower");
const SIZE: readonly [number, number, number] = [11, 22, 11];

function build(extra: Record<string, unknown>): ReturnType<typeof generateBuilding> {
  return generateBuilding({
    size: SIZE,
    params: { archetype: "lighthouse", floors: 2, ...extra },
    seed: SEED,
    style: BUILDING_STYLE_DEFAULTS,
  });
}

describe("a fit-out that skips its own roof work says so", () => {
  it("names the flat roof that left no room for the lighthouse's gallery and lamp", () => {
    const meta = build({ roof: "flat" }).meta as { fitOutSkipped?: readonly string[] };
    expect(meta.fitOutSkipped).toBeDefined();
    expect(meta.fitOutSkipped?.join(" ")).toMatch(/roof work: 1 course above the eave where the rebuild needs 2/);
  });
  it("is silent when the roof leaves the rebuild its courses", () => {
    const meta = build({}).meta as { fitOutSkipped?: readonly string[] };
    expect(meta.fitOutSkipped).toBeUndefined();
  });
});

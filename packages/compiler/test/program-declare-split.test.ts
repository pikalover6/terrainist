/**
 * **The authored-program pass, cut in two** — `docs/GROUND-CONTRACT-v1.md` §7.1.
 *
 * `prop.pad` is tier D and pass 5f is a hundred passes past the fifth resolve,
 * so under `GROUND_V1_FREEZE` the programs' siting and claims move to pass 5b″
 * (`declarePrograms`) and only the blocks stay at 5f (`executePrograms`). Three
 * rounds of WP-G6 died on that ordering: `troy_r22` threw
 * `ground stage: prop.pad (tier D) declared after tier E was read` inside
 * `treatProgramSite`, every time.
 *
 * What has to hold for the cut to be sound is one property, and it is the one
 * this file measures: **deciding and painting separately must produce exactly
 * what deciding-and-painting-together produced**, over the same ground. If it
 * does not, the freeze has not moved a declaration, it has changed a world.
 *
 * The second test is the reason the decision is carried as *data* rather than
 * recomputed at 5f: a pad's fill starts at the ground the declarer measured,
 * and after the freeze `plan.ground` is the level the pad itself asked for — so
 * a pad re-decided at 5f would find its own answer already in place and lay
 * nothing at all.
 */

import { describe, expect, it } from "vitest";

import { centeredRegion } from "@terrainist/stdlib";

import {
  decideProgramSite,
  paintProgramSite,
  treatProgramSite,
} from "../src/programs/site-treatment.js";
import { decidePropPad, paintPropPad, propPadIntent } from "../src/structures/props.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import type { Rect } from "../src/layout/frames.js";

const stack = loadPrismarine("1.21.11");

function idx(plan: ColumnPlan, x: number, z: number): number {
  return (z - plan.region.z0) * plan.region.width + (x - plan.region.x0);
}

/** A plan with a bowl in it: the ground inside `rect` sits `depth` blocks low. */
function hollow(width: number, rect: Rect, depth: number): ColumnPlan {
  const plan = devColumnPlan(centeredRegion(width, width), stack);
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = idx(plan, x, z);
      plan.ground[i] = (plan.ground[i] as number) - depth;
      plan.fluidTop[i] = plan.ground[i] as number;
    }
  }
  return plan;
}

const SITE: Rect = { x0: -8, z0: -8, x1: 7, z1: 7 };

/**
 * {@link hollow}, with the ground *outside* the site dropped too — so the pad
 * has a bowl to fill and its outer face has somewhere to grade down to. A bowl
 * cut into a plain gets no apron at all: the pad's own rim is already the
 * ground, which is exactly the "no apron without a face" rule.
 */
function hollowOnAShelf(width: number, rect: Rect, depth: number, shelf: number): ColumnPlan {
  const plan = hollow(width, rect, depth);
  for (let z = rect.z0 - 14; z <= rect.z1 + 14; z++) {
    for (let x = rect.x0 - 14; x <= rect.x1 + 14; x++) {
      const ring = Math.max(rect.x0 - x, x - rect.x1, rect.z0 - z, z - rect.z1, 0);
      if (ring === 0) continue;
      const i = idx(plan, x, z);
      plan.ground[i] = (plan.ground[i] as number) - shelf;
      plan.fluidTop[i] = plan.ground[i] as number;
    }
  }
  return plan;
}

/** The site's own plane: the rim the bowl was cut into. */
function baseYOf(plan: ColumnPlan): number {
  return (plan.ground[idx(plan, 40, 40)] as number) + 1;
}

describe("§7.1 — the program site treatment, decided and painted apart", () => {
  it("lays exactly the blocks the uncut call lays, in the same order", () => {
    const together = hollowOnAShelf(128, SITE, 6, 4);
    const apart = hollowOnAShelf(128, SITE, 6, 4);
    const baseY = baseYOf(together);

    const one = treatProgramSite({
      plan: together,
      footprint: SITE,
      baseY,
      source: "world.site#pad@0",
    });

    const decided = decideProgramSite({
      plan: apart,
      footprint: SITE,
      baseY,
      source: "world.site#pad@0",
    });
    expect(decided).toBeDefined();
    // The whole point of the cut: everything between the two halves is time,
    // and nothing here writes a level. The decision survives it as data.
    const two = paintProgramSite(apart, decided as NonNullable<typeof decided>, true);

    expect(two.length).toBe(one.length);
    expect(two.length).toBeGreaterThan(0);
    expect(two).toEqual(one);
    // …and the two plans agree column for column, which is the assertion the
    // block list alone cannot make: `paintProgramSite` also writes `surface`.
    expect([...apart.ground]).toEqual([...together.ground]);
    expect([...apart.surface]).toEqual([...together.surface]);
    expect([...apart.snow]).toEqual([...together.snow]);
  });

  it("claims the pad and the apron as two `prop.pad` intents, pad first", () => {
    const plan = hollowOnAShelf(128, SITE, 6, 4);
    const decided = decideProgramSite({
      plan,
      footprint: SITE,
      baseY: baseYOf(plan),
      source: "world.site#pad@0",
    });
    expect(decided).toBeDefined();
    const intents = (decided as NonNullable<typeof decided>).intents;
    expect(intents.map((i) => i.sourceClass)).toEqual(["prop.pad", "prop.pad"]);
    expect(intents.map((i) => i.source)).toEqual(["world.site#pad@0", "world.site#pad@0.apron"]);
    // §2.5: the pad's edge is a step, the apron *is* the transition.
    expect(intents.map((i) => i.transition)).toEqual(["step", "ramp"]);
  });

  it("decides against the ground it was handed, not the ground it produces", () => {
    // The freeze's own hazard, isolated: paint the pad, then ask the *painted*
    // plan for the same decision. It answers "nothing to do" — which is why the
    // decision has to be carried from 5b″ to 5f rather than retaken there.
    const plan = hollow(128, SITE, 6);
    const baseY = baseYOf(plan);
    const first = decidePropPad(plan, SITE, baseY);
    expect(first.length).toBeGreaterThan(0);
    expect(propPadIntent("world.site#pad@0", first)).toBeDefined();
    expect(paintPropPad(plan, first, true).length).toBeGreaterThan(0);
    expect(decidePropPad(plan, SITE, baseY)).toEqual([]);
  });

  it("owes nothing to a site already flat enough to stand on", () => {
    const plan = devColumnPlan(centeredRegion(128, 128), stack);
    const decided = decideProgramSite({
      plan,
      footprint: SITE,
      baseY: (plan.ground[idx(plan, 0, 0)] as number) + 1,
      source: "world.site#pad@0",
    });
    expect(decided).toBeUndefined();
    expect(decidePropPad(plan, SITE, (plan.ground[idx(plan, 0, 0)] as number) + 1)).toEqual([]);
  });
});

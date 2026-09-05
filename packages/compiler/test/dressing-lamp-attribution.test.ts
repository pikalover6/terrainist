/**
 * The lamp census's **attribution** rule, on two hand-built posts.
 *
 * `lamp_post` (stdlib `structures/props-street.ts`) is one fence mast carrying
 * three lanterns: a head at the top (`hanging: false`) and two arms hanging off
 * slabs, one column either side (`hanging: true`). The census used to read the
 * ground under each lantern's own column, so an arm hanging over the graded
 * verge — legitimately a block lower, by `VERGE_FILL_FEATHER` — reported as a
 * sunken lamp while the post it hangs off stood perfectly on the sidewalk.
 *
 * These two fixtures pin both halves of the rule: an arm over lower ground is
 * NOT a finding, and a post that genuinely stands low still IS one, counted
 * once rather than once per lantern.
 */

import { describe, expect, it } from "vitest";

import { auditDressing, type DressingProbe } from "../src/emit/dressing.js";
import type { AttributedBlock } from "../src/emit/walkability.js";

interface Cell {
  readonly name: string;
  readonly props?: Record<string, string>;
}

/**
 * A tiny voxel world: a paved sidewalk strip at `pavedY`, ground under the
 * verge columns at `vergeY`, and one lamp post whose mast stands at `postY`.
 */
function buildProbe(opts: {
  readonly postY: number;
  readonly pavedY: number;
  readonly vergeY: number;
}): DressingProbe {
  const cells = new Map<string, Cell>();
  const blocks: AttributedBlock[] = [];
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const put = (x: number, y: number, z: number, name: string, props?: Record<string, string>) => {
    cells.set(key(x, y, z), props === undefined ? { name } : { name, props });
    blocks.push({ x, y, z, emitter: "test:lamp" });
  };

  // Solid rock everywhere below each column's own surface.
  const surface = new Map<string, number>();
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      // The sidewalk band is the post's own column and the strip along z = 0
      // at x = 0; everything else is verge, graded a block lower.
      const paved = x === 0;
      const top = paved ? opts.pavedY : opts.vergeY;
      surface.set(`${x},${z}`, top);
      for (let y = top - 4; y < top; y++) cells.set(key(x, y, z), { name: "stone" });
    }
  }
  // The mast stands at `postY`: fence from there up, arms and head above it.
  for (let y = opts.postY; y < opts.postY + 5; y++) put(0, y, 0, "oak_fence");
  for (const x of [-1, 1]) {
    put(x, opts.postY + 4, 0, "stone_brick_slab", { type: "bottom" });
    put(x, opts.postY + 3, 0, "lantern", { hanging: "true" });
  }
  put(0, opts.postY + 5, 0, "lantern", { hanging: "false" });

  const nameAt = (x: number, y: number, z: number): string =>
    cells.get(key(x, y, z))?.name ?? "air";
  const solid = (x: number, y: number, z: number): boolean => nameAt(x, y, z) !== "air";
  const feet = new Map<string, number>();
  // Declared paving: the sidewalk strip only.
  for (let z = -4; z <= 4; z++) feet.set(`0,${z}`, opts.pavedY);

  return {
    nameAt,
    propsAt: (x, y, z) => {
      const cell = cells.get(key(x, y, z));
      return cell === undefined ? undefined : { name: cell.name, props: cell.props ?? {} };
    },
    airAt: (x, y, z) => !solid(x, y, z),
    supportAt: (x, y, z) => solid(x, y - 1, z),
    standable: (x, y, z) => !solid(x, y, z) && !solid(x, y + 1, z) && solid(x, y - 1, z),
    groundStanding: (x, z, from) => {
      for (let y = from; y > from - 24; y--) {
        if (!solid(x, y, z) && !solid(x, y + 1, z) && solid(x, y - 1, z)) return y;
      }
      return null;
    },
    feet,
    laidBy: new Map(),
    roleAt: new Map(),
    blocks,
    minY: -8,
    maxY: 96
  };
}

describe("the lamp census attributes a hanging lantern to its mast", () => {
  it("does not blame a post for the verge its arms hang over", () => {
    // The post stands ON the sidewalk; the verge either side is a block lower,
    // which is the graded shoulder doing its job.
    const report = auditDressing(buildProbe({ postY: 64, pavedY: 64, vergeY: 63 }));
    // Three lanterns, one post: the mast is counted once.
    expect(report.streetLamps).toBe(1);
    expect(report.sunkenLamps).toBe(0);
    expect(report.deeplySunkenLamps).toBe(0);
    expect(report.lampCensus["level"]).toBe(1);
  });

  it("still counts a post that genuinely stands below its pavement", () => {
    // Same geometry, but the mast itself starts a block under the paving.
    const report = auditDressing(buildProbe({ postY: 63, pavedY: 64, vergeY: 63 }));
    expect(report.streetLamps).toBe(1);
    // Once, not once per lantern.
    expect(report.sunkenLamps).toBe(1);
    expect(report.deeplySunkenLamps).toBe(0);
    expect(report.worstSunken[0]?.sunkenBy).toBe(1);
    // Reported at the MAST's column, not an arm's.
    expect(report.worstSunken[0]?.x).toBe(0);
    expect(report.worstSunken[0]?.z).toBe(0);
  });
});

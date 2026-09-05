/**
 * **The water rule.** Applied once, on the final resolved ground, after every
 * claim and every generated transition has been arbitrated.
 *
 * A claim that levels a dry column below the surface of the water beside it
 * leaves water that flows on the first tick, and the fluid lint fails the
 * compile. So:
 *
 * 1. *Water finds its level.* A body of water beside a higher body — a canal
 *    dug below the sea it opens onto — rises to it: raise-only, flood-filled
 *    over wet 4-neighbours, so a connected body settles at once.
 * 2. *No dry column below the water beside it.* A dry column whose wet
 *    4-neighbour stands higher is raised to that surface. Owned columns
 *    included: a plaza levelled below the sea gets a quay lip, not a flood.
 * 3. `moved` is recomputed against the baseline, so snow clearing and the
 *    report see the raised columns.
 *
 * Pure: reads its inputs, returns a new `ResolvedGround`.
 */

import { FluidKind } from "../terrain/columns.js";
import type { GroundBaseline, ResolvedGround } from "./ground-contract.js";

const N4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function applyWaterRule(baseline: GroundBaseline, resolved: ResolvedGround): ResolvedGround {
  const w = baseline.region.width;
  const d = baseline.region.depth;
  const n = w * d;
  const ground = Int32Array.from(resolved.ground);
  const fluidTop = Int32Array.from(resolved.fluidTop);
  const fluidKind = resolved.fluidKind;
  const dry = (k: number): boolean => (fluidKind[k] as number) === FluidKind.NONE;

  // First half: water finds its level.
  {
    const queue: number[] = [];
    for (let k = 0; k < n; k++) if (!dry(k)) queue.push(k);
    let head = 0;
    while (head < queue.length) {
      const k = queue[head++] as number;
      const top = fluidTop[k] as number;
      const x = k % w;
      const z = (k - x) / w;
      for (const [dx, dz] of N4) {
        const xx = x + dx;
        const zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= w || zz >= d) continue;
        const m = zz * w + xx;
        if (dry(m)) continue;
        if ((fluidTop[m] as number) < top) {
          fluidTop[m] = top;
          queue.push(m);
        }
      }
    }
  }

  // Second half: no dry column below the surface of the water beside it.
  let changed = false;
  for (let k = 0; k < n; k++) {
    if (!dry(k)) continue;
    const x = k % w;
    const z = (k - x) / w;
    let lip = ground[k] as number;
    for (const [dx, dz] of N4) {
      const xx = x + dx;
      const zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= w || zz >= d) continue;
      const m = zz * w + xx;
      if (dry(m)) continue;
      const top = fluidTop[m] as number;
      if (top > lip) lip = top;
    }
    if (lip !== (ground[k] as number)) {
      ground[k] = lip;
      fluidTop[k] = lip;
      changed = true;
    }
  }

  if (!changed) {
    let same = true;
    for (let k = 0; k < n; k++) {
      if ((fluidTop[k] as number) !== (resolved.fluidTop[k] as number)) {
        same = false;
        break;
      }
    }
    if (same) return resolved;
  }

  const moved = new Uint8Array(n);
  let movedCount = 0;
  for (let k = 0; k < n; k++) {
    if ((ground[k] as number) !== (baseline.ground[k] as number)) {
      moved[k] = 1;
      movedCount += 1;
    }
  }
  return {
    ...resolved,
    ground,
    fluidTop,
    moved,
    report: { ...resolved.report, moved: movedCount },
  };
}

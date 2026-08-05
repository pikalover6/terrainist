/**
 * Shared column-mask arithmetic.
 *
 * Four routines the city pass grew for itself and that three urban forms now
 * need as well: pull a mask back off its own edge, punch reserved ground out of
 * one, cut one into flat rectangles, and find the biggest rectangle inside one.
 * They moved out of `city-pass.ts` unchanged — the bodies below are the ones
 * that drew every committed city — so that a form module can share them without
 * importing the city plan, and so that four work packages can use them without
 * four of them editing the same file.
 *
 * Every mask here is `1` inside / `0` outside, row-major over an inclusive
 * {@link Rect}, which is the same convention `CellFabric.mask`, `FormContext.mask`
 * and `DistrictProduct.carriageway` all use.
 */

import type { Rect } from "./frames.js";

/**
 * Pull a mask back by `rings` columns.
 *
 * The cell's outline is the arterial's kerb. Streets are clipped to the outline
 * so they reach it; lots are held inside this erosion so a facade always has a
 * verge between it and eleven columns of tarmac.
 */
export function erode(mask: Uint8Array, width: number, depth: number, rings: number): Uint8Array {
  if (rings <= 0) return Uint8Array.from(mask);
  let current = Uint8Array.from(mask);
  for (let ring = 0; ring < rings; ring++) {
    const next = new Uint8Array(current.length);
    for (let j = 0; j < depth; j++) {
      for (let i = 0; i < width; i++) {
        const k = j * width + i;
        if (current[k] !== 1) continue;
        let keep = true;
        for (let dj = -1; dj <= 1 && keep; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= width || jj >= depth || current[jj * width + ii] !== 1) {
              keep = false;
              break;
            }
          }
        }
        if (keep) next[k] = 1;
      }
    }
    current = next;
  }
  return current;
}

/**
 * A lot mask with the set pieces punched out of it.
 *
 * The only moment in the whole pipeline at which a district can be told "not
 * here". After this the cell subdivides, and the subdivision has no vocabulary
 * for ground that is spoken for — which is exactly why the reservation has to
 * be a hole in the mask rather than a veto somewhere downstream.
 *
 * Mutates and returns `mask`, as it always has.
 */
export function withoutReserved(mask: Uint8Array, bounds: Rect, reserved: readonly Rect[]): Uint8Array {
  if (reserved.length === 0) return mask;
  const stride = bounds.x1 - bounds.x0 + 1;
  for (const rect of reserved) {
    const x0 = Math.max(bounds.x0, rect.x0);
    const x1 = Math.min(bounds.x1, rect.x1);
    const z0 = Math.max(bounds.z0, rect.z0);
    const z1 = Math.min(bounds.z1, rect.z1);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) mask[(z - bounds.z0) * stride + (x - bounds.x0)] = 0;
    }
  }
  return mask;
}

/**
 * A mask as maximal horizontal runs — one flat rectangle per run.
 *
 * The only way to level an arbitrary polygon with an API that takes rectangles.
 * Every run is one row tall and carries no apron, so adjacent runs cannot blend
 * against each other and the union is exactly the mask at exactly one height.
 * `FormBench.runs` is the same shape for the same reason.
 *
 * **`open` is a flag, not a sentinel value of `start`.** `start` holds a *world*
 * X, which is negative over any quarter west of the origin, so the older
 * `start = -1` / `start >= 0` idiom read "a run is open" as "the run began at a
 * non-negative X" and closed nothing at all west of x = 0. Measured 2026-08-05:
 * a hill town whose district spanned x ∈ [−160, −1] got **zero** runs out of
 * every bench and every derived platform, which surfaced two doors away as
 * "this ground is too steep to terrace" (`terraced` skips a bench with no runs
 * before it can measure its width, so the widest bench came out 0 columns) and
 * as "stepped ground came out as one platform" (`derivePlatforms` pushed
 * fifteen blocks' worth of pieces and kept none). Any sentinel that shares a
 * value with legal data is this bug waiting to happen; the flag cannot be
 * confused with a coordinate.
 */
export function maskRuns(b: Rect, mask: Uint8Array): Rect[] {
  const stride = b.x1 - b.x0 + 1;
  const out: Rect[] = [];
  for (let z = b.z0; z <= b.z1; z++) {
    let start = 0;
    let open = false;
    for (let x = b.x0; x <= b.x1 + 1; x++) {
      const inside = x <= b.x1 && mask[(z - b.z0) * stride + (x - b.x0)] === 1;
      if (inside && !open) {
        start = x;
        open = true;
      }
      if (!inside && open) {
        out.push({ x0: start, z0: z, x1: x - 1, z1: z });
        open = false;
      }
    }
  }
  return out;
}

/**
 * The largest axis-aligned rectangle entirely inside a mask.
 *
 * The standard maximal-rectangle-under-a-histogram sweep, O(area), with ties
 * broken by the earlier row and the earlier column so it is stable.
 */
export function largestRect(b: Rect, mask: Uint8Array): Rect | null {
  const width = b.x1 - b.x0 + 1;
  const depth = b.z1 - b.z0 + 1;
  const heights = new Int32Array(width);
  let best: Rect | null = null;
  let bestArea = 0;

  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      heights[i] = mask[j * width + i] === 1 ? (heights[i] as number) + 1 : 0;
    }
    const stack: number[] = [];
    for (let i = 0; i <= width; i++) {
      const h = i === width ? 0 : (heights[i] as number);
      while (stack.length > 0 && (heights[stack[stack.length - 1] as number] as number) >= h) {
        const top = stack.pop() as number;
        const height = heights[top] as number;
        const left = stack.length === 0 ? 0 : (stack[stack.length - 1] as number) + 1;
        const area = height * (i - left);
        if (height > 0 && area > bestArea) {
          bestArea = area;
          best = {
            x0: b.x0 + left,
            z0: b.z0 + j - height + 1,
            x1: b.x0 + i - 1,
            z1: b.z0 + j,
          };
        }
      }
      stack.push(i);
    }
  }
  return best;
}

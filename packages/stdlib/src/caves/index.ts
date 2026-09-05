/**
 * Interior air spans — per column, a sorted list of `[lo, hi]` runs of air cut
 * out of the stone body. Tunnels, galleries and cellars carve them; the
 * compiler's column plan carries them and its integrity check re-derives the
 * fluid-shell and surface invariants from them. Nothing here places a block.
 */

/**
 * Per-column interior air spans, in CSR form.
 *
 * Column `idx` owns entries `offsets[idx] … offsets[idx + 1] - 1`; each entry
 * is an inclusive `[lo[k], hi[k]]` run of air. Spans of one column are sorted
 * ascending and never touch or overlap — two spans one block apart leave a real
 * one-block rock slab between them, which is what lets the dripstone pass treat
 * `lo - 1` and `hi + 1` as solid without re-deriving anything.
 */
export interface CaveSpans {
  readonly offsets: Int32Array;
  readonly lo: Int32Array;
  readonly hi: Int32Array;
}

/** An empty span set, for a region no cave node touched. */
export function emptyCaveSpans(columns: number): CaveSpans {
  return { offsets: new Int32Array(columns + 1), lo: new Int32Array(0), hi: new Int32Array(0) };
}

/** True when `(idx, y)` falls inside a carved span. */
export function caveAirAt(spans: CaveSpans, idx: number, y: number): boolean {
  const end = spans.offsets[idx + 1] as number;
  for (let k = spans.offsets[idx] as number; k < end; k++) {
    if (y >= (spans.lo[k] as number) && y <= (spans.hi[k] as number)) return true;
  }
  return false;
}

/** Total air blocks a span set holds. */
export function caveVolume(spans: CaveSpans): number {
  let total = 0;
  for (let k = 0; k < spans.lo.length; k++) {
    total += (spans.hi[k] as number) - (spans.lo[k] as number) + 1;
  }
  return total;
}

/** Chebyshev dilation of a 0/1 mask by `r`, via two separable max passes. */
export function dilate(mask: Uint8Array, width: number, depth: number, r: number): Uint8Array {
  if (r <= 0) return Uint8Array.from(mask);
  const rows = new Uint8Array(mask.length);
  for (let j = 0; j < depth; j++) {
    const base = j * width;
    for (let i = 0; i < width; i++) {
      const lo = Math.max(0, i - r);
      const hi = Math.min(width - 1, i + r);
      let hit = 0;
      for (let k = lo; k <= hi; k++) {
        if (mask[base + k] === 1) {
          hit = 1;
          break;
        }
      }
      rows[base + i] = hit;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let j = 0; j < depth; j++) {
    const lo = Math.max(0, j - r);
    const hi = Math.min(depth - 1, j + r);
    for (let i = 0; i < width; i++) {
      let hit = 0;
      for (let k = lo; k <= hi; k++) {
        if (rows[k * width + i] === 1) {
          hit = 1;
          break;
        }
      }
      out[j * width + i] = hit;
    }
  }
  return out;
}

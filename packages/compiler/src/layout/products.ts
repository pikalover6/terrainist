/**
 * Terrain products, as the `on` constraint sees them — Loam v0.2 §4.2/§4.4.
 *
 * `{"on": "@terrain:coastline"}` is a *domain restriction*: it says the
 * footprint sits on a thing the terrain made, not on a thing the author placed.
 * The awkwardness is that "coastline" is not an object anywhere in the
 * pipeline — it is a property of the finished classification, and "ridge" and
 * "peak" are likewise consequences of edits rather than records of them. So a
 * product here is derived, once, from what the terrain passes already produced:
 *
 * | product     | derived from                                              |
 * |-------------|-----------------------------------------------------------|
 * | `coastline` | land columns with an ocean column among their 4-neighbours |
 * | `ridge`     | the refined centreline of every `ridge` edit               |
 * | `peak`      | the summit marker of every `peak` / `volcano` edit         |
 *
 * Each is reduced to a **point set**, and `on` then works the same way for all
 * three: widen the set by `band` blocks into an areal domain, and require
 * `partial` of the footprint's columns to fall inside it. That uniformity is
 * the point — §4.4 gives `on` one `band` field and one `partial` field for
 * every kind of product, and a compiler that treated a polyline product
 * differently from a point one would have to explain why.
 *
 * Band masks are built lazily and cached per `(product, band)`, because the
 * solver asks the same question once per candidate placement and a band mask
 * is an O(region) sweep.
 */

import { dilate, type Region } from "@terrainist/stdlib";
import { bareProduct } from "@terrainist/spec";

import type { Point2 } from "./frames.js";

/** A derived terrain product, reduced to the columns that *are* it. */
export interface TerrainProduct {
  readonly name: string;
  /** `polyline` products carry direction; `point` products do not. */
  readonly kind: "polyline" | "point";
  /**
   * The product's own columns, before any `band` widening.
   *
   * For a polyline product these are the centreline samples in order, so a
   * `side` test has a direction to be left or right of; for a point product
   * they are the points, in document order.
   */
  readonly columns: readonly Point2[];
}

/** Lazily-built, cached band masks over one region. */
export class TerrainProductIndex {
  private readonly products: ReadonlyMap<string, TerrainProduct>;
  private readonly cache = new Map<string, Uint8Array>();

  constructor(
    readonly region: Region,
    products: readonly TerrainProduct[],
  ) {
    this.products = new Map(products.map((p) => [p.name, p] as const));
  }

  /** The product a selector names, or `null`. */
  get(target: string): TerrainProduct | null {
    return this.products.get(bareProduct(target)) ?? null;
  }

  /** Every product this index derived, in registration order. */
  get names(): readonly string[] {
    return [...this.products.keys()];
  }

  /**
   * 1 for every column within `band` blocks of the product, or `null` when the
   * selector names nothing this compiler derives.
   *
   * The widening is a Chebyshev dilation, the same one the cave and tunnel
   * shells use: `band` is documented as "blocks", and a square reach is what
   * every other keep-out in this compiler means by that.
   */
  band(target: string, band: number): Uint8Array | null {
    const product = this.get(target);
    if (product === null) return null;
    const reach = Math.max(0, Math.round(band));
    const key = `${product.name}|${reach}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const { region } = this;
    const seed = new Uint8Array(region.width * region.depth);
    for (const p of product.columns) {
      const i = p.x - region.x0;
      const j = p.z - region.z0;
      if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
      seed[j * region.width + i] = 1;
    }
    const mask = reach === 0 ? seed : dilate(seed, region.width, region.depth, reach);
    this.cache.set(key, mask);
    return mask;
  }
}

/* -------------------------------------------------------------------------- */
/* derivation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The coastline: land columns with salt water next door.
 *
 * Four-connected on purpose. An eight-connected test would call the diagonal
 * columns of a staircase shoreline "coast" as well, which doubles the width of
 * the product before `band` has widened it at all — and `band` is the field the
 * author gets to set.
 *
 * `subsample` keeps every n-th coastal column. A 512-block region's shoreline
 * is thousands of columns and every one of them seeds the same dilation; the
 * mask a tenth of them produces is identical once `band` is more than the
 * stride, and `band` defaults to 8.
 */
export function coastlineColumns(
  region: Region,
  oceanMask: Uint8Array,
  stride = COASTLINE_STRIDE,
): Point2[] {
  const out: Point2[] = [];
  let seen = 0;
  for (let j = 0; j < region.depth; j++) {
    for (let i = 0; i < region.width; i++) {
      const idx = j * region.width + i;
      if (oceanMask[idx] === 1) continue;
      const wet =
        (i > 0 && oceanMask[idx - 1] === 1) ||
        (i + 1 < region.width && oceanMask[idx + 1] === 1) ||
        (j > 0 && oceanMask[idx - region.width] === 1) ||
        (j + 1 < region.depth && oceanMask[idx + region.width] === 1);
      if (!wet) continue;
      if (seen++ % stride !== 0) continue;
      out.push({ x: region.x0 + i, z: region.z0 + j });
    }
  }
  return out;
}

/** Every n-th coastal column seeds the coastline product. */
export const COASTLINE_STRIDE = 4;

/** Every n-th sample of a refined ridge centreline seeds the ridge product. */
export const RIDGE_STRIDE = 4;

/** Build the product set from what the terrain passes produced. */
export function deriveTerrainProducts(input: {
  readonly region: Region;
  /** 1 where the classification calls a column ocean. */
  readonly oceanMask?: Uint8Array;
  /** Refined `ridge` centrelines, in document order. */
  readonly ridgeCourses?: readonly (readonly Point2[])[];
  /** Summit points of `peak` / `volcano` edits, in document order. */
  readonly peaks?: readonly Point2[];
}): TerrainProduct[] {
  const out: TerrainProduct[] = [];

  if (input.oceanMask !== undefined) {
    const columns = coastlineColumns(input.region, input.oceanMask);
    // A region with no sea in it has no coastline, and saying so by *omitting*
    // the product is what makes `on: "@terrain:coastline"` report an
    // unsatisfied constraint rather than an empty domain that vetoes the node.
    if (columns.length > 0) out.push({ name: "coastline", kind: "point", columns });
  }

  const ridge: Point2[] = [];
  for (const course of input.ridgeCourses ?? []) {
    for (let i = 0; i < course.length; i += RIDGE_STRIDE) {
      ridge.push(floorPoint(course[i] as Point2));
    }
    const last = course[course.length - 1];
    if (last !== undefined) ridge.push(floorPoint(last));
  }
  if (ridge.length > 0) out.push({ name: "ridge", kind: "polyline", columns: ridge });

  const peaks = (input.peaks ?? []).map(floorPoint);
  if (peaks.length > 0) out.push({ name: "peak", kind: "point", columns: peaks });

  return out;
}

function floorPoint(p: Point2): Point2 {
  return { x: Math.floor(p.x), z: Math.floor(p.z) };
}

/**
 * Which side of a polyline product a column falls on: `1` left, `-1` right,
 * `0` on the line (or for a point product, which has no direction of travel).
 *
 * Same handedness as {@link import("./corridors.js").corridorHit}, and for the
 * same reason: with north at −Z and east at +X, the left of a traveller heading
 * north is west, so a negative cross product is the left side.
 */
export function productSideAt(product: TerrainProduct, x: number, z: number): -1 | 0 | 1 {
  if (product.kind !== "polyline" || product.columns.length < 2) return 0;
  const line = product.columns;
  let best = Number.POSITIVE_INFINITY;
  let cross = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Point2;
    const b = line[i] as Point2;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    let t = len2 === 0 ? 0 : ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a.x + t * dx;
    const cz = a.z + t * dz;
    const d = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
    if (d >= best) continue;
    best = d;
    cross = dx * (z - cz) - dz * (x - cx);
  }
  return cross > 0 ? -1 : cross < 0 ? 1 : 0;
}

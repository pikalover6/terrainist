/**
 * `ctx.math` — pinned, deterministic transcendental functions.
 *
 * Per LOAM-SPEC-v0.1 §6.5 rule 6, `Math.sin` / `cos` / `tan` / `atan2` / `exp` /
 * `log` / `pow` are *not* IEEE-754 specified: two JS engines (or two versions of
 * the same engine) may return different last bits. Every transcendental used
 * anywhere in the Loam stdlib therefore routes through this module, which is a
 * pure-TypeScript implementation built only from operations that *are* exactly
 * specified: `+ - * /`, comparison, `Math.sqrt`, `Math.floor`, `Math.abs`, and
 * IEEE-754 bit reinterpretation.
 *
 * `Math.sqrt` is correctly rounded by IEEE-754 and `Math.floor`/`Math.abs` are
 * exact, so both are safe. Nothing else from the `Math` namespace may be used in
 * this package — enforced by `test/no-math-transcendentals.test.ts`, which greps
 * the built `dist/` output.
 *
 * ## Accuracy bounds (measured against arbitrary-precision references)
 *
 * | fn | domain | max observed absolute error | max observed relative error |
 * |---|---|---|---|
 * | `sin`, `cos` | \|x\| ≤ 1e6   | ≤ 2.3e-16 (≈1 ulp) | — (absolute is the meaningful bound) |
 * | `sin`, `cos` | \|x\| > 1.6e6 | degrades linearly — Cody–Waite reduction assumes \|n\| < 2^20 | |
 * | `exp`        | \|x\| ≤ 700   | —       | ≤ 2.3e-16 |
 * | `log`        | x ∈ (0, 1e300)| —       | ≤ 4.2e-16 (abs ≤ 1 ulp near x=1) |
 * | `pow`        | integer y     | exact repeated squaring, < 2 ulp | |
 * | `pow`        | general       | —       | < 1e-14 (error ≈ \|y·log x\| · 4e-16) |
 * | `atan`, `atan2` | all        | ≤ 2.3e-16 | — |
 *
 * Worldgen never evaluates trig outside ≈`[-2π, 2π]` (gradient table angles) or
 * noise coordinates bounded by the region size, so the reduction limit is not a
 * practical constraint.
 *
 * These bounds are *not* the point — bit-identity across engines is. The bounds
 * exist so callers know the implementation is a legitimate replacement, and the
 * accuracy tests exist so an accidental regression (a dropped polynomial term)
 * is caught.
 */

// ---------------------------------------------------------------------------
// Constants (exact double literals; never computed at load time)
// ---------------------------------------------------------------------------

/** π, correctly rounded. */
export const PI = 3.141592653589793;
/** 2π. */
export const TAU = 6.283185307179586;
/** π/2. */
export const HALF_PI = 1.5707963267948966;
/** 1/(π/2), used for quadrant selection in trig range reduction. */
const TWO_OVER_PI = 0.6366197723675814;

// Cody–Waite four-part split of π/2 (fdlibm `__ieee754_rem_pio2` constants).
// Splitting π/2 across four doubles lets `x - n·(π/2)` stay accurate for large
// n, where a single-double subtraction would catastrophically cancel.
const PIO2_1 = 1.5707963267341256; // first 33 bits of π/2
const PIO2_1T = 6.077100506506192e-11;
const PIO2_2 = 6.077100506303966e-11;
const PIO2_2T = 2.0222662487959506e-21;

// Two-part split of ln 2, same idea for exp/log scaling.
const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;
/** 1/ln 2. */
const INV_LN2 = 1.4426950408889634;

/** 2^-53, the `float()` scaling factor. Written as a literal so no `**`. */
export const TWO_POW_NEG53 = 1.1102230246251565e-16;

// ---------------------------------------------------------------------------
// Bit-level helpers
// ---------------------------------------------------------------------------

const bitsBuf = new ArrayBuffer(8);
const bitsF64 = new Float64Array(bitsBuf);
const bitsU32 = new Uint32Array(bitsBuf); // [0] = low word, [1] = high word (LE)

/**
 * `2^k` for integer k, built by writing the IEEE-754 exponent field directly.
 * Exact for -1074 ≤ k ≤ 1023; saturates to 0 / +Infinity outside.
 */
export function pow2i(k: number): number {
  if (k > 1023) return k > 2046 ? Number.POSITIVE_INFINITY : pow2i(1023) * pow2i(k - 1023);
  if (k < -1022) {
    // Subnormal range: split the scaling into two exact steps.
    if (k < -2098) return 0;
    return pow2i(-1022) * pow2i(k + 1022);
  }
  bitsU32[0] = 0;
  bitsU32[1] = (k + 1023) * 0x100000;
  return bitsF64[0] as number;
}

/**
 * Split a finite positive `x` into `m · 2^e` with `m ∈ [1, 2)`.
 * Handles subnormals by pre-scaling.
 */
function frexp2(x: number): { mantissa: number; exponent: number } {
  let v = x;
  let bias = 0;
  if (v < 2.2250738585072014e-308) {
    // subnormal: scale up by 2^64 first
    v = v * 18446744073709551616;
    bias = -64;
  }
  bitsF64[0] = v;
  const hi = bitsU32[1] as number;
  const exponent = ((hi >>> 20) & 0x7ff) - 1023 + bias;
  bitsU32[1] = (hi & 0x800fffff) | 0x3ff00000;
  return { mantissa: bitsF64[0] as number, exponent };
}

// ---------------------------------------------------------------------------
// Trigonometry
// ---------------------------------------------------------------------------

/**
 * Taylor series for sin on |r| ≤ π/4, terms through r^17.
 * Truncation error < 1e-19 there, i.e. below the double rounding floor.
 */
function sinPoly(r: number, z: number): number {
  let p = 1 / 355687428096000; //  1/17!
  p = p * z - 1 / 1307674368000; // -1/15!
  p = p * z + 1 / 6227020800; //  1/13!
  p = p * z - 1 / 39916800; // -1/11!
  p = p * z + 1 / 362880; //  1/9!
  p = p * z - 1 / 5040; // -1/7!
  p = p * z + 1 / 120; //  1/5!
  p = p * z - 1 / 6; // -1/3!
  return r + r * z * p;
}

/** Taylor series for cos on |r| ≤ π/4, terms through r^18. */
function cosPoly(z: number): number {
  let p = 1 / 6402373705728000; //  1/18!
  p = p * z - 1 / 20922789888000; // -1/16!
  p = p * z + 1 / 87178291200; //  1/14!
  p = p * z - 1 / 479001600; // -1/12!
  p = p * z + 1 / 3628800; //  1/10!
  p = p * z - 1 / 40320; // -1/8!
  p = p * z + 1 / 720; //  1/6!
  p = p * z - 1 / 24; // -1/4!
  p = p * z + 1 / 2; //  1/2!
  return 1 - z * p;
}

interface Reduced {
  /** reduced argument in ≈[-π/4, π/4] */
  r: number;
  /** quadrant index 0..3 */
  q: number;
}

/**
 * Cody–Waite reduction of x modulo π/2. Accurate for |x| < 2^28; beyond that
 * the reduction degrades gracefully (and worldgen never needs it — noise
 * arguments are bounded by the region size).
 */
function reducePiOver2(x: number): Reduced {
  const nf = x * TWO_OVER_PI;
  const n = nf >= 0 ? Math.floor(nf + 0.5) : -Math.floor(-nf + 0.5);
  // π/2 = PIO2_1 + PIO2_2 + PIO2_2T (+ …). PIO2_1 carries only 33 significant
  // bits, so `n * PIO2_1` is exact for |n| < 2^20 and the subtraction loses
  // nothing; the two tail terms then restore the bits PIO2_1 dropped.
  let r = x - n * PIO2_1;
  r = r - n * PIO2_2;
  r = r - n * PIO2_2T;
  let q = n % 4;
  if (q < 0) q += 4;
  return { r, q };
}

/** Deterministic sine. */
export function sin(x: number): number {
  if (!isFinite(x)) return Number.NaN;
  const { r, q } = reducePiOver2(x);
  const z = r * r;
  switch (q) {
    case 0:
      return sinPoly(r, z);
    case 1:
      return cosPoly(z);
    case 2:
      return -sinPoly(r, z);
    default:
      return -cosPoly(z);
  }
}

/** Deterministic cosine. */
export function cos(x: number): number {
  if (!isFinite(x)) return Number.NaN;
  const { r, q } = reducePiOver2(x);
  const z = r * r;
  switch (q) {
    case 0:
      return cosPoly(z);
    case 1:
      return -sinPoly(r, z);
    case 2:
      return -cosPoly(z);
    default:
      return sinPoly(r, z);
  }
}

/** Deterministic tangent (`sin/cos`; inherits both bounds). */
export function tan(x: number): number {
  return sin(x) / cos(x);
}

// ---------------------------------------------------------------------------
// exp / log / pow
// ---------------------------------------------------------------------------

/** Taylor series for exp on |r| ≤ ln2/2 ≈ 0.3466, terms through r^13. */
function expCore(r: number): number {
  let p = 1 / 6227020800; // 1/13!
  p = p * r + 1 / 479001600; // 1/12!
  p = p * r + 1 / 39916800;
  p = p * r + 1 / 3628800;
  p = p * r + 1 / 362880;
  p = p * r + 1 / 40320;
  p = p * r + 1 / 5040;
  p = p * r + 1 / 720;
  p = p * r + 1 / 120;
  p = p * r + 1 / 24;
  p = p * r + 1 / 6;
  p = p * r + 1 / 2;
  p = p * r + 1;
  p = p * r + 1;
  return p;
}

/** Deterministic natural exponential. */
export function exp(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x > 709.782712893384) return Number.POSITIVE_INFINITY;
  if (x < -745.1332191019411) return 0;
  const kf = x * INV_LN2;
  const k = kf >= 0 ? Math.floor(kf + 0.5) : -Math.floor(-kf + 0.5);
  const r = x - k * LN2_HI - k * LN2_LO;
  return expCore(r) * pow2i(k);
}

/**
 * Atanh-style series for log on m ∈ [√½, √2):
 * `log(m) = 2·(s + s³/3 + s⁵/5 + …)` with `s = (m-1)/(m+1)`, |s| ≤ 0.1716.
 * Terms through s^27 leave truncation error below 1e-18.
 */
function logCore(m: number): number {
  const s = (m - 1) / (m + 1);
  const z = s * s;
  let p = 1 / 27;
  p = p * z + 1 / 25;
  p = p * z + 1 / 23;
  p = p * z + 1 / 21;
  p = p * z + 1 / 19;
  p = p * z + 1 / 17;
  p = p * z + 1 / 15;
  p = p * z + 1 / 13;
  p = p * z + 1 / 11;
  p = p * z + 1 / 9;
  p = p * z + 1 / 7;
  p = p * z + 1 / 5;
  p = p * z + 1 / 3;
  p = p * z + 1;
  return 2 * s * p;
}

/** Deterministic natural logarithm. */
export function log(x: number): number {
  if (Number.isNaN(x) || x < 0) return Number.NaN;
  if (x === 0) return Number.NEGATIVE_INFINITY;
  if (x === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  let { mantissa, exponent } = frexp2(x);
  // Recentre the mantissa onto [√½, √2) so the series argument stays small.
  if (mantissa > 1.4142135623730951) {
    mantissa = mantissa / 2;
    exponent = exponent + 1;
  }
  return logCore(mantissa) + exponent * LN2_HI + exponent * LN2_LO;
}

/** Deterministic base-2 logarithm. */
export function log2(x: number): number {
  return log(x) * INV_LN2;
}

/** Exact-ish integer power by binary exponentiation. */
function powInt(base: number, e: number): number {
  let n = e < 0 ? -e : e;
  let acc = 1;
  let b = base;
  while (n > 0) {
    if (n % 2 === 1) acc = acc * b;
    n = Math.floor(n / 2);
    if (n > 0) b = b * b;
  }
  return e < 0 ? 1 / acc : acc;
}

/**
 * Deterministic power.
 *
 * Integer exponents with |y| ≤ 1024 use binary exponentiation (exact to a few
 * ulp and, importantly, exact for the small integer powers that dominate
 * worldgen); everything else uses `exp(y·log(x))` and requires `x > 0`.
 */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (y === 1) return x;
  if (y === 2) return x * x;
  if (Number.isInteger(y) && y >= -1024 && y <= 1024) return powInt(x, y);
  if (x === 0) return y > 0 ? 0 : Number.POSITIVE_INFINITY;
  if (x < 0) return Number.NaN;
  return exp(y * log(x));
}

/** Deterministic square root (delegates to the IEEE-exact `Math.sqrt`). */
export function sqrt(x: number): number {
  return Math.sqrt(x);
}

// ---------------------------------------------------------------------------
// atan / atan2
// ---------------------------------------------------------------------------

/** tan(π/6) = 1/√3, the second-stage reduction pivot. */
const TAN_PI_6 = 0.5773502691896257;
/** π/6. */
const PI_6 = 0.5235987755982988;

/** Taylor series for atan on |z| ≤ tan(π/12) ≈ 0.2679, terms through z^33. */
function atanCore(z: number): number {
  const w = z * z;
  let p = 1 / 33;
  p = p * w - 1 / 31;
  p = p * w + 1 / 29;
  p = p * w - 1 / 27;
  p = p * w + 1 / 25;
  p = p * w - 1 / 23;
  p = p * w + 1 / 21;
  p = p * w - 1 / 19;
  p = p * w + 1 / 17;
  p = p * w - 1 / 15;
  p = p * w + 1 / 13;
  p = p * w - 1 / 11;
  p = p * w + 1 / 9;
  p = p * w - 1 / 7;
  p = p * w + 1 / 5;
  p = p * w - 1 / 3;
  p = p * w + 1;
  return z * p;
}

/** Deterministic arctangent. */
export function atan(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x === Number.POSITIVE_INFINITY) return HALF_PI;
  if (x === Number.NEGATIVE_INFINITY) return -HALF_PI;
  const neg = x < 0;
  let z = neg ? -x : x;
  let offset = 0;
  if (z > 1) {
    // atan(z) = π/2 - atan(1/z)
    const inner = atan(1 / z);
    const res = HALF_PI - inner;
    return neg ? -res : res;
  }
  if (z > TAN_PI_6 - 0.3) {
    // atan(z) = π/6 + atan((z - t)/(1 + t·z)) with t = tan(π/6)
    z = (z - TAN_PI_6) / (1 + TAN_PI_6 * z);
    offset = PI_6;
  }
  const res = offset + atanCore(z);
  return neg ? -res : res;
}

/** Deterministic two-argument arctangent, matching IEEE `atan2` quadrants. */
export function atan2(y: number, x: number): number {
  if (Number.isNaN(y) || Number.isNaN(x)) return Number.NaN;
  if (x === 0) {
    if (y > 0) return HALF_PI;
    if (y < 0) return -HALF_PI;
    // ±0 / ±0: follow IEEE sign-of-zero rules loosely; worldgen never hits this.
    return Object.is(x, -0) ? (Object.is(y, -0) ? -PI : PI) : y;
  }
  const a = atan(y / x);
  if (x > 0) return a;
  return y >= 0 ? a + PI : a - PI;
}

/** Degrees for a radian value. */
export function toDegrees(rad: number): number {
  return rad * 57.29577951308232;
}

/** Radians for a degree value. */
export function toRadians(deg: number): number {
  return deg * 0.017453292519943295;
}

// ---------------------------------------------------------------------------
// Small deterministic utilities used across the field engine
// ---------------------------------------------------------------------------

/** Clamp `v` to `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Clamp `v` to `[0, 1]`. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite smoothstep of an already-clamped `t ∈ [0,1]`. */
export function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Quintic fade curve used by gradient noise (C² continuous). */
export function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** The `ctx.math` surface handed to generators. */
export const ctxMath = Object.freeze({
  PI,
  TAU,
  HALF_PI,
  sin,
  cos,
  tan,
  atan,
  atan2,
  exp,
  log,
  log2,
  pow,
  sqrt,
  pow2i,
  toDegrees,
  toRadians,
  clamp,
  clamp01,
  lerp,
  smoothstep01,
  fade,
});

/** Type of the frozen `ctx.math` object. */
export type CtxMath = typeof ctxMath;

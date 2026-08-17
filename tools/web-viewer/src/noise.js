/**
 * The cloud field: one small, seamlessly tiling noise texture.
 *
 * It is scrolled across the world in the sun term, which is what makes patches
 * of light slide over a hillside while nothing else moves. That is the whole
 * job, and it is worth doing properly in exactly one respect: the field must
 * *tile*, or the shadow of the sky has a visible seam running through it.
 *
 * Tiling is a property of the lattice, not of the sampling: every octave
 * wraps its integer coordinates modulo its own period, so the value at u=1 is
 * the value at u=0 by construction rather than by a blend.
 *
 * The seed is a constant. Runtime animation in the viewer is exempt from the
 * project's determinism law — it is presentation, not a world — but two
 * screenshots of the same place should differ only in the time of the drift,
 * so the field itself never changes.
 */

/** The one seed. Fixed, so every visitor's sky has the same clouds in it. */
export const CLOUD_SEED = 0x7e5a1;

/** A hash of two lattice coordinates and a seed, in [0, 1). */
export function latticeHash(ix, iz, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
const wrap = (value, period) => ((value % period) + period) % period;

/**
 * Value noise on a `period`×`period` lattice, sampled at (u, v) in unit space
 * and wrapping at the unit square's edges.
 */
export function valueNoise(u, v, period, seed) {
  const x = u * period;
  const z = v * period;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fz = fade(z - z0);
  const ax = wrap(x0, period);
  const az = wrap(z0, period);
  const bx = wrap(x0 + 1, period);
  const bz = wrap(z0 + 1, period);
  const n00 = latticeHash(ax, az, seed);
  const n10 = latticeHash(bx, az, seed);
  const n01 = latticeHash(ax, bz, seed);
  const n11 = latticeHash(bx, bz, seed);
  const top = n00 + (n10 - n00) * fx;
  const bottom = n01 + (n11 - n01) * fx;
  return top + (bottom - top) * fz;
}

/**
 * Fractal sum of {@link valueNoise}, in [0, 1], tiling on the unit square.
 *
 * Four octaves, each double the previous lattice and half its weight — the
 * classic fBm, and enough structure that a patch of shade has an edge that
 * reads as a cloud rather than as a blur.
 */
export function cloudNoise(u, v, { period = 4, octaves = 4, seed = CLOUD_SEED } = {}) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += valueNoise(u, v, period * 2 ** octave, seed + octave * 7919) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }
  return sum / total;
}

/**
 * The field as bytes, ready for a single-channel `DataTexture`.
 *
 * Contrast is pushed a little — a linear fBm is grey soup, and what the sun
 * term wants is mostly-open sky with definite patches in it.
 */
export function cloudField({ size = 256, period = 4, octaves = 4, seed = CLOUD_SEED } = {}) {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = cloudNoise(x / size, y / size, { period, octaves, seed });
      const shaped = Math.min(1, Math.max(0, (value - 0.5) * 1.7 + 0.5));
      data[y * size + x] = Math.round(shaped * 255);
    }
  }
  return { size, data };
}

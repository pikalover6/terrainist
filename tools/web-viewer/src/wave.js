/**
 * The two functions the vertex shader animates the world with, written twice.
 *
 * The GLSL copies live in `shaders.js` and are line-for-line these, which is a
 * duplication with one good reason: these are the only shader maths a node
 * test can hold, and both have properties worth pinning — the swell never
 * exceeds the gap water leaves under its own surface (0.1 of a block, see
 * `appearance.js`), and the sway is a continuous function of world position,
 * which is the whole reason a merged quad's shared edge does not tear.
 *
 * If you change one, change the other. `test/viewer.test.js` checks that the
 * GLSL and the JS still spell the same constants.
 */

/** Peak displacement of the water surface, in blocks. Under water's 0.1 gap. */
export const WATER_AMPLITUDE = 0.075;

/**
 * The swell: two octaves crossing at an angle, so the surface has travelling
 * ridges rather than a single sloshing plane.
 */
export function waterHeight(x, z, t) {
  return 0.045 * Math.sin(x * 0.55 + t * 1.1) + 0.03 * Math.sin(z * 0.73 - x * 0.21 + t * 0.77);
}

/**
 * The wind, as a horizontal offset at full strength.
 *
 * A slow phase term gusts the whole field in and out — a meadow where every
 * blade moves at one constant amplitude reads as a screensaver — and both
 * axes share the phase so the gust travels across the ground in a direction
 * rather than everywhere at once.
 */
export function plantSway(x, z, t) {
  const phase = x * 0.28 + z * 0.19;
  const gust = 0.5 + 0.5 * Math.sin(phase * 0.35 + t * 0.21);
  const swing = Math.sin(phase + t * 1.7) + 0.35 * Math.sin(phase * 2.3 + t * 3.1);
  const amount = 0.55 + 0.75 * gust;
  return [swing * 0.09 * amount, swing * 0.05 * amount];
}

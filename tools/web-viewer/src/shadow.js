/**
 * Where the sun's camera stands.
 *
 * One cascade, an orthographic box wide enough to cover what the fog lets you
 * see, and the only subtle part: **texel snapping**. A shadow map is a grid
 * fixed in the sun's frame; slide that grid by a fraction of a texel — which
 * is what happens every time the player takes a step, because the camera
 * follows him — and every shadow edge in the world crawls. Quantising the
 * camera's position to whole texels of its own grid pins the sampling pattern
 * to the world instead of to the walker, and the crawl goes away entirely.
 *
 * Pure arithmetic on purpose: this is the one piece of the shadow pipeline a
 * node test can actually hold, and "does it snap" is exactly the property that
 * is invisible in a screenshot and obvious in motion.
 */

const normalize = (v) => {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/**
 * An orthonormal frame for a sun direction: forward is the way the light
 * *travels*, which is the way the camera looks.
 */
export function sunBasis(sun) {
  const forward = normalize({ x: -sun.x, y: -sun.y, z: -sun.z });
  // Any up that is not parallel to the light. The sun never points straight
  // down in this viewer, but the guard costs nothing and a degenerate basis
  // costs a black screen.
  const hint = Math.abs(forward.y) > 0.98 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(forward, hint));
  const up = normalize(cross(right, forward));
  return { right, up, forward };
}

/**
 * Fit the sun's orthographic camera around a sphere of radius `radius` at
 * `center`, with its position snapped to the shadow map's own texel grid.
 *
 * Returns plain numbers — the caller pours them into a `THREE.OrthographicCamera`.
 */
export function fitSunCamera({ center, radius, sun, mapSize }) {
  const basis = sunBasis(sun);
  const { right, up, forward } = basis;
  const texel = (radius * 2) / Math.max(1, mapSize);

  const along = dot(center, right);
  const across = dot(center, up);
  const depth = dot(center, forward);
  const snappedAlong = Math.round(along / texel) * texel;
  const snappedAcross = Math.round(across / texel) * texel;
  // The depth axis does not affect the sampling grid, but snapping it too
  // makes the camera a pure function of the texel the player stands in, which
  // is the property the tests can actually hold.
  const snappedDepth = Math.round(depth / texel) * texel;

  const focus = {
    x: right.x * snappedAlong + up.x * snappedAcross + forward.x * snappedDepth,
    y: right.y * snappedAlong + up.y * snappedAcross + forward.y * snappedDepth,
    z: right.z * snappedAlong + up.z * snappedAcross + forward.z * snappedDepth,
  };

  // Stand well back: a tower outside the sphere still has to cast into it, so
  // the near plane is pushed behind everything the world can hold.
  const distance = radius * 2.5 + 64;
  return {
    eye: {
      x: focus.x - forward.x * distance,
      y: focus.y - forward.y * distance,
      z: focus.z - forward.z * distance,
    },
    target: focus,
    up,
    halfExtent: radius,
    near: 1,
    far: distance + radius * 2,
    texel,
  };
}

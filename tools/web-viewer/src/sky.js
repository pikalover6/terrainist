/**
 * The sun, the sky and the fog they share.
 *
 * Everything here is arithmetic and a 2D canvas, which is the point: the time
 * of day is not a light in the scene graph, it is a *direction* plus three
 * colours, and every other effect in the stack — the shadow map's camera, the
 * water's specular, the god rays' screen origin, the fog's warm side — reads
 * exactly those numbers. One place decides what "late afternoon" means.
 *
 * The default is golden hour, deliberately: a sun 11° above the horizon is the
 * only elevation at which a voxel world casts shadows long enough to describe
 * its own shape. Noon light is flat light, and a flat-lit box world looks like
 * a box world.
 */

/** Degrees above the horizon. Low, because long shadows are the whole point. */
export const SUN_ELEVATION = 11.5;

/** Compass bearing the sun sits at, before the per-world jitter. */
export const SUN_AZIMUTH = 118;

/** How far the per-world hash may swing the azimuth, in degrees. */
export const AZIMUTH_SPREAD = 26;

/**
 * A unit vector pointing *at* the sun.
 *
 * Azimuth is measured the way the viewer's yaw is: 0 looks down −Z, and the
 * angle turns toward +X. At the default 118° the sun sits over the walker's
 * right shoulder on the landing view, which is what rakes the shadows across
 * the frame rather than hiding them behind the geometry that casts them.
 */
export function sunDirection(azimuthDeg = SUN_AZIMUTH, elevationDeg = SUN_ELEVATION) {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevation);
  return {
    x: horizontal * Math.sin(azimuth),
    y: Math.sin(elevation),
    z: -horizontal * Math.cos(azimuth),
  };
}

/**
 * A stable azimuth for one world.
 *
 * Two worlds lit from the identical bearing look like the same afternoon; a
 * hash of the name spreads them across most of an hour of sun and never moves
 * once picked, so a screenshot of a given world is reproducible.
 */
export function worldAzimuth(name) {
  let hash = 2166136261;
  const text = String(name ?? "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const swing = ((hash >>> 8) % 2001) / 1000 - 1; // −1 … 1
  return SUN_AZIMUTH + swing * AZIMUTH_SPREAD;
}

/**
 * The three colours of a preset, in sRGB hex, plus the numbers the fog and the
 * grade read off them.
 *
 * `day` is the pre-shader viewer, unchanged, and it is what `?quality=off`
 * restores: a flat blue haze and a sky that does not know where the sun is.
 */
export const SKY_PRESETS = {
  day: {
    top: 0x3c78c8,
    horizon: 0x8fbbe8,
    ground: 0xdceaf6,
    sun: 0xfff2d8,
    sunDisc: 0xffffff,
    fog: 0xa8c8e8,
    ambient: 0xffffff,
    ambientLevel: 1,
    sunStrength: 0,
    fogNearScale: 1,
    fogFarScale: 1,
  },
  golden: {
    top: 0x2f6099,
    horizon: 0x9ec2dd,
    ground: 0xf6d8ac,
    sun: 0xffd9a0,
    sunDisc: 0xfff4e2,
    fog: 0xe4c39a,
    // Nearly neutral, a touch cool, and strong: this is the *sky* filling the
    // shadows, and it has to keep an unlit face close to the read the viewer
    // has always had. All the warmth is in what the sun adds on top.
    ambient: 0xdfe6ee,
    ambientLevel: 0.85,
    // Well over 1, because a sun 11° up puts only sin(11.5°) ≈ 0.2 of itself
    // on level ground: at a believable strength the *ground* barely changes and
    // a wall square to the light blazes, which is what golden hour looks like.
    sunStrength: 1.35,
    fogNearScale: 1.35,
    fogFarScale: 1.12,
  },
};

/** Split a 0xRRGGBB into three 0-255 channels. */
export function channels(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/**
 * Where a direction lands on an equirectangular sky texture.
 *
 * Mirrors three's own `equirectUv`, which is the function the background
 * shader will use to read the canvas this module paints: get it wrong and the
 * sun is drawn in a place the god rays do not agree with.
 */
export function equirectUv(direction) {
  const u = Math.atan2(direction.z, direction.x) / (Math.PI * 2) + 0.5;
  const v = Math.asin(Math.max(-1, Math.min(1, direction.y))) / Math.PI + 0.5;
  return [u, v];
}

/**
 * Paint the sky.
 *
 * A gradient would do — the viewer shipped with one — but a gradient has no
 * sun in it, and a sky with no sun in it makes every shaft of light in the
 * post chain a lie. So the canvas gets the real disc at the real bearing, a
 * wide warm glow around it, and a few soft cloud bands that thicken toward the
 * horizon. All of it is CPU work done exactly once at load.
 *
 * `createCanvas(width, height)` is injected so this can be exercised without a
 * DOM; the caller in the page hands it `document.createElement("canvas")`.
 */
export function paintSky(
  preset,
  sun,
  createCanvas,
  { width = 1024, height = 512, clouds = true, disc = true } = {},
) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const rgb = (hex, alpha = 1) => {
    const [r, g, b] = channels(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, rgb(preset.top));
  // 0.55, the same stop the pre-shader gradient used: with `disc` off this
  // canvas has to *be* the old sky, not resemble it.
  gradient.addColorStop(0.55, rgb(preset.horizon));
  gradient.addColorStop(1, rgb(preset.ground));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  // Canvas rows count from the top and the equirect v runs from the bottom, so
  // the sun's row is the flip of its v. (The same flip the atlas got wrong on
  // 2026-08-17; it is written out here rather than remembered.)
  const [u, v] = equirectUv(sun);
  const cx = u * width;
  const cy = (1 - v) * height;

  if (clouds) {
    context.globalAlpha = 0.14;
    context.fillStyle = rgb(0xffffff);
    for (let band = 0; band < 7; band++) {
      // Fixed constants, not random: the sky is part of a screenshot.
      const y = height * (0.30 + band * 0.052);
      const x = ((band * 311) % width) - width * 0.1;
      const w = width * (0.22 + (band % 3) * 0.13);
      const h = height * (0.020 + (band % 2) * 0.012);
      context.beginPath();
      context.ellipse(x + w / 2, y, w / 2, h, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(x + w / 2 + width * 0.5, y + h, w / 3, h * 0.8, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  // `disc` off is the pre-shader sky exactly: a gradient, no sun in it. That
  // is what `?quality=off` restores, and a sun painted into it would be the
  // one thing the old look did not have.
  if (!disc) return canvas;

  // The glow first, wide and warm, then the disc inside it.
  const glow = context.createRadialGradient(cx, cy, 0, cx, cy, width * 0.34);
  glow.addColorStop(0, rgb(preset.sun, 0.95));
  glow.addColorStop(0.12, rgb(preset.sun, 0.45));
  glow.addColorStop(0.4, rgb(preset.sun, 0.12));
  glow.addColorStop(1, rgb(preset.sun, 0));
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const body = context.createRadialGradient(cx, cy, 0, cx, cy, width * 0.028);
  body.addColorStop(0, rgb(preset.sunDisc, 1));
  body.addColorStop(0.55, rgb(preset.sunDisc, 0.9));
  body.addColorStop(1, rgb(preset.sunDisc, 0));
  context.fillStyle = body;
  context.fillRect(cx - width * 0.05, cy - width * 0.05, width * 0.1, width * 0.1);

  return canvas;
}

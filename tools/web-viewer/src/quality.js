/**
 * Three looks, one switch.
 *
 * `off` is a promise, not a fallback: it is the viewer exactly as it rendered
 * before any of this existed — one forward pass to the screen, no composer, no
 * shadow map, no animation in the vertex shader, the flat daylight haze. Every
 * effect in the stack is gated so that turning the switch off cannot leave a
 * residue behind, which is also why the gates are compile-time defines rather
 * than uniforms set to zero: an `off` frame runs the old program.
 *
 * `high` is the same picture with the expensive halves halved — a 1024 map, a
 * four-tap filter, eight ray samples, no cloud shadows. `ultra` is the whole
 * thing.
 *
 * Nothing here touches `localStorage` or `location` itself: both come in as
 * arguments, so the state machine is a pure function and the page is the only
 * part that needs a browser.
 */

/** The cycle order of the `U` key. */
export const QUALITY_MODES = ["ultra", "high", "off"];

/** Where the choice is remembered between visits. */
export const QUALITY_STORAGE_KEY = "terrainist.quality";

/** A mode name, or `undefined` if that is not one. */
export function normalizeQuality(value) {
  if (typeof value !== "string") return undefined;
  const mode = value.trim().toLowerCase();
  return QUALITY_MODES.includes(mode) ? mode : undefined;
}

/** The next mode in the cycle: ultra → high → off → ultra. */
export function nextQuality(mode) {
  const at = QUALITY_MODES.indexOf(mode);
  return QUALITY_MODES[(at + 1) % QUALITY_MODES.length];
}

/**
 * Which mode this page load runs in.
 *
 * The query string wins and is *not* stored — a `?quality=off` link is a way
 * to look at one thing once, not a way to reconfigure somebody's browser.
 * Otherwise the remembered choice wins, and failing that the default: ultra on
 * a desktop, high on a machine that told us it is small or touch-driven.
 */
export function resolveQuality({ query, stored, coarse = false } = {}) {
  return { mode: normalizeQuality(query) ?? normalizeQuality(stored) ?? (coarse ? "high" : "ultra") };
}

/**
 * What each mode actually costs.
 *
 * `shadowMap` 0 means the depth pass does not run at all; `rays` 0 means the
 * pass is dropped from the chain rather than rendered at zero strength. The
 * composer itself is skipped whenever `post` is false, so an `off` frame never
 * allocates or touches a render target.
 */
export function qualitySettings(mode) {
  switch (mode) {
    case "off":
      return Object.freeze({
        mode: "off",
        label: "off",
        preset: "day",
        post: false,
        shadowMap: 0,
        softShadows: false,
        shadowRadius: 0,
        cloudShadows: false,
        bloom: 0,
        rays: 0,
        water: false,
        wind: false,
        grade: false,
      });
    case "high":
      return Object.freeze({
        mode: "high",
        label: "high",
        preset: "golden",
        post: true,
        shadowMap: 1024,
        softShadows: false,
        shadowRadius: 120,
        cloudShadows: false,
        bloom: 0.5,
        rays: 10,
        water: true,
        wind: true,
        grade: true,
      });
    default:
      return Object.freeze({
        mode: "ultra",
        label: "ultra",
        preset: "golden",
        post: true,
        shadowMap: 2048,
        softShadows: true,
        shadowRadius: 150,
        cloudShadows: true,
        bloom: 0.6,
        rays: 24,
        water: true,
        wind: true,
        grade: true,
      });
  }
}

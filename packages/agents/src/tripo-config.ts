/**
 * Pinned Tripo3D configuration.
 *
 * Same reasoning as `config.ts` for OpenRouter: every endpoint and every
 * version string lives here as a named const so the client contains no magic
 * strings, and the mesh model is **pinned** rather than floating. Tripo's API
 * exposes a `model_version` that changes what geometry a prompt produces; a
 * floating "latest" would silently change the mesh — and therefore the voxels,
 * and therefore the world — between two compiles of the same document. That is
 * exactly the nondeterminism LOAM-SPEC §9.8 confines to the asset lockfile, so
 * the pin is part of the asset cache key and must be edited deliberately.
 *
 * Pin provenance: Tripo's `v3.0` generation line, per the provider block in
 * LOAM-SPEC §9.1 (`"model": "tripo-v3"`). Unlike OpenRouter, Tripo publishes no
 * public model-catalog endpoint, so the pin cannot be machine-verified against
 * a listing; {@link verifyTripoAvailable} instead performs a credential/
 * reachability liveness check and a submit-time probe. When Tripo rejects the
 * pinned version, change TRIPO_MODEL_VERSION here — never at a call site.
 */

/** Tripo open API root. */
export const TRIPO_BASE_URL = "https://api.tripo3d.ai/v2/openapi";

/** Task submission endpoint (POST) — text→3D and image→3D both go here. */
export const TRIPO_TASK_URL = `${TRIPO_BASE_URL}/task`;

/** Per-task status endpoint (GET); append the task id. */
export const TRIPO_TASK_STATUS_URL = `${TRIPO_BASE_URL}/task/`;

/** Account balance endpoint — the cheapest authenticated liveness probe. */
export const TRIPO_BALANCE_URL = `${TRIPO_BASE_URL}/user/balance`;

/** The pinned Tripo mesh model version. See the file header before changing. */
export const TRIPO_MODEL_VERSION = "v3.0-20250812";

/** Task type for a text prompt → mesh. */
export const TRIPO_TEXT_TASK_TYPE = "text_to_model";

/** Task type for an uploaded/reachable image → mesh. */
export const TRIPO_IMAGE_TASK_TYPE = "image_to_model";

/**
 * How many status polls before giving up on a task.
 *
 * Bounded on purpose: an unbounded poll loop turns a provider outage into a
 * hung compile. At {@link TRIPO_POLL_INTERVAL_MS} this is ~10 minutes, which
 * comfortably covers Tripo's observed generation times with headroom.
 */
export const TRIPO_MAX_POLL_ATTEMPTS = 120;

/** Delay between status polls, in milliseconds. */
export const TRIPO_POLL_INTERVAL_MS = 5_000;

/** How many characters of an error body to include in a thrown message. */
export const TRIPO_ERROR_BODY_LIMIT = 500;

/** Terminal task states Tripo reports for a completed generation. */
export const TRIPO_SUCCESS_STATUS = "success";

/** Terminal task states that mean the task will never produce a mesh. */
export const TRIPO_FAILURE_STATUSES: readonly string[] = Object.freeze([
  "failed",
  "cancelled",
  "banned",
  "expired",
  "unknown",
]);

/**
 * The voxelizer pipeline version that participates in the asset cache key.
 *
 * Bumped whenever the mesh→voxel→block pipeline changes shape in a way that
 * would alter output for an unchanged mesh (§9.9). The voxelizer itself is a
 * later round; the constant exists now so cache keys minted today stay
 * meaningful.
 */
export const VOXELIZER_VERSION = "0";

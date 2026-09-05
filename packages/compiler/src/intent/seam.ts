/**
 * The one seam file.
 *
 * Fan-out law 1 says the intent package never imports a subsystem — so exactly
 * one file does, and it is this one, whose entire job is to pull each
 * subsystem's row module in and let it register. Everything else in
 * `packages/compiler/src/intent/` imports nothing but `@terrainist/spec`.
 *
 * Installing is idempotent and cheap (it re-registers by id into a Map), which
 * matters because the tests clear the registry to prove the byte-identity law
 * and then have to put it back.
 *
 * Phase 3 wave 1 adds the compiler-resolved seam beside the fan-out seam:
 * `compiler-resolved.ts` grounds author strings once per scope (climate,
 * flora, palette, form) so later passes do not re-parse them. It is installed
 * through this file — `resolveCompilerIntents` calls `ensureFanOutRows` — so
 * `resolve.ts` stays free of subsystem imports.
 */

import { registerMixFanOut } from "../layout/mix-intent.js";
import { registerLayoutFanOut } from "../layout/streets-intent.js";
import { registerFarmFanOut } from "../structures/farm-intent.js";
import { registerStructureFanOut } from "../structures/themes-intent.js";
import { registerTerrainFanOut } from "../terrain/climate-intent.js";
import { registerFloraFanOut } from "../terrain/flora-intent.js";

let installed = false;

/** Register every fan-out row the compiler ships with. */
export function installFanOutRows(): void {
  registerLayoutFanOut();
  registerMixFanOut();
  registerStructureFanOut();
  registerFarmFanOut();
  registerTerrainFanOut();
  registerFloraFanOut();
  installed = true;
}

/** True once {@link installFanOutRows} has run in this process. */
export function fanOutInstalled(): boolean {
  return installed;
}

/** Install once per process, for callers on a hot path. */
export function ensureFanOutRows(): void {
  if (!installed) installFanOutRows();
}

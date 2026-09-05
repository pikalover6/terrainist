/**
 * **The compiler's internal representation** — `@terrainist/spec/ir`.
 *
 * Loam 1 (`@terrainist/spec`) is the only authoring language. Every Loam 1
 * document is lowered by `lowerLoam` onto the profile below — the terrain
 * profile, the settlement profile, the intent dials and the bespoke program
 * types — and that lowered document is what the compiler reads. Nothing here
 * is a user path: the CLI accepts `loam: "1"` only, the kit describes Loam 1
 * only, and the lowered document is written to disk only under `--debug-ir`.
 */

export * from "./terrain/index.js";
export * from "./settlement/index.js";
export * from "./intent/index.js";
export * from "./programs/index.js";

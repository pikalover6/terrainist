/**
 * `AuthoredProgram` — the bespoke tier (Phase 0 contract 2).
 *
 * Shape, static lint and validation only. The sandbox, the fuel meter, the
 * hashes and the five-step gate live in `@terrainist/compiler`'s `programs/`
 * directory, because they are compile-time decisions; this package owns what
 * is legal to write down.
 */

export * from "./types.js";
export * from "./lint.js";
export * from "./requests.js";
export * from "./validate.js";

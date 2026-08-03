/**
 * `SemanticIntent` — the author-facing dials (Phase 0 contract 1).
 *
 * Types and validation only. Resolution (inheritance along the node path) and
 * the fan-out registry live in the compiler, because they are compile-time
 * decisions; the spec package owns the shape and what is legal to write.
 */

export * from "./types.js";
export * from "./validate.js";

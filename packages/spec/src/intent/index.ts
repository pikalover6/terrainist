/**
 * `SemanticIntent` — the author-facing dials (Phase 0 contract 1).
 *
 * Types and validation only. Resolution (inheritance along the node path) and
 * the fan-out registry live in the compiler, because they are compile-time
 * decisions; the spec package owns the shape and what is legal to write.
 *
 * The author-visible catalogs (material themes, form packs) live in
 * `types.ts` as `MATERIAL_THEME_IDS` / `FORM_PACK_SPECS` / `FORM_PACK_THESES`;
 * stdlib and agents consume those canonical tables so the prompt vocabulary
 * and the validator name the same ids in the same order.
 */


export * from "./types.js";
export * from "./validate.js";

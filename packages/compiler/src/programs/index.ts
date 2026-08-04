/**
 * Authored programs — the bespoke tier's compiler half (Phase 0 contract 2).
 *
 * `fuel.ts` meters them, `sandbox.ts` runs them, `run.ts` implements the API
 * and the budgets, `invoke.ts` is the landmark and plugin paths, `place.ts`
 * resolves plugin sites, `verify.ts` is the five-step gate, and `pass.ts`
 * lowers finished runs into blocks and markers the rest of the compiler
 * already understands.
 */

export * from "./fuel.js";
export * from "./hash.js";
export * from "./sandbox.js";
export * from "./run.js";
export * from "./invoke.js";
export * from "./place.js";
export * from "./verify.js";
export * from "./interiors.js";
export * from "./pass.js";
export * from "./road-anchors.js";

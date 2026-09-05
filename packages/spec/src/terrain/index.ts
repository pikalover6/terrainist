/**
 * The **terrain profile** — part of the compiler's internal representation
 * (`@terrainist/spec/ir`): types, diagnostics and validator. A Loam 1
 * document is lowered onto it by `lowerLoam`; nothing authors it directly.
 *
 * `diagnostics.js` is the single owner for diagnostic codes and their
 * severity/author-correctability/feedback/physics-lint/internal metadata;
 * everything else — CLI feedback, compiler tests, agents — queries it rather
 * than copying lists. It is also exported from `@terrainist/spec` itself,
 * because Loam 1 speaks the same diagnostics.
 */

export * from "./diagnostics.js";
export * from "./types.js";
export * from "./validate.js";

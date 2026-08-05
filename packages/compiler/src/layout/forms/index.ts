/**
 * The urban-form seam.
 *
 * A consumer imports **this** file and nothing else under `forms/`:
 * `drawFabric` to draw a quarter, the contract types to talk about one,
 * `axial.ts`'s shared linework (`densify4`, `runsOf`, `rotateOffset`, the width
 * table) to build one. `registry.ts` is the only file that imports a form
 * module, which is what makes adding a form a module plus one line.
 */

export * from "./axial.js";
export * from "./registry.js";
export * from "./types.js";
export { GRID_FORM } from "./grid.js";
export { ORGANIC_FORM } from "./organic.js";

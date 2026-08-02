/**
 * The terrain-profile compiler (G2b).
 *
 * `compileTerrain(json, { outDir })` takes a validated terrain-profile
 * document all the way to a Minecraft Java world folder.
 */

export {
  TERRAIN_DIAGNOSTICS,
  formatDiagnostic,
  hasErrors,
  validateTerrainDocument,
} from "@terrainist/spec";
export type { LoamDiagnostic, TerrainDocument, TerrainValidation } from "@terrainist/spec";

export * from "./biomes.js";
export * from "./climate.js";
export * from "./columns.js";
export * from "./compile.js";
export * from "./emit.js";
export * from "./landuse.js";
export * from "./palette.js";
export * from "./validate.js";
export * from "./vegetation.js";

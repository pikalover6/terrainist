/**
 * Anvil emit — shared Minecraft world helpers.
 *
 * Deterministic region + level.dat writers used by normal Loam compilation.
 */

export { DEFAULT_BIOME, buildLevelDat } from "./level-dat.js";
export type { LevelDatOptions, LevelDatSpawn } from "./level-dat.js";

export {
  EMIT_MINECRAFT_VERSION,
  WORLD_HEIGHT,
  WORLD_MIN_Y,
  listChunks,
  listRegionFiles,
  loadPrismarine,
  readGzippedNbt,
  readRegionChunksNbt,
  writeGzippedNbt,
} from "./prismarine.js";
export type {
  ChunkPos,
  EmitAnvil,
  EmitBlock,
  EmitChunk,
  EmitColumnTop,
  PrismarineStack,
  RawChunkNbt,
} from "./prismarine.js";

export { zeroRegionTimestamps } from "./timestamps.js";

export { applyConnectionStates, connectiveKindOf } from "./connections.js";
export type { ConnectionCandidate, ConnectionStats, ConnectiveKind } from "./connections.js";

export { PHYSICS_RULES, lintWorldPhysics, readBlockEntities } from "./physics.js";
export type {
  PhysicsContext,
  PhysicsFinding,
  PhysicsReport,
  PlacedBlockEntity,
} from "./physics.js";

export {
  SIGN_LINES,
  blockEntity,
  blockEntityIdOf,
  commandBlockEntity,
  hangingSignEntity,
  requiredBlockEntityId,
  signEntity,
} from "./block-entities.js";
export type {
  BlockEntity,
  CommandBlockOptions,
  SignFace,
  SignOptions,
} from "./block-entities.js";

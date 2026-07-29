/**
 * Anvil emit — the G1 spike's world writer.
 *
 * Input is the throwaway `terrainist-spike-0` fixture format, not Loam; the
 * Loam front end plugs into {@link emitWorld} once it exists.
 */

export { SPIKE_FORMAT, loadSpikeDocument, parseSpikeDocument } from "./document.js";
export type { SpikeDocument, SpikeFillOp, SpikeOp, SpikeSpawn } from "./document.js";

export { DEFAULT_BIOME, buildLevelDat } from "./level-dat.js";
export type { LevelDatOptions } from "./level-dat.js";

export {
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

export { EMIT_MINECRAFT_VERSION, emitWorld, zeroRegionTimestamps } from "./world.js";
export type { EmitBounds, EmitOptions, EmitSummary } from "./world.js";

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

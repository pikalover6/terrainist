/**
 * Worldgen agents.
 *
 * G3 scope: one agent — the **terrain author**. It hands GLM 5.2 the
 * terrain-author spec kit as a system prompt, extracts the JSON document from
 * the reply, validates it, and retries with the validator's diagnostics
 * verbatim until the document is valid or the attempt budget runs out.
 *
 * The multi-agent planner/implementer split of `docs/DESIGN.md` is still
 * ahead; nothing here presumes it.
 */

export {
  AuthoringFailedError,
  authorLoamDoc,
  authorTerrainDoc,
  compileFeedbackPrompt,
  retryPrompt,
  reviseLoamDoc,
  userPrompt,
} from "./author.js";
export type {
  AuthorAttempt,
  AuthorRequest,
  AuthorResult,
  AuthoredDocument,
  ReviseRequest,
} from "./author.js";

export {
  ATTRIBUTION_HEADERS,
  AUTHORING_MODEL_ID,
  AUTHORING_REASONING_EFFORT,
  AUTHORING_TEMPERATURE,
  CHAT_COMPLETIONS_URL,
  GLM_MODEL_ID,
  MAX_AUTHOR_ATTEMPTS,
  MAX_COMPILE_ROUNDS,
  MODELS_URL,
  OPENROUTER_BASE_URL,
} from "./config.js";

export {
  findRepoRoot,
  loadOpenRouterKey,
  loadTripoKey,
  parseEnv,
  readDotEnv,
} from "./env.js";

export {
  ASSET_ARTIFACT_MISSING,
  ASSET_KEY_PREFIX,
  ASSET_LOCK_FILENAME,
  ASSET_LOCK_KIND,
  ASSET_LOCK_LOAM_VERSION,
  AssetArtifactMissingError,
  AssetLockFormatError,
  artifactPathFor,
  assetCacheKey,
  canonicalJson,
  emptyAssetLock,
  loadAssetLock,
  narrowAssetLock,
  saveAssetLock,
  serializeAssetLock,
  sha256Hex,
  toHex,
  withAssetEntry,
  resolveAsset,
} from "./asset-lock.js";
export type {
  AssetCacheKey,
  AssetCacheKeyInputs,
  AssetLock,
  AssetLockEntry,
  AssetResolution,
  JsonValue,
  ResolveAssetOptions,
} from "./asset-lock.js";

export {
  TRIPO_BALANCE_URL,
  TRIPO_BASE_URL,
  TRIPO_ERROR_BODY_LIMIT,
  TRIPO_FAILURE_STATUSES,
  TRIPO_IMAGE_TASK_TYPE,
  TRIPO_MAX_POLL_ATTEMPTS,
  TRIPO_MODEL_VERSION,
  TRIPO_POLL_INTERVAL_MS,
  TRIPO_SUCCESS_STATUS,
  TRIPO_TASK_STATUS_URL,
  TRIPO_TASK_URL,
  TRIPO_TEXT_TASK_TYPE,
  VOXELIZER_VERSION,
} from "./tripo-config.js";

export {
  TripoPollTimeoutError,
  TripoTaskFailedError,
  fetchMeshBytes,
  generateMesh,
  getTaskStatus,
  pollTask,
  submitImageTask,
  submitTextTask,
  verifyTripoAvailable,
} from "./tripo.js";
export type {
  SleepLike,
  TripoClientOptions,
  TripoCompletedTask,
  TripoImageTaskRequest,
  TripoPollOptions,
  TripoTask,
  TripoTaskStatus,
  TripoTextTaskRequest,
} from "./tripo.js";

export {
  FANTASY_FLORA_IDS,
  FLORA_CHARACTER_WORDS,
  FLORA_PROGRAM_WORDS,
  INTENT_CLASSIFIER_PROMPT,
  MAX_INTENT_ATTEMPTS,
  classifyPromptIntent,
  formatClassification,
  intentKitContext,
  retryIntentPrompt,
} from "./intent-prepass.js";
export type { ClassifyIntentRequest, IntentClassification } from "./intent-prepass.js";

export {
  DEFAULT_BESPOKE_BUDGET_USD,
  MAX_PROGRAM_ROUNDS,
  MAX_PROGRAM_SOURCE_BYTES,
  PROGRAM_AUTHOR_PROMPT,
  PROGRAM_PROPOSAL_PROMPT,
  applyBudget,
  attachPrograms,
  authorProgram,
  authorPrograms,
  collectProgramRequests,
  extractProgramSource,
  formatProgramRun,
  hashSource,
  lintSourceLocally,
  normalizeRequests,
  parseEnvelope,
  programBudget,
  programUserPrompt,
  proposePrograms,
  repairPrompt,
  slugId,
} from "./program-author.js";
export type {
  AuthorProgramOutcome,
  AuthorProgramRequest,
  AuthorProgramsRequest,
  AuthorProgramsResult,
  AuthoredProgramEntry,
  ProgramBudget,
  ProgramRequest,
  ProgramRunRecord,
  ProposalResult,
  ProposeRequest,
} from "./program-author.js";

export {
  WIRING_MAX_ATTEMPTS,
  collectProgramInvocations,
  findOrphanPrograms,
  programWiringFeedback,
  reviseForProgramWiring,
} from "./program-wiring.js";
export type {
  OrphanProgram,
  ProgramInvocations,
  ProgramWiringRequest,
  ProgramWiringResult,
} from "./program-wiring.js";

export {
  findMissingPrograms,
  formatProgramRecovery,
  planProgramRecovery,
  recoverMissingPrograms,
} from "./program-recovery.js";
export type {
  MissingProgram,
  ProgramRecoveryRequest,
  ProgramRecoveryResult,
} from "./program-recovery.js";

export { stubProgramGate } from "./program-gate.js";
export type {
  ProgramDocContext,
  ProgramMode,
  ProgramSubmission,
  ProgramVerificationGate,
  StubGateOptions,
} from "./program-gate.js";

export { extractJson, stripFences } from "./json.js";
export type { JsonExtraction } from "./json.js";

export {
  DEFAULT_KIT,
  KIT_RELATIVE_PATH,
  SETTLEMENT_KIT_RELATIVE_PATH,
  kitRelativePath,
  loadAuthorKit,
  loadSettlementAuthorKit,
  loadTerrainAuthorKit,
} from "./kit.js";
export type { KitName } from "./kit.js";

export { chatComplete, sumUsage, verifyModelAvailable } from "./openrouter.js";
export type {
  ChatMessage,
  ChatOptions,
  ClientOptions,
  CompletionResult,
  FetchLike,
  Usage,
} from "./openrouter.js";

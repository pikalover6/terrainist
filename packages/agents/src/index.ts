/**
 * The model-calling stage of Terrainist.
 *
 * Three agents, all speaking Loam 1: the intent classifier (a cheap pre-pass
 * over the prompt), the document author (the kit as system prompt, the
 * validator's diagnostics driving retries), and the program author (one
 * bespoke program per thing the catalog cannot make).
 */

export {
  AuthoringFailedError,
  authorLoamDoc,
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
  LoamObject,
  ReviseRequest,
} from "./author.js";

export {
  AUTHORING_MODEL_ID,
  AUTHORING_REASONING_EFFORT,
  AUTHORING_TEMPERATURE,
  DEFAULT_API_BASE,
  MAX_AUTHOR_ATTEMPTS,
  MAX_COMPILE_ROUNDS,
} from "./config.js";

export {
  apiBaseUrl,
  defaultModel,
  findRepoRoot,
  loadApiConfig,
  loadApiKey,
  parseEnv,
  readDotEnv,
} from "./env.js";
export type { ApiConfig } from "./env.js";

export {
  FANTASY_FLORA_IDS,
  FLORA_CHARACTER_WORDS,
  FLORA_PROGRAM_WORDS,
  FORM_PACK_THESES,
  INTENT_CLASSIFIER_PROMPT,
  MATERIAL_THEME_IDS,
  MAX_INTENT_ATTEMPTS,
  classifyPromptIntent,
  formatClassification,
  intentKitContext,
  loamIntent,
  retryIntentPrompt,
} from "./intent-prepass.js";
export type { ClassifyIntentRequest, IntentClassification } from "./intent-prepass.js";

export {
  DEFAULT_BESPOKE_BUDGET_USD,
  MAX_PROGRAM_ROUNDS,
  MAX_PROGRAM_SOURCE_BYTES,
  PROGRAM_AUTHOR_PROMPT,
  applyBudget,
  attachPrograms,
  authorProgram,
  authorPrograms,
  collectProgramRequests,
  extractProgramSource,
  formatProgramRun,
  hashSource,
  lintSourceLocally,
  parseEnvelope,
  programBudget,
  programUserPrompt,
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
} from "./program-author.js";

export { stubProgramGate } from "./program-gate.js";
export type { StubGateOptions } from "./program-gate.js";

export { extractJson, stripFences } from "./json.js";
export type { JsonExtraction } from "./json.js";

export {
  DEFAULT_KIT,
  SETTLEMENT_KIT_RELATIVE_PATH,
  kitRelativePath,
  loadAuthorKit,
  loadSettlementAuthorKit,
} from "./kit.js";
export type { KitName } from "./kit.js";

export { chatComplete, chatCompletionsUrl, sumUsage } from "./chat.js";
export type {
  ChatMessage,
  ChatOptions,
  ClientOptions,
  CompletionResult,
  FetchLike,
  Usage,
} from "./chat.js";

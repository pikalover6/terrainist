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
  AUTHORING_REASONING_EFFORT,
  AUTHORING_TEMPERATURE,
  CHAT_COMPLETIONS_URL,
  GLM_MODEL_ID,
  MAX_AUTHOR_ATTEMPTS,
  MAX_COMPILE_ROUNDS,
  MODELS_URL,
  OPENROUTER_BASE_URL,
} from "./config.js";

export { findRepoRoot, loadOpenRouterKey, parseEnv, readDotEnv } from "./env.js";

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

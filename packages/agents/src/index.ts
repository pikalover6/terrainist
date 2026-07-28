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
  authorTerrainDoc,
  retryPrompt,
  userPrompt,
} from "./author.js";
export type { AuthorAttempt, AuthorRequest, AuthorResult } from "./author.js";

export {
  ATTRIBUTION_HEADERS,
  AUTHORING_REASONING_EFFORT,
  AUTHORING_TEMPERATURE,
  CHAT_COMPLETIONS_URL,
  GLM_MODEL_ID,
  MAX_AUTHOR_ATTEMPTS,
  MODELS_URL,
  OPENROUTER_BASE_URL,
} from "./config.js";

export { findRepoRoot, loadOpenRouterKey, parseEnv, readDotEnv } from "./env.js";

export { extractJson, stripFences } from "./json.js";
export type { JsonExtraction } from "./json.js";

export { KIT_RELATIVE_PATH, loadTerrainAuthorKit } from "./kit.js";

export { chatComplete, sumUsage, verifyModelAvailable } from "./openrouter.js";
export type {
  ChatMessage,
  ChatOptions,
  ClientOptions,
  CompletionResult,
  FetchLike,
  Usage,
} from "./openrouter.js";

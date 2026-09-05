/**
 * Defaults for the model API.
 *
 * Terrainist talks to any OpenAI-compatible chat-completions endpoint. Where
 * it talks, with which key and to which model come from the environment or
 * the repo-root `.env` (see `env.ts`): `TERRAINIST_API_BASE`,
 * `TERRAINIST_API_KEY` (or `OPENROUTER_API_KEY`) and `TERRAINIST_MODEL`.
 * The defaults below are the pinned setup the language was proved on:
 * OpenRouter, Gemini 3.8 Flash, reasoning effort high, temperature 1.
 */

/** The default API base: OpenRouter's OpenAI-compatible root. */
export const DEFAULT_API_BASE = "https://openrouter.ai/api/v1";

/** The default authoring model id (Gemini 3.8 Flash on OpenRouter). */
export const AUTHORING_MODEL_ID = "google/gemini-3.8-flash";

/**
 * Sampling temperature for document and bespoke-program authoring.
 *
 * `temperature: 1` is an explicit creative-diversity choice for generation.
 * Compiler output remains deterministic for a fixed authored document and
 * world seed.
 */
export const AUTHORING_TEMPERATURE = 1;

/** Reasoning effort sent as the OpenAI `reasoning_effort` parameter. */
export const AUTHORING_REASONING_EFFORT = "high";

/**
 * Output budget for a bespoke-program call, reasoning included.
 *
 * Gemini 3.8 Flash's pinned OpenRouter endpoint advertises 65,536 completion
 * tokens. Keep the request at that provider ceiling: a larger value cannot
 * create capacity and risks a deterministic request-validation failure.
 */
export const PROGRAM_AUTHOR_MAX_TOKENS = 65_536;

/** How many authoring attempts (initial + diagnostic retries) before giving up. */
export const MAX_AUTHOR_ATTEMPTS = 3;

/**
 * How many compile-feedback revision rounds a document gets by default.
 *
 * Zero: one shot is the bar. A document that validates is compiled once and
 * its findings are printed; `--compile-rounds N` opts into revision rounds,
 * each of which costs a full compile plus a long completion.
 */
export const MAX_COMPILE_ROUNDS = 0;

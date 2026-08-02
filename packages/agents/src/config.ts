/**
 * Pinned OpenRouter configuration.
 *
 * The model ids below were found by querying https://openrouter.ai/api/v1/models
 * and are pinned deliberately: a floating "latest" would make generation
 * non-reproducible across runs, which is the one thing this project refuses to
 * give up. {@link verifyModelAvailable} re-checks the pin against the live
 * catalog and reports near-matches when it has gone away.
 *
 * Default authoring model: **GPT 5.6 Luna** (2026-08-02, Kai's call). The
 * 2026-08-01 model comparison found it equal to GLM 5.2 on authoring
 * reliability at roughly one third of the cost, and cheapness is a core goal of
 * this project. GLM stays one flag away — `--model z-ai/glm-5.2` (or
 * {@link GLM_MODEL_ID} programmatically) restores the old default exactly.
 */

/** The default authoring model id on OpenRouter (GPT 5.6 Luna). */
export const AUTHORING_MODEL_ID = "openai/gpt-5.6-luna";

/**
 * The GLM 5.2 model id on OpenRouter.
 *
 * No longer the default (see {@link AUTHORING_MODEL_ID}), kept as the
 * one-flag-away fallback and for pin-verification tests.
 */
export const GLM_MODEL_ID = "z-ai/glm-5.2";

/** OpenRouter API root. */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Chat completions endpoint. */
export const CHAT_COMPLETIONS_URL = `${OPENROUTER_BASE_URL}/chat/completions`;

/** Model catalog endpoint. */
export const MODELS_URL = `${OPENROUTER_BASE_URL}/models`;

/**
 * Sampling settings for document authoring.
 *
 * `temperature: 0` because the same prompt and seed must yield the same world;
 * `reasoning.effort: "max"` because laying out a landscape in fractional
 * coordinates is the part of the job the model has to actually think about —
 * and with the 2026-08-02 switch to GPT 5.6 Luna the per-run cost dropped far
 * enough (~1/3 of GLM 5.2) that the top effort tier is affordable by default.
 */
export const AUTHORING_TEMPERATURE = 0;

/** Reasoning effort passed to OpenRouter's unified `reasoning` parameter. */
export const AUTHORING_REASONING_EFFORT = "max";

/** How many authoring attempts (initial + diagnostic retries) before giving up. */
export const MAX_AUTHOR_ATTEMPTS = 3;

/**
 * How many compile-feedback revision rounds a document gets.
 *
 * Separate from {@link MAX_AUTHOR_ATTEMPTS}, and much smaller: a validation
 * retry is cheap and almost always converges, while a compile round costs a
 * full compile plus a long completion, and the second round has historically
 * been where the returns stop.
 */
export const MAX_COMPILE_ROUNDS = 2;

/** Attribution headers OpenRouter uses for its rankings page. */
export const ATTRIBUTION_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "HTTP-Referer": "https://github.com/terrainist",
  "X-Title": "Terrainist",
});

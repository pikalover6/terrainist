/**
 * Pinned OpenRouter configuration.
 *
 * The model id below was found by querying https://openrouter.ai/api/v1/models
 * on 2026-07-28 and is pinned deliberately: a floating "latest GLM" would make
 * generation non-reproducible across runs, which is the one thing this project
 * refuses to give up. {@link verifyModelAvailable} re-checks the pin against
 * the live catalog and reports near-matches when it has gone away.
 *
 * Catalog entry at pin time:
 *   z-ai/glm-5.2 — "Z.ai: GLM 5.2", 1,048,576-token context.
 */

/** The GLM 5.2 model id on OpenRouter. */
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
 * `reasoning.effort: "high"` because laying out a landscape in fractional
 * coordinates is the part of the job the model has to actually think about.
 */
export const AUTHORING_TEMPERATURE = 0;

/** Reasoning effort passed to OpenRouter's unified `reasoning` parameter. */
export const AUTHORING_REASONING_EFFORT = "high";

/** How many authoring attempts (initial + diagnostic retries) before giving up. */
export const MAX_AUTHOR_ATTEMPTS = 3;

/** Attribution headers OpenRouter uses for its rankings page. */
export const ATTRIBUTION_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "HTTP-Referer": "https://github.com/terrainist",
  "X-Title": "Terrainist",
});

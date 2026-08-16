/**
 * Pinned OpenRouter configuration.
 *
 * The model ids below were found by querying https://openrouter.ai/api/v1/models
 * and are pinned deliberately: a floating "latest" would make generation
 * non-reproducible across runs, which is the one thing this project refuses to
 * give up. {@link verifyModelAvailable} re-checks the pin against the live
 * catalog and reports near-matches when it has gone away.
 *
 * Default authoring model: **Gemini 3.7 Flash at effort "high"** (2026-08-15,
 * Kai's call — "permanently replacing luna max with gemini 3.7 flash high for
 * all uses"). Basis: once the harness stopped killing its programs for
 * mechanical nits (auto-braced bodies, the chain rename, gate leniency, one
 * canonical source hash), the seven-prompt battery sweep ran ~$1.90 for seven
 * worlds and Kai's walks judged the results decisively better — "the demo
 * worlds are insane"; the bespoke gauntlet's elephant was "miles ahead" of
 * Luna's. Luna stays one flag away — `--model openai/gpt-5.6-luna` (or
 * {@link LUNA_MODEL_ID} programmatically) restores the old default exactly.
 */

/** The default authoring model id on OpenRouter (Gemini 3.7 Flash). */
export const AUTHORING_MODEL_ID = "google/gemini-3.7-flash";

/**
 * The GPT 5.6 Luna model id on OpenRouter.
 *
 * The 2026-08-02 → 2026-08-15 default; kept as the one-flag-away fallback and
 * for pin-verification tests.
 */
export const LUNA_MODEL_ID = "openai/gpt-5.6-luna";

/**
 * The GLM 5.2 model id on OpenRouter.
 *
 * The original default; kept for pin-verification tests.
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
 * `reasoning.effort: "high"` is Gemini 3.7 Flash's measured sweet spot — the
 * whole 2026-08-15 evaluation ran at high, it spends ~50% of output on
 * reasoning (vs Luna's ~90% at max) and passed the battery on it; the higher
 * tiers were never needed.
 */
export const AUTHORING_TEMPERATURE = 0;

/** Reasoning effort passed to OpenRouter's unified `reasoning` parameter. */
export const AUTHORING_REASONING_EFFORT = "high";

/**
 * Output budget for a bespoke-program call, reasoning included.
 *
 * Measured 2026-08-04: at max effort a hard landmark brief regularly burns the
 * provider's default 65,536-token output allowance entirely on reasoning and
 * returns `finish_reason: "length"` with no content at all — two of three test
 * worlds died that way. The budget is the fix; thinking less is not, because
 * the thinking is the part of the job that makes the program good.
 */
export const PROGRAM_AUTHOR_MAX_TOKENS = 120_000;

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

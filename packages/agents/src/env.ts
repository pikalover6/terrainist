/**
 * Repo-root discovery and a minimal `.env` reader.
 *
 * No dotenv dependency: the file holds one secret and a three-line parser is
 * easier to audit than a package. The key is never logged, never included in
 * an error message, and never re-exported as part of any result object.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { AUTHORING_MODEL_ID, DEFAULT_API_BASE } from "./config.js";
import { fileURLToPath } from "node:url";

/** Marker that identifies the repo root when walking up from this module. */
const ROOT_MARKER = path.join("kits", "settlement-author.md");

/**
 * The repository root — the nearest ancestor directory holding the spec kit.
 *
 * Walks up from this module, so it works from `src/` under vitest and from
 * `dist/` under the built CLI alike.
 */
export function findRepoRoot(startDir?: string): string {
  let dir = startDir ?? path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(dir, ROOT_MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `@terrainist/agents: could not find the repo root above ${startDir ?? dir} (looked for ${ROOT_MARKER})`,
      );
    }
    dir = parent;
  }
}

/**
 * Parse a `.env` file body into a plain record.
 *
 * Supports `KEY=value`, `export KEY=value`, `#` comments, blank lines, and
 * single- or double-quoted values. Everything else is ignored rather than
 * throwing — a malformed line must not take down world generation.
 */
export function parseEnv(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "") out[key] = value;
  }
  return out;
}

/** Read the repo-root `.env`, returning an empty record when it is absent. */
export function readDotEnv(repoRoot?: string): Record<string, string> {
  const root = repoRoot ?? findRepoRoot();
  const file = path.join(root, ".env");
  if (!existsSync(file)) return {};
  return parseEnv(readFileSync(file, "utf8"));
}

/** Where the model API lives, what key opens it, and which model to ask for. */
export interface ApiConfig {
  /** The OpenAI-compatible API root, e.g. `https://openrouter.ai/api/v1`. */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

/** One setting, from the process environment first and the repo `.env` second. */
function setting(names: readonly string[], repoRoot?: string): string | undefined {
  for (const name of names) {
    const v = process.env[name];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  const dotenv = readDotEnv(repoRoot);
  for (const name of names) {
    const v = dotenv[name];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return undefined;
}

/** The API base URL: `TERRAINIST_API_BASE`, else OpenRouter. Trailing slashes are dropped. */
export function apiBaseUrl(repoRoot?: string): string {
  return (setting(["TERRAINIST_API_BASE"], repoRoot) ?? DEFAULT_API_BASE).replace(/\/+$/, "");
}

/** The default model: `TERRAINIST_MODEL`, else the pinned {@link AUTHORING_MODEL_ID}. */
export function defaultModel(repoRoot?: string): string {
  return setting(["TERRAINIST_MODEL"], repoRoot) ?? AUTHORING_MODEL_ID;
}

/**
 * The API key: `TERRAINIST_API_KEY`, else `OPENROUTER_API_KEY`, from the
 * process environment or the repo `.env`.
 *
 * Throws with a message that says where to put the key and never echoes any
 * part of it.
 */
export function loadApiKey(repoRoot?: string): string {
  const key = setting(["TERRAINIST_API_KEY", "OPENROUTER_API_KEY"], repoRoot);
  if (key === undefined) {
    throw new Error(
      "@terrainist/agents: no API key — add `TERRAINIST_API_KEY=...` (or `OPENROUTER_API_KEY=...`) to the repo-root .env or export it",
    );
  }
  return key;
}

/** All three settings at once. Throws when there is no key. */
export function loadApiConfig(repoRoot?: string): ApiConfig {
  return { baseUrl: apiBaseUrl(repoRoot), apiKey: loadApiKey(repoRoot), model: defaultModel(repoRoot) };
}

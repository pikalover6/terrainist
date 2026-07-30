/**
 * Repo-root discovery and a minimal `.env` reader.
 *
 * No dotenv dependency: the file holds one secret and a three-line parser is
 * easier to audit than a package. The key is never logged, never included in
 * an error message, and never re-exported as part of any result object.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Marker that identifies the repo root when walking up from this module. */
const ROOT_MARKER = path.join("docs", "kits", "terrain-author.md");

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

/**
 * The OpenRouter API key, from the process environment or the repo `.env`.
 *
 * Throws with a message that says where to put the key and never echoes any
 * part of it.
 */
export function loadOpenRouterKey(repoRoot?: string): string {
  const fromProcess = process.env["OPENROUTER_API_KEY"];
  if (fromProcess !== undefined && fromProcess.trim() !== "") return fromProcess.trim();

  const key = readDotEnv(repoRoot)["OPENROUTER_API_KEY"];
  if (key === undefined || key.trim() === "") {
    throw new Error(
      "@terrainist/agents: no OPENROUTER_API_KEY — add `OPENROUTER_API_KEY=sk-or-...` to the repo-root .env or export it",
    );
  }
  return key.trim();
}

/**
 * The Tripo3D API key, from the process environment or the repo `.env`.
 *
 * Same two-source precedence and the same invariant as
 * {@link loadOpenRouterKey}: the value is never logged and never appears in the
 * thrown message, which says only where to put the key.
 */
export function loadTripoKey(repoRoot?: string): string {
  const fromProcess = process.env["TRIPO_API_KEY"];
  if (fromProcess !== undefined && fromProcess.trim() !== "") return fromProcess.trim();

  const key = readDotEnv(repoRoot)["TRIPO_API_KEY"];
  if (key === undefined || key.trim() === "") {
    throw new Error(
      "@terrainist/agents: no TRIPO_API_KEY — add `TRIPO_API_KEY=tsk_...` to the repo-root .env or export it",
    );
  }
  return key.trim();
}

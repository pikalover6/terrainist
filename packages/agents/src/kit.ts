/**
 * The terrain-author spec kit, read from disk at call time.
 *
 * The kit is the system prompt. It lives in `docs/kits/terrain-author.md`
 * rather than in a string literal here so that a human editing the guidance
 * and the test that validates its examples (`packages/spec/test/kit.test.ts`)
 * are looking at exactly the same bytes the model will see.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { findRepoRoot } from "./env.js";

/** Path of the terrain-author kit, relative to the repo root. */
export const KIT_RELATIVE_PATH = path.join("docs", "kits", "terrain-author.md");

/** Read the terrain-author kit. */
export async function loadTerrainAuthorKit(repoRoot?: string): Promise<string> {
  const root = repoRoot ?? findRepoRoot();
  return await readFile(path.join(root, KIT_RELATIVE_PATH), "utf8");
}

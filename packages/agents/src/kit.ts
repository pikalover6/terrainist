/**
 * The spec kits, read from disk at call time.
 *
 * A kit is the system prompt. They live in `docs/kits/*.md` rather than in
 * string literals here so that a human editing the guidance and the test that
 * validates their examples (`packages/spec/test/kit.test.ts`) are looking at
 * exactly the same bytes the model will see.
 *
 * Two kits exist. `settlement-author.md` is the default: it is a superset of
 * the terrain kit — the same terrain vocabulary plus the plaza, buildings,
 * roads and constraints — and it says plainly that a terrain-only document is
 * the right answer when the prompt asks for no habitation. `terrain-author.md`
 * is kept for the terrain profile alone, and for comparing the two.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { findRepoRoot } from "./env.js";

/** Which kit (and therefore which profile) an authoring run uses. */
export type KitName = "terrain" | "settlement";

/** The default kit for `terrainist generate`. */
export const DEFAULT_KIT: KitName = "settlement";

/** Path of the terrain-author kit, relative to the repo root. */
export const KIT_RELATIVE_PATH = path.join("docs", "kits", "terrain-author.md");

/** Path of the settlement-author kit, relative to the repo root. */
export const SETTLEMENT_KIT_RELATIVE_PATH = path.join("docs", "kits", "settlement-author.md");

/** Repo-relative path of a kit by name. */
export function kitRelativePath(kit: KitName): string {
  return kit === "terrain" ? KIT_RELATIVE_PATH : SETTLEMENT_KIT_RELATIVE_PATH;
}

/** Read the terrain-author kit. */
export async function loadTerrainAuthorKit(repoRoot?: string): Promise<string> {
  return await loadAuthorKit("terrain", repoRoot);
}

/** Read the settlement-author kit. */
export async function loadSettlementAuthorKit(repoRoot?: string): Promise<string> {
  return await loadAuthorKit("settlement", repoRoot);
}

/** Read a kit by name. */
export async function loadAuthorKit(kit: KitName, repoRoot?: string): Promise<string> {
  const root = repoRoot ?? findRepoRoot();
  return await readFile(path.join(root, kitRelativePath(kit)), "utf8");
}

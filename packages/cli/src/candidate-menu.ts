/**
 * The candidate menu's **assembly point** — where the registries meet a run.
 *
 * The menu itself is built by `@terrainist/stdlib`
 * (`buildCandidateMenu`/`candidateMenuForIntent`, a pure view over the catalog
 * and the form packs) and injected by `@terrainist/agents`, which takes it as
 * an opaque string and does not know where it came from. That boundary is
 * deliberate — the agents package talks to the *spec*, not to the block
 * palettes — so the joining has to happen in the one package that already
 * depends on both, and this file is it.
 *
 * ## Why it is a flag, and why the flag is off
 *
 * Injecting the menu changes what the model is shown, and the model-behavior
 * audit exists precisely because nobody had measured what the model does with
 * what it is shown. A context change measured against a baseline that also
 * moved is not a measurement. So: **off by default**, and the off state is the
 * same code path a run with no classified intent takes — an empty menu is
 * injected as no message at all, which
 * `packages/agents/test/candidate-menu.test.ts` holds against the pre-feature
 * conversation byte for byte.
 *
 * Two ways to turn it on, because they answer different questions:
 *
 * - `TERRAINIST_CANDIDATE_MENU=1` in the environment — for a harness sweeping
 *   many prompts, where the flag is a property of the experiment rather than
 *   of any one command line;
 * - `--candidate-menu` / `--no-candidate-menu` on `terrainist generate` — for
 *   a human. The explicit flag wins over the environment in both directions,
 *   so `--no-candidate-menu` can carve one run out of a sweep.
 */

import { candidateMenuForIntent, type CandidateMenu } from "@terrainist/stdlib";
import type { SemanticIntent } from "@terrainist/spec";

/** The environment variable that turns the menu on for a whole sweep. */
export const CANDIDATE_MENU_ENV = "TERRAINIST_CANDIDATE_MENU";

/**
 * Whether the environment asks for the menu.
 *
 * Truthy is `1`, `true`, `yes`, `on`, case-insensitively; everything else —
 * including unset, empty and `0` — is off. Anything unrecognised reads as off
 * rather than as an error: this decides whether context is added, and a typo
 * in a variable must not stop a world being made.
 */
export function candidateMenuEnabledByEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const raw = (env[CANDIDATE_MENU_ENV] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * The flag's final answer for one run: the explicit option, or the environment.
 *
 * `option` is `undefined` when neither `--candidate-menu` nor
 * `--no-candidate-menu` was written, which is the only case the environment is
 * consulted in.
 */
export function candidateMenuEnabled(
  option: boolean | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return option ?? candidateMenuEnabledByEnv(env);
}

/**
 * Assemble the menu for a run, or return `undefined` for "inject nothing".
 *
 * Three ways to get `undefined`, and they are one path: the flag is off; the
 * pre-pass produced no intent (`--no-intent`, or a classifier that failed —
 * it fails open by design); or the intent named no pack and no resolvable era,
 * so the menu came back empty. A caller therefore never has to ask *why* there
 * is no menu before deciding what to send.
 */
export function assembleCandidateMenu(options: {
  readonly enabled: boolean;
  readonly intent?: SemanticIntent;
}): CandidateMenu | undefined {
  if (!options.enabled || options.intent === undefined) return undefined;
  const menu = candidateMenuForIntent(options.intent);
  return menu.entries.length === 0 ? undefined : menu;
}

/**
 * The status line, in the shape of the `intent` line it sits under.
 *
 * A run prints what it injected for the same reason the pre-pass prints what it
 * classified (ratified disposition 3): when a world comes out wrong, the
 * context it was authored from is the first thing worth reading, and a menu
 * that silently did not assemble is indistinguishable from one that did unless
 * the run says so.
 */
export function formatCandidateMenu(menu: CandidateMenu | undefined, enabled: boolean): string {
  // Off prints nothing at all, deliberately: the off state is the product as it
  // was, and that includes what the run says about itself.
  if (!enabled) return "";
  if (menu === undefined) return "menu       on, but nothing to show (no pack and no era in the intent)";
  const packs = menu.packs.length === 0 ? "no named pack" : menu.packs.join(", ");
  const era = menu.eraClass === undefined ? "no era" : menu.eraClass;
  return [
    `menu       ${menu.entries.length} ids, ~${menu.estimatedTokens} tokens  (${packs}; ${era})`,
    `           ${menu.ids.slice(0, 8).join(", ")}${menu.ids.length > 8 ? ", …" : ""}`,
  ].join("\n");
}

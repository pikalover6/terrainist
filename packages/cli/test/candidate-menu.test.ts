/**
 * The candidate menu's CLI half: the flag, the assembly, and the inspection
 * command.
 *
 * The flag is the whole point of these tests. A context change is only
 * measurable against a baseline that did not move, so "off" has to mean off in
 * every combination — unset environment, `0`, a typo, an explicit
 * `--no-candidate-menu` inside a sweep that set the variable — and "on with
 * nothing to say" has to be the same as off rather than an empty message.
 *
 * Nothing here calls a model or reads the network.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SemanticIntent } from "@terrainist/spec";

import {
  CANDIDATE_MENU_ENV,
  assembleCandidateMenu,
  candidateMenuEnabled,
  candidateMenuEnabledByEnv,
  formatCandidateMenu,
} from "../src/candidate-menu.js";
import { authorAndWriteDocument, parseGenerateArgs, type GenerateOptions } from "../src/generate.js";
import { runCatalog } from "../src/index.js";

const TROY: SemanticIntent = {
  era: "classical",
  character: { formPacks: ["classical_mediterranean"] },
};

describe("the candidate-menu flag", () => {
  it("is off unless the environment says a word that means yes", () => {
    for (const raw of ["1", "true", "TRUE", "yes", " on "]) {
      expect(candidateMenuEnabledByEnv({ [CANDIDATE_MENU_ENV]: raw }), raw).toBe(true);
    }
    for (const raw of ["0", "", "false", "no", "off", "maybe", "TERRAINIST"]) {
      expect(candidateMenuEnabledByEnv({ [CANDIDATE_MENU_ENV]: raw }), raw).toBe(false);
    }
    expect(candidateMenuEnabledByEnv({})).toBe(false);
  });

  it("lets the explicit option win over the environment, both ways", () => {
    const on = { [CANDIDATE_MENU_ENV]: "1" };
    const off = {};
    expect(candidateMenuEnabled(undefined, on)).toBe(true);
    expect(candidateMenuEnabled(false, on)).toBe(false); // carve one run out of a sweep
    expect(candidateMenuEnabled(true, off)).toBe(true);
    expect(candidateMenuEnabled(undefined, off)).toBe(false);
  });

  it("parses --candidate-menu and --no-candidate-menu, and neither by default", () => {
    expect(parseGenerateArgs(["troy"]).candidateMenu).toBeUndefined();
    expect(parseGenerateArgs(["troy", "--candidate-menu"]).candidateMenu).toBe(true);
    expect(parseGenerateArgs(["troy", "--no-candidate-menu"]).candidateMenu).toBe(false);
  });
});

describe("assembling a run's menu", () => {
  it("returns nothing at all when the flag is off, whatever the intent says", () => {
    expect(assembleCandidateMenu({ enabled: false, intent: TROY })).toBeUndefined();
  });

  it("returns nothing when there is no intent — the --no-intent path", () => {
    expect(assembleCandidateMenu({ enabled: true })).toBeUndefined();
  });

  it("returns nothing when the intent names no pack and no era", () => {
    expect(assembleCandidateMenu({ enabled: true, intent: { wealth: 0.5 } })).toBeUndefined();
    // An empty menu and an off flag are one path: neither injects a message.
    expect(assembleCandidateMenu({ enabled: true, intent: { era: "not_an_era" } })).toBeUndefined();
  });

  it("assembles the pack the intent named, whole", () => {
    const menu = assembleCandidateMenu({ enabled: true, intent: TROY });
    expect(menu?.ids).toContain("acropolis_terrace");
    expect(menu?.packs).toEqual(["classical_mediterranean"]);
    expect(menu?.eraClass).toBe("ancient");
    expect(menu?.text.length ?? 0).toBeGreaterThan(0);
  });
});

describe("what the run prints about itself", () => {
  it("says nothing when the menu is off — the log reads as it always did", () => {
    expect(formatCandidateMenu(undefined, false)).toBe("");
    const menu = assembleCandidateMenu({ enabled: true, intent: TROY });
    expect(formatCandidateMenu(menu, false)).toBe("");
  });

  it("distinguishes on-with-nothing from on-with-a-menu", () => {
    expect(formatCandidateMenu(undefined, true)).toContain("nothing to show");
    const line = formatCandidateMenu(assembleCandidateMenu({ enabled: true, intent: TROY }), true);
    expect(line).toContain("60 ids");
    expect(line).toContain("classical_mediterranean");
    expect(line).toContain("ancient");
  });
});

describe("terrainist catalog --menu", () => {
  /** Capture stdout for one call. */
  function captured(args: readonly string[]): { code: number; out: string } {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...parts: unknown[]): void => {
      lines.push(parts.map(String).join(" "));
    };
    try {
      return { code: runCatalog(args), out: lines.join("\n") };
    } finally {
      console.log = log;
    }
  }

  it("prints the bytes a run would inject, and says what they cost", () => {
    const { code, out } = captured(["--menu", "--era", "ancient", "--packs", "classical_mediterranean"]);
    expect(code).toBe(0);
    expect(out).toContain("CANDIDATE STRUCTURES");
    expect(out).toContain("acropolis_terrace");
    expect(out).toMatch(/60 ids, \d+ chars, ~\d+ tokens\./);
  });

  it("prints the same bytes the run would inject — not a second rendering", () => {
    const { out } = captured(["--menu", "--era", "classical", "--packs", "classical_mediterranean"]);
    const menu = assembleCandidateMenu({ enabled: true, intent: TROY });
    expect(out.startsWith(menu?.text ?? "")).toBe(true);
  });

  it("honours --max and --json", () => {
    const { out } = captured(["--menu", "--packs", "nautical_pirate", "--max", "3", "--json"]);
    const parsed = JSON.parse(out) as { entries: unknown[]; ids: string[] };
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.ids[0]).toBe("jolly_roger_mast");
  });

  it("explains the empty case rather than printing nothing", () => {
    const { code, out } = captured(["--menu"]);
    expect(code).toBe(0);
    expect(out).toContain("no candidates");
    expect(out).toContain("off state");
  });

  it("leaves the ordinary catalog table alone", () => {
    const { code, out } = captured(["--category", "residential"]);
    expect(code).toBe(0);
    expect(out).toContain("terrainist structure catalog");
    expect(out).toContain("residential");
    expect(out).not.toContain("CANDIDATE STRUCTURES");
  });

  it("still rejects an unknown option", () => {
    expect(() => runCatalog(["--nope"])).toThrow(/unexpected argument/);
    expect(() => runCatalog(["--era"])).toThrow(/--era requires a name/);
    expect(() => runCatalog(["--max", "x"])).toThrow(/--max requires a whole number/);
  });
});

/**
 * The prompt-identity gate at the `generate` level.
 *
 * `packages/agents/test/candidate-menu.test.ts` proves `authorLoamDoc` builds
 * the pre-feature array when it is handed no menu; this proves the command
 * hands it no menu. Together they are the claim the flag rests on: **off is
 * the product as it was**, not merely close to it.
 *
 * The model is stubbed and no world is compiled — this reads the request
 * bodies that would have gone to OpenRouter and nothing more.
 */
describe("generate's conversation, with the flag off", () => {
  let outDir = "";

  /** A minimal settlement document the validator accepts. */
  function stubDoc(): Record<string, unknown> {
    return {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "stub_town", worldSeed: 7, prompt: "troy" },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [128, 128] },
        children: [
          {
            id: "terrain",
            kind: "generator",
            generator: "terrain.heightfield@0",
            params: { baseHeight: 76, amplitude: 18 },
          },
          { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        ],
      },
    };
  }

  /** Stub `fetch`, recording every request body. */
  function stubModel(): Record<string, unknown>[] {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          model: "google/gemini-3.7-flash",
          choices: [
            { message: { role: "assistant", content: JSON.stringify(stubDoc()) }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    return bodies;
  }

  function options(overrides: Partial<GenerateOptions> = {}): GenerateOptions {
    return {
      prompt: "troy",
      size: 128,
      seed: "7",
      outDir,
      keepDoc: true,
      zip: false,
      allowUnstable: false,
      model: "google/gemini-3.7-flash",
      effort: "high",
      kit: "settlement",
      compileRounds: 0,
      intentPrepass: false,
      programs: false,
      bespokeBudget: 0,
      intent: TROY,
      ...overrides,
    };
  }

  /** The messages the authoring call actually sent. */
  async function sent(overrides: Partial<GenerateOptions> = {}): Promise<{ role: string; content: string }[]> {
    const bodies = stubModel();
    await authorAndWriteDocument(options(overrides));
    return (bodies[0]?.["messages"] ?? []) as { role: string; content: string }[];
  }

  beforeEach(async () => {
    outDir = await mkdtemp(path.join(tmpdir(), "terrainist-menu-"));
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv(CANDIDATE_MENU_ENV, "");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(outDir, { recursive: true, force: true });
  });

  it("sends the kit and the prompt, and nothing else", async () => {
    const messages = await sent();
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(messages[1]?.content).toContain("troy");
  });

  it("sends that same conversation when the flag is explicitly off", async () => {
    const off = await sent();
    const explicitly = await sent({ candidateMenu: false });
    expect(explicitly).toEqual(off);
  });

  it("ignores the environment when --no-candidate-menu carves a run out", async () => {
    const off = await sent();
    vi.stubEnv(CANDIDATE_MENU_ENV, "1");
    expect(await sent({ candidateMenu: false })).toEqual(off);
  });

  it("adds exactly one message when it is on, and changes no other", async () => {
    const off = await sent();
    const on = await sent({ candidateMenu: true });
    expect(on).toHaveLength(off.length + 1);
    expect(on[0]).toEqual(off[0]); // the kit, untouched
    expect(on[2]).toEqual(off[1]); // the prompt, untouched
    expect(on[1]?.role).toBe("system");
    expect(on[1]?.content).toBe(assembleCandidateMenu({ enabled: true, intent: TROY })?.text);
  });

  it("turns on from the environment alone, for a sweep", async () => {
    vi.stubEnv(CANDIDATE_MENU_ENV, "1");
    const messages = await sent();
    expect(messages).toHaveLength(3);
    expect(messages[1]?.content).toContain("acropolis_terrace");
  });

  it("injects nothing when there is no intent to condition on", async () => {
    const messages = await sent({ candidateMenu: true, intent: undefined });
    expect(messages).toHaveLength(2);
  });
});

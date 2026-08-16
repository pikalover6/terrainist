/**
 * Bespoke program authoring, against a stubbed fetch and a stubbed gate.
 *
 * What is checked: the budget arithmetic is the contract's; the repair loop
 * hands diagnostics back verbatim and stops at three rounds; a program that
 * never passes is dropped rather than shipped; requests are harvested from the
 * document; and the system prompt teaches the API and *nothing else* — the
 * ratified "the API is the determinism boundary, not a creative vocabulary"
 * rule, asserted rather than trusted to a reviewer.
 */

import { describe, expect, it } from "vitest";

import type { LoamDiagnostic } from "@terrainist/spec";

import {
  applyBudget,
  attachPrograms,
  authorProgram,
  authorPrograms,
  collectProgramRequests,
  extractProgramSource,
  formatProgramRun,
  hashSource,
  lintSourceLocally,
  MAX_PROGRAM_ROUNDS,
  parseEnvelope,
  PROGRAM_AUTHOR_PROMPT,
  programBudget,
  programUserPrompt,
  proposePrograms,
  repairPrompt,
  slugId,
  type ProgramRequest,
} from "../src/program-author.js";
import { stubProgramGate } from "../src/program-gate.js";

/** A stub `fetch` replying with `texts[i]` to the i-th call; last repeats. */
function stubFetch(texts: readonly string[]): {
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  bodies: Record<string, unknown>[];
} {
  const bodies: Record<string, unknown>[] = [];
  let call = 0;
  const fetchImpl = async (_input: string, init?: RequestInit): Promise<Response> => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const text = texts[Math.min(call, texts.length - 1)] ?? "";
    call++;
    return new Response(
      JSON.stringify({
        model: "google/gemini-3.7-flash",
        choices: [{ message: { content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.01 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { fetchImpl, bodies };
}

const SOURCE = `export const envelope = [12, 20, 12];
export default function build(api) {
  for (let y = 0; y < 20; y++) api.set(6, y, 6, "minecraft:stone_bricks");
  return { name: "spire", seatY: 0, anchors: { door: [6, 0, 5] } };
}`;

const REPLY = ["```js", SOURCE, "```"].join("\n");

const DIAG: LoamDiagnostic = {
  code: "E335",
  name: "DISCONNECTED_SOLID",
  severity: "error",
  nodePath: "programs.spire",
  message: "3 components remain after dropping islands under 12 voxels",
  fix: "Join the floating parts to the main body.",
};

const REQUEST: ProgramRequest = {
  id: "spire",
  mode: "landmark",
  brief: "a lone black spire",
  source: "caller",
};

const DOC_CONTEXT = { worldSeed: "7", size: 512, prompt: "an alien invasion" };

describe("programBudget", () => {
  it("is the contract's clamped area rule", () => {
    expect(programBudget(512)).toEqual({ landmarks: 3, plugins: 3 });
    // 3 × (1024² / 512²) = 12 landmarks, plugins clamped to 6.
    expect(programBudget(1024)).toEqual({ landmarks: 12, plugins: 6 });
    // Bigger still stays clamped at the ceilings.
    expect(programBudget(4096)).toEqual({ landmarks: 12, plugins: 6 });
    // A tiny world still gets the floor of three.
    expect(programBudget(64)).toEqual({ landmarks: 3, plugins: 3 });
    expect(programBudget(0)).toEqual({ landmarks: 3, plugins: 3 });
  });

  it("trims requests to the budget in order, keeping the earliest", () => {
    const many: ProgramRequest[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      mode: "landmark" as const,
      brief: "x",
      source: "proposal" as const,
    }));
    const { kept, overflow } = applyBudget(many, programBudget(512));
    expect(kept.map((k) => k.id)).toEqual(["p0", "p1", "p2"]);
    expect(overflow.map((k) => k.id)).toEqual(["p3", "p4"]);
  });

  it("counts landmark and plugin caps separately", () => {
    const mixed: ProgramRequest[] = [
      { id: "a", mode: "landmark", brief: "x", source: "caller" },
      { id: "b", mode: "plugin", brief: "x", source: "caller" },
      { id: "c", mode: "plugin", brief: "x", source: "caller" },
      { id: "d", mode: "plugin", brief: "x", source: "caller" },
      { id: "e", mode: "plugin", brief: "x", source: "caller" },
    ];
    const { kept, overflow } = applyBudget(mixed, programBudget(512));
    expect(kept.map((k) => k.id)).toEqual(["a", "b", "c", "d"]);
    expect(overflow.map((k) => k.id)).toEqual(["e"]);
  });
});

describe("PROGRAM_AUTHOR_PROMPT", () => {
  it("teaches every member of the API surface verbatim", () => {
    for (const member of ["set(x", "size", "instance", "random()", "heightAt(x", "log(msg"]) {
      expect(PROGRAM_AUTHOR_PROMPT).toContain(member);
    }
    for (const field of ["name", "seatY", "anchors"]) {
      expect(PROGRAM_AUTHOR_PROMPT).toContain(field);
    }
    expect(PROGRAM_AUTHOR_PROMPT).toContain("export const envelope");
    expect(PROGRAM_AUTHOR_PROMPT).toContain("export default function build(api)");
  });

  it("teaches the rules that make a program freezable", () => {
    expect(PROGRAM_AUTHOR_PROMPT).toContain("DETERMINISTIC");
    expect(PROGRAM_AUTHOR_PROMPT).toContain("ENVELOPE-CONFINED");
    expect(PROGRAM_AUTHOR_PROMPT).toContain("FULL BLOCK STRINGS");
    expect(PROGRAM_AUTHOR_PROMPT).toContain("y = 0 IS THE SEAT PLANE");
    expect(PROGRAM_AUTHOR_PROMPT).toContain("FUEL-BOUNDED");
    expect(PROGRAM_AUTHOR_PROMPT).toMatch(/Math\.random/);
  });

  it("distinguishes the two invocation modes and demands plugin variation", () => {
    expect(PROGRAM_AUTHOR_PROMPT).toContain("LANDMARK");
    expect(PROGRAM_AUTHOR_PROMPT).toContain("PLUGIN");
    expect(PROGRAM_AUTHOR_PROMPT).toContain("EVERY INSTANCE DIFFERS");
    expect(PROGRAM_AUTHOR_PROMPT).toContain("api.instance.index");
  });

  it("teaches NO shape library — the ratified rule", () => {
    const banned = ["api.box", "api.cylinder", "api.dome", "api.arch", "api.stairs", "hollow", "carve"];
    for (const token of banned) expect(PROGRAM_AUTHOR_PROMPT).not.toContain(token);
    // And it says so out loud, so the next editor knows the omission is a
    // decision rather than an oversight.
    expect(PROGRAM_AUTHOR_PROMPT).toContain("no shape library");
  });

  it("hands the program the world's palette, and tells it to use it", () => {
    // `"palette"` and `"materialTheme"` were on the banned list above until
    // 2026-08-11, when a walk of Troy found twenty-four bespoke hideouts in
    // four *invented* palettes standing in a sun-clay city. The ban was aimed
    // at a **style guide** — telling the model what its thing should look like
    // — and it swept up the one thing a program genuinely cannot compute: what
    // the world around it is made of. `api.theme` is a read, not a style guide,
    // and the prompt must teach it or `api.theme` reaches no program.
    expect(PROGRAM_AUTHOR_PROMPT).toContain("api.theme");
    expect(PROGRAM_AUTHOR_PROMPT).toContain("api.theme.stone.primary");
    // …and it is still not a style guide: nothing here says what to build.
    for (const token of ["api.box", "api.dome"]) {
      expect(PROGRAM_AUTHOR_PROMPT).not.toContain(token);
    }
  });
});

describe("source handling", () => {
  it("pulls the program out of a fenced reply", () => {
    expect(extractProgramSource(REPLY)).toBe(SOURCE);
    expect(extractProgramSource(`prose\n\`\`\`\n${SOURCE}\n\`\`\`\nmore`)).toBe(SOURCE);
    expect(extractProgramSource(SOURCE)).toBe(SOURCE);
  });

  it("reads the declared envelope", () => {
    expect(parseEnvelope(SOURCE)).toEqual([12, 20, 12]);
    expect(parseEnvelope("export const envelope = [0, 4, 4];")).toBeUndefined();
    expect(parseEnvelope("nothing here")).toBeUndefined();
  });

  it("hashes normalized source stably", () => {
    expect(hashSource(SOURCE)).toBe(hashSource(`${SOURCE}\n\n`));
    expect(hashSource(SOURCE)).toMatch(/^b3:[0-9a-f]{64}$/);
    expect(hashSource(SOURCE)).not.toBe(hashSource(`${SOURCE}\n// x`));
  });

  it("catches only what would waste a gate round", () => {
    expect(lintSourceLocally(SOURCE, REQUEST)).toEqual([]);
    expect(lintSourceLocally("", REQUEST).map((d) => d.name)).toEqual(["PROGRAM_EMPTY"]);
    expect(lintSourceLocally("export default function build(api) {}", REQUEST).map((d) => d.name)).toEqual([
      "PROGRAM_NO_ENVELOPE",
    ]);
    expect(lintSourceLocally("export const envelope = [4,4,4];", REQUEST).map((d) => d.name)).toEqual([
      "PROGRAM_NO_BUILD",
    ]);
  });

  it("slugs ids into map keys", () => {
    expect(slugId("Mothership Wreck!")).toBe("mothership_wreck");
    expect(slugId("   ")).toBe("program");
  });
});

describe("authorProgram", () => {
  it("freezes a program the gate accepts on the first round", async () => {
    const { fetchImpl, bodies } = stubFetch([REPLY]);
    const gate = stubProgramGate({ rounds: [[]], outputHash: "b3:beef" });
    const outcome = await authorProgram({
      request: REQUEST,
      docContext: DOC_CONTEXT,
      gate,
      apiKey: "test",
      fetchImpl,
    });
    expect(outcome.record.ok).toBe(true);
    expect(outcome.record.attempts).toBe(1);
    expect(outcome.entry?.envelope).toEqual([12, 20, 12]);
    expect(outcome.entry?.source).toBe(SOURCE);
    expect(outcome.entry?.sourceHash).toBe(hashSource(SOURCE));
    expect(outcome.entry?.outputHash).toBe("b3:beef");
    expect(bodies).toHaveLength(1);
    expect(gate.calls).toHaveLength(1);
  });

  it("accepts a program the gate only warns about, without a repair round", async () => {
    // Suspended gate checks (Kai, 2026-08-15) come back as warnings: recorded
    // on the record, never repaired, never a drop.
    const { fetchImpl, bodies } = stubFetch([REPLY]);
    const warn: LoamDiagnostic = { ...DIAG, severity: "warning" };
    const gate = stubProgramGate({ rounds: [[warn]], outputHash: "b3:beef" });
    const outcome = await authorProgram({
      request: REQUEST,
      docContext: DOC_CONTEXT,
      gate,
      apiKey: "test",
      fetchImpl,
    });
    expect(outcome.record.ok).toBe(true);
    expect(outcome.record.attempts).toBe(1);
    expect(outcome.record.warnings).toBe(1);
    expect(outcome.entry?.outputHash).toBe("b3:beef");
    expect(bodies).toHaveLength(1);
    expect(formatProgramRun({
      programs: {},
      records: [outcome.record],
      skipped: [],
      usage: outcome.record.usage,
      budget: { landmarks: 1, plugins: 1 },
      model: "test",
    })).toContain("1 warning(s)");
  });

  it("hands the gate's diagnostics back verbatim and accepts the repair", async () => {
    const { fetchImpl, bodies } = stubFetch([REPLY, REPLY]);
    const gate = stubProgramGate({ rounds: [[DIAG], []] });
    const outcome = await authorProgram({
      request: REQUEST,
      docContext: DOC_CONTEXT,
      gate,
      apiKey: "test",
      fetchImpl,
    });
    expect(outcome.record.ok).toBe(true);
    expect(outcome.record.attempts).toBe(2);
    expect(outcome.entry?.outputHash).toBeUndefined();

    const second = bodies[1] as { messages: { role: string; content: string }[] };
    const repair = second.messages[second.messages.length - 1]?.content ?? "";
    expect(repair).toContain(DIAG.message);
    expect(repair).toContain(DIAG.fix);
    expect(repair).toContain(DIAG.code);
    // The source that produced them rides along.
    expect(repair).toContain("api.set(6, y, 6");
  });

  it("drops a program that never passes, after exactly three rounds", async () => {
    const { fetchImpl, bodies } = stubFetch([REPLY]);
    const gate = stubProgramGate({ rounds: [[DIAG]] });
    const outcome = await authorProgram({
      request: REQUEST,
      docContext: DOC_CONTEXT,
      gate,
      apiKey: "test",
      fetchImpl,
    });
    expect(outcome.entry).toBeUndefined();
    expect(outcome.record.ok).toBe(false);
    expect(outcome.record.attempts).toBe(MAX_PROGRAM_ROUNDS);
    expect(bodies).toHaveLength(MAX_PROGRAM_ROUNDS);
    expect(outcome.record.diagnostics).toEqual([DIAG]);
    expect(outcome.record.note).toContain("E335");
  });

  it("never reaches the gate when the reply has no usable source", async () => {
    const { fetchImpl } = stubFetch(["sorry, I cannot"]);
    const gate = stubProgramGate({ rounds: [[]] });
    const outcome = await authorProgram({
      request: REQUEST,
      docContext: DOC_CONTEXT,
      gate,
      apiKey: "test",
      fetchImpl,
    });
    expect(outcome.entry).toBeUndefined();
    expect(gate.calls).toHaveLength(0);
  });

  it("tells a plugin program that every instance must differ", () => {
    const prompt = programUserPrompt(
      { ...REQUEST, mode: "plugin", count: 18 },
      DOC_CONTEXT,
      '{"era":"far_future"}',
    );
    expect(prompt).toContain("built 18 times");
    expect(prompt).toContain("every instance must differ");
    expect(prompt).toContain("far_future");
    expect(prompt).toContain("an alien invasion");
  });

  it("renders a repair turn with every diagnostic", () => {
    const text = repairPrompt([DIAG, { ...DIAG, code: "W331" }], SOURCE);
    expect(text).toContain("2 problem(s)");
    expect(text).toContain("W331");
  });
});

describe("authorPrograms", () => {
  it("harvests requests from the document and freezes what passes", async () => {
    const doc = {
      meta: { name: "beachhead" },
      root: {
        children: [
          {
            id: "dunes",
            intent: {
              character: {
                programs: [
                  { id: "Mothership Wreck", mode: "landmark", brief: "a broken hull", envelope: [64, 48, 64] },
                  { id: "drop_pod", mode: "plugin", brief: "a pod", count: 18 },
                ],
              },
            },
          },
        ],
      },
    };
    expect(collectProgramRequests(doc).map((r) => r.id)).toEqual(["mothership_wreck", "drop_pod"]);

    const { fetchImpl } = stubFetch([REPLY]);
    const result = await authorPrograms({
      prompt: "an alien invasion",
      worldSeed: "7",
      size: 512,
      gate: stubProgramGate({ rounds: [[]] }),
      doc,
      apiKey: "test",
      fetchImpl,
    });
    expect(Object.keys(result.programs)).toEqual(["mothership_wreck", "drop_pod"]);
    expect(result.programs["drop_pod"]?.mode).toBe("plugin");
    expect(result.records.every((r) => r.ok)).toBe(true);
    expect(result.budget).toEqual({ landmarks: 3, plugins: 3 });
    expect(result.usage.cost).toBeCloseTo(0.02, 6);
  });

  it("stops before a call once the spend stop is reached", async () => {
    const doc = {
      intent: {
        character: {
          programs: [
            { id: "one", mode: "landmark", brief: "a" },
            { id: "two", mode: "landmark", brief: "b" },
          ],
        },
      },
    };
    const { fetchImpl } = stubFetch([REPLY]);
    const result = await authorPrograms({
      prompt: "p",
      worldSeed: "1",
      size: 512,
      gate: stubProgramGate({ rounds: [[]] }),
      doc,
      apiKey: "test",
      fetchImpl,
      budgetUsd: 0.005,
    });
    expect(Object.keys(result.programs)).toEqual(["one"]);
    expect(result.skipped[0]?.id).toBe("two");
    expect(result.skipped[0]?.reason).toContain("spend stop");
  });

  it("drops the program, not the world, when its authoring call fails", async () => {
    // Regression for the 2026-08-04 drowned-god run: the provider returned a
    // 200 with no content while writing the second program and the whole
    // generate died — after the document had been authored and paid for. One
    // program failing is one landmark missing, not a world lost.
    const doc = {
      intent: {
        character: {
          programs: [
            { id: "one", mode: "landmark", brief: "a" },
            { id: "two", mode: "landmark", brief: "b" },
          ],
        },
      },
    };
    let call = 0;
    const fetchImpl = async (_input: string, _init?: RequestInit): Promise<Response> => {
      call++;
      // A 4xx is not retried, so the second program fails on its first call.
      if (call > 1) return new Response("out of credits", { status: 402, statusText: "Payment Required" });
      return new Response(
        JSON.stringify({
          model: "google/gemini-3.7-flash",
          choices: [{ message: { content: REPLY }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.01 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const result = await authorPrograms({
      prompt: "p",
      worldSeed: "1",
      size: 512,
      gate: stubProgramGate({ rounds: [[]] }),
      doc,
      apiKey: "test",
      fetchImpl,
    });
    expect(Object.keys(result.programs)).toEqual(["one"]);
    expect(result.skipped[0]?.id).toBe("two");
    expect(result.skipped[0]?.reason).toContain("authoring failed");
    expect(result.skipped[0]?.reason).toContain("402");
    // The failure is on the record too, so the run report shows what was lost.
    expect(result.records.map((r) => r.ok)).toEqual([true, false]);
  });

  it("asks the model what the world wants when nothing was requested", async () => {
    const proposal = JSON.stringify([
      { id: "ufo_lander", mode: "plugin", brief: "a saucer", envelope: [20, 10, 20], count: 24 },
    ]);
    const { fetchImpl, bodies } = stubFetch([proposal, REPLY]);
    const result = await authorPrograms({
      prompt: "an alien invasion",
      worldSeed: "7",
      size: 512,
      gate: stubProgramGate({ rounds: [[]] }),
      apiKey: "test",
      fetchImpl,
    });
    expect(Object.keys(result.programs)).toEqual(["ufo_lander"]);
    // The proposal turn is told the budget it must live inside.
    const first = bodies[0] as { messages: { content: string }[] };
    expect(first.messages[1]?.content).toContain("3 plugin program(s)");
  });

  it("proposes nothing when the reply is not JSON, and the world is fine", async () => {
    const { fetchImpl } = stubFetch(["no programs needed here"]);
    const proposal = await proposePrograms({
      prompt: "a quiet village",
      budget: programBudget(512),
      apiKey: "test",
      fetchImpl,
    });
    expect(proposal.requests).toEqual([]);
  });

  it("drops a failing program without stopping the run", async () => {
    const doc = { intent: { character: { programs: [{ id: "bad", mode: "landmark", brief: "b" }] } } };
    const { fetchImpl } = stubFetch([REPLY]);
    const result = await authorPrograms({
      prompt: "p",
      worldSeed: "1",
      size: 512,
      gate: stubProgramGate({ rounds: [[DIAG]] }),
      doc,
      apiKey: "test",
      fetchImpl,
    });
    expect(result.programs).toEqual({});
    expect(result.records[0]?.ok).toBe(false);
    expect(formatProgramRun(result)).toContain("drop");
  });
});

describe("attachPrograms", () => {
  it("adds the map without mutating the document", () => {
    const doc = { meta: { name: "w" } };
    const entry = {
      mode: "landmark" as const,
      envelope: [4, 4, 4] as const,
      sourceHash: "b3:a",
      source: SOURCE,
    };
    const next = attachPrograms(doc, { spire: entry });
    expect((next as { programs: unknown }).programs).toEqual({ spire: entry });
    expect(doc).toEqual({ meta: { name: "w" } });
  });

  it("returns the document untouched for an empty map", () => {
    const doc = { meta: { name: "w" } };
    expect(attachPrograms(doc, {})).toBe(doc);
  });
});

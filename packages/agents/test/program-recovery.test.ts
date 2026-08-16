/**
 * The other half of the invocation gap: a program the node tree calls for that
 * the document does not carry.
 *
 * The reference failure is production battery P5 — `sea_monster` failed program
 * authoring, the scatter node kept naming it, the compile shipped legally with
 * LOAM-W337 PROGRAM_DROPPED, and nothing retried. What is pinned here is the
 * retry *decision*: referenced-and-absent gets exactly one fresh authoring run,
 * absent-and-unreferenced gets nothing, and a second failure does not loop.
 *
 * No network, no key, no spend: a stubbed `fetch` and the stub gate.
 */

import { describe, expect, it } from "vitest";

import {
  findMissingPrograms,
  formatProgramRecovery,
  planProgramRecovery,
  recoverMissingPrograms,
} from "../src/program-recovery.js";
import type { AuthoredProgramEntry } from "../src/program-author.js";
import { stubProgramGate } from "../src/program-gate.js";

const SOURCE = `export const envelope = [12, 20, 12];
export default function build(api) {
  for (let y = 0; y < 20; y++) api.set(6, y, 6, "minecraft:stone_bricks");
  return { name: "beast", seatY: 0 };
}`;

const REPLY = ["```js", SOURCE, "```"].join("\n");

function entry(mode: AuthoredProgramEntry["mode"]): AuthoredProgramEntry {
  return {
    mode,
    envelope: [16, 16, 16],
    sourceHash: "b3:0123456789abcdef",
    source: SOURCE,
  };
}

/** A stub `fetch` replying with `texts[i]`; the last entry repeats. */
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

/** The P5 shape: a scatter node naming a program the map does not carry. */
function docReferencing(): Record<string, unknown> {
  return {
    loam: "0.1",
    meta: { name: "drowned_coast", worldSeed: 3 },
    root: {
      id: "world",
      kind: "composite",
      children: [
        {
          id: "monsters",
          kind: "generator",
          generator: "scatter.program@0",
          params: { program: "sea_monster", count: 5 },
          intent: {
            character: {
              programs: [{ id: "sea_monster", mode: "plugin", brief: "a drowned leviathan", count: 5 }],
            },
          },
        },
        { id: "the_lighthouse", kind: "generator", generator: "authored:lighthouse" },
      ],
    },
  };
}

const BASE = {
  prompt: "a drowned coast full of sea monsters",
  worldSeed: "3",
  size: 512,
  apiKey: "test-key",
};

describe("findMissingPrograms", () => {
  it("names every referenced id the map lacks, with the invoking mode", () => {
    const missing = findMissingPrograms(docReferencing(), {});
    expect(missing.map((m) => [m.id, m.mode])).toEqual([
      ["lighthouse", "landmark"],
      ["sea_monster", "plugin"],
    ]);
    // The document's own request is recovered, so the retry has the brief.
    expect(missing.find((m) => m.id === "sea_monster")?.brief).toBe("a drowned leviathan");
    expect(missing.find((m) => m.id === "sea_monster")?.count).toBe(5);
  });

  it("says nothing about programs the document already carries", () => {
    const missing = findMissingPrograms(docReferencing(), {
      sea_monster: entry("plugin"),
      lighthouse: entry("landmark"),
    });
    expect(missing).toEqual([]);
  });
});

describe("planProgramRecovery", () => {
  it("plans one retry per referenced-and-absent program", () => {
    const plan = planProgramRecovery(docReferencing(), { lighthouse: entry("landmark") });
    expect(plan.map((r) => r.id)).toEqual(["sea_monster"]);
    expect(plan[0]?.mode).toBe("plugin");
    expect(plan[0]?.brief).toBe("a drowned leviathan");
  });

  it("plans nothing for a program that is absent but unreferenced", () => {
    // No node names it: the world decided it did not want it. Not a gap.
    const doc = {
      loam: "0.1",
      root: {
        id: "world",
        kind: "composite",
        intent: { character: { programs: [{ id: "sea_monster", mode: "plugin", brief: "a leviathan" }] } },
        children: [{ id: "terrain", kind: "generator", generator: "terrain.heightfield@0" }],
      },
    };
    expect(planProgramRecovery(doc, {})).toEqual([]);
  });

  it("plans nothing for an id that already had its one retry", () => {
    const already = new Set(["sea_monster", "lighthouse"]);
    expect(planProgramRecovery(docReferencing(), {}, already)).toEqual([]);
  });
});

describe("recoverMissingPrograms", () => {
  it("re-authors exactly once and attaches what passes the gate", async () => {
    const { fetchImpl, bodies } = stubFetch([REPLY]);
    const gate = stubProgramGate();
    const result = await recoverMissingPrograms({
      ...BASE,
      doc: docReferencing(),
      programs: { lighthouse: entry("landmark") },
      gate,
      fetchImpl,
    });

    expect(result.attempted.map((r) => r.id)).toEqual(["sea_monster"]);
    expect(result.recovered).toEqual(["sea_monster"]);
    expect(result.stillMissing).toEqual([]);
    // One program, one clean gate pass: one model call, no proposal turn.
    expect(bodies).toHaveLength(1);
    expect(gate.calls).toHaveLength(1);
    expect((result.doc as { programs: Record<string, unknown> }).programs["sea_monster"]).toBeDefined();
    expect(result.programs["lighthouse"]).toBeDefined();
    expect(result.usage.totalTokens).toBe(15);
  });

  it("spends nothing when the absent program is unreferenced", async () => {
    const { fetchImpl, bodies } = stubFetch([REPLY]);
    const result = await recoverMissingPrograms({
      ...BASE,
      doc: {
        loam: "0.1",
        root: {
          id: "world",
          kind: "composite",
          intent: { character: { programs: [{ id: "ghost", mode: "landmark", brief: "unused" }] } },
        },
      },
      programs: {},
      gate: stubProgramGate(),
      fetchImpl,
    });
    expect(result.attempted).toEqual([]);
    expect(bodies).toHaveLength(0);
    expect(result.usage.totalTokens).toBe(0);
  });

  it("does not loop: a second failure leaves the program dropped", async () => {
    const diag = {
      code: "E335",
      name: "DISCONNECTED_SOLID",
      severity: "error" as const,
      nodePath: "programs.sea_monster",
      message: "3 components remain",
      fix: "Join the parts.",
    };
    const { fetchImpl, bodies } = stubFetch([REPLY]);
    const doc = docReferencing();
    const programs = { lighthouse: entry("landmark") };

    // First (and only) retry: the gate rejects every repair round.
    const first = await recoverMissingPrograms({
      ...BASE,
      doc,
      programs,
      gate: stubProgramGate({ rounds: [[diag]] }),
      fetchImpl,
    });
    expect(first.recovered).toEqual([]);
    expect(first.stillMissing).toEqual(["sea_monster"]);
    expect(first.doc).toBe(doc);
    expect(first.programs).toBe(programs);
    const spentOnce = bodies.length;
    expect(spentOnce).toBeGreaterThan(1); // the bounded repair rounds ran

    // The pipeline carries `attemptedIds` into the next pass; nothing re-runs.
    const second = await recoverMissingPrograms({
      ...BASE,
      doc: first.doc,
      programs: first.programs,
      gate: stubProgramGate({ rounds: [[diag]] }),
      alreadyAttempted: first.attemptedIds,
      fetchImpl,
    });
    expect(second.attempted).toEqual([]);
    expect(bodies).toHaveLength(spentOnce);
  });
});

describe("formatProgramRecovery", () => {
  it("prints the retry in the phase-report register, or nothing at all", async () => {
    const { fetchImpl } = stubFetch([REPLY]);
    const result = await recoverMissingPrograms({
      ...BASE,
      doc: docReferencing(),
      programs: { lighthouse: entry("landmark") },
      gate: stubProgramGate(),
      fetchImpl,
    });
    const text = formatProgramRecovery(result);
    expect(text).toContain("recovery   1 program(s)");
    expect(text).toContain("sea_monster [plugin]");
    expect(text).toContain("recovered on retry");

    expect(formatProgramRecovery({ ...result, attempted: [] })).toBe("");
  });
});

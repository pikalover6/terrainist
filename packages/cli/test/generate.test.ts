/**
 * Argument parsing and seed derivation for `terrainist generate`.
 *
 * Nothing here talks to OpenRouter; the authoring loop itself is covered by
 * `packages/agents/test/author.test.ts` against a stub fetch.
 */

import { describe, expect, it } from "vitest";

import { AUTHORING_MODEL_ID, AUTHORING_REASONING_EFFORT, AUTHORING_TEMPERATURE, MAX_COMPILE_ROUNDS } from "@terrainist/agents";

import { parseGenerateArgs, seedFromPrompt } from "../src/generate.js";

describe("parseGenerateArgs", () => {
  it("defaults everything but the prompt", () => {
    const options = parseGenerateArgs(["a volcanic island"]);
    expect(options).toMatchObject({
      prompt: "a volcanic island",
      size: 512,
      outDir: "out",
      keepDoc: false,
      zip: true,
      install: false,
      model: AUTHORING_MODEL_ID,
      effort: AUTHORING_REASONING_EFFORT,
      temperature: AUTHORING_TEMPERATURE,
      compileRounds: MAX_COMPILE_ROUNDS,
    });
    expect(options.compileRounds).toBe(0);
    expect(options.worldName).toBeUndefined();
    expect(options.savesDir).toBeUndefined();
    expect(options.seed).toBe(seedFromPrompt("a volcanic island"));
  });

  it("reads every flag", () => {
    const options = parseGenerateArgs([
      "fjords",
      "--size", "256",
      "--seed", "42",
      "--out", "tmp",
      "--name", "fjords_take_two",
      "--effort", "low",
      "--temperature", "0.4",
      "--model", "z-ai/glm-5.1",
      "--compile-rounds", "2",
      "--install",
      "--saves", "/tmp/saves",
      "--keep-doc",
      "--no-zip",
    ]);
    expect(options).toEqual({
      prompt: "fjords",
      size: 256,
      seed: "42",
      outDir: "tmp",
      worldName: "fjords_take_two",
      keepDoc: true,
      zip: false,
      install: true,
      savesDir: "/tmp/saves",
      model: "z-ai/glm-5.1",
      effort: "low",
      temperature: 0.4,
      compileRounds: 2,
    });
  });

  it("rejects a missing prompt", () => {
    expect(() => parseGenerateArgs([])).toThrow(/requires a prompt/);
    expect(() => parseGenerateArgs(["--size", "256"])).toThrow(/requires a prompt/);
  });

  it("rejects bad values with the rule that was broken", () => {
    expect(() => parseGenerateArgs(["x", "--size", "7"])).toThrow(/16\.\.4096/);
    expect(() => parseGenerateArgs(["x", "--seed", "abc"])).toThrow(/decimal integer/);
    expect(() => parseGenerateArgs(["x", "--effort", "very high"])).toThrow(/one word/);
    expect(parseGenerateArgs(["x", "--effort", "xhigh"]).effort).toBe("xhigh");
    expect(() => parseGenerateArgs(["x", "--temperature", "3"])).toThrow(/0\.\.2/);
    expect(() => parseGenerateArgs(["x", "--compile-rounds", "9"])).toThrow(/0\.\.5/);
    expect(() => parseGenerateArgs(["x", "--saves", "s"])).toThrow(/--install/);
    expect(() => parseGenerateArgs(["x", "--size"])).toThrow(/requires/);
    expect(() => parseGenerateArgs(["x", "--nope"])).toThrow(/unknown option/);
    expect(() => parseGenerateArgs(["x", "y"])).toThrow(/unexpected argument/);
  });

  it("does not know the experiment flags any more", () => {
    for (const flag of ["--no-intent", "--no-programs", "--suffix", "--allow-unstable", "--candidate-menu", "--no-report"]) {
      expect(() => parseGenerateArgs(["x", flag, "v"]), flag).toThrow(/unknown option/);
    }
  });
});

describe("seedFromPrompt", () => {
  it("is deterministic and prompt-dependent", () => {
    expect(seedFromPrompt("a volcanic island")).toBe(seedFromPrompt("a volcanic island"));
    expect(seedFromPrompt("a volcanic island")).not.toBe(seedFromPrompt("misty fjords"));
    expect(seedFromPrompt("misty fjords")).toMatch(/^\d+$/);
  });
});

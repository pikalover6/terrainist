/**
 * Argument parsing and seed derivation for `terrainist generate`.
 *
 * Nothing here talks to OpenRouter; the authoring loop itself is covered by
 * `packages/agents/test/author.test.ts` against a stub fetch.
 */

import { describe, expect, it } from "vitest";

import { parseGenerateArgs, seedFromPrompt } from "../src/generate.js";

describe("parseGenerateArgs", () => {
  it("defaults size, out and seed", () => {
    const options = parseGenerateArgs(["a volcanic island"]);
    expect(options.prompt).toBe("a volcanic island");
    expect(options.size).toBe(512);
    expect(options.outDir).toBe("out");
    expect(options.keepDoc).toBe(false);
    expect(options.zip).toBe(true);
    expect(options.seed).toBe(seedFromPrompt("a volcanic island"));
  });

  it("reads every flag", () => {
    const options = parseGenerateArgs([
      "fjords",
      "--size",
      "256",
      "--seed",
      "42",
      "--out",
      "tmp",
      "--keep-doc",
      "--no-zip",
      "--allow-unstable",
      "--model",
      "z-ai/glm-5.1",
    ]);
    expect(options).toMatchObject({
      prompt: "fjords",
      size: 256,
      seed: "42",
      outDir: "tmp",
      keepDoc: true,
      zip: false,
      allowUnstable: true,
      model: "z-ai/glm-5.1",
    });
  });

  it("rejects a missing prompt", () => {
    expect(() => parseGenerateArgs([])).toThrow(/requires a prompt/);
    expect(() => parseGenerateArgs(["--size", "256"])).toThrow(/requires a prompt/);
  });

  it("rejects bad values", () => {
    expect(() => parseGenerateArgs(["x", "--size", "7"])).toThrow(/16\.\.4096/);
    expect(() => parseGenerateArgs(["x", "--seed", "abc"])).toThrow(/decimal integer/);
    expect(() => parseGenerateArgs(["x", "--size"])).toThrow(/requires a value/);
    expect(() => parseGenerateArgs(["x", "--nope"])).toThrow(/unknown option/);
    expect(() => parseGenerateArgs(["x", "y"])).toThrow(/unexpected argument/);
  });
});

describe("seedFromPrompt", () => {
  it("is deterministic and prompt-dependent", () => {
    expect(seedFromPrompt("a volcanic island")).toBe(seedFromPrompt("a volcanic island"));
    expect(seedFromPrompt("a volcanic island")).not.toBe(seedFromPrompt("misty fjords"));
    expect(seedFromPrompt("misty fjords")).toMatch(/^\d+$/);
  });
});

describe("--intent / --no-intent", () => {
  it("runs the intent pre-pass by default", () => {
    expect(parseGenerateArgs(["a village"]).intentPrepass).toBe(true);
    expect(parseGenerateArgs(["a village"]).intent).toBeUndefined();
  });

  it("--no-intent turns the pre-pass off", () => {
    expect(parseGenerateArgs(["a village", "--no-intent"]).intentPrepass).toBe(false);
  });

  it("--intent takes a validated JSON object", () => {
    const options = parseGenerateArgs([
      "a village",
      "--intent",
      '{"era":"medieval","wealth":0.2}',
    ]);
    expect(options.intent).toEqual({ era: "medieval", wealth: 0.2 });
  });

  it("rejects an --intent that is not JSON, and one that is not a valid intent", () => {
    expect(() => parseGenerateArgs(["v", "--intent", "{oops"])).toThrow(/JSON object/);
    expect(() => parseGenerateArgs(["v", "--intent", '{"wealth":9}'])).toThrow(/not a valid intent/);
  });
});

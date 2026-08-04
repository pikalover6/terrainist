/**
 * The bespoke-program CLI surface: `--no-programs`, `--bespoke-budget`, and
 * the kit section that teaches the authoring model to ask for one.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_BESPOKE_BUDGET_USD } from "@terrainist/agents";

import { parseGenerateArgs } from "../src/generate.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("parseGenerateArgs — programs", () => {
  it("authors bespoke programs by default, inside the default spend stop", () => {
    const options = parseGenerateArgs(["an alien invasion"]);
    expect(options.programs).toBe(true);
    expect(options.bespokeBudget).toBe(DEFAULT_BESPOKE_BUDGET_USD);
  });

  it("--no-programs turns the pass off", () => {
    expect(parseGenerateArgs(["p", "--no-programs"]).programs).toBe(false);
  });

  it("--bespoke-budget sets the spend stop", () => {
    expect(parseGenerateArgs(["p", "--bespoke-budget", "1.25"]).bespokeBudget).toBe(1.25);
    expect(parseGenerateArgs(["p", "--bespoke-budget", "0"]).bespokeBudget).toBe(0);
  });

  it("rejects a spend stop that is not a non-negative number", () => {
    expect(() => parseGenerateArgs(["p", "--bespoke-budget", "-1"])).toThrow(/non-negative/);
    expect(() => parseGenerateArgs(["p", "--bespoke-budget", "lots"])).toThrow(/non-negative/);
    expect(() => parseGenerateArgs(["p", "--bespoke-budget"])).toThrow(/requires a value/);
  });
});

describe("the settlement kit's program section", () => {
  it("teaches the request shape, the budget and the anchors", async () => {
    const kit = await readFile(path.join(REPO_ROOT, "docs/kits/settlement-author.md"), "utf8");
    expect(kit).toContain("character.programs");
    expect(kit).toContain('"mode": "landmark"');
    expect(kit).toContain('"mode": "plugin"');
    expect(kit).toContain("authored:mothership_wreck");
    expect(kit).toContain("clamp(round(3 × A / 512²), 3, 12)");
    // The two things an author most needs to be told: don't ask for what the
    // kit already builds, and anchors are what roads reach.
    expect(kit).toMatch(/Do \*\*not\*\* ask for one/);
    expect(kit).toContain("anchors");
  });

  it("teaches plugin invocation and demands the invoking node in the same document", async () => {
    const kit = await readFile(path.join(REPO_ROOT, "docs/kits/settlement-author.md"), "utf8");
    expect(kit).toContain("scatter.program@0");
    expect(kit).toContain('"program": "drop_pod"');
    // The front door for the invocation gap: a request is a promise to invoke.
    expect(kit).toMatch(/If you request a program, author the node that invokes it/);
    expect(kit).toContain("prop.place@0` placeholder");
  });
});

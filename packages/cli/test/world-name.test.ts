import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dateStamp, resolveWorldName } from "../src/world-name.js";

function scratchOut(): string {
  return mkdtempSync(path.join(tmpdir(), "world-name-"));
}

const NOON = new Date(2026, 7, 28, 12, 0, 0);

describe("dateStamp", () => {
  it("zero-pads month and day", () => {
    expect(dateStamp(new Date(2026, 0, 3))).toBe("0103");
    expect(dateStamp(NOON)).toBe("0828");
  });
});

describe("resolveWorldName", () => {
  it("auto-names base_MMDD", async () => {
    const out = scratchOut();
    const resolved = await resolveWorldName({ base: "troy", outDir: out, now: NOON });
    expect(resolved).toEqual({ name: "troy_0828", stamp: "0828" });
  });

  it("rides the suffix after the stamp", async () => {
    const out = scratchOut();
    const resolved = await resolveWorldName({ base: "troy", outDir: out, suffix: "foofixtest", now: NOON });
    expect(resolved.name).toBe("troy_0828-foofixtest");
  });

  it("counts -2, then -3, past names the output directory already holds", async () => {
    const out = scratchOut();
    mkdirSync(path.join(out, "troy_0828"));
    expect((await resolveWorldName({ base: "troy", outDir: out, now: NOON })).name).toBe("troy_0828-2");
    mkdirSync(path.join(out, "troy_0828-2"));
    expect((await resolveWorldName({ base: "troy", outDir: out, now: NOON })).name).toBe("troy_0828-3");
  });

  it("--name overrides wholesale and refuses a clobber", async () => {
    const out = scratchOut();
    const named = await resolveWorldName({ base: "troy", outDir: out, name: "troy_exp1", now: NOON });
    expect(named).toEqual({ name: "troy_exp1", stamp: "" });
    mkdirSync(path.join(out, "taken"));
    await expect(resolveWorldName({ base: "troy", outDir: out, name: "taken", now: NOON })).rejects.toThrow(/already exists/);
  });

  it("refuses unusable names and empty suffixes", async () => {
    const out = scratchOut();
    await expect(resolveWorldName({ base: "troy", outDir: out, name: "..", now: NOON })).rejects.toThrow(/--name/);
    await expect(resolveWorldName({ base: "troy", outDir: out, suffix: "  ", now: NOON })).rejects.toThrow(/--suffix/);
    await expect(resolveWorldName({ base: "", outDir: out, now: NOON })).rejects.toThrow(/--name/);
  });

  it("sanitizes characters a folder cannot carry", async () => {
    const out = scratchOut();
    const resolved = await resolveWorldName({ base: "a b/c", outDir: out, suffix: "x y", now: NOON });
    expect(resolved.name).toBe("a-b-c_0828-x-y");
  });
});

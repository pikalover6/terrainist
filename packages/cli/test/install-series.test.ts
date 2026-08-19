/**
 * Series naming: parsing `<slug>_v<N>` back out of a folder name, and picking
 * the next free version. Pure string work, but it is the thing standing
 * between the battery and two worlds fighting over one folder, so it gets the
 * awkward cases spelled out.
 */

import { describe, expect, it } from "vitest";

import { nextSeriesVersion, parseSeriesVersion, seriesFolderName } from "../src/install.js";

describe("parseSeriesVersion", () => {
  it("reads the version out of an exact series name", () => {
    expect(parseSeriesVersion("troy_v1", "troy")).toBe(1);
    expect(parseSeriesVersion("troy_v13", "troy")).toBe(13);
  });

  it("ignores folders belonging to another slug", () => {
    expect(parseSeriesVersion("glowcap_vale_v2", "troy")).toBeUndefined();
    expect(parseSeriesVersion("troylike_v2", "troy")).toBeUndefined();
  });

  it("ignores the collision suffix, so -2 never reads as a version", () => {
    expect(parseSeriesVersion("troy_v3-2", "troy")).toBeUndefined();
  });

  it("rejects non-canonical numbers", () => {
    expect(parseSeriesVersion("troy_v03", "troy")).toBeUndefined();
    expect(parseSeriesVersion("troy_v0", "troy")).toBeUndefined();
    expect(parseSeriesVersion("troy_vx", "troy")).toBeUndefined();
    expect(parseSeriesVersion("troy_v", "troy")).toBeUndefined();
  });

  it("does not confuse a slug that is a prefix of another", () => {
    expect(parseSeriesVersion("troy_horse_v1", "troy")).toBeUndefined();
  });
});

describe("nextSeriesVersion", () => {
  it("starts at 1 in an empty saves folder", () => {
    expect(nextSeriesVersion([], "troy")).toBe(1);
    expect(nextSeriesVersion(["dev_world", "terrarium"], "troy")).toBe(1);
  });

  it("continues past the highest existing version", () => {
    expect(nextSeriesVersion(["troy_v1", "troy_v2", "troy_v3"], "troy")).toBe(4);
  });

  it("is insensitive to listing order", () => {
    expect(nextSeriesVersion(["troy_v3", "troy_v1", "troy_v2"], "troy")).toBe(4);
  });

  it("never reuses a number after a deletion leaves a gap", () => {
    expect(nextSeriesVersion(["troy_v1", "troy_v3"], "troy")).toBe(4);
  });

  it("counts only its own slug", () => {
    expect(nextSeriesVersion(["troy_v9", "glowcap_vale_v2"], "glowcap_vale")).toBe(3);
  });

  it("passes double digits without lexical confusion", () => {
    expect(nextSeriesVersion(["troy_v9", "troy_v10"], "troy")).toBe(11);
  });
});

describe("seriesFolderName", () => {
  it("builds a name parseSeriesVersion reads back", () => {
    const name = seriesFolderName("pirates_v_unicorns", 16);
    expect(name).toBe("pirates_v_unicorns_v16");
    expect(parseSeriesVersion(name, "pirates_v_unicorns")).toBe(16);
  });
});

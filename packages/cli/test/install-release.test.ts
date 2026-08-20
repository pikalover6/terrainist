/**
 * Release (build-cohort) naming: `<slug>_r<N>`.
 *
 * The per-slug `_v<N>` counter numbered every prompt independently, so one
 * compiler build shipped as `alien_farm_v5` and `pirates_v_unicorns_v17` — two
 * names with nothing in them to say they were siblings. A release number is a
 * fact about the *build*, shared across prompts, which puts two demands on this
 * code that the version counter never had: the number comes from outside (the
 * deck assigns it, nothing here counts), and a collision is an error rather
 * than a bump, because auto-incrementing past one is how the old scheme came
 * apart.
 *
 * As with the rest of the install tests, everything runs against a temp
 * `--saves` directory; the real saves folder is never touched.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { emitWorld, loadSpikeDocument, readGzippedNbt } from "@terrainist/compiler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  installWorld,
  parseReleaseNumber,
  parseSeriesVersion,
  releaseFolderName,
} from "../src/install.js";

const SPEC_PATH = fileURLToPath(new URL("../../../examples/pyramid.spike.json", import.meta.url));

const scratch: string[] = [];
let sourceWorld: string;

async function scratchDir(label: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  return dir;
}

async function levelName(worldDir: string): Promise<unknown> {
  const raw = await readFile(path.join(worldDir, "level.dat"));
  const parsed = readGzippedNbt(raw) as { Data: Record<string, unknown> };
  return parsed.Data["LevelName"];
}

beforeAll(async () => {
  const dir = await scratchDir("release-src");
  const doc = await loadSpikeDocument(SPEC_PATH);
  const summary = await emitWorld(doc, path.join(dir, doc.name));
  sourceWorld = summary.worldDir;
});

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

describe("releaseFolderName", () => {
  it("spells a cohort name with r, not v", () => {
    expect(releaseFolderName("troy", 16)).toBe("troy_r16");
    expect(releaseFolderName("pirates_v_unicorns", 16)).toBe("pirates_v_unicorns_r16");
  });

  it("gives one release number the same suffix across every prompt", () => {
    const slugs = ["troy", "hellenist_city", "pirates_v_unicorns"];
    expect(slugs.map((slug) => releaseFolderName(slug, 21))).toEqual([
      "troy_r21",
      "hellenist_city_r21",
      "pirates_v_unicorns_r21",
    ]);
  });
});

describe("parseReleaseNumber", () => {
  it("reads the release out of an exact cohort name", () => {
    expect(parseReleaseNumber("troy_r1", "troy")).toBe(1);
    expect(parseReleaseNumber("troy_r21", "troy")).toBe(21);
  });

  it("ignores folders belonging to another slug", () => {
    expect(parseReleaseNumber("glowcap_vale_r5", "troy")).toBeUndefined();
    expect(parseReleaseNumber("troylike_r5", "troy")).toBeUndefined();
  });

  it("does not read a version name as a release", () => {
    expect(parseReleaseNumber("troy_v13", "troy")).toBeUndefined();
    expect(parseSeriesVersion("troy_r13", "troy")).toBeUndefined();
  });

  it("rejects non-canonical numbers and collision suffixes", () => {
    expect(parseReleaseNumber("troy_r16-2", "troy")).toBeUndefined();
    expect(parseReleaseNumber("troy_r05", "troy")).toBeUndefined();
    expect(parseReleaseNumber("troy_r0", "troy")).toBeUndefined();
    expect(parseReleaseNumber("troy_r", "troy")).toBeUndefined();
  });
});

describe("installWorld with --release", () => {
  it("installs under the cohort name and rewrites the in-game name to match", async () => {
    const saves = await scratchDir("release-saves");
    const result = await installWorld({
      worldDir: sourceWorld,
      savesDir: saves,
      series: "troy",
      release: 21,
      now: 1_700_000_000_000,
    });

    expect(result.folderName).toBe("troy_r21");
    expect(result.release).toBe(21);
    expect(result.seriesVersion).toBeUndefined();
    expect(await levelName(result.installedPath)).toBe("troy_r21");
  });

  it("gives sibling prompts of one deck the same number in one saves folder", async () => {
    const saves = await scratchDir("release-siblings");
    const names: string[] = [];
    for (const slug of ["troy", "hellenist_city", "pirates_v_unicorns"]) {
      const result = await installWorld({
        worldDir: sourceWorld,
        savesDir: saves,
        series: slug,
        release: 21,
        now: 1_700_000_000_000,
      });
      names.push(result.folderName);
    }
    expect(names).toEqual(["troy_r21", "hellenist_city_r21", "pirates_v_unicorns_r21"]);
  });

  it("does not renumber around gaps — the deck's number is used as given", async () => {
    const saves = await scratchDir("release-gap");
    await mkdir(path.join(saves, "troy_r5"), { recursive: true });
    await mkdir(path.join(saves, "troy_r13"), { recursive: true });

    const result = await installWorld({
      worldDir: sourceWorld,
      savesDir: saves,
      series: "troy",
      release: 9,
      now: 1_700_000_000_000,
    });
    expect(result.folderName).toBe("troy_r9");
  });

  it("errors on a taken cohort name instead of suffixing it", async () => {
    const saves = await scratchDir("release-collision");
    await mkdir(path.join(saves, "troy_r16"), { recursive: true });
    await writeFile(path.join(saves, "troy_r16", "level.dat"), "not really");

    await expect(
      installWorld({ worldDir: sourceWorld, savesDir: saves, series: "troy", release: 16 }),
    ).rejects.toThrow(/troy_r16 already exists/);
  });

  it("refuses a release without a series — a cohort number needs a prompt", async () => {
    const saves = await scratchDir("release-noslug");
    await expect(installWorld({ worldDir: sourceWorld, savesDir: saves, release: 4 })).rejects.toThrow(
      /pass --series too/,
    );
  });

  it("refuses a release number that is not a positive integer", async () => {
    const saves = await scratchDir("release-bad");
    for (const release of [0, -3, 2.5]) {
      await expect(
        installWorld({ worldDir: sourceWorld, savesDir: saves, series: "troy", release }),
      ).rejects.toThrow(/positive integer/);
    }
  });

  it("still refuses to replace: a release names a build, it does not overwrite one", async () => {
    const saves = await scratchDir("release-replace");
    await expect(
      installWorld({
        worldDir: sourceWorld,
        savesDir: saves,
        series: "troy",
        release: 21,
        replace: true,
      }),
    ).rejects.toThrow(/never replaces/);
  });
});

describe("the discouraged fallback", () => {
  it("still auto-increments per slug when no release is given", async () => {
    const saves = await scratchDir("release-fallback");
    await mkdir(path.join(saves, "troy_v13"), { recursive: true });

    const result = await installWorld({
      worldDir: sourceWorld,
      savesDir: saves,
      series: "troy",
      now: 1_700_000_000_000,
    });
    expect(result.folderName).toBe("troy_v14");
    expect(result.seriesVersion).toBe(14);
    expect(result.release).toBeUndefined();
  });

  it("counts only v-names, so cohort folders never shift the old counter", async () => {
    const saves = await scratchDir("release-mixed");
    await mkdir(path.join(saves, "troy_v2"), { recursive: true });
    await mkdir(path.join(saves, "troy_r21"), { recursive: true });

    const result = await installWorld({
      worldDir: sourceWorld,
      savesDir: saves,
      series: "troy",
      now: 1_700_000_000_000,
    });
    expect(result.folderName).toBe("troy_v3");
  });
});

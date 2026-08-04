/**
 * `persistGenerateArtifacts` — the two files a post-mortem needs on disk next
 * to the world folder: the final document and the compile report.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { persistGenerateArtifacts } from "../src/generate.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "terrainist-artifacts-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const doc = { meta: { name: "alpine_river_valley" }, nodes: [{ kind: "terrain" }] };
const report = {
  name: "alpine_river_valley",
  worldSeed: "42",
  timings: { compile: 12.5 },
  diagnostics: [],
};

describe("persistGenerateArtifacts", () => {
  it("writes both files under the out directory, pretty-printed", async () => {
    const out = path.join(dir, "out");
    const paths = await persistGenerateArtifacts(out, "alpine_river_valley", doc, report);

    expect(paths.docPath).toBe(path.join(out, "alpine_river_valley.loam.json"));
    expect(paths.reportPath).toBe(path.join(out, "alpine_river_valley.report.json"));

    const docText = await readFile(paths.docPath, "utf8");
    const reportText = await readFile(paths.reportPath, "utf8");
    expect(docText.endsWith("\n")).toBe(true);
    expect(reportText.endsWith("\n")).toBe(true);
    expect(docText).toContain('\n  "meta": {');
    expect(JSON.parse(docText)).toEqual(doc);
    expect(JSON.parse(reportText)).toEqual(report);
  });

  it("keeps a programs map in the document", async () => {
    const withPrograms = {
      ...doc,
      programs: { spire: { source: "fn main() {}", sourceHash: "ab", outputHash: "cd" } },
    };
    const paths = await persistGenerateArtifacts(dir, "w", withPrograms, report);
    expect(JSON.parse(await readFile(paths.docPath, "utf8"))).toEqual(withPrograms);
  });

  it("is byte-identical across runs with identical inputs", async () => {
    const a = await persistGenerateArtifacts(path.join(dir, "a"), "w", doc, report);
    const b = await persistGenerateArtifacts(path.join(dir, "b"), "w", doc, report);
    expect(await readFile(a.reportPath, "utf8")).toBe(await readFile(b.reportPath, "utf8"));
    expect(await readFile(a.docPath, "utf8")).toBe(await readFile(b.docPath, "utf8"));
  });

  it("coerces bigints and non-finite numbers instead of throwing", async () => {
    const odd = { count: 9007199254740993n, ratio: Number.POSITIVE_INFINITY, nan: Number.NaN };
    const paths = await persistGenerateArtifacts(dir, "w", doc, odd);
    expect(JSON.parse(await readFile(paths.reportPath, "utf8"))).toEqual({
      count: "9007199254740993",
      ratio: "Infinity",
      nan: "NaN",
    });
  });

  it("creates the out directory when it does not exist", async () => {
    const nested = path.join(dir, "deep", "deeper");
    const paths = await persistGenerateArtifacts(nested, "w", doc, report);
    expect(JSON.parse(await readFile(paths.docPath, "utf8"))).toEqual(doc);
  });
});

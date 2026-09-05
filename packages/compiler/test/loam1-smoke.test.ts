/**
 * The deterministic smoke: the three Loam 1 worlds compile, clean, twice.
 *
 * `fixtures/loam1/` holds the three documents the language was proved on —
 * the Himalayan monastery spur, the red-rock gulch and the drowned Atlantean
 * city — as the lowered documents that made the walked worlds (`*.ir.json`),
 * plus the Loam 1 documents for the two whose model source survived. No model
 * is called: the bespoke programs are frozen in the documents.
 *
 * What is asserted: each world compiles with zero errors and no fluid that
 * would flow on the first tick (Atlantis is the water rule's acceptance:
 * it needed `--allow-unstable` before the rule), the Loam 1 documents lower
 * and compile through the same path `terrainist compile` uses, and compiling
 * a document twice writes byte-identical region files.
 */

import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { lowerLoam, validateLoam } from "@terrainist/spec";
import { PROP_NAMES } from "@terrainist/stdlib";

import { compileTerrain, type TerrainCompileReport } from "../src/index.js";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/loam1");
const REGISTRIES = { props: new Set(PROP_NAMES) };
const scratch: string[] = [];

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

async function loamFixture(name: string): Promise<unknown> {
  const loam = JSON.parse(await readFile(path.join(FIXTURES, `${name}.loam.json`), "utf8")) as Record<string, unknown>;
  const validation = validateLoam(loam, REGISTRIES);
  expect(validation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return lowerLoam(loam, REGISTRIES);
}

async function irFixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(FIXTURES, `${name}.ir.json`), "utf8")) as unknown;
}

async function compileOnce(doc: unknown, label: string): Promise<{ report: TerrainCompileReport; regionSha: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-smoke-${label}-`));
  scratch.push(dir);
  const result = await compileTerrain(doc, { outDir: path.join(dir, "world"), allowUnstable: false });
  if (!result.ok) {
    throw new Error(`${label} did not compile:\n${result.diagnostics.map((d) => `${d.code} ${d.message}`).join("\n")}`);
  }
  const regionDir = path.join(dir, "world", "region");
  const hash = createHash("sha256");
  for (const file of (await readdir(regionDir)).sort()) {
    hash.update(file);
    hash.update(await readFile(path.join(regionDir, file)));
  }
  return { report: result.report, regionSha: hash.digest("hex") };
}

function expectClean(report: TerrainCompileReport): void {
  expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  expect(report.stats.unstableFluidBlocks).toBe(0);
  expect(report.emit.blockCount).toBeGreaterThan(0);
}

describe("the three Loam 1 worlds", () => {
  it("the drowned Atlantean city compiles with no unstable fluid and no waiver", async () => {
    const doc = await irFixture("drowned_atlantean_city");
    const a = await compileOnce(doc, "atlantis-a");
    expectClean(a.report);
    const b = await compileOnce(doc, "atlantis-b");
    expect(b.regionSha).toBe(a.regionSha);
    expect(b.report.emit.blockCount).toBe(a.report.emit.blockCount);
  }, 1_200_000);

  it("the red-rock gulch compiles from its Loam 1 document, and lowers to the walked world", async () => {
    const lowered = await loamFixture("red_rock_gulch");
    const walked = await irFixture("red_rock_gulch");
    expect(lowered).toEqual(walked);
    const a = await compileOnce(lowered, "gulch-a");
    expectClean(a.report);
    const b = await compileOnce(lowered, "gulch-b");
    expect(b.regionSha).toBe(a.regionSha);
  }, 1_200_000);

  it("the Himalayan monastery spur compiles from its Loam 1 document and from the walked lowering", async () => {
    const lowered = await loamFixture("himalayan_monastery_spur");
    const a = await compileOnce(lowered, "himalaya-loam");
    expectClean(a.report);
    const walked = await compileOnce(await irFixture("himalayan_monastery_spur"), "himalaya-ir");
    expectClean(walked.report);
  }, 1_200_000);
});

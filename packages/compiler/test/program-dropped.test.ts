/**
 * A node that invokes a program the document does not carry.
 *
 * That is legal to *write*: a node requests its bespoke program with
 * `params.brief` and the map is attached by a later phase. If that phase never ran — or the program failed its gate and was
 * dropped — the compile must say so out loud instead of silently skipping the
 * node, which is how a requested feature used to vanish without a trace.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { compileTerrain } from "../src/terrain/compile.js";

const scratch: string[] = [];

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

function document(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "unauthored", worldSeed: 1234 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [64, 64] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 6, seaLevel: 63, baseHeight: 72}
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: { forceTheme: "temperate" } },
        {
          id: "beacon",
          kind: "generator",
          generator: "authored:beacon_tower",
          params: { brief: "a slender signal tower" },
          constraints: [{ zone: "center" }]
        },
        {
          id: "circles",
          kind: "generator",
          generator: "scatter.program@0",
          params: { program: "crop_circles", brief: "rings pressed into the wheat", count: 3, spacing: 12, area: { all: true } }
        }
      ]
    }
  };
}

describe("a requested but never authored program", () => {
  it("compiles, and warns PROGRAM_DROPPED for each invoking node", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-unauthored-"));
    scratch.push(dir);
    const result = await compileTerrain(document(), { outDir: path.join(dir, "unauthored") });
    if (!result.ok) throw new Error(result.diagnostics.map((d) => `${d.name}@${d.nodePath}: ${d.message}`).join("\n"));
    const dropped = result.report.diagnostics.filter((d) => d.name === "PROGRAM_DROPPED");
    expect(dropped.map((d) => d.nodePath).sort()).toEqual(["world.beacon", "world.circles"]);
    for (const d of dropped) {
      expect(d.severity).toBe("warning");
      expect(d.message).toContain("requested but never authored");
    }
  }, 120_000);
});

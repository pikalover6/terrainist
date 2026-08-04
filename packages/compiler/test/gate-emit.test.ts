/**
 * Bracketed blockstate strings through the spike emit and the physics gate.
 *
 * Regression for the 2026-08-04 live failure: an authored program wrote
 * `minecraft:grass_block[snowy=false]`, the gate funneled it into a spike
 * palette, and `emitWorld` — which only knew bare names — crashed the whole
 * generate run from inside `gatePhysics`.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { parseSpikeDocument } from "../src/emit/document.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION, emitWorld } from "../src/emit/world.js";
import { gatePhysics } from "../src/programs/verify.js";
import type { ProgramRun } from "../src/programs/run.js";

const scratch: string[] = [];

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function scratchDir(label: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  return dir;
}

function docWith(palette: Record<string, string>): unknown {
  return {
    format: "terrainist-spike-0",
    name: "state-palette",
    spawn: { x: 0, y: 65, z: 0 },
    palette,
    ops: [{ op: "fill", block: "g", from: [0, 64, 0], to: [0, 64, 0] }],
  };
}

describe("emitWorld palette blockstates", () => {
  it("resolves a bracketed state to its exact state id", async () => {
    const dir = await scratchDir("state");
    const doc = parseSpikeDocument(docWith({ g: "minecraft:grass_block[snowy=false]" }));
    const summary = await emitWorld(doc, path.join(dir, "world"));
    expect(summary.blockCount).toBe(1);

    const mc = loadPrismarine(EMIT_MINECRAFT_VERSION);
    expect(mc.blockStateOf("grass_block", { snowy: "false" })).toBeDefined();
  });

  it("rejects a state the registry does not know", async () => {
    const dir = await scratchDir("badstate");
    const doc = parseSpikeDocument(docWith({ g: "minecraft:grass_block[snowy=maybe]" }));
    await expect(emitWorld(doc, path.join(dir, "world"))).rejects.toThrow(
      'unknown block or state "minecraft:grass_block[snowy=maybe]"',
    );
  });
});

describe("gatePhysics on emitter-refused blocks", () => {
  it("fails the gate with a diagnostic instead of throwing", async () => {
    const run: ProgramRun = {
      ok: true,
      programId: "bad_block",
      index: 0,
      ops: [],
      voxels: new Map([["0,0,0", "minecraft:not_a_real_block"]]),
      opStream: "",
      outputHash: "",
      fuelUsed: 0,
      writes: 1,
      clipped: 0,
      logs: [],
      diagnostics: [],
    };
    const dir = await scratchDir("gate");
    const step = await gatePhysics("bad_block", [run], [4, 4, 4], { worldDir: dir });
    expect(step.ok).toBe(false);
    expect(step.diagnostics[0]?.code).toBe("LOAM-E336"); // PROGRAM_GATE_FAILED
    expect(step.diagnostics[0]?.message).toContain("emitter refuses");
  });
});

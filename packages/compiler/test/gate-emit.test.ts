/**
 * Bracketed blockstate strings through the authored-program physics gate.
 *
 * Regression for the 2026-08-04 live failure: an authored program wrote
 * `minecraft:grass_block[snowy=false]`, the physics gate's deterministic
 * world writer only knew bare names and crashed the whole generate run from
 * inside `gatePhysics`.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { parseBlockString } from "../src/emit/blockstring.js";
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

describe("parseBlockString chain rename", () => {
  // The rename must live in the PARSER, not one resolver: the first fix sat
  // only in emit, so the authoring gate passed a chain-bearing dreadnought and
  // the compile-side lowering pass then failed the whole world on the same
  // block (measured: the 2026-08-15 Gemini regen, 14 error LOAM lines).
  it("renames in the shared parser, so every resolver agrees", () => {
    expect(parseBlockString("minecraft:chain[axis=y,waterlogged=false]")).toEqual({
      name: "iron_chain",
      props: { axis: "y", waterlogged: "false" }
    });
    expect(parseBlockString("chain")).toEqual({ name: "iron_chain", props: {} });
  });
});

describe("the gate world is the world the emitter would write", () => {
  it("recomputes fence connection states, so the gate reports no stale ones", async () => {
    // The gate is only worth passing if it walks what production emits. Both
    // the authored-program physics gate and the terrain pipeline run
    // `applyConnectionStates` before writing through the deterministic writer,
    // so fence connections are recomputed; otherwise a program that fenced
    // anything would fail on `connection.stale` findings the real world would
    // never have.
    const run: ProgramRun = {
      ok: true,
      programId: "fenced",
      index: 0,
      ops: [],
      voxels: new Map([
        ["0,0,0", "minecraft:stone"],
        ["1,0,0", "minecraft:stone"],
        ["2,0,0", "minecraft:stone"],
        ["0,1,0", "minecraft:oak_fence"],
        ["1,1,0", "minecraft:oak_fence"],
        ["2,1,0", "minecraft:oak_fence"]
      ]),
      opStream: "",
      outputHash: "",
      fuelUsed: 0,
      writes: 6,
      clipped: 0,
      logs: [],
      diagnostics: []
    };
    const dir = await scratchDir("fence");
    const step = await gatePhysics("fenced", [run], [4, 4, 4], { worldDir: dir });
    expect(step.diagnostics.filter((d) => /connection\.stale/.test(d.message))).toEqual([]);
    expect(step.ok).toBe(true);
  }, 120_000);
});

describe("gatePhysics on a physics finding", () => {
  it("records the finding as a warning and passes the step", async () => {
    // Suspended (Kai, 2026-08-15, "for now"): a lint finding from the walked
    // scratch world is reported, never fatal. A torch hanging in mid air is
    // exactly the "floating" nit the ruling was made about.
    const run: ProgramRun = {
      ok: true,
      programId: "floating_torch",
      index: 0,
      ops: [],
      voxels: new Map([["1,3,1", "minecraft:torch"]]),
      opStream: "",
      outputHash: "",
      fuelUsed: 0,
      writes: 1,
      clipped: 0,
      logs: [],
      diagnostics: []
    };
    const dir = await scratchDir("torch");
    const step = await gatePhysics("floating_torch", [run], [4, 8, 4], { worldDir: dir });
    expect(step.ok).toBe(true);
    expect(step.diagnostics.length).toBeGreaterThan(0);
    expect(step.diagnostics.every((d) => d.severity === "warning")).toBe(true);
  }, 120_000);
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
      diagnostics: []
    };
    const dir = await scratchDir("gate");
    const step = await gatePhysics("bad_block", [run], [4, 4, 4], { worldDir: dir });
    expect(step.ok).toBe(false);
    expect(step.diagnostics[0]?.code).toBe("LOAM-E336"); // PROGRAM_GATE_FAILED
    expect(step.diagnostics[0]?.message).toContain("emitter refuses");
  });
});

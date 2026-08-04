/**
 * Landmark interiors, v2: a program hollows a room and *names* it, and the
 * compiler furnishes it with the building grammar's own fit-out.
 *
 * The fixture is the shape a model's output should have — a shell plus a void
 * plus one `interiors` entry, and not one prop written by the program itself.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { centeredRegion } from "@terrainist/stdlib";
import type { AuthoredProgramRecord, SeatDecision } from "@terrainist/spec";

import {
  buildPrograms,
  gateDoubleRun,
  gatePhysics,
  interiorVoxels,
  runProgramInstance,
  sourceHashOf,
} from "../src/programs/index.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "fixtures", "programs", "moot-hall.js"), "utf8");

/** The same hall with the `interiors` line deleted: the v1 shell, exactly. */
const plainSource = source.replace(/\n\s*interiors: \[[^\n]*\n/, "\n");

function record(text: string): AuthoredProgramRecord {
  const base: AuthoredProgramRecord = {
    mode: "landmark",
    envelope: [15, 12, 15],
    source: text,
    sourceHash: sourceHashOf(text),
    outputHash: "b3:0000000000000000",
  };
  return { ...base, outputHash: gateDoubleRun("moot_hall", base, 0n).outputHash };
}

const HALL = record(source);
const PLAIN = record(plainSource);

const stack = loadPrismarine("1.21.11");
const plan = devColumnPlan(centeredRegion(192, 192), stack);
const FOOTPRINT = { x0: 0, z0: 0, x1: 14, z1: 14 };

function build(program: AuthoredProgramRecord, seat?: SeatDecision) {
  return buildPrograms({
    jobs: [
      {
        nodePath: "world.hall",
        programId: "moot_hall",
        program,
        mode: "landmark" as const,
        placement: { footprint: FOOTPRINT, baseY: 64, ...(seat === undefined ? {} : { seat }) },
      },
    ],
    plan,
    stack,
    worldSeed: 0n,
  });
}

describe("a program that declares its interiors", () => {
  it("gets them furnished, inside the volume and nowhere else", () => {
    const result = build(HALL);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const shell = build(PLAIN);
    // The shell is untouched — the furniture is strictly additional.
    expect(result.blocks.slice(0, shell.blocks.length)).toEqual(shell.blocks);
    const furniture = result.blocks.slice(shell.blocks.length);
    expect(furniture.length).toBeGreaterThan(0);
    for (const b of furniture) {
      expect(b.x).toBeGreaterThanOrEqual(1);
      expect(b.x).toBeLessThanOrEqual(13);
      expect(b.z).toBeGreaterThanOrEqual(1);
      expect(b.z).toBeLessThanOrEqual(13);
      expect(b.y).toBeGreaterThanOrEqual(65);
      expect(b.y).toBeLessThanOrEqual(72);
    }
  });

  it("never writes into a voxel the program itself wrote", () => {
    const result = build(HALL);
    const seen = new Set<string>();
    for (const b of result.blocks) {
      const key = `${b.x},${b.y},${b.z}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("furnishes the same room the same way twice", () => {
    expect(build(HALL).blocks).toEqual(build(HALL).blocks);
  });

  it("leaves a program that declares nothing byte-identical to v1", () => {
    const once = build(PLAIN);
    expect(once.blocks).toEqual(build(PLAIN).blocks);
    // Nothing was appended: the shell run is the whole of the output.
    const run = runProgramInstance({
      programId: "moot_hall",
      program: PLAIN,
      nodePath: "world.hall",
      worldSeed: 0n,
      index: 0,
      count: 1,
    });
    expect(run.result?.interiors).toBeUndefined();
    expect(once.blocks).toHaveLength(run.voxels.size);
  });

  it("refuses an interior that leaves the declared envelope", () => {
    const bad = record(
      source.replace("max: [w - 2, wallTop - 1, d - 2]", "max: [w + 4, wallTop - 1, d - 2]"),
    );
    const run = runProgramInstance({
      programId: "moot_hall",
      program: bad,
      nodePath: "world.hall",
      worldSeed: 0n,
      index: 0,
      count: 1,
    });
    expect(run.ok).toBe(false);
    expect(run.diagnostics.some((d) => /outside the declared envelope/.test(d.message))).toBe(true);
  });

  it("refuses a room too thin to stand a table in", () => {
    const bad = record(source.replace("max: [w - 2, wallTop - 1, d - 2]", "max: [2, wallTop - 1, 2]"));
    const run = runProgramInstance({
      programId: "moot_hall",
      program: bad,
      nodePath: "world.hall",
      worldSeed: 0n,
      index: 0,
      count: 1,
    });
    expect(run.ok).toBe(false);
    expect(run.diagnostics.some((d) => /thinner than/.test(d.message))).toBe(true);
  });

  it("sinks the furniture with the shell when the landmark is seated", () => {
    // Seating moves node-local `y = 0`. The furniture is lowered against that
    // same plane or it hangs in the air inside its own room — the one seam
    // where the seating and interiors passes have to agree.
    const drape = build(HALL, { policy: "drape", embedDepth: 3 });
    const embed = build(HALL, { policy: "embed", embedDepth: 3 });
    expect(embed.placed[0]?.baseY).toBe((drape.placed[0]?.baseY as number) - 3);
    expect(embed.blocks).toEqual(drape.blocks.map((b) => ({ ...b, y: b.y - 3 })));
  });

  it("walks the physics rules over the furnished landmark", async () => {
    const run = runProgramInstance({
      programId: "moot_hall",
      program: HALL,
      nodePath: "world.hall",
      worldSeed: 0n,
      index: 0,
      count: 1,
    });
    expect(run.ok).toBe(true);
    const voxels = new Map(run.voxels);
    const furniture = interiorVoxels({ run, worldSeed: 0n, nodePath: "world.hall" });
    expect(furniture.size).toBeGreaterThan(0);
    for (const [key, block] of furniture) voxels.set(key, block);
    const verdict = await gatePhysics("moot_hall", [{ ...run, voxels }], HALL.envelope, { stack });
    expect(verdict.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  }, 120_000);
});

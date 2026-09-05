/**
 * The conformance suite and the verdict it stamps
 *
 * Four things are worth a test here and they are all cheap: that the suite is
 * integer-pure, that a prefab is caught, that a program which reads the ground
 * is not, and that a document written before any of this existed is untouched.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AuthoredProgramRecord } from "@terrainist/spec/ir";

import {
  CONFORM_FLOAT_TOLERANCE,
  CONFORM_RUN,
  CONFORM_SUITE,
  conformanceOf,
  gateConform,
  nodeVmExecutor,
  setProgramExecutor,
  sourceHashOf,
  VERIFICATION_NODE_PATH,
  verifyConformHash,
  verifyProgram,
  type ProgramExecutor
} from "../src/programs/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
  return readFileSync(path.join(here, "fixtures", "programs", name), "utf8");
}

function record(
  source: string,
  envelope: readonly [number, number, number],
  mode: AuthoredProgramRecord["mode"] = "landmark",
  overrides: Partial<AuthoredProgramRecord> = {},
): AuthoredProgramRecord {
  return {
    mode,
    envelope,
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000",
    ...overrides
  };
}

const RIGID = record(fixture("rigid-prefab.js"), [16, 12, 16]);
const CONFORMING = record(fixture("conforming-shed.js"), [16, 24, 16]);

const RANDOM = record(fixture("random-shed.js"), [16, 24, 16]);

/* -------------------------------------------------------------------------- */
/* the suite is integer-pure                                                   */
/* -------------------------------------------------------------------------- */

describe("the terrain suite", () => {
  const source = readFileSync(path.join(here, "..", "src", "programs", "conform.ts"), "utf8");
  // Comments carry the *word* Math.sin — the point of the file is that it does
  // not use it — so the grep runs over code with comments stripped.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

  it("reaches for no floating-point math at all", () => {
    for (const banned of ["Math.sin", "Math.cos", "Math.tan", "Math.sqrt", "Math.hypot", "Math.pow"]) {
      expect(code).not.toContain(banned);
    }
    // Not even `Math.abs`, which would be harmless: the file keeps `Math` off
    // its own import surface so that this test never has to judge which member
    // is safe. See the header's property 1.
    expect(code).not.toContain("Math.");
  });

  it("is exactly the pinned five, in order", () => {
    expect(CONFORM_SUITE.map((m) => m.id)).toEqual([
      "flat",
      "slope10",
      "slope20",
      "ridge",
      "shore"
    ]);
  });

  it("samples whole blocks only, everywhere on a 16 × 16 footprint", () => {
    for (const member of CONFORM_SUITE) {
      const ground = member.ground(16, 16);
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const h = ground(x, z);
          expect(Number.isInteger(h), `${member.id} at (${x}, ${z}) = ${h}`).toBe(true);
          expect(h).toBeLessThanOrEqual(0);
          expect(h).toBeGreaterThanOrEqual(-12);
        }
      }
    }
  });

  it("gives each member the shape the design specifies", () => {
    const [flat, slope10, slope20, ridge, shore] = CONFORM_SUITE.map((m) => m.ground(16, 16));
    expect((flat as (x: number, z: number) => number)(9, 15)).toBe(0);
    // A gentle fall to local south: 18 per hundred, truncated.
    expect((slope10 as (x: number, z: number) => number)(0, 15)).toBe(-2);
    expect((slope20 as (x: number, z: number) => number)(0, 15)).toBe(-5);
    // A crest under the middle, falling both ways from x = 8.
    expect((ridge as (x: number, z: number) => number)(8, 0)).toBe(0);
    expect((ridge as (x: number, z: number) => number)(0, 0)).toBe(-4);
    expect((ridge as (x: number, z: number) => number)(15, 0)).toBe(-3);
    // A bank: level to the halfway line, then two a step, floored at −12.
    expect((shore as (x: number, z: number) => number)(4, 7)).toBe(0);
    expect((shore as (x: number, z: number) => number)(4, 8)).toBe(0);
    expect((shore as (x: number, z: number) => number)(4, 12)).toBe(-8);
    expect((shore as (x: number, z: number) => number)(4, 15)).toBe(-12);
  });
});

/* -------------------------------------------------------------------------- */
/* the verdict                                                                 */
/* -------------------------------------------------------------------------- */

describe("conformanceOf", () => {
  it("fails a rigid prefab on every member but flat", () => {
    const result = conformanceOf({ programId: "rigid_prefab", program: RIGID, worldSeed: 3n });
    expect(result.ok).toBe(true);
    expect(result.conforms).toBe(false);
    const verdicts = Object.fromEntries(result.members.map((m) => [m.id, m.conforms]));
    expect(verdicts).toEqual({
      flat: true,
      slope10: false,
      slope20: false,
      ridge: false,
      shore: false
    });
    // It is caught twice over: the sole never changed, and on the steeper
    // members a great many columns are simply hanging in the air.
    for (const member of result.members) {
      if (member.id === "flat") continue;
      expect(member.rigidSole, member.id).toBe(true);
    }
    const shore = result.members.find((m) => m.id === "shore");
    expect((shore?.floating ?? 0) / (shore?.occupiedColumns ?? 1))
      .toBeGreaterThan(CONFORM_FLOAT_TOLERANCE);
  });

  it("passes a program that reads the ground on all five", () => {
    const result = conformanceOf({ programId: "conforming_shed", program: CONFORMING, worldSeed: 3n });
    expect(result.ok).toBe(true);
    expect(result.members.map((m) => m.conforms)).toEqual([true, true, true, true, true]);
    expect(result.conforms).toBe(true);
    // Nothing floats and nothing is buried: the sole meets the ground exactly.
    for (const member of result.members) {
      expect(member.floating, member.id).toBe(0);
      expect(member.buried, member.id).toBe(0);
      expect(member.rigidSole, member.id).toBe(false);
    }
  });

  it("digests the suite deterministically", () => {
    const a = conformanceOf({ programId: "conforming_shed", program: CONFORMING, worldSeed: 3n });
    const b = conformanceOf({ programId: "conforming_shed", program: CONFORMING, worldSeed: 3n });
    expect(a.conformHash).toMatch(/^b3:[0-9a-f]{64}$/);
    expect(b.conformHash).toBe(a.conformHash);
    // And it is a property of the program: a different program, a different
    // digest, even though both were run against the identical five grounds.
    const other = conformanceOf({ programId: "rigid_prefab", program: RIGID, worldSeed: 3n });
    expect(other.conformHash).not.toBe(a.conformHash);
  });
});

describe("gateConform", () => {
  it("reports a prefab as a warning and never as a failure", () => {
    const step = gateConform("rigid_prefab", RIGID, 3n);
    expect(step.ok).toBe(true);
    expect(step.conforms).toBe(false);
    expect(step.diagnostics).toHaveLength(1);
    expect(step.diagnostics[0]?.code).toBe("LOAM-W340");
    expect(step.diagnostics[0]?.severity).toBe("warning");
    expect(step.diagnostics[0]?.name).toBe("PROGRAM_DID_NOT_CONFORM");
  });

  it("says nothing at all about a program that conformed", () => {
    const step = gateConform("conforming_shed", CONFORMING, 3n);
    expect(step.ok).toBe(true);
    expect(step.conforms).toBe(true);
    expect(step.diagnostics).toEqual([]);
    expect(step.conformHash).toMatch(/^b3:/);
  });
});

/* -------------------------------------------------------------------------- */
/* the compile-time half, and the archived document                            */
/* -------------------------------------------------------------------------- */

describe("verifyConformHash", () => {
  it("skips a record that carries no conformHash — every archived document", () => {
    // The proof is an execution count, not an absent diagnostic: a check that
    // "passed" by re-running the suite would still cost five executions and
    // would still be a behaviour change.
    let runs = 0;
    setProgramExecutor(counting(() => runs++));
    try {
      expect(verifyConformHash("rigid_prefab", RIGID, 3n, "world.shed")).toBeUndefined();
      expect(runs).toBe(0);
    } finally {
      setProgramExecutor(nodeVmExecutor);
    }
  });

  it("accepts a record whose hash it re-derives, and refuses one it does not", () => {
    const stamped = {
      ...CONFORMING,
      conformHash: conformanceOf({ programId: "shed", program: CONFORMING, worldSeed: 3n }).conformHash
    };
    expect(verifyConformHash("shed", stamped, 3n, "world.shed")).toBeUndefined();
    const tampered = { ...CONFORMING, conformHash: "b3:deadbeef" };
    const problem = verifyConformHash("shed", tampered, 3n, "world.shed");
    expect(problem?.code).toBe("LOAM-E334");
    expect(problem?.severity).toBe("error");
  });

  // The wild-vs-test gap that shipped a fatal E334 on every freshly stamped
  // world. The gate stamps a program before it has a site; the compile pass
  // re-derives it at the real node path of the instance that carries the
  // record, with that instance's scatter count. A program's RNG is seeded from
  // `hash(worldSeed, nodePath, index)`, so the two ends only ever agreed for a
  // program that drew no random number — which is every other fixture in this
  // file, and was every fixture in the e2e test too. `RANDOM` draws.
  it("round-trips a random-drawing program stamped at the gate and checked elsewhere", () => {
    for (const mode of ["landmark", "plugin"] as const) {
      // The gate: no site to speak of, and the mode's own verification set.
      const gated = gateConform("speckled_shed", { ...RANDOM, mode }, 3n);
      expect(gated.conformHash, mode).toMatch(/^b3:/);
      const stamped = { ...RANDOM, mode, conformHash: gated.conformHash };
      // The compile pass: the instance's real node path, whatever it turned out
      // to be. Same world, same seed — a different place in it.
      for (const at of ["world.city.spires", "world.elsewhere.deep.node", "world"]) {
        expect(verifyConformHash("speckled_shed", stamped, 3n, at), `${mode} @ ${at}`)
          .toBeUndefined();
      }
    }
  });

  it("hashes a random-drawing program the same in either mode", () => {
    // The direct statement of the same law, without the gate in the way: the
    // scatter count is pinned at 1, so a plugin and a landmark carrying the
    // identical source carry the identical digest.
    const a = conformanceOf({ programId: "speckled_shed", program: RANDOM, worldSeed: 3n });
    const b = conformanceOf({
      programId: "speckled_shed",
      program: { ...RANDOM, mode: "plugin" },
      worldSeed: 3n
    });
    expect(a.conformHash).toMatch(/^b3:[0-9a-f]{64}$/);
    expect(b.conformHash).toBe(a.conformHash);
    // The seed is the one input that is *not* a site: it is one value per
    // document and both ends of the check read the same one, exactly as
    // `outputHash` does. A different world is allowed to hash differently.
    const elsewhere = conformanceOf({
      programId: "speckled_shed",
      program: RANDOM,
      worldSeed: 4n
    });
    expect(elsewhere.conformHash).not.toBe(a.conformHash);
  });

  it("keeps the pinned site equal to the gate's, so stamped documents stay valid", () => {
    // These two constants have to agree or every document stamped before the
    // site was pinned re-derives to a different digest and dies on E334.
    expect(CONFORM_RUN.nodePath).toBe(VERIFICATION_NODE_PATH);
    expect(CONFORM_RUN.count).toBe(1);
    expect(CONFORM_RUN.index).toBe(0);
  });
});

describe("the gate's execution budget", () => {
  it("keeps the double run on flat alone: 6 + 5 = 11, not 30", async () => {
    let runs = 0;
    setProgramExecutor(counting(() => runs++));
    let verification;
    try {
      // A plugin program: three verification instances, two realms.
      verification = await verifyProgram(
        "conforming_shed",
        { ...CONFORMING, mode: "plugin" },
        { worldSeed: 3n, skipPhysics: true },
      );
    } finally {
      setProgramExecutor(nodeVmExecutor);
    }
    expect(verification.ok).toBe(true);
    expect(runs).toBe(11);
    expect(verification.conforms).toBe(true);
    expect(verification.conformHash).toMatch(/^b3:/);
  });

  it("stamps a verdict on a landmark too, at 2 + 5", async () => {
    let runs = 0;
    setProgramExecutor(counting(() => runs++));
    let verification;
    try {
      verification = await verifyProgram("rigid_prefab", RIGID, { worldSeed: 3n, skipPhysics: true });
    } finally {
      setProgramExecutor(nodeVmExecutor);
    }
    expect(runs).toBe(7);
    // Non-conforming, and still a pass: the verdict routes, it does not reject.
    expect(verification.ok).toBe(true);
    expect(verification.conforms).toBe(false);
    expect(verification.diagnostics.some((d) => d.code === "LOAM-W340")).toBe(true);
  });
});

/** The real executor, with a tally in front of it. */
function counting(tick: () => void): ProgramExecutor {
  return {
    id: "test:counting",
    run: (request) => {
      tick();
      return nodeVmExecutor.run(request);
    }
  };
}

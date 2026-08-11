/**
 * The authored-program pipeline: the fuel meter, the sandbox, the five-step
 * gate, and the two invocation paths.
 *
 * The fixtures in `fixtures/programs/` are hand-written on purpose — they are
 * the shape a model's output should have, and every gate below is exercised
 * against one of them rather than against a toy.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PROGRAM_LIMITS,
  lintProgramSource,
  validateProgramMap,
  type AuthoredProgramRecord,
} from "@terrainist/spec";

import {
  BudgetExceeded,
  FUEL_HOOK,
  buildPrograms,
  gateDoubleRun,
  gateNonsense,
  gateStatic,
  gateStructural,
  instrumentFuel,
  invokePlugin,
  nodeVmExecutor,
  planProgramSites,
  programInstanceSeed,
  parseBlockString,
  runProgramInstance,
  setProgramExecutor,
  sourceHashOf,
  verifyOutputHash,
  verifyProgram,
  type ProgramExecutor,
} from "../src/programs/index.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { centeredRegion } from "@terrainist/stdlib";

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
    ...overrides,
  };
}

const TOWER = record(fixture("tower.js"), [17, 34, 17]);
const SAUCER = record(fixture("saucer.js"), [21, 13, 21], "plugin");

describe("the fuel instrumenter", () => {
  it("charges every statement block and leaves object literals alone", () => {
    const code = instrumentFuel(
      "function f(a) { const o = { k: 1 }; for (const x of a) { g(x); } }",
    );
    expect(code.match(new RegExp(FUEL_HOOK, "g"))?.length).toBe(2);
    expect(code).toContain("{ k: 1 }");
  });

  it("is blind to braces inside string and template literals", () => {
    const code = instrumentFuel('function f() { return "for (;;) { }"; }');
    expect(code.match(new RegExp(FUEL_HOOK, "g"))?.length).toBe(1);
  });

  it("stops a runaway loop rather than running forever", () => {
    const source = [
      "export const envelope = [4, 4, 4];",
      "export default function build(api) {",
      "  let n = 0;",
      "  for (let i = 0; i < 1e9; i++) { n += i; }",
      "  return { name: 'x', seatY: 0 };",
      "}",
    ].join("\n");
    const run = runProgramInstance({
      programId: "runaway",
      program: record(source, [4, 4, 4]),
      nodePath: "world.runaway",
      worldSeed: 1n,
      index: 0,
      count: 1,
      fuelBudget: 5_000,
    });
    expect(run.ok).toBe(false);
    expect(run.diagnostics[0]?.code).toBe("LOAM-E332");
    expect(run.fuelUsed).toBeGreaterThan(4_000);
  });
});

describe("the sandbox", () => {
  it("refuses the ambient world, whatever the program reaches for", () => {
    // The static lint catches these textually; this checks the realm itself,
    // because the lint is a convenience and the realm is the guarantee.
    for (const expr of ["Date.now()", "Math.random()", "process.exit()"]) {
      const source = [
        "export const envelope = [4, 4, 4];",
        "export default function build(api) {",
        `  const v = ${expr};`,
        "  return { name: 'x', seatY: 0 };",
        "}",
      ].join("\n");
      const run = runProgramInstance({
        programId: "ambient",
        program: record(source, [4, 4, 4]),
        nodePath: "world.ambient",
        worldSeed: 1n,
        index: 0,
        count: 1,
      });
      expect(run.ok, expr).toBe(false);
    }
  });

  it("is a swappable seam", () => {
    const stub: ProgramExecutor = {
      id: "test:stub",
      run: () => ({ value: { name: "stub", seatY: 0 } }),
    };
    setProgramExecutor(stub);
    try {
      const run = runProgramInstance({
        programId: "tower",
        program: TOWER,
        nodePath: "world.tower",
        worldSeed: 1n,
        index: 0,
        count: 1,
      });
      expect(run.ok).toBe(true);
      expect(run.result?.name).toBe("stub");
    } finally {
      setProgramExecutor(nodeVmExecutor);
    }
  });
});

describe("determinism", () => {
  it("is a pure function of the instance seed", () => {
    const a = runProgramInstance({
      programId: "saucer", program: SAUCER, nodePath: "n", worldSeed: 7n, index: 3, count: 8,
    });
    const b = runProgramInstance({
      programId: "saucer", program: SAUCER, nodePath: "n", worldSeed: 7n, index: 3, count: 8,
    });
    expect(a.ok && b.ok).toBe(true);
    expect(a.outputHash).toBe(b.outputHash);
  });

  it("gives two instances different worlds and the same one twice", () => {
    const three = runProgramInstance({
      programId: "saucer", program: SAUCER, nodePath: "n", worldSeed: 7n, index: 3, count: 8,
    });
    const four = runProgramInstance({
      programId: "saucer", program: SAUCER, nodePath: "n", worldSeed: 7n, index: 4, count: 8,
    });
    expect(three.outputHash).not.toBe(four.outputHash);
    expect(programInstanceSeed(7n, "n", 3)).not.toEqual(programInstanceSeed(7n, "n", 4));
  });

  it("catches a program whose two runs disagree", () => {
    let call = 0;
    const flapping: ProgramExecutor = {
      id: "test:flapping",
      run: (request) => {
        const api = request.globals.api as { set(x: number, y: number, z: number, b: string): void };
        api.set(0, 0, call++ % 2, "minecraft:stone");
        return { value: { name: "flap", seatY: 0 } };
      },
    };
    setProgramExecutor(flapping);
    try {
      const gate = gateDoubleRun("flapping", record("export const envelope = [4,4,4];\nexport default function build(api) { return { name: 'x', seatY: 0 }; }", [4, 4, 4]), 1n);
      expect(gate.ok).toBe(false);
      expect(gate.diagnostics[0]?.code).toBe("LOAM-E336");
    } finally {
      setProgramExecutor(nodeVmExecutor);
    }
  });

  it("rejects Math.random in the static gate, before anything runs", () => {
    const source = [
      "export const envelope = [8, 8, 8];",
      "export default function build(api) {",
      "  api.set(0, 0, 0, Math.random() < 0.5 ? 'minecraft:stone' : 'minecraft:dirt');",
      "  return { name: 'x', seatY: 0 };",
      "}",
    ].join("\n");
    const gate = gateStatic("coinflip", record(source, [8, 8, 8]));
    expect(gate.ok).toBe(false);
    expect(gate.diagnostics.some((d) => d.message.includes("Math.random"))).toBe(true);
  });
});

describe("the envelope", () => {
  it("fails an instance whole when it spills past its declaration", () => {
    const source = [
      "export const envelope = [8, 8, 8];",
      "export default function build(api) {",
      "  for (let y = 0; y < 40; y++) { api.set(0, y, 0, 'minecraft:stone'); }",
      "  return { name: 'x', seatY: 0 };",
      "}",
    ].join("\n");
    const run = runProgramInstance({
      programId: "spiller",
      program: record(source, [8, 8, 8]),
      nodePath: "world.spiller",
      worldSeed: 1n,
      index: 0,
      count: 1,
    });
    expect(run.ok).toBe(false);
    expect(run.diagnostics[0]?.code).toBe("LOAM-W331");
    expect(run.ops).toHaveLength(0);
  });

  it("tolerates a spill under one percent", () => {
    const source = [
      "export const envelope = [16, 16, 16];",
      "export default function build(api) {",
      "  for (let y = 0; y < 16; y++) {",
      "    for (let x = 0; x < 16; x++) { api.set(x, y, 0, 'minecraft:stone'); }",
      "  }",
      "  api.set(0, 99, 0, 'minecraft:stone');",
      "  return { name: 'x', seatY: 0 };",
      "}",
    ].join("\n");
    const run = runProgramInstance({
      programId: "nearly",
      program: record(source, [16, 16, 16]),
      nodePath: "world.nearly",
      worldSeed: 1n,
      index: 0,
      count: 1,
    });
    expect(run.ok).toBe(true);
    expect(run.clipped).toBe(1);
  });
});

describe("the gate", () => {
  it("passes the tower on the four cheap steps", async () => {
    const verdict = await verifyProgram("tower", TOWER, { skipPhysics: true });
    expect(verdict.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(verdict.ok).toBe(true);
    expect(verdict.outputHash).toMatch(/^b3:[0-9a-f]{64}$/);
    expect(verdict.solids).toBeGreaterThan(PROGRAM_LIMITS.minSolidVoxels);
  });

  it("covers instances 0, 1 and 7 for a plugin program", async () => {
    const verdict = await verifyProgram("saucer", SAUCER, { skipPhysics: true });
    expect(verdict.ok).toBe(true);
    const again = await verifyProgram("saucer", SAUCER, { skipPhysics: true });
    expect(again.outputHash).toBe(verdict.outputHash);
  });

  it("rejects a floating chunk and a nothing-program", () => {
    const floater = runProgramInstance({
      programId: "floater",
      program: record(
        [
          "export const envelope = [8, 24, 8];",
          "export default function build(api) {",
          "  for (let y = 0; y < 4; y++) {",
          "    for (let z = 0; z < 4; z++) { for (let x = 0; x < 4; x++) { api.set(x, y, z, 'minecraft:stone'); } }",
          "  }",
          "  for (let y = 16; y < 20; y++) {",
          "    for (let z = 0; z < 4; z++) { for (let x = 0; x < 4; x++) { api.set(x, y, z, 'minecraft:stone'); } }",
          "  }",
          "  return { name: 'x', seatY: 0 };",
          "}",
        ].join("\n"),
        [8, 24, 8],
      ),
      nodePath: "n",
      worldSeed: 1n,
      index: 0,
      count: 1,
    });
    expect(floater.ok).toBe(true);
    expect(gateStructural("floater", floater).ok).toBe(false);
    expect(gateStructural("floater", floater).diagnostics[0]?.code).toBe("LOAM-E335");
    expect(gateNonsense("floater", floater).ok).toBe(false);
  });

  it("emits a scratch world and walks the physics rules over it", async () => {
    const verdict = await verifyProgram("tower", TOWER);
    expect(verdict.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(verdict.steps.map((s) => s.step)).toContain("physics");
  }, 120_000);
});

describe("hash verification", () => {
  it("catches an output hash the program no longer produces", async () => {
    const verdict = await verifyProgram("tower", TOWER, { skipPhysics: true });
    const frozen = { ...TOWER, outputHash: verdict.outputHash };
    expect(verifyOutputHash("tower", frozen, 0n, "world.tower")).toBeUndefined();
    const tampered = { ...frozen, outputHash: "b3:deadbeef" };
    const problem = verifyOutputHash("tower", tampered, 0n, "world.tower");
    expect(problem?.code).toBe("LOAM-E334");
  });
});

describe("the quarter rule", () => {
  function flaky(failEvery: number): AuthoredProgramRecord {
    return record(
      [
        "export const envelope = [8, 12, 8];",
        "export default function build(api) {",
        `  if (api.instance.index % ${failEvery} === 0) { throw new Error('unlucky'); }`,
        "  for (let y = 0; y < 8; y++) {",
        "    for (let z = 0; z < 8; z++) { for (let x = 0; x < 8; x++) { api.set(x, y, z, 'minecraft:stone'); } }",
        "  }",
        "  return { name: 'x', seatY: 0 };",
        "}",
      ].join("\n"),
      [8, 12, 8],
      "plugin",
    );
  }

  it("drops a lone failure and keeps the node", () => {
    const result = invokePlugin({
      programId: "flaky", program: flaky(8), nodePath: "n", worldSeed: 1n, count: 8,
    });
    expect(result.ok).toBe(true);
    expect(result.failed).toBe(1);
    expect(result.runs).toHaveLength(7);
    expect(result.diagnostics.some((d) => d.code === "LOAM-W337")).toBe(true);
  });

  it("fails the node when more than a quarter of the instances fail", () => {
    const result = invokePlugin({
      programId: "flaky", program: flaky(2), nodePath: "n", worldSeed: 1n, count: 8,
    });
    expect(result.ok).toBe(false);
    expect(result.runs).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === "LOAM-E336")).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "LOAM-W337")).toBe(true);
  });
});

describe("the pass", () => {
  const stack = loadPrismarine("1.21.11");
  const region = centeredRegion(192, 192);
  const plan = devColumnPlan(region, stack);
  /** Room for a scatter to be *sparse* in — see the lattice guard below. */
  const wide = devColumnPlan(centeredRegion(512, 512), stack);

  function frozen(program: AuthoredProgramRecord, id: string): AuthoredProgramRecord {
    const gate = gateDoubleRun(id, program, 0n);
    return { ...program, outputHash: gate.outputHash };
  }

  it("builds a landmark, publishes its anchors as markers", () => {
    const result = buildPrograms({
      jobs: [
        {
          nodePath: "world.tower",
          programId: "tower",
          program: frozen(TOWER, "tower"),
          mode: "landmark",
          placement: { footprint: { x0: 0, z0: 0, x1: 16, z1: 16 }, baseY: 64 },
        },
      ],
      plan,
      stack,
      worldSeed: 0n,
    });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.placed).toHaveLength(1);
    expect(result.blocks.length).toBeGreaterThan(500);
    expect(result.markers.map((m) => m.name)).toEqual(["door"]);
    expect(result.markers[0]?.y).toBe(65);
  });

  it("scatters a plugin over sites the placer resolved, and repeats exactly", () => {
    const job = {
      nodePath: "world.saucers",
      programId: "saucer",
      program: frozen(SAUCER, "saucer"),
      mode: "plugin" as const,
      params: { program: "saucer", count: 4, spacing: 12, area: { all: true as const } },
    };
    const once = buildPrograms({ jobs: [job], plan, stack, worldSeed: 0n });
    const twice = buildPrograms({ jobs: [job], plan, stack, worldSeed: 0n });
    expect(once.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(once.placed.length).toBeGreaterThan(1);
    expect(twice.blocks).toEqual(once.blocks);
    expect(new Set(once.placed.map((p) => p.index)).size).toBe(once.placed.length);
  });

  it("builds a colossal program without blowing the argument limit", () => {
    // The mistwood citadel crashed the whole compile with "Maximum call stack
    // size exceeded": `blocks.push(...lowered.blocks)` passes every block as a
    // call argument, and a landmark bigger than V8's argument budget (~125k)
    // dies in a single spread. This program fills 64×48×64 = 196,608 voxels.
    const colossal = record(
      [
        "export const envelope = [64, 48, 64];",
        "export default function build(api) {",
        "  for (let y = 0; y < 48; y++) {",
        "    for (let z = 0; z < 64; z++) { for (let x = 0; x < 64; x++) { api.set(x, y, z, 'minecraft:stone'); } }",
        "  }",
        "  return { name: 'slab', seatY: 0 };",
        "}",
      ].join("\n"),
      [64, 48, 64],
    );
    const result = buildPrograms({
      jobs: [
        {
          nodePath: "world.colossus",
          programId: "colossus",
          program: frozen(colossal, "colossus"),
          mode: "landmark",
          placement: { footprint: { x0: 0, z0: 0, x1: 64, z1: 64 }, baseY: 64 },
        },
      ],
      plan,
      stack,
      worldSeed: 0n,
    });
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.blocks.length).toBeGreaterThan(196_000);
  });

  it("refuses a document whose source was edited after the gate signed it", () => {
    const result = buildPrograms({
      jobs: [
        {
          nodePath: "world.tower",
          programId: "tower",
          program: { ...TOWER, source: `${TOWER.source}\n// touched\n` },
          mode: "landmark",
          placement: { footprint: { x0: 0, z0: 0, x1: 16, z1: 16 }, baseY: 64 },
        },
      ],
      plan,
      stack,
      worldSeed: 0n,
    });
    expect(result.diagnostics[0]?.code).toBe("LOAM-E333");
    expect(result.blocks).toEqual([]);
  });

  it("costs a program-free document exactly nothing", () => {
    const result = buildPrograms({ jobs: [], plan, stack, worldSeed: 0n });
    expect(result).toEqual({
      blocks: [],
      markers: [],
      placed: [],
      diagnostics: [],
      fuelUsed: 0,
    });
    expect(validateProgramMap(undefined).diagnostics).toEqual([]);
    expect(validateProgramMap(undefined).programs).toEqual({});
  });

  it("resolves full block strings, states included", () => {
    expect(parseBlockString("minecraft:oak_stairs[facing=north,half=top]")).toEqual({
      name: "oak_stairs",
      props: { facing: "north", half: "top" },
    });
    expect(parseBlockString("stone_bricks")).toEqual({ name: "stone_bricks", props: {} });
  });

  it("places sites inside the area it was given, at the spacing it was given", () => {
    const sites = planProgramSites({
      params: { program: "saucer", count: 6, spacing: 20, area: { zone: "north" } },
      envelope: SAUCER.envelope,
      plan,
      seed: programInstanceSeed(0n, "world.saucers", 0),
    });
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(site.footprint.z1).toBeLessThan(region.z0 + region.depth / 3 + SAUCER.envelope[2]);
    }
  });

  it("spaces a scatter naturally rather than on a lattice", () => {
    // Kai's walk of `redwood_camp` found 24 colossal redwoods "in a robotic
    // pattern": the old walk's candidate stride *was* its exclusion distance,
    // so every survivor stood on a lattice point (nearest-neighbour CV 0.20).
    // The guard is the shape of the distribution, not any one coordinate: real
    // scatter has close pairs and lonely outliers, and never an overlap.
    const spacing = 20;
    const sites = planProgramSites({
      params: { program: "saucer", count: 6, spacing, area: { all: true } },
      envelope: SAUCER.envelope,
      plan: wide,
      seed: programInstanceSeed(0n, "world.saucers", 0),
    });
    // Six over a 512-block region, whose exclusion capacity is about 150:
    // loose enough that the spacing has room to vary. A *saturated* scatter is
    // uniform by packing rather than by lattice, which is not this defect.
    expect(sites).toHaveLength(6);

    const centre = (s: (typeof sites)[number]) => [
      (s.footprint.x0 + s.footprint.x1) / 2,
      (s.footprint.z0 + s.footprint.z1) / 2,
    ] as const;
    const nn = sites.map((a, i) =>
      Math.min(
        ...sites
          .filter((_, j) => j !== i)
          .map((b) => Math.hypot(centre(a)[0] - centre(b)[0], centre(a)[1] - centre(b)[1])),
      ),
    );
    const mean = nn.reduce((t, v) => t + v, 0) / nn.length;
    const cv = Math.sqrt(nn.reduce((t, v) => t + (v - mean) ** 2, 0) / nn.length) / mean;
    expect(cv).toBeGreaterThan(0.25);

    // Varied, but never overlapping: the exclusion guarantee is what the
    // jitter is allowed to play inside of, not something it may trade away.
    for (const [i, a] of sites.entries()) {
      for (const b of sites.slice(i + 1)) {
        const gapX = Math.max(a.footprint.x0 - b.footprint.x1, b.footprint.x0 - a.footprint.x1);
        const gapZ = Math.max(a.footprint.z0 - b.footprint.z1, b.footprint.z0 - a.footprint.z1);
        expect(Math.max(gapX, gapZ)).toBeGreaterThan(spacing);
      }
    }

    // Instance identity stays a property of the geometry: the list the caller
    // sees is row-major, whatever order the placer served the candidates in.
    const rowMajor = [...sites].sort(
      (a, b) => a.footprint.z0 - b.footprint.z0 || a.footprint.x0 - b.footprint.x0,
    );
    expect(sites).toEqual(rowMajor);
    expect(sites.map((s) => s.index)).toEqual(sites.map((_, i) => i));
  });
});

describe("the static lint, as the authoring loop sees it", () => {
  it("reports every problem at once, with a line and a fix", () => {
    const findings = lintProgramSource("var total = 0;\nif (total) total++;\n");
    expect(findings.length).toBeGreaterThanOrEqual(3);
    for (const finding of findings) {
      expect(finding.line).toBeGreaterThan(0);
      expect(finding.fix.length).toBeGreaterThan(10);
    }
  });

  it("is quiet on both fixtures", () => {
    expect(lintProgramSource(TOWER.source)).toEqual([]);
    expect(lintProgramSource(SAUCER.source)).toEqual([]);
  });
});

describe("budget classes", () => {
  it("names what it ran out of", () => {
    expect(new BudgetExceeded("writes", 10).message).toContain("writes");
  });
});

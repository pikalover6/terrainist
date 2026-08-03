/**
 * The `programs` map, the `authored:<id>` reference, and `scatter.program@0`.
 *
 * Every rejection here is one an authoring model will read, so the assertions
 * check the fix hint exists as well as the code.
 */

import { describe, expect, it } from "vitest";

import {
  PROGRAM_LIMITS,
  allowsPlugin,
  authoredProgramId,
  isAuthoredGenerator,
  lintProgramSource,
  stripLiterals,
  validateAuthoredReference,
  validateProgramMap,
  validateProgramScatterParams,
  type LoamDiagnostic,
  type ProgramMap,
} from "../src/index.js";

const SOURCE = [
  "export const envelope = [8, 12, 8];",
  "export default function build(api) {",
  "  const [w, h, d] = api.size;",
  "  for (let y = 0; y < h; y++) {",
  "    for (let z = 0; z < d; z++) {",
  "      for (let x = 0; x < w; x++) { api.set(x, y, z, 'minecraft:stone'); }",
  "    }",
  "  }",
  "  return { name: 'block', seatY: 0 };",
  "}",
].join("\n");

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mode: "landmark",
    envelope: [8, 12, 8],
    source: SOURCE,
    sourceHash: `b3:${"a".repeat(64)}`,
    outputHash: `b3:${"b".repeat(64)}`,
    ...overrides,
  };
}

function codes(diagnostics: readonly LoamDiagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

describe("the programs map", () => {
  it("accepts a well-formed program", () => {
    const result = validateProgramMap({ tower: entry() });
    expect(result.diagnostics).toEqual([]);
    expect(result.programs?.["tower"]?.mode).toBe("landmark");
  });

  it("is optional, and absent means an empty map rather than an error", () => {
    const result = validateProgramMap(undefined);
    expect(result.diagnostics).toEqual([]);
    expect(result.programs).toEqual({});
  });

  it("rejects a bad id, a bad mode, a bad envelope and a bad hash", () => {
    expect(codes(validateProgramMap({ "Tower!": entry() }).diagnostics)).toEqual(["LOAM-E338"]);
    expect(codes(validateProgramMap({ t: entry({ mode: "statue" }) }).diagnostics)).toEqual(["LOAM-E338"]);
    expect(codes(validateProgramMap({ t: entry({ envelope: [8, 12] }) }).diagnostics)).toEqual(["LOAM-E338"]);
    expect(codes(validateProgramMap({ t: entry({ sourceHash: "sha256:aa" }) }).diagnostics)).toEqual(["LOAM-E338"]);
  });

  it("refuses a source over the size cap", () => {
    const big = `${SOURCE}\n// ${"x".repeat(PROGRAM_LIMITS.maxSourceBytes)}`;
    const result = validateProgramMap({ t: entry({ source: big }) });
    expect(codes(result.diagnostics)).toContain("LOAM-E338");
    expect(result.diagnostics[0]?.fix).toContain("shorten");
  });

  it("refuses an envelope larger than a landmark can be", () => {
    const result = validateProgramMap({ t: entry({ envelope: [384, 384, 384] }) });
    expect(codes(result.diagnostics)).toEqual(["LOAM-E338"]);
  });

  it("runs the static lint on the source it is handed", () => {
    const result = validateProgramMap({
      t: entry({ source: SOURCE.replace("api.set(x, y, z, 'minecraft:stone')", "api.set(x, y, z, Date.now() > 0 ? 'a' : 'b')") }),
    });
    expect(codes(result.diagnostics)).toContain("LOAM-E336");
  });
});

describe("the authored:<id> reference", () => {
  const programs = validateProgramMap({
    tower: entry(),
    ufo: entry({ mode: "plugin" }),
  }).programs as ProgramMap;

  it("reads an id out of a reference", () => {
    expect(isAuthoredGenerator("authored:tower")).toBe(true);
    expect(authoredProgramId("authored:tower")).toBe("tower");
    expect(authoredProgramId("scatter.forest@0")).toBeUndefined();
    expect(authoredProgramId("authored:")).toBeUndefined();
  });

  it("resolves a landmark reference", () => {
    const out: LoamDiagnostic[] = [];
    expect(validateAuthoredReference(out, "authored:tower", programs, "world.t")).toBeDefined();
    expect(out).toEqual([]);
  });

  it("refuses a reference to a program that is not there, or is plugin-only", () => {
    const missing: LoamDiagnostic[] = [];
    validateAuthoredReference(missing, "authored:nope", programs, "world.t");
    expect(codes(missing)).toEqual(["LOAM-E338"]);

    const wrongMode: LoamDiagnostic[] = [];
    validateAuthoredReference(wrongMode, "authored:ufo", programs, "world.t");
    expect(codes(wrongMode)).toEqual(["LOAM-E338"]);
    expect(allowsPlugin(programs["ufo"]!.mode)).toBe(true);
  });

  it("warns, and keeps building, when the node declares its own envelope", () => {
    const out: LoamDiagnostic[] = [];
    const program = validateAuthoredReference(out, "authored:tower", programs, "world.t", {
      envelopeDeclared: true,
    });
    expect(program).toBeDefined();
    expect(codes(out)).toEqual(["LOAM-W330"]);
    expect(out[0]?.severity).toBe("warning");
  });
});

describe("scatter.program@0", () => {
  const programs = validateProgramMap({
    tower: entry(),
    ufo: entry({ mode: "plugin" }),
  }).programs as ProgramMap;

  it("accepts the contract's own example", () => {
    const out: LoamDiagnostic[] = [];
    const params = validateProgramScatterParams(
      out,
      { program: "ufo", count: 24, area: { zone: "north" }, spacing: 40, maxSlope: 18, avoidTags: ["settlement"] },
      programs,
      "world.ufos",
    );
    expect(out).toEqual([]);
    expect(params?.count).toBe(24);
  });

  it("refuses a landmark-only program, an unknown zone and a nonsense count", () => {
    const mode: LoamDiagnostic[] = [];
    validateProgramScatterParams(mode, { program: "tower", count: 4 }, programs, "n");
    expect(codes(mode)).toEqual(["LOAM-E338"]);

    const zone: LoamDiagnostic[] = [];
    validateProgramScatterParams(zone, { program: "ufo", count: 4, area: { zone: "up" } }, programs, "n");
    expect(codes(zone)).toEqual(["LOAM-E162"]);

    const count: LoamDiagnostic[] = [];
    validateProgramScatterParams(count, { program: "ufo", count: 0 }, programs, "n");
    expect(codes(count)).toEqual(["LOAM-E338"]);
  });

  it("refuses an unknown param rather than ignoring it", () => {
    const out: LoamDiagnostic[] = [];
    validateProgramScatterParams(out, { program: "ufo", count: 2, jitter: 3 }, programs, "n");
    expect(codes(out)).toContain("LOAM-T008");
  });
});

describe("the static lint", () => {
  it("sees through comments and string literals", () => {
    expect(lintProgramSource(`${SOURCE}\n// Date.now()\n`)).toEqual([]);
    expect(stripLiterals('const a = "Date.now()";')).not.toContain("Date");
  });

  it("catches the banned surface, unbraced bodies and module-scope state", () => {
    const messages = lintProgramSource(
      ["let cache = 0;", "export const envelope = [4,4,4];", "export default function build(api) {", "  if (cache) cache++;", "  const f = new Function('return 1');", "  return { name: 'x', seatY: 0 };", "}"].join("\n"),
    ).map((f) => f.message);
    expect(messages.some((m) => m.includes("Function"))).toBe(true);
    expect(messages.some((m) => m.includes("not braced"))).toBe(true);
    expect(messages.some((m) => m.includes("mutable state"))).toBe(true);
  });

  it("demands both exports", () => {
    const messages = lintProgramSource("const x = 1;\n").map((f) => f.message);
    expect(messages).toContain("no `export default` build function");
    expect(messages).toContain("no `export const envelope = [w, h, d]`");
  });
});

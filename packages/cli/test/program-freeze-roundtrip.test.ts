/**
 * The freeze → document → compile round trip for one authored program.
 *
 * The CLI is the only package that holds both ends — the authoring freeze in
 * `@terrainist/agents` and the compile-time check in `@terrainist/compiler` —
 * so this is the only place the two can be caught disagreeing, and they did:
 * a Gemini-authored, braceless program whose source carried one line with a
 * trailing space was frozen under one normalization and checked under another,
 * and every world that invoked it died on `LOAM-E333
 * PROGRAM_SOURCE_HASH_MISMATCH` for a difference no program can observe
 * (2026-08-15). The rule now lives once, in `@terrainist/spec`.
 *
 * The fixture is deliberately the real model draft that arrived with 27
 * braceless bodies: brace-wrapping is a *run-time* normalization the compiler
 * applies to a copy, and the document keeps the model's verbatim text, so the
 * hash must be indifferent to it.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { hashSource } from "@terrainist/agents";
import { checkSourceHash, compileTerrain, sourceHashOf, verifyProgram } from "@terrainist/compiler";
import { programSourceHash } from "@terrainist/spec";
import type { AuthoredProgramRecord } from "@terrainist/spec";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = path.join(REPO_ROOT, "packages/compiler/test/fixtures/programs/braceless-belltower.js");
const ENVELOPE = [27, 36, 27] as const;

const scratch: string[] = [];

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** The fixture, with the exact blemish the regression turned on: a line that ends in a space. */
async function bracelessSource(): Promise<string> {
  const raw = await readFile(FIXTURE, "utf8");
  const marked = raw.replace("export default function build(api) {", "export default function build(api) {  ");
  expect(marked).not.toBe(raw);
  return marked;
}

function document(program: AuthoredProgramRecord): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "freeze_roundtrip", worldSeed: 7 },
    programs: { belltower: program },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [96, 96] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 4, seaLevel: 63, baseHeight: 72, erosionPasses: 0 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "belfry",
          kind: "generator",
          generator: "authored:belltower",
          constraints: [{ zone: "center" }],
        },
      ],
    },
  };
}

describe("the one source-hash rule", () => {
  it("is the same rule on the authoring side and the compile side", async () => {
    const source = await bracelessSource();
    expect(hashSource(source)).toBe(sourceHashOf(source));
    expect(hashSource(source)).toBe(programSourceHash(source));
  });

  it("hashes the exact text the document stores, braceless bodies and all", async () => {
    const source = await bracelessSource();
    const record: AuthoredProgramRecord = {
      mode: "landmark",
      envelope: ENVELOPE,
      source,
      sourceHash: hashSource(source),
      outputHash: "",
    };
    // The verbatim source is what the document carries — the freeze normalizes
    // nothing — and the compile-side check accepts it as frozen.
    expect(record.source).toBe(source);
    expect(checkSourceHash("belltower", record, "world.belfry")).toBeUndefined();
  });
});

describe("a braceless program frozen by the authoring side", () => {
  it("round-trips through a document and builds", async () => {
    const source = await bracelessSource();
    const verification = await verifyProgram(
      "belltower",
      { mode: "landmark", envelope: ENVELOPE, source, sourceHash: hashSource(source), outputHash: "" },
      { worldSeed: 7n, skipPhysics: true },
    );
    expect(verification.sourceHash).toBe(hashSource(source));

    const record: AuthoredProgramRecord = {
      mode: "landmark",
      envelope: ENVELOPE,
      source,
      sourceHash: hashSource(source),
      outputHash: verification.outputHash,
    };

    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-freeze-"));
    scratch.push(dir);
    const result = await compileTerrain(document(record), { outDir: path.join(dir, "world") });
    const diagnostics = result.ok ? result.report.diagnostics : result.diagnostics;
    const codes = diagnostics.map((d) => `${d.code} ${d.name}@${d.nodePath}: ${d.message}`);
    expect(codes.filter((c) => c.startsWith("LOAM-E333"))).toEqual([]);
    if (!result.ok) throw new Error(codes.join("\n"));
    // Built, not dropped: the program placed its own voxels.
    expect(result.report.diagnostics.filter((d) => d.name === "PROGRAM_DROPPED")).toEqual([]);
  }, 180_000);
});

/**
 * **The quay** — `docs/GROUND-UNIFICATION-v0.md` §11, waves 12C and 12E.
 *
 * 12D built the machinery (`planeSeams`, the cut-side gate,
 * `RetainingPassInput.planes`) and had no caller. This is the caller: the
 * non-district family §11.2 names — *"the quay, the airport apron, and every
 * later pass that levels ground outside a quarter"* — is exactly
 * `PrecinctPassResult.declarations`, and 12E hands each of them to
 * `buildRetainingWalls` and `finishCutFaces` as a `RetainingPlane`.
 *
 * Two things are asserted here and they are different things:
 *
 * 1. **the contract** — a precinct declaration now carries the one level it
 *    graded its columns to, and it really is *one* level (a plane is a plane);
 * 2. **the wiring, exercised** — the compiled harbour's own declarations, fed
 *    back through the pass with `tiered: true`, are measured, and over a
 *    hillside the quay's back edge comes back as one revetted course.
 *    The shipped compile does not do this: `planes` is handed over with `tiered`
 *    absent, so every plane defaults to `GROUND_PLANE_TIE` and the job list is
 *    empty until 12F. That half is byte-identity and is proved on real documents
 *    rather than here — what is proved here is that the flag is the *only* thing
 *    standing between the quay and its revetment.
 *
 * 12C rides along: `DistrictStats.planeTie` is absent on every quarter while the
 * flag is off, which is what keeps the report goldens still.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { GROUND_PLANE_TIE } from "../src/layout/types.js";
import { buildRetainingWalls, type RetainingPlane } from "../src/structures/retaining.js";
import type { StructurePassResult } from "../src/structures/index.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";
import { compileTerrain } from "../src/terrain/compile.js";

const HARBOUR = fileURLToPath(
  new URL("../../../examples/precinct-harbour.loam.json", import.meta.url),
);

let root: string;
let stack: PrismarineStack;
let structures: StructurePassResult;
let plan: ColumnPlan;
let districts: StructurePassResult["districts"];

beforeAll(async () => {
  stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
  root = await mkdtemp(path.join(tmpdir(), "terrainist-plane-quay-"));
  const doc = JSON.parse(await readFile(HARBOUR, "utf8")) as unknown;
  let captured: ColumnPlan | undefined;
  const compiled = await compileTerrain(doc, {
    outDir: path.join(root, "harbour"),
    onColumnPlan: (p) => {
      captured = p;
    },
  });
  if (!compiled.ok) throw new Error("the harbour fixture failed to compile");
  structures = compiled.report.layout?.structures as StructurePassResult;
  plan = captured as ColumnPlan;
  districts = structures.districts;
}, 600_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* 12E — the contract the caller reads                                         */
/* -------------------------------------------------------------------------- */

describe("wave 12E — a precinct declares the level it graded to", () => {
  it("a harbour declares its quay, and the declaration carries one level", () => {
    const declarations = structures.precincts?.declarations ?? [];
    expect(declarations.length).toBeGreaterThan(0);
    for (const d of declarations) {
      expect(d.columns.length).toBeGreaterThan(0);
      // A plane is a plane: `planeY` is not an average of the claims, it is the
      // number every one of them was cut or filled to.
      expect(new Set(d.columns.map((c) => c.y))).toEqual(new Set([d.planeY]));
    }
  });

  it("the shipped compile hands its planes over with the flag's default", () => {
    // The wiring is unconditional; the *serving* is not. `structures/index.ts`
    // omits `tiered`, so every plane reads `GROUND_PLANE_TIE`, and while that is
    // false `buildRetainingWalls` builds no job list at all — R6's byte-identity.
    expect(GROUND_PLANE_TIE).toBe(false);
    const planes = (structures.precincts?.declarations ?? []).map(
      (d): RetainingPlane => ({ nodePath: d.nodePath, columns: d.columns, planeY: d.planeY }),
    );
    const off = buildRetainingWalls({
      districts: [],
      planes,
      plan,
      palette: palette(),
      stack,
      footprints: [],
    });
    expect(off.planeEdges.planes).toBe(0);
    expect(off.blocks).toHaveLength(0);
    expect(off.diagnostics).toHaveLength(0);
  });

  it("…and flag-on the quay is measured, and this fixture's coast is flat", () => {
    const on = buildRetainingWalls({
      districts: [],
      planes: tiered(),
      plan,
      palette: palette(),
      stack,
      footprints: [],
    });
    // One `LOAM-I416` per plane: measured is the point, and measured is what R1
    // asks for. `precinct-harbour` is a *flat* coast — its quay stands on ground
    // the pad already levelled, so every edge is a drop under two and `skirtSeams`'
    // own `drop < 2 → skip` rules them all out. Zero here is the honest answer
    // for this document, not an inert pass, which the next case proves.
    expect(on.planeEdges.planes).toBe(1);
    expect(on.planeEdges.deferredFaces).toBe(0);
    expect(on.diagnostics.map((d) => d.code)).toContain("LOAM-I416");
  });

  it("…and put the same quay under a hillside and its back edge is revetted", () => {
    // The walked defect, reproduced through the *shipped* claim columns rather
    // than through a synthetic plane (`plane-seams.test.ts` owns that): the
    // ground the quay did not level is raised five blocks, which is the 4–6 the
    // pirate haven's two coastal clusters actually presented. Mutates `plan`,
    // so it runs last in this file.
    const claimed = new Set<number>();
    for (const d of structures.precincts?.declarations ?? [])
      for (const c of d.columns) claimed.add(c.idx);
    for (let i = 0; i < plan.ground.length; i++) {
      if (!claimed.has(i)) plan.ground[i] = (plan.ground[i] as number) + 5;
    }
    const on = buildRetainingWalls({
      districts: [],
      planes: tiered(),
      plan,
      palette: palette(),
      stack,
      footprints: [],
    });
    // R4: `tierCountOf(5) === 1`, so the whole face is one revetted course and
    // nothing is handed to the hill's own rock or deferred to the mirror
    // geometry — 100 % of the walked evidence, which is drop ≤ 6.
    expect(on.planeEdges.revetted).toBeGreaterThan(0);
    expect(on.planeEdges.rock).toBe(0);
    expect(on.planeEdges.deferredFaces).toBe(0);
    expect(on.stacksByDressing.revetted).toBeGreaterThan(0);
    expect(on.blocks.length).toBeGreaterThan(0);
  });

  /** The shipped planes, with the one field 12F flips set by hand instead. */
  const tiered = (): RetainingPlane[] =>
    (structures.precincts?.declarations ?? []).map((d) => ({
      nodePath: d.nodePath,
      columns: d.columns,
      planeY: d.planeY,
      tiered: true,
    }));
});

/* -------------------------------------------------------------------------- */
/* 12C — the tie's numbers on the report                                       */
/* -------------------------------------------------------------------------- */

describe("wave 12C — the tie's numbers travel on the report", () => {
  it("`DistrictStats.planeTie` is absent while the tie is off", () => {
    // The datum is not handed to the election with the flag off, so nothing is
    // measured and no report golden moves. With the flag on this is where the
    // untied/tied/spanSplit counters and the residual histogram appear.
    expect(GROUND_PLANE_TIE).toBe(false);
    for (const d of districts) expect(d.stats.planeTie).toBeUndefined();
  });
});

/** The themed palette the retaining pass reads, as `plane-seams.test.ts` builds it. */
function palette(): ReturnType<typeof resolvePalette>["palette"] {
  const p = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
  defineGroundRoles(p, stack, MATERIAL_THEMES[1] as MaterialTheme);
  return p;
}

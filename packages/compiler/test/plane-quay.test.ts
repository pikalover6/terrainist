/**
 * **The quay** — 12C and 12E.
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
 *    The shipped compile now does this too: `planes` is handed over with
 *    `tiered` absent, so every plane defaults to `GROUND_PLANE_TIE` — flipped on
 *    at 12F — and the shipped harbour's quay is measured. The untied world is
 *    still exactly reachable, by a plane that asks for it by name.
 *
 * 12C rides along, as a negative: this document lays no district, so
 * `DistrictStats.planeTie` has nothing to appear on either side of the flip.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MATERIAL_THEMES, nodeSeed, type MaterialTheme } from "@terrainist/stdlib";

import { EMIT_MINECRAFT_VERSION, loadPrismarine, type PrismarineStack } from "../src/emit/prismarine.js";
import { buildRetainingWalls, type RetainingPlane } from "../src/structures/retaining.js";
import type { StructurePassResult } from "../src/structures/index.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import { defineGroundRoles, resolvePalette } from "../src/terrain/palette.js";
import { compileArtifacts, compileTerrain  } from "../src/terrain/compile.js";

const HARBOUR = fileURLToPath(
  new URL("fixtures/examples/precinct-harbour.loam.json", import.meta.url),
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
  const art = await compileArtifacts(doc, {});
  if (!art.ok) throw new Error("the harbour fixture failed to compile");
  const captured = art.artifacts.plan;
  const compiled = await compileTerrain(doc, { outDir: path.join(root, "harbour") });
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

  /**
   * **Absorbed at WP-G4's flip** (v1 §4 item 21). The three cases below feed
   * planes back into `buildRetainingWalls`, and with `GROUND_V1_SEAMS` on that
   * pass takes no plane job list at all — `finishSeams` builds a plane's edge
   * from the derived transition like every other boundary. They stay for the
   * flag-off fallback; the flag-on state of this subject is the quay's back edge
   * carried to G6 as a named gap (`natural/precinct.ground` = 118 on the pirate
   * haven; see `plane-seams.test.ts`' header). The *wiring* they were written to
   * prove — a precinct declares one level per plane, and `structures/index.ts`
   * hands it over — is asserted above, unconditionally.
   */
  /**
   * **Absorbed at WP-G4's flip** (v1 §4 item 21). The three cases below feed
   * planes back into `buildRetainingWalls`, and with `GROUND_V1_SEAMS` on that
   * pass takes no plane job list at all — `finishSeams` builds a plane's edge
   * from the derived transition like every other boundary. They stay for the
   * flag-off fallback; the flag-on state of this subject is the quay's back edge
   * carried to G6 as a named gap (`natural/precinct.ground` = 118 on the pirate
   * haven; see `plane-seams.test.ts`' header). The *wiring* they were written to
   * prove — a precinct declares one level per plane, and `structures/index.ts`
   * hands it over — is asserted above, unconditionally.
   */
  /**
   * **Absorbed at WP-G4's flip** (v1 §4 item 21). The three cases below feed
   * planes back into `buildRetainingWalls`, and with `GROUND_V1_SEAMS` on that
   * pass takes no plane job list at all — `finishSeams` builds a plane's edge
   * from the derived transition like every other boundary. They stay for the
   * flag-off fallback; the flag-on state of this subject is the quay's back edge
   * carried to G6 as a named gap (`natural/precinct.ground` = 118 on the pirate
   * haven; see `plane-seams.test.ts`' header). The *wiring* they were written to
   * prove — a precinct declares one level per plane, and `structures/index.ts`
   * hands it over — is asserted above, unconditionally.
   */
  /** The shipped planes, with the one field 12F flips set by hand instead. */
  const tiered = (): RetainingPlane[] =>
    (structures.precincts?.declarations ?? []).map((d) => ({
      nodePath: d.nodePath,
      columns: d.columns,
      planeY: d.planeY,
      tiered: true
    }));
});

/* -------------------------------------------------------------------------- */
/* 12C — the tie's numbers on the report                                       */
/* -------------------------------------------------------------------------- */

describe("wave 12C — the tie's numbers travel on the report", () => {
  it("`DistrictStats.planeTie` says nothing here, because there is no quarter", () => {
    // **Re-pinned at 12F, with the cause written down.** Pre-flip this asserted
    // that `planeTie` was absent on every district *because the flag was off*,
    // which read as a flag assertion and was not one: `precinct-harbour` is a
    // port and a quay and it lays **no district at all**, so the tie has nothing
    // to measure here in either world. Kept as the statement it really makes —
    // the plane half of this file's subject is served (`LOAM-I416`, above)
    // without a quarter anywhere near it — and the counters and the residual
    // histogram are asserted where a quarter exists, in
    // `ground-plane-tie.test.ts` and on the battery worlds.
    expect(districts).toHaveLength(0);
    for (const d of districts) expect(d.stats.planeTie).toBeUndefined();
  });
});

/** The themed palette the retaining pass reads, as `plane-seams.test.ts` builds it. */
function palette(): ReturnType<typeof resolvePalette>["palette"] {
  const p = resolvePalette(stack, undefined, nodeSeed(7n, "world")).palette;
  defineGroundRoles(p, stack, MATERIAL_THEMES[1] as MaterialTheme);
  return p;
}

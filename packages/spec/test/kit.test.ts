/**
 * The kit is a reference, not a tutorial.
 *
 * `kits/settlement-author.md` is generated from `kits/src/settlement-author.md`
 * by `tools/kit/build.mjs` against the code's registries. It carries no worked
 * examples — a model is trusted to compose from the rules — so what this file
 * holds is the shape of the reference: no fenced example blocks, and every
 * word of the Loam 1 vocabulary named. Freshness against the registries is
 * checked in `packages/compiler/test/kit-generated.test.ts`, which can see
 * every registry.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COMPOUNDS,
  FABRICS,
  GROUND_MODES,
  LOAM1_KEYS,
  ON_TARGETS,
  RELATIONS,
  ROAD_PATTERNS,
  SHAPE_BY_VERB,
  TERRAIN_KEYS,
} from "../src/index.js";

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../kits/settlement-author.md");
const source = await readFile(KIT, "utf8");

describe("the Loam 1 kit", () => {
  it("carries no examples", () => {
    expect(source).not.toMatch(/```/);
  });

  it("says the language version", () => {
    expect(source).toContain('`"1"`');
  });

  it("names every top-level key an author may write", () => {
    for (const key of LOAM1_KEYS) {
      if (key === "programs") continue; // the pipeline's, never the author's
      expect(source, key).toContain(`\`${key}\``);
    }
    for (const key of TERRAIN_KEYS) expect(source, key).toContain(`\`${key}\``);
  });

  it("names every land verb, relation, fabric, compound and ground mode", () => {
    for (const verb of Object.keys(SHAPE_BY_VERB)) expect(source, verb).toContain(`\`${verb}\``);
    for (const relation of RELATIONS) expect(source, relation).toContain(`\`${relation}\``);
    for (const fabric of FABRICS) expect(source, fabric).toContain(`\`${fabric}\``);
    for (const compound of COMPOUNDS) expect(source, compound).toContain(`\`${compound}\``);
    for (const mode of GROUND_MODES) expect(source, mode).toContain(`\`${mode}\``);
    for (const target of ON_TARGETS) expect(source, target).toContain(target);
    for (const pattern of ROAD_PATTERNS) expect(source, pattern).toContain(pattern);
  });

  it("teaches the things a prompt must be able to reach", () => {
    for (const needle of ["`brief`", "`walls`", "`where`", "`is`", "`palette`", "`woods`", "`decline`"]) {
      expect(source, needle).toContain(needle);
    }
  });
});

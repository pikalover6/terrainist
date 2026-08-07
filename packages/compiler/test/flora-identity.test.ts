/**
 * The re-expression moved nothing (FLORA-GRAMMAR-v0 §8.1).
 *
 * The four legacy tree shapes were geometry closures inside `vegetation.ts`;
 * they are now `SHAPE_PROGRAMS.conifer` and `SHAPE_PROGRAMS.blob` driven by
 * species knobs. The closures below are those originals, copied verbatim off
 * the pre-grammar file, and they stay here forever as the reference the
 * grammar is held to.
 *
 * The comparison is **list-identity**: the same array, element for element,
 * duplicates and order included. Not set equality — `clipTrees` computes
 * `hit / blocks.length` and `leavesHit / leaves` against `MAX_CLIP_FRACTION`,
 * so a de-duplicated list changes which trees are dropped near a structure, and
 * today's conifer genuinely emits duplicates (the `dy = height` layer writes the
 * trunk columns once in the ring loop and again in the cap loop).
 */

import { describe, expect, it } from "vitest";

import {
  LEGACY_FLORA_SPECIES,
  SHAPE_PROGRAMS,
  TREE_TEMPLATES,
  type FloraBlock,
  type FloraSpeciesDef,
  type FloraVariation,
} from "../src/terrain/vegetation.js";

/* -------------------------------------------------------------------------- */
/* The originals, verbatim                                                     */
/* -------------------------------------------------------------------------- */

function legacyIsTrunk(
  trunk: readonly (readonly [number, number])[],
  dx: number,
  dz: number,
): boolean {
  for (const [tx, tz] of trunk) if (tx === dx && tz === dz) return true;
  return false;
}

function legacyConifer(spread: number): (v: FloraVariation) => FloraBlock[] {
  return ({ height, radiusDelta, mega }) => {
    const out: FloraBlock[] = [];
    const trunk: readonly (readonly [number, number])[] = mega
      ? [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]
      : [[0, 0]];
    for (let dy = 0; dy < height; dy++) {
      for (const [tx, tz] of trunk) out.push({ dx: tx, dy, dz: tz, part: "log" });
    }
    const cap = Math.max(1, spread + radiusDelta + (mega ? 2 : 0));
    const start = Math.max(1, Math.floor(height * 0.35));
    for (let dy = start; dy <= height; dy++) {
      const fromTop = height - dy;
      let r = Math.min(cap, Math.floor(fromTop / 2));
      if (fromTop % 3 === 2 && r > 0) r -= 1;
      if (r === 0) {
        if (dy >= height) out.push({ dx: 0, dy, dz: 0, part: "leaves" });
        continue;
      }
      for (let dz = -r; dz <= r + (mega ? 1 : 0); dz++) {
        for (let dx = -r; dx <= r + (mega ? 1 : 0); dx++) {
          if (legacyIsTrunk(trunk, dx, dz) && dy < height) continue;
          const qx = mega ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
          const qz = mega ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
          if (qx * qx + qz * qz > r * r + r) continue;
          out.push({ dx, dy, dz, part: "leaves" });
        }
      }
    }
    for (const [tx, tz] of trunk) out.push({ dx: tx, dy: height, dz: tz, part: "leaves" });
    return out;
  };
}

function legacyBlob(radius: number, squash: number): (v: FloraVariation) => FloraBlock[] {
  return ({ height, radiusDelta }) => {
    const out: FloraBlock[] = [];
    for (let dy = 0; dy < height; dy++) out.push({ dx: 0, dy, dz: 0, part: "log" });
    const r = Math.max(1, radius + radiusDelta);
    const cy = height - 1;
    const ry = Math.max(1, Math.round(r * squash));
    for (let dy = cy - ry; dy <= cy + ry; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dz === 0 && dy < height) continue;
          const vy = (dy - cy) / ry;
          if ((dx * dx + dz * dz) / (r * r) + vy * vy > 1.15) continue;
          out.push({ dx, dy, dz, part: "leaves" });
        }
      }
    }
    return out;
  };
}

const LEGACY_CLOSURES: Readonly<Record<string, (v: FloraVariation) => FloraBlock[]>> = {
  spruce_tall: legacyConifer(2),
  spruce_squat: legacyConifer(3),
  oak_round: legacyBlob(2, 1),
  birch_slim: legacyBlob(2, 0.75),
};

/**
 * The envelope corners (§3.3), plus the `+4` a mega spruce's height carries in
 * `scatterOne` — the geometry a real world actually contains.
 */
function corners(def: FloraSpeciesDef): FloraVariation[] {
  const [lo, hi] = def.height;
  const out: FloraVariation[] = [];
  for (const mega of [false, true]) {
    for (const radiusDelta of [-1, 0, 1]) {
      for (const height of [lo, hi, lo + 4, hi + 4]) out.push({ height, radiusDelta, mega });
    }
  }
  return out;
}

function noRng(): number {
  throw new Error("conifer and blob must not draw from the RNG");
}

describe("flora: the legacy re-expression", () => {
  it("the four legacy shapes are list-identical to their closures", () => {
    for (const [id, def] of Object.entries(LEGACY_FLORA_SPECIES) as [string, FloraSpeciesDef][]) {
      const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
      const legacy = LEGACY_CLOSURES[id] as (v: FloraVariation) => FloraBlock[];
      for (const v of corners(def)) {
        const expected = legacy(v);
        const actual = program.blocks(v, def, noRng);
        expect(actual.length, `${id} ${JSON.stringify(v)} length`).toBe(expected.length);
        expect(actual, `${id} ${JSON.stringify(v)}`).toEqual(expected);
      }
    }
  });

  it("TREE_TEMPLATES is unchanged as a view over the legacy species", () => {
    for (const [id, def] of Object.entries(LEGACY_FLORA_SPECIES) as [string, FloraSpeciesDef][]) {
      const template = TREE_TEMPLATES[id as keyof typeof TREE_TEMPLATES];
      expect(template.minHeight).toBe(def.height[0]);
      expect(template.maxHeight).toBe(def.height[1]);
      expect(template.trunkSymbol).toBe(def.trunkSymbol);
      expect(template.leafSymbol).toBe(def.leafSymbol);
      const legacy = LEGACY_CLOSURES[id] as (v: FloraVariation) => FloraBlock[];
      for (const v of corners(def)) expect(template.blocks(v)).toEqual(legacy(v));
    }
  });

  it("every legacy shape name resolves to a species and a program", () => {
    for (const shape of Object.keys(TREE_TEMPLATES)) {
      const def = LEGACY_FLORA_SPECIES[shape as keyof typeof LEGACY_FLORA_SPECIES] as
        | FloraSpeciesDef
        | undefined;
      expect(def, `no species for shape ${shape}`).toBeDefined();
      expect(SHAPE_PROGRAMS[(def as FloraSpeciesDef).program as keyof typeof SHAPE_PROGRAMS])
        .toBeDefined();
    }
  });
});

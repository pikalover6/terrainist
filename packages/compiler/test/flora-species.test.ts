/**
 * WP-B: the naturalistic catalog is honest, and its programs obey the six laws
 * (FLORA-GRAMMAR-v0 §3.3, §4, §8.1).
 *
 * The matrix is every naturalistic species × every corner of its envelope:
 * min/max height × `radiusDelta` ∈ {−1, 0, +1} × `age` ∈ {0, 0.5, 0.85} where
 * the program reads it. Law 2 is the ratified metric — leaf **BFS** ≤ 6 through
 * the plant's own canopy — and for a new program the unreachable count is
 * asserted **zero**: the frozen mega-spruce exception is legacy-only and is
 * never extended.
 */

import { describe, expect, it } from "vitest";

import {
  CLIMATE_STRATA,
  FLORA_SPECIES,
  NATURALISTIC_FLORA_SPECIES,
  SHAPE_PROGRAMS,
  WOOD_PARTS,
  leafDistances,
  speciesFor,
  type FloraBlock,
  type FloraSpeciesDef,
  type FloraVariation
} from "../src/terrain/vegetation.js";
import { DEFAULT_PALETTE } from "../src/terrain/palette.js";
import { FLORA_SPECIES_IDS, ID_PATTERN } from "@terrainist/spec/ir";

const FACES: readonly (readonly [number, number, number])[] = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0]
];

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** A deterministic RNG stand-in — the programs draw, so the laws must hold for any stream. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

interface Case {
  readonly id: string;
  readonly def: FloraSpeciesDef;
  readonly v: FloraVariation;
  readonly blocks: readonly FloraBlock[];
}

function matrix(): Case[] {
  const out: Case[] = [];
  for (const raw of Object.values(NATURALISTIC_FLORA_SPECIES)) {
    const def = raw as FloraSpeciesDef;
    const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
    const ages = def.age === undefined ? [undefined] : [0, 0.5, 0.85];
    for (const height of [def.height[0], def.height[1]]) {
      for (const radiusDelta of [-1, 0, 1]) {
        for (const age of ages) {
          for (const stream of [1, 7, 99, 12345]) {
            const v: FloraVariation = {
              height,
              radiusDelta,
              mega: false,
              ...(age === undefined ? {} : { age })
            };
            out.push({ id: def.id, def, v, blocks: program.blocks(v, def, seededRng(stream)) });
          }
        }
      }
    }
  }
  return out;
}

const CASES = matrix();

describe("flora WP-B: the six laws, over the naturalistic catalog", () => {
  it("every species names a program the registry knows", () => {
    for (const def of Object.values(FLORA_SPECIES)) {
      expect(
        SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS],
        `species ${def.id} names missing program ${def.program}`,
      ).toBeDefined();
    }
  });

  /**
   * Law 1 at the source, and its two enumerated exceptions (§9.4, §3.7.1).
   *
   * Law 1 is **suspended as a universal law**: the target property was never
   * "no topmost log", it was "no *accidental* bare mast", and that is bought by
   * `capWood` over live construction. Two kinds of bare top are the intent
   * rather than the defect, and this test enumerates them and nothing else:
   *
   * - a **buttress** ridge of a `giant` — wood at and just above grade whose
   *   top face is supposed to be bark; a leaf on it is a shrub growing out of a
   *   tree's ankle. Still bounded to knee height.
   * - a **dead** limb of an `ancient` — a stripped, sun-bleached limb ends in
   *   the dead wood it is made of. It used to carry a single terminating leaf,
   *   which was law 1 speaking and looked like a green sprig on a bone.
   *
   * Every other bare wood top in the catalog is still a failure.
   */
  it("law 1: the only bare wood tops are buttress ridges and dead limbs", () => {
    let buttressTops = 0;
    let deadTops = 0;
    for (const { id, v, blocks } of CASES) {
      const top = new Map<string, FloraBlock>();
      for (const b of blocks) {
        if (b.part === "hanging") continue;
        const col = `${b.dx},${b.dz}`;
        const seen = top.get(col);
        if (seen === undefined || b.dy > seen.dy) top.set(col, b);
      }
      const bare = [...top.values()].filter((b) => WOOD_PARTS.has(b.part));
      for (const b of bare) {
        expect(
          b.buttress === true || b.dead === true,
          `${id} ${JSON.stringify(v)} bare wood top at ${b.dx},${b.dy},${b.dz}`,
        ).toBe(true);
        if (b.buttress === true) {
          expect(b.dy, `${id} buttress top above knee height`).toBeLessThanOrEqual(3);
          buttressTops += 1;
        } else {
          // Dead wood is a limb, never the trunk: an `ancient` still stands.
          expect(b.part, `${id} dead bare top is not a limb`).toBe("branch");
          deadTops += 1;
        }
      }
    }
    // Exercised, not vacuous: the giants and the ancients are in the matrix.
    expect(buttressTops).toBeGreaterThan(0);
    expect(deadTops).toBeGreaterThan(0);
  });

  it("law 2: the leaf BFS reaches every canopy block within 6, with zero unreachable", () => {
    for (const { id, v, blocks } of CASES) {
      const { unreachable } = leafDistances(blocks);
      expect(unreachable, `${id} ${JSON.stringify(v)} unreachable canopy`).toBe(0);
    }
  });

  it("law 3: every branch is 6-adjacent to a branch or a log", () => {
    for (const { id, v, blocks } of CASES) {
      const wood = new Set<string>();
      for (const b of blocks) if (b.part === "branch" || b.part === "log") wood.add(key(b.dx, b.dy, b.dz));
      for (const b of blocks) {
        if (b.part !== "branch") continue;
        const attached = FACES.some(([ox, oy, oz]) => wood.has(key(b.dx + ox, b.dy + oy, b.dz + oz)));
        expect(attached, `${id} ${JSON.stringify(v)} floating branch at ${b.dx},${b.dy},${b.dz}`).toBe(true);
      }
    }
  });

  it("law 4: every root is at dy <= 0 and its column has no gap above it", () => {
    let roots = 0;
    for (const { id, blocks } of CASES) {
      const solid = new Set<string>();
      for (const b of blocks) solid.add(key(b.dx, b.dy, b.dz));
      for (const b of blocks) {
        if (b.part !== "root") continue;
        roots += 1;
        expect(b.dy, `${id} root above grade`).toBeLessThanOrEqual(0);
        // No gap above a root — which chains, so every root column is solid
        // from its deepest block up to the wood it seats. That used to read
        // "filled to grade"; since 2026-08-09 a buttress ridge is sunk one
        // course (§3.7.1), so a ridge toe's topmost block is a buried `branch`
        // at dy = -1 and grade itself is terrain, not wood. The property that
        // matters — a root never floats under a hole — is unchanged.
        expect(solid.has(key(b.dx, b.dy + 1, b.dz)), `${id} root column gap`).toBe(true);
      }
    }
    // The giants are in the matrix, so the law is exercised rather than vacuous.
    expect(roots).toBeGreaterThan(0);
  });

  it("law 5: a program's output is a pure function of (variation, def, rng seed)", () => {
    for (const raw of Object.values(NATURALISTIC_FLORA_SPECIES)) {
      const def = raw as FloraSpeciesDef;
      const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
      for (const height of def.height) {
        const v: FloraVariation = { height, radiusDelta: 0, mega: false, age: 0.6 };
        expect(program.blocks(v, def, seededRng(4242))).toEqual(
          program.blocks(v, def, seededRng(4242)),
        );
      }
    }
  });

  it("law 6: every full-cube part is 6-connected to wood", () => {
    for (const { id, v, blocks } of CASES) {
      const index = new Map<string, FloraBlock>();
      for (const b of blocks) index.set(key(b.dx, b.dy, b.dz), b);
      const seen = new Set<string>();
      const queue: FloraBlock[] = [];
      for (const b of blocks) {
        if (!WOOD_PARTS.has(b.part)) continue;
        const k = key(b.dx, b.dy, b.dz);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(b);
      }
      while (queue.length > 0) {
        const b = queue.pop() as FloraBlock;
        for (const [ox, oy, oz] of FACES) {
          const k = key(b.dx + ox, b.dy + oy, b.dz + oz);
          const n = index.get(k);
          if (n === undefined || seen.has(k) || n.part === "hanging") continue;
          seen.add(k);
          queue.push(n);
        }
      }
      for (const b of blocks) {
        if (b.part === "hanging") continue;
        expect(
          seen.has(key(b.dx, b.dy, b.dz)),
          `${id} ${JSON.stringify(v)} isolated ${b.part} at ${b.dx},${b.dy},${b.dz}`,
        ).toBe(true);
      }
    }
  });

  it("every hanging block has one of the plant's own blocks above it", () => {
    for (const { id, blocks } of CASES) {
      const solid = new Set<string>();
      for (const b of blocks) solid.add(key(b.dx, b.dy, b.dz));
      for (const b of blocks) {
        if (b.part !== "hanging") continue;
        expect(solid.has(key(b.dx, b.dy + 1, b.dz)), `${id} unsupported hanging`).toBe(true);
      }
    }
  });

  it("canopyRadius bounds the block list", () => {
    for (const { id, def, v, blocks } of CASES) {
      const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
      const bound = program.canopyRadius(v, def);
      for (const b of blocks) {
        expect(Math.abs(b.dx), `${id} ${JSON.stringify(v)} dx ${b.dx} out of reach ${bound}`).toBeLessThanOrEqual(bound);
        expect(Math.abs(b.dz), `${id} ${JSON.stringify(v)} dz ${b.dz} out of reach ${bound}`).toBeLessThanOrEqual(bound);
      }
    }
  });
});

describe("flora WP-B: the catalog is honest", () => {
  it("every species resolves every palette symbol its program emits", () => {
    const symbolFor: Readonly<Record<string, keyof FloraSpeciesDef>> = {
      log: "trunkSymbol",
      leaves: "leafSymbol",
      root: "rootSymbol",
      stem: "stemSymbol",
      cap: "capSymbol",
      hanging: "hangingSymbol",
      deco: "decoSymbol"
    };
    for (const { id, def, blocks } of CASES) {
      const parts = new Set(blocks.map((b) => b.part));
      for (const part of parts) {
        if (part === "branch") continue; // live limbs take the trunk symbol
        const field = symbolFor[part] as keyof FloraSpeciesDef;
        expect(def[field], `${id} emits ${part} with no ${String(field)}`).toBeTypeOf("string");
      }
      // A dead limb needs its own stripped-log symbol.
      if (blocks.some((b) => b.dead === true)) {
        expect(def.deadSymbol, `${id} grows dead limbs with no deadSymbol`).toBeTypeOf("string");
      }
    }
  });

  it("every flora palette symbol is a member of DEFAULT_PALETTE", () => {
    for (const def of Object.values(FLORA_SPECIES)) {
      for (const symbol of [
        def.trunkSymbol,
        def.leafSymbol,
        def.rootSymbol,
        def.deadSymbol,
        def.hangingSymbol,
        def.decoSymbol,
        def.stemSymbol,
        def.capSymbol
      ]) {
        if (symbol === undefined) continue;
        expect(
          Object.hasOwn(DEFAULT_PALETTE, symbol),
          `${def.id}: ${symbol} is not in DEFAULT_PALETTE`,
        ).toBe(true);
      }
    }
  });

  it("no fantasy species appears in any climate table", () => {
    for (const rows of Object.values(CLIMATE_STRATA)) {
      for (const row of Object.values(rows)) {
        for (const id of row) {
          expect(speciesFor(id).fantasy, `${id} is reachable from a climate default`).not.toBe(true);
        }
      }
    }
  });

  it("every species id is a legal Loam id, unique, and known to the validator", () => {
    const seen = new Set<string>();
    for (const [id, def] of Object.entries(FLORA_SPECIES)) {
      expect(id).toBe(def.id);
      expect(ID_PATTERN.test(id), `${id} is not a legal Loam id`).toBe(true);
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      expect((FLORA_SPECIES_IDS as readonly string[]).includes(id), `${id} is not accepted`).toBe(true);
    }
    // The registry and the accepted enum are the same closed vocabulary.
    for (const id of FLORA_SPECIES_IDS) expect(FLORA_SPECIES[id], `${id} has no entry`).toBeDefined();
  });

  it("every climate has a row for every stratum, and every row resolves", () => {
    for (const [theme, rows] of Object.entries(CLIMATE_STRATA)) {
      for (const stratum of ["emergent", "canopy", "understory"] as const) {
        const row = rows[stratum];
        expect(row.length, `${theme}.${stratum} is empty`).toBeGreaterThan(0);
        for (const id of row) {
          expect(speciesFor(id).stratum, `${id} is not a ${stratum} species`).toBe(stratum);
        }
      }
    }
  });

  it("every program has at least one non-fantasy client", () => {
    const used = new Set<string>();
    for (const def of Object.values(FLORA_SPECIES)) if (def.fantasy !== true) used.add(def.program);
    for (const id of Object.keys(SHAPE_PROGRAMS)) {
      expect(used.has(id), `program ${id} has no non-fantasy species`).toBe(true);
    }
  });
});

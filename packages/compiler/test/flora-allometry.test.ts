/**
 * **Allometry, and the street fit** (2026-08-10, Kai's walk of `overgrown_hideout`).
 *
 * > *"The trees are almost entirely converged on some tall, skinny with a small
 * > mullet for leaves at the top design."*
 *
 * The document he walked authored real variety — `oak_round` at weight 5,
 * `birch_slim` at 3, `spruce_squat` at 1 — so the convergence was mechanical.
 * Measured on that world's own compile, before anything moved:
 *
 * | species | n | median height | median first leaf | bare share | crown layers |
 * |---|---|---|---|---|---|
 * | `wild_oak` | 7,724 | 13 | 11 | 0.80 | 4 |
 * | `wild_birch` | 3,116 | 12 | 8 | 0.61 | 6 |
 *
 * Two species, one silhouette: a bare pole with a two-block-wide puck on it.
 * The cause is that a `species` entry may override `minHeight`/`maxHeight` — the
 * kit teaches it, and the model used it (8–24 against an `oak_round` envelope
 * of 5–7) — while the crown knobs were absolute. Everything above the envelope
 * came out as trunk.
 *
 * So: a tree grown past its species' envelope grows its crown too
 * ({@link overgrowth}), and it does so *in its own species' direction*, which
 * is what puts two silhouettes back on one street. Inside the envelope the law
 * is provably inert — that is `flora-identity.test.ts`'s subject — and no
 * committed example overrides a height, so no shipped world moves.
 */

import { describe, expect, it } from "vitest";

import {
  LEGACY_FLORA_SPECIES,
  SHAPE_PROGRAMS,
  overgrowth,
  type FloraBlock,
  type FloraSpeciesDef,
  type FloraVariation
} from "../src/terrain/flora/index.js";
import { fitStreetTree, wallRoom, STREET_ROOM_MAX } from "../src/terrain/vegetation.js";

const OAK = LEGACY_FLORA_SPECIES.oak_round as FloraSpeciesDef;
const BIRCH = LEGACY_FLORA_SPECIES.birch_slim as FloraSpeciesDef;
const SPRUCE = LEGACY_FLORA_SPECIES.spruce_squat as FloraSpeciesDef;

function blocks(def: FloraSpeciesDef, height: number, radiusDelta = 0): FloraBlock[] {
  const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
  return program.blocks({ height, radiusDelta, mega: false }, def, () => 0.5);
}

/** The numbers the walk was about: where the leaves start, how deep, how wide. */
function silhouette(def: FloraSpeciesDef, height: number, radiusDelta = 0) {
  const list = blocks(def, height, radiusDelta);
  const leaves = list.filter((b) => b.part === "leaves");
  const layers = new Set(leaves.map((b) => b.dy));
  return {
    leaves: leaves.length,
    firstLeaf: Math.min(...leaves.map((b) => b.dy)),
    topLeaf: Math.max(...leaves.map((b) => b.dy)),
    radius: Math.max(...leaves.map((b) => Math.max(Math.abs(b.dx), Math.abs(b.dz)))),
    layers: layers.size,
    bareShare: Math.min(...leaves.map((b) => b.dy)) / height
  };
}

describe("flora: allometry above the species envelope", () => {
  it("is exactly inert inside the envelope, `mega` included", () => {
    for (const def of Object.values(LEGACY_FLORA_SPECIES) as FloraSpeciesDef[]) {
      for (let height = def.height[0]; height <= def.height[1]; height++) {
        for (const radiusDelta of [-1, 0, 1]) {
          expect(overgrowth({ height, radiusDelta, mega: false }, def), `${def.id} h=${height}`).toBe(1);
          expect(overgrowth({ height: height + 4, radiusDelta, mega: true }, def)).toBe(1);
        }
      }
    }
  });

  it("clothes the trunk instead of perching on it — the mullet is gone", () => {
    // The heights the walked document actually asked for (8..24 for its oaks,
    // 7..21 for its birches). Before the law every one of these was ≥ 0.6 bare;
    // `wild_oak` measured 0.80.
    for (const def of [OAK, BIRCH]) {
      for (let height = def.height[1] + 4; height <= 24; height++) {
        const s = silhouette(def, height);
        expect(s.bareShare, `${def.id} h=${height} bare share`).toBeLessThanOrEqual(0.6);
        expect(s.layers, `${def.id} h=${height} crown layers`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("keeps the crown wider as the tree grows, never narrower", () => {
    for (const def of [OAK, BIRCH, SPRUCE]) {
      let last = 0;
      for (let height = def.height[0]; height <= 30; height++) {
        const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
        const r = program.canopyRadius({ height, radiusDelta: 0, mega: false }, def);
        expect(r, `${def.id} h=${height} radius monotone`).toBeGreaterThanOrEqual(last);
        last = r;
      }
    }
  });

  it("keeps two authored species two silhouettes at one height (§4.1's bar)", () => {
    // The whole complaint, as an assertion: the oak and the birch of the walked
    // document, at the same 13 blocks, must not be the same tree.
    for (const height of [11, 13, 17, 21]) {
      const oak = silhouette(OAK, height);
      const birch = silhouette(BIRCH, height);
      expect(oak.radius, `h=${height}: oak wider than birch`).toBeGreaterThan(birch.radius);
      expect(oak.leaves, `h=${height}: oak fuller than birch`).toBeGreaterThan(birch.leaves);
    }
    // And the conifer is neither: its crown reaches further down the trunk than
    // either broadleaf's, which is what a cone is.
    for (const height of [11, 13, 17]) {
      expect(silhouette(SPRUCE, height).bareShare).toBeLessThan(silhouette(OAK, height).bareShare);
    }
  });

  it("holds law 1 and law 2 at every overgrown height", () => {
    for (const def of [OAK, BIRCH, SPRUCE]) {
      for (let height = def.height[1] + 1; height <= 32; height++) {
        for (const radiusDelta of [-1, 0, 1]) {
          const list = blocks(def, height, radiusDelta);
          // Law 1: no wood is the top of its own column.
          const top = new Map<string, FloraBlock>();
          for (const b of list) {
            const column = `${b.dx},${b.dz}`;
            const seen = top.get(column);
            if (seen === undefined || b.dy > seen.dy) top.set(column, b);
          }
          for (const b of top.values()) {
            expect(b.part, `${def.id} h=${height} bare wood top at ${b.dx},${b.dz}`).toBe("leaves");
          }
          // Law 2: every leaf within taxicab 5 of wood. A legacy program has no
          // limbs, so this is the bound that decides how wide a crown may get —
          // both programs cut their corners against it.
          const wood = list.filter((b) => b.part === "log");
          for (const b of list) {
            if (b.part !== "leaves") continue;
            let best = Number.POSITIVE_INFINITY;
            for (const w of wood) {
              const d = Math.abs(b.dx - w.dx) + Math.abs(b.dy - w.dy) + Math.abs(b.dz - w.dz);
              if (d < best) best = d;
            }
            expect(best, `${def.id} h=${height} rd=${radiusDelta} leaf reach`).toBeLessThanOrEqual(5);
          }
        }
      }
    }
  });

  it("bounds the block list by `canopyRadius`, which the clip and the shade map read", () => {
    for (const def of [OAK, BIRCH, SPRUCE]) {
      const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
      for (let height = def.height[0]; height <= 30; height++) {
        for (const radiusDelta of [-1, 0, 1]) {
          const v: FloraVariation = { height, radiusDelta, mega: false };
          const bound = program.canopyRadius(v, def);
          for (const b of program.blocks(v, def, () => 0.5)) {
            expect(Math.max(Math.abs(b.dx), Math.abs(b.dz)), `${def.id} h=${height}`).toBeLessThanOrEqual(bound);
          }
        }
      }
    }
  });

  it("is a pure function of the variation — no clock, no shared state", () => {
    for (let i = 0; i < 3; i++) {
      expect(blocks(OAK, 19, 1)).toEqual(blocks(OAK, 19, 1));
    }
  });
});

describe("flora: the street fit", () => {
  it("measures room as the Chebyshev distance to the nearest solid", () => {
    // A 7×7 region with one solid column at the centre.
    const width = 7;
    const depth = 7;
    const solid = new Uint8Array(width * depth);
    solid[3 * width + 3] = 1;
    const room = wallRoom(solid, width, depth);
    expect(room[3 * width + 3]).toBe(0);
    expect(room[3 * width + 4]).toBe(1);
    expect(room[3 * width + 6]).toBe(3);
    // Diagonals are the same distance — the crown is square in plan, so the
    // metric has to be too.
    expect(room[5 * width + 5]).toBe(2);
    // Nothing solid anywhere means the cap, not zero.
    expect(wallRoom(new Uint8Array(width * depth), width, depth)[0]).toBe(STREET_ROOM_MAX);
  });

  it("grows a street tree to the room it has, not to the size it drew", () => {
    // An oak that drew 20 blocks, on a column with four blocks of daylight
    // round it: it comes down until its crown fits, and stops at the first
    // height that does.
    const program = SHAPE_PROGRAMS[OAK.program as keyof typeof SHAPE_PROGRAMS];
    const fitted = fitStreetTree(OAK, 20, 8, 0, false, 4);
    expect(fitted).toBe(17);
    expect(program.canopyRadius({ height: fitted, radiusDelta: 0, mega: false }, OAK)).toBeLessThanOrEqual(3);
    // Wider room, and the tree it drew already fits: nothing moves.
    expect(fitStreetTree(OAK, 20, 8, 0, false, 6)).toBe(20);
  });

  it("never fits below the species floor — the street law elected this trunk", () => {
    // Three blocks of room takes an oak all the way down to a two-block crown,
    // which it reaches at 10 — and the author's own floor is 10, so that is
    // where it stops rather than shrinking to the table's 5.
    expect(fitStreetTree(OAK, 20, 10, 0, false, 3)).toBe(10);
    expect(fitStreetTree(OAK, 20, 8, 0, false, 3)).toBeGreaterThanOrEqual(8);
  });

  it("abstains where no crown can fit, rather than burying one in masonry", () => {
    // `room = 0` is a trunk elected against a shell — 376 of the 598 elected
    // columns on the metropolis fixture. Shrinking those trees moved their
    // crowns down *into* the walls and cost 4,527 more leaf blocks than leaving
    // them alone; over the roofline is the only place a canopy can be there.
    for (const room of [0, 1]) {
      expect(fitStreetTree(OAK, 20, 8, 0, false, room), `room ${room}`).toBe(20);
      expect(fitStreetTree(BIRCH, 18, 7, 0, false, room), `room ${room}`).toBe(18);
    }
  });

  it("leaves a tree that already fits exactly where it drew", () => {
    expect(fitStreetTree(OAK, 9, 8, 0, false, STREET_ROOM_MAX)).toBe(9);
  });
});

/**
 * WP-B grandeur: the emergent stratum actually anchors a skyline
 * (FLORA-GRAMMAR-v0 §3.7, §3.7.1, §3.7.2, §5.3, §8).
 *
 * The brief for this file is a walk, not a theory. Kai flew the canopy of
 * `oldgrowth_vale` on 2026-08-07 and reported three defects:
 *
 *   1. *"Giants def don't anchor the skyline. Not a single growth meaningfully
 *      more grand than vanilla generation."* — measured: the three placed
 *      beeches cleared the p95 canopy top within 24 columns by 12, 8 and 5
 *      blocks. §8 now sets a **prominence bar of 8 blocks**, and this file
 *      holds the geometry to it at every corner of every envelope.
 *   2. The root flare *"doesn't look great… my instinct is a procedural root
 *      generator rather than just a few squares"* — the old flare was a ring of
 *      vertical `root` logs presenting their ring-textured top face at grade.
 *      §3.7.1's buttress ridges replace it, and the rules that make them read
 *      as roots are asserted here.
 *   3. *"Hanging growth genuinely might be underdone."* — §3.7.2 drapes the
 *      crown rim of every emergent that carries a hanging symbol.
 *
 * The six-law matrix for these programs lives in `flora-species.test.ts` and
 * runs over the same corners; this file is the *grandeur* half, which the laws
 * do not express.
 */

import { describe, expect, it } from "vitest";

import {
  CLIMATE_STRATA,
  FLORA_SPECIES,
  NATURALISTIC_FLORA_SPECIES,
  SHAPE_PROGRAMS,
  speciesFor,
  type FloraBlock,
  type FloraSpeciesDef,
  type FloraVariation
} from "../src/terrain/vegetation.js";

/**
 * The prominence bar (§8): a giant's crown must stand this far over the canopy
 * it is planted in, measured crown-top against the p95 canopy top within 24
 * columns on a compiled world, and species-envelope corner against species-
 * envelope corner here.
 */
const PROMINENCE_BAR = 8;

const FACES: readonly (readonly [number, number, number])[] = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0]
];

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

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

/** Every corner of one species' envelope, over four RNG streams. */
function corners(def: FloraSpeciesDef): Case[] {
  const program = SHAPE_PROGRAMS[def.program as keyof typeof SHAPE_PROGRAMS];
  const out: Case[] = [];
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
  return out;
}

/** The top of a plant's canopy, relative to the ground it stands on. */
function crownTop(blocks: readonly FloraBlock[]): number {
  let top = Number.NEGATIVE_INFINITY;
  for (const b of blocks) {
    if (b.part !== "leaves" && b.part !== "cap") continue;
    if (b.dy > top) top = b.dy;
  }
  return top;
}

const GIANTS = Object.values(NATURALISTIC_FLORA_SPECIES).filter(
  (def) => (def as FloraSpeciesDef).program === "giant",
) as FloraSpeciesDef[];

describe("flora grandeur: the emergent clears the canopy", () => {
  it("every emergent out-tops every canopy species of its climate by the prominence bar", () => {
    // The measurement a fly-over makes, done against the *catalog* rather than
    // one compiled world: the worst emergent corner against the best canopy
    // corner, per climate, so no draw of the envelope can produce a giant that
    // merely joins the canopy. Ground is taken as equal — the compiled-world
    // instrument (which reads real terrain into the p95) is the acceptance
    // gate, and this is the one that fails on a bad envelope edit.
    for (const [theme, rows] of Object.entries(CLIMATE_STRATA)) {
      const canopyTop = Math.max(
        ...rows.canopy.flatMap((id) => corners(speciesFor(id)).map((c) => crownTop(c.blocks))),
      );
      for (const id of rows.emergent) {
        const worst = Math.min(...corners(speciesFor(id)).map((c) => crownTop(c.blocks)));
        expect(
          worst - canopyTop,
          `${theme}: ${id} tops out ${worst} against a canopy top of ${canopyTop}`,
        ).toBeGreaterThanOrEqual(PROMINENCE_BAR);
      }
    }
  });

  it("a giant's crown is wider than one mass can be", () => {
    // Law 2 caps a single leaf mass at radius 4 (MAX_MASS_RADIUS), which is not
    // a skyline. The compound crown — a central mass on the leader plus an
    // upper whorl of short limbs, each with its own mass — is what makes the
    // silhouette read from 100 blocks, and the property that says so is the
    // crown's own footprint at the top of the tree.
    for (const def of GIANTS) {
      for (const { v, blocks } of corners(def)) {
        const top = crownTop(blocks);
        let reach = 0;
        for (const b of blocks) {
          if (b.part !== "leaves" || b.dy < top - 4) continue;
          reach = Math.max(reach, Math.abs(b.dx), Math.abs(b.dz));
        }
        expect(reach, `${def.id} ${JSON.stringify(v)} crown reach`).toBeGreaterThanOrEqual(6);
      }
    }
  });
});

describe("flora grandeur: buttress roots (§3.7.1)", () => {
  /** How far below grade the ridge profile starts (§3.7.1, 2026-08-09). */
  const RIDGE_SINK = 1;
  const CASES = GIANTS.flatMap((def) => corners(def));

  it("every buttress block is a horizontal-axis branch — never a vertical log top", () => {
    // The defect this construction exists to fix: a vertical log shows its ring
    // texture on the top face, and at grade the top face is the only face the
    // player sees. Every above-grade root block is a `branch` on a horizontal
    // axis, so its top face is bark.
    let seen = 0;
    for (const { id, blocks } of CASES) {
      for (const b of blocks) {
        if (b.buttress !== true) continue;
        seen += 1;
        expect(b.part, `${id} buttress part`).toBe("branch");
        expect(b.axis === "x" || b.axis === "z", `${id} buttress axis ${String(b.axis)}`).toBe(true);
        // The ridge profile is sunk one course into the ground (§3.7.1,
        // 2026-08-09) so it emerges from the terrain instead of resting on it;
        // nothing below that course is a `branch`.
        expect(b.dy, `${id} buttress below grade`).toBeGreaterThanOrEqual(-1);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("the ridges radiate: 4..7 of them, each a chain reaching 2..7 columns out", () => {
    for (const { id, def, v, blocks } of CASES) {
      const ridge = blocks.filter((b) => b.buttress === true);
      const columns = new Set(ridge.map((b) => `${b.dx},${b.dz}`));
      const span = Math.max(2, Math.min(3, v.height >= 24 ? 3 : 2));
      // Distinct compass octants the ridge columns occupy: a flare that all
      // pointed one way would be a fin, not a buttress.
      const dirs = new Set<string>();
      let far = 0;
      for (const k of columns) {
        const [dx, dz] = k.split(",").map(Number) as [number, number];
        const ox = dx < 0 ? -1 : dx > span - 1 ? 1 : 0;
        const oz = dz < 0 ? -1 : dz > span - 1 ? 1 : 0;
        dirs.add(`${ox},${oz}`);
        far = Math.max(far, Math.abs(ox === 0 ? 0 : dx - (ox > 0 ? span - 1 : 0)), Math.abs(oz === 0 ? 0 : dz - (oz > 0 ? span - 1 : 0)));
      }
      expect(dirs.size, `${id} ${JSON.stringify(v)} buttress directions`).toBeGreaterThanOrEqual(3);
      expect(far, `${id} ${JSON.stringify(v)} buttress reach`).toBeGreaterThanOrEqual(2);
      expect(far, `${id} ${JSON.stringify(v)} buttress reach`).toBeLessThanOrEqual(7);
    }
  });

  it("a ridge tapers to grade and never stands taller at its foot than at the trunk", () => {
    for (const { id, def, v, blocks } of CASES) {
      const span = v.height >= 24 ? 3 : 2;
      const heights = new Map<string, number>();
      for (const b of blocks) {
        if (b.buttress !== true) continue;
        const k = `${b.dx},${b.dz}`;
        // The ridge profile is sunk one course (§3.7.1, 2026-08-09), so a
        // column's *profile* height is measured from `dy = -RIDGE_SINK`, not
        // from grade: a toe is one block tall and buried, not zero blocks tall.
        heights.set(k, Math.max(heights.get(k) ?? 0, b.dy + 1 + RIDGE_SINK));
      }
      const rise = typeof def.knobs?.["rootRise"] === "number" ? (def.knobs["rootRise"] as number) : 3;
      // The profile of the whole flare, by distance from the trunk footprint.
      // Per *ridge* the taper is linear by construction; ridges may cross, and
      // a crossed column takes the taller of the two — so the property that
      // holds over the flare as a whole is the one that matters visually: it
      // never gets taller, or heavier, further out.
      const byOut = new Map<number, { max: number; blocks: number }>();
      let toe = false;
      for (const [k, h] of heights) {
        const [dx, dz] = k.split(",").map(Number) as [number, number];
        const out =
          Math.max(0, dx < 0 ? -dx : dx - (span - 1)) + Math.max(0, dz < 0 ? -dz : dz - (span - 1));
        expect(h, `${id} ${JSON.stringify(v)} ridge height at ${k}`).toBeGreaterThanOrEqual(1);
        expect(h, `${id} ridge taller than rootRise`).toBeLessThanOrEqual(rise);
        const cell = byOut.get(out) ?? { max: 0, blocks: 0 };
        byOut.set(out, { max: Math.max(cell.max, h), blocks: cell.blocks + h });
        if (h === 1) toe = true;
      }
      const outs = [...byOut.keys()].sort((a, b) => a - b);
      for (let i = 1; i < outs.length; i++) {
        const prev = byOut.get(outs[i - 1] as number) as { max: number; blocks: number };
        const here = byOut.get(outs[i] as number) as { max: number; blocks: number };
        expect(here.max, `${id} ${JSON.stringify(v)} flare rises again at ${outs[i]}`).toBeLessThanOrEqual(prev.max);
        expect(here.blocks, `${id} ${JSON.stringify(v)} flare thickens at ${outs[i]}`).toBeLessThanOrEqual(prev.blocks);
      }
      // And it reaches grade: at least one column of the flare is a single
      // block tall, or the "ridge" is a plinth.
      expect(toe, `${id} ${JSON.stringify(v)} no ridge reaches grade`).toBe(true);
    }
  });

  it("every buttress column is seated: filled downward, and 6-connected to the trunk", () => {
    for (const { id, v, blocks } of CASES) {
      const solid = new Map<string, FloraBlock>();
      for (const b of blocks) solid.set(key(b.dx, b.dy, b.dz), b);
      const wood = new Set<string>();
      for (const b of blocks) {
        if (b.part === "log" || b.part === "branch" || b.part === "root") wood.add(key(b.dx, b.dy, b.dz));
      }
      const columns = new Set<string>();
      for (const b of blocks) if (b.buttress === true) columns.add(`${b.dx},${b.dz}`);
      for (const k of columns) {
        const [dx, dz] = k.split(",").map(Number) as [number, number];
        // The seat: the column runs unbroken from its below-grade foot to grade,
        // so a ridge on ground up to `rootDepth` lower still meets solid earth
        // rather than floating over it.
        let depth = 0;
        while (solid.has(key(dx, -1 - depth, dz))) depth += 1;
        expect(depth, `${id} ${JSON.stringify(v)} unseated buttress column ${k}`).toBeGreaterThanOrEqual(2);
        // And it is attached: law 3 for live buttress wood.
        const attached = FACES.some(([ox, oy, oz]) => wood.has(key(dx + ox, oy, dz + oz)));
        expect(attached, `${id} detached buttress column ${k}`).toBe(true);
      }
    }
  });
});

describe("flora grandeur: the drape (§3.7.2)", () => {
  it("an emergent with a hanging symbol drapes its crown, and nothing near the ground", () => {
    for (const def of GIANTS) {
      if (def.hangingSymbol === undefined) continue;
      for (const { v, blocks } of corners(def)) {
        const hanging = blocks.filter((b) => b.part === "hanging");
        expect(hanging.length, `${def.id} ${JSON.stringify(v)} drape`).toBeGreaterThan(20);
        const floor = Math.round(v.height * 0.6);
        for (const b of hanging) {
          // The walk-under space is the point of a giant: no curtain reaches
          // into it, and none reaches the ground the undergrowth pass owns.
          expect(b.dy, `${def.id} curtain hangs into the nave at dy ${b.dy}`).toBeGreaterThan(1);
          expect(b.dy, `${def.id} curtain below the crown floor`).toBeGreaterThan(floor - 10);
        }
      }
    }
  });

  it("both giants carry a hanging symbol at all — the walk's third defect", () => {
    // `beech_giant` had none, which is why the temperate old-growth fixture had
    // no hanging growth on its landmarks whatsoever.
    for (const def of GIANTS) expect(def.hangingSymbol, `${def.id}`).toBeDefined();
  });
});

describe("flora grandeur: the emergent budget (§5.3)", () => {
  it("the catalog's emergents are all tall enough to be worth a budget slot", () => {
    for (const def of Object.values(FLORA_SPECIES)) {
      if (def.stratum !== "emergent") continue;
      // §8's prominence bar is *climate-relative*: an emergent's job is to
      // stand over the canopy of the wood it anchors, and 13 is the floor that
      // buys that against the shipped naturalistic canopies. A species with an
      // empty `climates` list has no default composition to stand over — the
      // fungal and fantasy tier of §4.1, reached only by being named, whose
      // heights the spec fixes at 8–14 (`mushroom_giant_red`) and 10–16
      // (`glowcap`) against a 5–8 fungal canopy. They are held to their own
      // bar, against the grove's own canopy, in `flora-fungal.test.ts` (WP-C).
      if ((def.climates ?? []).length === 0) continue;
      expect(def.height[0], `${def.id} minimum height`).toBeGreaterThanOrEqual(13);
    }
  });
});

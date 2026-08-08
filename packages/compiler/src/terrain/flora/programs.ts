/**
 * `SHAPE_PROGRAMS` — the closed vocabulary of shape programs (§3).
 *
 * WP-A carries the two transcribed legacy programs, `conifer` and `blob`.
 * Their block lists are **list-identical** to the closures `vegetation.ts`
 * used to hold: the same array, element for element, duplicates and order
 * included. That is not pedantry — `clipTrees` computes `hit / blocks.length`
 * against `MAX_CLIP_FRACTION`, so de-duplicating a list changes which trees are
 * dropped near a structure, and today's conifer genuinely emits duplicates (the
 * `dy = height` layer writes the trunk columns once in the ring loop and again
 * in the cap loop).
 *
 * Neither program calls its RNG; `flora-programs.test.ts` asserts that with a
 * counting proxy.
 */

import { NATURALISTIC_PROGRAMS } from "./naturalistic.js";
import { knob, type FloraBlock, type FloraProgram, type FloraSpeciesDef, type FloraVariation } from "./types.js";

function isTrunk(trunk: readonly (readonly [number, number])[], dx: number, dz: number): boolean {
  for (const [tx, tz] of trunk) if (tx === dx && tz === dz) return true;
  return false;
}

/**
 * The whorled conifer: canopy radius grows downward from the tip in half-block
 * steps and dips every third layer, which is what makes a spruce read as a
 * spruce rather than as a christmas-tree cone.
 *
 * The final per-column cap loop is law 1 for **all four** mega columns: capping
 * only `(0, 0)` left three bare masts, 262 of them in one 320² world.
 */
export const conifer: FloraProgram = {
  id: "conifer",
  canopyRadius(v: FloraVariation, def: FloraSpeciesDef): number {
    return Math.max(1, knob(def, "spread", 2) + v.radiusDelta + (v.mega ? 2 : 0));
  },
  blocks(v: FloraVariation, def: FloraSpeciesDef): FloraBlock[] {
    const spread = knob(def, "spread", 2);
    const { height, radiusDelta, mega } = v;
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
          if (isTrunk(trunk, dx, dz) && dy < height) continue;
          const qx = mega ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
          const qz = mega ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
          if (qx * qx + qz * qz > r * r + r) continue;
          out.push({ dx, dy, dz, part: "leaves" });
        }
      }
    }
    for (const [tx, tz] of trunk) out.push({ dx: tx, dy: height, dz: tz, part: "leaves" });
    return out;
  },
};

/**
 * A squashed ellipsoid seated on the trunk top.
 *
 * Law 1 is protected by construction rather than by a cap block: `ry ≥ 1`, so
 * the ellipsoid's top layer sits above the last log, and the
 * `dx==0 && dz==0 && dy < height` guard lets the trunk column take leaves at and
 * above `height`. The `1.15` rather than `1` is what stops the equator reading
 * as a faceted disc.
 *
 * Three knobs, all no-ops at their defaults, exist because the crown law above
 * is *tied to the trunk top* and therefore says nothing about how far down the
 * trunk the crown reaches. With `squash ≤ 1` a tall species gets a fixed squat
 * disc over an ever-longer bare pole — the comic birch Kai walked on
 * 2026-08-08 (h=9 birch: seven bare white blocks under a four-layer puck):
 *
 * - `crownMin` — a floor under `ry`, so the narrow (`radiusDelta = -1`) draw
 *   is a slim column of leaves rather than a five-block tuft.
 * - `crownDrop` — lowers the crown centre by up to `ry - 2` blocks, which is
 *   exactly the clamp that keeps the crown top at or above `height + 1` and so
 *   keeps law 1 true by construction for every drop.
 * - `bareShare` — the fraction of the trunk that stays bare; the crown is
 *   clipped below `floor(bareShare · height)`, so a short tree does not turn
 *   into a bush when the drop reaches the ground.
 */
export const blob: FloraProgram = {
  id: "blob",
  canopyRadius(v: FloraVariation, def: FloraSpeciesDef): number {
    return Math.max(1, knob(def, "radius", 2) + v.radiusDelta);
  },
  blocks(v: FloraVariation, def: FloraSpeciesDef): FloraBlock[] {
    const radius = knob(def, "radius", 2);
    const squash = knob(def, "squash", 1);
    const crownMin = knob(def, "crownMin", 1);
    const crownDrop = knob(def, "crownDrop", 0);
    const bareShare = knob(def, "bareShare", 0);
    const { height, radiusDelta } = v;
    const out: FloraBlock[] = [];
    for (let dy = 0; dy < height; dy++) out.push({ dx: 0, dy, dz: 0, part: "log" });
    const r = Math.max(1, radius + radiusDelta);
    const ry = Math.max(1, crownMin, Math.round(r * squash));
    // `ry - 2` is the law-1 clamp: it holds `cy + ry ≥ height + 1`, so the
    // crown's top layer always sits above the last log whatever the drop asks.
    const cy = height - 1 - Math.max(0, Math.min(crownDrop, ry - 2));
    const floorY = Math.floor(bareShare * height);
    for (let dy = Math.max(cy - ry, floorY); dy <= cy + ry; dy++) {
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
  },
};

/** The closed registry of shape programs. */
export const SHAPE_PROGRAMS = Object.freeze({
  conifer,
  blob,
  ...NATURALISTIC_PROGRAMS,
} satisfies Readonly<Record<string, FloraProgram>>);

/** A program name the registry knows. */
export type ShapeProgramId = keyof typeof SHAPE_PROGRAMS;

/**
 * The species the four legacy `TreeShape` names resolve to.
 *
 * Their knobs are exactly the closure arguments `vegetation.ts` used to pass,
 * which is what makes the re-expression list-identical.
 */
export const LEGACY_FLORA_SPECIES = Object.freeze({
  spruce_tall: {
    id: "spruce_tall",
    program: "conifer",
    height: [8, 13],
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.spruce_leaves",
    knobs: { spread: 2 },
    megaShare: 0.03,
  },
  spruce_squat: {
    id: "spruce_squat",
    program: "conifer",
    height: [5, 7],
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.spruce_leaves",
    knobs: { spread: 3 },
  },
  oak_round: {
    id: "oak_round",
    program: "blob",
    height: [5, 7],
    trunkSymbol: "wood.oak_log",
    leafSymbol: "wood.oak_leaves",
    knobs: { radius: 2, squash: 1 },
  },
  birch_slim: {
    id: "birch_slim",
    program: "blob",
    height: [6, 9],
    trunkSymbol: "wood.birch_log",
    leafSymbol: "wood.birch_leaves",
    // Reproportioned 2026-08-08 (Kai's walk-4 decision, FLORA-GRAMMAR §3.5):
    // `squash: 0.75` gave every birch a four-layer puck on top of a 6–7 block
    // bare pole, and at `spacing 3` half of all birches stood three blocks from
    // another, so the pucks merged into one blob over a picket of white poles.
    // The crown now stands 6–8 layers tall and is dropped onto the upper half
    // of the trunk; `minSpacing` keeps two crowns from fusing (see
    // `vegetation.ts`, `speciesSpacing`).
    knobs: { radius: 2, squash: 1.4, crownMin: 3, crownDrop: 1, bareShare: 0.4, minSpacing: 5 },
  },
} satisfies Readonly<Record<string, FloraSpeciesDef>>);

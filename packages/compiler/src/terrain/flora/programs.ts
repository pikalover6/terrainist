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

import { fungal } from "./fungal.js";
import { NATURALISTIC_PROGRAMS } from "./naturalistic.js";
import {
  knob,
  overgrowth,
  type FloraBlock,
  type FloraProgram,
  type FloraSpeciesDef,
  type FloraVariation,
} from "./types.js";

/**
 * Default allometry, for a species that names none (FLORA-GRAMMAR §3.13).
 *
 * `crownGrowth` / `spreadGrowth` are the exponent the crown's **radius** grows
 * by against {@link overgrowth}: half-power, so doubling a tree's height widens
 * its crown by ~40 percent rather than doubling it — a tall tree is taller than
 * it is wide, which is the thing a pole with a puck on it failed to be in the
 * other direction. `crownShare` is the crown's **half-depth** as a share of the
 * trunk, and it is the clause that actually kills the mullet: at 0.30 the crown
 * clothes the top ~60 percent of the trunk however tall the trunk is.
 */
export const CROWN_GROWTH = 0.5;
/** @see CROWN_GROWTH */
export const CROWN_SHARE = 0.3;

/**
 * The taxicab reach law 2 allows a canopy block from the nearest wood
 * (FLORA-GRAMMAR §3.3, and the frozen exception list in `flora-programs.test.ts`).
 */
export const LAW2_REACH = 5;

/**
 * The crown radius of a `blob`, allometry included.
 *
 * Shared by `canopyRadius` and `blocks` because the clip's pre-rejection, the
 * shade map and the emitted geometry must agree to the block about how far a
 * crown reaches.
 */
function blobRadius(v: FloraVariation, def: FloraSpeciesDef): number {
  const grown = overgrowth(v, def);
  const radius = knob(def, "radius", 2);
  return Math.max(1, Math.round(radius * grown ** knob(def, "crownGrowth", CROWN_GROWTH)) + v.radiusDelta);
}

function isTrunk(trunk: readonly (readonly [number, number])[], dx: number, dz: number): boolean {
  for (const [tx, tz] of trunk) if (tx === dx && tz === dz) return true;
  return false;
}

/**
 * A conifer's whorl radius, allometry included.
 *
 * A conifer already lengthens its cone with the trunk — the canopy starts at
 * `0.35 · height` — so only the width needs the law, and it wants less of it
 * than a broadleaf does: a spruce twice its table height is a *spire*, not a
 * ball. Hence the lower default exponent.
 */
function coniferSpread(v: FloraVariation, def: FloraSpeciesDef): number {
  const grown = overgrowth(v, def);
  const spread = knob(def, "spread", 2);
  return Math.max(1, Math.round(spread * grown ** knob(def, "spreadGrowth", CROWN_GROWTH * 0.8)));
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
    return Math.max(1, coniferSpread(v, def) + v.radiusDelta + (v.mega ? 2 : 0));
  },
  blocks(v: FloraVariation, def: FloraSpeciesDef): FloraBlock[] {
    const grown = overgrowth(v, def);
    const spread = coniferSpread(v, def);
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
          // Law 2 on a grown whorl, for the reason `blob` cuts its corners: a
          // conifer's only wood is its axis, and past `r = 3` the whorl's own
          // slack reaches taxicab 6. Guarded on `grown` so the four enumerated
          // mega-spruce exceptions — which are inside the envelope and
          // therefore byte-identical geometry — keep their blocks.
          if (grown > 1 && qx + qz + Math.max(0, dy - (height - 1)) > LAW2_REACH) continue;
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
    return blobRadius(v, def);
  },
  blocks(v: FloraVariation, def: FloraSpeciesDef): FloraBlock[] {
    const squash = knob(def, "squash", 1);
    const crownMin = knob(def, "crownMin", 1);
    const crownDrop = knob(def, "crownDrop", 0);
    const bareShare = knob(def, "bareShare", 0);
    const { height } = v;
    const out: FloraBlock[] = [];
    for (let dy = 0; dy < height; dy++) out.push({ dx: 0, dy, dz: 0, part: "log" });
    const grown = overgrowth(v, def);
    const r = blobRadius(v, def);
    // Allometry (2026-08-10). Inside the envelope `grown` is exactly 1 and both
    // lines below are the arithmetic they have always been. Above it the crown
    // takes a share of the *trunk* for its half-depth and is dropped as far as
    // law 1 allows, so its top layer still sits one block above the last log
    // (`cy + ry = height + 1`, the very clamp `crownDrop` is bounded by) and its
    // bottom reaches down to `height + 1 - 2·ry` — the top ~60 percent of the
    // trunk at the default share, whatever the trunk.
    const ry = Math.max(
      1,
      crownMin,
      Math.round(r * squash),
      grown > 1 ? Math.round(height * knob(def, "crownShare", CROWN_SHARE)) : 0,
    );
    // `ry - 2` is the law-1 clamp: it holds `cy + ry ≥ height + 1`, so the
    // crown's top layer always sits above the last log whatever the drop asks.
    const cy = grown > 1 ? height + 1 - ry : height - 1 - Math.max(0, Math.min(crownDrop, ry - 2));
    const floorY = Math.floor(bareShare * height);
    for (let dy = Math.max(cy - ry, floorY); dy <= cy + ry; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dz === 0 && dy < height) continue;
          const vy = (dy - cy) / ry;
          if ((dx * dx + dz * dz) / (r * r) + vy * vy > 1.15) continue;
          // Law 2, at the source. A `blob` carries no limbs — the only wood it
          // has is the trunk column — so a leaf's distance from wood is just
          // its own offset, and a grown crown is the first one wide enough to
          // break the bound: at `r = 4` the ellipsoid's slack admits the
          // `(±3, ±3)` corners at taxicab 6. Cutting the corners is both the
          // law and the better silhouette (a rounded crown, not a faceted
          // barrel); inside the envelope `r ≤ 3` and the test never fires,
          // which is why the legacy geometry is untouched.
          if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - (height - 1)) > LAW2_REACH) continue;
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
  fungal,
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
    // `spreadGrowth` above the conifer default: a squat spruce asked to stand
    // tall is the one legacy shape whose *job* is to be broad at the bottom, so
    // it keeps its skirt as it grows rather than drawing itself out into a mast.
    knobs: { spread: 3, spreadGrowth: 0.55 },
  },
  oak_round: {
    id: "oak_round",
    program: "blob",
    height: [5, 7],
    trunkSymbol: "wood.oak_log",
    leafSymbol: "wood.oak_leaves",
    // The round one. Above its envelope it widens fastest of the four
    // (`crownGrowth` over the 0.5 default) and carries a deep crown, so a tall
    // oak reads as a dome on a bare bole — never the same outline as the birch
    // standing beside it at the same height, which was the whole complaint.
    knobs: { radius: 2, squash: 1, crownGrowth: 0.6, crownShare: 0.3 },
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
    // `crownGrowth` *below* the default and `crownShare` above it: the birch
    // stays the slim one at every size. A 12-block city birch gets a two-block-
    // wide, nine-layer column of leaves where the oak beside it gets a
    // three-block dome — same height, two silhouettes, which is §4.1's
    // "distinguishable at 60 blocks" bar applied to a height the table never
    // anticipated.
    knobs: {
      radius: 2,
      squash: 1.4,
      crownMin: 3,
      crownDrop: 1,
      bareShare: 0.4,
      minSpacing: 5,
      crownGrowth: 0.35,
      crownShare: 0.36,
    },
  },
} satisfies Readonly<Record<string, FloraSpeciesDef>>);

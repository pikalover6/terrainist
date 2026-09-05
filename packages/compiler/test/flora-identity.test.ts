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
  type FloraVariation
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
          [1, 1]
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

/* -------------------------------------------------------------------------- */
/* The one deliberate re-baseline                                              */
/* -------------------------------------------------------------------------- */

/**
 * **`birch_slim` was re-baselined on 2026-08-08, by Kai's decision, and every
 * shipped world with birches in it moved once.**
 *
 * The old reference is still right there (`legacyBlob(2, 0.75)`), and the test
 * below asserts the new geometry *differs* from it — the movement is the point,
 * not an accident. Kai's walk-4 of the old-growth fixture: birches read as
 * comic — one white pole after another under a single merged blob of leaves.
 * The proven diagnosis was two-part and both parts are fixed here:
 *
 * 1. **Proportion.** `blob` seats its crown at `cy = height - 1` with
 *    `ry = round(r · squash)`, so `squash 0.75` capped the crown at four to
 *    five layers *whatever the trunk* — a h=9 birch was six or seven bare logs
 *    under a puck. The species now asks for a taller crown (`squash 1.4`,
 *    `crownMin 3`) dropped onto the upper half of the trunk (`crownDrop 1`)
 *    with a bare-trunk floor (`bareShare 0.4`) so a h=6 birch does not become a
 *    bush. The trunk is still one column and heights are still 6–9.
 * 2. **Spacing.** `minSpacing 5` — see `vegetation.ts`'s `speciesSpacing`.
 *
 * The other three legacy shapes are untouched and stay list-identical; the test
 * that asserts so is the reason this file exists. `oak_round` shares the blob
 * law and was measured at the same time: at its tallest (h=7) it stands four
 * bare logs under a five-layer crown — a ratio of 0.8, never the birch's 1.5 —
 * so it keeps its geometry and its byte-identity.
 */
function reproportionedBlob(
  radius: number,
  squash: number,
  crownMin: number,
  crownDrop: number,
  bareShare: number,
): (v: FloraVariation) => FloraBlock[] {
  return ({ height, radiusDelta }) => {
    const out: FloraBlock[] = [];
    for (let dy = 0; dy < height; dy++) out.push({ dx: 0, dy, dz: 0, part: "log" });
    const r = Math.max(1, radius + radiusDelta);
    const ry = Math.max(1, crownMin, Math.round(r * squash));
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
  };
}

const LEGACY_CLOSURES: Readonly<Record<string, (v: FloraVariation) => FloraBlock[]>> = {
  spruce_tall: legacyConifer(2),
  spruce_squat: legacyConifer(3),
  oak_round: legacyBlob(2, 1),
  birch_slim: reproportionedBlob(2, 1.4, 3, 1, 0.4)
};

/** The pre-2026-08-08 birch, kept so the re-baseline stays visible forever. */
const PRE_REPROPORTION_BIRCH = legacyBlob(2, 0.75);

/**
 * The envelope corners (§3.3), plus the `+4` a mega spruce's height carries in
 * `scatterOne` — the geometry a real world actually contains.
 *
 * **Every corner here is *inside* its species' envelope**, `mega` included: the
 * `+4` is only ever paired with `mega: true`, because that is the only way a
 * scatter produces it. That pairing is what the 2026-08-10 allometry law
 * (`overgrowth`) turns on, and the identity below is now a statement about the
 * envelope rather than about all heights — see
 * {@link overgrownCorners} for the other side of the line.
 */
function corners(def: FloraSpeciesDef): FloraVariation[] {
  const [lo, hi] = def.height;
  const out: FloraVariation[] = [];
  for (const mega of [false, true]) {
    for (const radiusDelta of [-1, 0, 1]) {
      for (const height of mega ? [lo, hi, lo + 4, hi + 4] : [lo, hi]) {
        out.push({ height, radiusDelta, mega });
      }
    }
  }
  return out;
}

/**
 * The corners **above** the envelope — what an author's `minHeight`/`maxHeight`
 * override produces, and the only place the geometry has moved.
 */
function overgrownCorners(def: FloraSpeciesDef): FloraVariation[] {
  const hi = def.height[1];
  const out: FloraVariation[] = [];
  for (const radiusDelta of [-1, 0, 1]) {
    for (const height of [hi + 4, hi + 8, hi * 3]) out.push({ height, radiusDelta, mega: false });
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

  it("birch_slim, and only birch_slim, moved off its pre-2026-08-08 geometry", () => {
    const birch = LEGACY_FLORA_SPECIES.birch_slim as FloraSpeciesDef;
    const program = SHAPE_PROGRAMS[birch.program as keyof typeof SHAPE_PROGRAMS];
    let moved = 0;
    for (const v of corners(birch)) {
      const before = PRE_REPROPORTION_BIRCH(v);
      const after = program.blocks(v, birch, noRng);
      if (JSON.stringify(before) !== JSON.stringify(after)) moved += 1;
      // The crown must clothe the trunk, not perch on it: at the middle draw
      // the lowest leaf sits at or below the trunk's midpoint.
      // Only over the species' real envelope: `corners` also probes the `+4`
      // a mega spruce carries, and birch has no `megaShare`.
      if (v.radiusDelta >= 0 && v.height <= birch.height[1]) {
        const lowest = Math.min(...after.filter((b) => b.part === "leaves").map((b) => b.dy));
        expect(lowest, `birch ${JSON.stringify(v)} crown base`).toBeLessThanOrEqual(
          Math.ceil(v.height * 0.6),
        );
      }
    }
    // Every corner but the ones the clamps neutralise actually moved.
    expect(moved).toBeGreaterThan(corners(birch).length / 2);
    // The other three keep the knobs that decide their geometry *inside* the
    // envelope. The allometry knobs added on 2026-08-10 are listed apart
    // because they are provably inert there — `overgrowth` returns exactly 1 —
    // and the identity test above is what proves it.
    const shape: Readonly<Record<string, Record<string, number>>> = {
      spruce_tall: { spread: 2 },
      spruce_squat: { spread: 3 },
      oak_round: { radius: 2, squash: 1 }
    };
    const allometry: Readonly<Record<string, Record<string, number>>> = {
      spruce_tall: {},
      spruce_squat: { spreadGrowth: 0.55 },
      oak_round: { crownGrowth: 0.6, crownShare: 0.3 }
    };
    for (const id of ["spruce_tall", "spruce_squat", "oak_round"]) {
      const def = LEGACY_FLORA_SPECIES[id as keyof typeof LEGACY_FLORA_SPECIES] as FloraSpeciesDef;
      expect(def.knobs, `${id} knobs`).toEqual({
        ...(shape[id] as Record<string, number>),
        ...(allometry[id] as Record<string, number>)
      });
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

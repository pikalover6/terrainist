/**
 * `PadEdit.apronBySide` reaches the kernel — the layout half of Wave 8C.
 *
 * `applyPadEdits` is the one bridge from the layout stage's `PadEdit` to the
 * stdlib's `LevelPad`, so the field is only useful if the bridge carries it.
 * Two things are pinned: a pad that names per-side aprons composes exactly as
 * the equivalent `applyLevelPad` call would, and a pad that does not name them
 * composes exactly as it did before the field existed — which is every pad the
 * compiler emits today, and is why the wave is byte-identical.
 */

import { describe, expect, it } from "vitest";

import { applyLevelPad, HeightField } from "@terrainist/stdlib";
import type { Region } from "@terrainist/stdlib";

import { applyPadEdits } from "../src/layout/index.js";
import type { PadEdit } from "../src/layout/types.js";

const REGION: Region = { x0: -64, z0: -64, width: 128, depth: 128 };

/** A hillside, so an apron has a real step to absorb on the x faces. */
function hillside(): HeightField {
  const values = new Float64Array(REGION.width * REGION.depth);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      values[j * REGION.width + i] = 70 + (REGION.x0 + i) / 2;
    }
  }
  return new HeightField(REGION, values);
}

const FOOTPRINT = { x0: -20, z0: -20, x1: 20, z1: 20 } as const;
const BASE: PadEdit = {
  nodePath: "world.lot",
  footprint: FOOTPRINT,
  targetY: 70,
  apron: 4,
  adaptiveApron: true,
};

describe("applyPadEdits — apronBySide", () => {
  it("hands a per-side pad through to the kernel unchanged", () => {
    const viaEdit = hillside();
    const viaKernel = hillside();
    const apronBySide = { north: 0, east: 6, south: 2 } as const;
    applyPadEdits(viaEdit, [{ ...BASE, apronBySide }]);
    applyLevelPad(viaKernel, {
      ...FOOTPRINT,
      targetY: 70,
      apron: 4,
      adaptiveApron: true,
      apronBySide,
    });
    expect([...viaEdit.values]).toEqual([...viaKernel.values]);
  });

  it("gives the street face no apron while the other three keep theirs", () => {
    // The shape the frontage tie asks for (F7): 0 on the face the lot fronts,
    // adaptive elsewhere.
    const tied = hillside();
    applyPadEdits(tied, [{ ...BASE, apronBySide: { east: 0 } }]);
    const at = (x: number, z: number): number =>
      tied.values[(z - REGION.z0) * REGION.width + (x - REGION.x0)] as number;
    expect(at(FOOTPRINT.x1 + 1, 0)).toBeCloseTo(70 + (FOOTPRINT.x1 + 1) / 2, 9);
    expect(at(FOOTPRINT.x0 - 1, 0)).not.toBeCloseTo(70 + (FOOTPRINT.x0 - 1) / 2, 9);
  });

  it("composes a pad that omits the field exactly as it did before it existed", () => {
    const omitted = hillside();
    const scalar = hillside();
    applyPadEdits(omitted, [BASE]);
    applyLevelPad(scalar, { ...FOOTPRINT, targetY: 70, apron: 4, adaptiveApron: true });
    expect([...omitted.values]).toEqual([...scalar.values]);
  });
});

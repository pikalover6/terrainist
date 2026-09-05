/**
 * **§3.3's G6 amendment, asserted** — :
 *
 * > **Resolution (a): the transition generator is part of the fifth resolve.**
 *
 * Four properties, and each is one the G6 partial landing measured the absence
 * of: that the generator is *off* unless asked (byte-identity is the whole of the
 * flag-off state), that a fill edge with room beside it comes back with the ramp
 * already in the ground and the ring columns owned by `verge`, that the geometry
 * is arbitrated by the precedence table rather than by a guard list (a street
 * beside the drop keeps its level), and that the answer is a pure function of its
 * inputs.
 */

import { describe, expect, it } from "vitest";

import type { GroundBaseline, GroundClaim, GroundIntent } from "../src/layout/ground-contract.js";
import { resolveGround } from "../src/layout/ground-resolver.js";

const W = 40;
const D = 24;
const idx = (x: number, z: number): number => z * W + x;

const baselineAt = (y: number): GroundBaseline => ({
  region: { x0: 0, z0: 0, width: W, depth: D },
  ground: new Int32Array(W * D).fill(y),
  fluidTop: new Int32Array(W * D).fill(y),
  fluidKind: new Uint8Array(W * D),
  seaLevel: 62
});

/** A plateau eight blocks up over the left third of the field. */
const plateau = (): GroundIntent => {
  const columns: GroundClaim[] = [];
  for (let z = 0; z < D; z++) for (let x = 0; x < 10; x++) columns.push({ idx: idx(x, z), y: 72 });
  return {
    source: "world.town.high#plane",
    sourceClass: "quarter.plane",
    kind: "platform",
    columns,
    transition: "ramp"
  };
};

describe("the transition generator (§3.3's G6 amendment)", () => {
  it("does nothing at all unless the resolve is asked to generate", () => {
    const plain = resolveGround(baselineAt(64), [plateau()]);
    expect(plain.seams).toBeUndefined();
    expect(plain.intents).toHaveLength(1);
    // Every column beyond the plateau is still the baseline's.
    for (let z = 0; z < D; z++) expect(plain.ground[idx(20, z)]).toBe(64);
  });

  it("materialises the ramp into the resolved field, owned by `verge`", () => {
    const shaped = resolveGround(baselineAt(64), [plateau()], { generate: true });
    expect(shaped.seams).toBeDefined();
    // The generator files its geometry as claims, so the effective set is longer
    // than the declared one and `owner` indexes the longer list.
    expect(shaped.intents.length).toBeGreaterThan(1);
    const generated = shaped.intents.slice(1);
    expect(generated.every((it) => it.sourceClass === "verge" || it.sourceClass === "retaining.skirt")).toBe(true);

    // The column immediately beyond the plateau's edge is no longer the
    // baseline's: the ramp starts there, and it is a `verge` that owns it.
    const first = idx(10, D >> 1);
    expect(shaped.ground[first]).toBeGreaterThan(64);
    expect(shaped.ground[first]).toBeLessThanOrEqual(72);
    const owner = shaped.owner[first] as number;
    expect(owner).toBeGreaterThanOrEqual(0);
    expect((shaped.intents[owner] as GroundIntent).sourceClass).toBe("verge");

    // …and it falls away from the plateau, never towards it.
    let previous = shaped.ground[first] as number;
    // `bankRun(8)` is sixteen columns at 1:2, so the ramp is down by x = 26.
    for (let x = 11; x < 30; x++) {
      const y = shaped.ground[idx(x, D >> 1)] as number;
      expect(y).toBeLessThanOrEqual(previous);
      previous = y;
    }
    expect(previous).toBe(64);
  });

  it("shapes only columns no higher-ranked claim owns", () => {
    const road: GroundClaim[] = [];
    for (let z = 0; z < D; z++) road.push({ idx: idx(11, z), y: 64 });
    const shaped = resolveGround(
      baselineAt(64),
      [
        plateau(),
        {
          source: "world.town.lane#carriageway",
          sourceClass: "street.network",
          kind: "profile",
          columns: road,
          transition: "step"
        }
      ],
      { generate: true },
    );
    // The lane is rank 80 and the ramp is rank 140: the street keeps its level,
    // and it keeps it because of the table and not because of a mask.
    for (let z = 0; z < D; z++) expect(shaped.ground[idx(11, z)]).toBe(64);
  });

  it("is a pure function of its arguments", () => {
    const a = resolveGround(baselineAt(64), [plateau()], { generate: true });
    const b = resolveGround(baselineAt(64), [plateau()], { generate: true });
    expect([...a.ground]).toEqual([...b.ground]);
    expect([...a.owner]).toEqual([...b.owner]);
    expect(a.intents.map((i) => i.source)).toEqual(b.intents.map((i) => i.source));
  });
});

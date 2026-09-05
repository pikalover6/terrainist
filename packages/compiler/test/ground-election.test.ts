/**
 * **The relief election** — a quarter that named no ground gets the ground its
 * site actually has.
 *
 * The complaint this answers is "terrain is still jarring how there are 100%
 * flat planes cobbled in with normal terrain". Making a pad's apron adaptive
 * softened the *edge* of the plane; it did not stop the plane being a plane. A
 * district on real relief should not be one plane at all — it should derive
 * platforms and step down the slope in storeys, which is machinery that has
 * existed since Phase 4.2 and until now only ran when a document asked for it
 * by name.
 *
 * The election sits at the bottom of the precedence — below `params.ground`,
 * below `intent.character.ground`, and refining only the *form's* implication —
 * so it can turn `"pad"` into `"stepped"` and can do nothing else. That is what
 * makes it impossible for it to fight `hillside`, which resolves `"stepped"`
 * before the election is ever consulted.
 *
 * Two halves are asserted here and both matter:
 *
 * - **below the threshold nothing moves at all**, which is the byte-identity
 *   law and is also asserted by `village.test.ts`, `intent-identity.test.ts`
 *   and `city.test.ts` compiling unchanged;
 * - **the two call sites cannot disagree.** The policy is elected once before
 *   the solve lays a pad (`padFor`) and once inside the fabric pass, and the
 *   field is the shared state that keeps them honest — elect `"stepped"` and no
 *   pad is laid, so the pass measures the same natural relief; elect `"pad"`
 *   and the pad flattens the footprint, so the pass measures nothing.
 */

import { describe, expect, it } from "vitest";

import { HeightField, type Region } from "@terrainist/stdlib";
import type { DistrictNode, SettlementDocument } from "@terrainist/spec/ir";

import { installFanOutRows } from "../src/intent/index.js";
import {
  STEP_RELIEF,
  districtGroundElectable,
  districtGroundPolicy,
  reliefOf
} from "../src/layout/district.js";
import { padFor } from "../src/layout/solve.js";
import type { LayoutNodeInput, Placement } from "../src/layout/types.js";

const REGION: Region = { x0: 0, z0: 0, width: 64, depth: 64 };
const FOOTPRINT = { x0: 4, z0: 4, x1: 59, z1: 59 };

/** A field that ramps `relief` blocks from one edge of the footprint to the other. */
function ramp(relief: number): HeightField {
  const field = new HeightField({ ...REGION });
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      // Ramped across the *footprint*, so `reliefOf` over it is exactly
      // `relief` and the threshold assertions below mean what they say.
      const t = Math.min(FOOTPRINT.z1, Math.max(FOOTPRINT.z0, j)) - FOOTPRINT.z0;
      field.values[j * REGION.width + i] =
        70 + Math.round((relief * t) / (FOOTPRINT.z1 - FOOTPRINT.z0));
    }
  }
  return field;
}

function quarter(
  params: Record<string, unknown> = {},
  intent?: unknown,
): { doc: SettlementDocument; node: DistrictNode; path: string } {
  const node = {
    id: "quarter",
    kind: "district",
    envelope: { shape: "region", size: [56, 56] },
    params: { fabric: "grid", density: "medium", mix: ["townhouse", "cottage"], ...params }
  } as unknown as DistrictNode;
  const doc = {
    ...(intent === undefined ? {} : { intent }),
    root: { id: "world", kind: "composite", children: [node] }
  } as never as SettlementDocument;
  return { doc, node, path: "world.quarter" };
}

function policyAt(
  relief: number,
  params: Record<string, unknown> = {},
  intent?: unknown,
): string {
  installFanOutRows();
  const q = quarter(params, intent);
  return districtGroundPolicy(q.doc, q.node, q.path, {
    field: ramp(relief),
    footprint: FOOTPRINT
  });
}

describe("the measurement the election is made from", () => {
  it("is max minus min over the placed footprint, per column", () => {
    // The ramp is built to hold exactly `relief` blocks between its ends, so
    // this is the assertion that the number in the threshold means what the
    // threshold's doc comment says it means.
    for (const relief of [0, 1, 4, 9, 10, 11, 17]) {
      expect(reliefOf(ramp(relief), FOOTPRINT)).toBe(relief);
    }
  });
});

describe("a quarter that named no ground", () => {
  it("is padded on ground that reads as flat", () => {
    // The byte-identity half. Everything strictly below the threshold compiles
    // to the world it compiled to before this change, and this is the unit-level
    // statement of it.
    for (let relief = 0; relief < STEP_RELIEF; relief++) {
      expect(policyAt(relief), `relief ${relief} moved and it should not have`).toBe("pad");
    }
  });

  it("steps on ground that does not", () => {
    for (const relief of [STEP_RELIEF, STEP_RELIEF + 1, 24, 60]) {
      expect(policyAt(relief), `relief ${relief} was levelled`).toBe("stepped");
    }
  });

  it("is padded when nobody offered it a site to measure", () => {
    // `from-document.ts` resolves the policy before the solve, when there is no
    // footprint and therefore no ground. It must get today's answer.
    installFanOutRows();
    const q = quarter();
    expect(districtGroundPolicy(q.doc, q.node, q.path)).toBe("pad");
  });
});

describe("an answered question is not re-opened by the terrain", () => {
  it("gives params.ground: pad a pad, however steep the hill", () => {
    expect(policyAt(60, { ground: "pad" })).toBe("pad");
  });

  it("gives params.ground: benched benched, however steep the hill", () => {
    expect(policyAt(60, { ground: "benched" })).toBe("benched");
  });

  it("still elects when the intent says nothing about ground", () => {
    expect(policyAt(60, {}, { era: "medieval", wealth: 0.8 })).toBe("stepped");
  });

  it("reports electability as the mirror of all of that", () => {
    installFanOutRows();
    const ask = (params?: Record<string, unknown>, intent?: unknown): boolean => {
      const q = quarter(params, intent);
      return districtGroundElectable(q.doc, q.node, q.path);
    };
    expect(ask()).toBe(true);
    expect(ask({ ground: "pad" })).toBe(false);
    expect(ask({ ground: "stepped" })).toBe(false);
    // A form that cuts its own benches has already answered; `hillside`
    // resolves `"stepped"` and never reaches the election at all.
    expect(ask({ fabric: "hillside" })).toBe(false);
  });
});

describe("the election does not fight the form that already steps", () => {
  it("leaves a hill-town quarter stepped on flat ground and on steep", () => {
    for (const fabric of ["hillside"]) {
      for (const relief of [0, 3, STEP_RELIEF, 60]) {
        expect(policyAt(relief, { fabric })).toBe("stepped");
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the solver's half                                                           */
/* -------------------------------------------------------------------------- */

function districtNode(electable: boolean): LayoutNodeInput {
  return {
    id: "quarter",
    nodePath: "world.quarter",
    kind: "district",
    size: [56, 1, 56],
    flexible: false,
    padding: 0,
    rotations: [0],
    constraints: [],
    ports: {},
    optional: false,
    tags: [],
    seed: new Uint8Array(32) as never,
    ...(electable ? { groundElectable: true } : {})
  } as unknown as LayoutNodeInput;
}

const PLACEMENT: Placement = {
  nodePath: "world.quarter",
  id: "quarter",
  translation: [4, 70, 4],
  yaw: 0,
  mirror: false,
  size: [56, 1, 56],
  footprint: FOOTPRINT,
  anchor: { x: 31, z: 31 },
  foundationY: 70
};

describe("padFor makes the same election the fabric pass will", () => {
  it("lays no pad under an electable quarter on real relief", () => {
    expect(padFor(districtNode(true), PLACEMENT, ramp(STEP_RELIEF))).toBeNull();
  });

  it("lays its ordinary pad below the threshold", () => {
    const pad = padFor(districtNode(true), PLACEMENT, ramp(STEP_RELIEF - 1));
    expect(pad).not.toBeNull();
    expect(pad?.adaptiveApron).toBe(true);
  });

  it("lays its ordinary pad when the quarter asked for one", () => {
    // Not electable — `from-document.ts` withheld the flag because something
    // named a ground — so the relief is never even measured.
    expect(padFor(districtNode(false), PLACEMENT, ramp(60))).not.toBeNull();
  });

  it("lays its ordinary pad when no field is offered", () => {
    // Every caller outside the solver, and every test that predates this.
    expect(padFor(districtNode(true), PLACEMENT)).not.toBeNull();
  });
});

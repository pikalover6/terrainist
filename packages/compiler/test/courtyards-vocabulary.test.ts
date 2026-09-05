/**
 * The Phase 4.2 authoring surface — §5.
 *
 * Two new dials reach the compiler by two routes, and both routes have to be
 * grounded or the dial is a word the author can write and nothing honours:
 *
 * 1. **The rows exist under the ids their callers spell.** `district.ts` calls
 *    `fanOut("layout.groundPolicy", …)` through a *local string constant*,
 *    because this package owns the row file and lands after the one that calls
 *    it. `fanOut` returns `ctx.today` for an unregistered id — which is fan-out
 *    law 2 and is indistinguishable from "the dial does nothing". So the id is
 *    asserted here, literally, rather than through the constant, because a test
 *    that imports the same constant as the code cannot catch the two drifting.
 * 2. **Every string is grounded.** `character.ground` against
 *    `DISTRICT_GROUND_POLICIES`, `character.courtyards` against its range. An
 *    ungrounded value is `LOAM-W488` naming the legal values, never a silent
 *    drop and never a silent clamp.
 *
 * Both rows are **total**: an intent that names neither key returns `ctx.today`
 * — with the one authorised exception §6 and `levels-identity.test.ts` state in
 * full, which is `terraced`'s implied `"benched"` becoming `"stepped"`.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  COURTYARD_SHARE_MAX,
  COURTYARD_SHARE_MIN,
  DISTRICT_GROUND_POLICIES,
  validateIntentValue,
  validateSettlementDocument,
  type DistrictGroundPolicy
} from "@terrainist/spec/ir";

import { fanOut, fanOutRow, installFanOutRows, intentFor, resolveIntents } from "../src/intent/index.js";
import { GROUND_POLICY_ROW_ID, LAYOUT_ROWS } from "../src/layout/streets-intent.js";
import { checkScopeVocabulary } from "../src/structures/vocabulary.js";

beforeAll(() => {
  installFanOutRows();
});

/** The resolved record for one world-scope intent. */
function scope(intent: unknown) {
  return intentFor(resolveIntents({ intent: intent as never, root: { id: "world" } }), "world");
}

const NOTHING = scope(undefined);

/* -------------------------------------------------------------------------- */
/* the rows are registered, under the ids their callers spell                  */
/* -------------------------------------------------------------------------- */

describe("the ground row exists", () => {
  it("registers layout.groundPolicy under exactly the id district.ts calls", () => {
    // Spelled out, not imported: `district.ts` holds its own copy of this
    // string and the whole ground dial is a silent no-op if the two differ.
    expect(fanOutRow("layout.groundPolicy")).toBeDefined();
    expect(LAYOUT_ROWS.groundPolicy).toBe("layout.groundPolicy");
    expect(GROUND_POLICY_ROW_ID).toBe("layout.groundPolicy");
  });

  it("declares the dials each row reads, for the registry dump", () => {
    expect(fanOutRow(LAYOUT_ROWS.groundPolicy)?.reads).toEqual([]);
    for (const id of [LAYOUT_ROWS.groundPolicy]) {
      expect(fanOutRow(id)?.status).toBe("today");
      expect((fanOutRow(id)?.drives ?? "").length).toBeGreaterThan(20);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* totality                                                                    */
/* -------------------------------------------------------------------------- */

describe("layout.groundPolicy is total", () => {
  it("returns today's policy for an intent that names nothing, except the authorised terraced move", () => {
    for (const today of DISTRICT_GROUND_POLICIES) {
      const answer = fanOut<DistrictGroundPolicy>(LAYOUT_ROWS.groundPolicy, NOTHING, {
        nodePath: "world",
        today
      });
      expect(answer).toBe(today === "benched" ? "stepped" : today);
    }
  });

  it("leaves pad alone, which is every quarter that did not opt in", () => {
    const busy = scope({ era: "medieval", wealth: 0.9, formality: 0.9, character: { label: "capital" } });
    expect(
      fanOut<DistrictGroundPolicy>(LAYOUT_ROWS.groundPolicy, busy, { nodePath: "world", today: "pad" }),
    ).toBe("pad");
  });

  it("ignores a policy outside the vocabulary rather than guessing", () => {
    expect(
      fanOut<DistrictGroundPolicy>(
        LAYOUT_ROWS.groundPolicy,
        scope({ character: { ground: "terraced" } }),
        { nodePath: "world", today: "pad" },
      ),
    ).toBe("pad");
  });
});

/* -------------------------------------------------------------------------- */
/* grounding                                                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* the document-side vocabulary                                                */
/* -------------------------------------------------------------------------- */

/** A one-district document with the given district params. */
function documentWith(params: Record<string, unknown>) {
  return validateSettlementDocument({
    version: "0.2",
    seed: 1,
    root: {
      id: "world",
      kind: "composite",
      children: [
        {
          id: "town",
          kind: "district",
          envelope: { shape: "region", size: [200, 180] },
          params: { fabric: "grown", density: "high", mix: ["cottage"], ...params }
        }
      ]
    }
  });
}

describe("params.ground and params.courtyards are grounded on the document side", () => {
  it("accepts every legal ground policy", () => {
    for (const id of DISTRICT_GROUND_POLICIES) {
      const result = documentWith({ ground: id });
      expect(result.diagnostics.filter((d) => d.severity === "error" && d.message.includes("ground"))).toEqual([]);
    }
  });

  it("refuses an unknown params.ground with the legal values", () => {
    const bad = documentWith({ ground: "cliffside" }).diagnostics.find((d) => d.message.includes("cliffside"));
    expect(bad).toBeDefined();
    expect(bad?.severity).toBe("error");
    for (const id of DISTRICT_GROUND_POLICIES) expect(bad?.message).toContain(id);
  });

  it("accepts a share in range and refuses one outside it, naming the range", () => {
    expect(
      documentWith({ courtyards: 0.7 }).diagnostics.filter(
        (d) => d.severity === "error" && d.message.includes("courtyards"),
      ),
    ).toEqual([]);
    const bad = documentWith({ courtyards: 4 }).diagnostics.find((d) => d.message.includes("courtyards"));
    expect(bad).toBeDefined();
    expect(bad?.message).toContain(String(COURTYARD_SHARE_MAX));
  });

  it("carries both keys on a city as well as on a district", () => {
    const result = validateSettlementDocument({
      version: "0.2",
      seed: 1,
      root: {
        id: "world",
        kind: "composite",
        children: [
          {
            id: "capital",
            kind: "city",
            envelope: { shape: "region", size: [320, 320] },
            params: { courtyards: 0.6, ground: "stepped" }
          }
        ]
      }
    });
    const complaints = result.diagnostics.filter(
      (d) => d.severity === "error" && (d.message.includes("courtyards") || d.message.includes("ground")),
    );
    expect(complaints).toEqual([]);
  });
});

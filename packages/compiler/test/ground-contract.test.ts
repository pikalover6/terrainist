/**
 * The ground contract's precedence order is an order
 * (`docs/GROUND-CONTRACT-v0.md` §11, first block).
 *
 * The resolver lands in WP-2; what WP-1 can already be held to is the part that
 * is a pure function — that every class is ranked, that the ranks ascend with
 * the tiers they claim to encode, that `compareIntent` is a strict total order
 * so the resolver's answer cannot depend on the order subsystems are enumerated
 * in, and that the proven street order survives the move into `subRank`
 * unchanged. A silently-missing rank looks exactly like "precedence is broken"
 * — the `agent-defs.test.ts` lesson — so the coverage check is exhaustive in
 * both directions.
 */

import { describe, expect, it } from "vitest";

import {
  DEFERRED_PAD_RANK,
  GROUND_SOURCE_CLASSES,
  GROUND_TIERS,
  INTENT_RANK,
  LEGAL_KINDS,
  compareIntent,
  isLegalKind,
  rankOf,
  type GroundIntent,
  type GroundIntentKind,
  type GroundSourceClass,
  type GroundTier,
} from "../src/layout/ground-contract.js";
import {
  FRONTAGE_TIE,
  GROUND_PLANE_TIE,
  GROUND_V1_RANKS,
  GROUND_V1_FREEZE,
  GROUND_V1_SEAMS,
  SEAM_TIERS,
} from "../src/layout/types.js";
import { compareStreetRank, type StreetRank } from "../src/structures/street-owner.js";

const intent = (
  source: string,
  sourceClass: GroundSourceClass,
  subRank?: number,
): GroundIntent => ({
  source,
  sourceClass,
  kind: "platform",
  columns: [],
  transition: "none",
  ...(subRank === undefined ? {} : { subRank }),
});

/* -------------------------------------------------------------------------- */
/* the table                                                                   */
/* -------------------------------------------------------------------------- */

describe("INTENT_RANK", () => {
  it("covers every GroundSourceClass", () => {
    // Exhaustive in both directions: `Record<GroundSourceClass, number>` makes a
    // missing entry a compile error, and this pins the value list to the type's
    // members so an entry for a class that is not in the union also fails.
    const ranked = Object.keys(INTENT_RANK).sort();
    expect(ranked).toEqual([...GROUND_SOURCE_CLASSES].sort());
    // 18: F17 inserted `farm.parcel` at 125 (`docs/FARM-PLAN-v0.md` §5.3), and
    // WP-G3 traded `pad.record` for `quarter.plane` one for one
    // (`docs/GROUND-CONTRACT-v1.md` §1.5).
    expect(GROUND_SOURCE_CLASSES).toHaveLength(18);
    for (const cls of GROUND_SOURCE_CLASSES) {
      expect(Number.isInteger(INTENT_RANK[cls])).toBe(true);
      expect(GROUND_TIERS[cls]).toMatch(/^[ABCDE]$/);
    }
  });

  it("has distinct values, ascending through the tiers A→B→C→D→E", () => {
    const ranks = GROUND_SOURCE_CLASSES.map((c) => INTENT_RANK[c]);
    expect(new Set(ranks).size).toBe(ranks.length);
    // The listed order is the rank order: strictly ascending, no ties.
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i] as number).toBeGreaterThan(ranks[i - 1] as number);
    }
    // And the tiers are contiguous blocks in that same order, so the tier
    // boundaries are a property of the data rather than of a comment.
    const tiers: GroundTier[] = ["A", "B", "C", "D", "E"];
    const seen = GROUND_SOURCE_CLASSES.map((c) => GROUND_TIERS[c]);
    let cursor = 0;
    for (const tier of seen) {
      const at = tiers.indexOf(tier);
      expect(at).toBeGreaterThanOrEqual(cursor);
      cursor = at;
    }
    // The tiers named in §4.2 all appear except E, which WP-G3 emptied by
    // deleting its one class. The letter stays in the type (v1 §1.6 resolves
    // one tier at a time and an empty tier is a free resolve); what a test may
    // not do is stop noticing that it is empty.
    expect([...new Set(seen)]).toEqual(["A", "B", "C", "D"]);
    expect(GROUND_SOURCE_CLASSES.filter((c) => GROUND_TIERS[c] === "E")).toEqual([]);
    // Spot-check the two ends and the inversions' hinge (§4.4 I1): a face beats
    // a street, which beats a road, a doorstep and a verge.
    expect(INTENT_RANK["fluid.channel"]).toBe(0);
    expect(INTENT_RANK.verge).toBe(140);
    expect(INTENT_RANK["retaining.seam"]).toBeLessThan(INTENT_RANK["street.network"]);
    expect(INTENT_RANK["retaining.skirt"]).toBeLessThan(INTENT_RANK["street.sidewalk"]);
    expect(INTENT_RANK["street.network"]).toBeLessThan(INTENT_RANK["road.network"]);
    expect(INTENT_RANK["street.network"]).toBeLessThan(INTENT_RANK["doorstep.landing"]);
    expect(INTENT_RANK["plaza.ground"]).toBeLessThan(INTENT_RANK["street.network"]);
    expect(INTENT_RANK.verge).toBeGreaterThan(INTENT_RANK["prop.pad"]);
  });
});

/* -------------------------------------------------------------------------- */
/* the comparator                                                              */
/* -------------------------------------------------------------------------- */

describe("compareIntent", () => {
  // Every class, at both `subRank` extremes, with two sources per pair so the
  // duplicated ranks are distinguished only by `source` — the case the
  // totality argument rests on.
  const population: GroundIntent[] = [];
  for (const cls of GROUND_SOURCE_CLASSES) {
    for (const sub of [0, 1_000_000]) {
      population.push(intent(`a.${cls}`, cls, sub));
      population.push(intent(`b.${cls}`, cls, sub));
    }
  }
  // `subRank` omitted must behave as 0 — the default the spec states.
  population.push(intent("c.verge", "verge"));

  it("is irreflexive", () => {
    for (const a of population) expect(compareIntent(a, a)).toBe(0);
  });

  it("is never 0 on distinct intents", () => {
    for (const a of population) {
      for (const b of population) {
        if (a.source === b.source && a.subRank === b.subRank) continue;
        expect(compareIntent(a, b)).not.toBe(0);
      }
    }
  });

  it("is antisymmetric", () => {
    for (const a of population) {
      for (const b of population) {
        // `+ 0` normalises the `-0` `Math.sign` hands back on the equal case,
        // which `Object.is` would otherwise call a mismatch.
        expect(Math.sign(compareIntent(a, b)) + 0).toBe(-Math.sign(compareIntent(b, a)) + 0);
      }
    }
  });

  it("is transitive", () => {
    const sorted = [...population].sort(compareIntent);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        expect(compareIntent(sorted[i] as GroundIntent, sorted[j] as GroundIntent)).toBeLessThan(0);
      }
    }
    // Totality restated the way the resolver depends on it: the sort is a pure
    // function of the set, not of the enumeration order.
    const forward = [...population].sort(compareIntent).map((i) => `${i.source}/${i.subRank ?? 0}`);
    const backward = [...population]
      .reverse()
      .sort(compareIntent)
      .map((i) => `${i.source}/${i.subRank ?? 0}`);
    expect(backward).toEqual(forward);
  });

  it("treats an omitted subRank as 0", () => {
    expect(compareIntent(intent("x", "verge"), intent("x", "verge", 0))).toBe(0);
    expect(compareIntent(intent("x", "verge"), intent("x", "verge", 1))).toBeLessThan(0);
  });

  it("agrees with compareStreetRank within street.network", () => {
    // The proven order `(−width, roleRank, kindRank, id)` is preserved exactly by
    // carrying each job's sorted position across as `subRank`; §4.1 says it is
    // not re-litigated here, and this is what "not re-litigated" means.
    const rank = (
      id: string,
      width: number,
      kind: StreetRank["kind"],
      role: StreetRank["role"] = "carriageway",
    ): StreetRank => ({ id, width, kind, role });

    const jobs: StreetRank[] = [
      rank("s5", 3, "lane"),
      rank("s1", 7, "arterial"),
      rank("s3", 5, "street"),
      rank("s4", 5, "street", "steps"),
      rank("s2", 7, "avenue"),
      rank("s6", 3, "lane", "channel"),
      rank("s0", 9, "avenue"),
    ];

    const byStreet = [...jobs].sort(compareStreetRank);
    const intents = byStreet.map((job, position) =>
      intent(`world.town.${job.id}`, "street.network", position),
    );

    // Shuffled back into an arbitrary order, `compareIntent` reproduces it.
    const shuffled = [intents[3], intents[0], intents[6], intents[2], intents[5], intents[1], intents[4]] as GroundIntent[];
    expect(shuffled.sort(compareIntent).map((i) => i.source)).toEqual(
      byStreet.map((j) => `world.town.${j.id}`),
    );

    // Pairwise, too: same sign as the street comparator, segment for segment.
    for (let i = 0; i < byStreet.length; i++) {
      for (let j = 0; j < byStreet.length; j++) {
        if (i === j) continue;
        expect(Math.sign(compareIntent(intents[i] as GroundIntent, intents[j] as GroundIntent))).toBe(
          Math.sign(compareStreetRank(byStreet[i] as StreetRank, byStreet[j] as StreetRank)),
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §2.2 — which kinds may come from which classes                              */
/* -------------------------------------------------------------------------- */

describe("the legal-class table", () => {
  it("names every kind of §2.2", () => {
    const kinds: GroundIntentKind[] = ["platform", "profile", "face", "clearance", "preserve"];
    expect(Object.keys(LEGAL_KINDS).sort()).toEqual([...kinds].sort());
  });

  it("allows `face` only from the two retaining classes", () => {
    expect([...LEGAL_KINDS.face]).toEqual(["retaining.seam", "retaining.skirt"]);
    for (const cls of GROUND_SOURCE_CLASSES) {
      expect(isLegalKind("face", cls)).toBe(cls === "retaining.seam" || cls === "retaining.skirt");
    }
  });

  it("allows the level kinds and the two filters from any class", () => {
    for (const kind of ["platform", "profile", "clearance", "preserve"] as const) {
      expect([...LEGAL_KINDS[kind]].sort()).toEqual([...GROUND_SOURCE_CLASSES].sort());
      for (const cls of GROUND_SOURCE_CLASSES) expect(isLegalKind(kind, cls)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* §13.2a — `structure.linework`, the class that stopped being reserved        */
/* -------------------------------------------------------------------------- */

describe("structure.linework (GROUND-CONTRACT §13.2a)", () => {
  it("sits strictly between `precinct.ground` and `plaza.ground`, in tier A", () => {
    expect(INTENT_RANK["structure.linework"]).toBe(25);
    expect(INTENT_RANK["precinct.ground"]).toBeLessThan(INTENT_RANK["structure.linework"]);
    expect(INTENT_RANK["structure.linework"]).toBeLessThan(INTENT_RANK["plaza.ground"]);
    expect(GROUND_TIERS["structure.linework"]).toBe("A");
  });

  it("beats every street, sidewalk, road, sweep, doorstep, pad and verge", () => {
    for (const loser of [
      "plaza.ground",
      "retaining.seam",
      "retaining.skirt",
      "street.network",
      "street.sidewalk",
      "road.network",
      "sweep.run",
      "doorstep.landing",
      "farm.parcel",
      "prop.pad",
      "verge",
    ] as const) {
      expect(INTENT_RANK["structure.linework"]).toBeLessThan(INTENT_RANK[loser]);
    }
  });

  it("loses to the three classes §13.2a rule 7 names, and to nothing else", () => {
    const beaters = GROUND_SOURCE_CLASSES.filter(
      (cls) => INTENT_RANK[cls] < INTENT_RANK["structure.linework"],
    );
    // Four since WP-G3: `quarter.plane` (15) joins the three §13.2a rule 7
    // named, between the footprint and the precinct. A bed under a quarter's
    // own plane is the quarter's, which is the same answer rule 7 gives the
    // precinct apron for the same reason.
    expect([...beaters]).toEqual([
      "fluid.channel",
      "building.footprint",
      "quarter.plane",
      "precinct.ground",
    ]);
  });

  it("accepts `platform`, `profile`, `clearance` and `preserve` and REJECTS `face`", () => {
    // §13.2a rule 4: a linework that wants a face declares its bed and lets
    // §5.6 derive the transition, which is how a retaining wall arrives under a
    // viaduct approach without anybody having declared one.
    for (const kind of ["platform", "profile", "clearance", "preserve"] as const) {
      expect(isLegalKind(kind, "structure.linework")).toBe(true);
    }
    expect(isLegalKind("face", "structure.linework")).toBe(false);
    expect([...LEGAL_KINDS.face]).not.toContain("structure.linework");
  });
});

/* -------------------------------------------------------------------------- */
/* WP-G3 — `quarter.plane` arrives and `pad.record` is deleted                 */
/* -------------------------------------------------------------------------- */

describe("quarter.plane (GROUND-CONTRACT-v1 §1.5, WP-G3)", () => {
  it("sits at 15, strictly between the footprint (10) and the precinct (20), in tier A", () => {
    expect(INTENT_RANK["quarter.plane"]).toBe(15);
    expect(INTENT_RANK["quarter.plane"]).toBeGreaterThan(INTENT_RANK["building.footprint"]);
    expect(INTENT_RANK["quarter.plane"]).toBeLessThan(INTENT_RANK["precinct.ground"]);
    expect(INTENT_RANK["building.footprint"]).toBe(10);
    expect(INTENT_RANK["precinct.ground"]).toBe(20);
    expect(GROUND_TIERS["quarter.plane"]).toBe("A");
  });

  it("outranks the plaza, the courtyard, the seam, the street and the sidewalk it carries", () => {
    // §1.5's justification, as an assertion: a quarter's platform run is the
    // thing all five are laid *on*, so all five must lose to it.
    for (const carried of [
      "plaza.ground",
      "plaza.well",
      "courtyard.floor",
      "retaining.seam",
      "retaining.skirt",
      "street.network",
      "street.sidewalk",
      "verge",
    ] as const) {
      expect(INTENT_RANK["quarter.plane"]).toBeLessThan(INTENT_RANK[carried]);
    }
  });

  it("accepts `platform` and `preserve` — the two kinds its declarer uses", () => {
    for (const kind of ["platform", "profile", "clearance", "preserve"] as const) {
      expect(isLegalKind(kind, "quarter.plane")).toBe(true);
      expect(isLegalKind(kind, "building.footprint")).toBe(true);
    }
    // A face is a declared cut and only the two retaining declarers know one.
    expect(isLegalKind("face", "quarter.plane")).toBe(false);
    expect(isLegalKind("face", "building.footprint")).toBe(false);
  });
});

describe("pad.record is gone from all four places (v1 §8/G3)", () => {
  // The class removed from one table and left in another is exactly the failure
  // `agent-defs.test.ts` was written for: it type-checks, it runs, and the
  // arbitration is silently wrong. So: the union (via the value list, which the
  // `satisfies` clause pins to it), the ranks, the tiers, and `LEGAL_KINDS`.
  const GONE = "pad.record";

  it("is absent from GROUND_SOURCE_CLASSES and therefore from GroundSourceClass", () => {
    expect([...GROUND_SOURCE_CLASSES]).not.toContain(GONE);
  });

  it("is absent from INTENT_RANK and GROUND_TIERS", () => {
    expect(Object.keys(INTENT_RANK)).not.toContain(GONE);
    expect(Object.keys(GROUND_TIERS)).not.toContain(GONE);
  });

  it("is absent from every LEGAL_KINDS row", () => {
    for (const kind of Object.keys(LEGAL_KINDS) as GroundIntentKind[]) {
      expect([...LEGAL_KINDS[kind]]).not.toContain(GONE);
    }
  });

  it("leaves no rank at 150 in the table — only in the flag-off lookup", () => {
    expect(GROUND_SOURCE_CLASSES.map((c) => INTENT_RANK[c])).not.toContain(DEFERRED_PAD_RANK);
    expect(DEFERRED_PAD_RANK).toBe(150);
  });
});

describe("rankOf — the flag-off deferral (v1 §6/G3)", () => {
  it("agrees with INTENT_RANK on every class the flag does not gate", () => {
    for (const cls of GROUND_SOURCE_CLASSES) {
      if (cls === "building.footprint" || cls === "quarter.plane") continue;
      expect(rankOf(cls)).toBe(INTENT_RANK[cls]);
    }
    // `precinct.ground` is emphatically not gated: it is a shipped rank-20
    // declarer and was never a pad record, so deferring it would move worlds in
    // the flag's off state.
    expect(rankOf("precinct.ground")).toBe(20);
  });

  it("puts the two pad classes where `pad.record` used to arbitrate while the flag is off", () => {
    const deferred = GROUND_V1_RANKS ? INTENT_RANK : { "building.footprint": 150, "quarter.plane": 150 };
    expect(rankOf("building.footprint")).toBe(deferred["building.footprint"]);
    expect(rankOf("quarter.plane")).toBe(deferred["quarter.plane"]);
    // …and `compareIntent` reads the lookup, not the table: with the flag off a
    // pad must not take a column from a street, a seam or a verge.
    const pad = intent("a.pad", "quarter.plane");
    for (const cls of ["retaining.seam", "street.network", "street.sidewalk", "verge"] as const) {
      const other = intent("b.other", cls);
      expect(compareIntent(pad, other) > 0).toBe(!GROUND_V1_RANKS);
    }
  });
});

describe("the v1 flag ladder (§6)", () => {
  it("ships with GROUND_V1_RANKS on — WP-G4's flip", () => {
    // **Re-pinned at WP-G4's flip.** Off was G3's shipped state and its whole
    // acceptance (byte-identical everywhere); on is the shipped state from the
    // flip, because §6's ladder makes `GROUND_V1_SEAMS` imply this one and the
    // seams are built now. The assertion is kept rather than deleted: it is what
    // stops the constant drifting back, and the rung below asserts the implication.
    expect(GROUND_V1_RANKS).toBe(true);
  });

  it("is implied by every flag below it", () => {
    // §6: "Each implies the ones above it and a test asserts the ordering,
    // exactly as G9 does for `GROUND_PLANE_TIE ⟹ FRONTAGE_TIE`." Two of the
    // four flags do not exist yet; `GROUND_V1_FREEZE ⟹ GROUND_V1_SEAMS` joined
    // this list at WP-G6. The existing rung is restated so the
    // pattern has a precedent in the same file.
    expect(GROUND_PLANE_TIE ? FRONTAGE_TIE : true).toBe(true);
    expect(GROUND_V1_RANKS ? SEAM_TIERS && GROUND_PLANE_TIE : true).toBe(true);
    expect(GROUND_V1_SEAMS ? GROUND_V1_RANKS : true).toBe(true);
    expect(GROUND_V1_FREEZE ? GROUND_V1_SEAMS : true).toBe(true);
  });
});

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
  GROUND_SOURCE_CLASSES,
  GROUND_TIERS,
  INTENT_RANK,
  LEGAL_KINDS,
  compareIntent,
  isLegalKind,
  type GroundIntent,
  type GroundIntentKind,
  type GroundSourceClass,
  type GroundTier,
} from "../src/layout/ground-contract.js";
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
    // 18 since F17 inserted `farm.parcel` at 125 (`docs/FARM-PLAN-v0.md` §5.3).
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
    // The tiers named in §4.2 all appear; none is empty.
    expect([...new Set(seen)]).toEqual(tiers);
    // Spot-check the two ends and the inversions' hinge (§4.4 I1): a face beats
    // a street, which beats a road, a doorstep and a verge.
    expect(INTENT_RANK["fluid.channel"]).toBe(0);
    expect(INTENT_RANK["pad.record"]).toBe(150);
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

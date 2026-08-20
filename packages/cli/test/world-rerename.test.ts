/**
 * The retroactive v -> r re-rename plan.
 *
 * `tools/worlds/rerename-worlds.mjs` moves the whole battery onto build
 * cohorts in one pass over a real saves folder, which is exactly the kind of
 * operation that gets one chance. The properties worth pinning are the ones a
 * dry run cannot show at a glance: that no two worlds land on one name, that
 * every world of a deck lands on the same number whatever prompt it came from,
 * and — the one that protects Kai's existing walk notes — that the mapping is
 * monotone inside each slug, so "v12 beat v9" never becomes "r16 beat r13"
 * with the order flipped.
 */

import { describe, expect, it } from "vitest";

// @ts-expect-error — plain-JS tool module, no declarations.
import { RELEASES, RELEASE_OF, buildPlan, checkPlan, releaseName } from "../../../tools/worlds/rerename-worlds.mjs";

interface Row {
  folder: string;
  slug: string;
  deck: string;
  release: number;
  to: string;
}

/** The whole battery as it sits on disk, plus junk that must be left alone. */
const BATTERY: string[] = [
  ...Array.from({ length: 17 }, (_, i) => `pirates_v_unicorns_v${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `alien_farm_v${i + 1}`),
  ...Array.from({ length: 14 }, (_, i) => `troy_v${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `metropolis_hideout_v${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `hellenist_city_v${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `redwood_camp_v${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `glowcap_vale_v${i + 1}`),
  "glowcap_vale_tie2",
];

const BYSTANDERS = ["dev_world", "New World", "pirate_unicorn_war_mx_head", "hilltown"];

function plan(present: readonly string[]): Row[] {
  return buildPlan([...present]).plan as Row[];
}

describe("release numbering", () => {
  it("numbers decks from 1 in generation order", () => {
    expect(RELEASE_OF["luna"]).toBe(1);
    expect(RELEASE_OF["gem1"]).toBe(5);
    expect(RELEASE_OF["tie2"]).toBe(16);
    expect(RELEASE_OF["v14"]).toBe(RELEASES.length);
  });

  it("gives every deck a distinct number", () => {
    expect(new Set(RELEASES).size).toBe(RELEASES.length);
  });

  it("names a cohort with r", () => {
    expect(releaseName("troy", 16)).toBe("troy_r16");
  });
});

describe("buildPlan over the full battery", () => {
  const rows = plan([...BATTERY, ...BYSTANDERS]);

  it("maps every v-name to exactly one r-name", () => {
    expect(rows).toHaveLength(BATTERY.length);
    expect(new Set(rows.map((r) => r.folder)).size).toBe(BATTERY.length);
    expect(new Set(rows.map((r) => r.to)).size).toBe(BATTERY.length);
  });

  it("leaves everything that is not battery alone", () => {
    const untouched = buildPlan([...BATTERY, ...BYSTANDERS]).unmatched as string[];
    expect(untouched).toEqual([...BYSTANDERS].sort());
  });

  it("passes its own safety check", () => {
    expect(checkPlan(rows, [...BATTERY, ...BYSTANDERS])).toEqual([]);
  });

  it("puts the deck's siblings on one number", () => {
    const tie2 = rows.filter((r) => r.deck === "tie2");
    expect(tie2.map((r) => r.to).sort()).toEqual([
      "glowcap_vale_r16",
      "hellenist_city_r16",
      "pirates_v_unicorns_r16",
      "troy_r16",
    ]);
  });

  it("folds in glowcap_vale_tie2, which the first rename had to skip", () => {
    const row = rows.find((r) => r.folder === "glowcap_vale_tie2");
    expect(row?.to).toBe("glowcap_vale_r16");
  });

  it("keeps each slug's order — no walk note is contradicted", () => {
    const bySlug = new Map<string, Row[]>();
    for (const row of rows) {
      if (!bySlug.has(row.slug)) bySlug.set(row.slug, []);
      bySlug.get(row.slug)?.push(row);
    }
    for (const [, slugRows] of bySlug) {
      const releases = slugRows.map((r) => r.release);
      expect([...releases].sort((a, b) => a - b)).toEqual(releases);
    }
  });

  it("leaves gaps where a prompt skipped a deck, rather than closing them up", () => {
    // p5 has no c2 world, so hellenist_city goes r6 (c1) -> r8 (c3): the gap is
    // the fact that the prompt was not rolled in that deck.
    const hellenist = rows.filter((r) => r.slug === "hellenist_city").map((r) => r.release);
    expect(hellenist).toContain(6);
    expect(hellenist).not.toContain(7);
    expect(hellenist).toContain(8);
  });
});

describe("buildPlan over a partial saves folder", () => {
  it("does not shift anyone's number when worlds are missing", () => {
    const some = ["troy_v14", "hellenist_city_v10", "glowcap_vale_tie2"];
    expect(plan(some).map((r) => r.to).sort()).toEqual([
      "glowcap_vale_r16",
      "hellenist_city_r21",
      "troy_r21",
    ]);
  });

  it("reports what the table expected but did not find", () => {
    const missing = buildPlan(["troy_v14"]).missing as string[];
    expect(missing).toContain("troy_v1");
    expect(missing).not.toContain("troy_v14");
  });
});

describe("checkPlan", () => {
  it("refuses a target that already exists and is not moving away", () => {
    const rows = plan(["troy_v12"]);
    expect(checkPlan(rows, ["troy_v12", "troy_r16"])).toEqual([
      "troy_r16 already exists on disk and is not being renamed away",
    ]);
  });

  it("allows a target that is itself being renamed away", () => {
    // troy_v14 -> troy_r21 while troy_r21 is not a battery name; but the real
    // chained case is two battery worlds swapping through one name.
    const rows = plan(["troy_v13", "troy_v14"]);
    expect(checkPlan(rows, ["troy_v13", "troy_v14"])).toEqual([]);
  });

  it("names a double-claimed cohort as the build clash it is", () => {
    const rows = plan(["troy_v12"]);
    const doubled = [...rows, { ...rows[0], folder: "troy_impostor" }] as Row[];
    expect(checkPlan(doubled, ["troy_v12"])[0]).toMatch(
      /troy_r16 claimed by both troy_v12 and troy_impostor/,
    );
  });
});

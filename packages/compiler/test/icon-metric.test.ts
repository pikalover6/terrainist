/**
 * The icon metric's pure parts (`tools/golden-prompts/icon-metric.mjs`, spec
 * §6): presence is matched against the document and the world separately, a
 * `dominant` icon is judged against the median building, density is lots per
 * 10k envelope cells, and an archetype-less box only counts in a pre-modern
 * world. A synthetic document and report — no compile — so what is pinned is
 * the arithmetic and the matching, not a world.
 */

import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const metric = (await import(
  fileURLToPath(new URL("../../../tools/golden-prompts/icon-metric.mjs", import.meta.url))
)) as {
  iconPresence: (icon: unknown, doc: unknown, report: unknown) => { present: boolean; inDocument: string[]; inWorld: string[] };
  iconDominance: (icon: unknown, report: unknown, presence: unknown) => { dominant: boolean; heightRatio: number; footprintRatio: number } | null;
  density: (report: unknown) => { lotsPer10k: number; lots: number };
  boxes: (doc: unknown, report: unknown) => { preModern: boolean; count: number };
  scoreDocument: (prompt: unknown, doc: unknown, report: unknown, ok: boolean) => { alarms: string[] };
};

const doc = {
  intent: { era: "ancient", tokens: { icons: "a colossal wooden horse" }, character: { archetypes: { forbid: ["office"] } } },
  programs: { trojan_horse: {} },
  root: {
    kind: "composite", id: "world",
    children: [
      { kind: "district", id: "troy_citadel", children: [] },
      { kind: "generator", id: "priams_megaron", params: { archetype: "megaron" } },
      { kind: "generator", id: "the_trojan_horse", params: { program: "trojan_horse" } },
    ],
  },
};
const fp = (x0: number, z0: number, w: number, d: number) => ({ x0, z0, x1: x0 + w - 1, z1: z0 + d - 1 });
const building = (nodePath: string, h: number, w: number, d: number, archetype?: string) => ({
  nodePath, footprint: fp(0, 0, w, d), meta: { height: h, params: archetype ? { archetype } : {} },
});
const report = {
  diagnostics: [],
  layout: {
    districts: [{ bounds: fp(0, 0, 100, 100), stats: { lots: 20, blocks: 5 } }],
    placements: [
      { id: "troy_citadel", nodePath: "world.troy_citadel", size: [100, 1, 100], footprint: fp(0, 0, 100, 100) },
      { id: "the_trojan_horse", nodePath: "world.the_trojan_horse", size: [25, 28, 15], footprint: fp(10, 10, 25, 15) },
    ],
    structures: {
      buildings: [
        building("world.troy_citadel.infill_1", 8, 10, 10, "house"),
        building("world.troy_citadel.infill_2", 8, 10, 12, "house"),
        building("world.troy_citadel.infill_3", 9, 11, 10),
        building("world.priams_megaron", 12, 14, 20, "megaron"),
      ],
    },
  },
};

describe("icon presence", () => {
  it("finds an icon in the document and in the world separately", () => {
    const p = metric.iconPresence({ id: "horse", terms: ["horse"] }, doc, report);
    expect(p.present).toBe(true);
    expect(p.inDocument).toContain("program:trojan_horse");
    expect(p.inWorld).toContain("the_trojan_horse");
  });
  it("is absent when only the prompt tokens mention it", () => {
    const p = metric.iconPresence({ id: "colossal", terms: ["colossal"] }, doc, report);
    expect(p.inDocument).toEqual(["intent.tokens"]);
    expect(p.present).toBe(false);
  });
});

describe("icon dominance", () => {
  it("calls a 28-high horse over 8-high houses dominant", () => {
    const icon = { id: "horse", terms: ["horse"], dominant: true };
    const d = metric.iconDominance(icon, report, metric.iconPresence(icon, doc, report));
    expect(d?.dominant).toBe(true);
    expect(d?.heightRatio).toBeGreaterThan(3);
  });
  it("does not call a megaron 1.5× the median but under 2× the footprint dominant", () => {
    const icon = { id: "citadel", terms: ["megaron"], dominant: true };
    const d = metric.iconDominance(icon, report, metric.iconPresence(icon, doc, report));
    expect(d?.dominant).toBe(false);
  });
});

describe("density and boxes", () => {
  it("counts lots per 10k envelope cells", () => {
    expect(metric.density(report).lotsPer10k).toBe(20);
  });
  it("counts an archetype-less building only in a pre-modern world", () => {
    expect(metric.boxes(doc, report)).toMatchObject({ preModern: true, count: 1 });
    expect(metric.boxes({ ...doc, intent: { era: "modern" } }, report).preModern).toBe(false);
  });
  it("raises the alarms a verdict reads", () => {
    const s = metric.scoreDocument({ id: "t", densityFloor: 25, icons: [{ id: "horse", terms: ["horse"], dominant: true }, { id: "walls", terms: ["wall"] }] }, doc, report, true);
    expect(s.alarms).toContain("icon walls absent");
    expect(s.alarms).toContain("density 20 < floor 25");
    expect(s.alarms.some((a) => a.includes("archetype-less"))).toBe(true);
  });
});

describe("icon dominance — the data a read needs (Stocktake unit 32, F28)", () => {
  // Two villages on a fjord: houses 15 high on 10 × 10 footprints at base 82;
  // a rope ferry 16 high, 18 × 56, on the water at base 70; a bell pavilion
  // 18 high, 19 × 19, in the valley at base 74.
  const fdoc = {
    intent: { era: "medieval", tokens: { icons: "a rope ferry, a temple bell" }, character: {} },
    programs: { rope_ferry: {}, bell_pavilion: {} },
    root: {
      kind: "composite", id: "world",
      children: [
        { kind: "district", id: "stone_village", children: [] },
        { kind: "generator", id: "fjord_rope_ferry", params: { program: "rope_ferry" } },
        { kind: "generator", id: "temple_bell_pavilion", params: { program: "bell_pavilion" } },
      ],
    },
  };
  const house = (n: number) => ({
    nodePath: `world.stone_village.infill_${n}`, footprint: fp(n * 12, 0, 10, 10), meta: { height: 15, params: { archetype: "house" } },
  });
  const housePlacement = (n: number) => ({
    id: `infill_${n}`, nodePath: `world.stone_village.infill_${n}`, size: [10, 15, 10], footprint: fp(n * 12, 0, 10, 10), foundationY: 82,
  });
  const freport = {
    diagnostics: [],
    layout: {
      districts: [{ bounds: fp(0, 0, 120, 120), stats: { lots: 20, blocks: 5 } }],
      placements: [
        { id: "stone_village", nodePath: "world.stone_village", size: [120, 1, 120], footprint: fp(0, 0, 120, 120), foundationY: 82 },
        { id: "fjord_rope_ferry", nodePath: "world.fjord_rope_ferry", size: [18, 16, 56], footprint: fp(40, 40, 18, 56), foundationY: 70 },
        { id: "temple_bell_pavilion", nodePath: "world.temple_bell_pavilion", size: [19, 18, 19], footprint: fp(80, 80, 19, 19), foundationY: 74 },
        ...[1, 2, 3, 4, 5].map(housePlacement),
      ],
      structures: { buildings: [1, 2, 3, 4, 5].map(house) },
    },
    stats: { programs: [] },
  };
  it("keeps the rule's answer for a long low ferry and asks for a read, with its span", () => {
    const icon = { id: "ferry", terms: ["ferry"], dominant: true };
    const d = metric.iconDominance(icon, freport, metric.iconPresence(icon, fdoc, freport)) as Record<string, unknown>;
    expect(d.dominant).toBe(false);
    expect(d.readRequired).toBe(true);
    expect(d.spanRatio as number).toBeGreaterThanOrEqual(3);
    expect(d.elevation).toBe(70 - 82);
  });
  it("does not ask for a read of a pavilion in the valley below the village", () => {
    const icon = { id: "bell", terms: ["bell", "pavilion"], dominant: true };
    const d = metric.iconDominance(icon, freport, metric.iconPresence(icon, fdoc, freport)) as Record<string, unknown>;
    expect(d.dominant).toBe(false);
    expect(d.readRequired).toBeUndefined();
    expect(d.elevation).toBe(74 - 82);
  });
});

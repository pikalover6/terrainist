/**
 * The **three bridges** — `stone_bridge`, `timber_bridge`, `suspension_bridge`.
 *
 * : they are the bridge kit's profile variants,
 * not new hosts, so what has to be proved is what the kit already promises,
 * once per style — a deck a player can walk end to end, piers that reach the
 * bed, and (the one thing only the cable style can get wrong) not one chain
 * hanging from nothing.
 */

import { describe, expect, it } from "vitest";

import type { ColumnPlan } from "../src/terrain/columns.js";
import { buildBridgeKit, type BridgeStates } from "../src/structures/bridge.js";
import {
  BRIDGE_HANGER_CLEARANCE,
  SUSPENSION_MIN_SPAN,
  STONE_MIN_SPAN,
  selectBridgeStyle,
  type BridgeStyleSet
} from "../src/structures/bridge-styles.js";
import { bridgeOffsets } from "../src/structures/profiles.js";

const REGION = { x0: -64, z0: -64, width: 128, depth: 128 };

/** A channel `half` columns either side of x = 0, bed at 58, banks at 64. */
function channel(half: number): { plan: ColumnPlan; water: Uint8Array } {
  const n = REGION.width * REGION.depth;
  const ground = new Int32Array(n);
  const water = new Uint8Array(n);
  for (let j = 0; j < REGION.depth; j++) {
    for (let i = 0; i < REGION.width; i++) {
      const x = REGION.x0 + i;
      const wet = Math.abs(x) <= half;
      ground[j * REGION.width + i] = wet ? 58 : 64;
      if (wet) water[j * REGION.width + i] = 1;
    }
  }
  return { plan: { region: REGION, ground } as unknown as ColumnPlan, water };
}

/** A crossing wide enough to clear a channel of `half`, decked at y = 65. */
function crossing(half: number): { x: number; z: number; y: number }[] {
  return Array.from({ length: 2 * half + 21 }, (_, k) => ({ x: -half - 10 + k, z: 0, y: 65 }));
}

/** Distinct ids per role, so a block's material names the course that laid it. */
const STYLES: BridgeStyleSet = {
  timber: { style: "timber", deck: 11, parapet: 12, pier: 13 },
  stone: { style: "stone", deck: 21, parapet: 22, pier: 23, haunch: 24 },
  suspension: { style: "suspension", deck: 31, parapet: 32, pier: 33, tower: 34, chain: 35 }
};

const BASE: Omit<BridgeStates, "styles"> = { deck: 1, post: 2, pier: 3 };
const WIDTH = 5;
const RAIL = bridgeOffsets(WIDTH).rail;

function build(half: number, styles?: BridgeStyleSet) {
  const { plan, water } = channel(half);
  return buildBridgeKit(
    REGION,
    plan,
    crossing(half),
    WIDTH,
    styles === undefined ? BASE : { ...BASE, styles },
    water,
  );
}

const key = (b: { x: number; y: number; z: number }): string => `${b.x},${b.y},${b.z}`;

describe("the selection rule", () => {
  it("is the span's own length, and nothing else", () => {
    expect(selectBridgeStyle(3)).toBe("timber");
    expect(selectBridgeStyle(STONE_MIN_SPAN - 1)).toBe("timber");
    expect(selectBridgeStyle(STONE_MIN_SPAN)).toBe("stone");
    expect(selectBridgeStyle(SUSPENSION_MIN_SPAN - 1)).toBe("stone");
    expect(selectBridgeStyle(SUSPENSION_MIN_SPAN)).toBe("suspension");
  });

  it("yields to a style the document named, under either spelling", () => {
    expect(selectBridgeStyle(3, "suspension_bridge")).toBe("suspension");
    expect(selectBridgeStyle(200, "timber_bridge")).toBe("timber");
    expect(selectBridgeStyle(200, "stone")).toBe("stone");
    // A spelling the kit does not know is not a silent style change.
    expect(selectBridgeStyle(200, "rope_bridge")).toBe("suspension");
  });
});

describe("every style", () => {
  const cases: { name: string; half: number; deck: number; pier: number }[] = [
    { name: "timber", half: 3, deck: 11, pier: 13 },
    { name: "stone", half: 6, deck: 21, pier: 23 },
    { name: "suspension", half: 20, deck: 31, pier: 33 }
  ];

  for (const c of cases) {
    it(`${c.name}: decks every column of the crossing, walkably`, () => {
      const { blocks } = build(c.half, STYLES);
      const written = new Map(blocks.map((b) => [key(b), b.stateId]));
      const deck = blocks.filter((b) => b.stateId === c.deck);
      expect(deck.length).toBeGreaterThan(0);
      // Continuity: one deck block per wet column of the crossing, every lane.
      for (let x = -c.half; x <= c.half; x++) {
        for (let lane = -RAIL; lane <= RAIL; lane++) {
          expect(written.get(`${x},65,${lane}`), `${x},${lane}`).toBeDefined();
        }
      }
      // Walkability: two blocks of head room over the carriageway, the whole way.
      for (const b of deck) {
        if (Math.abs(b.z) === RAIL) continue;
        expect(written.has(`${b.x},${b.y + 1},${b.z}`), key(b)).toBe(false);
        expect(written.has(`${b.x},${b.y + 2},${b.z}`), key(b)).toBe(false);
      }
    });

    it(`${c.name}: founds every pier on the bed`, () => {
      const { blocks } = build(c.half, STYLES);
      const written = new Set(blocks.map(key));
      const piers = blocks.filter((b) => b.stateId === c.pier);
      expect(piers.length).toBeGreaterThan(0);
      for (const b of piers) {
        // Either it stands on the bed itself, or on its own course below.
        expect(b.y === 59 || written.has(`${b.x},${b.y - 1},${b.z}`), key(b)).toBe(true);
        expect(b.y).toBeLessThan(65);
      }
    });

    it(`${c.name}: writes nothing over dry land, and writes it twice the same`, () => {
      const { water } = channel(c.half);
      const a = build(c.half, STYLES).blocks;
      const b = build(c.half, STYLES).blocks;
      expect(a.map((k) => `${key(k)}:${k.stateId}`)).toEqual(
        b.map((k) => `${key(k)}:${k.stateId}`),
      );
      for (const block of a) {
        const idx = (block.z - REGION.z0) * REGION.width + (block.x - REGION.x0);
        expect(water[idx], key(block)).toBe(1);
      }
      // One block per voxel: no course writes over another's.
      expect(new Set(a.map(key)).size).toBe(a.length);
    });
  }

  it("builds the kit's classic section when no styles are resolved", () => {
    const { blocks } = build(6);
    expect(new Set(blocks.map((b) => b.stateId))).toEqual(new Set([1, 2, 3]));
  });
});

describe("the stone arch", () => {
  it("springs its haunch off a pier, under the deck, over water", () => {
    const { blocks } = build(6, STYLES);
    const written = new Set(blocks.map(key));
    const haunch = blocks.filter((b) => b.stateId === 24);
    expect(haunch.length).toBeGreaterThan(0);
    for (const b of haunch) {
      // Under the deck …
      expect(written.has(`${b.x},${b.y + 1},${b.z}`), key(b)).toBe(true);
      // … and beside the pier column it grew from.
      const beside = [
        `${b.x + 1},${b.y},${b.z}`,
        `${b.x - 1},${b.y},${b.z}`,
        `${b.x},${b.y},${b.z + 1}`,
        `${b.x},${b.y},${b.z - 1}`
      ].some((k) => written.has(k));
      expect(beside, key(b)).toBe(true);
    }
  });

  it("is the stone style's alone", () => {
    for (const half of [3, 20]) {
      expect(build(half, STYLES).blocks.some((b) => b.stateId === 24)).toBe(false);
    }
  });
});

describe("the suspension cable", () => {
  const SOLID = new Set([31, 32, 33, 34]);

  it("stands a tower over each abutment and hangs nothing from nothing", () => {
    const { blocks, features } = build(20, STYLES);
    const towers = blocks.filter((b) => b.stateId === 34);
    const chains = blocks.filter((b) => b.stateId === 35);
    expect(towers.length).toBeGreaterThan(0);
    expect(chains.length).toBeGreaterThan(0);
    expect(features.some((f) => f.id === "tower")).toBe(true);

    // Support closure: walk the chain/tower graph from the towers outwards.
    // Every chain block has to be reachable, which is exactly "no floating
    // chain segment" — a hanger is on the cable, the cable is on the towers,
    // and the towers are on the piers.
    const solid = new Set(blocks.filter((b) => SOLID.has(b.stateId)).map(key));
    const chain = new Map(chains.map((b) => [key(b), b]));
    const seen = new Set<string>();
    const queue = [...chain.values()].filter((b) =>
      [
        `${b.x},${b.y + 1},${b.z}`,
        `${b.x + 1},${b.y},${b.z}`,
        `${b.x - 1},${b.y},${b.z}`,
        `${b.x},${b.y},${b.z + 1}`,
        `${b.x},${b.y},${b.z - 1}`
      ].some((k) => solid.has(k)),
    );
    for (const b of queue) seen.add(key(b));
    while (queue.length > 0) {
      const b = queue.pop() as { x: number; y: number; z: number };
      for (const [dx, dy, dz] of [
        [0, -1, 0],
        [0, 1, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1]
      ] as const) {
        const k = `${b.x + dx},${b.y + dy},${b.z + dz}`;
        const next = chain.get(k);
        if (next === undefined || seen.has(k)) continue;
        seen.add(k);
        queue.push(next);
      }
    }
    expect(seen.size).toBe(chain.size);
  });

  it("keeps every chain clear of the walking deck", () => {
    const { blocks } = build(20, STYLES);
    for (const b of blocks) {
      if (b.stateId !== 35) continue;
      expect(b.y, key(b)).toBeGreaterThanOrEqual(65 + BRIDGE_HANGER_CLEARANCE);
    }
  });

  it("is the cable style's alone", () => {
    for (const half of [3, 6]) {
      const ids = new Set(build(half, STYLES).blocks.map((b) => b.stateId));
      expect(ids.has(34)).toBe(false);
      expect(ids.has(35)).toBe(false);
    }
  });
});

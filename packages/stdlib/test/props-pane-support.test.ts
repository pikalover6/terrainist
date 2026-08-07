/**
 * Street furniture may not stand its canopy on glass.
 *
 * Walked by Kai on 2026-08-07 (`hillside_town-7`): a lantern hanging from a
 * red-wool-and-dark-slab canopy corner whose only support was a wall of glass
 * panes. At eye level on a pavement a pane is *near-invisible*, so a roof
 * carried by panes alone does not read as glazed — it reads as floating, which
 * Kai called "aesthetically really wonky".
 *
 * The rule below is deliberately scoped to the **ground-standing street
 * families** (street, wayside, amusement). Those are the props you walk past at
 * one block's distance, freestanding on open pavement, where the eye looks for
 * a post and finds nothing. A ship's wheelhouse or a rail car's clerestory is
 * the opposite idiom — a continuous glazing band sitting on a massive solid
 * hull — and is not what Kai walked; those stay as they are.
 *
 * What the rule says: if a pane column carries a **load** (walk up through
 * panes; the first non-pane block is a full cube, a slab or a stair — not a
 * lantern, banner, chain or other trim), then some *structural* block must
 * stand in the pane's own course within two cells. That is the post the eye is
 * looking for. Glazing between posts is fine; glazing instead of posts is not.
 */

import { describe, expect, it } from "vitest";

import { generateProp, type PropName } from "../src/structures/props.js";
import { AMUSEMENT_PROP_NAMES } from "../src/structures/props-amusement.js";
import { STREET_PROP_NAMES } from "../src/structures/props-street.js";
import { WAYSIDE_PROP_NAMES } from "../src/structures/props-wayside.js";

/** The families this rule covers — see the file docstring for why these. */
const STREET_FAMILIES: readonly string[] = [
  ...STREET_PROP_NAMES,
  ...WAYSIDE_PROP_NAMES,
  ...AMUSEMENT_PROP_NAMES,
];

/**
 * Blocks that carry nothing and read as trim rather than as structure.
 *
 * A pane under one of these is not holding a canopy up, and a block of one of
 * these beside a pane is not the post the eye is looking for.
 */
const TRIM =
  /(_pane$|^iron_bars$|lantern$|torch$|chain$|_carpet$|_sign$|_banner$|_button$|_trapdoor$|_door$|_rail$|^ladder$|^vine$|^air$|_pressure_plate$|_candle$|^flower_pot$|^potted_)/;

/** How far from a pane a post may stand and still read as holding the roof. */
const POST_REACH = 2;

/** A zeroed node seed — every prop here is deterministic in it. */
const SEED = new Uint8Array(32);

describe("street furniture never stands a canopy on glass", () => {
  for (const name of STREET_FAMILIES) {
    it(`${name} carries every load on structure, not panes`, () => {
      const { ops } = generateProp({
        prop: name as PropName,
        seed: SEED as never,
        params: {},
      } as never);
      const cell = new Map<string, string>();
      for (const op of ops) cell.set(`${op.x},${op.y},${op.z}`, op.block);

      const floating: string[] = [];
      for (const op of ops) {
        if (!op.block.endsWith("_pane")) continue;
        // Walk up through the glass to whatever the glass is under.
        let y = op.y + 1;
        let load = cell.get(`${op.x},${y},${op.z}`);
        while (load !== undefined && load.endsWith("_pane")) {
          y += 1;
          load = cell.get(`${op.x},${y},${op.z}`);
        }
        if (load === undefined || TRIM.test(load)) continue;
        // Is there a post within reach, in this pane's own course?
        let propped = false;
        for (let dx = -POST_REACH; dx <= POST_REACH && !propped; dx++) {
          for (let dz = -POST_REACH; dz <= POST_REACH && !propped; dz++) {
            if (dx === 0 && dz === 0) continue;
            const near = cell.get(`${op.x + dx},${op.y},${op.z + dz}`);
            if (near !== undefined && !TRIM.test(near)) propped = true;
          }
        }
        if (!propped) floating.push(`${op.x},${op.y},${op.z} under ${load}`);
      }
      expect(floating, `${name}: panes carrying a load with no post in reach`).toEqual([]);
    });
  }
});

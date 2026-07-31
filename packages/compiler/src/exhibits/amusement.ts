/**
 * Dev-world exhibit row for the fairground props.
 *
 * The argument is `exhibits/blitz.ts`'s, unchanged: a defect in a swing boat is
 * found by looking at a swing boat, and the only place to look at one on its
 * own is the grid. One row, every prop of the wave at yaw 0, and a rotation for
 * each of the two whose op list is asymmetric enough that a missed axis swap
 * would be invisible head-on — the stall and the boats.
 *
 * This file owns a row, not the dev world: `exhibits/props.ts` spreads the plan
 * and `devworld.ts` never learns the difference.
 */

import type { PropName } from "@terrainist/stdlib";

/** The fairground row, in the shape `exhibits/props.ts` spreads. */
export const AMUSEMENT_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly { readonly prop: PropName; readonly params: Record<string, unknown> }[];
}[] = Object.freeze([
  {
    row: "fairground",
    water: false,
    cells: [
      { prop: "fairground_stall" as PropName, params: { yaw: 0 } },
      { prop: "fairground_stall" as PropName, params: { yaw: 90 } },
      { prop: "ticket_booth" as PropName, params: { yaw: 0 } },
      { prop: "prize_wheel" as PropName, params: { yaw: 0 } },
      { prop: "prize_wheel" as PropName, params: { yaw: 90 } },
      { prop: "swing_boats" as PropName, params: { yaw: 0 } },
      { prop: "swing_boats" as PropName, params: { yaw: 90 } },
    ],
  },
]);

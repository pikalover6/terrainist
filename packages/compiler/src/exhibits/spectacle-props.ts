/**
 * The wave-6D spectacle rows, re-typed for the prop grid.
 *
 * The plan itself lives in the stdlib beside the generators that build it
 * (`structures/props-spectacle.ts`), for the same reason
 * `exhibits/wayside-props.ts` exists: `exhibits/props.ts` is shared ground
 * between parallel tracks, and registering a wave there has to stay one import
 * and one spread. This file is the thin adapter that gives those rows the
 * compiler's `PropName` type — the stdlib cannot import it, and casting at the
 * spread site would hide a typo in a prop name rather than fail on it.
 */

import { SPECTACLE_PROP_EXHIBIT_PLAN as RAW, type PropName } from "@terrainist/stdlib";

/** The rows, in the shape `PROP_EXHIBIT_PLAN` spreads. */
export const SPECTACLE_PROP_EXHIBIT_PLAN: readonly {
  readonly row: string;
  readonly water: boolean;
  readonly cells: readonly { readonly prop: PropName; readonly params: Record<string, unknown> }[];
}[] = RAW;

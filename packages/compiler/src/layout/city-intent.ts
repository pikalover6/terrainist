/**
 * The fan-out row the **city** pass owns: which urban form each character's
 * cells are drawn with (`docs/URBAN-FORMS-v0.md` §6.3).
 *
 * A city's quarters are chosen by the compiler, not by the author — `CELL_FABRIC`
 * maps each of the eight characters to `grid` or `organic` and has since fabric
 * v3. That table is the single biggest source of "every settlement looks the
 * same", and §5 nevertheless keeps it **frozen**, because moving it would
 * rewrite every committed golden. So this row is the opt-in: an intent that
 * names `character.urbanForm` re-maps every built character to that form, and an
 * intent that does not returns `ctx.today` — the frozen table, unchanged, byte
 * for byte.
 *
 * `park` is left alone under every circumstance: a park cell gets no fabric at
 * all, and putting a form id against it would be a value nothing reads.
 */

import { DISTRICT_FABRICS, type DistrictCharacterName, type DistrictFabric } from "@terrainist/spec";

import { registerFanOut } from "../intent/fanout.js";

/** Row ids owned by the city pass. */
export const CITY_ROWS = {
  cellForms: "layout.cellForms",
} as const;

/** The character → urban form table a city pass draws its cells with. */
export type CellFormTable = Readonly<Record<DistrictCharacterName, DistrictFabric>>;

/** Register every city-owned row. */
export function registerCityFanOut(): void {
  registerFanOut<CellFormTable>({
    id: CITY_ROWS.cellForms,
    reads: ["character"],
    status: "today",
    drives: "which urban form each city character's cells are drawn with (layout/city-pass.ts)",
    resolve(intent, ctx) {
      const named = intent.intent.character?.urbanForm;
      // Total, and the totality is the byte-identity proof: no key, no change.
      // An ungrounded id is *not* silently substituted either — the vocabulary
      // check has already warned about it (`LOAM-W487`), and the frozen table is
      // the right answer for a word nobody can draw.
      if (named === undefined || !DISTRICT_FABRICS.includes(named)) return ctx.today;

      const out: Record<string, DistrictFabric> = { ...ctx.today };
      for (const character of Object.keys(ctx.today)) {
        if (character === "park") continue;
        out[character] = named;
      }
      return out as CellFormTable;
    },
  });
}

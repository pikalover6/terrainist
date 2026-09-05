/**
 * `params.entrance` on the way from the document to the grammar — family D
 *
 * The fitting itself is stdlib's (`entrance-fittings.ts`, and
 * `packages/stdlib/test/entrance-fittings.test.ts` is where it is walked). What
 * this file guards is the seam: the building pass reads **only** the treatment
 * out of the `entrance` object, drops a malformed one rather than throwing —
 * the validator is what tells the author — and leaves the older
 * `port`/`porch`/`steps` keys entirely alone, since those are the shell's own
 * entrance vocabulary and were here first.
 */

import { describe, expect, it } from "vitest";

import { generateBuilding, nodeSeed, BUILDING_STYLE_DEFAULTS } from "@terrainist/stdlib";

import { entranceTreatmentOf } from "../src/structures/index.js";

describe("params.entrance → the grammar", () => {
  it("reads the treatment, and only the treatment", () => {
    expect(entranceTreatmentOf({ treatment: "blast_door" })).toBe("blast_door");
    expect(entranceTreatmentOf({ treatment: "airlock_vestibule" })).toBe("airlock_vestibule");
    // A word the grammar does not build still travels: the refusal belongs to
    // one place, and that place is the fitting.
    expect(entranceTreatmentOf({ treatment: "moon_gate" })).toBe("moon_gate");
  });

  it("drops anything that is not a treatment, without throwing", () => {
    for (const value of [undefined, null, 7, "blast_door", [], {}, { port: "door" }, { treatment: 3 }]) {
      expect(entranceTreatmentOf(value), JSON.stringify(value) ?? "undefined").toBeUndefined();
    }
  });

  it("changes the building when it is passed, and nothing when it is not", () => {
    const seed = nodeSeed(0xb00b5n, "world.bunker");
    const build = (entrance?: { treatment: string }) =>
      generateBuilding({
        size: [11, 12, 11],
        params: { archetype: "bunker_complex", ...(entrance === undefined ? {} : { entrance }) },
        seed,
        style: BUILDING_STYLE_DEFAULTS
      });
    const plain = JSON.stringify(build().ops);
    expect(JSON.stringify(build({ treatment: "moon_gate" }).ops)).toBe(plain);
    const fitted = build({ treatment: "blast_door" });
    expect(JSON.stringify(fitted.ops)).not.toBe(plain);
    expect(fitted.ops.some((o) => o.block === "iron_door")).toBe(true);
  });
});

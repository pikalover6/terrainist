/**
 * `params.entrance.treatment` on a `building.grammar@0` node — the catalog's
 * **family D** (`docs/INFRA-ENTRIES-v0.md` §2 D).
 *
 * A fitting *in* another structure is never a node: a blast door is what the
 * way in is made of, and the way in is a column the port solver placed and the
 * doorstep pass graded. So the one authoring surface is a param on the building
 * that owns the door, and the vocabulary is closed for the reason every closed
 * vocabulary here is closed — the failure this prevents is the silent one, an
 * author writing `"bunker_door"` and walking a world with an ordinary front
 * door in it and nothing said.
 */

import { describe, expect, it } from "vitest";

import { validateSettlementDocument } from "../src/index.js";

function doc(params: Record<string, unknown>): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "entrance_test", worldSeed: 42 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        {
          id: "hideout",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [11, 12, 11] },
          params,
        },
      ],
    },
  };
}

function diags(params: Record<string, unknown>): { name: string; code: string; fix?: string }[] {
  return validateSettlementDocument(doc(params)).diagnostics.map((d) => ({
    name: d.name,
    code: d.code,
    ...(d.fix === undefined ? {} : { fix: d.fix }),
  }));
}

describe("params.entrance.treatment — family D's fittings", () => {
  it("accepts both fittings the grammar builds", () => {
    for (const treatment of ["blast_door", "airlock_vestibule"]) {
      expect(diags({ archetype: "bunker_complex", entrance: { treatment } }), treatment).toEqual([]);
    }
  });

  it("leaves the older `entrance` keys alone", () => {
    // `port`/`porch`/`steps` are the shell's own entrance vocabulary and this
    // check must not have narrowed the object to one key.
    expect(diags({ entrance: { port: "door", porch: false, steps: true } })).toEqual([]);
    expect(diags({})).toEqual([]);
  });

  it("names the legal fittings when the treatment is not one", () => {
    for (const treatment of ["bunker_door", "moon_gate", "blastdoor", 7, true]) {
      const found = diags({ entrance: { treatment } });
      expect(found.map((d) => d.name), String(treatment)).toContain("STRUCTURE_PARAM");
      const hint = found.find((d) => d.name === "STRUCTURE_PARAM")?.fix ?? "";
      expect(hint).toContain("blast_door");
      expect(hint).toContain("airlock_vestibule");
      // And it says where each one belongs, so the fix is one edit rather than
      // a second guess.
      expect(hint).toContain("bunker_complex");
      expect(hint).toContain("hydroponics_bay");
    }
  });

  it("still refuses an `entrance` that is not an object at all", () => {
    expect(diags({ entrance: "blast_door" }).map((d) => d.name)).toContain("STRUCTURE_PARAM");
  });
});

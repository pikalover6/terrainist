/**
 * `infra.entry@0` in the settlement profile's validator
 * (`docs/INFRA-ENTRIES-v0.md` §3.1, §3.2, §3.7).
 *
 * Two things these tests are really about.
 *
 * The first is the **fix hint**, exactly as `settlement-props.test.ts` says: an
 * author who writes `"entry": "test_fenc"` has made a spelling mistake, and a
 * validator that says "unknown entry, here are the ones you may have meant" is
 * the difference between an author who fixes it and one who gives up.
 *
 * The second is **the closed route vocabulary**. §5's hardest line is "no
 * absolute coordinates, ever" — `margin`, `offset` and `run` are distances and
 * are legal; a vertex, a bearing in degrees or an `[x, z]` is not — and the
 * only thing standing between a model and a coordinate is that a route form
 * takes a *name*. So the tests below hold that shape rather than trusting it.
 */

import { describe, expect, it } from "vitest";

import {
  INFRA_ENTRY_ROUTES,
  KNOWN_INFRA_ENTRIES,
  nearestInfraEntries,
  validateSettlementDocument,
} from "../src/index.js";

function doc(extras: unknown[] = []): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "cordon_dale", worldSeed: 42 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        ...extras,
      ],
    },
  };
}

function entry(params: Record<string, unknown>, patch: Record<string, unknown> = {}): unknown {
  return { id: "cordon", kind: "generator", generator: "infra.entry@0", params, ...patch };
}

function names(input: unknown): string[] {
  return validateSettlementDocument(input).diagnostics.map((d) => d.name);
}

function hints(input: unknown): string[] {
  return validateSettlementDocument(input).diagnostics.map((d) => d.fix);
}

describe("infra.entry@0 — the node", () => {
  it("accepts the design document's own example, shape for shape", () => {
    const result = validateSettlementDocument(
      doc([
        entry({
          entry: "test_fence",
          route: { ring: "north_holding", margin: 12 },
          gates: true,
        }),
      ]),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("accepts every entry the registry names, in every form it accepts", () => {
    for (const id of KNOWN_INFRA_ENTRIES) {
      for (const form of INFRA_ENTRY_ROUTES[id] ?? []) {
        // `between` is the one form whose anchor is a *pair*: it names two
        // placed nodes, so the fixture value has to be two of them.
        const anchor = form === "between" ? ["north_mole", "south_mole"] : "holding";
        const result = validateSettlementDocument(
          doc([entry({ entry: id, route: { [form]: anchor } })]),
        );
        expect(result.diagnostics, `${id} / ${form}`).toEqual([]);
      }
    }
  });

  it("refuses children — an entry is a leaf", () => {
    const result = validateSettlementDocument(
      doc([entry({ entry: "test_fence", route: { ring: "holding" } }, { children: [] })]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain("STRUCTURE_NODE_SHAPE");
  });

  it("names the host in the 'generator not in profile' hint, so it is discoverable", () => {
    const result = validateSettlementDocument(
      doc([{ id: "x", kind: "generator", generator: "infra.entries@0", params: {} }]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain(
      "STRUCTURE_GENERATOR_NOT_IN_PROFILE",
    );
    expect(result.diagnostics.map((d) => d.fix).join(" ")).toContain("infra.entry@0");
  });
});

describe("infra.entry@0 — the entry id (LOAM-T231)", () => {
  it("requires one", () => {
    expect(names(doc([entry({ route: { ring: "holding" } })]))).toContain("INFRA_ENTRY_PARAM");
  });

  it("rejects an unknown one and suggests the near-misses", () => {
    const bad = doc([entry({ entry: "test_fenc", route: { ring: "holding" } })]);
    expect(names(bad)).toContain("INFRA_ENTRY_PARAM");
    expect(hints(bad).join(" ")).toContain("test_fence");
    expect(nearestInfraEntries("test_fenc")).toContain("test_fence");
  });

  it("names every legal value in the hint, always", () => {
    // An entry from a wave that has not landed: `sluice_box` is W3's other
    // trough and is refused for want of a fall-following route form, and until
    // it is a row the honest answer is the list of the ones that are.
    const bad = doc([entry({ entry: "sluice_box", route: { along: "creek" } })]);
    expect(names(bad)).toContain("INFRA_ENTRY_PARAM");
    for (const id of KNOWN_INFRA_ENTRIES) expect(hints(bad).join(" ")).toContain(id);
  });

  it("refuses a crash furrow that names nothing to run into — the Q5 refusal", () => {
    // The furrow accepts `into` and no other form, which *is* the refusal: a
    // scar with no cause is set dressing, so pointing one along a road or round
    // a holding is `LOAM-T231` rather than a furrow with no end.
    for (const form of ["ring", "along", "across", "over"]) {
      const bad = doc([entry({ entry: "crash_furrow", route: { [form]: "wreck" } })]);
      expect(names(bad), form).toContain("INFRA_ENTRY_PARAM");
      expect(hints(bad).join(" "), form).toContain("into");
    }
    expect(
      validateSettlementDocument(
        doc([entry({ entry: "crash_furrow", route: { into: "saucer", run: 48 } })]),
      ).diagnostics,
    ).toEqual([]);
  });

  it("accepts P2's postcard whole — four entries, four route forms, one document", () => {
    const result = validateSettlementDocument(
      doc([
        entry({ entry: "quarantine_fence", route: { ring: "north_holding", margin: 10 } }),
        entry({ entry: "crop_circle", route: { over: "north_holding" } }, { id: "figure" }),
        entry({ entry: "barricade_line", route: { across: "high_road" } }, { id: "barricade" }),
        entry({ entry: "crash_furrow", route: { into: "saucer", run: 56 } }, { id: "furrow" }),
      ]),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("rejects a route form the named entry does not accept", () => {
    // `test_fence` is a linear entry; it has no areal geometry.
    const bad = doc([entry({ entry: "test_fence", route: { over: "holding" } })]);
    expect(names(bad)).toContain("INFRA_ENTRY_PARAM");
    expect(hints(bad).join(" ")).toContain("ring");
  });
});

describe("infra.entry@0 — the route (§3.2, §5)", () => {
  it("requires one", () => {
    expect(names(doc([entry({ entry: "test_fence" })]))).toContain("INFRA_ENTRY_PARAM");
  });

  it("requires exactly one form — a route is one line", () => {
    const two = doc([
      entry({ entry: "test_fence", route: { ring: "holding", along: "high_road" } }),
    ]);
    expect(names(two)).toContain("INFRA_ENTRY_PARAM");
    const none = doc([entry({ entry: "test_fence", route: { margin: 4 } })]);
    expect(names(none)).toContain("INFRA_ENTRY_PARAM");
  });

  it("refuses a coordinate wherever one could be written", () => {
    // The anchor: a name, never a pair of numbers.
    for (const target of [[12, 40], { x: 12, z: 40 }, 12, null]) {
      expect(
        names(doc([entry({ entry: "test_fence", route: { ring: target } })])),
        JSON.stringify(target),
      ).toContain("INFRA_ENTRY_PARAM");
    }
    // …and a key the vocabulary does not have at all.
    expect(
      names(doc([entry({ entry: "test_fence", route: { ring: "holding", bearing: 45 } })])),
    ).toContain("UNKNOWN_KEY");
  });

  it("takes distances, in range, as whole columns", () => {
    expect(
      validateSettlementDocument(
        doc([
          entry({
            entry: "test_fence",
            route: { along: "high_road", offset: 3, side: "left" },
          }),
        ]),
      ).diagnostics,
    ).toEqual([]);
    expect(
      names(doc([entry({ entry: "test_fence", route: { ring: "holding", margin: 4000 } })])),
    ).toContain("PARAM_OUT_OF_RANGE");
    expect(
      names(doc([entry({ entry: "test_fence", route: { along: "road", side: "north" } })])),
    ).toContain("INFRA_ENTRY_PARAM");
  });

  it("takes `between` as a pair of placed anchors, and nothing else", () => {
    // Landed 2026-08-15. The form's value is an array of exactly two node ids,
    // which is the only shape a span could be strung on — and every other
    // reading of it is a document the compiler would have to guess at.
    const good = doc([
      entry({
        entry: "harbour_chain_tower",
        route: { between: ["north_mole", "south_mole"] },
      }),
    ]);
    expect(validateSettlementDocument(good).diagnostics).toEqual([]);
    for (const bad of [
      "north_mole",
      ["north_mole"],
      ["north_mole", "south_mole", "mid"],
      ["north_mole", 3],
      ["north_mole", ""],
    ]) {
      const result = doc([entry({ entry: "harbour_chain_tower", route: { between: bad } })]);
      expect(names(result), JSON.stringify(bad)).toContain("INFRA_ENTRY_PARAM");
    }
  });

  it("refuses a `between` run from a thing to itself — it has no length", () => {
    const same = doc([
      entry({ entry: "harbour_chain_tower", route: { between: ["mole", "mole"] } }),
    ]);
    expect(names(same)).toContain("INFRA_ENTRY_PARAM");
    expect(hints(same).join(" ")).toContain("two different");
  });

  it("still refuses a form the entry does not accept, pair or not", () => {
    const held = doc([entry({ entry: "test_fence", route: { between: ["a", "b"] } })]);
    expect(names(held)).toContain("INFRA_ENTRY_PARAM");
    expect(hints(held).join(" ")).toContain("ring");
  });
});

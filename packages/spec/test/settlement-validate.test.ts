import { describe, expect, it } from "vitest";

import {
  CONSTRAINT_REGISTRY,
  canonicalize,
  resolveTypeKey,
  strengthOf,
  validateSettlementDocument,
  weightOf
} from "../src/ir.js";

/** A minimal settlement document; `patch` replaces `root.children` extras. */
function doc(extras: unknown[] = []): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "hollow_dale", worldSeed: 42 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [256, 256] },
      children: [
        { id: "terrain", kind: "generator", generator: "terrain.heightfield@0", params: {} },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        ...extras
      ]
    }
  };
}

function building(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "town_hall",
    kind: "generator",
    generator: "building.grammar@0",
    envelope: { shape: "box", size: [12, 9, 10] },
    params: { floors: 2 },
    ...patch
  };
}

/** Codes of every diagnostic produced. */
function codes(input: unknown): string[] {
  return validateSettlementDocument(input).diagnostics.map((d) => d.code);
}

/** Names of every diagnostic produced. */
function names(input: unknown): string[] {
  return validateSettlementDocument(input).diagnostics.map((d) => d.name);
}

describe("settlement profile — document shape", () => {
  it("accepts a terrain-only document under the settlement profile", () => {
    const result = validateSettlementDocument(doc());
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("accepts a building, a road network and a plaza", () => {
    const result = validateSettlementDocument(
      doc([
        building(),
        { id: "streets", kind: "generator", generator: "road.network@0", params: { anchors: ["town_hall"] } },
        { id: "plaza", kind: "primitive", envelope: { shape: "region", size: [24, 24] } }
      ]),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("rejects a document whose profile is not settlement", () => {
    const bad = doc() as { profile: string };
    bad.profile = "terrain";
    expect(names(bad)).toContain("BAD_DOCUMENT");
  });

  it("rejects a generator outside the settlement profile", () => {
    const result = validateSettlementDocument(
      doc([{ id: "caves", kind: "generator", generator: "cave.carver@0", params: {} }]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain("STRUCTURE_GENERATOR_NOT_IN_PROFILE");
    expect(result.diagnostics[0]?.code).toBe("LOAM-T200");
  });

  it("allows at most one plaza", () => {
    const result = validateSettlementDocument(
      doc([
        { id: "market", kind: "primitive", envelope: { shape: "region", size: [24, 24] } },
        { id: "green", kind: "primitive", envelope: { shape: "region", size: [16, 16] } }
      ]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain("PLAZA_CARDINALITY");
  });

  it("rejects children of a structure node", () => {
    expect(names(doc([building({ children: [] })]))).toContain("STRUCTURE_NODE_SHAPE");
  });

  it("keeps the terrain profile's restrictions on terrain nodes", () => {
    const result = validateSettlementDocument(
      doc([
        {
          id: "trees",
          kind: "generator",
          generator: "scatter.forest@0",
          params: { species: [{ id: "oak", shape: "oak_round" }] },
          constraints: [{ zone: "north" }]
        }
      ]),
    );
    expect(result.diagnostics.map((d) => d.name)).toContain("CONSTRAINTS_NOT_ALLOWED");
  });

  it("still requires exactly one heightfield and one climate node", () => {
    const bare = {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "x", worldSeed: 1 },
      root: { id: "world", kind: "composite", envelope: { shape: "region", size: [64, 64] }, children: [building()] }
    };
    expect(names(bare).filter((n) => n === "GENERATOR_CARDINALITY")).toHaveLength(2);
  });
});

describe("settlement profile — envelopes", () => {
  it("rejects a two-element box size with LOAM-E153", () => {
    expect(codes(doc([building({ envelope: { shape: "box", size: [12, 10] } })]))).toContain("LOAM-E153");
  });

  it("coerces a three-element region size with LOAM-W152", () => {
    const result = validateSettlementDocument(
      doc([{ id: "plaza", kind: "primitive", envelope: { shape: "region", size: [24, 4, 24] } }]),
    );
    const coerced = result.diagnostics.find((d) => d.code === "LOAM-W152");
    expect(coerced?.severity).toBe("warning");
    // A warning must not stop the compile.
    expect(result.document).toBeDefined();
  });

  it("rejects a non-box structure envelope", () => {
    expect(names(doc([building({ envelope: { shape: "cylinder", size: [8, 8, 8] } })]))).toContain("BAD_ENVELOPE");
  });

  it("rejects minSize larger than size", () => {
    const result = validateSettlementDocument(
      doc([building({ envelope: { shape: "box", size: [10, 8, 10], minSize: [12, 8, 10], flexible: true } })]),
    );
    expect(result.diagnostics.map((d) => d.message).join()).toMatch(/wrong side/);
  });

  it("rejects an unquantized yaw in rotations", () => {
    expect(names(doc([building({ envelope: { shape: "box", size: [8, 8, 8], rotations: [45] } })]))).toContain(
      "BAD_ENVELOPE",
    );
  });
});

describe("settlement profile — constraints", () => {
  it("accepts every tier-1 constraint in shorthand", () => {
    const result = validateSettlementDocument(
      doc([
        { id: "well", kind: "generator", generator: "building.grammar@0", envelope: { shape: "box", size: [3, 3, 3] }, params: {} },
        building({
          constraints: [
            { zone: "north" },
            { at: [0.4, 0.4] },
            { adjacent_to: "well", gap: [0, 2] },
            { distance: "well", min: 4, max: 40 },
            { facing: "well"},
            { not_overlapping: "well" },
            { clearance: 3 },
            { terrain_conform: "cut_fill", reference: "median"}
          ]
        })
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects a constraint type the solver does not implement — nothing parses and is ignored", () => {
    const result = validateSettlementDocument(doc([building({ constraints: [{ within: "root" }] })]));
    expect(result.diagnostics.some((d) => d.code === "LOAM-E104")).toBe(true);
    expect(result.document).toBeUndefined();
  });

  it("implements every registry type — nothing in the vocabulary parses and is ignored", () => {
    const implemented = [
      "zone", "at", "adjacent_to", "distance", "facing",
      "not_overlapping", "clearance", "terrain_conform", "connected",
      "along", "beside", "on"
    ];
    expect([...CONSTRAINT_REGISTRY].sort()).toEqual([...implemented].sort());
    for (const type of CONSTRAINT_REGISTRY) {
      const result = validateSettlementDocument(
        doc([building({ constraints: [{ type, to: "other", target: "@terrain:ridge" }] })]),
      );
      expect(result.diagnostics.some((d) => d.name === "CONSTRAINT_NOT_IMPLEMENTED"), type).toBe(false);
    }
  });

  describe("`along` / `beside` / `on` — the tier-2 corridor constraints", () => {
    /** Diagnostics about the constraint itself, with the fixture's own noise dropped. */
    const of = (constraint: Record<string, unknown>) =>
      validateSettlementDocument(doc([building({ constraints: [constraint] })])).diagnostics.filter(
        (d) => d.name === "BAD_CONSTRAINT" || d.name === "CONSTRAINT_NOT_IMPLEMENTED",
      );

    it("accepts a well-formed `along` with nothing to say about it", () => {
      expect(of({ along: "main_street", offset: [3, 6], side: "left", at: 0.5 })).toEqual([]);
    });

    it("accepts `beside` — its fields are `along`'s", () => {
      expect(of({ beside: "@terrain:river", offset: 4})).toEqual([]);
    });

    it("needs a target, and says what one looks like", () => {
      const d = of({ type: "along", offset: 3 })[0];
      expect(d?.name).toBe("BAD_CONSTRAINT");
      expect(d?.message).toMatch(/target/);
    });

    it("rejects an offset band that reads backwards, and offers the swap", () => {
      const d = of({ along: "main_street", offset: [8, 2] })[0];
      expect(d?.name).toBe("BAD_CONSTRAINT");
      expect(d?.fix).toMatch(/near, far/);
    });

    it("refuses `spacing`, which nothing enforces", () => {
      const d = of({ along: "main_street", spacing: 3 })[0];
      expect(d?.name).toBe("BAD_CONSTRAINT");
      expect(d?.severity).toBe("error");
      expect(d?.fix).toMatch(/clearance/);
    });

    it("checks `on` against the products this compiler actually derives", () => {
      expect(of({ on: "@terrain:coastline", band: 6, partial: 0.8 })).toEqual([]);
      expect(of({ on: "@terrain:ridge" })).toEqual([]);
      expect(of({ on: "@terrain:peak" })).toEqual([]);
      const d = of({ on: "volcano_kez#rim" })[0];
      expect(d?.name).toBe("BAD_CONSTRAINT");
      expect(d?.severity).toBe("error");
      expect(d?.fix).toMatch(/@terrain:coastline/);
    });

  });

  it("errors on a constraint type outside the v0.2 registry", () => {
    const result = validateSettlementDocument(doc([building({ constraints: [{ after: "well" }] })]));
    const e104 = result.diagnostics.find((d) => d.code === "LOAM-E104");
    expect(e104?.name).toBe("UNKNOWN_CONSTRAINT_TYPE");
    expect(e104?.severity).toBe("error");
    expect(result.document).toBeUndefined();
  });

  it("errors on an ambiguous shorthand", () => {
    expect(codes(doc([building({ constraints: [{ zone: "north", clearance: 2 }] })]))).toContain("LOAM-E169");
  });

  it("errors on an unknown zone token", () => {
    expect(codes(doc([building({ constraints: [{ zone: "up" }] })]))).toContain("LOAM-E162");
  });

  it("errors on an out-of-range coarse coordinate", () => {
    expect(codes(doc([building({ constraints: [{ at: [1.4, 0.2] }] })]))).toContain("LOAM-E166");
  });

  it("rejects a terrain-anchor `at` — only the fractional form is resolved", () => {
    const result = validateSettlementDocument(doc([building({ constraints: [{ at: "@terrain:peak" }] })]));
    expect(result.document).toBeUndefined();
  });

  it("rejects an unknown field on a constraint", () => {
    expect(names(doc([building({ constraints: [{ zone: "north", bearing: 12 }] })]))).toContain("UNKNOWN_KEY");
  });

  it("rejects a bad strength", () => {
    expect(names(doc([building({ constraints: [{ zone: "north", strength: "medium" }] })]))).toContain("BAD_CONSTRAINT");
  });

  it("requires a target on a relational constraint", () => {
    expect(names(doc([building({ constraints: [{ type: "distance", min: 4 }] })]))).toContain("BAD_CONSTRAINT");
  });

  it("rejects a terrain_conform mode the solver does not implement", () => {
    const result = validateSettlementDocument(doc([building({ constraints: [{ terrain_conform: "drape" }] })]));
    expect(result.document).toBeUndefined();
    expect(names(doc([building({ constraints: [{ terrain_conform: "drape" }] })]))).toContain("BAD_CONSTRAINT");
  });
});

describe("settlement profile — ports", () => {
  it("accepts door and road_stub ports on the four horizontal faces", () => {
    const result = validateSettlementDocument(
      doc([
        building({
          ports: {
            main_door: { type: "door", face: "south" },
            north_road: { type: "road_stub", face: "north" }
          }
        })
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("errors on a port type outside Loam v0.2", () => {
    const result = validateSettlementDocument(doc([building({ ports: { p: { type: "portcullis" } } })]));
    expect(result.diagnostics.find((d) => d.code === "LOAM-E105")?.severity).toBe("error");
  });

  it("rejects a port type the profile does not resolve", () => {
    const result = validateSettlementDocument(doc([building({ ports: { berth: { type: "dock", face: "north" } } })]));
    expect(result.diagnostics.find((d) => d.name === "UNKNOWN_PORT_TYPE")?.severity).toBe("error");
    expect(result.document).toBeUndefined();
  });

  it("resolves a tunnel_stub without complaint — the cellar port is implemented", () => {
    const result = validateSettlementDocument(doc([building({ ports: { cellar: { type: "tunnel_stub", face: "north" } } })]));
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("errors on a vertical face and on an unknown one", () => {
    expect(names(doc([building({ ports: { hatch: { type: "door", face: "up" } } })]))).toContain("BAD_PORT");
    expect(names(doc([building({ ports: { hatch: { type: "door", face: "sideways" } } })]))).toContain("BAD_PORT");
  });

  it("rejects an out-of-range port `at`", () => {
    expect(names(doc([building({ ports: { d: { type: "door", face: "south", at: [1.2, 0] } } })]))).toContain("BAD_PORT");
  });

  it("rejects a port name that is not a Loam id", () => {
    expect(names(doc([building({ ports: { "Front Door": { type: "door" } } })]))).toContain("BAD_ID");
  });
});

describe("settlement profile — generator params", () => {
  it("rejects an out-of-range building param", () => {
    expect(names(doc([building({ params: { floors: 99 } })]))).toContain("PARAM_OUT_OF_RANGE");
  });

  it("rejects an unknown building param", () => {
    expect(names(doc([building({ params: { storeys: 3 } })]))).toContain("UNKNOWN_KEY");
  });

  it("accepts the profile's road shorthands", () => {
    const result = validateSettlementDocument(
      doc([
        {
          id: "streets",
          kind: "generator",
          generator: "road.network@0",
          params: { anchors: ["town_hall"], width: 3, lanterns: false}
        }
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

});

describe("constraint registry", () => {
  it("resolves a bare `at` to the at constraint", () => {
    const resolved = resolveTypeKey({ at: [0.3, 0.7] });
    expect(resolved.ok && resolved.type).toBe("at");
  });

  it("desugars shorthand into the type's primary argument", () => {
    const c = canonicalize({ distance: "well", min: 6 }, "distance", true);
    expect(c).toEqual({ type: "distance", target: "well", min: 6 });
  });

  it("applies per-type default strengths and weights", () => {
    expect(strengthOf({ type: "facing", target: "x" })).toBe("soft");
    expect(strengthOf({ type: "distance", target: "x" })).toBe("hard");
    expect(strengthOf({ type: "zone", zone: "north" })).toBe("soft");
    expect(strengthOf({ type: "zone", zone: "north", mode: "contain" })).toBe("hard");
    expect(weightOf({ type: "facing", target: "x" })).toBe(2);
    expect(weightOf({ type: "align", target: "x" })).toBe(1);
    expect(weightOf({ type: "facing", target: "x", weight: 5 })).toBe(5);
  });
});

/* -------------------------------------------------------------------------- */

describe("settlement profile — the `connected` constraint", () => {
  /** A second building, so a `connected` constraint has somewhere to point. */
  function chapel(patch: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "chapel",
      kind: "generator",
      generator: "building.grammar@0",
      envelope: { shape: "box", size: [11, 9, 12] },
      ...patch
    };
  }

  const tunnel = { connected: "town_hall", via: "tunnel" };

  it("accepts a tunnel between two buildings, with no warning", () => {
    const result = validateSettlementDocument(
      doc([building(), chapel({ constraints: [tunnel] })]),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toBeDefined();
  });

  it("defaults `via` to the connector it builds", () => {
    const result = validateSettlementDocument(
      doc([building(), chapel({ constraints: [{ connected: "town_hall" }] })]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects a `via` this compiler does not build, naming the way out", () => {
    const result = validateSettlementDocument(
      doc([building(), chapel({ constraints: [{ connected: "town_hall", via: "road" }] })]),
    );
    const e = result.diagnostics.find((d) => d.name === "BAD_CONSTRAINT" && /via/.test(d.message));
    expect(e?.severity).toBe("error");
    expect(e?.fix).toMatch(/road\.network@0/);
    expect(result.document).toBeUndefined();
  });

  it("errors, with the ids that do exist, on an unknown target", () => {
    const result = validateSettlementDocument(
      doc([building(), chapel({ constraints: [{ connected: "granary", via: "tunnel" }] })]),
    );
    const e = result.diagnostics.find((d) => d.name === "BAD_CONSTRAINT");
    expect(e?.severity).toBe("error");
    expect(e?.message).toMatch(/not a child of the root/);
    expect(e?.fix).toMatch(/town_hall/);
    expect(result.document).toBeUndefined();
  });

  it("errors, naming the other end, on a node connected to itself", () => {
    const result = validateSettlementDocument(
      doc([building(), chapel({ constraints: [{ connected: "chapel", via: "tunnel" }] })]),
    );
    const e = result.diagnostics.find((d) => d.name === "BAD_CONSTRAINT");
    expect(e?.message).toMatch(/connected to itself/);
    expect(e?.fix).toMatch(/town_hall/);
    expect(result.document).toBeUndefined();
  });

  it("errors on a target that is not a building", () => {
    const plaza = {
      id: "green",
      kind: "primitive",
      envelope: { shape: "region", size: [20, 20] }
    };
    const result = validateSettlementDocument(
      doc([plaza, chapel({ constraints: [{ connected: "green", via: "tunnel" }] })]),
    );
    const e = result.diagnostics.find((d) => d.name === "BAD_CONSTRAINT");
    expect(e?.message).toMatch(/plaza/);
    expect(e?.fix).toMatch(/cellar|building/);
    expect(result.document).toBeUndefined();
  });

  it("errors on a tag-set target — a tunnel has exactly two ends", () => {
    const result = validateSettlementDocument(
      doc([building(), chapel({ constraints: [{ connected: "#tag:house", via: "tunnel" }] })]),
    );
    const e = result.diagnostics.find((d) => d.name === "BAD_CONSTRAINT");
    expect(e?.message).toMatch(/two ends/);
    expect(result.document).toBeUndefined();
  });

  it("errors on a missing target", () => {
    const result = validateSettlementDocument(
      doc([building(), chapel({ constraints: [{ type: "connected", via: "tunnel" }] })]),
    );
    expect(names(doc([building(), chapel({ constraints: [{ type: "connected" }] })]))).toContain(
      "BAD_CONSTRAINT",
    );
    expect(result.document).toBeUndefined();
  });

  it("is hard by default and weighted 1.0, per the v0.2 registry", () => {
    const resolved = resolveTypeKey(tunnel);
    expect(resolved.ok && resolved.type).toBe("connected");
    const c = canonicalize(tunnel, "connected", true);
    expect(c["to"]).toBe("town_hall");
    expect(strengthOf(c)).toBe("hard");
    expect(weightOf(c)).toBe(1);
  });
});

describe("settlement profile — the `basement` param", () => {
  const withBasement = (basement: unknown): unknown =>
    doc([building({ params: { floors: 1, basement } })]);

  it("accepts true, an object depth, and the catalog's bare int", () => {
    for (const value of [true, false, { depth: 3 }, { depth: 5 }, 4, 0]) {
      expect(validateSettlementDocument(withBasement(value)).diagnostics, String(JSON.stringify(value))).toEqual([]);
    }
  });

  it("errors, with the fix, on a depth outside 3..5", () => {
    for (const value of [{ depth: 2 }, { depth: 9 }, 12]) {
      const d = validateSettlementDocument(withBasement(value)).diagnostics;
      expect(d[0]?.name).toBe("STRUCTURE_PARAM");
      expect(d[0]?.fix).toMatch(/"basement": true/);
    }
  });

  it("errors on an unknown key inside the object form", () => {
    expect(names(withBasement({ depth: 4, height: 4 }))).toContain("UNKNOWN_KEY");
  });
});

/* -------------------------------------------------------------------------- */
/* `infra.wall@0` — `params.walls`                                             */
/* -------------------------------------------------------------------------- */

/** A district that a `walls` patch can be hung on. */
function walledDistrict(walls: unknown): Record<string, unknown> {
  return {
    id: "quarter",
    kind: "district",
    envelope: { shape: "region", size: [120, 120] },
    params: {
      fabric: "grid",
      density: "medium",
      mix: ["cottage", "shop_row"],
      ...(walls === undefined ? {} : { walls })
    }
  };
}

describe("settlement profile — walls", () => {
  it("accepts the empty opt-in, which is the whole point of the surface", () => {
    expect(codes(doc([walledDistrict({})]))).toEqual([]);
  });

  it("accepts every knob at once, and every style", () => {
    for (const style of ["masonry", "palisade", "earthwork"]) {
      expect(
        codes(doc([walledDistrict({ style, height: 8, gates: false })])),
      ).toEqual([]);
    }
  });

  it("takes the same param on a city", () => {
    const city = {
      id: "capital",
      kind: "city",
      envelope: { shape: "region", size: [240, 240] },
      params: { size: "small", mix: ["cottage"], walls: { style: "masonry" } }
    };
    expect(codes(doc([city]))).toEqual([]);
  });

  it("rejects an unknown style, and names the three", () => {
    const result = validateSettlementDocument(doc([walledDistrict({ style: "adamantium" })]));
    expect(result.diagnostics.map((d) => d.name)).toEqual(["WALL_PARAM"]);
    expect(result.diagnostics[0]?.code).toBe("LOAM-T219");
    expect(result.diagnostics[0]?.fix).toContain("masonry");
  });

  it("rejects a wall that is not an object at all", () => {
    expect(names(doc([walledDistrict(true)]))).toEqual(["WALL_PARAM"]);
    expect(names(doc([walledDistrict("yes")]))).toEqual(["WALL_PARAM"]);
  });

  it("rejects an unknown key rather than silently ignoring it", () => {
    expect(names(doc([walledDistrict({ moat: true })]))).toEqual(["UNKNOWN_KEY"]);
  });

  it("leaves a district with no walls key completely alone", () => {
    expect(codes(doc([walledDistrict(undefined)]))).toEqual([]);
  });

  it("takes a per-role material override, whole or partial", () => {
    expect(
      codes(doc([walledDistrict({ materials: { merlon: "chiseled_sandstone" } })])),
    ).toEqual([]);
    expect(
      codes(
        doc([
          walledDistrict({
            materials: {
              core: "sandstone",
              walk: "smooth_sandstone",
              parapet: "sandstone",
              merlon: "chiseled_sandstone",
              tower: "cut_sandstone"
            }
          })
        ]),
      ),
    ).toEqual([]);
  });

  it("rejects a material override that is not blocks", () => {
    expect(names(doc([walledDistrict({ materials: "sandstone" })]))).toEqual(["WALL_PARAM"]);
    expect(names(doc([walledDistrict({ materials: { core: 7 } })]))).toEqual(["WALL_PARAM"]);
    expect(names(doc([walledDistrict({ materials: { crenel: "sandstone" } })]))).toEqual([
      "UNKNOWN_KEY"
    ]);
  });
});

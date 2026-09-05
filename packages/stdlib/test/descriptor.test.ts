import { describe, expect, it } from "vitest";

import {
  buildingIdFromTags,
  createStructureRegistry,
  defineBuildingDescriptors,
  definePropDescriptors,
  descriptorIdFromTags,
  findByTag,
  isBuildingDescriptor,
  isPropDescriptor,
  propIdFromTags,
  StructureRegistry,
  type BuildingDescriptor,
  type BuildingFacadeDefaults,
  type PropDescriptor,
} from "../src/structures/descriptor.js";

// Helpers — descriptors use leaf handles directly, no global registry.
// Dummy furnish/generator mirrors leaf-owned handles without importing
// structures that still carry legacy side-effect registration.
function dummyFurnish(_ctx: unknown): number {
  return 42;
}

function dummyGenerator(_ctx: unknown): unknown {
  return { ops: [], meta: { size: [1, 1, 1] as const, minY: 0, base: "ground" as const } };
}

function building(
  id: string,
  tags: readonly string[] = [id],
  aliases: readonly string[] = [],
  facade: { windowShape?: string; windowRhythm?: string; roof?: string } | undefined = undefined,
): BuildingDescriptor {
  const d: BuildingDescriptor = {
    kind: "building",
    id,
    tags,
    aliases,
    furnish: dummyFurnish as unknown as (ctx: unknown) => number,
  };
  return facade === undefined ? d : { ...d, facadeDefaults: facade };
}

function prop(
  id: string,
  tags: readonly string[] = [id],
): PropDescriptor {
  const footprint = (params: Readonly<Record<string, unknown>>) => {
    const length = typeof params["length"] === "number" ? (params["length"] as number) : 5;
    const width = typeof params["width"] === "number" ? (params["width"] as number) : 1;
    return {
      size: [width, 1, length] as readonly [number, number, number],
      minY: 0 as const,
      base: "ground" as const,
      piles: [] as readonly { readonly x: number; readonly z: number }[],
    };
  };
  return {
    kind: "prop",
    id,
    tags,
    footprint,
    generator: dummyGenerator as unknown as (ctx: unknown) => unknown,
  };
}

// Order / duplicate / narrowing — explicit factory population
describe("descriptor registry — deterministic ordered registration via factory", () => {
  it("preserves explicit insertion order for list() via createStructureRegistry", () => {
    const a = building("a");
    const b = prop("b");
    const c = building("c");
    const r = createStructureRegistry(a, b, c);
    expect(r.list().map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("preserves insertion order via StructureRegistry constructor", () => {
    const r = new StructureRegistry([building("a"), prop("b"), building("c")]);
    expect(r.list().map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("preserves insertion order for typed views", () => {
    const r = createStructureRegistry(building("b1"), prop("p1"), building("b2"), prop("p2"));
    expect(r.listBuildings().map((d) => d.id)).toEqual(["b1", "b2"]);
    expect(r.listProps().map((d) => d.id)).toEqual(["p1", "p2"]);
  });

  it("findByTag respects insertion-order priority over tags and aliases", () => {
    const r = createStructureRegistry(building("first", ["shared"]), building("second", ["shared"]));
    expect(findByTag(r, "shared")?.id).toBe("first");

    const r2 = createStructureRegistry(prop("alpha", ["x"]), building("beta", ["y"], ["x"]));
    expect(findByTag(r2, "x")?.id).toBe("alpha");

    expect(findByTag(r2, "missing")).toBeUndefined();
    const r3 = createStructureRegistry(building("k1", ["k1"], ["alias"]), building("k2", ["alias"]));
    expect(findByTag(r3, "alias")?.id).toBe("k1");
  });

  it("size reflects number of descriptors", () => {
    expect(createStructureRegistry().size).toBe(0);
    expect(createStructureRegistry(building("a"), prop("b")).size).toBe(2);
  });

  it("list() is immutable-by-convention — frozen and push does not affect registry", () => {
    const r = createStructureRegistry(building("a"));
    const list = r.list();
    expect(Object.isFrozen(list)).toBe(true);
    expect(() => (list as unknown as BuildingDescriptor[]).push(building("b") as never)).toThrow();
    expect(r.size).toBe(1);
  });
});

describe("descriptor registry — duplicate-id rejection at construction", () => {
  it("throws on duplicate id across kinds via factory", () => {
    expect(() => createStructureRegistry(building("dup"), prop("dup"))).toThrow(/duplicate structure id "dup"/);
  });

  it("throws on duplicate id within same kind via constructor", () => {
    expect(() => new StructureRegistry([building("same"), building("same")])).toThrow(
      /duplicate structure id "same"/,
    );
  });

  it("throws on duplicate id when spread arrays contain duplicate", () => {
    const a = building("x");
    const b = prop("y");
    expect(() => createStructureRegistry(a, b, building("y"))).toThrow(/duplicate structure id "y"/);
  });

  it("does not partially populate after duplicate throw", () => {
    const attempt = () => createStructureRegistry(building("a"), building("b"), building("a"));
    expect(attempt).toThrow(/duplicate structure id "a"/);
    const r = createStructureRegistry(building("a"), building("b"));
    expect(r.has("a")).toBe(true);
    expect(r.has("b")).toBe(true);
  });

  it("validates missing furnish/generator/footprint handles", () => {
    expect(() =>
      createStructureRegistry({
        kind: "building",
        id: "bad",
        tags: ["bad"],
        furnish: undefined as unknown as (ctx: unknown) => number,
      }),
    ).toThrow(/missing furnish/);
    expect(() =>
      createStructureRegistry({
        kind: "prop",
        id: "bad2",
        tags: ["bad2"],
        footprint: (() => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const })) as PropDescriptor["footprint"],
        generator: undefined as unknown as (ctx: unknown) => unknown,
      }),
    ).toThrow(/missing generator/);
    expect(() =>
      createStructureRegistry({
        kind: "prop",
        id: "bad3",
        tags: ["bad3"],
        footprint: undefined as unknown as PropDescriptor["footprint"],
        generator: (() => ({})) as (ctx: unknown) => unknown,
      }),
    ).toThrow(/missing footprint/);
  });
});

describe("descriptor registry — variant narrowing and typed accessors", () => {
  it("isBuildingDescriptor / isPropDescriptor narrow the union", () => {
    const r = createStructureRegistry(building("narrow-b"), prop("narrow-p"));
    const buildings = r.list().filter(isBuildingDescriptor);
    const props = r.list().filter(isPropDescriptor);
    expect(buildings).toHaveLength(1);
    expect(props).toHaveLength(1);
    expect(buildings[0]?.id).toBe("narrow-b");
    expect(props[0]?.id).toBe("narrow-p");
    for (const d of r.list()) {
      if (isBuildingDescriptor(d)) {
        expect(d.kind).toBe("building");
        expect(typeof d.furnish).toBe("function");
        expect((d as unknown as PropDescriptor).footprint).toBeUndefined();
        expect((d as unknown as PropDescriptor).generator).toBeUndefined();
      } else {
        expect(isPropDescriptor(d)).toBe(true);
        expect(d.kind).toBe("prop");
        expect(typeof d.footprint).toBe("function");
        expect(typeof d.generator).toBe("function");
      }
    }
  });

  it("getBuilding / getProp return typed views and undefined for mismatched kind", () => {
    const r = createStructureRegistry(building("only-building"), prop("only-prop"));
    expect(r.getBuilding("only-building")?.id).toBe("only-building");
    expect(r.getProp("only-building")).toBeUndefined();
    expect(r.getProp("only-prop")?.id).toBe("only-prop");
    expect(r.getBuilding("only-prop")).toBeUndefined();
    expect(r.get("only-building")?.kind).toBe("building");
    expect(r.get("only-prop")?.kind).toBe("prop");
    expect(r.get("missing")).toBeUndefined();
    expect(r.has("only-building")).toBe(true);
    expect(r.has("missing")).toBe(false);
  });

  it("alias sets are preserved per-entry and retrievable via findByTag", () => {
    const keep = building("keep", ["keep"], ["castle", "donjon", "citadel"]);
    const r = createStructureRegistry(keep);
    const fetched = r.get("keep");
    expect(fetched?.aliases).toEqual(["castle", "donjon", "citadel"]);
    expect(findByTag(r, "donjon")?.id).toBe("keep");
    expect(findByTag(r, "citadel")?.id).toBe("keep");
    expect(findByTag(r, "castle")?.id).toBe("keep");
  });

  it("catalog kind override preserved via descriptor kind", () => {
    const r = createStructureRegistry({
      kind: "prop",
      id: "houseboat",
      tags: ["houseboat"],
      footprint: (() => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const, piles: [] })) as PropDescriptor["footprint"],
      generator: dummyGenerator as unknown as (ctx: unknown) => unknown,
      catalog: { category: "residential", kindOverride: "prop", wave: 6, tags: ["water"] },
    });
    const hb = r.getProp("houseboat");
    expect(hb?.kind).toBe("prop");
    expect(hb?.catalog?.category).toBe("residential");
    expect(hb?.catalog?.kindOverride).toBe("prop");
  });
});

describe("descriptor registry — no global singleton / no plugin surface", () => {
  it("does not export global singleton or registration helpers", async () => {
    // Exception: dynamic import to verify absence of global plugin surface at runtime — specifier is literal but test intentionally checks module shape.
    const mod = (await import("../src/structures/descriptor.js")) as unknown as Record<string, unknown>;
    expect(mod["structureRegistry"]).toBeUndefined();
    expect(mod["registerStructure"]).toBeUndefined();
    expect(mod["registerStructures"]).toBeUndefined();
    expect(mod["getStructure"]).toBeUndefined();
    expect(mod["getBuilding"]).toBeUndefined();
    expect(mod["getProp"]).toBeUndefined();
    expect(mod["hasStructure"]).toBeUndefined();
    expect(mod["listStructures"]).toBeUndefined();
    expect(mod["listBuildings"]).toBeUndefined();
    expect(mod["listProps"]).toBeUndefined();
  });

  it("StructureRegistry has no mutating register/clear surface", () => {
    const r = createStructureRegistry(building("a"));
    expect((r as unknown as Record<string, unknown>)["register"]).toBeUndefined();
    expect((r as unknown as Record<string, unknown>)["registerAll"]).toBeUndefined();
    expect((r as unknown as Record<string, unknown>)["clear"]).toBeUndefined();
  });

  it("importing descriptor does not populate a shared global — factories are isolated", () => {
    const a = createStructureRegistry(building("isolated-a"));
    const b = createStructureRegistry(building("isolated-b"));
    expect(a.has("isolated-a")).toBe(true);
    expect(a.has("isolated-b")).toBe(false);
    expect(b.has("isolated-b")).toBe(true);
    expect(b.has("isolated-a")).toBe(false);
    const c = createStructureRegistry(building("isolated-a"), prop("x"));
    expect(c.size).toBe(2);
    expect(a.size).toBe(1);
  });
});

// Delegation — factory-populated registry delegates to existing behavior without re-implementation
describe("descriptor seam — delegation to existing behavior via factory", () => {
  function descriptorsInFoundationOrder(): readonly (BuildingDescriptor | PropDescriptor)[] {
    // Mirrors historical insertion order, populated explicitly via factory, not side-effect registration.
    // Facade defaults are nullable per-field; furnish/generator/footprint are leaf handles.
    const cottageFacade = { windowShape: "single", windowRhythm: "regular", roof: "gable" } as const;
    const churchFacade = { windowShape: "mullion", windowRhythm: "paired", roof: "hip" } as const;
    return [
      {
        kind: "building",
        id: "cottage",
        tags: ["cottage", "house"],
        aliases: ["hut"],
        facadeDefaults: cottageFacade,
        furnish: dummyFurnish as unknown as (ctx: unknown) => number,
        dispatch: "standard",
        catalog: { category: "residential" },
      },
      {
        kind: "building",
        id: "church",
        tags: ["church", "chapel", "temple", "shrine"],
        aliases: ["cathedral"],
        facadeDefaults: churchFacade,
        furnish: dummyFurnish as unknown as (ctx: unknown) => number,
        dispatch: "standard",
        catalog: { category: "civic", wave: 1 },
      },
      {
        kind: "building",
        id: "barn",
        tags: ["barn", "stable", "byre"],
        aliases: ["granary"],
        facadeDefaults: { windowShape: "single", roof: "gable" },
        furnish: dummyFurnish as unknown as (ctx: unknown) => number,
        dispatch: "standard",
        catalog: { category: "civic", wave: 1 },
      },
      {
        kind: "prop",
        id: "rowboat",
        tags: ["rowboat", "boat"],
        aliases: ["skiff"],
        footprint: (params) => ({
          size: [5, 1, 3] as const,
          minY: 0,
          base: "water" as const,
          piles: [],
        }),
        generator: dummyGenerator as unknown as (ctx: unknown) => unknown,
        catalog: { category: "transport-water" },
      },
      {
        kind: "prop",
        id: "fountain",
        tags: ["fountain"],
        aliases: ["well"],
        footprint: () => ({ size: [7, 1, 7] as const, minY: 0, base: "ground" as const, piles: [] }),
        generator: dummyGenerator as unknown as (ctx: unknown) => unknown,
        catalog: { category: "street-furniture" },
      },
      {
        kind: "prop",
        id: "pier",
        tags: ["pier", "jetty"],
        aliases: ["wharf"],
        footprint: (params) => {
          const length = typeof params["length"] === "number" ? (params["length"] as number) : 8;
          const width = typeof params["width"] === "number" ? (params["width"] as number) : 2;
          return { size: [width, 1, length] as const, minY: 0, base: "shore" as const, piles: [] };
        },
        generator: dummyGenerator as unknown as (ctx: unknown) => unknown,
        catalog: { category: "transport-water" },
      },
    ];
  }

  it("explicit registry contains foundation set in historical insertion order", () => {
    const r = createStructureRegistry(...descriptorsInFoundationOrder());
    const ids = r.list().map((d) => d.id);
    const expected = ["cottage", "church", "barn", "rowboat", "fountain", "pier"];
    let lastIdx = -1;
    for (const id of expected) {
      const idx = ids.indexOf(id);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
    expect(r.size).toBe(6);
  });

  it("building facadeDefaults are nullable per-field and preserved", () => {
    const r = createStructureRegistry(...descriptorsInFoundationOrder());
    expect(r.getBuilding("cottage")?.facadeDefaults).toEqual({ windowShape: "single", windowRhythm: "regular", roof: "gable" });
    expect(r.getBuilding("barn")?.facadeDefaults).toEqual({ windowShape: "single", roof: "gable" });
    // absent field stays undefined, not empty string
    expect(r.getBuilding("barn")?.facadeDefaults?.["windowRhythm"]).toBeUndefined();
  });

  it("building furnish handle delegates — same reference, no re-implementation", () => {
    const r = createStructureRegistry(...descriptorsInFoundationOrder());
    for (const id of ["cottage", "church", "barn"] as const) {
      const desc = r.getBuilding(id);
      expect(desc).toBeDefined();
      expect(typeof desc?.furnish).toBe("function");
      expect(desc?.furnish).toBe(dummyFurnish as unknown as (ctx: unknown) => number);
    }
  });

  it("prop footprint delegates param-dependently (pier length/width)", () => {
    const r = createStructureRegistry(...descriptorsInFoundationOrder());
    const pier = r.getProp("pier");
    expect(pier).toBeDefined();
    const a = pier?.footprint({ length: 12, width: 3 });
    expect(a?.size).toEqual([3, 1, 12]);
    const b = pier?.footprint({ length: 3, width: 1 });
    expect(b?.size).toEqual([1, 1, 3]);
    // static case unchanged
    expect(r.getProp("rowboat")?.footprint({})?.size).toEqual([5, 1, 3]);
  });

  it("prop generator delegates — same reference, no op re-implementation", () => {
    const r = createStructureRegistry(...descriptorsInFoundationOrder());
    for (const id of ["rowboat", "fountain", "pier"] as const) {
      const desc = r.getProp(id);
      expect(desc).toBeDefined();
      expect(desc?.generator).toBe(dummyGenerator as unknown as (ctx: unknown) => unknown);
    }
  });

  it("typed views filter correctly over factory registry", () => {
    const r = createStructureRegistry(...descriptorsInFoundationOrder());
    const buildings = r.listBuildings();
    const props = r.listProps();
    expect(buildings.every(isBuildingDescriptor)).toBe(true);
    expect(props.every(isPropDescriptor)).toBe(true);
    expect(buildings.some((d) => d.id === "cottage")).toBe(true);
    expect(props.some((d) => d.id === "rowboat")).toBe(true);
    expect(r.get("cottage")?.kind).toBe("building");
    expect(r.get("rowboat")?.kind).toBe("prop");
  });
});

// Builders — compact row construction, centralized type-erasure cast
describe("descriptor builders — defineBuildingDescriptors", () => {
  type TestCtx = { readonly x: number };

  function testFurnish(ctx: TestCtx): number {
    return ctx.x;
  }

  it("maps ordered ids preserving exact input order and returns frozen array", () => {
    const ids = ["church", "barn", "windmill"] as const;
    const descs = defineBuildingDescriptors<typeof ids[number], TestCtx>(ids, {
      furnish: testFurnish,
    });
    expect(descs.map((d) => d.id)).toEqual(["church", "barn", "windmill"]);
    expect(Object.isFrozen(descs)).toBe(true);
    expect(() => (descs as unknown as BuildingDescriptor[]).push(building("x") as never)).toThrow();
    // each descriptor frozen
    for (const d of descs) expect(Object.isFrozen(d)).toBe(true);
  });

  it("preserves tags/aliases via per-id callback and defaults tags to [id]", () => {
    const ids = ["keep", "gatehouse", "pagoda"] as const;
    const descs = defineBuildingDescriptors<typeof ids[number], TestCtx>(ids, {
      tags: (id) => (id === "keep" ? ["keep", "castle", "donjon"] : id === "gatehouse" ? ["gatehouse", "barbican"] : [id]),
      aliases: (id) => (id === "keep" ? ["citadel"] : []),
      furnish: testFurnish,
    });
    expect(descs[0]?.tags).toEqual(["keep", "castle", "donjon"]);
    expect(descs[0]?.aliases).toEqual(["citadel"]);
    expect(descs[1]?.tags).toEqual(["gatehouse", "barbican"]);
    expect(descs[1]?.aliases).toEqual([]);
    expect(descs[2]?.tags).toEqual(["pagoda"]);
    expect(descs[2]?.aliases).toEqual([]);
  });

  it("supports tags/aliases via record map form", () => {
    const ids = ["a", "b"] as const;
    const descs = defineBuildingDescriptors<typeof ids[number], TestCtx>(ids, {
      tags: { a: ["a", "alpha"], b: ["b"] } as const,
      aliases: { a: ["alias-a"], b: [] } as const,
      furnish: testFurnish,
    });
    expect(descs[0]?.tags).toEqual(["a", "alpha"]);
    expect(descs[0]?.aliases).toEqual(["alias-a"]);
    expect(descs[1]?.tags).toEqual(["b"]);
    expect(descs[1]?.aliases).toEqual([]);
  });

  it("preserves facadeDefaults per id and omits when undefined", () => {
    const ids = ["church", "barn", "keep"] as const;
    const descs = defineBuildingDescriptors<typeof ids[number], TestCtx>(ids, {
      tags: (id) => [id],
      facadeDefaults: (id): BuildingFacadeDefaults | undefined => {
        if (id === "church") return { windowShape: "tall", windowRhythm: "regular", roof: "gable" };
        if (id === "barn") return { windowShape: "single", roof: "gable" };
        return undefined;
      },
      furnish: testFurnish,
    });
    expect(descs[0]?.facadeDefaults).toEqual({ windowShape: "tall", windowRhythm: "regular", roof: "gable" });
    expect(descs[1]?.facadeDefaults).toEqual({ windowShape: "single", roof: "gable" });
    expect(descs[1]?.facadeDefaults?.["windowRhythm"]).toBeUndefined();
    expect(descs[2]?.facadeDefaults).toBeUndefined();
  });

  it("preserves dispatch via constant and per-id callback, and omits when undefined", () => {
    const ids = ["skyscraper", "office", "cottage"] as const;
    const byConstant = defineBuildingDescriptors<typeof ids[number], TestCtx>(ids.slice(0, 2) as readonly ("skyscraper" | "office")[], {
      tags: (id) => [id],
      furnish: testFurnish,
      dispatch: "highrise",
    });
    expect(byConstant[0]?.dispatch).toBe("highrise");
    expect(byConstant[1]?.dispatch).toBe("highrise");

    const byCallback = defineBuildingDescriptors<typeof ids[number], TestCtx>(ids, {
      tags: (id) => [id],
      furnish: testFurnish,
      dispatch: (id) => (id === "skyscraper" || id === "office" ? "highrise" : "standard"),
    });
    expect(byCallback[0]?.dispatch).toBe("highrise");
    expect(byCallback[1]?.dispatch).toBe("highrise");
    expect(byCallback[2]?.dispatch).toBe("standard");

    const noDispatch = defineBuildingDescriptors<"cottage", TestCtx>(["cottage"] as const, {
      furnish: testFurnish,
    });
    expect(noDispatch[0]?.dispatch).toBeUndefined();
  });

  it("centralizes furnish handle — same reference without per-row cast, generic concrete context preserved", () => {
    const ids = ["a", "b", "c"] as const;
    const descs = defineBuildingDescriptors<typeof ids[number], TestCtx>(ids, {
      furnish: testFurnish,
    });
    for (const d of descs) {
      expect(d.furnish).toBe(testFurnish as unknown as (ctx: unknown) => number);
      // param forwarding: concrete context still works via erased handle
      expect(d.furnish({ x: 7 } as unknown as unknown)).toBe(7);
    }
    // leaf arrays become one concise call — no per-row `as unknown as (ctx: unknown) => number` needed:
    // defineBuildingDescriptors(ARCHETYPES, { tags: tagsOf, facadeDefaults, furnish: furnishConcrete, dispatch: "standard" })
    // the single cast is inside the builder, not on every row.
  });

  it("is registry-compatible — preserves insertion order for findByTag and list", () => {
    const ids = ["first", "second"] as const;
    const descs = defineBuildingDescriptors<typeof ids[number], TestCtx>(ids, {
      tags: (id) => (id === "first" || id === "second" ? ["shared"] : [id]),
      furnish: testFurnish,
    });
    const r = createStructureRegistry(...descs);
    expect(r.list().map((d) => d.id)).toEqual(["first", "second"]);
    expect(findByTag(r, "shared")?.id).toBe("first");
    expect(r.listBuildings().map((d) => d.id)).toEqual(["first", "second"]);
  });
});

describe("descriptor builders — definePropDescriptors", () => {
  type TestGenCtx = { readonly y: number };

  function genA(ctx: TestGenCtx): unknown {
    return { a: ctx.y };
  }
  function genB(ctx: TestGenCtx): unknown {
    return { b: ctx.y };
  }
  function genC(ctx: TestGenCtx): unknown {
    return { c: ctx.y };
  }

  const gens = { pier: genA, rail_line: genB, fountain: genC } as const;

  it("maps ordered ids preserving exact input order and returns frozen array", () => {
    const ids = ["pier", "rail_line", "fountain"] as const;
    const descs = definePropDescriptors<typeof ids[number], TestGenCtx>(ids, {
      footprint: (id, params) => {
        if (id === "pier") {
          const length = typeof params["length"] === "number" ? (params["length"] as number) : 8;
          const width = typeof params["width"] === "number" ? (params["width"] as number) : 2;
          return { size: [width, 1, length] as const, minY: 0, base: "shore" as const };
        }
        if (id === "rail_line") {
          const length = typeof params["length"] === "number" ? (params["length"] as number) : 12;
          return { size: [length, 1, 3] as const, minY: 0, base: "ground" as const };
        }
        return { size: [7, 1, 7] as const, minY: 0, base: "ground" as const };
      },
      generator: (id) => gens[id],
    });
    expect(descs.map((d) => d.id)).toEqual(["pier", "rail_line", "fountain"]);
    expect(Object.isFrozen(descs)).toBe(true);
    expect(() => (descs as unknown as PropDescriptor[]).push(prop("x") as never)).toThrow();
    for (const d of descs) expect(Object.isFrozen(d)).toBe(true);
  });

  it("preserves tags/aliases via callback and defaults to [id]", () => {
    const ids = ["rowboat", "pier"] as const;
    const descs = definePropDescriptors<typeof ids[number], TestGenCtx>(ids, {
      footprint: (id) => (id === "rowboat" ? { size: [5, 1, 3] as const, minY: 0, base: "water" as const } : { size: [2, 1, 8] as const, minY: 0, base: "shore" as const }),
      generator: (id) => gens[id as keyof typeof gens] ?? genA,
      tags: (id) => (id === "rowboat" ? ["rowboat", "boat"] : ["pier", "jetty"]),
      aliases: (id) => (id === "rowboat" ? ["skiff"] : ["wharf"]),
    });
    expect(descs[0]?.tags).toEqual(["rowboat", "boat"]);
    expect(descs[0]?.aliases).toEqual(["skiff"]);
    expect(descs[1]?.tags).toEqual(["pier", "jetty"]);
    expect(descs[1]?.aliases).toEqual(["wharf"]);

    const defaults = definePropDescriptors<"a", TestGenCtx>(["a"] as const, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: () => genA,
    });
    expect(defaults[0]?.tags).toEqual(["a"]);
    expect(defaults[0]?.aliases).toBeUndefined();
  });

  it("supports tags/aliases via record map form", () => {
    const ids = ["a", "b"] as const;
    const descs = definePropDescriptors<typeof ids[number], TestGenCtx>(ids, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: () => genA,
      tags: { a: ["a", "alpha"], b: ["b"] } as const,
      aliases: { a: ["aa"], b: [] } as const,
    });
    expect(descs[0]?.tags).toEqual(["a", "alpha"]);
    expect(descs[0]?.aliases).toEqual(["aa"]);
    expect(descs[1]?.tags).toEqual(["b"]);
    expect(descs[1]?.aliases).toBeUndefined();
  });

  it("forwards params to footprint per id — pier length/width, rail grade/curve style", () => {
    const ids = ["pier", "fountain"] as const;
    const descs = definePropDescriptors<typeof ids[number], TestGenCtx>(ids, {
      footprint: (id, params) => {
        if (id === "pier") {
          const length = typeof params["length"] === "number" ? (params["length"] as number) : 8;
          const width = typeof params["width"] === "number" ? (params["width"] as number) : 2;
          return { size: [width, 1, length] as const, minY: -1, base: "shore" as const };
        }
        return { size: [7, 1, 7] as const, minY: -1, base: "ground" as const };
      },
      generator: (id) => (id === "pier" ? genA : genC),
    });
    const pier = descs.find((d) => d.id === "pier")!;
    expect(pier.footprint({ length: 12, width: 3 }).size).toEqual([3, 1, 12]);
    expect(pier.footprint({ length: 3, width: 1 }).size).toEqual([1, 1, 3]);
    expect(pier.footprint({}).size).toEqual([2, 1, 8]);
    expect(descs.find((d) => d.id === "fountain")!.footprint({}).size).toEqual([7, 1, 7]);
    // base/minY preserved
    expect(pier.footprint({ length: 10, width: 2 }).base).toBe("shore");
    expect(pier.footprint({}).minY).toBe(-1);
  });

  it("centralizes generator handle — same reference without per-row cast, supports lookup and callback forms", () => {
    const ids = ["a", "b"] as const;
    // callback form
    const viaCb = definePropDescriptors<typeof ids[number], TestGenCtx>(ids, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: (id) => (id === "a" ? genA : genB),
    });
    expect(viaCb[0]?.generator).toBe(genA as unknown as (ctx: unknown) => unknown);
    expect(viaCb[1]?.generator).toBe(genB as unknown as (ctx: unknown) => unknown);
    // record form
    const viaRecord = definePropDescriptors<typeof ids[number], TestGenCtx>(ids, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: { a: genA, b: genB } as const,
    });
    expect(viaRecord[0]?.generator).toBe(genA as unknown as (ctx: unknown) => unknown);
    expect(viaRecord[1]?.generator).toBe(genB as unknown as (ctx: unknown) => unknown);
    // concrete context still works via erased handle
    expect(viaCb[0]?.generator({ y: 5 } as unknown as unknown)).toEqual({ a: 5 });
  });

  it("supports generator handle identity across registry — no per-row unknown cast needed", () => {
    const ids = ["toro_lantern", "koi_pond"] as const;
    // leaf arrays become one concise helper call:
    const descs = definePropDescriptors<typeof ids[number], TestGenCtx>(ids, {
      footprint: (id, _params) =>
        id === "toro_lantern"
          ? { size: [5, 7, 5] as const, minY: 0, base: "ground" as const }
          : { size: [9, 5, 9] as const, minY: 0, base: "ground" as const },
      generator: (id) => (id === "toro_lantern" ? genA : genB),
      tags: (id) => [id],
    });
    // single centralized cast inside builder, callers write no `as unknown as (ctx: unknown) => unknown` per row
    expect(descs[0]?.generator).toBe(genA as unknown as (ctx: unknown) => unknown);
    expect(descs[1]?.generator).toBe(genB as unknown as (ctx: unknown) => unknown);
    const r = createStructureRegistry(...descs);
    expect(r.getProp("toro_lantern")?.generator).toBe(genA as unknown as (ctx: unknown) => unknown);
    expect(r.getProp("koi_pond")?.generator).toBe(genB as unknown as (ctx: unknown) => unknown);
    expect(r.list().map((d) => d.id)).toEqual(["toro_lantern", "koi_pond"]);
    expect(Object.isFrozen(r.list())).toBe(true);
  });

  it("prop descriptors are registry-compatible and preserve insertion-order tag priority", () => {
    const ids = ["alpha", "beta"] as const;
    const descs = definePropDescriptors<typeof ids[number], TestGenCtx>(ids, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: () => genA,
      tags: () => ["shared"],
    });
    const r = createStructureRegistry(...descs);
    expect(findByTag(r, "shared")?.id).toBe("alpha");
    expect(r.listProps().map((d) => d.id)).toEqual(["alpha", "beta"]);
  });
});

describe("descriptor resolver — buildingIdFromTags / descriptorIdFromTags ordered scan, no registry allocation", () => {
  type BId = "keep" | "gatehouse" | "barracks" | "pagoda";
  function bDescs(): readonly (BuildingDescriptor & { readonly id: BId })[] {
    // Ordered to match historical blitz priority: keep > gatehouse > barracks > pagoda.
    // keep claims keep/castle/donjon/citadel, gatehouse claims gatehouse/barbican/gate.
    // Tags mirror blitzArchetypeOfTags; aliases used for citadel case to prove alias path.
    const ids: readonly BId[] = ["keep", "gatehouse", "barracks", "pagoda"] as const;
    return defineBuildingDescriptors<BId, { readonly x: number }>(ids, {
      tags: (id) => {
        if (id === "keep") return ["keep", "castle", "donjon"];
        if (id === "gatehouse") return ["gatehouse", "barbican"];
        if (id === "barracks") return ["barracks", "garrison"];
        return ["pagoda"];
      },
      aliases: (id) => (id === "keep" ? ["citadel"] : id === "gatehouse" ? ["gate"] : []),
      furnish: (ctx) => ctx.x,
    });
  }

  it("returns first descriptor whose id/tags/aliases intersects input tags — priority by descriptor order", () => {
    const descs = bDescs();
    // Direct id match.
    expect(buildingIdFromTags(descs, ["keep"])).toBe("keep");
    expect(descriptorIdFromTags(descs, ["keep"])).toBe("keep");
    // Tag synonym still maps to canonical id, even when input order differs.
    expect(buildingIdFromTags(descs, ["castle"])).toBe("keep");
    expect(buildingIdFromTags(descs, ["donjon"])).toBe("keep");
    // Input order does not affect priority — descriptor order wins.
    expect(buildingIdFromTags(descs, ["barbican", "castle"])).toBe("keep");
    expect(buildingIdFromTags(descs, ["garrison", "castle"])).toBe("keep");
    // Shared-tag priority: both descriptors claim "shared", so ["shared"] resolves to the earliest (alpha).
    // id/tags/aliases intersection is exact — ["beta"] matches beta's own id, not alpha's tag.
    const sharedIds = ["alpha", "beta"] as const;
    type SharedId = (typeof sharedIds)[number];
    const sharedDescs = defineBuildingDescriptors<SharedId, { readonly x: number }>(sharedIds, {
      tags: () => ["shared"],
      furnish: (c) => c.x,
    });
    expect(buildingIdFromTags(sharedDescs, ["shared"])).toBe("alpha");
    expect(buildingIdFromTags(sharedDescs, ["beta"])).toBe("beta");
    // Historical priority: keep's castle beats gatehouse's gate when both present
    // in input set, keep is earlier in descriptor order.
    expect(buildingIdFromTags(descs, ["gate", "castle"])).toBe("keep");
  });

  it("matches aliases — alias equivalence same priority as tags", () => {
    const descs = bDescs();
    expect(buildingIdFromTags(descs, ["citadel"])).toBe("keep");
    expect(descriptorIdFromTags(descs, ["citadel"])).toBe("keep");
    expect(buildingIdFromTags(descs, ["gate"])).toBe("gatehouse");
    // Alias priority: if two descriptors share an alias string, descriptor order wins.
    const aliasIds = ["first", "second"] as const;
    type AliasId = (typeof aliasIds)[number];
    const aliasDescs = defineBuildingDescriptors<AliasId, { readonly x: number }>(aliasIds, {
      tags: (id) => [id],
      aliases: () => ["dup"],
      furnish: (c) => c.x,
    });
    expect(buildingIdFromTags(aliasDescs, ["dup"])).toBe("first");
  });

  it("returns null for empty tags — no default, no first descriptor", () => {
    const descs = bDescs();
    expect(buildingIdFromTags(descs, [])).toBeNull();
    expect(descriptorIdFromTags(descs, [])).toBeNull();
    expect(propIdFromTags([], [])).toBeNull();
    // Even with empty-tags descriptor (terrace-style tags:[]), empty input still null — no default.
    const terraceLike = defineBuildingDescriptors<"terrace" | "cottage", { readonly x: number }>(["terrace", "cottage"] as const, {
      tags: (id) => (id === "terrace" ? [] : ["cottage"]),
      furnish: (c) => c.x,
    });
    expect(buildingIdFromTags(terraceLike, [])).toBeNull();
    expect(buildingIdFromTags(terraceLike, ["terrace"])).toBe("terrace");
  });

  it("returns null for no-match — no implicit fallback to first or cottage", () => {
    const descs = bDescs();
    expect(buildingIdFromTags(descs, ["unknown"])).toBeNull();
    expect(buildingIdFromTags(descs, ["hut", "house", "market"])).toBeNull();
    expect(descriptorIdFromTags(descs, ["missing"])).toBeNull();
    const propIds = ["pier", "fountain"] as const;
    type PId = (typeof propIds)[number];
    const propDescs = definePropDescriptors<PId, { readonly y: number }>(propIds, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: () => (c) => ({ y: c.y }),
      tags: (id) => [id],
    });
    expect(propIdFromTags(propDescs, ["unknown_prop"])).toBeNull();
    expect(propIdFromTags(propDescs, [])).toBeNull();
  });

  it("prop resolver mirrors building semantics — id/tags/aliases priority, empty and no-match", () => {
    const ids = ["rowboat", "pier"] as const;
    type PId = (typeof ids)[number];
    const descs = definePropDescriptors<PId, { readonly y: number }>(ids, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: () => (c) => ({ y: c.y }),
      tags: (id) => (id === "rowboat" ? ["rowboat", "boat"] : ["pier", "jetty"]),
      aliases: (id) => (id === "rowboat" ? ["skiff"] : ["wharf"]),
    });
    expect(propIdFromTags(descs, ["rowboat"])).toBe("rowboat");
    expect(propIdFromTags(descs, ["boat"])).toBe("rowboat");
    expect(propIdFromTags(descs, ["skiff"])).toBe("rowboat");
    expect(propIdFromTags(descs, ["jetty"])).toBe("pier");
    expect(propIdFromTags(descs, ["wharf"])).toBe("pier");
    // Priority by descriptor order: shared alias/tag
    const dupIds = ["a", "b"] as const;
    type DupId = (typeof dupIds)[number];
    const dup = definePropDescriptors<DupId, { readonly y: number }>(dupIds, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: () => (c) => c.y,
      tags: () => ["shared"],
    });
    expect(propIdFromTags(dup, ["shared"])).toBe("a");
    expect(propIdFromTags(descs, ["unknown"])).toBeNull();
  });

  it("scans descriptor order without registry construction — plain array delegation", () => {
    // Prove no StructureRegistry is needed: descriptors from builders used directly.
    const ids = ["keep", "gatehouse"] as const;
    type Id = (typeof ids)[number];
    const descs = defineBuildingDescriptors<Id, { readonly x: number }>(ids, {
      tags: (id) => (id === "keep" ? ["keep", "castle"] : ["gatehouse", "barbican"]),
      furnish: (c) => c.x,
    });
    // Leaf resolver shape: one-line delegation preserving typed Id and historical priority.
    const blitzArchetypeOfTags = (tags: readonly string[]): Id | null => buildingIdFromTags(descs, tags);
    const genericArchetypeOfTags = (tags: readonly string[]): Id | null => descriptorIdFromTags(descs, tags);
    expect(blitzArchetypeOfTags(["castle"])).toBe("keep");
    expect(blitzArchetypeOfTags(["barbican"])).toBe("gatehouse");
    expect(genericArchetypeOfTags(["castle"])).toBe("keep");
    expect(blitzArchetypeOfTags([])).toBeNull();
    expect(blitzArchetypeOfTags(["unknown"])).toBeNull();
    // Typed return: assignment to narrowed literal must compile (runtime check mirrors it).
    const keepResult: Id | null = buildingIdFromTags(descs, ["castle"]);
    expect(keepResult).toBe("keep");
    const propIds = ["pier"] as const;
    type PId = (typeof propIds)[number];
    const pDescs = definePropDescriptors<PId, { readonly y: number }>(propIds, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: () => (c) => c.y,
    });
    const pierResult: PId | null = propIdFromTags(pDescs, ["pier"]);
    expect(pierResult).toBe("pier");
  });

  it("builder literal Id preservation — descriptor.id retains Id union, not widened string", () => {
    const ids = ["alpha", "beta", "gamma"] as const;
    type Lit = (typeof ids)[number];
    const bDescs2 = defineBuildingDescriptors<Lit, { readonly x: number }>(ids, {
      furnish: (c) => c.x,
    });
    // Runtime retains literal strings; compile-time type check via narrow assignment:
    const firstId: Lit = bDescs2[0]!.id;
    expect(firstId).toBe("alpha");
    expect(bDescs2.map((d) => d.id)).toEqual(["alpha", "beta", "gamma"]);
    // resolver infers same Lit union:
    const resolved: Lit | null = buildingIdFromTags(bDescs2, ["beta"]);
    expect(resolved).toBe("beta");
    const pIds = ["rowboat", "pier"] as const;
    type PLit = (typeof pIds)[number];
    const pDescs2 = definePropDescriptors<PLit, { readonly y: number }>(pIds, {
      footprint: () => ({ size: [1, 1, 1] as const, minY: 0, base: "ground" as const }),
      generator: () => (c) => c.y,
    });
    const pFirst: PLit = pDescs2[0]!.id;
    expect(pFirst).toBe("rowboat");
    const pResolved: PLit | null = propIdFromTags(pDescs2, ["pier"]);
    expect(pResolved).toBe("pier");
  });
});

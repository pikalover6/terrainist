/**
 * The infrastructure-entry registry (`docs/INFRA-ENTRIES-v0.md` §3.3).
 *
 * The registry is data, and the design's own acceptance test is that adding an
 * entry costs a row and a profile function and nothing else. These tests hold
 * the shape that claim depends on: a row names one geometry, declares a legal
 * ground class, and produces a profile that is a pure function of its context.
 */

import { describe, expect, it } from "vitest";

import {
  INFRA_ENTRIES,
  INFRA_ENTRY_IDS,
  INFRA_ROUTE_FORMS,
  INFRA_ROUTE_FORMS_IMPLEMENTED,
  INFRA_TEST_ENTRY,
  entryAcceptsRoute,
  infraEntry,
  isImplementedRouteForm,
  type InfraContext,
} from "../src/index.js";

const CONTEXT: InfraContext = {
  theme: undefined,
  params: {},
  seed: new Uint8Array(32),
};

describe("the registry's shape", () => {
  it("keys every row by its own id", () => {
    for (const [key, def] of Object.entries(INFRA_ENTRIES)) expect(def.id).toBe(key);
  });

  it("accepts only route forms the vocabulary names, and only implemented ones", () => {
    for (const def of Object.values(INFRA_ENTRIES)) {
      expect(def.routes.length, def.id).toBeGreaterThan(0);
      for (const form of def.routes) {
        expect(INFRA_ROUTE_FORMS, def.id).toContain(form);
        // `between` is in the vocabulary and is post-freeze (§3.2, §5): no row
        // may accept a form the host cannot resolve.
        expect(isImplementedRouteForm(form), `${def.id} accepts ${form}`).toBe(true);
      }
    }
    expect(INFRA_ROUTE_FORMS_IMPLEMENTED).not.toContain("between");
  });

  it("declares no tier-A ground class — §3.5's line, held in data", () => {
    for (const def of Object.values(INFRA_ENTRIES)) {
      expect(def.sourceClass ?? "sweep.run", def.id).not.toBe("structure.linework");
    }
  });

  it("matches geometry to the forms a row accepts", () => {
    for (const def of Object.values(INFRA_ENTRIES)) {
      const areal = def.routes.includes("over");
      expect(def.geometry.kind, def.id).toBe(areal ? "area" : "route");
    }
  });

  it("refuses a run below a stated minimum — the LOAM-T232 threshold", () => {
    for (const def of Object.values(INFRA_ENTRIES)) {
      expect(def.minRun, def.id).toBeGreaterThan(0);
      expect(Number.isInteger(def.minRun), def.id).toBe(true);
    }
  });
});

describe("W0 ships the host and no content", () => {
  it("carries exactly one row, and it is internal", () => {
    expect(Object.keys(INFRA_ENTRIES)).toEqual([INFRA_TEST_ENTRY]);
    expect(infraEntry(INFRA_TEST_ENTRY)?.internal).toBe(true);
  });

  it("keeps internal rows out of the catalog-backed id set", () => {
    // The registry guard in `catalog.test.ts` checks the two sets against each
    // other in both directions; an internal row would fail the reverse
    // direction, and excluding it here is what makes the guard exact rather
    // than weakened to a one-way check.
    expect(INFRA_ENTRY_IDS).toEqual([]);
    expect(INFRA_ENTRY_IDS).not.toContain(INFRA_TEST_ENTRY);
  });
});

describe("the test fence — the host's own client", () => {
  const def = infraEntry(INFRA_TEST_ENTRY);

  it("accepts the four linear forms and no areal one", () => {
    expect(def).toBeDefined();
    for (const form of ["ring", "along", "across", "into"] as const) {
      expect(entryAcceptsRoute(def!, form), form).toBe(true);
    }
    expect(entryAcceptsRoute(def!, "over")).toBe(false);
  });

  it("produces the same profile every time — a pure function of its context", () => {
    expect(def?.geometry.kind).toBe("route");
    if (def?.geometry.kind !== "route") return;
    const a = def.geometry.profile(CONTEXT);
    const b = def.geometry.profile({ ...CONTEXT, seed: new Uint8Array(32).fill(7) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is built of full cubes — the registry default (§3.7's lint obligation)", () => {
    if (def?.geometry.kind !== "route") return;
    const profile = def.geometry.profile(CONTEXT);
    const blocks = [
      ...profile.bands.map((b) => b.surface),
      ...profile.bands.flatMap((b) => (b.fill === undefined ? [] : [b.fill])),
      ...profile.bands.flatMap((b) => (b.cap === undefined ? [] : [b.cap.block])),
    ];
    for (const block of blocks) {
      // No slab, no stair, no fence, no wall: each is either a physics finding
      // waiting to happen or a hole a mob paths through.
      expect(block, block).not.toMatch(/_(slab|stairs|fence|wall|gate)$/);
    }
  });
});

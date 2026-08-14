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

/** The same context with a field under it, for the one areal row. */
const AREA_CONTEXT: InfraContext = { ...CONTEXT, extent: { width: 60, depth: 60 } };

/** W1's four, in registry order — P2's world (`docs/INFRA-ENTRIES-v0.md` §4). */
const W1 = ["quarantine_fence", "barricade_line", "crash_furrow", "crop_circle"] as const;

/** W2's one and W3's five — the peacetime tail, in registry order. */
const TAIL = [
  "cannon_battery",
  "hedgerow",
  "dry_stone_wall",
  "cart_track",
  "boardwalk",
  "sphinx_avenue",
] as const;

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

describe("W0's host, W1's four, and the W2/W3 tail", () => {
  it("carries the fixture, P2's four and the tail — and only the fixture is internal", () => {
    expect(Object.keys(INFRA_ENTRIES)).toEqual([INFRA_TEST_ENTRY, ...W1, ...TAIL]);
    expect(infraEntry(INFRA_TEST_ENTRY)?.internal).toBe(true);
    for (const id of [...W1, ...TAIL]) expect(infraEntry(id)?.internal, id).toBeUndefined();
  });

  it("keeps internal rows out of the catalog-backed id set", () => {
    // The registry guard in `catalog.test.ts` checks the two sets against each
    // other in both directions; an internal row would fail the reverse
    // direction, and excluding it here is what makes the guard exact rather
    // than weakened to a one-way check.
    expect(INFRA_ENTRY_IDS).toEqual([...W1, ...TAIL]);
    expect(INFRA_ENTRY_IDS).not.toContain(INFRA_TEST_ENTRY);
  });

  it("gives each of the four exactly the one route form it is about", () => {
    // Narrow on purpose: a cordon rings, a barricade goes across, a furrow runs
    // into the thing that made it, and a crop circle lies over a field. The
    // narrowness of `crash_furrow` is also the ratified refusal (Q5) — no
    // target, no furrow.
    expect(infraEntry("quarantine_fence")?.routes).toEqual(["ring"]);
    expect(infraEntry("barricade_line")?.routes).toEqual(["across"]);
    expect(infraEntry("crash_furrow")?.routes).toEqual(["into"]);
    expect(infraEntry("crop_circle")?.routes).toEqual(["over"]);
  });

  it("names one crossing behaviour each, and they are all three", () => {
    // The four were chosen because they are four mechanisms, and this is the
    // cheapest place that claim is checkable.
    expect(infraEntry("quarantine_fence")?.crossings).toBe("open");
    expect(infraEntry("barricade_line")?.crossings).toBe("gap");
    expect(infraEntry("crash_furrow")?.crossings).toBe("block");
  });

  it("declares levels only where the entry *is* a statement about the ground", () => {
    expect(infraEntry("crash_furrow")?.declaresLevels).toBe(true);
    expect(infraEntry("crop_circle")?.declaresLevels).toBe(true);
    expect(infraEntry("quarantine_fence")?.declaresLevels).toBeUndefined();
    expect(infraEntry("barricade_line")?.declaresLevels).toBeUndefined();
    // …and never above tier C, which is §3.5's line held in data.
    for (const id of W1) expect(infraEntry(id)?.sourceClass, id).toBe("sweep.run");
  });
});

describe("the four profiles and the one stamp", () => {
  it("is a pure function of its context, twice over, for every row", () => {
    for (const id of W1) {
      const def = infraEntry(id);
      const a =
        def?.geometry.kind === "route"
          ? def.geometry.profile(AREA_CONTEXT)
          : def?.geometry.stamp(AREA_CONTEXT);
      const b =
        def?.geometry.kind === "route"
          ? def.geometry.profile(AREA_CONTEXT)
          : def?.geometry.stamp(AREA_CONTEXT);
      expect(JSON.stringify(a), id).toBe(JSON.stringify(b));
    }
  });

  it("quarantine_fence: iron bars on a kerb, with a mast and a marker to seat", () => {
    const def = infraEntry("quarantine_fence");
    if (def?.geometry.kind !== "route") throw new Error("route row");
    const profile = def.geometry.profile(CONTEXT);
    expect(profile.bands.map((b) => b.cap?.block)).toEqual(["iron_bars"]);
    // Every feature the profile seats has something to be made of, and every
    // fitting has a feature to be seated at: a fitting nobody seats is dead
    // data and a feature nobody fits is a position and nothing else.
    const ids = (profile.features ?? []).map((f) => f.id).sort();
    expect(Object.keys(def.fittings ?? {}).sort()).toEqual(ids);
    // The lantern-name rule: a floodlight is glowstone against solid, never a
    // lantern hung off a post the lint cannot see.
    expect(def.fittings?.["mast"]?.stack.at(-1)).toBe("glowstone");
    expect(def.fittings?.["marker"]?.stack).not.toContain("yellow_banner");
  });

  it("barricade_line: asymmetric, and improvised out of the response pack's own kit", () => {
    const def = infraEntry("barricade_line");
    if (def?.geometry.kind !== "route") throw new Error("route row");
    const profile = def.geometry.profile(CONTEXT);
    // A symmetric cross-section here would be a wall with a story attached.
    expect(profile.asymmetric).toBe(true);
    const blocks = profile.bands.flatMap((b) => [b.surface, b.fill, b.cap?.block]);
    expect(blocks).toContain("sand");
    expect(blocks).toContain("iron_bars");
    expect(Object.keys(def.fittings ?? {}).sort()).toEqual(["crate", "wreck"]);
  });

  it("crash_furrow: a ditch band below the datum, scorch blending out to grade", () => {
    const def = infraEntry("crash_furrow");
    if (def?.geometry.kind !== "route") throw new Error("route row");
    const profile = def.geometry.profile(CONTEXT);
    const levels = profile.bands.map((b) => b.level ?? 0);
    // Below datum at the centre, and monotonically back up to grade at the
    // shoulders: a gouge, not a slot.
    expect(levels[0]).toBeLessThan(0);
    for (let i = 1; i < levels.length; i++) {
      expect((levels[i] as number) > (levels[i - 1] as number), `band ${i}`).toBe(true);
    }
    expect(levels.at(-1)).toBe(0);
    expect(profile.bands[0]?.role).toBe("ditch");
    // The datum *is* the ground: a furrow that rose above it would be a bank.
    expect(def.rise).toBe(0);
  });

  it("crop_circle: rings and spokes sized to the field, in hay", () => {
    const def = infraEntry("crop_circle");
    if (def?.geometry.kind !== "area") throw new Error("area row");
    const stamp = def.geometry.stamp(AREA_CONTEXT);
    expect(stamp.surface).toBe("hay_block");
    const cell = stamp.cell;
    expect(cell).toBeDefined();
    if (cell === undefined) return;
    // The centre of the field is inside the figure and is pressed flat…
    expect(cell(0, 0)?.clear).toBeGreaterThan(0);
    // …the rim is a band, so the circle reads as a circle…
    const radius = Math.round(60 * 0.35);
    expect(cell(radius, 0)?.surface).toBe("hay_block");
    // …and a column well outside the disc is untouched, which is the whole
    // difference between a figure in a field and a field of hay.
    expect(cell(radius + 8, radius + 8)).toBeUndefined();
    // A bigger field gets a bigger figure, from the compiler's own measurement
    // rather than from a radius the author guessed at.
    const wide = def.geometry.stamp({ ...AREA_CONTEXT, extent: { width: 200, depth: 200 } });
    expect(wide.cell?.(radius + 5, 0)).toBeDefined();
  });

  it("presses the crop rather than repainting it — every covered column clears", () => {
    const def = infraEntry("crop_circle");
    if (def?.geometry.kind !== "area") throw new Error("area row");
    const cell = def.geometry.stamp(AREA_CONTEXT).cell;
    let covered = 0;
    let banded = 0;
    for (let dz = -30; dz <= 30; dz++) {
      for (let dx = -30; dx <= 30; dx++) {
        const c = cell?.(dx, dz);
        if (c === undefined) continue;
        covered++;
        expect(c.clear, `${dx},${dz}`).toBeGreaterThan(0);
        if (c.surface !== undefined) banded++;
      }
    }
    expect(covered).toBeGreaterThan(100);
    // A figure, not a disc of hay: the bands are a minority of the disc.
    expect(banded).toBeGreaterThan(0);
    expect(banded).toBeLessThan(covered / 2);
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

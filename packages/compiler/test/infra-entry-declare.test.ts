/**
 * **WP-G6a — the infra-entry declaration split**
 * §6a, test surface §6a.9).
 *
 * Four properties, and each is the *structural* form of one of the design's
 * claims rather than a world that happens to come out right:
 *
 * 1. **The declare half reaches no block.** Asserted by a static import scan of
 *    `infra-entry-declare.ts` and `infra-route.ts`, the guard
 *    `ground-writers.test.ts` uses for the same kind of claim: a behavioural
 *    test tells you a `LifeWorld` read changed a world, and if it happens to
 *    agree with the layout on today's documents it tells you nothing at all.
 *    This says the read may not exist.
 * 2. **The split is total, and it is a partition.** Every registry row is a
 *    declarer or a dresser, never both and never neither — which is the
 *    property §6a.2 rests on when it says a painter "has no tier, so §1.4 does
 *    not govern it".
 * 3. **Every route form resolves identically against the layout view and the
 *    fabric view on a world with no fabric.** The route forms are pure geometry
 *    over four small questions, so where the two views answer the same
 *    questions the same way the sitings must coincide; a form that had smuggled
 *    a fifth question in would diverge here.
 * 4. **The carriageway subtraction** (§6a.4, v0 §13.2a rule 5): present on an
 *    `open` row, absent on a `block` row, because a dam's crest, a furrow and a
 *    flight of terrace steps mean it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { INFRA_ENTRIES, type InfraEntryDef } from "@terrainist/stdlib";
import { describe, expect, it } from "vitest";

import { GROUND_TIERS, type GroundIntent } from "../src/layout/ground-contract.js";
import type { GroundDriver } from "../src/layout/ground-driver.js";
import {
  EMPTY_PARCEL_DATUM,
  declareInfraEntries,
  declaresGround,
  parcelExtentOf,
  parcelMaskOf,
  tierOf,
  type ParcelDatum
} from "../src/structures/infra-entry-declare.js";
import {
  resolveInfraRoute,
  type InfraEntryJob,
  type InfraPlacementView
} from "../src/structures/infra-route.js";

const SRC = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/structures/${rel}`, import.meta.url)), "utf8");

/* -------------------------------------------------------------------------- */
/* 1. the declare half reaches no block                                        */
/* -------------------------------------------------------------------------- */

/**
 * Modules a declarer may not import, and the reason each is forbidden.
 *
 * `life.js` is the emitted world — `LifeWorld`, `Planter`, `standY` over blocks
 * somebody laid; `buildings.js` is `StructureBlock`; `prismarine.js` is the
 * block registry a writer needs. A declarer needs none of the three, and §1.4's
 * read law is enforceable by typing only while it imports none of them.
 */
const FORBIDDEN: ReadonlyMap<string, string> = new Map([
  ["./life.js", "the emitted world — `LifeWorld`, `Planter`, `standY` over laid blocks"],
  ["./buildings.js", "`StructureBlock`: an emitted block is a 5e fact"],
  ["../emit/prismarine.js", "the block registry, which only a writer needs"]
]);

describe("the declare half reaches no block (§6a.3)", () => {
  for (const file of ["infra-entry-declare.ts", "infra-route.ts"]) {
    it(`${file} imports nothing that can see an emitted block`, () => {
      const src = SRC(file);
      for (const [module, why] of FORBIDDEN) {
        expect(src.includes(`from "${module}"`), `${file} must not import ${module} — ${why}`).toBe(
          false,
        );
      }
      // The two names that would give it one without an import of its own.
      expect(src).not.toMatch(/\bbuildLifeWorld\b|\bnew Planter\b/);
    });
  }

  it("infra-route.ts imports neither half — no cycle, no behaviour", () => {
    const src = SRC("infra-route.ts");
    expect(src.includes('from "./infra-entry.js"')).toBe(false);
    expect(src.includes('from "./infra-entry-declare.js"')).toBe(false);
  });

  it("`ParcelDatum` is a pure function of its rects — no plan, no driver", () => {
    const datum: ParcelDatum = {
      rectsByPath: new Map([["root.holding", [{ x0: 2, z0: 3, x1: 5, z1: 7 }]]])
    };
    const region = { x0: 0, z0: 0, width: 10, depth: 10 };
    const mask = parcelMaskOf(datum, "root.holding", region);
    expect(mask).toBeDefined();
    expect([...(mask as Uint8Array)].filter((v) => v === 1)).toHaveLength(4 * 5);
    // Twice, from the same datum: the same answer, because there is nothing
    // else in scope for it to depend on.
    expect([...(parcelMaskOf(datum, "root.holding", region) as Uint8Array)]).toEqual([...(mask as Uint8Array)]);
    expect(parcelExtentOf(datum, "root.holding")).toEqual([
      { x: 2, z: 3 },
      { x: 5, z: 3 },
      { x: 5, z: 7 },
      { x: 2, z: 7 }
    ]);
    expect(parcelMaskOf(EMPTY_PARCEL_DATUM, "root.holding", region)).toBeUndefined();
    expect(parcelExtentOf(EMPTY_PARCEL_DATUM, "root.holding")).toBeUndefined();
  });

  it("the datum is published by the farm pass before its own commit (§6a.5)", () => {
    const farm = readFileSync(
      fileURLToPath(new URL("../src/structures/farm.ts", import.meta.url)),
      "utf8",
    );
    const datumAt = farm.indexOf("const parcelDatum: ParcelDatum");
    const commitAt = farm.indexOf("input.ground.commit(intents)");
    expect(datumAt).toBeGreaterThan(0);
    expect(commitAt).toBeGreaterThan(0);
    // Before the commit, so the rects are a fact about the layout rather than
    // about the arbitration — which is the whole of §1.3's datum law here.
    expect(datumAt).toBeLessThan(commitAt);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the split is total                                                       */
/* -------------------------------------------------------------------------- */

describe("the declaration split is a partition of the registry (§6a.2)", () => {
  const rows = Object.values(INFRA_ENTRIES) as readonly InfraEntryDef[];

  it("every row is a declarer or a dresser — never both, never neither", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const def of rows) {
      const job = jobOf(def);
      const declares = declaresGround(job);
      const painter = def.declaresLevels !== true && def.water === undefined;
      // Exactly one of the two, for every row in the catalog.
      expect(declares !== painter, `"${def.id}" is classified as both or as neither`).toBe(true);
    }
  });

  it("a declaring row's tier is its own class's, and a painter has none", () => {
    for (const def of rows) {
      const job = jobOf(def);
      if (!declaresGround(job)) continue;
      const expected =
        def.water !== undefined
          ? GROUND_TIERS["fluid.channel"]
          : GROUND_TIERS[def.sourceClass ?? "sweep.run"];
      expect(tierOf(job), `"${def.id}"`).toBe(expected);
    }
  });

  it("the tiers the split uses are exactly A, B and C", () => {
    const tiers = new Set(rows.filter((d) => declaresGround(jobOf(d))).map((d) => tierOf(jobOf(d))));
    for (const tier of tiers) expect(["A", "B", "C"]).toContain(tier);
  });
});

/* -------------------------------------------------------------------------- */
/* the fixtures                                                                */
/* -------------------------------------------------------------------------- */

const REGION = { x0: 0, z0: 0, width: 64, depth: 64 };
const BOUNDS = { x0: 0, z0: 0, width: 64, depth: 64 };
const GROUND_Y = 70;

/** One job over a registry row, with the route the test names. */
function jobOf(def: InfraEntryDef, route?: InfraEntryJob["route"]): InfraEntryJob {
  return {
    nodePath: `root.${def.id}`,
    def,
    route: route ?? { form: "ring", target: "block" },
    params: {},
    seed: new Uint8Array(32) as unknown as InfraEntryJob["seed"],
    gates: true
  };
}

/** The extent every anchor in these fixtures resolves to. */
const EXTENT = [
  { x: 20, z: 20 },
  { x: 40, z: 20 },
  { x: 40, z: 40 },
  { x: 20, z: 40 }
];

/** A corridor running west→east across the middle of the region. */
const CORRIDOR = Array.from({ length: 40 }, (_, i) => ({ x: 12 + i, z: 30 }));

/**
 * A carriageway band across the **middle third** of the corridor.
 *
 * Deliberately partial: a band under the whole run would make the subtraction
 * indistinguishable from "declared nothing at all", and the property under test
 * is that a run crossing a carriageway declares its own columns and not the
 * road's.
 */
const carriagewayMask = (): Uint8Array => {
  const mask = new Uint8Array(REGION.width * REGION.depth);
  for (const [i, c] of CORRIDOR.entries()) {
    if (i < 14 || i > 25) continue;
    for (let dz = -1; dz <= 1; dz++) mask[(c.z + dz) * REGION.width + c.x] = 1;
  }
  return mask;
};

/**
 * Two views over one set of facts.
 *
 * `flavour` changes only *how* each question is answered — the layout view
 * closes over the solver's rectangle and a solved mask, the fabric view over an
 * emitted hull and a surfaced mask — and on a world with no fabric the two sets
 * of facts are the same set, so a route form that reads only the four questions
 * cannot tell them apart.
 */
const viewOf = (flavour: "layout" | "fabric", carriageway = carriagewayMask()): InfraPlacementView => ({
  bounds: BOUNDS,
  extentOf: (id) =>
    id !== "block"
      ? undefined
      : flavour === "layout"
        ? EXTENT
        : EXTENT.map((c) => ({ x: c.x, z: c.z })),
  corridorOf: (id) => (id === "street" ? CORRIDOR : undefined),
  maskOf: () => undefined,
  ground: (x, z) => (x >= 0 && z >= 0 && x < 64 && z < 64 ? GROUND_Y + 1 : undefined),
  onRoad: (x, z) =>
    x >= 0 && z >= 0 && x < 64 && z < 64 && carriageway[z * REGION.width + x] === 1
});

/** A driver that accumulates and never resolves — the claims are the subject. */
const recordingDriver = (): { driver: GroundDriver; intents: GroundIntent[] } => {
  const intents: GroundIntent[] = [];
  const view = {
    region: REGION,
    ground: new Int32Array(REGION.width * REGION.depth).fill(GROUND_Y),
    fluidTop: new Int32Array(REGION.width * REGION.depth).fill(GROUND_Y),
    fluidKind: new Uint8Array(REGION.width * REGION.depth),
    seaLevel: 62
  };
  const driver = {
    baseline: view,
    intents,
    resolves: 0,
    record: (list: readonly GroundIntent[]) => void intents.push(...list),
    commit: (list: readonly GroundIntent[]) => void intents.push(...list),
    view: () => view,
    enterTier: () => undefined,
    freeze: () => {
      throw new Error("not used");
    },
    finish: () => {
      throw new Error("not used");
    }
  } as unknown as GroundDriver;
  return { driver, intents };
};

/* -------------------------------------------------------------------------- */
/* 3. the route forms do not care which view they are handed                   */
/* -------------------------------------------------------------------------- */

describe("every route form resolves identically against both views (§6a.2)", () => {
  const cases: readonly { readonly name: string; readonly route: InfraEntryJob["route"] }[] = [
    { name: "ring", route: { form: "ring", target: "block", margin: 6 } },
    { name: "along", route: { form: "along", target: "street", offset: 3 } },
    { name: "across", route: { form: "across", target: "street" } },
    { name: "into", route: { form: "into", target: "block", run: 12 } },
    { name: "over", route: { form: "over", target: "block" } },
    {
      name: "between",
      route: { form: "between", target: "block → street", targets: ["block", "street"] }
    }
  ];

  for (const { name, route } of cases) {
    it(`"${name}" sites the same line from the layout view and the fabric view`, () => {
      const fromLayout = resolveInfraRoute(route, viewOf("layout"));
      const fromFabric = resolveInfraRoute(route, viewOf("fabric"));
      expect(fromLayout.kind).toBe(fromFabric.kind);
      expect(JSON.stringify(fromLayout)).toEqual(JSON.stringify(fromFabric));
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 4. the carriageway subtraction                                              */
/* -------------------------------------------------------------------------- */

/** A declaring `sweep.run` row over one flat band, with the crossing behaviour. */
const declaringRow = (crossings: InfraEntryDef["crossings"]): InfraEntryDef => ({
  id: `test_run_${crossings}`,
  routes: ["along"],
  geometry: {
    kind: "route",
    profile: () => ({
      id: "test_run",
      bands: [{ id: "run", role: "carriageway", width: 2, centred: true, level: 0, surface: "dirt" }],
      follow: "step",
      maxGrade: 2,
      crossing: "stop"
    })
  },
  sourceClass: "sweep.run",
  crossings,
  minRun: 2,
  declaresLevels: true,
  rise: 0,
  internal: true
});

describe("the carriageway subtraction (§6a.4)", () => {
  const claimedColumns = (crossings: InfraEntryDef["crossings"]): Set<number> => {
    const { driver, intents } = recordingDriver();
    const carriageway = carriagewayMask();
    const out = declareInfraEntries(
      {
        region: REGION,
        baseline: driver.baseline,
        jobs: [jobOf(declaringRow(crossings), { form: "along", target: "street", offset: 0 })],
        ground: driver,
        solvedCarriageway: carriageway,
        view: viewOf("layout", carriageway)
      },
      "C",
    );
    expect(out.sitings.size).toBe(1);
    const claimed = new Set<number>();
    for (const intent of intents) for (const c of intent.columns) claimed.add(c.idx);
    return claimed;
  };

  const inBand = (claimed: ReadonlySet<number>): number => {
    const carriageway = carriagewayMask();
    let n = 0;
    for (const idx of claimed) if (carriageway[idx] === 1) n++;
    return n;
  };

  it("an `open` row declares not one column inside the solved carriageway", () => {
    const claimed = claimedColumns("open");
    expect(claimed.size).toBeGreaterThan(0);
    expect(inBand(claimed)).toBe(0);
  });

  it("a `block` row subtracts nothing, because it means it", () => {
    const claimed = claimedColumns("block");
    expect(inBand(claimed)).toBeGreaterThan(0);
  });

  it("a row in another tier is not declared from this slot", () => {
    const { driver, intents } = recordingDriver();
    const carriageway = carriagewayMask();
    const out = declareInfraEntries(
      {
        region: REGION,
        baseline: driver.baseline,
        jobs: [jobOf(declaringRow("block"), { form: "along", target: "street", offset: 0 })],
        ground: driver,
        solvedCarriageway: carriageway,
        view: viewOf("layout", carriageway)
      },
      // `sweep.run` is tier C; asking tier B for it must produce nothing at all.
      "B",
    );
    expect(out.sitings.size).toBe(0);
    expect(intents).toHaveLength(0);
  });
});

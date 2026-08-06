/**
 * §6 of `docs/COURTYARDS-AND-LEVELS-v0.md`, stated as assertions.
 *
 * **The guarantee.** A document that names neither new key, and carries no new
 * intent key, compiles to exactly the world it compiles to today — with one
 * enumerated exception.
 *
 * **The exception, in full.** `terraced` now defaults to `"stepped"` rather
 * than to `"benched"`. §10 open question 4 left this open; Kai overruled it
 * towards `stepped` on 2026-08-05, on the grounds that a hill town's blocks
 * *are* split-level and the flagship hill-town form seating every block on one
 * plane cannot express the thing it exists for. It is the only golden movement
 * authorised in WP-D, it is confined to quarters whose resolved form declares
 * `requires.unlevelled`, and it is asserted here in both directions: a
 * `terraced` quarter moves, and a quarter of every other form does not.
 *
 * The other half of the file is the defect Phase 4.1 shipped three of: a dial
 * that passes every unit test and does nothing to a world. Unit-testing a
 * fan-out row proves the row; it does not prove the row is *reached*. So the
 * last describe compiles small real worlds and asserts a document that turns
 * the dial produces a **different** world from one that does not — which is the
 * cheapest assertion that would have caught `layout.groundPolicy` registered
 * under a misspelt id.
 */

import { createHash } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { DISTRICT_FABRICS, type DistrictFabric, type DistrictNode } from "@terrainist/spec";

import { compileTerrain, type CompileArtifacts } from "../src/terrain/compile.js";
import { clearFanOut, installFanOutRows } from "../src/intent/index.js";
import { districtGroundPolicy } from "../src/layout/district.js";
import { installUrbanForms, urbanForm } from "../src/layout/forms/index.js";

afterAll(() => {
  installFanOutRows();
});

/* -------------------------------------------------------------------------- */
/* policy resolution — the one function both call sites use                    */
/* -------------------------------------------------------------------------- */

/** A district node with the given fabric and params, and the doc around it. */
function quarter(fabric: DistrictFabric, params: Record<string, unknown> = {}, intent?: unknown) {
  const node = {
    id: "quarter",
    kind: "district",
    envelope: { shape: "region", size: [200, 180] },
    params: { fabric, density: "medium", mix: ["townhouse", "cottage"], ...params },
  } as unknown as DistrictNode;
  const doc = {
    ...(intent === undefined ? {} : { intent }),
    root: { id: "world", kind: "composite", children: [node] },
  } as never;
  return { doc, node, path: "world.quarter" };
}

/** `districtGroundPolicy` for one quarter. */
function policyOf(fabric: DistrictFabric, params: Record<string, unknown> = {}, intent?: unknown) {
  const q = quarter(fabric, params, intent);
  installFanOutRows();
  return districtGroundPolicy(q.doc, q.node, q.path);
}

describe("the ground policy a quarter gets when it asks for nothing", () => {
  it("is pad for every form that does not cut its own benches", () => {
    installUrbanForms();
    for (const fabric of DISTRICT_FABRICS) {
      if (urbanForm(fabric)?.requires.unlevelled === true) continue;
      expect(policyOf(fabric), `${fabric} moved and it should not have`).toBe("pad");
    }
  });

  it("is stepped for a form that cuts its own benches — the one authorised move", () => {
    installUrbanForms();
    const unlevelled = DISTRICT_FABRICS.filter((f) => urbanForm(f)?.requires.unlevelled === true);
    // If this list is ever empty the assertion below is vacuous, so say so.
    expect(unlevelled).toEqual(["terraced"]);
    for (const fabric of unlevelled) expect(policyOf(fabric)).toBe("stepped");
  });

  it("gives an author who writes params.ground exactly what they wrote", () => {
    // Explicit params outrank the row, which is never even consulted — so a
    // `terraced` quarter can still ask for the pre-4.2 behaviour by name.
    expect(policyOf("terraced", { ground: "benched" })).toBe("benched");
    expect(policyOf("terraced", { ground: "pad" })).toBe("pad");
    expect(policyOf("grid", { ground: "stepped" })).toBe("stepped");
    expect(policyOf("grid", { ground: "benched" })).toBe("benched");
  });

  it("lets intent.character.ground reach a quarter that named no params.ground", () => {
    // This is the assertion that the row is *reached*, not merely registered:
    // it runs through `district.ts`'s hand-spelled row id.
    expect(policyOf("grid", {}, { character: { ground: "stepped" } })).toBe("stepped");
    expect(policyOf("terraced", {}, { character: { ground: "benched" } })).toBe("benched");
  });

  it("ignores an intent ground outside the vocabulary rather than guessing", () => {
    expect(policyOf("grid", {}, { character: { ground: "cliffside" } })).toBe("pad");
  });

  it("is unchanged by intent that says nothing about ground", () => {
    for (const fabric of DISTRICT_FABRICS) {
      const plain = policyOf(fabric);
      // No `formality`: the *fabric* row reads it, and an extreme formality
      // legitimately re-forms the quarter — which then legitimately implies a
      // different ground. That is `layout.fabric`'s business, not this row's.
      const busy = policyOf(fabric, {}, { era: "medieval", wealth: 0.8, character: { label: "old town" } });
      expect(busy, `${fabric} moved on an intent that never mentions ground`).toBe(plain);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* compiled worlds                                                             */
/* -------------------------------------------------------------------------- */

/** Everything the pipeline produced, as one hash — `intent-identity`'s method. */
function hashArtifacts(a: CompileArtifacts): string {
  const h = createHash("sha256");
  const { plan } = a;
  h.update(`region ${plan.region.x0} ${plan.region.z0} ${plan.region.width} ${plan.region.depth}\n`);
  for (const [name, array] of [
    ["ground", plan.ground],
    ["snow", plan.snow],
  ] as const) {
    h.update(name);
    h.update(Buffer.from(Uint8Array.from(array as ArrayLike<number>)));
  }
  for (const tree of a.trees) h.update(`t ${JSON.stringify(tree)}\n`);
  for (const decor of a.decor) h.update(`d ${JSON.stringify(decor)}\n`);
  for (const block of a.structures ?? []) h.update(`s ${JSON.stringify(block)}\n`);
  h.update(`spawn ${a.spawn.x},${a.spawn.y},${a.spawn.z}`);
  return h.digest("hex");
}

async function compileOnce(doc: Record<string, unknown>): Promise<string> {
  let hash = "";
  const result = await compileTerrain(doc, {
    outDir: "/dev/null/never-written",
    skipEmit: true,
    onArtifacts: (artifacts) => {
      hash = hashArtifacts(artifacts);
    },
  });
  if (!result.ok) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.code).join(", ")}`);
  }
  return hash;
}

/**
 * A small sloped world with one quarter.
 *
 * Deliberately **not** flattened: a `terrain_conform` would erase the relief
 * and every ground policy would compile to the same world, which would make
 * the "the dial reaches a world" assertions vacuously true.
 */
function world(params: Record<string, unknown>, intent?: unknown): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "levels_dale", worldSeed: 909 },
    ...(intent === undefined ? {} : { intent }),
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [176, 176] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 26, seaLevel: 63, baseHeight: 74, erosionPasses: 1 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "quarter",
          kind: "district",
          envelope: { shape: "region", size: [104, 104] },
          constraints: [{ zone: "center" }],
          params: { fabric: "grid", density: "medium", mix: ["townhouse", "cottage"], ...params },
        },
      ],
    },
  };
}

describe("a world that asks for none of this is the world it was", () => {
  it("compiles identically with the fan-out layer in the path and taken out of it", async () => {
    installFanOutRows();
    const withLayer = await compileOnce(world({}));
    // `finally`, because the registry is process-wide: if this compile throws
    // while the rows are cleared, every later test in the worker compiles
    // without the intent layer and fails somewhere unrelated. A determinism
    // failure two files away is a bad way to learn that.
    let withoutLayer: string;
    try {
      clearFanOut();
      withoutLayer = await compileOnce(world({}));
    } finally {
      installFanOutRows();
    }
    expect(withLayer).toBe(withoutLayer);
    expect(withLayer).not.toBe("");
  }, 300_000);

  it("compiles the same world twice, byte for byte", async () => {
    installFanOutRows();
    const a = await compileOnce(world({}));
    const b = await compileOnce(world({}));
    expect(a).toBe(b);
  }, 300_000);
});

describe("a dial that is turned reaches the world", () => {
  // The Phase 4.1 lesson: three defects passed every unit test and were only
  // exposed by compiling. A row registered under a misspelt id, or a `params`
  // key nothing reads, is a passing unit test and an unchanged world — so the
  // assertion is simply that the world *is not the same one*.
  // The baseline is an **explicit** `ground: "pad"`, not the default.
  //
  // It used to be the default, and that stopped being the same thing when the
  // relief election landed: this fixture's quarter stands on 13 blocks of
  // relief, which is over `STEP_RELIEF`, so a document that names no ground now
  // *elects* stepped ground rather than being levelled to one plane. Asserting
  // against the default would then be asserting `stepped !== stepped`, which is
  // a false failure — and, read the other way, the fact that it failed the
  // moment the election landed is the cheapest possible proof that the election
  // reaches a compiled world. `params.ground: "pad"` is the pre-election answer
  // and is what the contrast is actually about.
  it("gives params.ground: stepped a different world from a pad", async () => {
    installFanOutRows();
    const pad = await compileOnce(world({ ground: "pad" }));
    const stepped = await compileOnce(world({ ground: "stepped" }));
    expect(stepped).not.toBe(pad);
  }, 300_000);

  it("gives intent.character.ground the same reach as params.ground", async () => {
    installFanOutRows();
    const viaParams = await compileOnce(world({ ground: "stepped" }));
    const viaIntent = await compileOnce(world({}, { character: { ground: "stepped" } }));
    // Not asserted equal — an intent carries other rows with it — only that the
    // intent route moved the world off the pad answer at all.
    const pad = await compileOnce(world({ ground: "pad" }));
    expect(viaIntent).not.toBe(pad);
    expect(viaParams).not.toBe(pad);
  }, 300_000);

  // The election itself, at compile scale rather than at unit scale
  // (`ground-election.test.ts` owns the unit statement). This fixture's ground
  // is the reason the two assertions above had to change, so it is worth saying
  // out loud what it now compiles to.
  it("elects stepped ground for a quarter that named none, on real relief", async () => {
    installFanOutRows();
    const elected = await compileOnce(world({}));
    const asked = await compileOnce(world({ ground: "stepped" }));
    const levelled = await compileOnce(world({ ground: "pad" }));
    // Byte-identical to the same quarter asking for it by name: the election
    // chooses a policy, it does not open a second code path.
    expect(elected).toBe(asked);
    expect(elected).not.toBe(levelled);
  }, 300_000);
});

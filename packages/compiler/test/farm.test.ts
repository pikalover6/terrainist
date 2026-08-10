/**
 * `precinct.farm@0` — WP-1 (`docs/FARM-PLAN-v0.md` §13).
 *
 * Amended at WP-2 in exactly two places: the holding now seats fields, so the
 * counts WP-2 fills are no longer zero. Everything else here is untouched, and
 * deliberately: WP-1's claim — the node exists, is seated as ground, lays no
 * pad, and emits no block — is WP-2's claim too. WP-2's own surface is
 * `farm-plan.test.ts`.
 *
 * WP-1's whole claim is small and worth pinning exactly: the node exists, the
 * solver seats it on a footprint, its params are read and defaulted in one
 * place, every holding gets a report row — and **not one block is emitted**.
 *
 * "Not one block" is asserted two ways: the pass's own output is empty, and the
 * holding lays **no pad** — a farm must never level its envelope
 * (`docs/FARM-PLAN-v0.md` §3.2's caveat, §5), which is the one way a node that
 * emits nothing can still move a world.
 *
 * What is deliberately *not* asserted here: that a document with a farm node
 * compiles byte-identically to the same document without one. It does not, and
 * should not — a placed footprint joins the settlement clearing like any other,
 * so the trees inside the envelope come down. §9.1's rule about what a holding
 * does to the clearing is WP-4's. The reach law proper (§2) is the *other*
 * claim — a document with **no** farm node is unchanged — and that is what the
 * control worlds prove.
 */

import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import { farmSettings } from "../src/structures/farm.js";
import type { StructurePassResult } from "../src/structures/index.js";

/** A small settlement document; `farm` adds the holding. */
function doc(withFarm: boolean, params: Record<string, unknown> = {}): unknown {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "farm_wp1", worldSeed: 302 },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [192, 192] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 6, baseHeight: 72, seaLevel: 62, octaves: 3, frequency: 0.004 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: {} },
        ...(withFarm
          ? [
              {
                id: "east_farm",
                kind: "generator",
                generator: "precinct.farm@0",
                label: "the holding east of the village, wheat and roots",
                envelope: { shape: "region", size: [96, 80] },
                params: { parcels: 6, parcelSize: 18, crops: ["wheat", "potatoes"], ...params },
                ports: { gate: { type: "road_stub", face: "auto", tags: ["primary"] } },
                tags: ["farm", "rural"],
              },
            ]
          : []),
      ],
    },
  };
}

interface Compiled {
  readonly report: TerrainCompileReport;
  readonly structures?: StructurePassResult;
  readonly dir: string;
}

async function compile(input: unknown, name: string): Promise<Compiled> {
  const dir = path.join(root, name);
  const compiled = await compileTerrain(input, { outDir: dir });
  if (!compiled.ok) {
    throw new Error(
      `${name} failed to compile: ${compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`,
    );
  }
  return {
    report: compiled.report,
    structures: compiled.report.layout?.structures as StructurePassResult | undefined,
    dir,
  };
}

/** Every region file, hashed — the coarse byte-identity check. */
async function regionHashes(dir: string): Promise<Record<string, string>> {
  const regionDir = path.join(dir, "region");
  const out: Record<string, string> = {};
  for (const file of (await readdir(regionDir)).sort()) {
    out[file] = createHash("sha256")
      .update(await readFile(path.join(regionDir, file)))
      .digest("hex");
  }
  return out;
}

let root: string;
let withFarm: Compiled;
let without: Compiled;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "terrainist-farm-"));
  withFarm = await compile(doc(true), "with_farm");
  without = await compile(doc(false), "without_farm");
}, 600_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the node", () => {
  it("compiles, and the holding is seated on a footprint of its own size", () => {
    const placed = withFarm.report.layout?.placements.find((p) => p.nodePath === "world.east_farm");
    expect(placed).toBeDefined();
    expect(placed?.footprint.x1 ?? 0).toBe((placed?.footprint.x0 ?? 0) + 95);
    expect(placed?.footprint.z1 ?? 0).toBe((placed?.footprint.z0 ?? 0) + 79);
    // Ground, not a volume: one block of height and one rotation.
    expect(placed?.size[1]).toBe(1);
    expect(placed?.yaw).toBe(0);
  });

  it("raises no diagnostic — a generator with no pass would say so", () => {
    const noise = withFarm.report.diagnostics.filter(
      (d) => d.name === "GENERATOR_NOT_IMPLEMENTED" && d.nodePath === "world.east_farm",
    );
    expect(noise).toEqual([]);
    expect(withFarm.report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

describe("the report row", () => {
  it("reports the holding, with every WP-3..4 count at zero", () => {
    const farms = withFarm.report.farms;
    expect(farms).toHaveLength(1);
    const row = farms?.[0];
    expect(row?.nodePath).toBe("world.east_farm");
    expect(row?.id).toBe("east_farm");
    expect(row?.parcelsRequested).toBe(6);
    // WP-2 packs the fields; WP-3 sows them and WP-4 builds the yard.
    expect(row?.parcelsSeated).toBe(6);
    expect(row?.columnsClaimed).toBeGreaterThan(0);
    expect(row?.parcelWalls).toBe(0);
    expect(row?.crops).toEqual([]);
    expect(row?.farmstead).toEqual([]);
    expect(row?.yard).toBeUndefined();
    expect(row?.portAnchor).toBe("world.east_farm");
  });

  it("carries the params the author wrote", () => {
    const row = withFarm.report.farms?.[0];
    expect(row?.settings.parcels).toBe(6);
    expect(row?.settings.parcelSize).toBe(18);
    expect(row?.settings.crops).toEqual(["wheat", "potatoes"]);
    expect(row?.settings.edge).toBe("fence");
    expect(row?.settings.farmstead).toBe("auto");
    expect(row?.settings.fallow).toBe(0);
  });

  it("is absent, not empty, for a document with no farm node", () => {
    expect(without.report.farms).toBeUndefined();
    expect(without.report.stats.structures).toBeUndefined();
  });

  it("counts the holding in the structure stats", () => {
    expect(withFarm.report.stats.structures?.holdings).toBe(1);
    expect(withFarm.report.stats.structures?.farmParcels).toBe(6);
    expect(withFarm.report.stats.structures?.farmColumns).toBeGreaterThan(0);
  });
});

describe("no blocks — the WP-1 bar, kept at WP-2", () => {
  it("emits nothing at all", () => {
    expect(withFarm.structures?.farms?.blocks).toEqual([]);
  });

  it("lays no pad — a holding never levels its envelope", () => {
    const pads = withFarm.report.layout?.padEdits.filter((p) => p.nodePath === "world.east_farm");
    expect(pads).toEqual([]);
  });

  it("compiles to the same world twice — same document, same seed", async () => {
    const again = await compile(doc(true), "with_farm_again");
    expect(await regionHashes(again.dir)).toEqual(await regionHashes(withFarm.dir));
    expect(again.report.farms).toEqual(withFarm.report.farms);
  }, 600_000);

  it("would have noticed a difference — the harness sees one when there is one", async () => {
    const moved = await compile(
      {
        ...(doc(true) as { meta: Record<string, unknown> }),
        meta: { name: "farm_wp1", worldSeed: 303 },
      },
      "control",
    );
    expect(await regionHashes(moved.dir)).not.toEqual(await regionHashes(withFarm.dir));
  }, 600_000);
});

describe("params, defaulted once", () => {
  it("defaults every param §3.3 gives a default", () => {
    expect(farmSettings({})).toEqual({
      parcels: 4,
      parcelSize: 16,
      crops: [],
      farmstead: "auto",
      edge: "fence",
      fallow: 0,
    });
  });

  it("drops a crop id the kit does not grow — the validator already said so", () => {
    expect(farmSettings({ crops: ["wheat", "rice"] }).crops).toEqual(["wheat"]);
  });

  it("clamps rather than crashes on a value the validator would have rejected", () => {
    expect(farmSettings({ parcels: 99, parcelSize: 2, fallow: 4 })).toMatchObject({
      parcels: 24,
      parcelSize: 10,
      fallow: 1,
    });
  });

  it("keeps an explicit farmstead list in the author's order", () => {
    expect(farmSettings({ farmstead: ["barn", "farmhouse"] }).farmstead).toEqual([
      "barn",
      "farmhouse",
    ]);
    expect(farmSettings({ farmstead: "none" }).farmstead).toBe("none");
  });
});

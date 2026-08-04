/**
 * Hovering landmarks — `"params": {"hover": N}` on an `authored:<id>` node.
 *
 * The defect this file exists to prevent is a live one (invasion attempt 6): a
 * mothership "looming over the town" was fed to the layout solver as a ground
 * box, could not overlap the settlement, and was parked in a corner of the map.
 *
 * The claims:
 *
 * 1. `planHoverSite` seats the node-local `y = 0` exactly `hover` blocks above
 *    the **highest** ground column under the footprint.
 * 2. The footprint is centred in the node's `zone` cell, or on the region when
 *    the node named none, and never leaves the region.
 * 3. A hovering job claims no ground: what stands under it is free to build.
 * 4. A non-hovering landmark is untouched — it still claims its footprint.
 */

import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { centeredRegion } from "@terrainist/stdlib";
import type { AuthoredProgramRecord } from "@terrainist/spec";

import {
  buildPrograms,
  gateDoubleRun,
  planHoverSite,
  sourceHashOf,
} from "../src/programs/index.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";
import { compileTerrain } from "../src/terrain/compile.js";
import type { Rect } from "../src/layout/frames.js";
import type { ColumnPlan } from "../src/terrain/columns.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const stack = loadPrismarine("1.21.11");
const region = centeredRegion(192, 192);
const plan = devColumnPlan(region, stack);

function fixture(name: string): string {
  return readFileSync(path.join(here, "fixtures", "programs", name), "utf8");
}

function record(
  id: string,
  file: string,
  envelope: readonly [number, number, number],
  mode: AuthoredProgramRecord["mode"],
): AuthoredProgramRecord {
  const source = fixture(file);
  const draft: AuthoredProgramRecord = {
    mode,
    envelope,
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000",
  };
  return { ...draft, outputHash: gateDoubleRun(id, draft, 0n).outputHash };
}

const TOWER = record("tower", "tower.js", [17, 34, 17], "landmark");
const SAUCER = record("saucer", "saucer.js", [21, 13, 21], "plugin");

/** The highest ground column under a rect — what `hover` is measured from. */
function maxGround(p: ColumnPlan, rect: Rect): number {
  let top = -Infinity;
  for (let z = rect.z0; z <= rect.z1; z++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const g = p.ground[(z - p.region.z0) * p.region.width + (x - p.region.x0)] as number;
      if (g > top) top = g;
    }
  }
  return top;
}

describe("planHoverSite", () => {
  it("floats the node-local origin exactly `hover` above the highest column", () => {
    const site = planHoverSite({ envelope: [17, 34, 17], plan, hover: 48 });
    expect(site.baseY).toBe(maxGround(plan, site.footprint) + 48);
    expect(site.index).toBe(0);
  });

  it("centres on the region when the node named no zone", () => {
    const site = planHoverSite({ envelope: [16, 8, 16], plan, hover: 32 });
    const mx = (site.footprint.x0 + site.footprint.x1) / 2;
    const mz = (site.footprint.z0 + site.footprint.z1) / 2;
    expect(Math.abs(mx - (region.x0 + (region.width - 1) / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(mz - (region.z0 + (region.depth - 1) / 2))).toBeLessThanOrEqual(1);
  });

  it("centres inside the zone cell the node named", () => {
    const north = planHoverSite({ envelope: [16, 8, 16], plan, hover: 32, zone: "north" });
    const south = planHoverSite({ envelope: [16, 8, 16], plan, hover: 32, zone: "south" });
    expect(north.footprint.z1).toBeLessThan(south.footprint.z0);
    // North is −Z: the north cell sits in the top third of the region.
    expect(north.footprint.z0).toBeGreaterThanOrEqual(region.z0);
    expect(north.footprint.z1).toBeLessThan(region.z0 + Math.floor(region.depth / 3) + 16);
  });

  it("keeps a footprint bigger than its cell inside the region", () => {
    const site = planHoverSite({ envelope: [180, 20, 180], plan, hover: 64, zone: "northwest" });
    expect(site.footprint.x0).toBeGreaterThanOrEqual(region.x0);
    expect(site.footprint.z0).toBeGreaterThanOrEqual(region.z0);
    expect(site.footprint.x1).toBeLessThanOrEqual(region.x0 + region.width - 1);
    expect(site.footprint.z1).toBeLessThanOrEqual(region.z0 + region.depth - 1);
  });

  it("is a pure function of the ground and the params", () => {
    const a = planHoverSite({ envelope: [17, 34, 17], plan, hover: 48, zone: "east" });
    const b = planHoverSite({ envelope: [17, 34, 17], plan, hover: 48, zone: "east" });
    expect(b).toEqual(a);
  });
});

describe("the pass, given a hovering landmark", () => {
  const site = planHoverSite({ envelope: [17, 34, 17], plan, hover: 48 });

  function run(hovering: boolean) {
    return buildPrograms({
      jobs: [
        {
          nodePath: "world.mothership",
          programId: "tower",
          program: TOWER,
          mode: "landmark",
          placement: {
            footprint: site.footprint,
            baseY: site.baseY,
            ...(hovering ? { hovering: true } : {}),
          },
        },
        {
          nodePath: "world.saucers",
          programId: "saucer",
          program: SAUCER,
          mode: "plugin" as const,
          params: { program: "saucer", count: 24, spacing: 4, area: { all: true as const } },
        },
      ],
      plan,
      stack,
      worldSeed: 0n,
    });
  }

  it("builds the landmark in the air, at the site's elevated baseY", () => {
    const result = run(true);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const placed = result.placed.find((p) => p.nodePath === "world.mothership");
    expect(placed?.baseY).toBe(maxGround(plan, site.footprint) + 48);
    expect(placed?.hovering).toBe(true);
    const lowest = Math.min(
      ...result.blocks
        .filter((b) => b.y >= (placed?.baseY as number))
        .map((b) => b.y),
    );
    expect(lowest).toBe(placed?.baseY);
  });

  it("leaves the ground under it free — a scatter still lands beneath the hull", () => {
    const hovered = run(true);
    const seated = run(false);
    const under = (r: ReturnType<typeof run>): number =>
      r.placed.filter(
        (p) =>
          p.nodePath === "world.saucers" &&
          p.footprint.x0 <= site.footprint.x1 &&
          p.footprint.x1 >= site.footprint.x0 &&
          p.footprint.z0 <= site.footprint.z1 &&
          p.footprint.z1 >= site.footprint.z0,
      ).length;
    expect(under(hovered)).toBeGreaterThan(0);
    expect(under(seated)).toBe(0);
  });

  it("leaves a non-hovering landmark exactly as it was", () => {
    const seated = run(false);
    const placed = seated.placed.find((p) => p.nodePath === "world.mothership");
    expect(placed?.hovering).toBeUndefined();
    expect(placed?.baseY).toBe(site.baseY);
  });
});

/* -------------------------------------------------------------------------- */
/* end to end: a hovering landmark through a settlement compile                */
/* -------------------------------------------------------------------------- */

function hoverDocument(): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "hover_dale", worldSeed: 90210 },
    programs: { tower: record("tower", "tower.js", [17, 34, 17], "landmark") },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 12, seaLevel: 63, baseHeight: 78, erosionPasses: 1 },
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: { forceTheme: "temperate" },
        },
        {
          id: "mothership",
          kind: "generator",
          generator: "authored:tower",
          params: { hover: 48 },
          constraints: [{ zone: "center" }],
        },
      ],
    },
  };
}

describe("a hovering landmark through the compile pipeline", () => {
  it("skips the solver, builds once, and floats above the ground", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "terrainist-hover-"));
    try {
      const result = await compileTerrain(hoverDocument(), {
        outDir: path.join(dir, "hover_dale"),
      });
      expect(result.ok).toBe(true);
      const report = result.report;
      // Not a solver node: it competes for no ground at all.
      expect((report.layout?.placements ?? []).some((p) => p.nodePath === "world.mothership")).toBe(
        false,
      );
      const row = (report.stats.programs ?? []).find((r) => r.nodePath === "world.mothership");
      expect(row).toMatchObject({ programId: "tower", mode: "landmark", instances: 1 });
      expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      // The door anchor sits at node-local y ≈ 1, so its world Y is the
      // elevated baseY: far above any column of a 128×128 dev landscape.
      const door = report.markers.find((m) => m.id === "world.mothership#door");
      expect(door?.y).toBeGreaterThan(63 + 48);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 300_000);
});

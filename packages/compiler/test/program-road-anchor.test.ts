/**
 * A landmark program as a road destination — the road half of the bespoke
 * contract's promise that "a landmark is reachable without the author knowing
 * a coordinate of it".
 *
 * The defect this file exists to prevent: the programs pass published a
 * landmark's anchors as §7.3 markers and nothing consumed them, so a document
 * that named its shrine in `road.network@0`'s `anchors` list got a road network
 * that routed between the houses and ignored the shrine entirely.
 *
 * The claims:
 *
 * 1. Naming the landmark node in `params.anchors` routes a lane to it.
 * 2. The lane arrives at the program's own `door` anchor — the marker the
 *    programs pass published, which the author never wrote a coordinate for.
 * 3. A landmark the document does *not* name stays a plain landmark: no route.
 */

import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveWorldSeed } from "@terrainist/stdlib";
import type { AuthoredProgramRecord } from "@terrainist/spec";

import { compileTerrain, type TerrainCompileReport } from "../src/terrain/compile.js";
import { gateDoubleRun, sourceHashOf } from "../src/programs/index.js";
import { index } from "../src/structures/roads.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch: string[] = [];
const WORLD_SEED = 4242;

function record(id: string, file: string, envelope: readonly [number, number, number]): AuthoredProgramRecord {
  const source = readFileSync(path.join(here, "fixtures", "programs", file), "utf8");
  const draft: AuthoredProgramRecord = {
    mode: "landmark",
    envelope,
    source,
    sourceHash: sourceHashOf(source),
    outputHash: "b3:0000000000000000",
  };
  const gate = gateDoubleRun(id, draft, resolveWorldSeed(WORLD_SEED));
  expect(gate.ok).toBe(true);
  return { ...draft, outputHash: gate.outputHash };
}

function document(anchors: readonly string[], file = "tower.js"): Record<string, unknown> {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "shrine_lane", worldSeed: WORLD_SEED },
    programs: { tower: record("tower", file, [17, 34, 17]) },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [128, 128] },
      children: [
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { amplitude: 6, seaLevel: 63, baseHeight: 78, erosionPasses: 1 },
        },
        { id: "climate", kind: "generator", generator: "terrain.climate@0", params: { forceTheme: "temperate" } },
        {
          id: "town_hall",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [14, 10, 12] },
          params: { floors: 2 },
          constraints: [{ zone: "center" }, { clearance: 3 }],
          ports: { main_door: { type: "door", face: "south", tags: ["primary"] } },
          tags: ["civic"],
        },
        {
          id: "cottage",
          kind: "generator",
          generator: "building.grammar@0",
          envelope: { shape: "box", size: [8, 7, 9] },
          params: { floors: 1 },
          constraints: [{ zone: "west" }, { distance: "town_hall", min: 6, max: 60 }],
          ports: { door: { type: "door", face: "south" } },
          tags: ["house"],
        },
        // The landmark. It states no envelope (§7.6) and no port: its way in is
        // the `door` anchor the program itself publishes.
        {
          id: "shrine",
          kind: "generator",
          generator: "authored:tower",
          constraints: [{ zone: "east" }],
          tags: ["landmark"],
        },
        {
          id: "streets",
          kind: "generator",
          generator: "road.network@0",
          params: { anchors },
        },
      ],
    },
  };
}

async function compile(
  label: string,
  anchors: readonly string[],
  file?: string,
): Promise<TerrainCompileReport> {
  const dir = await mkdtemp(path.join(tmpdir(), `terrainist-${label}-`));
  scratch.push(dir);
  const result = await compileTerrain(document(anchors, file), {
    outDir: path.join(dir, "shrine_lane"),
  });
  if (!result.ok) {
    throw new Error(`compile failed: ${result.diagnostics.map((d) => d.message).join("; ")}`);
  }
  return result.report;
}

let reached: TerrainCompileReport;
let ignored: TerrainCompileReport;
let doorless: TerrainCompileReport;

beforeAll(async () => {
  reached = await compile("road-anchor-yes", ["town_hall", "#tag:house", "shrine"]);
  ignored = await compile("road-anchor-no", ["town_hall", "#tag:house"]);
  doorless = await compile(
    "road-anchor-doorless",
    ["town_hall", "#tag:house", "shrine"],
    "tower-no-door.js",
  );
}, 300_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("a landmark program named in road.network@0's anchors", () => {
  it("publishes its door as a §7.3 marker", () => {
    const marker = reached.markers.find((m) => m.id === "world.shrine#door");
    expect(marker).toBeDefined();
    expect(marker?.name).toBe("door");
  });

  it("becomes an endpoint of the network", () => {
    const roads = reached.layout?.structures?.roads;
    const routes = roads?.routes ?? [];
    expect(routes.length).toBeGreaterThan(0);
    // Either the lanes run *to* it (it is the biggest footprint, so it wins the
    // hub) or one runs *from* it; both are the same claim — it is on the net.
    expect(routes.some((r) => r.from === "world.shrine" || r.to === "world.shrine")).toBe(true);
    expect(roads?.unrouted ?? []).not.toContain("world.shrine");
  });

  it("puts road columns beside the door the program published", () => {
    const marker = reached.markers.find((m) => m.id === "world.shrine#door");
    expect(marker).toBeDefined();
    const mask = reached.layout?.structures?.roads?.roadColumns as Uint8Array;
    expect(mask).toBeDefined();
    // The author wrote no coordinate; the lane still arrives at the door. A
    // road column within the approach's reach of the published anchor is what
    // "reachable" means in blocks.
    expect(nearestRoad(mask, marker?.x as number, marker?.z as number, 8)).toBeLessThanOrEqual(6);
  });

  it("leaves an unnamed landmark alone — no lane goes to it", () => {
    const roads = ignored.layout?.structures?.roads;
    const routes = roads?.routes ?? [];
    expect(routes.some((r) => r.from === "world.shrine" || r.to === "world.shrine")).toBe(false);
    // It is still built, and its marker is still published.
    expect(ignored.markers.some((m) => m.id === "world.shrine#door")).toBe(true);
    // …and no lane comes anywhere near its door.
    const marker = ignored.markers.find((m) => m.id === "world.shrine#door");
    const mask = roads?.roadColumns as Uint8Array;
    expect(nearestRoad(mask, marker?.x as number, marker?.z as number, 8)).toBeGreaterThan(6);
  });
});

describe("a named landmark whose program published no door-ish anchor", () => {
  it("says so, naming the anchors it did publish, and still gets a lane", () => {
    const warned = doorless.diagnostics.filter(
      (d) => d.nodePath === "world.shrine" && d.message.includes("no door-ish anchor"),
    );
    expect(warned.length).toBe(1);
    expect(warned[0]?.severity).toBe("warning");
    expect(warned[0]?.message).toContain('"summit"');
    // Fallback, not failure: the lane arrives at the footprint edge.
    const roads = doorless.layout?.structures?.roads;
    expect((roads?.routes ?? []).length).toBeGreaterThan(0);
    expect(roads?.unrouted ?? []).not.toContain("world.shrine");
  });
});

/** The document's region: 128 × 128, centred, as `envelope.size` declares. */
const REGION = { x0: -64, z0: -64, width: 128, depth: 128 } as const;

/** Chebyshev distance to the nearest road column, searched out to `reach`. */
function nearestRoad(mask: Uint8Array, x: number, z: number, reach: number): number {
  let best = Infinity;
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const cx = x + dx;
      const cz = z + dz;
      if (cx < REGION.x0 || cz < REGION.z0) continue;
      if (cx >= REGION.x0 + REGION.width || cz >= REGION.z0 + REGION.depth) continue;
      if (mask[index(REGION, cx, cz)] !== 1) continue;
      best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dz)));
    }
  }
  return best;
}

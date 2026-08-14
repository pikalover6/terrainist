/**
 * Bespoke facing, from the relation a document writes to the blocks that end
 * up turned.
 *
 * The defect this exists to prevent is a walked one: sea monsters invading a
 * city with their backs to it. So the tests are about *direction* — which way a
 * declared front ends up pointing, given what the document said and where
 * things landed — and about the two properties that make the answer usable: it
 * is decided before the fit (so the footprint reserved is the footprint used),
 * and it is inert for every program that declares no front (so no world
 * authored before this changes by a block).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { centeredRegion } from "@terrainist/stdlib";
import type { AuthoredProgramRecord, SettlementDocument } from "@terrainist/spec";

import {
  buildPrograms,
  gateDoubleRun,
  planProgramFacings,
  planProgramSites,
  sourceHashOf,
  type ProgramFacing,
} from "../src/programs/index.js";
import { devColumnPlan } from "../src/devworld.js";
import { loadPrismarine } from "../src/emit/prismarine.js";

const here = path.dirname(fileURLToPath(import.meta.url));

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

const SENTINEL_ENVELOPE = [11, 12, 21] as const;
const SENTINEL = record("sentinel", "sentinel.js", SENTINEL_ENVELOPE, "both");
/** A program with no front at all — the reach law's witness. */
const TOWER = record("tower", "tower.js", [17, 34, 17], "landmark");

const REGION = centeredRegion(256, 256);

/** A settlement document carrying two bespoke nodes, however the test wants. */
function docWith(children: readonly Record<string, unknown>[]): SettlementDocument {
  return {
    programs: { sentinel: SENTINEL, tower: TOWER },
    root: { id: "world", kind: "composite", children },
  } as unknown as SettlementDocument;
}

/** One `authored:` landmark node. */
function landmark(
  id: string,
  zone: string,
  params?: Record<string, unknown>,
  program = "sentinel",
): Record<string, unknown> {
  return {
    id,
    kind: "generator",
    generator: `authored:${program}`,
    constraints: [{ zone }],
    ...(params === undefined ? {} : { params }),
  };
}

function facingsOf(
  children: readonly Record<string, unknown>[],
  scope: "landmark" | "plugin" = "landmark",
): { facings: ReadonlyMap<string, ProgramFacing>; codes: readonly string[] } {
  const plan = planProgramFacings({
    doc: docWith(children),
    rootPath: "world",
    region: REGION,
    worldSeed: 0n,
    scope,
  });
  return { facings: plan.facings, codes: plan.diagnostics.map((d) => d.code) };
}

describe("resolving a face relation", () => {
  it("points a front at the node the document named", () => {
    const { facings, codes } = facingsOf([
      landmark("watcher", "west", { face: { toward: "old_town" } }),
      landmark("old_town", "east"),
    ]);
    expect(codes).toEqual([]);
    expect(facings.get("world.watcher")?.rotation).toBe(90);
  });

  it("reverses it for `away_from`", () => {
    const { facings } = facingsOf([
      landmark("watcher", "west", { face: { away_from: "old_town" } }),
      landmark("old_town", "east"),
    ]);
    expect(facings.get("world.watcher")?.rotation).toBe(270);
  });

  it("lets two programs face each other, and says the same thing twice", () => {
    // The cycle the binding estimate exists for: each is aimed at where the
    // other is going to be, and neither waits for the other to be placed.
    const children = [
      landmark("north_host", "north", { face: { toward: "south_host" } }),
      landmark("south_host", "south", { face: { toward: "north_host" } }),
    ];
    const first = facingsOf(children).facings;
    const second = facingsOf(children).facings;
    expect(first.get("world.north_host")?.rotation).toBe(180);
    expect(first.get("world.south_host")?.rotation).toBe(0);
    expect([...second]).toEqual([...first]);
  });

  it("names a tag set, and faces the middle of it", () => {
    const { facings } = facingsOf([
      landmark("watcher", "west", { face: { toward: "#tag:civic" } }),
      { ...landmark("hall", "east"), tags: ["civic"] },
    ]);
    expect(facings.get("world.watcher")?.rotation).toBe(90);
  });

  it("warns on a target nothing places, and falls back to the default rule", () => {
    const { facings, codes } = facingsOf([
      landmark("watcher", "west", { face: { toward: "harbour" } }),
      landmark("old_town", "east"),
    ]);
    // Never fatal: the instance still stands, and it still faces the town.
    expect(codes).toEqual(["LOAM-W518"]);
    expect(facings.get("world.watcher")?.rotation).toBe(90);
  });

  it("faces the rest of the settlement when the document said nothing", () => {
    const { facings, codes } = facingsOf([
      landmark("watcher", "west"),
      landmark("old_town", "east"),
    ]);
    expect(codes).toEqual([]);
    expect(facings.get("world.watcher")?.rotation).toBe(90);
  });

  it("faces the network a road was told to reach it through", () => {
    const { facings } = facingsOf([
      landmark("watcher", "west"),
      landmark("old_town", "east"),
      {
        id: "roads",
        kind: "generator",
        generator: "road.network@0",
        params: { anchors: ["watcher", "old_town"] },
      },
    ]);
    expect(facings.get("world.watcher")?.rotation).toBe(90);
  });

  it("never turns a program that declares no front, whatever the document asks", () => {
    // The reach law, at its source: a `face` on a frontless program resolves to
    // nothing at all, so nothing downstream has a rotation to apply.
    const { facings, codes } = facingsOf([
      landmark("beacon", "west", { face: { toward: "old_town" } }, "tower"),
      landmark("old_town", "east", undefined, "tower"),
    ]);
    expect(codes).toEqual([]);
    expect(facings.size).toBe(0);
  });

  it("hands a scattered node the target rather than an answer", () => {
    const { facings } = facingsOf(
      [
        {
          id: "monsters",
          kind: "generator",
          generator: "scatter.program@0",
          params: { program: "sentinel", count: 4, face: { toward: "old_town" } },
        },
        landmark("old_town", "east", undefined, "tower"),
      ],
      "plugin",
    );
    const facing = facings.get("world.monsters");
    // One relation, and an answer per instance: the target is what travels.
    expect(facing?.rotation).toBeUndefined();
    expect(facing?.sense).toBe("toward");
    expect(facing?.target?.x).toBeGreaterThan(REGION.x0 + Math.floor(REGION.width / 2));
  });
});

describe("the placer, told which way an instance will stand", () => {
  const stack = loadPrismarine("1.21.11");
  const plan = devColumnPlan(centeredRegion(192, 192), stack);

  it("reserves the turned footprint, not the one the program declared", () => {
    for (const [rotation, w, d] of [
      [0, 11, 21],
      [90, 21, 11],
      [180, 11, 21],
      [270, 21, 11],
    ] as const) {
      const sites = planProgramSites({
        params: { program: "sentinel", count: 3, spacing: 8, area: { all: true } } as never,
        envelope: SENTINEL_ENVELOPE,
        plan,
        seed: new Uint8Array(32) as never,
        rotationAt: () => rotation,
      });
      expect(sites.length).toBeGreaterThan(0);
      for (const site of sites) {
        expect(site.footprint.x1 - site.footprint.x0 + 1).toBe(w);
        expect(site.footprint.z1 - site.footprint.z0 + 1).toBe(d);
        expect(site.rotation ?? 0).toBe(rotation);
      }
    }
  });
});

describe("the pass, building a turned landmark", () => {
  const stack = loadPrismarine("1.21.11");
  const plan = devColumnPlan(centeredRegion(192, 192), stack);

  function build(rotation: 0 | 90 | 180 | 270): ReturnType<typeof buildPrograms> {
    const turned = rotation === 90 || rotation === 270;
    const [w, d] = turned ? [21, 11] : [11, 21];
    return buildPrograms({
      jobs: [
        {
          nodePath: "world.watcher",
          programId: "sentinel",
          program: SENTINEL,
          mode: "landmark",
          placement: {
            footprint: { x0: 0, z0: 0, x1: w - 1, z1: d - 1 },
            baseY: 64,
            ...(rotation === 0 ? {} : { rotation }),
          },
        },
      ],
      plan,
      stack,
      worldSeed: 0n,
    });
  }

  it("puts the front where the turn points it, marker and blocks together", () => {
    const north = build(0);
    const east = build(90);
    expect(north.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(east.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Unturned, the front anchor sits on the north edge; turned a quarter
    // clockwise it sits on the east one.
    const front = (result: ReturnType<typeof buildPrograms>) =>
      result.markers.find((m) => m.name === "front");
    expect(front(north)).toMatchObject({ x: 5, z: 0 });
    expect(front(east)).toMatchObject({ x: 20, z: 5 });
    // …and the blocks came with it: the same count, in a box of swapped edges.
    expect(east.blocks.length).toBe(north.blocks.length);
    expect(Math.max(...east.blocks.map((b) => b.x))).toBe(20);
    expect(Math.max(...north.blocks.map((b) => b.x))).toBe(10);
  });

  it("turns the directional block states with the geometry", () => {
    const north = build(0);
    const east = build(90);
    const brow = (result: ReturnType<typeof buildPrograms>, x: number, z: number): number =>
      result.blocks.find((b) => b.x === x && b.z === z && b.y === 70)?.stateId ?? -1;
    // The stair that looked north at local (5, 1) looks east at world (19, 5).
    expect(brow(north, 5, 1)).toBe(
      stack.blockStateOf("stone_brick_stairs", { facing: "north", half: "bottom" }),
    );
    expect(brow(east, 19, 5)).toBe(
      stack.blockStateOf("stone_brick_stairs", { facing: "east", half: "bottom" }),
    );
  });

  it("is byte-for-byte the run it always was at rotation zero", () => {
    const once = build(0);
    const twice = build(0);
    expect(twice.blocks).toEqual(once.blocks);
    expect(twice.markers).toEqual(once.markers);
  });
});

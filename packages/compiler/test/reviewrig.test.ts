/**
 * The human-review rig.
 *
 * The rig is the one artefact in this compiler whose *output* is not the
 * world: it is a session document, joined back to the exact configuration that
 * produced each exhibit through the manifest. So the property that matters is
 * not "the world looks right" but "the manifest is true of the world" — every
 * station's command block has to carry the id the manifest claims and teleport
 * to the coordinates the manifest gives for its neighbour. A manifest that
 * drifts from the world does not fail loudly; it quietly files a reviewer's
 * "this roof is wrong" against a different building.
 *
 * The rest is the usual pair: the world lints clean under every physics rule
 * (a station is a void platform, so the traversal rules have to survive a
 * building whose only ground is its own platform), and two builds are
 * byte-identical.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadPrismarine, listRegionFiles, readGzippedNbt, readRegionChunksNbt } from "../src/emit/prismarine.js";
import type { PrismarineStack } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { PHYSICS_RULES, lintWorldPhysics, type PhysicsReport } from "../src/emit/physics.js";
import { planDevGrid } from "../src/devworld.js";
import { planPropExhibits } from "../src/devworld-rows.js";
import {
  RIG_BUTTON_SLOTS,
  RIG_GROUND_Y,
  RIG_MANIFEST_NAME,
  RIG_SPAWN_ID,
  buildReviewRig,
  planReviewRig,
  rigArrivalCommand,
  rigButtons,
  rigCells,
  stationIndex,
  type RigManifest,
  type RigResult,
} from "../src/reviewrig.js";

const stack: PrismarineStack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const scratch: string[] = [];

let rig: RigResult;
let manifest: RigManifest;

beforeAll(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "terrainist-rig-"));
  scratch.push(root);
  rig = await buildReviewRig(root);
  manifest = rig.manifest;
}, 300_000);

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Every block entity on disk, as raw simplified NBT, keyed by position. */
async function readEntityMap(worldDir: string): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const file of await listRegionFiles(path.join(worldDir, "region"))) {
    for (const { root } of readRegionChunksNbt(file, await readFile(file))) {
      const list = root["block_entities"];
      if (!Array.isArray(list)) continue;
      for (const raw of list as Record<string, unknown>[]) {
        out.set(`${String(raw["x"])},${String(raw["y"])},${String(raw["z"])}`, raw);
      }
    }
  }
  return out;
}

describe("the rig plan", () => {
  it("gives one station to every exhibit cell the dev world registers", () => {
    const plan = planReviewRig();
    const buildings = planDevGrid().exhibits.length;
    const props = planPropExhibits().exhibits.length;
    // Derived, never listed: a row added to the dev world's exhibit seam grows
    // the rig by itself, which is the whole reason the rig reads that registry
    // rather than a list of its own.
    expect(plan.stations).toHaveLength(buildings + props);
    expect(plan.stations.filter((s) => s.kind === "building")).toHaveLength(buildings);
    expect(plan.stations.filter((s) => s.kind === "prop")).toHaveLength(props);
    // The context strips are excluded: a context cell is a building *and its
    // ground*, and a flat platform would exhibit neither.
    expect(plan.stations.some((s) => s.provenance.row.startsWith("context"))).toBe(false);
  });

  it("gives every station a unique id and a disjoint platform", () => {
    const plan = planReviewRig();
    const all = [plan.spawn, ...plan.stations];
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    // Sorted by row then column, so only neighbours in the sweep can overlap.
    const sorted = [...all].sort((a, b) => a.platform.z0 - b.platform.z0 || a.platform.x0 - b.platform.x0);
    for (const [i, s] of sorted.entries()) {
      for (const other of sorted.slice(i + 1)) {
        if (other.platform.z0 > s.platform.z1) break;
        const overlaps =
          other.platform.x0 <= s.platform.x1 &&
          other.platform.x1 >= s.platform.x0 &&
          other.platform.z0 <= s.platform.z1 &&
          other.platform.z1 >= s.platform.z0;
        expect(overlaps, `${s.id} overlaps ${other.id}`).toBe(false);
      }
    }
  });

  it("puts every landing spot and every structure inside its own platform", () => {
    for (const s of [planReviewRig().spawn, ...planReviewRig().stations]) {
      expect(s.landing.x).toBeGreaterThanOrEqual(s.platform.x0);
      expect(s.landing.x).toBeLessThanOrEqual(s.platform.x1);
      expect(s.landing.z).toBeGreaterThanOrEqual(s.platform.z0);
      expect(s.landing.z).toBeLessThanOrEqual(s.platform.z1);
      expect(s.landing.y).toBe(RIG_GROUND_Y + 1);
      if (s.structure === undefined) continue;
      expect(s.structure.x0).toBeGreaterThanOrEqual(s.platform.x0);
      expect(s.structure.x1).toBeLessThanOrEqual(s.platform.x1);
      expect(s.structure.z0).toBeGreaterThanOrEqual(s.platform.z0);
      expect(s.structure.z1).toBeLessThanOrEqual(s.platform.z1);
    }
  });

  it("wraps NEXT and PREV at both ends", () => {
    const plan = planReviewRig();
    const first = plan.stations[0] as (typeof plan.stations)[number];
    const last = plan.stations[plan.stations.length - 1] as (typeof plan.stations)[number];
    expect(first.prev).toBe(last.id);
    expect(last.next).toBe(first.id);
    expect(plan.spawn.next).toBe(first.id);
    for (const [i, s] of plan.stations.entries()) {
      expect(s.next).toBe((plan.stations[(i + 1) % plan.stations.length] as typeof s).id);
    }
  });

  it("carries the generating configuration in every station's provenance", () => {
    const cells = rigCells();
    const plan = planReviewRig();
    for (const [i, s] of plan.stations.entries()) {
      const cell = cells[i] as (typeof cells)[number];
      expect(s.provenance).toEqual(cell.provenance);
      expect(s.provenance.nodePath).not.toBe("");
      expect(s.provenance.family).not.toBe("");
    }
    // The seed sweep is the row whose whole content is a salt, so it is the
    // one that proves the salt survives into the manifest.
    const salted = plan.stations.filter((s) => s.provenance.seedSalt !== undefined);
    expect(salted.length).toBeGreaterThan(0);
  });
});

describe("manifest ↔ world alignment", () => {
  it("puts every station's arrival command block under its landing spot", async () => {
    const entities = await readEntityMap(rig.worldDir);
    for (const station of [manifest.spawn, ...manifest.stations]) {
      const key = `${station.landing.x},${station.landing.y - 1},${station.landing.z}`;
      const compound = entities.get(key);
      expect(compound, `${station.id} has no arrival command block`).toBeDefined();
      expect(compound?.["id"]).toBe("minecraft:command_block");
      expect(compound?.["Command"]).toBe(`say >> STATION ${station.id}`);
      expect(compound?.["Command"]).toBe(station.commands["arrive"]);
      // Impulse, and never self-firing: an auto command block would announce
      // every station the moment its chunk loaded.
      expect(compound?.["auto"]).toBe(0);
      expect(compound?.["TrackOutput"]).toBe(0);
    }
  });

  it("teleports NEXT and PREV to the adjacent station's real landing spot", async () => {
    const entities = await readEntityMap(rig.worldDir);
    const plan = rig.plan;
    const byId = stationIndex(plan);
    const manifestById = new Map(manifest.stations.map((s) => [s.id, s]));

    for (const station of [plan.spawn, ...plan.stations]) {
      const buttons = rigButtons(station, byId);
      const zWall = station.platform.z1 - 1;
      for (const button of buttons) {
        const x = station.landing.x + (RIG_BUTTON_SLOTS[button.slot] as number);
        const compound = entities.get(`${x},${RIG_GROUND_Y + 1},${zWall}`);
        expect(compound, `${station.id} ${button.label} block missing`).toBeDefined();
        expect(compound?.["id"]).toBe("minecraft:command_block");
        expect(compound?.["Command"]).toBe(button.command);
        expect(compound?.["auto"]).toBe(0);

        if (button.label !== "NEXT" && button.label !== "PREV") continue;
        // The load-bearing claim: the coordinates in the command are the
        // *neighbour's* landing spot, as the manifest states it.
        const target = byId.get(button.label === "NEXT" ? station.next : station.prev);
        expect(compound?.["Command"]).toBe(`tp @p ${(target as { landing: { tp: string } }).landing.tp}`);
        const entry = manifestById.get(target?.id as string) ?? manifest.spawn;
        expect(button.command).toContain(entry.landing.tp);
      }
    }
  });

  it("says the station id in every verdict command", () => {
    for (const station of manifest.stations) {
      expect(station.commands["pass"]).toBe(`say VERDICT ${station.id} pass`);
      expect(station.commands["fail"]).toBe(`say VERDICT ${station.id} fail`);
      expect(station.commands["arrive"]).toBe(rigArrivalCommand(rig.plan.stations[station.index] as never));
    }
    // The spawn platform announces itself and offers only a way in.
    expect(manifest.spawn.id).toBe(RIG_SPAWN_ID);
    expect(manifest.spawn.commands["arrive"]).toBe(`say >> STATION ${RIG_SPAWN_ID}`);
    expect(manifest.spawn.commands["pass"]).toBeUndefined();
  });

  it("labels every station with signs that carry its id and its parameters", async () => {
    const entities = await readEntityMap(rig.worldDir);
    for (const station of manifest.stations) {
      const z = station.landing.z - 1;
      const lines: string[] = [];
      for (const dx of [-2, 2]) {
        const compound = entities.get(`${station.landing.x + dx},${RIG_GROUND_Y + 1},${z}`);
        expect(compound?.["id"], `${station.id} label sign missing`).toBe("minecraft:sign");
        const front = compound?.["front_text"] as { messages?: string[] } | undefined;
        lines.push(...((front?.messages ?? []) as string[]));
      }
      const text = lines.join(" ");
      expect(text).toContain(station.provenance.row);
      expect(text).toContain(station.provenance.family);
      expect(text).toContain(station.provenance.size.join("x"));
    }
  });

  it("writes a block entity for every sign and command block, and nothing else", async () => {
    const entities = await readEntityMap(rig.worldDir);
    expect(entities.size).toBe(rig.blockEntityCount);
    const ids = new Set([...entities.values()].map((e) => e["id"]));
    expect([...ids].sort()).toEqual(["minecraft:command_block", "minecraft:sign"]);
  });
});

describe("the world itself", () => {
  let report: PhysicsReport;

  beforeAll(async () => {
    // The same context a compiled world gets. A station is a void platform, so
    // this is also the check that the interior and traversal rules survive a
    // building whose only ground is the twenty-odd columns it stands on: the
    // walking agent has to find a start cell there, and finding none would
    // show up as `traversal.no_start` rather than as silence.
    report = await lintWorldPhysics(rig.worldDir, stack, {
      buildings: rig.buildings as never,
      props: rig.placedProps as never,
      minY: 36,
      maxY: 140,
    });
  }, 300_000);

  it("finds nothing wrong, under every rule", () => {
    const summary = report.findings
      .slice(0, 12)
      .map((f) => `${f.rule} @ ${f.x},${f.y},${f.z} ${f.block}: ${f.detail}`)
      .join("\n");
    expect(summary).toBe("");
    for (const rule of PHYSICS_RULES) expect(report.counts[rule], rule).toBe(0);
  });

  it("reads back a real world, with an exhibit on every platform", () => {
    expect(report.examined).toBeGreaterThan(500_000);
    expect(rig.buildings.length + rig.placedProps.length).toBe(rig.stationCount);
    expect(rig.chunkCount).toBeGreaterThan(0);
  });

  it("floats every platform in void — no bedrock, nothing between stations", async () => {
    const anvil = stack.openAnvil(path.join(rig.worldDir, "region"));
    try {
      const station = rig.plan.stations[0] as (typeof rig.plan.stations)[number];
      const chunk = await anvil.load(station.landing.x >> 4, station.landing.z >> 4);
      expect(chunk).not.toBeNull();
      const lx = station.landing.x - (station.landing.x >> 4) * 16;
      const lz = station.landing.z - (station.landing.z >> 4) * 16;
      // Bedrock is where every other world in this compiler starts a column.
      expect(stack.blockNameByStateId((chunk as NonNullable<typeof chunk>).getBlockStateId(lx, -64, lz)))
        .toBe("air");
      // And the sky above a platform is sky.
      expect(stack.blockNameByStateId((chunk as NonNullable<typeof chunk>).getBlockStateId(lx, 120, lz)))
        .toBe("air");
    } finally {
      await anvil.close();
    }
  });

  it("turns command-block output off in level.dat, under the 1.21.9+ rule name", async () => {
    const level = readGzippedNbt(await readFile(rig.levelDatPath)) as {
      Data: { game_rules: Record<string, number>; allowCommands: number; GameType: number };
    };
    // Verified against real 1.21.11 saves: the compound is `game_rules` and
    // its keys are namespaced snake_case, not the old camelCase `GameRules`.
    expect(level.Data.game_rules["minecraft:command_block_output"]).toBe(0);
    expect(level.Data.game_rules["minecraft:do_daylight_cycle"]).toBe(0);
    // Command blocks do nothing at all without these two.
    expect(level.Data.allowCommands).toBe(1);
    expect(level.Data.GameType).toBe(1);
  });

  it("writes the manifest next to the world", async () => {
    const file = path.join(path.dirname(rig.worldDir), RIG_MANIFEST_NAME);
    const parsed = JSON.parse(await readFile(file, "utf8")) as RigManifest;
    expect(parsed.format).toBe("terrainist-review-rig/1");
    expect(parsed.stations).toHaveLength(rig.stationCount);
    expect(parsed).toEqual(manifest);
  });
});

describe("determinism", () => {
  it("builds byte-identical worlds and manifests twice over", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-rig-det-"));
    scratch.push(root);
    const again = await buildReviewRig(root);

    expect(again.regionFiles).toHaveLength(rig.regionFiles.length);
    expect(JSON.stringify(again.manifest)).toBe(JSON.stringify(rig.manifest));
    for (const [i, file] of again.regionFiles.entries()) {
      const [a, b] = await Promise.all([
        readFile(file),
        readFile(rig.regionFiles[i] as string),
      ]);
      expect(path.basename(file)).toBe(path.basename(rig.regionFiles[i] as string));
      expect(a.equals(b), path.basename(file)).toBe(true);
    }
    const [la, lb] = await Promise.all([readFile(again.levelDatPath), readFile(rig.levelDatPath)]);
    expect(la.equals(lb)).toBe(true);
  }, 300_000);
});

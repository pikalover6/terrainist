/**
 * The Terrarium — the human-review world.
 *
 * It is the one artefact in this compiler whose *output* is not the
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
 *
 * v2 adds the multi-structure band, and with it one property the
 * single-structure stations could never test: that a *compiled settlement*
 * survives being transplanted onto a floating platform. Every claim below that
 * mentions a multi-station is really a claim about the transplant — the columns
 * came from the mini-document's own plan, the blocks were translated by the
 * same offset, and the tunnel the physics lint walks through was bored by the
 * real tunnel pass in a world that was never written to disk.
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
  TERRARIUM_CUBE_OFFSET,
  TERRARIUM_CUBE_SIZE,
  TERRARIUM_GAME_TYPE,
  TERRARIUM_GROUND_Y,
  TERRARIUM_MANIFEST_NAME,
  TERRARIUM_SPAWN_ID,
  buildTerrarium,
  planTerrarium,
  terrariumArrivalCommand,
  terrariumCubes,
  terrariumCells,
  terrariumManifest,
  stationIndex,
  type TerrariumManifest,
  type TerrariumResult,
  TERRARIUM_MANIFEST_FORMAT,
} from "../src/terrarium.js";
import { multiStationSpecs } from "../src/terrarium-stations.js";

const stack: PrismarineStack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const scratch: string[] = [];

let rig: TerrariumResult;
let manifest: TerrariumManifest;

beforeAll(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "terrainist-rig-"));
  scratch.push(root);
  rig = await buildTerrarium(root);
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

describe("the plan", () => {
  it("gives one station to every exhibit cell the dev world registers", () => {
    const plan = planTerrarium();
    const buildings = planDevGrid().exhibits.length;
    const props = planPropExhibits().exhibits.length;
    const multi = multiStationSpecs().length;
    // Derived, never listed: a row added to the dev world's exhibit seam grows
    // the Terrarium by itself, which is the whole reason it reads that registry
    // rather than a list of its own.
    expect(plan.stations).toHaveLength(buildings + props + multi);
    expect(plan.singles).toHaveLength(buildings + props);
    expect(plan.multi).toHaveLength(multi);
    expect(plan.stations.filter((s) => s.kind === "building")).toHaveLength(buildings);
    expect(plan.stations.filter((s) => s.kind === "prop")).toHaveLength(props);
    // The context strips are excluded: a context cell is a building *and its
    // ground*, and a flat platform would exhibit neither.
    expect(plan.stations.some((s) => s.provenance.row.startsWith("context"))).toBe(false);
  });

  it("gives every station a unique id and a disjoint platform", () => {
    const plan = planTerrarium();
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
    for (const s of [planTerrarium().spawn, ...planTerrarium().stations]) {
      expect(s.landing.x).toBeGreaterThanOrEqual(s.platform.x0);
      expect(s.landing.x).toBeLessThanOrEqual(s.platform.x1);
      expect(s.landing.z).toBeGreaterThanOrEqual(s.platform.z0);
      expect(s.landing.z).toBeLessThanOrEqual(s.platform.z1);
      expect(s.landing.y).toBe(TERRARIUM_GROUND_Y + 1);
      if (s.structure === undefined) continue;
      expect(s.structure.x0).toBeGreaterThanOrEqual(s.platform.x0);
      expect(s.structure.x1).toBeLessThanOrEqual(s.platform.x1);
      expect(s.structure.z0).toBeGreaterThanOrEqual(s.platform.z0);
      expect(s.structure.z1).toBeLessThanOrEqual(s.platform.z1);
    }
  });

  it("wraps NEXT and PREV at both ends", () => {
    const plan = planTerrarium();
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
    const cells = terrariumCells();
    const plan = planTerrarium();
    for (const [i, s] of plan.singles.entries()) {
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

  it("teleports each travel cube to the adjacent station's real landing spot", async () => {
    const entities = await readEntityMap(rig.worldDir);
    const plan = rig.plan;
    const byId = stationIndex(plan);
    const manifestById = new Map(manifest.stations.map((s) => [s.id, s]));

    for (const station of [plan.spawn, ...plan.stations]) {
      const cubes = terrariumCubes(station, byId);
      expect(cubes).toHaveLength(2);
      expect(cubes.map((c) => c.direction)).toEqual(["prev", "next"]);
      for (const cube of cubes) {
        expect(cube.target).toBe(cube.direction === "next" ? station.next : station.prev);
        const target = byId.get(cube.target) as NonNullable<ReturnType<typeof byId.get>>;
        // The load-bearing claim: the coordinates in the command are the
        // *neighbour's* landing spot, as the manifest states it.
        expect(cube.teleport.endsWith(` ${target.landing.tp}`)).toBe(true);
        const entry = manifestById.get(target.id) ?? manifest.spawn;
        expect(cube.teleport).toContain(entry.landing.tp);
        // The marker the harvester joins on is the *destination's*, and it is
        // the same string the destination's own arrival plate says.
        expect(cube.marker).toBe(terrariumArrivalCommand(target));
        expect(cube.marker).toBe(`say >> STATION ${cube.target}`);

        // The chain, on disk: repeating detector, then two conditional chain
        // blocks, all always-active and all buried under the pad.
        const roles = ["detect", "teleport", "marker"] as const;
        for (const [i, slot] of cube.blocks.entries()) {
          expect(slot.role).toBe(roles[i]);
          expect(slot.y).toBe(TERRARIUM_GROUND_Y - 1);
          const compound = entities.get(`${slot.x},${slot.y},${slot.z}`);
          expect(compound, `${station.id} ${cube.direction} ${slot.role} missing`).toBeDefined();
          expect(compound?.["id"]).toBe("minecraft:command_block");
          expect(compound?.["Command"]).toBe(cube[slot.role]);
          // Always active: there is no redstone underground, and a spectator
          // cannot press anything.
          expect(compound?.["auto"]).toBe(1);
          expect(compound?.["TrackOutput"]).toBe(0);
        }
        // The detector and the teleport must agree about the region, exactly.
        const selector = `@a[x=${cube.region.x0},y=${cube.region.y0},z=${cube.region.z0},dx=${
          TERRARIUM_CUBE_SIZE - 1
        },dy=${TERRARIUM_CUBE_SIZE - 1},dz=${TERRARIUM_CUBE_SIZE - 1}]`;
        expect(cube.detect).toBe(`execute if entity ${selector}`);
        expect(cube.teleport.startsWith(`tp ${selector} `)).toBe(true);
      }
    }
  });

  it("has no verdict machinery left — a verdict is typed, not pressed", () => {
    for (const station of [manifest.spawn, ...manifest.stations]) {
      expect(station.commands["pass"]).toBeUndefined();
      expect(station.commands["fail"]).toBeUndefined();
      expect(Object.keys(station.commands).sort()).toEqual(["arrive", "next", "prev"]);
      expect(station.commands["arrive"]).toBe(`say >> STATION ${station.id}`);
    }
    // No command anywhere in the world says VERDICT, and none teleports `@p`:
    // the whole rig addresses `@a`, because that is what matches a spectator.
    const commands = rig.entities
      .filter((e) => e.id === "minecraft:command_block")
      .map((e) => (e.data["Command"] as { value: string }).value);
    expect(commands.some((c) => c.includes("VERDICT"))).toBe(false);
    expect(commands.some((c) => c.includes("@p"))).toBe(false);
    expect(manifest.spawn.id).toBe(TERRARIUM_SPAWN_ID);
  });

  it("puts two marked travel cubes beside every landing, clear of everything else", async () => {
    const anvil = stack.openAnvil(path.join(rig.worldDir, "region"));
    const byId = stationIndex(rig.plan);
    try {
      for (const station of [rig.plan.spawn, ...rig.plan.stations]) {
        const cubes = terrariumCubes(station, byId);
        for (const cube of cubes) {
          // Beside the landing, never on it: an arriving teleport must not drop
          // the player into a cube, or the walk would run away from them.
          const dx = Math.abs(cube.pad.x0 + 1 - station.landing.x);
          expect(dx).toBe(TERRARIUM_CUBE_OFFSET);
          expect(station.landing.x < cube.pad.x0 || station.landing.x > cube.pad.x1).toBe(true);
          // On its own platform, both pad and cube.
          expect(cube.pad.x0).toBeGreaterThanOrEqual(station.platform.x0);
          expect(cube.pad.x1).toBeLessThanOrEqual(station.platform.x1);
          expect(cube.pad.z0).toBeGreaterThanOrEqual(station.platform.z0);
          expect(cube.pad.z1).toBeLessThanOrEqual(station.platform.z1);
          // Clear of the exhibit's own footprint...
          const s = station.structure;
          if (s !== undefined) {
            expect(cube.pad.x1 < s.x0 || cube.pad.x0 > s.x1 || cube.pad.z1 < s.z0 || cube.pad.z0 > s.z1)
              .toBe(true);
          }
          // ...and of the label signs, which stand at landing.x ± 2.
          for (const sx of [station.landing.x - 2, station.landing.x + 2]) {
            expect(sx < cube.pad.x0 || sx > cube.pad.x1).toBe(true);
          }
          // The two cubes never touch each other.
          expect(cubes.filter((c) => c.pad.x1 >= cube.pad.x0 && c.pad.x0 <= cube.pad.x1))
            .toHaveLength(1);

          // And on disk: a solid coloured pad with a glazed eye, and three
          // courses of air above it that a spectator can fly into.
          const at = async (x: number, y: number, z: number): Promise<string> => {
            // Per block, not per pad: a 3x3 pad can straddle a chunk boundary.
            const chunk = await anvil.load(x >> 4, z >> 4);
            expect(chunk, `${station.id} cube chunk missing`).not.toBeNull();
            return stack.blockNameByStateId(
              (chunk as NonNullable<typeof chunk>).getBlockStateId(
                x - (x >> 4) * 16,
                y,
                z - (z >> 4) * 16,
              ),
            );
          };
          expect(await at(cube.pad.x0, TERRARIUM_GROUND_Y, cube.pad.z0)).toBe(cube.padBlock);
          expect(await at(cube.pad.x1, TERRARIUM_GROUND_Y, cube.pad.z1)).toBe(cube.padBlock);
          expect(await at(cube.pad.x0 + 1, TERRARIUM_GROUND_Y, cube.pad.z0 + 1)).toBe(cube.eyeBlock);
          for (let y = cube.region.y0; y <= cube.region.y1; y++) {
            expect(await at(cube.pad.x0 + 1, y, cube.pad.z0 + 1), `${station.id} cube blocked`)
              .toBe("air");
          }
        }
        // Lime forward, red back — the whole navigation UI, readable in flight.
        expect(cubes.map((x) => x.padBlock)).toEqual(["red_concrete", "lime_concrete"]);
      }
    } finally {
      await anvil.close();
    }
  }, 300_000);

  it("labels every station with signs that carry its id and its parameters", async () => {
    const entities = await readEntityMap(rig.worldDir);
    for (const station of manifest.stations) {
      const z = station.landing.z - 1;
      const lines: string[] = [];
      for (const dx of [-2, 2]) {
        const compound = entities.get(`${station.landing.x + dx},${TERRARIUM_GROUND_Y + 1},${z}`);
        expect(compound?.["id"], `${station.id} label sign missing`).toBe("minecraft:sign");
        const front = compound?.["front_text"] as { messages?: string[] } | undefined;
        lines.push(...((front?.messages ?? []) as string[]));
      }
      const text = lines.join(" ");
      expect(text).toContain(station.provenance.row);
      expect(text).toContain(station.provenance.family);
      // A single-structure station's sign quotes its generator's config; a
      // multi-structure one has no single config to quote and says the question
      // being asked instead, which is what a reviewer standing in front of a
      // hamlet actually needs.
      if (station.multi === undefined) {
        expect(text).toContain(station.provenance.size.join("x"));
      } else {
        expect(text).toContain("JUDGE THIS");
        expect(text).toContain(station.multi.title);
      }
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
    // The same context a compiled world gets, for both kinds of station at
    // once: `rig.buildings` and `rig.placedProps` already carry the
    // transplanted settlements' geometry translated into world space, and
    // `tunnels` is what points the walking agent at the connected pair's
    // gallery — cellar to cellar, down one ladder and up the other.
    report = await lintWorldPhysics(rig.worldDir, stack, {
      buildings: rig.buildings as never,
      props: rig.placedProps as never,
      tunnels: rig.tunnels as never,
      roads: rig.roads as never,
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
    // Every single-structure station is exactly one building or one prop; the
    // multi ones contribute a settlement's worth on top.
    const fromMulti = [...rig.compiled.values()].reduce(
      (n, m) => n + m.buildings.length + m.props.length,
      0,
    );
    expect(rig.buildings.length + rig.placedProps.length).toBe(
      rig.plan.singles.length + fromMulti,
    );
    expect(rig.chunkCount).toBeGreaterThan(0);
  });

  it("actually walks a tunnel — the rule is asked something, not nothing", () => {
    // A traversal rule that reports nothing because the world contains no
    // tunnel is not a passing rule, it is an unasked one. The connected pair
    // and the junction between them owe the lint three galleries.
    expect(rig.tunnels.length).toBeGreaterThanOrEqual(3);
    expect(rig.roads.length).toBeGreaterThan(0);
    for (const t of rig.tunnels) {
      expect(t.from.y).toBeLessThan(TERRARIUM_GROUND_Y);
      expect(t.to.y).toBeLessThan(TERRARIUM_GROUND_Y);
    }
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

  it("opens in spectator, with mobs and command-block output off", async () => {
    const level = readGzippedNbt(await readFile(rig.levelDatPath)) as {
      Data: { game_rules: Record<string, number>; allowCommands: number; GameType: number };
    };
    // Verified against real 1.21.11 saves: the compound is `game_rules` and
    // its keys are namespaced snake_case, not the old camelCase `GameRules`.
    expect(level.Data.game_rules["minecraft:command_block_output"]).toBe(0);
    expect(level.Data.game_rules["minecraft:do_daylight_cycle"]).toBe(0);
    // v3: ambient animals wandered into the exhibits in the first real session,
    // and one sheep is half the frame on a void platform.
    expect(level.Data.game_rules["minecraft:do_mob_spawning"]).toBe(0);
    expect(manifest.gameRules["minecraft:do_mob_spawning"]).toBe(false);
    // Command blocks do nothing at all without this.
    expect(level.Data.allowCommands).toBe(1);
    // v3: the reviewer flies. 3 is spectator — set as the world's *default*
    // rather than enforced per tick, so switching to creative for a screenshot
    // sticks.
    expect(level.Data.GameType).toBe(3);
    expect(TERRARIUM_GAME_TYPE).toBe(3);
  });

  it("writes the manifest next to the world", async () => {
    const file = path.join(path.dirname(rig.worldDir), TERRARIUM_MANIFEST_NAME);
    const parsed = JSON.parse(await readFile(file, "utf8")) as TerrariumManifest;
    expect(parsed.format).toBe(TERRARIUM_MANIFEST_FORMAT);
    expect(TERRARIUM_MANIFEST_FORMAT).toBe("terrainist-terrarium/2");
    expect(path.basename(file)).toBe("terrarium.manifest.json");
    expect(parsed.stations).toHaveLength(rig.stationCount);
    expect(parsed).toEqual(manifest);
  });

  /**
   * Provenance is an *argument*, never a read: the manifest builder stays pure,
   * so the same plan plus the same provenance is the same manifest, and a
   * caller that has no repository gets a manifest with no provenance key at
   * all rather than a field full of nulls.
   */
  it("carries provenance only when the caller supplies it", () => {
    const plan = planTerrarium();
    const bare = terrariumManifest(plan, stack);
    expect(bare.provenance).toBeUndefined();
    expect(Object.keys(bare)).not.toContain("provenance");

    const stamped = terrariumManifest(plan, stack, undefined, {
      commit: "a".repeat(40),
      branch: "main",
      dirty: false,
      baseline: "b".repeat(40),
      isBaseline: false,
    });
    expect(stamped.provenance).toEqual({
      commit: "a".repeat(40),
      branch: "main",
      dirty: false,
      baseline: "b".repeat(40),
      isBaseline: false,
    });
    // Everything else is untouched — provenance is additive, hence no format bump.
    expect({ ...stamped, provenance: undefined }).toEqual({ ...bare, provenance: undefined });
    expect(stamped.format).toBe(TERRARIUM_MANIFEST_FORMAT);
  });
});

describe("determinism", () => {
  it("builds byte-identical worlds and manifests twice over", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "terrainist-rig-det-"));
    scratch.push(root);
    const again = await buildTerrarium(root);

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

describe("the multi-structure band", () => {
  it("compiles one mini-settlement per multi-station, with content in it", () => {
    const specs = multiStationSpecs();
    expect(specs.length).toBeGreaterThanOrEqual(6);
    expect(specs.length).toBeLessThanOrEqual(10);
    expect(new Set(specs.map((x) => x.id)).size).toBe(specs.length);
    expect(new Set(specs.map((x) => x.kind)).size).toBe(specs.length);
    expect(rig.multiStationCount).toBe(specs.length);

    for (const spec of specs) {
      const mini = rig.compiled.get(spec.id);
      expect(mini, spec.id).toBeDefined();
      const m = mini as NonNullable<typeof mini>;
      // The point of a multi-station is that it exhibits a *composition*: a
      // station whose settlement came out as one lonely building would be a
      // single-structure station with a bigger platform.
      const parts = m.buildings.length + m.props.length + m.routes.length + m.tunnels.length;
      expect(parts, `${spec.id} has ${parts} structures`).toBeGreaterThanOrEqual(2);
    }

    // Each station's own reason for existing, asserted rather than assumed —
    // otherwise a document that silently stopped producing a tunnel would keep
    // passing as "a station with two buildings on it".
    const of = (kind: string) =>
      rig.compiled.get(multiStationSpecs().find((x) => x.kind === kind)?.id as string);
    expect((of("connected_pair") as never as { tunnels: unknown[] }).tunnels).toHaveLength(1);
    expect((of("tunnel_junction") as never as { tunnels: unknown[] }).tunnels).toHaveLength(2);
    expect((of("road_context") as never as { routes: unknown[] }).routes.length).toBeGreaterThan(0);
    expect((of("hillside_lane") as never as { routes: unknown[] }).routes.length).toBeGreaterThan(0);
    expect((of("village_slice") as never as { buildings: unknown[]; routes: unknown[]; plazaColumns: number }).buildings.length)
      .toBeGreaterThanOrEqual(4);
    expect((of("village_slice") as never as { plazaColumns: number }).plazaColumns).toBeGreaterThan(0);
    expect((of("waterfront") as never as { props: { prop?: string }[] }).props.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps every transplanted block on its own platform", () => {
    // The transplant's one hard invariant. A settlement's edge building can
    // overhang the compiled region, and a block one column past the platform
    // is a block standing in the void — visually a broken generator, and a
    // physics finding besides.
    const platforms = rig.plan.multi.map((s) => s.platform);
    for (const station of rig.plan.multi) {
      const p = station.platform;
      const region = (station.multi as NonNullable<typeof station.multi>).region;
      // The region sits inside the platform with room to spare on three sides
      // and the apron on the fourth.
      expect(region.x0).toBeGreaterThan(p.x0);
      expect(region.x1).toBeLessThan(p.x1);
      expect(region.z0).toBeGreaterThan(p.z0);
      expect(region.z1).toBeLessThan(p.z1);
      // The landing plate is on the apron, south of the settlement.
      expect(station.landing.z).toBeGreaterThan(region.z1);
    }
    // And no multi platform touches another, or a single one.
    for (const [i, a] of platforms.entries()) {
      for (const b of platforms.slice(i + 1)) {
        expect(a.x1 < b.x0 || b.x1 < a.x0 || a.z1 < b.z0 || b.z1 < a.z0).toBe(true);
      }
      for (const s of rig.plan.singles) {
        const b = s.platform;
        expect(a.x1 < b.x0 || b.x1 < a.x0 || a.z1 < b.z0 || b.z1 < a.z0).toBe(true);
      }
    }
  });

  it("puts the settlement's ground where the platform's is, so the apron meets it flush", async () => {
    const anvil = stack.openAnvil(path.join(rig.worldDir, "region"));
    try {
      for (const station of rig.plan.multi) {
        const region = (station.multi as NonNullable<typeof station.multi>).region;
        // The seam: the settlement's southernmost row and the apron row that
        // abuts it must be the same height, or a reviewer walks into a step.
        for (const [x, z] of [
          [region.x0, region.z1],
          [region.x1, region.z1],
          [region.x0, region.z1 + 1],
          [region.x1, region.z1 + 1],
        ] as const) {
          const chunk = await anvil.load(x >> 4, z >> 4);
          expect(chunk, `${station.id} chunk missing`).not.toBeNull();
          const c = chunk as NonNullable<typeof chunk>;
          const solid = stack.blockNameByStateId(c.getBlockStateId(x - (x >> 4) * 16, TERRARIUM_GROUND_Y, z - (z >> 4) * 16));
          const above = stack.blockNameByStateId(c.getBlockStateId(x - (x >> 4) * 16, TERRARIUM_GROUND_Y + 1, z - (z >> 4) * 16));
          expect(solid, `${station.id} rim at ${x},${z}`).not.toBe("air");
          expect(above, `${station.id} above rim at ${x},${z}`).toBe("air");
        }
      }
    } finally {
      await anvil.close();
    }
  }, 120_000);
});

describe("manifest v2", () => {
  it("declares the v2 format and counts its multi-stations", () => {
    expect(manifest.format).toBe("terrainist-terrarium/2");
    expect(manifest.multiStationCount).toBe(rig.plan.multi.length);
    expect(manifest.stationCount).toBe(manifest.stations.length);
    expect(manifest.world).toBe("terrarium");
  });

  it("carries the v3 travel cubes additively, without bumping the format", () => {
    // Additive-only doctrine: the harvester joins on `id` and reads nothing
    // here, so a v2 reader is unaffected and the format string does not move.
    expect(manifest.format).toBe("terrainist-terrarium/2");
    const byId = stationIndex(rig.plan);
    for (const entry of [manifest.spawn, ...manifest.stations]) {
      const cubes = entry.cubes as NonNullable<typeof entry.cubes>;
      expect(cubes, entry.id).toHaveLength(2);
      const station = byId.get(entry.id) as NonNullable<ReturnType<typeof byId.get>>;
      expect(cubes).toEqual(terrariumCubes(station, byId));
      expect(cubes.map((c) => c.target)).toEqual([entry.prev, entry.next]);
      expect(entry.commands["next"]).toBe((cubes[1] as (typeof cubes)[number]).teleport);
      expect(entry.commands["prev"]).toBe((cubes[0] as (typeof cubes)[number]).teleport);
    }
  });

  it("gives every multi-station its structures and its whole document, and no single-station either", () => {
    for (const entry of manifest.stations) {
      if (entry.kind !== "multi") {
        expect(entry.structures, entry.id).toBeUndefined();
        expect(entry.document, entry.id).toBeUndefined();
        expect(entry.multi, entry.id).toBeUndefined();
        continue;
      }
      expect(entry.multi, entry.id).toBeDefined();
      const structures = entry.structures as NonNullable<typeof entry.structures>;
      expect(structures.length, entry.id).toBeGreaterThanOrEqual(2);
      for (const structure of structures) {
        // The join a review note travels along: a node path into the document
        // that is sitting right beside it in the same manifest entry.
        expect(structure.nodePath, entry.id).not.toBe("");
        expect(structure.id, entry.id).not.toBe("");
        expect(structure.generator, entry.id).not.toBe("");
        expect(structure.provenance, `${entry.id}/${structure.id}`).toBeDefined();
      }
      // Inline and verbatim: a path would be a promise that a file still says
      // what it said, and a session is read weeks later.
      const doc = entry.document as { profile?: string; meta?: { name?: string; worldSeed?: number } };
      expect(doc.profile).toBe("settlement");
      expect(doc.meta?.name).toBe(entry.multi?.document);
      expect(doc.meta?.worldSeed).toBe(entry.multi?.worldSeed);
    }
  });

  it("puts every structure's footprint inside the station that exhibits it", () => {
    for (const entry of manifest.stations) {
      if (entry.kind !== "multi") continue;
      for (const structure of entry.structures ?? []) {
        const f = structure.provenance.footprint;
        if (f === undefined) continue;
        // Translated, not left in document space. A footprint still centred on
        // the origin would join a note to a hole in the void.
        expect(f.x0, `${entry.id}/${structure.id}`).toBeGreaterThanOrEqual(entry.platform.x0 - 2);
        expect(f.x1, `${entry.id}/${structure.id}`).toBeLessThanOrEqual(entry.platform.x1 + 2);
        expect(f.z0, `${entry.id}/${structure.id}`).toBeGreaterThanOrEqual(entry.platform.z0 - 2);
        expect(f.z1, `${entry.id}/${structure.id}`).toBeLessThanOrEqual(entry.platform.z1 + 2);
      }
      // A tunnel names the two nodes it joins, and both are in the same list.
      const ids = new Set((entry.structures ?? []).map((x) => x.nodePath));
      for (const structure of entry.structures ?? []) {
        for (const joined of structure.provenance.joins ?? []) {
          expect(ids.has(joined), `${entry.id} tunnel joins unknown ${joined}`).toBe(true);
        }
      }
    }
  });
});

/**
 * Block entities — the compounds that carry a sign's text and a command
 * block's command.
 *
 * These are checked against a **real region write and readback**, in raw NBT,
 * for the same reason `palette.registry` is: the property under test is the
 * bytes the serializer produced, and a readback through `prismarine-chunk`'s
 * own block-entity table would launder any fault in the writer back through the
 * code that wrote it.
 *
 * The expected shapes below are not remembered — they were read out of real
 * 1.21.11 (DataVersion 4671) saves under
 * `~/Library/Application Support/minecraft/saves`, which is where the two
 * non-obvious facts came from: the `id` is the block-entity *type*
 * (`minecraft:sign` for every wood and both mountings), and sign lines are
 * plain NBT strings, not the JSON documents they were before 1.21.5.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  blockEntity,
  blockEntityIdOf,
  commandBlockEntity,
  hangingSignEntity,
  requiredBlockEntityId,
  signEntity,
  type BlockEntity
} from "../src/emit/block-entities.js";
import { PHYSICS_RULES, lintWorldPhysics, readBlockEntities } from "../src/emit/physics.js";
import {
  EMIT_MINECRAFT_VERSION,
  loadPrismarine,
  readRegionChunksNbt,
  type EmitChunk,
  type PrismarineStack
} from "../src/emit/prismarine.js";
import { writeWorldFiles } from "../src/emit/write.js";

const stack: PrismarineStack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const scratch: string[] = [];

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* a one-chunk fixture world                                                   */
/* -------------------------------------------------------------------------- */

const PLATFORM_Y = 64;
/** Where the sign stands, and where the command block sits. */
const SIGN = { x: 4, y: PLATFORM_Y + 1, z: 4 };
const COMMAND = { x: 10, y: PLATFORM_Y + 1, z: 4 };

interface FixtureOptions {
  /** Place the sign block itself. */
  readonly signBlock?: boolean;
  /** Place the command block itself. */
  readonly commandBlock?: boolean;
  /** Block entities to stamp. */
  readonly entities?: readonly BlockEntity[];
}

/**
 * A stone slab of a world with, optionally, a sign and a command block on it.
 *
 * Deliberately built through the same `writeWorldFiles` the compiler uses, so
 * what the assertions read is a real Anvil region file and not a fixture.
 */
async function buildWorld(label: string, options: FixtureOptions): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `terrainist-be-${label}-`));
  scratch.push(root);
  const worldDir = path.join(root, "world");

  const stone = stack.blockByName("stone");
  const sign = stack.blockByName("oak_sign");
  const command = stack.blockByName("command_block");
  if (stone === undefined || sign === undefined || command === undefined) {
    throw new Error("fixture: missing a block");
  }

  const chunk: EmitChunk = stack.createChunk();
  const grass = stack.biomeIdByName("plains");
  if (grass !== undefined) chunk.setUniformBiome(grass);
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) chunk.fillColumn(lx, lz, PLATFORM_Y - 3, PLATFORM_Y, stone.stateId);
  }
  if (options.signBlock === true) chunk.setStateId(SIGN.x, SIGN.y, SIGN.z, sign.stateId);
  if (options.commandBlock === true) {
    chunk.setStateId(COMMAND.x, COMMAND.y, COMMAND.z, command.stateId);
  }
  for (const entity of options.entities ?? []) {
    chunk.setBlockEntityNbt(entity.x, entity.y, entity.z, {
      ...entity.data,
      id: { type: "string", value: entity.id }
    });
  }

  await writeWorldFiles({
    chunks: new Map([["0,0", chunk]]),
    worldDir,
    levelName: label,
    spawn: { x: 8, y: PLATFORM_Y + 1, z: 8 },
    stack
  });
  return worldDir;
}

/** The `block_entities` list of the world's single chunk, as raw simplified NBT. */
async function readRawEntities(worldDir: string): Promise<Record<string, unknown>[]> {
  const file = path.join(worldDir, "region", "r.0.0.mca");
  const chunks = readRegionChunksNbt(file, await readFile(file));
  expect(chunks).toHaveLength(1);
  const list = (chunks[0] as { root: Record<string, unknown> }).root["block_entities"];
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

const LABEL: BlockEntity = signEntity(SIGN.x, SIGN.y, SIGN.z, {
  front: ["Exhibit 3", "Gable roof", "", "oak"],
  waxed: true
});
const PAD: BlockEntity = commandBlockEntity(
  COMMAND.x,
  COMMAND.y,
  COMMAND.z,
  "/tp @p 100 70 100",
);

/* -------------------------------------------------------------------------- */

describe("the block <-> block entity correspondence", () => {
  it("maps every sign block to the one sign block-entity type", () => {
    // The trap: the id is the block-entity type, not the block. All six of
    // these are `minecraft:sign` in a real save.
    for (const name of ["oak_sign", "spruce_wall_sign", "warped_sign", "minecraft:birch_sign"]) {
      expect(blockEntityIdOf(name), name).toBe("minecraft:sign");
      expect(requiredBlockEntityId(name), name).toBe("minecraft:sign");
    }
    for (const name of ["oak_hanging_sign", "crimson_wall_hanging_sign"]) {
      expect(blockEntityIdOf(name), name).toBe("minecraft:hanging_sign");
      expect(requiredBlockEntityId(name), name).toBe("minecraft:hanging_sign");
    }
  });

  it("maps all three command blocks to one type, and requires it", () => {
    for (const name of ["command_block", "chain_command_block", "repeating_command_block"]) {
      expect(blockEntityIdOf(name), name).toBe("minecraft:command_block");
      expect(requiredBlockEntityId(name), name).toBe("minecraft:command_block");
    }
  });

  it("knows a chest carries a block entity but does not require one", () => {
    // An empty chest is a legal chest; a blank sign is a defect. That is the
    // whole reason the two tables are not one.
    expect(blockEntityIdOf("chest")).toBe("minecraft:chest");
    expect(requiredBlockEntityId("chest")).toBeUndefined();
    expect(blockEntityIdOf("red_bed")).toBe("minecraft:bed");
    expect(requiredBlockEntityId("red_bed")).toBeUndefined();
  });

  it("says nothing carries a block entity when nothing does", () => {
    expect(blockEntityIdOf("stone")).toBeUndefined();
    expect(blockEntityIdOf("oak_planks")).toBeUndefined();
    expect(requiredBlockEntityId("stone")).toBeUndefined();
  });
});

describe("sign block entities, round-tripped through a region file", () => {
  it("writes the 1.21.11 sign compound, field for field", async () => {
    const dir = await buildWorld("sign", {
      signBlock: true,
      entities: [LABEL]
    });
    const [written] = await readRawEntities(dir);
    // Byte-exact against the shape read out of a real 4671 save: the envelope,
    // then `front_text`/`back_text`/`is_waxed`. `messages` is four plain
    // strings — not JSON — and a short line list is padded, not truncated at
    // whatever the caller gave.
    expect(written).toEqual({
      components: {},
      id: "minecraft:sign",
      x: SIGN.x,
      y: SIGN.y,
      z: SIGN.z,
      keepPacked: 0,
      is_waxed: 1,
      front_text: {
        has_glowing_text: 0,
        color: "black",
        messages: ["Exhibit 3", "Gable roof", "", "oak"]
      },
      back_text: {
        has_glowing_text: 0,
        color: "black",
        messages: ["", "", "", ""]
      }
    });
  });

  it("carries a back face, a colour and glowing text when asked", async () => {
    const dir = await buildWorld("sign-back", {
      signBlock: true,
      entities: [
        signEntity(SIGN.x, SIGN.y, SIGN.z, {
          front: { lines: ["front"], color: "red", glowing: true },
          back: ["b1", "b2", "b3", "b4", "dropped"]
        })
      ]
    });
    const [written] = await readRawEntities(dir);
    expect(written).toMatchObject({
      is_waxed: 0,
      front_text: { has_glowing_text: 1, color: "red", messages: ["front", "", "", ""] },
      back_text: { has_glowing_text: 0, color: "black", messages: ["b1", "b2", "b3", "b4"] }
    });
  });

  it("gives a hanging sign its own block-entity type", () => {
    expect(hangingSignEntity(0, 0, 0, { front: [] }).id).toBe("minecraft:hanging_sign");
  });
});

describe("command block entities, round-tripped through a region file", () => {
  it("writes the command byte for byte, inert by default", async () => {
    const dir = await buildWorld("command", {
      commandBlock: true,
      entities: [PAD]
    });
    const [written] = await readRawEntities(dir);
    expect(written).toEqual({
      components: {},
      id: "minecraft:command_block",
      x: COMMAND.x,
      y: COMMAND.y,
      z: COMMAND.z,
      keepPacked: 0,
      Command: "/tp @p 100 70 100",
      CustomName: "@",
      LastOutput: "",
      SuccessCount: 0,
      TrackOutput: 0,
      UpdateLastExecution: 1,
      powered: 0,
      // Inert unless asked: an `auto` command block fires on the first tick
      // after its chunk loads, which is not something a world nobody has walked
      // should do by default.
      auto: 0,
      conditionMet: 0
    });
  });

  it("turns on auto-run and output tracking when asked", async () => {
    const dir = await buildWorld("command-auto", {
      commandBlock: true,
      entities: [
        commandBlockEntity(COMMAND.x, COMMAND.y, COMMAND.z, "/say hi", {
          auto: true,
          trackOutput: true,
          customName: "greeter"
        })
      ]
    });
    const [written] = await readRawEntities(dir);
    expect(written).toMatchObject({ auto: 1, TrackOutput: 1, CustomName: "greeter" });
  });
});

describe("the generic passthrough", () => {
  it("writes an arbitrary compound under the standard envelope", async () => {
    const dir = await buildWorld("generic", {
      entities: [
        blockEntity(2, PLATFORM_Y, 2, "chest", {
          Items: { type: "list", value: { type: "end", value: [] } },
          LootTable: { type: "string", value: "minecraft:chests/village_house" }
        })
      ]
    });
    const [written] = await readRawEntities(dir);
    expect(written).toEqual({
      components: {},
      id: "minecraft:chest",
      x: 2,
      y: PLATFORM_Y,
      z: 2,
      keepPacked: 0,
      Items: [],
      LootTable: "minecraft:chests/village_house"
    });
  });

  it("namespaces a bare id and refuses a compound with no id", () => {
    expect(blockEntity(0, 0, 0, "barrel").id).toBe("minecraft:barrel");
    const chunk = stack.createChunk();
    expect(() => chunk.setBlockEntityNbt(1, 2, 3, {})).toThrow(/no string "id"/);
  });

  it("overwrites caller-supplied coordinates with the real ones", async () => {
    // The compound stores absolute coordinates and the game discards one whose
    // coordinates disagree with the block it is attached to, so the adapter —
    // not the caller — is the authority on them.
    const dir = await buildWorld("coords", {
      entities: [
        blockEntity(6, PLATFORM_Y, 6, "barrel", {
          x: { type: "int", value: -999 },
          y: { type: "int", value: -999 },
          z: { type: "int", value: -999 },
          keepPacked: { type: "byte", value: 1 }
        })
      ]
    });
    const [written] = await readRawEntities(dir);
    expect(written).toMatchObject({ x: 6, y: PLATFORM_Y, z: 6, keepPacked: 0 });
  });

  it("replaces a second entity written at the same position", () => {
    const chunk = stack.createChunk();
    chunk.setBlockEntityNbt(3, 4, 5, { id: { type: "string", value: "minecraft:barrel" } });
    chunk.setBlockEntityNbt(3, 4, 5, { id: { type: "string", value: "minecraft:chest" } });
    expect(chunk.blockEntitiesNbt()).toHaveLength(1);
  });
});

describe("determinism", () => {
  it("writes byte-identical region files twice over", async () => {
    const entities = [LABEL, PAD];
    const a = await buildWorld("det-a", { signBlock: true, commandBlock: true, entities });
    const b = await buildWorld("det-b", { signBlock: true, commandBlock: true, entities });
    const [ra, rb] = await Promise.all([
      readFile(path.join(a, "region", "r.0.0.mca")),
      readFile(path.join(b, "region", "r.0.0.mca"))
    ]);
    expect(ra.equals(rb)).toBe(true);
  });

  it("writes block entities in list order, not hash order", async () => {
    // Two entities in one chunk, and the order they land on disk is the order
    // they were handed over. Without that the region bytes would depend on
    // whatever the object's key iteration happened to be.
    const dir = await buildWorld("order", {
      signBlock: true,
      commandBlock: true,
      entities: [PAD, LABEL]
    });
    const written = await readRawEntities(dir);
    expect(written.map((e) => e["id"])).toEqual(["minecraft:command_block", "minecraft:sign"]);
  });
});

describe("blockentity.orphan", () => {
  /** Lint a fixture, bounded to the platform so the rule is what is measured. */
  async function lint(worldDir: string): Promise<Record<string, number>> {
    const report = await lintWorldPhysics(worldDir, stack, { minY: 40, maxY: 100 });
    return report.counts as Record<string, number>;
  }

  it("passes a world whose sign and command block both carry their compound", async () => {
    const dir = await buildWorld("clean", {
      signBlock: true,
      commandBlock: true,
      entities: [LABEL, PAD]
    });
    const report = await lintWorldPhysics(dir, stack, { minY: 40, maxY: 100 });
    expect(report.findings.map((f) => `${f.rule} @ ${f.x},${f.y},${f.z}`)).toEqual([]);
    for (const rule of PHYSICS_RULES) expect(report.counts[rule], rule).toBe(0);
  });

  it("catches a sign placed with no block entity", async () => {
    const counts = await lint(await buildWorld("bare-sign", { signBlock: true }));
    expect(counts["blockentity.orphan"]).toBe(1);
  });

  it("catches a command block placed with no block entity", async () => {
    const counts = await lint(await buildWorld("bare-command", { commandBlock: true }));
    expect(counts["blockentity.orphan"]).toBe(1);
  });

  it("catches a compound sitting on a block that carries none", async () => {
    // The other direction: the sign compound is there, the sign block is not,
    // so the game drops it on load and the label never appears.
    const counts = await lint(await buildWorld("stray", { entities: [LABEL] }));
    expect(counts["blockentity.orphan"]).toBe(1);
  });

  it("catches a compound of the wrong type for the block under it", async () => {
    const counts = await lint(
      await buildWorld("mismatch", {
        signBlock: true,
        entities: [blockEntity(SIGN.x, SIGN.y, SIGN.z, "chest")]
      }),
    );
    // Both directions fire: the chest compound does not belong on a sign, and
    // the sign is still missing the compound it needs.
    expect(counts["blockentity.orphan"]).toBe(2);
  });

  it("reads block entities back off disk with their positions and ids", async () => {
    const dir = await buildWorld("readback", {
      signBlock: true,
      commandBlock: true,
      entities: [LABEL, PAD]
    });
    expect(await readBlockEntities(dir)).toEqual([
      { x: SIGN.x, y: SIGN.y, z: SIGN.z, id: "minecraft:sign" },
      { x: COMMAND.x, y: COMMAND.y, z: COMMAND.z, id: "minecraft:command_block" }
    ]);
  });
});

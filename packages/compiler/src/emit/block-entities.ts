/**
 * Block entities — the second half of a block.
 *
 * Most of what this compiler places is fully described by its block state: a
 * plank is a plank, a fence knows its four neighbours, a stair knows which way
 * it faces. A handful of blocks are not. A sign's *text* lives nowhere in its
 * state; a command block's *command* lives nowhere in its state. Those blocks
 * carry a companion NBT compound in the chunk's `block_entities` list, and a
 * sign placed without one is a blank plank on a post — which is precisely the
 * failure mode that blocks the human-review rig, where every exhibit is
 * supposed to label itself and every teleport pad is supposed to be a command
 * block you can press.
 *
 * The shapes below were read out of real 1.21.11 saves under
 * `~/Library/Application Support/minecraft/saves` — verified against emitted
 * worlds rather than taken from a wiki. Every block entity at DataVersion 4671
 * carries the same envelope:
 * ```
 * id:         string   "minecraft:sign"   (the *block entity type*, namespaced)
 * x, y, z:    int      absolute world coordinates
 * keepPacked: byte     0
 * components: compound {}                 (empty unless the block holds items)
 * ```
 *
 * and then its own fields. Two findings from the saves are worth writing down,
 * because both are places where the obvious guess is wrong:
 *
 * 1. **The id is the block-entity type, not the block.** An oak sign, a spruce
 *    wall sign and a warped sign are all `minecraft:sign`. Writing
 *    `minecraft:oak_sign` there produces a block entity the game discards.
 * 2. **Sign lines are plain strings, not JSON.** Real 4671 saves store a blank
 *    sign's four lines as `""` — the empty string, not the two-character JSON
 *    document `""`. 1.21.5 moved text components in NBT from "JSON in a
 *    string" to native NBT, and a bare NBT string *is* a literal text
 *    component. So a line reading `Anvil` is stored as `Anvil`; storing
 *    `{"text":"Anvil"}` would render those braces on the sign.
 *
 * `messages` is always exactly four entries, padded with empty strings, because
 * vanilla writes four and the client indexes them positionally.
 */

import * as nbt from "./nbt.js";
import type { NbtCompoundValue } from "./nbt.js";

/** One block entity, placed. */
export interface BlockEntity {
  /** Absolute world coordinates — the block this compound belongs to. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The namespaced *block entity type*, e.g. `"minecraft:sign"`. */
  readonly id: string;
  /**
   * The type-specific fields. The envelope (`id`, `x`, `y`, `z`, `keepPacked`,
   * `components`) is added by the adapter, so this holds only what makes a sign
   * a sign — and anything here named like an envelope field is overwritten.
   */
  readonly data: NbtCompoundValue;
}

/** How many lines a sign face has. Vanilla writes exactly this many, always. */
export const SIGN_LINES = 4;

/** One face of a sign. */
export interface SignFace {
  /** Up to {@link SIGN_LINES} lines; short lists are padded with blanks. */
  readonly lines: readonly string[];
  /** Dye colour of the text. Vanilla's default is `"black"`. */
  readonly color?: string;
  readonly glowing?: boolean;
}

/** Options for {@link signEntity}. */
export interface SignOptions {
  readonly front: readonly string[] | SignFace;
  readonly back?: readonly string[] | SignFace;
  /** A waxed sign cannot be edited in game — what a label wants to be. */
  readonly waxed?: boolean;
}

/** Options for {@link commandBlockEntity}. */
export interface CommandBlockOptions {
  /**
   * `auto=1` runs the command without redstone. Defaults to **false**, which
   * is vanilla's default for a freshly placed command block and the only safe
   * default for a world nobody has walked yet: an auto command block fires on
   * the first tick after the chunk loads.
   */
  readonly auto?: boolean;
  /**
   * Whether the block keeps its last output for the GUI. Defaults to **false**
   * — output tracking is a debugging affordance and costs a string per tick.
   */
  readonly trackOutput?: boolean;
  /** Shown above the block's output line; vanilla's default is `"@"`. */
  readonly customName?: string;
}

/**
 * The generic passthrough: an arbitrary compound at a position.
 *
 * The escape hatch for everything this module has no typed helper for yet —
 * chests and their `Items` list above all. `data` is written verbatim under the
 * standard envelope, so a caller who knows a format can use it without waiting
 * for a helper.
 */
export function blockEntity(
  x: number,
  y: number,
  z: number,
  id: string,
  data: NbtCompoundValue = {},
): BlockEntity {
  return { x, y, z, id: namespaced(id), data };
}

/**
 * A sign's block entity, for any of the sign blocks.
 *
 * The block itself — `oak_sign`, `birch_wall_sign`, whichever — is placed by
 * the caller in the ordinary way; this is only its text. The block-entity type
 * is `minecraft:sign` for every wood and both mountings (standing and wall);
 * hanging signs are a *different* type and get {@link hangingSignEntity}.
 */
export function signEntity(
  x: number,
  y: number,
  z: number,
  options: SignOptions,
): BlockEntity {
  return {
    x,
    y,
    z,
    id: "minecraft:sign",
    data: signData(options),
  };
}

/** The same, for `*_hanging_sign` and `*_wall_hanging_sign` blocks. */
export function hangingSignEntity(
  x: number,
  y: number,
  z: number,
  options: SignOptions,
): BlockEntity {
  return {
    x,
    y,
    z,
    id: "minecraft:hanging_sign",
    data: signData(options),
  };
}

/** Fields shared by both sign block-entity types. */
function signData(options: SignOptions): NbtCompoundValue {
  return {
    front_text: nbt.compound(faceCompound(options.front)),
    back_text: nbt.compound(faceCompound(options.back ?? [])),
    is_waxed: nbt.bool(options.waxed ?? false),
  };
}

/** One `front_text`/`back_text` compound, in the order vanilla writes it. */
function faceCompound(face: readonly string[] | SignFace): NbtCompoundValue {
  const spec: SignFace = Array.isArray(face) ? { lines: face } : (face as SignFace);
  const lines = spec.lines.slice(0, SIGN_LINES);
  while (lines.length < SIGN_LINES) lines.push("");
  return {
    has_glowing_text: nbt.bool(spec.glowing ?? false),
    color: nbt.string(spec.color ?? "black"),
    // Always a `string` list, never `end`: a sign with four blank lines still
    // has four entries, and `stringList` would collapse an all-blank face to an
    // empty `end` list the client reads as "no lines".
    messages: { type: "list", value: { type: "string", value: lines } },
  };
}

/**
 * A command block's block entity, for `command_block`, `chain_command_block`
 * and `repeating_command_block`.
 *
 * The field set is the one vanilla writes for a placed, never-run block:
 * `Command`, an empty `LastOutput`, a zero `SuccessCount`, `TrackOutput`,
 * `UpdateLastExecution`, and the three state bytes `powered`, `auto` and
 * `conditionMet`. `LastExecution` is deliberately absent — vanilla omits it
 * until the block first runs, and writing a zero there would tell the game the
 * block already ran on game-tick zero.
 */
export function commandBlockEntity(
  x: number,
  y: number,
  z: number,
  command: string,
  options: CommandBlockOptions = {},
): BlockEntity {
  const data: NbtCompoundValue = {
    Command: nbt.string(command),
    CustomName: nbt.string(options.customName ?? "@"),
    LastOutput: nbt.string(""),
    SuccessCount: nbt.int(0),
    TrackOutput: nbt.bool(options.trackOutput ?? false),
    UpdateLastExecution: nbt.bool(true),
    powered: nbt.bool(false),
    auto: nbt.bool(options.auto ?? false),
    conditionMet: nbt.bool(false),
  };
  return { x, y, z, id: "minecraft:command_block", data };
}

/* -------------------------------------------------------------------------- */
/* the block <-> block-entity correspondence                                   */
/* -------------------------------------------------------------------------- */

/** Blocks whose block-entity type is not derivable from a name suffix. */
const EXACT_BLOCK_ENTITY: ReadonlyMap<string, string> = new Map([
  ["command_block", "command_block"],
  ["chain_command_block", "command_block"],
  ["repeating_command_block", "command_block"],
  ["chest", "chest"],
  ["trapped_chest", "trapped_chest"],
  ["ender_chest", "ender_chest"],
  ["barrel", "barrel"],
  ["furnace", "furnace"],
  ["blast_furnace", "blast_furnace"],
  ["smoker", "smoker"],
  ["hopper", "hopper"],
  ["dropper", "dropper"],
  ["dispenser", "dispenser"],
  ["brewing_stand", "brewing_stand"],
  ["enchanting_table", "enchanting_table"],
  ["lectern", "lectern"],
  ["jukebox", "jukebox"],
  ["bell", "bell"],
  ["beacon", "beacon"],
  ["conduit", "conduit"],
  ["comparator", "comparator"],
  ["daylight_detector", "daylight_detector"],
  ["campfire", "campfire"],
  ["soul_campfire", "campfire"],
  ["decorated_pot", "decorated_pot"],
  ["chiseled_bookshelf", "chiseled_bookshelf"],
  ["crafter", "crafter"],
  ["lodestone", "lodestone"],
  ["spawner", "mob_spawner"],
  ["structure_block", "structure_block"],
  ["jigsaw", "jigsaw"],
  ["bee_nest", "beehive"],
  ["beehive", "beehive"],
  ["sculk_sensor", "sculk_sensor"],
  ["calibrated_sculk_sensor", "calibrated_sculk_sensor"],
  ["sculk_catalyst", "sculk_catalyst"],
  ["sculk_shrieker", "sculk_shrieker"],
  ["end_portal", "end_portal"],
  ["end_gateway", "end_gateway"],
  ["vault", "vault"],
  ["trial_spawner", "trial_spawner"],
]);

/**
 * The block-entity type a block carries, by (un-namespaced) block name, or
 * `undefined` for a block that carries none.
 *
 * The `blockentity.orphan` lint reads this to answer "does this compound
 * belong here": a `minecraft:sign` compound on a cobblestone block is a stray
 * the game drops on load, and a compound whose `id` disagrees with the block
 * under it is the same defect wearing a hat. A block *not* in this table
 * carrying any compound at all reads as an orphan, which is the conservative
 * direction — extending the table is how a new block-entity type gets
 * supported, and forgetting to extend it fails loudly instead of quietly.
 */
export function blockEntityIdOf(blockName: string): string | undefined {
  const name = stripNamespace(blockName);
  if (name.endsWith("_hanging_sign")) return "minecraft:hanging_sign";
  if (name.endsWith("_sign")) return "minecraft:sign";
  if (name.endsWith("_bed")) return "minecraft:bed";
  if (name.endsWith("_banner")) return "minecraft:banner";
  if (name.endsWith("_skull") || name.endsWith("_head")) return "minecraft:skull";
  if (name.endsWith("_shulker_box") || name === "shulker_box") return "minecraft:shulker_box";
  const exact = EXACT_BLOCK_ENTITY.get(name);
  return exact === undefined ? undefined : `minecraft:${exact}`;
}

/**
 * Which block-entity type a block *requires*, by (un-namespaced) block name.
 *
 * The other half of the bidirectional lint: a block named here that has no
 * compound is a blank plank on a post or a command block that does nothing —
 * placed, legal, and useless. Deliberately narrower than
 * {@link blockEntityIdOf}: a chest with no compound is a legal empty chest and
 * a bed with none is an ordinary bed, so only the blocks whose entire content
 * lives in NBT are required to have one.
 */
export function requiredBlockEntityId(blockName: string): string | undefined {
  const name = stripNamespace(blockName);
  if (name.endsWith("_sign")) return blockEntityIdOf(name);
  if (EXACT_BLOCK_ENTITY.get(name) === "command_block") return "minecraft:command_block";
  return undefined;
}

function stripNamespace(name: string): string {
  return name.startsWith("minecraft:") ? name.slice("minecraft:".length) : name;
}

/** Namespace a bare id, leaving an already-namespaced one alone. */
function namespaced(id: string): string {
  return id.includes(":") ? id : `minecraft:${id}`;
}

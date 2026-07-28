/**
 * `terrainist-spike-0` — a deliberately throwaway, pre-Loam fixture format.
 *
 * It exists only so the G1 Anvil-emit spike has something to compile. It is
 * NOT Loam and must not grow: Loam v0.1 is designed separately, and when it
 * lands this module goes away.
 */

import { readFile } from "node:fs/promises";

/** The only format tag this parser accepts. */
export const SPIKE_FORMAT = "terrainist-spike-0";

/** An inclusive axis-aligned cuboid fill, addressing blocks by palette symbol. */
export interface SpikeFillOp {
  readonly op: "fill";
  /** Key into {@link SpikeDocument.palette}. */
  readonly block: string;
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
}

export type SpikeOp = SpikeFillOp;

export interface SpikeSpawn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SpikeDocument {
  readonly format: typeof SPIKE_FORMAT;
  /** World name; also the output directory / zip name. */
  readonly name: string;
  readonly spawn: SpikeSpawn;
  /** Symbol → namespaced block id, e.g. `{ G: "minecraft:glass" }`. */
  readonly palette: Readonly<Record<string, string>>;
  readonly ops: readonly SpikeOp[];
}

/** Validate an already-parsed JSON value, returning a typed document. */
export function parseSpikeDocument(raw: unknown, source = "<document>"): SpikeDocument {
  const doc = requireObject(raw, source);

  if (doc["format"] !== SPIKE_FORMAT) {
    throw new Error(`${source}: expected format "${SPIKE_FORMAT}", got ${JSON.stringify(doc["format"])}`);
  }

  const name = doc["name"];
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`${source}: "name" must be a filesystem-safe string ([A-Za-z0-9._-]+)`);
  }

  const spawnRaw = requireObject(doc["spawn"], `${source}.spawn`);
  const spawn: SpikeSpawn = {
    x: requireInt(spawnRaw["x"], `${source}.spawn.x`),
    y: requireInt(spawnRaw["y"], `${source}.spawn.y`),
    z: requireInt(spawnRaw["z"], `${source}.spawn.z`),
  };

  const paletteRaw = requireObject(doc["palette"], `${source}.palette`);
  const palette: Record<string, string> = {};
  for (const [symbol, blockId] of Object.entries(paletteRaw)) {
    if (typeof blockId !== "string") {
      throw new Error(`${source}.palette.${symbol}: must be a block id string`);
    }
    palette[symbol] = blockId;
  }
  if (Object.keys(palette).length === 0) {
    throw new Error(`${source}.palette: must define at least one symbol`);
  }

  const opsRaw = doc["ops"];
  if (!Array.isArray(opsRaw) || opsRaw.length === 0) {
    throw new Error(`${source}.ops: must be a non-empty array`);
  }
  const ops = opsRaw.map((op, i) => parseOp(op, `${source}.ops[${i}]`, palette));

  return { format: SPIKE_FORMAT, name, spawn, palette, ops };
}

/** Read and validate a spike document from disk. */
export async function loadSpikeDocument(path: string): Promise<SpikeDocument> {
  const text = await readFile(path, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${path}: invalid JSON`, { cause });
  }
  return parseSpikeDocument(raw, path);
}

function parseOp(
  raw: unknown,
  source: string,
  palette: Readonly<Record<string, string>>,
): SpikeOp {
  const op = requireObject(raw, source);
  if (op["op"] !== "fill") {
    throw new Error(`${source}: unknown op ${JSON.stringify(op["op"])} (only "fill" exists)`);
  }
  const block = op["block"];
  if (typeof block !== "string" || !(block in palette)) {
    throw new Error(`${source}.block: ${JSON.stringify(block)} is not in the palette`);
  }
  return {
    op: "fill",
    block,
    from: requireVec(op["from"], `${source}.from`),
    to: requireVec(op["to"], `${source}.to`),
  };
}

function requireObject(value: unknown, source: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${source}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function requireInt(value: unknown, source: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${source}: expected an integer`);
  }
  return value;
}

function requireVec(value: unknown, source: string): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${source}: expected [x, y, z]`);
  }
  return [
    requireInt(value[0], `${source}[0]`),
    requireInt(value[1], `${source}[1]`),
    requireInt(value[2], `${source}[2]`),
  ];
}

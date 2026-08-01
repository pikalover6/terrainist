#!/usr/bin/env node
/**
 * Assemble N blocks-JSON structures into one superflat comparison world.
 *
 * Emit reuses the repo's own machinery rather than growing a second world
 * writer: the structures are lowered into a `terrainist-spike-0` document
 * (`@terrainist/compiler`'s pre-Loam fixture format — palette + fill ops) and
 * handed to {@link emitWorld}, exactly the path `terrainist emit` takes; the
 * archive comes from the CLI's own `zipWorld`. So the output is byte-shaped
 * like every other Terrainist world: a 1.21.11 Anvil directory plus a `.zip`.
 *
 * Layout is a row-major grid of sites, each site separated from its neighbours
 * by `--gap` blocks of clear ground (default 30), with a white-concrete pillar
 * marking the north-west corner of every footprint so the sites are countable
 * from the air. Ground is a grass plane at y=63 with a few chunks of margin.
 *
 * Deterministic: no clock, no randomness, and the site order is the argument
 * order.
 *
 * Usage:
 *   node tools/shootout/assemble.ts <a.blocks.json> [<b.blocks.json> ...]
 *                                   [--out <dir>] [--name <world>]
 *                                   [--gap <N>] [--no-zip]
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { emitWorld, parseSpikeDocument } from "@terrainist/compiler";
import type { SpikeOp } from "@terrainist/compiler";
// The CLI package exports only its entry point, so the archive helper is
// imported by path. Read-only use of built output; no CLI source is touched.
import { zipWorld } from "../../packages/cli/dist/zip.js";

import { parseBlocksDoc, type BlocksDoc } from "./blocks.ts";

/** Y of the topmost ground block; structures sit on y = GROUND_Y + 1. */
const GROUND_Y = 63;
/** Clear ground beyond the outermost footprint, in blocks (three chunks). */
const MARGIN = 48;
const GROUND_BLOCK = "minecraft:grass_block";
const MARKER_BLOCK = "minecraft:white_concrete";
const MARKER_HEIGHT = 4;

interface Args {
  readonly inputs: readonly string[];
  readonly out: string;
  readonly name: string;
  readonly gap: number;
  readonly zip: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const inputs: string[] = [];
  let out = "out/shootout";
  let name = "shootout";
  let gap = 30;
  let zip = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = (): string => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`assemble: ${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case "--out": out = next(); break;
      case "--name": name = next(); break;
      case "--gap": gap = Number(next()); break;
      case "--no-zip": zip = false; break;
      default:
        if (arg.startsWith("--")) throw new Error(`assemble: unknown option ${arg}`);
        inputs.push(arg);
    }
  }

  if (inputs.length === 0) throw new Error("assemble: give at least one blocks JSON path");
  if (!Number.isInteger(gap) || gap < 0) throw new Error("assemble: --gap must be a non-negative integer");
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error("assemble: --name must be filesystem-safe");
  return { inputs, out, name, gap, zip };
}

/** One placed structure, in world coordinates. */
export interface Site {
  readonly doc: BlocksDoc;
  /** North-west corner of the footprint. */
  readonly x: number;
  readonly z: number;
}

/**
 * Place the structures in a row-major grid, `gap` blocks clear between
 * footprints on both axes. Cell size is uniform (the largest footprint), which
 * keeps the grid legible and guarantees the gap regardless of size spread.
 */
export function layout(docs: readonly BlocksDoc[], gap: number): Site[] {
  const cellX = Math.max(...docs.map((d) => d.size[0]));
  const cellZ = Math.max(...docs.map((d) => d.size[2]));
  const columns = Math.max(1, Math.ceil(Math.sqrt(docs.length)));

  return docs.map((doc, i) => {
    const column = i % columns;
    const row = Math.floor(i / columns);
    return {
      doc,
      x: column * (cellX + gap),
      z: row * (cellZ + gap),
    };
  });
}

/** Lower placed sites into a spike document: ground plane, blocks, markers. */
export function buildSpikeDocument(sites: readonly Site[], name: string): unknown {
  const symbols = new Map<string, string>();
  const palette: Record<string, string> = {};
  const symbolFor = (id: string): string => {
    const existing = symbols.get(id);
    if (existing !== undefined) return existing;
    const symbol = `b${symbols.size}`;
    symbols.set(id, symbol);
    palette[symbol] = id;
    return symbol;
  };

  let maxX = 0;
  let maxZ = 0;
  for (const site of sites) {
    maxX = Math.max(maxX, site.x + site.doc.size[0]);
    maxZ = Math.max(maxZ, site.z + site.doc.size[2]);
  }

  const ops: SpikeOp[] = [
    {
      op: "fill",
      block: symbolFor(GROUND_BLOCK),
      from: [-MARGIN, GROUND_Y, -MARGIN],
      to: [maxX + MARGIN, GROUND_Y, maxZ + MARGIN],
    },
  ];

  for (const site of sites) {
    // A pillar just outside the north-west corner: a countable site marker
    // that never collides with the structure itself.
    ops.push({
      op: "fill",
      block: symbolFor(MARKER_BLOCK),
      from: [site.x - 2, GROUND_Y + 1, site.z - 2],
      to: [site.x - 2, GROUND_Y + MARKER_HEIGHT, site.z - 2],
    });

    for (const run of runsOf(site.doc)) {
      ops.push({
        op: "fill",
        block: symbolFor(run.id),
        from: [site.x + run.x0, GROUND_Y + 1 + run.y, site.z + run.z],
        to: [site.x + run.x1, GROUND_Y + 1 + run.y, site.z + run.z],
      });
    }
  }

  const first = sites[0]!;
  return {
    format: "terrainist-spike-0",
    name,
    spawn: { x: first.x - 8, y: GROUND_Y + 1, z: first.z - 8 },
    palette,
    ops,
  };
}

interface Run {
  readonly y: number;
  readonly z: number;
  readonly x0: number;
  readonly x1: number;
  readonly id: string;
}

/**
 * Merge each structure's blocks into x-runs of one id.
 *
 * Purely an op-count reduction — a 48-block structure is tens of thousands of
 * single-block fills otherwise — and it cannot change the emitted world.
 */
export function runsOf(doc: BlocksDoc): Run[] {
  const sorted = [...doc.blocks].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  const runs: Run[] = [];
  let current: { y: number; z: number; x0: number; x1: number; id: string } | undefined;

  for (const block of sorted) {
    if (
      current !== undefined &&
      current.y === block.y &&
      current.z === block.z &&
      current.id === block.id &&
      current.x1 + 1 === block.x
    ) {
      current.x1 = block.x;
      continue;
    }
    if (current !== undefined) runs.push({ ...current });
    current = { y: block.y, z: block.z, x0: block.x, x1: block.x, id: block.id };
  }
  if (current !== undefined) runs.push({ ...current });
  return runs;
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);

  const docs: BlocksDoc[] = [];
  for (const input of args.inputs) {
    docs.push(parseBlocksDoc(JSON.parse(await readFile(input, "utf8")), input));
  }

  const sites = layout(docs, args.gap);
  const raw = buildSpikeDocument(sites, args.name);
  const doc = parseSpikeDocument(raw, "<assembled>");

  await mkdir(args.out, { recursive: true });
  const specPath = path.join(args.out, `${args.name}.spike.json`);
  await writeFile(specPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  const worldDir = path.join(args.out, args.name);
  const summary = await emitWorld(doc, worldDir);

  console.log(`world      ${summary.worldDir}`);
  console.log(`spec       ${path.resolve(specPath)}`);
  console.log(`blocks     ${summary.blockCount} in ${summary.chunkCount} chunks`);
  console.log(`version    ${summary.minecraftVersion} (DataVersion ${summary.dataVersion})`);
  for (const [i, site] of sites.entries()) {
    console.log(
      `site ${String(i + 1).padStart(2)}   ${site.doc.name} @ x=${site.x} z=${site.z} ` +
        `size ${site.doc.size.join("x")} (${site.doc.blocks.length} blocks)`,
    );
  }

  if (args.zip) console.log(`zip        ${await zipWorld(summary.worldDir)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

/**
 * Luna structure author — half of the Luna-vs-Tripo shape shootout.
 *
 * Asks GPT-5.6 Luna (max reasoning effort) to author a Minecraft structure as a
 * compact box-list JSON, validates it, and expands it to a canonical flat
 * blocks list judged on SHAPE alone.
 *
 * One invocation authors exactly one structure, non-interactively, and writes
 * everything it learned to disk:
 *   out/shootout/luna-<slug>.blocks.json   canonical flat blocks
 *   out/shootout/luna-<slug>.raw.json      last raw model response text
 *   out/shootout/luna-<slug>.stats.json    model/effort/attempts/usage/cost
 *   out/shootout/luna-<slug>.silhouette.txt  ASCII side elevation
 *
 * Idempotent per slug: if the blocks JSON already exists it re-inspects it and
 * exits without spending tokens, unless --force is passed.
 *
 * Usage:
 *   node --experimental-strip-types tools/shootout/luna-structure.ts \
 *     --slug cathedral --prompt "A ruined gothic cathedral: ..." \
 *     [--feedback "..."] [--force] [--inspect]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  chatComplete,
  extractJson,
  findRepoRoot,
  loadOpenRouterKey,
  type Usage,
} from "../../packages/agents/dist/index.js";

export const LUNA_MODEL_ID = "openai/gpt-5.6-luna";
/** OpenRouter catalog pricing, USD per token (checked 2026-08-01). */
export const PRICE_PROMPT_USD = 0.0000001;
export const PRICE_COMPLETION_USD = 0.0000006;
/** Preferred reasoning efforts, most capable first; we fall back on rejection. */
export const EFFORT_LADDER = ["max", "xhigh", "high"] as const;

export const MAX_FOOTPRINT = 80;
export const MAX_HEIGHT = 100;

/* ------------------------------- schema ---------------------------------- */

export interface Box {
  from: [number, number, number];
  to: [number, number, number];
  block: string;
  hollow?: boolean;
}
export interface StructureDoc {
  name: string;
  palette: Record<string, string>;
  boxes: Box[];
}
export interface FlatBlock {
  x: number;
  y: number;
  z: number;
  id: string;
}
export interface FlatStructure {
  name: string;
  size: [number, number, number];
  blocks: FlatBlock[];
}

/* ------------------------------- prompting -------------------------------- */

export const SYSTEM_PROMPT = `You are a master Minecraft builder and sculptor. You author structures as a
compact, deterministic JSON "box list" that a compiler expands into blocks.
You are being judged ONLY on SHAPE: silhouette, massing, proportion, structural
readability, and the believability of ruin/erosion. Palette is nearly
irrelevant — do not spend effort on decoration or fancy blocks.

OUTPUT: a single JSON object, nothing else. No prose, no markdown fences.

{
  "name": string,
  "palette": { "<key>": "minecraft:<block_id>" },
  "boxes": [ { "from": [x,y,z], "to": [x,y,z], "block": "<key>", "hollow": true } ]
}

RULES
- Boxes are axis-aligned and INCLUSIVE on both ends. from<=to on every axis.
- Boxes are applied IN ORDER; a later box overwrites everything it covers.
- The block value must be a palette key, or the literal "air" (never a palette
  key named air) to CARVE — that is how you make windows, doorways, collapse
  gaps, hollow interiors, eroded bites out of masonry.
- "hollow": true fills only the 1-thick shell of the box (walls+floor+ceiling),
  leaving the interior untouched. Use it for towers, naves, shells.
- y is up. y=0 is ground level. Do not go below y=-4.
- Footprint must fit inside ${MAX_FOOTPRINT}x${MAX_FOOTPRINT} in x and z. Max height ${MAX_HEIGHT}.
- Palette values must be REAL Minecraft Java 1.21 block ids (e.g.
  minecraft:stone_bricks, minecraft:cracked_stone_bricks, minecraft:mossy_stone_bricks,
  minecraft:cobblestone, minecraft:deepslate, minecraft:bone_block,
  minecraft:sandstone, minecraft:polished_andesite, minecraft:dark_oak_planks,
  minecraft:glass, minecraft:water, minecraft:dirt, minecraft:oak_log).
  Use full blocks only — no stairs, slabs, fences, or blocks needing block
  states. 6-10 palette keys is plenty.

METHOD (follow it, in your head, before emitting)
1. SILHOUETTE FIRST. Decide the overall outline as seen from the side and from
   above: where the mass is tall, where it is broken, where it is open sky.
   Fix the bounding box and the major axis lines before any detail.
2. BLOCK OUT the primary volumes with a few large boxes.
3. ARTICULATE: split those volumes into their real structural members —
   piers, arches approximated by stepped boxes, ribs, buttresses, spires,
   vertebrae. Stepped stacks of thin boxes are how you get curves, arcs,
   spirals and tapers. A 1-block step per layer reads as a smooth curve.
4. RUIN AND WEATHER: many small boxes and many small "air" carves. Snap
   sections off at irregular heights, bite chunks from wall tops, punch holes,
   scatter fallen rubble on the ground nearby. Irregularity must look chosen,
   not uniform — vary every offset.
5. Curves/spirals: compute them properly. Step angle by angle and emit one
   small box per step; do not approximate a spiral with a cylinder.

BUDGET: use 150-500 boxes. Density of small boxes is what wins on shape.
Big empty single boxes lose. Do not repeat identical boxes.
A good result is at least 25 blocks tall and tens of thousands of solid blocks.

Emit ONLY the JSON object.`;

export function userPromptFor(prompt: string, feedback?: string): string {
  const base = `Author this structure:\n\n${prompt}\n\nRemember: shape is everything. Emit only the JSON object.`;
  return feedback === undefined ? base : `${base}\n\nFEEDBACK on your previous attempt — fix these:\n${feedback}`;
}

/* ------------------------------ validation -------------------------------- */

const INT = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Validate a parsed doc, returning human-readable errors (empty === valid). */
export function validateDoc(value: unknown): { doc?: StructureDoc; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { errors: ["top level is not an object"] };
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string" || v.name.length === 0) errors.push("`name` must be a non-empty string");
  const palette = v.palette;
  if (typeof palette !== "object" || palette === null) {
    errors.push("`palette` must be an object");
  } else {
    for (const [k, id] of Object.entries(palette as Record<string, unknown>)) {
      if (typeof id !== "string" || !/^minecraft:[a-z0-9_]+$/.test(id)) {
        errors.push(`palette["${k}"] = ${JSON.stringify(id)} is not a plain minecraft:<id>`);
      }
      if (k === "air") errors.push('palette must not define a key named "air"');
    }
  }
  const boxes = v.boxes;
  if (!Array.isArray(boxes) || boxes.length === 0) {
    errors.push("`boxes` must be a non-empty array");
    return { errors };
  }
  const keys = new Set(Object.keys((palette ?? {}) as object));
  boxes.forEach((b, i) => {
    if (typeof b !== "object" || b === null) {
      errors.push(`boxes[${i}] is not an object`);
      return;
    }
    const bb = b as Record<string, unknown>;
    for (const end of ["from", "to"] as const) {
      const arr = bb[end];
      if (!Array.isArray(arr) || arr.length !== 3 || !arr.every(INT)) {
        errors.push(`boxes[${i}].${end} must be 3 integers`);
      }
    }
    if (typeof bb.block !== "string" || (bb.block !== "air" && !keys.has(bb.block))) {
      errors.push(`boxes[${i}].block = ${JSON.stringify(bb.block)} is not "air" nor a palette key`);
    }
    if (bb.hollow !== undefined && typeof bb.hollow !== "boolean") {
      errors.push(`boxes[${i}].hollow must be a boolean`);
    }
  });
  if (errors.length > 0) return { errors: errors.slice(0, 40) };

  // Bounds checks over the solid (non-air) extent.
  const doc = value as unknown as StructureDoc;
  const ext = solidExtent(doc);
  if (ext === undefined) {
    errors.push("no solid blocks at all");
  } else {
    const [dx, dy, dz] = ext.size;
    if (dx > MAX_FOOTPRINT || dz > MAX_FOOTPRINT) {
      errors.push(`footprint ${dx}x${dz} exceeds ${MAX_FOOTPRINT}x${MAX_FOOTPRINT}`);
    }
    if (dy > MAX_HEIGHT) errors.push(`height ${dy} exceeds ${MAX_HEIGHT}`);
  }
  return errors.length > 0 ? { errors } : { doc, errors: [] };
}

function solidExtent(doc: StructureDoc): { size: [number, number, number] } | undefined {
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const b of doc.boxes) {
    if (b.block === "air") continue;
    any = true;
    for (let a = 0; a < 3; a += 1) {
      lo[a] = Math.min(lo[a]!, b.from[a]!, b.to[a]!);
      hi[a] = Math.max(hi[a]!, b.from[a]!, b.to[a]!);
    }
  }
  if (!any) return undefined;
  return { size: [hi[0]! - lo[0]! + 1, hi[1]! - lo[1]! + 1, hi[2]! - lo[2]! + 1] };
}

/* ------------------------------ expansion --------------------------------- */

const AIR = " air";

/** Expand a box list into the canonical flat form, normalized to min 0,0,0. */
export function expand(doc: StructureDoc): FlatStructure {
  const grid = new Map<string, string>();
  for (const b of doc.boxes) {
    const x0 = Math.min(b.from[0], b.to[0]);
    const x1 = Math.max(b.from[0], b.to[0]);
    const y0 = Math.min(b.from[1], b.to[1]);
    const y1 = Math.max(b.from[1], b.to[1]);
    const z0 = Math.min(b.from[2], b.to[2]);
    const z1 = Math.max(b.from[2], b.to[2]);
    const id = b.block === "air" ? AIR : doc.palette[b.block]!;
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (let z = z0; z <= z1; z += 1) {
          if (b.hollow === true && x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) continue;
          grid.set(`${x},${y},${z}`, id);
        }
      }
    }
  }
  const solid: Array<[number, number, number, string]> = [];
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (const [key, id] of grid) {
    if (id === AIR) continue;
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    solid.push([x, y, z, id]);
    lo = [Math.min(lo[0]!, x), Math.min(lo[1]!, y), Math.min(lo[2]!, z)];
    hi = [Math.max(hi[0]!, x), Math.max(hi[1]!, y), Math.max(hi[2]!, z)];
  }
  if (solid.length === 0) return { name: doc.name, size: [0, 0, 0], blocks: [] };
  solid.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
  return {
    name: doc.name,
    size: [hi[0]! - lo[0]! + 1, hi[1]! - lo[1]! + 1, hi[2]! - lo[2]! + 1],
    blocks: solid.map(([x, y, z, id]) => ({ x: x - lo[0]!, y: y - lo[1]!, z: z - lo[2]!, id })),
  };
}

/* ------------------------------ silhouette -------------------------------- */

/** Coarse max-projection side elevation (x across, y up), downsampled to fit. */
export function silhouette(flat: FlatStructure, maxW = 78, maxH = 34): string {
  const [dx, dy] = flat.size;
  if (flat.blocks.length === 0) return "(empty)";
  const sx = Math.max(1, Math.ceil(dx / maxW));
  const sy = Math.max(1, Math.ceil(dy / maxH));
  const w = Math.ceil(dx / sx);
  const h = Math.ceil(dy / sy);
  const counts = new Array<number>(w * h).fill(0);
  for (const b of flat.blocks) counts[Math.floor(b.y / sy) * w + Math.floor(b.x / sx)]! += 1;
  const max = Math.max(...counts);
  const ramp = " .:-=+*#%@";
  const rows: string[] = [];
  for (let row = h - 1; row >= 0; row -= 1) {
    let line = "";
    for (let col = 0; col < w; col += 1) {
      const c = counts[row * w + col]!;
      line += c === 0 ? " " : ramp[Math.min(ramp.length - 1, 1 + Math.floor((c / max) * (ramp.length - 2)))]!;
    }
    rows.push(line.replace(/\s+$/, ""));
  }
  return rows.join("\n");
}

/* --------------------------------- run ------------------------------------ */

export interface RunStats {
  model: string;
  effort: string;
  attempts: number;
  usage: Usage;
  costUsd: number;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const arg = (n: string): string | undefined => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const slug = arg("slug");
  const prompt = arg("prompt");
  if (slug === undefined) throw new Error("usage: --slug <slug> --prompt <text> [--feedback <text>] [--force] [--inspect]");
  const root = findRepoRoot();
  const outPath = arg("out") ?? join(root, "out", "shootout", `luna-${slug}.blocks.json`);
  const base = outPath.replace(/\.blocks\.json$/, "");

  if (existsSync(outPath) && !args.includes("--force")) {
    const flat = JSON.parse(readFileSync(outPath, "utf8")) as FlatStructure;
    report(slug, flat, undefined, outPath, base);
    return;
  }
  if (prompt === undefined) throw new Error("--prompt is required when authoring");
  const apiKey = loadOpenRouterKey(root);

  const usages: Usage[] = [];
  let attempts = 0;
  let effortUsed = "";
  let feedback = arg("feedback");
  let doc: StructureDoc | undefined;
  let lastErrors: string[] = [];

  const efforts = [...EFFORT_LADDER];
  let effortIdx = 0;

  while (attempts < 3 && doc === undefined) {
    attempts += 1;
    const effort = efforts[effortIdx]!;
    let result;
    try {
      result = await chatComplete({
        apiKey,
        model: LUNA_MODEL_ID,
        reasoningEffort: effort,
        temperature: 0.4,
        maxTokens: 100000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPromptFor(prompt, feedback) },
        ],
      });
    } catch (err) {
      const msg = String(err);
      if (effortIdx < efforts.length - 1 && /effort|reasoning|400/i.test(msg)) {
        console.error(`effort "${effort}" rejected (${msg.slice(0, 160)}); falling back`);
        effortIdx += 1;
        attempts -= 1;
        continue;
      }
      throw err;
    }
    effortUsed = effort;
    usages.push(result.usage);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(`${outPath.replace(/\.blocks\.json$/, "")}.raw.json`, result.text);
    const extracted = extractJson(result.text);
    if (!extracted.ok) {
      lastErrors = [`response was not parseable JSON: ${extracted.reason}`];
      feedback = lastErrors.join("\n");
      console.error(lastErrors[0]);
      continue;
    }
    const parsed: unknown = extracted.value;
    const check = validateDoc(parsed);
    if (check.doc !== undefined) {
      doc = check.doc;
      break;
    }
    lastErrors = check.errors;
    feedback = check.errors.map((e) => `- ${e}`).join("\n");
    console.error(`attempt ${attempts} invalid:\n${feedback}`);
  }

  if (doc === undefined) throw new Error(`Luna failed validation:\n${lastErrors.join("\n")}`);

  const flat = expand(doc);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(flat)}\n`);

  const usage = usages.reduce(
    (a, u) => ({
      promptTokens: a.promptTokens + u.promptTokens,
      completionTokens: a.completionTokens + u.completionTokens,
      totalTokens: a.totalTokens + u.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
  const costUsd =
    usage.promptTokens * PRICE_PROMPT_USD + usage.completionTokens * PRICE_COMPLETION_USD;

  const stats = {
    model: LUNA_MODEL_ID,
    effort: effortUsed,
    attempts,
    boxes: doc.boxes.length,
    usage,
    costUsd: Number(costUsd.toFixed(6)),
  };
  writeFileSync(`${base}.stats.json`, `${JSON.stringify(stats, null, 2)}\n`);
  report(slug, flat, stats, outPath, base);
}

function report(
  slug: string,
  flat: FlatStructure,
  stats: unknown,
  outPath: string,
  base: string,
): void {
  const art = silhouette(flat);
  writeFileSync(`${base}.silhouette.txt`, `${art}\n`);
  console.log(
    JSON.stringify(
      { slug, name: flat.name, size: flat.size, blockCount: flat.blocks.length, out: outPath, stats },
      null,
      2,
    ),
  );
  console.log(`\n--- side elevation (x across, y up) ---\n${art}`);
  if (flat.blocks.length < 500 || flat.size[1] < 15) {
    console.log("\nDEGENERATE: under 500 blocks or under 15 tall.");
  }
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].includes("luna-structure");
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

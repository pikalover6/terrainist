#!/usr/bin/env node
/**
 * Prompt → Tripo text-to-3D → GLB → voxels → blocks JSON.
 *
 * The Tripo half is the repo's own client (`@terrainist/agents`): submit,
 * bounded poll, download. The voxel half is `voxelize.ts`, which has no
 * network dependency at all and is tested offline against generated GLB
 * fixtures — so a broken key is never confused with a broken voxelizer.
 *
 * The key comes from `TRIPO_API_KEY` in the environment or the repo-root
 * `.env`, and the tool fails fast with that message before spending anything
 * if it is missing. `--glb <file>` skips the API entirely and voxelizes a GLB
 * already on disk — the offline path for re-tuning `--target` without paying
 * for the same mesh twice.
 *
 * Usage:
 *   node tools/shootout/tripo-gen.ts "<prompt>" [--out <file.json>]
 *                                    [--name <slug>] [--target 48]
 *                                    [--keep-glb <file.glb>] [--glb <file.glb>]
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { fetchMeshBytes, loadTripoKey, pollTask, submitTextTask } from "@terrainist/agents";

import { DEFAULT_TARGET, MAX_TARGET, clampTarget, voxelizeGlb } from "./voxelize.ts";

interface Args {
  readonly prompt: string;
  readonly out?: string;
  readonly name?: string;
  readonly target: number;
  readonly keepGlb?: string;
  readonly glb?: string;
}

export function parseArgs(argv: readonly string[]): Args {
  let prompt = "";
  let out: string | undefined;
  let name: string | undefined;
  let target = DEFAULT_TARGET;
  let keepGlb: string | undefined;
  let glb: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = (): string => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`tripo-gen: ${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case "--out": out = next(); break;
      case "--name": name = next(); break;
      case "--target": target = clampTarget(Number(next())); break;
      case "--keep-glb": keepGlb = next(); break;
      case "--glb": glb = next(); break;
      default:
        if (arg.startsWith("--")) throw new Error(`tripo-gen: unknown option ${arg}`);
        if (prompt !== "") throw new Error("tripo-gen: give exactly one prompt");
        prompt = arg;
    }
  }

  if (prompt === "" && glb === undefined) {
    throw new Error(
      `tripo-gen: usage: tripo-gen "<prompt>" [--out <file.json>] [--name <slug>] ` +
        `[--target <4..${MAX_TARGET}>] [--keep-glb <file.glb>] [--glb <file.glb>]`,
    );
  }
  return { prompt, target, ...(out !== undefined && { out }), ...(name !== undefined && { name }),
    ...(keepGlb !== undefined && { keepGlb }), ...(glb !== undefined && { glb }) };
}

/** A filesystem- and Minecraft-safe slug for a prompt. */
export function slugify(prompt: string, limit = 40): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, limit)
    .replace(/-+$/g, "");
  return slug === "" ? "structure" : slug;
}

/** The task id previously submitted for this prompt, if any. */
async function readTaskId(taskPath: string, prompt: string): Promise<string | undefined> {
  let text: string;
  try {
    text = await readFile(taskPath, "utf8");
  } catch {
    return undefined;
  }
  const saved = JSON.parse(text) as { taskId?: unknown; prompt?: unknown };
  if (typeof saved.taskId !== "string" || saved.taskId === "") return undefined;
  if (saved.prompt !== prompt) {
    throw new Error(
      `tripo-gen: ${taskPath} holds a task for a different prompt — delete it or use a different --name`,
    );
  }
  return saved.taskId;
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const name = args.name ?? slugify(args.prompt);
  const outPath = args.out ?? path.join("out", "shootout", `tripo-${name}.blocks.json`);

  // Idempotent per slug: an existing result is never regenerated (and never
  // re-billed). Delete the file, or pass a different --name, to redo one.
  try {
    await readFile(outPath, "utf8");
    console.error(`exists     ${outPath} — nothing to do (delete it to regenerate)`);
    console.log(path.resolve(outPath));
    return;
  } catch {
    /* not generated yet */
  }

  let glbBytes: Uint8Array;
  if (args.glb !== undefined) {
    glbBytes = new Uint8Array(await readFile(args.glb));
    console.error(`glb        ${args.glb} (${glbBytes.byteLength} bytes, no API call)`);
  } else {
    // Fail before any spend if the credential is missing; the thrown message
    // says where to put the key and never echoes it.
    const apiKey = loadTripoKey();

    // A submitted task id is written to disk before the first poll, so a run
    // killed mid-poll re-polls the same (already paid for) task instead of
    // submitting a second one. Delete the file to force a fresh generation.
    const taskPath = outPath.replace(/\.blocks\.json$/, "") + ".task.json";
    let taskId = await readTaskId(taskPath, args.prompt);
    if (taskId !== undefined) {
      console.error(`resume     ${taskId} (from ${taskPath})`);
    } else {
      console.error(`prompt     ${args.prompt}`);
      const submitted = await submitTextTask({ apiKey, prompt: args.prompt });
      taskId = submitted.taskId;
      await mkdir(path.dirname(path.resolve(taskPath)), { recursive: true });
      await writeFile(
        taskPath,
        `${JSON.stringify({ taskId, modelVersion: submitted.modelVersion, prompt: args.prompt, name }, null, 2)}\n`,
        "utf8",
      );
      console.error(`task       ${taskId} (model ${submitted.modelVersion})`);
    }

    const started = Date.now();
    const done = await pollTask({
      apiKey,
      taskId,
      onPoll: (status, attempt) =>
        console.error(`poll ${String(attempt).padStart(3)}  ${status.status} ${status.progress}%`),
    });
    glbBytes = await fetchMeshBytes({ apiKey, modelUrl: done.modelUrl });
    console.error(`mesh       ${glbBytes.byteLength} bytes in ${((Date.now() - started) / 1000).toFixed(1)}s`);

    if (args.keepGlb !== undefined) {
      await mkdir(path.dirname(path.resolve(args.keepGlb)), { recursive: true });
      await writeFile(args.keepGlb, glbBytes);
      console.error(`glb        ${args.keepGlb}`);
    }
  }

  const doc = voxelizeGlb(glbBytes, name, { target: args.target });
  await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(doc)}\n`, "utf8");

  console.error(`voxels     ${doc.blocks.length} blocks, size ${doc.size.join("x")}`);
  console.log(path.resolve(outPath));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

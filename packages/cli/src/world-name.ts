/**
 * Generated-world naming.
 *
 * A world the CLI names itself is `<base>_<MMDD>` — the base is the
 * document's own name, the stamp the local date of the compile. If that
 * folder already exists in the output directory, it becomes
 * `<base>_<MMDD>-2`, and so on. `--suffix <tag>` rides after the stamp
 * (`<base>_<MMDD>-<tag>`); `--name <n>` overrides the whole thing and takes
 * the name literally.
 */

import { existsSync } from "node:fs";
import path from "node:path";

function sanitize(part: string): string {
  return part.replace(/[^\w.-]/g, "-");
}

/** The local-date stamp baked into an auto name: zero-padded month and day. */
export function dateStamp(now: Date): string {
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${month}${day}`;
}

export interface ResolvedWorldName {
  /** The world folder name, relative to the output directory. */
  readonly name: string;
  /** The `MMDD` stamp baked into it; empty when `--name` overrode wholesale. */
  readonly stamp: string;
}

/**
 * Pick the world folder name before a compile. `--name` wins outright and
 * refuses to clobber an existing directory; otherwise the auto name steps a
 * `-N` counter past every name the log or the output directory already holds.
 */
export async function resolveWorldName(opts: {
  base: string;
  outDir: string;
  /** Accepted for compatibility; naming no longer consults the repo. */
  repoRoot?: string;
  name?: string;
  suffix?: string;
  now?: Date;
}): Promise<ResolvedWorldName> {
  const outDir = path.resolve(opts.outDir);
  if (opts.name !== undefined) {
    const name = sanitize(opts.name);
    if (name === "" || name === "." || name === "..") {
      throw new Error("--name must be a usable folder name");
    }
    if (existsSync(path.join(outDir, name))) {
      throw new Error(
        `--name ${name}: ${path.join(outDir, name)} already exists — choose another name or remove it`,
      );
    }
    return { name, stamp: "" };
  }
  const base = sanitize(opts.base);
  if (base === "" || base === "." || base === "..") {
    throw new Error(`the document name ${JSON.stringify(opts.base)} is not a usable world folder name; pass --name`);
  }
  let suffix = "";
  if (opts.suffix !== undefined) {
    const tag = sanitize(opts.suffix.trim());
    if (tag === "") throw new Error("--suffix must not be empty");
    suffix = `-${tag}`;
  }
  const core = `${base}_${dateStamp(opts.now ?? new Date())}${suffix}`;
  let name = core;
  for (let n = 2; existsSync(path.join(outDir, name)); n++) {
    name = `${core}-${n}`;
  }
  return { name, stamp: core.slice(base.length + 1, base.length + 5) };
}

/**
 * Git provenance, read by shelling out.
 *
 * Lives in the CLI rather than the compiler on purpose: the compiler runs no
 * subprocesses and reads no ambient state, so provenance is something the CLI
 * *hands it*. The type is `@terrainist/compiler`'s, because the compiler's
 * sidecars (the `--report` JSON, the Terrarium manifest) are what carry it.
 *
 * Degrades to `null` rather than throwing: a checkout exported as a tarball, a
 * container without `git`, a `cwd` outside any repository. None of those are
 * reasons to fail a build — they are reasons for the report to say nothing
 * about where it came from.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { Provenance } from "@terrainist/compiler";

const execFileAsync = promisify(execFile);

/** The tag that marks the last human-validated commit. */
export const BASELINE_TAG = "baseline";

/** Run a git command, or return undefined if it fails for any reason. */
async function git(args: readonly string[], cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", [...args], { cwd });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * Provenance for the repository containing `cwd`, or `null` when there is none.
 *
 * @param cwd directory to resolve the repository from; defaults to the process's.
 */
export async function gitProvenance(cwd: string = process.cwd()): Promise<Provenance | null> {
  const commit = await git(["rev-parse", "HEAD"], cwd);
  if (commit === undefined || commit === "") return null;

  const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)) ?? "HEAD";
  // `--porcelain` prints one line per changed path and nothing at all when the
  // tree is clean, which is exactly the boolean we want.
  const status = await git(["status", "--porcelain"], cwd);
  const dirty = status === undefined ? false : status !== "";
  // `^{}` dereferences an annotated tag to the commit it points at; for a
  // lightweight tag it is a no-op.
  const baseline =
    (await git(["rev-parse", `${BASELINE_TAG}^{}`], cwd)) ??
    (await git(["rev-parse", BASELINE_TAG], cwd));

  return {
    commit,
    branch,
    dirty,
    ...(baseline === undefined || baseline === "" ? {} : { baseline }),
    isBaseline: baseline !== undefined && baseline === commit,
  };
}

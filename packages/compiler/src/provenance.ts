/**
 * Build provenance — which checkout produced an artifact.
 *
 * The convention this serves: `main` is nightly (green but unwalked), and a
 * moving `baseline` tag marks the last commit a human actually walked in the
 * client. E2e runs, GLM generations and Terrarium sessions build from
 * `baseline`, so every report and manifest has to be able to say which of the
 * two it came from — and whether the working tree was dirty at the time.
 *
 * The *type* lives in the compiler because the compiler's sidecars carry it;
 * the git-shelling *helper* lives in the CLI, because the compiler stays pure
 * (no subprocesses, no environment reads) and provenance therefore always
 * arrives as an input.
 *
 * Determinism: provenance appears only in sidecars — the `--report` JSON and
 * the Terrarium manifest, both written *next to* the world and never inside it
 * or its zip. Nothing here reaches `level.dat` or a block entity, so
 * byte-identity of world output is untouched. It carries no wall clock either,
 * so a manifest is still a pure function of (repo state, plan).
 */

/** Git provenance for the checkout that produced an artifact. */
export interface Provenance {
  /** Full commit sha of `HEAD`. */
  readonly commit: string;
  /** Branch name, or `"HEAD"` when detached. */
  readonly branch: string;
  /** True when the working tree had uncommitted changes. */
  readonly dirty: boolean;
  /** The sha the `baseline` tag points at, when that tag exists. */
  readonly baseline?: string;
  /** True when `commit` is exactly the `baseline` tag's commit. */
  readonly isBaseline: boolean;
}

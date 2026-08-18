/**
 * The five-step gate, as library functions.
 *
 * The same rules run at authoring time and at compile time — a program that
 * passes one gate and fails the other is a bug in this file. What differs is
 * only *what is being judged*: the authoring gate judges the **program**, the
 * compile gate judges the **seating**, because the same output that is clean
 * on superflat can be half-buried on a slope or standing in water.
 *
 * The steps:
 *
 * 1. **Static** — {@link gateStatic}: source size, declared envelope, and the
 *    spec's textual lint (banned globals, export shape, no top-level mutable
 *    state). Braceless loop and branch bodies are *not* a failure here: the
 *    fuel instrumenter brace-wraps them itself, at the gate and at compile
 *    alike, so the two see identical code.
 * 2. **Double run** — {@link gateDoubleRun}: executed twice in separate realms
 *    and byte-compared, which catches an iteration-order bug at the only
 *    moment we can attribute it. The digest it agrees on is the `outputHash`.
 * 3. **Structural** — {@link gateStructural}: one 6-connected solid after
 *    dropping components under `minIslandVolume`. **Suspended** — see
 *    {@link SUSPENDED_GATE_CHECKS}.
 * 4. **Physics** — {@link gatePhysics}: emitted through the real `emitWorld`
 *    into a scratch superflat world and walked by the existing physics rules.
 *    The findings are **suspended** (recorded as warnings); an emit that
 *    *throws* is still fatal.
 * 5. **Nonsense** — {@link gateNonsense}: ≥ 500 solid voxels and ≥ 8 tall.
 *    **Suspended** — see {@link SUSPENDED_GATE_CHECKS}.
 * 6. **Conformance** — {@link gateConform}: the program is run once against
 *    each member of `conform.ts`'s pinned five-piece terrain suite and scored
 *    on whether it followed the ground. **Never a failure** — the verdict is a
 *    recorded fact that decides how the instance is *seated*
 *    (`docs/GROUND-UNIFICATION-v0.md` §2.4–§2.5).
 *
 * Gate leniency (Kai, 2026-08-15, "for now") is one constant,
 * {@link SUSPENDED_GATE_CHECKS} in `./leniency.ts`; both gates read it, so the
 * authoring and compile halves keep the identical severity split.
 *
 * {@link verifyPrograms} runs all five over a map of programs and hands back
 * diagnostics plus the hashes to freeze into the document. That is the entry
 * point the authoring loop calls; nothing in it looks at a render.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  PROGRAM_LIMITS,
  lintProgramSource,
  sourceFindingsToDiagnostics,
  type AuthoredProgramRecord,
  type LoamDiagnostic,
} from "@terrainist/spec";
import { error, warning } from "@terrainist/spec";

import { emitWorld } from "../emit/index.js";
import { parseSpikeDocument } from "../emit/document.js";
import { lintWorldPhysics } from "../emit/physics.js";
import { loadPrismarine, type PrismarineStack } from "../emit/prismarine.js";
import { CONFORM_SUITE, conformanceOf, type ConformMemberFinding } from "./conform.js";
import { invokeLandmark } from "./invoke.js";
import { SUSPENDED_GATE_CHECKS } from "./leniency.js";
import { opStreamHash, sourceHashOf } from "./hash.js";
import { runProgramInstance, type HeightSampler, type ProgramRun } from "./run.js";

/** The version the gate's scratch world is emitted at. */
export const GATE_MINECRAFT_VERSION = "1.21.11";

/**
 * The synthetic node path every verification run uses.
 *
 * The `outputHash` has to be re-derivable at compile time, before anything
 * knows where the node landed, so the verification run is deliberately *not*
 * the placed run: it is a fixed node path, a fixed instance set and a flat
 * ground sampler. What it pins is the program; the seating is the compile
 * gate's business.
 */
export const VERIFICATION_NODE_PATH = "loam.verify";

/** The instance count the plugin-mode verification set is drawn from. */
export const VERIFICATION_COUNT = 8;

/** A flat ground sampler — the verification run's terrain. */
export const FLAT_GROUND: HeightSampler = () => 0;

/** One gate step's verdict. */
export interface GateStep {
  readonly step: "static" | "doubleRun" | "structural" | "physics" | "nonsense" | "conform";
  readonly ok: boolean;
  readonly diagnostics: readonly LoamDiagnostic[];
}

/* -------------------------------------------------------------------------- */
/* step 1 — static                                                             */
/* -------------------------------------------------------------------------- */

/** Static gate: size, envelope, textual lint. */
export function gateStatic(
  programId: string,
  program: AuthoredProgramRecord,
  nodePath = VERIFICATION_NODE_PATH,
): GateStep {
  const out: LoamDiagnostic[] = [];
  const bytes = new TextEncoder().encode(program.source).length;
  if (bytes > PROGRAM_LIMITS.maxSourceBytes) {
    out.push(
      error(
        "PROGRAM_GATE_FAILED",
        nodePath,
        `program ${JSON.stringify(programId)} source is ${bytes} bytes, over the ${PROGRAM_LIMITS.maxSourceBytes} byte cap`,
        "shorten the program — compute the repetitive parts in a loop instead of writing them out",
      ),
    );
  }
  const [w, h, d] = program.envelope;
  if (w * h * d > PROGRAM_LIMITS.maxEnvelopeVolume) {
    out.push(
      error(
        "PROGRAM_GATE_FAILED",
        nodePath,
        `declared envelope ${w}×${h}×${d} exceeds the ${PROGRAM_LIMITS.maxEnvelopeVolume} block volume cap`,
        "declare a smaller envelope; a program that needs more than this is a district, not a landmark",
      ),
    );
  }
  out.push(...sourceFindingsToDiagnostics(lintProgramSource(program.source), nodePath, programId));
  return { step: "static", ok: out.every((diag) => diag.severity !== "error"), diagnostics: out };
}

/* -------------------------------------------------------------------------- */
/* step 2 — the double run                                                     */
/* -------------------------------------------------------------------------- */

/** The instance indices a mode's verification set covers. */
export function verificationIndices(program: AuthoredProgramRecord): readonly number[] {
  return program.mode === "landmark" ? [0] : PROGRAM_LIMITS.verificationInstances;
}

/** Result of the double run: the runs, and the hash they agreed on. */
export interface DoubleRunResult extends GateStep {
  /** The first realm's runs, one per verification index. */
  readonly runs: readonly ProgramRun[];
  /** `b3:` digest over the whole verification set. `""` when the step failed. */
  readonly outputHash: string;
}

/**
 * Execute the verification set twice, in separate realms, and byte-compare.
 *
 * "Separate realms" is what the executor gives us for free: every
 * {@link runProgramInstance} call builds its own context, so the second pass
 * shares no module state with the first. A program that memoizes into module
 * scope therefore *diverges* here rather than silently baking the first run's
 * answer into the hash — which is exactly the bug this step is for.
 */
export function gateDoubleRun(
  programId: string,
  program: AuthoredProgramRecord,
  worldSeed: bigint,
): DoubleRunResult {
  const out: LoamDiagnostic[] = [];
  const indices = verificationIndices(program);
  const first: ProgramRun[] = [];
  const streams: string[] = [];

  for (const pass of [0, 1]) {
    const passStreams: string[] = [];
    for (const index of indices) {
      const run = runProgramInstance({
        programId,
        program,
        nodePath: VERIFICATION_NODE_PATH,
        worldSeed,
        index,
        count: program.mode === "landmark" ? 1 : VERIFICATION_COUNT,
        heightAt: FLAT_GROUND,
      });
      if (!run.ok) {
        out.push(...run.diagnostics);
        return { step: "doubleRun", ok: false, diagnostics: out, runs: [], outputHash: "" };
      }
      if (pass === 0) first.push(run);
      passStreams.push(run.opStream);
    }
    if (pass === 0) streams.push(passStreams.join(""));
    else streams.push(passStreams.join(""));
  }

  if (streams[0] !== streams[1]) {
    out.push(
      error(
        "PROGRAM_GATE_FAILED",
        VERIFICATION_NODE_PATH,
        `program ${JSON.stringify(programId)} produced two different op streams from the same seed`,
        "something in the program depends on iteration order or on state that outlives one run: iterate arrays rather than object keys or Sets built from them, and keep every mutable variable inside the build function",
      ),
    );
    return { step: "doubleRun", ok: false, diagnostics: out, runs: [], outputHash: "" };
  }
  return {
    step: "doubleRun",
    ok: true,
    diagnostics: out,
    runs: first,
    outputHash: opStreamHash(streams[0] as string),
  };
}

/* -------------------------------------------------------------------------- */
/* step 3 — structural                                                         */
/* -------------------------------------------------------------------------- */

const AIR = new Set(["air", "cave_air", "void_air"]);

function isSolidBlock(block: string): boolean {
  const bare = block.replace(/^minecraft:/, "").replace(/\[.*$/, "");
  return !AIR.has(bare);
}

/**
 * One 6-connected component, after dropping components under
 * `minIslandVolume`.
 *
 * A floating chunk is exactly what the physics lint exists to catch, and at
 * authoring time it is nearly free to reject.
 */
export function gateStructural(
  programId: string,
  run: ProgramRun,
  nodePath = VERIFICATION_NODE_PATH,
): GateStep {
  const solid = new Set<string>();
  for (const [key, block] of run.voxels) if (isSolidBlock(block)) solid.add(key);

  const seen = new Set<string>();
  const components: number[] = [];
  for (const start of solid) {
    if (seen.has(start)) continue;
    let size = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      size++;
      const [x, y, z] = cur.split(",").map(Number) as [number, number, number];
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const key = `${x + dx},${y + dy},${z + dz}`;
        if (solid.has(key) && !seen.has(key)) {
          seen.add(key);
          stack.push(key);
        }
      }
    }
    components.push(size);
  }

  const significant = components.filter((c) => c >= PROGRAM_LIMITS.minIslandVolume);
  if (significant.length <= 1) return { step: "structural", ok: true, diagnostics: [] };
  // Suspended (Kai, 2026-08-15, "for now"): recorded, never fatal.
  const say = SUSPENDED_GATE_CHECKS.structural ? warning : error;
  return {
    step: "structural",
    ok: SUSPENDED_GATE_CHECKS.structural,
    diagnostics: [
      say(
        "PROGRAM_DISCONNECTED",
        nodePath,
        `program ${JSON.stringify(programId)} wrote ${significant.length} separate solids (sizes ${significant.sort((a, b) => b - a).slice(0, 6).join(", ")})`,
        `join the pieces, or drop them: a component under ${PROGRAM_LIMITS.minIslandVolume} voxels is ignored, anything larger has to be attached to the rest of the structure`,
      ),
    ],
  };
}

const NEIGHBOURS: readonly (readonly [number, number, number])[] = Object.freeze([
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]);

/* -------------------------------------------------------------------------- */
/* step 5 — the nonsense guard                                                 */
/* -------------------------------------------------------------------------- */

/** The shootout's own DEGENERATE test: ≥ 500 solid voxels and ≥ 8 tall. */
export function gateNonsense(
  programId: string,
  run: ProgramRun,
  nodePath = VERIFICATION_NODE_PATH,
): GateStep {
  let solids = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [key, block] of run.voxels) {
    if (!isSolidBlock(block)) continue;
    solids++;
    const y = Number(key.split(",")[1]);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = solids === 0 ? 0 : maxY - minY + 1;
  const out: LoamDiagnostic[] = [];
  // Suspended (Kai, 2026-08-15, "for now"): recorded, never fatal.
  const say = SUSPENDED_GATE_CHECKS.nonsense ? warning : error;
  if (solids < PROGRAM_LIMITS.minSolidVoxels) {
    out.push(
      say(
        "PROGRAM_GATE_FAILED",
        nodePath,
        `program ${JSON.stringify(programId)} placed ${solids} solid blocks, under the ${PROGRAM_LIMITS.minSolidVoxels} the nonsense guard demands`,
        "build something worth walking to: this is the guard that catches a program that ran, returned cleanly, and made nothing",
      ),
    );
  }
  if (height < PROGRAM_LIMITS.minHeight) {
    out.push(
      say(
        "PROGRAM_GATE_FAILED",
        nodePath,
        `program ${JSON.stringify(programId)} is ${height} blocks tall, under the ${PROGRAM_LIMITS.minHeight} the nonsense guard demands`,
        "a landmark is a thing you can see over the trees; give it height",
      ),
    );
  }
  return {
    step: "nonsense",
    ok: SUSPENDED_GATE_CHECKS.nonsense || out.length === 0,
    diagnostics: out,
  };
}

/* -------------------------------------------------------------------------- */
/* step 4 — the physics lint                                                   */
/* -------------------------------------------------------------------------- */

/** Ground plane of the scratch world the physics gate builds. */
export const GATE_GROUND_Y = 63;
const GATE_MARGIN = 48;

/**
 * Lower one or more runs into a superflat spike document, the same shape
 * `tools/shootout/assemble.ts` builds, so the gate world goes through the real
 * {@link emitWorld} rather than a second world writer.
 *
 * Exported because the authoring loop wants to keep the world for a walk.
 */
export function buildGateDocument(
  runs: readonly ProgramRun[],
  envelope: readonly [number, number, number],
  name: string,
  gap = 24,
): unknown {
  const palette: Record<string, string> = {};
  const symbols = new Map<string, string>();
  const symbolFor = (id: string): string => {
    const hit = symbols.get(id);
    if (hit !== undefined) return hit;
    const symbol = `b${symbols.size}`;
    symbols.set(id, symbol);
    palette[symbol] = id.startsWith("minecraft:") ? id : `minecraft:${id}`;
    return symbol;
  };

  const [w, , d] = envelope;
  const columns = Math.max(1, Math.ceil(Math.sqrt(runs.length)));
  const spanX = columns * (w + gap);
  const spanZ = Math.ceil(runs.length / columns) * (d + gap);

  const ops: unknown[] = [
    {
      op: "fill",
      block: symbolFor("minecraft:grass_block"),
      from: [-GATE_MARGIN, GATE_GROUND_Y, -GATE_MARGIN],
      to: [spanX + GATE_MARGIN, GATE_GROUND_Y, spanZ + GATE_MARGIN],
    },
  ];

  runs.forEach((run, i) => {
    const ox = (i % columns) * (w + gap);
    const oz = Math.floor(i / columns) * (d + gap);
    // Sorted, so the op list is a pure function of the voxel set rather than
    // of Map insertion order.
    for (const key of [...run.voxels.keys()].sort(compareVoxelKeys)) {
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      const block = run.voxels.get(key) as string;
      const at = [ox + x, GATE_GROUND_Y + 1 + y, oz + z];
      ops.push({ op: "fill", block: symbolFor(block), from: at, to: at });
    }
  });

  return {
    format: "terrainist-spike-0",
    name,
    spawn: { x: -8, y: GATE_GROUND_Y + 1, z: -8 },
    palette,
    ops,
  };
}

function compareVoxelKeys(a: string, b: string): number {
  const pa = a.split(",").map(Number);
  const pb = b.split(",").map(Number);
  return (pa[1] as number) - (pb[1] as number)
    || (pa[2] as number) - (pb[2] as number)
    || (pa[0] as number) - (pb[0] as number);
}

/** Options for {@link gatePhysics}. */
export interface PhysicsGateOptions {
  /** Where to build the scratch world. A temp directory when absent. */
  readonly worldDir?: string;
  /** Keep the scratch world after the gate runs. Default `false`. */
  readonly keep?: boolean;
  readonly stack?: PrismarineStack;
}

/**
 * Emit the runs into a scratch superflat world and walk the physics rules over
 * it. Any error-severity finding fails the gate.
 *
 * Block-state legality is not a separate step: an id or a state the registry
 * does not know is a chunk the client refuses to parse, and
 * {@link lintWorldPhysics} checks the written palette against the pinned
 * registry before it looks at a single block.
 */
export async function gatePhysics(
  programId: string,
  runs: readonly ProgramRun[],
  envelope: readonly [number, number, number],
  options: PhysicsGateOptions = {},
): Promise<GateStep> {
  const stack = options.stack ?? loadPrismarine(GATE_MINECRAFT_VERSION);
  const dir = options.worldDir ?? (await mkdtemp(path.join(tmpdir(), "loam-gate-")));
  const worldDir = path.join(dir, "world");
  const out: LoamDiagnostic[] = [];
  try {
    const raw = buildGateDocument(runs, envelope, `gate_${programId}`);
    try {
      const doc = parseSpikeDocument(raw, `<gate:${programId}>`);
      await emitWorld(doc, worldDir);
    } catch (err) {
      // A malformed document *or* a block/state the emitter refuses: either
      // way the failure belongs to the program, so it goes back to the author
      // as a gate diagnostic rather than up the stack as a crash.
      return {
        step: "physics",
        ok: false,
        diagnostics: [
          error(
            "PROGRAM_GATE_FAILED",
            VERIFICATION_NODE_PATH,
            `program ${JSON.stringify(programId)} wrote a block the emitter refuses: ${err instanceof Error ? err.message : String(err)}`,
            'use full block strings the pinned 1.21.11 registry knows, states included — "minecraft:oak_stairs[facing=north,half=top]"',
          ),
        ],
      };
    }
    const report = await lintWorldPhysics(worldDir, stack, {
      minY: GATE_GROUND_Y - 4,
      maxY: GATE_GROUND_Y + envelope[1] + 8,
    });
    // Suspended (Kai, 2026-08-15, "for now"): the *findings* from the walked
    // scratch world are recorded, never fatal. An emit that THROWS above is
    // still fatal — that is a block the registry cannot resolve.
    const say = SUSPENDED_GATE_CHECKS.physicsFindings ? warning : error;
    for (const finding of report.findings.slice(0, 24)) {
      out.push(
        say(
          "PROGRAM_GATE_FAILED",
          VERIFICATION_NODE_PATH,
          `physics rule ${finding.rule} at (${finding.x}, ${finding.y}, ${finding.z}) on ${finding.block}: ${finding.detail}`,
          "fix the placement in the program: every block the physics lint rejects is one the game would pop, drop or refuse to load",
        ),
      );
    }
    if (report.findings.length > 24) {
      out.push(
        warning(
          "PROGRAM_GATE_FAILED",
          VERIFICATION_NODE_PATH,
          `…and ${report.findings.length - 24} further physics findings, not listed`,
          "fix the ones above first; they are usually the same mistake repeated",
        ),
      );
    }
  } finally {
    if (options.keep !== true && options.worldDir === undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
  return { step: "physics", ok: out.every((d) => d.severity !== "error"), diagnostics: out };
}

/* -------------------------------------------------------------------------- */
/* step 6 — conformance                                                        */
/* -------------------------------------------------------------------------- */

/** {@link gateConform}'s verdict: a gate step, plus the record fields it stamps. */
export interface ConformStep extends GateStep {
  readonly step: "conform";
  /** §2.4's verdict, to be frozen into the record as `conforms`. */
  readonly conforms: boolean;
  /** The suite digest, to be frozen into the record as `conformHash`. */
  readonly conformHash: string;
  readonly members: readonly ConformMemberFinding[];
}

/**
 * Run the terrain suite and score the program against it.
 *
 * `ok` is **always true**. This step exists to decide a *seating*, not to
 * accept or reject a program: §2.5 — "`conforms: false` is never a failure. It
 * is a routing decision: the program is seated `pad` and built exactly as it
 * is today." A member that fails to execute is the same kind of fact; the
 * program's ability to run at all is the double run's business, on flat
 * ground, where the diagnostic can be attributed.
 */
export function gateConform(
  programId: string,
  program: AuthoredProgramRecord,
  worldSeed: bigint,
  nodePath = VERIFICATION_NODE_PATH,
): ConformStep {
  const result = conformanceOf({
    programId,
    program,
    worldSeed,
    nodePath,
    count: program.mode === "landmark" ? 1 : VERIFICATION_COUNT,
  });
  const out: LoamDiagnostic[] = [];
  if (!result.conforms) {
    const failed = result.members.filter((m) => !m.conforms);
    const detail = failed
      .map((m) => (m.ok
        ? `${m.id} (${m.rigidSole ? "same sole as flat" : `${m.floating} of ${m.occupiedColumns} columns floating`})`
        : `${m.id} (did not run)`))
      .join(", ");
    out.push(
      warning(
        "PROGRAM_DID_NOT_CONFORM",
        nodePath,
        `program ${JSON.stringify(programId)} did not follow the ground on ${failed.length} of ${CONFORM_SUITE.length} terrain${failed.length === 1 ? "" : "s"}: ${detail}`,
        "read api.heightAt(x, z) at every column the structure touches and answer it — legs that reach down, a skirt that follows the fall, a plinth that steps, a foundation course that thickens; a program that writes the same sole on every column is set on a platform instead",
      ),
    );
  }
  return {
    step: "conform",
    ok: true,
    diagnostics: out,
    conforms: result.conforms,
    conformHash: result.conformHash,
    members: result.members,
  };
}

/* -------------------------------------------------------------------------- */
/* the whole gate                                                              */
/* -------------------------------------------------------------------------- */

/** What {@link verifyProgram} decided about one program. */
export interface ProgramVerification {
  readonly programId: string;
  readonly ok: boolean;
  readonly steps: readonly GateStep[];
  readonly diagnostics: readonly LoamDiagnostic[];
  /** Freeze these into the document when `ok`. */
  readonly sourceHash: string;
  readonly outputHash: string;
  /**
   * The conformance verdict and the suite digest beside it — freeze both, or
   * neither. A record carrying neither is today's record and is seated `pad`
   * (`docs/GROUND-UNIFICATION-v0.md` §2.2).
   */
  readonly conforms: boolean;
  readonly conformHash: string;
  /** Everything the program said through `api.log`, first run only. */
  readonly logs: readonly string[];
  /** Solid voxels the first verification instance placed. */
  readonly solids: number;
  /** Warning-severity diagnostics recorded — the suspended checks land here. */
  readonly warnings: number;
}

/** Options both entry points take. */
export interface VerifyOptions {
  readonly worldSeed?: bigint;
  /** Skip the physics step — for a caller that only wants the cheap gates. */
  readonly skipPhysics?: boolean;
  readonly physics?: PhysicsGateOptions;
}

/**
 * Run the whole gate over one program.
 *
 * Steps run in order and stop at the first failure, because a program that
 * does not execute twice identically has nothing worth linting.
 */
export async function verifyProgram(
  programId: string,
  program: AuthoredProgramRecord,
  options: VerifyOptions = {},
): Promise<ProgramVerification> {
  const worldSeed = options.worldSeed ?? 0n;
  const steps: GateStep[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  const sourceHash = sourceHashOf(program.source);

  const fail = (outputHash = ""): ProgramVerification => ({
    programId,
    ok: false,
    steps,
    diagnostics,
    sourceHash,
    outputHash,
    conforms: false,
    conformHash: "",
    logs: [],
    solids: 0,
    warnings: diagnostics.filter((d) => d.severity === "warning").length,
  });

  const staticStep = gateStatic(programId, program);
  steps.push(staticStep);
  diagnostics.push(...staticStep.diagnostics);
  if (!staticStep.ok) return fail();

  const double = gateDoubleRun(programId, program, worldSeed);
  steps.push(double);
  diagnostics.push(...double.diagnostics);
  if (!double.ok) return fail();

  const primary = double.runs[0] as ProgramRun;
  const structural = gateStructural(programId, primary);
  steps.push(structural);
  diagnostics.push(...structural.diagnostics);
  if (!structural.ok) return fail(double.outputHash);

  const nonsense = gateNonsense(programId, primary);
  steps.push(nonsense);
  diagnostics.push(...nonsense.diagnostics);
  if (!nonsense.ok) return fail(double.outputHash);

  // Never fails; it decides a seating. Placed after the cheap verdicts and
  // before the physics walk so that a program the earlier steps threw out does
  // not pay for five more executions.
  const conform = gateConform(programId, program, worldSeed);
  steps.push(conform);
  diagnostics.push(...conform.diagnostics);

  if (options.skipPhysics !== true) {
    const physics = await gatePhysics(programId, double.runs, program.envelope, options.physics);
    steps.push(physics);
    diagnostics.push(...physics.diagnostics);
    if (!physics.ok) return fail(double.outputHash);
  }

  let solids = 0;
  for (const block of primary.voxels.values()) if (isSolidBlock(block)) solids++;
  return {
    programId,
    ok: true,
    steps,
    diagnostics,
    sourceHash,
    outputHash: double.outputHash,
    conforms: conform.conforms,
    conformHash: conform.conformHash,
    logs: primary.logs,
    solids,
    warnings: diagnostics.filter((d) => d.severity === "warning").length,
  };
}

/**
 * Run the gate over a whole map of programs — the entry point the authoring
 * loop calls between writing a program and freezing it into a document.
 *
 * Programs are verified in sorted id order, so a run log is comparable between
 * two invocations, and each one gets its own scratch world.
 */
export async function verifyPrograms(
  programs: Readonly<Record<string, AuthoredProgramRecord>>,
  options: VerifyOptions = {},
): Promise<readonly ProgramVerification[]> {
  const out: ProgramVerification[] = [];
  for (const id of Object.keys(programs).sort()) {
    out.push(await verifyProgram(id, programs[id] as AuthoredProgramRecord, options));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* the compile-time half                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Re-execute a program's verification set and compare against the recorded
 * `outputHash` (`E334`).
 *
 * This is the compile's half of "determinism by verification": code is the
 * canonical artifact, a stored expansion is a cache only, and a host whose
 * `Math.sin` differs in the last bit turns a world into a loud compile error
 * rather than a quietly different world. That is the right failure direction.
 */
export function verifyOutputHash(
  programId: string,
  program: AuthoredProgramRecord,
  worldSeed: bigint,
  nodePath: string,
): LoamDiagnostic | undefined {
  const double = gateDoubleRun(programId, program, worldSeed);
  if (!double.ok) {
    return error(
      "PROGRAM_OUTPUT_HASH_MISMATCH",
      nodePath,
      `program ${JSON.stringify(programId)} could not be re-executed for verification`,
      "re-run the authoring gate on this program; the document records an output hash for a program that no longer runs",
    );
  }
  if (double.outputHash === program.outputHash) return undefined;
  return error(
    "PROGRAM_OUTPUT_HASH_MISMATCH",
    nodePath,
    `program ${JSON.stringify(programId)} re-executed to ${double.outputHash}, but the document records ${program.outputHash}`,
    "this host disagrees with the one that authored the world — re-run the authoring gate here, and report it: a floating-point difference between hosts is exactly what this check exists to surface",
  );
}

/**
 * Re-run the terrain suite and compare against the recorded `conformHash` —
 * `verifyOutputHash`'s sibling, and the same failure direction.
 *
 * **Only when the field is present.** A record with no `conformHash` is every
 * archived document: nothing is re-executed, nothing is checked, and the
 * compile is byte-identical to what it was before this check existed. That is
 * deliberate, and it is the whole of §2.11's reach guarantee.
 *
 * Why it is checked at all: once a document carries a verdict, the verdict is
 * what decides the *seating*, and a host that would run the program
 * differently on sloped ground would seat it differently too. Better a loud
 * error than a world that quietly moved.
 */
export function verifyConformHash(
  programId: string,
  program: AuthoredProgramRecord,
  worldSeed: bigint,
  nodePath: string,
): LoamDiagnostic | undefined {
  if (program.conformHash === undefined) return undefined;
  const result = conformanceOf({
    programId,
    program,
    worldSeed,
    nodePath,
    count: program.mode === "landmark" ? 1 : VERIFICATION_COUNT,
  });
  if (!result.ok) {
    return error(
      "PROGRAM_OUTPUT_HASH_MISMATCH",
      nodePath,
      `program ${JSON.stringify(programId)} could not be re-executed against the terrain suite`,
      "re-run the authoring gate on this program; the document records a conformance hash for a program that no longer runs on the ground it was certified against",
    );
  }
  if (result.conformHash === program.conformHash) return undefined;
  return error(
    "PROGRAM_OUTPUT_HASH_MISMATCH",
    nodePath,
    `program ${JSON.stringify(programId)} re-ran the terrain suite to ${result.conformHash}, but the document records ${program.conformHash}`,
    "this host disagrees with the one that authored the world — re-run the authoring gate here, and report it: the suite is integer-pure, so a difference here is a real divergence and not a rounding one",
  );
}

/** Re-export for callers that only want the landmark path. */
export { invokeLandmark };
export { SUSPENDED_GATE_CHECKS } from "./leniency.js";

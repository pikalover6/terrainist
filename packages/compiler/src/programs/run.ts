/**
 * Running one instance of an authored program.
 *
 * This is where the contract's guarantees are actually enforced: the API the
 * program sees, the seed its randomness comes from, the envelope its writes
 * are confined to, and the budgets that stop it. Everything above this file
 * (the landmark path, the scatter path, the gate) is composition.
 *
 * **An instance is all-or-nothing.** A budget trip, a thrown exception or a
 * malformed return value drops the whole instance — never half of one.
 * Over-clipping used to drop it too; it is now a recorded warning (see
 * {@link SUSPENDED_GATE_CHECKS}), while the clipping itself is unchanged —
 * writes outside the envelope never land.
 */

import {
  INTERIOR_LIMITS,
  PROGRAM_LIMITS,
  type AuthoredProgramRecord,
  type InteriorVolume,
  type ProgramApi,
  type ProgramResult,
  type ProgramTheme,
  type LoamDiagnostic,
} from "@terrainist/spec";
import { error, warning } from "@terrainist/spec";
import { Rng, nodeSeed, positionDigest, streamSeed, type Seed256 } from "@terrainist/stdlib";

import { BudgetExceeded, FUEL_COSTS, FuelExhausted, FuelMeter, instrumentFuel } from "./fuel.js";
import { canonicalOpStream, opStreamHash, normalizeSource, sourceHashOf, type ProgramOp } from "./hash.js";
import { SUSPENDED_GATE_CHECKS } from "./leniency.js";
import { getProgramExecutor, rewriteExports } from "./sandbox.js";
import { VERIFICATION_THEME } from "./theme.js";

/**
 * `instanceSeed = BLAKE3(worldSeed ‖ nodePath ‖ "program" ‖ index)`, spelt in
 * the project's own hash discipline: a node seed, a named stream, and a
 * position-keyed draw on the stream with the instance index in the x slot.
 */
export function programInstanceSeed(
  worldSeed: bigint,
  nodePath: string,
  index: number,
  seedSalt = "",
): Seed256 {
  const stream = streamSeed(nodeSeed(worldSeed, nodePath, seedSalt), "program");
  return positionDigest(stream, index, 0, 0);
}

/** Terrain under the instance, node-local. Flat ground when absent. */
export type HeightSampler = (x: number, z: number) => number;

/** Everything one instance run reads. */
export interface ProgramRunInput {
  readonly programId: string;
  readonly program: AuthoredProgramRecord;
  /** Where the diagnostics point. */
  readonly nodePath: string;
  readonly worldSeed: bigint;
  readonly index: number;
  readonly count: number;
  readonly seedSalt?: string;
  /** Node-local ground sampler; `() => 0` when the caller has no terrain yet. */
  readonly heightAt?: HeightSampler;
  /** Defaults to {@link PROGRAM_LIMITS.maxInstanceFuel}. */
  readonly fuelBudget?: number;
  /** Defaults to {@link PROGRAM_LIMITS.maxInstanceWrites}. */
  readonly writeBudget?: number;
  /**
   * The world's resolved material theme, as `api.theme`.
   *
   * Absent for every caller that has no world to speak of — the gate above all
   * — and then {@link VERIFICATION_THEME}, which is pinned: `outputHash` is a
   * property of the program, so the gate may not read a theme that varies.
   */
  readonly theme?: ProgramTheme;
}

/** What one instance run produced. */
export interface ProgramRun {
  readonly ok: boolean;
  readonly programId: string;
  readonly index: number;
  /** Writes that landed inside the envelope, in call order. */
  readonly ops: readonly ProgramOp[];
  /** Last write wins, keyed `"x,y,z"` — what actually gets built. */
  readonly voxels: ReadonlyMap<string, string>;
  readonly result?: ProgramResult;
  readonly opStream: string;
  readonly outputHash: string;
  readonly fuelUsed: number;
  readonly writes: number;
  readonly clipped: number;
  readonly logs: readonly string[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/** Cache of prepared (instrumented, rewritten) source, keyed by source hash. */
const prepared = new Map<string, string>();

/** Instrument and export-rewrite a program's source, memoized by its hash. */
export function prepareSource(source: string): string {
  const key = sourceHashOf(source);
  const hit = prepared.get(key);
  if (hit !== undefined) return hit;
  const code = instrumentFuel(rewriteExports(normalizeSource(source)));
  prepared.set(key, code);
  return code;
}

/**
 * Verify a record's `sourceHash` against the source beside it (`E333`).
 *
 * Cheap, and it runs before anything is executed: a document whose source and
 * hash disagree has been edited after the gate signed it, and nothing further
 * about it can be trusted.
 */
export function checkSourceHash(
  programId: string,
  program: AuthoredProgramRecord,
  nodePath: string,
): LoamDiagnostic | undefined {
  const actual = sourceHashOf(program.source);
  if (actual === program.sourceHash) return undefined;
  return error(
    "PROGRAM_SOURCE_HASH_MISMATCH",
    nodePath,
    `program ${JSON.stringify(programId)} hashes to ${actual}, but the document records ${program.sourceHash}`,
    "re-run the authoring gate on this program; the source and the hash beside it disagree, so one of them has been edited by hand",
  );
}

/** Run one instance. Never throws: a failed instance comes back `ok: false`. */
export function runProgramInstance(input: ProgramRunInput): ProgramRun {
  const { program, programId, nodePath, index, count } = input;
  const [w, h, d] = program.envelope;
  const fuelLimit = input.fuelBudget ?? PROGRAM_LIMITS.maxInstanceFuel;
  const writeLimit = input.writeBudget ?? PROGRAM_LIMITS.maxInstanceWrites;
  const meter = new FuelMeter(fuelLimit);
  const rng = new Rng(
    programInstanceSeed(input.worldSeed, nodePath, index, input.seedSalt),
  );
  const sample = input.heightAt ?? ((): number => 0);

  const ops: ProgramOp[] = [];
  const voxels = new Map<string, string>();
  const logs: string[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  let clipped = 0;
  let heapBytes = 0;

  const api: ProgramApi = {
    size: [w, h, d] as const,
    instance: { index, count },
    set(x: number, y: number, z: number, block: string): void {
      meter.charge(FUEL_COSTS.set);
      if (typeof block !== "string" || block.length === 0) {
        throw new TypeError(`api.set was given ${String(block)} where a block string belongs`);
      }
      if (
        !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)
      ) {
        throw new TypeError("api.set was given a non-finite coordinate");
      }
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const iz = Math.floor(z);
      if (ix < 0 || iy < 0 || iz < 0 || ix >= w || iy >= h || iz >= d) {
        clipped++;
        return;
      }
      if (ops.length >= writeLimit) throw new BudgetExceeded("writes", writeLimit);
      // A deterministic surrogate for the heap ceiling: the real one needs an
      // isolate (see `sandbox.ts`), and a sampled host heap would make the
      // abort itself nondeterministic — the one thing this contract cannot
      // afford. What we can bound exactly is what the *run* retains.
      heapBytes += 48 + block.length * 2;
      if (heapBytes > PROGRAM_LIMITS.maxInstanceHeapBytes) {
        throw new BudgetExceeded("heap", PROGRAM_LIMITS.maxInstanceHeapBytes);
      }
      ops.push({ x: ix, y: iy, z: iz, block });
      voxels.set(`${ix},${iy},${iz}`, block);
    },
    random(): number {
      meter.charge(FUEL_COSTS.random);
      return rng.float();
    },
    heightAt(x: number, z: number): number {
      meter.charge(FUEL_COSTS.heightAt);
      const v = sample(Math.floor(x), Math.floor(z));
      return Number.isFinite(v) ? v : 0;
    },
    log(msg: string): void {
      meter.charge(FUEL_COSTS.log);
      if (logs.length >= 256) throw new BudgetExceeded("logs", 256);
      logs.push(String(msg).slice(0, 512));
    },
    // Free, and frozen. Free because it is a read of a value dealt long before
    // this run and charging for it would push programs back towards the
    // invented palettes it exists to end; frozen (deeply, at construction) so
    // one instance cannot hand the next a different world.
    theme: input.theme ?? VERIFICATION_THEME,
  };

  let result: ProgramResult | undefined;
  try {
    const response = getProgramExecutor().run({
      code: prepareSource(program.source),
      filename: `loam:program/${programId}`,
      globals: { api, fuel: () => meter.charge(FUEL_COSTS.blockEntry) },
    });
    result = readResult(response.value, w, h, d);
  } catch (err) {
    diagnostics.push(failureDiagnostic(err, programId, nodePath, index));
    return failed(input, ops.length, logs, diagnostics, meter.spent, clipped);
  }

  if (clipped > 0 && clipped > (ops.length + clipped) * PROGRAM_LIMITS.clipTolerance) {
    diagnostics.push(
      warning(
        "PROGRAM_WRITES_CLIPPED",
        nodePath,
        `instance ${index} of ${JSON.stringify(programId)} wrote ${clipped} of ${ops.length + clipped} blocks outside its declared envelope [${w}, ${h}, ${d}]`,
        "widen the declared envelope, or clamp the program's own bounds — a program that spills is a program whose envelope is wrong",
      ),
    );
    // Suspended (Kai, 2026-08-15, "for now"): over-clipping is recorded, not
    // fatal — see SUSPENDED_GATE_CHECKS. The clipping itself is unchanged:
    // writes outside the envelope still never land.
    if (!SUSPENDED_GATE_CHECKS.envelopeClip) {
      return failed(input, ops.length, logs, diagnostics, meter.spent, clipped);
    }
  }

  const opStream = canonicalOpStream(ops, result);
  return {
    ok: true,
    programId,
    index,
    ops,
    voxels,
    result,
    opStream,
    outputHash: opStreamHash(opStream),
    fuelUsed: meter.spent,
    writes: ops.length,
    clipped,
    logs,
    diagnostics,
  };
}

function failed(
  input: ProgramRunInput,
  writes: number,
  logs: readonly string[],
  diagnostics: readonly LoamDiagnostic[],
  fuelUsed: number,
  clipped: number,
): ProgramRun {
  return {
    ok: false,
    programId: input.programId,
    index: input.index,
    ops: [],
    voxels: new Map(),
    opStream: "",
    outputHash: "",
    fuelUsed,
    writes,
    clipped,
    logs,
    diagnostics,
  };
}

function failureDiagnostic(
  err: unknown,
  programId: string,
  nodePath: string,
  index: number,
): LoamDiagnostic {
  if (err instanceof FuelExhausted || err instanceof BudgetExceeded) {
    return error(
      "PROGRAM_BUDGET_EXCEEDED",
      nodePath,
      `instance ${index} of ${JSON.stringify(programId)}: ${err.message}`,
      "compute less, or write less: the instance is dropped whole rather than half-built, so the budget is the shape of the program, not a suggestion",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return error(
    "PROGRAM_GATE_FAILED",
    nodePath,
    `instance ${index} of ${JSON.stringify(programId)} threw: ${message}`,
    "the program must run to completion for every instance index it is given; guard the edges instead of throwing",
  );
}

/** Validate the program's return value. A malformed one fails the instance. */
function readResult(value: unknown, w: number, h: number, d: number): ProgramResult {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("a program must return { name, seatY }");
  }
  const obj = value as Record<string, unknown>;
  const name = obj["name"];
  const seatY = obj["seatY"];
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("the returned `name` must be a non-empty string");
  }
  if (typeof seatY !== "number" || !Number.isInteger(seatY) || seatY < 0 || seatY >= h) {
    throw new TypeError(`the returned \`seatY\` must be a whole number in 0..${h - 1}`);
  }
  const anchorsIn = obj["anchors"];
  let anchors: Record<string, readonly [number, number, number]> | undefined;
  if (anchorsIn !== undefined) {
    if (typeof anchorsIn !== "object" || anchorsIn === null) {
      throw new TypeError("`anchors` must be an object of name → [x, y, z]");
    }
    anchors = {};
    for (const [key, point] of Object.entries(anchorsIn as Record<string, unknown>)) {
      if (!Array.isArray(point) || point.length !== 3 || point.some((v) => typeof v !== "number")) {
        throw new TypeError(`anchor ${JSON.stringify(key)} is not [x, y, z]`);
      }
      const [ax, ay, az] = (point as number[]).map((v) => Math.floor(v)) as [number, number, number];
      if (ax < 0 || ay < 0 || az < 0 || ax >= w || ay >= h || az >= d) {
        throw new TypeError(`anchor ${JSON.stringify(key)} lies outside the declared envelope`);
      }
      anchors[key] = [ax, ay, az];
    }
  }
  const interiors = readInteriors(obj["interiors"], w, h, d);
  return {
    name,
    seatY,
    ...(anchors === undefined ? {} : { anchors }),
    ...(interiors === undefined ? {} : { interiors }),
  };
}

/**
 * Validate the rooms a program says it hollowed.
 *
 * Only the shape is checked here — integer boxes, inside the envelope, big
 * enough to stand in, and not too many. Whether the program actually emptied
 * them is the fit-out's problem: it furnishes the cells that are free and
 * supported, so a lie about a solid volume costs furniture, not correctness.
 */
function readInteriors(
  value: unknown,
  w: number,
  h: number,
  d: number,
): readonly InteriorVolume[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError("`interiors` must be an array of { min, max } volumes");
  }
  if (value.length > INTERIOR_LIMITS.maxCount) {
    throw new TypeError(
      `at most ${INTERIOR_LIMITS.maxCount} interiors may be declared; got ${value.length}`,
    );
  }
  const out: InteriorVolume[] = [];
  const bounds = [w, h, d];
  for (const [i, raw] of (value as unknown[]).entries()) {
    if (typeof raw !== "object" || raw === null) {
      throw new TypeError(`interior ${i} is not { min, max }`);
    }
    const corners: [number, number, number][] = [];
    for (const key of ["min", "max"] as const) {
      const point = (raw as Record<string, unknown>)[key];
      if (
        !Array.isArray(point) ||
        point.length !== 3 ||
        point.some((v) => typeof v !== "number" || !Number.isInteger(v))
      ) {
        throw new TypeError(`interior ${i}: \`${key}\` must be whole [x, y, z]`);
      }
      corners.push(point as [number, number, number]);
    }
    const [min, max] = corners as [[number, number, number], [number, number, number]];
    for (let axis = 0; axis < 3; axis++) {
      const lo = min[axis] as number;
      const hi = max[axis] as number;
      if (lo < 0 || hi >= (bounds[axis] as number)) {
        throw new TypeError(`interior ${i} lies outside the declared envelope`);
      }
      if (hi - lo + 1 < INTERIOR_LIMITS.minEdge) {
        throw new TypeError(
          `interior ${i} is thinner than ${INTERIOR_LIMITS.minEdge} blocks on one axis; there is nothing to furnish in it`,
        );
      }
    }
    // The floor plane the program laid sits one below `min.y`, so an interior
    // seated at y = 0 has no floor under it at all.
    if ((min[1] as number) < 1) {
      throw new TypeError(
        `interior ${i} starts at y = ${min[1]}; \`min.y\` is the lowest standable cell, so the floor beneath it must be inside the envelope`,
      );
    }
    const kind = (raw as Record<string, unknown>)["kind"];
    if (kind !== undefined && (typeof kind !== "string" || kind.length === 0)) {
      throw new TypeError(`interior ${i}: \`kind\` must be a non-empty word`);
    }
    out.push(kind === undefined ? { min, max } : { min, max, kind });
  }
  return out;
}

/**
 * Running one instance of an authored program.
 *
 * This is where the contract's guarantees are actually enforced: the API the
 * program sees, the seed its randomness comes from, the envelope its writes
 * are confined to, and the budgets that stop it. Everything above this file
 * (the landmark path, the scatter path, the gate) is composition.
 *
 * **An instance is all-or-nothing.** A budget trip, a thrown exception, a
 * malformed return value or too many clipped writes drops the whole instance —
 * never half of one. A half-written landmark is exactly the failure the
 * physics lint exists to catch, and it is far cheaper to refuse it here.
 */

import {
  PROGRAM_LIMITS,
  type AuthoredProgramRecord,
  type ProgramApi,
  type ProgramResult,
  type LoamDiagnostic,
} from "@terrainist/spec";
import { error, warning } from "@terrainist/spec";
import { Rng, nodeSeed, positionDigest, streamSeed, type Seed256 } from "@terrainist/stdlib";

import { BudgetExceeded, FUEL_COSTS, FuelExhausted, FuelMeter, instrumentFuel } from "./fuel.js";
import { canonicalOpStream, opStreamHash, normalizeSource, sourceHashOf, type ProgramOp } from "./hash.js";
import { getProgramExecutor, rewriteExports } from "./sandbox.js";

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
    return failed(input, ops.length, logs, diagnostics, meter.spent, clipped);
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
  return anchors === undefined ? { name, seatY } : { name, seatY, anchors };
}

/**
 * The conformance suite: five pieces of ground, and a verdict about whether a
 * program stood on them.
 *
 * `docs/GROUND-UNIFICATION-v0.md` §2.3–§2.6 is normative for this file. The
 * shift it serves is *pad under a prefab* → *conform by default*: a program
 * that reads `api.heightAt` and answers it gets the real terrain of the site it
 * landed on, and a program that writes the same sole on every column keeps
 * today's platform. Which of the two a program is cannot be asked of its
 * source, so it is **measured**: the same program is run against a fixed set of
 * synthetic grounds and its lowest blocks are compared with them.
 *
 * Three properties this file is built around:
 *
 * 1. **No trigonometry, no roots — no floating point at all.** Every sampler is
 *    a pure integer function of `(x, z)` over a `w × d` footprint.
 *    `verifyOutputHash`'s whole purpose is to turn a host whose `Math.sin`
 *    differs in the last bit into a loud error; a suite built on `Math.sin`
 *    would *manufacture* exactly that error on the hosts it exists to protect.
 *    `test/program-conform.test.ts` greps this file to keep it that way.
 * 2. **The set is pinned.** Adding or reordering a member changes
 *    `conformHash` for every program that carries one, which is a re-authoring
 *    event and not a patch.
 * 3. **The suite is single-run.** The double run — the witness for
 *    order-dependence — stays on `flat` alone, in `gateDoubleRun`. A program
 *    whose iteration order is unstable is unstable on flat ground too, so the
 *    witness is the *code*, not the terrain. Five members × two realms would
 *    take the gate from 6 executions to 30, each fuel-bounded at 20 M steps,
 *    and buy nothing. It runs one instance per member: 6 + 5 = 11.
 *
 * Nothing here fails a program. §2.5: `conforms: false` is a routing decision
 * (the instance is seated `pad` and built exactly as it is today), never a
 * gate failure — which is why the finding is `LOAM-W340` and why the verdict
 * rides on the record as an optional field.
 */

import type { AuthoredProgramRecord } from "@terrainist/spec";

import { opStreamHash } from "./hash.js";
import { runProgramInstance, type HeightSampler, type ProgramRun } from "./run.js";

/**
 * Node-local ground under one column, measured from the seat plane: `0` where
 * the ground meets it, negative where it falls away.
 */
export type ConformSampler = HeightSampler;

/** One member of the pinned suite. */
export interface ConformMember {
  /** Stable id. Part of no hash, but printed in every finding. */
  readonly id: string;
  /** One line on what the member tests, for the report and the docs. */
  readonly about: string;
  /** Build the member's sampler for a `w × d` footprint. Integer-pure. */
  readonly ground: (w: number, d: number) => ConformSampler;
}

/** `|v|`, without reaching for `Math` — see the file header's property 1. */
function abs(v: number): number {
  return v < 0 ? -v : v;
}

/**
 * A drop of `n` blocks, as a height. `n = 0` returns `+0` rather than `-0`:
 * negative zero is arithmetically harmless and reads as a bug in every test
 * and every printed finding it ever reaches.
 */
function fall(n: number): number {
  return n <= 0 ? 0 : -n;
}

/** The depth the `shore` member's bank bottoms out at. */
export const SHORE_FLOOR = -12;

/**
 * The pinned five. Order is part of `conformHash`.
 *
 * Chosen so that each of prompt rule 6's four answers — legs, skirt, plinth,
 * foundation course — is exercised by at least one member, and so that a
 * program that hard-codes a flat sole is caught by at least three.
 */
export const CONFORM_SUITE: readonly ConformMember[] = Object.freeze([
  Object.freeze({
    id: "flat",
    about: "today's behaviour; the identity member, and the rigid-sole reference",
    ground: (): ConformSampler => (): number => 0,
  }),
  Object.freeze({
    id: "slope10",
    about: "a gentle fall to local south",
    ground: (): ConformSampler => (_x: number, z: number): number => fall(((z * 18) / 100) | 0),
  }),
  Object.freeze({
    id: "slope20",
    about: "a real hillside",
    ground: (): ConformSampler => (_x: number, z: number): number => fall(((z * 36) / 100) | 0),
  }),
  Object.freeze({
    id: "ridge",
    about: "a crest under the middle, falling both ways",
    ground: (w: number): ConformSampler => {
      const crest = w >> 1;
      return (x: number): number => fall(abs(x - crest) >> 1);
    },
  }),
  Object.freeze({
    id: "shore",
    about: "a bank into water",
    ground: (_w: number, d: number): ConformSampler => {
      const edge = d >> 1;
      return (_x: number, z: number): number => {
        if (z < edge) return 0;
        const drop = 2 * (z - edge);
        return drop > -SHORE_FLOOR ? SHORE_FLOOR : fall(drop);
      };
    },
  }),
]);

/**
 * How much of an instance may hang in the air before it stops conforming.
 *
 * A tenth, deliberately loose: a spire's finial, a gargoyle and a bridge span
 * are all "floating" by this measure and all correct. What the tolerance is
 * sized to catch is a *sole* that ignored the ground, not an ornament.
 */
export const CONFORM_FLOAT_TOLERANCE = 0.1;

/** Blocks that occupy nothing. A column of these is not a column. */
const AIR = new Set(["air", "cave_air", "void_air"]);

function isOccupied(block: string): boolean {
  return !AIR.has(block.replace(/^minecraft:/, "").replace(/\[.*$/, ""));
}

/** What the suite found about one member. */
export interface ConformMemberFinding {
  readonly id: string;
  /** `false` when the instance failed to execute on this ground at all. */
  readonly ok: boolean;
  /** Columns the instance occupies. */
  readonly occupiedColumns: number;
  /** Columns whose lowest block is more than 1 above the ground: daylight. */
  readonly floating: number;
  /** Columns whose highest block is at or below the ground: inside the hill. */
  readonly buried: number;
  /**
   * The multiset of per-column lowest blocks is identical to `flat`'s — the
   * program did not read `api.heightAt` at all. Never set on `flat` itself,
   * which *is* the reference.
   */
  readonly rigidSole: boolean;
  /** This member's own verdict. */
  readonly conforms: boolean;
}

/** What {@link conformanceOf} decided. */
export interface ConformanceResult {
  /** Every member executed. */
  readonly ok: boolean;
  /** §2.4's verdict: every member conforms. */
  readonly conforms: boolean;
  /**
   * `b3:` digest over the concatenated canonical op streams of the suite runs,
   * in suite order. `""` when a member failed to execute.
   */
  readonly conformHash: string;
  readonly members: readonly ConformMemberFinding[];
}

/** Everything {@link conformanceOf} reads. */
export interface ConformanceInput {
  readonly programId: string;
  readonly program: AuthoredProgramRecord;
  readonly worldSeed: bigint;
  /** The verification node path — supplied by the caller so this file owns no gate constant. */
  readonly nodePath: string;
  /** The instance count the run set is drawn from. */
  readonly count: number;
  /** Which instance to measure. Default `0`. */
  readonly index?: number;
}

/**
 * Run a program once against each suite member and score it.
 *
 * The comparison is made in **node-local** coordinates, which is why `seatY`
 * appears: `api.heightAt` is measured from the seat plane, and the program
 * declares where that plane sits inside its own envelope. Ground under column
 * `(x, z)`, node-local, is therefore `seatY + h(x, z)` — which collapses to
 * `h(x, z)` for the overwhelming majority of programs, whose `seatY` is 0.
 */
export function conformanceOf(input: ConformanceInput): ConformanceResult {
  const { programId, program, worldSeed, nodePath, count } = input;
  const index = input.index ?? 0;
  const [w, , d] = program.envelope;

  const members: ConformMemberFinding[] = [];
  const streams: string[] = [];
  let flatSole: string | undefined;

  for (const member of CONFORM_SUITE) {
    const run = runProgramInstance({
      programId,
      program,
      nodePath,
      worldSeed,
      index,
      count,
      heightAt: member.ground(w, d),
    });
    if (!run.ok) {
      members.push({
        id: member.id,
        ok: false,
        occupiedColumns: 0,
        floating: 0,
        buried: 0,
        rigidSole: false,
        conforms: false,
      });
      return { ok: false, conforms: false, conformHash: "", members };
    }
    streams.push(run.opStream);
    const measured = measure(run, member.ground(w, d));
    const rigidSole = member.id !== "flat" && flatSole !== undefined && measured.sole === flatSole;
    if (member.id === "flat") flatSole = measured.sole;
    const floats = measured.occupiedColumns === 0
      ? 0
      : measured.floating / measured.occupiedColumns;
    members.push({
      id: member.id,
      ok: true,
      occupiedColumns: measured.occupiedColumns,
      floating: measured.floating,
      buried: measured.buried,
      rigidSole,
      conforms: !rigidSole && floats <= CONFORM_FLOAT_TOLERANCE,
    });
  }

  return {
    ok: true,
    conforms: members.every((m) => m.conforms),
    conformHash: opStreamHash(streams.join("")),
    members,
  };
}

interface Measured {
  readonly occupiedColumns: number;
  readonly floating: number;
  readonly buried: number;
  /** Canonical form of the multiset of per-column lowest blocks. */
  readonly sole: string;
}

/**
 * Score one run against the ground it was given.
 *
 * `buried` is measured and reported and deliberately does **not** enter the
 * verdict: burial is the compiler's problem (§2.9's carve), not the author's,
 * because a program cannot cut.
 */
function measure(run: ProgramRun, ground: ConformSampler): Measured {
  const seatY = run.result?.seatY ?? 0;
  const lows = new Map<string, number>();
  const highs = new Map<string, number>();
  for (const [key, block] of run.voxels) {
    if (!isOccupied(block)) continue;
    const comma = key.indexOf(",");
    const second = key.indexOf(",", comma + 1);
    const x = Number(key.slice(0, comma));
    const y = Number(key.slice(comma + 1, second));
    const z = Number(key.slice(second + 1));
    const column = `${x},${z}`;
    const lo = lows.get(column);
    if (lo === undefined || y < lo) lows.set(column, y);
    const hi = highs.get(column);
    if (hi === undefined || y > hi) highs.set(column, y);
  }

  let floating = 0;
  let buried = 0;
  const soles: number[] = [];
  for (const [column, lo] of lows) {
    const comma = column.indexOf(",");
    const x = Number(column.slice(0, comma));
    const z = Number(column.slice(comma + 1));
    const g = seatY + ground(x, z);
    if (lo > g + 1) floating++;
    if ((highs.get(column) as number) <= g) buried++;
    soles.push(lo);
  }
  soles.sort((a, b) => a - b);
  return { occupiedColumns: lows.size, floating, buried, sole: soles.join(",") };
}

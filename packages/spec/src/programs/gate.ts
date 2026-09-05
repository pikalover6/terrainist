/**
 * The seam between program **authoring** and program **verification**.
 *
 * The authoring side (packages/agents) decides *what* bespoke programs a
 * world wants and writes them; `packages/compiler/src/programs/` decides
 * whether a program is allowed to exist. The five-step gate lives on the
 * compiler side, and the authoring loop reaches it through exactly one
 * injected interface: {@link ProgramVerificationGate}.
 *
 * The interface is deliberately tiny and diagnostic-shaped. Everything the
 * repair loop needs from the gate is "here are the problems, in the same
 * `LoamDiagnostic` records the compiler already produces" — the loop hands
 * them back to the model verbatim and never interprets them. That is what
 * keeps the two tracks independently buildable: a stub gate satisfies the
 * authoring tests, and the real gate drops in unchanged.
 *
 * This module is the single supported contract. It depends only on spec
 * types and `LoamDiagnostic`; it knows nothing about the compiler, Minecraft,
 * or the model.
 */

import type { LoamDiagnostic } from "../terrain/diagnostics.js";
import type { ProgramMode } from "./types.js";

/** A program submitted for verification — source text plus how it is invoked. */
export interface ProgramSubmission {
  /** The document-level `programs` map key, e.g. `"ufo_lander"`. */
  readonly id: string;
  /** How the document is allowed to invoke it. */
  readonly mode: ProgramMode;
  /** Node-local `[w, h, d]` the program declares it needs. */
  readonly envelope: readonly [number, number, number];
  /** The program text. ≤ 64 KiB per the contract. */
  readonly source: string;
}

/** The world facts a gate needs to run a program the way the compile will. */
export interface ProgramDocContext {
  /** The document's world seed — the per-instance seeds derive from it. */
  readonly worldSeed: number | string;
  /** Region edge length in blocks; the budget rule reads it too. */
  readonly size: number;
  /** The world prompt, for diagnostics a human will read. */
  readonly prompt?: string;
}

/**
 * The verification gate, as the authoring loop sees it.
 *
 * `verify` is total: it never throws for a bad program, it *reports* one. An
 * empty array means the submission passed every step of the contract's gate.
 */
export interface ProgramVerificationGate {
  verify(
    programs: readonly ProgramSubmission[],
    docContext: ProgramDocContext,
  ): Promise<readonly LoamDiagnostic[]>;
  /**
   * Canonical op-stream hash for a program that has already passed `verify`.
   *
   * Optional because it is meaningless for a stub: a gate that cannot execute
   * a program cannot hash its output, and the authoring loop records
   * `outputHash: undefined` rather than inventing one. The real gate always
   * implements it, and Phase 3's acceptance — recompiling a frozen document
   * byte-identically — needs it to.
   */
  outputHash?(
    program: ProgramSubmission,
    docContext: ProgramDocContext,
  ): Promise<string>;
  /**
   * Everything the authoring loop freezes into the document's record for a
   * program that has already passed `verify` — the op-stream hash *and* the
   * conformance verdict the gate's §2.4 step produced.
   *
   * Optional for the same reason {@link outputHash} is: a stub cannot execute.
   * When a gate implements this the loop prefers it over `outputHash`, so the
   * real gate pays for one verification pass rather than two.
   */
  freeze?(
    program: ProgramSubmission,
    docContext: ProgramDocContext,
  ): Promise<ProgramFreezeFields>;
}

/**
 * The record fields a gate hands back for freezing.
 *
 * `conforms` and `conformHash` travel together or not at all: a gate that did
 * not reach the conformance step reports neither, and the record stays as it
 * was before the step existed (seated `pad`). `conforms: false` *with* a hash
 * is a real verdict — judged, and judged not to follow the ground.
 */
export interface ProgramFreezeFields {
  readonly outputHash?: string;
  readonly conforms?: boolean;
  readonly conformHash?: string;
}

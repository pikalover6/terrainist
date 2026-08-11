/**
 * Phase 3, the other half of the invocation gap: **a program the tree calls
 * for that the document does not carry**.
 *
 * `program-wiring.ts` closes the gap in one direction — a program frozen into
 * the map that no node invokes. This module closes it in the other, which is
 * the failure production battery P5 actually shipped:
 *
 * > Luna requested two bespoke programs; `sea_monster` failed program authoring
 * > (three gate rounds, dropped with a note), the document's `scatter.program@0`
 * > node went on naming it, the compile shipped legally with
 * > `LOAM-W337 PROGRAM_DROPPED`, and nothing retried. The prompt's central
 * > plural was lost to one bad roll.
 *
 * The recovery is deliberately small, and deliberately not a loop:
 *
 * - **One retry per id, ever.** A program that fails its full authoring run
 *   twice — each run being its own gate plus the ordinary
 *   {@link MAX_PROGRAM_ROUNDS} repair rounds — stays dropped, and the world
 *   ships with the existing `PROGRAM_DROPPED` diagnostic. The caller carries
 *   the `alreadyAttempted` set across both call sites, so the second pass after
 *   a wiring revision retries only ids the first pass never saw.
 * - **Referenced only.** A program that is absent *and* unreferenced is not a
 *   gap; it is a program the world decided it did not want. Nothing is spent.
 * - **The budget stop still governs.** Recovery runs through
 *   {@link authorPrograms} with explicit requests, so the per-world spend stop
 *   is checked before each call exactly as it is on the first pass.
 *
 * Nothing here touches the compiler. A recovered program is frozen into the
 * document by the same gate-then-hash path as any other, so the compile
 * downstream is the same pure function it was.
 */

import {
  attachPrograms,
  authorPrograms,
  collectProgramRequests,
  type AuthorProgramsResult,
  type AuthoredProgramEntry,
  type ProgramRequest,
} from "./program-author.js";
import { collectProgramInvocations } from "./program-wiring.js";
import type { ProgramMode, ProgramVerificationGate } from "./program-gate.js";
import type { FetchLike, Usage } from "./openrouter.js";

/** A program some node invokes that the document's `programs` map lacks. */
export interface MissingProgram {
  /** The id as the tree names it. */
  readonly id: string;
  /** How the tree invokes it — `both` when it is named in both forms. */
  readonly mode: ProgramMode;
  /** The brief the document asked for it with, when one is still recoverable. */
  readonly brief?: string;
  /** The envelope the original request suggested, when one is recoverable. */
  readonly envelope?: readonly [number, number, number];
  /** Plugin mode only: the instance count the original request asked for. */
  readonly count?: number;
}

/**
 * Every program id the node tree invokes that `programs` does not carry.
 *
 * The exact inverse of {@link findOrphanPrograms}, and just as structural: the
 * node tree is walked for `authored:<id>` generators and `scatter.program@0`
 * params, and anything named there without a matching map entry is a gap. No
 * model is asked whether the reference looked intentional.
 */
export function findMissingPrograms(
  doc: unknown,
  programs: Readonly<Record<string, AuthoredProgramEntry>>,
): readonly MissingProgram[] {
  const invoked = collectProgramInvocations(doc);
  const requests = new Map(collectProgramRequests(doc).map((r) => [r.id, r] as const));

  const ids: string[] = [];
  for (const id of invoked.landmark) ids.push(id);
  for (const id of invoked.plugin) if (!invoked.landmark.has(id)) ids.push(id);
  ids.sort();

  const out: MissingProgram[] = [];
  for (const id of ids) {
    if (programs[id] !== undefined) continue;
    const asLandmark = invoked.landmark.has(id);
    const asPlugin = invoked.plugin.has(id);
    const mode: ProgramMode = asLandmark && asPlugin ? "both" : asPlugin ? "plugin" : "landmark";
    const request = requests.get(id);
    out.push({
      id,
      mode,
      ...(request?.brief === undefined ? {} : { brief: request.brief }),
      ...(request?.envelope === undefined ? {} : { envelope: request.envelope }),
      ...(request?.count === undefined ? {} : { count: request.count }),
    });
  }
  return out;
}

/**
 * The requests a recovery pass should make: the missing-and-referenced
 * programs, minus every id already given its one retry.
 *
 * Pure and cheap — this is the decision the pipeline tests pin. A missing
 * program with no recoverable brief still gets one, written from its id and
 * how the tree invokes it, because a scatter node naming `sea_monster` says
 * enough to try again.
 */
export function planProgramRecovery(
  doc: unknown,
  programs: Readonly<Record<string, AuthoredProgramEntry>>,
  alreadyAttempted: ReadonlySet<string> = new Set(),
): readonly ProgramRequest[] {
  const out: ProgramRequest[] = [];
  for (const missing of findMissingPrograms(doc, programs)) {
    if (alreadyAttempted.has(missing.id)) continue;
    out.push({
      id: missing.id,
      mode: missing.mode,
      brief:
        missing.brief ??
        `The world's node tree invokes a program called "${missing.id}" that does not exist yet. ` +
          `Write it: infer what it must be from the world prompt, the world context and the name itself.`,
      ...(missing.envelope === undefined ? {} : { envelope: missing.envelope }),
      ...(missing.count === undefined ? {} : { count: missing.count }),
      source: "document",
    });
  }
  return out;
}

/** Request for {@link recoverMissingPrograms}. */
export interface ProgramRecoveryRequest {
  /** The document as it stands, programs already attached. */
  readonly doc: unknown;
  /** The frozen programs map so far. Anything recovered is merged into it. */
  readonly programs: Readonly<Record<string, AuthoredProgramEntry>>;
  readonly prompt: string;
  readonly worldSeed: number | string;
  readonly size: number;
  readonly gate: ProgramVerificationGate;
  /** Ids that have already had their one retry; never retried again. */
  readonly alreadyAttempted?: ReadonlySet<string>;
  /** World context handed to the writer verbatim — usually the resolved intent. */
  readonly context?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  /** What is left of the per-world bespoke spend stop, in USD. */
  readonly budgetUsd?: number;
  readonly fetchImpl?: FetchLike;
  readonly apiKey?: string;
}

/** What {@link recoverMissingPrograms} did. */
export interface ProgramRecoveryResult {
  /** The document to carry on with — recovered programs attached, or as given. */
  readonly doc: unknown;
  /** The merged programs map. Identical to the input when nothing was written. */
  readonly programs: Readonly<Record<string, AuthoredProgramEntry>>;
  /** The gaps this pass found and tried to close. Empty means nothing spent. */
  readonly attempted: readonly ProgramRequest[];
  /** Ids that came back gate-clean this time. */
  readonly recovered: readonly string[];
  /** Ids that failed a second time; they stay dropped, with the W337 warning. */
  readonly stillMissing: readonly string[];
  /**
   * Every id this pass tried, unioned with the ids handed in — ready to be
   * carried straight into the next call's `alreadyAttempted`.
   */
  readonly attemptedIds: ReadonlySet<string>;
  /** The authoring run, when one happened. */
  readonly run?: AuthorProgramsResult;
  readonly usage: Usage;
}

const NO_USAGE: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/**
 * Give every referenced-but-absent program exactly one fresh authoring attempt.
 *
 * Total, like every other phase here: a recovery that fails leaves the document
 * exactly as it was, and the world ships with `PROGRAM_DROPPED` as before.
 */
export async function recoverMissingPrograms(
  request: ProgramRecoveryRequest,
): Promise<ProgramRecoveryResult> {
  const already = new Set(request.alreadyAttempted ?? []);
  const attempted = planProgramRecovery(request.doc, request.programs, already);
  if (attempted.length === 0) {
    return {
      doc: request.doc,
      programs: request.programs,
      attempted,
      recovered: [],
      stillMissing: [],
      attemptedIds: already,
      usage: NO_USAGE,
    };
  }

  const attemptedIds = new Set(already);
  for (const item of attempted) attemptedIds.add(item.id);

  const run = await authorPrograms({
    prompt: request.prompt,
    worldSeed: request.worldSeed,
    size: request.size,
    gate: request.gate,
    requests: attempted,
    ...(request.context === undefined ? {} : { context: request.context }),
    ...(request.model === undefined ? {} : { model: request.model }),
    ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }),
    ...(request.budgetUsd === undefined ? {} : { budgetUsd: request.budgetUsd }),
    ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
    ...(request.apiKey === undefined ? {} : { apiKey: request.apiKey }),
  });

  const recovered = Object.keys(run.programs).sort();
  const merged: Readonly<Record<string, AuthoredProgramEntry>> =
    recovered.length === 0 ? request.programs : { ...request.programs, ...run.programs };
  const stillMissing = attempted.map((r) => r.id).filter((id) => run.programs[id] === undefined);

  return {
    doc: recovered.length === 0 ? request.doc : attachPrograms(request.doc, run.programs),
    programs: merged,
    attempted,
    recovered,
    stillMissing,
    attemptedIds,
    run,
    usage: run.usage,
  };
}

/** The run-log block for a recovery pass, in the register of the other phases. */
export function formatProgramRecovery(result: ProgramRecoveryResult): string {
  if (result.attempted.length === 0) return "";
  const lines = [
    `recovery   ${result.attempted.length} program(s) referenced by the tree but missing ` +
      `from the document — one retry each: ${result.attempted.map((r) => `${r.id} [${r.mode}]`).join(", ")}`,
  ];
  for (const id of result.recovered) lines.push(`  ok     ${id}  — recovered on retry`);
  for (const id of result.stillMissing) {
    lines.push(`  drop   ${id}  — failed twice; the world ships with LOAM-W337 PROGRAM_DROPPED`);
  }
  const { usage } = result;
  lines.push(
    `  tokens     ${usage.promptTokens} in + ${usage.completionTokens} out = ${usage.totalTokens}` +
      `${usage.cost === undefined ? "" : `  ($${usage.cost.toFixed(4)})`}`,
  );
  return lines.join("\n");
}

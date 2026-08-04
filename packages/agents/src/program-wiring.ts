/**
 * Phase 3, the last mile: **making sure the document actually invokes the
 * programs that were written for it**.
 *
 * `authorPrograms` freezes a gate-passed program into the document's `programs`
 * map. Nothing, until this module, made the *node tree* refer to it. The
 * invasion-p1 run is the reference failure and the reason this file exists:
 * two programs — `mothership` (landmark) and `ufo` (plugin) — passed the gate,
 * were frozen into the map, and no node in the tree named either of them. The
 * document authored placeholder `prop.place@0` nodes for the same two concepts
 * instead, so the world compiled cleanly and shipped without a single block of
 * the bespoke content it had paid two model calls for.
 *
 * The fix has two halves, and this one is the back stop:
 *
 * 1. **Front door** — the kit's §9e now says, in as many words, that a request
 *    for a program is also a promise to author the node that invokes it. That
 *    is free; a revision round is not.
 * 2. **Back stop, here** — after program authoring, {@link findOrphanPrograms}
 *    asks the plain structural question *does any node invoke this?* and, for
 *    the ones where the answer is no, {@link reviseForProgramWiring} spends
 *    **one** focused revision turn through the ordinary
 *    {@link reviseLoamDoc} machinery.
 *
 * Two invariants hold the shape of this file:
 *
 * - **Idempotent.** A document that already invokes everything costs zero
 *   calls, and so does a document with no programs at all. The check is pure
 *   structure — no model is asked whether the wiring looks right.
 * - **Total.** A revision that will not validate, twice, leaves the document
 *   exactly as it was and prints a warning naming the orphans. The world
 *   always ships; a missing landmark is a worse world, not a failed run.
 */

import {
  PROGRAM_SCATTER_GENERATOR,
  allowsLandmark,
  allowsPlugin,
  authoredProgramId,
  type ProgramMode,
} from "@terrainist/spec";

import { AuthoringFailedError, reviseLoamDoc, type AuthorResult } from "./author.js";
import { collectProgramRequests, type AuthoredProgramEntry } from "./program-author.js";
import type { ChatMessage, FetchLike, Usage } from "./openrouter.js";
import type { KitName } from "./kit.js";

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/** How a program's id can appear in a node tree. */
export interface ProgramInvocations {
  /** Ids named by an `authored:<id>` generator. */
  readonly landmark: ReadonlySet<string>;
  /** Ids named by a `scatter.program@0` node's `params.program`. */
  readonly plugin: ReadonlySet<string>;
}

/**
 * Collect every program id the tree invokes, by mode.
 *
 * Structural and tolerant: the document has already validated, but this runs
 * against whatever the model wrote, so a malformed node is ignored rather than
 * thrown. Recursion is over every object value, not a node schema, because the
 * only thing being looked for is a generator string and one param.
 */
export function collectProgramInvocations(doc: unknown): ProgramInvocations {
  const landmark = new Set<string>();
  const plugin = new Set<string>();
  walkInvocations(doc, landmark, plugin);
  return { landmark, plugin };
}

function walkInvocations(value: unknown, landmark: Set<string>, plugin: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) walkInvocations(item, landmark, plugin);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const generator = record["generator"];
  const authored = authoredProgramId(generator);
  if (authored !== undefined) landmark.add(authored);
  if (generator === PROGRAM_SCATTER_GENERATOR) {
    const params = record["params"];
    const named = (params as Record<string, unknown> | undefined)?.["program"];
    // `program` is the real param name — see `ProgramScatterParams` in
    // packages/spec/src/programs/types.ts. Not `programId`.
    if (typeof named === "string" && named !== "") plugin.add(named);
  }
  for (const child of Object.values(record)) walkInvocations(child, landmark, plugin);
}

/** A program the document holds but never invokes. */
export interface OrphanProgram {
  readonly id: string;
  readonly mode: ProgramMode;
  readonly envelope: readonly [number, number, number];
  /** The brief the document asked for it with, when one is still recoverable. */
  readonly brief?: string;
}

/**
 * Programs in `programs` that no node in `doc` invokes.
 *
 * A `both`-mode program counts as invoked if **either** form names it: the
 * document chose which way to use it, and asking for the other is meddling.
 */
export function findOrphanPrograms(
  doc: unknown,
  programs: Readonly<Record<string, AuthoredProgramEntry>>,
): readonly OrphanProgram[] {
  const ids = Object.keys(programs);
  if (ids.length === 0) return [];
  const invoked = collectProgramInvocations(doc);
  const briefs = new Map(collectProgramRequests(doc).map((r) => [r.id, r.brief] as const));

  const orphans: OrphanProgram[] = [];
  for (const id of ids) {
    const entry = programs[id];
    if (entry === undefined) continue;
    const wanted =
      (allowsLandmark(entry.mode) && invoked.landmark.has(id)) ||
      (allowsPlugin(entry.mode) && invoked.plugin.has(id));
    if (wanted) continue;
    const brief = briefs.get(id);
    orphans.push({
      id,
      mode: entry.mode,
      envelope: entry.envelope,
      ...(brief === undefined ? {} : { brief }),
    });
  }
  return orphans;
}

/* -------------------------------------------------------------------------- */
/* The revision turn                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The wiring feedback, as the model sees it.
 *
 * It teaches the two invocation syntaxes rather than assuming the kit is still
 * in the context window verbatim, and it says the one thing the invasion-p1
 * document got wrong: a placeholder authored for the same concept must be
 * **replaced**, not joined by a second node.
 */
export function programWiringFeedback(orphans: readonly OrphanProgram[]): string {
  const lines = [
    `${orphans.length} bespoke program(s) were written for this world, verified, and`,
    `frozen into the document's "programs" map — but no node in the tree invokes`,
    `them, so the world compiles without a single block of them.`,
    ``,
    `The programs that now exist:`,
    ``,
  ];
  for (const orphan of orphans) {
    lines.push(
      `- "${orphan.id}" — mode ${orphan.mode}, envelope [${orphan.envelope.join(", ")}]` +
        `${orphan.brief === undefined ? "" : `\n  brief: ${orphan.brief}`}`,
    );
  }
  lines.push(
    ``,
    `How each mode is invoked:`,
    ``,
    `- LANDMARK — an ordinary generator node whose generator is "authored:<id>",`,
    `  placed by constraints like any other node. It is built once:`,
    ``,
    `  { "id": "the_wreck", "kind": "generator", "generator": "authored:mothership_wreck",`,
    `    "constraints": [ { "zone": "northeast" }, { "distance": { "to": "camp", "max": 90 } } ] }`,
    ``,
    `- PLUGIN — a "scatter.program@0" node whose params name the program in`,
    `  "program". It is built many times, with per-instance variation:`,
    ``,
    `  { "id": "pod_field", "kind": "generator", "generator": "scatter.program@0",`,
    `    "params": { "program": "drop_pod", "count": 18, "area": { "all": true },`,
    `                "spacing": 24, "maxSlope": 20, "avoidTags": ["road", "building"] } }`,
    ``,
    `Wire every program listed above into the tree. If you already authored a`,
    `placeholder node for the same concept — a prop.place@0, a building, a marker`,
    `standing in for the structure — REPLACE that node with the invocation rather`,
    `than adding a second one beside it, and keep its id, its constraints and its`,
    `position in the tree so the rest of the world still refers to it correctly.`,
    `Change nothing else.`,
  );
  return lines.join("\n");
}

/** Request for {@link reviseForProgramWiring}. */
export interface ProgramWiringRequest {
  /** The document as it stands, programs already attached. */
  readonly doc: unknown;
  /** The frozen programs map, re-attached to whatever the revision returns. */
  readonly programs: Readonly<Record<string, AuthoredProgramEntry>>;
  /** The authoring conversation, exactly as {@link reviseLoamDoc} wants it. */
  readonly messages: readonly ChatMessage[];
  readonly worldSeed: number | string;
  readonly size: number;
  readonly kitName?: KitName;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly fetchImpl?: FetchLike;
  readonly apiKey?: string;
  /**
   * Validation attempts inside the one revision turn: the first try, plus one
   * retry with the validator's diagnostics. The task's "retry once".
   */
  readonly maxAttempts?: number;
}

/** Attempts the wiring revision gets: the call, plus one diagnostics retry. */
export const WIRING_MAX_ATTEMPTS = 2;

/** What {@link reviseForProgramWiring} did. */
export interface ProgramWiringResult {
  /** The document to carry on with — revised, or the input unchanged. */
  readonly doc: unknown;
  /** The orphans that triggered the round. Empty means nothing was spent. */
  readonly orphans: readonly OrphanProgram[];
  /** True when a revision was made and validated. */
  readonly revised: boolean;
  /** The revision session, so later compile-feedback rounds continue from it. */
  readonly result?: AuthorResult;
  /** Model spend for this round. Zero-valued when no call was made. */
  readonly usage: Usage;
  /** Present when the round was attempted and failed; ready to print. */
  readonly warning?: string;
}

const NO_USAGE: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/**
 * Close the invocation gap, in at most one revision round.
 *
 * Returns immediately — no call, no usage — when every program is already
 * invoked, which is the overwhelmingly common case and the reason the check is
 * structural rather than a model turn.
 */
export async function reviseForProgramWiring(
  request: ProgramWiringRequest,
): Promise<ProgramWiringResult> {
  const orphans = findOrphanPrograms(request.doc, request.programs);
  if (orphans.length === 0) {
    return { doc: request.doc, orphans, revised: false, usage: NO_USAGE };
  }

  const names = orphans.map((o) => `"${o.id}" [${o.mode}]`).join(", ");
  try {
    const result = await reviseLoamDoc({
      messages: request.messages,
      feedback: programWiringFeedback(orphans),
      previous: JSON.stringify(request.doc),
      worldSeed: request.worldSeed,
      size: request.size,
      maxAttempts: Math.max(1, request.maxAttempts ?? WIRING_MAX_ATTEMPTS),
      ...(request.kitName === undefined ? {} : { kitName: request.kitName }),
      ...(request.model === undefined ? {} : { model: request.model }),
      ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }),
      ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
      ...(request.apiKey === undefined ? {} : { apiKey: request.apiKey }),
    });
    return {
      // The programs map is re-attached: the revision rewrote the tree, and a
      // rewritten tree does not carry a map the model was never shown.
      doc: attachProgramsTo(result.doc, request.programs),
      orphans,
      revised: true,
      result,
      usage: result.usage,
    };
  } catch (err) {
    if (!(err instanceof AuthoringFailedError)) throw err;
    return {
      doc: request.doc,
      orphans,
      revised: false,
      usage: err.usage,
      warning:
        `warning: ${orphans.length} bespoke program(s) are frozen into the document but ` +
        `never invoked — ${names}. The wiring revision did not validate in ` +
        `${err.attempts} attempt(s); the world ships without them.`,
    };
  }
}

/** Local re-attach, kept here so the module has no cycle back into the author. */
function attachProgramsTo<T>(doc: T, programs: Readonly<Record<string, AuthoredProgramEntry>>): T {
  if (Object.keys(programs).length === 0) return doc;
  const existing = (doc as Record<string, unknown>)["programs"];
  return {
    ...(doc as Record<string, unknown>),
    programs: {
      ...(existing !== null && typeof existing === "object" ? (existing as Record<string, unknown>) : {}),
      ...programs,
    },
  } as T;
}

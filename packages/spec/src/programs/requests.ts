/**
 * Bespoke-program **requests** — the half of the contract the authoring model
 * writes first.
 *
 * A program is requested by the node that invokes it, and nowhere else. An
 * `authored:<id>` node carrying `params.brief` asks for a landmark program; a
 * `scatter.program@0` node carrying `params.brief` asks for a plugin program.
 * The programs themselves arrive later, written by the program-author phase,
 * which attaches the `programs` map. So between authoring and that phase a
 * perfectly faithful document names ids that no map carries yet — and every
 * such id has, by construction, a node that invokes it.
 *
 * This module is the single owner of that harvest: the validator uses it to
 * tell a promise from a mistake, and the program author uses it to know what
 * to write.
 */

import type { ProgramMode } from "./types.js";

/** Requested program ids → the mode the request asked for. */
export type PendingPrograms = ReadonlyMap<string, ProgramMode>;

/** One bespoke program the document asks for, harvested from its nodes. */
export interface ProgramRequest {
  /** The `programs` map key and the `authored:<id>` suffix. */
  readonly id: string;
  readonly mode: ProgramMode;
  /** What it should be, in the author's own words. Reaches the prompt. */
  readonly brief: string;
  /** A suggested node-local `[w, h, d]`; the program may declare its own. */
  readonly envelope?: readonly [number, number, number];
  /** Plugin mode only: how many instances the world wants. */
  readonly count?: number;
}

/** Lower-case, underscore-joined, safe as a map key and an `authored:<id>`. */
export function slugProgramId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug === "" ? "program" : slug.slice(0, 48);
}

/**
 * Walk a whole document for the nodes that request a program and return one
 * request per id, in document order. An id invoked both as a landmark and
 * through a scatter is requested with mode `"both"`; the first brief wins.
 */
export function collectProgramRequests(doc: unknown): readonly ProgramRequest[] {
  const found = new Map<string, ProgramRequest>();
  walk(doc, found, new Set());
  return [...found.values()];
}

/** The requested ids and modes alone — what the validator needs. */
export function collectPendingPrograms(doc: unknown): PendingPrograms {
  const out = new Map<string, ProgramMode>();
  for (const request of collectProgramRequests(doc)) out.set(request.id, request.mode);
  return out;
}

function walk(value: unknown, out: Map<string, ProgramRequest>, seen: Set<unknown>): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out, seen);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  const record = value as Record<string, unknown>;
  const request = requestOf(record);
  if (request !== undefined) {
    const existing = out.get(request.id);
    if (existing === undefined) {
      out.set(request.id, request);
    } else if (existing.mode !== request.mode && existing.mode !== "both") {
      out.set(request.id, {
        ...existing,
        mode: "both",
        ...(existing.count === undefined && request.count !== undefined ? { count: request.count } : {}),
        ...(existing.envelope === undefined && request.envelope !== undefined ? { envelope: request.envelope } : {}),
      });
    }
  }
  for (const child of Object.values(record)) walk(child, out, seen);
}

function requestOf(node: Record<string, unknown>): ProgramRequest | undefined {
  const generator = node["generator"];
  if (typeof generator !== "string") return undefined;
  const params = node["params"];
  const p = params !== null && typeof params === "object" ? (params as Record<string, unknown>) : undefined;
  const brief = p?.["brief"];
  if (typeof brief !== "string" || brief.trim() === "") return undefined;

  if (generator.startsWith("authored:")) {
    const id = slugProgramId(generator.slice("authored:".length));
    const envelope = node["envelope"];
    const size =
      envelope !== null && typeof envelope === "object"
        ? (envelope as Record<string, unknown>)["size"]
        : undefined;
    return {
      id,
      mode: "landmark",
      brief,
      ...(isTriple(size) ? { envelope: [size[0], size[1], size[2]] as const } : {}),
    };
  }
  if (generator === "scatter.program@0") {
    const program = p?.["program"];
    if (typeof program !== "string") return undefined;
    const envelope = p?.["envelope"];
    const count = p?.["count"];
    return {
      id: slugProgramId(program),
      mode: "plugin",
      brief,
      ...(isTriple(envelope) ? { envelope: [envelope[0], envelope[1], envelope[2]] as const } : {}),
      ...(typeof count === "number" && Number.isFinite(count) ? { count: Math.max(1, Math.round(count)) } : {}),
    };
  }
  return undefined;
}

function isTriple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
  );
}

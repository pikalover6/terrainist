/**
 * Bespoke-program **requests** — the half of the contract the authoring model
 * writes first.
 *
 * Kit §9e tells the model to put a request for each bespoke program in
 * `intent.character.programs` (an array of `{id, mode, brief, envelope,
 * count}`) *and* to author the invoking node in the same document. The
 * programs themselves arrive later, written by the program-author phase, which
 * attaches the `programs` map. So between authoring and that phase a perfectly
 * faithful document names ids that no map carries yet.
 *
 * This module is the spec-side mirror of `collectProgramRequests` /
 * `normalizeRequests` in `@terrainist/agents` (spec cannot import from agents;
 * the slug and coercion rules are replicated here and must stay in step).
 */

import type { ProgramMode } from "./types.js";

/** Requested program ids → the mode the request asked for. */
export type PendingPrograms = ReadonlyMap<string, ProgramMode>;

/**
 * Lower-case, underscore-joined, safe as a map key and an `authored:<id>`.
 *
 * Mirrors `slugId` in `@terrainist/agents`' program-author.
 */
export function slugProgramId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug === "" ? "program" : slug.slice(0, 48);
}

/**
 * Coerce whatever an `intent.character.programs` field holds into requested
 * `id → mode` pairs, tolerantly: a bare object counts as a one-element array,
 * an entry missing `id` or `brief` is not a request at all (the validator says
 * so separately), and an unrecognised `mode` falls back to `"landmark"` — all
 * exactly as the agents-side normaliser does.
 */
export function normalizePendingPrograms(value: unknown, into: Map<string, ProgramMode>): void {
  const items: unknown[] = Array.isArray(value) ? value : [value];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = record["id"];
    const brief = record["brief"];
    if (typeof id !== "string" || typeof brief !== "string") continue;
    const mode = record["mode"];
    const resolved: ProgramMode = mode === "plugin" || mode === "both" ? mode : "landmark";
    const key = slugProgramId(id);
    if (!into.has(key)) into.set(key, resolved);
  }
}

/**
 * Walk a whole document for `intent.character.programs` at *every* scope — the
 * root's intent, a district's, a node's — and return the requested ids.
 *
 * Same traversal as the agents-side collector: first request for an id wins.
 */
export function collectPendingPrograms(doc: unknown): PendingPrograms {
  const found = new Map<string, ProgramMode>();
  walk(doc, found, new Set());
  return found;
}

function walk(value: unknown, out: Map<string, ProgramMode>, seen: Set<unknown>): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out, seen);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  const record = value as Record<string, unknown>;
  const intent = record["intent"];
  if (intent !== null && typeof intent === "object") {
    const character = (intent as Record<string, unknown>)["character"];
    if (character !== null && typeof character === "object") {
      const programs = (character as Record<string, unknown>)["programs"];
      if (programs !== undefined) normalizePendingPrograms(programs, out);
    }
  }
  for (const child of Object.values(record)) walk(child, out, seen);
}

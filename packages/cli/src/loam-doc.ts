/**
 * Read a Loam 1 document from disk and lower it for the compiler.
 *
 * The CLI speaks Loam 1 only: a file without `"loam": "1"` is refused with the
 * fix, and the lowered document (the compiler's internal representation) is
 * written to disk only when a command asks for it with `--debug-ir`.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { formatDiagnostic, lowerLoam, validateLoam, type LoamDiagnostic } from "@terrainist/spec";
import { PROP_NAMES } from "@terrainist/stdlib";
import type { LoamRegistries } from "@terrainist/spec";

/** The registries the Loam 1 validator resolves `is` against. */
export function loamRegistries(): LoamRegistries {
  return { props: new Set(PROP_NAMES) };
}

/** A Loam 1 document as read from disk, with its lowering. */
export interface LoadedLoamDocument {
  /** The Loam 1 object, as written. */
  readonly loam: Record<string, unknown>;
  /** The lowered document the compiler compiles. */
  readonly doc: Record<string, unknown>;
  /** The document's `name`, or `"world"`. */
  readonly name: string;
}

/** What went wrong reading a document, already rendered for the terminal. */
export class LoamDocumentError extends Error {
  constructor(message: string, readonly diagnostics: readonly LoamDiagnostic[] = []) {
    super(message);
    this.name = "LoamDocumentError";
  }
  /** The message plus every diagnostic, for `console.error`. */
  render(): string {
    return [this.message, ...this.diagnostics.map((d) => `\n${formatDiagnostic(d)}`)].join("\n");
  }
}

/** Read, check and lower `docPath`. Throws {@link LoamDocumentError}. */
export async function loadLoamDocument(docPath: string): Promise<LoadedLoamDocument> {
  const source = await readFile(path.resolve(docPath), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    throw new LoamDocumentError(`${docPath} is not valid JSON: ${(cause as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new LoamDocumentError(`${docPath} is not a Loam document: expected a JSON object`);
  }
  const loam = parsed as Record<string, unknown>;
  if (loam["loam"] !== "1") {
    throw new LoamDocumentError(
      `${docPath} is not a Loam 1 document: it must say "loam": "1" (\`terrainist kit\` prints the language)`,
    );
  }
  const validation = validateLoam(loam, loamRegistries());
  const errors = validation.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new LoamDocumentError(`${docPath} is not a valid Loam 1 document — ${errors.length} problem(s)`, errors);
  }
  const doc = lowerLoam(loam, loamRegistries());
  const name = typeof loam["name"] === "string" ? (loam["name"] as string) : "world";
  return { loam, doc, name };
}

/** Write the lowered document beside the world, for `--debug-ir`. Returns its path. */
export async function writeDebugIr(outDir: string, name: string, doc: unknown): Promise<string> {
  const dir = path.resolve(outDir);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${name}.ir.json`);
  await writeFile(target, `${JSON.stringify(doc, null, 2)}\n`);
  return target;
}

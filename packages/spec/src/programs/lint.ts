/**
 * Static lint for authored program source — step 1 of the five-step gate.
 *
 * Purely textual, and deliberately so: it runs before anything is executed, in
 * both the authoring loop and the compile, and it must never need a JS parser
 * to be present. What it checks is what the sandbox cannot check later without
 * having already run the program:
 *
 * - the banned surface of §7.4 (`fetch`, `fs`, `process`, `Date`,
 *   `performance`, `Math.random`, `eval`, `Function`, `import()`, `require`);
 * - the export shape the loader understands;
 * - no top-level mutable state, so two invocations in one realm cannot differ.
 *
 * Braceless loop and branch bodies used to be a *finding* here, on the grounds
 * that the fuel instrumenter can only charge a `{`. They no longer are: the
 * instrumenter brace-wraps them itself, deterministically, before it splices
 * (see {@link braceBracelessBodies}, which the compiler's `fuel.ts` calls).
 * The scanner that used to produce the finding is what does the wrapping, so
 * there is still exactly one piece of logic that knows what a braceless body
 * looks like.
 *
 * A textual check has false positives — `"my Date"` inside a string literal is
 * the classic one — so the scanner strips comments, strings and template
 * literals first. That is the same scanner the fuel instrumenter uses; sharing
 * it is the point, because a rule the lint enforces and the instrumenter does
 * not see is a rule that does not hold.
 */

import { error, type LoamDiagnostic } from "../terrain/diagnostics.js";

/** Identifiers a program may not name. */
export const BANNED_GLOBALS: readonly string[] = Object.freeze([
  "eval",
  "Function",
  "require",
  "process",
  "globalThis",
  "global",
  "fetch",
  "XMLHttpRequest",
  "WebAssembly",
  "Date",
  "performance",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "Atomics",
  "SharedArrayBuffer",
  "Worker",
  "Proxy",
  "Reflect",
  "import",
]);

/** Member expressions a program may not reach for. */
export const BANNED_MEMBERS: readonly string[] = Object.freeze([
  "Math.random",
  "constructor.constructor",
]);

/**
 * Strip comments, string literals, template literals and regex literals,
 * replacing each with spaces so every remaining character keeps its offset.
 *
 * Offsets are preserved because both callers report positions into the
 * *original* source: a diagnostic that points at a line the author cannot see
 * is worse than no diagnostic.
 */
export function stripLiterals(source: string): string {
  const out = source.split("");
  const n = source.length;
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  /** Last significant character before `i`, for the regex-vs-divide decision. */
  let prevSignificant = "";

  while (i < n) {
    const c = source[i] as string;
    const next = source[i + 1];

    if (c === "/" && next === "/") {
      let j = i;
      while (j < n && source[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && next === "*") {
      let j = i + 2;
      while (j < n && !(source[j] === "*" && source[j + 1] === "/")) j++;
      blank(i, Math.min(j + 2, n));
      i = Math.min(j + 2, n);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === c) break;
        j++;
      }
      blank(i + 1, j);
      i = Math.min(j + 1, n);
      prevSignificant = "x";
      continue;
    }
    if (c === "/" && isRegexPosition(prevSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const d = source[j] as string;
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        else if (d === "\n") break;
        j++;
      }
      if (j < n && source[j] === "/") {
        blank(i + 1, j);
        i = j + 1;
        prevSignificant = "x";
        continue;
      }
    }
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return out.join("");
}

function isRegexPosition(prev: string): boolean {
  return prev === "" || "(,=:[!&|?{};+-*%~^<>".includes(prev);
}

/** One thing the static lint found, with a 1-based line number. */
export interface SourceFinding {
  readonly line: number;
  readonly message: string;
  readonly fix: string;
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

/**
 * Run the static lint. Returns every finding, never throws, never stops at the
 * first problem — the authoring loop wants the whole list in one repair turn.
 */
export function lintProgramSource(source: string): readonly SourceFinding[] {
  const findings: SourceFinding[] = [];
  const code = stripLiterals(source);

  for (const name of BANNED_GLOBALS) {
    const re = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, "g");
    for (const m of code.matchAll(re)) {
      // `export default` is not an `import()`; the loader rewrites it.
      findings.push({
        line: lineOf(source, m.index ?? 0),
        message: `authored programs may not name \`${name}\``,
        fix: `remove \`${name}\`; the only entropy is api.random(), the only IO is api.set(), and the only clock is fuel`,
      });
    }
  }
  for (const member of BANNED_MEMBERS) {
    const re = new RegExp(member.replace(".", "\\s*\\.\\s*"), "g");
    for (const m of code.matchAll(re)) {
      findings.push({
        line: lineOf(source, m.index ?? 0),
        message: `authored programs may not use \`${member}\``,
        fix: "use api.random(), which is seeded from the instance seed and is the only randomness that exists",
      });
    }
  }

  findings.push(...findTopLevelMutableState(source, code));
  findings.push(...checkExports(source, code));
  findings.sort((a, b) => a.line - b.line || a.message.localeCompare(b.message));
  return findings;
}

/** One braceless control-flow body, as a half-open range into the source. */
export interface BracelessBody {
  readonly keyword: "for" | "while" | "if" | "else";
  /** Index of the first character of the body statement. */
  readonly start: number;
  /** Index one past the body statement's last character. */
  readonly end: number;
}

/**
 * Locate the *first* braceless loop or branch body in `source`.
 *
 * The one scanner: {@link braceBracelessBodies} is the only caller, and it is
 * what the fuel instrumenter runs before it splices. Textual by the same rule
 * as the rest of this file — the literal-stripped mirror decides, the original
 * text keeps the offsets.
 *
 * An **empty-statement** body (`while (c) ;`, and the `while (c);` tail of a
 * `do … while`) is deliberately left alone: there is nothing to wrap, and
 * wrapping the do-while tail would be a syntax error.
 */
export function findFirstBracelessBody(source: string): BracelessBody | undefined {
  const code = stripLiterals(source);
  const re = /(?<![\w$])(for|while|if|else)(?![\w$])/g;
  for (const m of code.matchAll(re)) {
    const keyword = m[1] as BracelessBody["keyword"];
    let i = (m.index ?? 0) + keyword.length;
    if (keyword !== "else") {
      while (i < code.length && /\s/.test(code[i] as string)) i++;
      if (code[i] !== "(") continue;
      let depth = 0;
      for (; i < code.length; i++) {
        if (code[i] === "(") depth++;
        else if (code[i] === ")") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
      }
    }
    while (i < code.length && /\s/.test(code[i] as string)) i++;
    if (code[i] === "{") continue;
    if (code[i] === ";") continue;
    if (keyword === "else" && /^if(?![\w$])/.test(code.slice(i, i + 3))) continue;

    return { keyword, start: i, end: statementEnd(code, i) };
  }
  return undefined;
}

/** Skip whitespace forward from `i`. */
function skipSpace(code: string, i: number): number {
  while (i < code.length && /\s/.test(code[i] as string)) i++;
  return i;
}

/** Index one past the bracket group opening at `i`, which must be a bracket. */
function groupEnd(code: string, i: number): number {
  const open = code[i] as string;
  const close = open === "(" ? ")" : open === "[" ? "]" : "}";
  let depth = 0;
  for (let j = i; j < code.length; j++) {
    if (code[j] === open) depth++;
    else if (code[j] === close) {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return code.length;
}

/**
 * Index one past the statement starting at `i`.
 *
 * Recursive rather than "scan to the next `;`", because the next `;` is the
 * wrong answer for exactly the shape this exists to wrap: the body of
 * `for (…) if (p) f(); else g();` is the whole if-else, and cutting it at the
 * first `;` would move the `else` outside the loop.
 */
function statementEnd(code: string, at: number): number {
  const i = skipSpace(code, at);
  if (i >= code.length) return code.length;
  if (code[i] === "{") return groupEnd(code, i);

  const head = /^(if|for|while|do)(?![\w$])/.exec(code.slice(i, i + 6));
  if (head !== null) {
    const keyword = head[1] as string;
    let j = skipSpace(code, i + keyword.length);
    if (keyword !== "do") {
      if (code[j] !== "(") return simpleStatementEnd(code, i);
      j = groupEnd(code, j);
    }
    let end = statementEnd(code, j);
    if (keyword === "do") {
      const k = skipSpace(code, end);
      if (/^while(?![\w$])/.test(code.slice(k, k + 6))) {
        const p = skipSpace(code, k + 5);
        end = code[p] === "(" ? groupEnd(code, p) : p;
        if (code[skipSpace(code, end)] === ";") end = skipSpace(code, end) + 1;
      }
      return end;
    }
    if (keyword === "if") {
      const k = skipSpace(code, end);
      if (/^else(?![\w$])/.test(code.slice(k, k + 5))) return statementEnd(code, k + 4);
    }
    return end;
  }
  return simpleStatementEnd(code, i);
}

/**
 * A statement with no sub-statement ends at the first `;` at bracket depth 0
 * — or, when the author leant on ASI, at the bracket that closes the block
 * around it.
 */
function simpleStatementEnd(code: string, i: number): number {
  let depth = 0;
  for (let j = i; j < code.length; j++) {
    const c = code[j] as string;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return j;
      depth--;
    } else if (c === ";" && depth === 0) return j + 1;
  }
  return code.length;
}

/**
 * Brace-wrap every braceless loop and branch body. Identity on source that is
 * already fully braced.
 *
 * This is normalization, not repair: wrapping a legal braceless body is
 * semantics-preserving in JS (a declaration as a braceless body is already a
 * SyntaxError), so the frozen source in a document stays the author's verbatim
 * text and this runs at every run site as a pure function of it. A scanner
 * mistake therefore surfaces as a syntax error when the sandbox compiles the
 * result — loudly — rather than as a quietly different world.
 */
export function braceBracelessBodies(source: string): string {
  let out = source;
  // One wrap per pass, re-scanning: wrapping shifts every later offset, and
  // nested braceless bodies (`for (…) if (p) f();`) need the outer one first.
  for (let guard = 0; guard < MAX_BRACE_WRAPS; guard++) {
    const hit = findFirstBracelessBody(out);
    if (hit === undefined) return out;
    out = `${out.slice(0, hit.start)}{ ${out.slice(hit.start, hit.end)} }${out.slice(hit.end)}`;
  }
  throw new Error(
    `brace normalization did not converge after ${MAX_BRACE_WRAPS} wraps; the source is not the shape the scanner understands`,
  );
}

/** Ceiling on the wrap loop — far above any real program, and it must halt. */
const MAX_BRACE_WRAPS = 4096;

/** `let`/`var` at column 0 — top-level mutable state, banned by the gate. */
function findTopLevelMutableState(source: string, code: string): SourceFinding[] {
  const out: SourceFinding[] = [];
  const re = /^(let|var)(?![\w$])/gm;
  for (const m of code.matchAll(re)) {
    out.push({
      line: lineOf(source, m.index ?? 0),
      message: `top-level \`${m[1]}\` is mutable state that outlives one invocation`,
      fix: "move it inside the build function; a program is a pure function of its api, and state at module scope makes the second run differ from the first",
    });
  }
  return out;
}

/** The two export forms the loader understands. */
function checkExports(source: string, code: string): SourceFinding[] {
  const out: SourceFinding[] = [];
  if (!/^\s*export\s+default(?![\w$])/m.test(code)) {
    out.push({
      line: 1,
      message: "no `export default` build function",
      fix: "end the program with `export default function build(api) { … }` returning `{ name, seatY }`",
    });
  }
  if (!/^\s*export\s+const\s+envelope\s*=/m.test(code)) {
    out.push({
      line: 1,
      message: "no `export const envelope = [w, h, d]`",
      fix: "declare the envelope the program needs, e.g. `export const envelope = [16, 24, 16];` — the solver reserves exactly that",
    });
  }
  for (const m of code.matchAll(/^\s*export\s+(?!default(?![\w$]))(?!const\s+envelope\s*=)(\S+)/gm)) {
    out.push({
      line: lineOf(source, m.index ?? 0),
      message: `unsupported export form \`export ${m[1] as string}\``,
      fix: "a program exports exactly two things: `const envelope` and a `default` build function",
    });
  }
  return out;
}

/** Lift findings into diagnostics at one node path. */
export function sourceFindingsToDiagnostics(
  findings: readonly SourceFinding[],
  nodePath: string,
  programId: string,
): LoamDiagnostic[] {
  return findings.map((f) =>
    error(
      "PROGRAM_GATE_FAILED",
      nodePath,
      `program ${JSON.stringify(programId)} line ${f.line}: ${f.message}`,
      f.fix,
    ),
  );
}

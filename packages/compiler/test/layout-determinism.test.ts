import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * §6.5 rule 6, applied to the layout solver.
 *
 * The stdlib has enforced this since G2; the solver needs the same guard for
 * the same reason. A solver that reached for `Math.acos` to score `facing`
 * would place buildings differently on different engines — silently, and only
 * for some users. `Math.random` in a candidate pool would be worse still.
 *
 * `Math.sqrt`, `Math.floor`, `Math.abs`, `Math.min/max`, `Math.round`,
 * `Math.ceil`, `Math.sign` and `Math.trunc` are exactly specified and allowed;
 * §4.9.1 leans on `floor` and `sqrt` by name.
 */
const FORBIDDEN =
  /\bMath\s*\.\s*(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|pow|exp|expm1|log|log2|log10|log1p|cbrt|hypot|fround|random|E|PI|LN2|LN10|LOG2E|LOG10E|SQRT1_2|SQRT2)\b/g;

const LAYOUT_DIST = fileURLToPath(new URL("../dist/layout", import.meta.url));

async function jsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await jsFiles(full)));
    else if (e.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/** Blank comment bodies so a doc comment naming `Math.acos` is not a hit. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

describe("the layout solver is engine-independent", () => {
  it("calls no unspecified Math member", async () => {
    const files = await jsFiles(LAYOUT_DIST);
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(await readFile(file, "utf8"));
      for (const match of source.matchAll(FORBIDDEN)) {
        offenders.push(`${path.basename(file)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

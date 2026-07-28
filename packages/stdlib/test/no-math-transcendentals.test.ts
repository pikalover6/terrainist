import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * §6.5 rule 6 enforcement.
 *
 * `Math.sin`, `Math.cos`, `Math.pow`, `Math.exp`, `Math.log`, `Math.atan2` and
 * friends are *not* IEEE-754 specified: their last bits vary by engine and by
 * engine version. A single stray call anywhere in the stdlib would make worlds
 * non-reproducible across machines — silently, and only for some users.
 *
 * So we grep the **built output** (not the source, which a clever alias could
 * hide from) for any forbidden `Math.*` member. `Math.sqrt`, `Math.floor`,
 * `Math.abs`, `Math.min/max`, `Math.round`, `Math.ceil`, `Math.sign`,
 * `Math.trunc` and `Math.imul` are exactly specified and therefore allowed.
 */

const FORBIDDEN =
  /\bMath\s*\.\s*(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|pow|exp|expm1|log|log2|log10|log1p|cbrt|hypot|fround|random|E|PI|LN2|LN10|LOG2E|LOG10E|SQRT1_2|SQRT2)\b/g;

const DIST = fileURLToPath(new URL("../dist", import.meta.url));

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

/**
 * Blank out comment bodies while preserving line structure, so a doc comment
 * that *names* `Math.sin` (as `src/math/index.ts` must) is not a false positive
 * but a real call on the same line as a comment still is.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

describe("no platform transcendentals in the built stdlib", () => {
  it("has a built dist/ to check", async () => {
    const files = await jsFiles(DIST);
    expect(files.length).toBeGreaterThan(0);
  });

  it("never calls a non-IEEE Math member", async () => {
    const files = await jsFiles(DIST);
    const offences: string[] = [];
    for (const file of files) {
      const text = stripComments(await readFile(file, "utf8"));
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as string;
        FORBIDDEN.lastIndex = 0;
        const match = FORBIDDEN.exec(line);
        if (match) {
          offences.push(`${path.relative(DIST, file)}:${i + 1}: ${match[0]} — ${line.trim()}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("still catches a forbidden call when one is present (guards the guard)", () => {
    FORBIDDEN.lastIndex = 0;
    expect(FORBIDDEN.test("const y = Math.sin(x);")).toBe(true);
    FORBIDDEN.lastIndex = 0;
    expect(FORBIDDEN.test("return Math . pow (a, b);")).toBe(true);
    FORBIDDEN.lastIndex = 0;
    expect(FORBIDDEN.test("Math.sqrt(x) + Math.floor(y) + Math.imul(a, b)")).toBe(false);
  });
});

/**
 * The committed Claude Code agent definitions must actually register.
 *
 * Pinned contract (measured on stock CC 2.1.220, 2026-07-29): an agent type
 * registers only from frontmatter `name:` (filename is not a fallback; a
 * definition without `name:` is silently ignored and dispatch falls back to
 * built-ins); `effort` must be a named level low/medium/high/xhigh/max —
 * integer values are silently dropped on the wire and `name` is required.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentsDir = fileURLToPath(
  new URL("../../../.claude/agents", import.meta.url),
);
const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];
const MODEL_ALIASES = ["opus", "sonnet", "fable", "haiku"];

function frontmatter(raw: string): Record<string, string> {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return {};
  const out: Record<string, string> = {};
  let key: string | undefined;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      out[key] = kv[2].trim();
    } else if (key && /^\s+\S/.test(line)) {
      out[key] = (out[key] + " " + line.trim()).trim();
    }
  }
  return out;
}

describe(".claude/agents definitions", () => {
  it("has agent definitions committed", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const fm = frontmatter(readFileSync(join(agentsDir, file), "utf8"));
    const stem = basename(file, ".md");

    it(`${file} carries a name: matching its filename`, () => {
      expect(fm.name).toBe(stem);
    });

    it(`${file} has a non-empty description`, () => {
      expect((fm.description ?? "").replace(/^>-?\s*/, "").length)
        .toBeGreaterThan(0);
    });

    it(`${file} uses a named effort level, never an integer`, () => {
      if (fm.effort !== undefined) {
        expect(EFFORT_LEVELS).toContain(fm.effort);
      }
    });

    it(`${file} uses a known model alias`, () => {
      if (fm.model !== undefined) {
        expect(MODEL_ALIASES).toContain(fm.model);
      }
    });
  }
});

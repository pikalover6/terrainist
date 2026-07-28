/**
 * The terrain-author spec kit must never drift from the validator.
 *
 * Every ```json block in `docs/kits/terrain-author.md` is extracted and
 * parsed; any block that carries a `"loam"` key is a complete document and
 * must validate with zero diagnostics. If someone tightens the validator and
 * forgets the kit, this test fails before an LLM ever sees the stale wording.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatDiagnostic, validateTerrainDocument } from "../src/terrain/index.js";

const KIT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/kits/terrain-author.md",
);

/**
 * Every fenced ```json block, in document order, with its 1-based line.
 *
 * A block preceded by `<!-- kit:skeleton -->` is an intentionally incomplete
 * shape sketch: it must still be valid JSON, but it is not held to the
 * zero-diagnostics bar.
 */
function extractJsonBlocks(
  markdown: string,
): { line: number; source: string; skeleton: boolean }[] {
  const lines = markdown.split("\n");
  const blocks: { line: number; source: string; skeleton: boolean }[] = [];
  let start: number | undefined;
  let skeleton = false;
  let pendingSkeleton = false;
  let buffer: string[] = [];

  for (const [i, line] of lines.entries()) {
    if (start === undefined) {
      if (line.trim() === "<!-- kit:skeleton -->") {
        pendingSkeleton = true;
      } else if (line.trim() === "```json") {
        start = i + 2;
        skeleton = pendingSkeleton;
        pendingSkeleton = false;
        buffer = [];
      }
      continue;
    }
    if (line.trim() === "```") {
      blocks.push({ line: start, source: buffer.join("\n"), skeleton });
      start = undefined;
      continue;
    }
    buffer.push(line);
  }

  expect(start, "the kit has an unterminated ```json fence").toBeUndefined();
  return blocks;
}

const markdown = await readFile(KIT_PATH, "utf8");
const blocks = extractJsonBlocks(markdown);

describe("terrain-author kit", () => {
  it("contains JSON examples", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(5);
  });

  it.each(blocks.map((b, i) => [i, b] as const))(
    "block %i parses as JSON",
    (_i, block) => {
      expect(() => JSON.parse(block.source), `kit line ${block.line}`).not.toThrow();
    },
  );

  it("every complete document validates with zero diagnostics", () => {
    const complete = blocks
      .map((b) => ({ ...b, value: JSON.parse(b.source) as unknown }))
      .filter(
        (b) =>
          !b.skeleton && typeof b.value === "object" && b.value !== null && "loam" in b.value,
      );

    expect(complete.length, "the kit must embed at least one complete document").toBeGreaterThan(0);

    for (const doc of complete) {
      const result = validateTerrainDocument(doc.value);
      const rendered = result.diagnostics.map(formatDiagnostic).join("\n");
      expect(rendered, `kit line ${doc.line}`).toBe("");
      expect(result.document, `kit line ${doc.line}`).toBeDefined();
    }
  });
});

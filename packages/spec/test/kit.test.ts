/**
 * The spec kits must never drift from the validators.
 *
 * Every ```json block in `docs/kits/terrain-author.md` and
 * `docs/kits/settlement-author.md` is extracted and parsed; any block that
 * carries a `"loam"` key is a complete document and must validate against its
 * profile's validator. If someone tightens a validator and forgets the kit,
 * this test fails before an LLM ever sees the stale wording.
 *
 * The bar differs slightly by kit, and deliberately. A terrain document has no
 * solver, so zero diagnostics is achievable and required. A settlement document
 * can pick up advisory warnings (`LOAM-W407` for a constraint the solver parses
 * but ignores, `LOAM-T206` for a port type it carries but does not resolve)
 * without anything being wrong with the example, so the settlement bar is zero
 * *error* diagnostics.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatDiagnostic, validateTerrainDocument } from "../src/terrain/index.js";
import { validateSettlementDocument } from "../src/settlement/index.js";

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/kits");

/**
 * Every fenced ```json block, in document order, with its 1-based line.
 *
 * A block preceded by `<!-- kit:skeleton -->` is an intentionally incomplete
 * shape sketch: it must still be valid JSON, but it is not held to the
 * diagnostics bar.
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

const terrainBlocks = extractJsonBlocks(await readFile(path.join(DOCS, "terrain-author.md"), "utf8"));
const settlementSource = await readFile(path.join(DOCS, "settlement-author.md"), "utf8");
const settlementBlocks = extractJsonBlocks(settlementSource);

/** The complete documents among `blocks` — a skeleton or a fragment is neither. */
function completeDocuments(
  blocks: readonly { line: number; source: string; skeleton: boolean }[],
): { line: number; value: unknown }[] {
  return blocks
    .map((b) => ({ ...b, value: JSON.parse(b.source) as unknown }))
    .filter(
      (b) => !b.skeleton && typeof b.value === "object" && b.value !== null && "loam" in b.value,
    );
}

describe("terrain-author kit", () => {
  it("contains JSON examples", () => {
    expect(terrainBlocks.length).toBeGreaterThanOrEqual(5);
  });

  it.each(terrainBlocks.map((b, i) => [i, b] as const))(
    "block %i parses as JSON",
    (_i, block) => {
      expect(() => JSON.parse(block.source), `kit line ${block.line}`).not.toThrow();
    },
  );

  it("every complete document validates with zero diagnostics", () => {
    const complete = completeDocuments(terrainBlocks);
    expect(complete.length, "the kit must embed at least one complete document").toBeGreaterThan(0);

    for (const doc of complete) {
      const result = validateTerrainDocument(doc.value);
      const rendered = result.diagnostics.map(formatDiagnostic).join("\n");
      expect(rendered, `kit line ${doc.line}`).toBe("");
      expect(result.document, `kit line ${doc.line}`).toBeDefined();
    }
  });
});

describe("settlement-author kit", () => {
  it("contains JSON examples", () => {
    expect(settlementBlocks.length).toBeGreaterThanOrEqual(8);
  });

  it.each(settlementBlocks.map((b, i) => [i, b] as const))(
    "block %i parses as JSON",
    (_i, block) => {
      expect(() => JSON.parse(block.source), `kit line ${block.line}`).not.toThrow();
    },
  );

  it("every complete document validates with no error diagnostics", () => {
    const complete = completeDocuments(settlementBlocks);
    expect(complete.length, "the kit must embed at least one complete document").toBeGreaterThan(0);

    for (const doc of complete) {
      const result = validateSettlementDocument(doc.value);
      const errors = result.diagnostics
        .filter((d) => d.severity === "error")
        .map(formatDiagnostic)
        .join("\n");
      expect(errors, `kit line ${doc.line}`).toBe("");
      expect(result.document, `kit line ${doc.line}`).toBeDefined();
    }
  });

  it("embeds a complete settlement, not just terrain", () => {
    const complete = completeDocuments(settlementBlocks);
    const withStructures = complete.filter((doc) => {
      const children = (doc.value as { root: { children: { generator?: string }[] } }).root.children;
      return children.some((c) => c.generator === "building.grammar@0");
    });
    expect(withStructures.length).toBeGreaterThan(0);
  });

  it("tells the author to write `era` when the prompt implies a period", () => {
    // The hill town walked 2026-08-06 came out with seventeen AC units and
    // thirteen phone boxes because its intent carried a `character` and no
    // `era` — and an absent `era` means "modern fittings allowed", which is the
    // only default the identity law permits. So the fix has to live in the
    // guidance: the kit must say that omitting `era` is a choice with a look.
    const era = settlementSource.slice(settlementSource.indexOf("`era` is an **open** vocabulary"));
    expect(era).toContain("mountain village");
    expect(era).toMatch(/hydrant|air-conditioning/);
    // And it must name a class for the period words a prompt actually uses.
    for (const cls of ["medieval", "renaissance", "industrial", "modern"]) {
      expect(era, cls).toContain(`"era": "${cls}"`);
    }
  });

  it("teaches the settlement profile, not the terrain one", () => {
    for (const doc of completeDocuments(settlementBlocks)) {
      expect((doc.value as { profile: string }).profile, `kit line ${doc.line}`).toBe("settlement");
    }
  });
});

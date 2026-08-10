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

  it("teaches a holding an author can copy — and it validates in a document", () => {
    // The kit's precinct fragments are not complete documents, so the bar above
    // only parses them. A holding is the one fragment whose *constraints* are
    // the teaching (two of them, split, plus a `drape`), and the plan's own
    // example carried a `T206` and an `E169` until WP-3 fixed it. So this case
    // does what an author does: drops the block into a real document and
    // validates. The only edit is the neighbour it names, because the kit's
    // complete example has a green rather than a village.
    const farm = settlementBlocks.find((b) => b.source.includes("precinct.farm@0"));
    expect(farm, "the kit teaches no precinct.farm@0").toBeDefined();
    const node = JSON.parse((farm as { source: string }).source.replace('"village"', '"green"')) as unknown;

    const host = completeDocuments(settlementBlocks).at(-1);
    expect(host, "the kit embeds no complete settlement to host the holding").toBeDefined();
    const doc = JSON.parse(JSON.stringify((host as { value: unknown }).value)) as {
      root: { children: unknown[] };
    };
    doc.root.children.push(node);

    const result = validateSettlementDocument(doc);
    const errors = result.diagnostics
      .filter((d) => d.severity === "error")
      .map(formatDiagnostic)
      .join("\n");
    expect(errors).toBe("");
  });

  it("tells the author when a prompt needs a holding, and what a holding costs", () => {
    // The section is the whole of FARM-PLAN §11: a model that does not know the
    // node exists writes a farm town with no fields in it, and one that does not
    // know the ground bar puts a holding on a mountainside and gets a yard.
    const farm = settlementSource.slice(settlementSource.indexOf("### `precinct.farm@0`"));
    expect(farm).toContain("precinct.farm@0");
    expect(farm).toMatch(/3 blocks of level/);
    expect(farm).toContain("40 × 40");
    // Never flatten a holding, and one crop to a field.
    expect(farm).toMatch(/Do \*\*not\*\* give a farm `terrain_conform: "flatten"`/);
    expect(farm).toContain("One crop to a field");
    // And the checklist must send a farming prompt to the node at all.
    expect(settlementSource.slice(settlementSource.indexOf("## 14. Before you answer"))).toContain(
      "precinct.farm@0",
    );
  });

  it("teaches a ruined quarter an author can copy — and it validates in a document", () => {
    // RUINS-PLAN WP-5. The teaching sentence is "a ruined city = a district +
    // high decline", and the example that carries it is a district fragment
    // with an `intent` on it — the one place an author writes intent below the
    // root. So it is checked the way the holding is: dropped into the kit's own
    // complete document and validated.
    const quarter = settlementBlocks.find((b) => b.source.includes('"lower_quarter"'));
    expect(quarter, "the kit teaches no ruined quarter").toBeDefined();
    const node = JSON.parse((quarter as { source: string }).source) as unknown;

    const host = completeDocuments(settlementBlocks).at(-1);
    expect(host, "the kit embeds no complete settlement to host the quarter").toBeDefined();
    const doc = JSON.parse(JSON.stringify((host as { value: unknown }).value)) as {
      root: { children: unknown[] };
    };
    doc.root.children.push(node);

    const result = validateSettlementDocument(doc);
    const errors = result.diagnostics
      .filter((d) => d.severity === "error")
      .map(formatDiagnostic)
      .join("\n");
    expect(errors).toBe("");
  });

  it("teaches ruin at district scale, and only what is built", () => {
    const ruins = settlementSource.slice(
      settlementSource.indexOf("### A ruined city is a district with a high `decline`"),
      settlementSource.indexOf("### The urban forms"),
    );
    expect(ruins, "the kit has no ruined-city section").not.toBe("");
    // The load-bearing sentence, the onset, the uncapped top, and the dial.
    expect(ruins).toContain(
      "**A ruined city is a district with a high `decline` — not a list of ruins.**",
    );
    expect(ruins).toMatch(/Below \*\*0\.35\*\* nothing is ruined at all/);
    expect(ruins).toMatch(/\*\*1\.0 leaves nothing intact\*\*/);
    expect(ruins).toContain('"params": { "decay": 0.8 }');
    expect(ruins).toContain("LOAM-I512");
    // The two things an author gets wrong: a mix of relics, and assuming a
    // named landmark ruins itself.
    expect(ruins).toContain("**Do not fill a district's `mix` with `ruined_cottage`.**");
    expect(ruins).toContain("**Landmarks you declare as children are not ruined automatically**");
    // Only what WP-1..4 built: terraces, high-rise frames and own-generator
    // shells do not roll, and the reclaim is ground green, not trees.
    expect(ruins).toMatch(/terrace runs/);
    expect(ruins).toContain("LOAM-W511");
    expect(ruins).toMatch(/trees still stop at the\s+settlement's edge/);
    expect(ruins).toContain('avoidTags: ["structure", "road", "plaza"]');
    // The dial row and the building param must both point here.
    const dial = settlementSource.slice(settlementSource.indexOf("| `decline` |"));
    expect(dial.slice(0, 600)).toMatch(/at 0\.35 and above, the share of a district's own buildings/);
    expect(settlementSource).toMatch(/\| `decay` \| 0\.\.1 \|/);
    // And table 14's long-standing open question must no longer say the
    // language cannot express ruin at scale.
    expect(settlementSource).not.toContain("Ruin at district scale is not something the language can say");
  });

  it("teaches the settlement profile, not the terrain one", () => {
    for (const doc of completeDocuments(settlementBlocks)) {
      expect((doc.value as { profile: string }).profile, `kit line ${doc.line}`).toBe("settlement");
    }
  });
});

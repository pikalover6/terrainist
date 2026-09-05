/**
 * **The reach law** — rule 10, and §13.2f's
 * fourth test item.
 *
 * > A document with no linework-declaring node compiles byte-identically.
 *
 * The argument is structural and is worth stating before the assertions, because
 * the assertions are only the half a test can reach: the slot is **total on an
 * empty job list** — `buildStructures` filters `infraEntryJobsOf` by
 * `declaresLinework` and never constructs the pass when the list is empty — and
 * **no world before this contract holds a `structure.linework` claim**, because
 * the host refused every row that named the class. So the class's first exercise
 * is byte-identity-free by construction, which is the same argument
 * `farm.parcel` made at rank 125 for the same reason.
 *
 * What this file adds is the operational half, on the four worlds §13.2f names:
 * the compile is deterministic, no rank-25 intent reaches the driver, and
 * neither new code fires. And — §13.2f's own instruction, which is the part
 * worth obeying literally — **the harness is shown to see a difference before
 * it is trusted to have seen none**: the control below perturbs a world and
 * asserts the digest moves.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { compileArtifacts } from "../src/terrain/compile.js";

/** §13.2f's four: two flat controls and the two hill towns. */
const WORLDS = [
  "c1-harbourtown",
  "showcase-deltamere",
  "hillside-village",
  "hilltop-crypt-hamlet"
] as const;

async function document(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(
      fileURLToPath(new URL(`fixtures/examples/${name}.loam.json`, import.meta.url)),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

async function digestOf(doc: Record<string, unknown>): Promise<{
  hash: string;
  codes: readonly string[];
  stats: Readonly<Record<string, number>>;
}> {
  const h = createHash("sha256");
  const result = await compileArtifacts(doc, {});
  if (!result.ok) throw new Error(result.diagnostics.map((d) => d.code).join(", "));
  const artifacts = result.artifacts;
  const { plan } = artifacts;
  h.update(Buffer.from(Uint8Array.from(plan.ground as unknown as ArrayLike<number>)));
  for (const block of artifacts.structures ?? []) h.update(`s ${JSON.stringify(block)}\n`);
  const stats =
    (result.report as unknown as { structures?: { stats?: Record<string, number> } }).structures
      ?.stats ?? {};
  return { hash: h.digest("hex"), codes: result.report.diagnostics.map((d) => d.code), stats };
}

describe("rule 10 — a document with no linework node does not move", () => {
  for (const name of WORLDS) {
    it(
      `${name}: two compiles agree, and nothing linework ran`,
      async () => {
        const doc = await document(name);
        const a = await digestOf(doc);
        const b = await digestOf(await document(name));
        expect(a.hash).toBe(b.hash);
        expect(a.hash).not.toBe("");
        // The slot was never constructed: no stat, and neither code.
        for (const key of Object.keys(a.stats)) expect(key).not.toMatch(/^linework/);
        expect(a.codes).not.toContain("LOAM-T235");
        expect(a.codes).not.toContain("LOAM-T236");
        // And the re-pointed refusal never fired either: no row in any of these
        // documents names the class, so the wall's slot had nothing to refuse.
        expect(a.codes).not.toContain("LOAM-T231");
      },
      600_000,
    );
  }

  it(
    "the harness can see a difference — the control that makes the four above mean something",
    async () => {
      // §13.2f: *prove the harness can see a difference before trusting that it
      // saw none*. A digest that is constant because the digest is broken looks
      // exactly like a digest that is constant because nothing moved.
      const doc = await document("hillside-village");
      const moved = {
        ...doc,
        meta: { ...(doc["meta"] as Record<string, unknown>), worldSeed: 4720932 }
      };
      const a = await digestOf(doc);
      const b = await digestOf(moved);
      expect(b.hash).not.toBe(a.hash);
    },
    600_000,
  );
});

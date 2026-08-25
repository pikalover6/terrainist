/**
 * The golden harness's E1 arms (`tools/golden-prompts/split-kit.mjs`,
 * `assemble.mjs`): the core kit withholds every fence, the modules hold them,
 * and a prompt's modules are chosen from its intent and its words — never from
 * a draw, never the complete example. Pure functions on strings; no API, no
 * compile.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const splitter = (await import(here("../../../tools/golden-prompts/split-kit.mjs"))) as {
  splitKit: (text: string) => { core: string; modules: Map<string, { fences: string[] }>; withheldFences: number };
};
const assembly = (await import(here("../../../tools/golden-prompts/assemble.mjs"))) as {
  selectModules: (prompt: { prompt: string }, kit: string, intent: unknown) => [string, string][];
  assembleModules: (dir: string, selected: [string, string][]) => { text: string; used: string[]; missing: string[] };
  NEVER: string[];
};

describe("the core kit withholds every fence", () => {
  const text = readFileSync(here("../../../docs/kits/settlement-author.md"), "utf8");
  const r = splitter.splitKit(text);
  it("leaves no fence in the core and puts every one in a module", () => {
    expect(r.core).not.toMatch(/```/);
    const inModules = [...r.modules.values()].reduce((n, m) => n + m.fences.length, 0);
    expect(inModules).toBe(r.withheldFences);
    expect(r.withheldFences).toBeGreaterThan(50);
  });
  it("marks where each example was, so the prose still points somewhere", () => {
    expect((r.core.match(/example withheld — module/g) ?? []).length).toBeGreaterThan(40);
  });
  it("keeps the rules: the current-state guidance and the final checklist survive", () => {
    expect(r.core).toMatch(/## 7\. Current-state guidance/);
    expect(r.core).toMatch(/## 14\. Before you answer/);
    expect(r.core).not.toMatch(/## 13\. Complete example/);
  });
  it("is generated as committed: settlement-core.md is the split of settlement-author.md", () => {
    const committed = readFileSync(here("../../../docs/kits/settlement-core.md"), "utf8");
    expect(committed.endsWith(r.core + "\n")).toBe(true);
  });
});

describe("a prompt's modules follow its intent", () => {
  it("gives a walled ancient city with an icon the walls, the city and the programs, never the complete example", () => {
    const sel = assembly.selectModules(
      { prompt: "The Trojan horse in Troy, right before the soldiers emerge." },
      "settlement",
      { era: "ancient", character: { fortification: "walled", urbanForm: "grown" }, tokens: { icons: "a colossal wooden horse" } },
    );
    const slugs = sel.map(([s]) => s);
    expect(slugs).toContain("1-document-skeleton");
    expect(slugs).toContain("9c-infra-entry");
    expect(slugs).toContain("bespoke-programs-must-belong-to-the-worl");
    expect(slugs).not.toContain("city");
    for (const n of assembly.NEVER) expect(slugs).not.toContain(n);
  });
  it("gives a terrain prompt the terrain modules and nothing of the settlement", () => {
    const slugs = assembly.selectModules({ prompt: "A deep fjord cutting inland between pine ridges." }, "terrain", {}).map(([s]) => s);
    expect(slugs).toContain("8-worked-terrain-patterns");
    expect(slugs).not.toContain("district");
  });
  it("assembles the committed modules into one message and names any it cannot find", () => {
    const sel = assembly.selectModules({ prompt: "A walled medieval city on a hill, its castle keep above the rooftops." }, "settlement", { character: { fortification: "walled" } });
    const a = assembly.assembleModules(here("../../../docs/kits/modules"), [...sel, ["no-such-module", "test"]]);
    expect(a.missing).toEqual(["no-such-module"]);
    expect(a.used.length).toBe(sel.length);
    expect(a.text).toMatch(/# Worked examples for this prompt/);
    expect(a.text).toMatch(/```/);
  });
});

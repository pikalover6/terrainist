/**
 * The settlement kit is generated, and the committed file is the build.
 *
 * `tools/kit/build.mjs` expands `kits/src/settlement-author.md` against the
 * spec, stdlib and compiler registries, so every id the kit shows the model is
 * an id the compiler builds. This test holds two things: that the committed
 * `kits/settlement-author.md` is byte-identical to a fresh build (a registry
 * change that forgets `npm run kit` fails here), and that every id the kit's
 * JSON examples name in a registry position exists.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const builder = (await import(
  fileURLToPath(new URL("../../../tools/kit/build.mjs", import.meta.url))
)) as {
  buildKit(): string;
  checkKitIds(text: string): string[];
  OUTPUT: string;
};

describe("the generated settlement kit", () => {
  const built = builder.buildKit();

  it("is committed as built — run `npm run kit` after a registry or source change", () => {
    const committed = readFileSync(builder.OUTPUT, "utf8");
    expect(committed).toBe(built);
  });

  it("names no id the registries do not carry", () => {
    expect(builder.checkKitIds(built)).toEqual([]);
  });

  it("expanded every directive", () => {
    expect(built).not.toMatch(/\{\{(enum|const):/);
    expect(built).not.toMatch(/<!-- gen:/);
  });
});

/**
 * **WP-G2's grep-shaped test** — `docs/GROUND-CONTRACT-v1.md` §8, the G2 row:
 *
 * > "a grep-shaped test that `plan.ground[` appears nowhere in
 * > `packages/compiler/src` outside `ground-driver.ts` and the enumerated
 * > non-settlement callers."
 *
 * The other G2 assertions are behavioural (byte-identity on five documents,
 * `gaps === 0` in `ground-equivalence.test.ts`). This one is *structural*, and
 * it is the only kind that survives a refactor: a behavioural test tells you a
 * new direct writer changed the world, and if the new writer happens to agree
 * with the resolver on today's five documents it tells you nothing at all. This
 * test says the writer may not exist.
 *
 * It reads the actual source files — not the audit, not a snapshot — so it
 * cannot go stale, and every file it permits is enumerated below with the
 * reason it is permitted. **Adding a file to {@link ALLOWED} is a contract
 * change**: it is a new authority for `plan.ground`, which is the thing v1
 * exists to collapse to one.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/**
 * A write into a `ColumnPlan`'s level arrays.
 *
 * Deliberately receiver-shaped rather than literally `plan.ground[`: the driver
 * writes `this.plan.ground[k]` and a future pass could name its plan anything,
 * so the pattern is "some object's `.ground` / `.fluidTop` element, assigned".
 * Local `Int32Array`s that a pass grades before handing to the plan — the
 * street surfacer's `ground[i]`, `terrain/columns.ts`' materialisation buffer,
 * `infra-entry.ts`' router field — are *not* plan writes and are not matched;
 * see {@link BARE_ARRAY_WRITERS} for the one of those that is load-bearing.
 */
const PLAN_WRITE =
  /(^|[^\w.])((?:this\.)?[A-Za-z_$][\w$]*)\.(?:ground|fluidTop)\[[^\]\n]*\]\s*(?:\+|-|\*|\/)?=(?!=)/;

/**
 * Every file in `packages/compiler/src` allowed to write a plan's levels, and
 * why. One line per file; the reason is the contract's, not a note about the
 * code.
 */
const ALLOWED: ReadonlyMap<string, string> = new Map([
  [
    "layout/ground-driver.ts",
    "the contract's one writer — `commit`'s write-through of `resolveGround`'s answer (v1 §1.6)",
  ],
  [
    "programs/site-treatment.ts",
    "authored programs, deliberately outside the contract (`terrain/compile.ts:892-896`, v1 §7.1); it takes its driver by type and only the driverless arm writes",
  ],
  [
    "structures/props.ts",
    "`levelPropPadUndeclared` — the named non-settlement entry point (terrarium, exhibits, unit tests); `levelPropPad` takes a `GroundDriver` by type and never reaches the write",
  ],
  [
    "structures/junction-steps.ts",
    "`buildJunctionStepsOnBarePlan` — the named bare-plan entry point for `junction-steps.test.ts`; `buildJunctionSteps` requires a driver by type and is declare-only",
  ],
  ["exhibits/context.ts", "exhibit worlds — not the settlement path, no driver exists"],
  ["exhibits/infra.ts", "exhibit worlds — not the settlement path, no driver exists"],
  ["exhibits/infra2.ts", "exhibit worlds — not the settlement path, no driver exists"],
  ["exhibits/infra3.ts", "exhibit worlds — not the settlement path, no driver exists"],
  ["exhibits/infra4.ts", "exhibit worlds — not the settlement path, no driver exists"],
  ["exhibits/props.ts", "exhibit worlds — not the settlement path, no driver exists"],
]);

/**
 * The one place a *bare* level array is written on the way to becoming the
 * plan: `buildColumnPlan`'s materialisation (`terrain/columns.ts:199`), which
 * is what the contract's baseline is snapshotted from. It is upstream of the
 * driver rather than a competitor to it, which is why {@link PLAN_WRITE} does
 * not look for it — but v1 §8's G2 row names it, so it is enumerated.
 */
const BARE_ARRAY_WRITERS = ["terrain/columns.ts"] as const;

/**
 * Files WP-G2 **removed** from the writer set. Asserted absent by name rather
 * than only by the sweep, so a regression reads as "sweep.ts writes ground
 * again" instead of as an anonymous extra row.
 */
const DELETED_WRITERS: readonly (readonly [string, string])[] = [
  [
    "structures/sweep.ts",
    "WP-G2 item 3: `SweepInput.declare` is required, so the undeclared `plan.ground`/`fluidTop`/`snow` arm is gone (both callers, `retaining.ts:1122` and `:3472`, always declared)",
  ],
  [
    "structures/index.ts",
    "the settlement pipeline orchestrates passes; it has never written a level and may not start",
  ],
  ["terrarium.ts", "the terrarium levels through `levelPropPadUndeclared`, not by hand"],
];

/** Every `.ts` file under `packages/compiler/src`, as repo-relative-ish paths. */
function sources(): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) out.push(path.relative(SRC, full).split(path.sep).join("/"));
    }
  };
  walk(SRC);
  return out;
}

/** `file → the lines that write a plan's levels`, comments excluded. */
function writers(): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, string[]>();
  for (const file of sources()) {
    const hits: string[] = [];
    for (const [i, line] of readFileSync(path.join(SRC, file), "utf8").split("\n").entries()) {
      const trimmed = line.trim();
      // Comment lines are prose about the write, including the WP-G2 notes that
      // quote the deleted statement verbatim.
      if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
      if (PLAN_WRITE.test(line)) hits.push(`${file}:${i + 1}: ${trimmed}`);
    }
    if (hits.length > 0) found.set(file, hits);
  }
  return found;
}

describe("WP-G2 — who may write plan.ground", () => {
  const found = writers();

  it("no file outside the enumerated allowlist writes a plan's levels", () => {
    const strays = [...found]
      .filter(([file]) => !ALLOWED.has(file))
      .flatMap(([, lines]) => lines);
    expect(strays.join("\n")).toBe("");
  });

  it("the allowlist has no dead rows — every permitted file still writes", () => {
    // A row that stopped being true is a row nobody will delete. The allowlist
    // is an inventory, so it has to be exact in both directions.
    const dead = [...ALLOWED.keys()].filter((file) => !found.has(file));
    expect(dead.join(", ")).toBe("");
  });

  it("every allowlist row carries a reason", () => {
    for (const [file, reason] of ALLOWED) expect(reason.length, file).toBeGreaterThan(20);
  });

  it("the settlement passes WP-G2 converted no longer write", () => {
    for (const [file] of DELETED_WRITERS) expect(found.has(file), file).toBe(false);
  });

  it("`sweep()` has no undeclared mode left to reach", () => {
    const src = readFileSync(path.join(SRC, "structures/sweep.ts"), "utf8");
    // `declare` is required by type — the whole point of item 3's "by type
    // rather than by an `undefined` check".
    expect(src).toContain("readonly declare: SweepDeclaration;");
    expect(src).not.toContain("readonly declare?: SweepDeclaration;");
  });

  it("`buildJunctionSteps` requires a driver by type", () => {
    const src = readFileSync(path.join(SRC, "structures/junction-steps.ts"), "utf8");
    expect(src).toContain("readonly ground: GroundDriver;");
    expect(src).not.toContain("readonly ground?: GroundDriver;");
    expect(src).toContain("export function buildJunctionStepsOnBarePlan(");
  });

  it("`levelPropPad` requires a driver by type", () => {
    const src = readFileSync(path.join(SRC, "structures/props.ts"), "utf8");
    expect(src).toContain("ground: PropPadGround & { readonly driver: GroundDriver }");
    expect(src).toContain("export function levelPropPadUndeclared(");
  });

  it("the baseline's own materialiser is where v1 §8 says it is", () => {
    for (const file of BARE_ARRAY_WRITERS) {
      expect(readFileSync(path.join(SRC, file), "utf8")).toMatch(/ground\[idx\] = y;/);
    }
  });
});

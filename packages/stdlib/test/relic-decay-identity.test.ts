/**
 * **The decay-operator extraction moved nothing** (RUINS-PLAN-v0 WP-1).
 *
 * The five ruined archetypes' decay used to be five hand-written move
 * sequences inside `archetypes-relic.ts`; they are now five `DecayProfile`
 * parameter sets driving the operators in `decay.ts`. WP-1's acceptance bar is
 * **list-identity**: for every relic, at every envelope and both storey counts
 * and on two seeds, the emitted op list is what it was, *element for element,
 * order and duplicates included*.
 *
 * The proof is mechanical and is a golden, not an argument. The fixture beside
 * this file (`fixtures/relic-decay-identity.json`) was generated from the
 * **pre-extraction** implementation and carries, per case, the op count and a
 * SHA-256 over the canonical serialisation of the whole op list — every
 * `x,y,z,block` and every property, in emission order. A single reordered,
 * added, dropped or re-propertied op moves the hash.
 *
 * Regenerate ONLY with a ruling that the output is meant to move:
 * `UPDATE_RELIC_IDENTITY=1 npx vitest run relic-decay-identity`.
 *
 * This is `flora-identity.test.ts`'s pattern (FLORA-GRAMMAR-v0 WP-A) in the
 * form a whole-shell fit-out can take: a tree shape is a closure that can be
 * copied verbatim into a test, a fit-out is not — so the reference is the
 * output itself.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BUILDING_STYLE_DEFAULTS,
  RELIC_BUILDING_ARCHETYPES,
  RELIC_DECAY_PROFILES,
  archetypeOfTags,
  generateBuilding,
  nodeSeed,
  relicFacadeDefaults,
  type LocalVoxelOp,
} from "../src/index.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/relic-decay-identity.json", import.meta.url));

const S = nodeSeed(0x6e0an, "world.relic");
const OTHER = nodeSeed(0x6e0an, "world.relic.other");

const SIZES: readonly (readonly [number, number, number])[] = [
  [13, 17, 15],
  [11, 13, 13],
  [9, 11, 9],
];

function build(
  archetype: string,
  size: readonly [number, number, number],
  floors: number,
  seed: bigint,
): readonly LocalVoxelOp[] {
  const facade = relicFacadeDefaults(archetype);
  return generateBuilding({
    size,
    params: {
      archetype,
      floors,
      ...(facade.roof === undefined ? {} : { roof: facade.roof }),
      ...(facade.windowShape === undefined ? {} : { windowShape: facade.windowShape }),
      ...(facade.windowRhythm === undefined ? {} : { windowRhythm: facade.windowRhythm }),
    },
    seed,
    style: BUILDING_STYLE_DEFAULTS,
  }).ops;
}

/**
 * The canonical serialisation the hash is taken over.
 *
 * Property order is sorted rather than insertion-ordered, because a refactor
 * is allowed to build a props record in a different order and still have
 * written the same block; everything else — order, duplicates, air writes — is
 * held exactly.
 */
function canonical(ops: readonly LocalVoxelOp[]): string {
  return ops
    .map((op) => {
      const props = op.props ?? {};
      const keys = Object.keys(props).sort();
      const tail = keys.map((k) => `${k}=${props[k]}`).join(",");
      return `${op.x},${op.y},${op.z} ${op.block}${tail === "" ? "" : `[${tail}]`}`;
    })
    .join("\n");
}

interface Golden {
  readonly ops: number;
  readonly sha256: string;
}

const cases: { readonly label: string; readonly golden: Golden }[] = [];
for (const archetype of RELIC_BUILDING_ARCHETYPES) {
  for (const size of SIZES) {
    for (const floors of [1, 2]) {
      for (const [seedName, seed] of [
        ["a", S],
        ["b", OTHER],
      ] as const) {
        const ops = build(archetype, size, floors, seed);
        cases.push({
          label: `${archetype} ${size.join("x")} floors=${floors} seed=${seedName}`,
          golden: { ops: ops.length, sha256: createHash("sha256").update(canonical(ops)).digest("hex") },
        });
      }
    }
  }
}

if (process.env["UPDATE_RELIC_IDENTITY"] === "1") {
  const out: Record<string, Golden> = {};
  for (const c of cases) out[c.label] = c.golden;
  writeFileSync(FIXTURE, `${JSON.stringify(out, null, 2)}\n`);
}

const expected = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, Golden>;

describe("relic decay: list-identity across the operator extraction", () => {
  it("covers every relic at every envelope and both storey counts", () => {
    expect(cases.length).toBe(RELIC_BUILDING_ARCHETYPES.length * SIZES.length * 2 * 2);
    expect(Object.keys(expected).length).toBe(cases.length);
  });

  for (const c of cases) {
    it(c.label, () => {
      const want = expected[c.label];
      expect(want, `no golden for ${c.label}`).toBeDefined();
      expect(c.golden.ops, "op count").toBe(want!.ops);
      expect(c.golden.sha256, "op-list hash").toBe(want!.sha256);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* the profiles as data                                                        */
/* -------------------------------------------------------------------------- */

/**
 * RUINS-PLAN §5's table, verbatim, as the five profiles are meant to read.
 *
 * `intensity` is carried by the profile and read by no operator in WP-1 — so
 * without this test it would be a number nobody checks, and WP-3's band table
 * would be held to nothing. The `collapse` column is the one place the shipped
 * code and the document's §5 table disagree, and the disagreement is recorded
 * here rather than papered over: the church and the villa have **always** built
 * with `cornersStand`, which is the `structured` shape, and list-identity is
 * the WP-1 bar — so the code is right and §5's "even" for those two rows is the
 * document's error. WP-2's collapse-by-category table should note it (both are
 * `faith`/`civic`-shaped, which §5.1 sends to `structured` anyway).
 */
const DOC_TABLE = {
  ruined_cottage: { collapse: "even", intensity: 0.5, overgrowth: 0.35, rubble: 0.26 },
  ruined_keep: { collapse: "structured", intensity: 0.6, overgrowth: 0.25, rubble: 0.3 },
  ruined_church: { collapse: "structured", intensity: 0.4, overgrowth: 0.4, rubble: 0.22 },
  collapsed_tower: { collapse: "leaning", intensity: 0.7, overgrowth: 0.2, rubble: 0.34 },
  overgrown_villa: { collapse: "structured", intensity: 0.3, overgrowth: 0.55, rubble: 0.2 },
} as const;

describe("the five relics are five parameter sets", () => {
  it("has exactly one profile per relic", () => {
    expect(Object.keys(RELIC_DECAY_PROFILES).sort()).toEqual([...RELIC_BUILDING_ARCHETYPES].sort());
  });

  for (const archetype of RELIC_BUILDING_ARCHETYPES) {
    it(`${archetype} matches the documented dials`, () => {
      const p = RELIC_DECAY_PROFILES[archetype];
      const want = DOC_TABLE[archetype];
      expect(p.collapse, "collapse shape").toBe(want.collapse);
      expect(p.intensity, "intensity").toBe(want.intensity);
      expect(p.overgrowth, "overgrowth").toBe(want.overgrowth);
      expect(p.rubble, "rubble").toBe(want.rubble);
      // The shares are drawn against integer percents; a 0..1 dial that did not
      // land on a whole percent would move the draw.
      expect(Math.round(p.overgrowth * 100) / 100).toBe(p.overgrowth);
      expect(Math.round(p.rubble * 100) / 100).toBe(p.rubble);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Q3: the bare tags                                                           */
/* -------------------------------------------------------------------------- */

describe("bare ruin / ruins (RUINS-PLAN Q3)", () => {
  it("resolves to ruined_cottage", () => {
    expect(archetypeOfTags(["ruin"])).toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins"])).toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins", "overgrown"])).toBe("ruined_cottage");
  });

  it("never outranks a noun", () => {
    // Claimed last of all, so every other table still wins its own tag.
    expect(archetypeOfTags(["ruins", "keep"])).not.toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins", "abbey"])).not.toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins", "tower"])).not.toBe("ruined_cottage");
    expect(archetypeOfTags(["ruins", "villa"])).not.toBe("ruined_cottage");
    // And a compound still beats the bare tag outright.
    expect(archetypeOfTags(["ruins", "ruined_keep"])).toBe("ruined_keep");
  });

  it("leaves an untagged building alone", () => {
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags([])).toBe("cottage");
  });
});

/**
 * `FLORA_SPECIES` — the v0 catalog (FLORA-GRAMMAR-v0 §4.1), naturalistic half.
 *
 * A species is a shape program, a parameter envelope, palette symbols, a
 * stratum and a climate affinity. The bar every entry clears — **distinguishable
 * in silhouette at 60 blocks** — is met by *outline*, not colour, because
 * colour is what a render loses first: cone, ellipsoid, lumpy-branched, column,
 * plate, curtain, leaning.
 *
 * The four legacy ids come first and are exactly {@link LEGACY_FLORA_SPECIES}:
 * their geometry, their symbols and their draws are unchanged, which is what
 * §2's reach law is made of.
 *
 * The two fungal species and the two fantasy species of §4.1 are WP-C, and so
 * is the `fungal` program they need.
 */

import { LEGACY_FLORA_SPECIES } from "./programs.js";
import type { FloraSpeciesDef } from "./types.js";

/**
 * The naturalistic catalog.
 *
 * Curation notes, because the count is a decision: there is no poplar
 * (`larch_columnar` already owns the column), no standing dead snag (law 1
 * forbids it — §3.8), no small toadstool species, and no second cherry-class
 * colour tree (one pink is a feature, two is a theme park).
 */
export const NATURALISTIC_FLORA_SPECIES = Object.freeze({
  /** The leaning grandfather in a snowfield. The thing you walk towards. */
  spruce_ancient: {
    id: "spruce_ancient",
    program: "ancient",
    stratum: "emergent",
    // 16–22 before 2026-08-07. An `ancient` in the emergent stratum has the
    // same job a `giant` does — it must stand over the wood it anchors — and
    // the boreal canopy it stands in (`spruce_tall`, 8–13, `larch_columnar`,
    // 10–16) tops out at 17. §8's prominence bar of 8 blocks is what sets the
    // floor here: at 25 the thinnest, oldest corner of the envelope still
    // clears that canopy by 8.
    height: [25, 33],
    age: [0.4, 0.85],
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.spruce_leaves",
    deadSymbol: "wood.stripped_spruce_log",
    decoSymbol: "fungal.brown_cap",
    climates: ["boreal"],
    knobs: { leanMax: 3, branches: [4, 6], limb: 4, mass: 3 },
  },
  /** A pale-green exclamation mark, breaking a dark conifer wall into rhythm. */
  larch_columnar: {
    id: "larch_columnar",
    program: "columnar",
    stratum: "canopy",
    height: [10, 16],
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.birch_leaves",
    climates: ["boreal", "temperate"],
    knobs: { radius: 2, ratio: 0.45 },
  },
  /** Knee-to-shoulder scrub: what makes a forest floor look occupied. */
  juniper_scrub: {
    id: "juniper_scrub",
    program: "blob",
    stratum: "understory",
    height: [3, 4],
    trunkSymbol: "wood.spruce_log",
    leafSymbol: "wood.azalea_leaves",
    climates: ["boreal", "arid"],
    knobs: { radius: 2, squash: 0.8 },
  },
  /** The cathedral column: buttressed trunk, a crown you walk under. */
  beech_giant: {
    id: "beech_giant",
    program: "giant",
    stratum: "emergent",
    // 20–28 before the 2026-08-07 grandeur pass. At 20 the crown top cleared
    // the surrounding p95 canopy by 5 blocks on the old-growth fixture, which
    // is a tall tree and not an emergent; 26–34 clears it by ~20.
    height: [26, 34],
    trunkSymbol: "wood.dark_oak_log",
    leafSymbol: "wood.dark_oak_leaves",
    rootSymbol: "wood.dark_oak_log",
    // Vines off the crown. A temperate old-growth beech is the tree the walk
    // said had "nothing hanging besides vines" — so it gets the vines, in
    // quantity, and only from the crown rim (§3.7.2).
    hangingSymbol: "foliage.vine",
    climates: ["temperate"],
    knobs: {
      trunkSpan: 2,
      rootDepth: 3,
      rootRise: 3,
      rootRun: [3, 6],
      buttresses: [4, 7],
      branches: [5, 8],
      limb: 6,
      mass: 3,
      leader: 3,
      crown: 4,
      crownLimbs: [4, 6],
      crownRun: 4,
      hangingShare: 0.4,
      curtain: [3, 8],
    },
  },
  /** The real oak: lumpy, asymmetric, sky between its masses. */
  oak_spreading: {
    id: "oak_spreading",
    program: "broadleaf",
    stratum: "canopy",
    height: [8, 12],
    trunkSymbol: "wood.oak_log",
    leafSymbol: "wood.oak_leaves",
    climates: ["temperate"],
    knobs: { branches: [3, 5], limb: 3, mass: 2 },
  },
  /** A curtain over water. Reads "riverbank" in one glance, from any angle. */
  willow_weeping: {
    id: "willow_weeping",
    program: "weeping",
    stratum: "canopy",
    height: [7, 10],
    trunkSymbol: "wood.oak_log",
    leafSymbol: "wood.oak_leaves",
    hangingSymbol: "foliage.vine",
    climates: ["temperate", "tropical"],
    knobs: { radius: 3, squash: 0.8, curtainShare: 0.6, curtain: [2, 5] },
  },
  /** The layer between grass and canopy — why an old wood feels deep. */
  hazel_shrub: {
    id: "hazel_shrub",
    program: "blob",
    stratum: "understory",
    height: [3, 5],
    trunkSymbol: "wood.oak_log",
    leafSymbol: "wood.azalea_leaves",
    climates: ["temperate"],
    knobs: { radius: 2, squash: 0.9 },
  },
  /** Pink. The only pink in the block table, and worth a species on its own. */
  cherry_blossom: {
    id: "cherry_blossom",
    program: "broadleaf",
    stratum: "canopy",
    height: [6, 9],
    trunkSymbol: "wood.cherry_log",
    leafSymbol: "wood.cherry_leaves",
    climates: ["temperate"],
    knobs: { branches: [3, 4], limb: 2, mass: 2 },
  },
  /** The savannah plate on a bare trunk. Unmistakable at range and from below. */
  acacia_umbrella: {
    id: "acacia_umbrella",
    program: "umbrella",
    stratum: "canopy",
    height: [6, 9],
    trunkSymbol: "wood.acacia_log",
    leafSymbol: "wood.acacia_leaves",
    climates: ["arid"],
    knobs: { radius: 4, plates: 2 },
  },
  /** A bent, mostly-dead hardwood holding one live limb. Punctuation. */
  desert_ironwood: {
    id: "desert_ironwood",
    program: "ancient",
    stratum: "emergent",
    // Punctuation in an empty landscape, so it needs less height than a beech
    // to read — but it still has to stand over an `acacia_umbrella` (6–9 plus
    // its plate) by §8's prominence bar, and its crown thins with `age`, so 17
    // is the floor. 10–15 before 2026-08-07.
    height: [17, 23],
    age: [0.5, 0.85],
    trunkSymbol: "wood.acacia_log",
    leafSymbol: "wood.acacia_leaves",
    deadSymbol: "wood.stripped_oak_log",
    climates: ["arid"],
    knobs: { leanMax: 3, branches: [3, 5], limb: 3, mass: 2 },
  },
  /** *The* canopy giant: buttress roots, vines off every limb. */
  kapok_emergent: {
    id: "kapok_emergent",
    program: "giant",
    stratum: "emergent",
    // The tallest thing in the catalog, and it has to be: `jungle_broadleaf`
    // runs to 14 and the kapok's job is to read as *above* it (§4.1).
    height: [30, 40],
    trunkSymbol: "wood.jungle_log",
    leafSymbol: "wood.jungle_leaves",
    rootSymbol: "wood.jungle_log",
    hangingSymbol: "foliage.vine",
    climates: ["tropical"],
    knobs: {
      trunkSpan: 2,
      rootDepth: 3,
      rootRise: 3,
      rootRun: [4, 6],
      buttresses: [5, 7],
      branches: [5, 8],
      limb: 6,
      mass: 3,
      leader: 3,
      crown: 4,
      crownLimbs: [4, 6],
      crownRun: 4,
      // A kapok is *the* draped tree: more curtains, longer, than the beech.
      hangingShare: 0.55,
      curtain: [4, 9],
    },
  },
  /** The bulk tropical canopy — what makes the kapok read as *above* something. */
  jungle_broadleaf: {
    id: "jungle_broadleaf",
    program: "broadleaf",
    stratum: "canopy",
    height: [9, 14],
    trunkSymbol: "wood.jungle_log",
    leafSymbol: "wood.jungle_leaves",
    climates: ["tropical"],
    knobs: { branches: [3, 5], limb: 3, mass: 3 },
  },
  /** A single small plate at head height: the tropical floor layer. */
  tree_fern: {
    id: "tree_fern",
    program: "umbrella",
    stratum: "understory",
    height: [3, 5],
    trunkSymbol: "wood.jungle_log",
    leafSymbol: "wood.jungle_leaves",
    climates: ["tropical"],
    knobs: { radius: 3, plates: 1 },
  },
} satisfies Readonly<Record<string, FloraSpeciesDef>>);

/**
 * The closed species registry: the legacy four, then the naturalistic catalog.
 *
 * `ForestSpecies.shape` indexes into this, and the four existing names resolve
 * to entries whose output is byte-identical to today.
 */
export const FLORA_SPECIES: Readonly<Record<string, FloraSpeciesDef>> = Object.freeze({
  spruce_tall: { ...LEGACY_FLORA_SPECIES.spruce_tall, stratum: "canopy", climates: ["boreal", "temperate"] },
  spruce_squat: { ...LEGACY_FLORA_SPECIES.spruce_squat, stratum: "canopy", climates: ["boreal"] },
  oak_round: { ...LEGACY_FLORA_SPECIES.oak_round, stratum: "canopy", climates: ["temperate"] },
  birch_slim: { ...LEGACY_FLORA_SPECIES.birch_slim, stratum: "canopy", climates: ["temperate"] },
  ...NATURALISTIC_FLORA_SPECIES,
});

/**
 * Resolve a species id.
 *
 * A miss is a compiler bug rather than a document error — the validator's enum
 * and this registry are the same closed vocabulary — so it throws, loudly. A
 * silently-missing entry looks exactly like "the grammar is broken".
 */
export function speciesFor(id: string): FloraSpeciesDef {
  const def = FLORA_SPECIES[id];
  if (def === undefined) throw new Error(`flora: unknown species "${id}"`);
  return def;
}

/**
 * The per-climate default composition tables (§5.2).
 *
 * One row per stratum per climate. `canopy` is present for completeness — the
 * canopy default is `params.species` unless the author asks otherwise — and no
 * row may name a `fantasy` species (§2, asserted by `flora-species.test.ts`).
 */
export const CLIMATE_STRATA: Readonly<
  Record<string, Readonly<Record<"emergent" | "canopy" | "understory", readonly string[]>>>
> = Object.freeze({
  boreal: {
    emergent: ["spruce_ancient"],
    canopy: ["spruce_tall", "larch_columnar"],
    understory: ["juniper_scrub"],
  },
  temperate: {
    emergent: ["beech_giant"],
    canopy: ["oak_spreading", "birch_slim"],
    understory: ["hazel_shrub"],
  },
  arid: {
    emergent: ["desert_ironwood"],
    canopy: ["acacia_umbrella"],
    understory: ["juniper_scrub"],
  },
  tropical: {
    emergent: ["kapok_emergent"],
    canopy: ["jungle_broadleaf", "willow_weeping"],
    understory: ["tree_fern"],
  },
});

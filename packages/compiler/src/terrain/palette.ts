/**
 * Style palettes for the terrain profile.
 *
 * A palette symbol resolves to either a single block or a weighted `mix`. A
 * mix is resolved **per column by position-keyed hash**, never by a sequential
 * RNG draw — so a black-sand beach looks the same whether the compiler walked
 * the region row-major, chunk-major, or in parallel.
 */

import {
  positionWeighted,
  streamSeed,
  type MaterialTheme,
  type Seed256,
  type StoneSet,
} from "@terrainist/stdlib";
import type { PaletteValue, TerrainStyle } from "@terrainist/spec";

import type { PrismarineStack } from "../emit/prismarine.js";

/** The profile's default symbol table (`docs/LOAM-TERRAIN-PROFILE-v0.md`). */
export const DEFAULT_PALETTE: Readonly<Record<string, PaletteValue>> = Object.freeze({
  "ground.bedrock": "minecraft:bedrock",
  "ground.stone": "minecraft:stone",
  "ground.surface": "minecraft:grass_block",
  "ground.subsurface": "minecraft:dirt",
  "ground.cliff": "minecraft:stone",
  "ground.beach": "minecraft:sand",
  "ground.underwater": "minecraft:gravel",
  "ground.peak": "minecraft:stone",
  // --- rock detail (G2.5b) -------------------------------------------------
  "ground.deepslate": "minecraft:deepslate",
  "ground.andesite": "minecraft:andesite",
  "ground.tuff": "minecraft:tuff",
  "ground.cobblestone": "minecraft:cobblestone",
  "ground.gravel": "minecraft:gravel",
  "ground.sand": "minecraft:sand",
  "ground.clay": "minecraft:clay",
  "ground.mud": "minecraft:mud",
  "ground.coarse_dirt": "minecraft:coarse_dirt",
  "ground.rooted_dirt": "minecraft:rooted_dirt",
  "ground.podzol": "minecraft:podzol",
  "ground.snow_block": "minecraft:snow_block",
  // --- volcanic ------------------------------------------------------------
  "ground.basalt": "minecraft:basalt",
  "ground.blackstone": "minecraft:blackstone",
  "ground.magma": "minecraft:magma_block",
  // --- caves (G5a) ---------------------------------------------------------
  // `cave_air` rather than `air`: Minecraft distinguishes the two for light
  // propagation and mob spawning, and it also gives the physics readback a way
  // to tell a carved interval from the sky above the terrain.
  "cave.air": "minecraft:cave_air",
  "cave.floor": "minecraft:dripstone_block",
  "cave.dripstone": "minecraft:pointed_dripstone",
  "cave.moss": "minecraft:moss_carpet",
  "cave.cobweb": "minecraft:cobweb",
  // --- ground cover --------------------------------------------------------
  "foliage.short_grass": "minecraft:short_grass",
  "foliage.tall_grass": "minecraft:tall_grass",
  "foliage.fern": "minecraft:fern",
  "foliage.dead_bush": "minecraft:dead_bush",
  "foliage.moss_carpet": "minecraft:moss_carpet",
  "foliage.brown_mushroom": "minecraft:brown_mushroom",
  "foliage.red_mushroom": "minecraft:red_mushroom",
  "foliage.sweet_berry_bush": "minecraft:sweet_berry_bush",
  "foliage.azalea": "minecraft:azalea",
  "foliage.lily_pad": "minecraft:lily_pad",
  "foliage.seagrass": "minecraft:seagrass",
  "foliage.tall_seagrass": "minecraft:tall_seagrass",
  "foliage.kelp": "minecraft:kelp",
  "foliage.kelp_plant": "minecraft:kelp_plant",
  "flower.poppy": "minecraft:poppy",
  "flower.dandelion": "minecraft:dandelion",
  "flower.cornflower": "minecraft:cornflower",
  "flower.oxeye_daisy": "minecraft:oxeye_daisy",
  "flower.azure_bluet": "minecraft:azure_bluet",
  "liquid.water": "minecraft:water",
  "liquid.lava": "minecraft:lava",
  "foliage.snow_layer": "minecraft:snow",
  "wood.spruce_log": "minecraft:spruce_log",
  "wood.spruce_leaves": "minecraft:spruce_leaves",
  "wood.oak_log": "minecraft:oak_log",
  "wood.oak_leaves": "minecraft:oak_leaves",
  "wood.birch_log": "minecraft:birch_log",
  "wood.birch_leaves": "minecraft:birch_leaves",
  // --- the flora grammar's naturalistic catalog (FLORA-GRAMMAR-v0 §4.2) ----
  "wood.dark_oak_log": "minecraft:dark_oak_log",
  "wood.dark_oak_leaves": "minecraft:dark_oak_leaves",
  "wood.jungle_log": "minecraft:jungle_log",
  "wood.jungle_leaves": "minecraft:jungle_leaves",
  "wood.acacia_log": "minecraft:acacia_log",
  "wood.acacia_leaves": "minecraft:acacia_leaves",
  "wood.cherry_log": "minecraft:cherry_log",
  "wood.cherry_leaves": "minecraft:cherry_leaves",
  "wood.azalea_leaves": "minecraft:azalea_leaves",
  "wood.stripped_oak_log": "minecraft:stripped_oak_log",
  "wood.stripped_spruce_log": "minecraft:stripped_spruce_log",
  "foliage.vine": "minecraft:vine",
  "fungal.brown_cap": "minecraft:brown_mushroom_block",
  // --- the fungal and fantasy tiers (FLORA-GRAMMAR-v0 §4.2, WP-C) ----------
  // All against the pinned 1.21.11 table; `flora-fungal.test.ts` holds every
  // one of them to a block the registry actually carries, because a block name
  // that does not exist is a chunk the client refuses to parse.
  "fungal.stem": "minecraft:mushroom_stem",
  "fungal.red_cap": "minecraft:red_mushroom_block",
  "fungal.warped_stem": "minecraft:warped_stem",
  "fungal.warped_cap": "minecraft:warped_wart_block",
  "glow.shroomlight": "minecraft:shroomlight",
  "glow.glowstone": "minecraft:glowstone",
  /**
   * The flora tier's glow lichen.
   *
   * **Not** `foliage.glow_lichen`, which §4.2 names and which this palette
   * deliberately does *not* carry: that symbol is the green skin's, and it is
   * theme-gated (`GLOW_LICHEN_SYMBOL`, `defineGreenSkinSymbols`) precisely so a
   * medieval ruin does not glow at night. Putting it in `DEFAULT_PALETTE` would
   * make `palette.has` true everywhere and open that gate for every ruined
   * world — a behaviour change to shipped worlds in exchange for a spelling. So
   * the fantasy tier takes its own symbol in its own family, resolving to the
   * same block.
   */
  "glow.lichen": "minecraft:glow_lichen",
  "foliage.firefly_bush": "minecraft:firefly_bush",
  "crystal.amethyst": "minecraft:amethyst_block",
  "crystal.cluster": "minecraft:amethyst_cluster",
  "ground.mycelium": "minecraft:mycelium",
  "ground.moss_block": "minecraft:moss_block",
  // --- roads (G4b) ---------------------------------------------------------
  "road.surface": "minecraft:dirt_path",
  "road.shoulder": {
    mix: [
      ["minecraft:gravel", 3] as const,
      ["minecraft:cobblestone", 2] as const,
    ],
  },
  "road.step": "minecraft:stone_bricks",
  "road.subsurface": "minecraft:dirt",
  "road.post": "minecraft:oak_fence",
  "road.lantern": "minecraft:lantern",

  // --- the plaza (G4.5a) ---------------------------------------------------
  "plaza.path": "minecraft:dirt_path",
  "plaza.gravel": "minecraft:gravel",
  "plaza.cobble": "minecraft:cobblestone",
  "plaza.border": "minecraft:stone_bricks",
  "plaza.well_wall": "minecraft:cobblestone_wall",
});

/* -------------------------------------------------------------------------- */
/* urban street materials (U1)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The four symbols a **district street** is surfaced from.
 *
 * A rural lane and a downtown avenue used to be the same two blocks — dirt
 * path with a gravel verge — on the theory that "a player cannot tell the
 * difference". A player walked the headline city and told the difference
 * immediately. So a street has its own material class, chosen by the
 * segment's width class:
 *
 * - `carriageway` is the tarmac body of an avenue or a street;
 * - `carriageway.worn` is a second, close tone mixed in at a low positional
 *   frequency, so the road reads as patched asphalt rather than one flat slab;
 * - `marking` is the dashed centre line, painted on avenues only;
 * - `lane.surface` is what a back lane gets — older, rougher, no markings.
 *
 * These are **not** members of {@link DEFAULT_PALETTE}: their default depends
 * on the settlement's material theme, and the palette is resolved long before
 * a theme is drawn. The street pass asks the palette first (so
 * `style.palettes` still overrides everything) and falls back to the theme
 * table below. That is the same "symbol, else named default" idiom the
 * streetscape's `street.crossing.*` symbols already use.
 */
export interface StreetMaterials {
  readonly carriageway: string;
  readonly worn: string;
  readonly marking: string;
  readonly lane: string;
  /**
   * The **border course**: the outermost carriageway column, every class.
   *
   * A road with no edge is the "gray blob with speckles" the walk reported.
   * Until now an edge existed only where the streetscape happened to lay a
   * sidewalk curb — which needs a sidewalk band *and* ground already flush with
   * the road, so it vanished on every hillside street, every arterial, every
   * back lane and every district with no sidewalk. The border is now the
   * carriageway's own outer band, so it is laid by the surfacer, on every
   * class, on any slope, whether or not anything flanks it.
   *
   * Kept in the paving family and deliberately *not* the sidewalk's paving:
   * the eye needs three tones across the section — walk, edge, road.
   */
  readonly kerb: string;
  /**
   * The **gutter course**: a dithered second course just inboard of the border,
   * laid only on carriageways wide enough to keep a body between the two.
   *
   * This is the coursing that turns a wide avenue from one flat tone into a
   * read cross-section — border, gutter, body, gutter, border — without adding
   * a single block of height. Dithered rather than solid so it reads as laid
   * stone rather than as painted line.
   */
  readonly course: string;
}

/** Palette symbol names for {@link StreetMaterials}, in the same order. */
export const STREET_CARRIAGEWAY_SYMBOL = "street.carriageway";
/** @see STREET_CARRIAGEWAY_SYMBOL */
export const STREET_CARRIAGEWAY_WORN_SYMBOL = "street.carriageway.worn";
/** @see STREET_CARRIAGEWAY_SYMBOL */
export const STREET_MARKING_SYMBOL = "street.marking";
/** @see STREET_CARRIAGEWAY_SYMBOL */
export const STREET_LANE_SYMBOL = "street.lane.surface";
/**
 * The carriageway's border course.
 *
 * Deliberately the **same symbol** the streetscape's sidewalk kerb resolves
 * from (`GROUND_ROLE_SYMBOLS.kerb`): where a sidewalk exists, its kerb line and
 * the carriageway's border are one continuous course of one material, which is
 * what a kerb is. Where no sidewalk exists the carriageway lays it alone.
 */
export const STREET_KERB_SYMBOL = "street.curb";
/** @see STREET_CARRIAGEWAY_SYMBOL */
export const STREET_COURSE_SYMBOL = "street.carriageway.course";

/**
 * Concrete tarmac and painted lines — the modern default.
 *
 * Every block name here is checked against the pinned 1.21.11 block table by
 * a test, because a theme whose stair or slab variant does not exist in the
 * pinned version has bitten this codebase before.
 */
export const MODERN_STREET_MATERIALS: StreetMaterials = Object.freeze({
  carriageway: "minecraft:gray_concrete",
  worn: "minecraft:light_gray_concrete",
  marking: "minecraft:white_concrete",
  lane: "minecraft:cobblestone",
  kerb: "minecraft:smooth_stone",
  course: "minecraft:andesite",
});

/**
 * Street materials per material theme id (`@terrainist/stdlib`'s themes).
 *
 * The rustic themes get stone, not concrete: a timber village with a poured
 * concrete avenue reads as two worlds spliced together. Each one keeps the
 * same *structure* — a body, a close second tone, a paler line, a rougher
 * back lane — so the wear mix and the centre line read identically whatever
 * the theme is.
 */
export const STREET_MATERIALS_BY_THEME: Readonly<Record<string, StreetMaterials>> =
  Object.freeze({
    // Cobbled market town: cobble body, mossy patching, a pale stone-brick
    // centre course, gravel back lanes.
    temperate_timber: Object.freeze({
      carriageway: "minecraft:cobblestone",
      worn: "minecraft:mossy_cobblestone",
      marking: "minecraft:stone_bricks",
      lane: "minecraft:gravel",
      kerb: "minecraft:andesite",
      course: "minecraft:stone",
    }),
    // Northern pine: the local rock is deepslate, so the street is too.
    boreal_pine: Object.freeze({
      carriageway: "minecraft:cobbled_deepslate",
      worn: "minecraft:deepslate_bricks",
      marking: "minecraft:polished_diorite",
      lane: "minecraft:gravel",
      // The kerb was polished deepslate — the same dark stone as the
      // carriageway, so the edge of the road disappeared into the road. Pale
      // smooth stone reads as an edge at a glance and stays inside the boreal
      // palette. Default chosen under the never-wait rule, 2026-08-14;
      // revisit on walk evidence.
      kerb: "minecraft:smooth_stone",
      course: "minecraft:deepslate_tiles",
    }),
    // Chalk downs: pale, dry, andesite-and-smooth-stone.
    birchwood_downs: Object.freeze({
      carriageway: "minecraft:andesite",
      worn: "minecraft:cobblestone",
      marking: "minecraft:smooth_stone",
      lane: "minecraft:coarse_dirt",
      kerb: "minecraft:polished_andesite",
      course: "minecraft:stone",
    }),
    modern_city: MODERN_STREET_MATERIALS,
    // Quartz and calcite: a pale, swept street to match the pale, swept
    // buildings. Smooth stone is the back lane because gravel beside quartz
    // reads as a building site.
    white_quartz: Object.freeze({
      carriageway: "minecraft:calcite",
      worn: "minecraft:smooth_quartz",
      marking: "minecraft:quartz_block",
      lane: "minecraft:smooth_stone",
      kerb: "minecraft:polished_diorite",
      course: "minecraft:diorite",
    }),
    // Sun-baked antiquity: a dusty terracotta carriageway patched with packed
    // mud, a pale smooth-sandstone centre course, cut sandstone at the edge and
    // a bare earth back lane. The road is deliberately the *darkest* thing on
    // the street, because the whole read of the reference is pale walls
    // standing over a dust-coloured ground.
    sun_clay: Object.freeze({
      carriageway: "minecraft:terracotta",
      worn: "minecraft:packed_mud",
      marking: "minecraft:smooth_sandstone",
      lane: "minecraft:coarse_dirt",
      kerb: "minecraft:cut_sandstone",
      course: "minecraft:sandstone",
    }),
    // The hive's floor is the hive: resin trails over blackstone, with the
    // "marking" a vein of glowing growth rather than paint.
    xeno_resin: Object.freeze({
      carriageway: "minecraft:blackstone",
      worn: "minecraft:crimson_nylium",
      marking: "minecraft:shroomlight",
      lane: "minecraft:crimson_nylium",
      kerb: "minecraft:polished_blackstone",
      course: "minecraft:polished_blackstone_bricks",
    }),
  });

/** The street materials for a theme id; the modern set when it is unknown. */
export function streetMaterials(themeId: string | undefined): StreetMaterials {
  if (themeId === undefined) return MODERN_STREET_MATERIALS;
  return STREET_MATERIALS_BY_THEME[themeId] ?? MODERN_STREET_MATERIALS;
}

/* -------------------------------------------------------------------------- */
/* the built ground's material roles                                           */
/* -------------------------------------------------------------------------- */

/**
 * What the ground a settlement *built* is made of, by **role**.
 *
 * The defect this answers, in the words of a vision model shown a hill town
 * cold: *"pathways, retaining walls, platform bases and building tops are
 * constructed from the exact same grey stone brick palette; the eye perceives
 * the entire generation as one contiguous, carved stone monolith rather than
 * individual buildings on a hill."* It was right, and the cause was one line
 * repeated in six modules: `street.sidewalk` and `street.curb` are **not**
 * members of {@link DEFAULT_PALETTE}, so every consumer fell through to its own
 * hard-coded default — `smooth_stone` and `stone_bricks` — whatever theme the
 * settlement was built in. The retaining wall, the kerb, the stair tread, the
 * canal coping, the courtyard edge and the forecourt all landed on the same two
 * blocks, and `road.step` was a third that never moved either.
 *
 * A role is not a block. It is a *job in the built ground*, and the whole point
 * is that three jobs a player can tell apart get three materials:
 *
 * - **paving** — {@link pavement}, {@link kerb}, {@link tread}: what you walk
 *   on beside a carriageway and up a flight. Dressed, flat, and never the
 *   carriageway's own material, because a kerb that matches the road is not a
 *   kerb.
 * - **revetment** — {@link revetment}, {@link coping}, {@link rail},
 *   {@link stairs}, {@link slab}, {@link weep}: masonry that *holds earth*.
 *   Rougher and heavier than the paving, capped by a dressed course, weeping
 *   through an aged one.
 * - **the building's base** — {@link plinth}: the course a building stands on
 *   where its lot meets open ground, and the face of a platform whose top *is*
 *   a building's ground. It belongs to the building, not to the infrastructure.
 * - **earth** — {@link bank}, {@link scree}: what a cut face nobody walled is
 *   finished with. Not a block a mason laid; a slope somebody graded.
 *
 * Every entry is a full block except {@link rail} (a `_wall`), {@link stairs}
 * (a `_stairs`) and {@link slab} (a `_slab`); a test asserts that the nine
 * full-block roles resolve to nine *different* blocks for every shipped theme,
 * which is the property the defect violated and the only one worth pinning —
 * *which* block reads best is a walk's decision, not a test's.
 */
export interface GroundMaterials {
  /** The walking band beside a carriageway. */
  readonly pavement: string;
  /** The edge course between carriageway and pavement. */
  readonly kerb: string;
  /** What a flight of steps is paved with. */
  readonly tread: string;
  /** The face of masonry that holds earth. */
  readonly revetment: string;
  /** The dressed course capping that masonry. */
  readonly coping: string;
  /** A building's base course, and the face of a platform a building sits on. */
  readonly plinth: string;
  /** The aged, damp course a revetment weeps through. */
  readonly weep: string;
  /** The balustrade above a drop — a `_wall` block. */
  readonly rail: string;
  /** A tread's nosing — a `_stairs` block. */
  readonly stairs: string;
  /** A half course — a `_slab` block. */
  readonly slab: string;
  /** Earth a graded cut face is finished with. */
  readonly bank: string;
  /** The loose toe of that bank. */
  readonly scree: string;
}

/** The palette symbol each {@link GroundMaterials} role lands on. */
export const GROUND_ROLE_SYMBOLS: Readonly<Record<keyof GroundMaterials, string>> = Object.freeze({
  // Two symbols that already existed and never had a value: the whole defect.
  pavement: "street.sidewalk",
  kerb: "street.curb",
  // One that had a value and never varied.
  tread: "road.step",
  revetment: "ground.revetment",
  coping: "ground.coping",
  plinth: "ground.plinth",
  weep: "ground.weep",
  rail: "ground.balustrade",
  stairs: "ground.stairs",
  slab: "ground.slab",
  bank: "ground.bank",
  scree: "ground.scree",
});

/** The full-block roles — the ones a theme must keep distinct from each other. */
export const GROUND_SOLID_ROLES: readonly (keyof GroundMaterials)[] = Object.freeze([
  "pavement",
  "kerb",
  "tread",
  "revetment",
  "coping",
  "plinth",
  "weep",
  "bank",
  "scree",
]);

/**
 * Concrete, dressed stone and a mossy course — the modern default.
 *
 * The set every unknown theme derives *against*: {@link deriveGroundMaterials}
 * fills a role from the theme's own sets and falls back here when the theme
 * cannot supply a block that role does not already share with another.
 */
export const MODERN_GROUND_MATERIALS: GroundMaterials = Object.freeze({
  pavement: "minecraft:smooth_stone",
  kerb: "minecraft:polished_andesite",
  tread: "minecraft:smooth_quartz",
  revetment: "minecraft:stone_bricks",
  coping: "minecraft:polished_diorite",
  plinth: "minecraft:quartz_block",
  weep: "minecraft:mossy_stone_bricks",
  rail: "minecraft:stone_brick_wall",
  stairs: "minecraft:stone_brick_stairs",
  slab: "minecraft:stone_brick_slab",
  bank: "minecraft:coarse_dirt",
  scree: "minecraft:gravel",
});

/**
 * Ground materials per material theme id.
 *
 * The same shape {@link STREET_MATERIALS_BY_THEME} has, for the same reason and
 * with the same discipline: each theme fills in the *same twelve jobs*, so a
 * kerb is a kerb and a revetment is a revetment whatever palette the settlement
 * is drawn in, and a reader can check a theme by reading down one column. Every
 * block here is checked against the pinned 1.21.11 block table by a test.
 *
 * Three rules govern the choices, and they are the only ones a test can hold:
 * the nine solid roles of a theme are nine different blocks; none of
 * {@link GroundMaterials.pavement}, `kerb` or `tread` is that theme's
 * carriageway — a pavement the colour of the road is the defect restated; and
 * `rail`, `stairs` and `slab` are cut from the **revetment's own family**,
 * because a balustrade is the top of the wall it stands on and a nosing is the
 * step cut into it.
 */
export const GROUND_MATERIALS_BY_THEME: Readonly<Record<string, GroundMaterials>> = Object.freeze({
  // Cobbled market town: dressed flags on the pavement, rubble in the walls,
  // a warm brick plinth under the timber so the base reads as the building's.
  temperate_timber: Object.freeze({
    pavement: "minecraft:smooth_stone",
    kerb: "minecraft:andesite",
    tread: "minecraft:stone_bricks",
    revetment: "minecraft:mossy_cobblestone",
    coping: "minecraft:polished_andesite",
    plinth: "minecraft:bricks",
    weep: "minecraft:mossy_stone_bricks",
    rail: "minecraft:mossy_cobblestone_wall",
    stairs: "minecraft:mossy_cobblestone_stairs",
    slab: "minecraft:mossy_cobblestone_slab",
    bank: "minecraft:coarse_dirt",
    scree: "minecraft:gravel",
  }),
  // Northern pine: the road is deepslate, so the pavement is pale andesite
  // against it and the walls are the older cobble the town was built from.
  boreal_pine: Object.freeze({
    pavement: "minecraft:andesite",
    // Same ruling as the street table's kerb: pale against the deepslate
    // carriageway instead of a second tone of it (2026-08-14).
    kerb: "minecraft:smooth_stone",
    tread: "minecraft:polished_andesite",
    revetment: "minecraft:cobblestone",
    coping: "minecraft:stone_bricks",
    plinth: "minecraft:deepslate_tiles",
    weep: "minecraft:mossy_cobblestone",
    rail: "minecraft:cobblestone_wall",
    stairs: "minecraft:cobblestone_stairs",
    slab: "minecraft:cobblestone_slab",
    bank: "minecraft:podzol",
    scree: "minecraft:gravel",
  }),
  // Chalk downs: pale, dry and dressed; the revetment is the one damp thing on
  // the hill, which is what a cutting looks like in chalk country.
  birchwood_downs: Object.freeze({
    pavement: "minecraft:polished_diorite",
    kerb: "minecraft:stone_bricks",
    tread: "minecraft:polished_andesite",
    revetment: "minecraft:mossy_cobblestone",
    coping: "minecraft:chiseled_stone_bricks",
    plinth: "minecraft:bricks",
    weep: "minecraft:mossy_stone_bricks",
    rail: "minecraft:mossy_cobblestone_wall",
    stairs: "minecraft:mossy_cobblestone_stairs",
    slab: "minecraft:mossy_cobblestone_slab",
    bank: "minecraft:coarse_dirt",
    scree: "minecraft:gravel",
  }),
  modern_city: MODERN_GROUND_MATERIALS,
  // Quartz and calcite. The revetment is diorite — pale, rough and *not*
  // quartz, so a wall holding a hillside reads as engineering rather than as
  // more monastery; the weep is moss, which is the only thing on the hill that
  // is neither white nor cut.
  white_quartz: Object.freeze({
    pavement: "minecraft:polished_diorite",
    kerb: "minecraft:quartz_bricks",
    tread: "minecraft:smooth_quartz",
    revetment: "minecraft:diorite",
    coping: "minecraft:chiseled_quartz_block",
    plinth: "minecraft:quartz_pillar",
    weep: "minecraft:moss_block",
    rail: "minecraft:diorite_wall",
    stairs: "minecraft:diorite_stairs",
    slab: "minecraft:diorite_slab",
    bank: "minecraft:coarse_dirt",
    scree: "minecraft:gravel",
  }),
  // Sun-baked antiquity. The paving is the dressed sandstone the town cuts for
  // itself; the revetment is mud brick, because the terraces holding an ancient
  // hillside up are older and poorer than the houses standing on them, and its
  // weep course is the packed mud the brick was made from — the one damp thing
  // in a dry palette. The plinth is fired brick, so a building's base reads as
  // the building's rather than as more terrace.
  sun_clay: Object.freeze({
    pavement: "minecraft:smooth_sandstone",
    kerb: "minecraft:cut_sandstone",
    tread: "minecraft:sandstone",
    revetment: "minecraft:mud_bricks",
    coping: "minecraft:chiseled_sandstone",
    plinth: "minecraft:bricks",
    weep: "minecraft:packed_mud",
    rail: "minecraft:mud_brick_wall",
    stairs: "minecraft:mud_brick_stairs",
    slab: "minecraft:mud_brick_slab",
    bank: "minecraft:coarse_dirt",
    scree: "minecraft:gravel",
  }),
  // The hive's built ground: blackstone masonry under resin and growth. The
  // plinth is red nether brick so a grown thing's base still reads as a base;
  // the bank and scree keep the organic families so a cut face heals chitin.
  xeno_resin: Object.freeze({
    pavement: "minecraft:polished_blackstone_bricks",
    kerb: "minecraft:polished_blackstone",
    tread: "minecraft:smooth_basalt",
    revetment: "minecraft:polished_basalt",
    coping: "minecraft:chiseled_polished_blackstone",
    plinth: "minecraft:red_nether_bricks",
    weep: "minecraft:cracked_polished_blackstone_bricks",
    rail: "minecraft:blackstone_wall",
    stairs: "minecraft:polished_blackstone_brick_stairs",
    slab: "minecraft:polished_blackstone_brick_slab",
    bank: "minecraft:crimson_nylium",
    scree: "minecraft:basalt",
  }),
});

/**
 * Ground materials for a theme the table does not name, derived from its sets.
 *
 * The table above is hand-held for the six shipped themes because a walk is
 * what decides whether a pavement reads; a theme nobody has walked still has to
 * come out legible rather than grey, and it can, because a `MaterialTheme`
 * already carries its own masonry families. Three of them are picked out by
 * position and each one takes a named member:
 *
 * - `stones[0]` is what the settlement **builds** with — the revetment and
 *   everything cut from it (rail, stairs, slab);
 * - `stones[n − 1]` is what it **paves** with;
 * - `stones[1 % n]` is what it **underpins** with — the plinth.
 *
 * Where two roles land on the same block — which they do, because a theme's
 * `accent` is routinely its neighbour's `primary` — the later role walks a
 * shared pool (every stone member, then every wood's stripped face, then every
 * roof's solid) and finally {@link MODERN_GROUND_MATERIALS}. Greedy, ordered
 * and total: the result is a pure function of the theme and no two solid roles
 * can collide.
 */
export function deriveGroundMaterials(theme: MaterialTheme): GroundMaterials {
  const stones = theme.stones;
  const n = stones.length;
  /* c8 ignore next — a themeless theme is not constructible through the spec. */
  if (n === 0) return MODERN_GROUND_MATERIALS;
  const masonry = stones[0] as StoneSet;
  const paving = stones[n - 1] as StoneSet;
  const underpin = stones[1 % n] as StoneSet;

  // The shared pool, in the order a role falls back through it: the theme's own
  // masonry first, then its joinery faces, then its roofs, and finally the
  // modern set — which is what makes the greedy pass *total*. A theme whose two
  // stone sets name each other's blocks (which is how the shipped ones are
  // written) supplies as few as three distinct solids on its own, and nine
  // roles have to come out of it.
  const pool: string[] = [];
  for (const s of stones) pool.push(s.primary, s.accent);
  for (const w of theme.woods) pool.push(w.stripped, w.log);
  for (const r of theme.roofs) pool.push(r.solid);
  pool.push(...GROUND_SOLID_ROLES.map((role) => MODERN_GROUND_MATERIALS[role]));

  const used = new Set<string>();
  const take = (...wanted: readonly string[]): string => {
    for (const candidate of [...wanted, ...pool]) {
      if (used.has(candidate)) continue;
      used.add(candidate);
      return candidate;
    }
    /* c8 ignore next 2 — the modern tail is longer than the roles it backs. */
    return wanted[0] as string;
  };

  // Order matters: the roles that most want a *specific* member go first.
  const revetment = take(masonry.primary);
  const coping = take(masonry.accent);
  const pavement = take(paving.primary);
  const kerb = take(paving.accent);
  const plinth = take(underpin.primary);
  const tread = take(paving.accent, masonry.accent);
  const weep = take(underpin.accent);
  const bank = take(MODERN_GROUND_MATERIALS.bank);
  const scree = take(MODERN_GROUND_MATERIALS.scree);
  return {
    pavement,
    kerb,
    tread,
    revetment,
    coping,
    plinth,
    weep,
    bank,
    scree,
    rail: masonry.wall,
    stairs: masonry.stairs,
    slab: masonry.slab,
  };
}

/** The ground materials for a material theme: the table, else the derivation. */
export function groundMaterials(theme: MaterialTheme | undefined): GroundMaterials {
  if (theme === undefined) return MODERN_GROUND_MATERIALS;
  return GROUND_MATERIALS_BY_THEME[theme.id] ?? deriveGroundMaterials(theme);
}

/* -------------------------------------------------------------------------- */
/* shoreline material in an ambient soil mix                                   */
/* -------------------------------------------------------------------------- */

/**
 * Blocks that are **shoreline material**: what a coast is made of, not what a
 * countryside is made of.
 *
 * Kai, walking Troy c5 (2026-08-12): *"the city's floor is appropriate, but the
 * sandstone mixed with dirt OUTSIDE the city is ugly and unnecessary."* The
 * cause was not a pass — it was the document. Luna, asked for "a walled ancient
 * city on a rise above the sandy Aegean coast", wrote
 *
 * ```json
 * "ground.surface": { "mix": [["minecraft:coarse_dirt", 3], ["minecraft:sand", 1]] }
 * ```
 *
 * which is a sandy coast expressed as the **ambient soil of the whole world**.
 * A mix is drawn per column, so what a model writes as "a bit sandy" comes out
 * as a 25% checkerboard of pale single columns over every field, ridge and
 * hollow for the width of the region — 46,051 sand columns across Troy's 512².
 *
 * The compiler already has a shore: `SurfaceClass.BEACH` paints `ground.beach`
 * along the classified coast, and that is where the document's sand belongs.
 * So a *mixed* ambient surface keeps its soil members inland and lends its
 * shoreline members to the shore that already asks for them — see
 * {@link Palette.inlandStateAt}.
 *
 * Gravel is deliberately absent: a gravelly moor is a real place, and `scree`
 * is a role the ground materials table hands out on purpose.
 */
const SHORE_SURFACE_BLOCKS: ReadonlySet<string> = new Set([
  "minecraft:sand",
  "minecraft:red_sand",
  "minecraft:suspicious_sand",
  "minecraft:sandstone",
  "minecraft:smooth_sandstone",
  "minecraft:cut_sandstone",
  "minecraft:chiseled_sandstone",
  "minecraft:red_sandstone",
  "minecraft:smooth_red_sandstone",
  "minecraft:cut_red_sandstone",
  "minecraft:chiseled_red_sandstone",
]);

/**
 * Symbols whose mix is filtered for inland ground.
 *
 * One entry, and deliberately: `ground.surface` is the only symbol laid over a
 * whole world's open country. `ground.beach`, `ground.sand` and the rock
 * symbols are asked for by name by a pass that means them.
 */
const INLAND_FILTERED_SYMBOLS: ReadonlySet<string> = new Set(["ground.surface"]);

/** A palette symbol resolved down to block state ids. */
export type ResolvedSymbol =
  | { readonly kind: "single"; readonly stateId: number }
  | { readonly kind: "mix"; readonly stateIds: Int32Array; readonly weights: number[] };

/** Every symbol of a document, resolved against one Minecraft version. */
export class Palette {
  private readonly symbols: Map<string, ResolvedSymbol>;
  private readonly stream: Seed256;
  /**
   * Symbols the **document** wrote, as opposed to the profile's own defaults.
   *
   * The distinction exists for exactly one caller — {@link defineGroundRoles},
   * which hands the palette a theme's answer for a role. A role symbol the
   * profile left blank (`street.curb`) it may fill; a role symbol the profile
   * gave a fixed default (`road.step`) it may *replace*, because that default
   * is the grey this phase is removing; a symbol the author wrote in
   * `style.palettes` it may never touch, which is what keeps
   * `style.palettes` the last word it has always been.
   */
  private readonly authored: ReadonlySet<string>;

  /**
   * Inland variants of the symbols in {@link INLAND_FILTERED_SYMBOLS} — the
   * same mix with its shoreline members dropped.
   *
   * Present only for a mix that carries **both** shoreline and soil members, so
   * the map is empty for every single-block symbol, for a mix of soils, and for
   * an outright sandy palette (a document that wants a desert gets one). That
   * emptiness is the gate: {@link inlandStateAt} is then {@link stateAt}.
   */
  private readonly inland: ReadonlyMap<string, ResolvedSymbol>;

  constructor(
    symbols: Map<string, ResolvedSymbol>,
    stream: Seed256,
    authored: ReadonlySet<string> = new Set<string>(),
    inland: ReadonlyMap<string, ResolvedSymbol> = new Map<string, ResolvedSymbol>(),
  ) {
    this.symbols = symbols;
    this.stream = stream;
    this.authored = authored;
    this.inland = inland;
  }

  /** True when the symbol is defined. */
  has(symbol: string): boolean {
    return this.symbols.has(symbol);
  }

  /** True when the *document* named this symbol, rather than the profile. */
  isAuthored(symbol: string): boolean {
    return this.authored.has(symbol);
  }

  /**
   * Give `symbol` a derived value, unless the document already named it.
   *
   * Returns whether the value landed. Deliberately the only mutator on this
   * class, and deliberately called once per compile, before any pass reads a
   * symbol: a derived default that arrived halfway through would make two
   * columns of one wall different colours.
   */
  derive(symbol: string, stateId: number): boolean {
    if (this.authored.has(symbol)) return false;
    this.symbols.set(symbol, { kind: "single", stateId });
    return true;
  }

  /** The resolved entry, or throw — unknown symbols are a compiler bug. */
  entry(symbol: string): ResolvedSymbol {
    const found = this.symbols.get(symbol);
    if (found === undefined) throw new Error(`palette: undefined symbol "${symbol}"`);
    return found;
  }

  /**
   * The block state for `symbol` at column `(x, z)`. Single-block symbols
   * ignore the position; mixes hash it.
   */
  stateAt(symbol: string, x: number, z: number): number {
    return this.drawAt(this.entry(symbol), x, z);
  }

  /**
   * The block state for `symbol` on **inland** ground at column `(x, z)`.
   *
   * Identical to {@link stateAt} for every symbol and every document except
   * one shape: an ambient surface mix that names shoreline material alongside
   * soil (`coarse_dirt` and `sand` together, say), where the shoreline members
   * are dropped and the soil members keep their relative weights. The shore
   * itself is unaffected — it is painted from `ground.beach` by the beach
   * surface class, which is the symbol that means a coast.
   *
   * @see SHORE_SURFACE_BLOCKS for the walk that asked for this.
   */
  inlandStateAt(symbol: string, x: number, z: number): number {
    const entry = this.inland.get(symbol) ?? this.entry(symbol);
    return this.drawAt(entry, x, z);
  }

  /** The position-keyed draw both accessors make. */
  private drawAt(entry: ResolvedSymbol, x: number, z: number): number {
    if (entry.kind === "single") return entry.stateId;
    const pick = positionWeighted(this.stream, x, 0, z, entry.weights);
    return entry.stateIds[pick] as number;
  }

  /** The block state for a symbol that is known to be a single block. */
  state(symbol: string): number {
    const entry = this.entry(symbol);
    if (entry.kind === "mix") return entry.stateIds[0] as number;
    return entry.stateId;
  }

  /** Symbol names, sorted — for the compile report. */
  names(): string[] {
    return [...this.symbols.keys()].sort();
  }
}

/** Anything wrong with a palette that only the block table can detect. */
export interface PaletteResolution {
  readonly palette: Palette;
  /** `symbol -> block name` pairs the block table did not recognize. */
  readonly unknownBlocks: readonly { readonly symbol: string; readonly block: string }[];
}

/**
 * The `style.palettes` key that names a village material theme.
 *
 * It is the documented override for the settlement profile's theme draw, read
 * by `themeOverride` in the structure pass — and it is *not* a block symbol.
 * Exported so that the reader and the resolver share one name: when they did
 * not, `"theme": "modern_city"` resolved as a symbol, failed the block lookup
 * and produced a bogus LOAM-T106 on every document that used the documented
 * feature.
 */
export const PALETTE_THEME_KEY = "theme";

/**
 * `style.palettes` keys that carry something other than a block.
 *
 * The single source of truth for "this key is not a symbol". Anything listed
 * here is skipped by {@link resolvePalette} and belongs to whichever pass
 * declares it.
 */
export const NON_SYMBOL_PALETTE_KEYS: ReadonlySet<string> = new Set([PALETTE_THEME_KEY]);

/**
 * Resolve the default symbol table plus any `style.palettes` overrides.
 *
 * @param stack the version-pinned block table.
 * @param style the document's `style` block, if any.
 * @param nodeSeedValue the root node's seed; the mix stream hangs off it.
 */
export function resolvePalette(
  stack: PrismarineStack,
  style: TerrainStyle | undefined,
  nodeSeedValue: Seed256,
): PaletteResolution {
  const merged: Record<string, PaletteValue> = { ...DEFAULT_PALETTE, ...(style?.palettes ?? {}) };
  const symbols = new Map<string, ResolvedSymbol>();
  const unknownBlocks: { symbol: string; block: string }[] = [];
  // What the *document* said, kept apart from what the profile defaults said,
  // so a theme-derived role can replace a profile default and never an author.
  const authored = new Set<string>(Object.keys(style?.palettes ?? {}));
  // Inland variants of an ambient surface mix — see `SHORE_SURFACE_BLOCKS`.
  const inland = new Map<string, ResolvedSymbol>();

  for (const symbol of Object.keys(merged).sort()) {
    if (NON_SYMBOL_PALETTE_KEYS.has(symbol)) continue;
    const value = merged[symbol] as PaletteValue;
    if (typeof value === "string") {
      const block = stack.blockByName(value);
      if (block === undefined) {
        unknownBlocks.push({ symbol, block: value });
        continue;
      }
      symbols.set(symbol, { kind: "single", stateId: block.stateId });
      continue;
    }
    const stateIds: number[] = [];
    const weights: number[] = [];
    const soilIds: number[] = [];
    const soilWeights: number[] = [];
    for (const [name, weight] of value.mix) {
      const block = stack.blockByName(name);
      if (block === undefined) {
        unknownBlocks.push({ symbol, block: name });
        continue;
      }
      stateIds.push(block.stateId);
      weights.push(weight);
      if (!SHORE_SURFACE_BLOCKS.has(name)) {
        soilIds.push(block.stateId);
        soilWeights.push(weight);
      }
    }
    if (stateIds.length === 0) continue;
    symbols.set(
      symbol,
      stateIds.length === 1
        ? { kind: "single", stateId: stateIds[0] as number }
        : { kind: "mix", stateIds: Int32Array.from(stateIds), weights },
    );
    // The inland variant, for the one mix that is laid over open country. Built
    // only when the mix is genuinely *mixed* — some shore and some soil — so a
    // sandy palette stays sandy and a soil palette is untouched.
    if (
      INLAND_FILTERED_SYMBOLS.has(symbol) &&
      soilIds.length > 0 &&
      soilIds.length < stateIds.length
    ) {
      inland.set(
        symbol,
        soilIds.length === 1
          ? { kind: "single", stateId: soilIds[0] as number }
          : { kind: "mix", stateIds: Int32Array.from(soilIds), weights: soilWeights },
      );
    }
  }

  return {
    palette: new Palette(symbols, streamSeed(nodeSeedValue, "palette"), authored, inland),
    unknownBlocks,
  };
}

/**
 * Write a theme's {@link GroundMaterials} onto a palette as its role symbols.
 *
 * **Where the fix actually lands.** Six modules ask the palette for
 * `street.sidewalk` or `street.curb` and fall back to a hard-coded grey when it
 * has no answer — the streetscape's pavement and kerb, the canal's coping and
 * quay, the courtyard's edge, the retaining wall's face, the swept profiles and
 * the forecourt. Giving the palette an answer fixes all six at once, in one
 * place, without any of them learning what a theme is; and because
 * {@link Palette.derive} refuses to move a symbol the document wrote,
 * `style.palettes` still overrides every one of them.
 *
 * Called once per compile, immediately after the settlement's theme is drawn
 * and before any pass reads a symbol.
 *
 * @returns the roles whose block the pinned block table did not recognize —
 *   empty for every shipped theme, and a test keeps it that way.
 */
/**
 * The palette symbol the green skin's glow lichen resolves through.
 *
 * A **new symbol**, and deliberately not a member of {@link DEFAULT_PALETTE}:
 * RUINS-PLAN-v0-WP6 §4.4 and Q1 ratify glow lichen as *theme-gated*, so a
 * medieval-realist ruined village does not glow at night while a high-tech
 * apocalyptic hideout does. A theme that does not declare it leaves the symbol
 * unresolved, and §4.4's substitution is skipped rather than defaulted.
 */
export const GLOW_LICHEN_SYMBOL = "foliage.glow_lichen";

/**
 * The themes that may grow glow lichen.
 *
 * > **Glow lichen is the only light a ruin may have, because it is not fire.**
 * > `quench` takes every torch, lantern, candle and campfire out by law, which
 * > is correct and leaves a dead city that is literally unreadable after dusk.
 *
 * Q1's recommendation names `fantasy`, `arcane` and `tech`; the shipped theme
 * set has no theme by any of those names, so the gate is expressed against the
 * ids that actually exist. `modern_city` is the "high-tech apocalyptic hideout"
 * theme the P4 battery candidate is drawn in, and it is the one the ruling
 * explicitly says to ship the lichen with. **Membership is one line and
 * trivially reversible either way** — Kai may simply want it everywhere.
 */
export const GLOW_LICHEN_THEMES: ReadonlySet<string> = new Set(["modern_city"]);

/**
 * Give the palette its green-skin symbols, gated on the settlement's theme.
 *
 * The twin of {@link defineGroundRoles}, called from the same place and for the
 * same reason: a symbol that arrived halfway through a compile would make two
 * columns of one wall different. `Palette.derive` refuses to move a symbol the
 * document itself wrote, so `style.palettes` is still the last word — an author
 * who wants lichen in a timber village writes it and gets it.
 *
 * @returns the symbols whose block the pinned block table did not recognize —
 *   empty for every shipped theme, and a test keeps it that way.
 */
export function defineGreenSkinSymbols(
  palette: Palette,
  stack: PrismarineStack,
  theme: MaterialTheme | undefined,
): readonly { readonly symbol: string; readonly block: string }[] {
  if (theme === undefined || !GLOW_LICHEN_THEMES.has(theme.id)) return [];
  const name = "minecraft:glow_lichen";
  const block = stack.blockByName(name);
  if (block === undefined) return [{ symbol: GLOW_LICHEN_SYMBOL, block: name }];
  palette.derive(GLOW_LICHEN_SYMBOL, block.stateId);
  return [];
}

export function defineGroundRoles(
  palette: Palette,
  stack: PrismarineStack,
  theme: MaterialTheme | undefined,
): readonly { readonly symbol: string; readonly block: string }[] {
  const materials = groundMaterials(theme);
  const unknown: { symbol: string; block: string }[] = [];
  for (const role of Object.keys(GROUND_ROLE_SYMBOLS).sort() as (keyof GroundMaterials)[]) {
    const symbol = GROUND_ROLE_SYMBOLS[role];
    const name = materials[role];
    const block = stack.blockByName(name);
    if (block === undefined) {
      unknown.push({ symbol, block: name });
      continue;
    }
    palette.derive(symbol, block.stateId);
  }
  return unknown;
}

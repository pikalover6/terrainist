/**
 * Terrain-profile document types.
 *
 * These are the *validated* shapes: a value of type {@link TerrainDocument}
 * has already been through {@link validateTerrainDocument}, so every field is
 * known-good and the compiler never re-checks it.
 */

import type { ProgramMap } from "../programs/types.js";

/** Generators allowed by the terrain profile. */
export const PROFILE_GENERATORS = [
  "terrain.heightfield@0",
  "terrain.edit@0",
  "terrain.climate@0",
  "scatter.forest@0",
] as const;

/** A generator id allowed by the profile. */
export type ProfileGenerator = (typeof PROFILE_GENERATORS)[number];

/** The nine-grid zone tokens. North is −Z, east is +X. */
export const ZONE_TOKENS = [
  "center",
  "north",
  "south",
  "east",
  "west",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
] as const;

/** A zone token. */
export type ZoneToken = (typeof ZONE_TOKENS)[number];

/** The eight `terrain.edit@0` verbs. */
export const EDIT_VERBS = [
  "ridge",
  "peak",
  "volcano",
  "plateau",
  "island",
  "valley",
  "river",
  "basin",
] as const;

/** An edit verb. */
export type EditVerbName = (typeof EDIT_VERBS)[number];

/** Verbs placed along a `course`. */
export const COURSE_VERBS: readonly EditVerbName[] = ["ridge", "valley", "river"];

/** Falloff profiles. */
export const FALLOFF_PROFILES = ["sharp", "rounded"] as const;

/** `flooded` modes of a carve verb. */
export const FLOODED_MODES = ["auto", "never"] as const;

/** One of the `flooded` modes. */
export type FloodedModeName = (typeof FLOODED_MODES)[number];

/** Tree shapes this profile implements. */
export const TREE_SHAPES = ["spruce_tall", "spruce_squat", "oak_round", "birch_slim"] as const;

/** A tree shape name. */
export type TreeShape = (typeof TREE_SHAPES)[number];

/**
 * The flora grammar's species vocabulary (FLORA-GRAMMAR-v0 §4.1).
 *
 * A superset of {@link TREE_SHAPES}: the four legacy names keep their meaning
 * and their geometry, and the naturalistic catalog is added beside them.
 * Widening an accepted enum is additive — no document that validates today
 * stops validating.
 */
export const FLORA_SPECIES_IDS = [
  ...TREE_SHAPES,
  "spruce_ancient",
  "larch_columnar",
  "juniper_scrub",
  "beech_giant",
  "oak_spreading",
  "willow_weeping",
  "hazel_shrub",
  "cherry_blossom",
  "acacia_umbrella",
  "desert_ironwood",
  "kapok_emergent",
  "jungle_broadleaf",
  "tree_fern",
  // The fungal pair (FLORA-GRAMMAR-v0 §4.1, WP-C). Naturalistic — no `fantasy`
  // flag — but with an *empty* climate list: they are not what a temperate wood
  // is made of, so they are reached only by being named.
  "mushroom_giant_red",
  "mushroom_shelf_brown",
  // The fantasy pair. Legal to name at any time; never reachable from a climate
  // default (§2), which is the compiler's business rather than the validator's.
  "glowcap",
  "crystal_spire",
] as const;

/** A flora species id — what a `species` entry's `shape` names. */
export type FloraSpeciesId = (typeof FLORA_SPECIES_IDS)[number];

/** The strata a species may occupy (FLORA-GRAMMAR-v0 §5). */
export const FLORA_STRATA = ["emergent", "canopy", "understory"] as const;

/** One stratum name. */
export type FloraStratum = (typeof FLORA_STRATA)[number];

/** Climate themes the profile understands. */
export const CLIMATE_THEMES = ["boreal", "temperate", "arid", "tropical"] as const;

/** A climate theme name. */
export type ClimateTheme = (typeof CLIMATE_THEMES)[number];

/** Ids: lowercase, digit/underscore, 1–63 chars. */
export const ID_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

/** A fractional `[fx, fz] ∈ [0,1]²` region coordinate. */
export type FractionalPoint = readonly [number, number];

/**
 * The terrain anchor a course endpoint may name instead of a coordinate.
 *
 * An author cannot know where the coast will fall — continentalness and the
 * world seed decide that — so `"coast"` says *aim at the sea* and lets the
 * compiler resolve it once the land exists.
 */
export const COAST_ANCHOR = "coast";

/**
 * One waypoint of a `course`: a fractional coordinate, or the string `"coast"`
 * in the first or last position of a carve verb's course.
 */
export type CourseWaypoint = FractionalPoint | typeof COAST_ANCHOR;

/** Carve verbs placed along a `course` — the ones `"coast"` is legal on. */
export const COAST_ANCHOR_VERBS: readonly EditVerbName[] = ["valley", "river"];

/** A palette value: a block name, or a weighted mix resolved per column. */
export type PaletteValue = string | { readonly mix: readonly (readonly [string, number])[] };

/** `style.palettes` — symbol overrides. */
export interface TerrainStyle {
  readonly palettes: Readonly<Record<string, PaletteValue>>;
}

/** Where the player spawns. */
export type SpawnSpec = { readonly zone: ZoneToken } | { readonly at: FractionalPoint };

/** Document header metadata. */
export interface TerrainMeta {
  readonly name: string;
  readonly worldSeed: number | string;
  readonly prompt?: string;
  readonly spawn?: SpawnSpec;
}

/** `envelope: { shape: "region", size: [w, d] }` on the root. */
export interface RegionEnvelope {
  readonly shape: "region";
  readonly size?: readonly [number, number];
  readonly follows?: string;
}

/** Base fields shared by every node. */
interface NodeBase {
  readonly id: string;
  readonly envelope?: RegionEnvelope;
  readonly tags?: readonly string[];
  readonly seedSalt?: string;
  readonly label?: string;
  readonly note?: string;
}

/** A `terrain.edit@0` node. */
export interface EditNode extends NodeBase {
  readonly kind: "generator";
  readonly generator: "terrain.edit@0";
  readonly params: EditParams;
}

/** Params of a `terrain.edit@0` node, after validation. */
export interface EditParams {
  readonly verb: EditVerbName;
  readonly strength?: number;
  readonly at?: FractionalPoint;
  readonly zone?: ZoneToken;
  readonly course?: readonly CourseWaypoint[];
  readonly width?: number;
  readonly height?: number;
  readonly radius?: number;
  readonly depth?: number;
  readonly profile?: "sharp" | "rounded";
  readonly rim?: number;
  readonly caldera?: boolean;
  readonly calderaDepth?: number;
  readonly lava?: boolean;
  /**
   * 0..4 — frozen lava flows spilling from the rim down the cone. The paths are
   * seeded steepest-descent runs over the final field; they are surfaced in
   * magma/blackstone/basalt, never in flowing fluid.
   */
  readonly lavaFlows?: number;
  readonly water?: boolean;
  /** 0..0.5 — angular + noise deformation of a radial verb's outline. */
  readonly irregularity?: number;
  /** 0..1 — lateral meander of a corridor verb's centreline. */
  readonly meander?: number;
  /** Whether a carve may take on ocean water. */
  readonly flooded?: FloodedModeName;
}

/** A `terrain.heightfield@0` node. */
export interface HeightfieldNode extends NodeBase {
  readonly kind: "generator";
  readonly generator: "terrain.heightfield@0";
  readonly params: Readonly<Record<string, unknown>>;
  readonly children?: readonly EditNode[];
}

/** A `terrain.climate@0` node. */
export interface ClimateNode extends NodeBase {
  readonly kind: "generator";
  readonly generator: "terrain.climate@0";
  readonly params: ClimateParams;
}

/** Params of `terrain.climate@0`. */
export interface ClimateParams {
  readonly temperatureFrequency?: number;
  readonly humidityFrequency?: number;
  readonly blendRadius?: number;
  readonly latitudeGradient?: number;
  readonly forceTheme?: ClimateTheme;
}

/** One species entry of a forest node. */
export interface ForestSpecies {
  readonly id: string;
  readonly weight?: number;
  readonly shape: FloraSpeciesId;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly trunkPalette?: string;
  readonly leafPalette?: string;
  /**
   * Absolute world Y above which this species stops (FLORA-GRAMMAR-v0 §9.6).
   *
   * A per-species elevation ceiling: the same idea as `params.elevation`,
   * applied to one species rather than to the whole node, and absolute rather
   * than relative to sea level. Absent, the node's `params.snowLine` applies;
   * absent there too, the species has no ceiling.
   */
  readonly snowLine?: number;
}

/**
 * Ground cover under a forest node (Loam v0.2 §7, `scatter.forest@0`).
 *
 * Each value is a per-eligible-column probability: `grass` covers short/tall
 * grass and ferns, `flowers` the clustered flower patches, `deadwood` dead
 * bushes and fallen logs.
 */
export interface UndergrowthParams {
  readonly grass?: number;
  readonly flowers?: number;
  readonly deadwood?: number;
}

/** Coarse area for a scatter node. */
export type ScatterArea =
  | { readonly zone: ZoneToken }
  | { readonly at: FractionalPoint; readonly radius: number }
  | { readonly all: true };

/**
 * One stratum of a forest node's composition (FLORA-GRAMMAR-v0 §5.1).
 *
 * `"default"` takes the climate table's row for this stratum; `"none"` switches
 * the layer off; an object refines it.
 */
export type StratumSpec =
  | "default"
  | "none"
  | {
      readonly species?: readonly ForestSpecies[];
      /** Emergent only; default is §5.3's area formula. */
      readonly budget?: number;
      /** Emergent only; minimum trunk-to-trunk distance, default 48. */
      readonly exclusion?: number;
      /** Understory only; default `0.45 × params.density`. */
      readonly density?: number;
    };

/** Vertical composition of a forest node (FLORA-GRAMMAR-v0 §5.1). */
export interface StrataParams {
  readonly emergent?: StratumSpec;
  /** `"authored"` (the default) means `params.species`, unchanged. */
  readonly canopy?: "authored" | "default" | { readonly species: readonly ForestSpecies[] };
  readonly understory?: StratumSpec;
  readonly floor?: "default" | "fungal" | "glow";
}

/** Params of `scatter.forest@0` in this profile. */
export interface ForestParams {
  readonly species: readonly ForestSpecies[];
  readonly area?: ScatterArea;
  readonly density?: number;
  readonly spacing?: number;
  readonly clumping?: number;
  readonly maxSlope?: number;
  readonly elevation?: readonly [number, number];
  readonly edgeFalloff?: number;
  readonly avoidTags?: readonly string[];
  /**
   * Let this forest's canopy occupy unbuilt ground inside overlapping
   * settlement claims. Buildings, roads, plazas and other built columns remain
   * excluded. Absent/false preserves the normal settlement clearing.
   */
  readonly preserveCanopy?: boolean;
  readonly undergrowth?: UndergrowthParams;
  readonly snowLine?: number;
  /**
   * Vertical composition. `true` is the one-word form —
   * `{ emergent: "default", understory: "default" }`. Absent, the node
   * scatters exactly as it does today (the reach law, §2).
   */
  readonly strata?: true | StrataParams;
}

/** A `scatter.forest@0` node. */
export interface ForestNode extends NodeBase {
  readonly kind: "generator";
  readonly generator: "scatter.forest@0";
  readonly params: ForestParams;
}

/** Any generator node the profile allows below the root. */
export type TerrainChildNode = HeightfieldNode | ClimateNode | ForestNode;

/** The root composite. */
export interface TerrainRootNode extends NodeBase {
  readonly kind: "composite";
  readonly envelope: RegionEnvelope;
  readonly children: readonly TerrainChildNode[];
}

/** A validated terrain-profile document. */
export interface TerrainDocument {
  readonly loam: string;
  readonly profile: "terrain";
  readonly meta: TerrainMeta;
  readonly style?: TerrainStyle;
  /**
   * Authored programs (§7.6). The bespoke tier is legal in the terrain profile
   * too — a monument on pure terrain is the contract's own first example — so
   * the map, and the `authored:<id>` / `scatter.program@0` nodes that reference
   * it, are validated and compiled here exactly as in the settlement profile.
   */
  readonly programs?: ProgramMap;
  readonly root: TerrainRootNode;
}

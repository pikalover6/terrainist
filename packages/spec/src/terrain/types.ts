/**
 * Terrain-profile document types (`docs/LOAM-TERRAIN-PROFILE-v0.md`).
 *
 * These are the *validated* shapes: a value of type {@link TerrainDocument}
 * has already been through {@link validateTerrainDocument}, so every field is
 * known-good and the compiler never re-checks it.
 */

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

/** Climate themes the profile understands. */
export const CLIMATE_THEMES = ["boreal", "temperate", "arid", "tropical"] as const;

/** A climate theme name. */
export type ClimateTheme = (typeof CLIMATE_THEMES)[number];

/** Ids: lowercase, digit/underscore, 1–63 chars. */
export const ID_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

/** A fractional `[fx, fz] ∈ [0,1]²` region coordinate. */
export type FractionalPoint = readonly [number, number];

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
  readonly course?: readonly FractionalPoint[];
  readonly width?: number;
  readonly height?: number;
  readonly radius?: number;
  readonly depth?: number;
  readonly profile?: "sharp" | "rounded";
  readonly rim?: number;
  readonly caldera?: boolean;
  readonly calderaDepth?: number;
  readonly lava?: boolean;
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
  readonly shape: TreeShape;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly trunkPalette?: string;
  readonly leafPalette?: string;
}

/** Coarse area for a scatter node. */
export type ScatterArea =
  | { readonly zone: ZoneToken }
  | { readonly at: FractionalPoint; readonly radius: number }
  | { readonly all: true };

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
  readonly snowLine?: number;
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
  readonly root: TerrainRootNode;
}

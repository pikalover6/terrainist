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
  "cave.carver@0",
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
  readonly shape: TreeShape;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly trunkPalette?: string;
  readonly leafPalette?: string;
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
  readonly undergrowth?: UndergrowthParams;
  readonly snowLine?: number;
}

/** A `scatter.forest@0` node. */
export interface ForestNode extends NodeBase {
  readonly kind: "generator";
  readonly generator: "scatter.forest@0";
  readonly params: ForestParams;
}

/**
 * The `cave.carver@0` styles this profile carves.
 *
 * `lava_tube` from the v0.2 §7 enum is missing on purpose: a dry tube is a lie
 * about its name, and a wet one cannot satisfy the profile's zero-unstable-
 * fluids rule. The five below are all dry.
 */
export const CAVE_STYLES = ["worm", "cheese", "spaghetti", "ravine", "chamber_network"] as const;

/** One of {@link CAVE_STYLES}. */
export type CaveStyle = (typeof CAVE_STYLES)[number];

/** Ellipsoid chambers along a cave system. */
export interface CaveChamberParams {
  /** Upper bound on chambers opened across the whole node. */
  readonly count?: number;
  /** Horizontal radius, in blocks; the vertical axis is about two-thirds of it. */
  readonly radius?: number;
  /** 0..1 — probability a chamber opportunity is taken. */
  readonly chance?: number;
  /**
   * Blocks of walked path between two chamber opportunities.
   *
   * For the walking styles this is how far apart two rooms *can* be, with
   * `chance` deciding whether the opportunity is taken; for `chamber_network`
   * it is the connector length between rooms, and `chance` does not apply.
   */
  readonly spacing?: number;
}

/**
 * Params of `cave.carver@0` in this profile — an honest subset of the v0.2 §7
 * table.
 *
 * Implemented: `style` (every value of the §7 enum except `lava_tube`),
 * `density`, `radius`, `yRange`, `verticality`, `chambers` (including
 * `spacing`), `decorate`, plus `frequency` (the wander field's spatial
 * frequency, which §7 leaves implicit) and `entrances` (v0.2's
 * `surfaceOpenings`, accepting a boolean as well as a count).
 *
 * Not implemented, and rejected rather than silently ignored: `lavaLevel`,
 * `waterTable` (a cave that carries fluid cannot satisfy the profile's
 * zero-unstable-fluids invariant without a fill solver of its own) and
 * `protectTags` (the terrain profile has no occupancy to protect).
 */
export interface CaveParams {
  /** Which shape the systems take. Default `worm`. */
  readonly style?: CaveStyle;
  /** 0..1 — how many worm systems the region carries. */
  readonly density?: number;
  /** Spatial frequency of the field that steers the worms. */
  readonly frequency?: number;
  /** `[min, max]` tunnel radius in blocks. */
  readonly radius?: readonly [number, number];
  /** `[yMin, yMax]` absolute world Y band the systems live in. */
  readonly yRange?: readonly [number, number];
  /** 0..1 — how much the worms climb and dive. */
  readonly verticality?: number;
  readonly chambers?: CaveChamberParams;
  /** Daylight mouths to force; `true`/`false` mean 1/0. Publishes `cave_mouth` markers. */
  readonly entrances?: number | boolean;
  /** Whether the compiler dresses the caves with dripstone, moss and mushrooms. */
  readonly decorate?: boolean;
}

/** A `cave.carver@0` node. */
export interface CaveNode extends NodeBase {
  readonly kind: "generator";
  readonly generator: "cave.carver@0";
  readonly params: CaveParams;
}

/** Any generator node the profile allows below the root. */
export type TerrainChildNode = HeightfieldNode | ClimateNode | ForestNode | CaveNode;

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

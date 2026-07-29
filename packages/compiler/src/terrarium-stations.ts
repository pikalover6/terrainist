/**
 * The Terrarium's multi-structure stations — a settlement in a specimen jar.
 *
 * A single-structure station answers "is this cottage right?". It cannot answer
 * "is the lane arriving at its door right?", "does the tunnel between these two
 * cellars actually connect?", or "does a plaza with four buildings around it
 * read as a village?" — because none of those things is a building, and all of
 * them are what the *pipeline* produces rather than what any one generator
 * emits. Those questions need a compiled settlement, and they need it small
 * enough to stand on a platform and be judged as one thing.
 *
 * So each station here owns a **mini-document**: a real settlement-profile Loam
 * document, thirty to a hundred blocks square, which goes through
 * {@link compileTerrain} exactly as a shipped world does — the layout solver
 * places its buildings, the road router routes its lanes, the tunnel borer digs
 * its galleries, the doorstep machinery cuts its steps. What the Terrarium then
 * does is *transplant* the result: the compiled column plan and its block lists
 * are translated into the station's platform, and everything outside the
 * platform is void.
 *
 * ## Why transplant, and not "a world per station stitched at a spacing"
 *
 * Both architectures were available. The transplant wins on three counts:
 *
 * 1. **One world, one lint.** The physics lint is a *world readback*: it opens
 *    region files and walks the blocks. A stitched design would have to lint N
 *    worlds separately, and the rig's own machinery — the plates, the buttons,
 *    the signs — would sit in none of them. Transplanted, every station is in
 *    the same region files as every other, and one `lintWorldPhysics` call with
 *    the translated building/road/tunnel context covers the whole Terrarium,
 *    traversal through the pair's tunnel included.
 * 2. **`centeredRegion` centres on the origin.** Every compiled document's
 *    region is centred at (0, 0), so *any* multi-station design has to
 *    translate — stitching would need exactly the same offset arithmetic, plus
 *    an Anvil-level merge of chunks that already exist on disk.
 * 3. **Determinism is inherited, not re-argued.** The mini-document is a fixed
 *    JSON literal with a pinned `worldSeed`; `compileTerrain` is pure; the
 *    translation is integer addition. Two Terrarium builds are byte-identical
 *    for the same reason two compiles of the same document are.
 *
 * The one thing the transplant asks of a mini-document is a **flat substrate at
 * the platform's own Y**: `baseHeight` is {@link TERRARIUM_GROUND_Y} and
 * `amplitude` is zero for every station but the deliberately sloped one, so the
 * vertical offset is zero and the platform's edge columns meet the apron the
 * machinery stands on without a step. The sloped station keeps its amplitude
 * small enough that the platform's twenty-four courses of stone still reach
 * under its deepest foundation.
 */

import type { SettlementDocument } from "@terrainist/spec";

import { compileTerrain, type CompileArtifacts } from "./terrain/compile.js";
import type { BuiltBuilding } from "./structures/buildings.js";
import type { BuiltTunnel } from "./structures/tunnels.js";
import type { PlacedProp } from "./structures/props.js";
import type { RoadRoute } from "./structures/roads.js";
import { DEV_GROUND_Y } from "./devworld.js";

/** World Y every mini-document's flat ground sits at — the platform's surface. */
export const TERRARIUM_GROUND_Y = DEV_GROUND_Y;

/** Sea level in a mini-document: far enough below the ground that nothing floods. */
const MINI_SEA_LEVEL = TERRARIUM_GROUND_Y - 8;

/** What a multi-structure station is exhibiting. */
export type MultiStationKind =
  | "connected_pair"
  | "village_slice"
  | "road_context"
  | "waterfront"
  | "tunnel_junction"
  | "hillside_lane";

/** One multi-structure station, before it is compiled or placed. */
export interface MultiStationSpec {
  /** Station id — the string the arrival plate says and the manifest joins on. */
  readonly id: string;
  readonly kind: MultiStationKind;
  /** One line for the sign, ≤ 15 characters per word or it wraps out of frame. */
  readonly title: string;
  /** What a reviewer is being asked to judge, for the manifest and the second sign. */
  readonly question: string;
  /** The mini-document's region, in blocks. */
  readonly size: readonly [number, number];
  /** The document itself — a real settlement profile, compiled by the real pipeline. */
  readonly document: SettlementDocument;
}

/* -------------------------------------------------------------------------- */
/* document construction                                                       */
/* -------------------------------------------------------------------------- */

/** A `terrain.edit@0` child of the heightfield, as loose JSON. */
type EditJson = Record<string, unknown>;

/** A child of the root, as loose JSON. */
type NodeJson = Record<string, unknown>;

/**
 * The two nodes every profile requires, plus the flat ground the transplant
 * needs.
 *
 * `amplitude: 0` with a single octave and no erosion is a table, which is the
 * point: a station platform is a table, and a substrate that disagreed with it
 * by even a block would leave the exhibit's edge hanging over void or buried in
 * the apron.
 */
function substrate(amplitude: number, edits: readonly EditJson[]): NodeJson[] {
  return [
    {
      id: "ground",
      kind: "generator",
      generator: "terrain.heightfield@0",
      label: amplitude === 0 ? "The flat substrate the station stands on" : "A gentle slope",
      params: {
        amplitude,
        baseHeight: TERRARIUM_GROUND_Y,
        seaLevel: MINI_SEA_LEVEL,
        octaves: amplitude === 0 ? 1 : 3,
        frequency: 0.012,
        gain: 0.5,
        lacunarity: 2.0,
        erosionPasses: 0,
        soilDepth: 4,
        beachWidth: 2,
      },
      ...(edits.length === 0 ? {} : { children: edits }),
    },
    {
      id: "climate",
      kind: "generator",
      generator: "terrain.climate@0",
      label: "Mild and green, so the exhibit is about the buildings",
      params: { forceTheme: "temperate" },
    },
  ];
}

/** Assemble one mini-document. */
function miniDocument(
  name: string,
  worldSeed: number,
  prompt: string,
  size: readonly [number, number],
  amplitude: number,
  edits: readonly EditJson[],
  children: readonly NodeJson[],
): SettlementDocument {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name, worldSeed, prompt, spawn: { zone: "center" } },
    root: {
      id: "world",
      kind: "composite",
      label: prompt,
      envelope: { shape: "region", size: [size[0], size[1]] },
      children: [...substrate(amplitude, edits), ...children],
    },
  } as unknown as SettlementDocument;
}

/** A `building.grammar@0` node, spelled the way the shipped example spells one. */
function building(
  id: string,
  label: string,
  size: readonly [number, number, number],
  params: Record<string, unknown>,
  constraints: readonly Record<string, unknown>[],
  ports: Record<string, unknown>,
  tags: readonly string[],
): NodeJson {
  return {
    id,
    kind: "generator",
    generator: "building.grammar@0",
    label,
    envelope: { shape: "box", size },
    params,
    constraints,
    ports,
    tags,
  };
}

/** The door port nearly every exhibit declares. */
function door(face: string): Record<string, unknown> {
  return { door: { type: "door", face, tags: ["primary"] } };
}

/** `terrain_conform` in the form the buildings here all want. */
function conform(blend: number): Record<string, unknown> {
  return { terrain_conform: "cut_fill", reference: "median", blend };
}

/* -------------------------------------------------------------------------- */
/* the stations                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every multi-structure station, in walk order.
 *
 * Deliberately six, and deliberately one question each: a station that
 * exhibited two things at once would collect a verdict about neither. They are
 * ordered from the simplest composition to the most, so a reviewer walking them
 * in order sees the machinery accumulate rather than arrive all at once.
 */
export function multiStationSpecs(): readonly MultiStationSpec[] {
  return [ROAD_CONTEXT, CONNECTED_PAIR, HILLSIDE_LANE, VILLAGE_SLICE, WATERFRONT, TUNNEL_JUNCTION];
}

/** One building, one lane, one doorstep — the smallest composition there is. */
const ROAD_CONTEXT: MultiStationSpec = {
  id: "multi__road_context",
  kind: "road_context",
  title: "lane to a door",
  question: "does the lane meet the door, and is the step onto it walkable?",
  size: [52, 52],
  document: miniDocument(
    "terrarium_road_context",
    811001,
    "one cottage with a lane arriving at its door from a small green",
    [52, 52],
    0,
    [],
    [
      {
        id: "green",
        kind: "primitive",
        label: "A scrap of green for the lane to come from",
        envelope: { shape: "region", size: [10, 10] },
        constraints: [{ zone: "south" }, { terrain_conform: "flatten", reference: "median", blend: 3 }],
        tags: ["plaza", "public"],
      },
      building(
        "cottage",
        "The cottage the lane is aimed at",
        [9, 9, 9],
        { floors: 1, roof: "gable", windowRhythm: "regular" },
        [{ zone: "north" }, { distance: "green", min: 10, max: 30 }, { facing: "green" }, conform(3)],
        door("south"),
        ["house"],
      ),
      {
        id: "lane",
        kind: "generator",
        generator: "road.network@0",
        label: "The lane",
        params: { anchors: ["green", "cottage"], pattern: "organic", width: 3, lanterns: true, lanternSpacing: 8 },
      },
    ],
  ),
};

/** Two buildings joined below ground — the station the tunnel lint is pointed at. */
const CONNECTED_PAIR: MultiStationSpec = {
  id: "multi__connected_pair",
  kind: "connected_pair",
  title: "pair + tunnel",
  question: "can you walk cellar to cellar, lit, without a jump?",
  size: [56, 56],
  document: miniDocument(
    "terrarium_connected_pair",
    811002,
    "two buildings on flat ground joined by an underground tunnel between their cellars",
    [56, 56],
    0,
    [],
    [
      building(
        "hall",
        "The hall the gallery runs from",
        [11, 10, 11],
        { floors: 1, roof: "hip", basement: { depth: 4 } },
        [{ zone: "west" }, conform(4)],
        {
          door: { type: "door", face: "south", tags: ["primary"] },
          crypt_stair: { type: "tunnel_stub", face: "east", width: 3, height: 3 },
        },
        ["civic", "hall"],
      ),
      building(
        "chapel",
        "The chapel at the gallery's far end",
        [11, 12, 11],
        { floors: 1, floorHeight: 6, basement: { depth: 4 } },
        [
          { zone: "east" },
          { distance: "hall", min: 14, max: 30 },
          { connected: "hall", via: "tunnel" },
          conform(4),
        ],
        {
          door: { type: "door", face: "south", tags: ["primary"] },
          crypt_stair: { type: "tunnel_stub", face: "west", width: 3, height: 3 },
        },
        ["civic", "chapel"],
      ),
    ],
  ),
};

/** The same pair of questions, asked on ground that is not flat. */
const HILLSIDE_LANE: MultiStationSpec = {
  id: "multi__hillside_lane",
  kind: "hillside_lane",
  title: "lane on a slope",
  question: "do the pads, the steps and the lane's grade survive real relief?",
  size: [64, 64],
  document: miniDocument(
    "terrarium_hillside_lane",
    811003,
    "two cottages on a low rise with a lane climbing between them",
    [64, 64],
    // Zero base amplitude, and every block of relief from an edit that dies
    // out well inside the region. The platform's margin ring is flat ground at
    // `TERRARIUM_GROUND_Y`, so a station whose *rim* moved would meet it with a
    // step; a station whose middle moves meets it flush and still asks the
    // question — do the pads, the doorsteps and the lane's grade survive real
    // relief? — of ground that is genuinely not flat.
    0,
    [
      {
        id: "rise",
        kind: "generator",
        generator: "terrain.edit@0",
        label: "The rise the upper cottage stands on",
        params: {
          verb: "ridge",
          course: [[0.3, 0.28], [0.7, 0.3]],
          width: 30,
          height: 8,
          profile: "rounded",
        },
      },
    ],
    [
      building(
        "upper",
        "The cottage on the rise",
        [9, 9, 9],
        { floors: 1, roof: "gable" },
        [{ zone: "north" }, { terrain_conform: "cut_fill", reference: "median", blend: 4, maxSlope: 30 }],
        door("south"),
        ["house"],
      ),
      building(
        "lower",
        "The cottage below it",
        [9, 11, 9],
        { floors: 2, roof: "gable" },
        [
          { zone: "south" },
          { distance: "upper", min: 14, max: 40 },
          { terrain_conform: "cut_fill", reference: "median", blend: 4, maxSlope: 30 },
        ],
        door("north"),
        ["house"],
      ),
      {
        id: "lane",
        kind: "generator",
        generator: "road.network@0",
        label: "The lane climbing between them",
        params: { anchors: ["upper", "lower"], pattern: "organic", width: 3, lanterns: true, lanternSpacing: 10 },
      },
    ],
  ),
};

/** A plaza, four buildings, lanes and lamps — the smallest thing that reads as a village. */
const VILLAGE_SLICE: MultiStationSpec = {
  id: "multi__village_slice",
  kind: "village_slice",
  title: "village slice",
  question: "does a plaza with four buildings and lit lanes read as a place?",
  size: [88, 88],
  document: miniDocument(
    "terrarium_village_slice",
    811004,
    "a plaza with a hall, an inn, a smithy and a cottage around it, joined by lit lanes",
    [88, 88],
    0,
    [],
    [
      {
        id: "plaza",
        kind: "primitive",
        label: "The green",
        envelope: { shape: "region", size: [18, 18] },
        constraints: [{ zone: "center" }, { terrain_conform: "flatten", reference: "median", blend: 4 }],
        tags: ["plaza", "public"],
      },
      building(
        "hall",
        "The hall on the green's north side",
        [13, 12, 11],
        { floors: 2, roof: "hip", windowRhythm: "regular" },
        [{ zone: "north" }, { adjacent_to: "plaza", gap: [1, 8] }, { facing: "plaza" }, conform(4)],
        door("south"),
        ["civic", "hall"],
      ),
      building(
        "inn",
        "The inn to the east",
        [11, 11, 9],
        { floors: 2, roof: "gable", windowRhythm: "paired" },
        [
          { zone: "east" },
          { adjacent_to: "plaza", gap: [1, 8] },
          { facing: "plaza" },
          { distance: "hall", min: 6 },
          conform(4),
        ],
        door("west"),
        ["house", "trade"],
      ),
      building(
        "smithy",
        "The smithy, kept a little apart",
        [9, 8, 9],
        { floors: 1, roof: "gable", windowRhythm: "sparse" },
        [{ zone: "west" }, { distance: "plaza", min: 6, max: 32 }, { distance: "#tag:house", min: 6 }, conform(3)],
        door("east"),
        ["craft"],
      ),
      building(
        "cottage",
        "A cottage below the green",
        [8, 8, 9],
        { floors: 1, roof: "gable" },
        [
          { zone: "south" },
          { distance: "plaza", min: 5, max: 34 },
          { distance: "#tag:house", min: 6 },
          { facing: "plaza" },
          conform(3),
        ],
        door("north"),
        ["house"],
      ),
      {
        id: "lanes",
        kind: "generator",
        generator: "road.network@0",
        label: "The lanes joining every door to the green",
        params: {
          anchors: ["plaza", "hall", "inn", "smithy", "cottage"],
          pattern: "organic",
          width: 3,
          lanterns: true,
          lanternSpacing: 12,
        },
      },
    ],
  ),
};

/** Shore, pier, boat and a building set back — the harbour-pond technique. */
const WATERFRONT: MultiStationSpec = {
  id: "multi__waterfront",
  kind: "waterfront",
  title: "waterfront",
  question: "does the pier stand in the water without leaking it onto the green?",
  size: [72, 72],
  document: miniDocument(
    "terrarium_waterfront",
    811005,
    "a boathouse set back from a small harbour with a pier and a moored rowboat",
    [72, 72],
    0,
    [
      {
        id: "harbour",
        kind: "generator",
        generator: "terrain.edit@0",
        label: "The harbour basin — a closed rim, so it holds its water",
        params: {
          verb: "basin",
          at: [0.5, 0.22],
          radius: 22,
          depth: 9,
          profile: "rounded",
          water: true,
          irregularity: 0.12,
        },
      },
    ],
    [
      building(
        "boathouse",
        "The boathouse, set back from the shore",
        [11, 10, 11],
        { floors: 1, roof: "gable", windowRhythm: "paired" },
        [{ zone: "south" }, { terrain_conform: "cut_fill", reference: "median", blend: 4 }],
        door("north"),
        ["house", "trade"],
      ),
      {
        id: "pier",
        kind: "generator",
        generator: "prop.place@0",
        label: "A pier running out into the harbour",
        params: { prop: "pier", zone: "north", length: 9, width: 2 },
      },
      {
        id: "moored_boat",
        kind: "generator",
        generator: "prop.place@0",
        label: "A rowboat moored at the pier's end",
        params: { prop: "rowboat", at: "pier" },
      },
    ],
  ),
};

/** Two galleries that cross — the composition a single tunnel cannot exhibit. */
const TUNNEL_JUNCTION: MultiStationSpec = {
  id: "multi__tunnel_junction",
  kind: "tunnel_junction",
  title: "two tunnels",
  question: "do two galleries cross without cutting into each other?",
  size: [72, 72],
  document: miniDocument(
    "terrarium_tunnel_junction",
    811006,
    "four cellared buildings on a square, joined by two tunnels that cross underground",
    [72, 72],
    0,
    [],
    [
      building(
        "north_house",
        "North end of the north-south gallery",
        [11, 10, 11],
        { floors: 1, roof: "hip", basement: { depth: 4 } },
        [{ zone: "north" }, conform(4)],
        {
          door: { type: "door", face: "south", tags: ["primary"] },
          crypt_stair: { type: "tunnel_stub", face: "south", width: 3, height: 3 },
        },
        ["civic"],
      ),
      building(
        "south_house",
        "South end of the north-south gallery",
        [11, 10, 11],
        { floors: 1, roof: "hip", basement: { depth: 4 } },
        [
          { zone: "south" },
          { distance: "north_house", min: 28, max: 52 },
          { connected: "north_house", via: "tunnel" },
          conform(4),
        ],
        {
          door: { type: "door", face: "south", tags: ["primary"] },
          crypt_stair: { type: "tunnel_stub", face: "north", width: 3, height: 3 },
        },
        ["civic"],
      ),
      building(
        "west_house",
        "West end of the east-west gallery",
        [11, 10, 11],
        { floors: 1, roof: "gable", basement: { depth: 4 } },
        [{ zone: "west" }, conform(4)],
        {
          door: { type: "door", face: "south", tags: ["primary"] },
          crypt_stair: { type: "tunnel_stub", face: "east", width: 3, height: 3 },
        },
        ["house"],
      ),
      building(
        "east_house",
        "East end of the east-west gallery",
        [11, 10, 11],
        { floors: 1, roof: "gable", basement: { depth: 4 } },
        [
          { zone: "east" },
          { distance: "west_house", min: 28, max: 52 },
          { connected: "west_house", via: "tunnel" },
          conform(4),
        ],
        {
          door: { type: "door", face: "south", tags: ["primary"] },
          crypt_stair: { type: "tunnel_stub", face: "west", width: 3, height: 3 },
        },
        ["house"],
      ),
    ],
  ),
};

/* -------------------------------------------------------------------------- */
/* compiling one                                                               */
/* -------------------------------------------------------------------------- */

/** What a compiled mini-document handed back. */
export interface CompiledMiniStation {
  readonly spec: MultiStationSpec;
  readonly artifacts: CompileArtifacts;
  readonly buildings: readonly BuiltBuilding[];
  readonly tunnels: readonly BuiltTunnel[];
  readonly props: readonly PlacedProp[];
  readonly routes: readonly RoadRoute[];
  /** Node paths that were placed, in document order. */
  readonly placements: readonly { readonly nodePath: string; readonly generator: string }[];
  /** Plaza columns paved; zero when the document declares no plaza. */
  readonly plazaColumns: number;
}

/**
 * Run one mini-document through the real compiler, without writing a world.
 *
 * A compile that fails is a *build* failure, loudly: a station whose content
 * silently did not compile would present a reviewer with an empty platform and
 * invite a verdict about nothing.
 */
export async function compileMiniStation(spec: MultiStationSpec): Promise<CompiledMiniStation> {
  let captured: CompileArtifacts | undefined;
  const result = await compileTerrain(spec.document, {
    outDir: "",
    skipEmit: true,
    onArtifacts: (a) => {
      captured = a;
    },
  });
  if (!result.ok) {
    const lines = result.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => `  ${d.code} ${d.nodePath}: ${d.message}`)
      .join("\n");
    throw new Error(`terrarium: station "${spec.id}" did not compile\n${lines}`);
  }
  /* c8 ignore next 3 — `ok` implies the callback ran. */
  if (captured === undefined) {
    throw new Error(`terrarium: station "${spec.id}" compiled but produced no artifacts`);
  }
  const structures = result.report.layout?.structures;
  return {
    spec,
    artifacts: captured,
    buildings: structures?.buildings ?? [],
    tunnels: structures?.tunnels ?? [],
    props: structures?.props ?? [],
    routes: structures?.roads?.routes ?? [],
    placements: (result.report.layout?.placements ?? []).map((p) => ({
      nodePath: p.nodePath,
      generator: generatorOf(spec.document, p.nodePath),
    })),
    plazaColumns: structures?.stats.plazaColumns ?? 0,
  };
}

/** The generator a node path names, or `"primitive"` for a plaza. */
function generatorOf(doc: SettlementDocument, nodePath: string): string {
  const id = nodePath.slice(nodePath.lastIndexOf(".") + 1);
  const node = doc.root.children.find((c) => c.id === id) as { generator?: string } | undefined;
  return node?.generator ?? "primitive";
}

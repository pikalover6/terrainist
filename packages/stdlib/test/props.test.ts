/**
 * The prop grammar: bounds, determinism and rotation.
 *
 * Three properties, and they are the three that a hand-written op list breaks:
 *
 * 1. **bounds** — every op lies inside the box the prop *declared*, because
 *    the placer claims that box before it generates anything. A prop that
 *    reaches one block further than it said reaches into whatever the placer
 *    put next to it.
 * 2. **determinism** — the same seed gives the same ops, and a different seed
 *    changes only the things the grammar draws (a sail colour, a cart's load),
 *    never the geometry.
 * 3. **rotation** — `rotateOps` maps the declared box onto its rotation and
 *    carries the direction-bearing properties with it. The wheel axis is the
 *    interesting case: it is the one property whose *value* has to change on a
 *    quarter turn rather than its key.
 */

import { describe, expect, it } from "vitest";

import {
  MATERIAL_THEMES,
  PROP_GENERATORS,
  PROP_NAMES,
  assignMaterials,
  generateProp,
  isPropName,
  nodeSeed,
  propBounds,
  propFootprint,
  resolvePropPalette,
  rotateOps,
  type BuildingMaterials,
  type LocalVoxelOp,
  type PropName,
  type StructureYaw,
} from "../src/index.js";

const SEED = nodeSeed(20260728n, "world.props.exhibit", "");
const OTHER = nodeSeed(20260728n, "world.props.other", "");

/** Params that exercise each prop's interesting corners. */
const PARAM_CASES: Readonly<Record<PropName, readonly Record<string, unknown>[]>> = {
  rowboat: [{}],
  fishing_sloop: [{}],
  pier: [{}, { length: 12, width: 3 }, { length: 3, width: 1 }],
  cart: [{}],
  covered_wagon: [{}],
  rail_line: [
    {},
    { length: 16, curve: true },
    { length: 14, grade: 3 },
    { length: 9, platform: false },
    { length: 20, curve: true, grade: 2 },
  ],
  fountain: [{}],
  gazebo: [{}],
  statue_plinth: [{}],
  // The transport families, whose own properties are held in vehicles.test.ts;
  // here they walk the same bounds, determinism and rotation checks as the rest
  // of the catalog, which is what makes those checks exhaustive.
  airliner: [{}],
  cargo_plane: [{}],
  // Wave 6's twelve: four rail, five water, three air, none of them
  // parameterised. Their own properties are held in `vehicles-wave6.test.ts`.
  locomotive: [{}],
  passenger_car: [{}],
  freight_car: [{}],
  caboose: [{}],
  junk: [{}],
  gondola: [{}],
  barge: [{}],
  paddle_steamer: [{}],
  container_ship: [{}],
  hot_air_balloon: [{}],
  seaplane: [{}],
  glider: [{}],
  biplane: [{}],
  light_plane: [{}],
  airship: [{}],
  zeppelin_mast: [{}],
  hangar: [{}],
  runway: [{}, { length: 12 }, { length: 64 }],
  longship: [{}],
  cog: [{}],
  caravel: [{}],
  galleon: [{}],
  yacht: [{}],
  speedboat: [{}],
  ferry: [{}],
  tugboat: [{}],
  fishing_trawler: [{}],
  drydock: [{}, { length: 16 }, { length: 64 }],
  buoy: [{}],
  bench: [{}],
  planter: [{}],
  clothesline: [{}],
  scarecrow: [{}],
  market_barrow: [{}],
  signpost: [{}],
  swimming_pool: [{}],
  curtain_wall: [{}, { length: 24 }, { length: 6 }],
  graveyard: [{}],
  tent: [{}],
  caravan: [{}],
  campsite: [{}],
  treehouse: [{}],
  cairn: [{}],
  carousel: [{}],
  // Wave 4: street furniture. Their own properties are held in
  // props-street.test.ts; here they walk the catalog-wide checks.
  well_head: [{}],
  notice_board: [{}],
  hitching_post: [{}],
  horse_trough: [{}],
  lamp_post: [{}],
  litter_bin: [{}],
  drinking_fountain: [{}],
  flagpole: [{}],
  bollard_row: [{}, { length: 5 }, { length: 33 }],
  sandwich_board: [{}],
  dog_kennel: [{}],
  log_pile: [{}],
  fairground_stall: [{}],
  ticket_booth: [{}],
  prize_wheel: [{}],
  swing_boats: [{}],
  // Wave 5: the wayside. Their own properties are held in
  // props-wayside.test.ts; here they walk the catalog-wide checks.
  bus_shelter: [{}],
  phone_box: [{}],
  mailbox: [{}],
  bicycle_rack: [{}],
  shop_awning: [{}],
  milestone: [{}],
  bus_stop: [{}],
  stagecoach: [{}],
  yurt: [{}],
  helter_skelter: [{}],
  midway_arch: [{}],
  shooting_gallery: [{}],
  // Wave 6E, the monuments. None of them reads a param — a henge's size is the
  // henge — so one empty case each, which is what makes the exhaustive record
  // type above the thing that catches a missing prop.
  standing_stones: [{}],
  henge: [{}],
  monolith: [{}],
  burial_mound: [{}],
  dig_site: [{}],
  fossil_dig: [{}],
  shattered_obelisk: [{}],
  // Wave 6D: spectacle. Their own properties are held in
  // props-spectacle.test.ts; here they walk the catalog-wide checks.
  ferris_wheel: [{}],
  bandstand: [{}],
  memorial_garden: [{}],
  portal_frame: [{}],
  floating_platform: [{}],
  // The classical Mediterranean pack's racecourse barrier (§3.1). It takes no
  // params — its run is a constant — and its own properties are held in
  // structures-classical.test.ts.
  hippodrome_spina: [{}],
  // The alien & sci-fi pack's organic props (CATALOG-EXPANSION §3.4). Neither
  // reads a param — a huddle's size is the huddle and a wreck's is the wreck,
  // and both draw their variation from the node seed instead — so one empty
  // case each. Their own properties are held in structures-xeno.test.ts.
  bio_pod_cluster: [{}],
  derelict_mech: [{}],
  // The nautical & pirate pack's shore props (CATALOG-EXPANSION §3.2). None of
  // them reads a param — a mast's height is the mast and a wreck's length is
  // the wreck, and the dressing is drawn from the node seed instead — so one
  // empty case each. Their own properties are held in props-corsair.test.ts.
  jolly_roger_mast: [{}],
  gallows: [{}],
  gibbet_cage: [{}],
  careening_beach: [{}],
  beached_wreck: [{}],
  houseboat: [{}],
  helipad: [{}],
  // Wave 6C: the two energy objects with no inside. Their own properties are
  // held in structures-utility.test.ts; here they walk the catalog-wide checks.
  wind_turbine: [{}, { height: 7 }, { height: 21 }],
  solar_array: [{}, { rows: 1 }, { rows: 8 }],
  // The classical Mediterranean pack's props (CATALOG-EXPANSION §3.1). Only
  // the colonnade reads a param — its `length` — and it is walked at both
  // clamps as well as at its default, because a run whose declared box and
  // built run disagree is the one bug a length param can have. Their own
  // properties are held in props-classical-b.test.ts.
  agora_colonnade: [{}, { length: 3 }, { length: 9 }, { length: 64 }],
  triumphal_arch: [{}],
  rostra: [{}],
  herm_post: [{}],
  votive_column: [{}],
  column_drums: [{}],
  trireme: [{}],
  pithos_store: [{}],
  // The arcane & magical pack's props (CATALOG-EXPANSION §3.3). Only the
  // lantern row reads a param — its `length` — and it is walked at both clamps
  // as well as at its default, because a run whose declared box and built run
  // disagree is the one bug a length param can have. Their own properties are
  // held in props-arcane.test.ts.
  rune_circle: [{}],
  ley_marker: [{}],
  crystal_outcrop: [{}],
  scrying_pool: [{}],
  unicorn_paddock: [{}],
  arcane_orrery: [{}],
  spirit_lantern_row: [{}, { length: 3 }, { length: 9 }, { length: 64 }],
  dragon_skeleton: [{}],
  moon_dial: [{}],
  // The alien & sci-fi pack's human response (CATALOG-EXPANSION §3.4). None of
  // them reads a param — every one is a fixed object — so each walks the
  // catalog-wide checks once. Their own properties are held in
  // props-response.test.ts.
  containment_tent: [{}],
  field_lab_trailer: [{}],
  sensor_mast: [{}],
  dish_array: [{}],
  sandbag_emplacement: [{}],
  mobile_command_post: [{}],
  sentry_turret: [{}],
  // The nautical & pirate pack's shore props (CATALOG-EXPANSION §3.2). Two of
  // them read a param and both are walked at their clamps as well as their
  // default, because a run whose declared box and built run disagree is the
  // one bug a size param can have. Their own properties are held in
  // props-brine.test.ts.
  fish_drying_rack: [{}, { length: 3 }, { length: 9 }, { length: 64 }],
  treasure_cache: [{}],
  smugglers_landing: [{}],
  capstan: [{}],
  anchor_stack: [{}],
  daymark: [{}, { height: 3 }, { height: 11 }, { height: 64 }],
  whalebone_arch: [{}],
  // The wilds & camps pack's ground pieces (CATALOG-EXPANSION §3.6). Three of
  // them read a size param and every one of those is walked at both clamps as
  // well as its default. Their own properties are held in props-wilds.test.ts.
  logging_camp: [{}, { length: 3 }, { length: 19 }, { length: 64 }],
  log_landing: [{}],
  sawpit: [{}],
  stump_field: [{}, { length: 3 }, { length: 17 }, { length: 64 }],
  spar_pole: [{}, { height: 3 }, { height: 15 }, { height: 64 }],
  hunters_cache: [{}],
  // The agrarian expansion pack's ground pieces (CATALOG-EXPANSION §3.5). Two
  // of them read a size param and both are walked at their clamps as well as
  // their default. Their own properties are held in props-hedgerow.test.ts.
  field_gate: [{}],
  duck_pond: [{}],
  midden_heap: [{}],
  sheep_dip: [{}],
  staddle_granary: [{}],
  hop_yard: [{}, { length: 3 }, { length: 19 }, { length: 64 }],
  stock_pens: [{}, { length: 3 }, { length: 19 }, { length: 64 }],
  well_sweep: [{}],
};

function opsOf(prop: PropName, params: Record<string, unknown> = {}, seed = SEED): LocalVoxelOp[] {
  return generateProp({ prop, seed, params }).ops;
}

describe("prop catalog", () => {
  it("registers a generator for every catalog name, and nothing else", () => {
    expect(Object.keys(PROP_GENERATORS).sort()).toEqual([...PROP_NAMES].sort());
    for (const name of PROP_NAMES) expect(isPropName(name)).toBe(true);
    expect(isPropName("canoe")).toBe(false);
  });

  it("throws on a prop it does not know, and names the ones it does", () => {
    expect(() => generateProp({ prop: "canoe", seed: SEED })).toThrow(/rowboat/);
  });

  it("builds something for every prop and every param case", () => {
    for (const prop of PROP_NAMES) {
      for (const params of PARAM_CASES[prop]) {
        expect(opsOf(prop, params).length).toBeGreaterThan(5);
      }
    }
  });
});

describe("prop geometry bounds", () => {
  it("keeps every op inside the declared box", () => {
    for (const prop of PROP_NAMES) {
      for (const params of PARAM_CASES[prop]) {
        const declared = propFootprint(prop, params);
        const outside = opsOf(prop, params).filter(
          (op) =>
            op.x < 0 ||
            op.x >= declared.size[0] ||
            op.z < 0 ||
            op.z >= declared.size[2] ||
            op.y < declared.minY ||
            op.y >= declared.minY + declared.size[1],
        );
        expect(outside, `${prop} left its box`).toEqual([]);
      }
    }
  });

  it("declares the same box the generator's meta does", () => {
    for (const prop of PROP_NAMES) {
      for (const params of PARAM_CASES[prop]) {
        const result = generateProp({ prop, seed: SEED, params });
        const declared = propFootprint(prop, params);
        expect(result.meta.size, prop).toEqual(declared.size);
        expect(result.meta.minY, prop).toBe(declared.minY);
        expect(result.meta.base, prop).toBe(declared.base);
        expect(result.meta.prop).toBe(prop);
      }
    }
  });

  it("uses the footprint it claims, rather than a corner of it", () => {
    // A prop whose ops occupy only part of its declared box would have the
    // placer reserving ground it never builds on. Every prop is allowed to
    // taper, but it must touch all four sides.
    for (const prop of PROP_NAMES) {
      const declared = propFootprint(prop, {});
      const bounds = propBounds(opsOf(prop));
      expect(bounds.minX, prop).toBe(0);
      expect(bounds.minZ, prop).toBe(0);
      expect(bounds.size[0], prop).toBe(declared.size[0]);
      expect(bounds.size[2], prop).toBe(declared.size[2]);
    }
  });

  it("puts one op in a cell, in canonical order", () => {
    for (const prop of PROP_NAMES) {
      const ops = opsOf(prop);
      const cells = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
      expect(cells.size, prop).toBe(ops.length);
      for (let i = 1; i < ops.length; i++) {
        const a = ops[i - 1] as LocalVoxelOp;
        const b = ops[i] as LocalVoxelOp;
        expect(a.y < b.y || (a.y === b.y && (a.z < b.z || (a.z === b.z && a.x < b.x)))).toBe(true);
      }
    }
  });
});

describe("prop determinism", () => {
  it("gives the same ops for the same seed, every time", () => {
    for (const prop of PROP_NAMES) {
      for (const params of PARAM_CASES[prop]) {
        expect(JSON.stringify(opsOf(prop, params))).toBe(JSON.stringify(opsOf(prop, params)));
      }
    }
  });

  it("changes only dressing when the seed changes, never the footprint", () => {
    for (const prop of PROP_NAMES) {
      const a = propBounds(opsOf(prop, {}, SEED));
      const b = propBounds(opsOf(prop, {}, OTHER));
      expect(b.size, prop).toEqual(a.size);
      expect(b.minY, prop).toBe(a.minY);
    }
  });

  it("draws a sail colour from the seed, and it is one of the wools", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const seed = nodeSeed(20260728n, `world.sloop_${i}`, "");
      const wool = opsOf("fishing_sloop", {}, seed).find((o) => o.block.endsWith("_wool"));
      expect(wool).toBeDefined();
      seen.add((wool as LocalVoxelOp).block);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("prop themes", () => {
  it("builds out of the theme it was dealt", () => {
    const theme = MATERIAL_THEMES[1] as (typeof MATERIAL_THEMES)[number];
    const materials = assignMaterials(theme, 1, SEED)[0] as BuildingMaterials;
    const palette = resolvePropPalette(materials);
    expect(palette.planks).toBe(materials.wood.planks);
    const ops = generateProp({ prop: "cart", seed: SEED, materials }).ops;
    expect(ops.some((o) => o.block === materials.wood.planks)).toBe(true);
  });

  it("lets a style override beat the theme", () => {
    const ops = generateProp({
      prop: "cart",
      seed: SEED,
      style: { "prop.planks": "crimson_planks" },
    }).ops;
    expect(ops.some((o) => o.block === "crimson_planks")).toBe(true);
  });
});

describe("prop rotation", () => {
  const yaws: readonly StructureYaw[] = [0, 90, 180, 270];

  it("maps the declared box onto its rotation, for every prop and yaw", () => {
    for (const prop of PROP_NAMES) {
      for (const params of PARAM_CASES[prop]) {
        const declared = propFootprint(prop, params);
        const ops = opsOf(prop, params);
        for (const yaw of yaws) {
          const rotated = rotateOps(ops, yaw, declared.size[0], declared.size[2]);
          expect(rotated.length).toBe(ops.length);
          const [w, d] =
            yaw === 90 || yaw === 270
              ? [declared.size[2], declared.size[0]]
              : [declared.size[0], declared.size[2]];
          // Collected rather than asserted per op: an airliner is fifteen
          // hundred blocks and four yaws, and `expect` per cell turns a
          // millisecond of arithmetic into seconds of matcher bookkeeping.
          const outside = rotated.filter(
            (op) => op.x < 0 || op.x >= w || op.z < 0 || op.z >= d,
          );
          expect(outside, `${prop}@${yaw} left its box`).toEqual([]);
          // A rotation is a bijection: no two ops may land in one cell.
          expect(new Set(rotated.map((o) => `${o.x},${o.y},${o.z}`)).size).toBe(ops.length);
        }
      }
    }
  });

  it("swaps a cart wheel's log axis on a quarter turn", () => {
    const ops = opsOf("cart");
    const wheels = (list: readonly LocalVoxelOp[]): string[] =>
      list.filter((o) => o.block.startsWith("stripped_")).map((o) => o.props?.["axis"] as string);
    expect(new Set(wheels(ops))).toEqual(new Set(["z"]));
    expect(new Set(wheels(rotateOps(ops, 90, 4, 3)))).toEqual(new Set(["x"]));
    expect(new Set(wheels(rotateOps(ops, 180, 4, 3)))).toEqual(new Set(["z"]));
  });

  it("carries a trapdoor's facing round with it", () => {
    const ops = opsOf("cart");
    const facings = (list: readonly LocalVoxelOp[]): Set<string> =>
      new Set(
        list
          .filter((o) => o.block.endsWith("_trapdoor"))
          .map((o) => o.props?.["facing"] as string),
      );
    expect(facings(ops)).toEqual(new Set(["north", "south", "east"]));
    expect(facings(rotateOps(ops, 90, 4, 3))).toEqual(new Set(["east", "west", "south"]));
  });
});

describe("individual props", () => {
  it("floats a rowboat: hull below the water line, deck at it, fittings above", () => {
    const ops = opsOf("rowboat");
    const byY = new Map<number, LocalVoxelOp[]>();
    for (const op of ops) byY.set(op.y, [...(byY.get(op.y) ?? []), op]);
    expect([...byY.keys()].sort((a, b) => a - b)).toEqual([-1, 0, 1]);
    // The hull course and the deck cover the same columns — no gap for water
    // to sit in inside the boat.
    const hull = new Set((byY.get(-1) as LocalVoxelOp[]).map((o) => `${o.x},${o.z}`));
    const deck = new Set((byY.get(0) as LocalVoxelOp[]).map((o) => `${o.x},${o.z}`));
    expect(deck).toEqual(hull);
    // Nothing below the hull course.
    expect(ops.every((o) => o.y >= -1)).toBe(true);
  });

  it("gives a sloop a mast, a sail plane and a masthead light", () => {
    const ops = opsOf("fishing_sloop");
    const mast = ops.filter((o) => o.block.endsWith("_log") && o.props?.["axis"] === "y");
    expect(mast.length).toBe(5);
    expect(ops.filter((o) => o.block.endsWith("_wool")).length).toBe(12);
    expect(ops.some((o) => o.block === "lantern" && o.y === 6)).toBe(true);
  });

  it("declares a pile under a pier's seaward end, and an anchor at it", () => {
    const result = generateProp({ prop: "pier", seed: SEED, params: { length: 10, width: 2 } });
    expect(result.meta.anchor).toEqual({ x: 1, z: 9 });
    expect(result.meta.piles.some((p) => p.z === 9)).toBe(true);
    for (const pile of result.meta.piles) {
      expect(result.ops.some((o) => o.x === pile.x && o.z === pile.z && o.y === -1)).toBe(true);
    }
    // The deck is continuous: every column of the walkway has a plank at y=0.
    for (let z = 0; z < 10; z++) {
      for (let x = 0; x < 2; x++) {
        expect(result.ops.some((o) => o.x === x && o.z === z && o.y === 0)).toBe(true);
      }
    }
  });

  it("puts a wool arc over a covered wagon and not over a cart", () => {
    expect(opsOf("cart").some((o) => o.block.endsWith("_wool"))).toBe(false);
    const wagon = opsOf("covered_wagon").filter((o) => o.block.endsWith("_wool"));
    expect(wagon.length).toBe(12);
    expect(Math.max(...wagon.map((o) => o.y))).toBe(4);
  });

  it("encloses a fountain's water on every side", () => {
    const ops = opsOf("fountain");
    const water = ops.filter((o) => o.block === "water");
    expect(water.length).toBe(24);
    const solid = new Set(
      ops.filter((o) => o.block !== "water").map((o) => `${o.x},${o.y},${o.z}`),
    );
    const wet = new Set(water.map((o) => `${o.x},${o.y},${o.z}`));
    for (const cell of water) {
      expect(cell.y, "water sits on the base plane").toBe(0);
      expect(solid.has(`${cell.x},${cell.y - 1},${cell.z}`), "floor under water").toBe(true);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const key = `${cell.x + dx},${cell.y},${cell.z + dz}`;
        expect(solid.has(key) || wet.has(key), `face at ${key}`).toBe(true);
      }
    }
  });

  it("leaves a gazebo open at the south and roofed above", () => {
    const ops = opsOf("gazebo");
    expect(ops.some((o) => o.x === 3 && o.z === 6 && o.y === 1)).toBe(false);
    expect(ops.filter((o) => o.y === 4).length).toBeGreaterThan(20);
    expect(ops.some((o) => o.block === "lantern" && o.props?.["hanging"] === "true")).toBe(true);
  });

  it("builds a statue out of blocks and no entity data", () => {
    const ops = opsOf("statue_plinth");
    expect(ops.some((o) => o.block.includes("armor_stand"))).toBe(false);
    expect(Math.max(...ops.map((o) => o.y))).toBe(4);
  });

  it("lays a rail line with ballast, buffers and a rail between them", () => {
    const ops = opsOf("rail_line", { length: 12 });
    const rails = ops.filter((o) => o.block === "rail");
    expect(rails.length).toBe(10);
    expect(rails.every((o) => o.z === 2 && o.y === 0)).toBe(true);
    // Ballast under every track cell, buffers at both ends.
    for (let x = 0; x < 12; x++) {
      expect(ops.some((o) => o.x === x && o.z === 2 && o.y === -1)).toBe(true);
    }
    expect(ops.some((o) => o.x === 0 && o.z === 2 && o.y === 0 && o.block !== "rail")).toBe(true);
    expect(ops.some((o) => o.x === 11 && o.z === 2 && o.y === 0 && o.block !== "rail")).toBe(true);
  });

  it("steps a graded rail line up one block per graded cell, on ballast", () => {
    const ops = opsOf("rail_line", { length: 12, grade: 3 });
    const rails = ops.filter((o) => o.block === "rail");
    const heights = new Map(rails.map((o) => [o.x, o.y] as const));
    expect(heights.get(5)).toBe(0);
    expect(heights.get(9)).toBe(1);
    expect(heights.get(10)).toBe(2);
    for (const [x, y] of heights) {
      for (let b = -1; b < y; b++) {
        expect(ops.some((o) => o.x === x && o.z === 2 && o.y === b), `ballast ${x},${b}`).toBe(true);
      }
    }
  });

  it("turns a curved rail line south off the main run", () => {
    const ops = opsOf("rail_line", { length: 14, curve: true });
    const rails = ops.filter((o) => o.block === "rail");
    expect(rails.some((o) => o.x === 12 && o.z === 3)).toBe(true);
    expect(rails.some((o) => o.x === 12 && o.z === 4)).toBe(true);
    expect(Math.max(...ops.map((o) => o.z))).toBe(5);
  });
});

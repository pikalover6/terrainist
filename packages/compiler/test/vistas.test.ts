/**
 * Fabric v3, C4 — set pieces and vista axes.
 *
 * The claim this track makes is that a city can be made to read as *intended*
 * rather than generated, and the four things that claim rests on are exactly
 * the four things asserted here:
 *
 * 1. **A vista is a relationship, not a position.** The axis comes off an
 *    arterial's terminus, the site is reserved at the end of it, and the
 *    landmark that fills it is squared to the axis — its facade turns to face
 *    back down the road, which is the whole difference between a building at
 *    the end of a street and a building that *closes* one.
 * 2. **A vista is claimed once.** Two landmarks on one axis is two landmarks
 *    competing, and the second one reads as scenery.
 * 3. **The author wins.** A document that says "the minster goes at the end of
 *    the spine" has already made the decision the plan would otherwise make.
 * 4. **It is deterministic.** Same document, same seed, same set pieces — down
 *    to the ordinal that chose which archetype closed which axis.
 *
 * The pass is exercised through `solveCities` rather than a compile, for the
 * reason `city.test.ts` gives for C1: a compiled, physics-linted city costs a
 * minute, and the linted world is the probe in the track's report.
 */

import { describe, expect, it } from "vitest";

import { HeightField, centeredRegion, nodeSeed, type Region } from "@terrainist/stdlib";
import { validateSettlementDocument, type SettlementDocument } from "@terrainist/spec/ir";

import { EMIT_MINECRAFT_VERSION, loadPrismarine } from "../src/emit/prismarine.js";
import { solveCities, type CityProduct } from "../src/layout/city-pass.js";
import type { Placement } from "../src/layout/types.js";
import type { Rect } from "../src/layout/frames.js";
import { dressSetPieces } from "../src/structures/setpieces.js";
import type { ColumnPlan } from "../src/terrain/columns.js";
import {
  FACE_STEP,
  SET_PIECE_KINDS,
  cardinalOfHeading,
  fillNeeded,
  seatOnAxis,
  terminatingLandmark,
  type SetPiece,
  type SetPieceKind,
  type VistaAxis
} from "../src/layout/vistas.js";

/* -------------------------------------------------------------------------- */
/* fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const CITY: Rect = { x0: -160, z0: -150, x1: 159, z1: 149 };

/** The same synthetic bay `city.test.ts` plans against, so the two agree. */
function bayField(region: Region): { field: HeightField; water: Uint8Array } {
  const field = new HeightField(region);
  const water = new Uint8Array(region.width * region.depth);
  for (let j = 0; j < region.depth; j++) {
    const z = region.z0 + j;
    for (let i = 0; i < region.width; i++) {
      const x = region.x0 + i;
      const k = j * region.width + i;
      const inlet = x > -40 && x < 40;
      const shore = inlet ? 40 : 96;
      if (z >= shore) {
        water[k] = 1;
        field.values[k] = 58;
      } else {
        field.values[k] = 72 + Math.floor((shore - z) / 60);
      }
    }
  }
  return { field, water };
}

function cityDocument(children: readonly unknown[], params: Record<string, unknown> = {}): SettlementDocument {
  return {
    loam: "0.1",
    profile: "settlement",
    meta: { name: "c4_fixture", worldSeed: "20260801" },
    root: {
      id: "world",
      kind: "composite",
      envelope: { shape: "region", size: [384, 384] },
      children: [
        // The profile requires exactly one of each; `solveCities` reads
        // neither, but the same fixture is put through the real validator
        // below and a document without them fails for the wrong reason.
        {
          id: "terrain",
          kind: "generator",
          generator: "terrain.heightfield@0",
          params: { seaLevel: 62, baseHeight: 72, amplitude: 8 }
        },
        {
          id: "climate",
          kind: "generator",
          generator: "terrain.climate@0",
          params: {}
        },
        {
          id: "harbourtown",
          kind: "city",
          envelope: { shape: "region", size: [320, 300] },
          params: {
            size: "large",
            coastal: true,
            diagonals: 1,
            mix: ["office", "apartment_block", "shop_row"],
            ...params
          },
          children
        }
      ]
    }
  } as unknown as SettlementDocument;
}

function layFixture(
  children: readonly unknown[] = [],
  params: Record<string, unknown> = {},
): { product: CityProduct; placements: readonly Placement[]; diagnostics: readonly { name: string }[] } {
  const region = centeredRegion(384, 384);
  const { field, water } = bayField(region);
  const doc = cityDocument(children, params);
  const placement: Placement = {
    nodePath: "world.harbourtown",
    id: "harbourtown",
    translation: [CITY.x0, 72, CITY.z0],
    yaw: 0,
    mirror: false,
    size: [CITY.x1 - CITY.x0 + 1, 1, CITY.z1 - CITY.z0 + 1],
    footprint: CITY,
    anchor: { x: 0, z: 0 },
    foundationY: 72
  };
  const laid = solveCities({
    doc,
    worldSeed: 20260801n,
    field,
    seaLevel: 62,
    placements: [placement],
    water
  });
  const product = laid.cities[0];
  if (product === undefined) throw new Error("the fixture city was not laid");
  return { product, placements: laid.placements, diagnostics: laid.diagnostics };
}

/** The one landmark placement that closes `axis`. */
function closerOf(
  axis: VistaAxis,
  placements: readonly Placement[],
): Placement {
  const found = placements.find((p) => p.nodePath === axis.closedBy);
  if (found === undefined) throw new Error(`no placement for ${String(axis.closedBy)}`);
  return found;
}

/* -------------------------------------------------------------------------- */
/* 1. the geometry, without a plan                                             */
/* -------------------------------------------------------------------------- */

describe("vista geometry", () => {
  it("snaps a 15°-quantised heading to the nearest cardinal", () => {
    // 0° is +Z, which the profile spells "south".
    expect(cardinalOfHeading(0)).toBe("south");
    expect(cardinalOfHeading(90)).toBe("east");
    expect(cardinalOfHeading(180)).toBe("north");
    expect(cardinalOfHeading(270)).toBe("west");
    // The interesting ones: a boulevard is rarely due anything.
    expect(cardinalOfHeading(75)).toBe("east");
    expect(cardinalOfHeading(255)).toBe("west");
    expect(cardinalOfHeading(345)).toBe("south");
  });

  it("uses no trigonometry — every cardinal step is a unit column", () => {
    for (const face of ["north", "east", "south", "west"] as const) {
      const step = FACE_STEP[face];
      expect(Math.abs(step.x) + Math.abs(step.z)).toBe(1);
      expect(Number.isInteger(step.x) && Number.isInteger(step.z)).toBe(true);
    }
  });

  it("seats a footprint at the back of its reserve, centred on the axis", () => {
    const axis: VistaAxis = {
      id: "a",
      arterialId: "spine",
      arterialKind: "spine",
      width: 13,
      at: { x: 0, z: 0 },
      heading: 90,
      facing: "east",
      // 30 deep along +X, 21 across.
      reserve: { x0: 3, z0: -10, x1: 32, z1: 10 },
      run: 60
    };
    // Facing east, a 21 × 15 world footprint: 21 along the axis, 15 across.
    const rect = seatOnAxis(axis, 21, 15);
    expect(rect).not.toBeNull();
    const seated = rect as Rect;
    // Pushed to the *back* — the city-boundary end — so the facade stands as
    // far down the road as the site allows.
    expect(seated.x0).toBe(3);
    expect(seated.x1).toBe(23);
    // Centred across, with `floor`.
    expect(seated.z0).toBe(-7);
    expect(seated.z1).toBe(7);
  });

  it("refuses a footprint the reserve cannot hold", () => {
    const axis: VistaAxis = {
      id: "a",
      arterialId: "spine",
      arterialKind: "spine",
      width: 13,
      at: { x: 0, z: 0 },
      heading: 90,
      facing: "east",
      reserve: { x0: 3, z0: -6, x1: 20, z1: 6 },
      run: 60
    };
    expect(seatOnAxis(axis, 21, 15)).toBeNull();
  });

  it("rotates the landmark rotation without repeating inside one city", () => {
    const seed = nodeSeed(20260801n, "world.harbourtown", "");
    const names = [0, 1, 2].map((k) => terminatingLandmark(seed, k).archetype);
    expect(new Set(names).size).toBe(3);
    // …and it is a rotation of a fixed list, not a draw: the same ordinal on
    // the same seed is the same building, forever.
    expect(terminatingLandmark(seed, 1).archetype).toBe(names[1]);
  });

  it("costs a flight one course per column on an even bank, more under a riser", () => {
    // A clean 1-per-column climb needs exactly the one course of paving.
    expect(fillNeeded([70, 71, 72, 73, 74])).toBe(1);
    // A three-block riser at the top forces the whole flat approach in front
    // of it upward, one course further per column back — which is exactly the
    // ramp a real stair builds, and exactly why a cliff at the end of a long
    // flat run is refused: the flight would become a retaining wall.
    expect(fillNeeded([70, 70, 70, 73])).toBe(3);
    expect(fillNeeded([70, 70, 70, 70, 70, 76])).toBe(6);
    // Flat ground is a landing, not a stair.
    expect(fillNeeded([70, 70, 70])).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. the axes and the anchors                                                 */
/* -------------------------------------------------------------------------- */

describe("the set-piece plan", () => {
  it("closes at least one axis and seats a handful of anchors", () => {
    const { product } = layFixture();
    expect(product.vistas.length).toBeGreaterThan(0);
    expect(product.setPieces.length).toBeGreaterThanOrEqual(2);
    expect(product.setPieces.length).toBeLessThanOrEqual(6);
    for (const piece of product.setPieces) {
      expect(SET_PIECE_KINDS).toContain(piece.kind);
      expect(piece.detail.length).toBeGreaterThan(0);
    }
  });

  it("squares the terminating landmark to its axis", () => {
    const { product, placements } = layFixture();
    const closed = product.vistas.filter((v) => v.closedBy !== undefined);
    expect(closed.length).toBeGreaterThan(0);
    for (const axis of closed) {
      const seat = closerOf(axis, placements);
      const step = FACE_STEP[axis.facing];
      // The building stands inside the ground reserved for the axis…
      expect(seat.footprint.x0).toBeGreaterThanOrEqual(axis.reserve.x0);
      expect(seat.footprint.x1).toBeLessThanOrEqual(axis.reserve.x1);
      expect(seat.footprint.z0).toBeGreaterThanOrEqual(axis.reserve.z0);
      expect(seat.footprint.z1).toBeLessThanOrEqual(axis.reserve.z1);
      // …astride the centre line, within half a column of it…
      const acrossCentre = step.x === 0
        ? (seat.footprint.x0 + seat.footprint.x1) / 2 - axis.at.x
        : (seat.footprint.z0 + seat.footprint.z1) / 2 - axis.at.z;
      expect(Math.abs(acrossCentre)).toBeLessThanOrEqual(1);
      // …and its *front* faces back down the road. `facing` is the cardinal a
      // viewer walking outbound sees, so the near face of the footprint is the
      // one further along the heading from the terminus.
      const nearFace = step.x > 0
        ? seat.footprint.x1
        : step.x < 0
          ? seat.footprint.x0
          : step.z > 0
            ? seat.footprint.z1
            : seat.footprint.z0;
      const terminus = step.x !== 0 ? axis.at.x : axis.at.z;
      const inward = (nearFace - terminus) * (step.x !== 0 ? step.x : step.z);
      expect(inward).toBeGreaterThan(0);
    }
  });

  it("never lets two anchors claim one axis, or two axes overlap", () => {
    const { product } = layFixture();
    const claimed = product.setPieces
      .filter((p) => p.kind === "landmark")
      .map((p) => p.axisId);
    expect(new Set(claimed).size).toBe(claimed.length);
    for (const axis of product.vistas) {
      const closers = product.setPieces.filter((p) => p.axisId === axis.id);
      expect(closers.length).toBeLessThanOrEqual(1);
    }
    // …and the reserves themselves do not touch, which is what stops two
    // landmarks standing in each other's view.
    for (let a = 0; a < product.vistas.length; a++) {
      for (let b = a + 1; b < product.vistas.length; b++) {
        const p = (product.vistas[a] as VistaAxis).reserve;
        const q = (product.vistas[b] as VistaAxis).reserve;
        const touching = p.x0 <= q.x1 && q.x0 <= p.x1 && p.z0 <= q.z1 && q.z0 <= p.z1;
        expect(touching).toBe(false);
      }
    }
  });

  it("no two set pieces overlap", () => {
    const { product } = layFixture();
    for (let a = 0; a < product.setPieces.length; a++) {
      for (let b = a + 1; b < product.setPieces.length; b++) {
        const p = (product.setPieces[a] as { site: Rect }).site;
        const q = (product.setPieces[b] as { site: Rect }).site;
        const touching = p.x0 <= q.x1 && q.x0 <= p.x1 && p.z0 <= q.z1 && q.z0 <= p.z1;
        expect(touching).toBe(false);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. the author wins                                                          */
/* -------------------------------------------------------------------------- */

const MINSTER = {
  id: "the_minster",
  kind: "generator",
  generator: "building.grammar@0",
  envelope: { shape: "box", size: [15, 17, 21] },
  params: { archetype: "cathedral", floors: 2, vista: "spine" },
  ports: { door: { type: "door", face: "south" } },
  tags: ["landmark"]
};

describe("an author-pinned landmark", () => {
  it("takes the axis the plan would otherwise have chosen a building for", () => {
    const plain = layFixture();
    const pinned = layFixture([MINSTER]);

    const spine = pinned.product.vistas.find((v) => v.arterialKind === "spine");
    expect(spine).toBeDefined();
    expect((spine as VistaAxis).closedBy).toBe("world.harbourtown.the_minster");
    expect((spine as VistaAxis).authored).toBe(true);

    // The plan had closed the same axis with a building of its own; the pin
    // displaces it rather than standing beside it.
    const before = plain.product.vistas.find((v) => v.arterialKind === "spine");
    expect((before as VistaAxis).closedBy).toBeDefined();
    expect((before as VistaAxis).closedBy).not.toBe("world.harbourtown.the_minster");
    expect((before as VistaAxis).authored).toBeUndefined();

    // …and only one building stands on it.
    const onSpine = pinned.product.setPieces.filter((p) => p.axisId === (spine as VistaAxis).id);
    expect(onSpine).toHaveLength(1);
    expect(onSpine[0]?.nodePath).toBe("world.harbourtown.the_minster");
  });

  it("is seated on the axis, not distributed into a quarter", () => {
    const { product, placements } = layFixture([MINSTER]);
    const spine = product.vistas.find((v) => v.arterialKind === "spine") as VistaAxis;
    const seat = closerOf(spine, placements);
    // Its footprint is the cathedral's, turned to the axis: 21 along, 15 across.
    const along = spine.facing === "east" || spine.facing === "west"
      ? seat.footprint.x1 - seat.footprint.x0 + 1
      : seat.footprint.z1 - seat.footprint.z0 + 1;
    expect(along).toBe(21);
    expect(seat.yaw % 90).toBe(0);
  });

  it("falls back to an ordinary frontage when no axis can hold it", () => {
    const huge = {
      ...MINSTER,
      id: "the_colossus",
      envelope: { shape: "box", size: [61, 30, 61] },
      params: { archetype: "cathedral", floors: 2, vista: true }
    };
    const { product, diagnostics } = layFixture([huge]);
    expect(product.vistas.every((v) => v.closedBy !== "world.harbourtown.the_colossus")).toBe(true);
    expect(diagnostics.some((d) => d.name === "VISTA_UNCLAIMED")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. determinism                                                              */
/* -------------------------------------------------------------------------- */

describe("determinism", () => {
  it("plans the same axes and the same anchors twice", () => {
    const a = layFixture([MINSTER]);
    const b = layFixture([MINSTER]);
    expect(JSON.stringify(b.product.vistas)).toBe(JSON.stringify(a.product.vistas));
    expect(JSON.stringify(b.product.setPieces)).toBe(JSON.stringify(a.product.setPieces));
    const seats = (r: typeof a): string =>
      JSON.stringify(
        r.placements
          .filter((p) => r.product.vistas.some((v) => v.closedBy === p.nodePath))
          .map((p) => [p.nodePath, p.footprint, p.yaw, p.foundationY]),
      );
    expect(seats(b)).toBe(seats(a));
  });
});

/* -------------------------------------------------------------------------- */
/* 5. the authoring surface                                                    */
/* -------------------------------------------------------------------------- */

describe("the C4 authoring surface", () => {
  const validate = (children: readonly unknown[], params: Record<string, unknown> = {}) =>
    validateSettlementDocument(cityDocument(children, params) as unknown);

  it("accepts a city with no set-piece params at all", () => {
    const result = validate([]);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("accepts both spellings of params.setPieces", () => {
    for (const value of [false, true, { max: 3 }, { kinds: ["landmark", "bridge"] }] as const) {
      const result = validate([], { setPieces: value });
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    }
  });

  it("rejects a malformed setPieces with a code and a fix", () => {
    for (const bad of [{ max: 0 }, { max: 9 }, { kinds: [] }, { kinds: ["monument"] }, { kinds: ["landmark", "landmark"] }, 3]) {
      const errors = validate([], { setPieces: bad }).diagnostics.filter((d) => d.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.name).toBe("CITY_SET_PIECES");
      expect(errors[0]?.code).toBe("LOAM-T215");
      expect(errors[0]?.fix.length).toBeGreaterThan(10);
    }
  });

  it("rejects an unknown setPieces key", () => {
    const errors = validate([], { setPieces: { max: 3, count: 2 } })
      .diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts params.vista on a city landmark, in both spellings", () => {
    for (const pin of [true, false, "spine", "drive", "diagonal", "boulevard"] as const) {
      const result = validate([{ ...MINSTER, params: { archetype: "cathedral", vista: pin } }]);
      expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    }
  });

  it('rejects "vista": "ring" — a loop has no end to stand at', () => {
    const errors = validate([{ ...MINSTER, params: { archetype: "cathedral", vista: "ring" } }])
      .diagnostics.filter((d) => d.severity === "error");
    expect(errors[0]?.name).toBe("VISTA_PIN");
    expect(errors[0]?.code).toBe("LOAM-T216");
    expect(errors[0]?.message).toContain("closed loop");
    expect(errors[0]?.fix).toContain("spine");
  });

  it("rejects a vista pin on a building that is not a city child", () => {
    const doc = {
      loam: "0.1",
      profile: "settlement",
      meta: { name: "c4_root", worldSeed: "1" },
      root: {
        id: "world",
        kind: "composite",
        envelope: { shape: "region", size: [256, 256] },
        children: [
          {
            id: "hall",
            kind: "generator",
            generator: "building.grammar@0",
            envelope: { shape: "box", size: [11, 9, 11] },
            params: { archetype: "hall", vista: true }
          }
        ]
      }
    };
    const errors = validateSettlementDocument(doc).diagnostics.filter((d) => d.severity === "error");
    expect(errors.some((d) => d.name === "VISTA_PIN")).toBe(true);
    expect(errors.find((d) => d.name === "VISTA_PIN")?.fix).toContain("children");
  });

  it("rejects a non-string, non-boolean vista", () => {
    const errors = validate([{ ...MINSTER, params: { archetype: "cathedral", vista: 3 } }])
      .diagnostics.filter((d) => d.severity === "error");
    expect(errors[0]?.name).toBe("VISTA_PIN");
  });
});

/* -------------------------------------------------------------------------- */
/* 6. the dressing pass                                                        */
/* -------------------------------------------------------------------------- */

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const DRESS_REGION: Region = { x0: -64, z0: -64, width: 128, depth: 128 };

/** A bank climbing one block per column eastward from x = 0, on flat ground. */
function bankPlan(): ColumnPlan {
  const n = DRESS_REGION.width * DRESS_REGION.depth;
  const ground = new Int32Array(n);
  for (let j = 0; j < DRESS_REGION.depth; j++) {
    for (let i = 0; i < DRESS_REGION.width; i++) {
      const x = DRESS_REGION.x0 + i;
      ground[j * DRESS_REGION.width + i] = 100 + Math.max(0, Math.min(20, x));
    }
  }
  return {
    region: DRESS_REGION,
    ground,
    fluidTop: Int32Array.from(ground),
    fluidKind: new Uint8Array(n),
    surface: new Int32Array(n),
    subsurface: new Int32Array(n),
    soil: new Uint8Array(n),
    snow: new Uint8Array(n),
    biome: new Uint16Array(n),
    volcanic: new Uint8Array(n),
    volcanicUpper: new Uint8Array(n),
    lavaFlow: new Uint8Array(n),
    lakeMask: new Uint8Array(n),
    oceanMask: new Uint8Array(n),
    seaLevel: 63,
    stoneSeed: 1,
    states: { bedrock: 0, stone: 0, deepslate: 0, water: 0, lava: 0, snowLayer: 0, caveAir: 0 }
  } as unknown as ColumnPlan;
}

const STAIR_PIECE: SetPiece = {
  id: "hillside_stair",
  kind: "stair",
  site: { x0: 0, z0: -3, x1: 14, z1: 3 },
  detail: "a bank",
  rise: 15,
  path: Array.from({ length: 15 }, (_, k) => ({ x: k, z: 0 }))
};

function dress(pieces: readonly SetPiece[], extra: Record<string, unknown> = {}) {
  return dressSetPieces({
    plan: bankPlan(),
    stack,
    seed: nodeSeed(20260801n, "world", ""),
    nodePath: "world",
    cities: [{ nodePath: "world.harbourtown", setPieces: pieces }],
    ...extra
  });
}

describe("the set-piece dressing pass", () => {
  it("builds a climbable flight up a bank", () => {
    const result = dress([STAIR_PIECE]);
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.stats["setPiece_stairTread"]).toBeGreaterThan(0);
    expect(result.stats["setPiece_stairRail"]).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual([]);

    // No block is left hanging: every one has the block below it, or is the
    // first course and has the bank.
    const written = new Set(result.blocks.map((b) => `${b.x},${b.y},${b.z}`));
    const plan = bankPlan();
    for (const b of result.blocks) {
      const i = b.x - DRESS_REGION.x0;
      const j = b.z - DRESS_REGION.z0;
      const ground = plan.ground[j * DRESS_REGION.width + i] as number;
      const supported = b.y === ground + 1 || written.has(`${b.x},${b.y - 1},${b.z}`);
      expect(supported).toBe(true);
    }
  });

  it("treats `avoid` as an absolute veto with no voxel exemption", () => {
    const all = dress([STAIR_PIECE]);
    const none = dress([STAIR_PIECE], { avoid: () => true });
    expect(all.blocks.length).toBeGreaterThan(0);
    expect(none.blocks).toEqual([]);
    // …and says so, because there *was* something to dress.
    expect(none.diagnostics.map((d) => d.name)).toContain("SET_PIECES_EMPTY");
  });

  it("says nothing when the only anchors are landmarks", () => {
    // A landmark is a building the grammar put up three passes earlier. This
    // pass writing no blocks for one is the expected outcome, and reporting it
    // would be a false alarm in every city that has one — the exact shape of
    // mistake `LIFE_PASS_EMPTY` was re-coded to undo.
    const result = dress([
      {
        id: "spine_vista0_landmark",
        kind: "landmark",
        site: { x0: 0, z0: 0, x1: 10, z1: 10 },
        detail: "a cathedral",
        axisId: "spine_vista0"
      }
    ]);
    expect(result.blocks).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("writes the same blocks twice from one plan", () => {
    const a = dress([STAIR_PIECE]);
    const b = dress([STAIR_PIECE]);
    expect(JSON.stringify(b.blocks)).toBe(JSON.stringify(a.blocks));
  });

  it("declines a bank too steep for a flight of its length", () => {
    // A cliff: nothing for 14 columns, then twelve blocks at once. The backward
    // pass would need twelve courses under the step before it — a retaining
    // wall, not a stair — so the piece is refused whole.
    const n = DRESS_REGION.width * DRESS_REGION.depth;
    const ground = new Int32Array(n);
    for (let j = 0; j < DRESS_REGION.depth; j++) {
      for (let i = 0; i < DRESS_REGION.width; i++) {
        const x = DRESS_REGION.x0 + i;
        ground[j * DRESS_REGION.width + i] = 100 + (x >= 14 ? 12 : 0);
      }
    }
    const plan = { ...bankPlan(), ground, fluidTop: Int32Array.from(ground) } as ColumnPlan;
    const result = dressSetPieces({
      plan,
      stack,
      seed: nodeSeed(20260801n, "world", ""),
      nodePath: "world",
      cities: [{ nodePath: "world.harbourtown", setPieces: [STAIR_PIECE] }]
    });
    expect(result.blocks).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. the kinds are the contract                                               */
/* -------------------------------------------------------------------------- */

describe("the set-piece vocabulary", () => {
  it("is the same list the spec package publishes to authors", async () => {
    const spec = await import("@terrainist/spec/ir");
    expect([...SET_PIECE_KINDS]).toEqual([...spec.SET_PIECE_KINDS]);
  });

  it("names every kind the planner can emit", () => {
    const kinds: SetPieceKind[] = ["landmark", "bridge", "promenade", "stair", "square"];
    for (const kind of kinds) expect(SET_PIECE_KINDS).toContain(kind);
  });
});

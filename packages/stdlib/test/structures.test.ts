/**
 * `building.grammar@0` unit tests.
 *
 * These stand in for the visual QA the G4 code phase deliberately skips: every
 * property a human would check by walking around the building ("does it have
 * walls", "can I get in", "can I get upstairs", "is there a roof") is asserted
 * here instead.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_STYLE_DEFAULTS,
  MATERIAL_THEMES,
  assignMaterials,
  archetypeOfTags,
  cardinalStep,
  generateBuilding,
  materialKey,
  pickTheme,
  nodeSeed,
  rotateFacing,
  rotateLocalColumn,
  rotateOps,
  rotateProps,
  type BuildingParams,
  type BuildingRoof,
  type LocalVoxelOp,
  type MaterialTheme,
  type StructureYaw,
} from "../src/index.js";

const SEED = nodeSeed(0x5eedn, "world.house");
const YAWS: readonly StructureYaw[] = [0, 90, 180, 270];

interface Case {
  readonly label: string;
  readonly size: readonly [number, number, number];
  readonly params: BuildingParams;
}

/** The shapes the village example exercises, plus the degenerate small one. */
const CASES: readonly Case[] = [
  { label: "cottage/gable/1", size: [7, 7, 9], params: { floors: 1, roof: "gable" } },
  { label: "hall/hip/2", size: [13, 12, 11], params: { floors: 2, roof: "hip" } },
  { label: "inn/gable/2", size: [11, 11, 9], params: { floors: 2, roof: "gable", windowRhythm: "paired" } },
  { label: "tower/flat/2", size: [7, 12, 7], params: { floors: 2, roof: "flat", windowRhythm: "sparse" } },
  { label: "shed/gable/1 (long z)", size: [7, 7, 13], params: { floors: 1, roof: "gable" } },
  { label: "minimum", size: [3, 5, 3], params: { floors: 1, roof: "flat" } },
];

/**
 * A fixed style so a test can name the block it expects.
 *
 * The grammar now draws its materials from a village theme, which is the whole
 * point of the diversity work — but a test that wants to say "the door is an
 * oak door" has to pin the palette, or it is really testing the theme deal.
 */
const PINNED: Readonly<Record<string, string>> = Object.freeze({ ...BUILDING_STYLE_DEFAULTS });

function build(c: Case, extra: Partial<Parameters<typeof generateBuilding>[0]> = {}) {
  return generateBuilding({
    size: c.size,
    params: c.params,
    seed: SEED,
    foundationDepth: 2,
    style: PINNED,
    ...extra,
  });
}

/** Ops inside the footprint proper — everything but the apron decorations. */
function core(ops: readonly LocalVoxelOp[], sx: number, sz: number): LocalVoxelOp[] {
  return ops.filter((o) => o.x >= 0 && o.x < sx && o.z >= 0 && o.z < sz);
}

function key(op: { x: number; y: number; z: number }): string {
  return `${op.x},${op.y},${op.z}`;
}

describe("generateBuilding — determinism", () => {
  it("returns byte-identical ops for identical inputs", () => {
    for (const c of CASES) {
      expect(JSON.stringify(build(c).ops)).toBe(JSON.stringify(build(c).ops));
    }
  });

  it("emits exactly one op per cell, in canonical (y, z, x) order", () => {
    for (const c of CASES) {
      const ops = build(c).ops;
      const seen = new Set(ops.map(key));
      expect(seen.size).toBe(ops.length);
      const sorted = [...ops].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
      expect(ops).toEqual(sorted);
    }
  });

  it("keeps the massing but varies the detail when the seed changes", () => {
    const c = CASES[1] as Case;
    const a = build(c);
    const b = build(c, { seed: nodeSeed(0x5eedn, "world.other_house") });
    // The shell is the envelope's business, not the seed's: two houses of the
    // same size and params stand the same height and roof at the same line.
    expect(b.meta.wallTop).toBe(a.meta.wallTop);
    expect(b.meta.roofBase).toBe(a.meta.roofBase);
    expect(b.meta.roofTop).toBe(a.meta.roofTop);
    expect(b.meta.interior).toEqual(a.meta.interior);
    // Everything else is allowed — and required — to differ, or the seed is
    // doing nothing and every house in a village is the same house.
    expect(b.ops.map((o) => o.block).join()).not.toBe(a.ops.map((o) => o.block).join());
  });

  it("clamps floors into the 1..2 this v0 builds", () => {
    const meta = generateBuilding({ size: [9, 20, 9], params: { floors: 9 }, seed: SEED }).meta;
    expect(meta.params.floors).toBe(2);
  });
});

describe("generateBuilding — structural sanity", () => {
  it("keeps every block inside the footprint or its one-block apron", () => {
    for (const c of CASES) {
      const [sx, , sz] = c.size;
      for (const op of build(c).ops) {
        expect(op.x, c.label).toBeGreaterThanOrEqual(-1);
        expect(op.z, c.label).toBeGreaterThanOrEqual(-1);
        expect(op.x, c.label).toBeLessThanOrEqual(sx);
        expect(op.z, c.label).toBeLessThanOrEqual(sz);
      }
    }
  });

  it("puts nothing structural in the apron — only the named decorations", () => {
    const decorations = new Set([
      PINNED["roof.stairs"] as string,
      PINNED["roof.slab"] as string,
      PINNED["wall.fence"] as string,
      PINNED["wall.trapdoor"] as string,
      PINNED["light.lantern"] as string,
    ]);
    for (const c of CASES) {
      const [sx, , sz] = c.size;
      const { ops, meta } = build(c);
      const apron = ops.filter((o) => o.x < 0 || o.x >= sx || o.z < 0 || o.z >= sz);
      expect(apron.length, c.label).toBe(meta.apronOps);
      for (const op of apron) {
        const ok = decorations.has(op.block) || op.block.startsWith("potted_");
        expect(ok, `${c.label}: ${op.block} in the apron`).toBe(true);
      }
    }
  });

  it("encloses the perimeter at every wall level", () => {
    for (const c of CASES) {
      const [sx, , sz] = c.size;
      const { ops, meta } = build(c);
      const filled = new Set(ops.map(key));
      for (let y = 1; y <= meta.wallTop; y++) {
        for (let z = 0; z < sz; z++) {
          for (let x = 0; x < sx; x++) {
            if (x !== 0 && x !== sx - 1 && z !== 0 && z !== sz - 1) continue;
            expect(filled.has(`${x},${y},${z}`), `${c.label} wall gap at ${x},${y},${z}`).toBe(true);
          }
        }
      }
    }
  });

  it("sinks a foundation skirt to the depth the caller asked for", () => {
    for (const depth of [1, 3, 6]) {
      const { ops, meta } = build(CASES[0] as Case, { foundationDepth: depth });
      expect(meta.foundationDepth).toBe(depth);
      const below = ops.filter((o) => o.y < 0);
      const [sx, , sz] = (CASES[0] as Case).size;
      expect(below.length).toBe(depth * sx * sz);
      expect(Math.min(...below.map((o) => o.y))).toBe(-depth);
    }
  });

  it("cuts the door opening exactly at the declared port", () => {
    for (const face of ["north", "south", "east", "west"] as const) {
      const { ops, meta } = build(CASES[0] as Case, { door: { face } });
      expect(meta.door?.face).toBe(face);
      const at = new Map(ops.map((o) => [key(o), o] as const));
      const lower = at.get(`${meta.door?.x},1,${meta.door?.z}`);
      const upper = at.get(`${meta.door?.x},2,${meta.door?.z}`);
      expect(lower?.block).toBe(BUILDING_STYLE_DEFAULTS["door.block"]);
      expect(upper?.block).toBe(BUILDING_STYLE_DEFAULTS["door.block"]);
      expect(lower?.props?.["half"]).toBe("lower");
      expect(upper?.props?.["half"]).toBe("upper");
      // The door faces out of the wall it is cut into.
      expect(lower?.props?.["facing"]).toBe(face);
    }
  });

  it("puts the door on the named face's wall line", () => {
    const c = CASES[1] as Case;
    const [sx, , sz] = c.size;
    expect(build(c, { door: { face: "north" } }).meta.door?.z).toBe(0);
    expect(build(c, { door: { face: "south" } }).meta.door?.z).toBe(sz - 1);
    expect(build(c, { door: { face: "west" } }).meta.door?.x).toBe(0);
    expect(build(c, { door: { face: "east" } }).meta.door?.x).toBe(sx - 1);
  });

  it("never puts a window in the door column", () => {
    const { ops, meta } = build(CASES[2] as Case, { door: { face: "south" } });
    const panes = ops.filter((o) => o.block === BUILDING_STYLE_DEFAULTS["wall.window"]);
    expect(panes.length).toBe(meta.windowCount);
    expect(panes.some((o) => o.x === meta.door?.x && o.z === meta.door?.z)).toBe(false);
    // Corners are structure, never glazing.
    const [sx, , sz] = (CASES[2] as Case).size;
    expect(panes.some((o) => (o.x === 0 || o.x === sx - 1) && (o.z === 0 || o.z === sz - 1))).toBe(false);
  });

  it("roofs the whole footprint, whatever the shape", () => {
    for (const roof of ["gable", "hip", "flat"] as const) {
      for (const c of CASES) {
        const { ops, meta } = generateBuilding({
          size: c.size,
          params: { ...c.params, roof },
          seed: SEED,
          style: PINNED,
        });
        const [sx, , sz] = c.size;
        const covered = new Set(
          core(ops, sx, sz)
            .filter((o) => o.y >= meta.roofBase)
            .map((o) => `${o.x},${o.z}`),
        );
        expect(covered.size, `${c.label} ${roof}`).toBe(sx * sz);
      }
    }
  });

  it("gives every storey a floor plane, and a stair up to it", () => {
    const c = CASES[1] as Case;
    const { ops, meta } = build(c);
    expect(meta.params.floors).toBe(2);
    expect(meta.floorLevels).toHaveLength(2);
    expect(meta.stairRuns).toHaveLength(1);

    const stairs = ops.filter((o) => o.block === BUILDING_STYLE_DEFAULTS["stair.interior"]);
    expect(stairs.length).toBeGreaterThan(0);
    // The run climbs one block per step, without a gap, from the ground floor
    // to the storey above.
    const ys = stairs.map((o) => o.y).sort((a, b) => a - b);
    expect(ys[0]).toBe(meta.stairRuns[0]);
    for (let i = 1; i < ys.length; i++) expect((ys[i] as number) - (ys[i - 1] as number)).toBe(1);
    // The **top** step sits in the upper floor plane, not one below it. A step
    // at `level - 1` leaves its back tread at `level` while the floor it
    // serves walks at `level + 1`: a one-block rise, which is a jump.
    expect(ys[ys.length - 1]).toBe(meta.floorLevels[1]);
    // The lowest step stands on the floor below, so the first rise is half a
    // block rather than a hop onto a plinth.
    expect(ys[0]).toBe((meta.floorLevels[0] as number) + 1);

    // …and the floor above is open over the whole run, so the climb is not
    // into a ceiling. (The top step is *in* that plane and is not floor.)
    const stairCells = new Set(stairs.map((o) => `${o.x},${o.z}`));
    const upper = new Set(
      ops
        .filter((o) => o.y === meta.floorLevels[1] && o.block !== BUILDING_STYLE_DEFAULTS["stair.interior"])
        .map((o) => `${o.x},${o.z}`),
    );
    for (const cell of stairCells) expect(upper.has(cell)).toBe(false);

    // Every step has two blocks of headroom: a flight you have to crouch
    // through is not a flight.
    const filled = new Set(ops.map((o) => `${o.x},${o.y},${o.z}`));
    for (const stair of stairs) {
      for (const dy of [1, 2]) {
        expect(filled.has(`${stair.x},${stair.y + dy},${stair.z}`)).toBe(false);
      }
    }
  });

  it("pairs both halves of a bed, at every yaw", () => {
    const c = CASES[0] as Case;
    for (const yaw of YAWS) {
      const { ops } = build(c, { params: { ...c.params, archetype: "cottage" } });
      const [sx, , sz] = c.size;
      const beds = rotateOps(ops, yaw, sx, sz).filter((o) => o.block === "red_bed");
      expect(beds.length, `yaw ${yaw}`).toBe(2);
      const foot = beds.find((o) => o.props?.["part"] === "foot") as LocalVoxelOp;
      const head = beds.find((o) => o.props?.["part"] === "head") as LocalVoxelOp;
      expect(foot, `yaw ${yaw} foot`).toBeDefined();
      expect(head, `yaw ${yaw} head`).toBeDefined();
      // One `facing`, shared, and the head exactly one step along it. Anything
      // else renders as two overlapping bed pieces.
      expect(head.props?.["facing"], `yaw ${yaw}`).toBe(foot.props?.["facing"]);
      expect(head.y).toBe(foot.y);
      const [dx, dz] = cardinalStep(foot.props?.["facing"] as never);
      expect([head.x - foot.x, head.z - foot.z], `yaw ${yaw}`).toEqual([dx, dz]);
    }
  });

  it("lights every storey", () => {
    for (const c of CASES) {
      const { ops, meta } = build(c);
      const lanterns = ops.filter((o) => o.block === BUILDING_STYLE_DEFAULTS["light.lantern"]);
      // The porch lamp is a lantern too, and it is not one of the interior
      // lights `meta.lanternCount` counts.
      const inside = lanterns.filter((o) => o.props?.["hanging"] === "true");
      expect(inside.length).toBe(meta.lanternCount);
      if (meta.interior.x0 <= meta.interior.x1 && meta.interior.z0 <= meta.interior.z1) {
        expect(meta.lanternCount).toBe(meta.params.floors);
      }
      // Every hanging lantern has the floor/ceiling plane above it to hang from.
      const filled = new Set(ops.map(key));
      for (const lamp of lanterns) {
        const supported =
          filled.has(`${lamp.x},${lamp.y + 1},${lamp.z}`) ||
          filled.has(`${lamp.x},${lamp.y - 1},${lamp.z}`);
        expect(supported, `${c.label} lantern at ${key(lamp)}`).toBe(true);
      }
    }
  });

  it("honours the material overrides", () => {
    const { ops } = generateBuilding({
      size: [9, 9, 9],
      params: { wallSymbol: "sandstone", trimSymbol: "acacia_log", roofSymbol: "brick_stairs" },
      seed: SEED,
      style: { "floor.interior": "smooth_stone" },
    });
    const blocks = new Set(ops.map((o) => o.block));
    expect(blocks.has("sandstone")).toBe(true);
    expect(blocks.has("acacia_log")).toBe(true);
    expect(blocks.has("brick_stairs")).toBe(true);
    expect(blocks.has("smooth_stone")).toBe(true);
    expect(blocks.has("oak_planks")).toBe(false);
  });

  it("falls back to the nearest of the three roofs it builds", () => {
    const roofOf = (name: string): BuildingRoof =>
      generateBuilding({ size: [9, 10, 9], params: { roof: name }, seed: SEED }).meta.params.roof;
    expect(roofOf("steep_gable")).toBe("gable");
    expect(roofOf("gambrel")).toBe("gable");
    expect(roofOf("pyramid")).toBe("hip");
    expect(roofOf("flat")).toBe("flat");
  });
});

describe("rotateOps", () => {
  it("is a bijection of the footprint onto the rotated box", () => {
    for (const c of CASES) {
      const [sx, , sz] = c.size;
      const ops = build(c).ops;
      for (const yaw of YAWS) {
        const rotated = rotateOps(ops, yaw, sx, sz);
        expect(rotated.length).toBe(ops.length);
        expect(new Set(rotated.map(key)).size).toBe(ops.length);
        const [rx, rz] = yaw === 90 || yaw === 270 ? [sz, sx] : [sx, sz];
        for (const op of rotated) {
          expect(op.x).toBeGreaterThanOrEqual(-1);
          expect(op.z).toBeGreaterThanOrEqual(-1);
          expect(op.x).toBeLessThanOrEqual(rx);
          expect(op.z).toBeLessThanOrEqual(rz);
        }
      }
    }
  });

  it("composes back to the identity over four quarter turns", () => {
    const c = CASES[1] as Case;
    const [sx, , sz] = c.size;
    const ops = build(c).ops;
    let round = ops.slice();
    for (let i = 0; i < 4; i++) {
      const [w, d] = i % 2 === 0 ? [sx, sz] : [sz, sx];
      round = rotateOps(round, 90, w, d);
    }
    expect(JSON.stringify(round)).toBe(JSON.stringify(ops));
  });

  it("rotates the `facing` property with the geometry", () => {
    // The headline case from the brief: a west-facing stair becomes
    // north-facing under a 90° turn.
    expect(rotateFacing("west", 90)).toBe("north");
    expect(rotateFacing("north", 90)).toBe("east");
    expect(rotateFacing("east", 90)).toBe("south");
    expect(rotateFacing("south", 90)).toBe("west");
    expect(rotateFacing("north", 180)).toBe("south");
    expect(rotateFacing("north", 270)).toBe("west");
    expect(rotateFacing("north", 0)).toBe("north");

    const op: LocalVoxelOp = { x: 0, y: 1, z: 0, block: "oak_stairs", props: { facing: "west", half: "bottom" } };
    const [turned] = rotateOps([op], 90, 5, 5);
    expect(turned?.props?.["facing"]).toBe("north");
    expect(turned?.props?.["half"]).toBe("bottom");
  });

  it("rotates the door of a placed building onto the rotated face", () => {
    const c = CASES[0] as Case;
    const [sx, , sz] = c.size;
    const { ops, meta } = build(c, { door: { face: "south" } });
    const doorOps = ops.filter((o) => o.block === BUILDING_STYLE_DEFAULTS["door.block"]);
    for (const yaw of YAWS) {
      const rotated = rotateOps(doorOps, yaw, sx, sz);
      const expectedFace = rotateFacing("south", yaw);
      for (const op of rotated) expect(op.props?.["facing"]).toBe(expectedFace);
      // Under yaw 90 the south wall (z = sz−1) becomes the west wall (x = 0).
      const moved = rotateLocalColumn(meta.door?.x as number, meta.door?.z as number, sx, sz, yaw);
      expect(rotated.every((o) => o.x === moved.x && o.z === moved.z)).toBe(true);
    }
  });

  it("rotates pillar axes and pane connection flags", () => {
    expect(rotateProps({ axis: "x" }, 90)).toEqual({ axis: "z" });
    expect(rotateProps({ axis: "z" }, 90)).toEqual({ axis: "x" });
    expect(rotateProps({ axis: "x" }, 180)).toEqual({ axis: "x" });
    expect(rotateProps({ axis: "y" }, 90)).toEqual({ axis: "y" });
    expect(rotateProps({ east: "true", west: "true" }, 90)).toEqual({ south: "true", north: "true" });
    expect(rotateProps({ north: "true", south: "true" }, 180)).toEqual({ south: "true", north: "true" });
    expect(rotateProps(undefined, 90)).toBeUndefined();
    expect(rotateProps({ half: "upper" }, 90)).toEqual({ half: "upper" });
  });

  it("keeps the rotated building's walls enclosing its rotated footprint", () => {
    const c = CASES[4] as Case;
    const [sx, , sz] = c.size;
    const { ops, meta } = build(c);
    for (const yaw of YAWS) {
      const rotated = rotateOps(ops, yaw, sx, sz);
      const [w, d] = yaw === 90 || yaw === 270 ? [sz, sx] : [sx, sz];
      const filled = new Set(rotated.map(key));
      for (let y = 1; y <= meta.wallTop; y++) {
        for (let x = 0; x < w; x++) {
          expect(filled.has(`${x},${y},0`)).toBe(true);
          expect(filled.has(`${x},${y},${d - 1}`)).toBe(true);
        }
      }
    }
  });
});

describe("material themes", () => {
  it("picks a theme deterministically, and honours an override", () => {
    const a = pickTheme(SEED);
    expect(pickTheme(SEED).id).toBe(a.id);
    expect(MATERIAL_THEMES.map((t) => t.id)).toContain(a.id);
    for (const theme of MATERIAL_THEMES) {
      expect(pickTheme(SEED, theme.id).id).toBe(theme.id);
    }
    // An unknown name falls back to the seed's draw rather than failing.
    expect(pickTheme(SEED, "no_such_theme").id).toBe(a.id);
  });

  it("deals a distinct triple to every building until the palette runs out", () => {
    for (const theme of MATERIAL_THEMES) {
      const capacity = theme.woods.length * theme.roofs.length;
      const deal = assignMaterials(theme, capacity, SEED);
      expect(new Set(deal.map(materialKey)).size).toBe(capacity);
      // Below capacity the property still holds — that is the case a village of
      // eight or nine houses actually exercises.
      for (const n of [2, 5, 9]) {
        const some = assignMaterials(theme, n, SEED);
        expect(new Set(some.map(materialKey)).size).toBe(Math.min(n, capacity));
      }
      // Past capacity it wraps, which is the documented exhaustion case.
      const over = assignMaterials(theme, capacity + 3, SEED);
      expect(new Set(over.map(materialKey)).size).toBe(capacity);
    }
  });

  it("deals the same hand for the same seed and a different one otherwise", () => {
    const theme = MATERIAL_THEMES[0] as MaterialTheme;
    const a = assignMaterials(theme, 9, SEED).map(materialKey);
    expect(assignMaterials(theme, 9, SEED).map(materialKey)).toEqual(a);
    const other = assignMaterials(theme, 9, nodeSeed(0x5eedn, "world.elsewhere")).map(materialKey);
    expect(other).not.toEqual(a);
  });

  it("reads an archetype off a node's tags", () => {
    expect(archetypeOfTags(["civic", "hall"])).toBe("hall");
    expect(archetypeOfTags(["house", "trade"])).toBe("inn");
    expect(archetypeOfTags(["craft"])).toBe("smithy");
    expect(archetypeOfTags(["store"])).toBe("granary");
    expect(archetypeOfTags(["civic", "lookout"])).toBe("watchtower");
    expect(archetypeOfTags(["house"])).toBe("cottage");
    expect(archetypeOfTags([])).toBe("cottage");
  });

  it("furnishes each archetype with something to find inside", () => {
    const props: Record<string, string[]> = {
      cottage: ["red_bed", "crafting_table"],
      inn: ["barrel", "cauldron"],
      smithy: ["blast_furnace", "anvil", "smithing_table"],
      granary: ["hay_block", "composter"],
      hall: ["white_carpet", "blue_banner"],
    };
    for (const [archetype, wanted] of Object.entries(props)) {
      const { ops, meta } = generateBuilding({
        size: [11, 11, 11],
        params: { floors: 1, archetype },
        seed: SEED,
        style: PINNED,
      });
      const blocks = new Set(ops.map((o) => o.block));
      for (const block of wanted) expect(blocks.has(block), `${archetype}/${block}`).toBe(true);
      expect(meta.params.archetype).toBe(archetype);
      expect(meta.furnitureCount).toBeGreaterThan(2);
    }
  });

  it("builds a watchtower as a tower, not a house with a flat lid", () => {
    const { ops, meta } = generateBuilding({
      size: [7, 19, 7],
      params: { archetype: "watchtower" },
      seed: SEED,
      style: PINNED,
    });
    expect(meta.params.archetype).toBe("watchtower");
    expect(meta.roofTop).toBeGreaterThan(14);
    // The shaft is set back from the base, so the widest course is not the top.
    const widthAt = (y: number): number => {
      const xs = ops.filter((o) => o.y === y).map((o) => o.x);
      return xs.length === 0 ? 0 : Math.max(...xs) - Math.min(...xs) + 1;
    };
    expect(widthAt(3)).toBe(7);
    expect(widthAt(8)).toBe(5);
    // Crenellations: the parapet's top course covers only part of its ring.
    const parapet = ops.filter((o) => o.y === meta.roofTop).length;
    const below = ops.filter((o) => o.y === meta.roofTop - 1).length;
    expect(parapet).toBeGreaterThan(4);
    expect(parapet).toBeLessThan(below);
    // Climbable, and nothing floating: a ladder the full height of the shaft.
    expect(ops.filter((o) => o.block === "ladder").length).toBeGreaterThan(8);
  });

  it("puts a fire-safe campfire on top of a one-storey chimney", () => {
    const { ops, meta } = generateBuilding({
      size: [9, 8, 9],
      params: { floors: 1, roof: "gable", archetype: "cottage" },
      seed: SEED,
      style: PINNED,
    });
    expect(meta.chimney).toBe(true);
    const fire = ops.find((o) => o.block === "campfire");
    expect(fire).toBeDefined();
    const at = new Map(ops.map((o) => [key(o), o] as const));
    const fx = fire?.x as number;
    const fy = fire?.y as number;
    const fz = fire?.z as number;
    // Supported from below, open above, and ringed by stone on all four sides.
    expect(at.get(`${fx},${fy - 1},${fz}`)?.block).toBe(PINNED["chimney.block"]);
    expect(at.has(`${fx},${fy + 1},${fz}`)).toBe(false);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      expect(at.get(`${fx + dx},${fy},${fz + dz}`)?.block).toBe(PINNED["chimney.rim"]);
    }
    // The flue clears the ridge, so the smoke is not trapped under the roof.
    expect(fy).toBeGreaterThan(meta.roofTop);
  });
});

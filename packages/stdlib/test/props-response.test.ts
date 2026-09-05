/**
 * The **alien & sci-fi pack's human-response props** — the seven entries of
 * that are our side of the invasion, held
 * to the prop contract every earlier wave was held to.
 *
 * The shared checks first — registration, the declared box, the quarter turns,
 * determinism, no signs, no `chain` — and then the properties this half of the
 * pack was written against, each of which is a rule the physics lint would
 * otherwise find downstream:
 *
 * - **support closure.** Nothing floats: every block rests on the pad at
 *   `y = 0`, on a leg run down to it, or on a horizontal neighbour of its own.
 *   The dome's shell and the trailer's raised floor are the two cases that
 *   matter, so the check is the `floating.isolated` rule itself, run over the
 *   finished op set;
 * - **every leg is grounded.** The trailer's six jacks and the mast's three
 *   legs each have a block at `y = 1` over the pad, so nothing is a body
 *   hovering on a memory of a leg;
 * - **the array is aimed.** Every dish is the same shape at the same z, which
 *   is the entire read of the prop: four dishes pointing four ways is scrap.
 */

import { describe, expect, it } from "vitest";

import {
  ARRAY_DISHES,
  INFRA_ENTRY_IDS,
  NON_NODE_IMPLEMENTED,
  PROP_NAMES,
  RESPONSE_PROP_NAMES,
  STRUCTURE_CATALOG,
  dishStations,
  generateProp,
  isResponseProp,
  nodeSeed,
  propFootprint,
  responsePropFootprint,
  rotateOps,
  structureById,
  type LocalVoxelOp,
} from "../src/index.js";

const SEED = nodeSeed(0xa11e2n, "world.response.props");
const OTHER = nodeSeed(0xa11e2n, "world.response.props.other");

function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

function opsOf(prop: string, params: Record<string, unknown> = {}): LocalVoxelOp[] {
  return generateProp({ prop, seed: SEED, params }).ops;
}

/**
 * Blocks the `floating.*` rule has nothing to say about — it polices a **full
 * cube** with six air faces, and none of these is one.
 */
const NOT_A_FULL_CUBE =
  /(_slab$|_stairs$|_wall$|fence|trapdoor|carpet|lantern|_pot$|cauldron|iron_bars|torch|lightning_rod|daylight_detector)/;

/* -------------------------------------------------------------------------- */
/* the registry                                                                */
/* -------------------------------------------------------------------------- */

describe("the response pack's props", () => {
  it("registers every one of them, once", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      expect(PROP_NAMES as readonly string[]).toContain(p);
      expect(isResponseProp(p)).toBe(true);
    }
    expect(isResponseProp("herm_post")).toBe(false);
    expect(isResponseProp("crop_circle")).toBe(false);
    expect(new Set(PROP_NAMES).size).toBe(PROP_NAMES.length);
  });

  it("is claimed by the catalog as implemented, and as a PROP", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      const entry = structureById(p);
      expect(entry, p).toBeDefined();
      expect(entry?.status, p).toBe("implemented");
      expect(entry?.kind, p).toBe("prop");
      expect((entry?.note ?? "").length, p).toBeGreaterThan(20);
      expect(entry?.tags, p).toContain("alien_scifi");
      expect(STRUCTURE_CATALOG.filter((e) => e.id === p), p).toHaveLength(1);
    }
  });

  /**
   * The infrastructure half of §3.4 is not this file's, and must stay that way.
   *
 * Four of the seven are built now — W1 landed
   * them as `infra.entry@0` registry rows — and the thing this test actually
   * guards is unchanged by that: an entry is *a line, a chord or a treatment*
   * and is never a prop, so none of the seven may appear in `PROP_NAMES` and
   * none of them is this pack's to build. Family D's two fittings are built as
   * well now, and by neither host: a fitting *in* a structure is a param on
   * that structure. `maglev_pylon` was the one still waiting; it landed
   * 2026-08-15 with the `between` form's carried span, and without the tier-A
   * ground declaration §5 expected it to need — a pylon stands on the ground it
   * finds and is refused where it cannot, which asks the ground for nothing.
   */
  it("leaves the pack's infrastructure entries to the infrastructure host", () => {
    for (const id of [
      "crop_circle",
      "quarantine_fence",
      "crash_furrow",
      "barricade_line",
      "blast_door",
      "airlock_vestibule",
      "maglev_pylon",
    ]) {
      expect(PROP_NAMES as readonly string[], id).not.toContain(id);
      expect(structureById(id)?.kind, id).toBe("infrastructure");
    }
    // Family D's two fittings are built now, and *not* by an entry: a fitting
    // in another structure is a param on that structure
 //, so both are credited through
    // `NON_NODE_IMPLEMENTED` and neither is an `infra.entry@0` row. The
    // `between` route form's pylon is an entry, and the difference is the
    // teaching: a fitting is a param, a guideway is a line over ground nobody
    // owns.
    for (const id of ["blast_door", "airlock_vestibule"]) {
      expect(structureById(id)?.status, id).toBe("implemented");
      expect(NON_NODE_IMPLEMENTED as readonly string[], id).toContain(id);
      expect(INFRA_ENTRY_IDS as readonly string[], id).not.toContain(id);
    }
    expect(structureById("maglev_pylon")?.status).toBe("implemented");
    expect(INFRA_ENTRY_IDS as readonly string[]).toContain("maglev_pylon");
    for (const id of ["crop_circle", "quarantine_fence", "crash_furrow", "barricade_line"]) {
      expect(structureById(id)?.status, id).toBe("implemented");
      expect(INFRA_ENTRY_IDS as readonly string[], id).toContain(id);
    }
  });

  it("declares the box it builds in, and builds inside it", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      const declared = propFootprint(p, {});
      expect(declared, p).toEqual(responsePropFootprint(p));
      const result = generateProp({ prop: p, seed: SEED });
      expect(result.meta.size, p).toEqual(declared.size);
      expect(result.ops.length, p).toBeGreaterThan(10);
      for (const op of result.ops) {
        expect(op.x, `${p} x`).toBeGreaterThanOrEqual(0);
        expect(op.x, `${p} x`).toBeLessThan(declared.size[0]);
        expect(op.z, `${p} z`).toBeGreaterThanOrEqual(0);
        expect(op.z, `${p} z`).toBeLessThan(declared.size[2]);
        expect(op.y, `${p} y`).toBeGreaterThanOrEqual(declared.minY);
        expect(op.y, `${p} y`).toBeLessThan(declared.minY + declared.size[1]);
      }
    }
  });

  it("survives every quarter turn with its box intact", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      const result = generateProp({ prop: p, seed: SEED });
      const [sx, , sz] = result.meta.size;
      for (const yaw of [90, 180, 270] as const) {
        const rotated = rotateOps(result.ops, yaw, sx, sz);
        expect(rotated.length, `${p} @${yaw}`).toBe(result.ops.length);
        const [w, d] = yaw === 180 ? [sx, sz] : [sz, sx];
        for (const op of rotated) {
          expect(op.x, `${p} @${yaw} x`).toBeGreaterThanOrEqual(0);
          expect(op.x, `${p} @${yaw} x`).toBeLessThan(w);
          expect(op.z, `${p} @${yaw} z`).toBeGreaterThanOrEqual(0);
          expect(op.z, `${p} @${yaw} z`).toBeLessThan(d);
        }
      }
    }
  });

  it("is deterministic, and reseeds without changing its box", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      const once = JSON.stringify(opsOf(p));
      expect(JSON.stringify(opsOf(p)), p).toBe(once);
      const other = generateProp({ prop: p, seed: OTHER });
      expect(other.meta.size, p).toEqual(responsePropFootprint(p).size);
      expect(other.ops.length, p).toBeGreaterThan(10);
    }
  });

  it("hangs no signs and uses no `chain`", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      for (const op of opsOf(p)) {
        expect(op.block.endsWith("_sign"), `${p} sign`).toBe(false);
        expect(op.block, `${p} chain`).not.toBe("chain");
      }
    }
  });

  /** Every one of them stands on hardstanding, edge to edge. */
  it("paves its whole footprint at the base plane", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      const declared = propFootprint(p, {});
      const at = indexOf(opsOf(p));
      for (let z = 0; z < declared.size[2]; z++) {
        for (let x = 0; x < declared.size[0]; x++) {
          expect(at.get(`${x},0,${z}`), `${p} pad at ${x},${z}`).toBeDefined();
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* support                                                                     */
/* -------------------------------------------------------------------------- */

describe("the response props' support closure", () => {
  it("leaves no full block with six air faces", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      const declared = propFootprint(p, {});
      const ops = opsOf(p);
      const at = indexOf(ops);
      const solid = (x: number, y: number, z: number): boolean => {
        if (y < declared.minY) return true; // the ground the prop stands on
        const block = at.get(`${x},${y},${z}`)?.block;
        return block !== undefined && block !== "air";
      };
      for (const op of ops) {
        if (op.block === "air" || NOT_A_FULL_CUBE.test(op.block)) continue;
        const touching =
          solid(op.x + 1, op.y, op.z) ||
          solid(op.x - 1, op.y, op.z) ||
          solid(op.x, op.y, op.z + 1) ||
          solid(op.x, op.y, op.z - 1) ||
          solid(op.x, op.y + 1, op.z) ||
          solid(op.x, op.y - 1, op.z);
        expect(touching, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBe(true);
      }
    }
  });

  /** Gravity blocks are the emplacement's business: every bag needs a floor. */
  it("stands every falling block on something solid", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      const ops = opsOf(p);
      const at = indexOf(ops);
      for (const op of ops) {
        if (!/^(sand|gravel|red_sand)$/.test(op.block)) continue;
        if (op.y === 0) continue;
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBeDefined();
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).not.toBe("air");
      }
    }
  });

  /** Fences, walls and standing lanterns are on the support chain too. */
  it("stands every wall, fence and standing lantern on something", () => {
    for (const p of RESPONSE_PROP_NAMES) {
      const ops = opsOf(p);
      const at = indexOf(ops);
      for (const op of ops) {
        if (!/(_wall$|fence|^lantern$)/.test(op.block)) continue;
        if (op.props?.["hanging"] === "true") continue;
        if (op.y === 0) continue;
        const under = at.get(`${op.x},${op.y - 1},${op.z}`);
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).toBeDefined();
        expect(under?.block, `${p}: ${op.block} at ${op.x},${op.y},${op.z}`).not.toBe("air");
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the props themselves                                                        */
/* -------------------------------------------------------------------------- */

describe("what each response prop is for", () => {
  it("domes the containment tent, and gives it a tube and a generator", () => {
    const ops = opsOf("containment_tent");
    const at = indexOf(ops);
    // The crown, five courses over the pad, and a skin that comes back down.
    expect(at.get("7,5,5")?.block, "the crown").toBeDefined();
    expect(at.get("2,1,5")?.block, "the west springing").toBeDefined();
    expect(at.get("12,1,3")?.block, "the east springing").toBeDefined();
    // The dome is a shell, not a solid: the middle of it is air.
    expect(at.get("7,2,5"), "the inside of the dome").toBeUndefined();
    // The airlock tube, walled and roofed, and open down its axis.
    for (let x = 13; x <= 14; x++) {
      expect(at.get(`${x},1,4`)?.block, `tube wall at ${x}`).toBeDefined();
      expect(at.get(`${x},1,6`)?.block, `tube wall at ${x}`).toBeDefined();
      expect(at.get(`${x},3,5`)?.block, `tube roof at ${x}`).toBeDefined();
    }
    expect(at.get("13,1,5"), "the passage").toBeUndefined();
    // And the skin parts where the tube meets it, so the airlock leads inside.
    expect(at.get("12,1,5"), "the tube's mouth").toBeUndefined();
    expect(at.get("14,1,5")?.block, "the hatch").toBe("iron_trapdoor");
    // The generator, at the back.
    expect(at.get("0,1,5")?.block, "the generator").toBeDefined();
    expect(ops.some((op) => op.block === "lantern"), "the work lamp").toBe(true);
  });

  it("stands the trailer on jacks with clear air under its floor", () => {
    const at = indexOf(opsOf("field_lab_trailer"));
    for (const x of [1, 4, 7]) {
      for (const z of [1, 3]) {
        expect(at.get(`${x},1,${z}`)?.block, `jack at ${x},${z}`).toBe("iron_block");
      }
    }
    // The gap under the body is the read, so it has to actually be a gap.
    expect(at.get("3,1,2"), "under the floor").toBeUndefined();
    expect(at.get("3,2,2")?.block, "the floor").toBeDefined();
    expect(at.get("4,4,2")?.block, "the roof").toBeDefined();
    expect(at.get("4,3,3")?.block, "the shuttered hatch").toBe("iron_trapdoor");
    expect(at.get("4,1,4")?.block, "the step").toBeDefined();
    expect(at.get("6,6,2")?.block, "the aerial").toBe("lightning_rod");
  });

  it("gives the sensor mast three grounded legs, a solar rack and a head", () => {
    const at = indexOf(opsOf("sensor_mast"));
    for (const [x, z] of [
      [1, 1],
      [3, 1],
      [2, 3],
    ] as const) {
      expect(at.get(`${x},1,${z}`)?.block, `leg foot at ${x},${z}`).toBe("iron_block");
      expect(at.get(`${x},2,${z}`)?.block, `leg at ${x},${z}`).toBe("iron_block");
    }
    expect(at.get("2,3,2")?.block, "the deck").toBeDefined();
    const panels = [...at.values()].filter((op) => op.block === "daylight_detector");
    expect(panels.length, "the solar rack").toBe(6);
    expect(at.get("2,7,2")?.block, "the blinking head").toBe("glowstone");
  });

  /**
   * The aim is the read. Every dish is generated from the same function of its
   * station, so this asserts the thing the note asks for: identical shape, at
   * an identical z, at every station.
   */
  it("aims every dish in the array the same way", () => {
    const at = indexOf(opsOf("dish_array"));
    const stations = dishStations();
    expect(stations.length, "the dishes").toBe(ARRAY_DISHES);
    for (const px of stations) {
      // The pedestal and its mount.
      expect(at.get(`${px},1,3`)?.block, `pedestal at ${px}`).toBeDefined();
      expect(at.get(`${px},3,3`)?.block, `mount at ${px}`).toBe("iron_block");
      // The face, at z = 3, at every station.
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [2, 0],
        [-2, 0],
        [0, 2],
      ] as const) {
        expect(at.get(`${px + dx},${5 + dy},3`)?.block, `face ${dx},${dy} at ${px}`).toBeDefined();
      }
      // The rim carried forward, and the feed horn at the focus — same z for
      // all four, which is what "all aimed the same way" means.
      expect(at.get(`${px + 2},5,4`)?.block, `rim at ${px}`).toBeDefined();
      expect(at.get(`${px},5,5`)?.block, `feed horn at ${px}`).toBe("glowstone");
    }
    // And nothing points backwards: no dish part behind the pedestal plane.
    for (const op of at.values()) {
      if (op.y > 0) expect(op.z, "nothing aims backwards").toBeGreaterThanOrEqual(1);
    }
  });

  it("closes the emplacement on three sides and leaves the rear open", () => {
    const ops = opsOf("sandbag_emplacement");
    const at = indexOf(ops);
    for (let x = 0; x < 7; x++) {
      expect(at.get(`${x},1,0`)?.block, `parapet at ${x}`).toBeDefined();
      expect(at.get(`${x},2,0`)?.block, `upper course at ${x}`).toBeDefined();
    }
    for (let z = 1; z <= 4; z++) {
      expect(at.get(`0,2,${z}`)?.block, `flank at ${z}`).toBeDefined();
      expect(at.get(`6,2,${z}`)?.block, `flank at ${z}`).toBeDefined();
      // The rear is open: nothing above the pad on the middle line.
      expect(at.get(`3,1,${z + 1}`), `the open rear at ${z + 1}`).toBeUndefined();
    }
    expect(at.get("1,1,1")?.block, "the firing step").toBeDefined();
    expect(ops.some((op) => op.block === "barrel"), "the ammunition crate").toBe(true);
  });

  it("gives the command post an awning, a map table under it and a mast", () => {
    const at = indexOf(opsOf("mobile_command_post"));
    expect(at.get("4,5,3")?.block, "the roof").toBeDefined();
    for (let x = 2; x <= 7; x++) {
      expect(at.get(`${x},5,5`)?.block, `awning at ${x}`).toBe("white_wool");
      expect(at.get(`${x},5,6`)?.block, `awning at ${x}`).toBe("white_wool");
    }
    // The posts that carry it reach the pad.
    for (const x of [2, 7]) expect(at.get(`${x},1,6`)?.block, `post at ${x}`).toBeDefined();
    expect(at.get("4,1,5")?.block, "the map table").toBe("cartography_table");
    expect(at.get("10,6,3")?.block, "the antenna").toBe("lightning_rod");
    // The crew compartment is hollow, not a block of armour.
    expect(at.get("4,3,2"), "the inside").toBeUndefined();
  });

  it("keeps the sentry turret to three cells, with a head and a lamp", () => {
    const declared = propFootprint("sentry_turret", {});
    expect(declared.size).toEqual([3, 4, 3]);
    const at = indexOf(opsOf("sentry_turret"));
    expect(at.get("1,1,1")?.block, "the pedestal").toBeDefined();
    expect(at.get("1,2,1")?.block, "the head").toBe("gray_concrete");
    expect(at.get("1,2,0")?.block, "the barrel").toBe("iron_bars");
    expect(at.get("1,3,1")?.block, "the lamp").toBe("glowstone");
  });
});

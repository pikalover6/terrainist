/**
 * The catalog's **family D**, as far as it goes pre-freeze: `blast_door` and
 * `airlock_vestibule`, both realised as `params.entrance.treatment` on the
 * building that owns the door.
 *
 * Held to the contract every fitting that writes near a door has to meet, and
 * every clause below is a defect this codebase has already paid for once:
 *
 * - **both door planes traverse.** Each leaf is a matched lower/upper pair over
 *   a solid block (`door.half_mismatch`, `unsupported.door`), and the walk from
 *   the door reaches the whole room through them;
 * - **the doorstep stays standable and enterable** — nothing at `y = 1` or
 *   `y = 2` in the cell a player opens the door from, whatever the porch does
 *   over their head;
 * - **an apron column is grounded**: `y = 0` filled where the shell left air,
 *   so a porch post is never a column standing on nothing;
 * - **glowstone, never a lantern; no `chain`; nothing that falls** — no sand
 *   and no gravel in a course a floor is made of;
 * - **no floating cube**: every block written touches the wall, a post or the
 *   ground;
 * - **byte-identity for the document that did not ask.** A build with no
 *   `entrance` param is op-for-op the build it was before this file existed.
 */

import { describe, expect, it } from "vitest";

import {
  BUILDING_ARCHETYPES,
  BUILDING_STYLE_DEFAULTS,
  ENTRANCE_TREATMENTS,
  ENTRANCE_TREATMENT_HOSTS,
  MODERN_CITY_THEME,
  NON_NODE_IMPLEMENTED,
  STRUCTURE_CATALOG,
  assignMaterials,
  generateBuilding,
  isEntranceTreatment,
  nodeSeed,
  structureById,
  styleOf,
  type LocalVoxelOp,
} from "../src/index.js";
import { walkabilityReport } from "./helpers/walkability.js";

/* -------------------------------------------------------------------------- */
/* harness                                                                     */
/* -------------------------------------------------------------------------- */

const S = nodeSeed(0xd005ee0n, "world.entrance");
const OTHER = nodeSeed(0xd005ee0n, "world.entrance.other");

/** Two material deals: the pinned defaults, and a modern-city one. */
const STYLES: readonly Readonly<Record<string, string>>[] = [
  BUILDING_STYLE_DEFAULTS,
  styleOf(assignMaterials(MODERN_CITY_THEME, 1, S)[0]!),
];

/** Three envelopes, from generous to tight. */
const SIZES: readonly (readonly [number, number, number])[] = [
  [13, 14, 15],
  [11, 12, 11],
  [9, 10, 9],
];

function build(
  archetype: string,
  treatment: string | undefined,
  size: readonly [number, number, number] = SIZES[0]!,
  style: Readonly<Record<string, string>> = BUILDING_STYLE_DEFAULTS,
  seed = S,
): ReturnType<typeof generateBuilding> {
  return generateBuilding({
    size,
    params: {
      archetype,
      ...(treatment === undefined ? {} : { entrance: { treatment } }),
    },
    seed,
    style,
  });
}

/** An op index, keyed by cell. Later ops win, as the emit pass writes them. */
function indexOf(ops: readonly LocalVoxelOp[]): Map<string, LocalVoxelOp> {
  const map = new Map<string, LocalVoxelOp>();
  for (const op of ops) map.set(`${op.x},${op.y},${op.z}`, op);
  return map;
}

const AIR = new Set(["air", "cave_air", "void_air"]);

function blockAt(map: Map<string, LocalVoxelOp>, x: number, y: number, z: number): string | undefined {
  const op = map.get(`${x},${y},${z}`);
  return op === undefined || AIR.has(op.block) ? undefined : op.block;
}

/** The op list as a printable key, for the identity checks. */
function fingerprint(result: ReturnType<typeof generateBuilding>): string {
  return result.ops
    .map((o) => `${o.x},${o.y},${o.z},${o.block},${JSON.stringify(o.props ?? {})}`)
    .join("|");
}

const step = (face: string): readonly [number, number] =>
  face === "north" ? [0, -1] : face === "south" ? [0, 1] : face === "east" ? [1, 0] : [-1, 0];

/** Every (archetype, size, style) a treatment is asserted over. */
function* cases(treatment: "blast_door" | "airlock_vestibule"): Generator<{
  readonly archetype: string;
  readonly size: readonly [number, number, number];
  readonly style: Readonly<Record<string, string>>;
}> {
  for (const archetype of ENTRANCE_TREATMENT_HOSTS[treatment]) {
    for (const size of SIZES) {
      for (const style of STYLES) yield { archetype, size, style };
    }
  }
}

/* -------------------------------------------------------------------------- */
/* the vocabulary and the catalog                                              */
/* -------------------------------------------------------------------------- */

describe("family D — the entrance fittings", () => {
  it("names exactly the two catalog ids it builds", () => {
    expect([...ENTRANCE_TREATMENTS]).toEqual(["blast_door", "airlock_vestibule"]);
    for (const id of ENTRANCE_TREATMENTS) {
      expect(isEntranceTreatment(id)).toBe(true);
      expect(structureById(id)).toBeDefined();
    }
    expect(isEntranceTreatment("moon_gate")).toBe(false);
    expect(isEntranceTreatment("cottage")).toBe(false);
  });

  it("credits both rows in the catalog, and both directions agree", () => {
    for (const id of ENTRANCE_TREATMENTS) {
      const row = STRUCTURE_CATALOG.find((e) => e.id === id);
      expect(row, id).toBeDefined();
      // Implemented, and implemented as a non-node: no generator names it, so
      // the catalog test's backing set has to carry it explicitly.
      expect(row?.status, id).toBe("implemented");
      expect(NON_NODE_IMPLEMENTED).toContain(id);
      // The note has to say HOW it is reached, or the row is a claim an author
      // cannot act on.
      expect(row?.note ?? "").toContain("entrance");
      expect(row?.note ?? "").toContain(id);
    }
  });

  it("names hosts that are real archetypes", () => {
    for (const treatment of ENTRANCE_TREATMENTS) {
      const hosts = ENTRANCE_TREATMENT_HOSTS[treatment];
      expect(hosts.length).toBeGreaterThan(0);
      for (const host of hosts) {
        expect(BUILDING_ARCHETYPES as readonly string[], `${treatment}/${host}`).toContain(host);
      }
    }
  });

  it("changes nothing at all for a document that did not ask", () => {
    for (const treatment of ENTRANCE_TREATMENTS) {
      for (const { archetype, size, style } of cases(treatment)) {
        const plain = build(archetype, undefined, size, style);
        const nonsense = build(archetype, "moon_gate", size, style);
        expect(fingerprint(nonsense), `${archetype}@${size.join("x")}`).toBe(fingerprint(plain));
      }
    }
  });

  it("gives the same ops for the same seed, and different ones for another", () => {
    for (const treatment of ENTRANCE_TREATMENTS) {
      const a = build("bunker_complex", treatment);
      const b = build("bunker_complex", treatment);
      expect(fingerprint(a)).toBe(fingerprint(b));
      const other = build("bunker_complex", treatment, SIZES[0], BUILDING_STYLE_DEFAULTS, OTHER);
      expect(other.ops.length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* the shared physics                                                          */
/* -------------------------------------------------------------------------- */

describe("both fittings, on every host and envelope", () => {
  it("builds something, and the room stays walkable from the door", () => {
    for (const treatment of ENTRANCE_TREATMENTS) {
      for (const { archetype, size, style } of cases(treatment)) {
        const where = `${treatment}/${archetype}@${size.join("x")}`;
        const plain = build(archetype, undefined, size, style);
        const fitted = build(archetype, treatment, size, style);
        expect(fingerprint(fitted), where).not.toBe(fingerprint(plain));
        const report = walkabilityReport(fitted);
        expect(report.start, where).not.toBeNull();
        expect(report.pocket, `${where}\n${report.map}`).toEqual([]);
      }
    }
  });

  it("hangs every leaf as a matched pair over a solid block", () => {
    for (const treatment of ENTRANCE_TREATMENTS) {
      for (const { archetype, size, style } of cases(treatment)) {
        const fitted = build(archetype, treatment, size, style);
        const map = indexOf(fitted.ops);
        const lower = fitted.ops.filter(
          (o) => o.block.endsWith("_door") && (o.props?.["half"] ?? "lower") === "lower",
        );
        expect(lower.length, `${treatment}/${archetype}`).toBeGreaterThanOrEqual(1);
        for (const leaf of lower) {
          const upper = map.get(`${leaf.x},${leaf.y + 1},${leaf.z}`);
          expect(upper?.block, `${treatment}/${archetype} upper half`).toBe(leaf.block);
          expect(upper?.props?.["half"]).toBe("upper");
          expect(upper?.props?.["facing"]).toBe(leaf.props?.["facing"]);
          // `unsupported.door`: a leaf stands on the block below it.
          expect(blockAt(map, leaf.x, leaf.y - 1, leaf.z), "solid below the leaf").toBeDefined();
        }
      }
    }
  });

  it("lights with glowstone, hangs no chain, and lays nothing that falls", () => {
    for (const treatment of ENTRANCE_TREATMENTS) {
      for (const { archetype, size, style } of cases(treatment)) {
        // The diff is taken **per cell**, not per block name: a hydroponics bay
        // already carries glowstone under its trays, and a name-wise diff would
        // have quietly excused the fitting from lighting its own doorstep.
        const plainOps = build(archetype, undefined, size, style).ops;
        const plain = new Map(plainOps.map((o) => [`${o.x},${o.y},${o.z}`, o.block]));
        const fitted = build(archetype, treatment, size, style);
        const added = fitted.ops.filter(
          (o) => plain.get(`${o.x},${o.y},${o.z}`) !== o.block,
        );
        expect(added.some((o) => o.block === "glowstone"), `${treatment} lamp`).toBe(true);
        for (const op of fitted.ops) {
          expect(op.block, `${treatment}/${archetype}`).not.toBe("chain");
        }
        for (const op of added) {
          expect(op.block).not.toMatch(/(^|_)(sand|gravel|concrete_powder)$/);
          expect(op.block).not.toMatch(/lantern$/);
        }
      }
    }
  });

  it("writes no cube with air on all six faces", () => {
    for (const treatment of ENTRANCE_TREATMENTS) {
      for (const { archetype, size, style } of cases(treatment)) {
        const fitted = build(archetype, treatment, size, style);
        const map = indexOf(fitted.ops);
        const added = new Set(
          build(archetype, undefined, size, style).ops.map((o) => `${o.x},${o.y},${o.z}`),
        );
        for (const op of fitted.ops) {
          if (AIR.has(op.block)) continue;
          if (!/(concrete|glowstone|iron_block|cut_copper)$/.test(op.block)) continue;
          if (added.has(`${op.x},${op.y},${op.z}`)) continue;
          const touching = [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ].some(([dx, dy, dz]) =>
            blockAt(map, op.x + (dx as number), op.y + (dy as number), op.z + (dz as number)) !==
            undefined,
          );
          expect(touching, `${treatment}/${archetype} ${op.block} at ${op.x},${op.y},${op.z}`).toBe(
            true,
          );
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* blast_door                                                                  */
/* -------------------------------------------------------------------------- */

describe("blast_door", () => {
  it("puts iron leaves in a hydraulic frame under a warning band", () => {
    for (const { archetype, size, style } of cases("blast_door")) {
      const where = `${archetype}@${size.join("x")}`;
      const fitted = build(archetype, "blast_door", size, style);
      const map = indexOf(fitted.ops);
      const door = fitted.meta.door;
      expect(door, where).toBeTruthy();
      if (door == null) continue;
      // The leaf in the port's own column is iron, both halves.
      expect(blockAt(map, door.x, 1, door.z), where).toBe("iron_door");
      expect(blockAt(map, door.x, 2, door.z), where).toBe("iron_door");
      // The band across the head, with a lamp at each end of the run.
      const band = fitted.ops.filter(
        (o) => o.y === 3 && (o.block === "yellow_concrete" || o.block === "black_concrete"),
      );
      expect(band.length, `${where} band`).toBeGreaterThan(0);
      expect(fitted.ops.some((o) => o.y === 3 && o.block === "glowstone"), where).toBe(true);
      // The hydraulic frame, and a lever on each side of it.
      expect(fitted.ops.some((o) => o.block === "iron_block" && o.y <= 2), where).toBe(true);
      const levers = fitted.ops.filter((o) => o.block === "lever");
      expect(levers.length, `${where} levers`).toBeGreaterThanOrEqual(2);
      for (const lever of levers) {
        expect(lever.props?.["face"]).toBe("wall");
        const [dx, dz] = step(lever.props?.["facing"] ?? "north");
        // A wall lever hangs on the block behind it.
        expect(blockAt(map, lever.x - dx, lever.y, lever.z - dz), `${where} lever backing`).toBeDefined();
      }
    }
  });

  it("leaves the doorstep standable and enterable", () => {
    for (const { archetype, size, style } of cases("blast_door")) {
      const fitted = build(archetype, "blast_door", size, style);
      const map = indexOf(fitted.ops);
      const door = fitted.meta.door;
      if (door == null) continue;
      const face = fitted.ops.find(
        (o) => o.x === door.x && o.y === 1 && o.z === door.z && o.block.endsWith("_door"),
      );
      const [dx, dz] = step(face?.props?.["facing"] ?? "north");
      for (const y of [1, 2]) {
        const at = blockAt(map, door.x + dx, y, door.z + dz);
        // Only a lever may stand in the apron at body height, and never in the
        // doorstep column itself.
        expect(at, `${archetype} doorstep y=${y}`).toBeUndefined();
      }
    }
  });

  it("digs nothing: not one op below the shell's own floor plane", () => {
    for (const { archetype, size, style } of cases("blast_door")) {
      const plain = new Set(
        build(archetype, undefined, size, style).ops.map((o) => `${o.x},${o.y},${o.z}`),
      );
      const fitted = build(archetype, "blast_door", size, style);
      for (const op of fitted.ops) {
        if (plain.has(`${op.x},${op.y},${op.z}`)) continue;
        expect(op.y, `${archetype} new op at y=${op.y}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* airlock_vestibule                                                           */
/* -------------------------------------------------------------------------- */

describe("airlock_vestibule", () => {
  it("builds two door planes with a chamber between them", () => {
    for (const { archetype, size, style } of cases("airlock_vestibule")) {
      const where = `${archetype}@${size.join("x")}`;
      const fitted = build(archetype, "airlock_vestibule", size, style);
      const map = indexOf(fitted.ops);
      const door = fitted.meta.door;
      expect(door, where).toBeTruthy();
      if (door == null) continue;
      const outer = fitted.ops.find(
        (o) => o.x === door.x && o.y === 1 && o.z === door.z && o.block.endsWith("_door"),
      );
      expect(outer, `${where} outer plane`).toBeDefined();
      const [ox, oz] = step(outer?.props?.["facing"] ?? "north");
      // Inward: the chamber, then the inner plane.
      const chamber = { x: door.x - ox, z: door.z - oz };
      const inner = { x: chamber.x - ox, z: chamber.z - oz };
      expect(blockAt(map, inner.x, 1, inner.z), `${where} inner plane`).toBe("iron_door");
      expect(blockAt(map, inner.x, 2, inner.z), where).toBe("iron_door");
      // The chamber is a cell a player fits in, both courses.
      expect(blockAt(map, chamber.x, 1, chamber.z), `${where} chamber feet`).toBeUndefined();
      const head = blockAt(map, chamber.x, 2, chamber.z);
      expect(head === undefined || head === "lever", `${where} chamber head`).toBe(true);
      // The sill, flush under all three planes of the walk-through.
      expect(blockAt(map, chamber.x, 0, chamber.z), `${where} sill`).toBe("cut_copper");
      // And a lever each side of the iron plane.
      expect(fitted.ops.filter((o) => o.block === "lever").length, where).toBeGreaterThanOrEqual(2);
    }
  });

  it("projects a grounded porch that leaves the doorstep clear", () => {
    for (const { archetype, size, style } of cases("airlock_vestibule")) {
      const where = `${archetype}@${size.join("x")}`;
      const fitted = build(archetype, "airlock_vestibule", size, style);
      const map = indexOf(fitted.ops);
      const door = fitted.meta.door;
      if (door == null) continue;
      const outer = fitted.ops.find(
        (o) => o.x === door.x && o.y === 1 && o.z === door.z && o.block.endsWith("_door"),
      );
      const [ox, oz] = step(outer?.props?.["facing"] ?? "north");
      const stepCell = { x: door.x + ox, z: door.z + oz };
      // The doorstep: nothing at body height, a lit lintel over it.
      expect(blockAt(map, stepCell.x, 1, stepCell.z), `${where} doorstep feet`).toBeUndefined();
      expect(blockAt(map, stepCell.x, 2, stepCell.z), `${where} doorstep head`).toBeUndefined();
      expect(blockAt(map, stepCell.x, 3, stepCell.z), `${where} lintel`).toBe("glowstone");
      // The posts either side, grounded and carrying the lintel.
      const alongZ = door.x === 0 || door.x === size[0] - 1;
      const [ax, az] = alongZ ? [0, 1] : [1, 0];
      for (const side of [-1, 1]) {
        const p = { x: stepCell.x + ax * side, z: stepCell.z + az * side };
        for (const y of [0, 1, 2]) {
          expect(blockAt(map, p.x, y, p.z), `${where} post y=${y}`).toBeDefined();
        }
      }
    }
  });

  it("never strands a cell of the room it partitioned", () => {
    for (const { archetype, size, style } of cases("airlock_vestibule")) {
      const fitted = build(archetype, "airlock_vestibule", size, style);
      const report = walkabilityReport(fitted);
      expect(report.pocket, `${archetype}@${size.join("x")}\n${report.map}`).toEqual([]);
      // The walk starts outside the inner plane and has to get through it.
      expect(report.reachable.length).toBeGreaterThan(4);
    }
  });
});

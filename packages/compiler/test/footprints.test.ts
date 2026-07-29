/**
 * Multi-rect footprints — the emit half.
 *
 * The grammar's side of an L is tested in `@terrainist/stdlib`; what is left
 * for the compiler is the *claim*. A wing means, for the first time, that a
 * building's envelope and the ground it actually covers are different things,
 * and every question the emit pass asks about a column — is this mine, is this
 * my neighbour's, is this apron needing a footing — has to be asked of the
 * cells rather than of the rect.
 */

import { describe, expect, it } from "vitest";

import { nodeSeed, resolveFootprint, traceShell, type BuildingWing } from "@terrainist/stdlib";

import { loadPrismarine } from "../src/emit/prismarine.js";
import { EMIT_MINECRAFT_VERSION } from "../src/emit/world.js";
import { devColumnPlan, DEV_GROUND_Y } from "../src/devworld.js";
import { buildBuildings, wingParamOf, type BuildingJob } from "../src/structures/buildings.js";
import { FOOTPRINT_EXHIBIT_ROWS, FOOTPRINT_L_ROW, FOOTPRINT_T_ROW } from "../src/exhibits/footprints.js";
import type { PortDeclaration } from "@terrainist/spec";
import type { Region } from "@terrainist/stdlib";
import type { StructureYaw } from "@terrainist/stdlib";

const stack = loadPrismarine(EMIT_MINECRAFT_VERSION);
const REGION: Region = { x0: -16, z0: -16, width: 96, depth: 96 };
const BOX: readonly [number, number, number] = [13, 9, 13];
const YAWS: readonly StructureYaw[] = [0, 90, 180, 270];

const PORTS: Readonly<Record<string, PortDeclaration>> = Object.freeze({
  door: { type: "door", face: "south", tags: ["primary"] } as PortDeclaration,
});

function job(
  id: string,
  x: number,
  z: number,
  yaw: StructureYaw,
  wing?: BuildingWing,
): BuildingJob {
  const nodePath = `test.${id}`;
  return {
    nodePath,
    placement: {
      nodePath,
      id,
      translation: [x, DEV_GROUND_Y, z],
      yaw,
      mirror: false,
      size: BOX,
      footprint: { x0: x, z0: z, x1: x + BOX[0] - 1, z1: z + BOX[2] - 1 },
      anchor: { x: x + 6, z: z + 6 },
      foundationY: DEV_GROUND_Y,
    },
    size: BOX,
    params: { floors: 1, roof: "gable", ...(wing === undefined ? {} : { wing }) },
    ports: PORTS,
    seed: nodeSeed(0x5eedn, nodePath),
    tags: ["cottage"],
  };
}

const ELL: BuildingWing = { size: [5, 4], side: "south", offset: 0 };

function run(jobs: readonly BuildingJob[]) {
  return buildBuildings(jobs, devColumnPlan(REGION, stack), stack);
}

describe("building emit — true cells", () => {
  it("claims the whole envelope for a rect and only the union for an L", () => {
    const rect = run([job("rect", 0, 0, 0)]).built[0];
    expect(rect?.cells.size).toBe(BOX[0] * BOX[2]);

    const ell = run([job("ell", 0, 0, 0, ELL)]).built[0];
    const cells = ell?.cells as ReadonlySet<string>;
    const shell = traceShell(resolveFootprint(BOX[0], BOX[2], ELL));
    expect(cells.size).toBe(shell.cells.length);
    expect(cells.size).toBeLessThan(BOX[0] * BOX[2]);
    for (const c of shell.cells) expect(cells.has(`${c.x},${c.z}`)).toBe(true);
    // The envelope is unchanged — the solver's reservation still stands.
    expect(ell?.footprint).toEqual({ x0: 0, z0: 0, x1: 12, z1: 12 });
  });

  it("rotates the claim with the building, at every yaw", () => {
    for (const yaw of YAWS) {
      const built = run([job("ell", 0, 0, yaw, ELL)]).built[0];
      const cells = built?.cells as ReadonlySet<string>;
      const shell = traceShell(resolveFootprint(BOX[0], BOX[2], ELL));
      expect(cells.size, `yaw ${yaw}`).toBe(shell.cells.length);
      // Still inside the envelope, whatever the yaw.
      for (const key of cells) {
        const [x, z] = key.split(",").map(Number) as [number, number];
        expect(x >= 0 && x < BOX[0] && z >= 0 && z < BOX[2], `yaw ${yaw} ${key}`).toBe(true);
      }
    }
    // Four different yaws give four different plans — a claim that ignored the
    // yaw would give the same set every time.
    const shapes = YAWS.map((yaw) =>
      [...((run([job("ell", 0, 0, yaw, ELL)]).built[0]?.cells as ReadonlySet<string>) ?? [])]
        .sort()
        .join("|"),
    );
    expect(new Set(shapes).size).toBe(4);
  });

  it("puts every structural block on a claimed column", () => {
    const result = run([job("ell", 0, 0, 0, ELL)]);
    const built = result.built[0];
    const cells = built?.cells as ReadonlySet<string>;
    const floorY = built?.floorY as number;
    const { wallTop } = built?.meta as { wallTop: number };
    // The notch is open ground. Apron decorations may reach one cell into it —
    // a window box under a sill, the doorstep awning, the porch lamp, the eave
    // course — and each of those is a block or two, with sky above and below.
    // A *wall* is the thing that may not be there, and a wall is a full column
    // from the floor plane to the eave plate. So: no unclaimed column inside
    // the envelope is solid all the way up, and every claimed one is.
    const solid = new Set(result.blocks.map((b) => `${b.x},${b.y},${b.z}`));
    const full = (x: number, z: number): boolean => {
      for (let y = floorY + 1; y <= floorY + wallTop; y++) {
        if (!solid.has(`${x},${y},${z}`)) return false;
      }
      return true;
    };
    let walls = 0;
    for (let z = 0; z <= 12; z++) {
      for (let x = 0; x <= 12; x++) {
        if (cells.has(`${x},${z}`)) continue;
        expect(full(x, z), `wall standing in the notch at ${x},${z}`).toBe(false);
      }
    }
    // ...and the claim is not vacuously satisfied: the union's own wall line is
    // solid all the way up, which is what a notch column is being compared to.
    const shell = traceShell(resolveFootprint(BOX[0], BOX[2], ELL));
    for (const cell of shell.ring) {
      if (full(cell.x, cell.z)) walls++;
    }
    expect(walls).toBeGreaterThan(shell.ring.length / 2);
  });

  it("does not drop an apron op that reaches into a neighbour's notch", () => {
    // The apron rule drops ops that land inside another building's claim. With
    // the claim as the envelope, an eave beside a neighbour's notch was dropped
    // for a wall that is not there; with the claim as the true cells it stands.
    //
    // The neighbour is an L with a *west* wing, so its west envelope column
    // exists only along the wing's run and is open ground everywhere else — and
    // the first building's east eave runs the whole length of it.
    const neighbourWing: BuildingWing = { size: [4, 5], side: "west", offset: 4 };
    const beside = (wing?: BuildingWing) =>
      run([job("ell", 0, 0, 0, ELL), job("east", BOX[0], 0, 0, wing)]).built[0]
        ?.blockCount as number;
    expect(beside(neighbourWing)).toBeGreaterThan(beside(undefined));
  });

  it("still drops an apron op that lands on a neighbour's wall", () => {
    // The rect case, unchanged: two envelopes side by side with no gap, so the
    // first building's eave lands squarely on the second's wall line.
    const alone = run([job("a", 0, 0, 0)]);
    const paired = run([job("a", 0, 0, 0), job("b", BOX[0], 0, 0)]);
    expect(paired.built[0]?.blockCount).toBeLessThan(alone.built[0]?.blockCount as number);
  });

  it("is deterministic and emits no unknown blocks", () => {
    const a = run([job("ell", 0, 0, 0, ELL), job("tee", 0, 24, 90, { size: [5, 4], side: "south", offset: 4 })]);
    const b = run([job("ell", 0, 0, 0, ELL), job("tee", 0, 24, 90, { size: [5, 4], side: "south", offset: 4 })]);
    expect(JSON.stringify(a.blocks)).toBe(JSON.stringify(b.blocks));
    expect(a.diagnostics).toEqual([]);
  });

  it("underpins an apron column beside a notch", () => {
    // The notch has no skirt of its own, so a doorstep or lamp beside it has to
    // fall back to the nearest column that does. What is asserted is the
    // absence of the defect: no apron block at the floor plane with nothing
    // under it.
    const result = run([job("ell", 0, 0, 0, ELL)]);
    const built = result.built[0];
    const floorY = built?.floorY as number;
    const solid = new Set(result.blocks.map((b) => `${b.x},${b.y},${b.z}`));
    const cells = built?.cells as ReadonlySet<string>;
    for (const b of result.blocks) {
      if (b.y !== floorY || cells.has(`${b.x},${b.z}`)) continue;
      // An apron block at the floor plane stands on ground or on its own
      // footing; the plain is flat at DEV_GROUND_Y, so "on ground" is floorY-1
      // being the surface.
      expect(
        solid.has(`${b.x},${floorY - 1},${b.z}`) || floorY - 1 === DEV_GROUND_Y,
        `${b.x},${b.z}`,
      ).toBe(true);
    }
  });
});

describe("wingParamOf", () => {
  it("reads the document spelling", () => {
    expect(wingParamOf({ size: [5, 4], side: "south", offset: 2 })).toEqual({
      size: [5, 4],
      side: "south",
      offset: 2,
    });
    expect(wingParamOf({ size: [5, 4], side: "west" })?.offset).toBe(0);
  });

  it("refuses everything that is not one", () => {
    for (const bad of [undefined, null, 4, "south", {}, { size: [5], side: "south" }, { size: [5, 4], side: "up" }, { size: [5, 4], side: "south", offset: "2" }]) {
      expect(wingParamOf(bad)).toBeUndefined();
    }
  });
});

describe("footprint exhibit rows", () => {
  it("shows an L and a T on every side, and every roof", () => {
    expect(FOOTPRINT_EXHIBIT_ROWS.map((r) => r.row)).toEqual(["footprint_l", "footprint_t"]);
    for (const row of FOOTPRINT_EXHIBIT_ROWS) {
      expect(row.cells).toHaveLength(7);
      expect(new Set(row.cells.map((c) => c.id)).size).toBe(row.cells.length);
      const sides = row.cells.map((c) => c.params?.wing.side);
      expect(new Set(sides)).toEqual(new Set(["north", "east", "south", "west"]));
      expect(new Set(row.cells.map((c) => c.roof))).toEqual(new Set(["gable", "hip", "flat"]));
    }
    // The L is flush with the corner; the T is centred.
    expect(FOOTPRINT_L_ROW.cells.every((c) => c.params?.wing.offset === 0)).toBe(true);
    expect(FOOTPRINT_T_ROW.cells.every((c) => (c.params?.wing.offset as number) > 0)).toBe(true);
  });

  it("declares only wings the grammar will actually build", () => {
    for (const row of FOOTPRINT_EXHIBIT_ROWS) {
      for (const cell of row.cells) {
        const wing = cell.params?.wing as BuildingWing;
        const fp = resolveFootprint(cell.size[0], cell.size[2], wing);
        expect(fp.wing, `${cell.id}`).not.toBeNull();
      }
    }
  });

  it("builds every exhibit cell into a real building", () => {
    const jobs = FOOTPRINT_EXHIBIT_ROWS.flatMap((row, r) =>
      row.cells.map((cell, c) => job(cell.id, c * 20, r * 20, 0, cell.params?.wing)),
    );
    const result = run(jobs);
    expect(result.built).toHaveLength(14);
    expect(result.diagnostics).toEqual([]);
    for (const b of result.built) {
      expect(b.blockCount, b.nodePath).toBeGreaterThan(0);
      expect(b.cells.size, b.nodePath).toBeLessThan(BOX[0] * BOX[2]);
    }
  });
});

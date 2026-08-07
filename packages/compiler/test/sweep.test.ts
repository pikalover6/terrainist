/**
 * SweptProfile engine — geometry unit tests.
 *
 * These are deliberately about *geometry*, not about blocks: the whole reason
 * the engine exists is that band membership used to be decided by walking the
 * raster, and the defect that produced (a diagonal avenue whose kerb is a
 * two-block mix rather than one border course) is visible in the column
 * classification long before anything is written into a plan.
 */

import { describe, expect, it } from "vitest";

import type { Region } from "@terrainist/stdlib";

import {
  MAX_TREAD_CUT,
  arcLengths,
  bandOfLane,
  carriagewaySpans,
  featureStations,
  profileSpan,
  projectToLine,
  simplifyPath,
  sweptColumns,
  synthesizeTreads,
  type SweptProfile,
  type Vec2,
} from "../src/structures/sweep.js";

const region: Region = { x0: 0, z0: 0, width: 96, depth: 96 } as Region;

/** A 4-connected raster of the line from `a` to `b` (Bresenham-ish, no diagonals). */
function raster(ax: number, az: number, bx: number, bz: number): Vec2[] {
  const out: Vec2[] = [{ x: ax, z: az }];
  let x = ax;
  let z = az;
  const dx = bx - ax;
  const dz = bz - az;
  const sx = Math.sign(dx);
  const sz = Math.sign(dz);
  let err = 0;
  while (x !== bx || z !== bz) {
    // Step along whichever axis is furthest behind the true line.
    const stepX = x !== bx && (z === bz || Math.abs(err + sz * dx) > Math.abs(err - sx * dz));
    if (stepX) {
      x += sx;
      err -= sx * dz;
    } else {
      z += sz;
      err += sz * dx;
    }
    out.push({ x, z });
  }
  return out;
}

describe("simplifyPath", () => {
  it("collapses a 4-connected diagonal staircase into one segment", () => {
    const line = simplifyPath(raster(10, 10, 40, 40));
    expect(line.length).toBe(2);
    expect(line[0]).toMatchObject({ x: 10, z: 10 });
    expect(line[1]).toMatchObject({ x: 40, z: 40 });
  });

  it("keeps the vertex of a genuine bend", () => {
    const path = [...raster(10, 10, 30, 10), ...raster(31, 10, 40, 30)];
    const line = simplifyPath(path);
    expect(line.length).toBeGreaterThanOrEqual(3);
    // The corner is at (30, 10) give or take the joint cell.
    const corner = line[1] as Vec2;
    expect(Math.abs(corner.x - 30)).toBeLessThanOrEqual(2);
    expect(Math.abs(corner.z - 10)).toBeLessThanOrEqual(2);
  });

  it("is a pure function of its input", () => {
    const path = raster(3, 7, 44, 21);
    expect(simplifyPath(path)).toEqual(simplifyPath(path.slice()));
  });
});

describe("sweptColumns — straight runs are unchanged", () => {
  it("reproduces the old lane lattice on an axis-aligned run", () => {
    const path = raster(10, 20, 40, 20);
    const cols = sweptColumns(region, path, carriagewaySpans(3).lanes);
    for (const c of cols) {
      expect(c.z).toBeGreaterThanOrEqual(19);
      expect(c.z).toBeLessThanOrEqual(21);
      expect(c.outer).toBe(c.z !== 20);
    }
    // Three columns per rank, every rank of the run.
    expect(cols.length).toBe(31 * 3);
  });

  it("biases an even width to the positive side, as the lattice always did", () => {
    const spans = carriagewaySpans(2);
    expect(spans.lanes.lo).toBe(0);
    expect(spans.lanes.hi).toBe(1);
    const cols = sweptColumns(region, raster(10, 20, 20, 20), spans.lanes);
    const zs = new Set(cols.map((c) => c.z));
    expect([...zs].sort((a, b) => a - b)).toEqual([20, 21]);
  });
});

describe("sweptColumns — the diagonal case", () => {
  /**
   * The acceptance criterion, stated as geometry: on a 45° avenue the outer
   * band must be a **connected border course on each side** and the inner band
   * a coherent carriageway — never a column that is kerb on one rank and
   * carriageway on the next.
   */
  for (const [bx, bz] of [
    [40, 40],
    [40, 25],
    [25, 40],
    [40, 15],
  ] as const) {
    it(`gives one clean edge course on the run to (${bx}, ${bz})`, () => {
      const path = raster(10, 10, bx, bz);
      const cols = sweptColumns(region, path, carriagewaySpans(5).lanes);

      // 1. Every column is classified exactly once.
      const idxs = new Set(cols.map((c) => c.idx));
      expect(idxs.size).toBe(cols.length);

      // 2. Each side's outer band is a single 8-connected run — a border
      //    course — rather than a scatter of alternating cells.
      for (const side of [-1, 1]) {
        const edge = cols.filter((c) => Math.sign(c.lane) === side && c.outer);
        expect(edge.length).toBeGreaterThan(5);
        expect(components(edge)).toBe(1);
      }

      // 3. The carriageway between the two kerbs is one connected body.
      const body = cols.filter((c) => !c.outer);
      expect(components(body)).toBe(1);

      // 4. No lane inversion: a column's side never disagrees with the sign of
      //    its true perpendicular offset. This is the dither, stated exactly.
      for (const c of cols) {
        if (c.lane !== 0) expect(Math.sign(c.lane)).toBe(Math.sign(c.offset));
      }
    });
  }

  it("the raster walk it replaces does dither, and this does not", () => {
    // The old construction: per-cell perpendicular of the local heading.
    const path = raster(10, 10, 40, 40);
    const old = new Map<string, Set<boolean>>();
    for (const [i, cell] of path.entries()) {
      const a = path[Math.max(0, i - 1)] as Vec2;
      const b = path[Math.min(path.length - 1, i + 1)] as Vec2;
      const px = Math.sign(b.x - a.x);
      const pz = -Math.sign(b.z - a.z);
      for (const o of [-2, -1, 0, 1, 2]) {
        const key = `${cell.x + pz * o},${cell.z + px * o}`;
        const set = old.get(key) ?? new Set<boolean>();
        set.add(Math.abs(o) === 2);
        old.set(key, set);
      }
    }
    const contested = [...old.values()].filter((s) => s.size > 1).length;
    expect(contested).toBeGreaterThan(0); // the defect, reproduced

    const cols = sweptColumns(region, path, carriagewaySpans(5).lanes);
    const roles = new Map<number, Set<boolean>>();
    for (const c of cols) {
      const set = roles.get(c.idx) ?? new Set<boolean>();
      set.add(c.outer);
      roles.set(c.idx, set);
    }
    expect([...roles.values()].filter((s) => s.size > 1).length).toBe(0);
  });
});

describe("sweptColumns — the bend miter", () => {
  it("fills the wedge once, with the inner band winning the contested column", () => {
    const path = [...raster(10, 30, 30, 30), ...raster(30, 31, 30, 50)];
    const cols = sweptColumns(region, path, carriagewaySpans(5).lanes);

    // Written exactly once each.
    expect(new Set(cols.map((c) => c.idx)).size).toBe(cols.length);
    // The corner region is covered — no notch bitten out of the miter.
    const covered = new Set(cols.map((c) => `${c.x},${c.z}`));
    expect(covered.has("30,30")).toBe(true);
    expect(covered.has("29,31")).toBe(true);
    expect(covered.has("31,29")).toBe(true);
    // And the whole sweep is one body.
    expect(components(cols)).toBe(1);
  });
});

describe("projectToLine", () => {
  it("reports signed offset, distance and arc along the true line", () => {
    const line = simplifyPath(raster(0, 10, 20, 10));
    const arcs = arcLengths(line);
    const left = projectToLine({ x: 5, z: 8 }, line, arcs);
    const right = projectToLine({ x: 5, z: 12 }, line, arcs);
    expect(left.distance).toBeCloseTo(2);
    expect(right.distance).toBeCloseTo(2);
    expect(Math.sign(left.offset)).toBe(-Math.sign(right.offset));
    expect(left.arc).toBeCloseTo(5);
  });
});

describe("synthesizeTreads — the tread law", () => {
  it("solves need[k] = max(g[k] + 1, need[k+1] − 1) backwards", () => {
    const ground = [10, 10, 10, 13, 13];
    const run = synthesizeTreads(ground, { maxFill: 8 });
    expect(run.levels).toEqual([11, 12, 13, 14, 14]);
  });

  it("never leaves a riser taller than the grade cap", () => {
    const ground = [10, 10, 11, 12, 13, 13];
    const run = synthesizeTreads(ground, { maxFill: 8 });
    const levels = run.levels as number[];
    for (let k = 1; k < levels.length; k++) {
      expect(Math.abs((levels[k] as number) - (levels[k - 1] as number))).toBeLessThanOrEqual(1);
    }
  });

  /**
   * The same law, on ground that **falls**.
   *
   * The fixture above rises monotonically, so `|Δ| ≤ 1` is free by construction
   * there: the backward recurrence caps the rise walking forward and nothing
   * else can happen. Nothing capped the *fall*, and the walkability audit found
   * what that costs — every hillside connector severed mid-run by its own
   * five-block riser where it crossed a terrace cut, because
   * `need[k] ≥ ground[k] + 1` forbade the flight from starting down before the
   * edge. This is that terrace, as five numbers.
   */
  it("never leaves a riser taller than the grade cap where the ground FALLS", () => {
    // A four-column upper platform at 114, then a five-block terrace cut.
    const ground = [114, 114, 114, 114, 109, 109, 109, 109, 109];
    const run = synthesizeTreads(ground, { maxFill: 8 });
    const levels = run.levels as number[];
    expect(levels).not.toBeNull();
    for (let k = 1; k < levels.length; k++) {
      expect(Math.abs((levels[k] as number) - (levels[k - 1] as number))).toBeLessThanOrEqual(1);
    }
  });

  /**
   * …and what it costs to say it: the flight is allowed to **cut**, and the
   * recess is bounded.
   *
   * The descent starts back from the edge, inside the upper platform — Kai's
   * first way of earning a drop with run — and the columns it claims below the
   * platform are a `profile` claim like any road's cut, whose carved sides
   * `finishCutFaces` dresses. No interior column is cut deeper than
   * {@link MAX_TREAD_CUT}, and the two end columns are never cut at all: they
   * are the landings the flight is measured against.
   */
  it("earns a terrace drop by recessing into the platform above, bounded", () => {
    const ground = [114, 114, 114, 114, 109, 109, 109, 109, 109];
    const run = synthesizeTreads(ground, { maxFill: 8 });
    const levels = run.levels as number[];
    // The descent begins three columns back from the edge and lands one block
    // of embankment out onto the terrace below: five blocks of terrace, five
    // columns of stair, and not one step taller than a step.
    expect(levels).toEqual([115, 114, 113, 112, 111, 110, 110, 110, 110]);
    for (let k = 0; k < levels.length; k++) {
      const cut = (ground[k] as number) + 1 - (levels[k] as number);
      expect(cut).toBeLessThanOrEqual(k === 0 || k === levels.length - 1 ? 0 : MAX_TREAD_CUT);
    }
    // The recess is the mechanism, so its absence is a regression too.
    expect(Math.max(...levels.map((l, k) => (ground[k] as number) + 1 - l))).toBeGreaterThan(0);
  });

  it("refuses the whole run when the bottom step is out of reach", () => {
    // A ten-block wall in two columns: nothing legal to build.
    const run = synthesizeTreads([10, 20], { maxFill: 20 });
    expect(run.levels).toBeNull();
    expect(run.refusal).toBe("unclimbable");
  });

  it("refuses the whole run rather than exceeding the fill cap", () => {
    const run = synthesizeTreads([...Array<number>(15).fill(10), 20, 20], { maxFill: 4 });
    expect(run.levels).toBeNull();
    expect(run.refusal).toBe("unbuildable");
  });

  it("is flat over flat ground, and one course above it", () => {
    const run = synthesizeTreads([64, 64, 64, 64], { maxFill: 8 });
    expect(run.levels).toEqual([65, 65, 65, 65]);
    expect(run.risers).toEqual([]);
  });
});

describe("profile bands", () => {
  const wall: SweptProfile = {
    id: "test.wall",
    bands: [
      { id: "walk", role: "walkway", width: 3, centred: true, surface: "a" },
      { id: "parapet", role: "parapet", width: 1, surface: "b" },
    ],
    maxGrade: 1,
    follow: "step",
    crossing: "stop",
  };

  it("assigns lanes to bands innermost first", () => {
    expect(bandOfLane(wall, 0)).toBe(0);
    expect(bandOfLane(wall, 1)).toBe(0);
    expect(bandOfLane(wall, -1)).toBe(0);
    expect(bandOfLane(wall, 2)).toBe(1);
    expect(bandOfLane(wall, -2)).toBe(1);
  });

  it("spans the profile symmetrically", () => {
    expect(profileSpan(wall)).toEqual({ lo: -2, hi: 2 });
  });
});

describe("featureStations", () => {
  it("places by arc length, phase-locked to the start of the run", () => {
    const line = simplifyPath(raster(0, 0, 40, 0));
    const stations = featureStations({ id: "tower", pitch: 10, offset: 0 }, line);
    expect(stations.map((s) => Math.round(s.arc))).toEqual([0, 10, 20, 30, 40]);
  });

  it("snaps to vertices with at: 'bend'", () => {
    const path = [...raster(0, 0, 20, 0), ...raster(20, 1, 20, 20)];
    const line = simplifyPath(path);
    const stations = featureStations({ id: "tower", pitch: 8, at: "bend", offset: 0 }, line);
    expect(stations.length).toBe(line.length - 2);
  });
});

/** Number of 8-connected components in a set of columns. */
function components(cols: readonly { x: number; z: number }[]): number {
  const cells = new Set(cols.map((c) => `${c.x},${c.z}`));
  let n = 0;
  while (cells.size > 0) {
    n++;
    const start = cells.values().next().value as string;
    const queue = [start];
    cells.delete(start);
    while (queue.length > 0) {
      const key = queue.pop() as string;
      const parts = key.split(",");
      const x = Number(parts[0]);
      const z = Number(parts[1]);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = `${x + dx},${z + dz}`;
          if (cells.delete(k)) queue.push(k);
        }
      }
    }
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* the first client, end to end                                               */
/* -------------------------------------------------------------------------- */

/**
 * A real compile through the retrofitted road pass.
 *
 * The geometry above is the claim; this is the guard that the claim reached
 * production. `c1-harbourtown` is the road-bearing example that actually has
 * diagonal avenues — a city with `diagonals` in its armature — so it exercises
 * the case the engine was written for rather than a grid of axis-aligned
 * streets that would have looked the same either way.
 */
describe("road surfacing through the sweep engine", () => {
  it(
    "compiles c1-harbourtown with roads, no errors, and deterministically",
    async () => {
      const { readFile, mkdtemp, rm } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const nodePath = (await import("node:path")).default;
      const { fileURLToPath } = await import("node:url");
      const { compileTerrain } = await import("../src/terrain/compile.js");

      const example = fileURLToPath(
        new URL("../../../examples/c1-harbourtown.loam.json", import.meta.url),
      );
      const doc: unknown = JSON.parse(await readFile(example, "utf8"));

      const roots: string[] = [];
      const run = async (label: string) => {
        const root = await mkdtemp(nodePath.join(tmpdir(), `terrainist-sweep-${label}-`));
        roots.push(root);
        const result = await compileTerrain(doc, { outDir: nodePath.join(root, "world") });
        expect(result.ok).toBe(true);
        return result;
      };

      try {
        const first = await run("a");
        const errors = first.report.diagnostics.filter((d) => d.severity === "error");
        expect(errors.map((d) => `${d.code} ${d.message}`)).toEqual([]);
        // The pass ran and surfaced something: a city with no road columns
        // would pass every geometric assertion above and still be a regression.
        const surfaced = (first.report.stats.structures?.streetColumns ?? 0) +
          (first.report.stats.structures?.roadColumns ?? 0);
        expect(surfaced).toBeGreaterThan(0);

        const second = await run("b");
        expect(second.report.stats.structures?.streetColumns).toBe(
          first.report.stats.structures?.streetColumns,
        );
        expect(second.report.stats.structures?.roadColumns).toBe(
          first.report.stats.structures?.roadColumns,
        );
      } finally {
        await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })));
      }
    },
    600_000,
  );
});

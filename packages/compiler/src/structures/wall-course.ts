/**
 * `infra.wall@0`, part one — **where the wall goes**.
 *
 * The course is compiler-derived and there is no authoring surface for it, for
 * the reason the whole layout half of this compiler exists: an author who could
 * write a ring would write it in absolute coordinates, against ground they have
 * never seen, and it would miss. What an author says is `"walls": {}`; what
 * decides the line is *the settlement that actually got built*.
 *
 * ## The derivation, in four steps
 *
 * 1. **Extent.** Collect the columns the settlement claimed — building
 *    footprints, lot ground, street and arterial carriageway, the plaza. That
 *    set is the thing being enclosed.
 * 2. **Support hull.** For each of the twenty-four directions `k · 15°`,
 *    take the largest projection of the extent onto that direction and push it
 *    out by the margin. The course is the intersection of those twenty-four
 *    half-planes.
 * 3. **Vertices.** Consecutive half-planes meet at a point; a half-plane whose
 *    two neighbours already meet *inside* it carries no vertex and is dropped.
 *    What is left is a convex polygon whose every edge runs at a multiple of
 *    15°, which is the project's segment convention, and whose corners are the
 *    tower sites.
 * 4. **Rasterization.** The closed polygon becomes a 4-connected ring of world
 *    columns — the same shape `StreetSegment["path"]` has, which is what the
 *    sweep engine takes.
 *
 * ### Why a support hull rather than a convex hull with an offset
 *
 * Offsetting a convex hull outward is a miter problem: every vertex becomes an
 * arc, and quantizing the result afterwards moves the line by an amount that
 * depends on the angle it happened to have. The support form does both at once
 * and exactly — `h_k = max ⟨p, n_k⟩ + margin` is the offset, and restricting
 * `k` to the twenty-four directions is the quantization. The polygon it
 * produces contains every extent column by construction (each is inside every
 * half-plane), so a wall derived this way can never cut a building in half.
 *
 * It is also *stable*: add one more shed at the edge of town and at most one
 * `h_k` moves, so the rest of the ring — and every tower on it — stays exactly
 * where it was. A recomputed convex hull would rotate every edge.
 *
 * Everything here is integer or exact-rational arithmetic over a fixed
 * iteration order. No RNG, no clock, no dependence on the plan.
 */

/** A world column. */
export interface CoursePoint {
  readonly x: number;
  readonly z: number;
}

/**
 * Directions the course is quantized to: 24 of them, one every 15°.
 *
 * Fifteen degrees is the project's segment convention (it is what the arterial
 * armature and the tunnel junctions quantize to), and 360 divides by it evenly,
 * which matters here because the half-plane set has to close.
 */
export const COURSE_QUANTUM_DEGREES = 15;

/** Number of half-planes — `360 / COURSE_QUANTUM_DEGREES`. */
export const COURSE_DIRECTIONS = 360 / COURSE_QUANTUM_DEGREES;

/** Smallest polygon, in columns across, worth calling a circumvallation. */
export const WALL_MIN_SPAN = 24;

/** One outward normal of the support hull. */
interface Direction {
  readonly nx: number;
  readonly nz: number;
}

/**
 * The twenty-four outward normals, computed once.
 *
 * `Math.cos`/`Math.sin` are transcendental, which the determinism rule bans in
 * anything seeded — but this is a compile-time constant table with no seed and
 * no input, identical on every run of every build, so it is a constant that
 * happens to be spelled as arithmetic. Rounding it to a fixed number of places
 * keeps it identical across engines that disagree in the last bit.
 */
export const COURSE_NORMALS: readonly Direction[] = Object.freeze(
  Array.from({ length: COURSE_DIRECTIONS }, (_, k): Direction => {
    const theta = (2 * Math.PI * k) / COURSE_DIRECTIONS;
    return { nx: round6(Math.cos(theta)), nz: round6(Math.sin(theta)) };
  }),
);

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/** A derived wall course. */
export interface WallCourse {
  /** The polygon's corners, counter-clockwise in `(x, z)`, first ≠ last. */
  readonly vertices: readonly CoursePoint[];
  /** The closed 4-connected ring of columns, walk order, first ≠ last. */
  readonly path: readonly CoursePoint[];
  /**
   * Index into {@link path} of each vertex, so a caller can ask for "a tower at
   * every corner" without re-deriving which columns the corners landed on.
   */
  readonly cornerIndices: readonly number[];
  /** Enclosed area, in columns — the sanity number the caller reports. */
  readonly area: number;
}

/** Everything {@link deriveWallCourse} reads. */
export interface WallCourseInput {
  /** The settlement's claimed columns. Order is irrelevant; the result is not. */
  readonly extent: readonly CoursePoint[];
  /** Columns the course stands outward of the extent. */
  readonly margin: number;
  /** Clamp: the course is trimmed to this region, exclusive of its last column. */
  readonly bounds: {
    readonly x0: number;
    readonly z0: number;
    readonly width: number;
    readonly depth: number;
  };
}

/**
 * Derive the ring, or `undefined` when there is nothing worth ringing.
 *
 * Fails — deliberately, and without a fallback — when the extent is empty, when
 * the hull is thinner than {@link WALL_MIN_SPAN} on either axis, or when the
 * offset course does not fit inside `bounds`. A wall clipped by the region edge
 * is not a circumvallation, it is a fence with two loose ends, and the honest
 * answer is a note rather than half a ring.
 */
export function deriveWallCourse(input: WallCourseInput): WallCourse | undefined {
  if (input.extent.length === 0) return undefined;

  // --- step 2: the support hull --------------------------------------------
  const support = new Float64Array(COURSE_DIRECTIONS);
  support.fill(Number.NEGATIVE_INFINITY);
  for (const p of input.extent) {
    for (let k = 0; k < COURSE_DIRECTIONS; k++) {
      const n = COURSE_NORMALS[k] as Direction;
      const h = n.nx * p.x + n.nz * p.z;
      if (h > (support[k] as number)) support[k] = h;
    }
  }
  for (let k = 0; k < COURSE_DIRECTIONS; k++) {
    support[k] = (support[k] as number) + input.margin;
  }

  // --- step 3: the vertices ------------------------------------------------
  // Consecutive half-planes k and k+1 meet at one point (their normals are 15°
  // apart, so they are never parallel). A vertex strictly outside some *third*
  // half-plane is not on the boundary: that direction's constraint cuts the
  // corner off, and the edge between k and k+1 has been eaten whole.
  const raw: CoursePoint[] = [];
  for (let k = 0; k < COURSE_DIRECTIONS; k++) {
    const a = COURSE_NORMALS[k] as Direction;
    const b = COURSE_NORMALS[(k + 1) % COURSE_DIRECTIONS] as Direction;
    const ha = support[k] as number;
    const hb = support[(k + 1) % COURSE_DIRECTIONS] as number;
    const det = a.nx * b.nz - a.nz * b.nx;
    if (Math.abs(det) < 1e-9) continue;
    const x = (ha * b.nz - hb * a.nz) / det;
    const z = (a.nx * hb - b.nx * ha) / det;
    let cut = false;
    for (let j = 0; j < COURSE_DIRECTIONS; j++) {
      if (j === k || j === (k + 1) % COURSE_DIRECTIONS) continue;
      const n = COURSE_NORMALS[j] as Direction;
      // A tolerance of a tenth of a column: the corner of a quantized hull sits
      // on three half-planes often enough that an exact test drops real
      // vertices to floating-point noise.
      if (n.nx * x + n.nz * z > (support[j] as number) + 0.1) {
        cut = true;
        break;
      }
    }
    if (!cut) raw.push({ x: Math.round(x), z: Math.round(z) });
  }

  const vertices = dedupe(raw);
  if (vertices.length < 3) return undefined;

  // --- fit ------------------------------------------------------------------
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  if (maxX - minX < WALL_MIN_SPAN || maxZ - minZ < WALL_MIN_SPAN) return undefined;
  const { x0, z0, width, depth } = input.bounds;
  if (minX < x0 || minZ < z0 || maxX >= x0 + width || maxZ >= z0 + depth) return undefined;

  // --- step 4: rasterize ----------------------------------------------------
  const path: CoursePoint[] = [];
  const cornerIndices: number[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i] as CoursePoint;
    const b = vertices[(i + 1) % vertices.length] as CoursePoint;
    cornerIndices.push(path.length);
    for (const c of walkEdge(a, b)) {
      // `walkEdge` yields `a` and every column up to but not including `b`, so
      // the ring closes exactly once and the seam is not a doubled column.
      const last = path[path.length - 1];
      if (last !== undefined && last.x === c.x && last.z === c.z) continue;
      path.push(c);
    }
  }
  if (path.length < 8) return undefined;

  return { vertices, path, cornerIndices, area: polygonArea(vertices) };
}

/** Drop repeated and collinear-duplicate corners, keeping declaration order. */
function dedupe(points: readonly CoursePoint[]): CoursePoint[] {
  const out: CoursePoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last !== undefined && last.x === p.x && last.z === p.z) continue;
    out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first !== undefined && last !== undefined && first.x === last.x && first.z === last.z) {
    out.pop();
  }
  return out;
}

/**
 * The 4-connected columns from `a` up to but not including `b`.
 *
 * 4-connected rather than 8-: a wall that stepped diagonally would leave a
 * corner-to-corner gap a player can walk through, which is the one thing a wall
 * may not have. Bresenham with both the major and the minor step emitted
 * separately gives a run with no diagonal joins.
 */
export function walkEdge(a: CoursePoint, b: CoursePoint): CoursePoint[] {
  const out: CoursePoint[] = [];
  let x = a.x;
  let z = a.z;
  const dx = Math.abs(b.x - a.x);
  const dz = Math.abs(b.z - a.z);
  const sx = b.x > a.x ? 1 : -1;
  const sz = b.z > a.z ? 1 : -1;
  let err = dx - dz;
  for (;;) {
    out.push({ x, z });
    if (x === b.x && z === b.z) break;
    const e2 = 2 * err;
    // One axis per iteration, majority axis first: this is what makes the run
    // 4-connected. A combined step would emit a diagonal.
    if (e2 > -dz && x !== b.x) {
      err -= dz;
      x += sx;
    } else if (z !== b.z) {
      err += dx;
      z += sz;
    } else {
      err -= dz;
      x += sx;
    }
  }
  out.pop();
  return out;
}

/** Shoelace area of a simple polygon, in columns. */
export function polygonArea(vertices: readonly CoursePoint[]): number {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i] as CoursePoint;
    const b = vertices[(i + 1) % vertices.length] as CoursePoint;
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

/* -------------------------------------------------------------------------- */
/* gates                                                                       */
/* -------------------------------------------------------------------------- */

/** A run of the course a road crosses. */
export interface WallGate {
  /** First index of {@link WallCourse.path} the gate opening covers. */
  readonly from: number;
  /** Last index, inclusive. */
  readonly to: number;
  /** Columns the opening is wide — the road's own width plus its jambs. */
  readonly width: number;
  /** The path index the gatehouse is centred on. */
  readonly centre: number;
}

/**
 * Find the openings: every maximal run of course columns a road claims.
 *
 * The rule is the road's, not the wall's. A gate exists **because** a
 * carriageway is there, so its width is measured off the crossing rather than
 * declared: the run of road columns, widened by one jamb either side so the
 * gatehouse piers stand clear of the traffic. Nothing is written in the
 * carriageway itself — the road passes through the wall, the wall does not
 * pass through the road.
 *
 * Runs are found on the *closed* ring, so a crossing that straddles the path's
 * start index is one gate rather than two half ones.
 */
export function findGates(
  path: readonly CoursePoint[],
  onRoad: (x: number, z: number) => boolean,
  jamb = 1,
): WallGate[] {
  const n = path.length;
  const hit = new Uint8Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const c = path[i] as CoursePoint;
    if (onRoad(c.x, c.z)) {
      hit[i] = 1;
      any = true;
    }
  }
  if (!any) return [];
  // Every column is a road column: the "wall" is entirely inside a carriageway,
  // which is a derivation failure rather than one enormous gate.
  if (hit.every((v) => v === 1)) return [];

  // Rotate to a start that is not itself a crossing, so a run never wraps.
  let start = 0;
  while (hit[start] === 1) start++;

  const gates: WallGate[] = [];
  let i = 0;
  while (i < n) {
    const at = (start + i) % n;
    if (hit[at] !== 1) {
      i++;
      continue;
    }
    let len = 0;
    while (len < n && hit[(start + i + len) % n] === 1) len++;
    const from = (start + i - jamb + n) % n;
    const to = (start + i + len - 1 + jamb) % n;
    const centre = (start + i + ((len - 1) >> 1)) % n;
    gates.push({ from, to, width: len + 2 * jamb, centre });
    i += len;
  }
  return gates;
}

/**
 * Membership test for an opening, wrap-aware.
 *
 * `from` may be numerically greater than `to` when the run crosses the path's
 * start, which is why this is a function rather than a comparison at the call
 * site — the version written inline got it wrong twice.
 */
export function inGate(gate: WallGate, index: number, length: number): boolean {
  if (gate.from <= gate.to) return index >= gate.from && index <= gate.to;
  return index >= gate.from || index <= gate.to || index >= length;
}

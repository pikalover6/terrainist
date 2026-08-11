/**
 * `fungal` — stem and cap (FLORA-GRAMMAR-v0 §3.11, WP-C).
 *
 * The program the fungal tier is made of, and the one that has to prove the
 * grammar is a *grammar* rather than a tree generator with a re-skin: a giant
 * mushroom shares no construction with `blob` or `giant`. There is no trunk
 * that thins, no limb, no leaf mass and no BFS — there is a stalk and a shell.
 *
 * Three things carry the read, and all three are in the geometry rather than in
 * the block table:
 *
 * - **The cap is a one-block shell, not a solid.** A solid dome is a red hill;
 *   a shell has an underside, and the underside is where a player standing in a
 *   grove actually looks.
 * - **The shell descends from an apex over the stalk.** The dome's top block
 *   sits directly above the last stem block (which is law 1 read as the wood
 *   family — a bare stalk poking through its own cap is the mega-spruce mast
 *   wearing a different block), and every column outward is one block lower
 *   than the last, filled down to its neighbour so the surface never breaks.
 * - **The rim drops one more course.** That lip is what a mushroom has and a
 *   parasol does not, and it is the silhouette at 60 blocks.
 *
 * The emitter does the rest: §3.2's six mushroom booleans turn this block set
 * into cap texture on every outward face and pore texture inward, computed from
 * the plant's own blocks and nothing else.
 *
 * **Allometry** (the discipline `programs.ts` gained on 2026-08-10): a mushroom
 * grown past its species envelope grows its cap too, at the same half-power the
 * crowns take — a mushroom twice its table height is a *taller* mushroom, not a
 * flying saucer. Inside the envelope {@link overgrowth} is exactly 1 and every
 * line below is the arithmetic §3.11 wrote.
 */

import {
  knob,
  overgrowth,
  type FloraBlock,
  type FloraProgram,
  type FloraSpeciesDef,
  type FloraVariation,
} from "./types.js";

/**
 * The widest cap the grammar allows (§3.11's parameter range).
 *
 * §3.11 also states an "every cap within 5 of a stem" property as the *reason*
 * for this bound, and the two do not agree: a shelf of radius 6 has rim columns
 * 6 (and, with the lip, 7) from the stalk. The **bound** is what is implemented
 * and tested, because it is the clause that has a number in it; no shipped
 * species goes past 5 anyway, so the discrepancy is inert. Reported as an
 * ambiguity rather than resolved by improvisation.
 */
export const MAX_CAP_RADIUS = 6;

/** How far below the apex the rim lip hangs. One course, and always one. */
const LIP = 1;

interface Build {
  readonly out: FloraBlock[];
  readonly at: Set<string>;
}

function key(dx: number, dy: number, dz: number): string {
  return `${dx},${dy},${dz}`;
}

function put(b: Build, block: FloraBlock): void {
  const k = key(block.dx, block.dy, block.dz);
  if (b.at.has(k)) return;
  b.at.add(k);
  b.out.push(block);
}

/** The cap radius of a plant, allometry included. Shared by both entry points. */
function capRadius(v: FloraVariation, def: FloraSpeciesDef): number {
  const grown = overgrowth(v, def);
  const base = knob(def, "capRadius", 4);
  return Math.max(
    2,
    Math.min(
      MAX_CAP_RADIUS,
      Math.round(base * grown ** knob(def, "capGrowth", 0.5)) + v.radiusDelta,
    ),
  );
}

/** The stalk's footprint: `stemSpan²` columns at the origin corner. */
function stemColumns(def: FloraSpeciesDef): readonly (readonly [number, number])[] {
  const s = Math.max(1, Math.min(2, Math.round(knob(def, "stemSpan", 1))));
  const out: [number, number][] = [];
  for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) out.push([i, j]);
  return out;
}

/** True for a position the stalk already owns. */
function isStem(
  cols: readonly (readonly [number, number])[],
  dx: number,
  dz: number,
  dy: number,
  height: number,
): boolean {
  if (dy < 0 || dy >= height) return false;
  for (const [i, j] of cols) if (i === dx && j === dz) return true;
  return false;
}

/**
 * The depth of the cap surface below its apex, per column.
 *
 * `dome` is an ellipsoid quadrant — 0 at the centre, `rise` at the rim — and
 * `shelf` is flat, which is the whole difference between a landmark toadstool
 * and a bracket fungus. `undefined` means the column is outside the cap.
 */
function capDepth(
  dx: number,
  dz: number,
  radius: number,
  rise: number,
  dome: boolean,
): number | undefined {
  const r2 = dx * dx + dz * dz;
  if (r2 > radius * radius) return undefined;
  if (!dome) return 0;
  const t = Math.sqrt(Math.max(0, 1 - r2 / (radius * radius)));
  return Math.round(rise * (1 - t));
}

/**
 * Stem and cap.
 *
 * The `canopyRadius` contract is the same one every program is held to — no
 * emitted block lies outside it horizontally — and for a mushroom that is the
 * cap radius outright, because nothing but the cap reaches past the stalk.
 */
export const fungal: FloraProgram = {
  id: "fungal",
  canopyRadius(v, def) {
    return capRadius(v, def);
  },
  blocks(v, def, rng) {
    const b: Build = { out: [], at: new Set<string>() };
    const height = Math.max(3, v.height);
    const cols = stemColumns(def);
    for (let dy = 0; dy < height; dy++) {
      for (const [i, j] of cols) put(b, { dx: i, dy, dz: j, part: "stem" });
    }

    const R = capRadius(v, def);
    const dome = (def.knobs?.["capKind"] ?? "dome") !== "shelf";
    // The dome's rise, in blocks. Bounded below by 1 so a `dome` never
    // degenerates into the `shelf` it is supposed to be distinguishable from.
    const rise = dome ? Math.max(1, Math.round(R * knob(def, "capRise", 0.6))) : 0;

    // The surface, as a height map: `height - depth`, apex first.
    const surface = new Map<string, number>();
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = capDepth(dx, dz, R, rise, dome);
        if (d === undefined) continue;
        surface.set(`${dx},${dz}`, height - d);
      }
    }

    // Emitting the surface as a height map alone leaves a hole wherever two
    // neighbouring columns differ by more than a block — the shell would be a
    // set of concentric rings with sky between them, which is law 6 broken and
    // a mushroom you can see the inside of. So every column is filled *down to*
    // its lowest 4-neighbour, and a column with a neighbour outside the cap
    // (the rim) drops one course further: that is the lip.
    /** The lowest cap block each column ended up carrying. */
    const lowestCap = new Map<string, number>();
    for (const [k, y] of surface) {
      const [dx, dz] = k.split(",").map(Number) as [number, number];
      let lo = y;
      for (const [ox, oz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = surface.get(`${dx + ox},${dz + oz}`);
        lo = Math.min(lo, n ?? y - LIP);
      }
      for (let dy = lo; dy <= y; dy++) put(b, { dx, dy, dz, part: "cap" });
      // A stem column may already own the lower courses, so the lowest *cap*
      // block of a column is not always `lo`.
      for (let dy = lo; dy <= y; dy++) {
        if (b.at.has(key(dx, dy, dz)) && !isStem(cols, dx, dz, dy, height)) {
          lowestCap.set(`${dx},${dz}`, dy);
          break;
        }
      }
    }

    // The underside, in emission order over the surface map — which is itself a
    // fixed positional order, so the draws are reproducible (law 5).
    const hangingShare = knob(def, "hangingShare", 0.35);
    const decoShare = knob(def, "decoShare", 0.08);
    for (const [k] of surface) {
      const [dx, dz] = k.split(",").map(Number) as [number, number];
      // The lowest cap block this column actually carries: the anchor for
      // anything that hangs, and the block a glow deco is set under.
      const low = lowestCap.get(k);
      if (low === undefined) continue;
      const edge =
        surface.get(`${dx + 1},${dz}`) === undefined ||
        surface.get(`${dx - 1},${dz}`) === undefined ||
        surface.get(`${dx},${dz + 1}`) === undefined ||
        surface.get(`${dx},${dz - 1}`) === undefined;
      if (def.hangingSymbol !== undefined && edge && rng() < hangingShare) {
        // Short strands off the rim only: a curtain from the whole underside
        // closes the space under the cap, which is the space the grove is for.
        const n = 1 + Math.floor(rng() * 3);
        for (let step = 1; step <= n; step++) {
          const dy = low - step;
          if (dy <= 1) break;
          if (b.at.has(key(dx, dy, dz))) break;
          put(b, { dx, dy, dz, part: "hanging" });
        }
      }
      if (def.decoSymbol !== undefined && !edge && rng() < decoShare) {
        // A glow block set into the underside of the cap: 6-adjacent to the cap
        // above it by construction, never a lamp hanging in air (§4.2 — these
        // are full cubes *and* light sources, so the attachment is structural).
        const dy = low - 1;
        if (dy > 1 && !b.at.has(key(dx, dy, dz))) put(b, { dx, dy, dz, part: "deco" });
      }
    }

    return b.out;
  },
};

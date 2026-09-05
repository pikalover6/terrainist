import {
  HIGHRISE_MIN_WIDTH,
  isHighriseArchetype,
  nodeSeed,
  planTerrace,
  positionFloat,
  positionInt,
  streamSeed,
  terraceMinDepth,
  type Seed256,
  type TerraceBay,
} from "@terrainist/stdlib";
import type { DistrictDensity, DistrictParams, HorizontalFace, PortDeclaration } from "@terrainist/spec/ir";
import { splitIndexNearest, type CourtyardPassage } from "./courtyards.js";
import type { Lot } from "./district-lots.js";
import { FLOOR_HEIGHT, LOT_SIDE_GAP, INFILL_FLOORS, MAX_INFILL_DEPTH } from "./district-constants.js";
import { TERRACE_MIN_FRONTAGE } from "@terrainist/stdlib";
import { pickArchetype } from "./district-infill.js";
import type { Rect } from "./frames.js";
import { frontageOf } from "./district-landmarks.js";
/**
 * Longest terrace, in columns of frontage, per density.
 */
export const TERRACE_MAX_FRONTAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 46,
  medium: 27,
  low: 0,
});

/**
 * Columns left between two terraces cut from the same block face.
 *
 * Three, and deliberately readable as something rather than as a mistake: at
 * three columns with buildings four or more storeys either side it is a
 * pedestrian passage / light well, which is exactly what a gap in a real street
 * wall is. One column would be a crack and seven would be a missing building.
 */
export const TERRACE_PASSAGE = 3;

/** Fewest lots a terrace is cut from; one lot on its own is just a building. */
export const TERRACE_MIN_LOTS = 2;

/**
 * Share of terraces the fabric actually builds, per density.
 *
 * High density is a continuous street wall by definition. At medium the run
 * that was *not* built is what makes the next one read as a terrace rather than
 * as the whole block — and the lots it gives back are not wasted: they fall
 * through to the ordinary per-lot infill, with its own coverage draw and its
 * own side gaps, which is a detached house between two rows.
 */
export const TERRACE_COVERAGE: Readonly<Record<DistrictDensity, number>> = Object.freeze({
  high: 1,
  medium: 0.72,
  low: 0,
});

/** One terrace, ready to be pushed onto the built list. */
export interface Terrace {
  readonly lots: readonly Lot[];
  readonly bays: number;
  readonly built: import("./district-landmarks.js").BuiltLot;
}

interface TerraceSkeleton {
  readonly bays: readonly { readonly wall0: number; readonly wall1: number; readonly x0: number; readonly x1: number; readonly doorX: number }[];
}

function terracePorts(
  plan: TerraceSkeleton,
  sx: number,
): Readonly<Record<string, PortDeclaration>> {
  const span = Math.max(1, sx - 1);
  const out: Record<string, PortDeclaration> = {};
  for (const [i, bay] of plan.bays.entries()) {
    const u = Math.min(1, (bay.doorX + 0.5) / span);
    out[i === 0 ? "door" : `door_${i}`] = {
      type: "door",
      face: "south",
      at: [u, 0],
      ...(i === 0 ? { tags: ["primary"] } : {}),
    };
  }
  return out;
}

function unionRect(rects: readonly Rect[]): Rect {
  let out = rects[0] as Rect;
  for (const r of rects.slice(1)) {
    out = {
      x0: Math.min(out.x0, r.x0),
      z0: Math.min(out.z0, r.z0),
      x1: Math.max(out.x1, r.x1),
      z1: Math.max(out.z1, r.z1),
    };
  }
  return out;
}



/**
 * Group the unclaimed lots into terraces — the continuous street wall.
 *
 * Pure narrow stage: receives lots/claimed/preferAt, returns terraces and
 * passages without mutating a shared out-parameter. Caller threads `claimed`
 * and `built` ownership explicitly.
 */
function terraceRunsInternal(
  lots: readonly Lot[],
  claimed: ReadonlySet<string>,
  params: DistrictParams,
  nodePath: string,
  worldSeed: bigint,
  districtSeed: Seed256,
  preferAt: ReadonlyMap<string, number>,
  storeyCeiling: number | undefined,
): { readonly terraces: readonly Terrace[]; readonly passages: readonly CourtyardPassage[] } {
  const density = params.density;
  const maxFrontage = TERRACE_MAX_FRONTAGE[density];
  if (maxFrontage <= 0) return { terraces: [], passages: [] };
  const coverage = TERRACE_COVERAGE[density];
  const stream = streamSeed(districtSeed, "repeat");
  const passages: CourtyardPassage[] = [];

  const faces = new Map<string, Lot[]>();
  for (const lot of lots) {
    if (claimed.has(lot.id)) continue;
    const key = `${lot.block}:${lot.side}`;
    const group = faces.get(key);
    if (group === undefined) faces.set(key, [lot]);
    else group.push(lot);
  }

  const out: Terrace[] = [];
  for (const group of faces.values()) {
    const strip = [...group].sort((a, b) => a.order - b.order);
    let run: Lot[] = [];
    const flush = (): void => {
      if (run.length >= TERRACE_MIN_LOTS) out.push(...cutRun(run));
      run = [];
    };
    for (const lot of strip) {
      const last = run[run.length - 1];
      if (last !== undefined && lot.order !== last.order + 1) flush();
      run.push(lot);
    }
    flush();
  }
  return { terraces: out, passages };

  function cutRun(run: readonly Lot[]): Terrace[] {
    const first = run[0] as Lot;
    const along = first.side === "north" || first.side === "south";
    const width = (lot: Lot): number =>
      along ? lot.rect.x1 - lot.rect.x0 + 1 : lot.rect.z1 - lot.rect.z0 + 1;

    const byFrontage = (part: readonly Lot[]): Lot[][] => {
      const out: Lot[][] = [];
      let chunk: Lot[] = [];
      let span = 0;
      for (const lot of part) {
        const w = width(lot);
        if (chunk.length > 0 && span + w > maxFrontage) {
          out.push(chunk);
          chunk = [];
          span = 0;
        }
        chunk.push(lot);
        span += w;
      }
      if (chunk.length > 0) out.push(chunk);
      return out;
    };

    const prefer = preferAt.get(`${first.block}:${first.side}`);
    const starts = run.map((lot) => (along ? lot.rect.x0 : lot.rect.z0));
    const at =
      prefer === undefined ? null : splitIndexNearest(starts, prefer, TERRACE_MIN_LOTS);

    const chunks: Lot[][] =
      at === null
        ? byFrontage(run)
        : [...byFrontage(run.slice(0, at)), ...byFrontage(run.slice(at))];
    const asked = at === null ? -1 : byFrontage(run.slice(0, at)).length;

    const made: Terrace[] = [];
    let before: Terrace | null = null;
    for (const [i, part] of chunks.entries()) {
      const terrace =
        part.length < TERRACE_MIN_LOTS ? null : makeTerrace(part, along, i > 0);
      if (terrace === null) {
        before = null;
        continue;
      }
      if (i === asked && before !== null) {
        const whole = unionRect(part.map((l) => l.rect));
        passages.push({
          block: first.block,
          face: first.side,
          rect: along
            ? { ...whole, x1: whole.x0 + TERRACE_PASSAGE - 1 }
            : { ...whole, z1: whole.z0 + TERRACE_PASSAGE - 1 },
        });
      }
      before = terrace;
      made.push(terrace);
    }
    return made;
  }

  function makeTerrace(chunk: readonly Lot[], along: boolean, passage: boolean): Terrace | null {
    const face = (chunk[0] as Lot).face;
    const whole = unionRect(chunk.map((l) => l.rect));
    const rect: Rect = !passage
      ? whole
      : along
        ? { ...whole, x0: whole.x0 + TERRACE_PASSAGE }
        : { ...whole, z0: whole.z0 + TERRACE_PASSAGE };

    const gap = LOT_SIDE_GAP[density] as number;
    const frontage = (along ? rect.x1 - rect.x0 : rect.z1 - rect.z0) + 1;
    const depth = (along ? rect.z1 - rect.z0 : rect.x1 - rect.x0) + 1;
    const across = frontage - 2 * gap;
    const back = Math.min(depth - gap, MAX_INFILL_DEPTH);
    if (across < TERRACE_MIN_FRONTAGE || back < terraceMinDepth(FLOOR_HEIGHT)) return null;

    const id = `terrace_${rect.x0}_${rect.z0}`;
    const path = `${nodePath}.${id}`;
    const seed = nodeSeed(worldSeed, path, "");
    const closes = chunk[0]?.courtyard === true;
    if (!closes && coverage < 1 && positionFloat(stream, rect.x0, 2, rect.z0) >= coverage) {
      return null;
    }

    const skeleton = planTerrace({
      sx: across,
      storeyHeight: FLOOR_HEIGHT,
      floors: 1,
      stream: streamSeed(seed, "terrace"),
      ...(chunk[0]?.corner === true ? { cornerStart: true } : {}),
      ...(chunk[chunk.length - 1]?.corner === true ? { cornerEnd: true } : {}),
    });
    if (skeleton.bays.length === 0) return null;

    const [rangeLo, rangeHi] = INFILL_FLOORS[density];
    const hi = storeyCeiling === undefined ? rangeHi : Math.max(1, Math.min(rangeHi, storeyCeiling));
    const lo = Math.min(rangeLo, hi);
    const startCol = along ? rect.x0 : rect.z0;
    const otherCol = along ? rect.z0 : rect.x0;
    const base = positionInt(stream, startCol, 3, otherCol, lo, hi);
    const bays: TerraceBay[] = skeleton.bays.map((bay) => {
      const col = startCol + bay.wall0;
      const interior = bay.x1 - bay.x0 + 1;
      const floors = Math.min(hi, Math.max(lo, base + positionInt(stream, col, 4, otherCol, -1, 2)));
      const archetype = pickArchetype(params.mix, interior, stream, col, otherCol);
      return {
        width: bay.wall1 - bay.wall0,
        floors,
        ...(archetype === null ? {} : { archetype }),
      };
    });

    const tallest = bays.reduce((m, b) => Math.max(m, b.floors), 1);
    const height = tallest * FLOOR_HEIGHT + 12;

    return {
      lots: chunk,
      bays: bays.length,
      built: {
        nodePath: path,
        id,
        rect,
        face,
        size: [across, height, back],
        ports: terracePorts(skeleton, across),
        params: {
          archetype: "terrace",
          face,
          bays,
          floorHeight: FLOOR_HEIGHT,
          ...(chunk[0]?.corner === true ? { cornerStart: true } : {}),
          ...(chunk[chunk.length - 1]?.corner === true ? { cornerEnd: true } : {}),
        },
        tags: ["district", "terrace", "street_wall"],
        seed,
        frontPort: "door",
        ...frontageOf(rect, face, chunk),
      },
    };
  }
}

/**
 * Terrace planning stage — narrow input/result, explicit ownership, no mutable
 * out-parameter for passages.
 */
export interface TerraceStageInput {
  readonly lots: readonly Lot[];
  readonly claimed: ReadonlySet<string>;
  readonly params: DistrictParams;
  readonly nodePath: string;
  readonly worldSeed: bigint;
  readonly districtSeed: Seed256;
  readonly preferAt: ReadonlyMap<string, number>;
  readonly storeyCeiling: number | undefined;
}

export interface TerraceStageResult {
  readonly terraces: readonly Terrace[];
  readonly passages: readonly CourtyardPassage[];
  readonly claimed: Set<string>;
  readonly built: import("./district-landmarks.js").BuiltLot[];
}

export function planTerraces(
  input: TerraceStageInput & { readonly built: readonly import("./district-landmarks.js").BuiltLot[] },
): TerraceStageResult {
  const { lots, claimed, params, nodePath, worldSeed, districtSeed, preferAt, storeyCeiling, built } = input;
  const { terraces, passages } = terraceRunsInternal(lots, claimed, params, nodePath, worldSeed, districtSeed, preferAt, storeyCeiling);
  const nextClaimed = new Set<string>(claimed);
  const nextBuilt = [...built];
  for (const t of terraces) {
    for (const lot of t.lots) nextClaimed.add(lot.id);
    nextBuilt.push(t.built);
  }
  return { terraces, passages, claimed: nextClaimed, built: nextBuilt };
}

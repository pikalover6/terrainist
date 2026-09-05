import {
  nodeSeed,
  type Seed256,
} from "@terrainist/stdlib";
import type {
  DistrictNode,
  HorizontalFace,
  LoamDiagnostic,
  PortDeclaration,
  StructureNode,
  Yaw,
} from "@terrainist/spec/ir";
import { warning } from "@terrainist/spec";
import { FLOOR_HEIGHT } from "./district-constants.js";
import type { Rect, Point2 } from "./frames.js";
import { frontFace, rotatedSize } from "./ports.js";
import type { Lot, BlockSite } from "./district-lots.js";
import type { Block } from "./district-blocks.js";
/** A district child, ready to claim a lot. */
export interface Landmark {
  readonly id: string;
  readonly nodePath: string;
  readonly size: readonly [number, number, number];
  readonly params: Readonly<Record<string, unknown>>;
  readonly ports: Readonly<Record<string, PortDeclaration>>;
  readonly tags: readonly string[];
  readonly seed: Seed256;
}

/** A lot that has been claimed and will become a building. */
export interface BuiltLot {
  readonly nodePath: string;
  readonly id: string;
  /** The parcel the building is seated in, not the building itself. */
  readonly rect: Rect;
  readonly face: HorizontalFace;
  readonly size: readonly [number, number, number];
  readonly ports: Readonly<Record<string, PortDeclaration>>;
  readonly params: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
  readonly seed: Seed256;
  readonly frontPort: string | undefined;
  readonly street: string;
  /** True when the thing stands on (or starts/ends on) a corner lot — F5. */
  readonly corner: boolean;
  readonly frontAnchor: Point2;
}

/**
 * The midpoint of `rect`'s `face` edge — F4's `frontAnchor`.
 */
export function frontAnchorOf(rect: Rect, face: HorizontalFace): Point2 {
  const midX = Math.floor((rect.x0 + rect.x1) / 2);
  const midZ = Math.floor((rect.z0 + rect.z1) / 2);
  return {
    x: face === "west" ? rect.x0 : face === "east" ? rect.x1 : midX,
    z: face === "north" ? rect.z0 : face === "south" ? rect.z1 : midZ,
  };
}

/** The frontage record a {@link BuiltLot} carries away from the lots it claimed. */
export interface FrontageRecord {
  readonly street: string;
  readonly corner: boolean;
  readonly frontAnchor: Point2;
}

/**
 * What a claim keeps of the frontage its lots knew — §0.3c.
 */
export function frontageOf(
  rect: Rect,
  face: HorizontalFace,
  lots: readonly Pick<Lot, "street" | "corner">[],
  street?: string,
): FrontageRecord {
  return {
    street: lots[0]?.street ?? street ?? "",
    corner: lots.some((lot) => lot.corner),
    frontAnchor: frontAnchorOf(rect, face),
  };
}

/**
 * The yaw that turns a node's front face towards `target`.
 */
export function yawFacing(front: HorizontalFace, target: HorizontalFace): Yaw {
  const CARDINALS: readonly HorizontalFace[] = ["north", "east", "south", "west"] as const;
  const steps = (CARDINALS.indexOf(target) - CARDINALS.indexOf(front) + 4) % 4;
  return ((steps * 90) % 360) as Yaw;
}

/** The unrotated footprint a landmark asks for. */
export function envelopeSize(node: StructureNode): readonly [number, number, number] {
  const declared = node.envelope?.size;
  if (declared !== undefined && declared.length === 3) return declared as readonly [number, number, number];
  const params = node.params ?? {};
  const floors = typeof params["floors"] === "number" ? params["floors"] : 2;
  return [11, Math.max(4, Math.round(floors * FLOOR_HEIGHT)), 11];
}

/** Two rectangles share at least one column. */
function overlapsRect(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
}

/** A run of adjacent lots a landmark may take. */
interface LotRun {
  readonly lots: readonly Lot[];
  readonly rect: Rect;
  readonly face: HorizontalFace;
  /** The site's street when the run holds no lot to read it from (a planned site). */
  readonly street?: string;
}

/**
 * The cheapest site for a landmark: a run of unclaimed lots, or failing that a
 * whole free block.
 */
function claimSite(
  lots: readonly Lot[],
  blocks: readonly BlockSite[],
  claimed: ReadonlySet<string>,
  landmark: Landmark,
): LotRun | null {
  const run = claimRun(lots, claimed, landmark);
  if (run !== null) return run;

  for (const block of blocks) {
    const whole = block.planned === true;
    const mine = lots.filter(
      (l) => l.block === block.block && (!whole || overlapsRect(l.rect, block.rect)),
    );
    if ((mine.length === 0 && !whole) || (!whole && mine.some((l) => claimed.has(l.id)))) continue;
    const yaw = yawFacing(frontFace(landmark.ports, undefined), block.face);
    const [rw, , rd] = rotatedSize(landmark.size, yaw);
    if (rw > block.rect.x1 - block.rect.x0 + 1 || rd > block.rect.z1 - block.rect.z0 + 1) continue;
    if (whole) {
      const s = seat(block.rect, block.face, rw, rd);
      const under = mine.filter((l) => overlapsRect(l.rect, s));
      if (under.some((l) => claimed.has(l.id))) continue;
      return { lots: under, rect: s, face: block.face, street: block.street };
    }
    return { lots: mine, rect: block.rect, face: block.face, street: block.street };
  }
  return null;
}

/** The cheapest run of adjacent unclaimed lots that fits a landmark. */
function claimRun(lots: readonly Lot[], claimed: ReadonlySet<string>, landmark: Landmark): LotRun | null {
  let best: LotRun | null = null;
  let bestWaste = Number.POSITIVE_INFINITY;

  for (let start = 0; start < lots.length; start++) {
    const first = lots[start] as Lot;
    if (claimed.has(first.id)) continue;
    let run: Lot[] = [first];
    for (let length = 1; length <= 4; length++) {
      if (length > 1) {
        const next = lots[start + length - 1];
        if (
          next === undefined ||
          claimed.has(next.id) ||
          next.block !== first.block ||
          next.face !== first.face ||
          next.order !== (run[run.length - 1] as Lot).order + 1
        ) {
          break;
        }
        run = [...run, next];
      }
      const rect = unionRect(run.map((l) => l.rect));
      const yaw = yawFacing(frontFace(landmark.ports, undefined), first.face);
      const [rw, , rd] = rotatedSize(landmark.size, yaw);
      const w = rect.x1 - rect.x0 + 1;
      const d = rect.z1 - rect.z0 + 1;
      if (rw > w || rd > d) continue;
      const waste = w * d - rw * rd;
      if (waste < bestWaste) {
        bestWaste = waste;
        best = { lots: run, rect, face: first.face };
      }
    }
  }
  return best;
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
 * Seat a `w × d` footprint against the lot's build-to line.
 */
export function seat(lot: Rect, face: HorizontalFace, w: number, d: number): Rect {
  switch (face) {
    case "north":
      return { x0: lot.x0 + Math.floor((lot.x1 - lot.x0 + 1 - w) / 2), z0: lot.z0, x1: lot.x0 + Math.floor((lot.x1 - lot.x0 + 1 - w) / 2) + w - 1, z1: lot.z0 + d - 1 };
    case "south":
      return { x0: lot.x0 + Math.floor((lot.x1 - lot.x0 + 1 - w) / 2), z0: lot.z1 - d + 1, x1: lot.x0 + Math.floor((lot.x1 - lot.x0 + 1 - w) / 2) + w - 1, z1: lot.z1 };
    case "west":
      return { x0: lot.x0, z0: lot.z0 + Math.floor((lot.z1 - lot.z0 + 1 - d) / 2), x1: lot.x0 + w - 1, z1: lot.z0 + Math.floor((lot.z1 - lot.z0 + 1 - d) / 2) + d - 1 };
    case "east":
      return { x0: lot.x1 - w + 1, z0: lot.z0 + Math.floor((lot.z1 - lot.z0 + 1 - d) / 2), x1: lot.x1, z1: lot.z0 + Math.floor((lot.z1 - lot.z0 + 1 - d) / 2) + d - 1 };
  }
}

/**
 * The district's children, biggest footprint first.
 */
function landmarksOf(
  node: DistrictNode,
  nodePath: string,
  worldSeed: bigint,
  diagnostics: LoamDiagnostic[],
): Landmark[] {
  const INFILL_PORTS: Readonly<Record<string, PortDeclaration>> = Object.freeze({
    door: Object.freeze({ type: "door", face: "south", tags: Object.freeze(["primary"]) }),
  });
  const out: Landmark[] = [];
  for (const child of node.children ?? []) {
    const structure = child as StructureNode;
    const childPath = `${nodePath}.${structure.id}`;
    const size = envelopeSize(structure);
    out.push({
      id: structure.id,
      nodePath: childPath,
      size,
      params: structure.params ?? {},
      ports: structure.ports ?? INFILL_PORTS,
      tags: structure.tags ?? [],
      seed: nodeSeed(worldSeed, childPath, structure.seedSalt ?? ""),
    });
  }
  return out
    .map((l, index) => ({ l, index }))
    .sort((a, b) => {
      const areaA = a.l.size[0] * a.l.size[2];
      const areaB = b.l.size[0] * b.l.size[2];
      return areaA !== areaB ? areaB - areaA : a.index - b.index;
    })
    .map((e) => e.l);
}

/**
 * Landmark placement stage — narrow input/result, explicit ownership.
 *
 * Receives immutable lots/blockSites and claimed set; returns new claimed set,
 * built array extension, and diagnostics produced by this stage — no shared
 * mutable context with sibling stages.
 */
export interface LandmarkPlacementInput {
  readonly node: DistrictNode;
  readonly nodePath: string;
  readonly worldSeed: bigint;
  readonly lots: readonly Lot[];
  readonly blockSites: readonly BlockSite[];
  readonly claimed: ReadonlySet<string>;
  readonly built: readonly BuiltLot[];
  readonly landmarkBasePath?: string;
}

export interface LandmarkPlacementResult {
  readonly claimed: Set<string>;
  readonly built: BuiltLot[];
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly unplaced: number;
  readonly landmarks: number;
}

export function placeLandmarks(input: LandmarkPlacementInput): LandmarkPlacementResult {
  const { node, nodePath, worldSeed, lots, blockSites, claimed, built, landmarkBasePath } = input;
  const diagnostics: LoamDiagnostic[] = [];
  const nextClaimed = new Set<string>(claimed);
  const nextBuilt: BuiltLot[] = [...built];
  const landmarks = landmarksOf(node, landmarkBasePath ?? nodePath, worldSeed, diagnostics);
  let unplaced = 0;
  for (const landmark of landmarks) {
    const site = claimSite(lots, blockSites, nextClaimed, landmark);
    if (site === null) {
      unplaced++;
      diagnostics.push(
        warning(
          "CANNOT_FIT",
          landmark.nodePath,
          `no lot or block in "${nodePath}" is big enough for this landmark's ${landmark.size[0]} × ${landmark.size[2]} footprint`,
          `shrink "envelope.size", raise the district's "params.blockSize" so its blocks are bigger, or move this building out of the district and let the solver place it`,
        ),
      );
      continue;
    }
    for (const lot of site.lots) nextClaimed.add(lot.id);
    nextBuilt.push({
      nodePath: landmark.nodePath,
      id: landmark.id,
      rect: site.rect,
      face: site.face,
      size: landmark.size,
      ports: landmark.ports,
      params: landmark.params,
      tags: landmark.tags,
      seed: landmark.seed,
      frontPort: undefined,
      ...frontageOf(site.rect, site.face, site.lots, site.street),
    });
  }
  return {
    claimed: nextClaimed,
    built: nextBuilt,
    diagnostics,
    unplaced,
    landmarks: landmarks.length,
  };
}

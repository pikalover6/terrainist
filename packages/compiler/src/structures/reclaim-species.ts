/**
 * **Where the skin's green comes from** — RUINS-PLAN-v0-WP6 §4.6 and Q2.
 *
 * > **THE GREEN RULE.** The skin's green comes from the **place**, not from the
 * > building. Leaf and shrub species are the ones already growing around this
 * > settlement; only moss is universal, because moss is what grows on stone
 * > everywhere.
 *
 * The re-clad rule's sibling, and stated for the same reason: a birch quarter
 * that grows jungle leaves is exactly the class of bug "a concrete tower
 * re-clad in mossy cobblestone" was. So the leaves the green skin stuffs into a
 * window hole are resolved **once per settlement**, before the pass, from:
 *
 * 1. the species tables of the `scatter.forest@0` nodes whose `area` covers the
 *    settlement's hull — the wood this city actually stands in;
 * 2. failing that, the climate fallback table below, with `LOAM-W514` so the
 *    fall-through is visible rather than silent (Q2: *"not a seeded pick —
 *    unpredictable is the wrong property for a thing the eye compares against
 *    the surrounding landscape"*).
 *
 * Coverage is asked of `areaContains`, the scatter's own predicate, at the
 * hull's centre and its four corners: one implementation of "is this column in
 * this node's area", exactly as `support.ts` is one implementation of "what
 * holds this up". A node that covers no part of the hull is a wood somewhere
 * else and its species are somebody else's.
 *
 * Determinism: document order throughout, no RNG, no seed, no wall clock.
 */

import type { LoamDiagnostic } from "@terrainist/spec";
import { warning } from "@terrainist/spec";

import type { Region } from "@terrainist/stdlib";

import { CLIMATE_STRATA, FLORA_SPECIES, areaContains } from "../terrain/vegetation.js";

/** The species the place already grows, resolved for one settlement. */
export interface ReclaimSpecies {
  /**
   * Palette symbols of the leaves the skin may write, in document order and
   * de-duplicated. Never empty: the fallback always answers.
   */
  readonly leafSymbols: readonly string[];
  /** Where the answer came from — `climate` is the fall-through Q2 names. */
  readonly source: "forest" | "climate";
  /** The climate the fallback used, when it did. */
  readonly climate?: string;
}

/**
 * The climate fallback (§4.6.2).
 *
 * Deliberately the flora grammar's own per-climate canopy table rather than a
 * second list of species: a fallback that named its own trees would be a
 * second answer to "what grows here", which is the whole defect the green rule
 * exists to prevent. `arid` adds `dead_bush` in WP-6d, where shrubs live; a
 * climate whose canopy row is empty leaves the settlement with no leaves and
 * the skin simply plugs no openings.
 */
const RECLAIM_FALLBACK_CLIMATE = "temperate";

/** The leaf symbol of a flora species id, or `undefined` when it has none. */
function leafSymbolOf(shape: string): string | undefined {
  const def = (FLORA_SPECIES as Readonly<Record<string, { leafSymbol?: string }>>)[shape];
  return def?.leafSymbol;
}

interface ForestNodeLike {
  readonly generator?: unknown;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly children?: readonly unknown[];
}

/** Every `scatter.forest@0` node in the document, in document order. */
function forestNodes(node: unknown, out: ForestNodeLike[]): void {
  if (node === null || typeof node !== "object") return;
  const n = node as ForestNodeLike;
  if (n.generator === "scatter.forest@0") out.push(n);
  for (const child of n.children ?? []) forestNodes(child, out);
}

/**
 * Resolve the species the green skin may draw its leaves from.
 *
 * @param doc the Loam document, as parsed.
 * @param region the settlement's hull — the plan region, which is the hull the
 *   structure pass works over.
 */
export function resolveReclaimSpecies(
  doc: unknown,
  region: Region,
): { readonly species: ReclaimSpecies; readonly diagnostics: readonly LoamDiagnostic[] } {
  const nodes: ForestNodeLike[] = [];
  forestNodes((doc as { root?: unknown } | undefined)?.root, nodes);

  // The hull, as five probes: the centre and the four corners. A node whose
  // area touches any of them is a wood this city stands in or beside.
  const cx = region.x0 + (region.width >> 1);
  const cz = region.z0 + (region.depth >> 1);
  const x1 = region.x0 + region.width - 1;
  const z1 = region.z0 + region.depth - 1;
  const probes: readonly (readonly [number, number])[] = [
    [cx, cz],
    [region.x0, region.z0],
    [x1, region.z0],
    [region.x0, z1],
    [x1, z1],
  ];

  const leaves: string[] = [];
  const seen = new Set<string>();
  let climate: string | undefined;
  for (const node of nodes) {
    const params = (node.params ?? {}) as Readonly<Record<string, unknown>>;
    const area = (params["area"] ?? { all: true }) as never;
    let covers = false;
    for (const [px, pz] of probes) {
      // `areaContains` is the scatter's own predicate, with the boundary wobble
      // left at its default: the hull test is a coverage question, not a
      // per-column one, and a wobbled edge would make it seed-dependent.
      if (areaContains(region, area, px, pz)) {
        covers = true;
        break;
      }
    }
    if (!covers) continue;
    const theme = params["theme"];
    if (climate === undefined && typeof theme === "string") climate = theme;
    const species = params["species"];
    if (!Array.isArray(species)) continue;
    for (const entry of species) {
      const shape = (entry as { shape?: unknown } | undefined)?.shape;
      if (typeof shape !== "string") continue;
      const symbol = leafSymbolOf(shape);
      if (symbol === undefined || seen.has(symbol)) continue;
      seen.add(symbol);
      leaves.push(symbol);
    }
  }

  if (leaves.length > 0) {
    return { species: { leafSymbols: leaves, source: "forest" }, diagnostics: [] };
  }

  // --- the fallback, and `LOAM-W514` so it is visible (§9) ------------------
  const key = climate !== undefined && climate in CLIMATE_STRATA ? climate : RECLAIM_FALLBACK_CLIMATE;
  const row = (CLIMATE_STRATA as Readonly<Record<string, { canopy: readonly string[] }>>)[key];
  for (const shape of row?.canopy ?? []) {
    const symbol = leafSymbolOf(shape);
    if (symbol === undefined || seen.has(symbol)) continue;
    seen.add(symbol);
    leaves.push(symbol);
  }
  return {
    species: { leafSymbols: leaves, source: "climate", climate: key },
    diagnostics: [
      warning(
        "GREEN_SKIN_NO_SPECIES",
        "",
        `the green skin found no scatter.forest@0 node covering this settlement, so its leaves fall back to the "${key}" climate table (${leaves.join(", ") || "nothing"})`,
        "declare a forest node whose area covers the settlement if you want the ruin to grow the wood it stands in",
      ),
    ],
  };
}

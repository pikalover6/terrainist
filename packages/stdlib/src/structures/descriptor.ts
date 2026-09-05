/**
 * Descriptor registry — the deep seam for Phase 4.
 *
 * One discriminated descriptor per structure, one ordered registry, derived
 * guards/maps/lookups, no behavior change.
 *
 * - Buildings and props share catalog/lookup metadata (id, kind, tags/aliases,
 *   catalog wave) but retain distinct realization interfaces (furnish vs
 *   generator/footprint). Request/placement semantics are not merged.
 * - Facade defaults are nullable per-field (windowShape/windowRhythm/roof) with
 *   first-non-empty chain semantics left to `archetypeFacadeDefaults`; stored
 *   here as an optional dict, not a merged dict.
 * - Prop footprint is a param-dependent function (pier length/width, rail
 *   grade/curve, etc.) plus base/minY/piles/anchor duality; descriptor stores
 *   the leaf footprint function reference, not a static tuple.
 * - Realization (furnish / generator / seeding / LocalVoxelOp order) stays in leaf
 *   modules; descriptor only holds reference handles.
 * - Special dispatch flavors (highrise/terrace/watchtower/underground) carry a
 *   `dispatch` flag so later migration can preserve tag priority without
 *   inventing a second grammar.
 * - Catalog kind override (e.g. houseboat prop) and wave/tags are preserved
 *   via optional catalog metadata.
 * - Deterministic ordered registration: explicit insertion order is the source
 *   of truth, not map/object key order. Duplicate ids are rejected.
 * - Immutable explicit composition is the only production pattern: registries
 *   are populated once via `createStructureRegistry(...descriptors)` with
 *   insertion order preserved; no global singleton, no runtime plugin
 *   registration, no self-registration side effects.
 * - No generated barrels, no runtime plugin discovery, no DSL.
 */

export type DescriptorKind = "building" | "prop";

/** Nullable facade tendencies; first-non-empty wins when merged into params. */
export interface BuildingFacadeDefaults {
  readonly windowShape?: string;
  readonly windowRhythm?: string;
  readonly roof?: string;
}

/** Shared catalog-facing metadata; mirrors StructureEntry fields needed for lookup. */
export interface DescriptorCatalog {
  readonly category?: string;
  readonly kindOverride?: DescriptorKind | string;
  readonly wave?: number;
  readonly tags?: readonly string[];
  readonly note?: string;
}

/** Base shared by both variants — intentionally small. */
interface DescriptorBase {
  readonly id: string;
  readonly kind: DescriptorKind;
  /** Tag equivalence set in priority order; first is canonical id. */
  readonly tags?: readonly string[];
  /** Alias equivalence (e.g. keep → castle/donjon/citadel). */
  readonly aliases?: readonly string[];
  readonly catalog?: DescriptorCatalog;
}

/** Building variant — interior fit-out, facade defaults, sizing policy handle. */
export interface BuildingDescriptor extends DescriptorBase {
  readonly kind: "building";
  /** Optional facade defaults; absent means grammar resolves without archetype bias. */
  readonly facadeDefaults?: BuildingFacadeDefaults;
  /** Furnish callback handle — leaf-owned, not re-implemented here. */
  readonly furnish: (ctx: unknown) => number;
  /** Sizing policy reference only where shared (e.g. highrise terrace). */
  readonly sizing?: {
    readonly resolveFootprint?: unknown;
  };
  /** Special dispatch flavor where building grammar branches. */
  readonly dispatch?: "standard" | "highrise" | "terrace" | "watchtower" | "underground";
}

/** Prop variant — param-dependent footprint + generator. */
export interface PropDescriptor extends DescriptorBase {
  readonly kind: "prop";
  /** Param-dependent footprint; must delegate to leaf footprint fn. */
  readonly footprint: (params: Readonly<Record<string, unknown>>) => {
    readonly size: readonly [number, number, number];
    readonly minY: number;
    readonly base: "ground" | "water" | "shore";
    readonly piles?: readonly { readonly x: number; readonly z: number }[];
    readonly anchor?: { readonly x: number; readonly z: number };
  };
  /** Generator handle — leaf-owned. */
  readonly generator: (ctx: unknown) => unknown;
}

/** Discriminated union — narrowing via `kind`. */
export type StructureDescriptor = BuildingDescriptor | PropDescriptor;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export function isBuildingDescriptor(d: StructureDescriptor): d is BuildingDescriptor {
  return d.kind === "building";
}

export function isPropDescriptor(d: StructureDescriptor): d is PropDescriptor {
  return d.kind === "prop";
}

// ---------------------------------------------------------------------------
// Registry — deterministic insertion order, duplicate rejection, closed
// ---------------------------------------------------------------------------

/**
 * Ordered immutable-by-convention registry.
 *
 * Population happens once at construction via `createStructureRegistry(...descriptors)`
 * or `new StructureRegistry(descriptors)`. Insertion order is preserved for
 * tag-priority and catalog order. Duplicate ids are rejected. No mutation
 * surface (`register`/`clear`) is exposed — the registry is a closed data
 * structure.
 */
export class StructureRegistry {
  private readonly _order: readonly StructureDescriptor[];
  private readonly _byId: ReadonlyMap<string, StructureDescriptor>;

  constructor(descriptors: readonly StructureDescriptor[] = []) {
    const order: StructureDescriptor[] = [];
    const byId = new Map<string, StructureDescriptor>();
    for (const d of descriptors) {
      if (byId.has(d.id)) {
        throw new Error(`duplicate structure id "${d.id}"`);
      }
      if (d.kind === "building" && typeof (d as BuildingDescriptor).furnish !== "function") {
        throw new Error(`building descriptor "${d.id}" missing furnish`);
      }
      if (d.kind === "prop" && typeof (d as PropDescriptor).generator !== "function") {
        throw new Error(`prop descriptor "${d.id}" missing generator`);
      }
      if (d.kind === "prop" && typeof (d as PropDescriptor).footprint !== "function") {
        throw new Error(`prop descriptor "${d.id}" missing footprint`);
      }
      byId.set(d.id, d);
      order.push(d);
    }
    this._order = Object.freeze([...order]);
    this._byId = byId;
  }

  get(id: string): StructureDescriptor | undefined {
    return (this._byId as Map<string, StructureDescriptor>).get(id);
  }

  getBuilding(id: string): BuildingDescriptor | undefined {
    const d = (this._byId as Map<string, StructureDescriptor>).get(id);
    return d !== undefined && d.kind === "building" ? (d as BuildingDescriptor) : undefined;
  }

  getProp(id: string): PropDescriptor | undefined {
    const d = (this._byId as Map<string, StructureDescriptor>).get(id);
    return d !== undefined && d.kind === "prop" ? (d as PropDescriptor) : undefined;
  }

  has(id: string): boolean {
    return (this._byId as Map<string, StructureDescriptor>).has(id);
  }

  /** Insertion order — the load-bearing tag-priority order. */
  list(): readonly StructureDescriptor[] {
    return this._order;
  }

  listBuildings(): readonly BuildingDescriptor[] {
    return this._order.filter((d): d is BuildingDescriptor => d.kind === "building");
  }

  listProps(): readonly PropDescriptor[] {
    return this._order.filter((d): d is PropDescriptor => d.kind === "prop");
  }

  /** Size. */
  get size(): number {
    return this._order.length;
  }
}

/**
 * Factory for explicit composition — ordered, immutable-by-convention.
 * Duplicate ids are rejected; insertion order is preserved for tag priority.
 */
export function createStructureRegistry(...descriptors: StructureDescriptor[]): StructureRegistry {
  return new StructureRegistry(descriptors);
}

/** Derived lookup — tag/alias → descriptor, insertion-order priority. */
export function findByTag(registry: StructureRegistry, tag: string): StructureDescriptor | undefined {
  for (const d of registry.list()) {
    if (d.id === tag) return d;
    if (d.tags?.includes(tag) === true) return d;
    if (d.aliases?.includes(tag) === true) return d;
  }
  return undefined;
}
// ---------------------------------------------------------------------------
// Tag resolver — ordered descriptor scan, no registry allocation
// ---------------------------------------------------------------------------

/**
 * Shared tag → id resolver — scans descriptor order, returns first whose
 * id/tags/aliases intersects the input tag set.
 *
 * - Insertion order is priority (mirrors historical per-pack `if (has(...))`
 *   chains and `findByTag` order). Duplicate tag claims resolve to the
 *   earliest descriptor.
 * - Checks `id`, every `tags` entry, and every `aliases` entry against the
 *   authored `tags` set. Empty `tags` returns `null`. No match returns
 *   `null`.
 * - No registry construction and no allocations on the hot path: a pure
 *   nested-loop scan. A `Set` is only allocated by callers that already
 *   hold one; this function does not create one.
 */
export function descriptorIdFromTags<const Id extends string>(
  descriptors: readonly { readonly id: Id; readonly tags?: readonly string[]; readonly aliases?: readonly string[] }[],
  tags: readonly string[],
): Id | null {
  if (tags.length === 0) return null;
  for (const d of descriptors) {
    for (let i = 0; i < tags.length; i++) {
      if (tags[i] === d.id) return d.id;
    }
    const dTags = d.tags;
    if (dTags !== undefined) {
      for (let j = 0; j < dTags.length; j++) {
        const cand = dTags[j]!;
        for (let i = 0; i < tags.length; i++) {
          if (tags[i] === cand) return d.id;
        }
      }
    }
    const aliases = d.aliases;
    if (aliases !== undefined) {
      for (let j = 0; j < aliases.length; j++) {
        const cand = aliases[j]!;
        for (let i = 0; i < tags.length; i++) {
          if (tags[i] === cand) return d.id;
        }
      }
    }
  }
  return null;
}

/**
 * Building `Id` resolver — scans descriptor order, returns first whose
 * id/tags/aliases intersects the input tag set. Leaf packs delegate as:
 * `return buildingIdFromTags(DESCRIPTORS, tags)` with typed `Id` return
 * and historical priority.
 */
export function buildingIdFromTags<const Id extends string>(
  descriptors: readonly { readonly id: Id; readonly tags?: readonly string[]; readonly aliases?: readonly string[] }[],
  tags: readonly string[],
): Id | null {
  if (tags.length === 0) return null;
  for (const d of descriptors) {
    for (let i = 0; i < tags.length; i++) {
      if (tags[i] === d.id) return d.id;
    }
    const dTags = d.tags;
    if (dTags !== undefined) {
      for (let j = 0; j < dTags.length; j++) {
        const cand = dTags[j]!;
        for (let i = 0; i < tags.length; i++) {
          if (tags[i] === cand) return d.id;
        }
      }
    }
    const aliases = d.aliases;
    if (aliases !== undefined) {
      for (let j = 0; j < aliases.length; j++) {
        const cand = aliases[j]!;
        for (let i = 0; i < tags.length; i++) {
          if (tags[i] === cand) return d.id;
        }
      }
    }
  }
  return null;
}

/**
 * Prop `Id` resolver — same scan semantics as {@link buildingIdFromTags},
 * for prop descriptor arrays.
 */
export function propIdFromTags<const Id extends string>(
  descriptors: readonly { readonly id: Id; readonly tags?: readonly string[]; readonly aliases?: readonly string[] }[],
  tags: readonly string[],
): Id | null {
  if (tags.length === 0) return null;
  for (const d of descriptors) {
    for (let i = 0; i < tags.length; i++) {
      if (tags[i] === d.id) return d.id;
    }
    const dTags = d.tags;
    if (dTags !== undefined) {
      for (let j = 0; j < dTags.length; j++) {
        const cand = dTags[j]!;
        for (let i = 0; i < tags.length; i++) {
          if (tags[i] === cand) return d.id;
        }
      }
    }
    const aliases = d.aliases;
    if (aliases !== undefined) {
      for (let j = 0; j < aliases.length; j++) {
        const cand = aliases[j]!;
        for (let i = 0; i < tags.length; i++) {
          if (tags[i] === cand) return d.id;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Descriptor builders — compact row construction (Phase 4 net growth control)
// ---------------------------------------------------------------------------

/**
 * Registry stores heterogeneous leaf callbacks (each pack's concrete
 * `FitOutContext` / `PropContext` shapes differ). The unavoidable
 * type-erasure cast to the registry's `(ctx: unknown) => ...` boundary
 * is centralized here — callers pass their concrete typed handle once,
 * not `as unknown as (ctx: unknown) => number` on every row.
 */

/**
 * Map ordered ids into a frozen readonly building descriptor array.
 *
 * Preserves exact ID order. Accepts generic concrete furnish context `Ctx`
 * so leaf `furnish` handles stay typed; the heterogeneous cast happens
 * once inside the builder.
 *
 * - `tags` / `aliases` accept a per-id callback or a record map; absent
 *   defaults to `[id]` / `[]` (no alias), matching leaf equivalence tables.
 * - `facadeDefaults` is a per-id callback returning nullable per-field
 *   defaults; absent or returning `undefined` means no bias.
 * - `furnish` is the leaf's concrete `(ctx: Ctx) => number` handle shared
 *   by the pack — one handle for the whole `ids` array, not per row.
 * - `dispatch` is optional: either a constant (`"standard"`, `"highrise"`,
 *   `"terrace"`, `"watchtower"`, `"underground"`) or a per-id callback.
 *   Omitted leaves `dispatch` unset (registry treats as standard).
 *
 * Returns a frozen array of frozen descriptors — no plugin or
 * self-registration, just data for `createStructureRegistry(...descs)`.
 */
export function defineBuildingDescriptors<const Id extends string, Ctx>(
  ids: readonly Id[],
  opts: {
    readonly tags?: ((id: Id) => readonly string[]) | Readonly<Record<Id, readonly string[]>>;
    readonly aliases?: ((id: Id) => readonly string[]) | Readonly<Record<Id, readonly string[]>>;
    readonly facadeDefaults?: (id: Id) => BuildingFacadeDefaults | undefined;
    readonly furnish: (ctx: Ctx) => number;
    readonly dispatch?: BuildingDescriptor["dispatch"] | ((id: Id) => BuildingDescriptor["dispatch"] | undefined);
  },
): readonly (BuildingDescriptor & { readonly id: Id })[] {
  // Centralized boundary cast — heterogeneous leaf contexts erased once.
  const furnish = opts.furnish as unknown as (ctx: unknown) => number;
  const out: (BuildingDescriptor & { readonly id: Id })[] = ids.map((id) => {
    const tags =
      opts.tags === undefined
        ? ([id] as readonly string[])
        : typeof opts.tags === "function"
          ? (opts.tags as (id: Id) => readonly string[])(id)
          : ((opts.tags as Readonly<Record<Id, readonly string[]>>)[id] ?? ([id] as readonly string[]));
    const aliases =
      opts.aliases === undefined
        ? ([] as readonly string[])
        : typeof opts.aliases === "function"
          ? (opts.aliases as (id: Id) => readonly string[])(id)
          : ((opts.aliases as Readonly<Record<Id, readonly string[]>>)[id] ?? ([] as readonly string[]));
    const facadeDefaults = opts.facadeDefaults?.(id);
    const dispatch =
      opts.dispatch === undefined
        ? undefined
        : typeof opts.dispatch === "function"
          ? (opts.dispatch as (id: Id) => BuildingDescriptor["dispatch"] | undefined)(id)
          : opts.dispatch;
    const base: BuildingDescriptor & { readonly id: Id } = {
      kind: "building",
      id,
      tags,
      aliases,
      ...(facadeDefaults !== undefined ? { facadeDefaults } : {}),
      furnish,
      ...(dispatch !== undefined ? { dispatch } : {}),
    };
    return Object.freeze(base);
  });
  return Object.freeze(out);
}

/**
 * Map ordered ids into a frozen readonly prop descriptor array.
 *
 * Preserves exact ID order. Accepts generic concrete generator context
 * `Ctx` — the heterogeneous cast to `(ctx: unknown) => unknown` is
 * centralized here. Footprint is param-dependent and per-id:
 * `footprint(id, params)` is wrapped as descriptor `footprint(params)`
 * so callers keep a concrete typed footprint callback.
 *
 * - `footprint` is a per-id callback `(id, params) => { size, minY, base, ... }`
 *   matching leaf footprint tables (pier length/width, rail grade/curve, etc.).
 * - `generator` is a per-id lookup or callback `(id) => (ctx: Ctx) => unknown`
 *   matching leaf generator maps. Both forms centralize the boundary cast.
 * - `tags` / `aliases` mirror the building builder (callback or record).
 *
 * Returns a frozen array — no registry mutation, no plugin surface.
 */
export function definePropDescriptors<const Id extends string, Ctx>(
  ids: readonly Id[],
  opts: {
    readonly footprint: (
      id: Id,
      params: Readonly<Record<string, unknown>>,
    ) => {
      readonly size: readonly [number, number, number];
      readonly minY: number;
      readonly base: "ground" | "water" | "shore";
      readonly piles?: readonly { readonly x: number; readonly z: number }[];
      readonly anchor?: { readonly x: number; readonly z: number };
    };
    readonly generator: ((id: Id) => (ctx: Ctx) => unknown) | Readonly<Record<Id, (ctx: Ctx) => unknown>>;
    readonly tags?: ((id: Id) => readonly string[]) | Readonly<Record<Id, readonly string[]>>;
    readonly aliases?: ((id: Id) => readonly string[]) | Readonly<Record<Id, readonly string[]>>;
  },
): readonly (PropDescriptor & { readonly id: Id })[] {
  const out: (PropDescriptor & { readonly id: Id })[] = ids.map((id) => {
    const tags =
      opts.tags === undefined
        ? ([id] as readonly string[])
        : typeof opts.tags === "function"
          ? (opts.tags as (id: Id) => readonly string[])(id)
          : ((opts.tags as Readonly<Record<Id, readonly string[]>>)[id] ?? ([id] as readonly string[]));
    const aliases =
      opts.aliases === undefined
        ? ([] as readonly string[])
        : typeof opts.aliases === "function"
          ? (opts.aliases as (id: Id) => readonly string[])(id)
          : ((opts.aliases as Readonly<Record<Id, readonly string[]>>)[id] ?? ([] as readonly string[]));
    const rawGen =
      typeof opts.generator === "function"
        ? (opts.generator as (id: Id) => (ctx: Ctx) => unknown)(id)
        : (opts.generator as Readonly<Record<Id, (ctx: Ctx) => unknown>>)[id];
    if (typeof rawGen !== "function") {
      throw new Error(`prop descriptor "${id as string}" missing generator`);
    }
    // Centralized heterogeneous cast.
    const generator = rawGen as unknown as (ctx: unknown) => unknown;
    const footprint: PropDescriptor["footprint"] = (params) => opts.footprint(id, params);
    const desc: PropDescriptor & { readonly id: Id } = {
      kind: "prop",
      id,
      tags,
      ...(aliases.length > 0 ? { aliases } : {}),
      footprint,
      generator,
    };
    return Object.freeze(desc);
  });
  return Object.freeze(out);
}

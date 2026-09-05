/**
 * Street stage — district streets and their sidewalk dressing.
 *
 * Cohesive transformation: every district's street graph is surfaced,
 * its sidewalks dressed, and the per-quarter masks collected for the
 * life pass. It owns the graph-theming, datum/descent/seam/breakUp
 * wiring, the `surfaceStreetGraph` call, the `dressStreets` loop, and
 * the `segmentArcs` handoff — rather than scattering that wiring
 * across the top-level orchestration.
 *
 * Deep module: substantial private logic (F8 datum, F10 themes,
 * §2.4 seam, §7.3 breakUp, §3.8b arc levels) that previously lived
 * inline in `structures/index.ts`. Extracted so `index.ts` reads as
 * explicit orchestration over narrow inputs and owned results.
 */

import { nodeSeed, type MaterialTheme, type Seed256 } from "@terrainist/stdlib";
import { compilerIntentFor, type CompilerIntentResolution } from "../intent/compiler-resolved.js";
import { fanOut } from "../intent/fanout.js";
import { STRUCTURE_ROWS } from "./themes-intent.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import type { OccupancyGrid, Placement } from "../layout/types.js";
import type { ColumnPlan } from "../terrain/columns.js";
import type { Palette } from "../terrain/palette.js";
import type { PrismarineStack } from "../emit/prismarine.js";
import type { DistrictProduct } from "../layout/district.js";
import type { CityProduct } from "../layout/city-pass.js";
import type { RuinField } from "./ruin-field.js";
import type { RetainingPassResult } from "./retaining.js";
import type { LoamDiagnostic } from "@terrainist/spec";
import type { StructureBlock } from "./buildings.js";
import { SEGMENT_ID_SEPARATOR, STREET_WEAR_CHANCE, surfaceStreetGraph } from "./roads.js";
import type { StreetSurfaceResult } from "./roads.js";
import type { LifeStreets } from "./life.js";
import { dressStreets, type SegmentArc, type StreetscapeResult, type StreetscapeFurnishing } from "./streetscape.js";

export interface StreetStageInput {
  readonly districts: readonly DistrictProduct[];
  readonly cities: readonly CityProduct[];
  readonly plan: ColumnPlan;
  readonly ground: GroundDriver;
  readonly palette: Palette;
  readonly stack: PrismarineStack;
  readonly placements: readonly Placement[];
  readonly buildingPaths: ReadonlySet<string>;
  readonly districtPaths: ReadonlySet<string>;
  readonly theme: MaterialTheme;
  readonly themeId: string | undefined;
  readonly themeSeed: Seed256;
  readonly intents: CompilerIntentResolution;
  readonly rootIntent: CompilerIntentResolution["root"];
  readonly rootPath: string;
  readonly declaredTheme?: string;
  readonly worldSeed: bigint;
  readonly retaining: RetainingPassResult;
  readonly ruinField: RuinField | undefined;
  readonly occupancy?: OccupancyGrid;
  readonly blocks: readonly StructureBlock[];
}

export interface StreetStageResult {
  readonly streets?: StreetSurfaceResult;
  readonly streetMasks: readonly LifeStreets[];
  readonly streetFurnishings: readonly (() => StreetscapeFurnishing)[];
  readonly streetFurniture: number;
  readonly arterials: readonly CityProduct["plan"]["arterials"][number][];
  readonly diagnostics: readonly LoamDiagnostic[];
  readonly dressed: readonly StreetscapeResult[];
}

export function runStreetStage(input: StreetStageInput): StreetStageResult {
  const diagnostics: LoamDiagnostic[] = [];
  const streetMasks: LifeStreets[] = [];
  const streetFurnishings: (() => StreetscapeFurnishing)[] = [];
  let streetFurniture = 0;
  const arterials = input.cities.flatMap((c) =>
    c.plan.arterials.map((a) => ({ ...a, id: `${a.id}${SEGMENT_ID_SEPARATOR}${c.nodePath}` })),
  );
  let streets: StreetSurfaceResult | undefined;
  const dressed: StreetscapeResult[] = [];
  if (input.districts.length > 0 || arterials.length > 0) {
    streets = surfaceStreetGraph({
      graphs: input.districts.map((d) => d.streets),
      graphPaths: input.districts.map((d) => d.nodePath),
      ...(input.districts.some((d) => d.datum !== undefined)
        ? { datums: input.districts.map((d) => d.datum) }
        : {}),
      ...(input.districts.some((d) => d.descent !== undefined)
        ? { descents: input.districts.map((d) => d.descent) }
        : {}),
      ground: input.ground,
      ...(arterials.length === 0 ? {} : { arterials: arterials.map((a) => ({ id: a.id, width: a.width, path: a.path })) }),
      plan: input.plan,
      palette: input.palette,
      stack: input.stack,
      placements: input.placements,
      buildingPaths: input.buildingPaths,
      theme: input.theme.id,
      graphThemes: input.districts.map((d) => {
        const scoped = compilerIntentFor(input.intents, d.nodePath);
        const id = fanOut<string | undefined>(STRUCTURE_ROWS.materialTheme, scoped, {
          nodePath: d.nodePath,
          today: input.declaredTheme,
        });
        return id === undefined || id === input.themeId || id === input.theme.id ? undefined : id;
      }),
      seed: input.themeSeed,
      wearChance: fanOut<number>(STRUCTURE_ROWS.wearIntensity, input.rootIntent, {
        nodePath: input.rootPath,
        today: STREET_WEAR_CHANCE,
      }) as number,
      ...(input.retaining.wallColumns === 0 ? {} : { seam: input.retaining.seam }),
      ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
      ...(input.ruinField === undefined
        ? {}
        : (() => {
            const chance = fanOut<number>(STRUCTURE_ROWS.streetBreak, input.rootIntent, {
              nodePath: input.rootPath,
              today: 0,
            });
            return chance <= 0 ? {} : { breakUp: { chance, ruinField: input.ruinField.field } };
          })()),
    });
    if (streets.diagnostics !== undefined) diagnostics.push(...streets.diagnostics);
    const segmentArcs = new Map<string, SegmentArc>();
    for (const segment of streets.declaration.segments) {
      if (segment.frame === undefined || segment.levels === undefined) continue;
      segmentArcs.set(segment.source, {
        frame: segment.frame,
        levels: segment.levels,
        ...(segment.pull === undefined ? {} : { pull: segment.pull }),
      });
    }
    const builtColumns = new Set<string>();
    for (const b of input.blocks) builtColumns.add(`${b.x},${b.z}`);
    for (const b of streets.blocks) builtColumns.add(`${b.x},${b.z}`);
    for (const district of input.districts) {
      const res: StreetscapeResult = dressStreets(district.streets, {
        plan: input.plan,
        ground: input.ground,
        levels: segmentArcs,
        stack: input.stack,
        seed: nodeSeed(input.worldSeed, district.nodePath, ""),
        furniture: fanOut<string>(STRUCTURE_ROWS.kerbsideKit, compilerIntentFor(input.intents, district.nodePath), {
          nodePath: district.nodePath,
          today: district.streets.sidewalk >= 2 ? "downtown" : "village",
        }) as import("./streetscape.js").FurnitureKit,
        palette: input.palette,
        theme: input.theme.id,
        nodePath: district.nodePath,
        buildings: [...input.districtPaths].filter((p) => p.startsWith(`${district.nodePath}.`)).length,
        avoid: (x, z) => builtColumns.has(`${x},${z}`),
        surfaced: streets.road,
      });
      dressed.push(res);
      streetFurniture += res.props.length;
      diagnostics.push(...res.diagnostics);
      if (res.furnish !== undefined) streetFurnishings.push(res.furnish);
      streetMasks.push({
        nodePath: district.nodePath,
        bounds: district.bounds,
        graph: district.streets,
        masks: res.masks,
        ...(district.dressed === undefined ? {} : { dressed: district.dressed }),
      });
    }
  }
  return {
    ...(streets === undefined ? {} : { streets }),
    streetMasks,
    streetFurnishings,
    streetFurniture,
    arterials,
    diagnostics,
    dressed,
  };
}

/**
 * Building stage — the village's houses and their material deal.
 *
 * Cohesive transformation: every building the world holds is assembled here
 * from the solver's placements and the document's params, dealt a theme,
 * built into blocks, and analysed for the ruin field. It owns the job
 * assembly, the theme fan-out, the deal, the build, and the ruin field —
 * rather than scattering those steps across the orchestration.
 *
 * Deep module: substantial private logic (basement/cellar, wing, bays,
 * entrance, ornament, window rhythm, theme dealing, ruin field) that
 * previously lived inline in `structures/index.ts`. Extracted so
 * `index.ts` can read as explicit orchestration over narrow inputs and
 * owned results.
 */

import {
  archetypeFacadeDefaults,
  assignMaterials,
  DEFAULT_ORNAMENT_DENSITY,
  archetypeOfTags,
  nodeSeed,
  resolveArchetype,
  type BuildingMaterials,
  type MaterialTheme,
  type Seed256,
} from "@terrainist/stdlib";
import { compilerIntentFor, type CompilerIntentResolution } from "../intent/compiler-resolved.js";
import { fanOut } from "../intent/fanout.js";
import { STRUCTURE_ROWS } from "./themes-intent.js";
import { resolvePorts } from "../layout/ports.js";
import type { LayoutNodeInput, Placement, ResolvedPort } from "../layout/types.js";
import type { ColumnPlan } from "../terrain/columns.js";
import type { LoamDiagnostic, StructureNode } from "@terrainist/spec/ir";
import type { PrismarineStack } from "../emit/prismarine.js";
import {
  buildBuildings,
  terraceBaysParamOf,
  wingParamOf,
  type BuildingJob,
  type BuiltBuilding,
  type StructureBlock,
} from "./buildings.js";
import { buildRuinField, type RuinField } from "./ruin-field.js";
import type { PrecinctPassResult } from "./precincts.js";
import { DEFAULT_BASEMENT_DEPTH } from "@terrainist/stdlib";

function entranceTreatmentOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const rec = value as Record<string, unknown>;
  const treatment = rec["treatment"];
  return typeof treatment === "string" ? treatment : undefined;
}

function resolveBasementParam(value: unknown, implied: boolean): number {
  const fallback = implied ? DEFAULT_BASEMENT_DEPTH : 0;
  if (value === undefined) return fallback;
  if (value === true) return DEFAULT_BASEMENT_DEPTH;
  if (value === false) return fallback;
  if (typeof value === "number") return value > 0 ? Math.round(value) : fallback;
  if (typeof value === "object" && value !== null) {
    const rec = value as Record<string, unknown>;
    const depth = rec["depth"];
    return typeof depth === "number" ? Math.round(depth) : DEFAULT_BASEMENT_DEPTH;
  }
  return fallback;
}


function resolveBasementStyle(value: unknown, implied?: string): string | undefined {
  if (typeof value === "object" && value !== null) {
    const style = (value as { style?: unknown }).style;
    if (typeof style === "string") return style;
  }
  return implied;
}

/** Minimum ground/column view this stage needs — zero-copy plan reference. */
export interface BuildingStageInput {
  readonly worldSeed: bigint;
  readonly placements: readonly Placement[];
  readonly nodes: readonly LayoutNodeInput[];
  readonly docNodes: ReadonlyMap<string, StructureNode>;
  readonly paramsByPath?: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly needsCellar: ReadonlySet<string>;
  readonly impliedStyle: ReadonlyMap<string, string>;
  readonly precincts?: PrecinctPassResult;
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  readonly theme: MaterialTheme;
  readonly themeSeed: Seed256;
  readonly themeForNode: (nodePath: string) => MaterialTheme;
  readonly intents: CompilerIntentResolution;
  readonly declaredTheme?: string;
  /** Building paths assembled so far — this stage extends it. */
  readonly buildingPaths: ReadonlySet<string>;
}

/** Owned result — diagnostics and blocks grouped, not a shared bag. */
export interface BuildingStageResult {
  /** Every building the world holds after this stage (doc + precinct). */
  readonly built: readonly BuiltBuilding[];
  /** Blocks the stage emitted (buildings only). */
  readonly blocks: readonly StructureBlock[];
  readonly diagnostics: readonly LoamDiagnostic[];
  /** The material deal, in job order. */
  readonly deal: readonly BuildingMaterials[];
  /** Tags by node path, farmsteads excluded — life pass view. */
  readonly jobTags: ReadonlyMap<string, readonly string[]>;
  /** Extended building paths (input + this stage's buildings). */
  readonly buildingPaths: ReadonlySet<string>;
  /** Precinct ports this stage collected (for road anchors). */
  readonly precinctPorts: readonly ResolvedPort[];
  /** Themed jobs (for callers that need the deal). */
  readonly themed: readonly (BuildingJob & { materials: BuildingMaterials; theme: MaterialTheme })[];
  readonly ruinField: RuinField | undefined;
}

export function runBuildingStage(input: BuildingStageInput): BuildingStageResult {
  const byId = new Map(input.nodes.map((n) => [n.nodePath, n] as const));
  const buildingPaths = new Set<string>(input.buildingPaths);
  const jobs: BuildingJob[] = [];
  for (const placement of input.placements) {
    const node = byId.get(placement.nodePath);
    if (node?.generator !== "building.grammar@0") continue;
    buildingPaths.add(placement.nodePath);
    const params = (input.docNodes.get(placement.nodePath)?.params ??
      input.paramsByPath?.get(placement.nodePath) ??
      {}) as Record<string, unknown>;
    const basement = resolveBasementParam(params["basement"], input.needsCellar.has(placement.nodePath));
    const cellarStyle = resolveBasementStyle(params["basement"], input.impliedStyle.get(placement.nodePath));
    const wing = wingParamOf(params["wing"]);
    const bays = terraceBaysParamOf(params["bays"]);
    jobs.push({
      nodePath: placement.nodePath,
      placement,
      size: node.size,
      params: {
        ...(typeof params["floors"] === "number" ? { floors: params["floors"] } : {}),
        ...(typeof params["floorHeight"] === "number" ? { floorHeight: params["floorHeight"] } : {}),
        ...(typeof params["roof"] === "string" ? { roof: params["roof"] } : {}),
        ...(typeof params["windowRhythm"] === "string" ? { windowRhythm: params["windowRhythm"] } : {}),
        ...(typeof params["wallSymbol"] === "string" ? { wallSymbol: params["wallSymbol"] } : {}),
        ...(typeof params["trimSymbol"] === "string" ? { trimSymbol: params["trimSymbol"] } : {}),
        ...(typeof params["roofSymbol"] === "string" ? { roofSymbol: params["roofSymbol"] } : {}),
        ...(basement === 0 ? {} : { basement }),
        ...(cellarStyle === undefined ? {} : { cellarStyle }),
        ...(wing === undefined ? {} : { wing }),
        ...(bays === undefined ? {} : { bays }),
        ...(typeof params["decay"] === "number" ? { decay: params["decay"] } : {}),
        ...(entranceTreatmentOf(params["entrance"]) === undefined
          ? {}
          : { entrance: { treatment: entranceTreatmentOf(params["entrance"]) as string } }),
        ...(params["cornerStart"] === true ? { cornerStart: true } : {}),
        ...(params["cornerEnd"] === true ? { cornerEnd: true } : {}),
        archetype:
          typeof params["archetype"] === "string"
            ? params["archetype"]
            : archetypeOfTags(node.tags),
      },
      ports: node.ports as Readonly<Record<string, import("@terrainist/spec/ir").PortDeclaration>>,
      seed: node.seed,
      tags: node.tags,
    });
  }

  const precinctPorts: ResolvedPort[] = [];
  if (input.precincts !== undefined) {
    precinctPorts.push(...input.precincts.ports);
    for (const spec of input.precincts.buildings) {
      buildingPaths.add(spec.nodePath);
      jobs.push({
        nodePath: spec.nodePath,
        placement: spec.placement,
        size: spec.size,
        params: { archetype: spec.archetype },
        ports: spec.ports,
        seed: nodeSeed(input.worldSeed, spec.nodePath, ""),
        tags: spec.tags,
      });
      precinctPorts.push(...resolvePorts(spec.placement, spec.size, spec.ports));
    }
  }

  const jobThemes = jobs.map((job) => input.themeForNode(job.nodePath));
  const groups = new Map<string, number[]>();
  for (const [i, t] of jobThemes.entries()) {
    const bucket = groups.get(t.id);
    if (bucket === undefined) groups.set(t.id, [i]);
    else bucket.push(i);
  }
  const deal: BuildingMaterials[] = new Array(jobs.length) as BuildingMaterials[];
  for (const [themeKey, indices] of groups) {
    const groupTheme = jobThemes[indices[0] as number] as MaterialTheme;
    void themeKey;
    const groupDeal = assignMaterials(groupTheme, indices.length, input.themeSeed);
    for (const [k, jobIndex] of indices.entries()) {
      deal[jobIndex] = groupDeal[k] as BuildingMaterials;
    }
  }

  const themed = jobs.map((job, i) => {
    const scoped = compilerIntentFor(input.intents, job.nodePath);
    const ornament = fanOut<number>(STRUCTURE_ROWS.ornamentDensity, scoped, {
      nodePath: job.nodePath,
      today: DEFAULT_ORNAMENT_DENSITY,
    });
    const declared =
      typeof job.params.windowRhythm === "string"
        ? job.params.windowRhythm
        : archetypeFacadeDefaults(resolveArchetype(job.params.archetype)).windowRhythm;
    const rhythm = fanOut<string | undefined>(STRUCTURE_ROWS.windowRhythm, scoped, {
      nodePath: job.nodePath,
      today: declared,
    });
    const withRhythm =
      declared !== undefined || rhythm === undefined ? job.params : { ...job.params, windowRhythm: rhythm };
    return {
      ...job,
      params: ornament === DEFAULT_ORNAMENT_DENSITY ? withRhythm : { ...withRhythm, ornamentDensity: ornament },
      materials: deal[i] as BuildingMaterials,
      theme: jobThemes[i] as MaterialTheme,
    };
  });

  const jobTags = new Map(jobs.map((job) => [job.nodePath, job.tags] as const));
  const buildings = buildBuildings(themed, input.plan, input.stack);
  const ruinField = buildRuinField(
    input.plan.region,
    buildings.built,
    new Map(
      themed.map(
        (job) => [job.nodePath, typeof job.params.decay === "number" ? job.params.decay : 0] as const,
      ),
    ),
  );

  return {
    built: buildings.built,
    blocks: buildings.blocks,
    diagnostics: buildings.diagnostics,
    deal,
    jobTags,
    buildingPaths: new Set(buildingPaths),
    precinctPorts,
    themed,
    ruinField,
  };
}

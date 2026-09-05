/**
 * The compiler pass that turns authored programs into blocks.
 *
 * Both invocation modes end here, and both end the same way: a run's node-local
 * voxels are resolved against the pinned block registry, offset to the site the
 * solver (landmark) or the placer (plugin) chose, and handed back as ordinary
 * {@link StructureBlock}s — so the structure pass, the emit and the physics
 * lint never learn that a model wrote this one.
 *
 * Order of business per node:
 *
 * 1. `sourceHash` (`E333`) — refuse a document whose source has been edited
 *    since the gate signed it.
 * 2. `outputHash` (`E334`) — re-execute the verification set and compare. Code
 *    is the canonical artifact; a stored expansion would be a cache only.
 * 3. Run the placed instances, confined to their envelopes, dropping any that
 *    fail whole, and applying the quarter rule to a plugin node.
 * 4. Lower to blocks and publish the anchors as §7.3 markers.
 */

import {
  type AuthoredProgramRecord,
  type LoamDiagnostic,
  type ProgramScatterParams,
  type SeatDecision,
} from "@terrainist/spec/ir";
import {
  DEFAULT_EMBED_DEPTH,
  error,
  explicitSeatOfParams,
  hoverOfParams,
  note,
  warning,
} from "@terrainist/spec/ir";
import type { ProgramTheme } from "@terrainist/spec/ir";
import { nodeSeed, type Marker } from "@terrainist/stdlib";

import type { Rect } from "../layout/frames.js";
import type { OccupancyGrid } from "../layout/types.js";
import type { StructureBlock } from "../structures/buildings.js";
import type { ColumnPlan } from "../terrain/columns.js";
import { parseBlockString } from "../emit/blockstring.js";
import type { PrismarineStack } from "../emit/prismarine.js";
import { furnishRunInteriors } from "./interiors.js";
import type { GroundDriver } from "../layout/ground-driver.js";
import type { StreetDatum } from "../layout/street-datum.js";
import { materialThemeById, programThemeOf } from "./theme.js";
import {
  decideProgramSite,
  paintProgramSite,
  siteIsWet,
  siteWaterLine,
  underpinProgramInstance,
  type ProgramSiteTreatment,
} from "./site-treatment.js";
import { invokeLandmark, invokePlugin } from "./invoke.js";
import { facingRotationAt, type ProgramFacing } from "./facing.js";
import {
  conformSeatPlane,
  frontColumnOf,
  planProgramSites,
  type ProgramSite,
  type SiteRefusals,
} from "./place.js";
import { rotateRun, rotatedHeightAt, type ProgramRotation } from "./rotate.js";
import { checkSourceHash, type HeightSampler, type ProgramRun } from "./run.js";
import { verifyConformHash, verifyOutputHash } from "./verify.js";

/**
 * `target.push(...source)` passes every element as a call argument, and a
 * colossal landmark's block list is longer than V8's argument budget (~125k)
 * — the mistwood citadel killed the whole compile that way, in one spread.
 * Program output is the one place the compiler appends an array whose length
 * a model chooses, so it is appended by loop, never by spread.
 */
function appendAll<T>(target: T[], source: readonly T[]): void {
  for (const item of source) target.push(item);
}

/** Where a landmark program was placed by the solver. */
export interface ProgramPlacement {
  /** World footprint, inclusive; matches the program's declared `[w, d]`. */
  readonly footprint: Rect;
  /**
   * The plane the instance seats on: node-local `y = 0` when it hovers, the
   * ground plane when it does not (see {@link ProgramSite.baseY}).
   */
  readonly baseY: number;
  /** True when the landmark floats: it claims no ground under it. */
  readonly hovering?: boolean;
  /** How a non-hovering landmark meets the ground. Defaults to `"pad"`. */
  readonly seat?: SeatDecision;
  /**
   * True when {@link ProgramPlacement.seat} is the seat the **document** wrote
   * rather than the one `seatOfParams` defaulted to.
   *
   * The verdict-aware default (§2.2) needs the distinction and a resolved
   * `SeatDecision` cannot carry it: an author who wrote `"seat": "pad"` and an
   * author who wrote nothing produce the same value. Set this and a written
   * `pad` wins over a `conform` verdict, which is what "an explicit seat always
   * wins" means; leave it and a plain default `pad` defers to the verdict.
   */
  readonly seatExplicit?: boolean;
  /**
   * The quarter turn this landmark stands at (`facing.ts`), or absent for the
   * programs that declared no front and are therefore never turned.
   *
   * Already spent: the `footprint` above is the *turned* box, because the turn
   * had to be known before anything reserved a site for it.
   */
  readonly rotation?: ProgramRotation;
}

/** One authored-program node the compiler is asked to build. */
export interface ProgramJob {
  readonly nodePath: string;
  readonly programId: string;
  readonly program: AuthoredProgramRecord;
  readonly mode: "landmark" | "plugin";
  /** Landmark mode: the site the solver reserved. */
  readonly placement?: ProgramPlacement;
  /** Plugin mode: the `scatter.program@0` params. */
  readonly params?: ProgramScatterParams;
  /** Plugin mode: how each instance meets the ground. Defaults to `"pad"`. */
  readonly seat?: SeatDecision;
  /**
   * Plugin mode: the relation every instance turns by, one target and one
   * sense for the node, resolved per instance against where that instance
   * actually stands (`facing.ts`). Absent for a program with no front.
   */
  readonly facing?: ProgramFacing;
  readonly seedSalt?: string;
}

/** Everything {@link buildPrograms} reads. */
export interface ProgramPassInput {
  readonly jobs: readonly ProgramJob[];
  readonly plan: ColumnPlan;
  readonly stack: PrismarineStack;
  readonly worldSeed: bigint;
  readonly occupancy?: OccupancyGrid;
  /** Footprints already claimed by earlier passes. */
  readonly reserved?: readonly Rect[];
  /**
   * The world's resolved material theme id, for furnishing declared interiors.
   *
   * Absent, the fit-out picks a theme from its own seed — which is a different
   * theme per instance and agrees with nothing else in the world. Every other
   * caller of `pickTheme` passes the resolved id; this one has to as well.
   */
  readonly themeId?: string;
  /**
   * The pipeline's ground driver, for the pads a plugin's sites are given.
   *
   * §3.12 wrote the authored-program pass out of the contract's inventory
   * because it had no pad worth arbitrating; it has three now (pad, apron,
   * skirt), and a levelled plugin site that never declared would be exactly the
   * invisible ground write the contract exists to abolish. Absent for the
   * callers that are not the world pipeline — the gate, the terrarium, the
   * exhibits — which have no driver to accumulate into.
   */
  readonly ground?: GroundDriver;
  /**
   * Skip the `E334` re-execution. Only for a caller that has already verified
   * this document in this process — never for a compile from a file.
   */
  readonly skipOutputHash?: boolean;
  /**
   * The quarters' street datums — 8E's bespoke-site client of F1 (§1.6).
   *
   * Forwarded straight to {@link planProgramSites}, which is where a site's
   * plane is chosen. A **solved** landmark is deliberately not tied here: its
   * plane comes from the layout solver's placement, and tying that is the lot's
   * own branch in `layDistrict` (8B/8C), not a second answer computed downstream
   * of it. Absent on a quarter with no street graph, which grades no datum.
   */
  readonly datums?: readonly (StreetDatum | undefined)[];
}

/** One instance that stands in the world. */
export interface PlacedProgram {
  readonly nodePath: string;
  readonly programId: string;
  readonly index: number;
  readonly footprint: Rect;
  /** World Y of the instance's node-local `y = 0`, after seating. */
  readonly baseY: number;
  /** True when this instance floats — nothing may treat its footprint as taken. */
  readonly hovering?: boolean;
  readonly blockCount: number;
  readonly seatY: number;
  readonly name: string;
}

/** What the pass produced. */
export interface ProgramPassResult {
  readonly blocks: readonly StructureBlock[];
  /** Anchors published as §7.3 markers, `"<nodePath>#<anchor>"`. */
  readonly markers: readonly Marker[];
  readonly placed: readonly PlacedProgram[];
  readonly diagnostics: readonly LoamDiagnostic[];
  /** Fuel spent across every instance of every job. */
  readonly fuelUsed: number;
}

/* -------------------------------------------------------------------------- */
/* WP-G6 §7.1 — the pass, cut in two                                          */
/* -------------------------------------------------------------------------- */

/**
 * One job, **sited and claimed**, waiting for its run.
 *
 * The authored-program pass is the last
 * `prop.pad` declarer there is, and it runs at 5f — a hundred passes after the
 * fifth resolve sealed the ground. Under `GROUND_V1_FREEZE` that is not a
 * late claim, it is an illegal one: a tier-D intent arriving after tier E has
 * been read is exactly the non-prefix prefix `AccumulatingDriver` throws on.
 *
 * So the pass is cut where the structure pass was cut at WP-G5 — siting and
 * claims above, execution below — and this is the plan carried across the cut.
 * Everything on it was decided against `view("D")`: the resolved ground of
 * tiers A through C, which is what a tier-D declarer is entitled to read.
 */
export interface DeclaredProgramJob {
  readonly job: ProgramJob;
  /** How it meets the ground, or `undefined` when it hovers. */
  readonly seat: SeatDecision | undefined;
  readonly sites: readonly ProgramSite[];
  /**
   * One entry per site, positionally: the pad and apron that site is owed, or
   * `undefined` where it is owed none — flat enough, wet, or not `"pad"`-seated.
   */
  readonly treatments: readonly (ProgramSiteTreatment | undefined)[];
}

/** What {@link declarePrograms} decided, for {@link executePrograms} to build. */
export interface ProgramDeclaration {
  readonly jobs: readonly DeclaredProgramJob[];
  readonly diagnostics: readonly LoamDiagnostic[];
  /**
   * The running `taken` list the siting read, as it stood when the last job was
   * sited. Carried so the execution half does not re-derive it and cannot
   * disagree with the siting about what was already spoken for.
   */
  readonly claimed: readonly Rect[];
}

/**
 * **The declaring half** (§7.1): site every job, and file every `prop.pad`.
 *
 * Called at pass 5b, between `declareStructures` and the freeze, over a plan
 * whose ground arrays are `driver.view("D")`. It writes no block and no level;
 * the only thing it does to the world is `driver.commit`.
 *
 * One knowing difference from {@link buildPrograms}' interleaved order, and it
 * is inherent in cutting the pass: a later job's siting sees every earlier
 * job's **sites** rather than its successfully executed instances, because the
 * execution has not happened yet. That is a superset — the instances that drop
 * are the ones a run refused — so the later job is sited around slightly more
 * than it needs to be, never less. Flag-off the interleaved order is untouched.
 */
export function declarePrograms(input: ProgramPassInput): ProgramDeclaration {
  const diagnostics: LoamDiagnostic[] = [];
  const claimed: Rect[] = [...(input.reserved ?? [])];
  const jobs: DeclaredProgramJob[] = [];
  for (const job of input.jobs) {
    const declared = declareJob(job, input, claimed, diagnostics, true);
    if (declared === undefined) continue;
    jobs.push(declared);
    const driver = input.ground;
    if (driver === undefined) continue;
    for (const treatment of declared.treatments) {
      if (treatment !== undefined && treatment.intents.length > 0) driver.commit(treatment.intents);
    }
  }
  return { jobs, diagnostics, claimed };
}

/**
 * **The building half** (§7.1): lay every treatment and run every instance.
 *
 * Runs at 5f over the *real* plan, whose ground is the fifth resolve's — which
 * is the point of the cut. `api.heightAt` now shows a program the ground it
 * will actually stand on, pad included, rather than the ground that was there
 * before its own pad was arbitrated; under the mixture that was true only
 * because the pad wrote through, and under the freeze nothing writes through.
 */
export function executePrograms(
  input: ProgramPassInput,
  declaration: ProgramDeclaration,
): ProgramPassResult {
  const blocks: StructureBlock[] = [];
  const markers: Marker[] = [];
  const placed: PlacedProgram[] = [];
  const diagnostics: LoamDiagnostic[] = [...declaration.diagnostics];
  const claimed: Rect[] = [...declaration.claimed];
  const theme: ProgramTheme = programThemeOf(materialThemeById(input.themeId));
  let fuelUsed = 0;
  for (const declared of declaration.jobs) {
    fuelUsed += runJob(declared, input, {
      blocks,
      markers,
      placed,
      diagnostics,
      claimed,
      theme,
      claimSites: false,
    });
  }
  return { blocks, markers, placed, diagnostics, fuelUsed };
}

/**
 * Build every authored-program node, in document order.
 *
 * The **uncut** path: declaration and execution interleaved per job, exactly as
 * the pass has always run them. This is what every caller outside the world
 * pipeline uses (the gate, the terrarium, the exhibits) and what the pipeline
 * itself used before the freeze, which is what keeps the
 * control state byte-identical.
 */
export function buildPrograms(input: ProgramPassInput): ProgramPassResult {
  const blocks: StructureBlock[] = [];
  const markers: Marker[] = [];
  const placed: PlacedProgram[] = [];
  const diagnostics: LoamDiagnostic[] = [];
  const claimed: Rect[] = [...(input.reserved ?? [])];
  let fuelUsed = 0;
  // One theme for every instance of every job in this document — the same one
  // the buildings around them were dealt from. Themeless callers (the gate, the
  // terrarium) get the pinned verification theme, which is what `outputHash`
  // was computed against.
  const theme: ProgramTheme = programThemeOf(materialThemeById(input.themeId));

  for (const job of input.jobs) {
    const declared = declareJob(job, input, claimed, diagnostics, false);
    if (declared === undefined) continue;
    const driver = input.ground;
    if (driver !== undefined) {
      for (const treatment of declared.treatments) {
        if (treatment !== undefined && treatment.intents.length > 0)
          driver.commit(treatment.intents);
      }
    }
    fuelUsed += runJob(declared, input, {
      blocks,
      markers,
      placed,
      diagnostics,
      claimed,
      theme,
      claimSites: true,
    });
  }

  return { blocks, markers, placed, diagnostics, fuelUsed };
}

/**
 * Site one job and decide what its sites are owed. Declares nothing and writes
 * nothing — the caller commits, so the two halves can commit at two different
 * times. `undefined` when the job contributes no instance at all.
 *
 * `claimSites` is the split path's substitute for the interleaved order's
 * `claimed.push` inside the execution loop: with no execution to push, the
 * sites themselves are what a later job is sited around.
 */
function declareJob(
  job: ProgramJob,
  input: ProgramPassInput,
  claimed: Rect[],
  diagnostics: LoamDiagnostic[],
  claimSites: boolean,
): DeclaredProgramJob | undefined {
  const hashProblem = checkSourceHash(job.programId, job.program, job.nodePath);
  if (hashProblem !== undefined) {
    diagnostics.push(hashProblem);
    return undefined;
  }
  if (input.skipOutputHash !== true) {
    const mismatch = verifyOutputHash(job.programId, job.program, input.worldSeed, job.nodePath);
    if (mismatch !== undefined) {
      diagnostics.push(mismatch);
      return undefined;
    }
    // The terrain suite's sibling check, and a no-op for every document that
    // predates the verdict: `verifyConformHash` returns immediately when the
    // record carries no `conformHash` (GROUND-UNIFICATION §2.6).
    const drift = verifyConformHash(job.programId, job.program, input.worldSeed, job.nodePath);
    if (drift !== undefined) {
      diagnostics.push(drift);
      return undefined;
    }
  }

  const seat = seatOf(job);
  // §2.5's compile-report half: "this instance is on a platform because its
  // program did not conform" is the sentence a walker needs and cannot
  // otherwise get. Only for a record the gate actually judged — a document
  // with no verdict says nothing, because nothing was measured.
  if (job.program.conforms === false && seat?.policy === "pad") {
    diagnostics.push(
      note(
        "PROGRAM_SEATED_PAD",
        job.nodePath,
        `${JSON.stringify(job.programId)} writes the same sole on every column, so it is seated on a levelled pad rather than on the real ground`,
        "no change needed here — the fix is in the program: read api.heightAt at every column it touches and answer it, and the next authoring run will seat it on the ground itself",
      ),
    );
  }
  const refusals: SiteRefusals = { cliff: 0 };
  const sites = resolveSites(job, input, claimed, refusals, seat);
  if (refusals.cliff > 0) {
    diagnostics.push(
      warning(
        "PROGRAM_DROPPED",
        job.nodePath,
        `${refusals.cliff} candidate site${refusals.cliff === 1 ? "" : "s"} for ${JSON.stringify(job.programId)} ${refusals.cliff === 1 ? "was" : "were"} refused: the ground under them falls away like a cliff, and no pad would seat a structure across that`,
        "widen the scatter's area, or accept fewer instances — rough ground is padded, but a cliff is not ground a landmark stands on",
      ),
    );
  }
  if (sites.length === 0) {
    // Warning, not an error (Kai, 2026-08-15; LOAM-SPEC §15.2 gate leniency):
    // a program that finds no acceptable site is the W337 PROGRAM_DROPPED
    // pattern — reported, absent from the world, never fatal. The world
    // emitted anyway, so an error here only lied about the exit status.
    diagnostics.push(
      warning(
        "PROGRAM_DROPPED",
        job.nodePath,
        `no site would take ${JSON.stringify(job.programId)}; it is absent from the world`,
        // The water clause is the P5 sea-monster lesson: a water- or
        // shore-seated program needs water in reach, and no amount of
        // loosening on land will seat one inland. Default chosen under the
        // never-wait rule, 2026-08-14; revisit on walk evidence.
        "loosen the placement — a larger area, a smaller spacing, or a gentler maxSlope — or shrink the program's declared envelope; and if the program is seated on water or a shore, put its area where there is water in reach, because no land site will take it",
      ),
    );
    return undefined;
  }
  // Asking for eighteen and getting one is not a placement detail, it is the
  // world missing most of what the prompt asked for. The invasion world
  // shipped one crop circle where the document said eight and nothing said
  // so — the count is a request, and a request the compiler cannot meet has
  // to be reported rather than quietly rounded down.
  const wanted = job.params?.count;
  if (wanted !== undefined && sites.length < wanted) {
    diagnostics.push(
      warning(
        "PROGRAM_DROPPED",
        job.nodePath,
        `${JSON.stringify(job.programId)} asked for ${wanted} instance${wanted === 1 ? "" : "s"} and only ${sites.length} site${sites.length === 1 ? "" : "s"} would take one`,
        `the area cannot hold that many at this spacing: widen "area", lower "spacing" below ${Math.max(1, (job.params?.spacing ?? 1) - 1)}, relax "maxSlope"/"avoidTags", or ask for fewer`,
      ),
    );
  }

  // The pad and its apron go down *before* the run, so `api.heightAt` shows
  // the program the ground it will actually stand on rather than the ground
  // that was there first. Fill-only, exactly as a prop's pad is, and declared
  // to the ground driver rather than written behind its back.
  //
  // `"pad"` only: a `wade` instance stands on the seabed, a `drape` one has
  // already conformed itself through `api.heightAt`, an `embed` one is
  // *supposed* to be in the hillside, and a hovering one claims no ground at
  // all (`seatOf` returns `undefined` for it).
  const treatments: (ProgramSiteTreatment | undefined)[] = [];
  for (const site of sites) {
    treatments.push(
      seat?.policy !== "pad" || siteIsWet(input.plan, site.footprint)
        ? undefined
        : decideProgramSite({
            plan: input.plan,
            footprint: site.footprint,
            baseY: site.baseY,
            source: `${job.nodePath}#pad@${site.index}`,
            ...(input.ground === undefined ? {} : { ground: input.ground }),
          }),
    );
  }

  if (claimSites) {
    for (const site of sites) if (!isHovering(job)) claimed.push(site.footprint);
  }
  return { job, seat, sites, treatments };
}

/** The mutable sinks {@link runJob} appends one job's output to. */
interface RunSink {
  readonly blocks: StructureBlock[];
  readonly markers: Marker[];
  readonly placed: PlacedProgram[];
  readonly diagnostics: LoamDiagnostic[];
  readonly claimed: Rect[];
  readonly theme: ProgramTheme;
  /** False when {@link declareJob} already claimed the sites (the split path). */
  readonly claimSites: boolean;
}

/** Lay one declared job's treatments, run its instances, and place them. */
function runJob(declared: DeclaredProgramJob, input: ProgramPassInput, sink: RunSink): number {
  const { job, seat, sites, treatments } = declared;
  const { blocks, markers, placed, diagnostics, claimed, theme } = sink;

  for (const treatment of treatments) {
    if (treatment === undefined) continue;
    appendAll(blocks, paintProgramSite(input.plan, treatment, input.ground === undefined));
  }

  const runs = executeSites(job, input, sites, diagnostics, theme);
  if (!runs.ok) return runs.fuelUsed;

  let clampedFluid = 0;
  let residual: ConformResidual = { occupied: 0, underpinned: 0, buried: 0 };
  for (const [i, executed] of runs.runs.entries()) {
    const site = sites[i] as ProgramSite;
    // Out of the sandbox and into the world frame. Everything below — the
    // blocks, the anchors, the interiors the fit-out furnishes — is the
    // turned instance; the hashes on `run` are deliberately left in the frame
    // the program was verified in (see `rotate.ts`).
    const run = rotateRun(executed, site.rotation ?? 0, job.program.envelope);
    const baseY = seatedBaseY(site, run, seat);
    // Only an instance that stands in water is held to the waterline: a
    // fountain on a hill is a fountain, and a dry site's fluid is its own
    // business (the physics lint still refuses an unstable one).
    const inWater = seat?.policy === "wade" || siteIsWet(input.plan, site.footprint);
    const lowered = lowerRun(
      run,
      site,
      baseY,
      input.stack,
      job,
      diagnostics,
      inWater ? siteWaterLine(input.plan, site.footprint) : undefined,
    );
    if (lowered === undefined) continue;
    clampedFluid += lowered.clampedFluid;
    // A hovering instance stands over the ground, not on it: the ground
    // beneath stays buildable, so its footprint is never claimed.
    if (sink.claimSites && !isHovering(job)) claimed.push(site.footprint);
    appendAll(blocks, lowered.blocks);
    // The foundation, after the run: only the finished instance knows which
    // columns it actually stands in, and a leg over a dip is the daylight
    // this fills. Skipped for the seats that are not standing on land.
    // `"conform"` joins `"pad"` here, and for a conforming instance this is
    // the *only* ground courtesy left (§2.7.3): no pad, no apron, just a
    // foundation under exactly the columns that would otherwise hang in the
    // air. A program that conformed perfectly gets zero blocks from it.
    if (
      (seat?.policy === "pad" || seat?.policy === "conform") &&
      !siteIsWet(input.plan, site.footprint)
    ) {
      const skirt = underpinProgramInstance({
        plan: input.plan,
        stack: input.stack,
        blocks: lowered.blocks,
        // The run's own seat course, in world Y: `seatedBaseY` put the
        // program's `seatY` plane exactly on the site's ground plane.
        seatPlane: site.baseY,
        plinth: theme.ground.plinth,
      });
      appendAll(blocks, skirt);
      if (seat.policy === "conform")
        residual = tallyResidual(residual, input.plan, lowered.blocks, skirt);
    }
    // v2: the shell is the program's, the fit-out inside it is the grammar's.
    appendAll(blocks, furnishRunInteriors({ run, site, baseY, stack: input.stack, worldSeed: input.worldSeed, nodePath: job.nodePath, ...(input.themeId === undefined ? {} : { themeId: input.themeId }), ...(job.seedSalt === undefined ? {} : { seedSalt: job.seedSalt }) }));
    appendAll(markers, lowered.markers);
    placed.push(lowered.placed);
  }

  // §2.8 — the number §2.9's carve is gated on, once per node.
  if (seat?.policy === "conform" && residual.occupied > 0) {
    const pct = (n: number): string => `${Math.round((n / residual.occupied) * 100)}%`;
    diagnostics.push(
      note(
        "PROGRAM_CONFORM_RESIDUAL",
        job.nodePath,
        `${JSON.stringify(job.programId)} conformed to the ground it was given: of ${residual.occupied} occupied column${residual.occupied === 1 ? "" : "s"}, ${residual.underpinned} (${pct(residual.underpinned)}) needed a skirt under them and ${residual.buried} (${pct(residual.buried)}) are buried in the hill`,
        "no change needed — a skirted column is a leg the compiler footed, and a buried one is ground standing above the seat plane, which only the program's own answer or a carve can help",
      ),
    );
  }

  if (clampedFluid > 0) {
    diagnostics.push(
      warning(
        "PROGRAM_WATER_CLAMPED",
        job.nodePath,
        `${JSON.stringify(job.programId)} wrote ${clampedFluid} fluid block${clampedFluid === 1 ? "" : "s"} above the waterline of the body it stands in; they were dropped and the sea kept its own surface`,
        "a wading program's node-local y = 0 is the SEABED, not the waterline, so it cannot know how deep the water over it is: model the seabed and whatever breaks the surface, and let the world's own water fill the gap",
      ),
    );
  }
  return runs.fuelUsed;
}

/**
 * How this job meets the ground, or `undefined` when it does not: a hovering
 * landmark has no seating decision to make, and `seatY` must never lower it
 * into the terrain — `hover` means "node-local `y = 0` sits `hover` blocks
 * above the highest ground", full stop, so its baseY is used exactly as
 * `planHoverSite` computed it.
 */
function seatOf(job: ProgramJob): SeatDecision | undefined {
  if (isHovering(job)) return undefined;
  const supplied = job.placement?.seat ?? job.seat;
  // An explicit seat always wins (§2.2). A *supplied* one is only explicit when
  // it says something the default does not: the callers that resolve a seat for
  // us hand back `seatOfParams`, whose answer for a document that named no seat
  // is the same `pad` a document that asked for `pad` gets. So a plain default
  // `pad` falls through to the verdict, and everything else is honoured.
  if (job.placement?.seatExplicit === true && supplied !== undefined) return supplied;
  if (supplied !== undefined && !isDefaultSeat(supplied)) return supplied;
  const written = explicitSeatOfParams(job.params);
  if (written !== undefined) return written;
  // The verdict, and nothing else: a record the gate certified as conforming
  // is run against the real ground; a record with `conforms: false` or with no
  // verdict at all — which is every archived document — gets today's pad and
  // is byte-identical.
  return job.program.conforms === true
    ? { policy: "conform", embedDepth: DEFAULT_EMBED_DEPTH }
    : { policy: "pad", embedDepth: DEFAULT_EMBED_DEPTH };
}

/** What §2.8 reports: what a conforming instance left the compiler to do. */
interface ConformResidual {
  /** Columns the instance occupies, over every instance of the node. */
  readonly occupied: number;
  /** Of those, the ones the skirt had to foot — daylight the program left. */
  readonly underpinned: number;
  /** Of those, the ones whose highest block is at or under the ground. */
  readonly buried: number;
}

/** Fold one instance's columns into the node's running residual. */
function tallyResidual(
  running: ConformResidual,
  plan: ColumnPlan,
  blocks: readonly StructureBlock[],
  skirt: readonly StructureBlock[],
): ConformResidual {
  const top = new Map<string, number>();
  for (const b of blocks) {
    const key = `${b.x},${b.z}`;
    const known = top.get(key);
    if (known === undefined || b.y > known) top.set(key, b.y);
  }
  const footed = new Set<string>();
  for (const b of skirt) footed.add(`${b.x},${b.z}`);
  const { region } = plan;
  let buried = 0;
  for (const [key, highest] of top) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    const i = x - region.x0;
    const j = z - region.z0;
    if (i < 0 || j < 0 || i >= region.width || j >= region.depth) continue;
    if (highest <= (plan.ground[j * region.width + i] as number)) buried += 1;
  }
  return {
    occupied: running.occupied + top.size,
    underpinned: running.underpinned + footed.size,
    buried: running.buried + buried,
  };
}

/** True for the seat `seatOfParams` invents when the document named none. */
function isDefaultSeat(seat: SeatDecision): boolean {
  return seat.policy === "pad" && seat.embedDepth === DEFAULT_EMBED_DEPTH;
}

/**
 * True when this job's instances float.
 *
 * One answer for both modes: a landmark carries the decision on its solved
 * placement, a `scatter.program@0` carries it in its params, and everything
 * downstream — the pad, the seating, the claim, the `PlacedProgram` flag —
 * asks this rather than re-deriving it.
 */
function isHovering(job: ProgramJob): boolean {
  if (job.placement?.hovering === true) return true;
  return job.mode === "plugin" && hoverOfParams(job.params) !== undefined;
}

/**
 * The world Y of the instance's node-local `y = 0`.
 *
 * The program declares `seatY`: the node-local plane that meets the ground. So
 * the ground plane the site chose is where `seatY` has to land, and everything
 * the program modelled *below* its seat — landing gear, a hull skirt, a buried
 * belly — goes below the surface instead of hanging in the air over it.
 *
 * - hovering: no seating at all (see {@link seatOf}).
 * - `"drape"`: neither pad nor re-seat; the program conformed itself through
 *   `api.heightAt` and moving it would undo that.
 * - `"embed"`: seated, then sunk `embedDepth` further. Nothing is cut; the
 *   terrain simply stands over the buried part, which is what *crashed* means.
 * - `"wade"`: seated exactly as `"pad"` is — but on the seabed, and with no pad
 *   under it (see `buildPrograms`, which lays a pad for `"pad"` alone). How much
 *   of the thing ends up under water is decided by its own height against the
 *   sea, which is what makes *half-submerged* a fact rather than a description.
 */
function seatedBaseY(
  site: ProgramSite,
  run: ProgramRun,
  seat: SeatDecision | undefined,
): number {
  if (seat === undefined || seat.policy === "drape") return site.baseY;
  const seatY = run.result?.seatY ?? 0;
  const sunk = seat.policy === "embed" ? seat.embedDepth : 0;
  return site.baseY - seatY - sunk;
}

function resolveSites(
  job: ProgramJob,
  input: ProgramPassInput,
  claimed: readonly Rect[],
  refusals: SiteRefusals,
  seat: SeatDecision | undefined,
): readonly ProgramSite[] {
  if (job.mode === "landmark") {
    if (job.placement === undefined) return [];
    const rotation = job.placement.rotation;
    const footprint = job.placement.footprint;
    // A conforming landmark seats on its front anchor's own column plus one,
    // not on the median plane the solver handed down (§2.7.2). Nothing else
    // about the placement moves.
    const baseY =
      seat?.policy === "conform"
        ? conformSeatPlane(
            input.plan,
            footprint,
            rotation === undefined
              ? undefined
              : frontColumnOf(footprint, rotation, job.program.envelope),
          ) ?? job.placement.baseY
        : job.placement.baseY;
    return [
      {
        index: 0,
        footprint,
        baseY,
        ...(rotation === undefined || rotation === 0 ? {} : { rotation }),
      },
    ];
  }
  if (job.params === undefined) return [];
  const facing = job.facing;
  return planProgramSites({
    params: job.params,
    envelope: job.program.envelope,
    plan: input.plan,
    seed: nodeSeed(input.worldSeed, job.nodePath, job.seedSalt ?? ""),
    taken: claimed,
    refusals,
    ...(seat === undefined ? {} : { seat }),
    ...(input.occupancy === undefined ? {} : { occupancy: input.occupancy }),
    ...(facing === undefined
      ? {}
      : { rotationAt: (x: number, z: number): ProgramRotation => facingRotationAt(facing, { x, z }) }),
    ...(input.datums === undefined ? {} : { datums: input.datums }),
  });
}

function executeSites(
  job: ProgramJob,
  input: ProgramPassInput,
  sites: readonly ProgramSite[],
  diagnostics: LoamDiagnostic[],
  theme: ProgramTheme,
): { ok: boolean; runs: readonly ProgramRun[]; fuelUsed: number } {
  // The ground, in the frame the program asks about it: an instance that has
  // been turned still calls `api.heightAt` in its own unturned axes.
  const sampler = (index: number): HeightSampler => {
    const site = sites[index] as ProgramSite;
    return rotatedHeightAt(
      nodeLocalHeight(input.plan, site),
      site.rotation ?? 0,
      job.program.envelope,
    );
  };

  if (job.mode === "landmark") {
    const run = invokeLandmark({
      programId: job.programId,
      program: job.program,
      nodePath: job.nodePath,
      worldSeed: input.worldSeed,
      heightAt: sampler(0),
      theme,
      ...(job.seedSalt === undefined ? {} : { seedSalt: job.seedSalt }),
    });
    diagnostics.push(...run.diagnostics);
    return { ok: run.ok, runs: run.ok ? [run] : [], fuelUsed: run.fuelUsed };
  }

  const result = invokePlugin({
    programId: job.programId,
    program: job.program,
    nodePath: job.nodePath,
    worldSeed: input.worldSeed,
    count: sites.length,
    heightAtFor: sampler,
    theme,
    ...(job.seedSalt === undefined ? {} : { seedSalt: job.seedSalt }),
  });
  diagnostics.push(...result.diagnostics);
  return { ok: result.ok, runs: result.runs, fuelUsed: result.fuelUsed };
}

/** Node-local ground under one site: `heightAt(0, 0)` is the seating plane. */
export function nodeLocalHeight(plan: ColumnPlan, site: ProgramSite): HeightSampler {
  const { region } = plan;
  return (x: number, z: number): number => {
    const wx = site.footprint.x0 + x;
    const wz = site.footprint.z0 + z;
    const ix = wx - region.x0;
    const iz = wz - region.z0;
    if (ix < 0 || iz < 0 || ix >= region.width || iz >= region.depth) return 0;
    return (plan.ground[iz * region.width + ix] as number) - site.baseY;
  };
}

interface LoweredRun {
  readonly blocks: readonly StructureBlock[];
  readonly markers: readonly Marker[];
  readonly placed: PlacedProgram;
  /** Fluid voxels dropped for standing above the site's own waterline. */
  readonly clampedFluid: number;
}

/**
 * Fluid a program may not raise: the blocks that *are* a water body.
 *
 * Deliberately three names and not "anything waterloggable": a waterlogged
 * fence is a fence, and a program is entitled to build one wherever it likes.
 * What it is not entitled to do is stack the sea higher than the sea.
 */
const PROGRAM_FLUIDS = new Set(["water", "flowing_water", "bubble_column"]);

/**
 * Resolve one run's voxels against the registry and offset them to its site.
 *
 * A block the pinned registry does not know fails the **whole instance**: the
 * authoring gate already emitted this program through the same registry, so an
 * unresolvable block here means the document and this compiler disagree about
 * what Minecraft is, and half a landmark is not the answer to that.
 */
function lowerRun(
  run: ProgramRun,
  site: ProgramSite,
  baseY: number,
  stack: PrismarineStack,
  job: ProgramJob,
  diagnostics: LoamDiagnostic[],
  waterLine: number | undefined,
): LoweredRun | undefined {
  const blocks: StructureBlock[] = [];
  let clampedFluid = 0;
  // Sorted, so the block list is a pure function of the voxel set rather than
  // of the order the program happened to write them in.
  for (const key of [...run.voxels.keys()].sort(byColumnThenHeight)) {
    const [lx, ly, lz] = key.split(",").map(Number) as [number, number, number];
    const stateId = resolveBlock(stack, run.voxels.get(key) as string);
    if (stateId === undefined) {
      diagnostics.push(
        error(
          "PROGRAM_GATE_FAILED",
          job.nodePath,
          `instance ${run.index} of ${JSON.stringify(job.programId)} wrote ${JSON.stringify(run.voxels.get(key))}, which the pinned registry does not know`,
          "use full block strings the pinned registry knows, states included; the authoring gate checks this, so a failure here means the document was authored against a different Minecraft version",
        ),
      );
      return undefined;
    }
    const y = baseY + ly;
    // §the water law: an instance standing *in* a water body may model that
    // body — a wading monster is half sea — but never raise it. A fluid voxel
    // above the site's own surface is dropped, and the natural water the
    // terrain already put in the column is what remains.
    if (
      waterLine !== undefined &&
      y > waterLine &&
      PROGRAM_FLUIDS.has(stack.blockNameByStateId(stateId) ?? "")
    ) {
      clampedFluid += 1;
      continue;
    }
    blocks.push({
      x: site.footprint.x0 + lx,
      y,
      z: site.footprint.z0 + lz,
      stateId,
    });
  }

  const markers: Marker[] = [];
  const anchors = run.result?.anchors ?? {};
  for (const name of Object.keys(anchors).sort()) {
    const [ax, ay, az] = anchors[name] as readonly [number, number, number];
    markers.push({
      id: `${job.nodePath}#${name}${job.mode === "plugin" ? `.${run.index}` : ""}`,
      name,
      x: site.footprint.x0 + ax,
      y: baseY + ay,
      z: site.footprint.z0 + az,
    });
  }

  return {
    blocks,
    markers,
    placed: {
      nodePath: job.nodePath,
      programId: job.programId,
      index: run.index,
      footprint: site.footprint,
      baseY,
      ...(isHovering(job) ? { hovering: true } : {}),
      blockCount: blocks.length,
      seatY: run.result?.seatY ?? 0,
      name: run.result?.name ?? job.programId,
    },
    clampedFluid,
  };
}

function byColumnThenHeight(a: string, b: string): number {
  const pa = a.split(",").map(Number);
  const pb = b.split(",").map(Number);
  return (pa[1] as number) - (pb[1] as number)
    || (pa[2] as number) - (pb[2] as number)
    || (pa[0] as number) - (pb[0] as number);
}

/** `"minecraft:oak_stairs[facing=north,half=top]"` → a state id. */
export function resolveBlock(stack: PrismarineStack, block: string): number | undefined {
  const parsed = parseBlockString(block);
  if (parsed === undefined) return undefined;
  return stack.blockStateOf(parsed.name, parsed.props);
}

export { parseBlockString };


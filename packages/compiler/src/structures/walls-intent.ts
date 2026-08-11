/**
 * The fan-out row that puts a wall round a town — `intent.character.fortification`.
 *
 * ## Why this file exists
 *
 * Prose does not build walls. Two walked generations of "the Trojan horse in
 * Troy" carried `era: "ancient"`, `event: { kind: "siege", severity: 0.9 }` and
 * a kit checklist line asking in words for a city wall; the first came out with
 * no circuit at all, because a wall is a **structure** and the only way to ask
 * for one was to remember to write `params.walls` on the district. A model that
 * forgets is a model that ships an unwalled Troy, and steering it harder is a
 * strategy that has now failed twice.
 *
 * So the wall becomes a dial the compiler acts on. `character.fortification:
 * "walled"` and the settlement gets a circuit whether or not any node wrote a
 * parameter.
 *
 * ## What is *not* here
 *
 * A second wall builder. `infra.wall@0` already derives a support-hull course
 * round the settlement that actually got built, sweeps it over the real ground
 * with `follow: "step"`, finds its gates where a carriageway crosses the course
 * and stands a tower on every corner and at the pitch — every property the dial
 * needs. This file writes no geometry and no blocks: it decides **which node
 * gets a job, what it encloses, and what it is made of**, and hands that to
 * `structures/walls.ts`. Everything downstream of `WallJob` is the pass that
 * shipped, unchanged.
 *
 * ## The three laws this file keeps
 *
 * 1. **Total.** The row answers `ctx.today` for an intent that declares
 *    nothing, and `ctx.today` for a node nobody authored a wall on is
 *    `undefined` — no job, no wall, byte-identical world. A document with no
 *    `fortification` anywhere cannot tell this file exists.
 * 2. **The author outranks the dial.** A district that wrote `params.walls` is
 *    already speaking about its own fortification, and the dial does not
 *    second-guess it — not the style, not the margin, and not by adding a
 *    second ring around it. Same precedence `params.fabric` has over
 *    `character.urbanForm`.
 * 3. **One settlement, one circuit.** A settlement-scope `walled` rings the
 *    whole fabric once — the union of every district and city footprint and the
 *    buildings inside them — rather than putting a ring round each quarter. A
 *    quarter that declares `walled` *on its own node* rings that quarter, which
 *    is how a citadel inside an open town is said.
 *
 * ## Determinism
 *
 * Nothing here draws a random number, and neither does the pass it feeds: the
 * course is a pure function of the placement, the datum a pure function of the
 * course and the plan, the merlon parity a function of the path index. The one
 * seeded input in the neighbourhood is the material theme, which was dealt from
 * `hash(worldSeed, rootPath)` long before this row is asked and is simply read
 * here. So `hash(worldSeed, nodePath)` discipline is kept by having no draw to
 * seed.
 */

import {
  FORTIFICATIONS,
  warning,
  type EraClass,
  type LoamDiagnostic,
  type SemanticIntent,
} from "@terrainist/spec";
import type { MaterialTheme } from "@terrainist/stdlib";

import { fanOut, registerFanOut, type FanOutContext } from "../intent/fanout.js";
import { intentFor, type IntentResolution, type ResolvedIntent } from "../intent/resolve.js";

import type { CoursePoint } from "./wall-course.js";
import {
  WALL_DEFAULT_HEIGHT,
  WALL_DEFAULT_MARGIN,
  WALL_DEFAULT_TOWER_PITCH,
  extentOfRects,
  wallMaterialsOfTheme,
  type ExtentRect,
  type WallJob,
} from "./walls.js";

/** Row ids owned by the wall pass, so a caller never spells one as a string. */
export const WALL_ROWS = {
  fortification: "structures.fortification",
} as const;

/**
 * How far outside the fabric a *settlement-scope* circuit stands.
 *
 * Wider than {@link WALL_DEFAULT_MARGIN}, because this ring is drawn round the
 * whole town rather than round one quarter, and the belt of ground a town keeps
 * outside its wall — the pomerium, the approach roads' shoulders, the ditch
 * nobody dug — scales with the thing enclosed. Twelve columns is two carts
 * abreast plus a verge, which is what a gate needs to be approachable.
 */
export const FORTIFICATION_SETTLEMENT_MARGIN = 12;

/** Extra a candidate hands the row, beyond the dials. */
export interface FortificationExtra {
  /** `"settlement"` rings the whole fabric; `"quarter"` rings one node. */
  readonly scope: "settlement" | "quarter";
  /** What is being enclosed — corners only, which is all the hull reads. */
  readonly extent: readonly CoursePoint[];
  /** The settlement's material theme, already dealt. */
  readonly theme: MaterialTheme;
}

/**
 * `wallMaterialsOfTheme` used to live here, when the dial was its only caller.
 * It now lives beside the wall pass itself (`structures/walls.ts`) because the
 * **authored** path derives from the theme too — one function, two callers —
 * and is re-exported here so the dial's own readers still find it where the
 * doctrine above discusses it.
 */
export { wallMaterialsOfTheme };

/**
 * The wall style a fortified settlement of this era builds in.
 *
 * Only one era genuinely builds something other than masonry: a `primitive`
 * settlement rings itself with a timber palisade, because a stone curtain is
 * the thing that era does not have. Everything from `ancient` on is masonry,
 * and the *material* of that masonry is the theme's (see
 * {@link wallMaterialsOfTheme}) rather than the style table's, which is why
 * there is no renaissance or industrial branch here: a brick town and a
 * limestone town differ in their theme, not in their wall.
 */
export function fortificationStyle(era: EraClass): string {
  return era === "primitive" ? "palisade" : "masonry";
}

/** Register the wall pass's fan-out row. */
export function registerWallFanOut(): void {
  registerFanOut<WallJob | undefined>({
    id: WALL_ROWS.fortification,
    reads: ["character", "era"],
    status: "today",
    drives: "whether the settlement is ringed by `infra.wall@0`, and in what",
    resolve(intent: ResolvedIntent, ctx: FanOutContext<WallJob | undefined>) {
      // Law 2: an authored `params.walls` already produced a job for this node
      // and the dial does not touch it.
      if (ctx.today !== undefined) return ctx.today;
      if (intent.intent.character?.fortification !== "walled") return ctx.today;
      const extra = ctx.extra as unknown as FortificationExtra | undefined;
      if (extra === undefined || extra.extent.length === 0) return ctx.today;
      const style = fortificationStyle(intent.eraClass);
      return {
        nodePath: ctx.nodePath,
        style,
        // A palisade *is* its style table — logs, not the ground's masonry —
        // so it keeps it; a stone curtain takes the settlement's own stone.
        ...(style === "palisade"
          ? {}
          : { materials: wallMaterialsOfTheme(extra.theme) }),
        margin:
          extra.scope === "settlement" ? FORTIFICATION_SETTLEMENT_MARGIN : WALL_DEFAULT_MARGIN,
        towerPitch: WALL_DEFAULT_TOWER_PITCH,
        height: WALL_DEFAULT_HEIGHT,
        gates: true,
        extent: extra.extent,
      };
    },
  });
}

/* -------------------------------------------------------------------------- */
/* the candidate set                                                           */
/* -------------------------------------------------------------------------- */

/** A `district` or `city` child of the root, as this file needs to see it. */
export interface FabricNode {
  readonly nodePath: string;
  /** The node's own `intent`, if it declared one — *not* the resolved merge. */
  readonly declared?: SemanticIntent;
  /** The node's placed footprint, if the solver gave it one. */
  readonly rect?: ExtentRect;
  /** Every building the node owns, by node-path prefix. */
  readonly buildings: readonly ExtentRect[];
}

/** Everything {@link fortificationJobs} reads. */
export interface FortificationInput {
  readonly rootPath: string;
  readonly intents: IntentResolution;
  readonly theme: MaterialTheme;
  /** The jobs `wallJobsOf` already produced from `params.walls`. */
  readonly authored: readonly WallJob[];
  /** The settlement's fabric, in document order. */
  readonly fabric: readonly FabricNode[];
}

/** The jobs the wall pass should run, and what deciding them had to say. */
export interface FortificationResult {
  readonly jobs: readonly WallJob[];
  readonly diagnostics: readonly LoamDiagnostic[];
}

/**
 * Decide the wall pass's job list: what the author wrote, plus what the dial
 * asks for where the author was silent.
 *
 * Total: with no `fortification` anywhere the answer is `input.authored`, the
 * same array the pass has always been handed, in the same order.
 */
export function fortificationJobs(input: FortificationInput): FortificationResult {
  const diagnostics: LoamDiagnostic[] = [];
  const rootIntent = intentFor(input.intents, input.rootPath);
  const asked = walledScopes(input);

  // An unrecognised word is grounded here rather than silently dropped — the
  // same contract `character.urbanForm` and `character.ground` keep. It is a
  // warning, never an error: a classifier typo must not cost the whole intent.
  for (const scope of unknownFortifications(input)) {
    diagnostics.push(
      warning(
        "INTENT_FORTIFICATION_UNKNOWN",
        scope.nodePath,
        `intent.character.fortification names "${scope.word}", which is not a fortification — it is ignored, and the settlement keeps the walls it would have had`,
        `write one of: ${FORTIFICATIONS.join(", ")} — "walled" rings the settlement with a gated curtain wall`,
      ),
    );
  }

  // Law 2, stated as a report line rather than a silent no-op: the author's own
  // parameters won, and the walk that finds one ring instead of two should be
  // able to read why.
  if (input.authored.length > 0) {
    if (asked) {
      diagnostics.push(
        warning(
          "INTENT_FORTIFICATION_UNKNOWN",
          input.rootPath,
          `intent.character.fortification asks for a wall and ${input.authored.length} node(s) already declare "params.walls" — the authored walls are built and no second circuit is added`,
          'this is the intended precedence; delete "params.walls" if you want the dial to decide the wall, or leave it if the parameters are what you meant',
        ),
      );
    }
    return { jobs: input.authored, diagnostics };
  }

  // --- the settlement-scope circuit ---------------------------------------
  // Asked first, and it wins outright: a town says "walled" once and gets one
  // wall round the whole of itself, not one round each quarter.
  const fabricRects = input.fabric.flatMap((n) => (n.rect === undefined ? [] : [n.rect]));
  const settlementExtent = extentOfRects([
    ...fabricRects,
    ...input.fabric.flatMap((n) => [...n.buildings]),
  ]);
  const settlement = askRow(rootIntent, input.rootPath, {
    scope: "settlement",
    extent: settlementExtent,
    theme: input.theme,
  });
  if (settlement !== undefined) return { jobs: [settlement], diagnostics };

  // --- a quarter that speaks for itself ------------------------------------
  // Only a node that declared `fortification` on its *own* intent is offered:
  // an inherited "walled" was already answered above, at the scope that said
  // it, and offering it again here is what would produce the nested rings.
  const jobs: WallJob[] = [];
  for (const node of input.fabric) {
    if (node.declared?.character?.fortification === undefined) continue;
    const extent = extentOfRects([
      ...(node.rect === undefined ? [] : [node.rect]),
      ...node.buildings,
    ]);
    const job = askRow(intentFor(input.intents, node.nodePath), node.nodePath, {
      scope: "quarter",
      extent,
      theme: input.theme,
    });
    if (job !== undefined) jobs.push(job);
  }
  if (jobs.length > 0) return { jobs, diagnostics };

  // Asked for, and nothing to ring: no district, no city, or a fabric the
  // solver never placed. Silence here would be the defect this file exists to
  // end, one layer further in.
  if (asked && settlementExtent.length === 0) {
    diagnostics.push(
      warning(
        "INTENT_FORTIFICATION_UNKNOWN",
        input.rootPath,
        'intent.character.fortification is "walled" and this document has no placed district or city to ring — a wall encloses a fabric, and loose buildings are not one',
        "give the settlement a district node (or a city) with the buildings inside it; a wall is drawn round the quarter's footprint, not round a scatter of houses",
      ),
    );
  }
  return { jobs: input.authored, diagnostics };
}

/**
 * Ask the row once, with `today` = "no wall here" — which is the truth.
 *
 * Every decision goes through `fanOut`, which is what makes the byte-identity
 * proof total: clearing the registry (how the identity test takes the intent
 * layer out of the path) turns this into "no job", exactly as an undeclared
 * dial does.
 */
function askRow(
  intent: ResolvedIntent,
  nodePath: string,
  extra: FortificationExtra,
): WallJob | undefined {
  return fanOut<WallJob | undefined>(WALL_ROWS.fortification, intent, {
    nodePath,
    today: undefined,
    extra: extra as unknown as Readonly<Record<string, unknown>>,
  });
}

/** True when any scope on this document asks to be walled. */
function walledScopes(input: FortificationInput): boolean {
  if (intentFor(input.intents, input.rootPath).intent.character?.fortification === "walled") {
    return true;
  }
  return input.fabric.some(
    (n) => intentFor(input.intents, n.nodePath).intent.character?.fortification === "walled",
  );
}

/** Every scope whose `fortification` is a word the vocabulary does not carry. */
function unknownFortifications(
  input: FortificationInput,
): readonly { readonly nodePath: string; readonly word: string }[] {
  const out: { nodePath: string; word: string }[] = [];
  const seen = new Set<string>();
  const consider = (nodePath: string, declared: SemanticIntent | undefined): void => {
    const word = declared?.character?.fortification;
    if (word === undefined) return;
    if ((FORTIFICATIONS as readonly string[]).includes(word)) return;
    if (seen.has(word)) return;
    seen.add(word);
    out.push({ nodePath, word });
  };
  consider(input.rootPath, intentFor(input.intents, input.rootPath).intent);
  for (const node of input.fabric) consider(node.nodePath, node.declared);
  return out;
}

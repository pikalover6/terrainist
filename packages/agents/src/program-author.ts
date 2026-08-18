/**
 * Phase 3, authoring side: **bespoke program authoring**.
 *
 * The ratified contract (`docs/DESIGN.md` → *Upgrade push — Phase 0 contracts*
 * → *2. AuthoredProgram*) says one thing above all others about this file, and
 * it is the reason the file is shaped the way it is:
 *
 * > Luna performs measurably better **unchained** — writing its own generation
 * > code — than when guided through a curated tool vocabulary. **The API is the
 * > determinism boundary, not a creative vocabulary.**
 *
 * So {@link PROGRAM_AUTHOR_PROMPT} teaches `ProgramApi` verbatim, teaches the
 * rules that make a program safe to freeze into a document, and then **stops**.
 * There is no shape library here, no arch helper, no stair kit, no style guide,
 * no worked example of a good building. Every such addition is a leash on the
 * one thing the model is best at, and the prompt-content tests assert their
 * absence rather than trusting a reviewer to notice one creeping back in.
 *
 * What this module owns:
 *
 * 1. **Deciding what to write.** Explicit requests harvested from the
 *    document's `intent.character.programs` fields, or a proposal turn where
 *    the authoring model names what the world wants, bounded by the contract's
 *    area-scaled budget ({@link programBudget}).
 * 2. **Writing each program** with {@link AUTHORING_MODEL_ID} at max effort.
 * 3. **The bounded repair loop** — {@link MAX_PROGRAM_ROUNDS} rounds, gate
 *    diagnostics handed back verbatim, and a program that still cannot pass is
 *    **dropped with a note**. Never shipped broken: the world compiles without
 *    it, which is the contract's one-sentence invariant — *the document that
 *    reaches the compiler contains only authored programs that have already
 *    been executed, hashed and linted clean.*
 *
 * What it deliberately does not own: running the program. That is the injected
 * {@link ProgramVerificationGate}, built on the compiler side.
 */

import { formatDiagnostic, programSourceHash, type LoamDiagnostic } from "@terrainist/spec";

import {
  AUTHORING_MODEL_ID,
  AUTHORING_REASONING_EFFORT,
  AUTHORING_TEMPERATURE,
  PROGRAM_AUTHOR_MAX_TOKENS,
} from "./config.js";
import { loadOpenRouterKey } from "./env.js";
import { extractJson } from "./json.js";
import {
  type ProgramDocContext,
  type ProgramFreezeFields,
  type ProgramMode,
  type ProgramSubmission,
  type ProgramVerificationGate,
} from "./program-gate.js";
import { chatComplete, sumUsage, type ChatMessage, type FetchLike, type Usage } from "./openrouter.js";

/* -------------------------------------------------------------------------- */
/* Constants from the contract                                                */
/* -------------------------------------------------------------------------- */

/** Repair rounds a program gets before it is dropped (contract: bounded at 3). */
export const MAX_PROGRAM_ROUNDS = 3;

/** Source-size ceiling from the contract's limits table: 64 KiB per program. */
export const MAX_PROGRAM_SOURCE_BYTES = 64 * 1024;

/**
 * Per-world authoring spend stop, checked *before* each call.
 *
 * Not a tight bound at today's ~$0.03–0.07 per artifact. It exists so a world
 * degrades to stdlib rather than overrunning, and so it is never discovered to
 * be missing. Raised 0.50 → 1.00 with the centerpiece-first steering
 * (SHIP-PLAN F18): two or three landmarks with repair rounds must fit under
 * the stop, or the boldness the kit now asks for is silently truncated on a
 * bad day. Unit economics hold: the stop is a ceiling, not a typical spend,
 * and $5 buys three variations.
 */
export const DEFAULT_BESPOKE_BUDGET_USD = 1.0;

/** The area the budget rule is written against: one 512×512 region. */
const BUDGET_UNIT_AREA = 512 * 512;

/** What the area-scaling rule allows this world. */
export interface ProgramBudget {
  readonly landmarks: number;
  readonly plugins: number;
}

/**
 * The contract's budget rule, verbatim:
 *
 * ```
 * maxLandmarkPrograms = clamp(round(3 × A / 512²), 3, 12)
 * maxPluginPrograms   = clamp(round(3 × A / 512²), 3,  6)
 * ```
 *
 * Plugins cap lower because a landmark costs the compile one execution while a
 * plugin costs it every instance.
 */
export function programBudget(size: number): ProgramBudget {
  const area = Math.max(0, size) * Math.max(0, size);
  const scaled = Math.round((3 * area) / BUDGET_UNIT_AREA);
  return {
    landmarks: clamp(scaled, 3, 12),
    plugins: clamp(scaled, 3, 6),
  };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                    */
/* -------------------------------------------------------------------------- */

/** One bespoke program the world is asking for. */
export interface ProgramRequest {
  /** The `programs` map key and the `authored:<id>` suffix. */
  readonly id: string;
  readonly mode: ProgramMode;
  /** What it should be, in the author's own words. Reaches the prompt. */
  readonly brief: string;
  /** A suggested node-local `[w, h, d]`; the program may declare its own. */
  readonly envelope?: readonly [number, number, number];
  /** Plugin mode only: roughly how many instances the world wants. */
  readonly count?: number;
  /** Where the request came from, for the run log. */
  readonly source: "document" | "proposal" | "caller";
}

/**
 * Harvest explicit requests from a document's `intent.character.programs`
 * fields, at every depth, in document order.
 *
 * Tolerant on purpose: the shape is whatever the authoring model wrote, and a
 * malformed entry is skipped rather than thrown, because a bad program request
 * must not be able to stop a world being made.
 */
export function collectProgramRequests(doc: unknown): readonly ProgramRequest[] {
  const found: ProgramRequest[] = [];
  const seen = new Set<string>();
  walk(doc, found, seen);
  return found;
}

function walk(value: unknown, out: ProgramRequest[], seen: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out, seen);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const character = (record["intent"] as Record<string, unknown> | undefined)?.["character"] as
    | Record<string, unknown>
    | undefined;
  const programs = character?.["programs"];
  if (programs !== undefined) {
    for (const request of normalizeRequests(programs)) {
      if (seen.has(request.id)) continue;
      seen.add(request.id);
      out.push(request);
    }
  }
  for (const child of Object.values(record)) walk(child, out, seen);
}

/** Coerce whatever `character.programs` holds into requests. */
export function normalizeRequests(value: unknown, origin: ProgramRequest["source"] = "document"): readonly ProgramRequest[] {
  const items: unknown[] = Array.isArray(value) ? value : [value];
  const out: ProgramRequest[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record["id"] === "string" ? record["id"] : undefined;
    const brief = typeof record["brief"] === "string" ? record["brief"] : undefined;
    if (id === undefined || brief === undefined) continue;
    const mode = record["mode"];
    const envelope = record["envelope"];
    const count = record["count"];
    out.push({
      id: slugId(id),
      mode: mode === "plugin" || mode === "both" ? mode : "landmark",
      brief,
      ...(isEnvelope(envelope) ? { envelope: [envelope[0], envelope[1], envelope[2]] as const } : {}),
      ...(typeof count === "number" && Number.isFinite(count) ? { count: Math.max(1, Math.round(count)) } : {}),
      source: origin,
    });
  }
  return out;
}

function isEnvelope(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
  );
}

/** Lower-case, underscore-joined, safe as a map key and an `authored:<id>`. */
export function slugId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug === "" ? "program" : slug.slice(0, 48);
}

/**
 * Trim a request list to the world's budget, landmarks and plugins separately.
 *
 * Order is preserved: the earliest requests win, because the authoring model
 * writes the world's most important bespoke thing first and a truncation that
 * kept a random subset would be unattributable.
 */
export function applyBudget(
  requests: readonly ProgramRequest[],
  budget: ProgramBudget,
): { readonly kept: readonly ProgramRequest[]; readonly overflow: readonly ProgramRequest[] } {
  const kept: ProgramRequest[] = [];
  const overflow: ProgramRequest[] = [];
  let landmarks = 0;
  let plugins = 0;
  for (const request of requests) {
    // `both` counts against both caps: the document may invoke it either way.
    const wantsLandmark = request.mode === "landmark" || request.mode === "both";
    const wantsPlugin = request.mode === "plugin" || request.mode === "both";
    if ((wantsLandmark && landmarks >= budget.landmarks) || (wantsPlugin && plugins >= budget.plugins)) {
      overflow.push(request);
      continue;
    }
    if (wantsLandmark) landmarks++;
    if (wantsPlugin) plugins++;
    kept.push(request);
  }
  return { kept, overflow };
}

/* -------------------------------------------------------------------------- */
/* The system prompt — the heart of this module                                */
/* -------------------------------------------------------------------------- */

/**
 * The program author's system prompt.
 *
 * Contents, and nothing else: the API surface verbatim, the rules that make a
 * program freezable, and the difference between the two invocation modes. No
 * shape library, no worked structure, no aesthetic direction — the world's
 * intent and the request's brief carry all of that, per world, from context.
 */
export const PROGRAM_AUTHOR_PROMPT = `You write a single self-contained JavaScript program that builds one structure out of Minecraft blocks.

You are not filling in a template and there is no shape library. You compute the
geometry yourself, with ordinary JavaScript. If the structure wants a dome, work
out the dome. That freedom is the point of this interface.

THE ONLY API YOU ARE HANDED

interface ProgramApi {
  /** The only way to write. \`block\` is a FULL block string, states included:
   *  "minecraft:stone_bricks", "minecraft:oak_stairs[facing=north,half=top]". */
  set(x: number, y: number, z: number, block: string): void;
  /** Node-local envelope bounds [w, h, d]. Origin (0,0,0) is the min corner. */
  readonly size: readonly [number, number, number];
  /** Which of N this call is; {index: 0, count: 1} in landmark mode. */
  readonly instance: { readonly index: number; readonly count: number };
  /** Injected seeded PRNG in [0,1). The ONLY source of randomness that exists. */
  random(): number;
  /** Node-local terrain height, for a program that sits on real ground. */
  heightAt(x: number, z: number): number;
  /** Diagnostics only; never affects output. */
  log(msg: string): void;
  /** The WORLD'S OWN PALETTE — the blocks the settlement around you is built
   *  from. Full block strings. Read it; do not invent a palette. */
  readonly theme: {
    readonly id: string;
    /** The built-ground roles: pavement, kerb, tread, revetment, coping,
     *  plinth, weep, rail, stairs, slab, bank, scree. */
    readonly ground: Record<string, string>;
    /** The timber family: planks, log, stripped, stairs, slab, fence, door,
     *  trapdoor. */
    readonly wood: Record<string, string>;
    /** The masonry family: primary, accent, stairs, slab, wall. */
    readonly stone: Record<string, string>;
    /** The roofing family: stairs, slab, solid. */
    readonly roof: Record<string, string>;
    /** A curtain wall's five: core, walk, parapet, merlon, tower. */
    readonly wall: Record<string, string>;
  };
}

WHAT YOU RETURN

interface ProgramResult {
  readonly name: string;                  // human name for the thing you built
  readonly seatY: number;                 // node-local Y of the plane that meets
                                          // the ground; usually 0
  readonly anchors?: Record<string, [number, number, number]>;  // named points;
                                          // \`front\` declares which face looks
                                          // out — see rule 12
  readonly interiors?: {                  // rooms you left empty, for the compiler
    min: [number, number, number];        // to furnish; node-local, inclusive
    max: [number, number, number];        // min.y is the LOWEST STANDABLE cell —
    kind?: string;                        // your floor is one block below it
  }[];
}

INTERIORS — if a player can get inside what you built, say so.

Leave the space empty yourself, then name it in \`interiors\` and stop there. The
compiler furnishes every volume you declare with the same fit-out the ordinary
buildings use: beds, tables, chests, seats turned the right way round, lights
that hang off something and never at head height. Do NOT place furniture
yourself — it costs you tokens and the fit-out already knows the physics rules
your version would break. Each volume must be at least 3 x 3 x 3, must lie
inside the envelope, and at most 16 of them. \`kind\` is one free word the
fit-out reads as a hint — "hall", "bridge", "quarters", "nave", "vault".
A solid landmark declares nothing, and is furnished not at all.

THE SHAPE OF THE FILE — exactly this, no imports, no other exports:

export const envelope = [W, H, D];
export default function build(api) {
  // ...
  return { name: "...", seatY: 0, anchors: { door: [x, y, z] } };
}

RULES — each of these is checked by a gate before your program is accepted.

1. DETERMINISTIC. The program is executed twice and the two output streams are
   byte-compared. Same inputs must give the same blocks in the same order. No
   iteration over unordered structures in a way that changes order, no
   accumulated floating-point drift that depends on when you ran.
2. NO AMBIENT ENTROPY, NO IO, NO CLOCK, NO DYNAMIC CODE. \`Math.random\`,
   \`Date\`, \`performance\`, \`fetch\`, \`fs\`, \`process\`, \`eval\`, \`Function\`
   and \`import()\` do not exist. \`api.random()\` is the only entropy and it is
   seeded for you.
3. STANDARD JS MATH AND ARRAYS ARE ALLOWED and encouraged — Math.sin, Math.pow,
   Array, Map, Set, typed arrays, the lot. Compute whatever you need.
4. ENVELOPE-CONFINED. Write inside 0 <= x < size[0], 0 <= y < size[1],
   0 <= z < size[2]. Writes outside are clipped and counted; more than 1%
   clipped fails the gate, because a program that spills has declared the wrong
   envelope. Declare the envelope you actually need.
5. y = 0 IS THE SEAT PLANE by default — the course that meets the ground. Build
   upward from it and return \`seatY: 0\`. If you model anything BELOW that
   course — landing gear, a hull skirt, a belly that sinks in — put it at the
   bottom of the envelope instead and return the HONEST \`seatY\`: the node-local
   Y of the course that actually meets the ground. The compiler puts that plane
   on the terrain, so a \`seatY\` of 0 on a structure with three blocks of gear
   under it is a structure standing three blocks off the ground. For a thing
   that stands in water, the ground is the SEABED and \`seatY\` means the same
   as ever: build the whole thing, from its footing upward, and let the
   waterline fall where it falls — never model an air gap or a waterline
   yourself, and NEVER lay water or lava as your own sea, pool or "water
   zone". The world's water fills every gap above the seabed; fluid you
   author above the real waterline would stand as a raised slab of ocean,
   so the compiler clamps it and reports LOAM-W339 PROGRAM_WATER_CLAMPED.
6. FOLLOW THE GROUND YOU ARE GIVEN — it is real, and nothing will flatten it
   for you. \`api.heightAt(x, z)\` is the terrain height under your footprint,
   node-local and measured from the seat plane: 0 where the ground meets it,
   negative where the ground falls away, positive where it rises. YOU ARE
   JUDGED ON FIVE PIECES OF GROUND, and the same program must stand on all
   five: \`flat\` (level, the way it has always been), \`slope10\` (a gentle fall
   to local south), \`slope20\` (a real hillside falling the same way, twice as
   fast), \`ridge\` (a crest under the middle of the footprint, falling away to
   both sides) and \`shore\` (level for the near half, then a bank dropping two
   blocks a column into the water). A thing that stands on the ground reads
   \`heightAt\` at EVERY column it occupies and answers it there: legs that
   reach down to their own column, a skirt that follows the fall, a plinth
   that steps down in courses, a foundation that thickens where the ground
   drops away. Where the ground rises ABOVE your seat plane, build up to meet
   it — a taller wall, a higher course — because the compiler will not cut the
   hill away. On the \`shore\` member, and anywhere a thing wades, the height
   you are given is the SEABED, exactly as rule 5 says: keep building down to
   it and let the waterline fall where it falls (never model the waterline, or
   LOAM-W339 clamps it). A program that follows the ground is seated
   \`conform\`: it is stood directly on the real terrain of wherever it lands,
   with no pad, no podium and no levelling — only a skirt under a leg that
   would otherwise hang in the air. A program that writes the same sole on
   every column is a prefab: it is reported (LOAM-W340
   PROGRAM_DID_NOT_CONFORM), it is seated \`pad\` — set on a levelled platform
   with an apron graded out of the hillside (LOAM-T341 PROGRAM_SEATED_PAD) —
   and that platform is the look this rule exists to end. Slightly imperfect
   is fine: up to a tenth of your occupied columns may float; a sole that
   never changes at all is not.
7. FULL BLOCK STRINGS, states included. An unknown id or an invalid block state
   is a gate failure, not a silent placement. And DRAW THE PALETTE FROM
   \`api.theme\`, not from your imagination — but pick the FAMILY from what the
   thing IS in the story first. A wooden horse is timber, so it is
   \`api.theme.wood.planks\` and \`api.theme.wood.log\` (the town's own
   carpentry), NEVER the theme's masonry; a fort or a shrine is a building, so
   it is \`api.theme.stone.primary\`, \`api.theme.ground.plinth\`,
   \`api.theme.roof.solid\`. A hard-coded set of palettes — sandstone here,
   terracotta there — is the one sure way to build something foreign to the
   world it lands in; a theme role from the wrong family is the one sure way to
   build a stone horse. Name a block literally ONLY where no theme family
   matches the substance (prismarine because it is a sea monster, bone because
   it is a skeleton, glowstone because it glows).
8. FUEL-BOUNDED. 20 million instruction steps and 200,000 block writes per
   instance. An instance that trips a limit is dropped whole. Prefer arithmetic
   over brute-force scans of the whole volume.
9. ONE CONNECTED SOLID. After dropping stray components under 12 voxels, what
   you wrote must be a single 6-connected body, at least 8 blocks tall, at
   least 500 solid voxels. Floating chunks fail.
10. IT MUST SURVIVE A PHYSICS LINT. Your output is emitted into a real world and
   walked: no floating gravity blocks, no unsupported stairs, no unreachable or
   sealed interiors, no obviously falling geometry.
11. ANCHORS ARE NAMED POINTS the rest of the world can reach — a "door" anchor
    is where a road will be routed to. They name a point; they promise no
    geometry. Publish the ones that matter.
12. IF YOUR SUBJECT HAS A FRONT, BUILD IT NORTH AND SAY SO. A face, a prow, a
    doorway, a direction of travel — anything that means the thing is looking
    somewhere. Build that front toward LOCAL NORTH, which is −Z, the z = 0 face
    of your envelope, and publish an anchor named \`front\` on it:
    \`anchors: { front: [x, y, 0] }\`. That one anchor is the whole declaration.
    The compiler then turns the finished instance so the front points where the
    document asked — at the city it is invading, away from the town it is
    leaving — and the same anchor doubles as the point a road arrives at. You
    never learn which way that is and you must never try: build it facing north
    and let the placement decide. A program that publishes no \`front\` is never
    turned, which is exactly right for a thing with no front (a tower, a well, a
    boulder) and exactly wrong for a thing with one.

INVOCATION MODES

- LANDMARK: your program is invoked ONCE, against a fixed envelope.
  \`api.instance\` is {index: 0, count: 1}. This is a one-off monument; make it
  singular.
- PLUGIN: the SAME program is invoked N times with per-instance seeds, scattered
  across the world. Use \`api.instance.index\`, \`api.instance.count\` and
  \`api.random()\` so that EVERY INSTANCE DIFFERS — proportions, damage,
  orientation, detail, which parts are present. N copies of one silhouette is a
  failed plugin. The envelope is the same for every instance, so vary what is
  inside it, not what it is.

OUTPUT FORMAT

Reply with the program source in a single fenced code block and nothing else.
No commentary before or after the fence.`;

/** The proposal turn's system prompt: what bespoke programs does this world want? */
export const PROGRAM_PROPOSAL_PROMPT = `You decide whether a world wants any BESPOKE STRUCTURE PROGRAMS, and which.

A bespoke program is a small JavaScript generator, written from scratch for this
world, that builds one structure the standard library has no archetype for. It
costs a model call each, so it is for things that genuinely carry the prompt —
never for a cottage, a road, a wall or a tree, all of which already exist.

Reach for one when:
- the prompt names a structure no ordinary settlement archetype covers (a
  crashed saucer, a god's statue, a fossilised leviathan, a broken space
  elevator); or
- one custom element repeats across the world and should vary each time.

Two invocation modes:
- "landmark": built ONCE, a singular monument.
- "plugin": built MANY times with per-instance variation.

Reply with a JSON array and nothing else. Empty array is a perfectly good answer
for a world whose prompt asks for nothing bespoke — propose nothing rather than
padding the list.

[
  { "id": "snake_case_id",
    "mode": "landmark" | "plugin",
    "brief": "one or two sentences: what it is, what it reads as, what matters",
    "envelope": [W, H, D],
    "count": 12 }        // plugin mode only, roughly how many instances
]`;

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

/** A program frozen into the document, per the contract's artifact table. */
export interface AuthoredProgramEntry {
  readonly mode: ProgramMode;
  readonly envelope: readonly [number, number, number];
  readonly sourceHash: string;
  /** Recorded when the gate can execute; `undefined` against a stub gate. */
  readonly outputHash?: string;
  /**
   * The gate's conformance verdict (§2.4), stamped with {@link conformHash} or
   * not at all. Absent means "never judged" — the record is seated `pad`, as
   * every record was before the step existed.
   */
  readonly conforms?: boolean;
  /** The terrain-suite digest behind {@link conforms}. */
  readonly conformHash?: string;
  readonly source: string;
}

/** Per-program accounting for the run log. */
export interface ProgramRunRecord {
  readonly id: string;
  readonly mode: ProgramMode;
  /** Gate submissions made, initial included. Never more than the round cap. */
  readonly attempts: number;
  readonly usage: Usage;
  readonly ok: boolean;
  /** Why it was dropped. Absent when `ok`. */
  readonly note?: string;
  /**
   * The last round's diagnostics, verbatim. When `ok`, the warnings the
   * suspended gate checks recorded (Kai, 2026-08-15) — a passing program can
   * carry them.
   */
  readonly diagnostics: readonly LoamDiagnostic[];
  /** Warning-severity diagnostics on the accepted (or last) submission. */
  readonly warnings?: number;
}

/** What {@link authorPrograms} produced. */
export interface AuthorProgramsResult {
  /** Ready to attach to the document. Only programs that passed the gate. */
  readonly programs: Readonly<Record<string, AuthoredProgramEntry>>;
  readonly records: readonly ProgramRunRecord[];
  /** Requests trimmed by the budget or the spend stop, with the reason. */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
  readonly usage: Usage;
  readonly budget: ProgramBudget;
  readonly model: string;
}

/** Request for {@link authorPrograms}. */
export interface AuthorProgramsRequest {
  readonly prompt: string;
  readonly worldSeed: number | string;
  readonly size: number;
  /** The gate. Injected — the compiler side owns the real one. */
  readonly gate: ProgramVerificationGate;
  /** Explicit requests. When omitted, {@link proposePrograms} is asked. */
  readonly requests?: readonly ProgramRequest[];
  /** The authored document, harvested for `intent.character.programs`. */
  readonly doc?: unknown;
  /** World context handed to the writer verbatim — usually the resolved intent. */
  readonly context?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly maxRounds?: number;
  /** Spend stop in USD, checked before each call. */
  readonly budgetUsd?: number;
  readonly fetchImpl?: FetchLike;
  readonly apiKey?: string;
  /** Override the writer's system prompt. Tests and experiments only. */
  readonly systemPrompt?: string;
}

/* -------------------------------------------------------------------------- */
/* The authoring run                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Author every bespoke program this world wants.
 *
 * Total by construction: a world whose programs all fail comes back with an
 * empty map and a record for each drop, and the caller compiles the document
 * exactly as it would have without this pass.
 */
export async function authorPrograms(request: AuthorProgramsRequest): Promise<AuthorProgramsResult> {
  const apiKey = request.apiKey ?? loadOpenRouterKey();
  const model = request.model ?? AUTHORING_MODEL_ID;
  const effort = request.reasoningEffort ?? AUTHORING_REASONING_EFFORT;
  const budget = programBudget(request.size);
  const budgetUsd = request.budgetUsd ?? DEFAULT_BESPOKE_BUDGET_USD;
  const usages: Usage[] = [];
  const skipped: { id: string; reason: string }[] = [];

  const docContext: ProgramDocContext = {
    worldSeed: request.worldSeed,
    size: request.size,
    ...(request.prompt === undefined ? {} : { prompt: request.prompt }),
  };

  // --- what do we write? --------------------------------------------------
  let requests: readonly ProgramRequest[] = request.requests ?? [];
  if (requests.length === 0 && request.doc !== undefined) {
    requests = collectProgramRequests(request.doc);
  }
  if (requests.length === 0 && request.requests === undefined) {
    const proposal = await proposePrograms({
      prompt: request.prompt,
      budget,
      apiKey,
      model,
      ...(request.context === undefined ? {} : { context: request.context }),
      ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
    });
    usages.push(proposal.usage);
    requests = proposal.requests;
  }

  const { kept, overflow } = applyBudget(requests, budget);
  for (const request_ of overflow) {
    skipped.push({ id: request_.id, reason: `over the world's program budget (${budget.landmarks} landmark / ${budget.plugins} plugin)` });
  }

  // --- write them ---------------------------------------------------------
  const programs: Record<string, AuthoredProgramEntry> = {};
  const records: ProgramRunRecord[] = [];

  for (const item of kept) {
    const spent = sumUsage(usages).cost ?? 0;
    if (spent >= budgetUsd) {
      skipped.push({ id: item.id, reason: `bespoke spend stop reached ($${spent.toFixed(4)} of $${budgetUsd.toFixed(2)})` });
      continue;
    }
    // One program is never worth the world. A transport failure — a dropped
    // socket, a provider returning 200 with no content — is exactly as fatal to
    // *this* program as failing its gate, and exactly as survivable for
    // everything else: the document is already authored and paid for, and a
    // world minus one landmark still compiles. Anything that escapes this is a
    // bug in the caller's budget arithmetic, not in the model's output.
    let outcome: AuthorProgramOutcome;
    try {
      outcome = await authorProgram({
        request: item,
        docContext,
        gate: request.gate,
        apiKey,
        model,
        reasoningEffort: effort,
        maxRounds: Math.max(1, request.maxRounds ?? MAX_PROGRAM_ROUNDS),
        ...(request.context === undefined ? {} : { context: request.context }),
        ...(request.fetchImpl === undefined ? {} : { fetchImpl: request.fetchImpl }),
        ...(request.systemPrompt === undefined ? {} : { systemPrompt: request.systemPrompt }),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      skipped.push({ id: item.id, reason: `authoring failed: ${reason}` });
      records.push({
        id: item.id,
        mode: item.mode,
        attempts: 0,
        // The tokens the failed call spent are unknowable — the response that
        // would have reported them is the thing that did not arrive.
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        ok: false,
        note: `authoring failed: ${reason}`,
        diagnostics: [],
      });
      continue;
    }
    usages.push(outcome.record.usage);
    records.push(outcome.record);
    if (outcome.entry !== undefined) programs[item.id] = outcome.entry;
  }

  return { programs, records, skipped, usage: sumUsage(usages), budget, model };
}

/** Request for {@link authorProgram}: one program, one repair loop. */
export interface AuthorProgramRequest {
  readonly request: ProgramRequest;
  readonly docContext: ProgramDocContext;
  readonly gate: ProgramVerificationGate;
  readonly apiKey: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly maxRounds?: number;
  readonly context?: string;
  readonly fetchImpl?: FetchLike;
  readonly systemPrompt?: string;
}

/** One program's outcome: the frozen entry, or nothing plus the reason. */
export interface AuthorProgramOutcome {
  readonly entry?: AuthoredProgramEntry;
  readonly record: ProgramRunRecord;
}

/**
 * Write one program and repair it until the gate is happy or the rounds run
 * out.
 *
 * The repair turn is the contract's, exactly: the diagnostics go back
 * **verbatim** — code, node path, message and fix — alongside the source that
 * produced them. Nothing here interprets a diagnostic, summarises one, or
 * decides which ones matter; that is what the `fix` field is for and what
 * §14.6 blesses. Nothing here looks at a render.
 */
export async function authorProgram(options: AuthorProgramRequest): Promise<AuthorProgramOutcome> {
  const { request, gate, docContext } = options;
  const maxRounds = Math.max(1, options.maxRounds ?? MAX_PROGRAM_ROUNDS);
  const usages: Usage[] = [];

  const messages: ChatMessage[] = [
    { role: "system", content: options.systemPrompt ?? PROGRAM_AUTHOR_PROMPT },
    { role: "user", content: programUserPrompt(request, docContext, options.context) },
  ];

  let diagnostics: readonly LoamDiagnostic[] = [];
  let note = "the model never produced usable source";

  for (let round = 1; round <= maxRounds; round++) {
    const completion = await chatComplete({
      apiKey: options.apiKey,
      model: options.model ?? AUTHORING_MODEL_ID,
      messages,
      temperature: AUTHORING_TEMPERATURE,
      reasoningEffort: options.reasoningEffort ?? AUTHORING_REASONING_EFFORT,
      // Explicit, and far above the provider default: writing a landmark is the
      // longest-thinking call we make, and the default allowance is small
      // enough that the reasoning alone can consume it. See the constant.
      maxTokens: PROGRAM_AUTHOR_MAX_TOKENS,
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    });
    usages.push(completion.usage);

    const source = extractProgramSource(completion.text);
    const local = lintSourceLocally(source, request);
    if (local.length > 0) {
      diagnostics = local;
      note = local[0]?.message ?? "the source could not be used";
    } else {
      const submission: ProgramSubmission = {
        id: request.id,
        mode: request.mode,
        envelope: parseEnvelope(source) ?? request.envelope ?? DEFAULT_ENVELOPE,
        source,
      };
      const verdict = await gate.verify([submission], docContext);
      // Only error-severity diagnostics fail a program or spend a repair
      // round: the suspended gate checks (Kai, 2026-08-15, "for now") come
      // back as warnings and are recorded rather than repaired.
      const warnings = verdict.filter((diag) => diag.severity === "warning");
      diagnostics = verdict.filter((diag) => diag.severity === "error");
      if (diagnostics.length === 0) {
        // Prefer `freeze`: it carries the conformance verdict beside the
        // op-stream hash, and the real gate produces both from one pass.
        const frozen: ProgramFreezeFields =
          gate.freeze !== undefined
            ? await gate.freeze(submission, docContext)
            : gate.outputHash === undefined
              ? {}
              : { outputHash: await gate.outputHash(submission, docContext) };
        const { outputHash } = frozen;
        // Both fields or neither (§2.2): a verdict without a well-formed
        // digest is not a verdict, and the spec's validator rejects one.
        const judged =
          frozen.conforms !== undefined
          && frozen.conformHash !== undefined
          && frozen.conformHash.startsWith("b3:");
        return {
          entry: {
            mode: submission.mode,
            envelope: submission.envelope,
            sourceHash: hashSource(source),
            ...(outputHash === undefined ? {} : { outputHash }),
            ...(judged
              ? { conforms: frozen.conforms as boolean, conformHash: frozen.conformHash as string }
              : {}),
            source,
          },
          record: {
            id: request.id,
            mode: request.mode,
            attempts: round,
            usage: sumUsage(usages),
            ok: true,
            diagnostics: warnings,
            ...(warnings.length === 0 ? {} : { warnings: warnings.length }),
          },
        };
      }
      note = `${diagnostics.length} gate problem(s) after ${maxRounds} round(s); last: ${diagnostics[0]?.code ?? "?"} ${diagnostics[0]?.message ?? ""}`;
    }

    if (round === maxRounds) break;
    messages.push({ role: "assistant", content: completion.text });
    messages.push({ role: "user", content: repairPrompt(diagnostics, source) });
  }

  return {
    record: {
      id: request.id,
      mode: request.mode,
      attempts: usages.length,
      usage: sumUsage(usages),
      ok: false,
      note,
      diagnostics,
    },
  };
}

/** Envelope used when neither the source nor the request declares one. */
const DEFAULT_ENVELOPE: readonly [number, number, number] = [16, 16, 16];

/** The writer's first user turn: the brief, the mode, and the world's context. */
export function programUserPrompt(
  request: ProgramRequest,
  docContext: ProgramDocContext,
  context?: string,
): string {
  const lines = [
    `World prompt: ${docContext.prompt ?? "(none given)"}`,
    ...(context === undefined || context.trim() === "" ? [] : ["", "World context:", context]),
    "",
    `Write the program "${request.id}".`,
    `Mode: ${request.mode}${request.mode === "plugin" || request.mode === "both" ? ` — it will be built ${request.count ?? "many"} times, and every instance must differ.` : " — it is built once."}`,
    `Brief: ${request.brief}`,
  ];
  if (request.envelope !== undefined) {
    lines.push(
      `Suggested envelope: [${request.envelope.join(", ")}]. Declare a different one if the structure genuinely needs it.`,
    );
  }
  lines.push("", "Reply with the source in one fenced code block and nothing else.");
  return lines.join("\n");
}

/** The repair turn. Diagnostics verbatim, source attached, nothing invented. */
export function repairPrompt(diagnostics: readonly LoamDiagnostic[], source: string): string {
  return [
    `That program did not pass the gate. ${diagnostics.length} problem(s), verbatim:`,
    ``,
    ...diagnostics.map(formatDiagnostic),
    ``,
    `This is the source that produced them:`,
    ``,
    "```js",
    source,
    "```",
    ``,
    `Fix every problem and reply with the complete corrected source in one`,
    `fenced code block. Do not explain the changes; the next reply is compiled,`,
    `not read. If a problem is caused by the shape you chose, change the shape —`,
    `a structure that cannot pass is dropped from the world entirely.`,
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Source handling                                                             */
/* -------------------------------------------------------------------------- */

/** Pull the program out of a reply: the first fenced block, or the whole text. */
export function extractProgramSource(text: string): string {
  const fence = /```(?:[a-zA-Z]*)\n([\s\S]*?)```/.exec(text);
  return (fence?.[1] ?? text).trim();
}

/** `export const envelope = [W, H, D]` — the program's own declaration. */
export function parseEnvelope(source: string): readonly [number, number, number] | undefined {
  const match = /export\s+const\s+envelope\s*=\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/.exec(source);
  if (match === null) return undefined;
  const dims = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  if (dims.some((n) => !Number.isFinite(n) || n <= 0)) return undefined;
  return dims;
}

/**
 * Cheap local checks before the gate is bothered.
 *
 * Deliberately only the things a gate call would waste a round discovering: no
 * source at all, no envelope, no default export, over the size ceiling. Every
 * semantic judgement belongs to the gate.
 */
export function lintSourceLocally(source: string, request: ProgramRequest): readonly LoamDiagnostic[] {
  const out: LoamDiagnostic[] = [];
  const at = `programs.${request.id}`;
  if (source.trim() === "") {
    out.push(diag("E336", "PROGRAM_EMPTY", at, "the reply contained no program source", "Reply with the source in one fenced code block."));
    return out;
  }
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > MAX_PROGRAM_SOURCE_BYTES) {
    out.push(
      diag("E336", "PROGRAM_TOO_LARGE", at, `the source is ${bytes} bytes; the limit is ${MAX_PROGRAM_SOURCE_BYTES}`, "Compute the geometry instead of enumerating it."),
    );
  }
  if (parseEnvelope(source) === undefined && request.envelope === undefined) {
    out.push(
      diag("E336", "PROGRAM_NO_ENVELOPE", at, "the source declares no `export const envelope = [W, H, D]`", "Add the envelope export as the first line of the file."),
    );
  }
  if (!/export\s+default\s+function/.test(source)) {
    out.push(
      diag("E336", "PROGRAM_NO_BUILD", at, "the source has no `export default function build(api)`", "Export the build function as the module default."),
    );
  }
  return out;
}

function diag(code: string, name: string, nodePath: string, message: string, fix: string): LoamDiagnostic {
  return { code, name, severity: "error", nodePath, message, fix };
}

/**
 * BLAKE3 of the normalized source — the contract's `sourceHash`.
 *
 * One rule, defined once in `@terrainist/spec`, so the digest frozen into the
 * document is the same digest the compiler recomputes from the text beside it.
 * This used to be a second implementation and it disagreed with the compiler's
 * on trailing whitespace inside a line (E333 on a Gemini-authored program,
 * 2026-08-15). Delegate; never re-derive.
 */
export function hashSource(source: string): string {
  return programSourceHash(source);
}

/* -------------------------------------------------------------------------- */
/* Proposal turn                                                               */
/* -------------------------------------------------------------------------- */

/** Options for {@link proposePrograms}. */
export interface ProposeRequest {
  readonly prompt: string;
  readonly budget: ProgramBudget;
  readonly apiKey: string;
  readonly model?: string;
  readonly context?: string;
  readonly fetchImpl?: FetchLike;
}

/** What the proposal turn produced. */
export interface ProposalResult {
  readonly requests: readonly ProgramRequest[];
  readonly usage: Usage;
  readonly raw: string;
}

/**
 * Ask the authoring model which bespoke programs this world wants.
 *
 * One call, no retry: a proposal that cannot be parsed means the world gets no
 * bespoke programs, which is a perfectly good world.
 */
export async function proposePrograms(options: ProposeRequest): Promise<ProposalResult> {
  const completion = await chatComplete({
    apiKey: options.apiKey,
    model: options.model ?? AUTHORING_MODEL_ID,
    messages: [
      { role: "system", content: PROGRAM_PROPOSAL_PROMPT },
      {
        role: "user",
        content: [
          `World prompt: ${options.prompt}`,
          ...(options.context === undefined ? [] : ["", "World context:", options.context]),
          "",
          `Budget: at most ${options.budget.landmarks} landmark program(s) and ${options.budget.plugins} plugin program(s). Propose fewer if fewer are warranted.`,
        ].join("\n"),
      },
    ],
    temperature: AUTHORING_TEMPERATURE,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });

  const extracted = extractJson(completion.text);
  const requests = extracted.ok ? normalizeRequests(extracted.value, "proposal") : [];
  return { requests, usage: completion.usage, raw: completion.text };
}

/* -------------------------------------------------------------------------- */
/* Document attachment and reporting                                           */
/* -------------------------------------------------------------------------- */

/**
 * Attach the frozen programs map to a document.
 *
 * Pure: the input document is not mutated. An empty map returns the document
 * untouched, so a run with `--no-programs` (or one where every program was
 * dropped) produces byte-identical output to a run before this pass existed.
 */
export function attachPrograms<T>(doc: T, programs: Readonly<Record<string, AuthoredProgramEntry>>): T {
  if (Object.keys(programs).length === 0) return doc;
  const existing = (doc as Record<string, unknown>)["programs"];
  const merged = {
    ...(existing !== null && typeof existing === "object" ? (existing as Record<string, unknown>) : {}),
    ...programs,
  };
  return { ...(doc as Record<string, unknown>), programs: merged } as T;
}

/** The run-log block, in the same register as the intent line. */
export function formatProgramRun(result: AuthorProgramsResult): string {
  if (result.records.length === 0 && result.skipped.length === 0) {
    return `programs   none (budget ${result.budget.landmarks} landmark / ${result.budget.plugins} plugin)`;
  }
  const lines = [
    `programs   ${result.records.filter((r) => r.ok).length} of ${result.records.length} kept (budget ${result.budget.landmarks} landmark / ${result.budget.plugins} plugin)`,
  ];
  for (const record of result.records) {
    const cost = record.usage.cost === undefined ? "" : `  ($${record.usage.cost.toFixed(4)})`;
    const warnCount = record.warnings ?? record.diagnostics.filter((d) => d.severity === "warning").length;
    lines.push(
      `  ${record.ok ? "ok    " : "drop  "} ${record.id} [${record.mode}]  ${record.attempts} attempt(s), ${record.usage.totalTokens} tokens${cost}${warnCount === 0 ? "" : `, ${warnCount} warning(s)`}${record.ok || record.note === undefined ? "" : `  — ${record.note}`}`,
    );
  }
  for (const skip of result.skipped) lines.push(`  skip   ${skip.id}  — ${skip.reason}`);
  const { usage } = result;
  lines.push(
    `  tokens     ${usage.promptTokens} in + ${usage.completionTokens} out = ${usage.totalTokens}${usage.reasoningTokens === undefined ? "" : `  (${usage.reasoningTokens} of the out reasoning)`}${usage.cost === undefined ? "" : `  ($${usage.cost.toFixed(4)})`}`,
  );
  return lines.join("\n");
}

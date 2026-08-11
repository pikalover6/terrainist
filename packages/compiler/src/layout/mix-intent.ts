/**
 * The fan-out row that decides *which buildings a quarter builds* —
 * `intent.character.archetypes`.
 *
 * ## Why this file exists
 *
 * `character.archetypes.prefer / forbid / weights` has been in the spec, in the
 * kit's worked examples and in the classifier's output since the intent layer
 * landed, and it was **grounded and never consumed**: `structures/vocabulary.ts`
 * checked every word against the catalog and raised `LOAM-W483` for what it
 * could not place, and then nothing read the key. The only path from a document
 * to a lot's archetype was `pickArchetype(params.mix, …)` in `district.ts`, so
 * the kit's unicorn island read different only because its `params.mix` happened
 * to say the same thing beside the bias. That is DESIGN's second failure mode by
 * name — machinery that exists and never runs. This file is the wire.
 *
 * ## The law
 *
 * **Total.** Handed the mix the quarter was about to use (`ctx.today`), the row
 * returns it unchanged when no scope in the node's path declares
 * `character.archetypes`. A document that does not use the key compiles
 * byte-identically, and `intent-identity.test.ts` still hashes equal.
 *
 * ## The order, and it is one order
 *
 * 1. **`forbid` wins over everything**, including an explicit `params.mix`
 *    entry. A forbidden id is removed. A mix emptied *entirely* by forbidding
 *    falls back to `ctx.today` with {@link INTENT_ARCHETYPE_MIX_EMPTY} rather
 *    than to no buildings — an empty quarter is a worse answer to an author
 *    mistake than a stated one.
 * 2. **explicit `prefer`** is prepended in declaration order. The mix is a
 *    *positional* draw (see `pickArchetype`), so position is weight; prepending
 *    is the whole mechanism. A preferred word that is not a fabric-eligible
 *    building archetype is skipped, never fatal — `LOAM-W483` already said so.
 * 3. **`character.formPacks`** expand behind the explicit preferences, in
 *    registry order within each pack and in the order the packs were named.
 * 4. **`weights`** multiply an id's occurrences, integer-rounded and capped.
 * 5. whatever remains of `ctx.today` follows.
 *
 * That is the whole precedence, and this comment is the one place it is stated:
 * **`archetypes.forbid` > explicit `archetypes.prefer` > `formPacks` expansion
 * > `ctx.today`.** A pack is a *default vocabulary*, so an author who names a
 * specific archetype always outranks the pack that also contains it, and a
 * forbidden id never comes back through a pack.
 *
 * ## What a pack expands to
 *
 * Its **fabric-eligible** members and nothing else — {@link isFabricArchetype},
 * the same test an explicit `prefer` word passes. Props and infrastructure do
 * not enter a lot draw; they arrive through `character.props`, the
 * street-furniture headliner rule and explicit nodes. The design also asks for
 * a size-class filter ("members whose size class the quarter's lots can hold");
 * size class is a curator's column in `docs/CATALOG-EXPANSION-v0.md` and not a
 * field of `StructureEntry`, so **that half is not expressible today** and the
 * filter is kind-and-status only. When a size class becomes a catalog field it
 * tightens here, and no caller changes.
 *
 * A pack whose members are all `not_started` — which, the day this landed, was
 * *every* pack — expands to nothing and contributes nothing. That is a
 * first-class case, not a degenerate one: the pack still grounds without a
 * warning, the mix is the mix it would have been, and members light up as their
 * generators land with no further wiring.
 *
 * ## Determinism
 *
 * Nothing here draws a number. The row is a pure function of the resolved
 * intent and the mix it was handed, so the seeded draw downstream is unchanged
 * in kind — it just draws over a different list.
 */

import {
  warning,
  type ArchetypeBias,
  type LoamDiagnostic,
} from "@terrainist/spec";
import { formPackMembers, structureById } from "@terrainist/stdlib";

import { fanOut, registerFanOut, type FanOutContext } from "../intent/fanout.js";
import type { ResolvedIntent } from "../intent/resolve.js";

/** Row ids owned by the archetype-mix bias. */
export const MIX_ROWS = {
  /** The archetype mix a quarter's infill and terraces draw from. */
  mix: "grammar.mix",
} as const;

/**
 * The cap on what one weighted id may take of a mix: **half its length**, and
 * never below 1.
 *
 * A constraint, not a tuning knob. The mix is a positional draw, so an id with
 * more than half the entries is drawn more often than everything else put
 * together and the quarter stops reading as a mix at all — one archetype cannot
 * take a whole quarter. `weights: { "cottage": 99 }` is therefore a strong
 * lean, never a monoculture; a monoculture is said by writing a one-entry
 * `params.mix`, where the author can see it.
 */
export function weightCap(mixLength: number): number {
  return Math.max(1, Math.floor(mixLength / 2));
}

/**
 * True for a word this row may put into a mix.
 *
 * "Fabric-eligible" is the catalog's own answer: an entry the grammar actually
 * builds (`implemented`) and that is a *building* rather than a prop, a dug
 * space or a length of infrastructure. Props arrive through `character.props`,
 * infrastructure through nodes; neither belongs in a lot draw.
 */
export function isFabricArchetype(word: string): boolean {
  const entry = structureById(word);
  return entry !== undefined && entry.kind === "building" && entry.status === "implemented";
}

/**
 * How the row finds a pack's members.
 *
 * A parameter rather than a hard import so the tests can prove the expansion
 * with catalog ids that are *implemented today* — every shipped pack's members
 * were `not_started` the day this landed, so a test bound to the real registry
 * could only ever assert "nothing happened".
 */
export type PackMemberLookup = (pack: string) => readonly string[];

/**
 * The fabric-eligible members of the packs a scope named, in the order the
 * packs were named and, within a pack, in registry order.
 *
 * Deduplicated: two packs may share a member, and a mix is positional, so a
 * duplicate would be a silent weight.
 */
export function expandFormPacks(
  packs: readonly string[] | undefined,
  members: PackMemberLookup = formPackMembers,
): readonly string[] {
  if (packs === undefined || packs.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const pack of packs) {
    for (const id of members(pack)) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!isFabricArchetype(id)) continue; // props, infrastructure, unbuilt.
      out.push(id);
    }
  }
  return out;
}

/** The pack half of a bias: what was named, and how to look its members up. */
export interface PackExpansion {
  readonly packs?: readonly string[];
  readonly members?: PackMemberLookup;
}

/** Extras the caller hands the row. */
export interface MixExtra {
  /**
   * A sink the row appends its one diagnostic to, when a `forbid` list empties
   * the mix. Optional: a caller with nowhere to put diagnostics still gets the
   * fallback, it just gets it silently.
   */
  readonly sink?: LoamDiagnostic[];
}

/**
 * Apply an {@link ArchetypeBias} to the mix a quarter was about to use.
 *
 * Exported for the tests and for any future caller with its own mix; the row
 * below is a thin wrapper that finds the bias on the resolved intent.
 */
export function applyArchetypeBias(
  today: readonly string[],
  bias: ArchetypeBias,
  nodePath: string,
  sink?: LoamDiagnostic[],
  packs?: PackExpansion,
): readonly string[] {
  const forbidden = new Set(bias.forbid ?? []);

  // 1. forbid, over everything.
  const kept = forbidden.size === 0 ? today : today.filter((id) => !forbidden.has(id));
  if (today.length > 0 && kept.length === 0) {
    sink?.push(
      warning(
        "INTENT_ARCHETYPE_MIX_EMPTY",
        nodePath,
        `intent.character.archetypes.forbid names every archetype in this quarter's mix (${today.join(", ")}) — the mix is kept as written, because a quarter with no archetypes builds nothing`,
        'forbid fewer archetypes, or write the mix you do want in "params.mix" and let forbid trim the inherited one',
      ),
    );
    return today;
  }

  // 2. prefer, prepended in declaration order — position is weight.
  const preferred: string[] = [];
  for (const word of bias.prefer ?? []) {
    if (forbidden.has(word)) continue; // rung 1 outranks rung 2.
    if (!isFabricArchetype(word)) continue; // W483 already warned; skip it.
    if (preferred.includes(word)) continue;
    preferred.push(word);
  }
  // 2b. formPacks, behind the explicit preferences and ahead of `ctx.today`.
  // A forbidden id never returns through a pack (rung 1 outranks this), and an
  // id an explicit `prefer` already placed keeps the position the author gave
  // it rather than gaining a second one.
  const expanded: string[] = [];
  for (const id of expandFormPacks(packs?.packs, packs?.members)) {
    if (forbidden.has(id)) continue;
    if (preferred.includes(id)) continue;
    if (expanded.includes(id)) continue;
    expanded.push(id);
  }

  const front = [...preferred, ...expanded];
  const combined = front.length === 0 ? kept : [...front, ...kept];

  // 3. weights, multiplying occurrences of an id already in the mix.
  const weights = bias.weights;
  if (weights === undefined || combined.length === 0) return combined;
  const cap = weightCap(combined.length);
  const out: string[] = [];
  const done = new Set<string>();
  for (const id of combined) {
    if (done.has(id)) continue;
    done.add(id);
    const count = combined.filter((other) => other === id).length;
    const weight = weights[id];
    const want =
      weight === undefined || !Number.isFinite(weight) || weight <= 0
        ? count
        : Math.max(1, Math.min(cap, Math.round(count * weight)));
    for (let k = 0; k < want; k++) out.push(id);
  }
  return out;
}

/** Register the mix-bias row. */
export function registerMixFanOut(): void {
  registerFanOut<readonly string[]>({
    id: MIX_ROWS.mix,
    reads: ["character"],
    status: "today",
    drives: "the archetype mix `pickArchetype` draws a lot's building from",
    resolve(intent: ResolvedIntent, ctx: FanOutContext<readonly string[]>) {
      const bias = intent.intent.character?.archetypes;
      const packs = intent.intent.character?.formPacks;
      // Totality, and it is checked before `ctx.today` is so much as read:
      // the identity test hands the row a sentinel, not a list. **A document
      // that names no pack and no bias compiles byte-identically** — the reach
      // law, and it is this line.
      const named = packs !== undefined && packs.length > 0;
      if (bias === undefined && !named) return ctx.today;
      if (
        !named &&
        bias?.prefer === undefined &&
        bias?.forbid === undefined &&
        bias?.weights === undefined
      ) {
        return ctx.today;
      }
      const extra = ctx.extra as unknown as MixExtra | undefined;
      return applyArchetypeBias(
        ctx.today,
        bias ?? {},
        ctx.nodePath,
        extra?.sink,
        packs === undefined ? undefined : { packs },
      );
    },
  });
}

/**
 * Ask the row for a quarter's mix.
 *
 * The one call site is `layDistrict`, which is the single point every archetype
 * draw in the fabric passes through — both the terrace runs and the per-lot
 * infill take their `params.mix` from there.
 */
export function biasedMix(
  intent: ResolvedIntent,
  nodePath: string,
  today: readonly string[],
  diagnostics?: LoamDiagnostic[],
): readonly string[] {
  return fanOut<readonly string[]>(MIX_ROWS.mix, intent, {
    nodePath,
    today,
    ...(diagnostics === undefined
      ? {}
      : { extra: { sink: diagnostics } as unknown as Readonly<Record<string, unknown>> }),
  });
}

# THE COHERENT SOURCE v0 — the one-writer world

Ratified in spirit by Kai, 2026-08-22, after walking `troy_rootpoc`: *"every
time more than one function tries to claim an individual block is a negative,
and terrain that is generated incoherently at the source is always going to
be incoherent."* This document is that spirit made law. It governs the
alternate path (`tools/root-poc/` and everything that grows from it). It is
deliberately short, because its whole content is two prohibitions and their
consequences.

## The verdict it stands on

The main pipeline spent a month curing divergence-of-authorities: five height
authorities became one resolve, the resolve grew an election, the election
grew a descent solver, and every flip healed real wounds — measured, walked,
verified. That work was good engineering against the wrong invariant. The
POC measured the alternative: ~600 lines with no election, no ranks, no seam
derivation, whose only walkable defects were two plumbing bugs, each found in
one walk and made structurally impossible in thirty lines. The difference is
not effort or talent. It is that in one architecture a seam is the generic
case and smoothness is a theorem to re-prove forever, and in the other
smoothness is the generic case and a seam is unrepresentable.

---

## LAW I — ONE WRITER PER BLOCK

**Every block in the world has exactly one author. The moment two functions
want the same block, the design is wrong — not under-scheduled, not
under-ranked, not awaiting arbitration. Wrong.**

- There is no rank table, no claim resolution, no election, no "who wins this
  column" anywhere in this path. Those words name the defect, not the cure.
- Disagreement is legitimate — but it is resolved **upstream, in the field**,
  where the parties are curves and kernels, not blocks. Two needs that both
  want the same ground negotiate as landform constraints blended into one
  heightfield; by the time a block exists, the argument is already over.
- Writers are layered by *kind*, never by contest: the terrain writes the
  ground; surfaces **replace** the terrain's own top block in place;
  structures stand **on** the ground and sink their own foundations. A later
  writer in the emit order that touches an earlier writer's block is a bug,
  with exactly one sanctioned exception: a surface swap at the surface's own
  level (a path or a stair *replacing* the grass block the plan put there —
  same column, same y, one block, by design).
- The ground has one oracle: `plan.ground`. No function derives its own
  copy of the ground, rounds its own field, or caches its own answer. The
  POC's first walk found what one block of private disagreement costs; the
  answer is the law, not vigilance.

## LAW II — COHERENCE IS INHERITED, NEVER REPAIRED

**Terrain that is generated incoherently at the source is always going to be
incoherent. No downstream pass may repair levels — because it cannot: a
repair is a second author, and Law I already names that.**

- The heightfield is the single source of coherence for the whole world.
  Every edit to it goes through a **smooth kernel** — a plateau with a
  falloff band, a grade-limited ribbon, a feathered terrace. The edit
  primitive can only emit terrain-shaped output, so jaggedness is not
  something we prevent; it is something the vocabulary cannot say.
- The settlement does not adapt to the terrain and the terrain is not
  corrected for the settlement. **The plan's needs are landform constraints,
  absorbed before any block exists** — a citadel is a plateau, a road is a
  graded ribbon, a farm is a terrace fan, a harbor is a pad. The terrain is
  born agreeing with the town.
- Roads are routed on the slope-cost of the constrained field, then absorbed
  into it as ribbons whose profiles are grade-clamped *curves*. Switchbacks
  are emergent. There is no stair solver because there is nothing to solve;
  a stair is a surface material for a one-block rise the field chose to keep.
- **The field freezes exactly once.** Sketch → constrain → route → absorb →
  freeze. After the freeze, the field is dead as an authority: the plan is
  built from it, and from then on every reader asks `plan.ground`. No pass
  re-levels, nudges, harmonizes, or "finishes" the ground — dressing chooses
  materials, never levels.

---

## The pipeline these laws force

1. **SKETCH** — the plan speaks first: anchors, radii, bearings, uses. Pure
   data, no blocks, no field.
2. **CONSTRAIN** — every need becomes a landform through the kernel
   vocabulary. This is the ONLY leveling mechanism in the world.
3. **ROUTE** — A* on slope cost over the constrained field; each route's
   profile is relaxed to its grade bound and absorbed as a ribbon. Routing
   may iterate with constraining; both happen before anything is a block.
4. **FREEZE** — classify, build the column plan, fill the biomes. The field
   retires. `plan.ground` is now the world's single ground truth.
5. **DRESS** — surfaces replace surface blocks in place; buildings seat on
   their micro-plateaus and sink foundations; walls stand on the rim the
   field already smoothed; trees scatter where the clearing lets them.
   Nothing in this stage moves earth. Nothing in any stage ever will again.

## The acceptance bar (probes are the law's court)

Every build must pass `tools/root-poc/verify.mjs`, which asserts at minimum:

- **No lips**: zero surface blocks (paths, flags, quay stone) standing above
  the plan's ground — equivalently, zero path blocks with grass beneath.
- **No floaters**: zero stairs or surface blocks over air.
- **No interpenetration**: building footprints pairwise disjoint with two
  blocks of daylight — enforced by construction, re-proven by the probe.
- **Grade law**: along every route centerline, consecutive ground deltas
  are −1, 0, or +1, and the relaxed profile's grade bound holds end to end.
- **Wall continuity**: consecutive wall-base deltas along the ring ≤ 1.

A build that fails any probe does not ship, does not install, and does not
get argued with. The probe is cheaper than the debate.

## What this does not claim

This contract governs the demo path. It does not (yet) claim the main
pipeline, the Loam document surface, or the battery. Whether the main
pipeline is ported onto these laws is Kai's call, made against walked
worlds, not against this document's prose. What the contract does claim is
this: any world built under it cannot exhibit the defect class the last
month was spent fighting — not because we got better at fighting it, but
because the language it was written in no longer exists.

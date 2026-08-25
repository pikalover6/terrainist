# WS-C — Model-behavior audit over the battery corpus

(Filed by the orchestrator from the WS-C agent's returned report, 2026-08-24.
All scripts alongside this file are rerunnable; zero LLM spend; repo untouched.)

**Corpus:** 50 docs, 48 generate.logs, 8 prompt families; gemini-3.7-flash ×29, gpt-5.6-luna ×19.

## Headlines

1. **Catalog reach:** 99/428 archetypes (23.1%), 46/180 props (25.6%),
   147/722 catalog (20.4%), 7/18 form packs. `infrastructure` 0/27,
   `waterworks` 1/22, `memorial` 2/30, `rural` 7/61. 12 distinct generators
   across 920 generator nodes; `precinct.airport@0` never used.
2. **Form packs declared but never spent:** nautical_pirate 0/20 members
   reached, arcane_magical 0/16, alien_scifi 0/19, agrarian 0/16,
   wilds_camps 0/12, swamp_witch 0/15. classical_mediterranean reaches 11/24
   — and it is the ONLY pack spelled inside a fenced kit example.
3. **PARROTING CONFIRMED:** 36/43 docs (84%) use archetype vocabulary
   entirely contained in the kit's own text. Only 5 archetypes corpus-wide
   are used that the kit never spells (all classical); 170 of the 175
   never-mentioned archetypes are never used by any doc, ever. Four
   independent troy rolls reproduce the kit's example prefer list verbatim
   (tie2 exactly; r22 +1 id).
4. **Envelope smoking gun:** 171/204 (84%) of building.grammar envelopes are
   triples printed literally in the kit vs 10/92 (11%) for bespoke-program
   envelopes (the one field with no kit table). The kit's cathedral box
   [15,17,21] is authored 7×, including near-copies on Priam's palace.
   Where the kit supplies a number the model copies; where silent, it invents.
5. **Structure:** tree depth is 2 in ALL 50 docs; median 20 nodes; median 10
   constraints. 677/716 constraints omit `strength`; `hard` is NEVER written.
   `connected`/`via`/`clearance`/`side` are dead vocabulary.
6. **Programs:** 0/50 docs used the full 3+3 budget; mode 1 landmark + 1
   plugin; 12 docs asked for zero. 1 of 108 emitted programs has
   `conforms: true`. Program source is ~66% of a median doc's bytes.
7. **Harness:** 81% one-shot authoring; median 3 model runs/world (25% make
   5), each re-sending the 277KB kit (~99k input tokens/run; ~378k in vs 83k
   out per world). LOAM-T118 SCATTER_RADIUS_UNITS = 53% of all authoring
   rejections AND survives to compile 27×. E404 CONSTRAINT_DEMOTED hits
   38/48 runs (median 6); W411 RETAINING_REFUSED 379 total.
8. **Cost (current 3/3 regime, n=36):** world median $0.3427 (max $0.98);
   authoring $0.2391, programs $0.1217 (~30%).
9. **Set-piece question (Kai's citadel):** acropolis_terrace used 0× ever
   (15 docs declare its pack; 10 troy rolls). 35/50 docs promise grandeur in
   their own intent tokens; 31 spend no program on it. Grand-named buildings
   are only 1.8× ordinary floor area (255 m² vs 143 m²), capped by the kit's
   cathedral box; archetype pinned on 5/31. **Troy: 9 of 10 rolls make the
   citadel a plain ~15×21 grammar box with no archetype; the landmark budget
   goes to trojan_horse 11/11.** Corpus-wide, landmark programs chase the
   prompt noun (monsters, ships, horses); only 2/36 are buildings a
   settlement organises around.

## What this means for kit redesign and price

- **The fenced examples ARE the spec; the ~242KB of prose is decoration.**
  Anything that must be reachable has to be in a fenced example or a
  machine-generated per-run menu. Cutting ~100KB of prose costs almost
  nothing in reach and ~35% of input tokens per run.
- **Reach is retrieval, not capability.** One hallucinated id in 50 docs —
  the model never guesses, it just cannot see 428 archetypes listed once in
  prose. A prompt-conditioned candidate menu (~50 era-filtered ids per run)
  plausibly moves reach from 23% toward pack-complete and is CHEAPER than
  today's kit.
- **The bespoke budget is underspent and misaimed.** A dedicated civic
  set-piece budget line, with acropolis_terrace-class entries as the fenced
  worked example, is the cheapest fix for the citadel (~$0.04/world).
- **Price is loop cost.** Fixing the T118 units ambiguity removes ~half the
  retry pressure; halving the kit halves the dominant cost term. Both are
  kit/spec edits, not model changes.
- **The authored layer is largely advisory today.** conforms 1/108,
  demotions in 38/48 runs, strength never `hard`. Before adding vocabulary,
  teach the two or three contracts that actually bind (ground conformance,
  strength, envelope).

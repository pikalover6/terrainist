# THE STOCKTAKE RUN — ground-truth spec

Grilled with Kai on 2026-08-25 (rounds 1–4) and **RATIFIED 2026-08-25**.
This file is **immutable for the Run**: the Run reads it, never edits it. Everything that
changes lives in `docs/STOCKTAKE-RUN-LEDGER.md`. Anything the Run believes
that is not in this file, the ledger, `AGENTS.md` or `CLAUDE.md` is not
knowledge — it is baggage, and after a compaction it is gone.

## 0. The mandate, in Kai's words distilled

Drive the Great Stocktake to its done condition **autonomously**: no popups,
no waiting, everything written down and reversible. Judge worlds yourself,
as a distillation of Kai's taste — with probes that read the voxels, not
renders alone. **Question everything**: be willing to step back and
re-evaluate whole systems, including whether the author should see examples
at all. Clean the slop, which is far broader than dead code. Law #1 of
taste: **a generation must scream its prompt**.

## 1. Glossary (canonical terms; no implementation detail lives here)

- **Generator** — the pipeline that turns a text prompt into a Loam document
  by working with models: intent pre-pass, authoring against a kit, program
  authoring, wiring, compile-feedback rounds. It is the only place a model
  is ever called.
- **Compiler** — the pure function (document, seed) → world folder. No model
  touches it; the same inputs always give byte-identical output.
- **Kit** — the authoring instructions a model reads (settlement, terrain).
  Downstream of the code: a kit teaches what the code does, never a
  workaround.
- **The Great Stocktake** — the campaign (workstreams A–F) that replaced
  sprinting with measured, ratified remediation.
- **The Run** — the autonomous push this spec governs: driving the Stocktake
  to its done condition without Kai in the loop.
- **Unit** — one bounded piece of the Run's work with a ledger entry and, if
  it changed the tree, exactly one commit.
- **Ledger** — the single running file where the Run records state,
  decisions taken, spend and verdicts.
- **Gate** — a checkable condition the Run must satisfy before it may call a
  world, a workstream or itself done.
- **Golden prompt** — one of the fixed prompts in the golden-prompt suite;
  together they are the regression bar for authoring behaviour.
- **Probe prompt** — a fresh prompt the Run writes on purpose to exercise
  behaviour no golden prompt reaches. One-off unless promoted.
- **Icon** — what a prompt *screams*: the thing whose absence fails the world
  regardless of realism (the Trojan horse and a dominant citadel for Troy;
  the Statue of Liberty for New York).
- **Deck** — a set of installed worlds with walk cards.
- **Walk** — Kai's in-game review of a deck. **Walk verdict** — Kai's
  recorded judgement; the court of appeal over every other verdict.
- **Instrument** — the Run's stand-in for a walk: compile diagnostics,
  bespoke probes, renders with the disputed area pinned, and code as the
  final word whenever a read is in doubt. **Instrument verdict** — its
  recorded judgement, always citing the taste lines it applied.
- **Probe** — a bespoke script written for one question, reading the actual
  world or compile output to establish ground truth. Has no standard shape.
- **Blinded read** — a second model's answer to the same station questions,
  given before it sees any other reader's answer. A failsafe the Run may
  invoke; not part of the instrument.
- **Anchor** — a past world Kai judged GOOD, pinned as (document, commit),
  used as a regression fixture.
- **Regression** — an anchor or a taste feature that was present and is now
  absent or worse. Never acceptable.
- **Byte-identity staging** — landing a behaviour change behind a switch
  whose off-state is proven byte-identical, flipping it separately, and
  attributing every moved baseline.
- **Slop** — work that no longer earns its place: dead paths, abandoned
  approaches still wired in, code whose believed behaviour differs from its
  actual behaviour, duplicated authorities, prose-maintained registries,
  drifted docs, tests that pin nothing, rotted tools, instruction bloat.
  (Being narrowed in the grill.)

## 2. Scope

**In:** authoring behaviour (both kits, the generator loop, what the model
reaches for — archetypes, programs, palettes, densities); the machinery
around bespoke programs (invocation, placement, prompting, wiring — not the
author's output quality, which is deprioritized); slop across the
whole codebase (compiler, stdlib, spec, agents, cli, tests, tools, docs,
instruction files); A2 registry exports and A3 dynamic assembly; the
golden-prompt harness and its metrics.

**Out:** the parked compiler backlog (flight object native-first, landmark-
border rule, entry-residue trim, shoulder/verge, n12 tread pick, WP ladder
#10, pirates GO); the web viewer's look; the catalog go-ham side branches;
D2 model shootout (Gemini 3.7 Flash stays pinned); Tripo / mesh assets
(Kai's 2026-08-08 deprecation stands — the shootout's "reads as a lump" was a
mechanism finding); `battery/` (read-only) and Kai's saves (untouchable).

**Conditional:** a compiler *bug* a gate exposes is fixed code-first, always.
A compiler *feature* a gate needs (decay that applies at decline 0.9, street
trees, a ruined-tower grammar…) may be built behind a switch via byte-
identity staging if it is small or medium; a feature that would be a new
subsystem (more than about a day) is written up as a proposal in the ledger
and skipped.

## 3. Laws (each one line; each load-bearing)

1. **No regressions.** An anchor recompiled at head that differs from its
   anchor compile, or a taste feature lost 3-of-3 (§6), is a bug before it is
   anything else.
2. **Scream the prompt.** Icons present and dominant beat realism. A
   beautiful plausible world missing its icon FAILS.
3. **Code before kit.** A kit finding that is a code bug is fixed in code
   first; a kit never teaches a workaround; a golden baseline never pins one.
4. **Probe before theorize.** Renders and impressions lie; a bespoke probe
   reading the world or the compile is how ground truth is established, and
   code is the tie-breaker for every doubtful read.
5. **Byte-identity staging.** Behaviour changes land behind a switch proven
   byte-identical off (shasums on troy_r22 / thalassa_polis / pirates_r22 +
   the six k1 docs; FULL suite green), flip separately, attribute every
   moved baseline.
6. **Deletion tiers.** Byte-identical deletions land free (one commit each).
   Byte-moving changes land after attributed triage AND an instrument verdict,
   one commit each with a before/after render pair in the ledger. Kai's veto
   is post-hoc via the ledger, never pre-approval.
7. **Metrics are floors and alarms, never the verdict.** Every verdict is a
   read backed by a probe. A metric that stops agreeing with reads is
   retired, not optimised.
8. **Act on decisive numbers only.** A system replacement ships when the new
   arm beats the current one on the icon bar by more than the measured noise
   on a 3-repeat run, with no anchor regression and no lost icon, and is one
   revert away. Anything less is a write-up.
9. **Pre-register.** Every experiment states its prediction, arms, cost and
   decision rule in the ledger before a cent is spent; before-samples are
   collected before the bytes move.
10. **Product rule kept:** the generator never gets a self-repair loop on
    renders. (The *dev* Run iterates; the product does not.)
11. **The tree:** `battery/` read-only; never `--replace` on installs; no
    deletions in the saves folder (byte-for-byte duplicates included — not
    worth the risk); never run formatters; heavy vitest one at a time per
    `AGENTS.md`; never emit worlds from an unverified dist.
12. **One turn, one unit, one ledger update.** The NOW block is rewritten at
    the end of every turn without exception.

## 4. Taste — the lines every verdict cites (T-numbers)

- **T1** The world screams the prompt. Write the prompt's icon list *before*
  seeing any document; each icon must be present and **dominant** (scale,
  height, prominence) over the ordinary buildings. Realism is secondary.
  Example: New York without the Statue of Liberty FAILS, however plausible
  the block. The stranger test: someone dropped into the world with no
  context should be able to name the prompt.
- **T2** Troy = a Trojan horse AND a grand citadel massively bigger than
  every other building AND dense streets — arrived at by the model on its
  own, not by overfitting the prompt.
- **T3** The archetype-less grammar box (no `archetype`, tall envelope, flat
  roof, regular window grid — "the modern multistory building") is a defect
  wherever it appears in a pre-modern world; zero is the bar.
- **T4** A walled city has a town inside its wall: buildings dominate walls;
  one keep and five houses in a full circuit is a FAIL (montfort_hill_k1).
- **T5** Hill towns: flattened terraces that follow the hill's shape are
  right; a sparse dome with a handful of houses is wrong.
- **T6** The r5 metropolis is the anchor of "overgrown ruined metropolis":
  ruined buildings that read as fallen towers, vines on the buildings, trees
  in the streets, a river through the city (tasteful, not required), a
  ruined palette (mossy cobblestone, coarse dirt, deepslate) — not a clean
  grey-concrete city with a few named archetypes.
- **T7** Density reads as the prompt's settlement: a city is a city (lots per
  10k envelope cells at the anchor's order — troy_k1 19.7 is a city; 2.2 and
  3.2 are not).
- **T8** Bespoke is non-negotiable: a prompt that asks for a two-headed cat-
  dog idol gets a two-headed cat-dog idol, or the world FAILS, full stop.
- **T9** Era fidelity: no forbidden-era archetypes or materials.
- **T10** Kai's walk verdicts override every instrument verdict, always.

New taste lines learned during the Run are appended in the ledger as
T11…, each with the deck and station that taught it.

## 5. Done — the gates

`STATUS: DONE` may be written at the top of the ledger only when ALL hold:

- **G1 Golden bar.** Each of the 11 golden prompts, generated fresh at the
  final kit/harness bytes, passes the instrument (T1–T9) — 3 repeats where
  a pass is contested; icons present 3-of-3.
- **G2 The three named worlds.** A fresh walled-medieval-city generation has
  a real town inside the wall (T4, T7); a fresh metropolis matches or beats
  r5 on the T6 checklist; a fresh Hellenist city reads as a city (T7).
- **G3 Anchors.** The four anchors (§6) recompiled at head match their anchor
  compiles, or every difference is attributed to a ratified change and read
  as not-worse by the instrument.
- **G4 Probe prompts.** The last **6** probe prompts surfaced no new failure
  class (a failure class = a cause, not a symptom).
- **G5 Slop census.** Every finding in classes 1–7 (§8) has a disposition
  (deleted / fixed / rewritten / kept-with-note / proposal), and classes 1–3
  are executed, not just listed.
- **G6 Workstreams.** WS-A: A2 exports landed; A3 or the winning kit arm
  shipped; kit measured 3×3 at the final bytes. WS-B: audit findings folded.
  WS-C: closed (audit). WS-D: D1 measured (cost per world before/after);
  D3 feedback-round pruning done or written up. WS-E: closed. WS-F:
  inventory + kill-ladder executed per §3.6.
- **G7 Instruments committed.** The icon metric, the probes that decided
  verdicts, and every VERDICT.md are in the tree; the final deck is
  installed with walk cards and the closing report is in the ledger.

Other STATUS values: `RUNNING` (default), `BLOCKED: <reason>` (provider
402, cap reached, a decision only Kai can take — the Run stops the turn and
says so plainly), `DONE`.

## 6. Judging

**The instrument** (open-ended by design — pick what the question needs):
compile diagnostics; bespoke probes (a 50×50 voxel window read as ASCII,
column dumps, plan-vs-voxel attribution, pristine-vs-baseline diffs,
density/volume censuses); top-down and isometric renders with the disputed
area cropped and pinned; street-level sections at least 3 columns wide
(1-column slices misread — known failure); code as the final word. A
blinded Gemini 3.7 Flash read (OpenRouter) is an optional failsafe, not
part of the record.

**The verdict record** — `docs/decks/<deck>/VERDICT.md`: the icon list
(written before the doc was read), per-station reads with the probe or
render that backs each, the T-lines applied, PASS/FAIL per gate, and what
the Run will do about each FAIL.

**The icon metric** (added to `tools/golden-prompts/`): (i) icon presence —
the pre-written icon list matched against named nodes / archetypes /
programs in the document and the compiled world; (ii) icon dominance —
height and footprint vs the median building; (iii) density — lots per 10k
envelope cells vs a per-prompt floor; (iv) archetype-less box count (zero in
pre-modern worlds); (v) era fidelity (T9); (vi) the old metrics (validator
pass-rate, diagnostics, reach) as a floor only. Law 7 applies: a metric
that is being gamed (a node *named* statue_of_liberty that is a box) loses
to the read.

**Every deck confounds three things** — the compiler, the authoring roll
and the teaching. Separate them before concluding: an archived document
recompiled at head isolates the compiler (the anchors do this for free); a
fresh roll at frozen kit bytes isolates authoring noise; only a kit diff at
fixed code isolates teaching. Renders catch premise failures before any
deeper read.

**Regression standard.** Compiler: an anchor doc recompiled at head vs its
anchor commit — the first diff counts. Authoring (noisy: archetype set 35 %
stable at temp 0): a feature or icon is *lost* when absent in 3 of 3 fresh
runs where it was present; absent in 1 of 3 is flagged noise.

**Anchors** (document, commit): metropolis r5 = `battery/candidates/p4-gem1/
overgrown_metropolis_hideout.loam.json` @ 9b4dd50; hellenist r5 =
`p5-gem1/modern_hellenist_assault.loam.json` @ 9b4dd50; troy r22 =
`troy_r22/trojan_horse_troy.loam.json` @ 25e5e68; pirates r16 =
`p1-tie2/pirate_unicorn_war.loam.json` @ 200209b.

**Probe prompts.** Written on purpose, each targeting something no golden
prompt exercises (a form pack at 0 % reach, a two-place prompt, an unusual
era or climate, terrain-only, an icon that lives in a prop pack, a bizarre
bespoke ask). One world each, judged by the instrument, logged in the reach
ledger (what it exercised, what failed, the cause). A probe prompt that
*fails* is promoted into the golden set once its cause is fixed; passes stay
one-offs. ~40 % of spend.

## 7. Experiments — the systems the Run may question

Each is a pre-registered, measured hypothesis on the icon metric + golden
bar; law 8 governs acting on the result. Kai's bets, in order: E1, E5, E2.

- **E1 Examples at all.** Current kit vs a rules-only kit (Loam spec +
  validator-derived tables, zero fenced examples) vs A3 dynamic assembly.
  Three arms × 3 repeats on the authoring harness (+ free compiles for the
  icon metric). Explicitly required by Kai.
- **E2 The machinery around programs — NOT the program author.** Kai's
  ruling at ratification: landmarks look good when prompted; fiddling with
  the bespoke author's output quality is one of the least concerns and is
  deprioritized even in general. What is in scope is the machinery around
  them: *when* a program gets called (the landmark budget chasing the prompt
  noun, programs authored but never invoked), *where* it is placed (the
  archetype-less citadel box, the horse hugging the wall), how it is
  prompted and wired. The mechanism stays LLM (T8 is the requirement, not
  the mechanism).
- **E3 The intent pre-pass.** Help, or bias toward its own tokens?
- **E4 Compile-feedback rounds.** Better worlds, or only fewer diagnostics?
- **E5 One 50 KB document vs staged authoring** (site plan → districts →
  buildings).
- **E6 The constraint language** (hard/soft tethers, demotion) as the
  model-facing placement abstraction. Spans the compiler: write-up only
  unless the change is small.
- **E7 Catalog size** (722 ids): is the model drowning?
- **E8 The scorer's own metrics** — replaced by §6's icon metric; the old
  ones demoted to floors.

## 8. Slop — the census classes, in order of value

1. **Belief vs behaviour** — what a module's comments, docs or kit claim vs
   what a probe shows (the "behaved differently for a month" class).
2. **Abandoned approaches still wired** — half-migrated seams: declare/build
   split, report-vs-emit block-list divergence, driver write-through, the two
   kit files vs the compiler registries.
3. **Duplicated authorities** — two places deciding one thing (heights,
   placement, palettes).
4. **Dead paths** — shipped-true flags with dead off-paths, dead passes
   (junction-steps, silenced street-stairs/descent, terminus landings).
5. **Tests that pin nothing** and goldens taught around bugs.
6. **Doc drift** — design docs asserting what the code no longer does.
7. **Tool rot and instruction bloat.**

Disposition per finding: delete / fix / rewrite / keep-with-note /
proposal. Effort goes mostly to 1–3; 4 is cheap cleanup.

## 9. Mechanics

**Session.** This session, after Kai's `/compact` (text in §11) and the
resume drill; kicked off by Kai's `/goal` (text in §11). The goal judge is a
small model reading a mechanical condition — it must never need taste, and
the Run never ends a turn in language that suggests impossibility unless it
has written `STATUS: BLOCKED`. Context hygiene: tool outputs kept small
(head/tail, counts), never cat large files — a context overflow kills the
goal loop.

**The ledger** (`docs/STOCKTAKE-RUN-LEDGER.md`), top to bottom: `STATUS`;
NOW (what is in flight, the next unit, the last commit, spend to date);
DECISIONS (every fork taken, with the reversible default chosen and how to
undo it); SPEND (per unit, running total vs cap); VERDICTS (pointers to
VERDICT.md files); REACH (probe prompts); PROPOSALS (skipped big features);
TASTE (T11…); UNITS (append-only, newest last: what, why, files, tests
COUNTS, commit). The NOW block is rewritten at the end of every turn.

**Units and git.** One unit = one commit (single evocative sentence subject,
trailers per CLAUDE.md), pushed to origin after each; branch
`claude/project-upgrade-planning-uwlziw`; never merge to main. FULL suite
gates any compiler-code commit; the golden harness gates kit commits.

**Subagents.** Standard Agent flow from `.claude/agents/`; at most 4
concurrent; **opus-5-low is the default and does almost everything** (low
undersells the model — it does what it is asked); medium only for genuine
diagnosis or judgement; high and above is the orchestrator's own work
(design, planning, docs, verdicts). No subagent spawns subagents. Every
brief names: the files owned, exclusions, this spec's path (subagents do not
inherit CLAUDE.md), the vitest discipline, "do not commit". Fork subagents
sparingly, for context-heavy handoffs only. No Workflow/ultracode.

**Spend.** OpenRouter cap **$35**, prioritised: arms (E1) first, then the
before-sample, then probe prompts, then kit 3×3 measurements, then the final
deck. Cheap first: authoring-only harness runs ($0.64/pass) where a compile
is not needed. On a 402 or at the cap: `STATUS: BLOCKED`, stop. Gemini
failsafe reads count against the cap.

**Kai's channels.** Chat messages act immediately (a walk verdict given in
chat outranks the instrument, law T10). No client-log polling; Kai says when
to check. Checkpoint decks on channels `k2`, `k3`, … per milestone (after
each arm decision and at done), with walk cards in the deck folders.

**Housekeeping.** Prune the scratchpad worktrees, the redundant perf
worktree, the `.claude/worktrees/agent-*` checkout and stale branches; never
touch saves or `battery/`.

## 10. Order of work

1. Before-sample: the 11 golden prompts generated once at the current kit
   bytes (~$3.3) + the four anchor recompiles (free) — collected before any
   bytes move. (Law 9; E1's arms are prioritised in spend but *measured
   after* this baseline exists.)
2. Mechanism probes on the three named worlds: the r5 metropolis bisection
   (same doc old vs new compiler; new doc vs old doc), montfort's hillside
   replan, hellenist's density — compiler bugs fixed code-first, features
   staged or proposed.
3. The icon metric; the rules-only kit; E1's three arms measured.
4. Remediation steered by the results (A2 exports, A3 or the rules-only kit,
   slop classes 1–3), E2–E7 as they become cheap.
5. Probe prompts interleaved from step 3 on.
6. Slop classes 4–7.
7. Final deck, closing report, `STATUS: DONE`, stop.

## 11. Kickoff texts

**Unit 0 (this session, before the drill):** lean `CLAUDE.md`; `AGENTS.md`
"Current state" → pointer to the ledger; the funnel cells frozen to
`docs/archive/memory-cells/` after one pass confirming each ratified
decision lives in this spec, AGENTS.md or a design doc; `tools/session-log`
retired; auto-memory pruned to user/environment facts + one pointer to this
spec; the ledger created with `STATUS: RUNNING`.

**Kai's `/compact` text:**

    /compact The Stocktake Run is starting. Keep only: read docs/STOCKTAKE-RUN-SPEC.md, then the NOW block of docs/STOCKTAKE-RUN-LEDGER.md, then act. Carry nothing else from the pre-run campaign — no prior rulings, no session history, no numbers; the files are the memory.

**The resume drill:** Kai asks one cold question ("what are you doing, what
is next, what are the laws, what is the spend?"). Pass = every answer
traceable to CLAUDE.md, this spec or the ledger. Run once after unit 0, once
after `/goal`.

**Kai's `/goal` text (≤ 4,000 chars; the judge checks a line, not taste):**

    /goal The top of docs/STOCKTAKE-RUN-LEDGER.md reads "STATUS: DONE", the git working tree is clean, and the last commit is pushed to origin. Work unit by unit per docs/STOCKTAKE-RUN-SPEC.md; rewrite the ledger's NOW block at the end of every turn. Stop early only if the ledger reads "STATUS: BLOCKED". Constraints: never merge to main; never delete anything in the Minecraft saves folder; never use --replace on installs; battery/ is read-only; OpenRouter spend stays under the cap recorded in the ledger.

## 12. Parked, not cancelled

The compiler backlog (§2); catalog go-ham side branches; D2 shootout;
region-scope A/B (inside A3); B1(b) proposal-turn line item; T008 unknown
prop-param keys lead; the sealess-river T112→T110 item; Tripo.

**Standing rulings the slop census must respect** (Kai-ratified before the
Run; a class-4 "dead path" that is one of these is kept-with-note, never
deleted): `STAIR_DRESS = false` by walked verdict — its code is kept as the
flight object's vocabulary; the stair-corpus off-path is the ratified
fallback until the native flight object lands; the n13 road-pull line is
THE line and is not re-tuned; program cost is a non-goal (no diagnostic,
no kit cost law, no fuel tightening); the forest 0.02 coverage gate is
calibration, code is right; gate leniency is permanent (`SUSPENDED_GATE_
CHECKS`; E494/E495 are never suppressible); the candidate-menu flag is OFF
"not yet" — E1/A3 may revisit it with numbers; the report's `blockSpans`
are not the emitted world (a class-2 seam, to be fixed or documented, never
assumed away).


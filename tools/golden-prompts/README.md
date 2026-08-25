# The golden-prompt suite

The regression harness for kit edits (STOCKTAKE A0).

A compiler change proves itself by shasum against a clean-checkout build. A kit
change cannot: what it changes is a model's behaviour, and the model is
nondeterministic even at temperature 0. So a kit edit gets the next best thing —
a fixed roster of prompts, authored before and after, with the deltas scored.

```
node tools/golden-prompts/run.mjs --dry-run                     # zero API calls
node tools/golden-prompts/run.mjs --label baseline-pre-edit     # ~$0.64, ~20 min
node tools/golden-prompts/run.mjs --label after-units
node tools/golden-prompts/score.mjs runs/baseline-pre-edit runs/after-units --gate
```

## What a run is, and is not

It is **authoring only**: the intent pre-pass and one `authorLoamDoc` call per
prompt, with the validator's retry loop intact. No bespoke programs, no compile
rounds, no emit. Those are three more sources of variance and roughly three
quarters of the bill, and none of them is what a kit edit moves first.

The intent pre-pass runs, because production authoring runs it and injects its
output into the author call — but it is **cached to disk** (`intent-cache.json`).
Paying for the same classification on every pass would add cost and variance to
a stage no kit edit touches. `--refresh-intent` re-classifies; `--no-intent`
skips the stage entirely.

## Cost and cadence

**Measured 2026-08-24: ~$0.058 per prompt, so a full 11-prompt pass is ~$0.64.**
(WS-C's $0.2391 figure is per *world* — a median of three model runs each
re-sending the kit. A golden run is one authoring call, so it costs a third of
that or less.)

Wall time is the real cost: an authoring call against the 277 KB settlement kit
takes **60–360 s**, median ~2.5 min, so a full pass is **~20 minutes** at the
default concurrency of 3. Run it detached. The kit is the latency as well as
the bill — which is WS-D's whole thesis, visible from here.

## What is recorded

Per prompt: validator pass/fail, per-attempt diagnostic codes, attempt count,
prompt/completion/reasoning tokens, cost, wall time, the resolved model, the
classified intent — and a census of the authored document: archetypes (resolved
through the compiler's own `archetypeOfTags`, so an implicit tag spelling counts
the same as an explicit `params.archetype`), form packs, props, species,
generators, node count, tree depth, constraint count and strength usage,
envelope triples, forest nodes, program references, document bytes.

Per run: the **sha256 of the kit bytes the model was actually sent**. A score
delta always names the kit bytes that produced it; a delta whose kit sha did not
move is measuring model noise, and the scorer says so.

Every metric in `score.mjs` exists because some audit finding or WS-C headline
predicted it would move — `LOAM-T118` for the forest-radius units cluster,
`kitLiteralEnvelopePct` for the parroting hypothesis, `archetypesReached` for
catalog reach, `forestFillsAtOrAboveCoverage` for the terrain kit's silent
biome bug. A metric nobody has a hypothesis about is noise, and noise is what
makes a regression harness stop being read.

## The noise floor — read this before believing a delta

The model is **not deterministic run to run**, even at temperature 0. Measured
2026-08-24 (`runs/noise-1`, `noise-2`, `noise-3`): three prompts authored three
times each against byte-identical kits.

| metric | run 1 | run 2 | run 3 | spread |
| --- | ---: | ---: | ---: | ---: |
| `walled_medieval_city` archetypes | 15 | 14 | 11 | **4** |
| `troy_horse` archetypes | 10 | 12 | 10 | 2 |
| `fjord_terrain` species | 4 | 4 | 8 | 4 |
| constraints (all three prompts) | | | | 46–67% |
| `kitLiteralEnvelopePct` | 28.6% | 30.8% | 23.1% | **7.7 points** |

The set churn is worse than the counts: `walled_medieval_city` drew on **20
distinct archetypes across the three runs, of which only 7 appeared in all
three and 7 appeared in exactly one.** The archetype set is roughly **35%
stable** on a settlement prompt. So the *identity* of what a diff reports as
gained and lost is mostly re-roll, and a single-sample claim about catalog
reach is not a claim about anything.

`score.mjs` knows these numbers and prints `within noise` beside any delta that
does not clear them. **Stable enough to read at n=1:** node count, form packs,
generators, document bytes, pass/attempt counts, cost, and the targeted
diagnostic counters — those move because of the bytes you changed and stay
moved. **To make a reach claim, run repeats**, the way `noise-1..3` did.

This was learned the expensive way: the cluster-1 and cluster-2 reports quoted
archetype deltas of −2, −3 and −7 as if they were results. They were re-rolls.

## The gate

`--gate` turns two numbers into an exit code: authoring must not get less
reliable, and `LOAM-T118` must not come back. Everything else is for a human to
read. The suite is a measuring instrument, not a verdict — an edit that trades
two archetypes for a working forest radius is a judgement call, and the point of
printing the whole scoreboard is to let a person make it.

## The roster

Eleven prompts in `prompts.json`. Seven are the battery's own families, on the
battery's own seeds, so a golden run and an archived battery world differ by kit
bytes and compiler build alone. Four are new, and each was added for a finding
that the battery families cannot exercise:

| id | why it is here |
| --- | --- |
| `walled_medieval_city` | Kai's citadel — castle/keep/gatehouse/acropolis_terrace have never once been reached in 50 archived docs |
| `railway_town` | the bare `station` alias, whose ownership the settlement kit states twice and differently |
| `desert_wilderness` | a treeless world — the case the "at least one forest" checklist line was never written for |
| `fjord_terrain` | a whole-region wilderness fill, where the terrain kit's recommended density band silently paints the map forest |

Each entry carries a `watches` list: what to look at in that document, and which
finding it belongs to. They are notes for a human reading a diff, not assertions
the runner checks — a semantic assertion the model can satisfy by accident is
worse than no assertion at all.

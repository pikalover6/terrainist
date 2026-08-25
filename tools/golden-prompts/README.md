# The golden-prompt suite

The regression harness for kit edits (STOCKTAKE A0).

A compiler change proves itself by shasum against a clean-checkout build. A kit
change cannot: what it changes is a model's behaviour, and the model is
nondeterministic even at temperature 0. So a kit edit gets the next best thing —
a fixed roster of prompts, authored before and after, with the deltas scored.

```
node tools/golden-prompts/run.mjs --dry-run                     # zero API calls
node tools/golden-prompts/run.mjs --label baseline-pre-edit     # ~$2.6
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

~$0.24 per prompt (WS-C's measured authoring median), so a full 11-prompt pass
is **~$2.6**. Run it at **cluster boundaries, never per edit.** A run takes a
few minutes at the default concurrency of 3.

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

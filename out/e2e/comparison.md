# 3 prompts × 3 models — `terrainist generate` e2e comparison

Run 2026-08-01 on branch `claude/project-upgrade-planning-uwlziw`.

Fixed across every run: `--keep-doc`, default size (512×512), default seed
(BLAKE3 of the prompt, so all three models get the *same* seed for a given
prompt), the settlement kit, and the default 2 compile-feedback rounds.
Temperature is 0 throughout.

| Model | OpenRouter id | Reasoning effort actually sent |
| --- | --- | --- |
| GLM 5.2 | `z-ai/glm-5.2` | `high` |
| GPT-5.6 Luna | `openai/gpt-5.6-luna` | `max` |
| DeepSeek V4 Flash | `deepseek/deepseek-v4-flash-0731` | `max`, then `high` |

All three ids were confirmed present in the live OpenRouter catalog, and both
Luna and DeepSeek accepted `reasoning: {effort: "max"}` with HTTP 200 on a probe
call, so no run needed the `max` -> `xhigh` -> `high` fallback for *rejection*
reasons. DeepSeek was nevertheless run twice: the `deepseekmax-p*` rows are the
requested `max`-effort runs, all three of which failed, and the `deepseek-p*`
rows are a `high`-effort re-run. Every other row sent exactly the effort listed
above.

Prompts:

1. A prosperous river-delta trading city with a walled old town, a working
   harbour, and farmland on the floodplain
2. A snowbound alpine mining town strung along a steep valley, with a frozen
   tarn, tunnels into the mountainside, and a timber church above the rooftops
3. A half-abandoned desert oasis town: a spring-fed palm garden at the centre, a
   ruined quarter crumbling at the edge, and caravan camps outside the walls

## Results

| Run | Model | Effort | Outcome | Author attempts | Revision rounds | err/warn | terrain/building/prop/road nodes | Tokens | Cost | Wall clock | Zip |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek-p1 | deepseek/deepseek-v4-flash-0731 | high | provider error | 1 | 0 | 0/12 | 8/12/12/1 | — | $0.0029 | 275s | — |
| deepseek-p2 | deepseek/deepseek-v4-flash-0731 | high | ok | 2 | 2 | 0/32 | 7/8/3/1 | 269248 | $0.0149 | 213s | 1.67 MiB |
| deepseek-p3 | deepseek/deepseek-v4-flash-0731 | high | provider error | 1 | 0 | 0/3 | 5/8/11/1 | — | $0.0033 | 372s | — |
| deepseekmax-p1 | deepseek/deepseek-v4-flash-0731 | max | provider error | — | 0 | 0/0 | — | — | $0.0000 | 601s | — |
| deepseekmax-p2 | deepseek/deepseek-v4-flash-0731 | max | provider error | — | 0 | 0/0 | — | — | $0.0000 | 601s | — |
| deepseekmax-p3 | deepseek/deepseek-v4-flash-0731 | max | provider error | — | 0 | 0/0 | — | — | $0.0000 | 602s | — |
| glm-p1 | z-ai/glm-5.2 | high | physics lint | 1 | 0 | 1/0 | 7/11/6/1 | — | $0.1830 | 96s | — |
| glm-p2 | z-ai/glm-5.2 | high | ok | 1 | 2 | 0/17 | 6/8/4/1 | 175323 | $0.0795 | 278s | 1.55 MiB |
| glm-p3 | z-ai/glm-5.2 | high | ok | 1 | 1 | 0/9 | 4/8/12/1 | 118279 | $0.0503 | 154s | 1.32 MiB |
| luna-p1 | openai/gpt-5.6-luna | max | physics lint | 1 | 0 | 1/0 | 6/15/14/1 | — | $0.0257 | 329s | — |
| luna-p2 | openai/gpt-5.6-luna | max | ok | 1 | 2 | 0/16 | 7/9/0/1 | 216722 | $0.0381 | 514s | 1.56 MiB |
| luna-p3 | openai/gpt-5.6-luna | max | ok | 1 | 1 | 0/6 | 4/8/9/1 | 145047 | $0.0278 | 352s | 1.48 MiB |

Columns: **Author attempts** is validation retries inside `authorLoamDoc`;
**Revision rounds** is compile-feedback rounds consumed; **err/warn** is the
final diagnostic count by severity; **nodes** counts generator nodes in the
final authored document by family. **Cost** is OpenRouter's own `usage.cost`
accounting, summed over every model call in the run.

## At a glance

### GLM 5.2 (`z-ai/glm-5.2`, effort `high`)

Perfect authoring reliability: every prompt validated on the **first attempt**,
with no validation retry anywhere in the matrix. Two of three prompts produced a
world; the third died on a compiler physics-lint failure, not an authoring one.
Mid-priced of the three — $0.31 across its three runs, dominated by glm-p1's
single $0.1830 call — and the fastest, at 96–278s per run. Document richness sits
in the middle of the pack (4–7 terrain, 8–11 building, 4–12 prop nodes).

One accounting oddity, reported rather than explained: OpenRouter's `usage.cost`
for glm-p1 ($0.1830) is ~3.3x what the catalog's per-token pricing predicts for
its 49,074 in + 25,970 out ($0.0549), while p2 and p3 come in slightly *under*
their computed figures. All costs in the table are OpenRouter's own accounting.

### GPT-5.6 Luna (`openai/gpt-5.6-luna`, effort `max`)

Works at `max` effort, with the same first-attempt authoring reliability as GLM:
1 attempt on all three prompts, no validation retries. Two of three produced a
world, and its one failure — luna-p1 — is the **same `LOAM-T110 UNSTABLE_FLUID`
harbour lint that felled glm-p1 on the same prompt**, from an independently
authored document. That shared failure points at the delta/harbour inlet carve in
the compiler rather than at either model.

Cheaper than GLM per run ($0.0916 across three runs vs $0.3128) but consistently
slower: 329–514s against GLM's 96–278s, roughly 1.7–1.9x the wall clock. It also
produced the fewest final warnings of any model on a completed run (6 on p3), and
the highest building/prop counts (15 buildings and 14 props on p1).

### DeepSeek V4 Flash (`deepseek/deepseek-v4-flash-0731`)

`deepseek-v4-flash-0731`'s provider consistently errors on our large-context
calls (worst at `max` effort, intermittent at `high`); 1 of 3 prompts produced a
world; **not currently usable for the multi-round pipeline.**

The mechanism is specific. A raw probe showed these failures come back as HTTP
200 with `choices[0].finish_reason = "error"`, `content: null`, and a large
reasoning payload — an upstream provider error that OpenRouter passes through
gracefully rather than as a top-level `error`. Our client masks it: the
`narrowCompletion` path in `packages/agents/src/openrouter.ts` inspects only the
top-level `error` field and discards `finish_reason`, so the run dies with the
uninformative "OpenRouter response had no message content".

`max` effort is not itself the problem — a probe at `max` on a small prompt
returned cleanly in 1.9s. All three `max`-effort runs failed on the very first
authoring call. At `high`, the failure moved later and became intermittent: p1
and p3 both authored a valid document on the first attempt and then died during a
compile-feedback revision call (each was run twice, failing both times), while p2
completed with 2 authoring attempts and 2 revision rounds. p2 is also the noisiest
world in the matrix, finishing with 32 warnings against GLM's 17 and Luna's 16 on
the same prompt.

Cost figures for the `max` runs are absent because the runs never reached the
usage summary; the `high` runs are by far the cheapest in the matrix
($0.0029–$0.0149), but on a 1-in-3 success rate that is not a meaningful saving.

## Client follow-ups

The DeepSeek investigation surfaced three gaps in the OpenRouter client that are
worth closing regardless of which model we settle on:

1. **Surface `choices[0].error` and `finish_reason` in the no-content error
   path.** `narrowCompletion` currently throws "OpenRouter response had no
   message content" for what is really a named upstream provider failure. The
   choice-level error object and `finish_reason` should both appear in the thrown
   message.
2. **Log the OpenRouter request id per call.** Without it, a provider-side
   failure cannot be traced back to OpenRouter's own records.
3. **Treat `finish_reason: "error"` as retryable.** It is a transient upstream
   condition, not a malformed document, so it belongs in the retry path rather
   than aborting the whole run mid-revision — which is exactly how deepseek-p1
   and p3 lost work they had already paid for.

## Reproducing

```
node tools/e2e-compare/collect.mjs             # metrics as JSON
node tools/e2e-compare/collect.mjs --markdown  # the table above
```

Both read only what a `--keep-doc` run leaves in `out/e2e/<run>/` — the run log,
the authored `.loam.json` and the world zip. No model is called.

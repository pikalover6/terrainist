# before-sample — the 11 golden prompts at the Run's starting bytes (unit 1, 2026-08-25)

Law 9 of `docs/STOCKTAKE-RUN-SPEC.md`: before-samples are collected before
any bytes move. This is that sample — every golden prompt in
`tools/golden-prompts/prompts.json` run once through the full product
pipeline (`terrainist generate`: intent pre-pass, authoring, bespoke programs,
2 compile-feedback rounds, emit) at commit **085e22d**, settlement kit
**c22cb4fe…** (284,406 bytes — the same bytes as the k1 decks), terrain kit
**0adfac8d…** (41,193 bytes), model `google/gemini-3.7-flash` at effort high,
each prompt on its harness seed. Made with
`node tools/golden-prompts/generate-all.mjs`; recorded with
`node tools/golden-prompts/record-generate-run.mjs` into
`tools/golden-prompts/runs/before-sample/` (the authored documents +
harness-shaped records + `summary.json`, scoreable with `score.mjs`).

This folder holds each prompt's `generate.log`. The documents are in the run
folder; the worlds are deterministic from (085e22d, document) and were not
committed. Costs are log-derived (authoring + programs).

| prompt | seed | status | attempts | rounds | programs | nodes | archetypes | final diags | cost | wall |
|---|---|---|---|---|---|---|---|---|---|---|
| prompt | seed | status | attempts | rounds | programs | nodes | archetypes | final diags | cost | wall |
| troy_horse | 303 | ok | 2 | 2 | 2 | 23 | 14 | 32 | $0.343 | 10 min |
| pirate_unicorn_isles | 301 | ok | 1 | 2 | 4 | 26 | 19 | 38 | $0.489 | 18 min |
| hellenist_harbour | 305 | ok | 1 | 1 | 2 | 17 | 11 | 14 | $0.229 | 8 min |
| alien_farm | 302 | ok | 1 | 0 | 3 | 31 | 7 | 9 | $0.177 | 7 min |
| metropolis_hideout | 304 | ok | 2 | 1 | 1 | 20 | 15 | 34 | $0.167 | 5 min |
| redwood_camp | 306 | ok | 3 | 1 | 3 | 25 | 8 | 12 | $0.379 | 12 min |
| glowcap_vale | 307 | ok | 1 | 0 | 1 | 24 | 9 | 7 | $0.096 | 3 min |
| walled_medieval_city | 311 | ok | 1 | 0 | 1 | 12 | 10 | 29 | $0.110 | 4 min |
| railway_town | 312 | FAIL | 1 | - | 3 | 23 | 13 | 0 | $0.170 | 11 min |
| desert_wilderness | 313 | ok | 1 | 0 | 0 | 4 | 0 | 0 | $0.012 | 1 min |
| fjord_terrain | 314 | ok | 1 | 0 | 0 | 9 | 0 | 0 | $0.014 | 1 min |

Totals: 10 of 11 compiled; 8 one-shot authorings; $2.19 (authoring $1.22 +
programs $0.97); ~56 min wall at concurrency 3.

**railway_town failed at the physics lint**, not at authoring: the document
authored in one attempt and all three programs were kept, then the emit
refused with `LOAM-T110 UNSTABLE_FLUID` (71 canal-water blocks would flow on
the first tick). The CLI labels this a compiler bug, not a document problem;
for the record the same document was compiled with `--allow-unstable`
(`railway_town/compile-allow-unstable.log`). Finding logged in the ledger;
fixed code-first in its own unit.

**First looks (top-down renders, not verdicts):** troy — a walled grid city,
the horse a small blob at the west gate, no dominant citadel (T1/T2 in
doubt). metropolis_hideout — a clean grey-concrete grid with a few vines, no
fallen towers, no trees in the streets (the T6 failure as described).
walled_medieval_city — a full wall circuit and road tangle around about a
dozen buildings (T4 in doubt). The instrument verdicts come in their own
units with a `VERDICT.md` each.

The four anchor recompiles collected alongside are in
`docs/decks/anchors/RECOMPILE-2026-08-25.md`.

**Icon metric (unit 11):** `tools/golden-prompts/runs/before-sample/icon-metric.json`
— the spec §6 metric scored on these documents (compiled in-process at
249a903+): icons present 11/11 prompts; dominance where measurable — the
leviathan, the mothership (×28 the median building's volume, hovering), the
keep and the elder glowcap dominant; the Trojan horse (h×1.87, a×1.91) and
the citadel (h×1.33) under the alarm line; density alarms on hellenist
(11.6 < 15), the walled city (8.2 < 15), alien_farm (3.4 < 6, buildings
against their own hull) and railway_town (did not compile — F1).

# E1 — should the author see examples at all? (unit 13, 2026-08-25)

Pre-registered as D31 in `docs/STOCKTAKE-RUN-LEDGER.md` before a cent was
spent; run as registered: three arms at the same prose, the same model
(`google/gemini-3.7-flash`, effort high), the same seeds, the intent
pre-pass cached — (1) **the kit** as shipped (`c22cb4fe`, 284 KB), (2) **the
core** (`e19f3bb0`, 251 KB: every fence withheld, worked sections removed),
(3) **the core + topic modules** chosen per prompt (7–17 modules, 4.6–22.6
KB, never the complete example) — three repeats each on the authoring
harness, **$5.90 all told** (kit $0.55–0.58 a pass, core $0.87–0.96,
modules $0.68–0.73), scored by the icon metric (in-process compiles, free)
and `score.mjs`. The run directories are `tools/golden-prompts/runs/e1-*`.

## The scoreboard

| run | kit sha | authored | one-shot | attempts | cost | prompt tokens | module bytes | icons present | dominant | density ok | compiled | boxes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| e1-kit-1 | c22cb4fe | 11/11 | 8 | 15 | $0.582 | 1154710 | 0 | 27/28 | 1/8 | 7/9 | 11/11 | 0 |
| e1-kit-2 | c22cb4fe | 11/11 | 10 | 12 | $0.546 | 875467 | 0 | 28/28 | 2/8 | 7/9 | 11/11 | 0 |
| e1-kit-3 | c22cb4fe | 11/11 | 8 | 14 | $0.558 | 985792 | 0 | 27/28 | 1/8 | 7/9 | 11/11 | 0 |
| e1-core-1 | e19f3bb0 | 11/11 | 0 | 29 | $0.960 | 2325927 | 0 | 27/28 | 0/8 | 6/9 | 11/11 | 0 |
| e1-core-2 | e19f3bb0 | 9/11 | 1 | 26 | $0.963 | 2054005 | 0 | 24/24 | 1/6 | 5/7 | 9/9 | 0 |
| e1-core-3 | e19f3bb0 | 11/11 | 1 | 26 | $0.873 | 2047157 | 0 | 28/28 | 0/8 | 6/9 | 10/11 | 0 |
| e1-modules-1 | e19f3bb0 | 11/11 | 3 | 19 | $0.734 | 1524734 | 179363 | 28/28 | 0/8 | 4/9 | 9/11 | 0 |
| e1-modules-2 | e19f3bb0 | 11/11 | 4 | 18 | $0.684 | 1445578 | 179363 | 28/28 | 0/8 | 6/9 | 10/11 | 0 |
| e1-modules-3 | e19f3bb0 | 11/11 | 5 | 18 | $0.684 | 1440343 | 179363 | 27/28 | 1/8 | 5/9 | 11/11 | 0 |

Per prompt, per arm, per repeat — one char per icon: D dominant, d present-not-dominant, p present, - absent

| prompt | kit | core | modules |
|---|---|---|---|
| troy_horse | dDp dDp dDp | ddp dDp ddp | ddp ddp dDp |
| pirate_unicorn_isles | ppp ppp ppp | ppp ppp ppp | ppp ppp ppp |
| hellenist_harbour | dpp dpp dpp | dpp dpp dpp | dpp dpp dpp |
| alien_farm | pd pd pd | pd pd | pd pd pd |
| metropolis_hideout | ppp ppp ppp | ppp ppp ppp | ppp ppp ppp |
| redwood_camp | dp dp dp | dp dp dp | dp dp dp |
| glowcap_vale | dp dp dp | dp dp | dp dp dp |
| walled_medieval_city | p-p pDp p-p | p-p pdp pdp | pdp pdp p-p |
| railway_town | dpp dpp dpp | dpp dpp dpp | dpp dpp dpp |
| desert_wilderness | pp pp pp | pp pp pp | pp pp pp |
| fjord_terrain | pp pp pp | pp pp pp | pp pp pp |

Reading the icon strings: one character per icon in the prompt's list;
`D` dominant, `d` present but under the dominance line, `p` present, `-`
absent. A program-carried icon (the horse, the mothership, the leviathan)
is read at the document level in these authoring-only runs — the harness
never authors program sources — and the same for every arm.

**`score.mjs`, each arm against the kit repeat it ran beside** (`~` = within
the noise floor measured on the kit's own repeats):

| pair | authored clean | one-shot | attempts | cost | diagnostics | archetypes reached | kit-literal envelopes | constraints with strength |
|---|---|---|---|---|---|---|---|---|
| kit-1 → kit-2 (noise) | 11 → 11 | 8 → 10 | 15 → 12 | $0.58 → $0.55 | 7 → 2 | 71 → 68 ~ | 30 % → 37 % ~ | 38 → 42 |
| kit-1 → kit-3 (noise) | 11 → 11 | 8 → 8 | 15 → 14 | $0.58 → $0.56 | 7 → 4 | 71 → 68 ~ | 30 % → 27 % ~ | 38 → 44 |
| kit-1 → core-1 | 11 → 11 | 8 → **0** | 15 → **29** | $0.58 → **$0.96** | 7 → **255** | 71 → 73 ~ | 30 % → 12 % | 38 → 13 |
| kit-2 → core-2 | 11 → **9** | 10 → 1 | 12 → 26 | $0.55 → $0.96 | 2 → 239 | 68 → 75 ~ | 37 % → 16 % | 42 → **0** |
| kit-3 → core-3 | 11 → 11 | 8 → 1 | 14 → 26 | $0.56 → $0.87 | 4 → 209 | 68 → 79 ~ | 27 % → 12 % | 44 → 17 |
| kit-1 → modules-1 | 11 → 11 | 8 → 3 | 15 → 19 | $0.58 → $0.73 | 7 → 55 | 71 → 69 ~ | 30 % → 13 % | 38 → 31 |
| kit-2 → modules-2 | 11 → 11 | 10 → 4 | 12 → 18 | $0.55 → $0.68 | 2 → 37 | 68 → 80 ~ | 37 % → 12 % | 42 → 36 |
| kit-3 → modules-3 | 11 → 11 | 8 → 5 | 14 → 18 | $0.56 → $0.68 | 4 → 20 | 68 → 79 ~ | 27 % → 14 % | 44 → 34 |

## The read, against the prediction

- **Icons:** every arm carries every icon at the document level within
  noise — 27–28 of 28 on the kit and the modules, 27–28 on the core (the
  core's second repeat lost two whole prompts to the validator). The one
  icon any arm drops is the walled city's **keep**, absent 2 of 3 on the
  kit, 2 of 3 on the core, 1 of 3 on the modules — authoring noise on the
  shipped kit, not an arm effect, and finding F17. The prediction held.
- **Dominance and density:** the compiler's, as predicted — the kit reads
  1–2 dominant icons of 8 and 7 of 9 density floors on every repeat; the
  core 0–1 and 5–6; the modules 0–1 and 4–6. Neither arm is better;
  both are a little worse, because their documents compile into fewer
  and smaller things (see the constraint and envelope lines).
- **Validity is the examples' work.** Without fences the author's one-shot
  rate goes from 8–10 of 11 to 0–1, attempts double, the diagnostics the
  validator has to send back go from 2–7 to 209–255 a pass, one repeat
  loses two prompts outright, and every pass costs 60–75 % more. The
  targeted modules recover about half of that (one-shot 3–5, attempts
  18–19, diagnostics 20–55, +25 % cost) and no more.
- **Parroting** (`kitLiteralEnvelopePct`) falls from 27–37 % to 12–16 %
  in both arms, as predicted — and turns out to be the price of validity,
  not a defect to cure: the envelopes the model copies are the ones the
  validator accepts.
- **The constraint vocabulary collapses without examples:** constraints
  written with a `strength` go 38–44 → 0–17 on the core; the fenced
  examples are where `soft` is learned (wave 2B's B3 finding, seen from
  the other side).
- **Reach** (`archetypesReached` +2 … +12) never clears the noise floor
  (14), as the README warned a single pass never can.
- **The metropolis skeleton field (F3)** returned in no arm — a program
  the author stopped asking for, as predicted, and not an example's doing.
- **Two more `LOAM-T110 UNSTABLE_FLUID` non-compiles** (modules-1
  metropolis, modules-1 redwood; core-3 and modules-2 one each) — F1's
  class, now on five documents across the Run; not an arm effect (the
  kit's 33 compiled 33).

## Decision (D31's rule, law 8)

**Neither arm ships. The kit stays.** Arm 2 fails the rule on every
clause (one-shot, cost, a lost repeat); arm 3 loses one-shot and cost,
gains nothing on icons or dominance, and its only gain (reach) is inside
the noise. Kai's question — *should the author see examples at all?* — has
a measured answer at these bytes: **yes; the examples are what makes the
document valid on the first try**, and their cost (12 % of the kit's
bytes, 30 % literal envelopes) buys the one-shot rate, the constraint
vocabulary and 60–75 % of a pass. What A3 was for — cutting a 280 KB
prompt to a third — is a prose problem (the core is 88 % of the kit,
F16), not an examples problem, and is written up rather than pursued.

**What the Run learned for the kit:** the fences carry the two contracts
the validator refuses without (envelope literals and constraint
strengths); a future kit can shrink its prose, not its fences.

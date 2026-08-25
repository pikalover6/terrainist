# F4 — the metropolis at street level: nothing in it can ruin

Stocktake Run, unit 26 (2026-08-25). The ledger's F4: `LOAM-I512` reports
"ruined shells" while the walk sees intact boxes (T6: the overgrown ruined
metropolis reads as a clean city). Read from the reports, the code, and one
dist-only probe; no impression in it.

## §A The compiler's own accounting

`overgrown_metropolis_hideout_k1` at HEAD (`bi/u25`) vs the r5 anchor's
report (`scratchpad/anchors/anchor/metropolis_r5.report.json`):

| | HEAD k1 | anchor r5 |
|---|---|---|
| district lots | 142 | 191 (78 dropped) |
| terrace lots / terraces | **132 / 66** | 136 / 68 |
| infill lots | **2** | 28 |
| `LOAM-I512` | "2 of 2 infill lots roll into ruined shells (total 2)" | "24 of 28 … (heavy 4, total 20)" |
| ruin yards | **0** | 14 |
| ruin field columns | **0** | 3,564 |
| green skin columns / blocks | **0 / 0** | 2,697 / 6,207 |
| `LOAM-W511` (no decay mode) | 4 (skyscraper) | 14 (skyscraper) |

Both documents ask `decline 0.9` (intent), giving a ruin share of 0.85. At
the anchor the share reached 28 infill lots, ruined 24, and the ruin field
and green skin grew from those; at HEAD the same share reaches 2 lots.

## §B The chain, in code

1. The decay roll (`layout/district.ts` `ruinDecayOf`) runs inside
   `tryInfill`, per **infill lot**, and attaches `params.decay` to that lot's
   job. `terraceRuns(...)` — the party-wall blocks that are 132 of the 142
   lots here — takes no decline and rolls nothing.
2. `structures/index.ts` builds the ruin field from the jobs' `decay`
   parameters (`buildRuinField`); the green skin grows from the field.
   `undefined` when nothing ruined — "the reach law made structural".
3. `structures/buildings.ts`: a job whose archetype is "built by its own
   generator rather than the shell fit-out" never reaches the decay engine
   and warns `LOAM-W511`, intact.

## §C The probe: hand every terrace a decay and see

Dist-only patch (D42's method): after `terraceRuns`, every terrace job gets
`decay: 0.8`; the k1 document compiled in-process
(`scratchpad/f4/k1-terrace-decay.report.json`). Result: `LOAM-W511` ×70 —
**66 "terrace", 2 "office", 1 "apartment_block", 1 "skyscraper"** — and ruin
yards 0, field 0, skin 0. The terrace archetype has no shell decay mode; nor
do the two archetypes the district's two infill lots rolled. On this
document **no building can ruin**: the "2 of 2 ruined shells" are two
intact offices, and `decline 0.92` moves nothing but a note.

## §D Verdict

- **F4 closed; F22 opened (law 1).** The decay roll covers infill lots
  only, and the archetypes that carry a grid metropolis — `terrace` above
  all, plus `office` and `apartment_block` — have no shell decay mode. A
  high-decline district built of them is intact by construction, and the
  ruin field and green skin that give the anchor its look never start.
- **The regression against the anchor is structural, not authoring.** The
  anchor had 28 infill lots because its planner dropped 78 lots and left
  gaps the infill filled; HEAD's planner drops none and terraces
  everything. The "better" plan is the one that cannot ruin.
- **`LOAM-I512` now says its denominator** (report-only): the terrace lots
  outside the roll, and why. Landed in this unit, payload-identical.
- **P6 (proposal, M/L):** a shell decay mode for `terrace` (and the modern
  block archetypes), and the roll extended over terrace runs — per run or
  per bay, clustered by block as `ruinDecayOf` already is — behind a switch,
  attributed on the two metropolis documents. That is the fix T6 needs;
  it is a grammar feature, not a unit.

## §E Files

`scratchpad/f4/` — the patched dist's report; the dist restored and
sha-checked. `layout/district.ts` — the I512 message. This record.

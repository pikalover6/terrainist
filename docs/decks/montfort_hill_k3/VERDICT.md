# Verdict — montfort_hill_k3 (F31 answered, unit 41, 2026-08-25)

The same prompt and seed as k2 ("A walled medieval city on a hill, its
castle keep above the rooftops", 311), generated fresh after F31's change:
the kit's `hillside` row and `urbanForm` row now say `hillside` is a
village-scale form and a hill city wants `grid`/`organic` on its terraced
plane, and `LOAM-W527` carries a form-aware fix hint and is fed back to the
author. One-shot authoring, one feedback round (the keep's soft
constraints, not W527 — it never fired), one program (`hilltop_castle_keep`,
4 542 blocks), $0.204. Record `runs/g2-montfort-f31`.

**What the model did differently:** `fabric: "grown"`, `urbanForm: "grown"`,
`blockSize 36`, `density medium` — no hillside form anywhere — and the keep
written as a bespoke program on the summit rather than a `keep` archetype
that could not fit (k1, k2: `E170`).

**Icons (before the read):** the keep (dominant), the wall, the town.
Metric: no alarms — the keep dominant, all three present.

## Stations

| # | where | read | backing |
|---|---|---|---|
| 1 | the quarter (`/tp -10 100 20`) | a grown street network with a market square and cross-walks, ~30 buildings — timber houses, halls, a church, blocks of two to five storeys — filling the circuit | zoom render; `world.city_quarter` 180 × 160: 67 lots, 6 dropped (k2: 37), 20 blocks, 41 dwellings, 37 buildings; **`W527` absent** (coverage over the 50 % floor) |
| 2 | the wall (`/tp -95 100 -60`) | a modest masonry circuit with towers around the town; the town, not the wall, is what you see | zoom render; `W489` (the authored walls built, no second circuit) |
| 3 | the keep (`/tp -2 112 -78`) | a squat stone keep in its own small enceinte on the slope above the town's north-east corner — above the rooftops by elevation, small in mass | keep crop render; program at (-14..10, -90..-66) y 100 |
| 4 | the plinth (`/tp 90 96 40`) | the quarter still sits on one flattened plane with a cut edge (T5's weak point, unchanged) | zoom render |

## T-lines

- **T4 — PASS.** A town inside the wall, and buildings dominate the wall by
  read; the compiler's guard agrees (no `W527`). k1 → k2 → k3: five houses
  → a fenced meadow with sixteen → a walled town of thirty-seven.
- **T5 — weak, unchanged:** a flattened plane with a cut edge rather than
  terraces following the hill. Not F31's; noted for the closing report.
- The keep: present, dominant by the metric, above the roofs by elevation;
  by read a small castle rather than a crowning one — a taste note, not a
  fail.

Installed for the walk as `walled_hill_citadel` (Prism, `--saves`). Kai's
walk verdict overrides this read.

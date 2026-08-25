# Verdict — montfort_hill_k2 (G2, unit 40, 2026-08-25)

Prompt "A walled medieval city on a hill, its castle keep above the rooftops",
seed 311, the settlement kit, generated fresh end to end at `bff2694`'s
bytes: one-shot authoring, one compile-feedback round (two `E170
CANNOT_FIT`: the church 15 × 21 and the keep 15 × 15 found no block big
enough, both re-authored at 11 × 11–13), $0.086. Record `runs/g2`.

**Icons (written before the read):** the keep (dominant), the wall, the town.
Metric: keep present, h ×1.69 / a ×1.51 — dominant by height, not by
footprint (a *read it*); wall and town present.

## Stations

| # | where | read | backing |
|---|---|---|---|
| 1 | the circuit (`/tp -15 100 -110`) | a full masonry circuit with towers and gates around the hilltop — the icon of a walled city | full-height render, zoom render |
| 2 | inside the wall (`/tp -20 100 -30`) | a square with stalls, a church, two four-storey blocks, ~16 timber houses on the west and centre; the east half of the enclosed ground is flower meadow with paths — open ground inside a wall | zoom render; `W527`: 3 502 of 35 783 columns inside the streets built, **10 %** |
| 3 | the keep (`/tp -52 115 -22`) | an 11 × 11 grey box 18 high, inside the circuit, taller than the houses but not reading as a castle keep — no bailey, no fit-out to name it; "above the rooftops" by a few courses only | render; placement `the_keep` fy 97 |
| 4 | the plinth (`/tp 60 90 60`) | the hilltop is one flattened plane on a fifteen-block retaining cliff all round — a dome cut flat, not terraces following the hill | full-height render; `I499` (the contour strip dissolved: 19 stations against 30) |
| 5 | the lowland farm (`/tp -120 76 170`) | a farm precinct with parcels and a house; the lane to it (`I504`) | render |

## T-lines

- **T4 — FAIL.** A town exists inside the wall (far past k1's "one keep and
  five houses") but *buildings do not dominate walls*: the circuit and its
  cliff plinth are the dominant thing and the enclosed ground is 90 % open.
  The compiler's own guard says the same (`W527`, 10 % under the 50 % a
  walled quarter needs).
- **T5 — weak.** One flat plane with a cliff, not terraces that follow the
  hill (the calibration memory's line).
- The keep: present and inside; dominant by height only — a read-it, not a
  fail.

## Cause, and what the Run does

Not the lot starvation alone: recompiled with `LOT_PARCEL_OWN_STATIONS`
patched on, lots go 34 → 46 but buildings 24 → 13 and coverage stays 10 %.
The model chose `urbanForm: "hillside"` for a walled *city*, and the
hillside form is a village-scale form by construction — two to four
contour strips with a buildable strip beside each — that cannot fill a
220 × 200 envelope; nothing told the model so: the kit's `hillside` row
does not say it, and `W527` is not in the CLI's `FEEDBACK_CODES`, so it
fired in the final compile and never reached the author. **F31.** Unit 41:
`W527` gets a fix hint and joins the allow-list; the kit's `hillside` and
`urbanForm` rows say a walled city wants a packing form on the terraced
plane; montfort is re-generated fresh and read again.

Installed for the walk as `walled_hill_city` (Prism, `--saves`).

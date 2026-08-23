# ROAD-PULL v0 — authority proportional to need

Ratified by Kai, 2026-08-22, off the n6 walk: *"as long as the terrain was
relatively flat, roads looked fine. Generators on this type of terrain should
have zero influence on the final [vertical] position. For steep cliffs they
need a ton of authority, essentially to the point of being able to fully
decide."* n6 was the ablation that proved both halves: the graded machinery
is heroic on cliffs and pure noise on flats. This design is the homotopy
between the two shipped laws — n6's drape and n5's grade — with the mix
decided by the terrain itself.

## 1. The law

Per street/road station `s`, per column `col` of its cross-section:

```
y(col) = round( y_drape(col) + pull(s) · ( y_n5(s) − y_drape(col) ) )
```

- `y_drape(col)` — the ground oracle's own answer at the column, exactly what
  ROAD_SOVEREIGN item 1 reads today (the C-view ground snapshot).
- `y_n5(s)` — the graded street datum's arc level at the station, exactly what
  the surfacer consumed before the sovereign flip. The datum keeps being
  built; nothing upstream changes.
- `pull(s) ∈ [0,1]` — the terrain's own verdict on how much authority the
  grader gets (§2). At 0 the row is n6 verbatim (each column drapes, tilt and
  all). At 1 the row is n5 verbatim (level across its width, 1-Lipschitz
  along the run — full walkability on cliffs WITH THE STAIRS STILL OFF).

The blend applies at the ONE place both inputs already meet: the level
decision in `declareRoute`/`surfaceRoute` (where the sovereign drape landed).
Claims are declared at the blended level, the fifth resolve grants them, the
surfacer drapes the resolved ground as it already does — one ground author,
written-vs-resolved stays zero, and ROAD_SOVEREIGN items 2–4 (supremacy mask,
headroom, stone-brick border, no stairs) ride the blended levels untouched.

## 2. The pull function

```
grade(s) = P95 of |Δy_drape| per block, over a 13-block window along the route
raw(s)   = smoothstep( clamp( (grade(s) − R_FLAT) / (R_CLIFF − R_FLAT), 0, 1 ) )
pull(s)  = movavg9(raw), then slope-limited to |Δpull| ≤ 1/6 per block
```

- `R_FLAT = 0.25` — one riser per four blocks or gentler: pull is exactly 0.
- `R_CLIFF = 0.75` — three per four or steeper: pull is exactly 1.
- P95 over max so one noisy pit does not summon the grader; a real cliff
  fills the window and does.
- The smoothing plus the ramp limit mean authority fades in over ≥ 6 blocks:
  regime changes are transitions, never pops.

Constants are named exports beside the flag; each is a one-line taste lever.

## 3. The two guards

1. **The messy-middle backstop.** At pull ≈ 0.5 a 4-block terrain step would
   blend to a 2-block road step — neither law's output. After blending, the
   centerline profile takes a Lipschitz-1 relaxation applied WITH STRENGTH
   `pull`: untouched where pull is 0 (honest terrain steps stay honest),
   fully smooth where pull is 1, bounded in between.
2. **One pull per plane.** A junction or widened plane takes a single pull —
   the max over its footprint — so it never half-tilts.

## 4. Staging

Flag `ROAD_PULL` (default false), which implies `ROAD_SOVEREIGN` (asserted in
tests, the DESCENT_SOLVE ladder pattern). Off-state byte-identical on the
battery docs; the shipping gate is the FULL suite plus the harness. The pull
field per route is cheap data — expose it on the surfacer's result so a probe
can render authority maps of a deck before anyone walks it.

## 5. Acceptance (measured on troy, judged on the walk)

- Flat quarters (the n6 walk's "looked fine"): pull ≈ 0 everywhere, road
  levels byte-close to n6; the corridor-edge lip class Kai probed at
  (108, 89, −194) may legitimately persist where flat — it is the election's
  step, not the road's, and is out of this design's scope.
- The cliff faces (the n6 walk's mangled screenshot): pull ≈ 1, levels within
  ±1 of the n5 graded profile, zero risers > 1 along any centerline where
  pull ≥ 0.5.
- Network stairs remain 0; borders remain continuous; physics zero-bars hold.
- The walkability fragmentation goldens (271 → 2,591 at the sovereign flip)
  must fall back most of the way — the number IS the design's report card,
  re-pinned with attribution at whatever the blend measures.

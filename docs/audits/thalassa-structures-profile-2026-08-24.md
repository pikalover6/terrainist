# thalassa_polis — where the "4.6 s of structures" actually goes

> **Disposition (orchestrator, 2026-08-24):** §0's timings mis-attribution is
> a code bug and is FIXED on the main branch (declare time now lands in
> `timings.programs`). §1 closes task #27's density question: no perf case
> either way. §3's recommendations are **declined by Kai's ruling** — "I'd
> rather not burden llm authors with having to optimize, a few seconds
> wasted is fine if it makes their job easier" — program cost is a non-goal.

Read-only profile, 2026-08-24, perf session. No structures file was edited.
Profile: `prof/thalassa.cpuprofile` (node --cpu-prof, worktree @ a1ed187).
Reproduce: `node analyze.mjs prof/thalassa.cpuprofile --top 30 && node phases.mjs prof/thalassa.cpuprofile && node leviathan.mjs prof/thalassa.cpuprofile`

## 0. Headline: the phase label is wrong, and #27 is exonerated here

`report.timings` says `structures 4909ms`. The structures machinery is not
what spends it. Self-time by top-level callee of `compileValidated`:

| callee | ms | % of compile |
|---|---:|---:|
| **declarePrograms** (programs/pass.ts) | **3731** | **40.5** |
| emitTerrain | 786 | 8.5 |
| solveCities | 746 | 8.1 |
| executePrograms | 677 | 7.3 |
| planProgramFacings | 523 | 5.7 |
| declareStructures | 421 | 4.6 |
| buildStructures | 358 | 3.9 |
| solveLayout | 245 | 2.7 |
| freeze (ground-driver) | 199 | 2.2 |

**The structures pass is 779 ms (declare 421 + build 358), not 4.6 s.**

The mis-attribution is structural, not a fluke: `tStruct` is taken at
`terrain/compile.ts:949`, `structuresMs` is closed at `:1100`, and
`declarePrograms` is called at `:1070` — inside the window. So under
`GROUND_V1_FREEZE`, every authored program's *declare* half is billed to
`structures`, while `programsMs` (`:1172`–`:1221`) covers only
`executePrograms`. Any doc with bespoke programs reads as structures-heavy
when it is program-heavy.

## 1. The orchestrator's #27 question, answered — negatively

**retaining.ts self time on thalassa: 30.1 ms (0.33%).** On troy it was
497 ms (9.0%, the most expensive file in the compiler). The dense city is
**~16x cheaper**, not worse. Whatever the discarded-seam spend is, it does
not scale with settlement density — so the partial-stack pattern is a
correctness question on its own merits and cannot be justified or condemned
by cost on this doc. Do not expect a perf win from fixing it.

The largest genuine structures-side cost on thalassa is
**roads.js at 654 ms self (7.1%)** — worth its own look, and nobody has
profiled it.

## 2. What the 3.7 s actually is: one authored program

`loam:program/leviathan_prime` — 4031 ms self, **43.8% of the entire
compile**, for 34,208 emitted blocks (~118 us/block; the terrain emitter
does ~0.03 us/block). Hottest frames inside the sandbox:

```
1332.5 ms  drawTentacle  leviathan_prime:65
 526.7 ms  drawTentacle  leviathan_prime:65
 413.5 ms  build         leviathan_prime:4
 261.0 ms  drawTentacle  leviathan_prime:65
 258.0 ms  drawTentacle  leviathan_prime:65
 144.5 ms  getVoxel      leviathan_prime:46
 124.9 ms  setVoxel      leviathan_prime:40
  77.2 ms  getIdx        leviathan_prime:36
```

The mechanism (source lines 63-115): `drawTentacle` sweeps a Catmull-Rom
spline at a **fixed 70 steps per segment**, and at *every* step rasterises a
full `(2r+1)^3` cube, testing `Math.hypot(dx,dy,dz) <= radius` per cell —
plus two extra `catmullRom` evaluations per step for a curvature vector.

The step spacing is far below one block, so consecutive steps re-fill
overwhelmingly the same voxels. At r≈6 that is ~2200 cells per step, 70
steps per segment, several segments, times the tentacles. **The program is
not slow because it draws a lot; it is slow because it draws the same
voxels over and over.** A step count derived from arc length (or a
per-voxel dedupe) would cut it by roughly an order of magnitude without
changing one emitted block.

## 3. So what is this a finding *about*

Not WS-E, and not #27. This is **authoring quality** — WS-A/WS-D territory.
The model wrote an O(steps x r^3) rasteriser where O(voxels) was available,
and nothing in the pipeline pushes back on a bespoke program's cost. Two
things fall out:

1. The kit teaches nothing about program cost. A single authored landmark
   can outweigh the entire rest of the compile, and today the only signal is
   a wall-clock number attributed to the wrong phase.
2. There is no fuel ceiling that bites here. `run.js:129 fuel` shows in the
   profile, so a fuel mechanism exists and this program ran to completion
   inside it — 4 s of it.

## 4. Incidental confirmation

The determinism hash is now **98.6 ms / 1.07%** of this compile, charged
mostly to `scatterOne` (81 ms). It was 15.8% of troy's wall before the
single-block BLAKE3 rung. The rung did what it claimed.

# The r5 metropolis bisection (unit 2, 2026-08-25)

Spec §10.2, first item. The question: the walked-GOOD r5 metropolis
(`battery/candidates/p4-gem1/overgrown_metropolis_hideout.loam.json`, seed
304, anchored at 9b4dd50) versus what the Run generates today — how much of
the difference is the **compiler** (same document, two compilers) and how much
is the **author** (two documents, one compiler)? §6: every deck confounds
three things; this separates two of them.

Companion records: `RECOMPILE-2026-08-25.md` (the four anchors, per region),
`METROPOLIS-R5-WORLD-DIFF-2026-08-25.md` (voxel diff, same doc old vs new
compiler), `METROPOLIS-DOC-DIFF-2026-08-25.md` (old doc vs fresh doc), and the
station verdict in `../before-sample/VERDICT.md`.

## A. Compiler: the r5 document at 9b4dd50 vs at 085e22d

**Result: WORSE. A regression (law 1), attributed to ratified commits whose
own messages claimed or re-pinned the movement.**

| measure | 9b4dd50 (anchor) | 085e22d (HEAD) | Δ |
|---|---:|---:|---:|
| `layout.placements` | 103 | 90 | −13 |
| terrace lots (`terrace_*`) | 68 | 45 | −34 % |
| infill lots (`infill_*`) | 28 | 38 | +10 |
| envelope volume | 985,607 | 717,295 | −27 % |
| `buildingBlocks` | 384,674 | 283,976 | −26 % |
| in-district vines (block census, bbox −80,−160,208,96) | 6,208 | 5,240 | −16 % |
| in-district concrete (gray+white+light_gray) | 174,704 | 124,512 | −29 % |
| `streetTree` | 11 | 31 | +20 |
| whole-world vines | 42,441 | 41,582 | −2 % |
| named icons (spire, corporate hub, sentry tower, power hub) | placed | identical footprints and sizes | 0 |
| differing voxels | — | 521,997 (0.52 %) | 96 % inside the district |

The mechanism is the district's lot planner. At the anchor the district's
east column (x ≥ 158) holds twelve large **terrace** lots; at HEAD it holds
thirteen small **infill** lots and no terrace. Terrace = the party-wall block
of N bays that reads as a fallen tower; infill = the per-lot fallback, and at
decline 0.9 most infill lots roll into ruined shells (`LOAM-I512`: 24 of 28
at the anchor, 32 of 38 at HEAD). So a third of the tower mass became rubble
yards and small huts. Diagnostics moved with it (W411 64→0, W413 0→18, I526
0→16, T239 0→10 — WP-11B, the mostly-water bench, WP-10A/12A), but those are
the retaining and road subsystems changing dressing, not the loss.

### The staircase (git bisect on the terrace count, worktree at 9b4dd50)

| step | commit | subject | switch named by the commit |
|---|---|---|---|
| 68 → 66 | `047dee2` 2026-08-19 | Density: every block's land is counted, and a walled quarter answers for it | `BLOCK_MULTI_RECT` — body says "grid worlds untouched by construction: a pitch-laid block IS its bounding box". **This grid world moved.** |
| 66 → 67 | between | partial recovery (fbefa58, 48b2177, d0acdb2 read 67) | — |
| 67 → 66 | `8e09cc6` 2026-08-19 | Inside the walls, no block is bare | the empty-block law |
| 66 → 64 | `61f1cef` 2026-08-19 | The quarter ground floors like everything else — measured, and not enough | no flag: `medianGround` + platform sampling harmonised from round to floor (14 lines, `district.ts` + `platforms.ts`) |
| 64 → 63 | `c84febe` | WP-12F: the tie is on | `GROUND_PLANE_TIE = true` — body re-pins the terrace/empty-block census "with cause" |
| 63 → 50 | `651278f` 2026-08-21 | TERRACE FLIP: the blocks step with the hill, and the ledger says who is still buried | `TERRACE_BY_TERRAIN` ships true (a 2-line flip; the machinery landed off in `b0accac`, which reads 63). **The largest single loss: 13 terraces.** `types.ts` now documents the flag as "subsumed, nothing consults this value" since the election solve — yet the loss it caused stands. |
| 50 → 45 | `7df3bb3` | WP-E3 / the election flip | `ELECTION_SOLVE` — body re-pins the census "with cause" |

Every pinned commit is ratified work on the ground contract and the block
election (six commits: `047dee2` → `8e09cc6` → `61f1cef` → `c84febe` →
`651278f` → `7df3bb3`); each judged its own baseline movement acceptable at
the time. The
before-sample says otherwise for this anchor: the sum is a third of the fallen
towers. Law 1 makes it a bug until read as not-worse, and it cannot be read as
not-worse — the tower mass *is* the T6 icon.

Bisect log with every step's counts: session scratchpad `bisect/BISECT-LOG.md`
(the numbers above are copied here; the worktree at 9b4dd50 with its own
`node_modules` is kept for the fix unit).

## B. Author: the r5 document vs the fresh documents at these kit bytes

**Result: an authoring regression, lost 3-of-3** (before-sample, k1 deck, and
a third authoring-only roll, `tools/golden-prompts/runs/metro-roll3/`).

| T6 item | r5 document | fresh rolls (3) |
|---|---|---|
| fallen towers | two decayed towers **plus** `overgrown_skyscraper_skeleton` program scatter, count 8, whole district | two named towers (`skyscraper`, `office`); **no skeleton scatter in any roll** |
| river through the city | `collapsed_canal_river` (verb river, to the coast) | none — `valley` trench and/or `basin` crater in all three |
| ruined palette | road mossy_cobblestone / shoulder coarse_dirt / cliff deepslate | cracked_stone_bricks / mossy_cobblestone / gray_concrete or gravel — partial at best |
| overgrowth | `massive_overgrowth`, area all, density 0.22 | `metro_overgrowth` radius 240 at 0.18 (before-sample), similar in k1 and roll 3 — **and the compiled world has more vines and street trees than the anchor**, so this item did not regress |
| archetypes | none named (`explicitArchetypeParams` 0) | named on every building (6) |
| `intent.era` | modern | `far_future` ×3 |
| programs | 3 (bunker, skeleton scatter, sensor relay) | 1 (comm tower / sensor relay) or 3 without the skeleton |
| document bytes | 53 KB | 24 KB (before-sample) |

What the fresh author no longer reaches for is the *program-backed ruin field*
and the river; what it reaches for instead is the era table's named
archetypes. Both are teaching/machinery questions (E2: when a program gets
asked for; E3: the pre-pass classifying "apocalyptic metropolis" as
`far_future`), pre-registered before any kit byte moves.

## Disposition

- **F2-metropolis → compiler bug, fix code-first** (next unit): restore the
  terrace count on the r5 document at HEAD without re-tuning any ratified
  ground law — start at the two one-constant levers the bisect names
  (`TERRACE_BY_TERRAIN`, `BLOCK_MULTI_RECT`) and the election's level split
  on this flat shelf district, then find why terrace
  runs shorten (the run grouping in `district.ts` `terraceRuns` is keyed on
  `block:side` and consecutive `order`; a block split into several rects or
  platforms breaks runs below `TERRACE_MIN_LOTS`). Gate: r5 at HEAD back to
  68 terraces or every remaining loss attributed and read not-worse; the six
  k1 docs + three baselines shasum'd (law 5); FULL suite green.
- **Authoring regression → E2/E3 pre-registration** (kit and machinery
  units), measured on the icon metric with 3 repeats.
- **`I512` "ruined shells" → street-level probe** (slop class 1 candidate):
  what a ruined shell puts in the voxels, and whether it reads.
- G3 for this anchor stays **open**.

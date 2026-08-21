# `g6-preview` — the WP-G6 flag-on census, as far as the flip reaches

Rewritten at **G6-r2**, with `GROUND_V1_FREEZE = true` and §3.3's ratified
transition generator landed (`layout/ground-geometry.ts`; the fifth resolve
materialises ramp rings, eased blends and tread levels before it hands the field
out). **These are a measurement, not a baseline to hold to**: the shipped state
is flag off and byte-identical, and the flag-on state is still known incomplete —
see `docs/GROUND-CONTRACT-v1.md` §6/WP-G6.

- `troy.json` is **still absent**: `troy_r22` throws flag-on inside the authored
  program pass (`prop.pad`, tier D, declared after tier E was read) — §7.1's
  chunk, siting and claims at 5b and execution at 5f, which is not landed.
- Every file here has `writtenVsResolved.total === 0`, `finalPlanVsWritten
  .total === 0` and five resolves, and every one compiles with `LOAM-E495`,
  `LOAM-E494` and `LOAM-W494` at zero. `LOAM-W413` aggregates: hellenist 0,
  pirates 1, harbourtown 3, bayline 0, ironvale 0.
- **What G6-r2 restored.** The G6 partial landing measured every
  `retaining.skirt`-owned cliff pair collapsing to zero, because the seam
  builders declared nothing past the seal and the resolver did not generate
  their geometry. `retaining.skirt`-owned pairs, flag-off → G6 partial → here:
  hellenist 134 → 0 → **133**, harbourtown 605 → 0 → **605**, pirates
  106 → 0 → **29**. Pirates is the outstanding one, and its town-ground pair
  count rises (343 → 482) rather than matching flag-off: the generator's stacks
  land there, but a share of the runs the flag-off skirt served are still skipped
  as already-retained by the owner-map reading of §3.3's built-set.

# `g6-preview` — the WP-G6 flag-on census, as far as the flip reaches

Written with `GROUND_V1_FREEZE = true` at the WP-G6 partial landing (junction
steps deleted on the freeze path, the seam builders sealed, pass 5c wired, the
doorstep walk moved to 5b). **These are a measurement, not a baseline to hold
to**: the shipped state is flag off and byte-identical, and the flag-on state is
known incomplete — see the landing report and `docs/GROUND-CONTRACT-v1.md`
§6/WP-G6.

- `troy.json` is **absent**: `troy_r22` still throws flag-on, at the authored
  program pass's tier-D `prop.pad` claim, which is §7.1's chunk (siting and
  claims at 5b, execution at 5f) and is not landed.
- Every file here has `writtenVsResolved.total === 0` and five resolves, which
  is the freeze working. What they do **not** have is the seam builders' ground:
  every `retaining.skirt`-owned cliff pair is gone, because `buildTieredSeam`
  and `gradeBank` declare nothing past the seal and the resolver does not
  generate their geometry. That is the open design question, not a regression to
  re-pin.

# Anchor recompiles — before-sample, 2026-08-25 (unit 1)

The four anchors of `docs/STOCKTAKE-RUN-SPEC.md` §6, each compiled twice from
the same archived document: once at its anchor commit (an isolated worktree
with its own `node_modules/@terrainist/*`, built with `tsc -b`) and once at the
Run's HEAD (085e22d). Files are shasum'd per region; a determinism control
(troy_r22 compiled twice at HEAD) was byte-identical, so every difference
below is compiler drift between the two commits, not noise.

**Result: all four DIFFER at HEAD.** Law 1 makes each a bug until attributed;
gate G3 needs every difference attributed to a ratified change and read as
not-worse. That attribution is the work of §10.2 (the r5 metropolis bisection
first). The anchor-commit worktrees are kept in the session scratchpad for
that bisection; regenerate them from the commits if the scratchpad is gone.

The subagent's report follows verbatim.

---

# Anchor recompile: HEAD (085e22d) vs anchor commits

Determinism control: troy_r22 compiled twice at HEAD -> byte-identical. Differences below are real.

## Per-anchor

### metropolis_r5
- head: metropolis_r5 exit=0 secs=9
- anchor: metropolis_r5 exit=0 secs=13
- sha-of-shas head:   c53e0b2865280e7c2c55a944e7c8a3732ded808369a09710b917c28f4673791c
- sha-of-shas anchor: 13aa4867a85c8c532065931aaca4410ba180b06c7b1c7df9f637a4d98c2aa40e
- **DIFFER** — 5 differing/missing files (of 5 total):
  - ./overgrown_metropolis_hideout/level.dat
  - ./overgrown_metropolis_hideout/region/r.-1.-1.mca
  - ./overgrown_metropolis_hideout/region/r.-1.0.mca
  - ./overgrown_metropolis_hideout/region/r.0.-1.mca
  - ./overgrown_metropolis_hideout/region/r.0.0.mca

### hellenist_r5
- head: hellenist_r5 exit=0 secs=5
- anchor: hellenist_r5 exit=0 secs=7
- sha-of-shas head:   a6f8b11f9f64575b7159b9e486be0a7bfd0817f3ffc99e3fbd73d14c471a2cd2
- sha-of-shas anchor: cab6d8b0b523288abfcc91eaf0292706cebb31063ea574bb934aed1502e15b01
- **DIFFER** — 4 differing/missing files (of 5 total):
  - ./modern_hellenist_assault/region/r.-1.-1.mca
  - ./modern_hellenist_assault/region/r.-1.0.mca
  - ./modern_hellenist_assault/region/r.0.-1.mca
  - ./modern_hellenist_assault/region/r.0.0.mca

### troy_r22
- head: troy_r22 exit=0 secs=5
- anchor: troy_r22 exit=0 secs=8
- sha-of-shas head:   198ea9f1a369badd7275a5814d2f45935646ba64969f2438b82860d7f51330d2
- sha-of-shas anchor: 11b941bca66037f138d8226262c3eeb1ef671439a551ddd4c941f285dbda995f
- **DIFFER** — 2 differing/missing files (of 5 total):
  - ./trojan_horse_troy/region/r.-1.-1.mca
  - ./trojan_horse_troy/region/r.0.-1.mca

### pirates_r16
- head: pirates_r16 exit=0 secs=4
- anchor: pirates_r16 exit=0 secs=5
- sha-of-shas head:   bcd7ea311b9714657fb41eff8dcadf197a9b7fe9f7efc848e5cb370964268b45
- sha-of-shas anchor: d245b4553bb7d8177df2d5bd350aa935727d306f56be5a865b24396341915f6f
- **DIFFER** — 3 differing/missing files (of 5 total):
  - ./pirate_unicorn_war/region/r.-1.0.mca
  - ./pirate_unicorn_war/region/r.0.-1.mca
  - ./pirate_unicorn_war/region/r.0.0.mca

## Diagnostics (top 10 codes by combined count)
```
## metropolis_r5
 total head 75 anchor 86
   LOAM-W411 head=0 anchor=64 CHANGED
   LOAM-W511 head=16 anchor=14 CHANGED
   LOAM-W413 head=18 anchor=0 CHANGED
   LOAM-I526 head=16 anchor=0 CHANGED
   LOAM-T239 head=10 anchor=0 CHANGED
   LOAM-I463 head=5 anchor=3 CHANGED
   LOAM-T208 head=1 anchor=1 
   LOAM-I512 head=1 anchor=1 
   LOAM-I412 head=2 anchor=0 CHANGED
   LOAM-I514 head=1 anchor=1 
  changed codes: LOAM-W411,LOAM-W511,LOAM-W413,LOAM-I526,LOAM-T239,LOAM-I463,LOAM-I412,LOAM-W522,LOAM-T242,LOAM-I497
## hellenist_r5
 total head 15 anchor 10
   LOAM-I512 head=5 anchor=5 
   LOAM-T208 head=1 anchor=1 
   LOAM-W517 head=1 anchor=1 
   LOAM-I463 head=2 anchor=0 CHANGED
   LOAM-W337 head=1 anchor=1 
   LOAM-W470 head=1 anchor=1 
   LOAM-W521 head=1 anchor=0 CHANGED
   LOAM-I497 head=1 anchor=0 CHANGED
   LOAM-I412 head=1 anchor=0 CHANGED
   LOAM-W413 head=1 anchor=0 CHANGED
  changed codes: LOAM-I463,LOAM-W521,LOAM-I497,LOAM-I412,LOAM-W413,LOAM-T234
## troy_r22
 total head 34 anchor 18
   LOAM-W413 head=12 anchor=0 CHANGED
   LOAM-I463 head=5 anchor=4 CHANGED
   LOAM-T341 head=2 anchor=2 
   LOAM-I412 head=2 anchor=1 CHANGED
   LOAM-T208 head=1 anchor=1 
   LOAM-I512 head=1 anchor=1 
   LOAM-T224 head=1 anchor=1 
   LOAM-W527 head=1 anchor=1 
   LOAM-W489 head=1 anchor=1 
   LOAM-T230 head=1 anchor=1 
  changed codes: LOAM-W413,LOAM-I463,LOAM-I412,LOAM-T242,LOAM-I497,LOAM-T232,LOAM-I414
## pirates_r16
 total head 28 anchor 31
   LOAM-I463 head=5 anchor=3 CHANGED
   LOAM-W411 head=0 anchor=7 CHANGED
   LOAM-T341 head=3 anchor=3 
   LOAM-W337 head=3 anchor=3 
   LOAM-I512 head=2 anchor=2 
   LOAM-T224 head=2 anchor=2 
   LOAM-T237 head=0 anchor=4 CHANGED
   LOAM-W521 head=1 anchor=1 
   LOAM-W485 head=1 anchor=1 
   LOAM-W517 head=1 anchor=1 
  changed codes: LOAM-I463,LOAM-W411,LOAM-T237,LOAM-W413,LOAM-I412,LOAM-T242,LOAM-I497
```

## Worktrees (left in place)
- /private/tmp/claude-501/-Users-kaihoward-Dev-terrainist/2b841858-0cd5-4ee7-a91f-8948e9e8b722/scratchpad/anchors/wt-9b4dd50 — tsc -b OK, own node_modules/@terrainist, resolves inside worktree
- /private/tmp/claude-501/-Users-kaihoward-Dev-terrainist/2b841858-0cd5-4ee7-a91f-8948e9e8b722/scratchpad/anchors/wt-25e5e68 — tsc -b OK, own node_modules/@terrainist, resolves inside worktree
- /private/tmp/claude-501/-Users-kaihoward-Dev-terrainist/2b841858-0cd5-4ee7-a91f-8948e9e8b722/scratchpad/anchors/wt-200209b — tsc -b OK, own node_modules/@terrainist, resolves inside worktree

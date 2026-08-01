# U3 — Bayline scale & performance probe

Scratch only. Nothing here is production; `examples/` is untouched.

- `scale-bayline.mjs` — derives `worlds/bayline-N.loam.json` from
  `examples/showcase-bayline.loam.json`, scaling the root region and the three
  district envelopes by N/512. Seed, terrain params, mixes, precincts and the
  named tower footprints are unchanged. `--scale-terrain` additionally divides
  the heightfield/continentalness frequencies by the same factor (variant "T",
  a fallback for the coastline problem described below).
- `run-one.mjs` — compiles one size, records `report.timings`, peak RSS
  (`/proc/self/status` VmHWM), city counts and output size to `results/`.
- `run-all.sh` / `prof.sh` / `top-self.mjs` / `summarize.mjs` — driver,
  `--cpu-prof` driver, profile self-time summariser, table printer.
- `instrumentation.patch` — the three temporary globals added to
  `packages/compiler/src/terrain/emit.ts` to split `timings.emit` into
  fill / connections / region-write. Reverted after measuring.

Run: `node scale-bayline.mjs 512 768 1024 1536 2048 && bash run-all.sh "" 512 768 1024 1536 2048 && node summarize.mjs`

`results/` holds the measured runs. `out/` (emitted worlds, ~90 MB) and
`prof/` (2.5 MB cpuprofile) are deleted and not committed.

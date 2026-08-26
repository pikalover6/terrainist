# The Stocktake Run's deciding probes (spec §5 G7)

The bespoke probes that decided verdicts during the Stocktake Run
(2026-08-25), committed verbatim from the Run's scratchpad. They are records
of method, not maintained tools: each carries the absolute scratchpad path it
ran from (`/private/tmp/claude-501/…/scratchpad`) and the built `dist/` of
the day; read them beside the record that cites them, and edit the paths
before running one.

| file | decided | record |
|---|---|---|
| `bi-bi14.sh` | law-5 byte-identity: compiles the thirteen documents and writes one payload sha per world (`world-payload-sha.mjs`) — every switch in the Run was proven identical off, and attributed on, with this | every unit's "bi/uNN ≡ bi/uMM" line in the ledger |
| `f10-*.mjs` | F10 / F20: the lower square's orphan island — `orphans.mjs` (walkability components), `boundary.mjs` (the cut), `surf.mjs` (the surfaced route vs the ground), `report.mjs` | `docs/decks/anchors/F10-LOWER-SQUARE-2026-08-25.md` |
| `d3-probe.mjs` | census class-3 D3: post-freeze `foundationY` vs the resolved ground on the thirteen (`groundEquivalence: true`) | `STOCKTAKE-SLOP-CENSUS.md` §8 CLASS-3 item 8 |
| `f14-physics.mjs` | F14 / F23: the physics lint over the thirteen, per rule, with witnesses — the two instrument false positives and the program remainder | `docs/decks/anchors/F14-PHYSICS-2026-08-25.md` |
| `f23-list.mjs` | F23: the real lint remainder listed by owner (program / life pass) | the same record, §F |
| `shot.mjs`, `probe2-shot-tall.mjs` | every render read in units 17–47: isometric views of a world window (`shot-tall` to y 255 after the monastery massif was clipped at 130) | every VERDICT and probe-pass record |
| `u23-box.mjs`, `block-at.mjs` | voxel reads: a column/box dump at a coordinate, the tie-breaker for a doubtful render | the F27/F28 reads |
| `p5-render.sh`, `g1-render-loop.sh` | the render chains for probe passes 5–6 and G1 (bounds from the placements, rendered as each generation exits) | `PROBE-PASS-5/6`, `G1-GOLDEN` |

The icon metric itself is `tools/golden-prompts/icon-metric.mjs`; the ground
probe is `tools/worlds/ground-probe.mjs`; the census is
`tools/worlds/block-census.mjs`.

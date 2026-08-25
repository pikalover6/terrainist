# E1 — compile performance profile + hypothetical floor study

(Filed by the orchestrator from the WS-E1 agent's returned report, 2026-08-24.
Scripts and raw data live alongside this file; reproduce with
`node analyze.mjs compile.cpuprofile --top 35 && node phases.mjs compile.cpuprofile`.)

**Subject:** battery/candidates/troy_r22/trojan_horse_troy.loam.json — 512×512, 1024 chunks, 37,478,410 blocks
**Machine:** Apple M4, 10 cores, 32 GB, macOS 15.5, node v26.5.0

## 0. The headline: the premise was wrong by ~40×

The compile takes **5.4 s, not 3–4 min** (runs: 5.20 / 5.66 / 5.60 / 5.21 s;
zip free; peak RSS 647–687 MB, 1081 MB with --report). The ratified ladder's
E2 (≤60 s) and E3 (≤10 s) targets are already cleared today. The 3–4 min
figure almost certainly measured `generate` (LLM authoring + compile rounds)
or the ground-probe harness, not `compile`. The live question is sub-second.
The compiler carries its own phase instrumentation (`report.timings`) that
was never being read.

## 1. Phase breakdown (two independent sources agree)

| phase | mean ms | % of 5.42 s |
|---|---:|---:|
| emit (chunk fill → NBT → deflate → write) | 1677 | 30.9 |
| structures (declare → resolve → build) | 1442 | 26.6 |
| scatter (vegetation) | 969 | 17.9 |
| layout / solver | 501 | 9.2 |
| terrain field + climate | 356 | 6.6 |
| columns/biomes/programs/validators/caves | 85 | 1.6 |
| startup + ESM load | ~130 | 2.4 |
| GC / unattributed | ~135 | 2.5 |

Emit decomposed: fillChunk→fillStoneBody 635 ms (16 ns/block through
prismarine's per-block palette API), bucketTrees 302 ms (string chunk keys),
zlib.deflateSync 260 ms ON THE MAIN THREAD (prismarine-provider-anvil's
`deflateAsync` is sync in a trench coat, and its promise queue serialises
everything), applyConnectionStates 138 ms, NBT 86 ms.

**Cross-cutting: BLAKE3 is 15.8% of the entire compile** (855 ms; 792 ms
from `scatterOne` — the vegetation scatter is 82% hashing). Measured free
1.40× on `positionFloat` (kill per-call concat() allocation + the BigInt
truncate64 loop; byte-identity asserted on 2000 positions — hashbench.mjs).
A specialised single-block BLAKE3 (44-byte input = one compression) is worth
another ~4–5× on the hash.

## 2. Bun verdict

Not installed; not installed by the agent. Would almost certainly run (only
2 native addons in the tree, both dev-only; runtime path is pure JS). Expected
win: ±15%, most likely 5–10%, nearly all startup — the hot loops are typed-array
sweeps where V8 is strongest. Recommendation: **keep node canonical** — a second
runtime doubles the byte-identity surface (own zlib, own JIT) that the entire
"shipping a commit IS shipping a world" contract rests on, for ~5%. Bun's one
draw (native BLAKE3) is available on node via napi/wasm without migration.

## 3. Parallelisability

Provably independent (byte-identical by construction): emit fill/serialise/
deflate (write order stays fixed (z,x) on main thread), vegetation scatter
(the determinism module's own comment guarantees order-independence), terrain
field + climate. Global and sequential BY DESIGN: the layout solver (elections
and district partitioning are defined by visit order — do not touch), and
structures (declare→resolve→build over shared mutable ground; per-district
parallelism theoretically possible, high risk, attempt last).

## 4. Floor table (worker pool at 5× effective on M4)

| phase | today | E2 realistic | E3 aggressive | extreme floor |
|---|---:|---:|---:|---:|
| startup | 130 | 130 | 50 | 0 (warm) |
| terrain field + climate | 356 | 200 | 60 | 20 |
| layout / solver | 501 | 450 | 300 | 100 |
| structures | 1442 | 1000 | 400 | 150 |
| scatter | 969 | 400 | 150 | 30 |
| emit | 1677 | 380 | 190 | 70 |
| misc | 227 | 177 | 100 | 37 |
| **total** | **5.4 s** | **~2.7 s** | **~1.25 s** | **~0.4 s** |

Verdict: "a few seconds" is the status quo; **~1.2 s is reachable with
ordinary engineering**; below that the layout solver is the asymptote (24%
of the extreme floor) and is correctly immune to parallelism. First thing
worth doing: confirm the 3–4 min number was generate/probe wall, because if
so, every compile millisecond is being optimised against LLM latency.

## 5. Curiosities for the inventory workstream (WS-F)

1. **`resolveGround` runs from five call sites (269 ms) while the run's own
   LOAM-I497 note says "1 resolve(s)"** — three declare-time view() prefix
   resolves + two under freeze(), including a resolveGround nested inside
   resolveGround. Correctness smell vs GROUND-CONTRACT's "one resolve".
2. prismarine-provider-anvil deflate is sync on the main thread + promise-queue
   serialised.
3. ~365 ms of emit runs as detached microtasks — invisible to naive flamegraphs.
4. `--report` doubles peak RSS (one giant JSON.stringify).
5. truncate64's BigInt loop in the hottest function (~578K calls).
6. fillColumn writes uniform runs one block at a time through the palette API.
7. **retaining.ts is the most expensive file in the compiler (497 ms self,
   9.0%)** while the same run refuses/discards many of the seams it computes
   (11× W413, "9 derived transitions could not be placed") — a correctness
   question wearing a performance costume.
8. String chunk keys `${cx},${cz}` built and hashed in five hot per-chunk maps.

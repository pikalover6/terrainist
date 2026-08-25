# Verdict — hellenist_sea_siege_k2 (G2, unit 40, 2026-08-25)

Prompt "A modern Hellenist city being invaded by sea monsters", seed 305,
generated fresh at `bff2694`'s bytes: one-shot authoring, two feedback
rounds, three programs (the colossal kraken 19 447 blocks, the colossus
2 677, a tentacle 672), $0.385. `decline 0.2`, `era modern`.

**Icons (before the read):** the sea monsters (dominant), the city, the
harbour. Metric: no alarms — the kraken dominant, all three present.

## Stations

| # | where | read | backing |
|---|---|---|---|
| 1 | the core (`/tp -60 90 40`) | a modern block district — grey and white blocks, boulevards, a tall tower (`aegean_metropolis_tower`), a second cluster to the south — a city | full-height render; two districts, 52 + 64 lots, 65 buildings; **17.1 lots per 10k envelope cells** (116 / 68 000; troy_k1 19.7) |
| 2 | the kraken (`/tp 18 75 -78`) | the colossal kraken on the shore, tentacles over the beach — the invasion | program `colossal_kraken` at (-5..42, -101..-54) y 58; `W520` (seated on a 54° slope, padded) |
| 3 | the colossus (`/tp -87 80 -58`) | the guardian statue on the hill between city and shore | program `hellenist_colossus_statue` |
| 4 | the harbour (`/tp -48 70 -240`) | quay, boats, the tug and buoy at the waterline | `W409` (the precinct reseated to the best coastline), `T228` ×2 |
| 5 | the north (`/tp -100 80 -150`) | open green between the city and the harbour; the second monster mostly missing | `W337`: `kraken_tentacle` asked for 14, one site took one |

## T-lines

- **T7 — PASS.** A city is a city: 17.1 lots per 10k at the anchor's order,
  and the read agrees — a modern block city with a skyline, not a
  scattering. The Hellenist note is thin (`W517`: era modern outside the
  classical pack's affinity; the pack is used as written) — the prompt said
  modern, and the read is a modern city with a colossus.
- The invasion: one kraken (dominant, present) and a colossus; the tentacle
  swarm lost 13 of 14 sites (`W337`, F24's program stage, a site-finding
  limit, not a fail of T7).

Installed for the walk as `neopolis_invasion`.

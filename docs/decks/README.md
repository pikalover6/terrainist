# docs/decks — walk decks and their records

One folder per installed deck: the authored document, the generate log, the
compile's diagnostics, and the WALK-CARD (numbered `/tp` stations, one
question each). Worlds are byte-deterministic from (commit, document, seed),
so the folder plus the commit named in it IS the deck.

The k1 set (2026-08-24, the first worlds after the Great Stocktake's Phase 1):
troy_k1 (seed 303), montfort_hill_k1 (311), alien_farm_invasion_k1 (302),
hellenist_sea_siege_k1 (305), overgrown_metropolis_hideout_k1 (304),
pirates_vs_unicorns_k1 (301) — the five golden prompts chosen to exercise what
the stocktake changed, each on its golden-harness seed, all compiled at
771cbe4 or later on the same kit bytes (settlement c22cb4fe).

The Stocktake Run's records (2026-08-25 on): `before-sample/` — the 11 golden
prompts generated once at the Run's starting bytes (085e22d, settlement
c22cb4fe) before anything moved, documents in
`tools/golden-prompts/runs/before-sample/`; `anchors/` — the four spec §6
anchors recompiled at HEAD against their anchor commits, per region.

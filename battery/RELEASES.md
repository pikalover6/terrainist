# Battery releases

The archive's own index. One row per **release** — a build cohort: one deck,
one compiler build, one authoring batch. Every world generated in a release
carries that release's number, across all prompts: `troy_r16`,
`hellenist_city_r16` and `pirates_v_unicorns_r16` are the same build seen
through three prompts.

Release numbers are dense per RELEASE, not per slug. A prompt that was not
rolled in a deck simply has no world at that number, so a gap in `troy_r*` is
information — Troy was not part of that deck — and never a mistake. The
previous `<slug>_v<N>` scheme numbered every prompt with its own private
counter, which meant one compiler build could hand out `alien_farm_v5` and
`pirates_v_unicorns_v17` on the same day, two names that said nothing about
being siblings. That is the incoherence this file exists to remove.

Slugs: `pirates_v_unicorns` (p1), `alien_farm` (p2), `troy` (p3),
`metropolis_hideout` (p4), `hellenist_city` (p5), `redwood_camp` (p6),
`glowcap_vale` (p7).

## Releases

| release | date | commit | deck | slugs present | notes |
| --- | --- | --- | --- | --- | --- |
| r1 | 2026-08 | — (pre-archive) | luna | pirates_v_unicorns, troy | The Luna era. First e2e worlds; predates the candidate archive, so no doc is preserved. |
| r2 | 2026-08 | — (pre-archive) | luna-intent | pirates_v_unicorns | p1 re-roll with the intent pre-pass on. |
| r3 | 2026-08 | — (pre-archive) | luna-full | pirates_v_unicorns | p1 re-roll, full pipeline. |
| r4 | 2026-08 | — (pre-archive) | luna-hh | pirates_v_unicorns | p1 re-roll at high effort; doc named `twin_isles_war`. |
| r5 | 2026-08-15 | 9b4dd50 (archive) | gem1 | all seven | The battery's second author: seven Gemini candidates. Kai's anchor of GOOD for `metropolis_hideout` and the `hellenist_city` monsters. |
| r6 | 2026-08-10 | 02a0379 (archive) | c1 | pirates_v_unicorns, alien_farm, troy, metropolis_hideout, hellenist_city, redwood_camp, glowcap_vale | Candidate ladder, round 1. |
| r7 | 2026-08-11 | 805827c (archive) | c2 | pirates_v_unicorns, alien_farm, troy, metropolis_hideout, redwood_camp, glowcap_vale | Candidate ladder, round 2 — flags and monoliths arrive. |
| r8 | 2026-08-14 | 8d5d79d, fe3c508 (archive) | c3 | pirates_v_unicorns, alien_farm, troy, metropolis_hideout, hellenist_city | Candidate ladder, round 3. "The battery is whole: seven prompts, seven current candidates." |
| r9 | 2026-08-14 | fe3c508 (archive) | c3b | metropolis_hideout | p4-only re-roll of its c3. |
| r10 | 2026-08-11 | afa7b42 (archive) | c4 | troy, hellenist_city | p3's wall finally belongs to the city it guards. |
| r11 | 2026-08-11 | d4353bb (archive) | c5 | troy | The wall meets the edge of the world and holds. |
| r12 | 2026-08-11 | d4353bb (archive) | c5b | troy | p3-only re-roll of its c5. |
| r13 | 2026-08-17 | 668de60 (archive) | final | all seven | "The final deck archives: seven fresh worlds on the grown catalog." |
| r14 | 2026-08-17 | d4aab98 (archive) | padfix | pirates_v_unicorns, troy, hellenist_city, glowcap_vale | Post platform-disease fix (a3687e4 + teaching 8cb9c77), seeds 301/303/305/307. Troy one-shot clean — the first one-shot battery world. See `candidates/PADFIX-NOTE.md`. |
| r15 | 2026-08-18 | — (not archived) | tie | pirates_v_unicorns, troy, hellenist_city, glowcap_vale | Pre-stamp frontage-tie deck; superseded for the walk by r16, kept installed alongside. |
| r16 | 2026-08-18 | authored 97fe40d, compiled 200209b (archive d018284) | tie2 | pirates_v_unicorns, troy, hellenist_city, glowcap_vale | The ground-unification deck, post-8F flip. One `conforms:true` program ever — `warding_crystal_pylon` (p1). Kai's anchor of GOOD for `pirates_v_unicorns`. See `candidates/TIE2-NOTE.md`. |
| r17 | 2026-08-18 | — (not archived) | gem2 | pirates_v_unicorns, troy, hellenist_city | Gemini re-roll after tie2. |
| r18 | 2026-08-15 | 9b4dd50 (archive, `p1-gemhero`) | hero1 | pirates_v_unicorns | The walked A/B hero, gate-era pre-sweep; doc `isles_of_war`. |
| r19 | 2026-08-15 | 9b4dd50 (archive, `p1-gemhero`) | hero2 | pirates_v_unicorns | Hero re-roll v2. |
| r20 | 2026-08-15 | 9b4dd50 (archive, `p1-gemhero`) | hero3 | pirates_v_unicorns | Hero re-roll v3 — the world behind the web viewer hero export. |
| r21 | 2026-08-19 | d4b692e (archive) | v14 | troy, hellenist_city, pirates_v_unicorns | First deck installed under series naming. Seeds 303/305/301, all exit 0 first roll (~$0.75). Kai's verdict: "continuing to regress." See `candidates/V14-NOTE.md`. |

### Reading the commit column

The commit is the **archive** commit — where that deck's docs and logs landed
in `battery/candidates/` — not the commit the world was compiled at, except
where a note records the compile commit explicitly (r16). Archive commits were
made in batches, so a later archive date does not mean a later generation:
`gem1` (r5) archived on 08-15 but was rolled before the candidate ladder, and
the ladder's per-prompt rounds ran on different days. The **deck order in this
table is the generation order**, ratified in `tools/worlds/RENAME-LEDGER.md`,
and it is what the release numbers encode.

The candidate ladder (r6–r12) is the one place where a "release" is looser
than one batch: `c1`…`c5b` were per-prompt iteration rounds, so p3's c4 and
p1's c3 are not literally the same afternoon. They are kept as cohorts because
the round is the unit that carried a compiler state, and because splitting them
per prompt would give twenty single-slug releases that say less, not more.

## Matrix worlds — not releases

`mx_*` worlds are **not** releases. They are compiler-flag matrix runs over an
*existing* release's preserved document: the doc is held fixed and the compiler
configuration is varied, precisely so the deck's usual confound (compiler +
authoring roll + teaching, all moving at once) is broken apart. They keep their
own names and take no release number.

| world | derives from | varied |
| --- | --- | --- |
| `pirate_unicorn_war_mx_head` | r16 (tie2) p1 doc | none — head baseline |
| `pirate_unicorn_war_mx_notie` | r16 (tie2) p1 doc | frontage tie off |
| `pirate_unicorn_war_mx_noseam` | r16 (tie2) p1 doc | served seams off |
| `pirate_unicorn_war_mx_nodens` | r16 (tie2) p1 doc | BLOCK_MULTI_RECT density off |
| `pirate_unicorn_war_mx_allold` | r16 (tie2) p1 doc | all three off |
| `overgrown_metropolis_hideout_mx_head` | r5 (gem1) p4 doc | none — head baseline |
| `modern_hellenist_assault_mx_head` | r5 (gem1) p5 doc | none — head baseline |

## Installing into a release

    terrainist install <worldDir> --saves <saves> --series troy --release 21

Every world of a deck takes the same `--release`. The number is assigned by the
deck, so the install **errors** if `<slug>_r<N>` already exists rather than
bumping to `-2`: an auto-incrementing counter is what this file replaced.
| r22 | 2026-08-19 | 25e5e68 | matrix-verdict fixes | troy, hellenist_city, pirates_v_unicorns | all first/second-roll clean (~$0.41, troy one-shot); the five convictions served: damsWater, land/sea teaching, empty-block law, datum cut-cap (8G), cohort naming |

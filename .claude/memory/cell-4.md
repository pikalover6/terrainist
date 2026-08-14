# Cell 4 — current state (2026-08-14 night, walk-feedback round)

**WHERE THINGS STAND:** Kai walked the battery and is "very happy
overall"; two ratified fixes landed the same evening, both committed
and pushed:

- **Leaf contact (82b94db):** the ±1 eave ring in structureBoxes now
  carries leafInset:1 — leaves clip against the exact footprint and
  grow right up to walls EVERYWHERE (Kai's ruling); wood keeps the
  ring; road corridors clip all parts; both clip readers part-aware
  in sync; structures stamp after trees so facades win collisions.
- **Bespoke facing (ecb162f, LOAM-SPEC §15.1):** canonical front =
  local −Z, declared by publishing a `front` anchor (doubles as the
  road-approach point); doc-level coordinate-free
  `face:{toward|away_from:<selector>}` on authored/scatter.program
  invocations; solver snaps to 90° and rotates the placed run (coords,
  turned-box fit, directional states; outputHash stays local-frame).
  No front anchor → never rotated (reach law, tested byte-identical).
  Default when front but no face: road-network reach estimate, else
  settlement centre. W518 PROGRAM_FACE_UNRESOLVED, never fatal.
  Mutual `toward` terminates via binding pre-fit estimates. Kits teach
  both sides (program-author: build fronts north + declare;
  settlement-author: write face when the prompt implies direction —
  invaders toward, departing away_from, confronting pairs mutual).

**CLAUDE.md rewritten (d82cc04, Kai's ruling):** laptop-bridge section
deleted; ALL history trails stripped — current info only; Prism path +
never-replace moved into Ground rules; status numbers refreshed.

**P1 HEAD-TO-HEAD DONE (seed 301, post-fix kit both sides), installed
to Prism:** overgrown_hideout_c3b (leaf-fix minimal diff),
twin_isles_war_luna-hh, isles_of_war_gem37-hh. RESULT: Luna ≈ $0.079
total, 1 revision, everything shipped, clean. Gemini 3.7 Flash
(--effort high) ≈ $0.59-0.75, 6 model runs, all 4 feedback rounds,
**2 of 3 bespoke programs DROPPED** (corsair_dreadnought died on the
minecraft:chain trap; ward_crystal under the 500-solid nonsense
guard), pirate flagship missing from the shipped world, two forests
empty (T118 radius misuse never fixed). Verdict: per-call token
efficiency real (doc in 1 tight attempt, dollar-wash vs Luna despite
3.5x unit price) but RELIABILITY dominates pipeline economics —
retry loops swamped it. Both models declared `front` anchors
(gemini's statue literally comments "toward north (-Z)"); neither
wrote a doc-level `face` this prompt. Reasoning-token split now a
captured line item (1e9cd44); parallel batch runner committed
(tools/battery/generate-batch.sh, 32f2230); CLAUDE.md rewritten
current-info-only (d82cc04).

**BESPOKE GAUNTLET (bespoke_gauntlet_401 in Prism):** 4 identical
briefs × {Luna max, Gemini 3.7 high} through the real gate on a flat
plain, seed 401. **Luna 4/4 ok, $0.14; Gemini 1/4 ok, $0.49, never
passed round 1** (3× floating sea_lantern habit it never repaired; 1×
the chain trap). Reasoning split (first captured run): Luna spends
~90% of out on reasoning, Gemini ~50%. Grid: west=Luna, east=Gemini,
rows N→S leviathan/astronomer/belltower/elephant; only the elephant
row is a walkable A/B pair. CONFIRMED MACHINERY GAP: minecraft:chain
is absent from the pinned 1.21.11 prismarine registry (real vanilla
block; registry data gap) and the E336 message reads like a model
hallucination — improving that diagnostic to say "use iron_bars" is a
cheap candidate fix, not yet done. war_elephant_gem took a quarter
turn from its front anchor — facing machinery observed working live.

**OPEN / BLOCKED, by whose move:**
- KAI: walk the head-to-head + p4-c3b when installed; judge remaining
  "more subjective" battery polish he deferred; survivor-yards ruling
  (status quo holds); F3 junction iteration (walk-gated).
- POST-FREEZE BY DESIGN (machinery backstop 2026-08-28): water-movers
  (fluid.channel), three bridges, `between` route form, tier-A
  structure.linework, F5 WP-6 freeze, maglev_pylon.

**Full tree after both fixes: 4,320 passed / 0 failed.**

**Standing discipline reminders:** INSTALLS GO TO PRISM: `--saves
"/Users/kaihoward/Library/Application Support/PrismLauncher/instances/
Fabulously Optimized/minecraft/saves"`; never --replace; battery/ is
the durable archive (docs+logs committed, worlds/reports ignored);
orchestrator commits (agents never); shared-tree git discipline; agent
briefs carry the physics-lessons block (walkable = solid non-water
floor + air y+1/y+2; mud is 15/16; no six-air-face; solid-per-course;
lantern-name rule → glowstone; no chain in 1.21.11; params AND
envelope are input space) and distinct committed anchor lineages;
pipes swallow vitest exits — check COUNTS; tee generates; never emit
worlds from a dist carrying in-flight agent code; NEVER-WAIT
(CLAUDE.md) governs all pacing.

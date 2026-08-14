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

**IN FLIGHT (background, scratchpad/head-to-head.sh):** (1) p4-c3b —
archived overgrown doc recompiled unchanged on the fixed compiler =
minimal-diff leaf-fix walk; (2) the P1 HEAD-TO-HEAD, seed 301, same
prompt, post-fix kit both sides: Luna (default, effort max) vs
**google/gemini-3.7-flash at explicit --effort high** (Kai wants
gemini evaluated as a possible cheap bespoke-gen model; id verified
live on OpenRouter). Install all three to Prism alongside (--channel
luna-hh / gem37-hh / c3b), never --replace.

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

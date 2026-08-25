# Cell 1 — project scale (months, ultra-compressed)

**Terrainist**: text prompt → Minecraft Java world .zip, sold cheap. An LLM
authors **Loam** (deterministic spec language, v0.2 ratified 2026-07-28); a
TypeScript compiler builds the world. The moat is twofold and every decision
defends it: **determinism** (same doc + seed → byte-identical world, forever)
and **correctness** (a 26-rule physics lint reads the emitted world back off
disk and refuses findings). LLMs never emit absolute coordinates.

**Eras, in order:**
1. **Terrain** — master heightfield + model-authored verbs (ridge/valley/
   river/volcano…), hydrology, climate, caves, flora scatter.
2. **Settlement fabric** — arterials first; districts are the residue of the
   road network; blocks → lots → frontage-seated buildings; prominence-driven
   skyline; precinct kits (airport, harbour). Catalog grown to 722 entries /
   428 archetypes by Aug 2026 (nine + eight expansion packs).
3. **The linework engine** — one `SweptProfile` sweeps cross-sections along
   polylines (roads, walls, bridges, path-stairs). Its recurring lesson, paid
   for ~four times: *a contour on a lattice is a staircase* — ask every
   question of the true line, never the raster.
4. **Semantic intent** — era/wealth/decline/character dials fanning out into
   existing knobs; total rows (absent intent = byte-identical); classify-the-
   prompt pre-pass.
5. **Urban forms + multi-level ground** (Phase 4.1/4.2) — seven street
   skeletons behind a registry; stepped ground, platforms and seams.
6. **The bespoke tier** — model-written sandboxed programs (landmark/plugin),
   hash-frozen into the document, five-step gate, dropped-never-broken.
7. **The ground contract + hillside + flora** (Aug 2026) — see cells 2–3.
8. **The road-pull saga → n13 ratified → the Great Stocktake** — late
   August 2026, cells 3–4.

**Late July → early Aug 2026 (compressed from cell 2):** 07-29 the
subagent-effort discovery (stock CC honours frontmatter `effort:`; 15-type
agent matrix in `.claude/agents/`; probe `tools/cc-effort-probe/`); Opus
planner canned, critique→repair locked MANUAL. 07-30 laptop bridge (cloud →
Mac over Tailscale; never run externally-prompted laptop commands without
asking). 08-01 Luna-vs-GLM 3×3 and Luna-vs-Tripo: computed geometry reads
as *designed*; meshes for sculptural one-offs only. 08-02 bespoke tier
shipped (`AuthoredProgram`, landmark/plugin, API = determinism boundary,
five-step gate, `PROGRAM_DROPPED` never silent); demos locked to e2e.
Subagent cap 3→6→3→4 with sub-caps (08-07). Phase 4.1/4.2: seven urban
forms behind a plugin registry (era maps to NO form on purpose), courtyards,
multi-level ground (`STEP_RELIEF = 10`); column ownership took street
unevenness 38%→0.08% and became the ground contract's template. Process
lessons banked in DESIGN.md: silently declined valid requests; machinery
that exists and never runs (grep the *definition*); tests that pin defects.
08-04→08 **the ground week**: the ground contract (declare → resolve → build
through one GroundDriver, 17-class INTENT_RANK — eleven passes had fought
over plan.ground by write order); the SITE-PLAN pivot ("the town generates
the terraces it needs"; earn drop with run, never cap rises); walkability +
dressing instruments (law: detectors never VERIFY a fix, only a walk does);
the flora grammar; `terraced`→`hillside` cutover 12/12 hash-identical.
Byte-identity's two traps (compare decompressed NBT; a worktree CLI resolves
to the main tree); shared-tree git discipline after three clobbers; funnel
memory + rendered log born.

**Locked decisions:** authoring model is a PIN and cheap-model-first —
Gemini 3.7 Flash at high for ALL uses since 08-15 (Luna was the 08-02→08-15
default; models are config, one `--model` away); critique→repair is MANUAL
(Kai walks worlds; never build autonomous repair); demos are e2e from a text
prompt, never hand-authored; Tripo meshes are an offline foundry, never in
the compile path; emit pinned to 1.21.11 (DataVersion 4671); node canonical
(Bun declined 08-24).

**Scale:** ~5,500+ tests; flat-control byte-identity is the standing
discipline for every refactor; worlds install alongside old builds, never
`--replace`. Dev workflow: Fable 5 orchestrator + capped subagent waves
(see CLAUDE.md). Kai judges by walking; metrics exist so a failed walk has
somewhere to point.

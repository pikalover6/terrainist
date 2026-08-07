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
   skyline; 343/441 catalog archetypes; precinct kits (airport, harbour).
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

**Locked decisions:** authoring = GPT 5.6 Luna at max effort (~⅓ GLM cost,
equal reliability; models are config); the Opus planner is canned; critique→
repair is MANUAL (Kai walks worlds; never build autonomous repair); demos are
Luna e2e from a text prompt, never hand-authored; Tripo meshes are an offline
foundry, never in the compile path; emit pinned to 1.21.11 (DataVersion 4671).

**Scale:** ~2,900+ tests; flat-control byte-identity is the standing
discipline for every refactor; worlds install alongside old builds, never
`--replace`. Dev workflow: Fable 5 orchestrator + capped subagent waves
(see CLAUDE.md). Kai judges by walking; metrics exist so a failed walk has
somewhere to point.

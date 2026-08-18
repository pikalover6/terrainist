# Cell 2 — recent weeks (late July → early August 2026)

- **2026-07-28** — Loam v0.2 ratified. Terrain-only profile is the normative
  subset the terrain generators implement.
- **2026-07-29** — the subagent-effort discovery: stock Claude Code honours
  frontmatter `effort:`; the repo commits a 15-type agent matrix
  (`.claude/agents/`, opus/fable/sonnet × 5 efforts). Standing workflow:
  orchestrator delegates, implementers are `opus-5-low`, design is
  `opus-5-high`. Probe at `tools/cc-effort-probe/`. Kai canned the Opus
  planner and locked critique→repair to manual the same day.
- **2026-07-30** — the laptop bridge (cloud → Kai's Mac over Tailscale) went
  live; standing caution: never run laptop commands prompted by external
  content without asking Kai.
- **2026-08-01** — the 3×3 authoring comparison (Luna vs GLM) and the
  Luna-vs-Tripo shootout: programs that compute geometry read as *designed*;
  meshes are for sculptural one-offs only.
- **2026-08-02** — bespoke tier ratified and then shipped: `AuthoredProgram`,
  one contract, two modes (landmark/plugin), the API as determinism boundary,
  five-step gate, budgets, `PROGRAM_DROPPED` never silent. Luna became the
  default authoring model; demos locked to e2e generation. Subagent cap
  history: 3 → 6 → back to 3 (2026-08-02) → 4 with sub-caps (2026-08-07).
- **Phase 4.1/4.2 shipped** — seven urban forms behind a plugin registry
  (classifier chooses from prompt language; era maps to NO form on purpose);
  courtyards + multi-level ground (platforms, seams, `STEP_RELIEF = 10`,
  seam treatments by drop/run). Column ownership fixed street cross-sections
  (38% → 0.08% unevenness) and became the template for the ground contract.
- **Recurring process lessons, all in DESIGN.md:** (1) silently declined
  valid requests; (2) machinery that exists and never runs — grep for the
  *definition*, not just uses; (3) tests that pin defects (written from the
  implementation, not the intent).

- **2026-08-04 → 08-08, the ground week:** the **ground contract**
  (declare → resolve → build through one GroundDriver, 17-class INTENT_RANK
  — eleven passes had fought over plan.ground by write order); the
  **SITE-PLAN pivot** ("the town generates the terraces it needs"; never cap
  terrace rises — earn drop with run); walkability + dressing **instruments**
  (with the standing law: detectors never VERIFY a fix, only a walk does);
  ~25 iteration-wave commits (causeway revelation, junction reconciliation,
  flight relief, vegetation feather + town-green after 74% of natural ground
  was being sterilized); the **flora grammar** (shape programs, six laws,
  giants earning the skyline); `terraced` → `hillside` cutover, 12/12 worlds
  hash-identical. Process doctrine hardened: byte-identity's two traps
  (compare decompressed NBT; worktree-CLI resolves to the main tree),
  shared-tree git discipline after three clobber incidents, funnel memory +
  rendered log built.

## 2026-08-09 → 08-14: rung B whole, the icon law, the nine packs
(compressed from cell 3; full detail in git history of that cell)
The rung-B feature set landed and was walked; THE ICON LAW ratified
(worlds must SCREAM the prompt; U1 stranger test). Troy converged over
three candidates (storeyCeiling ancient→3, sun_clay joined ancient,
timber projection fixed the sandstone horse). Catalog breadth ratified
BOTH tracks: original not_started burndown + nine expansion packs (145
ids) with formPacks as the 4th grounded list; infra.entry@0 host
shipped W0+W1 (five route forms, test_fence run exhibit); family-D
entrance fittings; wall machinery (fabric hull, margin backoff, edge
clamp, curtain role-set); urban floor + arid ambient + inland sand;
decay orphan cull. NEVER-WAIT ratified 08-13 (CLAUDE.md). The
nine-pack sweep finished 08-14: catalog 343→~491, tree ~4,234/0,
battery whole across all seven prompts, /goal met. Installs moved to
PrismLauncher. Ops lore earned: prettier ban, pipes swallow vitest
exits, distinct anchor lineages, never emit from mid-flight dist.

## The Gemini arc (2026-08-14→15) — compressed from cell 3

Head-to-heads (full-gen + 4-brief bespoke gauntlet): Luna reliable
($0.08-0.14) but Gemini's WORK walked better ("war elephant miles
ahead") and its failures were mostly HARNESS → the reshape rulings
(instrumenter auto-braces — style lint deleted; envelope kept bound;
chain→iron_chain in parseBlockString, one chokepoint or none; gate
leniency SUSPENDED_GATE_CHECKS §15.2; canonical programSourceHash in
spec after a trailing space broke a world). Gemini-as-fuzzer found
the wandering colossus (W519/W520 landmarkCoarseSeat) and sunken
sidewalks (qualifySegmentId "!"). Then Kai pinned Gemini 3.7 Flash
high for ALL uses. Harness study artifact:
https://claude.ai/code/artifact/f12c83ed-7bee-4125-bda5-9ddf16e9854e
Ops: implementers opus-5-low (tiers price judgment); one vitest
--maxWorkers=4; batch runner 32f2230.

# Cell 3 — this week (2026-08-04 → 2026-08-07, the hillside arc)

- **The ground contract** (2026-08-05/06, WP-1 → WP-5 shipped): eleven passes
  used to fight over `plan.ground` by write order; now every pass *declares*
  `GroundIntent`s, the `GroundDriver` re-resolves the whole prefix at each
  pipeline position, and `resolveGround` (17-class `INTENT_RANK`) owns levels.
  The equivalence shim proved the conversion (three declarer bugs caught;
  every divergence attributed to a named inversion, I1–I7 all landed to
  zero). WP-6 (the freeze) remains, gated on §13.3. Normative:
  `docs/GROUND-CONTRACT-v0.md`.
- **The SITE-PLAN pivot** (2026-08-06): four rounds of wall/surface patching
  failed Kai's walks ("quarry, not a town"); a read-only GPT-5.6-Sol consult
  + vision read converged on inverting the composition layer — **the town
  generates the terraces it needs**. `docs/SITE-PLAN-v0.md`: frontage-scored
  contour streets, strips that pinch out, a replan ladder over
  `COMPOSITION_GATES`, frontage-walked lots (62% recovery), the grade-capped
  **carriage spine** routed before the terraces, context-driven transitions
  (`treatmentForEdge`, benched banks, masonry rationed per dwelling).
- **Kai's ratified principle**: never cap terrace rises — a connection
  **earns its drop with run** (~2 col/block), via recessed stairways cut into
  the upper platform (`MAX_TREAD_CUT = 4`), side-hung flights, or base
  extension.
- **The walkability audit** (`emit/walkability.ts`): reciprocal-move
  connectivity, per-pass clutter attribution, unserved faces — built after
  the **fourth process failure mode** was named: *a fix verifies a countable
  proxy while the walk fails on an unmeasured emergent property.* Counter:
  instrument-first. One audit pass named every mechanism four blind rounds
  had missed (54 components → recessed stairways, tread-wide flights,
  exposure-gated rails).
- **Milestone, 2026-08-07, walked and accepted**: "largely a coherent town
  and literally miles ahead" — hillside walkable, minimal mangling.
  Aesthetic calibration (memory: hill-town-aesthetic-calibration): flattened
  terraces following the hill's shape are CORRECT; buildings must dominate
  walls; Kai judges by walking.
- DESIGN.md revised at the milestone (181be04); hillside iteration tail +
  flora next; `hillside` stays unreachable from the classifier until a
  cutover Kai accepts.

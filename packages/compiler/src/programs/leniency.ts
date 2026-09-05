/**
 * Gate leniency — the one switch behind the suspended checks.
 *
 * Ratified by Kai 2026-08-15 and made PERMANENT 2026-08-17, closing the
 * harness study on the Gemini sweep's evidence: the bespoke program gate was
 * discarding visually excellent builds over mechanical nits (a serpent strung
 * with 39 "floating" sea lanterns that read as art). The suspended checks
 * still RUN and are still REPORTED — they are demoted to warnings and never
 * fail a program or spend a repair round.
 *
 * What stays FATAL is deliberately unchanged: the static step, double-run
 * determinism / `outputHash` agreement, the runtime limits (fuel, writes,
 * heap), and an emit that THROWS inside the physics step (a block the registry
 * cannot resolve). A lint *finding* from the walked scratch world is suspended;
 * an emit throw is not.
 *
 * Flip an entry to `false` to make that check fatal again — that is the whole
 * revert.
 */
export const SUSPENDED_GATE_CHECKS = {
  /** `gateStructural`'s single-connected-solid verdict. */
  structural: true,
  /** `gateNonsense`'s 500-solids / 8-tall guard. */
  nonsense: true,
  /** Physics-lint findings from the gate's scratch-world walk. */
  physicsFindings: true,
  /** The >1% clipped-writes threshold in `run.ts`. */
  envelopeClip: true,
} as const;

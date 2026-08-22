/**
 * The environs of the Troy demo — the siege camp on the plain, the
 * necropolis on its knoll, the grove-keepers among the olive terraces.
 * Same two-moment contract as `town.mjs`, same laws
 * (`docs/COHERENT-SOURCE-v0.md`): sketch is pure data before the freeze;
 * structures stand on `groundAt` after it and never move earth.
 *
 * STUB — WP-ENVIRONS fills this in. The core already wires both exports.
 */

/** The environs' asks: building sites for the camp and grove edges. */
export function environsSketch(anchors) {
  void anchors;
  return { sites: [] };
}

/** Everything the environs stand on the frozen ground. */
export function environsStructures(input) {
  void input;
  return { blocks: [] };
}

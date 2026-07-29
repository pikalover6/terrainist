/**
 * Prop grammars — vehicle/prop generators land here (track D).
 *
 * **Seam file.** It exists so the prop track has a file of its own to grow in,
 * and so no other track ever has to touch it. Nothing here yet but the
 * registry: a prop generator registers itself by name, and the callers that
 * will look props up (settlement dressing, dev-world exhibits) go through this
 * map rather than importing generators one by one.
 *
 * The value type is `unknown` on purpose — the prop generator signature is
 * track D's to design, and pinning it before then would be a guess. Narrow it
 * in this file when the first real generator arrives.
 */

/** Prop name → generator. Empty until track D lands. */
export const PROP_GENERATORS: Record<string, unknown> = {};

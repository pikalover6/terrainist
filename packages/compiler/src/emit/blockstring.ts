/**
 * Full block strings — `"minecraft:oak_stairs[facing=north,half=top]"` — split
 * into a name and a property map.
 *
 * Lives in emit because the authored-program pipeline speaks this syntax; the
 * emit layer is the shared parser for that pipeline.
 */

/**
 * Old block names the pinned registry spells differently — vanilla renames,
 * applied silently at parse time because the semantics are identical and a
 * repair round spent on a spelling update is a repair round wasted (Kai,
 * 2026-08-15). Living in the PARSER is the point: the authored-program
 * pipeline speaks through here, so a rename can never pass one check and fail
 * another. (The first fix lived only in the emit resolver, and a document
 * whose programs passed validation then failed compile-side lowering on the
 * same block. One chokepoint or none.)
 *
 * `chain` → `iron_chain` is the copper-age rename, the single departure a
 * 1.21.4-vs-1.21.11 registry diff shows; the `axis` state carried over.
 */
const BLOCK_RENAMES: Readonly<Record<string, string>> = {
  chain: "iron_chain",
};

/** Split a full block string into its name and its property map. */
export function parseBlockString(
  block: string,
): { readonly name: string; readonly props: Record<string, string> } | undefined {
  const match = /^(?:minecraft:)?([a-z0-9_]+)(?:\[(.*)\])?$/.exec(block.trim());
  if (match === null) return undefined;
  const props: Record<string, string> = {};
  const body = match[2];
  if (body !== undefined && body.trim().length > 0) {
    for (const pair of body.split(",")) {
      const [key, value] = pair.split("=");
      if (key === undefined || value === undefined) return undefined;
      props[key.trim()] = value.trim();
    }
  }
  const raw = match[1] as string;
  return { name: BLOCK_RENAMES[raw] ?? raw, props };
}

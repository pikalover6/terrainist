/**
 * Full block strings — `"minecraft:oak_stairs[facing=north,half=top]"` — split
 * into a name and a property map.
 *
 * Lives in emit because both the spike-document palette and the authored
 * program pipeline speak this syntax; the emit layer is the lower of the two.
 */

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
  return { name: match[1] as string, props };
}

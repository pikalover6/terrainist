/**
 * Pulling a JSON document out of whatever the model actually said.
 *
 * The kit tells the model to emit bare JSON, and it usually does. "Usually" is
 * not a contract, so this handles the three real-world failure modes: a
 * ```json fence, leading prose before the object, and trailing commentary
 * after it. Brace matching is string- and escape-aware, so a `}` inside a
 * block name cannot end the scan early.
 */

/** Extracted JSON, or the reason nothing could be extracted. */
export type JsonExtraction =
  | { readonly ok: true; readonly value: unknown; readonly source: string }
  | { readonly ok: false; readonly reason: string };

/** Extract the first complete JSON object from a model response. */
export function extractJson(raw: string): JsonExtraction {
  const text = stripFences(raw).trim();
  if (text === "") return { ok: false, reason: "the response was empty" };

  // Fast path: the whole thing is the document.
  const whole = tryParse(text);
  if (whole.ok) return whole;

  const start = text.indexOf("{");
  if (start === -1) {
    return { ok: false, reason: "the response contains no JSON object (no '{' found)" };
  }

  const end = matchingBrace(text, start);
  if (end === -1) {
    return { ok: false, reason: "the response has an unterminated JSON object" };
  }

  const slice = text.slice(start, end + 1);
  const parsed = tryParse(slice);
  if (parsed.ok) return parsed;
  return { ok: false, reason: parsed.reason };
}

/**
 * Remove a surrounding markdown fence, if any.
 *
 * Handles ```json, ```JSON, plain ``` and the case where the model opened a
 * fence and forgot to close it.
 */
export function stripFences(raw: string): string {
  const text = raw.trim();
  const opener = /^```[a-zA-Z0-9_-]*\s*\n/;
  const match = opener.exec(text);
  if (match === null) return text;
  const body = text.slice(match[0].length);
  const closer = body.lastIndexOf("```");
  return closer === -1 ? body : body.slice(0, closer);
}

/** Index of the `}` matching the `{` at `start`, or −1. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function tryParse(text: string): JsonExtraction {
  try {
    return { ok: true, value: JSON.parse(text) as unknown, source: text };
  } catch (cause) {
    return { ok: false, reason: `JSON.parse failed: ${(cause as Error).message}` };
  }
}

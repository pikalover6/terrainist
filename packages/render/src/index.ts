/**
 * Headless rendering.
 *
 * Placeholder scaffold: deepslate-backed multi-angle renders land in G1/G3.
 */

import type { LoamDocument } from "@terrainist/spec";

/** A single requested camera angle for a render. Placeholder shape. */
export interface RenderView {
  name: string;
}

/** Not implemented yet — deepslate headless rendering lands in G1/G3. */
export function render(_document: LoamDocument, _views: RenderView[]): never {
  throw new Error("@terrainist/render: render() is not implemented yet");
}

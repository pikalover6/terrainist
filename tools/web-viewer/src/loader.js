/**
 * Fetching a world export in the browser.
 *
 * Chunks are gzipped on disk and decompressed with `DecompressionStream`, so
 * there is no inflate library in the page — and no build step needed to get
 * one. A static file server that knows nothing about gzip serves these
 * correctly precisely because the compression is ours, inside the payload,
 * rather than a transfer encoding.
 */

import { decodeChunk } from "./format.js";

export async function loadManifest(worldUrl) {
  const response = await fetch(`${worldUrl}/manifest.json`);
  if (!response.ok) throw new Error(`viewer: no manifest at ${worldUrl} (${response.status})`);
  const manifest = await response.json();
  if (typeof manifest.format !== "string" || !manifest.format.startsWith("terrainist-web-world/")) {
    throw new Error(`viewer: ${worldUrl} is not a Terrainist web export`);
  }
  return manifest;
}

export async function loadChunk(worldUrl, entry) {
  const response = await fetch(`${worldUrl}/${entry.file}`);
  if (!response.ok) throw new Error(`viewer: chunk ${entry.file} (${response.status})`);
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return decodeChunk(bytes);
}

/**
 * The chunk worker: fetch, gunzip, decode and mesh, all off the main thread.
 *
 * The POC did every one of those on the render thread and hitched visibly each
 * time a chunk streamed in — 16 sections of meshing lands somewhere between 10
 * and 60 ms, and there is no budget in a 16 ms frame for any of it. So the
 * whole pipeline moved here, and what crosses back is finished vertex data,
 * transferred rather than copied. The main thread's remaining job is to hand
 * those buffers to the GPU, which is the one part that genuinely cannot be
 * delegated.
 *
 * Two rules keep it responsive:
 *
 * - **One chunk per macrotask.** Meshing a chunk takes as long as it takes, but
 *   yielding between chunks lets a `focus` message land, and a `focus` message
 *   is what re-sorts the queue toward wherever the camera just turned. A worker
 *   that meshed its whole backlog in one go would deliver the right chunks in
 *   the wrong order.
 * - **The worker owns a second copy of the world.** The main thread keeps its
 *   own for collision; this one is for meshing, and neither waits on the other.
 *   A chunk is ~50 KB decoded, so the duplication costs a few megabytes across
 *   a full view radius and buys the absence of a round trip per sample.
 */

import { WorldView } from "./format.js";
import { loadChunk } from "./loader.js";
import { meshSection } from "./mesher.js";

const CHUNK_WIDTH = 16;

/** Chunk fetches in flight. Beyond this the network is the bottleneck anyway. */
const FETCH_PARALLEL = 6;

let worldUrl = "";
let palette = [];
let world = new WorldView({});

/** chunk key → manifest entry, for everything asked for but not yet meshed. */
const wanted = new Map();
/** chunk keys queued for meshing. */
const meshQueue = new Set();
/** chunk keys being fetched right now. */
const fetching = new Set();
/** Fetches asked for and not yet started. */
const fetchQueue = [];

let focus = { x: 0, z: 0, fx: 0, fz: -1 };
let pumping = false;
let bench = false;
const timing = { decoded: 0, decodeMs: 0, meshed: 0, meshMs: 0, quads: 0, triangles: 0 };

self.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      worldUrl = message.worldUrl;
      palette = message.palette;
      bench = message.bench === true;
      world = new WorldView({});
      return;
    case "load":
      for (const entry of message.entries) {
        const key = WorldView.key(entry.x, entry.z);
        if (wanted.has(key)) continue;
        wanted.set(key, entry);
        fetchQueue.push(key);
      }
      pump();
      return;
    case "drop":
      for (const key of message.keys) {
        const [x, z] = key.split(",").map(Number);
        world.drop(x, z);
        wanted.delete(key);
        meshQueue.delete(key);
      }
      return;
    case "focus":
      focus = message.focus;
      pump();
      return;
    case "report":
      self.postMessage({ type: "report", timing: { ...timing } });
      return;
    default:
      return;
  }
};

/** Distance to the camera, with anything behind it pushed to the back. */
function priority(key) {
  const [x, z] = key.split(",").map(Number);
  const dx = x - focus.x;
  const dz = z - focus.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 2) return distance;
  const ahead = (dx * focus.fx + dz * focus.fz) / distance;
  // A chunk you are looking at is worth about three you have your back to.
  return distance * (ahead > 0.2 ? 1 : ahead > -0.3 ? 1.8 : 3);
}

function takeNearest(collection) {
  let best;
  let bestScore = Infinity;
  for (const key of collection) {
    const score = priority(key);
    if (score < bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}

/**
 * Move the queues along: start fetches up to the parallel cap, then mesh one
 * chunk and yield. Re-entrant calls are cheap no-ops — `pump` is called from
 * every message handler on purpose, so a `focus` that arrives during a lull
 * restarts the pipeline without a timer.
 */
function pump() {
  while (fetching.size < FETCH_PARALLEL && fetchQueue.length > 0) {
    const key = takeNearest(fetchQueue);
    fetchQueue.splice(fetchQueue.indexOf(key), 1);
    void fetchOne(key);
  }
  if (pumping || meshQueue.size === 0) return;
  pumping = true;
  setTimeout(() => {
    pumping = false;
    const key = takeNearest(meshQueue);
    if (key !== undefined) {
      meshQueue.delete(key);
      buildChunk(key);
    }
    pump();
  }, 0);
}

async function fetchOne(key) {
  const entry = wanted.get(key);
  if (entry === undefined) return;
  fetching.add(key);
  try {
    const started = performance.now();
    const chunk = await loadChunk(worldUrl, entry);
    if (bench) {
      timing.decoded++;
      timing.decodeMs += performance.now() - started;
    }
    if (!wanted.has(key)) return; // dropped while in flight
    world.put(chunk);
    // The main thread needs the blocks too, for collision. A copy rather than
    // a transfer: this thread is about to mesh against the original.
    self.postMessage({
      type: "chunk",
      chunk: {
        chunkX: chunk.chunkX,
        chunkZ: chunk.chunkZ,
        minY: chunk.minY,
        height: chunk.height,
        cells: chunk.cells,
      },
    });
    // A new chunk changes its neighbours' border faces, so they are re-queued:
    // the alternative is a wall of stone at every seam.
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbour = WorldView.key(chunk.chunkX + dx, chunk.chunkZ + dz);
      if (wanted.has(neighbour) && world.has(chunk.chunkX + dx, chunk.chunkZ + dz)) {
        meshQueue.add(neighbour);
      }
    }
  } catch (error) {
    self.postMessage({ type: "error", key, message: String(error?.message ?? error) });
  } finally {
    fetching.delete(key);
    pump();
  }
}

/** Mesh one chunk, section by section, and ship the buffers out. */
function buildChunk(key) {
  const entry = wanted.get(key);
  if (entry === undefined || !world.has(entry.x, entry.z)) return;

  const started = performance.now();
  const sample = (x, y, z) => world.indexAt(x, y, z);
  const originX = entry.x * CHUNK_WIDTH;
  const originZ = entry.z * CHUNK_WIDTH;
  const first = Math.floor(entry.minY / 16);
  const last = Math.floor((entry.minY + entry.height - 1) / 16);

  const sections = [];
  const transfer = [];
  for (let section = first; section <= last; section++) {
    const built = meshSection(sample, palette, originX, section * 16, originZ);
    for (const part of [built.opaque, built.transparent]) {
      if (part.triangles === 0) continue;
      transfer.push(
        part.position.buffer,
        part.color.buffer,
        part.uv.buffer,
        part.cell.buffer,
        part.flags.buffer,
        part.index.buffer,
      );
      if (bench) {
        timing.quads += part.quads;
        timing.triangles += part.triangles;
      }
    }
    if (built.opaque.triangles === 0 && built.transparent.triangles === 0) continue;
    sections.push({ y: section * 16, opaque: built.opaque, transparent: built.transparent });
  }
  if (bench) {
    timing.meshed++;
    timing.meshMs += performance.now() - started;
  }
  self.postMessage({ type: "mesh", key, sections, ms: performance.now() - started }, transfer);
}

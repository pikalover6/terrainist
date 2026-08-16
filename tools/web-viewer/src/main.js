/**
 * The walkable viewer.
 *
 * Loads a `terrainist export-web` payload, streams the chunks near the camera,
 * and lets you fly or walk through the result. The heavy half — fetch, gunzip,
 * decode, mesh — lives in `worker.js`; this file owns the camera, the world's
 * second copy for collision, the GPU uploads and the landing sequence.
 *
 * The three things worth knowing before changing anything here:
 *
 * - **Nothing meshes on this thread.** Finished vertex buffers arrive from the
 *   worker already transferred, and the only per-frame work left is turning a
 *   capped number of them into `BufferGeometry`. That cap is what makes chunk
 *   streaming hitch-free; raising it trades smoothness for pop-in.
 * - **One material, two passes.** Opaque and translucent geometry share a
 *   shader that wraps a tiling UV inside an atlas cell (see `atlas.js`) and
 *   multiplies the result by a vertex colour carrying tint × sun × AO. A block
 *   with no texture points at the atlas's white cell, so the flat-colour
 *   viewer this grew out of is the same code path with a different cell.
 * - **The landing is a curtain, not a page.** The world starts loading at once
 *   and streams behind the black; the prompt types over the top of it. There is
 *   no navigation, so nothing is thrown away when it lifts.
 */

import * as THREE from "three";

import { CHUNK_WIDTH, WorldView } from "./format.js";
import { resolvePalette, texturesFor } from "./appearance.js";
import { atlasLayout, drawAtlas, loadAtlasImages } from "./atlas.js";
import { loadManifest } from "./loader.js";

/** Chunks meshed around the camera. One more ring than this is *loaded*. */
const VIEW_RADIUS = 10;
/** Sections turned into GPU geometry per frame. The anti-hitch valve. */
const UPLOAD_BUDGET = 3;
/** …and a byte ceiling on top of it, for the pathological all-detail chunk. */
const UPLOAD_BYTES = 1_500_000;

const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;
const GRAVITY = 28;
const JUMP_SPEED = 8.6;
const WALK_SPEED = 5.2;
const FLY_SPEED = 22;

const params = new URLSearchParams(location.search);
const worldUrl = params.get("world") ?? "worlds/isles_of_war";
const bench = params.get("bench") === "1";
const skipLanding = params.get("nolanding") === "1";
const texturesUrl = "textures/refi";

const hud = {
  root: document.getElementById("hud"),
  name: document.getElementById("hud-name"),
  position: document.getElementById("hud-position"),
  mode: document.getElementById("hud-mode"),
};
const landing = {
  root: document.getElementById("landing"),
  prompt: document.getElementById("landing-prompt"),
  status: document.getElementById("landing-status"),
};
const veil = document.getElementById("veil");
const enterHint = document.getElementById("enter-hint");

/** Resolved as soon as the manifest is in hand — the landing needs its prompt. */
let announceManifest;
const manifestReady = new Promise((resolve) => {
  announceManifest = resolve;
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = skyGradient();
const FOG_COLOR = new THREE.Color(0xa8c8e8);
const FOG_NEAR = VIEW_RADIUS * 8;
const FOG_FAR = VIEW_RADIUS * CHUNK_WIDTH * 1.15;

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 2000);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/**
 * A vertical sky gradient, drawn once into a 2×N canvas. Cheaper than a shader
 * and it also lights the fog, which is the only other thing standing between
 * the horizon and a hard edge.
 */
function skyGradient() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#3c78c8");
  gradient.addColorStop(0.55, "#8fbbe8");
  gradient.addColorStop(1, "#dceaf6");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

/* -------------------------------------------------------------------------- */
/* the block shader                                                            */
/* -------------------------------------------------------------------------- */

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 acolor;
  attribute vec4 cell;
  varying vec2 vUv;
  varying vec4 vCell;
  varying vec3 vColor;
  varying float vDepth;

  void main() {
    vUv = uv;
    vCell = cell;
    vColor = acolor;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

/**
 * The wrap, and why it needs explicit gradients.
 *
 * `fract(vUv)` is what tiles a texture across a merged quad, and it is also a
 * discontinuity: at every tile seam the hardware's own derivative of the
 * coordinate jumps by a whole tile, it concludes the surface is a mile away,
 * and it fetches the coarsest mip — a grey grid over the world. Taking the
 * derivative of the *unwrapped* coordinate and passing it to `textureGrad`
 * fixes it exactly, and is the reason this shader is written by hand rather
 * than assembled out of three.js chunks.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  // GLSL3 has no gl_FragColor; three's colorspace include still writes to
  // that name, so alias it to a declared out — three's own idiom. Found on
  // first GPU compile (the one thing no node test can check).
  layout(location = 0) out highp vec4 pc_fragColor;
  #define gl_FragColor pc_fragColor

  uniform sampler2D map;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float opacity;

  varying vec2 vUv;
  varying vec4 vCell;
  varying vec3 vColor;
  varying float vDepth;

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }

  void main() {
    vec2 wrapped = vCell.xy + fract(vUv) * vCell.zw;
    vec2 ddx = dFdx(vUv) * vCell.zw;
    vec2 ddy = dFdy(vUv) * vCell.zw;
    vec4 texel = textureGrad(map, wrapped, ddx, ddy);
    #ifdef CUTOUT
      if (texel.a < 0.5) discard;
    #endif
    vec3 rgb = srgbToLinear(texel.rgb) * vColor;
    float alpha = texel.a * opacity;
    rgb = mix(rgb, fogColor, smoothstep(fogNear, fogFar, vDepth));
    gl_FragColor = vec4(rgb, alpha);
    #include <colorspace_fragment>
  }
`;

function blockMaterial(atlas, { cutout, translucent }) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      map: { value: atlas },
      fogColor: { value: FOG_COLOR },
      fogNear: { value: FOG_NEAR },
      fogFar: { value: FOG_FAR },
      opacity: { value: translucent ? 0.72 : 1 },
    },
    defines: cutout ? { CUTOUT: "" } : {},
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: translucent,
    depthWrite: !translucent,
    side: translucent ? THREE.DoubleSide : THREE.FrontSide,
  });
}

/* -------------------------------------------------------------------------- */
/* world state                                                                 */
/* -------------------------------------------------------------------------- */

let manifest;
let palette;
let world;
let opaqueMaterial;
let transparentMaterial;
let worker;
/** chunk key → manifest entry. */
const index = new Map();
/** chunk key → THREE.Mesh[]. */
const meshed = new Map();
/** chunk keys the worker has been asked for. */
const requested = new Set();
/** Finished worker payloads waiting for their turn on the GPU. */
const uploadQueue = [];

const player = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  fly: true,
  onGround: false,
};

const keys = new Set();
const stats = {
  started: 0,
  firstFrame: 0,
  ready: 0,
  frames: 0,
  worstFrameMs: 0,
  longFrames: 0,
  uploadMs: 0,
  uploads: 0,
  quads: 0,
  triangles: 0,
};

// A debug handle: `terrainist.player.position.set(...)` from the console is how
// you get to a corner of a 512² world without flying there, and how a
// screenshot of a specific place gets taken reproducibly.
globalThis.terrainist = { player, keys, scene, stats, get manifest() { return manifest; } };

async function boot() {
  stats.started = performance.now();
  setStatus("reading the manifest");
  manifest = await loadManifest(worldUrl);
  announceManifest();
  hud.name.textContent = manifest.name;
  for (const entry of manifest.chunks) index.set(WorldView.key(entry.x, entry.z), entry);

  setStatus("assembling the atlas");
  const layout = atlasLayout(texturesFor(manifest.palette));
  const images = await loadAtlasImages(layout, texturesUrl);
  const atlas = new THREE.CanvasTexture(
    drawAtlas(layout, images, (w, h) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      return canvas;
    }),
  );
  atlas.colorSpace = THREE.NoColorSpace; // the shader linearises it itself
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  atlas.needsUpdate = true;
  if (bench) {
    console.log(
      `[bench] atlas ${layout.width}×${layout.height}, ${layout.slots.length} cells, ` +
        `${images.size} textures loaded`,
    );
  }

  opaqueMaterial = blockMaterial(atlas, { cutout: true, translucent: false });
  transparentMaterial = blockMaterial(atlas, { cutout: false, translucent: true });

  palette = resolvePalette(manifest.palette, manifest.solid, layout);
  world = new WorldView(manifest);

  const [sx, sy, sz] = manifest.spawn;
  player.position.set(sx + 0.5, sy + EYE_HEIGHT, sz + 0.5);

  setStatus("streaming the world");
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onWorkerMessage;
  // Absolutize before crossing the thread boundary: inside the worker a
  // relative URL resolves against /src/worker.js, not the page, and every
  // chunk fetch 404s into /src/worlds/… (found live; the error message only
  // prints the file name, so the bad prefix never showed).
  worker.postMessage({ type: "init", worldUrl: new URL(worldUrl, document.baseURI).href, palette, bench });

  streamChunks();
  requestAnimationFrame(frame);
  await firstChunksReady();
  stats.ready = performance.now();
}

/** Resolve once enough of the spawn neighbourhood is standing. */
function firstChunksReady() {
  const cx = chunkOf(player.position.x);
  const cz = chunkOf(player.position.z);
  const near = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const key = WorldView.key(cx + dx, cz + dz);
      if (index.has(key)) near.push(key);
    }
  }
  // Capped, because the curtain must lift either way: a chunk that 404s or a
  // network that stalls should cost a visitor a few seconds of black, not the
  // whole page.
  const deadline = performance.now() + 20_000;
  return new Promise((resolve) => {
    const check = () => {
      if (near.every((key) => meshed.has(key)) || performance.now() > deadline) resolve();
      else setTimeout(check, 60);
    };
    check();
  });
}

function onWorkerMessage(event) {
  const message = event.data;
  if (message.type === "chunk") {
    world.put(message.chunk);
    return;
  }
  if (message.type === "mesh") {
    uploadQueue.push(message);
    return;
  }
  if (message.type === "report") {
    reportBench(message.timing);
    return;
  }
  if (message.type === "error") console.warn(`viewer: ${message.message}`);
}

function chunkOf(value) {
  return Math.floor(value / CHUNK_WIDTH);
}

/** Ask the worker for everything within the load radius; drop the rest. */
function streamChunks() {
  const cx = chunkOf(player.position.x);
  const cz = chunkOf(player.position.z);
  const entries = [];
  for (let dx = -VIEW_RADIUS - 1; dx <= VIEW_RADIUS + 1; dx++) {
    for (let dz = -VIEW_RADIUS - 1; dz <= VIEW_RADIUS + 1; dz++) {
      if (Math.hypot(dx, dz) > VIEW_RADIUS + 1) continue;
      const key = WorldView.key(cx + dx, cz + dz);
      const entry = index.get(key);
      if (entry === undefined || requested.has(key)) continue;
      requested.add(key);
      entries.push(entry);
    }
  }
  if (entries.length > 0) worker.postMessage({ type: "load", entries });

  const dropRadius = VIEW_RADIUS + 3;
  const dropped = [];
  for (const key of requested) {
    const [x, z] = key.split(",").map(Number);
    if (Math.hypot(x - cx, z - cz) <= dropRadius) continue;
    dropped.push(key);
    requested.delete(key);
    world.drop(x, z);
    disposeChunk(key);
  }
  if (dropped.length > 0) worker.postMessage({ type: "drop", keys: dropped });

  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  worker.postMessage({ type: "focus", focus: { x: cx, z: cz, fx: forward.x, fz: forward.z } });
}

function disposeChunk(key) {
  const meshes = meshed.get(key);
  if (meshes === undefined) return;
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    scene.remove(mesh);
  }
  meshed.delete(key);
}

/**
 * Turn worker payloads into geometry, up to the frame's budget.
 *
 * This is the only place vertex data touches the GPU, and it is deliberately
 * the narrowest part of the pipe: a chunk arriving is otherwise free, so the
 * one thing that can still stutter the frame is uploading all of it at once.
 */
function drainUploads() {
  const started = performance.now();
  let uploaded = 0;
  let bytes = 0;
  while (uploadQueue.length > 0 && uploaded < UPLOAD_BUDGET && bytes < UPLOAD_BYTES) {
    const message = uploadQueue.shift();
    if (!requested.has(message.key)) continue; // dropped while it was in flight
    disposeChunk(message.key);
    const meshes = [];
    for (const section of message.sections) {
      for (const [data, material] of [
        [section.opaque, opaqueMaterial],
        [section.transparent, transparentMaterial],
      ]) {
        if (data.triangles === 0) continue;
        bytes += data.position.byteLength + data.color.byteLength + data.uv.byteLength +
          data.cell.byteLength + data.index.byteLength;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
        geometry.setAttribute("acolor", new THREE.BufferAttribute(data.color, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(data.uv, 2));
        geometry.setAttribute("cell", new THREE.BufferAttribute(data.cell, 4));
        geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = true;
        scene.add(mesh);
        meshes.push(mesh);
        stats.quads += data.quads;
        stats.triangles += data.triangles;
      }
    }
    meshed.set(message.key, meshes);
    uploaded++;
  }
  if (uploaded > 0) {
    stats.uploads += uploaded;
    stats.uploadMs += performance.now() - started;
  }
}

/* -------------------------------------------------------------------------- */
/* controls                                                                    */
/* -------------------------------------------------------------------------- */

renderer.domElement.addEventListener("click", () => renderer.domElement.requestPointerLock());
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === renderer.domElement;
  hud.root.classList.toggle("unlocked", !locked);
});
document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0022;
  const limit = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
});
addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "KeyG") {
    player.fly = !player.fly;
    player.velocity.set(0, 0, 0);
  }
  if (event.code === "Space") event.preventDefault();
});
addEventListener("keyup", (event) => keys.delete(event.code));

/* -------------------------------------------------------------------------- */
/* movement                                                                    */
/* -------------------------------------------------------------------------- */

/** Is the block containing this point something you cannot walk through? */
function solidAt(x, y, z) {
  const entry = palette[world.indexAt(Math.floor(x), Math.floor(y), Math.floor(z))];
  return entry !== undefined && !entry.air && entry.occludes;
}

/** Does the player's box, centred on (x, y, z) feet-first, hit anything? */
function collides(x, feetY, z) {
  const top = feetY + EYE_HEIGHT + 0.05;
  for (let cx = -PLAYER_RADIUS; cx <= PLAYER_RADIUS; cx += PLAYER_RADIUS * 2) {
    for (let cz = -PLAYER_RADIUS; cz <= PLAYER_RADIUS; cz += PLAYER_RADIUS * 2) {
      for (let y = feetY + 0.02; y < top; y += 0.9) {
        if (solidAt(x + cx, y, z + cz)) return true;
      }
      if (solidAt(x + cx, top - 0.02, z + cz)) return true;
    }
  }
  return false;
}

function move(dt) {
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const wish = new THREE.Vector3();
  if (keys.has("KeyW")) wish.add(forward);
  if (keys.has("KeyS")) wish.sub(forward);
  if (keys.has("KeyD")) wish.add(right);
  if (keys.has("KeyA")) wish.sub(right);
  if (wish.lengthSq() > 0) wish.normalize();

  if (player.fly) {
    const speed = FLY_SPEED * (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 0.25 : 1);
    const vertical =
      (keys.has("Space") ? 1 : 0) - (keys.has("KeyC") || keys.has("ControlLeft") ? 1 : 0);
    // Free flight, and free of the world: a viewer that catches on geometry
    // while flying is worse than one that clips through it.
    player.position.addScaledVector(wish, speed * dt);
    player.position.y += vertical * speed * dt;
    return;
  }

  const feet = player.position.y - EYE_HEIGHT;
  player.velocity.y -= GRAVITY * dt;
  if (player.onGround && keys.has("Space")) player.velocity.y = JUMP_SPEED;

  const step = wish.multiplyScalar(WALK_SPEED * dt);
  const nextX = player.position.x + step.x;
  if (!collides(nextX, feet, player.position.z)) player.position.x = nextX;
  else if (!collides(nextX, feet + 1, player.position.z)) player.position.x = nextX; // step up
  const nextZ = player.position.z + step.z;
  if (!collides(player.position.x, feet, nextZ)) player.position.z = nextZ;
  else if (!collides(player.position.x, feet + 1, nextZ)) player.position.z = nextZ;

  let nextFeet = feet + player.velocity.y * dt;
  if (collides(player.position.x, nextFeet, player.position.z)) {
    if (player.velocity.y <= 0) {
      // Land on top of whatever we hit, rather than inside it.
      nextFeet = Math.floor(nextFeet) + 1;
      player.onGround = true;
    } else {
      nextFeet = feet;
    }
    player.velocity.y = 0;
  } else {
    player.onGround = false;
  }
  player.position.y = nextFeet + EYE_HEIGHT;
}

/* -------------------------------------------------------------------------- */
/* the loop                                                                    */
/* -------------------------------------------------------------------------- */

let last = performance.now();
let streamAt = 0;

function frame(now) {
  const elapsed = now - last;
  const dt = Math.min(elapsed / 1000, 0.1);
  last = now;
  if (stats.frames > 0) {
    if (elapsed > stats.worstFrameMs) stats.worstFrameMs = elapsed;
    if (elapsed > 32) stats.longFrames++;
  } else {
    stats.firstFrame = now;
  }
  stats.frames++;

  move(dt);

  camera.position.copy(player.position);
  camera.rotation.set(0, 0, 0, "YXZ");
  camera.rotateY(player.yaw);
  camera.rotateX(player.pitch);

  if (now - streamAt > 250) {
    streamAt = now;
    streamChunks();
  }
  drainUploads();

  hud.position.textContent = `${player.position.x.toFixed(1)} ${player.position.y.toFixed(1)} ${player.position.z.toFixed(1)}`;
  hud.mode.textContent = player.fly ? "fly" : "walk";

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* -------------------------------------------------------------------------- */
/* the landing                                                                 */
/* -------------------------------------------------------------------------- */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setStatus(text) {
  if (landing.status !== null) landing.status.textContent = text;
}

/**
 * Type `text` out, a character at a time, faster than a person and slower than
 * a paste. Punctuation gets a longer beat than a letter, which is the whole
 * difference between "typed" and "printed one character at a time".
 */
async function typeOut(element, text) {
  element.textContent = "";
  for (const character of text) {
    element.textContent += character;
    const pause = ",;:".includes(character) ? 120 : ".!?".includes(character) ? 220 : 17;
    await wait(pause + (character === " " ? 12 : 0));
  }
}

/**
 * Black, the prompt typing itself out, a beat, and then the world — which has
 * been loading the whole time — fades up underneath the type fading away.
 *
 * The two fades overlap on purpose. Cutting the curtain and then dissolving the
 * world reads as two events; crossing them reads as one, and the second is what
 * "you are standing in the world you asked for" is supposed to feel like.
 */
async function runLanding(loaded) {
  if (skipLanding || landing.root === null) {
    landing.root?.remove();
    veil.style.opacity = "0";
    hud.root.classList.add("shown");
    await loaded;
    enterHint.classList.add("shown");
    return;
  }
  await manifestReady;
  const prompt = manifestPrompt();
  await wait(500);
  await typeOut(landing.prompt, prompt);
  landing.prompt.classList.add("done");
  await Promise.all([wait(1100), loaded]);

  landing.root.classList.add("lifting");
  veil.style.opacity = "0";
  await wait(1500);
  landing.root.remove();
  hud.root.classList.add("shown");
  enterHint.classList.add("shown");
  document.addEventListener(
    "pointerlockchange",
    () => enterHint.classList.remove("shown"),
    { once: true },
  );
}

/**
 * The prompt this world was authored from, when the export carries one.
 *
 * Exports written before `terrainist-web-world/1.1` have no `prompt` field, and
 * neither does a hand-written document. Rather than show an empty screen, the
 * landing falls back to the world's name — the sequence is the point, and it
 * has to survive meeting an old payload.
 */
function manifestPrompt() {
  if (typeof manifest.prompt === "string" && manifest.prompt.trim() !== "") {
    return manifest.prompt.trim();
  }
  return `a world called ${manifest.name}`;
}

/* -------------------------------------------------------------------------- */
/* bench                                                                       */
/* -------------------------------------------------------------------------- */

/** `?bench=1`: what the initial load cost, once it has settled. */
function reportBench(timing) {
  const ready = stats.ready - stats.started;
  console.log("[bench] initial load area");
  console.table({
    "chunks decoded": timing.decoded,
    "decode total ms": Math.round(timing.decodeMs),
    "chunks meshed": timing.meshed,
    "mesh total ms": Math.round(timing.meshMs),
    "mesh ms / chunk": (timing.meshMs / Math.max(1, timing.meshed)).toFixed(2),
    "quads": timing.quads,
    "triangles": timing.triangles,
    "quads / triangle pair": (timing.quads / Math.max(1, timing.triangles / 2)).toFixed(3),
    "spawn ready ms": Math.round(ready),
    "GPU upload total ms": Math.round(stats.uploadMs),
    "GPU upload ms / chunk": (stats.uploadMs / Math.max(1, stats.uploads)).toFixed(2),
    "frames": stats.frames,
    "worst frame ms": Math.round(stats.worstFrameMs),
    "frames over 32 ms": stats.longFrames,
  });
}

if (bench) {
  addEventListener("keydown", (event) => {
    if (event.code === "KeyB") worker?.postMessage({ type: "report" });
  });
  setTimeout(() => worker?.postMessage({ type: "report" }), 20_000);
}

const loaded = boot();
runLanding(loaded).catch((error) => console.error(error));
loaded.catch((error) => {
  setStatus(String(error && error.message ? error.message : error));
  console.error(error);
});

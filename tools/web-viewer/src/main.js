/**
 * The walkable viewer.
 *
 * Loads a `terrainist export-web` payload, streams the chunks near the camera,
 * meshes them section by section, and lets you fly or walk through the result.
 * A proof of concept for the terrainist.com landing experience — prompt typed,
 * fade, and you are standing in the world — so it is deliberately thin: no
 * textures, no entities, no time of day, no UI beyond a corner HUD.
 */

import * as THREE from "three";

import { CHUNK_WIDTH, WorldView } from "./format.js";
import { resolvePalette } from "./appearance.js";
import { loadChunk, loadManifest } from "./loader.js";
import { meshSection } from "./mesher.js";

/** Chunks meshed around the camera. One more ring than this is *loaded*. */
const VIEW_RADIUS = 10;
/** Chunk loads in flight at once. */
const LOAD_PARALLEL = 8;
/** Sections meshed per frame; the ceiling that keeps the frame from stalling. */
const MESH_BUDGET = 3;

const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;
const GRAVITY = 28;
const JUMP_SPEED = 8.6;
const WALK_SPEED = 5.2;
const FLY_SPEED = 22;

const params = new URLSearchParams(location.search);
const worldUrl = params.get("world") ?? "worlds/isles_of_war";

const hud = {
  root: document.getElementById("hud"),
  name: document.getElementById("hud-name"),
  position: document.getElementById("hud-position"),
  mode: document.getElementById("hud-mode"),
};
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = skyGradient();
scene.fog = new THREE.Fog(0xa8c8e8, VIEW_RADIUS * 8, VIEW_RADIUS * CHUNK_WIDTH * 1.15);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 2000);

const opaqueMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
const transparentMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  side: THREE.DoubleSide,
});

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
/* world state                                                                 */
/* -------------------------------------------------------------------------- */

let manifest;
let palette;
let world;
/** chunk key → manifest entry. */
const index = new Map();
/** chunk key → { group, sections: THREE.Mesh[] }. */
const meshed = new Map();
/** chunk keys currently being fetched. */
const loading = new Set();
/** chunk keys queued for meshing, nearest first. */
let meshQueue = [];

const player = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  fly: true,
  onGround: false,
};

const keys = new Set();

// A debug handle: `terrainist.player.position.set(...)` from the console is how
// you get to a corner of a 512² world without flying there, and how a
// screenshot of a specific place gets taken reproducibly.
globalThis.terrainist = { player, keys, scene, get manifest() { return manifest; } };

async function boot() {
  overlayText.textContent = `loading ${worldUrl}…`;
  manifest = await loadManifest(worldUrl);
  palette = resolvePalette(manifest.palette, manifest.solid);
  world = new WorldView(manifest);
  for (const entry of manifest.chunks) index.set(WorldView.key(entry.x, entry.z), entry);

  const [sx, sy, sz] = manifest.spawn;
  player.position.set(sx + 0.5, sy + EYE_HEIGHT, sz + 0.5);
  hud.name.textContent = manifest.name;

  // Wait for the chunks around spawn before the first frame, so the world does
  // not assemble itself in front of a visitor who just arrived.
  await streamChunks(true);
  overlay.classList.add("hidden");
  requestAnimationFrame(frame);
}

function chunkOf(value) {
  return Math.floor(value / CHUNK_WIDTH);
}

/** Fetch every chunk within the load radius; drop the ones far behind us. */
async function streamChunks(waitForAll = false) {
  const cx = chunkOf(player.position.x);
  const cz = chunkOf(player.position.z);
  const wanted = [];
  for (let dx = -VIEW_RADIUS - 1; dx <= VIEW_RADIUS + 1; dx++) {
    for (let dz = -VIEW_RADIUS - 1; dz <= VIEW_RADIUS + 1; dz++) {
      const distance = Math.hypot(dx, dz);
      if (distance > VIEW_RADIUS + 1) continue;
      const key = WorldView.key(cx + dx, cz + dz);
      const entry = index.get(key);
      if (entry === undefined || world.has(entry.x, entry.z) || loading.has(key)) continue;
      wanted.push({ key, entry, distance });
    }
  }
  wanted.sort((a, b) => a.distance - b.distance);

  const batch = waitForAll ? wanted : wanted.slice(0, LOAD_PARALLEL);
  await Promise.all(
    batch.map(async ({ key, entry }) => {
      loading.add(key);
      try {
        world.put(await loadChunk(worldUrl, entry));
        // A new chunk changes its neighbours' border faces, so they are
        // re-queued: the alternative is a wall of stone at every seam.
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          queueMesh(entry.x + dx, entry.z + dz);
        }
      } finally {
        loading.delete(key);
      }
    }),
  );

  const dropRadius = VIEW_RADIUS + 3;
  for (const key of [...world.chunks.keys()]) {
    const [x, z] = key.split(",").map(Number);
    if (Math.hypot(x - cx, z - cz) <= dropRadius) continue;
    world.drop(x, z);
    disposeChunk(key);
  }
}

function queueMesh(chunkX, chunkZ) {
  const key = WorldView.key(chunkX, chunkZ);
  if (!index.has(key) || !world.has(chunkX, chunkZ)) return;
  if (!meshQueue.includes(key)) meshQueue.push(key);
}

function disposeChunk(key) {
  const built = meshed.get(key);
  if (built === undefined) return;
  for (const mesh of built.meshes) {
    mesh.geometry.dispose();
    scene.remove(mesh);
  }
  meshed.delete(key);
}

/** Build one chunk's sections into merged geometry, replacing what was there. */
function buildChunk(key) {
  const entry = index.get(key);
  if (entry === undefined || !world.has(entry.x, entry.z)) return;
  disposeChunk(key);

  const sample = (x, y, z) => world.indexAt(x, y, z);
  const meshes = [];
  const originX = entry.x * CHUNK_WIDTH;
  const originZ = entry.z * CHUNK_WIDTH;
  const firstSection = Math.floor(entry.minY / 16);
  const lastSection = Math.floor((entry.minY + entry.height - 1) / 16);

  for (let section = firstSection; section <= lastSection; section++) {
    const built = meshSection(sample, palette, originX, section * 16, originZ);
    for (const [geometryData, material] of [
      [built.opaque, opaqueMaterial],
      [built.transparent, transparentMaterial],
    ]) {
      if (geometryData.triangles === 0) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(geometryData.position, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(geometryData.color, 3));
      geometry.setIndex(new THREE.BufferAttribute(geometryData.index, 1));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = true;
      scene.add(mesh);
      meshes.push(mesh);
    }
  }
  meshed.set(key, { meshes });
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
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  move(dt);

  camera.position.copy(player.position);
  camera.rotation.set(0, 0, 0, "YXZ");
  camera.rotateY(player.yaw);
  camera.rotateX(player.pitch);

  if (now - streamAt > 250) {
    streamAt = now;
    void streamChunks();
    const cx = chunkOf(player.position.x);
    const cz = chunkOf(player.position.z);
    meshQueue.sort((a, b) => distanceTo(a, cx, cz) - distanceTo(b, cx, cz));
  }
  for (let i = 0; i < MESH_BUDGET && meshQueue.length > 0; i++) buildChunk(meshQueue.shift());

  hud.position.textContent = `${player.position.x.toFixed(1)} ${player.position.y.toFixed(1)} ${player.position.z.toFixed(1)}`;
  hud.mode.textContent = player.fly ? "fly" : "walk";

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function distanceTo(key, cx, cz) {
  const [x, z] = key.split(",").map(Number);
  return Math.hypot(x - cx, z - cz);
}

boot().catch((error) => {
  overlayText.textContent = String(error && error.message ? error.message : error);
  console.error(error);
});

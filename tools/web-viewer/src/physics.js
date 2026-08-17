/**
 * The player: a box, gravity, and the rules that make a voxel world feel like
 * one you are standing in rather than one you are inspecting.
 *
 * Everything here is pure arithmetic over two predicates — `solidAt(x, y, z)`
 * and `fluidAt(x, y, z)` — so node can run the whole controller with a
 * hand-written world and no browser. `main.js` supplies the predicates, the
 * keyboard, and the camera; it owns no physics of its own.
 *
 * ## The model
 *
 * A 0.6 × 1.8 × 0.6 box whose position is its **feet**, eyes 1.62 above them.
 * Horizontal velocity chases a target speed (an exponential approach, fast on
 * the ground and slow in the air) rather than being set outright, which is
 * what gives a start and a stop their weight without giving them a slide.
 * Vertical velocity is plain gravity plus an impulse on jump, sized so the
 * jump clears one block and nothing more: `v = sqrt(2 · g · 1.25)`.
 *
 * Collision is swept, axis by axis, in sub-steps no longer than half a block
 * so a fall can never tunnel through a floor. Blocked horizontally, the player
 * tries the same move raised by `STEP_HEIGHT` — 0.6, which clears a slab or a
 * stair and refuses a whole block, exactly as Minecraft does.
 *
 * ## What is not solid
 *
 * Plants. A cross has no collision box at all, and `main.js` decides that from
 * the same `render: "cross"` the mesher draws it from — one fact, two readers.
 * Fluids are not solid either; they are *buoyant*, which is a different branch
 * further down.
 */

/** The player's box and the numbers that move it. Minecraft's, near enough. */
export const PLAYER = {
  width: 0.6,
  height: 1.8,
  eye: 1.62,
  gravity: 32,
  /** ~1.25 blocks of rise: sqrt(2 · 32 · 1.25). */
  jumpSpeed: Math.sqrt(2 * 32 * 1.25),
  walkSpeed: 4.3,
  sprintSpeed: 5.6,
  sneakSpeed: 1.9,
  /** Exponential approach rates, per second, toward the wished-for velocity. */
  groundAccel: 18,
  airAccel: 3.2,
  /** A slab, a carpet, a trapdoor. Nothing taller, unless it is a stair. */
  stepHeight: 0.6,
  /**
   * Stairs.
   *
   * The mesher draws a stair as a full cube (it always has), so an honest
   * 0.6 step refuses it and a staircase becomes a ladder of jumps — which is
   * not what a staircase is for. A block the world calls climbable therefore
   * gets a step of its own, just over one block, and nothing else does.
   */
  climbHeight: 1.02,
  terminal: 60,
  /* water */
  swimGravity: 8,
  swimUp: 4.2,
  swimSpeed: 2.6,
  swimDrag: 5.5,
  swimSink: 1.6,
};

const EPSILON = 1e-3;
/** No sub-step may cross a whole block, or a fast fall tunnels through a floor. */
const MAX_SUBSTEP = 0.45;

/** A fresh player, feet at the origin, walking. */
export function newPlayer() {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    fly: false,
    onGround: false,
    inWater: false,
    /** Held still — the landing curtain is up, or the world has not arrived. */
    frozen: true,
  };
}

/**
 * How tall the block at (x, y, z) is to walk into, 0 to 1.
 *
 * `solidAt` may answer with a boolean or with a height — `appearance.js` hands
 * out heights, so a slab is 0.5 and a carpet is 0.08 — and this is where the
 * two spellings become one number.
 */
export function heightAt(solidAt, x, y, z) {
  const value = solidAt(x, y, z);
  if (value === true) return 1;
  if (value === false || value === undefined || value === null) return 0;
  return value;
}

/**
 * Does the player's box, feet at (x, y, z), overlap anything solid?
 *
 * `visit` is called with every blocking block's `[by, top]` — `sweep` uses it
 * to find the surface to land on, which for a slab is not the block boundary.
 */
export function boxCollides(solidAt, x, y, z, visit) {
  const half = PLAYER.width / 2;
  const minX = Math.floor(x - half + EPSILON);
  const maxX = Math.floor(x + half - EPSILON);
  const minY = Math.floor(y + EPSILON);
  const maxY = Math.floor(y + PLAYER.height - EPSILON);
  const minZ = Math.floor(z - half + EPSILON);
  const maxZ = Math.floor(z + half - EPSILON);
  let any = false;
  for (let bx = minX; bx <= maxX; bx++) {
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        const height = heightAt(solidAt, bx, by, bz);
        if (height <= 0) continue;
        const top = by + height;
        if (top <= y + EPSILON || by >= y + PLAYER.height - EPSILON) continue;
        if (visit === undefined) return true;
        any = true;
        visit(by, top);
      }
    }
  }
  return any;
}

/**
 * Slide the box along one axis by `delta`, stopping flush against whatever it
 * hits.
 *
 * The world is unit-aligned, so "flush" is exact: the blocking plane is the
 * integer boundary the leading face just crossed. Sub-stepping is what keeps
 * that true — cross two boundaries in one go and the snap picks the wrong one.
 *
 * Returns `{ value, hit }`: the new coordinate on that axis, and whether the
 * move was cut short.
 */
export function sweep(solidAt, position, axis, delta) {
  const half = PLAYER.width / 2;
  let { x, y, z } = position;
  let hit = false;
  let remaining = delta;
  while (Math.abs(remaining) > 1e-9) {
    const step = Math.max(-MAX_SUBSTEP, Math.min(MAX_SUBSTEP, remaining));
    remaining -= step;
    const next = { x, y, z };
    next[axis] += step;
    if (!boxCollides(solidAt, next.x, next.y, next.z)) {
      x = next.x;
      y = next.y;
      z = next.z;
      continue;
    }
    hit = true;
    if (axis === "y") {
      // Land on the highest surface under the feet, or stop with the head
      // under the lowest thing above it. A slab's surface is 0.5, not 1, so
      // the plane comes from the block rather than from the lattice.
      let surface = -Infinity;
      let ceiling = Infinity;
      boxCollides(solidAt, next.x, next.y, next.z, (bottom, top) => {
        if (top > surface) surface = top;
        if (bottom < ceiling) ceiling = bottom;
      });
      y = step > 0 ? ceiling - PLAYER.height - EPSILON : surface + EPSILON;
    } else {
      const value = axis === "x" ? x : z;
      const leading = step > 0 ? value + half : value - half;
      const plane = step > 0 ? Math.floor(leading + step) : Math.floor(leading + step) + 1;
      const snapped = step > 0 ? plane - half - EPSILON : plane + half + EPSILON;
      if (axis === "x") x = snapped;
      else z = snapped;
    }
    break;
  }
  return { value: axis === "x" ? x : axis === "y" ? y : z, hit };
}

/**
 * A horizontal move, with the step-up a stair needs.
 *
 * Blocked, the player is lifted by `stepHeight`, asked to make the same move,
 * and dropped back onto whatever is under the far side. If the lift does not
 * clear it — a full block, a wall — nothing happens and the wall holds; that is
 * the whole difference between "walkable" and "flies up cliffs".
 */
export function moveHorizontal(solidAt, position, dx, dz, canStep, climbAt) {
  const { x: startX, y, z: startZ } = position;
  const sx = sweep(solidAt, { x: startX, y, z: startZ }, "x", dx);
  const x = sx.value;
  const sz = sweep(solidAt, { x, y, z: startZ }, "z", dz);
  const z = sz.value;
  const flat = { x, y, z, stepped: false };
  if (!canStep || (!sx.hit && !sz.hit)) return flat;
  const walked = Math.hypot(x - startX, z - startZ);

  const lifts = [PLAYER.stepHeight];
  // Blocked by a stair? Then one block is a step too, and only then.
  if (climbAt !== undefined && boxAny(climbAt, startX + dx, y, startZ + dz)) {
    lifts.push(PLAYER.climbHeight);
  }
  for (const lift of lifts) {
    const lifted = y + lift;
    if (boxCollides(solidAt, startX, lifted, startZ)) continue;
    let lx = sweep(solidAt, { x: startX, y: lifted, z: startZ }, "x", dx).value;
    const lz = sweep(solidAt, { x: lx, y: lifted, z: startZ }, "z", dz).value;
    if (Math.hypot(lx - startX, lz - startZ) - walked <= EPSILON) continue;
    // Settle onto the step rather than hovering over it.
    let ly = lifted;
    const drop = sweep(solidAt, { x: lx, y: ly, z: lz }, "y", -lift);
    if (drop.hit) ly = drop.value;
    if (ly < y) ly = y;
    return { x: lx, y: ly, z: lz, stepped: true };
  }
  return flat;
}

/** Is `pred` true of any block the player's box would occupy at (x, y, z)? */
export function boxAny(pred, x, y, z) {
  const half = PLAYER.width / 2;
  for (let bx = Math.floor(x - half + EPSILON); bx <= Math.floor(x + half - EPSILON); bx++) {
    for (let by = Math.floor(y + EPSILON); by <= Math.floor(y + PLAYER.height - EPSILON); by++) {
      for (let bz = Math.floor(z - half + EPSILON); bz <= Math.floor(z + half - EPSILON); bz++) {
        if (pred(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

/**
 * Put the player on the ground at (x, z), starting the search at `y`.
 *
 * Up first — a spawn inside a hill must not leave you inside it — then down to
 * the first surface below. The landing depends on this: the manifest's spawn is
 * a block coordinate, and standing *on* it is what "you are in the world" means.
 */
export function groundSnap(solidAt, x, y, z, reach = 96) {
  let feet = y;
  for (let i = 0; i < reach && boxCollides(solidAt, x, feet, z); i++) feet += 1;
  for (let i = 0; i < reach; i++) {
    const below = feet - 1;
    if (boxCollides(solidAt, x, below, z)) break;
    feet = below;
  }
  // Fine-grained settle: the block below may be a slab, or nothing at all.
  const drop = sweep(solidAt, { x, y: feet, z }, "y", -1.2);
  return drop.hit ? drop.value : feet;
}

/** Is any part of the player's box in a fluid? */
export function inFluid(fluidAt, x, y, z, height = PLAYER.height) {
  const half = PLAYER.width / 2;
  for (const bx of [Math.floor(x - half + EPSILON), Math.floor(x + half - EPSILON)]) {
    for (const bz of [Math.floor(z - half + EPSILON), Math.floor(z + half - EPSILON)]) {
      for (let by = Math.floor(y + EPSILON); by <= Math.floor(y + height - EPSILON); by++) {
        if (fluidAt(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

/** Move `value` toward `target` at an exponential rate, frame-rate independent. */
export function approach(value, target, rate, dt) {
  const blend = 1 - Math.exp(-rate * dt);
  return value + (target - value) * blend;
}

/**
 * One tick.
 *
 * `input` is `{ forward, strafe, jump, sink, sprint, sneak }`, all already
 * resolved from the keyboard: forward/strafe in −1..1, the rest booleans.
 * `world` is `{ solidAt, fluidAt }`.
 */
export function step(player, input, world, dt, options = {}) {
  if (player.frozen) return player;
  const flySpeed = options.flySpeed ?? 22;
  const { solidAt, fluidAt, climbAt } = world;
  const yaw = player.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  let wishX = fx * input.forward + rx * input.strafe;
  let wishZ = fz * input.forward + rz * input.strafe;
  const length = Math.hypot(wishX, wishZ);
  if (length > 1) {
    wishX /= length;
    wishZ /= length;
  }

  if (player.fly) {
    // Free flight, and free of the world: a viewer that catches on geometry
    // while flying is worse than one that clips through it.
    const speed = flySpeed * (input.sneak ? 0.25 : 1);
    player.position.x += wishX * speed * dt;
    player.position.z += wishZ * speed * dt;
    player.position.y += ((input.jump ? 1 : 0) - (input.sink ? 1 : 0)) * speed * dt;
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.velocity.z = 0;
    player.onGround = false;
    player.inWater = inFluid(fluidAt, player.position.x, player.position.y, player.position.z);
    return player;
  }

  const { x, y, z } = player.position;
  const swimming = inFluid(fluidAt, x, y, z);
  player.inWater = swimming;

  const target = swimming
    ? PLAYER.swimSpeed
    : input.sneak
      ? PLAYER.sneakSpeed
      : input.sprint
        ? PLAYER.sprintSpeed
        : PLAYER.walkSpeed;
  const rate = swimming ? PLAYER.swimDrag : player.onGround ? PLAYER.groundAccel : PLAYER.airAccel;
  player.velocity.x = approach(player.velocity.x, wishX * target, rate, dt);
  player.velocity.z = approach(player.velocity.z, wishZ * target, rate, dt);

  if (swimming) {
    // Buoyancy: you sink slowly, you rise while you hold the key, and at the
    // surface that rise is what carries you up onto the beach.
    player.velocity.y -= PLAYER.swimGravity * dt;
    if (input.jump) player.velocity.y = PLAYER.swimUp;
    else if (player.velocity.y < -PLAYER.swimSink) player.velocity.y = -PLAYER.swimSink;
  } else {
    player.velocity.y -= PLAYER.gravity * dt;
    if (player.onGround && input.jump) player.velocity.y = PLAYER.jumpSpeed;
  }
  if (player.velocity.y < -PLAYER.terminal) player.velocity.y = -PLAYER.terminal;

  const moved = moveHorizontal(
    solidAt,
    player.position,
    player.velocity.x * dt,
    player.velocity.z * dt,
    player.onGround || swimming,
    climbAt,
  );
  // A wall takes the speed you drove into it; a step you climbed does not.
  const gotX = moved.x - player.position.x;
  const gotZ = moved.z - player.position.z;
  if (!moved.stepped) {
    if (Math.abs(gotX) < Math.abs(player.velocity.x * dt) - EPSILON) player.velocity.x = 0;
    if (Math.abs(gotZ) < Math.abs(player.velocity.z * dt) - EPSILON) player.velocity.z = 0;
  }
  player.position.x = moved.x;
  player.position.z = moved.z;
  player.position.y = moved.y;

  const vertical = sweep(solidAt, player.position, "y", player.velocity.y * dt);
  if (vertical.hit) {
    player.onGround = player.velocity.y <= 0;
    player.velocity.y = 0;
  } else if (!moved.stepped) {
    player.onGround = false;
  }
  player.position.y = vertical.value;
  return player;
}

/** Where the camera goes, given where the feet are. */
export function eyePosition(player) {
  return {
    x: player.position.x,
    y: player.position.y + PLAYER.eye,
    z: player.position.z,
  };
}

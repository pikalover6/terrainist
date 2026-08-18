// The same shed, built by a program that reads the ground.
//
// Every column asks `api.heightAt` and answers it with a foundation course
// that thickens as the ground falls away, so the sole meets the terrain on
// every member of the suite instead of hanging over four of them. `seatY` is
// 12 because the shore member's bank bottoms out 12 blocks below the seat
// plane, and a node-local write below y = 0 is clipped.

export const envelope = [16, 24, 16];

const SEAT = 12;

export default function build(api) {
  const [w, , d] = api.size;

  // The foundation: from the ground under each column up to the seat plane.
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const ground = SEAT + api.heightAt(x, z);
      for (let y = ground; y <= SEAT; y++) {
        api.set(x, y, z, "minecraft:cobblestone");
      }
    }
  }

  // Four walls and a lid, level, above the course that made them level.
  for (let y = SEAT + 1; y < SEAT + 6; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (x === 0 || z === 0 || x === w - 1 || z === d - 1) {
          api.set(x, y, z, "minecraft:stone_bricks");
        }
      }
    }
  }
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      api.set(x, SEAT + 6, z, "minecraft:oak_planks");
    }
  }

  return { name: "conforming shed", seatY: SEAT };
}

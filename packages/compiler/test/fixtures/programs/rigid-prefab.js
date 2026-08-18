// A prefab, on purpose: a shed with a flat sole, laid on y = 0 no matter what
// the ground under it does. It never calls `api.heightAt`, which is precisely
// the thing the conformance suite exists to notice — on flat ground it is
// fine, and on any of the four sloped members it is a thing standing on air.

export const envelope = [16, 12, 16];

export default function build(api) {
  const [w, , d] = api.size;

  // A full sole across the footprint — the giveaway.
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      api.set(x, 0, z, "minecraft:stone_bricks");
    }
  }

  // Four walls and a lid, so it is a building rather than a slab.
  for (let y = 1; y < 6; y++) {
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
      api.set(x, 6, z, "minecraft:oak_planks");
    }
  }

  return { name: "rigid prefab", seatY: 0 };
}

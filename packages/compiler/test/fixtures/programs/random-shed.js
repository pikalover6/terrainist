// The conforming shed again, but it draws on `api.random`.
//
// This one exists for a single regression: a program's RNG is seeded from
// `hash(worldSeed, nodePath, index)`, so a conformance suite that took its
// node path from the caller hashed one way at the authoring gate and another
// way at compile time — and only for programs that actually drew a random
// number, which is why nothing built from `conforming-shed.js` ever caught it.

export const envelope = [16, 24, 16];

const SEAT = 12;
const SPECKLE = ["minecraft:cobblestone", "minecraft:mossy_cobblestone"];

export default function build(api) {
  const [w, , d] = api.size;

  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const ground = SEAT + api.heightAt(x, z);
      for (let y = ground; y <= SEAT; y++) {
        api.set(x, y, z, SPECKLE[api.random() < 0.5 ? 0 : 1]);
      }
    }
  }

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

  return { name: "speckled shed", seatY: SEAT };
}

// A sentinel: a figure on a long plinth whose face is built toward local −Z,
// declared by publishing the `front` anchor. Deliberately **not square** — 11
// wide by 21 deep — so a quarter turn is visible in the footprint as well as in
// the blocks, and deliberately carrying one of each directional block state the
// rotation table has to move.

export const envelope = [11, 12, 21];

export default function build(api) {
  const [w, h, d] = api.size;

  // The plinth, the full envelope: enough solid to be a thing rather than a
  // sketch, and a floor for everything above it.
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      api.set(x, 0, z, "minecraft:stone_bricks");
      api.set(x, 1, z, "minecraft:stone_bricks");
    }
  }

  // The body, stood at the northern (front) end of the plinth.
  for (let y = 2; y < h; y++) {
    for (let z = 2; z < 9; z++) {
      for (let x = 3; x < 8; x++) {
        api.set(x, y, z, "minecraft:deepslate_bricks");
      }
    }
  }

  // The face, on the front plane: a brow that looks north, a beam across it,
  // and a rail running out of it.
  api.set(5, 6, 1, "minecraft:stone_brick_stairs[facing=north,half=bottom]");
  api.set(4, 6, 1, "minecraft:oak_log[axis=x]");
  api.set(6, 6, 1, "minecraft:oak_log[axis=z]");
  api.set(5, 2, 1, "minecraft:rail[shape=north_south]");

  return {
    name: "sentinel",
    seatY: 0,
    anchors: { front: [Math.floor((w - 1) / 2), 2, 0] },
  };
}

// The same pylon, standing on three blocks of landing gear: the course that
// meets the ground is node-local y = 3, so it returns `seatY: 3`.

export const envelope = [9, 17, 9];

export default function build(api) {
  const [w, h, d] = api.size;
  for (let y = 0; y < 3; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const leg = (x === 1 || x === w - 2) && (z === 1 || z === d - 2);
        if (leg) {
          api.set(x, y, z, "minecraft:iron_block");
        }
      }
    }
  }
  for (let y = 3; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
        if (edge || y === 3 || y === h - 1) {
          api.set(x, y, z, "minecraft:stone_bricks");
        }
      }
    }
  }
  return { name: "pylon on gear", seatY: 3, anchors: { door: [Math.floor(w / 2), 4, d - 1] } };
}

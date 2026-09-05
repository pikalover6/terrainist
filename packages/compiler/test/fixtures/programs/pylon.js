// A blunt pylon whose seat plane is its own bottom course: `seatY: 0`.
// The pair to `pylon-gear.js`, which models three blocks of leg below its seat.

export const envelope = [9, 14, 9];

export default function build(api) {
  const [w, h, d] = api.size;
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
        if (edge || y === 0 || y === h - 1) {
          api.set(x, y, z, "minecraft:stone_bricks");
        }
      }
    }
  }
  return { name: "pylon", seatY: 0, anchors: { door: [Math.floor(w / 2), 1, d - 1] } };
}

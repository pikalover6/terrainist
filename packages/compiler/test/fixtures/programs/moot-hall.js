// An enterable landmark: a stone moot hall with one hollow room inside it,
// declared as an `interiors` volume for the compiler to furnish. The program
// writes the shell and the void and nothing else — no beds, no torches.

export const envelope = [15, 12, 15];

export default function build(api) {
  const [w, h, d] = api.size;
  const wallTop = 9;

  // Floor plane, walls, and a lid. The interior is simply never written.
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      api.set(x, 0, z, "minecraft:stone_bricks");
      api.set(x, wallTop, z, "minecraft:polished_andesite");
      const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
      if (!edge) continue;
      for (let y = 1; y < wallTop; y++) {
        api.set(x, y, z, "minecraft:stone_bricks");
      }
    }
  }

  // A doorway punched south, and the anchor a road can be routed to.
  const doorX = Math.floor(w / 2);
  for (let y = 1; y < 4; y++) {
    api.set(doorX, y, d - 1, "minecraft:air");
  }

  return {
    name: "moot hall",
    seatY: 0,
    anchors: { door: [doorX, 1, d - 1] },
    interiors: [{ min: [1, 1, 1], max: [w - 2, wallTop - 1, d - 2], kind: "quarters" }],
  };
}

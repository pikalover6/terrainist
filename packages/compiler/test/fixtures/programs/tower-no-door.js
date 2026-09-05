// A parametric tower: a tapering stone drum, a battlement, and a door anchor.
// Hand-written as a fixture — the shape a model's output should look like.

export const envelope = [17, 34, 17];

export default function build(api) {
  const [w, h, d] = api.size;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const base = Math.min(w, d) / 2 - 1;
  const shaft = h - 5;

  for (let y = 0; y < shaft; y++) {
    const radius = base * (1 - 0.22 * (y / shaft));
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const dist = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
        if (dist <= radius && dist > radius - 1.7) {
          const banded = y > 2 && y % 7 === 0;
          api.set(x, y, z, banded ? "minecraft:polished_andesite" : "minecraft:stone_bricks");
        }
      }
    }
  }

  // A corbelled crown, in full blocks: a wall block up here would be hanging
  // off nothing, which is precisely what the physics gate refuses.
  const crown = base * 0.82 + 1;
  for (let y = shaft; y < shaft + 2; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const dist = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
        if (dist <= crown && dist > crown - 2.2) {
          api.set(x, y, z, "minecraft:chiseled_stone_bricks");
        }
      }
    }
  }
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
      if (dist <= crown && dist > crown - 1.4 && (x + z) % 2 === 0) {
        api.set(x, shaft + 2, z, "minecraft:stone_bricks");
      }
    }
  }

  // The doorway, punched south, and the anchor a road can be routed to.
  const doorZ = d - 1;
  for (let y = 1; y < 4; y++) {
    for (let z = Math.floor(cz); z <= doorZ; z++) {
      api.set(Math.floor(cx), y, z, "minecraft:air");
    }
  }

  return {
    name: "cairn",
    seatY: 0,
    anchors: { summit: [Math.floor(cx), 1, d - 1] },
  };
}

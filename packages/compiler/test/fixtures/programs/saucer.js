// A crashed saucer, varied per instance: `api.instance.index` decides the tilt
// and `api.random()` decides the hull mottling. The point of the fixture is
// that two instances differ and both are reproducible.

export const envelope = [21, 13, 21];

export default function build(api) {
  const [w, h, d] = api.size;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const rim = Math.min(w, d) / 2 - 1;
  const lean = (api.instance.index % 3) - 1;

  const hullAt = (roll) => {
    if (roll < 0.12) {
      return "minecraft:oxidized_copper";
    }
    if (roll < 0.3) {
      return "minecraft:light_gray_concrete";
    }
    return "minecraft:smooth_quartz";
  };

  // The disc: three courses, each a filled ellipse narrowing upward.
  for (let y = 0; y < 3; y++) {
    const radius = rim - y * 1.6;
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz <= radius * radius) {
          api.set(x, y, z, hullAt(api.random()));
        }
      }
    }
  }

  // The dome, leaning by the instance index so a field of them is not a field
  // of one thing repeated.
  const domeR = rim * 0.55;
  for (let y = 3; y < h - 1; y++) {
    const t = (y - 3) / (h - 4);
    const radius = domeR * Math.sqrt(Math.max(0, 1 - t * t));
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx - lean * t * 2;
        const dz = z - cz;
        if (dx * dx + dz * dz <= radius * radius) {
          api.set(x, y, z, y === h - 2 ? "minecraft:sea_lantern" : "minecraft:smooth_quartz");
        }
      }
    }
  }

  return {
    name: "saucer",
    seatY: 0,
    anchors: { hatch: [Math.floor(cx), 2, Math.floor(cz) + Math.floor(rim) - 1] },
  };
}

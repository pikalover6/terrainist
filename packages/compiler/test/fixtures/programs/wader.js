// A wading beast: a squat body on a square envelope — 9 by 9 — with its head
// built toward local −Z and declared by publishing the `front` anchor.
//
// Square on purpose. A quarter turn leaves a square footprint exactly where it
// was, which is the one case where a facing may be corrected after the solver
// has already reserved the ground (`programs/facing.ts`).

export const envelope = [9, 10, 9];

export default function build(api) {
  const [w, h, d] = api.size;

  // The body: a block of hide filling the middle of the envelope.
  for (let y = 0; y < h - 4; y++) {
    for (let z = 2; z < d - 1; z++) {
      for (let x = 2; x < w - 2; x++) {
        api.set(x, y, z, "minecraft:prismarine");
      }
    }
  }

  // The head, on the front plane, and an eye that looks the way it does.
  for (let x = 3; x < w - 3; x++) {
    api.set(x, h - 5, 1, "minecraft:dark_prismarine");
    api.set(x, h - 4, 1, "minecraft:dark_prismarine");
  }
  api.set(4, h - 4, 0, "minecraft:prismarine_stairs[facing=north,half=bottom]");

  return {
    name: "wader",
    seatY: 0,
    anchors: { front: [Math.floor((w - 1) / 2), h - 4, 0] },
  };
}

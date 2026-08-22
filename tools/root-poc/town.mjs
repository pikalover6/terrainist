/**
 * The town of the Troy demo — everything the settlement ASKS FOR and
 * everything it STANDS ON the ground, under `docs/COHERENT-SOURCE-v0.md`.
 *
 * Two exports, two moments in the pipeline:
 *
 * - {@link townSketch} runs BEFORE the field freezes. It returns pure data:
 *   building sites (which the core turns into micro-plateau constraints and
 *   catalog jobs) and the wall/dressing geometry. It never touches a block
 *   and never sees the field.
 * - {@link townStructures} runs AFTER the freeze. It returns structure
 *   blocks that STAND ON the ground it reads through `groundAt` (the plan's
 *   own oracle — Law I). It never moves earth, never writes below the
 *   surface it stands on, and the only surface it replaces is a paving swap
 *   at the surface's own level.
 *
 * A site: { x, z, facing (radians), size [sx,sy,sz] unrotated, archetype,
 * floors }. The core owns rejection (roads, water, overlap) and seating.
 */

const TAU = 2 * Math.PI;

/** Ring helper: `count` sites of one archetype around a center. */
function ring(sites, center, r, count, startAngle, size, archetype, floors) {
  for (let i = 0; i < count; i++) {
    const a = startAngle + (i * TAU) / count;
    sites.push({
      x: Math.round(center.x + r * Math.cos(a)),
      z: Math.round(center.z + r * Math.sin(a)),
      facing: a + Math.PI,
      size,
      archetype,
      floors,
    });
  }
}

/**
 * The settlement's asks, as pure data. `anchors` carries CITADEL, BENCH,
 * HARBOR, gate, plaza and WALL from the core config.
 */
export function townSketch(anchors) {
  const { CITADEL, BENCH, HARBOR, gate, plaza } = anchors;
  const sites = [];
  // The palace: a megaron looking down the gate road.
  sites.push({ x: CITADEL.x - 2, z: CITADEL.z - 18, facing: Math.PI / 2, size: [17, 10, 12], archetype: "megaron", floors: 1 });
  // Citadel houses: two rings between the plaza and the wall, phased so the
  // gate road passes between them.
  ring(sites, plaza, 16, 4, 0.6, [10, 8, 8], "peristyle_house", 1);
  ring(sites, plaza, 29, 5, 1.55, [10, 9, 8], "townhouse", 2);
  // The lower town: two rings along the bench lane.
  ring(sites, BENCH, 15, 5, 0.2, [9, 7, 7], "cottage", 1);
  ring(sites, { x: BENCH.x + 4, z: BENCH.z + 2 }, 26, 4, 0.95, [9, 8, 7], "townhouse", 2);
  // The inn beside (not astride) the gate road; sheds up from the water.
  sites.push({ x: gate.x + 14, z: gate.z - 4, facing: -Math.PI / 2, size: [12, 9, 9], archetype: "inn", floors: 2 });
  sites.push({ x: HARBOR.x - 9, z: HARBOR.z + 4, facing: 0, size: [7, 6, 5], archetype: "hut", floors: 1 });
  sites.push({ x: HARBOR.x + 8, z: HARBOR.z + 6, facing: 0, size: [7, 6, 5], archetype: "hut", floors: 1 });
  return { sites };
}

/**
 * Everything the town STANDS on the frozen ground: the wall ring, the plaza
 * paving, the harbor quay and pier. Returns { blocks, wallRing } where
 * `wallRing` is the ring's [x,z,baseY] cells for the verify harness.
 */
export function townStructures({ anchors, groundAt, st, stack, SEA, positionFloat, streamSeed, SEED, onRoad }) {
  const { CITADEL, HARBOR, WALL, plaza } = anchors;
  const blocks = [];
  const wallRing = [];

  /* --- the wall: a ring on the rim the field already smoothed ------------ */
  {
    const wallStates = [st("smooth_sandstone"), st("cut_sandstone")];
    const capState = st("smooth_sandstone_slab");
    const steps = Math.ceil(TAU * WALL.r * 2.2);
    const laid = new Set();
    for (let i = 0; i < steps; i++) {
      const a = (i * TAU) / steps;
      let da = Math.abs(a - ((WALL.gateAngle % TAU) + TAU) % TAU);
      if (da > Math.PI) da = TAU - da;
      const x = Math.round(CITADEL.x + WALL.r * Math.cos(a));
      const z = Math.round(CITADEL.z + WALL.r * Math.sin(a));
      const key = x + "," + z;
      if (laid.has(key)) continue;
      laid.add(key);
      const base = groundAt(x, z);
      // The gate is wherever the routed road actually crosses the ring — the
      // wall yields to the road the plan asked for (Law I: the road's columns
      // already have their author), plus the ceremonial arc.
      if (da < WALL.gateHalf || onRoad(x, z)) continue;
      const tower = da < WALL.gateHalf * 2.6;
      const h = WALL.height + (tower ? 3 : 0);
      wallRing.push([x, z, base]);
      for (let y = base + 1; y <= base + h; y++) {
        blocks.push({ x, y, z, stateId: wallStates[(x * 31 + z * 17 + y) % 64 < 52 ? 0 : 1] });
      }
      if (tower || i % 3 !== 0) blocks.push({ x, y: base + h + 1, z, stateId: capState });
    }
  }

  /* --- the plaza: a paving swap at the plan's own level ------------------ */
  {
    const flagState = st("smooth_sandstone");
    for (let dz = -plaza.r; dz <= plaza.r; dz++) for (let dx = -plaza.r; dx <= plaza.r; dx++) {
      if (Math.hypot(dx, dz) > plaza.r) continue;
      const x = plaza.x + dx, z = plaza.z + dz;
      const y = groundAt(x, z);
      const r = positionFloat(streamSeed(SEED, "plaza-mix"), x, 0, z);
      blocks.push({ x, y, z, stateId: r < 0.75 ? flagState : st("sandstone") });
    }
  }

  /* --- the harbor: quay paving + a pier standing in the water ------------ */
  {
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      if (Math.hypot(dx, dz) > 8.5) continue;
      const x = HARBOR.x + dx, z = HARBOR.z + dz;
      const y = groundAt(x, z);
      if (y <= SEA) continue;
      blocks.push({ x, y, z, stateId: st("smooth_sandstone") });
    }
    const pierDir = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
    for (let i = 0; i < 14; i++) {
      for (let s = -1; s <= 1; s++) {
        const x = Math.round(HARBOR.x + 6 + i * pierDir.x + s * pierDir.z * -1);
        const z = Math.round(HARBOR.z + 6 + i * pierDir.z + s * pierDir.x);
        blocks.push({ x, y: SEA + 1, z, stateId: st("oak_planks") });
        if (i % 4 === 0 && s !== 0) {
          blocks.push({ x, y: SEA, z, stateId: st("oak_log", { axis: "y" }) });
          blocks.push({ x, y: SEA - 1, z, stateId: st("oak_log", { axis: "y" }) });
        }
      }
    }
  }

  return { blocks, wallRing };
}

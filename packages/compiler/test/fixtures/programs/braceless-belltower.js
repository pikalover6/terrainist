export const envelope = [27, 36, 27];

export default function build(api) {
  const [W, H, D] = api.size;
  const cx = 13;
  const cz = 14;

  // Palette resolution from theme
  const stonePrimary = api.theme.stone?.primary || "minecraft:stone_bricks";
  const stoneAccent = api.theme.stone?.accent || "minecraft:cracked_stone_bricks";
  const stoneWall = api.theme.stone?.wall || "minecraft:stone_brick_wall";
  const stoneSlab = api.theme.stone?.slab || "minecraft:stone_brick_slab";
  const stoneStairs = api.theme.stone?.stairs || "minecraft:stone_brick_stairs";

  const woodLog = api.theme.wood?.log || "minecraft:oak_log";
  const woodPlanks = api.theme.wood?.planks || "minecraft:oak_planks";
  const woodFence = api.theme.wood?.fence || "minecraft:oak_fence";
  const woodSlab = api.theme.wood?.slab || "minecraft:oak_slab";

  const plinth = api.theme.ground?.plinth || "minecraft:stone_bricks";
  const pavement = api.theme.ground?.pavement || "minecraft:cobblestone";

  // State helpers
  function stair(base, facing, half = "bottom", shape = "straight") {
    const clean = base.split("[")[0];
    return `${clean}[facing=${facing},half=${half},shape=${shape}]`;
  }
  function slab(base, type = "bottom") {
    const clean = base.split("[")[0];
    return `${clean}[type=${type}]`;
  }
  function log(base, axis = "y") {
    const clean = base.split("[")[0];
    return `${clean}[axis=${axis}]`;
  }

  // Deterministic coordinate hash
  function hash(x, y, z, seed = 1337) {
    let h = (x * 374761393 + y * 668265263 + z * 362827313 + seed) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // Voxel storage grid [x][y][z]
  const grid = new Map();
  function k(x, y, z) {
    return (x << 16) | (y << 8) | z;
  }
  function getVoxel(x, y, z) {
    if (x < 0 || x >= W || y < 0 || y >= H || z < 0 || z >= D) return null;
    return grid.get(k(x, y, z)) || null;
  }
  function setVoxel(x, y, z, block) {
    if (x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D) {
      if (block === null) grid.delete(k(x, y, z));
      else grid.set(k(x, y, z), block);
    }
  }

  // 1. Foundation & Footing following terrain
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < D; z++) {
      const dx = x - cx;
      const dz = z - cz;
      const inTower = Math.abs(dx) <= 6 && Math.abs(dz) <= 6;
      const inPath = Math.abs(x - cx) <= 2 && z <= 10;
      const inRubble = x >= 14 && x <= 24 && z >= 14 && z <= 24;

      if (inTower || inPath || inRubble) {
        const groundH = Math.min(0, Math.floor(api.heightAt(x, z)));
        for (let y = groundH; y <= 0; y++) {
          const h = hash(x, y, z, 11);
          const fBlock = h < 0.6 ? plinth : h < 0.85 ? pavement : "minecraft:mossy_cobblestone";
          setVoxel(x, y, z, fBlock);
        }
      }
    }
  }

  // 2. Tower Structure (Masonry Shell & Belfry)
  for (let y = 0; y <= 32; y++) {
    for (let x = 7; x <= 19; x++) {
      for (let z = 8; z <= 20; z++) {
        const dx = x - cx;
        const dz = z - cz;
        const rInf = Math.max(Math.abs(dx), Math.abs(dz));
        const r1 = Math.abs(dx) + Math.abs(dz);

        let isSolid = false;
        let isButtress = false;

        if (y <= 21) {
          // Main shaft
          if (rInf <= 4 && r1 <= 6) {
            isSolid = true;
            if (rInf <= 2) isSolid = false; // Hollow core
          }
          // Corner buttresses tapering off
          if (y <= 10 && (rInf === 5 && r1 <= 7)) {
            if (y <= 3) isButtress = true;
            else if (y <= 6 && (Math.abs(dx) <= 4 || Math.abs(dz) <= 4)) isButtress = true;
          }
        } else if (y <= 28) {
          // Belfry stage: four corner piers + arches
          const isCornerPier = Math.abs(dx) >= 3 && Math.abs(dz) >= 3 && rInf <= 4;
          const isArchTop = y >= 27 && (rInf === 4 || (rInf === 3 && r1 <= 5));
          if (isCornerPier || isArchTop) {
            isSolid = true;
          }
        } else if (y <= 31) {
          // Ruined parapet & battlements
          if (rInf === 4 || (y === 29 && rInf === 5 && r1 <= 7)) {
            if (y === 31) {
              // Merlons
              if ((x + z) % 2 === 0) isSolid = true;
            } else {
              isSolid = true;
            }
          }
        }

        if (isSolid || isButtress) {
          const h = hash(x, y, z, 77);
          let stone = h < 0.55 ? stonePrimary : h < 0.8 ? stoneAccent : "minecraft:mossy_stone_bricks";
          setVoxel(x, y, z, stone);
        }
      }
    }

    // Interior floor timbers at stages
    if (y === 0) {
      for (let x = 11; x <= 15; x++) {
        for (let z = 12; z <= 16; z++) {
          const h = hash(x, y, z, 303);
          setVoxel(x, 0, z, h < 0.4 ? "minecraft:moss_block" : h < 0.7 ? pavement : stoneAccent);
        }
      }
    }
  }

  // 3. Carve Windows & North Entrance Doorway
  // North doorway (z = 10, x = 13, y in 1..4)
  for (let dy = 1; dy <= 3; dy++) {
    setVoxel(cx, dy, 10, null);
  }
  setVoxel(cx, 4, 10, stair(stoneStairs, "north", "top"));

  // Slit windows on intact walls (North, West)
  for (let wy of [8, 9, 15, 16]) {
    setVoxel(cx, wy, 10, null); // North window
    setVoxel(cx - 4, wy, cz, null); // West window
    setVoxel(cx - 4, wy + 1, cz, stair(stoneStairs, "west", "top"));
  }

  // 4. Breach / Rupture down the South-East side caused by the tree
  for (let y = 0; y <= 33; y++) {
    const t = y / 30;
    const bx = cx + 1.2 + 2.5 * Math.sin(t * 2.2 + 0.3);
    const bz = cz + 1.5 + 2.2 * Math.cos(t * 1.8);
    const breachRadius = y < 4 ? 1.8 : y < 14 ? 2.6 + (y - 4) * 0.12 : 3.8 + (y - 14) * 0.15;

    for (let x = 8; x <= 22; x++) {
      for (let z = 9; z <= 22; z++) {
        const dx = x - bx;
        const dz = z - bz;
        const dist = Math.hypot(dx, dz);
        const noise = (hash(x, y, z, 51) - 0.5) * 1.4;

        if (dist <= breachRadius + noise && (x >= cx - 1 || z >= cz - 1)) {
          // Blown open
          const existing = getVoxel(x, y, z);
          if (existing && !existing.includes("log") && !existing.includes("leaves")) {
            setVoxel(x, y, z, null);
          }
        } else if (dist <= breachRadius + noise + 1.1) {
          // Weathered broken fracture edge
          const existing = getVoxel(x, y, z);
          if (existing && existing.includes("stone")) {
            const h = hash(x, y, z, 909);
            if (h < 0.35) setVoxel(x, y, z, "minecraft:mossy_stone_bricks");
            else if (h < 0.6) setVoxel(x, y, z, slab(stoneSlab, "bottom"));
            else if (h < 0.8) setVoxel(x, y, z, stoneWall);
          }
        }
      }
    }
  }

  // 5. Great Flowering Oak: Trunk & Branches
  // 3D Segments: [x0, y0, z0, x1, y1, z1, r0, r1]
  const treeSegments = [
    // Roots spreading across floor & through breach
    [cx + 0.5, 0, cz + 0.5, cx - 2.5, 0, cz - 1.0, 1.5, 0.7],
    [cx + 0.5, 0, cz + 0.5, cx + 0.2, 0, cz + 4.0, 1.5, 0.7],
    [cx + 1.5, 1.5, cz + 1.5, cx + 6.0, 0, cz + 5.5, 1.8, 0.8],
    [cx + 1.5, 1.5, cz + 1.5, cx + 5.5, 0, cz - 0.5, 1.6, 0.7],
    [cx + 0.5, 2.0, cz, cx - 2.0, 0.5, cz - 2.5, 1.3, 0.6],

    // Main Trunk rising and twisting out the ruined wall
    [cx + 0.5, 0.0, cz + 0.5, cx + 1.0, 4.0, cz + 0.8, 2.3, 2.1],
    [cx + 1.0, 4.0, cz + 0.8, cx + 2.2, 9.0, cz + 1.8, 2.1, 1.9],
    [cx + 2.2, 9.0, cz + 1.8, cx + 3.0, 15.0, cz + 2.5, 1.9, 1.7],
    [cx + 3.0, 15.0, cz + 2.5, cx + 2.2, 20.0, cz + 1.2, 1.7, 1.5],
    [cx + 2.2, 20.0, cz + 1.2, cx + 1.2, 24.0, cz + 0.2, 1.5, 1.3],

    // Mid-trunk low limb reaching through breach
    [cx + 3.0, 15.0, cz + 2.5, cx + 6.5, 16.5, cz + 4.5, 1.1, 0.6],
    [cx + 6.5, 16.5, cz + 4.5, cx + 9.0, 17.5, cz + 5.0, 0.6, 0.4],

    // Branch 1: East thrust out broken belfry
    [cx + 1.2, 24.0, cz + 0.2, cx + 5.0, 26.0, cz + 3.0, 1.2, 0.9],
    [cx + 5.0, 26.0, cz + 3.0, cx + 9.5, 27.5, cz + 4.5, 0.9, 0.5],
    [cx + 5.0, 26.0, cz + 3.0, cx + 7.5, 29.0, cz + 0.0, 0.8, 0.5],

    // Branch 2: North thrust weaving past bell
    [cx + 1.2, 24.0, cz + 0.2, cx + 0.5, 26.5, cz - 3.0, 1.1, 0.8],
    [cx + 0.5, 26.5, cz - 3.0, cx - 1.5, 28.5, cz - 6.5, 0.8, 0.4],
    [cx + 0.5, 26.5, cz - 3.0, cx + 2.5, 28.0, cz - 6.0, 0.7, 0.4],

    // Branch 3: West thrust out west belfry window
    [cx + 1.2, 24.0, cz + 0.2, cx - 3.0, 26.0, cz - 0.5, 1.1, 0.8],
    [cx - 3.0, 26.0, cz - 0.5, cx - 7.0, 27.5, cz - 1.0, 0.8, 0.4],
    [cx - 3.0, 26.0, cz - 0.5, cx - 5.5, 29.5, cz + 2.0, 0.7, 0.4],

    // Branch 4: South thrust over broken parapet
    [cx + 1.2, 24.0, cz + 0.2, cx + 1.5, 28.0, cz + 3.5, 1.1, 0.8],
    [cx + 1.5, 28.0, cz + 3.5, cx + 2.0, 31.0, cz + 7.0, 0.8, 0.4],
    [cx + 1.5, 28.0, cz + 3.5, cx - 1.5, 31.5, cz + 4.5, 0.7, 0.4],

    // Branch 5: Towering High Crown
    [cx + 1.2, 24.0, cz + 0.2, cx + 1.0, 29.0, cz + 0.0, 1.2, 0.9],
    [cx + 1.0, 29.0, cz + 0.0, cx + 0.8, 33.5, cz - 0.5, 0.8, 0.4],
    [cx + 1.0, 29.0, cz + 0.0, cx + 3.5, 32.5, cz + 0.5, 0.8, 0.4],
  ];

  function distToSegment(px, py, pz, seg) {
    const [x0, y0, z0, x1, y1, z1, r0, r1] = seg;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const lenSq = dx * dx + dy * dy + dz * dz;
    if (lenSq === 0) return { inside: false, dist: 999 };
    let t = ((px - x0) * dx + (py - y0) * dy + (pz - z0) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const qx = x0 + t * dx;
    const qy = y0 + t * dy;
    const qz = z0 + t * dz;
    const dist = Math.hypot(px - qx, py - qy, pz - qz);
    const r = r0 + t * (r1 - r0);
    return { inside: dist <= r, dist, r, dx, dy, dz };
  }

  // Rasterize Tree Wood
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        for (const seg of treeSegments) {
          const res = distToSegment(x, y, z, seg);
          if (res.inside) {
            const adx = Math.abs(res.dx);
            const ady = Math.abs(res.dy);
            const adz = Math.abs(res.dz);
            let axis = "y";
            if (ady >= adx && ady >= adz) axis = "y";
            else if (adx >= adz) axis = "x";
            else axis = "z";

            setVoxel(x, y, z, log(woodLog, axis));
            break;
          }
        }
      }
    }
  }

  // 6. Lush Leaf Canopy & Azalea Blossoms
  const leafClusters = [
    { cx: cx + 9.0, cy: 18.0, cz: cz + 5.0, rx: 2.8, ry: 2.2, rz: 2.8 },
    { cx: cx + 6.5, cy: 17.0, cz: cz + 4.5, rx: 2.2, ry: 1.8, rz: 2.2 },
    { cx: cx + 9.5, cy: 27.5, cz: cz + 4.5, rx: 3.5, ry: 2.8, rz: 3.5 },
    { cx: cx + 7.5, cy: 29.5, cz: cz + 0.0, rx: 3.2, ry: 2.5, rz: 3.0 },
    { cx: cx - 1.5, cy: 28.5, cz: cz - 6.5, rx: 3.2, ry: 2.6, rz: 3.2 },
    { cx: cx + 2.5, cy: 28.0, cz: cz - 6.0, rx: 2.8, ry: 2.2, rz: 2.8 },
    { cx: cx - 7.0, cy: 27.5, cz: cz - 1.0, rx: 3.4, ry: 2.8, rz: 3.4 },
    { cx: cx - 5.5, cy: 29.5, cz: cz + 2.0, rx: 2.8, ry: 2.4, rz: 2.8 },
    { cx: cx + 2.0, cy: 31.0, cz: cz + 7.0, rx: 3.5, ry: 2.8, rz: 3.5 },
    { cx: cx - 1.5, cy: 31.5, cz: cz + 4.5, rx: 3.0, ry: 2.5, rz: 3.0 },
    { cx: cx + 0.8, cy: 33.5, cz: cz - 0.5, rx: 4.2, ry: 2.6, rz: 4.2 },
    { cx: cx + 3.5, cy: 32.5, cz: cz + 0.5, rx: 3.5, ry: 2.5, rz: 3.5 },
    { cx: cx + 1.0, cy: 27.0, cz: cz + 0.0, rx: 3.2, ry: 2.2, rz: 3.2 },
  ];

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        if (getVoxel(x, y, z) !== null) continue;

        for (const cluster of leafClusters) {
          const qx = (x - cluster.cx) / cluster.rx;
          const qy = (y - cluster.cy) / cluster.ry;
          const qz = (z - cluster.cz) / cluster.rz;
          const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
          const noise = (hash(x, y, z, 712) - 0.5) * 0.35;

          if (d <= 1.0 + noise) {
            const h = hash(x, y, z, 888);
            let leaf = "minecraft:flowering_azalea_leaves";
            if (h < 0.35) leaf = "minecraft:azalea_leaves";
            else if (h < 0.48) leaf = "minecraft:oak_leaves[persistent=true]";
            setVoxel(x, y, z, leaf);
            break;
          }
        }
      }
    }
  }

  // 7. Spore Blossoms & Hanging Foliage under leaves
  for (let x = 0; x < W; x++) {
    for (let y = 1; y < H; y++) {
      for (let z = 0; z < D; z++) {
        const v = getVoxel(x, y, z);
        if (v && v.includes("leaves")) {
          if (getVoxel(x, y - 1, z) === null) {
            const h = hash(x, y - 1, z, 444);
            if (h < 0.08) {
              setVoxel(x, y - 1, z, "minecraft:spore_blossom");
            } else if (h < 0.20) {
              setVoxel(x, y - 1, z, "minecraft:hanging_roots");
            }
          }
        }
      }
    }
  }

  // 8. Belfry Beams & The Hanging Bronze Bell
  // Belfry cross timbers at y=27
  for (let x = cx - 3; x <= cx + 3; x++) {
    if (!getVoxel(x, 27, cz)) setVoxel(x, 27, cz, log(woodLog, "x"));
  }
  for (let z = cz - 4; z <= cz + 4; z++) {
    if (!getVoxel(cx, 27, z)) setVoxel(cx, 27, z, log(woodLog, "z"));
  }

  // Suspended Bronze Bell
  setVoxel(cx, 26, cz, "minecraft:chain[axis=y]");
  setVoxel(cx, 25, cz, "minecraft:chain[axis=y]");
  setVoxel(cx, 24, cz, "minecraft:bell[attachment=ceiling,facing=north]");

  // Wooden frame supports beside the bell
  setVoxel(cx - 1, 25, cz, woodFence);
  setVoxel(cx + 1, 25, cz, woodFence);
  setVoxel(cx, 25, cz - 1, woodFence);
  setVoxel(cx, 25, cz + 1, woodFence);

  // 9. Rubble Mounds & Fallen Masonry outside breach
  for (let x = 14; x <= 24; x++) {
    for (let z = 14; z <= 24; z++) {
      const dist = Math.hypot(x - 18.5, z - 18.5);
      const moundH = Math.max(0, 3.8 - dist * 0.55 + (hash(x, 0, z, 61) - 0.5) * 1.5);
      const groundH = Math.min(0, Math.floor(api.heightAt(x, z)));

      for (let y = groundH; y <= moundH; y++) {
        if (getVoxel(x, y, z) === null) {
          const h = hash(x, y, z, 821);
          let rBlock = stonePrimary;
          if (h < 0.25) rBlock = stoneAccent;
          else if (h < 0.45) rBlock = "minecraft:cobblestone";
          else if (h < 0.65) rBlock = "minecraft:mossy_cobblestone";
          else if (h < 0.8) rBlock = "minecraft:moss_block";
          else if (y === Math.floor(moundH)) rBlock = slab(stoneSlab, "bottom");
          setVoxel(x, y, z, rBlock);
        }
      }
    }
  }

  // 10. Atmospheric Vines & Moss Overgrowth on Walls
  for (let x = 0; x < W; x++) {
    for (let y = 1; y < H; y++) {
      for (let z = 0; z < D; z++) {
        const v = getVoxel(x, y, z);
        if (v && v.includes("stone")) {
          // Vines on exposed faces
          if (getVoxel(x, y, z - 1) === null && hash(x, y, z, 101) < 0.14) {
            setVoxel(x, y, z - 1, "minecraft:vine[south=true]");
          }
          if (getVoxel(x - 1, y, z) === null && hash(x, y, z, 102) < 0.14) {
            setVoxel(x - 1, y, z, "minecraft:vine[east=true]");
          }
          if (getVoxel(x + 1, y, z) === null && hash(x, y, z, 103) < 0.14) {
            setVoxel(x + 1, y, z, "minecraft:vine[west=true]");
          }
          if (getVoxel(x, y, z + 1) === null && hash(x, y, z, 104) < 0.14) {
            setVoxel(x, y, z + 1, "minecraft:vine[north=true]");
          }

          // Moss carpets and fallen blossoms on top of ruined surfaces
          if (getVoxel(x, y + 1, z) === null) {
            const h = hash(x, y + 1, z, 202);
            if (h < 0.18) {
              setVoxel(x, y + 1, z, "minecraft:moss_carpet");
            } else if (h < 0.28) {
              setVoxel(x, y + 1, z, "minecraft:pink_petals[flower_amount=2,facing=north]");
            }
          }
        }
      }
    }
  }

  // 11. North Entrance Approach Path
  for (let z = 0; z <= 9; z++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      const distFromCenter = Math.abs(x - cx);
      const h = hash(x, 0, z, 999);
      if (distFromCenter <= 1 || h > 0.4) {
        let pBlock = pavement;
        if (h < 0.3) pBlock = stoneAccent;
        else if (h < 0.6) pBlock = "minecraft:mossy_cobblestone";
        else if (h < 0.75) pBlock = "minecraft:gravel";
        setVoxel(x, 0, z, pBlock);

        // Path border details
        if (distFromCenter === 2 && getVoxel(x, 1, z) === null && h > 0.65) {
          setVoxel(x, 1, z, "minecraft:moss_carpet");
        }
      }
    }
  }

  // Flush buffer to API
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        const block = getVoxel(x, y, z);
        if (block !== null) {
          api.set(x, y, z, block);
        }
      }
    }
  }

  return {
    name: "belltower_oak",
    seatY: 0,
    anchors: {
      front: [cx, 1, 0],
      door: [cx, 1, 10],
      bell: [cx, 24, cz],
    },
  };
}
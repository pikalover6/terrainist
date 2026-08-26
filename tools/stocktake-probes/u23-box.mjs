// Zoomed iso render of a world box. Usage: node box-iso.mjs <worldDir> <outPrefix>
import { writeFileSync } from "node:fs";
import { worldToGrid } from "/Users/kaihoward/Dev/terrainist/packages/render/dist/world-grid.js";
import { renderIsometric } from "/Users/kaihoward/Dev/terrainist/packages/render/dist/voxel/isometric.js";
import { encodePng } from "/Users/kaihoward/Dev/terrainist/packages/render/dist/voxel/png.js";

const [, , worldDir, outPrefix, ...b] = process.argv; const [X0, Z0, X1, Z1, Y0, Y1] = b.map(Number);
const BG = [16, 18, 22];

const grid = await worldToGrid(worldDir, { minY: Y0, maxY: Y1 });
for (const corner of ["east-south", "east-north"]) {
  const canvas = renderIsometric(grid, corner, {
    scale: 8,
    maxEdge: 20000,
    clip: (x, _y, z) => x >= X0 && x <= X1 && z >= Z0 && z <= Z1,
  });
  // Autocrop to drawn pixels.
  const { width, height, data } = canvas;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] !== BG[0] || data[i + 1] !== BG[1] || data[i + 2] !== BG[2]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 12;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    out.set(data.subarray(((y + minY) * width + minX) * 4, ((y + minY) * width + minX + cw) * 4), y * cw * 4);
  }
  const file = `${outPrefix}-${corner}.png`;
  writeFileSync(file, encodePng(cw, ch, out));
  console.log(`${file} ${cw}x${ch}`);
}

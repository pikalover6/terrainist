import fs from "node:fs";
import { worldToGrid, renderStructureViews, crop } from "/Users/kaihoward/Dev/terrainist/packages/render/dist/index.js";
const [world, out, sx, sz, ex, ez] = process.argv.slice(2);
const grid = await worldToGrid(world, {minY:50, maxY:255});
const b = {minX:+sx, maxX:+ex, minZ:+sz, maxZ:+ez, minY:52, maxY:250};
const views = renderStructureViews(grid, b, {isoScale:3, orthoScale:3, maxEdge:2000});
for (const v of views) { if(v.name==="iso-east-south"||v.name==="iso-west-north") fs.writeFileSync(out.replace(".png","-"+v.name+".png"), v.canvas.toPng()); }
console.log("ok");

// node block-at.mjs <worldDir> x y z [r=3]: non-air blocks in a box around (x,y,z)
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib"; import { createRequire } from "node:module";
const nbt = createRequire(import.meta.url)("prismarine-nbt");
const [dir, X, Y, Z, R="3"] = process.argv.slice(2); const x0=+X, y0=+Y, z0=+Z, r=+R;
const want = new Map(); // chunk key -> list of (x,y,z)
for (let x=x0-r;x<=x0+r;x++) for (let z=z0-r;z<=z0+r;z++) { const k=`${x>>4},${z>>4}`; (want.get(k)??want.set(k,[]).get(k)).push([x,z]); }
const out=[];
for (const [key, cols] of want) { const [cx,cz]=key.split(",").map(Number); const rf=path.join(dir,"region",`r.${cx>>5}.${cz>>5}.mca`); if(!fs.existsSync(rf)) continue; const buf=fs.readFileSync(rf); const i=((cx&31)+(cz&31)*32); const off=((buf[i*4]<<16)|(buf[i*4+1]<<8)|buf[i*4+2])*4096; if(!off) continue; const len=buf.readUInt32BE(off); const kind=buf[off+4]; const raw=buf.subarray(off+5,off+4+len); const data=kind===2?zlib.inflateSync(raw):zlib.gunzipSync(raw); const root=nbt.parseUncompressed(data,"big").value;
  for (const sec of root.sections.value.value) { const sy=sec.Y.value; if (sy*16+15<y0-r||sy*16>y0+r) continue; const bs=sec.block_states?.value; if(!bs) continue; const pal=bs.palette.value.value.map(e=>e.Name.value+(e.Properties?"["+Object.entries(e.Properties.value).map(([k,v])=>k+"="+v.value).join(",")+"]":"")); const longs=bs.data?.value; const bits=Math.max(4,Math.ceil(Math.log2(pal.length))); const per=Math.floor(64/bits); const mask=(1n<<BigInt(bits))-1n; const idx=(i)=>{ if(!longs) return 0; const li=Math.floor(i/per), k=i%per; const [hi,lo]=longs[li]; const v=(BigInt(hi>>>0)<<32n)|BigInt(lo>>>0); return Number((v>>BigInt(k*bits))&mask); };
    for (const [x,z] of cols) for (let y=Math.max(sy*16,y0-r); y<=Math.min(sy*16+15,y0+r); y++) { const i=(y-sy*16)*256+(z&15)*16+(x&15); const b=pal[idx(i)]; if (b!=="minecraft:air") out.push(`${x},${y},${z} ${b}`); } } }
console.log(out.sort().join("\n"));

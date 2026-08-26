const { loadPrismarine, lintWorldPhysics, EMIT_MINECRAFT_VERSION } = await import("/Users/kaihoward/Dev/terrainist/packages/compiler/dist/index.js");
const mc = await loadPrismarine(EMIT_MINECRAFT_VERSION);
const [dir] = process.argv.slice(2);
const r = await lintWorldPhysics(dir, mc, {});
for (const f of r.findings) console.log(JSON.stringify([f.rule, f.x, f.y, f.z, f.block.replace(/\[.*$/, ""), f.detail]));

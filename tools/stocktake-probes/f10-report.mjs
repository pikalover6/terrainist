import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"; import { tmpdir } from "node:os"; import path from "node:path";
import { compileTerrain } from "/Users/kaihoward/Dev/terrainist/packages/compiler/dist/terrain/compile.js";
const [file, out] = process.argv.slice(2); const doc = JSON.parse(await readFile(file, "utf8"));
const root = await mkdtemp(path.join(tmpdir(), "f10r-")); const c = await compileTerrain(doc, { outDir: path.join(root, "w") });
await writeFile(out, JSON.stringify(c.report)); await rm(root, { recursive: true, force: true }); console.log("ok", c.report.diagnostics.length);
